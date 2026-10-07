"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { ImagePlus, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRestaurant } from "@/lib/restaurant-store";
import { money, type Product } from "@/lib/domain";

type PriceRow = { id?: string; name: string; cents: number };
type Draft = { name: string; description: string; category: string; sector: string; available: boolean; featured: boolean; variants: PriceRow[]; addons: PriceRow[] };
const emptyDraft = (): Draft => ({ name: "", description: "", category: "Lanches", sector: "Cozinha", available: true, featured: false, variants: [{ name: "Padrão", cents: 0 }], addons: [] });
const fromProduct = (product: Product): Draft => ({ name: product.name, description: product.description, category: product.category, sector: product.sector, available: product.available, featured: !!product.featured, variants: product.variants.map(v => ({ id: v.id, name: v.name, cents: Math.round(v.price * 100) })), addons: product.addons.map(a => ({ id: a.id, name: a.name, cents: Math.round(a.price * 100) })) });
const displayPrice = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const parsePrice = (value: string) => Number(value.replace(/\D/g, "")) || 0;

function PriceEditor({ title, hint, rows, setRows, max }: { title: string; hint: string; rows: PriceRow[]; setRows: (rows: PriceRow[]) => void; max: number }) {
  return <section className="admin-form-section"><div className="flex items-center justify-between gap-3"><div><h4>{title}</h4><p>{hint}</p></div><button type="button" className="secondary-button" disabled={rows.length >= max} onClick={() => setRows([...rows, { name: "", cents: 0 }])}><Plus size={15} /> Adicionar</button></div><div className="mt-3 space-y-2">{rows.map((row, index) => <div key={row.id || index} className="price-editor-row"><input aria-label={`Nome de ${title.toLowerCase()} ${index + 1}`} placeholder={title === "Tamanhos e preços" ? "Ex.: Grande" : "Ex.: Bacon"} value={row.name} onChange={e => setRows(rows.map((item, i) => i === index ? { ...item, name: e.target.value } : item))} /><label className="price-input"><span>R$</span><input inputMode="decimal" aria-label={`Preço de ${row.name || title} ${index + 1}`} value={displayPrice(row.cents)} onChange={e => setRows(rows.map((item, i) => i === index ? { ...item, cents: parsePrice(e.target.value) } : item))} /></label><button type="button" className="icon-button" disabled={title === "Tamanhos e preços" && rows.length === 1} onClick={() => setRows(rows.filter((_, i) => i !== index))} aria-label="Remover opção"><Trash2 size={16} /></button></div>)}</div></section>;
}

export function ManagementMenu() {
  const { state, refresh, toggleProduct } = useRestaurant();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Product | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const categories = [...new Set(state.products.map(p => p.category))];
  const filtered = state.products.filter(p => `${p.name} ${p.category}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const start = (product?: Product) => { setEditing(product || null); setDraft(product ? fromProduct(product) : emptyDraft()); setPhoto(null); setPreview(null); setAdvanced(!!product && (product.variants.length > 1 || product.addons.length > 0)); setOpen(true); };
  const choosePhoto = (file: File | null) => { setPhoto(file); setPreview(file ? URL.createObjectURL(file) : null); };
  const save = async () => {
    if (!draft.name.trim() || !draft.category.trim() || !draft.sector.trim()) { toast.error("Preencha nome, categoria e setor."); return; }
    if (!draft.variants.length || draft.variants.some(v => !v.name.trim() || v.cents <= 0)) { toast.error("Informe um nome e preço maior que zero para cada tamanho."); return; }
    if (draft.addons.some(a => !a.name.trim() || a.cents < 0)) { toast.error("Confira os adicionais."); return; }
    if (photo && !photo.type.startsWith("image/")) { toast.error("Escolha uma imagem válida."); return; }
    if (photo && photo.size > 5_000_000) { toast.error("A foto deve ter até 5 MB."); return; }
    setBusy(true);
    try {
      const body = { name: draft.name.trim(), description: draft.description.trim(), category: draft.category.trim(), sector: draft.sector, available: draft.available, featured: draft.featured, variants: draft.variants.map(v => ({ id: v.id, name: v.name.trim(), priceCents: v.cents })), addons: draft.addons.map(a => ({ id: a.id, name: a.name.trim(), priceCents: a.cents })) };
      const response = await fetch(editing ? `/api/operations/products/${editing.id}` : "/api/operations/products", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const result = await response.json() as { error?: string; id?: string };
      if (!response.ok) throw new Error(result.error || "Não foi possível salvar o produto.");
      const id = editing?.id || result.id;
      if (photo) {
        const form = new FormData(); form.set("image", photo);
        const imageResponse = await fetch(`/api/operations/products/${id}/image`, { method: "PUT", body: form });
        if (!imageResponse.ok) { const error = await imageResponse.json() as { error?: string }; throw new Error(`Produto salvo, mas a foto falhou: ${error.error || "tente novamente"}`); }
      }
      await refresh(); setOpen(false); toast.success(editing ? "Produto atualizado." : "Produto cadastrado no cardápio.");
    } catch (error) { await refresh(); toast.error(error instanceof Error ? error.message : "Falha ao salvar produto."); }
    finally { setBusy(false); }
  };
  return <><div className="page-heading"><div><h2>Cardápio</h2><p>Fotos, preços e opções fáceis de atualizar durante o atendimento.</p></div><button onClick={() => start()} className="primary-button"><Plus size={17} /> Adicionar produto</button></div><div className="admin-search"><Search size={17} /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar produto ou categoria" aria-label="Buscar produto" /><span>{state.products.length} produtos</span></div><div className="menu-admin-grid">{filtered.map(p => <article key={p.id} className="menu-admin-card improved"><div className="admin-product-photo">{p.imageUrl ? <Image src={p.imageUrl} alt={p.name} fill sizes="(max-width: 720px) 100vw, 300px" unoptimized /> : <ImagePlus size={28} />}</div><div className="admin-product-body"><div className="flex items-center justify-between gap-2"><span className="admin-category">{p.category}</span><button onClick={() => void toggleProduct(p.id)} className={p.available ? "availability on" : "availability"}><i />{p.available ? "Disponível" : "Indisponível"}</button></div><h3>{p.name}</h3><p>{p.description || "Sem descrição"}</p><div className="flex items-center justify-between gap-2"><strong>{p.variants.length > 1 ? "A partir de " : ""}{money(Math.min(...p.variants.map(v => v.price)))}</strong><button onClick={() => start(p)} className="secondary-button"><Pencil size={15} /> Editar</button></div></div></article>)}</div>{!filtered.length && <div className="empty-state"><ImagePlus size={28} /><p>{query ? "Nenhum produto encontrado." : "Seu cardápio está vazio. Adicione o primeiro produto."}</p></div>}
  <Dialog open={open} onOpenChange={value => !busy && setOpen(value)}><DialogContent className="admin-product-dialog"><DialogHeader><DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle><DialogDescription>Preencha o essencial primeiro. Tamanhos e adicionais são opcionais.</DialogDescription></DialogHeader><div className="admin-product-form"><div className="admin-form-grid"><label className="admin-photo-upload">{preview || editing?.imageUrl ? <Image src={preview || editing!.imageUrl!} alt="Prévia do produto" fill sizes="180px" unoptimized /> : <><ImagePlus size={25} /><span>Adicionar foto</span><small>JPG, PNG ou WebP · até 5 MB</small></>}<input type="file" accept="image/*" onChange={e => choosePhoto(e.target.files?.[0] || null)} /></label><div className="space-y-3"><label className="admin-field"><span>Nome do produto *</span><input autoFocus value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="Ex.: X-Bacon" maxLength={100} /></label><label className="admin-field"><span>Categoria *</span><input list="menu-categories" value={draft.category} onChange={e => setDraft(d => ({ ...d, category: e.target.value }))} placeholder="Ex.: Lanches" /><datalist id="menu-categories">{categories.map(c => <option key={c} value={c} />)}</datalist></label><label className="admin-field"><span>Setor de preparo *</span><select value={draft.sector} onChange={e => setDraft(d => ({ ...d, sector: e.target.value }))}><option>Cozinha</option><option>Pizzaria</option><option>Sobremesas</option></select></label></div></div><label className="admin-field"><span>Descrição para o cliente</span><textarea value={draft.description} onChange={e => setDraft(d => ({ ...d, description: e.target.value }))} placeholder="Ingredientes, tamanho ou o que torna o produto especial" maxLength={240} rows={2} /></label><PriceEditor title="Tamanhos e preços" hint="Para um preço único, mantenha apenas Padrão." rows={draft.variants} setRows={variants => setDraft(d => ({ ...d, variants }))} max={12} /><button type="button" className="admin-advanced-toggle" onClick={() => setAdvanced(v => !v)}>{advanced ? "Ocultar opções extras" : "Adicionar adicionais e opções extras"}<span>{advanced ? "−" : "+"}</span></button>{advanced && <><PriceEditor title="Adicionais" hint="Ex.: bacon extra, borda recheada." rows={draft.addons} setRows={addons => setDraft(d => ({ ...d, addons }))} max={20} /><div className="admin-checks"><label><input type="checkbox" checked={draft.featured} onChange={e => setDraft(d => ({ ...d, featured: e.target.checked }))} /> Destacar no cardápio</label><label><input type="checkbox" checked={draft.available} onChange={e => setDraft(d => ({ ...d, available: e.target.checked }))} /> Disponível para pedido</label></div></>}</div><div className="admin-dialog-actions"><button type="button" className="secondary-button" onClick={() => setOpen(false)} disabled={busy}><X size={16} /> Cancelar</button><button type="button" className="primary-button" onClick={() => void save()} disabled={busy}>{busy ? "Salvando…" : editing ? "Salvar alterações" : "Criar produto"}</button></div></DialogContent></Dialog></>;
}
