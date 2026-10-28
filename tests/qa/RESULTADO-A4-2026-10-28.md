PASSOU — harness e matriz de capturas. Não é aprovação integral do produto nem do portão de design.

TAREFA: linha de base após A4 / GF-023; roteiros antecipados de tests/qa
STATUS: concluída com pendências de cobertura explicitadas abaixo
RESUMO: 195 PNGs gerados, 180 válidos e 15 excluídos por rota incorreta do harness. Oito telas obrigatórias cobertas nas cinco larguras e três marcas. Equipe sintética própria, espera de 2,5 s, limpeza exata comprovada também em falha.

## Critério → resultado → evidência

| Critério | Resultado | Comando e saída nesta sessão |
|---|---|---|
| Público, hub logado, cardápio, gestão, salão, cozinha, entregas, caixa | PASSOU nas telas listadas | `node tests/qa/run-a4-baseline.mjs`, mais rodada `QA_CAPTURE_SUPPLEMENT=1`: 165 + 30 imagens; `node tests/qa/summarize-a4.mjs`: 180 capturas válidas, matriz 8 × 5 × 3 conferida |
| 360/390/430/1280×800/1440×900; padrão/vermelha/amarela | PASSOU | Agregador verifica cada combinação e existência do PNG; marcas #C0262D/#F2C230 apenas no browser, texto branco/#111111 |
| Console, HTTP e rolagem lateral | PASSOU nas navegações capturadas | Agregador: overflow 0, consoleErrorsAndWarnings 0, failedHTTP 0; URLs finais e HTTP 200 conferidos |
| Contraste evidente | PASSOU na amostra, auditoria completa pendente | 135 amostras de botões visíveis, todas ≥4,5:1; mínimo observado 5,01:1. Não mede todo texto nem elementos em todos os estados |
| Equipe/logins reais de teste | PASSOU para cinco papéis suportados | manager/waiter/kitchen/cashier/delivery: login 200, sessão authenticated=true; gerente consulta equipe 200, demais 403 |
| Admin sintético | NÃO EXECUTÁVEL no contrato atual | `staff_members_role_check` e enum de `/api/operations/team` excluem admin. Gestão capturada como manager. Nenhum admin real, segredo administrativo ou sessão forjada foi usado |
| IDs exatos e limpeza, inclusive em falha | PASSOU | Três manifestos: staffRemaining=0, attemptsRemaining=0, exactIdsOnly=true. `QA_SIMULATE_FAILURE=1` encerrou intencionalmente com exit 1 após criar equipe e mesmo assim limpou tudo |
| Travas do harness | PASSOU | `node --test tests/qa/safety.test.mjs`: 3 testes, 3 pass, 0 fail, 0 skip |
| Sintaxe/lint dos scripts QA | PASSOU | `node --check tests/qa/run-a4-baseline.mjs`; `node node_modules/eslint/bin/eslint.js tests/qa/*.mjs`: exit 0 |
| Typecheck | PASSOU | `npx.cmd -y pnpm@10 typecheck`: tsc --noEmit, exit 0 |
| Lint do projeto | PASSOU com 3 avisos | `npx.cmd -y pnpm@10 lint` fora do sandbox: 0 erros; 2 no-unused-expressions em inventory-management.tsx:36/59 e 1 no-img-element em management-tables.tsx:20. Não são três avisos img, como descreve a linha de base do dossiê |
| Build | PASSOU com aviso | `npm.cmd run build`: Compiled successfully, TypeScript finalizado, 26/26 páginas, exit 0. Aviso DEP0205 module.register do Node 26.12.1 |
| Diff | PASSOU | `git diff --check`: exit 0. Nenhum arquivo de produto editado pelo QA |
| Portal da equipe | CONFERIDO parcialmente | `maestri portal snapshot 'R1 App'`: cardápio real em 390×835, produtos e categorias; logs vazios após logs-start. Capturas autenticadas feitas por Playwright/Edge em contextos isolados, não por sessão compartilhada do portal |

## Evidências fora do cofre

Raiz: `C:\Users\mateu\Desktop\Evidencias\Restrio\capturas-a4-2026-10-28\`

- `fcb3dd9f-ee86-45e3-a8a7-5b7fe4c0b172\manifest.json`: rodada principal, 165 PNGs; excluir os 15 `manager-_gestao_salao-*`.
- `8c9fb793-d95c-4bb6-82cb-c1c80b698d87\manifest.json`: suplemento, 30 PNGs de `/operacao` e `/gestao/mesas`.
- `3573ea60-10be-4b43-b283-bb7994dae948\manifest.json`: prova de limpeza na falha intencional; sem PNGs.

Inspeção visual feita em hub público 390, gestão 390, cozinha 1280×800, caixa amarelo 390 e entregas vermelho 390. Nenhum pedido foi criado; filas e caixa estavam vazios. Não chamar isso de validação de cartões populados, atraso, pagamento ou fluxo A7.

## Estado real das capturas

Branch `feat/restrio-etapa-a`. Não é uma fotografia isolada do commit A4 6682a2f:

- Principal iniciou em `68c2a3a` com A1 em `app/styles/cozinha.css`, `components/kitchen-board.tsx` e `tests/a1-kitchen.unit.mjs`; terminou em `62992b2`, com apenas `tests/qa/` sem commit.
- Suplemento iniciou e terminou em `62992b2`, apenas `tests/qa/` sem commit.
- Manifestos incluem SHA-256 do diff e status inicial/final. O HEAD avançou concorrentemente; ao final das verificações estava em `9a4d082`, apenas `tests/qa/` sem commit. Não atribuir N0 e capturas a um único commit congelado.

## Falhas classificadas com prova nesta sessão

1. **Harness, resolvida:** rota inventada `/gestao/salao`. Esperado: mesas reais; obtido: seção inexistente. Reprodução: navegar para essa rota. Correção só do harness para `/gestao/mesas`; 15 imagens antigas excluídas e suplemento completo executado. Não bloqueia produto.
2. **Harness/ambiente, resolvida:** sandbox negou mkdir fora das raízes (EPERM) e npm/pnpm (EACCES). Execução autorizada fora do sandbox gravou as evidências; lint rodou. Build pelo mesmo script npm já instalado passou, sem instalar dependências.
3. **Produto, linha de base de A8 ainda não entregue:** contexto sem cookie, GET `/api/auth/team`. Esperado no A8-01: 404; obtido: 200. O teste não salva a lista retornada. Não é regressão atribuída a A4; levar para GF-027 e retestar depois da entrega.
4. **Harness/contrato, cobertura limitada:** não existe admin de staff no contrato atual. Esperado solicitado: fixture de cada papel; cinco papéis são possíveis, admin não. Prova: constraint registrada no manifesto e enum da API. Não alterar autenticação para viabilizar captura; falta cobertura admin.

Os roteiros A1/A2/A3/A8/A7 em ROTEIROS.md são cenários, não suítes automatizadas prontas. Executados nesta rodada: captura A4, safety, logins/sessões, permissões de leitura da equipe e A8-01 como prova anterior à implementação. Ações que criam pedidos/pagamentos, estados simulados, cronômetro, throttle e N2 A7 não foram executadas. A3 aguarda seu contrato/migração; não foi aplicada migração pelo QA. `test:integration` e fiscal não integram esta rodada de captura, e seus helpers não foram acionados.

RISCOS/PENDÊNCIAS: revisão humana das oito regras e nota ≥B por tela; contraste de todos os textos e triagem de alvos <44px (contagem inclui ferramentas Next); estados carregando/erro e filas populadas; admin; toque físico e aceite estético; roteiros de fases ainda não entregues. Não há resíduos das fixtures nem mudança de configuração da Cantina.

ARQUIVOS: novos `tests/qa/run-a4-baseline.mjs`, `summarize-a4.mjs`, este relatório; comentário de safety.mjs atualizado para refletir loader autorizado. Roteiros e matriz de preparação anteriores mantidos. Sem commit, migração ou edição de código de produto.

REGISTRO DE MUDANÇAS PARA O ORQUESTRADOR: 28/10/2026, cerca de 10:37–10:50 BRT · BETA - QA · baseline visual A4 e harness; telas públicas e logadas citadas acima; arquivos tests/qa; evidências externas nos três manifestos; sem commit QA. Registrar na nota GF-023 e linkar na nota BETA Visual; este terminal não escreve no cofre.

PRÓXIMO PASSO: Revisor revisar tests/qa e as capturas; Orquestrador incorporar os links ao portão de design e manter A8-01 como teste de aceitação de GF-027.
ESTADO SUGERIDO: M1-F1 | GF-023 baseline visual | capturas verificadas, revisão de design pendente; M1-F4 | GF-027 | A8-01 reproduzido antes da entrega.
