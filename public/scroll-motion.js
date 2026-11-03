(() => {
  'use strict';
  if(window.WIKI_STATIC_BUILD)return;
  const key='nsp-scroll-motion-v1',reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let enabled=true,active=null,raf=0,button;
  try{enabled=localStorage.getItem(key)!=='off';}catch{}
  function cancel(){if(raf)cancelAnimationFrame(raf);raf=0;active=null;}
  function draw(){if(button){button.textContent='柔和滚动：'+(enabled?'开':'关');button.setAttribute('aria-pressed',String(enabled));}}
  function setEnabled(value){enabled=!!value;cancel();try{localStorage.setItem(key,enabled?'on':'off');}catch{}draw();}
  function scroller(node){
    const modal=document.querySelector('dialog:modal');if(modal&&!modal.contains(node))return null;
    for(let el=node;el&&el!==document.body&&el!==document.documentElement;el=el.parentElement){
      if(el.closest('input,textarea,select,[contenteditable]:not([contenteditable=false]),canvas,.wm-viewer,.quest-page,.gunsmith-workspace'))return null;
      const style=getComputedStyle(el);
      if(/auto|scroll/.test(style.overflowY)&&el.scrollHeight>el.clientHeight+1)return el.id==='detail'?el:null;
      if(/contain|none/.test(style.overscrollBehaviorY))return null;
    }
    return modal?null:document.scrollingElement;
  }
  function frame(time){
    raf=0;const state=active;if(!state)return;
    const el=state.el;if(!el.isConnected||!el.clientHeight||document.hidden||reduced.matches||Math.abs(el.scrollTop-state.written)>2){cancel();return;}
    state.target=Math.max(0,Math.min(el.scrollHeight-el.clientHeight,state.target));
    state.position=Math.max(0,Math.min(el.scrollHeight-el.clientHeight,state.position));
    const position=el.scrollTop,remaining=state.target-state.position,dt=Math.min(40,state.time?time-state.time:16.67);state.time=time;
    // Retain fractional progress when scrollTop is rounded to device pixels.
    const next=Math.abs(remaining)<=.5?state.target:state.position+remaining*(1-Math.exp(-dt/state.response));state.position=next;
    el.scrollTo({top:next,behavior:'instant'});state.written=el.scrollTop;
    if(Math.abs(state.target-next)<=.5){el.scrollTo({top:state.target,behavior:'instant'});cancel();return;}
    if(state.written===position&&Math.abs(next-position)>2){cancel();return;}
    raf=requestAnimationFrame(frame);
  }
  function wheel(event){
    // Wheel events expose no reliable device type; preserve fine/ambiguous input natively.
    const amount=Math.abs(event.deltaY),coarse=event.deltaMode!==0||Number.isInteger(amount)&&amount>=60&&(amount%100===0||amount%120===0);
    if(!enabled||reduced.matches||event.defaultPrevented||!event.cancelable||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||event.deltaX||!coarse||!amount){cancel();return;}
    const el=scroller(event.target instanceof Element?event.target:event.target.parentElement);if(!el){cancel();return;}
    const style=getComputedStyle(document.documentElement),time=style.getPropertyValue('--scroll-response').trim().match(/^(\d*\.?\d+)(ms|s)$/);
    const response=Math.max(30,Math.min(160,time?Number(time[1])*(time[2]==='s'?1000:1):70));
    const multiplier=Math.max(.2,Math.min(2,parseFloat(style.getPropertyValue('--scroll-distance-multiplier'))||1)),limit=Math.max(80,Math.min(800,parseFloat(style.getPropertyValue('--scroll-max-distance'))||480));
    const units=event.deltaMode===1?parseFloat(getComputedStyle(el).lineHeight)||20:event.deltaMode===2?el.clientHeight:1;
    const delta=event.deltaY*units*multiplier,position=el.scrollTop,max=el.scrollHeight-el.clientHeight;
    if(max<=0||delta>0&&max-position<Math.min(Math.abs(delta),limit)||delta<0&&position<Math.min(Math.abs(delta),limit)){cancel();return;}
    event.preventDefault();
    const continued=active?.el===el&&Math.sign(active.target-position)===Math.sign(delta);
    const target=Math.max(0,Math.min(max,position+Math.max(-limit,Math.min(limit,(continued?active.target-position:0)+delta))));
    active={el,target,position,written:position,time:active?.el===el?active.time:0,response};if(!raf)raf=requestAnimationFrame(frame);
  }
  document.addEventListener('wheel',wheel,{passive:false});
  for(const name of['pointerdown','touchstart','keydown','focusin','click'])document.addEventListener(name,cancel,{capture:true,passive:true});
  for(const name of['hashchange','popstate','pagehide','resize'])window.addEventListener(name,cancel);
  document.addEventListener('close',cancel,true);document.addEventListener('visibilitychange',()=>{if(document.hidden)cancel();});reduced.addEventListener('change',cancel);
  window.addEventListener('storage',event=>{if(event.key===key){enabled=event.newValue!=='off';cancel();draw();}});
  function setup(){const footer=document.querySelector('footer');if(!footer)return;button=document.createElement('button');button.type='button';button.className='secondary-button scroll-motion-toggle';button.title='普通阅读区的离散滚轮短尾减速；触控与小滚动区保留原生';button.onclick=()=>setEnabled(!enabled);footer.append(button);draw();}
  window.WikiScrollMotion={cancel,setEnabled,get enabled(){return enabled;},get active(){return !!active;}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
