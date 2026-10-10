# SIM-20 — simulação persistida de um turno de restaurante

## Contrato de execução — 09/10/2026

Solicitação: simular 20 mesas concorrentes, registrar pedidos, cozinha, atendimento e fechamento no banco, medir gargalos e propor melhorias. Responsável: Codex nesta tarefa, sem delegação.

Base: checkout `c0ef100bf5deb5d27efe991063d248d9799374ea`, aplicação local compilada em modo produção e banco Neon configurado (`patos_lanches`). A versão Vercel não foi reconciliada: conector respondeu 403 e não há CLI disponível. Medições locais não atestam capacidade da publicação. Alterações já existentes no manual e em `tests/two-waiters.integration.mjs` pertencem a trabalho anterior e serão preservadas.

Escopo: harness `tests/restaurant-stress.integration.mjs`, este relatório e evidências em `outputs/stress-20/`. Restaurante sintético exclusivo, 20 mesas, quatro garçons, três sessões de cozinha, gerente; três rodadas de pedidos, atualização de telas simulada pela API a cada quatro segundos, cozinha por setor, atendimento, pagamentos manuais sintéticos e fechamento de caixa. Dados permanecerão no banco. SQL somente para fixtures e conferência; operação por APIs reais. Não há emissão fiscal ou transferência de dinheiro.

Preservar: registros, cadastros, saldos e acessos do restaurante existente; regras e código da aplicação. Fora: correções, migrations, publicação, teste destrutivo, capacidade máxima da infraestrutura, dispositivos físicos. Interromper a expansão da carga ao encontrar falha operacional; conservar evidência para diagnóstico. Nenhum cleanup automático. Credenciais de QA não entram nos relatórios.

| ID | Inicial → ação → esperado | Efeito proibido | Verificação / estado |
|---|---|---|---|
| AC01 | Restaurante exclusivo vazio → abrir 20 mesas com pedidos sobrepostos → IDs únicos e mesas corretas | Alterar registros existentes | Comparação antes/depois e banco; NÃO TESTADO |
| AC02 | Pedido público pendente → aprovar → tickets por setor e estoque uma vez | Produção antes de aprovação / duplicação | API, eventos e banco; NÃO TESTADO |
| AC03 | Tickets novos → preparando → pronto → garçom serve | Servir antes de todos os setores prontos | API, horários e recarga; NÃO TESTADO |
| AC04 | Mesas servidas → pagamentos mistos/parciais → contas quitadas e caixa conferido | Cobrança dupla / saldo divergente | Banco, repetição de pagamento e diário; NÃO TESTADO |
| AC05 | Operação concorrente → leituras a cada 4s → continuidade e latência observável | Ocultar erros ou atribuir medição local à Vercel | HTTP por chamada, p50/p95/máximo, payload e erros; NÃO TESTADO |
| AC06 | Fim ou interrupção → nova conexão → histórico preservado | Excluir evidência | Conferência por restaurant_id; NÃO TESTADO |

Aceite do usuário permanece pendente. Recomendações não são autorização de implementação. Reversão: parar o processo; dados QA permanecem, eventual exclusão será uma tarefa expressamente autorizada.

## Resultado executado — NÃO PASSA

Ensaio válido iniciado em **09/10/2026 às 22:45:55 BRT** (`2026-10-10T01:45:55.131Z`). SHA `c0ef100bf5deb5d27efe991063d248d9799374ea`, Next.js 16.3.4 compilado com webpack, `next start` em `127.0.0.1:3100`; banco configurado Neon na região `sa-east-1`, base `patos_lanches`. Build concluído. Nenhuma alteração no código da aplicação, migration, commit, push ou deploy.

A primeira rodada lançou 20 solicitações sobrepostas: 15 de garçom com envio imediato e cinco de QR com aprovação posterior. Oito sessões autenticadas: quatro garçons, três cozinhas e um gerente. Sete leitores consultavam a operação a cada quatro segundos. Pico observado: 25 chamadas HTTP simultâneas, incluindo leituras e aprovações. É um pico deliberadamente sincronizado; não representa uma medição estatística de turnos reais nem prova um limite fixo de mesas.

**Sete das 20 jornadas falharam (35% nesta rodada):** quatro erros `deadlock detected`, dois `timeout exceeded when trying to connect` e um HTTP 500 sem JSON na aprovação, com timeout registrado no servidor. As etapas posteriores foram interrompidas no primeiro limite operacional quebrado. Não houve novas tentativas para mascarar o resultado.

### Estado persistido e conferido novamente

Restaurante de QA: `qa-core-stress-91ff495c` — ID `8215941d-fefd-4e35-8754-3c0a390d588d`.

- 20 mesas cadastradas; 16 pedidos gravados: **13 confirmados e três pendentes**.
- 26 tickets novos de cozinha, dois por pedido confirmado; nenhum ticket dos pendentes.
- Mesas 1, 2 e 5: pedidos pendentes; mesas 15, 17, 19 e 20: nenhum pedido gravado.
- 29 eventos de pedido: 16 registros e 13 aprovações. Zero números de pedido, chaves de solicitação ou tickets por setor duplicados nesta amostra.
- Estoque confere com itens aprovados e movimentos: bebidas 974, pizza 992, prato 990, partindo de 1.000 unidades de cada insumo.
- Nenhum pagamento. Caixa sintético aberto com R$100; duas linhas contábeis de abertura equilibradas. Ficou aberto como evidência; **não é fechamento validado**.
- Verificação em nova conexão às 22:46:57 BRT confirmou persistência e nenhuma conexão ociosa dentro de transação.
- Restaurante preexistente `patos-lanches`: mesmos oito pedidos e cinco pagamentos; hashes das linhas de pedidos/estoque e contagem de lançamentos financeiros inalterados. Essa comparação cobre essas entidades, não é auditoria integral de todas as tabelas.
- Houve um ensaio anterior de preparação (`qa-core-stress-dc7b0a47`, ID `c724239f-e07e-4d65-8e59-8fdf9e3d4e63`) que parou no primeiro login porque o servidor local não carregava as variáveis de sessão de desenvolvimento. Mantido no banco, sem pedidos, tickets, pagamentos ou caixa aberto. A inicialização local foi ajustada para carregar as variáveis existentes antes de iniciar o servidor em modo produção; o código do produto não mudou.

### Tempos HTTP medidos

Tempos ponta a ponta entre gerador local e aplicação local, incluindo espera pelo Neon. p95 por nearest-rank, amostra curta. Erros entram nas linhas de ações; leituras tiveram todas sucesso.

| Operação | Amostras | Erros | Mediana | p95 | Máximo |
|---|---:|---:|---:|---:|---:|
| Leitura operacional antes da carga | 5 | 0 | 180 ms | 274 ms | 274 ms |
| Criar pedido de garçom | 15 | 4 | 8.244 ms | 12.977 ms | 12.977 ms |
| Criar pedido público | 5 | 0 | 735 ms | 1.152 ms | 1.152 ms |
| Aprovar pedido público | 5 | 3 | 8.008 ms | 11.327 ms | 11.327 ms |
| Atualizar operação durante carga | 21 | 0 | 4.643 ms | 8.459 ms | 8.498 ms |

Somente os 11 pedidos de garçom bem-sucedidos: mediana 6.758 ms, p95 12.977 ms. A mediana das leituras aumentou aproximadamente 25,8 vezes. Payload operacional máximo 25.685 bytes nesta amostra pequena; crescimento futuro precisa de medição própria.

### Diagnóstico e melhorias propostas

**P1 — Corrigir a ordem de aquisição dos bloqueios (fato capturado + mecanismo confirmado no código).** Às `01:46:09.215Z`, PID 1779 esperava o contador de fila bloqueado pelo PID 1780; PID 1780 esperava `inventory_settings` bloqueado pelo PID 1779. Criação com envio imediato atualiza `restaurant_counters` antes de aprovar; aprovação de pedido já existente bloqueia `inventory_settings` antes de atualizar o contador. As APIs retornaram quatro deadlocks. Padronizar a ordem de locks entre esses caminhos, manter atomicidade e acrescentar regressão de criação + aprovação simultâneas. Depois considerar retry limitado para SQLSTATE 40P01, conservando a mesma chave idempotente. A correção é proposta, não implementada.

**P1 — Revisar o bloqueio global de catálogo por restaurante.** `ensureCatalog()` adquire `pg_advisory_xact_lock` em `catalog:<restaurantId>` e não faz outra operação. Cada criação chama essa função dentro da transação. Amostras mostram várias conexões aguardando advisory locks enquanto uma transação trabalha. O código confirma a serialização do catálogo; as amostras não registram o valor do parâmetro de cada advisory lock. Remover ou restringir esse bloqueio somente após conferir os invariantes; preservar unicidade dos contadores, estoque e idempotência. Quantificar o ganho com o mesmo cenário após a correção.

**P1 — Reduzir pressão das atualizações e tornar falhas recuperáveis.** Pool local configurado com `max: 5` e espera de oito segundos; houve timeouts e leituras de até 8,5 s. `getOperationSnapshot()` busca cardápio, mesas, pedidos, cozinha e estoque antes de a rota retirar informações conforme o papel. O frontend usa `setInterval` de quatro segundos na operação, sem impedir uma consulta sobreposta; esse comportamento foi reproduzido pelos leitores da simulação. Priorizar consultas por papel/setor, impedir refresh sobreposto, usar recuo em falha e indicar última atualização/estado desatualizado na interface. A contribuição exata de cada mudança ainda precisa de medição. Aumentar pool isoladamente não resolve o deadlock observado; dimensionar após corrigir contenção.

**P2 — Melhorar classificação de erros e observabilidade.** Um timeout escapou da autenticação da rota de aprovação e retornou HTTP 500 sem JSON; outros erros de infraestrutura foram expostos como HTTP 400, com mensagem técnica. Padronizar erros transitórios, orientar tentativa segura, preservar chave da operação e registrar correlação, espera por conexão, SQLSTATE e tempo de transação. Não recomendar repetição cega de pagamento.

**P2 — Melhorias de operação para validar em nova rodada.** Exibir claramente “pendente de aprovação”, “em produção” e “pronto para servir”, alertar quando uma mesa tem solicitação não enviada e destacar tickets antigos por setor. O cenário deixou três pedidos persistidos pendentes após falha; o operador precisa distinguir isso de quatro solicitações não gravadas. O comportamento visual atual desses avisos **não foi testado em navegador**, portanto trata-se de proposta a confrontar com as telas existentes, não de ausência comprovada de recurso.

### Gate final por critério

| Critério | Estado | Evidência / limite |
|---|---|---|
| AC01 — 20 jornadas concorrentes e preservação | **NÃO PASSA** | 7/20 falhas; preservação das entidades conferidas PASSA; 20 mesas e 16 pedidos persistidos |
| AC02 — Aprovação e efeitos únicos | **NÃO PASSA** | Aprovação sob concorrência falhou em 3/5; gate antes de aprovação e efeitos dos 13 aprovados PASSAM |
| AC03 — Preparar, concluir por setor e servir | **NÃO TESTADO** | 26 tickets chegaram à fila; avanço dos status não executado após falha de entrada |
| AC04 — Pagamento e fechamento | **NÃO TESTADO** | Sem pagamentos; caixa apenas aberto. Repetição de pagamento e fechamento não executados |
| AC05 — Continuidade e medição sob carga | **NÃO PASSA** | 4 deadlocks, 3 timeouts contando o 500; leituras mediana 4,64 s. Coleta de métricas PASSA |
| AC06 — Persistência após reconexão | **PASSA** | Nova conexão confirmou pedidos, tickets, estoque e ausência de efeitos pendentes indevidos |

### Evidências e retomada

- Harness: `tests/restaurant-stress.integration.mjs` (execução exige `RUN_RETAINED_STRESS=20`; restrito a destino HTTP local; não limpa dados).
- Execução: `outputs/stress-20/2026-10-10T01-45-55.131Z/` contém `manifest.json`, `http.jsonl`, `report.json`, `locks.jsonl`, `server.log` e `reconnected-verification.json`.
- Preparação abortada: `outputs/stress-20/2026-10-10T01-45-04.771Z/`.
- Fixtures retidas no banco; evidências locais estão em diretório ignorado pelo Git. Logs não contêm PINs ou cookies.
- Para reproduzir: carregar `.env.development`/`.env.local` pelo `@next/env` antes de iniciar o build com `NODE_ENV=production` em `next start -p 3100`; em outro processo executar `RUN_RETAINED_STRESS=20 node tests/restaurant-stress.integration.mjs`. Cada execução cria outro restaurante QA; não repetir indiscriminadamente.
- Não testado: Vercel publicada, interface renderizada, dispositivos, turno prolongado, entrega, fiscal e pagamentos externos; caminho de preparo/serviço/fechamento deste harness permanece não exercitado.
- Próximo recorte recomendado: corrigir ordem de locks e contenção de catálogo; executar regressão dirigida; só então repetir as 20 mesas e completar as três rodadas com cozinha, atendimento e fechamento. Não houve implementação dessas melhorias.

**Entrega: diagnóstico reprovado no cenário de concorrência, pronto para leitura do usuário; fluxo completo não homologado.** Registros conservados para investigação, sem reversão ou limpeza automática.


## Reexecução após correção — 10/10/2026, incremento 0.3

O diagnóstico histórico acima permanece preservado. Nesta atualização foi autorizada a correção, migração e publicação: contador é bloqueado antes do estoque também na aprovação; bloqueio vazio de catálogo removido; frontend aguarda terminar o polling automático. Execução local de produção contra PostgreSQL 18 isolado restaurado do backup, sem carga sobre o Neon compartilhado. Não comparar diretamente a latência com a rodada antiga em Neon: banco/rede são diferentes.

Ensaio de 14:35:21 UTC parou no login por ausência do segredo de sessão no processo local de produção, sem pedidos. Configuração local corrigida, sem alteração de credencial dos restaurantes. Execução completa de 14:35:46 UTC: **PASSA**, 60 pedidos concluídos/120 tickets, quatro garçons, três cozinhas, 20 mesas, pico de 27 chamadas simultâneas, nenhum erro HTTP. Pagamentos parciais e repetidos, estoque final, razão balanceado, total recebido e fechamento de caixa R$705,00 conferidos. Registros anteriores inalterados nas entidades comparadas.

Medições locais: criação por garçom p95 250 ms; atualização operacional p95 116 ms; pagamento final p95 212 ms. Evidência: `outputs/stress-20/2026-10-10T14-35-46.403Z/report.json`. O harness passou a conferir o caixa usando código persistido `cash` e a exigir igualdade entre caixa contado/esperado, pagamentos/vendas e consumo/estoque; a rodada histórica não atestava essas fases. Fixtures de sobrecarga permanecem apenas na cópia local isolada e os artefatos não vão ao Git.

Aceite desta reexecução: AC01–AC05 PASSAM neste ambiente; leitura persistida e recarga passam. Não atesta duração de turno real, capacidade máxima, internet dos clientes, Vercel sob carga, dispositivos físicos ou provedores externos. Repetição após publicação será registrada abaixo.

### Repetição após commit e push

Commit de aplicação `936d34455233d49fc1771d6b76bc8062a266fb6c`, já enviado ao GitHub. Rodada `2026-10-10T14-42-43.506Z`, no mesmo ambiente local isolado: **PASSA**. Foram 468 chamadas HTTP, zero erros, pico 23 simultâneas; 60 pedidos completos e 120 tickets. p95 de criação 253 ms, pagamento final 212 ms, atualização 60 ms. Caixa contado e esperado R$705,00; vendas, recebimentos, estoque e razão conferidos. Preservação das entidades anteriores PASSA. Evidências em `outputs/stress-20/2026-10-10T14-42-43.506Z/`.

A segunda suíte de regressão também passou no build final: aprovação/entrega, financeiro, isolamento, checkout, compras/planejamento, fiscal HTTP, ciclo fiscal com transporte controlado, recebimentos integrados e dois garçons. A carga não foi enviada ao endpoint público ou ao Neon compartilhado.


## Novo ensaio solicitado — cinco garçons e quinze mesas

Responsável: Codex, sem delegação. Contrato desta execução: parametrizar o harness existente e simular cinco identidades independentes em quinze mesas, três rodadas sobrepostas, cozinha por setor, serviço, pagamentos parciais e repetição idempotente, recarga e fechamento. Código da aplicação preservado, sem emissão ou cobrança externas. Ambiente: build de produção correspondente à aplicação 936d344 (HEAD 2d0aa1a altera apenas documentação), cópia PostgreSQL 18 local via socket, separada do Neon.

Aceite: 45 pedidos e 90 tickets concluídos; nenhum efeito antes da aprovação, nenhuma duplicação após repetição; vendas/recebimentos iguais, caixa sem diferença, razão balanceado e estoque compatível com consumo. Comparar registros anteriores, conferir nova conexão e relatar erros/latências. Dados sintéticos desta simulação ficam retidos na cópia isolada. Resultado inicial: NÃO TESTADO. Critérios e resultados serão registrados nesta seção, sem outro documento concorrente.

### Resultado SIM-15 / cinco garçons — 10/10/2026

**PASSA** na execução completa `2026-10-10T14-49-27.339Z`. Cinco identidades de garçom, três cozinhas e um gerente; quinze mesas; três rodadas, 45 pedidos e 90 tickets. 354 requisições HTTP, zero erros, pico de 23 simultâneas. p95 de criação: 187 ms; pagamento final: 182 ms; atualização operacional: 130 ms. Tempos locais, não extrapolar para a Vercel/Neon ou celulares reais.

Nova conexão PostgreSQL confirmou: quinze mesas com exatamente três pedidos concluídos cada; 45 números de pedido/fila distintos; 90 movimentos de consumo; 45 reconhecimentos de venda; saldo recebido igual ao total em todos os pedidos. Caixa contado/esperado iguais, razão balanceado e estoques corretos no relatório da rodada. Comparação das entidades anteriores conferidas permanece igual. Critérios de pedido, cozinha, pagamento, estoque, isolamento/preservação e persistência: PASSAM neste ambiente.

Primeira tentativa `2026-10-10T14-48-54.359Z`: 45 pedidos foram servidos; três fechamentos receberam 400 porque a adaptação do **harness** usou cinco como módulo de uma lista de quatro meios de pagamento. Causa identificada no script; aplicação recusou o corpo inválido. Correção separou quantidade de garçons e quantidade de meios; repetição integral acima passou. Não foi defeito encontrado no código do produto. Os dois conjuntos sintéticos e os relatórios estão retidos na cópia local.

Evidências: `outputs/stress-15/2026-10-10T14-49-27.339Z/report.json`, `http.jsonl`, `reconnected-verification.json`; tentativa inicial no diretório homônimo de 14:48:54. Harness agora admite `STRESS_TABLES=15 STRESS_WAITERS=5 RUN_RETAINED_STRESS=15`; nesta execução `STRESS_REQUIRE_LOCAL=true` exige PostgreSQL via socket, e `work/local-qa-run.mjs` aponta aplicação e gerador para a cópia isolada. Padrão de 20 mesas/quatro garçons preservado.

A aplicação não foi alterada por este ensaio. NÃO TESTADO nesta rodada: browser simultâneo de cinco celulares, rede dos clientes, infraestrutura Vercel sob carga, hardware e provedores externos. Não executar a carga sobre o banco operacional para reproduzir estes números.

Testes adicionais PASSAM: `approval.integration.mjs` (aprovação, negativas, repetição, cancelamento e entrega); `checkout.integration.mjs` (três restaurantes, parcial/misto, Pix sem baixa automática e fechamento); `two-waiters.integration.mjs` (duas identidades disputam a mesma conta: um fechamento aceito, outro recusado, repetição sem duplicação); `payment-settlement.integration.mjs` (quatro confirmações simultâneas, caixa fechado, referência externa repetida e dados falsificados pelo cliente). Evidência via APIs reais e PostgreSQL isolado. Não foram detectados novos defeitos na aplicação nesses cenários.


## Auditoria pela interface — cinco garçons / quinze mesas

Contrato aprovado pelo usuário: abrir o site e operar o roteiro pelas telas, com cinco sessões independentes, cozinha e gestão; SQL apenas para preparar dados sintéticos e conferir persistência. Responsável: Codex, sem delegação. Aplicação compilada 936d344, banco PostgreSQL local isolado, fixture `qa-core-browser-9473b656`. Subdomínios g1–g5.localhost mantêm cookies independentes, todos mapeados ao mesmo restaurante de teste; cozinha/gestão/cliente usam origens distintas. Sem alteração de código da aplicação, produção, notas ou cobranças externas. Alterações anteriores do harness e relatório preservadas.

Aceite por etapa: login correto e permissões; três mesas por garçom; produtos/quantidades/adicionais/observações; envio e aprovação antes da cozinha; preparo/pronto/entrega; rodadas sobrepostas; parcial/misto/troco/Pix conferido manualmente; corrida de fechamento e recarga; gestão/estoque/caixa; preparação fiscal e pendências/exportação. Nenhuma duplicação, perda de pedido ou diferença financeira é aceitável. Evidência: estado renderizado, resultado gravado e recarga. PASSA/NÃO PASSA/NÃO TESTADO por etapa; distinguir defeito de produto, fixture e limitação da automação. Situação inicial: NÃO TESTADO.

### Resultado da auditoria pela interface — 10/10/2026

**Gate: NÃO PASSA integralmente.** O ciclo operacional e a persistência passaram no recorte executado; dois defeitos de interface foram reproduzidos. Não houve correção de aplicação nesta auditoria. Entrega para revisão do usuário, sem equivalência a homologação fiscal ou aceite de produção.

Ambiente: Chrome com cinco sessões de garçom em origens distintas, simultaneamente abertas; cozinha, gestor e cliente adicionais. Mesmo restaurante sintético `qa-core-browser-9473b656`, build `E5l4gRsRK_PDVZ-BA87ML` da aplicação `936d344`; HEAD `2d0aa1a` contém alteração documental. Next em `127.0.0.1:3100`; PostgreSQL 18 local via socket, sem escritas/carga na Vercel ou no Neon. As ações de operação foram cliques e formulários no navegador; nenhum pedido, aprovação, preparo, serviço, pagamento ou fechamento foi substituído por script de API. SQL usado somente na preparação sintética e na conferência posterior de persistência.

#### Percurso realmente executado

1. Entrar pela tela de equipe com Garcom QA 1–5, Cozinha QA e Gestor QA. As cinco sessões conservaram acesso independente. Garçom 3 tentou abrir diretamente a gestão fiscal e recebeu **Área não liberada**.
2. Gestor abriu caixa com R$100,00. Garçons distribuídos: 1 → mesas 01–03; 2 → 04–06; 3 → 07–09; 4 → 10–12; 5 → 13–15.
3. Três ondas de cinco envios pelas telas, com cliques de envio disparados conjuntamente por onda. Mesa 01 recebeu duas unidades de Prato QA, adicional Queijo extra QA e observação. As demais receberam pratos ou pizzas. Quinze pedidos numerados e persistidos, sem perda ou duplicação. As sessões ficaram abertas durante a produção e cobranças; não são cinco celulares físicos nem prova de capacidade máxima.
4. Cozinha confirmou preparo, marcou pronto; salão sinalizou retirada; garçons marcaram servido. Os quinze pedidos chegaram a concluído após pagamento. Mesa 01: R$50,60, pagamento parcial R$20,00 em dinheiro, recarga, saldo R$30,60 e QR Pix para esse valor; confirmação manual sintética. Mesa 06: R$13,00 Pix + R$20,00 dinheiro. Mesas 09 e 12: crédito/débito manuais; restantes Pix manual.
5. Conferência intermediária: quinze pedidos concluídos, R$416,00 de itens + R$41,60 de serviço = R$457,60 recebidos, 17 registros de pagamento. Estoques Pizza 191 e Prato 193, partindo de 200 cada; quinze movimentos consumiram dezesseis unidades. Pedido público #16 apareceu pendente, com zero tickets e sem consumo adicional, até aprovação pela gestão.
6. Pedido público de retirada #16 foi aprovado na gestão, preparado pela cozinha e recebido no caixa por R$20,00 em dinheiro. QR da mesa 01 abriu cardápio com número identificado. Nova rodada interna #17: prato + pizza, dois tickets. Só um setor pronto não habilitou servir; após ambos prontos o garçom recebeu a ação. Pedido do cliente pelo QR #18 ficou pendente, apareceu no salão e foi aprovado pelo Garcom QA 2. Cobrança da mesa foi bloqueada enquanto havia pendência: **Confira os pedidos pendentes antes de receber**.
7. Dois garçons abriram o fechamento de R$77,00 da mesa 01 antes de receber; houve tentativa de confirmação concorrente e repetição com cotação antiga. Uma sessão quitou os pedidos; banco conservou somente R$77,00 para #17/#18. Pagamento antes da entrega manteve os pedidos no atendimento; marcar servido liberou a mesa. A outra sessão conservou saldo antigo na interface — defeito abaixo.
8. Gestão/estoque e financeiro conferidos. Resultado gerencial rotulado parcial, com aviso de custos/taxas pendentes; adicional sem custo cadastrado não foi apresentado como custo completo. Cartões permaneceram a liquidar. Preparação fiscal agrupou #17/#18, registrou onze bloqueios e manteve envio desabilitado. Nenhuma operação externa criada. Clique no pacote do contador gerou evento `exported` no servidor, mas arquivo baixado/conteúdo ZIP não foi comprovado pelo navegador.
9. Gestor contou R$160,00, fechou caixa e recarregou. Cozinha vazia e mesa 01 livre permaneceram após recarga; banco confirmou dezoito pedidos concluídos e caixa sem diferença.

#### Inconsistências confirmadas

**UI-01 — P1: adicionais não aparecem na cozinha. NÃO PASSA.** Pedido #5 tinha duas unidades e adicional Queijo extra QA, visível no carrinho/comanda e persistido em `order_items.addons`. O cartão da cozinha mostrou produto, quantidade e observação, mas omitiu o adicional, inclusive após confirmar preparo. Consequência: cozinha pode preparar sem um ingrediente pago pelo cliente. `components/kitchen-board.tsx:12` renderiza nome/variação/quantidade/observação, sem adicionais. Corrigir transporte/renderização conforme necessário, mantendo observações e separação por setor. Regressão exigida: pedido com adicionais diferentes em dois itens, conferência no cartão e após recarga.

**UI-02 — P1: fechamento mantém saldo antigo quando outro garçom recebe. NÃO PASSA na interface; integridade financeira PASSA.** Duas sessões abriram R$77,00 da mesma mesa. Após uma receber, a outra atualizou o resumo dos pedidos para recebido R$55,00 + R$22,00, mas manteve formulário e confirmação de R$77,00; ao servir os pedidos o resumo ficou vazio e a cobrança antiga permaneceu. Repetição não criou pagamentos extras. Foi necessário fechar o modal e clicar **Atualizar saldo** para mostrar **Não há saldo a receber**. Mecanismo no código: `components/account-checkout.tsx:29` carrega cotação na montagem, enquanto o resumo usa estado atualizado; tratamento de falha em `receive()` não invalida automaticamente cotação/modal. Corrigir sincronização/invalidação e mensagem persistente ao detectar conta alterada, preservando chave idempotente e tratamento de resposta incerta. Não apagar a intenção em falha de rede desconhecida. Regressão exigida: dois garçons, conta alterada/paga por outro, QR e modal invalidados, nenhum segundo recebimento.

#### Melhorias de operação, sem classificá-las como falha financeira

- **Aprovar na própria comanda:** pedido pendente aparece no detalhe somente com Cancelar; a aprovação fica no salão. Adicionar acesso direto à conferência reduz idas e voltas e evita chegar ao fechamento bloqueado sem saber onde resolver.
- **Detalhar adicionais no resumo de cobrança:** o total de #5 incluiu corretamente os R$6,00 de adicional, porém o resumo de fechamento mostrou apenas `2× Prato QA · Individual` por R$46,00. Discriminar adicional ajuda o cliente a conferir o valor.
- **Prioridade fiscal de produto:** serviço de mesa e origem QR constaram como bloqueios do mapeamento atual, além dos cadastros faltantes. Não basta receber CNPJ/certificado para esses casos: é necessário completar e validar o tratamento com contador/provedor antes de anunciar emissão integral. O bloqueio observado é a proteção esperada, não homologação concluída.
- **Pacote do contador:** evento de exportação persistiu; falta evidência de arquivo recebido e aberto. Repetir download em navegador/dispositivo do piloto e conferir índice, pendências e arquivos autorizados reais quando existirem.

#### Gate por critério

| Critério | Estado | Evidência / limite |
|---|---|---|
| Login e cinco sessões de garçom | PASSA | Cinco logins pela tela; quinze mesas, três por garçom |
| Bloqueio visual de acesso fiscal para garçom | PASSA | URL direta mostrou Área não liberada; não substitui auditoria completa de todas as APIs/perfis |
| Pedido, quantidade e observação | PASSA | Carrinho, comanda, cozinha e banco; adicional preservado no pedido |
| Informação completa para produção | NÃO PASSA | UI-01: adicional ausente na cozinha |
| Aprovação de cliente antes da produção | PASSA | #16 pendente com zero tickets; #18 aprovado pelo garçom; cozinha somente após aprovação |
| Preparo, dois setores, pronto e entrega | PASSA | #17 exigiu os dois setores; pronto apareceu no salão; serviço persistido |
| Quinze mesas / ondas sobrepostas / nova rodada | PASSA | 15 pedidos iniciais + #16–18; nova abertura da mesa 01 sem trazer conta anterior |
| Parcial, misto, Pix e cartões manuais | PASSA | Parcial com recarga, misto, QR sem baixa automática, quatro meios registrados |
| Troco com valor entregue superior ao saldo | NÃO TESTADO | Não houve pagamento excedente nesta rodada de navegador |
| Concorrência e repetição de fechamento | NÃO PASSA no UX | Banco sem recebimento duplicado; UI-02 manteve cotação antiga |
| Estoque, financeiro e caixa | PASSA | Conferência independente de valores, consumo, razão e fechamento; não cobre compras/recorrências nesta rodada |
| Persistência após recarga e nova conexão | PASSA | Saldo parcial, mesa livre, cozinha vazia, caixa fechado e SQL final |
| Preparação fiscal e bloqueios | PASSA | Um documento agrupado, onze bloqueios, `operation_id=null` |
| Download e conteúdo do pacote contador | NÃO TESTADO integralmente | Clique e evento `exported` confirmados; arquivo no cliente não comprovado |
| Focus/SEFAZ, banco Pix e maquininha externos | NÃO TESTADO | Nenhuma emissão/cobrança externa; não homologados por este ensaio |

#### Evidências finais e limites

`outputs/browser-audit/final.json`, conferido por nova conexão somente leitura: **18 pedidos concluídos**, **19 tickets**, **20 registros de pagamento**, **R$554,60 recebidos** = R$506,00 de itens + R$48,60 de serviço. Meios: dinheiro R$60,00; Pix R$428,60; crédito R$33,00; débito R$33,00. Caixa: abertura R$100,00 + dinheiro R$60,00 = contado/esperado R$160,00. Estoques: 190 unidades de cada insumo; dezenove movimentos, vinte unidades consumidas. Zero lançamentos desequilibrados e zero saldo de vendas a receber. Documento fiscal de dois pedidos em homologação, sem operação externa; eventos prepared/exported uma vez cada.

Snapshots SQL intermediários: `before-public-approval.json`, `after-checkout-race.json`, `before-shift-close.json`; conferidor local `work/browser-audit-verify.mjs`. Diretórios de evidência/fixture ignorados pelo Git, sem PIN/cookie nos relatórios versionados. Dados sintéticos preservados; aplicação e Postgres de QA serão encerrados ao terminar, sem apagar a cópia.

Ocorrências da automação: servidor local precisou ser reiniciado antes dos lançamentos; algumas ações rápidas em modais atingiram limite da ferramenta. Estado visível foi conferido antes de retomar, sem interpretar timeout do clique como erro HTTP da aplicação. O primeiro conferidor SQL leu a chave incorreta da fixture (`rid` em vez de `id`), retornou vazio e foi corrigido antes de qualquer conclusão; artefato intermediário refeito. Aguardar download expirou em dez segundos, apesar do evento de exportação no servidor. Não inferir falha do ZIP somente desse limite.

Limites: não mediu cinco dispositivos físicos, impressão, visual mobile, turno prolongado, perda de internet, Vercel/Neon sob carga, cancelamento/estorno, estoque insuficiente, compras, recorrências, importação fiscal, troco excedente, matriz completa de permissões/isolamento ou integrações externas. Os testes anteriores de API são evidência separada e não foram reclassificados como browser. Não há garantia de “100%”; recomenda-se corrigir UI-01/UI-02, repetir os dois cenários e completar os itens não verificados antes do piloto operacional.

### Correção UI-01/UI-02 e nova rodada — contrato de execução

Autorizado pelo usuário após revisão da auditoria: corrigir os dois defeitos e procurar novas falhas com regressão e estresse. Responsável Codex, sem delegação. Escopo: preservar adicionais do snapshot histórico na consulta/tela de cozinha; invalidar saldo, QR e confirmação antigos quando a conta mudar; conservar a intenção idempotente quando houver resposta incerta. Inclui detalhamento de adicionais no fechamento como consumidor direto. Não altera tributos, permissões, estoque, preço, migrações ou integrações externas. Aprovação dentro da comanda permanece melhoria separada.

Aceite: (1) itens iguais com adicionais/observações distintos chegam separados à cozinha e persistem após recarga; proibido misturar adicionais ou expor dados de outro restaurante; (2) pagamento/novo pedido em outra sessão atualiza ou bloqueia imediatamente a cotação quando o snapshot da conta muda, retira QR e fecha confirmação; proibido usar saldo conhecido como antigo; (3) confirmação concorrente/repetida não duplica recebimento e resultado incerto conserva chave/corpo originais; (4) fluxo completo, parcial/misto/troco, negativa de aprovação/estoque e carga local conferidos no banco. Ambiente exclusivamente local isolado com dados sintéticos. API e navegador serão registrados separadamente. Publicação e aceite do usuário não são presumidos pelo teste local. Resultado inicial: NÃO TESTADO.

#### Resultado da correção e regressão — 10/10/2026

**UI-01 e UI-02: PASSA no recorte local executado.** Base HEAD `2d0aa1a` + alterações locais não commitadas; build Next `3Hqj_TsPA1wzgn3y0yRmO`, porta 3100, PostgreSQL 18 via socket isolado. Nenhuma migration, chamada externa, push ou publicação nesta rodada. Relato anterior preservado acima como evidência antes da correção.

Implementação: a consulta e o cartão da cozinha transportam/renderizam os adicionais históricos de cada item. O fechamento também os discrimina. O checkout observa identidade, total, recebido e pendência dos pedidos ativos; mudança invalida formulário/QR/confirmação e busca nova cotação. Mudança apenas de preparo não descarta os valores digitados. Erro conclusivo de pagamento recarrega a cotação; resposta desconhecida conserva o corpo/chave da intenção para repetição idempotente, sem liberar edição da cobrança.

**Navegador real, quatro sessões:** Garcom QA 1, Garcom QA 2, Cozinha QA e Gestor QA, logados pela tela. Não se repetiram as quinze mesas da rodada anterior via navegador; esta regressão acrescentou três pedidos (#19–21) na mesa 01, além da carga maior por API descrita abaixo.

- #19: dois Prato QA separados, um com Queijo extra QA/observação A e outro sem adicional/observação B. Carrinho, cozinha após recarga e fechamento mostraram a associação correta. Total R$47,30.
- Dois garçons abriram a mesma cotação. Garçom 1 manteve confirmação de R$47,30 aberta; garçom 2 recebeu R$10,00 Pix manual sintético. Sem recarga manual, a primeira sessão fechou a confirmação, mostrou aviso e saldo R$37,30.
- Garçom 1 exibiu QR de R$37,30; garçom 2 lançou #20 (pizza, R$33,00 com serviço). A primeira sessão removeu o QR e recalculou R$70,30. Preparo/entrega prosseguiram sem apagar a edição do pagamento. Entrada de R$100,00 em dinheiro mostrou troco R$29,70; persistiu R$70,30 líquido. Ambos os pedidos terminaram entregues/quitados e mesa livre após recarga. Caixa abriu com zero e fechou esperado/contado R$70,30, diferença zero.
- #21: nova conta de R$22,00. Garçom 1 deixou confirmação aberta; garçom 2 quitou via Pix manual antes do preparo. A primeira sessão fechou automaticamente o modal e exibiu **Não há saldo a receber**, sem botão para confirmar valor antigo. A cozinha ainda preparou e o garçom entregou normalmente. Novo caixa zero fechou zero, sem incorporar o Pix ao dinheiro físico.

Conferência independente somente leitura: `outputs/browser-audit/after-fixes-final.json`. **21 pedidos concluídos**, incluindo os dezoito anteriores preservados exatamente; três novos pedidos somaram **R$102,30** recebidos (R$70,30 dinheiro + R$32,00 Pix). Estoque final Prato 187 e Pizza 189; antes desta regressão havia 190 de cada. Zero lançamentos desequilibrados; três caixas fechados sem diferença. Snapshot intermediário `after-fixes.json`; imagens `after-fixes-caixa.jpg` e `after-fixes-saldo.jpg` no mesmo diretório. Fixtures retidas; evidências locais ignoradas pelo Git.

**Carga e negativas via API, separadas da prova de interface:**

- `restaurant-stress.integration.mjs`: cinco identidades de garçom, vinte mesas, três ondas, sessenta pedidos, 120 tickets, R$3.080,00 quitados, zero erros HTTP, estoque e razão corretos, outros restaurantes preservados. Pico observado 23 requisições simultâneas. Criação por garçom p95 295 ms (máximo 330 ms); pagamento final p95 270 ms (máximo 307 ms). Evidência retida `outputs/stress-20/2026-10-10T16-35-04.047Z/report.json` e `http.jsonl`. Mede este cenário local, não capacidade máxima nem latência de Vercel/Neon.
- `checkout.integration.mjs`: PASSA. Parcial, misto, troco, setores, entrega, cotação antiga e repetição. Nova regressão altera o nome do adicional no catálogo após a venda e consulta a cozinha duas vezes: snapshot original, preço, quantidade e observações permanecem associados ao item correto.
- `approval.integration.mjs`: PASSA. Pedido público pendente sem cozinha/estoque, autorização, aprovação concorrente, rejeição, custo histórico, cancelamento preparado e revogação de sessão.
- `two-waiters.integration.mjs`: PASSA. Mesas distintas e mesma mesa, requisições sobrepostas, disputa de quitação com uma resposta 200 e outra 400, replay sem pagamento extra e razão equilibrado.
- `order-concurrency.integration.mjs`: PASSA. Três ondas de vinte criações/aprovações simultâneas. Nova negativa disputa uma única unidade entre duas intenções: uma criação 201 e uma rejeição 400; estoque zero, sem pedido parcial. Aprovação pública posterior sem estoque mantém pedido pendente, sem ticket ou financeiro adicional. Primeiro ensaio do teste novo esperava erroneamente 200 em criação; corrigido para o contrato 201 e executado novamente com sucesso. Não foi defeito da aplicação.
- `payment-settlement.integration.mjs`: PASSA. Quatro confirmações concorrentes de evidência sintética resultam em uma baixa; identidade externa duplicada, conta cancelada, provedor pendente, caixa fechado, perfil/tenant incorretos e evidência forjada pelo cliente não produzem recebimento indevido. Não envolve banco/maquininha real.
- `tenancy.integration.mjs`: PASSA. Domínio desconhecido, cookie de outro restaurante, produto/escrita cruzados e restrições do plano no backend.
- Build e typecheck: PASSA. Lint sem erros; três avisos preexistentes em `inventory-management.tsx` e `management-tables.tsx`.

| Critério desta correção | Estado final | Limite |
|---|---|---|
| Adicionais separados e históricos na cozinha | PASSA | Navegador + recarga + regressão de API com alteração posterior de catálogo |
| Pagamento parcial/total por outra sessão | PASSA | Saldo recalculado ou sem saldo; confirmação antiga descartada |
| Novo pedido durante QR aberto | PASSA | QR removido, saldo atualizado antes de nova cobrança |
| Repetição/concorrência sem dinheiro duplicado | PASSA | API com identidades distintas e SQL após navegador |
| Resposta de rede perdida após pagamento | NÃO TESTADO na interface | Preservação de intenção revisada no código; replay testado na API, sem injeção de queda no navegador |
| Preparo, entrega, troco, caixa e persistência | PASSA | Novos pedidos #19–21 e conferência independente |
| Última unidade/estoque insuficiente | PASSA | API local; efeito recusado sem vazamento para cozinha/financeiro |
| Pacote do contador no dispositivo | NÃO TESTADO integralmente | Nova espera de download expirou em 15 s; não prova falha da aplicação nem sucesso do arquivo |

**Melhorias/pontos restantes:** repetir o troco também no modal final de confirmação em dinheiro (hoje correto na etapa anterior e no banco); aprovação diretamente na comanda continua melhoria separada. Permanecem as lacunas fiscais e de homologação descritas acima. Não foi identificado novo erro de integridade no recorte concluído. Queda de internet, turno prolongado, dispositivos físicos/mobile, impressão, arquivo ZIP recebido no cliente e provedores externos continuam sem prova nesta rodada. Mudanças locais prontas para revisão; aceite do usuário e publicação pendentes. Reversão do patch é somente de código, sem alteração de schema/dados reais.

### Fechamento das três pendências e publicação — contrato de execução

Usuário autorizou troco no modal, teste do download fiscal, perda de conexão em pagamento e, condicionados ao sucesso, commit/push. Responsável Codex. Preservar cálculo/baixa, permissões, isolamento e intenção idempotente; não alterar schema ou integrações externas. Aceite: modal discrimina valor entregue, troco e líquido; ZIP baixado pela interface abre com CRC válido, índice e pendências compatíveis com o tenant; perda antes do processamento não recebe e perda depois de gravar não duplica ao repetir. Conferir UI, chave/corpo repetidos e SQL em fixture local; nunca induzir falha em produção. Publicação autorizada das correções acumuladas com commits por assunto; verificar SHA/deploy e fluxo público seguro depois. Resultados e limites serão registrados abaixo.

#### Evidências de fechamento — 10/10/2026

Build final local `-fMDSrIbNjRzQTcUSiTik`, PostgreSQL isolado, Chrome/Vivaldi com sessões de garçom/cozinha/gestão. **PASSA nos três critérios**, com assistência do usuário no download. Sem migrations ou chamadas a Focus/bancos. Testes não equivalem a emissão fiscal homologada.

1. **Troco no modal — PASSA:** conta de R$22,00, valor entregue R$50,00, troco R$28,00 e líquido R$22,00 visíveis na confirmação. Repetido para saldo R$23,00: R$50,00 entregue, R$27,00 troco e R$23,00 aplicado. Só o líquido entrou no caixa. Imagens em `outputs/payment-network/troco-confirmacao.jpg` e `troco-recuperacao-final.jpg`.
2. **ZIP fiscal baixado — PASSA com assistência:** Vivaldi bloqueou/aguardou a navegação de download (`ERR_BLOCKED_BY_CLIENT`); o painel interno de downloads é inacessível à ferramenta. Nenhuma proteção foi desativada. Usuário confirmou o salvamento e forneceu `fiscal-homologacao (1).zip`. Arquivo de 3.979 bytes, SHA-256 `fbe30d5f0f64645b3f0f47461f252a838d19615bd228f81caab9babd450143b2`, CRC íntegro. `LEIA-ME.txt` informa homologação/sem validade fiscal; `indice.json` contém um documento de R$77,00, onze bloqueios e dezoito vendas sem preparação. Conteúdo corresponde ao snapshot até #20, anterior aos novos pedidos deste ensaio; não foi apresentado como exportação das vendas posteriores. Ausência de XML é correta para a preparação bloqueada. Cópia e relatório em `outputs/fiscal-download/`. Link recebeu atributo `download` explícito. Teste de API fiscal também passou com XML sintético, acesso autorizado e negativas por perfil/restaurante. XML autorizado real e transmissão externa continuam fora desta validação.
3. **Conexão perdida — PASSA:** proxy local `tests/helpers/payment-fault-proxy.mjs`, exclusivamente 127.0.0.1:3101 → 3100; só interrompe POST de pagamentos. Primeiro ensaio consumiu resposta 200 da aplicação e cortou o corpo antes de chegar ao navegador: pagamento #22 persistiu R$22,00; repetir a intenção recuperou resultado sem outra baixa. Segundo ensaio cortou antes do encaminhamento: parcial R$10,00 de #23 não criou pagamento; recuperação registrou uma vez, saldo R$23,00. Terceiro ensaio, na versão final, cortou após gravação dos R$23,00 restantes com troco; recuperação retornou o resultado original, sem repetir baixa/razão.

O ensaio de rede expôs orientação escondida atrás do modal e mensagem técnica em inglês. Correção: explicação em português também no modal, botão **Recuperar resultado**, instrução para não cobrar nem devolver troco novamente e rótulo **Saldo da confirmação original** enquanto o resultado é incerto. Campos, atualização de saldo e saída continuam bloqueados durante a intenção incerta. Não muda a chave/corpo de repetição.

Proxy registra apenas hashes de corpo/chave, status e evento, nunca cookie ou PIN. `outputs/payment-network/requests.jsonl` comprova três intenções distintas, cada uma repetida com corpo/chave idênticos; snapshots antes/depois e `assertions.json` confirmam ausência de baixa duplicada. Novos #22/#23 somam R$55,00: dinheiro R$45,00 + Pix R$10,00. Caixa abriu zero, fechou esperado/contado R$45,00 e diferença zero. Produção/entrega encerradas; dados sintéticos preservados. Recuperação foi testada mantendo a aba/sessão aberta: recarga/fechamento da aba durante a intenção incerta, indisponibilidade prolongada e dispositivos físicos continuam fora do recorte.

Verificações da versão final: build/TypeScript PASSA; lint sem erros, os mesmos três avisos preexistentes; `checkout.integration.mjs` e `fiscal.integration.mjs` PASSA. Alterações de cozinha, checkout e testes da rodada anterior integram a publicação autorizada. Reversão é por código, sem schema; preservar correções de integridade ao preparar eventual hotfix. Estado de publicação será registrado após confirmação remota.

**Publicação confirmada:** commits `235be8e` (adicionais na cozinha), `ee1806c` (checkout/recuperação/download) e `0bbe822` (regressões e evidências) enviados para `github/main`. SHA remoto `0bbe822d0a094d977361a8807bd1bf21f2b8ad32` confirmado. Deploy de produção `dpl_FYd7bDSFREmbJEXtw2FrZamg3aR9` atingiu **READY**, alias `gest-o-de-restaurantes-opal.vercel.app`, sem erro de alias. Smoke público: `/api/health` respondeu `ok=true,database=connected`; navegador exibiu entrada da equipe e exigiu autenticação ao acessar caixa; exportação fiscal sem sessão respondeu 403. Sem recebimentos, exportação autenticada ou injeção de falha em produção. A evidência ponta a ponta dos fluxos alterados é local; o gate publicado é de versão, disponibilidade e proteção de acesso. Este registro documental posterior não altera a aplicação.


## Auditoria da atualização fiscal e visual — 5 garçons / 15 mesas

Contrato: execução Codex, sem delegação, base 5ff6dbe + alterações locais fiscais/visuais. Testar em PostgreSQL 18 isolado e aplicação local em modo produção. Cinco identidades em domínios locais separados, três mesas por garçom; pedidos, adicionais, cozinha, entrega, recebimentos, caixa, financeiro e preparação fiscal. Preservar aprovação obrigatória, isolamento, cálculos e efeitos únicos. Proibido emitir nota real, cobrar externamente ou aplicar carga em produção.

Aceite: mesas vazias → pedidos pela interface → cozinha correta, sem duplicidade; cozinha → pronto → entregue, sem servir antes da hora; contas → pagamentos → encerradas, sem saldo/razão divergente; recarga → estado persistido; gestão → financeiro/fiscal → leitura e exportação sem falha. Complementar com testes de concorrência, estoque, permissões e recuperação pela API. Estado inicial: NÃO TESTADO nesta versão. Evidências locais em outputs/audit15 e relatório abaixo.

Commit/push autorizados somente após os gates relevantes passarem; conferir migration 0018 e versão publicada. Reversão: parar QA sem apagar evidências; código anterior compatível com schema aditivo, preservar histórico fiscal e não habilitar provedores. Aceite do usuário posterior, separado dos testes e publicação.

### Resultado da auditoria — 10/10/2026

**PASSA no fluxo operacional e na integridade dos dados auditados.** Cenário real de interface executado no Chrome, sete sessões isoladas por hostname: cinco garçons, cozinha e gestão. Restaurante sintético `qa-core-audit15-b77df379`, PostgreSQL 18 local porta 55435, Next.js compilado em modo produção porta 3100. Não foi aplicada carga na Vercel ou no Neon.

- Cada garçom registrou três pedidos em três mesas distintas pela interface. Primeira rodada: prato + queijo e observação individual; segunda: duas pizzas com observação; terceira: prato simples. **15 pedidos, 15 mesas, 20 unidades**, quinze aprovações pela identidade correta e quinze tickets, com adicionais/observações preservados.
- Cozinha confirmou todos os preparos e marcou todos prontos; os cinco garçons viram os avisos, marcaram servido e receberam. Cada mesa ficou livre após recarga; zero erro de console capturado nas seis sessões operacionais.
- Vendas **R$566,50** (produtos R$515,00 + serviço R$51,50). Dinheiro R$110,00, Pix manual R$330,00, débito R$75,90 e crédito R$50,60. Cinco pagamentos em dinheiro receberam R$30,00 para saldo R$22,00 e mostraram troco R$8,00 no modal. QR exibido nas cinco contas de pizza sem baixa automática; cartão explicitamente manual.
- Caixa abriu R$100,00 e fechou esperado/contado **R$210,00**, diferença zero. Estoque de cada insumo caiu de 200 para 190; nenhum lançamento desequilibrado. Conferência SQL em conexão independente e recarga das cinco sessões. `outputs/audit15/persisted.json`, imagens `salao-15-livres.png` e `financeiro-final.png`.
- Financeiro: oito seções acessíveis, dados consistentes após recarga, menu desktop abre e recolhe, sem falha de fetch observada. R$440,00 de recebimentos líquidos em caixa/banco excluem R$126,50 de cartões ainda a liquidar; R$515,00 de receita excluem o serviço.
- Fiscal: quinze vendas disponíveis; duas contas diferentes recusadas com mensagem explícita. Uma venda de R$22,00 preparada, preservada com cinco pendências cadastrais/tributárias e envio desabilitado. Sem operação externa e sem nova receita/recebimento.
- Pacote do contador: endpoint autenticado retornou ZIP HTTP200, CRC íntegro, índices JSON/CSV e aviso de incompletude coerente (uma preparação e catorze vendas restantes, sem XML real). SHA256 `eae30c78c75855145de2eadec902a829cbb6f1a856a193ccdac9381cb3b1ada3`. O salvamento pelo navegador nesta sessão **NÃO FOI CONFIRMADO**: duas esperas de download expiraram sem erro de console ou novo arquivo; não se alteraram proteções. A exportação pela API passou e o salvamento pela interface havia sido validado na revisão visual anterior (`outputs/fiscal-activation/`), mas isso não substitui esta limitação.

**Concorrência por API, evidência separada do navegador:** cinco garçons / quinze mesas / três ondas, 45 pedidos concluídos, 90 tickets, R$2.343,00 recebidos, zero erro HTTP, estoque e razão corretos, caixa R$584,00 sem diferença. Registros alheios ao cenário preservados. Criação p95 224 ms; aprovação p95 196 ms; recebimento final p95 208 ms. Medição local curta, não capacidade da infraestrutura publicada. Evidência `outputs/stress-15/2026-10-10T18-12-04.611Z/`.

**Regressões PASSAM:** aprovação, entrega/delivery, financeiro, tenancy, checkout, ponte de liquidação, concorrência de pedidos, dois garçons, planejamento/compras, fiscal, processamento fiscal, readiness fiscal, testes unitários de planejamento/fiscal/readiness/Pix e base de integrações. Incluem 60 aprovações/criações simultâneas em três ondas, última unidade de estoque, recebimento concorrente/repetido, permissões, títulos/parcelas/compras, timeout fiscal com consulta em vez de reenvio e arquivo cancelado de competência anterior. Transportes Focus simulados; nenhuma homologação externa alegada. Na build final repetidos checkout e readiness fiscal; ambos PASSAM. Build e TypeScript PASSAM; lint sem erros e três avisos preexistentes.

**Achado corrigido:** texto de sucesso sugeria entregas pendentes mesmo em mesa já servida. Ajustado para condicional (“Se houver entregas pendentes…”), preservando baixa e troco. Verificado em build e regressão de checkout; a rodada visual integral antecede apenas esta alteração textual. O harness de concorrência ganhou porta local configurável para não depender de 55433. Dois problemas de preparação do ensaio não foram bugs do produto: domínio 127.0.0.1 ausente no banco local em modo produção (mapeamento sintético adicionado) e cliques encadeados durante transição de modal (repetidos após conferir o estado, sem duplicar pedidos).

**NÃO TESTADO nesta rodada:** turno de muitas horas, dispositivos físicos, impressão, queda de internet no navegador (já coberta no ensaio anterior; idempotência repetida agora), emissão Focus/SEFAZ real, Pix automático e maquininhas. Tentativa de viewport móvel não alterou a largura efetiva da aba de gestão; não foi contada como teste mobile e o override foi removido. A revisão visual anterior contém evidência mobile própria.

**Migração de publicação:** backup `outputs/backups/pre-0018-audit15-20261010.dump`, legível integralmente por pg_restore; migration 0018 aplicada pelo runner versionado. Contagens e hashes normalizados de pedidos, pagamentos, lançamentos/linhas financeiras, documentos/vínculos fiscais idênticos antes/depois. Não houve ativação de integração. Evidências `live-before.json`, `live-after.json` e `migration-live.log`. Reversão de código pode preservar o schema aditivo; não apagar histórico fiscal. Estado do commit/deploy será conferido separadamente. Aceite do usuário permanece posterior.

**Repetição após push:** commit de aplicação `aa918c1e872a71d8d156279bfd89b8c0397159b7`, cinco garçons/quinze mesas/três ondas: PASSA, mais 45 pedidos/90 tickets, zero erro HTTP, R$2.343,00 recebidos, caixa R$584,00 sem diferença, estoque/razão/preservação PASSAM. Pico 18 requisições HTTP sobrepostas. Rodada `outputs/stress-15/2026-10-10T18-23-53.722Z/`. Checkout repetido no código enviado também PASSA. Não se trata de carga aplicada à produção.

**Publicação confirmada:** commits `f74f204` (fiscal) e `aa918c1` (interface e auditoria) enviados a `github/main`; SHA remoto `aa918c1e872a71d8d156279bfd89b8c0397159b7`. Deployment `dpl_Co8MUs9yvsvruvb7QNWCkPPMTeGe` **READY**, alias `https://gest-o-de-restaurantes-opal.vercel.app`, status GitHub success. Após READY, smoke às 18:25:52 UTC confirmou health/banco, cardápio público, negativas sem sessão e leituras autenticadas de operação, financeiro, fiscal nos dois ambientes e integrações. Emissão Focus desabilitada nos dois ambientes. Navegador abriu produtos demonstrativos do cardápio publicado. Não se criaram vendas/pagamentos/documentos reais nessa conferência. `outputs/audit15/public-smoke.json` e `deploy-after.log`. A listagem de deploy pelo conector retornou 403; CLI autenticada no mesmo projeto/equipe confirmou o estado. Este registro documental posterior não altera a aplicação.
