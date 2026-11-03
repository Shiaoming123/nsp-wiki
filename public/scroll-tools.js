(() => {
  'use strict';
  if(window.WIKI_STATIC_BUILD)return;
  const make=(tag,cls,text)=>{const node=document.createElement(tag);node.className=cls;if(text)node.textContent=text;return node;};
  const selector='.enemy-tools,.corruption-tools,.npc-recipe-tools,.rank-tools,.npc-shop-tools';
  function wrap(tools,label,extra=[]){
    if(tools.closest('.handbook-tools'))return;
    const focus=document.activeElement,host=make('div','handbook-tools'),bar=make('div','handbook-tools-bar');
    host.setAttribute('aria-label',label);host.append(bar);tools.before(host);bar.append(...extra,tools);tools.classList.add('handbook-tools-inline');
    if(tools.closest('dialog'))host.classList.add('handbook-tools-in-dialog');
    new ResizeObserver(()=>host.parentElement?.style.setProperty('--handbook-tools-height',host.offsetHeight+'px')).observe(host);
    if(focus?.isConnected&&host.contains(focus))focus.focus({preventScroll:true});
    return host;
  }
  function scan(){
    const heading=document.querySelector('#browser .browser-heading'),sort=document.querySelector('#browser .item-sort-tools');
    if(heading&&sort&&!heading.closest('.handbook-tools')){
      const host=wrap(heading,'物品类别与排序',[sort]),bar=host.querySelector('.handbook-tools-bar'),category=make('select','handbook-primary');category.setAttribute('aria-label','物品类别');
      for(const button of document.querySelectorAll('#categories .category')){const option=make('option','',button.querySelector('.category-name').textContent);option.value=button.dataset.category;category.append(option);}
      const sync=()=>{const buttons=[...document.querySelectorAll('#categories .category')];if(category.options.length!==buttons.length){category.replaceChildren(...buttons.map(button=>{const option=make('option','',button.querySelector('.category-name').textContent);option.value=button.dataset.category;return option;}));}const current=document.querySelector('#categories [aria-pressed=true]');if(current)category.value=current.dataset.category;};
      category.onchange=()=>{const target=[...document.querySelectorAll('#categories .category')].find(button=>button.dataset.category===category.value);target?.click();category.focus({preventScroll:true});};
      const sub=heading.querySelector('.subcategory-label');if(sub)bar.prepend(sub);const field=make('label','handbook-primary');category.classList.remove('handbook-primary');field.append(make('span','handbook-field-label','分类'),category);bar.prepend(field);const title=heading.firstElementChild;if(title){host.before(title);title.classList.add('handbook-section-title');}heading.remove();sync();
      new MutationObserver(sync).observe(document.getElementById('categories'),{subtree:true,childList:true,attributes:true,attributeFilter:['aria-pressed']});
    }
    for(const tools of document.querySelectorAll(selector)){
      const categories=tools.previousElementSibling?.matches('.corruption-categories')?tools.previousElementSibling:null;
      wrap(tools,tools.matches('.rank-tools')?'物品库筛选':tools.matches('.npc-shop-tools')?'商店搜索':'列表筛选',categories?[categories]:[]);
    }
  }
  let queued=false;
  const observer=new MutationObserver(records=>{if(queued||!records.some(record=>[...record.addedNodes].some(node=>node.nodeType===1&&(node.matches?.('#browser,.browser-heading,'+selector)||node.querySelector?.(selector)))))return;queued=true;queueMicrotask(()=>{queued=false;scan();});});
  observer.observe(document.body,{childList:true,subtree:true});
  window.addEventListener('wiki-ready',scan);scan();
})();
