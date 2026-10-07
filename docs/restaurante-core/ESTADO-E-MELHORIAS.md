# Estado verificado e melhorias do Gestor Food

Verificação de 07/10/2026. Gestor Food é o nome provisório do produto; Patos Lanches permanece o restaurante demonstrativo e a marca atualmente publicada. Alternativas de nome ainda não foram pesquisadas quanto a domínio ou registro de marca.

## GitHub

- Repositório privado: [MateusTeixeira9203/gest-o-de-restaurantes-](https://github.com/MateusTeixeira9203/gest-o-de-restaurantes-).
- Branch principal: `main`.
- Commit remoto e local: `4e024119e15eb87090e495ccefbbbb9113135c35`.
- Mensagem: `fix: use configured restaurant name in WhatsApp share`.
- Status de integração do commit: Vercel `success`.
- A consulta de check runs não retornou testes automatizados para esse commit. Isso não prova ausência de qualquer teste em outros mecanismos.
- Documentos desta conversa estão locais, sem commit. Nenhum push foi executado.

## Vercel

- Projeto: `gest-o-de-restaurantes-`, framework Next.js.
- Ambiente consultado: produção, estado `READY`.
- Origem: Git, branch `main`, mesmo SHA do GitHub e do checkout local.
- Endereço principal: [aplicação publicada](https://gest-o-de-restaurantes-opal.vercel.app).
- Identificador do deploy: `dpl_7c2EpSJcGgSXLTtTSLrEMY7qqpwd`.
- [Detalhes do deploy](https://vercel.com/mateusteixeira9203s-projects/gest-o-de-restaurantes-/7c2EpSJcGgSXLTtTSLrEMY7qqpwd).

## Leituras públicas executadas

| Verificação | Resultado |
| --- | --- |
| Página inicial | HTTP 200, título Patos Lanches — Operação & Gestão |
| `/api/health` | HTTP 200, `ok: true`, `database: connected` |
| `/api/public/menu` | HTTP 200, restaurante Patos Lanches, quatro produtos retornados |

O healthcheck executa `SELECT 1`; comprova conectividade, não integridade de todos os dados. O cardápio comprova leitura de dados da aplicação. Não foram criados pedidos, recebimentos, notas, usuários ou movimentações para esta conferência. Fluxos internos autenticados não foram retestados nesta etapa.

## Base atual e primeira versão

Capacidades abaixo identificadas no código do mesmo commit publicado; não representam novo teste de ponta a ponta de cada recurso.

| Área | Base atual | Melhoria da primeira versão |
| --- | --- | --- |
| Pedidos | Garçom e canal digital chamam criação que já confirma e gera cozinha | Cliente solicita; garçom/caixa aciona envio explícito |
| Papel do caixa | Registra recebimentos; endpoint de criação operacional aceita garçom/gerente/admin, não caixa | Permitir ao caixa autorizado registrar e enviar pedidos |
| Mesas e atendimento | Mesas, pedidos e fechamento da conta | Separar quitação financeira de preparo/atendimento |
| Cozinha | Tickets por setor e avanço de produção | Garantir que só receba pedido aprovado e que repetição não duplique tickets |
| Entregas | Saída e entrega, endereço para a equipe de entrega | Preservar fluxo e relacionar recebimentos ao caixa/custódia corretos |
| Caixa | Registro de pagamentos e resumo de vendas concluídas | Abertura/fechamento por turno, troco, suprimento, sangria e conferência |
| Estoque | Insumos, receitas, custo médio e movimentos | Preservar custo histórico e distinguir devolução de desperdício |
| Financeiro | Pagamentos vinculados a pedidos | Contas a pagar/receber, baixas, contas financeiras e transferências |
| Fluxo de caixa | Sem módulo avançado identificado | Realizado e previsto em 7/30 dias |
| Métricas | Resumos calculados a partir do snapshot de até 200 pedidos | Consultas completas por período, CMV, contribuição e resultado gerencial |
| Identidade | Nome e imagens configuráveis em partes; marca fixa em outras | Identidade coerente do Patos, separada do nome da plataforma |
| Fiscal | Sem conector implementado identificado | Incluir emissão das vendas e exportação ao contador no piloto MG, com Focus em avaliação e liberação condicionada a testes |
| Conciliação externa | Sem conector implementado identificado | Posterior à validação do núcleo financeiro |

## Envio para a cozinha

Fluxo presencial: cliente fala com garçom/caixa → atendente lança/confere → atendente toca em “Enviar para cozinha” → servidor verifica permissão e registra aprovação → tickets entram nos setores.

Fluxo digital opcional: cliente envia solicitação → pedido aguarda na equipe → garçom/caixa confere e envia → produção. O cliente nunca envia diretamente à cozinha. Pagamento confirmado, sozinho, também não autoriza produção.

A tela pode reunir registro e aprovação no botão de envio usado pelo atendente, mantendo eventos auditados. Um botão “Salvar” sem envio não libera produção. Outro papel só exerce essa ação se também autorizado a atuar como garçom/caixa.

## Prioridade de trabalho

Evoluir a base usando o projeto e banco atuais, conforme orientação posterior do proprietário, preservando registros: aprovação e operação consistente → caixa e registros financeiros → contas e fluxo de caixa → custos e métricas → fiscal/exportação → testes. Preparar o cadastro fiscal em paralelo. A [primeira versão](PRIMEIRA-VERSAO.md) detalha o recorte. Múltiplos clientes, novos domínios, checkout de licença e automações bancárias ficam para a etapa seguinte. A emissão fiscal passa a integrar o piloto conforme [Fiscal MG](FISCAL-MG.md).
