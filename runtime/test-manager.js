'use strict';
/* Local fixtures only: does not contact the car or execute systemctl. */
var assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),crypto=require('crypto');
var mod=require('./manager'),checks=[];
var base=process.argv[2]||path.join(os.tmpdir(),'mgu-multitouch-manager-tests');
if(!fs.existsSync(base))fs.mkdirSync(base);
var seq=0;
// A small stand-in for the real geometry: this patch writes [4,8), [20,24) and appends [48,64).
var GEOMETRY={originalSize:48,candidateSize:64,ranges:[[4,8],[20,24],[48,64]]};
function hash(b){return crypto.createHash('sha256').update(b).digest('hex');}
function fixture(){
 var dir=path.join(base,'case-'+process.pid+'-'+(++seq));fs.mkdirSync(dir);
 var root=path.join(dir,'package'),run=path.join(dir,'run'),composer=path.join(dir,'composer'),composerRun=path.join(dir,'composer-run');fs.mkdirSync(root);fs.mkdirSync(run);fs.mkdirSync(composerRun);
 fs.writeFileSync(path.join(root,'carplay'),'own test fixture, not BMW code');
 fs.writeFileSync(path.join(root,'install.json'),JSON.stringify(mod.EXPECTED));
 var data={boot:'11111111-1111-1111-1111-111111111111',pid:123,active:true,running:true,
  originalHash:mod.EXPECTED.originalSha256,candidateHash:mod.EXPECTED.candidateSha256,report:12,descriptor:133,spawn:null,timer:null,unref:false,mode:493,
  exe:path.join(root,'carplay'),exeHash:null,modes:{}};
 var proc={env:{SERVICE_RESULT:'success'},getuid:function(){return 0;},execPath:'fixture-node'};
 var f=Object.create(fs),virtualFd=987654;
 // Durability syscalls are outside these filesystem/state fixtures (Windows
 // rejects fsync on read handles; the deployed runtime uses Linux fsync).
 f.fsyncSync=function(){};
 f.lstatSync=function(file){var s=fs.lstatSync(file);return {uid:0,mode:data.modes[file]||data.mode,isFile:function(){return s.isFile();},isDirectory:function(){return s.isDirectory();},isSymbolicLink:function(){return s.isSymbolicLink();}};};
 f.readFileSync=function(file,enc){
  if(file==='/proc/sys/kernel/random/boot_id')return data.boot+'\n';
  if(file==='/proc/'+data.pid+'/maps')return '555500000000-555500200000 r-xp 00000000 00:00 1 '+data.exe+'\n';
  return fs.readFileSync(file,enc);
 };
 f.readlinkSync=function(file){assert.strictEqual(file,'/proc/'+data.pid+'/exe');return data.exe;};
 f.openSync=function(file,flags){return file==='/proc/'+data.pid+'/mem'?virtualFd:fs.openSync(file,flags);};
 f.readSync=function(fd,b,offset,length,pos){
  if(fd!==virtualFd)return fs.readSync(fd,b,offset,length,pos);
  assert.strictEqual(pos,0x555500000000+mod.EXPECTED.metricsAddress);
  Buffer.from('MGUMT01\0').copy(b,offset);b.writeUInt32LE(data.report,offset+12);b.writeUInt32LE(data.descriptor,offset+44);return length;
 };
 f.closeSync=function(fd){if(fd!==virtualFd)fs.closeSync(fd);};
 var cp={execFileSync:function(cmd,args){assert.strictEqual(cmd,'systemctl');return 'MainPID='+data.pid+'\nActiveState='+(data.active?'active':'failed')+'\nSubState='+(data.running?'running':'dead')+'\n';},
  spawn:function(exe,args,options){data.spawn={exe:exe,args:args,options:options};return {pid:500,unref:function(){data.unref=true;}};}};
 var manager=mod.createManager({fs:f,cp:cp,process:proc,root:root,run:run,now:function(){return '2026-10-28T22:00:00.000Z';},
  sha:function(file){
   if(file==='/usr/bin/carplay')return data.originalHash;
   if(file==='/proc/'+data.pid+'/exe')return data.exeHash||data.candidateHash;
   if(file===path.join(root,'carplay'))return data.candidateHash;
   return hash(fs.readFileSync(file));
  },setTimeout:function(fn,ms){data.timer={fn:fn,ms:ms};return 1;},composer:composer,composerRun:composerRun,geometry:GEOMETRY});
 return {manager:manager,data:data,root:root,run:run,proc:proc,
  json:function(name){return JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));},
  exists:function(name){return fs.existsSync(path.join(root,name));},selected:function(){return fs.existsSync(path.join(run,'selected'));},
  selection:function(){return fs.readFileSync(path.join(run,'selected'),'utf8');},
  // A composer's output holding this patch and another one writing [30,34); edit(own, composed, record) adjusts it.
  compose:function(edit,manifestSha){
   var own=Buffer.alloc(64);for(var i=0;i<64;i++)own[i]=i*7&255;
   var composed=Buffer.from(own);for(var j=30;j<34;j++)composed[j]^=0x5a;
   var m=manifestSha===undefined?'a'.repeat(64):manifestSha,cfg=JSON.parse(JSON.stringify(mod.EXPECTED));
   if(m)cfg.composableManifestSha256=m;
   var record={format:'mgu-carplay-composed-v1',base:{path:'/usr/bin/carplay',size:48,sha256:mod.EXPECTED.originalSha256},candidate:{path:path.join(composer,'carplay'),size:64,sha256:null},launcher:null,
    patches:[{id:'idrive7-carplay-multitouch',version:'0.1.0',manifestSha256:'a'.repeat(64),regions:[],append:{offset:48,length:16}},
     {id:'other',version:'1',manifestSha256:'b'.repeat(64),regions:[{name:'x',offset:30,length:4,original:own.slice(30,34).toString('hex'),patched:composed.slice(30,34).toString('hex')}],append:null}]};
   if(edit)edit(own,composed,record);
   if(record.candidate.sha256===null)record.candidate.sha256=hash(composed);
   if(!fs.existsSync(composer))fs.mkdirSync(composer);
   fs.writeFileSync(path.join(root,'carplay'),own);fs.writeFileSync(path.join(root,'install.json'),JSON.stringify(cfg));
   fs.writeFileSync(path.join(composer,'carplay'),composed);fs.writeFileSync(path.join(composer,'composed.json'),JSON.stringify(record));
   fs.writeFileSync(path.join(composer,'expected.sha256'),record.base.sha256+'  /usr/bin/carplay\n'+record.candidate.sha256+'  '+path.join(composer,'carplay')+'\n');
   // the composer's boot-loop guard approved this start
   fs.writeFileSync(path.join(composerRun,'go'),fs.readFileSync(path.join(composer,'expected.sha256')));
   return {own:own,composed:composed,record:record,sha:hash(composed),path:path.join(composer,'carplay')};
  }};
}
function test(name,fn){fn();checks.push(name);}
test('compatible exact hashes select candidate and persist pending boot',function(){var f=fixture(),r=f.manager.prepare();assert(r.candidate);assert(f.selected());assert.strictEqual(f.json('pending.json').bootId,f.data.boot);});
test('same-boot preparation rotates token and old health check is superseded',function(){var f=fixture(),r=f.manager.prepare();f.manager.prepare();assert.strictEqual(f.manager.checkHealth(r.token,123).reason,'superseded');});
test('unverified previous boot disables candidate and removes selection',function(){var f=fixture();f.manager.prepare();f.data.boot='22222222-2222-2222-2222-222222222222';assert(!f.manager.prepare().candidate);assert(!f.selected());assert.strictEqual(f.json('disabled.json').reason,'previous_boot_not_verified');});
test('explicit disabled state selects factory',function(){var f=fixture();fs.writeFileSync(path.join(f.root,'disabled.json'),'{}');assert.strictEqual(f.manager.prepare().reason,'disabled');assert(!f.selected());});
test('changed factory executable selects factory',function(){var f=fixture();f.data.originalHash='changed';assert.strictEqual(f.manager.prepare().reason,'factory_hash_changed');assert(!f.selected());});
test('changed candidate executable selects factory',function(){var f=fixture();f.data.candidateHash='changed';assert.strictEqual(f.manager.prepare().reason,'candidate_hash_changed');assert(!f.selected());});
test('missing candidate leaves no stale runtime selection',function(){var f=fixture();f.manager.prepare();fs.unlinkSync(path.join(f.root,'carplay'));assert.throws(function(){f.manager.prepare();});assert(!f.selected());});
test('malformed install metadata leaves no stale runtime selection',function(){var f=fixture();f.manager.prepare();fs.writeFileSync(path.join(f.root,'install.json'),'{');assert.throws(function(){f.manager.prepare();});assert(!f.selected());});
test('unsupported metadata is rejected',function(){var f=fixture(),cfg=JSON.parse(JSON.stringify(mod.EXPECTED));cfg.metricsAddress++;fs.writeFileSync(path.join(f.root,'install.json'),JSON.stringify(cfg));assert.strictEqual(f.manager.prepare().reason,'unsupported_install_metadata');});
test('health worker is detached and receives selected token and MainPID',function(){var f=fixture(),r=f.manager.prepare();assert(f.manager.healthStart().started);assert.strictEqual(f.data.spawn.exe,'fixture-node');assert.strictEqual(f.data.spawn.args[1],'health');assert.strictEqual(f.data.spawn.args[2],r.token);assert.strictEqual(f.data.spawn.args[3],'123');assert(f.data.spawn.options.detached);assert(f.data.unref);});
test('healthy same process with 12-byte reports and 133-byte descriptor clears pending',function(){var f=fixture(),r=f.manager.prepare();assert(f.manager.checkHealth(r.token,123).verified);assert(!f.exists('pending.json'));assert(f.json('health.json').verified);assert(!f.exists('disabled.json'));});
test('changed MainPID disables candidate',function(){var f=fixture(),r=f.manager.prepare();f.data.pid=124;assert(!f.manager.checkHealth(r.token,123).verified);assert(f.exists('disabled.json'));assert(!f.selected());});
test('wrong descriptor disables candidate',function(){var f=fixture(),r=f.manager.prepare();f.data.descriptor=161;assert.strictEqual(f.manager.checkHealth(r.token,123).reason,'payload_check_failed');assert(f.exists('disabled.json'));});
test('failed service writes persistent disabled marker',function(){var f=fixture();f.manager.prepare();f.proc.env.SERVICE_RESULT='signal';assert(f.manager.stopped().disabled);assert.strictEqual(f.json('disabled.json').details.serviceResult,'signal');assert(!f.selected());});
test('successful stop removes selection without disabling',function(){var f=fixture();f.manager.prepare();assert(!f.manager.stopped().disabled);assert(!f.exists('disabled.json'));assert(!f.selected());});
test('unknown stop result conservatively disables candidate',function(){var f=fixture();f.manager.prepare();delete f.proc.env.SERVICE_RESULT;assert(f.manager.stopped().disabled);});
test('health check waits 60 seconds then verifies the same process',function(){var f=fixture(),r=f.manager.prepare(),result;f.manager.health(r.token,123,function(e,v){assert.ifError(e);result=v;});assert.strictEqual(f.data.timer.ms,60000);assert(!result);f.data.timer.fn();assert(result.verified);});
test('nonroot and writable directories are rejected',function(){var f=fixture();f.proc.getuid=function(){return 1000;};assert.throws(function(){f.manager.prepare();},/root/);f.proc.getuid=function(){return 0;};f.data.mode=511;assert.throws(function(){f.manager.prepare();},/Unsafe directory/);});

// A composed executable holding this patch and another registered CarPlay patch.
function ownSelected(f,reason){var r=f.manager.prepare();assert(r.candidate);assert.strictEqual(r.selected,'own');assert.strictEqual(r.composed,reason);assert.strictEqual(f.selection(),mod.EXPECTED.candidateSha256+'\n');assert(!f.json('pending.json').selected);}
test('without a composer the installed copy is selected exactly as before',function(){var f=fixture(),r=f.manager.prepare();assert.strictEqual(r.selected,'own');assert.strictEqual(r.composed,'no_composition');assert.strictEqual(f.selection(),mod.EXPECTED.candidateSha256+'\n');assert.deepEqual(Object.keys(f.json('pending.json')).sort(),['bootId','candidateSha256','time','token']);});
test('a verified composition with another patch is selected and recorded in pending',function(){var f=fixture(),c=f.compose(),r=f.manager.prepare();assert(r.candidate);assert.strictEqual(r.selected,'composed');assert.strictEqual(f.selection(),'composed '+c.sha+'\n');assert.deepEqual(f.json('pending.json').selected,{path:c.path,sha256:c.sha});});
test('a composition holding only this patch keeps the installed copy',function(){var f=fixture();f.compose(function(o,c,r){r.patches.pop();c[30]=o[30];c[31]=o[31];c[32]=o[32];c[33]=o[33];});ownSelected(f,'no_other_patch');});
test('a composed executable not matching its record keeps the installed copy',function(){var f=fixture();f.compose(function(o,c,r){r.candidate.sha256='0'.repeat(64);});ownSelected(f,'composed_hash_mismatch');});
test('a byte changed outside the other patch\'s regions keeps the installed copy',function(){var f=fixture();f.compose(function(o,c){c[40]^=1;});ownSelected(f,'differs_outside_other_regions');});
test('a byte of this patch changed keeps the installed copy',function(){var f=fixture();f.compose(function(o,c){c[5]^=1;});ownSelected(f,'differs_outside_other_regions');});
test('an appended byte changed keeps the installed copy',function(){var f=fixture();f.compose(function(o,c){c[60]^=1;});ownSelected(f,'differs_outside_other_regions');});
test('another patch\'s region overlapping this patch keeps the installed copy',function(){var f=fixture();f.compose(function(o,c,r){var g=r.patches[1].regions[0];g.offset=6;g.original=o.slice(6,10).toString('hex');g.patched=c.slice(6,10).toString('hex');});ownSelected(f,'other_region_overlaps_this_patch');});
test('another patch\'s region past the factory size keeps the installed copy',function(){var f=fixture();f.compose(function(o,c,r){var g=r.patches[1].regions[0];g.offset=46;g.original=o.slice(46,50).toString('hex');g.patched=c.slice(46,50).toString('hex');});ownSelected(f,'other_region_out_of_range');});
test('a record whose region bytes do not match keeps the installed copy',function(){var f=fixture();f.compose(function(o,c,r){r.patches[1].regions[0].patched='00000000';});ownSelected(f,'other_region_record_mismatch');});
test('another patch that appends keeps the installed copy',function(){var f=fixture();f.compose(function(o,c,r){r.patches[1].append={offset:64,length:1};});ownSelected(f,'other_patch_appends');});
test('a composition from another factory file keeps the installed copy',function(){var f=fixture();f.compose(function(o,c,r){r.base.sha256='1'.repeat(64);});ownSelected(f,'factory_hash_mismatch');});
test('a composition registered with another manifest keeps the installed copy',function(){var f=fixture();f.compose(null,'c'.repeat(64));ownSelected(f,'patch_not_in_composition');});
test('an installation from 0.1.0 to 0.2.2 never selects a composition',function(){var f=fixture();f.compose(null,null);ownSelected(f,'not_registered_by_this_installation');});
test('a writable composer folder keeps the installed copy',function(){var f=fixture(),c=f.compose();f.data.modes[path.dirname(c.path)]=511;ownSelected(f,'composition_unreadable');});
test('a composition not committed by the composer keeps the installed copy',function(){var f=fixture(),c=f.compose(),e=path.join(path.dirname(c.path),'expected.sha256');fs.unlinkSync(e);ownSelected(f,'not_committed');f.compose();fs.writeFileSync(e,'x  /usr/bin/carplay\n');ownSelected(f,'not_committed');});
test('a start the composer\'s boot-loop guard did not approve keeps the installed copy',function(){var f=fixture(),c=f.compose(),go=path.join(path.dirname(path.dirname(c.path)),'composer-run','go');fs.unlinkSync(go);ownSelected(f,'guard_not_approved');f.compose();fs.writeFileSync(go,'another composition\n');ownSelected(f,'guard_not_approved');});
test('an unreadable record keeps the installed copy',function(){var f=fixture(),c=f.compose();fs.writeFileSync(path.join(path.dirname(c.path),'composed.json'),'{');ownSelected(f,'composition_unreadable');});
test('a composition is never selected when the installed copy fails its checks',function(){var f=fixture();f.compose();f.data.originalHash='changed';var r=f.manager.prepare();assert.strictEqual(r.reason,'factory_hash_changed');assert(!f.selected());});
test('a composition is never selected while disabled',function(){var f=fixture();f.compose();fs.writeFileSync(path.join(f.root,'disabled.json'),'{}');assert.strictEqual(f.manager.prepare().reason,'disabled');assert(!f.selected());});
test('an unverified previous boot of the composition disables it like the installed copy',function(){var f=fixture();f.compose();f.manager.prepare();f.data.boot='22222222-2222-2222-2222-222222222222';var r=f.manager.prepare();assert(!r.candidate);assert.strictEqual(f.json('disabled.json').reason,'previous_boot_not_verified');assert(!f.selected());});
test('the composition running with 12-byte reports and 133-byte descriptor passes the health check',function(){var f=fixture(),c=f.compose(),r=f.manager.prepare();f.data.exe=c.path;f.data.exeHash=c.sha;var h=f.manager.checkHealth(r.token,123);assert(h.verified);assert.strictEqual(h.selected,'composed');assert.strictEqual(f.json('health.json').selected.sha256,c.sha);assert(!f.exists('pending.json'));});
test('a composition replaced after the start still verifies by its running bytes',function(){var f=fixture(),c=f.compose(),r=f.manager.prepare();f.data.exe=c.path+' (deleted)';f.data.exeHash=c.sha;assert(f.manager.checkHealth(r.token,123).verified);});
test('the installed copy running where the composition was selected disables it',function(){var f=fixture(),c=f.compose(),r=f.manager.prepare();f.data.exeHash=c.sha;assert.strictEqual(f.manager.checkHealth(r.token,123).reason,'process_check_failed');assert(f.exists('disabled.json'));assert(!f.selected());});
test('other running bytes disable the composition',function(){var f=fixture(),c=f.compose(),r=f.manager.prepare();f.data.exe=c.path;f.data.exeHash='0'.repeat(64);assert.strictEqual(f.manager.checkHealth(r.token,123).reason,'process_check_failed');assert(f.exists('disabled.json'));});
test('a wrong descriptor in the composition disables it',function(){var f=fixture(),c=f.compose(),r=f.manager.prepare();f.data.exe=c.path;f.data.exeHash=c.sha;f.data.descriptor=161;assert.strictEqual(f.manager.checkHealth(r.token,123).reason,'payload_check_failed');assert(f.exists('disabled.json'));});
test('a failed stop of the composition disables it',function(){var f=fixture();f.compose();f.manager.prepare();f.proc.env.SERVICE_RESULT='signal';assert(f.manager.stopped().disabled);assert(!f.selected());});
test('the health worker starts for the composition',function(){var f=fixture();f.compose();var r=f.manager.prepare();assert(f.manager.healthStart().started);assert.strictEqual(f.data.spawn.args[2],r.token);});
test('status reports the selection and why a composition was not taken',function(){var f=fixture();f.compose(null,null);f.manager.prepare();var s=f.manager.status();assert.strictEqual(s.selection,'own');assert.strictEqual(s.composed.reason,'not_registered_by_this_installation');var g=fixture();g.compose();g.manager.prepare();assert.strictEqual(g.manager.status().selection,'composed');assert(g.manager.status().composed.path);});
var result={passed:true,checks:checks,scope:'Local filesystem/process/metrics fixtures only; no vehicle connection or service changes.'};
console.log(JSON.stringify(result,null,2));
