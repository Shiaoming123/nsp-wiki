import {randomUUID,createHash} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {mkdir,lstat,readFile,writeFile,rename,unlink} from 'node:fs/promises';
import path from 'node:path';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export class FileBucket {
  constructor(root){this.root=path.resolve(root);mkdirSync(this.root,{recursive:true,mode:0o700});}
  target(key){if(!/^(?:posts|articles)\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.png$/i.test(key))throw Error('Invalid object key');return path.join(this.root,key);}
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
