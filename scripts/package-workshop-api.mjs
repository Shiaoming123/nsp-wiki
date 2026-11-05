import {readFileSync,writeFileSync,readdirSync,mkdirSync,existsSync,lstatSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {adapterSource} from './independent-adapter-source.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
export function packageApi({adapterRoot,out,release}){
  adapterRoot=path.resolve(adapterRoot);out=path.resolve(out);
  const adapted=adapterSource(adapterRoot,release);
  if(existsSync(out))throw Error('Preserve existing output; destination already exists');
  for(const source of [root,adapterRoot])if(out===source||out.startsWith(source+path.sep))throw Error('Output must be outside source roots');
  const files=new Map(),sourceHashes={};
  function take(source,file){const original=path.join(source,file);if(!lstatSync(original).isFile()||lstatSync(original).isSymbolicLink())throw Error('Unsupported linked/non-file source: '+file);const bytes=readFileSync(original);files.set(file,bytes);sourceHashes[(source===root?'site/':'adapter/')+file]=hash(bytes);}
  for(const file of ['independent.mjs','storage.mjs','server.mjs','package.json','package-lock.json'])take(adapterRoot,file);
  if(adapted.includes("'./analytics-feed.mjs'")){
    for(const file of ['analytics.mjs','analytics-feed.mjs'])take(adapterRoot,file);
    for(const file of ['scripts/analytics-log.py','scripts/analytics-collector.py'])take(root,file);
  }
  files.set('independent.mjs',Buffer.from(adapted));
  for(const file of ['lib/community.js','lib/community-access.js','lib/community-admin.js','lib/auth.js','lib/mirror-auth.js','lib/tencent-mirror-policy.js','lib/item-ids.json','lib/affix-ids.json','lib/wiki-page-ids.json','lib/workshop-post.js','lib/workshop-items.json','public/workshop-report.js','public/workshop-engine.js','public/workshop-model.js','public/workshop-state.js','public/data/workshop.json'])take(root,file);
  for(const file of readdirSync(path.join(root,'drizzle')).filter(f=>/^\d+_.+\.sql$/.test(f)).sort())take(root,'drizzle/'+file);
  const sha256={};mkdirSync(path.dirname(out),{recursive:true});mkdirSync(out);
  for(const [file,bytes]of [...files].sort(([a],[b])=>a.localeCompare(b))){const target=path.join(out,file);mkdirSync(path.dirname(target),{recursive:true});writeFileSync(target,bytes,{flag:'wx'});sha256[file]=hash(bytes);}
  const manifest={schemaVersion:1,release,sha256,sourceHashes,adapterChanges:['BODY_LIMIT=5MiB+128KiB','health release identity only'],privateDataIncluded:false};
  writeFileSync(path.join(out,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});return manifest;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2);const get=key=>{const at=args.indexOf(key);if(at<0||!args[at+1])throw Error('Required '+key);return args[at+1];};
  const manifest=packageApi({adapterRoot:get('--adapter-root'),out:get('--out'),release:get('--release')});console.log(JSON.stringify({status:'PASS',files:Object.keys(manifest.sha256).length,release:manifest.release}));
}
