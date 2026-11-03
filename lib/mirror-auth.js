import {TENCENT_ORIGIN, allowedTencent} from './tencent-mirror-policy.js';
const encoder = new TextEncoder();
export const MIRROR_BODY_LIMIT = 5 * 1024 * 1024 + 65536;
const prefix = 'x-nsp-mirror-';
const fail = (message, status) => { throw Object.assign(new Error(message), {status}); };
export function mirrorOrigin(value) {
  const url = new URL(value);
  if (url.origin !== value || url.username || url.password ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) {
    fail('代理配置不正确', 503);
  }
  return url.origin;
}
async function key(secret) {
  if (!/^[0-9a-f]{64}$/i.test(secret || '')) fail('代理配置不正确', 503);
  return crypto.subtle.importKey('raw', Uint8Array.from(secret.match(/../g), x => parseInt(x, 16)), {name:'HMAC', hash:'SHA-256'}, false, ['sign', 'verify']);
}
async function hash(bytes) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
}
export async function mirrorBody(request, signal = AbortSignal.timeout(20000)) {
  if (Number(request.headers.get('content-length')) > MIRROR_BODY_LIMIT) fail('上传内容过大', 413);
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader(), chunks = []; let size = 0;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener('abort', abort, {once:true});
  try {
    for (;;) {
      if (signal.aborted) fail('上传超时，请重试', 408);
      const {done, value} = await reader.read();
      if (signal.aborted) fail('上传超时，请重试', 408);
      if (done) break;
      size += value.length;
      if (size > MIRROR_BODY_LIMIT) { void reader.cancel().catch(() => {}); fail('上传内容过大', 413); }
      chunks.push(value);
    }
  } finally { signal.removeEventListener('abort', abort); reader.releaseLock(); }
  const bytes = new Uint8Array(size); let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.length; }
  return bytes;
}
async function payload(request, bytes) {
  const url = new URL(request.url), h = request.headers;
  return encoder.encode(JSON.stringify(['nsp-mirror-v1', request.method, url.pathname + url.search,
    h.get(prefix+'time'), h.get(prefix+'origin'), h.get(prefix+'ip'), h.get('content-type') || '',
    await hash(encoder.encode(h.get('cookie') || '')), await hash(bytes)]));
}
export async function signMirror(request, bytes, secret) {
  const signature = await crypto.subtle.sign('HMAC', await key(secret), await payload(request, bytes));
  request.headers.set(prefix+'signature', Array.from(new Uint8Array(signature), x => x.toString(16).padStart(2, '0')).join(''));
}
export async function verifyMirror(request, env) {
  if (![...request.headers.keys()].some(x => x.startsWith(prefix))) return null;
  const isTencent = request.headers.get(prefix+'origin') === TENCENT_ORIGIN;
  const configuredOrigin = isTencent ? TENCENT_ORIGIN : env.NSP_MIRROR_ORIGIN;
  const secret = isTencent ? env.NSP_TENCENT_MIRROR_PROXY_KEY : env.NSP_MIRROR_PROXY_KEY;
  if (!configuredOrigin || !secret) fail('Mirror identity not enabled', 403);
  const h = request.headers, origin = mirrorOrigin(configuredOrigin), time = h.get(prefix+'time'), ip = h.get(prefix+'ip'), signature = h.get(prefix+'signature');
  if (h.get(prefix+'origin') !== origin || h.get('origin') !== origin ||
      !/^\d{10}$/.test(time || '') || Math.abs(Date.now()/1000 - Number(time)) > 60 ||
      !/^[0-9a-f:.]{3,64}$/i.test(ip || '') || !/^[0-9a-f]{64}$/i.test(signature || '')) fail('代理身份校验失败', 403);
  const bytes = await mirrorBody(request);
  const valid = await crypto.subtle.verify('HMAC', await key(secret), Uint8Array.from(signature.match(/../g), x => parseInt(x, 16)), await payload(request, bytes));
  if (!valid) fail('代理身份校验失败', 403);
  if (isTencent && !allowedTencent(request.method, new URL(request.url).pathname)) fail('Mirror scope denied', 403);
  return {ip, request:new Request(request.url, {method:request.method, headers:request.headers, ...(request.body ? {body:bytes} : {})})};
}
