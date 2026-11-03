// Render with the existing guide UI so the reading pages retain its data semantics.
const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), zlib = require('node:zlib');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const {buildUiAssets, cleanUiAssets, sources: uiSources} = require('./build-ui-assets.cjs');
const WikiNav=require('../lib/wiki-navigation.cjs');
const WikiBrand=require('../lib/wiki-brand.cjs');
const indexFile=path.resolve(__dirname,'../public/index.html');
let initialIndex=fs.readFileSync(indexFile,'utf8');
const brandIcons='<!-- wiki:brand-icons -->'+WikiBrand.head+'<!-- /wiki:brand-icons -->';
const brandMark='<!-- wiki:brand-mark -->'+WikiBrand.mark+'<!-- /wiki:brand-mark -->';
initialIndex=initialIndex.includes('<!-- wiki:brand-icons -->')?initialIndex.replace(/<!-- wiki:brand-icons -->[\s\S]*?<!-- \/wiki:brand-icons -->/,brandIcons):initialIndex.replace(/<link rel="icon"[^>]*>/,brandIcons);
initialIndex=initialIndex.includes('<!-- wiki:brand-mark -->')?initialIndex.replace(/<!-- wiki:brand-mark -->[\s\S]*?<!-- \/wiki:brand-mark -->/,brandMark):initialIndex.replace('<span class="brand-mark" aria-hidden="true">⌘</span>',brandMark);
if(!initialIndex.includes(brandIcons)||!initialIndex.includes(brandMark))throw Error('Shared brand markers missing');
const channelBlock='<!-- wiki:channels -->'+WikiNav.navigation()+'<!-- /wiki:channels -->';
initialIndex=initialIndex.includes('<!-- wiki:channels -->')?initialIndex.replace(/<!-- wiki:channels -->[\s\S]*?<!-- \/wiki:channels -->/,channelBlock):initialIndex.replace(/<nav class="top-nav"[^>]*>[\s\S]*?<\/nav>/,channelBlock);
const homeTemplate='<template id="home-template">'+WikiNav.home()+'</template>';
initialIndex=initialIndex.includes('<template id="home-template">')?initialIndex.replace(/<template id="home-template">[\s\S]*?<\/template>/,homeTemplate):initialIndex.replace('</main>','</main>'+homeTemplate);
initialIndex=initialIndex.replace(/id="edition"(?: hidden)*/,'id="edition" hidden');
fs.writeFileSync(indexFile,initialIndex);
const uiAssets = buildUiAssets();
const ROOT = path.resolve(__dirname, '..', 'public'), ORIGIN = process.env.SEO_INDEXABLE === '1' ? 'https://nsp-wiki.netlify.app' : 'https://nsp.henshiaoming.chatgpt.site';
// Codex is the test origin; only the mirror package enables search indexing.
const INDEXABLE = process.env.SEO_INDEXABLE === '1';
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const plain = x => String(x ?? '').replace(/<\/?(?:b|i|s|u|color|gradient)(?:=[^<>]*)?\s*>/gi, '').replace(/\s+/g, ' ').trim();
const read = f => { const data=fs.readFileSync(path.join(ROOT,f));return JSON.parse((f.endsWith('.gz')?zlib.gunzipSync(data):data).toString('utf8')); };
const items = read('data/items.json'), quests = read('data/quests.json'), enemies = read('data/enemies.json'), maps = read('maps/data/maps.json'), mirror=read('data/mirror.json'), corruption=read('data/corruption.json');
const npcs=read('data/npcs.json'),recipes=read('data/recipes.json'),updates=read('data/updates.json'),mechanics=read('data/mechanics.json');
const statuses=read('data/status-effects.json');
const containerLoot=read('data/container-loot.json');
for(const data of [npcs,recipes])if(data.meta?.edition!=='EA'||!/^\d+$/.test(data.meta.buildId))throw new Error('NPC/recipe identity missing');
for(const data of [items,quests,enemies,mirror,corruption])if(data.meta?.edition!=='EA'||!/^\d+$/.test(String(data.meta.buildId)))throw new Error('EA module identity missing');
const mapData = new Map(maps.map(m=>{
  const file=path.join('maps','data',m.manifest),manifest=read(file),base=path.dirname(file);
  if(manifest.status!=='EA'||!/^\d+$/.test(String(manifest.dataBuild))||!/^\d+$/.test(String(manifest.geometryBuild)))throw new Error('SEO map data/geometry identity missing: '+m.id);
  const pois=read(path.join(base,manifest.pois.url));read(path.join(base,manifest.overview.geometry));
  return [m.id,{manifest,poiCount:pois.points.length}];
}));
const variantModule={exports:{}};require('node:vm').runInNewContext(fs.readFileSync(path.join(ROOT,'enemy-variants.js'),'utf8'),{module:variantModule});const enemyVariants=variantModule.exports.summarize(enemies.enemies);
const edition = `EA Build ${items.meta.buildId}`;
const moduleData={items,quests,enemies,npcs,recipes,mirror,corruption,workshop:read('data/workshop.json')};
function versionLabel(section){
  const meta=moduleData[section]?.meta;if(!meta)return '';
  if(meta.acquisitionBuildId)return `基础资料 EA Build ${meta.buildId}；获取来源及公告相关变更静态核对 Build ${meta.acquisitionBuildId}，其他字段保留原核验版本`;
  return `EA Build ${meta.buildId}`+(meta.partialUpdate?`；Build ${meta.partialUpdate.buildId} 局部更新：${meta.partialUpdate.scope}（未实机验证）`:'');
}
const inputFiles=['data/updates.json','updates.js','updates.css','data/items.json','data/quests.json','data/enemies.json','data/mirror.json','data/corruption.json','maps/data/maps.json','app.js','guides.js','guides.css','enemy-variants.js','enemy-guide-videos.js','quest-supplies.js','corruption.js','corruption.css','welcome.js','welcome.css','feedback.js','feedback.css','quest-semantics.js','workshop-report.js','workshop-image.js','workshop.js','workshop-engine.js','workshop-model.js','workshop-assembly.js','workshop.css','data/workshop.json','data/assembly-ui.json','community-auth.js','item-community.js','item-community.css','design.css','maps/map-viewer.js','maps/map-viewer.css'];
for(const m of maps){const file=path.join('maps','data',m.manifest),manifest=mapData.get(m.id).manifest;inputFiles.push(file,path.join(path.dirname(file),manifest.pois.url),path.join(path.dirname(file),manifest.overview.geometry));}
inputFiles.push('data/navigation.json','data/mechanics.json','data/npcs.json','data/recipes.json','npc-recipes.js','npc-recipes.css');
inputFiles.push('data/status-effects.json');
inputFiles.push('data/container-loot.json','loot.js','loot.css');
inputFiles.push(...new Set(Object.values(uiSources).flat()),'runtime-assets.json',uiAssets.js,uiAssets.css,uiAssets.community,uiAssets.navigation,uiAssets.workshop);
inputFiles.push(...WikiBrand.files);
const inputSnapshot=new Map(inputFiles.map(file=>[file,fs.readFileSync(path.join(ROOT,file))]));
const sections = [['updates','更新档案'],['items','物品图鉴'],['quests','任务攻略'],['enemies','敌怪图鉴'],['npcs','NPC 图鉴'],['recipes','配方手册'],['mirror','迷失镜柜'],['corruption','腐化词条'],['maps','地图全览'],['loot','容器与搜刮'],['workshop','武器工坊'],['tiers','夯拉榜'],['feedback','Wiki 反馈'],['mechanics','机制手册']];
const routes = new Map(), pages = [];
routes.set('#home','/');
for(const term of mechanics.mechanics)routes.set('#mechanic/'+term.id,`/mechanics/${term.id}/`);
for(const state of statuses.statuses)routes.set('#mechanics/status/'+state.id,'/mechanics/#status-'+state.id);
for(const map of containerLoot.maps){routes.set('#loot/'+map.id,'/loot/'+map.id+'/');for(const box of map.containers)routes.set('#loot/'+map.id+'/'+box.id,'/loot/'+map.id+'/#loot-box-'+box.id);}
for(const record of updates.records)routes.set('#updates/'+record.id+'/all/all','/updates/#update-'+record.id);
const route = (kind, id) => `/${kind}/${id == null ? '' : encodeURIComponent(id) + '/'}`;
for (const [kind] of sections) routes.set('#' + kind, route(kind));
for (const [kind, values] of [['item',items.items],['quest',quests.missions],['enemy',enemies.enemies],['maps',maps]])
  for (const r of values) routes.set(`#${kind}/${encodeURIComponent(r.id)}`, route(({item:'items',quest:'quests',enemy:'enemies'})[kind] || kind, r.id));
for (const r of items.archivedItems || []) routes.set(`#item/${encodeURIComponent(r.id)}`, route('items',r.id));
for(const [kind,values] of [['npc',npcs.npcs],['recipe',recipes.recipes]])for(const r of values)routes.set('#'+kind+'/'+encodeURIComponent(r.id),route(kind==='npc'?'npcs':'recipes',r.id));
for(const r of corruption.affixes)routes.set('#affix/'+encodeURIComponent(r.id),route('corruption',r.id));
for (const [kind,records] of [['quest',quests.archivedMissions],['enemy',enemies.archivedEnemies]])for(const r of records||[])routes.set(`#${kind}/${encodeURIComponent(r.id)}`,route(kind==='quest'?'quests':'enemies',r.id));
const link = (href, text) => `<a href="${esc(href)}">${esc(plain(text))}</a>`;
const nav = sections.map(([kind,label]) => link(route(kind),label)).join('');
const searchIndex=[];
function indexRecords(records,kind,type,name='name'){
  for(const r of records){
    if(!r[name])continue;
    const section={item:'items',quest:'quests',enemy:'enemies',npc:'npcs',recipe:'recipes',affix:'corruption',mechanic:'mechanics'}[kind]||kind;
    const channel=WikiNav.data.channels.find(c=>c.sections.some(s=>s.id===section));
    searchIndex.push({name:plain(r[name]),text:plain([r[name],r.summary||'',r.subcategory||'',...(r.aliases||[])].join(' ')).toLocaleLowerCase(),type:kind==='item'?[type,r.subcategory].filter(Boolean).join(' · '):type,channel:channel?.id||'',route:'/#'+kind+'/'+encodeURIComponent(r.id)});
  }
}
const mechanicEntries=mechanics.mechanics.filter(t=>t.id!=='magic-hat-three'),hatExample=mechanics.mechanics.find(t=>t.id==='magic-hat-three');
for(const state of statuses.statuses)searchIndex.push({name:state.name,text:plain([state.name,state.scope||'',state.summary,...state.effects,...state.sources].join(' ')).toLocaleLowerCase(),type:'状态效果'+(state.scope?' · '+state.scope:''),channel:'builds',route:'/#mechanics/status/'+encodeURIComponent(state.id)});
for(const map of containerLoot.maps)for(const box of map.containers)searchIndex.push({name:box.name,text:plain([map.name,box.name].join(' ')).toLocaleLowerCase(),type:(box.nameKind==='wiki'?'搜刮容器（Wiki识别名） · ':'搜刮容器 · ')+map.name,channel:'explore',route:'/#loot/'+encodeURIComponent(map.id)+'/'+encodeURIComponent(box.id)});
indexRecords(items.items,'item','物品图鉴');indexRecords(quests.missions,'quest','任务攻略');indexRecords(enemies.enemies,'enemy','敌怪图鉴');indexRecords(npcs.npcs,'npc','NPC 图鉴');indexRecords(recipes.recipes,'recipe','配方手册');indexRecords(corruption.affixes,'affix','腐化词条');indexRecords(maps,'maps','地图全览','title');indexRecords(mechanicEntries.map(t=>t.id==='phase-shift'?{...t,aliases:[hatExample.name,hatExample.summary]}:t),'mechanic','机制手册');
for(const c of WikiNav.data.channels)for(const section of c.sections)searchIndex.push({name:section.name,text:section.name,type:c.name,channel:c.id,route:'/#'+section.id});
fs.writeFileSync(path.join(ROOT,'data/search-index.json'),JSON.stringify(searchIndex)+'\n');
const rootTitle = '查无此地攻略：物品、任务、敌怪与地图 | NSP Wiki';
const rootDesc = `查无此地 EA 攻略：${items.items.length} 件物品、${quests.missions.length} 项任务、${enemies.enemies.length} 个敌怪、${maps.length} 张地图与 ${corruption.affixes.length} 个腐化词条，包含镜柜概率表、玩家夯拉榜和 Wiki 反馈。`;
const json = x => JSON.stringify(x).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
function metadata(url, title, description, crumbs = [], image = '', noindex = false) {
  const data = [{'@context':'https://schema.org','@type':url==='/'?'WebSite':'WebPage',name:title,url:ORIGIN+url,description,inLanguage:'zh-CN'}];
  if(crumbs.length) data.push({'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:crumbs.map(([label,href],i)=>({'@type':'ListItem',position:i+1,name:plain(label),item:ORIGIN+href}))});
  return `<title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="${noindex||!INDEXABLE?'noindex,follow':'index,follow,max-image-preview:large'}">${noindex?'':`<link rel="canonical" href="${esc(ORIGIN+url)}">`}<meta property="og:type" content="website"><meta property="og:site_name" content="NSP Wiki"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(ORIGIN+url)}"><meta property="og:locale" content="zh_CN"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}">${image?`<meta property="og:image" content="${esc(ORIGIN+'/'+image)}"><meta name="twitter:image" content="${esc(ORIGIN+'/'+image)}">`:''}<script type="application/ld+json">${json(data)}</script>`;
}
function write(url, title, description, body, section = '', image = '', noindex = false) {
  const mapWarning=section==='maps'?maps.find(m=>route('maps',m.id)===url)?.updateWarning:null;
  if(mapWarning)body=`<p class="guide-note">${esc(mapWarning)} ${link('/#updates','查看更新档案')}</p>`+body;
  const label = sections.find(([key])=>key===section)?.[1];
  const crumbs = [['攻略首页','/']];
  if (label) crumbs.push([label,route(section)]);
  if (url!==route(section)) crumbs.push([title.split(' | ')[0],url]);
  const breadcrumb = crumbs.map(([text,href])=>link(href,text)).join('<span aria-hidden="true"> / </span>');
  const interactive=body.includes('compact-item-details')||body.includes('corruption-detail')||section==='feedback';
  const community=interactive?`<script src="/${uiAssets.community}" defer></script>`+(section==='feedback'?'<script>document.addEventListener("DOMContentLoaded",()=>WikiFeedback.mountStatic(document.getElementById("wiki-feedback-static")));</script>':''):`<script src="/${uiAssets.navigation}" defer></script>`;
  const stamp='';
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#202927">${metadata(url,title,description,crumbs,image,noindex)}${WikiBrand.head}<link rel="stylesheet" href="/${uiAssets.css}">${community}</head><body class="seo-page"><a class="skip-link" href="#main-content">跳到攻略内容</a><header class="site-header"><a class="brand" href="/" aria-label="返回攻略首页">${WikiBrand.mark}<span>查无此地 <small>生存手册</small></span></a>${WikiNav.navigation(section,true)}</header><main id="main-content" tabindex="-1"><nav class="breadcrumbs" aria-label="当前位置">${breadcrumb}</nav><article>${stamp?`<p class="guide-note">${esc(stamp)}</p>`:''}${body}</article></main><footer><span>查无此地 · 生存手册</span>${link('/','返回交互图鉴')}</footer></body></html>`;
  const filename = url==='/404.html'?path.join(ROOT,'404.html'):path.join(ROOT,...url.split('/').filter(Boolean),'index.html');
  fs.mkdirSync(path.dirname(filename),{recursive:true});fs.writeFileSync(filename,html.replace(/[ \t]+(?=\r?$)/gm,''));
  if(!noindex) pages.push({url,title,description,filename:path.relative(ROOT,filename).replace(/\\/g,'/')});
}
function listing(records, kind) {
  return `<ul class="reading-list">${records.map(r=>`<li>${r.icon||r.image?`<img src="/${esc(r.icon||r.image)}" alt="${esc(plain(r.name||r.title||r.subcategory||'物品'))}" width="48" height="48" loading="lazy" decoding="async">`:''}${link(route(kind,r.id),(r.name||r.title||r.subcategory||'物品')+(kind==='enemies'&&enemyVariants.has(r.id)?' · '+enemyVariants.get(r.id).facts.join(' · '):''))}</li>`).join('')}</ul>`;
}
function intro(title, copy, hash) {return `<h1>${esc(title)}</h1><p class="description">${esc(copy)}</p><p>${link('/'+hash,'进入交互页面')}</p>`;}
async function snapshot(page, selector) {
  return page.locator(selector).evaluate((node,mapping)=>{
    const root=node.cloneNode(true), routes=new Map(mapping);
    root.querySelectorAll('.item-community,.item-community-toolbar,.card-capture-tools').forEach(n=>n.remove());
    root.querySelectorAll('button.stat-definition').forEach(n=>n.replaceWith(document.createTextNode(n.textContent)));
    root.querySelectorAll('button,input,select,.static-guide-link,.guide-search,.result-count,.reference-toolbar').forEach(n=>n.remove());
    root.querySelectorAll('[aria-live], [hidden], [tabindex]').forEach(n=>{n.removeAttribute('aria-live');n.removeAttribute('hidden');n.removeAttribute('tabindex');});
    root.querySelectorAll('img').forEach(n=>{const src=n.getAttribute('src');if(src&&!src.startsWith('/'))n.setAttribute('src','/'+src);n.setAttribute('loading','lazy');n.setAttribute('decoding','async');if(!n.alt)n.alt=(n.closest('.detail-hero')?.querySelector('h2')?.textContent||n.closest('a')?.textContent||'物品图标').trim();});
    root.querySelectorAll('[style]').forEach(n=>n.setAttribute('style',n.getAttribute('style').replace(/url\(["']?(?!\/|https?:)([^)"']+)["']?\)/g, 'url("/$1")')));
    root.querySelectorAll('a[href]').forEach(n=>{const href=n.getAttribute('href');if(routes.has(href))n.setAttribute('href',routes.get(href));else if(href.startsWith('#'))n.setAttribute('href','/'+href);});
    const title=root.querySelector('h2');if(title&&!root.querySelector('h1')){const h=document.createElement('h1');h.textContent=title.textContent;title.replaceWith(h);}
    root.querySelectorAll('h3.detail-section-title,h4').forEach(old=>{const heading=document.createElement(old.tagName==='H3'?'h2':'h3');heading.className=old.className;heading.replaceChildren(...old.childNodes);old.replaceWith(heading);});
    return root.outerHTML;
  }, [...routes]);
}
async function main() {
  const server=http.createServer((req,res)=>{
    try {
      const url=new URL(req.url,'http://localhost'), target=path.resolve(ROOT,'.'+decodeURIComponent(url.pathname));
      if(target!==ROOT&&!target.startsWith(ROOT+path.sep)){res.writeHead(403);return res.end();}
      const filename=fs.existsSync(target)&&fs.statSync(target).isDirectory()?path.join(target,'index.html'):target;
      if(!fs.existsSync(filename)||!fs.statSync(filename).isFile()){res.writeHead(404);return res.end();}
      const type={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'}[path.extname(filename)]||'application/octet-stream';
      res.writeHead(200,{'Content-Type':type});fs.createReadStream(filename).pipe(res);
    } catch {res.writeHead(400);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({executablePath:process.env.EDGE_PATH||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
  try {
    const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{window.WIKI_STATIC_BUILD=true;});
    await page.goto(origin+'/#items');await page.waitForFunction(()=>window.Wiki?.data);
    await page.evaluate(()=>Corruption.load());
    const names=new Map();
    for(const [kind,records,label] of [['items',items.items,'属性与获取方式'],['quests',quests.missions,'前置、目标与奖励'],['enemies',enemies.enemies,'属性、出没与战利品']]) {
      names.clear();for(const r of records)names.set(plain(r.name),(names.get(plain(r.name))||0)+1);
      if(kind!=='items'){await page.goto(origin+(kind==='quests'?'/#quest/':'/#enemy/')+encodeURIComponent(records[0].id));await page.locator(kind==='quests'?'#quest-detail-title':'#detail-title').waitFor();}
      for(const r of records) {
        let body;
        if(kind==='items') {await page.evaluate(id=>document.getElementById('detail-content').replaceChildren(Wiki.itemDetails(Wiki.getItem(id))),r.id);await page.waitForFunction(()=>document.querySelector('#detail-content .detail-body')?.dataset.corruption==='ready'&&document.querySelector('#detail-content .detail-body')?.dataset.npcRecipes==='ready');body=await snapshot(page,'#detail-content > .compact-item-details');}
        else {await page.evaluate(hash=>{location.hash=hash},`#${kind==='quests'?'quest':'enemy'}/${encodeURIComponent(r.id)}`);await page.waitForFunction(({kind,id})=>document.querySelector((kind==='quests'?'#quest-sidebar':'#detail-content')+' .static-guide-link')?.getAttribute('href')===`/${kind}/${encodeURIComponent(id)}/`,{kind,id:r.id});body=await snapshot(page,kind==='quests'?'#quest-sidebar > .quest-detail':'#detail-content > .guide-detail');}
        const name=plain(r.name||(kind==='items'?r.subcategory:'')), unique=names.get(name)>1?(kind==='enemies'?`${name} · ${enemyVariants.get(r.id).facts.join(' · ')}`:`${name} · ${r.subcategory||label}`):name;
        // These six suffixes are part of the verified native Chinese squad names.
        if(kind==='enemies'&&/[A-Za-z_]/.test(name.replace(/ - (?:CRT|NBK|KJR|VZM|PLK|DNK)$/,'')))throw new Error('Enemy display name still contains an internal identifier: '+r.id);
        const description=`查无此地 ${versionLabel(kind)} ${name}：${plain(r.description).slice(0,90)||'描述待核实。'} 查看${label}。`;
        write(route(kind,r.id),`${unique}：${label} | 查无此地攻略 · NSP Wiki`,description,body+`<p class="reading-action">${link('/#'+({items:'item',quests:'quest',enemies:'enemy'})[kind]+'/'+encodeURIComponent(r.id),'在交互图鉴中查看')}</p>`,kind,r.icon||r.image||'');
      }
      console.log(`Rendered ${records.length} ${kind} pages`);
    }
    for(const [kind,data,records,label] of [['npcs',npcs,npcs.npcs,'NPC 图鉴'],['recipes',recipes,recipes.recipes,'配方手册']]){
      const singular=kind==='npcs'?'npc':'recipe';
      write(route(kind),`查无此地${label}：资料与关联 | NSP Wiki`,`${versionLabel(kind)} 的 ${records.length} 项${label}资料。`,intro(label,'选择条目查看详情与关联资料。','#'+kind)+listing(records,kind),kind);
      for(const r of records){
        await page.evaluate(hash=>{location.hash=hash;},'#'+singular+'/'+encodeURIComponent(r.id));
        await page.waitForFunction(({singular,id})=>document.querySelector('#detail-content .npc-recipe-detail')?.getAttribute('data-'+singular+'-id')===id,{singular,id:r.id});
        const body=await snapshot(page,'#detail-content > .npc-recipe-detail');
        const same=records.filter(a=>plain(a.name)===plain(r.name));
        const unique=plain(r.name)+(same.length>1?'（方案'+(same.findIndex(a=>a.id===r.id)+1)+'）':'');
        write(route(kind,r.id),`${unique}：${label} | 查无此地攻略 · NSP Wiki`,`查无此地 ${versionLabel(kind)} ${plain(r.name)}：${plain(r.description).slice(0,100)||'查看详细资料与关联入口。'}`,body+`<p>${link('/#'+singular+'/'+encodeURIComponent(r.id),'在交互资料中查看')}</p>`,kind,r.image||'');
      }
      console.log(`Rendered ${records.length} ${kind} pages`);
    }
    for(const r of corruption.affixes){
      await page.evaluate(id=>{location.hash='#affix/'+encodeURIComponent(id);},r.id);
      await page.waitForFunction(id=>document.querySelector('#detail-content .corruption-detail')?.dataset.affixId===id,r.id);
      const body=await snapshot(page,'#detail-content > .corruption-detail');
      const name=plain(r.name),same=corruption.affixes.filter(a=>plain(a.name)===name),unique=same.length>1?`${name}（词条${same.findIndex(a=>a.id===r.id)+1}）`:name;
      write(route('corruption',r.id),`${unique}：腐化效果与适用物品 | 查无此地攻略 · NSP Wiki`,`查无此地 ${name}：${plain(r.description).slice(0,90)} 查看效果、适用部位和物品。`,body+`<p>${link('/#affix/'+encodeURIComponent(r.id),'在交互资料中查看')}</p>`,'corruption');
    }
    console.log(`Rendered ${corruption.affixes.length} corruption pages`);
    const corruptionIntro='按装备、近战和枪械查看效果、适用部位与物品。';
    write('/corruption/','查无此地腐化词条：装备、近战与枪械 | NSP Wiki',`${versionLabel('corruption')} 的 ${corruption.affixes.length} 个腐化词条，查看效果、候选部位及适用物品。`,intro('腐化词条',corruptionIntro,'#corruption')+corruption.categories.map(c=>`<section><h2>${link('/corruption/category/'+c.id+'/',c.name)}</h2>${listing(corruption.affixes.filter(a=>a.categories.includes(c.id)),'corruption')}</section>`).join(''),'corruption');
    for(const c of corruption.categories){const values=corruption.affixes.filter(a=>a.categories.includes(c.id));write('/corruption/category/'+c.id+'/',`${c.name}：候选词条与适用物品 | NSP Wiki`,`${versionLabel('corruption')} ${c.name}的 ${values.length} 个候选词条，实际效果待实测。`,intro(c.name,corruptionIntro,'#corruption')+listing(values,'corruption'),'corruption');}
    for(const c of items.categories) {
      const values=items.items.filter(i=>i.category===c.id);
      write(`/items/category/${encodeURIComponent(c.id)}/`,`${plain(c.name)}图鉴：属性与获取方式 | 查无此地攻略 · NSP Wiki`,`查无此地 EA ${plain(c.name)}图鉴，收录 ${values.length} 件物品的属性、使用效果及静态来源候选与待确认线索。`,intro(`${plain(c.name)}图鉴`,`${values.length} 件物品。选择名称查看详情。`,'#items')+listing(values,'items'),'items');
    }
    for(const r of items.archivedItems||[]) write(route('items',r.id),`${plain(r.name)}：历史条目 | NSP Wiki`,'此条目已从当前物品图鉴移除，仅保留旧链接与玩家榜单中的身份。',intro(`${plain(r.name)}（历史条目）`,'当前物品图鉴不再收录此条目。旧榜单与评论记录仍予保留。',`#item/${encodeURIComponent(r.id)}`),'items','',true);
    for(const [kind,records,label] of [['quests',quests.archivedMissions,'任务'],['enemies',enemies.archivedEnemies,'敌怪']])for(const r of records||[])write(route(kind,r.id),`${plain(r.name||r.id)}：历史条目 | NSP Wiki`,`此${label}已不在当前EA攻略目录中，仅保留旧链接提示。`,`<h1>${esc(plain(r.name||r.id))}（历史条目）</h1><p>${esc(plain(r.reason)||'当前资料不再收录此条目，内容待核实。')}</p><p>${link(route(kind),'返回'+label+'目录')}</p>`,kind,'',true);
    write('/items/','查无此地物品图鉴：分类、属性与获取方式 | NSP Wiki',`查无此地 EA ${items.items.length} 件物品图鉴，包含武器、弹药、装备、消耗品和材料的属性与来源。`,intro('物品图鉴',`${items.items.length} 件物品，按类别查找属性与来源。`,'#items')+items.categories.map(c=>`<section><h2>${link('/items/category/'+encodeURIComponent(c.id)+'/',c.name)}</h2>${listing(items.items.filter(i=>i.category===c.id),'items')}</section>`).join(''),'items');
    write('/quests/','查无此地任务攻略：前置、目标与奖励 | NSP Wiki',`查无此地 ${versionLabel('quests')} ${quests.missions.length} 项任务的接取条件、前置关系、目标和奖励；未核实依赖保留说明。`,intro('任务攻略','查看任务接取、目标、补给与后续流程。手动完成标记仅保存在交互页面的当前浏览器，不读取游戏存档。','#quests')+listing(quests.missions,'quests'),'quests');
    write('/enemies/','查无此地敌怪图鉴：出没、属性与掉落 | NSP Wiki',`查无此地 ${versionLabel('enemies')} ${enemies.enemies.length} 个敌怪与特殊对象的基础属性、出没条件和战利品。随身物资与额外掉落分别说明。`,intro('敌怪图鉴','同名变体分别列出，生成机会与击杀掉落概率分别说明；未核实内容明确标注。','#enemies')+listing(enemies.enemies,'enemies'),'enemies');
    await page.goto(origin+'/#mirror');await page.locator('#mirror-table tbody tr').first().waitFor();
    write('/mirror/','查无此地迷失镜柜：兑换规则与概率表 | NSP Wiki',`查无此地 EA Build ${mirror.meta.buildId} 迷失镜柜投入门槛、兑换规则与 ${mirror.items.length} 种候选的配置理论概率，实际领取与频率待实测。`,await snapshot(page,'#guide-root')+`<p>${link('/#mirror','进入交互兑换表')}</p>`,'mirror');
    write('/maps/',`查无此地地图：${maps.length}张EA地图、安全屋与教程 | NSP Wiki`,`查无此地地图目录，包含 ${maps.length} 张地图的平面概览、3D实景与资源点。`,intro('地图全览','先查看平面概览，手动选择3D实景。默认流畅画质，可切换原始。','#maps')+listing(maps,'maps'),'maps');
    const lootNotes='<details class="loot-notes"><summary>搜刮说明 · 名称、数量与预估概率</summary>'+containerLoot.meta.notes.map(note=>'<p class="guide-note">'+esc(note)+'</p>').join('')+'</details>';
    write('/loot/','容器与搜刮：各地图物品、数量与预估概率 | NSP Wiki','按地图查看垃圾堆、保险箱等容器的物品、数量范围与预估概率。',intro('容器与搜刮','选择地图，查看容器中可能找到的物品。','#loot')+lootNotes+`<ul class="reading-list">${containerLoot.maps.map(m=>`<li>${link('/loot/'+m.id+'/',m.name+' · '+m.containers.length+' 个物资方案')}</li>`).join('')}</ul>`,'loot');
    for(const map of containerLoot.maps){const boxes=map.containers.map(box=>`<section class="loot-container" id="loot-box-${esc(box.id)}"><div class="loot-container-title">${box.icon?`<img class="loot-container-icon" src="/${esc(box.icon)}" width="48" height="48" alt="" loading="lazy">`:''}<h2>${esc(box.name)}</h2>${box.nameKind==='wiki'?'<span class="loot-name-kind">Wiki识别名</span>':''}${box.variantLabel?`<span class="guide-note">${esc(box.variantLabel)}</span>`:''}</div>${box.spawnNote?`<p class="guide-note">${esc(box.spawnNote)}</p>`:''}${box.note?`<p class="guide-note">${esc(box.note)}</p>`:''}<div class="loot-items">${box.items.map(row=>{const item=items.items.find(i=>i.id===row.id);if(!item)throw Error('Loot item missing from Wiki: '+row.id);return `<a class="loot-item" href="/items/${encodeURIComponent(item.id)}/">${item.icon?`<img src="/${esc(item.icon)}" width="32" height="32" alt="" loading="lazy">`:''}<span class="loot-item-copy"><strong>${esc(plain(item.name))}</strong><span class="loot-chance">${esc(row.probabilityText)}</span><small>数量：${esc(row.quantityText)}</small>${row.note?`<small class="loot-item-note">${esc(row.note)}</small>`:''}</span></a>`;}).join('')}</div>${box.items.length||box.note?'':'<p class="guide-note">此容器的物品内容尚待核实。</p>'}</section>`).join('');write('/loot/'+map.id+'/',map.name+'搜刮指南：容器物品与预估概率 | NSP Wiki','查看'+map.name+'的容器、物品数量范围和单次生成预估概率。',intro(map.name+' · 容器与搜刮','按容器查找物品。','#loot/'+map.id)+`<p>${link('/maps/'+map.id+'/','查看对应地图 ↗')}</p>`+lootNotes+(boxes||'<p>此地图暂未找到可核实的搜刮容器。</p>'),'loot');}
    for(const m of maps){
      const {manifest,poiCount}=mapData.get(m.id), gaps=[...new Set((manifest.issues||[]).map(i=>plain(i.impact)||'部分场景内容待核实'))];
      const title=plain(m.title)||'地图',same=maps.filter(r=>plain(r.title)===title),unique=same.length>1?`${title}（区域${same.findIndex(r=>r.id===m.id)+1}）`:title;
      if(/[A-Za-z_]/.test(title))throw new Error('Map title still contains an internal identifier: '+m.id);
      const relatedQuests=quests.missions.filter(q=>q.triggers.some(t=>t.maps?.includes(m.id))),relatedEnemies=enemies.enemies.filter(e=>e.mapIds?.includes(m.id));
      const related=(relatedQuests.length?'<h2>关联任务</h2><p>配置中的任务入口或目标位置，以任务详情为准。</p>'+listing(relatedQuests,'quests'):'')+(relatedEnemies.length?'<h2>配置敌怪候选</h2><p>静态配置候选；实际出没与生成条件待核实。</p>'+listing(relatedEnemies,'enemies'):'');
      write(route('maps',m.id),`查无此地${unique}地图：概览与3D实景 | NSP Wiki`,`查无此地${title}地图，${poiCount} 个资源点；查看平面概览、3D实景及任务与敌怪入口。`,intro(`${unique}地图`,`${poiCount} 个资源点。`, `#maps/${encodeURIComponent(m.id)}`)+`<details><summary>资料版本</summary><p>地点资料 EA Build ${esc(manifest.dataBuild)}；场景资源 Build ${esc(manifest.geometryBuild)}。</p></details>`+(gaps.length?`<details><summary>场景缺项</summary><p>${esc(gaps.join('；'))}。</p></details>`:'')+`<h2>浏览地图</h2><ul class="guide-lines"><li>默认平面概览；点击“3D实景”才加载模型，缩放不会自动切换模式。</li><li>默认流畅：降低渲染分辨率；原始：完整渲染分辨率，可手动选择。</li><li>资源高亮不隐藏其他点位；选择点位后“查看实景”定位。</li><li>进入室内后可切换屋顶显示；支持拖动、缩放、旋转以及小地图定位。</li></ul><p>${link('/#maps/'+encodeURIComponent(m.id),'打开'+title+'交互地图')}</p>`+related+'<p>'+link('/loot/'+m.id+'/','查看本图容器与物品刷新 ↗')+'</p>','maps');
    }
    write('/tiers/','查无此地夯拉榜：制作自己的物品排行榜 | NSP Wiki','使用EA物品库制作个人夯拉榜，保留原有排序、玩家帖子与评论。',intro('夯拉榜','从EA物品库挑选物品，按自己的体验排入夯、顶级、人上人、NPC、拉五档；历史草稿、帖子和评论继续保留。','#tiers')+'<h2>制作与分享</h2><ol class="guide-lines"><li>按类别、子分类或名称查找物品，加入待排区。</li><li>拖动到对应档位，或选择物品后通过档位按钮调整。“一键清空”可重新开始。</li><li>复制或导出榜单图片，也可在页面下方“发布攻略”，附上昵称、标题与最多1000字的文字。</li><li>浏览玩家帖子，点赞多的攻略排在前面；点击图片查看完整文字并评论。</li></ol><p>未发布的榜单草稿只保存在当前浏览器。主动发布的图片和文字由本站保存，其他访问者可以看到、点赞和评论；不读取或同步游戏存档。</p>','tiers');
    write('/workshop/','武器工坊：部件装配与腐化方案 | NSP Wiki','查无此地 EA 武器工坊：选择主武器，按槽位和口径装配部件，查看腐化词条效果并保存本地方案。',intro('武器工坊','先选择主武器，再点击槽位或拖入兼容部件；近战武器直接设置词条。数值采用腐化进度100%、效果倍率1的静态基准，触发效果分别列出。方案保存在当前浏览器。','#workshop'),'workshop');
    await page.goto(origin+'/#updates');await page.locator('.updates-record').first().waitFor();
    await page.locator('.updates-change').evaluateAll(nodes=>nodes.forEach(n=>n.open=true));
    await page.locator('.updates-tools').evaluate(node=>node.remove());
    write('/updates/','更新档案：游戏公告与 Wiki 维护 | NSP Wiki','按版本查阅游戏公告、Wiki 维护、核验 Build 和未核实变化。',await snapshot(page,'#guide-root'),'updates');
    write('/history/visual/','更新档案 | NSP Wiki','游戏公告与本站更新。',require('../lib/visual-history.cjs').render(),'updates','',true);
    const mechanicDirectory=[...new Set(mechanicEntries.map(t=>t.category))].map(category=>`<section class="mechanic-category"><h2>${esc(category)}</h2>${mechanicEntries.filter(t=>t.category===category).map(t=>`<a class="mechanic-card" href="/mechanics/${t.id}/">${esc(t.name)}<span>${esc(t.summary)}</span></a>`).join('')}</section>`).join('');
    const statusDirectory=['增益','减益','利弊并存','其他'].filter(c=>statuses.statuses.some(s=>s.category===c)).map(category=>{const records=statuses.statuses.filter(s=>s.category===category);return `<details class="status-group"><summary>${esc(category)} · ${records.length} 种</summary>${records.map(s=>`<details class="mechanic-status" id="status-${esc(s.id)}"><summary><span class="status-icon">${s.icon?`<img src="/${esc(s.icon)}" width="32" height="32" alt="" loading="lazy">`:'—'}</span><strong>${esc(s.name)}</strong><span class="status-preview">${esc([s.scope,s.summary].filter(Boolean).join(' · '))}</span></summary><div class="status-body"><div class="status-fact"><strong>效果</strong><div><ul>${s.effects.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></div>${[['持续时间',s.duration],['叠加与刷新',s.stacking],['如何解除',s.removal]].map(([title,value])=>`<div class="status-fact"><strong>${title}</strong><div>${esc(value)}</div></div>`).join('')}<div class="status-fact"><strong>常见来源</strong><div><ul>${s.sources.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></div>${link('/#mechanics/status/'+s.id,'打开状态说明 ↗')}</div></details>`).join('')}</details>`;}).join('');
    write('/mechanics/','机制手册：属性、伤害、武器操控与状态 | NSP Wiki','用中文解释防御、相位转移、武器属性和增益减益状态，结合公式和示例理解游戏机制。',intro('机制手册','先看懂它的作用，再用例子理解计算；展开状态查看效果与解除方式。','#mechanics')+`<div class="mechanic-cards">${mechanicDirectory}<section class="status-effects"><h2>增益与减益状态</h2>${statusDirectory}</section></div>`,'mechanics');
    for(const term of mechanics.mechanics){
      const ul=values=>`<ul>${values.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
      const examples=(term.presets||[]).map(p=>`<li><strong>${esc(p.title)}</strong>：${esc(p.explanation)}</li>`).join('');
      const equipment=term.id==='phase-shift'?`<section class="mechanic-equipment-example" id="magic-hat-example"><h2>以“窗口牌”魔法帽为例</h2><p>${esc(hatExample.summary)}</p><p>${esc(hatExample.formula.text)}</p><p>${esc(hatExample.appliesTo.join('；'))}。</p><p class="guide-note">注意：${esc(hatExample.doesNotApplyTo.join('；'))}。</p>${link('/#item/gear_helmet_windowMagicHat','查看魔法帽属性 ↗')}</section>`:term.id==='magic-hat-three'?`<p>${link('/mechanics/phase-shift/#magic-hat-example','此装备示例已并入相位转移讲解 ↗')}</p>`:'';
      const skillTable=term.skillRows?.length?await page.evaluate(term=>window.WikiMechanics.skillTable(term).outerHTML,term):'';
      const body=`<h1>${esc(term.name)}</h1><p class="mechanic-summary">${esc(term.summary)}</p><h2>什么时候有效</h2>${ul(term.appliesTo)}<h2>容易误解的地方</h2>${ul(term.doesNotApplyTo)}${equipment}${skillTable}${term.id==='corruption'?link('/corruption/','查看腐化词条 ↗'):''}<h2>计算与示例</h2><p>${esc(term.formula.text)}</p><ol>${term.formula.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol>${examples?`<ul class="mechanic-examples">${examples}</ul>`:''}${ul(term.formula.limits)}<div data-mechanic-calculator="${term.id}"></div>${link('/#mechanic/'+term.id,'进入交互示例')}`;
      write('/mechanics/'+term.id+'/',term.name+'：作用、计算与示例 | NSP Wiki',term.summary,body,'mechanics');
    }
    write('/traffic/','Wiki 流量看板 | NSP Wiki','查看 Wiki 访问趋势与社区动态。','<h1>Wiki 流量看板</h1><p><a href="/#traffic">进入流量看板</a></p><script>location.replace("/#traffic")</script>','traffic');
    write('/feedback/','Wiki 反馈：资料纠错与使用建议 | NSP Wiki','反馈查无此地 Wiki 的资料问题、使用问题和改进建议。',`<div id="wiki-feedback-static"><h1>Wiki 反馈</h1><p>留下关联页和具体情况，帮助完善攻略。启用脚本后可查看和参与讨论。</p></div>`,'feedback');
    write('/404.html','攻略页面不存在 | NSP Wiki','此攻略地址不存在，请返回图鉴或攻略目录查找。','<h1>没有找到这篇攻略</h1><p>地址可能已失效，请从攻略目录继续查找。</p><p>'+link('/','返回攻略首页')+'</p>','', '',true);
    if(errors.length)throw new Error('Existing renderer errors: '+errors.join('; '));
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
  for(const [file,before] of inputSnapshot)if(!before.equals(fs.readFileSync(path.join(ROOT,file))))throw new Error('SEO input changed during generation; regenerate from frozen data: '+file);
  const rootFile=path.join(ROOT,'index.html');let html=fs.readFileSync(rootFile,'utf8');
  html=html.replace(/\s*<!-- seo:head -->[\s\S]*?<!-- \/seo:head -->/,'').replace(/\s*<!-- seo:directory -->[\s\S]*?<!-- \/seo:directory -->/,'');
  html=html.replace(/\s*<title>[\s\S]*?<\/title>/,'').replace(/\s*<meta name="description"[^>]*>/,'');
  html=html.replace('</head>',`<!-- seo:head -->${metadata('/',rootTitle,rootDesc)}<!-- /seo:head --></head>`);
  html=html.replace('</footer>',`<!-- seo:directory -->${WikiNav.directory()}<!-- /seo:directory --></footer>`);
  fs.writeFileSync(rootFile,html);pages.unshift({url:'/',title:rootTitle,description:rootDesc,filename:'index.html'});
  const lastmod=new Date().toISOString().slice(0,10);
  fs.writeFileSync(path.join(ROOT,'sitemap.xml'),`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(p=>`<url><loc>${esc(ORIGIN+p.url)}</loc><lastmod>${lastmod}</lastmod></url>`).join('')}</urlset>`);
  fs.writeFileSync(path.join(ROOT,'robots.txt'),`User-agent: *\nAllow: /\nSitemap: ${ORIGIN}/sitemap.xml\n`);
  fs.writeFileSync(path.join(__dirname,'seo-pages.json'),JSON.stringify(pages,null,2));
  cleanUiAssets();
  console.log(JSON.stringify({status:'PASS',pages:pages.length,canonicalOrigin:ORIGIN,inputsUnchanged:true}));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
