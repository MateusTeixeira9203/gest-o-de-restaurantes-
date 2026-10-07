import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { query, transaction } from "@/lib/database";

const RESTAURANT_SLUG = "patos-lanches";

type RestaurantRow = { id: string; name: string; whatsapp: string | null; service_rate_basis_points: number };
type ProductRow = { id: string; name: string; description: string; category: string; kitchen_sector: string; available: boolean; featured: boolean; image_updated_at: Date | null };
type VariantRow = { id: string; product_id: string; name: string; price_cents: number };
type AddonRow = { id: string; product_id: string; name: string; price_cents: number };
type InventoryItemRow = { id: string; name: string; category: string; unit: "un" | "g" | "kg" | "ml" | "L"; quantity: string; minimum_quantity: string; average_cost_cents: string; active: boolean };
type RecipeRow = { variant_id: string; inventory_item_id: string; quantity: string; item_name?: string; available_quantity?: string; active?: boolean };
type StaffMemberRow = { id: string; name: string; role: "manager" | "waiter" | "kitchen" | "cashier" | "delivery"; pin_salt: string; pin_hash: string; active: boolean; created_at: string; updated_at: string };
export type StaffMember = Omit<StaffMemberRow, "pin_salt" | "pin_hash">;
export type StaffMemberRole = StaffMember["role"];

export type PublicMenuProduct = {
  id: string;
  name: string;
  description: string;
  category: string;
  sector: string;
  available: boolean;
  featured: boolean;
  imageUrl: string | null;
  variants: Array<{ id: string; name: string; priceCents: number; stockAvailable: boolean }>;
  addons: Array<{ id: string; name: string; priceCents: number }>;
};

export type CreateOrderInput = {
  source: "waiter" | "public_menu" | "qr_menu";
  fulfillment: "dine_in" | "pickup" | "delivery";
  tableNumber?: number;
  customer?: { name?: string; phone?: string };
  notes?: string;
  items: Array<{ productId: string; variantId: string; quantity: number; addonIds?: string[]; note?: string }>;
  delivery?: {
    addressLine1: string;
    addressLine2?: string;
    neighborhood?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    reference?: string;
    latitude?: number;
    longitude?: number;
  };
};

export type KitchenTicket = {
  id: string;
  orderId: string;
  orderNumber: number;
  queueNumber: number;
  sector: string;
  status: "new" | "preparing" | "ready" | "cancelled";
  fulfillment: "dine_in" | "pickup" | "delivery";
  tableNumber: number | null;
  customerName: string | null;
  estimatedMinutes: number | null;
  createdAt: string;
  notes: string | null;
  items: Array<{ productName: string; variantName: string; quantity: number; note: string | null }>;
};

export type InventoryItem = { id: string; name: string; category: string; unit: "un" | "g" | "kg" | "ml" | "L"; quantity: number; minimumQuantity: number; averageCostCents: number; active: boolean };
export type InventoryMovement = { id: string; itemId: string; type: "initial" | "purchase" | "sale_consumption" | "cancellation_return" | "loss" | "adjustment"; quantityDelta: number; unitCostCents: number | null; orderId: string | null; note: string | null; createdAt: string };

function inventoryItem(row: InventoryItemRow): InventoryItem {
  return { id: row.id, name: row.name, category: row.category, unit: row.unit, quantity: Number(row.quantity), minimumQuantity: Number(row.minimum_quantity), averageCostCents: Number(row.average_cost_cents), active: row.active };
}

const cents = (price: number) => Math.round(price * 100);

function hashPin(pin: string, salt: string) {
  return scryptSync(pin, salt, 64).toString("hex");
}

function validPin(pin: string) {
  return /^\d{4,6}$/.test(pin);
}

async function restaurant(client?: PoolClient): Promise<RestaurantRow> {
  const result = client
    ? await client.query<RestaurantRow>("SELECT id, name, whatsapp, service_rate_basis_points FROM restaurants WHERE slug = $1", [RESTAURANT_SLUG])
    : await query<RestaurantRow>("SELECT id, name, whatsapp, service_rate_basis_points FROM restaurants WHERE slug = $1", [RESTAURANT_SLUG]);
  if (!result.rows[0]) throw new Error("Restaurante não encontrado no banco.");
  return result.rows[0];
}

async function ensureCatalog(client: PoolClient, restaurantId: string) {
  await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`catalog:${restaurantId}`]);
  // The first operational setup is intentionally empty. Products are created
  // by Gestão so no sample catalog leaks into a real restaurant.
}

async function inventorySnapshot(restaurantId: string) {
  const [settings, items, movements, recipes] = await Promise.all([
    query<{ enabled: boolean }>("SELECT enabled FROM inventory_settings WHERE restaurant_id = $1", [restaurantId]),
    query<InventoryItemRow>("SELECT id, name, category, unit, quantity, minimum_quantity, average_cost_cents, active FROM inventory_items WHERE restaurant_id = $1 ORDER BY active DESC, name", [restaurantId]),
    query<{ id: string; inventory_item_id: string; type: InventoryMovement["type"]; quantity_delta: string; unit_cost_cents: string | null; order_id: string | null; note: string | null; created_at: string }>("SELECT id, inventory_item_id, type, quantity_delta, unit_cost_cents, order_id, note, created_at FROM inventory_movements WHERE restaurant_id = $1 ORDER BY created_at DESC LIMIT 80", [restaurantId]),
    query<RecipeRow>("SELECT prc.variant_id, prc.inventory_item_id, prc.quantity FROM product_recipe_components prc JOIN inventory_items i ON i.id = prc.inventory_item_id WHERE i.restaurant_id = $1 ORDER BY prc.created_at", [restaurantId]),
  ]);
  return {
    enabled: settings.rows[0]?.enabled ?? false,
    items: items.rows.map(inventoryItem),
    movements: movements.rows.map(movement => ({ id: movement.id, itemId: movement.inventory_item_id, type: movement.type, quantityDelta: Number(movement.quantity_delta), unitCostCents: movement.unit_cost_cents === null ? null : Number(movement.unit_cost_cents), orderId: movement.order_id, note: movement.note, createdAt: movement.created_at })),
    recipes: recipes.rows.map(recipe => ({ variantId: recipe.variant_id, itemId: recipe.inventory_item_id, quantity: Number(recipe.quantity) })),
  };
}

async function consumeInventoryForOrder(client: PoolClient, restaurantId: string, orderId: string, items: Array<{ variant: VariantRow; quantity: number }>) {
  const enabled = await client.query<{ enabled: boolean }>("SELECT enabled FROM inventory_settings WHERE restaurant_id = $1 FOR UPDATE", [restaurantId]);
  if (!enabled.rows[0]?.enabled) return;
  const variantIds = [...new Set(items.map(item => item.variant.id))];
  if (!variantIds.length) return;
  const recipes = await client.query<RecipeRow>(
    "SELECT prc.variant_id, prc.inventory_item_id, prc.quantity, i.name AS item_name, i.quantity AS available_quantity, i.active FROM product_recipe_components prc JOIN inventory_items i ON i.id = prc.inventory_item_id WHERE prc.variant_id = ANY($1::uuid[]) FOR UPDATE OF i",
    [variantIds],
  );
  const byVariant = Map.groupBy(recipes.rows, recipe => recipe.variant_id);
  const required = new Map<string, { quantity: number; name: string; available: number; active: boolean }>();
  for (const item of items) for (const component of byVariant.get(item.variant.id) ?? []) {
    const existing = required.get(component.inventory_item_id);
    required.set(component.inventory_item_id, {
      quantity: (existing?.quantity ?? 0) + Number(component.quantity) * item.quantity,
      name: component.item_name ?? "Ingrediente",
      available: Number(component.available_quantity),
      active: component.active ?? false,
    });
  }
  for (const requirement of required.values()) {
    if (!requirement.active || requirement.available < requirement.quantity) throw new Error(`Estoque insuficiente para ${requirement.name}.`);
  }
  for (const [itemId, requirement] of required) {
    await client.query("UPDATE inventory_items SET quantity = quantity - $2, updated_at = now() WHERE id = $1", [itemId, requirement.quantity]);
    await client.query("INSERT INTO inventory_movements (restaurant_id, inventory_item_id, type, quantity_delta, order_id, note) VALUES ($1,$2,'sale_consumption',$3,$4,$5)", [restaurantId, itemId, -requirement.quantity, orderId, "Baixa automática pela venda"]);
  }
}

export async function getPublicMenu() {
  const current = await restaurant();
  const [productResult, variantResult, addonResult, inventorySettings, recipeResult, brandImages] = await Promise.all([
      query<ProductRow>("SELECT p.id, p.name, p.description, p.category, p.kitchen_sector, p.available, p.featured, img.updated_at AS image_updated_at FROM menu_products p LEFT JOIN product_images img ON img.product_id = p.id WHERE p.restaurant_id = $1 ORDER BY p.category, p.sort_order, p.name", [current.id]),
      query<VariantRow>("SELECT v.id, v.product_id, v.name, v.price_cents FROM menu_variants v JOIN menu_products p ON p.id = v.product_id WHERE p.restaurant_id = $1 AND v.active ORDER BY v.sort_order", [current.id]),
      query<AddonRow>("SELECT a.id, a.product_id, a.name, a.price_cents FROM product_addons a JOIN menu_products p ON p.id = a.product_id WHERE p.restaurant_id = $1 AND a.active ORDER BY a.sort_order", [current.id]),
      query<{ enabled: boolean }>("SELECT enabled FROM inventory_settings WHERE restaurant_id = $1", [current.id]),
      query<RecipeRow>("SELECT prc.variant_id, prc.inventory_item_id, prc.quantity, i.quantity AS available_quantity, i.active FROM product_recipe_components prc JOIN inventory_items i ON i.id = prc.inventory_item_id WHERE i.restaurant_id = $1", [current.id]),
      query<{ kind: "logo" | "cover"; updated_at: string }>("SELECT kind, updated_at FROM restaurant_brand_images WHERE restaurant_id = $1", [current.id]),
  ]);
    const imageVersion = (kind: "logo" | "cover") => {
      const image = brandImages.rows.find(row => row.kind === kind);
      return image ? `/api/public/branding/${kind}?v=${new Date(image.updated_at).getTime()}` : null;
    };
    const variantsByProduct = Map.groupBy(variantResult.rows, variant => variant.product_id);
    const addonsByProduct = Map.groupBy(addonResult.rows, addon => addon.product_id);
    return {
      restaurant: { name: current.name, whatsapp: current.whatsapp },
      branding: { logoUrl: imageVersion("logo"), coverUrl: imageVersion("cover") },
      products: productResult.rows.map<PublicMenuProduct>(product => {
        const variants = (variantsByProduct.get(product.id) ?? []).map(variant => {
          const recipe = recipeResult.rows.filter(component => component.variant_id === variant.id);
          const stockAvailable = !inventorySettings.rows[0]?.enabled || !recipe.length || recipe.every(component => component.active && Number(component.available_quantity) >= Number(component.quantity));
          return { id: variant.id, name: variant.name, priceCents: variant.price_cents, stockAvailable };
        });
        return { id: product.id, name: product.name, description: product.description, category: product.category, sector: product.kitchen_sector, available: product.available && variants.some(variant => variant.stockAvailable), featured: product.featured, imageUrl: product.image_updated_at ? `/api/public/products/${product.id}/image?v=${new Date(product.image_updated_at).getTime()}` : null, variants, addons: (addonsByProduct.get(product.id) ?? []).map(addon => ({ id: addon.id, name: addon.name, priceCents: addon.price_cents })) };
      }),
    };
}

function estimatedMinutes(activeTicketCount: number, sectors: number) {
  return Math.min(90, Math.max(18, 12 + activeTicketCount * 3 + sectors * 4));
}

export async function getCurrentEstimate() {
  const current = await restaurant();
  const active = await query<{ count: string }>("SELECT count(*) FROM kitchen_tickets WHERE restaurant_id = $1 AND status IN ('new', 'preparing')", [current.id]);
  return estimatedMinutes(Number(active.rows[0].count), 1);
}

export async function createOrder(input: CreateOrderInput) {
  if (!input.items.length) throw new Error("O pedido precisa ter ao menos um item.");
  if (input.fulfillment === "dine_in" && !input.tableNumber) throw new Error("Informe a mesa do pedido presencial.");
  if (input.fulfillment === "delivery" && !input.delivery?.addressLine1) throw new Error("Informe o endereço de entrega.");

  return transaction(async client => {
    const current = await restaurant(client);
    await ensureCatalog(client, current.id);
    let tableId: string | null = null;
    if (input.tableNumber) {
      const table = await client.query<{ id: string }>("SELECT id FROM dining_tables WHERE restaurant_id = $1 AND number = $2 AND active", [current.id, input.tableNumber]);
      if (!table.rows[0]) throw new Error("Mesa não encontrada.");
      tableId = table.rows[0].id;
    }

    const variants = await client.query<VariantRow & { product_name: string; kitchen_sector: string; available: boolean }>(
      "SELECT v.id, v.product_id, v.name, v.price_cents, p.name AS product_name, p.kitchen_sector, p.available FROM menu_variants v JOIN menu_products p ON p.id = v.product_id WHERE p.restaurant_id = $1 AND v.active",
      [current.id],
    );
    const variantsById = new Map(variants.rows.map(variant => [variant.id, variant]));
    const addonIds = [...new Set(input.items.flatMap(item => item.addonIds ?? []))];
    const addonResult = addonIds.length
      ? await client.query<AddonRow>("SELECT a.id, a.product_id, a.name, a.price_cents FROM product_addons a JOIN menu_products p ON p.id = a.product_id WHERE p.restaurant_id = $1 AND a.id = ANY($2::uuid[]) AND a.active", [current.id, addonIds])
      : { rows: [] as AddonRow[] };
    const addonsById = new Map(addonResult.rows.map(addon => [addon.id, addon]));

    const normalizedItems = input.items.map(item => {
      const variant = variantsById.get(item.variantId);
      if (!variant || variant.product_id !== item.productId || !variant.available) throw new Error("Um item selecionado não está mais disponível.");
      if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 50) throw new Error("Quantidade inválida.");
      const selectedAddons = (item.addonIds ?? []).map(id => {
        const addon = addonsById.get(id);
        if (!addon || addon.product_id !== item.productId) throw new Error("Adicional inválido.");
        return addon;
      });
      return { ...item, variant, selectedAddons, lineTotal: item.quantity * (variant.price_cents + selectedAddons.reduce((sum, addon) => sum + addon.price_cents, 0)) };
    });
    const subtotal = normalizedItems.reduce((sum, item) => sum + item.lineTotal, 0);
    const service = input.fulfillment === "dine_in" ? Math.round(subtotal * current.service_rate_basis_points / 10_000) : 0;
    const sectors = [...new Set(normalizedItems.map(item => item.variant.kitchen_sector))];
    const active = await client.query<{ count: string }>("SELECT count(*) FROM kitchen_tickets WHERE restaurant_id = $1 AND status IN ('new', 'preparing')", [current.id]);
    const estimate = estimatedMinutes(Number(active.rows[0].count), sectors.length);
    const counter = await client.query<{ order_number: string; queue_number: string }>(
      "UPDATE restaurant_counters SET next_order_number = next_order_number + 1, next_queue_number = next_queue_number + 1, updated_at = now() WHERE restaurant_id = $1 RETURNING next_order_number - 1 AS order_number, next_queue_number - 1 AS queue_number",
      [current.id],
    );
    const orderNumber = Number(counter.rows[0].order_number);
    const queueNumber = Number(counter.rows[0].queue_number);
    const insertedOrder = await client.query<{ id: string }>(
      "INSERT INTO orders (restaurant_id, order_number, queue_number, source, fulfillment, status, table_id, customer_name, customer_phone, notes, estimated_minutes, subtotal_cents, service_cents, total_cents, confirmed_at) VALUES ($1,$2,$3,$4,$5,'confirmed',$6,$7,$8,$9,$10,$11,$12,$13,now()) RETURNING id",
      [current.id, orderNumber, queueNumber, input.source, input.fulfillment, tableId, input.customer?.name ?? null, input.customer?.phone ?? null, input.notes ?? null, estimate, subtotal, service, subtotal + service],
    );
    const orderId = insertedOrder.rows[0].id;
    await consumeInventoryForOrder(client, current.id, orderId, normalizedItems);
    for (const item of normalizedItems) {
      await client.query(
        "INSERT INTO order_items (order_id, product_id, variant_id, product_name, variant_name, kitchen_sector, quantity, unit_price_cents, addons, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)",
        [orderId, item.productId, item.variantId, item.variant.product_name, item.variant.name, item.variant.kitchen_sector, item.quantity, item.variant.price_cents, JSON.stringify(item.selectedAddons.map(addon => ({ id: addon.id, name: addon.name, priceCents: addon.price_cents }))), item.note ?? null],
      );
    }
    for (const sector of sectors) {
      await client.query("INSERT INTO kitchen_tickets (restaurant_id, order_id, kitchen_sector, queue_number) VALUES ($1,$2,$3,$4)", [current.id, orderId, sector, queueNumber]);
    }
    if (input.fulfillment === "delivery" && input.delivery) {
      const delivery = input.delivery;
      await client.query(
        "INSERT INTO delivery_details (order_id, address_line1, address_line2, neighborhood, city, state, postal_code, reference, latitude, longitude, delivery_contact_name, delivery_contact_phone) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
        [orderId, delivery.addressLine1, delivery.addressLine2 ?? null, delivery.neighborhood ?? null, delivery.city ?? null, delivery.state ?? null, delivery.postalCode ?? null, delivery.reference ?? null, delivery.latitude ?? null, delivery.longitude ?? null, input.customer?.name ?? null, input.customer?.phone ?? null],
      );
    }
    await client.query("INSERT INTO order_events (order_id, event_type, actor_role, detail) VALUES ($1,'order_confirmed',$2,$3::jsonb)", [orderId, input.source === "waiter" ? "waiter" : "customer", JSON.stringify({ queueNumber, fulfillment: input.fulfillment })]);
    return { id: orderId, orderNumber, queueNumber, estimatedMinutes: estimate, totalCents: subtotal + service };
  });
}

export async function getKitchenQueue(sector?: string) {
  const current = await restaurant();
  const result = await query<{
    ticket_id: string; order_id: string; order_number: string; queue_number: string; kitchen_sector: string; ticket_status: KitchenTicket["status"]; fulfillment: KitchenTicket["fulfillment"]; table_number: number | null; customer_name: string | null; estimated_minutes: number | null; created_at: string; notes: string | null; items: KitchenTicket["items"];
  }>(
    `SELECT kt.id AS ticket_id, o.id AS order_id, o.order_number, kt.queue_number, kt.kitchen_sector, kt.status AS ticket_status, o.fulfillment, t.number AS table_number, o.customer_name, o.estimated_minutes, o.created_at, o.notes,
      COALESCE(json_agg(json_build_object('productName', oi.product_name, 'variantName', oi.variant_name, 'quantity', oi.quantity, 'note', oi.note) ORDER BY oi.created_at) FILTER (WHERE oi.kitchen_sector = kt.kitchen_sector), '[]'::json) AS items
     FROM kitchen_tickets kt JOIN orders o ON o.id = kt.order_id LEFT JOIN dining_tables t ON t.id = o.table_id LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE kt.restaurant_id = $1 AND kt.status <> 'cancelled' AND ($2::text IS NULL OR kt.kitchen_sector = $2)
     GROUP BY kt.id, o.id, t.number
     ORDER BY CASE kt.status WHEN 'new' THEN 0 WHEN 'preparing' THEN 1 ELSE 2 END, kt.priority DESC, kt.queue_number`,
    [current.id, sector ?? null],
  );
  return result.rows.map(ticket => ({ id: ticket.ticket_id, orderId: ticket.order_id, orderNumber: Number(ticket.order_number), queueNumber: Number(ticket.queue_number), sector: ticket.kitchen_sector, status: ticket.ticket_status, fulfillment: ticket.fulfillment, tableNumber: ticket.table_number, customerName: ticket.customer_name, estimatedMinutes: ticket.estimated_minutes, createdAt: ticket.created_at, notes: ticket.notes, items: ticket.items }));
}

export async function updateKitchenTicket(ticketId: string, status: "preparing" | "ready") {
  return transaction(async client => {
    const ticket = await client.query<{ order_id: string }>("UPDATE kitchen_tickets kt SET status = $2::kitchen_ticket_status, started_at = CASE WHEN $2::kitchen_ticket_status = 'preparing'::kitchen_ticket_status THEN COALESCE(started_at, now()) ELSE started_at END, ready_at = CASE WHEN $2::kitchen_ticket_status = 'ready'::kitchen_ticket_status THEN now() ELSE ready_at END, updated_at = now() WHERE kt.id = $1 AND ((kt.status = 'new' AND $2 = 'preparing') OR (kt.status IN ('new', 'preparing') AND $2 = 'ready')) AND EXISTS (SELECT 1 FROM orders o WHERE o.id = kt.order_id AND o.status IN ('confirmed', 'preparing')) RETURNING order_id", [ticketId, status]);
    if (!ticket.rows[0]) throw new Error("Esta comanda não está mais nesta etapa da cozinha.");
    const orderId = ticket.rows[0].order_id;
    const summary = await client.query<{ total: string; ready: string; preparing: string }>("SELECT count(*) AS total, count(*) FILTER (WHERE status = 'ready') AS ready, count(*) FILTER (WHERE status = 'preparing') AS preparing FROM kitchen_tickets WHERE order_id = $1", [orderId]);
    const allReady = summary.rows[0].total === summary.rows[0].ready;
    await client.query("UPDATE orders SET status = $2::order_status, ready_at = CASE WHEN $2::order_status = 'ready'::order_status THEN now() ELSE ready_at END, updated_at = now() WHERE id = $1", [orderId, allReady ? "ready" : "preparing"]);
    await client.query("INSERT INTO order_events (order_id, event_type, actor_role, detail) VALUES ($1,$2,'kitchen',$3::jsonb)", [orderId, `kitchen_${status}`, JSON.stringify({ ticketId })]);
    return { orderId, status: allReady ? "ready" : "preparing" };
  });
}

type SnapshotOrderRow = {
  id: string; order_number: string; queue_number: string; source: "waiter" | "public_menu" | "qr_menu"; fulfillment: "dine_in" | "pickup" | "delivery"; status: string;
  table_number: number | null; customer_name: string | null; customer_phone: string | null; notes: string | null; estimated_minutes: number | null; subtotal_cents: number; service_cents: number; total_cents: number; paid_cents: number; payments: Array<{ method: string; amountCents: number }>; delivery_address_line1: string | null; delivery_neighborhood: string | null; delivery_reference: string | null; created_at: string;
  items: Array<{ id: string; product_id: string | null; variant_id: string | null; product_name: string; variant_name: string; kitchen_sector: string; quantity: number; unit_price_cents: number; addons: Array<{ id: string; name: string; priceCents: number }>; note: string | null }>;
};

export async function getOperationSnapshot() {
  const current = await restaurant();
  const [menu, tables, orders, kitchen, inventory] = await Promise.all([
    getPublicMenu(),
    query<{ number: number; label: string | null; active: boolean }>("SELECT number, label, active FROM dining_tables WHERE restaurant_id = $1 ORDER BY number", [current.id]),
    query<SnapshotOrderRow>(
      `SELECT o.id, o.order_number, o.queue_number, o.source, o.fulfillment, o.status, t.number AS table_number, o.customer_name, o.customer_phone, o.notes, o.estimated_minutes, o.subtotal_cents, o.service_cents, o.total_cents, COALESCE((SELECT sum(p.amount_cents) FROM payments p WHERE p.order_id = o.id AND p.status = 'paid'), 0)::int AS paid_cents, COALESCE((SELECT json_agg(json_build_object('method', p.method, 'amountCents', p.amount_cents)) FROM payments p WHERE p.order_id = o.id AND p.status = 'paid'), '[]'::json) AS payments, max(d.address_line1) AS delivery_address_line1, max(d.neighborhood) AS delivery_neighborhood, max(d.reference) AS delivery_reference, o.created_at,
        COALESCE(json_agg(json_build_object('id', oi.id, 'product_id', oi.product_id, 'variant_id', oi.variant_id, 'product_name', oi.product_name, 'variant_name', oi.variant_name, 'kitchen_sector', oi.kitchen_sector, 'quantity', oi.quantity, 'unit_price_cents', oi.unit_price_cents, 'addons', oi.addons, 'note', oi.note) ORDER BY oi.created_at) FILTER (WHERE oi.id IS NOT NULL), '[]'::json) AS items
       FROM orders o LEFT JOIN dining_tables t ON t.id = o.table_id LEFT JOIN delivery_details d ON d.order_id = o.id LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.restaurant_id = $1
       GROUP BY o.id, t.number
       ORDER BY o.created_at DESC LIMIT 200`,
      [current.id],
    ),
    getKitchenQueue(),
    inventorySnapshot(current.id),
  ]);
  return {
    restaurant: { name: current.name, whatsapp: current.whatsapp ?? "", serviceRate: current.service_rate_basis_points / 100 },
    branding: menu.branding,
    products: menu.products,
    tables: tables.rows,
    orders: orders.rows.map(order => ({
      id: order.id, orderNumber: Number(order.order_number), queueNumber: Number(order.queue_number), source: order.source, fulfillment: order.fulfillment, status: order.status,
      tableNumber: order.table_number, customerName: order.customer_name, customerPhone: order.customer_phone, notes: order.notes, estimatedMinutes: order.estimated_minutes, paidCents: order.paid_cents, delivery: order.delivery_address_line1 ? { addressLine1: order.delivery_address_line1, neighborhood: order.delivery_neighborhood, reference: order.delivery_reference } : null,
      subtotalCents: order.subtotal_cents, serviceCents: order.service_cents, totalCents: order.total_cents, payments: order.payments, createdAt: order.created_at, items: order.items,
    })),
    kitchen,
    inventory,
  };
}

export async function cancelOrder(orderId: string, actor: { role: string; name: string; reason: string }) {
  return transaction(async client => {
    const current = await restaurant(client);
    const order = await client.query<{ id: string; restaurant_id: string }>("UPDATE orders SET status = 'cancelled', cancelled_at = now(), updated_at = now() WHERE id = $1 AND restaurant_id = $2 AND status NOT IN ('completed', 'cancelled') AND ($3::text <> 'waiter' OR fulfillment = 'dine_in') RETURNING id, restaurant_id", [orderId, current.id, actor.role]);
    if (!order.rows[0]) throw new Error("Este pedido não pode mais ser cancelado.");
    const consumed = await client.query<{ inventory_item_id: string; quantity_delta: string }>("SELECT inventory_item_id, quantity_delta FROM inventory_movements WHERE order_id = $1 AND type = 'sale_consumption' FOR UPDATE", [orderId]);
    for (const movement of consumed.rows) {
      const returned = Math.abs(Number(movement.quantity_delta));
      await client.query("UPDATE inventory_items SET quantity = quantity + $2, updated_at = now() WHERE id = $1", [movement.inventory_item_id, returned]);
      await client.query("INSERT INTO inventory_movements (restaurant_id, inventory_item_id, type, quantity_delta, order_id, note) VALUES ($1,$2,'cancellation_return',$3,$4,$5)", [order.rows[0].restaurant_id, movement.inventory_item_id, returned, orderId, "Estorno por cancelamento"]);
    }
    await client.query("UPDATE kitchen_tickets SET status = 'cancelled', updated_at = now() WHERE order_id = $1 AND status <> 'cancelled'", [orderId]);
    await client.query("INSERT INTO order_events (order_id, event_type, actor_role, detail) VALUES ($1,'order_cancelled',$2,$3::jsonb)", [orderId, actor.role, JSON.stringify({ reason: actor.reason, cancelledBy: actor.name })]);
    return { id: orderId };
  });
}

export async function closeTable(tableNumber: number, payments: Array<{ method: "Pix" | "Dinheiro" | "Débito" | "Crédito"; amountCents: number }>, actor: { role: string; name: string }) {
  return transaction(async client => {
    const current = await restaurant(client);
    const orders = await client.query<{ id: string; total_cents: number }>(
      "SELECT o.id, o.total_cents FROM orders o JOIN dining_tables t ON t.id = o.table_id WHERE o.restaurant_id = $1 AND t.number = $2 AND o.status NOT IN ('completed','cancelled') FOR UPDATE",
      [current.id, tableNumber],
    );
    if (!orders.rows.length) throw new Error("Não há pedidos em aberto nesta mesa.");
    const due = orders.rows.reduce((sum, order) => sum + order.total_cents, 0);
    const received = payments.reduce((sum, payment) => sum + payment.amountCents, 0);
    if (received < due) throw new Error("O valor recebido é menor que o total da conta.");
    const methodMap = { Pix: "pix", Dinheiro: "cash", Débito: "debit", Crédito: "credit" } as const;
    const balances = orders.rows.map(order => ({ id: order.id, remaining: order.total_cents }));
    for (const payment of payments) {
      if (!Number.isInteger(payment.amountCents) || payment.amountCents <= 0) continue;
      let available = payment.amountCents;
      for (const balance of balances) {
        const applied = Math.min(balance.remaining, available);
        if (applied <= 0) continue;
        await client.query("INSERT INTO payments (order_id, method, amount_cents, status, paid_at) VALUES ($1,$2,$3,'paid',now())", [balance.id, methodMap[payment.method], applied]);
        balance.remaining -= applied;
        available -= applied;
      }
    }
    await client.query("UPDATE orders SET status = 'completed', updated_at = now() WHERE id = ANY($1::uuid[])", [orders.rows.map(order => order.id)]);
    for (const order of orders.rows) await client.query("INSERT INTO order_events (order_id, event_type, actor_role, detail) VALUES ($1,'payment_confirmed',$2,$3::jsonb)", [order.id, actor.role, JSON.stringify({ tableNumber, due, received, processedBy: actor.name })]);
    return { totalCents: due, changeCents: Math.max(0, received - due) };
  });
}

export async function recordExternalPayment(orderId: string, method: "Pix" | "Dinheiro" | "Débito" | "Crédito", actor: { role: string; name: string }) {
  return transaction(async client => {
    const current = await restaurant(client);
    const result = await client.query<{ id: string; status: string; fulfillment: string; total_cents: number; paid_cents: number }>(
      "SELECT o.id, o.status, o.fulfillment, o.total_cents, COALESCE((SELECT sum(amount_cents) FROM payments WHERE order_id = o.id AND status = 'paid'), 0)::int AS paid_cents FROM orders o WHERE o.id = $1 AND o.restaurant_id = $2 FOR UPDATE",
      [orderId, current.id],
    );
    const order = result.rows[0];
    if (!order || order.fulfillment === "dine_in" || order.status === "cancelled") throw new Error("Pedido online não encontrado ou cancelado.");
    if (actor.role === "delivery" && order.fulfillment !== "delivery") throw new Error("A equipe de entrega só pode receber pedidos de entrega.");
    if (order.paid_cents >= order.total_cents) throw new Error("Este pedido já está pago.");
    if (order.fulfillment === "pickup" && order.status !== "ready") throw new Error("A retirada precisa estar pronta antes de fechar o pagamento.");
    const amount = order.total_cents - order.paid_cents;
    const methodMap = { Pix: "pix", Dinheiro: "cash", Débito: "debit", Crédito: "credit" } as const;
    await client.query("INSERT INTO payments (order_id, method, amount_cents, status, paid_at) VALUES ($1,$2,$3,'paid',now())", [order.id, methodMap[method], amount]);
    const completed = order.fulfillment === "pickup" || order.status === "delivered";
    if (completed) await client.query("UPDATE orders SET status = 'completed', updated_at = now() WHERE id = $1", [order.id]);
    await client.query("INSERT INTO order_events (order_id, event_type, actor_role, detail) VALUES ($1,'payment_confirmed',$2,$3::jsonb)", [order.id, actor.role, JSON.stringify({ method, amountCents: amount, processedBy: actor.name })]);
    return { id: order.id, paidCents: order.total_cents, completed };
  });
}

export async function updateDeliveryStatus(orderId: string, status: "out_for_delivery" | "delivered", actor: { role: string; name: string }) {
  return transaction(async client => {
    const order = await client.query<{ id: string; status: string }>("SELECT o.id, o.status FROM orders o JOIN delivery_details d ON d.order_id = o.id WHERE o.id = $1 FOR UPDATE", [orderId]);
    if (!order.rows[0]) throw new Error("Pedido de entrega não encontrado.");
    if (status === "out_for_delivery" && order.rows[0].status !== "ready") throw new Error("A entrega precisa estar pronta antes de sair.");
    if (status === "delivered" && order.rows[0].status !== "out_for_delivery") throw new Error("Marque a saída antes de concluir a entrega.");
    const paid = status === "delivered" ? await client.query<{ paid: boolean }>("SELECT COALESCE((SELECT sum(amount_cents) FROM payments WHERE order_id = $1 AND status = 'paid'), 0) >= total_cents AS paid FROM orders WHERE id = $1", [orderId]) : null;
    const nextStatus = status === "delivered" && paid?.rows[0]?.paid ? "completed" : status;
    await client.query("UPDATE orders SET status = $2::order_status, delivered_at = CASE WHEN $3 = 'delivered' THEN now() ELSE delivered_at END, updated_at = now() WHERE id = $1", [orderId, nextStatus, status]);
    await client.query("UPDATE delivery_details SET departed_at = CASE WHEN $2 = 'out_for_delivery' THEN now() ELSE departed_at END, delivered_at = CASE WHEN $2 = 'delivered' THEN now() ELSE delivered_at END WHERE order_id = $1", [orderId, status]);
    await client.query("INSERT INTO order_events (order_id, event_type, actor_role, detail) VALUES ($1,$2,$3,$4::jsonb)", [orderId, `delivery_${status}`, actor.role, JSON.stringify({ updatedBy: actor.name })]);
    return { id: orderId, status: nextStatus };
  });
}

export async function setProductAvailability(productId: string, available: boolean) {
  const updated = await query<{ id: string }>("UPDATE menu_products SET available = $2, updated_at = now() WHERE id = $1 RETURNING id", [productId, available]);
  if (!updated.rows[0]) throw new Error("Produto não encontrado.");
  return { id: productId, available };
}

export async function updateRestaurantSettings(input: { name: string; whatsapp: string; serviceRate: number }) {
  if (!Number.isFinite(input.serviceRate) || input.serviceRate < 0 || input.serviceRate > 100) throw new Error("Taxa de serviço inválida.");
  const updated = await query<RestaurantRow>(
    "UPDATE restaurants SET name = $2, whatsapp = NULLIF($3,''), service_rate_basis_points = $4, updated_at = now() WHERE slug = $1 RETURNING id, name, whatsapp, service_rate_basis_points",
    [RESTAURANT_SLUG, input.name.trim(), input.whatsapp.trim(), Math.round(input.serviceRate * 100)],
  );
  if (!updated.rows[0]) throw new Error("Restaurante não encontrado.");
  return { name: updated.rows[0].name, whatsapp: updated.rows[0].whatsapp ?? "", serviceRate: updated.rows[0].service_rate_basis_points / 100 };
}

export async function createDiningTable(number: number) {
  const current = await restaurant();
  const result = await query<{ number: number }>("INSERT INTO dining_tables (restaurant_id, number, label) VALUES ($1,$2,$3) RETURNING number", [current.id, number, `Mesa ${String(number).padStart(2, "0")}`]);
  return result.rows[0];
}

export async function createDiningTables(input: { numbers: number[]; labels?: Record<number, string> }) {
  if (!input.numbers.length || input.numbers.length > 100 || input.numbers.some(number => !Number.isInteger(number) || number < 1 || number > 200)) throw new Error("Informe de 1 a 100 mesas válidas.");
  return transaction(async client => {
    const current = await restaurant(client);
    const created: number[] = [];
    for (const number of [...new Set(input.numbers)]) {
      const label = input.labels?.[number]?.trim() || `Mesa ${String(number).padStart(2, "0")}`;
      const result = await client.query<{ number: number }>("INSERT INTO dining_tables (restaurant_id, number, label) VALUES ($1,$2,$3) ON CONFLICT (restaurant_id, number) DO NOTHING RETURNING number", [current.id, number, label]);
      if (result.rows[0]) created.push(result.rows[0].number);
    }
    return { created, skipped: input.numbers.filter(number => !created.includes(number)) };
  });
}

export async function updateDiningTable(number: number, label: string, active: boolean) {
  return transaction(async client => {
    const current = await restaurant(client);
    if (!active) {
      const open = await client.query("SELECT 1 FROM orders o JOIN dining_tables t ON t.id = o.table_id WHERE o.restaurant_id = $1 AND t.number = $2 AND o.status NOT IN ('completed', 'cancelled') LIMIT 1", [current.id, number]);
      if (open.rowCount) throw new Error("Feche a comanda antes de desativar esta mesa.");
    }
    const result = await client.query<{ number: number; label: string; active: boolean }>("UPDATE dining_tables SET label = $3, active = $4 WHERE restaurant_id = $1 AND number = $2 RETURNING number, label, active", [current.id, number, label.trim(), active]);
    if (!result.rows[0]) throw new Error("Mesa não encontrada.");
    return result.rows[0];
  });
}

export type MenuProductInput = {
  name: string; category: string; sector: string; description?: string; available?: boolean; featured?: boolean;
  variants: Array<{ id?: string; name: string; priceCents: number }>;
  addons: Array<{ id?: string; name: string; priceCents: number }>;
};

export async function createMenuProduct(input: MenuProductInput) {
  return transaction(async client => {
    const current = await restaurant(client);
    const product = await client.query<{ id: string }>("INSERT INTO menu_products (restaurant_id, name, description, category, kitchen_sector, available, featured, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,(SELECT COALESCE(max(sort_order), -1) + 1 FROM menu_products WHERE restaurant_id = $1)) RETURNING id", [current.id, input.name.trim(), input.description?.trim() ?? "", input.category.trim(), input.sector.trim(), input.available ?? true, input.featured ?? false]);
    for (const [index, variant] of input.variants.entries()) await client.query("INSERT INTO menu_variants (product_id, name, price_cents, sort_order) VALUES ($1,$2,$3,$4)", [product.rows[0].id, variant.name.trim(), variant.priceCents, index]);
    for (const [index, addon] of input.addons.entries()) await client.query("INSERT INTO product_addons (product_id, name, price_cents, sort_order) VALUES ($1,$2,$3,$4)", [product.rows[0].id, addon.name.trim(), addon.priceCents, index]);
    return { id: product.rows[0].id };
  });
}

export async function updateMenuProduct(productId: string, input: MenuProductInput) {
  return transaction(async client => {
    const current = await restaurant(client);
    const product = await client.query<{ id: string }>("UPDATE menu_products SET name = $3, description = $4, category = $5, kitchen_sector = $6, available = $7, featured = $8, updated_at = now() WHERE id = $1 AND restaurant_id = $2 RETURNING id", [productId, current.id, input.name.trim(), input.description?.trim() ?? "", input.category.trim(), input.sector.trim(), input.available ?? true, input.featured ?? false]);
    if (!product.rows[0]) throw new Error("Produto não encontrado.");
    const variantIds: string[] = [];
    for (const [index, variant] of input.variants.entries()) {
      if (variant.id) {
        const updated = await client.query<{ id: string }>("UPDATE menu_variants SET name = $3, price_cents = $4, active = true, sort_order = $5 WHERE id = $1 AND product_id = $2 RETURNING id", [variant.id, productId, variant.name.trim(), variant.priceCents, index]);
        if (!updated.rows[0]) throw new Error("Variação não encontrada neste produto.");
        variantIds.push(updated.rows[0].id);
      } else {
        const added = await client.query<{ id: string }>("INSERT INTO menu_variants (product_id, name, price_cents, sort_order) VALUES ($1,$2,$3,$4) RETURNING id", [productId, variant.name.trim(), variant.priceCents, index]);
        variantIds.push(added.rows[0].id);
      }
    }
    await client.query("UPDATE menu_variants SET active = false WHERE product_id = $1 AND NOT (id = ANY($2::uuid[]))", [productId, variantIds]);
    const addonIds: string[] = [];
    for (const [index, addon] of input.addons.entries()) {
      if (addon.id) {
        const updated = await client.query<{ id: string }>("UPDATE product_addons SET name = $3, price_cents = $4, active = true, sort_order = $5 WHERE id = $1 AND product_id = $2 RETURNING id", [addon.id, productId, addon.name.trim(), addon.priceCents, index]);
        if (!updated.rows[0]) throw new Error("Adicional não encontrado neste produto.");
        addonIds.push(updated.rows[0].id);
      } else {
        const added = await client.query<{ id: string }>("INSERT INTO product_addons (product_id, name, price_cents, sort_order) VALUES ($1,$2,$3,$4) RETURNING id", [productId, addon.name.trim(), addon.priceCents, index]);
        addonIds.push(added.rows[0].id);
      }
    }
    await client.query("UPDATE product_addons SET active = false WHERE product_id = $1 AND NOT (id = ANY($2::uuid[]))", [productId, addonIds]);
    return { id: productId };
  });
}

export async function setProductImage(productId: string, imageData: Buffer) {
  const current = await restaurant();
  const result = await query<{ product_id: string }>("INSERT INTO product_images (product_id, mime_type, image_data) SELECT p.id, 'image/webp', $3 FROM menu_products p WHERE p.id = $1 AND p.restaurant_id = $2 ON CONFLICT (product_id) DO UPDATE SET image_data = EXCLUDED.image_data, updated_at = now() RETURNING product_id", [productId, current.id, imageData]);
  if (!result.rows[0]) throw new Error("Produto não encontrado.");
  return { id: productId };
}

export async function getProductImage(productId: string) {
  const current = await restaurant();
  const result = await query<{ image_data: Buffer; mime_type: string }>("SELECT img.image_data, img.mime_type FROM product_images img JOIN menu_products p ON p.id = img.product_id WHERE p.id = $1 AND p.restaurant_id = $2", [productId, current.id]);
  return result.rows[0] ?? null;
}

export type BrandImageKind = "logo" | "cover";

export async function getBrandImage(kind: BrandImageKind) {
  const current = await restaurant();
  const result = await query<{ image_data: Buffer; mime_type: string }>("SELECT image_data, mime_type FROM restaurant_brand_images WHERE restaurant_id = $1 AND kind = $2", [current.id, kind]);
  return result.rows[0] ?? null;
}

export async function setBrandImage(kind: BrandImageKind, imageData: Buffer) {
  const current = await restaurant();
  await query("INSERT INTO restaurant_brand_images (restaurant_id, kind, mime_type, image_data) VALUES ($1,$2,'image/webp',$3) ON CONFLICT (restaurant_id, kind) DO UPDATE SET image_data = EXCLUDED.image_data, updated_at = now()", [current.id, kind, imageData]);
  return { kind };
}

export async function removeBrandImage(kind: BrandImageKind) {
  const current = await restaurant();
  await query("DELETE FROM restaurant_brand_images WHERE restaurant_id = $1 AND kind = $2", [current.id, kind]);
  return { kind };
}

export async function setInventoryEnabled(enabled: boolean) {
  return transaction(async client => {
    const current = await restaurant(client);
    await client.query("INSERT INTO inventory_settings (restaurant_id, enabled, enabled_at) VALUES ($1,$2,CASE WHEN $2 THEN now() ELSE NULL END) ON CONFLICT (restaurant_id) DO UPDATE SET enabled = EXCLUDED.enabled, enabled_at = CASE WHEN EXCLUDED.enabled THEN COALESCE(inventory_settings.enabled_at, now()) ELSE NULL END, updated_at = now()", [current.id, enabled]);
    return { enabled };
  });
}

export async function createInventoryItem(input: { name: string; category?: string; unit: InventoryItem["unit"]; quantity?: number; minimumQuantity?: number; unitCostCents?: number }) {
  if (!input.name.trim()) throw new Error("Informe o nome do material.");
  const quantity = input.quantity ?? 0;
  const minimumQuantity = input.minimumQuantity ?? 0;
  const unitCostCents = input.unitCostCents ?? 0;
  if (![quantity, minimumQuantity, unitCostCents].every(Number.isFinite) || quantity < 0 || minimumQuantity < 0 || unitCostCents < 0) throw new Error("Valores de estoque inválidos.");
  return transaction(async client => {
    const current = await restaurant(client);
    const item = await client.query<InventoryItemRow>("INSERT INTO inventory_items (restaurant_id, name, category, unit, quantity, minimum_quantity, average_cost_cents) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, name, category, unit, quantity, minimum_quantity, average_cost_cents, active", [current.id, input.name.trim(), input.category?.trim() || "Geral", input.unit, quantity, minimumQuantity, unitCostCents]);
    if (quantity > 0) await client.query("INSERT INTO inventory_movements (restaurant_id, inventory_item_id, type, quantity_delta, unit_cost_cents, note) VALUES ($1,$2,'initial',$3,$4,$5)", [current.id, item.rows[0].id, quantity, unitCostCents, "Estoque inicial"]);
    return inventoryItem(item.rows[0]);
  });
}

export async function registerInventoryMovement(input: { itemId: string; type: "purchase" | "loss" | "adjustment"; quantity: number; unitCostCents?: number; note?: string }) {
  if (!Number.isFinite(input.quantity) || input.quantity === 0) throw new Error("Informe uma quantidade diferente de zero.");
  if (input.type !== "adjustment" && input.quantity < 0) throw new Error("A quantidade deve ser positiva.");
  return transaction(async client => {
    const current = await restaurant(client);
    const item = await client.query<InventoryItemRow>("SELECT id, name, category, unit, quantity, minimum_quantity, average_cost_cents, active FROM inventory_items WHERE id = $1 AND restaurant_id = $2 FOR UPDATE", [input.itemId, current.id]);
    if (!item.rows[0]) throw new Error("Material não encontrado.");
    const before = inventoryItem(item.rows[0]);
    const delta = input.type === "loss" ? -Math.abs(input.quantity) : input.quantity;
    if (before.quantity + delta < 0) throw new Error(`Saldo insuficiente de ${before.name}.`);
    const cost = input.unitCostCents;
    const nextQuantity = before.quantity + delta;
    const nextCost = input.type === "purchase" && cost !== undefined && nextQuantity > 0
      ? ((before.quantity * before.averageCostCents) + (delta * cost)) / nextQuantity
      : before.averageCostCents;
    await client.query("UPDATE inventory_items SET quantity = $2, average_cost_cents = $3, updated_at = now() WHERE id = $1", [before.id, nextQuantity, nextCost]);
    await client.query("INSERT INTO inventory_movements (restaurant_id, inventory_item_id, type, quantity_delta, unit_cost_cents, note) VALUES ($1,$2,$3,$4,$5,$6)", [current.id, before.id, input.type, delta, cost ?? null, input.note?.trim() || null]);
    return { id: before.id, quantity: nextQuantity };
  });
}

export async function replaceVariantRecipe(input: { variantId: string; components: Array<{ itemId: string; quantity: number }> }) {
  if (input.components.some(component => !Number.isFinite(component.quantity) || component.quantity <= 0)) throw new Error("Informe quantidades válidas para a ficha técnica.");
  if (new Set(input.components.map(component => component.itemId)).size !== input.components.length) throw new Error("Não repita um material na ficha técnica.");
  return transaction(async client => {
    const current = await restaurant(client);
    const variant = await client.query<{ id: string }>("SELECT v.id FROM menu_variants v JOIN menu_products p ON p.id = v.product_id WHERE v.id = $1 AND p.restaurant_id = $2", [input.variantId, current.id]);
    if (!variant.rows[0]) throw new Error("Variação de produto não encontrada.");
    if (input.components.length) {
      const materials = await client.query<{ id: string }>("SELECT id FROM inventory_items WHERE restaurant_id = $1 AND active AND id = ANY($2::uuid[])", [current.id, input.components.map(component => component.itemId)]);
      if (materials.rows.length !== input.components.length) throw new Error("Um dos materiais não está disponível.");
    }
    await client.query("DELETE FROM product_recipe_components WHERE variant_id = $1", [input.variantId]);
    for (const component of input.components) await client.query("INSERT INTO product_recipe_components (variant_id, inventory_item_id, quantity) VALUES ($1,$2,$3)", [input.variantId, component.itemId, component.quantity]);
    return { variantId: input.variantId, components: input.components };
  });
}

function staffMember(row: StaffMemberRow): StaffMember {
  return { id: row.id, name: row.name, role: row.role, active: row.active, created_at: row.created_at, updated_at: row.updated_at };
}

export async function listStaffMembers(activeOnly = false): Promise<StaffMember[]> {
  const current = await restaurant();
  const result = await query<StaffMemberRow>(
    `SELECT id, name, role, pin_salt, pin_hash, active, created_at, updated_at FROM staff_members
     WHERE restaurant_id = $1 ${activeOnly ? "AND active" : ""} ORDER BY active DESC, name`,
    [current.id],
  );
  return result.rows.map(staffMember);
}

export async function authenticateStaffMember(name: string, pin: string) {
  if (!validPin(pin)) return null;
  const current = await restaurant();
  const result = await query<StaffMemberRow>(
    "SELECT id, name, role, pin_salt, pin_hash, active, created_at, updated_at FROM staff_members WHERE restaurant_id = $1 AND lower(name) = lower($2) AND active",
    [current.id, name.trim()],
  );
  const member = result.rows[0];
  if (!member) return null;
  const expected = Buffer.from(member.pin_hash, "hex");
  const supplied = Buffer.from(hashPin(pin, member.pin_salt), "hex");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) return null;
  return staffMember(member);
}

export async function createStaffMember(input: { name: string; role: StaffMemberRole; pin: string }) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) throw new Error("Informe um nome entre 2 e 80 caracteres.");
  if (!validPin(input.pin)) throw new Error("O PIN precisa ter de 4 a 6 números.");
  const current = await restaurant();
  const salt = randomBytes(16).toString("hex");
  const result = await query<StaffMemberRow>(
    "INSERT INTO staff_members (restaurant_id, name, role, pin_salt, pin_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, role, pin_salt, pin_hash, active, created_at, updated_at",
    [current.id, name, input.role, salt, hashPin(input.pin, salt)],
  );
  return staffMember(result.rows[0]);
}

export async function updateStaffMember(id: string, input: { name?: string; role?: StaffMemberRole; pin?: string; active?: boolean }) {
  const current = await restaurant();
  const existing = await query<StaffMemberRow>(
    "SELECT id, name, role, pin_salt, pin_hash, active, created_at, updated_at FROM staff_members WHERE id = $1 AND restaurant_id = $2",
    [id, current.id],
  );
  if (!existing.rows[0]) throw new Error("Membro da equipe não encontrado.");
  const name = input.name === undefined ? existing.rows[0].name : input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80) throw new Error("Informe um nome entre 2 e 80 caracteres.");
  if (input.pin !== undefined && !validPin(input.pin)) throw new Error("O PIN precisa ter de 4 a 6 números.");
  const salt = input.pin === undefined ? existing.rows[0].pin_salt : randomBytes(16).toString("hex");
  const hash = input.pin === undefined ? existing.rows[0].pin_hash : hashPin(input.pin, salt);
  const result = await query<StaffMemberRow>(
    "UPDATE staff_members SET name = $3, role = $4, pin_salt = $5, pin_hash = $6, active = $7, updated_at = now() WHERE id = $1 AND restaurant_id = $2 RETURNING id, name, role, pin_salt, pin_hash, active, created_at, updated_at",
    [id, current.id, name, input.role ?? existing.rows[0].role, salt, hash, input.active ?? existing.rows[0].active],
  );
  return staffMember(result.rows[0]);
}
