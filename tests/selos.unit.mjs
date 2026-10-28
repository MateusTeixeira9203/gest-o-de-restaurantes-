import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
function load(file, mocks = {}) {
  const source = readFileSync(new URL("../" + file, import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const loaded = { exports: {} };
  const resolve = name => Object.hasOwn(mocks, name) ? mocks[name] : require(name);
  new Function("require", "module", "exports", code)(resolve, loaded, loaded.exports);
  return loaded.exports;
}
const { Carregando, Vazio, ErroLeitura } = load("components/shared/estados.tsx");
const render = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));
for (const formato of ["cartoes", "lista", "painel"]) {
  const html = render(Carregando, { formato });
  assert(html.includes('role="status"'));
  assert(html.includes('aria-busy="true"'));
  assert.equal((html.match(/class="esqueleto-cartao"/g) || []).length, 3);
  assert(!html.includes("R$"));
}
const empty = render(Vazio, { titulo: "Nenhum pedido", descricao: "Os novos pedidos aparecem aqui.", acao: React.createElement("button", null, "Atualizar") });
assert(empty.includes("Nenhum pedido") && empty.includes("Os novos pedidos aparecem aqui.") && empty.includes("Atualizar"));
const props = { mensagem: "Não foi possível carregar os pedidos.", aoTentarNovamente() {} };
const error = render(ErroLeitura, props);
assert(error.includes('role="alert"') && error.includes("Tentar de novo"));
assert(!error.includes("Nada foi perdido"));
assert(render(ErroLeitura, { ...props, semPerda: true }).includes("Nada foi perdido."));
assert(render(ErroLeitura, { ...props, tentando: true }).includes('disabled=""'));
assert(render(ErroLeitura, { ...props, tentando: true }).includes("Tentando…"));
let retried = false;
const tree = ErroLeitura({ ...props, aoTentarNovamente() { retried = true; } });
const button = tree.props.children[1].props.children.find(child => child?.type === "button");
button.props.onClick();
assert(retried);
console.log("OK carregando sem valores falsos, vazio com próxima ação, erro sem promessa indevida e retry acionável/desabilitado");
const css = readFileSync(new URL("../app/styles/base.css", import.meta.url), "utf8");
assert(css.includes("prefers-reduced-motion: reduce") && css.includes("animation: none"));
for (const [token, value] of Object.entries({ ok: "#1F7A4D", warn: "#8A5300", danger: "#B42318", info: "#1D5FA8", bill: "#5E3A93", "radius-card": "14px", "radius-control": "10px", "radius-chip": "8px" }))
  assert(css.includes(`--${token}: ${value};`));
assert(css.includes("min-height: 44px"));
assert(css.split("\n").filter(line => /#[0-9a-f]{6}/i.test(line)).every(line => /^\s*--/.test(line)));
function luminance(token) {
  const hex = css.match(new RegExp(`--${token}:\\s*#([0-9a-f]{6})`, "i"))[1];
  const channels = hex.match(/../g).map(value => parseInt(value, 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
for (const [foreground, background] of [
  ...["ok", "warn", "danger", "info", "bill"].map(token => [token, `${token}-soft`]),
  ...["mesa", "balcao", "entrega"].map(channel => ["canal-texto", `canal-${channel}`]),
]) {
  const values = [luminance(foreground), luminance(background)].sort((a, b) => a - b);
  assert((values[1] + 0.05) / (values[0] + 0.05) >= 4.5, `Contraste insuficiente: ${foreground}`);
}
console.log("OK tokens e raios do plano, mínimo 44px declarado, hex só em tokens e movimento reduzido; sem banco/rede/env");
console.log("OK contraste calculado >= 4,5:1 nos cinco estados e nos três canais");

const domain = load("lib/domain.ts");
const dados = load("components/shared/selos-dados.ts", { "@/lib/domain": domain });
const { SeloCanal, SeloEstado } = load("components/shared/selos.tsx", { "./selos-dados": dados });


for (const [fulfillment, orderNumber, tableNumber, expected, channel] of [
  ["delivery", 12, null, "E-12", "Entrega"],
  ["pickup", 7, null, "B-7", "Balcão"],
  ["dine_in", 51, 4, "Mesa 04 · #51", "Mesa"],
  ["dine_in", 52, 199, "Mesa 199 · #52", "Mesa"],
  ["dine_in", 53, null, "Mesa ? · #53", "Mesa"],
]) {
  const html = render(SeloCanal, { pedido: { fulfillment, orderNumber, tableNumber } });
  assert(html.includes(expected));
  assert(html.includes(channel));
  assert(html.includes("selo-canal-"));
  assert.equal(dados.dadosCanal({ fulfillment, orderNumber, tableNumber }).codigo, expected);
}
for (const tom of ["ok", "warn", "danger", "info", "neutral", "bill"]) {
  const html = render(SeloEstado, { tom, texto: "Estado sintético" });
  assert(html.includes(`selo-estado-${tom}`));
  assert(html.includes("Estado sintético"));
  assert(html.includes('aria-hidden="true"'));
  assert(dados.dadosEstado(tom).rotulo.length > 0);
}
console.log("OK SeloCanal com orderCode real: E-12, B-7, Mesa 04 e Mesa 199; estados com ponto e texto");
const blocos = load("components/shared/blocos.tsx", {
  "next/image": { __esModule: true, default: () => null },
  "next/link": { __esModule: true, default: ({ children, href }) => React.createElement("a", { href }, children) },
  "@/lib/restaurant-store": { useRestaurant: () => ({ state: { settings: { name: "Cantina Sintética" } }, branding: { logoUrl: null } }) },
});
for (const [status, label] of Object.entries({ available: "Livre", occupied: "Ocupada", preparing: "Preparando", ready: "Pedido pronto", closing: "Aguardando conta" })) {
  const html = render(blocos.StatusPill, { status });
  assert(html.includes(label) && html.includes("selo-estado-"));
}
for (const [status, label] of Object.entries({ pending: "Pendente", confirmed: "Na fila", preparing: "Em preparo", ready: "Pronto para entregar", out_for_delivery: "Em entrega", delivered: "Entregue", completed: "Concluído", cancelled: "Cancelado" })) {
  const html = render(blocos.OrderPill, { status });
  assert(html.includes(label) && html.includes("selo-estado-"));
}
assert(render(blocos.Brand, {}).includes("var(--core-ink)"));
assert(render(blocos.NotFound, {}).includes("Voltar à operação"));
console.log("OK StatusPill/OrderPill mantêm todos os rótulos; Brand usa token e NotFound mantém saída");
