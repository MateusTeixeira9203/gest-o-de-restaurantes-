import { sessionFromRequest } from '@/lib/staff-session';
import { requireProfessional } from '@/modules/tenancy/context';
import { transaction } from '@/lib/database';
import { periodSchema } from '@/modules/finance/schema';
import { zipFiles } from '@/modules/fiscal/zip';
export async function GET(request:Request){
 const s=await sessionFromRequest(request);if(!s||!['admin','manager','cashier'].includes(s.role))return Response.json({error:'Acesso fiscal necessário.'},{status:403});
 try{
 await requireProfessional();const url=new URL(request.url);const period=periodSchema.parse({from:url.searchParams.get('from'),to:url.searchParams.get('to')});
 const bytes=await transaction(async c=>{
 await c.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
 const docs=(await c.query(`SELECT d.id,d.created_at,d.blockers,d.snapshot->'totalCents' AS total_cents,CASE WHEN co.status='succeeded' THEN 'cancelled' ELSE COALESCE(o.status,'draft') END AS status,co.status AS cancellation_status,o.reference,o.result FROM fiscal_documents d LEFT JOIN integration_operations o ON o.id=d.operation_id AND o.restaurant_id=d.restaurant_id LEFT JOIN integration_operations co ON co.restaurant_id=d.restaurant_id AND co.environment=d.environment AND co.kind='fiscal' AND co.operation_key='fiscal_cancel:'||d.id::text WHERE d.restaurant_id=$1 AND (d.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2 AND $3 ORDER BY d.created_at LIMIT 501`,[s.restaurantId,period.from,period.to])).rows;
 if(docs.length>500)throw new Error('Selecione um período menor: limite de 500 documentos por pacote.');
 const ids=docs.map(d=>d.id);
 const total=(await c.query('SELECT COALESCE(sum(octet_length(content)),0) AS size FROM fiscal_files WHERE restaurant_id=$1 AND document_id=ANY($2::uuid[])',[s.restaurantId,ids])).rows[0];
 if(Number(total.size)>32*1024*1024)throw new Error('Selecione um período menor: pacote acima de 32 MB.');
 const files=(await c.query('SELECT document_id,kind,content,mime,sha256 FROM fiscal_files WHERE restaurant_id=$1 AND document_id=ANY($2::uuid[]) ORDER BY document_id,kind',[s.restaurantId,ids])).rows;
 const index=docs.map(d=>({...d,files:files.filter(f=>f.document_id===d.id).map(f=>({kind:f.kind,sha256:f.sha256})),missingXml:!files.some(f=>f.document_id===d.id&&f.kind==='xml')}));
 const unprepared=(await c.query(`SELECT o.id,o.order_number,o.total_cents FROM orders o WHERE o.restaurant_id=$1 AND o.status IN ('completed','delivered') AND (o.created_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN $2 AND $3 AND NOT EXISTS(SELECT 1 FROM fiscal_order_links l WHERE l.restaurant_id=$1 AND l.order_id=o.id) ORDER BY o.created_at LIMIT 501`,[s.restaurantId,period.from,period.to])).rows;
 if(unprepared.length>500)throw new Error('Selecione um período menor para listar as vendas sem preparação.');
 const incomplete=unprepared.length>0||index.some(d=>d.missingXml||!['succeeded','cancelled'].includes(d.status)||(d.status==='cancelled'&&!d.files.some((f:{kind:string})=>f.kind==='cancellation'))||(d.cancellation_status&&d.cancellation_status!=='succeeded'));
 const entries=[{name:'LEIA-ME.txt',content:Buffer.from(`AMBIENTE DE HOMOLOGACAO - SEM VALIDADE FISCAL\nPacote ${incomplete?'INCOMPLETO: consulte pendencias no indice':'sem pendencias detectadas no recorte'}.\nFiltro: data de preparacao dos documentos; vendas sem preparacao por data de criacao.\nEste pacote nao substitui escrituracao, SPED ou validacao do contador.\n`)},{name:'indice.json',content:Buffer.from(JSON.stringify({environment:'homologation',period,incomplete,documents:index,unpreparedSales:unprepared},null,2))},...files.map(f=>({name:`documentos/${f.document_id}/${f.kind}.${f.mime==='application/pdf'?'pdf':'xml'}`,content:f.content}))];
 await c.query("INSERT INTO fiscal_events(restaurant_id,actor,action,detail) VALUES($1,$2,'exported',$3)",[s.restaurantId,s.username,{period,count:docs.length,incomplete}]);return zipFiles(entries);
 });
 return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'application/zip','Content-Disposition':'attachment; filename="fiscal-homologacao.zip"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Falha na exportação.'},{status:400});}
}
