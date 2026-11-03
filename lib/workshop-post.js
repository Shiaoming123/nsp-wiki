import rules from '../public/data/workshop.json' with {type:'json'};
import catalog from './workshop-items.json' with {type:'json'};
import {createReportModel,digestReport} from '../public/workshop-report.js';
let defaultModel;
const fail=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export async function validateWorkshopPost(raw,{model,expectedDigest}={}){
  if(typeof raw!=='string')fail('缺少配装数据');
  if(new TextEncoder().encode(raw).length>65536)fail('配装数据超过64 KiB',413);
  if(typeof expectedDigest!=='string'||! /^[a-f0-9]{64}$/.test(expectedDigest))fail('配装预览摘要格式不正确');
  let parsed;try{parsed=JSON.parse(raw);}catch{fail('配装JSON格式不正确');}
  model||=(defaultModel||=createReportModel({rules,items:catalog.items}));
  const input=model.validateInput(parsed),report=model.capture({name:input.name,build:input.build}),reportDigest=await digestReport(report);
  if(reportDigest!==expectedDigest)fail('配装预览与当前资料不一致，请刷新并重新确认预览',409);
  const workshopJSON=JSON.stringify({schemaVersion:1,name:report.name,rulesIdentity:report.rulesIdentity,sourceMeta:report.sourceMeta,basis:report.basis,build:report.build,displaySnapshot:report,reportDigest});
  if(new TextEncoder().encode(workshopJSON).length>256*1024)fail('配装报告超过存储上限；请保留草稿',413);
  return {workshopJSON,reportDigest};
}
