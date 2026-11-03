import {composeWeapon} from './workshop-assembly.js';
import {digestReport} from './workshop-report.js';

const plain=value=>String(value??'').replace(/<\/?(?:b|i|s|u|color|gradient)(?:=[^<>]*)?\s*>/gi,'');
export function wrapText(text,measure,maxWidth){
  const lines=[];for(const paragraph of plain(text).split('\n')){let line='';for(const character of paragraph){if(line&&measure(line+character)>maxWidth){lines.push(line);line='';}line+=character;}lines.push(line);}return lines;
}
const colors={text:'#e4ece8',muted:'#a1aca8',border:'#687574',corruption:'#ab8aff',native:'#e4ad54'};
export function layoutReport(report,measure,width=960,nativeEffects){
  if(width<640||width>2000)throw Error('图片尺寸不支持');
  const regions=[],contentKeys=[],partGroups=[];let y=28;
  function row(key,text,{size=21,color=colors.text,gap=5,indent=0,hero=false,heading=false,x=28,rowWidth=width-56}={}){
    const lines=hero?[]:wrapText(text,t=>measure(t,size),rowWidth-indent),height=hero?116:Math.max(1,lines.length)*(size+7);
    regions.push({key,x:x+indent,y,width:rowWidth-indent,height,lines,size,color,heading});contentKeys.push(key);y+=height+gap;
  }
  function heading(key,text){y+=8;row(key,text,{size:20,color:colors.muted,heading:true,gap:8});}
  row('header:title',report.name,{size:28,gap:4});
  row('header:preview','',{hero:true});
  row('state',report.validation.complete?'装配完整':('未完成配装 · 缺少'+report.validation.missingRequired.length+'个必需部件')+(report.validation.kind!=='melee'&&!report.validation.fireable?' · 当前不能开火':''),{size:17,color:report.validation.complete?colors.muted:colors.native,gap:2});
  report.validation.missingRequired.forEach((m,index)=>row('missing:'+index,'待补齐 · '+m.label,{size:18,color:colors.native}));
  heading('heading:stats','属性');
  if(report.statBaseline)row('stat:baseline','变化量对照：'+report.statBaseline.label,{size:16,color:colors.muted,gap:6});
  if(report.validation.kind!=='melee')row('ammo',report.capacities.ammo.length?'弹药类型  '+report.capacities.ammo.map(a=>a.name+(a.count===null?'':' ×'+a.count)).join('；'):'弹药类型  未装填',{size:19,color:colors.corruption,gap:8});
  const stats=[...report.stats].sort((a,b)=>(a.barOrder??0)-(b.barOrder??0)),valueWidth=Math.max(76,...stats.map(s=>measure(s.formatted,21))),labelWidth=Math.max(112,...stats.map(s=>measure(s.label,21)));
  for(const stat of stats){
    const key='stat:'+stat.key;regions.push({key,stat,x:28,y,width:width-56,height:32,size:21,label:stat.label,value:stat.status==='known'?String(Number(stat.formatted)):'—',trackX:28+labelWidth+12,trackWidth:width-56-labelWidth-valueWidth-28,valueX:width-28});contentKeys.push(key);y+=32;
    if(stat.difference)row('difference:'+stat.key,stat.difference.text+(stat.difference.tone==='better'?' 改善':stat.difference.tone==='worse'?' 下降':' 中性'),{size:15,color:stat.difference.tone==='better'?'#9bc6ad':stat.difference.tone==='worse'?'#e29d96':colors.muted,gap:2});
  }
  if(report.validation.kind!=='melee'){
    row('capacity:assembly','整套弹容  '+(report.capacities.assembly.status==='known'?report.capacities.assembly.value:'—'),{size:17,color:colors.muted,gap:2});
    report.capacities.containers.forEach((c,i)=>row('capacity:container:'+i,c.name+'  '+(c.capacity.status==='known'?c.capacity.value:'—'),{size:18}));
  }
  heading('heading:parts','配装与词条');
  const columns=width>=900?2:1,columnGap=24,columnWidth=(width-56-columnGap*(columns-1))/columns;
  for(let offset=0;offset<report.parts.length;offset+=columns){
    const top=y;let bottom=top;
    for(let column=0;column<columns&&offset+column<report.parts.length;column++){
      const part=report.parts[offset+column],path=part.path.length?part.path.join('.'):'main',x=28+column*(columnWidth+columnGap),options={x,rowWidth:columnWidth};y=top+10;
      row('part:'+path,part.name+(part.ammoCount!==null?' × '+part.ammoCount:''),{...options,size:21,indent:34,gap:6});
      part.affixes.forEach((a,index)=>{
        row(`affix:${path}:${index}`,a.name,{...options,size:19,color:colors.corruption,indent:20,gap:0});
        row(`affix-description:${path}:${index}`,a.description,{...options,size:18,color:'#c6b5ec',indent:20,gap:6});
      });
      (nativeEffects?.[part.itemId]||part.nativeEffects).forEach((text,index)=>row(`native-effect:${path}:${index}`,text,{...options,size:18,color:colors.native,indent:20,gap:6}));
      partGroups.push({path,x,y:top,width:columnWidth,height:y-top});bottom=Math.max(bottom,y);
    }
    y=bottom+12;
  }
  const additionalEffects=report.conditionalEffects.map((effect,index)=>({effect,index})).filter(({effect})=>{
    const part=report.parts.find(p=>p.path.length===effect.path?.length&&p.path.every((slot,i)=>slot===effect.path[i]));
    return !part||!effect.text||!(part.affixes.some(a=>a.id===effect.affixId&&a.description===effect.text)||part.nativeEffects.some(text=>text===effect.text||text.endsWith(' · '+effect.text)));
  });
  if(additionalEffects.length)heading('heading:conditions','触发与其他效果');
  additionalEffects.forEach(({effect,index})=>{if(effect.text)row('condition:'+index,effect.text,{size:18,color:colors.native});});
  y+=10;row('header:basis','工坊计算值 · 腐化100% · 效果倍率1 · 重量倍率1',{size:15,color:colors.muted});
  row('footer','查无此地 · 生存手册',{size:13,color:colors.muted});
  const height=Math.ceil(y+22);if(height>12000||width*height>24000000)throw Error('图片尺寸超过单图上限，请保留方案并调整配装；未裁剪任何内容');
  return {contentKeys,regions,partGroups,width,height};
}
function drawNativeBar(ctx,region,visual,images){
  const stat=region.stat,w=region.trackWidth,h=24,value=Number(stat.value),fraction=Number.isFinite(stat.barCap)&&stat.barCap!==0?Math.min(1,Math.abs(value/stat.barCap)):0;
  const sprite=(url,x,y,width,height)=>{if(url&&width>0&&height>0)ctx.drawImage(images.get(url),x,y,width,height);};
  ctx.save();ctx.translate(region.trackX,region.y+1);ctx.beginPath();ctx.rect(0,0,w,h);ctx.clip();
  if(value<0){ctx.translate(w,0);ctx.scale(-1,1);}
  if(visual.background){const height=images.get(visual.background).naturalHeight*2;sprite(visual.background,0,(h-height)/2,w,height);}
  if(stat.status==='known'&&Number.isFinite(value)&&Number.isFinite(stat.barCap)&&stat.barCap!==0){
    if(stat.barRender==='dots'){
      const count=stat.barDots,active=Math.ceil(fraction*count),gap=2,dotWidth=(w-(count-1)*gap)/count;
      for(let i=0;i<count;i++){
        const url=i===active-1?visual.end:i<active?visual.active:visual.inactive,image=images.get(url),boxHeight=i===active-1?22:18,scale=Math.min(dotWidth/image.naturalWidth,boxHeight/image.naturalHeight),dw=image.naturalWidth*scale,dh=image.naturalHeight*scale;
        ctx.save();if(i>=active){ctx.globalAlpha=.5019608;ctx.filter='brightness(.8117647)';}sprite(url,i*(dotWidth+gap)+(dotWidth-dw)/2,(h-dh)/2,dw,dh);ctx.restore();
      }
      ctx.globalAlpha=.5;sprite(visual.border,0,7,2,10);ctx.translate(w,0);ctx.scale(-1,1);sprite(visual.border,0,7,2,10);
    }else if(stat.barRender==='position')sprite(visual.fill,2+(w-4)*fraction-(w-4),2,w-4,20);
    else{
      sprite(visual.fill,2,11,Math.min(w*fraction,w-14),2);
      const round=n=>{const floor=Math.floor(n);return Math.abs(n-floor-.5)<1e-7?floor+(floor%2):Math.round(n);},preset=visual.presets?Math.min(visual.presets.length-1,round(fraction*visual.presets.length)):null;
      const size=visual.sizeRange?Array(2).fill(visual.sizeRange[0]+(visual.sizeRange[1]-visual.sizeRange[0])*fraction):preset!==null?visual.presetSizes[preset]:visual.indicatorSize;
      const [iw,ih]=size,left=Math.max(2,Math.min(w*fraction+2,w-iw)),top=(h-ih)/2;
      sprite(preset!==null?visual.presets[preset]:visual.indicator,left,top,iw,ih);
      for(const part of visual.parts||[])sprite(part.image,left+part.anchor[0]*iw+part.position[0]-part.size[0]/2,top+(1-part.anchor[1])*ih-part.position[1]-part.size[1]/2,...part.size);
    }
  }
  ctx.restore();
}
async function loadImage(url,signal){
  const target=new URL(url,location.origin+'/');if(target.origin!==location.origin||target.pathname.split('/').includes('..'))throw Error('配装图片路径不支持');
  signal?.throwIfAborted();return new Promise((resolve,reject)=>{
    const image=new Image();const finish=(error)=>{signal?.removeEventListener('abort',abort);image.onload=image.onerror=null;error?reject(error):resolve(image);};
    const abort=()=>finish(new DOMException('操作已取消','AbortError'));signal?.addEventListener('abort',abort,{once:true});image.onload=()=>finish();image.onerror=()=>finish(Error('必要图片未能加载，请重试'));image.src=target.href;
  });
}
export async function renderWorkshopImage(report,assemblyData,{signal,statStyles,nativeEffects}={}){
  signal?.throwIfAborted();const text=layoutReport(report,()=>0,960,nativeEffects).regions.flatMap(region=>[region.label||'',region.value||'',...(region.lines||[])]).join('\n')+'\n暂无组合图';const family=await window.WikiTypography.prepare(document,text,{weights:[400],signal});signal?.throwIfAborted();
  const probe=document.createElement('canvas').getContext('2d');const measure=(text,size=22)=>{probe.font=`${size}px ${family}`;return probe.measureText(text).width;};
  const layout=layoutReport(report,measure,960,nativeEffects),composition=composeWeapon(report.build,assemblyData);
  if(report.stats.some(stat=>!statStyles?.[stat.key]))throw Error('原生属性条样式资料未加载，请刷新后重试');
  const textures=[];function collect(value){if(typeof value==='string')textures.push(value);else if(value&&typeof value==='object')Object.values(value).forEach(collect);}
  report.stats.forEach(stat=>collect(statStyles[stat.key]));
  const urls=[...new Set([...composition.layers.map(l=>l.url),...report.parts.map(p=>p.icon).filter(Boolean),...textures])],loaded=new Map(await Promise.all(urls.map(async url=>[url,await loadImage(url,signal)])));
  signal?.throwIfAborted();const canvas=document.createElement('canvas');canvas.width=layout.width;canvas.height=layout.height;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#1b2325';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.strokeStyle='#ffffff03';ctx.lineWidth=1;
  for(let x=-canvas.height;x<canvas.width;x+=18){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x+canvas.height,canvas.height);ctx.stroke();}
  ctx.strokeStyle=colors.border;ctx.strokeRect(12.5,12.5,canvas.width-25,canvas.height-25);ctx.textBaseline='top';ctx.imageSmoothingEnabled=false;
  for(const group of layout.partGroups){ctx.strokeStyle='#68757480';ctx.beginPath();ctx.moveTo(group.x,group.y+.5);ctx.lineTo(group.x+group.width,group.y+.5);ctx.stroke();}
  for(const region of layout.regions){signal?.throwIfAborted();
    if(region.key==='header:preview'){
      const b=composition.bounds;if(composition.layers.length&&b.width>0&&b.height>0){const available=Math.min(region.width/b.width,(region.height-8)/b.height,6),scale=available>=1?Math.floor(available):available,left=region.x+(region.width-b.width*scale)/2,top=region.y+(region.height-b.height*scale)/2;
        for(const layer of composition.layers)ctx.drawImage(loaded.get(layer.url),left+(layer.x-b.x)*scale,top+(b.y+b.height-layer.y-layer.height)*scale,layer.width*scale,layer.height*scale);
      }else{ctx.fillStyle='#d7bd88';ctx.font=`22px ${family}`;ctx.fillText('暂无组合图',region.x,region.y);}
      continue;
    }
    if(region.stat){
      ctx.fillStyle=colors.text;ctx.font=`${region.size}px ${family}`;ctx.fillText(region.label,region.x,region.y);
      drawNativeBar(ctx,region,statStyles[region.stat.key],loaded);ctx.textAlign='right';ctx.fillText(region.value,region.valueX,region.y);ctx.textAlign='left';continue;
    }
    ctx.fillStyle=region.color;ctx.font=`${region.size}px ${family}`;region.lines.forEach((line,index)=>ctx.fillText(line,region.x,region.y+index*(region.size+7)));
    if(region.heading){const start=region.x+measure(region.lines[0],region.size)+14;ctx.strokeStyle=colors.border;ctx.beginPath();ctx.moveTo(start,region.y+12.5);ctx.lineTo(canvas.width-28,region.y+12.5);ctx.stroke();}
    if(region.key.startsWith('part:')){const path=region.key.slice(5),part=report.parts.find(p=>(p.path.length?p.path.join('.'):'main')===path);if(part?.icon)ctx.drawImage(loaded.get(part.icon),region.x-34,region.y,26,26);}
    if(region.key.startsWith('affix:')){ctx.fillStyle=colors.corruption;ctx.fillRect(region.x-14,region.y+7,4,4);ctx.fillRect(region.x-10,region.y+3,4,4);ctx.fillRect(region.x-10,region.y+11,4,4);ctx.fillRect(region.x-6,region.y+7,4,4);}
  }
  const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));signal?.throwIfAborted();
  if(!blob||blob.size>5*1024*1024)throw Error('生成PNG超过5 MiB或未能编码；配装与草稿已保留');
  return {blob,width:canvas.width,height:canvas.height,reportDigest:await digestReport(report),layout};
}
export async function copyWorkshopImage(result){
  if(!navigator.clipboard?.write||typeof ClipboardItem==='undefined')return {copied:false,reason:'浏览器不支持复制图片，可下载PNG'};
  try{await navigator.clipboard.write([new ClipboardItem({'image/png':result.blob})]);return {copied:true};}catch{return {copied:false,reason:'未能复制图片，可下载同一PNG'};}
}
export function downloadWorkshopImage(result,filename='查无此地-配装.png'){
  const url=URL.createObjectURL(result.blob),link=document.createElement('a');link.href=url;link.download=filename;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);
}
