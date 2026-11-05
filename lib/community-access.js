import {reject} from './auth.js';
export const permissions=['content','users','notice','audit'];
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export async function accountAccess(db,account,ownerId){
  const owner=!!(account&&uuid.test(ownerId||'')&&account.id===ownerId);
  const enabled=account&&uuid.test(ownerId||'')&&await db.prepare('SELECT id FROM accounts WHERE id=?').bind(ownerId).first();
  const granted=owner?permissions:enabled?(await db.prepare('SELECT permission FROM account_permissions WHERE account=? ORDER BY permission').bind(account.id).all()).results.map(r=>r.permission):[];
  const restriction=account&&!owner?await db.prepare('SELECT muted_until FROM account_restrictions WHERE account=?').bind(account.id).first():null;
  return {isAdmin:owner,permissions:granted,mutedUntil:restriction?.muted_until||0};
}
export function accessBatch(db,account,ownerId,access){
  return async(permission,statements)=>{
    if(!account)reject('请先登录',401);
    if(!access.permissions.includes(permission))reject('没有此项管理权限',403);
    if(access.isAdmin)return db.batch(statements);
    // Recheck in the transaction: a revoked permission must not race a moderation write.
    const guard=db.prepare("SELECT json_extract('{}',CASE WHEN EXISTS(SELECT 1 FROM account_permissions p JOIN accounts owner ON owner.id=? WHERE p.account=? AND p.permission=?) THEN '$' ELSE 'permission-revoked' END)").bind(ownerId,account.id,permission);
    try{return (await db.batch([guard,...statements])).slice(1);}
    catch(error){if(/permission-revoked/i.test(error.message))reject('权限已撤销，请刷新管理中心',403);throw error;}
  };
}
