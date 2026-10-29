'use strict';
/* MGU Store adapter for the stable, exact-version CarPlay Multitouch patch.
 * Node 8; no network, OEM writes, remounts, service changes or automatic reboot.
 * Store owns the drop-in and tool directory; Remove restores factory on reboot.
 */
var fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process'),zlib=require('zlib');
var patcher=require('../patch/patcher'),patch=require('../patch/patch.json');
var ID='marex-carplay-multitouch',VERSION='0.1.1';
var ROOT='/var/opt/'+ID,DROP='/etc/systemd/system/carplay.service.d/60-mgu-carplay-multitouch.conf';
var MARKER='mgu-repo/'+ID+'/USB-INSTALL.json';
var STATE_FILES=['carplay','manager.js','install.json','factory-unit.txt','backup-receipt.json','disabled.json','pending.json','health.json'];
function hash(b){return crypto.createHash('sha256').update(b).digest('hex');}
function parseMounts(text){
 function dec(s){return s.replace(/\\([0-7]{3})/g,function(_,n){return String.fromCharCode(parseInt(n,8));});}
 var points={};
 text.split('\n').forEach(function(line){var p=line.indexOf(' - ');if(p<0)return;var a=line.slice(0,p).split(' '),b=line.slice(p+3).split(' ');
  if(a.length<6||b.length<3)return;
  var m={id:Number(a[0]),device:a[2],root:dec(a[3]),point:dec(a[4]),options:a[5].split(','),type:b[0],source:dec(b[1])};
  if(!points[m.point]||points[m.point].id<m.id)points[m.point]=m;
 });return Object.keys(points).map(function(k){return points[k];});
}
function identity(m){return [m.id,m.device,m.root,m.point,m.type,m.source].join('|');}
function checkPower(data,now){
 var age=now-Date.parse(data&&data.time),v=data&&data.value;
 if(!v||v.AppErrorType!=='DF_OK'||!isFinite(age)||age< -5000||age>30000||typeof v.STAT_MILLI_VOLT_WERT!=='number'||v.STAT_MILLI_VOLT_WERT<13000||v.STAT_MILLI_VOLT_WERT>18000)throw Error('A fresh voltage reading between 13.0 and 18.0 V is required. Use a stabilised power supply.');
 return {time:data.time,millivolts:v.STAT_MILLI_VOLT_WERT};
}
function createSetup(deps){
 deps=deps||{};var f=deps.fs||fs,child=deps.cp||cp,proc=deps.process||process;
 var P=deps.paths||{root:ROOT,drop:DROP,original:'/usr/bin/carplay',unit:'/lib/systemd/system/carplay.service',
  legacy:'/var/opt/mgu-carplay-multitouch',etcUnit:'/etc/systemd/system/carplay.service',runUnit:'/run/systemd/system/carplay.service',
  etcDrop:'/etc/systemd/system/carplay.service.d',runDrop:'/run/systemd/system/carplay.service.d',mountinfo:'/proc/self/mountinfo',media:'/media'};
 var pkg=deps.packageRoot||path.dirname(__dirname),now=deps.now||function(){return Date.now();};
 var verify=deps.patcher||patcher,profile=deps.patch||patch;
 function exists(p){try{f.lstatSync(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
 function regular(p,rootOwned){var st=f.lstatSync(p);if(!st.isFile()||st.isSymbolicLink()||(rootOwned&&(st.uid!==0||(st.mode&18))))throw Error('Unsafe file: '+p);return st;}
 function directory(p,rootOwned){var st=f.lstatSync(p);if(!st.isDirectory()||st.isSymbolicLink()||(rootOwned&&(st.uid!==0||(st.mode&18))))throw Error('Unsafe directory: '+p);return st;}
 function read(p){regular(p,true);return f.readFileSync(p);}
 function syncdir(p){var fd=f.openSync(p,'r');try{f.fsyncSync(fd);}finally{f.closeSync(fd);}}
 function atomic(p,b,mode){
  var temp=p+'.new-'+crypto.randomBytes(6).toString('hex'),fd;
  try{fd=f.openSync(temp,'wx',mode||384);f.writeFileSync(fd,b);f.fsyncSync(fd);f.closeSync(fd);fd=undefined;f.renameSync(temp,p);syncdir(path.dirname(p));}
  finally{if(fd!==undefined)f.closeSync(fd);if(exists(temp))f.unlinkSync(temp);}
 }
 function power(){
  var text=child.execFileSync('/usr/bin/node',[path.join(pkg,'read-voltage.js')],{encoding:'utf8',timeout:10000,maxBuffer:131072});
  return checkPower(JSON.parse(text.trim().split('\n').pop()),now());
 }
 function preflight(){
  if(proc.platform!=='linux'||proc.arch!=='x64'||typeof proc.getuid!=='function'||proc.getuid()!==0)throw Error('Root on x86-64 Linux MGU is required.');
  directory(P.root,true);directory(path.dirname(P.root),true);
  var original=read(P.original),unit=read(P.unit);
  if(!verify.verifyOriginal(original,profile))throw Error('Unsupported factory CarPlay version. The patch will not be activated.');
  if(!/^ExecStart=\/usr\/bin\/carplay -c \/etc\/cinemo\/cinemo_options.xml$/m.test(unit.toString())||!/^OnFailure=mediaddpserver_kill.service$/m.test(unit.toString()))throw Error('Unsupported factory CarPlay service.');
  if(exists(P.legacy))throw Error('ENET/Windows installation found. Remove it with its installer and reboot before installing the Store version.');
  if(exists(P.etcUnit)||exists(P.runUnit))throw Error('A custom CarPlay service already exists.');
  [P.etcDrop,P.runDrop].forEach(function(dir){if(!exists(dir))return;directory(dir,true);f.readdirSync(dir).forEach(function(n){if(/\.conf$/.test(n)&&path.join(dir,n)!==P.drop)throw Error('Another CarPlay override exists: '+n);});});
  var template=read(path.join(pkg,'runtime/60-mgu-carplay-multitouch.conf'));
  if(!read(P.drop).equals(template))throw Error('The Store-managed CarPlay drop-in does not match this package.');
  STATE_FILES.forEach(function(n){if(exists(path.join(P.root,n)))regular(path.join(P.root,n),true);});
  return {original:original,unit:unit,drop:template,voltage:power()};
 }
 function mounts(){return parseMounts(f.readFileSync(P.mountinfo,'utf8'));}
 function isUsb(m){
  if(path.dirname(m.point)!==P.media||m.options.indexOf('rw')<0||!/^\/dev\//.test(m.source))return false;
  try{var dev=path.posix.basename(f.realpathSync(m.source));return /\/usb\d+\//.test(f.realpathSync('/sys/class/block/'+dev));}catch(e){return false;}
 }
 function cleanUsbPath(m,rel){
  var current=m.point;directory(current,false);
  if(f.realpathSync(current)!==current)throw Error('USB mount point is a link.');
  rel.split('/').forEach(function(n){if(!n||n==='.'||n==='..')throw Error('Invalid USB path.');current=path.join(current,n);var st=f.lstatSync(current);if(st.isSymbolicLink())throw Error('USB path contains a link.');});
  if(f.statSync(current).dev!==f.statSync(m.point).dev)throw Error('USB path is on another filesystem.');
  return current;
 }
 function findUsb(){
  var found=[];mounts().filter(isUsb).forEach(function(m){
   if(!exists(path.join(m.point,MARKER)))return;
   var p=cleanUsbPath(m,MARKER);regular(p,false);var marker=JSON.parse(f.readFileSync(p,'utf8'));
   if(marker.format!=='marex-carplay-usb'||marker.id!==ID||marker.version!==VERSION)throw Error('Unexpected USB package marker.');
   found.push(m);
  });
  if(found.length!==1)throw Error('Keep exactly one writable USB stick with the extracted mgu-repo folder inserted.');
  return found[0];
 }
 function recheckUsb(m,rel){
  var current=mounts().filter(function(x){return x.point===m.point;})[0];
  if(!current||identity(current)!==identity(m)||!isUsb(current))throw Error('USB stick removed or remounted. Activation cancelled.');
  if(rel)cleanUsbPath(m,rel);return current;
 }
 function capture(files,key,p){
  if(!exists(p))return;var st=regular(p,true),data=f.readFileSync(p);
  if(data.length>12*1024*1024)throw Error('Unexpectedly large backup file: '+key);
  files[key]={size:data.length,sha256:hash(data),mode:st.mode&4095,uid:st.uid,gid:st.gid,data:data.toString('base64')};
 }
 function backup(check,m){
  recheckUsb(m,MARKER);
  var df=child.execFileSync('df',['-Pk',m.point],{encoding:'utf8',timeout:10000});
  var rows=df.trim().split('\n'),free=null;
  rows.forEach(function(line){var x=/\s(\d+)\s+(\d+)\s+(\d+)\s+\d+%\s/.exec(line);if(x)free=Number(x[3])*1024;});
  if(free===null||free<64*1024*1024)throw Error('At least 64 MB free on the USB stick is required for the backup.');
  var files={};capture(files,'usr/bin/carplay',P.original);capture(files,'lib/systemd/system/carplay.service',P.unit);capture(files,DROP.slice(1),P.drop);
  STATE_FILES.forEach(function(n){capture(files,'var/opt/'+ID+'/'+n,path.join(P.root,n));});
  var obj={format:'marex-carplay-usb-backup',version:1,createdAt:new Date(now()).toISOString(),package:ID,
   scope:'Factory CarPlay executable, service and this patch configuration. Not a full MGU image.',
   storeDropinAlreadyInstalled:true,restore:'Remove this tool in MGU Store and fully restart the head unit. The Store snapshot covers its pre-install drop-in state.',
   originalSha256:profile.original.sha256,voltage:check.voltage,files:files};
  validateBackup(obj,profile.original.sha256);
  var bytes=zlib.gzipSync(Buffer.from(JSON.stringify(obj))),base='CarPlay-Multitouch-Backups',dir=path.join(m.point,base);
  if(!exists(dir))f.mkdirSync(dir,448);cleanUsbPath(m,base);directory(dir,false);
  var name=new Date(now()).toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomBytes(6).toString('hex')+'.mgubak.gz';
  var dest=path.join(dir,name),fd=f.openSync(dest,'wx',384);
  try{f.writeFileSync(fd,bytes);f.fsyncSync(fd);}finally{f.closeSync(fd);}
  child.execFileSync('sync',[],{timeout:10000});
  recheckUsb(m,base+'/'+name);var reread=f.readFileSync(dest);
  if(hash(reread)!==hash(bytes))throw Error('USB backup read-back checksum failed.');
  validateBackup(JSON.parse(zlib.gunzipSync(reread).toString('utf8')),profile.original.sha256);
  recheckUsb(m,base+'/'+name);
  return {format:'marex-carplay-backup-receipt',version:1,path:dest,sha256:hash(bytes),bytes:bytes.length,createdAt:obj.createdAt,originalSha256:obj.originalSha256};
 }
 function install(){
  var check=preflight(),usb=findUsb(),receipt=backup(check,usb);
  var candidate=verify.apply(check.original,profile),manager=read(path.join(pkg,'runtime/manager.js'));
  // All refusal checks and the verified USB backup precede any activation file.
  // Never call prepare here: only the next full boot may create pending state.
  power();recheckUsb(usb,MARKER);
  if(!read(P.original).equals(check.original)||!read(P.drop).equals(check.drop))throw Error('CarPlay files changed during setup.');
  atomic(path.join(P.root,'backup-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  atomic(path.join(P.root,'factory-unit.txt'),check.unit);
  atomic(path.join(P.root,'manager.js'),manager,420);
  atomic(path.join(P.root,'carplay'),candidate,493);
  var meta={package:ID,version:VERSION,installedAt:new Date(now()).toISOString(),originalSha256:profile.original.sha256,candidateSha256:profile.candidate.sha256,
   metricsAddress:profile.metricsAddress,reportBytes:12,descriptorBytes:133,dropinSha256:hash(check.drop),managerSha256:hash(manager),backup:receipt};
  atomic(path.join(P.root,'install.json'),JSON.stringify(meta,null,2)+'\n');
  // Explicit reinstallation can re-arm a disabled patch; its previous markers
  // were preserved in the verified USB backup. Nothing touches the running PID.
  ['pending.json','disabled.json'].forEach(function(n){var p=path.join(P.root,n);if(exists(p)){regular(p,true);f.unlinkSync(p);}});syncdir(P.root);
  return {state:'prepared-for-next-full-boot',backup:receipt.path,backupSha256:receipt.sha256,
   message:'Backup verified on USB. Use MGU Store Settings > Restart head unit. If using an Android box, reboot the box after the MGU is back.'};
 }
 return {install:install,preflight:preflight,findUsb:findUsb,backup:backup,recheckUsb:recheckUsb};
}
function validateBackup(b,expected){
 if(!b||b.format!=='marex-carplay-usb-backup'||b.version!==1||b.package!==ID||b.originalSha256!==expected||!b.files||Array.isArray(b.files))throw Error('Invalid USB backup.');
 var allowed=['usr/bin/carplay','lib/systemd/system/carplay.service',DROP.slice(1)].concat(STATE_FILES.map(function(n){return 'var/opt/'+ID+'/'+n;})),total=0;
 Object.keys(b.files).forEach(function(n){
  if(allowed.indexOf(n)<0)throw Error('Unexpected backup path.');var item=b.files[n];
  if(!item||typeof item.data!=='string'||item.data.length>16*1024*1024)throw Error('Invalid backup data.');
  var data=Buffer.from(item.data,'base64');total+=data.length;
  if(data.toString('base64')!==item.data||data.length!==item.size||hash(data)!==item.sha256||total>32*1024*1024)throw Error('Backup checksum/size mismatch.');
 });
 var original=b.files['usr/bin/carplay'];
 if(!original||original.sha256!==expected||!b.files['lib/systemd/system/carplay.service']||!b.files[DROP.slice(1)])throw Error('Missing factory/CarPlay configuration backup.');
 return true;
}
module.exports={createSetup:createSetup,parseMounts:parseMounts,checkPower:checkPower,validateBackup:validateBackup,id:ID,version:VERSION,marker:MARKER};
if(require.main===module){try{if(process.argv[2]!=='install')throw Error('Usage: node store/setup.js install');console.log(JSON.stringify(createSetup().install(),null,2));}
 catch(e){console.error('CARPLAY MULTITOUCH SETUP FAILED: '+String(e.message||e)+'\nDo not restart to activate. Fix the issue and reinstall, or Remove this tool in MGU Store.');process.exitCode=1;}}
