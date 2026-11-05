(() => {
  'use strict';
  const e = (tag, cls = '', text = '') => { const n = document.createElement(tag); n.className = cls; n.textContent = text; return n; };
  const button = (label, fn, cls = 'secondary-button') => { const b = e('button', cls, label); b.type = 'button'; b.onclick = fn; return b; };
  const field = (label, input) => { const n = e('label', 'post-field', label); n.append(input); return n; };
  const input = (max, placeholder) => { const n = e('input'); n.type = 'text'; n.maxLength = max * 2; n.placeholder = placeholder; n.required = true; return n; };
  const length = value => Array.from(value).length;
  let nickname = ''; try { nickname = localStorage.getItem('nsp-post-nickname') || ''; } catch {}
  function remember(value) { nickname = value; try { localStorage.setItem('nsp-post-nickname', value); } catch {} }
  const {api}=CommunityAuth;
  function renderBody(node,value){if(window.PostMarkdown)window.PostMarkdown.render(node,value);else node.textContent=value;}
  function markdownBody(value,cls='post-body'){const node=e('div',cls);renderBody(node,value);return node;}
  function markdownPreview(body){const box=e('details','post-preview'),content=markdownBody(body.value);box.append(e('summary','','Markdown 预览'),e('p','guide-note','支持标题、列表、加粗、引用、链接、代码和表格。格式符号计入字数；图片请使用榜单上传入口。'),content);body.addEventListener('input',()=>renderBody(content,body.value));return box;}
  const jsonWrite = (method, data) => ({method, headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
  function mount(root,options={}) {
    const workshopMode=options.kind==='workshop';let workshopDraft=null,capturing=false,publishing=false;
    const section = e('section', 'tier-posts'); section.id = workshopMode?'workshop-posts':'tier-posts';
    const heading = e('div', 'posts-heading'), title = e('div'); title.append(e('h2', '', workshopMode?'玩家配装攻略':'玩家夯拉榜'), e('p', 'guide-note', workshopMode?'分享配件、词条与工坊计算值。点赞多的攻略优先，同赞数展示最新发布。':'看看大家怎么排。点赞多的攻略优先，同赞数展示最新发布。'));
    let account=CommunityAuth.account;
    const authButton=button('登录 / 注册',()=>account?logout():signIn()), actions=e('div','posts-buttons');
    const adminButton=e('a','secondary-button post-admin-button','管理中心');adminButton.href='/admin/';adminButton.hidden=true;
    actions.append(adminButton,button(workshopMode?'发布配装':'发布攻略',()=>openComposer()),authButton,button('刷新帖子',()=>load(true)));
    heading.append(title, actions);
    const status = e('p', 'posts-status'); status.setAttribute('role', 'status');
    const feed = e('div', 'posts-feed'), more = button('加载更多', () => load(false)); more.hidden = true;
    section.append(heading, status, feed, more); root.append(section);
    let posts = [], loading = false, offset = 0, reloadAfterLoad = false, accountRevision = 0;
    function draw() {
      feed.replaceChildren();
      const columns = Array.from({length: innerWidth < 600 ? 1 : innerWidth < 1000 ? 3 : 4}, () => e('div', 'posts-column'));
      feed.append(...columns);
      posts.forEach((post, i) => columns[i % columns.length].append(card(post)));
    }
    let lastWidth = 0;
    const resize = new ResizeObserver(entries => { const width = entries[0].contentRect.width; if (width !== lastWidth) { lastWidth = width; draw(); } }); resize.observe(feed);
    // Disconnect when the Wiki replaces this page.
    const observer = new MutationObserver(() => { if (!section.isConnected) { resize.disconnect(); observer.disconnect(); } }); observer.observe(root, {childList:true});
    async function load(reset) {
      if (loading) { if(reset)reloadAfterLoad=true;return; } loading = true; more.disabled = true; status.textContent = '正在载入帖子…';
      const version=accountRevision;
      try {
        const data = await api('posts?kind='+(workshopMode?'workshop':'tier')+'&offset=' + (reset ? 0 : offset));
        if (!section.isConnected||version!==accountRevision) return;
        posts = reset ? data.posts : [...posts, ...data.posts.filter(post => !posts.some(p => p.id === post.id))]; draw();
        offset = (reset ? 0 : offset) + data.posts.length;
        more.hidden = !data.more; status.textContent = posts.length ? '' : (workshopMode?'还没有配装攻略，试着分享你的第一份方案。':'还没有攻略，来分享你的第一张夯拉榜。');
      } catch(error) { status.textContent = error.message; } finally { loading = false; more.disabled = false; if(reloadAfterLoad&&section.isConnected){reloadAfterLoad=false;load(true);} }
    }
    function likeButton(post,large=false) {
      const b = button('', async () => {
        b.disabled = true;
        try { const result = await api('posts/'+post.id+'/like',jsonWrite('PUT',{liked:!post.liked})); Object.assign(post,result); update(); await load(true); }
        catch(error) { status.textContent = error.message; } finally { b.disabled = false; }
      }, 'post-like'+(large?' post-like-large':''));
      const update = () => { b.textContent = (post.liked ? '♥ ' : '♡ ') + (large?(post.liked?'已点赞 · ':'点赞 · '):'') + post.likes; b.setAttribute('aria-pressed',String(!!post.liked)); b.setAttribute('aria-label',(post.liked?'取消点赞':'点赞')+'，'+post.likes+' 赞'); }; update(); return b;
    }
    function picture(post) { const img = e('img','post-image'); img.src = post.image; img.alt = post.title; img.width = post.width; img.height = post.height; img.loading = 'lazy'; return img; }
    function card(post) {
      const article = e('article', 'post-card'), open = button('', () => detail(post),'post-open');
      open.setAttribute('aria-label','查看攻略：'+post.title); open.append(picture(post),e('h3','',post.title),e('p','post-excerpt',window.PostMarkdown?window.PostMarkdown.plain(post.body):post.body));
      if(post.kind==='workshop'){try{const stored=JSON.parse(post.workshop);if(stored.schemaVersion===1&&stored.displaySnapshot?.validation?.complete===false)open.append(e('p','guide-note','未完成配装'));}catch{}}
      const footer = e('div','post-card-footer'); footer.append(e('span','post-author',post.nickname),likeButton(post));
      const comments = button('评论 '+post.comments, () => detail(post),'post-comment-link');footer.append(comments);article.append(open,footer);if(post.kind==='workshop')article.append(workshopActions(post,status));return article;
    }
    function workshopActions(post,notice,dialog){
      const actions=e('div','posts-buttons');
      for(const [label,handler]of [['应用到工坊',options.applyPostedBuild],['加入对比',options.comparePostedBuild]]){
        if(!handler)continue;
        const control=button(label,async()=>{control.disabled=true;try{
          const latest=await api('posts/'+post.id),readable=latest.post||latest;
          if(!section.isConnected)return;
          if(readable.kind!=='workshop'||!readable.workshop)throw Error('此帖没有可读取的结构化配装');
          await handler(JSON.parse(readable.workshop));dialog?.close();
        }catch(error){notice.textContent=error.message;}finally{control.disabled=false;}});
        actions.append(control);
      }
      return actions;
    }
    function modal(title) {
      const dialog = e('dialog','post-dialog'), heading = e('div','post-dialog-heading'), h = e('h2','',title); h.id = 'post-dialog-title-'+crypto.randomUUID(); dialog.setAttribute('aria-labelledby',h.id);
      const close = button('×',() => dialog.close(),'close-button'); close.setAttribute('aria-label','关闭'); heading.append(h,close); dialog.append(heading);
      dialog.addEventListener('close',() => dialog.remove()); dialog.addEventListener('click',event => { if (event.target===dialog) { const r=dialog.getBoundingClientRect(); if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom) dialog.close(); } });
      section.append(dialog); return dialog;
    }
    function showAccount(){authButton.textContent=account?'退出 · '+account.username:'登录 / 注册';adminButton.hidden=!account?.isAdmin&&!account?.permissions?.length;}
    async function requireLogin(next){const trigger=document.activeElement;try{account=await CommunityAuth.refresh();if(!section.isConnected||!trigger.isConnected||!trigger.getClientRects().length)return;showAccount();if(account)next();else signIn(next);}catch(error){if(section.isConnected)status.textContent=error.message;}}
    async function logout(){try{await CommunityAuth.logout();account=null;showAccount();}catch(error){status.textContent=error.message;}}
    function signIn(next=()=>{}){CommunityAuth.signIn(()=>{account=CommunityAuth.account;showAccount();next();},document.activeElement===document.body?authButton:document.activeElement);}
    async function normalize(file) {
      if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 10*1024*1024) throw Error('请选择 10 MB 以内的 PNG、JPEG 或 WebP 图片。');
      const bitmap = await createImageBitmap(file);
      try {
        const scale = Math.min(1,2000/bitmap.width,12000/bitmap.height,Math.sqrt(24000000/(bitmap.width*bitmap.height)));
        const canvas = document.createElement('canvas'); canvas.width = Math.max(1,Math.floor(bitmap.width*scale)); canvas.height = Math.max(1,Math.floor(bitmap.height*scale)); canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
        const blob = await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
        if(!blob || blob.size>5*1024*1024) throw Error('处理后的图片超过 5 MB，请换一张较小的图片。'); return blob;
      } finally { bitmap.close(); }
    }
    function compose() {
      const dialog = modal('分享你的夯拉榜'), form = e('form','post-form'), nick = input(24,'你的昵称'), title = input(80,'例如：我的开荒武器夯拉榜'), body = e('textarea');
      nick.value = nickname; body.rows=7; body.maxLength=2000; body.placeholder='说说你的排序理由、适用场景和玩法心得…';
      const count=e('span','post-counter','0 / 1000 字'); body.oninput=()=>{ count.textContent=length(body.value)+' / 1000 字'; body.setCustomValidity(length(body.value)>1000?'攻略文字最多 1000 字':''); };
      const choice=e('div','posts-buttons'), upload=e('input'); upload.type='file'; upload.accept='image/png,image/jpeg,image/webp'; upload.id='post-image-file';
      const current=button('使用当前榜单',()=>chooseCurrent()); current.disabled=!window.ItemTiers.hasRanked();
      choice.append(current,field('或上传榜单图片',upload));
      const preview=e('img','post-upload-preview'); preview.hidden=true; preview.alt='待发布的榜单预览';
      const message=e('p','posts-status'); message.setAttribute('role','status');
      const publish=e('button','secondary-button','发布攻略'); publish.type='submit'; publish.disabled=true;
      form.append(field('昵称（最多 24 字）',nick),field('标题（最多 80 字）',title),choice,preview,field('攻略文字（最多 1000 字，支持 Markdown）',body),count,markdownPreview(body),e('p','guide-note','发布后，图片、昵称和文字将展示给本站访问者。请勿填写个人联系方式或上传含私人信息的截图。'),message,publish); dialog.append(form); dialog.showModal();
      let image=null, rank=null, previewUrl=null, processing=false;
      dialog.addEventListener('close',()=>{ if(previewUrl) URL.revokeObjectURL(previewUrl); });
      function chooseCurrent(){const value=window.ItemTiers.ranking();chooseImage(window.ItemTiers.imageBlob(value),value);}
      async function chooseImage(operation,value=null) {
        processing=true; publish.disabled=true; current.disabled=true; upload.disabled=true; message.textContent='正在处理榜单图片…';
        try { const blob=await operation; if(!dialog.isConnected)return; if(blob.size>5*1024*1024)throw Error('图片超过 5 MB，请减少榜单物品或上传较小的图片。'); image=blob;rank=value; if(previewUrl)URL.revokeObjectURL(previewUrl); previewUrl=URL.createObjectURL(blob); preview.src=previewUrl; preview.hidden=false; message.textContent=value?'榜单已就绪，访客可以复制排序。':'图片已就绪；上传图片无法自动还原物品排序。'; }
        catch(error) { image=rank=null; preview.hidden=true; message.textContent=error.message||'图片读取失败，请重新选择。'; }
        finally { processing=false; publish.disabled=!image; current.disabled=!window.ItemTiers.hasRanked(); upload.disabled=false; }
      }
      upload.onchange=()=>{ const file=upload.files[0]; if(file)chooseImage(normalize(file)); };
      form.onsubmit=async event=>{
        event.preventDefault(); if(processing||!image||publish.disabled)return;
        if(length(nick.value.trim())>24||length(title.value.trim())>80||length(body.value)>1000){message.textContent='昵称、标题或攻略文字超过字数上限。';return;}
        publish.disabled=true; message.textContent='正在发布…';
        const data=new FormData(); data.set('nickname',nick.value.trim()); data.set('title',title.value.trim()); data.set('body',body.value); data.set('image',image,'tier-list.png');
        if(rank)data.set('ranking',JSON.stringify(rank));
        try { await api('posts',{method:'POST',body:data}); remember(nick.value.trim()); dialog.close(); await load(true); status.textContent='攻略已发布。'; }
        catch(error){if(!dialog.isConnected||!dialog.open)return;message.textContent=error.message; publish.disabled=false;if(error.status===401){account=null;signIn(()=>{if(dialog.isConnected&&dialog.open)form.requestSubmit();});}}
      };
      if(window.ItemTiers.hasRanked()) chooseCurrent();
    }
    async function openComposer(){
      if(!workshopMode){requireLogin(compose);return;}
      if(publishing){status.textContent='配装正在提交，请等待结果后再操作。';return;}
      if(capturing||section.querySelector('dialog[open]'))return;capturing=true;status.textContent='正在生成配装预览…';
      try{
        if(!workshopDraft)workshopDraft={share:await options.captureCurrentShare(),nickname,title:'',body:''};
        if(!section.isConnected)return;status.textContent='';await requireLogin(()=>composeWorkshop());
      }catch(error){if(section.isConnected&&error.name!=='AbortError')status.textContent=error.message;}
      finally{capturing=false;}
    }
    function composeWorkshop(){
      if(!section.isConnected||section.querySelector('dialog[open]')||!workshopDraft)return;
      const draft=workshopDraft,dialog=modal('分享你的配装'),form=e('form','post-form'),nick=input(24,'你的昵称'),title=input(80,'配装标题'),body=e('textarea');
      nick.value=draft.nickname;title.value=draft.title||draft.share.report.name;body.value=draft.body;body.rows=7;body.maxLength=2000;
      const preview=e('img','post-upload-preview'),message=e('p','posts-status'),publish=e('button','secondary-button','发布配装');publish.type='submit';message.setAttribute('role','status');
      const update=button('使用当前配装更新预览',async()=>{
        publish.disabled=update.disabled=true;message.textContent='正在更新预览…';
        try{const share=await options.captureCurrentShare();if(!dialog.isConnected)return;draft.share=share;showPreview();message.textContent='已同步更新配装、数值和图片。';}
        catch(error){if(dialog.isConnected)message.textContent=error.message;}
        finally{if(dialog.isConnected)publish.disabled=update.disabled=false;}
      });
      let previewUrl=null;function showPreview(){if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(draft.share.image.blob);preview.src=previewUrl;preview.alt='完整配装分享图预览';}
      function retain(){draft.nickname=nick.value;draft.title=title.value;draft.body=body.value;}for(const control of [nick,title,body])control.addEventListener('input',retain);
      dialog.addEventListener('close',()=>{retain();if(previewUrl)URL.revokeObjectURL(previewUrl);});showPreview();
      form.append(field('昵称（最多 24 字）',nick),field('标题（最多 80 字）',title),update,preview,field('攻略文字（最多 1000 字，支持 Markdown）',body),markdownPreview(body),message,publish);dialog.append(form);dialog.showModal();
      form.onsubmit=async event=>{
        event.preventDefault();if(publish.disabled)return;retain();if(length(nick.value.trim())>24||length(title.value.trim())>80||length(body.value)>1000){message.textContent='昵称、标题或攻略文字超过字数上限。';return;}
        const share=draft.share,data=new FormData();for(const [key,value]of Object.entries({kind:'workshop',nickname:nick.value.trim(),title:title.value.trim(),body:body.value,workshop:JSON.stringify(share.input),reportDigest:share.reportDigest}))data.set(key,value);data.set('image',share.image.blob,'workshop.png');
        publishing=true;publish.disabled=update.disabled=nick.disabled=title.disabled=body.disabled=true;message.textContent='正在发布配装…';
        try{await api('posts',{method:'POST',body:data});remember(nick.value.trim());dialog.close();workshopDraft=null;if(section.isConnected){await load(true);status.textContent='配装攻略已发布。';}}
        catch(error){const text=!error.status||error.status>=500?'提交结果暂不确定，可能已提交。请刷新帖子核对；草稿已保留。':error.message;if(section.isConnected)status.textContent=text;if(!dialog.isConnected)return;message.textContent=text;if(error.status===401){account=null;message.textContent+=' 请重新登录后确认发布。';}}
        finally{publishing=false;if(dialog.isConnected)publish.disabled=update.disabled=nick.disabled=title.disabled=body.disabled=false;}
      };
    }
    function workshopSummary(post){
      const summary=e('section','workshop-post-summary');
      try{const stored=JSON.parse(post.workshop);if(stored.schemaVersion!==1||stored.displaySnapshot?.reportVersion!==1)throw Error();const report=stored.displaySnapshot;
        summary.append(e('h3','','配装记录'),e('p','guide-note','工坊计算值 · 腐化100% · 效果倍率1 · 重量倍率1'),e('p','guide-note','EA Build '+report.sourceMeta.buildId+(report.sourceMeta.partialUpdate?'；'+report.sourceMeta.partialUpdate.buildId+' 局部更新：'+report.sourceMeta.partialUpdate.scope:'')));
        summary.append(e('p','',report.validation.complete?'装配完整':'未完成配装 · 待补齐必需件'));
        for(const missing of report.validation.missingRequired)summary.append(e('p','guide-note','待补齐 · '+missing.label));
        if(report.validation.kind!=='melee'&&!report.validation.fireable)summary.append(e('p','guide-note','当前不能开火'));
        for(const part of report.parts){const row=e('section','workshop-post-part');row.append(e('strong','',part.name+(part.ammoCount!==null?' × '+part.ammoCount:'')));for(const affix of part.affixes)row.append(e('p','workshop-affix-label',affix.name+' · '+affix.description));for(const text of part.nativeEffects)row.append(e('p','workshop-native-effect',text));summary.append(row);}
        for(const stat of report.stats)summary.append(e('p','',stat.label+' · '+stat.formatted));if(report.validation.kind!=='melee'){summary.append(e('p','','整套弹容 · '+(report.capacities.assembly.status==='known'?report.capacities.assembly.value:'待核实')));for(const c of report.capacities.containers)summary.append(e('p','',c.name+' · '+(c.capacity.status==='known'?c.capacity.value:'待核实')));summary.append(e('p','','弹药 · '+(report.capacities.ammo.map(a=>a.name+' · '+(a.count===null?'数量待核实':'× '+a.count)).join('；')||'未装填')));}
        for(const effect of report.conditionalEffects)summary.append(e('p','guide-note',effect.text));
      }catch{summary.append(e('p','guide-note','此版本的配装记录暂不支持解析，原始图片和攻略仍可阅读。'));}
      return summary;
    }
    function detail(post,onChange=async()=>{}) {
      const dialog=modal(post.title), content=e('div','post-detail'),summary=e('div','post-summary');summary.append(e('p','post-author',post.nickname+' · '+new Date(post.created*1000).toLocaleDateString('zh-CN')));if(post.body)summary.append(markdownBody(post.body));
      dialog.classList.add('post-reader-dialog');
      const story=e('section','post-story'),discussion=e('aside','post-discussion'),scroll=e('div','post-comment-scroll');
      story.setAttribute('aria-label',post.kind==='workshop'?'配装图片和攻略':'榜单图片和攻略');discussion.setAttribute('aria-label','帖子评论');scroll.setAttribute('aria-label','评论列表');story.tabIndex=scroll.tabIndex=0;
      const actions=e('div','post-detail-actions'),copy=button('复制排行',()=>{try{if(window.ItemTiers.applyRanking(JSON.parse(post.ranking))){dialog.close();document.getElementById('tier-board').scrollIntoView({block:'start'});document.getElementById('tier-clear').focus({preventScroll:true});}}catch(error){notice.textContent=error.message;}});
      copy.disabled=!post.ranking;actions.append(likeButton(post,true));if(post.kind==='workshop'){summary.append(workshopSummary(post));actions.append(workshopActions(post,{set textContent(value){notice.textContent=value;}},dialog));}else{actions.append(copy);if(!post.ranking)summary.append(e('p','guide-note','这篇帖子只有图片，无法自动复制排序。'));}summary.append(actions);
      if(post.canManage||post.canDelete){const management=e('div','posts-buttons post-management');if(post.canManage)management.append(button('修改帖子',()=>edit(post,dialog,onChange)));if(post.canDelete)management.append(button('删除帖子',async event=>{if(!confirm('删除这篇帖子及其评论、点赞？此操作无法撤销。'))return;const b=event.currentTarget;b.disabled=true;try{await api('posts/'+post.id,{method:'DELETE'});dialog.close();await load(true);await onChange();status.textContent='帖子已删除。';}catch(error){notice.textContent=error.message;}finally{b.disabled=false;}}));summary.append(management);}
      const commentsHeading=e('h3','post-comments-heading','评论 · '+post.comments);story.append(picture(post),summary);
      const list=e('div','post-comments'), notice=e('p','posts-status'); notice.setAttribute('role','status');
      const moreComments=button('更多评论',()=>loadComments(false)); moreComments.hidden=true;
      const form=e('form','post-form'), nick=input(24,'你的昵称'), body=e('textarea'); nick.value=nickname; body.required=true; body.rows=3; body.maxLength=1000; body.placeholder='分享你的看法…';
      form.id='post-comment-form-'+crypto.randomUUID();form.classList.add('post-comment-composer');nick.setAttribute('form',form.id);nick.setAttribute('aria-label','评论昵称（最多 24 字）');body.setAttribute('aria-label','评论（最多 500 字，支持 Markdown）');
      const discussionHeading=e('div','post-discussion-heading'),nicknameSettings=e('details','post-comment-identity'),nicknameToggle=e('summary'),nicknameField=field('昵称',nick);
      const updateNickname=()=>{nicknameToggle.textContent=nick.value.trim()?'昵称 · '+nick.value.trim():'设置昵称';};updateNickname();nick.addEventListener('input',updateNickname);nick.addEventListener('invalid',()=>nicknameSettings.open=true);
      nicknameSettings.append(nicknameToggle,nicknameField);nicknameSettings.addEventListener('focusout',()=>requestAnimationFrame(()=>{if(!nicknameSettings.contains(document.activeElement))nicknameSettings.open=false;}));
      nicknameSettings.addEventListener('keydown',event=>{if(event.key==='Escape'&&nicknameSettings.open){event.preventDefault();event.stopPropagation();nicknameSettings.open=false;nicknameToggle.focus();}});discussionHeading.append(commentsHeading,nicknameSettings);
      const messageField=field('评论 · 最多 500 字',body),preview=markdownPreview(body),previewPane=e('div','post-comment-preview-pane'),previewEmpty=e('p','guide-note post-comment-preview-empty','还没有评论内容，返回编辑后输入。'),previewToggle=preview.querySelector('summary');
      messageField.classList.add('post-comment-message');preview.classList.add('post-comment-preview');previewToggle.classList.add('secondary-button');previewPane.tabIndex=0;previewPane.setAttribute('role','region');previewPane.setAttribute('aria-label','评论 Markdown 预览');
      previewPane.append(previewEmpty,preview.querySelector('.post-body'),preview.querySelector('.guide-note'));preview.append(previewPane);const showPreviewEmpty=()=>previewEmpty.hidden=!!body.value.trim();showPreviewEmpty();body.addEventListener('input',showPreviewEmpty);
      preview.addEventListener('toggle',()=>previewToggle.textContent=preview.open?'返回编辑':'Markdown 预览');body.addEventListener('invalid',()=>preview.open=false);
      const submit=e('button','secondary-button','发送评论'); submit.type='submit';form.append(messageField,preview,submit);
      scroll.append(list,moreComments);discussion.append(discussionHeading,notice,scroll,form);content.append(story,discussion);dialog.append(content);dialog.showModal();
      let offset=0, fetching=false;
      async function loadComments(reset){
        if(fetching)return; fetching=true; moreComments.disabled=true;
        try{const data=await api('posts/'+post.id+'/comments?offset='+(reset?0:offset)); if(!dialog.isConnected)return; if(reset){list.replaceChildren();offset=0;} data.comments.forEach(comment=>{const row=e('article','post-comment'),meta=e('div','post-comment-meta'),time=e('time','',new Date(comment.created).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}));time.dateTime=new Date(comment.created).toISOString();const author=e('div','post-comment-author');author.append(e('strong','',comment.nickname));if(comment.username)author.append(e('span','post-comment-account','@'+comment.username));meta.append(author,time);if(account?.isAdmin||account?.permissions?.includes("content"))meta.append(button('删除评论',async event=>{if(!confirm('删除这条评论？此操作无法撤销。'))return;const b=event.currentTarget;b.disabled=true;try{await api('comments/'+comment.id,{method:'DELETE'});post.comments=Math.max(0,post.comments-1);commentsHeading.textContent='评论 · '+post.comments;await loadComments(true);await load(true);await onChange();}catch(error){notice.textContent=error.message;}finally{b.disabled=false;}},'post-delete-comment'));row.append(meta,markdownBody(comment.body,'post-comment-body'));list.append(row);}); offset+=data.comments.length;moreComments.hidden=!data.more;notice.textContent=offset?'':'还没有评论，聊聊你的看法。';}
        catch(error){notice.textContent=error.message;}finally{fetching=false;moreComments.disabled=false;}
      }
      form.onsubmit=async event=>{event.preventDefault();if(submit.disabled)return;if(!account){signIn(()=>{if(dialog.isConnected&&dialog.open)form.requestSubmit();});return;}if(length(nick.value.trim())>24||length(body.value)>500){notice.textContent='昵称最多 24 字，评论最多 500 字。';return;}submit.disabled=nick.disabled=body.disabled=true;
        try{await api('posts/'+post.id+'/comments',jsonWrite('POST',{nickname:nick.value.trim(),body:body.value}));remember(nick.value.trim());body.value='';body.dispatchEvent(new Event('input'));post.comments++;commentsHeading.textContent='评论 · '+post.comments;await loadComments(true);await load(true);}
        catch(error){if(!dialog.isConnected||!dialog.open)return;notice.textContent=error.message;if(error.status===401){account=null;signIn(()=>{if(dialog.isConnected&&dialog.open)form.requestSubmit();});}}finally{submit.disabled=nick.disabled=body.disabled=false;}
      }; loadComments(true);
    }
    function edit(post,detailDialog,onChange=async()=>{}){
      const dialog=modal('修改帖子'),form=e('form','post-form'),title=input(80,'标题'),body=e('textarea'),notice=e('p','posts-status'),submit=e('button','secondary-button','保存修改');title.value=post.title;body.value=post.body;body.rows=7;body.maxLength=2000;submit.type='submit';notice.setAttribute('role','status');form.append(field('标题（最多 80 字）',title),field('攻略文字（最多 1000 字，支持 Markdown）',body),markdownPreview(body),e('p','guide-note','这里修改标题和文字；要换图片或排行，请重新发布。'),notice,submit);dialog.append(form);dialog.showModal();
      form.onsubmit=async event=>{event.preventDefault();if(submit.disabled)return;submit.disabled=true;try{await api('posts/'+post.id,jsonWrite('PATCH',{title:title.value,body:body.value}));dialog.close();detailDialog.close();await load(true);await onChange();status.textContent='帖子已修改。';}catch(error){notice.textContent=error.message;}finally{submit.disabled=false;}};
    }
    const onAccount=()=>{accountRevision++;account=CommunityAuth.account;posts=[];offset=0;more.hidden=true;draw();section.querySelectorAll('.post-management,.post-delete-comment').forEach(node=>node.remove());section.querySelectorAll('.post-admin-dialog').forEach(dialog=>dialog.close());showAccount();load(true);};window.addEventListener('community-account-change',onAccount);const authObserver=new MutationObserver(()=>{if(!section.isConnected){window.removeEventListener('community-account-change',onAccount);authObserver.disconnect();}});authObserver.observe(root,{childList:true});showAccount();CommunityAuth.refresh().then(value=>{account=value;showAccount();}).catch(()=>{});
    const linked=location.hash.slice(1).split('/');
    const linkedHash=location.hash;
    if(linked[0]===(workshopMode?'workshop':'tiers')&&linked[1]==='post'&&/^[0-9a-f-]{36}$/i.test(linked[2]||''))CommunityAuth.refresh().then(async()=>{
      const revision=accountRevision;if(!section.isConnected||location.hash!==linkedHash)return;
      const data=await api('posts/'+linked[2]);if(section.isConnected&&location.hash===linkedHash&&revision===accountRevision)detail(data.post);
    }).catch(error=>{if(section.isConnected&&location.hash===linkedHash)status.textContent=error.message;});
    load(true);
    return {openComposer,dispose(){window.removeEventListener('community-account-change',onAccount);resize.disconnect();observer.disconnect();authObserver.disconnect();section.querySelectorAll('dialog[open]').forEach(dialog=>dialog.close());section.remove();}};
  }
  window.TierPosts={mount};
})();
