const data=require('../public/data/navigation.json');
const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const href=(id,reading)=>reading?`/${id}/`:`#${id}`;
function entries(channel,reading,active=''){
  return [...channel.sections,...(channel.shortcuts||[])].map(s=>`<a href="${href(s.id,reading)}" data-page="${s.id}"${channel.shortcuts?.includes(s)?' data-shortcut="true"':''}${s.id===active?' aria-current="page"':''}><span>${esc(s.name)}</span><small>${esc(s.description)}</small></a>`).join('');
}
function navigation(active='',reading=false){
  const current=data.channels.find(c=>c.sections.some(s=>s.id===active));
  return `<button type="button" class="welcome-header secondary-button" data-welcome-open hidden>关于本站</button><nav class="top-nav channel-navigation" aria-label="攻略频道">${data.channels.map(c=>`<details class="nav-channel" data-channel="${c.id}"><summary${c===current?' aria-current="true"':''}>${esc(c.name)}</summary><div class="channel-menu">${entries(c,reading,active)}</div></details>`).join('')}</nav><button type="button" class="site-search-button secondary-button" data-site-search hidden>搜索攻略</button><nav class="channel-links" aria-label="当前频道栏目"${current?'':' hidden'}>${current?entries(current,reading,active):''}</nav>`;
}
function directory(){return `<nav class="reading-directory channel-directory" aria-label="全部攻略栏目">${data.channels.map(c=>`<div><strong>${esc(c.name)}</strong>${entries(c,true)}</div>`).join('')}</nav>`;}
function home(){
  const latest=require('../public/data/updates.json').records.find(r=>r.kind==='wiki');
  const quick=[['items','找物品','属性、用途与来源',data.channels[0].art],['quests','查任务','流程、条件与物资',data.channels[1].art],['maps','看地图','地点、容器与路线','maps/data/maps/Origin00_1961/native-minimap.png'],['workshop','研究配装','装配、保存与对比',data.channels[2].art]];
  return `<section class="wiki-home"><div class="home-desk"><div class="home-lead"><p class="kicker">查无此地 / 生存手册</p><h1>出发之前，查清楚</h1><p class="intro-copy">装备的属性、任务的线索、下一处要去的地方。</p><div class="home-search" data-search-surface><label for="home-search">搜索攻略与机制</label><input id="home-search" type="search" autocomplete="off" placeholder="例如：魔法帽、防御、任务名称" aria-controls="home-search-results"><p role="status" class="guide-note"></p><div id="home-search-results" class="site-search-results"></div></div></div><nav class="home-quick" aria-label="常用入口">${quick.map(([id,name,description,art])=>`<a href="#${id}"><img src="/${esc(art)}" alt="" width="52" height="52">${name}<small>${description}</small></a>`).join('')}</nav></div><aside class="updates-summary home-update" aria-label="最新 Wiki 更新"><span>${esc(latest.date)} · ${esc(latest.title)} · ${esc(latest.publication)}</span><a class="inline-link" href="#updates/${esc(latest.id)}/all/all">查看本次更新</a></aside><div class="home-channels">${data.channels.map(c=>`<section class="home-channel"><img class="home-channel-art" src="/${esc(c.art)}" alt="" width="72" height="60"><h2>${esc(c.name)}</h2><p>${esc(c.description)}</p><div>${entries(c,false)}</div></section>`).join('')}</div></section>`;
}
module.exports={data,navigation,directory,home};
