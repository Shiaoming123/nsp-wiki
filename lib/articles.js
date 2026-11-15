import itemIds from './item-ids.json' with {type:'json'};
import pageIds from './wiki-page-ids.json' with {type:'json'};
const ids={item:new Set(itemIds),enemy:new Set(pageIds.enemy),quest:new Set(pageIds.quest)};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const categories=['新手入门','探索路线','敌怪应对','配装心得','任务指引','机制研究'];
const bad=(message,status=400)=>{throw Object.assign(Error(message),{status});};
function value(input,key,max,defaultValue=''){
  const v=input[key]??defaultValue;if(typeof v!=='string'||Array.from(v).length>max)bad(key+'内容格式不正确或超过长度限制');return v.replace(/\r\n?/g,'\n');
}
export function articleDocument(input,{publishing=false}={}){
  const d={title:value(input,'title',80).trim(),summary:value(input,'summary',200).trim(),body:value(input,'body',30000),category:input.category||'新手入门',version:value(input,'version',50).trim(),spoiler:input.spoiler||'none',videoEnabled:input.videoEnabled??false,videoUrl:value(input,'videoUrl',500),videoTitle:value(input,'videoTitle',80),videoAuthor:value(input,'videoAuthor',80),page:Number(input.page??1)};
  if(!categories.includes(d.category)||!['none','light'].includes(d.spoiler)||typeof d.videoEnabled!=='boolean')bad('文章设置不正确');
  if(d.videoEnabled&&publishing){let u;try{u=new URL(d.videoUrl);}catch{bad('请填写完整 B 站视频链接');}
    const match=/^\/video\/(BV[1-9A-HJ-NP-Za-km-z]{10})\/?$/.exec(u.pathname);
    if(u.protocol!=='https:'||!['bilibili.com','www.bilibili.com','m.bilibili.com'].includes(u.hostname)||u.port||u.username||u.password||!match||!Number.isInteger(d.page)||d.page<1||d.page>999)bad('B 站链接或分 P 不正确');
    d.videoUrl='https://www.bilibili.com/video/'+match[1]+'/';
  }
  return d;
}
export function articleReferences(body,{strict=false}={}){
  const refs=new Map();
  for(const m of body.matchAll(/\[\[(item|enemy|quest):([^|\]\n]+)\|([^\]\n]+)\]\]|\{\{(item|enemy|quest):([^|}\n]+)\|([^}\n]+)\}\}/g)){
    const kind=m[1]||m[4],id=m[2]||m[5];if(strict&&!ids[kind].has(id))bad('关联词条已失效或不存在，请检查正文');refs.set(kind+':'+id,{kind,id});
  }
  for(const m of body.matchAll(/!\[((?:\\.|[^\]\\])*)\]\(media:([^\s)]+)\)/g)){
    if(!uuid.test(m[2]))bad('图片引用不正确，请通过图片按钮上传');
    if(Array.from(m[1]).length>1000)bad('图片图注过长');refs.set('media:'+m[2],{kind:'media',id:m[2]});
  }
  if([...refs.values()].filter(r=>r.kind==='media').length>50)bad('每篇攻略最多关联50张图片');
  return [...refs.values()];
}
export async function articles(ctx){
  const {request,url,db,bucket,account,access,ownerId,now,json,jsonBody,rate,boundedBody,pngSize,moderateBatch}=ctx;
  const path=url.pathname,method=request.method,ms=Date.now();
  const login=()=>{if(!account)bad('请先登录',401);};
  const sameOrigin=()=>{if((!ctx.mirror&&request.headers.get('origin')!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')bad('请从本站提交',403);};
  if(method!=='GET'){sameOrigin();login();}
  const page=()=>{const offset=Number(url.searchParams.get('offset')||0);if(!Number.isSafeInteger(offset)||offset<0||offset>100000)bad('分页参数不正确');return offset;};
  const byId=id=>db.prepare('SELECT a.*,u.username FROM articles a JOIN accounts u ON u.id=a.author WHERE a.id=?').bind(id).first();
  function guard({muted=true,id=null,revision=null,owner=false,published=false}={}){
    const checks=['EXISTS(SELECT 1 FROM accounts WHERE id=?)'],args=[account.id];
    if(muted&&account.id!==ownerId){checks.push('NOT EXISTS(SELECT 1 FROM account_restrictions WHERE account=? AND muted_until>?)');args.push(account.id,now);}
    if(id){checks.push('EXISTS(SELECT 1 FROM articles WHERE id=?'+(owner?' AND author=?':'')+(revision!==null?' AND revision=?':'')+(published?" AND status='published'":'')+')');args.push(id);if(owner)args.push(account.id);if(revision!==null)args.push(revision);}
    return db.prepare("SELECT json_extract('{}',CASE WHEN "+checks.join(' AND ')+" THEN '$' ELSE 'article-write-conflict' END)").bind(...args);
  }
  async function atomic(statements,condition={}){try{return(await db.batch([guard(condition),...statements])).slice(1);}catch(e){if(/article-write-conflict/i.test(e.message))bad('文章或账号状态已变化，请重新读取，当前草稿不会被覆盖',409);throw e;}}
  async function mediaCheck(refs){for(const r of refs.filter(x=>x.kind==='media'))if(!await db.prepare('SELECT id FROM article_media WHERE id=? AND owner=?').bind(r.id,account.id).first())bad('图片不存在或不属于当前账号',403);}
  function dto(row,doc,{draft=false,summary=false}={}){
    const d=typeof doc==='string'?JSON.parse(doc):doc;
    const refs=articleReferences(d.body),images=Object.fromEntries(refs.filter(r=>r.kind==='media').map(r=>[r.id,{data:'/api/article-media/'+r.id}]));
    const video=d.videoEnabled?{bvid:/BV[1-9A-HJ-NP-Za-km-z]{10}/.exec(d.videoUrl)?.[0],page:d.page,title:d.videoTitle||'攻略视频',attribution:d.videoAuthor||'作者未填写视频署名'}:null;
    const result={...d,id:row.id,author:row.username,date:new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(row.published_at||row.updated)),minutes:Math.max(1,Math.ceil(Array.from(d.body).length/400)),created:row.created,updated:row.updated,publishedAt:row.published_at,status:row.status,revision:row.revision,publishedRevision:row.published_revision,canEdit:!!account&&row.author===account.id,canWithdraw:!!account&&(row.author===account.id||access.permissions.includes('content')),likes:Number(row.likes||0),liked:!!row.liked,bookmarked:!!row.bookmarked,images,video,cover:Object.keys(images).length?'/api/article-media/'+Object.keys(images)[0]:null,refs:refs.filter(r=>r.kind!=='media').map(r=>r.kind+':'+r.id),isSample:false,isDraft:draft};
    if(!draft){result.revision=row.published_revision;result.updated=row.published_at;if(!d.videoEnabled){delete result.videoUrl;delete result.videoTitle;delete result.videoAuthor;delete result.page;}}
    if(summary){delete result.body;delete result.images;}
    return result;
  }
  async function detail(row,draft=false){
    const counters=await db.prepare('SELECT (SELECT COUNT(*) FROM article_likes WHERE article=?) AS likes,EXISTS(SELECT 1 FROM article_likes WHERE article=? AND account=?) AS liked,EXISTS(SELECT 1 FROM article_bookmarks WHERE article=? AND account=?) AS bookmarked').bind(row.id,row.id,account?.id||'',row.id,account?.id||'').first();
    return dto({...row,...counters},draft?row.draft_json:row.published_json,{draft});
  }
  if(path==='/api/article-media'&&method==='POST'){
    await rate('article-media',3600,100,['account:'+account.id]);
    const bytes=await boundedBody(request,5*1024*1024+65536),form=await new Request(request.url,{method:'POST',headers:{'content-type':request.headers.get('content-type')||''},body:bytes}).formData(),file=form.get('image');
    if(!(file instanceof File)||file.type!=='image/png'||file.size>5*1024*1024)bad('请通过图片按钮上传5MiB以内的图片');
    const data=new Uint8Array(await file.arrayBuffer()),size=await pngSize(data),id=crypto.randomUUID(),key='articles/'+id+'.png';
    await bucket.put(key,data,{httpMetadata:{contentType:'image/png'}});
    try{await atomic([db.prepare('INSERT INTO article_media VALUES(?,?,?,?,?,?,?)').bind(id,account.id,key,size.width,size.height,data.length,ms)]);}catch(e){await bucket.delete(key).catch(()=>{});throw e;}
    return json({id,url:'/api/article-media/'+id,...size},201);
  }
  const media=/^\/api\/article-media\/([^/]+)$/.exec(path);
  if(media&&method==='GET'){
    if(!uuid.test(media[1]))bad('图片不存在',404);
    const row=await db.prepare("SELECT m.* FROM article_media m WHERE m.id=? AND (m.owner=? OR EXISTS(SELECT 1 FROM article_refs r JOIN articles a ON a.id=r.article WHERE r.kind='media' AND r.entity_id=m.id AND a.status='published'))").bind(media[1],account?.id||'').first();
    if(!row)bad('图片不存在',404);const file=await bucket.get(row.object_key);if(!file?.body)bad('图片不存在',404);
    return new Response(file.body,{headers:{'Content-Type':'image/png','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'"}});
  }
  if(path==='/api/articles'&&method==='GET'){
    const mine=url.searchParams.get('mine')==='1',saved=url.searchParams.get('saved')==='1';if(mine||saved)login();
    const conditions=[mine?'a.author=?':"a.status='published'"],args=mine?[account.id]:[];
    if(saved){conditions.push('EXISTS(SELECT 1 FROM article_bookmarks b WHERE b.article=a.id AND b.account=?)');args.push(account.id);}
    const category=url.searchParams.get('category');if(category){if(!categories.includes(category))bad('分类不正确');conditions.push("json_extract(a."+(mine?'draft_json':'published_json')+",'$.category')=?");args.push(category);}
    const q=(url.searchParams.get('q')||'').trim();if(Array.from(q).length>100)bad('搜索词过长');if(q){conditions.push('a.'+(mine?'draft_json':'published_json')+' LIKE ?');args.push('%'+q+'%');}
    const kind=url.searchParams.get('refKind'),id=url.searchParams.get('refId');if(kind||id){if(!ids[kind]?.has(id))bad('关联词条不存在');conditions.push('EXISTS(SELECT 1 FROM article_refs r WHERE r.article=a.id AND r.kind=? AND r.entity_id=?)');args.push(kind,id);}
    const sort=url.searchParams.get('sort')||'latest';if(!['latest','popular','recommended'].includes(sort))bad('排序不正确');
    const where=conditions.join(' AND '),order=sort==='popular'?'likes DESC,':'',offset=page();
    const rows=(await db.prepare('SELECT a.*,u.username,(SELECT COUNT(*) FROM article_likes l WHERE l.article=a.id) AS likes FROM articles a JOIN accounts u ON u.id=a.author WHERE '+where+' ORDER BY '+order+(mine?'a.updated':'a.published_at')+' DESC,a.id DESC LIMIT 21 OFFSET ?').bind(...args,offset).all()).results;
    const total=await db.prepare('SELECT COUNT(*) AS total FROM articles a WHERE '+where).bind(...args).first();
    return json({articles:rows.slice(0,20).map(r=>dto(r,mine?r.draft_json:r.published_json,{draft:mine,summary:true})),more:rows.length>20,total:total.total});
  }
  if(path==='/api/articles'&&method==='POST'){
    await rate('article-create',3600,100,['account:'+account.id]);const input=await jsonBody(131072),doc=articleDocument(input),refs=articleReferences(doc.body);await mediaCheck(refs);
    const id=crypto.randomUUID();await atomic([db.prepare('INSERT INTO articles(id,author,draft_json,created,updated) VALUES(?,?,?,?,?)').bind(id,account.id,JSON.stringify(doc),ms,ms)]);
    return json({article:await detail(await byId(id),true)},201);
  }
  const commentRoute=/^\/api\/article-comments\/([^/]+)$/.exec(path);
  if(commentRoute&&method==='DELETE'){
    const row=await db.prepare('SELECT * FROM article_comments WHERE id=?').bind(commentRoute[1]).first();if(!row)bad('评论不存在',404);
    if(row.author!==account.id&&!access.permissions.includes('content'))bad('只能删除自己的评论',403);
    const statements=[db.prepare('DELETE FROM article_comments WHERE id=?').bind(row.id)];
    if(row.author!==account.id){statements.unshift(db.prepare("INSERT INTO moderation_actions(id,admin,action,target,created,detail) VALUES(?,?,'delete_article_comment',?,?,'')").bind(crypto.randomUUID(),account.id,row.id,ms));await moderateBatch('content',statements);}else await atomic(statements,{muted:false});
    return json({ok:true});
  }
  const match=/^\/api\/articles\/([^/]+)(?:\/(publish|comments|like|bookmark))?$/.exec(path);
  if(!match||!uuid.test(match[1]))bad('攻略接口不存在',404);
  const [,id,action]=match,row=await byId(id);if(!row)bad('攻略不存在',404);
  if(method==='GET'&&!action){const draft=url.searchParams.get('draft')==='1';if(draft&&row.author!==account?.id||!draft&&row.status!=='published')bad('攻略不存在',404);return json({article:await detail(row,draft)});}
  if(action==='comments'){
    if(row.status!=='published')bad('攻略未发布或已撤下',404);
    if(method==='GET'){
      const rows=(await db.prepare('SELECT c.id,c.body,c.created,u.username AS author,c.author AS owner FROM article_comments c JOIN accounts u ON u.id=c.author WHERE c.article=? ORDER BY c.created DESC,c.id DESC LIMIT 31 OFFSET ?').bind(id,page()).all()).results;
      return json({comments:rows.slice(0,30).map(({owner,...c})=>({...c,canDelete:owner===account?.id||access.permissions.includes('content')})),more:rows.length>30});
    }
    if(method==='POST'){
      await rate('article-comment',600,30,['account:'+account.id]);const input=await jsonBody(),body=value(input,'body',500).trim();if(!body)bad('评论不能为空');const comment={id:crypto.randomUUID(),body,created:ms,author:account.username};
      await atomic([db.prepare('INSERT INTO article_comments VALUES(?,?,?,?,?)').bind(comment.id,id,account.id,body,ms)],{id,published:true});return json({comment},201);
    }
  }
  if(['like','bookmark'].includes(action)&&method==='PUT'){
    if(row.status!=='published')bad('攻略未发布或已撤下',404);const {active}=await jsonBody();if(typeof active!=='boolean')bad('状态不正确');await rate('article-reaction',60,120,['account:'+account.id]);const table=action==='like'?'article_likes':'article_bookmarks';
    await atomic([db.prepare(active?'INSERT OR IGNORE INTO '+table+' VALUES(?,?)':'DELETE FROM '+table+' WHERE article=? AND account=?').bind(id,account.id)],{id,published:true});return json({article:await detail(await byId(id))});
  }
  if(!action&&method==='DELETE'){
    if(row.author!==account.id&&!access.permissions.includes('content'))bad('不能撤下其他作者的文章',403);
    const statements=[db.prepare("UPDATE articles SET status='withdrawn',revision=revision+1,updated=? WHERE id=?").bind(ms,id),db.prepare('DELETE FROM article_refs WHERE article=?').bind(id)];
    if(row.author!==account.id){statements.unshift(db.prepare("INSERT INTO moderation_actions(id,admin,action,target,created,detail) VALUES(?,?,'withdraw_article',?,?,'')").bind(crypto.randomUUID(),account.id,id,ms));await moderateBatch('content',statements);}else await atomic(statements,{muted:false,id,owner:true});
    return json({ok:true});
  }
  if(row.author!==account?.id)bad('只能编辑自己的攻略',403);
  if((!action&&method==='PATCH')||(action==='publish'&&method==='POST')){
    const input=await jsonBody(131072);if(!Number.isSafeInteger(input.revision)||input.revision!==row.revision)bad('草稿已在其他页面更新，请重新读取；当前内容已保留',409);
    await rate('article-save',3600,1800,['account:'+account.id]);
    const doc=action==='publish'?articleDocument(JSON.parse(row.draft_json),{publishing:true}):articleDocument(input),refs=articleReferences(doc.body,{strict:action==='publish'});await mediaCheck(refs);
    if(action==='publish'&&(!doc.title.trim()||!doc.body.trim()))bad('请填写标题和正文后再发布');
    const serialized=JSON.stringify(doc),statements=[];
    if(!action)statements.push(db.prepare('UPDATE articles SET draft_json=?,revision=revision+1,updated=? WHERE id=?').bind(serialized,ms,id));
    else{
      statements.push(db.prepare("UPDATE articles SET draft_json=?,published_json=?,published_revision=revision+1,revision=revision+1,status='published',published_at=?,updated=? WHERE id=?").bind(serialized,serialized,ms,ms,id),db.prepare('INSERT INTO article_revisions VALUES(?,?,?,?)').bind(id,row.revision+1,serialized,ms),db.prepare('DELETE FROM article_refs WHERE article=?').bind(id));
      refs.forEach(r=>statements.push(db.prepare('INSERT INTO article_refs VALUES(?,?,?)').bind(id,r.kind,r.id)));
    }
    await atomic(statements,{id,owner:true,revision:row.revision});const next={...row,draft_json:serialized,revision:row.revision+1,updated:ms,...(action?{published_json:serialized,published_revision:row.revision+1,status:'published',published_at:ms}:{})};return json({article:await detail(next,!action)});
  }
  bad('攻略接口不存在',404);
}
