-- Fonte estadual oficial complementar. A rotina usa ETag/Last-Modified e não baixa o CSV se ele não mudou.
update public.sources set
  active = true,
  integration_status = 'active',
  priority = 30,
  recommended_poll_interval_seconds = 300,
  reliability_notes = 'CKAN e CSV oficiais do SIGA/RJ. Licitações ativas; itens e histórico de preços preparados para enriquecimento posterior.',
  last_verified_at = now()
where code = 'RJ_DADOS_ABERTOS_SIGA';
