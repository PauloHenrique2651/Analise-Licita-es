-- O mapeador do PNCP lia o campo errado e deixava catalog_item_code vazio.
-- Recupera o código CATMAT/CATSER do JSON original dos itens já sincronizados.
update public.procurement_items
set catalog_item_code = nullif(trim(raw_data ->> 'catalogoCodigoItem'), '')
where catalog_item_code is null
  and nullif(trim(raw_data ->> 'catalogoCodigoItem'), '') is not null;
