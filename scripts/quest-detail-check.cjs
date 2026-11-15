const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const sandbox={module:{exports:{}}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../public/quest-guide.js'),'utf8'),sandbox);
const guide=sandbox.module.exports,data=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/data/quests.json'),'utf8'));
// A minimal DOM records actual rendered text, links, quantities and emphasis without page state.
const doc={createElement:tag=>new Node(tag),createTextNode:text=>new Node('#text',text)};
class Node{
 constructor(tag,text=''){this.tagName=tag;this.value=text;this.children=[];this.dataset={};this.ownerDocument=doc;}
 append(...nodes){this.children.push(...nodes.map(n=>typeof n==='string'?doc.createTextNode(n):n));}
 set textContent(text){this.value=String(text);this.children=[];}
 get textContent(){return this.value+this.children.map(n=>n.textContent).join('');}
}
const byId=new Map(data.missions.map(m=>[m.id,m])),items=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/data/items.json'),'utf8')).items,itemMap=new Map(items.map(i=>[i.id,i]));
const link=(text,route)=>{const n=doc.createElement('a');n.href=route;n.textContent=text;return n;};
const render=m=>{const body=doc.createElement('div');guide.appendDetails(body,m,data,{link,getItem:id=>itemMap.get(id)});return body;};
const allNodes=root=>[root,...root.children.flatMap(allNodes)];
for(const m of data.missions){const body=render(m),nodes=allNodes(body),text=body.textContent;
 assert(text.includes('接取与前置')&&text.includes('任务目标')&&text.includes('完成奖励'),m.id);
 for(const row of [...m.requirements,...m.preReward,...m.reward])if(!['Document','AddShopItem','AddShopBundle','UnlockInsurance','Coordinate'].includes(row.type))assert(text.includes('× '+row.count),m.id+' quantity');
 for(const [i,t]of m.texts.entries())assert(nodes.some(n=>n.tagName==='p'&&n.textContent===t),m.id+' original text '+i);
 for(const n of nodes.filter(n=>n.href?.startsWith('#quest/')))assert(byId.has(decodeURIComponent(n.href.slice(7))),m.id+' related mission');
}
const shelter=render(byId.get('Shelter')).textContent;assert(shelter.includes('以下全部前置')&&shelter.includes('无需同时满足')&&shelter.includes('床铺')&&shelter.includes('× 500'));
const warehouse=render(byId.get('WarehouseManager')).textContent;assert(warehouse.includes('事前补给')&&warehouse.includes('木料')&&warehouse.includes('× 2'));
assert(render(byId.get('TalkUncleVictorDefault')).textContent.includes('默认闲聊，不列为普通任务目标'));
const shops=data.missions.filter(m=>m.reward.some(r=>r.type==='AddShopItem'||r.type==='AddShopBundle'));assert(shops.length);for(const m of shops)assert(render(m).textContent.includes('并非直接获得'));
const emphasized=data.missions.filter(m=>Object.values(m.emphasis?.texts||{}).some(parts=>parts.some(p=>p.tone)));assert(emphasized.some(m=>allNodes(render(m)).some(n=>n.className==='quest-native-keyword quest-native-orange')));
console.log(JSON.stringify({status:'PASS',missions:data.missions.length,checks:['all original paragraphs and quantities rendered','ALL and alternative direct entry retained','pre-supplies and shop unlock semantics','related mission IDs resolve','dialogue and native emphasis retained','renderer needs no task page, storage or navigation state']}));
