'use strict';
// Synthetic filesystem and service fixtures. No vehicle/firmware required.
var assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
var base=path.resolve(__dirname,'..'),source=fs.readFileSync(base+'/agent.js','utf8'),checks=[];
var COMPOSER_DROP='/etc/systemd/system/carplay.service.d/50-mgu-carplay-patch.conf',DEPLOY='/var/opt/mgu-deploy/mgu-deploy.sh';
var REGISTERED='/var/opt/mgu-carplay-patch/patches/idrive7-carplay-multitouch.json';
function hash(b){return crypto.createHash('sha256').update(b).digest('hex');}
function fixture(opts){
 opts=opts||{};
 var root='/var/opt/mgu-carplay-multitouch',drop='/etc/systemd/system/carplay.service.d/60-mgu-carplay-multitouch.conf';
 var original=Buffer.from('synthetic original'),candidate=Buffer.from('synthetic candidate'),manifest=Buffer.from('{"synthetic":"manifest"}\n');
 var patch={original:{sha256:hash(original)},candidate:{sha256:hash(candidate)},metricsAddress:5637648};
 var files={},dirs={'/var/opt':true,'/etc/systemd/system/carplay.service.d':true},calls=[],state={ro:true,voltage:14500,deploy:0};
 files['/usr/bin/carplay']=original;
 files['/proc/123/exe']=original;
 files['/lib/systemd/system/carplay.service']=Buffer.from('[Service]\nExecStart=/usr/bin/carplay -c /etc/cinemo/cinemo_options.xml\nOnFailure=mediaddpserver_kill.service\n');
 if(opts.deploy)files[DEPLOY]=Buffer.from('#!/bin/sh\n');
 function err(){var e=Error('missing');e.code='ENOENT';throw e;}
 var fake={lstatSync:function(p){if(!files[p]&&!dirs[p])err();return {uid:0,mode:493,isDirectory:function(){return !!dirs[p];},isFile:function(){return !!files[p];},isSymbolicLink:function(){return false;}};},
  readFileSync:function(p,enc){var b;if(p==='/proc/mounts')b=Buffer.from('/dev/root / ext4 '+(state.ro?'ro':'rw')+',noatime 0 0\n');else if(p.indexOf(base)===0)b=fs.readFileSync(p);else b=files[p];if(!b)err();return enc?b.toString():Buffer.from(b);},
  writeFileSync:function(p,data,opts){if(p.indexOf('/etc/')===0&&state.ro)throw Error('root is readonly');if(opts.flag==='wx'&&files[p])throw Error('exists');files[p]=Buffer.from(data);},
  mkdirSync:function(p){if(dirs[p])throw Error('exists');dirs[p]=true;},
  renameSync:function(a,b){if(files[a]){files[b]=files[a];delete files[a];}else{assert(dirs[a]);dirs[b]=true;delete dirs[a];Object.keys(files).forEach(function(p){if(p.indexOf(a+'/')===0){files[b+p.slice(a.length)]=files[p];delete files[p];}});}},
  openSync:function(){return 1;},fsyncSync:function(){},closeSync:function(){},
  readdirSync:function(p){return Object.keys(files).filter(function(n){return path.posix.dirname(n)===p;}).map(function(n){return path.posix.basename(n);});},
  unlinkSync:function(p){if(!files[p])err();delete files[p];},rmdirSync:function(p){delete dirs[p];},readlinkSync:function(){return '/usr/bin/carplay';}};
 var child={execFileSync:function(cmd,args){calls.push([cmd,args,{drop:!!files[drop],installed:!!files[root+'/install.json']}]);if(cmd==='mount'){state.ro=args[1]==='remount,ro';return '';}if(cmd==='sync'&&state.failSync)throw Error('fixture sync failure');
  if(cmd==='/usr/bin/node')return JSON.stringify({time:'fixture',value:{AppErrorType:'DF_OK',STAT_MILLI_VOLT_WERT:state.voltage}});
  if(cmd==='/bin/sh'&&args[0]===DEPLOY){if(state.oldDeploy){var o=Error('Command failed');o.status=2;o.stderr='mgu-deploy: unknown command carplay-patch\n';throw o;}
   if(state.deploy){var e=Error('Command failed');e.status=state.deploy;e.stdout='mgu-deploy: '+(state.deploy===2?'refused':'failed')+'\n';throw e;}return 'CarPlay: composed\n';}
  if(cmd==='systemctl'&&args[0]==='show')return 'MainPID=123\nActiveState=active\nSubState=running\nKillSignal=9\nOnFailure=mediaddpserver_kill.service\nDropInPaths='+(files[drop]?drop:'')+'\nExecStartPre='+root+'/manager.js\n';return '';}};
 var module={exports:{}},context={module:module,exports:module.exports,__dirname:base,Buffer:Buffer,console:console,process:{arch:'x64',platform:'linux',pid:123,getuid:function(){return 0;}},
  require:function(name){if(name==='path')return path.posix;if(name==='fs')return fake;if(name==='child_process')return child;if(name==='./patch/patch.json')return patch;if(name==='./patch/patcher')return {verifyOriginal:function(b){return b.equals(original);},verifyPatched:function(b){return b.equals(candidate);},apply:function(b){assert(b.equals(original));return Buffer.from(candidate);}};
   if(name==='./patch/composable')return {toManifest:function(p){assert.strictEqual(p,patch);return Buffer.from(manifest);}};return require(name);}};
 vm.runInNewContext(source,context,{filename:'agent.js'});
 function deployCalls(){return calls.filter(function(c){return c[0]==='/bin/sh'&&c[1][0]===DEPLOY;});}
 return {api:module.exports,files:files,dirs:dirs,state:state,calls:calls,root:root,drop:drop,original:original,manifest:manifest,deployCalls:deployCalls};
}
// A 0.1.0 to 0.2.2 installation: no manifest copy, no registration in install.json.
function legacyInstall(f){
 var oldDrop=Buffer.from('[Service]\nExecStart=\nExecStart=/bin/sh -c legacy\n'),manager=Buffer.from('legacy manager');
 f.dirs[f.root]=true;f.files[f.drop]=oldDrop;f.files[f.root+'/carplay']=Buffer.from('synthetic candidate');f.files[f.root+'/manager.js']=manager;f.files[f.root+'/factory-unit.txt']=Buffer.from('unit');
 f.files[f.root+'/install.json']=Buffer.from(JSON.stringify({package:'idrive7-carplay-multitouch',version:'0.1.0',dropinSha256:hash(oldDrop),managerSha256:hash(manager)}));
}
function test(name,fn){fn();checks.push(name);}
test('matching profile passes without root write',function(){var f=fixture();assert(f.api.preflight().rootReadOnly);assert(!f.calls.length);});
test('unsupported factory refused before writes',function(){var f=fixture();f.files['/usr/bin/carplay']=Buffer.from('different');assert.throws(function(){f.api.install();},/Unsupported factory/);assert(!f.files[f.drop]);assert(!f.calls.length);});
test('low voltage prevents persistent changes',function(){var f=fixture();f.state.voltage=12100;assert.throws(function(){f.api.install();},/13.0/);assert(!f.dirs[f.root]);assert(f.state.ro);});
test('foreign overrides are preserved and installation refused',function(){var f=fixture();f.files['/etc/systemd/system/carplay.service.d/other.conf']=Buffer.from('other');assert.throws(function(){f.api.install();},/Other CarPlay override/);assert(f.state.ro);});
test('root readonly restored even after write action fails',function(){var f=fixture();assert.throws(function(){f.api.rootWrite(function(){throw Error('fixture write failure');});},/fixture/);assert(f.state.ro);assert.strictEqual(f.calls.filter(function(c){return c[0]==='mount';}).length,2);});
test('root readonly remount is attempted even if sync fails',function(){var f=fixture();f.state.failSync=true;assert.throws(function(){f.api.rootWrite(function(){});},/sync failure/);assert(f.state.ro);});
test('install writes a separate candidate and only owned dropin',function(){var f=fixture(),r=f.api.install();assert.strictEqual(r.state,'installed-for-next-boot');assert(r.originalUnchanged);assert(f.files[f.drop]);assert(f.files[f.root+'/carplay']);assert(f.files['/usr/bin/carplay'].equals(f.original));assert(f.state.ro);
 assert.deepEqual(Object.keys(f.files).filter(function(p){return p.indexOf('/etc/')===0;}),[f.drop]);});
test('same installation is idempotent',function(){var f=fixture();f.api.install();assert.strictEqual(f.api.install().state,'already-installed');});
test('modified dropin refuses uninstall',function(){var f=fixture();f.api.install();f.files[f.drop]=Buffer.from('changed');assert.throws(function(){f.api.uninstall();},/Drop-in changed/);assert(f.files[f.drop]);});
test('unknown files prevent destructive uninstall',function(){var f=fixture();f.api.install();f.files[f.root+'/unrelated']=Buffer.from('preserve');assert.throws(function(){f.api.uninstall();},/Unexpected file/);assert(f.files[f.drop]);});
test('uninstall removes owned files and preserves original executable',function(){var f=fixture();f.api.install();var r=f.api.uninstall();assert(r.factoryUnchanged);assert(!f.files[f.drop]);assert(!f.dirs[f.root]);assert(f.files['/usr/bin/carplay'].equals(f.original));assert(f.state.ro);});

// A CarPlay patch composer beside this patch.
test('the composer launcher drop-in is accepted and never written or removed',function(){
 var f=fixture(),ours=Buffer.from('# mgu-carplay-patch launcher (mgu-deploy carplay-patch). Starts the composed CarPlay\n[Service]\nExecStart=\nExecStart=/bin/sh -c x\n');
 f.files[COMPOSER_DROP]=ours;f.api.install();assert(f.files[COMPOSER_DROP].equals(ours));f.api.uninstall();assert(f.files[COMPOSER_DROP].equals(ours));});
test('a 50-mgu-carplay-patch.conf without the composer marker is refused',function(){var f=fixture();f.files[COMPOSER_DROP]=Buffer.from('[Service]\nExecStart=\nExecStart=/opt/x\n');assert.throws(function(){f.api.install();},/Other CarPlay override present: .*50-mgu-carplay-patch/);assert(!f.files[f.drop]);});
test('the marker under another name is refused',function(){var f=fixture();f.files['/etc/systemd/system/carplay.service.d/70-x.conf']=Buffer.from('# mgu-carplay-patch launcher\n');assert.throws(function(){f.api.install();},/Other CarPlay override present: .*70-x/);});
test('without a composer the manifest is registered as a file and recorded in install.json',function(){
 var f=fixture(),r=f.api.install(),meta=JSON.parse(f.files[f.root+'/install.json']);
 assert.strictEqual(r.registration.state,'registered');assert.strictEqual(r.registration.via,'file');
 assert(f.files[REGISTERED].equals(f.manifest));assert(f.files[f.root+'/carplay-patch.json'].equals(f.manifest));
 assert.strictEqual(meta.composableManifestSha256,hash(f.manifest));assert.strictEqual(meta.version,'0.3.0');assert(!f.deployCalls().length);});
test('without a composer uninstall removes the registration it wrote, after its drop-in',function(){
 var f=fixture();f.api.install();var r=f.api.uninstall();assert.strictEqual(r.registration.state,'unregistered');assert(!f.files[REGISTERED]);assert(!f.files[f.drop]);});
test('a registration someone else changed is kept on uninstall',function(){
 var f=fixture();f.api.install();f.files[REGISTERED]=Buffer.from('{"changed":true}');var r=f.api.uninstall();assert.strictEqual(r.registration.state,'kept');assert(f.files[REGISTERED]);assert(!f.dirs[f.root]);});
test('with mgu-deploy the manifest is registered through it, once the drop-in is in place',function(){
 var f=fixture({deploy:true}),r=f.api.install(),c=f.deployCalls();
 assert.strictEqual(c.length,1);assert.deepEqual(c[0][1],[DEPLOY,'carplay-patch','add',f.root+'/carplay-patch.json']);assert(c[0][2].drop);
 assert.strictEqual(r.registration.state,'registered');assert.strictEqual(r.registration.via,'mgu-deploy');assert(!f.files[REGISTERED]);});
test('a composer refusal leaves the multitouch-only installation in place',function(){
 var f=fixture({deploy:true});f.state.deploy=2;var r=f.api.install();assert.strictEqual(r.state,'installed-for-next-boot');assert.strictEqual(r.registration.state,'refused');assert(f.files[f.drop]&&f.files[f.root+'/carplay']);});
test('with mgu-deploy uninstall unregisters after the drop-in is gone and before its files go',function(){
 var f=fixture({deploy:true});f.api.install();f.calls.length=0;var r=f.api.uninstall(),c=f.deployCalls();
 assert.strictEqual(c.length,1);assert.deepEqual(c[0][1],[DEPLOY,'carplay-patch','remove','idrive7-carplay-multitouch']);assert(!c[0][2].drop);assert(c[0][2].installed);
 assert.strictEqual(r.registration.state,'unregistered');assert(!f.dirs[f.root]);});
function failedUnregistration(code){
 var f=fixture({deploy:true});f.api.install();var drop=Buffer.from(f.files[f.drop]),kept=Object.keys(f.files).filter(function(p){return p.indexOf(f.root+'/')===0;}).sort();
 f.state.deploy=code;f.calls.length=0;assert.throws(function(){f.api.uninstall();},/Unregistering from the CarPlay patch composer failed: mgu-deploy: .*The multitouch drop-in is back and nothing else was removed; run uninstall again/);
 assert(f.files[f.drop].equals(drop));assert(f.dirs[f.root]);assert.deepEqual(Object.keys(f.files).filter(function(p){return p.indexOf(f.root+'/')===0;}).sort(),kept);assert(f.state.ro);
 var order=f.calls.map(function(c){return c[0]==='/bin/sh'?'remove':c[0]==='systemctl'?'reload:'+(c[2].drop?'with':'without'):null;}).filter(Boolean);
 assert.deepEqual(order,['reload:without','remove','reload:with']);
 f.state.deploy=0;var r=f.api.uninstall();assert.strictEqual(r.registration.state,'unregistered');assert(!f.dirs[f.root]&&!f.files[f.drop]);}
test('a composer failing to unregister puts the drop-in back, keeps everything and fails the uninstall',function(){failedUnregistration(1);});
test('a composer refusing to unregister (another run holds its lock) is handled the same way',function(){failedUnregistration(2);});
test('without mgu-deploy uninstall deletes the registration file as before',function(){
 var f=fixture();f.api.install();assert(f.files[REGISTERED]);var r=f.api.uninstall();assert.strictEqual(r.registration.via,'file');assert.strictEqual(r.registration.state,'unregistered');assert(!f.files[REGISTERED]);assert(!f.dirs[f.root]);assert(!f.deployCalls().length);});
test('an installation from 0.1.0 to 0.2.2 uninstalls without touching the composer',function(){
 var f=fixture({deploy:true});legacyInstall(f);f.files[REGISTERED]=Buffer.from('someone');var r=f.api.uninstall();
 assert.strictEqual(r.registration.state,'never-registered');assert(!f.deployCalls().length);assert(f.files[REGISTERED]);assert(!f.dirs[f.root]&&!f.files[f.drop]);assert(f.state.ro);});
test('an existing installation from 0.1.0 to 0.2.2 is not replaced by install',function(){
 var f=fixture({deploy:true});legacyInstall(f);var before=JSON.stringify(f.files);assert.throws(function(){f.api.install();},/already exists/);assert.strictEqual(JSON.stringify(f.files),before);assert(!f.deployCalls().length);});
test('installing again re-registers the same manifest',function(){
 var f=fixture({deploy:true});f.api.install();f.calls.length=0;var r=f.api.install();assert.strictEqual(r.state,'already-installed');assert.strictEqual(r.registration.state,'registered');assert.strictEqual(f.deployCalls().length,1);});
test('an mgu-deploy without carplay-patch gets the registration as a file, removed again on uninstall',function(){
 var f=fixture({deploy:true});f.state.oldDeploy=true;var r=f.api.install();assert.strictEqual(r.registration.state,'registered');assert.strictEqual(r.registration.via,'file');assert(f.files[REGISTERED].equals(f.manifest));
 var u=f.api.uninstall();assert.strictEqual(u.registration.state,'unregistered');assert.strictEqual(u.registration.via,'file');assert(!f.files[REGISTERED]);});
test('status reports the binary carplay runs and the composer',function(){
 var f=fixture();f.api.install();var s=f.api.status();assert.strictEqual(s.activeBinary,'factory');assert.strictEqual(s.activePatched,false);assert.strictEqual(s.composer.registered,true);assert.strictEqual(s.composer.cli,false);});
console.log(JSON.stringify({passed:true,checks:checks,scope:'Synthetic install/removal/remount/power fixtures; no vehicle access.'},null,2));
