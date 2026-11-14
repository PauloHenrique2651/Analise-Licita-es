# Catálogo verificado de fontes de licitações

Verificação: 2026-09-03. “Integrado ao Transferegov/PNCP” significa que o portal envia dados ao governo; não implica API pública de leitura para terceiros. Campos não publicados pelo responsável estão explicitamente marcados como **não publicados**. Nenhum endpoint interno observado no navegador foi tratado como API pública.

## Fontes nacionais e plataformas

| Fonte | Acesso confirmado | Documentação oficial | Autenticação | Endpoints/arquivos confirmados | Paginação e limites | Dados disponíveis e decisão |
|---|---|---|---|---|---|---|
| PNCP | API pública oficial | [Manual](https://pncp.gov.br/manual/pt-br/latest/singlehtml/index.html) | Sem autenticação nas consultas públicas | `/api/consulta/v1/contratacoes/publicacao`, `/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens`, `/api/pncp/v1/modalidades` | `pagina`, `tamanhoPagina`; limite operacional sujeito a HTTP 429 | Contratações, itens, órgãos, valores, modalidades, situação e links. Connector ativo e prioritário. |
| Compras.gov.br | API pública oficial | [OpenAPI](https://dadosabertos.compras.gov.br/v3/api-docs) | Sem autenticação nos módulos usados | Contratações PNCP, itens, CATMAT, CATSER e pesquisa de preços conforme paths publicados no OpenAPI | `pagina`, `tamanhoPagina`; mínimo observado de 10 e máximo documentado por operação | Redundância do PNCP e enriquecimento de catálogos/preços. Connector ativo. |
| Licitações-e / BB | Consulta pública web e integração por arquivos para clientes | [Leiautes AOP](https://www.bb.com.br/site/pro-seu-negocio/aplicativos-leiautes-de-arquivos/) | Cadastro/senha para o portal; contratação/canal bancário para arquivos | AOP711 cadastro, AOP712 retorno, AOP713 solicitação de mercadorias, AOP714 base de mercadorias, AOP715 licitações concluídas | Paginação/limites de integração não publicados | Processos e documentos na web; concluídas via AOP715 para clientes habilitados. Sem API pública geral confirmada. Priorizar PNCP. |
| Portal de Compras Públicas | API/WebService para parceiros e compradores; consulta pública web | [Programa de parceiros](https://www.portaldecompraspublicas.com.br/parceiros) | Credenciamento comercial; mecanismo técnico não publicado | Contrato técnico e endpoints de licitações não publicados. O Swagger do PCP Marketplace é outro produto e não foi usado | Não publicados | Processos, editais e datas visíveis publicamente; integração somente após contrato técnico. Priorizar PNCP. |
| BNC Compras | Consulta pública web | [Portal](https://bnccompras.com/) | Cadastro para funções restritas | Nenhuma API pública de leitura documentada localizada | Não publicados | Editais/processos pela web e PNCP quando publicados. Sem adapter direto. |
| LICITANET | Consulta pública web | [Portal](https://www.licitanet.com.br/) | Cadastro para funções restritas | Nenhuma API pública de leitura documentada localizada | Não publicados | Editais/processos pela web e PNCP quando publicados. Sem adapter direto. |
| BBMNET | Consulta pública web e integração mediante contato | [Manual/credenciamento de integração](https://bbmnet.com.br/cadastro-formulario-de-acesso-manual-de-integracao/) | Credenciamento; detalhes não publicados antes da análise | Endpoints e contrato técnico não públicos | Não publicados | Pesquisa, filtros e documentos; adapter somente após obtenção oficial do manual. Priorizar PNCP. |
| ComprasBR / SIGA | Consulta pública web e produtos comerciais de inteligência | [Portal](https://comprasbr.com.br/) | Cadastro/plano para recursos restritos | Nenhuma API pública de leitura documentada localizada | Não publicados | Processos, resultados e inteligência na plataforma; sem adapter direto. Priorizar PNCP. |
| BLL Compras | Integração TXT/SOAP/REST para clientes/parceiros e consulta web | [Página oficial](https://bll.org.br/) | Credenciamento/contrato; detalhes técnicos não publicados | A existência de TXT, SOAP e REST é confirmada, mas URLs e operações não são públicas | Não publicados | Editais, atas, contratos e resultados no ecossistema; adapter somente após documentação oficial. Priorizar PNCP. |
| Licitar Digital | Consulta pública web | [Portal](https://www.licitardigital.com.br/) | OAuth/login para área restrita; não é autorização para coleta | Nenhuma API pública de leitura documentada localizada | Não publicados | Processos públicos na web e PNCP quando publicados. Sem adapter direto. |

## Fontes estaduais

| Fonte | Acesso confirmado | Documentação | Autenticação | Paginação/limites | Dados e decisão |
|---|---|---|---|---|---|
| PE Integrado | Consulta pública web | [Portal](https://www.peintegrado.pe.gov.br/) | Área restrita para operação | Não publicados | Sem API pública confirmada; usar PNCP. |
| Compras MG | Consulta pública web; base integrada ao PNCP | [Portal e manuais](https://compras.mg.gov.br/) | CAGEF/login para fornecedor | Não publicados | Licitações, fornecedores e módulo Melhores Preços na interface; sem API pública de leitura confirmada. |
| Comprasnet.GO | Consulta pública web | [Portal](https://www.comprasnet.go.gov.br/) | Login para funções restritas | Não publicados | Sem API pública confirmada; usar PNCP. |
| Compras SC / WebLIC / e-LIC | Consulta pública web e sistemas separados | [Sistemas oficiais](https://compras.sc.gov.br/sou-servidor/acessar-sistemas) | Login por sistema para funções restritas | Não publicados | Processos, resultados e documentos na interface; sem API pública confirmada; usar PNCP. |
| Portal de Compras DF | Consulta pública web | [Portal](https://portal.compras.df.gov.br/) | Login/chave para fornecedor | Não publicados | Licitações, situação, datas, valores, documentos e vencedor na consulta web; sem API pública confirmada; usar PNCP. |
| RJ Dados Abertos / SIGA | CKAN público + CSV | [Catálogo SEPLAG](https://dadosabertos.rj.gov.br/pt_BR/dataset/?organization=seplag&tags=LICITA%C3%87%C3%83O) | Sem autenticação para dados públicos | CKAN `package_search` usa `start`/`rows`; CSVs oficiais confirmados: `LICITACOES.CSV`, `ITENS_LICITACOES.CSV` e `HISTORICO_PRECOS_LICIT.CSV`; limites não publicados | Licitações, itens, histórico de preços, atas, contratos e catálogo. Adapters de licitações e itens/lotes ativos; consultam ETag/Last-Modified e só baixam arquivos alterados. A carga de itens é separada por o arquivo superar 100 MB. Preços ficam para o próximo enriquecimento. |

## Sistemas citados na relação Transferegov

A [relação oficial](https://www.gov.br/transferegov/pt-br/sobre/apis-integracao/sistemas-de-compras) confirma sistemas habilitados a enviar informações ao Transferegov. O Swagger indicado nessa página documenta a integração **de envio ao Transferegov**, não uma API pública de consulta das bases privadas. Para COE-RS, SCPI, Compra Aberta, BR Conectado, Bolsanet, PregãoNET, VA Sistemas, Licita Mais Brasil, Selcorp, M2A Compras, SMAR PE e eKronos não foi localizada documentação pública oficial de leitura, autenticação, paginação ou limites. Todos ficam registrados como **SEM API PÚBLICA CONFIRMADA** e são cobertos prioritariamente pelo PNCP/Compras.gov.

## Política de integração

1. PNCP e Compras.gov permanecem ativos para cobertura nacional sem filtros geográficos.
2. RJ/CKAN é o terceiro adapter ativo. A rotina incremental atualiza processos recentes e processos ainda não terminados; `npm run sync:rj-siga:all` executa o backfill histórico explícito e `npm run sync:rj-siga:items` enriquece os processos importados com itens/lotes.
3. APIs/arquivos de parceiros só serão ativados após recebimento do contrato técnico e credenciais do titular.
4. Consulta pública web não autoriza scraping automático. Portais sem interface documentada permanecem apenas no registro de fontes.
5. A rotina rápida coleta todas as modalidades ativas a cada cinco minutos, respeitando `Retry-After`; cargas históricas e itens rodam separadamente.
