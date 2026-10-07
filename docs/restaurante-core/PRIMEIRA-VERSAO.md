# Primeira versão do Gestor Food

Recorte atualizado em 07/10/2026: evoluir primeiro a aplicação atual do Patos Lanches, como restaurante único. A decisão sobre implantação de outros clientes, domínios e comercialização será retomada depois. Este recorte orienta a primeira entrega e prevalece sobre a proposta inicial de implementar dois restaurantes antes do financeiro.

Gestor Food é o nome provisório da plataforma. A aplicação do estabelecimento continua com a identidade Patos Lanches. Não renomear o restaurante, seu identificador no banco ou os projetos remotos como consequência da escolha de nome do produto.

Atualização do recorte: primeiro piloto em Minas Gerais; incluir emissão das vendas e exportação ao contador, avaliando Focus NFe. Trabalhar no projeto e banco atuais, sem criar outro ambiente da aplicação. O [plano fiscal](FISCAL-MG.md) detalha requisitos e limites.

**Estado:** escopo definido para implementação. Os recursos abaixo ainda não foram implementados por esta documentação.

## Objetivo

Permitir que o proprietário acompanhe a operação completa e responda quanto vendeu, recebeu, pagou, tem a pagar/receber e qual a contribuição de cada produto. Reaproveitar a identidade, os cadastros e os fluxos atuais do Patos. A primeira versão demonstrará a capacidade financeira prevista para o Profissional; a venda e a atribuição comercial de planos não são necessárias para testar esses recursos.

## O que entra

| Bloco | Entrega funcional |
| --- | --- |
| Pedidos e aprovação | Pedido de qualquer canal entra pendente; garçom/caixa autorizado aprova; somente então a cozinha recebe |
| Operação consistente | Evitar duplicação de aprovação; pagamento não encerra preparo; cancelamento distingue devolução de insumo e desperdício |
| Caixa operacional | Abertura, fundo, recebimentos, troco, sangria, suprimento, despesa em espécie, contagem e fechamento com diferença |
| Contas financeiras | Caixa físico, banco e recebíveis de cartão; transferência entre contas sem gerar receita ou despesa |
| Contas a pagar e receber | Cadastro de contraparte, categoria, valor, competência e vencimento; baixa parcial/total, saldo pendente e atraso |
| Fluxo de caixa | Entradas e saídas realizadas; previsão de 7 e 30 dias com obrigações/recebíveis em aberto |
| Custo dos produtos | Receita por variante, custo dos insumos, embalagem/adicionais, custo preservado na venda e aviso de ficha incompleta |
| Painel gerencial | Vendas, recebimentos, pagamentos, contas vencidas, CMV estimado, contribuição por produto e resultado gerencial conforme dados disponíveis |
| Fiscal das vendas | NFC-e nas operações elegíveis, NF-e conforme necessidade validada, consulta, rejeições, cancelamento permitido e XML/documento auxiliar; produção depende da configuração do emitente e testes |
| Exportação ao contador | Pacote por período com XMLs, eventos e índice conferido; documentos de homologação separados |
| Histórico | Filtros por período com agregação no banco, sem depender dos últimos 200 pedidos carregados |
| Permissões | Operação por papel; caixa e financeiro restritos às pessoas autorizadas; eventos relevantes com autor e horário |

Manter os fluxos existentes de salão, retirada e entrega. O primeiro roteiro de teste pode começar pelo salão e seguir para os demais canais; isso não significa remover delivery da base.

Regra de atendimento confirmada: cliente pede → garçom ou caixa confere → ação “Enviar para cozinha” → produção. No lançamento presencial, essa ação pode registrar e aprovar atomicamente, sem dois cliques obrigatórios. Pedido recebido do cliente pelo cardápio digital sempre aguarda o envio pelo atendente. A autorização deve ser verificada no backend.

## Como a operação alimenta o financeiro

1. O pedido é registrado e aguarda aprovação, sem receita realizada nem produção iniciada.
2. A aprovação válida gera os tickets e registra o custo/estoque uma vez.
3. O atendimento reconhece venda e consumo na visão gerencial.
4. O recebimento quita o consumidor total ou parcialmente. Cartão pode continuar a receber da adquirente.
5. A liquidação informa em qual conta o dinheiro ficou disponível e quais taxas foram cobradas.
6. Despesas e obrigações completam o fluxo de caixa e o resultado do período.
7. Fechamento de caixa compara o dinheiro físico com o esperado e preserva diferenças.

As fórmulas e regras detalhadas estão em [Financeiro e métricas](FINANCEIRO-E-METRICAS.md). A interface não chama margem de contribuição de lucro líquido, nem custo desconhecido de custo zero.

## O que fica para depois

Cadastro de novos restaurantes, múltiplos domínios, portal da plataforma, licenciamento/checkout automatizado, aplicação dos dois planos em vários clientes, cobrança/retorno bancário automático e conciliação automática com fornecedores externos.

Na primeira versão, registrar pagamentos recebidos fora do sistema será uma ação manual identificada. A venda alimenta o financeiro interno automaticamente, mas o sistema não afirma ter confirmado o pagamento junto ao banco. Fiscal entra no piloto com integração real a validar; nenhum conector terá botões que simulem conclusão.

Importação de extratos, recorrência de contas, parcelamentos avançados, layouts contábeis específicos além do pacote de XMLs/índice e relatórios adicionais entram após o núcleo validado. Cadastro simples de despesas, obrigações e baixas não depende deles.

## Preparação para evitar retrabalho

Todos os registros novos pertencem ao restaurante atual por `restaurant_id`. Serviços novos recebem contexto do restaurante no servidor, sem confiar em um identificador enviado pelo navegador. Isso facilita a evolução posterior, mas não equivale a afirmar que a aplicação já pode atender múltiplos clientes com segurança.

Separar os módulos de operação, caixa, financeiro e custos gradualmente. Preservar referências de origem e idempotência, valores em centavos, snapshots de custos e histórico de reversões. Não vincular regras financeiras ao nome Patos nem criar outra cópia de código para a choperia.

Usar o banco atual, pois o proprietário informou que a operação comercial ainda não começou. Conferir schema, contagens e recuperação antes de aplicar alterações aditivas; preservar IDs e histórico. Testes usam registros identificados, sem reset global. A homologação fiscal é selecionada no conector e não exige outra aplicação ou banco. Sem commits, pushes ou publicação enquanto vigorar a orientação atual.

## Ordem de execução

1. Conferir ambiente, baseline das migrações, schema atual e recuperação dos dados.
2. Corrigir aprovação e transições operacionais.
3. Implementar caixa, contas financeiras e registro único dos recebimentos.
4. Implementar contas a pagar/receber e fluxo realizado/projetado.
5. Integrar fichas técnicas, custos históricos e painel gerencial.
6. Integrar fiscal e exportação conforme o plano de MG; iniciar cadastro do emitente enquanto o núcleo é desenvolvido.
7. Validar persistência, concorrência, permissões, números conhecidos e fiscal antes de liberar cada capacidade.

## Critério de primeira versão utilizável

O usuário deve conseguir abrir caixa, lançar e aprovar pedido, acompanhar preparo, atender, receber, lançar uma obrigação, fazer uma baixa parcial, conferir fluxo e contribuição e fechar o caixa. Ao recarregar e entrar em outra sessão autorizada, os mesmos dados e saldos devem aparecer.

O caminho completo precisa passar com registros de teste identificados no banco atual, além de typecheck, lint e build. Fiscal requer evidências próprias de homologação e liberação real; não tratar ausência de credenciais como teste aprovado. Os testes de idempotência, concorrência, custos e caixa do [plano de validação](MVP-E-VALIDACAO.md) permanecem necessários. Testes entre dois restaurantes passam a ser condição da etapa multiempresa, antes de cadastrar outro cliente no ambiente compartilhado.
