(() => {
  'use strict';
  // Entries are alternatives; completion rewards and activation gates alone prove completion.
  function entries(mission, edges) {
    const list=(mission.activationGroups||[]).map((group,index)=>({key:'group:'+index,group}));
    edges.filter(e=>e.to===mission.id&&e.kind==='reward-add-mission').forEach((edge,index)=>list.push({key:'reward:'+index,edge}));
    if(list.length&&mission.triggers?.some(t=>t.role==='activation'&&(['recycle','document-rule','map-mission'].includes(t.type)||t.type==='native-caller'&&t.status==='CONFIRMED_CURRENT_CALLER'||t.type==='activation-rule'&&t.activationType==='TalkNPC')))list.push({key:'independent'});
    return list;
  }
  function satisfied(entry, completed) {
    if(entry.edge)return entry.edge.rewardPhase==='finReward'&&completed.has(entry.edge.from);
    const g=entry.group;if(!g||!Array.isArray(g.members))return false;
    return g.gate==='ANY'?g.members.some(id=>completed.has(id)):g.gate==='ALL'&&g.members.length>0&&!g.pending?.length&&g.members.every(id=>completed.has(id));
  }
  function plan(data, target, completed, selections={}) {
    const byId=new Map(data.missions.map(m=>[m.id,m])),choices=new Map(),warnings=new Set();
    if(!byId.has(target))return {ids:[],choices:[],warnings:['任务资料不存在。']};
    const name=id=>byId.get(id)?.name||'未公开任务';
    function walk(id,path) {
      if(completed.has(id))return {ids:[],safe:true};
      if(path.includes(id)){warnings.add('发现循环关系，相关前置不自动推断。');return {ids:[],safe:false};}
      const m=byId.get(id);if(!m){warnings.add('存在未公开前置，未自动标记。');return {ids:[],safe:false};}
      const own=[id], next=[...path,id];
      if(m.pendingDependencies?.length){warnings.add(name(id)+'：有待核实依赖，不继续推断它的前置。');return {ids:own,safe:true};}
      const options=entries(m,data.edges), key=id+':entry';let entry;
      if(options.some(e=>satisfied(e,completed)))return {ids:own,safe:true};
      if(options.length>1){
        const selected=selections[key];
        choices.set(key,{key,title:name(id)+' · 接取路径',options:options.map(e=>({value:e.key,label:e.group?'前置条件 '+(e.group.gate==='ANY'?'（任选其一）':'（全部）'):e.edge?name(e.edge.from)+(e.edge.rewardPhase==='finReward'?' · 完成奖励':' · 事前补给'):'独立接取，不补标前置'}))});
        entry=options.find(e=>e.key===selected);if(!entry)return {ids:own,safe:true};
      }else entry=options[0];
      if(!entry||entry.key==='independent')return {ids:own,safe:true};
      let parents=[];
      if(entry.edge){if(entry.edge.rewardPhase!=='finReward'){warnings.add(name(id)+'：事前发放不能证明父任务已完成。');return {ids:own,safe:true};}parents=[entry.edge.from];}
      else {
        const g=entry.group;
        if(!['ALL','ANY'].includes(g.gate)){warnings.add(name(id)+'：前置规则待核实。');return {ids:own,safe:true};}
        if(g.gate==='ANY'){
          const branchKey=id+':'+entry.key,selected=selections[branchKey];
          const options=g.members.map(member=>({value:member,label:name(member)}));
          if(g.pending?.length)options.push({value:'pending',label:'待核实分支，不补标前置'});
          choices.set(branchKey,{key:branchKey,title:name(id)+' · 选择实际完成的分支',options});
          if(!options.some(o=>o.value===selected)||selected==='pending')return {ids:own,safe:true};
          parents=[selected];
        }else {parents=g.members;if(g.pending?.length)warnings.add(name(id)+'：未公开依赖未自动标记。');}
      }
      const parts=parents.map(parent=>walk(parent,next));
      return parts.some(p=>!p.safe)?{ids:[],safe:false}:{ids:[...own,...parts.flatMap(p=>p.ids)],safe:true};
    }
    const result=walk(target,[]);
    const pending=[...choices.values()].filter(c=>!c.options.some(o=>o.value===selections[c.key]));
    return {ids:[...new Set([target,...result.ids])].filter(id=>!completed.has(id)),choices:[...choices.values()],unresolved:pending.length,warnings:[...warnings]};
  }
  const api={entries,satisfied,plan};if(typeof window!=='undefined')window.QuestProgress=api;if(typeof module!=='undefined')module.exports=api;
})();
