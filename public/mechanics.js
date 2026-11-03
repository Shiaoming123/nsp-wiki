(() => {
  'use strict';
  const make=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
  const statTerms={hp:'maximum-health',defense:'defense',stiffness:'impact-absorption',toughness:'puncture-deflection',hardness:'slash-resistance',stable:'phase-shift',impact:'impact-damage',puncture:'puncture-damage',slash:'slash-damage',disintegrate:'disintegration-damage',trueDamage:'true-damage',defPenetrat:'defense-penetration',spreadInit:'initial-spread',spread:'spread-growth',spreadLimit:'spread-limit',recoil:'recoil',reload:'reload-time',penetrate:'projectile-penetration'};
  let request,statusRequest,shortDialog;
  const fmt=n=>Number(n.toFixed(3)).toLocaleString('zh-CN',{maximumFractionDigits:3});
  function load(){return request||=(fetch('/data/mechanics.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('机制手册暂时无法读取');return r.json();}).then(data=>{if(data.schemaVersion!==1||!Array.isArray(data.mechanics))throw Error('机制资料格式不正确');return data;}).catch(error=>{request=null;throw error;}));}
  function loadStatuses(){return statusRequest||=(fetch('/data/status-effects.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('状态资料暂时无法读取');return r.json();}).then(data=>{if(data.schemaVersion!==1||!Array.isArray(data.statuses))throw Error('状态资料格式不正确');return data;}).catch(error=>{statusRequest=null;throw error;}));}
  function statusContent(root,status){
    const entry=make('details','mechanic-status');entry.id='status-'+status.id;const summary=make('summary'),icon=make('span','status-icon');
    if(status.icon){const img=make('img');img.src='/'+status.icon;img.alt='';img.width=32;img.height=32;img.loading='lazy';icon.append(img);}else{icon.textContent='—';icon.setAttribute('aria-label','无图标');}
    summary.append(icon,make('strong','',status.name),make('span','status-preview',[status.scope,status.summary].filter(Boolean).join(' · ')));entry.append(summary);const body=make('div','status-body');
    for(const [title,value]of [['效果',status.effects],['持续时间',status.duration],['叠加与刷新',status.stacking],['如何解除',status.removal],['常见来源',status.sources]]){const row=make('div','status-fact'),content=make('div');row.append(make('strong','',title),content);if(Array.isArray(value)){const ul=make('ul');value.forEach(v=>ul.append(make('li','',v)));content.append(ul);}else content.textContent=value;body.append(row);}entry.append(body);root.append(entry);return entry;
  }
  function list(body,title,values){if(!values?.length)return;body.append(make('h3','',title));const ul=make('ul','mechanic-lines');values.forEach(v=>ul.append(make('li','',v)));body.append(ul);}
  function link(label,id){const a=make('a','inline-link',label);a.href='/#mechanic/'+encodeURIComponent(id);return a;}
  async function explain(id,trigger){
    shortDialog?.close();const originHash=location.hash,dialog=make('dialog','mechanic-short-dialog');shortDialog=dialog;const navigation=()=>dialog.close();window.addEventListener('hashchange',navigation);dialog.setAttribute('aria-labelledby','mechanic-short-title');const top=make('div','mechanic-short-top'),title=make('h2','','属性解释');title.id='mechanic-short-title';const close=make('button','close-button','×');close.type='button';close.setAttribute('aria-label','关闭属性解释');close.onclick=()=>dialog.close();top.append(title,close);const content=make('div','','正在读取…');dialog.append(top,content);document.body.append(dialog);dialog.addEventListener('close',()=>{window.removeEventListener('hashchange',navigation);dialog.remove();if(shortDialog===dialog)shortDialog=null;if(location.hash===originHash&&trigger?.isConnected)trigger.focus({preventScroll:true});},{once:true});dialog.showModal();
    try{const data=await load();if(!dialog.isConnected)return;const term=data.mechanics.find(t=>t.id===id);if(!term)throw Error('此属性的说明仍待补充');title.textContent=term.name;content.replaceChildren(make('p','',term.summary));if(term.appliesTo?.length)content.append(make('p','guide-note','适用：'+term.appliesTo.join('、')));if(term.doesNotApplyTo?.length)content.append(make('p','guide-note','注意：'+term.doesNotApplyTo.join('；')));const a=link('查看计算与示例 ↗',id);a.addEventListener('click',()=>dialog.close());content.append(a);}catch(error){if(dialog.isConnected)content.textContent=error.message;}
  }
  function decorate(row,key){const id=statTerms[key],label=row.querySelector('.native-stat-label');if(!id||!label||label.querySelector('button'))return;const b=make('button','stat-definition',label.textContent);b.type='button';b.setAttribute('aria-label','了解'+label.textContent);b.onclick=()=>explain(id,b);label.replaceChildren(b);}
  function install(root){root.querySelectorAll('.native-stat[data-stat]').forEach(row=>decorate(row,row.dataset.stat));}
  function demo(root,term){
    if(!term.calculator)return;const config=term.calculator,values=Object.fromEntries(config.parameters.map(p=>[p.key,p.default]));Object.assign(values,term.presets[0]?.inputs);
    const wrap=make('section','mechanic-demo');wrap.append(make('h2','','自己试一试'),make('p','guide-note',config.kind==='damage-defense'?'输入伤害与防护数值，查看各步减伤。':'观察下一次射击的散布范围。触发次数不包含两次触发之间的恢复。'));
    const presets=make('div','mechanic-presets'),explanation=make('p','mechanic-example-note');
    const form=make('form','mechanic-inputs'),main=make('div','mechanic-input-fields'),advanced=make('details','mechanic-advanced'),advancedFields=make('div','mechanic-input-fields');advanced.append(make('summary','','更多条件'),advancedFields);form.append(main,advanced);form.onsubmit=e=>e.preventDefault();
    const fields=new Map(),controls=new Map(),result=make('div','mechanic-result'),error=make('p','status error');error.setAttribute('role','status');result.setAttribute('aria-live','polite');
    function arrange(example){const primary=new Set(Object.keys(example.inputs));if(config.kind==='spread'){primary.add('initialSpread');primary.add('growth');primary.add('limit');primary.add('shotCount');}for(const[key,field]of fields)(primary.has(key)?main:advancedFields).append(field);}
    function draw(){
      try{
        const answer=window.MechanicsCalc.calculateMechanic(config.kind,values);error.textContent='';result.replaceChildren();
        if(config.kind==='damage-defense'){
          const names={impact:'冲击',puncture:'穿刺',slash:'切割',disintegrate:'瓦解',trueDamage:'真实'},keys=Object.keys(names),sum=x=>keys.reduce((n,k)=>n+(x[k]||0),0),before=Object.fromEntries(keys.map(k=>[k,values[k]||0])),stages=[['这一击',before],['类型防护后',answer.afterResistance],['防御后',answer.afterDefense]],scale=Math.max(1,...stages.map(([,x])=>sum(x)));
          const diagram=make('div','damage-diagram');diagram.setAttribute('aria-label','各阶段剩余伤害');
          for(const[label,damage]of stages){const row=make('div','damage-stage'),track=make('div','damage-track');for(const key of keys){if(damage[key]<=0)continue;const segment=make('span','damage-segment damage-'+key);segment.style.width=(damage[key]/scale*100)+'%';segment.title=names[key]+'伤害 '+fmt(damage[key])+' 点';segment.setAttribute('aria-label',segment.title);track.append(segment);}row.append(make('span','',label),track,make('strong','',fmt(sum(damage))));diagram.append(row);}
          result.append(diagram);const legend=make('p','damage-legend');for(const key of keys)if(stages.some(([,x])=>x[key]>0))legend.append(make('span','damage-key damage-'+key,names[key]));result.append(legend);
          const total=make('p','mechanic-total');total.append(make('span','','本例计算结果 '),make('strong','',fmt(answer.total)),make('span','',' 点'));result.append(total);
        }else{
          const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 280 150');svg.setAttribute('role','img');svg.setAttribute('aria-label','散布角范围示意');svg.classList.add('spread-diagram');const angle=Math.min(85,answer.halfAngleDegrees)*Math.PI/180,x=Math.sin(angle)*112,y=128-Math.cos(angle)*112;
          const fan=document.createElementNS(svg.namespaceURI,'path');fan.setAttribute('d',`M140 128 L${140-x} ${y} A112 112 0 0 1 ${140+x} ${y} Z`);fan.setAttribute('fill','currentColor');fan.setAttribute('fill-opacity','.25');fan.setAttribute('stroke','currentColor');svg.append(fan);result.append(svg,make('p','mechanic-total','左右各 '+fmt(answer.halfAngleDegrees)+'°'),make('p','guide-note','总散布角范围 '+fmt(answer.fullAngleDegrees)+'°'+(answer.halfAngleDegrees>85?'；大角度在图中收拢示意，请以数值为准。':'')));
        }
      }catch(e){error.textContent=e.message;result.replaceChildren(make('p','guide-note','请检查输入后继续试算。'));}
    }
    for(const param of config.parameters){
      const label=make('label','mechanic-field',param.label+(param.unit?'（'+param.unit+'）':''));let input;
      if(param.type==='select'){input=make('select');for(const option of param.options){const o=make('option','',option.label);o.value=option.value;input.append(o);}}
      else{input=make('input');input.type=param.type==='boolean'?'checkbox':'number';if(input.type==='number'){input.step=param.type==='integer'?'1':'any';if(param.min!==undefined)input.min=param.min;if(param.max!==undefined)input.max=param.max;}}
      input.setAttribute('aria-label',param.label);if(param.type==='boolean')input.checked=values[param.key];else input.value=values[param.key];
      input.oninput=()=>{if(param.type==='boolean')values[param.key]=input.checked;else if(param.type==='select')values[param.key]=input.value;else values[param.key]=input.value.trim()===''?NaN:Number(input.value);presets.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed','false'));explanation.textContent='自定义条件';draw();};label.append(input);fields.set(param.key,label);controls.set(param.key,input);
    }
    term.presets.forEach((example,i)=>{const button=make('button','secondary-button',example.title);button.type='button';button.setAttribute('aria-pressed',String(i===0));button.onclick=()=>{for(const p of config.parameters){values[p.key]=example.inputs[p.key]??p.default;const c=controls.get(p.key);if(p.type==='boolean')c.checked=values[p.key];else c.value=values[p.key];}presets.querySelectorAll('button').forEach((b,j)=>b.setAttribute('aria-pressed',String(i===j)));explanation.textContent=example.explanation;arrange(example);draw();};presets.append(button);});
    const adjustable=config.kind==='damage-defense'?Object.keys(term.presets[0]?.inputs||{}).find(k=>['defense','stable','hardness','stiffness','toughness'].includes(k)):'growth';
    if(adjustable){const param=config.parameters.find(p=>p.key===adjustable),label=make('label','mechanic-slider','拖动调整'+param.label+'（0–40）'),slider=make('input');slider.type='range';slider.min='0';slider.max='40';slider.step='.5';slider.value=values[adjustable];slider.setAttribute('aria-label','拖动调整'+param.label);slider.oninput=()=>{controls.get(adjustable).value=slider.value;controls.get(adjustable).dispatchEvent(new Event('input'));};label.append(slider);form.append(label);controls.get(adjustable).addEventListener('input',()=>slider.value=Math.max(0,Math.min(40,Number(values[adjustable])||0)));presets.addEventListener('click',()=>slider.value=Math.max(0,Math.min(40,Number(values[adjustable])||0)));}
    const workspace=make('div','mechanic-demo-workspace'),inputPanel=make('section','mechanic-input-panel'),outputPanel=make('section','mechanic-output-panel');
    inputPanel.append(make('h3','mechanic-panel-title','输入条件'),form,error);outputPanel.append(make('h3','mechanic-panel-title','试算结果'),result);workspace.append(inputPanel,outputPanel);
    explanation.textContent=term.presets[0]?.explanation||'';arrange(term.presets[0]||{inputs:{}});wrap.append(presets,explanation,workspace);root.append(wrap);draw();
  }
  function skillTable(term){
    const section=make('section','skill-progression'),table=make('table'),caption=make('caption','','逐级所需经验'),head=make('thead'),titles=make('tr'),body=make('tbody');
    for(const label of ['技能','1级','2级','3级','4级']){const cell=make('th','',label);cell.scope='col';titles.append(cell);}head.append(titles);table.append(caption,head,body);
    for(const skill of term.skillRows){const row=make('tr'),name=make('th','',skill.name);name.scope='row';row.append(name);for(const value of skill.levels)row.append(make('td','',String(value)));body.append(row);}
    section.append(table,make('p','guide-note','每次升级扣除该级门槛，不是累计经验。'));return section;
  }
  function termContent(root,data,term){
    const back=make('a','inline-link','← 机制手册');back.href='/#mechanics';const heading=make('header','mechanic-heading');heading.append(back,make('p','kicker',term.category),make('h1','',term.name),make('p','mechanic-summary',term.summary));root.append(heading);
    const scope=make('div','mechanic-scope');list(scope,'什么时候有效',term.appliesTo);list(scope,'容易误解的地方',term.doesNotApplyTo);root.append(scope);
    if(term.id==='phase-shift'){const hat=data.mechanics.find(t=>t.id==='magic-hat-three'),example=make('section','mechanic-equipment-example');example.id='magic-hat-example';example.append(make('h2','','以“窗口牌”魔法帽为例'),make('p','',hat.summary),make('p','',hat.formula.text),make('p','',hat.appliesTo.join('；')+'。'),make('p','guide-note','注意：'+hat.doesNotApplyTo.join('；')+'。'));const item=make('a','inline-link','查看魔法帽属性 ↗');item.href='/#item/gear_helmet_windowMagicHat';example.append(item);root.append(example);}
    if(term.skillRows?.length)root.append(skillTable(term));
    if(term.id==='corruption'){const a=make('a','inline-link','查看腐化词条 ↗');a.href='/#corruption';root.append(a);}
    demo(root,term);
    if(!term.calculator&&term.presets?.length){const examples=make('ul','mechanic-examples');for(const p of term.presets){const li=make('li');li.append(make('strong','',p.title+'：'),document.createTextNode(p.explanation||p.description||''));examples.append(li);}root.append(make('h2','','举个例子'),examples);}
    const formula=make('details','mechanic-formula');formula.append(make('summary','','展开计算方式与适用条件'),make('p','',term.formula.text));const ol=make('ol');term.formula.steps.forEach(s=>ol.append(make('li','',s)));formula.append(ol);list(formula,'计算条件',term.formula.limits);if(term.calculator)list(formula,'试算条件',term.calculator.rules);root.append(formula);
  }
  async function mount(root,id,isCurrent=()=>true){
    const data=await load();if(!root.isConnected||!isCurrent())return;root.replaceChildren();root.classList.add('mechanics-page');
    const statusId=id?.startsWith('status/')?id.slice(7):null;
    if(id&&!statusId){const term=data.mechanics.find(t=>t.id===(id==='magic-hat-three'?'phase-shift':id));if(!term){const back=make('a','inline-link','返回机制手册');back.href='/#mechanics';root.append(make('h1','','没有找到这条机制说明'),back);return;}termContent(root,data,term);if(id==='magic-hat-three'&&isCurrent())root.querySelector('#magic-hat-example')?.scrollIntoView({behavior:'instant',block:'start'});return;}
    const heading=make('header','mechanic-heading');heading.append(make('p','kicker','配装与机制 / 机制手册'),make('h1','','看懂属性，再做选择'),make('p','intro-copy','点开一个名词，看它影响什么，再用例子试一试。'));root.append(heading);
    const input=make('input','mechanic-search');input.type='search';input.placeholder='搜索属性、伤害或增益减益状态…';input.setAttribute('aria-label','搜索机制');const cards=make('div','mechanic-cards');
    const tools=make('div','mechanic-search-tools'),searchLabel=make('label','mechanic-search-field'),count=make('p','mechanic-count');searchLabel.append(make('span','mechanic-search-label','搜索机制与状态'),input);tools.append(searchLabel,count);count.setAttribute('role','status');
    const entries=data.mechanics.filter(t=>t.id!=='magic-hat-three'),hat=data.mechanics.find(t=>t.id==='magic-hat-three');let states;
    function render(){const q=input.value.trim();let visibleTerms=0;cards.replaceChildren();for(const category of [...new Set(entries.map(t=>t.category))]){const found=entries.filter(t=>t.category===category&&[t.name,t.summary,...(t.aliases||[]),...(t.id==='phase-shift'?[hat.name,hat.summary]:[])].some(x=>x.includes(q)));visibleTerms+=found.length;if(!found.length)continue;const section=make('section','mechanic-category');section.append(make('h2','',category));for(const term of found){const a=link(term.name,term.id);a.className='mechanic-card';a.append(make('span','',term.summary));section.append(a);}cards.append(section);}count.textContent='机制 '+visibleTerms+' 条';
      if(states){const found=states.statuses.filter(s=>[s.name,s.summary,...s.effects,...s.sources].some(x=>x.includes(q)));count.textContent+=' · 状态 '+found.length+' 种';if(found.length){const region=make('section','status-effects');region.append(make('h2','','增益与减益状态'));for(const category of ['增益','减益','利弊并存','其他'].filter(c=>found.some(s=>s.category===c))){const group=make('details','status-group'),records=found.filter(s=>s.category===category);group.append(make('summary','',category+' · '+records.length+' 种'));group.open=!!q||records.some(s=>s.id===statusId);for(const s of records){const entry=statusContent(group,s);entry.open=s.id===statusId;}region.append(group);}cards.append(region);}}
      if(!cards.childNodes.length)cards.append(make('p','guide-note mechanic-empty','暂未找到，试试更短的名称。'));}
    input.oninput=render;root.append(tools,cards);render();
    try{states=await loadStatuses();if(!root.isConnected||!isCurrent())return;render();if(statusId){const target=document.getElementById('status-'+statusId);if(target&&root.contains(target))target.scrollIntoView({behavior:'instant',block:'start'});else cards.prepend(make('p','guide-note','此状态条目仍待补充，可按名称搜索其他状态。'));}}catch(error){if(root.isConnected&&isCurrent())root.append(make('p','status error',error.message));}
  }
  function openStaticStatus(){if(!location.hash.startsWith('#status-'))return;let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}const node=document.getElementById(id);if(!node?.classList.contains('mechanic-status'))return;node.open=true;const group=node.closest('.status-group');if(group)group.open=true;node.scrollIntoView({behavior:'instant',block:'start'});}
  function enhance(){install(document);openStaticStatus();window.addEventListener('hashchange',openStaticStatus);for(const node of document.querySelectorAll('[data-mechanic-calculator]'))load().then(data=>{if(!node.isConnected)return;const term=data.mechanics.find(t=>t.id===node.dataset.mechanicCalculator);if(term)demo(node,term);}).catch(()=>{});}
  window.WikiMechanics={skillTable,mount,decorate,install,load,statTerms};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',enhance,{once:true});else enhance();
})();
