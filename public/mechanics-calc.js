(() => {
'use strict';
// Static generic-life/standard-spread arithmetic only; no game or combat simulation.
const f=Math.fround,add=(a,b)=>f(f(a)+f(b)),sub=(a,b)=>f(f(a)-f(b)),mul=(a,b)=>f(f(a)*f(b)),div=(a,b)=>f(f(a)/f(b));
const clamp=(x,a,b)=>Math.min(b,Math.max(a,x));
function number(input,key,defaultValue=0){
  const v=input[key]??defaultValue;
  if(typeof v!=='number'||!Number.isFinite(v)||!Number.isFinite(f(v)))throw new Error('请输入有限数值');
  return f(v);
}
function damageDefense(input={}){
  const keys=['impact','puncture','slash','disintegrate','trueDamage'];
  const values=Object.fromEntries(keys.map(k=>[k,number(input,k)]));
  if(keys.some(k=>values[k]<0))throw new Error('此计算器只支持非负的入射伤害');
  const scale=clamp(sub(1,div(number(input,'penetrationPct'),100)),0,1);
  const afterResistance={...values};
  for(const [key,resist]of [['impact','stiffness'],['puncture','toughness'],['slash','hardness'],['disintegrate','stable']])afterResistance[key]=Math.max(0,sub(values[key],mul(number(input,resist),scale)));
  const afterDefense={...afterResistance},physical=add(add(afterDefense.impact,afterDefense.puncture),afterDefense.slash),defense=mul(number(input,'defense'),scale);
  if(physical>0)for(const key of ['impact','puncture','slash'])afterDefense[key]=Math.max(0,sub(afterDefense[key],mul(div(afterDefense[key],physical),defense)));
  if(add(add(add(add(afterDefense.impact,afterDefense.puncture),afterDefense.slash),afterDefense.disintegrate),afterDefense.trueDamage)===0)afterDefense.trueDamage=1;
  const sum=add(add(add(add(afterDefense.trueDamage,afterDefense.impact),afterDefense.puncture),afterDefense.slash),afterDefense.disintegrate);
  const beforeFinalMultiplier=Math.max(1,sum),total=mul(beforeFinalMultiplier,add(1,div(number(input,'finalBonusPct'),100)));
  if(!Number.isFinite(total))throw new Error('数值超出单精度计算范围');
  return {resistanceScale:scale,effectiveDefense:defense,afterResistance,afterDefense,beforeFinalMultiplier,total};
}
function spread(input={}){
  const initial=number(input,'initialSpread'),growth=number(input,'growth'),limit=number(input,'limit');
  let stack=number(input,'stackBefore');const shots=input.shotCount??0;
  if(!Number.isSafeInteger(shots)||shots<0||shots>1000)throw new Error('触发次数须为0至1000的整数');
  if(input.aiming!==undefined&&typeof input.aiming!=='boolean')throw new Error('瞄准状态须为布尔值');
  const movement=input.movement??'still';if(!['still','move','run'].includes(movement))throw new Error('移动状态不支持');
  for(let i=0;i<shots;i++)stack=sub(clamp(add(initial,add(stack,growth)),Math.min(initial,limit),Math.max(initial,limit)),initial);
  let angle=add(initial,stack);
  if(input.aiming)angle=mul(angle,.4);
  if(movement!=='still')angle=mul(angle,movement==='run'?1.25:1.1);
  angle=Math.max(0,mul(angle,number(input,'multiplier',1)));
  if(!Number.isFinite(angle))throw new Error('数值超出单精度计算范围');
  return {stackAfter:stack,halfAngleDegrees:angle,fullAngleDegrees:mul(angle,2)};
}
function calculateMechanic(kind,input){
  if(kind==='damage-defense')return damageDefense(input);
  if(kind==='spread')return spread(input);
  throw new Error('此机制尚无已核实计算器');
}

window.MechanicsCalc=Object.freeze({damageDefense,spread,calculateMechanic});
})();
