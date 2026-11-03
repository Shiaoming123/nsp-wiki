(() => {
  'use strict';
  const KEY = 'nsp-item-tiers-v1';
  const tiers = [['strong', '夯'], ['great', '顶级'], ['good', '人上人'], ['normal', 'NPC'], ['weak', '拉'], ['pool', '待排区']];
  const empty = () => Object.fromEntries(tiers.map(([key]) => [key, []]));
  let rows = null, selected = null, category = 'weapons', subcategory = '', query = '', dragged = null;
  let root, storageWarning = '', protectedDraft = false, exporting = false, cleared = null, copied = null;
  const el = (...args) => Wiki.el(...args), byId = id => document.getElementById(id);
  const name = id => Wiki.plainText(Wiki.getItem(id)?.name || id);
  const rowOf = id => tiers.find(([key]) => rows[key].includes(id))?.[0];
  const button = (text, id, fn) => { const b = el('button', 'secondary-button', text); b.type = 'button'; if (id) b.id = id; b.onclick = fn; return b; };
  function readDraft() {
    rows = empty();
    try {
      const raw = localStorage.getItem(KEY); if (!raw) return;
      const draft = JSON.parse(raw), seen = new Set();
      if (draft.version !== 1 || !draft.rows || Object.keys(draft.rows).length !== tiers.length) throw Error();
      for (const [key] of tiers) {
        if (!Array.isArray(draft.rows[key]) || draft.rows[key].length > Wiki.data.items.length + (Wiki.data.archivedItems?.length || 0)) throw Error();
        for (const id of draft.rows[key]) { if (typeof id !== 'string' || !Wiki.getItem(id) || seen.has(id)) throw Error(); seen.add(id); }
      }
      rows = draft.rows;
    } catch {
      protectedDraft = true;
      storageWarning = '旧草稿无法读取，已保留原数据。本次仍可排序；点击“保存当前榜单”可替换旧草稿。';
    }
  }
  function save() {
    if (protectedDraft) return;
    try { localStorage.setItem(KEY, JSON.stringify({version: 1, rows})); storageWarning = ''; }
    catch { storageWarning = '浏览器无法保存，当前排序仅在本次页面内保留。'; }
  }
  function announce(text) { const message = byId('tier-message'); if (message) message.textContent = text; }
  function ranking() { return {version:1, rows:Object.fromEntries(tiers.filter(([key])=>key!=='pool').map(([key])=>[key,[...rows[key]]]))}; }
  async function imageBlob(value = ranking()) {
    // Snapshot before image loading: the exported order cannot change halfway through.
    const snapshot = tiers.filter(([key]) => key !== 'pool').map(([key, label]) => ({key, label, ids: [...value.rows[key]]}));
    const fontText="查无此地 · 从夯到拉 个人评价 生存手册 件物品 同档从左到右排序 "+snapshot.map(row=>row.label+row.ids.map(id=>name(id)).join(" ")).join(" ");
    const family=await window.WikiTypography.prepare(document,fontText,{weights:[400,600]});
    const width = 1200, cols = 10, cardWidth = 100, gap = 8, labelWidth = 100, padding = 16;
    const canvas = document.createElement('canvas'), ctx = canvas.getContext('2d');
    ctx.font = `16px ${family}`;
    const wrap = text => {
      const lines = []; let line = '';
      for (const char of text) { if (line && ctx.measureText(line + char).width > cardWidth - 10) { lines.push(line); line = ''; } line += char; }
      if (line) lines.push(line); return lines;
    };
    const images = new Map(), textLines = new Map();
    await Promise.all(snapshot.flatMap(row => row.ids).map(async id => {
      textLines.set(id, wrap(name(id)));
      const icon = Wiki.getItem(id).icon;
      if (typeof icon !== 'string' || !icon || /^(?:[a-z]+:|\/\/|\/|\\\\)/i.test(icon) || icon.split(/[\\\\/]/).includes('..')) return;
      const img = new Image(); img.src = icon;
      try { await img.decode(); images.set(id, img); } catch {}
    }));
    for (const row of snapshot) {
      row.lines = [];
      for (let i = 0; i < row.ids.length; i += cols) {
        const ids = row.ids.slice(i, i + cols);
        row.lines.push({ids, height: 78 + Math.max(...ids.map(id => textLines.get(id).length)) * 22});
      }
      row.height = Math.max(100, row.lines.reduce((sum, line) => sum + line.height + gap, 0) + padding * 2 - gap);
    }
    canvas.width = width; canvas.height = 100 + snapshot.reduce((sum, row) => sum + row.height, 0) + 54;
    ctx.fillStyle = '#202724'; ctx.fillRect(0, 0, width, canvas.height);
    ctx.fillStyle = '#e4ece8'; ctx.font = `600 32px ${family}`; ctx.fillText('查无此地 · 从夯到拉', 24, 48);
    ctx.fillStyle = '#b2bdb5'; ctx.font = `16px ${family}`; ctx.fillText('个人评价 · 同档从左到右排序 · ' + snapshot.reduce((sum, row) => sum + row.ids.length, 0) + ' 件物品', 24, 78);
    let y = 100;
    const colors = ['#ec8585', '#efb674', '#e5d987', '#a6cc9d', '#91b8d4'];
    snapshot.forEach((row, ri) => {
      ctx.fillStyle = '#171e1b'; ctx.fillRect(0, y, width, row.height);
      ctx.fillStyle = colors[ri]; ctx.fillRect(0, y, labelWidth, row.height);
      ctx.fillStyle = '#151b18'; ctx.font = `600 20px ${family}`; ctx.textAlign = 'center'; ctx.fillText(row.label, labelWidth / 2, y + row.height / 2);
      ctx.font = `14px ${family}`; ctx.fillText(String(row.ids.length), labelWidth / 2, y + row.height / 2 + 24);
      let cy = y + padding;
      row.lines.forEach(line => {
        line.ids.forEach((id, index) => {
          const x = labelWidth + padding + index * (cardWidth + gap);
          ctx.fillStyle = '#2b3430'; ctx.fillRect(x, cy, cardWidth, line.height);
          ctx.strokeStyle = '#65796a'; ctx.strokeRect(x + .5, cy + .5, cardWidth - 1, line.height - 1);
          const img = images.get(id);
          if (img) { const scale = Math.min(82 / img.width, 60 / img.height); ctx.drawImage(img, x + (cardWidth - img.width * scale) / 2, cy + 7 + (60 - img.height * scale) / 2, img.width * scale, img.height * scale); }
          else { ctx.fillStyle = '#b2bdb5'; ctx.font = `24px ${family}`; ctx.fillText('◇', x + cardWidth / 2, cy + 42); }
          ctx.fillStyle = '#e4ece8'; ctx.font = `16px ${family}`;
          textLines.get(id).forEach((text, ti) => ctx.fillText(text, x + cardWidth / 2, cy + 86 + ti * 22));
        });
        cy += line.height + gap;
      });
      ctx.strokeStyle = '#46564d'; ctx.strokeRect(.5, y + .5, width - 1, row.height);
      y += row.height;
    });
    ctx.textAlign = 'left'; ctx.fillStyle = '#b2bdb5'; ctx.font = `16px ${family}`; ctx.fillText('查无此地 · 生存手册', 24, y + 34);
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(Error('图片生成失败')), 'image/png'));
  }
  function exportImage(copy) {
    if (exporting) return;
    exporting = true;
    const copyButton = byId('tier-copy'), downloadButton = byId('tier-download');
    copyButton.disabled = downloadButton.disabled = true; announce('正在生成完整榜单图片…');
    const download = blob => { const url = URL.createObjectURL(blob), a = el('a'); a.href = url; a.download = '查无此地-夯拉榜.png'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10000); };
    let operation;
    try {
      if (copy) {
        if (!window.isSecureContext || !navigator.clipboard?.write || !window.ClipboardItem) throw Error('此浏览器不支持图片复制，请使用“导出 PNG”。');
        // Start clipboard.write during the click; Safari can resolve the PNG promise later.
        const png = imageBlob();
        operation = navigator.clipboard.write([new ClipboardItem({'image/png': png})]);
        png.catch(() => {});
      } else operation = imageBlob().then(download);
    } catch (e) { operation = Promise.reject(e); }
    operation.then(() => announce(copy ? '完整榜单图片已复制，可直接粘贴到聊天窗口。' : '完整榜单 PNG 已导出。'))
      .catch(e => announce(copy ? (e.message.includes('不支持') ? e.message : '复制失败，请允许剪贴板访问，或使用“导出 PNG”。') : '图片生成失败，请重试。'))
      .finally(() => { exporting = false; if (byId('tier-board')) drawActionsAndExport(); });
  }
  function focusCard(id) {
    root.querySelector('.rank-zone [data-tier-item="' + CSS.escape(id) + '"]')?.focus({preventScroll: true});
  }
  function move(id, target, before = null) {
    if (!Wiki.getItem(id) || !Object.hasOwn(rows, target) || before === id) return;
    cleared = copied = null;
    for (const [key] of tiers) rows[key] = rows[key].filter(value => value !== id);
    const index = before ? rows[target].indexOf(before) : -1;
    rows[target].splice(index < 0 ? rows[target].length : index, 0, id);
    selected = id; save(); draw(); focusCard(id);
    announce(name(id) + '已移到' + tiers.find(([key]) => key === target)[1] + '，第 ' + (rows[target].indexOf(id) + 1) + ' 位。');
  }
  function shift(delta) {
    const key = rowOf(selected), list = rows[key], index = list?.indexOf(selected), next = index + delta;
    if (!list || next < 0 || next >= list.length) return;
    move(selected, key, delta < 0 ? list[next] : list[next + 1] || null);
  }
  function categoryItems() { return Wiki.data.items.filter(i => category === 'all' || i.category === category); }
  function matches() {
    const needle = query.trim().toLocaleLowerCase();
    return categoryItems().filter(i => (!subcategory || i.subcategory === subcategory) && (!needle || Wiki.plainText(i.name + ' ' + i.id + ' ' + (i.subcategory || '')).toLocaleLowerCase().includes(needle)));
  }
  function card(id, library = false) {
    const item = Wiki.getItem(id), b = el('button', 'rank-item'); b.type = 'button'; b.draggable = true;
    b.dataset.tierItem = id; b.setAttribute('aria-pressed', String(selected === id));
    b.setAttribute('aria-label', name(id) + (library ? '，加入待排区' : '，选择后可移动')); b.title = name(id) + ' · ' + (item.subcategory || item.category) + ' · ' + id;
    b.append(Wiki.art(item.icon, 'rank-art'), el('span', 'rank-name', item.name || id));
    b.onclick = () => { if (library) { move(id, 'pool'); return; } selected = id; draw(); focusCard(id); };
    b.addEventListener('dragstart', e => { dragged = id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('application/x-nsp-item', id); b.classList.add('dragging'); });
    b.addEventListener('dragend', () => { dragged = null; root.querySelectorAll('.drop-active,.drop-before,.drop-after,.dragging').forEach(n => n.classList.remove('drop-active', 'drop-before', 'drop-after', 'dragging')); });
    return b;
  }
  function dropTarget(zone, key) {
    zone.dataset.tier = key;
    zone.addEventListener('dragover', e => {
      if (!dragged) return; e.preventDefault(); e.dataTransfer.dropEffect = 'move'; zone.classList.add('drop-active');
      root.querySelectorAll('.drop-before,.drop-after').forEach(n => n.classList.remove('drop-before', 'drop-after'));
      const hit = e.target.closest('.rank-item'); if (hit && hit.dataset.tierItem !== dragged) hit.classList.add(e.clientX < hit.getBoundingClientRect().left + hit.offsetWidth / 2 ? 'drop-before' : 'drop-after');
    });
    zone.addEventListener('dragleave', e => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('drop-active'); });
    zone.addEventListener('drop', e => {
      if (!dragged) return; e.preventDefault();
      const id = dragged, hit = e.target.closest('.rank-item'); let before = null;
      if (hit) { const ids = rows[key], index = ids.indexOf(hit.dataset.tierItem); before = e.clientX < hit.getBoundingClientRect().left + hit.offsetWidth / 2 ? ids[index] : ids[index + 1] || null; }
      dragged = null; move(id, key, before);
    });
  }
  function draw() {
    const board = byId('tier-board'); board.replaceChildren();
    for (const [key, label] of tiers) {
      const section = el('section', 'rank-row rank-' + key), heading = el('h2', 'rank-label', label);
      heading.id = 'tier-label-' + key; heading.append(el('small', '', String(rows[key].length)));
      const zone = el('div', 'rank-zone'); zone.setAttribute('role', 'group'); zone.setAttribute('aria-labelledby', heading.id); dropTarget(zone, key);
      rows[key].forEach(id => zone.append(card(id)));
      if (!rows[key].length) zone.append(el('p', 'rank-placeholder', key === 'pool' ? '从物品库挑选，或加入整个筛选结果' : '把物品拖到这里'));
      section.append(heading, zone); board.append(section);
    }
    drawLibrary(); drawActions();
    byId('tier-storage').textContent = storageWarning || '自动保存在当前浏览器，仅记录你的个人评价。';
    byId('tier-save').hidden = !protectedDraft;
    byId('tier-count').textContent = '已排 ' + tiers.filter(([key]) => key !== 'pool').reduce((sum, [key]) => sum + rows[key].length, 0) + ' 件 · 待排 ' + rows.pool.length + ' 件';
    const noRanked = tiers.filter(([key]) => key !== 'pool').every(([key]) => !rows[key].length);
    byId('tier-copy').disabled = byId('tier-download').disabled = noRanked || exporting;
    byId('tier-clear').disabled = Object.values(rows).every(list => !list.length);
    byId('tier-undo-clear').hidden = !cleared;
    byId('tier-undo-copy').hidden = !copied;
  }
  function drawLibrary() {
    const used = new Set(Object.values(rows).flat()), found = matches(), available = found.filter(i => !used.has(String(i.id)));
    const library = byId('tier-library'); library.replaceChildren(); available.forEach(i => library.append(card(String(i.id), true)));
    if (!available.length) library.append(el('p', 'guide-note', found.length ? '筛选结果都已加入榜单。' : '没有匹配物品，试试其他分类或名称。'));
    byId('tier-library-count').textContent = found.length + ' 件匹配 · ' + available.length + ' 件可加入';
    byId('tier-add-filter').disabled = !available.length;
  }
  function drawActions() {
    const key = rowOf(selected), list = rows[key], index = list?.indexOf(selected);
    byId('tier-selection').textContent = selected ? '已选：' + name(selected) : '点击卡片，再选择档位或调整顺序';
    byId('tier-move').disabled = !selected; byId('tier-move').value = '';
    byId('tier-prev').disabled = !list || index <= 0; byId('tier-next').disabled = !list || index >= list.length - 1;
    byId('tier-remove').disabled = !selected;
    const info = byId('tier-info');
    if (info.dataset.item !== (selected || '')) {
      info.dataset.item = selected || '';
      info.replaceChildren(selected ? Wiki.itemDetails(Wiki.getItem(selected), 'tier-detail-title', true) : el('p', 'guide-note', '点击榜单或物品库里的卡片，查看该物品的属性与效果。'));
      info.scrollTop = 0;
    }
  }
  function drawActionsAndExport() {
    drawActions();
    const noRanked = tiers.filter(([key]) => key !== 'pool').every(([key]) => !rows[key].length);
    byId('tier-copy').disabled = byId('tier-download').disabled = noRanked || exporting;
  }
  function mount(target) {
    root = target; if (!rows) readDraft();
    root.classList.add('tier-page'); root.replaceChildren();
    const heading = el('div', 'rank-heading'), copy = el('div'); copy.append(el('h1', '', '从夯到拉'), el('p', 'guide-note', '拖动卡片分档，同档从左到右排序。也可点击卡片，用下方按钮移动。'));
    const exports = el('div', 'rank-exports'), count = el('span', 'guide-note'); count.id = 'tier-count';
    const output=el('div','rank-output-actions'),draftActions=el('div','rank-draft-actions');
    output.setAttribute('role','group');output.setAttribute('aria-label','榜单图片');draftActions.setAttribute('role','group');draftActions.setAttribute('aria-label','当前草稿操作');
    output.append(button('复制榜单图片', 'tier-copy', () => exportImage(true)), button('导出 PNG', 'tier-download', () => exportImage(false)));
    draftActions.append(button('一键清空', 'tier-clear', () => {
      copied=null;cleared = rows; rows = empty(); selected = dragged = null; save(); draw(); announce('榜单和待排区已清空，可重新挑选物品。');
    }), button('撤销复制', 'tier-undo-copy', () => {
      if (!copied) return;
      const previous=copied; rows=previous.rows; protectedDraft=previous.protectedDraft; storageWarning=previous.storageWarning;
      try { if(previous.raw===null)localStorage.removeItem(KEY);else localStorage.setItem(KEY,previous.raw); }
      catch { storageWarning='浏览器无法恢复保存，原排序已恢复到本次页面。'; }
      copied=cleared=null; selected=dragged=null; draw(); announce('已恢复复制前的榜单。');
    }), button('撤销清空', 'tier-undo-clear', () => {
      if (!cleared) return; rows = cleared; cleared = null; selected = dragged = null; save(); draw(); announce('已恢复清空前的榜单。');
    })); exports.append(count,output,draftActions);heading.append(copy, exports); root.append(heading);
    const board = el('div'); board.id = 'tier-board'; root.append(board);
    const actions = el('div', 'rank-actions'), selection = el('span', 'rank-selection'); selection.id = 'tier-selection'; actions.append(selection);
    const select = el('select'); select.id = 'tier-move'; select.setAttribute('aria-label', '移动选中物品到档位'); select.append(el('option', '', '移到…')); select.firstChild.value = '';
    tiers.forEach(([key, label]) => { const opt = el('option', '', label); opt.value = key; select.append(opt); }); select.onchange = () => { if (select.value && selected) move(selected, select.value); }; actions.append(select);
    actions.append(button('前移', 'tier-prev', () => shift(-1)), button('后移', 'tier-next', () => shift(1)), button('移出榜单', 'tier-remove', () => {
      copied=cleared=null;const id = selected; for (const [key] of tiers) rows[key] = rows[key].filter(value => value !== id); selected = null; save(); draw(); byId('tier-category').focus(); announce(name(id) + '已移出榜单，可在物品库重新加入。');
    })); root.append(actions);
    const message = el('p', 'rank-message'); message.id = 'tier-message'; message.setAttribute('role', 'status'); root.append(message);
    const chooser = el('section', 'rank-chooser'); chooser.append(el('h2', '', '物品库'));
    const tools = el('div', 'guide-tools rank-tools');
    const field = (label, input) => { const wrap = el('label', 'rank-field', label); wrap.append(input); return wrap; };
    const cat = el('select'); cat.id = 'tier-category';
    [{id: 'all', name: '全部类别'}, ...Wiki.data.categories].forEach(c => { const opt = el('option', '', c.name); opt.value = c.id; cat.append(opt); }); cat.value = category;
    const sub = el('select'); sub.id = 'tier-subcategory';
    const refreshSub = () => { sub.replaceChildren(el('option', '', '全部子分类')); sub.firstChild.value = ''; [...new Set(categoryItems().map(i => i.subcategory).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh-CN')).forEach(value => { const opt = el('option', '', value); opt.value = value; sub.append(opt); }); sub.value = subcategory; }; refreshSub();
    cat.onchange = () => { category = cat.value; subcategory = ''; refreshSub(); drawLibrary(); }; sub.onchange = () => { subcategory = sub.value; drawLibrary(); };
    const search = el('input'); search.id = 'tier-search'; search.type = 'search'; search.placeholder = '名称或物品 ID'; search.value = query; search.oninput = () => { query = search.value; drawLibrary(); };
    tools.append(field('类别', cat), field('子分类', sub), field('搜索物品', search), button('加入筛选结果', 'tier-add-filter', () => {
      const used = new Set(Object.values(rows).flat()), ids = matches().map(i => String(i.id)).filter(id => !used.has(id)); cleared = copied = null; rows.pool.push(...ids); save(); draw(); byId('tier-category').focus(); announce('已加入 ' + ids.length + ' 件物品到待排区，原有排序保留。');
    })); chooser.append(tools, el('p', 'guide-note', '点击图标加入待排区，或直接拖进某档。“加入筛选结果”只添加当前类别、子分类和搜索命中的物品。'));
    const result = el('p', 'guide-note'); result.id = 'tier-library-count'; chooser.append(result);
    const library = el('div', 'rank-library'); library.id = 'tier-library'; chooser.append(library); root.append(chooser);
    const storage = el('p', 'guide-note'); storage.id = 'tier-storage';
    const overwrite = button('保存当前榜单', 'tier-save', () => { if (!confirm('用当前榜单替换无法读取的旧草稿？')) return; protectedDraft = false; save(); draw(); });
    root.append(storage, overwrite);
    const sidebar = el('aside', 'rank-sidebar'), info = el('div', 'rank-info'); info.id = 'tier-info'; info.dataset.item = 'initial'; info.tabIndex = 0; info.setAttribute('role', 'region'); info.setAttribute('aria-label', '所选物品详细信息');
    sidebar.setAttribute('aria-label', '选中物品信息'); sidebar.append(el('h2', '', '物品信息'), info); root.insertBefore(sidebar, chooser); draw();
    window.TierPosts.mount(root);
  }
  function applyRanking(value) {
    const keys=tiers.filter(([key])=>key!=='pool').map(([key])=>key), next=empty(), seen=new Set();
    if(value?.version!==1 || !value.rows || Object.keys(value.rows).length!==keys.length)throw Error('这个帖子的排行数据无法读取。');
    for(const key of keys){if(!Array.isArray(value.rows[key])||value.rows[key].length>Wiki.data.items.length+(Wiki.data.archivedItems?.length||0))throw Error('排行数据格式不正确。');for(const id of value.rows[key]){if(typeof id!=='string'||!Wiki.getItem(id)||seen.has(id))throw Error('排行含有重复或不支持的物品，未修改当前草稿。');seen.add(id);next[key].push(id);}}
    if(!seen.size)throw Error('这个帖子没有已排序物品。');
    if((protectedDraft||Object.values(rows).some(ids=>ids.length))&&!confirm('用这篇帖子的排行替换当前榜单和待排区？复制后可以撤销。'))return false;
    let raw; try{raw=localStorage.getItem(KEY);}catch{throw Error('无法读取当前草稿，未覆盖。');}
    copied={rows,raw,protectedDraft,storageWarning}; rows=next; protectedDraft=false; selected=dragged=cleared=null;save();draw();announce('已复制帖子的排行，可继续调整；也可以撤销复制。');return true;
  }
  window.ItemTiers = {mount, imageBlob, ranking, applyRanking, hasRanked: () => rows && tiers.some(([key]) => key !== 'pool' && rows[key].length)};
})();
