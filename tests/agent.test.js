'use strict';
// Synthetic filesystem and service fixtures. No vehicle/firmware required.
var assert=require('assert'),fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
var base=path.resolve(__dirname,'..'),source=fs.readFileSync(base+'/agent.js','utf8'),checks=[];
function hash(b){return crypto.createHash('sha256').update(b).digest('hex');}
function fixture(){
 var root='/var/opt/mgu-carplay-multitouch',drop='/etc/systemd/system/carplay.service.d/60-mgu-carplay-multitouch.conf';
 var original=Buffer.from('synthetic original'),candidate=Buffer.from('synthetic candidate');
 var patch={original:{sha256:hash(original)},candidate:{sha256:hash(candidate)},metricsAddress:5637648};
 var files={},dirs={'/var/opt':true,'/etc/systemd/system/carplay.service.d':true},calls=[],state={ro:true,voltage:14500};
 files['/usr/bin/carplay']=original;
 files['/proc/123/exe']=original;
 files['/lib/systemd/system/carplay.service']=Buffer.from('[Service]\nExecStart=/usr/bin/carplay -c /etc/cinemo/cinemo_options.xml\nOnFailure=mediaddpserver_kill.service\n');
 function err(){var e=Error('missing');e.code='ENOENT';throw e;}
 var fake={lstatSync:function(p){if(!files[p]&&!dirs[p])err();return {uid:0,mode:493,isDirectory:function(){return !!dirs[p];},isFile:function(){return !!files[p];},isSymbolicLink:function(){return false;}};},
  readFileSync:function(p,enc){var b;if(p==='/proc/mounts')b=Buffer.from('/dev/root / ext4 '+(state.ro?'ro':'rw')+',noatime 0 0\n');else if(p.indexOf(base)===0)b=fs.readFileSync(p);else b=files[p];if(!b)err();return enc?b.toString():Buffer.from(b);},
  writeFileSync:function(p,data,opts){if(p.indexOf('/etc/')===0&&state.ro)throw Error('root is readonly');if(opts.flag==='wx'&&files[p])throw Error('exists');files[p]=Buffer.from(data);},
  mkdirSync:function(p){if(dirs[p])throw Error('exists');dirs[p]=true;},
  renameSync:function(a,b){if(files[a]){files[b]=files[a];delete files[a];}else{assert(dirs[a]);dirs[b]=true;delete dirs[a];Object.keys(files).forEach(function(p){if(p.indexOf(a+'/')===0){files[b+p.slice(a.length)]=files[p];delete files[p];}});}},
  openSync:function(){return 1;},fsyncSync:function(){},closeSync:function(){},
  readdirSync:function(p){return Object.keys(files).filter(function(n){return path.posix.dirname(n)===p;}).map(function(n){return path.posix.basename(n);});},
  unlinkSync:function(p){if(!files[p])err();delete files[p];},rmdirSync:function(p){delete dirs[p];},readlinkSync:function(){return '/usr/bin/carplay';}};
 var child={execFileSync:function(cmd,args){calls.push([cmd,args]);if(cmd==='mount'){state.ro=args[1]==='remount,ro';return '';}if(cmd==='sync'&&state.failSync)throw Error('fixture sync failure');
  if(cmd==='/usr/bin/node')return JSON.stringify({time:'fixture',value:{AppErrorType:'DF_OK',STAT_MILLI_VOLT_WERT:state.voltage}});
  if(cmd==='systemctl'&&args[0]==='show')return 'MainPID=123\nActiveState=active\nSubState=running\nKillSignal=9\nOnFailure=mediaddpserver_kill.service\nDropInPaths='+(files[drop]?drop:'')+'\nExecStartPre='+root+'/manager.js\n';return '';}};
 var module={exports:{}},context={module:module,exports:module.exports,__dirname:base,Buffer:Buffer,console:console,process:{arch:'x64',platform:'linux',pid:123,getuid:function(){return 0;}},
  require:function(name){if(name==='path')return path.posix;if(name==='fs')return fake;if(name==='child_process')return child;if(name==='./patch/patch.json')return patch;if(name==='./patch/patcher')return {verifyOriginal:function(b){return b.equals(original);},verifyPatched:function(b){return b.equals(candidate);},apply:function(b){assert(b.equals(original));return Buffer.from(candidate);}};return require(name);}};
 vm.runInNewContext(source,context,{filename:'agent.js'});
 return {api:module.exports,files:files,dirs:dirs,state:state,calls:calls,root:root,drop:drop,original:original};
}
function test(name,fn){fn();checks.push(name);}
test('matching profile passes without root write',function(){var f=fixture();assert(f.api.preflight().rootReadOnly);assert(!f.calls.length);});
test('unsupported factory refused before writes',function(){var f=fixture();f.files['/usr/bin/carplay']=Buffer.from('different');assert.throws(function(){f.api.install();},/Unsupported factory/);assert(!f.files[f.drop]);assert(!f.calls.length);});
test('low voltage prevents persistent changes',function(){var f=fixture();f.state.voltage=12100;assert.throws(function(){f.api.install();},/13.0/);assert(!f.dirs[f.root]);assert(f.state.ro);});
test('foreign overrides are preserved and installation refused',function(){var f=fixture();f.files['/etc/systemd/system/carplay.service.d/other.conf']=Buffer.from('other');assert.throws(function(){f.api.install();},/Other CarPlay override/);assert(f.state.ro);});
test('root readonly restored even after write action fails',function(){var f=fixture();assert.throws(function(){f.api.rootWrite(function(){throw Error('fixture write failure');});},/fixture/);assert(f.state.ro);assert.strictEqual(f.calls.filter(function(c){return c[0]==='mount';}).length,2);});
test('root readonly remount is attempted even if sync fails',function(){var f=fixture();f.state.failSync=true;assert.throws(function(){f.api.rootWrite(function(){});},/sync failure/);assert(f.state.ro);});
test('install writes a separate candidate and only owned dropin',function(){var f=fixture(),r=f.api.install();assert.strictEqual(r.state,'installed-for-next-boot');assert(r.originalUnchanged);assert(f.files[f.drop]);assert(f.files[f.root+'/carplay']);assert(f.files['/usr/bin/carplay'].equals(f.original));assert(f.state.ro);});
test('same installation is idempotent',function(){var f=fixture();f.api.install();assert.strictEqual(f.api.install().state,'already-installed');});
test('modified dropin refuses uninstall',function(){var f=fixture();f.api.install();f.files[f.drop]=Buffer.from('changed');assert.throws(function(){f.api.uninstall();},/Drop-in changed/);assert(f.files[f.drop]);});
test('unknown files prevent destructive uninstall',function(){var f=fixture();f.api.install();f.files[f.root+'/unrelated']=Buffer.from('preserve');assert.throws(function(){f.api.uninstall();},/Unexpected file/);assert(f.files[f.drop]);});
test('uninstall removes owned files and preserves original executable',function(){var f=fixture();f.api.install();var r=f.api.uninstall();assert(r.factoryUnchanged);assert(!f.files[f.drop]);assert(!f.dirs[f.root]);assert(f.files['/usr/bin/carplay'].equals(f.original));assert(f.state.ro);});
console.log(JSON.stringify({passed:true,checks:checks,scope:'Synthetic install/removal/remount/power fixtures; no vehicle access.'},null,2));
