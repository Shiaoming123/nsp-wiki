(() => {
  'use strict';
  const progressKey='nsp-guide-quests-ea-v1', stockKey='nsp-quest-supplies-ea-v1', maxStock=9999999;
  function summarize(missions, completed) {
    const rows=new Map(), actions=[], unknown=[];
    for(const mission of missions) for(const r of mission.requirements) {
      if(r.type!=='Collect') {if(['CraftItem','PlaceItem','UpgradeResearchTable'].includes(r.type))actions.push({mission,requirement:r,done:completed.has(mission.id)});continue;}
      if(typeof r.data!=='string'||!r.data||!Number.isSafeInteger(r.count)||r.count<=0) {unknown.push(mission);continue;}
      const row=rows.get(r.data)||{id:r.data,name:r.nameZh||'物品资料待核实',total:0,remaining:0,tasks:[]};
      if(!Number.isSafeInteger(row.total+r.count)) {unknown.push(mission);continue;}
      const done=completed.has(mission.id);row.total+=r.count;if(!done)row.remaining+=r.count;
      row.tasks.push({id:mission.id,name:mission.name,count:r.count,done});rows.set(r.data,row);
    }
    return {rows:[...rows.values()],actions,unknown};
  }
  function read(storage,key) {
    try {
      const raw=(storage||globalThis.localStorage).getItem(key), data=raw===null?(key===progressKey?[]:{schemaVersion:1,counts:{}}):JSON.parse(raw);
      if(key===progressKey) {if(!Array.isArray(data)||!data.every(x=>typeof x==='string'))throw Error();return {raw,completed:new Set(data)};}
      if(!data||data.schemaVersion!==1||!data.counts||typeof data.counts!=='object'||Array.isArray(data.counts)||Object.values(data.counts).some(n=>!Number.isSafeInteger(n)||n<0||n>maxStock))throw Error();
      return {raw,counts:data.counts};
    } catch {return {blocked:true,message:'原记录暂不可读取，已保留；本次修改不会覆盖它。'};}
  }
  async function update(storage,key,change,locks=globalThis.navigator?.locks,expected) {
    if(!locks)return {saved:false,message:'浏览器暂不支持安全保存，本次修改仅在此页有效。'};
    try {return await locks.request(key,()=>{
      const state=read(storage,key);if(state.blocked)return {...state,saved:false};
      if(expected&&(state.completed.size!==expected.size||[...state.completed].some(id=>!expected.has(id))))return {saved:false,stale:true,completed:state.completed};
      const data=change(state);(storage||globalThis.localStorage).setItem(key,JSON.stringify(data));return {saved:true,...(key===progressKey?{completed:new Set(data)}:{counts:data.counts})};
    });} catch {return {saved:false,message:'浏览器未能保存，原记录已保留；本次修改仅在此页有效。'};}
  }
  function setComplete(storage,id,done,locks) {return update(storage,progressKey,state=>{done?state.completed.add(id):state.completed.delete(id);return [...state.completed];},locks);}
  function setCompleteMany(storage,ids,locks,expected) {
    return update(storage,progressKey,state=>{ids.forEach(id=>state.completed.add(id));return [...state.completed];},locks,expected);
  }
  function setStock(storage,id,count,locks) {
    if(!Number.isSafeInteger(count)||count<0||count>maxStock)return Promise.resolve({saved:false,message:`请输入 0 至 ${maxStock} 的整数。`});
    return update(storage,stockKey,state=>({schemaVersion:1,counts:{...state.counts,[id]:count}}),locks);
  }
  function createDrawer({missions,getCompleted,getItem,el,art,onQuest}) {
    const dialog=el('dialog','quest-supplies');dialog.id='quest-supplies';dialog.setAttribute('aria-labelledby','quest-supplies-title');
    const head=el('header','supplies-head'),title=el('h2','','物品清单');title.id='quest-supplies-title';const close=el('button','secondary-button','收起');close.setAttribute('aria-label','关闭物品清单');head.append(title,close);
    const intro=el('p','supplies-help','按 Wiki 收集目标累计；已完成任务不计入未完成数量。已备为手动库存，实际交付后请自行调整。');
    const controls=el('div','supplies-controls'),search=el('input'),filter=el('select');search.type='search';search.placeholder='搜索物品或任务';search.setAttribute('aria-label','搜索清单物品或任务');filter.setAttribute('aria-label','物品需求范围');
    for(const [value,text] of [['remaining','未完成目标'],['missing','只看还缺'],['all','全部目标']]){const o=el('option','',text);o.value=value;filter.append(o);}controls.append(search,filter);
    const summary=el('p','supplies-summary'),status=el('p','supplies-status');status.setAttribute('role','status');const list=el('div','supplies-list');
    const help=el('details','supplies-math');help.append(el('summary','','数量怎么算？'),el('p','','全部目标：当前 Wiki 所有任务的收集数量。未完成：去掉已标记完成的任务。还缺：未完成 − 已备，最低为 0。前置关系、任务搜索和分类不会改变统计范围；这里不累计制作配方原料。'));
    dialog.append(head,intro,controls,summary,status,list,help);document.body.append(dialog);
    let stock=read(null,stockKey),counts=stock.counts||{},returnFocus=null,resumeItem=null,resumeScroll=0,disposed=false,pendingRefresh=false;
    function refresh(){
      if(disposed)return;
      const focused=list.contains(document.activeElement)?document.activeElement:null,focusedId=focused?.closest('[data-item]')?.dataset.item;
      if(focused?.tagName==='INPUT'&&focused.value!==String(counts[focusedId]||0)){pendingRefresh=true;return;}
      pendingRefresh=false;const expanded=new Set([...list.querySelectorAll('[data-item] details[open]')].map(n=>n.closest('[data-item]').dataset.item)),scroll=list.scrollTop;
      const data=summarize(missions,getCompleted()),query=search.value.trim().toLowerCase();
      const shown=data.rows.map(r=>({...r,prepared:counts[r.id]||0,missing:Math.max(0,r.remaining-(counts[r.id]||0))})).filter(r=>(filter.value==='all'||(filter.value==='missing'?r.missing>0:r.remaining>0))&&(!query||`${r.name} ${r.tasks.map(t=>t.name).join(' ')}`.toLowerCase().includes(query))).sort((a,b)=>(b.missing>0)-(a.missing>0)||a.name.localeCompare(b.name,'zh-CN'));
      const total=data.rows.reduce((n,r)=>n+r.total,0),remaining=data.rows.reduce((n,r)=>n+r.remaining,0),missing=data.rows.reduce((n,r)=>n+Math.max(0,r.remaining-(counts[r.id]||0)),0);
      summary.textContent=`${shown.length} / ${data.rows.length} 种物品 · 全部 ${total} · 未完成 ${remaining} · 还缺 ${missing}`;
      if(stock.blocked)status.textContent=stock.message;
      list.replaceChildren();if(!shown.length)list.append(el('p','empty',query?'没有匹配物品。':'此范围已无待收集物品。'));
      for(const row of shown){
        const card=el('section','supplies-item');card.dataset.item=row.id;const top=el('div','supplies-item-top'),item=getItem(row.id);
        const a=el('a','inline-link',item?.name||row.name||'物品资料待核实');if(item){a.href='#item/'+encodeURIComponent(row.id);if(item.icon)a.prepend(art(item.icon,'tiny-art'));a.onclick=()=>{resumeItem=row.id;resumeScroll=list.scrollTop;dialog.close();};}top.append(a,el('strong',row.missing?'supplies-shortage':'supplies-ready',row.remaining===0?'目标已完成':row.missing?`还缺 ${row.missing}`:'已备齐'));card.append(top);
        const numbers=el('div','supplies-numbers');for(const [label,value] of [['全部目标',row.total],['未完成',row.remaining]]){const n=el('span','',label);n.append(el('b','',String(value)));numbers.append(n);}
        const label=el('label','','已备'),input=el('input');input.type='number';input.min='0';input.max=String(maxStock);input.step='1';input.inputMode='numeric';input.value=String(row.prepared);input.setAttribute('aria-label',`${item?.name||row.name}已备数量`);label.append(input);numbers.append(label);card.append(numbers);
        input.onchange=async()=>{
          const value=input.value.trim(),count=value===''?NaN:Number(value);if(!Number.isSafeInteger(count)||count<0||count>maxStock){input.setCustomValidity(`请输入 0 至 ${maxStock} 的整数。`);input.reportValidity();return;}input.setCustomValidity('');
          input.readOnly=true;const result=await setStock(null,row.id,count);if(disposed)return;input.readOnly=false;if(result.saved){counts=result.counts;stock={counts};status.textContent='已保存准备数量。';}else{counts={...counts,[row.id]:count};status.textContent=result.message;}
          refresh();
        };input.oninput=()=>input.setCustomValidity('');
        const tasks=el('details','supplies-tasks');tasks.open=expanded.has(row.id);tasks.append(el('summary','',`${row.tasks.length} 项任务 · 已完成 ${row.tasks.filter(t=>t.done).length}`));
        for(const task of row.tasks){const line=el('div','supplies-task'),link=el('a','inline-link',task.name);link.href='#quest/'+encodeURIComponent(task.id);link.onclick=()=>{resumeItem=null;dialog.close();onQuest();};line.append(link,el('span','',`${task.done?'✓ 已完成 · ':''}× ${task.count}`));tasks.append(line);}card.append(tasks);list.append(card);
      }
      if(data.actions.length){const actions=el('details','supplies-actions');actions.append(el('summary','',`制作、放置与升级目标 · ${data.actions.filter(a=>!a.done).length} 项未完成`));for(const a of data.actions){const row=el('p'),link=el('a','inline-link',a.mission.name);link.href='#quest/'+encodeURIComponent(a.mission.id);link.onclick=()=>{resumeItem=null;dialog.close();onQuest();};row.append(link,el('span','',` · ${a.requirement.nameZh} × ${a.requirement.count}${a.done?' · ✓ 已完成':''}`));actions.append(row);}actions.append(el('p','guide-note','这些动作独立列出，不与收集数量相加。'));list.append(actions);}
      if(data.unknown.length)list.append(el('p','guide-note',`${data.unknown.length} 条收集目标数量待核实，未纳入合计。`));
      list.scrollTop=scroll;
      if(focusedId){const card=list.querySelector(`[data-item="${CSS.escape(focusedId)}"]`);(card?.querySelector(focused.tagName==='INPUT'?'input':focused.tagName==='SUMMARY'?'summary':'a')||search).focus({preventScroll:true});}
    }
    function open(focusItem){if(disposed||document.querySelector('dialog[open]'))return;returnFocus=document.getElementById('quest-supplies-toggle');refresh();dialog.showModal();if(focusItem){list.scrollTop=resumeScroll;list.querySelector(`[data-item="${CSS.escape(focusItem)}"] a`)?.focus({preventScroll:true});}else search.focus();}
    function dismiss(){resumeItem=null;dialog.close();returnFocus?.focus({preventScroll:true});}
    close.onclick=dismiss;dialog.addEventListener('cancel',event=>{event.preventDefault();dismiss();});dialog.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.isComposing){event.preventDefault();event.stopPropagation();dismiss();}});
    search.oninput=refresh;filter.onchange=refresh;
    list.addEventListener('focusout',()=>queueMicrotask(()=>{if(pendingRefresh&&!list.contains(document.activeElement))refresh();}));
    const storageEvent=event=>{if(event.key===stockKey||event.key===null){stock=read(null,stockKey);if(!stock.blocked)counts=stock.counts;refresh();}};window.addEventListener('storage',storageEvent);
    return {open,refresh,resume(){if(!resumeItem)return false;const id=resumeItem;resumeItem=null;open(id);return true;},dispose(){disposed=true;resumeItem=null;dialog.close();dialog.remove();window.removeEventListener('storage',storageEvent);}};
  }
  const api={progressKey,stockKey,maxStock,summarize,read,setComplete,setCompleteMany,setStock,createDrawer};
  if(typeof window!=='undefined')window.QuestSupplies=api;
  if(typeof module!=='undefined')module.exports=api;
})();
