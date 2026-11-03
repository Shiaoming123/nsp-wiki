(() => {
  'use strict';
  const e=(tag,cls='',text='')=>{const n=document.createElement(tag);n.className=cls;n.textContent=text;return n;};
  let account=null,revision=0,readSequence=0,sessionRead=null;
  // Share only pending reads; private counts and permissions must refresh after each completed request.
  const reads=new Map();
  function api(path,options={}){
    const shared=Object.keys(options).length===0;
    if(!shared&&options.method&&options.method!=='GET')reads.clear();
    if(shared&&reads.has(path))return reads.get(path).then(structuredClone);
    const request=(async()=>{const r=await fetch('/api/'+path,{credentials:'same-origin',cache:'no-store',...options});let data;try{data=await r.json();}catch{throw Error('互动服务暂时不可用，请稍后重试。');}if(!r.ok)throw Object.assign(Error(data.error||'请求失败，请重试。'),{status:r.status});return data;})();
    if(!shared)return request;
    reads.set(path,request);
    const clear=()=>{if(reads.get(path)===request)reads.delete(path);};request.then(clear,clear);
    return request.then(structuredClone);
  }
  const write=(method,data)=>({method,headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  function set(value,force=false){const changed=account?.username!==value?.username||account?.isAdmin!==value?.isAdmin;account=value;revision++;if(changed||force){reads.clear();window.dispatchEvent(new Event('community-account-change'));}}
  function refresh(){if(sessionRead)return sessionRead;const ticket=++readSequence,version=revision;const pending=api('auth/session').then(data=>{if(ticket===readSequence&&version===revision)set(data.account);return account;});sessionRead=pending;const clear=()=>{if(sessionRead===pending)sessionRead=null;};pending.then(clear,clear);return pending;}
  function invalidate(){revision++;readSequence++;sessionRead=null;reads.clear();}
  function notify(){try{localStorage.setItem('nsp-community-account-change',crypto.randomUUID());}catch{}}
  async function logout(){invalidate();await api('auth/logout',write('POST',{}));set(null,true);notify();}
  window.addEventListener('storage',event=>{if(event.key==='nsp-community-account-change'){invalidate();set(null,true);refresh().catch(()=>{});}});
  function signIn(next=()=>{},returnFocus=document.activeElement){
    const existing=document.querySelector('.auth-dialog[open]');if(existing){existing.querySelector('input')?.focus();return;}
    const dialog=e('dialog','post-dialog auth-dialog'),heading=e('div','post-dialog-heading'),title=e('h2','','登录'),close=e('button','close-button','×'),form=e('form','post-form'),username=e('input'),password=e('input'),notice=e('p','posts-status'),submit=e('button','secondary-button auth-submit','登录'),switchMode=e('button','secondary-button auth-switch','没有账号？注册一个'),actions=e('div','auth-actions');
    title.id='community-login-'+crypto.randomUUID();dialog.setAttribute('aria-labelledby',title.id);close.type=switchMode.type='button';close.setAttribute('aria-label','关闭');close.onclick=()=>dialog.close();heading.append(title,close);
    username.type='text';username.required=password.required=true;username.maxLength=48;username.autocomplete='username';username.autofocus=true;password.type='password';password.autocomplete='current-password';password.maxLength=72;password.minLength=10;submit.type='submit';notice.setAttribute('role','status');notice.setAttribute('aria-live','polite');notice.id=title.id+'-status';username.setAttribute('aria-describedby',notice.id);password.setAttribute('aria-describedby',notice.id);
    form.append(e('p','auth-intro','本站是独立新站，旧账号和内容未迁移。旧用户请重新注册；同名账号不会继承旧站身份。'));
    for(const [label,input] of [['账号（3–24 字，中文、字母或数字等）',username],['密码（至少 10 字符，最多 72 字节）',password]]){const field=e('label','post-field',label);field.append(input);form.append(field);}
    actions.append(submit,switchMode);form.append(notice,actions,e('p','guide-note','看攻略无需登录；发帖、评论和给评论点赞需要登录。暂不支持找回密码，请妥善保存。'));dialog.append(heading,form);(document.querySelector('.item-community:popover-open')||document.body).append(dialog);
    let active=true,register=false;
    const live=()=>active&&dialog.isConnected&&dialog.open;
    dialog.addEventListener('close',()=>{active=false;password.value='';dialog.remove();if(document.querySelector('.auth-dialog[open]'))return;const target=returnFocus?.isConnected&&returnFocus.getClientRects().length?returnFocus:document.querySelector('#main-content,.site-header a');if(target){if(!target.matches('a,button,input,select,textarea,[tabindex]'))target.tabIndex=-1;target.focus({preventScroll:true});}});
    dialog.addEventListener('cancel',event=>{event.preventDefault();dialog.close();});
    dialog.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const targets=[...dialog.querySelectorAll('button,input,select,textarea,a[href],[tabindex]')].filter(node=>!node.disabled&&node.tabIndex>=0&&node.getClientRects().length),first=targets[0],last=targets.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}});dialog.showModal();
    switchMode.onclick=()=>{register=!register;title.textContent=register?'创建账号':'登录';submit.textContent=register?'注册并登录':'登录';switchMode.textContent=register?'已有账号？去登录':'没有账号？注册一个';password.autocomplete=register?'new-password':'current-password';notice.textContent='';dialog.dataset.state='idle';username.removeAttribute('aria-invalid');password.removeAttribute('aria-invalid');};
    form.onsubmit=async event=>{event.preventDefault();if(submit.disabled||!live())return;submit.disabled=switchMode.disabled=username.disabled=password.disabled=true;form.setAttribute('aria-busy','true');dialog.dataset.state='loading';submit.textContent=register?'正在注册…':'正在登录…';notice.textContent=submit.textContent;try{invalidate();const data=await api('auth/'+(register?'register':'login'),write('POST',{username:username.value,password:password.value}));
      // Closing dismisses this flow, but the server may already have set its session cookie.
      set(data.account);notify();if(live()){dialog.close();await next();}
    }catch(error){if(live()){notice.textContent=error.message;dialog.dataset.state='error';if(error.status===401){username.setAttribute('aria-invalid','true');password.setAttribute('aria-invalid','true');}}}finally{if(live()){submit.disabled=switchMode.disabled=username.disabled=password.disabled=false;form.removeAttribute('aria-busy');submit.textContent=register?'注册并登录':'登录';password.value='';}}};
  }
  async function requireLogin(next,returnFocus=document.activeElement){const value=await refresh();if(returnFocus&&(!returnFocus.isConnected||!returnFocus.getClientRects().length))return;if(value)return next();signIn(next,returnFocus);}
  window.CommunityAuth={api,write,refresh,logout,signIn,requireLogin,get account(){return account;}};
})();
