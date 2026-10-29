'use strict';
var fs=require('fs'),vm=require('vm'),path=require('path'),crypto=require('crypto'),assert=require('assert');
var source=fs.readFileSync(__dirname+'/backend.js','utf8'),checks=[];
function sha(b){return crypto.createHash('sha256').update(b).digest('hex');}
function fixture(){
 var root='/var/opt/mgu-carplay-multitouch',drop='/etc/systemd/system/carplay.service.d/60-mgu-carplay-multitouch.conf';
 var original=Buffer.from('fixture-original'),candidate=Buffer.from('fixture-candidate'),manager=Buffer.from('fixture-manager'),unit=Buffer.from('fixture-unit'),calls=[],files={};
 files['/usr/bin/carplay']=original;files['/lib/systemd/system/carplay.service']=unit;files[drop]=Buffer.from('fixture-drop');files[root+'/carplay']=candidate;files[root+'/manager.js']=manager;
 var metadata={package:'idrive7-carplay-multitouch',originalSha256:sha(original),candidateSha256:sha(candidate),managerSha256:sha(manager),dropinSha256:sha(files[drop])};files[root+'/install.json']=Buffer.from(JSON.stringify(metadata));
 files[root+'/pending.json']=Buffer.from('{"bootId":"old"}');files[root+'/disabled.json']=Buffer.from('{"reason":"old"}');var installed=true;
 function absent(){var e=Error('absent');e.code='ENOENT';throw e;}
 var fake={lstatSync:function(p){if(p===root)return {uid:0,mode:16877,isFile:function(){return false;},isSymbolicLink:function(){return false;}};if(!files[p])absent();return {uid:0,gid:0,mode:33188,isFile:function(){return true;},isSymbolicLink:function(){return false;}};},
  readFileSync:function(p,encoding){if(!files[p])absent();return encoding?files[p].toString():Buffer.from(files[p]);},
  renameSync:function(a,b){calls.push('rename:'+a);if(!files[a])absent();files[b]=files[a];delete files[a];}};
 var agent={preflight:function(){calls.push('preflight');return {originalSha256:sha(original)};},status:function(){return {installed:installed,metadata:metadata};},install:function(){calls.push('install');installed=true;return {state:'installed'};},uninstall:function(){calls.push('uninstall');installed=false;return {state:'removed'};}};
 var child={execFileSync:function(c,a){calls.push('exec:'+c);if(c==='/usr/bin/node')return JSON.stringify({value:{AppErrorType:'DF_OK',STAT_MILLI_VOLT_WERT:14500}});return '';},spawn:function(){calls.push('spawn');return {unref:function(){}};}};
 var module={exports:{}},context={module:module,exports:module.exports,__dirname:'/tmp/gui-test/gui',Buffer:Buffer,console:console,process:{getuid:function(){return 0;},arch:'x64',argv:[]},require:function(n){if(n==='fs')return fake;if(n==='path')return path.posix;if(n==='child_process')return child;if(n==='crypto')return crypto;if(n==='../agent')return agent;if(n==='../patch/patch.json')return {original:{sha256:sha(original)},candidate:{sha256:sha(candidate)}};throw Error(n);}};
 vm.runInNewContext(source,context);return {api:module.exports,files:files,calls:calls,root:root,drop:drop,original:original};
}
function test(n,f){f();checks.push(n);}
test('rearm archives old pending/disable without prepare or warm restart',function(){var f=fixture();f.api.run('install');assert(!f.files[f.root+'/pending.json']&&!f.files[f.root+'/disabled.json']);assert(f.calls.indexOf('install')===0);assert(f.calls.filter(function(x){return x.indexOf('exec:')===0;}).every(function(x){return x==='exec:sync';}));});
test('changed candidate refuses rearm before removing safety markers',function(){var f=fixture();f.files[f.root+'/carplay']=Buffer.from('corrupt');assert.throws(function(){f.api.run('install');});assert(f.files[f.root+'/pending.json']&&f.files[f.root+'/disabled.json']);});
test('backup includes original, configuration and both markers',function(){var f=fixture(),b=f.api.run('backup');assert(b.files['usr/bin/carplay']&&b.files[f.drop.slice(1)]&&b.files[(f.root+'/pending.json').slice(1)]);assert.strictEqual(b.state.wasInstalled,true);});
test('damaged owned candidate can be backed up before safe uninstall',function(){var f=fixture();f.files[f.root+'/carplay']=Buffer.from('damaged');var b=f.api.run('backup');assert.strictEqual(b.files[(f.root+'/carplay').slice(1)].sha256,sha(Buffer.from('damaged')));});
test('restore patched state recreates verified installation, not archived code',function(){var f=fixture(),b=f.api.run('backup');f.files['/tmp/gui-test/gui/restore.json']=Buffer.from(JSON.stringify(b));f.calls.length=0;f.api.run('restore');assert.deepEqual(f.calls,['preflight','uninstall','install']);});
test('restore factory state removes only own installation',function(){var f=fixture(),b=f.api.run('backup');Object.keys(b.files).forEach(function(n){if(n.indexOf('var/opt/')===0||n.indexOf('etc/systemd/')===0)delete b.files[n];});b.state.wasInstalled=false;f.files['/tmp/gui-test/gui/restore.json']=Buffer.from(JSON.stringify(b));f.calls.length=0;f.api.run('restore');assert.deepEqual(f.calls,['preflight','uninstall']);});
test('tampered restore never invokes install/uninstall',function(){var f=fixture(),b=f.api.run('backup');b.files['usr/bin/carplay'].sha256='0'.repeat(64);f.files['/tmp/gui-test/gui/restore.json']=Buffer.from(JSON.stringify(b));f.calls.length=0;assert.throws(function(){f.api.run('restore');});assert.deepEqual(f.calls,[]);});
console.log(JSON.stringify({passed:true,groups:checks.length,checks:checks}));
