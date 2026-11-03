const recoveryKey='nsp-weapon-workshop-recovery-v1';
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export function statDifference(stat,base,reason=''){
  if(reason||stat?.status!=='known'||base?.status!=='known'||!Number.isFinite(stat.value)||!Number.isFinite(base.value))return {value:null,text:reason||'待核实',tone:'neutral'};
  const value=stat.value-base.value,zero=Math.abs(value)<.0000001,direction=typeof stat.barNegative==='boolean'?(stat.barNegative?-1:1):0;
  const tone=zero||!direction?'neutral':value*direction>0?'better':'worse';
  return {value,text:(value>0?'+':'')+(zero?'0.00':value.toFixed(2)),tone};
}
export function comparisonReason(report,base,rules){
  if(report.validation.kind!==base.validation.kind)return '近远程属性不可比';
  if(report.validation.kind==='melee')return '';
  const ammo=r=>r.parts.filter(p=>rules.items[p.itemId]?.typeMask===rules.enums.EquipType.Bullet).map(p=>p.itemId).sort();
  const left=ammo(report),right=ammo(base);
  if(!left.length||!right.length)return '未装弹，有效口径待核实';
  if(JSON.stringify(left)!==JSON.stringify(right))return '不同弹药，仅列绝对值';
  const mask=r=>rules.items[r.build.itemId]?.slotData?.bulletMask;
  if(typeof mask(report)!=='number'||typeof mask(base)!=='number')return '有效口径待核实';
  return mask(report)!==mask(base)?'不同口径范围，仅列绝对值':'';
}
export function createComparisons(model){
  let entries=[],baselineId=null,sequence=0;
  return {get entries(){return entries;},get baselineId(){return baselineId;},
    add(input){const checked=model.revalidateInput(input),entry=freeze({id:String(++sequence),sourceRulesIdentity:input.rulesIdentity,input:checked.input,report:model.capture(checked.input),recalculated:checked.recalculated});entries=[...entries,entry];baselineId||=entry.id;return entry;},
    remove(id){entries=entries.filter(e=>e.id!==id);if(baselineId===id)baselineId=entries[0]?.id||null;},
    baseline(id){if(entries.some(e=>e.id===id))baselineId=id;}};
}
export function createTrialRecovery(storage,model,locks=globalThis.navigator?.locks){
  let previous;
  try{previous=storage.getItem(recoveryKey);}catch{previous=undefined;}
  function parse(raw){
    if(raw===undefined)throw Error('浏览器无法读取恢复快照，当前试装保留。');
    if(raw===null)return null;
    try{const data=JSON.parse(raw);if(data.schemaVersion!==1||!Object.hasOwn(data,'input'))throw Error();return {input:data.input===null?null:model.revalidateInput(data.input).input};}
    catch{throw Error('恢复快照损坏或不兼容，原记录和当前试装保留。');}
  }
  return {read(){if(storage.getItem(recoveryKey)!==previous)throw Error('其他页面已修改恢复快照，请重新进入工坊。');return parse(previous);},async save(input,shouldCommit=()=>true){
    parse(previous);if(!locks)throw Error('当前浏览器不支持安全保存恢复快照，当前试装保留。');
    const checked=input===null?null:model.revalidateInput(input).input,raw=JSON.stringify({schemaVersion:1,input:checked});
    await locks.request(recoveryKey,{mode:'exclusive'},()=>{
      if(!shouldCommit())throw Error('已离开工坊，未替换试装或恢复快照。');
      if(storage.getItem(recoveryKey)!==previous)throw Error('其他页面已修改恢复快照，请重新进入工坊。');
      try{storage.setItem(recoveryKey,raw);}catch{throw Error('浏览器未能保存恢复快照，当前试装保留。');}
      if(storage.getItem(recoveryKey)!==raw)throw Error('恢复快照未能完整保存，当前试装保留。');
      previous=raw;
    });
  }};
}
export async function applyPostedTrial(model,recovery,stored,current,replace,isCurrent=()=>true){
  if(!isCurrent())throw Error('已离开工坊，未替换试装或恢复快照。');
  const checked=model.postedInput(stored);
  await recovery.save(current,isCurrent);
  if(isCurrent())replace(checked.input);
  return checked;
}
