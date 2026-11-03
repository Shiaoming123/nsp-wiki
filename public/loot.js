(() => {
  'use strict';
  const make=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
  function itemGrid(rows){
    const grid=make('div','loot-items');
    for(const row of rows){const item=window.Wiki.getItem(row.id);if(!item)continue;const a=make('a','loot-item');a.href='#item/'+encodeURIComponent(row.id);if(item.icon){const img=make('img');img.src='/'+item.icon;img.alt='';img.width=32;img.height=32;img.loading='lazy';a.append(img);}else a.append(make('span','loot-item-icon','—'));const text=make('span','loot-item-copy');text.append(make('strong','',item.name),make('span','loot-chance',row.probabilityText));if(row.quantityText)text.append(make('small','','数量：'+row.quantityText));if(row.note)text.append(make('small','loot-item-note',row.note));a.append(text);grid.append(a);}
    return grid;
  }
  function focus(root,id){const target=document.getElementById('loot-box-'+id);if(!target||!root.contains(target))return false;root.dataset.lootContainerId=id;target.open=true;target.scrollIntoView({behavior:'instant',block:'start'});return true;}
  function mount(root,data,{mapId,containerId}={}){
    root.replaceChildren();const heading=make('div','guide-heading reference-heading loot-heading');heading.append(make('p','kicker','探索与任务'),make('h1','','容器与搜刮'),make('p','intro-copy','先选地图，再找容器。点物品查看属性与其他获取方式。'));root.append(heading);
    if(mapId&&!data.maps.some(m=>m.id===mapId)){const back=make('a','inline-link','返回搜刮目录');back.href='#loot';root.append(make('p','status error','此地图不在当前搜刮目录中。'),back);return;}
    const tools=make('div','loot-tools reference-toolbar'),label=make('label','','地图 '),select=make('select'),search=make('input');select.setAttribute('aria-label','搜刮地图');search.type='search';search.placeholder='搜索容器或物品名称';search.setAttribute('aria-label','搜索容器与物品');
    for(const map of data.maps){const option=make('option','',map.name);option.value=map.id;select.append(option);}const selected=data.maps.find(m=>m.id===mapId)||data.maps.find(m=>m.containers.length)||data.maps[0];select.value=selected.id;select.onchange=()=>{location.hash='#loot/'+encodeURIComponent(select.value);};label.append(select);tools.append(label,search);const notes=make('details','loot-notes');notes.append(make('summary','','搜刮说明 · 名称、数量与预估概率'));for(const note of data.meta.notes)notes.append(make('p','guide-note',note));root.append(tools,notes);
    root.dataset.lootMapId=selected.id;root.dataset.lootContainerId=containerId||'';const mapLink=make('a','inline-link loot-map-link','查看当前地图 ↗');mapLink.href='#maps/'+encodeURIComponent(selected.id);root.append(mapLink);if(window.Guide)window.Guide.baseRoute='#loot/'+encodeURIComponent(selected.id);
    const result=make('p','result-count reference-count loot-count');result.setAttribute('role','status');const list=make('div','loot-containers');root.append(result,list);
    function render(){const query=search.value.trim();list.replaceChildren();let containers=0,items=0;
      for(const box of selected.containers){const boxMatch=box.name.includes(query),candidates=box.items.filter(row=>boxMatch||window.Wiki.getItem(row.id)?.name.includes(query));if(!boxMatch&&!candidates.length)continue;containers++;items+=candidates.length;
        const section=make('details','loot-container');section.id='loot-box-'+box.id;section.open=!!query||box.id===root.dataset.lootContainerId||(!root.dataset.lootContainerId&&containers===1);const title=make('summary','loot-container-title');if(box.icon){const img=make('img','loot-container-icon');img.src='/'+box.icon;img.alt='';img.width=48;img.height=48;img.loading='lazy';title.append(img);}title.append(make('h2','',box.name));if(box.nameKind==='wiki')title.append(make('span','loot-name-kind','Wiki识别名'));if(box.variantLabel)title.append(make('span','guide-note',box.variantLabel));section.append(title);if(box.spawnNote)section.append(make('p','guide-note',box.spawnNote));if(box.note)section.append(make('p','guide-note',box.note));const grid=itemGrid(candidates);
        section.append(grid);if(!box.items.length&&!box.note)section.append(make('p','guide-note','此容器的物品内容尚待核实。'));list.append(section);
      }result.textContent=containers+' 个物资方案 · '+items+' 项物品来源';if(!containers)list.append(make('p','guide-note',query?'没有找到，试试更短的名称。':'此地图暂未找到可核实的搜刮容器。'));
    }
    search.oninput=render;render();if(containerId&&!focus(root,containerId))heading.after(make('p','guide-note','此容器方案不在当前目录中，可按名称查找其他方案。'));
  }
  window.WikiLoot={mount,focus,itemGrid};
})();
