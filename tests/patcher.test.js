'use strict';
var assert=require('assert'),patcher=require('../patch/patcher');
var input=Buffer.from('own synthetic executable fixture'),after=Buffer.from(input),tail=Buffer.from('own appended payload');
after[3]=0x7f;
var expected=Buffer.concat([after,tail]);
var patch={format:'mgu-multitouch-delta-v1',original:{size:input.length,sha256:patcher.sha256(input)},candidate:{size:expected.length,sha256:patcher.sha256(expected)},
 edits:[{offset:3,beforeHex:input.slice(3,4).toString('hex'),afterHex:'7f'}],append:{offset:input.length,dataBase64:tail.toString('base64')}};
function clone(){return JSON.parse(JSON.stringify(patch));}
assert(patcher.apply(input,patch).equals(expected));
assert.strictEqual(input[3],Buffer.from('own synthetic executable fixture')[3]);
assert(patcher.verifyOriginal(input,patch));assert(patcher.verifyPatched(expected,patch));
assert.throws(function(){patcher.apply(expected,patch);});
assert.throws(function(){patcher.apply(Buffer.from('wrong'),patch);});
var wrong=clone();wrong.append.dataBase64=Buffer.from('bad appended payload').toString('base64');assert.throws(function(){patcher.apply(input,wrong);});
wrong=clone();wrong.candidate.sha256='0'.repeat(64);assert.throws(function(){patcher.apply(input,wrong);});
wrong=clone();wrong.edits.push(wrong.edits[0]);assert.throws(function(){patcher.apply(input,wrong);});
wrong=clone();wrong.edits[0].offset=input.length;assert.throws(function(){patcher.apply(input,wrong);});
wrong=clone();wrong.edits[0].beforeHex='zz';assert.throws(function(){patcher.apply(input,wrong);});
wrong=clone();wrong.edits[0].beforeHex='00';assert.throws(function(){patcher.apply(input,wrong);});
console.log('PASS synthetic delta reconstruction, immutability, identity, bounds, overlap and corruption checks');
