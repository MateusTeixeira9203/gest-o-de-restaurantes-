"use client";

import { useMemo, useState } from "react";
import { Boxes, Package, Plus, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRestaurant } from "@/lib/restaurant-store";
import { money } from "@/lib/domain";

type Unit = "un" | "g" | "kg" | "ml" | "L";
type MovementType = "purchase" | "loss" | "adjustment";

export function InventoryManagement() {
  const { state, inventoryEnabled, setInventoryEnabled, createInventoryItem, moveInventory, saveRecipe } = useRestaurant();
  const [adding, setAdding] = useState(false);
  const [moving, setMoving] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [material, setMaterial] = useState({ name: "", category: "Geral", unit: "un" as Unit, quantity: "0", minimum: "0", cost: "0" });
  const [movement, setMovement] = useState({ type: "purchase" as MovementType, quantity: "", cost: "", note: "" });
  const [productId, setProductId] = useState("");
  const selectedProduct = state.products.find(product => product.id === productId) ?? state.products[0];
  const [variantId, setVariantId] = useState("");
  const resolvedVariantId = selectedProduct?.variants.some(variant => variant.id === variantId) ? variantId : selectedProduct?.variants[0]?.id ?? "";
  const [ingredientId, setIngredientId] = useState("");
  const [ingredientQuantity, setIngredientQuantity] = useState("");
  const [components, setComponents] = useState<Array<{ itemId: string; quantity: number }>>([]);
  const activeItems = state.stock.filter(item => item.quantity >= 0);
  const selectedItem = state.stock.find(item => item.id === moving);
  const low = state.stock.filter(item => item.quantity <= item.minimum);
  const stockValue = state.stock.reduce((sum, item) => sum + item.quantity * (item.cost ?? 0), 0);
  const recipeComponents = useMemo(() => selectedProduct?.recipe[resolvedVariantId] ?? [], [selectedProduct, resolvedVariantId]);

  const enable = async (enabled: boolean) => {
    const result = await setInventoryEnabled(enabled);
    result.ok ? toast.success(enabled ? "Estoque ativado. Cadastre os materiais para começar." : "Estoque pausado. Nenhuma baixa será feita em novos pedidos.") : toast.error(result.message);
  };
  const addMaterial = async () => {
    const result = await createInventoryItem({ name: material.name, category: material.category, unit: material.unit, quantity: Number(material.quantity), minimumQuantity: Number(material.minimum), cost: Number(material.cost) });
    if (!result.ok) return toast.error(result.message);
    setMaterial({ name: "", category: "Geral", unit: "un", quantity: "0", minimum: "0", cost: "0" }); setAdding(false); toast.success("Material cadastrado.");
  };
  const registerMovement = async () => {
    if (!moving) return;
    const result = await moveInventory({ itemId: moving, type: movement.type, quantity: Number(movement.quantity), cost: movement.cost ? Number(movement.cost) : undefined, note: movement.note });
    if (!result.ok) return toast.error(result.message);
    setMovement({ type: "purchase", quantity: "", cost: "", note: "" }); setMoving(null); toast.success("Movimentação registrada.");
  };
  const addIngredient = () => {
    const quantity = Number(ingredientQuantity);
    if (!ingredientId || !Number.isFinite(quantity) || quantity <= 0) return toast.error("Selecione o material e informe a quantidade.");
    if (components.some(component => component.itemId === ingredientId)) return toast.error("Este material já está na ficha.");
    setComponents(current => [...current, { itemId: ingredientId, quantity }]); setIngredientId(""); setIngredientQuantity("");
  };
  const beginRecipe = () => setComponents(recipeComponents.map(component => ({ itemId: component.stockId, quantity: component.quantity })));
  const persistRecipe = async () => {
    if (!selectedProduct || !resolvedVariantId) return toast.error("Cadastre um produto antes de criar uma ficha técnica.");
    setSaving(true); const result = await saveRecipe(selectedProduct.id, resolvedVariantId, components); setSaving(false);
    result.ok ? toast.success(components.length ? "Ficha técnica salva." : "Ficha técnica removida. Este produto não dará baixa.") : toast.error(result.message);
  };

  if (!inventoryEnabled) return <main className="app-page"><div className="page-container max-w-3xl"><header className="mb-8"><p className="eyebrow">Módulo opcional</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Controle de estoque</h1><p className="mt-2 max-w-xl text-neutral-500">Ative somente quando quiser baixar ingredientes automaticamente por ficha técnica. Pedidos e caixa continuam funcionando sem ele.</p></header><section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 sm:p-8"><Package className="mb-5 text-amber-700" size={28} /><h2 className="text-xl font-semibold">Estoque ainda não está em uso</h2><p className="mt-2 max-w-lg text-sm leading-6 text-neutral-600">Ao ativar, a Gestão cadastra materiais, saldo inicial e a receita de cada produto. Produtos sem receita continuam vendendo, sem baixa automática.</p><button onClick={() => void enable(true)} className="primary-button mt-6"><Plus size={18} /> Ativar controle de estoque</button></section></div></main>;

  return <main className="app-page"><div className="page-container"><header className="mb-7 flex flex-wrap items-end justify-between gap-4"><div><p className="eyebrow">Gestão</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Estoque e fichas técnicas</h1><p className="mt-2 text-neutral-500">A baixa acontece na confirmação do pedido; cancelamentos devolvem o material.</p></div><div className="flex gap-2"><button onClick={() => setAdding(true)} className="secondary-button"><Plus size={17} /> Material</button><button onClick={() => void enable(false)} className="text-button">Pausar estoque</button></div></header>
    <div className="metric-grid compact"><Metric label="Materiais" value={String(state.stock.length)} icon={Boxes} /><Metric label="Estoque baixo" value={String(low.length)} icon={SlidersHorizontal} /><Metric label="Sem saldo" value={String(state.stock.filter(item => item.quantity <= 0).length)} icon={Package} /><Metric label="Valor estimado" value={money(stockValue)} icon={Boxes} /></div>
    <section className="data-table stock-table mt-7"><div className="data-head"><span>Material</span><span>Saldo</span><span>Mínimo</span><span>Status</span><span>Ação</span></div>{state.stock.length ? state.stock.map(item => { const status = item.quantity <= 0 ? "Sem estoque" : item.quantity <= item.minimum ? "Baixo" : "Normal"; return <div className="data-row" key={item.id}><strong>{item.name}<small className="block font-normal text-neutral-400">{item.category}</small></strong><span>{item.quantity.toLocaleString("pt-BR")} {item.unit}</span><span>{item.minimum.toLocaleString("pt-BR")} {item.unit}</span><span className={`stock-level ${status === "Normal" ? "ok" : status === "Baixo" ? "low" : "out"}`}>{status}</span><button onClick={() => setMoving(item.id)}>Movimentar</button></div>; }) : <div className="empty-state"><Package size={28} /><p>Cadastre o primeiro material, como muçarela, massa ou embalagem.</p><button className="secondary-button" onClick={() => setAdding(true)}>Cadastrar material</button></div>}</section>
    <section className="mt-8 rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6"><div className="mb-5"><p className="eyebrow">Ficha técnica</p><h2 className="mt-1 text-xl font-semibold">O que este produto consome?</h2><p className="mt-1 text-sm text-neutral-500">Configure por tamanho ou variação. Sem ficha, o item continua à venda, mas não baixa estoque.</p></div>{selectedProduct ? <div className="grid gap-3 sm:grid-cols-2"><label><span className="field-label">Produto</span><select className="form-input" value={selectedProduct.id} onChange={event => { setProductId(event.target.value); setVariantId(""); setComponents([]); }}><option value="">Selecione</option>{state.products.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label><label><span className="field-label">Variação</span><select className="form-input" value={resolvedVariantId} onChange={event => { setVariantId(event.target.value); setComponents([]); }}><option value="">Selecione</option>{selectedProduct.variants.map(variant => <option key={variant.id} value={variant.id}>{variant.name}</option>)}</select></label></div> : <p className="text-sm text-neutral-500">Cadastre produtos no Cardápio antes de criar fichas técnicas.</p>}{selectedProduct && <div className="mt-5"><div className="flex flex-wrap gap-2"><button className="secondary-button" onClick={beginRecipe}>Carregar ficha atual</button><button className="text-button" onClick={() => setComponents([])}>Limpar</button></div><div className="mt-4 grid gap-2 sm:grid-cols-[1fr_160px_auto]"><select className="form-input" value={ingredientId} onChange={event => setIngredientId(event.target.value)}><option value="">Material</option>{activeItems.map(item => <option value={item.id} key={item.id}>{item.name} ({item.unit})</option>)}</select><input className="form-input" type="number" min="0" step="0.001" value={ingredientQuantity} onChange={event => setIngredientQuantity(event.target.value)} placeholder="Quantidade" /><button className="secondary-button justify-center" onClick={addIngredient}>Adicionar</button></div><div className="mt-4 divide-y rounded-xl border border-neutral-200">{components.length ? components.map(component => { const item = state.stock.find(stock => stock.id === component.itemId); return <div className="flex items-center justify-between px-4 py-3 text-sm" key={component.itemId}><span>{item?.name ?? "Material"}</span><span className="flex items-center gap-3"><b>{component.quantity.toLocaleString("pt-BR")} {item?.unit}</b><button className="text-red-600" onClick={() => setComponents(current => current.filter(entry => entry.itemId !== component.itemId))}>Remover</button></span></div>; }) : <p className="p-4 text-sm text-neutral-500">Nenhum ingrediente adicionado nesta ficha.</p>}</div><button disabled={saving} className="primary-button mt-5" onClick={() => void persistRecipe()}>{saving ? "Salvando…" : "Salvar ficha técnica"}</button></div>}</section>
    <Dialog open={adding} onOpenChange={setAdding}><DialogContent className="rounded-2xl sm:max-w-md"><DialogHeader><DialogTitle>Novo material</DialogTitle><DialogDescription>Use a mesma unidade que será informada na receita.</DialogDescription></DialogHeader><div className="grid gap-3"><input className="form-input" value={material.name} onChange={event => setMaterial(current => ({ ...current, name: event.target.value }))} placeholder="Ex.: Muçarela" /><div className="grid grid-cols-2 gap-3"><input className="form-input" value={material.category} onChange={event => setMaterial(current => ({ ...current, category: event.target.value }))} placeholder="Categoria" /><select className="form-input" value={material.unit} onChange={event => setMaterial(current => ({ ...current, unit: event.target.value as Unit }))}>{(["un", "g", "kg", "ml", "L"] as Unit[]).map(unit => <option key={unit}>{unit}</option>)}</select></div><div className="grid grid-cols-3 gap-3"><input className="form-input" type="number" min="0" step="0.001" value={material.quantity} onChange={event => setMaterial(current => ({ ...current, quantity: event.target.value }))} placeholder="Saldo" /><input className="form-input" type="number" min="0" step="0.001" value={material.minimum} onChange={event => setMaterial(current => ({ ...current, minimum: event.target.value }))} placeholder="Mínimo" /><input className="form-input" type="number" min="0" step="0.01" value={material.cost} onChange={event => setMaterial(current => ({ ...current, cost: event.target.value }))} placeholder="Custo R$" /></div><button className="primary-button justify-center" onClick={() => void addMaterial()}>Salvar material</button></div></DialogContent></Dialog>
    <Dialog open={!!moving} onOpenChange={open => !open && setMoving(null)}><DialogContent className="rounded-2xl sm:max-w-md"><DialogHeader><DialogTitle>Movimentar estoque</DialogTitle><DialogDescription>{selectedItem?.name}</DialogDescription></DialogHeader><div className="grid gap-4"><div className="grid grid-cols-3 gap-2">{([['purchase', 'Compra'], ['loss', 'Perda'], ['adjustment', 'Ajuste']] as const).map(([type, label]) => <button key={type} onClick={() => setMovement(current => ({ ...current, type }))} className={movement.type === type ? "choice-card selected" : "choice-card"}>{label}</button>)}</div><input className="form-input" type="number" step="0.001" value={movement.quantity} onChange={event => setMovement(current => ({ ...current, quantity: event.target.value }))} placeholder={movement.type === "adjustment" ? "Quantidade (+ ou -)" : "Quantidade"} /><input className="form-input" type="number" min="0" step="0.01" value={movement.cost} onChange={event => setMovement(current => ({ ...current, cost: event.target.value }))} placeholder="Custo por unidade (opcional)" /><input className="form-input" value={movement.note} onChange={event => setMovement(current => ({ ...current, note: event.target.value }))} placeholder="Observação (opcional)" /><button className="primary-button justify-center" onClick={() => void registerMovement()}>Confirmar</button></div></DialogContent></Dialog>
  </div></main>;
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Boxes }) { return <div className="metric-card"><span className="metric-icon"><Icon size={18} /></span><div><p>{label}</p><strong>{value}</strong></div></div>; }
