import {evaluateModifiers, tagMatch} from './workshop-model.js';

const f = Math.fround;
const mask = n => Number(n) >>> 0;
const intersects = (a, b) => (mask(a) & mask(b)) !== 0;
const hasFlag = (a, b) => mask(mask(a) & mask(b)) === mask(b);
const BULLET = 0x40000000, MAGAZINE = 0x20, RECEIVER = 1, ACCS = 0x800000;
const damageKeys = ['impact', 'puncture', 'slash', 'disintegrate', 'trueDamage'];
const negativeKeys = new Set(['spread', 'recoil', 'reload', 'spreadLimit', 'spreadInit']);
const plainObject = o => o !== null && typeof o === 'object' && !Array.isArray(o) &&
  (Object.getPrototypeOf(o) === Object.prototype || Object.getPrototypeOf(o) === null);
const resultValue = (value, reason) => Number.isFinite(value) && !reason ?
  {value, status:'known'} : {value:null, status:'unknown', reason:reason || '原生计算产生非有限数值'};
const contagionMul = progress => f(f(0.5) + f(f(0.5) * f(f(0.2) * Math.ceil(f(f(progress) / f(0.2))))));
export const engineLimits = Object.freeze({maxDepth:16, maxNodes:128, maxAffixes:64});

// The projection is the only item/rule input. No state is read from the game or storage.
export function createEngine(data) {
  if (!plainObject(data) || !plainObject(data.items) || !plainObject(data.affixes)) throw Error('工坊规则投影格式不支持');
  const items = data.items, affixes = data.affixes;
  const mainWeaponIds = new Set(data.mainWeaponIds || []);
  const itemOf = node => node && typeof node.itemId==='string' && Object.hasOwn(items,node.itemId) ? items[node.itemId] : null;
  const slotOf = item => item && Object.hasOwn(item,'slotData') ? item.slotData : (item?.slotBinding === false ? null : item);
  const typeOf = item => item?.typeMask;
  const paramsOf = item => item?.params || {};
  const itemSlots = item => slotOf(item)?.slots || [];
  const accsOf = item => slotOf(item)?.accsMask ?? 0;
  const tagsOf = item => slotOf(item)?.weaponTags || [];
  const nativeClass = logic => (logic?.nativeClass || logic?.class || '').split('.').at(-1);
  const isClass = (logic, short) => [short,'Item'+short,'LogicDataItem'+short].includes(nativeClass(logic));
  const isBuff = logic => ['Buff','ArmorPlate','ContagionBuff','LegendBuff'].some(t=>isClass(logic,t));
  const knownLogic = logic => isBuff(logic) || ['Contagion','UniversalSocket','UniversalBullet','UseLimit','HiddenInsurance',''].some(t=>isClass(logic,t));
  const initialLogics = item => (item?.initialNativeLogics || []).map(logic => {
    if (typeof logic !== 'string') return logic;
    const id=logic.split('(')[0], definition=Object.hasOwn(data.nativeLogics || {},id) ? data.nativeLogics[id] : null;
    if (!definition) return {id,nativeValueStatus:'unknown',capacityStatus:'unknown',unresolved:true};
    const result={id,...definition};
    if (isClass(result,'ArmorPlate')) {
      const raw=logic.match(/(?:\(|[,;])\s*durability\s*=\s*([^,;)]+)/)?.[1];
      result.durabilityMax=raw && Number.isFinite(Number(raw)) ? f(Number(raw)) : 100;
    }
    return result;
  });
  function logics(node) {
    const item = itemOf(node);
    const list = [...initialLogics(item)];
    // Ordering is supplied by the current-build projection rather than deduped by label.
    if (node.affixes.length && !list.some(l => isClass(l, 'Contagion'))) {
      list.push(data.contagionLogic || {nativeClass:'LogicDataItemContagion'});
    }
    for (const id of node.affixes) if (Object.hasOwn(affixes,id)) list.push(affixes[id]);
    return list;
  }
  const universal = (node, short) => logics(node).some(l => isClass(l, short));
  const buffLogics = node => logics(node).filter(isBuff);
  const nativeSign = node => typeOf(itemOf(node)) === ACCS && buffLogics(node).some(l => (l.keys?.reverseNativeStats || 0) > 0) ? -1 : 1;
  function createNode(itemId) {
    if (!Object.hasOwn(items, itemId)) throw Error('未知装备');
    const node={itemId, affixes:[], contagionProgress:1, children:[]};
    if (hasFlag(accsOf(items[itemId]),BULLET)) node.ammoCount=1;
    return node;
  }
  function createBuild(itemId) {
    if (!mainWeaponIds.has(itemId)) throw Error('此装备不在当前主武器集合');
    return createNode(itemId);
  }
  function nodeAt(build, path = []) {
    if (!plainObject(build) || !Array.isArray(path) || path.length>engineLimits.maxDepth || path.some(i => !Number.isSafeInteger(i) || i < 0)) return null;
    let node = build;
    for (const index of path) {
      if (!Array.isArray(node?.children)) return null;
      const children = node.children.filter(c => c?.slotIndex === index);
      if (children.length !== 1) return null;
      node = children[0].node;
    }
    return plainObject(node) ? node : null;
  }
  function bulletType(node, ignoreAccs = 0, ignoreSlot = -1, indexed = false) {
    const sd = slotOf(itemOf(node));
    if (!sd) return 0xffffffff;
    let value = universal(node, 'UniversalBullet') ? 7423 : mask(sd.bulletMask);
    if (mask(sd.bulletMask) === 0) value = 0xffffffff;
    for (const child of node.children) {
      const childSlot = slotOf(itemOf(child.node));
      const eligible = indexed ? child.slotIndex !== ignoreSlot && accsOf(itemOf(child.node)) !== mask(ignoreAccs) :
        childSlot && (ignoreAccs === 0 || !hasFlag(accsOf(itemOf(child.node)), ignoreAccs));
      if (eligible) value = mask(value & bulletType(child.node, ignoreAccs));
    }
    return value;
  }
  function compatibility(build, path, slotIndex, plugin) {
    const accept = nodeAt(build, path), sd = slotOf(itemOf(accept)), pd = slotOf(itemOf(plugin));
    if (!accept || !sd || !pd || !Array.isArray(plugin?.affixes) || !Array.isArray(plugin?.children)) return {compatible:false, code:'SLOT_BINDING_UNKNOWN', message:'缺少当前原生槽位绑定'};
    if (!Number.isSafeInteger(slotIndex) || !sd.slots?.[slotIndex]) return {compatible:false, code:'SLOT_INDEX', message:'槽位索引不存在'};
    if (!intersects(sd.slots[slotIndex].accsMask, pd.accsMask)) return {compatible:false, code:'SLOT_TYPE', message:'配件接口类型不兼容'};
    if (!universal(accept, 'UniversalSocket') && !universal(plugin, 'UniversalSocket') && !tagMatch(sd.weaponTags, pd.weaponTags)) {
      return {compatible:false, code:'WEAPON_TAG', message:'原生武器接口标签不兼容'};
    }
    const pluginMask = bulletType(plugin, BULLET);
    if (!intersects(bulletType(build, BULLET, slotIndex, true), pluginMask)) return {compatible:false, code:'ROOT_CALIBER', message:'与整套装备的弹药限制不兼容'};
    if (!intersects(bulletType(accept, BULLET, slotIndex, true), pluginMask)) return {compatible:false, code:'PARENT_CALIBER', message:'与直接父部件的弹药限制不兼容'};
    return {compatible:true};
  }
  function validateBuild(build) {
    const errors = [], unknowns = [], missingRequired = [], seen = new WeakSet();
    let count = 0, shapeValid = true;
    const error = (code, path, message, structural = false) => {
      errors.push({code, path:[...path], message}); if (structural) shapeValid = false;
    };
    function visit(node, path, root = false) {
      if (!plainObject(node)) return error('NODE_SHAPE', path, '装备节点必须是对象', true);
      if (Object.keys(node).some(k=>!['itemId','affixes','contagionProgress','children','ammoCount'].includes(k))) error('NODE_FIELDS',path,'装备节点含不支持的字段',true);
      if (seen.has(node)) return error('NODE_REUSED_OR_CYCLE', path, '同一节点被重复引用或出现循环', true);
      seen.add(node);
      if (++count > engineLimits.maxNodes || path.length > engineLimits.maxDepth) return error('WEBSITE_TREE_LIMIT', path, '超出网站装配树大小限制', true);
      const item = itemOf(node);
      if (typeof node.itemId !== 'string' || node.itemId.length>256 || !Object.hasOwn(items, node.itemId)) return error('ITEM_UNKNOWN', path, '当前规则没有此装备', true);
      if (item.selectable===false) error('ITEM_NOT_SELECTABLE',path,'此配置不在当前工坊可选装备范围');
      if (root && !mainWeaponIds.has(node.itemId)) error('MAIN_ITEM', path, '根节点必须是当前可选主武器');
      if (!Array.isArray(node.affixes) || node.affixes.length > engineLimits.maxAffixes || !Array.isArray(node.children) || node.children.length>engineLimits.maxNodes) return error('NODE_ARRAYS', path, '词条和子部件必须为大小受限的有序数组', true);
      if (!Number.isFinite(node.contagionProgress) || node.contagionProgress < 0 || node.contagionProgress > 1) error('CONTAGION_PROGRESS', path, '腐化进度应为0到1的有限数值', true);
      for (const id of node.affixes) {
        if (typeof id !== 'string' || !Object.hasOwn(affixes, id)) error('AFFIX_UNKNOWN', path, '当前规则没有此词条', true);
        else if (!item.affixIds?.includes(id)) error('AFFIX_APPLICABILITY', path, '词条不适用于此部件');
      }
      const limit = item.affixLimit ?? data.affixLimit ?? data.meta?.quantity?.normalLifecycleMax;
      if (node.affixes.length && (!Number.isSafeInteger(limit) || limit < 0)) unknowns.push({code:'AFFIX_LIMIT_UNKNOWN', path:[...path], message:'当前词条数量规则尚未闭合'});
      else if (node.affixes.length > limit) error('AFFIX_COUNT', path, '超过此部件当前核实的词条数量上限');
      if (initialLogics(item).some(l=>l.unresolved || isBuff(l) && !Array.isArray(l.modifiers))) unknowns.push({code:'INITIAL_LOGIC_UNKNOWN',path:[...path],message:'此部件的初始逻辑投影尚未核实'});
      if (logics(node).some(l=>!knownLogic(l) || l.nativeValueStatus==='unknown')) unknowns.push({code:'NATIVE_LOGIC_UNKNOWN',path:[...path],message:'此部件有未核实的原生数值逻辑'});
      const occupied = new Set();
      for (const child of node.children) {
        if (!plainObject(child) || !Number.isSafeInteger(child.slotIndex) || child.slotIndex < 0) { error('CHILD_SHAPE', path, '子部件应有合法整数槽位', true); continue; }
        if (occupied.has(child.slotIndex)) error('DUPLICATE_SLOT', [...path, child.slotIndex], '同一槽位不能安装两个部件', true);
        occupied.add(child.slotIndex);
        if (!itemSlots(item)[child.slotIndex]) error('SLOT_INDEX', [...path, child.slotIndex], '当前原生槽位不存在', true);
        visit(child.node, [...path, child.slotIndex]);
      }
      for (const [index, slot] of itemSlots(item).entries()) if (slot.required && !occupied.has(index)) missingRequired.push({path:[...path], slotIndex:index});
      if (Object.hasOwn(node, 'ammoCount') && (!Number.isSafeInteger(node.ammoCount) || node.ammoCount < 1 || !hasFlag(accsOf(item), BULLET))) error('AMMO_COUNT', path, '已装弹药节点数量必须为正整数，空仓请卸下弹药节点', true);
    }
    visit(build, [], true);
    if (shapeValid) {
      function check(node, path) {
        for (const child of node.children) {
          const match = compatibility(build, path, child.slotIndex, child.node);
          if (!match.compatible) error(match.code, [...path, child.slotIndex], match.message);
          if (Object.hasOwn(child.node, 'ammoCount')) {
            const cap = directCapacity(node);
            if (cap.status !== 'known') unknowns.push({code:'AMMO_CAPACITY_UNKNOWN', path:[...path,child.slotIndex], message:'该容器直接弹容尚未核实'});
            else if (child.node.ammoCount > cap.value) error('AMMO_CAPACITY', [...path,child.slotIndex], '弹药数量超过直接父容器容量');
          }
          check(child.node, [...path, child.slotIndex]);
        }
      }
      check(build, []);
    }
    function fireable(node) {
      if (!bulletType(node, 0, -1, true)) return false;
      return itemSlots(itemOf(node)).every((slot, index) => !slot.required ||
        node.children.some(child => child.slotIndex === index && fireable(child.node)));
    }
    return {valid:!errors.length && !unknowns.length, shapeValid, errors, unknowns, missingRequired,
      complete:shapeValid && missingRequired.length === 0, fireable:shapeValid ? fireable(build) : false};
  }
  function detachIncompatible(build, changedPath) {
    const initial = validateBuild(build), unchanged = () => ({build, removed:[], validation:initial});
    const repairable = new Set(['SLOT_TYPE','WEAPON_TAG','ROOT_CALIBER','PARENT_CALIBER','AMMO_CAPACITY']);
    const canRepair = validation => validation.shapeValid && !validation.unknowns.length &&
      validation.errors.every(error => repairable.has(error.code));
    if (!canRepair(initial) || !Array.isArray(changedPath) || !nodeAt(build, changedPath)) return unchanged();
    const baseline = node => node.contagionProgress === 1 && node.children.every(child => baseline(child.node));
    if (!baseline(build)) return unchanged();
    const repaired = structuredClone(build), removed = [];
    const provenMismatch = error => {
      if (!['ROOT_CALIBER','PARENT_CALIBER'].includes(error.code)) return true;
      const pluginMask = bulletType({...nodeAt(repaired,error.path),children:[]},BULLET);
      // Only an own-mask mismatch proves this edge is wrong; sibling/subtree intersections can blame innocent parts.
      return [repaired,nodeAt(repaired,error.path.slice(0,-1))].some(host =>
        !intersects(bulletType({...host,children:[]},BULLET),pluginMask));
    };
    let validation = initial;
    while (validation.errors.length) {
      // A global caliber intersection can blame an unaffected sibling; stay within the edited branch.
      const issue = validation.errors.filter(error => error.path.length &&
        changedPath.every((index, depth) => error.path[depth] === index) && provenMismatch(error))
        .sort((a,b) => b.path.length - a.path.length || a.path.join('.').localeCompare(b.path.join('.'),'en'))[0];
      if (!issue) return unchanged();
      const parent = nodeAt(repaired, issue.path.slice(0,-1));
      const index = parent.children.findIndex(child => child.slotIndex === issue.path.at(-1));
      const [child] = parent.children.splice(index,1);
      removed.push({path:[...issue.path], itemId:child.node.itemId, code:issue.code});
      validation = validateBuild(repaired);
      if (!canRepair(validation)) return unchanged();
    }
    return {build:repaired, removed, validation};
  }
  function slots(build) {
    const validation = validateBuild(build); if (!validation.shapeValid) return [];
    const list = [];
    function visit(node, path) {
      for (const [index, slot] of itemSlots(itemOf(node)).entries()) {
        const installed = node.children.find(c => c.slotIndex === index)?.node || null;
        list.push({...slot, path:[...path], index, nodePath:[...path,index], label:slot.label || '配件槽 '+(index+1), installed,
          compatibility:installed ? compatibility(build,path,index,installed) : null});
      }
      for (const child of node.children) visit(child.node,[...path,child.slotIndex]);
    }
    visit(build,[]); return list;
  }
  function candidates(build, path, slotIndex, {includeAffixPresets=false}={}) {
    if (!validateBuild(build).shapeValid) return [];
    const result=[];
    for (const [itemId,item] of Object.entries(items)) {
      if (item.selectable===false) continue;
      const node=createNode(itemId);
      if (compatibility(build,path,slotIndex,node).compatible) {result.push({itemId,affixes:[],compatible:true});continue;}
      if (!includeAffixPresets) continue;
      const limit=item.affixLimit ?? data.affixLimit ?? data.meta?.quantity?.normalLifecycleMax;
      if (!Number.isSafeInteger(limit) || limit<1) continue;
      const specials=(item.affixIds || []).filter(id=>Object.hasOwn(affixes,id) &&
        ['UniversalSocket','UniversalBullet'].some(type=>isClass(affixes[id],type)));
      const attempts=specials.map(id=>[id]);
      if (limit>=2) for(let i=0;i<specials.length;i++)for(let j=i+1;j<specials.length;j++)attempts.push([specials[i],specials[j]]);
      for(const preset of attempts){
        node.affixes=preset;
        if(compatibility(build,path,slotIndex,node).compatible){result.push({itemId,affixes:[...preset],compatible:true});break;}
      }
    }
    return result;
  }
  function directCapacity(node) {
    const item = itemOf(node); if (!item) return resultValue(NaN, '未知装备');
    const sd = slotOf(item); let capacity = 0;
    const base = f(paramsOf(item).capacity || 0);
    if (base > 0) capacity = Math.ceil(base);
    else if (sd && itemSlots(item).some(s => intersects(s.accsMask,BULLET)) && mask(sd.bulletMask) !== 0 && accsOf(item) === RECEIVER) capacity = 1;
    for (const logic of logics(node)) {
      if (logic.capacityStatus==='unknown') return resultValue(NaN,'该逻辑的直接弹容回调尚未核实');
      if (isClass(logic, 'Contagion')) capacity = Math.ceil(f(capacity * contagionMul(node.contagionProgress)));
      else if (isBuff(logic)) {
        let changed = false;
        for (const mod of logic.modifiers || []) if (mod.key === 'capacity') {
          if (mod.rand) return resultValue(NaN,'容量词条含未选择的随机数值');
          changed = true;
          capacity = mod.action === 'Add' ? f(capacity + Math.ceil(f(mod.value))) : f(capacity * f(1 + f(mod.value)));
        }
        if (changed) capacity = Math.ceil(f(capacity * f(logic.weight ?? 1)));
      } else if (logic.capacityStatus === 'unknown' || !knownLogic(logic)) return resultValue(NaN,'该逻辑的直接弹容回调尚未核实');
    }
    return resultValue(Math.ceil(capacity));
  }
  function assemblyCapacity(build) {
    const initial = directCapacity(build); if (initial.status !== 'known') return initial;
    let value = initial.value, reason;
    function walk(node) {
      if (accsOf(itemOf(node)) === MAGAZINE) { const n = directCapacity(node); if (n.status !== 'known') reason=n.reason; else value=f(value+n.value); }
      for (const child of node.children) walk(child.node);
    }
    walk(build);
    if (value === 0 && itemSlots(itemOf(build)).some(s => mask(s.accsMask) === BULLET)) value=1;
    return resultValue(value,reason);
  }
  function calculate(build) {
    const validation = validateBuild(build);
    if (!validation.shapeValid) return {status:'invalid',values:{},validation,directCapacity:resultValue(NaN,'装配结构无效'),assemblyCapacity:resultValue(NaN,'装配结构无效'),conditionalEffects:[]};
    const values = new Map(), conditionalEffects = [], unknownFields = new Map();
    const acquire = key => { if (!values.has(key)) values.set(key,{base:0,mods:[],ceil:key==='capacity'}); return values.get(key); };
    const current = key => { const v=acquire(key); try {return evaluateModifiers(v.base,v.mods,v.ceil);} catch {return NaN;} };
    const add = (key,action,value) => acquire(key).mods.push({action,value:f(value)});
    const rootItem=itemOf(build);
    for (const [key,value] of Object.entries(paramsOf(rootItem))) acquire(key).base=f(value);
    acquire('spreadMultiplier').base=1; acquire('capacity').ceil=true;
    if (nativeSign(build)<0) for (const key of Object.keys(paramsOf(rootItem))) acquire(key).base=f(-acquire(key).base);
    // Planning nodes start with durabilityUse=0; worn live armour is not an editable input.
    const canAppend = node => logics(node).every(l => !isClass(l,'ArmorPlate') || (l.durabilityMax ?? 100)>0);
    function append(node) {
      const item=itemOf(node); if (item.reloadLogic?.name || typeof item.reloadLogic === 'string' && item.reloadLogic) return;
      for (const [key,value] of Object.entries(paramsOf(item))) add(key,'Add',f(f(value)*nativeSign(node)));
      for (const child of node.children) if (canAppend(child.node)) append(child.node);
    }
    for (const child of build.children) append(child.node);
    function init(node,path) {
      const host=itemOf(node);
      if (initialLogics(host).some(l=>l.unresolved || isBuff(l) && !Array.isArray(l.modifiers))) for(const key of values.keys()) unknownFields.set(key,'初始逻辑尚未核实');
      for (const initMod of host.initModifiers || []) add(initMod.key,initMod.action,initMod.value);
      for (const key of host.unknownInitKeys || []) unknownFields.set(key,'原生初始化副作用未完整核实');
      for (const logic of logics(node)) {
        if (logic.nativeValueStatus==='unknown') for (const key of logic.affectedKeys || [...values.keys()]) unknownFields.set(key,'特殊词条的常驻数值行为尚未核实');
        if (logic.runtimeActions?.length) conditionalEffects.push({path:[...path],affixId:logic.id || null,
          text:logic.description || logic.playerConditionText || '此部件还有运行时触发效果，具体表现待核实。'});
        if (isClass(logic,'Contagion')) {
          const mul=contagionMul(node.contagionProgress);
          for (const key of [...values.keys()]) {
            const bad=negativeKeys.has(key) !== (current(key)<0);
            add(key,'Add',f(f(paramsOf(host)[key] || 0)*f(bad ? f(1-mul) : f(mul-1))));
          }
        } else if (isBuff(logic)) {
          const weight=f(logic.weight ?? 1);
          for (const mod of logic.modifiers || []) {
            if (mod.rand) { unknownFields.set(mod.key,'词条存在未选择的随机数值'); continue; }
            if (mod.key === 'damage') {
              const defaults=damageKeys.map(key => acquire(key).base);
              const sum=defaults.reduce((sum,n)=>f(sum+n),0);
              damageKeys.forEach((key,index)=>add(key,mod.action,mod.action==='Add' ? f(f(f(f(mod.value)*weight)*defaults[index])/sum) : f(f(mod.value)*weight)));
            } else add(mod.key,mod.action,f(f(mod.value)*weight));
          }
        } else if (logic.nativeValueStatus === 'unknown' || !knownLogic(logic)) {
          for (const key of logic.affectedKeys || [...values.keys()]) unknownFields.set(key,'特殊词条的常驻数值行为尚未核实');
        }
      }
      for (const child of node.children) init(child.node,[...path,child.slotIndex]);
    }
    init(build,[]);
    const output={}; for (const key of values.keys()) output[key]=resultValue(current(key),unknownFields.get(key));
    return {status:Object.values(output).some(v=>v.status!=='known') ? 'partial' : 'known',values:output,validation,
      directCapacity:directCapacity(build),assemblyCapacity:assemblyCapacity(build),conditionalEffects};
  }
  function displayStats(build) {
    const calculated=calculate(build), item=itemOf(build), sd=slotOf(item);
    if (!calculated.validation.shapeValid) return {status:'invalid',bars:[],calculated};
    const specs=data.displaySpecs || [];
    const groupIndex=specs.findIndex(g => (!g.accsMask || intersects(g.accsMask,accsOf(item))) &&
      (!g.ani || g.ani===item.ani) && (!g.weaponTag || sd?.weaponTags?.includes(g.weaponTag)));
    if (groupIndex<0) return {status:'unknown',reason:'当前原生属性组没有匹配项',bars:[],calculated};
    const group=specs[groupIndex], bars=[];
    for (const [index,bar] of group.bars.entries()) {
      const value=calculated.values[bar.key];
      if (!group.showAllBar && (!value || value.status==='known' && value.value===0)) continue;
      const renderer=bar.barRender || bar.renderer || data.renderers?.[bar.key];
      if (!renderer) continue; // Native DoRender only draws registered propertyKey renderers.
      const unknown=group.showAllBar ? '原生showAllBar分支存在未核实的空值读取' : !renderer ? '缺少当前原生属性渲染器' : value?.reason;
      const status=unknown || !value || value.status!=='known' ? 'unknown' : 'known';
      bars.push({...bar,label:bar.label || bar.key,value:status==='known'?value.value:null,status,reason:unknown,
        barCap:bar.cap,barNegative:bar.isNegative,barOrder:bar.order ?? index,barRender:renderer,barDots:bar.dotsCount,
        formatted:status==='known'?new Intl.NumberFormat('en-US',{maximumFractionDigits:2,useGrouping:false}).format(value.value):'待核实'});
    }
    return {status:bars.some(b=>b.status!=='known')?'partial':'known',groupIndex,bars,calculated};
  }
  return {createBuild,createNode,nodeAt,slots,candidates,compatibility,validateBuild,detachIncompatible,calculate,displayStats,directCapacity,assemblyCapacity,
    mainWeaponIds:[...mainWeaponIds],affixLimit:data.affixLimit ?? data.meta?.quantity?.normalLifecycleMax};
}
