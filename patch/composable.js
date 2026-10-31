'use strict';
// The same delta as a composable CarPlay patch manifest (mgu-carplay-patch-v1), so a
// CarPlay patch composer can build one executable from the factory file, this patch
// and another registered CarPlay patch. Node.js 8 or later; no dependencies.
var crypto=require('crypto'),patcher=require('./patcher');
var ID='idrive7-carplay-multitouch';
var LAUNCHER='/etc/systemd/system/carplay.service.d/60-mgu-carplay-multitouch.conf';
var NAMES=['program-header','touch-report','hid-registration'];

// Deterministic bytes: the composer records their SHA-256, which the manager checks.
function toManifest(patch){
 patcher.validatePatch(patch);
 if(patch.edits.length!==NAMES.length)throw Error('Unexpected edit count');
 var m={format:'mgu-carplay-patch-v1',id:ID,version:patch.release,title:'CarPlay Multitouch',
  requires:{size:patch.original.size,sha256:patch.original.sha256},
  regions:patch.edits.map(function(e,i){return {name:NAMES[i],offset:e.offset,before:e.beforeHex,after:e.afterHex};}),
  append:{name:'payload',offset:patch.append.offset,base64:patch.append.dataBase64},
  launcher:LAUNCHER};
 return Buffer.from(JSON.stringify(m,null,2)+'\n');
}
// Byte ranges [start,end) this patch writes in the composed executable.
function ranges(patch){
 return patch.edits.map(function(e){return [e.offset,e.offset+e.beforeHex.length/2];})
  .concat([[patch.append.offset,patch.candidate.size]]);
}
function sha256(b){return crypto.createHash('sha256').update(b).digest('hex');}
module.exports={ID:ID,LAUNCHER:LAUNCHER,toManifest:toManifest,ranges:ranges,sha256:sha256};

if(require.main===module){
 try{
  if(process.argv[2]!=='manifest'||process.argv.length!==3)throw Error('Usage: node composable.js manifest');
  process.stdout.write(toManifest(require('./patch.json')));
 }catch(error){process.stderr.write(String(error.message||error)+'\n');process.exitCode=1;}
}
