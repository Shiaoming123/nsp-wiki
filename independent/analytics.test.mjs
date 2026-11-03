import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Analytics} from './analytics.mjs';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {publicActivity} from './analytics-feed.mjs';

test('daily deduplication, separate item events, time zone and invalid inputs',()=>{
  let now=Date.parse('2026-10-30T15:59:00Z');
  const a=new Analytics({secret:Buffer.alloc(32,7),itemIds:new Set(['item1']),sections:new Set(['items']),now:()=>now});
  try {
    const e={kind:'page_view',target:'items',ip:'192.0.2.1',userAgent:'test'};
    a.record(e);a.record(e);a.record({...e,kind:'item_click',target:'item1'});a.record({...e,kind:'item_view',target:'item1'});
    now+=120000;a.record(e);
    const s=a.summary();assert.deepEqual(s.visitors.map(x=>[x.day,x.count]),[['2026-10-30',1],['2026-10-31',1]]);
    assert.equal(s.totals.find(x=>x.kind==='item_click').count,1);assert.equal(s.totals.find(x=>x.kind==='item_view').count,1);
    assert.throws(()=>a.record({...e,target:'search?private'}));assert.throws(()=>a.record({...e,ip:'invalid'}));assert.throws(()=>a.summary(366));
    const raw=JSON.stringify(a.db.prepare('SELECT * FROM visits').all());assert(!raw.includes('192.0.2.1')&&!raw.includes('test'));
    a.prune(1);assert.equal(a.summary().visitors.length,1);
  } finally {a.close();}
});

test('hourly visits stay separate from daily visitors and expire without changing daily history',()=>{
  let now=Date.parse('2026-10-30T14:59:00Z');
  const a=new Analytics({secret:Buffer.alloc(32,2),itemIds:new Set(['item1']),sections:new Set(['items']),now:()=>now});
  try {
    const event={kind:'page_view',target:'items',ip:'192.0.2.1',userAgent:'test'};
    a.record(event);a.record(event);now+=120000;a.record(event);
    const today=a.summary(1);
    assert.equal(today.hourly.started,'2026-10-30T22');
    assert.deepEqual(today.hourly.visitors.map(x=>[x.hour,x.count]),[['2026-10-30T22',1],['2026-10-30T23',1]]);
    assert.equal(today.visitors[0].count,1);assert.equal(today.totals[0].count,3);
    now+=8*86400000;a.prune(90);
    assert.equal(a.db.prepare('SELECT count(*) AS n FROM hourly_visits').get().n,0);
    assert.equal(a.summary(30).visitors[0].count,1);
  }finally{a.close();}
});

test('existing daily database upgrades without fabricating hourly history',()=>{
  const dir=mkdtempSync(join(process.env.TMPDIR||'D:/CodexTemp','wiki-analytics-upgrade-')),file=join(dir,'analytics.sqlite');
  try{
    const old=new DatabaseSync(file);old.exec("CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO metadata VALUES('started','2026-10-29'); CREATE TABLE visits(day TEXT NOT NULL,visitor TEXT NOT NULL,PRIMARY KEY(day,visitor)); INSERT INTO visits VALUES('2026-10-29','old'); CREATE TABLE totals(day TEXT NOT NULL,kind TEXT NOT NULL,target TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(day,kind,target)); INSERT INTO totals VALUES('2026-10-29','page_view','items',3); CREATE TABLE limits(slot INTEGER NOT NULL,client TEXT NOT NULL,count INTEGER NOT NULL,PRIMARY KEY(slot,client));");old.close();
    const options={filename:file,secret:Buffer.alloc(32,3),itemIds:new Set(['item1']),sections:new Set(['items']),now:()=>Date.parse('2026-10-30T01:00:00Z')};
    for(let i=0;i<2;i++){const a=new Analytics(options);const result=a.summary(30);assert.equal(result.visitors[0].count,1);assert.equal(result.totals[0].count,3);assert.equal(a.summary(1).hourly.started,'2026-10-30T09');assert.equal(a.summary(1).hourly.visitors.length,0);a.close();}
  }finally{rmSync(dir,{recursive:true,force:true});}
});

test('public activity excludes liker identities and deleted comments',async()=>{
  const db=new DatabaseSync(':memory:');
  try {
    const dir=new URL('../drizzle/',import.meta.url);
    for(const name of readdirSync(dir).filter(n=>/^000[0-9]_.*\.sql$/.test(n)).sort())db.exec(readFileSync(new URL(name,dir),'utf8'));
    db.prepare('INSERT INTO accounts(id,username,password,created) VALUES(?,?,?,?)').run('private-account','example','placeholder',1);
    db.prepare('INSERT INTO item_likes(item,visitor) VALUES(?,?)').run('item1','private-visitor');
    db.prepare('INSERT INTO item_comments(id,item,author,nickname,body,created) VALUES(?,?,?,?,?,?)').run('c1','item1','private-account','name','hello',123);
    db.prepare("INSERT INTO posts(id,nickname,title,body,image,width,height,created,kind) VALUES('p','n','配装','b','i',1,1,1,'workshop')").run();
    db.prepare("INSERT INTO comments(id,post,nickname,body,created) VALUES('c2','p','n','reply',456)").run();
    const adapter={prepare:sql=>({all:async()=>({results:db.prepare(sql).all()})})};
    const feed=await publicActivity(adapter);assert.equal(feed.likes.length,1);assert.equal(feed.comments.length,2);assert.equal(feed.comments[0].kind,'workshop-post');assert(!JSON.stringify(feed).includes('private-'));
    db.prepare('DELETE FROM item_comments WHERE id=?').run('c1');db.prepare('DELETE FROM comments WHERE id=?').run('c2');db.prepare('DELETE FROM item_likes WHERE item=?').run('item1');
    const empty=await publicActivity(adapter);assert.equal(empty.comments.length,0);assert.equal(empty.likes.length,0);
  } finally {db.close();}
});

test('rate limits events and reports the first measurement date',()=>{
  const a=new Analytics({secret:Buffer.alloc(32,8),itemIds:new Set(['item1']),sections:new Set(['items']),now:()=>Date.parse('2026-10-30T00:00:00Z')});
  try {
    const e={kind:'item_click',target:'item1',ip:'192.0.2.2',userAgent:'example'};
    for(let i=0;i<120;i++)a.record(e);
    assert.throws(()=>a.record(e),/rate limit/);
    const s=a.summary(30);assert.equal(s.started,'2026-10-30');assert.equal(s.totals[0].count,120);
  } finally {a.close();}
});

test('legacy likes remain undated while new likes get dates and unlike removes them',()=>{
  const db=new DatabaseSync(':memory:');
  try {
    const dir=new URL('../drizzle/',import.meta.url);
    for(const name of readdirSync(dir).filter(n=>/^000[0-8]_.*\.sql$/.test(n)).sort())db.exec(readFileSync(new URL(name,dir),'utf8'));
    db.prepare('INSERT INTO item_likes(item,visitor) VALUES(?,?)').run('item1','old');
    db.exec(readFileSync(new URL('0009_like_timestamps.sql',dir),'utf8'));
    db.prepare('INSERT INTO item_likes(item,visitor) VALUES(?,?)').run('item1','new');
    const rows=db.prepare('SELECT visitor,created FROM item_likes ORDER BY visitor').all();
    assert.equal(rows[1].created,null);assert(Number.isSafeInteger(rows[0].created)&&rows[0].created>0);
    db.prepare('DELETE FROM item_likes WHERE item=? AND visitor=?').run('item1','new');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM item_likes WHERE created IS NOT NULL').get().n,0);
  } finally {db.close();}
});
