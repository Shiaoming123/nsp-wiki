import Database from 'better-sqlite3';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,mkdirSync,chmodSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {accountName} from './lib/auth.js';
const migrationDir=fileURLToPath(new URL('./drizzle/',import.meta.url));
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

class Statement {
  constructor(owner,sql,args=[]){this.owner=owner;this.sql=sql;this.args=args;}
  bind(...args){return new Statement(this.owner,this.sql,args);}
  native(){return this.owner.db.prepare(this.sql);}
  async first(){return this.native().get(...this.args)??null;}
  async all(){return {results:this.native().all(...this.args)};}
  execute(){
    const query=this.native();
    if(query.reader)return {results:query.all(...this.args),meta:{changes:0}};
    const r=query.run(...this.args);return {meta:{changes:r.changes,last_row_id:Number(r.lastInsertRowid)}};
  }
  async run(){return this.execute();}
}

export class SQLiteD1 {
  constructor(filename){
    if(filename!==':memory:')mkdirSync(path.dirname(path.resolve(filename)),{recursive:true,mode:0o700});
    this.db=new Database(filename);
    if(filename!==':memory:')chmodSync(filename,0o600);
    this.db.pragma('foreign_keys=ON');this.db.pragma('busy_timeout=3000');
    this.db.pragma('journal_mode=WAL');this.db.pragma('synchronous=FULL');this.migrate();
  }
  migrate(){
    this.db.exec('CREATE TABLE IF NOT EXISTS _local_schema_migrations(name TEXT PRIMARY KEY, checksum TEXT NOT NULL)');
    for(const name of readdirSync(migrationDir).filter(x=>/^\d+_.+\.sql$/.test(x)).sort()){
      const bytes=readFileSync(path.join(migrationDir,name)),checksum=sha(bytes);
      const prior=this.db.prepare('SELECT checksum FROM _local_schema_migrations WHERE name=?').get(name);
      if(prior){if(prior.checksum!==checksum)throw Error('Applied migration checksum differs');continue;}
      this.db.transaction(()=>{
        this.db.exec(bytes.toString('utf8'));
        this.db.prepare('INSERT INTO _local_schema_migrations(name,checksum) VALUES(?,?)').run(name,checksum);
      }).immediate();
    }
  }
  prepare(sql){return new Statement(this,sql);}
  async batch(statements){
    if(!Array.isArray(statements)||!statements.every(s=>s instanceof Statement&&s.owner===this))throw Error('Invalid database batch');
    return this.db.transaction(()=>statements.map(s=>s.execute())).immediate();
  }
  tables(){return this.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name").all().map(x=>x.name);}
  close(){this.db.close();}
}

export function importAccounts(db,rows){
  if(!Array.isArray(rows)||rows.length>10000)throw Error('Invalid account import');
  for(const row of rows){
    if(!row||Object.keys(row).sort().join(',')!=='created,id,password,username'||
      !uuid.test(row.id)||typeof row.username!=='string'||accountName(row.username)!==row.username||
      !/^\$2[aby]\$10\$[./A-Za-z0-9]{53}$/.test(row.password)||!Number.isSafeInteger(row.created)||row.created<0)throw Error('Invalid account record; manual review required');
  }
  return db.db.transaction(()=>{
    const insert=db.db.prepare('INSERT INTO accounts(id,username,password,created) VALUES(?,?,?,?)');
    for(const row of rows)insert.run(row.id,row.username,row.password,row.created);
    return rows.length;
  }).immediate();
}

export {FileBucket} from './file-bucket.mjs';
