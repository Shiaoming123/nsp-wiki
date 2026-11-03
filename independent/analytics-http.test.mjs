import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {Analytics} from './analytics.mjs';

const asModule=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
test('public analytics API is bounded, same-origin and does not expose identifiers',async()=>{
  const dir=new URL('../drizzle/',import.meta.url);
  const schema=readdirSync(dir).filter(n=>/^000[0-9]_.*\.sql$/.test(n)).sort().map(n=>readFileSync(new URL(n,dir),'utf8')).join('\n');
  const storage=asModule(`import {DatabaseSync} from 'node:sqlite';export class SQLiteD1{constructor(){this.db=new DatabaseSync(':memory:');this.db.exec(${JSON.stringify(schema)});}prepare(sql){return {all:async()=>({results:this.db.prepare(sql).all()})};}}export class FileBucket{}`);
  const community=asModule('export async function community(){return new Response(null,{status:418})}');
  const source=readFileSync(new URL('./independent.mjs',import.meta.url),'utf8')
    .replace("'./storage.mjs'",JSON.stringify(storage))
    .replace("'./lib/community.js'",JSON.stringify(community))
    .replace("'./lib/tencent-mirror-policy.js'",JSON.stringify(new URL('../lib/tencent-mirror-policy.js',import.meta.url).href))
    .replace("'./analytics-feed.mjs'",JSON.stringify(new URL('./analytics-feed.mjs',import.meta.url).href));
  const {createIndependent,ORIGIN}=await import(asModule(source));
  const a=new Analytics({secret:Buffer.alloc(32,1),itemIds:new Set(['item1']),sections:new Set(['items']),now:()=>Date.parse('2026-10-30T00:00:00Z')});
  const app=createIndependent({databaseFile:':memory:',uploadsDir:'unused',analytics:a});
  const req=(path,options={})=>new Request(ORIGIN+path,options);
  try{
    const post=(body,origin=ORIGIN)=>req('/api/analytics/event',{method:'POST',headers:{origin,'content-type':'application/json','user-agent':'test'},body:JSON.stringify(body)});
    assert.equal((await app.handle(post({kind:'item_click',target:'item1'}),'192.0.2.1')).status,204);
    assert.equal((await app.handle(post({kind:'item_click',target:'unknown'}),'192.0.2.1')).status,400);
    assert.equal((await app.handle(post({kind:'item_click',target:'item1'},'https://other.example'),'192.0.2.1')).status,403);
    assert.equal((await app.handle(req('/api/analytics/summary?days=999'),'192.0.2.1')).status,400);
    assert.equal((await app.handle(req('/api/analytics/summary?search=secret'),'192.0.2.1')).status,400);
    const response=await app.handle(req('/api/analytics/summary?days=7'),'192.0.2.1');assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');
    const text=await response.text();assert(!text.includes('192.0.2.1')&&!text.includes('secret'));
    const data=JSON.parse(text);assert.deepEqual(Object.keys(data.visitors[0]).sort(),['count','day']);assert.equal(data.totals[0].count,1);assert.deepEqual(data.activity,{comments:[],likes:[]});
  }finally{a.close();app.db.db.close();}
});
