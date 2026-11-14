# Arquitetura

## Fluxo principal

```text
Browser
  → Next.js App Router
    → Route handlers / serviços server-only
      → providers externos
      → Supabase Auth + Postgres + Realtime + Storage
```

Chamadas externas nunca partem de componentes React. Connectors PNCP e Compras.gov implementam uma interface comum, validam respostas com Zod e devolvem licitações, itens e resultados normalizados. O repositório resolve deduplicação, origem primária, fornecedores, preços homologados e rastreabilidade; os serviços controlam paginação, checkpoints e falhas isoladas.

## Multi-tenancy

- `auth.users` autentica a identidade.
- `users.active_tenant_id` define o tenant da sessão.
- `tenant_members.role` controla owner, admin, analyst, sales e viewer.
- RLS usa `is_tenant_member(tenant_id)` em todas as entidades privadas.
- entidades públicas de mercado são compartilhadas e somente leitura para usuários autenticados.

## Dados e analytics

Tabelas transacionais preservam `source_id`, endpoint, identificador externo e datas de importação. Materialized views atendem o dashboard sem repetir joins pesados: `market_summary`, `company_performance`, `product_market_summary` e `organization_purchase_summary`.

`imports`, `sync_logs` e `procurement_sync_state` registram checkpoint, duração implícita por timestamps, processados, upserts e erros por fonte. `procurement_sources` mantém todas as origens da mesma licitação canônica. GitHub Actions executa o coletor fora do request web e Supabase Realtime atualiza o painel quando cada import muda.

A esteira é separada em descoberta recente, resultados recentes, histórico de licitações, histórico de resultados e complementos estaduais. O cursor de resultados só avança quando toda a página foi hidratada; se faltar a licitação ou o item pai, a mesma página é retomada. Um watchdog encerra execuções abandonadas e relança lotes pequenos quando uma fonte fica sem sucesso além da janela operacional.

## Portal do cliente

O token aleatório aparece uma única vez. Somente SHA-256 é persistido. Funções públicas validadas retornam um snapshot mínimo do processo e aceitam mensagens com tamanho e rate limit. O navegador atualiza a conversa a cada cinco segundos; o painel do licitante recebe eventos de banco por Realtime.

## IA

O botão Assistente é uma fronteira preparada, não uma simulação. Quando `OPENAI_API_KEY` for configurada, o servidor deve consultar dados estruturados autorizados e enviar apenas o recorte necessário à Responses API, citando registros utilizados. Uma assinatura ChatGPT Free não inclui uso gratuito da API.
