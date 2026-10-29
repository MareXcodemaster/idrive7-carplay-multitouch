'use strict';
// Node 8 remote endpoint for the CarPlay Multitouch GUI. No Android box operations.
var fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
var agent=require('../agent'),patch=require('../patch/patch.json');
var ROOT='/var/opt/mgu-carplay-multitouch',DROP='/etc/systemd/system/carplay.service.d/60-mgu-carplay-multitouch.conf';
var FILES=['usr/bin/carplay','lib/systemd/system/carplay.service','etc/systemd/system/carplay.service.d/60-mgu-carplay-multitouch.conf'];
['carplay','manager.js','install.json','factory-unit.txt','disabled.json','pending.json','health.json'].forEach(function(n){FILES.push('var/opt/mgu-carplay-multitouch/'+n);});
function sha(b){return crypto.createHash('sha256').update(b).digest('hex');}
function exists(p){try{fs.lstatSync(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
function safe(p){var s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.uid!==0||(s.mode&18))throw Error('Unsafe installation file: '+p);return s;}
function power(){
 var out=cp.execFileSync('/usr/bin/node',[path.join(__dirname,'../read-voltage.js')],{encoding:'utf8',timeout:10000});
 return JSON.parse(out.trim().split('\n').pop());
}
function validateBackup(b,expected){
 expected=expected||patch.original.sha256;
 if(!b||b.format!=='mgu-carplay-backup'||b.version!==1||!b.files||Array.isArray(b.files)||!b.state||typeof b.state.wasInstalled!=='boolean')throw Error('Invalid backup format');
 if(b.originalSha256!==expected)throw Error('Backup firmware is not supported');
 var total=0,decoded={};
 Object.keys(b.files).forEach(function(n){
  if(FILES.indexOf(n)<0)throw Error('Unexpected backup path: '+n);
  var f=b.files[n];if(!f||typeof f.data!=='string'||f.data.length>16*1024*1024||!Number.isSafeInteger(f.size)||f.size<0||f.size>10*1024*1024)throw Error('Invalid backup file size');
  var data=Buffer.from(f.data,'base64');total+=data.length;
  if(data.length!==f.size||data.toString('base64')!==f.data||sha(data)!==f.sha256||total>32*1024*1024)throw Error('Backup checksum/size mismatch: '+n);
  decoded[n]=data;
 });
 if(!decoded['usr/bin/carplay']||sha(decoded['usr/bin/carplay'])!==expected||!decoded['lib/systemd/system/carplay.service'])throw Error('Backup lacks verified factory files');
 var own='var/opt/mgu-carplay-multitouch/',hasDrop=!!decoded[DROP.slice(1)];
 if(hasDrop!==b.state.wasInstalled||!!decoded[own+'install.json']!==b.state.wasInstalled)throw Error('Backup installation state is inconsistent');
 if(b.state.wasInstalled){
  var meta=JSON.parse(decoded[own+'install.json'].toString());
  if(meta.package!=='idrive7-carplay-multitouch'||meta.originalSha256!==expected||meta.candidateSha256!==patch.candidate.sha256)throw Error('Unknown backup installation');
  if(!decoded[own+'carplay']||!decoded[own+'manager.js'])throw Error('Backup patch files are missing');
  // Preserve damaged owned files for diagnostics too. Restore never executes or
  // writes these archived binaries: it rebuilds the verified multitouch copy.
 }else if(Object.keys(decoded).some(function(n){return n.indexOf(own)===0;}))throw Error('Unowned installation files in backup');
 return {wasInstalled:b.state.wasInstalled,files:Object.keys(decoded).length,bytes:total};
}
function backup(){
 var check=agent.preflight(),s=agent.status(),b={format:'mgu-carplay-backup',version:1,createdAt:new Date().toISOString(),scope:'CarPlay executable and patch configuration; not a full MGU image',originalSha256:check.originalSha256,state:{wasInstalled:s.installed},files:{}};
 FILES.forEach(function(n){var p='/'+n;if(!exists(p))return;var st=safe(p),data=fs.readFileSync(p);b.files[n]={mode:st.mode&4095,uid:st.uid,gid:st.gid,size:data.length,sha256:sha(data),data:data.toString('base64')};});
 validateBackup(b);return b;
}
function rearm(){
 // Explicit GUI reinstall/restore only, after a verified PC backup. No prepare
 // here: prepare before a full reboot would create an interrupted-boot marker.
 var info=agent.status();
 if(!info.installed)return;
 var m=info.metadata;
 if(!m||m.package!=='idrive7-carplay-multitouch'||m.originalSha256!==patch.original.sha256||m.candidateSha256!==patch.candidate.sha256)throw Error('Unknown installation');
 [ROOT+'/carplay',ROOT+'/manager.js',ROOT+'/install.json',DROP].forEach(safe);
 if(sha(fs.readFileSync(ROOT+'/carplay'))!==m.candidateSha256||sha(fs.readFileSync(ROOT+'/manager.js'))!==m.managerSha256||sha(fs.readFileSync(DROP))!==m.dropinSha256)throw Error('Installation files changed');
 ['pending.json','disabled.json'].forEach(function(n){var source=ROOT+'/'+n;if(exists(source)){safe(source);fs.renameSync(source,path.join(__dirname,'rearmed-'+Date.now()+'-'+n));}});
 cp.execFileSync('sync',[],{timeout:10000});
}
function reboot(){
 var v=power();if(!v.value||v.value.AppErrorType!=='DF_OK'||v.value.STAT_MILLI_VOLT_WERT<13000||v.value.STAT_MILLI_VOLT_WERT>18000)throw Error('Stable supply of at least 13.0 V is required');
 var code="setTimeout(function(){require('child_process').spawn('systemctl',['reboot'],{detached:true,stdio:'ignore'}).unref();},1500);";
 cp.spawn('/usr/bin/node',['-e',code],{detached:true,stdio:'ignore'}).unref();return {rebootRequested:true};
}
function run(action){
 if(process.getuid()!==0)throw Error('ROOT_REQUIRED');
 if(action==='probe'){
  var result={root:true,arch:process.arch,osRelease:fs.readFileSync('/etc/os-release','utf8'),supported:false};
  try{var p=agent.preflight();result.supported=true;result.originalSha256=p.originalSha256;}catch(e){result.compatibilityError=String(e);}
  result.status=agent.status();try{result.voltage=power();}catch(e){result.voltageError=String(e);}return result;
 }
 if(action==='backup')return backup();
 if(action==='install'){var installed=agent.install();rearm();return installed;}
 if(action==='uninstall')return agent.uninstall();
 if(action==='status')return agent.status();
 if(action==='reboot')return reboot();
 if(action==='restore'){
  var b=JSON.parse(fs.readFileSync(path.join(__dirname,'restore.json'),'utf8')),valid=validateBackup(b),check=agent.preflight();
  if(check.originalSha256!==b.originalSha256)throw Error('Vehicle firmware and backup differ');
  if(valid.wasInstalled){if(exists(ROOT))agent.uninstall();var r=agent.install();return {restored:'patched',result:r};}
  return {restored:'factory',result:agent.status().installed?agent.uninstall():{state:'already-factory'}};
 }
 throw Error('Unknown GUI action');
}
module.exports={validateBackup:validateBackup,files:FILES,run:run};
if(require.main===module){try{console.log(JSON.stringify(run(process.argv[2])));}catch(e){console.error(String(e));process.exitCode=1;}}
