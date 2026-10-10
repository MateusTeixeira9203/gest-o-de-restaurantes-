# Fiscal — Comanda Inteligente / Minas Gerais

**Estado em 10/10/2026:** implementação publicada (`aa918c1`, deploy READY) preparada para configuração e homologação da matriz descrita abaixo. Nenhuma emissão real, chamada externa à Focus, contratação ou ativação ocorreu nesta atualização. A homologação externa continua pendente; o estado de publicação é registrado na auditoria SIM-20. Este documento é a referência técnica fiscal; o manual do produto mantém a visão e o escopo geral.

## 1. Contrato da atualização

Responsável pela implementação: Codex. Aceite: proprietário após revisão/testes. Objetivo: preparar emissão de vendas e pacote para o contador, preservando aprovação de pedidos, cozinha, estoque, pagamentos, custos e lançamentos financeiros. Fiscal não cria receita, não recebe dinheiro e não estorna recebimentos.

Dentro: configuração por restaurante/ambiente, matriz fiscal explícita, preparação de vendas quitadas, envio/consulta, recuperação de resultado incerto, cancelamento, coleta privada de documentos e exportação. Fora: notas de entrada/compras por XML, apuração de tributos, SPED, transmissão por e-mail ao contador, impressão em equipamento real, contingência offline e operações fora da matriz coberta.

Os testes usam PostgreSQL 18 local com dados sintéticos, sem copiar registros reais. Após esses testes, a migration `0018_fiscal_activation.sql` foi aplicada ao Neon de uso em 10/10/2026, com backup prévio e comparação de contagens/hashes de pedidos, recebimentos, razão e documentos fiscais sem alteração dos valores existentes. Publicação, migração no banco de uso e homologação externa são etapas distintas; o código local não comprova estado em produção.

## 2. Fluxo e responsabilidades

1. Garçom/caixa confere e envia o pedido à cozinha. Aprovação continua obrigatória no servidor.
2. O fechamento registra recebimentos e troco. Pedidos quitados de um mesmo fechamento recebem `checkout_group_id`.
3. Caixa ou gestão abre **Fiscal → Vendas e documentos**, seleciona vendas e prepara o documento. Agrupamento exige mesmo fechamento, atendimento e canal. Registros anteriores sem agrupamento são preparados individualmente.
4. O servidor resolve restaurante e papel, valida cadastro/perfis e calcula snapshot em centavos. Pendências impedem transmissão. Preparar não emite nota nem movimenta dinheiro.
5. Caixa/gestão solicita transmissão. O servidor verifica a habilitação do ambiente, emitente e versão dos dados; cria intenção persistente antes de chamar a Focus.
6. Autorização registra chave, número, série, protocolo e data quando informados. Rejeição mantém motivo. Falta de resposta vira resultado incerto; a recuperação consulta a mesma referência, sem novo POST às cegas.
7. **Consultar/Buscar arquivos** recupera XML autorizado e documento auxiliar PDF/HTML. Arquivos passam por autenticação, isolamento e validações antes de serem armazenados.
8. Cancelamento exige motivo e chamada específica. Recusa mantém a autorização anterior. Cancelar nota não cancela automaticamente venda, pagamento ou estoque.
9. **Contador** exporta período e ambiente escolhidos. A tela não envia arquivos externamente; o responsável baixa e entrega o pacote.

Gestão configura emitente e tributação. Caixa pode operar documentos e exportar, sem editar o cadastro fiscal. Garçom não emite. Fiscal e financeiro avançado permanecem no Profissional; caixa operacional continua disponível no Essencial. O acesso de Caixa na operação permanece separado da navegação de gestão.

O momento fiscal adequado à venda precisa ser validado pelo contador. O recorte atual exige venda quitada/concluída ou entregue; operações que precisam de emissão antes do recebimento exigem evolução antes do uso comercial.

## 3. Matriz implementada — cobertura limitada e explícita

| Capacidade | Comportamento local |
| --- | --- |
| NFC-e 65 | Operações internas elegíveis em MG, com política validada por canal; destinatário contribuinte bloqueado neste modelo |
| NF-e 55 | Venda normal interna em MG, escolhida por matriz explícita, com destinatário/endereço; não é motor universal de NF-e |
| Canais | Origem do pedido e atendimento separados; matriz escolhe 55/65 e presença; digital não é convertido automaticamente em presencial |
| Valores | Itens, adicionais, serviço, frete, descontos e troco reconciliados em centavos, com rateio determinístico |
| Adicionais | Incluídos na composição do produto somente quando contador valida mesma tributação; adicional com perfil próprio é evolução |
| Serviço/frete/desconto | Dependem de autorização explícita; serviço suportado como outras despesas incluídas nas bases, conforme configuração validada |
| Simples/MEI | CRT 1/4: CSOSN 102, 103, 300 e 400; 500 somente NFC-e quando validada dispensa dos valores retidos |
| Regime normal/excesso de sublimite | CRT 2/3: CST 00, 20 com alíquota/redução, 40 e 41; 60 somente NFC-e na condição de dispensa explicitamente validada |
| PIS/Cofins | CST 01/02 com alíquota; 04/06/07/08/09; exclusão do ICMS calculado apenas quando configurada |
| IBS/CBS | Tributação regular CST 000 com classificação e alíquotas explicitamente fornecidas; não cobre regimes especiais/reduções |
| Destinatário | CPF/CNPJ, endereço, município/IBGE, UF, CEP, indicação de IE e observações; validação estrutural não comprova situação cadastral |
| Entrega | Endereço completo em MG e enquadramento validado; venda fora do estado é bloqueada |
| Pagamentos | Representa recebimentos já registrados, inclusive mistos e troco; cartão manual não é anunciado como TEF integrado |

Não preencher NCM/CFOP/CST por inferência do nome do prato. O contador deve confirmar elegibilidade e a matriz real. Operações especiais, ST com cálculo/valores retidos, devolução, ajuste/complemento, interestaduais, inutilização de numeração e novos leiautes fora deste recorte continuam **não implementados**. Se necessários à rotina do cliente, não basta configurar credenciais: exigem desenvolvimento e validação adicionais.

## 4. Dados e contratos atuais

- `fiscal_profiles` e `fiscal_product_profiles`: dados do emitente e tributação versionada. Segredos não entram nesses perfis.
- `fiscal_documents`: ambiente, snapshot, opções de destinatário, pendências, vínculo da operação e data de emissão.
- `fiscal_order_links`: exclusividade por restaurante, ambiente e pedido; FK impede documento de outro restaurante/ambiente.
- `integration_operations`: referência estável, tentativas, lease, resultado e operação separada de cancelamento.
- `fiscal_events`: trilha de preparação, processamento, arquivos e exportação.
- `fiscal_files`: conteúdo privado, MIME e SHA-256; não há URL pública de arquivo do cliente.
- `orders.checkout_group_id`: vínculo comercial do fechamento; não depende da numeração visual da mesa/comanda.

API autenticada: `/api/operations/fiscal`, `/api/operations/fiscal/export` e `/api/operations/fiscal/files/[fileId]`. Download auxiliar permite visualização com sandbox e CSP; HTML baixado também carrega CSP. Não executar scripts de documentos no domínio da aplicação.

A busca de arquivos aceita somente hosts Focus fixos do ambiente e caminhos autorizados; não segue redirecionamentos. Limite de 8 MB por arquivo. XML é analisado sem DTD/entidades e deve corresponder à chave, emitente e autorização/evento esperados. Divergência de metadados não substitui protocolo previamente registrado. Isso não substitui validação criptográfica independente da assinatura XML.

## 5. Pacote para o contador

ZIP privado com `LEIA-ME.txt`, `indice.json`, `indice.csv`, eventos e documentos disponíveis, incluindo checksums. PDF/HTML é documento auxiliar; XML autorizado é preservado. A seleção considera data de emissão e eventos do período, permitindo incluir cancelamento de nota emitida em mês anterior.

O índice marca pacote incompleto quando há vendas sem preparação, XML/metadados ausentes, operação pendente ou cancelamento sem seu XML. Um ZIP baixado com sucesso não comprova que todas as notas estão autorizadas. Limites atuais: 500 documentos/vendas e 32 MB por pacote; períodos maiores devem ser divididos. Pacote não equivale a SPED ou apuração/entrega de obrigação fiscal. Confirmar formato e frequência com o contador.

## 6. Configuração e liberação

### Informações do restaurante/contador

- Razão social, CNPJ, IE, endereço completo, município/IBGE e regime.
- Conta/emitente Focus, certificado A1 válido, credenciamento e CSC/ID aplicáveis.
- Série e numeração, inclusive histórico de emissões anteriores.
- Matriz de produtos e canais: NCM, CFOP, origem, CST/CSOSN, PIS/Cofins, CEST quando aplicável, unidade/GTIN, benefícios e alíquotas pertinentes.
- Tratamento de adicionais, serviço, descontos, frete, entrega, retirada e destinatário.
- Contador responsável, formato de entrega e procedimento de indisponibilidade.
- Equipamento de impressão e conexão a testar no local.

Não enviar certificado/senha/token pelo chat nem colocá-los em Git, logs ou formulários de cadastro comum. Cadastro da empresa/certificado/CSC/numeração ocorre no provedor por canal seguro. A implantação configura somente referências e segredos necessários no servidor.

### Variáveis exclusivas do servidor

`FOCUS_NFE_CONNECTIONS`: JSON indexado pelo UUID do restaurante, com entradas `homologation` e `production`; cada uma contém `token` e `cnpj`. Produção também exige `productionApproved: true`. Não compartilhar token de restaurante no navegador. O formato legado `FOCUS_NFE_HOMOLOGATION_TOKENS` continua aceito somente para homologação.

`FOCUS_NFE_HOMOLOGATION_ENABLED=true` habilita o ambiente de testes quando a conexão existe. `FOCUS_NFE_PRODUCTION_ENABLED=true` é a chave geral de produção; sozinha não habilita um restaurante. A aprovação por cliente e CNPJ compatível também são exigidos. Ambos ficaram desligados no servidor local desta auditoria.

Separar hosts, referências, documentos e chaves por ambiente. Nunca promover XML de homologação para produção. Revisar segredos e permissões por restaurante antes da ativação.

### Recuperação automática

Endpoint `POST /api/internal/fiscal-queue` protegido por Bearer `FISCAL_WORKER_SECRET` (mínimo 32 caracteres). `pnpm fiscal:worker` chama esse endpoint usando `FISCAL_APP_URL` (HTTPS fora do localhost). O agendamento real ainda deve ser configurado e monitorado na implantação; adicionar um script ao repositório não cria um agendador.

Cada execução recupera até três operações e um conjunto de arquivos. Somente intenções já registradas são processadas; o trabalhador não cria documentos nem libera produção. Após 20 tentativas automáticas a operação exige atenção; consulta manual permanece disponível. Recuperação de arquivos tem intervalo de cinco minutos e limite de tentativas. Falha isolada deve aparecer no acompanhamento operacional; monitorar respostas e fila ao ativar o agendamento.

### Ordem de implantação

1. Conferir versão/schema, backup e restauração; aplicar migration com conectores desligados.
2. Cadastrar emitente e matriz fornecida pelo contador; confirmar a cobertura deste motor.
3. Configurar credenciais de homologação por restaurante e ligar somente homologação.
4. Executar emissão/consulta, rejeição, timeout/retomada, cancelamento autorizado/recusado, XML/DANFE, exportação e impressão no equipamento real. Conferir valores com contador.
5. Configurar agendador, monitoramento, contingência operacional e suporte.
6. Somente com aceite e autorização, habilitar produção por restaurante e acompanhar emissão real conferindo chave/protocolo/XML.

Custos Focus/certificado são do restaurante, separados da licença vitalícia dos primeiros clientes. Plano, franquia, excedentes e preço precisam ser cotados para o volume real; nenhuma contratação foi feita aqui. Não prometer que mensalidade Focus cobre hospedagem, suporte ou outras integrações sem condição comercial específica.

## 7. Evidências e critérios de aceite

Ambiente: código local sobre base `5ff6dbeb3fae22517c3be09fb5bf4943d34d9d6b`, PostgreSQL 18 sintético em localhost:55435 e aplicação localhost:3100. Resultados não são evidência de Vercel/Neon ou de homologação SEFAZ.

| Critério: estado → ação → resultado, sem efeito proibido | Resultado |
| --- | --- |
| Conexão desligada → preparar/enviar → rascunho permitido, transmissão recusada antes de qualquer rede | PASSA em API/banco e unidade |
| Venda quitada → preparar simultaneamente/repetir → um documento por ambiente; outro fechamento recusado | PASSA em integração persistente |
| Valores com adicionais/serviço/desconto/troco → calcular → totais exatos, perfil ausente bloqueia sem inventar tributo | PASSA, incluindo 200 casos de rateio |
| Identidades/restaurantes/ambientes distintos → consultar/alterar/baixar → acesso indevido recusado sem alteração | PASSA em API autenticada e banco |
| Resposta perdida → worker consulta → mesma referência, sem duplicar POST ou pagamento | PASSA com transporte controlado |
| Autorização/recusa/cancelamento → recuperar → preservar status e arquivos correspondentes | PASSA com transporte controlado; nenhum serviço externo |
| Arquivo ausente/divergente → coletar/exportar → pendência explícita, sem sobrescrever autorização válida | PASSA em integração |
| Nota de período anterior cancelada agora → exportar → evento/documento incluídos no pacote correto | PASSA em integração |
| Schema anterior → migration/rollback transacional → preservação dos documentos legados e FK por ambiente | PASSA em banco local separado |
| Navegador → salvar emitente/classificação, preparar e recarregar → dados persistidos, envio desabilitado | PASSA no ambiente local |
| Navegador → baixar ZIP → arquivo íntegro, rascunho indicado como incompleto | PASSA; CRC conferido |
| Build, TypeScript e regressões de aprovação/financeiro/isolamento/checkout | PASSA no recorte local; três avisos anteriores de lint fora do recorte |
| Focus/SEFAZ real, impressão física, scheduler implantado, restauração de produção | NÃO TESTADO / NÃO IMPLANTADO |

Evidência local em `outputs/fiscal-activation/`: logs de testes, build, migration e verificação de persistência/download. São artefatos ignorados pelo Git. O manual do produto, seção 7.5, registra a revisão de navegação e densidade visual solicitada durante esta entrega. Aceite do proprietário permanece separado dos testes realizados pelo agente.

Contenção: desligar as flags impede novas transmissões/recuperações externas, preservando documentos e pendências. Não apagar registros para reverter. Depois de gravar documentos de produção, não retornar a versão antiga que desconhece a separação por ambiente; usar correção compatível e reconciliar operações incertas antes de reativar.

## 8. Referências oficiais consultadas

- [Ambientes Focus](https://doc.focusnfe.com.br/reference/ambiente), [emissão NFC-e](https://doc.focusnfe.com.br/reference/emitir_nfce), [consulta](https://doc.focusnfe.com.br/reference/consultar_nfce) e [cancelamento](https://doc.focusnfe.com.br/reference/cancelar_nfce).
- [Cadastro de empresas](https://doc.focusnfe.com.br/reference/atualizar_empresa), [campos do leiaute](https://campos.focusnfe.com.br/nfe/NotaFiscalXML.html) e [guia IBS/CBS](https://focusnfe.com.br/guides/reforma-tributaria/).
- [RICMS/MG — Anexo V](https://www.fazenda.mg.gov.br/empresas/legislacao_tributaria/ricms_2023_seco/anexov2023_2.html) e [credenciamento NFC-e/MG](https://portalsped.fazenda.mg.gov.br/spedmg/nfce/credenciamento/).

O enquadramento por canal depende da operação e do estabelecimento; origem digital, isoladamente, não decide o modelo. As referências documentam integração e regras gerais; a matriz do cliente deve ser validada pelo contador antes de ativar emissão.
