import {DatabaseSync} from 'node:sqlite';
import {createHmac} from 'node:crypto';
import {isIP} from 'node:net';

const dayOf = time => new Date(time + 8 * 3600000).toISOString().slice(0,10);
const hourOf = time => new Date(time + 8 * 3600000).toISOString().slice(0,13);
const kinds = new Set(['page_view','item_view','item_click']);

// Kept in a separate database so analytics can fail independently of community data.
export class Analytics {
  constructor({filename=':memory:',secret,itemIds,sections,now=()=>Date.now(),requestMetrics=()=>null}) {
    if (!Buffer.isBuffer(secret) || secret.length < 32) throw Error('Analytics secret must be at least 32 bytes');
    if (!(itemIds instanceof Set) || !(sections instanceof Set)) throw Error('Analytics allowlists required');
    this.secret=secret;this.itemIds=itemIds;this.sections=sections;this.now=now;this.requestMetrics=requestMetrics;
    this.db=new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS visits(day TEXT NOT NULL, visitor TEXT NOT NULL, PRIMARY KEY(day,visitor));
      CREATE TABLE IF NOT EXISTS totals(day TEXT NOT NULL, kind TEXT NOT NULL, target TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(day,kind,target));
      CREATE TABLE IF NOT EXISTS hourly_visits(hour TEXT NOT NULL, visitor TEXT NOT NULL, PRIMARY KEY(hour,visitor));
      CREATE TABLE IF NOT EXISTS limits(slot INTEGER NOT NULL, client TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(slot,client));`);
    this.db.prepare('INSERT OR IGNORE INTO metadata(key,value) VALUES(?,?)').run('started',dayOf(this.now()));
    this.db.prepare('INSERT OR IGNORE INTO metadata(key,value) VALUES(?,?)').run('hourly_started',hourOf(this.now()));
  }
  record({kind,target,ip,userAgent=''}) {
    if (!kinds.has(kind) || typeof target!=='string' || target.length>160 || !isIP(ip) || typeof userAgent!=='string' || userAgent.length>512) throw Error('Invalid analytics event');
    if (!(kind==='page_view'?this.sections:this.itemIds).has(target)) throw Error('Unknown analytics target');
    const time=this.now(),day=dayOf(time), key=createHmac('sha256',this.secret).update('day\0'+day).digest();
    const visitor=createHmac('sha256',key).update(ip+'\0'+userAgent).digest('hex');
    const client=createHmac('sha256',key).update('limit\0'+ip).digest('hex'),slot=Math.floor(time/60000);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare('DELETE FROM limits WHERE slot < ?').run(slot-1);
      const limit=this.db.prepare('INSERT INTO limits(slot,client,count) VALUES(?,?,1) ON CONFLICT(slot,client) DO UPDATE SET count=count+1 RETURNING count').get(slot,client);
      if(limit.count>120)throw Error('Analytics rate limit');
      this.db.prepare('INSERT OR IGNORE INTO visits(day,visitor) VALUES(?,?)').run(day,visitor);
      this.db.prepare('INSERT INTO totals(day,kind,target,count) VALUES(?,?,?,1) ON CONFLICT(day,kind,target) DO UPDATE SET count=count+1').run(day,kind,target);
      const hour=hourOf(time);
      this.db.prepare('INSERT OR IGNORE INTO hourly_visits(hour,visitor) VALUES(?,?)').run(hour,visitor);
      this.db.exec('COMMIT');
    } catch(e) {this.db.exec('ROLLBACK');throw e;}
  }
  summary(days=7) {
    if (![1,7,30].includes(days)) throw Error('Invalid date range');
    const today=this.now(),start=dayOf(today-(days-1)*86400000),end=dayOf(today);
    const visitors=this.db.prepare('SELECT day,COUNT(*) AS count FROM visits WHERE day BETWEEN ? AND ? GROUP BY day ORDER BY day').all(start,end);
    const totals=this.db.prepare('SELECT day,kind,target,count FROM totals WHERE day BETWEEN ? AND ? ORDER BY day,kind,target').all(start,end);
    let requests=null;
    try {const data=this.requestMetrics();if(data?.timezone==='Asia/Shanghai'&&Array.isArray(data.days)&&data.days.length<=400&&new Set(data.days.map(d=>d.day)).size===data.days.length&&data.days.every(d=>/^\d{4}-\d{2}-\d{2}$/.test(d.day)&&Number.isSafeInteger(d.requests)&&d.requests>=0&&['2xx','3xx','4xx','5xx'].every(k=>d[k]===undefined||(Number.isSafeInteger(d[k])&&d[k]>=0))&&(!d.pageRequests||(typeof d.pageRequests==='object'&&!Array.isArray(d.pageRequests)&&Object.entries(d.pageRequests).every(([k,v])=>this.sections.has(k)&&Number.isSafeInteger(v)&&v>=0)))))requests=data.days.filter(d=>d.day>=start&&d.day<=end).map(d=>({day:d.day,requests:d.requests,'2xx':d['2xx']||0,'3xx':d['3xx']||0,'4xx':d['4xx']||0,'5xx':d['5xx']||0,pageRequests:d.pageRequests||{}}));}catch{}
    const hourly=days===1?{started:this.db.prepare('SELECT value FROM metadata WHERE key=?').get('hourly_started').value,current:hourOf(today),visitors:this.db.prepare('SELECT hour,COUNT(*) AS count FROM hourly_visits WHERE hour BETWEEN ? AND ? GROUP BY hour ORDER BY hour').all(start+'T00',end+'T23')}:null;
    return {version:1,start,end,started:this.db.prepare('SELECT value FROM metadata WHERE key=?').get('started').value,visitors,totals,requests,hourly};
  }
  prune(retentionDays=90) {
    if (!Number.isInteger(retentionDays) || retentionDays<1 || retentionDays>366) throw Error('Invalid retention');
    const before=dayOf(this.now()-(retentionDays-1)*86400000);
    this.db.prepare('DELETE FROM visits WHERE day < ?').run(before);
    this.db.prepare('DELETE FROM totals WHERE day < ?').run(before);
    const hourlyBefore=hourOf(this.now()-7*86400000);
    this.db.prepare('DELETE FROM hourly_visits WHERE hour < ?').run(hourlyBefore);
  }
  close(){this.db.close();}
}
