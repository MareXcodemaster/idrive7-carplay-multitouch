'use strict';
/* Offline state/refusal fixtures only. No vehicle or external commands. */
var assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto'),zlib=require('zlib');
var mod=require('./setup'),base=fs.mkdtempSync(path.join(os.tmpdir(),'marex-usb-')),checks=[],seq=0;
function sha(b){return crypto.createHash('sha256').update(b).digest('hex');}
function mkdir(p){if(fs.existsSync(p))return;mkdir(path.dirname(p));fs.mkdirSync(p);}
function put(p,data){mkdir(path.dirname(p));fs.writeFileSync(p,data);}
function fixture(){
 var home=path.join(base,'case-'+(++seq)),pkg=path.join(home,'package'),root=path.join(home,'varopt',mod.id),media=path.join(home,'media'),usb=path.join(media,'test stick');mkdir(root);mkdir(usb);
 var P={root:root,drop:path.join(home,'etcDrop','60-mgu-carplay-multitouch.conf'),original:path.join(home,'factory'),unit:path.join(home,'factory-unit'),
  legacy:path.join(home,'legacy'),etcUnit:path.join(home,'etcUnit'),runUnit:path.join(home,'runUnit'),etcDrop:path.join(home,'etcDrop'),runDrop:path.join(home,'runDrop'),mountinfo:path.join(home,'mountinfo'),media:media};
 var original=Buffer.from('own factory test fixture'),candidate=Buffer.from('own patched test fixture'),profile={original:{sha256:sha(original)},candidate:{sha256:sha(candidate)},metricsAddress:5637648};
 put(P.original,original);put(P.unit,'[Unit]\nOnFailure=mediaddpserver_kill.service\n[Service]\nExecStart=/usr/bin/carplay -c /etc/cinemo/cinemo_options.xml\n');
 put(P.drop,'own Store drop-in fixture');put(path.join(pkg,'runtime','60-mgu-carplay-multitouch.conf'),'own Store drop-in fixture');put(path.join(pkg,'runtime','manager.js'),'own manager fixture');
 put(path.join(usb,mod.marker),JSON.stringify({format:'marex-carplay-usb',id:mod.id,version:mod.version}));
 var data={v:14500,age:0,uid:0,arch:'x64',platform:'linux',free:1000000,options:'rw',physical:true,identity:'8:17',mountReads:0,removeOnRead:0,unsafe:null,symlink:null,corruptBackup:false,calls:[],written:[],voltageCalls:0,secondVoltage:null,extraUsb:null,failBackupWrite:false};
 var f=Object.create(fs);
 f.lstatSync=function(p){var s=fs.lstatSync(p);return {uid:0,gid:0,mode:p===data.unsafe?511:(s.isDirectory()?493:420),size:s.size,
  isFile:function(){return s.isFile();},isDirectory:function(){return s.isDirectory();},isSymbolicLink:function(){return p===data.symlink||s.isSymbolicLink();}};};
 f.realpathSync=function(p){if(p==='/dev/sda1')return p;if(p==='/sys/class/block/sda1')return data.physical?'/sys/devices/pci/usb1/1-2/block/sda/sda1':'/sys/devices/pci/mmcblk0';return fs.realpathSync(p);};
 f.openSync=function(p,flags,mode){if(data.failBackupWrite&&/\.mgubak\.gz$/.test(p))throw Error('ENOSPC backup fixture');if(flags==='r'&&fs.existsSync(p)&&fs.lstatSync(p).isDirectory())return 987654;return fs.openSync(p,flags,mode);};
 f.closeSync=function(fd){if(fd!==987654)fs.closeSync(fd);};f.fsyncSync=function(){};
 f.renameSync=function(a,b){data.written.push(b);fs.renameSync(a,b);};
 f.readFileSync=function(p,encoding){
  if(p===P.mountinfo){data.mountReads++;if(data.removeOnRead&&data.mountReads>=data.removeOnRead)return '';
   var escaped=usb.replace(/ /g,'\\040');return '22 1 '+data.identity+' / '+escaped+' '+data.options+' - vfat /dev/sda1 rw\n'+(data.extraUsb?'23 1 8:17 / '+data.extraUsb.replace(/ /g,'\\040')+' rw - vfat /dev/sda1 rw\n':'');}
  if(data.corruptBackup&&/\.mgubak\.gz$/.test(p))return Buffer.from('corrupted fixture');
  return fs.readFileSync(p,encoding);
 };
 var child={execFileSync:function(file,args){data.calls.push([file,args]);
  if(file==='/usr/bin/node'){data.voltageCalls++;return JSON.stringify({time:new Date(Date.now()-data.age).toISOString(),value:{AppErrorType:'DF_OK',STAT_MILLI_VOLT_WERT:data.voltageCalls>1&&data.secondVoltage!==null?data.secondVoltage:data.v}});}
  if(file==='df')return 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/sda1 2000000 100 '+data.free+' 1% '+usb+'\n';
  if(file==='sync')return '';throw Error('Unexpected command '+file);
 }};
 var proc={getuid:function(){return data.uid;}};Object.defineProperty(proc,'arch',{get:function(){return data.arch;}});Object.defineProperty(proc,'platform',{get:function(){return data.platform;}});
 var verify={verifyOriginal:function(b){return b.equals(original);},apply:function(b){assert(b.equals(original));return candidate;}};
 var app=mod.createSetup({fs:f,cp:child,process:proc,paths:P,packageRoot:pkg,patcher:verify,patch:profile});
 return {home:home,pkg:pkg,P:P,usb:usb,data:data,original:original,candidate:candidate,profile:profile,app:app};
}
function test(name,fn){fn();checks.push(name);}
function refused(x,rx){assert.throws(function(){x.app.install();},rx);assert(!fs.existsSync(path.join(x.P.root,'install.json')));assert(!fs.existsSync(path.join(x.P.root,'carplay')));assert(fs.readFileSync(x.P.original).equals(x.original));}
test('successful setup preserves factory, verifies USB backup and never restarts services',function(){
 var x=fixture(),r=x.app.install();assert.strictEqual(r.state,'prepared-for-next-full-boot');assert(fs.readFileSync(x.P.original).equals(x.original));
 assert(fs.readFileSync(path.join(x.P.root,'carplay')).equals(x.candidate));assert(fs.existsSync(r.backup));
 var backup=JSON.parse(zlib.gunzipSync(fs.readFileSync(r.backup)).toString());assert(mod.validateBackup(backup,x.profile.original.sha256));
 assert.strictEqual(backup.storeDropinAlreadyInstalled,true);assert(!fs.existsSync(path.join(x.P.root,'pending.json')));
 assert(x.data.calls.every(function(c){return ['/usr/bin/node','df','sync'].indexOf(c[0])>=0;}));
 var meta=JSON.parse(fs.readFileSync(path.join(x.P.root,'install.json'),'utf8'));assert.strictEqual(meta.backup.sha256,sha(fs.readFileSync(r.backup)));
});
test('unknown factory is refused before activation',function(){var x=fixture();put(x.P.original,'unknown');assert.throws(function(){x.app.install();},/Unsupported factory/);assert.strictEqual(x.data.written.length,0);});
test('root and architecture gate',function(){['uid','arch','platform'].forEach(function(k){var x=fixture();x.data[k]=k==='uid'?1000:k==='arch'?'arm64':'win32';refused(x,/Root/);});});
test('ENET installation is refused',function(){var x=fixture();mkdir(x.P.legacy);refused(x,/ENET\/Windows/);});
test('other service and drop-in overrides are refused',function(){['etcUnit','runUnit'].forEach(function(k){var x=fixture();put(x.P[k],'foreign');refused(x,/custom/);});var y=fixture();put(path.join(y.P.etcDrop,'foreign.conf'),'foreign');refused(y,/Another CarPlay/);});
test('changed Store drop-in is refused',function(){var x=fixture();put(x.P.drop,'changed');refused(x,/does not match/);});
test('world writable activation file is refused',function(){var x=fixture();x.data.unsafe=x.P.drop;refused(x,/Unsafe file/);});
test('unsafe existing patch file is refused',function(){var x=fixture();var p=path.join(x.P.root,'manager.js');put(p,'old');x.data.symlink=p;refused(x,/Unsafe file/);});
test('low, high and stale voltage are refused',function(){[12000,18100].forEach(function(v){var x=fixture();x.data.v=v;refused(x,/fresh voltage/);});var y=fixture();y.data.age=60000;refused(y,/fresh voltage/);});
test('missing package marker refuses activation',function(){var x=fixture();fs.unlinkSync(path.join(x.usb,mod.marker));refused(x,/exactly one/);});
test('two matching USB sources refuse activation',function(){var x=fixture();x.data.extraUsb=path.join(path.dirname(x.usb),'another-stick');put(path.join(x.data.extraUsb,mod.marker),JSON.stringify({format:'marex-carplay-usb',id:mod.id,version:mod.version}));refused(x,/exactly one/);});
test('read-only and non-USB media refuse activation',function(){var x=fixture();x.data.options='ro';refused(x,/exactly one/);var y=fixture();y.data.physical=false;refused(y,/exactly one/);});
test('marker version mismatch refuses activation',function(){var x=fixture();put(path.join(x.usb,mod.marker),JSON.stringify({format:'marex-carplay-usb',id:mod.id,version:'99.0.0'}));refused(x,/marker/);});
test('USB path symlink refuses activation',function(){var x=fixture();x.data.symlink=path.join(x.usb,'mgu-repo');refused(x,/contains a link/);});
test('insufficient free space refuses activation',function(){var x=fixture();x.data.free=100;refused(x,/64 MB/);});
test('USB removal during backup refuses activation',function(){var x=fixture();x.data.removeOnRead=3;refused(x,/removed or remounted/);});
test('USB read-back corruption refuses activation',function(){var x=fixture();x.data.corruptBackup=true;refused(x,/checksum/);});
test('USB backup write failure refuses activation',function(){var x=fixture();x.data.failBackupWrite=true;refused(x,/ENOSPC/);});
test('voltage is checked again after backup and before activation',function(){var x=fixture();x.data.secondVoltage=12000;refused(x,/fresh voltage/);assert.strictEqual(x.data.voltageCalls,2);assert.strictEqual(fs.readdirSync(path.join(x.usb,'CarPlay-Multitouch-Backups')).length,1);});
test('reinstall backs up old state before clearing disabled and pending flags',function(){var x=fixture();put(path.join(x.P.root,'disabled.json'),'{}');put(path.join(x.P.root,'pending.json'),'{}');var r=x.app.install();
 var b=JSON.parse(zlib.gunzipSync(fs.readFileSync(r.backup)).toString());assert(b.files['var/opt/'+mod.id+'/pending.json']);assert(b.files['var/opt/'+mod.id+'/disabled.json']);
 assert(!fs.existsSync(path.join(x.P.root,'pending.json')));assert(!fs.existsSync(path.join(x.P.root,'disabled.json')));
 var r2=x.app.install();assert(r.backup!==r2.backup);assert(fs.existsSync(r.backup));
});
test('backup validator rejects corruption and foreign paths',function(){var x=fixture(),r=x.app.install(),b=JSON.parse(zlib.gunzipSync(fs.readFileSync(r.backup)).toString());
 b.files['usr/bin/carplay'].sha256='0'.repeat(64);assert.throws(function(){mod.validateBackup(b,x.profile.original.sha256);},/checksum/);
 b.files['usr/bin/carplay'].sha256=sha(x.original);b.files['foreign']={};assert.throws(function(){mod.validateBackup(b,x.profile.original.sha256);},/Unexpected backup path/);
});
test('mount parser decodes spaces and keeps newest mount at a point',function(){var m=mod.parseMounts('1 0 8:1 / /media/a\\040b rw - vfat /dev/sda1 rw\n2 0 8:2 / /media/a\\040b ro - vfat /dev/sda2 ro\n');assert.strictEqual(m.length,1);assert.strictEqual(m[0].point,'/media/a b');assert.strictEqual(m[0].device,'8:2');});
console.log(JSON.stringify({passed:checks.length,checks:checks,fixtures:base},null,2));
