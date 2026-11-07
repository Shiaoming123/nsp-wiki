(() => {
  'use strict';
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
  const api={status,versionNote,entryLabel,parts,appendRich,render};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')window.QuestGuide=api;
})();
