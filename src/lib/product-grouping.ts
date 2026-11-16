/**
 * Agrupamento de itens equivalentes (mesmo produto, descrições diferentes) e classificação por nicho.
 * Sem dependências de servidor: usado pelo script de agrupamento e pelos testes.
 */

export const NICHES = [
  "Saúde e hospitalar",
  "Alimentos e bebidas",
  "Informática e tecnologia",
  "Escritório e papelaria",
  "Limpeza e higiene",
  "Construção e obras",
  "Elétrica e iluminação",
  "Hidráulica e saneamento",
  "Veículos, peças e combustíveis",
  "Mobiliário e utensílios",
  "Ferramentas e ferragens",
  "Máquinas e equipamentos",
  "Laboratório e química",
  "Vestuário e têxtil",
  "Educação, esporte e lazer",
  "Segurança e emergência",
  "Climatização e refrigeração",
  "Agropecuária",
  "Embalagens",
  "Serviços de engenharia e obras",
  "Serviços de manutenção",
  "Locação e transporte",
  "Eventos, comunicação e publicidade",
  "Serviços de tecnologia",
  "Serviços de saúde",
  "Serviços gerais",
  "Outros",
] as const;
export type Niche = (typeof NICHES)[number];

/** Remove acentos e passa para minúsculas. */
export function fold(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const STOPWORDS = new Set([
  "de", "da", "do", "das", "dos", "para", "com", "sem", "em", "e", "ou", "a", "o", "as", "os", "no", "na", "nos", "nas", "por", "pelo", "pela",
  "um", "uma", "ao", "aos", "que", "tipo", "material", "marca", "modelo", "uso", "similar", "equivalente", "unidade", "unid", "und", "un",
  "tamanho", "cor", "nome", "descricao", "especificacao", "item", "conforme", "demais", "diversos", "outros", "entre", "sobre", "ate", "mais",
  "aprox", "aproximado", "metro", "metros", "centimetro", "centimetros", "milimetro", "milimetros", "litro", "litros", "quilo", "quilos", "grama", "gramas", "polegada", "polegadas", "comprimento", "largura", "altura", "espessura", "diametro", "minimo", "maximo", "padrao", "tecnica", "tecnicas", "caracteristicas",
]);

/** Remove números, medidas e símbolos; mantém só palavras. */
function words(text: string) {
  return fold(text)
    .replace(/\(.*?\)/g, " ")
    .replace(/\d+([.,]\d+)?\s*(mm|cm|m|kg|g|mg|ml|l|lt|w|v|kw|kva|hp|cv|pol|x)?\b/g, " ")
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function singular(word: string) {
  if (word.length > 4 && word.endsWith("oes")) return `${word.slice(0, -3)}ao`;
  if (word.length > 4 && word.endsWith("res")) return word.slice(0, -2);
  if (word.length > 4 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** Trecho que nomeia o produto: o que vem antes de ":", ";", " - " ou vírgula (o resto são atributos). */
function headPhrase(description: string) {
  const first = description.split(/[:;]|\s[-–]\s|,/)[0] ?? description;
  return first.trim();
}

export interface HeadKey {
  /** Chave de comparação: palavras principais, sem acento/plural, em ordem alfabética (a ordem das palavras não importa). */
  key: string;
  /** Nome para exibir. */
  name: string;
}

/** Palavras que sozinhas não dizem qual é o produto ("Lote 07", "Prestação de serviços", "Aquisição de..."). */
const GENERIC = new Set([
  "lote", "item", "grupo", "subitem", "servico", "prestacao", "fornecimento", "aquisicao", "contratacao", "execucao", "objeto",
  "produto", "produtos", "equipamento", "equipamentos", "material", "materiais", "fornecedor", "empresa", "especializada",
  "pregao", "registro", "preco", "precos", "ata", "global", "unico", "complementar", "geral", "diversos",
]);

export function headKey(description: string): HeadKey | null {
  const phrase = headPhrase(description);
  const meaningful = (text: string) => words(text).filter((word) => word.length > 1 && !STOPWORDS.has(word)).map(singular);
  let tokens = meaningful(phrase);
  let usedPhrase = phrase;
  // Começo genérico: usa o texto inteiro, descartando as palavras genéricas, para não juntar produtos sem relação
  if (tokens.filter((word) => !GENERIC.has(word)).length < 1) {
    usedPhrase = description;
    tokens = meaningful(description);
  }
  // Nome de uma palavra só ("Cabo", "Bomba", "Filtro") não identifica o produto: usa as primeiras palavras dos atributos
  if (usedPhrase === phrase && tokens.filter((word) => !GENERIC.has(word)).length < 2) {
    const rest = meaningful(description.slice(phrase.length)).filter((word) => !GENERIC.has(word)).slice(0, 3);
    if (rest.length) { tokens = [...tokens, ...rest]; usedPhrase = description.replace(/[:;]/g, " "); }
  }
  const unique = [...new Set(tokens.filter((word) => !GENERIC.has(word) || tokens.length <= 2))].slice(0, 6);
  if (unique.length === 0 || unique.every((word) => GENERIC.has(word))) return null;
  const name = usedPhrase.replace(/\s+/g, " ").trim().slice(0, 90);
  const display = name === name.toUpperCase() ? name.charAt(0) + name.slice(1).toLowerCase() : name;
  return { key: [...unique].sort().join(" "), name: display };
}

type Rule = [Niche, RegExp];

/** Nicho pelo grupo oficial do catálogo (CATMAT/CATSER). Ordem importa: a primeira regra que casar vence. */
const CATALOG_RULES: Rule[] = [
  ["Saúde e hospitalar", /MEDIC|DENTAR|VETERIN|HOSPITAL|FARMAC|SAUDE|ORTOPED/],
  ["Alimentos e bebidas", /SUBSISTENCIA|ALIMENT/],
  ["Informática e tecnologia", /INFORMATICA|TIC\b|PROCESSAMENTO DE DADOS|COMUNICACOES|DETECAO|FIBRAS|FOTOGRAFIC/],
  ["Escritório e papelaria", /ESCRITORIO|EXPEDIENTE|LIVROS|PUBLICACOES/],
  ["Limpeza e higiene", /LIMPEZA|HIGIENE/],
  ["Elétrica e iluminação", /ELETRIC|ELETRONIC|ILUMINACAO|LAMPADA|ENERGIA|CONDUTORES/],
  ["Hidráulica e saneamento", /CANOS|TUBOS|MANGUEIRA|VALVULA|BOMBAS|COMPRESSOR|HIDRAULIC|PURIFICACAO|ESGOTO/],
  ["Climatização e refrigeração", /REFRIGERACAO|AR CONDICIONADO|AQUECIMENTO|FORNOS|SECAGEM/],
  ["Veículos, peças e combustíveis", /VEICULO|MOTORES|PNEU|COMBUSTIVEL|LUBRIFICANTE|ROLAMENTO|TRANSMISSAO DE FORCA|NAVIO|EMBARCACO|FERROVIARI/],
  ["Mobiliário e utensílios", /MOBILIARIO|UTENSILIOS|DOMESTICO|PREPARAR E SERVIR|EQUIPAMENTOS COMERCIAIS/],
  ["Ferramentas e ferragens", /FERRAGENS|ABRASIVO|FERRAMENTAS|BARRAS|CHAPAS|PERFILADOS|TRABALHO EM METAIS|CORDAS|CABOS|CORRENTES/],
  ["Construção e obras", /CONSTRUCAO|TABUAS|ESQUADRIAS|MADEIRA|ESTRUTURAS|ANDAIMES|PINCEIS|TINTAS|VEDANTES|MINERIOS|MINERAIS|NAO METALICOS|MATERIAS-PRIMAS/],
  ["Laboratório e química", /LABORATORIO|QUIMICO|SUBSTANCIAS/],
  ["Vestuário e têxtil", /VESTUARIO|TECIDOS|COUROS|AVIAMENTOS|INSIGNIAS/],
  ["Educação, esporte e lazer", /RECREACAO|DESPORTO|MUSICAIS|TREINAMENTO/],
  ["Segurança e emergência", /INCENDIO|ALARME|SEGURANCA|ARMAMENTO|MUNICOES|EXPLOSIVOS|RESGATE/],
  ["Agropecuária", /AGRICOLA|AGRICOLAS|ANIMAIS/],
  ["Embalagens", /RECIPIENTES|EMBALAGEM|ACONDICIONAMENTO/],
  ["Máquinas e equipamentos", /MAQUINAS|EQUIPAMENTOS PARA|INSTRUMENTOS DE MEDICAO|MANUSEIO|OFICINAS/],
  // serviços
  ["Serviços de engenharia e obras", /ENGENHARIA|OBRA|REFORMA|ARQUITETURA|TOPOGRAFIA|PAVIMENTA|PROJETO/],
  ["Locação e transporte", /LOCACAO|ALUGUEL|TRANSPORTE|FRETE|PASSAGEM|HOSPEDAGEM/],
  ["Serviços de manutenção", /MANUTENCAO|REPARO|CONSERVACAO|INSTALACAO/],
  ["Eventos, comunicação e publicidade", /EVENTO|PUBLICIDADE|COMUNICACAO|IMPRESSAO|GRAFIC|MIDIA|TREINAMENTO|CAPACITACAO|CURSO/],
  ["Serviços de tecnologia", /SOFTWARE|SISTEMA|TECNOLOGIA|TELECOMUNICACAO|TELEFONIA|HOSPEDAGEM DE/],
  ["Serviços de saúde", /SAUDE|MEDIC|LABORATORIAL|EXAME/],
  ["Serviços gerais", /LIMPEZA|VIGILANCIA|SEGURANCA|APOIO|MAO DE OBRA|SERVICO|ADMINISTRATIV|CONSULTORIA|ASSESSORIA|AUDITORIA/],
];

/** Nicho pelas palavras do próprio item (quando não há código de catálogo). */
const TEXT_RULES: Rule[] = [
  ["Serviços de engenharia e obras", /\b(obra|reforma|construcao de|pavimentacao|engenharia|projeto executivo|drenagem|terraplenagem|recapeamento|asfalto)\b/],
  ["Locação e transporte", /\b(locacao|aluguel|transporte|frete|passagem|fretamento)\b/],
  ["Serviços de manutenção", /\b(manutencao|conserto|reparo|conservacao|instalacao de)\b/],
  ["Eventos, comunicação e publicidade", /\b(evento|show|apresentacao artistica|banda|publicidade|divulgacao|impressao|palco|sonorizacao|cerimonial)\b/],
  ["Serviços de tecnologia", /\b(software|licenca de|sistema de gestao|hospedagem|suporte tecnico|desenvolvimento de sistema)\b/],
  ["Serviços de saúde", /\b(exame|consulta|cirurgia|procedimento|hemodinamica|terapia|atendimento medico)\b/],
  ["Serviços gerais", /\b(servico|prestacao de|contratacao de empresa|limpeza predial|vigilancia|consultoria|assessoria|treinamento|capacitacao)\b/],
  ["Saúde e hospitalar", /\b(medicamento|comprimido|capsula|injetavel|seringa|luva|cirurgic|hospitalar|curativo|sonda|cateter|ortodont|odontolog|insulina|fralda|gaze|esparadrapo|ampola|soro|vacina|estetoscopio|desfibrilador|ventilador pulmonar|maca|protese|anestesic|antibiotic|dipirona|paracetamol|omeprazol|losartana|oximetro|termometro)\b/],
  ["Alimentos e bebidas", /\b(alimento|arroz|feijao|acucar|cafe|leite|carne|frango|oleo de|farinha|macarrao|biscoito|bolacha|suco|refrigerante|agua mineral|hortifruti|fruta|legume|verdura|ovo|pao|tempero|sal|molho|enlatado|merenda|cesta basica|alimentacao|refeicao|marmita|salsicha|queijo|iogurte)\b/],
  ["Informática e tecnologia", /\b(computador|notebook|monitor|impressora|toner|cartucho|tablet|servidor|switch|roteador|nobreak|teclado|mouse|pen drive|hd|ssd|memoria ram|webcam|projetor|scanner|software|antivirus|cabo de rede|cftv|camera|celular|smartphone|tv|televisor|telefone)\b/],
  ["Escritório e papelaria", /\b(papel|caneta|lapis|caderno|envelope|grampo|clips|pasta|arquivo|etiqueta|fita adesiva|cola|borracha|apagador|carimbo|prancheta|agenda|bloco|marcador|post-it|calculadora|tesoura|regua|pincel atomico|almofada|livro)\b/],
  ["Limpeza e higiene", /\b(detergente|desinfetante|sabao|sabonete|alcool|agua sanitaria|papel higienico|papel toalha|esponja|vassoura|rodo|balde|saco de lixo|luva de limpeza|shampoo|creme dental|desodorante|inseticida|cloro|multiuso|flanela|pano de chao|lixeira|absorvente)\b/],
  ["Construção e obras", /\b(cimento|areia|brita|tijolo|bloco de concreto|telha|piso|azulejo|ceramica|tinta|massa corrida|argamassa|ferro|vergalhao|madeira|porta|janela|vidro|gesso|forro|cal|reboco|manta asfaltica|pedra|concreto|esquadria|tubo pvc|verniz|selador)\b/],
  ["Elétrica e iluminação", /\bb(lampada|luminaria|led|reator|fio|cabo eletrico|cabo pp|cabo flexivel|cabo de cobre|cabo isolado|cabo de energia|disjuntor|tomada|interruptor|quadro de distribuicao|transformador|bateria|pilha|poste|refletor|fusivel|conector|eletroduto|cabo flexivel|soquete)\b/],
  ["Hidráulica e saneamento", /\b(torneira|registro|valvula|cano|tubo|conexao|joelho|luva pvc|bomba d|caixa d agua|reservatorio|hidrometro|vaso sanitario|pia|sifao|mangueira|esgoto|saneamento|tratamento de agua)\b/],
  ["Veículos, peças e combustíveis", /\b(pneu|oleo lubrificante|filtro de|pastilha|amortecedor|bateria automotiva|gasolina|diesel|etanol|combustivel|automovel|caminhao|onibus|motocicleta|ambulancia|veiculo|retrovisor|correia|embreagem|radiador|farol|para-choque|escapamento)\b/],
  ["Mobiliário e utensílios", /\b(cadeira|mesa|armario|estante|sofa|gaveteiro|banco|poltrona|balcao|arquivo de aco|beliche|colchao|travesseiro|cama|fogao|geladeira|freezer|micro-ondas|bebedouro|panela|prato|copo|talher|garrafa|jarra|bandeja|cortina|persiana|tapete|ventilador)\b/],
  ["Ferramentas e ferragens", /\b(furadeira|parafusadeira|serra|martelo|chave de|alicate|trena|broca|parafuso|prego|porca|arruela|lixa|disco de corte|esmerilhadeira|cadeado|dobradica|fechadura|corrente|talhadeira|nivel|escada|enxada|pa |picareta)\b/],
  ["Climatização e refrigeração", /\b(ar condicionado|split|climatizador|exaustor|camara fria|refrigeracao|gas refrigerante|aquecedor|bebedouro industrial)\b/],
  ["Segurança e emergência", /\b(extintor|epi|capacete|bota de seguranca|colete|alarme|sirene|cone|sinalizacao|uniforme tatico|algema|detector de fumaca|mascara|oculos de protecao|protetor auricular|cinto de seguranca)\b/],
  ["Vestuário e têxtil", /\b(camisa|camiseta|calca|bermuda|jaleco|uniforme|blusa|jaqueta|bone|meia|sapato|tenis|bota|tecido|malha|lencol|toalha|fardamento|avental|cobertor|manta)\b/],
  ["Educação, esporte e lazer", /\b(bola|jogo|brinquedo|instrumento musical|violao|piano|bateria musical|quadra|rede de|uniforme esportivo|material didatico|livro didatico|kit escolar|mochila|playground|brinquedoteca|educativ|pedagogic|tabuleiro)\b/],
  ["Agropecuária", /\b(semente|muda|adubo|fertilizante|defensivo|racao|trator|implemento agricola|irrigacao|cerca|arame|animal|bovino|equino|vacina veterinaria|silo|colhedora|plantadeira|pulverizador)\b/],
  ["Laboratório e química", /\b(reagente|laboratorio|pipeta|tubo de ensaio|becker|microscopio|centrifuga|estufa|autoclave|balanca de precisao|acido|solvente|reagentes|bureta|placa de petri)\b/],
  ["Embalagens", /\b(embalagem|caixa de papelao|saco plastico|sacola|filme stretch|fita de arquear|pote|frasco|bobina|palete|garrafao)\b/],
  ["Máquinas e equipamentos", /\b(maquina|gerador|motor|compressor|empilhadeira|guindaste|retroescavadeira|soldadora|equipamento|grupo gerador|motosserra|roçadeira|cortador de grama|betoneira|trator)\b/],
];

const SERVICE_NICHES = new Set<Niche>([
  "Serviços de engenharia e obras", "Serviços de manutenção", "Locação e transporte", "Eventos, comunicação e publicidade",
  "Serviços de tecnologia", "Serviços de saúde", "Serviços gerais",
]);

/**
 * Nicho de um item. O grupo oficial do catálogo (quando existe) tem prioridade sobre as palavras do texto.
 * `kind` ("material" | "servico") evita que um serviço caia em nicho de produto e vice-versa.
 */
export function nicheFor(headText: string, catalogGroup?: string | null, kind?: "material" | "servico" | null): Niche {
  const allowed = (niche: Niche) => !kind || (kind === "servico") === SERVICE_NICHES.has(niche);
  if (catalogGroup) {
    const group = fold(catalogGroup).toUpperCase();
    for (const [niche, pattern] of CATALOG_RULES) if (allowed(niche) && pattern.test(group)) return niche;
  }
  const text = ` ${fold(headText)} `;
  for (const [niche, pattern] of TEXT_RULES) if (allowed(niche) && pattern.test(text)) return niche;
  return kind === "servico" ? "Serviços gerais" : "Outros";
}
