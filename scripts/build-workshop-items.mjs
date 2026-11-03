import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

export function projectWorkshopItems(catalog){
  if(!Array.isArray(catalog?.items))throw new Error('Workshop catalog items must be an array');
  const seen=new Set();
  return {items:catalog.items.map(item=>{
    if(typeof item?.id!=='string'||!item.id||seen.has(item.id))throw new Error('Workshop catalog has a missing or duplicate item id');
    seen.add(item.id);
    return Object.fromEntries(['id','name','icon'].filter(key=>Object.hasOwn(item,key)).map(key=>[key,item[key]]));
  })};
}
export const workshopItemsText=catalog=>JSON.stringify(projectWorkshopItems(catalog))+'\n';
export function checkWorkshopItems(catalog,text){
  if(text!==workshopItemsText(catalog))throw new Error('Workshop item catalog drift; run node scripts/build-workshop-items.mjs');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.slice(2).some(arg=>arg!=='--check'))throw new Error('Usage: node scripts/build-workshop-items.mjs [--check]');
  const source=new URL('../public/data/items.json',import.meta.url),target=new URL('../lib/workshop-items.json',import.meta.url);
  const catalog=JSON.parse(fs.readFileSync(source,'utf8')),text=workshopItemsText(catalog);
  if(process.argv.includes('--check'))checkWorkshopItems(catalog,fs.readFileSync(target,'utf8'));
  else fs.writeFileSync(target,text);
  console.log(JSON.stringify({status:'PASS',mode:process.argv.includes('--check')?'check':'generate',items:catalog.items.length,sourceBytes:fs.statSync(source).size,catalogBytes:Buffer.byteLength(text)}));
}
