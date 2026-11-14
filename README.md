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
- sincronização incremental via GitHub Actions;
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

Com Supabase (produção): remova `NEXT_PUBLIC_DATA_BACKEND` do `.env.local`, preencha as chaves do projeto e aplique o esquema (veja "Publicar").

Acesse [http://localhost:3000](http://localhost:3000).

## Publicar (Supabase + Vercel)

1. **Banco**: rode `npm run db:bundle` e cole `supabase/schema-bundle.sql` no SQL Editor do projeto Supabase (ou use `npx supabase link --project-ref lciaajnqcvbuurajgmti` e `npx supabase db push --linked`).
2. **Auth** (Supabase > Authentication > URL Configuration): defina *Site URL* com o domínio da Vercel e inclua `https://SEU-DOMINIO/auth/callback` em *Redirect URLs*.
3. **Vercel**: importe o repositório (framework Next.js, detectado sozinho) e cadastre em Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `INTERNAL_SYNC_SECRET`, `APP_OWNER_EMAIL`, `NEXT_PUBLIC_APP_URL` e, se usar, `PORTAL_TRANSPARENCIA_API_KEY`. **Não** defina `NEXT_PUBLIC_DATA_BACKEND`.
4. **Primeira carga** (com as variáveis de produção no ambiente): `npm run sync:geography`, `npm run sync:catalog` e `npm run sync:procurements:quick`.

Comandos de qualidade:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Sincronização contínua

O workflow `.github/workflows/sync-data.yml` executa o coletor e também aceita início manual. No repositório GitHub, cadastre estes Actions Secrets:

- `SUPABASE_URL`: URL do projeto;
- `SUPABASE_SECRET_KEY`: chave secreta do servidor, nunca a chave publicável.

O PNCP tem prioridade e o Compras.gov funciona como redundância. A rotina consulta `/v1/modalidades` e percorre todas as modalidades ativas; se a tabela de domínio estiver temporariamente indisponível, usa o último conjunto oficial verificado no código. Cada fonte mantém checkpoint e estado próprios, e uma falha não cancela a outra. As APIs oficiais são HTTP paginadas, não streaming. O painel recebe as alterações do banco por Realtime após cada ciclo de coleta.

O GitHub Actions executa uma varredura rápida das licitações a cada cinco minutos, sem itens, para capturar novidades com baixa latência. As modalidades são processadas de forma cadenciada e o cliente respeita `Retry-After` para evitar bloqueios HTTP 429. A base geográfica do IBGE é renovada diariamente. Enriquecimento de itens e cargas históricas são executados separadamente para não atrasar a descoberta de oportunidades.

Em paralelo, a rotina `recent-results` busca resultados homologados, hidrata automaticamente contratações e itens ainda ausentes e alimenta concorrentes, vitórias e preços. O job `historical-results` retrocede em janelas de sete dias até 2021, enquanto o `sync-watchdog` verifica a saúde das fontes e recupera ciclos parados. Nenhum cursor avança deixando uma página parcialmente hidratada para trás.

Além da atualização recente, o job diário `historical-backfill` mantém um cursor independente por fonte. Ele percorre desde os dados mais novos até `2021-01-01`, retoma exatamente a modalidade e a página pendentes e só avança após uma execução bem-sucedida. Ajuste `BACKFILL_MIN_DATE` se for necessário ampliar ou reduzir a cobertura histórica. PNCP e Compras.gov.br rodam em jobs independentes; a indisponibilidade de uma fonte não interrompe a outra.

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

## GitHub e hospedagem

O código não depende de configuração proprietária da Vercel. Depois de enviar o repositório ao GitHub, importe-o na hospedagem escolhida e copie as variáveis de `.env.example`. A chave `SUPABASE_SECRET_KEY` é exclusiva do ambiente de servidor.

## Banco e segurança

As migrações ficam em `supabase/migrations`. Dados públicos são compartilhados; empresas, oportunidades, favoritos, portal do cliente e dados fiscais são isolados por tenant com RLS. O portal público acessa somente funções com DTO reduzido e token SHA-256 válido e temporário.

Certificados digitais e senhas de PFX não pertencem ao Postgres. O banco guarda apenas referência do cofre, fingerprint e metadados. Consulte `docs/architecture.md` e `docs/fiscal-security.md` antes de implementar o worker fiscal.

## Licença do mapa

O mapa utiliza `@svg-maps/brazil`, distribuído sob CC BY 4.0. Preserve a atribuição do pacote nas distribuições do produto.
