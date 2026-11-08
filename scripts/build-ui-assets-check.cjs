const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), crypto = require('node:crypto');
const {createRequire} = require('node:module');
const site = path.resolve(__dirname, '..');
const task = process.env.UI_ASSET_EVIDENCE || 'D:/CodexTemp/nsp-wiki-ui-asset-check';
const output = path.join(task, 'evidence/ui-assets-check', String(Date.now()));
const report = path.join(task, 'reports/ui-assets-check.json');
const original = path.join(__dirname, 'build-ui-assets.cjs'), source = fs.readFileSync(original, 'utf8');
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const {formatFontFaces}=require('../lib/font-assets.cjs');
const read = file => fs.readFileSync(file, 'utf8');
const navigation = ['typography.js','welcome.js','scroll-motion.js','navigation.js','traffic.js','mechanics-calc.js','mechanics.js','card-image.js'];
const scripts = [...navigation,'vendor/post-markdown.js','community-auth.js','site-notice.js','item-community.js','app.js','tiers.js','posts.js','corruption.js','feedback.js','enemy-variants.js','enemy-guide-videos.js','quest-supplies.js','quest-progress.js','quest-semantics.js','quest-guide.js','npc-recipes.js','updates.js','loot.js','guides.js','scroll-tools.js'];
const styles = ['ui-tokens.css','fonts.css','styles.css','guides.css','loot.css','corruption.css','workshop.css','design.css','maps/map-viewer.css','maps/enemy-layer.css','maps/floor-guide.css','maps/floor-tower.css','maps/floor-plan.css','tiers.css','posts.css','item-community.css','feedback.css','npc-recipes.css','welcome.css','seo.css','ui-refinement.css','updates.css','navigation.css','mechanics.css','traffic.css','terminal.css','library.css','exploration.css','components.css','typography.css'];
const mapEntries=['maps/map-viewer.js','maps/floor-guide.js','maps/floor-tower.js','maps/office-transit.js','maps/floor-plan.js','maps/enemy-layer.js','maps/data/enemy-spawns.json'];
styles.push('quest-guide.css','admin.css','native-ui.css');
const community = [...navigation,'vendor/post-markdown.js','community-auth.js','item-community.js','feedback.js','admin.js'];
const workshop = ['workshop.js','workshop-engine.js','workshop-assembly.js','workshop-model.js','workshop-report.js','workshop-image.js','workshop-state.js'];
const checks = [];
fs.mkdirSync(output, {recursive:true});
fs.writeFileSync(path.join(output, 'build-ui-assets-source.cjs'), source);
function fixture(name) {
  const folder = path.join(output, name), root = path.join(folder, 'public');
  fs.mkdirSync(path.join(folder, 'scripts'), {recursive:true}); fs.mkdirSync(root, {recursive:true});
  const originals = new Map();
  const fontBytes=Buffer.from('wOF2fixture'),font={family:'Wiki Geist',style:'normal',weight:'100 900',file:'fonts/fixture-'+hash(fontBytes).slice(0,12)+'.woff2',sha256:hash(fontBytes),size:fontBytes.length,unicodeRange:'U+20-7E'};
  fs.mkdirSync(path.join(root,'fonts'),{recursive:true});fs.writeFileSync(path.join(root,font.file),fontBytes);fs.writeFileSync(path.join(root,'fonts/manifest.json'),JSON.stringify({schemaVersion:1,files:[font]}));
  for (const file of new Set([...scripts,...community])) {
    const lazy = file === 'guides.js' ? ',globalThis.lazy=()=>import("./workshop.js"),globalThis.map=()=>import("./maps/map-viewer.js")' : '';
    // Adjacent parenthesized scripts form an invalid call chain without explicit separators.
    const text = '(globalThis.order.push(' + JSON.stringify(file) + ')' + lazy + ',globalThis.boundary=()=>1)';
    const target = path.join(root, file); fs.mkdirSync(path.dirname(target), {recursive:true}); fs.writeFileSync(target, text); originals.set(file, text);
  }
  const modules = {
    'workshop.js': "import {engine} from './workshop-engine.js';import {assembly} from './workshop-assembly.js';import {model} from './workshop-model.js';import {report} from './workshop-report.js';import {image} from './workshop-image.js';import {state} from './workshop-state.js';export function mountWorkshop(){return [engine(),assembly(),model(),report(),image(),state()]}",
    'workshop-engine.js': "import {model} from './workshop-model.js';export const engine=()=> 'engine:'+model();",
    'workshop-assembly.js': "export const assembly=()=> 'assembly';",
    'workshop-model.js': "export const model=()=> 'model';",
    'workshop-report.js': "export const report=()=> 'report';",
    'workshop-image.js': "export const image=()=> 'image';",
    'workshop-state.js': "export const state=()=> 'state';"
  };
  for (const [file,text] of Object.entries(modules)) {fs.writeFileSync(path.join(root,file),text);originals.set(file,text);}
  fs.mkdirSync(path.join(root,'maps'),{recursive:true});const mapSource="import './vendor/three.module.js';export const mapRevision=1;";fs.writeFileSync(path.join(root,'maps/map-viewer.js'),mapSource);originals.set('maps/map-viewer.js',mapSource);
  for(const file of mapEntries.slice(1)){const text='export const floorRevision=1;';fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),text);originals.set(file,text);}
  for (const [i, file] of styles.entries()) {
    const text = file==='fonts.css'?formatFontFaces([font]):(file === 'seo.css' ? "@import url('/tiers.css');\n" : '') + '[data-ui-source="' + file + '"]{--source-step:' + i + ';color:rgb(' + i + ',2,3)}';
    const target = path.join(root, file); fs.mkdirSync(path.dirname(target), {recursive:true}); fs.writeFileSync(target, text); originals.set(file, text);
  }
  fs.writeFileSync(path.join(root, 'index.html'), '<!doctype html><html><head>' + styles.map(file=>'<link rel="stylesheet" href="/'+file+'">').join('') + scripts.map(file=>'<script src="/'+file+'" defer></script>').join('') + '<!-- seo:head --><title>Fixture</title><link rel="stylesheet" href="seo.css"><!-- /seo:head --></head><body></body></html>');
  const originalHeaders = '/api/*\n  Cache-Control: no-store\n  X-Content-Type-Options: nosniff\n/\n  X-Frame-Options: DENY\n';
  fs.writeFileSync(path.join(root, '_headers'), originalHeaders);
  const module = {exports:{}};
  vm.runInNewContext(source, {require:createRequire(original), module, exports:module.exports, __dirname:path.join(folder, 'scripts'), __filename:path.join(folder, 'scripts/build-ui-assets.cjs'), console}, {filename:original});
  return {root, originals, originalHeaders, ...module.exports};
}
try {
  const native=fixture('native-images'),png=Buffer.from('89504e470d0a1a0a00000000','hex'),pngName='assets/ui-native/card.'+hash(png).slice(0,20)+'.png';
  fs.mkdirSync(path.join(native.root,'assets/ui-native'),{recursive:true});fs.writeFileSync(path.join(native.root,pngName),png);
  fs.writeFileSync(path.join(native.root,'native-ui.css'),".card{background:url('/"+pngName+"')}");
  assert.equal(native.buildUiAssets().inputs[pngName],hash(png));fs.appendFileSync(path.join(native.root,pngName),'broken');assert.throws(()=>native.buildUiAssets(),/identity mismatch/);
  fs.writeFileSync(path.join(native.root,'native-ui.css'),".card{background:url('https://example.com/x.png')}");assert.throws(()=>native.buildUiAssets(),/Unknown native UI/);
  checks.push('selected native UI PNG fingerprints tracked; corrupt or external references rejected');
  const f = fixture('main');
  assert.deepEqual(Array.from(f.sources.js), scripts); assert.deepEqual(Array.from(f.sources.css), styles); assert.deepEqual(Array.from(f.sources.community), community); assert.deepEqual(Array.from(f.sources.navigation), navigation); assert.deepEqual(Array.from(f.sources.workshop),workshop);
  const first = f.buildUiAssets();
  const admin=read(path.join(f.root,'admin/index.html'));assert(admin.includes('noindex,nofollow')&&admin.includes('/'+first.community)&&admin.includes('/'+first.css),'Management shell uses current immutable runtime');
  for (const [file, text] of f.originals) {
    assert.equal(read(path.join(f.root, file)), text, 'original source modified: ' + file);
    assert.equal(first.inputs[file], hash(Buffer.from(text)), 'source hash differs: ' + file);
  }
  checks.push('source order and hashes; original bytes preserved');
  for (const kind of ['js','css','community','navigation','workshop']) {
    const bytes = fs.readFileSync(path.join(f.root, first[kind]));
    assert(first[kind].includes('.'+hash(bytes).slice(0,20)+'.'), 'output fingerprint differs: ' + kind);
    assert.equal(path.dirname(first[kind]), '.', 'runtime assets must stay at public root');
  }
  assert(/^workshop-ui\.[a-f0-9]{20}\.js$/.test(first.workshop));
  assert(/^navigation-ui\.[a-f0-9]{20}\.js$/.test(first.navigation));
  const bundledWorkshop=read(path.join(f.root,first.workshop));
  assert(/export\s*\{/.test(bundledWorkshop),'workshop output is not ESM');
  assert(!/\b(?:from\s*|import\s*\()(['"])\.\//.test(bundledWorkshop),'workshop graph retains unversioned relative modules');
  const ui = {order:[]}; vm.runInNewContext(read(path.join(f.root, first.js)), ui); assert.deepEqual(Array.from(ui.order), scripts);
  const reading = {order:[]}; vm.runInNewContext(read(path.join(f.root, first.community)), reading); assert.deepEqual(Array.from(reading.order), community);
  assert(!reading.order.includes('app.js'), 'reading community runtime loaded app');
  const directory = {order:[]}; vm.runInNewContext(read(path.join(f.root, first.navigation)), directory); assert.deepEqual(Array.from(directory.order), navigation);
  assert(!directory.order.includes('community-auth.js') && !directory.order.includes('app.js'), 'navigation-only runtime loaded application/community state');
  checks.push(`${scripts.length} classic script boundaries; ${community.length}-script reading runtime excludes app`);
  const css = read(path.join(f.root, first.css)); let previous = -1;
  for (const file of styles) { const index = css.indexOf(file==='fonts.css'?'@font-face':file); assert(index>previous, 'CSS cascade order changed: ' + file); previous=index; }
  assert(!/@import/i.test(css)); assert.equal(css.match(/data-ui-source=tiers\.css/g)?.length || css.match(/data-ui-source="tiers\.css"/g)?.length, 1, 'legacy tiers import duplicated');
  checks.push('CSS cascade order; only legacy tiers import deduplicated');
  const html = read(path.join(f.root, 'index.html'));
  const requests = [...html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="([^"]+)"/g)].map(match=>match[1]);
  assert.deepEqual(requests, ['/'+first.css, '/'+first.js]);
  checks.push('index requests exactly one CSS and one classic script');
  const headers = read(path.join(f.root, '_headers'));
  assert(headers.startsWith(f.originalHeaders), 'unowned original headers changed');
  const cache = headers.split('# wiki-ui:cache')[1].split('# /wiki-ui:cache')[0];
  assert.deepEqual([...cache.matchAll(/^\/(\S+)$/gm)].map(match=>match[1]).sort(), [first.js,first.css,first.community,first.navigation,first.workshop,...JSON.parse(read(path.join(f.root,'fonts/manifest.json'))).files.map(f=>f.file)].sort());
  assert.equal((cache.match(/Cache-Control: public, max-age=31536000, immutable/g)||[]).length, 5+JSON.parse(read(path.join(f.root,'fonts/manifest.json'))).files.length);
  assert(!cache.includes('/*'), 'immutable caching applied beyond fingerprint ownership');
  checks.push('fingerprint-only UI and verified font immutable headers; existing API/header rules preserved');
  const snapshot = ['index.html','_headers','runtime-assets.json',first.css,first.js,first.community,first.navigation,first.workshop].map(file=>[file,fs.readFileSync(path.join(f.root,file))]);
  const second = f.buildUiAssets(); assert.equal(JSON.stringify(second), JSON.stringify(first), 'manifest is not deterministic');
  for (const [file, before] of snapshot) assert(before.equals(fs.readFileSync(path.join(f.root,file))), 'repeat build changed bytes: ' + file);
  checks.push('repeat build produces identical manifest, outputs, index and headers');
  const guide = read(path.join(site, 'public/guides.js'));
  assert(guide.includes("import('./workshop.js')"),'canonical workshop lazy import changed');
  const main=read(path.join(f.root,first.js));
  assert(main.includes('import("./'+first.workshop+'")'),'workshop lazy import does not point at its fingerprint');
  assert(!main.includes('import("./workshop.js")'),'unversioned workshop import remains in main');
  const relative='./maps/map-viewer.js';
  assert(guide.includes("import('"+relative+"')"),'actual map lazy import changed');
  assert(main.includes('import("'+relative+'?v='+first.mapVersion+'")'),'map lazy import lacks its content version');
  assert.equal(first.mapVersion,hash(mapEntries.map(file=>hash(read(path.join(f.root,file)))).join(':')).slice(0,20));
  assert(!main.includes('import("'+relative+'")'),'unversioned map import remains in main');
  assert.equal(new URL(relative,'https://fixture.invalid/'+first.js).pathname,new URL(relative,'https://fixture.invalid/guides.js').pathname);
  assert.equal(new URL('./vendor/three.module.js',new URL(relative+'?v='+first.mapVersion,'https://fixture.invalid/')).pathname,'/maps/vendor/three.module.js');
  checks.push('workshop and map content versions rewritten only in generated main; canonical imports and map vendor paths preserved');
  const mapGraph=fixture('map-entry');let mapBefore=mapGraph.buildUiAssets();for(const file of mapEntries){fs.appendFileSync(path.join(mapGraph.root,file),'\nexport const changed=2;');const mapAfter=mapGraph.buildUiAssets();assert.notEqual(mapAfter.js,mapBefore.js);assert.notEqual(mapAfter.mapVersion,mapBefore.mapVersion);for(const kind of ['css','community','navigation','workshop'])assert.equal(mapAfter[kind],mapBefore[kind]);assert.equal(JSON.stringify(mapGraph.buildUiAssets()),JSON.stringify(mapAfter));mapBefore=mapAfter;}checks.push('each map module rotates main only; repeated build deterministic');
  const graph=fixture('workshop-graph');let graphBuild=graph.buildUiAssets();
  fs.writeFileSync(path.join(graph.root,'workshop-ui.not-owned.js'),'unowned workshop asset');
  for(const file of workshop){
    const prior=graphBuild;fs.appendFileSync(path.join(graph.root,file),'\nglobalThis.workshopRevision=(globalThis.workshopRevision||0)+1;');
    graphBuild=graph.buildUiAssets();
    assert.notEqual(graphBuild.workshop,prior.workshop,'ESM graph change did not rotate entry: '+file);assert.notEqual(graphBuild.js,prior.js,'ESM graph change did not rotate main: '+file);
    assert.equal(graphBuild.css,prior.css);assert.equal(graphBuild.community,prior.community);assert.equal(graphBuild.navigation,prior.navigation);
    assert(read(path.join(graph.root,graphBuild.js)).includes('import("./'+graphBuild.workshop+'")'));
    assert.equal(JSON.stringify(graph.buildUiAssets()),JSON.stringify(graphBuild),'ESM graph repeat build is not deterministic');
  }
  graph.cleanUiAssets();for(const file of graphBuild.retired)assert(!fs.existsSync(path.join(graph.root,file)),'retired ESM/main asset retained');
  for(const file of [graphBuild.js,graphBuild.css,graphBuild.community,graphBuild.navigation,graphBuild.workshop])assert(fs.existsSync(path.join(graph.root,file)),'current ESM graph output removed');
  assert.equal(read(path.join(graph.root,'workshop-ui.not-owned.js')),'unowned workshop asset');
  for(const file of workshop)assert.equal(read(path.join(graph.root,file)),graph.originals.get(file)+'\nglobalThis.workshopRevision=(globalThis.workshopRevision||0)+1;');
  checks.push('each ESM graph module rotates workshop/main only; deterministic rebuild and owned retirement cleanup');
  const nav=fixture('navigation-graph');let navBuild=nav.buildUiAssets();
  fs.writeFileSync(path.join(nav.root,'navigation-ui.not-owned.js'),'unowned navigation asset');
  for(const file of navigation){
    const prior=navBuild;fs.appendFileSync(path.join(nav.root,file),'\nglobalThis.navigationRevision=(globalThis.navigationRevision||0)+1;');
    navBuild=nav.buildUiAssets();
    for(const kind of ['js','community','navigation'])assert.notEqual(navBuild[kind],prior[kind],'navigation source did not rotate '+kind+': '+file);
    assert.equal(navBuild.css,prior.css);assert.equal(navBuild.workshop,prior.workshop);
    assert.equal(JSON.stringify(nav.buildUiAssets()),JSON.stringify(navBuild),'navigation rebuild is not deterministic');
  }
  nav.cleanUiAssets();for(const file of navBuild.retired)assert(!fs.existsSync(path.join(nav.root,file)),'retired navigation/runtime asset retained');
  for(const kind of ['js','css','community','navigation','workshop'])assert(fs.existsSync(path.join(nav.root,navBuild[kind])),'current navigation graph asset removed');
  assert.equal(read(path.join(nav.root,'navigation-ui.not-owned.js')),'unowned navigation asset');
  for(const file of navigation)assert.equal(read(path.join(nav.root,file)),nav.originals.get(file)+'\nglobalThis.navigationRevision=(globalThis.navigationRevision||0)+1;');
  checks.push('each navigation source rotates main/community/navigation only; standalone order, deterministic rebuild and owned retirement cleanup');
  const changedSource = path.join(f.root, 'vendor/post-markdown.js');
  fs.appendFileSync(changedSource, ';\nglobalThis.uiRevision=2;');
  fs.writeFileSync(path.join(f.root, 'keep.dat'), 'unowned asset');
  const changed = f.buildUiAssets();
  assert.notEqual(changed.js, first.js); assert.notEqual(changed.community, first.community); assert.equal(changed.css, first.css); assert.equal(changed.navigation, first.navigation);
  assert.deepEqual(Array.from(changed.retired).sort(), [first.js,first.community].sort());
  f.cleanUiAssets();
  for (const file of changed.retired) assert(!fs.existsSync(path.join(f.root,file)), 'retired owned asset was not removed');
  for (const file of [changed.js,changed.css,changed.community,changed.navigation,changed.workshop]) assert(fs.existsSync(path.join(f.root,file)), 'current output was removed');
  assert.equal(read(path.join(f.root, 'keep.dat')), 'unowned asset');
  assert.equal(read(changedSource), f.originals.get('vendor/post-markdown.js')+';\nglobalThis.uiRevision=2;');
  assert.deepEqual(JSON.parse(read(path.join(f.root,'runtime-assets.json'))).retired, []);
  checks.push('semantic source change rotates JS fingerprints; cleanup removes only retired owned outputs');
  const invalid = fixture('invalid-retired'); const valid = invalid.buildUiAssets();
  const sentinel = path.join(path.dirname(invalid.root), 'keep.txt'); fs.writeFileSync(sentinel, 'must remain');
  const manifest = {...valid, retired:['../keep.txt']}; fs.writeFileSync(path.join(invalid.root, 'runtime-assets.json'), JSON.stringify(manifest));
  const before = read(path.join(invalid.root, 'index.html'));
  assert.throws(()=>invalid.buildUiAssets(), /Unknown generated UI asset/);
  assert.throws(()=>invalid.cleanUiAssets(), /Unknown generated UI asset/);
  assert.equal(read(sentinel), 'must remain'); assert.equal(read(path.join(invalid.root, 'index.html')), before);
  checks.push('unknown retired paths rejected by build and cleanup');
  const invalidNav = fixture('invalid-navigation'); const validNav = invalidNav.buildUiAssets();
  fs.writeFileSync(path.join(invalidNav.root,'runtime-assets.json'),JSON.stringify({...validNav,navigation:'navigation-ui.not-owned.js'}));
  assert.throws(()=>invalidNav.buildUiAssets(), /Unknown generated UI asset/);
  assert(fs.existsSync(path.join(invalidNav.root,validNav.navigation)), 'invalid manifest removed the current navigation output');
  checks.push('malformed previous navigation fingerprint rejected before retirement');
  const unsafeCss = fixture('relative-css'); fs.appendFileSync(path.join(unsafeCss.root, 'styles.css'), '\na{background:url(./image.png)}');
  assert.throws(()=>unsafeCss.buildUiAssets(), /CSS asset rebasing required/);
  const unknownImport = fixture('unknown-import'); fs.appendFileSync(path.join(unknownImport.root, 'styles.css'), '\n@import url("/future.css");');
  assert.throws(()=>unknownImport.buildUiAssets(), /CSS asset rebasing required/);
  checks.push('new CSS relative assets/imports rejected rather than silently rebased');
  const fontTamper=fixture('font-checksum');const fm=JSON.parse(read(path.join(fontTamper.root,'fonts/manifest.json')));fs.appendFileSync(path.join(fontTamper.root,fm.files[0].file),'changed');assert.throws(()=>fontTamper.buildUiAssets(),/Font size|Font checksum/);
  const fontEscape=fixture('font-path');const escaped=JSON.parse(read(path.join(fontEscape.root,'fonts/manifest.json')));escaped.files[0].file='../outside.woff2';fs.writeFileSync(path.join(fontEscape.root,'fonts/manifest.json'),JSON.stringify(escaped));assert.throws(()=>fontEscape.buildUiAssets(),/Unsafe font asset path/);
  for(const[payload,label]of[['a{background:url("/fonts/fixture.woff2")}','font-background'],['@import url("https://example.test/font.css");','font-import'],['@font-face{font-family:x;src:url("https://example.test/x.woff2")}','font-remote']]){const bad=fixture(label);fs.appendFileSync(path.join(bad.root,'fonts.css'),payload);assert.throws(()=>bad.buildUiAssets(),/Only manifest font-face declarations/);}
  checks.push('only verified local font faces allowed; changed binary, escaped paths, remote/import/background URLs rejected');
  fs.mkdirSync(path.dirname(report), {recursive:true});
  const result={status:'PASS',checks,sourceSHA256:hash(source),fixture:output,scriptCount:scripts.length,cssCount:styles.length,communityScriptCount:community.length,navigationScriptCount:navigation.length,workshopModuleCount:workshop.length,realPublicMutated:false};
  fs.writeFileSync(report,JSON.stringify(result,null,2)+'\n'); console.log(JSON.stringify(result));
} catch(error) {
  fs.mkdirSync(path.dirname(report), {recursive:true}); fs.writeFileSync(report,JSON.stringify({status:'FAIL',checks,error:error.stack,sourceSHA256:hash(source),fixture:output,realPublicMutated:false},null,2)+'\n'); throw error;
}
