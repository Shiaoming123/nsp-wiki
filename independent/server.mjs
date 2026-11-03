import http from 'node:http';
import {isIP} from 'node:net';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {readFileSync,realpathSync} from 'node:fs';
import {createIndependent,ORIGIN,BODY_LIMIT} from './independent.mjs';
import {Analytics} from './analytics.mjs';

export function createHTTPServer(app){
  let active=0;
  const server=http.createServer({maxHeaderSize:8192},async(req,res)=>{
    const fail=(status,error)=>{if(res.writableEnded)return;const body=JSON.stringify({error});res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Length':Buffer.byteLength(body),'Connection':'close'});res.end(body);};
    if(active>=4){fail(503,'Service busy; do not automatically retry writes');return;}active++;
    try{
      if(!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)){fail(403,'Loopback only');return;}
      const count={};for(let i=0;i<req.rawHeaders.length;i+=2){const n=req.rawHeaders[i].toLowerCase();count[n]=(count[n]||0)+1;}
      if(['host','x-nsp-client-ip','content-length','content-type','origin','cookie','sec-fetch-site'].some(n=>count[n]>1)||req.headers['transfer-encoding']){fail(400,'Ambiguous HTTP framing');return;}
      if(req.headers.host!=='nsp-wiki.shiaoming.cn'){fail(403,'Unknown host');return;}
      if(!isIP(req.headers['x-nsp-client-ip']||'')){fail(503,'Trusted client address unavailable');return;}
      if(req.method==='GET'&&req.url==='/healthz'){
        const body=JSON.stringify(app.health());res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store','Content-Length':Buffer.byteLength(body),'Connection':'close'});res.end(body);return;
      }
      if(!req.url.startsWith('/api/')||req.url.startsWith('//')||/[\x00-\x20\\#]/.test(req.url)){fail(404,'Unknown API route');return;}
      const length=req.headers['content-length'];
      if(length&&!/^\d+$/.test(length)){fail(400,'Invalid content length');return;}
      const bodyLimit=req.method==='POST'&&new URL(ORIGIN+req.url).pathname==='/api/analytics/event'?1024:BODY_LIMIT;
      if(Number(length)>bodyLimit){fail(413,'Upload too large');return;}
      let size=0;const chunks=[];
      for await(const part of req){size+=part.length;if(size>bodyLimit){fail(413,'Upload too large');return;}chunks.push(part);}
      if(req.method==='GET'&&size){fail(400,'GET body unsupported');return;}
      const headers=new Headers();for(const [name,value] of Object.entries(req.headers))if(typeof value==='string')headers.set(name,value);
      const request=new Request(ORIGIN+req.url,{method:req.method,headers,...(size?{body:Buffer.concat(chunks)}:{})});
      const result=await app.handle(request,req.headers['x-nsp-client-ip']);
      const body=Buffer.from(await result.arrayBuffer()),output={};
      for(const [name,value] of result.headers)if(name!=='set-cookie')output[name]=value;
      const cookies=result.headers.getSetCookie();if(cookies.length)output['Set-Cookie']=cookies;
      output['Content-Length']=String(body.length);output.Connection='close';
      res.writeHead(result.status,output);res.end(body);
    }catch{fail(503,'Request failed; check whether the action succeeded before retrying');}
    finally{active--;}
  });
  server.headersTimeout=10000;server.requestTimeout=15000;server.maxRequestsPerSocket=1;server.maxConnections=32;
  server.setTimeout(30000,socket=>socket.destroy());return server;
}

if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),at=args.indexOf('--data-directory');
  if(at<0||!args[at+1]||!path.isAbsolute(args[at+1]))throw Error('An explicit absolute private data directory is required');
  process.umask(0o077);
  const dir=args[at+1],adminAt=args.indexOf('--admin-id-file');
  const adminAccountId=adminAt<0?null:readFileSync(args[adminAt+1],'utf8').trim();
  const option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
  let analytics=null;
  if(args.includes('--analytics-db')||args.includes('--analytics-secret-file')||args.includes('--analytics-items')){
    try{
      const file=option('--analytics-db'),secret=option('--analytics-secret-file'),items=option('--analytics-items');
      if(![file,secret,items].every(x=>x&&path.isAbsolute(x))||path.resolve(file)===path.resolve(dir,'community.sqlite'))throw Error('Invalid analytics configuration');
      const data=JSON.parse(readFileSync(items,'utf8'));if(!Array.isArray(data.items))throw Error('Invalid item catalogue');
      const sections=new Set(['home','items','quests','enemies','npcs','recipes','mirror','corruption','workshop','mechanics','loot','maps','tiers','feedback','updates','traffic']);
      const requestFile=option('--analytics-requests');if(requestFile&&!path.isAbsolute(requestFile))throw Error('Invalid request summary path');
      analytics=new Analytics({filename:file,secret:readFileSync(secret),itemIds:new Set(data.items.map(x=>x.id)),sections,requestMetrics:()=>{if(!requestFile)return null;const data=JSON.parse(readFileSync(requestFile,'utf8')),time=Date.parse(data.generatedAt);return Number.isFinite(time)&&time<=Date.now()+60000&&Date.now()-time<7200000?data:null;}});
      analytics.prune(90);
      setInterval(()=>{try{analytics.prune(90);}catch{console.error('Analytics retention cleanup failed');}},3600000).unref();
    }catch{console.error('Analytics unavailable; community remains enabled');}
  }
  const app=createIndependent({databaseFile:path.join(dir,'community.sqlite'),uploadsDir:path.join(dir,'uploads'),adminAccountId,registrationEnabled:args.includes('--allow-registration'),analytics});
  const portAt=args.indexOf('--listen-port'),port=portAt<0?8767:Number(args[portAt+1]);
  if(!Number.isInteger(port)||port<0||port>65535)throw Error('Invalid loopback port');
  const server=createHTTPServer(app);server.listen(port,'127.0.0.1',()=>{
    if(process.send)process.send({port:server.address().port,registrationEnabled:args.includes('--allow-registration')});
  });
}
