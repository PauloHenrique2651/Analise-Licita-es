-- Relatório regional: como usuário logado levava 90 s (a segurança por linha impedia o uso dos índices); como dono leva 3 s.
-- A função só lê dados públicos de licitações (que todo usuário logado já pode ler) e devolve apenas totais, sem dados de nenhuma conta.
alter function public.regional_report(text[], date, date, text) security definer;
