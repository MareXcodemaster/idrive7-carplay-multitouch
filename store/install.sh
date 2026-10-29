#!/bin/sh
# MGU Store runs postInstall with sh from the installed current/ directory.
set -eu
exec /usr/bin/node ./setup.js install
