-- Fontes oficiais complementares e sua função na estratégia de redundância.
alter table public.sources
  add column if not exists capabilities text[] not null default '{}'::text[],
  add column if not exists credential_required boolean not null default false,
  add column if not exists recommended_poll_interval_seconds integer;

insert into public.sources
  (code, name, base_url, documentation_url, auth_type, reliability_notes, active, integration_status, priority, last_verified_at, capabilities, credential_required, recommended_poll_interval_seconds)
values
  (
    'CNPJ_CONECTA', 'Receita Federal / Serpro — CNPJ',
    'https://apigateway.conectagov.estaleiro.serpro.gov.br/api-cnpj-empresa/v2/empresa/',
    'https://www.gov.br/conecta/catalogo/apis/consulta-cnpj', 'oauth2_client_credentials',
    'Fonte oficial prioritária para CNPJ. Exige adesão ao Conecta, x-cpf-usuario, credenciais e IP de saída autorizado.',
    false, 'disabled', 10, now(), array['cnpj','qsa'], true, 86400
  ),
  (
    'CEP_CONECTA', 'Conecta gov.br / Correios — CEP',
    'https://apigateway.conectagov.estaleiro.serpro.gov.br/api-cep/v1/consulta/cep/',
    'https://www.gov.br/conecta/catalogo/apis/cep-codigo-de-enderecamento-postal', 'oauth2_client_credentials',
    'Fonte oficial prioritária para CEP. Exige adesão ao Conecta e IP de saída autorizado.',
    false, 'disabled', 10, now(), array['cep','address'], true, 604800
  ),
  (
    'IBGE', 'IBGE — API de Localidades',
    'https://servicodados.ibge.gov.br/api/v1/localidades',
    'https://servicodados.ibge.gov.br/api/docs/localidades', 'none',
    'Fonte pública oficial para estados, municípios, regiões e códigos IBGE.',
    true, 'active', 10, now(), array['states','cities','regions','ibge_codes'], false, 86400
  )
on conflict (code) do update set
  name = excluded.name,
  base_url = excluded.base_url,
  documentation_url = excluded.documentation_url,
  auth_type = excluded.auth_type,
  reliability_notes = excluded.reliability_notes,
  active = excluded.active,
  integration_status = excluded.integration_status,
  priority = excluded.priority,
  last_verified_at = excluded.last_verified_at,
  capabilities = excluded.capabilities,
  credential_required = excluded.credential_required,
  recommended_poll_interval_seconds = excluded.recommended_poll_interval_seconds;

update public.sources set
  capabilities = array['procurements','items','contracts','minutes','documents'],
  recommended_poll_interval_seconds = 300,
  last_verified_at = now()
where code = 'PNCP';

update public.sources set
  capabilities = array['procurements','items','catmat','catser','prices','pgc','uasg','arp','contracts','suppliers'],
  recommended_poll_interval_seconds = 300,
  last_verified_at = now()
where code = 'COMPRAS_GOV';

update public.sources set
  capabilities = array['cnpj','cep'],
  priority = 50,
  recommended_poll_interval_seconds = 86400,
  reliability_notes = 'Fallback público para CNPJ e CEP quando o Conecta não estiver credenciado ou disponível.'
where code = 'BRASIL_API';
