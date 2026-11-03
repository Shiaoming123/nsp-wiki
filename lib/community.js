import itemIds from './item-ids.json' with {type:'json'};
import affixIds from './affix-ids.json' with {type:'json'};
import pageIds from './wiki-page-ids.json' with {type:'json'};
const knownAffixes=new Set(affixIds);
const feedbackPages=new Set(['','#home','#items','#quests','#enemies','#mirror','#corruption','#maps','#tiers','#feedback','#workshop','#npcs','#recipes','#mechanics']);
function validFeedbackRoute(route){
  if(feedbackPages.has(route))return true;
  if(route.startsWith('#feedback/'))return uuid.test(route.slice(10));
  const match=route.match(/^#(item|affix|quest|enemy|maps|npc|recipe|mechanic)\/([^/?#]+)$/);
  if(!match)return false;
  let id;try{id=decodeURIComponent(match[2]);}catch{return false;}
  return match[1]==='item'?knownItems.has(id):match[1]==='affix'?knownAffixes.has(id):(pageIds[match[1]]||[]).includes(id);
}
import { digest, accountName, passwordHash, passwordMatches, currentAccount, newSession, sessionCookie, sessionToken } from './auth.js';
import {verifyMirror} from './mirror-auth.js';
import {validateWorkshopPost} from './workshop-post.js';
const knownItems=new Set(itemIds), tierKeys=['strong','great','good','normal','weak'];
const MAX_IMAGE = 5 * 1024 * 1024;
const MAX_POST = MAX_IMAGE + 128 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const crcTable = Uint32Array.from({length:256}, (_, n) => { for(let i=0;i<8;i++) n=(n&1)?0xedb88320^(n>>>1):n>>>1; return n>>>0; });
function crc(bytes) { let value=0xffffffff; for(const byte of bytes) value=crcTable[(value^byte)&255]^(value>>>8); return (value^0xffffffff)>>>0; }
const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status}); };
export function ranking(value) {
  if(value===null)return null;
  if(value?.version!==1||!value.rows||typeof value.rows!=='object'||Object.keys(value.rows).length!==5)fail('排行数据格式不正确');
  const seen=new Set(), rows={};
  for(const key of tierKeys){const ids=value.rows[key];if(!Array.isArray(ids)||ids.length>knownItems.size)fail('排行数据格式不正确');rows[key]=ids.map(id=>{if(typeof id!=='string'||!knownItems.has(id)||seen.has(id))fail('排行包含重复或未知物品');seen.add(id);return id;});}
  if(!seen.size)fail('排行不能为空');
  return JSON.stringify({version:1,rows});
}
function text(value, max, label, required = true, preserveWhitespace = false) {
  if (typeof value !== 'string') fail(label + '格式不正确');
  value = value.replace(/\r\n?/g,'\n');
  if (!preserveWhitespace) value = value.trim();
  if ((required && !value.trim()) || Array.from(value).length > max) fail(label + '最多 ' + max + ' 字' + (required ? '，不能为空' : ''));
  return value;
}
async function boundedBody(request, limit) {
  if (Number(request.headers.get('content-length')) > limit) fail('上传内容过大', 413);
  const reader = request.body?.getReader(); if (!reader) fail('内容不能为空');
  let size = 0; const chunks = [];
  try {
    for (;;) { const {done, value} = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel().catch(() => {}); fail('上传内容过大', 413); } chunks.push(value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
async function discardUnusedBody(request) {
  if(!request.body||request.bodyUsed||request.body.locked)return;
  const reader=request.body.getReader(),cancel=()=>{void reader.cancel().catch(()=>{});};
  const timer=setTimeout(cancel,250);
  try {
    if(Number(request.headers.get('content-length'))>16384){cancel();return;}
    let size=0;for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>16384){cancel();break;}}
  }catch{}finally{clearTimeout(timer);reader.releaseLock();}
}
export async function pngSize(bytes) {
  if (bytes.length < 45 || [137,80,78,71,13,10,26,10].some((n, i) => bytes[i] !== n)) fail('请上传有效的 PNG 图片');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8, width = 0, height = 0, channels = 0; const data = [];
  while (at + 12 <= bytes.length) {
    const size = view.getUint32(at), type = String.fromCharCode(...bytes.slice(at + 4, at + 8));
    if (at + size + 12 > bytes.length) fail('图片文件不完整');
    if (crc(bytes.subarray(at+4,at+8+size)) !== view.getUint32(at+8+size)) fail('图片校验失败');
    if (at === 8) {
      if (type !== 'IHDR' || size !== 13 || bytes[at+16] !== 8 || ![2,6].includes(bytes[at+17]) || bytes[at+18] || bytes[at+19] || bytes[at+20]) fail('请使用本站上传入口处理图片');
      width = view.getUint32(at + 8); height = view.getUint32(at + 12); channels = bytes[at+17] === 6 ? 4 : 3;
    } else if(type === 'IHDR') fail('图片头重复');
    if (type === 'IDAT' && size) data.push(bytes.subarray(at+8,at+8+size));
    at += size + 12;
    if (type === 'IEND') {
      if (size || at !== bytes.length || !data.length || !width || !height || width > 2000 || height > 12000 || width * height > 24000000) fail('图片尺寸不支持（最大 2000 × 12000）');
      const stride = width*channels+1, expected = stride*height;
      const reader = new Blob(data).stream().pipeThrough(new DecompressionStream('deflate')).getReader(); let total=0;
      try {
        for(;;) { const {done,value}=await reader.read();if(done)break;if(total+value.length>expected)fail('图片像素数据不正确');for(let offset=(stride-total%stride)%stride;offset<value.length;offset+=stride)if(value[offset]>4)fail('图片像素数据不正确');total+=value.length; }
        if(total!==expected)fail('图片像素数据不完整');
      } catch { await reader.cancel().catch(()=>{}); fail('图片无法读取，请重新上传'); }
      finally { reader.releaseLock(); }
      return {width, height};
    }
  }
  fail('图片文件不完整');
}
export async function community(request, env) {
  const headers = {'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'};
  const json = (data, status = 200) => Response.json(data, {status, headers});
  try {
    const mirror = await verifyMirror(request, env);
    if (mirror) request = mirror.request;
    const url = new URL(request.url), path = url.pathname;
    if (!env.DB || !env.BUCKET) fail('帖子服务暂时不可用，请稍后重试', 503);
    if (request.method !== 'GET' && Number(request.headers.get('content-length')) > (path==='/api/posts'?MAX_POST:MAX_IMAGE+65536)) fail('上传内容过大',413);
    let visitor = request.headers.get('cookie')?.match(/(?:^|;\s*)nsp-visitor=([^;]+)/)?.[1];
    if (!visitor || !uuid.test(visitor)) {
      visitor = crypto.randomUUID();
      headers['Set-Cookie'] = 'nsp-visitor=' + visitor + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000' + (url.protocol === 'https:' ? '; Secure' : '');
    }
    const db = env.DB;
    const now=Math.floor(Date.now()/1000), account=await currentAccount(request,db,now);
    async function jsonBody(limit=16384){let value;try{value=JSON.parse(new TextDecoder().decode(await boundedBody(request,limit)));}catch(error){if(error.status)throw error;fail('内容格式不正确');}if(!value||typeof value!=='object'||Array.isArray(value))fail('内容格式不正确');return value;}
    async function rate(action,seconds,max,extra=[]){
      const ip=mirror?.ip || request.headers.get('cf-connecting-ip'), slot=Math.floor(now/seconds), keys=[visitor,...(ip?['ip:'+await digest(ip)]:[]),...extra];
      for(const key of keys){const result=await db.prepare('INSERT INTO write_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(action+':'+slot+':'+key,(slot+1)*seconds).first();if(result.count>max)fail('操作太频繁，请稍后再试',429);}
      await db.prepare('DELETE FROM write_limits WHERE expires < ?').bind(now).run();
    }
    const isAdmin=!!(account && uuid.test(env.ADMIN_ACCOUNT_ID || "") && account.id===env.ADMIN_ACCOUNT_ID);
    const publicAccount=()=>account?{username:account.username,isAdmin}:null;
    if(request.method==='GET'&&path==='/api/auth/session')return json({account:publicAccount()});
    if(path==='/api/site-notice'){
      if(request.method==='GET'){
        const notice=await db.prepare('SELECT content,version,updated_at AS updatedAt FROM site_notice WHERE id=1').first();
        return json({...(notice||{content:'',version:0,updatedAt:null}),canEdit:isAdmin});
      }
      if(request.method!=='PUT')fail('接口不存在',404);
      if(!account)fail('请先登录',401);if(!isAdmin)fail('需要站主管理权限',403);
      if((!mirror&&request.headers.get('origin')!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')fail('请从本站提交',403);
      const data=await jsonBody(),content=text(data.content,2000,'提醒内容',false,true),version=data.version;
      if(!Number.isSafeInteger(version)||version<0||version>=Number.MAX_SAFE_INTEGER)fail('提醒版本不正确');
      await rate('site-notice',600,30,['account:'+account.id]);
      const updatedAt=Date.now();
      const save=version===0
        ? db.prepare('INSERT INTO site_notice(id,content,version,updated_at) VALUES(1,?,1,?) ON CONFLICT(id) DO NOTHING RETURNING content,version,updated_at AS updatedAt').bind(content.trim()?content:'',updatedAt)
        : db.prepare('UPDATE site_notice SET content=?,version=version+1,updated_at=? WHERE id=1 AND version=? RETURNING content,version,updated_at AS updatedAt').bind(content.trim()?content:'',updatedAt,version);
      // The conditional audit and CAS share one transaction, so conflicts cannot log a successful edit.
      const result=await db.batch([
        db.prepare("INSERT INTO moderation_actions(id,admin,action,target,created) SELECT ?,?,'update_site_notice','1',? WHERE (?=0 AND NOT EXISTS(SELECT 1 FROM site_notice WHERE id=1)) OR EXISTS(SELECT 1 FROM site_notice WHERE id=1 AND version=?)").bind(crypto.randomUUID(),account.id,now,version,version),
        save]);
      const notice=result[1].results[0];if(!notice)fail('提醒已被更新，请重新加载后再编辑',409);
      return json({...notice,canEdit:isAdmin});
    }
    const page = () => { const n = url.searchParams.get('offset') || '0'; if (!/^\d{1,6}$/.test(n)) fail('分页参数不正确'); return Number(n); };
    const feedback=path.match(/^\/api\/feedback(?:\/([^/]+)(?:\/(comments|like))?)?$/),feedbackComment=path.match(/^\/api\/feedback-comments\/([^/]+)$/);
    if(feedback||feedbackComment||path==='/api/admin/feedback'){
      if(feedback?.[1]&&!uuid.test(feedback[1]))fail('反馈不存在',404);
      if(feedbackComment&&!uuid.test(feedbackComment[1]))fail('评论不存在',404);
      const adminId=uuid.test(env.ADMIN_ACCOUNT_ID||'')?env.ADMIN_ACCOUNT_ID:'',author=row=>({...row,isAdmin:!!row.isAdmin}),entry=row=>({...author(row),liked:!!row.liked});
      const selectFeedback='SELECT f.id,f.nickname,f.title,f.category,f.route,f.body,f.created,a.username,CASE WHEN f.author=? THEN 1 ELSE 0 END AS isAdmin,(SELECT COUNT(*) FROM wiki_feedback_likes WHERE feedback=f.id) AS likes,(SELECT COUNT(*) FROM wiki_feedback_comments WHERE feedback=f.id) AS comments,EXISTS(SELECT 1 FROM wiki_feedback_likes WHERE feedback=f.id AND account=?) AS liked FROM wiki_feedback f JOIN accounts a ON a.id=f.author';
      if(feedback?.[2]&&!await db.prepare('SELECT id FROM wiki_feedback WHERE id=?').bind(feedback[1]).first())fail('反馈不存在',404);
      if(request.method==='GET'&&(!feedback?.[1])){
        if(feedbackComment)fail('接口不存在',404);
        if(path==='/api/admin/feedback'){if(!account)fail('请先登录',401);if(!isAdmin)fail('需要站主管理权限',403);}
        const category=url.searchParams.get('category')||'';
        if(category&&!['资料纠错','使用问题','建议','其他'].includes(category))fail('分类不正确');
        const {results}=await db.prepare(selectFeedback+' WHERE (?=\'\' OR f.category=?) ORDER BY f.created DESC,f.id DESC LIMIT 21 OFFSET ?').bind(adminId,account?.id||'',category,category,page()).all();
        return json({items:results.slice(0,20).map(entry),more:results.length>20,canDelete:isAdmin});
      }
      if(request.method==='GET'&&feedback?.[1]){
        if(!feedback[2]){const item=await db.prepare(selectFeedback+' WHERE f.id=?').bind(adminId,account?.id||'',feedback[1]).first();if(!item)fail('反馈不存在',404);return json({item:entry(item),canDelete:isAdmin});}
        if(feedback[2]!=='comments')fail('接口不存在',404);
        const offset=page(),rawCursor=url.searchParams.get('cursor');let cursor=null;
        if(rawCursor!==null){const match=/^(\d{1,16}):(.+)$/.exec(rawCursor),time=match?Number(match[1]):NaN;if(url.searchParams.getAll('cursor').length!==1||!match||!Number.isSafeInteger(time)||time<0||!uuid.test(match[2]))fail('留言游标不正确');cursor={time,id:match[2]};}
        const seek=cursor?' AND (c.created<? OR (c.created=? AND c.id<?))':'',args=cursor?[adminId,feedback[1],cursor.time,cursor.time,cursor.id,0]:[adminId,feedback[1],offset];
        const {results}=await db.prepare('SELECT c.id,c.nickname,c.body,c.created,a.username,CASE WHEN c.author=? THEN 1 ELSE 0 END AS isAdmin FROM wiki_feedback_comments c JOIN accounts a ON a.id=c.author WHERE c.feedback=?'+seek+' ORDER BY c.created DESC,c.id DESC LIMIT 31 OFFSET ?').bind(...args).all();
        const comments=results.slice(0,30).map(author),more=results.length>30,last=comments.at(-1);
        return json({comments,more,nextCursor:more&&last?last.created+':'+last.id:null,canDelete:isAdmin});
      }
      const create=request.method==='POST'&&feedback&&!feedback[1],remove=request.method==='DELETE'&&feedback?.[1]&&!feedback[2],addComment=request.method==='POST'&&feedback?.[2]==='comments',like=request.method==='PUT'&&feedback?.[2]==='like',removeComment=request.method==='DELETE'&&feedbackComment;
      if(!create&&!remove&&!addComment&&!like&&!removeComment)fail('接口不存在',404);
      if((!mirror&&request.headers.get('origin')!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')fail('请从本站提交',403);
      if(!account)fail('请先登录',401);
      if(removeComment){
        if(!isAdmin)fail('需要站主管理权限',403);await rate('manage',600,30,['account:'+account.id]);
        const result=await db.batch([db.prepare("INSERT INTO moderation_actions(id,admin,action,target,created) SELECT ?,?,'delete_feedback_comment',id,? FROM wiki_feedback_comments WHERE id=?").bind(crypto.randomUUID(),account.id,now,feedbackComment[1]),db.prepare('DELETE FROM wiki_feedback_comments WHERE id=?').bind(feedbackComment[1])]);
        if(!result[1].meta.changes)fail('评论不存在',404);return json({ok:true});
      }
      if(remove){
        if(!isAdmin)fail('需要站主管理权限',403);await rate('manage',600,30,['account:'+account.id]);
        const result=await db.batch([
          db.prepare("INSERT INTO moderation_actions(id,admin,action,target,created) SELECT ?,?,'delete_feedback',id,? FROM wiki_feedback WHERE id=?").bind(crypto.randomUUID(),account.id,now,feedback[1]),
          db.prepare('DELETE FROM wiki_feedback WHERE id=?').bind(feedback[1])]);
        if(!result[1].meta.changes)fail('反馈不存在',404);return json({ok:true});
      }
      if(addComment||like){
        const data=await jsonBody();await rate(addComment?'comments':'like',addComment?600:60,addComment?30:120,['account:'+account.id]);
        if(addComment){const nickname=text(data.nickname,24,'昵称'),body=text(data.body,500,'评论',true,true),result=await db.prepare('INSERT INTO wiki_feedback_comments(id,feedback,author,nickname,body,created) SELECT ?,id,?,?,?,? FROM wiki_feedback WHERE id=?').bind(crypto.randomUUID(),account.id,nickname,body,Date.now(),feedback[1]).run();if(!result.meta.changes)fail('反馈不存在',404);return json({ok:true},201);}
        if(typeof data.liked!=='boolean')fail('点赞状态不正确');
        if(data.liked)await db.prepare('INSERT OR IGNORE INTO wiki_feedback_likes(feedback,account) SELECT id,? FROM wiki_feedback WHERE id=?').bind(account.id,feedback[1]).run();else await db.prepare('DELETE FROM wiki_feedback_likes WHERE feedback=? AND account=?').bind(feedback[1],account.id).run();
        const result=await db.prepare('SELECT (SELECT COUNT(*) FROM wiki_feedback_likes WHERE feedback=f.id) AS likes,EXISTS(SELECT 1 FROM wiki_feedback_likes WHERE feedback=f.id AND account=?) AS liked FROM wiki_feedback f WHERE f.id=?').bind(account.id,feedback[1]).first();if(!result)fail('反馈不存在',404);return json({...result,liked:!!result.liked});
      }
      await rate('feedback',3600,10,['account:'+account.id]);
      const data=await jsonBody(),nickname=text(data.nickname,24,'昵称'),title=text(data.title,80,'标题'),body=text(data.body,1000,'反馈',true,true),category=data.category;
      if(!['资料纠错','使用问题','建议','其他'].includes(category))fail('分类不正确');
      const route=text(data.route,200,'关联页',false);
      if(!validFeedbackRoute(route))fail('请选择有效的站内关联页');
      const id=crypto.randomUUID();await db.prepare('INSERT INTO wiki_feedback(id,author,nickname,title,category,route,body,created) VALUES(?,?,?,?,?,?,?,?)').bind(id,account.id,nickname,title,category,route,body,Date.now()).run();return json({id},201);
    }
    const itemRoute=path.match(/^\/api\/items\/([^/]+)(?:\/(comments|like))?$/),itemComment=path.match(/^\/api\/item-comments\/([^/]+)(?:\/(like))?$/);
    if(itemRoute||itemComment||path==='/api/admin/item-comments'){
      let item;if(itemRoute){try{item=decodeURIComponent(itemRoute[1]);}catch{fail('物品不存在',404);}if(!knownItems.has(item))fail('物品不存在',404);}
      if(itemComment&&!uuid.test(itemComment[1]))fail('评论不存在',404);
      if(request.method==='GET'&&path==='/api/admin/item-comments'){
        if(!account)fail('请先登录',401);if(!isAdmin)fail('需要站主管理权限',403);
        const {results}=await db.prepare('SELECT c.id,c.item,c.nickname,c.body,c.created,a.username FROM item_comments c JOIN accounts a ON a.id=c.author ORDER BY c.created DESC,c.id DESC LIMIT 21 OFFSET ?').bind(page()).all();
        return json({items:results.slice(0,20),more:results.length>20});
      }
      if(request.method==='GET'&&itemRoute&&!itemRoute[2]){
        const result=await db.prepare('SELECT (SELECT COUNT(*) FROM item_likes WHERE item=?) AS likes,(SELECT COUNT(*) FROM item_comments WHERE item=?) AS comments,EXISTS(SELECT 1 FROM item_likes WHERE item=? AND visitor=?) AS liked').bind(item,item,item,visitor).first();return json(result);
      }
      if(request.method==='GET'&&itemRoute?.[2]==='comments'){
        const sort=url.searchParams.get('sort')||'latest',orders={latest:'c.created DESC,c.id DESC',likes:'likes DESC,c.created DESC,c.id DESC',hot:'(likes+1.0)/(MAX(0,('+now+'-c.created/1000.0)/3600.0)+2) DESC,c.created DESC,c.id DESC'};
        if(!Object.hasOwn(orders,sort))fail('排序方式不正确');
        const {results}=await db.prepare('SELECT c.id,c.nickname,c.body,c.created,a.username,(SELECT COUNT(*) FROM item_comment_likes WHERE comment=c.id) AS likes,EXISTS(SELECT 1 FROM item_comment_likes WHERE comment=c.id AND account=?) AS liked FROM item_comments c JOIN accounts a ON a.id=c.author WHERE c.item=? ORDER BY '+orders[sort]+' LIMIT 31 OFFSET ?').bind(account?.id||'',item,page()).all();
        return json({comments:results.slice(0,30),more:results.length>30,canDelete:isAdmin});
      }
      const itemLike=request.method==='PUT'&&itemRoute?.[2]==='like',addComment=request.method==='POST'&&itemRoute?.[2]==='comments',commentLike=request.method==='PUT'&&itemComment?.[2]==='like',removeComment=request.method==='DELETE'&&itemComment&&!itemComment[2];
      if(!itemLike&&!addComment&&!commentLike&&!removeComment)fail('接口不存在',404);
      if((!mirror&&request.headers.get('origin')!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')fail('请从本站提交',403);
      if(!itemLike&&!account)fail('请先登录再评论或管理内容',401);
      if(removeComment){
        if(!isAdmin)fail('需要站主管理权限',403);await rate('manage',600,30,['account:'+account.id]);
        const result=await db.batch([
          db.prepare("INSERT INTO moderation_actions(id,admin,action,target,created) SELECT ?,?,'delete_item_comment',id,? FROM item_comments WHERE id=?").bind(crypto.randomUUID(),account.id,now,itemComment[1]),
          db.prepare('DELETE FROM item_comment_likes WHERE comment=?').bind(itemComment[1]),db.prepare('DELETE FROM item_comments WHERE id=?').bind(itemComment[1])]);
        if(!result[2].meta.changes)fail('评论不存在',404);return json({ok:true});
      }
      await rate(addComment?'comments':'like',addComment?600:60,addComment?30:120,account?['account:'+account.id]:[]);
      const data=await jsonBody();
      if(addComment){const nickname=text(data.nickname,24,'昵称'),body=text(data.body,500,'评论',true,true);await db.prepare('INSERT INTO item_comments(id,item,author,nickname,body,created) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),item,account.id,nickname,body,Date.now()).run();return json({ok:true},201);}
      if(typeof data.liked!=='boolean')fail('点赞状态不正确');
      if(itemLike){await db.prepare(data.liked?'INSERT OR IGNORE INTO item_likes(item,visitor) VALUES(?,?)':'DELETE FROM item_likes WHERE item=? AND visitor=?').bind(item,visitor).run();const result=await db.prepare('SELECT COUNT(*) AS likes FROM item_likes WHERE item=?').bind(item).first();return json({likes:result.likes,liked:data.liked});}
      if(data.liked)await db.prepare('INSERT OR IGNORE INTO item_comment_likes(comment,account) SELECT id,? FROM item_comments WHERE id=?').bind(account.id,itemComment[1]).run();
      else await db.prepare('DELETE FROM item_comment_likes WHERE comment=? AND account=?').bind(itemComment[1],account.id).run();
      const result=await db.prepare('SELECT (SELECT COUNT(*) FROM item_comment_likes WHERE comment=c.id) AS likes,EXISTS(SELECT 1 FROM item_comment_likes WHERE comment=c.id AND account=?) AS liked FROM item_comments c WHERE id=?').bind(account.id,itemComment[1]).first();if(!result)fail('评论不存在',404);return json(result);
    }
    const affixRoute=path.match(/^\/api\/affixes\/([^/]+)(?:\/(comments|like))?$/),affixComment=path.match(/^\/api\/affix-comments\/([^/]+)(?:\/(like))?$/);
    if(affixRoute||affixComment||path==='/api/admin/affix-comments'){
      let affix;if(affixRoute){try{affix=decodeURIComponent(affixRoute[1]);}catch{fail('词条不存在',404);}if(!knownAffixes.has(affix))fail('词条不存在',404);}
      if(affixComment&&!uuid.test(affixComment[1]))fail('评论不存在',404);
      if(request.method==='GET'&&path==='/api/admin/affix-comments'){
        if(!account)fail('请先登录',401);if(!isAdmin)fail('需要站主管理权限',403);
        const {results}=await db.prepare('SELECT c.id,c.affix,c.nickname,c.body,c.created,a.username FROM affix_comments c JOIN accounts a ON a.id=c.author ORDER BY c.created DESC,c.id DESC LIMIT 21 OFFSET ?').bind(page()).all();
        return json({items:results.slice(0,20),more:results.length>20});
      }
      if(request.method==='GET'&&affixRoute&&!affixRoute[2]){
        const result=await db.prepare('SELECT (SELECT COUNT(*) FROM affix_likes WHERE affix=?) AS likes,(SELECT COUNT(*) FROM affix_comments WHERE affix=?) AS comments,EXISTS(SELECT 1 FROM affix_likes WHERE affix=? AND visitor=?) AS liked').bind(affix,affix,affix,visitor).first();return json(result);
      }
      if(request.method==='GET'&&affixRoute?.[2]==='comments'){
        const sort=url.searchParams.get('sort')||'latest',orders={latest:'c.created DESC,c.id DESC',likes:'likes DESC,c.created DESC,c.id DESC',hot:'(likes+1.0)/(MAX(0,('+now+'-c.created/1000.0)/3600.0)+2) DESC,c.created DESC,c.id DESC'};
        if(!Object.hasOwn(orders,sort))fail('排序方式不正确');
        const {results}=await db.prepare('SELECT c.id,c.nickname,c.body,c.created,a.username,(SELECT COUNT(*) FROM affix_comment_likes WHERE comment=c.id) AS likes,EXISTS(SELECT 1 FROM affix_comment_likes WHERE comment=c.id AND account=?) AS liked FROM affix_comments c JOIN accounts a ON a.id=c.author WHERE c.affix=? ORDER BY '+orders[sort]+' LIMIT 31 OFFSET ?').bind(account?.id||'',affix,page()).all();
        return json({comments:results.slice(0,30),more:results.length>30,canDelete:isAdmin});
      }
      const itemLike=request.method==='PUT'&&affixRoute?.[2]==='like',addComment=request.method==='POST'&&affixRoute?.[2]==='comments',commentLike=request.method==='PUT'&&affixComment?.[2]==='like',removeComment=request.method==='DELETE'&&affixComment&&!affixComment[2];
      if(!itemLike&&!addComment&&!commentLike&&!removeComment)fail('接口不存在',404);
      if((!mirror&&request.headers.get('origin')!==url.origin)||request.headers.get('sec-fetch-site')==='cross-site')fail('请从本站提交',403);
      if(!itemLike&&!account)fail('请先登录再评论或管理内容',401);
      if(removeComment){
        if(!isAdmin)fail('需要站主管理权限',403);await rate('manage',600,30,['account:'+account.id]);
        const result=await db.batch([
          db.prepare("INSERT INTO moderation_actions(id,admin,action,target,created) SELECT ?,?,'delete_affix_comment',id,? FROM affix_comments WHERE id=?").bind(crypto.randomUUID(),account.id,now,affixComment[1]),
          db.prepare('DELETE FROM affix_comment_likes WHERE comment=?').bind(affixComment[1]),db.prepare('DELETE FROM affix_comments WHERE id=?').bind(affixComment[1])]);
        if(!result[2].meta.changes)fail('评论不存在',404);return json({ok:true});
      }
      await rate(addComment?'comments':'like',addComment?600:60,addComment?30:120,account?['account:'+account.id]:[]);
      const data=await jsonBody();
      if(addComment){const nickname=text(data.nickname,24,'昵称'),body=text(data.body,500,'评论',true,true);await db.prepare('INSERT INTO affix_comments(id,affix,author,nickname,body,created) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),affix,account.id,nickname,body,Date.now()).run();return json({ok:true},201);}
      if(typeof data.liked!=='boolean')fail('点赞状态不正确');
      if(itemLike){await db.prepare(data.liked?'INSERT OR IGNORE INTO affix_likes(affix,visitor) VALUES(?,?)':'DELETE FROM affix_likes WHERE affix=? AND visitor=?').bind(affix,visitor).run();const result=await db.prepare('SELECT COUNT(*) AS likes FROM affix_likes WHERE affix=?').bind(affix).first();return json({likes:result.likes,liked:data.liked});}
      if(data.liked)await db.prepare('INSERT OR IGNORE INTO affix_comment_likes(comment,account) SELECT id,? FROM affix_comments WHERE id=?').bind(account.id,affixComment[1]).run();
      else await db.prepare('DELETE FROM affix_comment_likes WHERE comment=? AND account=?').bind(affixComment[1],account.id).run();
      const result=await db.prepare('SELECT (SELECT COUNT(*) FROM affix_comment_likes WHERE comment=c.id) AS likes,EXISTS(SELECT 1 FROM affix_comment_likes WHERE comment=c.id AND account=?) AS liked FROM affix_comments c WHERE id=?').bind(account.id,affixComment[1]).first();if(!result)fail('评论不存在',404);return json(result);
    }
    if (request.method === 'GET' && path === '/api/posts') {
      const kind=url.searchParams.get('kind')??'tier';if(!['tier','workshop'].includes(kind)||url.searchParams.getAll('kind').length>1)fail('帖子类型不正确');
      const {results} = await db.prepare(`SELECT p.id,p.nickname,p.title,p.body,p.image,p.width,p.height,p.created,p.ranking,p.kind,p.workshop,p.author=? AS canManage,(p.author=? OR ?=1) AS canDelete, (SELECT COUNT(*) FROM likes WHERE post=p.id) AS likes,
        (SELECT COUNT(*) FROM comments WHERE post=p.id) AS comments,
        EXISTS(SELECT 1 FROM likes WHERE post=p.id AND visitor=?) AS liked
        FROM posts p WHERE p.kind=? ORDER BY likes DESC, created DESC, id DESC LIMIT 21 OFFSET ?`).bind(account?.id||'',account?.id||'',Number(isAdmin),visitor,kind,page()).all();
      return json({posts: results.slice(0,20), more: results.length > 20});
    }
    if(request.method==='GET'&&['/api/admin/posts','/api/admin/comments'].includes(path)){
      if(!account)fail('请先登录',401);if(!isAdmin)fail('需要站主管理权限',403);
      const statement=path.endsWith('/posts')
        ? db.prepare(`SELECT p.id,p.nickname,p.title,p.body,p.image,p.width,p.height,p.created,p.ranking,p.kind,p.workshop,p.author=? AS canManage,1 AS canDelete,p.author IS NULL AS anonymous,
          (SELECT COUNT(*) FROM likes WHERE post=p.id) AS likes,(SELECT COUNT(*) FROM comments WHERE post=p.id) AS comments,
          EXISTS(SELECT 1 FROM likes WHERE post=p.id AND visitor=?) AS liked FROM posts p ORDER BY p.created DESC,p.id DESC LIMIT 21 OFFSET ?`).bind(account.id,visitor,page())
        : db.prepare('SELECT c.id,c.post,c.nickname,c.body,c.created,p.title AS postTitle,a.username FROM comments c JOIN posts p ON p.id=c.post LEFT JOIN accounts a ON a.id=c.author ORDER BY c.created DESC,c.id DESC LIMIT 21 OFFSET ?').bind(page());
      const {results}=await statement.all();return json({items:results.slice(0,20),more:results.length>20});
    }
    const singlePost=path.match(/^\/api\/posts\/([0-9a-f-]+)$/i);
    if(request.method==='GET'&&singlePost){
      if(!uuid.test(singlePost[1]))fail('帖子不存在',404);
      const post=await db.prepare(`SELECT p.id,p.nickname,p.title,p.body,p.image,p.width,p.height,p.created,p.ranking,p.kind,p.workshop,p.author=? AS canManage,(p.author=? OR ?=1) AS canDelete,
        (SELECT COUNT(*) FROM likes WHERE post=p.id) AS likes,(SELECT COUNT(*) FROM comments WHERE post=p.id) AS comments,EXISTS(SELECT 1 FROM likes WHERE post=p.id AND visitor=?) AS liked FROM posts p WHERE p.id=?`).bind(account?.id||'',account?.id||'',Number(isAdmin),visitor,singlePost[1]).first();
      if(!post)fail('帖子不存在',404);return json({post});
    }
    const image = path.match(/^\/api\/images\/([0-9a-f-]+)$/i);
    if (request.method === 'GET' && image && uuid.test(image[1])) {
      // Revalidate post existence before returning 304, including orphaned images after failed cleanup.
      if(!await db.prepare('SELECT id FROM posts WHERE id=?').bind(image[1]).first())fail('图片不存在',404);
      const condition=new Headers(),etag=request.headers.get('If-None-Match');
      if(etag)condition.set('If-None-Match',etag);
      const object = await env.BUCKET.get('posts/' + image[1] + '.png',{onlyIf:condition});
      if (!object) fail('图片不存在', 404);
      return new Response('body' in object?object.body:null, {status:'body' in object?200:304,headers: {'Content-Type':'image/png', 'Cache-Control':'private, no-cache', 'ETag':object.httpEtag, 'X-Content-Type-Options':'nosniff', 'Content-Security-Policy':"default-src 'none'; sandbox"}});
    }
    const target = path.match(/^\/api\/posts\/([0-9a-f-]+)\/(comments|like)$/i);
    if (target && !uuid.test(target[1])) fail('帖子不存在',404);
    if (request.method === 'GET' && target?.[2] === 'comments') {
      const {results} = await db.prepare('SELECT c.id,c.nickname,c.body,c.created,a.username FROM comments c LEFT JOIN accounts a ON a.id=c.author WHERE c.post=? ORDER BY c.created DESC,c.id DESC LIMIT 31 OFFSET ?').bind(target[1],page()).all();
      return json({comments:results.slice(0,30), more:results.length>30});
    }
    const auth=path.match(/^\/api\/auth\/(register|login|logout)$/), owned=path.match(/^\/api\/posts\/([0-9a-f-]+)$/i),comment=path.match(/^\/api\/comments\/([0-9a-f-]+)$/i);
    if(comment&&!uuid.test(comment[1]))fail('评论不存在',404);
    if(owned&&!uuid.test(owned[1]))fail('帖子不存在',404);
    if (!(request.method === 'POST' && (path === '/api/posts' || target?.[2] === 'comments' || auth)) && !(request.method === 'PUT' && target?.[2] === 'like') && !(owned&&['PATCH','DELETE'].includes(request.method)) && !(comment&&request.method==='DELETE')) fail('接口不存在',404);
    if ((!mirror && request.headers.get('origin') !== url.origin) || request.headers.get('sec-fetch-site') === 'cross-site') fail('请从本站提交',403);
    if(auth){
      if(auth[1]==='logout'){const token=sessionToken(request);if(token)await db.prepare('DELETE FROM sessions WHERE token=?').bind(await digest(token)).run();headers['Set-Cookie']=sessionCookie('',url,0);return json({account:null});}
      const data=await jsonBody(4096), username=accountName(data.username);
      await rate('auth',600,10,['name:'+await digest(username)]);
      await db.prepare('DELETE FROM sessions WHERE expires<=?').bind(now).run();
      const existing=await db.prepare('SELECT id,password FROM accounts WHERE username=?').bind(username).first();
      let id;
      if(auth[1]==='register'){
        const hash=await passwordHash(data.password);if(existing)fail('该账号已注册，请换一个或登录',409);
        id=crypto.randomUUID();const session=await newSession(id,db,now);
        try{await db.batch([db.prepare('INSERT INTO accounts(id,username,password,created) VALUES(?,?,?,?)').bind(id,username,hash,now),session.statement]);}catch(error){if(String(error.message).includes('UNIQUE'))fail('该账号已注册，请换一个或登录',409);throw error;}
        headers['Set-Cookie']=sessionCookie(session.token,url);return json({account:{username,isAdmin:false}},201);
      }
      const matches=await passwordMatches(data.password,existing?.password);if(!existing||!matches)fail('账号或密码不正确',401);
      const session=await newSession(existing.id,db,now);await session.statement.run();headers['Set-Cookie']=sessionCookie(session.token,url);return json({account:{username,isAdmin:uuid.test(env.ADMIN_ACCOUNT_ID||'')&&existing.id===env.ADMIN_ACCOUNT_ID}});
    }
    if(path==='/api/posts'||target?.[2]==='comments'||owned||comment){if(!account)fail('请先登录再发布或管理内容',401);}
    if(comment){
      if(!isAdmin)fail('需要站主管理权限',403);
      await rate('manage',600,30,['account:'+account.id]);
      const result=await db.batch([
        db.prepare("INSERT INTO moderation_actions(id,admin,action,target,created) SELECT ?,?,'delete_comment',id,? FROM comments WHERE id=?").bind(crypto.randomUUID(),account.id,now,comment[1]),
        db.prepare('DELETE FROM comments WHERE id=?').bind(comment[1])
      ]);
      if(!result[1].meta.changes)fail('评论不存在',404);return json({ok:true});
    }
    if(owned){
      const allowedAdmin=request.method==='DELETE'&&isAdmin;
      const guard='SELECT id FROM posts WHERE id=? AND (author=? OR ?=1)',args=[owned[1],account.id,Number(allowedAdmin)];
      if(!await db.prepare(guard).bind(...args).first())fail('你只能管理自己发布的帖子',403);
      await rate('manage',600,30,['account:'+account.id]);
      if(request.method==='PATCH'){const data=await jsonBody();const title=text(data.title,80,'标题'),body=text(data.body,1000,'攻略文字',false,true);const result=await db.prepare('UPDATE posts SET title=?,body=? WHERE id=? AND author=?').bind(title,body,owned[1],account.id).run();if(!result.meta.changes)fail('帖子不存在',404);return json({ok:true});}
      const statements=[];
      if(isAdmin)statements.push(db.prepare("INSERT INTO moderation_actions(id,admin,action,target,created) SELECT ?,?,'delete_post',id,? FROM posts WHERE id=? AND (author=? OR ?=1)").bind(crypto.randomUUID(),account.id,now,...args));
      statements.push(db.prepare('DELETE FROM comments WHERE post IN ('+guard+')').bind(...args),db.prepare('DELETE FROM likes WHERE post IN ('+guard+')').bind(...args),db.prepare('DELETE FROM posts WHERE id=? AND (author=? OR ?=1)').bind(...args));
      const result=await db.batch(statements);
      if(!result.at(-1).meta.changes)fail('帖子不存在',404);
      try{await env.BUCKET.delete('posts/'+owned[1]+'.png');}catch{console.error('Deleted post image cleanup failed');}
      return json({ok:true});
    }
    if (target && !await db.prepare('SELECT id FROM posts WHERE id=?').bind(target[1]).first()) fail('帖子不存在',404);
    const action = path === '/api/posts' ? 'post' : target[2];
    const windowSeconds = action === 'post' ? 3600 : action === 'comments' ? 600 : 60;
    const max = action === 'post' ? 5 : action === 'comments' ? 30 : 120;
    await rate(action,windowSeconds,max,account?['account:'+account.id]:[]);
    if (path === '/api/posts') {
      const bytes = await boundedBody(request, MAX_POST);
      let form; try { form = await new Response(bytes,{headers:{'Content-Type':request.headers.get('content-type') || ''}}).formData(); } catch { fail('上传格式不正确'); }
      const kind=form.get('kind')??'tier';if(!['tier','workshop'].includes(kind))fail('帖子类型不正确');
      const allowed=new Set(['kind','nickname','title','body','image',...(kind==='tier'?['ranking']:['workshop','reportDigest'])]);
      for(const [field] of form)if(!allowed.has(field)||form.getAll(field).length!==1)fail('帖子字段不正确或重复');
      let workshop=null;if(kind==='workshop')workshop=(await validateWorkshopPost(form.get('workshop'),{expectedDigest:form.get('reportDigest')})).workshopJSON;
      const nickname = text(form.get('nickname'),24,'昵称'), title = text(form.get('title'),80,'标题'), body = text(form.get('body'),1000,'攻略文字',false,true);
      let rank=null; if(form.has('ranking')){let value;try{value=JSON.parse(form.get('ranking'));}catch{fail('排行数据格式不正确');}rank=ranking(value);}
      const file = form.get('image'); if (!file || typeof file.arrayBuffer !== 'function' || file.type !== 'image/png' || file.size > MAX_IMAGE) fail('图片必须是 5 MB 以内的 PNG');
      const imageBytes = new Uint8Array(await file.arrayBuffer()), {width,height} = await pngSize(imageBytes);
      const id = crypto.randomUUID(), key = 'posts/'+id+'.png';
      await env.BUCKET.put(key,imageBytes,{httpMetadata:{contentType:'image/png'}});
      try { await db.prepare('INSERT INTO posts(id,nickname,title,body,image,width,height,created,ranking,author,kind,workshop) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,nickname,title,body,'/api/images/'+id,width,height,now,rank,account.id,kind,workshop).run(); }
      catch (error) { await env.BUCKET.delete(key); throw error; }
      return json({id},201);
    }
    let data; try { data = JSON.parse(new TextDecoder().decode(await boundedBody(request,16384))); } catch(e) { if(e.status) throw e; fail('内容格式不正确'); }
    if (!data || typeof data !== 'object' || Array.isArray(data)) fail('内容格式不正确');
    if (target[2] === 'like') {
      if (typeof data.liked !== 'boolean') fail('点赞状态不正确');
      await db.prepare(data.liked ? 'INSERT OR IGNORE INTO likes(post,visitor) VALUES(?,?)' : 'DELETE FROM likes WHERE post=? AND visitor=?').bind(target[1],visitor).run();
      const result = await db.prepare('SELECT COUNT(*) AS likes FROM likes WHERE post=?').bind(target[1]).first();
      return json({likes:result.likes, liked:data.liked});
    }
    const nickname = text(data.nickname,24,'昵称'), body = text(data.body,500,'评论',true,true);
    await db.prepare('INSERT INTO comments(id,post,nickname,body,created,author) VALUES(?,?,?,?,?,?)').bind(crypto.randomUUID(),target[1],nickname,body,Date.now(),account.id).run();
    return json({ok:true},201);
  } catch(error) {
    if (!error.status) console.error('Community service error:', error.name);
    return json({error: error.status ? error.message : '帖子服务暂时不可用，请稍后重试'},error.status || 503);
  } finally {
    // Unread bodies (including logout) break the local proxy's next request; bound cleanup time/bytes.
    try{await discardUnusedBody(request);}catch{}
  }
}
