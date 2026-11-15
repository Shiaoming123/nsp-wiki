import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';

const site=fileURLToPath(new URL('../',import.meta.url));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const args=['a','-tgzip','-mx=9','-mfb=258','-mpass=15','-si','-so','delivery.gz'];
function walk(root){return fs.readdirSync(root,{withFileTypes:true}).flatMap(entry=>{
  const file=path.join(root,entry.name);assert(!fs.lstatSync(file).isSymbolicLink(),'Linked delivery input');
  return entry.isDirectory()?walk(file):[file];
});}
export function gzipTool(){
  let binary=process.env.WIKI_GZIP_BIN;
  if(!binary){const name=process.platform==='win32'?'7z.exe':'7z';binary=(process.env.PATH||'').split(path.delimiter).map(dir=>path.join(dir.replace(/^"|"$/g,''),name)).find(file=>fs.existsSync(file));}
  if(!binary)return null;
  const probe=spawnSync(binary,['i'],{encoding:'utf8',windowsHide:true});
  if(probe.error||probe.status!==0)throw Error('Installed 7-Zip could not be identified');
  const version=/7-Zip[^\r\n]*/.exec(probe.stdout)?.[0];assert(version,'Unknown gzip tool');
  // Scoop's executable may be a shim; bind the cache to the actual executable and DLL.
  const library=/[A-Z]:[^\r\n]*[\\/]7z\.dll/i.exec(probe.stdout)?.[0];
  if(library&&fs.existsSync(path.join(path.dirname(library),'7z.exe')))binary=path.join(path.dirname(library),'7z.exe');
  binary=fs.realpathSync(binary);
  const identity={binary,version,executableSHA256:hash(fs.readFileSync(binary)),...(library?{librarySHA256:hash(fs.readFileSync(library))}:{}),arguments:args};
  return {...identity,fingerprint:hash(JSON.stringify(identity))};
}
function compress(tool,bytes){return new Promise((resolve,reject)=>{
  const child=spawn(tool.binary,args,{stdio:['pipe','pipe','pipe'],windowsHide:true});
  const chunks=[];let length=0,error='',failed=false;
  const fail=e=>{if(!failed){failed=true;child.kill();reject(e);}};
  child.on('error',fail);child.stdin.on('error',fail);
  child.stdout.on('data',chunk=>{length+=chunk.length;if(length>bytes.length+65536)return fail(Error('Gzip output exceeded input bound'));chunks.push(chunk);});
  child.stderr.on('data',chunk=>error=(error+chunk).slice(-1000));
  child.on('close',code=>{if(failed)return;if(code!==0)return fail(Error('Gzip compression failed: '+error));resolve(Buffer.concat(chunks));});
  child.stdin.end(bytes);
});}
export async function optimizeGzip(directory,{cacheDirectory=path.join(site,'outputs/gzip-cache'),minimumBytes=32768,concurrency=4}={}){
  const root=fs.realpathSync(directory),source=fs.realpathSync(path.join(site,'public'));
  assert(root!==source&&!root.startsWith(source+path.sep),'Only generated delivery copies may be compressed');
  const tool=gzipTool();if(!tool)return {available:false,savedBytes:0,changedFiles:0,files:[]};
  const mapRoot=path.join(root,'maps/data'),candidates=walk(mapRoot).filter(file=>file.endsWith('.json.gz')&&fs.statSync(file).size>=minimumBytes).sort();
  const cache=path.resolve(cacheDirectory,tool.fingerprint);fs.mkdirSync(cache,{recursive:true});
  assert(!fs.lstatSync(cache).isSymbolicLink(),'Linked gzip cache');
  let next=0,completed=0;const files=[];
  await Promise.all(Array.from({length:Math.min(concurrency,candidates.length)},async()=>{
    while(next<candidates.length){
      const file=candidates[next++],before=fs.readFileSync(file),decoded=gunzipSync(before,{maxOutputLength:256*1024*1024}),decodedSHA256=hash(decoded),cached=path.join(cache,decodedSHA256+'.gz');
      let packed;
      if(fs.existsSync(cached)){assert(fs.lstatSync(cached).isFile()&&!fs.lstatSync(cached).isSymbolicLink());packed=fs.readFileSync(cached);}
      else{packed=await compress(tool,decoded);assert(gunzipSync(packed).equals(decoded),'Compressor changed decoded bytes');try{fs.writeFileSync(cached,packed,{flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}}
      assert(gunzipSync(packed).equals(decoded),'Cached gzip changed decoded bytes');
      if(packed.length<before.length){fs.writeFileSync(file,packed);files.push({path:path.relative(root,file).split(path.sep).join('/'),before:before.length,after:packed.length,decodedSHA256,sourceSHA256:hash(before),outputSHA256:hash(packed)});}
      completed++;if(completed%100===0)process.stderr.write(`Lossless gzip: ${completed}/${candidates.length}\n`);
    }
  }));
  files.sort((a,b)=>a.path.localeCompare(b.path));
  return {available:true,tool,minimumBytes,candidates:candidates.length,savedBytes:files.reduce((sum,file)=>sum+file.before-file.after,0),changedFiles:files.length,files};
}
