"use client";
import { StaffGate, ServerLogin } from "@/components/login";
import { OperationHome } from "@/components/hub";
import { Management } from "@/components/gestao/gestao-shell";
import { Cashier } from "@/components/caixa/caixa";
import { Deliveries } from "@/components/entregas";
import { WaiterTables } from "@/components/salao/mesas";
import { TableCommand } from "@/components/salao/comanda";
import { MenuBuilder } from "@/components/cardapio/cardapio";

import { Topbar, NotFound } from "@/components/shared/blocos";
import { FiscalWorkspace } from "./fiscal-workspace";





import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Toaster } from "@/components/ui/sonner";
import { RestaurantStoreProvider, useRestaurant } from "@/lib/restaurant-store";





import { KitchenBoard } from "@/components/kitchen-board";













































function AppRouter() {
  const pathname = usePathname(); const { createOrder } = useRestaurant();
  useEffect(() => {
    const context = (document as Document & { modelContext?: { registerTool: (tool: unknown, options?: { signal?: AbortSignal }) => void | Promise<void> } }).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const tool = {
      name: "create_table_order",
      title: "Criar pedido de mesa",
      description: "Confirma um pedido real para uma mesa e envia à cozinha, usando IDs de produto e variante do cardápio.",
      inputSchema: {
        type: "object",
        properties: {
          tableId: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              properties: { productId: { type: "string" }, variantId: { type: "string" }, quantity: { type: "number", minimum: 1 } },
              required: ["productId", "variantId", "quantity"],
              additionalProperties: false,
            },
          },
        },
        required: ["tableId", "items"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      async execute(input: unknown) {
        const value = input as { tableId: string; items: { productId: string; variantId: string; quantity: number }[] };
        if (!value?.tableId || !Array.isArray(value.items) || !value.items.length) throw new Error("Mesa e itens são obrigatórios");
        const result = await createOrder(value.tableId, value.items.map((i, index) => ({ ...i, key: `tool-${index}`, addonIds: [] })), "waiter");
        if (!result.ok) throw new Error(result.message);
        return { orderNumber: result.number, status: "confirmed", tableId: value.tableId };
      },
    };
    try { void Promise.resolve(context.registerTool(tool, { signal: lifecycle.signal })).catch(() => {}); } catch { /* unsupported context */ }
    return () => lifecycle.abort();
  }, [createOrder]);
  if (pathname === "/operacao") return <StaffGate><OperationHome /></StaffGate>;
  if (pathname === "/operacao/garcom") return <StaffGate roles={["waiter", "cashier", "manager"]}><WaiterTables /></StaffGate>;
  if (pathname.startsWith("/operacao/garcom/mesa/")) return <StaffGate roles={["waiter", "cashier", "manager"]}><TableCommand tableId={String(Number(pathname.split("/").pop())).padStart(2, "0")} /></StaffGate>;
  if (pathname === "/operacao/cozinha") return <StaffGate roles={["kitchen", "manager"]}><KitchenBoard /></StaffGate>;
  if (pathname === "/operacao/fiscal") return <StaffGate roles={["cashier", "manager"]}><main className="app-page"><div className="page-container"><Topbar title="Fiscal" back="/operacao/caixa" /><FiscalWorkspace /></div></main></StaffGate>;
  if (pathname === "/operacao/caixa") return <StaffGate roles={["cashier", "manager"]}><Cashier /></StaffGate>;
  if (pathname === "/operacao/entregas") return <StaffGate roles={["delivery", "cashier", "manager"]}><Deliveries /></StaffGate>;
  if (pathname === "/menu") return <MenuBuilder source="qr" publicMenu />;
  if (pathname === "/menu/entrega") return <MenuBuilder key="delivery-menu" source="qr" publicMenu deliveryLink />;
  if (pathname.startsWith("/menu/mesa/")) return <MenuBuilder source="qr" publicMenu tableId={pathname.split("/").pop()!} />;
  if (pathname === "/gestao") return <ServerLogin />;
  if (pathname === "/gestao/configuracoes/fiscal") return <StaffGate roles={["manager"]}><Management section="configuracoes-fiscal" /></StaffGate>;
  if (pathname.startsWith("/gestao/")) return <StaffGate roles={["manager"]}><Management section={pathname.split("/").pop() || "dashboard"} /></StaffGate>;
  return <NotFound />;
}

export default function RestaurantApp() {
  const [mounted, setMounted] = useState(false);
  // The local demo store is browser-only; wait for hydration before rendering it.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);
  if (!mounted) return <main className="app-page min-h-screen" aria-busy="true" />;
  return <RestaurantStoreProvider><AppRouter /><Toaster position="top-center" richColors /></RestaurantStoreProvider>;
}
