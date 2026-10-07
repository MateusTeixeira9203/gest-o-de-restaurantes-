# Fiscal do primeiro piloto em Minas Gerais

Decisão de 07/10/2026: o primeiro piloto será o Patos, em Minas Gerais. O escopo fiscal solicitado é emitir documentos das vendas e exportá-los para o contador. Importação de notas de fornecedores não faz parte desta entrega. Focus NFe será avaliada como primeiro provedor; nenhuma contratação ou credencial foi confirmada.

**Estado: especificação pesquisada; integração ainda não implementada nem testada.** Este documento atualiza o recorte fiscal dos documentos anteriores. A emissão deixa de ser apenas evolução futura e passa a ser objetivo do piloto, com liberação real condicionada à configuração e aos testes. Não representa promessa de conclusão em dois dias.

## 1 Trabalho no projeto atual

Usar a aplicação e o banco atuais, conforme orientação do proprietário: o sistema ainda não começou a operação comercial. Não criar outro projeto Vercel ou outro banco como condição para começar. Preservar registros, conferir o schema e o mecanismo de recuperação antes de migrações; preferir alterações aditivas e identificar dados de teste. Não apagar cadastros nem reiniciar o banco para preparar o piloto.

A homologação fiscal é uma configuração da integração, não uma segunda aplicação. A Focus tem URLs distintas para testes sem validade fiscal e produção com validade fiscal. Separar documentos, referências e credenciais por ambiente dentro do modelo. Nunca promover XML de teste a nota real. [Ambientes da Focus](https://doc.focusnfe.com.br/reference/ambiente).

Continuam valendo as instruções de não fazer commits, pushes ou publicações nesta fase. O fato de o banco ainda não estar em uso comercial não equivale a autorizar emissão fiscal real como teste.

## 2 Documento adequado à operação

A NFC-e, modelo 65, atende operações internas de varejo ao consumidor final não contribuinte, inclusive restaurantes. O art. 27 também admite determinadas entregas em domicílio e mantém NF-e nas hipóteses próprias. A restrição ao comércio eletrônico no § 6º, V, menciona estabelecimento não varejista; portanto, pedido pela internet não implica automaticamente NF-e. Conferir o enquadramento do estabelecimento e a operação com o contador. [RICMS/MG, Anexo V, art. 27](https://www.fazenda.mg.gov.br/empresas/legislacao_tributaria/ricms_2023_seco/anexov2023_2.html).

A FAQ do portal apresenta uma vedação de comércio eletrônico mais abrangente que o texto consolidado consultado. A implementação não deve copiar essa simplificação. Guardar a origem do pedido separadamente do enquadramento fiscal; a aprovação pelo garçom também não transforma a natureza da venda.

Proposta de implementação: começar pela NFC-e das operações elegíveis do piloto. Acrescentar a NF-e modelo 55 para as operações efetivamente necessárias, depois de confirmar o cadastro. Venda fora da matriz fiscal validada deve ficar explicitamente sem cobertura no piloto; não improvisar o documento. Se esse tipo de venda fizer parte da rotina de abertura, sua cobertura vira requisito para iniciar o uso comercial.

## 3 Dependências para ativar

| Informação ou acesso | Situação nesta conversa | Responsável por fornecer/validar |
| --- | --- | --- |
| UF | Minas Gerais confirmada | Proprietário |
| Município, razão social, CNPJ, IE e endereço | Não informados | Restaurante/contador |
| Regime e enquadramento tributário | Não informados | Contador |
| Certificado A1 válido | Posse não confirmada | Restaurante |
| Credenciamento e CSC/ID aplicáveis | Não confirmados | Restaurante/contador |
| Conta Focus e acesso para testes | Ainda não contratada; em avaliação | Proprietário/restaurante |
| Perfil fiscal de produtos e operações | Não cadastrado/validado | Contador com apoio do restaurante |
| Série, numeração e documentos anteriormente emitidos | Não verificados | Restaurante/contador |
| Impressora e conexão no local | Não verificadas | Restaurante |
| Formato de entrega ao contador | Exportação solicitada; layout específico não informado | Contador |

A SEF/MG orienta o credenciamento e a obtenção de CSC; o software não substitui esse cadastro. A Focus aceita certificado A1, não A3. [Credenciamento em MG](https://portalsped.fazenda.mg.gov.br/spedmg/nfce/credenciamento/), [certificado compatível](https://focusnfe.com.br/precos/).

Não solicitar certificado, senha ou token em conversa. Configurar segredos por canal seguro no provedor/servidor; o navegador recebe apenas estado da configuração. Não presumir ausência de documentos anteriores só porque este será o primeiro sistema integrado.

## 4 Fluxo a implementar

1. Garçom ou caixa registra/confere e envia o pedido à cozinha; esse fluxo continua independente do fiscal.
2. A operação comercial consolida itens, descontos, adicionais, entrega, destinatário e condições de pagamento. Definir com o contador o momento de emissão por canal, sem esperar arbitrariamente o fechamento diário ou o recebimento bancário.
3. O servidor valida restaurante, papel, emitente e perfil fiscal vigente. Dados faltantes bloqueiam o envio e aparecem como pendência concreta.
4. Criar documento e snapshot dos dados em transação local, com referência estável. Vincular os itens da operação para impedir dupla emissão acidental do mesmo conjunto.
5. Enviar à Focus fora da transação de banco, com tentativa persistida. O retorno fiscal deve ser interpretado, não apenas o HTTP de sucesso.
6. Autorizado: persistir chave, número, série, protocolo e horários; guardar XML autorizado e disponibilizar documento auxiliar. Rejeitado: preservar motivo e permitir correção auditada. Sem resposta: consultar a mesma referência antes de reenviar.
7. Mostrar estado fiscal no atendimento e na gestão. Pagamento, entrega e autorização fiscal continuam com estados separados. Emitir nota não baixa conta a receber nem duplica receita.
8. Permitir consulta/reimpressão e exportação por período, sem nova emissão.
9. Cancelamento fiscal exige ação autorizada, motivo e verificação das regras; não decorre de apagar pedido, estornar pagamento ou devolver estoque.

A Focus documenta a emissão NFC-e como síncrona. Isso não elimina timeout, resultado desconhecido nem recuperação. O estado local precisa suportar consulta e retomada; não exigir webhook para concluir toda NFC-e. [Emissão NFC-e](https://doc.focusnfe.com.br/reference/emitir_nfce).

## 5 Dados e contratos propostos

| Entidade | Dados e responsabilidade |
| --- | --- |
| `fiscal_profiles` | Restaurante, emitente, regime, ambiente, conexão e versão validada; apenas referência para segredos |
| `product_tax_profiles` | Produto/variante, classificação e regras aprovadas, vigência e autor da alteração |
| `fiscal_documents` | Modelo, ambiente, referência, estado, totais, snapshot, chave, número, série e protocolo |
| `fiscal_document_items` | Itens e quantidades da operação representados no documento, com histórico de substituição |
| `fiscal_attempts` | Documento, operação, hash do payload, tentativa, resultado e horário; erros sem segredos |
| `fiscal_events` | Autorizações, cancelamentos e demais eventos com origem e protocolo |
| `fiscal_files` | XML/evento/documento auxiliar em armazenamento privado, checksum e situação de recuperação |
| `fiscal_exports` | Restaurante, ambiente, período, seleção, arquivos incluídos/faltantes e autor |

Todas as relações novas carregam `restaurant_id`; consultas e alterações recebem esse contexto no servidor. Referências únicas incluem conexão e ambiente. Números e séries têm um único responsável por atribuição, conforme acordo com o provedor. Não usar contador em memória nem supor que série começa em 1.

Módulo proposto `lib/fiscal/`: validação e snapshots, serviço de documentos, repositório e adaptador Focus. Rotas propostas autenticadas: listar/emitir/consultar/cancelar documentos em `/api/fiscal/documents`, obter arquivos privados e gerar exportações em `/api/fiscal/exports`. Tela `/gestao/fiscal` com configuração, pendências, documentos e exportação. Não expor token da Focus nem deixar o navegador escolher livremente a URL do provedor.

Valores monetários locais continuam em centavos; conversão ao contrato externo usa precisão decimal controlada. Totais fiscais e pagamentos precisam fechar, incluindo rateio de descontos e arredondamentos. NCM, CFOP, CST/CSOSN e demais tributos/regras aplicáveis são configuração validada, não números presumidos a partir do nome do prato. Incluir os campos e leiautes vigentes na data da implantação com o provedor e o contador.

## 6 Pacote para o contador

Proposta: selecionar período e baixar ZIP com XMLs autorizados, XMLs de eventos pertinentes e índice CSV. O índice identifica chave, modelo, número/série, data, valor e estado, além de apontar documentos/arquivos faltantes. Documentos auxiliares podem acompanhar o pacote; não substituem o XML.

Separar produção e homologação. Preservar notas canceladas e respectivos eventos, sem apresentá-las como faturamento ativo. Permitir consultar tanto documentos emitidos no período quanto eventos ocorridos no período sobre notas anteriores, evitando omissão de cancelamentos tardios no pacote mensal. Identificar o critério e o fuso usados na exportação.

Comparar quantidade e totais do índice com a seleção no banco. Arquivo incompleto aparece como incompleto; registrar falha e permitir nova tentativa. Exportação não envia e-mail automaticamente e não significa transmissão de SPED, apuração ou pagamento de imposto. O usuário baixa e encaminha ao contador; envio automático poderá ser contratado/implementado depois.

## 7 Falhas e limites operacionais

| Cenário | Comportamento exigido |
| --- | --- |
| Clique repetido ou dois operadores | Mesma solicitação; sem segunda nota acidental |
| Timeout depois de envio | Resultado desconhecido, consulta antes de reenvio |
| HTTP aceito com rejeição fiscal | Exibir rejeição, nunca nota autorizada |
| Certificado expirado/CSC inválido | Pendência fiscal visível e acesso à correção |
| Documento autorizado, download indisponível | Preservar autorização, recuperar arquivo depois, sinalizar exportação incompleta |
| Reimpressão | Reutilizar documento; não consumir nova numeração |
| Cancelamento recusado | Preservar nota autorizada, motivo e pendência de tratamento |
| Alteração de cadastro após emissão | XML e snapshot históricos permanecem intactos |
| Troca de ambiente | Exibição e referências separadas; nenhuma nota de teste tratada como real |
| Internet local indisponível | Não afirmar funcionamento offline de aplicação hospedada; seguir procedimento operacional validado |

A contingência fiscal possui geração, impressão e transmissão posterior próprias; uma fila de pedidos offline não a substitui. Definir e testar a solução do piloto com provedor/contador antes de o sistema se tornar o único emissor. A funcionalidade depende também de internet e equipamento locais. [Contingência em MG](https://portalsped.fazenda.mg.gov.br/spedmg/nfce/page/).

Prazos e condições de cancelamento são específicos do documento/operação. A interface deve consultar/aplicar a regra vigente, preservar recusas e orientar tratamento fora do prazo; não oferecer cancelamento ilimitado. [Cancelamento NFC-e em MG](https://portalsped.fazenda.mg.gov.br/spedmg/nfce/Cancelamento/).

## 8 Custo e sequência de liberação

Referência de 07/10/2026: Retail Focus, um emitente, R$ 62,90/mês com 500 NFC-e e 100 NF-e; excedentes de R$ 0,055 e R$ 0,16, respectivamente. A projeção de 3.000 NFC-e, sem exceder NF-e, fica em R$ 200,40/mês. Reconfirmar condições e volume antes de contratar. Certificado e outros serviços não estão incluídos nessa estimativa. [Preços oficiais](https://focusnfe.com.br/precos/).

Preferência de contratação: conta fiscal custeada pelo restaurante, mantendo a licença da plataforma separada. A expansão para outros restaurantes reaproveita o conector e cria configurações por emitente; não exige outro repositório.

Nos dois dias disponíveis, a sequência proposta é: estabilizar aprovação/caixa e preparar configurações e modelo fiscal; concluir fluxo financeiro mínimo; conectar emissão/consulta e exportação; executar os testes abaixo. Onboarding do emitente ocorre em paralelo pelo restaurante/contador. É um alvo com dependências, não uma estimativa de conclusão comprovada. Reduzir refinamento visual e relatórios extras antes de sacrificar integridade ou validação.

Critérios de liberação fiscal: emissão e consulta autorizadas em homologação; rejeição legível; repetição sem duplicação; recuperação após timeout; XML e documento auxiliar recuperáveis; cancelamento permitido e recusado; pacote contábil conferido; acesso por papel; teste do canal de venda real e impressão; procedimento de indisponibilidade definido. Só depois configurar produção e acompanhar uma operação real autorizada, com chave/protocolo/XML conferidos.

Se cadastro, certificado, credenciamento ou testes não estiverem resolvidos, a apresentação pode mostrar o que foi validado em homologação, claramente identificado. Isso não autoriza anunciar emissão real pronta nem iniciar o uso fiscal como se estivesse concluído. Como ainda não foi confirmado outro emissor disponível, não assumir que haverá um sistema antigo para cobrir a abertura.
