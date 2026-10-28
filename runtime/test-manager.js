'use strict';
/* Local fixtures only: does not contact the car or execute systemctl. */
var assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os');
var mod=require('./manager'),checks=[];
var base=process.argv[2]||path.join(os.tmpdir(),'mgu-multitouch-manager-tests');
if(!fs.existsSync(base))fs.mkdirSync(base);
var seq=0;
function fixture(){
 var dir=path.join(base,'case-'+process.pid+'-'+(++seq));fs.mkdirSync(dir);
 var root=path.join(dir,'package'),run=path.join(dir,'run');fs.mkdirSync(root);fs.mkdirSync(run);
 fs.writeFileSync(path.join(root,'carplay'),'own test fixture, not BMW code');
 fs.writeFileSync(path.join(root,'install.json'),JSON.stringify(mod.EXPECTED));
 var data={boot:'11111111-1111-1111-1111-111111111111',pid:123,active:true,running:true,
  originalHash:mod.EXPECTED.originalSha256,candidateHash:mod.EXPECTED.candidateSha256,report:12,descriptor:133,spawn:null,timer:null,unref:false,mode:493};
 var proc={env:{SERVICE_RESULT:'success'},getuid:function(){return 0;},execPath:'fixture-node'};
 var f=Object.create(fs),virtualFd=987654;
 // Durability syscalls are outside these filesystem/state fixtures (Windows
 // rejects fsync on read handles; the deployed runtime uses Linux fsync).
 f.fsyncSync=function(){};
 f.lstatSync=function(file){var s=fs.lstatSync(file);return {uid:0,mode:data.mode,isFile:function(){return s.isFile();},isDirectory:function(){return s.isDirectory();},isSymbolicLink:function(){return s.isSymbolicLink();}};};
 f.readFileSync=function(file,enc){
  if(file==='/proc/sys/kernel/random/boot_id')return data.boot+'\n';
  if(file==='/proc/'+data.pid+'/maps')return '555500000000-555500200000 r-xp 00000000 00:00 1 '+path.join(root,'carplay')+'\n';
  return fs.readFileSync(file,enc);
 };
 f.readlinkSync=function(file){assert.strictEqual(file,'/proc/'+data.pid+'/exe');return path.join(root,'carplay');};
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
  sha:function(file){return file==='/usr/bin/carplay'?data.originalHash:data.candidateHash;},setTimeout:function(fn,ms){data.timer={fn:fn,ms:ms};return 1;}});
 return {manager:manager,data:data,root:root,run:run,proc:proc,
  json:function(name){return JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));},
  exists:function(name){return fs.existsSync(path.join(root,name));},selected:function(){return fs.existsSync(path.join(run,'selected'));}};
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
var result={passed:true,checks:checks,scope:'Local filesystem/process/metrics fixtures only; no vehicle connection or service changes.'};
console.log(JSON.stringify(result,null,2));
