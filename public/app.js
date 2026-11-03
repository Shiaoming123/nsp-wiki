(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const state = { data: null, category: 'all', query: '', subcategory: '', sort: 'default', direction: 'desc', selected: null, open: false };
  let itemIndex=new Map(), itemSearch=new Map(), categoryGroups=new Map();
  const getItem=id=>itemIndex.get(String(id));
  const symbols = { all: '▦', weapons: '⚔', ammo: '▥', attachments: '⊕', equipment: '◈', consumables: '✚', materials: '⬡', other: '◇' };
  const names = { all: '全部物品', weapons: '武器', ammo: '弹药', attachments: '配件', equipment: '装备', consumables: '消耗品', materials: '材料', other: '其他' };
  const gameTag = /<(\/?)(b|i|s|u|color|gradient)(?:=(?:"([^"]*)"|'([^']*)'|([^<>]*)))?\s*>/gi;
  const gameColors = {'#569af0':'#91bfff','#65af6a':'#9ed29e','#c05a67':'#e89ca8',purple:'#c7a5eb',orange:'#e7b978'};
  const plainText = value => String(value).replace(gameTag, '');
  const sortFields = [{key:'default',label:'图鉴顺序'},{key:'name',label:'名称'},{key:'rarity',label:'稀有度'},{key:'weightKg',label:'重量',unit:' kg'},{key:'buyPrice',label:'购买价格'},{key:'sellPrice',label:'出售价格'},{key:'maxStack',label:'最大堆叠'}];
  function sortValue(item, key) {
    if (key === 'name') return plainText(item.name || '');
    const value = key.startsWith('stat:') ? item.stats?.find(stat => stat.key === key.slice(5))?.value : item[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }
  function sortItems(items, key, direction) {
    if (key === 'default') return items;
    return items.map((item,index) => ({item,index,value:sortValue(item,key)})).sort((a,b) => {
      if (a.value === null || b.value === null) return a.value === b.value ? a.index-b.index : a.value === null ? 1 : -1;
      const order = key === 'name' ? a.value.localeCompare(b.value,'zh-CN') : a.value-b.value;
      return (direction === 'asc' ? order : -order) || a.index-b.index;
    }).map(entry => entry.item);
  }
  function gameText(node, value) {
    const text = String(value);
    if (!text.includes('<')) { node.textContent = text; return; }
    if (node.tagName === 'OPTION') { node.textContent = plainText(text); return; }
    const fragment = document.createDocumentFragment(), stack = [{tag:'', node:fragment}];
    let cursor = 0;
    for (const match of text.matchAll(gameTag)) {
      stack.at(-1).node.append(document.createTextNode(text.slice(cursor, match.index)));
      cursor = match.index + match[0].length;
      const tag = match[2].toLowerCase();
      if (tag === 'gradient') continue;
      if (match[1]) {
        for (let i = stack.length - 1; i > 0; i--) if (stack[i].tag === tag) { stack.length = i; break; }
      } else {
        const child = document.createElement(tag === 'color' ? 'span' : tag);
        if (tag === 'color') { const color = gameColors[(match[3] ?? match[4] ?? match[5] ?? '').trim().toLowerCase()]; if (color) child.style.color = color; }
        stack.at(-1).node.append(child); stack.push({tag, node:child});
      }
    }
    stack.at(-1).node.append(document.createTextNode(text.slice(cursor)));
    node.replaceChildren(fragment);
  }
  const el = (tag, className, text) => { const node = document.createElement(tag); if (className) node.className = className; if (text != null) gameText(node, text); return node; };
  const known = value => value !== null && value !== undefined && value !== '';
  const valueText = (value, suffix = '') => known(value) ? String(value) + suffix : '未记录';
  function art(icon, className, fallback = '◇') {
    const wrap = el('span', className);
    const missing = () => { wrap.replaceChildren(el('span', 'missing-icon', fallback)); };
    // Only local relative assets belong to this static handbook.
    if (typeof icon === 'string' && icon && !/^(?:[a-z]+:|\/\/|\/|\\)/i.test(icon) && !icon.split(/[\\/]/).includes('..')) {
      const img = el('img'); img.src = icon; img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.addEventListener('error', missing, { once: true }); wrap.append(img);
    } else missing();
    return wrap;
  }
  function categoryName(id) { return state.data.categories.find(c => c.id === id)?.name || names[id] || id; }
  function categoryItems() { return state.category === 'all' ? state.data.items : categoryGroups.get(state.category)||[]; }
  function renderCategories() {
    if($('categories').childElementCount){[...$('categories').children].forEach(b=>b.setAttribute('aria-pressed',String(state.open&&state.category===b.dataset.category)));return;}
    const fragment=document.createDocumentFragment();
    const categories = [...state.data.categories];
    if (!categories.some(c => c.id === 'all')) categories.unshift({ id: 'all', name: '全部物品' });
    categories.forEach(category => {
      const count = category.id === 'all' ? state.data.items.length : (categoryGroups.get(category.id)||[]).length;
      const button = el('button', 'category'); button.type = 'button'; button.dataset.category = category.id;
      button.setAttribute('aria-pressed', String(state.open && state.category === category.id));
      const copy = el('span', 'category-copy'); copy.append(el('span', 'category-name', category.name || categoryName(category.id)), el('span', 'category-count', `${count} 件物品`));
      button.append(art(category.icon, 'category-symbol', symbols[category.id] || '◇'), copy, el('span', 'category-arrow', '›'));
      button.addEventListener('click', () => { state.category = category.id; state.subcategory = ''; state.open = true; refreshSubcategories(); render(); const current = [...$('categories').children].find(node => node.dataset.category === category.id); if (current) current.focus({ preventScroll: true }); $('browser').scrollIntoView({ block: 'start' }); });
      fragment.append(button);
    });$('categories').append(fragment);
  }
  function refreshSubcategories() {
    const values = [...new Set(categoryItems().map(item => item.subcategory).filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b), 'zh-CN'));
    $('subcategory').replaceChildren(el('option', '', '全部子分类')); $('subcategory').firstChild.value = '';
    values.forEach(value => { const option = el('option', '', value); option.value = value; $('subcategory').append(option); });
    $('subcategory').value = state.subcategory;
  }
  function refreshSortOptions() {
    const items = categoryItems().filter(item => !state.subcategory || item.subcategory === state.subcategory), stats = new Map();
    items.forEach(item => item.stats?.forEach(stat => { if (typeof stat.value === 'number' && Number.isFinite(stat.value)) stats.set(stat.key,stat.label); }));
    const options = [...sortFields,...[...stats].map(([key,label]) => ({key:'stat:'+key,label}))];
    if (!options.some(option => option.key === state.sort)) state.sort = 'default';
    $('item-sort').replaceChildren(...options.map(field => { const option=el('option','',field.label);option.value=field.key;return option; }));
    $('item-sort').value = state.sort;
    $('item-sort-direction').disabled = state.sort === 'default';
    [...$('item-sort-direction').options].forEach(option => { option.textContent=state.sort==='name' ? option.value==='asc'?'名称正序':'名称倒序' : option.value==='asc'?'从低到高':'从高到低'; });
    $('item-sort-direction').value = state.direction;
    $('item-sort-note').hidden = !state.sort.startsWith('stat:');
  }
  function render() {
    $('item-page').classList.add('reference-page');$('item-page').querySelector('.intro').classList.add('reference-heading');$('result-count').classList.add('reference-count');$('items').classList.add('reference-grid');
    renderCategories(); $('browser').hidden = !state.open;
    if (!state.open) return;
    const title = categoryName(state.category); $('category-name').textContent = title; $('results-title').textContent = title;
    refreshSortOptions();
    const query = state.query.trim().toLocaleLowerCase();
    const items = sortItems(categoryItems().filter(item => (!state.subcategory || item.subcategory === state.subcategory) && (!query || itemSearch.get(item.id).includes(query))),state.sort,state.direction);
    $('result-count').textContent = `显示 ${items.length} 件物品${query ? ` · 搜索“${state.query.trim()}”` : ''}`;
    const fragment=document.createDocumentFragment(); $('empty').hidden = items.length !== 0;
    items.forEach(item => {
      const button = el('button', 'item reference-card reference-item-card'); button.type = 'button'; button.dataset.item = String(item.id); button.setAttribute('aria-label', `查看 ${item.name || item.subcategory || '物品'} 的属性与获取方式`);
      button.append(art(item.icon, 'item-art'), el('span', 'item-name', item.name || item.subcategory || '物品'), el('span', 'item-type', item.subcategory || categoryName(item.category)));
      if (!['default','name'].includes(state.sort)) {
        const value=sortValue(item,state.sort), field=sortFields.find(field=>field.key===state.sort), stat=item.stats?.find(stat=>'stat:'+stat.key===state.sort);
        const label=$('item-sort').selectedOptions[0].textContent;
        button.append(el('span','item-sort-value',`${label} · ${value === null ? '未记录' : stat?.formatted ?? String(Number(value.toFixed(3)))+(field?.unit||'')}`));
      }
      button.addEventListener('click', () => { location.hash = `item/${encodeURIComponent(item.id)}`; }); fragment.append(button);
    });$('items').replaceChildren(fragment);
  }
  function property(list, label, value) { if(value===null||value===undefined||value===''||value==='未记录')return;const entry = el('div', 'property'); entry.append(el('dt', '', label), el('dd', '', value)); list.append(entry); }
  function nativeRound(value) { const floor=Math.floor(value), fraction=value-floor; return Math.abs(fraction-.5)<1e-7 ? floor+(floor%2) : Math.round(value); }
  function nativeStat(stat) {
    const row = el('div', 'native-stat'); row.dataset.stat = stat.key;
    row.append(el('dt', 'native-stat-label', stat.label || '属性'));
    const track = el('span', `native-stat-track native-${stat.barRender === 'position' ? 'pos-track' : stat.barRender === 'dots' ? 'dots' : 'fill-track'}`);
    track.setAttribute('aria-hidden', 'true');
    const value = Number(stat.value), cap = Number(stat.barCap);
    const fraction = Number.isFinite(cap) && cap !== 0 ? Math.min(1, Math.abs(value / cap)) : 0;
    const visual = state.data.meta.nativeStatStyles[stat.key];
    const texture = (target, url) => { if(url) target.style.backgroundImage = `url("${url}")`; };
    if (visual.background) texture(track, visual.background);
    if (value < 0) track.classList.add('reverse');
    if (stat.barRender === 'dots') {
      const count = stat.barDots, active = Math.ceil(fraction * count);
      for (const edge of ['left','right']) { const border=el('span', `native-dot-border ${edge}`);texture(border,visual.border);track.append(border); }
      for (let i = 0; i < count; i++) { const dot=el('span', `native-dot${i < active ? ' active' : ''}${i === active - 1 ? ' end' : ''}`); texture(dot, i===active-1?visual.end:i<active?visual.active:visual.inactive);track.append(dot); }
    } else if (stat.barRender === 'position') {
      const marker = el('span', 'native-position'); marker.style.left = `calc(2px + (100% - 4px) * ${fraction})`; texture(marker, visual.fill); track.append(marker);
    } else {
      const fill = el('span', 'native-fill'); fill.style.width = `${fraction * 100}%`; texture(fill,visual.fill);track.append(fill);
      const end = el('span', 'native-fill-end'); const preset=visual.presets?Math.min(visual.presets.length-1,nativeRound(fraction*visual.presets.length)):null;
      const size=visual.sizeRange?Array(2).fill(visual.sizeRange[0]+(visual.sizeRange[1]-visual.sizeRange[0])*fraction):preset!==null?visual.presetSizes[preset]:visual.indicatorSize;
      const [w,h]=size;end.style.width=`${w}px`;end.style.height=`${h}px`;
      end.style.left = `clamp(2px, calc(${fraction*100}% + 2px), calc(100% - ${w}px))`;
      texture(end,preset!==null?visual.presets[preset]:visual.indicator);
      visual.parts?.forEach(part=>{const piece=el('span','native-indicator-part');texture(piece,part.image);piece.style.width=`${part.size[0]}px`;piece.style.height=`${part.size[1]}px`;piece.style.left=`calc(${part.anchor[0]*100}% + ${part.position[0]}px)`;piece.style.top=`calc(${(1-part.anchor[1])*100}% - ${part.position[1]}px)`;end.append(piece);});track.append(end);
    }
    row.append(track, el('dd', 'native-stat-value', stat.formatted ?? (stat.key==='critRate'?generationPercent(value):String(Number(value.toFixed(2))))));
    window.WikiMechanics?.decorate(row,stat.key);
    return row;
  }
  function generationPercent(value) {
    if (value > 0 && value < .0001) return '小于0.01%';
    if (value < 1 && value > .9999) return '大于99.99%';
    return `${Number((value * 100).toFixed(2))}%`;
  }
  function sourceProbability(block, probability) {
    if (!probability || !['known', 'partial'].includes(probability.status) || !Array.isArray(probability.range)) return;
    const [low, high] = probability.range;
    if (![low, high].every(v => Number.isFinite(v) && v >= 0 && v <= 1)) return;
    const rate = low === high ? generationPercent(low) : `${generationPercent(low)}–${generationPercent(high)}`;
    block.append(el('p', 'source-probability guide-note', `预估概率：${rate}`));
  }
  function acquisitionList(entries) {
    entries=entries.filter(entry=>entry.kind!=='unknown'&&!String(entry.kind||'').includes('unverified'));
    const estimatedDetails = {
      '原生随身物资组候选；容量、自动装配、使用及死亡溢出会影响可搜取内容。': '',
      '此地图的搜索点配置包含该候选；生成、容器容量和实际搜索结果可能改变内容。': '',
      '此地图地面生成器包含该候选；生成后可拾取，未核算出现概率。': '',
      '领取此任务奖励后加入商店；补给包中的物品依原生生成规则配置，未核算概率。': '领取对应任务奖励后，可从商店补给包中获得。',
      '正常来源补给包的原生物品组候选；未核算生成概率。': '',
      '原生死亡掉落候选；掉落触发与生成概率尚未核算。': '',
      '货架生成时有机会购买；商人配置位于EA地图，未核算刷新概率。': '商人补货时有机会出售。'
    };
    const list = el('div', 'acquisition-list');
    const blocks = entries.map(entry => {
      const kind = String(entry.kind || '').toLowerCase();
      const block = el('div', `acquisition${/unknown|unverified/.test(kind) ? ' unknown' : ''}${kind.startsWith('enemy_') ? ' enemy' : ''}`);
      block.append(el('h4', '', entry.title || '获取方式'));
      let detail=entry.detail;
      for(const[original,copy]of Object.entries(estimatedDetails))if(detail?.startsWith(original)){detail=copy+detail.slice(original.length);break;}
      if (detail && detail !== entry.title) block.append(el('p', '', detail));
      sourceProbability(block, entry.probability);
      return {kind, entry, block};
    });
    if (entries.length <= 4) { list.append(...blocks.map(x => x.block)); return list; }
    const groups = [
      ['map', '地图搜集', x => x.startsWith('map_')],
      ['shop', '商店购买', x => x === 'shop' || x === 'shop_unlock'],
      ['quest', '任务奖励与补给', x => x === 'quest_reward'],
      ['craft', '制作配方', x => x === 'craft_recipe'],
      ['conversion', '物品转换', x => x === 'conversion'],
      ['inventory', '敌人搜取', x => x === 'enemy_inventory'],
      ['drop', '击杀掉落', x => x === 'enemy_death_drop'],
      ['mirror', '镜柜兑换', x => x === 'mirror_random'],
      ['other', '其他来源', () => true]
    ];
    let remaining = blocks;
    for (const [key, label, matches] of groups) {
      const members = remaining.filter(x => matches(x.kind));
      remaining = remaining.filter(x => !matches(x.kind));
      if (!members.length) continue;
      const group = el('details', 'acquisition-group'); group.dataset.sourceGroup = key; group.open = members.length <= 2;
      const summary = el('summary'), heading = el('span', 'source-group-heading');
      heading.append(el('strong', '', label), el('span', 'source-group-count', `${members.length} 条`));
      const preview = el('span', 'source-group-preview', members.slice(0, 2).map(x => plainText(x.entry.title || '获取方式')).join(' / ') + (members.length > 2 ? ' 等' : ''));
      preview.title = preview.textContent;
      summary.append(heading, preview);
      const content = el('div', 'source-group-content'); content.append(...members.map(x => x.block));
      group.append(summary, content); list.append(group);
    }
    return list;
  }
  function itemEffects(item, attackOnly = false) {
    const effects=(item?.specialEffects||[]).filter(effect=>!attackOnly||effect.kind==='attack');
    if(!effects.length)return null;
    const section=el('section','item-special-effects');
    section.append(el('h3','detail-section-title',attackOnly?'招式效果':'特殊效果'));
    for(const effect of effects){
      const row=el('div','item-special-effect');row.dataset.effectKind=effect.kind;
      const title=el('strong','',effect.name),kind=el('span','item-effect-kind',effect.kind==='attack'?'招式':'固有');title.prepend(kind);row.append(title,el('p','',effect.description));
      if(/^#mechanics\/status\/status-[a-f0-9]{12}$/.test(effect.mechanicRoute||'')){const link=el('a','inline-link','查看状态说明');link.href=effect.mechanicRoute;row.append(link);}
      section.append(row);
    }
    return section;
  }
  function hiddenStats(stats, heading = true) {
    if(!stats?.length)return null;
    const section=el('section','item-hidden-stats');
    if(heading)section.append(el('h3','detail-section-title','补充属性'),el('span','hidden-stat-tag','隐藏属性'));
    const list=el('dl');for(const stat of stats){const row=el('div');row.append(el('dt','',stat.label),el('dd','',stat.formatted));list.append(row);}section.append(list);return section;
  }
  function itemAttackModes(item) {
    if(!item.attackModes?.length)return null;
    const section=el('section','item-attack-modes');section.append(el('h3','detail-section-title','攻击方式'));
    if(item.compatibleAmmo?.length)section.append(el('p','attack-mode-note','射击伤害还会叠加弹药与配件。'));
    const list=el('div','attack-mode-list');
    for(const mode of item.attackModes){const panel=el('section','attack-mode');panel.append(el('h4','',mode.name));if(mode.description)panel.append(el('p','attack-mode-note',mode.description));
      const stats=el('dl','native-stats');for(const stat of mode.stats)stats.append(nativeStat(stat));panel.append(stats);
      for(const hit of mode.hits||[]){panel.append(el('h5','attack-hit-title',hit.name));const rows=el('dl','native-stats');for(const stat of hit.stats)rows.append(nativeStat(stat));panel.append(rows);}
      const extra=hiddenStats(mode.hiddenStats,false);if(extra)panel.append(extra);list.append(panel);
    }section.append(list);return section;
  }
  function itemDetails(item, titleId = 'detail-title', detailsOnly = false, exportOnly = false) {
    const fragment = el('div', 'compact-item-details'+(detailsOnly?'':' terminal-item')); const hero = el('div', 'detail-hero'); const heading = el('div');
    fragment.dataset.cardKind='item';fragment.dataset.cardName=item.name||item.subcategory||'物品';fragment.dataset.cardCompact=String(detailsOnly);
    const title = el('h2', '', item.name || item.subcategory || '物品'); title.id = titleId;
    heading.append(el('p', 'detail-tag', [categoryName(item.category), item.subcategory].filter(Boolean).join(' / ')), title);
    hero.append(art(item.icon, 'detail-art'), heading);
    const body = el('div', 'detail-body'),summary=detailsOnly?body:el('div','item-detail-summary');
    if(detailsOnly)fragment.append(hero,body);
    else{const layout=el('div','item-detail-layout');summary.append(hero);layout.append(summary,body);fragment.append(layout);}
    if(item.description&&!item.archived)summary.append(el('p', 'description', item.description));
    if (item.archived) {
      fragment.dataset.archived='true'; fragment.dataset.itemId=item.id;if(!exportOnly){window.ItemCommunity?.mount(fragment,item.id);window.WikiCardImage?.mount(fragment);}
      return fragment;
    }
    const properties = el('dl', 'properties');
    if (!detailsOnly) property(properties, '稀有度', valueText(item.rarity));
    property(properties, '占用格数', Array.isArray(item.size) && item.size.length === 2 ? `${item.size[0]} × ${item.size[1]}` : '未记录');
    property(properties, '最大堆叠', valueText(item.maxStack)); property(properties, '购买价格', valueText(item.buyPrice)); summary.append(properties);
    if (item.category === 'weapons' && Array.isArray(item.compatibleAmmo) && item.compatibleAmmo.length) {
      body.append(el('h3', 'detail-section-title', '适配弹药'));
      const ammoList = el('ul', 'compatible-ammo');
      item.compatibleAmmo.forEach(id => {
        const ammo = getItem(id); if (!ammo || ammo.category !== 'ammo') return;
        const entry = el('li'); entry.append(art(ammo.icon, 'ammo-art'), el('span', '', ammo.name)); ammoList.append(entry);
      });
      body.append(ammoList, el('p', 'ammo-note', '按基础口径列出，实际适配受配件与特殊状态影响。'));
    }
    const modeKeys=new Set((item.attackModes||[]).flatMap(mode=>[...mode.stats,...(mode.hits||[]).flatMap(hit=>hit.stats)]).map(stat=>stat.key));
    const hiddenKeys=new Set((item.hiddenStats||[]).map(stat=>stat.key));
    const commonStats=(item.stats||[]).filter(stat=>!modeKeys.has(stat.key)&&!hiddenKeys.has(stat.key));
    if (commonStats.length) {
      body.append(el('h3', 'detail-section-title native-heading', item.attackModes?.length?(item.compatibleAmmo?.length?'射击属性':'通用属性'):'属性'));
      const stats = el('dl', 'native-stats'); commonStats.forEach(stat => stats.append(nativeStat(stat))); body.append(stats);
    }
    const attacks=itemAttackModes(item);if(attacks)body.append(attacks);
    const hidden=hiddenStats(item.hiddenStats);if(hidden)body.append(hidden);
    const effects=itemEffects(item);if(effects)body.append(effects);
    const economy = el('div', 'detail-economy');
    economy.append(el('span', 'detail-weight', `重量：${valueText(item.weightKg, ' kg')}`));
    const sale = el('span', 'detail-sale'); sale.append(el('span', '', '出售价格：'), el('strong', '', valueText(item.sellPrice))); economy.append(sale);
    summary.append(economy);
    if (!detailsOnly) {
    const sources=acquisitionList(Array.isArray(item.acquisition)?item.acquisition:[]);
    if(sources.childElementCount)body.append(el('h3','detail-section-title','获取方式'),sources);
    }
    window.Guide?.enhanceItem(body, item, detailsOnly);
    if(!detailsOnly)fragment.dataset.detailLayout=body.querySelector('.native-stats,.attack-mode-list,.item-hidden-stats,.item-special-effects,.use-effects')?'detailed':'brief';
    fragment.dataset.itemId=item.id;if(!exportOnly){window.ItemCommunity?.mount(fragment,item.id);window.WikiCardImage?.mount(fragment);}
    return fragment;
  }
  function showItem(item) {
    window.WikiNavigation.cancelDialogClose($('detail'));
    state.selected = item.id;
    $('detail').querySelector('.detail-top>span').textContent = item.archived ? '历史物品' : '物品档案';
    const card=itemDetails(item),article=el('a','static-guide-link item-guide-link','打开完整攻略页');
    article.href='/items/'+encodeURIComponent(item.id)+'/';card.querySelector('.detail-hero h2').after(article);
    window.WikiNavigation.replaceDetail('item:'+item.id,[card]);
    if (!$('detail').open) $('detail').showModal(); $('detail').scrollTop = 0;window.WikiTraffic?.itemViewed(item.id);
  }
  let welcomeRoutePending=false;
  function syncHash() {
    if (!state.data) return;
    if(document.getElementById('wiki-welcome')?.open){if(!welcomeRoutePending){welcomeRoutePending=true;window.addEventListener('wiki-welcome-dismissed',()=>{welcomeRoutePending=false;syncHash();},{once:true});}return;}
    window.Guide?.route();
    const match = /^#item\/(.+)$/.exec(location.hash);
    if (!match) { if ($('detail').open&&!/^#(enemy|affix|npc|recipe)\//.test(location.hash)) $('detail').close(); state.selected = null; return; }
    let id; try { id = decodeURIComponent(match[1]); } catch { id = ''; }
    const item = getItem(id);
    if (item) { $('status').hidden = true; showItem(item); }
    else { if ($('detail').open) $('detail').close(); $('status').hidden = false; $('status').className = 'status error'; $('status').textContent = '此物品链接不存在。请从目录选择物品。'; }
  }
  function closeDetail() { window.WikiNavigation.cancelDialogClose($('detail')); const selected = state.selected; if ($('detail').open) $('detail').close(); window.WikiTraffic?.itemClosed(); if(window.Guide?.restoreDetail()){state.selected=null;return;} if (/^#(item|quest|enemy|affix|npc|recipe)\//.test(location.hash)) { const route = window.Guide?.baseRoute || '#items'; history.replaceState(null, '', location.pathname + location.search + route); window.Guide?.route().then(()=>window.Guide.restoreFocus(selected)); } state.selected = null; }
  const requestCloseDetail=()=>window.WikiNavigation.closeDialog($('detail'),closeDetail);
  $('close-detail').addEventListener('click', requestCloseDetail);
  $('detail').addEventListener('cancel', event => { event.preventDefault(); requestCloseDetail(); });
  $('detail').addEventListener('click', event => { if (event.target === $('detail')) { const rect = $('detail').getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) requestCloseDetail(); } });
  $('search').addEventListener('input', event => { if (!state.data) return; state.query = event.target.value; state.open = true; render(); });
  $('subcategory').addEventListener('change', event => { state.subcategory = event.target.value; render(); });
  $('item-sort').addEventListener('change', event => { state.sort=event.target.value;render(); });
  $('item-sort-direction').addEventListener('change', event => { state.direction=event.target.value;render(); });
  $('clear-filters').addEventListener('click', () => { state.query = ''; state.subcategory = ''; $('search').value = ''; $('subcategory').value = ''; render(); });
  document.querySelector('.brand').addEventListener('click', () => { state.open = false; state.category = 'all'; state.query = ''; state.subcategory = ''; $('search').value = ''; if (state.data) { refreshSubcategories(); render(); } closeDetail(); });
  document.addEventListener('keydown', event => { if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !$('detail').open) { event.preventDefault(); (window.Guide?.focusSearch || (()=>$('search').focus()))(); } });
  document.querySelector('.skip-link').addEventListener('click', event => { event.preventDefault(); $('main-content').focus(); $('main-content').scrollIntoView({block:'start'}); });
  window.addEventListener('hashchange', syncHash);
  window.Wiki = {get data(){return state.data;}, el, art, getItem, plainText, itemDetails, itemEffects, showItem, closeDetail, nativeStat, sortItems, sortValue};
  fetch('data/items.json',{cache:'no-cache'}).then(response => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.json(); }).then(data => {
    if (!Array.isArray(data.items) || !Array.isArray(data.categories)) throw new Error('资料格式不正确');
    state.data = data; itemIndex=new Map([...(data.archivedItems||[]),...data.items].map(i=>[String(i.id),i]));itemSearch=new Map(data.items.map(i=>[i.id,plainText([i.name,...(i.aliases||[]),i.id,i.description,i.subcategory].filter(Boolean).join(' ')).toLocaleLowerCase()]));categoryGroups=new Map();data.items.forEach(i=>{if(!categoryGroups.has(i.category))categoryGroups.set(i.category,[]);categoryGroups.get(i.category).push(i);});const meta = data.meta || {}; $('edition').textContent = (meta.edition==='EA'?'EA 物品 · '+(meta.acquisitionBuildId?'来源核对 Build '+meta.acquisitionBuildId:'Build '+meta.buildId):meta.version) || '资料版本待核实'; $('total-count').textContent = `${data.items.length} 件物品`;
    document.title = '查无此地攻略：物品、任务、敌怪与地图 | NSP Wiki'; $('updated-at').textContent = meta.updatedAt ? `资料更新：${meta.updatedAt}` : '静态资料手册';
    const versionNotes=$('version-notes');if(versionNotes&&Array.isArray(meta.mechanismUpdates)){versionNotes.querySelector('ul').replaceChildren(...meta.mechanismUpdates.map(note=>el('li','',note)));versionNotes.hidden=!meta.mechanismUpdates.length;}
    fetch('data/updates.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('更新档案暂时无法读取');return r.json();}).then(d=>window.WikiUpdates.renderSummary($('updates-summary'),d)).catch(()=>{const summary=$('updates-summary');summary.replaceChildren(el('a','inline-link','查看更新档案'));summary.firstChild.href='#updates';summary.hidden=false;});
    $('status').hidden = true; refreshSubcategories(); render(); syncHash(); window.dispatchEvent(new Event('wiki-ready'));
  }).catch(() => { $('status').className = 'status error'; $('status').textContent = '物品资料加载失败。请刷新页面重试，并确认 data/items.json 可访问。'; });
})();
