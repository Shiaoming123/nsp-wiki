const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const {transformSync, buildSync} = require('esbuild');
const {readFontAssets}=require('../lib/font-assets.cjs');
const root = path.resolve(__dirname, '../public');
const sources = {
  css: ['ui-tokens.css','fonts.css','styles.css','guides.css','loot.css','corruption.css','workshop.css','design.css','maps/map-viewer.css','maps/floor-guide.css','maps/floor-tower.css','maps/floor-plan.css','tiers.css','posts.css','item-community.css','feedback.css','npc-recipes.css','welcome.css','seo.css','ui-refinement.css','updates.css','navigation.css','mechanics.css','traffic.css','terminal.css','library.css','exploration.css','components.css','typography.css'],
  navigation: ['typography.js','welcome.js','scroll-motion.js','navigation.js','traffic.js','mechanics-calc.js','mechanics.js','card-image.js'],
  community: ['typography.js','welcome.js','scroll-motion.js','navigation.js','traffic.js','mechanics-calc.js','mechanics.js','card-image.js','vendor/post-markdown.js','community-auth.js','item-community.js','feedback.js'],
  workshop: ['workshop.js','workshop-engine.js','workshop-assembly.js','workshop-model.js','workshop-report.js','workshop-image.js','workshop-state.js'],
  js: ['typography.js','welcome.js','scroll-motion.js','navigation.js','traffic.js','mechanics-calc.js','mechanics.js','card-image.js','vendor/post-markdown.js','community-auth.js','site-notice.js','item-community.js','app.js','tiers.js','posts.js','corruption.js','feedback.js','enemy-variants.js','enemy-guide-videos.js','quest-supplies.js','quest-progress.js','quest-semantics.js','npc-recipes.js','updates.js','loot.js','guides.js','scroll-tools.js']
};
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const owned = /^(?:(?:wiki-ui|community-ui|navigation-ui)\.[a-f0-9]{20}\.(?:js|css)|workshop-ui\.[a-f0-9]{20}\.js)$/;
function replaceBlock(text, name, block) {
  const start = `<!-- wiki-ui:${name} -->`, end = `<!-- /wiki-ui:${name} -->`;
  return text.replace(new RegExp(start + '[\\s\\S]*?' + end), start + '\n' + block + '\n' + end);
}
function buildUiAssets() {
  require('../lib/visual-history.cjs').assertPublicArchive(root);
  const file = path.join(root, 'runtime-assets.json');
  const previous = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  if (![...(previous.retired || []), previous.js, previous.css, previous.community, previous.navigation, previous.workshop].filter(Boolean).every(name => owned.test(name))) throw Error('Unknown generated UI asset');
  const result = {schemaVersion: 1, inputs: {}, retired: [...(previous.retired || []), previous.js, previous.css, previous.community, previous.navigation, previous.workshop].filter(Boolean)};
  const mapEntries=['maps/map-viewer.js','maps/floor-guide.js','maps/floor-tower.js','maps/office-transit.js','maps/floor-plan.js'];
  for(const name of mapEntries)result.inputs[name]=hash(fs.readFileSync(path.join(root,name),'utf8'));
  result.mapVersion=hash(mapEntries.map(name=>result.inputs[name]).join(':')).slice(0,20);
  for (const name of sources.workshop) result.inputs[name] = hash(fs.readFileSync(path.join(root, name), 'utf8'));
  const workshop = buildSync({entryPoints:[path.join(root, 'workshop.js')],bundle:true,format:'esm',platform:'browser',write:false,minify:true,target:'es2022',legalComments:'inline'}).outputFiles[0].text;
  result.workshop = `workshop-ui.${hash(workshop).slice(0,20)}.js`;
  fs.writeFileSync(path.join(root, result.workshop), workshop);
  for (const kind of ['css', 'js', 'community', 'navigation']) {
    const text = sources[kind].map(name => {
      let data = fs.readFileSync(path.join(root, name), 'utf8');
      result.inputs[name] = hash(data);
      if (kind === 'js' && name === 'guides.js') {
        const lazyWorkshop = /import\((['"])\.\/workshop\.js\1\)/g;
        if (!data.match(lazyWorkshop)?.length) throw Error('Missing workshop deferred import');
        data = data.replace(lazyWorkshop, `import('./${result.workshop}')`);
        const lazyMap=/import\((['"])\.\/maps\/map-viewer\.js\1\)/g;
        if(!data.match(lazyMap)?.length)throw Error('Missing map deferred import');
        data=data.replace(lazyMap,`import('./maps/map-viewer.js?v=${result.mapVersion}')`);
      }
      if (name === 'seo.css') data = data.replace(/^@import url\('\/tiers\.css'\);\s*/, '');
      if(kind==='css'&&name==='fonts.css')Object.assign(result.inputs,readFontAssets(root,data));
      else if (kind === 'css' && /url\s*\(|@import/i.test(data)) throw Error('CSS asset rebasing required: ' + name);
      return data;
    }).join(kind === 'css' ? '\n' : '\n;\n');
    const output = transformSync(text, {loader: kind === 'css' ? 'css' : 'js', minify: true, target: 'es2022', legalComments: 'inline'}).code;
    result[kind] = `${kind === 'community' ? 'community-ui' : kind === 'navigation' ? 'navigation-ui' : 'wiki-ui'}.${hash(output).slice(0, 20)}.${kind === 'css' ? 'css' : 'js'}`;
    fs.writeFileSync(path.join(root, result[kind]), output);
  }
  result.retired = [...new Set(result.retired)].filter(name => ![result.js,result.css,result.community,result.navigation,result.workshop].includes(name));
  if (!result.retired.every(name => owned.test(name))) throw Error('Unknown generated UI asset');
  fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\n');
  const index = path.join(root, 'index.html'); let html = fs.readFileSync(index, 'utf8');
  if (!html.includes('<!-- wiki-ui:assets -->')) {
    const end = html.indexOf('<!-- seo:head -->'); if (end < 0) throw Error('Missing index SEO boundary');
    let head = html.slice(0, end);
    head = head.replace(/\s*<link\b[^>]*rel="stylesheet"[^>]*>/g, '').replace(/\s*<script\b[^>]*src="[^"]+"[^>]*><\/script>/g, '');
    html = head + '\n<!-- wiki-ui:assets --><!-- /wiki-ui:assets -->' + html.slice(end);
  }
  html = html.replace(/<link\b[^>]*rel="stylesheet"[^>]*href="\/?seo\.css"[^>]*>/g, '');
  html = replaceBlock(html, 'assets', `<link rel="stylesheet" href="/${result.css}">\n<script src="/${result.js}" defer></script>`);
  fs.writeFileSync(index, html);
  const headersFile = path.join(root, '_headers');
  let headers = fs.existsSync(headersFile) ? fs.readFileSync(headersFile, 'utf8') : '';
  const start = '# wiki-ui:cache', end = '# /wiki-ui:cache';
  const fontPaths=Object.keys(result.inputs).filter(name=>name.startsWith('fonts/')&&name.endsWith('.woff2'));
  const block = `${start}\n${[result.js,result.css,result.community,result.navigation,result.workshop,...fontPaths].map(name=>`/${name}\n  Cache-Control: public, max-age=31536000, immutable`).join('\n')}\n${end}`;
  headers = headers.includes(start) ? headers.replace(new RegExp(start + '[\\s\\S]*?' + end), block) : headers.trimEnd() + '\n' + block;
  fs.writeFileSync(headersFile, headers.trimEnd() + '\n');
  return result;
}
function cleanUiAssets() {
  const file = path.join(root, 'runtime-assets.json'), manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const name of manifest.retired) {
    if (!owned.test(name)) throw Error('Unknown generated UI asset');
    const target = path.join(root, name); if (fs.existsSync(target)) fs.unlinkSync(target);
  }
  manifest.retired = []; fs.writeFileSync(file, JSON.stringify(manifest, null, 2) + '\n');
}
module.exports = {buildUiAssets, cleanUiAssets, sources};
if (require.main === module) console.log(JSON.stringify(buildUiAssets()));
