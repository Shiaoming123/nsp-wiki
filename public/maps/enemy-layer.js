const kinds={birth:'出生点',rules:'区域规则',reinforce:'据点增援'};
const node=(tag,text='',cls='')=>{const el=document.createElement(tag);el.textContent=text;el.className=cls;return el;};
const densityRadius=20,densityScale=3.2;
export function densityColor(value){
  if(!(value>0))return [0,0,0,0];
  const t=Math.min(1,value/densityScale),stops=[[0,[65,187,130]],[.45,[155,210,91]],[.7,[235,214,83]],[1,[229,86,62]]];
  const i=stops.findIndex((s,i)=>i&&t<=s[0]),a=stops[i-1],b=stops[i],mix=(t-a[0])/(b[0]-a[0]);
  return [...a[1].map((v,j)=>Math.round(v+(b[1][j]-v)*mix)),Math.round(158*(1-Math.exp(-value*1.2)))];
}
const densityPalette=Uint8ClampedArray.from(Array.from({length:256},(_,i)=>densityColor(i*densityScale/255)).flat());
const densityPalette32=new Uint32Array(densityPalette.buffer);
function paintDensity(cache,kernels,w,h){
  const step=1;
  if(!cache.field||cache.canvas.width!==w||cache.canvas.height!==h){cache.canvas.width=w;cache.canvas.height=h;cache.field=new Float32Array(w*h);cache.pixels=cache.canvas.getContext('2d').createImageData(w,h);}
  const field=cache.field;field.fill(0);
  for(const [x,y,ux,uy,vx,vy]of kernels){
    const determinant=ux*vy-uy*vx;if(Math.abs(determinant)<.001)continue;
    const rx=Math.hypot(ux,vx),ry=Math.hypot(uy,vy),x0=Math.max(0,Math.floor((x-rx)/step)),x1=Math.min(w-1,Math.ceil((x+rx)/step)),y0=Math.max(0,Math.floor((y-ry)/step)),y1=Math.min(h-1,Math.ceil((y+ry)/step));
    for(let row=y0;row<=y1;row++)for(let col=x0;col<=x1;col++){
      const dx=(col+.5)*step-x,dy=(row+.5)*step-y,a=(dx*vy-dy*vx)/determinant,b=(dy*ux-dx*uy)/determinant,r2=a*a+b*b;
      if(r2<=1)field[row*w+col]+=Math.exp(-3.5*r2);
    }
  }
  const pixels=new Uint32Array(cache.pixels.data.buffer);
  for(let i=0;i<field.length;i++)pixels[i]=densityPalette32[Math.min(255,Math.round(field[i]/densityScale*255))];
  cache.canvas.getContext('2d').putImageData(cache.pixels,0,0);
}
export function containsPoint(polygon,position){
  let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i],b=polygon[j],x=position[0],z=position[2];
    if((a[2]>z)!==(b[2]>z)&&x<(b[0]-a[0])*(z-a[2])/(b[2]-a[2])+a[0])inside=!inside;
  }return inside;
}
export function supportBand(player,source){
  const angle=Math.atan2(source[2]-player[2],source[0]-player[0]),points=[];
  for(const [r,direction]of[[30,1],[18,-1]]){
    const edge=Math.asin(6/r);for(let i=0;i<=24;i++){const a=angle+(direction===1?-edge:edge)+direction*2*edge*i/24;points.push([player[0]+r*Math.cos(a),0,player[2]+r*Math.sin(a)]);}
  }return points;
}
export function validateEnemyData(data){
  if(data?.schemaVersion!==1||!data.maps||typeof data.maps!=='object')throw Error('敌怪资料格式无法读取');
  const polygonOK=polygon=>Array.isArray(polygon)&&polygon.length>=3&&polygon.every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite));
  const contentOK=e=>Array.isArray(e.fields)&&e.fields.every(f=>Array.isArray(f)&&f.length===2&&f.every(s=>typeof s==='string'))&&Array.isArray(e.enemies)&&e.enemies.every(n=>typeof n?.id==='string'&&typeof n.name==='string'&&(n.chance===undefined||Number.isFinite(n.chance)&&n.chance>=0&&n.chance<=1));
  for(const map of Object.values(data.maps)){
    if(!Array.isArray(map.entries))throw Error('敌怪列表不完整');
    if(map.roaming&&(!contentOK(map.roaming)||map.roaming.rainEnemies&&!contentOK({fields:[],enemies:map.roaming.rainEnemies})))throw Error('游荡敌怪资料不完整');
    const ids=new Set();for(const e of map.entries){
      if(!e.id||typeof e.title!=='string'||ids.has(e.id)||!kinds[e.kind]||!Array.isArray(e.position)||e.position.length!==3||!e.position.every(Number.isFinite)||!contentOK(e))throw Error('敌怪点位不完整');
      ids.add(e.id);if(e.polygon&&!polygonOK(e.polygon)||e.role==='support'&&!polygonOK(e.bastionPolygon))throw Error('敌怪区域不完整');
    }
  }return data;
}
export function mountEnemyLayer({host,stage,dialog,signal,onInvalidate,onOpen,onFocus}){
  let disposed=false,mapId=null,data=null,error=null,loading=false,request=null,enabled=true,open=false,selected=null,query='',bounds=null,placing=false,player=null,displayMode='soft',densityBuilds=0;
  const active=new Set(Object.keys(kinds)),hits=new Map(),clips=new Map(),listeners=[];
  let densityCache=null;
  function clearDensity(){densityCache=null;}
  function getDensity(){
    if(disposed||!enabled||displayMode!=='soft'||!data)return null;
    const births=filtered().filter(e=>e.kind==='birth'),key=births.map(e=>e.id).join(':');
    if(!births.length){clearDensity();return null;}
    if(densityCache?.key===key)return densityCache;
    const xmin=Math.min(...births.map(e=>e.position[0]))-densityRadius,xmax=Math.max(...births.map(e=>e.position[0]))+densityRadius,zmin=Math.min(...births.map(e=>e.position[2]))-densityRadius,zmax=Math.max(...births.map(e=>e.position[2]))+densityRadius;
    const step=Math.max(.5,Math.max(xmax-xmin,zmax-zmin)/1024),w=Math.ceil((xmax-xmin)/step),h=Math.ceil((zmax-zmin)/step),cache={canvas:document.createElement('canvas'),key,kernels:births.length,bounds:[xmin,zmin,xmin+w*step,zmin+h*step],revision:++densityBuilds};
    // Camera motion reprojects this world-space field without recalculating its density.
    const start=performance.now();paintDensity(cache,births.map(e=>[(e.position[0]-xmin)/step,(e.position[2]-zmin)/step,densityRadius/step,0,0,densityRadius/step]),w,h);cache.bakeMs=performance.now()-start;
    densityCache=cache;return cache;
  }
  const panel=node('aside','','wm-enemy-panel');panel.hidden=true;panel.setAttribute('aria-label','敌怪叠加层');
  const header=node('div','','wm-enemy-heading'),heading=node('strong','敌怪'),close=node('button','收起');close.type='button';close.setAttribute('aria-label','收起敌怪面板');header.append(heading,close);
  const visibility=node('label','','wm-enemy-visible'),visible=node('input');visible.type='checkbox';visible.checked=true;visibility.append(visible,document.createTextNode('显示敌怪图层'));
  const displayRow=node('div','','wm-enemy-display'),displaySelect=node('select');displaySelect.setAttribute('aria-label','敌怪显示方式');displaySelect.append(new Option('柔和热区','soft'),new Option('清晰点位','points'));displayRow.append(visibility,displaySelect);
  const controls=node('div','','wm-enemy-kinds');for(const[kind,title]of Object.entries(kinds)){const label=node('label'),input=node('input');input.type='checkbox';input.checked=true;input.dataset.enemyKind=kind;label.append(input,document.createTextNode(title));controls.append(label);}
  const legend=node('div','','wm-enemy-density-legend'),ramp=node('span','','wm-enemy-density-ramp');ramp.style.background=`linear-gradient(90deg,${[.15,1,2.2,3.2].map(v=>'rgb('+densityColor(v).slice(0,3).join(',')+')').join(',')})`;legend.append(node('span','预置出生候选密度'),ramp,node('small','稀疏 → 密集 · 非刷新概率'));
  const search=node('input');search.type='search';search.placeholder='搜索敌怪、队伍或据点';search.setAttribute('aria-label','搜索敌怪、队伍或据点');
  const note=node('p','','wm-enemy-note'),scenario=node('div','','wm-enemy-scenario'),place=node('button','点选假设玩家位置'),reset=node('button','清除示意'),scenarioNote=node('p');place.type=reset.type='button';place.setAttribute('aria-pressed','false');scenario.append(place,reset,scenarioNote);
  const detail=node('section','','wm-enemy-detail');detail.hidden=true;detail.setAttribute('aria-label','敌怪生成详情');
  const list=node('div','','wm-enemy-list');list.setAttribute('aria-label','本图敌怪与区域');
  const feedback=node('p','','wm-enemy-feedback');feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
  panel.append(header,displayRow,controls,legend,search,note,scenario,detail,feedback,list);stage.append(panel);
  const listen=(el,type,fn)=>{el.addEventListener(type,fn);listeners.push(()=>el.removeEventListener(type,fn));};
  const buttons=()=>host.querySelectorAll('[data-action=enemies]');
  const entries=()=>data?.maps[mapId]?.entries||[];
  const selectedEntry=()=>entries().find(e=>e.id===selected);
  const scenarioEnabled=()=>enabled&&(selectedEntry()?.role==='support'?active.has('reinforce'):active.has('rules')&&Boolean(data?.maps[mapId]?.roaming));
  function stopPlacing(){placing=false;place.setAttribute('aria-pressed','false');}
  const matches=e=>(!query||[e.title,e.groupLabel,...e.enemies.map(n=>n.name)].filter(Boolean).join(' ').toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  const inBounds=e=>!bounds||(e.polygon?Math.max(...e.polygon.map(p=>p[0]))>=bounds.min[0]&&Math.min(...e.polygon.map(p=>p[0]))<=bounds.max[0]&&Math.max(...e.polygon.map(p=>p[2]))>=bounds.min[2]&&Math.min(...e.polygon.map(p=>p[2]))<=bounds.max[2]:e.position[0]>=bounds.min[0]&&e.position[0]<=bounds.max[0]&&e.position[2]>=bounds.min[2]&&e.position[2]<=bounds.max[2]);
  const filtered=()=>entries().filter(e=>active.has(e.kind)&&matches(e)&&inBounds(e));
  function repaint(){hits.clear();onInvalidate();}
  function syncContainer(){const parent=dialog.open?dialog.querySelector('.wm-atlas-layout'):stage.hidden?host:stage;if(panel.parentElement!==parent)parent.append(panel);}
  function setOpen(value){open=value;syncContainer();panel.hidden=!value;for(const b of buttons()){b.setAttribute('aria-expanded',String(open));b.setAttribute('aria-pressed',String(enabled));}if(open){onOpen();load();search.focus({preventScroll:true});}else buttons()[dialog.open?1:0]?.focus({preventScroll:true});}
  async function load(){
    if(data||request||disposed)return;loading=true;error=null;render();
    request=fetch(new URL('./data/enemy-spawns.json'+new URL(import.meta.url).search,import.meta.url),{signal,cache:'no-cache'}).then(async response=>{if(!response.ok)throw Error('敌怪资料暂时不可用');return validateEnemyData(await response.json());}).then(result=>{if(disposed||signal.aborted)return;data=result;}).catch(e=>{if(!disposed&&e.name!=='AbortError')error='敌怪资料暂时无法读取，地图与物资仍可使用。';}).finally(()=>{request=null;loading=false;if(!disposed){render();repaint();}});render();
  }
  function showEntry(id,focus=false){selected=id;placing=false;place.setAttribute('aria-pressed','false');setOpen(true);renderDetail();renderScenario();for(const b of list.querySelectorAll('[data-enemy-id]'))b.setAttribute('aria-pressed',String(b.dataset.enemyId===id));const entry=selectedEntry();if(focus&&entry)onFocus(entry);repaint();}
  function appendFields(parent,fields){const dl=node('dl');for(const[key,value]of fields){dl.append(node('dt',key),node('dd',value));}parent.append(dl);}
  function appendCandidates(parent,enemies,title='可生成角色'){
    if(!enemies.length)return;const names=node('div','','wm-enemy-names');names.append(node('strong',title));
    for(const e of enemies){const item=node('div','','wm-enemy-candidate'),link=node(e.href?'a':'span',e.name);if(e.href&&/^\/enemies\/[A-Za-z0-9_-]+\/$/.test(e.href)){link.href=e.href;link.target='_blank';link.rel='noopener';link.title='在新标签页查看角色资料';}
      if(e.image&&/^\/assets\/enemies\//.test(e.image)){const img=node('img');img.src=e.image;img.alt='';img.loading='lazy';link.prepend(img);}item.append(link);
      if(Number.isFinite(e.chance))item.append(node('small',`${(e.chance*100).toLocaleString('zh-CN',{maximumSignificantDigits:3})}%${e.minimumLevel?' · 保险等级≥'+e.minimumLevel:''}`));names.append(item);
    }parent.append(names);
  }
  function renderDetail(){
    detail.replaceChildren();const entry=selectedEntry();detail.hidden=!entry;if(!entry)return;
    const title=node('h3',entry.title),meta=node('p',`${kinds[entry.kind]} · X ${entry.position[0].toFixed(1)} / Z ${entry.position[2].toFixed(1)}`);detail.append(title,meta);if(entry.groupLabel)detail.append(node('p',entry.groupLabel));
    const focus=node('button','定位此处');focus.type='button';listenOnce(focus,'click',()=>onFocus(entry));detail.append(focus);appendFields(detail,entry.fields);
    appendCandidates(detail,entry.enemies);
  }
  function listenOnce(el,event,fn){el.addEventListener(event,fn);}
  function renderScenario(){
    const roam=data?.maps[mapId]?.roaming,support=selectedEntry()?.role==='support'?selectedEntry():null;
    scenario.hidden=!roam&&!entries().some(e=>e.role==='support');place.disabled=!scenarioEnabled();
    place.textContent=placing?'请在地图上点选位置':'点选假设玩家位置';
    reset.hidden=!player;
    scenarioNote.textContent=support?'增援位置几何示意：先在关联据点内点选玩家位置；不排除障碍或游戏视野。':roam?'游荡环带几何示意：点选假设玩家位置，不代表实际敌怪或真实刷新率。':'选择一个支援方向，再点选假设玩家位置。';
    if(player&&support&&!containsPoint(support.bastionPolygon,player))scenarioNote.textContent='假设玩家位置在关联据点外，不满足支援触发条件。';
  }
  function render(){
    if(disposed)return;const current=filtered(),hasBirths=current.some(e=>e.kind==='birth');heading.textContent='敌怪';note.textContent=displayMode==='soft'?(hasBirths?'色斑表现候选点聚集程度，扩散为视觉处理；规则区域不限制敌人移动。':'柔和色面表示区域规则；支援图标表示来源方向，不是固定出生点。'):'出生点是地图初始化候选；区域边界不限制敌人移动。';legend.hidden=displayMode!=='soft'||!hasBirths;feedback.replaceChildren();list.replaceChildren();
    if(loading){feedback.textContent='正在读取敌怪资料…';return;}
    if(error){feedback.append(node('span',error));const retry=node('button','重试');retry.type='button';listenOnce(retry,'click',load);feedback.append(retry);return;}
    heading.textContent=`敌怪 · ${current.length}`;
    if(!current.length)feedback.textContent=data?'当前地图或筛选下没有对应标注。':'';
    for(const e of current){const button=node('button');button.type='button';button.dataset.enemyId=e.id;button.setAttribute('aria-pressed',String(e.id===selected));const title=node('span',e.title),sub=node('small',e.role==='support'?'支援方向 · 首波5 / 后续'+e.interval:e.active===false?'配置参考 · 默认未启用':e.groupLabel||kinds[e.kind]);button.append(title,sub);listenOnce(button,'click',()=>showEntry(e.id,true));list.append(button);}
    const roam=data?.maps[mapId]?.roaming;
    if(roam){const summary=node('details','','wm-enemy-roaming');summary.append(node('summary','本图游荡生成规则'));appendFields(summary,roam.fields);summary.append(node('p','百分比为选定有效位置后的一次池抽取占比，不是每局遇敌率；等级不符或空分支不重新分配概率。'));appendCandidates(summary,roam.enemies,roam.rainEnemies?'普通天气候选':'游荡候选');if(roam.rainEnemies)appendCandidates(summary,roam.rainEnemies,'雨天候选');list.prepend(summary);}
    renderDetail();renderScenario();
  }
  listen(close,'click',()=>setOpen(false));
  listen(visible,'change',()=>{enabled=visible.checked;if(!enabled)stopPlacing();for(const b of buttons())b.setAttribute('aria-pressed',String(enabled));renderScenario();repaint();});
  listen(controls,'change',event=>{const kind=event.target.dataset.enemyKind;if(!kind)return;if(event.target.checked)active.add(kind);else active.delete(kind);if(selectedEntry()&&!active.has(selectedEntry().kind))selected=null;if(!scenarioEnabled())stopPlacing();render();repaint();});
  listen(search,'input',()=>{query=search.value;render();repaint();});
  listen(displaySelect,'change',()=>{displayMode=displaySelect.value;clearDensity();render();repaint();});
  listen(place,'click',()=>{enabled=visible.checked=true;for(const b of buttons())b.setAttribute('aria-pressed','true');placing=!placing;place.setAttribute('aria-pressed',String(placing));renderScenario();repaint();});
  listen(reset,'click',()=>{player=null;placing=false;place.setAttribute('aria-pressed','false');renderScenario();repaint();});
  function draw(ctx,project,{surface,width,height,floorBounds=null,gpuDensity=false,projectPolygon=points=>points.map(project)}){
    if(disposed||!enabled||!data||!mapId){hits.delete(surface);clips.delete(surface);return;}
    const style=getComputedStyle(host),colors={birth:style.getPropertyValue('--warning').trim(),rules:style.getPropertyValue('--accent').trim(),reinforce:style.getPropertyValue('--error-text').trim()},drawn=[];
    ctx.save();ctx.font='600 12px '+style.fontFamily;
    clips.delete(surface);if(floorBounds){const p=projectPolygon([[floorBounds.min[0],0,floorBounds.min[2]],[floorBounds.max[0],0,floorBounds.min[2]],[floorBounds.max[0],0,floorBounds.max[2]],[floorBounds.min[0],0,floorBounds.max[2]]]);path(p);ctx.clip();clips.set(surface,p.map(p=>[p[0],0,p[1]]));}
    function path(points){ctx.beginPath();for(const[p,i]of points.map((p,i)=>[p,i])){if(i)ctx.lineTo(...p);else ctx.moveTo(...p);}ctx.closePath();}
    const current=filtered(),buckets=new Map();
    for(const e of current.filter(e=>e.polygon)){
      const polygon=projectPolygon(e.polygon);if(polygon.length<3||!polygon.every(p=>p.every(Number.isFinite)))continue;
      ctx.strokeStyle=colors[e.kind];ctx.fillStyle=colors[e.kind];ctx.lineWidth=e.id===selected?2:1;ctx.setLineDash(e.active===false?[3,6]:e.kind==='reinforce'?[7,4]:[]);path(polygon);
      ctx.save();ctx.globalAlpha=e.active===false?.025:.10;if(displayMode==='soft'&&e.active!==false)ctx.filter='blur(7px)';ctx.fill();ctx.restore();
      if(displayMode!=='soft'||e.id===selected||e.active===false){ctx.globalAlpha=e.active===false?.35:.65;ctx.stroke();}ctx.globalAlpha=1;drawn.push({entries:[e],polygon});
    }
    ctx.setLineDash([]);
    const density=getDensity();
    if(density&&!gpuDensity){
      const [x0,z0,x1,z1]=density.bounds,p=project([x0,0,z0]),u=project([x1,0,z0]),v=project([x0,0,z1]);
      ctx.save();ctx.transform((u[0]-p[0])/density.canvas.width,(u[1]-p[1])/density.canvas.width,(v[0]-p[0])/density.canvas.height,(v[1]-p[1])/density.canvas.height,...p);ctx.drawImage(density.canvas,0,0);ctx.restore();
    }
    for(const e of current){const p=project(e.position);if(!p.every(Number.isFinite)||p[0]<-18||p[1]<-18||p[0]>width+18||p[1]>height+18)continue;const key=e.id===selected?e.id:e.kind+':'+Math.floor(p[0]/26)+':'+Math.floor(p[1]/26);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push({e,p});}
    for(const group of buckets.values()){
      const e=group[0].e,x=group.reduce((n,g)=>n+g.p[0],0)/group.length,y=group.reduce((n,g)=>n+g.p[1],0)/group.length,precise=displayMode!=='soft'||e.id===selected,r=precise?(group.length>1?12:8):e.role==='support'?4:2.5;
      ctx.globalAlpha=e.active===false?.6:1;ctx.fillStyle=style.getPropertyValue('--deep').trim();ctx.strokeStyle=e.id===selected?style.getPropertyValue('--text').trim():colors[e.kind];ctx.lineWidth=e.id===selected?3:2;
      if(!precise){ctx.globalAlpha=e.active===false?.35:e.kind==='birth'?.35:.6;ctx.fillStyle=e.kind==='birth'?colors.rules:colors[e.kind];ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.75;}
      ctx.beginPath();if(e.role==='support'){ctx.moveTo(x,y-r);ctx.lineTo(x+r,y+r);ctx.lineTo(x-r,y+r);ctx.closePath();}else if(e.kind==='rules')ctx.rect(x-r,y-r,2*r,2*r);else ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.stroke();
      if(group.length>1&&precise){ctx.fillStyle=colors[e.kind];ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(group.length),x,y);}
      if(e.id===selected){ctx.fillStyle=style.getPropertyValue('--text').trim();ctx.textAlign='left';ctx.fillText(e.title,x+14,y-12);}
      drawn.push({entries:group.map(g=>g.e),point:[x,y],r:15});
    }
    ctx.globalAlpha=1;
    if(player&&scenarioEnabled()){
      const support=selectedEntry()?.role==='support'?selectedEntry():null,roam=data.maps[mapId]?.roaming;
      if(support&&active.has('reinforce')&&containsPoint(support.bastionPolygon,player)){ctx.strokeStyle=colors.reinforce;ctx.fillStyle=colors.reinforce;path(projectPolygon(supportBand(player,support.position)));ctx.globalAlpha=.18;ctx.fill();ctx.globalAlpha=1;ctx.setLineDash([5,4]);ctx.stroke();}
      else if(roam&&active.has('rules')){for(const r of[24,32]){ctx.strokeStyle=colors.rules;ctx.setLineDash([5,4]);path(projectPolygon(Array.from({length:96},(_,i)=>[player[0]+r*Math.cos(i*Math.PI/48),0,player[2]+r*Math.sin(i*Math.PI/48)])));ctx.stroke();}}
      ctx.setLineDash([]);const[x,y]=project(player);if(Number.isFinite(x)&&Number.isFinite(y)){ctx.fillStyle=style.getPropertyValue('--text').trim();ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();ctx.textAlign='left';ctx.fillText('假设玩家 · 几何示意',x+10,y+20);}
    }
    ctx.restore();hits.set(surface,drawn);
  }
  function hit(surface,x,y,pointsOnly=false){
    if(!enabled||disposed||placing)return null;
    if(clips.has(surface)&&!containsPoint(clips.get(surface),[x,0,y]))return null;
    const all=hits.get(surface)||[];const point=all.filter(h=>h.point).sort((a,b)=>(a.point[0]-x)**2+(a.point[1]-y)**2-((b.point[0]-x)**2+(b.point[1]-y)**2)).find(h=>(h.point[0]-x)**2+(h.point[1]-y)**2<=h.r*h.r);
    if(point)return point;if(pointsOnly)return null;
    return [...all].reverse().find(h=>h.polygon&&containsPoint(h.polygon.map(p=>[p[0],0,p[1]]),[x,0,y]))||null;
  }
  function selectHit(hit){
    if(hit.entries.length===1){showEntry(hit.entries[0].id);return;}
    setOpen(true);selected=null;renderDetail();list.replaceChildren();feedback.textContent=`此处聚合${hit.entries.length}项，选择一项查看详情。`;
    for(const e of hit.entries){const button=node('button',e.title);button.type='button';listenOnce(button,'click',()=>showEntry(e.id,true));list.append(button);}
  }
  return {toggle:()=>setOpen(!open),setOpen,syncContainer,draw,getDensity,hit,selectHit,
    placePlayer(position){if(!placing||!scenarioEnabled()||!position?.every(Number.isFinite))return false;player=[position[0],0,position[2]];stopPlacing();renderScenario();repaint();return true;},
    setMap(id){mapId=id;selected=null;player=null;placing=false;clearDensity();place.setAttribute('aria-pressed','false');hits.clear();render();repaint();},
    setBounds(value){bounds=value;render();repaint();},
    metrics:()=>({open,enabled,loading,error,mapId,selected,placing,player,displayMode,densityBuilds,densitySurfaces:densityCache?1:0,densityKernels:enabled&&displayMode==='soft'?densityCache?.kernels||0:0,densityBakeMs:densityCache?.bakeMs||0,counts:Object.fromEntries(Object.keys(kinds).map(k=>[k,entries().filter(e=>e.kind===k).length])),visibleIds:enabled?filtered().map(e=>e.id):[],drawnPoints:[...(hits.get('stage')||[])].filter(h=>h.point).map(h=>({ids:h.entries.map(e=>e.id),x:h.point[0],y:h.point[1]}))}),
    dispose(){disposed=true;listeners.forEach(fn=>fn());hits.clear();clips.clear();clearDensity();data=null;panel.remove();}
  };
}
