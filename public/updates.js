(() => {
  'use strict';
  const modules={items:'物品',quests:'任务',maps:'地图',enemies:'敌怪',workshop:'工坊',mechanics:'机制',loot:'搜刮',other:'其他',wiki:'站点'};
  let focusFilter=null;
  function selectRecords(data, {kind='all',module='all',version='all'}={}) {
    return data.records.filter(r=>(kind==='all'||r.kind===kind)&&(version==='all'||r.id===version)&&(module==='all'||r.changes.some(c=>c.module===module))).sort((a,b)=>b.date.localeCompare(a.date));
  }
  function parseRoute(hash) {let p;try{p=hash.slice(1).split('/').map(decodeURIComponent);}catch{return {version:'invalid',module:'all',kind:'all'};}return {version:p[1]||'all',module:p[2]||'all',kind:p[3]||'all'};}
  function route({version='all',module='all',kind='all'}={}) {return version=== 'all'&&module==='all'&&kind==='all'?'#updates':'#updates/'+[version,module,kind].map(encodeURIComponent).join('/');}
  function node(tag,cls,text) {const n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
  function anchor(text,href,cls='inline-link') {const a=node('a',cls,text);a.href=href;return a;}
  function status(record) {return `${record.kind==='game'?'游戏公告':'Wiki 维护'} · ${record.publication} · ${record.verification}`;}
  function renderSummary(root,data) {
    const latest=selectRecords(data)[0];if(!latest)return;
    const text=node('span','',`${latest.date} · ${latest.title} · ${latest.publication}`);
    root.replaceChildren(text,anchor('查看更新档案',route({version:latest.id})));root.hidden=false;
  }
  function render(root,data,options={}) {
    const state={...parseRoute(location.hash),...options};
    const heading=node('div','guide-heading reference-heading');heading.append(node('p','kicker','生存手册 / 维护档案'),node('h1','','更新档案'),node('p','intro-copy','游戏公告与 Wiki 维护分开记录。选择版本，查看变化与对应资料。'));
    const identity=node('p','guide-note updates-identity',`本次资料核验基线：Build ${data.currentInstallation.buildId}；${data.currentInstallation.note}。各栏目仍以自己的资料版本为准。`);
    const tools=node('div','updates-tools reference-toolbar');
    function filter(label,values,value,key) {const wrap=node('label','',label),select=node('select');select.setAttribute('aria-label',label);for(const [id,title]of values){const o=node('option','',title);o.value=id;select.append(o);}select.value=value;select.onchange=()=>{focusFilter=label;location.hash=route({...state,[key]:select.value,version:'all'});};wrap.append(select);tools.append(wrap);}
    filter('记录类型',[['all','全部记录'],['game','游戏公告'],['wiki','Wiki 维护']],state.kind,'kind');
    filter('资料模块',[['all','全部模块'],...Object.entries(modules)],state.module,'module');
    const layout=node('div','updates-layout'),versions=node('nav','updates-versions');versions.setAttribute('aria-label','更新版本节点');versions.append(node('h2','updates-versions-title','版本目录'));
    const matching=selectRecords(data,{kind:state.kind,module:state.module});
    const all=anchor('查看全部版本',route({...state,version:'all'}),'updates-node');all.setAttribute('aria-current',state.version==='all'?'page':'false');versions.append(all);
    for(const r of matching){const a=anchor('',route({...state,version:r.id}),'updates-node');a.append(node('span','updates-node-meta',`${r.date} · ${r.version||'Wiki'} · `),node('span','updates-node-title',r.title));a.setAttribute('aria-current',state.version===r.id?'page':'false');versions.append(a);}
    const content=node('div','updates-records');const records=selectRecords(data,state);const count=node('p','result-count reference-count',`${records.length} 条记录`);count.setAttribute('role','status');content.append(count);
    if(!records.length)content.append(node('p','empty','没有匹配记录。可切换模块或查看全部版本。'));
    for(const record of records){
      const card=node('article','updates-record');card.id='update-'+record.id;
      card.append(node('p','updates-status',status(record)),node('h2','',record.title));
      const date=node('time','',record.date);date.dateTime=record.date;const meta=node('p','muted updates-record-meta');meta.append(date,document.createTextNode(` · ${record.version?'公告版本 '+record.version+' · ':''}核验 Build：${record.verifiedBuild||'待核对'}`));card.append(meta,node('p','updates-record-summary',record.summary));
      const source=node('p','updates-source');source.append(anchor(record.source.label,record.source.url));card.append(source);
      for(const change of record.changes.filter(c=>state.module==='all'||c.module===state.module)){
        const details=node('details','updates-change'),summary=node('summary');summary.append(node('span','updates-module',modules[change.module]||change.module),document.createTextNode(change.title));details.append(summary);
        const diff=node('dl','updates-diff');for(const [label,text]of [...(Object.hasOwn(change,'before')?[['此前',change.before]]:[]),['变化后',change.after]]){const row=node('div');row.append(node('dt','',label),node('dd','',text));diff.append(row);}details.append(diff);
        if(change.note)details.append(node('p','guide-note',change.note));const links=node('div','related-links');for(const l of change.links||[])links.append(anchor(l.label,l.route));details.append(links);card.append(details);
      }
      card.append(anchor('此版本链接',route({...state,version:record.id}),'updates-permalink'));content.append(card);
    }
    layout.append(versions,content);const page=node('section','updates-page');page.append(heading,identity,tools,layout);root.replaceChildren(page);
    const currentVersion=versions.querySelector('.updates-node[aria-current="page"]');if(state.version!=='all'&&currentVersion)versions.scrollTop=Math.max(0,versions.scrollTop+currentVersion.getBoundingClientRect().top-versions.getBoundingClientRect().top-versions.firstElementChild.getBoundingClientRect().height-8);
    if(focusFilter){[...tools.querySelectorAll('select')].find(n=>n.getAttribute('aria-label')===focusFilter)?.focus({preventScroll:true});focusFilter=null;}
  }
  const api={selectRecords,parseRoute,route,render,renderSummary};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(typeof window!=='undefined')window.WikiUpdates=api;
})();
