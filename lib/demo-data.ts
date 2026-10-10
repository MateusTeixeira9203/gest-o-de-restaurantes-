import type { Order, Product, RestaurantState, StockItem, Table } from "./domain";

const DEMO_NOW = new Date("2026-09-27T20:55:00-03:00").getTime();

const v = (id: string, name: string, price: number) => ({ id, name, price });
const pizzaAddons = [{ id: "borda", name: "Borda Catupiry", price: 8 }, { id: "bacon", name: "Bacon", price: 7 }, { id: "queijo", name: "Queijo extra", price: 6 }];
const acaiAddons = [{ id: "granola", name: "Granola", price: 3 }, { id: "leite-po", name: "Leite em pó", price: 3 }, { id: "pacoca", name: "Paçoca", price: 3 }, { id: "banana", name: "Banana", price: 3 }, { id: "morango", name: "Morango", price: 4 }, { id: "leite-cond", name: "Leite condensado", price: 3 }];
const pizzaRecipe = (topping: string) => ({ p: [{ stockId: "massa-p", quantity: 1 }, { stockId: "mucarela", quantity: .15 }, { stockId: topping, quantity: .1 }], m: [{ stockId: "massa-m", quantity: 1 }, { stockId: "mucarela", quantity: .2 }, { stockId: topping, quantity: .12 }], g: [{ stockId: "massa-g", quantity: 1 }, { stockId: "mucarela", quantity: .25 }, { stockId: topping, quantity: .15 }, { stockId: "caixa-g", quantity: 1 }] });

export const products: Product[] = [
  { id: "pizza-calabresa", name: "Pizza Calabresa", description: "Muçarela, calabresa artesanal, cebola roxa e orégano.", category: "Pizzas", sector: "Pizzaria", variants: [v("p", "Pequena", 39), v("m", "Média", 49), v("g", "Grande", 59)], addons: pizzaAddons, recipe: pizzaRecipe("calabresa"), available: true, featured: true },
  { id: "pizza-frango", name: "Frango com Catupiry", description: "Frango desfiado, catupiry cremoso e muçarela.", category: "Pizzas", sector: "Pizzaria", variants: [v("p", "Pequena", 42), v("m", "Média", 52), v("g", "Grande", 62)], addons: pizzaAddons, recipe: pizzaRecipe("frango"), available: true },
  { id: "pizza-portuguesa", name: "Pizza Portuguesa", description: "Presunto, ovos, cebola, azeitona e muçarela.", category: "Pizzas", sector: "Pizzaria", variants: [v("p", "Pequena", 43), v("m", "Média", 53), v("g", "Grande", 63)], addons: pizzaAddons, recipe: pizzaRecipe("presunto"), available: true },
  { id: "pizza-marguerita", name: "Pizza Marguerita", description: "Tomate, manjericão fresco e muçarela.", category: "Pizzas", sector: "Pizzaria", variants: [v("p", "Pequena", 39), v("m", "Média", 49), v("g", "Grande", 59)], addons: pizzaAddons, recipe: pizzaRecipe("tomate"), available: true },
  ...["Carne", "Queijo", "Frango", "Pizza"].map((name, i): Product => ({ id: `pastel-${name.toLowerCase()}`, name: `Pastel de ${name}`, description: "Massa crocante e recheio generoso.", category: "Pastéis", sector: "Cozinha", variants: [v("un", "Unidade", 12 + (i === 0 ? 2 : 0))], addons: [], recipe: { un: [{ stockId: "massa-pastel", quantity: 1 }, { stockId: i === 0 ? "carne" : i === 1 ? "mucarela" : "frango", quantity: .1 }] }, available: true })),
  ...["Bolonhesa", "Frango", "Lasanha"].map((name, i): Product => ({ id: `massa-${name.toLowerCase()}`, name: name === "Lasanha" ? "Lasanha da casa" : `Massa ${name}`, description: "Molho artesanal e finalização com parmesão.", category: "Massas", sector: "Cozinha", variants: [v("prato", "Prato", 32 + i * 3)], addons: [], recipe: { prato: [{ stockId: "massa-fresca", quantity: .25 }, { stockId: i === 0 ? "carne" : "frango", quantity: .12 }] }, available: true })),
  { id: "acai", name: "Açaí cremoso", description: "Açaí batido, gelado e montado na hora.", category: "Açaí", sector: "Sobremesas", variants: [v("300", "300 ml", 16), v("500", "500 ml", 22), v("700", "700 ml", 28)], addons: acaiAddons, recipe: { "300": [{ stockId: "acai", quantity: .3 }, { stockId: "copo-300", quantity: 1 }], "500": [{ stockId: "acai", quantity: .5 }, { stockId: "copo-500", quantity: 1 }, { stockId: "tampa", quantity: 1 }], "700": [{ stockId: "acai", quantity: .7 }, { stockId: "copo-700", quantity: 1 }, { stockId: "tampa", quantity: 1 }] }, available: true, featured: true },
  { id: "sorvete", name: "Sorvete artesanal", description: "Escolha a quantidade de bolas.", category: "Sorvetes", sector: "Sobremesas", variants: [v("1", "1 bola", 8), v("2", "2 bolas", 14), v("3", "3 bolas", 19)], addons: [], recipe: { "1": [{ stockId: "sorvete", quantity: .08 }], "2": [{ stockId: "sorvete", quantity: .16 }], "3": [{ stockId: "sorvete", quantity: .24 }] }, available: true },
  { id: "coca-lata", name: "Coca-Cola lata", description: "350 ml, gelada.", category: "Bebidas", sector: "Cozinha", variants: [v("un", "Unidade", 7)], addons: [], recipe: { un: [{ stockId: "coca-lata", quantity: 1 }] }, available: true },
  { id: "coca-2l", name: "Coca-Cola 2L", description: "Garrafa 2 litros, gelada.", category: "Bebidas", sector: "Cozinha", variants: [v("un", "Unidade", 14)], addons: [], recipe: { un: [{ stockId: "coca-2l", quantity: 1 }] }, available: true, featured: true },
  { id: "guarana", name: "Guaraná", description: "Lata 350 ml.", category: "Bebidas", sector: "Cozinha", variants: [v("un", "Unidade", 6)], addons: [], recipe: { un: [{ stockId: "guarana", quantity: 1 }] }, available: true },
  { id: "agua", name: "Água mineral", description: "500 ml.", category: "Bebidas", sector: "Cozinha", variants: [v("un", "Unidade", 4)], addons: [], recipe: { un: [{ stockId: "agua", quantity: 1 }] }, available: true },
  { id: "suco", name: "Suco natural", description: "Laranja, abacaxi ou limão.", category: "Bebidas", sector: "Cozinha", variants: [v("copo", "Copo 400 ml", 12)], addons: [], recipe: { copo: [{ stockId: "polpa", quantity: .2 }] }, available: true },
];

export const stock: StockItem[] = [
  ["massa-p", "Massa de Pizza P", "Produção", 30, "un", 8, 2.2], ["massa-m", "Massa de Pizza M", "Produção", 28, "un", 8, 2.8], ["massa-g", "Massa de Pizza G", "Produção", 34, "un", 10, 3.4], ["mucarela", "Muçarela", "Frios", 8.4, "kg", 2, 37], ["calabresa", "Calabresa", "Frios", 1.2, "kg", 1.5, 29], ["frango", "Frango desfiado", "Frios", 5.8, "kg", 1.5, 22], ["presunto", "Presunto", "Frios", 4.2, "kg", 1, 31], ["tomate", "Tomate", "Hortifruti", 6.5, "kg", 1.5, 8], ["caixa-g", "Caixa Pizza G", "Embalagens", 42, "un", 15, 1.6], ["massa-pastel", "Massa de Pastel", "Produção", 54, "un", 15, .9], ["carne", "Carne moída", "Frios", 4.6, "kg", 1.2, 34], ["massa-fresca", "Massa fresca", "Produção", 7.5, "kg", 2, 18], ["acai", "Açaí", "Sobremesas", 12, "L", 3, 28], ["copo-300", "Copo 300ml", "Embalagens", 35, "un", 10, .5], ["copo-500", "Copo 500ml", "Embalagens", 26, "un", 10, .65], ["copo-700", "Copo 700ml", "Embalagens", 18, "un", 8, .8], ["tampa", "Tampa para copo", "Embalagens", 28, "un", 10, .25], ["sorvete", "Sorvete", "Sobremesas", 8, "kg", 2, 25], ["coca-lata", "Coca-Cola lata", "Bebidas", 24, "un", 8, 3.8], ["coca-2l", "Coca-Cola 2L", "Bebidas", 9, "un", 4, 8.5], ["guarana", "Guaraná lata", "Bebidas", 14, "un", 6, 3.2], ["agua", "Água mineral", "Bebidas", 30, "un", 10, 1.4], ["polpa", "Polpa de frutas", "Bebidas", 5, "kg", 1.5, 19],
].map(([id, name, category, quantity, unit, minimum, cost]) => ({ id, name, category, quantity, unit, minimum, cost })) as StockItem[];

const status: Table["status"][] = ["available", "occupied", "preparing", "ready", "closing", "available", "occupied", "occupied", "preparing", "available", "ready", "available", "occupied", "available", "available"];
export const tables: Table[] = status.map((s, i) => ({ id: String(i + 1).padStart(2, "0"), number: i + 1, label: `Mesa ${String(i + 1).padStart(2, "0")}`, status: s, active: true, openedAt: s === "available" ? undefined : new Date(DEMO_NOW - (18 + i) * 60000).toISOString() }));

const orderItem = (productId: string, variantId: string, quantity: number, note?: string) => {
  const p = products.find(x => x.id === productId)!; const variant = p.variants.find(x => x.id === variantId)!;
  return { id: `demo-${productId}-${variantId}-${quantity}-${note ?? ""}`, productId, productName: p.name, variantId, variantName: variant.name, sector: p.sector, quantity, unitPrice: variant.price, addons: [], note };
};
const demoOrders: Order[] = [
  { id: "o181", number: 181, tableId: "02", status: "delivered", source: "waiter", createdAt: new Date(DEMO_NOW - 35 * 60000).toISOString(), items: [orderItem("pizza-frango", "g", 1), orderItem("coca-2l", "un", 1)], revision: 1, stockApplied: true },
  { id: "o182", number: 182, tableId: "03", status: "preparing", source: "qr", createdAt: new Date(DEMO_NOW - 12 * 60000).toISOString(), items: [orderItem("pizza-portuguesa", "m", 1, "Sem azeitona"), orderItem("pastel-carne", "un", 2)], revision: 1, stockApplied: true },
  { id: "o183", number: 183, tableId: "04", status: "ready", source: "waiter", createdAt: new Date(DEMO_NOW - 8 * 60000).toISOString(), items: [orderItem("pizza-calabresa", "g", 1, "Sem cebola")], revision: 1, stockApplied: true },
  { id: "o184", number: 184, tableId: "08", status: "delivered", source: "waiter", createdAt: new Date(DEMO_NOW - 28 * 60000).toISOString(), items: [orderItem("pastel-carne", "un", 2)], revision: 1, stockApplied: true },
  { id: "o180", number: 180, tableId: "05", status: "delivered", source: "waiter", createdAt: new Date(DEMO_NOW - 48 * 60000).toISOString(), items: [orderItem("pizza-marguerita", "m", 1), orderItem("suco", "copo", 2)], revision: 1, stockApplied: true },
];

export const createDemoState = (): RestaurantState => ({
  settings: { name: "Comanda Inteligente", whatsapp: "", serviceRate: 10, tableCount: 15 },
  tables,
  products,
  orders: demoOrders,
  stock,
  movements: [{ id: "m1", stockId: "calabresa", type: "Venda", quantity: -.15, createdAt: new Date(DEMO_NOW - 8 * 60000).toISOString(), reference: "Pedido #183" }, { id: "m2", stockId: "mucarela", type: "Venda", quantity: -.25, createdAt: new Date(DEMO_NOW - 8 * 60000).toISOString(), reference: "Pedido #183" }],
  sales: [{ id: "s1", tableId: "06", orderIds: ["old"], subtotal: 142, service: 14.2, total: 156.2, payments: [{ id: "p1", method: "Pix", amount: 156.2 }], createdAt: new Date(DEMO_NOW - 75 * 60000).toISOString() }],
  nextOrderNumber: 185,
});
