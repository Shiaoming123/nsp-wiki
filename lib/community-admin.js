import {permissions} from './community-access.js';
import {reject} from './auth.js';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses=['open','working','resolved','closed'];
function short(value,max,label){if(typeof value!=='string'||Array.from(value).length>max)reject(label+'格式不正确');return value.trim();}
export async function administration({request,url,db,account,access,ownerId,json,jsonBody,rate,batch,now}){
  const route=url.pathname.slice('/api/admin/'.length);
  if(!account)reject('请先登录',401);
  const requirePermission=p=>{if(!access.permissions.includes(p))reject('没有此项管理权限',403);};
  const offset=()=>{const n=url.searchParams.get('offset')||'0';if(!/^\d{1,6}$/.test(n))reject('分页参数不正确');return Number(n);};
  const query=short(url.searchParams.get('q')||'',80,'搜索');
  const list=async statement=>{const {results}=await statement.all();return json({items:results.slice(0,20),more:results.length>20});};
  if(request.method==='GET'&&route==='overview'){
    if(!access.permissions.length)reject('没有管理权限',403);
    const counts={};
    if(access.permissions.includes('content'))for(const [name,table]of [['posts','posts'],['comments','comments'],['itemComments','item_comments'],['affixComments','affix_comments'],['feedback','wiki_feedback'],['feedbackComments','wiki_feedback_comments']])counts[name]=(await db.prepare('SELECT COUNT(*) AS n FROM '+table).first()).n;
    if(access.permissions.includes('content'))counts.openFeedback=(await db.prepare("SELECT COUNT(*) AS n FROM wiki_feedback f LEFT JOIN feedback_workflow w ON w.feedback=f.id WHERE COALESCE(w.status,'open') IN ('open','working')").first()).n;
    if(access.permissions.includes('users')){counts.members=(await db.prepare('SELECT COUNT(*) AS n FROM accounts').first()).n;counts.muted=(await db.prepare('SELECT COUNT(*) AS n FROM account_restrictions WHERE muted_until>?').bind(now).first()).n;}
    return json({counts,permissions:access.permissions,isAdmin:access.isAdmin});
  }
  if(request.method==='GET'&&route==='members'){
    requirePermission('users');
    return list(db.prepare("SELECT a.id,a.username,a.created,COALESCE(r.muted_until,0) AS mutedUntil,COALESCE(r.reason,'') AS reason,COALESCE(r.version,0) AS version,COALESCE((SELECT group_concat(permission) FROM account_permissions WHERE account=a.id),'') AS permissions,a.id=? AS isOwner FROM accounts a LEFT JOIN account_restrictions r ON r.account=a.id WHERE instr(lower(a.username),lower(?))>0 ORDER BY a.created DESC,a.id DESC LIMIT 21 OFFSET ?").bind(ownerId||'',query,offset()));
  }
  if(request.method==='GET'&&route==='audit'){
    requirePermission('audit');
    return list(db.prepare('SELECT m.id,m.action,m.target,m.created,m.detail,a.username AS operator FROM moderation_actions m LEFT JOIN accounts a ON a.id=m.admin WHERE instr(m.action,?)>0 OR instr(m.target,?)>0 OR instr(COALESCE(a.username,\'\'),?)>0 ORDER BY m.created DESC,m.id DESC LIMIT 21 OFFSET ?').bind(query,query,query,offset()));
  }
  if(request.method==='GET'&&route==='content'){
    requirePermission('content');
    const kind=url.searchParams.get('kind')||'posts';
    const sources={
      posts:"SELECT p.id,p.title,p.body,p.nickname,a.username,p.created*1000 AS created,CASE WHEN p.kind='workshop' THEN '/#workshop/post/' ELSE '/#tiers/post/' END||p.id AS link,'posts/'||p.id AS deleteRoute FROM posts p LEFT JOIN accounts a ON a.id=p.author",
      comments:"SELECT c.id,p.title,c.body,c.nickname,a.username,c.created,CASE WHEN p.kind='workshop' THEN '/#workshop/post/' ELSE '/#tiers/post/' END||p.id AS link,'comments/'||c.id AS deleteRoute FROM comments c JOIN posts p ON p.id=c.post LEFT JOIN accounts a ON a.id=c.author",
      'item-comments':"SELECT c.id,'物品 · '||c.item AS title,c.body,c.nickname,a.username,c.created,'/#item/'||c.item AS link,'item-comments/'||c.id AS deleteRoute FROM item_comments c JOIN accounts a ON a.id=c.author",
      'affix-comments':"SELECT c.id,'词条 · '||c.affix AS title,c.body,c.nickname,a.username,c.created,'/#affix/'||c.affix AS link,'affix-comments/'||c.id AS deleteRoute FROM affix_comments c JOIN accounts a ON a.id=c.author",
      'feedback-comments':"SELECT c.id,f.title,c.body,c.nickname,a.username,c.created,'/#feedback/'||f.id AS link,'feedback-comments/'||c.id AS deleteRoute FROM wiki_feedback_comments c JOIN wiki_feedback f ON f.id=c.feedback JOIN accounts a ON a.id=c.author",
    };
    if(!Object.hasOwn(sources,kind))reject('内容类型不正确');
    return list(db.prepare('SELECT * FROM ('+sources[kind]+') WHERE instr(title,?)>0 OR instr(body,?)>0 OR instr(COALESCE(username,\'\'),?)>0 ORDER BY created DESC,id DESC LIMIT 21 OFFSET ?').bind(query,query,query,offset()));
  }
  if(request.method==='GET'&&route==='feedback-comments'){
    requirePermission('content');
    return list(db.prepare('SELECT c.id,c.feedback,c.nickname,c.body,c.created,a.username,f.title AS title FROM wiki_feedback_comments c JOIN wiki_feedback f ON f.id=c.feedback JOIN accounts a ON a.id=c.author ORDER BY c.created DESC,c.id DESC LIMIT 21 OFFSET ?').bind(offset()));
  }
  if(request.method==='GET'&&route==='feedback-workflow'){
    requirePermission('content');const status=url.searchParams.get('status')||'';if(status&&!statuses.includes(status))reject('反馈状态不正确');
    return list(db.prepare("SELECT f.id,f.nickname,f.title,f.body,f.route,f.category,f.created,a.username,COALESCE(w.status,'open') AS status,COALESCE(w.note,'') AS note,COALESCE(w.version,0) AS version FROM wiki_feedback f JOIN accounts a ON a.id=f.author LEFT JOIN feedback_workflow w ON w.feedback=f.id WHERE (instr(f.title,?)>0 OR instr(f.body,?)>0 OR instr(a.username,?)>0) AND (?='' OR COALESCE(w.status,'open')=?) ORDER BY f.created DESC,f.id DESC LIMIT 21 OFFSET ?").bind(query,query,query,status,status,offset()));
  }
  const member=route.match(/^members\/([^/]+)\/(permissions|restriction)$/),feedback=route.match(/^feedback-workflow\/([^/]+)$/);
  if(request.method==='GET'&&feedback){
    requirePermission('content');if(!uuid.test(feedback[1]))reject('反馈不存在',404);
    const item=await db.prepare("SELECT COALESCE(w.version,0) AS version,COALESCE(w.status,'open') AS status,COALESCE(w.note,'') AS note FROM wiki_feedback f LEFT JOIN feedback_workflow w ON w.feedback=f.id WHERE f.id=?").bind(feedback[1]).first();if(!item)reject('反馈不存在',404);return json(item);
  }
  const singleMember=route.match(/^members\/([^/]+)$/);
  if(request.method==='GET'&&singleMember){
    requirePermission('users');if(!uuid.test(singleMember[1]))reject('账号不存在',404);
    const item=await db.prepare("SELECT COALESCE(r.version,0) AS version,COALESCE(r.muted_until,0) AS mutedUntil,COALESCE((SELECT group_concat(permission) FROM account_permissions WHERE account=a.id),'') AS permissions FROM accounts a LEFT JOIN account_restrictions r ON r.account=a.id WHERE a.id=?").bind(singleMember[1]).first();if(!item)reject('账号不存在',404);return json(item);
  }
  if(request.method!=='PUT'||(!member&&!feedback))reject('接口不存在',404);
  const data=await jsonBody(4096);if(!Number.isSafeInteger(data.version)||data.version<0||data.version>=Number.MAX_SAFE_INTEGER)reject('版本不正确');
  await rate('admin-settings',600,30,['account:'+account.id]);
  const audit=(action,target,detail)=>db.prepare('INSERT INTO moderation_actions(id,admin,action,target,created,detail) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),account.id,action,target,now,detail);
  if(feedback){
    requirePermission('content');if(!uuid.test(feedback[1]))reject('反馈不存在',404);
    if(!statuses.includes(data.status))reject('反馈状态不正确');const note=short(data.note,500,'处理备注');
    if(!await db.prepare('SELECT id FROM wiki_feedback WHERE id=?').bind(feedback[1]).first())reject('反馈不存在',404);
    const statements=[db.prepare("SELECT json(CASE WHEN COALESCE((SELECT version FROM feedback_workflow WHERE feedback=?),0)=? THEN 'true' ELSE 'version-conflict' END)").bind(feedback[1],data.version),
      db.prepare('INSERT INTO feedback_workflow(feedback,status,note,version,updated_by,updated_at) VALUES(?,?,?,1,?,?) ON CONFLICT(feedback) DO UPDATE SET status=excluded.status,note=excluded.note,version=version+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(feedback[1],data.status,note,account.id,now),audit('update_feedback_status',feedback[1],JSON.stringify({status:data.status,note}))];
    try{await batch('content',statements);}catch(error){if(/malformed JSON/i.test(error.message))reject('反馈已更新，请刷新；草稿已保留',409);throw error;}
    return json({ok:true});
  }
  const id=member[1],grant=member[2]==='permissions';requirePermission('users');
  if(grant&&!access.isAdmin)reject('只有站主可以分配权限',403);
  if(!uuid.test(id)||!await db.prepare('SELECT id FROM accounts WHERE id=?').bind(id).first())reject('账号不存在',404);
  if(id===ownerId||id===account.id)reject('不能修改站主或自己的管理状态',403);
  const reason=short(data.reason,200,'操作原因');if(!reason)reject('请填写操作原因');
  const statements=[db.prepare("SELECT json(CASE WHEN COALESCE((SELECT version FROM account_restrictions WHERE account=?),0)=? THEN 'true' ELSE 'version-conflict' END)").bind(id,data.version)];
  if(!access.isAdmin)statements.push(db.prepare("SELECT json(CASE WHEN NOT EXISTS(SELECT 1 FROM account_permissions WHERE account=?) THEN 'true' ELSE 'protected-member' END)").bind(id));
  if(grant){
    if(!Array.isArray(data.permissions)||data.permissions.length>permissions.length||new Set(data.permissions).size!==data.permissions.length||data.permissions.some(p=>!permissions.includes(p)))reject('权限列表不正确');
    if(data.permissions.length&&await db.prepare('SELECT account FROM account_restrictions WHERE account=? AND muted_until>?').bind(id,now).first())reject('请先解除禁言，再授予管理权限',409);
    if(data.permissions.length)statements.push(db.prepare("SELECT json(CASE WHEN NOT EXISTS(SELECT 1 FROM account_restrictions WHERE account=? AND muted_until>?) THEN 'true' ELSE 'muted-member' END)").bind(id,now));
    statements.push(db.prepare('DELETE FROM account_permissions WHERE account=?').bind(id));
    for(const permission of data.permissions)statements.push(db.prepare('INSERT INTO account_permissions(account,permission) VALUES(?,?)').bind(id,permission));
    statements.push(db.prepare("INSERT INTO account_restrictions(account,muted_until,reason,version,updated_by,updated_at) VALUES(?,0,'',1,?,?) ON CONFLICT(account) DO UPDATE SET version=version+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at").bind(id,account.id,now));
    statements.push(audit('update_permissions',id,JSON.stringify({permissions:data.permissions,reason})));
  }else{
    if(!Number.isSafeInteger(data.mutedUntil)||data.mutedUntil<0||(data.mutedUntil!==0&&(data.mutedUntil<=now||data.mutedUntil>now+30*86400)))reject('禁言时间需在未来 30 天内，或为 0（解禁）');
    // All staff are protected; revoke their permissions before applying a member restriction.
    statements.push(db.prepare("SELECT json(CASE WHEN NOT EXISTS(SELECT 1 FROM account_permissions WHERE account=?) THEN 'true' ELSE 'protected-member' END)").bind(id));
    statements.push(db.prepare('INSERT INTO account_restrictions(account,muted_until,reason,version,updated_by,updated_at) VALUES(?,?,?,1,?,?) ON CONFLICT(account) DO UPDATE SET muted_until=excluded.muted_until,reason=excluded.reason,version=version+1,updated_by=excluded.updated_by,updated_at=excluded.updated_at').bind(id,data.mutedUntil,reason,account.id,now));
    statements.push(audit(data.mutedUntil?'mute_member':'unmute_member',id,JSON.stringify({mutedUntil:data.mutedUntil,reason})));
  }
  try{await batch('users',statements);}catch(error){if(/malformed JSON/i.test(error.message))reject('账号状态已变化或是受保护的管理员，请刷新；草稿已保留',409);throw error;}
  return json({ok:true});
}
