alter table public.sources
  add column if not exists access_classification text not null default 'public_web'
    check (access_classification in ('public_api','partner_api','partner_files','open_data','public_web','official_aggregator'));

insert into public.sources
  (code, name, base_url, documentation_url, auth_type, reliability_notes, active, integration_status, priority, last_verified_at, capabilities, credential_required, access_classification)
values
  ('LICITACOES_E','Licitações-e / Banco do Brasil','https://licitacoes-e2.bb.com.br/','https://www.bb.com.br/site/pro-seu-negocio/aplicativos-leiautes-de-arquivos/','partner_files','Consulta web pública e layouts AOP711-AOP715 para clientes habilitados; sem API pública geral de leitura.',false,'disabled',350,now(),array['procurements','documents','completed_procurements'],true,'partner_files'),
  ('PORTAL_COMPRAS_PUBLICAS','Portal de Compras Públicas','https://www.portaldecompraspublicas.com.br/','https://www.portaldecompraspublicas.com.br/parceiros','partner_credentials','API/WebService para parceiros confirmada; contrato técnico, autenticação, endpoints e limites não publicados.',false,'disabled',300,now(),array['procurements','documents'],true,'partner_api'),
  ('BNC_COMPRAS','BNC Compras','https://bnccompras.com/','https://bnccompras.com/','account','SEM API PÚBLICA GERAL CONFIRMADA.',false,'no_public_api_confirmed',320,now(),array['procurements'],false,'public_web'),
  ('LICITANET','LICITANET','https://www.licitanet.com.br/','https://www.licitanet.com.br/','account','SEM API PÚBLICA GERAL CONFIRMADA.',false,'no_public_api_confirmed',330,now(),array['procurements'],false,'public_web'),
  ('BBMNET','BBMNET','https://www.bbmnet.com.br/','https://bbmnet.com.br/cadastro-formulario-de-acesso-manual-de-integracao/','partner_credentials','Integração mediante formulário e liberação do manual; contrato técnico não público.',false,'disabled',340,now(),array['procurements','documents'],true,'partner_api'),
  ('COMPRAS_BR_SIGA','ComprasBR / SIGA','https://www.comprasbr.com.br/','https://comprasbr.com.br/','account','SEM API PÚBLICA GERAL CONFIRMADA.',false,'no_public_api_confirmed',395,now(),array['procurements','results'],false,'public_web'),
  ('BLL_COMPRAS','BLL Compras','https://bll.org.br/','https://bll.org.br/','partner_credentials','Integrações TXT, SOAP e REST confirmadas para clientes; documentação de leitura não publicada.',false,'disabled',310,now(),array['procurements','contracts','minutes'],true,'partner_api'),
  ('LICITAR_DIGITAL','Licitar Digital','https://www.licitardigital.com.br/','https://www.licitardigital.com.br/','account','SEM API PÚBLICA GERAL CONFIRMADA.',false,'no_public_api_confirmed',400,now(),array['procurements'],false,'public_web'),
  ('PE_INTEGRADO','PE Integrado','https://www.peintegrado.pe.gov.br/','https://www.peintegrado.pe.gov.br/','account','SEM API PÚBLICA GERAL CONFIRMADA; consulta pública web.',false,'no_public_api_confirmed',380,now(),array['procurements'],false,'public_web'),
  ('COMPRAS_MG','Portal de Compras MG','https://compras.mg.gov.br/','https://compras.mg.gov.br/','account','SEM API PÚBLICA GERAL CONFIRMADA; sistema integrado ao PNCP.',false,'no_public_api_confirmed',370,now(),array['procurements','suppliers','prices'],false,'public_web'),
  ('COMPRASNET_GO','Comprasnet.GO','https://www.comprasnet.go.gov.br/','https://www.comprasnet.go.gov.br/','account','SEM API PÚBLICA GERAL CONFIRMADA.',false,'no_public_api_confirmed',360,now(),array['procurements'],false,'public_web'),
  ('COMPRAS_SC','Portal de Compras SC / WebLIC / e-LIC','https://compras.sc.gov.br/','https://compras.sc.gov.br/sou-servidor/acessar-sistemas','account','SEM API PÚBLICA GERAL CONFIRMADA; múltiplos sistemas de consulta.',false,'no_public_api_confirmed',375,now(),array['procurements','results','documents'],false,'public_web'),
  ('COMPRAS_DF','Portal de Compras DF','https://portal.compras.df.gov.br/','https://portal.compras.df.gov.br/','account','SEM API PÚBLICA GERAL CONFIRMADA; consulta pública web.',false,'no_public_api_confirmed',376,now(),array['procurements','results','documents'],false,'public_web'),
  ('RJ_DADOS_ABERTOS_SIGA','RJ Dados Abertos / SIGA','https://dadosabertos.rj.gov.br/','https://dadosabertos.rj.gov.br/pt_BR/dataset/?organization=seplag&tags=LICITA%C3%87%C3%83O','none','CKAN e recursos CSV oficiais com licitações, itens e histórico de preços.',false,'disabled',100,now(),array['procurements','items','prices','contracts','catalog'],false,'open_data')
on conflict (code) do update set
  name=excluded.name, base_url=excluded.base_url, documentation_url=excluded.documentation_url,
  auth_type=excluded.auth_type, reliability_notes=excluded.reliability_notes, active=excluded.active,
  integration_status=excluded.integration_status, priority=excluded.priority, last_verified_at=excluded.last_verified_at,
  capabilities=excluded.capabilities, credential_required=excluded.credential_required,
  access_classification=excluded.access_classification;

update public.sources set access_classification='public_api' where code in ('PNCP','COMPRAS_GOV','IBGE');
update public.sources set access_classification='official_aggregator' where code='BRASIL_API';
update public.sources set access_classification='partner_api' where code in ('CNPJ_CONECTA','CEP_CONECTA','SINTEGRA');

insert into public.sources
  (code,name,base_url,documentation_url,auth_type,reliability_notes,active,integration_status,priority,last_verified_at,capabilities,credential_required,access_classification)
select code,name,'https://www.gov.br/transferegov/pt-br/sobre/apis-integracao/sistemas-de-compras','https://www.gov.br/transferegov/pt-br/sobre/apis-integracao/sistemas-de-compras','unknown','Listado como sistema integrado ao Transferegov; isso não confirma API pública de leitura.',false,'no_public_api_confirmed',priority,now(),array['procurements'],false,'public_web'
from (values
 ('COE_RS','COE-RS',500),('SCPI','SCPI',501),('COMPRA_ABERTA','Compra Aberta',502),('BR_CONECTADO','BR Conectado',503),
 ('BOLSANET','Bolsanet',504),('PREGAO_NET','PregãoNET',505),('VA_SISTEMAS','VA Sistemas',506),
 ('LICITA_MAIS_BRASIL','Licita Mais Brasil',507),('SELCORP','Selcorp',508),('M2A_COMPRAS','M2A Compras',509),
 ('SMAR_PE','SMAR PE',510),('EKRONOS','eKronos',511)
) as listed(code,name,priority)
on conflict (code) do update set reliability_notes=excluded.reliability_notes, last_verified_at=excluded.last_verified_at;
