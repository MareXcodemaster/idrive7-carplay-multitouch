'use strict';
// The composable manifest, the drop-in's executable selection, and (optional) a real
// composition. Synthetic by default; no firmware in this repository.
//
// Optional real check: CARPLAY_BIN (the supported factory executable), MGU_STORE_DIR
// (a checkout with deploy/unit/carplay_patch.js) and OTHER_MANIFEST (another CarPlay
// patch manifest without a launcher) compose both orders with that composer and run
// the manager's verification on the result.
var assert=require('assert'),fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),crypto=require('crypto');
var base=path.resolve(__dirname,'..'),composable=require('../patch/composable'),patch=require('../patch/patch.json'),patcher=require('../patch/patcher');
var mod=require('../runtime/manager'),checks=[],skipped=[];
function sha(b){return crypto.createHash('sha256').update(b).digest('hex');}
function test(name,fn){fn();checks.push(name);}
function mkdirp(d){if(!fs.existsSync(d)){mkdirp(path.dirname(d));fs.mkdirSync(d);}}
var tmp=fs.mkdtempSync(path.join(os.tmpdir(),'mgu-multitouch-composable-'));

test('the manifest is deterministic and describes exactly the delta',function(){
 var a=composable.toManifest(patch),b=composable.toManifest(JSON.parse(JSON.stringify(patch))),m=JSON.parse(a);
 assert(a.equals(b));assert.strictEqual(a.toString().slice(-1),'\n');
 assert.strictEqual(m.format,'mgu-carplay-patch-v1');assert.strictEqual(m.id,'idrive7-carplay-multitouch');assert.strictEqual(m.version,patch.release);
 assert.deepEqual(m.requires,{size:patch.original.size,sha256:patch.original.sha256});
 assert.deepEqual(m.regions.map(function(r){return r.name;}),['program-header','touch-report','hid-registration']);
 m.regions.forEach(function(r,i){var e=patch.edits[i];assert.strictEqual(r.offset,e.offset);assert.strictEqual(r.before,e.beforeHex);assert.strictEqual(r.after,e.afterHex);});
 assert.deepEqual(m.append,{name:'payload',offset:patch.append.offset,base64:patch.append.dataBase64});
 assert.strictEqual(m.launcher,'/etc/systemd/system/carplay.service.d/60-mgu-carplay-multitouch.conf');
});
test('the manager\'s geometry is the delta\'s',function(){
 assert.deepEqual(mod.OWN.ranges,composable.ranges(patch));
 assert.strictEqual(mod.OWN.originalSize,patch.original.size);assert.strictEqual(mod.OWN.candidateSize,patch.candidate.size);
 assert.strictEqual(mod.PATCH_ID,composable.ID);
});
test('the CLI prints the manifest',function(){
 var out=cp.execFileSync(process.execPath,[path.join(base,'patch/composable.js'),'manifest']);
 assert(out.equals(composable.toManifest(patch)));
});

// The drop-in's ExecStart, run through /bin/sh with its paths moved into a fixture.
var DROPIN=fs.readFileSync(path.join(base,'runtime/60-mgu-carplay-multitouch.conf'),'utf8');
test('the drop-in keeps every line of the multitouch-only service override',function(){
 ['ExecStartPre=-+/bin/sh -c \'rm -f /run/mgu-carplay-multitouch/selected\'','ExecStartPre=-+/usr/bin/node /var/opt/mgu-carplay-multitouch/manager.js prepare','ExecStart=',
  'ExecStartPost=-+/usr/bin/node /var/opt/mgu-carplay-multitouch/manager.js health-start','ExecStopPost=-+/usr/bin/node /var/opt/mgu-carplay-multitouch/manager.js stopped',
  'KillSignal=SIGKILL','SuccessExitStatus=SIGKILL'].forEach(function(l){assert(DROPIN.split('\n').indexOf(l)>=0,l);});
 assert.strictEqual(DROPIN.split('\n').filter(function(l){return /^ExecStart=./.test(l);}).length,1);
});
test('the drop-in starts the installed copy, a composed executable or the factory file as selected',function(){
 var line=/^ExecStart=\/bin\/sh -c '(.*)' -- (-c \/etc\/cinemo\/cinemo_options\.xml)$/m.exec(DROPIN);assert(line,'ExecStart shape');
 var dir=path.join(tmp,'override'),own=path.join(dir,'own'),composed=path.join(dir,'composed'),factory=path.join(dir,'factory'),sel=path.join(dir,'selected');
 fs.mkdirSync(dir);
 [[own,'own'],[composed,'composed'],[factory,'factory']].forEach(function(x){fs.writeFileSync(x[0],'#!/bin/sh\necho '+x[1]+' "$@"\n',{mode:493});});
 var script=line[1].split('$$').join('$').split('/run/mgu-carplay-multitouch/selected').join(sel).split('/var/opt/mgu-carplay-multitouch/carplay').join(own)
  .split('/var/opt/mgu-carplay-patch/carplay').join(composed).split('/usr/bin/carplay').join(factory);
 function start(selected){if(selected===null){try{fs.unlinkSync(sel);}catch(e){}}else fs.writeFileSync(sel,selected);return cp.execFileSync('/bin/sh',['-c',script,'--','-c','/etc/cinemo/cinemo_options.xml'],{encoding:'utf8'}).trim();}
 assert.strictEqual(start(mod.EXPECTED.candidateSha256+'\n'),'own -c /etc/cinemo/cinemo_options.xml');
 assert.strictEqual(start('composed '+'f'.repeat(64)+'\n'),'composed -c /etc/cinemo/cinemo_options.xml');
 assert.strictEqual(start(null),'factory -c /etc/cinemo/cinemo_options.xml');
 assert.strictEqual(start('something else\n'),'factory -c /etc/cinemo/cinemo_options.xml');
 assert.strictEqual(start('composedx\n'),'factory -c /etc/cinemo/cinemo_options.xml');
 fs.unlinkSync(composed);assert.strictEqual(start('composed '+'f'.repeat(64)+'\n'),'factory -c /etc/cinemo/cinemo_options.xml');
 fs.chmodSync(own,420);assert.strictEqual(start(mod.EXPECTED.candidateSha256+'\n'),'factory -c /etc/cinemo/cinemo_options.xml');
});

// With a real factory executable, a real composer and another manifest.
function real(){
 var bin=process.env.CARPLAY_BIN,store=process.env.MGU_STORE_DIR,other=process.env.OTHER_MANIFEST;
 if(!bin||!store||!other){skipped.push('real composition: set CARPLAY_BIN, MGU_STORE_DIR and OTHER_MANIFEST');return;}
 var C=require(path.resolve(store,'deploy/unit/carplay_patch.js')),factory=fs.readFileSync(bin),otherBuf=fs.readFileSync(other);
 assert(patcher.verifyOriginal(factory,patch),'CARPLAY_BIN is not the supported factory executable');
 assert(!JSON.parse(otherBuf).launcher,'OTHER_MANIFEST must not have a launcher');
 var own=patcher.apply(factory,patch),seq=0;
 function unit(){
  var R=path.join(tmp,'unit-'+(++seq)),p=function(r){return path.join(R,r);};
  [p('usr/bin'),p('lib/systemd/system'),p('etc/systemd/system/carplay.service.d'),p('proc'),p('pkg'),p('run')].forEach(mkdirp);
  fs.writeFileSync(p('usr/bin/carplay'),factory,{mode:493});
  fs.writeFileSync(p('lib/systemd/system/carplay.service'),'[Service]\nExecStart=/usr/bin/carplay -c /etc/cinemo/cinemo_options.xml\n');
  var launcher=p('etc/systemd/system/carplay.service.d/60-mgu-carplay-multitouch.conf');
  var m=JSON.parse(composable.toManifest(patch));m.launcher=launcher;var manifest=Buffer.from(JSON.stringify(m,null,2)+'\n');
  var cfg={target:p('usr/bin/carplay'),dir:p('var/opt/mgu-carplay-patch'),dropin:p('etc/systemd/system/carplay.service.d/50-mgu-carplay-patch.conf'),stockUnit:p('lib/systemd/system/carplay.service'),
   overrides:[p('etc/systemd/system/carplay.service')],dropinDirs:[p('etc/systemd/system/carplay.service.d')],proc:p('proc')};
  var api=C.create(cfg,{rootfsWindow:function(ops){ops.forEach(function(op){if(op.type==='mkdir')mkdirp(op.path);else if(op.type==='copy')fs.writeFileSync(op.path,op.data,{mode:op.mode});else if(op.type==='delete')fs.unlinkSync(op.path);});},daemonReload:function(){}});
  fs.writeFileSync(p('pkg/carplay'),own,{mode:493});
  var meta=JSON.parse(JSON.stringify(mod.EXPECTED));meta.composableManifestSha256=sha(manifest);fs.writeFileSync(p('pkg/install.json'),JSON.stringify(meta));
  var f=Object.create(fs);f.lstatSync=function(file){var s=fs.lstatSync(file);return {uid:0,mode:s.mode&~18,isFile:function(){return s.isFile();},isDirectory:function(){return s.isDirectory();},isSymbolicLink:function(){return s.isSymbolicLink();}};};
  f.readFileSync=function(file,enc){return file==='/proc/sys/kernel/random/boot_id'?'11111111-1111-1111-1111-111111111111\n':fs.readFileSync(file,enc);};
  var manager=mod.createManager({fs:f,process:{env:{},getuid:function(){return 0;}},root:p('pkg'),run:p('run'),original:p('usr/bin/carplay'),composer:cfg.dir});
  return {R:R,p:p,api:api,manager:manager,launcher:launcher,manifest:manifest,dir:cfg.dir,
   installLauncher:function(){fs.writeFileSync(launcher,fs.readFileSync(path.join(base,'runtime/60-mgu-carplay-multitouch.conf')));}};
 }
 var a=unit(),b=unit(),r;
 // this patch's installer puts its drop-in in place before it registers
 a.installLauncher();r=a.api.add(a.manifest);assert(r.ok&&!r.composed,JSON.stringify(r));
 r=a.api.add(otherBuf);assert(r.ok&&r.composed,JSON.stringify(r.problems));
 r=b.api.add(otherBuf);assert(r.ok&&r.composed,JSON.stringify(r.problems));
 b.installLauncher();r=b.api.add(b.manifest);assert(r.ok&&r.composed,JSON.stringify(r.problems));
 var ca=fs.readFileSync(path.join(a.dir,'carplay')),cb=fs.readFileSync(path.join(b.dir,'carplay'));
 checks.push('real: both orders compose the same executable ('+sha(ca)+')');
 assert(ca.equals(cb));assert.strictEqual(ca.length,patch.candidate.size);
 [a,b].forEach(function(u,i){var s=u.manager.prepare();assert.strictEqual(s.selected,'composed',JSON.stringify(s));});
 checks.push('real: the manager selects the composed executable in both orders');
 function tamper(u,offset,why){
  var file=path.join(u.dir,'carplay'),rec=JSON.parse(fs.readFileSync(path.join(u.dir,'composed.json'))),keep=fs.readFileSync(file),bad=Buffer.from(keep);
  // the copy, its record and the commit point all made to agree, so only the byte comparison can refuse it
  var exp=path.join(u.dir,'expected.sha256'),expKeep=fs.readFileSync(exp,'utf8');
  bad[offset]^=1;fs.writeFileSync(file,bad);var recKeep=JSON.stringify(rec);rec.candidate.sha256=sha(bad);fs.writeFileSync(path.join(u.dir,'composed.json'),JSON.stringify(rec));
  fs.writeFileSync(exp,expKeep.split(sha(keep)).join(sha(bad)));
  var s=u.manager.prepare();assert.strictEqual(s.selected,'own');assert.strictEqual(s.composed,why);
  fs.writeFileSync(file,keep);fs.writeFileSync(path.join(u.dir,'composed.json'),recKeep);fs.writeFileSync(exp,expKeep);
 }
 tamper(a,patch.edits[0].offset,'differs_outside_other_regions');
 tamper(a,patch.edits[1].offset+2,'differs_outside_other_regions');
 tamper(a,patch.candidate.size-1,'differs_outside_other_regions');
 tamper(a,0x1000,'differs_outside_other_regions');
 var otherRegion=JSON.parse(otherBuf).regions[0];
 tamper(a,otherRegion.offset,'other_region_record_mismatch');
 checks.push('real: a byte changed in this patch\'s regions, its payload, outside every region or in another patch\'s region falls back to the installed copy');
 assert.strictEqual(a.manager.prepare().selected,'composed');
 // removal: this patch's drop-in goes before it unregisters; the other stays composed without it
 fs.unlinkSync(a.launcher);r=a.api.remove('idrive7-carplay-multitouch');assert(r.ok&&r.composed,JSON.stringify(r));
 var left=fs.readFileSync(path.join(a.dir,'carplay'));assert.strictEqual(left.length,patch.original.size);
 patch.edits.forEach(function(e){assert(left.slice(e.offset,e.offset+e.beforeHex.length/2).equals(factory.slice(e.offset,e.offset+e.beforeHex.length/2)));});
 checks.push('real: removing this patch restores its regions and drops its payload; the other patch stays composed');
 r=b.api.remove(JSON.parse(otherBuf).id);assert(r.ok&&!r.composed&&!fs.existsSync(path.join(b.dir,'carplay')),JSON.stringify(r));
 var s=b.manager.prepare();assert.strictEqual(s.selected,'own');assert.strictEqual(s.composed,'no_composition');
 checks.push('real: removing the other patch leaves this one to its own installed copy');
}
real();
fs.rmSync?fs.rmSync(tmp,{recursive:true,force:true}):cp.execFileSync('rm',['-rf',tmp]);
console.log(JSON.stringify({passed:true,checks:checks,skipped:skipped,scope:'Synthetic manifest and service-override fixtures; the real composition only with CARPLAY_BIN, MGU_STORE_DIR and OTHER_MANIFEST.'},null,2));
