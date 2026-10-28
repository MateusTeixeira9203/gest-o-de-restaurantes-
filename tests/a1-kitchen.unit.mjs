import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const mock = 'data:text/javascript,' + encodeURIComponent(`
  export const useRestaurant = () => ({kitchen: [], ready: true, refresh: async () => true, updateKitchenTicket: async () => ({ok:true})});
  export const toast = {success() {}};
  export default 'a';
`);
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (['next/link', 'sonner', '@/lib/restaurant-store'].includes(specifier)) return {url: mock, shortCircuit: true};
    if (specifier === '@/lib/domain') return {url: new URL('../lib/domain.ts', import.meta.url).href, shortCircuit: true};
    if (['@/components/shared/estados', '@/components/shared/selos'].includes(specifier)) return {url: new URL(`../${specifier.slice(2)}.tsx`, import.meta.url).href, shortCircuit: true};
    if (specifier === './selos-dados' && context.parentURL?.endsWith('/components/shared/selos.tsx')) return {url: new URL('../components/shared/selos-dados.ts', import.meta.url).href, shortCircuit: true};
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url.endsWith('/components/kitchen-board.tsx') || /\/components\/shared\/(estados|selos)\.tsx$/.test(url)) {
      const source = readFileSync(new URL(url), 'utf8') + (url.endsWith('/components/kitchen-board.tsx') ? '\nexport {ticketTime, TicketCard, channelTickets};' : '');
      return {format: 'module', source: ts.transpileModule(source, {compilerOptions: {jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText, shortCircuit: true};
    }
    return next(url, context);
  },
});
const {ticketTime, TicketCard, KitchenBoard, channelTickets} = await import('../components/kitchen-board.tsx');
hook.deregister();
const confirmed = Date.parse('2026-10-28T12:00:00Z');
const ticket = {id:'synthetic-ticket', orderId:'synthetic-order', orderNumber:42, queueNumber:1, sector:'Cozinha', status:'new', fulfillment:'delivery', tableNumber:null, customerName:'Pessoa sintética', estimatedMinutes:10, confirmedAt:new Date(confirmed).toISOString(), createdAt:'2026-10-28T10:00:00Z', notes:null, items:[{productName:'Prato sintético',variantName:'Padrão',quantity:2,addons:[],note:'Sem sal'}]};
const at = minutes => confirmed + minutes * 60000;

test('tempo usa confirmação, limites estritos de estimativa e atualiza em 30 s', () => {
  assert.deepEqual(ticketTime(ticket, at(10)), {minutes:10, level:0});
  assert.deepEqual(ticketTime(ticket, at(10.5)), {minutes:10, level:1});
  assert.equal(ticketTime(ticket, at(15)).level, 1);
  assert.equal(ticketTime(ticket, at(15.5)).level, 2);
});
test('sem estimativa fica vermelho só acima de 20 min; nulo nunca usa criação', () => {
  assert.equal(ticketTime({...ticket, estimatedMinutes:null}, at(20)).level, 0);
  assert.equal(ticketTime({...ticket, estimatedMinutes:null}, at(20.5)).level, 2);
  assert.deepEqual(ticketTime({...ticket, confirmedAt:null}, at(90)), {minutes:null, level:0});
  assert.equal(ticketTime({...ticket, confirmedAt:'invalid'}, at(90)).minutes, null);
  assert.equal(ticketTime(ticket, at(-1)).minutes, 0);
  assert.equal(ticketTime({...ticket, status:'ready'}, at(90)).level, 0);
});
test('cartões dos três canais têm código, texto, ação principal e atalho secundário de atraso', () => {
  for (const [fulfillment, code, label] of [['delivery','E-42','Entrega'],['pickup','B-42','Balcão'],['dine_in','Mesa 04 · #42','Mesa']]) {
    const html = renderToStaticMarkup(React.createElement(TicketCard, {ticket:{...ticket, fulfillment, tableNumber:4},now:at(16),busy:null,advance:async()=>{}}));
    assert.ok(html.includes(code)); assert.ok(html.includes(label));
    assert.ok(html.includes('Muito atrasado')); assert.match(html, /2<svg(?=[^>]*\blucide-x\b)(?=[^>]*aria-label="vezes")[^>]*>.*?<\/svg> Prato sintético/s);
    assert.equal((html.match(/<button/g)||[]).length, 2);
    assert.ok(html.includes('Começar preparo'));
  }
});
test('pronto orienta o destino por canal e não oferece nova transição', () => {
  for (const [fulfillment, text] of [['delivery','entregador'],['pickup','balcão'],['dine_in','garçom']]) {
    const html = renderToStaticMarkup(React.createElement(TicketCard,{ticket:{...ticket,fulfillment,status:'ready'},now:at(16),busy:null,advance:async()=>{}}));
    assert.ok(html.includes(text)); assert.ok(!html.includes('<button'));
  }
});
test('estado inicial mostra carregamento e filtros acessíveis', () => {
  const html = renderToStaticMarkup(React.createElement(KitchenBoard));
  assert.ok(html.includes('Atualizando fila da cozinha'));
  assert.ok(html.includes('Filtrar por canal')); assert.ok(html.includes('Filtrar por setor'));
  assert.ok(!html.includes('Nenhum pedido nesta etapa'));
});

test('filtro preserva canal, atrasados vêm antes e empate segue fila sem mutação', () => {
  const tickets = [{...ticket, id:'recent', queueNumber:1, confirmedAt:new Date(at(12)).toISOString()}, {...ticket, id:'late', queueNumber:2}, {...ticket, id:'pickup', queueNumber:3, fulfillment:'pickup'}];
  assert.deepEqual(channelTickets(tickets, 'all', at(16)).map(item => item.id), ['late','pickup','recent']);
  assert.deepEqual(channelTickets(tickets, 'pickup', at(16)).map(item => item.id), ['pickup']);
  assert.equal(tickets[0].id, 'recent');
});

test('ação principal mantém os destinos preparing/ready e bloqueia enquanto salva', async () => {
  function buttonIn(node) {
    if (!React.isValidElement(node)) return null;
    if (node.type === 'button') return node;
    for (const child of React.Children.toArray(node.props.children)) {
      const found = buttonIn(child);
      if (found) return found;
    }
    return null;
  }
  const calls = [];
  const advance = async (...args) => calls.push(args);
  for (const [status, target] of [['new','preparing'],['preparing','ready']]) {
    const button = buttonIn(TicketCard({ticket:{...ticket,status},now:at(16),busy:null,advance}));
    button.props.onClick();
    assert.deepEqual(calls.at(-1), [ticket.id, target]);
  }
  const button = buttonIn(TicketCard({ticket,now:at(16),busy:ticket.id,advance}));
  assert.equal(button.props.disabled, true);
  assert.equal(button.props.children, 'Salvando…');
});

 test('atalho secundário vai de new direto para ready; colunas móveis não têm altura mínima', () => {
  const calls = [];
  function buttons(node) {
    if (!React.isValidElement(node)) return [];
    return node.type === 'button' ? [node] : React.Children.toArray(node.props.children).flatMap(buttons);
  }
  const props = {ticket, now:at(16), busy:null, advance:(...args) => calls.push(args)};
  const actions = buttons(TicketCard(props));
  assert.equal(actions.length, 2);
  assert.equal(actions[1].props.children, 'Já está pronto');
  assert.ok(actions[1].props.className.includes('secondary-button'));
  actions[0].props.onClick(); actions[1].props.onClick();
  assert.deepEqual(calls, [[ticket.id, 'preparing'], [ticket.id, 'ready']]);
  assert.ok(buttons(TicketCard({...props, busy:ticket.id})).every(button => button.props.disabled));
  assert.equal(buttons(TicketCard({...props, ticket:{...ticket,status:'preparing'}})).length, 1);
  const css = readFileSync(new URL('../app/styles/cozinha.css', import.meta.url), 'utf8');
  assert.match(css, /@media\(max-width:900px\).*\.kitchen-page \.kanban-column\{min-height:0\}/s);
  assert.ok(renderToStaticMarkup(React.createElement(TicketCard, props)).includes('<h3>'));
  for (const file of ['../components/kitchen-board.tsx','../app/styles/cozinha.css','../tests/a1-kitchen.unit.mjs']) {
    assert.ok(!readFileSync(new URL(file, import.meta.url), 'utf8').includes('\uFEFF'));
  }
});
