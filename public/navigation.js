(() => {
  'use strict';
  let indexRequest;
  const make=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
  const channels=()=>[...document.querySelectorAll('.channel-navigation .nav-channel')];
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let pageAnimation;
  function cancelPageTransition(){pageAnimation?.cancel();pageAnimation=null;}
  function enterPage(section){
    cancelPageTransition();
    if(reduced.matches||!['home','items','enemies','npcs','recipes','corruption','mirror','mechanics','updates','traffic','feedback','tiers'].includes(section))return;
    const root=document.getElementById(section==='items'?'item-page':'guide-root');if(!root||root.hidden||!root.animate)return;
    const style=getComputedStyle(document.documentElement);
    pageAnimation=root.animate([{opacity:.84,transform:'translateY(4px)'},{opacity:1,transform:'translateY(0)'}],{duration:parseFloat(style.getPropertyValue('--motion-page'))||200,easing:style.getPropertyValue('--motion-easing').trim()||'ease-out'});
  }
  reduced.addEventListener('change',()=>{if(reduced.matches)cancelPageTransition();});
  function sync(section){
    document.body.dataset.wikiPage=section;
    let current;
    for(const channel of channels()){
      const active=!!channel.querySelector(`[data-page="${CSS.escape(section)}"]:not([data-shortcut])`);
      channel.querySelector('summary').toggleAttribute('data-active',active);
      if(active){channel.querySelector('summary').setAttribute('aria-current','true');current=channel;}else channel.querySelector('summary').removeAttribute('aria-current');
      for(const a of channel.querySelectorAll('a')){if(a.dataset.page===section)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
    }
    document.body.dataset.wikiChannel=current?.dataset.channel||'';
    const local=document.querySelector('.channel-links');
    if(local){local.replaceChildren();if(current)for(const a of current.querySelectorAll('a'))local.append(a.cloneNode(true));local.hidden=!current;}
  }
  async function searchIndex(){
    if(!indexRequest)indexRequest=fetch('/data/search-index.json',{cache:'no-cache'}).then(r=>{if(!r.ok)throw Error('搜索资料暂时无法读取');return r.json();}).then(data=>{
      if(!Array.isArray(data)||data.length>5000||data.some(x=>typeof x.name!=='string'||typeof x.text!=='string'||!/^\/#(?:item|quest|enemy|npc|recipe|affix|maps|mechanic|items|quests|enemies|npcs|recipes|mirror|corruption|workshop|mechanics|loot|tiers|feedback|updates|traffic)(?:\/[^\s?#]+)*$/.test(x.route)))throw Error('搜索资料格式不正确');return data;
    }).catch(error=>{indexRequest=null;throw error;});
    return indexRequest;
  }
  function installSearch(surface){
    const input=surface.querySelector('input'),status=surface.querySelector('[role="status"]'),results=surface.querySelector('.site-search-results');
    const scope=make('select','search-scope');scope.setAttribute('aria-label','搜索范围');
    const all=make('option','','全站');all.value='';scope.append(all);
    for(const c of channels()){const option=make('option','',c.querySelector('summary').textContent);option.value=c.dataset.channel;scope.append(option);}
    input.before(scope);let serial=0,timer;
    function setState(state){surface.dataset.searchState=state;results.setAttribute('aria-busy',String(state==='loading'));results.inert=state==='loading';}
    setState('idle');
    async function search(){
      const ticket=++serial,q=input.value.trim().toLocaleLowerCase();
      if(!q){results.replaceChildren();status.textContent='';setState('idle');return;}
      setState('loading');status.textContent='正在查找…';
      try{
        const index=await searchIndex();if(ticket!==serial||!surface.isConnected)return;
        const words=q.split(/\s+/),found=index.filter(x=>(!scope.value||x.channel===scope.value)&&words.every(w=>x.text.includes(w))).sort((a,b)=>Number(b.name.toLocaleLowerCase().startsWith(q))-Number(a.name.toLocaleLowerCase().startsWith(q))||a.name.localeCompare(b.name,'zh-CN'));
        const next=document.createDocumentFragment();for(const item of found.slice(0,24)){const a=make('a','site-search-result');a.href=item.route;a.append(make('strong','',item.name),make('small','',item.type));next.append(a);}results.replaceChildren(next);setState(found.length?'ready':'empty');
        status.textContent=found.length?`找到 ${found.length} 项${found.length>24?'，先显示前 24 项，可继续输入缩小范围':''}`:'没有找到，试试更短的名称或切换到全站。';
      }catch(error){if(ticket===serial&&surface.isConnected){results.replaceChildren();setState('error');status.textContent=error.message+'，请修改关键词或切换范围重试。';}}
    }
    input.addEventListener('input',()=>{clearTimeout(timer);serial++;if(!input.value.trim()){search();return;}setState('loading');status.textContent='正在查找…';timer=setTimeout(search,120);});scope.addEventListener('change',()=>{clearTimeout(timer);search();});
    return {input,scope};
  }
  function renderHome(root){
    if(root.querySelector('.wiki-home'))return;
    const template=document.getElementById('home-template');
    root.replaceChildren(template?template.content.cloneNode(true):make('p','status error','首页暂时无法读取，请使用上方频道进入攻略。'));
    const surface=root.querySelector('[data-search-surface]');if(surface)installSearch(surface);
  }
  function setup(){
    for(const channel of channels())channel.addEventListener('toggle',()=>{if(channel.open)for(const other of channels())if(other!==channel)other.open=false;});
    document.addEventListener('click',event=>{if(event.target.closest('.channel-navigation a,.channel-links a')||!event.target.closest('.channel-navigation'))for(const c of channels())c.open=false;});
    document.addEventListener('keydown',event=>{if(event.key==='Escape')for(const c of channels())if(c.open){c.open=false;c.querySelector('summary').focus();event.preventDefault();}});
    const dialog=make('dialog','site-search-dialog');dialog.setAttribute('aria-labelledby','site-search-title');
    const heading=make('div','site-search-heading'),title=make('h2','','搜索攻略');title.id='site-search-title';
    const close=make('button','close-button','×');close.type='button';close.setAttribute('aria-label','关闭搜索');close.onclick=()=>dialog.close();heading.append(title,close);
    const surface=make('div','home-search');surface.dataset.searchSurface='';const label=make('label','','名称或关键词'),input=make('input');input.id='site-search-input';input.type='search';input.placeholder='例如：魔法帽、防御';label.htmlFor=input.id;
    const status=make('p','guide-note');status.setAttribute('role','status');const results=make('div','site-search-results');surface.append(label,input,status,results);dialog.append(heading,surface);document.body.append(dialog);
    const search=installSearch(surface);let trigger;
    const open=event=>{trigger=event?.currentTarget||document.activeElement;search.scope.value=document.body.dataset.wikiChannel||'';search.scope.dispatchEvent(new Event('change'));if(!dialog.open)dialog.showModal();search.input.focus();};
    for(const b of document.querySelectorAll('[data-site-search]')){b.hidden=false;b.onclick=open;}
    dialog.addEventListener('close',()=>{if(trigger?.isConnected)trigger.focus({preventScroll:true});});
    dialog.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();dialog.close();}});
    window.addEventListener('hashchange',()=>{if(dialog.open)dialog.close();});
    results.addEventListener('click',event=>{if(event.target.closest('a'))dialog.close();});
    document.addEventListener('keydown',event=>{if(event.key==='/'&&!event.defaultPrevented&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&!['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)&&!document.querySelector('dialog[open]')){event.preventDefault();open();}});
    const aliases={item:'items',quest:'quests',enemy:'enemies',npc:'npcs',recipe:'recipes',affix:'corruption',mechanic:'mechanics',history:'updates'};
    const section=location.pathname==='/'?(location.hash.slice(1).split('/')[0]||'home'):location.pathname.split('/')[1];sync(aliases[section]||section);if(section==='home'&&document.getElementById('guide-root')){document.getElementById('guide-root').hidden=false;document.getElementById('item-page').hidden=true;renderHome(document.getElementById('guide-root'));}
  }
  window.WikiNavigation={sync,renderHome,cancelPageTransition,enterPage};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();
