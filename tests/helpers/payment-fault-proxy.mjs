// Local browser QA only: interpose on the synthetic app, never a deployed backend.
// RUN_PAYMENT_NETWORK_QA=true QA_FAULT_DIR=outputs/payment-network node tests/helpers/payment-fault-proxy.mjs
// Write {"mode":"before"|"after"|"off"} to <directory>/control.json.
import http from 'node:http';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,appendFile} from 'node:fs/promises';
import path from 'node:path';
if(process.env.RUN_PAYMENT_NETWORK_QA!=='true')throw new Error('Explicit local fault-injection opt-in required');
const directory=process.env.QA_FAULT_DIR;
if(!directory)throw new Error('QA_FAULT_DIR required');
await mkdir(directory,{recursive:true});
await writeFile(path.join(directory,'control.json'),JSON.stringify({mode:'off'}));
const hash=value=>createHash('sha256').update(value).digest('hex');
const record=data=>appendFile(path.join(directory,'requests.jsonl'),JSON.stringify({at:new Date().toISOString(),...data})+'\n');
const server=http.createServer(async(req,res)=>{
 try{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  const body=Buffer.concat(chunks),payment=req.method==='POST'&&req.url==='/api/operations/payments';
  const {mode}=JSON.parse(await readFile(path.join(directory,'control.json'),'utf8'));
  const evidence=payment?{mode,bodyHash:hash(body),keyHash:hash(String(req.headers['idempotency-key']||''))}:null;
  if(payment&&mode==='before'){
   await record({...evidence,event:'dropped-before-forward'});res.destroy();return;
  }
  const upstream=http.request({hostname:'127.0.0.1',port:3100,path:req.url,method:req.method,headers:req.headers},response=>{
   if(payment&&mode==='after'){
    // Consume the application's successful response first: its transaction has committed.
    const result=[];response.on('data',chunk=>result.push(chunk));
    response.on('end',async()=>{
     await record({...evidence,event:'dropped-after-response',upstreamStatus:response.statusCode,responseHash:hash(Buffer.concat(result))});
     res.writeHead(200,{'content-type':'application/json','content-length':'1000','cache-control':'no-store'});
     res.write('{');setTimeout(()=>res.destroy(),100);
    });
   }else{
    if(payment)void record({...evidence,event:'forwarded',upstreamStatus:response.statusCode});
    res.writeHead(response.statusCode,response.headers);response.pipe(res);
   }
  });
  upstream.on('error',error=>{res.destroy(error);});
  upstream.end(body);
 }catch(error){res.destroy(error);}
});
server.listen(3101,'127.0.0.1',()=>console.log('Local fault proxy ready: 127.0.0.1:3101 -> 127.0.0.1:3100'));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
