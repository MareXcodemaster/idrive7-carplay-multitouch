#!/usr/bin/env python3
"""Install the exact supported CarPlay patch over an existing root SSH connection."""
import argparse
import io
import ipaddress
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tarfile
import uuid

HERE = Path(__file__).resolve().parent
ASSETS = ['agent.js', 'read-voltage.js', 'patch/patcher.js', 'patch/patch.json',
          'runtime/manager.js', 'runtime/60-mgu-carplay-multitouch.conf']

def archive():
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode='w') as tar:
        for name in ASSETS:
            data = (HERE / name).read_bytes().replace(b'\r\n', b'\n')
            item = tarfile.TarInfo(name)
            item.size, item.mode = len(data), 0o600
            tar.addfile(item, io.BytesIO(data))
    return stream.getvalue()

def ssh_args(args):
    address = ipaddress.IPv4Address(args.host)
    if address.is_multicast or address.is_unspecified or not (address.is_private or address.is_link_local):
        raise ValueError('Use the local IPv4 address of your MGU.')
    ssh = shutil.which('ssh')
    if not ssh:
        raise ValueError('OpenSSH client was not found.')
    command = [ssh, '-T', '-p', '22', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8',
               '-o', 'ServerAliveInterval=10', '-o', 'ServerAliveCountMax=2',
               '-o', 'StrictHostKeyChecking=accept-new']
    if args.key:
        key = Path(args.key).expanduser().resolve()
        if not key.is_file():
            raise ValueError('SSH private key does not exist.')
        command += ['-i', str(key), '-o', 'IdentitiesOnly=yes']
    if args.known_hosts:
        known = Path(args.known_hosts).expanduser().resolve()
        # OpenSSH parses this option itself; quote spaces also on Windows.
        command += ['-o', 'UserKnownHostsFile="' + known.as_posix() + '"']
    return command + ['root@' + str(address)]

def remote(base, command, data=None, timeout=45):
    result = subprocess.run(base + [command], input=data, capture_output=True, timeout=timeout)
    if result.returncode:
        raise RuntimeError(result.stderr.decode('utf-8', errors='replace').strip() or
                           result.stdout.decode('utf-8', errors='replace').strip() or
                           'SSH command failed.')
    return result.stdout

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['check', 'install', 'status', 'uninstall'])
    parser.add_argument('--host', required=True, help='Local MGU IPv4 address')
    parser.add_argument('--key', help='Your own root SSH private key')
    parser.add_argument('--known-hosts', help='Optional SSH host-key trust file')
    parser.add_argument('--activate', action='store_true', help='Request an MGU reboot after install/removal')
    args = parser.parse_args()
    if args.activate and args.action not in ('install', 'uninstall'):
        parser.error('--activate applies only to install/uninstall')
    data, base = archive(), ssh_args(args)
    folder = '/tmp/mgu-carplay-installer-' + uuid.uuid4().hex
    remote(base, 'mkdir -m 0700 ' + shlex.quote(folder))
    remote(base, 'tar -xf - -C ' + shlex.quote(folder), data)
    command = '/usr/bin/node ' + shlex.quote(folder + '/agent.js') + ' ' + args.action
    if args.activate:
        command += ' --activate'
    result = remote(base, command, timeout=60)
    print(result.decode('utf-8', errors='replace').strip())
    if args.activate:
        print('MGU reboot requested. Reconnect and run status after startup; verify any changed SSH host key.')

if __name__ == '__main__':
    try:
        main()
    except (ValueError, RuntimeError, OSError, subprocess.SubprocessError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
