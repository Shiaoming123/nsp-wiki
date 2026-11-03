import Database from 'better-sqlite3';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,readdirSync,mkdirSync,chmodSync} from 'node:fs';
import {mkdir,lstat,readFile,writeFile,rename,unlink} from 'node:fs/promises';
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

export class FileBucket {
  constructor(root){this.root=path.resolve(root);mkdirSync(this.root,{recursive:true,mode:0o700});}
  target(key){if(!/^posts\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/i.test(key))throw Error('Invalid object key');return path.join(this.root,key);}
  async put(key,bytes,{httpMetadata={}}={}){
    const target=this.target(key);
    if(httpMetadata.contentType&&httpMetadata.contentType!=='image/png')throw Error('Invalid object type');
    if(bytes.byteLength>5*1024*1024)throw Error('Object too large');
    await mkdir(path.dirname(target),{recursive:true,mode:0o700});
    const temporary=path.join(path.dirname(target),'.tmp-'+randomUUID());
    try{await writeFile(temporary,bytes,{mode:0o600,flag:'wx'});await rename(temporary,target);}
    catch(error){await unlink(temporary).catch(()=>{});throw error;}
  }
  async get(key,{onlyIf}={}){
    const target=this.target(key);let info;
    try{info=await lstat(target);}catch(e){if(e.code==='ENOENT')return null;throw e;}
    if(!info.isFile()||info.isSymbolicLink()||info.size>5*1024*1024)throw Error('Invalid object file');
    const bytes=await readFile(target),httpEtag='"'+sha(bytes)+'"';
    if(onlyIf?.get('If-None-Match')===httpEtag)return {httpEtag};
    return {body:bytes,httpEtag};
  }
  async delete(key){await unlink(this.target(key)).catch(e=>{if(e.code!=='ENOENT')throw e;});}
}
