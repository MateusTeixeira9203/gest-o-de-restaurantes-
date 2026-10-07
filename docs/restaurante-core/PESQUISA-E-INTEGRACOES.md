# Pesquisa e integrações do Gestor Food

Consulta a fontes oficiais em 07/10/2026. As escolhas de fornecedor abaixo são candidatas para validação técnica/comercial, não integrações já disponíveis nem contratação realizada. O objetivo é manter o núcleo independente do provedor e avaliar primeiro o serviço que atende ao piloto Patos em Minas Gerais. O [recorte fiscal atualizado](FISCAL-MG.md) inclui emissão das vendas e exportação ao contador.

## 1 Fontes e efeito sobre o produto

| Fonte | Evidência utilizada | Decisão de produto |
| --- | --- | --- |
| [Abrasel sobre CMV](https://abrasel.com.br/noticias/noticias/abrasel-lanca-cartilha-gratuita-cmv-bares-restaurantes-controle-de-custos/) | Controle de insumos, fichas, porcionamento e inventários sustentam a leitura de custos | Exibir cobertura de custos e perdas, não somente uma porcentagem de margem |
| [Sebrae sobre bares e restaurantes, página 9](https://bibliotecas.sebrae.com.br/chronus/ARQUIVOS_CHRONUS/bds/bds.nsf/0ca36cbefa1addee631efeda4196923d/$File/Bares_Restaurantes.pdf) | Contribuição, ponto de equilíbrio e acompanhamento de caixa | Separar margem por prato, despesas fixas e caixa; não usar benchmarks antigos como meta |
| [PostgreSQL sobre RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) | Políticas por linha e exceções de privilégios | Testar leitura/escrita com papel real da aplicação e negar contexto ausente |
| [Vercel para plataformas](https://vercel.com/docs/platforms) | Aplicação compartilhada com domínios de clientes | Um projeto principal e identidade por restaurante |
| [Focus NFe API](https://doc.focusnfe.com.br/reference/introducao) | Emissão/consulta por API e diferentes documentos | Conector fiscal por emitente, com referências e ambientes separados |
| [Focus sobre preparação do sistema](https://2025.focusnfe.com.br/guides/preparando-sistema/) | Cadastros fiscais e tentativas separadas do documento | Venda, emissão e tentativas têm modelos distintos |
| [Mercado Pago relatório de liberações](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/reports/released-money/introduction) | Liberação, bloqueios, parcelas e diferença entre faturamento e saldo | Separar autorização, recebível e liquidação; conciliar por evento |
| [Efí webhooks Pix](https://dev.efipay.com.br/docs/api-pix/webhooks/) | Retornos e simulação no ambiente de homologação | Candidato a uma integração Pix específica, sujeita ao seu mecanismo de autenticação |

Alguns PDFs antigos do portal Sebrae redirecionaram para o índice genérico; não foram usados como prova de fórmulas ou regras. O PDF do guia de bares e restaurantes acima foi acessível. A página de anúncio da cartilha Abrasel foi acessível; o PDF completo excedeu o limite de leitura do navegador de pesquisa. Não foram extraídas metas percentuais desse material.

## 2 Fiscal

Candidato inicial: Focus NFe, pela disponibilidade de documentação e tabela pública de preços. Nuvem Fiscal permanece alternativa para comparação; as páginas técnicas retornaram erro na leitura desta sessão, portanto preço e compatibilidade não foram validados. Não escolher provedor apenas pelo menor preço de entrada.

A homologação exige levantar UF, CNPJ/estabelecimento, inscrição e regime aplicáveis, cadastro de produtos, certificado, credenciamento e configurações exigidas pelo documento/provedor. A escolha entre NFC-e, NF-e ou outro documento depende da operação e das regras aplicáveis. Não assumir que NFS-e é o documento padrão de toda venda de restaurante. O contador do cliente valida parâmetros fiscais, inclusive mudanças de leiaute vigentes.

O perfil fiscal é versionado por emitente e produto: classificação, origem, tributação e vigência. Não embutir uma alíquota fixa no código nem copiar o perfil de outro restaurante. Minas Gerais foi confirmada e pesquisada no plano fiscal do piloto. Município, regime e situação do emitente ainda precisam ser informados; outras UFs exigirão pesquisa própria.

Fluxo proposto: consolidar a operação fiscal → validar cadastro → gerar referência estável → criar solicitação → enviar pelo adaptador → registrar resultado ou estado pendente → consultar/receber retorno → guardar XML e documento auxiliar autorizado → oferecer consulta ao usuário. Fiscal não muda o estado de preparo nem cria outro recebimento.

Estados: não solicitado, aguardando configuração, pendente, processando, autorizado, rejeitado, cancelamento solicitado, cancelado, erro temporário e contingência quando efetivamente suportada. O formato exato depende do provedor; a tela apresenta uma tradução comum sem descartar o estado original.

Cada tentativa registra versão do payload, referência, erro e horário. Após timeout, consultar antes de emitir de novo. Cancelamento fiscal tem autorização, motivo e regras do documento; não decorre automaticamente de apagar um pedido. Autorização fiscal posterior ao cancelamento comercial exige resolução explícita.

Emissão não exige relação rígida de um pedido para uma nota: uma comanda pode consolidar vários pedidos, e cancelamentos/substituições exigem histórico. Modelar vínculo documento–operação–itens, preservando documentos anteriores.

Antes de ativar: testar emissão, consulta, rejeição, repetição, cancelamento permitido, certificado inválido, indisponibilidade e retorno duplicado. Gerar documento em homologação não prova autorização em produção. Contingência precisa de implementação e teste do provedor escolhido; não usar esse nome para simples armazenamento offline de uma venda.

## 3 Referência de custo fiscal

A página oficial da Focus NFe consultada em 07/10/2026 apresenta o plano Retail para um emitente por **R$ 62,90/mês**, incluindo **500 NFC-e e 100 NF-e**, com **R$ 0,055 por NFC-e adicional** e **R$ 0,16 por NF-e adicional**. É referência pública, sujeita às condições comerciais e reconfirmação antes da contratação. [Tabela oficial](https://focusnfe.com.br/precos/).

Exemplos aritméticos de volume, supondo o mesmo plano, sem NF-e excedente e sem outros custos:

| NFC-e mensais | Cálculo | Total estimado do provedor |
| --- | --- | ---: |
| 500 | Mensalidade | R$ 62,90 |
| 1.000 | 62,90 + 500 × 0,055 | R$ 90,40 |
| 3.000 | 62,90 + 2.500 × 0,055 | R$ 200,40 |

O fornecedor informa uso de certificado A1 em sua API. Certificado, implantação fiscal, assistência contábil, conectividade e eventuais serviços adicionais precisam de orçamento separado. O custo mensal não será apresentado ao cliente como “R$ 62,90 fixos para qualquer volume”. [Condições e certificado](https://focusnfe.com.br/precos/).

Preferência proposta: o restaurante contrata/paga sua conta fiscal e autoriza a integração. Se a plataforma contratar um pacote para vários emitentes e repassar custo, precisa controlar consumo, cotas e inadimplência por cliente, além de confirmar condições de revenda e suporte. Nenhum contrato foi escolhido nesta etapa.

## 4 Pagamentos

Separar três modalidades comerciais/técnicas:

| Modalidade | Primeiro tratamento | Automação futura |
| --- | --- | --- |
| Dinheiro | Registro, troco, custódia e conferência | Não exige gateway |
| Pix recebido fora do sistema | Conferência manual identificada | Cobrança Pix vinculada ao pedido e confirmação pela API |
| Cartão em maquininha independente | Registro manual com adquirente e referência disponível | Integração presencial específica ou importação de relatórios |
| Pagamento online | Fora do primeiro núcleo manual | Checkout/tokenização do fornecedor, retorno validado e reembolso |

Candidatos de pesquisa: Mercado Pago para pagamento/relatórios e Efí para Pix. Escolha depende dos meios já usados por Patos e choperia, acesso à conta, taxas contratadas, modalidade presencial/online e compatibilidade. Ter API de Pix não significa conciliar qualquer maquininha; API de checkout online não prova suporte a terminal físico.

Cada restaurante recebe em sua própria conta no provedor. Usar OAuth ou credencial individual conforme o modelo suportado; segredo armazenado somente no servidor. Conta da plataforma que vende licenças é outra operação, com outro recebedor e registros separados.

Na integração automática: nunca confiar na página de “pagamento aprovado” do navegador. Confirmar por chamada/autenticação do provedor, validar valor, moeda, referência e recebedor. Eventos duplicados, fora de ordem e atrasados precisam de testes. Não armazenar dados completos do cartão; usar interface/tokenização apropriada do fornecedor.

O parcelamento de até seis vezes é uma intenção para comercialização da licença, ainda negociável. Não assumir aprovação, ausência de juros, taxa ou recebimento imediato. Cadastro comercial guarda valor total, entrada, parcelas, custo e valor líquido conforme a contratação. Isso não impõe seis parcelas à venda de refeições.

## 5 Conciliação automática

Escolher um primeiro layout e provedor. O conector busca/importa movimentos, normaliza referências e compara com recebíveis. Deve distinguir venda, taxa, repasse, retenção, reembolso, antecipação e transferência. Toda regra automática gera evidência e pode ser revisada.

A documentação do Mercado Pago informa que relatórios de contas de teste podem ser gerados sem dados financeiros, por limitação do ambiente. Por isso, testar o parser com fixtures sintéticas no layout oficial e validar leitura em conta autorizada quando disponível; relatório vazio não comprova conciliação completa. [Limitações de teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-api-orders/resources/reports/released-money/introduction).

Não haverá acesso bancário universal por padrão. Conectores bancários/Open Finance, consentimento, custos e cobertura são avaliação posterior. Começar com conciliação manual e arquivos conhecidos permite testar a lógica sem movimentar dinheiro real.

## 6 Licença vitalícia e operação continuada

Decisões confirmadas pelo proprietário do produto: dois planos, ambos personalizáveis; intenção de licença vitalícia; fiscal recorrente por conta do cliente; parcelamento até seis vezes a negociar. Preços anteriores permanecem referência até confirmação.

Decisões pendentes: significado e duração do direito de uso, módulos incluídos, limite de estabelecimentos/CNPJs, suporte, correções, grandes atualizações, hospedagem/banco, backups, mudanças tributárias, customizações e encerramento/exportação. O texto comercial final deve explicitar essas condições; esta arquitetura não substitui sua definição contratual.

Separar no modelo `license_entitlement` de `service_agreement`. A primeira representa o direito adquirido; a segunda, serviços recorrentes. Falha temporária de uma API fiscal não pode invalidar a licença nem apagar dados. Tratamento de inadimplência e fim da hospedagem precisa de política própria, sem bloquear uma operação em andamento de forma inesperada.

Modelo econômico a calcular antes da venda definitiva:

`margem da implantação = preço líquido da licença − custo de implantação − personalização − treinamento − suporte inicial`

`custo recorrente por cliente = infraestrutura atribuída + armazenamento/backup + suporte esperado + manutenção de conectores + serviços externos assumidos pela plataforma`

Um banco compartilhado reduz administração; não zera custo de manutenção. Se só a emissão fiscal for cobrada mensalmente e os demais serviços forem incluídos, a plataforma precisa financiar o restante. Não há estimativa de margem comercial validada sem esses dados.

## 7 Dados necessários para a primeira integração

- MG confirmada; faltam município, cadastro do emitente, regime, situação de A1/credenciamento/CSC e validação fiscal do primeiro estabelecimento.
- Número aproximado de vendas/documentos por mês e horários de pico.
- Provedor/maquininha/conta Pix utilizados; desejo de manter ou trocar.
- Se há impressão de cozinha, impressora fiscal/ térmica, TEF ou dispositivo específico.
- Formato que o contador recebe hoje e categorias essenciais.
- Responsável por contratar e renovar cada serviço externo.

Essas informações não impedem projetar nem implementar o núcleo manual. Elas impedem prometer compatibilidade e prazo de homologação de integrações específicas.
