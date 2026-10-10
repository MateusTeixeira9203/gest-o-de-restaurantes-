import { createHash } from 'node:crypto';
import { query } from '@/lib/database';
import { fiscalOperation,focusAvailability } from './service';
const host='https://homologacao.focusnfe.com.br';
export function focusFileUrl(path:string){
 const url=new URL(path,host);
 if(url.origin!==host||url.username||url.password||!url.pathname.startsWith('/arquivos/'))throw new Error('Endereço de arquivo fiscal não permitido.');
 return url;
}
async function boundedBody(response:Response,max:number){
 if(!response.ok||!response.body)throw new Error('Arquivo fiscal não disponível.');
 if(Number(response.headers.get('content-length'))>max)throw new Error('Arquivo excede limite.');
 const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>max)throw new Error('Arquivo excede limite.');chunks.push(next.value);}}finally{await reader.cancel();}
 return Buffer.concat(chunks);
}
export async function collectFiles(rid:string,id:string){
 const op=await fiscalOperation(rid,id);const settings=focusAvailability(rid);
 if(!settings.enabled)throw new Error('Conector de homologação não configurado.');
 if(!['succeeded','cancelled'].includes(op.status))throw new Error('Aguarde autorização antes de buscar arquivos.');
 const headers={Authorization:`Basic ${Buffer.from(settings.token+':').toString('base64')}`};
 const response=await fetch(`${host}/v2/nfce/${encodeURIComponent(op.reference)}`,{headers,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('Não foi possível consultar os arquivos na Focus.');
 const data=await response.json() as Record<string,unknown>;
 if(!['autorizado','cancelado'].includes(String(data.status))||typeof data.chave_nfe!=='string'||!/^\d{44}$/.test(data.chave_nfe))throw new Error('Autorização não confirmada.');
 if(data.ref&&data.ref!==op.reference)throw new Error('Referência fiscal divergente.');
 if(op.result?.externalId&&data.chave_nfe!==op.result.externalId)throw new Error('Chave fiscal divergente da autorização original.');
 if(data.cnpj_emitente&&data.cnpj_emitente!==op.payload.cnpj_emitente)throw new Error('Emitente divergente.');
 const files=[['xml','caminho_xml_nota_fiscal','application/xml'],['auxiliary','caminho_danfe','application/pdf'],['cancellation','caminho_xml_cancelamento','application/xml']];
 const saved:string[]=[];const missing:string[]=[];
 for(const [kind,key,mime] of files){
  if(typeof data[key]!=='string'){if(kind!=='cancellation')missing.push(kind);continue;}
  try{
   const url=focusFileUrl(data[key] as string);
   const content=await boundedBody(await fetch(url,{headers,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)}),8*1024*1024);
   if(kind==='auxiliary'&&!content.subarray(0,5).equals(Buffer.from('%PDF-')))throw new Error('Formato auxiliar não suportado.');
   if(kind!=='auxiliary'&&(!content.toString('utf8').includes(data.chave_nfe)||!content.toString('utf8').trimStart().startsWith('<')))throw new Error('XML incompatível com documento.');
   await query(`INSERT INTO fiscal_files(restaurant_id,document_id,kind,content,mime,sha256) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(document_id,kind) DO NOTHING`,[rid,id,kind,content,mime,createHash('sha256').update(content).digest('hex')]);saved.push(kind);
  }catch{missing.push(kind);}
 }
 await query("INSERT INTO fiscal_events(restaurant_id,document_id,actor,action,detail) VALUES($1,$2,'system','files_collected',$3)",[rid,id,{saved,missing}]);
 return {saved,missing};
}
