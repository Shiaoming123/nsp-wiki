import {createEngine} from './workshop-engine.js';
import {composeWeapon} from './workshop-assembly.js';
import {readPlans, savePlans} from './workshop-model.js';
import {createReportModel} from './workshop-report.js';
import {statDifference,createComparisons,createTrialRecovery,applyPostedTrial,comparisonReason} from './workshop-state.js';
import {renderWorkshopImage,copyWorkshopImage,downloadWorkshopImage} from './workshop-image.js';

let dataPromise, assemblyPromise;
const drafts = new Map();
let currentId = '';
const storage = {getItem:key=>localStorage.getItem(key), setItem:(key,value)=>localStorage.setItem(key,value)};

function currentNativeEffects(part){
  const effects=window.Wiki.getItem(part.itemId)?.specialEffects?.filter(effect=>effect.kind==='innate');
  return effects?.length?effects.map(effect=>effect.name+' · '+effect.description):part.nativeEffects;
}
function additionalEffects(report){
  return report.conditionalEffects.filter(effect=>!report.parts.some(part=>part.path.length===effect.path?.length&&part.path.every((slot,i)=>slot===effect.path[i])&&part.nativeEffects.some(text=>text===effect.text||text.endsWith(' · '+effect.text))));
}

function renderWorkshopReport(report,{el,art}){
  const root=el('div');root.append(el('h2','','整套配装与词条'));
  const state=report.validation.complete?'装配完整':'未完成配装 · 待补齐必需件';root.append(el('p','guide-note',state+(report.validation.kind!=='melee'&&!report.validation.fireable?' · 当前不能开火':'')));
  for(const missing of report.validation.missingRequired)root.append(el('p','guide-note','待补齐 · '+missing.label));
  for(const part of report.parts){
    const block=el('section','workshop-overview-part');block.dataset.partPath=part.path.join('.');block.style.setProperty('--part-depth',String(Math.min(part.path.length,4)));
    const title=el('h3','',part.name);if(part.icon)title.prepend(art(part.icon,'tiny-art'));block.append(title);
    if(part.ammoCount!==null)block.append(el('p','','装填数量 · '+part.ammoCount));
    for(const affix of part.affixes){const row=el('p','workshop-overview-affix');row.dataset.affixId=affix.id;row.append(el('strong','workshop-affix-label',affix.name),el('span','',affix.description));block.append(row);}
    for(const text of currentNativeEffects(part))block.append(el('p','workshop-native-effect',text));root.append(block);
  }
  root.append(el('p','guide-note','变化量对照：'+report.statBaseline.label));
  const stats=el('dl','workshop-overview-stats');for(const stat of report.stats){const row=el('div'),value=el('dd','',stat.formatted);value.append(differenceLabel(stat.difference,el));row.append(el('dt','',stat.label),value);stats.append(row);}root.append(stats);
  for(const ammo of report.capacities.ammo)root.append(el('p','guide-note',ammo.name+' · '+(ammo.count===null?'—':'装填数量 '+ammo.count)));
  for(const effect of additionalEffects(report))if(effect.text)root.append(el('p','guide-note',effect.text));
  return root;
}
function differenceLabel(difference,el,inline=false){const marker=difference.tone==='better'?'↑ ':difference.tone==='worse'?'↓ ':'';const label=el('span','workshop-difference '+difference.tone+(inline?' native-difference':''),inline?' ('+marker+difference.text+')':' '+difference.text);label.setAttribute('aria-label',difference.text+(difference.tone==='better'?' 改善':difference.tone==='worse'?' 下降':' 中性'));return label;}

export function mountWorkshop(root) {
  let disposed = false, diagramObserver=null, diagramFrame=0, imageOperation=null, postsMount=null;
  const ready = start();
  return {ready, dispose(){disposed=true;postsMount?.dispose();imageOperation?.abort();diagramObserver?.disconnect();cancelAnimationFrame(diagramFrame);}};

  async function start() {
    const data = await (dataPromise ||= fetch('/data/workshop.json',{cache:'no-cache'}).then(response=>{
      if (!response.ok) throw Error('工坊资料暂时无法读取');
      return response.json();
    }).catch(error=>{dataPromise=null;throw error;}));
    const assemblyData=await (assemblyPromise ||= fetch('/data/assembly-ui.json',{cache:'no-cache'}).then(response=>{if(!response.ok)throw Error('原生装配图暂时无法读取');return response.json();}).catch(error=>{assemblyPromise=null;throw error;}));
    if (disposed) return;
    const engine = createEngine(data), {el,art,getItem,nativeStat} = window.Wiki;
    const reportModel=createReportModel({rules:data,items:window.Wiki.data.items});let liveReport=null;
    const comparisons=createComparisons(reportModel),recovery=createTrialRecovery(storage,reportModel);
    const rulesIdentity = data.meta.rulesIdentity;
    const itemName = id => getItem(id)?.name || '物品';
    const affixes = data.affixes;
    let build = currentId && drafts.get(currentId), selectedPath = [], selectedSlot = null, paletteSlot=null, partQuery = '';
    let diagramView={zoom:null,left:0,top:0},inspectorRoot=null;
    let plans = readPlans(storage), busy = false;
    const section=el('div','workshop-page'), heading=el('div','workshop-heading reference-heading');
    const basis=el('p','workshop-basis');for(const text of ['EA','腐化进度 100%','效果倍率 1'])basis.append(el('span','',text));heading.append(el('h1','','武器工坊'),basis);
    const controls=el('div','workshop-controls'),primaryControls=el('div','workshop-controls-primary'),secondaryControls=el('div','workshop-controls-secondary'),outputActions=el('div','workshop-output-actions'),trialActions=el('div','workshop-trial-actions');
    primaryControls.setAttribute('aria-label','当前试装与本地方案');secondaryControls.setAttribute('aria-label','比较、导出与分享');controls.append(primaryControls,secondaryControls);secondaryControls.append(trialActions,outputActions);
    const weaponLabel=el('label','','主武器'), weaponSelect=el('select');
    weaponSelect.setAttribute('aria-label','选择主武器');
    const placeholder=el('option','','先选择主武器');placeholder.value='';weaponSelect.append(placeholder);
    for(const [kind,label,subtype] of [['firearm','远程武器'],['melee','单手近战','单手近战'],['melee','双手近战','双手近战'],['melee','其他近战','other']]){
      const group=el('optgroup');group.label=label;
      for(const id of data.mainWeaponIds.filter(id=>data.items[id].kind===kind&&(!subtype||(subtype==='other'?!['单手近战','双手近战'].includes(data.items[id].subcategory):data.items[id].subcategory===subtype))).sort((a,b)=>itemName(a).localeCompare(itemName(b),'zh-CN'))){const option=el('option','',itemName(id));option.value=id;group.append(option);}if(group.children.length)weaponSelect.append(group);
    }
    weaponSelect.value=currentId;weaponLabel.append(weaponSelect);
    const nameLabel=el('label','','方案名称'), nameInput=el('input');nameInput.placeholder='为这次装配起个名字';nameInput.maxLength=80;nameInput.setAttribute('aria-label','方案名称');nameLabel.append(nameInput);
    const save=button('保存方案',saveCurrent), records=el('details','workshop-records');records.append(el('summary','','本地装配记录'));
    const recordList=el('div','workshop-record-list');records.append(recordList);
    primaryControls.append(weaponLabel,nameLabel,save,records);
    const copyImage=button('复制配装图片',()=>exportCurrent(true)),downloadImage=button('下载 PNG',()=>exportCurrent(false));outputActions.append(copyImage,downloadImage);
    const status=el('p','workshop-status');status.setAttribute('role','status');
    const downloadFrozen=button('下载本次 PNG',()=>{});downloadFrozen.hidden=true;
    const workspace=el('div','workshop-workspace');
    const overview=el('section','workshop-overview');
    const comparison=el('section','workshop-comparison');
    const compare=button('加入对比',()=>addComparison(currentInput()));
    const restore=button('恢复上次试装',restoreTrial);trialActions.append(compare,restore);
    const intro=el('p','workshop-intro','编辑当前试装；保存为本地方案，或加入独立快照对比。');
    section.append(heading,intro,controls,status,downloadFrozen,workspace,overview,comparison);root.replaceChildren(section);
    postsMount=window.TierPosts.mount(section,{kind:'workshop',captureCurrentShare,applyPostedBuild,comparePostedBuild});
    outputActions.append(button('发布配装',()=>postsMount.openComposer()));
    if (plans.message) status.textContent=plans.message;
    weaponSelect.onchange=()=>{
      if(build)drafts.set(build.itemId,build);
      currentId=weaponSelect.value;build=currentId?(drafts.get(currentId)||engine.createBuild(currentId)):null;
      selectedPath=[];selectedSlot=null;paletteSlot=null;partQuery='';nameInput.value='';draw(true);
    };
    drawRecords();draw();drawComparison();

    function button(text,click,className='secondary-button') {const b=el('button',className,text);b.type='button';b.onclick=click;return b;}
    function itemProperties(itemId){const item=getItem(itemId),control=button('查看属性',()=>window.Wiki.showItem(item),'workshop-properties');control.disabled=!item;control.setAttribute('aria-label','查看'+itemName(itemId)+'属性');return control;}
    function active(){return !disposed&&section.isConnected;}
    function currentInput(){if(!build)throw Error('请先选择主武器');const report=reportModel.capture({name:nameInput.value,build});return {schemaVersion:1,name:report.name,rulesIdentity:report.rulesIdentity,basis:report.basis,build:report.build};}
    function switchTrial(input){
      if(build)drafts.set(build.itemId,build);
      build=input?structuredClone(input.build):null;currentId=build?.itemId||'';
      if(build)drafts.set(currentId,build);weaponSelect.value=currentId;nameInput.value=input?.name||'';
      selectedPath=[];selectedSlot=null;paletteSlot=null;partQuery='';draw(true);
    }
    async function applyPostedBuild(stored){
      if(!active())throw Error('已离开工坊，未替换试装或恢复快照。');
      if(busy)throw Error('请等待当前操作完成');
      if(plans.blocked)throw Error(plans.message);
      busy=true;section.inert=true;
      try{const checked=await applyPostedTrial(reportModel,recovery,stored,build?currentInput():null,switchTrial,active);if(!active())return;status.textContent='已应用帖子配装；当前试装已保存，可恢复上次试装。'+(checked.recalculated?' 已按当前规则重新计算。':'');workspace.scrollIntoView({block:'start'});}
      finally{busy=false;section.inert=false;if(active())draw();}
    }
    async function restoreTrial(){
      try{if(busy)return;const saved=recovery.read();if(!saved)throw Error('尚无恢复快照');switchTrial(saved.input);status.textContent='已恢复上次试装，已保存方案保留。';}
      catch(error){status.textContent=error.message;}
    }
    function addComparison(input){try{comparisons.add(input);drawComparison();status.textContent='已加入完整配装快照，后续编辑不会改变此列。';}catch(error){status.textContent=error.message;}}
    function comparePostedBuild(stored){if(!active())throw Error('已离开工坊');const checked=reportModel.postedInput(stored);comparisons.add({...checked.input,rulesIdentity:stored.rulesIdentity});drawComparison();comparison.scrollIntoView({block:'start'});}
    function drawComparison(){
      comparison.replaceChildren();comparison.append(el('h2','','配装对比看板'));
      const entries=comparisons.entries;if(!entries.length){comparison.append(el('p','guide-note','从当前试装、本地方案或配装帖子加入完整快照。首列默认为基准，可切换。'));return;}
      const base=entries.find(e=>e.id===comparisons.baselineId),scroll=el('div','workshop-comparison-scroll');scroll.tabIndex=0;scroll.setAttribute('aria-label','配装对比，可横向滚动');
      const keys=[...new Set(entries.flatMap(e=>e.report.stats.map(s=>s.key)))];
      for(const entry of entries){
        const report=entry.report,card=el('article','workshop-comparison-card'),heading=el('h3','',report.name),tools=el('div','workshop-comparison-actions');heading.id='workshop-comparison-'+entry.id;card.setAttribute('aria-labelledby',heading.id);
        const baseline=button(entry.id===base.id?'当前基准':'设为基准',()=>{comparisons.baseline(entry.id);drawComparison();});baseline.setAttribute('aria-pressed',String(entry.id===base.id));
        tools.append(baseline,button('移除',()=>{const wasBase=entry.id===comparisons.baselineId;comparisons.remove(entry.id);drawComparison();if(wasBase)status.textContent='已移除基准，剩余最左列为新基准。';}));card.append(heading,tools);
        const reason=entry.id===base.id?'':comparisonReason(report,base.report,data),stats=el('dl','native-stats workshop-comparison-native');
        for(const key of keys){
          const stat=report.stats.find(s=>s.key===key),spec=stat||entries.flatMap(e=>e.report.stats).find(s=>s.key===key),baselineStat=base.report.stats.find(s=>s.key===key);
          let row;
          if(stat?.status==='known'&&Number.isFinite(stat.value)){
            row=nativeStat(stat);const difference=statDifference(stat,baselineStat,reason),label=differenceLabel(difference,el,true);
            if(difference.value===null){label.textContent=' (—)';label.title=difference.text;}
            label.classList.toggle('is-changed',difference.value!==null&&Math.abs(difference.value)>.0000001);row.querySelector('dd').append(label);
          }else{row=el('div','native-stat workshop-comparison-unknown');row.dataset.stat=key;const gap=el('span','workshop-comparison-no-track','—');gap.setAttribute('aria-hidden','true');row.append(el('dt','native-stat-label',spec.label),gap,el('dd','native-stat-value',stat?'—':'不适用'));}
          stats.append(row);
        }
        card.append(stats);if(reason)card.append(el('p','guide-note workshop-comparison-reason',reason));
        const c=report.capacities,summary=[report.validation.complete?'装配完整':'待补齐必需件',report.validation.kind==='melee'?'近战':report.validation.fireable?'可开火':'当前不能开火'];
        if(report.validation.kind!=='melee')summary.push('弹容 '+(c.assembly.status==='known'?c.assembly.value:'—'),c.ammo.map(a=>a.name+' × '+(a.count??'—')).join('；')||'未装弹');
        card.append(el('p','workshop-comparison-summary',summary.join(' · ')));
        const detail=el('details','workshop-comparison-details');detail.append(el('summary','','完整装配与计算条件 · '+report.parts.length+' 件'));
        for(const missing of report.validation.missingRequired)detail.append(el('p','guide-note','待补齐 · '+missing.label));
        for(const container of c.containers)detail.append(el('p','',container.name+' · 容量 '+(container.capacity.status==='known'?container.capacity.value:'—')));
        for(const part of report.parts){detail.append(el('p','',part.name+(part.ammoCount!==null?' × '+part.ammoCount:'')));for(const affix of part.affixes)detail.append(el('p','workshop-affix-label',affix.name+' · '+affix.description));for(const text of currentNativeEffects(part))detail.append(el('p','workshop-native-effect',text));}
        detail.append(el('p','','腐化100% · 效果倍率1 · 重量倍率1'));
        for(const effect of additionalEffects(report))detail.append(el('p','guide-note',effect.text||'—'));card.append(detail);scroll.append(card);
      }
      comparison.append(scroll);
    }
    async function captureCurrentShare(){
      if(!build)throw Error('请先选择主武器');
      imageOperation?.abort();imageOperation=new AbortController();
      const report=reportModel.capture({name:nameInput.value,build}),input={schemaVersion:1,name:report.name,rulesIdentity:report.rulesIdentity,basis:report.basis,build:report.build};
      const image=await renderWorkshopImage(report,assemblyData,{signal:imageOperation.signal,statStyles:window.Wiki.data.meta.nativeStatStyles,nativeEffects:Object.fromEntries(report.parts.map(part=>[part.itemId,currentNativeEffects(part)]))});
      return {report,input,reportDigest:image.reportDigest,image};
    }
    async function exportCurrent(copy){
      copyImage.disabled=downloadImage.disabled=true;downloadFrozen.hidden=true;status.textContent='正在生成完整配装图片…';
      try{const frozen=await captureCurrentShare();if(!active())return;
        if(copy){const result=await copyWorkshopImage(frozen.image);if(active())status.textContent=result.copied?'已复制完整配装图片':result.reason;
          if(!result.copied&&active()){downloadFrozen.onclick=()=>downloadWorkshopImage(frozen.image);downloadFrozen.hidden=false;}
        }else{downloadWorkshopImage(frozen.image);status.textContent='已生成完整PNG并发起下载';}
      }catch(error){if(active()&&error.name!=='AbortError')status.textContent=error.message;}
      finally{if(active()){copyImage.disabled=downloadImage.disabled=!build;}}
    }
    function validatePlan(value){
      const validation=engine.validateBuild(value);
      if(validation.shapeValid){
        const pending=[value];let unsupported=false;
        while(pending.length){const current=pending.pop();if(current.contagionProgress!==1)unsupported=true;pending.push(...current.children.map(child=>child.node));}
        if(unsupported)return {...validation,valid:false,errors:[...validation.errors,{code:'BASELINE',path:[],message:'此工坊仅支持腐化进度100%的静态方案，原记录已保留'}]};
      }
      return validation;
    }
    function mutate(change,focus,changedAffixPath){
      let next=structuredClone(build);change(next);
      if(changedAffixPath!==undefined){
        const repaired=engine.detachIncompatible(next,changedAffixPath);next=repaired.build;
        if(repaired.removed.length){
          status.textContent='已自动卸下不兼容部件：'+repaired.removed.map(part=>itemName(part.itemId)).join('、')+'（含其下属部件）。';
          selectedPath=[];selectedSlot=null;paletteSlot=null;
        }
      }
      build=next;drafts.set(build.itemId,build);draw();
      if(focus)(workspace.querySelector(`[data-focus="${CSS.escape(focus)}"]`)||workspace.querySelector('.workshop-core'))?.focus({preventScroll:true});
    }
    function node(path=selectedPath){return engine.nodeAt(build,path);}
    function pathKey(path){return path.length?path.join('.'):'main';}
    function chooseSlot(slot,event){
      selectedPath=slot.path;selectedSlot=slot.index;paletteSlot={path:slot.path,index:slot.index};partQuery='';draw();
      if(matchMedia('(max-width:900px)').matches)workspace.querySelector('.workshop-parts')?.scrollIntoView({block:'nearest',behavior:'instant'});
      if(event?.detail===0)workspace.querySelector('.workshop-parts input')?.focus({preventScroll:true});
    }
    function equip(itemId,affixIds=[],parentPath=paletteSlot?.path,index=paletteSlot?.index){
      if(index==null)return;
      if(!Array.isArray(affixIds)||affixIds.some(id=>typeof id!=='string')||!engine.candidates(build,parentPath,index,{includeAffixPresets:true}).some(candidate=>candidate.itemId===itemId&&JSON.stringify(candidate.affixes||[])===JSON.stringify(affixIds))){status.textContent='当前槽位或口径不兼容，请重新选择配件。';return;}
      selectedPath=parentPath;selectedSlot=index;paletteSlot={path:parentPath,index};
      mutate(next=>{const parent=engine.nodeAt(next,parentPath),entry=parent.children.find(child=>child.slotIndex===index),replacement=engine.createNode(itemId);replacement.affixes=[...affixIds];if(entry)entry.node=replacement;else parent.children.push({slotIndex:index,node:replacement});},'slot-'+pathKey([...parentPath,index]));
    }
    function visibleSlots(){return engine.slots(build).filter(slot=>assemblyData.items[engine.nodeAt(build,slot.path).itemId]?.slots[slot.index]?.cardVisible);}
    function partArt(itemId,className){const meta=assemblyData.items[itemId],sprite=assemblyData.sprites[meta?.sprite];return art(sprite?.url||getItem(itemId)?.icon,className);}
    function dropTarget(tile,slot){
      tile.addEventListener('dragover',event=>{if(event.dataTransfer.types.includes('application/x-nsp-workshop')){event.preventDefault();event.dataTransfer.dropEffect='copy';tile.classList.add('drop-target');}});
      tile.addEventListener('dragleave',()=>tile.classList.remove('drop-target'));
      tile.addEventListener('drop',event=>{event.preventDefault();tile.classList.remove('drop-target');try{const dragged=JSON.parse(event.dataTransfer.getData('application/x-nsp-workshop'));if(dragged.rulesIdentity===rulesIdentity)equip(dragged.itemId,dragged.affixes,slot.path,slot.index);}catch{status.textContent='无法识别这次拖动，请点击配件装配。';}});
    }
    function svgNode(tag,attributes={}){const value=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,text] of Object.entries(attributes))value.setAttribute(key,text);return value;}
    function previewGun(){
      const preview=el('div','workshop-gun-preview'),composition=composeWeapon(build,assemblyData),bounds=composition.bounds;
      if(composition.layers.length&&bounds.width>0&&bounds.height>0){
        const svg=svgNode('svg',{viewBox:`${bounds.x-3} ${-bounds.y-bounds.height-3} ${bounds.width+6} ${bounds.height+6}`,role:'img','aria-label':itemName(build.itemId)+' · 当前部件组合'});
        for(const layer of composition.layers){const image=svgNode('image',{href:layer.url,x:layer.x,y:-layer.y-layer.height,width:layer.width,height:layer.height});image.dataset.nativeLayer=layer.spriteId;svg.append(image);}preview.append(svg);
      }else preview.append(art(getItem(build.itemId)?.icon,'workshop-preview-fallback'));
      preview.append(el('span','workshop-preview-label',itemName(build.itemId)));
      if(composition.unknowns.length)preview.append(el('small','workshop-preview-pending','部分部件暂无图像'));
      return preview;
    }
    function cardSize(mask,host){
      const tags=data.enums.AccsTag;
      if(mask===tags.Reciver)return [(assemblyData.items[host?.itemId]?.baseSize?.[0]||0)>=4?3:2,1];
      return [[tags.Barral,tags.Guide,tags.Slide,tags.Guide|tags.Scope,tags.Muzzle].includes(mask)?2:1,1];
    }
    function drawTree(validation){
      const viewport=el('div','workshop-diagram'),stage=el('div','workshop-diagram-stage'),tree=el('div','gunsmith-tree'),cards=[];
      viewport.tabIndex=0;viewport.setAttribute('aria-label','原生方向槽位图，可滚动查看');stage.append(tree);viewport.append(stage);
      const all=visibleSlots(),byParent=new Map();for(const slot of all){const key=pathKey(slot.path);if(!byParent.has(key))byParent.set(key,[]);byParent.get(key).push(slot);}
      function branch(host,path,slot=null,extraBottom=[]){
        const meta=host?assemblyData.items[host.itemId]:null,mask=host?meta.accsMask:slot.accsMask,size=cardSize(mask,host),wrapper=el('div','gunsmith-node');
        wrapper.style.setProperty('--card-w',`${size[0]*96+(size[0]-1)*4}px`);
        const main=!slot,selected=main?selectedSlot===null:selectedSlot===slot.index&&pathKey(selectedPath)===pathKey(slot.path);
        const card=button('',main?()=>{selectedPath=[];selectedSlot=null;draw();}:event=>chooseSlot(slot,event),main?'workshop-core gunsmith-card':'workshop-slot gunsmith-card');
        card.dataset.focus=main?'main':'slot-'+pathKey(path);card.dataset.path=pathKey(path);card.setAttribute('aria-pressed',String(selected));
        card.append(el('span','gunsmith-card-label',main?'机匣 / 主武器':slot.label||'配件槽'));
        if(host)card.append(partArt(host.itemId,'gunsmith-card-art'),el('span','gunsmith-card-name',itemName(host.itemId)));
        else card.append(el('span','gunsmith-card-plus','＋'),el('span','gunsmith-card-name','待装配'));
        if(slot?.required){const required=el('span','gunsmith-required','◆');required.title='必需部件';card.append(required);}
        card.title=main?itemName(build.itemId):(slot.label||'部件')+' · '+(host?itemName(host.itemId):'空槽');
        if(host?.affixes.length){const labels=el('span','gunsmith-card-affixes');for(const id of host.affixes){const label=el('span','workshop-affix-label',affixes[id]?.name||'词条');label.dataset.affixId=id;labels.append(label);}card.append(labels);}
        if(slot){dropTarget(card,slot);if(validation.errors.some(error=>pathKey(error.path)===pathKey(path)))card.classList.add('conflict');}
        wrapper.append(card);cards.push({card,path,parent:slot?.path,direction:slot?assemblyData.items[engine.nodeAt(build,slot.path).itemId].slots[slot.index].direction:null});
        const children=host?(byParent.get(pathKey(path))||[]):[],groups={top:[],bottom:[...extraBottom],left:[],right:[]};
        const bottom=children.filter(child=>assemblyData.items[host.itemId].slots[child.index].direction==='bottom');
        const spread=mask===data.enums.AccsTag.Reciver&&bottom.length>size[0]&&children.some(child=>[data.enums.AccsTag.Barral,data.enums.AccsTag.Muzzle].includes(child.accsMask));
        const hanging=spread?children.filter(child=>child.accsMask===data.enums.AccsTag.Hanging):[];
        const holder=spread?(children.find(child=>child.accsMask===data.enums.AccsTag.Barral)||children.find(child=>child.accsMask===data.enums.AccsTag.Muzzle)):null;
        for(const child of children){if(hanging.includes(child))continue;const direction=assemblyData.items[host.itemId].slots[child.index].direction||'bottom';groups[direction].push({slot:child,prefix:child===holder?hanging.map(slot=>({slot})):[]});}
        if([3,4,5].includes(groups.bottom.length)){const magazine=groups.bottom.findIndex(child=>child.slot.accsMask===data.enums.AccsTag.Magazine);if(magazine>=0){const [value]=groups.bottom.splice(magazine,1);groups.bottom.splice(groups.bottom.length===2?1:3,0,value);}}
        for(const direction of ['top','left','right','bottom'])if(groups[direction].length){const group=el('div','gunsmith-branch gunsmith-'+direction);for(const entry of groups[direction])group.append(branch(entry.slot.installed,[...entry.slot.path,entry.slot.index],entry.slot,entry.prefix));wrapper.append(group);}
        return wrapper;
      }
      tree.append(branch(build,[]));
      const tools=el('div','workshop-diagram-tools'),label=el('span','','槽位图 · 滚动查看'),minus=button('−',()=>resize(.8)),fit=button('全览',()=>{diagramView.zoom=null;measure(true);}),plus=button('＋',()=>resize(1.25));
      minus.setAttribute('aria-label','缩小槽位图');plus.setAttribute('aria-label','放大槽位图');tools.append(label,minus,fit,plus);
      function resize(factor){diagramView.zoom=Math.max(.35,Math.min(2,(diagramView.zoom||1)*factor));measure();}
      function measure(center=false){
        if(disposed||!tree.isConnected)return;
        const initial=diagramView.zoom===null,width=tree.offsetWidth,height=tree.offsetHeight,fit=Math.min(1,(viewport.clientWidth-20)/width,(viewport.clientHeight-20)/height),zoom=diagramView.zoom??(center?fit:Math.max(.75,fit));
        diagramView.zoom=zoom;tree.style.transform=`scale(${zoom})`;stage.style.width=`${Math.max(viewport.clientWidth,width*zoom+20)}px`;stage.style.height=`${Math.max(viewport.clientHeight,height*zoom+20)}px`;
        tree.style.left=`${Math.max(10,(viewport.clientWidth-width*zoom)/2)}px`;tree.style.top=`${Math.max(10,(viewport.clientHeight-height*zoom)/2)}px`;
        tree.querySelector('svg.gunsmith-links')?.remove();const links=svgNode('svg',{width,height,'aria-hidden':'true'});links.classList.add('gunsmith-links');const base=tree.getBoundingClientRect(),ratio=base.width/width,map=new Map(cards.map(value=>[pathKey(value.path),value.card]));
        for(const entry of cards){if(!entry.parent)continue;const parent=map.get(pathKey(entry.parent));if(!parent)continue;const p=parent.getBoundingClientRect(),c=entry.card.getBoundingClientRect();let from,to;
          if(entry.direction==='top'){from=[p.x+p.width/2,p.y];to=[c.x+c.width/2,c.y+c.height];}
          else if(entry.direction==='bottom'){from=[p.x+p.width/2,p.bottom];to=[c.x+c.width/2,c.y];}
          else if(entry.direction==='left'){from=[p.x,p.y+p.height/2];to=[c.right,c.y+c.height/2];}
          else{from=[p.right,p.y+p.height/2];to=[c.x,c.y+c.height/2];}
          from=[(from[0]-base.x)/ratio,(from[1]-base.y)/ratio];to=[(to[0]-base.x)/ratio,(to[1]-base.y)/ratio];const vertical=['top','bottom'].includes(entry.direction),mid=(from[vertical?1:0]+to[vertical?1:0])/2;
          links.append(svgNode('polyline',{points:vertical?`${from} ${from[0]},${mid} ${to[0]},${mid} ${to}`:`${from} ${mid},${from[1]} ${mid},${to[1]} ${to}`,fill:'none'}));
        }tree.prepend(links);
        if(initial&&!center){const main=cards[0].card.getBoundingClientRect(),view=viewport.getBoundingClientRect();diagramView.left=Math.max(0,main.x-view.x+viewport.scrollLeft+(main.width-viewport.clientWidth)/2);diagramView.top=Math.max(0,main.y-view.y+viewport.scrollTop+(main.height-viewport.clientHeight)/2);}
        viewport.scrollLeft=center?0:diagramView.left;viewport.scrollTop=center?0:diagramView.top;
      }
      diagramFrame=requestAnimationFrame(()=>{measure();diagramObserver=new ResizeObserver(()=>measure());diagramObserver.observe(viewport);});
      viewport.onscroll=()=>{diagramView.left=viewport.scrollLeft;diagramView.top=viewport.scrollTop;};
      return {viewport,tools};
    }
    function draw(resetView=false){
      const previousDiagram=workspace.querySelector('.workshop-diagram');if(previousDiagram){diagramView.left=previousDiagram.scrollLeft;diagramView.top=previousDiagram.scrollTop;}
      diagramObserver?.disconnect();diagramObserver=null;cancelAnimationFrame(diagramFrame);if(resetView)diagramView={zoom:null,left:0,top:0};
      inspectorRoot=null;workspace.replaceChildren();overview.replaceChildren();overview.hidden=!build;copyImage.disabled=downloadImage.disabled=compare.disabled=!build;downloadImage.onclick=()=>exportCurrent(false);save.disabled=!build||busy||plans.blocked;
      if(!build){workspace.classList.remove('is-melee');workspace.append(el('div','workshop-empty','选择主武器，开始装配。'));return;}
      const validation=validatePlan(build),result=engine.calculate(build),stats=engine.displayStats(build),isMelee=data.items[build.itemId].kind==='melee';
      try{liveReport=reportModel.capture({name:nameInput.value,build});overview.append(renderWorkshopReport(liveReport,{el,art}));}catch(error){liveReport=null;overview.append(el('p','guide-note',error.message));}
      workspace.classList.toggle('is-melee',isMelee);save.disabled=save.disabled||!validation.valid;save.textContent=validation.complete?'保存方案':'保存未完成草稿';
      const available=visibleSlots();if(!paletteSlot||!available.some(slot=>slot.index===paletteSlot.index&&pathKey(slot.path)===pathKey(paletteSlot.path))){const first=available.find(slot=>slot.required&&!slot.installed)||available[0];paletteSlot=first?{path:first.path,index:first.index}:null;}
      const assembly=el('section','workshop-assembly'),title=el('div','workshop-section-head');title.append(el('h2','','装配台'),el('span','',validation.complete?'装配完整':'待补齐必需件'));assembly.append(title,previewGun());
      if(!isMelee){const diagram=drawTree(validation);assembly.append(diagram.tools,diagram.viewport);}else assembly.append(button('编辑主武器词条',()=>{selectedPath=[];selectedSlot=null;draw();},'workshop-core workshop-melee-edit'));
      if(validation.errors.length||validation.unknowns.length){const issues=el('ul','workshop-issues');for(const issue of [...validation.errors,...validation.unknowns])issues.append(el('li','',issue.message||issue));assembly.append(issues);}
      const panel=el('section','workshop-stats'),statsHeading=el('h2','','武器数据');statsHeading.append(el('small','',`${stats.bars.length} 项${isMelee?'':' · 区域内滚动查看'}`));panel.append(statsHeading);
      if(!isMelee){
        const installed=engine.slots(build).map(slot=>slot.installed).filter(Boolean),ammo=installed.filter(child=>data.items[child.itemId].typeMask===data.enums.EquipType.Bullet);
        panel.append(el('p','workshop-ammo','弹药 · '+(ammo.length?ammo.map(child=>itemName(child.itemId)).join('、'):'未装填')));
        const boxes=installed.filter(child=>data.items[child.itemId].slotData?.accsMask===data.enums.AccsTag.AmmoBox);
        // Native Magazine-only aggregation omits AmmoBox; it does not prove a zero loading limit.
        if(boxes.length){
          for(const box of boxes){const capacity=engine.directCapacity(box);panel.append(el('p','workshop-ammo','弹链箱容量 · '+(capacity.status==='known'?capacity.value:'—')));}
        }else if(result.assemblyCapacity?.status==='known')panel.append(el('p','workshop-ammo',`整枪弹容 · ${result.assemblyCapacity.value}`));
      }
      panel.append(el('p','guide-note','变化量对照：裸机基础参数（非完整配装）'));
      const bars=el('dl','native-stats');bars.tabIndex=0;bars.setAttribute('aria-label',isMelee?'武器属性':'武器属性，可在此区域滚动查看');for(const bar of stats.bars){if(bar.status==='known'&&Number.isFinite(bar.value)){const row=nativeStat({...bar,formatted:bar.value.toFixed(2)}),difference=liveReport?.stats.find(s=>s.key===bar.key)?.difference;if(difference)row.querySelector('dd')?.append(differenceLabel(difference,el,true));bars.append(row);}else{const row=el('div','workshop-stat-unknown');row.append(el('dt','',bar.label||'属性'),el('dd','','—'));bars.append(row);}}panel.append(bars);
      const attacks=window.Wiki.itemEffects(getItem(build.itemId),true);
      if(attacks)panel.append(attacks);
      const conditions=liveReport?additionalEffects(liveReport):result.conditionalEffects;
      if(conditions?.length){const effects=el('details','workshop-conditions');effects.append(el('summary','',`触发与其他效果 · ${conditions.length}`));const list=el('div');for(const effect of conditions)list.append(el('p','',effect.text||effect.description||effect));effects.append(list);panel.append(effects);}
      const inspector=el('aside','workshop-inspector');inspector.append(panel);workspace.append(assembly,inspector);inspectorRoot=isMelee?null:inspector;
      const editNode=selectedSlot===null?node():node()?.children.find(child=>child.slotIndex===selectedSlot)?.node,editPath=selectedSlot===null?selectedPath:[...selectedPath,selectedSlot];
      if(editNode)drawAffixes(editNode,editPath);else{const empty=el('section','workshop-affixes');empty.append(el('h2','','部件设置'),el('p','guide-note','装入部件后，可设置其腐化词条。'));(inspectorRoot||workspace).append(empty);}
      if(!isMelee)drawParts();
    }

    function drawAffixes(host,path){
      const editor=el('section','workshop-affixes'), item=data.items[host.itemId];
      const head=el('div','workshop-section-head');head.append(el('h2','',itemName(host.itemId)),el('span','',item.affixIds.length?'腐化词条':'部件设置'));editor.append(head);
      editor.append(itemProperties(host.itemId));
      if(item.typeMask===data.enums.EquipType.Bullet&&path.length){
        const capacity=engine.directCapacity(engine.nodeAt(build,path.slice(0,-1)));
        const label=el('label','workshop-ammo-count','装填数量'),count=el('input');count.type='number';count.min='1';count.step='1';count.value=host.ammoCount??1;count.setAttribute('aria-label','装填数量');
        if(capacity.status==='known')count.max=String(capacity.value);
        count.onchange=()=>{if(!count.checkValidity()){count.reportValidity();return;}mutate(next=>{engine.nodeAt(next,path).ammoCount=Number(count.value);});};
        label.append(count,el('span','guide-note',capacity.status==='known'?`当前部件上限 ${capacity.value}`:'弹容 —'));editor.append(label);
      }
      const list=el('ol','workshop-affix-list');
      host.affixes.forEach((id,index)=>{
        const affix=affixes[id],row=el('li'),copy=el('div');copy.append(el('strong','',affix?.name||'词条'),el('p','',affix?.description||''));
        const actions=el('div','workshop-affix-actions');
        const up=button('↑',()=>mutate(next=>{const values=engine.nodeAt(next,path).affixes;[values[index-1],values[index]]=[values[index],values[index-1]];},'affix-select-'+pathKey(path)));up.disabled=index===0;up.setAttribute('aria-label','上移第'+(index+1)+'个词条');
        const remove=button('移除',()=>mutate(next=>engine.nodeAt(next,path).affixes.splice(index,1),'affix-select-'+pathKey(path),path));remove.setAttribute('aria-label','移除第'+(index+1)+'个词条');actions.append(up,remove);row.append(copy,actions);list.append(row);
      });editor.append(list);
      if(item.affixIds.length){
      const options=el('select');options.dataset.focus='affix-select-'+pathKey(path);options.setAttribute('aria-label','选择适用腐化词条');options.append(el('option','','选择适用词条'));
      for(const id of item.affixIds){const option=el('option','',affixes[id].name);option.value=id;options.append(option);}options.firstChild.value='';
      const add=button('增加词条',()=>{if(options.value)mutate(next=>engine.nodeAt(next,path).affixes.push(options.value),'affix-select-'+pathKey(path));});
      add.disabled=!item.affixIds.length||host.affixes.length>=item.affixLimit;
      const tools=el('div','workshop-affix-tools');tools.append(options,add,el('span','guide-note',`${host.affixes.length} / ${item.affixLimit} 个词条`));editor.append(tools);
      }
      if(path.length){const parentPath=path.slice(0,-1), index=path.at(-1);editor.append(button('卸下此部件及其下属部件',()=>{selectedPath=[];selectedSlot=null;mutate(next=>{const parent=engine.nodeAt(next,parentPath);parent.children=parent.children.filter(child=>child.slotIndex!==index);},'main');},'workshop-remove'));}
      (inspectorRoot||workspace).append(editor);
    }
    function drawParts(){
      const parts=el('section','workshop-parts');parts.append(el('h2','','配件库'));
      if(!paletteSlot){workspace.append(parts);return;}
      const parent=engine.nodeAt(build,paletteSlot.path),slot=visibleSlots().find(slot=>pathKey(slot.path)===pathKey(paletteSlot.path)&&slot.index===paletteSlot.index);
      if(!parent||!slot){paletteSlot=null;return;}
      const search=el('input');search.type='search';search.placeholder='搜索当前槽位的兼容配件';search.setAttribute('aria-label',search.placeholder);search.value=partQuery;
      const count=el('p','guide-note'),grid=el('div','workshop-part-grid');
      function drawCandidates(){
        grid.replaceChildren();const candidates=engine.candidates(build,paletteSlot.path,paletteSlot.index,{includeAffixPresets:true}).filter(candidate=>itemName(candidate.itemId).toLocaleLowerCase().includes(partQuery.trim().toLocaleLowerCase()));
        count.textContent=`${slot.label||'配件槽'} · ${candidates.length} 件兼容部件`;
        for(const candidate of candidates){const item=getItem(candidate.itemId),preset=candidate.affixes||[],card=button('',()=>equip(candidate.itemId,preset),'workshop-part');card.draggable=true;card.dataset.itemId=candidate.itemId;card.dataset.presetAffixes=JSON.stringify(preset);
          card.append(art(item?.icon,'workshop-part-art'),el('span','',itemName(candidate.itemId)));
          if(preset.length)card.append(el('span','workshop-preset','预设：'+preset.map(id=>affixes[id].name).join('、')+` · ${preset.length}/${data.items[candidate.itemId].affixLimit}`));
          card.title=itemName(candidate.itemId)+(preset.length?' · 预设：'+preset.map(id=>affixes[id].name).join('、'):'')+(slot.installed?' · 更换（含下属部件）':' · 点击或拖动装配');card.setAttribute('aria-label',card.title);
          card.querySelectorAll('img').forEach(image=>{image.draggable=false;});
          card.addEventListener('dragstart',event=>{event.dataTransfer.setData('application/x-nsp-workshop',JSON.stringify({itemId:candidate.itemId,affixes:preset,rulesIdentity:rulesIdentity}));event.dataTransfer.effectAllowed='copy';});const entry=el('div','workshop-part-entry');entry.append(card,itemProperties(candidate.itemId));grid.append(entry);
        }if(!candidates.length)grid.append(el('p','guide-note','没有兼容配件，可检查主件口径及词条。'));
      }
      const tabs=el('div','workshop-slot-tabs');for(const target of visibleSlots()){const tab=button(target.label||'部件',event=>chooseSlot(target,event));tab.setAttribute('aria-pressed',String(pathKey(target.path)===pathKey(paletteSlot.path)&&target.index===paletteSlot.index));tab.title=(target.path.length?itemName(engine.nodeAt(build,target.path).itemId)+' · ':'')+(target.label||'部件');tabs.append(tab);}
      search.oninput=()=>{partQuery=search.value;drawCandidates();};const tools=el('div','workshop-parts-tools');tools.append(search,count);parts.append(tabs,tools,grid);workspace.append(parts);drawCandidates();
    }
    async function saveCurrent(){
      if(!build||busy||plans.blocked)return;
      const validation=validatePlan(build);if(!validation.valid){status.textContent='请先处理装配冲突，再保存方案。';return;}
      const name=nameInput.value.trim()||itemName(build.itemId);
      const record={id:crypto.randomUUID(),name,rulesIdentity:rulesIdentity,savedAt:Date.now(),build:structuredClone(build)};
      busy=true;save.disabled=true;
      try{plans=await savePlans(storage,plans,[...plans.records,record]);if(active()){status.textContent=plans.message||'已保存到当前浏览器。';drawRecords();}}
      catch{if(active())status.textContent='本次未能保存，原记录已保留。';}
      finally{busy=false;if(active()){drawRecords();draw();}}
    }
    async function deletePlan(record){
      if(busy||plans.blocked||!confirm(`删除本地方案“${record.name}”？删除后无法恢复。`))return;
      busy=true;save.disabled=true;drawRecords();
      try{plans=await savePlans(storage,plans,plans.records.filter(value=>value.id!==record.id));if(active())status.textContent=plans.message||'已删除本地方案；当前试装保留。';}
      catch{if(active())status.textContent='本次未能删除，原记录已保留。';}
      finally{busy=false;if(active()){drawRecords();draw();records.querySelector('summary').focus();}}
    }
    function drawRecords(){
      recordList.replaceChildren();records.querySelector('summary').textContent=`本地方案 · ${plans.records.length}`;
      if(!plans.records.length)recordList.append(el('p','guide-note','保存的方案保留在当前浏览器。'));
      for(const record of [...plans.records].reverse()){
        const row=el('div','workshop-record'),name=el('strong');name.textContent=record.name;
        const load=button('载入',()=>{
          const validation=validatePlan(record.build);
          if(!validation.valid){status.textContent='此记录需要核对：'+[...validation.errors,...validation.unknowns].map(error=>error.message||error).join('；')+'。原记录已保留。';return;}
          if(build)drafts.set(build.itemId,build);build=structuredClone(record.build);currentId=build.itemId;drafts.set(currentId,build);weaponSelect.value=currentId;nameInput.value=record.name;selectedPath=[];selectedSlot=null;paletteSlot=null;partQuery='';records.open=false;
          status.textContent=record.rulesIdentity===rulesIdentity?'已载入，并按当前规则重新检查。':'原记录来自其他规则版本，已按当前规则重新检查；原记录保留。';draw();
        });
        const remove=button('删除',()=>deletePlan(record));remove.setAttribute('aria-label','删除本地方案“'+record.name+'”');remove.disabled=busy||plans.blocked;
        const compareRecord=button('加入对比',()=>addComparison({schemaVersion:1,name:record.name,rulesIdentity:record.rulesIdentity,basis:data.meta.basis,build:record.build}));
        row.append(name,el('small','',new Date(record.savedAt).toLocaleDateString('zh-CN')),load,compareRecord,remove);recordList.append(row);
      }
    }
  }
}
