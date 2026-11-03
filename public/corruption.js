(() => {
  'use strict';
  const el = (...args) => window.Wiki.el(...args);
  let pending;
  let query = '', category = 'all', position = 'all', itemQuery = '';
  const mounts = new WeakMap();

  async function load() {
    return pending ||= fetch('/data/corruption.json',{cache:'no-cache'}).then(response => {
      if (!response.ok) throw Error('腐化资料暂时无法读取');
      return response.json();
    }).then(data => {
      if (!data.meta || !Array.isArray(data.affixes) || !Array.isArray(data.categories) || !data.itemApplicability) {
        throw Error('腐化资料格式不完整');
      }
      return data;
    }).catch(error => { pending = null; throw error; });
  }

  function link(text, href, className = 'inline-link') {
    const node = el('a', className, text);
    node.href = href;
    return node;
  }
  function noteLines(body, values) {
    for (const text of values || []) body.append(el('p', 'guide-note', text));
  }
  function itemLink(id) {
    const item = window.Wiki.getItem(id);
    if (!item || item.archived) return null;
    const node = link(item.name || item.nameZh || item.subcategory || '物品', '#item/' + encodeURIComponent(id));
    node.dataset.itemId = id;
    if (item.icon) node.prepend(window.Wiki.art(item.icon, 'tiny-art'));
    return node;
  }
  function affixLink(affix) {
    return link(affix.name, '#affix/' + encodeURIComponent(affix.id));
  }
  function showAffix(data, affix) {
    const dialog = document.getElementById('detail');
    const body = el('div', 'detail-body guide-detail corruption-detail reference-detail');
    body.dataset.affixId = affix.id;
    const title = el('h2', '', affix.name);
    title.id = 'detail-title';
    const heading=el('header','reference-heading corruption-detail-heading'),actions=el('div','reference-actions');
    actions.append(link('打开完整词条页', '/corruption/' + encodeURIComponent(affix.id) + '/', 'static-guide-link'));
    heading.append(el('p', 'detail-tag', '腐化词条 · EA'), title,actions);body.append(heading);
    body.append(el('p', 'description', affix.description));
    const classNames = affix.categories.map(id => data.categories.find(c => c.id === id)?.name || '分类待核实');
    body.append(el('p', 'guide-note', '适用分类：' + classNames.join('、')),
      el('p', 'guide-note', '适用部位：' + affix.positions.join('、')));
    if (affix.nativeDescription && affix.nativeDescription !== affix.description) {
      const native = el('details', 'loot-pool');
      native.append(el('summary', '', '游戏原文'), el('p', 'description', affix.nativeDescription));
      body.append(native);
    }
    noteLines(body, (affix.notes||[]).filter(text=>text!=='中文译名与说明待核实。'));
    const ids = Object.entries(data.itemApplicability)
      .filter(([, binding]) => binding.status === 'bound' && binding.affixIds.includes(affix.id))
      .map(([id]) => id).filter(id => window.Wiki.getItem(id) && !window.Wiki.getItem(id).archived);
    const related = el('section', 'corruption-related reference-related');
    related.append(el('h3', 'detail-section-title', '适用物品'));
    const tools = el('div', 'corruption-related-tools reference-toolbar');
    const search = el('input'); search.type='search'; search.placeholder='查找适用物品'; search.setAttribute('aria-label',search.placeholder);
    const select = el('select');select.setAttribute('aria-label','适用物品分类');
    const all = el('option','','全部分类');all.value='all';select.append(all);
    for(const c of window.Wiki.data.categories){if(!ids.some(id=>window.Wiki.getItem(id).category===c.id))continue;const option=el('option','',c.name);option.value=c.id;select.append(option);}
    const count=el('p','result-count reference-count'),grid=el('div','corruption-item-grid reference-grid'),more=el('button','secondary-button','显示全部');more.type='button';count.setAttribute('role','status');
    let expanded=false;
    function drawItems(){
      const needle=search.value.trim().toLowerCase(),matches=ids.filter(id=>{const i=window.Wiki.getItem(id);return(select.value==='all'||i.category===select.value)&&(!needle||i.name.toLowerCase().includes(needle));});
      grid.replaceChildren();count.textContent=`${matches.length} 件物品 · 腐化或重洗时可能获得`;
      matches.forEach((id,index)=>{const i=window.Wiki.getItem(id),card=link('', '#item/'+encodeURIComponent(id),'corruption-item reference-card');card.dataset.itemId=id;card.hidden=!expanded&&index>=16;card.append(window.Wiki.art(i.icon,'tiny-art'),el('span','',i.name));grid.append(card);});
      if(!matches.length)grid.append(el('p','empty','没有匹配物品。'));
      more.hidden=expanded||matches.length<=16;more.textContent=`显示全部 ${matches.length} 件`;
    }
    search.oninput=()=>{expanded=false;drawItems();};select.onchange=()=>{expanded=false;drawItems();};more.onclick=()=>{expanded=true;drawItems();};
    tools.append(search,select);related.append(tools,count,grid,more);drawItems();
    body.append(related);
    document.getElementById('detail-content').replaceChildren(body);
    window.AffixCommunity?.mount(body,affix.id);
    dialog.querySelector('.detail-top>span').textContent = '腐化词条 · EA';
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
  }

  async function mount(root, { affixId,overlayOnly=false,isCurrent=()=>true } = {}) {
    const token = {};
    const initialHash = location.hash;
    mounts.set(root, token);
    root.dataset.corruption = 'loading';
    try {
      const data = await load();
      if(!isCurrent())return;
      if(overlayOnly){const affix=data.affixes.find(x=>x.id===affixId);if(!affix)throw Error('Missing detail');showAffix(data,affix);return;}
      if (!root.isConnected || mounts.get(root) !== token || location.hash !== initialHash) return;
      if(affixId&&root.querySelector('.corruption-categories')){const affix=data.affixes.find(x=>x.id===affixId);if(affix){showAffix(data,affix);return;}}
      const heading = el('div', 'guide-heading corruption-heading reference-heading');
      heading.append(el('h1', '', '腐化词条'));
      const categories=el('div','corruption-categories');categories.setAttribute('aria-label','腐化分类');
      const buttons=[{id:'all',name:'全部'},...data.categories].map(c=>{const b=el('button','',c.name.replace('腐化',''));b.type='button';b.dataset.category=c.id;b.setAttribute('aria-pressed',String(category===c.id));b.onclick=()=>{category=c.id;buttons.forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.category===category)));draw();};categories.append(b);return b;});
      const tools = el('div', 'guide-tools corruption-tools reference-toolbar');
      const searchWrap = el('label', 'guide-search corruption-field');
      const search = el('input');
      search.type = 'search'; search.placeholder = '搜索词条名称、描述或部位'; search.value = query;
      search.setAttribute('aria-label', search.placeholder);
      searchWrap.append(el('span','','词条关键词'),search);
      const parts = el('select');
      parts.setAttribute('aria-label', '适用部位');
      ['all', ...new Set(data.affixes.flatMap(a => a.positions))].forEach(value => {
        const option = el('option', '', value === 'all' ? '全部部位' : value); option.value = value; parts.append(option);
      });
      parts.value = position;
      const byItem=el('input','corruption-by-item');byItem.type='search';byItem.value=itemQuery;byItem.placeholder='按物品查词条';byItem.setAttribute('aria-label','按物品名称查适用词条');
      const reset=el('button','secondary-button corruption-reset','清除筛选');reset.type='button';
      const partField=el('label','corruption-field corruption-position-field'),itemField=el('label','corruption-field corruption-item-field');partField.append(el('span','','适用部位'),parts);itemField.append(el('span','','关联物品'),byItem);
      tools.append(searchWrap,partField,itemField,reset);
      const count = el('p', 'result-count reference-count'); count.id = 'corruption-count';count.setAttribute('role','status');
      const table=el('table','corruption-table'),head=el('thead'),header=el('tr');
      ['词条','效果','部位','适用物品'].forEach(text=>{const th=el('th','',text);th.scope='col';header.append(th);});head.append(header);
      const grid = el('tbody'); grid.id = 'corruption-grid';table.append(head,grid);
      root.replaceChildren(heading,categories, tools, count, table);
      function draw() {
        const needle = query.toLowerCase().trim();
        const itemNeedle=itemQuery.trim().toLowerCase();
        const matching=itemNeedle?Object.entries(data.itemApplicability).filter(([id,b])=>b.status==='bound'&&window.Wiki.getItem(id)?.name.toLowerCase().includes(itemNeedle)):null;
        const allowed=matching?new Set(matching.flatMap(([,b])=>b.affixIds)):null;
        const list = data.affixes.filter(a => (category === 'all' || a.categories.includes(category)) &&
          (position === 'all' || a.positions.includes(position)) &&
          (!allowed||allowed.has(a.id))&&
          (!needle || `${a.name} ${a.description} ${a.nativeDescription} ${a.positions.join(' ')}`.toLowerCase().includes(needle)));
        count.textContent = `${list.length} 个词条${matching?` · 匹配 ${matching.length} 件物品`:''}`;
        grid.replaceChildren();
        for (const affix of list) {
          const card = el('tr','corruption-row');
          card.dataset.affixId = affix.id;
          const name=el('td','corruption-name');name.append(affixLink(affix));
          const effect=el('td','corruption-copy',affix.description);effect.dataset.label='效果';
          const locations=el('td','corruption-positions',affix.positions.join('、'));locations.dataset.label='部位';
          const amount=Object.values(data.itemApplicability).filter(b=>b.status==='bound'&&b.affixIds.includes(affix.id)).length;
          const applicable=el('td','corruption-applicable');applicable.dataset.label='适用物品';applicable.append(link(amount+' 件','#affix/'+encodeURIComponent(affix.id)));
          card.append(name,effect,locations,applicable);
          grid.append(card);
        }
        if (!list.length){const row=el('tr'),cell=el('td','empty','没有匹配词条。清除筛选或换个物品名称。');cell.colSpan=4;row.append(cell);grid.append(row);}
      }
      search.addEventListener('input', () => { query = search.value; draw(); });
      byItem.addEventListener('input',()=>{itemQuery=byItem.value;draw();});
      reset.onclick=()=>{query=itemQuery='';category=position='all';search.value=byItem.value='';parts.value='all';buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category==='all')));draw();};
      parts.addEventListener('change', () => { position = parts.value; draw(); });
      draw();
      root.dataset.corruption = 'ready';
      if (affixId) {
        const affix = data.affixes.find(a => a.id === affixId);
        if (affix) showAffix(data, affix);
        else root.prepend(el('p', 'status error', '此腐化词条链接不存在，请从当前目录选择。'));
      }
    } catch (error) {
      if(overlayOnly){if(isCurrent())throw error;return;}
      if (!root.isConnected || mounts.get(root) !== token || location.hash !== initialHash) return;
      root.dataset.corruption = 'error';
      root.replaceChildren(el('p', 'status error', '腐化资料载入失败，请刷新重试。'));
    }
  }

  async function enhanceItem(body, item, detailsOnly = false) {
    body.dataset.corruption = 'loading';
    body.dataset.corruptionItemId = item.id;
    try {
      const data = await load();
      if (!body.isConnected || body.dataset.corruptionItemId !== item.id) return;
      body.querySelector('.corruption-item-section')?.remove();
      const binding = data.itemApplicability[item.id];
      if (!binding || binding.status !== 'bound' || !binding.affixIds?.length || item.archived) {
        body.dataset.corruption = 'ready'; return;
      }
      const section = el('section', 'corruption-item-section');
      section.dataset.itemId = item.id;
      section.append(el('h3', 'detail-section-title', '适用腐化词条'));
      if (binding.status === 'bound') {
        if (detailsOnly) section.append(link(`查看 ${binding.affixIds.length} 个适用词条`, '#corruption'));
        else {
          const details = el('details', 'loot-pool');
          details.append(el('summary', '', `腐化词条 · ${binding.affixIds.length} 项`));
          const links = el('div', 'related-links');
          binding.affixIds.forEach(id => { const affix = data.affixes.find(a => a.id === id); if (affix) links.append(affixLink(affix)); });
          details.append(links); section.append(details);
        }
      }
      section.append(link('查看全部腐化资料', '#corruption'));
      body.append(section);
      body.dataset.corruption = 'ready';
    } catch {
      if (!body.isConnected || body.dataset.corruptionItemId !== item.id) return;
      body.dataset.corruption = 'error';
      const section = el('section', 'corruption-item-section');
      section.append(el('p', 'guide-note', '腐化适用资料暂时无法读取，请刷新重试。'));
      body.append(section);
    }
  }
  window.Corruption = { load, mount, enhanceItem };
})();
