export const storageKey = 'nsp-weapon-workshop-v1';

const f32 = Math.fround;
export function evaluateModifiers(base, mods = [], ceil = false) {
  let value = f32(base), min = -3.4028234663852886e38, max = 3.4028234663852886e38, global = 0;
  for (const mod of mods) {
    if (mod.enabled === false) continue;
    const amount = f32(mod.value);
    switch (mod.action) {
      case 'Expand': value = evaluateModifiers(value, mod.source.mods, !!mod.source.ceil); if (ceil) value = Math.ceil(value); break;
      case 'Set': value = amount; break;
      case 'Add': value = f32(value + amount); break;
      case 'Mul': value = f32(value + f32(Math.abs(value) * amount)); break;
      case 'Min': min = amount; break;
      case 'Max': max = amount; break;
      case 'GlobalMul': global = f32(global + amount); break;
      default: throw Error('未知原生修正类型');
    }
  }
  value = f32(value + f32(Math.abs(value) * global));
  if (min > max) return NaN;
  value = Math.min(max, Math.max(min, value));
  return ceil ? Math.ceil(value) : value;
}

export function tagMatch(left, right) {
  if (!left?.length || !right?.length) return true;
  const pair = (a,b) => a === b || (typeof a === 'string' && typeof b === 'string' && (a.includes('|') || b.includes('|')) &&
    a.split('|').map(x=>x.trim()).filter(Boolean).some(x=>b.split('|').map(y=>y.trim()).filter(Boolean).includes(x)));
  let count = 0;
  for (const a of left) for (const b of right) if (pair(a,b)) count++;
  return count === Math.min(left.length, right.length);
}

function checkRecords(records) {
  if (!Array.isArray(records)) throw Error();
  const ids = new Set();
  for (const record of records) {
    if (!record || typeof record.id !== 'string' || !record.id || ids.has(record.id) ||
        typeof record.name !== 'string' || !record.name.trim() || record.name.length > 80 ||
        typeof record.rulesIdentity !== 'string' || !record.rulesIdentity ||
        !Number.isSafeInteger(record.savedAt) || !record.build || typeof record.build !== 'object' || Array.isArray(record.build)) throw Error();
    ids.add(record.id);
  }
}

// Keep the exact stored bytes until a validated replacement is written successfully.
export function readPlans(storage) {
  let raw;
  try { raw = storage.getItem(storageKey); }
  catch { return {raw:null, records:[], blocked:true, message:'浏览器无法读取装配记录，本次可继续试装。'}; }
  if (raw === null) return {raw, records:[], blocked:false};
  try {
    const data = JSON.parse(raw);
    if (data.schemaVersion !== 1) throw Error();
    checkRecords(data.records);
    return {raw, records:data.records, blocked:false};
  } catch { return {raw, records:[], blocked:true, message:'装配记录格式暂不支持，原记录已保留；本次可继续试装。'}; }
}

export function writePlans(storage, previous, records) {
  if (previous.blocked) return {...previous, message:previous.message};
  let raw;
  try { checkRecords(records); raw = JSON.stringify({schemaVersion:1, records}); }
  catch { return {...previous, message:'装配记录未通过检查，原记录已保留。'}; }
  try {
    if (storage.getItem(storageKey) !== previous.raw) return {...previous, blocked:true, message:'其他页面已修改装配记录，请重新进入工坊后保存。'};
    storage.setItem(storageKey, raw);
    return {raw, records, blocked:false};
  } catch { return {...previous, message:'浏览器未能保存，原装配记录已保留。'}; }
}

export async function savePlans(storage, previous, records, locks = globalThis.navigator?.locks) {
  if (!locks) return {...previous, message:'当前浏览器不支持安全保存装配记录，本次可继续试装。'};
  return locks.request(storageKey, {mode:'exclusive'}, () => writePlans(storage, previous, records));
}
