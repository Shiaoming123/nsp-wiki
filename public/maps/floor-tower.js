import * as THREE from './vendor/three.module.js';

export function mountFloorTower(container,{atlasTexture,atlas,floors,current=1,onOpen,onError=()=>{},transit,transitTypes={},transitUV,onSelectTransit=()=>{}}){
  const state={available:false,visible:false,appearance:'native',current,yaw:-.48,pitch:THREE.MathUtils.degToRad(38),distance:80,hovered:null,renderedFrames:0};
  const controller=new AbortController(),signal=controller.signal,target=new THREE.Vector3(),ray=new THREE.Raycaster(),pointer=new THREE.Vector2(),pointers=new Map();
  const theme=getComputedStyle(container),accent=theme.getPropertyValue('--accent').trim()||'#9bc6ad',deep=theme.getPropertyValue('--deep').trim()||'#171e1b';
  const root=document.createElement('div');root.className='wm-floor-tower-view';root.hidden=true;container.append(root);
  const labels=document.createElement('div');labels.className='wm-floor-tower-labels';
  const routeLabels=document.createElement('div');routeLabels.className='wm-transit-route-labels';
  const labelLeaders=document.createElementNS('http://www.w3.org/2000/svg','svg');labelLeaders.classList.add('wm-transit-label-leaders');labelLeaders.setAttribute('aria-hidden','true');routeLabels.append(labelLeaders);
  const centerMark=document.createElement('span');centerMark.className='wm-floor-tower-center';centerMark.setAttribute('aria-hidden','true');centerMark.title='旋转中心';centerMark.textContent='旋转中心';
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1,.1,1000),layers=[];
  const transitState={enabled:true,selected:null,hoveredNode:null,kind:null,routeFocus:null,animationActive:false,previewMode:'none',summaryGroups:[]},transitNodes=new Map(),transitRoutes=[],transitResources=new Set();
  const transitGroup=new THREE.Group(),routeGroup=new THREE.Group();scene.add(transitGroup,routeGroup);
  const reducedMotion=matchMedia('(prefers-reduced-motion:reduce)');let activeRouteIds=[],summaryContext='',summaryEdges=new Map();
  let renderer,texture,pixels,observer,frame=0,disposed=false,firstShow=true,gestureMoved=false,pinch=null,lastPointer=null,projectedFloors=[];
  let wheelZoom=null;
  let labelsDirty=true,labelRecalculations=0,sizeUpdates=0,renderWidth=0,renderHeight=0,transitLayoutDirty=true,transitContext='',routeLayoutUpdates=0;
  const gap=4.8,frameWidth=20,frameDepth=20*244/360,totalHeight=Math.max(0,(floors.length-1)*gap);
  let commonWidth=frameWidth,commonDepth=frameDepth;
  const distanceLimits={min:18,max:160},targetLimits={min:[0,0,0],max:[0,totalHeight,0]};
  const listen=(node,type,fn,options={})=>node.addEventListener(type,fn,{...options,signal});
  const clampDistance=n=>THREE.MathUtils.clamp(n,distanceLimits.min,distanceLimits.max);
  const notify=error=>onError(error instanceof Error?error.message:String(error));
  function invalidate(){if(!disposed&&state.available&&state.visible&&!document.hidden&&!frame)frame=requestAnimationFrame(render);}
  function cancelFrame(){if(frame)cancelAnimationFrame(frame);frame=0;}
  function viewportAspect(){return Math.max(.2,(root.clientWidth||container.clientWidth||1000)/(root.clientHeight||container.clientHeight||650));}
  function clampTarget(){
    const halfView=state.distance*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*Math.min(1,viewportAspect());
    const radius=Math.min(commonWidth*.35,commonDepth*.35,halfView*.65);
    targetLimits.min=[-radius,0,-radius];targetLimits.max=[radius,totalHeight,radius];
    target.clamp(new THREE.Vector3(...targetLimits.min),new THREE.Vector3(...targetLimits.max));
  }
  function fittedDistance(){
    const aspect=viewportAspect(),tangent=Math.tan(THREE.MathUtils.degToRad(camera.fov/2)),direction=new THREE.Vector3(Math.sin(state.yaw)*Math.cos(state.pitch),Math.sin(state.pitch),Math.cos(state.yaw)*Math.cos(state.pitch));
    const right=new THREE.Vector3(Math.cos(state.yaw),0,-Math.sin(state.yaw)),up=new THREE.Vector3().crossVectors(direction,right);
    let distance=Math.max(commonWidth,commonDepth);
    for(const x of [-commonWidth/2,commonWidth/2])for(const y of [-totalHeight/2,totalHeight/2])for(const z of [-commonDepth/2,commonDepth/2]){
      const p=new THREE.Vector3(x,y,z),depth=p.dot(direction);
      distance=Math.max(distance,depth+Math.abs(p.dot(right))/(tangent*aspect*.84),depth+Math.abs(p.dot(up))/(tangent*.84));
    }
    return distance;
  }
  function refreshLimits(){
    distanceLimits.min=Math.max(commonWidth*.85,commonDepth,totalHeight*.28);
    const radius=Math.hypot(commonWidth,totalHeight,commonDepth)/2,halfAngle=Math.atan(Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*Math.min(1,viewportAspect()));
    distanceLimits.max=Math.max(distanceLimits.min*2,radius/Math.sin(halfAngle)*1.8);
    state.distance=clampDistance(state.distance);clampTarget();
  }
  function updateCamera(){
    clampTarget();
    const horizontal=Math.cos(state.pitch)*state.distance;
    camera.position.set(target.x+Math.sin(state.yaw)*horizontal,target.y+Math.sin(state.pitch)*state.distance,target.z+Math.cos(state.yaw)*horizontal);
    camera.lookAt(target);camera.updateMatrixWorld();camera.updateProjectionMatrix();scene.updateMatrixWorld(true);
  }
  function alphaAt(uv){
    const mapped=texture.transformUv(uv.clone()),x=Math.max(0,Math.min(pixels.width-1,Math.floor(mapped.x*pixels.width))),y=Math.max(0,Math.min(pixels.height-1,Math.floor(mapped.y*pixels.height)));
    return pixels.data[(y*pixels.width+x)*4+3]/255;
  }
  function opaqueIntersections(includeTransit=false){
    const result=[],transparentHits=[];
    const objects=layers.map(l=>l.map);if(includeTransit&&transitState.enabled)objects.push(...[...transitNodes.values()].map(n=>n.mesh));
    for(const hit of ray.intersectObjects(objects)){
      if(hit.object.userData.kind==='map'&&alphaAt(hit.uv)<.1){transparentHits.push(hit.object.userData.floor);continue;}
      result.push(hit);
    }
    return {hits:result,transparentHits};
  }
  function pickAt(clientX,clientY){
    if(!state.available||!state.visible||disposed)return null;
    const box=renderer.domElement.getBoundingClientRect();if(!box.width||!box.height)return null;
    updateCamera();pointer.set((clientX-box.left)/box.width*2-1,1-(clientY-box.top)/box.height*2);ray.setFromCamera(pointer,camera);
    const {hits,transparentHits}=opaqueIntersections(true),hit=hits[0];
    if(hit?.object.userData.transitId)return {id:hit.object.userData.floor,kind:'transit',transitId:hit.object.userData.transitId,position:hit.point.toArray(),transparentHits};
    if(transitState.enabled){
      const candidates=[...transitNodes.values()].map(n=>({node:n,p:screen(n.point,box.width,box.height)})).map(n=>({...n,d:(n.p.x-(clientX-box.left))**2+(n.p.y-(clientY-box.top))**2})).filter(n=>n.d<=64&&n.p.z>=-1&&n.p.z<=1).sort((a,b)=>a.d-b.d||a.p.z-b.p.z);
      const near=candidates.find(n=>unobstructed(n.node.point));if(near)return {id:near.node.data.floor,kind:'transit',transitId:near.node.data.id,position:near.node.point.toArray(),transparentHits};
    }
    return hit?{id:hit.object.userData.floor,kind:hit.object.userData.kind,position:hit.point.toArray(),uv:hit.uv?.toArray(),transparentHits}:{id:null,kind:null,transparentHits};
  }
  function unobstructed(point){
    const direction=point.clone().sub(camera.position),distance=direction.length();ray.set(camera.position,direction.normalize());
    const hit=opaqueIntersections().hits[0];return !hit||hit.distance>=distance-.09;
  }
  function screen(point,width,height){const p=point.clone().project(camera);return {x:(p.x+1)*width/2,y:(1-p.y)*height/2,z:p.z};}
  function colorLayers(){
    for(const l of layers){const active=l.floor.id===state.hovered||l.floor.id===state.current;
      l.map.material.color.setRGB(active?1.12:1,active?1.12:1,active?1.12:1);
      l.leader.material.color.set(active?accent:'#8d9e93');
      l.label.classList.toggle('is-current',l.floor.id===state.current);l.label.classList.toggle('is-hovered',l.floor.id===state.hovered);
      l.halo.material.uniforms.strength.value=l.floor.id===state.hovered ? 1.2 : l.floor.id===state.current ? .22 : 0;
      l.halo.visible=l.halo.material.uniforms.strength.value>0;
    }
  }
  function setHovered(id,nodeId=null){if(state.hovered===id&&transitState.hoveredNode===nodeId)return;state.hovered=id;transitState.hoveredNode=nodeId;root.classList.toggle('is-transit-hover',Boolean(nodeId));const node=transitNodes.get(nodeId);if(renderer)renderer.domElement.title=node?`${transitTypes[node.data.kind]?.label||node.data.kind} · ${node.data.floor}F · 点击查看连接`:'';colorLayers();refreshTransit();invalidate();}
  function transitPoint(node){
    const l=layers.find(l=>l.floor.id===node.floor);if(!l)return null;const r=l.floor.rect;
    const uv=transitUV?transitUV(node,l.floor):[(node.atlas[0]-r[0])/(r[2]-r[0]),(node.atlas[1]-r[1])/(r[3]-r[1])];
    if(!Array.isArray(uv)||uv.length!==2||uv.some(n=>!Number.isFinite(n)))return null;
    return new THREE.Vector3((uv[0]-.5)*(r[2]-r[0])/(r[2]-r[0]+6)*l.width,l.group.position.y+.19,(uv[1]-.5)*(r[3]-r[1])/(r[3]-r[1]+6)*l.depth);
  }
  function alongRoute(route,t){
    const distance=THREE.MathUtils.clamp(t,0,1)*route.length;let i=1;while(i<route.lengths.length-1&&route.lengths[i]<distance)i++;
    const a=route.points[i-1],b=route.points[i],segment=route.lengths[i]-route.lengths[i-1],mix=segment?(distance-route.lengths[i-1])/segment:0;
    return {point:a.clone().lerp(b,mix),direction:b.clone().sub(a).normalize()};
  }
  function routePath(source,destination,kind,side=1,lane=0){
    const s=source.clone(),t=destination.clone(),radius=Math.hypot(commonWidth,commonDepth)/2+1.8+lane*.9;
    const a=new THREE.Vector3(Math.cos(state.yaw)*side*radius,s.y,-Math.sin(state.yaw)*side*radius),b=a.clone();b.y=t.y;
    let points;
    if(kind==='stairs')points=[s,a,b,t];
    else{
      const cut=Math.min(.65,Math.abs(s.y-t.y)/4),p=a.clone().lerp(s,cut/a.distanceTo(s)),q=a.clone().lerp(b,cut/Math.max(.001,a.distanceTo(b))),r=b.clone().lerp(a,cut/Math.max(.001,a.distanceTo(b))),u=b.clone().lerp(t,cut/b.distanceTo(t));
      points=[s,p,...new THREE.QuadraticBezierCurve3(p,a,q).getPoints(5).slice(1),r,...new THREE.QuadraticBezierCurve3(r,b,u).getPoints(5).slice(1),t];
    }
    return {points,corridor:{side,radius,lane,anchor:a.clone().lerp(b,.5).toArray()}};
  }
  function writeRouteGeometry(geometry,points){
    const count=(points.length-1)*4;let position=geometry.getAttribute('position');
    if(!position||position.count!==count){position=new THREE.Float32BufferAttribute(new Float32Array(count*3),3);geometry.setAttribute('position',position);geometry.setAttribute('other',new THREE.Float32BufferAttribute(new Float32Array(count*3),3));geometry.setAttribute('side',new THREE.Float32BufferAttribute(new Float32Array(count),1));const indices=[];for(let i=0;i<count;i+=4)indices.push(i,i+1,i+2,i+2,i+1,i+3);geometry.setIndex(indices);}
    const other=geometry.getAttribute('other'),side=geometry.getAttribute('side');
    for(let i=1;i<points.length;i++)for(let j=0;j<4;j++){const n=(i-1)*4+j,p=j<2?points[i-1]:points[i],q=j<2?points[i]:points[i-1];position.setXYZ(n,p.x,p.y,p.z);other.setXYZ(n,q.x,q.y,q.z);side.setX(n,[-1,1,1,-1][j]);}
    position.needsUpdate=other.needsUpdate=side.needsUpdate=true;geometry.computeBoundingSphere();
  }
  function updateRoute(route,layout){
    route.points=layout.points;route.corridor=layout.corridor;route.lengths=[0];for(let i=1;i<route.points.length;i++)route.lengths.push(route.lengths[i-1]+route.points[i].distanceTo(route.points[i-1]));route.length=route.lengths.at(-1);writeRouteGeometry(route.line.geometry,route.points);
    for(const arrow of route.arrows){const sample=alongRoute(route,arrow.userData.direction===1?.42:.58);arrow.position.copy(sample.point);arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),sample.direction.multiplyScalar(arrow.userData.direction));}
  }
  function routeText(route){
    const contextNode=transitState.hoveredNode||transitState.selected,edge=route.rawEdges.find(e=>e.id===transitState.routeFocus)||route.previewEdge||route.rawEdges.find(e=>contextNode?e.from===contextNode:transitNodes.get(e.from).data.floor===state.hovered)||route.rawEdges[0];
    const from=transitNodes.get(edge.from).data.floor,to=transitNodes.get(edge.to).data.floor;return `${from}F ${route.bidirectional&&!transitState.routeFocus&&!route.previewEdge?'↔':'→'} ${to}F`;
  }
  function layoutTransit(width,height){
    const context=transitRoutes.filter(r=>r.inContext).sort((a,b)=>Math.abs(transitNodes.get(a.from).point.y-transitNodes.get(a.to).point.y)-Math.abs(transitNodes.get(b.from).point.y-transitNodes.get(b.to).point.y)||a.id.localeCompare(b.id)),active=context.filter(r=>r.group.visible);
    for(let i=0;i<context.length;i++){const route=context[i];if(route.group.visible)updateRoute(route,routePath(transitNodes.get(route.from).point,transitNodes.get(route.to).point,route.kind,i%2?1:-1,Math.floor(i/2)));}
    for(const style of transitStyles.values())style.line.uniforms.resolution.value.set(width,height);
    labelLeaders.setAttribute('viewBox',`0 0 ${width} ${height}`);
    for(const route of active){route.label.hidden=true;route.labelLeader.style.display='none';}
    for(const side of[-1,1]){
      const rows=active.filter(r=>r.corridor.side===side).map(route=>({route,p:screen(new THREE.Vector3(...route.corridor.anchor),width,height)})).filter(r=>r.p.z>=-1&&r.p.z<=1&&r.p.x>=0&&r.p.x<=width&&r.p.y>=0&&r.p.y<=height).sort((a,b)=>a.p.y-b.p.y);
      const spacing=Math.min(30,(height-24)/Math.max(1,rows.length-1)),column=side<0?Math.max(48,Math.min(...rows.map(r=>r.p.x))-52):Math.min(width-48,Math.max(...rows.map(r=>r.p.x))+52);let previous=12-spacing;
      for(let i=0;i<rows.length;i++){const {route,p}=rows[i],y=Math.min(height-12-(rows.length-i-1)*spacing,Math.max(12,p.y,previous+spacing));previous=y;route.label.hidden=false;route.label.textContent=routeText(route);route.label.title=transitTypes[route.kind]?.label||route.kind;route.label.style.left=column+'px';route.label.style.top=y+'px';route.labelLeader.style.display='';route.labelLeader.setAttribute('d',`M${p.x},${p.y} L${column-side*43},${y}`);route.labelPosition={x:column,y,anchor:p,text:route.label.textContent};}
    }
    for(const route of active)for(const arrow of route.arrows)arrow.scale.setScalar(camera.position.distanceTo(arrow.position)*2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/height*9/.38);
    routeLayoutUpdates++;
  }
  function rebuildTransitRoutes(){
    for(const route of transitRoutes){route.group.removeFromParent();route.line.geometry.dispose();route.label.remove();route.labelLeader.remove();}transitRoutes.length=0;
    const seen=new Map();
    for(const edge of transit?.edges||[]){
      if(edge.from===edge.to)continue;
      const from=transitNodes.get(edge.from),to=transitNodes.get(edge.to);if(!from||!to)continue;
      const key=edge.bidirectional?[edge.from,edge.to].sort().join('|'):edge.id;
      if(seen.has(key)){seen.get(key).edgeIds.push(edge.id);seen.get(key).rawEdges.push(edge);continue;}
      const kind=from.data.kind,style=transitStyles.get(kind);if(!style)continue;
      const group=new THREE.Group(),line=new THREE.Mesh(new THREE.BufferGeometry(),style.line);group.add(line);routeGroup.add(group);
      const label=document.createElement('span');label.className='wm-transit-route-label';label.dataset.routeLabel=edge.id;label.style.setProperty('--route-color',transitTypes[kind]?.color||accent);label.hidden=true;routeLabels.append(label);const labelLeader=document.createElementNS('http://www.w3.org/2000/svg','path');labelLeader.style.stroke=transitTypes[kind]?.color||accent;labelLeaders.append(labelLeader);
      const route={id:edge.id,from:edge.from,to:edge.to,kind,bidirectional:Boolean(edge.bidirectional),edgeIds:[edge.id],rawEdges:[edge],group,line,label,labelLeader,arrows:[],flow:[]};updateRoute(route,routePath(from.point,to.point,kind));
      for(const direction of edge.bidirectional?[1,-1]:[1]){
        const arrow=new THREE.Mesh(transitArrowGeometry,style.arrow),sample=alongRoute(route,direction===1 ? .42 : .58);arrow.userData.direction=direction;arrow.position.copy(sample.point);arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),sample.direction.multiplyScalar(direction));group.add(arrow);route.arrows.push(arrow);
        const dot=new THREE.Mesh(transitFlowGeometry,style.arrow);dot.visible=false;dot.userData.direction=direction;group.add(dot);route.flow.push(dot);
      }
      seen.set(key,route);transitRoutes.push(route);
    }
    refreshTransit();
  }
  const transitStyles=new Map();let transitArrowGeometry,transitFlowGeometry,transitSelectionRing,transitHoverRing;
  function buildTransit(){
    if(!Array.isArray(transit?.nodes)||!transit.nodes.length)return;
    transitArrowGeometry=new THREE.ConeGeometry(.13,.38,5);transitFlowGeometry=new THREE.SphereGeometry(.105,6,4);transitResources.add(transitArrowGeometry);transitResources.add(transitFlowGeometry);
    for(const kind of ['stairs','elevator','employee','president']){
      const color=transitTypes[kind]?.color||{stairs:'#b6c7bc',elevator:'#8db8a0',employee:'#72bdd6',president:'#deb36a'}[kind];
      const geometry=kind==='stairs'?new THREE.OctahedronGeometry(.21):kind==='elevator'?new THREE.BoxGeometry(.32,.2,.32):kind==='employee'?new THREE.CylinderGeometry(.2,.2,.16,8):new THREE.TetrahedronGeometry(.25);
      const marker=new THREE.MeshBasicMaterial({color,depthTest:true,depthWrite:true,toneMapped:false}),arrow=new THREE.MeshBasicMaterial({color,depthTest:true,depthWrite:false,toneMapped:false});
      const line=new THREE.ShaderMaterial({uniforms:{color:{value:new THREE.Color(color)},resolution:{value:new THREE.Vector2(1,1)},width:{value:2.8}},
        vertexShader:`attribute vec3 other;attribute float side;uniform vec2 resolution;uniform float width;
          void main(){vec4 p=projectionMatrix*modelViewMatrix*vec4(position,1.);vec4 q=projectionMatrix*modelViewMatrix*vec4(other,1.);
            float dp=p.z+p.w,dq=q.z+q.w;if(dp<0.&&dq<0.){gl_Position=vec4(2.,2.,2.,1.);return;}
            if(dp<0.||dq<0.){vec4 clipped=mix(p,q,dp/(dp-dq));if(dp<0.)p=clipped;else q=clipped;}
            vec2 d=(q.xy/q.w-p.xy/p.w)*resolution;vec2 n=vec2(-d.y,d.x)/max(length(d),.0001);p.xy+=n*side*width/resolution*p.w;gl_Position=p;}`,
        fragmentShader:`uniform vec3 color;void main(){gl_FragColor=vec4(color,1.);
          #include <colorspace_fragment>
        }`,side:THREE.DoubleSide,depthTest:true,depthWrite:false,toneMapped:false});
      for(const resource of [geometry,marker,line,arrow])transitResources.add(resource);transitStyles.set(kind,{geometry,marker,line,arrow});
    }
    for(const node of transit.nodes){const style=transitStyles.get(node.kind),point=transitPoint(node);if(!style||!point)continue;const mesh=new THREE.Mesh(style.geometry,style.marker);mesh.position.copy(point);mesh.userData={floor:node.floor,transitId:node.id,kind:'transit'};transitGroup.add(mesh);transitNodes.set(node.id,{data:node,point,mesh});}
    const ringGeometry=new THREE.RingGeometry(.26,.34,16);ringGeometry.rotateX(-Math.PI/2);const ringMaterial=new THREE.MeshBasicMaterial({color:accent,side:THREE.DoubleSide,depthTest:true,depthWrite:false,toneMapped:false});transitResources.add(ringGeometry);transitResources.add(ringMaterial);
    transitSelectionRing=new THREE.Mesh(ringGeometry,ringMaterial);transitHoverRing=new THREE.Mesh(ringGeometry,ringMaterial);transitGroup.add(transitSelectionRing,transitHoverRing);rebuildTransitRoutes();
  }
  function refreshTransit(){
    const contextNode=transitState.hoveredNode||transitState.selected,contextFloor=state.hovered;
    const focused=transitState.routeFocus?transitRoutes.find(r=>r.edgeIds.includes(transitState.routeFocus)):null;
    if(transitState.routeFocus&&(!focused||transitState.kind&&focused.kind!==transitState.kind))transitState.routeFocus=null;
    const summaryKey=transitState.enabled&&!contextNode&&!transitState.routeFocus&&contextFloor?contextFloor+':'+transitState.kind:'';
    if(summaryKey!==summaryContext){summaryContext=summaryKey;summaryEdges=new Map();transitState.summaryGroups=[];}
    if(summaryKey&&!summaryEdges.size){
      const ranks={stairs:0,elevator:1,employee:2,president:3},groups=new Map();
      for(const edge of transit?.edges||[]){const from=transitNodes.get(edge.from),to=transitNodes.get(edge.to);if(!from||!to||edge.from===edge.to||from.data.floor!==contextFloor||transitState.kind&&from.data.kind!==transitState.kind)continue;const group=groups.get(to.data.floor)||[];group.push(edge);groups.set(to.data.floor,group);}
      for(const [floor,edges]of groups){edges.sort((a,b)=>ranks[transitNodes.get(a.from).data.kind]-ranks[transitNodes.get(b.from).data.kind]||a.id.localeCompare(b.id));summaryEdges.set(edges[0].id,edges[0]);transitState.summaryGroups.push({fromFloor:contextFloor,toFloor:floor,representativeRawEdgeId:edges[0].id,rawEdgeIds:edges.map(e=>e.id),kinds:[...new Set(edges.map(e=>transitNodes.get(e.from).data.kind))],routeCount:edges.length});}
    }
    transitState.groupCount=transitState.summaryGroups.length;transitState.previewMode=!transitState.enabled?'disabled':transitState.routeFocus?'edge':contextNode?'node':contextFloor?'floor-summary':'idle';
    transitGroup.visible=transitState.enabled;activeRouteIds=[];
    for(const route of transitRoutes){
      route.previewEdge=route.rawEdges.find(e=>summaryEdges.has(e.id))||null;
      const inContext=contextNode?route.from===contextNode||route.to===contextNode:Boolean(route.previewEdge);
      route.inContext=transitState.enabled&&(!transitState.kind||route.kind===transitState.kind)&&inContext;
      route.group.visible=route.inContext&&(!transitState.routeFocus||route.edgeIds.includes(transitState.routeFocus));
      if(route.group.visible)activeRouteIds.push(route.id);
      const rawFocus=transitState.routeFocus?route.rawEdges.find(e=>e.id===transitState.routeFocus):null,displayEdge=rawFocus||route.previewEdge,direction=displayEdge?(displayEdge.from===route.from?1:-1):null;
      for(const arrow of route.arrows)arrow.visible=route.group.visible&&(direction===null||arrow.userData.direction===direction);
      route.focusDirection=rawFocus?direction:null;route.displayDirection=direction;
      if(!route.group.visible){route.label.hidden=true;route.labelLeader.style.display='none';}
    }
    const nextContext=activeRouteIds.join('|')+';'+transitState.routeFocus+';'+transitState.hoveredNode+';'+state.hovered+';'+transitState.selected;if(nextContext!==transitContext){transitContext=nextContext;transitLayoutDirty=true;}
    const hovering=Boolean(transitState.hoveredNode||state.hovered||transitState.routeFocus);
    transitState.animationActive=Boolean(state.available&&state.visible&&transitState.enabled&&!document.hidden&&!reducedMotion.matches&&!pointers.size&&hovering&&activeRouteIds.length);
    for(const route of transitRoutes)for(const dot of route.flow)dot.visible=route.group.visible&&transitState.animationActive&&(route.displayDirection===null||dot.userData.direction===route.displayDirection);
    for(const [ring,id]of [[transitSelectionRing,transitState.selected],[transitHoverRing,transitState.hoveredNode]])if(ring){const node=transitNodes.get(id);ring.visible=transitState.enabled&&Boolean(node);if(node)ring.position.copy(node.point);}
  }
  function setTransitSelection(id){if(disposed||id!==null&&!transitNodes.has(id))return;if(transitState.selected!==id)transitState.routeFocus=null;transitState.selected=id;refreshTransit();invalidate();}
  function setTransitKind(kind){if(disposed||kind!==null&&!transitStyles.has(kind))return;transitState.kind=kind;transitState.routeFocus=null;refreshTransit();invalidate();}
  function setTransitRoute(edgeId){if(disposed)return;const route=transitRoutes.find(r=>r.edgeIds.includes(edgeId));transitState.routeFocus=route&&(!transitState.kind||route.kind===transitState.kind)?edgeId:null;refreshTransit();invalidate();return Boolean(transitState.routeFocus);}
  function transitMetrics(){
    const box=renderer?.domElement.getBoundingClientRect(),width=box?.width||1,height=box?.height||1;
    return {...transitState,screenSpace:'client-pixels',lineWidth:2.8,layoutUpdates:routeLayoutUpdates,viewport:{left:box?.left||0,top:box?.top||0,width:box?.width||0,height:box?.height||0},activeRouteIds:[...activeRouteIds],corridorBounds:{halfX:commonWidth/2,halfZ:commonDepth/2},nodes:[...transitNodes.values()].map(n=>{const p=screen(n.point,width,height);return {id:n.data.id,floor:n.data.floor,kind:n.data.kind,point:n.point.toArray(),screen:{x:(box?.left||0)+p.x,y:(box?.top||0)+p.y,z:p.z,visible:state.visible&&transitState.enabled&&p.z>=-1&&p.z<=1&&p.x>=0&&p.x<=width&&p.y>=0&&p.y<=height&&unobstructed(n.point)}};}),routes:transitRoutes.map(r=>({id:r.id,from:r.from,to:r.to,kind:r.kind,bidirectional:r.bidirectional,edgeIds:r.edgeIds,path:r.points.map(p=>p.toArray()),corridor:r.corridor,active:r.group.visible,label:r.label.hidden?null:r.labelPosition,focusDirection:r.focusDirection,shownDirections:r.arrows.filter(a=>a.visible).map(a=>a.userData.direction),flowDirections:r.flow.filter(a=>a.visible).map(a=>a.userData.direction)}))};
  }
  function boundarySamples(floor){
    const [left,top,right,bottom]=floor.rect,points=[];
    const opaque=(x,y)=>alphaAt(new THREE.Vector2((x+.5)/atlas.width,1-(y+.5)/atlas.height))>=.1;
    const add=(x,y)=>points.push([(x-(left-3))/(right-left+6)-.5,(y-(top-3))/(bottom-top+6)-.5]);
    for(let i=0;i<=18;i++){
      const y=Math.min(bottom-1,Math.round(top+(bottom-top-1)*i/18));
      for(let x=left;x<right;x++)if(opaque(x,y)){add(x,y);break;}
      for(let x=right-1;x>=left;x--)if(opaque(x,y)){add(x,y);break;}
      const x=Math.min(right-1,Math.round(left+(right-left-1)*i/18));
      for(let y2=top;y2<bottom;y2++)if(opaque(x,y2)){add(x,y2);break;}
      for(let y2=bottom-1;y2>=top;y2--)if(opaque(x,y2)){add(x,y2);break;}
    }
    return points;
  }
  function mapGeometry(l){
    const [left,top,right,bottom]=l.floor.rect,w=right-left+6,h=bottom-top+6;
    const scale=.075;
    l.width=w*scale;l.depth=h*scale;
    const g=new THREE.PlaneGeometry(l.width,l.depth);g.rotateX(-Math.PI/2);
    const uv=g.attributes.uv,u0=(left-3)/atlas.width,u1=(right+3)/atlas.width,v0=1-(bottom+3)/atlas.height,v1=1-(top-3)/atlas.height;
    for(let i=0;i<uv.count;i++)uv.setXY(i,u0+uv.getX(i)*(u1-u0),v0+uv.getY(i)*(v1-v0));
    l.map.geometry.dispose();l.map.geometry=g;
    const haloGeometry=new THREE.PlaneGeometry((w+16)*scale,(h+16)*scale);haloGeometry.rotateX(-Math.PI/2);
    const haloUv=haloGeometry.attributes.uv,hu0=(left-11)/atlas.width,hu1=(right+11)/atlas.width,hv0=1-(bottom+11)/atlas.height,hv1=1-(top-11)/atlas.height;
    for(let i=0;i<haloUv.count;i++)haloUv.setXY(i,hu0+haloUv.getX(i)*(hu1-hu0),hv0+haloUv.getY(i)*(hv1-hv0));
    l.halo.geometry.dispose();l.halo.geometry=haloGeometry;l.halo.material.uniforms.crop.value.set(u0,v0,u1,v1);
  }
  function updateLabels(width,height){
    const occupied=[],box=renderer.domElement.getBoundingClientRect(),leftDirection=new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0).negate();leftDirection.y=0;leftDirection.normalize();
    const rows=[];
    for(const l of layers){
      const local=l.samples.map(([x,z])=>[x*l.width,z*l.depth]);
      const candidates=local.map(([x,z])=>new THREE.Vector3(x,l.group.position.y+.09,z)).map(p=>({point:p,screen:screen(p,width,height)})).filter(p=>p.screen.z>=-1&&p.screen.z<=1).sort((a,b)=>a.screen.x-b.screen.x);
      const anchor=candidates.find(p=>unobstructed(p.point));
      const center=screen(new THREE.Vector3(0,l.group.position.y+.09,0),width,height);
      if(!anchor){l.label.hidden=true;l.leader.visible=false;rows.push({id:l.floor.id,x:box.left+center.x,y:box.top+center.y,visible:false});continue;}
      const end=anchor.point.clone().addScaledVector(leftDirection,4),p=screen(end,width,height);
      l.pendingLabel={anchor:anchor.point,end,x:p.x,y:p.y};rows.push({id:l.floor.id,x:box.left+center.x,y:box.top+center.y,visible:false,labelX:box.left+p.x,labelY:box.top+p.y});
    }
    for(const l of [...layers].sort((a,b)=>b.floor.id-a.floor.id)){
      const p=l.pendingLabel;l.pendingLabel=null;if(!p)continue;
      const row=rows.find(r=>r.id===l.floor.id),inside=p.x>=26&&p.x<=width-26&&p.y>=26&&p.y<=height-26;
      const overlaps=occupied.some(r=>Math.abs(r.x-p.x)<52&&Math.abs(r.y-p.y)<46);
      const visible=inside&&!overlaps&&unobstructed(p.end);l.label.hidden=!visible;l.leader.visible=visible;row.visible=visible;
      if(!visible)continue;occupied.push(p);l.label.style.left=p.x+'px';l.label.style.top=p.y+'px';
      const a=l.leader.geometry.attributes.position;a.setXYZ(0,p.anchor.x,p.anchor.y,p.anchor.z);a.setXYZ(1,p.end.x,p.end.y,p.end.z);a.needsUpdate=true;
    }
    projectedFloors=rows;
  }
  function render(time=0){
    frame=0;if(disposed||!state.available||!state.visible||document.hidden)return;
    const width=Math.max(1,root.clientWidth),height=Math.max(1,root.clientHeight);
    if(width!==renderWidth||height!==renderHeight){renderer.setSize(width,height,false);camera.aspect=width/height;renderWidth=width;renderHeight=height;sizeUpdates++;labelsDirty=true;}
    if(wheelZoom){const z=wheelZoom,target=clampDistance(z.target),dt=Math.min(40,z.time?time-z.time:16.67);z.time=time;state.distance+=(target-state.distance)*(1-Math.exp(-dt/65));if(Math.abs(state.distance-target)<target*.0002){state.distance=target;wheelZoom=null;}labelsDirty=true;}
    updateCamera();refreshTransit();if(labelsDirty){updateLabels(width,height);labelRecalculations++;}if(labelsDirty||transitLayoutDirty){layoutTransit(width,height);transitLayoutDirty=false;}labelsDirty=false;
    if(transitState.animationActive)for(const route of transitRoutes.filter(r=>r.group.visible))for(const dot of route.flow){const progress=(time*.00012)%1;dot.position.copy(alongRoute(route,dot.userData.direction===1?progress:1-progress).point);dot.scale.setScalar(camera.position.distanceTo(dot.position)*2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/height*4/.21);}
    renderer.render(scene,camera);state.renderedFrames++;if(transitState.animationActive||wheelZoom)invalidate();
  }
  function focusCenter(){wheelZoom=null;if(disposed)return;target.set(0,totalHeight/2,0);refreshLimits();state.distance=clampDistance(fittedDistance());clampTarget();labelsDirty=true;invalidate();}
  function reset(){if(disposed)return;state.yaw=-.48;state.pitch=THREE.MathUtils.degToRad(38);focusCenter();}
  function clearGesture(){wheelZoom=null;
    const canvas=renderer?.domElement;for(const id of pointers.keys())if(canvas?.hasPointerCapture(id))canvas.releasePointerCapture(id);
    pointers.clear();pinch=null;lastPointer=null;gestureMoved=false;root.classList.remove('is-dragging','is-panning');
    transitState.routeFocus=null;setHovered(null);refreshTransit();
  }
  function pan(dx,dy){
    updateCamera();const scale=state.distance*2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))/Math.max(1,root.clientHeight);
    target.addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,0),-dx*scale);target.addScaledVector(new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld,1),dy*scale);
    clampTarget();labelsDirty=true;root.classList.add('is-panning');
  }
  function dispose(){
    if(disposed)return;disposed=true;state.visible=false;cancelFrame();clearGesture();controller.abort();observer?.disconnect();
    const geometries=new Set(),materials=new Set();scene.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
    for(const resource of transitResources)if(resource.isBufferGeometry)geometries.add(resource);else materials.add(resource);
    for(const g of geometries)g.dispose();for(const m of materials)m.dispose();texture?.dispose();renderer?.dispose();renderer?.forceContextLoss();root.remove();state.available=false;
  }
  try{
    if(!atlasTexture?.image||!(atlas?.width>0&&atlas?.height>0)||!Array.isArray(floors)||!floors.length)throw new Error('楼层纹理或目录未就绪');
    for(const f of floors){const r=f.rect;if(!Array.isArray(r)||r.length!==4||r.some(n=>!Number.isFinite(n))||r[0]<3||r[1]<3||r[2]+3>atlas.width||r[3]+3>atlas.height||r[0]>=r[2]||r[1]>=r[3])throw new Error('楼层切片范围无效');}
    commonWidth=Math.max(frameWidth,...floors.map(f=>(f.rect[2]-f.rect[0]+6)*.075));commonDepth=Math.max(frameDepth,...floors.map(f=>(f.rect[3]-f.rect[1]+6)*.075));
    const image=atlasTexture.image,canvas=new OffscreenCanvas(image.width,image.height),context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(image,0,0);pixels=context.getImageData(0,0,image.width,image.height);
    texture=atlasTexture.clone();texture.generateMipmaps=false;texture.minFilter=texture.magFilter=THREE.NearestFilter;texture.needsUpdate=true;texture.updateMatrix();
    renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setClearColor(deep,1);renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.domElement.className='wm-floor-tower-canvas';renderer.domElement.tabIndex=0;renderer.domElement.setAttribute('role','application');renderer.domElement.setAttribute('aria-label','楼层环绕目录；拖动旋转，Shift或右键拖动平移，滚轮或双指缩放，方向键旋转，Home复位');root.append(renderer.domElement,centerMark,labels,routeLabels);
    for(const floor of floors){
      const group=new THREE.Group();group.position.y=(floor.id-1)*gap;scene.add(group);
      const map=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.MeshBasicMaterial({map:texture,alphaTest:.1,side:THREE.DoubleSide,depthTest:true,depthWrite:true,toneMapped:false}));map.position.y=.04;map.userData={floor:floor.id,kind:'map'};
      const halo=new THREE.Mesh(new THREE.PlaneGeometry(),new THREE.ShaderMaterial({
        uniforms:{map:{value:texture},texel:{value:new THREE.Vector2(1/atlas.width,1/atlas.height)},crop:{value:new THREE.Vector4()},tint:{value:new THREE.Color(accent)},strength:{value:0}},
        vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:`varying vec2 vUv;uniform sampler2D map;uniform vec2 texel;uniform vec4 crop;uniform vec3 tint;uniform float strength;
          float sourceAlpha(vec2 p){if(p.x<crop.x||p.y<crop.y||p.x>crop.z||p.y>crop.w)return 0.;return texture2D(map,p).a;}
          float ring(float radius){float a=0.;for(int i=0;i<8;i++){float angle=float(i)*.7853981634;a=max(a,sourceAlpha(vUv+vec2(cos(angle),sin(angle))*texel*radius));}return a;}
          void main(){if(sourceAlpha(vUv)>=.1)discard;float glow=ring(1.)*.65+ring(3.)*.3+ring(5.)*.15+ring(8.)*.06;float a=min(.94,glow*strength);if(a<.005)discard;gl_FragColor=vec4(tint,a);
          #include <colorspace_fragment>
          }`,transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,toneMapped:false
      }));halo.position.y=map.position.y;halo.visible=false;halo.renderOrder=1;group.add(halo);
      group.add(map);
      const leader=new THREE.Line(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,0,0,0],3)),new THREE.LineBasicMaterial({color:'#8d9e93',depthTest:true}));leader.frustumCulled=false;scene.add(leader);
      const label=document.createElement('button');label.type='button';label.className='wm-floor-tower-label';label.textContent=floor.id+'F';label.dataset.towerFloor=String(floor.id);label.setAttribute('aria-label',`展开 ${floor.id}F`);labels.append(label);
      listen(label,'click',event=>{event.stopPropagation();onOpen(floor.id);});listen(label,'pointerenter',()=>setHovered(floor.id));listen(label,'pointerleave',()=>setHovered(null));listen(label,'focus',()=>setHovered(floor.id));listen(label,'blur',()=>setHovered(null));
      const layer={floor,group,map,halo,leader,label,samples:boundarySamples(floor)};layers.push(layer);mapGeometry(layer);
    }
    buildTransit();
    const canvasElement=renderer.domElement;
    listen(canvasElement,'pointerdown',event=>{wheelZoom=null;
      if(!state.visible)return;event.preventDefault();canvasElement.focus({preventScroll:true});canvasElement.setPointerCapture(event.pointerId);pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
      if(pointers.size===1){gestureMoved=false;lastPointer={id:event.pointerId,x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,pan:event.button===2||event.shiftKey};}
      else{gestureMoved=true;const [a,b]=[...pointers.values()];pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),x:(a.x+b.x)/2,y:(a.y+b.y)/2};}
      transitState.routeFocus=null;setHovered(null);refreshTransit();root.classList.add('is-dragging');
    });
    listen(canvasElement,'pointermove',event=>{
      if(!pointers.has(event.pointerId)){if(state.visible){const hit=pickAt(event.clientX,event.clientY);setHovered(hit?.id||null,hit?.transitId||null);}return;}
      pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});event.preventDefault();
      if(pointers.size>=2){const [a,b]=[...pointers.values()],distance=Math.hypot(a.x-b.x,a.y-b.y),x=(a.x+b.x)/2,y=(a.y+b.y)/2;if(pinch&&distance>0){state.distance=clampDistance(state.distance*pinch.distance/distance);pan(x-pinch.x,y-pinch.y);}pinch={distance,x,y};gestureMoved=true;}
      else if(lastPointer){const dx=event.clientX-lastPointer.x,dy=event.clientY-lastPointer.y;if(Math.hypot(event.clientX-lastPointer.startX,event.clientY-lastPointer.startY)>6)gestureMoved=true;
        if(gestureMoved){if(lastPointer.pan||event.shiftKey)pan(dx,dy);else{state.yaw-=dx*.006;state.pitch=THREE.MathUtils.clamp(state.pitch+dy*.004,THREE.MathUtils.degToRad(25),THREE.MathUtils.degToRad(80));labelsDirty=true;}}
        lastPointer.x=event.clientX;lastPointer.y=event.clientY;
      }invalidate();
    });
    listen(canvasElement,'pointerup',event=>{
      if(!pointers.has(event.pointerId))return;const open=!gestureMoved&&pointers.size===1&&event.button!==2;
      pointers.delete(event.pointerId);if(canvasElement.hasPointerCapture(event.pointerId))canvasElement.releasePointerCapture(event.pointerId);
      if(!pointers.size){pinch=null;lastPointer=null;root.classList.remove('is-dragging','is-panning');if(open){const hit=pickAt(event.clientX,event.clientY);if(hit?.transitId){setTransitSelection(hit.transitId);onSelectTransit(hit.transitId);}else if(hit?.id)onOpen(hit.id);}}
      else{const [id,p]=pointers.entries().next().value;lastPointer={id,x:p.x,y:p.y,startX:p.x,startY:p.y,pan:false};pinch=null;}
    });
    listen(canvasElement,'pointercancel',clearGesture);listen(canvasElement,'lostpointercapture',event=>{if(pointers.has(event.pointerId))clearGesture();});listen(window,'blur',clearGesture);
    listen(canvasElement,'pointerleave',()=>{if(!pointers.size)setHovered(null);});listen(canvasElement,'contextmenu',event=>event.preventDefault());
    listen(canvasElement,'wheel',event=>{event.preventDefault();const delta=Math.max(-120,Math.min(120,event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?root.clientHeight:1))),target=clampDistance((wheelZoom&&wheelZoom.direction===Math.sign(delta)?wheelZoom.target:state.distance)*Math.exp(delta*.0005));if(reducedMotion.matches)state.distance=target;else wheelZoom={target,direction:Math.sign(delta),time:wheelZoom?.time||0};labelsDirty=true;invalidate();},{passive:false});
    listen(canvasElement,'keydown',event=>{
      if(event.ctrlKey||event.metaKey||event.altKey)return;wheelZoom=null;let handled=true;
      if(event.key==='ArrowLeft')state.yaw-=Math.PI/18;else if(event.key==='ArrowRight')state.yaw+=Math.PI/18;else if(event.key==='ArrowUp')state.pitch=Math.min(THREE.MathUtils.degToRad(80),state.pitch+.08);else if(event.key==='ArrowDown')state.pitch=Math.max(THREE.MathUtils.degToRad(25),state.pitch-.08);else if(event.key==='+'||event.key==='=')state.distance=clampDistance(state.distance*.85);else if(event.key==='-')state.distance=clampDistance(state.distance/ .85);else if(event.key==='Home')reset();else handled=false;
      if(handled){event.preventDefault();event.stopPropagation();labelsDirty=true;invalidate();}
    });
    listen(canvasElement,'webglcontextlost',event=>{event.preventDefault();state.available=false;cancelFrame();clearGesture();for(const l of layers)l.label.hidden=true;notify('楼层环绕视图已失去图形上下文，可通过楼层选择继续查看地图。');});
    listen(document,'visibilitychange',()=>{if(document.hidden){cancelFrame();clearGesture();}else invalidate();});
    listen(reducedMotion,'change',()=>{if(wheelZoom){state.distance=clampDistance(wheelZoom.target);wheelZoom=null;}refreshTransit();invalidate();});
    observer=new ResizeObserver(()=>{wheelZoom=null;if(root.clientWidth&&root.clientHeight)refreshLimits();labelsDirty=true;invalidate();});observer.observe(root);state.available=true;colorLayers();reset();
  }catch(error){state.available=false;notify(error);}
  return {
    setCurrent(id){wheelZoom=null;if(disposed||!floors.some(f=>f.id===Number(id)))return;if(state.current!==Number(id))transitState.routeFocus=null;state.current=Number(id);colorLayers();refreshTransit();invalidate();},
    setVisible(value){if(disposed)return;state.visible=Boolean(value)&&state.available;root.hidden=!state.visible;if(!state.visible){cancelFrame();clearGesture();setHovered(null);}else{if(firstShow){firstShow=false;reset();}else refreshLimits();labelsDirty=true;invalidate();}refreshTransit();},
    reset,focusCenter,pickAt,setTransitSelection,setTransitKind,setTransitRoute,
    setTransitEnabled(value){if(disposed)return;transitState.enabled=Boolean(value);if(!transitState.enabled){transitState.hoveredNode=null;transitState.routeFocus=null;}refreshTransit();invalidate();},
    metrics:()=>({...state,zoomPending:Boolean(wheelZoom),yaw:THREE.MathUtils.radToDeg(state.yaw),pitch:THREE.MathUtils.radToDeg(state.pitch),target:target.toArray(),textures:renderer?.info.memory.textures||0,geometries:renderer?.info.memory.geometries||0,rafPending:frame?1:0,projectedFloors,labelRecalculations,sizeUpdates,
      targetLimits:{min:[...targetLimits.min],max:[...targetLimits.max]},distanceLimits:{...distanceLimits},haloVisible:layers.filter(l=>l.halo.visible).map(l=>l.floor.id),haloColor:accent,transit:transitMetrics(),
      floors:layers.map(l=>({id:l.floor.id,width:l.width,depth:l.depth,y:l.group.position.y,mapPosition:l.map.position.toArray(),haloPosition:l.halo.position.toArray(),haloVisible:l.halo.visible,haloStrength:l.halo.material.uniforms.strength.value,haloDepthTest:l.halo.material.depthTest,haloDepthWrite:l.halo.material.depthWrite,frameVisible:false,projectedCenter:projectedFloors.find(p=>p.id===l.floor.id)}))}),
    dispose
  };
}
