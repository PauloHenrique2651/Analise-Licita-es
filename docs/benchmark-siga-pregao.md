# Benchmark: Siga Pregão × Nexo Público

Levantamento feito em 12/11/2026 a partir das páginas públicas do Siga Pregão (site, páginas de módulo e tabela de planos). A área logada ainda não foi mapeada. O objetivo é listar **funcionalidades**, não copiar textos, layout ou marca; cada item será implementado com design e código próprios.

Legenda de status no Nexo: **Tem** = já existe · **Parcial** = existe, mas falta parte · **Não tem**.

## 1. Oportunidades (encontrar licitações)

| Funcionalidade no Siga | O que faz | Nexo | Observação / fonte de dados |
|---|---|---|---|
| Busca de editais com filtros | Data, UF, portal, modalidade, órgão, valor, modo de disputa, exclusiva ME/EPP, nº do pregão | Parcial | `search_procurements` já filtra UF, cidade, órgão, modalidade, portal, situação, datas e valor. Faltam **modo de disputa** e **exclusiva ME/EPP** (ambos vêm do PNCP). |
| Painel do dia | Novas hoje, abertas, encerram em 24h; separação material × serviço; faixas de valor (até 50 mil, até 250 mil, acima) | Não tem | Derivável das licitações já sincronizadas. |
| "Jornais" (alertas diários) | Filtros salvos que entregam as oportunidades novas todo dia, sem pesquisar | Parcial | Nexo salva alertas, mas **não entrega** (falta rotina diária + e-mail/WhatsApp). |
| Busca por órgão comprador | Ver o que cada órgão compra e com que recorrência | Parcial | Módulo Órgãos tem volume; falta a visão "editais abertos deste órgão" e recorrência por segmento. |
| Pagômetro | Nota e prazo médio de pagamento do órgão antes de disputar | Não tem | Precisa de fonte: despesas/pagamentos do Portal da Transparência (federal) e dados fiscais de estados e municípios (Tesouro/SICONFI), a avaliar. |
| Pesquisa rápida por número | Abrir um edital pelo nº do pregão/dispensa | Parcial | A busca textual cobre parte; falta campo dedicado. |
| Licitações desertas | Editais sem propostas, com menos concorrência | Não tem | PNCP e Compras.gov informam situação do item (deserto/fracassado). |

## 2. Meus Negócios (gestão das disputas)

| Funcionalidade no Siga | O que faz | Nexo | Observação |
|---|---|---|---|
| Funil visual | Etapas oportunidade → qualificação → disputa → classificação → contrato, personalizáveis | Parcial | Nexo tem funil com estágios fixos e troca por select; falta **arrastar e soltar** e **etapas personalizadas**. |
| Quadro de negócios | Lista com etapa, progresso do checklist e data de cada licitação | Parcial | Falta o indicador de progresso (ex.: 9/15 tarefas). |
| Checklist com modelos | Tarefas padrão por licitação (analisar edital, documentação, esclarecimentos…) | Parcial | Nexo tem checklist manual; faltam **modelos prontos** aplicados ao criar o negócio. |
| Agenda sincronizada | Datas do edital (abertura, proposta, disputa) entram sozinhas no calendário | Parcial | Agenda do Nexo lista prazos; falta visão de **calendário mensal** e tipos de evento. |

## 3. Análise (mercado e concorrência)

| Funcionalidade no Siga | O que faz | Nexo | Observação |
|---|---|---|---|
| Tamanho do mercado | Valor contratado por mês e totais de órgãos, empresas e marcas para um termo | Parcial | Módulo Mercado tem KPIs; falta a busca por termo com série mensal. |
| Histórico de compras | Item, marca, preço unitário, quantidade e vencedor das últimas compras | **Tem** | "Preços por região" (Painel de Preços) com filtro por UF, município e unidade. |
| Raio X de empresas | Participações, vitórias, derrotas, taxa de vitória e nichos de atuação | Parcial | Concorrentes mostra vitórias e valor; **participações e derrotas** exigem dados de propostas (Portal da Transparência traz participantes de licitações federais). |
| Encontrar fornecedor com IA | Sugere fornecedores aderentes ao objeto, com nota de aderência | Não tem | Combinar histórico de vitórias por item + CNAE (módulo fornecedor do Compras.gov) + IA. |
| Ler edital com IA | Perguntas e respostas sobre o edital, com limite diário | Não tem | Usar a API do Claude sobre o PDF do edital (arquivos do PNCP já são consultados). |

## 4. Disputa (automação de lances)

| Funcionalidade no Siga | O que faz | Nexo | Observação |
|---|---|---|---|
| Robô de lances | Lances automáticos no Comprasnet (modos aberto e aberto/fechado) com limites configurados | Não tem | Exige operar a sessão do licitante no Comprasnet. **Avaliar regras do portal e aspectos jurídicos antes de construir.** |
| Monitor do chat do pregoeiro | Junta as mensagens da sessão e alerta convocações e prazos | Não tem | Mesma dependência da sessão no portal. |
| Simulador de lance | — | **Tem (diferencial Nexo)** | Nexo já simula o lance contra preços históricos. |

## 5. Documentos e outros

| Funcionalidade no Siga | Nexo | Observação |
|---|---|---|
| Modelos de impugnação, esclarecimento e recurso | **Tem** | Módulo Jurídico. |
| Conectores com ChatGPT, Claude e Gemini | Não tem | Expor um servidor MCP do Nexo para assistentes de IA. |
| Aplicativo móvel | Não tem | O Nexo é responsivo; app nativo seria fase posterior. |
| Várias empresas (CNPJs) na mesma conta | Parcial | Nexo é multiempresa por tenant; falta troca rápida de CNPJ ativo na interface. |
| Portal do cliente, emissão fiscal | — | **Diferenciais do Nexo** sem equivalente público no Siga. |

## Prioridade sugerida

1. **Painel do dia + filtros ME/EPP e modo de disputa**: dados que já temos, alto valor diário.
2. **Entrega dos alertas (jornal diário)**: transforma alertas salvos em hábito de uso.
3. **Funil com arrastar e soltar, checklist com modelos e agenda mensal**: completa a gestão.
4. **Licitações desertas e pesquisa por número**.
5. **Leitura de edital com IA** (Claude) e **fornecedores com IA**.
6. **Pagômetro**: depende de definir a fonte de dados de pagamentos de estados e municípios.
7. **Robô de lances e monitor de chat**: só após análise jurídica e das regras do Comprasnet.

## Área logada (mapeada em 12/11/2026, somente leitura)

Menu principal: **IA · Oportunidades · Negócios · Análise · Disputa · Jurídico**, mais sino de notificações, ajuda e menu da conta. Abaixo, o que cada tela faz.

### IA (agentes; a maioria no plano mais caro, várias "em breve")
- **Prospecta**: o usuário cadastra os interesses da empresa uma vez; todo dia o agente varre as oportunidades e joga as aderentes direto no funil.
- **Leitor**: lê o edital inteiro, extrai exigências e transforma em checklist dentro do negócio.
- **Fornecedor**: a partir dos itens da licitação, busca fornecedores, compara preços e monta cotação com margem.
- **Jurídico**: a partir de um fato da licitação, analisa o edital e sugere estratégia e a peça (esclarecimento, impugnação, recurso, contrarrazões).
- **Monitor**: vigia as licitações do usuário nos portais (Comprasnet e Portal de Compras Públicas): andamento da compra, menções no chat do pregoeiro e itens acompanhados, avisando quando algo muda.
- **Pagômetro**: risco/prazo de pagamento do ente (ver Órgãos).
- **Conector de IA**: leva os mesmos agentes para ChatGPT, Claude e Gemini.

### Oportunidades
- **Encontrar**: busca por termos com período e **pesquisa avançada**: palavras para excluir e para limitar, material/serviço, modo de disputa, estados, **20 portais** (Comprasnet, Portal de Compras Públicas, Licitações-e, Licitações Caixa, BLL, Licitanet, BNC, portais estaduais como RS, BA, AM, GO, RJ, MG, SC, PE, Recife, Banrisul, Banpará e "Outros/PNCP"), modalidade (pregão, dispensa), órgão/fonte PNCP, faixa de valor, valor sigiloso, **exclusiva ME/EPP**, **excluir registro de preços** e quantidade máxima de itens.
- **Detalhe da oportunidade** (painel lateral): portal, modalidade e número, órgão, objeto, **categorias automáticas** (etiquetas de segmento), valor estimado, selo de registro de preço, data de abertura e modo de disputa. Ações: abrir no portal, edital/anexos, arquivos do edital, **conversar com o edital (IA)**, **Pagômetro do ente**, **adicionar aos meus negócios** e lista de itens com busca. Também compartilhar e tela cheia.
- **Meus jornais**: filtros salvos que viram aviso diário (também configurável em Meus dados).
- **Encontrar por número** e **Superoportunidades/desertas** (licitações com pouca ou nenhuma proposta).
- **Órgãos**: catálogo de cerca de 64 mil órgãos com ente, portais usados, histórico de compras, Pagômetro e lista de órgãos que aderem ao **AntecipaGov** (antecipação de recebíveis).

### Negócios
- **Quadros**: Kanban com 5 colunas (Oportunidade, Qualificação, Disputa, Classificação, Contrato), filtro por empresa, favoritos e portal. Visões **Lista** e **Agenda** anunciadas como "em breve".
- **Adicionar negócio** em 3 passos: escolher a oportunidade → escolher os itens que vai disputar → nome e empresa (CNPJ).
- **Sincronizar negócios do Comprasnet** (importa as participações da conta do licitante).
- **Agenda**: calendário mensal com os eventos dos negócios, filtro por empresa.
- **Encontrar fornecedor (IA)**: descreve o item e recebe sugestões de fornecedores.

### Análise
- **Análise de mercado**: termo + período → contadores de correspondências, itens de catálogo, estados, órgãos, empresas e marcas, com série no tempo.
- **Histórico de compras** (base: atas de processos): termos separados por ";", pesquisa exata, excluir e limitar, filtros por período, portal, modalidade, **situação** (aceito e habilitado, encerrado, cancelado, fracassado/deserto/revogado, anulado), **resultado da empresa** (vencedora, desclassificada, inabilitada), **número de licitantes** (deserto, 1, 2, 3) e **marca/fabricante/modelo**.
- **Análise de empresas** (por CNPJ ou nome): participações, valores, vitórias por modalidade, **penalidades**, vitórias × derrotas, valor homologado × disputado, desclassificações × inabilitações e **motivos de desclassificação**.

### Disputa
- **Máquina de Lances (Comprasnet)**: programa **para Windows** que o usuário baixa e roda no próprio computador. Opera nos modos aberto e aberto/fechado por item; não automatiza disputa por grupo. Requisitos: Windows 10 64-bit, i5 com 4+ núcleos, 8 GB de RAM. O login no portal fica na máquina do usuário, não no servidor do Siga.

### Jurídico
- Banco de peças com busca: impugnação, esclarecimento, intenção de recurso, recurso e contrarrazões; filtro "somente nova lei" (14.133).

### Conta
- **Meus documentos**: cofre de arquivos com pastas, upload, tipos (PDF, imagem, documento, planilha) e **controle de validade** (com validade, próximos a vencer, vencidos), útil para certidões de habilitação.
- **Minhas empresas**: vários CNPJs na mesma conta.
- **Meus dados**: perfil, WhatsApp, opção de **jornal diário de pregões**, tema, assinatura e consumo do plano, e-mail adicional e **anotações para a IA** (contexto da empresa usado pelos agentes).

## Lacunas novas identificadas na área logada

| Funcionalidade | Nexo | Observação |
|---|---|---|
| Palavras para excluir/limitar na busca | Não tem | Simples sobre a busca textual atual. |
| Filtro "excluir registro de preços" e "valor sigiloso" | Não tem | PNCP informa `srp` e valor sigiloso. |
| Categorias automáticas (etiquetas de segmento) | Não tem | Classificar objeto/itens por CATMAT/CATSER (já temos o catálogo carregado). |
| Conversar com o edital (IA) | Não tem | Claude sobre os arquivos do PNCP. |
| Adicionar negócio escolhendo os itens | Parcial | Nexo vincula a licitação inteira à oportunidade. |
| Histórico com situação, resultado (desclassificada/inabilitada) e nº de licitantes | Parcial | Precisa dos dados de propostas, não só de vencedores. |
| Penalidades e motivos de desclassificação por empresa | Não tem | Penalidades: CEIS/CNEP do Portal da Transparência (chave já configurada). |
| Cofre de documentos com validade | Não tem | Nexo tem documentos do portal do cliente, não certidões da própria empresa. |
| Sincronizar participações do Comprasnet | Não tem | Depende da conta do licitante no portal. |
| Anotações da empresa para a IA | Não tem | Contexto para os futuros agentes. |
| 20 portais na busca | Parcial | Nexo cobre PNCP, Compras.gov e SIGA/RJ; os demais portais publicam no PNCP, mas com menos detalhe. |
