'use strict';
var assert=require('assert'),crypto=require('crypto'),backend=require('./backend');
function sha(b){return crypto.createHash('sha256').update(b).digest('hex');}
var original=Buffer.from('Synthetic firmware fixture; no BMW code'),expected=sha(original),checks=[];
function file(b){return {size:b.length,data:b.toString('base64'),sha256:sha(b),uid:0,gid:0,mode:493};}
function backup(){return {format:'mgu-carplay-backup',version:1,originalSha256:expected,state:{wasInstalled:false},files:{'usr/bin/carplay':file(original),'lib/systemd/system/carplay.service':file(Buffer.from('Synthetic factory service'))}};}
function test(n,fn){fn();checks.push(n);}
function rejects(change){var b=backup();change(b);assert.throws(function(){backend.validateBackup(b,expected);});}
test('valid factory rollback bundle',function(){assert.strictEqual(backend.validateBackup(backup(),expected).wasInstalled,false);});
test('corrupt data refuses restore',function(){rejects(function(b){b.files['usr/bin/carplay'].data=Buffer.from('damaged').toString('base64');});});
test('path traversal refused',function(){rejects(function(b){b.files['../../etc/passwd']=file(original);});});
test('unexpected valid-hash file refused',function(){rejects(function(b){b.files['etc/shadow']=file(original);});});
test('noncanonical base64 refused',function(){rejects(function(b){b.files['usr/bin/carplay'].data+='\n';});});
test('missing original refused',function(){rejects(function(b){delete b.files['usr/bin/carplay'];});});
test('unsupported firmware refused',function(){rejects(function(b){b.originalSha256='0'.repeat(64);});});
test('inconsistent installed state refused',function(){rejects(function(b){b.state.wasInstalled=true;});});
test('unowned installation data refused',function(){rejects(function(b){b.files['var/opt/mgu-carplay-multitouch/manager.js']=file(original);});});
test('oversized item refused',function(){rejects(function(b){b.files['usr/bin/carplay'].size=100*1024*1024;});});
test('prototype property refused',function(){rejects(function(b){Object.defineProperty(b.files,'__proto__',{value:file(original),enumerable:true});});});
test('old/unknown format refused',function(){rejects(function(b){b.version=2;});});
console.log(JSON.stringify({passed:true,groups:checks.length,checks:checks}));
