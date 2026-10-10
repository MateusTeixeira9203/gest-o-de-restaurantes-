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
