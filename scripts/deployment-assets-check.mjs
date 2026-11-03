import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {gzipSync,gunzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {auditPublic,compactJSON,optimizePublic,mapReferences,tarStreamBytes,checkDeploymentBudgets} from './deployment-assets.mjs';

const temp=fs.mkdtempSync(path.join(os.tmpdir(),'nsp-assets-check-'));
const root=path.join(temp,'public'),manifest=path.join(root,'maps/data/maps/m/manifest.json.gz');
const write=(name,value)=>{const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,value);};
const definition={pois:{url:'pois.json.gz'},assets:{mixed:{geometry:'../../assets-snow25933545-20261015/MixedCase.json.gz'},x:{geometry:'../../assets-ea25933545/g.json.gz'},snow:{geometry:'../../assets-snow25933545-20261015/Origin12_1535/snow-b.json.gz',material:{color:[1,.12345678901234567,0]}}},chunks:[]};
const set=value=>fs.writeFileSync(manifest,gzipSync(JSON.stringify(value)));
const same=gzipSync('{"positions":[],"indices":[]}',{level:1});
try{
  for(const field of ['expandedBudgetBytes','tarStreamBudgetBytes']){
    const over={expandedBudgetBytes:0,tarStreamBudgetBytes:0,[field]:256*1024*1024};
    assert.throws(()=>checkDeploymentBudgets({...over}),/Sites .* budget exceeded/);
    const independent=checkDeploymentBudgets({...over},true);
    assert.equal(independent.target,'independent-static');
    assert.equal(independent[field==='expandedBudgetBytes'?'sitesExpandedPass':'sitesTarPass'],false);
  }
  const json=Buffer.from(' { "text": "空 格\\\"\\\\ ", "number": 9007199254740993, "float": 1.2300e+03 }\r\n');
  assert.equal(compactJSON(json).toString(),'{"text":"空 格\\\"\\\\ ","number":9007199254740993,"float":1.2300e+03}');
  assert.throws(()=>compactJSON(Buffer.from('{bad}')));
  write('data/items.json',json);write('index.html','fixture');write('maps/data/maps.json',JSON.stringify([{id:'m',manifest:'maps/m/manifest.json.gz'}]));
  const measured=await tarStreamBytes(root,['index.html']);
  assert(measured.bytes>=1024&&measured.bytes%512===0&&path.isAbsolute(measured.executable));
  await assert.rejects(tarStreamBytes(root,['missing-archive-input']));
  write('maps/data/maps/m/pois.json.gz',gzipSync('{"points":[]}'));write('maps/data/assets/g.json.gz',same);write('maps/data/assets-ea25933545/g.json.gz',same);set(definition);
  const content=Buffer.from('hello '.repeat(10000)),snow='maps/data/assets-snow25933545-20261015/m/g.json.gz';write(snow,gzipSync(content,{level:1}));
  const snowContent=Buffer.from('{"positions":[1.2300e+03,9007199254740993,0],"indices":[]}');
  write('maps/data/assets-snow25933545-20261015/Origin12_1527/snow-a.json.gz',gzipSync(snowContent,{level:1}));write('maps/data/assets-snow25933545-20261015/Origin12_1535/snow-b.json.gz',gzipSync(snowContent,{level:9}));
  write('maps/data/assets-snow25933545-20261015/MixedCase.json.gz',gzipSync(JSON.stringify({positions:Array.from({length:9000},(_,i)=>i/7),indices:[]})));
  assert.equal(auditPublic(root).excludedFiles,1);
  for(const geometry of ['../../assets/g.json.gz','../../assets/g.json.gz#part','../../assets-ea25933545/missing.json.gz#part','../../assets-ea25933545/g.json.gz?v=1','../../assets-ea25933545/missing.png','../../../../../../outside.png','https://example.com/x.png']){
    set({...definition,assets:{x:{geometry}}});assert.throws(()=>auditPublic(root));
  }
  write('maps/data/assets-snow25933545-20261015/MixedCase.json.gz',gzipSync(JSON.stringify({positions:Array.from({length:9000},(_,i)=>i/7),indices:[]})));
  set(definition);write('maps/data/assets/g.json.gz','different');assert.throws(()=>auditPublic(root));write('maps/data/assets/g.json.gz',same);
  for(const kind of ['lowGeometry','POI','unreferenced']){
    const failed=path.join(temp,'failure-'+kind);fs.cpSync(root,failed,{recursive:true});
    const edited=structuredClone(definition),target=path.join(failed,'maps/data/maps/m/manifest.json.gz');
    delete edited.assets.snow.geometry;
    if(kind==='lowGeometry')edited.assets.snow.lowGeometry='../../assets-snow25933545-20261015/Origin12_1535/%73now-b.json.gz';
    if(kind==='POI')fs.writeFileSync(path.join(failed,'maps/data/maps/m/pois.json.gz'),gzipSync(JSON.stringify({points:[{geometry:definition.assets.snow.geometry}]})));
    fs.writeFileSync(target,gzipSync(JSON.stringify(edited)));const before=fs.readFileSync(target);
    assert.throws(()=>optimizePublic(failed),kind+' must stop before writing');assert.deepEqual(fs.readFileSync(target),before);
    assert(fs.existsSync(path.join(failed,'maps/data/assets-snow25933545-20261015/Origin12_1535/snow-b.json.gz')));
    assert.deepEqual(fs.readFileSync(path.join(failed,'data/items.json')),json);
  }
  fs.mkdirSync(path.join(temp,'scripts'));fs.copyFileSync(fileURLToPath(new URL('./deployment-assets.mjs',import.meta.url)),path.join(temp,'scripts/deployment-assets.mjs'));
  fs.copyFileSync(fileURLToPath(new URL('./map-geometry-packs.mjs',import.meta.url)),path.join(temp,'scripts/map-geometry-packs.mjs'));
  fs.copyFileSync(fileURLToPath(new URL('./json-bytes.mjs',import.meta.url)),path.join(temp,'scripts/json-bytes.mjs'));
  fs.cpSync(root,path.join(temp,'dist/client'),{recursive:true});
  const generated=path.join(temp,'dist/client/maps/data/assets/g.json.gz');fs.writeFileSync(generated,'unexpected');
  const run=()=>spawnSync(process.execPath,[path.join(temp,'scripts/deployment-assets.mjs'),'--prune'],{encoding:'utf8'});
  assert.notEqual(run().status,0);assert.equal(fs.readFileSync(generated,'utf8'),'unexpected');assert.deepEqual(fs.readFileSync(path.join(root,'maps/data/assets/g.json.gz')),same);
  fs.writeFileSync(generated,same);const result=run();assert.equal(result.status,0,result.stderr);assert(!fs.existsSync(generated));assert.equal(auditPublic(path.join(temp,'dist/client'),{filtered:true}).excludedFiles,0);const repeated=run();assert.equal(repeated.status,0,'Pruning must be idempotent: '+repeated.stderr);
  assert(fs.existsSync(path.join(temp,'dist/client/maps/data/assets-snow25933545-20261015/MixedCase.json.gz')),'Referenced mixed-case oversized geometry preserved');
  assert.deepEqual(gunzipSync(fs.readFileSync(path.join(temp,'dist/client',snow))),content);
  assert.deepEqual(fs.readFileSync(path.join(root,'data/items.json')),json);
  assert(!fs.existsSync(path.join(temp,'dist/client/maps/data/assets-snow25933545-20261015/Origin12_1535/snow-b.json.gz')));
  const changedManifest=JSON.parse(gunzipSync(fs.readFileSync(path.join(temp,'dist/client/maps/data/maps/m/manifest.json.gz'))));
  const [packRef,entryId]=changedManifest.assets.snow.geometry.split('#');assert(entryId);
  const packed=gunzipSync(fs.readFileSync(path.resolve(path.dirname(path.join(temp,'dist/client/maps/data/maps/m/manifest.json.gz')),packRef))).toString();
  const packedRoot=path.join(temp,'dist/client'),packedManifest=path.join(packedRoot,'maps/data/maps/m/manifest.json.gz');
  const packedOriginal=fs.readFileSync(packedManifest);
  for(const kind of ['wrong-field','missing-entry','query','escape']){
    const malformed=structuredClone(changedManifest);
    if(kind==='wrong-field'){malformed.material={texture:malformed.assets.snow.geometry};}
    if(kind==='missing-entry')malformed.assets.snow.geometry=packRef+'#'+'0'.repeat(64);
    if(kind==='query')malformed.assets.snow.geometry=packRef+'?v=1#'+entryId;
    if(kind==='escape')malformed.assets.snow.geometry='../../../../../../outside.json.gz#'+entryId;
    fs.writeFileSync(packedManifest,gzipSync(JSON.stringify(malformed)));
    assert.throws(()=>mapReferences(packedRoot),kind+' pack reference must be rejected');
  }
  fs.writeFileSync(packedManifest,packedOriginal);
  const packFile=path.resolve(path.dirname(packedManifest),packRef),packOriginal=fs.readFileSync(packFile);
  fs.writeFileSync(packFile,gzipSync(packed+' '));assert.throws(()=>mapReferences(packedRoot),'Pack content hash mismatch');
  fs.writeFileSync(packFile,packOriginal);mapReferences(packedRoot);
  assert(packed.includes('1.2300e+03')&&packed.includes('9007199254740993'),'Geometry numeric lexemes retained');
  assert.deepEqual(JSON.parse(packed).geometries[entryId],JSON.parse(snowContent));assert.deepEqual(changedManifest.assets.snow.material,definition.assets.snow.material);
  assert(fs.existsSync(path.join(root,'maps/data/assets-snow25933545-20261015/Origin12_1535/snow-b.json.gz')));
  const independent=spawnSync(process.execPath,[path.join(temp,'scripts/deployment-assets.mjs'),'--prune-independent'],{encoding:'utf8'});
  assert.equal(independent.status,0,independent.stderr);
  const independentReport=JSON.parse(independent.stdout.trim());
  assert.equal(independentReport.target,'independent-static');
  assert.equal(independentReport.sitesExpandedPass,true);
  assert.equal(independentReport.sitesTarPass,true);
  assert.equal(optimizePublic(path.join(temp,'dist/client')).savedBytes,0);
  const bad=path.join(temp,'dist/client/maps/data/assets-snow25933545-20261015/bad.json.gz');fs.writeFileSync(bad,'bad');assert.throws(()=>optimizePublic(path.join(temp,'dist/client')));assert.equal(fs.readFileSync(bad,'utf8'),'bad');fs.unlinkSync(bad);
  fs.renameSync(path.join(temp,'dist'),path.join(temp,'held-dist'));fs.symlinkSync(path.join(temp,'held-dist'),path.join(temp,'dist'),'junction');
  assert.notEqual(run().status,0,'A linked generated ancestor must be rejected');assert(fs.existsSync(path.join(temp,'held-dist/client/index.html')));
  console.log('PASS deployment assets: resource guards, source preservation, Windows junction rejection, JSON lexical identity, smaller lossless gzip and idempotence');
}finally{
  assert(path.dirname(temp)===fs.realpathSync(os.tmpdir())&&path.basename(temp).startsWith('nsp-assets-check-'));
  fs.rmSync(temp,{recursive:true});
}
