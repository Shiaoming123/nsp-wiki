// Article component closure: canonical concatenation closes it in articles.js.
(() => {
/* Account-backed article editing, publication and discussion. */
'use strict';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons = {
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  pen:'<path d="m15 4 5 5M4 20l5-1 12-12-5-5L4 14v6Z"/>',
  book:'<path d="M3 4h7l2 2 2-2h7v15h-7l-2 2-2-2H3V4Zm9 2v15"/>',
  arrow:'<path d="M5 12h14m-5-5 5 5-5 5"/>',
  back:'<path d="M19 12H5m5-5-5 5 5 5"/>',
  external:'<path d="M14 3h7v7m0-7L11 13M10 5H4v15h15v-6"/>',
  item:'<path d="m12 3 9 5-9 5-9-5 9-5Zm-9 5v9l9 5 9-5V8m-9 5v9"/>',
  enemy:'<path d="M6 8 3 3l7 3h4l7-3-3 5v8l-6 5-6-5V8Zm3 3h1m4 0h1m-5 5h4"/>',
  quest:'<path d="M7 5H4v16h16V5h-3M8 3h8v5H8V3Zm0 10h8m-8 4h5"/>',
  bookmark:'<path d="M6 3h12v19l-6-4-6 4V3Z"/>',
  heart:'<path d="M20.5 4.5a5 5 0 0 0-7.1 0L12 6l-1.4-1.5a5 5 0 0 0-7.1 7.1L12 20l8.5-8.4a5 5 0 0 0 0-7.1Z"/>',
  play:'<path d="m9 5 11 7-11 7V5Z"/>',
  share:'<circle cx="18" cy="5" r="3"/><circle cx="5" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8 11 7-4m-7 6 7 4"/>',
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="2"/><path d="m3 17 5-5 4 4 4-6 5 7"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  list:'<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  comment:'<path d="M21 15a3 3 0 0 1-3 3H8l-5 4V6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v9Z"/>',
  save:'<path d="M4 3h13l4 4v14H3V3h1Zm3 0v7h10V3M7 21v-7h10v7"/>',
  eye:'<path d="M2 12s4-8 10-8 10 8 10 8-4 8-10 8-10-8-10-8Z"/><circle cx="12" cy="12" r="3"/>',
  up:'<path d="M12 20V4m-6 6 6-6 6 6"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.book}</svg>`;
const kinds = {item:'物品', enemy:'敌怪', quest:'任务'};
const categories = ['新手入门','探索路线','敌怪应对','配装心得','任务指引','机制研究'];

// Approved reader/editor rendering, scoped by articles.js.
function entity(kind,id) { return entityMap.get(`${kind}:${id}`); }

function byKey(key) { return entityMap.get(key); }

function imageHtml(entry, cls='') { const src=safeImage(entry?.image); return src?`<img src="${esc(src)}" alt="" class="${cls}" loading="lazy">`:`${icon(entry?.kind||'book')}`; }

function refsFromBody(body) {
  const found = [], seen=new Set();
  for(const m of body.matchAll(/(?:\[\[|\{\{)(item|enemy|quest):([^|\]\}\n]+)\|([^\]\}\n]+)(?:\]\]|\}\})/g)) {
    const key=`${m[1]}:${m[2]}`; if(!seen.has(key)) { seen.add(key); found.push({kind:m[1],id:m[2],label:m[3]}); }
  }
  return found;
}

function inline(text) {
  const regex=/\[\[(item|enemy|quest):([^|\]\n]+)\|([^\]\n]+)\]\]|\*\*([^*]+)\*\*/g;
  let html='',last=0;
  for(const m of text.matchAll(regex)) { html+=esc(text.slice(last,m.index));
    if(m[4]) html+=`<strong>${inline(m[4])}</strong>`;
    else { const entry=entity(m[1],m[2]); html+=`<button class="inline-ref ${entry?'':'broken-ref'}" data-entity="${esc(m[1]+':'+m[2])}" data-label="${esc(m[3])}" aria-label="查看${kinds[m[1]]}：${esc(m[3])}">${icon(m[1])}${esc(entry?.name||m[3])}</button>`; }
    last=m.index+m[0].length;
  }
  return html+esc(text.slice(last));
}

function card(ref) { const entry=entity(ref.kind,ref.id); return `<button class="entity-card" data-entity="${esc(ref.kind+':'+ref.id)}" data-label="${esc(ref.label)}"><span class="entity-image">${imageHtml(entry)}</span><span><strong>${esc(entry?.name||ref.label)}</strong><small>${esc(kinds[ref.kind])}资料${entry?' · '+esc(entry.category||'查看说明'):'暂不可用 · 保留原始引用'}</small></span>${icon('arrow')}</button>`; }

function mediaFor(article,id) { if(id==='route-sketch') return {data:'/route-sketch.svg'}; return article.images?.[id]; }

function renderBody(article) {
  const lines=(article.body||'').replace(/\r/g,'').split('\n'); let html='',paragraph=[],list=[],quote=[],head=0;
  const flush=()=>{if(paragraph.length){html+=`<p>${inline(paragraph.join(' '))}</p>`;paragraph=[];}if(list.length){html+='<ul>'+list.map(x=>`<li>${inline(x)}</li>`).join('')+'</ul>';list=[];}if(quote.length){html+=`<blockquote><p>${inline(quote.join(' '))}</p></blockquote>`;quote=[];}};
  for(const line of lines){const heading=/^(#{2,3})\s+(.+)$/.exec(line);const image=/^!\[((?:\\.|[^\]\\])*)\]\(media:([\w-]+)\)$/.exec(line);const ref=/^\{\{(item|enemy|quest):([^|}\n]+)\|([^}\n]+)\}\}$/.exec(line);
    if(!line.trim()){flush();continue;}
    if(heading){flush();const tag=heading[1].length===2?'h2':'h3';html+=`<${tag} id="section-${head++}">${inline(heading[2])}</${tag}>`;}
    else if(image){flush();image[1]=image[1].replace(/\\([\\\[\]])/g,'$1');const media=mediaFor(article,image[2]);const src=safeImage(media?.data);html+=`<figure class="article-figure" data-media="${esc(image[2])}">${src?`<button data-image="${esc(src)}" data-caption="${esc(image[1])}" aria-label="放大图片：${esc(image[1]||'攻略配图')}"><img src="${esc(src)}" alt="${esc(image[1]||'攻略配图')}" loading="lazy"><span class="zoom-label">${icon('image')} 点击放大</span></button>`:'<div class="missing-image">配图暂不可用，原图注和引用已保留。</div>'}<figcaption>${esc(image[1])}</figcaption></figure>`;}
    else if(ref){flush();html+=card({kind:ref[1],id:ref[2],label:ref[3]});}
    else if(line.startsWith('- ')){if(paragraph.length||quote.length)flush();list.push(line.slice(2));}
    else if(line.startsWith('> ')){if(paragraph.length||list.length)flush();quote.push(line.slice(2));}
    else{if(list.length||quote.length)flush();paragraph.push(line);}
  }flush();return html || '<p class="muted">正文还没有内容，返回编辑写下第一段吧。</p>';
}

function headingText(text){return text.replace(/\[\[(item|enemy|quest):([^|\]\n]+)\|([^\]\n]+)\]\]/g,(_,kind,id,label)=>entity(kind,id)?.name||label).replace(/\*\*([^*]+)\*\*/g,'$1');}

function headings(body) { return [...body.matchAll(/^(#{2,3})\s+(.+)$/gm)].map((m,i)=>({id:`section-${i}`,text:headingText(m[2]),sub:m[1].length===3})); }

function tocHtml(article) {return headings(article.body).map(h=>`<a href="#${h.id}" data-section="${h.id}" class="${h.sub?'sub':''}">${esc(h.text)}</a>`).join('');}

function miniature(key) {const e=byKey(key);return e?`<span class="mini-ref">${esc(e.name)}</span>`:'';}

function cardHtml(a) {const liked=!!state.likes[a.id];return `<article class="guide-card"><a class="guide-cover" href="#article/${encodeURIComponent(a.id)}" aria-label="阅读：${esc(a.title)}"><span class="cover-category">${esc(a.category)}</span>${artHtml(a)}${a.video?`<span class="video-tag">${icon('play')}附视频</span>`:''}</a><div class="guide-copy"><h3><a href="#article/${encodeURIComponent(a.id)}">${esc(a.title)}</a></h3><p>${esc(a.summary)}</p><div class="mini-refs">${articleRefs(a).slice(0,2).map(miniature).join('')}</div><div class="author-line"><span class="avatar">${esc(a.author.slice(0,1))}</span><span>${esc(a.author)}</span><span>· ${esc(a.date)}</span></div><div class="card-bottom"><span>${icon('clock')}${a.minutes||3} 分钟阅读</span><span>${icon('heart')}${(a.likes||0)+(liked?1:0)}</span></div></div></article>`;}

function sidebar(article){const refs=refsFromBody(article.body);return `<aside class="reader-aside"><h2>本篇关联 <span class="muted">${refs.length}</span></h2><p>点开资料卡，接着读这篇攻略。</p>${Object.entries(kinds).map(([kind,label])=>{const rs=refs.filter(r=>r.kind===kind);return rs.length?`<div class="ref-group-title"><span>${label}</span><span>${rs.length}</span></div>${rs.map(r=>{const e=entity(r.kind,r.id);return `<button class="sidebar-ref" data-entity="${esc(r.kind+':'+r.id)}" data-label="${esc(r.label)}">${imageHtml(e)}<span>${esc(e?.name||r.label)}<small>${esc(e?.category||'资料暂不可用')}</small></span>${icon('external')}</button>`;}).join('')}`:'';}).join('')}<div class="aside-foot">词条取自 Wiki 资料库。作者的攻略经验与图鉴资料分别保留。</div></aside>`;}

function videoHtml(article){const v=article.video;if(!v)return '';return `<section class="video-section" aria-label="攻略视频"><div class="video-heading"><h2>配合视频一起看</h2><a href="https://www.bilibili.com/video/${esc(v.bvid)}/?p=${v.page}" target="_blank" rel="noopener noreferrer">在 B 站打开 ${icon('external')}</a></div><div class="video-player" id="video-player"><button class="video-poster" data-action="load-video"><span class="play-circle">${icon('play')}</span><strong>${esc(v.title||'攻略视频')}</strong><small>B站视频 · 第 ${v.page} P · 点击加载播放器</small></button></div><div class="video-caption"><span>${esc(v.attribution||'链接与署名由攻略作者提供')}</span><button class="text-button" data-action="unload-video" hidden>收起播放器</button></div><p class="small-note">不自动播放。若平台限制播放，请使用上方的 B 站原链接。</p></section>`;}

function renderReader(article,preview=false){document.title=`${article.title||'未命名攻略'} · 生存手册`;const liked=!!state.likes[article.id],saved=!!state.saved[article.id];$('#article-main').innerHTML=`${preview?`<div class="preview-banner"><span>${icon('eye')} 阅读预览 · 检查正文、资料卡和视频的位置</span><div><a class="button" href="#write/${article.id==='preview'?'':article.id}">返回编辑</a><button class="button primary" data-action="publish-check">确认发布</button></div></div>`:`<div class="breadcrumb"><a href="#articles">${icon('back')} 攻略广场</a><span>/</span><span>${esc(article.category)}</span></div>`}<div class="reader-layout"><nav class="article-toc" aria-label="文章目录"><h2>本篇目录</h2><div class="toc-links">${tocHtml(article)}</div><div class="reading-meter"><span class="meter-track"><span class="meter-fill"></span></span>已读 <span id="reading-percent">0</span>%</div><button class="text-button back-top" data-action="top">${icon('up')} 回到开头</button></nav><article class="article-main"><div class="article-labels"><span class="tag">${esc(article.category)}</span><span class="tag neutral">${article.isSample?'示例文章':'玩家攻略'}</span>${article.spoiler&&article.spoiler!=='none'?'<span class="tag warning">含少量剧情线索</span>':''}${article.video?`<span class="tag neutral">${icon('play')}附视频</span>`:''}</div><h1>${esc(article.title||'未命名攻略')}</h1><p class="article-summary">${esc(article.summary||'为这篇攻略补上一段简短介绍。')}</p><div class="article-byline"><span class="avatar">${esc(article.author.slice(0,1))}</span><span>${esc(article.author)}<small>${article.isSample?'示例作者':'攻略作者'} · ${esc(article.date)} 更新 · ${article.minutes} 分钟阅读</small></span><span class="byline-spacer"></span><span class="tag neutral">适用版本：${esc(article.version||'作者尚未填写')}</span></div><div class="article-tools"><button class="button ghost" data-action="like" aria-pressed="${liked}">${icon('heart')}有帮助 <span id="like-count">${article.likes||0}</span></button><button class="button ghost" data-action="bookmark" aria-pressed="${saved}">${icon('bookmark')}<span>${saved?'已收藏':'收藏'}</span></button><button class="button ghost" data-action="share">${icon('share')}分享</button><button class="button ghost mobile-toc-button" data-action="toc">${icon('list')}目录</button>${article.canEdit?'<a class="button ghost more-tool" href="#write" data-action="edit-current">继续编辑</a>':''}</div>${article.isSample?'<p class="article-notice">内容为设计演示，未作游戏实测。词条引用来自现有 Wiki；示例视频保留原作者署名。</p>':`<p class="article-notice">适用版本：${esc(article.version||'尚未填写')}。攻略经验由作者提供，资料卡取自 Wiki。</p>`}<div class="article-body">${renderBody(article)}</div>${videoHtml(article)}${!preview?`<section class="feedback-box"><h2>这篇笔记对你有帮助吗？</h2><p>有用的经验值得留住，待核实的地方也欢迎补充。</p><div class="feedback-actions"><button class="button primary" data-action="like" aria-pressed="${liked}">${icon('heart')}${liked?'已标记有帮助':'对我有帮助'}</button><button class="button" data-action="bookmark" aria-pressed="${saved}">${icon('bookmark')}${saved?'已收藏':'收藏，稍后再读'}</button><button class="button ghost" data-action="correction">补充 / 纠错</button></div></section>${commentHtml(article)}`:''}</article>${sidebar(article)}</div>`;if(preview)$('.article-tools')?.remove();bindReadingProgress();}

function parseVideo(d){if(!d.videoEnabled)return {ok:true,disabled:true};let url;try{url=new URL(d.videoUrl.trim());}catch{return {ok:false,error:'请粘贴完整的 B 站视频链接，例如 https://www.bilibili.com/video/BV1fsxv6AECB/'};}
  if(url.protocol!=='https:'||!['www.bilibili.com','m.bilibili.com','bilibili.com'].includes(url.hostname)||url.username||url.password||url.port)return {ok:false,error:'仅支持 B 站官方 https 视频链接。短链接请先打开，复制完整视频地址。'};
  const match=/^\/video\/(BV[1-9A-HJ-NP-Za-km-z]{10})\/?$/.exec(url.pathname);if(!match)return {ok:false,error:'没有找到有效的 BV 视频编号，请复制视频详情页的完整链接。'};
  const page=Number(d.page);if(!Number.isInteger(page)||page<1||page>999)return {ok:false,error:'分 P 请填写 1–999 的整数。'};return {ok:true,bvid:match[1],page};
}

function captureDraft(){if(!$('#article-title'))return;if(editorMode==='rich'&&richController)$('#article-body').value=richController.getMarkdown();const d=state.draft||blankDraft();Object.assign(d,{title:$('#article-title').value,summary:$('#article-summary').value,body:$('#article-body').value,category:$('#article-category').value,version:$('#article-version').value,spoiler:$('#article-spoiler').value,videoEnabled:$('#video-enabled').checked,videoUrl:$('#video-url').value,videoTitle:$('#video-title').value,videoAuthor:$('#video-author').value,page:Number($('#video-page').value)});state.draft=d;}

function editorRefsHtml(){const rs=refsFromBody(state.draft?.body||'');return rs.length?rs.map(r=>`<button class="sidebar-ref" data-entity="${esc(r.kind+':'+r.id)}" data-label="${esc(r.label)}">${imageHtml(entity(r.kind,r.id))}<span>${esc(entity(r.kind,r.id)?.name||r.label)}<small>${kinds[r.kind]}</small></span></button>`).join(''):'<p class="small-note">从工具栏插入物品、敌怪或任务，这里会自动整理关联清单。</p>';}

function updateEditorRefs(){const node=$('#editor-refs');if(node)node.innerHTML=editorRefsHtml();}

function renderEditor(){richController?.destroy();richController=null;state.draft||=blankDraft();const d=state.draft;document.title='写攻略 · 查无此地生存手册';$('#article-main').innerHTML=`<div class="editor-heading"><div><h1>${d.id?'继续编辑攻略':'写一篇攻略'}</h1><p>把你的探索经验，留在这本手册里。</p></div><div class="editor-actions"><span class="save-status" id="save-status">${storageProblem?'保存失败，内容已保留':d.title?'已载入账号草稿':'草稿尚未保存'}</span><button class="button" data-action="save">${icon('save')}保存草稿</button><button class="button primary" data-action="preview">${icon('eye')}阅读预览</button></div></div><div class="editor-layout"><section class="editor-paper" aria-label="攻略编辑器"><div class="editor-meta"><input id="article-title" class="editor-title" aria-label="攻略标题" maxlength="80" placeholder="给这篇攻略起个名字" value="${esc(d.title)}"><textarea id="article-summary" class="editor-summary" aria-label="攻略摘要" maxlength="200" placeholder="用一两句话告诉读者，这篇攻略能帮到什么。">${esc(d.summary)}</textarea></div><div class="editor-toolbar" aria-label="正文工具栏"><button class="toolbar-button" data-format="heading" aria-label="插入小标题"><strong>H₂</strong></button><button class="toolbar-button" data-format="bold" aria-label="加粗"><strong>B</strong></button><button class="toolbar-button" data-format="list" aria-label="插入列表">${icon('list')}</button><span class="toolbar-separator"></span><span class="toolbar-label">关联</span>${Object.entries(kinds).map(([kind,label])=>`<button class="toolbar-button" data-picker="${kind}">${icon(kind)}${label}</button>`).join('')}<span class="toolbar-separator"></span><button class="toolbar-button" data-action="image-upload">${icon('image')}图片</button><input type="file" id="image-file" class="media-file" accept="image/png,image/jpeg,image/webp"></div><div class="editor-mode" aria-label="编辑模式"><button data-mode="rich" class="${editorMode==='rich'?'active':''}">所见即所得</button><button data-mode="markdown" class="${editorMode==='markdown'?'active':''}">Markdown</button><button data-mode="preview" class="${editorMode==='preview'?'active':''}">排版预览</button><button class="text-button" data-action="sample" style="margin-left:auto">载入示例</button></div><div id="rich-body" class="rich-body article-body" contenteditable="true" role="textbox" aria-label="攻略正文（所见即所得）" aria-multiline="true" spellcheck="false" ${editorMode==='rich'?'':'hidden'}></div><textarea id="article-body" class="editor-body" aria-label="攻略正文（Markdown）" placeholder="## 小标题&#10;&#10;从第一步开始写吧…" maxlength="30000" ${editorMode==='markdown'?'':'hidden'}>${esc(d.body)}</textarea><div class="editor-inline-preview" id="inline-preview" ${editorMode==='preview'?'':'hidden'}><div class="article-body">${renderBody(d)}</div></div><div class="editor-bottom"><span id="editor-help">${editorMode==='markdown'?'Markdown 模式：可编辑正文标记，也可从工具栏插入词条与图片。':'直接编辑正文；词条显示名称或卡片，图注可在图片下修改。'}</span><span id="word-count">${d.body.length} 字</span></div></section><aside class="editor-side"><section class="settings-box"><h2>文章设置</h2><label class="field"><span>攻略分类</span><select id="article-category">${categories.map(c=>`<option ${d.category===c?'selected':''}>${c}</option>`).join('')}</select></label><label class="field"><span>适用游戏版本</span><input id="article-version" maxlength="50" placeholder="例如：EA 0.7.1 / Build…" value="${esc(d.version)}"><small>请填写你实际体验的版本，和图鉴资料版本分开记录。</small></label><label class="field"><span>剧透程度</span><select id="article-spoiler"><option value="none" ${d.spoiler==='none'?'selected':''}>不含剧情剧透</option><option value="light" ${d.spoiler==='light'?'selected':''}>含少量剧情线索</option></select></label></section><section class="settings-box"><h2>攻略视频</h2><label class="check-label"><input type="checkbox" id="video-enabled" ${d.videoEnabled?'checked':''}><span>附上攻略视频</span></label><div id="video-fields" ${d.videoEnabled?'':'hidden'}><label class="field"><span>B 站视频链接</span><input id="video-url" type="url" placeholder="https://www.bilibili.com/video/BV…" value="${esc(d.videoUrl)}"><small>粘贴完整 BV 链接，发布后自动出现视频区。</small></label><label class="field"><span>视频标题</span><input id="video-title" maxlength="80" placeholder="例如：完整流程演示" value="${esc(d.videoTitle)}"></label><label class="field"><span>视频作者 / 署名</span><input id="video-author" maxlength="80" placeholder="填写原作者，保留出处" value="${esc(d.videoAuthor)}"></label><label class="field"><span>播放分 P</span><input id="video-page" type="number" min="1" max="999" step="1" value="${esc(d.page)}"></label><p id="video-validation" class="small-note"></p></div><p class="small-note">播放器默认不自动播放。请填写你有权使用的视频链接。</p></section><section class="settings-box"><h2>本篇关联</h2><div id="editor-refs">${editorRefsHtml()}</div></section><section class="settings-box"><h2>草稿在这里</h2><p class="small-note">草稿自动保存到当前账号。图片上传后随文章关联；发布前只对你可见。</p><button class="text-button draft-export" data-action="export">导出草稿备份 ${icon('external')}</button><label class="field" style="margin-top:10px"><span>导入草稿备份</span><input id="draft-import" type="file" accept="application/json,.json"></label><p class="small-note">保存草稿后可跨会话继续；发布前请核对版本、署名和图片。</p></section></aside></div>`;initRichEditor();validateVideoUI();}

function renderRichReference(key,label,display){
  const entry=byKey(key),kind=key.split(':')[0],name=entry?.name||label;
  const attrs=`contenteditable="false" data-rich-ref="${esc(key)}" data-name="${esc(label||name)}" data-display="${display}"`;
  const remove=`<button type="button" class="rich-remove" data-rich-action="remove" aria-label="移除词条：${esc(name)}">${icon('close')}</button>`;
  if(display==='card')return `<div class="rich-card" ${attrs}><span class="entity-image">${imageHtml(entry)}</span><div class="rich-card-copy"><strong>${esc(name)}</strong><small>${esc(kinds[kind]||'Wiki')} · ${esc(entry?.category||'资料暂不可用')}</small></div><button type="button" class="rich-card-view" data-rich-action="view" aria-label="查看词条：${esc(name)}">查看资料</button>${remove}</div>`;
  return `<span class="rich-chip" ${attrs}><button type="button" class="rich-chip-name" data-rich-action="view" aria-label="查看词条：${esc(name)}">${icon(kind)}${esc(name)}</button>${remove}</span>`;
}

function renderRichImage(id,src,caption){
  return `<figure class="rich-media" contenteditable="false" data-rich-media="${esc(id)}">${safeImage(src)?`<img src="${esc(safeImage(src))}" alt="${esc(caption||'攻略配图')}">`:'<div class="missing-image">配图暂不可用，图注和引用已保留。</div>'}<div class="rich-media-tools"><span>攻略配图</span><button type="button" data-rich-action="edit-image">图片信息</button><button type="button" data-rich-action="remove" aria-label="移除图片">${icon('close')}移除</button></div><figcaption contenteditable="plaintext-only" role="textbox" aria-label="图片图注" data-placeholder="点击填写图注，说明图片里需要注意的内容">${esc(caption)}</figcaption></figure>`;
}

function initRichEditor(){
  richController=new WikiArticleRichEditor($('#rich-body'),{
    render:body=>renderBody({...state.draft,body}),referenceHtml:renderRichReference,imageHtml:renderRichImage,
    onChange:autosave,onEntity:openEntity,onEditImage:openExistingImage,onFailure:toast,
  });
  richController.setMarkdown(state.draft.body);
}

function switchEditorMode(mode){
  captureDraft();
  editorMode=mode;
  $('#article-body').hidden=mode!=='markdown';$('#rich-body').hidden=mode!=='rich';$('#inline-preview').hidden=mode!=='preview';
  if(mode==='rich')richController.setMarkdown(state.draft.body);
  if(mode==='preview')$('#inline-preview').innerHTML=`<div class="article-body">${renderBody(state.draft)}</div>`;
  $$('[data-mode]').forEach(button=>button.classList.toggle('active',button.dataset.mode===mode));
  $('#editor-help').textContent=mode==='markdown'?'Markdown 模式：可编辑正文标记，也可从工具栏插入词条与图片。':'直接编辑正文；词条显示名称或卡片，图注可在图片下修改。';
  persist();
}

function markdownCaption(text){return text.replace(/\\/g,'\\\\').replace(/\[/g,'\\[').replace(/\]/g,'\\]').replace(/[\r\n]/g,' ');}

function showImageComposer(){
  const image=pendingImage;
  const imagePreview=image.src?'<img src="'+esc(image.src)+'" alt="待插入的攻略配图">':'<div class="missing-image">原图暂不可用，仍可修改图注。</div>';
  $('#image-insert-dialog').innerHTML=`<div class="dialog-top"><h2 id="image-insert-title">${image.atom?'编辑图片信息':'插入攻略配图'}</h2><button class="icon-button" data-close="image-insert-dialog" aria-label="取消图片编辑">${icon('close')}</button></div><div class="dialog-body"><div class="image-insert-preview">${imagePreview}</div><label class="field"><span>图片图注</span><textarea id="image-caption-input" maxlength="500" rows="3" placeholder="例如：岔路口左侧的入口，留意图中标注的位置。">${esc(image.caption||'')}</textarea><small>可以先留空，之后直接在图片下方填写或修改。</small></label><div class="dialog-actions"><button class="button" data-close="image-insert-dialog">取消</button><button class="button primary" data-action="confirm-image">${image.atom?'保存图片信息':'插入图片'}</button></div></div>`;
  $('#image-insert-dialog').showModal();$('#image-caption-input').focus();
}

function openExistingImage(atom){
  if(!richController?.root.contains(atom))return;
  captureDraft();pendingImage={id:atom.dataset.richMedia,src:atom.querySelector('img')?.getAttribute('src')||'',caption:atom.querySelector('figcaption').textContent,draft:state.draft,atom};showImageComposer();
}

function validateVideoUI(){const node=$('#video-validation');if(!node)return;const d=state.draft;const v=parseVideo(d);node.className=v.ok?'video-valid':'field-error';node.textContent=d.videoEnabled&&d.videoUrl?(v.ok?`视频链接有效 · 第 ${v.page} P`:v.error):'';}

function rememberCursor(){if(editorMode==='rich'){richController?.remember();return;}const area=$('#article-body');if(area&&document.activeElement===area)cursor={start:area.selectionStart,end:area.selectionEnd};}

function insertText(text){const area=$('#article-body');if(!area)return false;const start=Math.min(cursor.start,area.value.length),end=Math.min(cursor.end,area.value.length);if(area.value.length-(end-start)+text.length>30000){toast('正文最多 30000 字，请精简后再插入。');return false;}area.value=area.value.slice(0,start)+text+area.value.slice(end);const pos=start+text.length;cursor={start:pos,end:pos};editorMode='markdown';area.hidden=false;$('#rich-body').hidden=true;$('#inline-preview').hidden=true;$$('[data-mode]').forEach(b=>b.classList.toggle('active',b.dataset.mode==='markdown'));area.focus();area.setSelectionRange(pos,pos);autosave();return true;}

function openPicker(kind='item',explore=false){rememberCursor();pickerKind=kind;const dialog=$('#picker-dialog');dialog.dataset.explore=String(explore);dialog.innerHTML=`<div class="dialog-top"><h2 id="picker-title">${explore?'从词条找攻略':'插入 Wiki 关联'}</h2><button class="icon-button" data-close="picker-dialog" aria-label="关闭关联选择器">${icon('close')}</button></div><div class="picker-search"><label class="search-box">${icon('search')}<input type="search" id="picker-query" aria-label="搜索 Wiki 词条" placeholder="搜索词条名称，例如：绷带、牛虻、栖身之所"></label></div><div class="picker-tabs">${Object.entries(kinds).map(([k,l])=>`<button class="filter" data-picker-tab="${k}" aria-pressed="${k===kind}">${icon(k)} ${l}</button>`).join('')}</div><div id="picker-results" class="picker-results" aria-live="polite"></div><div class="picker-bottom">${explore?'<p>选择词条后，查找引用它的攻略。</p>':`<div class="display-options"><label><input type="radio" name="reference-display" value="inline" ${pickerMode==='inline'?'checked':''}>行内名称</label><label><input type="radio" name="reference-display" value="card" ${pickerMode==='card'?'checked':''}>资料卡片</label></div><p>在正文光标处插入；图片与资料由 Wiki 自动关联。</p>`}</div>`;renderPickerResults();dialog.showModal();$('#picker-query').focus();}

function renderPickerResults(){const q=($('#picker-query')?.value||'').trim().toLowerCase();const preferred=['consume_bandage','consume_medicalBag_Small','food_cannedBeef','Office_Fly','Office_Horse','FogMan','Shelter'];const matches=catalog.filter(e=>e.kind===pickerKind&&`${e.name} ${e.id} ${e.variant} ${e.category}`.toLowerCase().includes(q));if(!q)matches.sort((a,b)=>{let ai=preferred.indexOf(a.id),bi=preferred.indexOf(b.id);return (ai<0?999:ai)-(bi<0?999:bi);});const shown=matches.slice(0,70);$('#picker-results').innerHTML=shown.length?shown.map(e=>`<button class="picker-item" data-insert="${esc(e.kind+':'+e.id)}">${imageHtml(e)}<span><strong>${esc(e.name)}${e.variant?' · '+esc(e.variant):''}</strong><small>${esc(kinds[e.kind])} · ${esc(e.category||'Wiki 资料')}<br>${esc((e.description||'暂无补充说明').slice(0,65))}</small></span>${icon($('#picker-dialog').dataset.explore==='true'?'search':'check')}</button>`).join(''):'<div class="picker-empty">没有找到匹配词条。试试更短的名称，或切换类型。</div>';}

function openEntity(key,label='',push=false){
  const dialogNode=$('#entity-dialog');
  if(!dialogNode.open){entityTrail=[];entityOrigin={node:document.activeElement,y:scrollY};}
  else if(push)stashEntity();
const e=byKey(key),[kind,...parts]=key.split(':');const id=parts.join(':');const dialog=$('#entity-dialog');dialog.innerHTML=`<div class="dialog-top"><h2 id="entity-title">${esc(kinds[kind]||'Wiki')}资料</h2><button class="icon-button" data-close="entity-dialog" aria-label="关闭资料卡，返回正文">${icon('close')}</button></div><div class="dialog-body"><div class="entity-hero"><span class="large-art">${imageHtml(e)}</span><div><span class="tag neutral">${esc(e?.category||'原文关联')}</span><h3>${esc(e?.name||label||id)}</h3></div></div><p class="entity-description">${esc(e?.description||'该引用的资料暂不可用。保留文章原名称和位置，作者可稍后复核。')}</p>${e?.stats?.length?`<dl class="entity-stats">${e.stats.map(s=>`<div><dt>${esc(s.label||s.name||'资料值')}</dt><dd>${esc(s.value??'未记录')}</dd></div>`).join('')}</dl>`:''}<p class="entity-caveat">${e?`Wiki 资料版本：${esc(e.versionSummary||'按原条目记录')}。资料为静态整理，不能代替游戏实测；完整条件以原图鉴为准。`:'此条目没有自动替换成同名内容，也没有删除原文。'}</p><div class="dialog-actions"><button class="button" data-close="entity-dialog">返回继续阅读</button>${e?(kind==='quest'?`<button class="button primary" data-task-detail="${esc(id)}">查看任务详情 ${icon('arrow')}</button>`:`<a class="button primary" href="${esc(e.route)}" target="_blank" rel="noopener noreferrer">完整${esc(kinds[kind])}图鉴 ${icon('external')}</a>`):''}</div></div>`;finishEntity(dialog);}

function openImage(src,caption){const safe=safeImage(src);if(!safe)return;$('#image-dialog').innerHTML=`<div class="dialog-top"><h2 id="image-title">查看攻略配图</h2><button class="icon-button" data-close="image-dialog" aria-label="关闭大图">${icon('close')}</button></div><img src="${esc(safe)}" alt="${esc(caption||'攻略配图')}"><p class="image-caption">${esc(caption)}</p>`;$('#image-dialog').showModal();}

function validateDraft(){const d=state.draft;if(!d?.title.trim())return '请先填写攻略标题。';if(!d.body.trim())return '正文还是空的，先写下第一段再预览。';if(d.title.length>80||d.summary.length>200||d.body.length>30000)return '内容超过字数限制，请精简后再预览。';const v=parseVideo(d);if(!v.ok)return v.error;return '';}

function stashEntity(){const d=$('#entity-dialog');entityTrail.push({nodes:[...d.childNodes],scroll:d.scrollTop,focus:document.activeElement,detailed:d.classList.contains('task-reading-dialog')});}
function finishEntity(dialog){
  dialog.classList.remove('task-reading-dialog');
  if(entityTrail.length){const back=document.createElement('button');back.className='text-button entity-back';back.dataset.action='entity-back';back.textContent='← 返回上一张资料卡';dialog.querySelector('.dialog-top').prepend(back);}
  if(!dialog.open)dialog.showModal();else dialog.querySelector('.dialog-top button[data-close]')?.focus({preventScroll:true});
  dialog.scrollTop=0;
}
function backEntity(){const frame=entityTrail.pop();if(!frame)return;const d=$('#entity-dialog');d.replaceChildren(...frame.nodes);d.classList.toggle('task-reading-dialog',frame.detailed);frame.focus?.focus({preventScroll:true});d.scrollTop=frame.scroll;}
function taskDetails(id){
  const m=questData?.missions.find(x=>x.id===id);if(!m)return;
  const dialog=$('#entity-dialog');stashEntity();
  dialog.innerHTML=`<div class="dialog-top"><h2 id="entity-title">任务详情</h2><button class="icon-button" data-close="entity-dialog" aria-label="关闭任务详情，返回正文">${icon('close')}</button></div><div class="dialog-body task-reading-body"><p class="detail-tag">${esc(window.QuestGuide.types[m.channel]||'任务')}</p><h3 class="task-reading-name"></h3><p class="description"></p><div class="task-reading-details"></div><div class="dialog-actions"><button class="button primary" data-close="entity-dialog">返回继续阅读</button></div></div>`;
  window.QuestGuide.appendRich(dialog.querySelector('.task-reading-name'),m.name,m.emphasis?.name);
  window.QuestGuide.appendRich(dialog.querySelector('.description'),m.description,m.emphasis?.description);
  const target=dialog.querySelector('.task-reading-details');
  const review=window.QuestGuide.status(m);for(const text of [review?.description,...m.review?.notes||[]].filter(Boolean)){const p=document.createElement('p');p.className='guide-note';p.textContent=text;target.append(p);}
  const link=(text,route)=>{
    const match=/^#(quest|item|enemy)\/(.+)$/.exec(route);
    if(match){const button=document.createElement('button');button.className='inline-link';button.dataset.entity=match[1]+':'+decodeURIComponent(match[2]);button.dataset.label=text;button.textContent=text;return button;}
    const a=document.createElement('a');a.href=route;a.target='_blank';a.rel='noopener noreferrer';a.className='inline-link';a.textContent=text+' ↗';return a;
  };
  window.QuestGuide.appendDetails(target,m,questData,{context:true,classifyMission:window.QuestSemantics.classifyMission,itemIds:new Set(catalog.filter(e=>e.kind==='item').map(e=>e.id)),link,getItem:id=>entity('item',id),itemLink:id=>{const i=entity('item',id);if(i)return link(i.name,'#item/'+encodeURIComponent(id));const span=document.createElement('span');span.textContent='物品资料待补充';return span;}});
  finishEntity(dialog);dialog.classList.add('task-reading-dialog');
}

function publishCheck(){if(location.hash.startsWith('#write'))captureDraft();const error=validateDraft();if(error){toast(error);return;}const d=state.draft;$('#publish-dialog').innerHTML=`<div class="dialog-top"><h2 id="publish-title">发布前，再看一眼</h2><button class="icon-button" data-close="publish-dialog" aria-label="关闭发布确认">${icon('close')}</button></div><div class="dialog-body"><h3>${esc(d.title)}</h3><dl><dt>分类</dt><dd>${esc(d.category)}</dd><dt>词条关联</dt><dd>${refsFromBody(d.body).length} 项</dd><dt>攻略视频</dt><dd>${d.videoEnabled?'附 B 站视频 · 第 '+esc(d.page)+' P':'未附视频'}</dd><dt>适用版本</dt><dd>${esc(d.version||'尚未填写')}</dd><dt>可见范围</dt><dd>本站读者</dd></dl><p class="notice">确认后，读者将看到当前草稿的完整内容；后续保存草稿不会直接更新已发布版本。</p><div class="dialog-actions"><button class="button" data-close="publish-dialog">继续检查</button><button class="button primary" data-action="publish">确认发布到 Wiki</button></div></div>`;$('#publish-dialog').showModal();}

function bindReadingProgress(){readingController?.dispose();readingController=window.WikiArticleReading.mount(host);}

function openShare(url){$('#publish-dialog').innerHTML=`<div class="dialog-top"><h2 id="publish-title">分享攻略链接</h2><button class="icon-button" data-close="publish-dialog" aria-label="关闭">${icon('close')}</button></div><div class="dialog-body"><label class="field"><span>复制下面的地址</span><input readonly value="${esc(url)}" aria-label="攻略分享地址"></label><p class="small-note">已发布攻略可通过链接阅读；未发布草稿只对作者可见。</p></div>`;$('#publish-dialog').showModal();}

let reacting=false;
let questData=null,readingController=null,entityTrail=[],entityOrigin=null;
let catalog=[],entityMap=new Map(),catalogPromise=null,host=null,viewOptions=null,viewKind='',viewId='',viewSerial=0,identity='',mountSequence=0,activeMount=0;
let state={draft:null,articles:[],likes:{},saved:{},comments:{},commentMore:{}},articleCache=new Map();
let listState={category:'全部',query:'',sort:'latest',saved:false,mine:false,offset:0,total:0,more:false};
let editorMode='rich',cursor={start:0,end:0},pickerKind='item',pickerMode='inline',richController=null,pendingImage=null;
let saveTimer,toastTimer,searchTimer,storageProblem=false,saveRunning=null,saveBlocked=false,savedFingerprint='',listSequence=0;
const samples=[];
const fields=['title','summary','body','category','version','spoiler','videoEnabled','videoUrl','videoTitle','videoAuthor','page'];
const $main=()=>document.getElementById('article-main');
function blankDraft(){return {title:'',summary:'',body:'',category:'新手入门',version:'',spoiler:'none',videoEnabled:false,videoUrl:'',videoTitle:'',videoAuthor:'',page:1,images:{}};}
function documentFields(d){return Object.fromEntries(fields.map(k=>[k,d[k]??blankDraft()[k]]));}
function fingerprint(d){return JSON.stringify(documentFields(d));}
function dateText(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function live(ticket=viewSerial,user=identity){return !!host?.isConnected&&viewOptions?.isCurrent()&&ticket===viewSerial&&user===identity;}
function toast(message){const t=$('#article-toast');if(!t)return;clearTimeout(toastTimer);t.textContent=message;t.hidden=false;toastTimer=setTimeout(()=>{if(t.isConnected)t.hidden=true;},5000);}
function updateSaveStatus(text){const n=$('#save-status');if(n)n.textContent=text;}
function offerRecovery(){try{const r=JSON.parse(localStorage.getItem('nsp-article-rescue:'+identity)||'null');if(!r?.draft||r.draft.id!==state.draft?.id||r.at<=(state.draft?.updated||0)||fingerprint(r.draft)===fingerprint(state.draft))return;const b=document.createElement('button');b.className='button';b.textContent='恢复此浏览器的未保存内容';b.onclick=()=>{state.draft={...state.draft,...documentFields(r.draft),images:{...state.draft.images,...r.draft.images}};renderEditor();autosave();};$('.editor-heading').after(b);}catch{}}
function backupDraft(){if(!state.draft||!identity)return;try{localStorage.setItem('nsp-article-rescue:'+identity,JSON.stringify({draft:state.draft,at:Date.now()}));}catch{storageProblem=true;}}
function persist(){backupDraft();return true;}
function showFailure(error){const text=error?.message||String(error);toast(text);if(viewKind==='write'){
  let n=$('#article-save-error');if(!n){n=document.createElement('div');n.id='article-save-error';n.className='article-save-error';$('.editor-heading')?.after(n);}
  n.replaceChildren(document.createTextNode(text));if(error?.status===409){saveBlocked=true;const b=document.createElement('button');b.className='button';b.dataset.action='save-copy';b.textContent='另存为新草稿';n.append(document.createElement('br'),b);}
  updateSaveStatus('未保存，当前内容已保留');backupDraft();
}}
function safeImage(src){return /^\/(?:api\/article-media\/[0-9a-f-]{36}|(?:icons|assets|ui)\/[^\s<>]+)$/.test(src||'')?src:'';}
async function api(route,options){return window.CommunityAuth.api(route,options);}
const write=(method,data)=>window.CommunityAuth.write(method,data);
async function loadCatalog(){if(catalogPromise)return catalogPromise;catalogPromise=(async()=>{
  const [items,enemies,quests]=await Promise.all(['items','enemies','quests'].map(async name=>{const r=await fetch('/data/'+name+'.json');if(!r.ok)throw Error('词条资料暂时不可用');return r.json();}));
  questData=quests;catalog=[];for(const [kind,rows]of [['item',items.items],['enemy',enemies.enemies],['quest',quests.missions]])for(const e of rows){const image=e.icon||e.image||(kind==='quest'?'ui/quest-mail.png':'');catalog.push({kind,id:e.id,name:e.displayName||e.name,category:kind==='quest'?'任务资料':e.subcategory||e.category||'',variant:e.variant||'',description:e.description||e.combatFacts?.[0]||'',image:image?'/'+image:'',stats:e.stats?.slice(0,4)||[],versionSummary:('资料 Build'+(e.sourceBuild||e.rulesBuild||e.definitionBuild||'按原条目记录')),route:location.pathname+'#'+kind+'/'+encodeURIComponent(e.id)});}
  entityMap=new Map(catalog.map(e=>[e.kind+':'+e.id,e]));
})();try{await catalogPromise;}catch(e){catalogPromise=null;throw e;}}
function artHtml(a){if(a.cover)return `<img class="wide" src="${esc(safeImage(a.cover))}" alt="攻略封面" loading="lazy">`;return imageHtml(byKey(a.refs?.[0]),'pixel');}
function articleRefs(a){return a.refs||refsFromBody(a.body||'').map(r=>r.kind+':'+r.id);}
function currentArticle(){return viewKind==='article-preview'?draftToArticle():articleCache.get(viewId);}
function draftToArticle(){const d=state.draft||blankDraft(),v=parseVideo(d);return {...d,id:d.id||'preview',author:identity,date:dateText(),minutes:Math.max(1,Math.ceil((d.body||'').length/400)),likes:0,isSample:false,canEdit:true,video:d.videoEnabled&&v.ok?{bvid:v.bvid,page:v.page,title:d.videoTitle||'攻略视频',attribution:d.videoAuthor||'未填写视频署名'}:null};}
function absorb(a){articleCache.set(a.id,a);state.likes[a.id]=a.liked;state.saved[a.id]=a.bookmarked;return a;}
async function requireAccount(){const user=await window.CommunityAuth.refresh();if(user)return true;window.CommunityAuth.signIn(()=>loadView(),document.activeElement);return false;}
async function saveDraft(){
  while(saveRunning){await saveRunning;if(!state.draft)return null;}
  captureDraft();if(!state.draft||!identity)return null;if(saveBlocked)throw Object.assign(Error('服务器草稿已变化，请保留当前内容并另存为新草稿'),{status:409});
  const d=state.draft,snapshot=documentFields(d),stamp=JSON.stringify(snapshot),ticket=viewSerial,user=identity;
  if(d.id&&stamp===savedFingerprint)return d;
  updateSaveStatus('正在保存到账号…');backupDraft();
  const operation=(async()=>{
    try{
      const result=await api(d.id?'articles/'+d.id:'articles',write(d.id?'PATCH':'POST',{...snapshot,...(d.id?{revision:d.revision}:{})}));
      if(user!==identity||state.draft!==d)return null;
      d.id=result.article.id;if(live(ticket,user)&&viewKind==='write'&&!viewId){viewId=d.id;history.replaceState(null,'','#write/'+d.id);}d.revision=result.article.revision;d.status=result.article.status;d.updated=result.article.updated;d.created=result.article.created;d.publishedRevision=result.article.publishedRevision;savedFingerprint=stamp;absorb(result.article);storageProblem=false;
      if(live(ticket,user)){updateSaveStatus(fingerprint(d)===stamp?'已保存到当前账号':'有新修改，等待保存');$('#article-save-error')?.remove();}
      return d;
    }catch(e){if(user===identity&&state.draft===d){if(e.status===409)saveBlocked=true;if(live(ticket,user))showFailure(e);}throw e;}
  })();saveRunning=operation;try{return await operation;}finally{if(saveRunning===operation)saveRunning=null;}
}
function autosave(){captureDraft();backupDraft();clearTimeout(saveTimer);updateSaveStatus('有未保存修改');const n=$('#word-count');if(n)n.textContent=(state.draft?.body||'').length+' 字';updateEditorRefs();
  if(saveBlocked)return;const ticket=viewSerial,user=identity;saveTimer=setTimeout(()=>{if(live(ticket,user)&&state.draft&&fingerprint(state.draft)!==savedFingerprint)saveDraft().catch(()=>{});},1600);
}
async function loadGallery(){const seq=++listSequence,ticket=viewSerial,user=identity,params=new URLSearchParams({sort:listState.sort,offset:String(listState.offset)});if(listState.category!=='全部')params.set('category',listState.category);if(listState.query)params.set('q',listState.query);if(listState.saved)params.set('saved','1');if(listState.mine)params.set('mine','1');
  const result=await api('articles?'+params);if(!live(ticket,user)||seq!==listSequence)return;state.articles=result.articles;listState.more=result.more;listState.total=result.total;
  if($('#list-content'))$('#list-content').innerHTML=listContent();else renderList();
}
function listContent(){return `<div class="section-heading"><h2>${listState.mine?'我的草稿与作品':listState.saved?'我的收藏':'探索者的图文攻略'}</h2><span>${listState.total} 篇</span></div>${state.articles.length?`<div class="guide-grid">${state.articles.map(a=>listState.mine?`<article class="guide-card"><div class="guide-copy"><h3><a href="#write/${a.id}">${esc(a.title||'未命名草稿')}</a></h3><p>${esc(a.summary)}</p><span class="tag neutral">${a.status==='published'?'已发布，仍可编辑草稿':a.status==='withdrawn'?'已撤下':'未发布草稿'}</span><p class="draft-info">${esc(a.date)} · ${a.minutes} 分钟阅读</p><a class="button" href="#write/${a.id}">继续编辑</a>${a.status==='published'?`<a class="text-button" href="#article/${a.id}">查看已发布版本</a>`:''}</div></article>`:cardHtml(a)).join('')}</div>`:`<div class="empty-state"><h2>${listState.mine?'还没有账号草稿':listState.saved?'还没有收藏的攻略':'还没有匹配的攻略'}</h2><p>试着调整搜索条件，或写下你的第一篇探索笔记。</p><a class="button primary" href="#write" data-action="new-draft">写一篇攻略</a></div>`}<div class="feedback-actions" style="margin-top:24px">${listState.offset?'<button class="button" data-action="previous-page">上一页</button>':''}${listState.more?'<button class="button" data-action="next-page">下一页</button>':''}</div>`;}
function renderList(){document.title='图文攻略 · 查无此地 Wiki';$main().innerHTML=`<section class="page-heading"><div><h1>${listState.mine?'我的草稿与作品':'图文攻略'}</h1><p>把图鉴里的资料，变成你的探索经验。</p></div><div class="heading-actions"><label class="search-box">${icon('search')}<input id="guide-search" type="search" maxlength="100" placeholder="搜索攻略、物品、敌怪或任务" aria-label="搜索攻略" value="${esc(listState.query)}"></label><a class="button primary" href="#write" data-action="new-draft">${icon('pen')}写一篇攻略</a></div></section><section class="filter-row"><div class="filters">${['全部',...categories].map(c=>`<button class="filter" data-category="${c}" aria-pressed="${listState.category===c}">${c}</button>`).join('')}</div><div class="filter-options"><button class="button ghost" data-action="saved-filter" aria-pressed="${listState.saved}">${icon('bookmark')}我的收藏</button><select id="guide-sort" aria-label="攻略排序"><option value="latest">最近更新</option><option value="popular">最多点赞</option></select></div></section><div id="list-content">${listContent()}</div>`;$('#guide-sort').value=listState.sort;}
function commentHtml(a){const rows=state.comments[a.id]||[];return `<section class="comment-section" id="comments"><h2>讨论 <span class="muted">${rows.length}</span></h2>${identity?'<form class="comment-form" id="comment-form"><textarea id="comment-input" aria-label="写下你的补充" placeholder="补充经验、提出问题，或指出需要复核的地方…" maxlength="500" required></textarea><button class="button" type="submit">发布评论</button></form>':'<p class="small-note">登录现有 Wiki 账号后可以评论。</p><button class="button" data-action="login">登录 / 注册</button>'}<div id="comment-list">${rows.map(c=>`<article class="comment-item"><div class="author-line"><span class="avatar">${esc(c.author[0])}</span><strong>${esc(c.author)}</strong><span>${new Date(c.created).toLocaleString('zh-CN')}</span>${c.canDelete?`<button class="text-button" data-comment-delete="${c.id}">删除评论</button>`:''}</div><p>${esc(c.body)}</p></article>`).join('')||'<p class="comment-empty">还没有讨论，欢迎留下补充。</p>'}</div>${state.commentMore[a.id]?'<button class="button" data-action="more-comments">加载较早的评论</button>':''}</section>`;}
async function publishArticle(){const ticket=viewSerial,user=identity;const d=await saveDraft();if(!d||!live(ticket,user))return;if(fingerprint(d)!==savedFingerprint){await saveDraft();if(!live(ticket,user))return;}
  const data=await api('articles/'+d.id+'/publish',write('POST',{revision:d.revision}));if(!live(ticket,user))return;d.revision=data.article.revision;d.status='published';d.publishedRevision=data.article.publishedRevision;absorb(data.article);$('#publish-dialog').close();location.hash='#article/'+d.id;toast('攻略已发布。保存后续草稿不会直接改变读者看到的版本。');
}
async function pngFile(file){if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024)throw Error('请选择8MiB以内的PNG、JPEG或WebP图片');const image=await createImageBitmap(file);try{const scale=Math.min(1,2000/image.width,12000/image.height),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));if(canvas.width*canvas.height>24000000)throw Error('图片像素过大');canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob||blob.size>5*1024*1024)throw Error('处理后的图片超过5MiB，请缩小图片后再试');return new File([blob],'article.png',{type:'image/png'});}finally{image.close();}}
function openImageComposer(file){captureDraft();const currentDraft=state.draft;const reader=new FileReader();reader.onload=()=>{if(!live()||viewKind!=='write'||currentDraft!==state.draft)return;pendingImage={file,id:null,src:String(reader.result),caption:'',draft:currentDraft,atom:null};showImageComposer();};reader.onerror=()=>toast('图片读取失败，当前正文已保留');reader.readAsDataURL(file);}
async function confirmImageInsert(){const image=pendingImage;if(!image||image.draft!==state.draft||viewKind!=='write')return;const caption=$('#image-caption-input').value.trim(),ticket=viewSerial,user=identity;const button=$('[data-action="confirm-image"]');button.disabled=true;try{
  if(!image.atom&&!image.upload){const file=await pngFile(image.file),form=new FormData();form.set('image',file);image.upload=await api('article-media',{method:'POST',body:form});}
  if(!live(ticket,user)||state.draft!==image.draft)return;$('#image-insert-dialog').close();
  if(image.atom){image.atom.querySelector('figcaption').textContent=caption;const img=image.atom.querySelector('img');if(img)img.alt=caption||'攻略配图';richController.dirty=true;autosave();}
  else{const id=image.upload.id,url=image.upload.url;const inserted=editorMode==='rich'?richController.insertImage(id,url,caption):insertText(`\n\n![${markdownCaption(caption)}](media:${id})\n\n`);if(!inserted){$('#image-insert-dialog').showModal();return;}state.draft.images[id]={data:url};}
  pendingImage=null;toast('图片已上传并加入草稿，发布前只对你可见。');
}catch(e){if(live(ticket,user))toast(e.message);}finally{if(button.isConnected)button.disabled=false;}}
function hasDraftContent(d=state.draft){return !!(d?.title?.trim()||d?.body?.trim()||d?.summary?.trim());}
async function newDraft(){if(state.draft&&fingerprint(state.draft)!==savedFingerprint&&hasDraftContent())await saveDraft();state.draft=blankDraft();savedFingerprint='';saveBlocked=false;editorMode='rich';renderEditor();}
async function exportDraft(){captureDraft();const blob=new Blob([JSON.stringify({format:'nsp-guide-draft-v1',draft:state.draft},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='wiki-guide-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出当前草稿；账号图片仍受当前账号权限保护。');}
async function loadView(){const ticket=++viewSerial;clearTimeout(saveTimer);richController?.destroy();richController=null;readingController?.dispose();readingController=null;entityTrail=[];entityOrigin=null;if(!host?.isConnected)return;
  host.classList.add('article-page');host.innerHTML='<div class="article-account-bar"></div><div id="article-main"><p class="status">正在载入图文攻略…</p></div>'+['entity','picker','publish','image','toc','image-insert'].map(name=>`<dialog id="${name}-dialog" class="${name}-dialog" aria-labelledby="${name==='image-insert'?'image-insert':name==='entity'?'entity':name==='picker'?'picker':name==='publish'?'publish':name==='image'?'image':'toc'}-title"></dialog>`).join('')+'<div id="article-toast" class="toast" role="status" hidden></div>';
  $('#entity-dialog').addEventListener('close',()=>{const origin=entityOrigin;entityTrail=[];entityOrigin=null;if(origin?.node?.isConnected){origin.node.focus({preventScroll:true});window.scrollTo({top:origin.y,behavior:'instant'});}});
  try{
    await loadCatalog();const user=await window.CommunityAuth.refresh();if(!live(ticket,identity))return;identity=user?.username||'';
    $('.article-account-bar').innerHTML=identity?`<span>当前账号：${esc(identity)}</span><a href="#articles/mine">我的草稿与作品</a><button class="text-button" data-action="logout">退出登录</button>`:'<span>阅读无需登录</span><button class="button" data-action="login">登录 / 注册</button>';
    if(viewKind==='articles'){listState.mine=viewId==='mine';if(listState.mine&&!identity){$main().innerHTML='<div class="empty-state"><h1>登录后查看账号草稿</h1><button class="button primary" data-action="login">登录 / 注册</button></div>';return;}await loadGallery();if(live(ticket,identity))renderList();}
    else if(viewKind==='write'){
      if(!identity){$main().innerHTML='<div class="empty-state"><h1>用现有 Wiki 账号写攻略</h1><p>登录后，草稿、图片和作品会保存在你的账号下。</p><button class="button primary" data-action="login">登录 / 注册</button></div>';return;}
      if(viewId){if(state.draft?.id!==viewId||fingerprint(state.draft)===savedFingerprint){const data=await api('articles/'+viewId+'?draft=1');if(!live(ticket,identity))return;state.draft=data.article;savedFingerprint=fingerprint(state.draft);saveBlocked=false;}}
      else if(!state.draft||state.draft.id&&state.draft.status==='published'){state.draft=blankDraft();savedFingerprint='';saveBlocked=false;}
      renderEditor();offerRecovery();const sample=$('[data-action="sample"]');if(sample)sample.remove();
    }else if(viewKind==='article-preview'){if(!state.draft){location.hash='#write';return;}renderReader(draftToArticle(),true);}
    else if(viewKind==='article'){const {article}=await api('articles/'+viewId);if(!live(ticket,identity))return;absorb(article);const comments=await api('articles/'+viewId+'/comments');if(!live(ticket,identity))return;state.comments[viewId]=comments.comments;state.commentMore[viewId]=comments.more;renderReader(article);if(!article.canEdit)$('[data-action="edit-current"]')?.remove();addWithdraw(article);}
  }catch(e){if(live(ticket,identity))$main().innerHTML=`<div class="empty-state"><h1>暂时无法载入攻略</h1><p>${esc(e.message)}</p><button class="button" data-action="retry">重新读取</button></div>`;}
}
function addWithdraw(article){if(article.canWithdraw){const b=document.createElement('button');b.className='button ghost';b.dataset.action='withdraw';b.textContent='撤下文章';$('.article-tools').append(b);}}
async function onClick(event){if(!host?.contains(event.target)||!viewOptions?.isCurrent())return;const b=event.target.closest('button,a');if(!b)return;try{
  if(b.dataset.taskDetail){taskDetails(b.dataset.taskDetail);return;}
  if(b.dataset.action==='entity-back'){backEntity();return;}
  if(b.dataset.close){$('#'+b.dataset.close)?.close();return;}
  if(b.dataset.entity){openEntity(b.dataset.entity,b.dataset.label,!!b.closest('#entity-dialog'));return;}if(b.dataset.image){openImage(b.dataset.image,b.dataset.caption);return;}
  if(b.dataset.picker){openPicker(b.dataset.picker);return;}if(b.dataset.pickerTab){pickerKind=b.dataset.pickerTab;$$('[data-picker-tab]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.pickerTab===pickerKind)));renderPickerResults();return;}
  if(b.dataset.insert){const e=byKey(b.dataset.insert);if(!e)return;$('#picker-dialog').close();if(editorMode==='rich')richController.insertReference(b.dataset.insert,e.name,pickerMode);else{const token=e.kind+':'+e.id+'|'+e.name;insertText(pickerMode==='card'?`\n\n{{${token}}}\n\n`:`[[${token}]]`);}return;}
  if(b.dataset.mode){switchEditorMode(b.dataset.mode);return;}
  if(b.dataset.format){rememberCursor();if(editorMode==='rich')richController.format(b.dataset.format);else{const area=$('#article-body'),text=area.value.slice(cursor.start,cursor.end);insertText(b.dataset.format==='heading'?`\n\n## ${text||'小标题'}\n\n`:b.dataset.format==='bold'?`**${text||'重点文字'}**`:`\n- ${text||'清单项'}\n`);}return;}
  if(b.dataset.section){event.preventDefault();$('#toc-dialog')?.close();document.getElementById(b.dataset.section)?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'});return;}
  if(b.dataset.category){listState.category=b.dataset.category;listState.offset=0;await loadGallery();$$('.filters [data-category]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.category===listState.category)));return;}
  if(b.dataset.commentDelete){const ticket=viewSerial,user=identity,id=viewId;await api('article-comments/'+b.dataset.commentDelete,{method:'DELETE'});if(!live(ticket,user))return;const data=await api('articles/'+id+'/comments');if(!live(ticket,user))return;state.comments[id]=data.comments;state.commentMore[id]=data.more;$('.comment-section').outerHTML=commentHtml(currentArticle());return;}
  const action=b.dataset.action;if(!action)return;
  if(action==='new-draft'){event.preventDefault();if(!await requireAccount())return;captureDraft();if(viewKind==='write')await saveDraft();state.draft=blankDraft();savedFingerprint='';saveBlocked=false;editorMode='rich';location.hash='#write';return;}
  if(action==='login'){window.CommunityAuth.signIn(()=>loadView(),b);return;}
  if(action==='logout'){captureDraft();backupDraft();clearTimeout(saveTimer);if(viewKind==='write'&&hasDraftContent())await saveDraft();await window.CommunityAuth.logout();return;}
  if(action==='retry'){await loadView();return;}
  if(action==='save'){clearTimeout(saveTimer);const d=await saveDraft();if(d)toast('草稿已保存到当前账号。');return;}
  if(action==='save-copy'){viewId='';state.draft.id=null;state.draft.revision=null;savedFingerprint='';saveBlocked=false;await saveDraft();toast('已另存为新的账号草稿，服务器原稿保持。');return;}
  if(action==='preview'){captureDraft();const message=validateDraft();if(message)throw Error(message);await saveDraft();location.hash='#article-preview';return;}
  if(action==='publish-check'){publishCheck();return;}if(action==='publish'){b.disabled=true;try{await publishArticle();}finally{if(b.isConnected)b.disabled=false;}return;}
  if(action==='edit-current'){event.preventDefault();location.hash='#write/'+viewId;return;}
  if(action==='image-upload'){rememberCursor();$('#image-file').click();return;}if(action==='confirm-image'){await confirmImageInsert();return;}
  if(action==='export'){await exportDraft();return;}
  if(action==='saved-filter'){if(!await requireAccount())return;listState.saved=!listState.saved;listState.offset=0;await loadGallery();b.setAttribute('aria-pressed',String(listState.saved));return;}
  if(action==='more-comments'){const ticket=viewSerial,user=identity,id=viewId;const data=await api('articles/'+id+'/comments?offset='+(state.comments[id]?.length||0));if(!live(ticket,user))return;state.comments[id]=[...(state.comments[id]||[]),...data.comments];state.commentMore[id]=data.more;$('.comment-section').outerHTML=commentHtml(currentArticle());return;}
  if(action==='previous-page'||action==='next-page'){listState.offset=Math.max(0,listState.offset+(action==='next-page'?20:-20));await loadGallery();return;}
  if(action==='like'||action==='bookmark'){if(reacting)return;reacting=true;const controls=$$('[data-action=like],[data-action=bookmark]');controls.forEach(x=>x.disabled=true);try{if(!await requireAccount())return;const ticket=viewSerial,user=identity,a=currentArticle(),key=action==='like'?'liked':'bookmarked';const data=await api('articles/'+a.id+'/'+action,write('PUT',{active:!a[key]}));if(!live(ticket,user)||currentArticle()?.id!==a.id)return;absorb(data.article);renderReader(data.article);addWithdraw(data.article);}finally{reacting=false;controls.forEach(x=>{if(x.isConnected)x.disabled=false;});}return;}
  if(action==='share'){try{await navigator.clipboard.writeText(location.href);toast('已复制攻略链接。');}catch{openShare(location.href);}return;}
  if(action==='top'){window.scrollTo({top:0,behavior:'smooth'});return;}
  if(action==='correction'){$('#comment-input')?.focus();$('#comments')?.scrollIntoView({behavior:'smooth'});return;}
  if(action==='toc'){$('#toc-dialog').innerHTML=`<div class="dialog-top"><h2 id="toc-title">本篇目录</h2><button class="icon-button" data-close="toc-dialog" aria-label="关闭目录">${icon('close')}</button></div><div class="toc-links">${tocHtml(currentArticle())}</div>`;$('#toc-dialog').showModal();return;}
  if(action==='load-video'){const v=currentArticle().video;$('#video-player').innerHTML=`<iframe title="${esc(v.title)}" src="https://player.bilibili.com/player.html?isOutside=true&bvid=${esc(v.bvid)}&p=${Number(v.page)}&autoplay=0" allow="fullscreen; picture-in-picture" allowfullscreen referrerpolicy="no-referrer"></iframe>`;$('[data-action="unload-video"]').hidden=false;return;}
  if(action==='unload-video'){$('.video-section').outerHTML=videoHtml(currentArticle());return;}
  if(action==='withdraw'){$('#publish-dialog').innerHTML='<div class="dialog-top"><h2 id="publish-title">撤下这篇攻略？</h2></div><div class="dialog-body"><p>撤下后读者不能继续打开正文和专属配图，账号草稿和讨论会保留。</p><div class="dialog-actions"><button class="button" data-close="publish-dialog">取消</button><button class="button primary" data-action="confirm-withdraw">确认撤下</button></div></div>';$('#publish-dialog').showModal();return;}
  if(action==='confirm-withdraw'){await api('articles/'+viewId,{method:'DELETE'});location.hash='#articles/mine';return;}
}catch(e){showFailure(e);}}
document.addEventListener('click',onClick);
document.addEventListener('pointerdown',event=>{if(!host?.contains(event.target)||!viewOptions?.isCurrent())return;if(event.target.closest('.editor-toolbar')){rememberCursor();if(editorMode==='rich'&&event.target.closest('button'))event.preventDefault();}});
document.addEventListener('selectionchange',()=>{if(host?.isConnected)rememberCursor();});
document.addEventListener('input',event=>{if(!host?.contains(event.target)||!viewOptions?.isCurrent())return;if(event.target.id==='picker-query')renderPickerResults();if(event.target.id==='guide-search'){listState.query=event.target.value.trim();listState.offset=0;clearTimeout(searchTimer);searchTimer=setTimeout(()=>loadGallery().catch(showFailure),250);return;}
  if(event.target.closest('.editor-layout')&&!event.target.closest('#rich-body')&&event.target.id!=='draft-import'){autosave();if(event.target.id==='video-url'){try{const u=new URL(event.target.value);if(/^\d+$/.test(u.searchParams.get('p')||'')){$('#video-page').value=u.searchParams.get('p');captureDraft();}}catch{}}validateVideoUI();}
});
document.addEventListener('change',async event=>{if(!host?.contains(event.target)||!viewOptions?.isCurrent())return;try{
  if(event.target.id==='guide-sort'){listState.sort=event.target.value;listState.offset=0;await loadGallery();}
  if(event.target.name==='reference-display')pickerMode=event.target.value;
  if(event.target.id==='video-enabled'){$('#video-fields').hidden=!event.target.checked;autosave();validateVideoUI();}
  if(event.target.id==='image-file'){const file=event.target.files?.[0];event.target.value='';if(file)openImageComposer(file);}
  if(event.target.id==='draft-import'){const file=event.target.files?.[0];if(!file)return;if(file.size>262144)throw Error('仅支持256KiB以内的文字草稿备份，图片需重新选择上传');const data=JSON.parse(await file.text());if(data.format!=='nsp-guide-draft-v1'||typeof data.draft?.body!=='string')throw Error('草稿格式不正确');if(hasDraftContent()){await saveDraft();}viewId='';state.draft={...blankDraft(),...documentFields(data.draft)};savedFingerprint='';saveBlocked=false;editorMode='rich';renderEditor();autosave();}
}catch(e){showFailure(e);}});
document.addEventListener('submit',async event=>{if(!host?.contains(event.target)||!viewOptions?.isCurrent()||event.target.id!=='comment-form')return;event.preventDefault();const button=event.target.querySelector('button'),input=$('#comment-input'),body=input.value.trim(),id=viewId,ticket=viewSerial,user=identity;if(!body)return;button.disabled=true;try{await api('articles/'+id+'/comments',write('POST',{body}));if(!live(ticket,user))return;const data=await api('articles/'+id+'/comments');if(!live(ticket,user))return;state.comments[id]=data.comments;state.commentMore[id]=data.more;$('.comment-section').outerHTML=commentHtml(currentArticle());toast('评论已发布。');}catch(e){if(live(ticket,user))showFailure(e);}finally{if(button.isConnected)button.disabled=false;}});

window.addEventListener('community-account-change',()=>{const next=window.CommunityAuth.account?.username||'';if(next===identity)return;backupDraft();identity=next;state.draft=null;savedFingerprint='';saveBlocked=false;state.comments={};state.commentMore={};state.likes={};state.saved={};clearTimeout(saveTimer);if(host?.isConnected)loadView();});
window.addEventListener('pagehide',()=>{captureDraft();backupDraft();});
window.WikiArticles={async mount(root,options){const mountId=++mountSequence;activeMount=mountId;host=root;viewOptions=options;viewKind=options.kind;viewId=options.id||'';await loadView();return {flush(){if(activeMount!==mountId)return Promise.resolve();if(viewKind==='write'&&identity&&state.draft&&hasDraftContent()&&fingerprint(state.draft)!==savedFingerprint)return saveDraft();return Promise.resolve();},dispose(){if(activeMount!==mountId)return;captureDraft();backupDraft();clearTimeout(saveTimer);clearTimeout(searchTimer);richController?.destroy();richController=null;readingController?.dispose();readingController=null;entityTrail=[];entityOrigin=null;host?.querySelectorAll('dialog[open]').forEach(d=>d.close());if(host===root){host=null;viewOptions=null;viewSerial++;root.classList.remove('article-page');}}};}};
})();
