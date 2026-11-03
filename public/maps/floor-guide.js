// Floor numbers and travel claims are transcribed from the player guide, not native floor metadata.
const {OFFICE_TRANSIT,TRANSIT_TYPES,transitUV}=await import(new URL('./office-transit.js'+new URL(import.meta.url).search,import.meta.url)).catch(()=>({OFFICE_TRANSIT:{nodes:[],edges:[],unresolved:[],unavailable:true},TRANSIT_TYPES:{},transitUV:()=>[0,0]}));
export const OFFICE_FLOORS = [
  {id:1,rect:[23,725,221,873],elevator:[2,3,4,5,7],stairs:[{side:'',to:[2]}],notes:[]},
  {id:2,rect:[268,877,397,983],elevator:[1,4],stairs:[{side:'',to:[3]}],notes:[]},
  {id:3,rect:[1002,367,1132,473],elevator:[1,2,4,5],stairs:[{side:'',to:[2]}],notes:[]},
  {id:4,rect:[727,584,803,668],elevator:[2,6,7],stairs:[{side:'',to:[5]}],notes:[]},
  {id:5,rect:[679,760,810,867],elevator:[3,6,8],stairs:[{side:'',to:[4]}],notes:[]},
  {id:6,rect:[539,450,670,555],elevator:[10],stairs:[],notes:[]},
  {id:7,rect:[457,175,555,399],elevator:[5,11],stairs:[],notes:[]},
  {id:8,rect:[935,542,1054,669],elevator:[1,2,7,10],stairs:[{side:'',to:[9]}],notes:['有普通电梯，没有总裁卡特殊电梯入口。']},
  {id:9,rect:[818,393,949,500],elevator:[],elevatorStatus:'broken',stairs:[{side:'左侧',to:[8,10]},{side:'右侧',to:[8]}],notes:['普通电梯损坏，员工卡电梯仍单独通往 1F；总裁卡特殊电梯不能直达 9F。','专业小队在本层活动，范围待确认。']},
  {id:10,rect:[626,241,782,383],elevator:[1,2,8],stairs:[{side:'左侧',to:[9,11]},{side:'右侧',to:[11]}],notes:['在 10F 游荡，不主动攻击（玩家记录）。','靠近可触发撤离，条件与去向待确认。','可能对应“皮特托”，身份待确认。']},
  {id:11,rect:[151,414,281,519],elevator:[2,3],stairs:[{side:'',to:[10]}],notes:['半人马接近后短暂蓄力，沿直线飞踢。','飞踢后迅速追近，再次蓄力飞踢，循环攻击。']},
  {id:12,rect:[355,512,458,621],elevator:[],stairs:[],notes:['冲刺贴附；贴附时无法使用武器攻击。','原图建议多次快速近战以脱离贴附。','脱离后会吐痰远程攻击；低血时停止移动并原地回血。']}
];
export const OFFICE_PASSWORDS = [{book:2,door:2},{book:5,door:9}];
const BOX_ID='Origin08_1999:grid:126184:2';
const ENCOUNTERS={10:'特殊角色 · 皮克托先生',11:'半人马',12:'牛虻'};
const PASSWORD_AREAS={2:'原图位置：密码本在本层左下附近，密码门在右上附近。',5:'原图位置：密码本在 5F 左侧附近，对应 9F 左上密码门区域。'};
const EMPLOYEE_TARGETS={1:[2,5,6,9,10],2:[1],5:[1],6:[1],9:[1],10:[1]};
const PRESIDENT_FLOORS=[1,2,3,4,5,6,7,10,11];
const CONFIG_NOTES={
  2:'楼梯配置列出 1F、3F；攻略图只记录 3F，通往 1F 待核实。'
};
let imageIdentity=0;

export function floorWorldBounds(floor,atlas){
  const [left,top,right,bottom]=floor.rect,b=atlas.bounds;
  const x=p=>b.min[0]+p/atlas.width*(b.max[0]-b.min[0]);
  const z=p=>b.max[2]-p/atlas.height*(b.max[2]-b.min[2]);
  return {min:[x(left),0,z(bottom)],max:[x(right),0,z(top)]};
}

export function mountFloorGuide({host,stage,atlasUrl,atlas,atlasTexture,focusBounds,projectSource,selectPoi,onShow=()=>{},onHide=()=>{}}){
  if(!(atlas?.width>0&&atlas?.height>0&&atlas.bounds?.min?.length===3&&atlas.bounds?.max?.length===3))throw new Error('楼层底图信息不完整');
  for(const floor of OFFICE_FLOORS)if(floor.rect.some(n=>!Number.isFinite(n))||floor.rect[0]<0||floor.rect[1]<0||floor.rect[2]>atlas.width||floor.rect[3]>atlas.height)throw new Error('楼层范围与底图不匹配');
  const controller=new AbortController(),signal=controller.signal;
  const node=(tag,cls,text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
  const listen=(target,type,fn,options={})=>target.addEventListener(type,fn,{...options,signal});
  let disposed=false,current=1,mode='closed',layout='tower',returnFocus=null,imageFailed=false,towerView=null,towerRequest=null,towerError=null,planView=null,planRequest=null,planError=null;
  let transitEnabled=!OFFICE_TRANSIT.unavailable,selectedTransit=null;
  let transitKind=null,hoveredRoute=null,focusedRoute=null;
  const transitNodes=new Map(OFFICE_TRANSIT.nodes.map(n=>[n.id,n]));
  const mobile=matchMedia('(max-width:700px)');
  const root=node('section','wm-floor-ui wm-floor-guide');root.hidden=true;root.dataset.mode='deck';root.dataset.layout=layout;root.setAttribute('aria-label','办公室楼层导览');
  const bar=node('div','wm-floor-bar'),heading=node('div','wm-floor-heading');
  const title=node('strong','','办公室 · 楼层导览'),provenance=node('span','wm-floor-provenance','交通点按游戏配置标注');heading.append(title,provenance);
  const floorSelect=node('select','wm-floor-select');floorSelect.dataset.floorSelect='';floorSelect.setAttribute('aria-label','查看楼层');
  for(const f of OFFICE_FLOORS)floorSelect.add(new Option(`${f.id}F`,String(f.id)));
  const layouts=node('div','wm-floor-layouts');layouts.setAttribute('role','group');layouts.setAttribute('aria-label','楼层总览方式');for(const [value,text]of [['plan','平面总览'],['tower','立体导览']]){const b=node('button','',text);b.type='button';b.dataset.floorLayout=value;b.setAttribute('aria-pressed',String(value===layout));layouts.append(b);}
  const deckButton=node('button','','楼层总览');deckButton.type='button';deckButton.dataset.floorAction='deck';
  const closeButton=node('button','','返回原地图');closeButton.type='button';closeButton.dataset.floorAction='close';
  const transitButton=node('button','','交通标注');transitButton.type='button';transitButton.dataset.floorAction='transit-toggle';transitButton.setAttribute('aria-pressed',String(transitEnabled));transitButton.disabled=!!OFFICE_TRANSIT.unavailable;
  const centerButton=node('button','','聚焦中心');centerButton.type='button';centerButton.dataset.floorAction='focus-center';centerButton.title='保留观察角度，将楼层塔收回画面中央';
  const resetButton=node('button','','重置视角');resetButton.type='button';resetButton.dataset.floorAction='reset-camera';resetButton.title='恢复默认角度、中心和缩放';bar.append(heading,floorSelect,layouts,transitButton,centerButton,resetButton,deckButton,closeButton);
  const deck=node('div','wm-floor-deck'),gallery=node('div','wm-floor-orbit-host'),planHost=node('div','wm-floor-plan-host'),orbitHint=node('p','wm-floor-orbit-hint','拖动环绕 · 滚轮或双指缩放 · Shift / 右键平移 · 点击楼层展开');planHost.hidden=true;deck.append(gallery,planHost,orbitHint);
  const imageError=node('p','wm-floor-image-error','原生底图暂未加载，可继续阅读楼层文字，或返回原地图重试。');imageError.hidden=true;imageError.setAttribute('role','status');

  function floorImage(floor,large=false){
    const ns='http://www.w3.org/2000/svg',make=(tag,attrs={})=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
    const [x1,y1,x2,y2]=floor.rect,id='wm-floor-clip-'+(++imageIdentity);
    const svg=make('svg',{viewBox:`${x1-3} ${y1-3} ${x2-x1+6} ${y2-y1+6}`,class:'wm-floor-native','aria-hidden':'true'});
    const defs=make('defs'),clip=make('clipPath',{id}),rect=make('rect',{x:x1-2,y:y1-2,width:x2-x1+4,height:y2-y1+4});clip.append(rect);defs.append(clip);
    const image=make('image',{href:atlasUrl,width:atlas.width,height:atlas.height,'clip-path':`url(#${id})`});
    listen(image,'error',()=>{imageFailed=true;imageError.hidden=false;});svg.append(defs,image);
    if(large){const marks=make('g',{class:'wm-transit-svg-marks'});if(!transitEnabled)marks.setAttribute('hidden','');
      for(const group of floorPointGroups(floor)){const p=group.find(p=>p.id===selectedTransit)||group[0],color=TRANSIT_TYPES[p.kind].color;
        const g=make('g',{transform:`translate(${p.atlas[0]} ${p.atlas[1]})`,role:'button',tabindex:'0','data-transit-node':p.id,'data-transit-ids':group.map(n=>n.id).join('|'),'aria-label':pointLabel(p)+(group.length>1?`，同位 ${group.length} 项配置`:'')});
        g.append(make('circle',{r:5,fill:'transparent'}),make('circle',{r:2.5,fill:color,stroke:'#17201b','stroke-width':.8}));const text=make('text',{x:4,y:-3,fill:color,'font-size':5,'stroke-width':0});text.textContent=markerText(p,group.length);g.append(text);marks.append(g);
      }svg.append(marks);
    }
    if(large){svg.removeAttribute('aria-hidden');svg.setAttribute('role','group');svg.setAttribute('aria-label',`${floor.id}F 原生地图，交通点按配置标注`);}
    return svg;
  }
  const detail=node('div','wm-floor-detail-body'),mapSpace=node('div','wm-floor-map-space'),fallbackMap=node('div','wm-floor-fallback-map'),pointLayer=node('div','wm-transit-points');fallbackMap.hidden=true;mapSpace.append(fallbackMap,pointLayer);
  const notes=node('details','wm-floor-notes'),summary=node('summary','wm-floor-notes-summary'),content=node('div','wm-floor-notes-content');notes.open=!mobile.matches;notes.append(summary,content);detail.append(mapSpace,notes);detail.hidden=true;
  const credit=node('footer','wm-floor-credit'),creditLink=node('a','','特别鸣谢 @曦和奇');creditLink.href='https://space.bilibili.com/630565719?spm_id_from=333.788.upinfo.head.click';creditLink.target='_blank';creditLink.rel='noopener noreferrer';creditLink.setAttribute('aria-label','特别鸣谢 @曦和奇，打开其 Bilibili 主页（新窗口）');credit.append(creditLink);
  const transitInspector=node('details','wm-transit-inspector'),transitSummary=node('summary',''),transitBody=node('div','wm-transit-body');transitInspector.append(transitSummary,transitBody);deck.append(transitInspector);
  root.append(bar,imageError,deck,detail,credit);host.append(root);

  function markCurrent(){floorSelect.value=String(current);towerView?.setCurrent(current);planView?.setCurrent(current);for(const b of root.querySelectorAll('[data-floor]'))b.setAttribute('aria-pressed',String(Number(b.dataset.floor)===current));}
  function syncLayout(){gallery.hidden=layout!=='tower';planHost.hidden=layout!=='plan';orbitHint.hidden=layout!=='tower';layouts.hidden=mode!=='deck';centerButton.hidden=resetButton.hidden=mode!=='deck'||layout!=='tower';for(const b of layouts.children)b.setAttribute('aria-pressed',String(b.dataset.floorLayout===layout));towerView?.setVisible(mode==='deck'&&layout==='tower');planView?.setVisible(mode==='deck'&&layout==='plan');const error=layout==='plan'?planError:towerError;imageError.hidden=!error&&!imageFailed;if(error)imageError.textContent=error;}
  function setMode(value){mode=value;root.hidden=value==='closed';root.dataset.mode=value;host.classList.toggle('wm-floor-active',value!=='closed');host.classList.toggle('wm-floor-deck-open',value==='deck');host.classList.toggle('wm-floor-detail',value==='detail');deck.hidden=value!=='deck';detail.hidden=value!=='detail';deckButton.hidden=value==='deck';floorSelect.hidden=false;syncLayout();}
  function fitFloor(){
    if(disposed||mode!=='detail')return;
    const floor=OFFICE_FLOORS.find(f=>f.id===current),s=stage.getBoundingClientRect(),m=mapSpace.getBoundingClientRect();
    const insets={left:Math.max(0,m.left-s.left),right:Math.max(0,s.right-m.right),top:Math.max(0,m.top-s.top),bottom:Math.max(0,s.bottom-m.bottom)};
    host.style.setProperty('--wm-floor-map-top',insets.top+'px');host.style.setProperty('--wm-floor-map-right',insets.right+'px');
    fallbackMap.hidden=focusBounds(floorWorldBounds(floor,atlas),insets)!==false;
    updateProjection();
  }
  function markerText(p,count){return count>1?String(count):p.self?'':p.verification?'·':'?';}
  function pointLabel(p){const suffix=p.kind==='stairs'?p.self?.match(/^\d+fs([a-z])$/i)?.[1]:p.kind==='elevator'?p.self?.match(/^\d+f([a-d])$/i)?.[1]:null;const statusLabels={confirmed_no_teleport_route:'未设路线',confirmed_destination_only:'仅抵达',unresolved_target_absent_from_bound_map:'目标缺失',confirmed_noop_self_target:'自指'};const status=statusLabels[p.verification?.status]||(!p.self?'配置待确认':'');return `${p.floor}F · ${p.kind==='stairs'?(p.variant==='hole'?'洞口':'楼梯'):TRANSIT_TYPES[p.kind].label}${suffix?' '+suffix.toUpperCase():''}${p.variant==='lobby'?'（前台）':''}${status?' · '+status:''}`;}
  function floorPointGroups(floor){const groups=new Map();for(const p of OFFICE_TRANSIT.nodes.filter(n=>n.floor===floor.id)){const k=p.atlas.join(':');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(p);}return [...groups.values()];}
  function renderPoints(){
    pointLayer.replaceChildren();const floor=OFFICE_FLOORS.find(f=>f.id===current);
    for(const group of floorPointGroups(floor)){const p=group.find(n=>n.id===selectedTransit)||group[0],b=node('button','wm-transit-marker',markerText(p,group.length));b.type='button';b.dataset.transitNode=p.id;b.dataset.transitIds=group.map(n=>n.id).join('|');b.style.setProperty('--transit-color',TRANSIT_TYPES[p.kind].color);b.title=pointLabel(p)+(group.length>1?`；同位 ${group.length} 项，重复点击切换`:'');b.setAttribute('aria-label',b.title);b.setAttribute('aria-pressed',String(group.some(n=>n.id===selectedTransit)));pointLayer.append(b);}
    for(const g of fallbackMap.querySelectorAll('[data-transit-node]'))g.setAttribute('aria-pressed',String(g.dataset.transitIds.split('|').includes(selectedTransit)));
    updateProjection();
  }
  function updateProjection(){
    pointLayer.hidden=mode!=='detail'||!transitEnabled||!fallbackMap.hidden||typeof projectSource!=='function';if(pointLayer.hidden)return;
    const box=mapSpace.getBoundingClientRect();
    for(const b of pointLayer.children){const p=transitNodes.get(b.dataset.transitNode),s=projectSource(p.position);if(!s){b.hidden=true;continue;}const x=s.x-box.left,y=s.y-box.top;b.hidden=x<0||y<0||x>box.width||y>box.height;b.style.left=x+'px';b.style.top=y+'px';}
  }
  function renderTransitInspector(){
    transitSummary.textContent=selectedTransit?pointLabel(transitNodes.get(selectedTransit)):'交通点与路线';transitSummary.title=transitSummary.textContent;
    if(OFFICE_TRANSIT.unavailable){transitSummary.textContent='交通配置暂时无法读取';transitBody.replaceChildren(node('p','wm-floor-warning','仍可切换楼层、查看原生地图与玩家攻略。重新打开页面可重试交通标注。'));return;}
    transitBody.replaceChildren();delete transitBody.dataset.verificationStatus;const legend=node('div','wm-transit-legend');legend.setAttribute('role','group');legend.setAttribute('aria-label','当前关联线路的类型');for(const [kind,type] of [['all',{label:'全部类型'}],...Object.entries(TRANSIT_TYPES)]){const button=node('button','wm-transit-filter',type.label);button.type='button';button.dataset.transitFilter=kind;button.setAttribute('aria-pressed',String(kind===(transitKind||'all')));if(type.color)button.style.setProperty('--transit-color',type.color);legend.append(button);}transitBody.append(legend);
    const label=node('label','wm-transit-field','选择当前层入口'),select=node('select','');select.dataset.transitSelect='';select.setAttribute('aria-label','选择当前楼层交通点');select.add(new Option('选择交通点',''));for(const p of OFFICE_TRANSIT.nodes.filter(n=>n.floor===current))select.add(new Option(pointLabel(p),p.id));select.value=selectedTransit||'';label.append(select);transitBody.append(label);
    const p=transitNodes.get(selectedTransit);if(!p){transitBody.append(node('p','wm-floor-provenance',layout==='plan'?'悬停查看楼层连通，选择交通点查看全部线路':'悬停楼层查看线路，点击交通点查看目的地。'));return;}
    const keyNames={material_TB_bossCard:'总裁层门禁卡',material_TB_badge_employee:'员工卡'};
    if(p.verification){const messages={confirmed_no_teleport_route:'此点未设置传送路线。',confirmed_destination_only:'仅供抵达，未设置返回路线。',unresolved_target_absent_from_bound_map:'通往 3F 的目标入口缺失，暂不可导航。',confirmed_noop_self_target:'此点没有独立目的地，无法跨层传送。'};if(messages[p.verification.status]){const note=node('p','wm-transit-verification',messages[p.verification.status]);note.dataset.verificationStatus=p.verification.status;transitBody.append(note);}else transitBody.dataset.verificationStatus=p.verification.status;}
    if(p.key)transitBody.append(node('p','wm-transit-condition',`消耗 1 张${keyNames[p.key]||'对应钥匙'}解锁此入口`));
    const outgoing=OFFICE_TRANSIT.edges.filter(e=>e.from===p.id),incoming=OFFICE_TRANSIT.edges.filter(e=>e.to===p.id&&!outgoing.some(o=>o.to===e.from));
    const list=node('div','wm-transit-destinations');for(const e of outgoing){if(e.from===e.to){if(!p.verification)list.append(node('p','wm-floor-warning','此点指向自身，无法跨层传送。'));continue;}const to=transitNodes.get(e.to),b=node('button','wm-transit-destination',`${e.bidirectional?'↔':'→'} ${pointLabel(to)}${to.floor===p.floor?' · 同层':''}`);b.type='button';b.dataset.transitDestination=to.id;b.dataset.transitEdge=e.id;list.append(b);}transitBody.append(list);
    if(!outgoing.length&&!p.verification)transitBody.append(node('p','wm-floor-warning','暂未找到可用目的地。'));
    if(incoming.length)transitBody.append(node('p','wm-floor-provenance','可从 '+[...new Set(incoming.map(e=>transitNodes.get(e.from).floor+'F'))].join('、')+' 抵达此点'));
    const reasons={'missing-self-parameter':'当前入口缺少完整配置','missing-target-parameter':'没有配置目的地','no-matching-self-endpoint':'未找到对应的目标入口','empty-target-token':'原配置含空目标，未绘制此分支'};
    if(!p.verification)for(const u of OFFICE_TRANSIT.unresolved.filter(u=>u.from===p.id)){const targetFloor=u.target?.match(/^(\d+)f/i)?.[1];transitBody.append(node('p','wm-floor-warning',`待确认：${targetFloor?targetFloor+'F · ':''}${reasons[u.reason]||'连接仍需核实'}`));}
    if(outgoing.some(e=>e.from!==e.to))transitBody.append(node('p','wm-floor-provenance','悬停目的地看单条线路，点击查看楼层。'));
  }
  function selectTransit(id){
    const p=transitNodes.get(id);if(id&&!p)return;const active=document.activeElement,hadSelect=active?.matches('[data-transit-select]'),hadMarker=active?.matches('.wm-transit-marker');selectedTransit=p?.id||null;
    clearRoutePreview();
    if(p&&p.floor!==current){current=p.floor;markCurrent();if(mode==='detail'){renderNotes(OFFICE_FLOORS.find(f=>f.id===current));fallbackMap.replaceChildren(floorImage(OFFICE_FLOORS.find(f=>f.id===current),true));fitFloor();}}
    towerView?.setTransitSelection(selectedTransit);planView?.setTransitSelection(selectedTransit);renderTransitInspector();renderPoints();if(p)transitInspector.open=true;if(mode==='detail'&&p)notes.open=true;
    if(hadSelect)transitBody.querySelector('[data-transit-select]').focus({preventScroll:true});else if(hadMarker&&p)[...pointLayer.children].find(b=>b.dataset.transitIds.split('|').includes(p.id))?.focus({preventScroll:true});
  }
  function clearRoutePreview(){hoveredRoute=focusedRoute=null;towerView?.setTransitRoute(null);planView?.setTransitRoute(null);}
  function previewRoute(){towerView?.setTransitRoute(hoveredRoute||focusedRoute);planView?.setTransitRoute(hoveredRoute||focusedRoute);}
  function setTransitKind(kind){if(kind!==null&&!TRANSIT_TYPES[kind])return;transitKind=kind;clearRoutePreview();towerView?.setTransitKind(kind);planView?.setTransitKind(kind);for(const b of root.querySelectorAll('[data-transit-filter]'))b.setAttribute('aria-pressed',String(b.dataset.transitFilter===(kind||'all')));}
  function targetButton(destination,from,kind){
    const b=node('button','wm-floor-target',destination===from?`${destination}F · 待核实`:`${destination}F`);b.type='button';b.dataset.floorAction='target';b.dataset.targetFloor=String(destination);b.dataset.transport=kind;b.setAttribute('aria-label',`查看 ${destination}F`);
    b.disabled=destination===from;b.title=destination===from?'本层自指，待核实':`查看 ${destination}F`;
    return b;
  }
  function renderNotes(floor){
    content.replaceChildren();summary.replaceChildren(node('strong','',`${floor.id}F · 楼层攻略`));
    content.append(transitInspector);renderTransitInspector();
    if(CONFIG_NOTES[floor.id])content.append(node('p','wm-floor-warning',CONFIG_NOTES[floor.id]));
    const cardLink=()=>{const a=node('a','wm-floor-card-link','味享集团 总裁层门禁卡');a.href='#item/material_TB_bossCard';return a;};
    const enemyLink=(id,name)=>{const a=node('a','',name);a.href='#enemy/'+id;if(id==='Office_Horse')a.title='图鉴：半马人';return a;};
    if(floor.id===12){const access=node('section','wm-floor-access');access.append(node('h3','','12F 进出方式'));const steps=node('ol','wm-floor-tips');const card=node('li','','11F ');card.append(enemyLink('Office_Horse','半人马'),document.createTextNode('（马头人）的掉落表包含'),cardLink(),document.createTextNode('，不保证每次掉落。'));steps.append(card,node('li','','在 1–7F、10F 或 11F 的特殊电梯入口解锁，成功解锁消耗 1 张总裁卡。'),node('li','','已解锁入口可前往 12F；从 12F 可免卡返回上述楼层，不含 8F、9F。'));access.append(steps,node('p','wm-floor-exit','返回安全屋：本层有传送点（玩家记录，位置待核实）。'));content.append(access);}
    const transit=node('div','wm-floor-transit');content.append(node('h3','wm-floor-original-routes','交通路线（攻略图）'),transit);
    function routeGroup(label,targets,kind){
      const group=node('section','wm-floor-route wm-floor-route-'+kind),h=node('h3','',label);group.append(h);
      if(!targets.length)group.append(node('p',kind==='elevator'&&floor.elevatorStatus==='broken'?'wm-floor-unavailable':'wm-floor-unknown',kind==='elevator'&&floor.elevatorStatus==='broken'?'玩家记录：损坏，改走楼梯或员工通道':'原图未标注'));
      else{const line=node('div','wm-floor-route-line');line.append(node('span','wm-floor-origin',`${floor.id}F →`));for(const to of targets)line.append(targetButton(to,floor.id,kind));group.append(line);}
      transit.append(group);
    }
    routeGroup('普通电梯',floor.elevator,'elevator');
    if(!floor.stairs.length)routeGroup('楼梯',[],'stairs');else for(const stairs of floor.stairs)routeGroup(stairs.side?`${stairs.side}楼梯`:'楼梯',stairs.to,'stairs');
    if(EMPLOYEE_TARGETS[floor.id])routeGroup('员工卡电梯',EMPLOYEE_TARGETS[floor.id],'employee');
    if(floor.id===12||PRESIDENT_FLOORS.includes(floor.id))routeGroup('总裁电梯',floor.id===12?PRESIDENT_FLOORS:[12],'president');
    if(floor.stairs.some(stairs=>stairs.side))content.append(node('p','wm-floor-provenance','左侧、右侧均按原攻略图的朝向描述。'));
    const passwords=OFFICE_PASSWORDS.filter(p=>p.book===floor.id||p.door===floor.id);
    if(passwords.length){const section=node('section','wm-floor-clue');section.append(node('h3','','密码线索 · 非交通'));
      for(const p of passwords){section.append(node('p','wm-floor-clue-link',`${p.book}F 密码本 → ${p.door}F 密码门`),node('p','wm-floor-provenance',PASSWORD_AREAS[p.book]+' 准确位置待校准。'));if(p.book!==p.door)section.append(targetButton(p.book===floor.id?p.door:p.book,floor.id,'clue'));}content.append(section);}
    if(floor.notes.length){const section=node('section','wm-floor-observations'),h=node('h3','',floor.id===11||floor.id===12?'遭遇提醒 · ':ENCOUNTERS[floor.id]||'本层提醒');if(floor.id===11||floor.id===12)h.append(enemyLink(floor.id===11?'Office_Horse':'Office_Fly',ENCOUNTERS[floor.id]));section.append(h);const list=node('ul','wm-floor-tips');for(const text of floor.notes)list.append(node('li','',text));section.append(list);content.append(section);}
    if(floor.id===11){const access=node('section','wm-floor-access');access.append(node('h3','','掉落与通行'),cardLink(),node('p','','半人马（马头人）掉落表包含总裁卡，不保证每次掉落。特殊电梯在各入口分别消耗 1 张卡解锁，先到 12F，再中转至 1–7F、10F、11F；8F、9F 不在特殊电梯列表中。'));content.append(access);}
    if(floor.id===9){const b=node('button','wm-floor-loot','查看黑潮箱物资');b.type='button';b.dataset.floorAction='loot';content.append(b);}
    const limitations=node('details','wm-floor-limitations');limitations.append(node('summary','','入楼条件与通用提醒'));
    limitations.append(node('p','','原图解锁：击杀纵火博士 → 在传递机提交掉落的“糖纸” → 解锁地图。现有资料另有遗物、白门街88号线索、面试通知与地图坐标；获得坐标不等于已经进入地图。'));
    const special=node('p','','总裁电梯：使用');special.append(cardLink(),document.createTextNode('，各入口分别消耗 1 张卡解锁；已解锁入口再次使用不扣卡，经 12F 中转至 1–7F、10F、11F，不含 8F、9F。员工卡电梯连接 1F 与 2F、5F、6F、9F、10F。'));limitations.append(special);
    limitations.append(node('p','','探索建议：远层坐电梯，近层走楼梯；过不去换另一边。'));content.append(limitations,credit);
    notes.scrollTop=0;transitInspector.scrollTop=0;
  }
  function selectFloor(id){
    const floor=OFFICE_FLOORS.find(f=>f.id===Number(id));if(disposed||!floor)return;
    clearRoutePreview();
    if(mode==='closed')returnFocus=document.activeElement;
    current=floor.id;if(transitNodes.get(selectedTransit)?.floor!==current)selectedTransit=null;setMode('detail');onShow();title.textContent=`${current}F · 单层地图`;markCurrent();towerView?.setTransitSelection(selectedTransit);planView?.setTransitSelection(selectedTransit);renderNotes(floor);fallbackMap.replaceChildren(floorImage(floor,true));fitFloor();renderPoints();floorSelect.focus({preventScroll:true});
  }
  async function ensureTower(){
    if(towerView)return towerView;
    if(!atlasTexture){imageFailed=true;imageError.hidden=false;imageError.textContent='原生底图暂未加载，可使用楼层选择继续阅读。';centerButton.disabled=resetButton.disabled=true;return null;}
    if(!towerRequest)towerRequest=(async()=>{
      const {mountFloorTower}=await import(new URL('./floor-tower.js'+new URL(import.meta.url).search,import.meta.url));
      if(disposed)return null;
      towerView=mountFloorTower(gallery,{atlasTexture,atlas,floors:OFFICE_FLOORS,current,transit:OFFICE_TRANSIT,transitTypes:TRANSIT_TYPES,transitUV,onSelectTransit:selectTransit,onOpen:selectFloor,onError:()=>{towerError='环绕视图暂不可用，可使用楼层选择和平面地图。';imageError.textContent=towerError;imageError.hidden=false;centerButton.disabled=resetButton.disabled=true;}});
      towerView.setTransitEnabled(transitEnabled);towerView.setTransitKind(transitKind);towerView.setTransitSelection(selectedTransit);
      towerView.setVisible(mode==='deck'&&layout==='tower');return towerView;
    })().catch(()=>{if(!disposed){towerError='楼层空间视图暂未加载，可使用楼层选择继续阅读。';imageError.textContent=towerError;imageError.hidden=false;centerButton.disabled=resetButton.disabled=true;}return null;});
    return towerRequest;
  }
  async function ensurePlan(){
    if(planView)return planView;
    if(!planRequest)planRequest=(async()=>{const {mountFloorPlan}=await import(new URL('./floor-plan.js'+new URL(import.meta.url).search,import.meta.url));if(disposed)return null;planView=mountFloorPlan(planHost,{atlasUrl,atlas,floors:OFFICE_FLOORS,current,transit:OFFICE_TRANSIT,transitTypes:TRANSIT_TYPES,transitUV,onOpen:selectFloor,onSelectTransit:selectTransit,onError:error=>{planError=error;if(layout==='plan'){imageError.textContent=error;imageError.hidden=false;}}});planView.setTransitEnabled(transitEnabled);planView.setTransitKind(transitKind);planView.setTransitSelection(selectedTransit);planView.setVisible(mode==='deck'&&layout==='plan');return planView;})().catch(()=>{if(!disposed){planError='平面总览暂未加载，可使用楼层选择继续阅读。';if(layout==='plan'){imageError.textContent=planError;imageError.hidden=false;}}return null;});
    return planRequest;
  }
  function setLayout(value){if(disposed||!['tower','plan'].includes(value))return;clearRoutePreview();layout=value;root.dataset.layout=layout;syncLayout();renderTransitInspector();if(mode==='deck'){title.textContent=layout==='plan'?'办公室 · 平面总览':'办公室 · 空间楼层';if(layout==='plan')ensurePlan();else ensureTower();}}
  function showDeck(){
    if(disposed)return;if(mode==='closed')returnFocus=document.activeElement;
    clearRoutePreview();
    root.append(credit);deck.append(transitInspector);transitInspector.open=false;renderTransitInspector();setMode('deck');onShow();title.textContent=layout==='plan'?'办公室 · 平面总览':'办公室 · 空间楼层';markCurrent();if(layout==='plan')ensurePlan();else ensureTower();
  }
  function close({restoreFocus=true}={}){
    if(disposed||mode==='closed')return;clearRoutePreview();setMode('closed');host.style.removeProperty('--wm-floor-map-top');host.style.removeProperty('--wm-floor-map-right');onHide();if(restoreFocus&&returnFocus?.isConnected)returnFocus.focus({preventScroll:true});returnFocus=null;
  }
  listen(root,'click',event=>{
    const layoutButton=event.target.closest('[data-floor-layout]');if(layoutButton){setLayout(layoutButton.dataset.floorLayout);return;}
    const filter=event.target.closest('[data-transit-filter]');if(filter){setTransitKind(filter.dataset.transitFilter==='all'?null:filter.dataset.transitFilter);return;}
    const marker=event.target.closest('[data-transit-node]');if(marker){const ids=marker.dataset.transitIds.split('|'),i=ids.indexOf(selectedTransit);selectTransit(ids[(i+1)%ids.length]);return;}
    const destination=event.target.closest('[data-transit-destination]');if(destination){const p=transitNodes.get(destination.dataset.transitDestination);selectFloor(p.floor);selectTransit(p.id);return;}
    const button=event.target.closest('[data-floor-action]');if(!button)return;
    if(button.dataset.floorAction==='open')selectFloor(button.dataset.floor);
    if(button.dataset.floorAction==='target')selectFloor(button.dataset.targetFloor);
    if(button.dataset.floorAction==='deck')showDeck();
    if(button.dataset.floorAction==='reset-camera')towerView?.reset();
    if(button.dataset.floorAction==='focus-center')towerView?.focusCenter();
    if(button.dataset.floorAction==='transit-toggle'){clearRoutePreview();transitEnabled=!transitEnabled;button.setAttribute('aria-pressed',String(transitEnabled));towerView?.setTransitEnabled(transitEnabled);planView?.setTransitEnabled(transitEnabled);for(const g of root.querySelectorAll('.wm-transit-svg-marks'))g.toggleAttribute('hidden',!transitEnabled);updateProjection();}
    if(button.dataset.floorAction==='close')close();
    if(button.dataset.floorAction==='loot'&&selectPoi(BOX_ID)===false)button.textContent='箱点未就绪，点击重试';
  });
  listen(floorSelect,'change',()=>selectFloor(floorSelect.value));
  for(const [enter,leave,field]of [['pointerover','pointerout','hover'],['focusin','focusout','focus']]){
    listen(root,enter,event=>{const b=event.target.closest('[data-transit-edge]');if(!b||b.contains(event.relatedTarget))return;if(field==='hover')hoveredRoute=b.dataset.transitEdge;else focusedRoute=b.dataset.transitEdge;previewRoute();});
    listen(root,leave,event=>{const b=event.target.closest('[data-transit-edge]');if(!b||b.contains(event.relatedTarget))return;if(field==='hover')hoveredRoute=null;else focusedRoute=null;previewRoute();});
  }
  listen(root,'change',event=>{if(event.target.matches('[data-transit-select]'))selectTransit(event.target.value||null);});
  listen(notes,'toggle',()=>{if(mode==='detail')fitFloor();});
  listen(root,'keydown',event=>{const marker=event.target.closest('[data-transit-node]');if(marker&&['Enter',' '].includes(event.key)){event.preventDefault();event.stopPropagation();marker.dispatchEvent(new MouseEvent('click',{bubbles:true}));}else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}});
  listen(mobile,'change',()=>{notes.open=!mobile.matches;fitFloor();});
  const observer=new ResizeObserver(()=>fitFloor());observer.observe(mapSpace);
  return {showDeck,close,selectFloor,updateProjection,metrics:()=>({open:mode!=='closed',mode,layout,appearance:'native',floor:current,imageFailed,tower:towerView?.metrics()||null,towerError,plan:planView?.metrics()||null,planError,transit:{enabled:transitEnabled,selected:selectedTransit,nodeCount:OFFICE_TRANSIT.nodes.length,edgeCount:OFFICE_TRANSIT.edges.length,unresolved:OFFICE_TRANSIT.unresolved,points:OFFICE_TRANSIT.nodes.filter(n=>n.floor===current).map(n=>({id:n.id,atlas:n.atlas,uv:transitUV(n,OFFICE_FLOORS.find(f=>f.id===current)),position:n.position}))},floorCount:OFFICE_FLOORS.length,bounds:floorWorldBounds(OFFICE_FLOORS.find(f=>f.id===current),atlas)}),dispose(){if(disposed)return;close({restoreFocus:false});disposed=true;controller.abort();observer.disconnect();towerView?.dispose();planView?.dispose();root.remove();}};
}
