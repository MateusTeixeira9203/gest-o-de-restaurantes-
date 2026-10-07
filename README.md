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
4. Cadastre estas variáveis de ambiente na Vercel:

   - `DATABASE_URL` — conexão do projeto Neon do restaurante.
   - `RESTAURANT_SESSION_SECRET` — segredo aleatório longo para assinar a sessão da equipe.
   - `RESTAURANT_ADMIN_USER` — usuário administrativo inicial.
   - `RESTAURANT_ADMIN_PASSWORD` — senha administrativa inicial.
   - `RESTAURANT_INTERNAL_API_KEY` — chave para integrações internas de cozinha, se usadas fora da interface.
5. Aplique, em ordem, as migrações em `drizzle/` no banco Neon antes de publicar uma versão que as utilize. A migração `0004_product_images.sql` acrescenta somente a tabela de fotos dos produtos.
6. Faça o deploy.

O script de build usa `next build --webpack`. As rotas são atendidas pelo App Router e usam navegação com `next/link`.

## Rotas

- `/operacao` — escolha de área
- `/operacao/garcom` e `/operacao/garcom/mesa/[id]` — mesas, comandas e pedidos
- `/operacao/cozinha` — produção por etapas e setor
- `/operacao/caixa` — contas e pagamentos
- `/menu` e `/menu/mesa/[id]` — cardápio público para retirada, entrega ou QR na mesa
- `/gestao` — login administrativo
- `/gestao/dashboard`, `/gestao/mesas`, `/gestao/pedidos`, `/gestao/cardapio`, `/gestao/estoque`, `/gestao/caixa`, `/gestao/equipe`, `/gestao/relatorios`, `/gestao/configuracoes`

No ambiente local de teste, as credenciais são `admin` / `admin123`. Em produção, use as variáveis de ambiente acima e troque a senha antes do primeiro uso.

## Persistência e operação

Pedidos, filas de cozinha, mesas, pagamentos, disponibilidade do cardápio e configurações do restaurante usam o PostgreSQL no Neon. Cada tela operacional consulta a mesma fonte e atualiza automaticamente a cada poucos segundos; por isso garçom, cozinha e caixa podem trabalhar em dispositivos diferentes após entrar com a conta da equipe.

O cardápio público não recebe credenciais internas. O caixa pode copiar ou compartilhar `/menu` pelo WhatsApp; o WhatsApp só transporta o link, e os pedidos são registrados no sistema. Em Mesas, o QR é gerado localmente para `/menu/mesa/[id]`, sem serviço externo. O cliente escolhe retirada, entrega (endereço e localização opcionais) ou pedido da mesa, e vê uma estimativa calculada pela fila atual. A cozinha é protegida por sessão HTTP-only; nenhuma chave de integração é enviada ao navegador.

Fotos enviadas pela Gestão são convertidas para WebP e limitadas a 600 KB, com armazenamento na tabela `product_images`. O estoque é opcional; ao ser ativado, a baixa automática depende da receita configurada em cada variação do produto.

Pedidos online de retirada e entrega podem ser recebidos no caixa; na entrega, o motoboy também pode registrar o pagamento. Entregas não pagas continuam visíveis mesmo após a marcação de entrega até o recebimento ser registrado.

## Verificações

```bash
pnpm exec tsc --noEmit
pnpm run lint
pnpm run build
```
