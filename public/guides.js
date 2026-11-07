(() => {
  'use strict';
  const $ = id => document.getElementById(id), el = (...args) => window.Wiki.el(...args);
  const cache = {}, promises = {};
  let mapMount = null, workshopMount = null, suppliesDrawer=null,feedbackMount=null;
  let enemyVariants=new Map();
  let detailOrigin=null;
  document.addEventListener('click',event=>{const a=event.target.closest('a[href],button[data-item]');if(!a||a.closest('#detail')||event.defaultPrevented||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;if(!a.dataset.item){const url=new URL(a.href,location.href);if(url.origin!==location.origin||url.pathname!==location.pathname||!/^#(item|enemy|affix|npc|recipe)\//.test(url.hash))return;}detailOrigin={hash:location.hash||'#home',page:document.body.dataset.wikiPage||page,title:document.title,y:scrollY,node:a};},true);
  function restoreDetail(){if(!detailOrigin)return false;if(/^#item\//.test(location.hash)&&/^#(npc|recipe)\//.test(Guide.baseRoute))return false;if(!/^#(item|enemy|affix|npc|recipe)\//.test(location.hash)&&location.hash!==detailOrigin.hash)return false;const origin=detailOrigin;++serial;history.replaceState(null,'',location.pathname+location.search+origin.hash);page=origin.page;Guide.baseRoute=origin.hash;document.title=origin.title;$('item-page').hidden=page!=='items';$('guide-root').hidden=page==='items';window.WikiNavigation.sync(page);origin.node?.isConnected&&origin.node.focus({preventScroll:true});window.scrollTo({top:origin.y,behavior:'instant'});if(page==='quests'){if($('detail').open)$('detail').close();suppliesDrawer?.resume();}return true;}
  let page = 'items', serial = 0, questQuery = '', questCategory = 'all', selectedQuest = null, zoom = .7;
  let guideDialog=null;
  let questDetailsOpen=false;let questItemOrigin=null;let selectedEnemy=null;let enemyQuery = '', enemyCategory = 'all', enemyRegion = 'all', enemyMap = 'all', mirrorQuery = '', questView = matchMedia('(max-width:760px)').matches ? 'list' : 'map';
  const progressKey='nsp-guide-quests-ea-v1';
  let completed=window.QuestSupplies.read(null,progressKey).completed||new Set();
  const titles = {traffic:'流量看板',loot:'容器与搜刮',home:'攻略首页',mechanics:'机制手册',updates:'更新档案',npcs:'NPC 图鉴',recipes:'配方手册',items:'物品图鉴', quests:'任务攻略', enemies:'敌怪图鉴', mirror:'迷失镜柜', maps:'地图全览', tiers:'夯拉榜',corruption:'腐化词条',feedback:'Wiki 反馈',workshop:'武器工坊'};
  const types = {Mail:'邮件',Chat:'消息',AutoDone:'自动事件',Collect:'提交物品',Kill:'消灭',KillUnique:'消灭指定目标',Reach:'抵达',Explore:'调查',CraftItem:'制作物品',CraftFurniture:'制作设施',PlaceItem:'放置物品',UpgradeResearchTable:'升级研究台',UnlockBlueprint:'解锁配方',UnlockFurniture:'解锁设施',FinishResearch:'完成研究',FixPortalToilet:'修复传送马桶',Money:'信用券',Item:'物品',Document:'后续任务',AddShopItem:'商店上新',ItemBlueprint:'物品配方',FurnitureBlueprint:'设施配方',ExitPoint:'撤离点',UnlockInsurance:'解锁保险',Talk:'对话',AddShopBundle:'商店商品组',Coordinate:'坐标',Interact:'交互',OccupyBastion:'占领据点'};
  async function load(name) { if(cache[name]) return cache[name]; return promises[name] ||= fetch(`data/${name}.json`,{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('资料暂时无法读取');return r.json();}).then(d=>(cache[name]=d)).catch(e=>{delete promises[name];throw e;}); }
  function link(text, route) { const a=el('a','inline-link',text); a.href=route; return a; }
  function itemLink(id, fallback) { const i=window.Wiki.getItem(id); if(!i)return el('span','muted',fallback&&fallback!==id?fallback:'物品');const a=link(i.name || i.subcategory || fallback || '物品',`#item/${encodeURIComponent(id)}`); if(i.icon) a.prepend(window.Wiki.art(i.icon,'tiny-art')); return a; }
  function heading(body,text) { body.append(el('h3','detail-section-title',text)); }
  function lines(body,values) { if(!values?.length)return; const ul=el('ul','guide-lines'); values.forEach(t=>ul.append(el('li','',typeof t==='string'?t:t.text || t.label || ''))); body.append(ul); }
  const attackConditionTemplates=new Map([
    ['普通命中在伤害结算时有1～1.1倍随机上浮；本处基础区间尚未乘入，暴击另算',''],
    ['本攻击直接构造快照，未开启普通伤害上浮事件',''],
    ['本条按单枚弹丸或单次判定计；同次攻击的其他弹丸可能落空，不能把弹丸总数当作必定命中数','其他弹丸需分别判定命中。'],
    ['目标触发陷阱并被范围判定命中时；静态快照的五类伤害为零，常规最低伤害分支为1，不能按表面写值20解读','触发陷阱且范围判定命中时生效。'],
    ['被骸激活后才攻击；激光持续5秒，同一目标伤害间隔至少0.2秒，基础间隔10秒；本条按一次激光伤害判定计','被骸激活后才攻击；激光持续5秒，同一目标伤害间隔至少0.2秒，基础间隔10秒。']
  ]);
  function presentEnemyAttack(attack){
    const normal=/^普通命中约\d+(?:\.\d+)?(?:～\d+(?:\.\d+)?)?（防护前，(?:一次独立命中|单枚弹丸命中)）$/;
    const effects=(attack.effects||[]).map(text=>text.replace(/，配置时长(\d+(?:\.\d+)?)秒(?:；实际受状态规则与命中事件影响)?$/,'，持续$1秒'));
    const conditions=(attack.conditions||[]).map(text=>attackConditionTemplates.has(text)?attackConditionTemplates.get(text):text.replace(/^此步骤生成(\d+)次后续攻击判定；单次命中的数值不能直接视为全部命中总扣血$/,'一次动作包含$1次攻击判定，各次分别判定命中。')).filter(Boolean);
    const template=attack.name+'以'+attack.style+'命中目标；连击中的其他段落分别计算。';
    const parts=/^基础.+；单次命中基础合计/.test(attack.damageSummary||'')?attack.damageSummary.split('；')[0].slice(2).split('、'):[];
    const channels=parts.map(part=>part.match(/^(冲击|穿刺|切割|瓦解|真实)伤害(\d+(?:\.\d+)?(?:～\d+(?:\.\d+)?)?)$/));
    const composition=channels.length&&channels.every(Boolean)?channels.map(match=>match[1]+' '+match[2]):[];
    return {name:attack.name,style:attack.style,damage:normal.test(attack.normalDamageSummary||'')?attack.normalDamageSummary:'',composition,description:attack.description===template?attack.style:attack.description,effects,conditions};
  }
  function enemyAttacks(body,enemy){
    if(!enemy.attacks?.length)return;heading(body,'攻击方式与伤害');
    if(enemy.attackSummary==='使用生成时实际获得的武器攻击；下列区间仅来自同一原生生成结果中可装配、可装填的组合。')body.append(el('p','guide-note','伤害随实际携带的武器、配件和弹药变化。'));
    const groups=[],equivalent=new Map();for(const raw of enemy.attacks){const attack=presentEnemyAttack(raw),mode=attack.name.match(/·(常规近战|射击)$/)?.[1],key=mode&&JSON.stringify([mode,attack.style,raw.damageSummary,attack.damage,attack.description,attack.effects,attack.conditions]);if(key&&equivalent.has(key)){equivalent.get(key).push(attack);continue;}const group=[attack];groups.push(group);if(key)equivalent.set(key,group);}
    for(const group of groups){const attack=group[0],section=el('details','enemy-attack'),summary=el('summary');section.dataset.attackCount=group.length;section.open=groups.length===1;const names=[...new Set(group.map(a=>a.name))],name=names.length===1?attack.name:attack.style+' · '+names.length+'种配装';summary.append(el('strong','',name));if(attack.damage)summary.append(el('span','enemy-attack-damage',attack.damage));if(attack.composition.length)summary.append(el('span','enemy-attack-types','基础 · '+attack.composition.join(' · ')));section.append(summary);if(group.length===1&&attack.description)section.append(el('p','',attack.description));else if(group.length>1)lines(section,names);lines(section,attack.effects);lines(section,attack.conditions);body.append(section);}
  }
  const enemyFactTemplates=new Map([
    ['受到攻击时会触发逃跑，远离附近玩家；当前未确认主动攻击行为。','受到攻击时会触发逃跑，远离附近玩家。'],
    ['发现存活目标后累计计时超过10秒，将所管理的“味享集团 实习保安”（Office_StoneMan_Summon）补足至3名；死亡后可再次计时补充。静态AI状态已核验，实机未运行。','发现存活目标累计超过10秒后，将“味享集团 实习保安”补足至3名；保安死亡后可再次计时补充，并维持后续召唤队列。'],
    ['此条目是正式保安：基础击杀经验8。摄像头召唤的是独立的实习保安配置，基础击杀经验1、额外掉落触发配置0.2；不等同于本条目的掉落触发配置1。','正式保安的基础击杀经验为8，摄像头召唤的实习保安为1。实习保安有20%概率触发额外战利品，正式保安为100%。']
  ]);
  const enemyActionTemplates=new Map([
    ['初始召唤2个真菌子嗣，每5秒补充，配置上限4个；自身未定位直接伤害链。','初始召唤2个真菌子嗣，每5秒补充，上限4个。'],
    ['配置范围真菌标记，并初始召唤2个真菌子嗣，每5秒补充，配置上限15个；自身未定位直接伤害链。','为范围内目标施加真菌标记；初始召唤2个真菌子嗣，每5秒补充，上限15个。'],
    ['月亮阴影可阻挡对应太阳的热辐射；未定位其独立主动伤害链。','月亮阴影可阻挡对应太阳的热辐射。'],
    ['被骸激活后，对范围内玩家持续刷新恐慌状态；未定位独立直接伤害链。','被骸激活后，对范围内玩家持续刷新恐慌状态。'],
    ['发现目标累计达到10秒后召唤3名实习保安；后续维持召唤队列。伤害由被召唤者的攻击结算，自身未定位直接伤害链。','发现存活目标累计超过10秒后，将“味享集团 实习保安”补足至3名；保安死亡后可再次计时补充，并维持后续召唤队列。'],
    ['低生命转阶段切换飞踢并附加状态；阶段状态的完整伤害影响未纳入本表，不按通用伤害字样推断倍率','低生命时切换为飞踢，并附加状态。'],
    ['按各招式的一次命中列基础值；火球分裂、波次横扫与多束激光可能多次命中，未作为一招必定全中合计','火球分裂、波次横扫与多束激光可多次命中。'],
    ['由骸控制的部件；此角色配置未绑定独立攻击装备，不将骸的全部攻击重复计入。','由骸控制的机械部件。'],
    ['当前配置只有移动行为，未定位主动伤害链。','随机移动。']
  ]);
  function enemyActionFacts(enemy){
    const actions=[enemy.damageSummary,...(enemy.attackUnknowns||[])].map(text=>enemyActionTemplates.get(text)).filter(Boolean);
    if(enemy.attackSummary==='吐出造成冲击伤害的烟弹并可附加毒雾；近身冒烟配置仅附加毒雾，持续扣血另算。')actions.push('吐出造成冲击伤害的烟弹，可附加毒雾；近身冒烟只附加毒雾，持续扣血另算。');
    return [...new Set(actions)];
  }
  function enemyLootRate(candidate){const value=[candidate.generationChancePct,candidate.chancePct].find(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=100);return value===undefined?'':'预估概率：'+percent(value);}
  function detail(title, tag, key=tag+':'+title) { window.WikiNavigation.cancelDialogClose($('detail')); const body=el('div','detail-body guide-detail'); const h=el('h2','',title); h.id='detail-title'; body.append(el('p','detail-tag',tag),h); window.WikiNavigation.replaceDetail(key,[body]); $('detail').querySelector('.detail-top>span').textContent=tag; if(!$('detail').open)$('detail').showModal(); $('detail').scrollTop=0;if(tag==='敌怪图鉴'){body.dataset.cardKind='enemy';body.dataset.cardName=title;queueMicrotask(()=>window.WikiCardImage?.mount(body));}return body; }
  function toolbar(label,value,oninput) { const wrap=el('div','guide-search'); const input=el('input'); input.type='search'; input.value=value; input.placeholder=label; input.setAttribute('aria-label',label); input.addEventListener('input',oninput); wrap.append(input); return wrap; }
  const legacyNote='此栏目仍为 Demo 攻略，尚未迁移至 EA；物品链接打开 EA 当前资料。';
  function intro(title,copy){const h=el('div','guide-heading');h.append(el('p','kicker','生存者的随身手册'),el('h1','',title),el('p','intro-copy',copy));if(['quests','mirror','corruption'].includes(page)&&cache[page]?.meta?.edition==='EA')h.append(el('p','guide-note',`EA · Build ${cache[page].meta.buildId}`));else if(page==='mirror')h.append(el('p','guide-note',legacyNote));return h;}
  function percent(n) { return typeof n==='number' ? `${Number(n.toPrecision(4))}%` : '—'; }
  let questIndex=null, questGraph=null, wheelFrame=0, wheelDelta=0, wheelPoint=null;
  function indexQuests(){
    const d=cache.quests;if(questIndex?.data===d)return questIndex;
    const byId=new Map(d.missions.map(m=>[m.id,m])),incoming=new Map(),outgoing=new Map(),search=new Map();
    d.missions.forEach(m=>{incoming.set(m.id,[]);outgoing.set(m.id,[]);search.set(m.id,`${m.name} ${m.id} ${m.description} ${m.requirements.map(r=>r.nameZh).join(' ')}`.toLowerCase());});
    d.edges.forEach(e=>{if(!incoming.has(e.to)||!outgoing.has(e.from))throw Error('任务关系引用缺失');incoming.get(e.to).push(e);outgoing.get(e.from).push(e);});
    const mainNodes=new Set(d.mainRoute?.nodeIds||[]),edgeRoutes=new Map((d.edgeRoutes||[]).map(e=>[e.from+'|'+e.to,e.laneY]));
    const groups=d.layoutGroups||[],groupById=new Map(groups.flatMap(g=>g.members.map(id=>[id,g.id])));
    return questIndex={data:d,byId,incoming,outgoing,search,groups,groupById,mainNodes,edgeRoutes,lines:new Map(),width:Math.max(...d.missions.map(m=>m.position.x+240),...groups.map(g=>g.x+g.width+24)),height:Math.max(...d.missions.map(m=>m.position.y+120),...groups.map(g=>g.y+g.height+24))};
  }
  function traceLine(key){const ix=indexQuests();if(ix.lines.has(key))return ix.lines.get(key);const nodes=new Set([key]),links=new Set();
    for(const [map,other] of [[ix.outgoing,'to'],[ix.incoming,'from']]){const seen=new Set([key]),queue=[key];for(let i=0;i<queue.length;i++)for(const e of map.get(queue[i])||[]){links.add(e);nodes.add(e[other]);if(!seen.has(e[other])){seen.add(e[other]);queue.push(e[other]);}}}
    const result={nodes,links};ix.lines.set(key,result);return result;
  }
  function cancelQuestWheel(){if(wheelFrame)cancelAnimationFrame(wheelFrame);wheelFrame=0;wheelDelta=0;wheelPoint=null;}
  function syncQuestTransform(){const v=$('quest-viewport'),c=$('quest-canvas'),scene=c?.firstElementChild;if(!v||!scene)return;const ix=indexQuests();c.style.width=`${ix.width*zoom+v.clientWidth}px`;c.style.height=`${ix.height*zoom+v.clientHeight}px`;scene.style.left=`${v.clientWidth/2}px`;scene.style.top=`${v.clientHeight/2}px`;scene.style.transform=`scale(${zoom})`;scene.style.setProperty('--quest-trunk-width',Math.max(2,1.5/zoom)+'px');$('quest-zoom').textContent=`${Math.round(zoom*100)}%`;v.classList.toggle('zoom-overview',zoom<.32);}
  function questMatch(m) { const q=questQuery.trim().toLowerCase(); return (!q || indexQuests().search.get(m.id).includes(q)) && (questCategory==='all' || questCategory===m.channel || questCategory==='review:'+m.review?.status || (questCategory.startsWith('group:')&&indexQuests().groupById.get(m.id)===questCategory.slice(6)) || (questCategory==='done'&&completed.has(m.id)) || (questCategory==='todo'&&!completed.has(m.id)) || (questCategory.startsWith('goal:')&&m.requirements.some(r=>(questCategory==='goal:Craft'?['CraftItem','CraftFurniture','UpgradeResearchTable','UnlockBlueprint','UnlockFurniture'].includes(r.type):questCategory==='goal:Reach'?['Reach','Explore','Interact','OccupyBastion'].includes(r.type):r.type.startsWith(questCategory.slice(5)))))); }
  function questMark(m){if(completed.has(m.id))return '✓ 已标记完成';return window.QuestProgress.entries(m,cache.quests.edges).some(entry=>window.QuestProgress.satisfied(entry,completed))?'前置已手动标记完成':'○ 未标记完成';}
  function restoreFocus(itemId){if(['npcs','recipes'].includes(page)&&window.NpcRecipes.restoreFocus(page))return;if(page==='quests'&&suppliesDrawer?.resume())return;if(page==='quests'&&questItemOrigin){const a=$('quest-sidebar')?.querySelector(`a[href="${CSS.escape(questItemOrigin)}"]`);if(a){a.focus({preventScroll:true});return;}}let node;if(page==='quests')node=questView==='map'?document.querySelector(`[data-quest="${CSS.escape(selectedQuest||'GiftWelcome')}"]`):document.querySelector(`.quest-list-row[href="#quest/${encodeURIComponent(selectedQuest||'GiftWelcome')}"]`);if(page==='enemies')node=document.querySelector(`.enemy-card[href="#enemy/${encodeURIComponent(selectedEnemy||'')}"]`);if(page==='items'&&itemId)node=document.querySelector(`[data-item="${CSS.escape(itemId)}"]`);(node||$('guide-root').querySelector('input')||$('search')).focus({preventScroll:true});}
  async function saveProgress(id,done){const result=await window.QuestSupplies.setComplete(null,id,done);if(result.saved)completed=result.completed;else done?completed.add(id):completed.delete(id);suppliesDrawer?.refresh();return result;}
  function previewProgress(m) {
    return new Promise(resolve=>{
      const dialog=el('dialog','quest-progress-dialog');dialog.id='quest-progress-dialog';dialog.setAttribute('aria-labelledby','quest-progress-title');
      const title=el('h2','','标记任务完成');title.id='quest-progress-title';const label=el('label','quest-progress-option'),toggle=el('input');toggle.type='checkbox';toggle.checked=true;label.append(toggle,el('span','','同时补齐前置任务'));
      const content=el('div','quest-progress-content'),status=el('p','guide-note'),actions=el('div','quest-progress-actions'),cancel=el('button','secondary-button','取消'),only=el('button','secondary-button','仅标记当前'),confirm=el('button','secondary-button','确认标记');
      actions.append(cancel,only,confirm);dialog.append(title,el('p','',m.name),label,content,status,actions);document.body.append(dialog);
      const selections={};let snapshot=new Set(completed),plan;
      function finish(result){dialog.close();dialog.remove();resolve(result);}
      function draw(){
        plan=toggle.checked?window.QuestProgress.plan(cache.quests,m.id,snapshot,selections):{ids:snapshot.has(m.id)?[]:[m.id],choices:[],warnings:[],unresolved:0};
        content.replaceChildren();
        for(const choice of plan.choices){const row=el('label','quest-progress-choice',choice.title),select=el('select');select.setAttribute('aria-label',choice.title);const placeholder=el('option','','请选择实际路径');placeholder.value='';select.append(placeholder);for(const option of choice.options){const o=el('option','',option.label);o.value=option.value;select.append(o);}select.value=selections[choice.key]||'';select.onchange=()=>{selections[choice.key]=select.value;draw();content.querySelectorAll('select')[plan.choices.findIndex(c=>c.key===choice.key)]?.focus();};row.append(select);content.append(row);}
        const list=el('ul','guide-lines');for(const id of plan.ids)list.append(el('li','',indexQuests().byId.get(id)?.name||'任务资料待核实'));content.append(el('p','',`本次新增 ${plan.ids.length} 项完成标记`),list);
        for(const warning of plan.warnings)content.append(el('p','guide-note',warning));
        content.append(el('p','guide-note','可选分支只补标所选路径；取消当前任务不会撤销其他任务。已备物品数量不变。'));
        confirm.textContent=`确认标记 ${plan.ids.length} 项`;confirm.disabled=!!plan.unresolved;
      }
      async function save(currentOnly){
        confirm.disabled=only.disabled=cancel.disabled=toggle.disabled=true;content.querySelectorAll('select').forEach(node=>node.disabled=true);
        const ids=currentOnly?[m.id]:plan.ids,result=await window.QuestSupplies.setCompleteMany(null,ids,undefined,snapshot);
        if(result.stale){snapshot=result.completed;completed=result.completed;draw();status.textContent='其他页面已更新进度，请核对新清单后再确认。';only.disabled=cancel.disabled=toggle.disabled=false;return;}
        if(result.saved)completed=result.completed;else for(const id of ids)completed.add(id);suppliesDrawer?.refresh();finish(result);
      }
      toggle.onchange=draw;cancel.onclick=()=>finish(null);only.onclick=()=>save(true);confirm.onclick=()=>save(false);
      dialog.addEventListener('cancel',event=>{event.preventDefault();finish(null);});dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!cancel.disabled)finish(null);}});
      draw();dialog.showModal();cancel.focus();
    });
  }
  window.addEventListener('storage',event=>{if(event.key===progressKey||event.key===null){const state=window.QuestSupplies.read(null,progressKey);if(!state.blocked){completed=state.completed;if(page==='quests'){drawQuests();if(selectedQuest){const mission=indexQuests().byId.get(selectedQuest);if(mission&&questMatch(mission)){const mark=$('quest-sidebar').querySelector('.quest-detail > button');if(mark)mark.textContent=completed.has(mission.id)?'标记未完成':'标记完成';$('quest-sidebar').querySelectorAll('[data-progress-id]').forEach(node=>node.textContent=completed.has(node.dataset.progressId)?' · 已手动标记完成':'');}else clearQuest(false);}}suppliesDrawer?.refresh();}}});
  function decorateQuest(host,m,full=false){
    const review=window.QuestGuide.status(m);if(review){host.dataset.reviewStatus=m.review.status;if(!host.classList.contains('quest-node'))host.append(el('span','quest-review-tag',review.label));else host.append(el('span','quest-review-tag quest-node-review',review.label));}
    const semantic=window.QuestSemantics.classifyMission(m,new Set(window.Wiki.data.items.map(i=>i.id)));
    for(const kind of ['coordinate','recycle'])host.classList.toggle('quest-special-'+kind,semantic.tags.some(t=>t.kind===kind));
    if(semantic.tags.length){const tags=el('span','quest-semantic-tags');for(const tag of semantic.tags)tags.append(el('span','quest-semantic-tag quest-tag-'+tag.kind,tag.label));host.append(tags);}
    if(full){
      for(const c of semantic.coordinates){const row=el('p','quest-semantic-note');row.append(el('span','',c.phase==='finReward'?'完成后获得坐标：':'事前获得坐标：'),link(c.name,'#maps/'+encodeURIComponent(c.id)),el('span','',c.count===null?' · 数量待核实':' × '+c.count));host.append(row);}
      if(semantic.coordinates.length)host.append(el('p','guide-note','获得地图坐标不代表地图全部探索内容已解锁。'));
      for(const r of semantic.recycles){const row=el('p','quest-semantic-note');row.append(el('span','','回收指定物品以接取：'),itemLink(r.itemId),el('span','',r.count===null?' · 接取数量待核实':' × '+r.count));host.append(row);}
      if(semantic.pending.length)host.append(el('p','guide-note','部分特殊奖励或接取入口的关联资料待核实。'));
    }
  }
  function drawQuests(){
    const d=cache.quests,list=$('quest-list'),canvas=$('quest-canvas');if(!d||!list||!canvas)return;
    const ix=indexQuests(),ms=d.missions.filter(questMatch),signature=ms.map(m=>m.id).join('|');
    $('quest-start').disabled=!ms.some(m=>m.id==='GiftWelcome');
    $('quest-count').textContent=`EA · ${ms.length} / ${d.missions.length} 项任务 · 本机已标记 ${d.missions.filter(m=>completed.has(m.id)).length} 项完成`;
    if(!questGraph||questGraph.canvas!==canvas||questGraph.signature!==signature){
      const focused=document.activeElement?.dataset.quest,vis=new Set(ms.map(m=>m.id));
      questGraph={canvas,signature,nodes:new Map(),rows:new Map(),edges:[],groups:new Map()};
      const fragment=document.createDocumentFragment();if(!ms.length)fragment.append(el('p','empty','没有匹配任务。清除搜索或切换分类。'));
      const scene=el('div','quest-scene');scene.style.width=`${ix.width}px`;scene.style.height=`${ix.height}px`;
      for(const group of ix.groups){
        const members=group.members.filter(id=>vis.has(id));if(!members.length)continue;
        const box=el('section','quest-cluster');box.dataset.questGroup=group.id;box.setAttribute('aria-label',group.title);
        Object.assign(box.style,{left:group.x+'px',top:group.y+'px',width:group.width+'px',height:group.height+'px'});
        const heading=el('button','quest-cluster-title',group.title+' · '+members.length+'项');heading.type='button';heading.setAttribute('aria-label','定位'+group.title);
        heading.onclick=()=>{clearQuest(false);focusQuest(members);};box.append(heading,el('p','quest-cluster-description',group.description));
        for(const section of group.sections||[]){if(!section.members.some(id=>vis.has(id)))continue;const label=el('p','quest-cluster-subtitle',section.title);label.style.left=(section.x-group.x)+'px';label.style.top=(section.y-group.y)+'px';box.append(label);}
        scene.append(box);questGraph.groups.set(group.id,{box,members});
      }
      const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('width',ix.width);svg.setAttribute('height',ix.height);svg.setAttribute('aria-hidden','true');
      const defs=document.createElementNS(ns,'defs'),marker=document.createElementNS(ns,'marker');
      Object.entries({id:'quest-arrow',markerUnits:'userSpaceOnUse',markerWidth:'9',markerHeight:'9',refX:'8',refY:'4.5',orient:'auto'}).forEach(([k,v])=>marker.setAttribute(k,v));
      const arrow=document.createElementNS(ns,'path');arrow.setAttribute('d','M1 1 L8 4.5 L1 8 L3 4.5 Z');arrow.setAttribute('fill','#b5d7df');marker.append(arrow);const mainMarker=marker.cloneNode(true);mainMarker.id='quest-arrow-trunk';mainMarker.firstChild.setAttribute('fill','#8cdeb0');defs.append(marker,mainMarker);svg.append(defs);
      d.edges.filter(e=>vis.has(e.from)&&vis.has(e.to)).forEach(e=>{
        const a=ix.byId.get(e.from).position,b=ix.byId.get(e.to).position,path=document.createElementNS(ns,'path'),main=ix.mainNodes.has(e.from)&&ix.mainNodes.has(e.to),lane=ix.edgeRoutes.get(e.from+'|'+e.to);
        let route=`M${a.x+218} ${a.y+56} C${a.x+268} ${a.y+56},${b.x-50} ${b.y+56},${b.x} ${b.y+56}`;
        if(a.x===b.x)route=`M${a.x+218} ${a.y+56} C${a.x+310} ${a.y+56},${b.x+310} ${b.y+56},${b.x+218} ${b.y+56}`;
        else if(lane!==undefined)route=`M${a.x+218} ${a.y+56} C${a.x+268} ${a.y+56},${a.x+268} ${lane},${a.x+288} ${lane} L${b.x-70} ${lane} C${b.x-50} ${lane},${b.x-50} ${b.y+56},${b.x} ${b.y+56}`;
        path.setAttribute('d',route);path.dataset.from=e.from;path.dataset.to=e.to;path.setAttribute('fill','none');path.setAttribute('marker-end',main?'url(#quest-arrow-trunk)':'url(#quest-arrow)');path.classList.add('quest-edge');path.classList.toggle('quest-trunk-edge',main);if(e.kind==='rewarded-prerequisite')path.classList.add('prerequisite');
        const flow=path.cloneNode();flow.removeAttribute('marker-end');flow.removeAttribute('data-from');flow.removeAttribute('data-to');flow.setAttribute('class','quest-flow'+(main?' quest-trunk-flow':''));flow.setAttribute('pathLength','100');flow.style.display='none';svg.append(path,flow);questGraph.edges.push({edge:e,path,flow,main});
      });scene.append(svg);
      ms.forEach(m=>{
        const row=link(m.name,`#quest/${encodeURIComponent(m.id)}`);row.className='quest-list-row';decorateQuest(row,m);const status=el('span','muted');row.append(status);fragment.append(row);questGraph.rows.set(m.id,status);
        const node=link('',`#quest/${encodeURIComponent(m.id)}`);node.className='quest-node';node.dataset.quest=m.id;node.style.left=`${m.position.x}px`;node.style.top=`${m.position.y}px`;node.title=m.name;
        const channel=el('span','node-channel',(types[m.channel]||'类型待核实'));if(m.channel==='Mail'||m.channel==='Chat')channel.prepend(window.Wiki.art(`ui/quest-${m.channel==='Mail'?'mail':'message'}.png`,'quest-channel-icon'));
        if(ix.mainNodes.has(m.id)){node.classList.add('quest-trunk-node');channel.append(el('span','quest-trunk-badge','主干'));}
        const mark=el('span','node-mark');node.append(channel,el('strong','',m.name));decorateQuest(node,m);node.append(mark);scene.append(node);questGraph.nodes.set(m.id,{node,mark});
      });list.replaceChildren(fragment);canvas.replaceChildren(scene);if(focused)questGraph.nodes.get(focused)?.node.focus({preventScroll:true});
    }
    const line=selectedQuest?traceLine(selectedQuest):null;
    ms.forEach(m=>{const mark=questMark(m),entry=questGraph.nodes.get(m.id);entry.node.classList.toggle('done',completed.has(m.id));entry.node.classList.toggle('selected',selectedQuest===m.id);entry.node.classList.toggle('muted-node',!!line&&!line.nodes.has(m.id));entry.node.setAttribute('aria-current',selectedQuest===m.id?'true':'false');if(entry.mark.textContent!==mark)entry.mark.textContent=mark;const status=`${(types[m.channel]||'类型待核实')} · ${mark}`,row=questGraph.rows.get(m.id);if(row.textContent!==status)row.textContent=status;});
    questGraph.groups.forEach(({box,members})=>box.classList.toggle('unrelated',!!line&&!members.some(id=>line.nodes.has(id))));
    questGraph.edges.forEach(({edge,path,flow,main})=>{const active=!!line?.links.has(edge);path.classList.toggle('active',active);path.classList.toggle('dimmed',!!line&&!active);flow.style.display=active||main?'':'none';flow.classList.toggle('dimmed',!!line&&!active);});syncQuestTransform();
  }
  function focusQuest(keys,limit=1){
    cancelQuestWheel();const d=cache.quests,v=$('quest-viewport');if(!v||v.hidden)return;const ms=d.missions.filter(m=>keys.includes(m.id)&&questMatch(m));if(!ms.length)return;
    const selected=new Set(ms.map(m=>m.id)),boxes=ms.map(m=>({...m.position,width:218,height:112}));
    boxes.push(...indexQuests().groups.filter(g=>g.members.every(id=>selected.has(id))));
    const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y)),w=Math.max(...boxes.map(b=>b.x+b.width))-x,h=Math.max(...boxes.map(b=>b.y+b.height))-y;
    const reserved=questDetailsOpen&&v.clientWidth>760?$('quest-sidebar').clientWidth+48:0;zoom=Math.max(.035,Math.min(limit,(v.clientWidth-reserved-48)/w,(v.clientHeight-220)/h));syncQuestTransform();v.scrollTo((x+w/2)*zoom+reserved/2,(y+h/2)*zoom);
  }
  function resizeQuest(delta,point){const v=$('quest-viewport'),r=v.getBoundingClientRect(),x=point?point.x-r.left:v.clientWidth/2,y=point?point.y-r.top:v.clientHeight/2,old=zoom,nx=(v.scrollLeft+x-v.clientWidth/2)/old,ny=(v.scrollTop+y-v.clientHeight/2)/old;zoom=Math.max(.035,Math.min(2,zoom+delta));syncQuestTransform();v.scrollTo(nx*zoom+v.clientWidth/2-x,ny*zoom+v.clientHeight/2-y);}
  function showQuestGuide(){
    if(guideDialog)return;
    const dialog=el('dialog','quest-guide-dialog');dialog.setAttribute('aria-labelledby','quest-guide-title');
    const top=el('div','quest-guide-top'),title=el('h2','','推进路线与特殊入口');title.id='quest-guide-title';
    const close=el('button','secondary-button','返回任务图');top.append(title,close);
    const content=window.QuestGuide.render(cache.quests);dialog.append(top,content);document.body.append(dialog);
    const dismiss=(restore=true)=>{if(guideDialog?.node!==dialog)return;guideDialog=null;dialog.close();dialog.remove();if(restore){if(location.hash==='#quests/guide')history.replaceState(null,'','#quests');$('quest-guide-toggle')?.focus({preventScroll:true});}};
    guideDialog={node:dialog,close:dismiss};close.onclick=()=>dismiss();dialog.oncancel=event=>{event.preventDefault();dismiss();};
    dialog.addEventListener('click',event=>{if(event.target.closest('a[href^="#quest/"]'))dismiss(false);});dialog.showModal();close.focus({preventScroll:true});
  }
  function renderQuests(){suppliesDrawer?.dispose();suppliesDrawer=null;cancelQuestWheel();questGraph=null;const root=$('guide-root');root.classList.add('quest-page');root.replaceChildren(intro('任务图','沿任务线查看目标、奖励与后续。完成标记只保存在当前浏览器。'));
    const tools=el('div','guide-tools quest-toolbar');const back=link('‹ 攻略首页','#home');back.className='quest-back';tools.append(back);const guide=link('推进路线','#quests/guide');guide.id='quest-guide-toggle';guide.className='secondary-button quest-guide-toggle';tools.append(guide);tools.append(toolbar('搜索任务名称、目标或代号',questQuery,e=>{questQuery=e.target.value;clearQuest(false);drawQuests();const m=cache.quests.missions.find(questMatch);if(m)focusQuest([m.id]);}));const select=el('select');select.setAttribute('aria-label','任务分类');[['all','全部任务'],['review:unconfirmed','入口未明'],['review:empty','空定义'],['review:dialogue','默认闲聊'],['Mail','邮件'],['Chat','消息'],['Talk','对话'],['AutoDone','自动事件'],['goal:Collect','收集与交付'],['goal:Kill','消灭敌人'],['goal:Reach','区域调查'],['goal:Craft','建设与制作'],['done','已标记完成'],['todo','未标记完成']].concat((cache.quests.layoutGroups||[]).map(g=>['group:'+g.id,'分区 · '+g.title])).filter(([value])=>!value.startsWith('review:')||cache.quests.missions.some(m=>'review:'+m.review?.status===value)).forEach(([v,t])=>{const o=el('option','',t);o.value=v;select.append(o);});select.value=questCategory;select.onchange=()=>{questCategory=select.value;clearQuest(false);drawQuests();focusQuest(cache.quests.missions.filter(questMatch).map(m=>m.id));};tools.append(select);
    const toggle=el('button','secondary-button quest-view-toggle',questView==='map'?'切换任务列表':'切换流程图');toggle.onclick=()=>{questView=questView==='map'?'list':'map';renderQuests();if(selectedQuest)showQuest(cache.quests.missions.find(m=>m.id===selectedQuest));};tools.append(toggle);const supplies=el('button','secondary-button','物品清单');supplies.id='quest-supplies-toggle';supplies.setAttribute('aria-haspopup','dialog');supplies.setAttribute('aria-controls','quest-supplies');supplies.onclick=()=>suppliesDrawer.open();tools.append(supplies);root.append(tools);const legend=el('p','quest-legend');legend.append(el('span','quest-semantic-tag quest-trunk-legend','跨地图主干'),el('span','quest-semantic-tag quest-tag-coordinate','获得地图坐标'),el('span','quest-semantic-tag quest-tag-recycle','回收物品接取'));root.append(legend);const count=el('p','result-count reference-count');count.id='quest-count';count.setAttribute('role','status');root.append(count);
    const wrap=el('div','quest-map');wrap.hidden=questView!=='map';const viewport=el('div','quest-viewport');viewport.id='quest-viewport';viewport.tabIndex=0;viewport.setAttribute('aria-label','任务流程画布，空白拖动，滚轮缩放，方向键移动');const canvas=el('div');canvas.id='quest-canvas';viewport.append(canvas);wrap.append(viewport);
    const controls=el('div','map-controls');[['全览',()=>focusQuest(cache.quests.missions.filter(questMatch).map(m=>m.id))],['起点',()=>focusQuest(['GiftWelcome'])],['聚焦任务线',()=>selectedQuest&&focusQuest([...traceLine(selectedQuest,cache.quests.edges).nodes])],['缩小',()=>resizeQuest(-.1)],['放大',()=>resizeQuest(.1)]].forEach(([t,fn])=>{const b=el('button','secondary-button',t);if(t==='起点')b.id='quest-start';b.onclick=fn;controls.append(b);});const output=el('output');output.id='quest-zoom';controls.append(output);const fold=el('button','secondary-button','展开详情');fold.id='quest-detail-toggle';fold.setAttribute('aria-controls','quest-sidebar');fold.onclick=()=>setQuestDetails(!questDetailsOpen);controls.append(fold);wrap.append(controls);const workspace=el('div','quest-workspace');workspace.id='quest-workspace';const primary=el('div','quest-primary');primary.append(wrap);root.append(workspace);workspace.append(primary,controls);const list=el('div','quest-list');list.id='quest-list';list.hidden=questView!=='list';primary.append(list);const sidebar=el('aside','quest-sidebar');sidebar.id='quest-sidebar';sidebar.setAttribute('aria-label','任务详情');workspace.append(sidebar);setQuestDetails(questDetailsOpen);sidebar.append(el('p','quest-placeholder','选择任务，查看目标、奖励和后续流程。'));root.append(el('p','guide-note','连线表示任务流程关系，具体前置条件见详情；光效仅表示方向。网页标记不代表游戏已领取奖励或解锁任务。'));
    let drag=null;viewport.onpointerdown=e=>{if(e.button!==0||e.target.closest('a,button'))return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:viewport.scrollLeft,top:viewport.scrollTop,moved:false};viewport.setPointerCapture(e.pointerId);viewport.classList.add('dragging');viewport.focus({preventScroll:true});e.preventDefault();};viewport.onpointermove=e=>{if(drag&&e.pointerId===drag.id){if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>4)drag.moved=true;viewport.scrollTo(drag.left+drag.x-e.clientX,drag.top+drag.y-e.clientY);}};const stop=()=>{if(drag&&viewport.hasPointerCapture(drag.id))viewport.releasePointerCapture(drag.id);drag=null;viewport.classList.remove('dragging');};viewport.onpointerup=()=>{const click=drag&&!drag.moved;stop();if(click&&selectedQuest)clearQuest(true);};viewport.onpointercancel=stop;viewport.onlostpointercapture=()=>{drag=null;viewport.classList.remove('dragging');};viewport.addEventListener('wheel',e=>{e.preventDefault();wheelDelta-=Math.sign(e.deltaY)*.1;wheelPoint={x:e.clientX,y:e.clientY};if(!wheelFrame){const owner=viewport;wheelFrame=requestAnimationFrame(()=>{wheelFrame=0;const delta=wheelDelta,point=wheelPoint;wheelDelta=0;wheelPoint=null;if(page==='quests'&&owner===$('quest-viewport'))resizeQuest(delta,point);});}},{passive:false});viewport.onkeydown=e=>{const move={ArrowLeft:[-100,0],ArrowRight:[100,0],ArrowUp:[0,-100],ArrowDown:[0,100]}[e.key];if(e.target===viewport&&move){e.preventDefault();viewport.scrollBy(...move);}};suppliesDrawer=window.QuestSupplies.createDrawer({missions:cache.quests.missions,getCompleted:()=>completed,getItem:window.Wiki.getItem,el,art:window.Wiki.art,onQuest:()=>{questItemOrigin=null;}});drawQuests();if(questView==='map')focusQuest(selectedQuest?[selectedQuest]:questCategory!=='all'||questQuery.trim()?cache.quests.missions.filter(questMatch).map(m=>m.id):['GiftWelcome']);
  }
  function setQuestDetails(open){questDetailsOpen=!!open&&!!selectedQuest;const side=$('quest-sidebar');if(side){side.hidden=!questDetailsOpen;$('quest-workspace')?.classList.toggle('details-open',questDetailsOpen);}const button=$('quest-detail-toggle');if(button){button.disabled=!selectedQuest;button.textContent=questDetailsOpen?'收起详情':'展开详情';button.setAttribute('aria-expanded',String(questDetailsOpen));}}
  function clearQuest(updateRoute){const key=selectedQuest;selectedQuest=null;setQuestDetails(false);Guide.baseRoute='#quests';const sidebar=$('quest-sidebar');if(sidebar)sidebar.replaceChildren(el('p','quest-placeholder','选择任务，查看目标、奖励和后续流程。'));if(location.hash.startsWith('#quest/'))history.replaceState(null,'','#quests');drawQuests();if(updateRoute){const node=questView==='map'?document.querySelector(`[data-quest="${CSS.escape(key||'')}"]`):document.querySelector(`.quest-list-row[href="#quest/${encodeURIComponent(key||'')}"]`);node?.focus({preventScroll:true});}}
  function showUnavailableQuest(id){
    const archived=cache.quests.archivedMissions?.find(m=>m.id===id);clearQuest(false);
    history.replaceState(null,'','#quest/'+encodeURIComponent(id));
    const sidebar=$('quest-sidebar'),body=el('div','quest-detail');
    const title=el('h2','',archived?archived.name+'（已移出攻略）':'任务未收录');title.id='quest-retired-title';
    body.append(title,el('p','quest-placeholder',archived?.reason||'此任务链接不存在。'),link('返回当前任务图','#quests'));
    sidebar.replaceChildren(body);sidebar.hidden=false;$('quest-workspace').classList.add('details-open');
  }
  function questRow(body,r){const row=el('div','guide-row');row.append(el('span','row-label',types[r.type]||r.type));if(['AddShopItem','AddShopBundle'].includes(r.type)){const products=el('div','related-links');(r.products||(r.candidates||[]).map(c=>c.id)).forEach(id=>products.append(itemLink(id)));row.append(products.childElementCount?products:el('span','','商品资料待核实'));}else if(r.type==='Document'){const m=cache.quests.missions.find(m=>m.id===r.data);row.append(m?link(m.name,`#quest/${encodeURIComponent(r.data)}`):el('span','',r.nameZh||'关联资料待核实'));}else if(window.Wiki.getItem(r.data))row.append(itemLink(r.data));else row.append(el('span','',r.nameZh|| (r.type==='Money'?'信用券':r.data||'')));if(!['Document','AddShopItem','AddShopBundle','UnlockInsurance','Coordinate'].includes(r.type))row.append(el('strong','',`× ${r.count}`));body.append(row);if(r.actorIds?.length){const wrap=el('div','related-links');r.actorIds.forEach(id=>wrap.append(link('查看目标 · '+(r.actorNames?.[id]||cache.enemies?.enemies.find(e=>e.id===id)?.name||r.nameZh||'敌怪资料待核实')+(window.EnemyVariants.recordedLabel(id)?' · '+window.EnemyVariants.recordedLabel(id):''),`#enemy/${encodeURIComponent(id)}`)));body.append(wrap);}if(['AddShopItem','AddShopBundle'].includes(r.type)){body.append(el('p','guide-note','解锁商品的上架范围，并非直接获得；具体在售以商店刷新为准。'));}if(r.mark&&/[一-鿿]/.test(r.mark))body.append(el('p','guide-note',r.mark));if(r.referenceStatus?.startsWith('UNKNOWN'))body.append(el('p','guide-note','关联配置待核实。'));}
  function showQuest(m){if(!m)return;const changed=selectedQuest!==m.id;if(!questMatch(m)){questQuery='';questCategory='all';$('guide-root').querySelector('input').value='';$('guide-root').querySelector('select').value='all';}selectedQuest=m.id;Guide.baseRoute=`#quest/${encodeURIComponent(m.id)}`;drawQuests();const sidebar=$('quest-sidebar');sidebar.replaceChildren();const top=el('div','quest-sidebar-top');top.append(el('span','','任务详情'));const close=el('button','secondary-button','收起');close.setAttribute('aria-label','收起任务详情');close.onclick=()=>{setQuestDetails(false);$('quest-detail-toggle').focus({preventScroll:true});};top.append(close);const body=el('div','guide-detail quest-detail');const title=window.QuestGuide.appendRich(el('h2'),m.name,m.emphasis?.name);title.id='quest-detail-title';body.append(el('p','detail-tag',(types[m.channel]||'类型待核实')),title);sidebar.append(top,body);const article=link('打开完整攻略页','/quests/'+encodeURIComponent(m.id)+'/');article.className='static-guide-link';body.append(article);setQuestDetails(true);if(changed)sidebar.scrollTop=0;body.append(window.QuestGuide.appendRich(el('p','description'),m.description,m.emphasis?.description));decorateQuest(body,m,true);const review=window.QuestGuide.status(m);if(review)body.append(el('p','quest-review-note',review.description));for(const note of m.review?.notes||[])body.append(el('p','quest-review-note',note));const mark=el('button','secondary-button',completed.has(m.id)?'标记未完成':'标记完成');mark.onclick=async()=>{mark.disabled=true;const result=completed.has(m.id)?await saveProgress(m.id,false):await previewProgress(m);if(!result){if(mark.isConnected)mark.disabled=false;return;}if(page!=='quests'||!mark.isConnected)return;if(!questMatch(m)){clearQuest(false);$('guide-root').querySelector('select').focus();return;}showQuest(m);$('quest-sidebar').querySelector('.quest-detail > button')?.focus({preventScroll:true});if(!result.saved)$('quest-sidebar').append(el('p','guide-note',result.message));};body.append(mark,el('p','guide-note','手动记录仅保存在当前浏览器，不读取游戏存档。'));
    heading(body,'接取与前置');const incoming=indexQuests().incoming.get(m.id),groups=m.activationGroups||[],direct=incoming.filter(e=>e.kind==='reward-add-mission');
    function prerequisiteRow(target,parent,suffix){const row=el('p');row.append(target?link(target.name,`#quest/${encodeURIComponent(target.id)}`):el('span','muted','前置任务待核实'),el('span','muted',` · ${suffix}`));if(target){const mark=el('span','muted',completed.has(target.id)?' · 已手动标记完成':'');mark.dataset.progressId=target.id;row.append(mark);}parent.append(row);}
    groups.forEach(group=>{const section=el('section','quest-prereq-group');section.dataset.gate=group.gate;section.append(el('p','',group.gate==='ANY'?'自动接取：以下任一前置流程结束后可解锁。':'自动接取：以下全部前置流程结束后可解锁。'));group.members.forEach(id=>prerequisiteRow(indexQuests().byId.get(id),section,'前置流程'));(group.pending||[]).forEach(()=>section.append(el('p','guide-note','另有前置依赖待核实。')));body.append(section);});
    if(direct.length){const section=el('section','quest-direct-entry');section.append(el('p','',groups.length?'也可由以下任一任务的奖励直接发放，无需同时满足上面的自动前置：':'由以下任一任务的奖励直接发放：'));direct.forEach(edge=>prerequisiteRow(indexQuests().byId.get(edge.from),section,edge.rewardPhase==='preReward'?'事前补给发放':'完成奖励发放'));body.append(section);}
    m.triggers.forEach(t=>{const p=el('p');if(t.type==='recycle'){p.append(el('span','','回收 '),itemLink(t.itemId),el('span','',' 时触发。'));}else{p.append(el('span','',t.name||'接取位置待核实'));(t.maps||[]).forEach(id=>p.append(el('span','',' · '),t.mapNames?.[id]?link(t.mapNames[id],'#maps/'+encodeURIComponent(id)):el('span','muted','地图入口待核实')));}body.append(p);});(m.pendingDependencies||[]).forEach(d=>body.append(el('p','guide-note',`待核实依赖：${/[一-鿿]/.test(d.name||'')?d.name:'关联任务'}`)));if(!incoming.length&&!m.triggers.length&&!m.review?.notes?.length&&!window.QuestGuide.status(m))body.append(el('p','guide-note','接取方式待核实。'));
    heading(body,'任务目标');if(!m.requirements.length)body.append(el('p','',m.review?.status==='empty'?'空定义；当前无可推进的对白步骤或目标。':m.review?.status==='dialogue'?'默认闲聊，不列为普通任务目标。':'无数值目标，按消息、邮件或对白的实际步骤继续。'));m.requirements.forEach(r=>questRow(body,r));if(m.preReward.length){heading(body,'事前补给');m.preReward.forEach(r=>questRow(body,r));}heading(body,'完成奖励');m.reward.forEach(r=>questRow(body,r));if(m.dynamicReward)body.append(el('p','guide-note','保险返还由当前实例决定，没有固定物品清单。'));if(!m.reward.length&&!m.dynamicReward)body.append(el('p','','无固定物品奖励。'));const next=cache.quests.edges.filter(e=>e.from===m.id);if(next.length){heading(body,'后续任务');const wrap=el('div','related-links');next.forEach(e=>{const n=cache.quests.missions.find(m=>m.id===e.to);wrap.append(link(n.name,`#quest/${encodeURIComponent(n.id)}`));});body.append(wrap);}if(m.texts.length){const fold=el('details','story-text');fold.append(el('summary','','任务原文'));m.texts.forEach((t,index)=>fold.append(window.QuestGuide.appendRich(el('p'),t,m.emphasis?.texts?.[index])));body.append(fold);} }
  const protectionAxes=[['基础防御','防御'],['冲击吸收','冲击吸收'],['穿刺偏转','穿刺偏转'],['切割抵抗','切割抵抗'],['相位转移','相位转移']];
  function enemyStatRows(enemy){return Array.isArray(enemy.stats)?enemy.stats:Object.entries(enemy.stats||{}).map(([label,value])=>({label,value}));}
  function protectionModel(enemy,catalog){
    const numeric=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0,values=new Map(enemyStatRows(enemy).map(stat=>[stat.label,stat.value]));
    const axes=protectionAxes.map(([key,label])=>({key,label,value:numeric(values.get(key))?values.get(key):null}));
    const cap=40;
    return {axes,cap,complete:axes.every(axis=>axis.value!==null)};
  }
  function enemyProtection(body,enemy){
    const model=protectionModel(enemy,cache.enemies.enemies),wrap=el('section','enemy-protection');
    if(model.complete){
      const svgNode=(tag,attrs={})=>{const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value]of Object.entries(attrs))node.setAttribute(key,String(value));return node;};
      const svg=svgNode('svg',{viewBox:'0 0 320 260',role:'img','aria-label':'防护属性：'+model.axes.map(axis=>axis.label+' '+axis.value).join('，')+'。统一刻度 0–'+model.cap,'data-protection-cap':model.cap});
      const center=[160,112],radius=72,point=(i,ratio)=>{const angle=(-90+i*72)*Math.PI/180;return[center[0]+Math.cos(angle)*radius*ratio,center[1]+Math.sin(angle)*radius*ratio];},points=ratio=>model.axes.map((axis,i)=>point(i,typeof ratio==='function'?ratio(axis):ratio).join(',')).join(' ');
      for(const ratio of [.25,.5,.75,1])svg.append(svgNode('polygon',{points:points(ratio),class:'enemy-protection-ring'}));
      model.axes.forEach((axis,i)=>{const [x,y]=point(i,1);svg.append(svgNode('line',{x1:center[0],y1:center[1],x2:x,y2:y,class:'enemy-protection-axis'}));});
      svg.append(svgNode('polygon',{points:points(axis=>Math.min(axis.value/model.cap,1)),class:'enemy-protection-shape'}));
      model.axes.forEach((axis,i)=>{const [x,y]=point(i,Math.min(axis.value/model.cap,1));svg.append(svgNode('circle',{cx:x,cy:y,r:2.5,class:'enemy-protection-point'}));});
      const labels=[[160,18,'middle'],[239,91,'start'],[215,208,'middle'],[105,208,'middle'],[81,91,'end']];
      model.axes.forEach((axis,i)=>{const [x,y,anchor]=labels[i],text=svgNode('text',{x,y,'text-anchor':anchor,class:'enemy-protection-label'});text.append(document.createTextNode(axis.label));const value=svgNode('tspan',{x,dy:16,class:'enemy-protection-value'});value.textContent=axis.value+(axis.value>model.cap?' ↑':'');text.append(value);svg.append(text);});
      const scale=svgNode('text',{x:160,y:252,'text-anchor':'middle',class:'enemy-protection-scale'});scale.textContent='刻度 0–40 · ↑ 超出刻度';svg.append(scale);wrap.append(svg);
    }else{
      const fallback=el('dl','enemy-protection-fallback');model.axes.forEach(axis=>{const row=el('div');row.append(el('dt','',axis.label),el('dd','',axis.value===null?'—':axis.value));fallback.append(row);});wrap.append(fallback);
    }
    const other=enemyStatRows(enemy).filter(stat=>!protectionAxes.some(([key])=>key===stat.label)),stats=el('dl','enemy-core-stats');
    other.forEach(stat=>{const row=el('div');row.append(el('dt','',({'生命基础上限':'生命','基础移动速度':'移速','基础击杀经验':'击杀经验'})[stat.label]||stat.label),el('dd','',stat.value??'—'));stats.append(row);});if(other.length)wrap.append(stats);body.append(wrap);
  }
  function renderEnemies(){enemyVariants=window.EnemyVariants.summarize(cache.enemies.enemies);
    const root=$('guide-root'),head=intro('敌怪图鉴','按敌怪类型、地区和地图时间线查找。');head.classList.add('reference-heading');root.replaceChildren(head);
    const tools=el('div','guide-tools enemy-tools reference-toolbar'),search=toolbar('搜索敌怪名称或特点',enemyQuery,event=>{enemyQuery=event.target.value;drawEnemies();}),searchLabel=el('label','reference-field');searchLabel.append(el('span','','名称或特点'),search);tools.append(searchLabel);
    function filter(label,entries,value,change){const select=el('select');select.setAttribute('aria-label',label);for(const [id,name] of entries){const option=el('option','',name);option.value=id;select.append(option);}select.value=value;select.onchange=()=>change(select.value);const field=el('label','reference-field');field.append(el('span','',label),select);tools.append(field);return select;}
    filter('敌怪类型',[['all','全部类型'],...['普通怪物','首领敌人','动物','特殊对象','暂未分类'].map(name=>[name,name])],enemyCategory,value=>{enemyCategory=value;drawEnemies();});
    filter('地图地区',[['all','全部地区'],...new Set(cache.enemies.enemies.flatMap(enemy=>enemy.regions||[]))].map(value=>Array.isArray(value)?value:[value,value]).concat([['unknown','地区未标注']]),enemyRegion,value=>{enemyRegion=value;enemyMap='all';renderEnemies();$('guide-root').querySelector('[aria-label="地图地区"]').focus({preventScroll:true});});
    const labels=Object.values(cache.enemies.mapLabels||{}).filter(map=>enemyRegion==='all'||map.region===enemyRegion);
    filter('地图与时间线',[['all','全部地图与时间线'],...labels.map(map=>[map.id,map.label]),['unknown','地图未标注']],enemyMap,value=>{enemyMap=value;drawEnemies();});
    root.append(tools);const count=el('p','result-count reference-count');count.id='enemy-count';count.setAttribute('role','status');const grid=el('div','enemy-grid reference-grid');grid.id='enemy-grid';root.append(count,grid);drawEnemies();
  }
  function drawEnemies(){
    const list=cache.enemies.enemies.filter(enemy=>(enemyCategory==='all'||enemy.category===enemyCategory)&&(enemyRegion==='all'||(enemyRegion==='unknown'?!enemy.regions?.length:enemy.regions?.includes(enemyRegion)))&&(enemyMap==='all'||(enemyMap==='unknown'?!enemy.mapIds?.length:enemy.mapIds?.includes(enemyMap)))&&`${enemy.name} ${(enemy.aliases||[]).join(' ')} ${enemy.description} ${enemyVariants.get(enemy.id)?.label||''} ${(enemyVariants.get(enemy.id)?.facts||[]).join(' ')}`.toLowerCase().includes(enemyQuery.toLowerCase().trim()));
    $('enemy-count').textContent=`${list.length} / ${cache.enemies.enemies.length} 个敌怪与特殊对象`;$('enemy-grid').replaceChildren();
    if(!list.length)$('enemy-grid').append(el('p','empty','没有匹配对象。试试其他名称或分类。'));
    for(const enemy of list){const variant=enemyVariants.get(enemy.id);const card=link('',`#enemy/${encodeURIComponent(enemy.id)}`);card.className='enemy-card reference-card reference-enemy-card';if(enemy.image)card.append(window.Wiki.art(enemy.image,'enemy-art'));card.append(el('h2','',enemy.name));if(enemy.category&&enemy.category!=='暂未分类')card.append(el('p','muted',enemy.category));const locations=(enemy.mapLabels||[]).map(map=>map.label).filter(Boolean).join(' / ');if(locations)card.append(el('p','enemy-location',locations));if(variant){const info=el('div','enemy-variant');info.append(el('span','',variant.facts.join(' · ')));card.insertBefore(info,card.querySelector('.muted'));} $('enemy-grid').append(card);}
  }
  function showEnemy(e){
    selectedEnemy=e.id;const body=detail(e.name,'敌怪图鉴','enemy:'+e.id);body.classList.add('reference-detail');document.title=`${e.name} | 查无此地敌怪图鉴`;
    const head=el('div','reference-heading reference-detail-heading');head.append(...body.childNodes);body.append(head);
    if(e.category&&e.category!=='暂未分类')body.append(el('p','detail-tag',e.category));if(e.description)body.append(el('p','description',e.description));
    const profile=el('section',e.image?'enemy-profile':'enemy-profile enemy-profile-no-art'),stats=el('div','enemy-profile-stats');if(e.image)profile.append(window.Wiki.art(e.image,'enemy-detail-art'));heading(stats,'基础属性');enemyProtection(stats,e);profile.append(stats);body.append(profile);
    const article=link('打开完整攻略页','/enemies/'+encodeURIComponent(e.id)+'/');article.className='static-guide-link';const guideActions=el('div','reference-actions');guideActions.append(article);head.append(guideActions);
    const videoGuide=window.EnemyGuideVideos.forEnemy(e.id);
    if(videoGuide){
      const {bvid,title:videoTitle,seconds}=videoGuide,video=el('section','enemy-video-guide'),fold=el('details','enemy-video'),summary=el('summary'),title=link(videoTitle,'https://www.bilibili.com/video/'+bvid+'/');
      title.target='_blank';title.rel='noopener noreferrer';fold.dataset.bilibiliBvid=bvid;summary.append(title,el('span','enemy-video-expand','展开观看'),el('span','enemy-video-collapse','收起视频'));
      const author=el('p','guide-note'),credit=link(window.EnemyGuideVideos.author.name,window.EnemyGuideVideos.author.url);credit.target='_blank';credit.rel='noopener noreferrer';author.append(credit,document.createTextNode(' · '+window.EnemyGuideVideos.durationText(seconds)));
      const fallback=el('p','guide-note'),external=title.cloneNode(true);external.textContent='前往 B 站观看';fallback.append(external);heading(video,'视频攻略');fold.append(summary,author,el('div','enemy-video-player'),fallback);video.append(fold);body.append(video);
    }
    if(e.spawn?.length||e.mapIds?.length){heading(body,'出没与生成');lines(body,e.spawn);if(e.mapIds?.length){const related=el('div','related-links');e.mapIds.forEach(id=>{const label=cache.enemies.mapLabels?.[id]?.label||e.mapNames?.[id];if(label)related.append(link('查看地图 · '+label,'#maps/'+encodeURIComponent(id)));});if(related.childElementCount)body.append(related);}}
    const actions=enemyActionFacts(e);if(actions.length){heading(body,'行动机制');lines(body,actions);}enemyAttacks(body,e);const facts=(e.combatFacts||[]).map(text=>enemyFactTemplates.get(text)||text).filter(text=>!actions.includes(text));if(facts.length){heading(body,'战斗特点');lines(body,facts);}
    [['装备生成',e.equipmentPools],['随身物资',e.inventoryPools],['额外战利品',e.dropPools]].forEach(([title,pools])=>{
      const populated=(pools||[]).filter(pool=>(pool.candidates||pool.items||[]).length);if(!populated.length)return;heading(body,title);
      populated.forEach(pool=>{const group=el('details','loot-pool');group.append(el('summary','',pool.title||pool.name||title));(pool.candidates||pool.items||[]).forEach(c=>{const row=el('div','loot-row');if(c.itemIds?.length)c.itemIds.forEach(id=>row.append(itemLink(id,c.name)));else if(c.id)row.append(itemLink(c.id,c.name));else row.append(el('span','',c.name||''));const rate=enemyLootRate(c);if(rate)row.append(el('span','loot-rate',rate));if(c.quantityText)row.append(el('span','muted',c.quantityText));if(c.components?.length){const comp=el('div','components');c.components.forEach(c=>comp.append(component(c)));row.append(comp);}group.append(row);});body.append(group);});
    });
  }
  function renderMirror(){const root=$('guide-root');root.replaceChildren(intro('迷失镜柜','投入由原版堆叠、售价倍率、腐化与装备子件估价决定，再向上取整。达到 500 才能兑换；成功兑换清空全部投入，不找零。'));root.append(el('p','guide-note','一次兑换至少生成一单位的理论概率；奖励可能同时包含多种物品，各项概率不能相加。'));root.querySelector('.guide-heading').classList.add('reference-heading','mirror-heading');const tiers=el('div','tier-grid mirror-tiers');cache.mirror.tiers.forEach(t=>{const box=el('div','tier-card');box.append(el('h2','',t.name),el('p','',t.rangeText || t.range || (t.maxValueExclusive?t.minValue+'–'+(t.maxValueExclusive-1):t.minValue+'以上')),el('p','muted',t.description||''));tiers.append(box);});const search=toolbar('搜索镜柜可得物品',mirrorQuery,e=>{mirrorQuery=e.target.value;drawMirror();});search.classList.add('mirror-tools','reference-toolbar');root.append(tiers,search);const count=el('p','result-count reference-count');count.id='mirror-count';const wrap=el('div','table-scroll mirror-table');wrap.id='mirror-table';root.append(count,wrap);drawMirror();lines(root,cache.mirror.notes);}
  function drawMirror(){const ms=cache.mirror.items.filter(i=>Object.values(i.tiers).some(t=>t.chancePct>0)&&`${i.name} ${i.id}`.toLowerCase().includes(mirrorQuery.toLowerCase().trim()));$('mirror-count').textContent=`${ms.length} 种可获得物品`;$('mirror-table').replaceChildren();const table=el('table','guide-table'),head=el('tr');['物品','低档 · 500–4,999','中档 · 5,000–14,999','高档 · 15,000+'].forEach(t=>{const th=el('th','',t);th.scope='col';head.append(th);});const thead=el('thead');thead.append(head);table.append(thead);const tbody=el('tbody');ms.forEach(i=>{const tr=el('tr'),td=el('td');td.append(itemLink(i.id,i.name));tr.append(td);['low','mid','high'].forEach(k=>{const t=i.tiers[k],cell=el('td');cell.append(el('strong','',percent(t?.chancePct)),el('small','',t?.chancePct>0?quantity(t):'不产出'));tr.append(cell);});tbody.append(tr);});table.append(tbody);$('mirror-table').append(table);if(!ms.length)$('mirror-table').append(el('p','empty','没有匹配物品。'));}
  function quantity(t){if(t.quantityText)return t.quantityText;const r=t.quantityRange;return Array.isArray(r)?`可能数量 ${r[0]}–${r[1]}`:'';}
  function enemyLinkName(name,route){if(!route.startsWith('#enemy/'))return name;try{const label=window.EnemyVariants.recordedLabel(decodeURIComponent(route.slice(7)));return name+(label?' · '+label:'');}catch{return name;}}
  function enhanceItem(body,item,detailsOnly=false){window.Corruption?.enhanceItem(body,item,detailsOnly);window.NpcRecipes?.enhanceItem(body,item,detailsOnly);const isEA=window.Wiki.data.meta.edition==='EA';const effect=item.useEffects || (!isEA&&cache.consumables?.items.find(x=>x.id===item.id));if(effect){const wrap=el('section','use-effects');heading(wrap,'使用效果');if(effect.immediate?.length){wrap.append(el('h4','','立即或使用时生效'));lines(wrap,effect.immediate.map(x=>x.text));}if(effect.buffs?.length){wrap.append(el('h4','','持续效果'));effect.buffs.forEach(b=>{const box=el('div','buff-card');box.append(el('strong','',b.name),el('span','buff-time',b.durationText||`${b.durationSeconds} 秒`));lines(box,b.effects);if(b.stacking)box.append(el('p','guide-note',b.stacking));lines(box,b.conditions);wrap.append(box);});}lines(wrap,effect.conditions);lines(wrap,(effect.notes||[]).filter(note=>note!=='随机内容与腐化状态取决于原版生成规则，不显示未经核准的概率。'));body.insertBefore(wrap,body.querySelector('h3'));}
    if(detailsOnly)return;
    const mir=item.mirror || (!isEA&&cache.mirror?.items.find(x=>x.id===item.id)?.tiers);if(mir&&Object.values(mir).some(t=>t.chancePct>0)){heading(body,'原版镜柜随机兑换');const table=el('table','guide-table');['low','mid','high'].forEach((k,i)=>{const t=mir[k],row=el('tr');row.append(el('th','',['低档 · 500–4,999','中档 · 5,000–14,999','高档 · 15,000+'][i]),el('td','',`${percent(t?.chancePct)}${t?.chancePct>0?' · '+quantity(t):' · 不产出'}`));table.append(row);});body.append(table,link('查看完整兑换表与规则','#mirror'));}
    if(item.guideLinks?.length){heading(body,'相关攻略');const wrap=el('div','related-links');item.guideLinks.forEach(x=>wrap.append(link(enemyLinkName(x.name,x.route),x.route)));body.append(wrap);}
  }
  async function routeContent(){guideDialog?.close(false);if(!window.Wiki.data)return;const n=++serial;let parts;try{parts=location.hash.slice(1).split('/').map(decodeURIComponent);}catch{parts=['invalid'];}const kind=parts[0]||'home';
    if(detailOrigin&&location.hash===detailOrigin.hash){restoreDetail();return;}
    if(kind==='item'){window.WikiNavigation.sync(page);return;}
    try{
    if(detailOrigin&&kind==='enemy'){await load('enemies');if(n===serial){const enemy=cache.enemies.enemies.find(x=>x.id===parts[1]);if(enemy)showEnemy(enemy);else throw Error('Missing detail');}return;}
    if(detailOrigin&&['npc','recipe'].includes(kind)){await window.NpcRecipes.mount($('guide-root'),{kind:kind==='npc'?'npcs':'recipes',id:parts[1],isCurrent:()=>n===serial,overlayOnly:true});return;}
    if(detailOrigin&&kind==='affix'){await window.Corruption.mount($('guide-root'),{affixId:parts[1],overlayOnly:true,isCurrent:()=>n===serial});return;}

    }catch{if(n===serial){const body=detail('资料暂时无法读取','攻略资料');body.append(el('p','status error','请关闭后重试。'));}return;}
    if(kind==='enemy'&&page==='enemies'&&$('enemy-grid')){const enemy=cache.enemies?.enemies.find(x=>x.id===parts[1]);if(enemy){showEnemy(enemy);return;}}
    if((kind==='npc'&&page==='npcs'||kind==='recipe'&&page==='recipes')&&$('guide-root').querySelector('.npc-recipe-heading')){await window.NpcRecipes.mount($('guide-root'),{kind:page,id:parts[1],isCurrent:()=>n===serial});return;}
    if(kind==='affix'&&page==='corruption'&&$('guide-root').querySelector('.corruption-categories')){await window.Corruption.mount($('guide-root'),{affixId:parts[1]});return;}
    if(!['enemy','item','affix','npc','recipe'].includes(kind))detailOrigin=null;
    feedbackMount?.dispose();feedbackMount=null;const target=kind==='mechanic'?'mechanics':kind==='quest'?'quests':kind==='enemy'?'enemies':kind==='affix'?'corruption':kind==='npc'?'npcs':kind==='recipe'?'recipes':kind==='item'?page:kind;
    if(target!=='quests'&&kind!=='item'){suppliesDrawer?.dispose();suppliesDrawer=null;}if(target!=='workshop'){workshopMount?.dispose();workshopMount=null;}if(target!=='maps'||kind==='item'){mapMount?.dispose();mapMount=null;}if(target!=='quests'&&kind!=='item')cancelQuestWheel();document.body.classList.toggle('quest-immersive',target==='quests'||kind==='item'&&page==='quests');if(kind==='item'){if(!['quests','enemies','mirror','corruption','npcs','recipes','loot'].includes(page))page='items';$('item-page').hidden=page!=='items';$('guide-root').hidden=page==='items';window.WikiNavigation.sync(page);return;}
    if($('detail').open)$('detail').close();if(page==='loot'&&target==='loot'&&$('guide-root').querySelector('.loot-containers')&&parts[1]===$('guide-root').dataset.lootMapId&&(!parts[2]||window.WikiLoot.focus($('guide-root'),parts[2]))){return;}if(page==='quests'&&target==='quests'&&$('quest-sidebar')){if(kind==='quest'){const m=cache.quests.missions.find(x=>x.id===parts[1]);if(m){if(m.id!==selectedQuest||!$('quest-detail-title'))showQuest(m);}else showUnavailableQuest(parts[1]);}else{clearQuest(false);if(parts[1]==='guide')showQuestGuide();}return;}$('guide-root').classList.remove('quest-page','tier-page','mechanics-page','traffic-page');page=Object.hasOwn(titles,target)?target:'items';Guide.baseRoute=`#${page}`;$('item-page').hidden=page!=='items';$('guide-root').hidden=page==='items';window.WikiNavigation.sync(page);document.title=page==='items'?'查无此地攻略：物品、任务、敌怪与地图 | NSP Wiki':`查无此地${titles[page]} | NSP Wiki`;if(page==='items'){const missing=!['items','catalog',''].includes(kind);$('status').hidden=!missing;if(missing)$('status').textContent='此攻略链接不存在。';return;}
    if(page==='home'){window.WikiNavigation.renderHome($('guide-root'));return;}
    $('guide-root').replaceChildren(el('p','status','正在载入攻略…'));
    if(page==='traffic'){const root=$('guide-root');root.classList.add('traffic-page');await window.WikiTraffic.mount(root);return;}
    if(page==='mechanics'){try{await window.WikiMechanics.mount($('guide-root'),kind==='mechanic'?parts[1]:parts[1]==='status'?'status/'+parts[2]:null,()=>n===serial);}catch(error){if(n===serial)$('guide-root').replaceChildren(el('p','status error',error.message));}return;}
    if(page==='loot'){try{const data=await load('container-loot');if(n===serial)window.WikiLoot.mount($('guide-root'),data,{mapId:parts[1],containerId:parts[2]});}catch(error){if(n===serial)$('guide-root').replaceChildren(el('p','status error','搜刮资料载入失败，请刷新重试。'));}return;}
    if(page==='updates'){try{const data=await load('updates');if(n===serial)window.WikiUpdates.render($('guide-root'),data);}catch{if(n===serial)$('guide-root').replaceChildren(el('p','status error','更新档案载入失败，请刷新重试。'));}return;}
    if(['npcs','recipes'].includes(page)){try{await window.NpcRecipes.mount($('guide-root'),{kind:page,id:['npc','recipe'].includes(kind)?parts[1]:undefined,isCurrent:()=>n===serial});}catch(error){if(n===serial)$('guide-root').replaceChildren(el('p','status error',error.message));}return;}
    if(page==='tiers'){window.ItemTiers.mount(document.getElementById('guide-root'));return;}
    if(page==='feedback'){feedbackMount=window.WikiFeedback.mount($('guide-root'),parts[1]||null);return;}
    if(page==='workshop'){
      workshopMount?.dispose();workshopMount=null;
      try{
        const module=await import('./workshop.js');
        if(n!==serial||page!=='workshop')return;
        workshopMount=module.mountWorkshop($('guide-root'));
        await workshopMount.ready;
      }catch(error){if(n===serial)$('guide-root').replaceChildren(el('p','status error','工坊载入失败：'+error.message));}
      return;
    }
    if(page==='maps'){
      mapMount?.dispose();mapMount=null;
      try{
        const module=await import('./maps/map-viewer.js');
        if(n!==serial||page!=='maps')return;
        $('guide-root').replaceChildren();
        mapMount=module.mountMapViewer($('guide-root'),{mapId:parts[1]||undefined,dataUrl:new URL('./maps/data/maps.json',location.href).href});
        window.webMap=mapMount;
        await mapMount.ready;
      }catch(e){if(n===serial&&e.name!=='AbortError'&&!mapMount?.metrics().fallback){mapMount?.dispose();mapMount=null;$('guide-root').replaceChildren(el('p','status error','地图载入失败：'+e.message));}}
      return;
    }
    if(page==='corruption'){try{await window.Corruption.mount($('guide-root'),{affixId:kind==='affix'?parts[1]:undefined});}catch{$('guide-root').replaceChildren(el('p','status error','腐化资料载入失败，请刷新重试。'));}return;}
    try{await load(page);if(n!==serial)return;if(page==='quests'){renderQuests();if(kind==='quests'&&parts[1]==='guide')showQuestGuide();}if(page==='enemies')renderEnemies();if(page==='mirror')renderMirror();if(kind==='quest'){const m=cache.quests.missions.find(x=>x.id===parts[1]);if(m){showQuest(m);focusQuest([m.id]);}else showUnavailableQuest(parts[1]);}if(kind==='enemy'){const e=cache.enemies.enemies.find(x=>x.id===parts[1]);if(e)showEnemy(e);else{const old=cache.enemies.archivedEnemies?.find(x=>x.id===parts[1]);$('guide-root').prepend(el('p','status error',old?old.name+'：'+old.reason:'此敌怪链接不存在。'));}}}catch{if(n===serial)$('guide-root').replaceChildren(el('p','status error','攻略资料载入失败，请刷新重试。'));}}
  let routeStarted=false;
  async function route(){
    const previous=page,first=!routeStarted;routeStarted=true;window.WikiNavigation.cancelPageTransition();
    const pending=routeContent(),ticket=serial;await pending;
    if(ticket===serial&&!first&&page!==previous)window.WikiNavigation.enterPage(page);
  }
  const Guide=window.Guide={route,enhanceItem,restoreFocus,restoreDetail,focusSearch:()=>(page==='items'?$('search'):$('guide-root').querySelector('input'))?.focus(),baseRoute:'#items'};
  window.addEventListener('wiki-ready',route);
  document.addEventListener('visibilitychange',()=>{document.documentElement.classList.toggle('page-background',document.hidden);if(document.hidden)cancelQuestWheel();});
  document.addEventListener('click',e=>{const a=e.target.closest('#quest-sidebar a[href^="#item/"]');if(a)questItemOrigin=a.getAttribute('href');});
  window.addEventListener('keydown',e=>{if(e.key==='Escape'&&!e.defaultPrevented&&page==='quests'&&selectedQuest&&!$('detail').open&&!$('quest-supplies')?.open){e.preventDefault();clearQuest(true);}});
  window.addEventListener('resize',()=>{if(page==='quests')syncQuestTransform();});
})();
