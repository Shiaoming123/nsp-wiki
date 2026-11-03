(() => {
  'use strict';
  let renderer;
  const active=root=>root.isConnected&&(!root.closest('dialog')||root.closest('dialog').open);
  const cancelled=()=>new DOMException('已离开这张卡片','AbortError');
  function deadline(promise){let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('卡片资源载入超时，请重试。')),20000);})]).finally(()=>clearTimeout(timer));}
  function loadRenderer(){
    return renderer||=(new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='/vendor/html2canvas-1.4.1.min.js';
      const timer=setTimeout(()=>{script.remove();reject(Error('截图工具载入超时，请重试。'));},20000);
      script.onload=()=>{clearTimeout(timer);typeof window.html2canvas==='function'?resolve(window.html2canvas):reject(Error('截图工具加载失败，请重试。'));};
      script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('截图工具加载失败，请重试。'));};document.head.append(script);
    })).catch(error=>{renderer=null;throw error;});
  }
  function ready(root,owner=root){
    return new Promise((resolve,reject)=>{
      let timer;const dialog=owner.closest('dialog'),observer=new MutationObserver(check);
      function finish(error){observer.disconnect();clearTimeout(timer);dialog?.removeEventListener('close',check);error?reject(error):resolve();}
      function check(){
        if(!active(owner))return finish(cancelled());
        if(root.matches('[data-corruption="error"],[data-npc-recipes-error]')||root.querySelector('[data-corruption="error"],[data-npc-recipes-error]'))return finish(Error('资料尚未完整载入，请刷新后重试。'));
        if(!root.matches('[data-corruption="loading"],[data-npc-recipes="loading"]')&&!root.querySelector('[data-corruption="loading"],[data-npc-recipes="loading"]'))finish();
      }
      observer.observe(root,{attributes:true,childList:true,subtree:true});dialog?.addEventListener('close',check);
      timer=setTimeout(()=>finish(Error('资料仍在载入，请稍后重试。')),15000);check();
    });
  }
  async function snapshot(root){
    if(root.dataset.cardCompact!=='true')return renderSnapshot(root,root);
    const item=window.Wiki?.getItem(root.dataset.itemId);if(!item)throw Error('完整物品资料暂时无法读取。');
    const staging=document.createElement('div');staging.style.cssText='position:fixed;left:-100000px;top:0;width:960px;pointer-events:none';staging.setAttribute('aria-hidden','true');staging.inert=true;
    try{const full=window.Wiki.itemDetails(item,'card-export-title',false,true);full.querySelectorAll('[id]').forEach(node=>node.removeAttribute('id'));staging.append(full);document.body.append(staging);return await renderSnapshot(root,full);}finally{staging.remove();}
  }
  async function renderSnapshot(root,source){
    await ready(source,root);if(!active(root))throw cancelled();
    const copy=source.cloneNode(true),name=root.dataset.cardName||'攻略卡片';
    copy.querySelectorAll('.stat-definition').forEach(node=>node.replaceWith(document.createTextNode(node.textContent)));
    copy.querySelectorAll('.card-capture-tools,.item-community,.item-community-toolbar,.static-guide-link,button,input,select,script,iframe,object,video,audio').forEach(node=>node.remove());
    copy.querySelectorAll('details').forEach(node=>{node.open=true;});
    for(const node of[copy,...copy.querySelectorAll('*')]){node.removeAttribute('tabindex');for(const attr of[...node.attributes])if(attr.name.startsWith('on'))node.removeAttribute(attr.name);}
    copy.style.maxHeight='none';copy.style.height='auto';copy.style.overflow='visible';
    const originalImages=[...source.querySelectorAll('img')].filter(img=>!img.closest('.item-community,.item-community-toolbar'));
    const images=[...copy.querySelectorAll('img')];
    for(let i=0;i<images.length;i++){const original=originalImages[i];if(original)images[i].src=original.currentSrc||original.src;images[i].loading='eager';}
    const render=await loadRenderer();if(!active(root))throw cancelled();
    const frame=document.createElement('iframe');frame.setAttribute('aria-hidden','true');frame.setAttribute('sandbox','allow-same-origin');frame.tabIndex=-1;frame.className='card-export-frame-host';
    frame.style.cssText='position:fixed;left:-100000px;top:0;width:960px;height:1000px;border:0;pointer-events:none';
    let canvas;
    try{
      document.body.append(frame);const doc=frame.contentDocument;doc.open();doc.write('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"></head><body></body></html>');doc.close();
      const base=doc.createElement('base');base.href=document.baseURI;doc.head.append(base);
      const styles=[...document.querySelectorAll('link[rel="stylesheet"]')].map(link=>new Promise((resolve,reject)=>{const clone=doc.createElement('link');clone.rel='stylesheet';clone.href=link.href;clone.onload=resolve;clone.onerror=()=>reject(Error('截图样式未能加载，请重试。'));doc.head.append(clone);}));
      document.querySelectorAll('style').forEach(style=>doc.head.append(style.cloneNode(true)));
      const exportStyle=doc.createElement('style');exportStyle.textContent='html,body{margin:0!important;padding:0!important;background:#2b3430!important;color:#e4ece8!important}body{font:var(--text-body)/var(--leading-body) var(--font-body)}.card-export-content{width:960px;box-sizing:border-box;padding:24px;border:1px solid #687574;background:#2b3430}.card-export-content *{animation:none!important;transition:none!important}.card-export-content .detail-body,.card-export-content .table-scroll,.card-export-content .source-group-content{max-height:none!important;overflow:visible!important}.card-export-content details>summary{list-style:none}.card-export-content .detail-hero{padding-top:0}.card-export-footer{padding-top:20px;border-top:1px solid #687574;color:#b2bdb5;font-size:14px}';doc.head.append(exportStyle);
      const content=doc.createElement('div');content.className='card-export-content';content.append(doc.adoptNode(copy));
      const footer=doc.createElement('p');footer.className='card-export-footer';footer.textContent='查无此地 · 生存手册';content.append(footer);doc.body.append(content);
      await deadline((async()=>{await Promise.all(styles);const family=await window.WikiTypography.prepare(doc,content.textContent);doc.documentElement.style.setProperty("--font-body",family);
      await Promise.all([...content.querySelectorAll('img')].map(async img=>{const url=new URL(img.src,doc.baseURI);if(url.origin!==location.origin&&!['data:','blob:'].includes(url.protocol))throw Error('卡片图片无法安全导出。');try{await img.decode();}catch{throw Error('部分图片未能加载，请刷新后重试。');}if(!img.naturalWidth)throw Error('部分图片未能加载，请刷新后重试。');}));})());
      if(!active(root))throw cancelled();
      const width=960,height=Math.ceil(content.getBoundingClientRect().height),scale=Math.min(devicePixelRatio||1,2,16384/height,Math.sqrt(16*1024*1024/(width*height)));
      if(!Number.isFinite(height)||height<=0||scale<.7)throw Error('卡片内容过长，暂时无法生成完整清晰的单张图片。');
      canvas=await render(content,{backgroundColor:'#2b3430',width,height,windowWidth:width,windowHeight:height,scale,logging:false,allowTaint:false,useCORS:false,removeContainer:true});
      if(!active(root))throw cancelled();
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('图片生成失败，请重试。');if(!active(root))throw cancelled();
      return {blob,name};
    }finally{if(canvas){canvas.width=0;canvas.height=0;}frame.remove();}
  }
  function mount(root){
    if(!root||!['item','enemy'].includes(root.dataset.cardKind)||root.querySelector('.card-capture-tools'))return;
    const tools=document.createElement('div');tools.className='card-capture-tools';
    const copy=document.createElement('button'),download=document.createElement('button'),status=document.createElement('span');
    copy.type=download.type='button';copy.className=download.className='secondary-button';copy.textContent='复制卡片截图';download.textContent='下载 PNG';download.hidden=true;status.className='guide-note';status.setAttribute('role','status');
    tools.append(copy,download,status);const summary=root.querySelector(':scope > .item-detail-layout > .item-detail-summary'),anchor=root.querySelector('.detail-hero')||root.querySelector('h1,h2');if(summary)summary.append(tools);else if(anchor)anchor.after(tools);else root.prepend(tools);
    let frozen=null,busy=false;
    download.onclick=()=>{if(!frozen)return;const url=URL.createObjectURL(frozen.blob),link=document.createElement('a');link.href=url;link.download=frozen.name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'').slice(0,80)+'-查无此地.png';link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);};
    copy.onclick=async()=>{
      if(busy)return;busy=true;copy.disabled=true;download.hidden=true;frozen=null;status.textContent='正在生成完整卡片…';
      const image=snapshot(root),png=image.then(value=>value.blob);png.catch(()=>{});let write=Promise.resolve(false);
      try{if(isSecureContext&&navigator.clipboard?.write&&window.ClipboardItem)write=navigator.clipboard.write([new ClipboardItem({'image/png':png})]).then(()=>true,()=>false);}catch{}
      const[result,copied]=await Promise.allSettled([image,write]);busy=false;if(!active(root))return;copy.disabled=false;
      if(result.status==='rejected'){status.textContent=result.reason?.message||'图片生成失败，请重试。';return;}
      frozen=result.value;download.hidden=false;status.textContent=copied.status==='fulfilled'&&copied.value?'已复制完整卡片，可直接粘贴分享。':'图片已生成；复制受限，可下载同一张 PNG。';
    };
  }
  window.WikiCardImage={mount};
  const install=()=>document.querySelectorAll('[data-card-kind]').forEach(mount);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install();
})();
