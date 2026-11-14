-- Link individual público confirmado do SIGA/RJ.
update public.procurement_sources ps
set source_url = 'https://www.compras.rj.gov.br/EditaisLicitacoes/detalhar.action?idLic=' || ps.external_id
from public.sources s
where ps.source_id = s.id
  and s.code = 'RJ_DADOS_ABERTOS_SIGA';

update public.procurements p
set source_url = 'https://www.compras.rj.gov.br/EditaisLicitacoes/detalhar.action?idLic=' || p.external_id,
    edital_url = coalesce(p.edital_url, 'https://www.compras.rj.gov.br/EditaisLicitacoes/detalhar.action?idLic=' || p.external_id),
    updated_at = now()
from public.sources s
where p.source_id = s.id
  and s.code = 'RJ_DADOS_ABERTOS_SIGA';
