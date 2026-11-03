import {createEngine} from './workshop-engine.js';
import {statDifference} from './workshop-state.js';

const basis=Object.freeze({contagionProgress:1,itemEffectMultiplier:1,runtimeWeightMultiplier:1});
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
const plain=value=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&Object.getPrototypeOf(value)===Object.prototype;
const clone=value=>structuredClone(value);
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
export function serializeReport(value){
  function canonical(v){
    if(typeof v==='number'&&!Number.isFinite(v))fail('报告数值必须有限');
    if(Array.isArray(v))return v.map(canonical);
    if(v&&typeof v==='object')return Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])]));
    return v;
  }
  return JSON.stringify(canonical(value));
}
export async function digestReport(value){
  const bytes=new TextEncoder().encode(serializeReport(value));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export function createReportModel({rules,items}){
  const engine=createEngine(rules),catalog=new Map(items.map(item=>[item.id,item]));
  const name=id=>catalog.get(id)?.name||'物品资料待核实';
  function checkBuild(build){
    const validation=engine.validateBuild(build);
    if(!validation.valid)fail([...validation.errors,...validation.unknowns].map(x=>x.message).join('；')||'装配数据不支持');
    const pending=[build];while(pending.length){const current=pending.pop();if(current.contagionProgress!==1)fail('仅支持腐化进度100%的方案');for(const child of current.children){if(Object.keys(child).some(k=>!['slotIndex','node'].includes(k)))fail('子部件含不支持的字段');pending.push(child.node);}}
    return validation;
  }
  function validateInput(input){
    if(!plain(input)||Object.keys(input).some(k=>!['schemaVersion','name','rulesIdentity','basis','build'].includes(k))||input.schemaVersion!==1)fail('配装数据格式不支持');
    if(input.rulesIdentity!==rules.meta.rulesIdentity)fail('配装规则已更新，请刷新资料并重新确认预览',409);
    if(!plain(input.basis)||serializeReport(input.basis)!==serializeReport(basis))fail('配装计算条件不支持');
    if(typeof input.name!=='string'||!input.name.trim()||Array.from(input.name).length>80)fail('方案名称须为1–80字');
    checkBuild(input.build);return clone(input);
  }
  function capture({name:planName,build}){
    if(typeof planName!=='string'||Array.from(planName).length>80)fail('方案名称最多80字');
    const validation=checkBuild(build),tree=clone(build),parts=[],containers=[],ammo=[];
    function visit(node,path){
      const item=rules.items[node.itemId],entry=catalog.get(node.itemId),icon=entry?.icon;
      const nativeEffects=(item.initialNativeLogics||[]).map(raw=>{
        const definition=typeof raw==='string'?rules.nativeLogics?.[raw.split('(')[0]]:raw;
        return definition?[(definition.name||''),(definition.description||definition.playerConditionText||'原生效果待核实')].filter(Boolean).join(' · '):'原生效果待核实';
      });
      parts.push({path:[...path],itemId:node.itemId,name:name(node.itemId),icon:typeof icon==='string'&&/^icons\/[A-Za-z0-9_./-]+$/.test(icon)&&!icon.includes('..')?icon:null,
        affixes:node.affixes.map(id=>({id,name:rules.affixes[id].name,description:rules.affixes[id].description||'效果说明待核实',kind:'corruption'})),nativeEffects,ammoCount:node.ammoCount??null});
      if(item.slotData?.accsMask===rules.enums.AccsTag.AmmoBox)containers.push({path:[...path],name:name(node.itemId),capacity:clone(engine.directCapacity(node))});
      if(item.typeMask===rules.enums.EquipType.Bullet)ammo.push({path:[...path],name:name(node.itemId),count:node.ammoCount??null});
      for(const child of [...node.children].sort((a,b)=>a.slotIndex-b.slotIndex))visit(child.node,[...path,child.slotIndex]);
    }
    visit(tree,[]);
    const stats=engine.displayStats(tree),calculated=stats.calculated,raw=engine.calculate(engine.createBuild(tree.itemId));
    const sourceMeta={buildId:rules.meta.buildId,verification:rules.meta.verification,partialUpdate:rules.meta.partialUpdate||null};
    const report={reportVersion:1,formatVersion:1,name:planName.trim()||name(tree.itemId),rulesIdentity:rules.meta.rulesIdentity,sourceMeta,basis:clone(basis),build:tree,parts,
      statBaseline:{label:'裸机基础参数（非完整配装）',itemId:tree.itemId},
      stats:stats.bars.map(bar=>({...clone(bar),formatted:bar.status==='known'?bar.value.toFixed(2):'待核实',difference:statDifference(bar,raw.values[bar.key])})),
      capacities:{direct:clone(calculated.directCapacity),assembly:containers.length?{status:'unknown',value:null,reason:'弹链箱整枪装填上限待核实'}:clone(calculated.assemblyCapacity),containers,ammo},
      conditionalEffects:clone(calculated.conditionalEffects),
      validation:{...clone(validation),missingRequired:validation.missingRequired.map(m=>({...clone(m),label:engine.slots(tree).find(s=>s.index===m.slotIndex&&JSON.stringify(s.path)===JSON.stringify(m.path))?.label||'必需部件资料待核实'})),kind:rules.items[tree.itemId].kind,fireable:rules.items[tree.itemId].kind==='melee'?null:validation.fireable}};
    return freeze(report);
  }
  function revalidateInput(input){
    if(!plain(input)||typeof input.rulesIdentity!=='string'||!/^sha256:[a-f0-9]{64}$|^[a-f0-9]{64}$/.test(input.rulesIdentity))fail('配装规则身份格式不支持');
    const recalculated=input.rulesIdentity!==rules.meta.rulesIdentity;
    const checked=validateInput({...clone(input),rulesIdentity:rules.meta.rulesIdentity});
    capture(checked);return {input:checked,recalculated};
  }
  function postedInput(stored){
    if(!plain(stored)||stored.schemaVersion!==1)fail('帖子配装格式不支持');
    return revalidateInput({schemaVersion:stored.schemaVersion,name:stored.name,rulesIdentity:stored.rulesIdentity,basis:stored.basis,build:stored.build});
  }
  return {capture,validateInput,revalidateInput,postedInput};
}
