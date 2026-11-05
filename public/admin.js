(() => {
  'use strict';
  const root=document.getElementById('community-admin');if(!root)return;
  document.querySelector('.skip-link')?.addEventListener('click',event=>{event.preventDefault();const target=document.getElementById('admin-main');if(target){target.tabIndex=-1;target.focus();}});
  const {api,write}=CommunityAuth;
  const names={content:'内容管理',users:'用户管理',notice:'公告管理',audit:'操作日志'};
  const states={open:'待处理',working:'处理中',resolved:'已解决',closed:'已关闭'};
  const kinds={posts:'帖子',comments:'帖子评论','item-comments':'物品评论','affix-comments':'词条评论','feedback-comments':'反馈留言'};
  const actions={delete_post:'删除帖子',delete_comment:'删除帖子评论',delete_item_comment:'删除物品评论',delete_affix_comment:'删除词条评论',delete_feedback:'删除反馈',delete_feedback_comment:'删除反馈留言',update_site_notice:'更新公告',update_feedback_status:'更新反馈状态',update_permissions:'调整管理权限',mute_member:'禁言成员',unmute_member:'解除禁言'};
  const make=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
  const button=(label,click,cls='secondary-button')=>{const b=make('button',cls,label);b.type='button';b.onclick=click;return b;};
  const link=(label,href)=>{const a=make('a','inline-link',label);a.href=href;return a;};
  const field=(label,control)=>{const l=make('label','',label);control.setAttribute('aria-label',label);l.append(control);return l;};
  const input=(max=80)=>{const i=make('input');i.maxLength=max*2;return i;};
  const select=options=>{const s=make('select');for(const [value,text]of Object.entries(options)){const o=make('option','',text);o.value=value;s.append(o);}return s;};
  const when=value=>value?new Date(value).toLocaleString('zh-CN',{hour12:false}):'—';
  const badge=text=>make('span','admin-badge',text);
  let generation=0,dirty=false,writing=false,account=null,status,main,nav,activeTab='overview';
  const can=permission=>account?.permissions?.includes(permission)||account?.isAdmin;
  const alive=ticket=>ticket===generation&&root.isConnected;
  function discard(){return !writing&&(!dirty||confirm('当前有未保存的修改，离开并放弃草稿？'));}
  function go(tab){if(discard()){dirty=false;if(location.hash==='#'+tab)render();else location.hash=tab;}}
  function message(text){if(status)status.textContent=text;}
  function markdown(body){const n=make('div','admin-body');n.tabIndex=0;n.setAttribute('aria-label','内容正文');if(window.PostMarkdown)PostMarkdown.render(n,body);else n.textContent=body;return n;}
  async function save(form,route,data,success){
    if(form.dataset.version!==undefined)data.version=Number(form.dataset.version);
    if(writing)return;writing=true;const ticket=generation,controls=[...form.querySelectorAll('input,textarea,select,button')];controls.forEach(n=>n.disabled=true);form.setAttribute('aria-busy','true');message('正在保存…');
    try{await api(route,write('PUT',data));if(!alive(ticket))return;dirty=false;await render();message(success);}
    catch(error){if(alive(ticket)){message(error.message+'；草稿已保留。');if(error.status===409&&!form.querySelector('[data-reload-version]')){
      const reload=button('载入最新版本并保留草稿',async()=>{reload.disabled=true;try{const path=route==='site-notice'?route:route.includes('/members/')?route.replace(/\/(permissions|restriction)$/,''):route;const latest=await api(path);if(!alive(ticket))return;form.dataset.version=latest.version;message('最新服务器状态：'+(latest.status?states[latest.status]+'；当前内部备注：'+(latest.note||'（空）'):route==='site-notice'?latest.content:latest.permissions!==undefined?'权限 '+(latest.permissions||'无')+'；禁言至 '+when(latest.mutedUntil*1000):'版本 '+latest.version)+'。本地草稿已保留，请核对后再次保存。');reload.remove();}catch(failure){if(alive(ticket))message(failure.message+'；草稿已保留。');}finally{reload.disabled=false;}});reload.dataset.reloadVersion='true';form.append(reload);
    }if([401,403].includes(error.status))CommunityAuth.refresh().catch(()=>{});}}
    finally{writing=false;controls.forEach(n=>n.disabled=false);form.removeAttribute('aria-busy');}
  }
  function editor(){const f=make('form','admin-editor');f.addEventListener('input',()=>{dirty=true;for(const other of main.querySelectorAll('.admin-editor'))if(other!==f)other.querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=true);main.querySelectorAll('[data-admin-delete]').forEach(n=>n.disabled=true);});return f;}
  function reasonField(form){const reason=input(200);reason.required=true;form.append(field('操作原因（最多 200 字）',reason));return reason;}
  function submit(form,label){const b=make('button','secondary-button',label);b.type='submit';form.append(b,button('取消修改',()=>{if(!writing&&(!dirty||confirm('放弃当前未保存的修改？'))){dirty=false;render();}}));if(dirty)form.querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=true);return b;}
  function buildFrame(){
    const layout=make('div','admin-layout'),aside=make('aside','admin-sidebar');nav=make('nav','admin-nav');nav.setAttribute('aria-label','管理模块');
    const tabs={overview:'管理总览',...(can('content')?{content:'内容管理',feedback:'反馈处理'}:{}),...(can('users')?{members:'用户管理'}:{}),...(account.isAdmin?{permissions:'权限分配'}:{}),...(can('notice')?{notice:'首页公告'}:{}),...(can('audit')?{audit:'操作日志'}:{})};
    for(const [key,label]of Object.entries(tabs)){const b=button(label,()=>go(key));b.dataset.tab=key;nav.append(b);}
    aside.append(nav,make('p','','管理权限由站主分配。所有操作均由服务端核验。'));
    main=make('main','admin-main');main.id='admin-main';layout.append(aside,main);root.replaceChildren(layout);return tabs;
  }
  function header(){const host=document.getElementById('admin-account');host.replaceChildren(make('span','admin-account-name',account?'@'+account.username:'未登录'));if(account){host.append(badge(account.isAdmin?'站主':account.permissions?.length?'协作管理员':'普通成员'),button('退出登录',async()=>{if(!discard())return;try{dirty=false;await CommunityAuth.logout();}catch(error){message(error.message);}}));}host.append(link('返回 Wiki','/#home'));}
  async function render(){
    const ticket=++generation;account=CommunityAuth.account;header();
    if(!account||(!account.isAdmin&&!account.permissions?.length)){
      main=make('main','admin-main admin-login');main.id='admin-main';main.append(make('h1','','社区管理中心'),make('p','',account?'当前账号没有管理权限。请联系站主按账号分配权限。':'请登录具有管理权限的站内账号。'));
      status=make('p','admin-status');status.setAttribute('role','status');main.append(button(account?'切换账号':'登录管理账号',async()=>{if(account){try{await CommunityAuth.logout();}catch(error){message(error.message);return;}}CommunityAuth.signIn();}),status);root.replaceChildren(main);return;
    }
    const tabs=buildFrame();let tab=location.hash.slice(1)||'overview';if(!Object.hasOwn(tabs,tab))tab='overview';
    activeTab=tab;
    nav.querySelector('[data-tab="'+tab+'"]').setAttribute('aria-current','page');
    const titlebar=make('div','admin-titlebar'),title=make('div');title.append(make('div','admin-eyebrow','COMMUNITY / '+tab.toUpperCase()),make('h1','',tabs[tab]));
    const descriptions={overview:'查看社区现状与待办，进入你负责的管理模块。',content:'检索帖子与各处评论，核对原文后进行管理。',feedback:'保留玩家原文，记录处理进度与内部备注。',members:'按账号核对身份，限时禁言或恢复普通成员的发言。',permissions:'站主按能力分配权限；协作管理员不能再授权。',notice:'编辑首页公开提醒。并发更新会保留草稿并提示冲突。',audit:'查看操作人、时间、目标和操作原因；历史删除仅保留原有审计字段。'};
    title.append(make('p','',descriptions[tab]));titlebar.append(title,button('刷新权限与数据',async()=>{if(!discard())return;dirty=false;try{await CommunityAuth.refresh();if(alive(ticket))await render();}catch(error){message(error.message);}}));
    status=make('p','admin-status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');main.append(titlebar,status);
    try{
      if(tab==='overview')await overview(ticket);
      else if(tab==='notice')await noticeEditor(ticket);
      else await listing(ticket,tab);
    }catch(error){if(alive(ticket))message(error.message);}
  }
  async function overview(ticket){
    message('正在读取社区数据…');const data=await api('admin/overview');if(!alive(ticket))return;message('');
    const metrics=make('div','admin-metrics'),labels={posts:'帖子',comments:'帖子评论',itemComments:'物品评论',affixComments:'词条评论',feedback:'反馈',feedbackComments:'反馈留言',openFeedback:'待处理 / 处理中',members:'注册成员',muted:'禁言中'};
    for(const [key,value]of Object.entries(data.counts)){const item=make('div','admin-metric');item.append(make('span','',labels[key]),make('strong','',value.toLocaleString('zh-CN')));metrics.append(item);}main.append(metrics);
    const panel=make('section','admin-panel');panel.append(make('h2','','当前权限'),make('p','',account.isAdmin?'站主 · 全部管理能力，拥有唯一授权入口。':'协作管理员 · 仅能访问已授予的模块。'));
    const shortcuts=make('div','admin-shortcuts');for(const p of Object.keys(names))if(can(p))shortcuts.append(button(names[p],()=>go({content:'content',users:'members',notice:'notice',audit:'audit'}[p])));panel.append(shortcuts);main.append(panel);
    const tablePanel=make('section','admin-panel'),wrap=make('div','admin-table-wrap'),table=make('table','admin-table');table.append(make('caption','','权限职责说明'));
    const head=make('thead'),tr=make('tr');for(const text of ['能力','允许的操作','当前账号'])tr.append(make('th','',text));head.append(tr);table.append(head);const body=make('tbody');
    const detail={content:'查看、搜索与删除内容；处理反馈及留言',users:'查询成员；禁言或解禁普通成员',notice:'编辑首页公开提醒',audit:'查看全站管理操作记录'};
    for(const p of Object.keys(names)){const row=make('tr');for(const text of [names[p],detail[p],can(p)?'已具备':'未授予'])row.append(make('td','',text));body.append(row);}table.append(body);wrap.append(table);tablePanel.append(wrap,make('p','guide-note','只有站主可以分配或撤销权限。管理员不能代改他人的帖子正文，也不能操作密码或删除账号。'));main.append(tablePanel);
  }
  function listing(ticket,tab){
    const toolbar=make('form','admin-toolbar'),search=input(),type=select(kinds),state=select({'':'全部状态',...states});search.type='search';toolbar.append(field(tab==='audit'?'搜索操作代码、操作人或目标 ID':tab==='members'||tab==='permissions'?'搜索账号':'搜索标题、正文或账号',search));if(tab==='content')toolbar.append(field('内容类型',type));if(tab==='feedback')toolbar.append(field('筛选处理状态',state));
    const find=make('button','secondary-button','查询');find.type='submit';toolbar.append(find);const list=make('div','admin-list'),more=button('加载更多',()=>load(false),'secondary-button admin-more');more.hidden=true;main.append(toolbar,list,more);
    let offset=0,busy=false,sequence=0,seen=new Set(),filters={q:'',kind:'posts',status:''};
    const current=version=>alive(ticket)&&version===sequence;
    async function load(reset){
      if(busy&&!reset)return;const version=++sequence;busy=true;find.disabled=more.disabled=true;message('正在载入…');list.setAttribute('aria-busy','true');
      if(reset){offset=0;seen=new Set();list.replaceChildren();more.hidden=true;}
      const route={content:'content',feedback:'feedback-workflow',members:'members',permissions:'members',audit:'audit'}[tab],params=new URLSearchParams({q:filters.q,offset:String(offset)});if(tab==='content')params.set('kind',filters.kind);if(tab==='feedback')params.set('status',filters.status);
      try{
        const data=await api('admin/'+route+'?'+params);if(!current(version))return;
        for(const item of data.items){if(seen.has(item.id))continue;seen.add(item.id);const row=tab==='members'||tab==='permissions'?memberRow(item,tab):tab==='audit'?auditRow(item):contentRow(item,tab);list.append(row);}
        offset+=data.items.length;more.hidden=!data.more;message(seen.size?'已显示 '+seen.size+' 条记录。':'');if(!seen.size)list.append(make('p','admin-empty','没有匹配记录。调整筛选条件后重试。'));
      }catch(error){if(current(version)){message(error.message);if(!seen.size)list.append(make('p','admin-empty','数据加载失败。可点击“查询”重试。'));}}
      finally{if(current(version)){busy=false;find.disabled=more.disabled=false;list.removeAttribute('aria-busy');}}
    }
    toolbar.onsubmit=event=>{event.preventDefault();if(!discard())return;dirty=false;filters={q:search.value,kind:type.value,status:state.value};load(true);};return load(true);
    function contentRow(item,kind){
      const row=make('article','admin-row'),heading=make('div','admin-row-head');heading.append(make('h2','',item.title||'未命名内容'));if(kind==='feedback')heading.append(badge(states[item.status]||states.open));row.append(heading,make('p','admin-meta',(item.username?'@'+item.username:'旧匿名内容')+' · '+item.nickname+' · '+when(item.created)),markdown(item.body));
      const controls=make('div','admin-actions');controls.append(link('查看原文',kind==='feedback'?'/#feedback/'+item.id:item.link));
      const remove=button(kind==='feedback'?'删除反馈':'删除内容',async event=>{
        if(dirty)return;
        if(!confirm(kind==='feedback'?'永久删除这条反馈及其留言、点赞？此操作无法撤销。':'永久删除此内容？删除帖子也会移除其评论与点赞，此操作无法撤销。'))return;
        const control=event.currentTarget;control.disabled=true;writing=true;
        try{await api(kind==='feedback'?'feedback/'+item.id:item.deleteRoute,{method:'DELETE'});if(!alive(ticket))return;await load(true);message('内容已删除，操作已记录。');}
        catch(error){if(alive(ticket))message(error.message);}finally{writing=false;control.disabled=false;}
      },'secondary-button admin-danger');remove.dataset.adminDelete='true';remove.disabled=dirty;controls.append(remove);row.append(controls);
      if(kind==='feedback'){
        const details=make('details'),form=editor(),statusSelect=select(states),note=make('textarea');note.rows=3;note.maxLength=1000;statusSelect.value=item.status;note.value=item.note;
        details.append(make('summary','','处理状态与内部备注'));form.append(field('处理状态',statusSelect),field('内部备注（最多 500 字，仅管理中心可见）',note));submit(form,'保存处理结果');form.onsubmit=event=>{event.preventDefault();save(form,'admin/feedback-workflow/'+item.id,{version:item.version,status:statusSelect.value,note:note.value},'处理状态已更新，原反馈正文保持。');};details.append(form);row.append(details);
      }
      return row;
    }
  }
  function memberRow(item,tab){
    const row=make('article','admin-row'),heading=make('div','admin-row-head'),rights=item.permissions?item.permissions.split(','):[],muted=item.mutedUntil>Date.now()/1000;
    heading.append(make('h2','','@'+item.username),badge(item.isOwner?'站主':rights.length?'协作管理员':muted?'禁言中':'普通成员'));row.append(heading,make('p','admin-meta','注册于 '+when(item.created*1000)+' · 账号 ID '+item.id),make('p','guide-note',rights.length?'管理能力：'+rights.map(p=>names[p]).join('、'):'无委派管理权限'));
    if(muted)row.append(make('p','admin-danger','禁言至 '+when(item.mutedUntil*1000)+' · '+item.reason));
    if(item.isOwner||item.username===account.username){row.append(make('p','guide-note','受保护账号，不能在此调整。'));return row;}
    if(tab==='permissions'){
      const details=make('details'),form=editor(),checks=make('fieldset','admin-checks');checks.append(make('legend','','分配管理能力'));const fields=[];
      for(const [key,text]of Object.entries(names)){const c=input();c.type='checkbox';c.value=key;c.checked=rights.includes(key);checks.append(field(text,c));fields.push(c);}form.append(checks);const reason=reasonField(form);submit(form,'保存权限');details.append(make('summary','','调整管理权限'),form);row.append(details);
      form.onsubmit=event=>{event.preventDefault();const granted=fields.filter(c=>c.checked).map(c=>c.value);if(!confirm('将 @'+item.username+' 的管理权限设置为：'+(granted.map(p=>names[p]).join('、')||'全部撤销')+'？'))return;save(form,'admin/members/'+item.id+'/permissions',{version:item.version,permissions:granted,reason:reason.value},'权限已更新，目标账号旧会话的后续请求也会重新核验。');};
    }else if(!rights.length){
      const details=make('details'),form=editor(),duration=select({'0':'解除禁言','3600':'禁言 1 小时','86400':'禁言 24 小时','604800':'禁言 7 天','2592000':'禁言 30 天'});duration.value=muted?'0':'86400';form.append(field('发言限制',duration));const reason=reasonField(form);submit(form,'保存发言限制');details.append(make('summary','','管理发言限制'),form);row.append(details);
      form.onsubmit=event=>{event.preventDefault();const seconds=Number(duration.value);if(!confirm((seconds?'限制':'恢复')+' @'+item.username+' 的发言权限？账号与已发布内容会保留。'))return;save(form,'admin/members/'+item.id+'/restriction',{version:item.version,mutedUntil:seconds?Math.floor(Date.now()/1000)+seconds:0,reason:reason.value},'发言限制已更新。');};
    }else row.append(make('p','guide-note','协作管理员受保护。站主需先撤销其全部管理权限，才能设置禁言。'));
    return row;
  }
  function auditRow(item){const row=make('article','admin-row');row.append(make('h2','',actions[item.action]||item.action),make('p','admin-meta',when(item.created*1000)+' · '+(item.operator?'@'+item.operator:'历史管理账号')),make('p','guide-note','目标：'+item.target));if(item.detail){let value;try{value=JSON.parse(item.detail);}catch{value={说明:item.detail};}for(const [key,v]of Object.entries(value)){const label={reason:'原因',status:'状态',note:'内部备注',permissions:'权限',mutedUntil:'禁言至'}[key]||key;const text=key==='permissions'&&Array.isArray(v)?v.map(p=>names[p]||p).join('、')||'无':key==='status'?states[v]||v:key==='mutedUntil'?(v?when(v*1000):'已解禁'):String(v);row.append(make('p','guide-note',label+'：'+text));}}return row;}
  async function noticeEditor(ticket){
    message('正在载入公告…');const data=await api('site-notice');if(!alive(ticket))return;message('');
    const panel=make('section','admin-panel'),form=editor(),text=make('textarea');text.rows=9;text.maxLength=4000;text.value=data.content;panel.append(make('h2','','首页公开提醒'),make('p','guide-note','纯文本，最多 2000 字。留空保存会清空提醒；这不会修改 Wiki 的攻略资料。'));form.append(field('提醒内容',text));submit(form,'保存首页公告');panel.append(form,link('查看首页','/#home'));main.append(panel);form.onsubmit=event=>{event.preventDefault();if(!data.canEdit){message('公告权限已撤销，请刷新。');return;}save(form,'site-notice',{version:data.version,content:text.value},'首页公告已保存。');};
  }
  window.addEventListener('hashchange',()=>{if(!discard()){history.replaceState(null,'','#'+activeTab);return;}dirty=false;render();});
  window.addEventListener('community-account-change',()=>{dirty=false;render();});
  window.addEventListener('focus',()=>CommunityAuth.refresh().catch(error=>message(error.message)));
  window.addEventListener('beforeunload',event=>{if(dirty||writing){event.preventDefault();event.returnValue='';}});
  CommunityAuth.refresh().then(()=>render()).catch(error=>{render();message(error.message);});
})();
