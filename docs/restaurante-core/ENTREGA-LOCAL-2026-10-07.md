# Gestor Food 0.2 — entrega local para validação

Data: 7 de outubro de 2026. Esta entrega é um MVP funcional ampliado, não a conclusão de todos os itens do manual. Aceite do proprietário, emissão fiscal real e publicação continuam pendentes.

## Como abrir

Na pasta `restaurante-mvp`, execute `./scripts/dev-local.sh` e abra `http://localhost:3000`. O script usa Node disponível no terminal ou o runtime local do Codex já instalado. Dependências e arquivos de ambiente já estão presentes neste checkout. Os acessos administrativos e da equipe continuam sendo os configurados anteriormente. Contas temporárias desta validação são removidas ao terminar.

Comece por **Gestão → Financeiro → Caixa** ou **Operação → Caixa**: abrir o caixa é obrigatório antes de registrar recebimentos. Informe o fundo físico e, separadamente, o saldo bancário inicial. Sem saldo inicial bancário, o sistema avisa que a projeção considera apenas os movimentos cadastrados.

O banco é o Neon existente. Não foi criado outro projeto ou banco. Alterações são locais, com commits; não houve push nem deploy. O endereço publicado ainda utiliza o código anterior, embora o schema compartilhado tenha recebido migrações aditivas. Portanto, o teste desta versão é no localhost.

## Fluxos implementados nesta entrega

- Pedidos públicos entram pendentes, sem comanda de produção nem consumo de estoque. Garçom, caixa ou gestão conferem e enviam ou recusam com motivo. Pedido digitado pela equipe tem envio explícito à cozinha e aprovação auditada na mesma transação.
- Repetição da criação com a mesma chave retorna o mesmo pedido. Aprovações simultâneas não duplicam fila, estoque ou evento de aprovação.
- Pagamento não encerra produção. O atendimento no salão ou retirada é confirmado separadamente; entrega mantém saída antes da conclusão. Um pedido pago em preparo continua visível na cozinha.
- Cancelamento após preparo exige gestão e não repõe ingredientes automaticamente. Devolução total pode ser registrada pela gestão após confirmação da devolução nos meios de pagamento; o sistema não transfere dinheiro nem cancela nota fiscal automaticamente.
- Caixa único aberto por restaurante, fundo, suprimento, sangria, pagamentos divididos por meio, troco restrito ao dinheiro, contagem e diferença justificada no fechamento.
- Razão gerencial com débitos e créditos equilibrados, contrapartidas obrigatórias, proibição de edição dos lançamentos e estorno por novo lançamento. Referências impedem repetir o mesmo fato.
- Recebimentos anteriores ao atendimento entram como adiantamento; receita é reconhecida ao servir, retirar ou entregar. Cartão fica a liquidar até a conciliação manual do líquido e da taxa.
- Taxa de serviço separada da receita de pratos, como valor a repassar. Registro manual do repasse à equipe, sem cobrança ou transferência externa. Esse é o tratamento inicial conservador do piloto; a política real do restaurante precisa ser confirmada.
- Contas a pagar e receber com descrição, contraparte textual, categoria, competência, vencimento, baixa parcial, estorno e cancelamento. Compra de estoque não vira despesa operacional automaticamente.
- Projeção de caixa por vencimento, inclusive contas atrasadas; cartões sem previsão confirmada ficam fora da projeção.
- Custos de ingredientes, embalagem e adicionais preservados no momento da aprovação. Atualizar custo ou ficha não reescreve vendas antigas. Custos ausentes e parciais aparecem identificados.
- Resultado gerencial por período, custos dos itens atendidos, perdas de pedidos cancelados após iniciar preparo e taxas conciliadas. Não é demonstrativo contábil homologado nem promessa de lucro líquido.
- Exportação CSV de todas as partidas do período, com identificação, origem e responsável. A tela limita movimentos a 400 linhas; a exportação não usa esse limite.
- Nome, logo, capa, cor e plano por restaurante. Essencial mantém operação e caixa; Profissional libera os novos módulos avançados. Os bloqueios também existem nas APIs.
- Resolução do estabelecimento pelo hostname cadastrado, sessão vinculada ao estabelecimento, consultas e alterações verificadas pelo restaurante. Domínio desconhecido não herda o primeiro cliente. Login recebe limite persistido de tentativas; desativação, mudança de papel ou de PIN invalida a sessão do funcionário.

## Verificações e preservação

Build de produção e verificação TypeScript concluídos com sucesso. ESLint terminou sem erros, com três avisos preexistentes nas telas de estoque e mesas. As três suítes de integração abaixo passaram; o status final das migrações não apresenta pendências.

Foram executados testes HTTP contra o servidor local e conferências no PostgreSQL, com produtos, equipe, pedidos e lançamentos sintéticos identificados e removidos pelo próprio teste:

1. `tests/approval.integration.mjs`: criação pendente, ausência de efeitos antes de aprovação, idempotência, conflito de conteúdo, permissões, concorrência, recusa, custo histórico e cancelamento após preparo.
2. `tests/finance.integration.mjs`: caixa, troco, pagamento antes do preparo, atendimento, contas e baixas parciais, estornos, cartões, devolução integral, repasse de serviço, fechamento e integridade das contrapartidas. Exportação verificada com 205 lançamentos adicionais, gerando 410 linhas além das operações do cenário.
3. `tests/tenancy.integration.mjs`: segundo restaurante fictício no mesmo banco, endereços distintos, identidades independentes, cookie de outro restaurante recusado, IDs de outro cliente recusados e bloqueio do plano Essencial.
4. Navegador: acesso pela equipe, painel, cadastro de conta de R$ 12,34, confirmação do valor de 1.234 centavos no banco e persistência após recarregar. Formulário e listagem conferidos em viewport de 390 px, sem transbordamento horizontal da página.
5. Backup PostgreSQL em formato custom criado antes das migrações e catálogo do arquivo lido com `pg_restore`. Comparação dos 146 registros originais em 19 tabelas não encontrou mudanças em seus valores, exceto a progressão intencional dos contadores de pedido/fila e seu timestamp. Sequências não foram reiniciadas após os testes.

O backup fica em `outputs/backups/pre-gestor-food-20261007.dump`, fora do Git e com acesso restrito. A leitura do catálogo e a comparação de dados não equivalem a um ensaio de restauração completo; esse ensaio continua pendente.

As migrações antigas foram reconhecidas por comparação estrutural, sem reexecutar os scripts sobre dados existentes. `app_migrations` registra checksums. Novas migrações: `0006` a `0012`. Antes de uma próxima migração, crie um backup atualizado e execute `db:status`. O migrador exige um arquivo `pg_dump` válido e não permite alterar silenciosamente uma migração já registrada.

## Revalidação do design e do turno — 07/10/2026

A direção visual confere com as seções 7.4–7.10 do manual: evolução da base existente, superfícies claras, texto escuro, marca do restaurante, navegação lateral na gestão e acessos diretos por papel. O manual não registra mockup aprovado nem identidade definitiva do Gestor Food; portanto, essa conferência não equivale a aceite visual integral.

Foi simulado no navegador um turno com dados sintéticos, seguindo as telas e confirmando os registros no PostgreSQL:

| Etapa | Evidência |
| --- | --- |
| Abrir caixa | Fundo inicial de R$ 100 |
| Garçom registrar pedido | Mesa de teste 180, prato R$ 20, observação sem cebola, envio explícito à cozinha |
| Produção | Novo → em preparo → pronto; observação preservada; um único consumo de insumo |
| Servir | Atendimento registrado antes do pagamento |
| Receber | R$ 22 de conta, incluindo R$ 2 de serviço; dinheiro entregue R$ 50; troco R$ 28 |
| Liberar mesa | Pedido concluído e mesa livre depois do atendimento e recebimento |
| Apurar custo | Venda R$ 20, custo histórico R$ 7, diferença R$ 13; serviço separado |
| Registrar despesa | Conta de limpeza R$ 5, baixa em dinheiro, persistência após recarga |
| Fechar caixa | Esperado R$ 117 e contado R$ 117, sem diferença |
| Resultado | R$ 8 após deduzir a despesa, identificado como gerencial parcial por cobertura do histórico |
| Pedido público | Solicitação pendente, estoque intacto até conferência; aprovação no caixa e entrada posterior na cozinha |

Durante o cenário, o servidor de desenvolvimento encerrou antes da gravação do pagamento, sem causa confirmada. O banco preservou pedido servido e estoque, sem recebimento. Após reiniciar o servidor e reabrir a tela, o pagamento foi registrado uma vez e o turno concluído. Isso verifica a retomada deste cenário, não todos os casos de timeout, perda de conexão ou resposta desconhecida.

Foram corrigidos nesta revalidação: nomes acessíveis dos botões de quantidade, limite visual ao diminuir abaixo de uma unidade, indicação de envio e bloqueio do botão no carrinho, foco visível, controles de toque maiores e fechamento de diálogos em português. As seções financeiras agora quebram linha no celular e têm alvos de 44 px, sem esconder opções atrás de rolagem lateral.

Financeiro e cozinha foram inspecionados em 360, 390 e 430 px; não houve transbordamento horizontal da página nessas telas. O diálogo de produto foi usado em 360 px. A cozinha mantém rolagem interna entre colunas. Console da sessão retomada sem erros ou avisos capturados. A aprovação visual de todas as telas, zoom, leitores de tela, textos extremos, navegação compacta por papel e todos os estados de falha ainda não está concluída.

Os testes de integração de aprovação, financeiro e isolamento foram repetidos em duas rodadas nesta revalidação, além das execuções da entrega inicial. O cenário financeiro foi ampliado para cobrir entrega: endereço ausente na resposta da cozinha, bloqueio de saída antes de pronto, bloqueio de entrega sem saída, pagamento sem encerrar produção e reconhecimento único da receita. A simulação no navegador e as rotinas HTTP são evidências distintas; nem todos os cenários HTTP foram repetidos pela interface.

Todos os dados criados nesta simulação são temporários e foram removidos. Os testes não emitem notas, transferem dinheiro, enviam WhatsApp nem usam dados de clientes reais.

## Pendências para o produto completo

### 1. Fiscal e contabilidade fiscal — B08 / parte de B09

**Ainda não há emissor fiscal implementado nesta versão.** Não há chamada de autorização, cancelamento ou consulta de NF-e/NFC-e, nem arquivos XML/DANFE fiscais produzidos pelo sistema.

É preciso confirmar o município, o CNPJ/IE, o regime e a classificação dos produtos com o contador; contratar/configurar o provedor, certificado A1 e CSC/credenciamento aplicáveis. Depois, implementar o adaptador e a máquina de estados, validar em homologação os cenários de autorização, rejeição, timeout com consulta antes de repetir, cancelamento, persistência dos artefatos e exportação XML/ZIP. Só então habilitar produção.

A Focus permanece candidata. Sua documentação confirma emissão síncrona de NFC-e e consulta por referência: [emissão](https://doc.focusnfe.com.br/reference/emitir_nfce), [consulta](https://doc.focusnfe.com.br/reference/consultar_nfce) e [ambientes](https://doc.focusnfe.com.br/reference/ambiente). Isso não comprova a habilitação fiscal do cliente. Não informar certificado, senha ou token em arquivos versionados.

### 2. Pagamentos e conciliação automáticos — B11 / parte de B12

Recebimentos, repasses e devoluções atuais são **registros manuais de fatos conferidos**. Faltam provedor escolhido, criação de cobranças/Pix, terminais compatíveis, callbacks autenticados, retentativas, expiração, reembolsos externos, chargebacks e sincronização.

A conciliação entregue é manual, por pagamento de cartão. Ainda faltam importação de extratos/arquivos, repasses agrupados, parcelamentos, antecipações e correspondência automática sem duplicação. Não há previsão automática de liquidação por adquirente.

### 3. Complementos financeiros, estoque e atendimento — partes de B03–B07 / B15

- Recebimento parcial de uma venda/fiado, desconto auditado e edição controlada de pedido pendente. As baixas parciais entregues são das contas a pagar/receber; a conta da mesa é recebida pelo saldo integral, podendo dividir meios.
- Devolução parcial por item, atendimento parcial e destino detalhado de reaproveitamento. A devolução implementada é integral; alimento em preparo permanece consumido no estoque.
- Contas recorrentes, parcelas, anexos/comprovantes e cadastros próprios de fornecedores/clientes; hoje a contraparte é textual.
- Múltiplas contas bancárias/gavetas, regras de operadores de caixa e classificação final das diferenças de caixa. A versão atual usa uma gaveta e contas gerenciais padrão.
- Conversão automática kg↔g / L↔ml, rendimentos culinários, subreceitas, lotes e inventário de produção. Hoje a quantidade por porção precisa estar na unidade cadastrada do insumo.
- Integração única entre entrada de compra e obrigação financeira. Hoje é necessário registrar entrada física e conta financeira separadamente, uma vez cada.
- Escrituração completa de CMV/perdas/estoque no razão. O resultado já usa snapshots históricos nas consultas; o CSV de partidas financeiras ainda não substitui a escrituração de estoque e o pacote completo do contador.
- Métricas adicionais do manual, detalhamento/explicação de cada indicador, previsões de taxas ainda não conciliadas, ponto de equilíbrio, gráficos e relatórios contábeis adicionais.
- Divisão por pessoa, junção/transferência de comandas, combos, promoções, fidelidade, barris e recursos específicos da choperia.

### 4. Expansão SaaS e comercial — partes de B01, B13 e B14

O teste com dois restaurantes cobre rotas e consultas da aplicação, **não comprova o isolamento de toda a plataforma futura**. Ainda faltam políticas RLS com credencial de runtime apropriada, auditoria completa de permissões/arquivos/cache/jobs, recuperação por cliente, administração/onboarding de clientes e configuração real de seus domínios/DNS na Vercel. Não cadastrar outro cliente comercial como se essa validação estivesse concluída.

Os planos já controlam capacidades, mas faltam gestão de licenças, versões/direitos da licença vitalícia, suporte, custos recorrentes, regras contratuais, cobrança comercial em até seis vezes e renovação de serviços externos. Venda da licença não se mistura aos recebimentos de refeições.

### 5. Aceite e liberação — B10

Faltam seus testes de uso, conferência dos cadastros/custos e saldos reais, ensaio de restauração, testes de pico/concorrência em volume representativo, operação com impressora e equipamentos do restaurante e validação de queda/retomada de conexão. Também faltam push, deploy e teste do endereço publicado, a realizar em uma etapa de publicação autorizada.

A apresentação pode usar este MVP local e seus fluxos manuais. O produto completo do manual continua aberto; não anunciar emissão fiscal, cobranças ou conciliação automática como disponíveis.
