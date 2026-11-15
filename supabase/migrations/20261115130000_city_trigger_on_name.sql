-- A coleta reescreve city_name com a grafia da fonte; o gatilho também precisa disparar nessa coluna para manter o nome oficial do IBGE.
drop trigger if exists procurements_set_city on public.procurements;
create trigger procurements_set_city
  before insert or update of organization_id, city_ibge_code, city_name on public.procurements
  for each row execute function public.procurements_set_city();

update public.procurements p
set city_name = c.name
from public.cities c
where c.ibge_code = p.city_ibge_code and p.city_name is distinct from c.name;
