import { database,query } from '@/lib/database';
import { focusAvailability } from './service';
import { focusHomologation } from './focus';
import { dispatch } from '@/modules/integrations/queue';
// Only already-approved/enqueued operations are eligible; a scheduler never creates a fiscal draft.
export async function processFiscalQueue(){
 if(process.env.FOCUS_NFE_HOMOLOGATION_ENABLED!=='true')return {enabled:false,processed:0};
 const jobs=(await query(`SELECT o.id,o.restaurant_id,o.payload FROM integration_operations o
 WHERE o.provider='focus' AND o.kind='fiscal' AND o.environment='homologation'
 AND o.status IN ('prepared','dispatching','unknown','pending') AND (o.lease_until IS NULL OR o.lease_until<now())
 AND EXISTS(SELECT 1 FROM fiscal_documents d WHERE d.restaurant_id=o.restaurant_id AND (d.operation_id=o.id OR o.operation_key='fiscal_cancel:'||d.id::text))
 ORDER BY o.updated_at LIMIT 3`)).rows;
 let processed=0;
 for(const job of jobs){
  const config=focusAvailability(job.restaurant_id);if(!config.enabled)continue;
  const c=await database.connect();try{await dispatch(c,job.restaurant_id,job.id,focusHomologation({restaurantId:job.restaurant_id,issuerCnpj:String(job.payload.cnpj_emitente),token:config.token,enabled:true,taxProfileValidated:true}));processed++;}finally{c.release();}
 }
 return {enabled:true,processed};
}
