import type { PoolClient } from "pg";
import { query, transaction } from "@/lib/database";

const RESTAURANT_SLUG = "patos-lanches";

type RestaurantRow = { id: string; name: string; whatsapp: string | null; service_rate_basis_points: number };
type ProductRow = { id: string; name: string; description: string; category: string; kitchen_sector: string; available: boolean; featured: boolean };
type VariantRow = { id: string; product_id: string; name: string; price_cents: number };
type AddonRow = { id: string; product_id: string; name: string; price_cents: number };

export type PublicMenuProduct = {
  id: string;
  name: string;
  description: string;
  category: string;
  sector: string;
  available: boolean;
  featured: boolean;
  variants: Array<{ id: string; name: string; priceCents: number }>;
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

const cents = (price: number) => Math.round(price * 100);

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

export async function getPublicMenu() {
  return transaction(async client => {
    const current = await restaurant(client);
    await ensureCatalog(client, current.id);
    const [productResult, variantResult, addonResult] = await Promise.all([
      client.query<ProductRow>("SELECT id, name, description, category, kitchen_sector, available, featured FROM menu_products WHERE restaurant_id = $1 ORDER BY category, sort_order, name", [current.id]),
      client.query<VariantRow>("SELECT v.id, v.product_id, v.name, v.price_cents FROM menu_variants v JOIN menu_products p ON p.id = v.product_id WHERE p.restaurant_id = $1 AND v.active ORDER BY v.sort_order", [current.id]),
      client.query<AddonRow>("SELECT a.id, a.product_id, a.name, a.price_cents FROM product_addons a JOIN menu_products p ON p.id = a.product_id WHERE p.restaurant_id = $1 AND a.active ORDER BY a.sort_order", [current.id]),
    ]);
    const variantsByProduct = Map.groupBy(variantResult.rows, variant => variant.product_id);
    const addonsByProduct = Map.groupBy(addonResult.rows, addon => addon.product_id);
    return {
      restaurant: { name: current.name, whatsapp: current.whatsapp },
      products: productResult.rows.map<PublicMenuProduct>(product => ({
        id: product.id, name: product.name, description: product.description, category: product.category, sector: product.kitchen_sector,
        available: product.available, featured: product.featured,
        variants: (variantsByProduct.get(product.id) ?? []).map(variant => ({ id: variant.id, name: variant.name, priceCents: variant.price_cents })),
        addons: (addonsByProduct.get(product.id) ?? []).map(addon => ({ id: addon.id, name: addon.name, priceCents: addon.price_cents })),
      })),
    };
  });
}

function estimatedMinutes(activeTicketCount: number, sectors: number) {
  return Math.min(90, Math.max(18, 12 + activeTicketCount * 3 + sectors * 4));
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
    const ticket = await client.query<{ order_id: string }>("UPDATE kitchen_tickets SET status = $2::kitchen_ticket_status, started_at = CASE WHEN $2::kitchen_ticket_status = 'preparing'::kitchen_ticket_status THEN COALESCE(started_at, now()) ELSE started_at END, ready_at = CASE WHEN $2::kitchen_ticket_status = 'ready'::kitchen_ticket_status THEN now() ELSE ready_at END, updated_at = now() WHERE id = $1 AND status <> 'cancelled' RETURNING order_id", [ticketId, status]);
    if (!ticket.rows[0]) throw new Error("Comanda de cozinha não encontrada.");
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
  table_number: number | null; customer_name: string | null; customer_phone: string | null; notes: string | null; estimated_minutes: number | null; subtotal_cents: number; service_cents: number; total_cents: number; created_at: string;
  items: Array<{ id: string; product_id: string | null; variant_id: string | null; product_name: string; variant_name: string; kitchen_sector: string; quantity: number; unit_price_cents: number; addons: Array<{ id: string; name: string; priceCents: number }>; note: string | null }>;
};

export async function getOperationSnapshot() {
  const current = await restaurant();
  const [menu, tables, orders, kitchen] = await Promise.all([
    getPublicMenu(),
    query<{ number: number; active: boolean }>("SELECT number, active FROM dining_tables WHERE restaurant_id = $1 ORDER BY number", [current.id]),
    query<SnapshotOrderRow>(
      `SELECT o.id, o.order_number, o.queue_number, o.source, o.fulfillment, o.status, t.number AS table_number, o.customer_name, o.customer_phone, o.notes, o.estimated_minutes, o.subtotal_cents, o.service_cents, o.total_cents, o.created_at,
        COALESCE(json_agg(json_build_object('id', oi.id, 'product_id', oi.product_id, 'variant_id', oi.variant_id, 'product_name', oi.product_name, 'variant_name', oi.variant_name, 'kitchen_sector', oi.kitchen_sector, 'quantity', oi.quantity, 'unit_price_cents', oi.unit_price_cents, 'addons', oi.addons, 'note', oi.note) ORDER BY oi.created_at) FILTER (WHERE oi.id IS NOT NULL), '[]'::json) AS items
       FROM orders o LEFT JOIN dining_tables t ON t.id = o.table_id LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.restaurant_id = $1
       GROUP BY o.id, t.number
       ORDER BY o.created_at DESC LIMIT 200`,
      [current.id],
    ),
    getKitchenQueue(),
  ]);
  return {
    restaurant: { name: current.name, whatsapp: current.whatsapp ?? "", serviceRate: current.service_rate_basis_points / 100 },
    products: menu.products,
    tables: tables.rows,
    orders: orders.rows.map(order => ({
      id: order.id, orderNumber: Number(order.order_number), queueNumber: Number(order.queue_number), source: order.source, fulfillment: order.fulfillment, status: order.status,
      tableNumber: order.table_number, customerName: order.customer_name, customerPhone: order.customer_phone, notes: order.notes, estimatedMinutes: order.estimated_minutes,
      subtotalCents: order.subtotal_cents, serviceCents: order.service_cents, totalCents: order.total_cents, createdAt: order.created_at, items: order.items,
    })),
    kitchen,
  };
}

export async function cancelOrder(orderId: string) {
  return transaction(async client => {
    const order = await client.query<{ id: string }>("UPDATE orders SET status = 'cancelled', cancelled_at = now(), updated_at = now() WHERE id = $1 AND status NOT IN ('completed', 'cancelled') RETURNING id", [orderId]);
    if (!order.rows[0]) throw new Error("Este pedido não pode mais ser cancelado.");
    await client.query("UPDATE kitchen_tickets SET status = 'cancelled', updated_at = now() WHERE order_id = $1 AND status <> 'ready'", [orderId]);
    await client.query("INSERT INTO order_events (order_id, event_type, actor_role) VALUES ($1,'order_cancelled','staff')", [orderId]);
    return { id: orderId };
  });
}

export async function closeTable(tableNumber: number, payments: Array<{ method: "Pix" | "Dinheiro" | "Débito" | "Crédito"; amountCents: number }>) {
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
    let remaining = due;
    for (const payment of payments) {
      if (!Number.isInteger(payment.amountCents) || payment.amountCents <= 0) continue;
      const applied = Math.min(remaining, payment.amountCents);
      if (applied <= 0) continue;
      await client.query("INSERT INTO payments (order_id, method, amount_cents, status, paid_at) VALUES ($1,$2,$3,'paid',now())", [orders.rows[0].id, methodMap[payment.method], applied]);
      remaining -= applied;
    }
    await client.query("UPDATE orders SET status = 'completed', updated_at = now() WHERE id = ANY($1::uuid[])", [orders.rows.map(order => order.id)]);
    for (const order of orders.rows) await client.query("INSERT INTO order_events (order_id, event_type, actor_role, detail) VALUES ($1,'payment_confirmed','cashier',$2::jsonb)", [order.id, JSON.stringify({ tableNumber, due, received })]);
    return { totalCents: due, changeCents: Math.max(0, received - due) };
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

export async function createMenuProduct(input: { name: string; category: string; sector: string; priceCents: number; description?: string }) {
  if (!Number.isInteger(input.priceCents) || input.priceCents < 0) throw new Error("Preço inválido.");
  return transaction(async client => {
    const current = await restaurant(client);
    const product = await client.query<{ id: string }>("INSERT INTO menu_products (restaurant_id, name, description, category, kitchen_sector, sort_order) VALUES ($1,$2,$3,$4,$5,(SELECT COALESCE(max(sort_order), -1) + 1 FROM menu_products WHERE restaurant_id = $1)) RETURNING id", [current.id, input.name.trim(), input.description?.trim() ?? "", input.category.trim(), input.sector.trim()]);
    await client.query("INSERT INTO menu_variants (product_id, name, price_cents) VALUES ($1,'Padrão',$2)", [product.rows[0].id, input.priceCents]);
    return { id: product.rows[0].id };
  });
}
