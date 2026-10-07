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
5. Aplique, em ordem, as migrações em `drizzle/` no banco Neon antes de publicar uma versão que as utilize. A migração `0004_product_images.sql` acrescenta a tabela de fotos dos produtos; `0005_restaurant_brand_images.sql` acrescenta apenas a tabela de logo e capa do restaurante.
6. Faça o deploy.

O script de build usa `next build --webpack`. As rotas são atendidas pelo App Router e usam navegação com `next/link`.

## Rotas

- `/operacao` — escolha de área
- `/operacao/garcom` e `/operacao/garcom/mesa/[id]` — mesas, comandas e pedidos
- `/operacao/cozinha` — produção por etapas e setor
- `/operacao/caixa` — contas e pagamentos
- `/menu` — cardápio público com escolha entre retirada e entrega
- `/menu/entrega` — link do WhatsApp para pedido de entrega com nome e endereço obrigatórios
- `/menu/mesa/[id]` — QR presencial com mesa identificada
- `/gestao` — login administrativo
- `/gestao/dashboard`, `/gestao/mesas`, `/gestao/pedidos`, `/gestao/cardapio`, `/gestao/estoque`, `/gestao/caixa`, `/gestao/equipe`, `/gestao/relatorios`, `/gestao/configuracoes`

No ambiente local de teste, as credenciais são `admin` / `admin123`. Em produção, use as variáveis de ambiente acima e troque a senha antes do primeiro uso.

## Persistência e operação

Pedidos, filas de cozinha, mesas, pagamentos, disponibilidade do cardápio e configurações do restaurante usam o PostgreSQL no Neon. Cada tela operacional consulta a mesma fonte e atualiza automaticamente a cada poucos segundos; por isso garçom, cozinha e caixa podem trabalhar em dispositivos diferentes após entrar com a conta da equipe.

O cardápio público não recebe credenciais internas. O caixa e a gestão compartilham `/menu/entrega` pelo WhatsApp; o WhatsApp só transporta o link, e o pedido é registrado como entrega no sistema. Essa rota exige nome, telefone e endereço escrito; a localização é opcional. Em Mesas, o QR é gerado localmente para `/menu/mesa/[id]`, sem serviço externo. O cliente vê uma estimativa calculada pela fila atual. A cozinha recebe os pedidos em ordem numérica, com etiqueta de entrega/retirada/mesa, número, nome e itens. A área de Entregas mostra o pedido desde a entrada na cozinha e libera a saída apenas depois do preparo. A cozinha é protegida por sessão HTTP-only; nenhuma chave de integração é enviada ao navegador.

Fotos enviadas pela Gestão são convertidas para WebP e limitadas a 600 KB, com armazenamento na tabela `product_images`. O estoque é opcional; ao ser ativado, a baixa automática depende da receita configurada em cada variação do produto.

Em **Gestão → Configurações → Visual do cardápio**, o responsável pode enviar ou restaurar o logo e a foto de capa do cardápio. O arquivo original pode ter até 5 MB; a imagem publicada é convertida para WebP e armazenada no Neon. A mesma identidade aparece no link de entrega e no QR das mesas. Se nenhuma imagem personalizada for enviada, o sistema usa os arquivos padrão do projeto.

A API de operação entrega dados conforme o papel: gestão vê todos os dados; cozinha recebe apenas pedidos ativos, sem endereço ou telefone; garçom vê pedidos de mesa; caixa não recebe endereços; entrega vê apenas pedidos de entrega com endereço. O estoque é enviado somente à gestão.

Pedidos online de retirada e entrega podem ser recebidos no caixa; na entrega, o motoboy também pode registrar o pagamento. Entregas não pagas continuam visíveis mesmo após a marcação de entrega até o recebimento ser registrado.

## Verificações

```bash
pnpm exec tsc --noEmit
pnpm run lint
pnpm run build
```
