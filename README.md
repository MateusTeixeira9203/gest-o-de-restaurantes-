# Restaurante — Operação & Gestão

Aplicação operacional para restaurante, construída em Next.js, TypeScript e Tailwind CSS. O fluxo funciona de ponta a ponta: pedido, cozinha, caixa, fechamento de mesa, estoque e gestão.

## Executar localmente

Requer Node.js 22.13 ou superior.

```bash
pnpm install
pnpm dev
```

Abra `http://localhost:3000`.

## Publicar na Vercel

1. Importe este repositório no painel da Vercel.
2. Mantenha o framework detectado como **Next.js**.
3. Use os comandos padrão: `pnpm run build` e `pnpm start`.
4. Faça o deploy.

O script de build usa `next build --webpack`, já validado para o projeto. As rotas são atendidas pelo App Router e os links usam navegação nativa para funcionarem mesmo antes da hidratação do cliente.

## Rotas

- `/operacao` — escolha de área
- `/operacao/garcom` e `/operacao/garcom/mesa/[id]` — mesas, comandas e pedidos
- `/operacao/cozinha` — produção por etapas e setor
- `/operacao/caixa` — contas e pagamentos
- `/menu` e `/menu/mesa/[id]` — cardápio público, QR e WhatsApp
- `/gestao` — login administrativo
- `/gestao/dashboard`, `/gestao/mesas`, `/gestao/pedidos`, `/gestao/cardapio`, `/gestao/estoque`, `/gestao/caixa`, `/gestao/relatorios`, `/gestao/configuracoes`

Credenciais de demonstração: `admin` / `admin123`.

## Persistência atual

Os dados são guardados no `localStorage` do navegador e sincronizados entre abas do mesmo navegador com `BroadcastChannel`. Isso permite uma demonstração operacional completa sem serviços externos, inclusive após recarregar a página no mesmo dispositivo.

Para uso compartilhado entre dispositivos, conecte a camada em `lib/restaurant-store.tsx` a um banco de dados (por exemplo, Supabase/Postgres) e configure as variáveis de ambiente na Vercel. Os tipos de domínio e as regras de estoque já estão separados em `lib/` para essa evolução.

## Verificações

```bash
pnpm exec tsc --noEmit
pnpm run lint
pnpm run build
```
