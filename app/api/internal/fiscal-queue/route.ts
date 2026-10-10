import { timingSafeEqual } from 'node:crypto';
import { processFiscalQueue } from '@/modules/fiscal/worker';
export const maxDuration=60;
export async function POST(request:Request){
 const secret=process.env.FISCAL_WORKER_SECRET;
 const provided=request.headers.get('authorization')||'';
 const expected=secret?`Bearer ${secret}`:'';
 if(!secret||secret.length<32||Buffer.byteLength(provided)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(provided),Buffer.from(expected)))return new Response(null,{status:403});
 try{return Response.json(await processFiscalQueue(),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Processamento interrompido; operações incertas serão consultadas novamente.'},{status:503});}
}
