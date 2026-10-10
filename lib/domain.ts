export type OrderStatus = "pending" | "confirmed" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "completed" | "cancelled";
export type TableStatus = "available" | "occupied" | "preparing" | "ready" | "closing";
export type ProductionSector = "Pizzaria" | "Cozinha" | "Sobremesas";
export type PaymentMethod = "Pix" | "Dinheiro" | "Débito" | "Crédito";

export interface ProductVariant { id: string; name: string; price: number; stockAvailable?: boolean }
export interface ProductAddon { id: string; name: string; price: number }
export interface RecipeComponent { stockId: string; quantity: number }
export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  sector: ProductionSector;
  variants: ProductVariant[];
  addons: ProductAddon[];
  recipe: Record<string, RecipeComponent[]>;
  available: boolean;
  featured?: boolean;
  imageUrl?: string | null;
}

export interface Table { id: string; number: number; label: string; status: TableStatus; active: boolean; openedAt?: string }
export interface OrderItemAddon { id: string; name: string; price: number }
export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  sector: ProductionSector;
  quantity: number;
  unitPrice: number;
  addons: OrderItemAddon[];
  note?: string;
}
export interface Order {
  revision: number;
  subtotalCents?: number;
  serviceCents?: number;
  totalCents?: number;
  paidCents?: number;
  servedAt?: string | null;
  id: string;
  number: number;
  tableId: string;
  status: OrderStatus;
  source: "waiter" | "qr";
  fulfillment?: "dine_in" | "pickup" | "delivery";
  customerName?: string;
  delivery?: { addressLine1: string; neighborhood?: string; reference?: string };
  paid?: boolean;
  createdAt: string;
  items: OrderItem[];
  stockApplied: boolean;
}
export interface StockItem { id: string; name: string; category: string; quantity: number; unit: "un" | "g" | "kg" | "ml" | "L"; minimum: number; cost?: number }
export interface StockMovement { id: string; stockId: string; type: "Entrada" | "Venda" | "Ajuste" | "Perda" | "Estorno"; quantity: number; createdAt: string; reference: string }
export interface Payment { id: string; method: PaymentMethod; amount: number }
export interface Sale { id: string; tableId: string; orderIds: string[]; subtotal: number; service: number; total: number; payments: Payment[]; createdAt: string }
export interface RestaurantSettings { name: string; whatsapp: string; serviceRate: number; tableCount: number }
export interface RestaurantState {
  settings: RestaurantSettings;
  tables: Table[];
  products: Product[];
  orders: Order[];
  stock: StockItem[];
  movements: StockMovement[];
  sales: Sale[];
  nextOrderNumber: number;
}

export interface CartItem {
  key: string;
  productId: string;
  variantId: string;
  quantity: number;
  addonIds: string[];
  note?: string;
}

export const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const orderTotal = (order: Order) => order.items.reduce((sum, item) => sum + item.quantity * (item.unitPrice + item.addons.reduce((a, b) => a + b.price, 0)), 0);
export const tableTotal = (state: RestaurantState, tableId: string) => state.orders.filter(o => o.tableId === tableId && !["cancelled", "completed"].includes(o.status)).reduce((sum, order) => sum + Math.max(0, (order.totalCents ?? Math.round(orderTotal(order) * 100)) - (order.paidCents ?? 0)) / 100, 0);
