let identity=0;

export function mountFloorPlan(container,{atlasUrl,atlas,floors,current=1,transit,transitTypes={},transitUV,onOpen,onSelectTransit=()=>{},onError=()=>{}}){
  if(!(atlas?.width>0&&atlas?.height>0)||!Array.isArray(floors)||!floors.length)throw new Error('平面楼层底图未就绪');
  const controller=new AbortController(),signal=controller.signal,ns='http://www.w3.org/2000/svg',uid='wm-plan-'+(++identity);
  const node=(tag,cls,text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
  const svg=(tag,attributes={})=>{const n=document.createElementNS(ns,tag);for(const[k,v]of Object.entries(attributes))n.setAttribute(k,v);return n;};
  const listen=(target,type,fn)=>target.addEventListener(type,fn,{signal});
  const root=node('div','wm-floor-plan-view'),canvas=node('div','wm-floor-plan-canvas'),connections=svg('svg',{class:'wm-plan-connections','aria-hidden':'true'}),defs=svg('defs');
  root.hidden=true;root.tabIndex=0;root.setAttribute('role','region');root.setAttribute('aria-label','办公室平面楼层画布，拖动平移，滚轮或加减键缩放，0查看全图，F聚焦楼层');connections.append(defs);root.append(canvas,connections);container.append(root);
  const reducedMotion=matchMedia('(prefers-reduced-motion:reduce)'),ordered=[...floors].sort((a,b)=>a.id-b.id),tiles=[],nodes=new Map(),routes=[],routeByEdge=new Map();
  const state={available:true,visible:false,current,enabled:true,selected:null,kind:null,routeFocus:null};
  let disposed=false,frame=0,layoutDirty=true,width=0,height=0,columns=0,scale=1,motionUntil=0,pointerFloor=null,focusFloor=null,pointerNode=null,focusNode=null,attentionFloor=current;
  let activeRouteIds=[],gutters={x:[],y:[]},layoutRecalculations=0,pathRecalculations=0,pathKey='',previewMode='idle',summaryGroups=[],summaryRaw=new Map();
  const camera={x:0,y:0,zoom:1,width:0,height:0,fit:true},pointers=new Map();let gesture=null,suppressClickUntil=0,holdHoverUntil=0;
  const controls=node('div','wm-plan-camera-controls'),zoomText=node('output','wm-plan-zoom');controls.setAttribute('aria-label','平面画布视角');
  for(const [action,text,title]of [['out','−','缩小'],['in','+','放大'],['fit','全图','适应全图（0）'],['focus','聚焦楼层','聚焦关注楼层（F）']]){const b=node('button','',text);b.type='button';b.dataset.planCamera=action;b.title=title;b.setAttribute('aria-label',title);controls.append(b);}
  controls.append(zoomText);root.append(controls);
  const label=p=>`${p.floor}F · ${transitTypes[p.kind]?.label||p.kind}${p.self?' · '+p.self:''}`;
  const color=kind=>transitTypes[kind]?.color||'#9bc6ad';
  const request=()=>{if(!disposed&&state.visible&&!document.hidden&&!frame)frame=requestAnimationFrame(render);};
  function hover(){return {floor:pointerFloor||focusFloor||attentionFloor,node:pointerNode||focusNode};}
  function updateHover(){
    const h=hover();for(const tile of tiles)tile.element.classList.toggle('is-hovered',tile.floor.id===h.floor);
    motionUntil=reducedMotion.matches?0:performance.now()+160;request();
  }
  function nearestMarker(event){
    if(!state.enabled)return null;
    const base=root.getBoundingClientRect(),x=event.clientX-base.left,y=event.clientY-base.top;
    let nearest=null,distance=Infinity;
    for(const tile of tiles)for(const marker of tile.markers){const p=nodes.get(marker.group[0].data.id)?.point;if(!p)continue;const q=project(p),dx=x-q[0],dy=y-q[1],d=dx*dx+dy*dy;if(Math.abs(dx)<=12&&Math.abs(dy)<=12&&d<distance){nearest=marker;distance=d;}}
    return nearest;
  }
  listen(root,'pointermove',event=>{if(gesture||performance.now()<holdHoverUntil)return;const marker=nearestMarker(event),id=marker?(marker.group.find(n=>n.data.id===state.selected)||marker.group[0]).data.id:null;if(marker)attentionFloor=marker.group[0].data.floor;if(pointerNode!==id){pointerNode=id;updateHover();}});
  listen(root,'pointerleave',()=>{if(gesture||performance.now()<holdHoverUntil)return;pointerFloor=pointerNode=null;updateHover();});
  for(const [kind,type]of Object.entries(transitTypes)){
    const arrow=svg('marker',{id:uid+'-'+kind,viewBox:'0 0 10 10',refX:8,refY:5,markerWidth:9,markerHeight:9,markerUnits:'userSpaceOnUse',orient:'auto-start-reverse'});arrow.append(svg('path',{d:'M 1 1 L 9 5 L 1 9 Z',fill:type.color}));defs.append(arrow);
  }
  for(const floor of ordered){
    const r=floor.rect,w=r[2]-r[0]+6,h=r[3]-r[1]+6,element=node('section','wm-plan-floor'),heading=node('h3','wm-plan-number',floor.id+'F'),open=node('button','wm-plan-open');
    element.dataset.planFloor=String(floor.id);element.setAttribute('aria-label',floor.id+'F');open.type='button';open.dataset.planOpen=String(floor.id);open.setAttribute('aria-label','展开 '+floor.id+'F');heading.dataset.planNumber=String(floor.id);
    const image=svg('svg',{viewBox:`${r[0]-3} ${r[1]-3} ${w} ${h}`,class:'wm-plan-image','aria-hidden':'true'}),crop=svg('clipPath',{id:uid+'-crop-'+floor.id});crop.append(svg('rect',{x:r[0]-2,y:r[1]-2,width:w-2,height:h-2}));const clipDefs=svg('defs');clipDefs.append(crop);const source=svg('image',{href:atlasUrl,width:atlas.width,height:atlas.height,'clip-path':`url(#${uid}-crop-${floor.id})`});listen(source,'error',()=>onError('楼层底图暂时无法读取，可返回单层地图重试。'));image.append(clipDefs,source);open.append(image);element.append(open);canvas.append(element);root.append(heading);
    const tile={floor,element,open,heading,width:w,height:h,markers:[]};tiles.push(tile);
    const groups=new Map();for(const p of transit?.nodes||[]){if(p.floor!==floor.id)continue;const uv=transitUV?.(p,floor);if(!Array.isArray(uv)||uv.length!==2||uv.some(v=>!Number.isFinite(v)))continue;const key=uv.join(':');if(!groups.has(key))groups.set(key,[]);groups.get(key).push({data:p,uv});}
    for(const group of groups.values()){
      const marker=node('button','wm-plan-marker');marker.type='button';marker.dataset.planTransitNode=group[0].data.id;marker.dataset.planTransitIds=group.map(n=>n.data.id).join('|');marker.setAttribute('aria-label',group.map(n=>label(n.data)).join('；'));root.append(marker);const entry={element:marker,group};tile.markers.push(entry);
      for(const p of group)nodes.set(p.data.id,{...p,tile,marker});
      listen(marker,'focus',()=>{pointerFloor=pointerNode=null;focusFloor=attentionFloor=floor.id;focusNode=group.find(n=>n.data.id===state.selected)?.data.id||group[0].data.id;updateHover();});listen(marker,'blur',()=>{focusNode=focusFloor=null;updateHover();});
      listen(marker,'click',event=>{event.stopPropagation();const picked=event.detail?nearestMarker(event)||entry:entry,i=picked.group.findIndex(n=>n.data.id===state.selected),id=picked.group[(i+1)%picked.group.length].data.id;picked.element.focus({preventScroll:true});setTransitSelection(id);pointerNode=event.detail?id:null;focusNode=id;updateHover();onSelectTransit(id);});
    }
    listen(open,'click',()=>onOpen(floor.id));listen(open,'focus',()=>{pointerFloor=pointerNode=null;focusFloor=attentionFloor=floor.id;focusNode=null;updateHover();});listen(open,'blur',()=>{focusFloor=null;updateHover();});listen(element,'pointerenter',()=>{if(gesture||performance.now()<holdHoverUntil)return;pointerFloor=attentionFloor=floor.id;updateHover();});listen(element,'pointerleave',()=>{if(gesture||performance.now()<holdHoverUntil)return;pointerFloor=pointerNode=null;updateHover();});
  }
  const leaders=svg('g'),labels=svg('g'),seen=new Map();for(const e of transit?.edges||[]){
    if(e.from===e.to||!nodes.has(e.from)||!nodes.has(e.to))continue;
    const key=e.bidirectional?[e.from,e.to].sort().join('|'):e.id;
    if(seen.has(key)){const r=seen.get(key);r.rawEdges.push(e);r.edgeIds.push(e.id);routeByEdge.set(e.id,r);continue;}
    const kind=nodes.get(e.from).data.kind,element=svg('g',{'data-plan-route':e.id}),line=svg('path',{fill:'none',stroke:color(kind),'stroke-width':2.5,'stroke-linejoin':'round','stroke-linecap':'round','vector-effect':'non-scaling-stroke'}),leader=svg('path',{fill:'none',stroke:color(kind),'stroke-width':1,opacity:.65,hidden:''}),tag=svg('g',{'data-plan-route-label':e.id,hidden:''}),back=svg('rect',{rx:3,width:78,height:24}),text=svg('text',{'text-anchor':'middle','dominant-baseline':'central'}),title=svg('title');tag.append(back,text);element.append(title,line);leaders.append(leader);labels.append(tag);element.setAttribute('hidden','');connections.append(element);
    const r={id:e.id,from:e.from,to:e.to,kind,bidirectional:Boolean(e.bidirectional),edgeIds:[e.id],rawEdges:[e],element,line,leader,tag,back,text,title,path:[],active:false,label:null};routes.push(r);seen.set(key,r);routeByEdge.set(e.id,r);
  }
  connections.append(leaders,labels);
  function layout(){
    width=1440;columns=3;const padding=64,gapX=128,gapY=112,labelHeight=28,maxWidth=Math.max(...tiles.map(t=>t.width)),cellWidth=(width-padding*2-gapX*(columns-1))/columns;scale=Math.min(1.35,cellWidth/maxWidth);
    const rows=Math.ceil(tiles.length/columns),rowHeights=Array.from({length:rows},(_,row)=>Math.max(...tiles.slice(row*columns,(row+1)*columns).map(t=>t.height))*scale+labelHeight),tops=[];let top=padding;for(const h of rowHeights){tops.push(top);top+=h+gapY;}height=top-gapY+padding;
    gutters={x:[padding/2],y:[padding/2]};for(let c=0;c<columns-1;c++)gutters.x.push(padding+(c+1)*cellWidth+c*gapX+gapX/2);gutters.x.push(width-padding/2);for(let row=0;row<rows-1;row++)gutters.y.push(tops[row]+rowHeights[row]+gapY/2);gutters.y.push(height-padding/2);
    for(let i=0;i<tiles.length;i++){const tile=tiles[i],row=Math.floor(i/columns),logical=i%columns,col=row%2?columns-1-logical:logical,x=padding+col*(cellWidth+gapX)+(cellWidth-tile.width*scale)/2,y=tops[row]+labelHeight+(rowHeights[row]-labelHeight-tile.height*scale)/2;tile.row=row;tile.col=col;tile.box={x,y,width:tile.width*scale,height:tile.height*scale};tile.element.style.left=x+'px';tile.element.style.top=y+'px';tile.element.style.width=tile.box.width+'px';tile.open.style.height=tile.box.height+'px';}
    canvas.style.width=width+'px';canvas.style.height=height+'px';layoutDirty=false;layoutRecalculations++;
  }
  function geometry(){
    const base=root.getBoundingClientRect();for(const tile of tiles){const b=tile.open.getBoundingClientRect(),dy=Number.parseFloat(getComputedStyle(tile.element).transform.split(',')[5])||0;tile.rect={left:tile.box.x,right:tile.box.x+tile.box.width,top:tile.box.y+dy,bottom:tile.box.y+dy+tile.box.height};tile.obstacle=tile.rect;tile.screenObstacle={left:b.left-base.left-5,right:b.right-base.left+5,top:b.top-base.top-28,bottom:b.bottom-base.top+5};tile.heading.style.left=((b.left+b.right)/2-base.left)+'px';tile.heading.style.top=(b.top-base.top-26)+'px';tile.heading.classList.toggle('is-current',tile.floor.id===state.current);tile.heading.classList.toggle('is-hovered',tile.floor.id===hover().floor);}
    for(const p of nodes.values()){const r=p.tile.rect,w=r.right-r.left,h=r.bottom-r.top;p.point=[r.left+(p.uv[0]*(p.tile.width-6)+3)/p.tile.width*w,r.top+(p.uv[1]*(p.tile.height-6)+3)/p.tile.height*h];const q=project(p.point);p.marker.style.left=q[0]+'px';p.marker.style.top=q[1]+'px';}
    return base;
  }
  function project(p){return [camera.x+p[0]*camera.zoom,camera.y+p[1]*camera.zoom];}
  function unproject(p){return [(p[0]-camera.x)/camera.zoom,(p[1]-camera.y)/camera.zoom];}
  function fitZoom(){return Math.max(.05,Math.min(2.5,(camera.width-48)/width,(camera.height-88)/height));}
  function boundedZoom(value){return Math.max(fitZoom()*.65,Math.min(2.5,value));}
  function constrainCamera(){for(const [key,size,viewport]of [['x',width,camera.width],['y',height,camera.height]]){const edge=size*camera.zoom<=viewport-48?24:viewport/2-24,other=viewport-edge-size*camera.zoom;camera[key]=Math.max(Math.min(edge,other),Math.min(Math.max(edge,other),camera[key]));}}
  function applyCamera(){constrainCamera();canvas.style.transform=`translate(${camera.x}px,${camera.y}px) scale(${camera.zoom})`;zoomText.value=Math.round(camera.zoom*100)+'%';zoomText.textContent=zoomText.value;connections.setAttribute('viewBox',`0 0 ${camera.width} ${camera.height}`);connections.setAttribute('width',camera.width);connections.setAttribute('height',camera.height);}
  let wheelZoom=null;
  function fitCamera(){wheelZoom=null;holdHoverUntil=performance.now()+180;camera.zoom=fitZoom();camera.x=(camera.width-width*camera.zoom)/2;camera.y=(camera.height-height*camera.zoom)/2;camera.fit=true;applyCamera();request();}
  function zoomAt(zoom,anchor=[camera.width/2,camera.height/2]){holdHoverUntil=performance.now()+180;const p=unproject(anchor);camera.zoom=boundedZoom(zoom);camera.x=anchor[0]-p[0]*camera.zoom;camera.y=anchor[1]-p[1]*camera.zoom;camera.fit=false;applyCamera();request();}
  function focusCamera(){wheelZoom=null;holdHoverUntil=performance.now()+180;const tile=tiles.find(t=>t.floor.id===(focusFloor||nodes.get(state.selected)?.data.floor||hover().floor||state.current));if(!tile?.rect)return;const r=tile.rect,w=Math.max(24,camera.width-Math.min(96,camera.width/4)),h=Math.max(24,camera.height-Math.min(120,camera.height/4));camera.zoom=boundedZoom(Math.min(1.6,w/(r.right-r.left),h/(r.bottom-r.top)));camera.x=camera.width/2-(r.left+r.right)/2*camera.zoom;camera.y=camera.height/2-(r.top+r.bottom)/2*camera.zoom;camera.fit=false;applyCamera();request();}
  function resizeCamera(){const w=root.clientWidth,h=root.clientHeight;if(w===camera.width&&h===camera.height)return;wheelZoom=null;const center=unproject([camera.width/2,camera.height/2]);camera.width=w;camera.height=h;if(camera.fit)fitCamera();else{camera.zoom=boundedZoom(camera.zoom);camera.x=w/2-center[0]*camera.zoom;camera.y=h/2-center[1]*camera.zoom;applyCamera();}}
  function finishGesture(){const ids=[...pointers.keys()];if(ids.length)suppressClickUntil=performance.now()+400;pointers.clear();gesture=null;for(const id of ids)for(const element of[root,...root.querySelectorAll('button')])if(element.hasPointerCapture(id))element.releasePointerCapture(id);root.classList.remove('is-panning');}
  function startGesture(){wheelZoom=null;const points=[...pointers.values()],a=points[0],b=points[1];if(!a)return;const middle=b?[(a.x+b.x)/2,(a.y+b.y)/2]:[a.x,a.y];gesture={start:middle,x:camera.x,y:camera.y,zoom:camera.zoom,distance:b?Math.hypot(a.x-b.x,a.y-b.y):0,anchor:unproject(middle),moved:Boolean(b)};if(b)suppressClickUntil=performance.now()+400;}
  root.addEventListener('click',event=>{if(event.detail&&performance.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();}},{capture:true,signal});
  listen(root,'pointerdown',event=>{if(event.button!==0)return;suppressClickUntil=0;if(event.target.closest('[data-plan-camera]'))return;const b=root.getBoundingClientRect();pointers.set(event.pointerId,{x:event.clientX-b.left,y:event.clientY-b.top});(event.target.closest('button')||root).setPointerCapture(event.pointerId);startGesture();});
  listen(root,'pointermove',event=>{if(!pointers.has(event.pointerId)||!gesture)return;const b=root.getBoundingClientRect();pointers.set(event.pointerId,{x:event.clientX-b.left,y:event.clientY-b.top});const [a,c]=pointers.values(),middle=c?[(a.x+c.x)/2,(a.y+c.y)/2]:[a.x,a.y];if(!gesture.moved&&Math.hypot(middle[0]-gesture.start[0],middle[1]-gesture.start[1])<5)return;gesture.moved=true;suppressClickUntil=performance.now()+400;root.classList.add('is-panning');if(!root.hasPointerCapture(event.pointerId))root.setPointerCapture(event.pointerId);camera.fit=false;if(c){camera.zoom=boundedZoom(gesture.zoom*Math.hypot(a.x-c.x,a.y-c.y)/Math.max(1,gesture.distance));camera.x=middle[0]-gesture.anchor[0]*camera.zoom;camera.y=middle[1]-gesture.anchor[1]*camera.zoom;}else{camera.x=gesture.x+middle[0]-gesture.start[0];camera.y=gesture.y+middle[1]-gesture.start[1];}applyCamera();request();});
  const endPointer=event=>{if(!pointers.has(event.pointerId))return;const moved=gesture?.moved;if(moved||event.type!=='pointerup'){suppressClickUntil=performance.now()+400;holdHoverUntil=performance.now()+180;}pointers.delete(event.pointerId);if(pointers.size){startGesture();gesture.moved=true;}else{gesture=null;root.classList.remove('is-panning');}};
  listen(root,'pointerup',endPointer);listen(root,'pointercancel',endPointer);listen(root,'lostpointercapture',event=>{if(!root.hasPointerCapture(event.pointerId))endPointer(event);});listen(window,'blur',finishGesture);
  root.addEventListener('wheel',event=>{event.preventDefault();event.stopPropagation();const b=root.getBoundingClientRect(),delta=Math.max(-120,Math.min(120,event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?camera.height:1))),anchor=[event.clientX-b.left,event.clientY-b.top],target=boundedZoom((wheelZoom&&Math.sign(delta)===wheelZoom.direction?wheelZoom.target:camera.zoom)*Math.exp(-delta*.0005));if(reducedMotion.matches){zoomAt(target,anchor);return;}wheelZoom={target,anchor,world:unproject(anchor),direction:Math.sign(delta),time:wheelZoom?.time||0};request();},{passive:false,signal});
  listen(controls,'click',event=>{wheelZoom=null;const action=event.target.closest('[data-plan-camera]')?.dataset.planCamera;if(action==='fit')fitCamera();if(action==='focus')focusCamera();if(action==='in'||action==='out')zoomAt(camera.zoom*(action==='in'?1.25:.8));});
  listen(root,'keydown',event=>{if(event.ctrlKey||event.altKey||event.metaKey)return;const key=event.key.toLowerCase();if(['+','=','-','0','f','arrowleft','arrowright','arrowup','arrowdown'].includes(key)){wheelZoom=null;event.preventDefault();event.stopPropagation();if(key==='0')fitCamera();else if(key==='f')focusCamera();else if(['+','=','-'].includes(key))zoomAt(camera.zoom*(key==='-'?.8:1.25));else{camera.fit=false;camera.x+=key==='arrowleft'?64:key==='arrowright'?-64:0;camera.y+=key==='arrowup'?64:key==='arrowdown'?-64:0;applyCamera();request();}}});
  function compact(points){return points.filter((p,i)=>!i||p[0]!==points[i-1][0]||p[1]!==points[i-1][1]).filter((p,i,a)=>!i||i===a.length-1||!((a[i-1][0]===p[0]&&p[0]===a[i+1][0])||(a[i-1][1]===p[1]&&p[1]===a[i+1][1])));}
  function hits(a,b,r){const pad=24;if(a[0]===b[0])return a[0]>r.left-pad&&a[0]<r.right+pad&&Math.max(a[1],b[1])>r.top-pad&&Math.min(a[1],b[1])<r.bottom+pad;if(a[1]===b[1])return a[1]>r.top-pad&&a[1]<r.bottom+pad&&Math.max(a[0],b[0])>r.left-pad&&Math.min(a[0],b[0])<r.right+pad;return true;}
  function routePath(route,offset){
    const source=nodes.get(route.from),target=nodes.get(route.to),blocked=tiles.map(tile=>tile.rect);
    const exit=p=>{const r=p.tile.rect,[x,y]=p.point,choices=[{side:'left',distance:x-r.left,edge:[r.left,y],outer:[gutters.x[p.tile.col]+offset,y]},{side:'right',distance:r.right-x,edge:[r.right,y],outer:[gutters.x[p.tile.col+1]+offset,y]},{side:'top',distance:y-r.top,edge:[x,r.top],outer:[x,gutters.y[p.tile.row]+offset]},{side:'bottom',distance:r.bottom-y,edge:[x,r.bottom],outer:[x,gutters.y[p.tile.row+1]+offset]}];return choices.reduce((a,b)=>b.distance<a.distance?b:a);};
    const a=exit(source),b=exit(target),xs=[...new Set([...gutters.x.map(x=>x+offset),a.outer[0],b.outer[0]])].sort((a,b)=>a-b),ys=[...new Set([...gutters.y.map(y=>y+offset),a.outer[1],b.outer[1]])].sort((a,b)=>a-b),points=ys.flatMap(y=>xs.map(x=>[x,y])),start=points.findIndex(p=>p[0]===a.outer[0]&&p[1]===a.outer[1]),end=points.findIndex(p=>p[0]===b.outer[0]&&p[1]===b.outer[1]),cost=new Map([[start*3,0]]),previous=new Map(),closed=new Set();let found=null;
    while(true){let best=null,value=Infinity;for(const [key,n]of cost)if(!closed.has(key)&&n<value){best=key;value=n;}if(best===null)break;const index=Math.floor(best/3),direction=best%3;if(index===end){found=best;break;}closed.add(best);const col=index%xs.length,row=Math.floor(index/xs.length);for(const [next,dir]of [[col?index-1:-1,1],[col<xs.length-1?index+1:-1,1],[row?index-xs.length:-1,2],[row<ys.length-1?index+xs.length:-1,2]]){if(next<0||blocked.some(r=>hits(points[index],points[next],r)))continue;const key=next*3+dir,n=value+Math.abs(points[next][0]-points[index][0])+Math.abs(points[next][1]-points[index][1])+(direction&&direction!==dir?24:0);if(n<(cost.get(key)??Infinity)){cost.set(key,n);previous.set(key,best);}}}
    route.exits={source:a,target:b};route.lane=offset;
    if(found===null)return [];
    const middle=[];for(let key=found;key!==undefined;key=previous.get(key))middle.unshift(points[Math.floor(key/3)]);
    return compact([source.point,a.edge,...middle,b.edge,target.point]);
  }
  function rounded(points){
    if(!points.length)return '';let d=`M ${points[0].join(' ')}`;for(let i=1;i<points.length-1;i++){const a=points[i-1],p=points[i],b=points[i+1],r=Math.min(7,6*camera.zoom,Math.hypot(p[0]-a[0],p[1]-a[1])/3,Math.hypot(b[0]-p[0],b[1]-p[1])/3),near=q=>{const n=Math.hypot(q[0]-p[0],q[1]-p[1]);return [p[0]+(q[0]-p[0])*r/n,p[1]+(q[1]-p[1])*r/n];};d+=` L ${near(a).join(' ')} Q ${p.join(' ')} ${near(b).join(' ')}`;}return d+' L '+points.at(-1).join(' ');
  }
  function routeLabel(route,occupied){
    const raw=summaryRaw.get(route.id)||(state.routeFocus?route.rawEdges.find(e=>e.id===state.routeFocus):route.rawEdges.find(e=>e.from===(hover().node||state.selected))||route.rawEdges.find(e=>nodes.get(e.from).data.floor===hover().floor)||route.rawEdges[0]),text=`${nodes.get(raw.from).data.floor}F ${previewMode==='floor-summary'||state.routeFocus||!route.bidirectional?'→':'↔'} ${nodes.get(raw.to).data.floor}F`;
    let found=null;
    search:for(let i=1;i<route.screenPath.length;i++){
      const a=route.screenPath[i-1],b=route.screenPath[i],horizontal=a[1]===b[1],axis=horizontal?0:1;
      if(Math.hypot(b[0]-a[0],b[1]-a[1])<20)continue;
      for(const [dx,dy]of [[0,-17],[0,17],[46,0],[-46,0]]){
        const offset=horizontal?dx:dy,fixed=horizontal?a[1]+dy:a[0]+dx,half=horizontal?39:12,crossHalf=horizontal?12:39,limit=horizontal?camera.width:camera.height,crossLimit=horizontal?camera.height:camera.width;
        if(fixed-crossHalf<4||fixed+crossHalf>crossLimit-4)continue;
        let free=[[Math.max(half+4,Math.min(a[axis],b[axis])+offset),Math.min(limit-half-4,Math.max(a[axis],b[axis])+offset)]];
        if(free[0][0]>free[0][1])continue;
        for(const {rect,pad}of [...tiles.map(tile=>({rect:tile.screenObstacle,pad:3})),{rect:{left:controls.offsetLeft,right:controls.offsetLeft+controls.offsetWidth,top:controls.offsetTop,bottom:controls.offsetTop+controls.offsetHeight},pad:4},...occupied.map(rect=>({rect,pad:4}))]){
          const crossMin=horizontal?rect.top:rect.left,crossMax=horizontal?rect.bottom:rect.right;
          if(fixed<=crossMin-crossHalf-pad||fixed>=crossMax+crossHalf+pad)continue;
          const low=(horizontal?rect.left:rect.top)-half-pad,high=(horizontal?rect.right:rect.bottom)+half+pad;
          free=free.flatMap(([start,end])=>high<=start||low>=end?[[start,end]]:[[start,Math.min(end,low)],[Math.max(start,high),end]].filter(([lo,hi])=>lo<=hi));
          if(!free.length)break;
        }
        if(!free.length)continue;
        const middle=(a[axis]+b[axis])/2+offset,position=free.map(([lo,hi])=>Math.max(lo,Math.min(hi,middle))).sort((x,y)=>Math.abs(x-middle)-Math.abs(y-middle))[0],x=horizontal?position:fixed,y=horizontal?fixed:position;
        found={anchor:[x-dx,y-dy],x,y,rect:{left:x-39,right:x+39,top:y-12,bottom:y+12}};break search;
      }
    }
    route.label=found?{text,x:found.x,y:found.y,visible:true}: {text,visible:false,hiddenReason:'no-free-space-in-canvas'};route.tag.toggleAttribute('hidden',!found);route.leader.toggleAttribute('hidden',!found);if(!found)return;occupied.push(found.rect);route.tag.setAttribute('transform',`translate(${found.x} ${found.y})`);route.back.setAttribute('x',-39);route.back.setAttribute('y',-12);route.text.setAttribute('x',0);route.text.setAttribute('y',0);route.text.textContent=text;route.tag.style.setProperty('--plan-route-color',color(route.kind));route.leader.setAttribute('d',`M ${found.anchor.join(' ')} L ${found.x} ${found.y}`);
  }
  function updateMarkers(){
    for(const tile of tiles){tile.element.classList.toggle('is-current',tile.floor.id===state.current);for(const {element,group}of tile.markers){const p=group.find(p=>p.data.id===state.selected)||group[0];element.hidden=!state.enabled;element.style.setProperty('--transit-color',color(p.data.kind));element.textContent=group.length>1?String(group.length):'';element.title=group.map(n=>label(n.data)).join('；');element.setAttribute('aria-pressed',String(group.some(n=>n.data.id===state.selected)));}}
  }
  function previewRoutes(h,node,focused){
    summaryGroups=[];summaryRaw=new Map();
    if(!state.enabled){previewMode='disabled';return [];}
    const eligible=routes.filter(r=>!state.kind||r.kind===state.kind);
    if(focused){previewMode='edge';return eligible.filter(r=>r===focused);}
    if(node){previewMode='node';return eligible.filter(r=>r.from===node||r.to===node);}
    if(!h.floor){previewMode='idle';return [];}
    previewMode='floor-summary';const groups=new Map(),priority={stairs:0,elevator:1,employee:2,president:3};
    for(const route of eligible)for(const raw of route.rawEdges){if(nodes.get(raw.from).data.floor!==h.floor)continue;const toFloor=nodes.get(raw.to).data.floor;if(!groups.has(toFloor))groups.set(toFloor,[]);groups.get(toFloor).push({route,raw});}
    const active=[];for(const [toFloor,all]of [...groups].sort((a,b)=>a[0]-b[0])){const choices=[...all].sort((a,b)=>priority[a.route.kind]-priority[b.route.kind]||a.raw.id.localeCompare(b.raw.id)),chosen=choices[0],members=all.map(({route,raw})=>({routeId:route.id,rawEdgeId:raw.id,from:raw.from,to:raw.to,kind:route.kind,bidirectional:Boolean(raw.bidirectional)}));summaryGroups.push({fromFloor:h.floor,toFloor,representativeRouteId:chosen.route.id,representativeRawEdgeId:chosen.raw.id,rawEdgeIds:members.map(m=>m.rawEdgeId),kinds:[...new Set(members.map(m=>m.kind))],members,routeCount:new Set(members.map(m=>m.routeId)).size});summaryRaw.set(chosen.route.id,chosen.raw);active.push(chosen.route);}
    return active;
  }
  function render(time=0){
    frame=0;if(disposed||!state.visible||document.hidden)return;if(layoutDirty)layout();resizeCamera();
    if(wheelZoom){const z=wheelZoom,target=boundedZoom(z.target),dt=Math.min(40,z.time?time-z.time:16.67);z.time=time;camera.zoom+=(target-camera.zoom)*(1-Math.exp(-dt/65));if(Math.abs(camera.zoom-target)<target*.0002){camera.zoom=target;wheelZoom=null;}camera.x=z.anchor[0]-z.world[0]*camera.zoom;camera.y=z.anchor[1]-z.world[1]*camera.zoom;camera.fit=false;holdHoverUntil=performance.now()+180;}
    applyCamera();geometry();updateMarkers();const h=hover(),node=h.node||state.selected,focused=state.routeFocus?routeByEdge.get(state.routeFocus):null;
    const context=previewRoutes(h,node,null),active=focused?previewRoutes(h,node,focused):context;activeRouteIds=active.map(r=>r.id);
    for(const r of routes){r.active=active.includes(r);r.element.toggleAttribute('hidden',!r.active);r.tag.setAttribute('hidden','');r.leader.setAttribute('hidden','');if(!r.active){r.label=null;continue;}}
    const orderedContext=[...new Set([...context,...active])].sort((a,b)=>{const other=r=>nodes.get(r.from===node?r.to:r.from).data.floor;return other(a)-other(b)||a.kind.localeCompare(b.kind)||a.id.localeCompare(b.id);}),nextKey=orderedContext.map(r=>r.id).join('|')+':'+tiles.map(t=>[t.rect.left,t.rect.top,t.rect.right,t.rect.bottom].map(v=>Math.round(v*1000))).join('|');
    if(nextKey!==pathKey){pathKey=nextKey;pathRecalculations++;for(let i=0;i<orderedContext.length;i++){const r=orderedContext[i],offset=(i-(orderedContext.length-1)/2)*Math.min(4,60/Math.max(1,orderedContext.length-1));r.path=routePath(r,offset);}}
    const occupied=[];
    for(const r of active){if(!r.path.length){r.active=false;r.label=null;r.element.setAttribute('hidden','');continue;}r.screenPath=r.path.map(project);r.line.setAttribute('d',rounded(r.screenPath));const raw=summaryRaw.get(r.id)||(focused?r.rawEdges.find(e=>e.id===state.routeFocus):null),direction=raw?(raw.from===r.from?1:-1):null;r.focusDirection=focused?direction:null;r.displayDirection=direction;r.title.textContent=previewMode==='floor-summary'?`${nodes.get(raw.from).data.floor}F → ${nodes.get(raw.to).data.floor}F · 楼层连通概览，选择交通点查看全部线路`:transitTypes[r.kind]?.label||r.kind;r.line.setAttribute('marker-end',direction===-1?'none':`url(#${uid}-${r.kind})`);r.line.setAttribute('marker-start',direction===-1||direction===null&&r.bidirectional?`url(#${uid}-${r.kind})`:'none');routeLabel(r,occupied);}
    activeRouteIds=active.filter(r=>r.active).map(r=>r.id);
    if(time<motionUntil||wheelZoom)request();
  }
  function setTransitSelection(id){if(disposed||id!==null&&!nodes.has(id))return;if(state.selected!==id)state.routeFocus=null;state.selected=id;request();}
  const observer=new ResizeObserver(()=>request());observer.observe(root);
  listen(reducedMotion,'change',()=>{if(wheelZoom){const z=wheelZoom;wheelZoom=null;zoomAt(z.target,z.anchor);}motionUntil=0;updateHover();});listen(document,'visibilitychange',()=>{if(document.hidden){wheelZoom=null;finishGesture();if(frame)cancelAnimationFrame(frame);frame=0;motionUntil=0;pointerFloor=focusFloor=pointerNode=focusNode=null;for(const tile of tiles)tile.element.classList.remove('is-hovered');}else request();});
  return {
    setCurrent(id){wheelZoom=null;if(disposed||!ordered.some(f=>f.id===Number(id)))return;if(state.current!==Number(id))attentionFloor=Number(id);state.current=Number(id);request();},
    setVisible(value){if(disposed)return;state.visible=Boolean(value);root.hidden=!state.visible;if(!state.visible){wheelZoom=null;finishGesture();pointerFloor=focusFloor=pointerNode=focusNode=null;state.routeFocus=null;if(frame)cancelAnimationFrame(frame);frame=0;}else{updateHover();request();}},
    setTransitSelection,
    setTransitKind(kind){if(disposed||kind!==null&&!transitTypes[kind])return;state.kind=kind;state.routeFocus=null;request();},
    setTransitRoute(id){if(disposed)return false;const r=routeByEdge.get(id);state.routeFocus=r&&(!state.kind||r.kind===state.kind)?id:null;request();return Boolean(state.routeFocus);},
    setTransitEnabled(value){if(disposed)return;state.enabled=Boolean(value);if(!state.enabled)state.routeFocus=null;request();},
    metrics(){const base=root.getBoundingClientRect();return {...state,columns,width,height,scale,zoomPending:Boolean(wheelZoom),camera:{...camera,minZoom:fitZoom()*.65,maxZoom:2.5},attentionFloor:hover().floor,pointerCount:pointers.size,dragging:Boolean(gesture?.moved),viewport:{left:base.left,top:base.top,width:base.width,height:base.height},layoutRecalculations,pathRecalculations,rafPending:frame?1:0,floors:tiles.map(t=>({id:t.floor.id,row:t.row,column:t.col,rect:t.rect})),transit:{enabled:state.enabled,selected:state.selected,kind:state.kind,routeFocus:state.routeFocus,previewMode,groupCount:summaryGroups.length,summaryGroups,animationActive:false,activeRouteIds:[...activeRouteIds],nodes:[...nodes.values()].map(p=>({id:p.data.id,floor:p.data.floor,kind:p.data.kind,atlas:p.data.atlas,uv:p.uv,point:p.point,screen:p.point?{x:base.left+project(p.point)[0],y:base.top+project(p.point)[1]}:null})),routes:routes.map(r=>({id:r.id,from:r.from,to:r.to,kind:r.kind,bidirectional:r.bidirectional,edgeIds:r.edgeIds,active:r.active&&state.enabled,path:r.path,exits:r.exits,lane:r.lane,screenPath:r.screenPath,focusDirection:r.focusDirection,displayDirection:r.displayDirection,representativeRawEdgeId:summaryRaw.get(r.id)?.id||null,label:r.label}))}};},
    dispose(){if(disposed)return;disposed=true;state.visible=false;wheelZoom=null;finishGesture();if(frame)cancelAnimationFrame(frame);frame=0;controller.abort();observer.disconnect();root.remove();state.available=false;}
  };
}
