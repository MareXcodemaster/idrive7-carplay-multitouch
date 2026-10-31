'use strict';
/* MGU CarPlay multitouch boot selection and short first-minute health check.
 * Own code only. Node 8 compatible. The factory executable is never modified.
 *
 * Selection: the factory executable unless every check on the installed copy
 * passes. When it does and a CarPlay patch composer has built one executable
 * from the factory file, this patch and at least one other registered patch,
 * that composed executable is selected instead, but only if it equals the
 * verified copy byte for byte outside the other patches' declared regions;
 * otherwise the installed copy is. The guard (pending boot, health check,
 * failed stop) applies to whichever was selected.
 */
var fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
var ROOT='/var/opt/mgu-carplay-multitouch',RUN='/run/mgu-carplay-multitouch';
var ORIGINAL='/usr/bin/carplay',COMPOSER='/var/opt/mgu-carplay-patch',PATCH_ID='idrive7-carplay-multitouch';
var EXPECTED={originalSha256:'ddb33e33161387c6479c391684b3d019b0de54ecfcee8d6877eca94aa62f3e50',
 candidateSha256:'2a009e6afe22f8f385b164ec9e2a7c2aa22b1c1c3ac2110d04f80715dc2c01de',metricsAddress:5637648,reportBytes:12,descriptorBytes:133};
// Where this patch writes: program header, two call sites, the appended payload.
var OWN={originalSize:3484912,candidateSize:3487405,ranges:[[344,400],[653728,653733],[2150601,2150606],[3484912,3487405]]};

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
/* Why the composed executable may not replace the verified copy, or null.
 * own: the verified copy's bytes; composed: the composed bytes; record: the
 * composer's composed.json; manifestSha256: what this installation registered;
 * hashes: actual SHA-256 of the factory file and of the composed file. */
function composedProblem(own,composed,record,manifestSha256,hashes,geometry){
 var g=geometry||OWN,hex=/^[0-9a-f]{64}$/;
 if(typeof manifestSha256!=='string'||!hex.test(manifestSha256))return 'not_registered_by_this_installation';
 if(!record||record.format!=='mgu-carplay-composed-v1'||!record.base||!record.candidate||!Array.isArray(record.patches))return 'record_unreadable';
 if(record.base.sha256!==EXPECTED.originalSha256||hashes.original!==EXPECTED.originalSha256)return 'factory_hash_mismatch';
 if(record.candidate.sha256!==hashes.composed)return 'composed_hash_mismatch';
 var mine=record.patches.filter(function(p){return p&&p.id===PATCH_ID;});
 if(mine.length!==1||mine[0].manifestSha256!==manifestSha256)return 'patch_not_in_composition';
 var others=record.patches.filter(function(p){return p&&p.id!==PATCH_ID;});
 if(!others.length)return 'no_other_patch';
 if(own.length!==g.candidateSize||composed.length!==own.length)return 'composed_size_mismatch';
 var spans=[],bad=null;
 others.forEach(function(p){
  if(p.append)bad='other_patch_appends';
  (Array.isArray(p.regions)?p.regions:[]).forEach(function(r){
   var o=r&&r.offset,n=r&&r.length;
   if(!Number.isSafeInteger(o)||!Number.isSafeInteger(n)||o<0||n<1||o+n>g.originalSize){bad='other_region_out_of_range';return;}
   if(g.ranges.some(function(x){return o<x[1]&&x[0]<o+n;})){bad='other_region_overlaps_this_patch';return;}
   if(typeof r.original!=='string'||typeof r.patched!=='string'||r.original!==own.slice(o,o+n).toString('hex')||r.patched!==composed.slice(o,o+n).toString('hex')){bad='other_region_record_mismatch';return;}
   spans.push([o,o+n]);
  });
 });
 if(bad)return bad;
 if(!spans.length)return 'no_other_region';
 spans.sort(function(a,b){return a[0]-b[0];});
 var at=0;
 for(var i=0;i<=spans.length;i++){
  var end=i<spans.length?spans[i][0]:own.length;
  if(end>at&&!own.slice(at,end).equals(composed.slice(at,end)))return 'differs_outside_other_regions';
  if(i<spans.length)at=Math.max(at,spans[i][1]);
 }
 return null;
}
function createManager(deps){
 deps=deps||{};
 var f=deps.fs||fs,child=deps.cp||cp,proc=deps.process||process;
 var root=deps.root||ROOT,run=deps.run||RUN,original=deps.original||ORIGINAL,composer=deps.composer||COMPOSER;
 var now=deps.now||function(){return new Date().toISOString();};
 var timeout=deps.setTimeout||setTimeout,candidate=path.join(root,'carplay'),composedPath=path.join(composer,'carplay');
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
 function metrics(pid,cfg,exe){
  var maps=f.readFileSync('/proc/'+pid+'/maps','utf8').split('\n');
  var entries=maps.filter(function(line){return line.indexOf(exe)>=0&&/\s00000000\s/.test(line);});
  if(entries.length!==1)throw Error('Candidate load base not found');
  var base=parseInt(entries[0].split('-')[0],16),fd=f.openSync('/proc/'+pid+'/mem','r'),b=Buffer.alloc(96);
  try{if(f.readSync(fd,b,0,b.length,base+cfg.metricsAddress)!==b.length)throw Error('Short metrics read');}finally{f.closeSync(fd);}
  if(b.slice(0,7).toString()!=='MGUMT01')throw Error('Metrics magic mismatch');
  return {reportBytes:b.readUInt32LE(12),descriptorBytes:b.readUInt32LE(44),maxInputContacts:b.readUInt32LE(32),maxActiveContacts:b.readUInt32LE(64)};
 }
 /* The composed executable as {path, sha256} when it may replace the verified
  * copy, else {reason}. Called only once the copy itself passed every check. */
 function composedChoice(cfg){
  try{
   if(!exists(composer))return {reason:'no_composition'};
   safeDir(composer,false);
   var record=path.join(composer,'composed.json');
   if(!exists(record)||!exists(composedPath))return {reason:'no_composition'};
   safeFile(record);safeFile(composedPath);
   var composed=f.readFileSync(composedPath),hashes={original:sha(original),composed:crypto.createHash('sha256').update(composed).digest('hex')};
   var why=composedProblem(f.readFileSync(candidate),composed,readJson(record),cfg.composableManifestSha256,hashes,deps.geometry);
   return why?{reason:why}:{path:composedPath,sha256:hashes.composed};
  }catch(e){return {reason:'composition_unreadable',error:String(e.message||e)};}
 }
 function prepare(){
  rootOnly();safeDir(run,true);clearSelection();safeDir(root,false);
  var cfg=config(),boot=bootId(),pending=readJson(path.join(root,'pending.json'),true);
  safeFile(candidate);
  var result=decide(cfg,boot,pending,exists(path.join(root,'disabled.json')),sha(original),sha(candidate));
  if(!result.candidate){if(result.disable)disable(result.reason,pending);return result;}
  var token=crypto.randomBytes(16).toString('hex'),choice=composedChoice(cfg);
  if(choice.path){
   json(path.join(root,'pending.json'),{bootId:boot,token:token,time:now(),candidateSha256:EXPECTED.candidateSha256,selected:{path:choice.path,sha256:choice.sha256}});
   atomic(path.join(run,'selected'),'composed '+choice.sha256+'\n',420);
   return {candidate:true,reason:result.reason,token:token,selected:'composed'};
  }
  json(path.join(root,'pending.json'),{bootId:boot,token:token,time:now(),candidateSha256:EXPECTED.candidateSha256});
  atomic(path.join(run,'selected'),EXPECTED.candidateSha256+'\n',420);
  return {candidate:true,reason:result.reason,token:token,selected:'own',composed:choice.reason};
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
 // What the start selected: {path, sha256} of the own copy or the composed executable, or null.
 function selection(){
  var text;
  try{text=f.readFileSync(path.join(run,'selected'),'utf8').trim();}catch(e){if(e.code==='ENOENT')return null;throw e;}
  if(text===EXPECTED.candidateSha256)return {path:candidate,sha256:text,kind:'own'};
  var m=/^composed ([0-9a-f]{64})$/.exec(text);
  return m?{path:composedPath,sha256:m[1],kind:'composed'}:null;
 }
 function selected(){return !!selection();}
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
  var sel=selection();
  if(exists(path.join(root,'disabled.json'))||!sel)return {verified:false,reason:'disabled_or_factory'};
  var want=pending.selected||{path:candidate,sha256:EXPECTED.candidateSha256};
  var cfg=config(),svc=service();
  // A composed executable a composer replaced after this start still runs from its verified inode.
  function runs(exe){return exe===sel.path||(sel.kind==='composed'&&exe===sel.path+' (deleted)');}
  if(!validConfig(cfg)||want.path!==sel.path||want.sha256!==sel.sha256||svc.pid!==pid||!svc.active||!svc.running||!runs(f.readlinkSync('/proc/'+pid+'/exe'))||sha('/proc/'+pid+'/exe')!==sel.sha256){
   disable('first_minute_process_check_failed',{pid:pid,currentService:svc,selected:sel.kind});return {verified:false,reason:'process_check_failed'};
  }
  var data=metrics(pid,cfg,sel.path);
  if(data.reportBytes!==12||data.descriptorBytes!==133){disable('first_minute_payload_check_failed',data);return {verified:false,reason:'payload_check_failed'};}
  var health={verified:true,time:now(),bootId:pending.bootId,token:token,pid:pid,metrics:data};
  if(sel.kind==='composed')health.selected={kind:'composed',path:sel.path,sha256:sel.sha256};
  json(path.join(root,'health.json'),health);
  unlink(path.join(root,'pending.json'));syncDir(root);
  return {verified:true,pid:pid,metrics:data,selected:sel.kind};
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
  var sel=selection(),cfg=readJson(path.join(root,'install.json'),true);
  return {metadata:cfg,selected:!!sel,selection:sel?sel.kind:null,
   composed:cfg?composedChoice(cfg):null,
   disabled:readJson(path.join(root,'disabled.json'),true),pending:readJson(path.join(root,'pending.json'),true),health:readJson(path.join(root,'health.json'),true)};
 }
 return {prepare:prepare,stopped:stopped,healthStart:healthStart,health:health,checkHealth:checkHealth,status:status};
}
module.exports={EXPECTED:EXPECTED,OWN:OWN,PATCH_ID:PATCH_ID,validConfig:validConfig,decide:decide,composedProblem:composedProblem,createManager:createManager};
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
