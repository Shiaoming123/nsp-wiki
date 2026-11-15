const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../public/article-reading.js'),'utf8');
function harness(code){
 const frames=new Map(),listeners=new Map();let sequence=0,cancels=0;
 const target={addEventListener(name,fn){listeners.set(name,fn);},removeEventListener(name,fn){if(listeners.get(name)===fn)listeners.delete(name);}};
 const context=vm.createContext({location:{hash:'#article/test'},scrollY:0,innerHeight:720,document:{...target,hidden:false,documentElement:{scrollHeight:10000}},matchMedia:()=>({matches:false}),requestAnimationFrame:fn=>{frames.set(++sequence,fn);return sequence;},cancelAnimationFrame:id=>frames.delete(id)});
 context.window={...target,WikiScrollMotion:{cancel(){cancels++;}},scrollTo({top}){context.scrollY=Math.round(top);}};
 vm.runInContext(code,context);
 const host={isConnected:true,querySelector(){return null;},classList:{add(){},remove(){}}};
 const mounted=context.window.WikiArticleReading.mount(host);
 return {context,mounted,frames,listeners,get cancels(){return cancels;},tick(time){const batch=[...frames.values()];frames.clear();for(const frame of batch)frame(time);}};
}
// Real no-heading mount still receives ordinary wheel input; it must not cancel the host handler.
const ordinary=harness(source);ordinary.listeners.get('wheel')({});ordinary.listeners.get('touchstart')({});assert.equal(ordinary.cancels,0);ordinary.mounted.dispose();assert.equal(ordinary.listeners.size,0);
// Run the actual production seek closure with a browser that rounds every scroll write.
const prefix=source.slice(0,source.indexOf('  const cleanups = []'))+'return {seekTo};}};})();';
let cases=0;
for(const goal of [1.8,3.4,1234.4,5555.2]){
 const h=harness(prefix);h.mounted.seekTo(goal);let step=0;
 while(h.frames.size&&step<300)h.tick(++step*1000/60);
 assert.equal(h.frames.size,0,'Rounded seek animation must finish');assert(Math.abs(h.context.scrollY-goal)<=.5);cases++;
}
const interrupted=harness(prefix);interrupted.mounted.seekTo(5000);interrupted.tick(16);interrupted.context.scrollY+=100;const position=interrupted.context.scrollY;interrupted.tick(32);assert.equal(interrupted.frames.size,0);assert.equal(interrupted.context.scrollY,position);
console.log(JSON.stringify({status:'PASS',roundedSeekCases:cases,ordinaryWheelKeepsHostSmoothing:true,noHeadingListenerCleanup:true,externalScrollInterrupts:true}));
