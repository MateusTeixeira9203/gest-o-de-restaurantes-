import { accountVersion } from "@/modules/payments/checkout";
import { restaurantContext } from "@/modules/tenancy/context";
import { snapshotRecipeCost } from "@/modules/costs/service";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import {
  assertOrderApprover,
  requestHash,
  type OrderActor,
} from "@/modules/orders/policy";
import { postSalePayment, recognizeSale } from "@/modules/finance/service";
import { query, transaction } from "@/lib/database";

type RestaurantRow = {
  slug: string;
  plan: "essential" | "professional";
  accent_color: string;
  id: string;
  name: string;
  whatsapp: string | null;
  service_rate_basis_points: number;
};
type ProductRow = {
  id: string;
  name: string;
  description: string;
  category: string;
  kitchen_sector: string;
  available: boolean;
  featured: boolean;
  image_updated_at: Date | null;
};
type VariantRow = {
  id: string;
  product_id: string;
  name: string;
  price_cents: number;
};
type AddonRow = {
  id: string;
  product_id: string;
  name: string;
  price_cents: number;
};
type InventoryItemRow = {
  id: string;
  name: string;
  category: string;
  unit: "un" | "g" | "kg" | "ml" | "L";
  quantity: string;
  minimum_quantity: string;
  average_cost_cents: string;
  cost_known?: boolean;
  active: boolean;
};
type RecipeRow = {
  variant_id: string;
  inventory_item_id: string;
  quantity: string;
  item_name?: string;
  available_quantity?: string;
  active?: boolean;
  unit_cost_cents?: string;
};
type StaffMemberRow = {
  id: string;
  name: string;
  role: "manager" | "waiter" | "kitchen" | "cashier" | "delivery";
  pin_salt: string;
  pin_hash: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};
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
  variants: Array<{
    id: string;
    name: string;
    priceCents: number;
    stockAvailable: boolean;
  }>;
  addons: Array<{ id: string; name: string; priceCents: number }>;
};

export type CreateOrderInput = {
  source: "waiter" | "public_menu" | "qr_menu";
  fulfillment: "dine_in" | "pickup" | "delivery";
  deliveryFeeCents?: number;
  expectedPaymentMethod?: "pix" | "cash" | "debit" | "credit" | "prepaid";
  cashTenderedCents?: number;
  tableNumber?: number;
  customer?: { name?: string; phone?: string };
  notes?: string;
  items: Array<{
    productId: string;
    variantId: string;
    quantity: number;
    addonIds?: string[];
    note?: string;
  }>;
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
  confirmedAt: string | null;
  notes: string | null;
  items: Array<{
    productName: string;
    variantName: string;
    quantity: number;
    addons: Array<{ id: string; name: string; priceCents: number }>;
    note: string | null;
  }>;
};

export type InventoryItem = {
  id: string;
  name: string;
  category: string;
  unit: "un" | "g" | "kg" | "ml" | "L";
  quantity: number;
  minimumQuantity: number;
  averageCostCents: number;
  active: boolean;
};
export type InventoryMovement = {
  id: string;
  itemId: string;
  type:
    | "initial"
    | "purchase"
    | "sale_consumption"
    | "cancellation_return"
    | "loss"
    | "adjustment";
  quantityDelta: number;
  unitCostCents: number | null;
  orderId: string | null;
  note: string | null;
  createdAt: string;
};

function inventoryItem(row: InventoryItemRow): InventoryItem {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    quantity: Number(row.quantity),
    minimumQuantity: Number(row.minimum_quantity),
    averageCostCents: Number(row.average_cost_cents),
    active: row.active,
  };
}


function hashPin(pin: string, salt: string) {
  return scryptSync(pin, salt, 64).toString("hex");
}

function validPin(pin: string) {
  return /^\d{4,6}$/.test(pin);
}

async function restaurant(client?: PoolClient): Promise<RestaurantRow> {
  return restaurantContext(client);
}

async function inventorySnapshot(restaurantId: string) {
  const [settings, items, movements, recipes] = await Promise.all([
    query<{ enabled: boolean }>(
      "SELECT enabled FROM inventory_settings WHERE restaurant_id = $1",
      [restaurantId],
    ),
    query<InventoryItemRow>(
      "SELECT id, name, category, unit, quantity, minimum_quantity, average_cost_cents, active FROM inventory_items WHERE restaurant_id = $1 ORDER BY active DESC, name",
      [restaurantId],
    ),
    query<{
      id: string;
      inventory_item_id: string;
      type: InventoryMovement["type"];
      quantity_delta: string;
      unit_cost_cents: string | null;
      order_id: string | null;
      note: string | null;
      created_at: string;
    }>(
      "SELECT id, inventory_item_id, type, quantity_delta, unit_cost_cents, order_id, note, created_at FROM inventory_movements WHERE restaurant_id = $1 ORDER BY created_at DESC LIMIT 80",
      [restaurantId],
    ),
    query<RecipeRow>(
      "SELECT prc.variant_id, prc.inventory_item_id, prc.quantity FROM product_recipe_components prc JOIN inventory_items i ON i.id = prc.inventory_item_id WHERE i.restaurant_id = $1 ORDER BY prc.created_at",
      [restaurantId],
    ),
  ]);
  return {
    enabled: settings.rows[0]?.enabled ?? false,
    items: items.rows.map(inventoryItem),
    movements: movements.rows.map((movement) => ({
      id: movement.id,
      itemId: movement.inventory_item_id,
      type: movement.type,
      quantityDelta: Number(movement.quantity_delta),
      unitCostCents:
        movement.unit_cost_cents === null
          ? null
          : Number(movement.unit_cost_cents),
      orderId: movement.order_id,
      note: movement.note,
      createdAt: movement.created_at,
    })),
    recipes: recipes.rows.map((recipe) => ({
      variantId: recipe.variant_id,
      itemId: recipe.inventory_item_id,
      quantity: Number(recipe.quantity),
    })),
  };
}

async function consumeInventoryForOrder(
  client: PoolClient,
  restaurantId: string,
  orderId: string,
  items: Array<{ variant: VariantRow; quantity: number }>,
) {
  const enabled = await client.query<{ enabled: boolean }>(
    "SELECT enabled FROM inventory_settings WHERE restaurant_id = $1 FOR UPDATE",
    [restaurantId],
  );
  if (!enabled.rows[0]?.enabled) return;
  const variantIds = [...new Set(items.map((item) => item.variant.id))];
  if (!variantIds.length) return;
  const recipes = await client.query<RecipeRow>(
    "SELECT prc.variant_id, prc.inventory_item_id, prc.quantity, i.name AS item_name, i.quantity AS available_quantity, i.active, i.average_cost_cents AS unit_cost_cents FROM product_recipe_components prc JOIN inventory_items i ON i.id = prc.inventory_item_id WHERE prc.variant_id = ANY($1::uuid[]) AND i.restaurant_id = $2 ORDER BY i.id FOR UPDATE OF i",
    [variantIds, restaurantId],
  );
  const byVariant = Map.groupBy(recipes.rows, (recipe) => recipe.variant_id);
  const required = new Map<
    string,
    {
      quantity: number;
      name: string;
      available: number;
      active: boolean;
      unitCost: string;
    }
  >();
  for (const item of items)
    for (const component of byVariant.get(item.variant.id) ?? []) {
      const existing = required.get(component.inventory_item_id);
      required.set(component.inventory_item_id, {
        quantity:
          (existing?.quantity ?? 0) +
          Number(component.quantity) * item.quantity,
        name: component.item_name ?? "Ingrediente",
        available: Number(component.available_quantity),
        active: component.active ?? false,
        unitCost: component.unit_cost_cents ?? "0",
      });
    }
  for (const requirement of required.values()) {
    if (!requirement.active || requirement.available < requirement.quantity)
      throw new Error(`Estoque insuficiente para ${requirement.name}.`);
  }
  for (const [itemId, requirement] of required) {
    await client.query(
      "UPDATE inventory_items SET quantity = quantity - $2, updated_at = now() WHERE id = $1",
      [itemId, requirement.quantity],
    );
    await client.query(
      "INSERT INTO inventory_movements (restaurant_id, inventory_item_id, type, quantity_delta, order_id, note, unit_cost_cents) VALUES ($1,$2,'sale_consumption',$3,$4,$5,$6)",
      [
        restaurantId,
        itemId,
        -requirement.quantity,
        orderId,
        "Destinação para produção após aprovação",
        requirement.unitCost,
      ],
    );
  }
}

export async function getPublicMenu() {
  const current = await restaurant();
  const [
    productResult,
    variantResult,
    addonResult,
    inventorySettings,
    recipeResult,
    brandImages,
  ] = await Promise.all([
    query<ProductRow>(
      "SELECT p.id, p.name, p.description, p.category, p.kitchen_sector, p.available, p.featured, img.updated_at AS image_updated_at FROM menu_products p LEFT JOIN product_images img ON img.product_id = p.id WHERE p.restaurant_id = $1 ORDER BY p.category, p.sort_order, p.name",
      [current.id],
    ),
    query<VariantRow>(
      "SELECT v.id, v.product_id, v.name, v.price_cents FROM menu_variants v JOIN menu_products p ON p.id = v.product_id WHERE p.restaurant_id = $1 AND v.active ORDER BY v.sort_order",
      [current.id],
    ),
    query<AddonRow>(
      "SELECT a.id, a.product_id, a.name, a.price_cents FROM product_addons a JOIN menu_products p ON p.id = a.product_id WHERE p.restaurant_id = $1 AND a.active ORDER BY a.sort_order",
      [current.id],
    ),
    query<{ enabled: boolean }>(
      "SELECT enabled FROM inventory_settings WHERE restaurant_id = $1",
      [current.id],
    ),
    query<RecipeRow>(
      "SELECT prc.variant_id, prc.inventory_item_id, prc.quantity, i.quantity AS available_quantity, i.active FROM product_recipe_components prc JOIN inventory_items i ON i.id = prc.inventory_item_id WHERE i.restaurant_id = $1",
      [current.id],
    ),
    query<{ kind: "logo" | "cover"; updated_at: string }>(
      "SELECT kind, updated_at FROM restaurant_brand_images WHERE restaurant_id = $1",
      [current.id],
    ),
  ]);
  const imageVersion = (kind: "logo" | "cover") => {
    const image = brandImages.rows.find((row) => row.kind === kind);
    return image
      ? `/api/public/branding/${kind}?v=${new Date(image.updated_at).getTime()}`
      : null;
  };
  const variantsByProduct = Map.groupBy(
    variantResult.rows,
    (variant) => variant.product_id,
  );
  const addonsByProduct = Map.groupBy(
    addonResult.rows,
    (addon) => addon.product_id,
  );
  return {
    restaurant: {
      name: current.name,
      whatsapp: current.whatsapp,
      accentColor: current.accent_color,
    },
    branding: {
      logoUrl: imageVersion("logo"),
      coverUrl: imageVersion("cover"),
    },
    products: productResult.rows.map<PublicMenuProduct>((product) => {
      const variants = (variantsByProduct.get(product.id) ?? []).map(
        (variant) => {
          const recipe = recipeResult.rows.filter(
            (component) => component.variant_id === variant.id,
          );
          const stockAvailable =
            !inventorySettings.rows[0]?.enabled ||
            !recipe.length ||
            recipe.every(
              (component) =>
                component.active &&
                Number(component.available_quantity) >=
                  Number(component.quantity),
            );
          return {
            id: variant.id,
            name: variant.name,
            priceCents: variant.price_cents,
            stockAvailable,
          };
        },
      );
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        category: product.category,
        sector: product.kitchen_sector,
        available:
          product.available &&
          variants.some((variant) => variant.stockAvailable),
        featured: product.featured,
        imageUrl: product.image_updated_at
          ? `/api/public/products/${product.id}/image?v=${new Date(product.image_updated_at).getTime()}`
          : null,
        variants,
        addons: (addonsByProduct.get(product.id) ?? []).map((addon) => ({
          id: addon.id,
          name: addon.name,
          priceCents: addon.price_cents,
        })),
      };
    }),
  };
}

function estimatedMinutes(activeTicketCount: number, sectors: number) {
  return Math.min(90, Math.max(18, 12 + activeTicketCount * 3 + sectors * 4));
}

export async function getCurrentEstimate() {
  const current = await restaurant();
  const active = await query<{ count: string }>(
    "SELECT count(*) FROM kitchen_tickets WHERE restaurant_id = $1 AND status IN ('new', 'preparing')",
    [current.id],
  );
  return estimatedMinutes(Number(active.rows[0].count), 1);
}

async function defaultDeliveryFee(restaurantId: string, client?: PoolClient) {
  const sql = "SELECT default_delivery_fee_cents FROM restaurants WHERE id=$1";
  const result = client ? await client.query<{default_delivery_fee_cents: number}>(sql, [restaurantId])
    : await query<{default_delivery_fee_cents: number}>(sql, [restaurantId]);
  return result.rows[0].default_delivery_fee_cents;
}

function validateCashTendered(method: string | null, tendered: number | null, total: number) {
  if (tendered !== null) {
    if (!Number.isInteger(tendered) || tendered < 0 || tendered > 1000000) throw new Error("O valor para troco pode ser de no máximo R$ 10.000,00.");
    if (method !== "cash") throw new Error("Troco só para pagamento em dinheiro.");
    if (tendered < total) throw new Error(`O valor para troco precisa ser maior ou igual ao total (${(total / 100).toLocaleString("pt-BR", {style: "currency", currency: "BRL"})}).`);
  }
}

async function deliveryPayment(input: CreateOrderInput, currentId: string, total: number, client: PoolClient) {
  if (input.fulfillment !== "delivery") return {fee: 0, method: null, tendered: null};
  const internal = input.source === "waiter";
  const fee = internal && input.deliveryFeeCents !== undefined ? input.deliveryFeeCents : await defaultDeliveryFee(currentId, client);
  const method = internal ? input.expectedPaymentMethod ?? null : null;
  const tendered = internal ? input.cashTenderedCents ?? null : null;
  if (!Number.isInteger(fee) || fee < 0 || fee > 20000) throw new Error("A taxa de entrega pode ser de no máximo R$ 200,00.");
  validateCashTendered(method, tendered, total + fee);
  return {fee, method, tendered};
}

async function normalizeOrderItems(client: PoolClient, restaurantId: string, items: CreateOrderInput["items"]) {
  const variants = await client.query<
    VariantRow & {
      product_name: string;
      kitchen_sector: string;
      available: boolean;
    }
  >(
    "SELECT v.id, v.product_id, v.name, v.price_cents, p.name AS product_name, p.kitchen_sector, p.available FROM menu_variants v JOIN menu_products p ON p.id = v.product_id WHERE p.restaurant_id = $1 AND v.active",
    [restaurantId],
  );
  const variantsById = new Map(
    variants.rows.map((variant) => [variant.id, variant]),
  );
  const addonIds = [
    ...new Set(items.flatMap((item) => item.addonIds ?? [])),
  ];
  const addonResult = addonIds.length
    ? await client.query<AddonRow>(
        "SELECT a.id, a.product_id, a.name, a.price_cents FROM product_addons a JOIN menu_products p ON p.id = a.product_id WHERE p.restaurant_id = $1 AND a.id = ANY($2::uuid[]) AND a.active",
        [restaurantId, addonIds],
      )
    : { rows: [] as AddonRow[] };
  const addonsById = new Map(
    addonResult.rows.map((addon) => [addon.id, addon]),
  );

  const normalizedItems = items.map((item) => {
    const variant = variantsById.get(item.variantId);
    if (
      !variant ||
      variant.product_id !== item.productId ||
      !variant.available
    )
      throw new Error("Um item selecionado não está mais disponível.");
    if (
      !Number.isInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 50
    )
      throw new Error("Quantidade inválida.");
    const selectedAddons = (item.addonIds ?? []).map((id) => {
      const addon = addonsById.get(id);
      if (!addon || addon.product_id !== item.productId)
        throw new Error("Adicional inválido.");
      return addon;
    });
    return {
      ...item,
      variant,
      selectedAddons,
      lineTotal:
        item.quantity *
        (variant.price_cents +
          selectedAddons.reduce((sum, addon) => sum + addon.price_cents, 0)),
    };
  });
  return normalizedItems;
}

async function insertOrderItems(client: PoolClient, orderId: string, normalizedItems: Awaited<ReturnType<typeof normalizeOrderItems>>) {
  for (const item of normalizedItems) {
    await client.query(
      "INSERT INTO order_items (order_id, product_id, variant_id, product_name, variant_name, kitchen_sector, quantity, unit_price_cents, addons, note) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)",
      [
        orderId,
        item.productId,
        item.variantId,
        item.variant.product_name,
        item.variant.name,
        item.variant.kitchen_sector,
        item.quantity,
        item.variant.price_cents,
        JSON.stringify(
          item.selectedAddons.map((addon) => ({
            id: addon.id,
            name: addon.name,
            priceCents: addon.price_cents,
          })),
        ),
        item.note ?? null,
      ],
    );
  }
}

async function insertOrderDelivery(client: PoolClient, orderId: string, input: CreateOrderInput, payment: Awaited<ReturnType<typeof deliveryPayment>>) {
  if (input.fulfillment === "delivery" && input.delivery) {
    const delivery = input.delivery;
    await client.query(
      "INSERT INTO delivery_details (order_id, address_line1, address_line2, neighborhood, city, state, postal_code, reference, latitude, longitude, delivery_contact_name, delivery_contact_phone, expected_payment_method, cash_tendered_cents) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)",
      [
        orderId,
        delivery.addressLine1,
        delivery.addressLine2 ?? null,
        delivery.neighborhood ?? null,
        delivery.city ?? null,
        delivery.state ?? null,
        delivery.postalCode ?? null,
        delivery.reference ?? null,
        delivery.latitude ?? null,
        delivery.longitude ?? null,
        input.customer?.name ?? null,
        input.customer?.phone ?? null,
        payment.method,
        payment.tendered,
      ],
    );
  }
}

async function insertOrderHeader(client: PoolClient, restaurantId: string, input: CreateOrderInput,
  tableId: string | null, subtotal: number, service: number, payment: Awaited<ReturnType<typeof deliveryPayment>>,
  idempotencyKey: string, fingerprint: string) {
  const counter = await client.query<{ order_number: string }>(
    "UPDATE restaurant_counters SET next_order_number=next_order_number+1, updated_at=now() WHERE restaurant_id=$1 RETURNING next_order_number-1 AS order_number",
    [restaurantId],
  );
  const orderNumber = Number(counter.rows[0].order_number);
  const insertedOrder = await client.query<{ id: string }>(
    "INSERT INTO orders (restaurant_id,order_number,queue_number,source,fulfillment,status,table_id,customer_name,customer_phone,notes,subtotal_cents,service_cents,total_cents,approval_origin,request_key,request_hash,delivery_fee_cents) VALUES ($1,$2,NULL,$3,$4,'pending',$5,$6,$7,$8,$9,$10,$11,'pending',$12,$13,$14) RETURNING id",
    [
      restaurantId,
      orderNumber,
      input.source,
      input.fulfillment,
      tableId,
      input.customer?.name ?? null,
      input.customer?.phone ?? null,
      input.notes ?? null,
      subtotal,
      service,
      subtotal + service + payment.fee,
      idempotencyKey,
      fingerprint,
      payment.fee,
    ],
  );
  const orderId = insertedOrder.rows[0].id;
  return orderId;
}

export async function createOrder(
  input: CreateOrderInput,
  options: {
    idempotencyKey: string;
    actor?: OrderActor;
    sendToKitchen?: boolean;
  },
) {
  if (options.sendToKitchen) {
    if (!options.actor || input.source !== "waiter")
      throw new Error("Envio à cozinha exige um atendente autenticado.");
    assertOrderApprover(options.actor);
  }
  const fingerprint = requestHash({
    input,
    send: Boolean(options.sendToKitchen),
    actor: options.actor ?? null,
  });
  if (!input.items.length)
    throw new Error("O pedido precisa ter ao menos um item.");
  if (input.fulfillment === "dine_in" && !input.tableNumber)
    throw new Error("Informe a mesa do pedido presencial.");
  if (input.fulfillment === "delivery" && !input.delivery?.addressLine1)
    throw new Error("Informe o endereço de entrega.");

  return transaction(async (client) => {
    const current = await restaurant(client);
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `order-request:${current.id}:${options.idempotencyKey}`,
    ]);
    const repeated = await client.query<{ id: string; request_hash: string }>(
      "SELECT id, request_hash FROM orders WHERE restaurant_id=$1 AND request_key=$2",
      [current.id, options.idempotencyKey],
    );
    if (repeated.rows[0]) {
      if (repeated.rows[0].request_hash !== fingerprint)
        throw new Error(
          "Esta solicitação já foi usada com outros dados. Confira o pedido antes de reenviar.",
        );
      return orderReceipt(client, repeated.rows[0].id, current.id);
    }
    let tableId: string | null = null;
    if (input.tableNumber) {
      const table = await client.query<{ id: string }>(
        "SELECT id FROM dining_tables WHERE restaurant_id = $1 AND number = $2 AND active FOR UPDATE",
        [current.id, input.tableNumber],
      );
      if (!table.rows[0]) throw new Error("Mesa não encontrada.");
      tableId = table.rows[0].id;
    }

    const normalizedItems = await normalizeOrderItems(client, current.id, input.items);
    const subtotal = normalizedItems.reduce(
      (sum, item) => sum + item.lineTotal,
      0,
    );
    const service =
      input.fulfillment === "dine_in"
        ? Math.round((subtotal * current.service_rate_basis_points) / 10_000)
        : 0;
    const payment = await deliveryPayment(input, current.id, subtotal + service, client);
    const orderId = await insertOrderHeader(client, current.id, input, tableId, subtotal, service, payment, options.idempotencyKey, fingerprint);
    await insertOrderItems(client, orderId, normalizedItems);
    await insertOrderDelivery(client, orderId, input, payment);
    await client.query(
      "INSERT INTO order_events(order_id,event_type,actor_role,detail) VALUES($1,'order_registered',$2,$3::jsonb)",
      [
        orderId,
        options.actor?.role ?? "customer",
        JSON.stringify({
          source: input.source,
          registeredBy: options.actor?.name ?? null,
        }),
      ],
    );
    if (options.sendToKitchen && options.actor)
      await approveOrderInTransaction(client, current.id, orderId, 1, options.actor);
    return orderReceipt(client, orderId, current.id);
  });
}

async function orderReceipt(
  client: PoolClient,
  orderId: string,
  restaurantId: string,
) {
  const result = await client.query<{
    id: string;
    order_number: string;
    queue_number: string | null;
    estimated_minutes: number | null;
    total_cents: number;
    status: string;
    revision: number;
  }>(
    "SELECT id,order_number,queue_number,estimated_minutes,total_cents,status,revision FROM orders WHERE id=$1 AND restaurant_id=$2",
    [orderId, restaurantId],
  );
  const o = result.rows[0];
  if (!o) throw new Error("Pedido não encontrado.");
  return {
    id: o.id,
    orderNumber: Number(o.order_number),
    queueNumber: o.queue_number === null ? null : Number(o.queue_number),
    estimatedMinutes: o.estimated_minutes,
    totalCents: o.total_cents,
    status: o.status,
    revision: o.revision,
  };
}

async function approveOrderInTransaction(
  client: PoolClient,
  restaurantId: string,
  orderId: string,
  revision: number,
  actor: OrderActor,
) {
  assertOrderApprover(actor);
  const result = await client.query<{
    status: string;
    revision: number;
    approval_origin: string;
  }>(
    "SELECT status,revision,approval_origin FROM orders WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
    [orderId, restaurantId],
  );
  const order = result.rows[0];
  if (!order) throw new Error("Pedido não encontrado.");
  if (order.approval_origin === "staff" && order.status !== "cancelled")
    return orderReceipt(client, orderId, restaurantId);
  if (order.status !== "pending")
    throw new Error("Este pedido não está aguardando aprovação.");
  if (order.revision !== revision)
    throw new Error("Pedido alterado. Recarregue e confira antes de enviar.");
  // Creation with immediate approval already holds this counter. Pending-order
  // approval must acquire it before inventory settings too, avoiding a lock cycle.
  await client.query("SELECT restaurant_id FROM restaurant_counters WHERE restaurant_id=$1 FOR UPDATE", [restaurantId]);
  await client.query(
    "SELECT restaurant_id FROM inventory_settings WHERE restaurant_id=$1 FOR UPDATE",
    [restaurantId],
  );
  const items = (
    await client.query<{
      id: string;
      variant_id: string | null;
      product_id: string | null;
      quantity: number;
      kitchen_sector: string;
      addons: Array<{ id: string }>;
    }>(
      "SELECT id,variant_id,product_id,quantity,kitchen_sector,addons FROM order_items WHERE order_id=$1 ORDER BY id",
      [orderId],
    )
  ).rows;
  const normalized: Array<{ variant: VariantRow; quantity: number }> = [];
  for (const item of items) {
    const variants = await client.query<VariantRow>(
      "SELECT v.id,v.product_id,v.name,v.price_cents FROM menu_variants v JOIN menu_products p ON p.id=v.product_id WHERE v.id=$1 AND p.id=$2 AND p.restaurant_id=$3 AND p.available AND v.active FOR SHARE OF p,v",
      [item.variant_id, item.product_id, restaurantId],
    );
    if (!variants.rows[0])
      throw new Error(
        "Um item não está mais disponível. Recuse o pedido e registre uma nova solicitação.",
      );
    if (item.addons.length) {
      const addons = await client.query(
        "SELECT id FROM product_addons WHERE product_id=$1 AND active AND id=ANY($2::uuid[]) FOR SHARE",
        [item.product_id, item.addons.map((a) => a.id)],
      );
      if (addons.rowCount !== new Set(item.addons.map((a) => a.id)).size)
        throw new Error("Um adicional não está mais disponível.");
    }
    normalized.push({ variant: variants.rows[0], quantity: item.quantity });
    const costSnapshot = await snapshotRecipeCost(
      client,
      restaurantId,
      item.variant_id!,
      item.addons,
    );
    await client.query(
      "UPDATE order_items SET cost_snapshot=$2::jsonb WHERE id=$1",
      [item.id, JSON.stringify(costSnapshot)],
    );
  }
  await consumeInventoryForOrder(client, restaurantId, orderId, normalized);
  const sectors = [...new Set(items.map((i) => i.kitchen_sector))];
  const count = (
    await client.query<{ count: string }>(
      "SELECT count(*) FROM kitchen_tickets WHERE restaurant_id=$1 AND status IN ('new','preparing')",
      [restaurantId],
    )
  ).rows[0].count;
  const estimate = estimatedMinutes(Number(count), sectors.length);
  const queue = (
    await client.query<{ number: string }>(
      "UPDATE restaurant_counters SET next_queue_number=next_queue_number+1,updated_at=now() WHERE restaurant_id=$1 RETURNING next_queue_number-1 AS number",
      [restaurantId],
    )
  ).rows[0].number;
  await client.query(
    "UPDATE orders SET status='confirmed',queue_number=$3,estimated_minutes=$4,confirmed_at=now(),approval_origin='staff',approved_by_name=$5,approved_by_role=$6,approved_by_staff_id=$7,updated_at=now() WHERE id=$1 AND restaurant_id=$2",
    [
      orderId,
      restaurantId,
      queue,
      estimate,
      actor.name,
      actor.role,
      actor.staffId ?? null,
    ],
  );
  for (const sector of sectors)
    await client.query(
      "INSERT INTO kitchen_tickets(restaurant_id,order_id,kitchen_sector,queue_number) VALUES($1,$2,$3,$4)",
      [restaurantId, orderId, sector, queue],
    );
  await client.query(
    "INSERT INTO order_events(order_id,event_type,actor_role,detail) VALUES($1,'order_approved',$2,$3::jsonb)",
    [
      orderId,
      actor.role,
      JSON.stringify({
        approvedBy: actor.name,
        staffId: actor.staffId ?? null,
        revision,
        queueNumber: Number(queue),
      }),
    ],
  );
  return orderReceipt(client, orderId, restaurantId);
}

export async function approveOrder(
  orderId: string,
  revision: number,
  actor: OrderActor,
) {
  return transaction(async (client) => {
    const current = await restaurant(client);
    return approveOrderInTransaction(
      client,
      current.id,
      orderId,
      revision,
      actor,
    );
  });
}

export async function rejectOrder(
  orderId: string,
  revision: number,
  reason: string,
  actor: OrderActor,
) {
  assertOrderApprover(actor);
  return transaction(async (client) => {
    const current = await restaurant(client);
    const result = await client.query<{ status: string; revision: number }>(
      "SELECT status,revision FROM orders WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
      [orderId, current.id],
    );
    const order = result.rows[0];
    if (!order || order.status !== "pending" || order.revision !== revision)
      throw new Error(
        "Pedido não está mais pendente nesta revisão. Recarregue a lista.",
      );
    await client.query(
      "UPDATE orders SET status='cancelled',cancelled_at=now(),updated_at=now() WHERE id=$1",
      [orderId],
    );
    await client.query(
      "INSERT INTO order_events(order_id,event_type,actor_role,detail) VALUES($1,'order_rejected',$2,$3::jsonb)",
      [
        orderId,
        actor.role,
        JSON.stringify({
          reason,
          rejectedBy: actor.name,
          staffId: actor.staffId ?? null,
          revision,
        }),
      ],
    );
    return { id: orderId };
  });
}

export async function getKitchenQueue(sector?: string) {
  const current = await restaurant();
  const result = await query<{
    ticket_id: string;
    order_id: string;
    order_number: string;
    queue_number: string;
    kitchen_sector: string;
    ticket_status: KitchenTicket["status"];
    fulfillment: KitchenTicket["fulfillment"];
    table_number: number | null;
    customer_name: string | null;
    estimated_minutes: number | null;
    created_at: string;
    confirmed_at: string | null;
    notes: string | null;
    items: KitchenTicket["items"];
  }>(
    `SELECT kt.id AS ticket_id, o.id AS order_id, o.order_number, kt.queue_number, kt.kitchen_sector, kt.status AS ticket_status, o.fulfillment, t.number AS table_number, o.customer_name, o.estimated_minutes, o.created_at, o.confirmed_at, o.notes,
      COALESCE(json_agg(json_build_object('productName', oi.product_name, 'variantName', oi.variant_name, 'quantity', oi.quantity, 'addons', oi.addons, 'note', oi.note) ORDER BY oi.created_at) FILTER (WHERE oi.kitchen_sector = kt.kitchen_sector), '[]'::json) AS items
     FROM kitchen_tickets kt JOIN orders o ON o.id = kt.order_id LEFT JOIN dining_tables t ON t.id = o.table_id LEFT JOIN order_items oi ON oi.order_id = o.id
     WHERE kt.restaurant_id = $1 AND kt.status <> 'cancelled' AND o.status IN ('confirmed','preparing','ready') AND ($2::text IS NULL OR kt.kitchen_sector = $2)
     GROUP BY kt.id, o.id, t.number
     ORDER BY CASE kt.status WHEN 'new' THEN 0 WHEN 'preparing' THEN 1 ELSE 2 END, kt.priority DESC, kt.queue_number`,
    [current.id, sector ?? null],
  );
  return result.rows.map((ticket) => ({
    id: ticket.ticket_id,
    orderId: ticket.order_id,
    orderNumber: Number(ticket.order_number),
    queueNumber: Number(ticket.queue_number),
    sector: ticket.kitchen_sector,
    status: ticket.ticket_status,
    fulfillment: ticket.fulfillment,
    tableNumber: ticket.table_number,
    customerName: ticket.customer_name,
    estimatedMinutes: ticket.estimated_minutes,
    createdAt: ticket.created_at,
    confirmedAt: ticket.confirmed_at,
    notes: ticket.notes,
    items: ticket.items,
  }));
}

export async function updateKitchenTicket(
  ticketId: string,
  status: "preparing" | "ready",
) {
  return transaction(async (client) => {
    const current = await restaurant(client);
    const locked = await client.query(
      "SELECT o.id FROM orders o JOIN kitchen_tickets kt ON kt.order_id=o.id WHERE kt.id=$1 AND o.restaurant_id=$2 FOR UPDATE OF o",
      [ticketId, current.id],
    );
    if (!locked.rowCount) throw new Error("Comanda não encontrada.");
    const ticket = await client.query<{ order_id: string }>(
      "UPDATE kitchen_tickets kt SET status = $2::kitchen_ticket_status, started_at = CASE WHEN $2::kitchen_ticket_status = 'preparing'::kitchen_ticket_status THEN COALESCE(started_at, now()) ELSE started_at END, ready_at = CASE WHEN $2::kitchen_ticket_status = 'ready'::kitchen_ticket_status THEN now() ELSE ready_at END, updated_at = now() WHERE kt.id = $1 AND ((kt.status = 'new' AND $2 = 'preparing') OR (kt.status IN ('new', 'preparing') AND $2 = 'ready')) AND EXISTS (SELECT 1 FROM orders o WHERE o.id = kt.order_id AND o.status IN ('confirmed', 'preparing')) RETURNING order_id",
      [ticketId, status],
    );
    if (!ticket.rows[0])
      throw new Error("Esta comanda não está mais nesta etapa da cozinha.");
    const orderId = ticket.rows[0].order_id;
    const summary = await client.query<{
      total: string;
      ready: string;
      preparing: string;
    }>(
      "SELECT count(*) AS total, count(*) FILTER (WHERE status = 'ready') AS ready, count(*) FILTER (WHERE status = 'preparing') AS preparing FROM kitchen_tickets WHERE order_id = $1",
      [orderId],
    );
    const allReady = summary.rows[0].total === summary.rows[0].ready;
    await client.query(
      "UPDATE orders SET status = $2::order_status, ready_at = CASE WHEN $2::order_status = 'ready'::order_status THEN now() ELSE ready_at END, updated_at = now() WHERE id = $1",
      [orderId, allReady ? "ready" : "preparing"],
    );
    await client.query(
      "INSERT INTO order_events (order_id, event_type, actor_role, detail) VALUES ($1,$2,'kitchen',$3::jsonb)",
      [orderId, `kitchen_${status}`, JSON.stringify({ ticketId })],
    );
    return { orderId, status: allReady ? "ready" : "preparing" };
  });
}

type SnapshotOrderRow = {
  id: string;
  revision: number;
  served_at: string | null;
  order_number: string;
  queue_number: string | null;
  source: "waiter" | "public_menu" | "qr_menu";
  fulfillment: "dine_in" | "pickup" | "delivery";
  status: string;
  table_number: number | null;
  customer_name: string | null;
  customer_phone: string | null;
  notes: string | null;
  estimated_minutes: number | null;
  subtotal_cents: number;
  service_cents: number;
  total_cents: number;
  paid_cents: number;
  payments: Array<{ method: string; amountCents: number }>;
  expected_payment_method: string | null;
  cash_tendered_cents: number | null;
  delivery_address_line1: string | null;
  delivery_neighborhood: string | null;
  delivery_reference: string | null;
  created_at: string;
  items: Array<{
    id: string;
    product_id: string | null;
    variant_id: string | null;
    product_name: string;
    variant_name: string;
    kitchen_sector: string;
    quantity: number;
    unit_price_cents: number;
    addons: Array<{ id: string; name: string; priceCents: number }>;
    note: string | null;
  }>;
};

export async function getOperationSnapshot() {
  const current = await restaurant();
  const [menu, tables, orders, kitchen, inventory, deliveryFee] = await Promise.all([
    getPublicMenu(),
    query<{ number: number; label: string | null; active: boolean }>(
      "SELECT number, label, active FROM dining_tables WHERE restaurant_id = $1 ORDER BY number",
      [current.id],
    ),
    query<SnapshotOrderRow>(
      `SELECT o.id, o.revision, o.served_at, o.order_number, o.queue_number, o.source, o.fulfillment, o.status, t.number AS table_number, o.customer_name, o.customer_phone, o.notes, o.estimated_minutes, o.subtotal_cents, o.service_cents, o.total_cents, COALESCE((SELECT sum(p.amount_cents) FROM payments p WHERE p.order_id = o.id AND p.status = 'paid'), 0)::int AS paid_cents, COALESCE((SELECT json_agg(json_build_object('method', p.method, 'amountCents', p.amount_cents)) FROM payments p WHERE p.order_id = o.id AND p.status = 'paid'), '[]'::json) AS payments, max(d.expected_payment_method) AS expected_payment_method, max(d.cash_tendered_cents) AS cash_tendered_cents, max(d.address_line1) AS delivery_address_line1, max(d.neighborhood) AS delivery_neighborhood, max(d.reference) AS delivery_reference, o.created_at,
        COALESCE(json_agg(json_build_object('id', oi.id, 'product_id', oi.product_id, 'variant_id', oi.variant_id, 'product_name', oi.product_name, 'variant_name', oi.variant_name, 'kitchen_sector', oi.kitchen_sector, 'quantity', oi.quantity, 'unit_price_cents', oi.unit_price_cents, 'addons', oi.addons, 'note', oi.note) ORDER BY oi.created_at) FILTER (WHERE oi.id IS NOT NULL), '[]'::json) AS items
       FROM orders o LEFT JOIN dining_tables t ON t.id = o.table_id LEFT JOIN delivery_details d ON d.order_id = o.id LEFT JOIN order_items oi ON oi.order_id = o.id
       WHERE o.restaurant_id = $1 AND (o.status NOT IN ('completed','cancelled') OR o.id IN (SELECT id FROM orders WHERE restaurant_id=$1 AND status IN ('completed','cancelled') ORDER BY created_at DESC LIMIT 200))
       GROUP BY o.id, t.number
       ORDER BY o.created_at DESC`,
      [current.id],
    ),
    getKitchenQueue(),
    inventorySnapshot(current.id),
    defaultDeliveryFee(current.id),
  ]);
  return {
    restaurant: {
      name: current.name,
      plan: current.plan,
      accentColor: current.accent_color,
      whatsapp: current.whatsapp ?? "",
      serviceRate: current.service_rate_basis_points / 100,
      defaultDeliveryFeeCents: deliveryFee,
    },
    branding: menu.branding,
    products: menu.products,
    tables: tables.rows,
    orders: orders.rows.map((order) => ({
      id: order.id,
      revision: order.revision,
      servedAt: order.served_at,
      orderNumber: Number(order.order_number),
      queueNumber:
        order.queue_number === null ? null : Number(order.queue_number),
      source: order.source,
      fulfillment: order.fulfillment,
      status: order.status,
      tableNumber: order.table_number,
      customerName: order.customer_name,
      customerPhone: order.customer_phone,
      notes: order.notes,
      estimatedMinutes: order.estimated_minutes,
      paidCents: order.paid_cents,
      expectedPaymentMethod: order.expected_payment_method,
      cashTenderedCents: order.cash_tendered_cents,
      changeCents: order.cash_tendered_cents === null ? null : order.cash_tendered_cents - order.total_cents,
      delivery: order.delivery_address_line1
        ? {
            addressLine1: order.delivery_address_line1,
            neighborhood: order.delivery_neighborhood,
            reference: order.delivery_reference,
          }
        : null,
      subtotalCents: order.subtotal_cents,
      serviceCents: order.service_cents,
      totalCents: order.total_cents,
      payments: order.payments,
      createdAt: order.created_at,
      items: order.items,
    })),
    kitchen,
    inventory,
  };
}

export async function cancelOrder(
  orderId: string,
  actor: { role: string; name: string; reason: string },
) {
  return transaction(async (client) => {
    const current = await restaurant(client);
    const previous = (
      await client.query<{ status: string; paid: string; started: boolean }>(
        "SELECT o.status,COALESCE((SELECT sum(amount_cents) FROM payments WHERE order_id=o.id AND status='paid'),0) AS paid,EXISTS(SELECT 1 FROM kitchen_tickets WHERE order_id=o.id AND (started_at IS NOT NULL OR ready_at IS NOT NULL)) AS started FROM orders o WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
        [orderId, current.id],
      )
    ).rows[0];
    if (
      !previous ||
      ["completed", "cancelled", "delivered"].includes(previous.status)
    )
      throw new Error("Pedido não pode ser cancelado nesta etapa.");
    if (Number(previous.paid) > 0)
      throw new Error(
        "Pedido já recebeu pagamento. A devolução financeira precisa ser registrada antes do cancelamento.",
      );
    if (previous.started && !["admin", "manager"].includes(actor.role))
      throw new Error("Cancelamento após início do preparo exige gestão.");
    const order = await client.query<{ id: string; restaurant_id: string }>(
      "UPDATE orders SET status='cancelled',cancelled_at=now(),updated_at=now() WHERE id=$1 AND restaurant_id=$2 RETURNING id,restaurant_id",
      [orderId, current.id],
    );
    const consumed = await client.query<{
      inventory_item_id: string;
      quantity_delta: string;
    }>(
      "SELECT inventory_item_id, quantity_delta FROM inventory_movements WHERE order_id = $1 AND type = 'sale_consumption' ORDER BY inventory_item_id FOR UPDATE",
      [orderId],
    );
    for (const movement of previous.started ? [] : consumed.rows) {
      const returned = Math.abs(Number(movement.quantity_delta));
      await client.query(
        "UPDATE inventory_items SET quantity = quantity + $2, updated_at = now() WHERE id = $1",
        [movement.inventory_item_id, returned],
      );
      await client.query(
        "INSERT INTO inventory_movements (restaurant_id, inventory_item_id, type, quantity_delta, order_id, note) VALUES ($1,$2,'cancellation_return',$3,$4,$5)",
        [
          order.rows[0].restaurant_id,
          movement.inventory_item_id,
          returned,
          orderId,
          "Estorno por cancelamento",
        ],
      );
    }
    await client.query(
      "UPDATE kitchen_tickets SET status = 'cancelled', updated_at = now() WHERE order_id = $1 AND status <> 'cancelled'",
      [orderId],
    );
    await client.query(
      "INSERT INTO order_events (order_id, event_type, actor_role, detail) VALUES ($1,'order_cancelled',$2,$3::jsonb)",
      [
        orderId,
        actor.role,
        JSON.stringify({
          reason: actor.reason,
          cancelledBy: actor.name,
          inventoryDisposition: previous.started
            ? "consumed_in_production"
            : "returned",
        }),
      ],
    );
    return { id: orderId };
  });
}

export async function closeTable(
  tableNumber: number,
  payments: Array<{
    method: "Pix" | "Dinheiro" | "Débito" | "Crédito";
    amountCents: number;
  }>,
  actor: { role: string; name: string },
  requestKey: string,
  options?: { allowPartial: boolean; expectedVersion: string },
) {
  return transaction(async (client) => {
    const current = await restaurant(client);
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [
      `payment:${current.id}:${requestKey}`,
    ]);
    const hash = requestHash({ tableNumber, payments, actor, ...(options ? { options } : {}) });
    const prior = (
      await client.query<{
        request_hash: string;
        result: { totalCents: number; changeCents: number };
      }>(
        "SELECT request_hash,result FROM finance_commands WHERE restaurant_id=$1 AND request_key=$2",
        [current.id, requestKey],
      )
    ).rows[0];
    if (prior) {
      if (prior.request_hash !== hash)
        throw new Error("Chave de pagamento já utilizada.");
      return prior.result;
    }
    const table = (
      await client.query<{ id: string }>(
        "SELECT id FROM dining_tables WHERE restaurant_id=$1 AND number=$2 FOR UPDATE",
        [current.id, tableNumber],
      )
    ).rows[0];
    if (!table) throw new Error("Mesa não encontrada.");
    const orders = await client.query<{
      id: string;
      total_cents: number;
      paid: string;
      status: string;
      served_at: Date | null;
    }>(
      "SELECT o.id,o.total_cents,o.status,o.served_at,COALESCE((SELECT sum(amount_cents) FROM payments WHERE order_id=o.id AND status='paid'),0) AS paid FROM orders o WHERE restaurant_id=$1 AND table_id=$2 AND status NOT IN ('completed','cancelled') ORDER BY o.id FOR UPDATE",
      [current.id, table.id],
    );
    if (orders.rows.some((o) => o.status === "pending"))
      throw new Error(
        "Confira os pedidos pendentes antes de receber esta conta.",
      );
    if (options && accountVersion(orders.rows) !== options.expectedVersion)
      throw new Error("A conta mudou. Atualize o saldo e confira os recebimentos antes de confirmar.");
    const balances = orders.rows.map((o) => ({
      id: o.id,
      remaining: Math.max(0, o.total_cents - Number(o.paid)),
    }));
    const due = balances.reduce((sum, o) => sum + o.remaining, 0);
    if (due === 0) throw new Error("Não há saldo a receber nesta mesa.");
    const received = payments.reduce((sum, p) => sum + p.amountCents, 0);
    const cash = payments
      .filter((p) => p.method === "Dinheiro")
      .reduce((sum, p) => sum + p.amountCents, 0);
    const change = Math.max(0, received - due);
    if (received < due && !options?.allowPartial)
      throw new Error("Valor recebido menor que o saldo da conta.");
    if (change > cash)
      throw new Error("Somente pagamentos em dinheiro podem gerar troco.");
    if (change > 0 && change === cash)
      throw new Error(
        "A conta já está coberta pelos meios eletrônicos. Remova o dinheiro que seria devolvido integralmente.",
      );
    let remainingChange = change;
    const methodMap = {
      Pix: "pix",
      Dinheiro: "cash",
      Débito: "debit",
      Crédito: "credit",
    } as const;
    const grouped = Object.values(
      payments.reduce<
        Record<
          string,
          { method: (typeof payments)[number]["method"]; amountCents: number }
        >
      >((groups, payment) => {
        groups[payment.method] ??= { method: payment.method, amountCents: 0 };
        groups[payment.method].amountCents += payment.amountCents;
        return groups;
      }, {}),
    );
    for (const payment of grouped.sort(
      (a, b) =>
        Number(a.method === "Dinheiro") - Number(b.method === "Dinheiro"),
    )) {
      let available = payment.amountCents;
      const cashChange =
        payment.method === "Dinheiro"
          ? Math.min(available, remainingChange)
          : 0;
      available -= cashChange;
      remainingChange -= cashChange;
      let recordedChange = false;
      for (const balance of balances) {
        const applied = Math.min(balance.remaining, available);
        if (applied <= 0) continue;
        const changeForRow = recordedChange ? 0 : cashChange;
        const id = (
          await client.query<{ id: string }>(
            "INSERT INTO payments(order_id,method,amount_cents,status,paid_at,received_cents,change_cents) VALUES($1,$2,$3,'paid',now(),$4,$5) RETURNING id",
            [
              balance.id,
              methodMap[payment.method],
              applied,
              applied + changeForRow,
              changeForRow,
            ],
          )
        ).rows[0].id;
        await postSalePayment(
          client,
          current.id,
          id,
          balance.id,
          methodMap[payment.method],
          applied,
          actor,
        );
        recordedChange = true;
        available -= applied;
        balance.remaining -= applied;
      }
    }
    if (received >= due) await client.query(
      "UPDATE orders SET checkout_group_id=$2 WHERE id=ANY($1::uuid[]) AND restaurant_id=$3",
      [orders.rows.map(o => o.id), requestKey, current.id],
    );
    await client.query(
      "UPDATE orders SET status='completed',updated_at=now() WHERE id=ANY($1::uuid[]) AND served_at IS NOT NULL AND COALESCE((SELECT sum(amount_cents) FROM payments WHERE order_id=orders.id AND status='paid'),0)>=total_cents",
      [orders.rows.map((o) => o.id)],
    );
    for (const order of orders.rows)
      await client.query(
        "INSERT INTO order_events(order_id,event_type,actor_role,detail) VALUES($1,'payment_confirmed',$2,$3::jsonb)",
        [
          order.id,
          actor.role,
          JSON.stringify({
            processedBy: actor.name,
            tableNumber,
            due,
            received,
            change,
          }),
        ],
      );
    const result = { totalCents: Math.min(received, due), changeCents: change, remainingCents: Math.max(0, due-received) };
    await client.query(
      "INSERT INTO finance_commands(restaurant_id,request_key,request_hash,result) VALUES($1,$2,$3,$4::jsonb)",
      [current.id, requestKey, hash, JSON.stringify(result)],
    );
    return result;
  });
}

export async function serveOrder(
  orderId: string,
  actor: { role: string; name: string },
) {
  return transaction(async (client) => {
    const current = await restaurant(client);
    const order = (
      await client.query<{
        status: string;
        fulfillment: string;
        served_at: Date | null;
        paid: boolean;
      }>(
        "SELECT o.status,o.fulfillment,o.served_at,COALESCE((SELECT sum(amount_cents) FROM payments WHERE order_id=o.id AND status='paid'),0)>=o.total_cents AS paid FROM orders o WHERE id=$1 AND restaurant_id=$2 FOR UPDATE",
        [orderId, current.id],
      )
    ).rows[0];
    if (!order || order.fulfillment === "delivery")
      throw new Error("Use o fluxo de entrega para este pedido.");
    if (order.served_at) return { id: orderId };
    if (order.status !== "ready")
      throw new Error("Aguarde todos os setores da cozinha ficarem prontos.");
    await recognizeSale(client, current.id, orderId, actor);
    await client.query(
      "UPDATE orders SET status=$2::order_status,updated_at=now() WHERE id=$1",
      [orderId, order.paid ? "completed" : "delivered"],
    );
    await client.query(
      "INSERT INTO order_events(order_id,event_type,actor_role,detail) VALUES($1,'order_served',$2,$3::jsonb)",
      [orderId, actor.role, JSON.stringify({ servedBy: actor.name })],
    );
    return { id: orderId };
  });
}

export async function recordExternalPayment(
  orderId: string,
  method: "Pix" | "Dinheiro" | "Débito" | "Crédito",
  actor: { role: string; name: string },
) {
  return transaction(async (client) => {
    const current = await restaurant(client);
    const result = await client.query<{
      id: string;
      status: string;
      fulfillment: string;
      total_cents: number;
      paid_cents: number;
    }>(
      "SELECT o.id, o.status, o.fulfillment, o.total_cents, COALESCE((SELECT sum(amount_cents) FROM payments WHERE order_id = o.id AND status = 'paid'), 0)::int AS paid_cents FROM orders o WHERE o.id = $1 AND o.restaurant_id = $2 FOR UPDATE",
      [orderId, current.id],
    );
    const order = result.rows[0];
    if (
      !order ||
      order.fulfillment === "dine_in" ||
      order.status === "cancelled"
    )
      throw new Error("Pedido online não encontrado ou cancelado.");
    if (order.status === "pending")
      throw new Error(
        "Envie ou recuse o pedido antes de registrar o recebimento.",
      );
    if (actor.role === "delivery" && order.fulfillment !== "delivery")
      throw new Error(
        "A equipe de entrega só pode receber pedidos de entrega.",
      );
    if (order.paid_cents >= order.total_cents)
      throw new Error("Este pedido já está pago.");
    if (
      order.fulfillment === "pickup" &&
      !["ready", "delivered"].includes(order.status)
    )
      throw new Error(
        "A retirada precisa estar pronta antes de fechar o pagamento.",
      );
    const amount = order.total_cents - order.paid_cents;
    const methodMap = {
      Pix: "pix",
      Dinheiro: "cash",
      Débito: "debit",
      Crédito: "credit",
    } as const;
    const payment = (
      await client.query<{ id: string }>(
        "INSERT INTO payments(order_id,method,amount_cents,status,paid_at) VALUES($1,$2,$3,'paid',now()) RETURNING id",
        [order.id, methodMap[method], amount],
      )
    ).rows[0];
    await postSalePayment(
      client,
      current.id,
      payment.id,
      order.id,
      methodMap[method],
      amount,
      actor,
    );
    if (order.fulfillment === "pickup")
      await recognizeSale(client, current.id, order.id, actor);
    const completed =
      order.fulfillment === "pickup" || order.status === "delivered";
    if (completed)
      await client.query(
        "UPDATE orders SET status = 'completed', updated_at = now() WHERE id = $1",
        [order.id],
      );
    await client.query(
      "INSERT INTO order_events (order_id, event_type, actor_role, detail) VALUES ($1,'payment_confirmed',$2,$3::jsonb)",
      [
        order.id,
        actor.role,
        JSON.stringify({
          method,
          amountCents: amount,
          processedBy: actor.name,
        }),
      ],
    );
    return { id: order.id, paidCents: order.total_cents, completed };
  });
}

export async function updateDeliveryStatus(
  orderId: string,
  status: "out_for_delivery" | "delivered",
  actor: { role: string; name: string },
) {
  return transaction(async (client) => {
    const current = await restaurant(client);
    const order = await client.query<{ id: string; status: string }>(
      "SELECT o.id, o.status FROM orders o JOIN delivery_details d ON d.order_id = o.id WHERE o.id = $1 AND o.restaurant_id=$2 FOR UPDATE",
      [orderId, current.id],
    );
    if (!order.rows[0]) throw new Error("Pedido de entrega não encontrado.");
    if (status === "out_for_delivery" && order.rows[0].status !== "ready")
      throw new Error("A entrega precisa estar pronta antes de sair.");
    if (status === "delivered" && order.rows[0].status !== "out_for_delivery")
      throw new Error("Marque a saída antes de concluir a entrega.");
    if (status === "delivered")
      await recognizeSale(client, current.id, orderId, actor);
    const paid =
      status === "delivered"
        ? await client.query<{ paid: boolean }>(
            "SELECT COALESCE((SELECT sum(amount_cents) FROM payments WHERE order_id = $1 AND status = 'paid'), 0) >= total_cents AS paid FROM orders WHERE id = $1",
            [orderId],
          )
        : null;
    const nextStatus =
      status === "delivered" && paid?.rows[0]?.paid ? "completed" : status;
    await client.query(
      "UPDATE orders SET status = $2::order_status, delivered_at = CASE WHEN $3 = 'delivered' THEN now() ELSE delivered_at END, updated_at = now() WHERE id = $1",
      [orderId, nextStatus, status],
    );
    await client.query(
      "UPDATE delivery_details SET departed_at = CASE WHEN $2 = 'out_for_delivery' THEN now() ELSE departed_at END, courier_name = CASE WHEN $2 = 'out_for_delivery' THEN $3 ELSE courier_name END, delivered_at = CASE WHEN $2 = 'delivered' THEN now() ELSE delivered_at END WHERE order_id = $1",
      [orderId, status, actor.name],
    );
    await client.query(
      "INSERT INTO order_events (order_id, event_type, actor_role, detail) VALUES ($1,$2,$3,$4::jsonb)",
      [
        orderId,
        `delivery_${status}`,
        actor.role,
        JSON.stringify({ updatedBy: actor.name }),
      ],
    );
    return { id: orderId, status: nextStatus };
  });
}

export async function setProductAvailability(
  productId: string,
  available: boolean,
) {
  const current = await restaurant();
  const updated = await query<{ id: string }>(
    "UPDATE menu_products SET available = $2, updated_at = now() WHERE id = $1 AND restaurant_id=$3 RETURNING id",
    [productId, available, current.id],
  );
  if (!updated.rows[0]) throw new Error("Produto não encontrado.");
  return { id: productId, available };
}

export async function updateRestaurantSettings(input: {
  name: string;
  whatsapp: string;
  serviceRate: number;
}) {
  if (
    !Number.isFinite(input.serviceRate) ||
    input.serviceRate < 0 ||
    input.serviceRate > 100
  )
    throw new Error("Taxa de serviço inválida.");
  const current = await restaurant();
  const updated = await query<RestaurantRow>(
    "UPDATE restaurants SET name = $2, whatsapp = NULLIF($3,''), service_rate_basis_points = $4, updated_at = now() WHERE id = $1 RETURNING id, name, whatsapp, service_rate_basis_points",
    [
      current.id,
      input.name.trim(),
      input.whatsapp.trim(),
      Math.round(input.serviceRate * 100),
    ],
  );
  if (!updated.rows[0]) throw new Error("Restaurante não encontrado.");
  return {
    name: updated.rows[0].name,
    whatsapp: updated.rows[0].whatsapp ?? "",
    serviceRate: updated.rows[0].service_rate_basis_points / 100,
  };
}

export async function createDiningTable(number: number) {
  const current = await restaurant();
  const result = await query<{ number: number }>(
    "INSERT INTO dining_tables (restaurant_id, number, label) VALUES ($1,$2,$3) RETURNING number",
    [current.id, number, `Mesa ${String(number).padStart(2, "0")}`],
  );
  return result.rows[0];
}

export async function createDiningTables(input: {
  numbers: number[];
  labels?: Record<number, string>;
}) {
  if (
    !input.numbers.length ||
    input.numbers.length > 100 ||
    input.numbers.some(
      (number) => !Number.isInteger(number) || number < 1 || number > 200,
    )
  )
    throw new Error("Informe de 1 a 100 mesas válidas.");
  return transaction(async (client) => {
    const current = await restaurant(client);
    const created: number[] = [];
    for (const number of [...new Set(input.numbers)]) {
      const label =
        input.labels?.[number]?.trim() ||
        `Mesa ${String(number).padStart(2, "0")}`;
      const result = await client.query<{ number: number }>(
        "INSERT INTO dining_tables (restaurant_id, number, label) VALUES ($1,$2,$3) ON CONFLICT (restaurant_id, number) DO NOTHING RETURNING number",
        [current.id, number, label],
      );
      if (result.rows[0]) created.push(result.rows[0].number);
    }
    return {
      created,
      skipped: input.numbers.filter((number) => !created.includes(number)),
    };
  });
}

export async function updateDiningTable(
  number: number,
  label: string,
  active: boolean,
) {
  return transaction(async (client) => {
    const current = await restaurant(client);
    if (!active) {
      const open = await client.query(
        "SELECT 1 FROM orders o JOIN dining_tables t ON t.id = o.table_id WHERE o.restaurant_id = $1 AND t.number = $2 AND o.status NOT IN ('completed', 'cancelled') LIMIT 1",
        [current.id, number],
      );
      if (open.rowCount)
        throw new Error("Feche a comanda antes de desativar esta mesa.");
    }
    const result = await client.query<{
      number: number;
      label: string;
      active: boolean;
    }>(
      "UPDATE dining_tables SET label = $3, active = $4 WHERE restaurant_id = $1 AND number = $2 RETURNING number, label, active",
      [current.id, number, label.trim(), active],
    );
    if (!result.rows[0]) throw new Error("Mesa não encontrada.");
    return result.rows[0];
  });
}

export type MenuProductInput = {
  name: string;
  category: string;
  sector: string;
  description?: string;
  available?: boolean;
  featured?: boolean;
  variants: Array<{ id?: string; name: string; priceCents: number }>;
  addons: Array<{ id?: string; name: string; priceCents: number }>;
};

export async function createMenuProduct(input: MenuProductInput) {
  return transaction(async (client) => {
    const current = await restaurant(client);
    const product = await client.query<{ id: string }>(
      "INSERT INTO menu_products (restaurant_id, name, description, category, kitchen_sector, available, featured, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,(SELECT COALESCE(max(sort_order), -1) + 1 FROM menu_products WHERE restaurant_id = $1)) RETURNING id",
      [
        current.id,
        input.name.trim(),
        input.description?.trim() ?? "",
        input.category.trim(),
        input.sector.trim(),
        input.available ?? true,
        input.featured ?? false,
      ],
    );
    for (const [index, variant] of input.variants.entries())
      await client.query(
        "INSERT INTO menu_variants (product_id, name, price_cents, sort_order) VALUES ($1,$2,$3,$4)",
        [product.rows[0].id, variant.name.trim(), variant.priceCents, index],
      );
    for (const [index, addon] of input.addons.entries())
      await client.query(
        "INSERT INTO product_addons (product_id, name, price_cents, sort_order) VALUES ($1,$2,$3,$4)",
        [product.rows[0].id, addon.name.trim(), addon.priceCents, index],
      );
    return { id: product.rows[0].id };
  });
}

export async function updateMenuProduct(
  productId: string,
  input: MenuProductInput,
) {
  return transaction(async (client) => {
    const current = await restaurant(client);
    const product = await client.query<{ id: string }>(
      "UPDATE menu_products SET name = $3, description = $4, category = $5, kitchen_sector = $6, available = $7, featured = $8, updated_at = now() WHERE id = $1 AND restaurant_id = $2 RETURNING id",
      [
        productId,
        current.id,
        input.name.trim(),
        input.description?.trim() ?? "",
        input.category.trim(),
        input.sector.trim(),
        input.available ?? true,
        input.featured ?? false,
      ],
    );
    if (!product.rows[0]) throw new Error("Produto não encontrado.");
    const variantIds: string[] = [];
    for (const [index, variant] of input.variants.entries()) {
      if (variant.id) {
        const updated = await client.query<{ id: string }>(
          "UPDATE menu_variants SET name = $3, price_cents = $4, active = true, sort_order = $5 WHERE id = $1 AND product_id = $2 RETURNING id",
          [
            variant.id,
            productId,
            variant.name.trim(),
            variant.priceCents,
            index,
          ],
        );
        if (!updated.rows[0])
          throw new Error("Variação não encontrada neste produto.");
        variantIds.push(updated.rows[0].id);
      } else {
        const added = await client.query<{ id: string }>(
          "INSERT INTO menu_variants (product_id, name, price_cents, sort_order) VALUES ($1,$2,$3,$4) RETURNING id",
          [productId, variant.name.trim(), variant.priceCents, index],
        );
        variantIds.push(added.rows[0].id);
      }
    }
    await client.query(
      "UPDATE menu_variants SET active = false WHERE product_id = $1 AND NOT (id = ANY($2::uuid[]))",
      [productId, variantIds],
    );
    const addonIds: string[] = [];
    for (const [index, addon] of input.addons.entries()) {
      if (addon.id) {
        const updated = await client.query<{ id: string }>(
          "UPDATE product_addons SET name = $3, price_cents = $4, active = true, sort_order = $5 WHERE id = $1 AND product_id = $2 RETURNING id",
          [addon.id, productId, addon.name.trim(), addon.priceCents, index],
        );
        if (!updated.rows[0])
          throw new Error("Adicional não encontrado neste produto.");
        addonIds.push(updated.rows[0].id);
      } else {
        const added = await client.query<{ id: string }>(
          "INSERT INTO product_addons (product_id, name, price_cents, sort_order) VALUES ($1,$2,$3,$4) RETURNING id",
          [productId, addon.name.trim(), addon.priceCents, index],
        );
        addonIds.push(added.rows[0].id);
      }
    }
    await client.query(
      "UPDATE product_addons SET active = false WHERE product_id = $1 AND NOT (id = ANY($2::uuid[]))",
      [productId, addonIds],
    );
    return { id: productId };
  });
}

export async function setProductImage(productId: string, imageData: Buffer) {
  const current = await restaurant();
  const result = await query<{ product_id: string }>(
    "INSERT INTO product_images (product_id, mime_type, image_data) SELECT p.id, 'image/webp', $3 FROM menu_products p WHERE p.id = $1 AND p.restaurant_id = $2 ON CONFLICT (product_id) DO UPDATE SET image_data = EXCLUDED.image_data, updated_at = now() RETURNING product_id",
    [productId, current.id, imageData],
  );
  if (!result.rows[0]) throw new Error("Produto não encontrado.");
  return { id: productId };
}

export async function getProductImage(productId: string) {
  const current = await restaurant();
  const result = await query<{ image_data: Buffer; mime_type: string }>(
    "SELECT img.image_data, img.mime_type FROM product_images img JOIN menu_products p ON p.id = img.product_id WHERE p.id = $1 AND p.restaurant_id = $2",
    [productId, current.id],
  );
  return result.rows[0] ?? null;
}

export type BrandImageKind = "logo" | "cover";

export async function getBrandImage(kind: BrandImageKind) {
  const current = await restaurant();
  const result = await query<{ image_data: Buffer; mime_type: string }>(
    "SELECT image_data, mime_type FROM restaurant_brand_images WHERE restaurant_id = $1 AND kind = $2",
    [current.id, kind],
  );
  return result.rows[0] ?? null;
}

export async function setBrandImage(kind: BrandImageKind, imageData: Buffer) {
  const current = await restaurant();
  await query(
    "INSERT INTO restaurant_brand_images (restaurant_id, kind, mime_type, image_data) VALUES ($1,$2,'image/webp',$3) ON CONFLICT (restaurant_id, kind) DO UPDATE SET image_data = EXCLUDED.image_data, updated_at = now()",
    [current.id, kind, imageData],
  );
  return { kind };
}

export async function removeBrandImage(kind: BrandImageKind) {
  const current = await restaurant();
  await query(
    "DELETE FROM restaurant_brand_images WHERE restaurant_id = $1 AND kind = $2",
    [current.id, kind],
  );
  return { kind };
}

export async function setInventoryEnabled(enabled: boolean) {
  return transaction(async (client) => {
    const current = await restaurant(client);
    await client.query(
      "INSERT INTO inventory_settings (restaurant_id, enabled, enabled_at) VALUES ($1,$2,CASE WHEN $2 THEN now() ELSE NULL END) ON CONFLICT (restaurant_id) DO UPDATE SET enabled = EXCLUDED.enabled, enabled_at = CASE WHEN EXCLUDED.enabled THEN COALESCE(inventory_settings.enabled_at, now()) ELSE NULL END, updated_at = now()",
      [current.id, enabled],
    );
    return { enabled };
  });
}

export async function createInventoryItem(input: {
  name: string;
  category?: string;
  unit: InventoryItem["unit"];
  quantity?: number;
  minimumQuantity?: number;
  unitCostCents?: number;
}) {
  if (!input.name.trim()) throw new Error("Informe o nome do material.");
  const quantity = input.quantity ?? 0;
  const minimumQuantity = input.minimumQuantity ?? 0;
  const unitCostCents = input.unitCostCents ?? 0;
  if (
    ![quantity, minimumQuantity, unitCostCents].every(Number.isFinite) ||
    quantity < 0 ||
    minimumQuantity < 0 ||
    unitCostCents < 0
  )
    throw new Error("Valores de estoque inválidos.");
  return transaction(async (client) => {
    const current = await restaurant(client);
    const item = await client.query<InventoryItemRow>(
      "INSERT INTO inventory_items (restaurant_id, name, category, unit, quantity, minimum_quantity, average_cost_cents,cost_known) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id, name, category, unit, quantity, minimum_quantity, average_cost_cents, active",
      [
        current.id,
        input.name.trim(),
        input.category?.trim() || "Geral",
        input.unit,
        quantity,
        minimumQuantity,
        unitCostCents,
        input.unitCostCents !== undefined,
      ],
    );
    if (quantity > 0)
      await client.query(
        "INSERT INTO inventory_movements (restaurant_id, inventory_item_id, type, quantity_delta, unit_cost_cents, note) VALUES ($1,$2,'initial',$3,$4,$5)",
        [
          current.id,
          item.rows[0].id,
          quantity,
          unitCostCents,
          "Estoque inicial",
        ],
      );
    return inventoryItem(item.rows[0]);
  });
}

export async function registerInventoryMovement(input: {
  itemId: string;
  type: "purchase" | "loss" | "adjustment";
  quantity: number;
  unitCostCents?: number;
  note?: string;
}) {
  if (!Number.isFinite(input.quantity) || input.quantity === 0)
    throw new Error("Informe uma quantidade diferente de zero.");
  if (input.type !== "adjustment" && input.quantity < 0)
    throw new Error("A quantidade deve ser positiva.");
  return transaction(async (client) => {
    const current = await restaurant(client);
    const item = await client.query<InventoryItemRow>(
      "SELECT id, name, category, unit, quantity, minimum_quantity, average_cost_cents,cost_known, active FROM inventory_items WHERE id = $1 AND restaurant_id = $2 FOR UPDATE",
      [input.itemId, current.id],
    );
    if (!item.rows[0]) throw new Error("Material não encontrado.");
    const before = inventoryItem(item.rows[0]);
    const delta =
      input.type === "loss" ? -Math.abs(input.quantity) : input.quantity;
    if (before.quantity + delta < 0)
      throw new Error(`Saldo insuficiente de ${before.name}.`);
    const cost = input.unitCostCents;
    const nextQuantity = before.quantity + delta;
    const nextCost =
      input.type === "purchase" && cost !== undefined && nextQuantity > 0
        ? (before.quantity * before.averageCostCents + delta * cost) /
          nextQuantity
        : before.averageCostCents;
    await client.query(
      "UPDATE inventory_items SET quantity = $2, average_cost_cents = $3,cost_known=$4, updated_at = now() WHERE id = $1",
      [
        before.id,
        nextQuantity,
        nextCost,
        input.type === "purchase"
          ? input.unitCostCents !== undefined &&
            (Boolean(item.rows[0].cost_known) || before.quantity === 0)
          : Boolean(item.rows[0].cost_known),
      ],
    );
    await client.query(
      "INSERT INTO inventory_movements (restaurant_id, inventory_item_id, type, quantity_delta, unit_cost_cents, note) VALUES ($1,$2,$3,$4,$5,$6)",
      [
        current.id,
        before.id,
        input.type,
        delta,
        cost ?? null,
        input.note?.trim() || null,
      ],
    );
    return { id: before.id, quantity: nextQuantity };
  });
}

export async function replaceVariantRecipe(input: {
  variantId: string;
  components: Array<{ itemId: string; quantity: number }>;
}) {
  if (
    input.components.some(
      (component) =>
        !Number.isFinite(component.quantity) || component.quantity <= 0,
    )
  )
    throw new Error("Informe quantidades válidas para a ficha técnica.");
  if (
    new Set(input.components.map((component) => component.itemId)).size !==
    input.components.length
  )
    throw new Error("Não repita um material na ficha técnica.");
  return transaction(async (client) => {
    const current = await restaurant(client);
    await client.query(
      "SELECT restaurant_id FROM inventory_settings WHERE restaurant_id=$1 FOR UPDATE",
      [current.id],
    );
    const variant = await client.query<{ id: string }>(
      "SELECT v.id FROM menu_variants v JOIN menu_products p ON p.id = v.product_id WHERE v.id = $1 AND p.restaurant_id = $2",
      [input.variantId, current.id],
    );
    if (!variant.rows[0])
      throw new Error("Variação de produto não encontrada.");
    if (input.components.length) {
      const materials = await client.query<{ id: string }>(
        "SELECT id FROM inventory_items WHERE restaurant_id = $1 AND active AND id = ANY($2::uuid[])",
        [current.id, input.components.map((component) => component.itemId)],
      );
      if (materials.rows.length !== input.components.length)
        throw new Error("Um dos materiais não está disponível.");
    }
    await client.query(
      "UPDATE menu_variants SET recipe_cost_complete=false WHERE id=$1",
      [input.variantId],
    );
    await client.query(
      "DELETE FROM product_recipe_components WHERE variant_id = $1",
      [input.variantId],
    );
    for (const component of input.components)
      await client.query(
        "INSERT INTO product_recipe_components (variant_id, inventory_item_id, quantity) VALUES ($1,$2,$3)",
        [input.variantId, component.itemId, component.quantity],
      );
    return { variantId: input.variantId, components: input.components };
  });
}

function staffMember(row: StaffMemberRow): StaffMember {
  return {
    id: row.id,
    name: row.name,
    role: row.role,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listStaffMembers(
  activeOnly = false,
): Promise<StaffMember[]> {
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
  if (
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  )
    return null;
  return staffMember(member);
}

export async function createStaffMember(input: {
  name: string;
  role: StaffMemberRole;
  pin: string;
}) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80)
    throw new Error("Informe um nome entre 2 e 80 caracteres.");
  if (!validPin(input.pin))
    throw new Error("O PIN precisa ter de 4 a 6 números.");
  const current = await restaurant();
  const salt = randomBytes(16).toString("hex");
  const result = await query<StaffMemberRow>(
    "INSERT INTO staff_members (restaurant_id, name, role, pin_salt, pin_hash) VALUES ($1,$2,$3,$4,$5) RETURNING id, name, role, pin_salt, pin_hash, active, created_at, updated_at",
    [current.id, name, input.role, salt, hashPin(input.pin, salt)],
  );
  return staffMember(result.rows[0]);
}

export async function updateStaffMember(
  id: string,
  input: {
    name?: string;
    role?: StaffMemberRole;
    pin?: string;
    active?: boolean;
  },
) {
  const current = await restaurant();
  const existing = await query<StaffMemberRow>(
    "SELECT id, name, role, pin_salt, pin_hash, active, created_at, updated_at FROM staff_members WHERE id = $1 AND restaurant_id = $2",
    [id, current.id],
  );
  if (!existing.rows[0]) throw new Error("Membro da equipe não encontrado.");
  const name =
    input.name === undefined
      ? existing.rows[0].name
      : input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2 || name.length > 80)
    throw new Error("Informe um nome entre 2 e 80 caracteres.");
  if (input.pin !== undefined && !validPin(input.pin))
    throw new Error("O PIN precisa ter de 4 a 6 números.");
  const salt =
    input.pin === undefined
      ? existing.rows[0].pin_salt
      : randomBytes(16).toString("hex");
  const hash =
    input.pin === undefined
      ? existing.rows[0].pin_hash
      : hashPin(input.pin, salt);
  const result = await query<StaffMemberRow>(
    "UPDATE staff_members SET name = $3, role = $4, pin_salt = $5, pin_hash = $6, active = $7, updated_at = now() WHERE id = $1 AND restaurant_id = $2 RETURNING id, name, role, pin_salt, pin_hash, active, created_at, updated_at",
    [
      id,
      current.id,
      name,
      input.role ?? existing.rows[0].role,
      salt,
      hash,
      input.active ?? existing.rows[0].active,
    ],
  );
  return staffMember(result.rows[0]);
}
