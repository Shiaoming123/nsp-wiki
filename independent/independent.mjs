import {isIP} from 'node:net';
import {community} from './lib/community.js';
import {allowedTencent} from './lib/tencent-mirror-policy.js';
import {SQLiteD1,FileBucket} from './storage.mjs';
import {publicActivity} from './analytics-feed.mjs';
import {verifyMirror} from './lib/mirror-auth.js';
export const ORIGIN='https://nsp-wiki.shiaoming.cn';
export const BODY_LIMIT=5*1024*1024+65536;
const error=(status,message)=>Response.json({error:message},{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
export function createIndependent({databaseFile,uploadsDir,adminAccountId=null,registrationEnabled=false,analytics=null,netlifyProxyKey=null}){
  if(adminAccountId!==null&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(adminAccountId))throw Error('Invalid administrator mapping');
  if(netlifyProxyKey!==null&&!/^[0-9a-f]{64}$/i.test(netlifyProxyKey))throw Error('Invalid Netlify proxy key');
  const db=new SQLiteD1(databaseFile),bucket=new FileBucket(uploadsDir);
  // Optional Netlify trust is verified at this boundary; never expose its key to business handlers.
  const env={DB:db,BUCKET:bucket,...(adminAccountId?{ADMIN_ACCOUNT_ID:adminAccountId}:{})};
  return {db,bucket,health(){
    const ok=db.db.prepare('SELECT 1 AS ok').get().ok===1;
    return {ok,service:'nsp-wiki-independent-community',release:'20261017-independent-v1',registrationEnabled:!!registrationEnabled,adminConfigured:!!adminAccountId};
  },async handle(request,trustedIp){
    const url=new URL(request.url);let headers=request.headers;
    if(url.origin!==ORIGIN||!allowedTencent(request.method,url.pathname))return error(404,'Unknown API route');
    if(!isIP(trustedIp))return error(503,'Trusted client address unavailable');
    if(headers.get('sec-fetch-site')==='cross-site')return error(403,'Submit from the wiki origin');
    if([...headers.keys()].some(k=>k.startsWith('x-nsp-mirror-'))){
      try{
        if(!netlifyProxyKey)return error(403,'Mirror identity not enabled');
        const mirror=await verifyMirror(request,{NSP_MIRROR_ORIGIN:'https://nsp-wiki.netlify.app',NSP_MIRROR_PROXY_KEY:netlifyProxyKey});
        if(!mirror||!isIP(mirror.ip))return error(403,'Invalid mirror identity');
        const clean=new Headers();
        for(const name of ['accept','content-type','cookie','if-none-match'])if(mirror.request.headers.has(name))clean.set(name,mirror.request.headers.get(name));
        clean.set('origin',ORIGIN);
        request=new Request(request.url,{method:request.method,headers:clean,...(mirror.request.body?{body:mirror.request.body,duplex:'half'}:{})});
        headers=request.headers;trustedIp=mirror.ip;
      }catch(cause){return error(cause.status||503,cause.status?'Mirror identity rejected':'Mirror verification unavailable');}
    }
    if(
       (headers.has('origin')&&headers.get('origin')!==ORIGIN)||(request.method!=='GET'&&headers.get('origin')!==ORIGIN))return error(403,'Submit from the wiki origin');
    if(Number(headers.get('content-length'))>BODY_LIMIT)return error(413,'Upload too large');
    if(url.pathname.startsWith('/api/analytics/')){
      if(!analytics)return error(503,'统计暂未启用');
      if(request.method==='GET'&&url.pathname==='/api/analytics/summary'){
        const values=[...url.searchParams.keys()];if(values.length>1||values.some(k=>k!=='days'))return error(400,'Invalid range');
        const days=Number(url.searchParams.get('days')||7);if(![1,7,30].includes(days))return error(400,'Invalid range');
        try{return Response.json({...analytics.summary(days),activity:await publicActivity(db)},{headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}catch{return error(503,'统计暂时不可用');}
      }
      if(request.method==='POST'&&url.pathname==='/api/analytics/event'){
        try{const body=await request.text();if(body.length>512||url.search)throw Error('Invalid event');const data=JSON.parse(body);
          if(!data||Object.keys(data).sort().join(',')!=='kind,target')throw Error('Invalid event');
          analytics.record({...data,ip:trustedIp,userAgent:(headers.get('user-agent')||'').slice(0,512)});
          return new Response(null,{status:204,headers:{'Cache-Control':'no-store'}});
        }catch{return error(400,'无效或过于频繁的统计请求');}
      }
      return error(404,'Unknown API route');
    }
    if(request.method==='POST'&&url.pathname==='/api/auth/register'&&!registrationEnabled)return error(503,'Registration is not open yet');
    const clean=new Headers();
    for(const name of ['accept','content-type','cookie','origin','sec-fetch-site','if-none-match','content-length'])if(headers.has(name))clean.set(name,headers.get(name));
    clean.set('cf-connecting-ip',trustedIp);
    const safe=new Request(request.url,{method:request.method,headers:clean,
      ...(request.body?{body:request.body,duplex:'half'}:{})});
    return community(safe,env);
  }};
}
