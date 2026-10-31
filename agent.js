'use strict';
// Runs on the MGU as root. Keeps the factory executable intact.
var fs=require('fs'),path=require('path'),cp=require('child_process'),crypto=require('crypto');
var patcher=require('./patch/patcher'),patch=require('./patch/patch.json'),composable=require('./patch/composable');
var ROOT='/var/opt/mgu-carplay-multitouch';
var DROP='/etc/systemd/system/carplay.service.d/60-mgu-carplay-multitouch.conf';
var ID='idrive7-carplay-multitouch',VERSION='0.3.0';
// A CarPlay patch composer's files (mgu-deploy carplay-patch). Read, never written,
// except this patch's own registration when no composer is installed.
var COMPOSER='/var/opt/mgu-carplay-patch',REGISTERED=COMPOSER+'/patches/'+ID+'.json';
var COMPOSER_DROP='/etc/systemd/system/carplay.service.d/50-mgu-carplay-patch.conf',COMPOSER_MARK='# mgu-carplay-patch launcher';
var DEPLOY='/var/opt/mgu-deploy/mgu-deploy.sh';
function sha(data){return crypto.createHash('sha256').update(data).digest('hex');}
function exists(p){try{fs.lstatSync(p);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
function readJson(p){return exists(p)?JSON.parse(fs.readFileSync(p,'utf8')):null;}
function exec(file,args,timeout){return cp.execFileSync(file,args,{encoding:'utf8',timeout:timeout||12000,maxBuffer:512*1024});}
function write(p,data,mode){fs.writeFileSync(p,data,{mode:mode||384,flag:'wx'});var fd=fs.openSync(p,'r');try{fs.fsyncSync(fd);}finally{fs.closeSync(fd);}}
function safeDir(p){var s=fs.lstatSync(p);if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||(s.mode&18))throw Error('Unsafe directory: '+p);}
function rootReadOnly(){var row=fs.readFileSync('/proc/mounts','utf8').split('\n').filter(function(x){return x.split(' ')[1]==='/';})[0];if(!row)throw Error('Root mount not found');return row.split(' ')[3].split(',').indexOf('ro')>=0;}
function rootWrite(action){
 var ro=rootReadOnly();if(ro)exec('mount',['-o','remount,rw','/']);
 try{return action();}finally{try{exec('sync',[]);}finally{if(ro){exec('mount',['-o','remount,ro','/']);if(!rootReadOnly())throw Error('Root filesystem did not return read-only');}}}
}
// The composer's own launcher: that exact name, a regular root-owned file, its marker first.
function composerDropin(p){
 if(p!==COMPOSER_DROP)return false;
 var s=fs.lstatSync(p);if(!s.isFile()||s.isSymbolicLink()||s.uid!==0||(s.mode&18))return false;
 return fs.readFileSync(p,'utf8').split('\n')[0].indexOf(COMPOSER_MARK)===0;
}
function preflight(){
 if(process.getuid()!==0)throw Error('Root SSH is required');
 if(process.arch!=='x64'||process.platform!=='linux')throw Error('Only Linux x86-64 MGU is supported');
 var original=fs.readFileSync('/usr/bin/carplay');
 if(!patcher.verifyOriginal(original,patch))throw Error('Unsupported factory CarPlay executable. Nothing installed.');
 var unit=fs.readFileSync('/lib/systemd/system/carplay.service','utf8');
 if(!/^ExecStart=\/usr\/bin\/carplay -c \/etc\/cinemo\/cinemo_options.xml$/m.test(unit)||!/^OnFailure=mediaddpserver_kill.service$/m.test(unit))throw Error('Unsupported factory unit');
 if(exists('/etc/systemd/system/carplay.service')||exists('/run/systemd/system/carplay.service'))throw Error('A full custom CarPlay unit is already installed');
 ['/etc/systemd/system/carplay.service.d','/run/systemd/system/carplay.service.d'].forEach(function(dir){
  if(exists(dir)){safeDir(dir);fs.readdirSync(dir).filter(function(n){var p=path.join(dir,n);return /\.conf$/.test(n)&&p!==DROP&&!composerDropin(p);}).forEach(function(n){throw Error('Other CarPlay override present: '+path.join(dir,n));});}
 });
 return {original:original,unit:unit,originalSha256:sha(original),rootReadOnly:rootReadOnly()};
}
function voltage(){
 var text=exec('/usr/bin/node',[path.join(__dirname,'read-voltage.js')],10000).trim();
 var data=JSON.parse(text.split('\n').pop());
 if(!data.value||data.value.AppErrorType!=='DF_OK'||data.value.STAT_MILLI_VOLT_WERT<13000||data.value.STAT_MILLI_VOLT_WERT>18000)throw Error('Stable supply of at least 13.0 V is required for installation/activation');
 return {time:data.time,millivolts:data.value.STAT_MILLI_VOLT_WERT};
}
function lastLines(text){return String(text||'').trim().split('\n').slice(-6).join('\n');}
function cliOutput(e){return lastLines(String(e.stdout||'')+String(e.stderr||'')||String(e));}
// An mgu-deploy without carplay-patch: its composer is installed later and reads the file.
function cliLacksComposer(e){return e.status===2&&/unknown command carplay-patch/.test(String(e.stdout||'')+String(e.stderr||''));}
/* Registers this patch with a CarPlay patch composer, after its drop-in is in place:
 * through mgu-deploy when it composes, else as a file a composer installed later
 * reads. A refusal or failure leaves the multitouch-only installation working. */
function register(file){
 if(exists(DEPLOY)){
  try{return {state:'registered',via:'mgu-deploy',output:lastLines(exec('/bin/sh',[DEPLOY,'carplay-patch','add',file],120000))};}
  catch(e){if(!cliLacksComposer(e))return {state:e.status===2?'refused':'failed',via:'mgu-deploy',output:cliOutput(e)};}
 }
 try{
  var data=fs.readFileSync(file);
  [COMPOSER,COMPOSER+'/patches'].forEach(function(d){if(!exists(d))fs.mkdirSync(d,493);safeDir(d);});
  if(exists(REGISTERED)&&sha(fs.readFileSync(REGISTERED))===sha(data))return {state:'registered',via:'file'};
  if(exists(REGISTERED+'.new'))fs.unlinkSync(REGISTERED+'.new');
  write(REGISTERED+'.new',data,420);fs.renameSync(REGISTERED+'.new',REGISTERED);
  return {state:'registered',via:'file'};
 }catch(e){return {state:'failed',via:'file',error:String(e)};}
}
/* Removes this patch's registration, once its drop-in is gone. An installation that
 * never registered (0.1.0 to 0.2.2) leaves the composer alone. */
function unregister(info){
 if(!info.composableManifestSha256)return {state:'never-registered'};
 if(exists(DEPLOY)){
  try{return {state:'unregistered',via:'mgu-deploy',output:lastLines(exec('/bin/sh',[DEPLOY,'carplay-patch','remove',ID],120000))};}
  catch(e){if(!cliLacksComposer(e))return {state:'failed',via:'mgu-deploy',output:cliOutput(e)};}
 }
 if(!exists(REGISTERED))return {state:'not-registered'};
 if(sha(fs.readFileSync(REGISTERED))!==info.composableManifestSha256)return {state:'kept',reason:'The registered manifest is not the one this installation wrote'};
 fs.unlinkSync(REGISTERED);return {state:'unregistered',via:'file'};
}
function composerStatus(){
 var record=null;try{record=readJson(COMPOSER+'/composed.json');}catch(e){record={unreadable:String(e)};}
 return {cli:exists(DEPLOY),registered:exists(REGISTERED),dropin:exists(COMPOSER_DROP),
  composed:record&&Array.isArray(record.patches)?record.patches.map(function(p){return p.id+' '+p.version;}):record};
}
function status(){
 var text=exec('systemctl',['show','carplay.service','-p','MainPID','-p','ActiveState','-p','SubState','-p','FragmentPath','-p','DropInPaths']);
 var match=/^MainPID=(\d+)$/m.exec(text),pid=match?Number(match[1]):0,exe=pid?fs.readlinkSync('/proc/'+pid+'/exe'):null;
 var running=exe===ROOT+'/carplay'?'own':exe===COMPOSER+'/carplay'||exe===COMPOSER+'/carplay (deleted)'?'composed':exe?'factory':null;
 return {package:ID,installed:exists(DROP),metadata:readJson(ROOT+'/install.json'),service:text,exe:exe,
  activePatched:running==='own'||running==='composed',activeBinary:running,processSha256:pid?sha(fs.readFileSync('/proc/'+pid+'/exe')):null,
  disabled:readJson(ROOT+'/disabled.json'),pending:readJson(ROOT+'/pending.json'),health:readJson(ROOT+'/health.json'),composer:composerStatus(),rootReadOnly:rootReadOnly()};
}
function install(){
 var check=preflight(),power=voltage(),drop=fs.readFileSync(path.join(__dirname,'runtime/60-mgu-carplay-multitouch.conf'));
 var manifest=composable.toManifest(patch);
 if(exists(ROOT)){
  safeDir(ROOT);var prior=readJson(ROOT+'/install.json');
  if(prior&&prior.package===ID&&prior.version===VERSION&&exists(DROP)&&sha(fs.readFileSync(DROP))===sha(drop)&&sha(fs.readFileSync(ROOT+'/manager.js'))===sha(fs.readFileSync(path.join(__dirname,'runtime/manager.js')))&&patcher.verifyPatched(fs.readFileSync(ROOT+'/carplay'),patch)&&
   prior.composableManifestSha256===sha(manifest)&&exists(ROOT+'/carplay-patch.json')&&sha(fs.readFileSync(ROOT+'/carplay-patch.json'))===sha(manifest))
   return {state:'already-installed',voltage:power,registration:register(ROOT+'/carplay-patch.json'),status:status()};
  throw Error('Installation directory already exists. Inspect/remove the existing installation first.');
 }
 if(exists(DROP))throw Error('Drop-in already exists');
 safeDir('/var/opt');var staging=ROOT+'.new-'+process.pid;fs.mkdirSync(staging,493);
 var committed=false,unitWritten=false;
 try{
  var candidate=patcher.apply(check.original,patch);
  write(staging+'/carplay',candidate,493);
  write(staging+'/manager.js',fs.readFileSync(path.join(__dirname,'runtime/manager.js')),420);
  write(staging+'/carplay-patch.json',manifest,420);
  var metadata={package:ID,version:VERSION,installedAt:new Date().toISOString(),originalSha256:patch.original.sha256,candidateSha256:patch.candidate.sha256,
   metricsAddress:patch.metricsAddress,reportBytes:12,descriptorBytes:133,dropinSha256:sha(drop),managerSha256:sha(fs.readFileSync(staging+'/manager.js')),
   composableManifestSha256:sha(manifest)};
  write(staging+'/install.json',JSON.stringify(metadata,null,2)+'\n');
  write(staging+'/factory-unit.txt',check.unit);
  fs.renameSync(staging,ROOT);committed=true;exec('sync',[]);
  rootWrite(function(){
   var dir=path.dirname(DROP);if(!exists(dir))fs.mkdirSync(dir,493);safeDir(dir);
   write(DROP+'.new',drop,420);fs.renameSync(DROP+'.new',DROP);unitWritten=true;
  });
  exec('systemctl',['daemon-reload']);
  var effective=exec('systemctl',['show','carplay.service','-p','ExecStart','-p','ExecStartPre','-p','DropInPaths','-p','KillSignal','-p','OnFailure']);
  if(effective.indexOf(DROP)<0||effective.indexOf(ROOT+'/manager.js')<0||!/^KillSignal=9$/m.test(effective)||effective.indexOf('mediaddpserver_kill.service')<0)throw Error('Effective unit validation failed');
 }catch(error){
  if(unitWritten){try{rootWrite(function(){if(sha(fs.readFileSync(DROP))===sha(drop))fs.unlinkSync(DROP);});exec('systemctl',['daemon-reload']);}catch(rollbackError){throw Error(String(error)+'; drop-in rollback failed: '+String(rollbackError));}}
  // Keep staged diagnostic files on a failed install; no unrelated files are removed.
  if(committed&&!unitWritten)write(ROOT+'/disabled.json',JSON.stringify({reason:'installation_incomplete'}));
  throw error;
 }
 // The drop-in that starts a composed executable is in place before the registration.
 var registration=register(ROOT+'/carplay-patch.json');
 return {state:'installed-for-next-boot',voltage:power,originalUnchanged:sha(fs.readFileSync('/usr/bin/carplay'))===patch.original.sha256,effective:effective,registration:registration,status:status()};
}
function uninstall(){
 if(process.getuid()!==0)throw Error('Root SSH is required');
 var info=readJson(ROOT+'/install.json');if(!info||info.package!==ID)throw Error('No owned installation found');safeDir(ROOT);
 if(exists(DROP)&&sha(fs.readFileSync(DROP))!==info.dropinSha256)throw Error('Drop-in changed; refusing to remove another configuration');
 var allowed=['carplay','manager.js','install.json','factory-unit.txt','disabled.json','pending.json','health.json','carplay-patch.json'];
 fs.readdirSync(ROOT).forEach(function(n){if(allowed.indexOf(n)<0)throw Error('Unexpected file preserved: '+n);var s=fs.lstatSync(ROOT+'/'+n);if(!s.isFile()||s.isSymbolicLink())throw Error('Unexpected entry preserved: '+n);});
 var dropBytes=exists(DROP)?fs.readFileSync(DROP):null;
 rootWrite(function(){if(exists(DROP))fs.unlinkSync(DROP);});exec('systemctl',['daemon-reload']);
 // The drop-in is gone before the registration, so a composer never sees it without one.
 var registration=unregister(info);
 if(registration.state==='failed'){
  // A composition may still carry this patch: its drop-in, and with it the startup guard, goes back.
  var why='Unregistering from the CarPlay patch composer failed: '+(registration.output||'no output');
  if(dropBytes){
   try{rootWrite(function(){if(exists(DROP+'.new'))fs.unlinkSync(DROP+'.new');write(DROP+'.new',dropBytes,420);fs.renameSync(DROP+'.new',DROP);});exec('systemctl',['daemon-reload']);}
   catch(restoreError){throw Error(why+'; putting the multitouch drop-in back failed too: '+String(restoreError)+'. Run uninstall again.');}
  }
  throw Error(why+'. The multitouch drop-in is back and nothing else was removed; run uninstall again.');
 }
 allowed.forEach(function(n){if(exists(ROOT+'/'+n))fs.unlinkSync(ROOT+'/'+n);});fs.rmdirSync(ROOT);exec('sync',[]);
 return {state:'removed-for-next-boot',factoryUnchanged:sha(fs.readFileSync('/usr/bin/carplay'))===patch.original.sha256,registration:registration,rootReadOnly:rootReadOnly()};
}
function queueReboot(){
 var code="setTimeout(function(){require('child_process').spawn('systemctl',['reboot'],{detached:true,stdio:'ignore'}).unref();},1500);";
 var child=cp.spawn('/usr/bin/node',['-e',code],{detached:true,stdio:'ignore'});child.unref();
 return {requested:true,delayMs:1500};
}
function main(){
 var action=process.argv[2],activate=process.argv.indexOf('--activate')>=0,result;
 if(action==='check'){var check=preflight();result={supported:true,originalSha256:check.originalSha256,rootReadOnly:check.rootReadOnly};}
 else if(action==='status')result=status();
 else if(action==='install')result=install();
 else if(action==='uninstall'){if(activate)voltage();result=uninstall();}
 else throw Error('Usage: node agent.js check|install|status|uninstall [--activate]');
 if(activate){if(action!=='install'&&action!=='uninstall')throw Error('Invalid activation action');result.activation=queueReboot();}
 console.log(JSON.stringify(result,null,2));
}
module.exports={preflight:preflight,rootWrite:rootWrite,install:install,uninstall:uninstall,status:status};
if(require.main===module){try{main();}catch(error){console.error(String(error));process.exitCode=1;}}
