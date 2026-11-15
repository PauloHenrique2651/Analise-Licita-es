# Nexo Público

Plataforma web multiempresa de inteligência de mercado para licitações públicas. O projeto transforma registros oficiais em pesquisa, indicadores, rankings e acompanhamento comercial, sempre preservando a origem e sem preencher lacunas com dados fictícios.

## Estado atual

Implementado:

- Next.js 16 + React + TypeScript, interface responsiva e tema B2B escuro;
- Supabase Auth, Postgres, RLS e isolamento por tenant;
- dashboard de mercado com KPIs, gráfico, mapa interativo e atualização por Supabase Realtime;
- busca de licitações com PostgreSQL Full Text Search, `pg_trgm` e filtros;
- cadastro de empresa por CNPJ com Receita Federal/Serpro quando credenciada e BrasilAPI como fallback;
- CEP redundante via Conecta/Correios e BrasilAPI, além de localidades oficiais do IBGE;
- connectors independentes para PNCP e Compras.gov, com tipos normalizados e validação Zod;
- ingestão redundante, paginada, idempotente, com retry, timeout, checkpoints e recuperação automática por fonte;
- resultados homologados, fornecedores vencedores e preços históricos via endpoints oficiais do PNCP e Compras.gov.br;
- deduplicação canônica e vínculo de múltiplas origens por licitação;
- coleta contínua (espelho do PNCP e do Compras.gov) em serviços systemd na VPS;
- links temporários por processo, token armazenado somente como hash, chat do cliente e solicitações de documentos;
- schema fiscal para autorização, metadados de certificados A1, documentos e fila de emissão;
- headers de segurança, validação de entrada, autorização por função, testes, lint e build de produção.

Dependências externas ainda necessárias para ativação completa:

- token comercial do SintegraWS;
- credenciamento no Conecta gov.br, credenciais OAuth2, CPF consumidor e IP de saída autorizado para CNPJ/CEP oficiais;
- Secrets do Supabase no GitHub para ingestão automática;
- worker fiscal homologado com SEFAZ e cofre externo de certificados;
- chave da API OpenAI, opcional e cobrada separadamente, para ativar o assistente nos módulos.

## Desenvolvimento local

Requisitos: Node.js 20.9 ou superior e Docker (para o banco local de homologação).

Homologação sem Supabase (Postgres em Docker):

```bash
npm install
cp .env.example .env.local   # descomente o bloco "Homologação local" e preencha
npm run db:up                # sobe o Postgres em 127.0.0.1:54330
npm run db:setup             # aplica as migrações e cria o usuário de teste
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

## Produção (VPS própria)

O sistema roda numa VPS (Ubuntu, Postgres 18, Node, Nginx), em modo de banco próprio (`NEXT_PUBLIC_DATA_BACKEND=local`). Vercel e Supabase não são mais usados.

- Código em `/srv/nexo/app`, variáveis em `/srv/nexo/.env`, serviço `nexo-app` atrás do Nginx.
- Publicar: gere o pacote com `git archive --format=tar.gz -o nexo.tar.gz HEAD`, envie para `/srv/nexo/release.tar.gz` e rode `/srv/nexo/bin/deploy.sh` (instala, compila, aplica migrações e troca a versão).
- Backup diário do banco em `/var/backups/nexo` (7 dias).

Comandos de qualidade:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Sincronização contínua

Na VPS, a coleta roda em serviços systemd (`nexo-job@<tarefa>`, script `/srv/nexo/bin/job.sh`):

- `mirror-PNCP` e `mirror-COMPRAS_GOV`: espelho contínuo de ontem e hoje, todas as páginas; primeiro os cabeçalhos, depois os itens só do que é novo ou mudou (`SYNC_SKIP_UNCHANGED=true`);
- `backfill-PNCP`, `backfill-COMPRAS_GOV` e `backfill-results`: carga histórica com retomada automática;
- timers `recent-results` (5 min), `watchdog` (15 min), `daily` e `backup`.

As consultas ao PNCP passam por uma fila única (`flock`), porque o PNCP limita o IP com HTTP 429.

O PNCP tem prioridade e o Compras.gov funciona como redundância. A rotina consulta `/v1/modalidades` e percorre todas as modalidades ativas; se a tabela de domínio estiver temporariamente indisponível, usa o último conjunto oficial verificado no código. Cada fonte mantém checkpoint e estado próprios, e uma falha não cancela a outra. As APIs oficiais são HTTP paginadas, não streaming. O painel recebe as alterações do banco após cada ciclo de coleta.

As modalidades são processadas de forma cadenciada e o cliente respeita `Retry-After` para evitar bloqueios HTTP 429. A base geográfica do IBGE é renovada diariamente. Enriquecimento de itens e cargas históricas são executados separadamente para não atrasar a descoberta de oportunidades.

Em paralelo, a rotina `recent-results` busca resultados homologados, hidrata automaticamente contratações e itens ainda ausentes e alimenta concorrentes, vitórias e preços. A carga `backfill-results` retrocede em janelas de sete dias até 2021, enquanto o `sync-watchdog` verifica a saúde das fontes e recupera ciclos parados. Nenhum cursor avança deixando uma página parcialmente hidratada para trás.

Além do espelho, a carga histórica mantém um cursor independente por fonte. Ele percorre desde os dados mais novos até `2021-01-01`, retoma exatamente a modalidade e a página pendentes e só avança após uma execução bem-sucedida. Ajuste `BACKFILL_MIN_DATE` se for necessário ampliar ou reduzir a cobertura histórica. PNCP e Compras.gov.br rodam em serviços independentes; a indisponibilidade de uma fonte não interrompe a outra.

Primeira carga rápida, sem itens:

```bash
node --env-file=.env.local --conditions=react-server --import tsx scripts/sync-procurements.ts --quick
```

Carga histórica e enriquecida de um recorte:

```bash
node --env-file=.env.local --conditions=react-server --import tsx scripts/sync-procurements.ts --provider=COMPRAS_GOV --start=2026-04-01 --end=2026-04-30 --modality=5 --state=RJ
```

Avançar o preenchimento histórico com retomada automática:

```bash
npm run sync:procurements:backfill -- --provider=PNCP
npm run sync:procurements:backfill -- --provider=COMPRAS_GOV
```

Atualizar vencedores e preços recentes ou avançar o histórico:

```bash
npm run sync:results
npm run sync:results:backfill
npm run sync:watchdog
```

Atualização manual das localidades:

```bash
node --env-file=.env.local --conditions=react-server --import tsx scripts/sync-geography.ts
```

## Fontes oficiais complementares

- Receita Federal/Serpro: `/api-cnpj-empresa/v2/empresa/{cnpj}`; exige credenciamento no Conecta;
- Conecta/Correios: `/api-cep/v1/consulta/cep/{cep}`; exige credenciamento e IP permitido;
- IBGE: `/api/v1/localidades/estados` e `/api/v1/localidades/municipios`; pública e sem chave;
- BrasilAPI: fallback automático de CNPJ e CEP.

As credenciais do Conecta usam apenas variáveis de servidor `CONNECTA_GOV_*`. Em hospedagens sem IP de saída fixo, execute o provider credenciado por um worker com IP estático autorizado e mantenha a BrasilAPI como contingência.

## Banco e segurança

As migrações ficam em `supabase/migrations` (nome histórico; são aplicadas por `scripts/local-db-setup.ts`). Dados públicos são compartilhados; empresas, oportunidades, favoritos, portal do cliente e dados fiscais são isolados por tenant com RLS. O portal público acessa somente funções com DTO reduzido e token SHA-256 válido e temporário.

Certificados digitais e senhas de PFX não pertencem ao Postgres. O banco guarda apenas referência do cofre, fingerprint e metadados. Consulte `docs/architecture.md` e `docs/fiscal-security.md` antes de implementar o worker fiscal.

## Licença do mapa

O mapa utiliza `@svg-maps/brazil`, distribuído sob CC BY 4.0. Preserve a atribuição do pacote nas distribuições do produto.
