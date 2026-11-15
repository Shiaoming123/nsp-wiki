(() => {
  'use strict';
  const types = {Mail:'邮件',Chat:'消息',AutoDone:'自动事件',Collect:'提交物品',Kill:'消灭',KillUnique:'消灭指定目标',Reach:'抵达',Explore:'调查',CraftItem:'制作物品',CraftFurniture:'制作设施',PlaceItem:'放置物品',UpgradeResearchTable:'升级研究台',UnlockBlueprint:'解锁配方',UnlockFurniture:'解锁设施',FinishResearch:'完成研究',FixPortalToilet:'修复传送马桶',Money:'信用券',Item:'物品',Document:'后续任务',AddShopItem:'商店上新',ItemBlueprint:'物品配方',FurnitureBlueprint:'设施配方',ExitPoint:'撤离点',UnlockInsurance:'解锁保险',Talk:'对话',AddShopBundle:'商店商品组',Coordinate:'坐标',Interact:'交互',OccupyBastion:'占领据点'};
  const statuses={
    empty:{label:'空定义',description:'当前没有对白步骤、目标、补给或奖励；保留条目供查阅，不作为正常推进任务。'},
    unconfirmed:{label:'入口未明',description:'在本次核对的任务、地图与资料中未找到正常接取入口；不作为必做任务推荐，仍不能排除运行时入口。'},
    'npc-unconfirmed':{label:'NPC入口待核实',description:'已配置对话派发规则，但对应NPC在当前正常进程中的出现条件尚未核实。'},
    dialogue:{label:'默认闲聊',description:'这是NPC的默认对白配置，不是需要按主线领取和完成的普通任务。'},
    system:{label:'系统通知',description:'由对应系统条件触发，不通过普通任务前置线接取。'}
  };
  function status(mission){return statuses[mission.review?.status]||null;}
  function versionNote(data){return `任务规则与文本静态核对至 EA Build ${data.guide?.buildId||data.meta.buildId}；当前${data.missions.length}项任务。地图定位沿用既有资料，未逐任务实机通关。`;}
  function entryLabel(mission,edges){
    const grants=new Set(edges.filter(e=>e.to===mission.id&&e.kind==='reward-add-mission').map(e=>e.from));
    const group=mission.activationGroups?.[0];
    if(grants.size){const reward=grants.size>1?'任一奖励':'奖励';return group?reward+'或'+(group.gate==='ANY'?'任一前置':group.members.length>1?'全部前置':'自动前置'):reward+'可接取';}
    return group?group.gate==='ANY'?'任一前置':group.members.length>1?'需全部前置':'自动前置':'';
  }
  function parts(text,source){
    if(!Array.isArray(source)||!source.length||source.some(p=>typeof p?.text!=='string'||p.tone&&!['orange','purple'].includes(p.tone)||p.italic!==undefined&&typeof p.italic!=='boolean')||source.map(p=>p.text).join('')!==text)return [{text}];
    return source.map(p=>({text:p.text,tone:p.tone||null,italic:p.italic===true}));
  }
  function appendRich(parent,text,source){
    const doc=parent.ownerDocument;
    for(const part of parts(text,source)){
      let node=doc.createTextNode(part.text);
      if(part.italic){const em=doc.createElement('em');em.append(node);node=em;}
      if(part.tone){const strong=doc.createElement('strong');strong.className='quest-native-keyword quest-native-'+part.tone;strong.append(node);node=strong;}
      parent.append(node);
    }
    return parent;
  }
  function render(data,doc=document){
    const byId=new Map(data.missions.map(m=>[m.id,m])),guide=data.guide;
    const el=(tag,className,text)=>{const node=doc.createElement(tag);if(className)node.className=className;if(text)node.textContent=text;return node;};
    const taskLink=id=>{const a=el('a','inline-link',byId.get(id).name);a.href='#quest/'+encodeURIComponent(id);return a;};
    const root=el('section','quest-walkthrough');root.append(el('p','kicker','任务攻略 · 推进与排查'),el('h2','','正常推进路线'),el('p','',guide.intro),el('p','guide-note',versionNote(data)));
    const key=el('p','quest-native-legend');appendRich(key,'橙色为游戏原文重点词；紫色保留原生特殊提示。',[{text:'橙色',tone:'orange'},{text:'为游戏原文重点词；'},{text:'紫色',tone:'purple'},{text:'保留原生特殊提示。'}]);root.append(key);
    for(const [index,stage] of guide.stages.entries()){
      const section=el('details','quest-route-stage');section.open=index===0;
      section.append(el('summary','',stage.title),el('p','quest-route-summary',stage.summary));
      for(const text of stage.steps)section.append(el('p','',text));
      const links=el('div','related-links');links.setAttribute('aria-label',stage.title+'相关任务');for(const id of stage.taskIds)links.append(taskLink(id));section.append(links);root.append(section);
    }
    const tips=el('details','quest-guide-tips');tips.append(el('summary','','提交、领奖与特殊触发怎么排查'));const list=el('ol','guide-lines');for(const text of guide.tips)list.append(el('li','',text));tips.append(list);root.append(tips);
    if(guide.appendix.unconfirmedIds.length||guide.appendix.emptyIds.length)root.append(el('h3','','暂不列为正常推进的条目'),el('p','guide-note','以下根入口未确认的任务及仅由它们开启的支线，不作为必做路线。'));
    for(const [field,label,copy] of [['unconfirmedIds','入口未明','任务有配置内容，但当前静态范围未找到正常接取入口。'],['emptyIds','空定义','当前没有对白步骤、目标、补给或奖励，不建议反复尝试触发。']]){
      if(!guide.appendix[field].length)continue;
      const section=el('details','quest-entry-appendix');section.dataset.entryGroup=field;
      section.append(el('summary','',`${label} · ${guide.appendix[field].length}项`),el('p','',copy));
      const rows=el('ul','quest-appendix-list');for(const id of guide.appendix[field]){const row=el('li');row.append(taskLink(id));rows.append(row);}section.append(rows);root.append(section);
    }
    return root;
  }

  // Shared read-only content. Page state, routing and completion writes stay with callers.
  function appendDetails(body,m,data,options={}){
    const doc=body.ownerDocument;
    const el=(tag,cls,text)=>{const n=doc.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
    const link=options.link||((text,route)=>{const n=el('a','inline-link',text);n.href=route;return n;});
    const getItem=options.getItem||((id)=>window.Wiki.getItem(id));
    const itemLink=options.itemLink||((id)=>{const i=getItem(id);return i?link(i.name||i.subcategory||'物品','#item/'+encodeURIComponent(id)):el('span','muted','物品');});
    const completed=options.completed||new Set(),byId=new Map(data.missions.map(x=>[x.id,x]));
    const guide={status,appendRich},heading=(parent,text)=>parent.append(el('h3','detail-section-title',text));
    const variantLabel=options.variantLabel||(()=>''),enemies=options.enemies;
    if(options.context){
      const semantic=options.classifyMission(m,options.itemIds||new Set()),entry=entryLabel(m,data.edges);
      if(entry)body.append(el('p','quest-entry-summary',entry));
      for(const c of semantic.coordinates){const row=el('p','quest-semantic-note');row.append(el('span','',c.phase==='finReward'?'完成后获得坐标：':'事前获得坐标：'),link(c.name,'#maps/'+encodeURIComponent(c.id)),el('span','',c.count===null?' · 数量待核实':' × '+c.count));body.append(row);}
      if(semantic.coordinates.length)body.append(el('p','guide-note','获得地图坐标不代表地图全部探索内容已解锁。'));
      for(const r of semantic.recycles){const row=el('p','quest-semantic-note');row.append(el('span','','回收指定物品以接取：'),itemLink(r.itemId),el('span','',r.count===null?' · 无额外累计数量门槛':' × '+r.count));body.append(row);}
      if(semantic.pending.length)body.append(el('p','guide-note','部分特殊奖励或接取入口的关联资料待核实。'));
    }
  function questRow(body,r){const row=el('div','guide-row');row.append(el('span','row-label',types[r.type]||r.type));if(['AddShopItem','AddShopBundle'].includes(r.type)){const products=el('div','related-links');(r.products||(r.candidates||[]).map(c=>c.id)).forEach(id=>products.append(itemLink(id)));row.append(products.childElementCount?products:el('span','','商品资料待核实'));}else if(r.type==='Document'){const m=data.missions.find(m=>m.id===r.data);row.append(m?link(m.name,`#quest/${encodeURIComponent(r.data)}`):el('span','',r.nameZh||'关联资料待核实'));}else if(getItem(r.data))row.append(itemLink(r.data));else row.append(el('span','',r.nameZh|| (r.type==='Money'?'信用券':r.data||'')));if(!['Document','AddShopItem','AddShopBundle','UnlockInsurance','Coordinate'].includes(r.type))row.append(el('strong','',`× ${r.count}`));body.append(row);if(r.actorIds?.length){const wrap=el('div','related-links');r.actorIds.forEach(id=>wrap.append(link('查看目标 · '+(r.actorNames?.[id]||enemies?.enemies.find(e=>e.id===id)?.name||r.nameZh||'敌怪资料待核实')+(variantLabel(id)?' · '+variantLabel(id):''),`#enemy/${encodeURIComponent(id)}`)));body.append(wrap);}if(['AddShopItem','AddShopBundle'].includes(r.type)){body.append(el('p','guide-note','解锁商品的上架范围，并非直接获得；具体在售以商店刷新为准。'));}if(r.mark&&/[一-鿿]/.test(r.mark))body.append(el('p','guide-note',r.mark));if(r.referenceStatus?.startsWith('UNKNOWN'))body.append(el('p','guide-note','关联配置待核实。'));}
    heading(body,'接取与前置');const incoming=data.edges.filter(e=>e.to===m.id),groups=m.activationGroups||[],direct=incoming.filter(e=>e.kind==='reward-add-mission');
    function prerequisiteRow(target,parent,suffix){const row=el('p');row.append(target?link(target.name,`#quest/${encodeURIComponent(target.id)}`):el('span','muted','前置任务待核实'),el('span','muted',` · ${suffix}`));if(target){const mark=el('span','muted',completed.has(target.id)?' · 已手动标记完成':'');mark.dataset.progressId=target.id;row.append(mark);}parent.append(row);}
    groups.forEach(group=>{const section=el('section','quest-prereq-group');section.dataset.gate=group.gate;section.append(el('p','',group.gate==='ANY'?'自动接取：以下任一前置流程结束后可解锁。':'自动接取：以下全部前置流程结束后可解锁。'));group.members.forEach(id=>prerequisiteRow(byId.get(id),section,'前置流程'));(group.pending||[]).forEach(()=>section.append(el('p','guide-note','另有前置依赖待核实。')));body.append(section);});
    if(direct.length){const section=el('section','quest-direct-entry');section.append(el('p','',groups.length?'也可由以下任一任务的奖励直接发放，无需同时满足上面的自动前置：':'由以下任一任务的奖励直接发放：'));direct.forEach(edge=>prerequisiteRow(byId.get(edge.from),section,edge.rewardPhase==='preReward'?'事前补给发放':'完成奖励发放'));body.append(section);}
    m.triggers.forEach(t=>{const p=el('p');if(t.type==='recycle'){p.append(el('span','','回收 '),itemLink(t.itemId),el('span','',' 时触发。'));}else{p.append(el('span','',t.name||'接取位置待核实'));(t.maps||[]).forEach(id=>p.append(el('span','',' · '),t.mapNames?.[id]?link(t.mapNames[id],'#maps/'+encodeURIComponent(id)):el('span','muted','地图入口待核实')));}body.append(p);});(m.pendingDependencies||[]).forEach(d=>body.append(el('p','guide-note',`待核实依赖：${/[一-鿿]/.test(d.name||'')?d.name:'关联任务'}`)));if(!incoming.length&&!m.triggers.length&&!m.review?.notes?.length&&!guide.status(m))body.append(el('p','guide-note','接取方式待核实。'));
    heading(body,'任务目标');if(!m.requirements.length)body.append(el('p','',m.review?.status==='empty'?'空定义；当前无可推进的对白步骤或目标。':m.review?.status==='dialogue'?'默认闲聊，不列为普通任务目标。':'无数值目标，按消息、邮件或对白的实际步骤继续。'));m.requirements.forEach(r=>questRow(body,r));if(m.preReward.length){heading(body,'事前补给');m.preReward.forEach(r=>questRow(body,r));}heading(body,'完成奖励');m.reward.forEach(r=>questRow(body,r));if(m.dynamicReward)body.append(el('p','guide-note','保险返还由当前实例决定，没有固定物品清单。'));if(!m.reward.length&&!m.dynamicReward)body.append(el('p','','无固定物品奖励。'));const next=[...new Map(data.edges.filter(e=>e.from===m.id).map(e=>[e.to,e])).values()];if(next.length){heading(body,'后续任务');const wrap=el('div','related-links');next.forEach(e=>{const n=data.missions.find(m=>m.id===e.to);wrap.append(link(n.name,`#quest/${encodeURIComponent(n.id)}`));});body.append(wrap);}if(m.texts.length){const fold=el('details','story-text');fold.append(el('summary','','任务原文'));m.texts.forEach((t,index)=>fold.append(guide.appendRich(el('p'),t,m.emphasis?.texts?.[index])));body.append(fold);}
    return body;
  }
  const api={types,appendDetails,status,versionNote,entryLabel,parts,appendRich,render};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')window.QuestGuide=api;
})();
