import bcrypt from 'bcryptjs';
const encoder=new TextEncoder();
const hex=bytes=>Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join('');
export const digest=async value=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(value))));
export const reject=(message,status=400)=>{throw Object.assign(new Error(message),{status});};
export function accountName(value){
  if(typeof value!=='string')reject('账号格式不正确');
  const name=value.trim().normalize('NFKC').toLocaleLowerCase('en-US');
  if(!/^[\p{L}\p{N}_-]{3,24}$/u.test(name))reject('账号需为 3–24 个字母、数字、中文、下划线或短横线');
  return name;
}
function password(value){
  if(typeof value!=='string'||Array.from(value).length<10||encoder.encode(value).length>72)reject('密码至少 10 个字符，且最多 72 字节（中文约 24 字）');
  return value;
}
// Workers currently caps PBKDF2 below the recommended work factor; use portable bcrypt cost 10.
export const passwordHash=value=>bcrypt.hash(password(value),10);
const dummy='$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
export const passwordMatches=(value,hash)=>bcrypt.compare(password(value),hash||dummy);
export function sessionCookie(token,url,seconds=604800){return 'nsp-session='+token+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+seconds+(url.protocol==='https:'?'; Secure':'');}
export function sessionToken(request){const value=request.headers.get('cookie')?.match(/(?:^|;\s*)nsp-session=([^;]+)/)?.[1];return /^[0-9a-f]{64}$/.test(value||'')?value:null;}
export async function currentAccount(request,db,now){const token=sessionToken(request);if(!token)return null;return db.prepare('SELECT a.id,a.username FROM sessions s JOIN accounts a ON a.id=s.account WHERE s.token=? AND s.expires>?').bind(await digest(token),now).first();}
export async function newSession(account,db,now){const token=hex(crypto.getRandomValues(new Uint8Array(32)));return {token,statement:db.prepare('INSERT INTO sessions(token,account,expires) VALUES(?,?,?)').bind(await digest(token),account,now+604800)};}
