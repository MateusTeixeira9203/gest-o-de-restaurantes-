# Gestor Food arquitetura do produto

**Comece pelo [Manual do produto e plano de implementação](PRODUTO-COMPLETO-E-PLANO-DE-IMPLEMENTACAO.md).** Ele é a referência principal de escopo: produto completo, nome, design, arquitetura, regras, 16 blocos de execução, testes e aceite do proprietário. Os documentos abaixo são apoio; divergências de escopo devem ser reconciliadas no manual mestre.

Especificação proposta em 7 de outubro de 2026 para transformar a base do Patos Lanches em uma plataforma de restaurantes personalizável, com os planos Essencial e Profissional. Gestor Food é o nome provisório do produto; Patos Lanches é a marca do restaurante. A apresentação pretendida é sábado, 10 de outubro de 2026.

O desenho mantém um repositório, uma aplicação principal e um banco de produção compartilhado, com isolamento por restaurante. Identidade visual, configuração operacional, plano e permissões são dimensões independentes. O financeiro integra vendas, custos, obrigações e recebimentos, sem tratar tudo como dinheiro em caixa.

**Recorte atual de execução:** primeiro evoluir o Patos Lanches como restaurante único, com operação, financeiro e emissão fiscal das vendas em Minas Gerais. Novos clientes, múltiplos endereços e ativação comercial dos planos ficam para a próxima etapa. A [primeira versão](PRIMEIRA-VERSAO.md) e o [piloto fiscal em MG](FISCAL-MG.md) definem essa entrega; a arquitetura multiempresa permanece como destino.

**Estado atual:** MVP local 0.2 com migrações aplicadas, commits organizados e testes de operação, financeiro e isolamento. Veja [o que foi entregue e o que ficou pendente](ENTREGA-LOCAL-2026-10-07.md). O manual continua sendo o escopo completo; não confundir o recorte implementado com aceite de todos os blocos. Não houve push nem deploy.

## Documentos

| Documento | Conteúdo |
| --- | --- |
| [Manual completo do produto](PRODUTO-COMPLETO-E-PLANO-DE-IMPLEMENTACAO.md) | Contrato de escopo, design, arquitetura, funcionalidades, sequência B00–B15, dependências e testes por bloco |
| [Simulação de 20 mesas](SIMULACAO-20-MESAS.md) | Ensaio local persistido de 09/10: falhas de concorrência, tempos, evidências e melhorias propostas |
| [Estado verificado e melhorias](ESTADO-E-MELHORIAS.md) | GitHub, Vercel, verificações públicas, capacidades atuais e prioridades da primeira versão |
| [Primeira versão do Patos](PRIMEIRA-VERSAO.md) | Escopo atual, ordem de execução e critérios de uso da primeira entrega |
| [Arquitetura](ARQUITETURA.md) | Produto, personalização, planos, acesso, módulos, entidades, APIs, fluxos e migração |
| [Financeiro e métricas](FINANCEIRO-E-METRICAS.md) | Modelo financeiro, fórmulas, exemplos, custo por prato, caixa, recebíveis e resultados |
| [Fiscal do piloto em MG](FISCAL-MG.md) | NFC-e/NF-e, avaliação da Focus, dependências, exportação ao contador e critérios de liberação |
| [Pesquisa e integrações](PESQUISA-E-INTEGRACOES.md) | Fontes, alternativas fiscais e de pagamentos, custos e condições de ativação |
| [MVP e validação](MVP-E-VALIDACAO.md) | Escopo de demonstração, sequência, dependências e testes de aceitação |

## Decisões principais

1. Evoluir Next.js, TypeScript e PostgreSQL existentes como uma aplicação dividida em módulos internos. Não reconstruir o produto nem criar um repositório por cliente.
2. Usar `restaurant_id` como fronteira de dados no primeiro lançamento. Um restaurante representa um estabelecimento; gestão de redes fica para evolução, mantendo vínculos de usuários preparados para múltiplos estabelecimentos.
3. Adotar dois pacotes de licença: `essential` e `professional`. Ambos permitem personalização. O Profissional acrescenta gestão financeira e conectores; cada integração exige configuração própria.
4. O cliente solicita; o garçom ou caixa autorizado confere e aciona “Enviar para cozinha”. Registro e aprovação são eventos auditáveis; a interface pode reuni-los nessa ação explícita quando o atendente estiver lançando o pedido. O canal do cliente nunca libera produção sozinho.
5. Separar produção, pagamento, liquidação financeira e documento fiscal. Pagar não significa ter entregue; aprovar um cartão não significa que o dinheiro chegou ao banco.
6. Proteger o histórico de preço, receita de produção, custos e taxas. Alterar o cadastro de hoje não deve reescrever o resultado de ontem.
7. Construir primeiro um financeiro que funciona com lançamentos e recebimentos manuais auditados. Automatizar fornecedores específicos depois, usando o mesmo modelo de dados.
8. Neste piloto, trabalhar no projeto e no banco atuais, conforme autorização do proprietário, preservando registros e identificando testes. Usar homologação no provedor fiscal, sem exigir outra aplicação ou banco. Reavaliar ambientes de desenvolvimento após início da operação comercial.

## Limites comerciais que ainda precisam de definição

Os valores de R$ 2.400 e R$ 4.500 são referências anteriores, não preços aprovados por esta arquitetura. A intenção atual é licença vitalícia, com parcelamento de até seis vezes ainda negociável. Esse parcelamento pertence à venda da licença pela plataforma, não às regras de pagamento das refeições.

O custo recorrente de emissão fiscal será do restaurante, conforme decisão do proprietário do produto. Hospedagem, banco, suporte, atualizações, armazenamento e manutenção das integrações também têm custos recorrentes; o responsável por esses custos e a abrangência da licença vitalícia continuam pendentes. Registrar essas condições antes de entregar proposta comercial definitiva.

O alvo de sábado é um piloto funcional com dados persistidos e emissão/exportação fiscal testadas. A ativação fiscal real depende do emitente e da aprovação dos testes, sem garantia antecipada de prazo. Integração universal de pagamentos, conciliação automática, operação offline e redes de lojas permanecem fora do primeiro recorte.
