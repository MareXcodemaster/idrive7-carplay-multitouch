'use strict';
// Pure local delta patcher. Node.js 8 or later; no dependencies or network access.
var crypto=require('crypto');
var FORMAT='mgu-multitouch-delta-v1';
var MAX_SIZE=64*1024*1024;

function sha256(buffer){
 if(!Buffer.isBuffer(buffer))throw Error('Expected a Buffer');
 return crypto.createHash('sha256').update(buffer).digest('hex');
}
function integer(value){return typeof value==='number'&&isFinite(value)&&Math.floor(value)===value&&value>=0;}
function hash(value){return typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);}
function hex(value){return typeof value==='string'&&value.length>0&&value.length%2===0&&/^[0-9a-f]+$/.test(value);}
function validatePatch(patch){
 if(!patch||patch.format!==FORMAT)throw Error('Unsupported patch format');
 ['original','candidate'].forEach(function(key){
  var item=patch[key];
  if(!item||!hash(item.sha256)||!integer(item.size)||!item.size||item.size>MAX_SIZE)throw Error('Invalid '+key+' identity');
 });
 if(patch.candidate.size<=patch.original.size)throw Error('Candidate must include an appended payload');
 if(!Array.isArray(patch.edits)||!patch.edits.length||patch.edits.length>32)throw Error('Invalid edit list');
 var previousEnd=0;
 patch.edits.forEach(function(edit){
  if(!edit||!integer(edit.offset)||!hex(edit.beforeHex)||!hex(edit.afterHex)||edit.beforeHex.length!==edit.afterHex.length)throw Error('Invalid replacement');
  var size=edit.beforeHex.length/2;
  if(size>4096||edit.offset<previousEnd||edit.offset+size>patch.original.size)throw Error('Overlapping, unsorted or out-of-range replacement');
  previousEnd=edit.offset+size;
 });
 var append=patch.append;
 if(!append||append.offset!==patch.original.size||typeof append.dataBase64!=='string'||!append.dataBase64.length||append.dataBase64.length>MAX_SIZE*4/3+4||!/^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(append.dataBase64))throw Error('Invalid appended payload');
 var data=Buffer.from(append.dataBase64,'base64');
 if(data.toString('base64')!==append.dataBase64||append.offset+data.length!==patch.candidate.size)throw Error('Appended payload size or encoding mismatch');
 return patch;
}
function verifyOriginal(buffer,patch){
 validatePatch(patch);
 return Buffer.isBuffer(buffer)&&buffer.length===patch.original.size&&sha256(buffer)===patch.original.sha256;
}
function verifyPatched(buffer,patch){
 validatePatch(patch);
 return Buffer.isBuffer(buffer)&&buffer.length===patch.candidate.size&&sha256(buffer)===patch.candidate.sha256;
}
function apply(buffer,patch){
 validatePatch(patch);
 if(!verifyOriginal(buffer,patch))throw Error('Unsupported original CarPlay executable: exact size and SHA-256 are required');
 var result=Buffer.alloc(patch.candidate.size);
 buffer.copy(result);
 patch.edits.forEach(function(edit){
  var before=Buffer.from(edit.beforeHex,'hex');
  if(!buffer.slice(edit.offset,edit.offset+before.length).equals(before))throw Error('Original replacement bytes do not match');
  Buffer.from(edit.afterHex,'hex').copy(result,edit.offset);
 });
 Buffer.from(patch.append.dataBase64,'base64').copy(result,patch.append.offset);
 if(!verifyPatched(result,patch))throw Error('Patched result checksum mismatch');
 return result;
}
module.exports={apply:apply,verifyOriginal:verifyOriginal,verifyPatched:verifyPatched,validatePatch:validatePatch,sha256:sha256};

if(require.main===module){
 var fs=require('fs'),path=require('path'),args=process.argv.slice(2);
 try{
  if((args[0]!=='check'&&args[0]!=='apply')||!args[1]||(args[0]==='check'?args.length!==2:args.length!==3))throw Error('Usage: node patcher.js check <carplay> | apply <original-carplay> <new-output>');
  var patch=JSON.parse(fs.readFileSync(path.join(__dirname,'patch.json'),'utf8'));
  var input=fs.readFileSync(args[1]);
  if(args[0]==='check'){
   var state=verifyOriginal(input,patch)?'supported-original':verifyPatched(input,patch)?'already-patched':'unsupported';
   process.stdout.write(JSON.stringify({state:state,sha256:sha256(input),bytes:input.length})+'\n');
   if(state==='unsupported')process.exitCode=2;
  }else{
   var output=apply(input,patch);
   // Exclusive creation prevents overwriting a factory executable or a symlink.
   fs.writeFileSync(args[2],output,{flag:'wx',mode:493});
   process.stdout.write(JSON.stringify({state:'created',sha256:sha256(output),bytes:output.length})+'\n');
  }
 }catch(error){process.stderr.write(String(error.message||error)+'\n');process.exitCode=1;}
}
