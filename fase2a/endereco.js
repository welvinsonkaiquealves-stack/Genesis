/* ============================================================================
   GÊNESIS v2 — FASE 2A · CONTRATO DE ENDEREÇO
   genesis/fase2a/endereco.js

   PAPEL DESTE ARQUIVO
   -------------------
   Descrever ONDE uma coisa está, usando EXATAMENTE o que o motor já possui.
   Nada mais. Este arquivo não cria realidade nenhuma.

   FONTE DE VERDADE (não alterada por este arquivo — md5 conferido no relatório)
   ----------------------------------------------------------------------------
     genesis/v2/core/world.js   — autoridade da simulação (intocado)
     genesis/fase1/terra.js     — matemática lat/lon ↔ XYZ (REUSADA, não copiada)

   Este módulo NUNCA escreve na simulação e NUNCA implementa uma segunda
   matemática de coordenadas geográficas. Toda conversão lat/lon ↔ XYZ passa
   por T.dirDeLatLon / T.latLonDeDir / T.posicaoDaRegiao, vindas de
   genesis/fase1/terra.js. Se um dia a Fase 1 mudar, isto muda junto — de
   propósito. Uma terceira implementação seria a terceira fonte de verdade.

   ============================================================================
   DOUTRINA — TRÊS COISAS QUE PARECEM A MESMA E NÃO SÃO
   ============================================================================

     IDENTIDADE CANÔNICA   ≠   ÍNDICE DE COLEÇÃO   ≠   RÓTULO DE APRESENTAÇÃO

     1. IDENTIDADE CANÔNICA
        Um nome que o MUNDO atribui à coisa e mantém. É estável por definição.
        O motor atual NÃO POSSUI isso para regiões.
        Portanto este contrato NÃO TEM identidade canônica. Ausente. (-)

     2. ÍNDICE DE COLEÇÃO   →  campo `regionIndex`
        A posição ATUAL dentro de m.planeta.regioes[].
            "neste estado da coleção, esta região ocupa o índice 0"
        NÃO significa
            "o mundo atribuiu permanentemente o ID 0 a esta região".
        É DERIVADO: reordenar a coleção muda o valor. NÃO é chave estável.
        NÃO é identidade persistente. NÃO é autoridade do world.js.

     3. RÓTULO DE APRESENTAÇÃO
        Texto para ler na tela (nome da região, nome do planeta).
        Não endereça nada, não identifica nada, não ordena nada.

   CONSEQUÊNCIA PRÁTICA — impede o erro futuro
   -------------------------------------------
     · `regionIndex` NÃO pode ser usado como chave de persistência.
     · `identidade.autoridade` é SEMPRE `false` nesta fase.
     · NENHUM id persistente artificial foi inventado nesta fase (de propósito).
     · Se uma fase futura introduzir identidade canônica, ela SUBSTITUI o
       rótulo derivado. O campo `identidade` é um objeto DESCRITOR, e todos os
       consumidores leem `identidade` em vez de assumir um escalar — por isso a
       troca não exige redesenho da arquitetura espacial.

   ============================================================================
   ESTADO REAL DO MOTOR (medido, não presumido)
   ============================================================================

     world.js:51-55   planeta = { nome, raioKm, regioes: [], regiaoAtiva: 0 }
                      → NÃO existe id de planeta. O rótulo é `nome`.
     world.js:62-75   gerarRegiao():  `const id = 0;`  → HARDCODED.
                      reg = { id, nome, idx: 0, lat: <string>, lon: <string>,
                              largura: 160, altura: 160, alturaTerreno: f32[] }
                      → `id` é sempre 0; não discrimina região nenhuma.
                      → `lat`/`lon` são STRING com 2 decimais (`.toFixed(2)`).
     world.js:275     regiaoAtiva = (m) => m.planeta.regioes[m.planeta.regiaoAtiva]
                      → o acesso real do motor é POR ÍNDICE.
     world.js:276     idx = (x, y) => (y|0)*160 + (x|0)
     world.js:278     alturaEm(m, x, y) → -3 se fora de [0,160)²
                      → ATENÇÃO: usa regiaoAtiva(m). Só é válido para a região
                        ativa. Ver LIMITAÇÃO DECLARADA abaixo.
     world.js:2424    `id: reg.id` aparece SÓ na serialização. `idx` não é
                      serializado. Nada reconstrói identidade de região.
     grep confirmado   "subregi|subRegi|sub_regi" em genesis/ → 0 ocorrências.
                      → sub-região NÃO EXISTE no motor. Ver MOTIVO_SUBREGIAO.

   LIMITAÇÃO DECLARADA (não é bug, é o estado do motor)
   ----------------------------------------------------
     `W.alturaEm` resolve a região ATIVA. Para uma região que não seja a ativa,
     o motor não oferece leitura pública de altura. Este contrato portanto lê
     `reg.alturaTerreno[idx]` DIRETO da região endereçada — que é exatamente o
     que alturaEm faz por dentro — e TESTA a equivalência contra W.alturaEm no
     caso da região ativa (teste T2b). Para regiões não-ativas, a leitura
     direta é a única existente e está marcada como tal.

   LIMITAÇÃO DECLARADA 2 — fronteira entre regiões e múltiplas regiões
   ------------------------------------------------------------------
     O motor materializa UMA região por vez (regiaoAtiva: 0). Testes de
     fronteira ENTRE regiões e de coexistência de N regiões NÃO SÃO
     EXEQUÍVEIS contra o motor real nesta fase. Estão marcados N/A (teste T12)
     com o motivo. O FORMATO do endereço, porém, suporta N regiões e isso é
     verificado em ambiente headless com fixture (teste T13) — deixando claro
     que aquilo testa o FORMATO, não o motor.

   O QUE ESTE ARQUIVO NÃO FAZ
   --------------------------
     Sem chunks. Sem streaming. Sem LOD. Sem terreno. Sem relevo. Sem FBM.
     Sem materiais. Sem vegetação. Sem animais. Sem biologia. Sem física.
     Sem NPC. Sem cérebro. Sem aprendizagem. Sem cultura. Sem linguagem.
     Sem sociedade. Sem atmosfera. Sem estrelas. Sem OrbitControls. Sem sprite.
     Sem textura. Sem frame local de região. Sem hierarquia planeta→região→local.

   DUAS CAMADAS (mesmo padrão que funcionou na Fase 1)
   ---------------------------------------------------
     Camada PURA        — estrutura do endereço, células, serialização, testes.
                          Roda em Node sem DOM e sem THREE.
     Camada GEOGRÁFICA  — ancoragem no globo. Recebe T (terra.js) por PARÂMETRO.
                          Nunca chama T implicitamente, nunca duplica a conta.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GenesisF2A = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* Referência ao objeto global.
     NÃO usar o parâmetro `root` do wrapper UMD aqui dentro: a fábrica é
     declarada no escopo externo e NÃO fecha sobre esse parâmetro. Usar `root`
     aqui dentro dá ReferenceError em Node e no browser. (Bug real da Fase 1.) */
  var GLOBAL = (typeof globalThis !== 'undefined') ? globalThis
    : (typeof window !== 'undefined') ? window
      : (typeof self !== 'undefined') ? self : {};

  /* ==========================================================================
     0. CONSTANTES
     ========================================================================== */
  var VERSAO = 'fase2a-1.2';
  var CONTRATO = 'genesis.endereco/2a.3';
  var CONTRATO_ANTERIOR = 'genesis.endereco/2a.2';
  var PREFIXO = 'A2A:2';
  var PREFIXO_LOGICO = 'G2A';

  var ESPACO_LOCAL = 'tile_da_regiao';   /* um único espaço local. Não há outro. */
  var UNIDADE_LOCAL = 'metro';

  /* Origem do ESPAÇO da região: canto (0,0), constante. Não confundir com o campo
     `origemLocal` do endereço, que é a origem DAQUELE tile. */
  var ESPACO_LOCAL_ORIGEM = { x: 0, y: 0, zeroZ: 'NIVEL_MAR = 0 (world.js:35)' };

  var TAM_PADRAO = 160;      /* world.js:12 */
  var TILE_METROS = 1;       /* world.js:13 */
  var ALTURA_FORA = -3;      /* world.js:278  sentinela de alturaEm para fora */
  var LATLON_DECIMAIS = 2;   /* world.js:65   .toFixed(2) */

  var SEP = '|';
  var SEPKV = ';';

  function agora() {
    return (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
  }

  function eNumero(v) { return typeof v === 'number' && isFinite(v); }

  /* ==========================================================================
     1. DESCRITORES — a diferença identidade/índice/rótulo, em forma de dado
     ========================================================================== */

  /* Identidade canônica de PLANETA: o motor não tem. Declarado, não inventado. */
  var IDENTIDADE_PLANETA = {
    tipo: 'ausente',
    fonte: 'm.planeta',
    camposDisponiveis: ['nome', 'raioKm', 'regioes', 'regiaoAtiva'],
    estabilidade: 'nao_garantida',
    autoridade: false,
    motivo: 'world.js nao define id de planeta. m.planeta e { nome, raioKm, ' +
      'regioes, regiaoAtiva } — o rotulo e `nome`, que e texto de apresentacao ' +
      'e pode ser trocado, logo nao e identidade.'
  };

  /* Identidade canônica de REGIÃO: o motor não tem. Declarado, não inventado.
     `regionIndex` é índice de coleção; `reg.id` é hardcoded 0 e não discrimina. */
  function identidadeDeIndice(regionIndex, totalRegioes) {
    return {
      tipo: (regionIndex >= 0) ? 'derivada' : 'desconhecida',
      fonte: 'm.planeta.regioes[regionIndex]',
      campoDerivado: 'regionIndex',
      valorNoEstadoAtual: regionIndex,
      totalNoEstadoAtual: totalRegioes,
      estabilidade: 'nao_garantida',
      autoridade: false,
      persistencia: 'proibida',
      motivo: (regionIndex >= 0)
        ? 'Indice de colecao, nao identidade. Reordenar m.planeta.regioes muda ' +
          'este valor. O motor nao possui identidade persistente de regiao: ' +
          'reg.id e `const id = 0` hardcoded em world.js:62-63 e nao discrimina.'
        : 'O objeto de regiao informado nao pertence a m.planeta.regioes. Nao ' +
          'existe indice de colecao para ele — logo nao ha nem rotulo derivado. ' +
          'Ausencia declarada em vez de valor inventado.'
    };
  }

  /* Motivo da ausência de sub-região. Ausência REAL, não omissão. */
  var MOTIVO_SUBREGIAO =
    'world.js nao possui conceito de sub-regiao: grep "subregi|subRegi|sub_regi" ' +
    'em todo genesis/ retorna 0 ocorrencias, e nenhum campo do motor (reg, ' +
    'planeta, entidades) expressa esse nivel. O campo existe aqui apenas por ' +
    'completude estrutural do formato e permanece null. Nao foi sintetizada ' +
    'uma sub-regiao trivial para "preencher" o contrato: isso fabricaria dado, ' +
    'criaria dois formatos concorrentes e um id fantasma em save.';

  /* As QUATRO informações que faltam para existir georreferência de tile.
     Nenhuma delas foi inventada. Nenhuma delas é derivável do que o motor tem. */
  var LACUNAS_GEO = [
    { campo: 'precisao', estado: 'insuficiente',
      motivo: 'reg.lat/reg.lon sao STRING com 2 casas (world.js:85, .toFixed(2)). ' +
        'Passo 0,01 grau = 1111,95 m; erro maximo +-555,97 m = 3,47 larguras de regiao.' },
    { campo: 'convencaoDeAncora', estado: 'ausente',
      motivo: 'world.js nao declara QUE PONTO da regiao o par lat/lon representa ' +
        '(centro, canto 0,0, centroide). Sem isso restam +-80 m de ambiguidade mesmo ' +
        'com precisao infinita.' },
    { campo: 'orientacao', estado: 'ausente',
      motivo: 'nao existe azimute, rumo ou declaracao de que +y da grade aponta para o ' +
        'norte geografico. Sem orientacao, deslocamento em tiles NAO vira deslocamento ' +
        'em lat/lon com precisao alguma. Esta e a lacuna que casas decimais nao resolvem.' },
    { campo: 'raioDeReferencia', estado: 'nao_declarado',
      motivo: 'o render usa R=1 (esfera unitaria) e terra.js:64 declara raioKm como rotulo ' +
        'que "NAO entra em nenhum calculo". Converter metro em angulo exige fixar qual raio ' +
        'e o de referencia do sistema.' }
  ];

  var MOTIVO_GEO_INVALIDA =
    'A georreferencia desta fase existe SOMENTE no nivel REGIAO e mesmo ali e aproximada. ' +
    'NAO existe transformacao tile -> lat/lon e nenhuma funcao deste modulo a oferece: ' +
    'geoDoTile() nao existe, nao foi esquecida e nao deve ser criada. Faltam quatro dados ' +
    'na autoridade do mundo — ver LACUNAS_GEO.';

  var NOTA_NAO_IDENTIDADE =
    'Nenhum campo deste endereco e identidade canonica. `regionIndex` e indice ' +
    'de colecao (derivado, instavel). `rotuloRegiao` e `rotuloPlaneta` sao ' +
    'texto de apresentacao. `reg.id` (campo idInterno) e hardcoded 0 no motor ' +
    'e nao discrimina regiao. Nada aqui pode ser usado como chave persistente.';

  /* Esquema declarado — cada campo com sua NATUREZA. É a forma legível da doutrina. */
  var ESQUEMA = {
    contrato: { natureza: 'meta', tipo: 'string' },
    versao: { natureza: 'meta', tipo: 'string' },
    fora: { natureza: 'derivado', tipo: 'boolean', nota: 'true se o tile cai fora de [0,tam)' },
    mundo: {
      natureza: 'canonico',
      tipo: 'objeto',
      campos: {
        seed: {
          natureza: 'canonico',
          nota: 'm.seed. UNICA raiz estavel e persistida que o motor oferece (seriar() grava seed). ' +
            'NAO e identidade de regiao: identifica o MUNDO, e so por consequencia a regiao ' +
            'enquanto existir exatamente uma.'
        }
      }
    },
    planeta: {
      natureza: 'rotulo',
      tipo: 'objeto',
      campos: {
        rotulo: { natureza: 'rotulo', nota: 'texto de apresentacao (m.planeta.nome)' },
        raioKm: { natureza: 'derivado', nota: 'm.planeta.raioKm' },
        identidade: { natureza: 'descritor', nota: 'declara que a identidade esta AUSENTE' }
      }
    },
    regiao: {
      natureza: 'indice+rotulo',
      tipo: 'objeto',
      campos: {
        regionIndex: { natureza: 'indice', nota: 'INDICE DE COLECAO. derivado. nao estavel. nao e identidade.' },
        totalRegioes: { natureza: 'indice', nota: 'tamanho atual da colecao' },
        rotulo: { natureza: 'rotulo', nota: 'reg.nome — texto de apresentacao' },
        idx: { natureza: 'indice', nota: 'campo reg.idx do motor — hoje 0 hardcoded, igual ao anterior e igual para toda regiao' },
        idInterno: { natureza: 'indice', nota: 'campo reg.id do motor — `const id = 0` hardcoded. NAO discrimina. NAO e identidade.' },
        larguraTiles: { natureza: 'derivado' },
        alturaTiles: { natureza: 'derivado' },
        tam: { natureza: 'derivado' },
        lat: { natureza: 'derivado', nota: 'reg.lat — STRING com 2 decimais em world.js. Ver precisaoDeAncoragem().' },
        lon: { natureza: 'derivado' },
        identidade: { natureza: 'descritor', nota: 'declara a natureza derivada do indice' }
      }
    },
    local: {
      natureza: 'espaco',
      nota: 'UNICO espaco local: o espaco de tile da regiao. x,y continuos em tiles (1 tile = 1 m). ' +
        'NAO carrega z: altura e TERRENO, nao endereco. Ver alturaNoEndereco().',
      tipo: 'objeto'
    },
    tile: {
      natureza: 'canonico',
      nota: 'Posicao DISCRETA do tile. indexLinear = (y|0)*tam + (x|0), identico a world.js:276 — ' +
        'e o indice real com que o motor endereca alturaTerreno/tipo/umidade/fertilidade/temperatura.',
      tipo: 'objeto|null'
    },
    origemLocal: {
      natureza: 'derivado',
      nota: 'Origem espacial DESTE tile no espaco local da regiao, em metros: {x: tileX*TILE, y: tileY*TILE}. ' +
        'E o referencial em que TERRENO e OBJETOS serao expressos. A origem da REGIAO e (0,0) e e constante ' +
        'do espaco, declarada em ESPACO_LOCAL_ORIGEM.',
      tipo: 'objeto|null'
    },
    deslocamento: {
      natureza: 'derivado',
      nota: 'Posicao CONTINUA dentro do tile: {x: local.x - tile.x, y: local.y - tile.y}, em [0,1). ' +
        'tile + deslocamento reconstroi a posicao float exata de uma entidade.',
      tipo: 'objeto|null'
    },
    celula: {
      natureza: 'alias_depreciado',
      nota: 'MESMA REFERENCIA de objeto que `tile`, mantido so para compatibilidade. Preferir `tile`: ' +
        'world.js ja usa CELULA=8 para a celula de 8 m da grade espacial de consulta, que e outra coisa.',
      tipo: 'objeto|null'
    },
    geo: {
      natureza: 'derivado',
      nota: 'Ancoragem NO NIVEL DA REGIAO, via T.dirDeLatLon. NUNCA no nivel do tile. ' +
        'geo.valido e SEMPRE false nesta fase: faltam precisao, convencao de ancora, orientacao ' +
        'da grade e raio de referencia. NAO existe geoDoTile() e nao deve existir.',
      tipo: 'objeto|null'
    },
    subregiao: {
      natureza: 'ausente',
      tipo: 'null',
      motivo: MOTIVO_SUBREGIAO
    }
  };

  /* ==========================================================================
     2. CAMADA PURA — região, célula e o espaço de tile
     ========================================================================== */

  function tamDe(reg) {
    return (reg && eNumero(reg.largura)) ? reg.largura : TAM_PADRAO;
  }

  function tileValido(x, y, tam) {
    tam = eNumero(tam) ? tam : TAM_PADRAO;
    return eNumero(x) && eNumero(y) && x >= 0 && y >= 0 && x < tam && y < tam;
  }

  /* Idêntico a world.js:276 — mesmo truncamento por |0. Não é uma reimplementação
     "equivalente": é a mesma expressão, para que o índice seja comparável.
     FUNÇÃO CRUA, SEM VALIDAÇÃO, DE PROPÓSITO: ela existe para reproduzir o motor
     bit a bit, inclusive quando o motor receberia lixo. Para uso no contrato,
     use indiceDeTile(), que valida. Não altere esta. */
  function indiceLinear(x, y, tam) {
    tam = eNumero(tam) ? tam : TAM_PADRAO;
    return (y | 0) * tam + (x | 0);
  }

  /* Versão VALIDADA de indiceLinear. Devolve null (e não um número errado) para
     qualquer entrada fora da grade. É esta que o contrato usa. */
  function indiceDeTile(x, y, tam) {
    tam = eNumero(tam) ? tam : TAM_PADRAO;
    if (!tileValido(x, y, tam)) return null;
    return indiceLinear(x, y, tam);
  }

  /* Inversa EXATA de indiceDeTile. i inteiro em [0, tam*tam).
     x = i % tam ; y = floor(i / tam). Fora disso: null, nunca um tile inventado. */
  function tileDeIndice(i, tam) {
    tam = eNumero(tam) ? tam : TAM_PADRAO;
    if (!eNumero(i)) return null;
    if (i !== Math.floor(i)) return null;          /* índice fracionário não é índice */
    if (i < 0 || i >= tam * tam) return null;
    var x = i % tam;
    var y = Math.floor(i / tam);
    return { x: x, y: y, indexLinear: i, tam: tam };
  }

  /* ---------------------------------------------------------------------------
     PICKING PURO — pixel da grade → tile. Sem DOM, sem câmera, sem zoom, sem
     rotação. Recebe o retângulo REAL medido pelo chamador.

     CONVENÇÃO DO PIXEL (é isto que corrige o erro sistemático de ±1 tile):
     MouseEvent.clientX/clientY chegam TRUNCADOS para inteiro. Um valor inteiro p
     significa "o ponteiro estava em algum lugar de [p, p+1)", não "estava
     exatamente em p". Usar p direto enviesa o resultado meio pixel para a
     esquerda, e com 1,05 px por tile isso derruba o tile em um, sistematicamente.
     Regra: coordenada INTEIRA é tratada como índice de pixel e recebe +0,5
     (centro do pixel); coordenada FRACIONÁRIA é tratada como posição exata e é
     usada como veio. Override explícito por opcoes.centroDoPixel.
     --------------------------------------------------------------------------- */
  function centrarPixel(v, modo) {
    if (modo === true) return v + 0.5;
    if (modo === false) return v;
    return (v === Math.floor(v)) ? v + 0.5 : v;    /* modo automático */
  }

  function tileDePixel(px, py, rect, tam, opcoes) {
    tam = eNumero(tam) ? tam : TAM_PADRAO;
    opcoes = opcoes || {};
    if (!rect || !eNumero(rect.width) || !eNumero(rect.height)) return null;
    if (rect.width <= 0 || rect.height <= 0) return null;
    if (!eNumero(px) || !eNumero(py)) return null;
    var left = eNumero(rect.left) ? rect.left : 0;
    var top = eNumero(rect.top) ? rect.top : 0;
    var cx = centrarPixel(px, opcoes.centroDoPixel);
    var cy = centrarPixel(py, opcoes.centroDoPixel);
    var fx = (cx - left) / rect.width;
    var fy = (cy - top) / rect.height;
    if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) return null;   /* clique fora da grade */
    var x = Math.floor(fx * tam);
    var y = Math.floor(fy * tam);
    if (x < 0) x = 0; if (x > tam - 1) x = tam - 1;            /* borda por arredondamento */
    if (y < 0) y = 0; if (y > tam - 1) y = tam - 1;
    return { x: x, y: y, indexLinear: indiceLinear(x, y, tam), tam: tam, fx: fx, fy: fy };
  }

  /* Pixel do CENTRO geométrico de um tile — inversa de tileDePixel para teste
     e para desenho. Devolve coordenada fracionária (posição exata, não índice). */
  function pixelDoTile(x, y, rect, tam) {
    tam = eNumero(tam) ? tam : TAM_PADRAO;
    if (!rect || !eNumero(rect.width) || !eNumero(rect.height)) return null;
    if (!tileValido(x, y, tam)) return null;
    var left = eNumero(rect.left) ? rect.left : 0;
    var top = eNumero(rect.top) ? rect.top : 0;
    return {
      px: left + rect.width * ((x + 0.5) / tam),
      py: top + rect.height * ((y + 0.5) / tam)
    };
  }

  /* Rótulo derivado do planeta. Texto, não identidade. */
  function rotuloDoPlaneta(m) {
    return (m && m.planeta && typeof m.planeta.nome === 'string')
      ? m.planeta.nome : null;
  }

  function listaDeRegioes(m) {
    return (m && m.planeta && Array.isArray(m.planeta.regioes))
      ? m.planeta.regioes : [];
  }

  function totalDeRegioes(m) { return listaDeRegioes(m).length; }

  /* ÍNDICE DE COLEÇÃO, obtido por identidade de objeto (indexOf), não por
     confiança em quem chamou. Devolve -1 quando a região não pertence à
     coleção — que é a resposta honesta: não existe índice para ela. */
  function indiceDeRegiao(m, reg) {
    var lista = listaDeRegioes(m);
    for (var i = 0; i < lista.length; i++) {
      if (lista[i] === reg) return i;
    }
    return -1;
  }

  /* Acesso por índice, espelhando EXATAMENTE a semântica de world.js:275. */
  function regiaoPorIndice(m, i) {
    var lista = listaDeRegioes(m);
    if (!eNumero(i)) return null;
    if (i < 0 || i >= lista.length) return null;
    return lista[i];
  }

  /* Catálogo: enumera a coleção SEM promover o índice a identidade.
     Cada item carrega o próprio descritor de identidade. */
  function catalogoDeRegioes(m) {
    var lista = listaDeRegioes(m);
    var total = lista.length;
    var out = [];
    for (var i = 0; i < total; i++) {
      var reg = lista[i];
      out.push({
        regionIndex: i,
        totalRegioes: total,
        rotulo: (reg && reg.nome) ? reg.nome : null,
        idx: (reg && eNumero(reg.idx)) ? reg.idx : null,
        idInterno: (reg && eNumero(reg.id)) ? reg.id : null,
        lat: lerLatLon(reg, 'lat'),
        lon: lerLatLon(reg, 'lon'),
        identidade: identidadeDeIndice(i, total)
      });
    }
    return out;
  }

  /* world.js guarda lat/lon como STRING (toFixed(2)). Nenhum === ingênuo. */
  function lerLatLon(reg, campo) {
    if (!reg || reg[campo] === undefined || reg[campo] === null) return null;
    var v = (typeof reg[campo] === 'number') ? reg[campo] : parseFloat(reg[campo]);
    return isFinite(v) ? v : null;
  }

  /* Base do endereço de uma região — o "onde" de nível regional. */
  function enderecoDaRegiao(m, reg) {
    var total = totalDeRegioes(m);
    var i = indiceDeRegiao(m, reg);
    var tam = tamDe(reg);
    return {
      contrato: CONTRATO,
      versao: VERSAO,
      fora: false,

      /* raiz estável: a seed. Persistida por world.js:seriar(). Não é identidade
         de região; é identidade do MUNDO, e só alcança a região por consequência
         enquanto existir exatamente uma. Ver chaveLogica(). */
      mundo: { seed: (m && eNumero(m.seed)) ? m.seed : null },

      planeta: {
        rotulo: rotuloDoPlaneta(m),
        raioKm: (m && m.planeta && eNumero(m.planeta.raioKm)) ? m.planeta.raioKm : null,
        identidade: IDENTIDADE_PLANETA
      },

      regiao: {
        regionIndex: i,
        totalRegioes: total,
        rotulo: (reg && reg.nome) ? reg.nome : null,
        idx: (reg && eNumero(reg.idx)) ? reg.idx : null,
        idInterno: (reg && eNumero(reg.id)) ? reg.id : null,
        larguraTiles: (reg && eNumero(reg.largura)) ? reg.largura : null,
        alturaTiles: (reg && eNumero(reg.altura)) ? reg.altura : null,
        tam: tam,
        lat: lerLatLon(reg, 'lat'),
        lon: lerLatLon(reg, 'lon'),
        identidade: identidadeDeIndice(i, total)
      },

      /* o endereço-base de uma região é o seu canto (0,0).
         SEM z: altura é TERRENO, não endereço. Ver alturaNoEndereco(). */
      local: {
        x: 0, y: 0,
        espaco: ESPACO_LOCAL,
        unidade: UNIDADE_LOCAL,
        origemDoEspaco: ESPACO_LOCAL_ORIGEM
      },
      tile: null,
      origemLocal: null,
      deslocamento: null,
      celula: null,          /* alias depreciado de `tile`, mesma referência */
      geo: null,

      subregiao: null,
      notaIdentidade: NOTA_NAO_IDENTIDADE,
      motivoSubregiao: MOTIVO_SUBREGIAO
    };
  }

  /* Altura do terreno lida DIRETO da região endereçada.
     Para a região ativa isto é idêntico a W.alturaEm(m,x,y) — e é TESTADO
     contra ela em T2b. Para região não-ativa é a única leitura existente,
     porque W.alturaEm resolve sempre a região ATIVA (world.js:278-281). */
  function alturaDoTerreno(reg, x, y) {
    if (!reg || !reg.alturaTerreno) return null;
    var tam = tamDe(reg);
    if (!tileValido(x, y, tam)) return null;
    var v = reg.alturaTerreno[indiceLinear(x, y, tam)];
    return (typeof v === 'number' && isFinite(v)) ? v : null;
  }

  /* Endereço de um TILE: o caso canônico. xLocal/yLocal em tiles (podem ser
     fracionários — o motor guarda posições contínuas).
     NÃO carrega altura: z é terreno, e terreno muda sem que o lugar mude. */
  function enderecoDeTile(m, reg, x, y) {
    var a = enderecoDaRegiao(m, reg);
    var tam = a.regiao.tam;
    var dentro = tileValido(x, y, tam);

    a.local.x = eNumero(x) ? x : null;
    a.local.y = eNumero(y) ? y : null;

    if (dentro) {
      var tx = x | 0, ty = y | 0;
      a.tile = {
        x: tx,
        y: ty,
        indexLinear: indiceDeTile(x, y, tam),
        tam: tam,
        dentro: true,
        /* nomes antigos, mesma informação, para não quebrar consumidores */
        tileX: tx,
        tileY: ty,
        indiceLinear: indiceDeTile(x, y, tam)
      };
      a.celula = a.tile;                       /* MESMA referência, não uma cópia */
      a.origemLocal = {
        x: tx * TILE_METROS,
        y: ty * TILE_METROS,
        unidade: UNIDADE_LOCAL,
        espaco: ESPACO_LOCAL,
        tile: TILE_METROS
      };
      a.deslocamento = { x: x - tx, y: y - ty, unidade: UNIDADE_LOCAL };
      a.fora = false;
    } else {
      /* Fora da região: nada é inventado, nem tile, nem origem, nem altura. */
      a.tile = null;
      a.celula = null;
      a.origemLocal = null;
      a.deslocamento = null;
      a.fora = true;
    }
    return a;
  }

  /* LEITURA DE TERRENO, explicitamente separada do endereço.
     Isto NÃO é componente de identidade e NÃO entra em nenhuma chave: world.js
     serializa alturaTerreno com Math.round(v*100)/100 (world.js:2425), logo o
     valor muda em um save/load. Um endereço que carregasse z deixaria de ser
     endereço e viraria leitura de estado. */
  function alturaNoEndereco(reg, a) {
    var fora = { z: null, natureza: 'leitura_de_terreno', dentro: false,
      fonte: 'reg.alturaTerreno[indexLinear]',
      nota: 'fora da regiao: null. A sentinela -3 de W.alturaEm NAO vaza para ca.' };
    if (!a || !a.tile || a.fora) return fora;
    return {
      z: alturaDoTerreno(reg, a.tile.x, a.tile.y),
      natureza: 'leitura_de_terreno',
      dentro: true,
      unidade: UNIDADE_LOCAL,
      zeroZ: ESPACO_LOCAL_ORIGEM.zeroZ,
      fonte: 'reg.alturaTerreno[indexLinear]',
      nota: 'NAO e componente do endereco nem da chave. Lossy na persistencia ' +
        '(seriar arredonda para 2 casas). Ver ESQUEMA.tile.'
    };
  }

  /* Endereço de uma ENTIDADE do motor (NPC, animal, objeto, água...).
     Mesmo espaço local. zLocal é a altura do ALVO no eixo z; zTerreno é a
     altura do solo naquele tile. Não são dois espaços — é um eixo só, com
     dois pontos de amostragem. */
  function enderecoDeEntidade(m, reg, ent) {
    var p = (ent && ent.pos) ? ent.pos : null;
    var x = p ? p.x : null;
    var y = p ? p.y : null;
    var a = enderecoDeTile(m, reg, x, y);
    a.alvo = {
      classe: (ent && ent.classe) ? ent.classe : null,
      id: (ent && ent.id !== undefined) ? ent.id : null,
      rotulo: (ent && ent.nome) ? ent.nome : null,
      /* z do alvo: DADO DA ENTIDADE, não componente do endereço nem da chave.
         Fica aqui, fora de `local`, justamente para não voltar a se confundir. */
      z: (p && eNumero(p.z)) ? p.z : null,
      naturezaZ: 'leitura_de_entidade'
    };
    return a;
  }

  /* ==========================================================================
     3. CAMADA GEOGRÁFICA — ancoragem no globo. T (terra.js) por parâmetro.
     ========================================================================== */

  function exigirTerra(T) {
    if (!T || typeof T.dirDeLatLon !== 'function') {
      throw new Error('endereco.js: terra.js ausente. Esperado T.dirDeLatLon de ' +
        'genesis/fase1/terra.js. Nao ha segunda implementacao de lat/lon aqui.');
    }
    return T;
  }

  /* A posição no globo é a posição DA REGIÃO, não do tile.
     A região tem 160 m; a coordenada lat/lon dela tem 2 decimais (~1,1 km por
     passo). Logo a âncora geográfica é MAIS GROSSA que a região inteira.
     Ancorar tile a tile no globo via lat/lon é impossível hoje — e isto é
     declarado, não escondido. Ver precisaoDeAncoragem(). */
  function ancorarNoGlobo(T, a) {
    exigirTerra(T);
    var lat = a.regiao.lat, lon = a.regiao.lon;
    var base = {
      nivel: 'regiao',                 /* NUNCA 'tile' */
      valido: false,                   /* invariante desta fase */
      lat: eNumero(lat) ? lat : null,
      lon: eNumero(lon) ? lon : null,
      dir: null,
      raio: T.R,
      fonte: 'T.dirDeLatLon(reg.lat, reg.lon) — genesis/fase1/terra.js',
      convencaoDeAncora: 'indefinida',
      orientacao: null,
      raioDeReferencia: 'nao_declarado',
      lacunas: LACUNAS_GEO,
      motivo: MOTIVO_GEO_INVALIDA
    };
    if (!eNumero(lat) || !eNumero(lon)) { a.geo = base; a.globo = base; return a; }
    var d = T.dirDeLatLon(lat, lon);
    base.dir = [d.x, d.y, d.z];
    base.precisao = precisaoDeAncoragem(
      { largura: a.regiao.tam },
      (a.planeta && eNumero(a.planeta.raioKm)) ? a.planeta.raioKm : 6371
    );
    a.geo = base;
    a.globo = base;                    /* alias depreciado, MESMA referência */
    return a;
  }

  /* Conveniências de leitura — todas delegam para terra.js. */
  function paraGlobo(T, a) { return ancorarNoGlobo(T, a).geo; }

  function paraLatLonDeDir(T, x, y, z) {
    exigirTerra(T);
    return T.latLonDeDir(x, y, z);
  }

  /* Endereço completo: tile + ancoragem no globo. */
  function enderecoCompleto(T, m, reg, x, y) {
    return ancorarNoGlobo(T, enderecoDeTile(m, reg, x, y));
  }

  /* Quantização da âncora geográfica — MEDIDA, não estimada.
     Compara o passo de lat/lon (definido por toFixed(2) em world.js) com o
     tamanho angular real da região. Devolve a razão: quantos passos de
     quantização cabem dentro da própria região. */
  function precisaoDeAncoragem(reg, raioKm) {
    var larguraMetros = (reg && eNumero(reg.largura) ? reg.largura : TAM_PADRAO) * TILE_METROS;
    var R_km = eNumero(raioKm) ? raioKm : 6371;
    var passoGraus = Math.pow(10, -LATLON_DECIMAIS);          /* 0,01 grau */
    var passoRad = passoGraus * Math.PI / 180;
    var anguloRegiaoRad = larguraMetros / (R_km * 1000);
    var erroMaxRad = (passoGraus / 2) * Math.PI / 180;
    return {
      decimais: LATLON_DECIMAIS,
      passoGraus: passoGraus,
      passoMetros: passoRad * R_km * 1000,
      larguraRegiaoMetros: larguraMetros,
      anguloRegiaoGraus: anguloRegiaoRad * 180 / Math.PI,
      razaoPassoPorRegiao: passoRad / anguloRegiaoRad,
      erroMaxGraus: passoGraus / 2,
      erroMaxMetros: erroMaxRad * R_km * 1000,
      erroMaxEmRegioes: (erroMaxRad * R_km * 1000) / larguraMetros,
      veredito: (passoRad > anguloRegiaoRad)
        ? 'ancora geografica MAIS GROSSA que a regiao — ancoragem por tile impossivel hoje'
        : 'ancora geografica mais fina que a regiao'
    };
  }

  /* ==========================================================================
     3B. FRAME DE REGIÃO E ANCORAGEM POR TILE      (novo no contrato 2a.3)
     ==========================================================================

     O QUE MUDA, E POR QUE ISSO NÃO É "PRECISÃO FALSA"
     -------------------------------------------------
     A versão 2a.2 declarou QUATRO lacunas (LACUNAS_GEO) e, por causa delas,
     recusou-se a oferecer georreferência de tile. As quatro continuam sendo
     verdade sobre o `world.js`: o motor não declara nenhuma delas.

     A versão 2a.3 não descobre esses dados no motor. Ela os DECLARA aqui,
     como convenção DESTE CONTRATO, e assume a responsabilidade por elas:

       convencaoDeAncora  := 'centro_da_regiao'
            reg.lat/reg.lon passam a significar o CENTRO da região.
            Decisão do contrato. `world.js` continua sem opinião.

       orientacao         := +x local aponta para LESTE geográfico
                             +y local aponta para SUL geográfico
            +y cresce para o sul porque a grade é indexada por linha
            (world.js:276, idx = y*TAM + x) e a linha 0 é o topo do mapa.
            Norte no topo. Azimute da grade = 0 (sem rotação).

       raioDeReferencia   := m.planeta.raioKm (6371 km, world.js:52)
            Esfera. Sem achatamento. Declarado, não presumido.

       precisao           := DERIVADA, nunca gravada.  ← a chave de tudo

     A QUARTA É A QUE MATA O ERRO DE 556 m
     -------------------------------------
     O erro de ±555,97 m só existe se `reg.lat`/`reg.lon` forem lidos como a
     posição VERDADEIRA de um ponto e comparados contra uma verdade externa.
     Aqui eles não são isso. Eles são a DEFINIÇÃO de onde a região está.
     A ida e a volta usam o mesmo valor arredondado, e por isso a ida e volta
     fecha exata. O arredondamento deixa de ser erro de medida e passa a ser
     granularidade de POSICIONAMENTO da região no globo: uma região só pode
     nascer em múltiplos de 0,01 grau. Isso é uma restrição do gerador, não
     uma incerteza do endereço.

     Consequência prática: `world.js` NÃO é tocado. O `.toFixed(2)` fica onde
     está. Nenhum backup, nenhum md5 novo, nenhuma errata de arquivo LEI.
     Esta é a Rota A do plano (âncora derivada), e é por isto que ela foi
     escolhida em vez da Rota B (âncora de precisão).

     A MATEMÁTICA
     ------------
     Projeção azimutal equidistante em torno do centro da região:

       ida    p = C·cos(θ) + U·sen(θ),   θ = r/R,  U = (dxE·L + dyN·N)/r
       volta  θ = atan2(|p − C·(p·C)|, p·C),  r = θ·R

     `atan2` em vez de `acos` de propósito: `acos` perto de 1 é mal
     condicionado (erro ~1e-8 rad = ~9 cm) e `atan2` não é (erro ~1e-16 rad).
     A distância é preservada em metros, exatamente, que é o que torna
     "1 tile = 1 metro" uma afirmação honesta e não um apelido.

     O frame (C, L, N) é ortonormal e derivado só do centro da região:
       L = normalizar(C × Y)      (leste)
       N = L × C                  (norte)
     com Y = polo norte = eixo (0,1,0) da convenção de terra.js:130-134.
     Degenerado apenas exatamente sobre os polos; guardado explicitamente.
     ========================================================================== */

  var RAIO_REF_KM_PADRAO = 6371;                 /* world.js:52 */
  var CONVENCAO_ANCORA = 'centro_da_regiao';

  /* RESOLUÇÃO DECLARADA DO ESPAÇO LOCAL — 1 micrômetro.
     A volta globo → local sai com erro de ~1e-9 m (ruído de ponto flutuante).
     Isso é pequeno demais para importar em qualquer lugar, EXCETO exatamente
     sobre a borda de um tile: ali um −1e-9 m derruba o índice para o tile
     vizinho. Medido: 851 de 1000 cantos exatos caíam no vizinho.

     A correção é quantizar o local nesta resolução ao sair da volta. Não é
     maquiagem: é declarar que o endereço resolve 1 µm e nada abaixo disso.
     1 µm em um tile de 1 m são 6 casas decimais, e o menor objeto que a
     simulação nomeia é um grão. O efeito colateral é que o erro contínuo de
     ida e volta sobe de 1e-9 m para no máximo 5e-7 m — ainda 2.000.000 de
     vezes menor que o aceite de 1 m, e ainda dentro da meta ambiciosa de
     1e-6 m — em troca de idempotência EXATA, discreta e contínua. */
  var RESOLUCAO_LOCAL_METROS = 1e-6;
  var INV_RESOLUCAO = 1 / RESOLUCAO_LOCAL_METROS;
  function quantizarLocal(v) { return Math.round(v * INV_RESOLUCAO) / INV_RESOLUCAO; }

  var ORIENTACAO_DA_GRADE = {
    eixoX: 'leste',
    eixoY: 'sul',
    azimuteGraus: 0,
    nortePlanetario: [0, 1, 0],
    origem: 'declarada_pelo_contrato',
    motivo: 'A grade e indexada por linha (world.js:276, idx = y*TAM + x) e a ' +
      'linha 0 e o topo do mapa. Norte no topo, portanto +y aponta para o sul. ' +
      'O motor nao declara isto; o contrato declara e assume a responsabilidade.'
  };

  var GEO_2A3 = {
    precisao: { estado: 'derivada',
      motivo: 'a posicao no globo e CALCULADA a partir de (regionIndex, local) e nunca ' +
        'gravada. reg.lat/reg.lon sao a DEFINICAO do centro da regiao, nao uma medida ' +
        'dele, logo a ida e volta fecha exata e o arredondamento vira granularidade de ' +
        'posicionamento da regiao, nao incerteza do endereco.' },
    convencaoDeAncora: { estado: 'declarada', valor: CONVENCAO_ANCORA,
      motivo: 'decisao deste contrato. world.js continua sem declarar nada.' },
    orientacao: { estado: 'declarada', valor: ORIENTACAO_DA_GRADE },
    raioDeReferencia: { estado: 'declarado', valor: 'm.planeta.raioKm',
      motivo: 'esfera, sem achatamento. world.js:52 = 6371 km.' },
    aviso: 'A validade geografica de nivel TILE repousa nestas quatro declaracoes do ' +
      'CONTRATO, nao em autoridade do world.js. Se o motor um dia declarar as suas ' +
      'proprias, as dele vencem e este bloco vira errata.'
  };

  /* --- álgebra vetorial mínima (local; terra.js não exporta as quatro) ----- */
  function g3(x, y, z) { return { x: x, y: y, z: z }; }
  function gSoma(a, b) { return g3(a.x + b.x, a.y + b.y, a.z + b.z); }
  function gSub(a, b) { return g3(a.x - b.x, a.y - b.y, a.z - b.z); }
  function gEsc(a, s) { return g3(a.x * s, a.y * s, a.z * s); }
  function gPonto(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function gCruz(a, b) {
    return g3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }
  function gComp(a) { return Math.sqrt(gPonto(a, a)); }
  function gNorm(a) { var n = gComp(a); return (n < 1e-300) ? g3(0, 0, 0) : gEsc(a, 1 / n); }
  function gClamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* Raio de referência em metros, lido do planeta. Nunca inventado. */
  function raioMetros(m) {
    var km = (m && m.planeta && eNumero(m.planeta.raioKm)) ? m.planeta.raioKm : RAIO_REF_KM_PADRAO;
    return km * 1000;
  }

  /* Frame ortonormal em torno de QUALQUER direção unitária do globo.
     Esta é a primitiva. `frameDaRegiao` é um caso particular dela, e a
     superfície (v2/core/superficie.js) usa exatamente esta, para que a
     projeção da câmera e a projeção do endereço sejam a MESMA conta.
     Duas implementações da mesma projeção seriam duas geografias. */
  function frameEmDir(dir) {
    var c = gNorm(g3(dir.x, dir.y, dir.z));
    var polo = g3(0, 1, 0);
    var cr = gCruz(c, polo);
    var n = gComp(cr);
    var leste;
    if (n < 1e-12) {
      /* Exatamente sobre um polo: leste é indefinido. Fixamos o meridiano 0
         como referência e DECLARAMOS a escolha, em vez de devolver NaN. */
      leste = gNorm(gCruz(c, g3(1, 0, 0)));
      if (gComp(leste) < 1e-12) leste = g3(0, 0, 1);
    } else {
      leste = gEsc(cr, 1 / n);
    }
    return {
      centro: c, leste: leste, norte: gCruz(leste, c),
      degenerado: (n < 1e-12),
      orientacao: ORIENTACAO_DA_GRADE
    };
  }

  /* IDA da projeção azimutal equidistante: deslocamento em metros → direção. */
  function dirDeslocada(f, dLeste, dNorte, Rm) {
    var r = Math.sqrt(dLeste * dLeste + dNorte * dNorte);
    if (r < 1e-12) return f.centro;
    var th = r / Rm;
    var u = gSoma(gEsc(f.leste, dLeste / r), gEsc(f.norte, dNorte / r));
    return gSoma(gEsc(f.centro, Math.cos(th)), gEsc(u, Math.sin(th)));
  }

  /* VOLTA da projeção: direção → deslocamento em metros.
     atan2, nunca acos: acos perto de 1 custa ~9 cm; atan2 custa ~1e-9 m. */
  function deslocamentoEntre(f, dir, Rm) {
    var pn = gNorm(g3(dir.x, dir.y, dir.z));
    var co = gClamp(gPonto(pn, f.centro), -1, 1);
    var t = gSub(pn, gEsc(f.centro, co));
    var nt = gComp(t);
    var th = Math.atan2(nt, co);
    if (nt <= 1e-300) return { leste: 0, norte: 0, anguloRad: th, metros: th * Rm };
    var u = gEsc(t, 1 / nt);
    var r = th * Rm;
    return {
      leste: r * gPonto(u, f.leste),
      norte: r * gPonto(u, f.norte),
      anguloRad: th,
      metros: r
    };
  }

  /* Frame de uma região. Puro: mesma região ⇒ mesmo frame, sempre.
     T (terra.js) é quem converte lat/lon em direção — nunca duplicamos a conta. */
  function frameDaRegiao(T, reg) {
    exigirTerra(T);
    var lat = lerLatLon(reg, 'lat'), lon = lerLatLon(reg, 'lon');
    if (!eNumero(lat) || !eNumero(lon)) return null;
    var f = frameEmDir(T.dirDeLatLon(lat, lon));
    f.lat = lat;
    f.lon = lon;
    f.convencaoDeAncora = CONVENCAO_ANCORA;
    return f;
  }

  /* Deslocamento local (tiles) → deslocamento no frame (metros).
     O centro da região fica em (tam/2, tam/2) do espaço local, porque a
     origem local é o CANTO do tile (0,0) — decisão já fechada em 2a.2. */
  function deslocamentoNoFrame(x, y, tam) {
    var meio = tam * TILE_METROS / 2;
    return {
      leste: (x * TILE_METROS) - meio,
      norte: meio - (y * TILE_METROS)      /* +y local aponta para o SUL */
    };
  }
  function localDoDeslocamento(dLeste, dNorte, tam) {
    var meio = tam * TILE_METROS / 2;
    return {
      x: (dLeste + meio) / TILE_METROS,
      y: (meio - dNorte) / TILE_METROS
    };
  }

  /* IDA: endereço → ponto unitário no globo. Erro de arredondamento apenas. */
  function globoDoEndereco(T, m, a) {
    exigirTerra(T);
    if (!a || !a.regiao || !a.local) return null;
    var reg = regiaoPorIndice(m, a.regiao.regionIndex);
    var f = reg ? frameDaRegiao(T, reg) : null;
    if (!f) return null;
    var tam = eNumero(a.regiao.tam) ? a.regiao.tam : TAM_PADRAO;
    var d = deslocamentoNoFrame(a.local.x, a.local.y, tam);
    var Rm = raioMetros(m);
    var r = Math.sqrt(d.leste * d.leste + d.norte * d.norte);
    var p = dirDeslocada(f, d.leste, d.norte, Rm);
    var ll = T.latLonDeDir(p.x, p.y, p.z);
    return {
      nivel: 'tile',
      valido: true,
      dir: [p.x, p.y, p.z],
      lat: ll.lat, lon: ll.lon,
      raioMetros: Rm,
      distanciaAoCentroMetros: r,
      convencaoDeAncora: CONVENCAO_ANCORA,
      orientacao: ORIENTACAO_DA_GRADE,
      raioDeReferencia: 'm.planeta.raioKm',
      fonte: 'endereco.globoDoEndereco — projecao azimutal equidistante sobre T.dirDeLatLon',
      declaracoes: GEO_2A3
    };
  }

  /* VOLTA (parcial): ponto do globo → coordenada local DENTRO de uma região
     dada. Não escolhe região; só projeta. Ver enderecoDeGlobo. */
  function localDoGlobo(T, m, reg, p, tam) {
    var f = frameDaRegiao(T, reg);
    if (!f) return null;
    tam = eNumero(tam) ? tam : tamDe(reg);
    var Rm = raioMetros(m);
    var dd = deslocamentoEntre(f, p, Rm);
    var dLeste = dd.leste, dNorte = dd.norte, th = dd.anguloRad;
    var loc = localDoDeslocamento(dLeste, dNorte, tam);
    loc.x = quantizarLocal(loc.x);
    loc.y = quantizarLocal(loc.y);
    return {
      x: loc.x, y: loc.y,
      resolucaoMetros: RESOLUCAO_LOCAL_METROS,
      deslocamentoLeste: dLeste, deslocamentoNorte: dNorte,
      anguloRad: th,
      distanciaMetros: th * Rm,
      dentro: (loc.x >= 0 && loc.x < tam && loc.y >= 0 && loc.y < tam)
    };
  }

  /* Centros de todas as regiões. Derivado; recalculado quando a coleção muda.
     Cache preso ao próprio objeto `m` por uma chave não enumerável, para não
     poluir o estado do mundo nem criar segunda fonte de verdade. */
  var CACHE_CENTROS = '__f2a_centros__';
  function centrosDasRegioes(T, m) {
    var regs = (m && m.planeta && m.planeta.regioes) ? m.planeta.regioes : [];
    var c = m ? m[CACHE_CENTROS] : null;
    if (c && c.n === regs.length && c.ref === regs) return c.lista;
    var lista = [];
    for (var i = 0; i < regs.length; i++) {
      var f = frameDaRegiao(T, regs[i]);
      lista.push(f ? f.centro : null);
    }
    if (m) {
      try {
        Object.defineProperty(m, CACHE_CENTROS, {
          value: { n: regs.length, ref: regs, lista: lista },
          writable: true, enumerable: false, configurable: true
        });
      } catch (e) { /* objeto congelado: segue sem cache, só mais lento */ }
    }
    return lista;
  }

  /* Região mais próxima de um ponto do globo. Determinística:
     maior produto escalar; empate resolvido pelo MENOR índice, sempre. */
  function regiaoMaisProxima(T, m, p) {
    var lista = centrosDasRegioes(T, m);
    var pn = gNorm(g3(p.x, p.y, p.z));
    var melhor = -1, melhorDot = -Infinity;
    for (var i = 0; i < lista.length; i++) {
      if (!lista[i]) continue;
      var d = gPonto(pn, lista[i]);
      if (d > melhorDot) { melhorDot = d; melhor = i; }
      /* empate exato: mantém o menor índice (não substitui) */
    }
    return { regionIndex: melhor, cos: melhorDot, total: lista.length };
  }

  /* VOLTA COMPLETA: ponto do globo → endereço.
     Nunca lança. Fora da grade devolve endereço com `fora: true` e motivo. */
  function enderecoDeGlobo(T, m, p, opcoes) {
    exigirTerra(T);
    opcoes = opcoes || {};
    var alvo = eNumero(opcoes.regionIndex)
      ? { regionIndex: opcoes.regionIndex, cos: null, total: (m.planeta.regioes || []).length }
      : regiaoMaisProxima(T, m, p);
    if (alvo.regionIndex < 0) return null;
    var reg = regiaoPorIndice(m, alvo.regionIndex);
    if (!reg) return null;
    var tam = tamDe(reg);
    var loc = localDoGlobo(T, m, reg, p, tam);
    if (!loc) return null;
    var a = enderecoDeTile(m, reg, loc.x, loc.y);
    a.local.x = loc.x; a.local.y = loc.y;          /* preserva a fração exata */
    a.globoEntrada = {
      dir: [p.x, p.y, p.z],
      distanciaAoCentroMetros: loc.distanciaMetros,
      dentro: loc.dentro,
      cosAoCentro: alvo.cos,
      escolhaDeRegiao: eNumero(opcoes.regionIndex) ? 'imposta' : 'mais_proxima',
      criterioDeDesempate: 'menor indice'
    };
    return a;
  }

  /* Ida e volta em uma chamada, para medição. */
  function medirIdaEVolta(T, m, reg, x, y) {
    var a = enderecoDeTile(m, reg, x, y);
    var g = globoDoEndereco(T, m, a);
    if (!g) return null;
    var b = enderecoDeGlobo(T, m, { x: g.dir[0], y: g.dir[1], z: g.dir[2] });
    if (!b) return null;
    var tam = tamDe(reg);
    var dx = (b.local.x - x) * TILE_METROS;
    var dy = (b.local.y - y) * TILE_METROS;
    return {
      erroMetros: Math.sqrt(dx * dx + dy * dy),
      mesmaRegiao: (b.regiao.regionIndex === a.regiao.regionIndex),
      regionIndex: b.regiao.regionIndex,
      tam: tam
    };
  }

  /* ==========================================================================
     4. SERIALIZAÇÃO — chave canônica e ida-e-volta por string
     ========================================================================== */

  function enc(s) { return encodeURIComponent(String(s)); }
  function dec(s) {
    try { return decodeURIComponent(String(s)); } catch (e) { return String(s); }
  }
  function num(v) { return eNumero(v) ? String(v) : '-'; }

  /* Projeção serializável: exatamente os campos que sobrevivem à ida-e-volta.
     Se não está aqui, não é serializado — e isso é explícito.

     O QUE SAIU NA VERSÃO 2a.2, E POR QUÊ:
       z    — é terreno, não endereço. Sai também porque `seriar` arredonda
              alturaTerreno para 2 casas e a chave deixava de sobreviver a
              um save/load. Consulte com alturaNoEndereco().
       lat/lon — georreferência de nível REGIÃO, aproximada e com geo.valido=false.
              Dentro da mesma string que x,y ela sugeria que o TILE está naquela
              coordenada. Não está. Fica só em a.geo, com as lacunas declaradas.
       p (rótulo do planeta) — texto de apresentação, trocável. Uma chave de
              comparação não pode mudar porque alguém renomeou o planeta.
     O QUE ENTROU:
       seed — a única raiz estável e persistida que o motor oferece. */
  function projecao(a) {
    return {
      contrato: a.contrato,
      seed: (a.mundo && eNumero(a.mundo.seed)) ? a.mundo.seed : null,
      regionIndex: a.regiao ? a.regiao.regionIndex : null,
      x: a.local ? a.local.x : null,
      y: a.local ? a.local.y : null
    };
  }

  function formatarEndereco(a) {
    var p = projecao(a);
    return PREFIXO
      + SEP + 's=' + num(p.seed)
      + SEP + 'ri=' + num(p.regionIndex)
      + SEP + 'x=' + num(p.x)
      + SEP + 'y=' + num(p.y);
  }

  function parseEndereco(s) {
    s = String(s == null ? '' : s);
    var partes = s.split(SEP);
    if (partes[0] !== PREFIXO) {
      throw new Error('parseEndereco: prefixo invalido (esperado ' + PREFIXO + '): ' + s);
    }
    var kv = {};
    for (var i = 1; i < partes.length; i++) {
      var j = partes[i].indexOf('=');
      if (j < 0) continue;
      kv[partes[i].slice(0, j)] = partes[i].slice(j + 1);
    }
    function numero(k) {
      var v = kv[k];
      if (v === undefined || v === '-') return null;
      var n = parseFloat(v);
      return isFinite(n) ? n : null;
    }
    function texto(k) {
      var v = kv[k];
      if (v === undefined || v === '-') return null;
      return dec(v);
    }
    var out = {
      contrato: CONTRATO,
      seed: numero('s'),
      regionIndex: numero('ri'),
      x: numero('x'),
      y: numero('y')
    };
    out.tileX = eNumero(out.x) ? (out.x | 0) : null;
    out.tileY = eNumero(out.y) ? (out.y | 0) : null;
    out.indexLinear = (out.tileX === null || out.tileY === null)
      ? null : indiceDeTile(out.tileX, out.tileY, TAM_PADRAO);
    /* texto() continua existindo e usado: o parser aceita chaves extras sem
       quebrar, mas nenhuma delas volta como campo do contrato. */
    void texto;
    return out;
  }

  /* Chave canônica: string determinística de COMPARAÇÃO e ORDENAÇÃO.
     NÃO é identidade e NÃO deve ser gravada como chave persistente — ela
     contém regionIndex, que é instável por construção. Está aqui justamente
     para que uma fase futura consiga VER a instabilidade acontecendo (T13). */
  function chaveCanonica(a) {
    return formatarEndereco(a);
  }

  /* ---------------------------------------------------------------------------
     CHAVE LÓGICA — 'G2A:<seed>/r<regionIndex>/t<indexLinear>'

     Enraizada na seed, que é o único dado estável E persistido do motor
     (world.js:seriar grava m.seed). Com exatamente UMA região no mundo, a região
     é função determinística da seed e a chave é inequívoca.

     Com DUAS OU MAIS regiões ela devolve null, com motivo. Isso é deliberado:
     `regionIndex` é posição na coleção e muda quando a coleção é reordenada
     (demonstrado em T13), e `reg.id` é `const id = 0` hardcoded, igual para toda
     região. Não existe resposta honesta nesse cenário, então não se dá resposta.
     Não se inventa UUID, não se promove índice, não se cria identidade sintética.
     --------------------------------------------------------------------------- */
  function chaveLogica(a) {
    var d = descreverChaveLogica(a);
    return d.chave;
  }

  function descreverChaveLogica(a) {
    if (!a || !a.regiao || !a.mundo) {
      return { chave: null, emitida: false, motivo: 'endereco invalido' };
    }
    var seed = a.mundo.seed;
    var ri = a.regiao.regionIndex;
    var total = a.regiao.totalRegioes;
    if (!eNumero(seed)) {
      return { chave: null, emitida: false, motivo: 'mundo sem seed: sem raiz estavel, sem chave.' };
    }
    if (ri < 0) {
      return { chave: null, emitida: false,
        motivo: 'a regiao nao pertence a m.planeta.regioes: nao ha nem indice de colecao para ela.' };
    }
    if (total !== 1) {
      return { chave: null, emitida: false, totalRegioes: total,
        motivo: 'o mundo tem ' + total + ' regioes e o motor NAO possui identidade persistente ' +
          'de regiao (reg.id = const 0 hardcoded em world.js:82; regionIndex muda ao reordenar ' +
          'a colecao). Recusa deliberada: uma chave aqui seria ambigua ou inventada.' };
    }
    if (!a.tile) {
      return { chave: PREFIXO_LOGICO + ':' + seed + '/r' + ri, emitida: true, nivel: 'regiao',
        motivo: 'endereco de nivel REGIAO: nao ha tile.' };
    }
    return {
      chave: PREFIXO_LOGICO + ':' + seed + '/r' + ri + '/t' + a.tile.indexLinear,
      emitida: true,
      nivel: 'tile',
      raiz: 'seed',
      persistencia: 'permitida enquanto totalRegioes === 1',
      autoridade: false,
      motivo: 'seed e raiz estavel e persistida (seriar grava m.seed); com uma unica regiao ' +
        'a regiao e funcao determinista da seed. regionIndex aparece como coordenada, ' +
        'nunca como identidade.'
    };
  }

  /* ==========================================================================
     5. COMPARAÇÃO E DISTÂNCIA
     ========================================================================== */

  function mesmaRegiao(a, b) {
    if (!a.regiao || !b.regiao) return false;
    if (a.regiao.regionIndex < 0 || b.regiao.regionIndex < 0) return false;
    return a.regiao.regionIndex === b.regiao.regionIndex;
  }

  function mesmoTile(a, b) {
    if (!mesmaRegiao(a, b)) return false;
    if (!a.tile || !b.tile) return false;
    return a.tile.indexLinear === b.tile.indexLinear;
  }
  function mesmaCelula(a, b) { return mesmoTile(a, b); }   /* alias depreciado */

  function distanciaTiles(a, b) {
    if (!mesmaRegiao(a, b)) return null;
    if (!eNumero(a.local.x) || !eNumero(a.local.y)) return null;
    if (!eNumero(b.local.x) || !eNumero(b.local.y)) return null;
    var dx = a.local.x - b.local.x, dy = a.local.y - b.local.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* ==========================================================================
     6. PRNG DETERMINÍSTICO (só para teste/benchmark — não é RNG do mundo)
     ========================================================================== */
  function lcg(semente) {
    var x = (semente >>> 0) || 1;
    return function () {
      x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
      return x / 4294967296;
    };
  }

  function igualProfundo(a, b) {
    if (a === b) return true;
    if (a === null || b === null) return a === b;
    if (typeof a !== typeof b) return false;
    if (typeof a !== 'object') return a === b;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    var ka = Object.keys(a), kb = Object.keys(b);
    if (ka.length !== kb.length) return false;
    for (var i = 0; i < ka.length; i++) {
      var k = ka[i];
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!igualProfundo(a[k], b[k])) return false;
    }
    return true;
  }

  /* ==========================================================================
     7. TESTES
     ========================================================================== */
  function rodarTestes(ctx) {
    ctx = ctx || {};
    var T = ctx.T || GLOBAL.GenesisF1 || null;
    var W = ctx.W || GLOBAL.GenesisWorld || null;
    var out = [];

    function add(id, nome, ok, valores, detalhe) {
      out.push({ id: id, nome: nome, ok: !!ok, valores: valores, detalhe: detalhe || '' });
    }
    function na(id, nome, motivo) {
      out.push({ id: id, nome: nome, ok: true, na: true, valores: { 'N/A': 'nao executavel nesta fase' }, detalhe: motivo });
    }

    if (!W || typeof W.criar !== 'function') {
      add('T0', 'world.js disponivel', false, { erro: 'GenesisWorld ausente' },
        'sem world.js nao ha motor para endereçar');
      return out;
    }

    /* Um único mundo. `reg` PRECISA pertencer a `m.planeta.regioes`, senão
       indiceDeRegiao() devolve -1 (corretamente) e todo teste de índice
       falharia por erro do teste, não do contrato. */
    var seed = (ctx.seed !== undefined) ? ctx.seed
      : (T && T.SEED_CANONICA !== undefined) ? T.SEED_CANONICA : 20260101;
    var m = W.criar({ seed: seed });
    var reg = W.regiaoAtiva(m);

    /* ---------- T1 · contrato e doutrina ---------- */
    (function () {
      var a = enderecoDaRegiao(m, reg);
      var camposOk =
        typeof a.contrato === 'string' &&
        a.subregiao === null &&                    /* ausente por ausência real */
        typeof a.motivoSubregiao === 'string' &&
        a.regiao.identidade.tipo === 'derivada' &&
        a.regiao.identidade.estabilidade === 'nao_garantida' &&
        a.regiao.identidade.autoridade === false &&
        a.planeta.identidade.autoridade === false &&
        a.planeta.identidade.tipo === 'ausente';
      add('T1', 'contrato · esquema, ausencia declarada e identidade nao-autoritaria', camposOk, {
        'contrato': a.contrato,
        'versao': a.versao,
        'subregiao': String(a.subregiao),
        'planeta.identidade.tipo': a.planeta.identidade.tipo,
        'regiao.identidade.tipo': a.regiao.identidade.tipo,
        'regiao.identidade.autoridade': String(a.regiao.identidade.autoridade),
        'regiao.identidade.persistencia': a.regiao.identidade.persistencia,
        'campos do esquema': Object.keys(ESQUEMA).length
      }, 'subregiao e null com motivo textual: nao foi sintetizada sub-regiao trivial.');
    })();

    /* ---------- T2 · endereco real da regiao canonica (confronto com world.js) ---------- */
    (function () {
      var a = enderecoDaRegiao(m, reg);
      var confere =
        a.planeta.rotulo === m.planeta.nome &&
        a.regiao.rotulo === reg.nome &&
        a.regiao.idx === reg.idx &&
        a.regiao.idInterno === reg.id &&
        a.regiao.larguraTiles === reg.largura &&
        a.regiao.alturaTiles === reg.altura &&
        a.regiao.tam === W.TAM &&
        a.regiao.regionIndex === m.planeta.regiaoAtiva &&
        a.regiao.totalRegioes === m.planeta.regioes.length;
      add('T2', 'regiao canonica · todos os campos conferem com world.js', confere, {
        'planeta.rotulo': a.planeta.rotulo,
        'regiao.rotulo': a.regiao.rotulo,
        'regiao.regionIndex': a.regiao.regionIndex,
        'regiao.totalRegioes': a.regiao.totalRegioes,
        'regiao.idx': a.regiao.idx,
        'regiao.idInterno': a.regiao.idInterno,
        'regiao.tam': a.regiao.tam,
        'regiao.lat (string do motor)': String(reg.lat),
        'regiao.lon (string do motor)': String(reg.lon),
        'regiao.lat (convertido)': a.regiao.lat
      }, 'regiao.idInterno = reg.id = ' + reg.id + ' (const hardcoded em world.js:62) — igual para QUALQUER regiao.');
    })();

    /* ---------- T2b · altura (LEITURA DE TERRENO) == W.alturaEm, e fora do endereco ---------- */
    (function () {
      var rnd = lcg(20260101);
      var n = 400, div = 0, maxDif = 0, foraBate = 0, amostras = [];
      for (var i = 0; i < n; i++) {
        var x = Math.floor(rnd() * W.TAM), y = Math.floor(rnd() * W.TAM);
        var a = enderecoDeTile(m, reg, x, y);
        var leitura = alturaNoEndereco(reg, a);
        var zW = W.alturaEm(m, x, y);
        var d = Math.abs(leitura.z - zW);
        if (d > maxDif) maxDif = d;
        if (d !== 0) { div++; if (amostras.length < 5) amostras.push(x + ',' + y + ': ' + leitura.z + ' vs ' + zW); }
      }
      /* fora da regiao: alturaEm devolve -3 (sentinela) e a leitura devolve null */
      var fora = enderecoDeTile(m, reg, -1, -1);
      var lFora = alturaNoEndereco(reg, fora);
      if (lFora.z === null && W.alturaEm(m, -1, -1) === ALTURA_FORA) foraBate = 1;
      /* e o ENDERECO nao carrega altura em lugar nenhum */
      var dentro = enderecoDeTile(m, reg, 80, 80);
      var semZ = !('z' in dentro.local) && !('zTerreno' in dentro.local) &&
        !('z' in dentro.tile) && !('z' in dentro.origemLocal);
      add('T2b', 'altura e LEITURA DE TERRENO (== W.alturaEm) e NAO esta no endereco', (div === 0 && foraBate === 1 && semZ), {
        'amostras': n,
        'divergencias': div,
        'dif max (m)': maxDif,
        'alturaEm(-1,-1) (sentinela)': String(W.alturaEm(m, -1, -1)),
        'leitura fora da regiao': String(lFora.z),
        'endereco.local tem z?': String('z' in dentro.local),
        'endereco.tile tem z?': String('z' in dentro.tile),
        'natureza declarada': alturaNoEndereco(reg, dentro).natureza
      }, 'a sentinela -3 do motor NAO vaza. z saiu de `local`: altura e terreno, e terreno muda sem que o lugar mude.');
    })();

    /* ---------- T3 · determinismo mesmo seed ---------- */
    (function () {
      var m2 = W.criar({ seed: seed });
      var reg2 = W.regiaoAtiva(m2);
      var rnd = lcg(7);
      var n = 200, div = 0;
      var aBase = enderecoDaRegiao(m, reg), a2 = enderecoDaRegiao(m2, reg2);
      if (chaveCanonica(aBase) !== chaveCanonica(a2)) div++;
      for (var i = 0; i < n; i++) {
        var x = Math.floor(rnd() * W.TAM), y = Math.floor(rnd() * W.TAM);
        if (chaveCanonica(enderecoDeTile(m, reg, x, y)) !== chaveCanonica(enderecoDeTile(m2, reg2, x, y))) div++;
      }
      add('T3', 'determinismo · mesma seed => mesma chave canonica (bit a bit)', div === 0, {
        'comparacoes': n + 1,
        'divergencias': div,
        'chave': chaveCanonica(aBase)
      }, 'dois mundos criados independentemente com a mesma seed produzem enderecos identicos como texto.');
    })();

    /* ---------- T4 · seed diferente muda o endereco (nao e degenerado) ---------- */
    (function () {
      var m3 = W.criar({ seed: seed + 1 });
      var a = enderecoDaRegiao(m, reg), b = enderecoDaRegiao(m3, W.regiaoAtiva(m3));
      var mudou = (chaveCanonica(a) !== chaveCanonica(b));
      add('T4', 'seed diferente => endereco diferente (contrato nao e degenerado)', mudou, {
        'seed A': String(m.seed),
        'seed B': String(m3.seed),
        'chave A': chaveCanonica(a),
        'chave B': chaveCanonica(b)
      }, 'garante que o endereco carrega informacao real, e nao um valor constante.');
    })();

    /* ---------- T5 · local (x,y) <-> celula (indice linear) ---------- */
    (function () {
      var tam = reg.largura, rnd = lcg(99), n = 500, div = 0, amostras = [];
      for (var i = 0; i < n; i++) {
        var x = Math.floor(rnd() * tam), y = Math.floor(rnd() * tam);
        var a = enderecoDeTile(m, reg, x, y);
        var esperado = y * tam + x;
        if (!a.tile || a.tile.indexLinear !== esperado || a.tile.x !== x || a.tile.y !== y ||
          a.celula !== a.tile) {                 /* alias tem de ser a MESMA referencia */
          div++; if (amostras.length < 5) amostras.push(x + ',' + y);
        }
      }
      /* consistencia com a expressao do motor: idx do world.js reconstruido aqui */
      var idxW = function (x, y) { return (y | 0) * W.TAM + (x | 0); };
      var divW = 0;
      for (var k = 0; k < 200; k++) {
        var x2 = Math.floor(rnd() * tam), y2 = Math.floor(rnd() * tam);
        if (indiceLinear(x2, y2, tam) !== idxW(x2, y2)) divW++;
      }
      add('T5', 'local(x,y) -> tile.indexLinear consistente e identico a world.js:276', (div === 0 && divW === 0), {
        'amostras': n,
        'divergencias': div,
        'divergencias vs idx do motor': divW,
        'exemplo (12,30)': String(indiceLinear(12, 30, tam))
      }, amostras.length ? ('falhas: ' + amostras.join(' | ')) : 'usada a mesma expressao do motor, nao uma equivalente.');
    })();

    /* ---------- T6 · fronteira INTRA-regiao ---------- */
    (function () {
      var tam = reg.largura;
      var casos = [
        { x: 0, y: 0, dentro: true },
        { x: tam - 1, y: 0, dentro: true },
        { x: 0, y: tam - 1, dentro: true },
        { x: tam - 1, y: tam - 1, dentro: true },
        { x: tam - 0.001, y: 0, dentro: true },
        { x: -1, y: 0, dentro: false },
        { x: 0, y: -1, dentro: false },
        { x: tam, y: 0, dentro: false },
        { x: 0, y: tam, dentro: false },
        { x: 1e9, y: 1e9, dentro: false }
      ];
      var div = 0, linhas = [], i;
      for (i = 0; i < casos.length; i++) {
        var c = casos[i];
        var a = enderecoDeTile(m, reg, c.x, c.y);
        var ok = (a.fora === !c.dentro) && (c.dentro
          ? (a.tile !== null && a.origemLocal !== null && a.deslocamento !== null)
          : (a.tile === null && a.origemLocal === null && a.deslocamento === null));
        if (!ok) div++;
        linhas.push(c.x + ',' + c.y + '=' + (c.dentro ? 'dentro' : 'fora'));
      }
      add('T6', 'fronteira INTRA-regiao · 0..159 dentro, -1/160/1e9 fora sem inventar tile', div === 0, {
        'casos': casos.length,
        'divergencias': div,
        'casos': linhas.join(' ')
      }, 'N/A (item 5 do prompt): fronteira ENTRE regioes nao e testavel — o motor materializa 1 regiao. Ver T12.');
    })();

    /* ---------- T7 · ida-e-volta por string + imunidade ao rotulo ---------- */
    (function () {
      var rnd = lcg(31337);
      var casos = [];
      var i;
      for (i = 0; i < 400; i++) {
        casos.push(enderecoDeTile(m, reg, Math.floor(rnd() * reg.largura), Math.floor(rnd() * reg.altura)));
      }
      casos.push(enderecoDeTile(m, reg, 0, 0));
      casos.push(enderecoDeTile(m, reg, reg.largura - 1, reg.altura - 1));
      casos.push(enderecoDeTile(m, reg, -5, -5));           /* fora: tile null */
      var div = 0, falhas = [];
      for (i = 0; i < casos.length; i++) {
        var s = formatarEndereco(casos[i]);
        var volta = parseEndereco(s);
        var proj = projecao(casos[i]);
        var ok = volta.contrato === proj.contrato &&
          volta.seed === proj.seed &&
          volta.regionIndex === proj.regionIndex &&
          volta.x === proj.x && volta.y === proj.y;
        /* a inversa tem de reconstruir o mesmo indice do endereco original */
        if (ok && casos[i].tile) ok = (volta.indexLinear === casos[i].tile.indexLinear);
        if (!ok) { div++; if (falhas.length < 5) falhas.push(s); }
      }
      /* o rotulo NAO pode influenciar a chave: nomes com acento, pipe e '=' */
      var nomes = ['Ilha Gênesis', 'Regiao|com|pipe', 'Regiao;com;ponto-e-virgula', 'ÁÉÍÓÚ ção', 'x=y'];
      var baseChave = chaveCanonica(enderecoDeTile(m, reg, 80, 80));
      var imune = true, exemploNome = '';
      for (i = 0; i < nomes.length; i++) {
        var a2 = enderecoDeTile(m, reg, 80, 80);
        a2.planeta.rotulo = nomes[i];
        a2.regiao.rotulo = nomes[i];
        if (chaveCanonica(a2) !== baseChave) { imune = false; exemploNome = nomes[i]; }
      }
      add('T7', 'ida-e-volta por string · projecao restaurada e chave imune ao rotulo', (div === 0 && imune), {
        'casos': casos.length,
        'divergencias': div,
        'exemplo': formatarEndereco(casos[0]),
        'chave imune a rotulo com acento/pipe/=': String(imune),
        'rotulo que quebrou': exemploNome || '(nenhum)',
        'campos da projecao': Object.keys(projecao(casos[0])).join(',')
      }, falhas.length ? ('falhas: ' + falhas.join(' | ')) : 'projecao e o conjunto fechado de campos serializaveis. z, lat/lon e rotulo do planeta SAIRAM na 2a.2: z e terreno, lat/lon e georreferencia de regiao (geo.valido=false) e rotulo e texto trocavel.');
    })();

    /* ---------- T8 · precisao numerica ---------- */
    (function () {
      var rnd = lcg(4242);
      var divZ = 0, casosZ = 0, maxDifZ = 0;
      /* posicoes CONTINUAS: tile + deslocamento tem de reconstruir o float exato */
      for (var i = 0; i < 500; i++) {
        var x = rnd() * reg.largura, y = rnd() * reg.altura;
        var a = enderecoDeTile(m, reg, x, y);
        if (!a.tile) continue;
        casosZ++;
        var rx = a.tile.x + a.deslocamento.x, ry = a.tile.y + a.deslocamento.y;
        var d = Math.max(Math.abs(rx - x), Math.abs(ry - y));
        if (d > maxDifZ) maxDifZ = d;
        if (d !== 0) divZ++;
      }
      /* lat/lon: world.js guarda com 2 decimais. Medimos o estrago. */
      var latStr = String(reg.lat), lonStr = String(reg.lon);
      var casasLat = latStr.indexOf('.') >= 0 ? latStr.split('.')[1].length : 0;
      var casasLon = lonStr.indexOf('.') >= 0 ? lonStr.split('.')[1].length : 0;
      var pr = precisaoDeAncoragem(reg, m.planeta.raioKm);
      var okZ = (divZ === 0);
      var okCasas = (casasLat <= LATLON_DECIMAIS && casasLon <= LATLON_DECIMAIS);
      add('T8', 'precisao · tile+deslocamento reconstroi o float exato; lat/lon tem 2 decimais e isso e medido', (okZ && okCasas), {
        'casos posicao continua': casosZ,
        'divergencias': divZ,
        'dif max (tiles)': maxDifZ,
        'casas decimais lat': casasLat,
        'casas decimais lon': casasLon,
        'passo lat/lon (graus)': pr.passoGraus,
        'passo lat/lon (m)': pr.passoMetros.toFixed(1),
        'largura da regiao (m)': pr.larguraRegiaoMetros,
        'angulo real da regiao (graus)': pr.anguloRegiaoGraus.toExponential(4),
        'passos por regiao': pr.razaoPassoPorRegiao.toFixed(3),
        'erro max da ancora (m)': pr.erroMaxMetros.toFixed(1),
        'erro max em regioes': pr.erroMaxEmRegioes.toFixed(3),
        'veredito': pr.veredito
      }, 'ACHADO: a ancora geografica (2 decimais) e MAIS GROSSA que a propria regiao (160 m). Ancoragem por tile no globo NAO e possivel hoje — e isto e declarado.');
    })();

    /* ---------- T9 · polos ---------- */
    if (!T) { na('T9', 'polos', 'terra.js ausente — teste geografico nao executavel'); }
    else {
      (function () {
        var dN = T.dirDeLatLon(90, 0), dS = T.dirDeLatLon(-90, 0);
        var vN = T.latLonDeDir(dN.x, dN.y, dN.z), vS = T.latLonDeDir(dS.x, dS.y, dS.z);
        var compN = T.comp ? T.comp(dN) : Math.sqrt(dN.x * dN.x + dN.y * dN.y + dN.z * dN.z);
        var lons = [];
        for (var i = 0; i < 8; i++) {
          var d = T.dirDeLatLon(90, i * 45);
          var v = T.latLonDeDir(d.x, d.y, d.z);
          lons.push(v.lon.toFixed(6));
        }
        var unicos = {};
        for (var k = 0; k < lons.length; k++) unicos[lons[k]] = 1;
        add('T9', 'polos · +-90 recuperam lat exata; lon no polo e indeterminada (reportada, nao escondida)', (Math.abs(vN.lat - 90) < 1e-12 && Math.abs(vS.lat + 90) < 1e-12 && Math.abs(vN.n - 1) < 1e-15), {
          'dir(+90,0)': dN.x.toExponential(3) + ', ' + dN.y + ', ' + dN.z.toExponential(3),
          '|dir|': String(compN),
          'lat recuperada (+90)': vN.lat,
          'lat recuperada (-90)': vS.lat,
          'lon recuperada no polo (+90)': vN.lon,
          'norma recuperada': vN.n,
          'lon em 8 longitudes no polo': lons.join(' / '),
          'longitudes distintas no polo': Object.keys(unicos).length
        }, 'No polo a longitude NAO e uma funcao de lat/lon: atan2(0,0)=0. A longitude real do polo permanece indeterminada — propriedade da projecao, nao bug. Nenhuma regiao do mundo atual cai no polo.');
      })();
    }

    /* ---------- T10 · dateline +-180 ---------- */
    if (!T) { na('T10', 'dateline', 'terra.js ausente — teste geografico nao executavel'); }
    else {
      (function () {
        var lat = -19.53;
        var d1 = T.dirDeLatLon(lat, 180), d2 = T.dirDeLatLon(lat, -180);
        var dot = d1.x * d2.x + d1.y * d2.y + d1.z * d2.z;
        var v1 = T.latLonDeDir(d1.x, d1.y, d1.z);
        var v2 = T.latLonDeDir(d2.x, d2.y, d2.z);
        var e = T.erroLonGraus(180, -180);
        var eQuase = T.erroLonGraus(179.999, -179.999);
        add('T10', 'dateline +-180 · mesma direcao; erro de longitude fecha em 360 graus', (Math.abs(dot - 1) < 1e-15 && e === 0), {
          '+180 e -180 identicos (dot)': dot,
          'lon recuperada de +180': v1.lon,
          'lon recuperada de -180': v2.lon,
          'erroLonGraus(180, -180)': e,
          'erroLonGraus(179.9999, -179.9999)': T.erroLonGraus(179.9999, -179.9999),
          'erroLonGraus(179.999, -179.999)': eQuase
        }, 'erroLonGraus vem de terra.js — nao foi reimplementado aqui. Aproximar-se da linha por lados opostos da erro pequeno e correto; cruzar continua sendo pulo, nao caminhada.');
      })();
    }

    /* ---------- T11 · ancoragem no globo == Fase 1, bit a bit ---------- */
    if (!T) { na('T11', 'globo', 'terra.js ausente — teste geografico nao executavel'); }
    else {
      (function () {
        var a = ancorarNoGlobo(T, enderecoDaRegiao(m, reg));
        var pF1 = T.posicaoDaRegiao(reg);              /* caminho da Fase 1 */
        var g = a.geo;
        var dx = g.dir[0] - pF1.x, dy = g.dir[1] - pF1.y, dz = g.dir[2] - pF1.z;
        var dif = Math.sqrt(dx * dx + dy * dy + dz * dz);
        var modulo = Math.sqrt(g.dir[0] * g.dir[0] + g.dir[1] * g.dir[1] + g.dir[2] * g.dir[2]);
        var invariante = (g.valido === false && g.nivel === 'regiao' && g.lacunas.length === 4);
        add('T11', 'geo · ancora == T.posicaoDaRegiao (Fase 1) bit a bit, e geo.valido=false', (dif === 0 && invariante), {
          'geo.dir': g.dir[0] + ', ' + g.dir[1] + ', ' + g.dir[2],
          'Fase 1 posicaoDaRegiao': pF1.x + ', ' + pF1.y + ', ' + pF1.z,
          'diferenca': dif,
          '|dir| (deve ser 1)': modulo,
          'T.R': String(T.R),
          'geo.nivel': g.nivel,
          'geo.valido': String(g.valido),
          'lacunas declaradas': g.lacunas.map(function (l) { return l.campo + '=' + l.estado; }).join(' '),
          'fonte declarada': g.fonte
        }, 'Nao existe segunda implementacao de lat/lon neste modulo: a conta e a mesma funcao. Diferenca exata 0, nao apenas pequena. A ancora e de REGIAO e esta marcada invalida.');
      })();
    }

    /* ---------- T12 · multiplas regioes no MOTOR: N/A ---------- */
    na('T12', 'fronteira ENTRE regioes e N regioes coexistindo (itens 5 e 12 do prompt)',
      'N/A NESTA FASE. Motivo: o motor atual nao suporta multiplas regioes simultaneas. ' +
      'm.planeta.regioes tem 1 elemento e m.planeta.regiaoAtiva = 0 (world.js:53-54); ' +
      'gerarRegiao empurra exatamente uma regiao por mundo (world.js:258) e hardcoda ' +
      '`const id = 0` (world.js:62). Nenhuma segunda regiao existe para medir fronteira ' +
      'ou colisao de identidade. NAO foi simulada uma segunda regiao artificial para ' +
      'preencher checklist. O que FOI testado e que o FORMATO suporta N regioes — T13, ' +
      'em ambiente headless, explicitamente marcado como teste do formato e nao do motor.');

    /* ---------- T13 · FORMATO multi-regiao (headless, fixture, NAO e o motor) ---------- */
    (function () {
      /* Fixture minima com a MESMA forma que world.js produz, incluindo o
         `id: 0` hardcoded — que e justamente o que queremos expor. */
      function regFake(nome, lat, lon) {
        return {
          id: 0,                    /* igual ao world.js:62 — sempre 0 */
          nome: nome, idx: 0,
          lat: lat.toFixed(2), lon: lon.toFixed(2),
          largura: TAM_PADRAO, altura: TAM_PADRAO,
          alturaTerreno: new Float32Array(TAM_PADRAO * TAM_PADRAO)
        };
      }
      var rA = regFake('Alfa', -10.00, 20.00);
      var rB = regFake('Beta', 5.00, -60.00);
      var rC = regFake('Gama', 40.00, 170.00);
      var mFake = { planeta: { nome: 'Fixture', raioKm: 6371, regioes: [rA, rB, rC], regiaoAtiva: 0 } };

      var cat = catalogoDeRegioes(mFake);
      var indices = cat.map(function (c) { return c.regionIndex; }).join(',');

      /* (a) sem colisao: mesmo tile (5,5) em 3 regioes => 3 chaves distintas */
      var chaves = [rA, rB, rC].map(function (r) { return chaveCanonica(enderecoDeTile(mFake, r, 5, 5)); });
      var distintasG = {};
      chaves.forEach(function (k) { distintasG[k] = 1; });
      var semColisao = Object.keys(distintasG).length === 3;

      /* (b) o `id` hardcoded NAO discrimina: id identico nas 3 */
      var ids = cat.map(function (c) { return String(c.idInterno); });
      var idUnico = {};
      ids.forEach(function (v) { idUnico[v] = 1; });
      var idColide = Object.keys(idUnico).length === 1;

      /* (c) reordenar a colecao: a MESMA regiao fisica muda de endereco.
             Isto DEMONSTRA a nao-estabilidade de regionIndex, em vez de
             apenas afirmar em prosa que ele e instavel. */
      var antes = chaveCanonica(enderecoDeTile(mFake, rA, 5, 5));
      mFake.planeta.regioes = [rB, rC, rA];       /* rA saiu do indice 0 -> 2 */
      var apos = chaveCanonica(enderecoDeTile(mFake, rA, 5, 5));
      var instavel = (antes !== apos);

      /* (d) ida-e-volta sobrevive a N regioes */
      var divVolta = 0;
      [rA, rB, rC].forEach(function (r) {
        for (var x = 0; x < 3; x++) {
          for (var y = 0; y < 3; y++) {
            var a = enderecoDeTile(mFake, r, x * 50, y * 50);
            var p = projecao(a), v = parseEndereco(formatarEndereco(a));
            if (v.seed !== p.seed || v.regionIndex !== p.regionIndex ||
              v.x !== p.x || v.y !== p.y) divVolta++;
          }
        }
      });

      /* (e) regiao fora da colecao => regionIndex -1 e identidade desconhecida */
      var rOrfa = regFake('Orfa', 0, 0);
      var aOrfa = enderecoDaRegiao(mFake, rOrfa);

      /* (f) RECUSA HONESTA: com N regioes nao ha identidade persistente real,
             entao a chave logica NAO e emitida. Nada de UUID, nada de indice
             promovido a identidade. */
      var dRecusa = descreverChaveLogica(enderecoDeTile(mFake, rB, 5, 5));
      var recusou = (dRecusa.chave === null && dRecusa.emitida === false &&
        typeof dRecusa.motivo === 'string' && dRecusa.motivo.length > 40);

      var ok = semColisao && idColide && instavel && divVolta === 0 && aOrfa.regiao.regionIndex === -1 &&
        aOrfa.regiao.identidade.tipo === 'desconhecida' && recusou;
      add('T13', 'FORMATO multi-regiao (headless) · instabilidade demonstrada, orfa = -1, chave logica RECUSADA', ok, {
        'chave logica com 3 regioes': String(dRecusa.chave),
        'recusa declarada': String(recusou),
        'motivo da recusa': dRecusa.motivo,
        'ATENCAO': 'testa o FORMATO, nao o motor',
        'indices do catalogo': indices,
        'chaves distintas p/ tile (5,5) em 3 regioes': Object.keys(distintasG).length,
        'reg.id hardcoded colide nas 3': String(idColide),
        'ids observados': ids.join(','),
        'endereco de Alfa ANTES da reordenacao': antes,
        'endereco de Alfa DEPOIS da reordenacao': apos,
        'regionIndex instavel (demonstrado)': String(instavel),
        'divergencias ida-e-volta (27 casos)': divVolta,
        'regiao orfa regionIndex': aOrfa.regiao.regionIndex,
        'regiao orfa identidade.tipo': aOrfa.regiao.identidade.tipo,
        'totalRegioes': cat.length
      }, 'A reordenacao troca o endereco da MESMA regiao fisica: e a prova empirica de que regionIndex nao pode ser chave de persistencia. A regiao orfa recebe -1 e identidade desconhecida, em vez de um indice inventado.');
    })();

    /* ---------- T14 · doutrina: nenhum indice vira identidade ---------- */
    (function () {
      var a = enderecoDaRegiao(m, reg);
      var temRegiaoId = Object.prototype.hasOwnProperty.call(a.regiao, 'regiaoId') ||
        Object.prototype.hasOwnProperty.call(a, 'regiaoId');
      var temPlanetaId = Object.prototype.hasOwnProperty.call(a.planeta, 'planetaId');
      var autoridadeFalsa = a.regiao.identidade.autoridade === false && a.planeta.identidade.autoridade === false;
      var persistenciaProibida = a.regiao.identidade.persistencia === 'proibida';
      var campoDerivadoNomeado = a.regiao.identidade.campoDerivado === 'regionIndex';
      var notaPresente = typeof a.notaIdentidade === 'string' && a.notaIdentidade.length > 40;
      var esquemaDeclara = ESQUEMA.regiao.campos.regionIndex.natureza === 'indice';
      var ok = !temRegiaoId && !temPlanetaId && autoridadeFalsa && persistenciaProibida &&
        campoDerivadoNomeado && notaPresente && esquemaDeclara;
      add('T14', 'doutrina · nenhum indice tratado como identidade; nenhum id artificial criado', ok, {
        'campo regiaoId existe?': String(temRegiaoId),
        'campo planetaId existe?': String(temPlanetaId),
        'identidade.autoridade (planeta/regiao)': a.planeta.identidade.autoridade + ' / ' + a.regiao.identidade.autoridade,
        'identidade.persistencia': a.regiao.identidade.persistencia,
        'campoDerivado declarado': a.regiao.identidade.campoDerivado,
        'esquema declara regionIndex como': ESQUEMA.regiao.campos.regionIndex.natureza,
        'notaIdentidade presente': String(notaPresente),
        'id artificial inventado': 'nao'
      }, 'Preferido `regionIndex` a `regiaoId` porque o valor E literalmente o indice da colecao. `regiaoId` foi deliberadamente OMITIDO: manter um nome que sugere identidade era o risco a evitar.');
    })();

    /* ---------- T15 · PRNG do teste + estabilidade bit a bit em serie ---------- */
    (function () {
      var r1 = lcg(12345), r2 = lcg(12345);
      var iguais = true;
      for (var i = 0; i < 2000; i++) { if (r1() !== r2()) { iguais = false; break; } }
      var a = enderecoDaRegiao(m, reg);
      var base = chaveCanonica(a);
      var div = 0;
      for (var k = 0; k < 2000; k++) { if (chaveCanonica(enderecoDaRegiao(m, reg)) !== base) { div++; break; } }
      add('T15', 'determinismo de serie · PRNG do teste e chave canonica estaveis em 2000 iteracoes', (iguais && div === 0), {
        'iteracoes PRNG': 2000,
        'PRNG identico': String(iguais),
        'iteracoes chave': 2000,
        'divergencias': div
      }, 'o PRNG e local ao teste e nao toca o rng do mundo (m.rng permanece intocado).');
    })();

    /* ---------- T16 · entidades reais do motor ---------- */
    (function () {
      var casos = [];
      if (m.npcs && m.npcs.length) casos.push({ t: 'npc', e: m.npcs[0] });
      if (m.aguas && m.aguas.length) casos.push({ t: 'agua', e: m.aguas[0] });
      if (m.plantas && m.plantas.length) casos.push({ t: 'planta', e: m.plantas[0] });
      if (m.animais && m.animais.length) casos.push({ t: 'animal', e: m.animais[0] });
      var div = 0, linhas = [];
      for (var i = 0; i < casos.length; i++) {
        var a = enderecoDeEntidade(m, reg, casos[i].e);
        var p = casos[i].e.pos;
        var ok = a.alvo.classe && a.local.x === p.x && a.local.y === p.y &&
          (a.tile !== null || (p.x < 0 || p.y < 0 || p.x >= reg.largura || p.y >= reg.altura)) &&
          a.local.espaco === ESPACO_LOCAL;
        /* tile + deslocamento reconstroi a posicao continua da entidade, sem perda */
        if (ok && a.tile) {
          ok = (a.tile.x + a.deslocamento.x === p.x) && (a.tile.y + a.deslocamento.y === p.y);
        }
        if (!ok) div++;
        linhas.push(casos[i].t + ' ' + a.alvo.id + ' @ (' + a.local.x + ',' + a.local.y +
          ') tile ' + (a.tile ? a.tile.indexLinear : '-') + ' origem (' +
          (a.origemLocal ? a.origemLocal.x + ',' + a.origemLocal.y : '-') + ')');
      }
      add('T16', 'entidades reais (npc/agua/planta/animal) endereçadas no mesmo espaco local', (casos.length > 0 && div === 0), {
        'entidades endereçadas': casos.length,
        'divergencias': div,
        'casos': linhas.join(' | '),
        'espaco': ESPACO_LOCAL,
        'unidade': UNIDADE_LOCAL
      }, 'local.x/local.y vem de ent.pos — posicoes continuas do motor, nao indices. tile + deslocamento reconstroi o float. O z da entidade fica em alvo.z, fora do endereco.');
    })();

    /* ---------- T17 · inversa exata tile <-> indexLinear ---------- */
    (function () {
      var tam = reg.largura;
      var pontos = [[0, 0], [159, 0], [0, 159], [159, 159], [80, 80], [123, 40]];
      var div = 0, linhas = [], i, x, y;
      for (i = 0; i < pontos.length; i++) {
        x = pontos[i][0]; y = pontos[i][1];
        var idx = indiceDeTile(x, y, tam);
        var volta = tileDeIndice(idx, tam);
        var ok = (idx === y * tam + x) && volta && volta.x === x && volta.y === y &&
          volta.indexLinear === idx;
        if (!ok) div++;
        linhas.push('(' + x + ',' + y + ')->' + idx + '->(' + (volta ? volta.x + ',' + volta.y : 'null') + ')');
      }
      /* toda a borda: 4 lados completos */
      var divBorda = 0;
      for (i = 0; i < tam; i++) {
        var borda = [[i, 0], [i, tam - 1], [0, i], [tam - 1, i]];
        for (var b = 0; b < borda.length; b++) {
          var ix = indiceDeTile(borda[b][0], borda[b][1], tam);
          var v = tileDeIndice(ix, tam);
          if (!v || v.x !== borda[b][0] || v.y !== borda[b][1]) divBorda++;
        }
      }
      /* varredura completa da grade: 25600 ida-e-voltas */
      var divTudo = 0;
      for (i = 0; i < tam * tam; i++) {
        var t = tileDeIndice(i, tam);
        if (!t || indiceDeTile(t.x, t.y, tam) !== i) divTudo++;
      }
      add('T17', 'inversa exata · tile -> indexLinear -> tile em toda a grade (25600)', (div === 0 && divBorda === 0 && divTudo === 0), {
        'pontos do contrato': linhas.join(' '),
        'divergencias nos pontos': div,
        'divergencias na borda (640 casos)': divBorda,
        'divergencias na grade inteira': divTudo,
        'total de indices': tam * tam,
        'formula': 'x = i % tam ; y = floor(i / tam)'
      }, 'inversao verificada exaustivamente, nao por amostragem.');
    })();

    /* ---------- T18 · rejeicao de fora da grade, nos DOIS sentidos ---------- */
    (function () {
      var tam = reg.largura;
      var coords = [[-1, 0], [160, 0], [0, -1], [0, 160], [NaN, 0], [0, NaN],
        [Infinity, 0], [-0.0001, 0], [1e9, 1e9]];
      var indices = [-1, 25600, 25601, NaN, Infinity, -0.5, 12880.5, 1e9];
      var divC = 0, divI = 0, linhasC = [], linhasI = [], i;
      for (i = 0; i < coords.length; i++) {
        var r1 = indiceDeTile(coords[i][0], coords[i][1], tam);
        var a1 = enderecoDeTile(m, reg, coords[i][0], coords[i][1]);
        var okC = (r1 === null) && a1.fora === true && a1.tile === null &&
          a1.origemLocal === null && a1.deslocamento === null;
        if (!okC) divC++;
        linhasC.push('(' + coords[i][0] + ',' + coords[i][1] + ')=' + String(r1));
      }
      for (i = 0; i < indices.length; i++) {
        var r2 = tileDeIndice(indices[i], tam);
        if (r2 !== null) divI++;
        linhasI.push(indices[i] + '=' + (r2 === null ? 'null' : 'ACEITOU'));
      }
      /* e os limites validos continuam validos */
      var limitesOk = indiceDeTile(0, 0, tam) === 0 &&
        indiceDeTile(159, 159, tam) === 25599 &&
        tileDeIndice(0, tam) !== null && tileDeIndice(25599, tam) !== null;
      add('T18', 'rejeicao · coordenadas e indices fora da grade devolvem null, limites 0 e 25599 valem', (divC === 0 && divI === 0 && limitesOk), {
        'coordenadas testadas': linhasC.join(' '),
        'divergencias coordenadas': divC,
        'indices testados': linhasI.join(' '),
        'divergencias indices': divI,
        'limites validos (0 e 25599)': String(limitesOk),
        'indiceLinear CRUA (sem validacao) em (-1,0)': String(indiceLinear(-1, 0, tam))
      }, 'indiceLinear continua crua de proposito (espelha world.js:276 inclusive no lixo). Quem valida e indiceDeTile.');
    })();

    /* ---------- T19 · picking puro: tileDePixel ---------- */
    (function () {
      var tam = reg.largura;
      /* retangulo com offset FRACIONARIO, que foi o caso real que quebrou o
         picking no browser (left = 910.390625, 168 px para 160 tiles) */
      var rects = [
        { left: 910.390625, top: 486.5, width: 168, height: 168, rotulo: '168px offset fracionario (caso real do bug)' },
        { left: 0, top: 0, width: 160, height: 160, rotulo: '160px alinhado' },
        { left: 12, top: 40, width: 320, height: 320, rotulo: '320px alinhado' },
        { left: 7.5, top: 3.25, width: 201, height: 201, rotulo: '201px offset fracionario' }
      ];
      var alvos = [[0, 0], [159, 0], [0, 159], [159, 159], [80, 80], [123, 40]];
      var div = 0, linhas = [], i, j;
      for (i = 0; i < rects.length; i++) {
        var falhasR = 0;
        for (j = 0; j < alvos.length; j++) {
          var centro = pixelDoTile(alvos[j][0], alvos[j][1], rects[i], tam);
          /* MouseEvent.clientX chega TRUNCADO: e isto que o teste simula */
          var t = tileDePixel(Math.floor(centro.px), Math.floor(centro.py), rects[i], tam);
          if (!t || t.x !== alvos[j][0] || t.y !== alvos[j][1]) { falhasR++; div++; }
        }
        linhas.push(rects[i].rotulo + ': ' + (alvos.length - falhasR) + '/' + alvos.length);
      }
      /* varredura: TODO tile alcancavel pelo pixel inteiro do seu centro */
      var rect = rects[0], divTudo = 0;
      for (i = 0; i < tam; i++) {
        var c = pixelDoTile(i, i, rect, tam);
        var tt = tileDePixel(Math.floor(c.px), Math.floor(c.py), rect, tam);
        if (!tt || tt.x !== i || tt.y !== i) divTudo++;
      }
      /* fora do retangulo: null, nao clamp silencioso */
      var foraOk = tileDePixel(rect.left - 5, rect.top + 5, rect, tam) === null &&
        tileDePixel(rect.left + rect.width + 1, rect.top + 5, rect, tam) === null &&
        tileDePixel(rect.left + 5, rect.top - 1, rect, tam) === null;
      /* determinismo: mesma entrada, mesma saida, 1000 vezes */
      var det = true, ref = JSON.stringify(tileDePixel(1000, 520, rect, tam));
      for (i = 0; i < 1000; i++) { if (JSON.stringify(tileDePixel(1000, 520, rect, tam)) !== ref) { det = false; break; } }
      add('T19', 'picking puro · tileDePixel acerta o centro geometrico em 4 retangulos, sem DOM', (div === 0 && divTudo === 0 && foraOk && det), {
        'retangulos': linhas.join(' | '),
        'divergencias': div,
        'diagonal completa (160 tiles, rect fracionario)': divTudo,
        'clique fora devolve null': String(foraOk),
        'determinismo em 1000 chamadas': String(det),
        'convencao': 'coordenada inteira = indice de pixel, recebe +0,5 (centro do pixel)'
      }, 'o erro sistematico de -1 tile vinha de tratar clientX truncado como posicao exata. Corrigido pela convencao do centro do pixel, nao por mudar o tamanho do canvas.');
    })();

    /* ---------- T20 · endereco sobrevive a save/load ---------- */
    (function () {
      var s = JSON.parse(JSON.stringify(W.seriar(m)));
      var m2 = W.desserializar(s);
      var reg2 = W.regiaoAtiva(m2);
      var pontos = [[0, 0], [159, 0], [0, 159], [159, 159], [80, 80], [123, 40]];
      var div = 0, divChave = 0, linhas = [], i;
      for (i = 0; i < pontos.length; i++) {
        var a1 = enderecoDeTile(m, reg, pontos[i][0], pontos[i][1]);
        var a2 = enderecoDeTile(m2, reg2, pontos[i][0], pontos[i][1]);
        if (chaveCanonica(a1) !== chaveCanonica(a2)) div++;
        if (chaveLogica(a1) !== chaveLogica(a2)) divChave++;
      }
      /* e a altura, que e terreno, REALMENTE mudou: e por isso que ela saiu do endereco */
      var zAntes = alturaNoEndereco(reg, enderecoDeTile(m, reg, 80, 80)).z;
      var zDepois = alturaNoEndereco(reg2, enderecoDeTile(m2, reg2, 80, 80)).z;
      var zMudou = (zAntes !== zDepois);
      linhas.push('z antes ' + zAntes + ' / z depois ' + zDepois);
      add('T20', 'save/load · endereco e chave logica identicos apesar de a altura mudar', (div === 0 && divChave === 0), {
        'pontos': pontos.length,
        'divergencias chave canonica': div,
        'divergencias chave logica': divChave,
        'chave antes': chaveLogica(enderecoDeTile(m, reg, 80, 80)),
        'chave depois': chaveLogica(enderecoDeTile(m2, reg2, 80, 80)),
        'altura mudou no save/load?': String(zMudou),
        'alturas': linhas.join(' ')
      }, 'seriar arredonda alturaTerreno para 2 casas (world.js:2425). Na versao 2a.1 isso quebrava a chave. Com z fora do endereco, o endereco sobrevive e a perda fica confinada a leitura de terreno.');
    })();

    /* ---------- T21 · chave logica enraizada na seed ---------- */
    (function () {
      var a = enderecoDeTile(m, reg, 80, 80);
      var d = descreverChaveLogica(a);
      var esperada = 'G2A:' + m.seed + '/r0/t12880';
      var mesmaSeed = W.criar({ seed: seed });
      var b = enderecoDeTile(mesmaSeed, W.regiaoAtiva(mesmaSeed), 80, 80);
      var outraSeed = W.criar({ seed: seed + 1 });
      var c = enderecoDeTile(outraSeed, W.regiaoAtiva(outraSeed), 80, 80);
      var ok = d.chave === esperada && d.emitida === true && d.autoridade === false &&
        chaveLogica(b) === d.chave && chaveLogica(c) !== d.chave &&
        d.raiz === 'seed';
      add('T21', 'chave logica · enraizada na seed, deterministica, sem autoridade', ok, {
        'chave': String(d.chave),
        'esperada': esperada,
        'raiz': d.raiz,
        'autoridade': String(d.autoridade),
        'mesma seed => mesma chave': String(chaveLogica(b) === d.chave),
        'outra seed => outra chave': String(chaveLogica(c) !== d.chave),
        'chave com outra seed': String(chaveLogica(c)),
        'persistencia': d.persistencia
      }, 'seed e a unica raiz estavel E persistida do motor (seriar grava m.seed). regionIndex entra como coordenada, nunca como identidade. Com N>1 regioes a chave e recusada — ver T13.');
    })();

    /* ---------- T22 · estrutural · nenhuma transformacao falsa tile -> lat/lon ---------- */
    (function () {
      var api = MODULO;
      var proibidos = ['geoDoTile', 'latLonDeTile', 'tileParaLatLon', 'latLonParaTile',
        'tileDeLatLon', 'geoDeTile', 'coordenadaDoTile', 'posicaoDoTile'];
      var achados = [];
      for (var i = 0; i < proibidos.length; i++) {
        if (api && typeof api[proibidos[i]] !== 'undefined') achados.push(proibidos[i]);
      }
      var a = enderecoDeTile(m, reg, 80, 80);
      var g = null, invariante = true;
      if (T) {
        a = ancorarNoGlobo(T, a);
        g = a.geo;
        invariante = g.valido === false && g.nivel === 'regiao' &&
          g.convencaoDeAncora === 'indefinida' && g.orientacao === null &&
          g.raioDeReferencia === 'nao_declarado' && g.lacunas.length === 4;
      } else {
        g = { valido: false, nivel: '(terra.js ausente)', convencaoDeAncora: 'indefinida',
          orientacao: null, raioDeReferencia: 'nao_declarado', lacunas: LACUNAS_GEO };
      }
      /* o endereco de um TILE nao pode conter lat/lon em nivel de tile */
      var tileLimpo = a.tile && !('lat' in a.tile) && !('lon' in a.tile) &&
        !('lat' in a.origemLocal) && !('lon' in a.origemLocal);
      /* e a serializacao tambem nao carrega lat/lon */
      var strLimpa = formatarEndereco(a).indexOf('lat=') < 0 && formatarEndereco(a).indexOf('lon=') < 0;
      var ok = achados.length === 0 && invariante && tileLimpo && strLimpa;
      add('T22', 'estrutural · nenhuma transformacao tile -> lat/lon existe ou e sugerida', ok, {
        'funcoes proibidas encontradas': achados.length ? achados.join(',') : '(nenhuma)',
        'geo.valido': String(g.valido),
        'geo.nivel': g.nivel,
        'geo.convencaoDeAncora': g.convencaoDeAncora,
        'geo.orientacao': String(g.orientacao),
        'geo.raioDeReferencia': g.raioDeReferencia,
        'lacunas declaradas': g.lacunas.length,
        'tile sem lat/lon': String(tileLimpo),
        'string do endereco sem lat/lon': String(strLimpa),
        'endereco serializado': formatarEndereco(a)
      }, 'a ausencia e estrutural: nao existe funcao, nao existe campo no tile e nao existe chave na string. Nao e "ainda nao fizemos".');
    })();

    /* ---------- T23 · estrutural · sem Date.now e sem Math.random no endereco ---------- */
    (function () {
      var dnOrig = Date.now, mrOrig = Math.random;
      var chamouDn = 0, chamouMr = 0;
      Date.now = function () { chamouDn++; return dnOrig.call(Date); };
      Math.random = function () { chamouMr++; return mrOrig.call(Math); };
      var erro = null;
      try {
        var rnd = lcg(555);
        for (var i = 0; i < 300; i++) {
          var x = Math.floor(rnd() * reg.largura), y = Math.floor(rnd() * reg.altura);
          var a = enderecoDeTile(m, reg, x, y);
          chaveCanonica(a); chaveLogica(a); parseEndereco(formatarEndereco(a));
          tileDeIndice(a.tile.indexLinear, reg.largura);
          tileDePixel(100, 100, { left: 0, top: 0, width: 168, height: 168 }, reg.largura);
          if (T) ancorarNoGlobo(T, a);
        }
      } catch (e) { erro = e.message; }
      Date.now = dnOrig; Math.random = mrOrig;
      add('T23', 'determinismo estrutural · derivar endereco nao chama Date.now nem Math.random', (chamouDn === 0 && chamouMr === 0 && !erro), {
        'enderecos derivados': 300,
        'chamadas a Date.now': chamouDn,
        'chamadas a Math.random': chamouMr,
        'erro': erro || '(nenhum)'
      }, 'medido por interceptacao real das duas funcoes globais durante a derivacao, nao por leitura do fonte.');
    })();

    return out;
  }

  /* ==========================================================================
     8. BENCHMARK — resolucao de enderecos em 1k / 10k / 100k
     ========================================================================== */
  function criarBenchmark(cfg) {
    cfg = cfg || {};
    var T = cfg.T || GLOBAL.GenesisF1 || null;
    var W = cfg.W || GLOBAL.GenesisWorld || null;

    function medir(escalas) {
      escalas = escalas || [1000, 10000, 100000];
      if (!W || typeof W.criar !== 'function') {
        throw new Error('criarBenchmark: GenesisWorld ausente');
      }
      /* Sem seed explícita world.js usa Math.random() (world.js:44) e o
         benchmark deixa de ser reproduzível. Default: seed canônica. */
      var seed = (cfg.seed !== undefined) ? cfg.seed
        : (T && T.SEED_CANONICA !== undefined) ? T.SEED_CANONICA : 20260101;
      var m = W.criar({ seed: seed });
      var reg = W.regiaoAtiva(m);
      var resultado = { escalas: [], total: {} };

      for (var s = 0; s < escalas.length; s++) {
        var n = escalas[s];
        var rnd = lcg(9781 + n);
        /* tiles gerados antes da medicao para nao cobrar o custo do PRNG */
        var xs = new Float64Array(n), ys = new Float64Array(n);
        for (var i = 0; i < n; i++) {
          xs[i] = Math.floor(rnd() * reg.largura);
          ys[i] = Math.floor(rnd() * reg.altura);
        }

        /* 1) endereco puro (objeto completo, sem geometria) */
        var t0 = agora();
        var acc = 0;
        for (var a1 = 0; a1 < n; a1++) {
          var ea = enderecoDeTile(m, reg, xs[a1], ys[a1]);
          acc += ea.celula ? ea.celula.indiceLinear : 0;
        }
        var msEnd = agora() - t0;

        /* 2) endereco + ancoragem no globo (reusa terra.js) */
        var msGlobo = null;
        if (T) {
          var t1 = agora();
          for (var a2 = 0; a2 < n; a2++) {
            var eb = ancorarNoGlobo(T, enderecoDeTile(m, reg, xs[a2], ys[a2]));
            acc += eb.globo ? 1 : 0;
          }
          msGlobo = agora() - t1;
        }

        /* 3) ida-e-volta por string */
        var t2 = agora();
        for (var a3 = 0; a3 < n; a3++) {
          var ec = enderecoDeTile(m, reg, xs[a3], ys[a3]);
          acc += parseEndereco(formatarEndereco(ec)).regionIndex;
        }
        var msVolta = agora() - t2;

        resultado.escalas.push({
          n: n,
          msEndereco: msEnd, nsPorEndereco: (msEnd * 1e6) / n,
          msGlobo: msGlobo, nsPorGlobo: (msGlobo === null) ? null : (msGlobo * 1e6) / n,
          msIdaVolta: msVolta, nsPorIdaVolta: (msVolta * 1e6) / n,
          checksum: acc
        });
      }
      return resultado;
    }

    return { medir: medir };
  }

  /* ==========================================================================
     9. EXPORTAÇÃO
     ========================================================================== */
  var MODULO = {
    /* meta */
    VERSAO: VERSAO, CONTRATO: CONTRATO, PREFIXO: PREFIXO, PREFIXO_LOGICO: PREFIXO_LOGICO,
    ESPACO_LOCAL: ESPACO_LOCAL, UNIDADE_LOCAL: UNIDADE_LOCAL,
    ESPACO_LOCAL_ORIGEM: ESPACO_LOCAL_ORIGEM,
    TAM_PADRAO: TAM_PADRAO, TILE_METROS: TILE_METROS,
    ALTURA_FORA: ALTURA_FORA, LATLON_DECIMAIS: LATLON_DECIMAIS,

    /* doutrina, em forma de dado */
    ESQUEMA: ESQUEMA,
    IDENTIDADE_PLANETA: IDENTIDADE_PLANETA,
    MOTIVO_SUBREGIAO: MOTIVO_SUBREGIAO,
    NOTA_NAO_IDENTIDADE: NOTA_NAO_IDENTIDADE,
    LACUNAS_GEO: LACUNAS_GEO,
    MOTIVO_GEO_INVALIDA: MOTIVO_GEO_INVALIDA,
    identidadeDeIndice: identidadeDeIndice,

    /* camada pura */
    tamDe: tamDe,
    tileValido: tileValido,
    indiceLinear: indiceLinear,          /* crua, sem validacao — espelha world.js:276 */
    indiceDeTile: indiceDeTile,          /* validada */
    tileDeIndice: tileDeIndice,          /* inversa exata */
    tileDePixel: tileDePixel,            /* picking puro, sem DOM */
    pixelDoTile: pixelDoTile,
    rotuloDoPlaneta: rotuloDoPlaneta,
    lerLatLon: lerLatLon,
    indiceDeRegiao: indiceDeRegiao,
    regiaoPorIndice: regiaoPorIndice,
    catalogoDeRegioes: catalogoDeRegioes,
    alturaDoTerreno: alturaDoTerreno,
    alturaNoEndereco: alturaNoEndereco,   /* LEITURA DE TERRENO, nao componente do endereco */
    enderecoDaRegiao: enderecoDaRegiao,
    enderecoDeTile: enderecoDeTile,
    enderecoDeEntidade: enderecoDeEntidade,

    /* camada geográfica — T (terra.js) sempre por parâmetro */
    ancorarNoGlobo: ancorarNoGlobo,
    paraGlobo: paraGlobo,
    paraLatLonDeDir: paraLatLonDeDir,
    enderecoCompleto: enderecoCompleto,
    precisaoDeAncoragem: precisaoDeAncoragem,

    /* ancoragem por TILE — contrato 2a.3 (Rota A: âncora derivada) */
    CONTRATO_ANTERIOR: CONTRATO_ANTERIOR,
    CONVENCAO_ANCORA: CONVENCAO_ANCORA,
    RESOLUCAO_LOCAL_METROS: RESOLUCAO_LOCAL_METROS,
    quantizarLocal: quantizarLocal,
    ORIENTACAO_DA_GRADE: ORIENTACAO_DA_GRADE,
    GEO_2A3: GEO_2A3,
    raioMetros: raioMetros,
    frameEmDir: frameEmDir,
    dirDeslocada: dirDeslocada,
    deslocamentoEntre: deslocamentoEntre,
    frameDaRegiao: frameDaRegiao,
    deslocamentoNoFrame: deslocamentoNoFrame,
    localDoDeslocamento: localDoDeslocamento,
    globoDoEndereco: globoDoEndereco,
    localDoGlobo: localDoGlobo,
    centrosDasRegioes: centrosDasRegioes,
    regiaoMaisProxima: regiaoMaisProxima,
    enderecoDeGlobo: enderecoDeGlobo,
    medirIdaEVolta: medirIdaEVolta,

    /* serialização */
    projecao: projecao,
    formatarEndereco: formatarEndereco,
    parseEndereco: parseEndereco,
    chaveCanonica: chaveCanonica,
    chaveLogica: chaveLogica,
    descreverChaveLogica: descreverChaveLogica,

    /* comparação */
    mesmaRegiao: mesmaRegiao,
    mesmoTile: mesmoTile,
    mesmaCelula: mesmaCelula,
    distanciaTiles: distanciaTiles,

    /* util de teste */
    lcg: lcg,
    igualProfundo: igualProfundo,

    /* execução */
    rodarTestes: rodarTestes,
    criarBenchmark: criarBenchmark
  };

  return MODULO;
});
