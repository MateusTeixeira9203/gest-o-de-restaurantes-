# Restrio · roteiros antecipados da Etapa A

Preparação de QA, não execução nem aprovação do produto. Branch `feat/restrio-etapa-a`; Cantina Modelo (`cantina-modelo`). Fontes: C1s no plano de execução de 27/10, C1 A8, ordem de paralelismo de 28/10 e regra de design. Os nomes dos campos novos da A3 devem ser conferidos no contrato entregue antes de automatizar requisições; não adivinhar o payload nem aplicar a 0019 pelo teste.

## Entrada e segurança (todos os roteiros)

1. Aguardar entrega/revisão do item e liberação de execução. Nada deste documento autoriza banco, migração, servidor ou commit.
2. O responsável confirma, sem revelar valores, que o servidor local e a conexão de teste apontam para `ep-square-dawn-b6qhiaxp` (direto ou pooler Neon) e `RESTAURANT_SLUG=cantina-modelo`. O agente não lê `.env.local`. `QA_DB_HOST` é confirmação do operador, não prova da configuração do servidor. Um futuro executor SQL deve chamar `assertDatabaseTarget` ANTES de conectar, e `assertCantina` antes de escrever. Não usar `scripts/database.mjs`, que carrega ambiente implicitamente, neste harness.
3. Sem cliente real. Não ler `logins-cantina-modelo.txt`. O usuário fornece login sintético por ambiente ou entra no portal. Nunca gravar PIN, cookie, URL de conexão, corpo de login ou storageState na evidência.
4. Gerar manifesto offline por `fixture-plan.mjs`. Registrar `restaurantId` conferido por slug. Todos os produtos, variantes, mesa e equipe são novos, com UUIDs exatos do manifesto; nomes levam o runId. PIN próprio de fixture é fornecido por ambiente ao executor futuro, não salvo. Hash com salt como o helper existente; não reutilizar seu cleanup, que apaga por restaurante inteiro.
5. Verificar se mesa 199 está livre; se existir, parar e escolher número livre na faixa 1..200 sem alterar a mesa existente. Criar só a mesa sintética. Não alterar cor, plano, taxa padrão, equipe ou conta já existente da Cantina. Taxa de entrega de R$3 é parâmetro da fixture, sem mudar configuração global.
6. Registrar imediatamente todos os IDs retornados por cada ação e idempotency-key, inclusive lançamentos, linhas, caixa, comandos e tentativas de autenticação da equipe sintética. Se uma escrita tiver resultado incerto, parar: reconciliar pela chave exata antes de repetir. Não descobrir lixo por nome parcial ou intervalo de horário.
7. Baseline: contagens de pedidos, pagamentos e lançamentos da Cantina; IDs existentes ficam só em memória para comparação. Sem outras operações simultâneas no turno da A7. Não fechar caixa de outro operador; se já houver caixa aberto, bloquear apenas a A7 até janela isolada.
8. Evidência só em `C:\Users\mateu\Desktop\Evidencias\Restrio\<item>\<runId>\`. Registrar commit conferido, versão do navegador, largura, cenário, esperado/obtido, HTTP status e IDs sintéticos; não salvar snapshot completo com dados preexistentes.

## A1 · cozinha por canal (N1)

| ID | Preparar e agir | Resultado verificável |
|---|---|---|
| A1-01 | Três pedidos sintéticos confirmados: Mesa 199, pickup, delivery; logar kitchen | Selos escritos Mesa/Balcão/Entrega, códigos `Mesa 199 · #n`, `B-n`, `E-n` iguais aos demais fluxos; cores #23745B/#345BA2/#B45309 com texto branco; itens 18px/700 |
| A1-02 | Aplicar cada filtro de canal, combinar com setor e limpar | Contador corresponde à fixture visível, filtro não mistura canal/setor, atrasados primeiro; lista vazia explica próximo passo |
| A1-03 | Com clock do navegador simulado, avançar em passos de 30s | Tempo parte de confirmedAt, não createdAt. Acima da estimativa fica âmbar, acima de 1,5x vermelho; nos limites exatos não antecipa. Sem estimativa: vermelho acima de 20min. Sem reload; relógio é só do browser |
| A1-04 | Iniciar preparo, aguardar resposta, marcar pronto | Uma ação por clique, mesma rota updateKitchenTicket; sucesso só após servidor; ticket e pedido mudam coerentemente; falha HTTP mantém ação recuperável, não finge pronto |
| A1-05 | Capturar 390 e 1280x800, depois todas as larguras PD, também grayscale | Sem overflow; canais distinguíveis por texto em cinza; branco/fundo >=4,5:1; legível a 2m no tablet (confirmação humana) |
| A1-06 | Simular carregando/vazio/503 no GET da fila; retirar mocks | Estados distintos e recuperáveis, retry funciona; cozinha não recebe endereço/telefone/pagamento previsto no JSON, não apenas ocultos no DOM |

## A2 · entregador (N1)

| ID | Preparar e agir | Resultado verificável |
|---|---|---|
| A2-01 | Delivery com pedido pronto pago e outro a receber | Prontos é aba inicial; abas e contagens corretas; código E-n; endereço grande; pago informa meio e não cobra novamente; a receber mostra total |
| A2-02 | Inspecionar links sem navegar nem ligar | Telefone só no `tel:`; Maps `https://www.google.com/maps/search/?api=1&query=` com endereço codificado ou coordenadas; telefone ausente de Maps e de outras URLs. Nenhuma chamada externa efetuada pelo teste |
| A2-03 | Marcar saiu, depois entregue | PATCH autorizado para delivery/cashier/manager; courier_name = usuário sintético que saiu; ordem avança uma vez; duplo clique não duplica efeito |
| A2-04 | Entregar sem receber, recarregar; depois receber via caixa | Entregue não pago continua visível até quitação; pago desaparece da pendência correta; histórico não perde pedido |
| A2-05 | Negar PATCH sem sessão e com kitchen/waiter | 401/403, nenhuma mudança de estado/courier; gerente mantém permissão |
| A2-06 | 360/390/430, padrão/vermelho/amarelo; GET vazio/503/lento e PATCH 503 | Sem overflow; alvo >=44px; recuperar erro; sem sucesso antecipado. A2 antes da A3 não exige troco nem campos da 0019 |

## A3 · pedido por canal (N1, depois da 0019)

Pré-condição: responsável confirma 0019 aplicada com aprovação e SQL revisado; harness não aplica migração. Produto sintético de R$60 e entrega de R$3 = total R$63; um único setor, para esperar um ticket.

| ID | Preparar e agir | Resultado verificável |
|---|---|---|
| A3-01 | Caixa: Novo pedido > Entrega; cliente/endereço sintéticos, taxa 300, dinheiro, troco para 10000 centavos | Um pedido E-n em Entregas/Cozinha/Pendentes; total 6300, changeCents 3700; taxa entra uma vez, sem taxa de serviço de mesa |
| A3-02 | Mesmo payload com troco para 6200; repetir com 0/negativo/texto; endereço ou itens vazios | 400 e mensagem em português; zero pedidos/tickets/eventos novos para a chave exata, zero efeito financeiro. Troco 6300 é aceito com 0; não usar float em reais |
| A3-03 | Enviar simultaneamente duas requisições válidas com MESMA UUID idempotency-key, depois reenviar | Mesmo pedido; exatamente um pedido e um ticket no setor sintético; sem taxa, estoque ou evento financeiro duplicado. Chave igual com payload diferente deve recusar, nunca criar outro pedido |
| A3-04 | Mesa 199 pelo garçom e Adicionar pedido no Salão | Mesmos totais, serviço e fluxo anteriores; mesmo código em caixa/cozinha; sem exigir dados de entrega; soma manual = API |
| A3-05 | Balcão por salão e caixa; testar público /menu e QR /menu/mesa/199 | Seletor nos caminhos de equipe; público mantém contrato e fluxo anteriores, sem acesso a APIs internas; B-n, sem endereço obrigatório nem taxa de entrega |
| A3-06 | Repetir entrega prevista pix/cash/debit/credit/prepaid | Rótulos PT na UI, valores previstos no contrato; previsão não é recebimento. prepaid não cria um segundo pagamento; receber segue confirmação real do servidor |
| A3-07 | Ler state isoladamente com seis papéis e sem cookie | kitchen: sem endereço, telefone e pagamento previsto/troco; waiter: sem endereço/pagamento previsto/troco; cashier: sem endereço; delivery: endereço/telefone e cobrança necessários, sem estoque/cozinha; manager/admin: visão permitida. Campo sensível ausente ou null e sem cópia aninhada; sem sessão 401 |
| A3-08 | Tentar criar pedido como kitchen/delivery e sem sessão; ID estrangeiro ou inexistente de produto/variante/mesa/pedido | Recusa sem escrita. Isolamento real com segundo restaurante exige fixture separada autorizada: não furar a trava Cantina nem fingir que UUID aleatório prova outro tenant (N3 pendente) |
| A3-09 | UI envia duas vezes, timeout após envio, servidor 400/503; 360/390/430/1280/1440 | Recuperação usa a mesma chave da tentativa incerta, sem duplicata; erro legível; taxa/total/troco visíveis; PD sem overflow |

## A8 · equipe sem login (N1)

| ID | Preparar e agir | Resultado verificável |
|---|---|---|
| A8-01 | Em contexto novo sem cookies GET /api/auth/team | Exatamente 404, nenhuma lista de nome/id/papel. Inspecionar rede de /gestao: tela não solicita mais auth/team. Busca no produto só encontra histórico de documentação |
| A8-02 | Equipe: digitar nome sintético em três caixas diferentes, PIN pelo ambiente | Nome/ana/ANA equivalentes para autenticação; placeholder/help de nome digitado, autoCapitalize=words; sem botões enumerando equipe |
| A8-03 | Nome sintético inexistente e PIN errado de fixture | Mesma mensagem Nome ou PIN inválido, sem enumerar usuário. Usar fixture própria para não bloquear equipe já existente |
| A8-04 | Nome de throttle sintético novo: 10 tentativas erradas em <15min, depois a 11a | 1..10 recebem erro de credencial, 11a 429; após janela volta a aceitar tentativa. Não usar nome de login real. Registrar identity_hash exato para limpeza com restaurantId |
| A8-05 | Login com admin, manager, waiter, kitchen, cashier, delivery, cada um em browser context limpo | admin/manager > /gestao/dashboard; waiter > /operacao/garcom; kitchen > /operacao/cozinha; cashier > /operacao/caixa; delivery > /operacao/entregas. Confirmar navegação pelo formulário, não apenas POST; sessão não sobe privilégio |
| A8-06 | Manager acessa /api/operations/team; demais papéis tentam; sessão expirada e origem externa no POST | Gerente continua listando equipe; não autorizado recusado; sessão expirada volta ao acesso; origem diferente 403; nenhum dado sensível no erro |
| A8-07 | Normal/enviando/erro, PD em cinco larguras e três marcas | Enviando desabilita submit, sem lista vazada nem flash de equipe; erro orienta; campos/alvos utilizáveis em 360px |

## A7 · rodada completa N2 (390px e 1280x800)

Executar duas vezes com manifestos e sessões novos; nunca reutilizar caixa aberto de outra rodada. Cada passo registra IDs, código mostrado, esperado/obtido e captura. Repetir N1 já validado somente se o código do fluxo mudou.

1. **Admin:** login pelo formulário; confirmar Cantina, plano e produtos sintéticos. Não alterar cor no banco. Baseline e caixa sem turno aberto; abrir turno sintético com fundo R$100, registrar shiftId e lançamentos.
2. **Manager:** login novo; validar visão de gestão, Equipe e permissões. Conferir que dados ainda batem com baseline; não disparar fiscal nem Focus.
3. **Waiter:** Mesa 199, prato R$60; criar, confirmar e anotar código. Balcão pelo botão do Salão, prato R$60. Cliente público e QR também entram na regressão com fixtures distintas e IDs registrados.
4. **Cashier:** Novo pedido > Entrega, prato R$60 + taxa R$3, dinheiro com troco para R$100. Ver E-n nos Pendentes; previsão ainda não conta como pagamento. Rodar troco inválido e idempotência da A3 antes de continuar.
5. **Kitchen:** verificar todos os canais, atraso/filtros, iniciar e marcar pronto os tickets exatos. Estado de um setor não pode liberar ticket ainda não pronto de outro setor. Simular uma falha, recuperar sem duplicar.
6. **Waiter:** servir mesa e retirar balcão depois de pronto; tentativa antes do pronto recusada. Conferir código e total preservados.
7. **Delivery:** aba Prontos, código E-n/endereço; conferir tel/Maps sem abrir. Sair (courier gravado), entregar sem receber; entregue a receber permanece na lista após reload.
8. **Cashier:** receber mesa/balcão/entrega por rota existente; para entrega, R$100 entregues, R$63 receita e R$37 troco. Reenvio com mesma chave não cobra duas vezes. Produto de mesa segue taxa de serviço atual; total esperado vem da soma manual da fixture. Conferir paymentId, estado quitado e saída das pendências.
9. **Manager/admin:** comparar pedidos, pagamentos, movimentação de estoque e lançamentos pelos IDs criados; receita não duplica taxa nem troco. Fechar APENAS shiftId desta rodada; esperado = fundo inicial + recebimentos em dinheiro - trocos (demais meios separados); comprovar diferença zero e confirmação só após servidor.
10. Conferir restrições dos seis papéis, sessão ausente/expirada e rota auth/team fechada. Isolamento entre tenants, toque físico/tablet a 2m e aceite estético final ficam N3/humano, explicitamente pendentes se não feitos.
11. No commit final, N0 + build + `test:integration` + `test:fiscal` uma vez. **Não executar esses scripts antes de auditar suas fixtures:** helpers atuais criam outros restaurantes e removem dados por restaurantId. A autorização desta tarefa só cobre preparar roteiros; adaptar suites à política ou obter escopo separado antes de rodar. Fiscal usa apenas homologação/fixtures, sem emissão externa real; fiscal por API continua estacionado.
12. Limpar apenas IDs criados, comparar contagens com baseline e registrar resíduo zero. Diferença de contador sequencial é esperada (não rebobinar restaurant_counters); pedidos/pagamentos/lançamentos devem retornar à baseline numa janela sem concorrência. Se divergirem, FALHOU, sem apagar para acertar a contagem.

## Limpeza exata e recuperação

Este pacote **não insere nem apaga linhas**. O manifesto é o contrato para o executor de integração quando o código for entregue. Antes de primeira escrita, implementar e revisar a criação/limpeza no contrato real da A3; não transformar estes roteiros em SQL improvisado.

- Nunca remover restaurante Cantina, contas existentes, dados por slug sozinho, prefixo QA, `LIKE`, data ou restaurantId sozinho. Nunca TRUNCATE ou SQL destrutivo sem WHERE.
- Capturar todos os filhos exatos: settlements/documents/payments/linhas/entries, comandos, shift; eventos/tickets/itens/delivery, orders; variantes/produtos/mesa/equipe e attempts da fixture. Registrar também IDs gerados pelo servidor (não só UUIDs reservados).
- Em transação, conferir propriedade de TODOS os IDs contra restaurantId e manifesto antes de excluir; conferência falhou, ROLLBACK. Conferir também dependências não registradas antes de cascata; dados estranhos nunca são removidos por cascata silenciosa.
- Ordem de FK: settlements e documents; payments; finance_lines; finance_entries (reversões primeiro); finance_commands por request_key; cash_shifts; filhos de orders, depois orders; variantes/adicionais/produtos; mesa; staff; authentication_attempts por chave composta exata. Rever FKs/migrações no commit executado; não desabilitar constraints.
- Exemplo de escopo (parâmetros, nunca interpolação): `DELETE FROM orders WHERE restaurant_id=$1 AND id=ANY($2::uuid[]) RETURNING id`. payments/filhos sem restaurantId exigem UUIDs exatos E vínculo a orders já comprovados da Cantina; attempts exigem `WHERE restaurant_id=$1 AND identity_hash=$2`; commands exigem `WHERE restaurant_id=$1 AND request_key=$2`.
- Arrays vazios não disparam cleanup; lista inválida/ID desconhecido interrompe. Após COMMIT, verificar ausência de cada ID criado e contagens da baseline. Se falhar, guardar manifesto para recuperação revisada, sem ampliar o WHERE.

## Portão de design e execução futura

`capture-design.mjs` só captura, não aprova as oito regras. Gera screenshots e manifesto com HTTP/overflow/URL final/cor computada. Não clica, não abre Maps, bloqueia requests externas e métodos de escrita (exceto login explicitamente liberado). Sem credencial: hub, menu, entrega pública, mesa 01, login e 404. Login não precisa ser real: usuário pode fornecer equipe sintética. Rodar uma vez por papel; credenciais nunca em argumento CLI, histórico ou arquivo de relatório.

Pré-requisitos futuros: servidor local já iniciado pelo responsável e confirmado na Cantina/host aprovado; Node 22; Playwright + Chromium provisionados pelo responsável (não instalados nesta tarefa). Sem pacote no repo: fornecer `QA_PLAYWRIGHT_MODULE` com caminho absoluto para `playwright/index.mjs` de uma instalação externa; não alterar package.json/lock desta entrega.

PowerShell, **somente quando liberado** (as variáveis abaixo não contêm segredo):

```powershell
$env:QA_DB_HOST='ep-square-dawn-b6qhiaxp'
$env:QA_RESTAURANT_SLUG='cantina-modelo'
$env:QA_BASE_URL='http://localhost:3001'
$env:RESTRIO_QA_RUN='plan'
node tests/qa/fixture-plan.mjs # offline; só cria manifesto fora do cofre
$env:RESTRIO_QA_RUN='capture'
$env:QA_ITEM='A1'
$env:QA_STAGE='antes' # depois, na mesma matriz e commit final
node tests/qa/capture-design.mjs
```

Ausência de RESTRIO_QA_RUN encerra ANTES de importar Playwright, fazer rede ou criar pasta. Captura não conecta ao banco. Para telas logadas: usuário preenche `QA_LOGIN_NAME`, `QA_LOGIN_PIN`, `QA_LOGIN_ROLE` e `QA_ALLOW_LOGIN_WRITE=1` no ambiente; não pedir ao agente para ler os valores. Remover as quatro variáveis ao terminar. O login atual escreve authentication_attempts; exige janela liberada e equipe sintética, não PIN pessoal.

Estados normal/dados usam o servidor sem mocks. Para vazio/erro/carregando, `QA_SCREEN_STATE` recebe o estado e `QA_STATE_RESPONSES` contém mapa JSON de paths GET exatos `/api/...` para `{status, body}` **com contrato e dados sintéticos revisados no commit**. Vazio: corpo vazio válido do endpoint; erro: 503 com mensagem PT; carregando: retém a resposta até fechar página. Nenhum mock de endpoint de autenticação, dados reais ou gravação. Esses prints são ensaio visual, não prova de falha real do backend. Sem mock fornecido, o harness recusa em vez de rotular um print normal como vazio/erro. Ajustar os GETs corretos com o Revisor por tela.

O Revisor confere, tela/estado a tela: ação principal; linguagem; hierarquia; cor com texto/ícone; respiro/raio14/até3níveis; estados/sucesso; alvos44/toque; consistência dos códigos. Mede contraste >=4,5:1 (inclusive on-accent em vermelho/amarelo), faz design-review >=B e compara antes/depois. Grayscale e relógio simulado são ensaios adicionais do A1. O usuário faz aceite estético e toque real; capturas não provam estes itens.
