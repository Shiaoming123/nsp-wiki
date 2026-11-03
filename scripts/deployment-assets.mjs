import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync,gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {compactJSON} from './json-bytes.mjs';
import {packMapGeometry} from './map-geometry-packs.mjs';
import {spawn} from 'node:child_process';

export async function tarStreamBytes(directory,entries){
  const binary=process.platform==='win32'?'tar.exe':'tar';
  const executable=process.env.PATH.split(path.delimiter).map(folder=>path.join(folder.replace(/^"|"$/g,''),binary)).find(file=>fs.existsSync(file));
  assert(executable,'Sites packaging requires tar on PATH');
  const child=spawn(executable,['-C',directory,'-cf','-',...entries],{stdio:['ignore','pipe','pipe']});
  let bytes=0,error='';child.stderr.on('data',chunk=>{error=(error+chunk.toString()).slice(-2048);});
  const complete=new Promise((resolve,reject)=>{child.once('error',reject);child.once('close',code=>code===0?resolve():reject(new Error('tar failed: '+error)));});
  await Promise.all([complete,(async()=>{for await(const chunk of child.stdout)bytes+=chunk.length;})()]);
  return {bytes,executable:fs.realpathSync(executable),arguments:['-C',directory,'-cf','-',...entries]};
}

const site=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
export const excludedDirectory='maps/data/assets';
const currentDirectory='maps/data/assets-ea25933545';
const sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const inside=(root,file)=>file===root||file.startsWith(root.endsWith(path.sep)?root:root+path.sep);
function files(root){
  if(!fs.existsSync(root))return [];
  const stat=fs.lstatSync(root);assert(!stat.isSymbolicLink(),'Symlinks are not deployment files');
  if(stat.isFile())return [root];
  assert(stat.isDirectory(),'Unexpected deployment file type');
  return fs.readdirSync(root).flatMap(name=>files(path.join(root,name)));
}
function plainDirectories(base,target){
  assert(inside(base,target));
  for(let current=target;;current=path.dirname(current)){
    if(fs.existsSync(current)){const stat=fs.lstatSync(current);assert(stat.isDirectory()&&!stat.isSymbolicLink(),'Generated directory must not be a symlink or junction');}
    if(current===base)break;
  }
}
const read=file=>JSON.parse(file.endsWith('.gz')?gunzipSync(fs.readFileSync(file)):fs.readFileSync(file,'utf8'));

export {compactJSON} from './json-bytes.mjs';
const fileIdentity=file=>process.platform==='win32'?file.toLowerCase():file;

function deduplicateSnow(root){
  const namespace=path.join(root,'maps/data/assets-snow25933545-20261015'),canonical=new Map(),duplicates=new Map();
  for(const file of files(namespace).filter(file=>/^snow-.*\.json\.gz$/.test(path.basename(file))).sort()){
    const content=gunzipSync(fs.readFileSync(file)),digest=createHash('sha256').update(content).digest('hex'),first=canonical.get(digest);
    if(!first){canonical.set(digest,file);continue;}
    assert.deepEqual(content,gunzipSync(fs.readFileSync(first)),'Snow geometry content differs');
    duplicates.set(file,{canonical:first,contentSHA256:digest,decodedBytes:content.length,removedBytes:fs.statSync(file).size,references:0});
  }
  const writes=[];
  function inspect(file,manifest){
    const original=gunzipSync(fs.readFileSync(file)).toString('utf8');let replacements=0;
    const resolve=value=>{if(value.includes('#'))return null;assert(!/[?#\\]/.test(value),'Geometry URL must be a plain local path');const resolved=path.resolve(path.dirname(file),decodeURIComponent(value));assert(inside(root,resolved));return resolved;};
    const updated=original.replace(/("geometry"\s*:\s*)("(?:\\.|[^"\\])*")/g,(token,prefix,literal)=>{
      const old=resolve(JSON.parse(literal)),duplicate=duplicates.get(old);if(!duplicate)return token;
      assert(manifest,'POI geometry deduplication needs explicit size metadata support');
      duplicate.references++;replacements++;
      return prefix+JSON.stringify(path.relative(path.dirname(file),duplicate.canonical).split(path.sep).join('/'));
    });
    function remaining(value){
      if(typeof value==='string'&&/\.json\.gz(?:[?#].*)?$/.test(value))assert(!duplicates.has(resolve(value)),'Duplicate geometry is still referenced');
      else if(Array.isArray(value))value.forEach(remaining);
      else if(value&&typeof value==='object')Object.values(value).forEach(remaining);
    }
    remaining(JSON.parse(updated));
    if(replacements)writes.push({file,content:gzipSync(updated,{level:9}),replacements});
  }
  for(const map of read(path.join(root,'maps/data/maps.json'))){
    const manifest=path.resolve(root,'maps/data',map.manifest);assert(inside(root,manifest));inspect(manifest,true);
    const poi=path.resolve(path.dirname(manifest),read(manifest).pois.url);assert(inside(root,poi));inspect(poi,false);
  }
  for(const duplicate of duplicates.values())assert(duplicate.references>0,'Unreferenced duplicate needs investigation');
  for(const write of writes)fs.writeFileSync(write.file,write.content);
  for(const file of duplicates.keys())fs.unlinkSync(file);
  return {files:[...duplicates].map(([file,value])=>({path:path.relative(root,file).split(path.sep).join('/'),...value,canonical:path.relative(root,value.canonical).split(path.sep).join('/')})),removedFiles:duplicates.size,removedBytes:[...duplicates.values()].reduce((sum,value)=>sum+value.removedBytes,0),rewrittenReferences:writes.reduce((sum,value)=>sum+value.replacements,0)};
}

export function optimizePublic(directory){
  const root=path.resolve(directory);plainDirectories(path.parse(root).root,root);
  assert(fs.realpathSync(root)!==fs.realpathSync(path.join(site,'public')),'Only generated copies may be optimized');
  files(root);
  mapReferences(root);
  const deduplication=deduplicateSnow(root),changed=[];
  const candidates=files(root).filter(file=>{
    const relative=path.relative(root,file).split(path.sep).join('/');
    return relative==='data/items.json'||/^maps\/data\/assets-(?:ea25933545|snow25933545-20261015)\/.+\.json\.gz$/.test(relative);
  });
  for(const file of candidates){
    const original=fs.readFileSync(file),gzip=file.endsWith('.gz'),content=gzip?gunzipSync(original):original;
    const optimized=gzip?gzipSync(content,{level:9}):compactJSON(content);
    if(optimized.length>=original.length)continue;
    assert.deepEqual(gzip?gunzipSync(optimized):compactJSON(optimized),gzip?content:compactJSON(original));
    fs.writeFileSync(file,optimized);
    changed.push({path:path.relative(root,file).split(path.sep).join('/'),before:original.length,after:optimized.length,sourceSHA256:createHash('sha256').update(original).digest('hex'),outputSHA256:sha(file),contentSHA256:createHash('sha256').update(gzip?content:compactJSON(content)).digest('hex')});
  }
  return {changedFiles:changed.length,savedBytes:changed.reduce((sum,file)=>sum+file.before-file.after,0),files:changed,deduplication};
}

export function mapReferences(directory){
  const root=fs.realpathSync(directory),refs=new Set(),catalog=read(path.join(root,'maps/data/maps.json')),packs=new Map();
  const legacy=path.join(root,excludedDirectory),packRoot=path.join(root,'maps/data/geometry-packs');
  function reference(value,from,fields=[]){
    if(typeof value==='string'&&/\.(?:json(?:\.gz)?|png|webp|jpe?g|svg)(?:[?#].*)?$/i.test(value)){
      assert(!/^[a-z]+:|^\/\/|[?\\]/i.test(value),'Map resources must be local files');
      const parts=value.split('#');assert(parts.length<=2,'Invalid map fragment');
      const resolved=path.resolve(path.dirname(from),decodeURIComponent(parts[0]));
      assert(inside(root,resolved),'Map resource escapes the public root');
      assert(!inside(legacy,resolved),'A current map still references the legacy namespace');
      assert(fs.statSync(resolved).isFile(),'Missing map resource: '+resolved);refs.add(fileIdentity(resolved));
      if(parts.length===2){
        const geometryField=fields.length===3&&fields[0]==='assets'&&fields[2]==='geometry'||fields.length===4&&fields[0]==='assets'&&fields[2]==='lod'&&fields[3]==='lowGeometry'||fields.length===5&&fields[0]==='points'&&fields[2]==='parts'&&fields[4]==='geometry';
        assert(geometryField,'Only scene and POI geometry fields support packs');
        assert(path.dirname(resolved)===packRoot&&/^[a-f0-9]{64}\.json\.gz$/.test(path.basename(resolved))&&/^[a-f0-9]{64}$/.test(parts[1]),'Invalid geometry pack identity');
        if(!packs.has(resolved)){
          const compressed=fs.readFileSync(resolved);assert(compressed.length<=8*1024,'Geometry pack exceeds transfer bound');
          const raw=gunzipSync(compressed,{maxOutputLength:128*1024});assert.equal(createHash('sha256').update(raw).digest('hex'),path.basename(resolved).split('.')[0],'Geometry pack content identity differs');
          const pack=JSON.parse(raw);assert(pack.schemaVersion===1&&pack.geometries&&Object.keys(pack.geometries).length>0&&Object.keys(pack.geometries).length<=16,'Invalid geometry pack schema');
          for(const geometry of Object.values(pack.geometries)){
            assert(Array.isArray(geometry.positions)&&geometry.positions.length%3===0&&geometry.positions.every(Number.isFinite),'Invalid packed positions');
            assert(Array.isArray(geometry.indices)&&geometry.indices.every(n=>Number.isInteger(n)&&n>=0&&n<geometry.positions.length/3),'Invalid packed indices');
          }
          packs.set(resolved,pack);
        }
        assert(Object.hasOwn(packs.get(resolved).geometries,parts[1]),'Geometry pack entry missing');
      }
    }else if(Array.isArray(value)){value.forEach((entry,index)=>{if(typeof entry!=='number')reference(entry,from,[...fields,String(index)]);});}
    else if(value&&typeof value==='object')for(const [key,entry] of Object.entries(value))reference(entry,from,[...fields,key]);
  }
  for(const entry of catalog){
    const manifestFile=path.resolve(root,'maps/data',entry.manifest);assert(inside(root,manifestFile));
    refs.add(fileIdentity(manifestFile));const manifest=read(manifestFile);reference(manifest,manifestFile);
    const poiFile=path.resolve(path.dirname(manifestFile),manifest.pois.url);reference(read(poiFile),poiFile);
  }
  return refs;
}

export function auditPublic(directory,{filtered=false}={}){
  const root=fs.realpathSync(directory),refs=mapReferences(root),catalog=read(path.join(root,'maps/data/maps.json'));
  const legacy=path.join(root,excludedDirectory),current=path.join(root,currentDirectory);
  const oldFiles=files(legacy),newFiles=files(current);
  if(filtered)assert.equal(oldFiles.length,0,'Filtered package retains legacy assets');
  else{
    assert(oldFiles.length>0,'Expected legacy source snapshot');
    assert.equal(oldFiles.length,newFiles.length,'Legacy/current namespaces differ');
    for(const file of oldFiles){const replacement=path.join(current,path.relative(legacy,file));assert.equal(sha(file),sha(replacement),'Legacy assets are not exact duplicates');}
  }
  const all=files(root),bytes=all.reduce((sum,file)=>sum+fs.statSync(file).size,0),largest=Math.max(...all.map(file=>fs.statSync(file).size));
  assert(largest<=25*1024*1024,'A static file exceeds the conservative 25 MiB budget');
  if(filtered)assert(all.length<=20000,'Static file count exceeds the conservative free-plan budget');
  return {status:'PASS',filtered,files:all.length,bytes,largestFileBytes:largest,maps:catalog.length,declaredMapResources:refs.size,excludedDirectory,excludedFiles:oldFiles.length,excludedBytes:oldFiles.reduce((sum,file)=>sum+fs.statSync(file).size,0)};
}

export function checkDeploymentBudgets(result,independent=false){
  const limit=256*1024*1024-128*1024;
  result.target=independent?'independent-static':'sites';
  result.measurementScope='Complete dist and drizzle trees plus 64 KiB hosting reserve';
  result.sitesExpandedPass=result.expandedBudgetBytes<=limit;
  result.sitesTarPass=result.tarStreamBudgetBytes<=limit;
  if(!independent){
    assert(result.sitesExpandedPass,'Sites expanded file budget exceeded; do not upload');
    assert(result.sitesTarPass,'Sites tar stream budget exceeded; do not upload');
  }
  return result;
}

async function pruneBuild(independent=false){
  const source=path.join(site,'public'),target=path.join(site,'dist/client');
  plainDirectories(site,path.join(target,excludedDirectory));
  const report=auditPublic(source);
  assert(inside(fs.realpathSync(site),fs.realpathSync(target))&&fs.realpathSync(target)!==fs.realpathSync(source),'Expected generated dist/client');
  const legacy=path.join(target,excludedDirectory),original=path.join(source,excludedDirectory),targets=files(legacy);
  if(targets.length){
    auditPublic(target);assert.equal(targets.length,report.excludedFiles);
    for(const file of targets)assert.equal(sha(file),sha(path.join(original,path.relative(legacy,file))),'Generated copy differs; preserve it');
    // Only verified generated copies are removed; the public source snapshot stays intact.
    for(const file of targets)fs.unlinkSync(file);
    function empty(directory){for(const entry of fs.readdirSync(directory))empty(path.join(directory,entry));fs.rmdirSync(directory);}
    empty(legacy);
  }
  mapReferences(target);
  const optimization=optimizePublic(target);
  const packing=await packMapGeometry(target),references=mapReferences(target),retired=[];
  for(const name of packing.sourceGeometryFiles){
    const file=path.resolve(target,name);
    assert(inside(target,file)&&/^(?:maps\/data\/assets-ea25933545|maps\/data\/assets-snow25933545-20261015)\/.+\.json\.gz$/.test(name),'Unexpected generated geometry ownership');
    if(!references.has(fileIdentity(file))&&fs.existsSync(file)){retired.push({path:name,bytes:fs.statSync(file).size});fs.unlinkSync(file);}
  }
  const headerFile=path.join(target,'_headers'),start='# map-packs:cache',end='# /map-packs:cache';
  let headers=fs.existsSync(headerFile)?fs.readFileSync(headerFile,'utf8'):'';
  const block=`${start}\n/maps/data/geometry-packs/*\n  Cache-Control: public, max-age=31536000, immutable\n${end}`;
  headers=headers.includes(start)?headers.replace(new RegExp(start+'[\\s\\S]*?'+end),block):headers.trimEnd()+'\n'+block;
  fs.writeFileSync(headerFile,headers.trimEnd()+'\n');
  const result={...auditPublic(target,{filtered:true}),removedFiles:targets.length,removedBytes:report.excludedBytes,sourceFilesPreserved:report.files,optimization,packing:{...packing,removedGeometryFiles:retired.length,removedGeometryBytes:retired.reduce((sum,f)=>sum+f.bytes,0)}};
  // Sites adds hosting metadata and SQL migrations when packaging the whole dist tree.
  result.expandedBudgetBytes=files(path.join(site,'dist')).reduce((sum,file)=>sum+fs.statSync(file).size,0)+files(path.join(site,'drizzle')).reduce((sum,file)=>sum+fs.statSync(file).size,0)+65536;
  if(!independent)assert(result.expandedBudgetBytes<=256*1024*1024-128*1024,'Sites expanded file budget exceeded; do not upload');
  const archiveFiles=[...files(path.join(site,'dist')),...files(path.join(site,'drizzle'))];
  const before=archiveFiles.map(file=>[file,sha(file)]);
  result.tarStream=await tarStreamBytes(site,['dist',...(fs.existsSync(path.join(site,'drizzle'))?['drizzle']:[])]);
  assert.deepEqual([...files(path.join(site,'dist')),...files(path.join(site,'drizzle'))].map(file=>[file,sha(file)]),before,'Build files changed during archive measurement');
  result.tarStreamBudgetBytes=result.tarStream.bytes+65536;
  checkDeploymentBudgets(result,independent);
  fs.mkdirSync(path.join(site,'outputs'),{recursive:true});fs.writeFileSync(path.join(site,'outputs/deployment-assets.json'),JSON.stringify(result,null,2));
  return result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);assert(!args.length||args.length===1&&['--prune','--prune-independent'].includes(args[0])||args.length===2&&['--check','--optimize'].includes(args[0]),'Expected --prune, --prune-independent, --check DIRECTORY or --optimize GENERATED_DIRECTORY');
  const result=['--prune','--prune-independent'].includes(args[0])?await pruneBuild(args[0]==='--prune-independent'):args[0]==='--optimize'?optimizePublic(args[1]):args[0]==='--check'?auditPublic(args[1],{filtered:true}):auditPublic(path.join(site,'public'));
  console.log(JSON.stringify({...result,...result.packing?{packing:{geometryCount:result.packing.geometryCount,packedGeometryCount:result.packing.packedGeometryCount,packCount:result.packing.packCount,rewrittenReferences:result.packing.rewrittenReferences,removedGeometryFiles:result.packing.removedGeometryFiles,removedGeometryBytes:result.packing.removedGeometryBytes}}:{},...result.optimization?{optimization:{changedFiles:result.optimization.changedFiles,savedBytes:result.optimization.savedBytes,deduplicatedFiles:result.optimization.deduplication.removedFiles,deduplicatedBytes:result.optimization.deduplication.removedBytes}}:{}}));
}
