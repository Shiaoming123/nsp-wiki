(() => {
  'use strict';
  if(window.WIKI_STATIC_BUILD)return;
  const host=document.getElementById('site-notice');
  if(!host)return;
  const make=(tag,cls,text)=>{const node=document.createElement(tag);if(cls)node.className=cls;if(text)node.textContent=text;return node;};
  const heading=make('div','site-notice-heading'),title=make('h2','','站主提醒'),edit=make('button','secondary-button','编辑提醒'),content=make('p','site-notice-content'),status=make('p','site-notice-status'),form=make('form','site-notice-editor'),field=make('label','','提醒内容'),input=make('textarea'),actions=make('div','site-notice-actions'),save=make('button','secondary-button','保存提醒'),cancel=make('button','secondary-button','取消');
  title.id='site-notice-title';edit.type=cancel.type='button';save.type='submit';edit.hidden=form.hidden=true;input.rows=4;input.setAttribute('aria-describedby','site-notice-help');
  const help=make('p','guide-note','最多 2000 字；留空保存可清空提醒。'),helpId='site-notice-help';help.id=helpId;
  const disclosure=make('details','notice-disclosure'),summary=make('summary'),body=make('div','notice-body');
  summary.append(title);field.append(input);actions.append(save,cancel);form.append(field,help,actions);heading.append(edit);body.append(heading,content,form,status);disclosure.append(summary,body);host.append(disclosure);status.setAttribute('role','status');
  let current=null,ticket=0,editing=false,saving=false,loadFailed=false;
  summary.addEventListener('click',event=>{if(disclosure.open&&(editing||saving||loadFailed))event.preventDefault();});
  disclosure.addEventListener('toggle',()=>{if(!disclosure.open&&(editing||saving||loadFailed))disclosure.open=true;});
  function render(){
    host.hidden=!current?.content&&!current?.canEdit;
    content.textContent=current?.content||'暂无提醒。';edit.hidden=!current?.canEdit||editing;
  }
  async function load(){
    if(editing)return;
    const request=++ticket;
    try{await CommunityAuth.refresh();if(request!==ticket)return;const data=await CommunityAuth.api('site-notice');if(request!==ticket)return;current=data;loadFailed=false;status.textContent='';render();}
    catch{if(request!==ticket)return;host.hidden=false;edit.hidden=true;loadFailed=true;disclosure.open=true;status.textContent='提醒暂时无法载入，请稍后刷新。';}
  }
  function closeEditor(){editing=false;form.hidden=true;input.value='';status.textContent='';render();edit.focus({preventScroll:true});}
  edit.onclick=()=>{if(!current?.canEdit)return;ticket++;editing=true;disclosure.open=true;input.value=current.content;form.hidden=false;edit.hidden=true;status.textContent='';input.focus();};
  cancel.onclick=()=>{if(saving)return;closeEditor();load();};
  form.onsubmit=async event=>{
    event.preventDefault();if(saving||!editing||!current?.canEdit)return;
    if(Array.from(input.value).length>2000){status.textContent='提醒最多 2000 字，草稿已保留。';return;}
    const request=++ticket;save.disabled=cancel.disabled=input.disabled=saving=true;status.textContent='正在保存…';
    try{const data=await CommunityAuth.api('site-notice',CommunityAuth.write('PUT',{content:input.value,version:current.version}));if(request!==ticket)return;current=data;closeEditor();status.textContent='提醒已保存。';}
    catch(error){if(request!==ticket)return;status.textContent=error.status===409?'提醒已被其他页面更新，草稿已保留。请取消后查看最新内容，再编辑。':error.message;}
    finally{save.disabled=cancel.disabled=input.disabled=saving=false;}
  };
  window.addEventListener('community-account-change',()=>{ticket++;current=null;editing=false;form.hidden=true;input.value='';edit.hidden=true;load();});
  window.addEventListener('focus',()=>{if(!editing)load();});
  load();
})();
