(() => {
  'use strict';
  const el = (...args) => window.Wiki.el(...args);
  const cache = {}, pending = {};
  let questIds, mapIds;
  const labels = {npcs: 'NPC 图鉴', recipes: '配方手册'};
  const state = {npcs: {query: '', category: 'all', station: 'all', selected: null}, recipes: {query: '', category: 'all', station: 'all', selected: null}};
  let itemOrigin = null;
  const singular = kind => kind === 'npcs' ? 'npc' : 'recipe';
  const route = (kind, id) => '#' + singular(kind) + '/' + encodeURIComponent(id);
  function link(text, href, className = 'inline-link') {
    const a = el('a', className, text); a.href = href; return a;
  }
  function itemLink(row) {
    const item = window.Wiki.getItem(row.itemId);
    if (!item || item.archived) return el('span', '', row.name);
    const a = link(row.name, '#item/' + encodeURIComponent(row.itemId));
    a.dataset.itemId = row.itemId;
    if (item.icon) a.prepend(window.Wiki.art(item.icon, 'tiny-art'));
    return a;
  }
  async function load(kind) {
    if (!Object.hasOwn(labels, kind)) throw Error('未知资料栏目');
    if (cache[kind]) return cache[kind];
    return pending[kind] ||= fetch('/data/' + kind + '.json',{cache:'no-cache'}).then(r => {
      if (!r.ok) throw Error(labels[kind] + '暂时无法读取');
      return r.json();
    }).then(data => {
      if (data.meta?.edition !== 'EA' || !/^\d+$/.test(data.meta.buildId) || !Array.isArray(data[kind])) throw Error(labels[kind] + '格式不完整');
      const ids = new Set();
      for (const row of data[kind]) {
        if (!row.id || !row.name || ids.has(row.id) || row.sourceBuild !== data.meta.buildId) throw Error(labels[kind] + '条目身份不完整');
        ids.add(row.id);
        if (kind === 'recipes' && (![row.inputs, row.outputs, row.requirements, row.unlock, row.pendingNotes].every(Array.isArray) || !data.categories.some(c => c.id === row.kind))) throw Error('配方字段不完整');
        if (kind === 'npcs' && row.image && (!/^(?:assets|icons)\/[\w./-]+\.(?:png|webp)$/.test(row.image) || row.image.split('/').includes('..'))) throw Error('NPC 配图路径不完整');
        if (kind === 'npcs' && ![row.locations, row.dialogue, row.services, row.shops, row.quests, row.notes].every(Array.isArray)) throw Error('NPC 字段不完整');
      }
      cache[kind] = data; return data;
    }).catch(error => { delete pending[kind]; throw error; });
  }
  function section(body, title) { body.append(el('h3', 'detail-section-title', title)); }
  function lines(body, values, className = 'guide-note') {
    for (const text of values || []) body.append(el('p', className, text));
  }
  function quantity(row) {
    if (row.min != null && row.max != null) return row.min === row.max ? String(row.min) : row.min + '–' + row.max;
    return row.count == null ? '' : String(row.count);
  }
  function materials(body, rows, role = 'materials') {
    const list = el('ul', 'recipe-materials reference-related');
    list.dataset.materialRole = role;
    for (const row of rows) {
      const li = el('li'); li.append(itemLink(row));
      const amount = quantity(row);
      if (amount) li.append(el('strong', 'recipe-quantity', '× ' + amount));
      if (row.probabilistic) li.append(el('span', 'recipe-tag', '概率获得'));
      list.append(li);
    }
    body.append(list);
  }
  function showNpc(body, npc) {
    const hero = el('div', 'npc-profile' + (npc.image ? '' : ' npc-profile-text'));
    if (npc.image) {
      const figure = el('figure'); const img = el('img'); img.src = '/' + npc.image; img.alt = npc.name;
      img.width = 256; img.height = 320; figure.append(img); hero.append(figure);
    }
    const overview = el('div'); overview.append(el('p', 'detail-tag', npc.role));
    const description = npc.description === '通过通讯／任务界面联系，不对应地图中的固定角色。' ? '通过通讯／任务界面联系。' : npc.description;
    if (description && description !== '入口待核实。') overview.append(el('p', 'description', description));
    for (const service of npc.services) overview.append(el('h3', '', service.name), el('p', '', service.description));
    hero.append(overview); body.append(hero);
    if (npc.kind === 'contact' || npc.locations.length) section(body, npc.kind === 'contact' ? '联系渠道' : '出现地点');
    if (npc.kind === 'contact') body.append(el('p', '', '通过终端收发委托。'));
    for (const location of npc.locations) {
      body.append(el('h4', '', location.label));
      const condition = location.conditions === '地图配置直接出现。' ? '' : location.conditions === '战场模式地图配置直接出现。' ? '战场模式。' : location.conditions;
      if (condition) body.append(el('p', '', condition));
      if (mapIds?.has(location.mapId)) body.append(link('打开地图', '#maps/' + encodeURIComponent(location.mapId)));
      if (location.position) body.append(el('p', 'guide-note', `地图坐标：X ${location.position.x.toFixed(1)} · Z ${location.position.z.toFixed(1)}`));
    }
    for (const shop of npc.shops) {
      section(body, shop.name);
      body.append(el('p', 'guide-note', '交易货币：' + shop.currency)); lines(body, shop.notes.filter(note => note !== '补货时间待核实。'));
      const rules = el('details'); rules.append(el('summary', '', '交易规则'));
      if (!shop.hideCurrency && Number.isFinite(shop.initialFunds)) rules.append(el('p', 'guide-note', `起始资金：${shop.initialFunds} ${shop.currency}。玩家购买后，商人的可用资金会增加。`));
      if (shop.priceMultiplier) rules.append(el('p', 'guide-note', `报价浮动：基础价的 ${Math.round(shop.priceMultiplier.min * 100)}%–${Math.round(shop.priceMultiplier.max * 100)}%。`));
      lines(rules, [...new Set(shop.offers.map(o => o.conditions).filter(text => text && text !== '静态货架候选；实际库存与刷新待核实'))]); body.append(rules);
      const table = el('table', 'guide-table npc-shop'), head = el('thead'), tr = el('tr');
      ['可能出售的商品', '每份数量'].forEach(text => { const th = el('th', '', text); th.scope = 'col'; tr.append(th); }); head.append(tr);
      const tbody = el('tbody');
      const rows = [];
      for (const offer of shop.offers) {
        const row = el('tr'), name = el('td'); name.append(itemLink(offer));
        row.append(name, el('td', '', quantity(offer) || '不固定')); tbody.append(row); rows.push({row, offer});
      }
      const tools = el('div', 'npc-shop-tools'), search = el('input'); search.type = 'search'; search.placeholder = '搜索商品'; search.setAttribute('aria-label', '搜索' + shop.name);
      const count = el('p', 'result-count'), more = el('button', 'secondary-button'); more.type = 'button'; let expanded = false;
      function drawOffers() {
        const needle = search.value.trim().toLocaleLowerCase(), matches = rows.filter(x => x.offer.name.toLocaleLowerCase().includes(needle));
        rows.forEach(x => { x.row.hidden = true; }); matches.forEach((x, i) => { x.row.hidden = !expanded && i >= 24; });
        count.textContent = `${Math.min(matches.length, expanded ? matches.length : 24)} / ${matches.length} 件商品`;
        more.hidden = expanded || matches.length <= 24; more.textContent = `展开全部 ${matches.length} 件商品`;
      }
      search.oninput = () => { expanded = false; drawOffers(); }; more.onclick = () => { expanded = true; drawOffers(); };
      tools.append(search, count); table.append(head, tbody); const wrap = el('div', 'npc-shop-wrap'); wrap.append(table); body.append(tools, wrap, more); drawOffers();
    }
    if (npc.shopUnlocks?.length) {
      section(body, '组织商店上新');
      for (const reward of npc.shopUnlocks) {
        const group = el('details', 'npc-shop-unlock');
        group.append(el('summary', '', reward.questName + ' · ' + reward.stage + ' · ' + reward.offers.length + ' 件商品'));
        group.append(el('p', 'guide-note', reward.conditions));
        if (reward.public) group.append(link('查看任务', '#quest/' + encodeURIComponent(reward.questId)));
        materials(group, reward.offers, 'offers'); body.append(group);
      }
    }
    if (npc.dialogue.length) section(body, '日常对话'); const dialogue = el('ul', 'npc-dialogue');
    for (const line of npc.dialogue) dialogue.append(el('li', '', line.text)); body.append(dialogue);
    if (npc.quests.length) section(body, '相关任务');
    const tasks = el('ul', 'npc-task-list');
    for (const quest of npc.quests) {
      const row = el('li'); row.append(el('span', 'recipe-tag', quest.stage || '任务'));
      const name = quest.name === '通讯事件（名称待核实）' ? '通讯事件' : quest.name;
      row.append(quest.public === true ? link(name, '#quest/' + encodeURIComponent(quest.id)) : el('span', '', name));
      if (quest.conditions) row.append(el('p', 'guide-note', quest.conditions));
      tasks.append(row);
    }
    body.append(tasks);
    const related = (npc.recipeIds || []).map(id => cache.recipes?.recipes.find(r => r.id === id)).filter(Boolean);
    if (related.length) {
      section(body, '相关配方'); const list = el('ul', 'recipe-unlocks');
      for (const r of related) {
        const row = el('li'); row.append(link(r.name, route('recipes', r.id)));
        for (const source of (npc.recipeLinks || []).filter(x => x.recipeId === r.id)) {
          const quest = npc.quests.find(q => q.id === source.questId);
          const text = [quest?.name, source.stage, source.relationship].filter(Boolean).join(' · ');
          row.append(el('p', 'guide-note', text));
          if (source.conditions) row.append(el('p', 'guide-note', source.conditions));
          if (source.itemId) { const item = window.Wiki.getItem(source.itemId); if (item) row.append(itemLink({itemId: item.id, name: item.name})); }
        }
        list.append(row);
      }
      body.append(list);
    }
  }
  function showRecipe(body, recipe, data) {
    body.append(el('p', 'description', recipe.description));
    if (recipe.station) body.append(el('p', 'recipe-station', recipe.station.label));
    if (recipe.inputs.length) {
      section(body, recipe.kind === 'research' ? '研究消耗' : recipe.kind === 'construction' ? '建造／升级消耗' : '基础材料');
      materials(body, recipe.inputs);
    }
    if (recipe.outputs.length) {
      const output = el('section', 'recipe-output');
      section(output, '产出'); materials(output, recipe.outputs, 'output'); body.append(output);
    }
    if (recipe.unlock.length) {
      section(body, recipe.kind === 'construction' ? '完成设施' : '完成后解锁');
      const list = el('ul', 'recipe-unlocks');
      for (const reward of recipe.unlock) {
        const li = el('li');
        const target = data.recipes.find(r => r.id === reward.id);
        li.append(target && target.id !== recipe.id ? link(reward.name, route('recipes', target.id)) : el('span', '', reward.name)); list.append(li);
      }
      body.append(list);
    }
    const groups = recipe.kind === 'research' ? [
      ['发现项目', recipe.requirements.filter(r => r.type === 'discovery')],
      ['研究条件（需同时满足）', recipe.requirements.filter(r => r.type !== 'discovery')]
    ] : [['条件与解锁', recipe.requirements]];
    for (const [title, rules] of groups) {
      if (!rules.length) continue;
      section(body, title); const list = el('ul', 'recipe-requirements');
      for (const rule of rules) {
        const li = el('li'); li.append(el('span', '', rule.text));
        if (rule.recipeId && data.recipes.some(r => r.id === rule.recipeId)) li.append(' ', link('查看配方', route('recipes', rule.recipeId)));
        if (rule.itemId) { const item = window.Wiki.getItem(rule.itemId); if (item) li.append(' ', itemLink({itemId: item.id, name: item.name})); }
        if (rule.questId && window.Wiki.data && questIds?.has(rule.questId)) li.append(' ', link('查看任务', '#quest/' + encodeURIComponent(rule.questId)));
        list.append(li);
      }
      body.append(list);
    }
    const people = cache.npcs?.npcs.filter(n => n.recipeIds?.includes(recipe.id)) || [];
    if (people.length) {
      section(body, '相关人物'); const list = el('ul', 'recipe-unlocks');
      for (const npc of people) { const row = el('li'); row.append(link(npc.name, route('npcs', npc.id))); list.append(row); } body.append(list);
    }
  }
  function show(kind, record, data) {
    const dialog = document.getElementById('detail');
    const body = el('div', 'detail-body guide-detail npc-recipe-detail reference-detail'); body.dataset[singular(kind) + 'Id'] = record.id;
    body.dataset.readingLayout = kind === 'recipes' || (!record.shops.length && !record.shopUnlocks?.length) ? 'compact' : 'wide';
    const title = el('h2', '', record.name); title.id = 'detail-title';
    const heading = el('div', 'reference-detail-heading reference-heading');
    heading.append(el('p', 'detail-tag', labels[kind]), title);
    const actions = el('div', 'reference-actions');
    actions.append(link('打开完整攻略页', '/' + kind + '/' + encodeURIComponent(record.id) + '/', 'static-guide-link'));
    const feedback = link('反馈与补充', '#feedback', 'npc-feedback-link');
    feedback.onclick = () => window.WikiFeedback?.prefill({name: record.name, route: route(kind, record.id)});
    actions.append(feedback); heading.append(actions); body.append(heading);
    if (kind === 'npcs') showNpc(body, record); else showRecipe(body, record, data);
    document.getElementById('detail-content').replaceChildren(body);
    dialog.querySelector('.detail-top>span').textContent = labels[kind];
    if (!dialog.open) dialog.showModal();
    const origin = itemOrigin;
    dialog.scrollTop = origin?.parentRoute === route(kind, record.id) ? origin.scroll : 0;
  }
  async function mount(root, {kind, id, isCurrent = () => true, overlayOnly=false}) {
    if(itemOrigin?.parentRoute===location.hash&&itemOrigin.content&&isCurrent()){const dialog=document.getElementById('detail');document.getElementById('detail-content').replaceChildren(...itemOrigin.content);dialog.querySelector('.detail-top>span').textContent=labels[kind];if(!dialog.open)dialog.showModal();dialog.scrollTop=itemOrigin.scroll;return;}
    const data = await load(kind);
    if (kind === 'npcs' && id && data.npcs.find(n => n.id === id)?.recipeIds?.length) await load('recipes');
    if (kind === 'recipes' && id) await load('npcs');
    if (!questIds && kind === 'recipes') {
      const response = await fetch('/data/quests.json',{cache:'no-cache'});
      if (!response.ok) throw Error('任务关联暂时无法读取');
      const quests = await response.json();
      if (!Array.isArray(quests.missions)) throw Error('任务关联格式不完整');
      questIds = new Set(quests.missions.map(q => q.id));
    }
    if (!mapIds && kind === 'npcs') {
      const response = await fetch('/maps/data/maps.json',{cache:'no-cache'});
      if (!response.ok) throw Error('地图关联暂时无法读取');
      const maps = await response.json();
      if (!Array.isArray(maps)) throw Error('地图关联格式不完整');
      mapIds = new Set(maps.map(m => m.id));
    }
    if (!isCurrent()) return;
    if(overlayOnly){const record=data[kind].find(x=>x.id===id);if(!record)throw Error('Missing detail');show(kind,record,data);return;}
    if(id&&root.querySelector('.npc-recipe-heading')){const record=data[kind].find(x=>x.id===id);if(record){state[kind].selected=id;show(kind,record,data);return;}}
    const s = state[kind]; const heading = el('div', 'guide-heading npc-recipe-heading reference-heading');
    heading.append(el('p', 'kicker', '生存手册 / 资料库'), el('h1', '', labels[kind]),
      el('p', 'intro-copy', kind === 'npcs' ? '查角色、商店与任务关系。' : '查材料、产出与研究条件。'));
    const tools = el('div', 'guide-tools npc-recipe-tools reference-toolbar'), search = el('input');
    search.type = 'search'; search.placeholder = kind === 'npcs' ? '搜索角色、地点或服务' : '搜索配方、原料、产出或解锁条件'; search.setAttribute('aria-label', search.placeholder); search.value = s.query;
    const count = el('p', 'result-count reference-count'); count.setAttribute('aria-live', 'polite');
    const grid = el('div', (kind === 'npcs' ? 'npc-grid' : 'recipe-grid') + ' reference-grid');
    const categories = el('div', 'corruption-categories reference-categories'); categories.setAttribute('aria-label', kind === 'npcs' ? '角色分类' : '配方分类');
    let station;
    if (kind === 'recipes') {
      for (const category of [{id: 'all', name: '全部'}, ...data.categories]) {
        const button = el('button', '', category.name); button.type = 'button'; button.dataset.category = category.id;
        button.onclick = () => { s.category = category.id; draw(); }; categories.append(button);
      }
      station = el('select'); station.setAttribute('aria-label', '工作设施');
      for (const name of ['all', ...new Set(data.recipes.map(r => r.station?.label).filter(Boolean))]) {
        const option = el('option', '', name === 'all' ? '全部设施' : name); option.value = name; station.append(option);
      }
      station.value = s.station; station.onchange = () => { s.station = station.value; draw(); };
    } else {
      for (const c of [{id:'all',name:'全部'},{id:'actor',name:'场景角色'},{id:'contact',name:'远程联络'},{id:'pending-entry',name:'角色资料'}]) {
        const b = el('button', '', c.name); b.type = 'button'; b.dataset.category = c.id;
        b.onclick = () => { s.category = c.id; draw(); }; categories.append(b);
      }
      station = el('select'); station.setAttribute('aria-label', '所在地区');
      for (const name of ['all', ...new Set(data.npcs.flatMap(n => n.locations.map(l => l.label)))]) {
        const option = el('option', '', name === 'all' ? '全部地区' : name); option.value = name; station.append(option);
      }
      station.value = s.station; station.onchange = () => { s.station = station.value; draw(); };
    }
    const reset = el('button', 'secondary-button', '清除筛选'); reset.type = 'button';
    reset.onclick = () => { search.value = s.query = ''; if (station) { s.category = 'all'; station.value = s.station = 'all'; } draw(); search.focus(); };
    tools.append(search); if (station) tools.append(station); tools.append(reset);
    root.replaceChildren(heading, categories, tools, count, grid);
    function draw() {
      grid.replaceChildren(); const needle = s.query.trim().toLocaleLowerCase();
      const rows = data[kind].filter(r => (kind === 'recipes' ? (s.category === 'all' || r.kind === s.category) && (s.station === 'all' || r.station?.label === s.station) :
        (s.category === 'all' || s.category === 'pending-entry' && r.status === 'pending-entry' || s.category === r.kind && r.status !== 'pending-entry') && (s.station === 'all' || r.locations.some(l => l.label === s.station))) &&
        (!needle || (kind === 'npcs' ? [r.name, r.role, r.description, ...r.locations.map(x => x.label), ...r.services.map(x => x.name)] : [r.name, r.description, r.station?.label, ...r.inputs.map(x => x.name), ...r.outputs.map(x => x.name), ...r.requirements.map(x => x.text), ...r.unlock.map(x => x.name)]).join(' ').toLocaleLowerCase().includes(needle)));
      categories.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.category === s.category)));
      count.textContent = `${rows.length} / ${data[kind].length} ${kind === 'npcs' ? '位角色' : '项配方'}`;
      for (const r of rows) {
        const card = link('', route(kind, r.id), (kind === 'npcs' ? 'npc-card' : 'recipe-card') + ' reference-card'); card.dataset.recordId = r.id;
        if (kind === 'npcs' && r.image) { const img = el('img'); img.src = '/' + r.image; img.alt = r.name; img.width = 200; img.height = 240; img.loading = 'lazy'; img.decoding = 'async'; card.append(img); }
        if (kind === 'npcs' && !r.image) card.classList.add('npc-card-text');
        const content = el('div'); content.append(el('p', 'detail-tag', kind === 'npcs' ? r.role : data.categories.find(c => c.id === r.kind).name), el('h2', '', r.name));
        if (kind === 'npcs') {
          const location = r.kind === 'contact' ? '终端联络' : r.locations.map(l => l.label).join('、');
          if (location) content.append(el('p', '', location));
          if (r.services.length) content.append(el('p', 'guide-note', r.services.map(x => x.name).join(' · ')));
        }
        else {
          if (r.station?.label) content.append(el('p', 'recipe-station', r.station.label));
          for (const [label, parts] of [['材料', r.inputs], [r.outputs.length ? '产出' : '解锁', r.outputs.length ? r.outputs : r.unlock]]) {
            if (!parts.length) continue;
            content.append(el('p', 'recipe-preview', `${label}：` + parts.map(x => x.name + (x.count == null ? '' : ' ×' + x.count) + (x.probabilistic ? '（概率）' : '')).join('、')));
          }
        }
        card.append(content); grid.append(card);
      }
      if (!rows.length) grid.append(el('p', 'empty', '没有匹配结果，试试清除筛选。'));
    }
    search.oninput = () => { s.query = search.value; draw(); }; draw();
    if (s.scrollY != null) window.scrollTo({top: s.scrollY, behavior: 'instant'});
    if (id) {
      const record = data[kind].find(r => r.id === id);
      if (record) { s.selected = id; show(kind, record, data); }
      else root.prepend(el('p', 'status error', '此攻略链接不存在。'));
    } else if (itemOrigin) itemOrigin = null;
    root.dataset.npcRecipes = 'ready';
  }
  function restoreFocus(kind) {
    const origin = itemOrigin;
    if (origin && origin.parentRoute === location.hash) {
      const a = document.querySelector('.npc-recipe-detail a[href="' + CSS.escape(origin.itemHref) + '"]');
      if (a) { document.getElementById('detail').scrollTop = origin.scroll; a.focus({preventScroll: true}); itemOrigin = null; return true; }
    }
    const card = document.querySelector('[data-record-id="' + CSS.escape(state[kind].selected || '') + '"]');
    if (card) { card.focus({preventScroll: true}); return true; }
    return false;
  }
  async function enhanceItem(body, item, detailsOnly) {
    body.dataset.npcRecipes = 'loading';
    delete body.dataset.npcRecipesError;
    try {
      if (detailsOnly) return;
      const [npcs, recipes] = await Promise.all([load('npcs'), load('recipes')]);
      const related = [];
      for (const npc of npcs.npcs) {
        if (npc.shops.some(s => s.offers.some(o => o.itemId === item.id))) related.push({kind: 'npcs', row: npc, label: '可能出售 · ' + npc.name});
        if (npc.shopUnlocks?.some(s => s.offers.some(o => o.itemId === item.id))) related.push({kind: 'npcs', row: npc, label: '任务后上架 · ' + npc.name});
      }
      for (const r of recipes.recipes) {
        const use = r.inputs.some(i => i.itemId === item.id), make = r.outputs.some(i => i.itemId === item.id);
        const gear = r.requirements.some(i => i.itemId === item.id);
        if (use || make || gear) related.push({kind: 'recipes', row: r, label: (make ? '产出' : use ? '材料' : '研究设备') + ' · ' + r.name});
      }
      if (related.length) {
        const section = el('section', 'npc-recipe-related reference-related'); section.append(el('h3', 'detail-section-title', '商人与配方'));
        const links = el('ul'); for (const x of related) { const li = el('li'); li.append(link(x.label, route(x.kind, x.row.id))); links.append(li); } section.append(links); body.append(section);
      }
    } catch {
      body.dataset.npcRecipesError='true';body.append(el('p', 'guide-note', '商人与配方关联暂时无法读取，请刷新重试。'));
    } finally { body.dataset.npcRecipes = 'ready'; }
  }
  document.addEventListener('click', event => {
    const card = event.target.closest('.npc-card, .recipe-card');
    if (card) state[card.classList.contains('npc-card') ? 'npcs' : 'recipes'].scrollY = window.scrollY;
    const a = event.target.closest('.npc-recipe-detail a[href^="#item/"]');
    if (!a || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    itemOrigin = {parentRoute: location.hash, itemHref: a.getAttribute('href'), scroll: document.getElementById('detail').scrollTop,content:[...document.getElementById('detail-content').childNodes]};
    window.Guide.baseRoute = location.hash;
  });
  window.NpcRecipes = {load, mount, enhanceItem, restoreFocus};
})();
