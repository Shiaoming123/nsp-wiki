import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync,gunzipSync} from 'node:zlib';
import {optimizeGzip,gzipTool} from './gzip-delivery.mjs';
const site=fileURLToPath(new URL('../',import.meta.url)),root=fs.mkdtempSync(path.join(site,'outputs/gzip-check-'));
try{
  const dir=path.join(root,'dist/client/maps/data/maps/example');fs.mkdirSync(dir,{recursive:true});
  const raw=Buffer.from('{"negative":-0,"integer":9007199254740993,"values":['+Array.from({length:20000},(_,i)=>(i/7).toFixed(13)).join(',')+']}');
  const original=gzipSync(raw,{level:1}),file=path.join(dir,'overview.json.gz');fs.writeFileSync(file,original);
  assert(gzipTool(),'Use the existing installed 7-Zip for this regression');
  const cacheDirectory=path.join(root,'cache'),options={cacheDirectory,minimumBytes:0,concurrency:2};
  const first=await optimizeGzip(path.join(root,'dist/client'),options);
  assert.equal(first.changedFiles,1);assert(first.savedBytes>0);assert.deepEqual(gunzipSync(fs.readFileSync(file)),raw);
  const packed=fs.readFileSync(file);assert.equal((await optimizeGzip(path.join(root,'dist/client'),options)).savedBytes,0);
  fs.writeFileSync(file,original);await optimizeGzip(path.join(root,'dist/client'),options);assert.deepEqual(fs.readFileSync(file),packed);
  const cacheFile=path.join(cacheDirectory,first.tool.fingerprint,first.files[0].decodedSHA256+'.gz');fs.writeFileSync(cacheFile,gzipSync('corrupted'));
  fs.writeFileSync(file,original);await assert.rejects(optimizeGzip(path.join(root,'dist/client'),options),/Cached gzip changed/);assert.deepEqual(fs.readFileSync(file),original);
  await assert.rejects(optimizeGzip(path.join(site,'public'),options),/Only generated/);
  console.log('PASS gzip delivery: exact decoded bytes, numeric lexemes, deterministic cache, poisoned cache rejected, source protected');
}finally{assert(path.dirname(root)===path.join(site,'outputs'));fs.rmSync(root,{recursive:true});}
