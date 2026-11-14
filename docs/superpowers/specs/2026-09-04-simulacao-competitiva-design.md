# Simulação competitiva por item

## Objetivo

Permitir que um usuário autenticado informe o preço unitário que pretende ofertar em um item de licitação e receba uma conclusão rastreável: posição exata quando existirem todos os lances oficiais, ou posição estimada com base em resultados vencedores históricos compatíveis.

## Fluxo

Na página de detalhe da licitação, o usuário escolhe um item e informa a descrição do próprio produto e o preço unitário. A API valida a sessão, garante o acesso ao tenant ativo e obtém o item público.

Se o item estiver marcado como possuindo uma carga completa de lances, o cálculo insere o valor hipotético na ordenação oficial. Nos demais casos, a API busca resultados vencedores dos últimos 36 meses com o mesmo CATMAT/CATSER e unidade; se não houver código, aceita somente a mesma descrição normalizada e unidade. Não há similaridade presumida.

O resultado informa método, posição, diferença para o menor preço, estatísticas de mínimo/mediana/máximo, total de referências, nível de confiança e evidências com origem oficial. A interface nunca apresenta a projeção como resultado garantido.

## Dados e segurança

`procurement_items.bids_complete` identifica cargas completas de lances. `bid_simulations` guarda uma auditoria privada por tenant, usuário e item, incluindo o resultado calculado em JSON. RLS permite leitura e inserção somente por membros do tenant; a inserção exige que `user_id` seja o usuário autenticado. As tabelas públicas de mercado permanecem somente leitura.

## Falhas e testes

Menos de três referências históricas retorna `insufficient_data`, sem posição inventada. Preço, item e sessão inválidos retornam 400/401/404. Testes unitários cobrem vitória, posição intermediária, empate, confiança e ausência de dados; o typecheck, lint, testes e build validam a integração.
