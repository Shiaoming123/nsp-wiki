const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const {transformSync}=require('esbuild'),hash=b=>crypto.createHash('sha256').update(b).digest('hex');
function formatFontFaces(files){return files.map(f=>`@font-face{font-family:'${f.family}';font-style:${f.style};font-weight:${f.weight};font-display:swap;src:url('/${f.file}') format('woff2');unicode-range:${f.unicodeRange};}`).join('\n');}
function readFontAssets(root,css){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'fonts/manifest.json'),'utf8')),inputs={},seen=new Set(),fontRoot=fs.realpathSync(path.join(root,'fonts'));
 assert.equal(fontRoot,path.join(fs.realpathSync(root),'fonts'),'Font directory escaped public root');
 assert.equal(manifest.schemaVersion,1,'Font manifest version');assert(Array.isArray(manifest.files)&&manifest.files.length,'Font files required');
 for(const f of manifest.files){
  assert(['Wiki Geist','Wiki Noto SC'].includes(f.family)&&f.style==='normal'&&f.weight==='100 900','Unexpected font face');
  assert(/^fonts\/[a-z0-9-]+-[a-f0-9]{12}\.woff2$/.test(f.file)&&!seen.has(f.file),'Unsafe font asset path');seen.add(f.file);
  assert(/^[a-f0-9]{64}$/.test(f.sha256)&&f.file.includes(f.sha256.slice(0,12)),'Font identity');
  assert(/^U\+[0-9A-F]+(?:-[0-9A-F]+)?(?:,U\+[0-9A-F]+(?:-[0-9A-F]+)?)*$/i.test(f.unicodeRange),'Font Unicode range');
  const target=path.join(root,f.file);assert.equal(path.dirname(fs.realpathSync(target)),fontRoot,'Font path escaped owned directory');const bytes=fs.readFileSync(target);
  assert.equal(bytes.subarray(0,4).toString(),'wOF2','Font format');assert.equal(bytes.length,f.size,'Font size');assert.equal(hash(bytes),f.sha256,'Font checksum');inputs[f.file]=f.sha256;
 }
 const minify=s=>transformSync(s,{loader:'css',minify:true,target:'es2022',legalComments:'none'}).code;
 assert.equal(minify(css),minify(formatFontFaces(manifest.files)),'Only manifest font-face declarations are allowed');
 inputs['fonts/manifest.json']=hash(fs.readFileSync(path.join(root,'fonts/manifest.json')));
 return inputs;
}
module.exports={formatFontFaces,readFontAssets};
