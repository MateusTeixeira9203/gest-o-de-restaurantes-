---
projeto: Restrio
tipo: relatorio-qa
data: 2026-10-28
estado: vigente
---
# Restrio · matriz de QA por mudança

Preparação concluída; produto não executado nem validado. Roteiros e harness em `tests/qa/` na branch `feat/restrio-etapa-a`. Evidências futuras: `C:\Users\mateu\Desktop\Evidencias\Restrio\<item>\`. Fontes: [[decisoes/paralelizar-beta-2026-10-28]], [[decisoes/plano-de-execucao-2026-10-27]], [[decisoes/c1-a8-e-fases-6-7-8-2026-10-27]] e [[decisoes/regra-de-design-restrio-2026-10-27]].

## Mudou X → roda Y

| Mudança | Camada e verificação |
|---|---|
| Todo commit | N0: tipos, lint e testes locais do que mudou; build no portão P1 antes do Revisor. Testes com banco só após liberação e conferência de alvo |
| A0/texto; A4/CSS/tokens | N1: telas tocadas antes/depois, cinco larguras, três marcas; A4 cobre públicas e logadas; regra de cor não altera dado |
| A1/cozinha; A12-prep/código/confirmedAt | N1 A1-01..06: canais, códigos, setores, atraso/clock30s, estados, ações, API sem dados de consumidor; PD completo |
| A2/entregador/courier | N1 A2-01..06: Prontos, contagens, tel/Maps sem navegação, saiu/entregue, não pago e papéis; PD completo |
| A3/pedido/menu/caixa/taxa/troco | N1 A3-01..09: três canais, 6300/3700, 400 sem escrita, idempotência concorrente, mesa/público/QR, matriz por papel; só após 0019 aprovada/aplicada |
| A5/plano; A6/financeiro | N1: Essencial com orientação e API protegida; CSV idêntico no mesmo período; textos novos e capturas das telas tocadas |
| A8/login/team | N1 A8-01..07: 404 sem lista, nome digitado/case, erro uniforme, 11a tentativa429, seis destinos, sessão/origem, estados e PD |
| Fim da Etapa A | N2 A7: fluxo completo nos seis papéis em390/tablet; N0/build, integration/fiscal auditados e liberados uma vez no commit final; baseline e limpeza exata |
| Segurança/tenant/contrato/SQL/FK | N3 sob gatilho: isolamento real entre dois tenants com escopo autorizado, revisão das rotas/SQL, sessão expirada, repetição e concorrência; trava Cantina não é contornada |
| Regressão visual ampla/PDF/estresse/toque | N3 sob demanda: design-review do Revisor, exportações, estresse autorizado e aceite físico do usuário. PD das telas tocadas continua obrigatório em N1 |
| Nenhum fluxo mudou | N0 basta; não repetir N1 aprovado sem mudança do fluxo |

## Dependências e limites

Usuário/responsável confirma alvo do servidor e libera execução; fornece login sintético por ambiente ou sessão no portal; nunca agente lê arquivo de PIN/.env.local. A3 espera confirmação da0019. Isolamento entre dois restaurantes precisa escopo próprio. Playwright/Chromium ainda precisam estar disponíveis para capturar; nenhuma dependência foi instalada. Integrações existentes exigem auditoria da limpeza antes de rodar, pois helpers atuais criam/removem restaurantes inteiros. Nota de preparação não é PASSOU do produto.

Falha vira harness ou produto com prova, cenário e commit. Retestar só o fluxo corrigido; N2 uma vez no commit final. Capturas, JSON e logs ficam fora do cofre; relatório curto linka caminhos. QA não corrige produto nem commita.

## Registro de mudanças

2026-10-28 · BETA - QA · preparação anterior ao código: roteiros A1/A2/A3/A8/A7, manifesto sintético offline, travas de alvo e captura do PD; telas públicas e destinos dos seis papéis. Somente arquivos novos em tests/qa; sem commit. Copiar esta nota para Projetos/Gestor-Food/log/2026-10-28-matriz-qa-restrio.md pelo Orquestrador se o sandbox negar escrita no cofre.
