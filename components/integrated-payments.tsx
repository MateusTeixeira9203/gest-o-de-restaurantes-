"use client";
import {useEffect,useRef,useState} from 'react';
type Item={operation_id:string;state:string;reason:string|null;environment:string;provider:string;status:string;amount_cents:string;method:string};
export function IntegratedPayments(){
 const [items,setItems]=useState<Item[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const locked=useRef(false);
 useEffect(()=>{const controller=new AbortController();fetch('/api/operations/integrated-payments',{cache:'no-store',signal:controller.signal}).then(async r=>{const d=await r.json() as {items:Item[];error?:string};if(!r.ok)throw new Error(d.error);setItems(d.items);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();},[]);
 async function check(operationId:string){
  if(locked.current)return;locked.current=true;setBusy(true);setError('');
  try{
   const r=await fetch('/api/operations/integrated-payments',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({operationId})});const d=await r.json() as {items:Item[];error?:string};if(!r.ok)throw new Error(d.error);
   const refreshed=await fetch('/api/operations/integrated-payments',{cache:'no-store'});const next=await refreshed.json() as {items:Item[];error?:string};if(!refreshed.ok)throw new Error(next.error);setItems(next.items);
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível conferir.');}finally{locked.current=false;setBusy(false);}
 }
 return <section className="command-card space-y-3 p-5"><h2 className="section-title">Pix e maquininhas integrados</h2><p className="text-sm text-neutral-600">A ativação depende do banco ou da maquininha de cada restaurante. Até a homologação, use o recebimento manual após conferir o pagamento. Gerar um QR Code não confirma o crédito.</p><p className="text-sm text-neutral-600">A confirmação da venda e o depósito da adquirente são etapas diferentes. Taxas e valor líquido continuam na conciliação abaixo.</p>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{!items.length&&<p className="text-sm text-neutral-500">Nenhuma cobrança integrada registrada.</p>}{items.map(i=><article key={i.operation_id} className="rounded-xl border p-3"><p className="font-medium">{i.provider} · {Number(i.amount_cents).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</p><p className="text-sm">{i.environment==='homologation'?'Homologação · sem movimento financeiro':'Produção'} · {i.state==='applied'?'Recebimento registrado':i.state==='review'?'Conferência necessária':'Aguardando confirmação'}</p>{i.reason&&<p className="my-2 text-sm text-amber-800">{i.reason}</p>}{i.environment==='production'&&i.status==='succeeded'&&i.state!=='applied'&&<button disabled={busy} onClick={()=>void check(i.operation_id)} className="mt-2 rounded-lg border px-3 py-2 text-sm">Conferir confirmação recebida</button>}</article>)}</section>;
}
