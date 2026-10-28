'use strict';
var someip=require('/usr/lib/someip.node');
var cfg={name:'DiagSysInfraEnv',serviceId:65174,version:{major:0,minor:1},instances:{Inst1:128},methods:{StatusVersorgungsspannung:{id:7,schema:{t:'Struct',e:[{n:'handleIn',t:'UInt32'}]},retSchema:{t:'Struct',e:[{n:'AppErrorType',t:'Enum',e:{DF_OK:256,DF_E_INPUT_PARAMS_OUT_OF_RANGE:257,DF_E_CONDITIONS_NOT_CORRECT:258,DF_E_REQUEST_SEQUENCE_ERROR:259,DF_E_APP_ERROR:260,DF_E_RID_NOT_SUPPORTED:261,DF_E_COMMUNICATION_ERROR:576}},{n:'handleOut',t:'UInt32'},{n:'STAT_MILLI_VOLT_WERT',t:'UInt16'}]}}},fields:{},events:{},eventGroups:{fields:{},events:{}}};
var timer=setTimeout(function(){process.stderr.write('Voltage getter timeout\n');process.exit(2);},7000);
setImmediate(function(){
 someip.buildProxy(cfg,'Inst1').then(function(p){return p.init().then(function(){
  return new Promise(function(resolve,reject){
   var started=Date.now();
   function poll(){if(p.isAvailable&&p.isAvailable())resolve();else if(Date.now()-started>3500)reject(Error('LevelMonitor unavailable'));else setTimeout(poll,150);}
   poll();
  }).then(function(){return p.callMethod('StatusVersorgungsspannung',{handleIn:0},2000);}).then(function(value){
   clearTimeout(timer);process.stdout.write(JSON.stringify({time:new Date().toISOString(),field:'DiagSysInfraEnv.StatusVersorgungsspannung',value:value})+'\n');
   return Promise.resolve(p.shutdown&&p.shutdown()).then(function(){process.exit(0);});
  });
 });}).catch(function(e){process.stderr.write(String(e)+'\n');process.exit(1);});
});
