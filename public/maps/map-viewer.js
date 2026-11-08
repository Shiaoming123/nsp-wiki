import * as THREE from './vendor/three.module.js';

const aborted = () => new DOMException('查看器已关闭', 'AbortError');
export function indexLootTypes(data,links){
  const maps=new Map();for(const map of data.maps){const icons=new Map();for(const [type,ids]of Object.entries(links.maps[map.id]?.types||{})){const found=map.containers.find(box=>ids.includes(box.id)&&box.icon);if(found)icons.set(type,found);}maps.set(map.id,{boxes:map.containers,icons});}return maps;
}
export async function readMapJson(response, signal) {
  if(!response.ok)throw new Error(`地图数据 ${response.status}`);
  const bytes=new Uint8Array(await response.arrayBuffer());signal?.throwIfAborted();
  let value;
  if(bytes[0]===0x1f&&bytes[1]===0x8b){
    if(!globalThis.DecompressionStream)throw new Error('此浏览器不支持地图解压，请升级浏览器');
    value=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json();
  }else value=JSON.parse(new TextDecoder().decode(bytes));
  signal?.throwIfAborted();return value;
}
export function reflectedBox(bounds) {
  return new THREE.Box3(new THREE.Vector3(bounds.min[0], bounds.min[1], -bounds.max[2]), new THREE.Vector3(bounds.max[0], bounds.max[1], -bounds.min[2]));
}
export function applySourceSampler(texture, sampler) {
  if(sampler.textureMipmaps===false){texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;}
  if(sampler.textureFilter==='nearest')texture.minFilter=texture.magFilter=THREE.NearestFilter;
  const wrap={clamp:THREE.ClampToEdgeWrapping,repeat:THREE.RepeatWrapping,mirror:THREE.MirroredRepeatWrapping};
  if(sampler.textureWrap){texture.wrapS=wrap[sampler.textureWrap[0]]??THREE.ClampToEdgeWrapping;texture.wrapT=wrap[sampler.textureWrap[1]]??THREE.ClampToEdgeWrapping;}
}
export function screenGround(camera, rectangle, clientX, clientY, planeY) {
  const ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((clientX-rectangle.left)/rectangle.width*2-1,1-(clientY-rectangle.top)/rectangle.height*2),camera);
  return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),-planeY),new THREE.Vector3());
}

// Source materials are retained in the depth pass, including their alpha cutout.
export function silhouetteMaterial(source, color) {
  source.map?.updateMatrix();
  const material = new THREE.ShaderMaterial({
    uniforms:{map:{value:source.map},uvMatrix:{value:source.map?.matrix.clone()||new THREE.Matrix3()},hasMap:{value:!!source.map},cutoff:{value:Math.max(source.alphaTest||0,(source.transparent||source.alphaToCoverage)?0.001:0)},opacity:{value:source.opacity},tint:{value:new THREE.Color(color)}},
    vertexShader:`varying vec2 vUv; uniform mat3 uvMatrix; void main(){vUv=(uvMatrix*vec3(uv,1.)).xy;vec4 p=vec4(position,1.);
      #ifdef USE_INSTANCING
      p=instanceMatrix*p;
      #endif
      gl_Position=projectionMatrix*modelViewMatrix*p;}`,
    fragmentShader:'varying vec2 vUv;uniform sampler2D map;uniform bool hasMap;uniform float cutoff,opacity;uniform vec3 tint;void main(){float a=opacity;if(hasMap)a*=texture2D(map,vUv).a;if(a<cutoff||opacity<=0.)discard;gl_FragColor=vec4(tint,1.);}',
    side:source.side,depthTest:true,depthWrite:true,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1
  });
  material.addEventListener('dispose',()=>source.dispose());
  return material;
}

export function createSilhouettePass(renderer) {
  let target=null,colorTarget=null;
  const quadScene=new THREE.Scene(),quadCamera=new THREE.Camera();
  const material=new THREE.ShaderMaterial({depthTest:false,depthWrite:false,transparent:true,
    uniforms:{mask:{value:null},sceneColor:{value:null},depthMap:{value:null},pixel:{value:new THREE.Vector2()},radius:{value:2}},
    vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader:`varying vec2 vUv;uniform sampler2D mask,sceneColor,depthMap;uniform vec2 pixel;uniform float radius;
      void main(){vec4 c=texture2D(sceneColor,vUv);if(texture2D(mask,vUv).a<.5){float d=texture2D(depthMap,vUv).r;
      for(int x=-4;x<=4;x++)for(int y=-4;y<=4;y++){if(abs(float(x))>radius||abs(float(y))>radius)continue;vec2 p=vUv+vec2(float(x),float(y))*pixel;vec4 q=texture2D(mask,p);if(q.a>.5){float z=texture2D(depthMap,p).r;if(d+0.0000002>=z)c=q;}}
      }gl_FragColor=c;
      #include <colorspace_fragment>
      }`});
  const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);quad.frustumCulled=false;quadScene.add(quad);
  return {
    render(scene,camera,maskScene,width,height){
      const size=renderer.getDrawingBufferSize(new THREE.Vector2());
      if(!target){target=new THREE.WebGLRenderTarget(size.x,size.y,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter});target.depthTexture=new THREE.DepthTexture(size.x,size.y,THREE.UnsignedIntType);colorTarget=new THREE.WebGLRenderTarget(size.x,size.y,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,samples:4});colorTarget.depthTexture=target.depthTexture;}
      if(target.width!==size.x||target.height!==size.y){target.setSize(size.x,size.y);colorTarget.setSize(size.x,size.y);}
      const autoClear=renderer.autoClear;
      try{
        renderer.autoClear=true;renderer.setRenderTarget(colorTarget);renderer.render(scene,camera);
        renderer.autoClear=false;renderer.setRenderTarget(target);const clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();renderer.setClearColor(0,0);renderer.clear(true,false,false);renderer.setClearColor(clear,alpha);
        renderer.render(maskScene,camera);
        material.uniforms.mask.value=target.texture;material.uniforms.sceneColor.value=colorTarget.texture;material.uniforms.depthMap.value=target.depthTexture;material.uniforms.pixel.value.set(1/size.x,1/size.y);material.uniforms.radius.value=Math.min(4,Math.ceil(2*size.x/width));
        renderer.setRenderTarget(null);renderer.render(quadScene,quadCamera);
      }finally{renderer.autoClear=autoClear;renderer.setRenderTarget(null);}
    },
    size:()=>target?[target.width,target.height]:[0,0],
    dispose(){if(colorTarget)colorTarget.depthTexture=null;colorTarget?.dispose();colorTarget=null;target?.dispose();target=null;quad.geometry.dispose();material.dispose();}
  };
}

export function mountMapViewer(container, options = {}) {
  const markerFont=getComputedStyle(container).fontFamily;
  const zoomReduced=matchMedia('(prefers-reduced-motion:reduce)');
  let zoomFrameTime=0,atlasZoom=null,atlasZoomFrame=0;
  let disposed = false, generation = 0, frame = 0, renderer, scene, camera, sceneCamera, overviewCamera, root, overview, manifest;
  let height = 24.35, fitHeight = 24.35, rotation = 0, selected = null, mode = 'hide', manifestUrl, queuedInterior, queuedFocus, readingLight = true;
  let active = 0, wanted = new Set(), detail = false, pointer = null, lost = false, fallback = false, mapController,detailController=new AbortController(),detailRevision=0,viewMode='overview';
  let targetHeight=height,zoomAnchor=null,backdrop=null,pois=[],categories=[],category='',selectedPoi=null,poiMarkers=null,poiOutline=null,poiToken=0,atlasImage=null,atlasBounds=null,atlasTexture=null,poiIndexPending=false;
  const focus = new THREE.Vector3(), controller = new AbortController(), cache = new Map(), chunks = new Map(), pending = new Set(), failures = new Set(),poiBodies=new Map(),poiPending=new Set(),poiFailures=new Set(),poiOutlines=new Map(),outlinePending=new Set(),outlineFailures=new Set();
  let poiWanted=new Set(),outlineWanted=new Set(),poiLimitReached=false,atlasError=null;
  let types=[],visiblePois=new Set(),miniBounds=null,footprint=[],atlasView=null,atlasFitScale=1,atlasPointer=null,miniWidth=0;
  const highlightTypes=new Set(),selectedPois=new Set(),maskGroups=new Map(),alphaPixels=new WeakMap();
  const pickRoot=new THREE.Group(),maskScene=new THREE.Scene(),maskRoot=new THREE.Group();pickRoot.scale.z=maskRoot.scale.z=-1;maskScene.add(maskRoot);
  let silhouettePass=null,filtersOpen=matchMedia('(min-width:701px)').matches;
  let lootData=null,lootLinks=null,lootRequest=null,lootFailed=false,lootTypeIndex=new Map();
  const markerImages=new Map();
  let maskBatchSignature='';const maskBatches=[];
  const palette=['#f2c66d','#71cee3','#b8df79','#ee968b','#b5a2ed','#e6a9cd','#8bbbea','#d4b789'];
  const shapes=['circle','square','triangle','diamond','plus','cross','pentagon','hexagon'];
  // shortcut: 128 distinguishable combinations; extend the legend before publishing more types.
  const styleFor=point=>{const index=point.styleIndex??0;if(!Number.isInteger(index)||index<0||index>=128)throw Error('地图资源类型样式待适配');return {color:palette[index%8],shape:shapes[Math.floor(index/8)%8],ring:index>=64};};
  const stats = {residentChunks:0, drawcalls:0, triangles:0, geometries:0, textures:0, loadPending:0, rafPending:0, renderedFrames:0, disposed:false, mapId:null, detail:false};
  const host = document.createElement('section'); host.className = 'wm-viewer';host.dataset.viewMode='overview';
  host.innerHTML = `<div class="wm-toolbar"><label>地图 <select data-control="map" aria-label="地图"></select></label><button data-action="reset">全图</button><button data-action="rotate">转向 90°</button><label>清晰度 <select data-control="quality" aria-label="清晰度"><option value="low" selected>流畅</option><option value="standard">原始</option></select></label><label><input type="checkbox" data-control="reading-light" checked>阅读补光</label><label>建筑 <select data-control="building" aria-label="建筑"><option value="">室外</option></select></label><label>屋顶 <select data-control="roof" aria-label="屋顶模式"><option value="hide">隐藏</option><option value="blend">半透明 0.3</option><option value="hash">抖动透明 0.3</option></select></label></div><div class="wm-stage" tabindex="0" role="application" aria-label="三维地图；方向键平移，加减缩放，R转向，Esc退出室内"><span class="wm-help">拖动平移 · 滚轮/双指缩放 · 方向键移动 · +/−缩放 · R转向 · Esc室外</span></div><div class="wm-status" role="status" aria-live="polite">读取地图目录…</div>`;
  container.append(host);
  const lootLink=document.createElement('a');lootLink.className='secondary-button';lootLink.textContent='本图容器与掉落 ↗';host.querySelector('.wm-toolbar').append(lootLink);
  host.querySelector('[data-control="quality"] option[value="standard"]').textContent='原始';host.querySelector('[data-control="quality"] option[value="low"]').textContent='流畅';host.querySelector('[data-control="quality"]').title='流畅：降低渲染分辨率；原始：完整渲染分辨率';
  host.querySelector('[data-action="rotate"]').outerHTML='<button data-action="rotate-left" aria-label="向左旋转15度">↶ 15°</button><button data-action="rotate-right" aria-label="向右旋转15度">↷ 15°</button><label class="wm-angle">方位 <input data-control="angle" type="range" min="0" max="359" value="0"><output>0°</output></label>';
  const settings=document.createElement('details');settings.className='wm-settings';settings.innerHTML='<summary>查看设置</summary><div></div>';for(const control of ['reading-light','building','roof'])settings.querySelector('div').append(host.querySelector(`[data-control="${control}"]`).closest('label'));for(const control of ['rotate-left','rotate-right'])settings.querySelector('div').append(host.querySelector(`[data-action="${control}"]`));settings.querySelector('div').append(host.querySelector('.wm-angle'));settings.querySelector('div').prepend(host.querySelector('[data-control=quality]').closest('label'));settings.querySelector('summary').textContent='3D 设置';host.querySelector('.wm-toolbar').append(settings);
  host.querySelector('.wm-toolbar').insertAdjacentHTML('beforeend','<button data-action="filters" aria-expanded="false">资源高亮</button><button data-action="atlas">全屏平面图 M</button><button data-action="exhibit">沉浸展览</button>');
  host.querySelector('.wm-toolbar').insertAdjacentHTML('beforeend','<button data-action="enemies" aria-expanded="false" aria-pressed="false">敌怪</button>');
  host.querySelector('.wm-stage').insertAdjacentHTML('beforeend','<button class="wm-minimap" data-action="atlas" aria-label="打开平面地图"><canvas width="220" height="150"></canvas><span>平面地图 · M</span></button>');
  host.querySelector('[data-action="reset"]').insertAdjacentHTML('beforebegin','<div class="wm-mode" role="group" aria-label="地图显示模式"><button data-action="overview" aria-pressed="true">平面地图</button><button data-action="scene" aria-pressed="false">3D实景</button></div>');
  const dialog=document.createElement('dialog');dialog.className='wm-atlas';
  dialog.innerHTML='<div class="wm-atlas-tools"><strong>平面地图 · 全屏</strong><button data-action="close-atlas">关闭 Esc</button><button data-action="filters">资源高亮</button><label>X <input data-coordinate="x" type="number" step="any"></label><label>Z <input data-coordinate="z" type="number" step="any"></label><button data-action="coordinate">查看实景</button></div><div class="wm-atlas-layout"><canvas width="1200" height="760" tabindex="0" aria-label="平面地图；滚轮缩放，拖动平移，点击点位选择"></canvas><aside class="wm-type-panel" hidden></aside></div><p class="wm-atlas-note">滚轮缩放 · 拖动平移 · 点击资源标记选择 · 关闭后回到当前位置</p>';
  host.append(dialog);
  dialog.querySelector('.wm-atlas-tools').insertAdjacentHTML('beforeend','<button data-action="atlas-loot" disabled>查看物资</button>');
  dialog.querySelector('.wm-atlas-tools').insertAdjacentHTML('beforeend','<button data-action="enemies" aria-expanded="false" aria-pressed="false">敌怪</button>');
  const gapNotice=document.createElement('p');gapNotice.className='wm-data-note';gapNotice.hidden=true;
  const mapInfo=document.createElement('details');mapInfo.className='wm-map-info';mapInfo.innerHTML='<summary aria-label="地图说明">地图说明</summary>';mapInfo.append(gapNotice);host.querySelector('.wm-toolbar').append(mapInfo);
  const stage = host.querySelector('.wm-stage'), status = host.querySelector('.wm-status'), mapSelect = host.querySelector('[data-control="map"]'), buildingSelect = host.querySelector('[data-control="building"]');
  const miniCanvas=host.querySelector('.wm-minimap canvas'),atlasCanvas=dialog.querySelector('canvas');
  stage.insertAdjacentHTML('beforeend','<aside class="wm-type-panel" hidden></aside><div class="wm-selection" hidden></div>');
  const panels=[stage.querySelector('.wm-type-panel'),dialog.querySelector('.wm-type-panel')],selectionCard=stage.querySelector('.wm-selection');
  stage.setAttribute('aria-label','平面地图；方向键平移，加减缩放，M全屏平面图');
  stage.querySelector('.wm-help').textContent='拖动平移 · 滚轮或双指缩放 · 勾选资源后点击标记 · M全屏';
  const markerCanvas=document.createElement('canvas');markerCanvas.className='wm-overview-markers';markerCanvas.setAttribute('aria-hidden','true');stage.append(markerCanvas);let overviewMarkers=[];
  const mapTools=document.createElement('div');mapTools.className='wm-map-tools';mapTools.innerHTML='<button data-action="zoom-in" aria-label="放大地图">+</button><button data-action="zoom-out" aria-label="缩小地图">−</button>';mapTools.append(host.querySelector('[data-action="reset"]'),host.querySelector('[data-action="atlas"]'));stage.append(mapTools);
  host.querySelector('[data-action=exhibit]').textContent='专注模式';
  lootLink.textContent='本图搜刮';lootLink.setAttribute('aria-label','查看本图全部容器与物资');
  host.querySelector('[data-action=reset]').textContent='全图';
  mapTools.querySelector('[data-action=atlas]').setAttribute('aria-label','全屏平面图 M');
  const header=document.querySelector('body>.site-header');
  const fitWorkspace=()=>{if(!disposed&&!host.classList.contains('wm-exhibit'))host.style.height=Math.max(440,innerHeight-(header?.getBoundingClientRect().bottom||0))+'px';};
  const headerObserver=new ResizeObserver(fitWorkspace);if(header)headerObserver.observe(header);fitWorkspace();
  host.querySelector('.wm-minimap').hidden=true;
  let atlasReturnFocus=null;
  let floorGuide=null,guideError=null,activeFloorBounds=null;
  let enemyLayer=null,enemyLoading=null,enemyDensity=null,enemyDensityKey='',densityUploads=0;
  function clearEnemyDensity(){if(enemyDensity){enemyDensity.removeFromParent();enemyDensity.geometry.dispose();enemyDensity.material.map.dispose();enemyDensity.material.dispose();enemyDensity=null;}enemyDensityKey='';}
  function syncEnemyDensity(){
    const density=enemyLayer?.getDensity();if(!density||!root){clearEnemyDensity();return;}
    const [x0,z0,x1,z1]=density.bounds,xmin=Math.max(x0,activeFloorBounds?.min[0]??x0),zmin=Math.max(z0,activeFloorBounds?.min[2]??z0),xmax=Math.min(x1,activeFloorBounds?.max[0]??x1),zmax=Math.min(z1,activeFloorBounds?.max[2]??z1),key=[density.revision,xmin,zmin,xmax,zmax].join(':');
    if(key===enemyDensityKey)return;
    if(!enemyDensity||enemyDensity.userData.revision!==density.revision){clearEnemyDensity();const texture=new THREE.CanvasTexture(density.canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;texture.magFilter=THREE.LinearFilter;
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(12),3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(8),2));geometry.setIndex([0,2,1,0,3,2]);
      enemyDensity=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({map:texture,transparent:true,depthTest:false,depthWrite:false,side:THREE.DoubleSide,toneMapped:false}));enemyDensity.userData.revision=density.revision;enemyDensity.renderOrder=100;root.add(enemyDensity);densityUploads++;}
    enemyDensity.visible=xmax>xmin&&zmax>zmin;
    const g=enemyDensity.geometry;g.attributes.position.array.set([xmin,0,zmin,xmax,0,zmin,xmax,0,zmax,xmin,0,zmax]);g.attributes.position.needsUpdate=true;
    const u=x=>(x-x0)/(x1-x0),v=z=>1-(z-z0)/(z1-z0);g.attributes.uv.array.set([u(xmin),v(zmin),u(xmax),v(zmin),u(xmax),v(zmax),u(xmin),v(zmax)]);g.attributes.uv.needsUpdate=true;g.computeBoundingSphere();enemyDensityKey=key;
  }
  async function toggleEnemies(){
    if(enemyLayer){enemyLayer.toggle();return;}if(enemyLoading)return;
    const buttons=[...host.querySelectorAll('[data-action=enemies]')];buttons.forEach(b=>b.disabled=true);
    enemyLoading=import(new URL('./enemy-layer.js'+new URL(import.meta.url).search,import.meta.url)).then(({mountEnemyLayer})=>{
      if(disposed)return;
      enemyLayer=mountEnemyLayer({host,stage,dialog,signal:controller.signal,onInvalidate:()=>{invalidate();drawAtlas();},onOpen:()=>{showFilters(false);floorGuide?.close({restoreFocus:false});if(matchMedia('(max-width:700px)').matches)selectionCard.hidden=true;},onFocus:entry=>{
        if(dialog.open&&atlasView){atlasView.center=[entry.position[0],entry.position[2]];atlasView.scale=Math.min(atlasZoomLimit(),Math.max(atlasView.scale,2));drawAtlas();return;}
        setViewMode('overview',false);setFocus(entry.position);if(!entry.polygon)height=targetHeight=Math.min(height,120);invalidate();
      }});
      enemyLayer.setMap(stats.mapId);enemyLayer.setBounds(activeFloorBounds);enemyLayer.toggle();
    }).catch(error=>{if(!disposed&&error.name!=='AbortError')tell('敌怪图层暂时无法打开，请重试。');}).finally(()=>{enemyLoading=null;buttons.forEach(b=>b.disabled=false);});
    return enemyLoading;
  }
  const guideButton=document.createElement('button');guideButton.dataset.action='floor-guide';guideButton.textContent='楼层导览';guideButton.hidden=true;host.querySelector('.wm-toolbar').insertBefore(guideButton,settings);
  const guideLayout=()=>{host.style.setProperty('--wm-guide-top',host.querySelector('.wm-toolbar').offsetHeight+'px');host.style.setProperty('--wm-guide-bottom',(fallback?28:status.offsetHeight)+'px');};
  const guideObserver=new ResizeObserver(guideLayout);guideObserver.observe(host.querySelector('.wm-toolbar'));guideObserver.observe(status);
  const listeners = [], observer = new ResizeObserver(() => {stopMainZoom();cancelAtlasZoom();invalidate();drawAtlas();}); observer.observe(stage);
  function listen(target, type, callback, opts) {target.addEventListener(type,callback,opts); listeners.push(()=>target.removeEventListener(type,callback,opts));}
  listen(window,'resize',fitWorkspace);listeners.push(()=>headerObserver.disconnect(),()=>guideObserver.disconnect());
  listen(matchMedia('(max-width:700px)'),'change',event=>{if(event.matches)showFilters(false);});
  const node=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
  function mapBoxes(){return lootTypeIndex.get(stats.mapId)?.boxes||[];}
  function boxesFor(point){const ids=lootLinks?.maps[stats.mapId]?.points[point.id]||[];return mapBoxes().filter(b=>ids.includes(b.id));}
  function typeBox(typeId){return lootTypeIndex.get(stats.mapId)?.icons.get(typeId);}
  function art(box,cls){const img=node('img',cls);img.src='/'+box.icon;img.alt='';img.width=img.height=40;return img;}
  async function ensureLoot(){
    if(lootData)return;if(lootRequest)return lootRequest;
    lootFailed=false;
    lootRequest=Promise.all([json(new URL('../data/container-loot.json',import.meta.url)),json(new URL('./data/loot-links.json',import.meta.url))]).then(([data,links])=>{if(disposed)return;lootData=data;lootLinks=links;lootTypeIndex=indexLootTypes(data,links);refreshPanels();refreshSelection();invalidate();drawAtlas();}).catch(error=>{if(error.name!=='AbortError'&&!disposed){lootFailed=true;refreshSelection();}}).finally(()=>{lootRequest=null;});
    return lootRequest;
  }
  function markerImage(point){const box=typeBox(point.typeId);if(!box?.icon)return null;let img=markerImages.get(box.icon);if(!img){img=new Image();markerImages.set(box.icon,img);img.onload=()=>{invalidate();drawAtlas();};img.src='/'+box.icon;}return img.complete&&img.naturalWidth?img:null;}
  function tell(text) {if (!disposed) status.textContent = text;}
  function invalidate() {if (!disposed && !lost && !frame && renderer && !document.hidden) {frame=requestAnimationFrame(render);stats.rafPending=1;}}
  async function json(url, signal=controller.signal) {const mutable=/\/(?:maps|loot-links|container-loot|manifest|pois)\.json(?:\.gz)?$/.test(new URL(url).pathname);const response=await fetch(url,{signal,cache:mutable?'no-cache':'default'}); if(!response.ok) throw new Error(`${response.status} ${new URL(url).pathname}`);return readMapJson(response,signal);}
  const resolve = path => new URL(path,manifestUrl).href;
  async function acquire(key, create) {
    let entry=cache.get(key);
    if(!entry) {entry={refs:0,value:null,promise:null};cache.set(key,entry);entry.promise=Promise.resolve().then(create).then(value=>{entry.value=value;if(disposed || entry.refs===0){value.dispose();if(cache.get(key)===entry)cache.delete(key);}return value;},error=>{if(cache.get(key)===entry)cache.delete(key);throw error;});}
    entry.refs++;
    try {const value=await entry.promise;if(disposed) throw aborted();return {key,value};}catch(error){if(cache.get(key)===entry)release(key);throw error;}
  }
  function release(key) {const entry=cache.get(key);if(!entry)return;entry.refs--;if(entry.refs<=0 && entry.value){entry.value.dispose();cache.delete(key);}}
  async function geometryData(url,signal,leases,token){
    const resource=new URL(url),id=decodeURIComponent(resource.hash.slice(1));if(!id)return json(url,signal);
    resource.hash='';const packUrl=resource.href;
    if(!leases.has(packUrl))leases.set(packUrl,acquire(`pack:${token}:${packUrl}`,async()=>{
      const data=await json(packUrl,signal);if(data.schemaVersion!==1||!data.geometries)throw new Error('模型包格式不完整');
      return {geometries:data.geometries,dispose(){this.geometries=null;}};
    }));
    const pack=await leases.get(packUrl);if(disposed||token!==generation)throw aborted();
    if(!pack.value.geometries||!Object.hasOwn(pack.value.geometries,id))throw new Error(`模型包缺少几何 ${id}`);
    return pack.value.geometries[id];
  }
  async function releasePacks(leases){for(const result of await Promise.allSettled(leases.values()))if(result.status==='fulfilled')release(result.value.key);}
  function geometry(data) {
    if(!Array.isArray(data.positions)||data.positions.length%3||!Array.isArray(data.indices))throw new Error('几何数据格式不完整');
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(data.positions,3));g.setIndex(data.indices);
    if(data.normals?.length)g.setAttribute('normal',new THREE.Float32BufferAttribute(data.normals,3));else g.computeVertexNormals();
    if(data.uvs?.length)g.setAttribute('uv',new THREE.Float32BufferAttribute(data.uvs,2));
    if(data.colors?.length)g.setAttribute('color',new THREE.Float32BufferAttribute(data.colors,3));
    g.computeBoundingSphere();return g;
  }
  async function texture(url,signal,sampler) {
    const response=await fetch(url,{signal});if(!response.ok)throw new Error(`纹理 ${response.status}`);
    const bitmap=await createImageBitmap(await response.blob(),{imageOrientation:'flipY'});
    if(disposed){bitmap.close();throw aborted();}
    const t=new THREE.Texture(bitmap);t.colorSpace=THREE.SRGBColorSpace;t.needsUpdate=true;t.flipY=false;
    applySourceSampler(t,sampler);
    t.addEventListener('dispose',()=>bitmap.close());return t;
  }
  function releaseChunk(group) {group.removeFromParent();for(const mesh of group.children){mesh.geometry=null;mesh.material.dispose();for(const key of mesh.userData.keys)release(key);mesh.dispose?.();}}
  function clearMaskBatches(){for(const mesh of maskBatches){maskRoot.remove(mesh);mesh.dispose();}maskBatches.length=0;maskBatchSignature='';}
  function clearMasks(){clearMaskBatches();for(const group of maskGroups.values())for(const mesh of group.children)mesh.material.dispose();maskGroups.clear();}
  function clearMap(){cancelAtlasZoom();clearEnemyDensity();enemyLayer?.setMap(null);activeFloorBounds=null;enemyLayer?.setBounds(null);floorGuide?.dispose();floorGuide=null;guideError=null;guideButton.hidden=true;guideButton.disabled=false;clearMasks();for(const group of poiBodies.values())releaseChunk(group);poiBodies.clear();pickRoot.clear();poiPending.clear();poiWanted.clear();visiblePois.clear();poiFailures.clear();selectedPois.clear();types=[];atlasView=null;miniWidth=0;miniBounds=null;footprint=[];atlasError=null;poiIndexPending=false;
    if(backdrop){root?.remove(backdrop);backdrop.geometry.dispose();backdrop.material.dispose();backdrop=null;}atlasTexture?.dispose();atlasTexture=null;atlasImage=null;atlasBounds=null;pois=[];categories=[];selectedPoi=null;
    for(const group of chunks.values())releaseChunk(group);chunks.clear();if(overview){root?.remove(overview);overview.geometry.dispose();overview.material.dispose();overview=null;}if(root)scene?.remove(root);wanted.clear();pending.clear();failures.clear();manifest=null;selected=null;detail=false;stats.residentChunks=0;selectionCard.hidden=true;refreshPanels();
  }
  function updateCamera() {
    if(!manifest)return;
    const angle=rotation*Math.PI/2, distance=height*Math.sqrt(3);
    camera=viewMode==='overview'?overviewCamera:sceneCamera;
    const aspect=Math.max(1,stage.clientWidth)/Math.max(1,stage.clientHeight);
    if(viewMode==='overview'){
      const half=height*2*Math.tan(sceneCamera.fov*Math.PI/360);
      camera.left=-half*aspect;camera.right=half*aspect;camera.top=half;camera.bottom=-half;
      camera.position.set(focus.x,Math.max(focus.y+height*2,manifest.bounds.max[1]+1),focus.z);
      camera.up.set(-Math.sin(angle),0,-Math.cos(angle));
    }else{
      camera.aspect=aspect;camera.up.set(0,1,0);
      camera.position.set(focus.x+Math.sin(angle)*distance,focus.y+height,focus.z+Math.cos(angle)*distance);
    }
    camera.lookAt(focus);camera.updateMatrixWorld();camera.updateProjectionMatrix();
  }
  function fitMap() {
    const box=reflectedBox(manifest.bounds);box.getCenter(focus);focus.y+=manifest.camera?.offsetY??1;
    camera.aspect=Math.max(1,stage.clientWidth)/Math.max(1,stage.clientHeight);height=manifest.camera?.height||24.35;
    for(let attempt=0;attempt<60;attempt++){
      updateCamera();let fits=true;
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
        const point=new THREE.Vector3(x,y,z).project(camera);if(Math.abs(point.x)>0.9 || Math.abs(point.y)>0.9 || point.z>1 || point.z< -1)fits=false;
      }
      if(fits)break;height*=1.15;
    }
    fitHeight=height;
    targetHeight=height;zoomAnchor=null;
  }
  function chooseChunks() {
    if(!manifest)return;
    const projection=new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse),frustum=new THREE.Frustum().setFromProjectionMatrix(projection);
    const visible=manifest.chunks.filter(chunk=>frustum.intersectsBox(reflectedBox(chunk.bounds)));
    detail=viewMode==='scene' && (detail?height<135:height<100);
    visible.sort((a,b)=>reflectedBox(a.bounds).getCenter(new THREE.Vector3()).distanceToSquared(focus)-reflectedBox(b.bounds).getCenter(new THREE.Vector3()).distanceToSquared(focus));
    wanted=new Set(detail?visible.map(chunk=>chunk.id):[]);
    choosePoiBodies(frustum);pruneChunks();showLevel();pump();
  }
  function pruneChunks(){const candidates=[...chunks.keys()].filter(id=>!wanted.has(id));candidates.sort((a,b)=>reflectedBox(manifest.chunks.find(c=>c.id===b).bounds).getCenter(new THREE.Vector3()).distanceToSquared(focus)-reflectedBox(manifest.chunks.find(c=>c.id===a).bounds).getCenter(new THREE.Vector3()).distanceToSquared(focus));while(candidates.length>24){const id=candidates.shift();releaseChunk(chunks.get(id));chunks.delete(id);}}
  function showLevel() {
    const complete=detail && [...wanted].every(id=>chunks.has(id));
    if(overview)overview.visible=backdrop?!chunks.size:!complete;
    for(const group of chunks.values())group.visible=backdrop?true:complete;
    stats.detail=backdrop?chunks.size>0:complete;stats.residentChunks=chunks.size;
  }
  function applyRoofs() {
    const groupId=manifest?.buildings?.find(building=>building.id===selected)?.roofGroupId;
    for(const chunk of chunks.values())for(const mesh of chunk.children){
      const affected=!!groupId && mesh.userData.roofGroupId===groupId,m=mesh.material,base=mesh.userData.materialState;
      mesh.visible=!(affected && mode==='hide');
      const transparent=affected && mode==='blend'?true:affected && mode==='hash'?false:base.transparent,hash=affected && mode==='hash';
      if(m.transparent!==transparent || m.alphaHash!==hash)m.needsUpdate=true;
      const roofFade=affected && mode!=='hide'?0.3:1;
      m.transparent=transparent;m.alphaHash=hash;m.opacity=base.opacity*roofFade;m.depthWrite=affected && mode==='blend'?false:affected && mode==='hash'?true:base.depthWrite;m.depthTest=true;
      m.alphaTest=base.alphaTest*roofFade;
    }
    invalidate();
  }
  function materialFor(source,tex){
    const settings={color:new THREE.Color(...(source.color||[1,1,1])),map:tex,alphaTest:source.alphaTest||0,side:source.doubleSided?THREE.DoubleSide:THREE.FrontSide,alphaToCoverage:source.alphaToCoverage===true,transparent:source.transparent===true,depthWrite:source.depthWrite??true,opacity:source.opacity??1};
    const material=source.unlit?new THREE.MeshBasicMaterial(settings):new THREE.MeshLambertMaterial(settings);
    if(tex && (source.textureScale || source.textureOffset)){const view=tex.clone();view.needsUpdate=true;if(!source.textureWrap)view.wrapS=view.wrapT=THREE.RepeatWrapping;if(source.textureScale)view.repeat.fromArray(source.textureScale);if(source.textureOffset)view.offset.fromArray(source.textureOffset);material.map=view;material.addEventListener('dispose',()=>view.dispose());}
    return material;
  }
  async function loadChunk(definition, token) {
    const group=new THREE.Group(),signal=detailController.signal,leases=new Map(),revision=detailRevision;
    const stale=()=>disposed||token!==generation||revision!==detailRevision||!wanted.has(definition.id);
    try {
      const data=await json(resolve(definition.url),signal);
      async function loadBatch(batchIndex){
        const batch=data.batches[batchIndex];
        if(stale())throw aborted();
        const asset=manifest.assets[batch.assetId];if(!asset)throw new Error(`缺失资产 ${batch.assetId}`);
        const keys=[];let material;
        try {
          const geometryUrl=resolve(host.querySelector('[data-control="quality"]').value==='low'&&asset.lod?.lowGeometry?asset.lod.lowGeometry:asset.geometry);
          const geo=await acquire(`g:${token}:${geometryUrl}`,async()=>geometry(await geometryData(geometryUrl,signal,leases,token)));keys.push(geo.key);
          if(stale())throw aborted();
          let tex;if(asset.material.texture){const textureUrl=resolve(asset.material.texture),item=await acquire(`t:${token}:${textureUrl}`,()=>texture(textureUrl,signal,asset.material));keys.push(item.key);tex=item.value;}
          if(stale())throw aborted();
          material=materialFor(asset.material,tex);
          const mesh=new THREE.InstancedMesh(geo.value,material,batch.instances.length),position=new THREE.Vector3(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3(),matrix=new THREE.Matrix4();
          batch.instances.forEach((transform,index)=>{if(transform.length!==10 || transform.some(n=>!Number.isFinite(n)))throw new Error('实例变换无效');position.fromArray(transform);quaternion.fromArray(transform,3);scale.fromArray(transform,7);matrix.compose(position,quaternion,scale);mesh.setMatrixAt(index,matrix);});
          mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();mesh.userData={keys,lowDetail:asset.lod?.lowGeometry&&geometryUrl===resolve(asset.lod.lowGeometry),assetId:batch.assetId,batchIndex,roofGroupId:batch.roofGroupId,materialState:{alphaTest:material.alphaTest,transparent:material.transparent,depthWrite:material.depthWrite,opacity:material.opacity}};group.add(mesh);
        }catch(error){material?.dispose();keys.forEach(release);throw error;}
      }
      // ponytail: two chunk jobs × four batches; raise only after measuring network contention.
      let nextBatch=0,failed=false;
      const workers=await Promise.allSettled(Array.from({length:Math.min(4,data.batches.length)},async()=>{
        while(!failed&&nextBatch<data.batches.length){const index=nextBatch++;try{await loadBatch(index);}catch(error){failed=true;throw error;}}
      }));
      const rejected=workers.find(worker=>worker.status==='rejected');if(rejected)throw rejected.reason;
      if(stale()){releaseChunk(group);return;}
      root.add(group);chunks.set(definition.id,group);pruneChunks();applyRoofs();showLevel();invalidate();
    }catch(error){releaseChunk(group);if(error.name!=='AbortError' && !stale()){failures.add(definition.id);tell(`细节载入失败，保留全览：${error.message}`);}}finally{await releasePacks(leases);}
  }
  function isHighlighted(point){return highlightTypes.has(point.typeId)||selectedPois.has(point.id);}
  function choosePoiBodies(frustum){
    const candidates=detail?pois.filter(point=>point.spawn==='fixed' && point.parts?.length && (point.bounds?frustum.intersectsBox(reflectedBox(point.bounds)):frustum.containsPoint(new THREE.Vector3(point.position[0],point.position[1],-point.position[2])))):[];
    candidates.sort((a,b)=>selectedPois.has(a.id)?-1:selectedPois.has(b.id)?1:new THREE.Vector3(a.position[0],a.position[1],-a.position[2]).distanceToSquared(focus)-new THREE.Vector3(b.position[0],b.position[1],-b.position[2]).distanceToSquared(focus));
    visiblePois=new Set(candidates.map(point=>point.id));poiWanted=new Set(visiblePois);poiLimitReached=false;
    for(const [id,group]of poiBodies)group.visible=visiblePois.has(id);prunePoiBodies();syncMasks();
  }
  function prunePoiBodies(){const candidates=[...poiBodies.keys()].filter(id=>!poiWanted.has(id));while(candidates.length>64){const id=candidates.shift(),group=poiBodies.get(id);pickRoot.remove(group);releaseChunk(group);poiBodies.delete(id);}}
  async function loadPoiBody(point,token){
    const group=new THREE.Group(),baseUrl=manifestUrl,signal=detailController.signal,leases=new Map(),revision=detailRevision;
    const stale=()=>disposed||generation!==token||revision!==detailRevision;
    try{for(const part of point.parts||[]){const keys=[];let material;try{if(stale())throw aborted();const geoUrl=new URL(part.geometry,baseUrl).href,geo=await acquire(`g:${token}:${geoUrl}`,async()=>geometry(await geometryData(geoUrl,signal,leases,token)));keys.push(geo.key);let tex;if(part.material?.texture){const textureUrl=new URL(part.material.texture,baseUrl).href,item=await acquire(`t:${token}:${textureUrl}`,()=>texture(textureUrl,signal,part.material));keys.push(item.key);tex=item.value;}if(stale())throw aborted();material=materialFor(part.material||{},tex);const mesh=new THREE.Mesh(geo.value,material);mesh.matrix.fromArray(part.matrix);mesh.matrixAutoUpdate=false;mesh.userData={keys,poiId:point.id};group.add(mesh);}catch(error){material?.dispose();keys.forEach(release);throw error;}}
      if(stale() || !poiWanted.has(point.id)){releaseChunk(group);return;}(point.renderModel?root:pickRoot).add(group);poiBodies.set(point.id,group);prunePoiBodies();syncMasks();invalidate();
    }catch(error){releaseChunk(group);if(error.name!=='AbortError' && !stale()){poiFailures.add(point.id);tell(`固定交互模型未加载：${point.title} · ${error.message}`);}}finally{await releasePacks(leases);}
  }
  function syncMasks(){
    const desired=new Set([...visiblePois].filter(id=>isHighlighted(pois.find(p=>p.id===id))));
    for(const [id,group]of maskGroups)if(!desired.has(id)){maskRoot.remove(group);for(const mesh of group.children)mesh.material.dispose();maskGroups.delete(id);}
    for(const id of desired){const body=poiBodies.get(id);if(!body)continue;const point=pois.find(p=>p.id===id),color=selectedPois.has(id)?'#fff0a5':styleFor(point).color;
      if(maskGroups.has(id)){for(const mesh of maskGroups.get(id).children)mesh.material.uniforms.tint.value.set(color);continue;}
      const group=new THREE.Group();for(const mesh of body.children){const mask=new THREE.Mesh(mesh.geometry,silhouetteMaterial(mesh.material.clone(),color));mask.matrix.copy(mesh.matrix);mask.matrixAutoUpdate=false;group.add(mask);}maskGroups.set(id,group);
    }
    const signature=[...maskGroups].map(([id,g])=>`${id}:${g.children[0]?.material.uniforms.tint.value.getHex()}`).join('|');if(signature===maskBatchSignature)return;
    clearMaskBatches();maskBatchSignature=signature;const batches=new Map();
    for(const group of maskGroups.values())for(const mesh of group.children){const u=mesh.material.uniforms,t=u.map.value,key=[mesh.geometry.uuid,t?.source.uuid,t?.wrapS,t?.wrapT,t?.minFilter,t?.magFilter,t?.flipY,u.uvMatrix.value.elements.join(','),u.cutoff.value,u.opacity.value,mesh.material.side,u.tint.value.getHex()].join(':');let batch=batches.get(key);if(!batch){batch=[];batches.set(key,batch);}batch.push(mesh);}
    for(const batch of batches.values()){const first=batch[0],mesh=new THREE.InstancedMesh(first.geometry,first.material,batch.length);batch.forEach((item,index)=>mesh.setMatrixAt(index,item.matrix));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();maskRoot.add(mesh);maskBatches.push(mesh);}maskRoot.updateMatrixWorld(true);
  }
  function pumpPoi(selectedOnly=false){const token=generation;for(const id of poiWanted){if(active>=2)break;if(selectedOnly&&!selectedPois.has(id))continue;if(poiBodies.has(id)||poiPending.has(id)||poiFailures.has(id))continue;const point=pois.find(item=>item.id===id);if(!point)continue;active++;poiPending.add(id);stats.loadPending=active;loadPoiBody(point,token).finally(()=>{active--;if(token===generation)poiPending.delete(id);stats.loadPending=active;if(!disposed){pump();invalidate();}});}}
  function pump() {
    if(disposed || !manifest || viewMode!=='scene')return;
    if(Math.abs(targetHeight-height)>0.01)return;
    const token=generation;
    pumpPoi(true);
    for(const id of wanted){const definition=manifest.chunks.find(chunk=>chunk.id===id);
      if(active>=2)break;if(!wanted.has(definition.id)||chunks.has(definition.id)||pending.has(definition.id)||failures.has(definition.id))continue;
      active++;pending.add(definition.id);stats.loadPending=active;
      loadChunk(definition,token).finally(()=>{active--;if(token===generation)pending.delete(definition.id);stats.loadPending=active;if(!disposed){pump();invalidate();}});
    }
    pumpPoi();

  }
  function render(time=performance.now()) {
    frame=0;stats.rafPending=0;if(disposed || lost || document.hidden)return;
    const width=Math.max(1,stage.clientWidth),heightPixels=Math.max(1,stage.clientHeight);
    renderer.setSize(width,heightPixels,false);camera.aspect=width/heightPixels;
    if(Math.abs(targetHeight-height)>0.01){if(zoomReduced.matches)height=targetHeight;else height+=(targetHeight-height)*(1-Math.exp(-Math.min(40,zoomFrameTime?time-zoomFrameTime:16.67)/65));zoomFrameTime=time;if(Math.abs(targetHeight-height)<0.01)height=targetHeight;updateCamera();if(zoomAnchor){const hit=screenGround(camera,stage.getBoundingClientRect(),zoomAnchor.x,zoomAnchor.y,focus.y);if(hit)focus.add(zoomAnchor.world.clone().sub(hit));}}
    updateCamera();chooseChunks();syncEnemyDensity();renderer.info.reset();if(maskGroups.size){silhouettePass??=createSilhouettePass(renderer);silhouettePass.render(scene,camera,maskScene,width,heightPixels);}else renderer.render(scene,camera);drawAtlas();drawOverviewMarkers();floorGuide?.updateProjection();if(Math.abs(targetHeight-height)>0.01)invalidate();else{zoomAnchor=null;zoomFrameTime=0;}
    const info=renderer.info;Object.assign(stats,{drawcalls:info.render.calls,triangles:info.render.triangles,geometries:info.memory.geometries,textures:info.memory.textures,renderedFrames:stats.renderedFrames+1});
    const loaded=[...wanted].filter(id=>chunks.has(id)).length,loading=detail&&loaded<wanted.size;
    if(floorGuide?.metrics().open)tell("办公室楼层导览 · 玩家攻略，版本与楼层对应待确认");else if(!failures.size)tell(`${manifest?.title||'载入中'} · ${viewMode==='overview'?'平面地图 · 数字为相邻点位，点击数字放大':stats.detail?'3D实景':loading?'3D实景加载中':detail&&!wanted.size?'3D实景 · 此处无场景分块，可选择点位定位':'3D实景 · 远距概览（放大加载模型）'}${loading?` · ${loaded}/${wanted.size} 分区`:''}${poiLimitReached?' · 附近交互物较多，优先显示近处与所选目标':''}${selectedPoi?' · '+(pois.find(point=>point.id===selectedPoi)?.title||''):''}${selected?' · '+(manifest.buildings.find(b=>b.id===selected)?.manualOnly?'手动室内：触发范围未验证':'已按原屋顶组处理'):''}`);
  }
  function markerGroups(project){
    const buckets=new Map();for(const point of markerPois().filter(isHighlighted)){const [x,y]=project(point),key=selectedPois.has(point.id)?point.id:Math.floor(x/28)+':'+Math.floor(y/28);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push({point,x,y});}
    return [...buckets.values()].map(entries=>({id:entries.length===1?entries[0].point.id:null,ids:entries.map(e=>e.point.id),point:entries[0].point,x:entries.reduce((n,e)=>n+e.x,0)/entries.length,y:entries.reduce((n,e)=>n+e.y,0)/entries.length,position:[entries.reduce((n,e)=>n+e.point.position[0],0)/entries.length,0,entries.reduce((n,e)=>n+e.point.position[2],0)/entries.length]}));
  }
  function drawMarker(ctx,group){const {x,y,point,ids}=group,style=styleFor(point),img=ids.length===1?markerImage(point):null,r=ids.length>1?12:img?15:8;ctx.save();ctx.shadowColor='#0008';ctx.shadowBlur=4;ctx.fillStyle='#1a2721';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.strokeStyle=selectedPois.has(point.id)?'#fff0a5':style.color;ctx.lineWidth=selectedPois.has(point.id)?3:1.5;ctx.stroke();if(ids.length>1){ctx.fillStyle='#edf7ef';ctx.font='600 11px '+markerFont;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(ids.length),x,y+.5);}else if(img){const scale=23/Math.max(img.naturalWidth,img.naturalHeight);ctx.drawImage(img,x-img.naturalWidth*scale/2,y-img.naturalHeight*scale/2,img.naturalWidth*scale,img.naturalHeight*scale);}else{ctx.fillStyle=style.color;mark(ctx,x,y,5,style.shape,style.ring);}ctx.restore();}
  function drawOverviewMarkers(){
    overviewMarkers=[];const width=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight);if(markerCanvas.width!==width||markerCanvas.height!==h){markerCanvas.width=width;markerCanvas.height=h;}const ctx=markerCanvas.getContext('2d');ctx.clearRect(0,0,width,h);if(!camera)return;
    const project=position=>{const p=new THREE.Vector3(position[0],position[1],-position[2]).project(camera);return p.z< -1.000001||p.z>1.000001?[NaN,NaN]:[(p.x+1)*width/2,(1-p.y)*h/2];};
    const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    function projectPolygon(points){
      let polygon=points.map(p=>new THREE.Vector3(p[0],p[1],-p[2]));
      for(const plane of frustum.planes){const clipped=[];for(let i=0;i<polygon.length;i++){const a=polygon[i],b=polygon[(i+1)%polygon.length],da=plane.distanceToPoint(a),db=plane.distanceToPoint(b);if(da>=0)clipped.push(a);if((da>=0)!==(db>=0))clipped.push(a.clone().lerp(b,da/(da-db)));}polygon=clipped;}
      return polygon.map(p=>{p.project(camera);return[(p.x+1)*width/2,(1-p.y)*h/2];});
    }
    if(viewMode==='overview'){overviewMarkers=markerGroups(point=>project(point.position)).filter(g=>g.x>=-12&&g.y>=-12&&g.x<=width+12&&g.y<=h+12);for(const group of overviewMarkers)drawMarker(ctx,group);}
    enemyLayer?.draw(ctx,project,{surface:'stage',width,height:h,gpuDensity:true,floorBounds:activeFloorBounds,projectPolygon});
    markerCanvas.setAttribute('data-marker-count',String(overviewMarkers.length));
  }
  function refreshPanels(){
    for(const panel of panels){const oldInput=panel.querySelector('[data-type-search]'),oldSearch=oldInput?.value||'',focused=document.activeElement===oldInput,caret=oldInput?.selectionStart,caretEnd=oldInput?.selectionEnd,oldScroll=panel.scrollTop,openGroups=new Map([...panel.querySelectorAll('details')].map(n=>[n.dataset.category,n.open]));panel.replaceChildren();const title=document.createElement('div');title.className='wm-panel-title';title.textContent='资源筛选';const close=document.createElement('button');close.dataset.action='close-filters';close.textContent='收起';title.append(close);panel.append(title);
      const search=document.createElement('input');search.type='search';search.dataset.typeSearch='';search.placeholder='搜索资源类型';search.setAttribute('aria-label','查找资源类型');search.value=oldSearch;panel.append(search);const actions=document.createElement('div');actions.className='wm-filter-actions';actions.innerHTML='<button data-action=select-filtered>全选结果</button><button data-action=clear-highlights>清空</button><span class=wm-filter-count></span>';panel.append(actions);
      for(const category of categories){const items=types.filter(type=>type.category===category.id);if(!items.length)continue;const group=document.createElement('details');group.dataset.category=category.id;group.open=openGroups.get(category.id)??(category===categories[0]||Boolean(oldSearch));const summary=document.createElement('summary');summary.textContent=category.title;group.append(summary);
        for(const type of items){const label=document.createElement('label');label.dataset.typeTitle=type.title;const input=document.createElement('input');input.type='checkbox';input.dataset.highlightType=type.id;input.checked=highlightTypes.has(type.id);const box=typeBox(type.id);let legend;if(box?.icon)legend=art(box,'wm-resource-art');else{legend=document.createElement('canvas');legend.className='wm-type-symbol';legend.width=legend.height=18;const style=styleFor(type);legend.dataset.shape=style.shape;const ctx=legend.getContext('2d');ctx.fillStyle=style.color;mark(ctx,9,9,6,style.shape,style.ring);}const text=document.createElement('span');text.textContent=type.title;const count=node('small','wm-type-count',String(type.count));label.append(input,legend,text,count);group.append(label);}panel.append(group);}
      filterLegend(panel,oldSearch);panel.hidden=!filtersOpen;if(focused&&!panel.hidden){search.focus({preventScroll:true});if(caret!=null)search.setSelectionRange(caret,caretEnd??caret);}panel.scrollTop=oldScroll;
    }
  }
  function filterLegend(panel,query){for(const group of panel.querySelectorAll('details')){const labels=[...group.querySelectorAll('[data-type-title]')];for(const label of labels)label.hidden=!label.dataset.typeTitle.toLowerCase().includes(query.toLowerCase());group.hidden=labels.every(label=>label.hidden);if(query&&!group.hidden)group.open=true;}}
  function refreshSelection(){
    const previous=new Map([...selectionCard.querySelectorAll('.wm-poi-card')].map(card=>[card.dataset.poiId,{open:card.querySelector('details')?.open,scroll:card.querySelector('.loot-items')?.scrollTop||0}]));
    selectionCard.replaceChildren();selectionCard.hidden=!selectedPois.size;
    for(const id of selectedPois){const point=pois.find(p=>p.id===id);if(!point)continue;
      const boxes=boxesFor(point),box=boxes[0],ground=point.generationAnchor,groundItems=point.groundLoot||[],card=node('article','wm-poi-card');card.dataset.poiId=id;
      const details=node('details','wm-poi-details'),summary=node('summary','wm-poi-heading');details.open=previous.get(id)?.open||false;
      if(box?.icon)summary.append(art(box,'wm-poi-art'));
      const copy=node('div','wm-poi-copy');copy.append(node('strong','',box?.name||(ground?point.title:point.typeTitle)||point.title),node('small','',`X ${point.position[0].toFixed(1)} / Z ${point.position[2].toFixed(1)}${point.visualState?' · '+point.visualState:''}`));
      summary.append(copy,node('span','wm-poi-chevron','⌄'));details.append(summary);
      const content=node('div','wm-poi-content');
      if(!lootData){content.append(node('p','wm-empty',lootFailed?'物资资料暂时无法读取。':'正在读取物资…'));if(lootFailed){const retry=node('button','','重试');retry.dataset.action='retry-loot';content.append(retry);}}
      else if(ground){if(groundItems.length)content.append(window.WikiLoot.itemGrid(groundItems));else content.append(node('p','wm-empty','物品会在标记附近生成。'));}
      else if(boxes.length){
        if(boxes.length>1)content.append(node('p','wm-empty','此类容器有多个物资方案，分别查看。'));
        for(const entry of boxes){const section=node('section','wm-poi-pool');section.dataset.containerId=entry.id;if(boxes.length>1)section.append(node('h3','',entry.variantLabel||entry.name));
          if(entry.spawnNote)section.append(node('p','wm-poi-condition',entry.spawnNote));
          if(entry.items.length)section.append(window.WikiLoot.itemGrid(entry.items));else section.append(node('p','wm-empty',entry.note||'没有可列出的物资。'));
          content.append(section);
        }
      }else{content.append(node('p','wm-empty','暂无对应的搜刮物资。'));const browse=node('a','','查看本图搜刮目录');browse.href=lootLink.href;content.append(browse);}
      details.append(content);card.append(details);
      const itemCount=ground?groundItems.length:box?.items.length;const preview=node('button','wm-poi-preview',itemCount?`${itemCount} 种可能物资 · 查看物资`:'查看物资');preview.dataset.action='toggle-loot';preview.dataset.poiId=id;preview.setAttribute('aria-expanded',String(details.open));
      const actions=node('div','wm-poi-actions');
      const locate=node('button','','平面定位');locate.dataset.action='focus-poi';locate.dataset.poiId=id;
      const go=node('button','','3D实景');go.dataset.action='view-poi';go.dataset.poiId=id;
      const cancel=node('button','wm-poi-close','×');cancel.dataset.action='cancel-poi';cancel.dataset.poiId=id;cancel.setAttribute('aria-label','取消选择'+(box?.name||point.typeTitle||point.title));
      actions.append(locate,go);card.append(preview,actions,cancel);selectionCard.append(card);
      details.addEventListener('toggle',()=>{preview.setAttribute('aria-expanded',String(details.open));if(details.open&&matchMedia('(max-width:700px)').matches)showFilters(false);});
      const grid=card.querySelector('.loot-items');if(grid&&previous.has(id))grid.scrollTop=previous.get(id).scroll;
    }
    selectedPoi=[...selectedPois].at(-1)||null;dialog.querySelector('[data-action=atlas-loot]').disabled=!selectedPoi;const point=pois.find(p=>p.id===selectedPoi);if(point){dialog.querySelector('[data-coordinate="x"]').value=point.position[0];dialog.querySelector('[data-coordinate="z"]').value=point.position[2];dialog.querySelector('.wm-atlas-note').textContent=`${point.typeTitle||point.title} · X ${point.position[0]} / Z ${point.position[2]}${point.visualState?' · '+point.visualState:''} · 点击“查看物资”打开容器详情`;}
  }
  function refreshPois(){for(const counter of host.querySelectorAll('.wm-filter-count'))counter.textContent='已选 '+highlightTypes.size+' 类';for(const panel of panels)for(const input of panel.querySelectorAll('[data-highlight-type]'))input.checked=highlightTypes.has(input.dataset.highlightType);refreshSelection();syncMasks();drawAtlas();invalidate();}
  function setHighlightTypes(ids){highlightTypes.clear();for(const id of ids||[])if(types.some(t=>t.id===id))highlightTypes.add(id);refreshPois();}
  function selectPoi(id){if(!id)selectedPois.clear();else if(pois.some(p=>p.id===id)){if(selectedPois.has(id))selectedPois.delete(id);else selectedPois.add(id);}if(floorGuide?.metrics().mode==='detail')host.classList.toggle('wm-floor-loot-open',selectedPois.size>0);if(selectedPois.size&&matchMedia('(max-width:700px)').matches)showFilters(false);refreshSelection();syncMasks();drawAtlas();invalidate();}
  function markerPois(){return pois.filter(point=>(point.spawn==='fixed'||point.presence?.kind==='known-configured-generation-anchor')&&(!activeFloorBounds||point.position[0]>=activeFloorBounds.min[0]&&point.position[0]<=activeFloorBounds.max[0]&&point.position[2]>=activeFloorBounds.min[2]&&point.position[2]<=activeFloorBounds.max[2]));}
  function rectFor(bounds,canvas){const scale=Math.min(canvas.width/(bounds.max[0]-bounds.min[0]),canvas.height/(bounds.max[2]-bounds.min[2]));return{center:[(bounds.min[0]+bounds.max[0])/2,(bounds.min[2]+bounds.max[2])/2],scale};}
  function atlasRect(canvas){if(!manifest)return null;const view=canvas===miniCanvas?rectFor(miniBounds||atlasBounds||manifest.bounds,canvas):atlasView||rectFor(atlasBounds||manifest.bounds,canvas);return{...view,width:canvas.width,height:canvas.height};}
  function toAtlas(position,rect){const a=rect.rotation||0,c=Math.cos(a),s=Math.sin(a),dx=position[0]-rect.center[0],dz=position[2]-rect.center[1];return[rect.width/2+(dx*c+dz*s)*rect.scale,rect.height/2-(-dx*s+dz*c)*rect.scale];}
  function fromAtlas(x,y,rect){const a=rect.rotation||0,c=Math.cos(a),s=Math.sin(a),dx=(x-rect.width/2)/rect.scale,dz=(rect.height/2-y)/rect.scale;return[rect.center[0]+dx*c-dz*s,0,rect.center[1]+dx*s+dz*c];}
  function updateMini(){
    if(!camera||fallback){miniBounds=atlasBounds||manifest?.bounds;footprint=[];return;}const rect={left:0,top:0,width:2,height:2},points=[];for(const [x,y]of[[0,0],[2,0],[2,2],[0,2]]){const p=screenGround(camera,rect,x,y,0);if(!p||!Number.isFinite(p.x)||p.distanceTo(camera.position)>height*100){points.length=0;break;}points.push([p.x,0,-p.z]);}footprint=points;
    const xs=points.map(p=>p[0]),zs=points.map(p=>p[2]),cx=points.length?(Math.min(...xs)+Math.max(...xs))/2:focus.x,cz=points.length?(Math.min(...zs)+Math.max(...zs))/2:-focus.z,aspect=miniCanvas.width/miniCanvas.height;
    const needed=points.length?Math.max(32,(Math.max(...xs)-Math.min(...xs))*1.3,(Math.max(...zs)-Math.min(...zs))*1.3*aspect):64;
    if(!miniWidth||needed>miniWidth*1.05||needed<miniWidth*.75)miniWidth=needed;
    miniBounds={min:[cx-miniWidth/2,0,cz-miniWidth/aspect/2],max:[cx+miniWidth/2,0,cz+miniWidth/aspect/2]};
  }
  function mark(ctx,x,y,r,shape,ring=false){ctx.beginPath();if(shape==='circle')ctx.arc(x,y,r,0,Math.PI*2);else if(shape==='plus'||shape==='cross'){ctx.save();ctx.translate(x,y);if(shape==='cross')ctx.rotate(Math.PI/4);ctx.rect(-r,-r/3,2*r,2*r/3);ctx.rect(-r/3,-r,2*r/3,2*r);ctx.restore();}else{const n={square:4,diamond:4,triangle:3,pentagon:5,hexagon:6}[shape]||4,offset=shape==='square'?Math.PI/4:-Math.PI/2;for(let i=0;i<n;i++){const a=offset+i*Math.PI*2/n,px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;if(i)ctx.lineTo(px,py);else ctx.moveTo(px,py);}ctx.closePath();}ctx.fill();if(ring){ctx.beginPath();ctx.arc(x,y,r+1.5,0,Math.PI*2);ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=1;ctx.stroke();}}
  function drawAtlas(){if(!manifest)return;updateMini();for(const canvas of dialog.open?[miniCanvas,atlasCanvas]:[miniCanvas]){if(canvas===atlasCanvas){const w=Math.max(1,canvas.clientWidth),h=Math.max(1,canvas.clientHeight);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}if(!atlasView){atlasView=rectFor(atlasBounds||manifest.bounds,canvas);atlasFitScale=atlasView.scale;}}
      const ctx=canvas.getContext('2d'),rect=atlasRect(canvas);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#17202a';ctx.fillRect(0,0,canvas.width,canvas.height);
      if(atlasImage){const b=atlasBounds,[x,y]=toAtlas([b.min[0],0,b.max[2]],{...rect,rotation:0}),w=(b.max[0]-b.min[0])*rect.scale,h=(b.max[2]-b.min[2])*rect.scale;ctx.save();ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(rect.rotation||0);ctx.translate(-canvas.width/2,-canvas.height/2);ctx.translate(x,y+h);ctx.scale(1,-1);ctx.imageSmoothingEnabled=true;ctx.drawImage(atlasImage,0,0,w,h);ctx.restore();}
      for(const group of markerGroups(point=>toAtlas(point.position,rect))){if(group.x>=-12&&group.y>=-12&&group.x<=canvas.width+12&&group.y<=canvas.height+12)drawMarker(ctx,group);}
      enemyLayer?.draw(ctx,position=>toAtlas(position,rect),{surface:canvas===atlasCanvas?'atlas':'mini',width:canvas.width,height:canvas.height,floorBounds:activeFloorBounds});
      if(footprint.length){ctx.strokeStyle='#a2e5ef';ctx.fillStyle='#a2e5ef18';ctx.lineWidth=1.5;ctx.beginPath();footprint.forEach((p,i)=>{const[x,y]=toAtlas(p,rect);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);});ctx.closePath();ctx.fill();ctx.stroke();}
      const[x,y]=toAtlas([focus.x,0,-focus.z],rect);ctx.strokeStyle='#fff3c2';ctx.beginPath();ctx.arc(x,y,4,0,Math.PI*2);ctx.stroke();
    }}
  function cropFloor(bounds){
    activeFloorBounds=bounds;
    enemyLayer?.setBounds(bounds);
    if(backdrop&&atlasBounds){
      const b=bounds||atlasBounds,positions=backdrop.geometry.getAttribute('position'),uv=backdrop.geometry.getAttribute('uv');
      for(const[i,x,z]of[[0,b.min[0],b.min[2]],[1,b.max[0],b.min[2]],[2,b.max[0],b.max[2]],[3,b.min[0],b.max[2]]]){
        positions.setXYZ(i,x,-.05,z);uv.setXY(i,(x-atlasBounds.min[0])/(atlasBounds.max[0]-atlasBounds.min[0]),(z-atlasBounds.min[2])/(atlasBounds.max[2]-atlasBounds.min[2]));
      }
      positions.needsUpdate=uv.needsUpdate=true;backdrop.geometry.computeBoundingSphere();
    }
    drawAtlas();invalidate();
  }
  function focusBounds(bounds,insets={}){
    if(!manifest||fallback||!camera||disposed)return false;
    if(bounds?.min?.length!==3||bounds?.max?.length!==3||!bounds.min.every(Number.isFinite)||!bounds.max.every(Number.isFinite))return false;
    const width=Math.max(1,stage.clientWidth),h=Math.max(1,stage.clientHeight),left=insets.left||0,right=(insets.right||0)+64,top=insets.top||0,bottom=insets.bottom||0;
    const availableWidth=Math.max(80,width-left-right),availableHeight=Math.max(80,h-top-bottom),spanX=bounds.max[0]-bounds.min[0],spanZ=bounds.max[2]-bounds.min[2];
    if(spanX<=0||spanZ<=0)return false;
    setViewMode('overview',false);setRotation(0);
    height=targetHeight=Math.max(6,Math.max(spanX*h/availableWidth,spanZ*h/availableHeight)*1.12/(4*Math.tan(sceneCamera.fov*Math.PI/360)));
    const perPixel=height*4*Math.tan(sceneCamera.fov*Math.PI/360)/h;
    setFocus([(bounds.min[0]+bounds.max[0])/2+(right-left)*perPixel/2,0,(bounds.min[2]+bounds.max[2])/2+(top-bottom)*perPixel/2]);
    zoomAnchor=null;cropFloor(bounds);return true;
  }
  async function loadFloorGuide(token,open=false){
    if(stats.mapId!=='Origin08_1999'||!manifest?.atlas?.image)return;
    guideButton.hidden=false;guideButton.disabled=true;guideButton.textContent='楼层导览';guideError=null;
    try{
      const {mountFloorGuide}=await import(new URL('./floor-guide.js'+new URL(import.meta.url).search,import.meta.url));
      if(disposed||token!==generation)return;
      floorGuide??=mountFloorGuide({host,stage,atlasUrl:resolve(manifest.atlas.image),atlas:manifest.atlas,atlasTexture,focusBounds,projectSource,
        selectPoi:id=>{if(!pois.some(point=>point.id===id))return false;if(!selectedPois.has(id))selectPoi(id);host.classList.add('wm-floor-loot-open');return true;},onShow:()=>{host.classList.remove('wm-floor-loot-open');showFilters(false);cropFloor(null);},onHide:()=>{host.classList.remove('wm-floor-loot-open');cropFloor(null)}});
      guideButton.title='玩家攻略记录，楼层对应待校准';guideButton.disabled=false;if(open)floorGuide.showDeck();
    }catch(error){if(disposed||token!==generation)return;guideError='楼层攻略暂时无法读取，请重试。';guideButton.disabled=false;guideButton.textContent='重试楼层导览';guideButton.title=guideError;}
  }
  function openAtlas(){stopMainZoom();cancelAtlasZoom();if(disposed||dialog.open||!manifest)return;floorGuide?.close({restoreFocus:false});atlasReturnFocus=document.activeElement;dialog.showModal();enemyLayer?.syncContainer();if(viewMode==='overview'&&camera){updateCamera();atlasView={rotation:rotation*Math.PI/2,center:[focus.x,-focus.z],scale:Math.max(1,stage.clientHeight)/(overviewCamera.top-overviewCamera.bottom)};}drawAtlas();atlasFitScale=rectFor(atlasBounds||manifest.bounds,atlasCanvas).scale;dialog.querySelector('[data-action="coordinate"]').textContent=viewMode==='overview'?'定位':'查看实景';dialog.querySelector('[data-coordinate="x"]').value=focus.x.toFixed(1);dialog.querySelector('[data-coordinate="z"]').value=(-focus.z).toFixed(1);dialog.querySelector('[data-action="close-atlas"]').focus();}
  function closeAtlas(){cancelAtlasZoom();if(dialog.open){if(viewMode==='overview'&&atlasView&&manifest&&sceneCamera&&!fallback){setFocus([atlasView.center[0],0,atlasView.center[1]]);height=targetHeight=stage.clientHeight/(atlasView.scale*4*Math.tan(sceneCamera.fov*Math.PI/360));zoomAnchor=null;invalidate();}dialog.close();}enemyLayer?.syncContainer();if(atlasReturnFocus?.isConnected)atlasReturnFocus.focus();else stage.focus();}
  function goTo(position){if(!position||position.some(n=>!Number.isFinite(n)))return;setViewMode('scene',false);setFocus(position);height=targetHeight=manifest?.camera?.height||24.35;zoomAnchor=null;drawAtlas();invalidate();}
  async function loadAtlas(data,token){
    if(!data.atlas?.image)return;const t=await texture(resolve(data.atlas.image),mapController.signal,{textureFilter:'nearest',textureMipmaps:false,textureWrap:['clamp','clamp']});if(disposed || generation!==token){t.dispose();throw aborted();}
    atlasTexture=t;atlasImage=t.image;atlasBounds=data.atlas.bounds;if(fallback){drawAtlas();return;}const b=atlasBounds,y=-0.05,g=geometry({positions:[b.min[0],y,b.min[2],b.max[0],y,b.min[2],b.max[0],y,b.max[2],b.min[0],y,b.max[2]],uvs:[0,0,1,0,1,1,0,1],indices:[0,2,1,0,3,2]});backdrop=new THREE.Mesh(g,new THREE.MeshBasicMaterial({map:t,depthWrite:false,alphaTest:0.01}));backdrop.renderOrder=-100;root.add(backdrop);
  }
  async function loadPois(data,token){if(!data.pois?.url){refreshPanels();refreshPois();return;}poiIndexPending=true;try{const loaded=await json(resolve(data.pois.url),mapController.signal);if(disposed||generation!==token)return;pois=loaded.points||[];categories=loaded.categories||[];types=loaded.types||[];for(const type of types)if(type.title==='储物箱'||type.title==='医疗箱')highlightTypes.add(type.id);refreshPanels();showFilters(filtersOpen,false);refreshPois();}catch(error){if(error.name!=='AbortError')tell(`点位索引未加载：${error.message}`);}finally{if(generation===token){poiIndexPending=false;invalidate();}}}
  async function changeMap(id) {
    if(disposed)throw aborted();
    const token=++generation;mapController?.abort();clearDetail();mapController=new AbortController();clearMap();tell('读取地图概览…');const entry=maps.find(map=>map.id===id);if(!entry)throw new Error('地图不存在');
    mapSelect.value=id;
    manifestUrl=new URL(entry.manifest,dataUrl).href;
    const signal=mapController.signal,data=await json(manifestUrl,signal);if(disposed || token!==generation)throw aborted();
    if(data.schemaVersion!==1 || !data.bounds || !data.assets || !Array.isArray(data.chunks))throw new Error('不支持的地图数据格式');
    manifest=data;manifest.title=entry.title||data.title;stats.mapId=id;enemyLayer?.setMap(id);lootLink.href='#loot/'+encodeURIComponent(id);const issues=(data.issues||[]).filter(issue=>!String(issue.impact||issue.reason||'').includes('动态燃烧'));gapNotice.textContent=[entry.updateWarning,...issues.map(issue=>issue.impact||issue.reason||'部分资源未加载')].filter(Boolean).join('；');gapNotice.hidden=!gapNotice.textContent;if(entry.updateHistoryHref){const history=document.createElement('a');history.href=entry.updateHistoryHref;history.textContent=' 查看更新档案';gapNotice.append(history);}
    buildingSelect.replaceChildren(new Option('室外',''));
    for(const building of data.buildings||[])buildingSelect.add(new Option(`${building.name||building.id}${building.manualOnly?'（手动）':''}`,building.id));
    if(fallback){
      if(data.atlas?.image)try{await loadAtlas(data,token);}catch(error){if(error.name==='AbortError')throw error;atlasError=error.message;}
      await loadPois(data,token);
      tell(`WebGL2不可用，三维地图未加载。\n当前地图：${data.title||id}\n${data.buildings?.length?'建筑目录：\n'+data.buildings.map(building=>`${building.name||building.id}${building.manualOnly?'（仅手动索引，触发范围未验证）':''}`).join('\n'):'此地图未导出可核实的建筑索引。'}\n可使用地图和建筑下拉列表浏览目录。`);
      if(id==='Origin08_1999')loadFloorGuide(token);
      return;
    }
    root=new THREE.Group();root.scale.z=-1;scene.add(root);
    scene.background=new THREE.Color('#202523');sceneCamera.fov=data.camera?.fov||15;
    scene.children.filter(child=>child.isLight).forEach(child=>scene.remove(child));
    const sourceAmbient=data.lighting?.ambientIntensity??0.7;
    scene.add(new THREE.AmbientLight(0xffffff,readingLight?Math.max(0.7,sourceAmbient):sourceAmbient));
    const light=new THREE.DirectionalLight(new THREE.Color(...(data.lighting?.color||[1,1,1])),data.lighting?.intensity??1);
    const direction=new THREE.Vector3(0,0,-1).applyQuaternion(new THREE.Quaternion(...(data.lighting?.quaternion||[0,0,0,1])));direction.z=-direction.z;light.position.copy(direction.multiplyScalar(-50));scene.add(light);
    if(data.atlas?.image){try{await loadAtlas(data,token);}catch(error){if(error.name==='AbortError')throw error;atlasError=error.message;dialog.querySelector('.wm-atlas-note').textContent='平面底图未加载，仅提供坐标与点位索引。';}}
    if(!backdrop){const overviewData=await json(resolve(data.overview.geometry),signal);if(disposed || token!==generation)throw aborted();overview=new THREE.Mesh(geometry(overviewData),new THREE.MeshBasicMaterial({vertexColors:!!overviewData.colors?.length,color:overviewData.colors?.length?0xffffff:0x87968a,side:THREE.FrontSide}));root.add(overview);}
    rotation=0;host.querySelector('[data-control="angle"]').value=0;host.querySelector('.wm-angle output').textContent='0°';fitMap();if(viewMode==='overview')height=targetHeight=fitHeight*.65;
    const poiReady=loadPois(data,token);
    if(queuedInterior!==undefined){const id=queuedInterior;queuedInterior=undefined;setInterior(id);}
    if(queuedFocus){const position=queuedFocus;queuedFocus=null;setFocus(position);}
    if(frame)cancelAnimationFrame(frame);frame=0;render();
    if(id==='Origin08_1999')poiReady.then(()=>{if(!disposed&&token===generation)loadFloorGuide(token);});
  }
  function clearDetail(){
    detailController.abort();detailController=new AbortController();detailRevision++;wanted.clear();failures.clear();poiWanted.clear();visiblePois.clear();poiFailures.clear();clearMasks();
    for(const group of chunks.values())releaseChunk(group);chunks.clear();for(const group of poiBodies.values())releaseChunk(group);poiBodies.clear();pickRoot.clear();detail=false;stats.detail=false;stats.residentChunks=0;
  }
  function setViewMode(value,near=true){
    if(disposed || !['overview','scene'].includes(value))return;
    if(value!==viewMode)stopMainZoom();
    if(value==='scene')floorGuide?.close({restoreFocus:false});
    if(value!==viewMode){clearDetail();viewMode=value;}
    for(const button of host.querySelectorAll('.wm-mode button'))button.setAttribute('aria-pressed',String(button.dataset.action===value));
    host.dataset.viewMode=value;host.querySelector('.wm-minimap').hidden=value==='overview';
    stage.setAttribute('aria-label',`${value==='scene'?'3D实景':'平面概览'}；方向键平移，加减缩放，R转向，M点位平面图`);
    stage.querySelector('.wm-help').textContent=value==='scene'?'3D实景 · 拖动平移 · 右键/Shift转向 · 滚轮缩放':'平面地图 · 拖动平移 · 滚轮缩放 · 勾选资源后点击标记 · M全屏';
    if(near && value==='scene' && manifest){height=targetHeight=manifest.camera?.height||24.35;zoomAnchor=null;}
    showLevel();invalidate();
  }
  function setInterior(id) {
    if(disposed)return;if(!manifest){queuedInterior=id;return;}
    selected=id||null;buildingSelect.value=selected||'';
    const building=manifest?.buildings?.find(b=>b.id===selected);
    if(fallback){tell(`三维地图不可用。${manifest.title} · ${building?`${building.name||building.id}${building.manualOnly?'（手动目录，触发范围未验证）':''}`:'建筑目录可通过下拉列表阅读。'}`);return;}
    if(building){setViewMode('scene',false);reflectedBox(building.bounds).getCenter(focus);focus.y=building.bounds.min[1]+1;height=targetHeight=manifest.camera?.height||24.35;zoomAnchor=null;}
    applyRoofs();invalidate();
  }
  function setFocus(position) {if(disposed)return;stopMainZoom();if(!manifest){queuedFocus=position;return;}if(position)focus.set(position[0],position[1]+(manifest?.camera?.offsetY??1),-position[2]);invalidate();}
  function stopMainZoom(){targetHeight=height;zoomAnchor=null;zoomFrameTime=0;}
  function wheelDelta(event,size){return Math.max(-120,Math.min(120,event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?size:1)));}
  function zoom(factor,clientX,clientY) {if(!Number.isFinite(factor)||factor<=0)return;targetHeight=Math.max(6,Math.min(fitHeight*1.5,targetHeight*factor));if(clientX!==undefined && camera){updateCamera();const hit=screenGround(camera,stage.getBoundingClientRect(),clientX,clientY,focus.y);zoomAnchor=hit?{x:clientX,y:clientY,world:hit}:null;}invalidate();}
  listen(host,'change',event=>{const control=event.target.dataset.control;if(control==='map')changeMap(event.target.value).catch(error=>{if(error.name!=='AbortError')tell(error.message);});if(control==='building')setInterior(event.target.value);if(control==='roof'){mode=event.target.value;applyRoofs();}if(control==='quality'){renderer?.setPixelRatio(event.target.value==='low'?0.75:1);clearDetail();invalidate();}});
  listen(host,'change',event=>{
    if(event.target.dataset.control!=='reading-light')return;readingLight=event.target.checked;
    const ambient=scene?.children.find(child=>child.isAmbientLight),sourceAmbient=manifest?.lighting?.ambientIntensity??0.7;
    if(ambient)ambient.intensity=readingLight?Math.max(0.7,sourceAmbient):sourceAmbient;invalidate();
  });
  function setRotation(degrees){rotation=((degrees%360)+360)%360/90;const input=host.querySelector('[data-control="angle"]');input.value=rotation*90;input.nextElementSibling.textContent=`${Math.round(rotation*90)}°`;zoomAnchor=null;invalidate();}
  function showFilters(open,focusInput=true){if(open){floorGuide?.close({restoreFocus:false});enemyLayer?.setOpen(false);}const wasInside=panels.some(p=>p.contains(document.activeElement));filtersOpen=open;host.classList.toggle('wm-filter-open',open);for(const panel of panels)panel.hidden=!open;host.querySelector('[data-action="filters"]').setAttribute('aria-expanded',String(open));if(open&&focusInput)panels[dialog.open?1:0].querySelector('[data-type-search]')?.focus();else if(!open&&wasInside)host.querySelector('[data-action=filters]').focus({preventScroll:true});}
  listen(host,'input',event=>{if(event.target.dataset.control==='angle')setRotation(Number(event.target.value));if(event.target.hasAttribute('data-type-search')){const value=event.target.value;for(const panel of panels){panel.querySelector('[data-type-search]').value=value;filterLegend(panel,value);}}});
  listen(host,'change',event=>{const id=event.target.dataset.highlightType;if(id){if(event.target.checked)highlightTypes.add(id);else highlightTypes.delete(id);refreshPois();}});
  listen(host,'click',event=>{const button=event.target.closest('[data-action]');if(!button)return;const action=button.dataset.action;
    if(action==='enemies')toggleEnemies();
    if(action==='floor-guide'){enemyLayer?.setOpen(false);stopMainZoom();if(floorGuide)floorGuide.showDeck();else loadFloorGuide(generation,true);}
    if(action==='zoom-in')zoom(.75);if(action==='zoom-out')zoom(1.333);
    if(action==='retry-loot')ensureLoot();
    if(action==='atlas-loot'){closeAtlas();showFilters(false);const details=[...selectionCard.querySelectorAll('.wm-poi-card')].find(n=>n.dataset.poiId===selectedPoi)?.querySelector('details');if(details){details.open=true;details.querySelector('summary').focus({preventScroll:true});}}
    if(action==='toggle-loot'){const details=button.closest('.wm-poi-card').querySelector('details');details.open=!details.open;}
    if(action==='select-filtered'){const panel=button.closest('.wm-type-panel');for(const input of panel.querySelectorAll('[data-type-title]:not([hidden]) [data-highlight-type]'))highlightTypes.add(input.dataset.highlightType);refreshPois();}if(action==='clear-highlights')setHighlightTypes([]);
    if(action==='focus-poi'){const point=pois.find(p=>p.id===button.dataset.poiId);if(point){setViewMode('overview',false);setFocus(point.position);height=targetHeight=Math.min(height,180);invalidate();}}
    if(action==='overview'){floorGuide?.close({restoreFocus:false});setViewMode('overview');}if(action==='scene')setViewMode('scene');
    if(action==='rotate-left')setRotation(rotation*90-15);if(action==='rotate-right')setRotation(rotation*90+15);
    if(action==='reset'&&manifest){floorGuide?.close({restoreFocus:false});fitMap();selected=null;buildingSelect.value='';applyRoofs();}
    if(action==='filters')showFilters(!filtersOpen);if(action==='close-filters')showFilters(false);
    if(action==='atlas')openAtlas();if(action==='close-atlas')closeAtlas();
    if(action==='exhibit'){host.classList.toggle('wm-exhibit');button.textContent=host.classList.contains('wm-exhibit')?'退出专注':'专注模式';fitWorkspace();invalidate();}
    if(action==='cancel-poi')selectPoi(button.dataset.poiId);if(action==='view-poi'){const point=pois.find(p=>p.id===button.dataset.poiId);if(point)goTo(point.position);}
    if(action==='coordinate'){const x=Number(dialog.querySelector('[data-coordinate="x"]').value),z=Number(dialog.querySelector('[data-coordinate="z"]').value);if(Number.isFinite(x)&&Number.isFinite(z)){if(viewMode==='overview')atlasView.center=[x,z];else goTo([x,0,z]);closeAtlas();}}
  });
  listen(dialog,'cancel',event=>{event.preventDefault();closeAtlas();});
  function canvasPosition(canvas,event){const b=canvas.getBoundingClientRect();return[(event.clientX-b.left)*canvas.width/b.width,(event.clientY-b.top)*canvas.height/b.height];}
  const atlasZoomLimit=()=>sceneCamera?Math.max(40,stage.clientHeight/(24*Math.tan(sceneCamera.fov*Math.PI/360))):40;
  function atlasHit(canvas,event){const[x,y]=canvasPosition(canvas,event),rect=atlasRect(canvas);let nearest=null,distance=196;for(const group of markerGroups(point=>toAtlas(point.position,rect))){const d=(group.x-x)**2+(group.y-y)**2;if(d<distance){nearest=group;distance=d;}}return{point:nearest?.id?nearest.point:null,cluster:nearest&&!nearest.id?nearest:null,position:nearest?.position||fromAtlas(x,y,rect)};}
  function cancelAtlasZoom(){if(atlasZoomFrame)cancelAnimationFrame(atlasZoomFrame);atlasZoomFrame=0;atlasZoom=null;}
  function atlasZoomTick(time){atlasZoomFrame=0;const z=atlasZoom;if(!z||disposed||document.hidden||!dialog.open||z.view!==atlasView){cancelAtlasZoom();return;}const target=Math.max(atlasFitScale*.4,Math.min(atlasZoomLimit(),z.target)),dt=Math.min(40,z.time?time-z.time:16.67);z.time=time;atlasView.scale+= (target-atlasView.scale)*(1-Math.exp(-dt/65));if(zoomReduced.matches||Math.abs(atlasView.scale-target)<target*.0002)atlasView.scale=target;const after=fromAtlas(z.x,z.y,atlasRect(atlasCanvas));atlasView.center=[atlasView.center[0]+z.world[0]-after[0],atlasView.center[1]+z.world[2]-after[2]];drawAtlas();if(atlasView.scale===target)cancelAtlasZoom();else atlasZoomFrame=requestAnimationFrame(atlasZoomTick);}
  listen(atlasCanvas,'wheel',event=>{event.preventDefault();if(!atlasView)return;const[x,y]=canvasPosition(atlasCanvas,event),delta=wheelDelta(event,atlasCanvas.clientHeight),target=Math.max(atlasFitScale*.4,Math.min(atlasZoomLimit(),(atlasZoom&&atlasZoom.direction===Math.sign(delta)?atlasZoom.target:atlasView.scale)*Math.exp(-delta*.0005)));atlasZoom={view:atlasView,target,x,y,world:fromAtlas(x,y,atlasRect(atlasCanvas)),direction:Math.sign(delta),time:atlasZoom?.time||0};if(zoomReduced.matches)atlasZoomTick(performance.now());else if(!atlasZoomFrame)atlasZoomFrame=requestAnimationFrame(atlasZoomTick);},{passive:false});
  for(const name of ['pointerdown','keydown','click'])listen(dialog,name,cancelAtlasZoom,{capture:true});listen(dialog,'close',cancelAtlasZoom);listen(window,'resize',cancelAtlasZoom);
  listen(atlasCanvas,'pointerdown',event=>{atlasCanvas.setPointerCapture(event.pointerId);atlasPointer={x:event.clientX,y:event.clientY,center:[...atlasView.center],moved:false};});
  listen(atlasCanvas,'pointermove',event=>{if(atlasPointer){const dx=event.clientX-atlasPointer.x,dy=event.clientY-atlasPointer.y;if(Math.hypot(dx,dy)>4)atlasPointer.moved=true;if(atlasPointer.moved){const a=atlasView.rotation||0,c=Math.cos(a),s=Math.sin(a);atlasView.center=[atlasPointer.center[0]-(dx*c+dy*s)/atlasView.scale,atlasPointer.center[1]-(dx*s-dy*c)/atlasView.scale];drawAtlas();}}else{const hit=atlasHit(atlasCanvas,event);atlasCanvas.title=hit.point?`${hit.point.typeTitle||hit.point.title} · X ${hit.point.position[0]} / Z ${hit.point.position[2]}`:'';}});
  listen(atlasCanvas,'pointerup',event=>{if(atlasPointer&&!atlasPointer.moved){const hit=atlasHit(atlasCanvas,event),[ex,ey]=canvasPosition(atlasCanvas,event);if(enemyLayer?.placePlayer(fromAtlas(ex,ey,atlasRect(atlasCanvas)))){atlasPointer=null;return;}const enemyHit=enemyLayer?.hit('atlas',ex,ey,!(!hit.point&&!hit.cluster));if(enemyHit&&!hit.point&&!hit.cluster){enemyLayer.selectHit(enemyHit);atlasPointer=null;return;}if(hit.cluster&&atlasView.scale>=atlasZoomLimit()-.01){for(const id of hit.cluster.ids)selectedPois.add(id);refreshPois();closeAtlas();}else if(hit.cluster){atlasView.center=[hit.cluster.position[0],hit.cluster.position[2]];atlasView.scale=Math.min(atlasZoomLimit(),atlasView.scale*2);drawAtlas();}else if(hit.point)selectPoi(hit.point.id);else{dialog.querySelector('[data-coordinate="x"]').value=hit.position[0].toFixed(1);dialog.querySelector('[data-coordinate="z"]').value=hit.position[2].toFixed(1);dialog.querySelector('.wm-atlas-note').textContent='目标坐标已选中，点击“查看实景”前往。';}}atlasPointer=null;});
  listen(atlasCanvas,'pointercancel',()=>atlasPointer=null);
  listen(miniCanvas,'click',event=>{event.stopPropagation();const hit=atlasHit(miniCanvas,event);goTo(hit.point?.position||hit.position);});
  listen(document,'keydown',event=>{if(event.ctrlKey||event.metaKey||event.altKey||event.isComposing)return;const target=event.target,editing=target.closest?.('textarea,select,[contenteditable="true"]')||(target.tagName==='INPUT'&&!['checkbox','range','button'].includes(target.type));
    if(document.querySelector('dialog[open]')&&!dialog.open)return;
    if(!editing&&(event.key==='m'||event.key==='M')){event.preventDefault();if(dialog.open)closeAtlas();else openAtlas();}
    if(event.key==='Escape'){if(dialog.open){event.preventDefault();closeAtlas();}else if(enemyLayer?.metrics().open){event.preventDefault();enemyLayer.setOpen(false);}else if(floorGuide?.metrics().open){event.preventDefault();floorGuide.close();}else if(filtersOpen){event.preventDefault();showFilters(false);}else if(selectedPois.size){event.preventDefault();selectPoi(null);}else if(host.classList.contains('wm-exhibit')){event.preventDefault();host.classList.remove('wm-exhibit');host.querySelector('[data-action="exhibit"]').textContent='专注模式';fitWorkspace();invalidate();}}
  });
  const touches=new Map();let pinch=0,dragOrigin=null,gestureMoved=false,rotateDrag=null;
  const isControl=event=>event.target.closest('button,input,label,select,.wm-type-panel,.wm-selection,.wm-floor-ui,.wm-enemy-panel');
  listen(stage,'contextmenu',event=>{if(!isControl(event))event.preventDefault();});
  listen(stage,'pointerdown',event=>{if(!camera||!manifest||fallback||lost||isControl(event))return;stage.focus();stage.setPointerCapture(event.pointerId);targetHeight=height;zoomAnchor=null;zoomFrameTime=0;updateCamera();touches.set(event.pointerId,[event.clientX,event.clientY]);dragOrigin=[event.clientX,event.clientY];gestureMoved=touches.size>1;rotateDrag=(event.button===2||event.shiftKey)?{x:event.clientX,angle:rotation*90}:null;pointer=rotateDrag?null:screenGround(camera,stage.getBoundingClientRect(),event.clientX,event.clientY,focus.y);});
  listen(stage,'pointermove',event=>{if(!touches.has(event.pointerId))return;if(dragOrigin&&Math.hypot(event.clientX-dragOrigin[0],event.clientY-dragOrigin[1])>4)gestureMoved=true;touches.set(event.pointerId,[event.clientX,event.clientY]);if(rotateDrag){setRotation(rotateDrag.angle+(event.clientX-rotateDrag.x)*.3);return;}if(touches.size===2){gestureMoved=true;const[a,b]=[...touches.values()],distance=Math.hypot(a[0]-b[0],a[1]-b[1]);if(pinch)zoom(pinch/distance,(a[0]+b[0])/2,(a[1]+b[1])/2);pinch=distance;pointer=null;return;}if(pointer){updateCamera();const hit=screenGround(camera,stage.getBoundingClientRect(),event.clientX,event.clientY,focus.y);if(hit)focus.add(pointer.clone().sub(hit));invalidate();}});
  function endPointer(event){touches.delete(event.pointerId);pointer=null;pinch=0;rotateDrag=null;if(touches.size===1){const[x,y]=[...touches.values()][0];updateCamera();pointer=screenGround(camera,stage.getBoundingClientRect(),x,y,focus.y);}}
  listen(stage,'pointerup',endPointer);listen(stage,'pointercancel',endPointer);
  listen(stage,'click',event=>{if(gestureMoved||!camera||isControl(event))return;const box=stage.getBoundingClientRect(),x=event.clientX-box.left,y=event.clientY-box.top;if(enemyLayer?.placePlayer(groundAt(event.clientX,event.clientY)))return;const marker=viewMode==='overview'?[...overviewMarkers].sort((a,b)=>(a.x-x)**2+(a.y-y)**2-((b.x-x)**2+(b.y-y)**2)).find(p=>(p.x-x)**2+(p.y-y)**2<=196):null;if(marker&&!marker.id){if(targetHeight<=6.01){for(const id of marker.ids)selectedPois.add(id);refreshPois();return;}setFocus(marker.position);targetHeight=Math.max(6,targetHeight*.55);invalidate();return;}const enemyPoint=enemyLayer?.hit('stage',x,y,true);if(!marker&&enemyPoint){enemyLayer.selectHit(enemyPoint);return;}const hit=marker?{poiId:marker.id}:pick(event.clientX,event.clientY);if(hit?.poiId)selectPoi(hit.poiId);else{const enemyHit=enemyLayer?.hit('stage',x,y);if(enemyHit)enemyLayer.selectHit(enemyHit);}});
  listen(stage,'wheel',event=>{if(isControl(event))return;event.preventDefault();const delta=wheelDelta(event,stage.clientHeight);if(Math.sign(delta)!==Math.sign(targetHeight-height))targetHeight=height;zoom(Math.exp(delta*.0005),event.clientX,event.clientY);},{passive:false});
  listen(stage,'keydown',event=>{if(event.target!==stage||event.ctrlKey||event.metaKey||event.altKey)return;stopMainZoom();const step=height*.06,key=event.key,angle=rotation*Math.PI/2;let handled=true;if(key==='r'||key==='R')setRotation(rotation*90+15);else if(key==='+'||key==='=')zoom(.8);else if(key==='-')zoom(1.25);else if(key.startsWith('Arrow')){const right=key==='ArrowRight'?step:key==='ArrowLeft'?-step:0,up=key==='ArrowUp'?step:key==='ArrowDown'?-step:0;focus.x+=right*Math.cos(angle)-up*Math.sin(angle);focus.z-=right*Math.sin(angle)+up*Math.cos(angle);}else handled=false;if(handled){event.preventDefault();invalidate();}});
  listen(zoomReduced,'change',()=>{if(zoomReduced.matches&&atlasZoom){if(atlasZoomFrame)cancelAnimationFrame(atlasZoomFrame);atlasZoomFrame=0;atlasZoomTick(performance.now());}invalidate();});
  listen(document,'visibilitychange',()=>{if(document.hidden){cancelAtlasZoom();targetHeight=height;zoomAnchor=null;zoomFrameTime=0;}if(document.hidden && frame){cancelAnimationFrame(frame);frame=0;stats.rafPending=0;}else invalidate();});
  let maps=[],dataUrl=new URL(options.dataUrl||'./data/maps.json',import.meta.url).href;
  const ready=(async()=>{
    maps=await json(dataUrl);if(disposed)throw aborted();if(!Array.isArray(maps)||!maps.length)throw new Error('无可用地图');
    ensureLoot();
    for(const map of maps)mapSelect.add(new Option(map.title,map.id));
    try {renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'low-power'});}catch(error){
      fallback=true;stage.hidden=true;host.append(selectionCard);host.classList.add('wm-fallback');host.querySelector('.wm-toolbar').append(host.querySelector('.wm-map-tools [data-action=atlas]'));host.style.gridTemplateRows='auto 1fr';status.style.whiteSpace='pre-line';status.style.padding='20px';
      host.querySelectorAll('[data-action="reset"],[data-action="rotate-left"],[data-action="rotate-right"],[data-control="angle"],[data-action="exhibit"],[data-control="quality"],[data-control="roof"],[data-control="reading-light"]').forEach(control=>{control.disabled=true;});
      await changeMap(options.mapId||maps[0].id);
      throw new Error(`WebGL2不可用。地图与建筑目录仍可阅读；${error.message}`);
    }
    renderer.info.autoReset=false;renderer.setPixelRatio(0.75);renderer.outputColorSpace=THREE.SRGBColorSpace;stage.prepend(renderer.domElement);
    scene=new THREE.Scene();sceneCamera=new THREE.PerspectiveCamera(15,1,0.3,20000);overviewCamera=new THREE.OrthographicCamera(-1,1,1,-1,0.3,20000);camera=overviewCamera;
    listen(renderer.domElement,'webglcontextlost',event=>{event.preventDefault();lost=true;if(frame)cancelAnimationFrame(frame);frame=0;stats.rafPending=0;tell('图形上下文已丢失；建筑列表仍可使用，请重新进入地图页恢复。');});
    mapSelect.value=options.mapId||maps[0].id;await changeMap(mapSelect.value);
  })().catch(error=>{if(error.name!=='AbortError' && (!fallback || !manifest))tell(`地图无法显示：${error.message}`);throw error;});
  function dispose() {if(disposed)return;cancelAtlasZoom();enemyLayer?.dispose();enemyLayer=null;disposed=true;if(dialog.open)dialog.close();generation++;controller.abort();mapController?.abort();detailController.abort();observer.disconnect();listeners.forEach(remove=>remove());if(frame)cancelAnimationFrame(frame);frame=0;clearMap();for(const entry of cache.values())entry.value?.dispose();cache.clear();for(const image of markerImages.values())image.onload=null;markerImages.clear();lootData=lootLinks=null;lootTypeIndex.clear();silhouettePass?.dispose();renderer?.dispose();renderer?.forceContextLoss();host.remove();stats.disposed=true;stats.rafPending=0;stats.residentChunks=0;stats.geometries=0;stats.textures=0;}
  function metrics(){let hiddenRoofBatches=0,visibleRoofBatches=0,affectedRoofMeshes=0;const roofId=manifest?.buildings?.find(b=>b.id===selected)?.roofGroupId;for(const group of chunks.values())for(const mesh of group.children)if(mesh.userData.roofGroupId){if(mesh.visible)visibleRoofBatches++;else hiddenRoofBatches++;if(mesh.userData.roofGroupId===roofId)affectedRoofMeshes++;}
    const rect=atlasView&&atlasRect(atlasCanvas),viewBounds=rect?{min:fromAtlas(0,rect.height,rect),max:fromAtlas(rect.width,0,rect)}:null,modelIds=[...visiblePois].filter(id=>poiBodies.has(id));
    return{...stats,densityUploads,enemyLayer:enemyLayer?.metrics()||null,atlasZoomPending:Boolean(atlasZoom),floorGuide:floorGuide?.metrics()||null,guideError,viewMode,pixelRatio:renderer?.getPixelRatio(),detailPending:pending.size,quality:host.querySelector('[data-control="quality"]').value,residentPacks:[...cache.keys()].filter(key=>key.startsWith('pack:')).length,lowDetailMeshes:[...chunks.values()].flatMap(group=>group.children).filter(mesh=>mesh.userData.lowDetail).length,fallback,readingLight,ambientIntensity:scene?.children.find(child=>child.isAmbientLight)?.intensity,cameraHeight:height,targetHeight,cameraFov:camera?.fov,rotation,rotationDegrees:rotation*90,projection:camera?.isOrthographicCamera?"orthographic":"perspective",pitchDegrees:viewMode==="overview"?90:30,focus:[focus.x,focus.y,-focus.z],exhibit:host.classList.contains('wm-exhibit'),atlasOpen:dialog.open,atlasLoaded:!!atlasImage,atlasError,atlasBounds,atlasView:atlasView?{center:[...atlasView.center],scale:atlasView.scale}:null,atlasViewBounds:viewBounds,atlasZoom:atlasView?.scale,miniBounds,footprint,markerCount:markerPois().length,poiCount:pois.length,filteredPoiCount:pois.length,overviewMarkerIds:overviewMarkers.flatMap(p=>p.ids),overviewClusterCount:overviewMarkers.filter(p=>!p.id).length,poiCategories:categories,poiTypes:types.map(t=>({...t,style:styleFor(t)})),markerStyles:Object.fromEntries(types.map(t=>[t.id,styleFor(t)])),highlightTypeIds:[...highlightTypes],selectedPoiIds:[...selectedPois],highlightPoiIds:pois.filter(isHighlighted).map(p=>p.id),selectedPoi,visiblePoiIds:[...visiblePois],poiLoadPending:poiPending.size+(poiIndexPending?1:0),poiResidentModels:poiBodies.size,poiModelIds:modelIds,nonvisibleCachedPois:[...poiBodies.keys()].filter(id=>!visiblePois.has(id)).length,silhouetteCount:maskGroups.size,maskTargetSize:silhouettePass?.size()||[0,0],outlineCssPixels:2,poiOutlineParts:[...maskGroups.values()].reduce((n,g)=>n+g.children.length,0),selectedModelReady:!selectedPoi||poiBodies.has(selectedPoi),atlasKind:manifest?.atlas?.kind,lodDetail:detail,selectedBuilding:selected,roofMode:mode,hiddenRoofBatches,visibleRoofBatches,hiddenRoofMeshes:hiddenRoofBatches,affectedRoofMeshes,buildings:manifest?.buildings?.length||0,desiredChunks:[...wanted],visibleChunks:[...wanted],wantedCount:wanted.size,nonvisibleCachedChunks:[...chunks.keys()].filter(id=>!wanted.has(id)).length,assetsRefs:[...cache.entries()].map(([key,value])=>({key,refs:value.refs,ready:!!value.value}))};
  }
  function alphaVisible(hit){const m=hit.object.material;if(m.opacity<=0)return false;if(!m.map||!hit.uv||!(m.alphaTest>0||m.transparent||m.alphaToCoverage))return true;const image=m.map.image;if(!image)return true;let pixels=alphaPixels.get(image);if(!pixels){const canvas=new OffscreenCanvas(image.width,image.height),ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);pixels={width:image.width,height:image.height,data:ctx.getImageData(0,0,image.width,image.height).data};alphaPixels.set(image,pixels);}m.map.updateMatrix();const uv=m.map.transformUv(hit.uv.clone()),x=Math.max(0,Math.min(pixels.width-1,Math.floor(uv.x*pixels.width))),y=Math.max(0,Math.min(pixels.height-1,Math.floor(uv.y*pixels.height))),alpha=pixels.data[(y*pixels.width+x)*4+3]/255*m.opacity;return alpha>=Math.max(m.alphaTest||0,(m.transparent||m.alphaToCoverage)?.001:0);}
  function pick(clientX,clientY){if(!camera)return null;updateCamera();root?.updateMatrixWorld(true);pickRoot.updateMatrixWorld(true);const box=stage.getBoundingClientRect(),ray=new THREE.Raycaster();ray.setFromCamera(new THREE.Vector2((clientX-box.left)/box.width*2-1,1-(clientY-box.top)/box.height*2),camera);
    const live=[...chunks.values()].filter(g=>g.visible).flatMap(g=>g.children).filter(m=>m.visible),physical=ray.intersectObjects(live).find(alphaVisible);
    const models=[...poiBodies.entries()].filter(([id])=>visiblePois.has(id)).flatMap(([,g])=>g.children),pointHit=ray.intersectObjects(models).find(alphaVisible);
    if(pointHit&&(!physical||pointHit.distance<=physical.distance+.025)){return{poiId:pointHit.object.userData.poiId,position:[pointHit.point.x,pointHit.point.y,-pointHit.point.z]};}
    if(!physical)return null;const transform=new THREE.Matrix4();physical.object.getMatrixAt(physical.instanceId,transform);const asset=manifest.assets[physical.object.userData.assetId];return{assetId:physical.object.userData.assetId,batchIndex:physical.object.userData.batchIndex,instanceId:physical.instanceId,instanceTransform:transform.toArray(),position:[physical.point.x,physical.point.y,-physical.point.z],sourceGeometry:asset.geometry,material:asset.material,asset};
  }
  function projectSource(position){if(!camera)return null;updateCamera();const box=stage.getBoundingClientRect(),point=new THREE.Vector3(position[0],position[1],-position[2]).project(camera);return {x:box.left+(point.x+1)*box.width/2,y:box.top+(1-point.y)*box.height/2};}
  function groundAt(x,y){if(!camera)return null;updateCamera();const point=screenGround(camera,stage.getBoundingClientRect(),x,y,focus.y);return point?[point.x,point.y,-point.z]:null;}
  return {ready,dispose,setViewMode,setInterior,setFocus,goTo,zoom,openAtlas,closeAtlas,selectPoi,togglePoiSelection:selectPoi,clearPoiSelection:()=>selectPoi(null),setHighlightTypes,setRotation,pick,rayScene:pick,projectSource,groundAt,setMap:id=>changeMap(id),metrics,element:host};
}
