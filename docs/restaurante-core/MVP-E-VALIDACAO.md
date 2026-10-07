# MVP e validação para apresentação

Referência de calendário: quarta-feira, 07/10/2026; apresentação pretendida no sábado, 10/10/2026. Este é o recorte proposto para implementação, ainda não uma confirmação de entrega de software testado.

O escopo atual é a [primeira versão do Patos como restaurante único](PRIMEIRA-VERSAO.md). A arquitetura de múltiplos restaurantes e domínios será implementada depois. A atualização [Fiscal MG](FISCAL-MG.md) inclui emissão das vendas e exportação ao contador no piloto; usar projeto e banco atuais, conforme orientação do proprietário. A tabela de planos abaixo orienta o produto futuro; o primeiro piloto pode testar a capacidade Profissional sem portal de licenciamento.

Um MVP útil até sábado é um alvo plausível com foco em operação e financeiro manual integrado, mas o prazo é apertado e depende da execução e dos testes. Não há base para garantir nesta etapa uma plataforma inteira homologada. Cada etapa só conta como entregue quando a gravação, a recarga e os totais foram verificados.

## 1 O que o dono deve conseguir fazer

Entrar no restaurante com identidade própria; cadastrar um produto com ficha técnica; abrir caixa; registrar e aprovar pedido; acompanhar cozinha/bar; servir ou entregar; receber; cadastrar uma despesa e uma conta futura; conferir caixa; consultar vendas, custos, contribuição e projeção financeira. A mudança deve persistir após recarga e aparecer nos dispositivos/papéis corretos.

O financeiro manual é uma integração real com a operação interna. A automação bancária permanece posterior. A integração fiscal entra no piloto, com ativação real condicionada ao emitente configurado e aos testes; seu estado deve ser informado com precisão.

## 2 Recorte dos planos

| Entrega | Essencial no MVP | Profissional no MVP |
| --- | --- | --- |
| Identidade e configuração do restaurante | Sim | Sim |
| Usuários e autorização por restaurante | Sim | Sim |
| Aprovação e fluxo de produção | Sim | Sim |
| Caixa e recebimentos manuais | Sim | Sim |
| Vendas por período | Sim | Sim |
| Estoque e ficha de produção | Base existente com correções necessárias | Mesma base |
| Contas a pagar/receber simples e baixas | Não no menu do pacote | Sim |
| Fluxo realizado e projetado | Não no menu do pacote | Sim |
| Custo histórico e contribuição | Não no menu do pacote | Sim |
| Resultado gerencial com cobertura | Não no menu do pacote | Sim, limitado aos dados cadastrados |
| Conciliação | Sem automação anunciada | Conferência manual, se passar no corte |
| Exportação | Vendas | CSV financeiro se passar no corte |
| Fiscal e exportação de XMLs | Capacidade comercial a definir | Incluídos no piloto conforme Fiscal MG; produção condicionada à validação |
| Gateway automático | Posterior | Posterior |

Não criar telas com botões que simulam sucesso financeiro. Recurso incompleto fica fora da demonstração ou apresenta estado claro de indisponibilidade.

## 3 Sequência de implementação

### Etapa A ambiente e contexto do Patos

Inspecionar o PostgreSQL atual, contagens e recuperação; preparar migrações aditivas reproduzíveis e dados de teste identificados. Reutilizar o driver existente. Corrigir a configuração de migrações e criar controle de versões somente após reconciliar o baseline aplicado.

Preparar dados sintéticos identificados no banco atual, contexto obrigatório de restaurante nos serviços novos e permissões para operação/financeiro. Preservar a identidade e o cadastro existentes na estratégia de migração. Adiar o cadastro de outros clientes, a resolução de múltiplos hosts e a experiência de troca entre restaurantes.

**Saída:** schema reconciliado, recuperação definida, acessos por papel verificados e registros novos vinculados ao Patos; migrations preservam dados existentes. Não exigir outro banco para iniciar este piloto.

### Etapa B operação consistente

Introduzir aprovação obrigatória, central de pendentes, estados separados, revisão e idempotência. Criar tickets e destinar estoque uma única vez. Corrigir cancelamento após preparo, pagamento antecipado e listagem de ativos acima de 200 registros. Garantir conclusão de setores sem condição de corrida.

**Saída:** pedido de garçom, caixa e canal público não chega à produção sem aprovação; o fluxo continua após recarga; duas aprovações simultâneas não duplicam efeitos.

### Etapa C núcleo financeiro

Criar contas financeiras, turnos de caixa, documentos/parcelas, baixas/alocações e razão gerencial. Conectar recebimentos da operação a esses registros. Adicionar dinheiro, Pix conferido e cartão externo manual, mantendo o recebível de repasse separado.

Implementar contas a pagar simples, despesa imediata, baixa parcial e transferência. Começar com um estabelecimento, um terminal e BRL por contexto, mantendo a estrutura para mais de um terminal. Não implementar execução de pagamentos bancários nesta etapa.

**Saída:** uma venda alimenta o financeiro uma vez; compra, despesa, pagamento e transferência têm os efeitos corretos; fechamento físico reproduz números conhecidos.

### Etapa D custos e telas do proprietário

Adicionar versão da ficha e snapshot de custo, estados de cobertura, preço por variante e separação de embalagem/taxas. Construir resumo, pagar/receber, fluxo de caixa e contribuição por produto. Consultas agregam o período completo no servidor.

Manter a identidade do Patos consistente no login, operação, gestão, cardápio e metadados. Evitar reconstruir todos os componentes visuais durante a mudança financeira. Presets de outros clientes e ativação comercial dos planos ficam para a etapa multiempresa.

**Saída:** exemplo de dez pratos fecha em R$ 165 de contribuição e R$ 85 de resultado gerencial; atualizar custo atual não altera o histórico; pessoa sem permissão não acessa financeiro diretamente pela API.

### Etapa E fiscal e exportação

Implementar o [fluxo fiscal de MG](FISCAL-MG.md): configuração, documento e tentativas persistidas, emissão/consulta Focus, rejeições, recuperação após timeout, arquivos privados, cancelamento permitido e pacote ao contador. Onboarding do emitente deve acontecer em paralelo às etapas B–D. Sem credenciais, testes locais não equivalem à validação do provedor.

**Saída:** matriz fiscal abaixo verificada em homologação. Produção é liberada apenas com configuração e evidências reais correspondentes. Importação de notas de fornecedores permanece fora do escopo.

### Etapa F testes e ensaio

Executar testes de domínio, banco atual com registros identificados, navegador, concorrência e persistência; conferir números por consulta independente. Ensaiar roteiro comercial de dez a quinze minutos. Incluir fiscal somente no ambiente realmente validado; API ausente precisa aparecer como pendência. Registrar versão local, dados e limitações.

**Saída:** checklist abaixo preenchido com evidências e demonstração reproduzível. Nenhum commit ou push enquanto permanecer a orientação atual.

## 4 Distribuição proposta até sábado

| Janela | Alvo | Condição para seguir |
| --- | --- | --- |
| Quarta 07/10 | Recorte atualizado, pesquisa MG e início do levantamento fiscal | Decisões e dependências registradas |
| Quinta 08/10 | Etapas A e B, início de C e preparação fiscal | Banco atual preservado, aprovação passa; acessos fiscais encaminhados |
| Sexta 09/10 | Concluir C, recorte D/E e testes F | Valores fecham, fluxos persistem; fiscal validado ou bloqueio explícito |
| Sábado 10/10 antes da apresentação | Correções críticas e ensaio | Congelar escopo; não introduzir integrações novas |

É um plano de alvo, não previsão comprovada de esforço. Se os fundamentos demorarem, cortar primeiro importação de extratos, exportações avançadas, recorrências e refinamento visual. Não cortar isolamento, consistência financeira, idempotência ou teste para anunciar um produto mais completo.

A apresentação desta versão é do Patos como restaurante único, sem anunciar isolamento multiempresa já concluído. Antes de adicionar outro cliente ao banco compartilhado, executar a etapa de isolamento com dois restaurantes. Se o financeiro não passar nos totais de controle, apresentar apenas o que funciona e preservar a especificação como roadmap.

## 5 Fora do primeiro recorte

Importação de notas de fornecedores, conciliação bancária automática, integração universal com maquininha, TEF, Open Finance, importação de todo tipo de extrato, SPED, folha, apuração tributária oficial, operação offline, compras avançadas, produção em lotes, controle detalhado por barril, redes/filiais consolidadas, emissão de boletos e pagamento automático de fornecedores.

Impressão térmica e integração com hardware precisam de teste com modelo real. Não presumir que imprimir do navegador resolve a rotina de cozinha do cliente. O painel de cozinha existente permanece o caminho inicial.

## 6 Dados sintéticos e uso local

Restaurante do piloto: Patos atual. Usar registros identificados para testes operacionais e homologação na Focus para testes fiscais, sem substituir cadastros existentes por uma empresa fictícia. “Choperia Demo”, planos distintos e cenários de upgrade entram na etapa multiempresa, antes de habilitar outro cliente real.

Fixtures: ingredientes com custo e unidade, produto com receita completa, produto sem ficha, bebida em ml, fornecedor, cliente, caixa, banco, conta de adquirente, despesa futura, recebível, perda e devolução. Datas relativas ao dia operacional da demonstração, para evitar painel vazio no sábado.

Qualquer seed deve operar com manifesto de registros de teste, ser idempotente e preservar os demais dados. Limpeza remove somente registros do manifesto após conferência; nunca recria ou zera o banco atual. Credenciais ficam fora do Git. Antes do início comercial, conferir ausência de movimentações sintéticas nos saldos e relatórios reais.

O produto local só será declarado pronto quando existir instrução executável de setup, URL local, acesso de teste e roteiro validado. Esses comandos ainda não são entregues como funcionais por esta especificação.

## 7 Roteiro de demonstração

1. Abrir Patos, mostrar marca e entrar como proprietário; identificar o roteiro como teste.
2. Mostrar produto de R$ 32 com ingredientes de R$ 12, embalagem de R$ 1, taxa variável de R$ 1 e dedução estimada de R$ 1,50, todos sintéticos.
3. Abrir turno com fundo conhecido e registrar pedido em uma mesa.
4. Abrir cozinha em outra sessão: pedido ainda ausente. Aprovar no caixa/garçom e conferir entrada uma única vez.
5. Iniciar preparo, concluir e servir. Receber e recarregar a tela.
6. Mostrar relação entre venda, custo, pagamento e contribuição de R$ 16,50 por prato.
7. Registrar conta de fornecedor com vencimento futuro; mostrar efeito na projeção e ausência de saída realizada até a baixa.
8. Fazer uma baixa parcial e verificar saldo remanescente e caixa/banco.
9. Fechar turno e conferir valor esperado, contado e eventual divergência.
10. Mostrar o painel gerencial do Patos e explicar os módulos previstos nos dois planos, sem apresentar outro restaurante como já implantado.
11. Demonstrar emissão, consulta, XML e pacote ao contador no ambiente fiscal validado, identificado na tela. Se houver bloqueio, apresentá-lo explicitamente. Automações bancárias continuam posteriores.

## 8 Matriz de aceitação

Todos os itens abaixo estão **pendentes de implementação/execução** nesta entrega. Não transformar este checklist em evidência de teste aprovado.

Para a primeira versão de restaurante único, os testes `TEN01` a `TEN04` e `PLAN01` a `PLAN02` ficam como bloqueios da futura liberação multiempresa/comercial. Permissões por papel, contexto do Patos, persistência e integridade financeira continuam obrigatórios agora. O teste `AUTH01` continua aplicável ao acesso da equipe atual.

| ID | Teste | Evidência necessária |
| --- | --- | --- |
| TEN01 | Usuário A consulta/altera ID de B | API nega, nenhuma linha alterada |
| TEN02 | Host ausente/desconhecido ou restaurante falsificado no corpo | Nenhum fallback para cliente real |
| TEN03 | Reutilização concorrente de conexão entre A/B | RLS não herda contexto anterior |
| TEN04 | Cache, imagem privada, exportação e job de outro cliente | Nenhum dado cruzado |
| AUTH01 | Revogar funcionário com sessão aberta | Próxima ação negada |
| PLAN01 | Essencial chama API financeira exclusiva diretamente | Negada sem efeitos |
| PLAN02 | Profissional sem permissão financeira | Negada; plano não concede papel |
| ORD01 | Cada canal registra pedido | Pendente, zero tickets e zero baixa |
| ORD01B | Garçom/caixa usa a ação explícita de registrar e enviar | Registro e aprovação auditados, efeitos únicos; canal público não acessa essa operação |
| ORD02 | Duas aprovações simultâneas | Uma aprovação efetiva, tickets/estoque únicos |
| ORD03 | Falta estoque durante aprovação | Transação inteira não produz efeitos parciais |
| ORD04 | Dois setores finalizam simultaneamente | Pedido pronto corretamente, sem perder conclusão |
| ORD05 | Cancelamento após preparo | Não devolver todos os insumos automaticamente |
| ORD06 | Pagamento antes da conclusão | Ticket permanece ativo |
| ORD07 | Mais de 200 pedidos e um ativo antigo | Ativo aparece e totais do período são completos |
| CASH01 | Abertura concorrente de gaveta | Um turno aberto |
| CASH02 | Dinheiro, troco, Pix e cartão | Esperado físico inclui apenas dinheiro |
| CASH03 | Fechar caixa simultaneamente a recebimento | Estado consistente; não gravar em turno fechado |
| CASH04 | Prestação de contas do entregador | Transferência sem segunda receita |
| FIN01 | Venda e pagamento repetidos com mesma chave | Mesma resposta/resultado, sem duplicação |
| FIN02 | Chave repetida com conteúdo diferente | Conflito explícito |
| FIN03 | Duas baixas concorrem pela mesma parcela | Saldo nunca ultrapassado |
| FIN04 | Compra a prazo e baixa parcial | Estoque, obrigação e caixa fecham separadamente |
| FIN05 | Cartão 100, taxa 3, repasse 97 | Uma receita, uma taxa, recebível zerado |
| FIN06 | Reversão financeira | Lançamento original preservado e reversor vinculado |
| FIN07 | Transferência e aporte | Não aumentam receita de vendas |
| COST01 | Alterar custo/receita após atendimento | Histórico permanece estável |
| COST02 | Produto sem custo | Métrica parcial/indisponível, não margem artificial |
| MET01 | Fixture dos dez pratos | Valores iguais ao dicionário e SQL de conferência |
| MET02 | Meio da noite e filtro de período | Dia operacional e competência corretos |
| UX01 | Recarregar e entrar em outro navegador | Dados persistidos e consistentes |
| UX02 | 360, 390 e 430 px; desktop | Ações usáveis, sem corte de valores/controles |
| UX03 | Ação falha ou conexão cai | Sem mensagem falsa de sucesso; tentativa retomável |
| MIG01 | Schema e registros atuais antes/depois | Migração versionada sem perda nem reaplicação de dados |
| REC01 | Recuperação e limpeza das fixtures | Procedimento definido e somente registros de teste removidos |
| FISC01 | Emitente/configuração ausente | Envio bloqueado com motivo; zero chamada real |
| FISC02 | Emissão e consulta na homologação | Chave, protocolo, XML e estado conferidos no provedor |
| FISC03 | Duas solicitações/repetição | Sem segunda emissão acidental |
| FISC04 | Timeout após envio | Consulta pela mesma referência antes de reenvio |
| FISC05 | Rejeição e cancelamento recusado | Estado verdadeiro e motivo preservado |
| FISC06 | Cancelamento permitido | Evento/protocolo recuperável, sem apagar original |
| FISC07 | Exportação e evento sobre nota anterior | XMLs, eventos, índice, contagens e totais conferidos |
| FISC08 | Documento autorizado sem arquivo disponível | Autorização preservada; exportação incompleta explícita e retomável |
| FISC09 | Troca de ambiente/usuário sem permissão | Teste separado de produção e acesso indevido negado |
| FISC10 | Canal real, impressora e indisponibilidade | Roteiro operacional aprovado antes de usar como único emissor |

Testes de conectores bancários futuros e de retornos fiscais quando aplicáveis: assinatura inválida, evento duplicado, evento atrasado, timeout, consulta antes de reenvio, chave de outra conta, troca de ambiente, rejeição fiscal, estorno após fechamento e relatórios com múltiplos repasses.

## 9 Critérios de conclusão

“Implementado” requer interface, API e persistência. “Validado” requer executar o fluxo e conferir os efeitos. “Pronto para apresentar” requer cenário reproduzível com dados sintéticos e limitações claras. “Pronto para operar em produção” acrescenta migração autorizada, backup/restauração, monitoramento, credenciais reais e testes das integrações anunciadas.

Typecheck, lint e build são verificações necessárias quando houver código, mas não substituem os testes de fluxo e saldo. Registrar comandos, resultado, versão local e falhas restantes no relatório da implementação. Não executar cobranças reais, emitir notas reais ou alterar dados de clientes para demonstrar o sistema.
