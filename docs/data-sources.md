# Fontes de dados

## PNCP

- origem: Portal Nacional de Contratações Públicas;
- autenticação das consultas utilizadas: não exigida;
- contratação por publicação: `/api/consulta/v1/contratacoes/publicacao`;
- detalhe: `/api/consulta/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}`;
- itens: `/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens`;
- resultados homologados por item: `/api/pncp/v1/orgaos/{cnpj}/compras/{ano}/{sequencial}/itens/{numeroItem}/resultados`;
- paginação: `pagina` e `tamanhoPagina` conforme Swagger;
- limitações observadas: latência e timeout variáveis; não oferece streaming.

## Compras.gov.br

- origem: Dados Abertos Compras.gov.br;
- autenticação nas consultas utilizadas: não exigida;
- contratações da Lei 14.133: `/modulo-contratacoes/1_consultarContratacoes_PNCP_14133`;
- itens por identificador: `/modulo-contratacoes/2.1_consultarItensContratacoes_PNCP_14133_Id`;
- resultados por período: `/modulo-contratacoes/3_consultarResultadoItensContratacoes_PNCP_14133`;
- resultados por contratação: `/modulo-contratacoes/3.1_consultarResultadoItensContratacoes_PNCP_14133_Id`;
- CATMAT: `/modulo-material/4_consultarItemMaterial`;
- pesquisa de preço de material: `/modulo-pesquisa-preco/1_consultarMaterial`;
- paginação: `pagina` e `tamanhoPagina`; o serviço rejeita tamanhos inferiores a 10, embora o OpenAPI não declare esse mínimo;
- pesquisa de preço: `tipo=codigoItemCatalogo` e `codigo={CATMAT}`;
- finalidade: redundância de contratações e itens, catálogo, classificação e preços complementares;
- resultados: fornecedor, quantidade e valores homologados, situação, classificação e data; registros cancelados são preservados, mas não contam como vitória;
- cache: catálogo por 24 horas; preços por seis horas.

## Redundância e portais complementares

PNCP e Compras.gov executam de forma independente. Uma falha é registrada em `procurement_sync_state`, `imports` e `sync_logs` sem cancelar a outra fonte. Registros coincidentes por identificador PNCP são consolidados em `procurements`; as origens permanecem auditáveis em `procurement_sources`.

Resultados equivalentes são consolidados por contratação, item, fornecedor e sequência. A fonte de maior prioridade prevalece, evitando dobrar vitórias e preços quando PNCP e Compras.gov.br publicam o mesmo desfecho.

Portal de Compras Públicas, BLL, BNC, LICITANET, BBMNET, Licitações-e, Comprasnet Goiás, Compras MG, PE Integrado, Compras RS e Licitar Digital estão cadastrados como `SEM API PÚBLICA CONFIRMADA`. Não existe scraping automático desses portais nesta etapa. Um adapter só será ativado após validação documental ou autorização formal de acesso.

## BrasilAPI

- CNPJ: `/api/cnpj/v1/{cnpj}`;
- CEP: `/api/cep/v2/{cep}`;
- finalidade: cadastro assistido de empresas e endereços;
- autenticação: não exigida;
- limitação: agregador comunitário, sujeito a disponibilidade das fontes originais.

## SintegraWS

- endpoint configurável: `/api/v1/execute-api.php`;
- parâmetros utilizados segundo a documentação atual: `token`, `cnpj`, `plugin=ST`;
- finalidade: inscrição estadual e situação cadastral;
- autenticação: token comercial, somente no servidor;
- limitação: serviço pago por créditos e cobertura variável por UF.

Qualquer novo endpoint deve ser confirmado na documentação oficial, receber fixture de resposta e teste de contrato antes de entrar em produção.
