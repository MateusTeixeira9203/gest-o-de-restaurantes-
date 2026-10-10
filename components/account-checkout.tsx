"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { toast } from "sonner";
import { useRestaurant } from "@/lib/restaurant-store";
import { money, type PaymentMethod } from "@/lib/domain";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
type Quote = {version:string;dueCents:number;amountCents:number;pix:null|{code:string;image:string;receiver:string;reference:string}};
type Draft = {id:string;method:PaymentMethod;value:string};
const methods:PaymentMethod[] = ["Pix","Dinheiro","Débito","Crédito"];
const cents=(value:string)=>Math.round(Number(value.replace(",","."))*100);
export function AccountCheckout({tableId,onBack}:{tableId:string;onBack:()=>void}) {
  const {state,refresh}=useRestaurant();
  const orders=state.orders.filter(o=>o.tableId===tableId&&!['completed','cancelled'].includes(o.status));
  const [quote,setQuote]=useState<Quote|null>(null),[rows,setRows]=useState<Draft[]>([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[confirm,setConfirm]=useState(false);
  const [qr,setQr]=useState<{quote:Quote;draft:string}|null>(null);
  const [uncertain,setUncertain]=useState(false);
  const accountSnapshot=JSON.stringify(orders.map(o=>[o.id,o.totalCents,o.paidCents,o.status==='pending']).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))));
  const [quoteSnapshot,setQuoteSnapshot]=useState<string|null>(null);
  const [reload,setReload]=useState(0),[notice,setNotice]=useState('');
  const previousSnapshot=useRef(accountSnapshot);
  const stale=quoteSnapshot!==accountSnapshot&&!uncertain;
  const intent=useRef<{payload:string;key:string}|null>(null);
  const received=rows.reduce((n,r)=>n+cents(r.value),0),cash=rows.filter(r=>r.method==='Dinheiro').reduce((n,r)=>n+cents(r.value),0);
  const draft=JSON.stringify(rows);
  const readQuote=useCallback(async()=>{
    const response=await fetch('/api/operations/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tableNumber:Number(tableId)})});
    const data=await response.json() as Quote & {error?:string};
    if(!response.ok)throw new Error(data.error);
    return data;
  },[tableId]);
  const applyQuote=useCallback((data:Quote)=>{
    setError('');setQr(null);setQuote(data);setRows([{id:crypto.randomUUID(),method:'Pix',value:(data.dueCents/100).toFixed(2)}]);
  },[]);
  function load(){setLoading(true);setConfirm(false);setQr(null);setReload(n=>n+1);}
  useEffect(()=>{
    // Never replace an unacknowledged payment: retry its original idempotent intent.
    if(uncertain)return;
    let active=true;
    const changed=previousSnapshot.current!==accountSnapshot;
    previousSnapshot.current=accountSnapshot;
    readQuote().then(data=>{if(active){applyQuote(data);setQuoteSnapshot(accountSnapshot);}})
      .catch(e=>{if(active){setQuote(null);setQuoteSnapshot(accountSnapshot);setError(e.message);}})
      .finally(()=>{if(active){setLoading(false);setConfirm(false);setQr(null);if(changed)setNotice('A conta foi alterada. Confira o saldo atualizado antes de receber.');}});
    return()=>{active=false;};
  },[readQuote,applyQuote,accountSnapshot,reload,uncertain]);
  const change=quote?Math.max(0,received-quote.dueCents):0;
  const valid=quote&&!stale&&!loading&&rows.length>0&&rows.every(r=>Number.isSafeInteger(cents(r.value))&&cents(r.value)>0)&&change<=cash&&!(change>0&&change===cash);
  const pixCents=rows.filter(r=>r.method==='Pix').reduce((n,r)=>n+cents(r.value),0);
  async function generatePix(){
    setBusy(true);setQr(null);
    try{
      const r=await fetch('/api/operations/checkout',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({tableNumber:Number(tableId),amountCents:pixCents})});
      const data=await r.json() as Quote & {error?:string};if(!r.ok)throw new Error(data.error);
      if(data.version!==quote?.version){setNotice('A conta mudou. Confira o saldo atualizado antes de apresentar o QR Code.');load();return;}
      if(!data.pix)throw new Error('O gestor precisa cadastrar a chave Pix em Configurações.');
      setQr({quote:data,draft});
    }catch(e){toast.error(e instanceof Error?e.message:'Não foi possível gerar o Pix.');}finally{setBusy(false);}
  }
  async function receive(){
    if(!quote||!valid)return;
    const payload=JSON.stringify({tableNumber:Number(tableId),expectedVersion:quote.version,allowPartial:true,payments:rows.map(r=>({method:r.method,amountCents:cents(r.value)}))});
    if(intent.current&&intent.current.payload!==payload){toast.error('Há uma confirmação sem resposta. Repita os mesmos valores antes de alterar a cobrança.');return;}
    intent.current??={payload,key:crypto.randomUUID()};
    setBusy(true);setUncertain(true);
    try{
      const r=await fetch('/api/operations/payments',{method:'POST',headers:{'content-type':'application/json','idempotency-key':intent.current.key},body:payload});
      const result=await r.json() as {error?:string;remainingCents:number;changeCents:number};
      if(!r.ok){if(r.status<500){intent.current=null;setUncertain(false);setConfirm(false);setQr(null);setQuote(null);setNotice(result.error||'A conta mudou. Confira o saldo atualizado.');load();}throw new Error(result.error||'Falha ao confirmar.');}
      intent.current=null;setUncertain(false);setConfirm(false);setQr(null);
      toast.success(result.remainingCents>0?`Recebimento registrado. Saldo: ${money(result.remainingCents/100)}`:result.changeCents>0?`Conta paga. Troco: ${money(result.changeCents/100)}`:'Conta paga. Entregas pendentes continuam no atendimento.');
      if(result.remainingCents>0)load();else {setQuote(null);setRows([]);onBack();}
      await refresh();
    }catch(e){const message=intent.current?'Não foi possível confirmar a resposta do recebimento. Repita a confirmação original; não cobre o cliente novamente.':e instanceof Error?e.message:'Não foi possível concluir a operação.';setNotice(message);toast.error(message);}finally{setBusy(false);}
  }
  return <main className="app-page"><div className="page-container max-w-5xl"><header className="topbar"><div><h1 className="text-xl font-semibold">Fechar conta · {state.tables.find(t=>t.id===tableId)?.label || `Mesa / comanda ${tableId}`}</h1><p className="text-sm text-neutral-500">Receba aqui, pelo celular ou no caixa.</p></div><button className="secondary-button" disabled={busy||uncertain} onClick={onBack}>Voltar</button></header><div className="checkout-layout"><section className="command-card p-5"><h2 className="section-title">Resumo da comanda</h2>{orders.map(o=><div key={o.id} className="border-b py-4"><strong>Pedido #{o.number}</strong>{o.items.map(i=><div key={i.id} className="flex justify-between gap-3 py-2"><span>{i.quantity}× {i.productName} · {i.variantName}{i.addons.map(a=><span className="block text-sm" key={a.id}>+ {a.name}</span>)}</span><span className="whitespace-nowrap">{money(i.quantity*(i.unitPrice+i.addons.reduce((n,a)=>n+a.price,0)))}</span></div>)}<p className="text-sm text-neutral-500">Serviço: {money((o.serviceCents??0)/100)} · Recebido: {money((o.paidCents??0)/100)}</p><p className="text-sm">{o.servedAt?'Entregue':o.status==='ready'?'Pronto para entregar':'Atendimento em andamento'}</p></div>)}<p className="mt-4 text-sm text-neutral-500">O recebimento não encerra pedidos que ainda precisam ser preparados ou entregues.</p></section><section className="payment-panel" aria-busy={loading||busy}><h2 className="section-title">Receber pagamento</h2>{notice&&<p role="status" className="text-sm text-amber-800">{notice}</p>}{uncertain&&!busy&&<p role="alert">Recebimento sem resposta conclusiva. Repita a confirmação original para consultar o resultado; não cobre o cliente novamente.</p>}{loading||stale?<p>Consultando saldo…</p>:error?<p role="alert">{error}</p>:quote&&<><div><p className="text-sm text-neutral-500">{uncertain?'Saldo da confirmação original':'Saldo a pagar'}</p><strong className="text-3xl">{money(quote.dueCents/100)}</strong></div><fieldset disabled={busy||uncertain} className="space-y-3">{rows.map((r,i)=><div key={r.id} className="payment-row"><select aria-label={`Forma ${i+1}`} value={r.method} onChange={e=>setRows(all=>all.map(v=>v.id===r.id?{...v,method:e.target.value as PaymentMethod}:v))}>{methods.map(m=><option key={m}>{m}</option>)}</select><label><span>R$</span><input aria-label={`Valor ${i+1}`} inputMode="decimal" value={r.value} onChange={e=>setRows(all=>all.map(v=>v.id===r.id?{...v,value:e.target.value}:v))}/></label>{rows.length>1&&<button aria-label={`Remover pagamento ${i+1}`} onClick={()=>setRows(all=>all.filter(v=>v.id!==r.id))}>×</button>}</div>)}<button className="secondary-button" disabled={rows.length>=12} onClick={()=>setRows(all=>[...all,{id:crypto.randomUUID(),method:'Crédito',value:(Math.max(0,quote.dueCents-received)/100).toFixed(2)}])}>Adicionar outra forma</button></fieldset>{pixCents>0&&<div className="space-y-3"><button className="secondary-button w-full justify-center" disabled={busy||!valid||pixCents>quote.dueCents||uncertain} onClick={()=>void generatePix()}>Mostrar QR Code Pix · {money(pixCents/100)}</button>{!quote.pix&&<p className="text-sm text-amber-700">Pix por QR ainda não configurado pelo gestor. Você pode conferir um Pix recebido por outro canal e registrá-lo aqui.</p>}{qr&&qr.draft===draft&&<div className="space-y-2 text-center"><Image src={qr.quote.pix!.image} width={320} height={320} unoptimized alt="QR Code Pix para o valor selecionado" className="mx-auto h-auto max-w-full"/><strong>{qr.quote.pix!.receiver} · {money(qr.quote.amountCents/100)}</strong><p className="text-xs break-all">Referência: {qr.quote.pix!.reference}</p><button className="secondary-button" onClick={()=>void navigator.clipboard.writeText(qr.quote.pix!.code).then(()=>toast.success('Pix copiado.')).catch(()=>toast.error('Não foi possível copiar.'))}>Copiar Pix</button><p className="text-sm text-amber-700">Confira o recebimento no banco. Este QR não confirma pagamento automaticamente e pode ser reutilizado: apresente uma única vez.</p></div>}</div>}{rows.some(r=>r.method==='Crédito'||r.method==='Débito')&&<p className="text-sm text-neutral-600">Maquininha sem integração: digite o valor no terminal e confirme aqui somente após a aprovação. Envio automático depende de equipamento compatível e homologação.</p>}<p className="text-sm">{received<quote.dueCents?`Saldo após este recebimento: ${money((quote.dueCents-received)/100)}`:`Troco em dinheiro: ${money(change/100)}`}</p><button className="primary-button w-full justify-center" disabled={!valid||busy} onClick={()=>setConfirm(true)}>{uncertain?'Consultar recebimento pendente':received<quote.dueCents?'Registrar recebimento parcial':'Confirmar recebimento'}</button><p className="text-xs text-neutral-500">Confirmação manual. Não basta visualizar o comprovante do cliente; confira o recebimento na sua conta ou terminal.</p></>}<button disabled={busy||loading||uncertain} className="secondary-button" onClick={()=>{setLoading(true);setQr(null);void load();}}>Atualizar saldo</button></section></div></div><Dialog open={confirm&&!stale} onOpenChange={v=>!busy&&setConfirm(v)}><DialogContent><DialogHeader><DialogTitle>{uncertain?'Consultar recebimento pendente':'O valor já foi recebido?'}</DialogTitle><DialogDescription>Você está registrando {money(Number.isFinite(received)?received/100:0)}. Esta ação não cobra o cliente automaticamente. Confira as formas abaixo.</DialogDescription></DialogHeader>{uncertain&&!busy&&<p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-950">A resposta do recebimento não chegou. Repita esta confirmação para recuperar o resultado com segurança. Não cobre o cliente novamente e não devolva o troco duas vezes.</p>}{rows.map(r=><p key={r.id}>{r.method}: {money(cents(r.value)/100)}</p>)}{change>0&&<div className="rounded-xl bg-amber-50 p-3 text-amber-950"><p className="font-semibold">Troco em dinheiro: {money(change/100)}</p><p className="text-sm">Valor aplicado à conta: {money((received-change)/100)}</p></div>}<button className="primary-button" disabled={busy} onClick={()=>void receive()}>{busy?'Registrando…':uncertain?'Recuperar resultado':'Recebimento conferido'}</button></DialogContent></Dialog></main>;
}
