(() => {
  'use strict';
  const family=doc=>doc.defaultView.getComputedStyle(doc.documentElement).getPropertyValue('--font-body').trim();
  async function prepare(doc,text,{weights=[400,500,600],signal}={}){
    signal?.throwIfAborted();
    const fallback=doc.defaultView.getComputedStyle(doc.documentElement).getPropertyValue('--font-fallback').trim();
    if(!doc.fonts?.load)return fallback;
    const cjk=[...String(text)].filter(c=>c.codePointAt(0)>0x2ff).join('');let timer,abort;
    try{
      const loads=Promise.all(weights.flatMap(weight=>[doc.fonts.load(`${weight} 16px "Wiki Geist"`,String(text)+'A0'),...(cjk?[doc.fonts.load(`${weight} 16px "Wiki Noto SC"`,cjk)]:[])]));
      const stopped=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('font timeout')),8000);abort=()=>reject(signal.reason||new DOMException('已取消','AbortError'));signal?.addEventListener('abort',abort,{once:true});});
      const loaded=(await Promise.race([loads,stopped])).flat();signal?.throwIfAborted();
      return loaded.length&&loaded.every(font=>font.status==='loaded')?family(doc):fallback;
    }catch(error){if(signal?.aborted)throw error;return fallback;}
    finally{clearTimeout(timer);if(abort)signal?.removeEventListener('abort',abort);}
  }
  window.WikiTypography={family,prepare};
})();
