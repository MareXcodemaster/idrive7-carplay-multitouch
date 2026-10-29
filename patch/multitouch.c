/* Experimental MGU CarPlay multitouch payload. No libc and no syscalls.
 * Fixed-offset callers are used only after the exact factory SHA-256 is checked.
 * The factory registration routine copies our temporary descriptor synchronously.
 */
typedef unsigned char u8;
typedef unsigned short u16;
typedef unsigned int u32;
typedef unsigned long long u64;
typedef unsigned long usize;
typedef long isize;
struct Vector { const u8 *begin,*end,*capacity; };
struct Contact { u8 id,pad;u16 x,y,pressure;u32 gesture; };
struct Event { u32 time,pad;const struct Contact *begin,*end,*capacity;u32 source; };
struct Slot { u8 valid,active,id,pad;u16 x,y; };
struct Metrics {
 char magic[8];u32 version,report_bytes;u64 frames,reports;
 u32 max_input_contacts,active_contacts,last_result,descriptor_bytes;
 u8 last_report[13];u8 reserved[3];u32 max_active_contacts,last_input_count;struct Contact raw_input[2];
};
__attribute__((visibility("hidden")))
volatile struct Metrics mt_metrics={{'M','G','U','M','T','0','1',0},1,12,0,0,0,0,0,0,{0},{0}};
static struct Slot slots[2];
static void *owner;
static u16 width=1920,height=720;
static u8 previous[13];
static u8 previous_valid;
extern char payload_anchor[];
static usize image_base(void) {
 usize address;
 __asm__ volatile("lea payload_anchor(%%rip), %0" : "=r"(address));
 return address-PAYLOAD_VADDR;
}
static u16 coord(u16 raw,u16 origin,u16 maximum) {
 int n=(int)raw-(int)origin;
 return n<0?0:n>maximum?maximum:(u16)n;
}
static void put16(u8 *p,u16 n){p[0]=(u8)n;p[1]=(u8)(n>>8);}
static void make_report(u8 out[13]) {
 for(unsigned i=0;i<13;i++)out[i]=0;
 for(unsigned i=0;i<2;i++){
  u8 *p=out+6*i;
  p[0]=(u8)(i+1);
  p[1]=(u8)(slots[i].valid&&slots[i].active);
  put16(p+2,slots[i].x);put16(p+4,slots[i].y);
 }
}
static void emit(void *sink,const u8 out[13]) {
 unsigned i;int same=previous_valid;
 for(i=0;i<13;i++)if(previous[i]!=out[i])same=0;
 if(same)return;
 void *car=*(void **)((u8 *)sink+0x18);
 if(!car)return;
 usize *vtable=*(usize **)car;
 typedef int (*Send)(void *,u32,const u8 *,usize);
 int result=((Send)vtable[0xc0/8])(car,1,out,12);
 mt_metrics.last_result=(u32)result;mt_metrics.reports++;
 for(i=0;i<13;i++){previous[i]=out[i];mt_metrics.last_report[i]=out[i];}
 previous_valid=1;
}
__attribute__((visibility("hidden"),noinline))
void mt_report(void *sink,const struct Event *event) {
 if(!sink||!event)return;
 usize first=(usize)event->begin,last=(usize)event->end;
 if(last<first||(last-first)%sizeof(struct Contact))return;
 usize count=(last-first)/sizeof(struct Contact);
 if(count>32)return;
 if(owner!=sink){owner=sink;previous_valid=0;for(unsigned i=0;i<2;i++)slots[i].valid=0;}
 mt_metrics.frames++;
 mt_metrics.last_input_count=(u32)count;
 for(unsigned i=0;i<2;i++){
  const u8 *p=i<count?(const u8 *)(event->begin+i):0;
  for(unsigned j=0;j<12;j++)((volatile u8 *)&mt_metrics.raw_input[i])[j]=p?p[j]:0;
 }
 if(count>mt_metrics.max_input_contacts)mt_metrics.max_input_contacts=(u32)count;
 u16 ox=*(u16 *)((u8 *)sink+0x40),oy=*(u16 *)((u8 *)sink+0x42);
 int released=0;
 if(!count){for(unsigned i=0;i<2;i++)if(slots[i].valid){slots[i].active=0;released=1;}}
 for(usize n=0;n<count;n++){
  const struct Contact *c=event->begin+n;
  if(c->gesture>2)continue;
  int k=-1;
  for(unsigned i=0;i<2;i++)if(slots[i].valid&&slots[i].id==c->id)k=(int)i;
  if(k<0&&c->gesture!=1){
   for(unsigned i=0;i<2;i++)if(!slots[i].valid){k=(int)i;break;}
   if(k>=0){slots[k].valid=1;slots[k].id=c->id;}
  }
  if(k<0)continue;
  slots[k].x=coord(c->x,ox,width);slots[k].y=coord(c->y,oy,height);
  slots[k].active=c->gesture!=1;
  if(!slots[k].active)released=1;
 }
 u8 report[13];make_report(report);emit(sink,report);
 if(released){
  for(unsigned i=0;i<2;i++)if(slots[i].valid&&!slots[i].active)slots[i].valid=0;
  make_report(report);emit(sink,report);
 }
 unsigned active=0;for(unsigned i=0;i<2;i++)active+=slots[i].valid&&slots[i].active;
 if(active>mt_metrics.max_active_contacts)mt_metrics.max_active_contacts=active;
 mt_metrics.active_contacts=active;*((u8 *)sink+0x4a)=active!=0;
 if(count){
  const u8 *raw=(const u8 *)event->begin;
  for(unsigned i=0;i<12;i++)*((u8 *)sink+0x20+i)=raw[i];
  *((u8 *)sink+0x2c)=1;
 }
}

/* Legacy CarPlay two-transducer layout: index, touch, X, Y for each contact.
 * Determined from the box native decoder. No Contact Count byte. */
static const u8 finger[]={0x05,0x0d,0x09,0x22,0xa1,0x02,0x05,0x0d,0x09,0x38,0x75,0x08,0x95,0x01,0x81,0x02,0x09,0x33,0x15,0x00,0x25,0x01,0x75,0x01,0x95,0x01,0x81,0x02,0x75,0x07,0x95,0x01,0x81,0x01,0x05,0x01,0x09,0x30,0x15,0x00,0x26,0xff,0x7f,0x75,0x10,0x95,0x01,0x81,0x02,0x09,0x31,0x15,0x00,0x26,0xff,0x7f,0x75,0x10,0x95,0x01,0x81,0x02,0xc0};
static const u8 suffix[]={0xc0};
__attribute__((visibility("hidden"),noinline))
void mt_register(void *control,const void *name,u32 country,const struct Vector *original,
 u32 vid,u32 pid,const void *device_name,u32 index) {
 typedef void (*Register)(void *,const void *,u32,const struct Vector *,u32,u32,const void *,u32);
 Register original_register=(Register)(image_base()+0x226e30);
 if(index!=1||!original||original->end-original->begin!=62){
  original_register(control,name,country,original,vid,pid,device_name,index);return;
 }
 width=(u16)(original->begin[0x27]|original->begin[0x28]<<8);
 height=(u16)(original->begin[0x34]|original->begin[0x35]<<8);
 u8 descriptor[6+2*sizeof(finger)+sizeof(suffix)];
 u8 header[]={5,0x0d,9,4,0xa1,1};unsigned pos=0;
 for(unsigned i=0;i<sizeof(header);i++)descriptor[pos++]=header[i];
 for(unsigned n=0;n<2;n++){
  unsigned start=pos;
  for(unsigned i=0;i<sizeof(finger);i++)descriptor[pos++]=finger[i];
  put16(descriptor+start+41,width);put16(descriptor+start+54,height);
 }
 for(unsigned i=0;i<sizeof(suffix);i++)descriptor[pos++]=suffix[i];
 mt_metrics.descriptor_bytes=pos;
 struct Vector vec={descriptor,descriptor+pos,descriptor+pos};
 original_register(control,name,country,&vec,vid,pid,device_name,index);
}
