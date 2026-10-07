# Financeiro e métricas do Gestor Food

O financeiro deve responder quatro perguntas distintas: quanto foi vendido, quanto custou atender essas vendas, quanto dinheiro entrou/saiu e quanto ainda será pago/recebido. As definições abaixo são decisões propostas para o produto, não laudo contábil nem cálculo tributário homologado.

## 1 Visão do proprietário

O painel inicial do Profissional apresenta período e restaurante selecionados, dia operacional e horário de atualização. Cada número abre os registros que o compõem.

| Pergunta do dono | Indicador e detalhamento |
| --- | --- |
| Quanto vendi hoje? | Vendas atendidas, descontos, devoluções, produtos e canais |
| Quanto entrou de dinheiro? | Recebimentos liquidados por conta, separados de cartão a receber |
| Quanto gastei hoje? | Saídas pagas por categoria; despesas incorridas em outra visão |
| Quanto sobra em cada prato? | Margem de contribuição por item, com custo, embalagem, taxas e deduções |
| Meu estoque está consumindo a margem? | CMV estimado, inventário, perdas e divergência de consumo |
| Vou conseguir pagar as contas? | Projeção de saldo, vencidos e vencimentos de 7 e 30 dias |
| O caixa fechou certo? | Valor esperado, contado e diferença por turno |
| O restaurante deu resultado? | Resultado gerencial por competência e avisos de dados faltantes |

Comparação com período anterior exige períodos equivalentes. Metas são configuradas pelo cliente; não instalar um percentual universal de CMV ou lucro como verdade do setor.

O Sebrae distingue a contribuição de cada produto, usada para cobrir despesas fixas e formar resultado, do lucro final. A definição fundamenta o nome do indicador no sistema. [Guia Sebrae para bares e restaurantes, página 9](https://bibliotecas.sebrae.com.br/chronus/ARQUIVOS_CHRONUS/bds/bds.nsf/0ca36cbefa1addee631efeda4196923d/$File/Bares_Restaurantes.pdf).

## 2 Datas e reconhecimento

Guardar separadamente `created_at`, `approved_at`, `fulfilled_at`, `competence_date`, `due_date`, `paid_at`, `settled_at`, `business_date` e `recorded_at`. Nem todas pertencem à mesma entidade. O registro feito hoje sobre pagamento de ontem preserva data efetiva e data de registro.

Política gerencial inicial: reconhecer receita e CMV dos itens ao serem servidos, retirados ou entregues. Pedido aprovado ainda não atendido pertence à carteira operacional. Pagamento antecipado é adiantamento do cliente até o atendimento. Recusa/cancelamento reverte o saldo apropriado; não cria receita negativa sem relação com a venda original.

Uma comanda pode receber pedidos em momentos diferentes e uma venda pode ter reconhecimento parcial por itens. No primeiro MVP, a interface pode concluir atendimento por pedido inteiro; o modelo de itens não deve impedir a evolução parcial.

O dia operacional pode terminar depois da meia-noite. Timezone e horário de corte pertencem ao restaurante e são versionados; a data do fechamento de caixa não altera silenciosamente a competência das vendas. Relatório por dia civil e por dia operacional deve mostrar a escolha claramente.

## 3 Razão gerencial e obrigações

Recomenda-se um razão gerencial de partidas balanceadas para preservar consistência de saldos. Ele serve de base técnica para o produto; não substitui a escrituração oficial do contador.

Cada fato gera um `journal_entry` com duas ou mais linhas, origem, restaurante, competência, moeda, autor e chave de idempotência. A soma dos débitos deve igualar a dos créditos antes da efetivação. Linhas efetivadas são imutáveis; correções usam lançamento reversor com vínculo ao original.

Contas mínimas: caixa físico, banco, saldo disponível no provedor, adquirentes a receber, clientes a receber, adiantamentos de clientes, estoque, insumos destinados a produção, fornecedores a pagar, repasses de serviço/gorjetas, tributos provisionados, receita, devoluções/descontos, CMV, perdas, taxas, despesas operacionais e aportes/retiradas dos sócios. Contas gerenciais da razão e contas financeiras de caixa/banco são relacionadas, mas não são a mesma tabela.

Documentos e parcelas registram as obrigações comerciais. Baixas alocam dinheiro a essas obrigações. O razão representa seu efeito. Não manter três saldos mutáveis independentes calculados de maneiras diferentes; saldos devem ser derivados ou projeções reconciliáveis dos mesmos eventos.

### Exemplos de eventos

Exemplos simplificados, sem imposto ou gorjeta, para definir invariantes de implementação.

| Evento | Débito | Crédito | Efeito |
| --- | --- | --- | --- |
| Compra recebida de R$ 500 a prazo | Estoque 500 | Fornecedores 500 | Aumenta estoque e obrigação; caixa ainda não muda |
| Pagar R$ 200 dessa compra | Fornecedores 200 | Banco 200 | Restam 300 a pagar; não lança outra despesa |
| Aprovar pedido com R$ 12 de insumos | Insumos em produção 12 | Estoque 12 | Preserva custo; ainda não é CMV de venda atendida |
| Atender venda de R$ 32 | Clientes 32 e CMV 12 | Receita 32 e insumos em produção 12 | Receita e consumo reconhecidos uma vez |
| Receber a venda em dinheiro | Caixa 32 | Clientes 32 | Liquida o consumidor e aumenta caixa |
| Receber por cartão aprovado | Adquirentes 32 | Clientes 32 | Consumidor quitado; dinheiro ainda devido pelo provedor |
| Provedor liquida R$ 31 e cobra taxa de R$ 1 | Banco 31 e taxas 1 | Adquirentes 32 | Reconhece taxa uma vez e zera o recebível |
| Transferir R$ 100 do caixa ao banco | Banco 100 | Caixa 100 | Não altera receita, despesa ou total consolidado |
| Receber antecipadamente R$ 32 | Caixa/banco 32 | Adiantamentos 32 | Não reconhecer receita antes de atender |
| Compensar adiantamento no atendimento | Adiantamentos 32 | Clientes 32 | Quita conta sem segunda entrada de caixa |

Se a taxa já foi reconhecida por competência antes do repasse, a liquidação baixa a provisão correspondente e registra só a diferença. O exemplo da tabela supõe ausência de provisão anterior. A interface mostra taxa estimada e taxa confirmada sem somá-las.

Para o painel por competência, reconhecer a taxa conhecida ou a estimativa identificada no período da venda; ajustar a diferença quando confirmada. Se não houver regra de taxa, o resultado é parcial. Não deslocar silenciosamente todo o custo de cartão para o dia do repasse e chamar a margem da venda de definitiva.

A compra de insumos transforma dinheiro ou dívida em estoque. O custo entra no resultado quando há consumo reconhecido, perda ou ajuste aplicável. Aporte de sócio não é venda, retirada não é automaticamente despesa operacional e transferência não é entrada de faturamento.

## 4 Caixa operacional

Cada terminal/gaveta tem turno de caixa e responsável. Garantir por índice único parcial que não haja dois turnos abertos na mesma gaveta. Fechamento usa lock e versão para não concorrer com recebimento; se o turno já foi fechado, a operação nova precisa ser alocada a outro turno autorizado.

Fluxo: informar fundo inicial e origem → abrir → registrar recebimentos e troco → suprimentos e sangrias → registrar despesas autorizadas → contar dinheiro → comparar → justificar diferenças → fechar. Fundo inicial vindo do cofre é transferência; lançamento de saldo inicial só existe no marco de implantação para não duplicar saldo a cada abertura.

Fórmula da gaveta:

`dinheiro esperado = fundo inicial + pagamentos em espécie líquidos de troco + suprimentos − sangrias − despesas pagas em espécie − reembolsos em espécie`

Pix e cartão aparecem no resumo do turno, mas não na contagem física. Troco é registrado junto do dinheiro entregue pelo cliente; receita equivale ao valor alocado à conta, não às cédulas recebidas. Não permitir troco de cartão/Pix como se fosse dinheiro sem uma operação explícita de devolução.

Diferença = contado − esperado. Toda diferença fica registrada, inclusive zero. Uma diferença não autoriza reescrever pagamentos; eventual ajuste requer motivo, responsável e categoria própria. Reabertura do turno exige autorização e histórico; preferir correções identificadas.

Recebimento em espécie pelo entregador pertence à custódia/caixa do entregador. Sua prestação de contas transfere o valor para a gaveta/cofre; não registra outra venda. Troco levado pelo entregador é transferência de numerário, com responsável.

Exemplo de conferência: fundo 200 + recebimentos 300 − troco 20 + suprimento 50 − sangria 100 − despesa 30 = esperado 400. Contagem 395 produz diferença −5. Pagamentos digitais não mudam esse cálculo.

## 5 Contas a pagar e receber

Cadastro mínimo de documento: contraparte, descrição, categoria, valor, competência, emissão, vencimento, parcela, conta prevista, centro de custo opcional, anexos, origem e responsável. Documentos oriundos de compra ou venda mantêm vínculo; não solicitar que o operador digite o mesmo fato outra vez.

Estados de obrigação: rascunho, aberta, parcialmente liquidada, liquidada e cancelada. Vencida é condição calculada sobre vencimento e saldo, não substitui o estado. Baixa pode ser parcial, com juros, multa e desconto separados. Uma reversão de baixa reabre o saldo e mantém o histórico.

Aprovação de despesa é outra dimensão: não submetida, aguardando, aprovada ou rejeitada. No MVP, proprietário/financeiro autorizado pode criar e aprovar explicitamente na mesma ação, com eventos separados; limites por valor e dupla aprovação ficam configuráveis na evolução. Uma previsão em rascunho não afeta o realizado nem o resultado efetivado. Uma obrigação aprovada entra na previsão; o reconhecimento da despesa segue a competência e natureza, e a baixa segue a liquidação. Registrar uma despesa que de fato já ocorreu não pode ser impedido de aparecer como pendência apenas porque a autorização administrativa chegou depois.

Parcelamento divide valores em centavos com soma exata e datas válidas; R$ 100 em três parcelas resulta em 33,34 + 33,33 + 33,33 conforme ordem definida. Recorrências geram documentos distintos por competência, com referência única para impedir duplicação em reexecução.

Conta a receber de cliente e recebível de cartão têm devedores diferentes. Converter uma em outra no pagamento aprovado elimina a pendência do consumidor, mantendo a obrigação da adquirente. Não mostrar ambas como receita futura independente.

Registrar contas a pagar não executa Pix ou débito no banco. Pagamento bancário automático fica fora do MVP; registrar a baixa manual exige data, conta e identificação do responsável. A integração bancária futura precisará autorização própria para movimentar dinheiro.

## 6 Fluxo de caixa

Exibir duas visões: realizado e previsto. Realizado lê movimentos liquidados de contas financeiras. Previsto parte do saldo disponível e aplica parcelas abertas e recebíveis esperados, descontando pagamentos já realizados.

`saldo previsto na data D = saldo disponível no início + entradas esperadas até D − saídas esperadas até D`

Transferências internas se anulam no consolidado, mas aparecem em cada conta. Limite de crédito não compõe saldo disponível; pode aparecer separado como cenário. Vencidos aparecem em faixa própria, sem assumir automaticamente que entrarão hoje. Probabilidade de recebimento deve ser hipótese configurável e identificada, não alteração do valor nominal da dívida.

Projeção por dia para 7 e 30 dias no MVP. Permitir filtrar conta, categoria, canal e situação. Somar parcelas pelo vencimento esperado de liquidação, não pela data em que a venda foi cadastrada. Alterar previsão preserva a data original e o histórico da mudança.

Um saldo bancário digitado é saldo informado; não rotulá-lo como conferido automaticamente. Reconciliar o saldo inicial e o final de cada conta com o extrato quando disponível.

## 7 Custos dos pratos e bebidas

A ficha técnica contém versão, rendimento em porções, ingredientes em unidade base, quantidades, perdas normais previstas, embalagem e adicionais. Separar conversão de unidade de correção de rendimento: 1 kg = 1.000 g; o aproveitamento culinário é outro fator.

`custo da receita = soma da quantidade bruta necessária de cada insumo × seu custo unitário + componentes adicionais`

`custo por porção = custo total da receita ÷ rendimento em porções`

Se a quantidade informada for líquida, converter pela fração aproveitável: quantidade bruta = quantidade líquida / rendimento. Não aplicar perda uma segunda vez a uma receita que já informa quantidades brutas. Registrar qual convenção a ficha utiliza.

Manter custo médio ponderado móvel na entrada, aproveitando a base: `(valor do estoque anterior + custo das entradas) / quantidade após entrada`. Exemplo: 100 unidades a 2 e 50 a 3 resultam em 150 unidades e custo médio de 2,333333 por unidade. Usar decimal; arredondar o total monetário no ponto definido, não cada fração de grama.

Embalagem pode integrar a ficha ou ser custo separado do canal, nunca ambos. Adicionais têm custo próprio; receita vazia não implica custo zero. Produtos de revenda podem usar um insumo correspondente. Copos de chope de volumes distintos consomem ml distintos, com perdas separadas.

Na aprovação, congelar quantidades/custos e a versão da ficha aplicada. Cada alteração posterior de pedido gera revisão e diferença identificada. No atendimento, reconhecer o CMV daquele snapshot. Compras posteriores mudam o custo de novas vendas, não das passadas.

Qualidade do custo: completo, parcial, ausente ou estimado. Se não houver inventário, permitir custo manual explícito com fonte e vigência; a margem será estimada. Não mostrar “lucro 100%” quando falta ficha.

A Abrasel relaciona controle de CMV a ficha técnica atualizada, porcionamento, inventário e acompanhamento de desperdício. Esses cadastros são requisitos de qualidade da métrica, não tarefas opcionais escondidas atrás do painel. [Orientações da Abrasel](https://abrasel.com.br/noticias/noticias/abrasel-lanca-cartilha-gratuita-cmv-bares-restaurantes-controle-de-custos/).

## 8 Dicionário de métricas

Convenções: excluir pedidos rejeitados e itens cancelados antes do atendimento; tratar devolução como evento vinculado, no período aplicável. Taxa de serviço/gorjeta e valores de terceiros ficam separados da receita de produtos, com classificação definida junto ao contador. Não inferir tratamento tributário pelo nome da forma de pagamento.

| Métrica | Fórmula e fonte | Limite de interpretação |
| --- | --- | --- |
| Vendas brutas atendidas | Soma do preço de venda × quantidade atendida, antes de descontos/devoluções | Não inclui pedido apenas aprovado |
| Vendas após descontos e devoluções | Vendas brutas − descontos − devoluções reconhecidas | Base comercial antes das deduções tributárias definidas |
| Receita líquida gerencial | Vendas após descontos/devoluções − deduções tributárias reconhecidas | Tributos estimados são identificados; excluir repasses |
| Unidades vendidas | Quantidades atendidas líquidas de devolução, por variante | Não confundir adicional e combo com venda duplicada |
| Ticket médio por conta | Vendas após descontos/devoluções / número de contas de venda correspondentes | Vários pedidos da mesma comanda não são vários clientes |
| Valor médio por pedido | Mesma receita alocada / pedidos atendidos | Indicador distinto de ticket por conta |
| CMV técnico | Soma dos custos históricos dos itens atendidos | Depende da cobertura das fichas |
| CMV técnico percentual | CMV técnico / receita líquida gerencial × 100 | Mostrar denominador; receita zero resulta em não aplicável |
| Consumo apurado por inventário | Estoque inicial + entradas líquidas + transferências de entrada − transferências de saída − estoque final, a custo | Pode incluir perdas e consumo não vendido; não chamar tudo de venda |
| CMV apurado ajustado | Consumo apurado − perdas conhecidas − consumo interno identificado − demais saídas não comerciais | Diferença residual deve permanecer visível para investigação |
| Divergência de consumo | Consumo apurado − consumo técnico − saídas não comerciais conhecidas | Exige inventários compatíveis e mesmo período |
| Margem de contribuição em reais | Receita líquida gerencial − CMV − demais custos/despesas variáveis | Não é lucro líquido |
| Margem de contribuição percentual | Margem em reais / receita líquida gerencial × 100 | Calcular sobre somas, não média simples das margens |
| Contribuição por prato/canal | Receita líquida alocada − custo histórico − embalagem fora da ficha − taxas/comissões variáveis alocadas | Custos comuns rateados são estimativas explícitas |
| Resultado operacional gerencial | Contribuição − despesas operacionais fixas do período − perdas/ajustes ainda não considerados | Sem duplicar despesas já incluídas no CMV ou variável |
| Resultado após financeiro | Resultado operacional + receitas financeiras − despesas financeiras | Ainda pode faltar depreciação/outros ajustes para resultado contábil |
| Margem operacional | Resultado operacional / receita líquida gerencial × 100 | Não rotular como margem líquida contábil |
| Ponto de equilíbrio gerencial | Despesas fixas do período / margem de contribuição percentual em forma decimal | Apenas se margem positiva; mesma base de receita |
| Recebimentos realizados | Soma das entradas liquidadas por conta | Separar receitas de aportes/transferências |
| Pagamentos realizados | Soma das saídas liquidadas por conta | Compra paga não equivale a CMV do período |
| Saldo disponível | Saldo inicial + movimentos liquidados | Segregar valores bloqueados e recebíveis |
| Contas vencidas | Soma dos saldos abertos com vencimento anterior à data local | Separar a pagar, clientes e adquirentes |
| Exposição de caixa | Menor saldo previsto e primeira data negativa no horizonte | Previsão, não certeza de inadimplência |
| Divergência de caixa | Dinheiro contado − esperado no turno | Não incluir Pix/cartão na gaveta |
| Taxa efetiva de pagamento | Taxas confirmadas / volume bruto associado × 100 | Separar antecipação e estimativa |
| Conciliação por valor | Valor reconciliado / valor elegível × 100 | Mostrar também itens pendentes e período de extrato |
| Perdas de estoque | Valor das perdas registradas por motivo e insumo | Não duplicar perdas que já compõem outro ajuste de resultado |
| Cobertura de custos | Receita dos itens com custo completo / receita dos itens atendidos × 100 | Exibir junto de todas as margens |

Não usar histórico parcial dos últimos 200 pedidos. Todos os indicadores são calculados no servidor, com filtros equivalentes e opção de inspecionar lançamentos. Métricas sem denominador ou dados suficientes mostram “não calculado”, com motivo.

Para inventário, incluir insumos destinados à produção e produtos em processo na avaliação inicial/final, ou ajustar explicitamente sua variação. Sem isso, um pedido aprovado na véspera e servido no dia seguinte pode parecer desperdício. Comparar CMV técnico e apurado apenas após equalizar período, unidades, critério de custo e movimentos de produção. Tributos, gorjetas e outras deduções usam a mesma classificação em todas as bases.

## 9 Exemplo demonstrável de margem

Valores sintéticos para teste, sem relação com tributação real de um restaurante:

| Por prato | Valor |
| --- | ---: |
| Preço recebido do consumidor, sem serviço | R$ 32,00 |
| Dedução tributária estimada para o exemplo | R$ 1,50 |
| Receita líquida gerencial | R$ 30,50 |
| Ingredientes no snapshot | R$ 12,00 |
| Embalagem não incluída na ficha | R$ 1,00 |
| Taxa variável de pagamento/canal | R$ 1,00 |
| Margem de contribuição | R$ 16,50 |

Dez pratos produzem R$ 320,00 em vendas, R$ 305,00 de receita líquida gerencial, R$ 120,00 de CMV e R$ 165,00 de contribuição. A margem sobre receita líquida é 54,10%. Com R$ 80,00 de despesas fixas atribuídas ao período, o resultado operacional gerencial é R$ 85,00.

Esse resultado só vale se todas essas informações estiverem cadastradas e no mesmo período. Não inclui automaticamente despesas esquecidas, depreciação ou apuração tributária oficial. O produto deve chamar o resultado de estimado/parcial quando a cobertura estiver incompleta.

Na tela do prato, mostrar comparação entre custo atual da ficha e custo histórico das vendas. Isso permite investigar aumento de insumos sem reescrever margens já apuradas.

## 10 Pagamentos e recebíveis

No MVP, dinheiro, Pix conferido e cartão de terminal externo podem ser registrados manualmente, sempre com origem manual. Pix marcado pelo caixa não se torna pagamento automaticamente confirmado por banco. Cartão registra adquirente, valor bruto, taxa estimada e previsão de repasse quando conhecida; ausência dessas informações produz pendência de configuração.

Estado do pagamento: criado, pendente, autorizado quando aplicável, capturado/aprovado, recusado, cancelado, parcialmente devolvido ou devolvido. Estado do repasse: previsto, parcialmente liquidado, liquidado, bloqueado ou em divergência. Estado de contestação é acompanhado sem sobrescrever a história do pagamento.

Uma devolução não significa que ingredientes voltaram ao estoque. A devolução financeira e o destino físico dos itens têm comandos e efeitos separados. Estorno manual do registro e reembolso real no provedor também são distintos; a interface deve impedir que o primeiro pareça concluir o segundo.

Recebíveis de cartão preservam valor bruto, taxas, líquido esperado, data esperada e valor/data efetivos. Antecipação é operação identificada com custo próprio. Se os valores externos forem desconhecidos, exibir previsão, sem apresentá-la como saldo disponível.

O Mercado Pago documenta que liberação de saldo, faturamento, bloqueios e estornos podem produzir valores diferentes e oferece relatório de liberações para conferência. Isso fundamenta a separação de venda, pagamento e repasse. [Relatório de liberações](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/reports/released-money/introduction).

## 11 Conciliação

Começar com seleção manual de movimento e recebível. Evoluir para importação de um layout de CSV conhecido, com prévia, mapeamento de colunas, moeda, datas e hash do arquivo/linha. OFX e outros layouts entram após definição e testes próprios.

Correspondência automática futura usa identificador externo quando disponível; depois combinação de valor, conta, data, taxa e referência. Igualdade apenas de valor nunca é prova suficiente. Vários pagamentos podem compor um repasse; uma transação pode ter liquidações parciais.

Casos: correspondência exata; taxa diferente; valor parcial; data divergente; movimento sem origem; recebível sem liquidação; duplicação de arquivo; estorno; antecipação; bloqueio. Sugestões ambíguas exigem confirmação. Não criar venda nova a partir de cada linha de extrato.

Conciliação vincula fato externo a registro financeiro existente. Se já há baixa, não gerar outra entrada. Se a baixa ainda não existe, criá-la atomicamente com o vínculo e uma chave única. Desfazer vínculo não apaga extrato nem lançamento; eventual reversão financeira é explícita.

## 12 Resultados e contabilidade

Demonstrativo gerencial apresenta vendas, descontos/devoluções, deduções, receita líquida, CMV, outros variáveis, contribuição, despesas fixas, perdas, resultado operacional e financeiro. Permitir visualizar competência e caixa em telas claramente distintas.

Fechamento de período identifica itens sem custo, lançamentos sem categoria, contas sem conciliar e fiscal pendente. Somente depois de conferência bloquear alterações retroativas. Reabertura é auditada. Rateio mensal para mostrar resultado diário precisa de regra e indicação de estimativa; aluguel inteiro no dia do pagamento não representa necessariamente despesa de competência daquele dia.

Exportação inicial: CSV de vendas, pagamentos, contas/parcelas, baixas, categorias, taxas e razão, com dicionário de colunas, período, moeda, timezone, versão e totais de controle. Prevenir fórmulas executáveis em células de texto exportadas. Quando fiscal estiver integrado, permitir pacote de XML/documentos e eventos existentes, sem inventar arquivos.

Leiautes específicos de softwares contábeis, SPED, folha de pagamento, apuração tributária oficial e declarações não fazem parte do primeiro MVP. O contador valida classificação e formato necessário; acesso somente de leitura/exportação por restaurante.

## 13 Testes numéricos mínimos

| Caso | Resultado obrigatório |
| --- | --- |
| Aprovação repetida | Um conjunto de efeitos, sem segunda baixa ou custo |
| Alterar custo de compra amanhã | Não mudar custo histórico dos itens atendidos hoje |
| Ficha ausente | Margem desconhecida/parcial; custo não vira zero |
| Compra de 500 e pagamento parcial de 200 | Estoque 500, obrigação residual 300, caixa −200; sem despesa duplicada |
| Venda cartão 100, taxa confirmada 3, repasse 97 | Uma receita de 100, uma taxa de 3, uma entrada de 97, recebível zerado |
| Webhook ou importação repetido | Totais permanecem idênticos |
| Transferência entre contas de 100 | Saldo consolidado e resultado não mudam |
| Dez pratos do exemplo | Contribuição 165 e resultado operacional 85 |
| Cancelar item preparado | Não repor insumo automaticamente; perda/destino registrado |
| Pagar antes de preparar | Conta quitada, produção continua, receita reconhecida conforme atendimento |
| Baixas concorrentes de uma parcela | Soma liquidada não ultrapassa o saldo |
| Turno atravessa meia-noite | Datas civil, operacional e efetiva preservadas |
| Mais de 200 pedidos | Nenhum ativo desaparece; totais completos por período |
| Restaurante B tenta consultar A | Nenhum dado ou efeito financeiro de A acessível |
