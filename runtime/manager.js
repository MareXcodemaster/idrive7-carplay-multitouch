'use strict';
/* MGU CarPlay multitouch boot selection and short first-minute health check.
 * Own code only. Node 8 compatible. The factory executable is never modified.
 */
var fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
var ROOT='/var/opt/mgu-carplay-multitouch',RUN='/run/mgu-carplay-multitouch';
var ORIGINAL='/usr/bin/carplay';
var EXPECTED={originalSha256:'ddb33e33161387c6479c391684b3d019b0de54ecfcee8d6877eca94aa62f3e50',
 candidateSha256:'2a009e6afe22f8f385b164ec9e2a7c2aa22b1c1c3ac2110d04f80715dc2c01de',metricsAddress:5637648,reportBytes:12,descriptorBytes:133};

function validConfig(c){
 return !!c&&c.originalSha256===EXPECTED.originalSha256&&c.candidateSha256===EXPECTED.candidateSha256&&
 c.metricsAddress===EXPECTED.metricsAddress&&(c.reportBytes===undefined||c.reportBytes===12)&&
 (c.descriptorBytes===undefined||c.descriptorBytes===133);
}
function decide(c,boot,pending,disabled,originalHash,candidateHash){
 if(!validConfig(c))return {candidate:false,reason:'unsupported_install_metadata'};
 if(disabled)return {candidate:false,reason:'disabled'};
 if(originalHash!==EXPECTED.originalSha256)return {candidate:false,reason:'factory_hash_changed'};
 if(candidateHash!==EXPECTED.candidateSha256)return {candidate:false,reason:'candidate_hash_changed'};
 if(pending&&pending.bootId!==boot)return {candidate:false,reason:'previous_boot_not_verified',disable:true};
 return {candidate:true,reason:'compatible'};
}
function createManager(deps){
 deps=deps||{};
 var f=deps.fs||fs,child=deps.cp||cp,proc=deps.process||process;
 var root=deps.root||ROOT,run=deps.run||RUN,original=deps.original||ORIGINAL;
 var now=deps.now||function(){return new Date().toISOString();};
 var timeout=deps.setTimeout||setTimeout,candidate=path.join(root,'carplay');
 var sha=deps.sha||function(file){return crypto.createHash('sha256').update(f.readFileSync(file)).digest('hex');};
 function exists(file){try{f.lstatSync(file);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
 function unlink(file){try{f.unlinkSync(file);}catch(e){if(e.code!=='ENOENT')throw e;}}
 function readJson(file,optional){
  try{return JSON.parse(f.readFileSync(file,'utf8'));}
  catch(e){if(optional&&e.code==='ENOENT')return null;throw e;}
 }
 function syncDir(dir){var fd=f.openSync(dir,'r');try{f.fsyncSync(fd);}finally{f.closeSync(fd);}}
 function atomic(file,data,mode){
  var temp=file+'.new';unlink(temp);
  f.writeFileSync(temp,data,{mode:mode||384,flag:'wx'});
  var fd=f.openSync(temp,'r');try{f.fsyncSync(fd);}finally{f.closeSync(fd);}
  f.renameSync(temp,file);syncDir(path.dirname(file));
 }
 function json(file,obj){atomic(file,JSON.stringify(obj,null,2)+'\n',384);}
 function bootId(){var id=f.readFileSync('/proc/sys/kernel/random/boot_id','utf8').trim();if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Invalid boot id');return id;}
 function rootOnly(){if(typeof proc.getuid==='function'&&proc.getuid()!==0)throw Error('Run as root');}
 function safeDir(dir,create){
  if(!exists(dir)){if(!create)throw Error('Missing installation directory');f.mkdirSync(dir,493);}
  var s=f.lstatSync(dir);
  if(!s.isDirectory()||s.isSymbolicLink()||s.uid!==0||(s.mode&18))throw Error('Unsafe directory '+dir);
 }
 function safeFile(file){var s=f.lstatSync(file);if(!s.isFile()||s.isSymbolicLink()||s.uid!==0||(s.mode&18))throw Error('Unsafe file '+file);}
 function clearSelection(){unlink(path.join(run,'selected'));}
 function config(){safeFile(path.join(root,'install.json'));return readJson(path.join(root,'install.json'));}
 function disable(reason,details){
  clearSelection();
  json(path.join(root,'disabled.json'),{reason:reason,time:now(),bootId:bootId(),details:details||null});
 }
 function service(){
  var text=child.execFileSync('systemctl',['show','carplay.service','-p','MainPID','-p','ActiveState','-p','SubState'],{encoding:'utf8',timeout:5000});
  var m=/^MainPID=(\d+)$/m.exec(text);
  return {pid:m?Number(m[1]):0,active:/^ActiveState=active$/m.test(text),running:/^SubState=running$/m.test(text)};
 }
 function metrics(pid,cfg){
  var maps=f.readFileSync('/proc/'+pid+'/maps','utf8').split('\n');
  var entries=maps.filter(function(line){return line.indexOf(candidate)>=0&&/\s00000000\s/.test(line);});
  if(entries.length!==1)throw Error('Candidate load base not found');
  var base=parseInt(entries[0].split('-')[0],16),fd=f.openSync('/proc/'+pid+'/mem','r'),b=Buffer.alloc(96);
  try{if(f.readSync(fd,b,0,b.length,base+cfg.metricsAddress)!==b.length)throw Error('Short metrics read');}finally{f.closeSync(fd);}
  if(b.slice(0,7).toString()!=='MGUMT01')throw Error('Metrics magic mismatch');
  return {reportBytes:b.readUInt32LE(12),descriptorBytes:b.readUInt32LE(44),maxInputContacts:b.readUInt32LE(32),maxActiveContacts:b.readUInt32LE(64)};
 }
 function prepare(){
  rootOnly();safeDir(run,true);clearSelection();safeDir(root,false);
  var cfg=config(),boot=bootId(),pending=readJson(path.join(root,'pending.json'),true);
  safeFile(candidate);
  var result=decide(cfg,boot,pending,exists(path.join(root,'disabled.json')),sha(original),sha(candidate));
  if(!result.candidate){if(result.disable)disable(result.reason,pending);return result;}
  var token=crypto.randomBytes(16).toString('hex');
  json(path.join(root,'pending.json'),{bootId:boot,token:token,time:now(),candidateSha256:EXPECTED.candidateSha256});
  atomic(path.join(run,'selected'),EXPECTED.candidateSha256+'\n',420);
  return {candidate:true,reason:result.reason,token:token};
 }
 function stopped(){
  rootOnly();safeDir(root,false);
  var result=proc.env.SERVICE_RESULT||'unknown';
  if(result!=='success'){
   disable('carplay_service_failed',{serviceResult:result,exitCode:proc.env.EXIT_CODE||null,exitStatus:proc.env.EXIT_STATUS||null});
   return {disabled:true,serviceResult:result};
  }
  clearSelection();return {disabled:false,serviceResult:result};
 }
 function selected(){try{return f.readFileSync(path.join(run,'selected'),'utf8').trim()===EXPECTED.candidateSha256;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
 function healthStart(){
  rootOnly();safeDir(root,false);
  if(!selected()||exists(path.join(root,'disabled.json')))return {started:false,reason:'factory_selected'};
  var pending=readJson(path.join(root,'pending.json'));
  if(pending.bootId!==bootId())throw Error('Pending boot mismatch');
  var svc=service();if(!svc.pid)throw Error('Missing CarPlay PID');
  var worker=child.spawn(proc.execPath,[__filename,'health',pending.token,String(svc.pid)],{detached:true,stdio:'ignore'});
  worker.unref();
  return {started:true,pid:worker.pid,carplayPid:svc.pid};
 }
 function checkHealth(token,pid){
  rootOnly();safeDir(root,false);
  var pending=readJson(path.join(root,'pending.json'),true);
  if(!pending||pending.token!==token||pending.bootId!==bootId())return {verified:false,reason:'superseded'};
  if(exists(path.join(root,'disabled.json'))||!selected())return {verified:false,reason:'disabled_or_factory'};
  var cfg=config(),svc=service();
  if(!validConfig(cfg)||svc.pid!==pid||!svc.active||!svc.running||f.readlinkSync('/proc/'+pid+'/exe')!==candidate||sha('/proc/'+pid+'/exe')!==EXPECTED.candidateSha256){
   disable('first_minute_process_check_failed',{pid:pid,currentService:svc});return {verified:false,reason:'process_check_failed'};
  }
  var data=metrics(pid,cfg);
  if(data.reportBytes!==12||data.descriptorBytes!==133){disable('first_minute_payload_check_failed',data);return {verified:false,reason:'payload_check_failed'};}
  json(path.join(root,'health.json'),{verified:true,time:now(),bootId:pending.bootId,token:token,pid:pid,metrics:data});
  unlink(path.join(root,'pending.json'));syncDir(root);
  return {verified:true,pid:pid,metrics:data};
 }
 function health(token,pid,done){
  rootOnly();
  if(!/^[a-f0-9]{32}$/.test(token)||!Number.isSafeInteger(pid)||pid<1)throw Error('Invalid health arguments');
  return timeout(function(){
   try{done(null,checkHealth(token,pid));}
   catch(e){try{if(exists(root))disable('health_check_exception',String(e));}catch(ignore){}done(e);}
  },60000);
 }
 function status(){
  return {metadata:readJson(path.join(root,'install.json'),true),selected:selected(),
   disabled:readJson(path.join(root,'disabled.json'),true),pending:readJson(path.join(root,'pending.json'),true),health:readJson(path.join(root,'health.json'),true)};
 }
 return {prepare:prepare,stopped:stopped,healthStart:healthStart,health:health,checkHealth:checkHealth,status:status};
}
module.exports={EXPECTED:EXPECTED,validConfig:validConfig,decide:decide,createManager:createManager};
if(require.main===module){
 var manager=createManager(),action=process.argv[2];
 function finish(error,result){if(error){console.error(String(error));process.exitCode=1;}else console.log(JSON.stringify(result));}
 try{
  if(action==='prepare')finish(null,manager.prepare());
  else if(action==='stopped')finish(null,manager.stopped());
  else if(action==='health-start')finish(null,manager.healthStart());
  else if(action==='health')manager.health(process.argv[3],Number(process.argv[4]),finish);
  else if(action==='status')finish(null,manager.status());
  else throw Error('Usage: node manager.js prepare|stopped|health-start|health|status');
 }catch(error){finish(error);}
}
