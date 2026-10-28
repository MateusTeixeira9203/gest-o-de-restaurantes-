"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Check, CookingPot, Minus, Plus, Search, ShoppingBag, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Brand, Topbar } from "@/components/shared/blocos";
import { useRestaurant } from "@/lib/restaurant-store";
import type { CartItem, ChannelOrderInput, ExpectedPaymentMethod, Product, RestaurantState } from "@/lib/domain";
import { money, orderCode } from "@/lib/domain";
import { CustomerCheckoutDialog, type CustomerCheckoutValue } from "@/components/customer-checkout-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export function MenuBuilder({ tableId, source, publicMenu = false, deliveryLink = false, initialChannel = "pickup", onBack, onSent }: { initialChannel?: "pickup" | "delivery"; tableId?: string; source: "waiter" | "qr"; publicMenu?: boolean; deliveryLink?: boolean; onBack?: () => void; onSent?: (number: number) => void }) {
  const { state, branding, createOrder, createPublicOrder } = useRestaurant(); const [category, setCategory] = useState("Todos"); const [search, setSearch] = useState(""); const [selected, setSelected] = useState<Product | null>(null); const [cart, setCart] = useState<CartItem[]>([]); const [cartOpen, setCartOpen] = useState(false); const [checkoutOpen, setCheckoutOpen] = useState(false); const [success, setSuccess] = useState<number | null>(null);
  const [channel, setChannel] = useState(initialChannel);
  const [changeCents, setChangeCents] = useState<number | null>(null);
  const channelOrder = source === "waiter" && !tableId && !publicMenu;
  const categories = ["Todos", ...new Set(state.products.map(product => product.category))];
  const filtered = state.products.filter(p => (category === "Todos" || p.category === category) && p.name.toLowerCase().includes(search.toLowerCase()));
  const total = cart.reduce((sum, item) => { const p = state.products.find(x => x.id === item.productId)!; const variant = p.variants.find(v => v.id === item.variantId)!; return sum + item.quantity * (variant.price + p.addons.filter(a => item.addonIds.includes(a.id)).reduce((a, b) => a + b.price, 0)); }, 0);
  const confirmPublic = async (value: CustomerCheckoutValue) => {
    const result = await createPublicOrder({
      source: tableId ? "qr_menu" : "public_menu", fulfillment: value.fulfillment,
      tableNumber: tableId ? Number(tableId) : undefined,
      customer: { name: value.name, phone: value.phone }, items: cart,
      delivery: value.fulfillment === "delivery" ? { addressLine1: value.addressLine1!, neighborhood: value.neighborhood, reference: value.reference, latitude: value.latitude, longitude: value.longitude } : undefined,
    });
    if (!result.ok) { toast.error(result.message); return false; }
    setCart([]); setCartOpen(false); setSuccess(result.number); return true;
  };
  const submitting = useRef(false);
  const [sending, setSending] = useState(false);
  const submit = async () => {
    if (publicMenu) {
      setCartOpen(false); setCheckoutOpen(true); return;
    }
    if (channelOrder) { setCartOpen(false); setCheckoutOpen(true); return; }
    if (!tableId || submitting.current) return; submitting.current=true; setSending(true); const result = await createOrder(tableId, cart, source).finally(()=>{submitting.current=false; setSending(false);}); if (!result.ok) { toast.error(result.message); return; } setCart([]); setCartOpen(false); setSuccess(result.number); onSent?.(result.number);
  };
  if (success) return <MenuSuccess number={success} channel={channelOrder ? channel : undefined} changeCents={changeCents} publicMenu={publicMenu} tableId={tableId} deliveryLink={deliveryLink} onBack={onBack} />;
  return <main className={publicMenu ? "customer-page" : "app-page"}><div className={publicMenu ? "customer-shell" : "page-container"}>
    <MenuHeading publicMenu={publicMenu} tableId={tableId} deliveryLink={deliveryLink} channelOrder={channelOrder} channel={channel} onChannel={setChannel} onBack={onBack} branding={branding} name={state.settings.name} />
    <div className="menu-toolbar"><div className="search-box"><Search size={18} /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar no cardápio" aria-label="Buscar produtos" /></div><div className="category-scroll">{categories.map(c => <button key={c} onClick={() => setCategory(c)} className={category === c ? "category-chip active" : "category-chip"}>{c}</button>)}</div></div>
    <section className="product-grid">{filtered.map(product => { const unavailable = !product.available || !isProductStockAvailable(state, product); return <button key={product.id} onClick={() => !unavailable && setSelected(product)} disabled={unavailable} className="product-card text-left">
      {product.imageUrl ? <div className="customer-product-photo"><Image src={product.imageUrl} alt={product.name} fill sizes="(max-width: 720px) 100vw, 320px" unoptimized /></div> : <div className="flex items-start justify-between gap-3"><div className="product-symbol">{product.category === "Pizzas" ? "🍕" : product.category === "Bebidas" ? "🥤" : product.category === "Açaí" ? "🫐" : product.category === "Sorvetes" ? "🍨" : product.category === "Pastéis" ? "🥟" : "🍽️"}</div></div>}
      <div className="flex items-start justify-between gap-2">{unavailable && <span className="sold-out">Indisponível</span>}</div><h3>{product.name}</h3><p>{product.description}</p><strong>A partir de {money(Math.min(...product.variants.map(v => v.price)))}</strong>
    </button>; })}</section>
    {cart.length > 0 && <button onClick={() => setCartOpen(true)} className="cart-dock"><span className="cart-count">{cart.reduce((s, i) => s + i.quantity, 0)}</span><span>Ver pedido</span><strong>{money(total)}</strong></button>}
    <ProductDialog product={selected} open={!!selected} onOpenChange={open => !open && setSelected(null)} onAdd={item => { setCart(c => [...c, item]); setSelected(null); toast.success("Item adicionado"); }} />
    <CartSheet open={cartOpen} onOpenChange={setCartOpen} cart={cart} setCart={setCart} state={state} total={total} submit={submit} sending={sending} whatsapp={false} submitLabel={publicMenu || channelOrder ? "Continuar pedido" : "Enviar para cozinha"} />
    {channelOrder && <StaffChannelCheckout open={checkoutOpen} onOpenChange={setCheckoutOpen} channel={channel} cart={cart} total={total} defaultFeeCents={state.settings.defaultDeliveryFeeCents} onSuccess={(number, change) => {setCheckoutOpen(false); setCart([]); setSuccess(number); setChangeCents(change);}} />}
    {publicMenu && <CustomerCheckoutDialog open={checkoutOpen} onOpenChange={setCheckoutOpen} tableId={tableId} deliveryOnly={deliveryLink} total={total} onConfirm={confirmPublic} />}
  </div></main>;
}

type Channel = "pickup" | "delivery";


function MenuSuccess({number, channel, changeCents, publicMenu, tableId, deliveryLink, onBack}: {
  number: number; channel?: Channel; changeCents: number | null; publicMenu: boolean; tableId?: string; deliveryLink: boolean; onBack?: () => void;
}) {
  return <main className="customer-page"><div className="success-card"><span className="success-icon"><Check size={30} /></span><p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">Pedido enviado</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">{channel ? orderCode({orderNumber:number,fulfillment:channel,tableNumber:null}) : `Pedido #${number}`}</h1><p className="mt-3 text-neutral-500">{publicMenu ? "Recebemos sua solicitação. A equipe vai conferir e aprovar antes de enviar para a cozinha." : "Pedido aprovado e enviado para a cozinha."}</p>{changeCents !== null && <p className="mt-3 text-xl font-semibold">Troco: {money(changeCents / 100)}</p>}{channel ? <button className="primary-button mt-7" onClick={onBack}>Voltar ao salão</button> : <Link href={tableId ? `/menu/mesa/${tableId}` : deliveryLink ? "/menu/entrega" : "/menu"} className="primary-button mt-7">Voltar ao cardápio</Link>}</div></main>;
}

function MenuHeading({publicMenu, tableId, deliveryLink, channelOrder, channel, onChannel, onBack, branding, name}: {
  publicMenu: boolean; tableId?: string; deliveryLink: boolean; channelOrder: boolean; channel: Channel; onChannel: (channel: Channel) => void; onBack?: () => void; branding: {coverUrl: string | null}; name: string;
}) {
  if (publicMenu) return <><CustomerHeader tableId={tableId} deliveryLink={deliveryLink} /><div className="menu-hero"><Image src={branding.coverUrl || "/menu-hero.png"} fill sizes="(max-width: 768px) 100vw, 720px" alt={branding.coverUrl ? `Foto de capa de ${name}` : "Pizza de calabresa artesanal"} className="object-cover" priority unoptimized={Boolean(branding.coverUrl)} /><div className="menu-hero-overlay"><span className="live-pill"><Sparkles size={13} /> Feito na hora</span><h1>Seu pedido,<br />do seu jeito.</h1></div></div></>;
  return <><Topbar title="Novo pedido" subtitle={tableId ? `Mesa / comanda ${tableId}` : "Escolha o canal e os itens do pedido"} back="#" action={<button onClick={onBack} className="text-button">Cancelar</button>} />{channelOrder && <div role="group" aria-label="Canal do pedido" className="mb-5 flex flex-wrap gap-3"><button className="secondary-button" aria-pressed={channel === "pickup"} onClick={() => onChannel("pickup")}>Balcão{channel === "pickup" ? " · selecionado" : ""}</button><button className="secondary-button" aria-pressed={channel === "delivery"} onClick={() => onChannel("delivery")}>Entrega{channel === "delivery" ? " · selecionado" : ""}</button></div>}</>;
}

function StaffChannelCheckout({open, onOpenChange, channel, cart, total, defaultFeeCents = 0, onSuccess}: {
  open: boolean; onOpenChange: (open: boolean) => void; channel: Channel; cart: CartItem[]; total: number; defaultFeeCents?: number; onSuccess: (number: number, changeCents: number | null) => void;
}) {
  const {createChannelOrder} = useRestaurant();
  const [fee, setFee] = useState(String(defaultFeeCents / 100));
  const [method, setMethod] = useState<ExpectedPaymentMethod>("pix");
  const [tendered, setTendered] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const feeCents = channel === "delivery" ? Math.round(Number(fee) * 100) : 0;
  const totalCents = Math.round(total * 100) + feeCents;
  const change = Math.round(Number(tendered) * 100) - totalCents;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError("");
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    const input: ChannelOrderInput = channel === "pickup" ? {fulfillment:channel,customer:{name},items:cart} : {
      fulfillment:channel,customer:{name,phone:String(data.get("phone") ?? "").trim()},items:cart,
      delivery:{addressLine1:String(data.get("addressLine1") ?? "").trim(),neighborhood:String(data.get("neighborhood") ?? "").trim(),reference:String(data.get("reference") ?? "").trim()},
      deliveryFeeCents:feeCents,expectedPaymentMethod:method,cashTenderedCents:method === "cash" && tendered !== "" ? Math.round(Number(tendered) * 100) : undefined,
    };
    try {
      const result = await createChannelOrder(input);
      if (!result.ok) {setError(result.message); return;}
      onSuccess(result.number, result.changeCents);
    } finally {submitting.current = false; setBusy(false);}
  }
  return <Dialog open={open} onOpenChange={value => !busy && onOpenChange(value)}><DialogContent className="customer-checkout-dialog"><DialogHeader><DialogTitle>{channel === "delivery" ? "Pedido de entrega" : "Pedido de balcão"}</DialogTitle><DialogDescription>Confira os dados antes de enviar para a cozinha.</DialogDescription></DialogHeader><form onSubmit={event => void submit(event)} className="customer-checkout-form"><fieldset disabled={busy} className="space-y-4"><label className="field-label">Nome do cliente<input name="name" className="form-input text-base" autoComplete="name" required minLength={2} maxLength={100} /></label>{channel === "delivery" && <><label className="field-label">Telefone<input name="phone" className="form-input text-base" type="tel" autoComplete="tel" required minLength={8} maxLength={24} /></label><label className="field-label">Rua e número<input name="addressLine1" className="form-input text-base" autoComplete="street-address" required minLength={4} maxLength={180} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="field-label">Bairro<input name="neighborhood" className="form-input text-base" maxLength={100} /></label><label className="field-label">Referência<input name="reference" className="form-input text-base" maxLength={180} /></label></div><label className="field-label">Taxa de entrega (R$)<input className="form-input text-base" type="number" inputMode="decimal" min="0" max="200" step="0.01" value={fee} onChange={event => setFee(event.target.value)} required /></label><label className="field-label">Forma prevista<select className="form-input text-base" value={method} onChange={event => setMethod(event.target.value as ExpectedPaymentMethod)}><option value="pix">Pix</option><option value="cash">Dinheiro</option><option value="debit">Débito</option><option value="credit">Crédito</option><option value="prepaid">Já pago</option></select></label>{method === "cash" && <label className="field-label">Troco para (R$)<input className="form-input text-base" type="number" inputMode="decimal" min="0" max="10000" step="0.01" value={tendered} onChange={event => setTendered(event.target.value)} /></label>}</>}</fieldset><StaffOrderTotal totalCents={totalCents} showChange={channel === "delivery" && method === "cash" && tendered !== ""} change={change} />{error && <p role="alert" className="text-base text-red-700">{error}</p>}<button type="submit" disabled={busy || !cart.length} aria-busy={busy} className="primary-button w-full justify-center">{busy ? "Enviando pedido…" : "Enviar pedido"}</button></form></DialogContent></Dialog>;
}

function StaffOrderTotal({totalCents, showChange, change}: {totalCents:number; showChange:boolean; change:number}) {
  return <div className="text-base"><p>Total: <strong>{money(totalCents / 100)}</strong></p>{showChange && <p>{change >= 0 ? `Troco previsto: ${money(change / 100)}` : "O valor para troco é menor que o total."}</p>}<p className="mt-2 text-sm text-neutral-500">O total e o troco serão confirmados pelo servidor ao enviar.</p></div>;
}

function CustomerHeader({ tableId, deliveryLink }: { tableId?: string; deliveryLink?: boolean }) { return <header className="customer-header"><Brand subtitle="Cardápio" /><div className="text-right"><p className="text-xs uppercase tracking-wider text-neutral-400">{tableId ? "Você está na" : deliveryLink ? "Cardápio para entrega" : "Cardápio online"}</p><strong>{tableId ? `Mesa / comanda ${tableId}` : deliveryLink ? "Receba em casa" : "Peça online"}</strong></div></header>; }

function isProductStockAvailable(state: RestaurantState, product: Product) { return product.variants.some(variant => variant.stockAvailable !== false && (product.recipe[variant.id] ?? []).every(component => (state.stock.find(s => s.id === component.stockId)?.quantity ?? 0) >= component.quantity)); }

function ProductDialog({ product, open, onOpenChange, onAdd }: { product: Product | null; open: boolean; onOpenChange: (open: boolean) => void; onAdd: (item: CartItem) => void }) {
  const [variantId, setVariantId] = useState(""); const [addonIds, setAddonIds] = useState<string[]>([]); const [note, setNote] = useState(""); const [qty, setQty] = useState(1);
  // Resetting the form here is intentional: each newly selected product starts clean.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (product) { setVariantId(product.variants[0]?.id ?? ""); setAddonIds([]); setNote(""); setQty(1); } }, [product]); if (!product) return null;
  const variant = product.variants.find(v => v.id === variantId) ?? product.variants[0]; const price = qty * (variant.price + product.addons.filter(a => addonIds.includes(a.id)).reduce((s, a) => s + a.price, 0));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92vh] overflow-y-auto rounded-3xl border-0 p-0 sm:max-w-xl"><DialogHeader className="border-b border-neutral-100 p-6 pr-12"><DialogTitle className="text-2xl">{product.name}</DialogTitle><DialogDescription className="text-base">{product.description}</DialogDescription></DialogHeader><div className="space-y-6 p-6"><div><label className="field-label">Escolha o tamanho</label><div className="grid gap-2 sm:grid-cols-3">{product.variants.map(v => <button key={v.id} disabled={v.stockAvailable === false} onClick={() => setVariantId(v.id)} className={variantId === v.id ? "choice-card selected" : "choice-card"}><span>{v.name}{v.stockAvailable === false ? " · indisponível" : ""}</span><strong>{money(v.price)}</strong></button>)}</div></div>{product.addons.length > 0 && <div><label className="field-label">Adicionais</label><div className="space-y-2">{product.addons.map(a => <label key={a.id} className="addon-row"><input type="checkbox" checked={addonIds.includes(a.id)} onChange={() => setAddonIds(ids => ids.includes(a.id) ? ids.filter(id => id !== a.id) : [...ids, a.id])} /><span>{a.name}</span><strong>+ {money(a.price)}</strong></label>)}</div></div>}<div><label className="field-label" htmlFor="note">Observação</label><textarea id="note" value={note} onChange={e => setNote(e.target.value)} placeholder="Ex.: sem cebola" className="text-area" /></div><div className="flex items-center justify-between"><div className="quantity"><button aria-label="Diminuir quantidade" disabled={qty <= 1} onClick={() => setQty(q => Math.max(1, q - 1))}><Minus size={17} /></button><strong>{qty}</strong><button aria-label="Aumentar quantidade" onClick={() => setQty(q => q + 1)}><Plus size={17} /></button></div><button disabled={variant.stockAvailable === false} onClick={() => onAdd({ key: crypto.randomUUID(), productId: product.id, variantId: variantId || variant.id, addonIds, note, quantity: qty })} className="primary-button">Adicionar · {money(price)}</button></div></div></DialogContent></Dialog>;
}

function CartSheet({ open, onOpenChange, cart, setCart, state, total, submit, sending = false, whatsapp, submitLabel }: { open: boolean; onOpenChange: (open: boolean) => void; cart: CartItem[]; setCart: React.Dispatch<React.SetStateAction<CartItem[]>>; state: RestaurantState; total: number; submit: () => void; sending?: boolean; whatsapp?: boolean; submitLabel?: string }) {
  return <Sheet open={open} onOpenChange={onOpenChange}><SheetContent className="w-full sm:max-w-md"><SheetHeader className="border-b border-neutral-100 p-6"><SheetTitle className="text-xl">Seu pedido</SheetTitle><SheetDescription>{cart.reduce((s, i) => s + i.quantity, 0)} itens adicionados</SheetDescription></SheetHeader><div className="flex-1 overflow-y-auto p-6"><div className="space-y-5">{cart.map(item => { const p = state.products.find(x => x.id === item.productId)!; const v = p.variants.find(x => x.id === item.variantId)!; return <div key={item.key} className="cart-row"><div><p className="font-semibold">{item.quantity}× {p.name}</p><p className="text-sm text-neutral-500">{v.name}</p>{p.addons.filter(a => item.addonIds.includes(a.id)).map(a => <p key={a.id} className="text-sm text-neutral-500">+ {a.name}</p>)}{item.note && <p className="mt-1 text-sm text-amber-700">{item.note}</p>}</div><div className="text-right"><strong>{money(item.quantity * (v.price + p.addons.filter(a => item.addonIds.includes(a.id)).reduce((s, a) => s + a.price, 0)))}</strong><button onClick={() => setCart(c => c.filter(x => x.key !== item.key))} className="mt-2 block w-full text-right text-xs text-red-600">Remover</button></div></div>; })}</div></div><div className="border-t border-neutral-200 p-6"><div className="mb-5 flex items-center justify-between"><span className="text-neutral-500">Total</span><strong className="text-2xl">{money(total)}</strong></div><button onClick={submit} disabled={sending || !cart.length} aria-busy={sending} className="primary-button w-full justify-center">{sending ? "Enviando pedido…" : whatsapp ? <><ShoppingBag size={18} /> Pedir pelo WhatsApp</> : <><CookingPot size={18} /> {submitLabel||"Enviar pedido"}</>}</button>{whatsapp && <p className="mt-3 text-center text-xs text-neutral-400">O pedido só será confirmado após o envio no WhatsApp.</p>}</div></SheetContent></Sheet>;
}

