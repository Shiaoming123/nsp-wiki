import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {readFileSync} from 'node:fs';

test('HTTP boundary limits normalized analytics event paths before reading the body',async()=>{
  const source=readFileSync(new URL('./server.mjs',import.meta.url),'utf8').replace("import {createIndependent,ORIGIN,BODY_LIMIT} from './independent.mjs';","const ORIGIN='https://nsp-wiki.shiaoming.cn', BODY_LIMIT=5308416;").replace("import {Analytics} from './analytics.mjs';",'').replace('if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){','if(false){');
  const {createHTTPServer}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
  let calls=0;const server=createHTTPServer({handle:async()=>{calls++;return new Response(null,{status:204});}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const request=(route,size)=>new Promise((resolve,reject)=>{const req=http.request({host:'127.0.0.1',port:server.address().port,path:route,method:'POST',headers:{Host:'nsp-wiki.shiaoming.cn','x-nsp-client-ip':'127.0.0.1',Origin:'https://nsp-wiki.shiaoming.cn','Content-Length':size}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.end(Buffer.alloc(size));});
  try{assert.equal(await request('/api/analytics/event',1025),413);assert.equal(await request('/api/analytics/x/../event',1025),413);assert.equal(calls,0);assert.equal(await request('/api/analytics/event',10),204);assert.equal(calls,1);}finally{await new Promise(resolve=>server.close(resolve));}
});
