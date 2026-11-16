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

/** Rótulos de atributo que sobram no fim do nome ("Fita Adesiva material", "Cesto Lixo tipo"). */
const ATTRIBUTE_LABELS = new Set([
  "material", "tipo", "tamanho", "modelo", "aplicacao", "caracteristicas", "caracteristica", "adicionais", "aspecto", "fisico", "composicao",
  "capacidade", "dosagem", "concentracao", "especie", "tensao", "nominal", "potencia", "cor", "cores", "espessura", "formato", "apresentacao",
  "finalidade", "uso", "qualidade", "base", "nome", "descricao", "medida", "medidas", "dimensoes", "acabamento",
]);

/** Nome para exibir: sem código na frente, sem rótulos de atributo no fim e sem a mesma frase repetida. */
export function displayName(raw: string) {
  const text = raw.replace(/\s+/g, " ").trim().replace(/^\d+\s*[-–]\s*/, "");
  let tokens = text.split(" ").filter(Boolean);
  // Frase repetida: "Caixa D'Água Caixa D'Água", "Abraçadeira-abracadeira", "Polvilho azedo polvilho azedo"
  const parts = text.split(/[\s-]+/).filter(Boolean);
  const half = parts.length / 2;
  if (Number.isInteger(half) && half >= 1 && fold(parts.slice(0, half).join(" ")) === fold(parts.slice(half).join(" "))) tokens = parts.slice(0, half);
  while (tokens.length > 1 && ATTRIBUTE_LABELS.has(fold(tokens[tokens.length - 1]).replace(/[^a-z]/g, ""))) tokens.pop();
  const cleaned = tokens.join(" ").replace(/[.*,;:\s]+$/g, "").trim();
  if (!cleaned) return raw.slice(0, 90);
  const shown = cleaned.slice(0, 90);
  return shown === shown.toUpperCase() ? shown.charAt(0) + shown.slice(1).toLowerCase() : shown;
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
    if (rest.length) { tokens = [...tokens, ...rest]; usedPhrase = description.replace(/[:;,]/g, " ").split(/\s+/).slice(0, 5).join(" "); }
  }
  const unique = [...new Set(tokens.filter((word) => !GENERIC.has(word) || tokens.length <= 2))].slice(0, 6);
  if (unique.length === 0 || unique.every((word) => GENERIC.has(word))) return null;
  return { key: [...unique].sort().join(" "), name: displayName(usedPhrase) };
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
  ["Máquinas e equipamentos", /\b(gerador|grupo gerador)\b/],
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
  ["Elétrica e iluminação", /\b(lampada|luminaria|led|reator|fio|cabo eletrico|cabo pp|cabo flexivel|cabo de cobre|cabo isolado|cabo de energia|disjuntor|tomada|interruptor|quadro de distribuicao|transformador|bateria|pilha|poste|refletor|fusivel|conector|eletroduto|cabo flexivel|soquete)\b/],
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
  // --- Regras de reforço: produtos comuns que as regras acima não reconheciam (ordem: do mais específico ao mais geral)
  ["Informática e tecnologia", /\b(fone de ouvido|fone ouvido|fone|headset|caixa de som|caixa som|microfone|pendrive|hd externo|carregador|cabo usb|cabo hdmi|cabo de rede|cabo rede|cabo audio|suporte monitor|leitor de codigo|etiqueta termica|tinta para impressora)\b/],
  ["Saúde e hospitalar", /\b(bisturi|sutura|atadura|algodao|compressa|canula|traqueostomia|eletrodo|pinca|haloperidol|clonazepam|ipratropio|sulfato ferroso|agulha|lamina|fio dental|escova dental|dental|cloridrato|sulfato|sodico|acido folico|vitamina|xarope|pomada|colirio|supositorio|ampola|cateter|equipo|escalpe|esparadrapo|micropore|gesso ortopedico|tala|colar cervical|oxigenio|nebulizador|aspirador|bolsa coletora|coletor de residuo|servico de saude|consulta medica|medico|enfermagem|odontologico|clinico|hemograma|ultrassonografia|radiografia|tomografia|mg|comprimido|capsula)\b/],
  ["Alimentos e bebidas", /\b(batata|banana|laranja|couve|milho|tomate|polvilho|amido|aveia|fuba|cacau|coco|adocante|oleo vegetal|comestivel|legume|cenoura|cebola|alho|mandioca|macaxeira|abobora|repolho|alface|mamao|melancia|limao|abacaxi|uva|maca|pera|abobrinha|beterraba|pimentao|chuchu|inhame|quiabo|vagem|ervilha|lentilha|grao de bico|sardinha|atum|salsicha|linguica|presunto|mortadela|margarina|manteiga|creme de leite|leite condensado|gelatina|pudim|achocolatado|chocolate|doce|geleia|mel|vinagre|fermento|gordura|peixe|camarao|tilapia|farinha|canjica|pipoca|sobremesa|iogurte|requeijao|fecula|conserva|extrato de tomate|massa de tomate|flocos)\b/],
  ["Limpeza e higiene", /\b(pano de limpeza|pano de chao|pano limpeza|saco para lixo|saco de lixo|saco lixo|cesto lixo|lixo|lustra moveis|escova|limpa aluminio|hipoclorito|peroxido|agua oxigenada|palha de aco|desengordurante|limpa vidro|alvejante|cera liquida|lustrador|removedor|lixeira|coletor de lixo|dispenser|toalha de papel)\b/],
  ["Hidráulica e saneamento", /\b(boia|caixa d agua|caixa dagua|bomba|hidrante|ralo|sifao|flange|niple|reducao|registro|torneira|chuveiro|vaso|mangueira de jardim|fita veda rosca|veda rosca)\b/],
  ["Construção e obras", /\b(anel de vedacao|anel vedacao|colher de pedreiro|caixa de passagem|rolo de pintura|rolo pintura|trincha|massa acrilica|rejunte|silicone|espuma expansiva|vedacao|telha|manta|argamassa|areia|brita|gesso|laje|bloco|viga|cimento)\b/],
  ["Ferramentas e ferragens", /\b(disco de corte|disco corte|disco de lixa|abracadeira|alicate|chave|martelo|serra|furadeira|esmeril|lima|broca|trena|esquadro|grampo|rebite|presilha|pino|cantoneira)\b/],
  ["Veículos, peças e combustíveis", /\b(pneu|camara de ar|bateria automotiva|filtro de oleo|filtro de ar|vela|correia dentada|lona de freio|pastilha de freio|disco de freio|aditivo|arla|graxa)\b/],
  ["Vestuário e têxtil", /\b(capa de chuva|capa chuva|touca|prope|macacao|cinta elastica|cinta|calcado|chapeu|bone)\b/],
  ["Embalagens", /\b(caixa plastica|caixa organizadora|caixa termica|saco plastico|sacola|filme pvc|papel aluminio|pote|tampa|garrafa pet)\b/],
  ["Mobiliário e utensílios", /\b(cafeteira|garrafa termica|jarra|copo|prato|talher|panela|escorredor|forma|assadeira|colher|garfo|faca|caneca|bandeja|tabua|ralador|abridor|cesto|balde|bacia|vassoura|carrinho)\b/],
  ["Escritório e papelaria", /\b(giz|corretivo|pincel quadro branco|encadernacao|fita crepe|massa modelar|pincel|cartolina|papel crepom|eva|tnt|grampeador|perfurador|elastico|barbante|fita dupla face|fita adesiva|durex|quadro branco|apagador|livro ata|livro de ponto)\b/],
  ["Educação, esporte e lazer", /\b(brinquedo|jogo|bola|rede de volei|colchonete|apito|trofeu|medalha|material esportivo|instrumento)\b/],
  ["Máquinas e equipamentos", /\b(solda|motobomba|bebedouro industrial)\b/],
  ["Elétrica e iluminação", /\b(extensao eletrica|bateria|pilha|refletor|interruptor|tomada|plug|filtro de linha|estabilizador|eletroduto|conduite|canaleta|cabo|fio)\b/],
  // --- 2º lote: cauda longa (remédios, odontologia, laboratório, peças, limpeza)
  ["Saúde e hospitalar", /\b(\d+([.,]\d+)?\s?(mg|mcg|ui)\b|dosagem|dentina|odontologic|dentari|resina composta|anticorpo|hormonio|lidocaina|gabapentina|desmopressina|levonorgestrel|acetato|dieta|enteral|repelente|microbrush|espatula|seladora|revelador|bolsa de acondicionamento|especime|veterinario|vacina|soro|anestesico|antibiotico|analgesico|anti inflamatorio|insulina|glicemia|pesquisa de|dosagem de|exame|sutura)\b/],
  ["Laboratório e química", /\b(aspecto fisico|formula quimica|cloreto|oxido|corante|eosina|azul de metileno|reagente|solucao tampao|solvente|acido|hidroxido|carbonato|nitrato|fosfato|sulfato de)\b/],
  ["Elétrica e iluminação", /\b(rele|estator|terminal|soquete|suporte porcelana|fotoeletrico|disjuntor|contator|capacitor|resistencia|transformador|bateria|motor eletrico|servico eletrico)\b/],
  ["Veículos, peças e combustíveis", /\b(sapata de freio|sapata|cabecote|embreagem|retentor|rolamento|mancal|cruzeta|bomba de oleo|bico injetor|alternador|motor de partida|silencioso|parachoque|amortecedor)\b/],
  ["Construção e obras", /\b(chapa policarbonato|policarbonato|massa plastica|massa plasticar|convertedor de ferrugem|vedador|vedacao|calha|rufo|forro|esquadria|portao|grade|cerca|tela|arame|massa corrida|selador|verniz|thinner|aguarras)\b/],
  ["Limpeza e higiene", /\b(refil|mop|desincrustante|limpa evaporador|limpa|desinfetante|inseticida|raticida|repelente|sanitizante|odorizador|aromatizante|detergente|sabao)\b/],
  ["Mobiliário e utensílios", /\b(sanduicheira|liquidificador|batedeira|fritadeira|chaleira|ferro de passar|ventilador|circulador|mesa|cadeira|banco|prateleira|armario|estante)\b/],
  ["Eventos, comunicação e publicidade", /\b(flyer|banner|folder|panfleto|cartaz|adesivo|placa de sinalizacao|faixa|impresso grafico|cartao de visita)\b/],
  ["Serviços gerais", /\b(motorista|jardineiro|porteiro|vigia|recepcionista|auxiliar|servente|zelador|copeiro|cozinheiro|operador|tecnico|analista|assistente|secretaria|agente)\b/],
  ["Educação, esporte e lazer", /\b(carbono|papel carbono|caderno|lapiseira|mochila|estojo|compasso|transferidor)\b/],
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
  const folded = fold(headText);
  const text = ` ${folded} ${words(folded).map(singular).join(" ")} `;
  for (const [niche, pattern] of TEXT_RULES) if (allowed(niche) && pattern.test(text)) return niche;
  return kind === "servico" ? "Serviços gerais" : "Outros";
}
