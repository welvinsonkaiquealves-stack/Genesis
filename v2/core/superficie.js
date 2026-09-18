/* ============================================================================
   GÊNESIS v2 — CAMADA SUPERFÍCIE
   genesis/v2/core/superficie.js          contrato  genesis.superficie/1

   PAPEL DESTE ARQUIVO
   -------------------
   Tornar o planeta um ESPAÇO CONTÍNUO E CONSULTÁVEL, de 12.742 km de
   diâmetro até 1 metro de chão, sem nenhum vazio no meio.

   Esta é a camada que faltava. O globo da Fase 1 é um casco: ele sabe onde a
   região está e não sabe o que existe entre uma coisa e outra. O ambiente
   (v2/core/ambiente.js) simula o planeta em células de 1 grau e a região em
   tiles de 1 metro, e entre 1 grau e 160 metros não havia nada. É esse buraco,
   e só ele, que fazia o zoom mostrar azul.

   A REGRA QUE ORGANIZA TUDO
   -------------------------
       Nenhum nível de zoom tem dado próprio.
       Um nível mais fundo ACRESCENTA detalhe; nunca CORRIGE o de cima.

   Na prática isso quer dizer que a elevação é UMA função contínua e o nível de
   detalhe é apenas quantas oitavas dela foram somadas. A silhueta que se vê do
   espaço é a mesma que continua ali ao pousar, porque ela é o primeiro termo
   da soma. É isto, e não um truque de transição, que elimina o "pop".

   AUTORIDADE — quem manda em quê (a parte que impede a segunda fonte de verdade)
   -----------------------------------------------------------------------------
     DENTRO da região canônica        world.js manda. Lemos alturaTerreno,
                                      tipo, umidade, fertilidade, temperatura.
                                      NÃO recalculamos nada disso.
     NA FAIXA de transição            mistura declarada, monótona e suave,
                                      entre o terreno real e o mar aberto.
     FORA                             este arquivo manda, derivando tudo do
                                      campo planetário de ambiente.js mais
                                      oitavas determinísticas da mesma seed.

   E há uma exceção, registrada e não escondida: a célula planetária da ilha
   carrega um MARCADOR de +15 m para a ilha não sumir do mapa de 1 grau. Isso é
   escala de mapa, não batimetria. A superfície lê o valor ORIGINAL que
   ambiente.js guardou em P.ancoraOriginais. O mapa lê o marcado, a superfície
   lê o original, e ambos vêm do mesmo objeto. Uma fonte, duas leituras
   declaradas — não duas verdades.

   CLASSIFICADOR DE BIOMA
   ----------------------
   Fora da região é preciso dizer que bioma existe num ponto. NÃO foi criada
   taxonomia paralela: o classificador aqui é um ESPELHO das linhas 171-190 do
   world.js, com os mesmos limiares, sobre os mesmos nomes de D.BIOMAS. O
   teste S5 prova o espelho reproduzindo `reg.tipo` tile a tile nos 25.600
   tiles da região. Se um dia divergir, é defeito deste arquivo, e o teste cai.

   O QUE ESTE ARQUIVO NÃO FAZ
   --------------------------
   Não escreve na simulação. Não cria NPC, animal, cérebro nem cultura. Não
   guarda estado próprio de mundo. Não usa Math.random em lugar nenhum. Não
   toca em arquivo de LEI. Não conhece a tela: devolve números, e quem pinta é
   a página.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./util.js'), require('./data.js'));
  } else {
    root.GenesisSuperficie = factory(root.GenesisUtil, root.GenesisData);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (U, D) {
  'use strict';

  var VERSAO = 'superficie-1.0';
  var CONTRATO = 'genesis.superficie/1';

  var RAD = Math.PI / 180;
  var DEG = 180 / Math.PI;
  var NIVEL_MAR = 0;          /* world.js:35 */
  var LAPSE = 0.0065;         /* C por metro — ambiente.js */

  /* --------------------------------------------------------------------------
     A ESCADA DE LOD — faixas explícitas, em METROS ATRAVESSADOS PELA TELA.

     `metrosNaTela` é a única variável de zoom. Tudo deriva dela: qual
     renderizador desenha, quantas oitavas de detalhe entram, se a região
     canônica já é visível.

     A banda de cruzamento existe para que NUNCA haja um quadro vazio: dentro
     dela os dois renderizadores desenham ao mesmo tempo e a opacidade cruza.
     O nível seguinte fica pronto ANTES de o atual sair de cena porque ambos
     estão em cena ao mesmo tempo durante toda a banda.
     -------------------------------------------------------------------------- */
  var NIVEIS = [
    { id: 'L0', nome: 'Globo',   min: 4.0e6, max: Infinity, render: 'globo3d',
      ve: 'oceanos, continentes, calotas' },
    { id: 'L1', nome: 'Orbita',  min: 4.0e5, max: 4.0e6, render: 'globo3d',
      ve: 'linha de costa, cordilheira, bioma macro' },
    { id: 'L2', nome: 'Regiao',  min: 1.0e3, max: 4.0e5, render: 'canvas2d',
      ve: 'terreno, rio, praia, relevo' },
    { id: 'L3', nome: 'Chao',    min: 1.0e1, max: 1.0e3, render: 'canvas2d',
      ve: 'tile, solo, pedra, objeto, sombra' },
    { id: 'L4', nome: 'Celula',  min: 0,     max: 1.0e1, render: 'canvas2d',
      ve: 'microestrutura, material, grao' }
  ];

  /* Banda em que globo 3D e superfície 2D coexistem. Escolhida para durar
     cerca de dois passos de zoom inteiros, tempo de sobra para o cruzamento. */
  /* A câmera do globo da Fase 1 só chega a CAM_MIN = 1,06 raios, o que
     equivale a cerca de 317 km de largura de tela. A banda de cruzamento tem
     de terminar ACIMA disso, senão o globo ficaria preso no batente enquanto
     a superfície ainda não assumiu — e é exatamente aí que apareceria um
     quadro errado. Por isso 1200 km a 400 km, e não 400 km a 100 km. */
  var CRUZAMENTO_ALTO = 1.2e6;    /* acima disto: só o globo */
  var CRUZAMENTO_BAIXO = 4.0e5;   /* abaixo disto: só a superfície */

  function nivelDoZoom(metrosNaTela) {
    for (var i = 0; i < NIVEIS.length; i++) {
      if (metrosNaTela >= NIVEIS[i].min && metrosNaTela < NIVEIS[i].max) return NIVEIS[i];
    }
    return NIVEIS[NIVEIS.length - 1];
  }

  /* Peso da superfície 2D na banda de cruzamento. 0 = só globo, 1 = só 2D.
     Suave nas duas pontas (suave2 = 6t^5-15t^4+10t^3), derivada nula na
     borda, portanto sem costura perceptível. */
  function pesoDaSuperficie(metrosNaTela) {
    if (metrosNaTela >= CRUZAMENTO_ALTO) return 0;
    if (metrosNaTela <= CRUZAMENTO_BAIXO) return 1;
    var t = (CRUZAMENTO_ALTO - metrosNaTela) / (CRUZAMENTO_ALTO - CRUZAMENTO_BAIXO);
    return U.suave2(t);
  }
  function pesoDoGlobo(metrosNaTela) { return 1 - pesoDaSuperficie(metrosNaTela); }

  /* --------------------------------------------------------------------------
     DETALHE CONTÍNUO

     `oitavas` é FRACIONÁRIO de propósito. A parte inteira são as oitavas
     inteiras somadas; a fração é o peso da oitava que está NASCENDO. Assim o
     campo é contínuo em relação ao zoom: nenhuma oitava aparece de uma vez.

     A escala da oitava k é o dobro da anterior. A oitava 0 tem comprimento de
     onda de ESCALA_BASE metros. A conta de quantas oitavas o zoom pede é
     simplesmente "quantas duplicações separam a tela de ESCALA_BASE", mais
     uma margem para que o detalhe já esteja lá quando o olho chega nele.
     -------------------------------------------------------------------------- */
  var ESCALA_BASE = 2.0e6;        /* m — comprimento de onda da oitava 0 */
  var OITAVAS_MAX = 22;           /* teto absoluto; quem limita de fato é Nyquist */
  /* Decaimento entre oitavas. 0,5 é o fBm "marrom", liso demais para terreno:
     dá uma relação amplitude/comprimento de onda constante, e o resultado é
     um planalto sem relevo a 60 km de tela. Terreno real tem expoente de
     Hurst perto de 0,7, ou seja, ganho 2^-0,7 = 0,615. Com esse número a
     mesma série produz cordilheira na escala de dezenas de quilômetros e
     continua produzindo pedra na escala de metros. */
  var GANHO = 0.615;
  var MARGEM_OITAVAS = 2.2;

  function oitavasDoZoom(metrosNaTela) {
    if (!(metrosNaTela > 0)) return OITAVAS_MAX;
    var n = Math.log(ESCALA_BASE / metrosNaTela) / Math.LN2 + MARGEM_OITAVAS;
    return Math.max(0, Math.min(OITAVAS_MAX, n));
  }

  /* --------------------------------------------------------------------------
     RUÍDO — 3D sobre a direção unitária. Sem costura de meridiano, sem
     distorção polar. Determinístico: hash inteiro, nunca Math.random.
     -------------------------------------------------------------------------- */
  function ruido3(x, y, z, s) {
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    var xf = x - xi, yf = y - yi, zf = z - zi;
    var u = U.suave(xf), v = U.suave(yf), w = U.suave(zf);
    function h(a, b, c) { return U.hash3i(xi + a, yi + b, zi + c, s); }
    var c000 = h(0, 0, 0), c100 = h(1, 0, 0), c010 = h(0, 1, 0), c110 = h(1, 1, 0);
    var c001 = h(0, 0, 1), c101 = h(1, 0, 1), c011 = h(0, 1, 1), c111 = h(1, 1, 1);
    var x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u;
    var x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u;
    var y0 = x00 + (x10 - x00) * v, y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
  }

  /* --------------------------------------------------------------------------
     FBM EM JANELA DE OITAVAS — a peça que torna isto viável num telefone.

     Um FBM de 17 oitavas custa 17 avaliações de ruído por ponto, e três
     avaliações de altura por pixel custam 51. Num quadro de 200 x 340 isso é
     dez milhões de avaliações, quase um segundo. Inviável.

     Mas as oitavas não são iguais entre si. A oitava cujo comprimento de onda
     é quatro vezes a largura da tela varia menos de um quarto de ciclo ao
     longo do quadro inteiro: ela não é detalhe, é praticamente um patamar.
     Só as últimas quatro ou cinco oitavas mudam de pixel para pixel.

     Daí a janela: `fbmJanela` soma apenas as oitavas [kIni, kFim). As de
     baixa frequência são avaliadas numa grade grossa, uma vez a cada 16
     pixels, e interpoladas; as de alta frequência, por pixel. O resultado é
     o MESMO campo — a soma é a mesma soma, apenas particionada — e o custo
     cai de 51 avaliações por pixel para cerca de oito.

     Isto é otimização de RENDER, não de verdade: `elevacaoDaDir` continua
     somando tudo, e é ela que o teste S3 e o `amostraEm` usam.
     -------------------------------------------------------------------------- */
  function normaFbm(oitavas) {
    var n = Math.floor(oitavas), frac = oitavas - n;
    var amp = 1, norm = 0;
    for (var k = 0; k <= n && k <= OITAVAS_MAX; k++) {
      norm += amp * ((k === n) ? frac : 1);
      amp *= GANHO;
    }
    return norm;
  }

  /* Soma NÃO normalizada das oitavas [kIni, kFim). Dividir por normaFbm. */
  function fbmJanela(dir, oitavas, s, freq0, kIni, kFim, crista) {
    var n = Math.floor(oitavas), frac = oitavas - n;
    var fim = Math.min(kFim, n + 1, OITAVAS_MAX + 1);
    var soma = 0;
    var amp = Math.pow(GANHO, kIni);
    var f = freq0 * Math.pow(2, kIni);
    for (var k = kIni; k < fim; k++) {
      var peso = (k === n) ? frac : 1;
      if (peso > 0) {
        var v = ruido3(dir.x * f, dir.y * f, dir.z * f,
                       s + k * (crista ? 6271 : 7919)) * 2 - 1;
        soma += (crista ? (1 - Math.abs(v)) * 2 - 1 : v) * amp * peso;
      }
      amp *= GANHO;
      f *= 2;
    }
    return soma;
  }

  function fbmContinuo(dir, oitavas, s, freq0) {
    var norm = normaFbm(oitavas);
    return norm > 0 ? fbmJanela(dir, oitavas, s, freq0, 0, OITAVAS_MAX + 1, false) / norm : 0;
  }

  /* Ruído com aresta: |ruido| invertido produz cristas, que é o que uma
     cordilheira e uma linha de costa recortada realmente parecem. */
  function fbmCrista(dir, oitavas, s, freq0) {
    var norm = normaFbm(oitavas);
    return norm > 0 ? fbmJanela(dir, oitavas, s, freq0, 0, OITAVAS_MAX + 1, true) / norm : 0;
  }

  /* --------------------------------------------------------------------------
     JANELA VISÍVEL — para TEXTURA, não para relevo.

     Um fBm tem amplitude caindo pela metade a cada oitava. Isso é certo para
     relevo: uma serra é mais alta que uma pedra. É errado para textura de
     superfície. O contraste de uma faixa de espuma no mar, ou do grão do solo
     visto de perto, não é cem vezes menor que o de um vórtice de quarenta
     quilômetros — é da mesma ordem, porque não são alturas, são padrões.

     Medir isso foi o que revelou a faixa morta entre 25 km e 2 km de tela: a
     textura estava lá, com um centésimo do contraste, e o mar virava uma
     chapa de cor. Somar mais oitavas não resolvia, porque as que entravam
     eram justamente as mais fracas.

     A janela visível soma só as últimas `largura` oitavas e NORMALIZA POR
     ELAS. Assim, em qualquer zoom, a textura tem contraste cheio na escala
     que se está olhando. As duas pontas da janela são fracionárias, então
     ela desliza continuamente com o zoom: nenhuma oitava aparece de uma vez.
     -------------------------------------------------------------------------- */
  function fbmVisivel(dir, oitTopo, s, freq0, largura, crista) {
    if (!(oitTopo > 0)) return 0;
    var kIni = Math.max(0, oitTopo - largura);
    var k0 = Math.floor(kIni), pesoIni = 1 - (kIni - k0);
    var n = Math.floor(oitTopo), fracTopo = oitTopo - n;
    var soma = 0, norma = 0;
    var amp = 1, f = freq0 * Math.pow(2, k0);
    for (var k = k0; k <= n && k <= OITAVAS_MAX; k++) {
      var peso = (k === k0 ? pesoIni : 1) * (k === n ? fracTopo : 1);
      if (peso > 1e-6) {
        var v = ruido3(dir.x * f, dir.y * f, dir.z * f,
                       s + k * (crista ? 6271 : 7919)) * 2 - 1;
        soma += (crista ? (1 - Math.abs(v)) * 2 - 1 : v) * amp * peso;
        norma += amp * peso;
      }
      amp *= 0.72;          /* decaimento brando: textura, não relevo */
      f *= 2;
    }
    return norma > 1e-9 ? soma / norma : 0;
  }
  var JANELA_TEXTURA = 4.5;   /* oitavas de textura somadas por amostra */

  /* Primeira oitava que ainda muda de pixel para pixel, dado o zoom.
     Comprimento de onda da oitava k, em metros, é Rm / (freq0 * 2^k). Ela é
     "grossa" enquanto for maior que LIMIAR_GROSSO telas. */
  var LIMIAR_GROSSO = 4;
  function oitavaDeCorte(Rm, freq0, metrosNaTela) {
    var alvo = Rm / (LIMIAR_GROSSO * metrosNaTela * freq0);
    if (!(alvo > 1)) return 0;
    return Math.max(0, Math.floor(Math.log(alvo) / Math.LN2));
  }

  /* TETO DE OITAVA POR PIXEL — a outra metade da economia, e a que também
     melhora a imagem.

     Uma oitava cujo comprimento de onda é menor que dois pixels não desenha
     nada: ela cai entre as amostras e vira cintilação. Somá-la custa tempo e
     piora o quadro. O teto é o critério de Nyquist, não uma tolerância:

         comprimento de onda da oitava k = Rm / (freq0 * 2^k)
         visível enquanto  Rm / (freq0 * 2^k)  >  2 * metrosPorPixel

     Truncar aqui é exatamente a doutrina da escada: um nível de cima é um
     passa-baixa do nível de baixo. Ao aproximar, as oitavas voltam. */
  function oitavaMaxima(Rm, freq0, metrosPorPixel) {
    var alvo = Rm / (2 * freq0 * Math.max(metrosPorPixel, 1e-9));
    if (!(alvo > 1)) return 0;
    return Math.log(alvo) / Math.LN2;
  }

  /* JANELA FINA MÁXIMA — a amplitude cai pela metade a cada oitava, então
     depois de seis oitavas finas o que resta é menos de 1/64 do que já foi
     somado: abaixo de um passo de cor e abaixo de um pixel de altura. */
  var JANELA_FINA = 6;

  /* --------------------------------------------------------------------------
     LEITURA DO CAMPO PLANETÁRIO — bilinear, não vizinho mais próximo.

     `A.amostraPlaneta` usa o vizinho mais próximo, o que é certo para
     estatística e errado para superfície: produziria degraus de 111 km. Aqui
     interpolamos, e a longitude fecha em círculo (a coluna 359 faz fronteira
     com a coluna 0, não com o nada).
     -------------------------------------------------------------------------- */
  function elevacaoDaCelula(P, i) {
    if (P.ancoraOriginais && P.ancoraOriginais[i] !== undefined) return P.ancoraOriginais[i];
    return P.elevacao[i];
  }

  function bilinear(P, campo, lat, lon, semAncora) {
    var fx = (lon + 180) / 360 * P.larg - 0.5;
    var fy = (90 - lat) / 180 * P.alt - 0.5;
    var x0 = Math.floor(fx), y0 = Math.floor(fy);
    var tx = fx - x0, ty = fy - y0;
    var y1 = y0 + 1;
    if (y0 < 0) { y0 = 0; }
    if (y1 > P.alt - 1) { y1 = P.alt - 1; }
    y0 = U.clamp(y0, 0, P.alt - 1);
    function col(x) { return ((x % P.larg) + P.larg) % P.larg; }
    var xa = col(x0), xb = col(x0 + 1);
    function ler(ix, iy) {
      var i = iy * P.larg + ix;
      return (semAncora && campo === P.elevacao) ? elevacaoDaCelula(P, i) : campo[i];
    }
    var a = ler(xa, y0), b = ler(xb, y0), c = ler(xa, y1), d = ler(xb, y1);
    var t0 = a + (b - a) * tx, t1 = c + (d - c) * tx;
    return t0 + (t1 - t0) * ty;
  }

  /* --------------------------------------------------------------------------
     LEITURA DA REGIÃO — bilinear nos campos contínuos, vizinho mais próximo
     no `tipo` (bioma é categoria, interpolar categoria é inventar bioma).
     -------------------------------------------------------------------------- */
  function lerRegBilinear(reg, campo, x, y) {
    var tam = reg.largura;
    var fx = U.clamp(x - 0.5, 0, tam - 1.0001);
    var fy = U.clamp(y - 0.5, 0, tam - 1.0001);
    var x0 = Math.floor(fx), y0 = Math.floor(fy);
    var x1 = Math.min(x0 + 1, tam - 1), y1 = Math.min(y0 + 1, tam - 1);
    var tx = fx - x0, ty = fy - y0;
    var a = campo[y0 * tam + x0], b = campo[y0 * tam + x1];
    var c = campo[y1 * tam + x0], d = campo[y1 * tam + x1];
    var t0 = a + (b - a) * tx, t1 = c + (d - c) * tx;
    return t0 + (t1 - t0) * ty;
  }
  /* LEITURA CÚBICA DO TERRENO — Catmull-Rom, 4x4 amostras.

     A leitura bilinear devolve uma superfície feita de planos: dentro de cada
     tile a altura é linear, então a NORMAL é constante e muda de uma vez na
     fronteira. O sombreamento transforma isso em facetas, e num rio de um
     tile de largura, escavado 45 cm, o resultado na tela foi uma escadaria.

     Catmull-Rom passa exatamente pelos pontos de controle — o teste S3, que
     exige que o centro de cada tile devolva o número do world.js, continua
     valendo — e tem derivada contínua, que é o que o sombreamento precisa.
     O custo é dezesseis leituras de array por amostra, que em JavaScript é
     mais barato que uma avaliação de ruído. */
  function cr1(p0, p1, p2, p3, t) {
    var a = p1;
    var b = 0.5 * (p2 - p0);
    var c = p0 - 2.5 * p1 + 2 * p2 - 0.5 * p3;
    var d = -0.5 * p0 + 1.5 * p1 - 1.5 * p2 + 0.5 * p3;
    return ((d * t + c) * t + b) * t + a;
  }
  function lerRegCubica(reg, campo, x, y) {
    var tam = reg.largura;
    var fx = U.clamp(x - 0.5, 0, tam - 1.0001);
    var fy = U.clamp(y - 0.5, 0, tam - 1.0001);
    var x1 = Math.floor(fx), y1 = Math.floor(fy);
    var tx = fx - x1, ty = fy - y1;
    var cx = [x1 - 1, x1, x1 + 1, x1 + 2], cy = [y1 - 1, y1, y1 + 1, y1 + 2];
    for (var k = 0; k < 4; k++) {
      cx[k] = cx[k] < 0 ? 0 : (cx[k] > tam - 1 ? tam - 1 : cx[k]);
      cy[k] = cy[k] < 0 ? 0 : (cy[k] > tam - 1 ? tam - 1 : cy[k]);
    }
    var col = [0, 0, 0, 0];
    for (var j = 0; j < 4; j++) {
      var base = cy[j] * tam;
      col[j] = cr1(campo[base + cx[0]], campo[base + cx[1]],
                   campo[base + cx[2]], campo[base + cx[3]], tx);
    }
    return cr1(col[0], col[1], col[2], col[3], ty);
  }

  /* LEITURA COM EXTRAPOLAÇÃO DE BORDA.

     `lerRegBilinear` satura na última fileira de tiles: um passo além da
     borda devolve o mesmo valor de sempre. O VALOR fica contínuo, mas a
     DERIVADA cai a zero de uma vez, e um salto de derivada é tudo de que o
     sombreamento precisa para desenhar um risco. Medido: um risco horizontal
     na latitude da borda sul da ilha, 18 vezes mais forte que a variação
     média entre linhas vizinhas.

     Aqui a borda continua com a inclinação que tinha, e essa inclinação vai
     morrendo em 25 metros. A derivada em s = 0 é exatamente a da borda, então
     não há salto; e em 25 metros o terreno já entregou o lugar para o talude
     procedural, que é quem de fato sabe o que existe ali. */
  var EXTRAPOLA_M = 25;
  function lerRegExtrapolada(reg, campo, x, y) {
    var tam = reg.largura;
    var lo = 0.5, hi = tam - 0.5;
    var xi = x < lo ? lo : (x > hi ? hi : x);
    var yi = y < lo ? lo : (y > hi ? hi : y);
    var v = lerRegCubica(reg, campo, xi, yi);
    var sx = x - xi, sy = y - yi;
    if (sx === 0 && sy === 0) return v;
    var extra = 0;
    if (sx !== 0) {
      var px = (sx > 0) ? -1 : 1;
      var gx = (v - lerRegCubica(reg, campo, xi + px, yi)) / (-px);
      extra += gx * sx * Math.exp(-Math.abs(sx) / EXTRAPOLA_M);
    }
    if (sy !== 0) {
      var py = (sy > 0) ? -1 : 1;
      var gy = (v - lerRegCubica(reg, campo, xi, yi + py)) / (-py);
      extra += gy * sy * Math.exp(-Math.abs(sy) / EXTRAPOLA_M);
    }
    return v + extra;
  }

  function lerRegVizinho(reg, campo, x, y) {
    var tam = reg.largura;
    var ix = U.clamp(Math.floor(x), 0, tam - 1);
    var iy = U.clamp(Math.floor(y), 0, tam - 1);
    return campo[iy * tam + ix];
  }

  /* --------------------------------------------------------------------------
     CLASSIFICADOR DE BIOMA — ESPELHO de world.js:171-190.
     Mesmos limiares, mesma ordem, mesmos nomes. Provado pelo teste S5.
     -------------------------------------------------------------------------- */
  function classificarBioma(h, umid, t) {
    var bi;
    if (h <= -1.7) bi = 'oceano';
    else if (h < 0.45) bi = 'praia';
    else if (h > 13.0) bi = t < 8 ? 'tundra' : 'montanha';
    else if (h > 8.6) bi = umid > 0.5 ? (t < 8 ? 'taiga' : 'floresta') : 'montanha';
    else if (t > 28 && umid < 0.30) bi = 'deserto';
    else if (t > 25 && umid < 0.45) bi = 'savana';
    else if (umid > 0.70) bi = t > 23 ? 'tropical' : 'floresta';
    else if (umid > 0.46) bi = 'floresta';
    else if (umid < 0.26) bi = 'savana';
    else bi = 'prado';
    if (bi === 'prado' && h < 1.6 && umid > 0.6) bi = 'pantano';
    return bi;
  }

  /* Fora da região a altura é planetária, em milhares de metros, e os
     limiares do world.js são de uma ilha de 15 m. Aplicá-los crus diria
     "montanha" no meio do Saara. A altura precisa ser trazida para a escala
     em que o classificador foi escrito, e a régua honesta para isso é a
     própria faixa da região: -64 m a +15 m no motor, 0 a 7000 m no planeta.
     Só a parte ACIMA do mar é comprimida; abaixo do mar o classificador já
     decide por um único limiar (-1,7 m) e qualquer profundidade é oceano. */
  var ELEV_PLANETA_MAX = 7000;
  var ELEV_REGIAO_MAX = 15.04;      /* pico real da Ilha Gênesis, medido */
  function alturaNaEscalaDoClassificador(elevMetros) {
    if (elevMetros <= 0) return Math.max(-64, elevMetros * 0.05 - 1.8);
    /* Reta não serve. O limiar de montanha do world.js é 13 m numa ilha cujo
       pico tem 15 m, ou seja, "quase no alto". Mapeado em reta para 7000 m,
       isso põe montanha só acima de 6 km, e um maciço de 3,1 km sai
       classificado como prado. O expoente 0,55 recoloca os limiares onde eles
       significam a mesma coisa: montanha acima de ~2,4 km, encosta no meio,
       planície embaixo. */
    var t = U.clamp01(elevMetros / ELEV_PLANETA_MAX);
    return Math.pow(t, 0.55) * ELEV_REGIAO_MAX;
  }

  /* ==========================================================================
     CRIAÇÃO
     ========================================================================== */

  function criar(deps, m, opcoes) {
    opcoes = opcoes || {};
    var W = deps.W, T = deps.T, E = deps.E, A = deps.A;
    if (!W || !T || !E || !A) {
      throw new Error('superficie.criar: faltam dependencias (W, T, E, A)');
    }
    var reg = W.regiaoAtiva(m);
    var P = opcoes.planeta || (opcoes.ambiente && opcoes.ambiente.planeta);
    if (!P) throw new Error('superficie.criar: campo planetario ausente (ambiente.criar primeiro)');

    var frame = E.frameDaRegiao(T, reg);
    var Rm = E.raioMetros(m);
    var tam = reg.largura;

    /* Semente de ruído derivada da seed do mundo. Uma seed, um planeta. */
    var rng = U.RNG((m.seed | 0) ^ 0x51F4CE);
    var C = {
      contrato: CONTRATO, versao: VERSAO,
      m: m, reg: reg, P: P, W: W, T: T, E: E, A: A,
      frame: frame, Rm: Rm, tam: tam,
      seedRelevo: rng.int(1, 1e6),
      seedCosta: rng.int(1, 1e6),
      seedSolo: rng.int(1, 1e6),
      seedUmidade: rng.int(1, 1e6),

      /* raio da região em metros, do centro ao canto */
      raioRegiao: Math.sqrt(2) * tam * 0.5,
      /* onde termina o domínio de world.js e começa o deste arquivo */
      misturaInicio: (tam * 0.5),          /* 80 m — borda da região */
      /* ATÉ ONDE O MOTOR MANDA.

         Era 2,48 km, e isso era um erro de escala grosseiro: o world.js tem
         dado de 160 metros, e estava ditando o fundo do mar por dois
         quilômetros e meio. Como a leitura do terreno satura na última fileira
         de tiles, o resultado era uma plataforma perfeitamente plana em volta
         da ilha — chapada, sem sombra, e com um risco branco na borda onde o
         gradiente ia a zero de uma vez.

         340 metros de transição é o que 160 metros de dado sustentam. Dali em
         diante quem fala é a superfície, que tem relevo em toda escala. */
      misturaFim: (tam * 0.5) + 340,       /* 420 m — fim da autoridade do motor */
      /* O TALUDE é outra coisa e tem outra escala: é a descida do banco da
         ilha até o fundo da bacia, e leva quilômetros porque taludes levam. */
      taludeFim: (tam * 0.5) + 2400,       /* 2,48 km */

      /* A BACIA DA ILHA — a peça que reconcilia duas autoridades.

         O campo planetário coloca Ilha Gênesis no alto de um maciço de
         3.111 m: a placa que a gerou tem o pico exatamente ali. O world.js
         diz outra coisa, e diz com dado: a borda da região é mar, de -28 m
         em média a -64 m nos cantos. Onde há conflito, o motor vence.

         Mas o motor só fala de 160 metros. Além disso, quem fala é o campo
         planetário, e ele não pode ser contrariado para sempre — seria
         apagar um maciço inteiro porque uma ilha de 160 m discorda dele.

         A reconciliação é geográfica, não numérica: a ilha fica numa BACIA.
         O mar desce da borda da região até o fundo da bacia, e a bacia sobe
         de volta até o campo planetário no seu raio. O resultado é uma ilha
         vulcânica em água funda com o maciço continental no horizonte, que é
         exatamente a forma que o Havaí tem. As duas autoridades ficam
         inteiras e a travessia é contínua em toda parte.

         Os números não são gosto: a profundidade vem da razão entre o pico
         (15 m) e o fundo de borda (-64 m) do próprio motor, extrapolada pelo
         talude; o raio é a escala em que uma célula planetária de 1 grau
         ainda não mandou nada (111 km / 2 arredondado para baixo). */
      profundidadeBacia: -900,             /* m — fundo da bacia */
      raioBacia: 55000,                    /* m — onde o campo planetario volta */

      /* estatística da borda: para onde o fundo desce ao sair da região */
      bordaMedia: 0,
      bordaMin: 0
    };

    var soma = 0, mn = 1e9, n = 0;
    for (var x = 0; x < tam; x++) {
      var vs = [reg.alturaTerreno[x], reg.alturaTerreno[(tam - 1) * tam + x],
                reg.alturaTerreno[x * tam], reg.alturaTerreno[x * tam + tam - 1]];
      for (var k = 0; k < 4; k++) { soma += vs[k]; mn = Math.min(mn, vs[k]); n++; }
    }
    C.bordaMedia = soma / n;
    C.bordaMin = mn;

    /* Cache do quadro pintado: a superfície só é repintada quando a câmera
       muda. Parado, custa zero. */
    C.cache = { chave: null, buffer: null, larg: 0, alt: 0 };
    C.custo = { amostras: 0, msTotal: 0 };

    return C;
  }

  /* ==========================================================================
     O CAMPO DE ELEVAÇÃO — uma função só, contínua, do espaço até o chão
     ========================================================================== */

  /* Posição local (em tiles da região) de uma direção do globo. */
  function localDaDir(C, dir) {
    var d = C.E.deslocamentoEntre(C.frame, dir, C.Rm);
    var meio = C.tam * 0.5;
    return {
      x: (d.leste + meio), y: (meio - d.norte),
      distancia: d.metros, leste: d.leste, norte: d.norte
    };
  }
  function dirDoLocal(C, x, y) {
    var meio = C.tam * 0.5;
    return C.E.dirDeslocada(C.frame, x - meio, meio - y, C.Rm);
  }

  /* Peso da autoridade do world.js num ponto: 1 dentro da região, 0 no mar
     aberto, suave no meio. `d` é a distância CHEBYSHEV ao centro em metros,
     porque a região é um quadrado, não um círculo: usar a distância radial
     deixaria os cantos da região de fora do próprio domínio. */
  /* UMA distância só manda em tudo. Antes eram duas — Chebyshev para o peso
     da região e radial para a bacia — e onde elas discordavam apareceu uma
     cruz escura de mais de um quilômetro atravessando a tela, porque ao longo
     dos eixos a distância de Chebyshev é menor que a radial e as duas
     misturas saíam de fase. Dois jeitos de medir a mesma distância são duas
     geometrias; um artefato em cruz é o que isso parece na tela. */
  function pesoDeDistancia(C, d) {
    if (d <= C.misturaInicio) return 1;
    if (d >= C.misturaFim) return 0;
    return 1 - U.suave2((d - C.misturaInicio) / (C.misturaFim - C.misturaInicio));
  }
  function pesoDaRegiao(C, x, y) {
    var d = distanciaDaBacia(C, x, y);
    if (d <= C.misturaInicio) return 1;
    if (d >= C.misturaFim) return 0;
    return 1 - U.suave2((d - C.misturaInicio) / (C.misturaFim - C.misturaInicio));
  }

  /* O MAR AO REDOR DA ILHA, em duas etapas contínuas e encaixadas:

       borda da região  ──talude──▶  fundo da bacia  ──encosta──▶  campo planetário
       80 m                          2,48 km                        55 km

     Nos dois extremos o valor devolvido é EXATAMENTE o do vizinho (terreno da
     borda de um lado, campo planetário do outro), e a interpolação é suave2,
     que tem derivada nula nas pontas. Por isso não existe degrau em lugar
     nenhum: não é tolerância de teste, é construção. */
  /* DISTÂNCIA PARA A BACIA — radial, não de Chebyshev, e recortada.

     A primeira versão usava a mesma distância de Chebyshev do peso da região.
     Dentro de 160 metros isso é certo: a região É um quadrado. A 55 km vira
     um absurdo geométrico, e o que apareceu na tela foi literalmente um
     oceano quadrado com quina.

     Aqui a distância é radial, e o raio da bacia é modulado por ruído da
     mesma seed, para que a linha onde o fundo encontra o campo planetário
     seja recortada como uma costa e não como um compasso. Perto da região as
     duas distâncias se encontram, porque a 80 metros radial e Chebyshev
     diferem no máximo por raiz de dois e a mistura da região já mandou. */
  var RAIO_ARREDONDA = 600;   /* m — onde o quadrado já virou círculo */
  function distanciaDaBacia(C, lx, ly) {
    var meio = C.tam * 0.5;
    var dx = Math.abs(lx - meio), dy = Math.abs(ly - meio);
    var cheb = (dx > dy) ? dx : dy;
    if (cheb <= C.misturaInicio) return cheb;
    var euc = Math.sqrt(dx * dx + dy * dy);
    if (cheb >= RAIO_ARREDONDA) return euc;
    return cheb + (euc - cheb) *
           U.suave2((cheb - C.misturaInicio) / (RAIO_ARREDONDA - C.misturaInicio));
  }
  function raioDaBacia(C, dir) {
    return C.raioBacia * (1 + 0.42 * fbmContinuo(dir, 3, C.seedCosta + 7, 900));
  }

  function marAoRedor(C, distMetros, elevPlanetaria, raioB) {
    var rb = raioB || C.raioBacia;
    if (distMetros >= rb) return elevPlanetaria;
    if (distMetros <= C.taludeFim) {
      var t1 = U.clamp01((distMetros - C.misturaInicio) / (C.taludeFim - C.misturaInicio));
      return C.bordaMedia + (C.profundidadeBacia - C.bordaMedia) * U.suave2(t1);
    }
    var t2 = U.clamp01((distMetros - C.taludeFim) / Math.max(1, rb - C.taludeFim));
    return C.profundidadeBacia + (elevPlanetaria - C.profundidadeBacia) * U.suave2(t2);
  }

  /* ATENÇÃO — esta função devolve a BASE, não a altura final.

     Na primeira versão a bacia devolvia a altura pronta, e o resultado foi
     literalmente o defeito que este trabalho existe para matar: um fundo de
     mar perfeitamente liso, uma só cor, "só azul". Um fundo oceânico real tem
     relevo — dorsal, talude, canal, sedimento — e um fundo sem relevo não é
     uma simplificação, é um erro.

     A correção é de ordem: a bacia deprime a BASE, e as oitavas de detalhe
     entram DEPOIS, por cima dela. A continuidade se mantém porque a mistura
     continua indo de bordaMedia até o campo planetário; o que muda é que ela
     não apaga mais o detalhe. */
  function baseComBacia(C, distMetros, basePlanetaria, raioB) {
    return marAoRedor(C, distMetros, basePlanetaria, raioB);
  }

  /* ELEVAÇÃO EM UM PONTO DO GLOBO, em metros, com `oitavas` de detalhe.
     Esta é a função central do arquivo. Tudo o mais consulta ela. */
  /* Amplitude do relevo em função da base: terra alta ondula muito, fundo de
     mar ondula menos, mas NUNCA zero — um fundo de mar liso não existe. */
  function amplitudeDoRelevo(base) {
    var terraness = U.clamp01((base + 400) / 1200);
    return { terraness: terraness, macro: 900 * (0.35 + 0.65 * terraness) };
  }

  function elevacaoDaDir(C, dir, oitavas, latLon) {
    var ll = latLon || C.T.latLonDeDir(dir.x, dir.y, dir.z);
    var basePlan = bilinear(C.P, C.P.elevacao, ll.lat, ll.lon, true);

    var loc = localDaDir(C, dir);
    var dRad = distanciaDaBacia(C, loc.x, loc.y);
    var raioB = (dRad < C.raioBacia * 1.5) ? raioDaBacia(C, dir) : C.raioBacia;
    var w2 = (dRad >= raioB) ? 0 : pesoDeDistancia(C, dRad);

    /* Dentro da região não há o que compor: o motor já disse tudo. */
    if (w2 >= 1) return lerRegCubica(C.reg, C.reg.alturaTerreno, loc.x, loc.y);

    /* A bacia deprime a BASE. O detalhe vem por cima dela, nunca é apagado. */
    var base = (dRad < raioB) ? baseComBacia(C, dRad, basePlan, raioB) : basePlan;

    /* Detalhe procedural. A amplitude cai com a escala: grandes ondulações no
       fundo do mar e na cordilheira, rugosidade fina no chão. A crista entra
       só onde já há terra, que é onde erosão e dobramento produzem crista. */
    var amp = amplitudeDoRelevo(base);
    var d1 = fbmContinuo(dir, Math.min(oitavas, OITAVAS_MAX), C.seedRelevo, 3.1);
    var d2 = fbmCrista(dir, Math.min(oitavas, OITAVAS_MAX), C.seedRelevo + 101, 11.0);
    var detalhe = d1 * amp.macro + d2 * 260 * amp.terraness;

    /* Rugosidade de metro: só aparece nas últimas oitavas, e é pequena por
       definição. É ela que impede o chão de ser um plano liso em L4. */
    var fino = 0;
    if (oitavas > 9) {
      fino = fbmContinuo(dir, oitavas, C.seedRelevo + 777, 900) * 3.2 * U.clamp01(oitavas - 9);
    }

    var eProc = base + detalhe + fino;
    if (w2 <= 0) return eProc;

    /* Na faixa: o terreno da borda da região se dissolve no talude.
       `lerRegBilinear` já satura na última fileira; clampear ANTES dela fazia
       os dois caminhos lerem fileiras diferentes e produzia um degrau de meio
       metro exatamente na borda da região. Um clamp só. */
    var eReg = lerRegExtrapolada(C.reg, C.reg.alturaTerreno, loc.x, loc.y);
    return eProc + (eReg - eProc) * w2;
  }

  /* ==========================================================================
     amostraEm — A CAMADA QUE O NPC VAI CONSUMIR
     ==========================================================================
     Todo campo é definido em todo ponto válido. Nenhum `null` sem motivo
     textual. Nenhum campo que exista só no render.
     ========================================================================== */

  var PASSO_DECLIVE = 0.5;   /* m — meia largura da diferença finita */

  function amostrarDir(C, dir, opcoes) {
    opcoes = opcoes || {};
    var oit = (typeof opcoes.oitavas === 'number') ? opcoes.oitavas : OITAVAS_MAX;
    var ll = C.T.latLonDeDir(dir.x, dir.y, dir.z);
    var loc = localDaDir(C, dir);
    var dentroRegiao = (loc.x >= 0 && loc.x < C.tam && loc.y >= 0 && loc.y < C.tam);
    var wReg = pesoDaRegiao(C, loc.x, loc.y);

    var altitude = elevacaoDaDir(C, dir, oit, ll);

    /* DECLIVE — gradiente real, por diferença finita no frame local do ponto,
       em metros. Não é um número de aparência: é dz/dx em m/m.

       A diferença é CENTRADA por padrão, que é mais exata, e custa quatro
       avaliações de altura. Com `opcoes.declive = 'rapido'` ela passa a ser
       adiantada e reaproveita a altura já calculada: duas avaliações, metade
       do custo, erro de segunda ordem em vez de terceira. Quem vai chamar
       isto milhares de vezes por quadro escolhe; quem chama uma vez não
       precisa nem saber. `opcoes.declive = false` pula o cálculo. */
    var gx = 0, gy = 0, declive = 0;
    if (opcoes.declive !== false) {
      var fp = C.E.frameEmDir(dir);
      if (opcoes.declive === 'rapido') {
        gx = (elevacaoDaDir(C, C.E.dirDeslocada(fp, PASSO_DECLIVE, 0, C.Rm), oit) - altitude) / PASSO_DECLIVE;
        gy = (elevacaoDaDir(C, C.E.dirDeslocada(fp, 0, PASSO_DECLIVE, C.Rm), oit) - altitude) / PASSO_DECLIVE;
      } else {
        var hE1 = elevacaoDaDir(C, C.E.dirDeslocada(fp, PASSO_DECLIVE, 0, C.Rm), oit);
        var hE0 = elevacaoDaDir(C, C.E.dirDeslocada(fp, -PASSO_DECLIVE, 0, C.Rm), oit);
        var hN1 = elevacaoDaDir(C, C.E.dirDeslocada(fp, 0, PASSO_DECLIVE, C.Rm), oit);
        var hN0 = elevacaoDaDir(C, C.E.dirDeslocada(fp, 0, -PASSO_DECLIVE, C.Rm), oit);
        gx = (hE1 - hE0) / (2 * PASSO_DECLIVE);
        gy = (hN1 - hN0) / (2 * PASSO_DECLIVE);
      }
      declive = Math.sqrt(gx * gx + gy * gy);
    }

    /* TEMPERATURA, UMIDADE, FERTILIDADE — dentro da região o motor manda. */
    var temperatura, umidade, fertilidade, bioma, fonteBioma;
    if (wReg >= 1) {
      temperatura = lerRegBilinear(C.reg, C.reg.temperatura, loc.x, loc.y);
      umidade = lerRegBilinear(C.reg, C.reg.umidade, loc.x, loc.y);
      fertilidade = lerRegBilinear(C.reg, C.reg.fertilidade, loc.x, loc.y);
      bioma = C.W.BIOMA_IDS[lerRegVizinho(C.reg, C.reg.tipo, loc.x, loc.y)];
      fonteBioma = 'world.js:reg.tipo';
    } else {
      var tPlan = bilinear(C.P, C.P.temperatura, ll.lat, ll.lon, false);
      temperatura = tPlan - Math.max(0, altitude) * LAPSE + tPlan * 0;
      var pPlan = bilinear(C.P, C.P.precipitacao, ll.lat, ll.lon, false);
      /* umidade do solo em 0..1: saturação relativa derivada da precipitação
         média e do declive (água escorre de encosta). Mesma faixa que o motor
         usa em reg.umidade, para que os dois lados da faixa sejam comparáveis. */
      var uBase = U.clamp01(pPlan / 6);
      var uRuido = (fbmContinuo(dir, Math.min(oit, 9), C.seedUmidade, 24) * 0.5 + 0.5);
      umidade = U.clamp01(uBase * 0.65 + uRuido * 0.35 - U.clamp01(declive) * 0.18);
      var hClass = alturaNaEscalaDoClassificador(altitude);
      bioma = classificarBioma(hClass, umidade, temperatura);
      var defB = D.BIOMAS[bioma] || D.BIOMAS.prado;
      fertilidade = U.clamp01(defB.fertil * (0.6 + umidade * 0.6));
      fonteBioma = 'superficie.classificarBioma (espelho de world.js:171-190)';

      if (wReg > 0) {
        /* dentro da faixa de mistura: interpola com o lado do motor */
        temperatura += (lerRegBilinear(C.reg, C.reg.temperatura, loc.x, loc.y) - temperatura) * wReg;
        umidade += (lerRegBilinear(C.reg, C.reg.umidade, loc.x, loc.y) - umidade) * wReg;
        fertilidade += (lerRegBilinear(C.reg, C.reg.fertilidade, loc.x, loc.y) - fertilidade) * wReg;
        fonteBioma = 'mistura declarada (peso da regiao = ' + wReg.toFixed(3) + ')';
      }
    }

    var def = D.BIOMAS[bioma] || D.BIOMAS.prado;

    /* ÁGUA — três perguntas diferentes, três respostas.
       salgada: o ponto está abaixo do nível do mar e ligado ao oceano.
       doce:    rio ou lago do motor, ou umidade de solo alta fora dele.
       disponivel: quanto um ser consegue beber ou uma raiz consegue puxar. */
    var abaixoDoMar = altitude < NIVEL_MAR;
    var aguaDoce = (bioma === 'rio' || bioma === 'lago');
    var profundidade = abaixoDoMar ? (NIVEL_MAR - altitude) : 0;
    if (wReg >= 1 && C.reg.prof) {
      var pr = lerRegBilinear(C.reg, C.reg.prof, loc.x, loc.y);
      if (pr > 0) profundidade = Math.max(profundidade, pr);
    }
    var agua = {
      salgada: abaixoDoMar && !aguaDoce,
      doce: aguaDoce,
      profundidade: profundidade,
      salinidade: (abaixoDoMar && !aguaDoce)
        ? bilinear(C.P, C.P.salinidade, ll.lat, ll.lon, false) : 0,
      disponivel: aguaDoce ? 1 : (abaixoDoMar ? 0 : U.clamp01(umidade))
    };

    /* SOLO — textura derivada de relevo, umidade e material de origem.
       Não é rótulo decorativo: é o par (areia, argila) que a pedotransferência
       de ambiente.js consome, e o nome da classe textural vem de lá. */
    var solo = classificarSolo(C, dir, altitude, declive, umidade, bioma, oit);

    /* LUZ — geometria solar real, não um número inventado.
       Declinação pelo dia do ano, ângulo horário pela hora do mundo. */
    var luz = luzEm(C, ll.lat, ll.lon);

    /* RECURSOS — os nomes do projeto, vindos de D.BIOMAS/D.FLORA. Nada de
       taxonomia nova. Fora da região é POTENCIAL (o que pode nascer ali),
       dentro é o que o motor de fato colocou. */
    var recursos = recursosEm(C, bioma, def, dentroRegiao, loc, wReg);

    return {
      contrato: CONTRATO,
      altitude: altitude,
      declive: declive,
      declivePercent: declive * 100,
      decliveGraus: Math.atan(declive) * DEG,
      solo: solo,
      agua: agua,
      temperatura: temperatura,
      umidade: umidade,
      fertilidade: fertilidade,
      luz: luz,
      recursos: recursos,
      bioma: bioma,
      biomaNome: def.nome,
      fonteBioma: fonteBioma,
      autoridade: wReg >= 1 ? 'world.js' : (wReg > 0 ? 'mistura' : 'superficie.js'),
      pesoDaRegiao: wReg,
      geo: { lat: ll.lat, lon: ll.lon },
      local: { x: loc.x, y: loc.y, dentroDaRegiao: dentroRegiao },
      oitavas: oit
    };
  }

  /* amostraEm(x, y) — assinatura do plano, em coordenada local de tile. */
  function amostraEm(C, x, y, opcoes) {
    return amostrarDir(C, dirDoLocal(C, x, y), opcoes);
  }

  /* --- solo ---------------------------------------------------------------- */
  var ROCHA_NUA_DECLIVE = 0.55;
  function classificarSolo(C, dir, altitude, declive, umidade, bioma, oit) {
    var def = D.BIOMAS[bioma] || D.BIOMAS.prado;
    if (def.agua) {
      return { classe: 'sedimento_submerso', areia: 0.55, argila: 0.2, silte: 0.25,
               materiaOrganica: 0.02, pedregosidade: 0, profundidadeM: 0.4,
               nome: 'Sedimento submerso' };
    }
    if (declive > ROCHA_NUA_DECLIVE || bioma === 'montanha') {
      var expo = U.clamp01((declive - 0.3) / 0.6);
      return { classe: 'rocha_exposta', areia: 0.7, argila: 0.1, silte: 0.2,
               materiaOrganica: 0.01 + 0.03 * (1 - expo),
               pedregosidade: 0.4 + 0.6 * expo,
               profundidadeM: 0.30 * (1 - expo) + 0.02,
               nome: 'Rocha exposta' };
    }
    /* textura por ruído independente do relevo: material de origem não é
       função da altura. Areia alta na praia e no deserto, argila alta no
       pântano e onde a água para. */
    var r = fbmContinuo(dir, Math.min(oit, 8), C.seedSolo, 47) * 0.5 + 0.5;
    var areia = U.clamp01(0.25 + r * 0.45 + (bioma === 'praia' ? 0.4 : 0) +
                          (bioma === 'deserto' ? 0.35 : 0) - umidade * 0.15);
    var argila = U.clamp01(0.15 + (1 - r) * 0.3 + umidade * 0.2 +
                           (bioma === 'pantano' ? 0.2 : 0) - areia * 0.35);
    var silte = U.clamp01(1 - areia - argila);
    var mo = U.clamp01(def.fertil * 0.08 + umidade * 0.03);
    var nome = C.A.classeTextural ? C.A.classeTextural(areia * 100, argila * 100) : null;
    return {
      classe: (nome && nome.classe) ? nome.classe : 'franco',
      areia: areia, argila: argila, silte: silte,
      materiaOrganica: mo,
      pedregosidade: U.clamp01(declive * 0.5 + def.dureza * 0.3),
      profundidadeM: U.clamp(0.15 + def.fertil * 0.9 - declive * 0.6, 0.02, 1.2),
      nome: (nome && nome.nome) ? nome.nome : 'Franco'
    };
  }

  /* --- luz ----------------------------------------------------------------- */
  function luzEm(C, lat, lon) {
    /* O relógio do mundo é `m.tempo.segMundo`, e quem o decompõe é
       U.decomporTempo (world.js:608 faz exatamente isto). Não recalculamos a
       conta do calendário aqui: seria um segundo calendário. */
    var dec = (U.decomporTempo && C.m.tempo)
      ? U.decomporTempo(C.m.tempo.segMundo) : null;
    var dia = dec ? dec.diaDoAno : 0;
    var hora = dec ? (dec.hora + dec.min / 60) : 12;
    /* declinação solar, aproximação de Cooper (1969) */
    var decl = 23.45 * Math.sin(2 * Math.PI * (284 + dia) / 365) * RAD;
    /* ângulo horário: a hora do mundo é a hora local da região; para outro
       ponto do globo, desloca com a longitude. */
    var lonRef = C.frame.lon;
    var horaLocal = hora + (lon - lonRef) / 15;
    var H = (horaLocal - 12) * 15 * RAD;
    var la = lat * RAD;
    var senoAlt = Math.sin(la) * Math.sin(decl) + Math.cos(la) * Math.cos(decl) * Math.cos(H);
    var altSol = Math.asin(U.clamp(senoAlt, -1, 1));
    var nuvem = C.W.luzNoite ? 0 : 0;
    var direta = Math.max(0, senoAlt);
    /* céu difuso: nunca é breu absoluto de dia nublado, nem zero no crepúsculo */
    var difusa = U.clamp01(0.18 + senoAlt * 0.25);
    return {
      valor: U.clamp01(direta * 0.82 + Math.max(0, difusa) * 0.18),
      direta: direta,
      difusa: Math.max(0, difusa),
      alturaSolarGraus: altSol * DEG,
      dia: senoAlt > 0,
      horaLocal: ((horaLocal % 24) + 24) % 24,
      nuvem: nuvem
    };
  }

  /* --- recursos ------------------------------------------------------------ */
  function recursosEm(C, bioma, def, dentroRegiao, loc, wReg) {
    var lista = [];
    var flora = def.flora || [];
    for (var i = 0; i < flora.length; i++) {
      var f = D.FLORA[flora[i]];
      if (!f) continue;
      lista.push({
        id: flora[i], nome: f.nome, classe: 'flora',
        colheita: f.colheita || (f.fruto || null),
        densidade: def.vegetacao || 0,
        origem: 'D.BIOMAS.' + bioma + '.flora'
      });
    }
    if (def.agua) {
      lista.push({ id: bioma === 'oceano' ? 'agua_salgada' : 'agua_doce',
                   nome: bioma === 'oceano' ? 'Água salgada' : 'Água doce',
                   classe: 'agua', beberivel: bioma !== 'oceano',
                   densidade: 1, origem: 'D.BIOMAS.' + bioma + '.agua' });
    }
    if (def.dureza > 0.5) {
      lista.push({ id: 'pedra', nome: 'Pedra', classe: 'mineral',
                   densidade: def.dureza, origem: 'D.BIOMAS.' + bioma + '.dureza' });
    }
    return {
      potencial: lista,
      escopo: (wReg >= 1) ? 'regiao_materializada' : 'potencial_do_bioma',
      nota: (wReg >= 1)
        ? 'dentro da regiao o que EXISTE esta em m.plantas/m.objetos; isto e o que PODE existir.'
        : 'fora da regiao nada foi materializado ainda; isto e o potencial do bioma.'
    };
  }

  /* ==========================================================================
     PINTURA — a superfície vira pixel. Devolve números, a página é que desenha.
     ==========================================================================
     Preenche um buffer RGBA. A câmera é um ponto do globo mais quantos metros
     a tela atravessa. A projeção é a MESMA do contrato de endereço, então o
     pixel que o dedo toca vira endereço exato, em qualquer nível de zoom.
     ========================================================================== */

  /* Paleta Morphic Terrain — fria, mineral, sem verde ou azul saturado.
     Cada material tem uma cor base e uma variação, e a microestrutura nasce
     de ruído, não de textura carregada. */
  var PALETA = {
    oceano_fundo: [21, 36, 49],
    oceano_raso: [58, 98, 110],
    recife: [52, 104, 110],
    praia: [148, 138, 112],
    prado: [104, 118, 78],
    floresta: [56, 78, 62],
    tropical: [48, 78, 60],
    savana: [136, 128, 84],
    deserto: [166, 150, 112],
    montanha: [104, 102, 104],
    taiga: [60, 76, 72],
    tundra: [140, 148, 150],
    pantano: [70, 80, 62],
    rio: [46, 84, 100],
    lago: [44, 80, 98],
    neve: [206, 212, 214],
    rocha: [92, 90, 96]
  };

  function corDoBioma(b) { return PALETA[b] || PALETA.prado; }

  /* Cor de base bilinear entre os quatro tiles vizinhos da região. */
  function corBiomaMisturada(C, x, y, destino, off) {
    var tam = C.tam;
    var fx = U.clamp(x - 0.5, 0, tam - 1.0001), fy = U.clamp(y - 0.5, 0, tam - 1.0001);
    var x0 = Math.floor(fx), y0 = Math.floor(fy);
    var x1 = Math.min(x0 + 1, tam - 1), y1 = Math.min(y0 + 1, tam - 1);
    var tx = fx - x0, ty = fy - y0;
    var ids = C.W.BIOMA_IDS, tp = C.reg.tipo;
    var a = PALETA[ids[tp[y0 * tam + x0]]] || PALETA.prado;
    var b = PALETA[ids[tp[y0 * tam + x1]]] || PALETA.prado;
    var c = PALETA[ids[tp[y1 * tam + x0]]] || PALETA.prado;
    var d = PALETA[ids[tp[y1 * tam + x1]]] || PALETA.prado;
    for (var k = 0; k < 3; k++) {
      var t0 = a[k] + (b[k] - a[k]) * tx;
      var t1 = c[k] + (d[k] - c[k]) * tx;
      destino[off + k] = t0 + (t1 - t0) * ty;
    }
  }

  /* Chave de cache do quadro: se nada disso mudou, o quadro anterior serve. */
  function chaveDeCamera(cam, larg, alt, oit, passo) {
    return [cam.centro.x.toFixed(9), cam.centro.y.toFixed(9), cam.centro.z.toFixed(9),
            cam.metrosNaTela.toExponential(6), larg, alt, oit.toFixed(3), passo,
            cam.giro ? cam.giro.toFixed(6) : 0].join('|');
  }

  /* ==========================================================================
     PINTURA DE QUADRO — grade grossa para o que é grosso, pixel para o resto
     ==========================================================================
       cam = { centro: dir unitaria, metrosNaTela, giro? }
       destino = { larg, alt, dados: Uint8ClampedArray(larg*alt*4) }

     Três passagens:
       1. grade grossa, uma amostra a cada GRADE pixels — lat/lon, campos
          planetários, posição local na região e as oitavas de baixa
          frequência, que mal mudam ao longo do quadro;
       2. por amostra — as oitavas altas, que são o detalhe de verdade,
          somadas ao que veio interpolado da grade grossa;
       3. gradiente e cor a partir do buffer de altura já pronto, o que evita
          reavaliar a elevação duas vezes por pixel só para achar a normal.

     A soma é a MESMA de `elevacaoDaDir`, apenas particionada. O teste S12
     prova isso comparando os dois caminhos pixel a pixel.
     ========================================================================== */
  var GRADE = 16;              /* lado da célula da grade grossa, em pixels */

  function interp2(A, nx, gx, gy, tx, ty) {
    var i0 = gy * nx + gx, i1 = i0 + 1, i2 = i0 + nx, i3 = i2 + 1;
    var a = A[i0] + (A[i1] - A[i0]) * tx;
    var b = A[i2] + (A[i3] - A[i2]) * tx;
    return a + (b - a) * ty;
  }

  function pintarQuadro(C, cam, destino, opcoes) {
    opcoes = opcoes || {};
    var agora = (typeof performance !== 'undefined' && performance.now)
      ? function () { return performance.now(); } : function () { return Date.now(); };
    var t0 = agora();
    var larg = destino.larg, alt = destino.alt, px = destino.dados;
    var M = cam.metrosNaTela;
    var oit = (typeof opcoes.oitavas === 'number') ? opcoes.oitavas : oitavasDoZoom(M);

    var passo = Math.max(1, (opcoes.amostragem | 0) || 1);

    /* PINTURA EM FAIXA — o refino sem travar o quadro.

       Refinar a tela inteira de uma vez, na amostragem 1, custou meio segundo
       num quadro só. Meio segundo é uma tela congelada, e uma tela congelada
       é pior que uma tela um pouco mais grossa. Aqui a pintura aceita um
       intervalo de linhas: a página refina uma faixa por quadro, e o que se
       vê é a imagem ficando nítida de cima para baixo sem nunca parar.

       O campo é o mesmo em toda faixa, então não existe emenda entre elas:
       a faixa de baixo, quando chegar, vai desenhar exatamente o que a de
       cima já desenhou na fronteira. */
    var faixa = opcoes.faixa || null;
    var chave = chaveDeCamera(cam, larg, alt, oit, passo);
    if (!faixa && !opcoes.forcar && C.cache.chave === chave && C.cache.buffer &&
        C.cache.larg === larg && C.cache.alt === alt) {
      px.set(C.cache.buffer);
      return { reaproveitado: true, ms: 0, amostras: 0, oitavas: oit,
               nivel: nivelDoZoom(M).id, metrosPorPixel: M / larg };
    }

    var f = C.E.frameEmDir(cam.centro);
    var Rm = C.Rm;
    var mPorPx = M / larg;
    var cx = (larg - 1) * 0.5, cy = (alt - 1) * 0.5;
    var giro = cam.giro || 0, cg = Math.cos(giro), sg = Math.sin(giro);

    /* oitavas efetivas de cada campo e onde cortar entre grosso e fino */
    var mppEfetivo = mPorPx * passo;
    function teto(freq0, pedida) {
      return Math.max(0, Math.min(pedida, oitavaMaxima(Rm, freq0, mppEfetivo)));
    }
    /* O único limite de quantas oitavas entram é o pixel. `oitavasDoZoom`
       servia de limite antes e era curta demais: a 60 km de tela ela parava
       na oitava 7, cujo comprimento de onda é 15 km, e o terreno saía liso.
       Agora ela é só uma referência, e quem manda é Nyquist. */
    var oitD1 = teto(3.1, OITAVAS_MAX);
    var oitD2 = teto(11.0, OITAVAS_MAX);
    var oitFino = teto(900, OITAVAS_MAX);
    var oitGrao = teto(520, OITAVAS_MAX + 6);
    var oitUmid = teto(24, Math.min(oit, 9));
    /* TEXTURA DA SUPERFÍCIE DO MAR — uma escada de oitavas própria, do
       vórtice de mesoescala (40 km) até a marola que cabe num pixel.

       Foi preciso porque medir revelou uma faixa morta: entre 25 km e 2 km de
       tela o mar aberto ficava numa cor só. O vórtice já não se via e a onda
       ainda não. Em vez de inventar um efeito para tapar esse buraco, a
       solução é a mesma do relevo: uma série de oitavas contínua, em que
       sempre existe uma na escala da tela. Fisicamente cada oitava tem nome —
       vórtice, meandro, grupo de ondas, faixa de espuma, marola — e todas
       existem no mar de verdade ao mesmo tempo. */
    var FREQ_MAR = 160;                              /* oitava 0 ~ 40 km */
    var oitMar = teto(FREQ_MAR, OITAVAS_MAX + 6);

    /* Onde comeca a parte fina: o MAIOR entre o corte de escala de tela e o
       inicio da janela das ultimas oitavas. Os dois sao limites inferiores e
       valem os dois. Uma oitava so e avaliada por pixel se ela muda dentro do
       quadro E se ainda tem amplitude que importe. */
    function inicioFino(freq0, oitEfetiva) {
      return Math.max(oitavaDeCorte(Rm, freq0, M),
                      Math.max(0, Math.ceil(oitEfetiva) - JANELA_FINA));
    }
    var kD1 = inicioFino(3.1, oitD1);
    var kD2 = inicioFino(11.0, oitD2);
    var kFi = inicioFino(900, oitFino);
    var kUm = inicioFino(24, oitUmid);

    var nD1 = normaFbm(oitD1), nD2 = normaFbm(oitD2);
    var nFi = normaFbm(oitFino), nUm = normaFbm(oitUmid);
    /* a rugosidade de metro tem amplitude de 3,2 m: so existe quando um pixel
       vale menos de 2 m. Acima disso ela e menor que o proprio pixel. */
    var temFino = (oit > 9) && (mppEfetivo < 2) && oitFino > 0;
    var pesoFino = U.clamp01(oit - 9);

    /* ---------- passagem 1 · grade grossa ---------- */
    var nx = Math.ceil(larg / GRADE) + 2, ny = Math.ceil(alt / GRADE) + 2;
    var nG = nx * ny;
    var gBase = new Float32Array(nG), gTemp = new Float32Array(nG), gPrec = new Float32Array(nG);
    var gD1 = new Float32Array(nG), gD2 = new Float32Array(nG);
    var gFi = new Float32Array(nG), gUm = new Float32Array(nG);
    var gOnda = new Float32Array(nG), gVU = new Float32Array(nG), gVV = new Float32Array(nG);
    var gTMar = new Float32Array(nG);
    var gLx = new Float64Array(nG), gLy = new Float64Array(nG);
    var meio = C.tam * 0.5;

    for (var gj = 0; gj < ny; gj++) {
      for (var gi = 0; gi < nx; gi++) {
        var pxS = (gi * GRADE) - GRADE * 0.5, pyS = (gj * GRADE) - GRADE * 0.5;
        var sx = (pxS - cx) * mPorPx, sy = (pyS - cy) * mPorPx;
        var dL = sx * cg + sy * sg, dN = -sy * cg + sx * sg;
        var dirG = C.E.dirDeslocada(f, dL, dN, Rm);
        var llG = C.T.latLonDeDir(dirG.x, dirG.y, dirG.z);
        var iG = gj * nx + gi;
        gBase[iG] = bilinear(C.P, C.P.elevacao, llG.lat, llG.lon, true);
        gTemp[iG] = bilinear(C.P, C.P.temperatura, llG.lat, llG.lon, false);
        gPrec[iG] = bilinear(C.P, C.P.precipitacao, llG.lat, llG.lon, false);
        gD1[iG] = fbmJanela(dirG, oitD1, C.seedRelevo, 3.1, 0, kD1, false);
        gD2[iG] = fbmJanela(dirG, oitD2, C.seedRelevo + 101, 11.0, 0, kD2, true);
        gFi[iG] = temFino ? fbmJanela(dirG, oitFino, C.seedRelevo + 777, 900, 0, kFi, false) : 0;
        gUm[iG] = fbmJanela(dirG, oitUmid, C.seedUmidade, 24, 0, kUm, false);
        gOnda[iG] = bilinear(C.P, C.P.onda, llG.lat, llG.lon, false);
        gVU[iG] = bilinear(C.P, C.P.ventoU, llG.lat, llG.lon, false);
        gVV[iG] = bilinear(C.P, C.P.ventoV, llG.lat, llG.lon, false);
        gTMar[iG] = bilinear(C.P, C.P.tempMar, llG.lat, llG.lon, false);
        /* mesoescala: o campo de vórtices do oceano, na escala em que ele
           existe de verdade (dezenas de quilômetros). É o que faz o mar
           aberto não ser uma chapa de cor a 20 km de altura. */
        /* posição local na região, pela MESMA projeção do contrato de endereço */
        var locG = localDaDir(C, dirG);
        gLx[iG] = locG.x; gLy[iG] = locG.y;
      }
    }

    /* ---------- sol, uma vez por quadro ---------- */
    var llC = C.T.latLonDeDir(cam.centro.x, cam.centro.y, cam.centro.z);
    var lz = luzEm(C, llC.lat, llC.lon);
    /* DIREÇÃO DO SOL EM TRÊS COMPONENTES.

       Antes o sombreado era o produto escalar do gradiente por um vetor
       horizontal, clampeado. Numa encosta suave funciona; num barranco de rio
       de 45 cm em 1 metro, que é o que o world.js escava, o produto estoura e
       o resultado na tela foi uma escadaria preta e branca. O erro não era o
       barranco, era a conta: sombreamento é o cosseno entre a NORMAL da
       superfície e a direção do sol, e cosseno não estoura.

       A componente vertical do sol vem da altura solar real; a horizontal, do
       azimute. Ao meio-dia o sol está em cima e o relevo quase some, ao
       amanhecer ele rasa e o relevo salta. Isso é o que a luz faz. */
    var azSol = (lz.horaLocal - 12) * 15 * RAD;
    var senoAlt = U.clamp01(lz.direta);
    var cosAlt = Math.sqrt(Math.max(0, 1 - senoAlt * senoAlt));
    var solE = -Math.sin(azSol) * cosAlt;
    var solN = -Math.cos(azSol) * 0.35 * cosAlt;
    var solZ = Math.max(0.22, senoAlt);
    var nS = Math.sqrt(solE * solE + solN * solN + solZ * solZ) || 1;
    solE /= nS; solN /= nS; solZ /= nS;

    /* ---------- passagem 2 · altura por amostra ---------- */
    var nAx = Math.ceil(larg / passo), nAy = Math.ceil(alt / passo);
    /* linhas de amostra a calcular. Uma a mais em cada ponta, porque a
       passagem do gradiente olha a vizinha. */
    var ajIni = faixa ? Math.max(0, Math.floor(faixa.de / passo) - 1) : 0;
    var ajFim = faixa ? Math.min(nAy, Math.ceil(faixa.ate / passo) + 1) : nAy;
    var H = new Float32Array(nAx * nAy);
    var BIO = new Uint8Array(nAx * nAy);
    var UMI = new Float32Array(nAx * nAy);
    var TEM = new Float32Array(nAx * nAy);
    var GRAO = new Float32Array(nAx * nAy);
    /* Segunda textura, de ARESTA. O grão liso serve para solo; rocha não é
       lisa, é quebrada. Ruído de crista na escala do pixel dá a fratura que
       faz o chão parecer chão e não uma nuvem cinza. Entra pesado pela dureza
       do bioma e pelo declive, que é onde a rocha de fato aparece. */
    var FRAT = new Float32Array(nAx * nAy);
    var COR = new Float32Array(nAx * nAy * 3);   /* cor de base, já misturada */
    var WREG = new Float32Array(nAx * nAy);      /* peso da autoridade do motor */
    /* Profundidade de água PARADA lida do motor: reg.prof e reg.aguaZ.
       Rio e lago existem nesses dois arrays mesmo quando `reg.tipo` não os
       registra — ver o achado S11. Ler `prof` em vez de `tipo` é o que faz o
       Lago Gênesis aparecer sem que world.js precise ser tocado. */
    var AGUA = new Float32Array(nAx * nAy);
    var ONDA = new Float32Array(nAx * nAy);      /* altura significativa, m */
    var FASE = new Float32Array(nAx * nAy);      /* fase da onda no ponto */
    var MESO = new Float32Array(nAx * nAy);      /* vórtice de mesoescala */
    var TMAR = new Float32Array(nAx * nAy);
    /* relógio do mundo: a onda anda. Se a simulação parar, ela para junto. */
    var tOnda = (C.m.tempo ? C.m.tempo.segMundo : 0);
    var amostras = 0;
    var idOceano = C.W.BIOMA_IDS.indexOf('oceano');

    for (var aj = ajIni; aj < ajFim; aj++) {
      var j = aj * passo;
      var fgy = (j + GRADE * 0.5) / GRADE;
      var gy = Math.min(Math.max(Math.floor(fgy), 0), ny - 2);
      var ty = fgy - gy;
      var sy2 = (j - cy) * mPorPx;
      for (var ai = 0; ai < nAx; ai++) {
        var i = ai * passo;
        var fgx = (i + GRADE * 0.5) / GRADE;
        var gx = Math.min(Math.max(Math.floor(fgx), 0), nx - 2);
        var tx = fgx - gx;
        var sx2 = (i - cx) * mPorPx;
        var dL2 = sx2 * cg + sy2 * sg, dN2 = -sy2 * cg + sx2 * sg;
        var dir = C.E.dirDeslocada(f, dL2, dN2, Rm);
        amostras++;

        /* posição local: interpolada da grade grossa. A curvatura entre dois
           nós é de segunda ordem em (célula/raio) e some no arredondamento. */
        var lx = interp2(gLx, nx, gx, gy, tx, ty);
        var ly = interp2(gLy, nx, gx, gy, tx, ty);
        var dRad = distanciaDaBacia(C, lx, ly);
        var raioB = (dRad < C.raioBacia * 1.5) ? raioDaBacia(C, dir) : C.raioBacia;
        var wReg = (dRad >= raioB) ? 0 : pesoDeDistancia(C, dRad);

        var h, bioma;
        if (wReg >= 1) {
          h = lerRegCubica(C.reg, C.reg.alturaTerreno, lx, ly);
        } else {
          /* MESMA ordem de elevacaoDaDir: a bacia deprime a base, o detalhe
             entra por cima. Trocar a ordem devolve o fundo de mar liso. */
          var basePlan = interp2(gBase, nx, gx, gy, tx, ty);
          var base = (dRad < raioB) ? baseComBacia(C, dRad, basePlan, raioB) : basePlan;
          var amp = amplitudeDoRelevo(base);
          var d1 = (interp2(gD1, nx, gx, gy, tx, ty) +
                    fbmJanela(dir, oitD1, C.seedRelevo, 3.1, kD1, OITAVAS_MAX + 1, false)) / nD1;
          var d2 = (interp2(gD2, nx, gx, gy, tx, ty) +
                    fbmJanela(dir, oitD2, C.seedRelevo + 101, 11.0, kD2, OITAVAS_MAX + 1, true)) / nD2;
          var fino = 0;
          if (temFino) {
            fino = ((interp2(gFi, nx, gx, gy, tx, ty) +
                     fbmJanela(dir, oitFino, C.seedRelevo + 777, 900, kFi, OITAVAS_MAX + 1, false)) / nFi)
                   * 3.2 * pesoFino;
          }
          h = base + d1 * amp.macro + d2 * 260 * amp.terraness + fino;
          if (wReg > 0) h += (lerRegExtrapolada(C.reg, C.reg.alturaTerreno, lx, ly) - h) * wReg;
        }

        var iA = aj * nAx + ai;
        H[iA] = h;
        WREG[iA] = wReg;

        if (h < NIVEL_MAR) {
          var hs = Math.max(0.15, interp2(gOnda, nx, gx, gy, tx, ty));
          var vu = interp2(gVU, nx, gx, gy, tx, ty), vv = interp2(gVV, nx, gx, gy, tx, ty);
          var nv = Math.hypot(vu, vv) || 1;
          /* comprimento de onda a partir da altura significativa:
             T ~ 3,86*sqrt(Hs) e lambda = 1,56*T^2  ->  lambda ~ 23*Hs.
             Em agua rasa a onda encurta; o fator de profundidade e a
             aproximacao de aguas intermediarias, tanh(kh). */
          var lam = Math.max(6, 23 * hs);
          var prof2 = NIVEL_MAR - h;
          if (prof2 < lam * 0.5) lam *= Math.max(0.35, Math.tanh(6.2832 * prof2 / lam));
          var per = Math.sqrt(6.2832 * lam / 9.81);
          var kx = (vu / nv) / lam, ky = (vv / nv) / lam;
          var fase = (dL2 * kx + dN2 * ky) * 6.2832 - (6.2832 / per) * tOnda;
          /* segundo trem cruzado a 34 graus: mar real nunca e uma onda so */
          var c34 = 0.829, s34 = 0.559;
          var kx2 = (kx * c34 - ky * s34) * 1.37, ky2 = (kx * s34 + ky * c34) * 1.37;
          var fase2 = (dL2 * kx2 + dN2 * ky2) * 6.2832 - (6.2832 / (per * 0.86)) * tOnda;
          ONDA[iA] = hs;
          FASE[iA] = Math.sin(fase) * 0.62 + Math.sin(fase2) * 0.38;
          /* visibilidade da onda: abaixo de tres pixels por comprimento de
             onda ela vira cintilacao, entao some — Nyquist outra vez. */
          var visOnda = U.clamp01(lam / (3 * mPorPx * passo));
          FASE[iA] *= visOnda;
          MESO[iA] = fbmVisivel(dir, oitMar, C.seedCosta + 33, FREQ_MAR,
                                JANELA_TEXTURA, false);
          TMAR[iA] = interp2(gTMar, nx, gx, gy, tx, ty);
        }

        /* A COSTURA DA BORDA DA REGIÃO — medida, não suposta.

           A altura já atravessava a borda sem degrau, mas a COR não. Dentro,
           ela vinha misturada entre os quatro tiles vizinhos; um micrômetro
           depois, virava a cor pura do bioma classificado. Onde a mistura
           tinha um pouco de praia e o lado de fora era oceano puro, o salto
           chegava a cem níveis, e o que aparecia na tela era um risco
           horizontal atravessando o quadro inteiro, exatamente na latitude da
           borda sul da Ilha Gênesis.

           Agora os dois lados são calculados sempre que há mistura, e a
           transição de cor usa o MESMO peso que a transição de altura. Uma
           borda só, um peso só. */
        if (wReg > 0) {
          var lxc = lx, lyc = ly;
          corBiomaMisturada(C, lxc, lyc, COR, iA * 3);
          BIO[iA] = (wReg >= 0.5) ? lerRegVizinho(C.reg, C.reg.tipo, lxc, lyc) : 255;
          var umR = lerRegExtrapolada(C.reg, C.reg.umidade, lxc, lyc);
          var teR = lerRegExtrapolada(C.reg, C.reg.temperatura, lxc, lyc);
          if (C.reg.prof && C.reg.aguaZ) {
            var pAg = lerRegBilinear(C.reg, C.reg.prof, lxc, lyc);
            if (pAg > 0.02) {
              AGUA[iA] = Math.max(0, lerRegBilinear(C.reg, C.reg.aguaZ, lxc, lyc) - h) * wReg;
            }
          }
          if (wReg >= 1) { UMI[iA] = umR; TEM[iA] = teR; }
          else {
            var tPb = interp2(gTemp, nx, gx, gy, tx, ty) - Math.max(0, h) * LAPSE;
            var pPb = interp2(gPrec, nx, gx, gy, tx, ty);
            var uRb = (interp2(gUm, nx, gx, gy, tx, ty) +
                       fbmJanela(dir, oitUmid, C.seedUmidade, 24, kUm, OITAVAS_MAX + 1, false)) / nUm;
            var u0b = U.clamp01(U.clamp01(pPb / 6) * 0.65 + (uRb * 0.5 + 0.5) * 0.35);
            UMI[iA] = u0b + (umR - u0b) * wReg;
            TEM[iA] = tPb + (teR - tPb) * wReg;
          }
        } else {
          COR[iA * 3] = -1;
          var tP = interp2(gTemp, nx, gx, gy, tx, ty) - Math.max(0, h) * LAPSE;
          var pP = interp2(gPrec, nx, gx, gy, tx, ty);
          var uR = (interp2(gUm, nx, gx, gy, tx, ty) +
                    fbmJanela(dir, oitUmid, C.seedUmidade, 24, kUm, OITAVAS_MAX + 1, false)) / nUm;
          var u0 = U.clamp01(U.clamp01(pP / 6) * 0.65 + (uR * 0.5 + 0.5) * 0.35);
          UMI[iA] = u0;
          TEM[iA] = tP;
          BIO[iA] = 255;                 /* decidido na passagem 3, com declive */
        }
        /* grão guardado para a cor, já somado grosso + fino */
        /* Textura de SOLO só onde há solo. Sobre o mar ela era calculada e
           jogada fora, e o mar é três quartos do planeta: metade do custo de
           um quadro de oceano ia embora aí. */
        if (h >= NIVEL_MAR) {
          GRAO[iA] = fbmVisivel(dir, oitGrao, C.seedSolo, 520, JANELA_TEXTURA, false);
          FRAT[iA] = fbmVisivel(dir, oitGrao, C.seedSolo + 91, 1300, 3.0, true);
        }
      }
    }

    /* ---------- passagem 3 · gradiente e cor ---------- */
    var dxM = passo * mPorPx;
    /* MICROESTRUTURA. O grão é a única coisa que separa "chão" de "mancha de
       cor" quando um pixel vale menos de um palmo. Ele cresce com o zoom em
       vez de ficar fixo: a 200 km de tela um grão forte seria ruído; a 8
       metros, um grão fraco é chão de plástico. */
    var finura = U.clamp01(1 - Math.log(Math.max(0.002, mppEfetivo)) / Math.LN10 / 3);
    var amplitudeGrao = 9 + 30 * finura;
    var luzGlobal = 0.42 + 0.58 * U.clamp01(lz.valor);

    var bjIni = faixa ? Math.max(0, Math.floor(faixa.de / passo)) : 0;
    var bjFim = faixa ? Math.min(nAy, Math.ceil(faixa.ate / passo)) : nAy;
    for (var bj = bjIni; bj < bjFim; bj++) {
      for (var bi = 0; bi < nAx; bi++) {
        var k = bj * nAx + bi;
        var h2 = H[k];
        var hE = H[bj * nAx + Math.min(bi + 1, nAx - 1)];
        var hW = H[bj * nAx + Math.max(bi - 1, 0)];
        var hS = H[Math.min(bj + 1, ajFim - 1) * nAx + bi];
        var hN2 = H[Math.max(bj - 1, ajIni) * nAx + bi];
        var gE = (hE - hW) / (2 * dxM);
        var gN = (hN2 - hS) / (2 * dxM);   /* +y da tela e o SUL */
        var dcl = Math.sqrt(gE * gE + gN * gN);

        var bioId = BIO[k], bioma;
        var biomaFora = classificarBioma(alturaNaEscalaDoClassificador(h2),
                                         U.clamp01(UMI[k] - U.clamp01(dcl) * 0.18), TEM[k]);
        bioma = (bioId === 255) ? biomaFora : C.W.BIOMA_IDS[bioId];

        /* cor de base: mistura entre o lado do motor e o lado procedural,
           com o MESMO peso que a altura usou */
        var wr = WREG[k];
        var cr = COR[k * 3], cg = COR[k * 3 + 1], cb = COR[k * 3 + 2];
        if (cr >= 0 && wr < 1) {
          var cf = corDoBioma(biomaFora);
          cr = cf[0] + (cr - cf[0]) * wr;
          cg = cf[1] + (cg - cf[1]) * wr;
          cb = cf[2] + (cb - cf[2]) * wr;
        }

        var cor = corDeAmostra(bioma, h2, gE, gN, dcl, UMI[k], TEM[k],
                               GRAO[k], amplitudeGrao, solE, solN, solZ, luzGlobal, lz, AGUA[k],
                               ONDA[k], FASE[k], MESO[k], TMAR[k], cr, cg, cb, FRAT[k], finura);

        var j2 = bj * passo, i2 = bi * passo;
        var jFim = Math.min(j2 + passo, alt), iFim = Math.min(i2 + passo, larg);
        for (var jj = j2; jj < jFim; jj++) {
          var p0 = (jj * larg + i2) * 4;
          for (var ii = i2; ii < iFim; ii++) {
            px[p0] = cor[0]; px[p0 + 1] = cor[1]; px[p0 + 2] = cor[2]; px[p0 + 3] = 255;
            p0 += 4;
          }
        }
      }
    }

    var t1 = agora();
    if (!faixa) {
      C.cache.chave = chave;
      C.cache.larg = larg; C.cache.alt = alt;
      C.cache.buffer = px.slice(0);
    } else {
      C.cache.chave = null;      /* faixa: o quadro deixou de ser homogêneo */
    }
    C.custo.amostras += amostras;
    C.custo.msTotal += (t1 - t0);
    C.ultimoQuadro = { H: H, nAx: nAx, nAy: nAy, passo: passo, cam: cam };
    return { reaproveitado: false, ms: t1 - t0, amostras: amostras, oitavas: oit,
             faixa: faixa ? (faixa.de + '..' + faixa.ate) : 'quadro inteiro',
             amostragem: passo,
             metrosPorPixel: mPorPx, nivel: nivelDoZoom(M).id,
             cortes: { relevo: kD1, crista: kD2, fino: kFi, umidade: kUm,
                       textura: 'janela visivel de ' + JANELA_TEXTURA + ' oitavas' },
             oitavasEfetivas: { relevo: +oitD1.toFixed(2), crista: +oitD2.toFixed(2),
                                fino: temFino ? +oitFino.toFixed(2) : 0,
                                mar: +oitMar.toFixed(2), grao: +oitGrao.toFixed(2),
                                umidade: +oitUmid.toFixed(2) },
             grade: nx + 'x' + ny };
  }

  /* Cor de uma amostra. Tudo deriva de estado: altura, declive, bioma,
     umidade, temperatura, luz. Nenhuma cor escolhida por gosto sem número. */
  function corDeAmostra(bioma, h, gE, gN, dcl, umid, temp, grao, ampGrao,
                        solE, solN, solZ, luzGlobal, lz, aguaDoce, onda, fase, meso, tmar,
                        cr0, cg0, cb0, fratura, finura) {
    var c = corDoBioma(bioma);
    /* Dentro da região a cor de base vem MISTURADA entre os quatro tiles
       vizinhos. O bioma continua sendo categoria (interpolar categoria seria
       inventar bioma), mas a COR dele não precisa ter degrau de um metro: o
       que aparecia na tela era um mosaico de quadrados, e o mundo não tem
       quadrados de um metro. */
    var r = (cr0 >= 0) ? cr0 : c[0];
    var g = (cr0 >= 0) ? cg0 : c[1];
    var b = (cr0 >= 0) ? cb0 : c[2];

    if (aguaDoce > 0.02) {
      /* ÁGUA DOCE PARADA — rio e lago, lidos de reg.prof/reg.aguaZ. A cor é a
         profundidade, como no mar: raso deixa ver o leito, fundo não. */
      var td = U.clamp01(Math.pow(U.clamp01(aguaDoce / 2.2), 0.6));
      var cr = PALETA.rio;
      r = r + (cr[0] - r) * (0.55 + 0.45 * td);
      g = g + (cr[1] - g) * (0.55 + 0.45 * td);
      b = b + (cr[2] - b) * (0.55 + 0.45 * td);
      var brD = U.clamp01(lz.direta) * 0.16;
      r += 30 * brD; g += 36 * brD; b += 40 * brD;
      var k3 = (0.72 + 0.28 * U.clamp01(lz.valor)) * luzGlobal / Math.max(0.2, luzGlobal);
      r *= luzGlobal; g *= luzGlobal; b *= luzGlobal;
      return [U.clamp(r, 0, 255) | 0, U.clamp(g, 0, 255) | 0, U.clamp(b, 0, 255) | 0];
    }

    if (h < NIVEL_MAR) {
      /* ÁGUA DO MAR — três coisas somadas, todas vindas de estado:

         1. a PROFUNDIDADE, que é a cor de base (batimetria visível);
         2. a ONDA, cuja altura significativa e direção vêm de P.onda e do
            vento de P.ventoU/V, com comprimento derivado de Hs e fase que
            anda com o relógio do mundo;
         3. a MESOESCALA, o campo de vórtices na escala de dezenas de
            quilômetros, que é a razão física de o mar aberto nunca ser uma
            chapa de cor uniforme numa foto de satélite.

         Sem (2) e (3) o oceano fica liso em todo zoom, e liso é o defeito
         que este trabalho existe para matar. */
      var prof = NIVEL_MAR - h;
      var t = U.clamp01(Math.pow(U.clamp01(prof / 4000), 0.42));
      var raso = PALETA.oceano_raso, fundo = PALETA.oceano_fundo;
      r = raso[0] + (fundo[0] - raso[0]) * t;
      g = raso[1] + (fundo[1] - raso[1]) * t;
      b = raso[2] + (fundo[2] - raso[2]) * t;

      /* textura da superfície: vórtice, meandro, grupo de ondas, faixa de
         espuma e marola, conforme a escala que a tela alcança. Água mais
         quente e pobre puxa para o azul mineral, mais fria e produtiva puxa
         para o verde-petróleo. */
      var mm = (meso || 0);
      var frio = U.clamp01((18 - (tmar || 18)) / 16);
      r += mm * 11.0 - frio * 3.0;
      g += mm * 8.0 + frio * 5.0;
      b += mm * 15.0 - frio * 2.0;

      /* onda: crista clara, cava escura, e espuma onde a crista fecha */
      var ff = fase || 0;
      var hs = onda || 0;
      var ganhoOnda = 9 + 16 * U.clamp01(hs / 3);
      r += ff * ganhoOnda; g += ff * ganhoOnda * 1.05; b += ff * ganhoOnda * 1.12;
      if (ff > 0.62 && hs > 1.1) {
        var kf = U.clamp01((ff - 0.62) / 0.38) * U.clamp01((hs - 1.1) / 2);
        r += (198 - r) * kf * 0.5; g += (208 - g) * kf * 0.5; b += (210 - b) * kf * 0.5;
      }

      /* arrebentação na costa: o fundo sobe e a onda quebra */
      if (prof < 12) {
        var esp = 1 - prof / 12;
        var k = U.clamp01(esp * esp * ((meso || 0) * 0.5 + 0.5) * 0.9);
        r += (196 - r) * k * 0.55; g += (206 - g) * k * 0.55; b += (208 - b) * k * 0.55;
      }
      var bri = U.clamp01(lz.direta) * 0.10;
      r += 26 * bri; g += 30 * bri; b += 34 * bri;
    } else {
      /* o grão entra com sinal e com aspereza: |g|^0.75 preserva o contraste
         das bordas em vez de borrar tudo numa nuvem macia */
      var gr2 = (grao < 0 ? -1 : 1) * Math.pow(Math.abs(grao), 0.75);
      r += gr2 * ampGrao; g += gr2 * ampGrao * 0.92; b += gr2 * ampGrao * 0.82;

      /* fratura: só onde há rocha para fraturar, e só quando o pixel é
         pequeno o bastante para que ela signifique alguma coisa */
      var dureza = (D.BIOMAS[bioma] ? D.BIOMAS[bioma].dureza : 0.2);
      var kfr = U.clamp01(dureza * 0.8 + U.clamp01(dcl) * 0.5) * (finura || 0);
      if (kfr > 0.02) {
        var fr = (fratura || 0) * kfr * 26;
        r += fr; g += fr * 0.97; b += fr * 1.03;
      }
      if (temp < 1) {
        var kn = U.clamp01((1 - temp) / 9) * 0.88;
        r += (PALETA.neve[0] - r) * kn; g += (PALETA.neve[1] - g) * kn; b += (PALETA.neve[2] - b) * kn;
      }
      /* rocha exposta começa onde o solo não fica: acima de uns 35 graus,
         que é 0,7 m/m. 0,35 punha barranco de rio de 24 graus como rocha nua
         e pintava a margem inteira de cinza. */
      if (dcl > 0.7) {
        var kr = U.clamp01((dcl - 0.7) / 0.8);
        r += (PALETA.rocha[0] - r) * kr; g += (PALETA.rocha[1] - g) * kr; b += (PALETA.rocha[2] - b) * kr;
      }
      var ku = U.clamp01(umid) * 0.16;
      r *= (1 - ku); g *= (1 - ku * 0.9); b *= (1 - ku * 0.7);
    }

    /* Lambert de verdade: cosseno entre a normal e o sol. Limitado por
       construção, não por clamp. */
    var inv = 1 / Math.sqrt(gE * gE + gN * gN + 1);
    var lam = (-gE * solE - gN * solN + solZ) * inv;
    var k2 = (0.42 + 0.58 * U.clamp01(lam)) * luzGlobal;
    r *= k2; g *= k2; b *= k2;
    return [U.clamp(r, 0, 255) | 0, U.clamp(g, 0, 255) | 0, U.clamp(b, 0, 255) | 0];
  }

  /* Endereço do pixel: a ponte entre o dedo e o mundo, em qualquer zoom. */
  function enderecoDoPixel(C, cam, destino, i, j) {
    var f = C.E.frameEmDir(cam.centro);
    var mPorPx = cam.metrosNaTela / destino.larg;
    var cx = (destino.larg - 1) * 0.5, cy = (destino.alt - 1) * 0.5;
    var giro = cam.giro || 0, cg = Math.cos(giro), sg = Math.sin(giro);
    var sx = (i - cx) * mPorPx, sy = (j - cy) * mPorPx;
    var dLeste = sx * cg - (-sy) * sg;
    var dNorte = (-sy) * cg + sx * sg;
    var dir = C.E.dirDeslocada(f, dLeste, dNorte, C.Rm);
    return { dir: dir, endereco: C.E.enderecoDeGlobo(C.T, C.m, dir) };
  }

  /* ==========================================================================
     hashMundo — a prova de que uma seed é um mundo
     ==========================================================================
     Exigido pelo plano. Roda em Node e no browser, sem depender de crypto:
     é um FNV-1a de 32 bits em quatro pistas com sementes diferentes, o que dá
     128 bits de saída em hexadecimal. Não é criptográfico e não precisa ser —
     precisa ser DETERMINÍSTICO e sensível a qualquer mudança no mundo.

     Entram: as grades do world.js (relevo, bioma, umidade, temperatura,
     fertilidade), a âncora da região, o censo de vida, e uma malha de 64x64
     amostras do campo contínuo da superfície, que é o que esta fase
     acrescentou. Se qualquer um mudar, o hash muda.
     ========================================================================== */
  function hashMundo(deps, seed, opcoes) {
    opcoes = opcoes || {};
    var W = deps.W, T = deps.T, E = deps.E, A = deps.A;
    var m = W.criar({ seed: seed });
    var reg = W.regiaoAtiva(m);
    var amb = A.criar(W, m, { T: T });
    var C = criar({ W: W, T: T, E: E, A: A }, m, { ambiente: amb });

    var h = [0x811c9dc5, 0x01000193, 0x7fffffff, 0x9e3779b9];
    function bater(v) {
      var x = (v * 1e6) | 0;
      for (var k = 0; k < 4; k++) {
        h[k] ^= (x + k * 0x51ed270b);
        h[k] = Math.imul(h[k], 16777619) >>> 0;
        h[k] ^= h[k] >>> 13;
      }
    }
    function baterTexto(s2) { for (var i = 0; i < s2.length; i++) bater(s2.charCodeAt(i) / 1e6); }
    function baterGrade(g) { for (var i = 0; i < g.length; i++) bater(g[i]); }

    baterTexto('genesis.hash/1|' + seed + '|' + reg.largura + 'x' + reg.altura);
    baterGrade(reg.alturaTerreno);
    baterGrade(reg.tipo);
    baterGrade(reg.umidade);
    baterGrade(reg.temperatura);
    baterGrade(reg.fertilidade);
    baterTexto('|' + reg.lat + '|' + reg.lon + '|');
    bater(m.plantas.length); bater(m.animais.length);
    bater(m.npcs.length); bater(m.objetos.length);

    var n = opcoes.malha || 64;
    for (var a = 0; a < n; a++) {
      var u = (a / n) * 2 - 1, sr = Math.sqrt(Math.max(0, 1 - u * u));
      for (var b = 0; b < n; b++) {
        var ph = (b / n) * Math.PI * 2;
        bater(elevacaoDaDir(C, { x: sr * Math.cos(ph), y: u, z: sr * Math.sin(ph) }, 10));
      }
    }
    var saida = '';
    for (var k2 = 0; k2 < 4; k2++) saida += ('00000000' + (h[k2] >>> 0).toString(16)).slice(-8);
    return saida;
  }

  /* ==========================================================================
     TESTES  S1 a S10
     ========================================================================== */
  function rodarTestes(C) {
    var out = [];
    function add(id, nome, ok, valores, detalhe) {
      out.push({ id: id, nome: nome, ok: !!ok, valores: valores || {}, detalhe: detalhe || '' });
    }
    var tam = C.tam;

    /* S1 · a escada cobre todo o intervalo, sem buraco e sem sobreposição */
    (function () {
      var buraco = null, sobrepoe = null;
      for (var i = 0; i < NIVEIS.length - 1; i++) {
        if (NIVEIS[i].min !== NIVEIS[i + 1].max) buraco = NIVEIS[i].id + '/' + NIVEIS[i + 1].id;
      }
      var cobreTudo = NIVEIS[0].max === Infinity && NIVEIS[NIVEIS.length - 1].min === 0;
      add('S1', 'escada de LOD cobre 0 a infinito sem buraco', !buraco && !sobrepoe && cobreTudo,
        { 'niveis': NIVEIS.length,
          'faixas': NIVEIS.map(function (n) { return n.id + ':' + n.min + '..' + n.max; }).join(' '),
          'buraco': buraco || 'nenhum' });
    })();

    /* S2 · a elevação é contínua em relação ao ZOOM: acrescentar oitavas
       não pode mudar o que já estava, só acrescentar detalhe */
    (function () {
      /* Ponto escolhido LONGE da bacia da ilha, onde quem manda é o campo
         planetário mais as oitavas — que é onde a continuidade em zoom pode
         de fato quebrar. Dentro da bacia o resultado não depende de oitava
         nenhuma e o teste passaria sem provar nada. */
      var dir = dirDoLocal(C, 400000, 250000);
      var pior = 0, piorPar = '';
      for (var o = 1; o < OITAVAS_MAX; o += 0.5) {
        var a = elevacaoDaDir(C, dir, o);
        var b = elevacaoDaDir(C, dir, o + 0.5);
        var d = Math.abs(b - a);
        if (d > pior) { pior = d; piorPar = o.toFixed(1) + '->' + (o + 0.5).toFixed(1); }
      }
      add('S2', 'elevacao continua no zoom (meia oitava nao da salto)', pior < 40,
        { 'maior salto por meia oitava': pior.toFixed(3) + ' m', 'onde': piorPar,
          'limite': '40 m em um campo de 7000 m = 0,57%' },
        'Oitavas fracionarias: a oitava que nasce entra com peso, nao de uma vez.');
    })();

    /* S3 · dentro da região, world.js é a autoridade — bit a bit */
    (function () {
      var pior = 0, n = 0;
      for (var y = 0; y < tam; y += 3) {
        for (var x = 0; x < tam; x += 3) {
          var real = C.reg.alturaTerreno[y * tam + x];
          var meu = elevacaoDaDir(C, dirDoLocal(C, x + 0.5, y + 0.5), OITAVAS_MAX);
          var d = Math.abs(meu - real);
          if (d > pior) pior = d;
          n++;
        }
      }
      add('S3', 'dentro da regiao a superficie DEVOLVE o terreno do world.js', pior < 1e-3,
        { 'amostras': n, 'maior divergencia': pior.toExponential(3) + ' m' },
        'Se este teste cair, foi criada uma segunda fonte de verdade para o relevo.');
    })();

    /* S4 · travessia contínua: do centro da ilha ao mar aberto, metro a
       metro, 66 km sem nenhum degrau. Este é o teste que pega exatamente o
       defeito do "só azul": um salto aqui é uma parede invisível no mundo. */
    (function () {
      var pior = 0, onde = 0, ant = null;
      var meio = tam * 0.5;
      var alcance = Math.round(C.raioBacia * 1.2);
      for (var d = 0; d <= alcance; d += 1) {
        var h = elevacaoDaDir(C, dirDoLocal(C, meio + d, meio), OITAVAS_MAX);
        if (ant !== null) {
          var dd = Math.abs(h - ant);
          if (dd > pior) { pior = dd; onde = d; }
        }
        ant = h;
      }
      add('S4', 'travessia de ' + (alcance / 1000).toFixed(1) + ' km, metro a metro, sem degrau',
        pior < 6,
        { 'passos': alcance,
          'maior salto entre metros vizinhos': pior.toFixed(3) + ' m',
          'a que distancia do centro': (onde / 1000).toFixed(3) + ' km',
          'declive equivalente': pior.toFixed(2) + ' m/m',
          'faixa da regiao': C.misturaInicio + ' m .. ' + C.misturaFim + ' m',
          'raio da bacia': (C.raioBacia / 1000) + ' km' },
        'A bacia reconcilia o motor (mar na borda da regiao) com o campo planetario (macico de 3,1 km). Os dois ficam inteiros.');
    })();

    /* S5 · o classificador é ESPELHO do world.js, provado tile a tile.

       Uma ressalva que não é tolerância, é causa demonstrada: o world.js
       classifica o bioma (linhas 171-190) e SÓ DEPOIS escava o rio e os
       lagos (linhas 196+, 224-251), rebaixando `alturaTerreno` e elevando
       `umidade` nos tiles atingidos e nos vizinhos. Reclassificar a partir
       dos arrays FINAIS não pode reproduzir o que foi decidido com os
       arrays de ANTES. O teste exige então duas coisas: a divergência tem
       de ser residual, e cada tile divergente tem de estar na vizinhança da
       hidrografia. Se aparecer um divergente longe da água, o espelho está
       quebrado de verdade e o teste cai. */
    (function () {
      /* O teste é sobre a GERAÇÃO, e a geração acontece uma vez. Depois disso
         `reg.umidade` passa a ser escrita pelo ciclo da água (a única escrita
         de ambiente.js em estado de LEI), e reclassificar a partir dela mede
         outra coisa. Por isso o espelho é conferido contra um mundo RECÉM
         gerado com a mesma seed — o que também prova, de graça, que a mesma
         seed gera a mesma região. */
      var mf = C.W.criar({ seed: C.m.seed });
      var regF = C.W.regiaoAtiva(mf);
      var iguais = 0, total = 0, exemplos = [], longeDaAgua = 0;
      var ehAgua = new Uint8Array(tam * tam);
      for (var q = 0; q < tam * tam; q++) {
        var nb = C.W.BIOMA_IDS[regF.tipo[q]];
        if (nb === 'rio' || nb === 'lago') ehAgua[q] = 1;
        /* A hidrografia real não é só o que está marcado em `tipo`: o leito
           escavado aparece em `prof`, e a geometria dos lagos em reg.lagos.
           Ver o achado S11 — em world.js o lago escava o terreno e não pinta
           o bioma. Quem quer saber onde há água tem de olhar os três. */
        if (regF.prof && regF.prof[q] > 0) ehAgua[q] = 1;
      }
      if (regF.lagos) {
        for (var li = 0; li < regF.lagos.length; li++) {
          var lg = regF.lagos[li];
          for (var ly = 0; ly < tam; ly++) {
            for (var lx = 0; lx < tam; lx++) {
              if (Math.hypot(lx - lg.x, ly - lg.y) < lg.r + 1) ehAgua[ly * tam + lx] = 1;
            }
          }
        }
      }
      function pertoDaAgua(x, y, raio) {
        for (var dy = -raio; dy <= raio; dy++) {
          for (var dx = -raio; dx <= raio; dx++) {
            var xx = x + dx, yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= tam || yy >= tam) continue;
            if (ehAgua[yy * tam + xx]) return true;
          }
        }
        return false;
      }
      for (var y = 0; y < tam; y++) {
        for (var x = 0; x < tam; x++) {
          var i = y * tam + x;
          if (ehAgua[i]) continue;
          var esperado = C.W.BIOMA_IDS[regF.tipo[i]];
          var obtido = classificarBioma(regF.alturaTerreno[i], regF.umidade[i], regF.temperatura[i]);
          total++;
          if (obtido === esperado) { iguais++; continue; }
          var perto = pertoDaAgua(x, y, 3);
          if (!perto) longeDaAgua++;
          if (exemplos.length < 3) {
            exemplos.push(x + ',' + y + ' quer ' + esperado + ' deu ' + obtido +
                          (perto ? ' (junto da hidrografia)' : ' (LONGE DA AGUA)'));
          }
        }
      }
      var div = total - iguais;
      add('S5', 'classificador de bioma reproduz world.js tile a tile',
        longeDaAgua === 0 && div / total < 0.001,
        { 'tiles conferidos': total, 'iguais': iguais,
          'divergentes': div + ' (' + (div / total * 100).toFixed(4) + '%)',
          'divergentes longe da hidrografia': longeDaAgua + '  <- este tem de ser 0',
          'exemplos': exemplos.join(' | ') || 'nenhum' },
        'Prova que nao existe taxonomia paralela: os mesmos limiares, os mesmos nomes, a mesma ordem.');
    })();

    /* S6 · amostraEm responde em todo ponto, sem campo morto */
    (function () {
      var campos = ['altitude', 'declive', 'solo', 'agua', 'temperatura',
                    'umidade', 'fertilidade', 'luz', 'recursos'];
      var mortos = [], n = 0, nulosSemMotivo = 0;
      var passos = [[80, 80], [0, 0], [159, 159], [-500, -500], [3000, 3000],
                    [80, 200], [-2000, 80], [1e5, 1e5]];
      for (var p = 0; p < passos.length; p++) {
        var a = amostraEm(C, passos[p][0], passos[p][1]);
        n++;
        for (var k = 0; k < campos.length; k++) {
          var v = a[campos[k]];
          if (v === undefined) mortos.push(campos[k] + '@' + passos[p]);
          if (v === null) nulosSemMotivo++;
          if (typeof v === 'number' && !isFinite(v)) mortos.push(campos[k] + ' nao finito @' + passos[p]);
        }
      }
      add('S6', 'amostraEm responde em todo (x,y) sem campo morto', mortos.length === 0,
        { 'pontos testados': n, 'campos por ponto': campos.length,
          'mortos': mortos.join(', ') || 'nenhum', 'nulos': nulosSemMotivo });
    })();

    /* S7 · determinismo: mesmo ponto, mesma seed, mesmo resultado */
    (function () {
      var pior = 0;
      for (var i = 0; i < 500; i++) {
        var x = (i * 7.13) % tam, y = (i * 11.71) % tam;
        var a = amostraEm(C, x, y).altitude;
        var b = amostraEm(C, x, y).altitude;
        pior = Math.max(pior, Math.abs(a - b));
      }
      add('S7', 'amostraEm e deterministico', pior === 0,
        { 'amostras': 500, 'maior diferenca entre duas leituras': pior });
    })();

    /* S8 · a projeção da superfície é a MESMA do contrato de endereço */
    (function () {
      var pior = 0;
      for (var i = 0; i < 2000; i++) {
        var x = (i * 0.0793) % tam, y = (i * 0.1237) % tam;
        var dir = dirDoLocal(C, x, y);
        var a = C.E.enderecoDeGlobo(C.T, C.m, dir);
        var d = Math.hypot(a.local.x - x, a.local.y - y);
        pior = Math.max(pior, d);
      }
      add('S8', 'superficie e endereco usam a mesma projecao', pior < 1e-5,
        { 'amostras': 2000, 'maior divergencia': pior.toExponential(3) + ' tiles (m)' },
        'Se cair, a superficie e o endereco viraram duas geografias diferentes.');
    })();

    /* S9 · a região canônica é encontrável pelo zoom, com o nome certo */
    (function () {
      var a = amostraEm(C, 80, 80);
      var nomeOk = C.reg.nome === 'Ilha Gênesis';
      var dentro = a.local.dentroDaRegiao === true;
      var autoridade = a.autoridade === 'world.js';
      add('S9', 'regiao canonica visivel e sob autoridade do motor', nomeOk && dentro && autoridade,
        { 'nome': C.reg.nome, 'tamanho': tam + 'x' + tam, 'seed': C.m.seed,
          'autoridade no centro': a.autoridade, 'bioma no centro': a.biomaNome });
    })();

    /* S10 · declive é físico: a encosta mais íngreme da ilha bate com o
       terreno real, calculado direto do Float32Array */
    (function () {
      var maxReal = 0;
      for (var y = 1; y < tam - 1; y++) {
        for (var x = 1; x < tam - 1; x++) {
          var i = y * tam + x;
          var gx = (C.reg.alturaTerreno[i + 1] - C.reg.alturaTerreno[i - 1]) / 2;
          var gy = (C.reg.alturaTerreno[i + tam] - C.reg.alturaTerreno[i - tam]) / 2;
          maxReal = Math.max(maxReal, Math.hypot(gx, gy));
        }
      }
      var maxMeu = 0;
      for (var y2 = 2; y2 < tam - 2; y2 += 2) {
        for (var x2 = 2; x2 < tam - 2; x2 += 2) {
          maxMeu = Math.max(maxMeu, amostraEm(C, x2 + 0.5, y2 + 0.5).declive);
        }
      }
      var razao = maxReal > 0 ? maxMeu / maxReal : 0;
      add('S10', 'declive e o gradiente real do terreno', razao > 0.5 && razao < 2.0,
        { 'maior declive no Float32Array': maxReal.toFixed(4) + ' m/m',
          'maior declive por amostraEm': maxMeu.toFixed(4) + ' m/m',
          'razao': razao.toFixed(3) });
    })();

    /* S11 · ACHADO EM ARQUIVO DE LEI — o lago não tem bioma.

       Isto não é um teste desta camada. É um defeito de `world.js` que esta
       camada esbarrou ao espelhar o classificador, e que fica registrado aqui
       porque um número num teste é mais difícil de esquecer que um parágrafo
       num relatório.

       world.js:209  for (let y = l.y - l.r - 1; y <= l.y + l.r + 1; y++)
       `l.r` é fracionário (6,2588 na seed canônica), logo `y` é fracionário,
       logo `reg.tipo[y * TAM + x]` escreve num índice fracionário — e um
       índice fracionário num TypedArray é descartado em silêncio. A pintura
       do bioma do lago nunca acontece.

       O bloco de escavação logo abaixo (world.js:243) usa Math.round e por
       isso FUNCIONA. O resultado é um lago que existe em alturaTerreno, em
       prof e em aguaZ, e não existe em tipo. Consequência na simulação:
       W.ehAgua devolve false sobre o lago, peixe não nasce ali, e planta
       cresce dentro d'água.

       O arquivo é LEI. Não foi alterado. A correção mínima seria trocar os
       limites do laço por Math.round, como o bloco vizinho já faz. Aguarda
       autorização.

       O teste PASSA enquanto o achado permanecer exatamente como descrito.
       Se world.js for corrigido, ele cai — e cair aqui quer dizer "boa
       notícia, conferir e remover este teste". */
    (function () {
      var mf2 = C.W.criar({ seed: C.m.seed });
      var regF2 = C.W.regiaoAtiva(mf2);
      var lagos = regF2.lagos || [];
      var dentro = 0, pintados = 0, escavados = 0, raioFracionario = 0;
      for (var li = 0; li < lagos.length; li++) {
        var lg = lagos[li];
        if (!Number.isInteger(lg.r)) raioFracionario++;
        for (var y = 0; y < tam; y++) {
          for (var x = 0; x < tam; x++) {
            if (Math.hypot(x - lg.x, y - lg.y) >= lg.r) continue;
            var i = y * tam + x;
            dentro++;
            if (C.W.BIOMA_IDS[regF2.tipo[i]] === 'lago') pintados++;
            if (regF2.prof && regF2.prof[i] > 0) escavados++;
          }
        }
      }
      var achadoPresente = (dentro > 0 && pintados === 0 && escavados > 0);
      add('S11', 'ACHADO em world.js (LEI) · o lago escava o terreno e nao pinta o bioma',
        achadoPresente || dentro === 0,
        { 'lagos na regiao': lagos.length,
          'raio fracionario': raioFracionario + ' de ' + lagos.length,
          'tiles dentro do raio': dentro,
          'marcados como bioma lago': pintados + '   <- deveria ser ' + dentro,
          'com leito escavado em prof': escavados,
          'linha': 'world.js:209 — indice fracionario em TypedArray, descartado em silencio',
          'correcao minima': 'Math.round nos limites do laco, como world.js:243 ja faz',
          'estado': 'REPORTADO. Arquivo LEI nao alterado. Aguarda autorizacao.' },
        'Este teste passa enquanto o defeito existir. Se ele cair, world.js foi corrigido.');
    })();

    /* S12 · o caminho rápido de render devolve o mesmo campo que o caminho
       exato. `pintarQuadro` particiona a soma de oitavas entre grade grossa e
       pixel, interpola a posição local e corta as oitavas abaixo de dois
       pixels. Nada disso pode mudar o MUNDO; só o que é desenhado dele.

       O critério é físico, não uma tolerância escolhida: o desvio tem de ser
       menor que meio pixel de relevo na escala em que se está desenhando.
       Um erro menor que isso não pode aparecer na tela. */
    (function () {
      var larg = 96, alt = 96;
      var dest = { larg: larg, alt: alt, dados: new Uint8ClampedArray(larg * alt * 4) };
      var linhas = [];
      var todosOk = true;
      var zooms = [2.0e6, 2.0e5, 5.0e3, 4.0e2, 4.0e1, 6];
      for (var z = 0; z < zooms.length; z++) {
        var Mz = zooms[z];
        var cam = { centro: dirDoLocal(C, 80, 80), metrosNaTela: Mz };
        var info = pintarQuadro(C, cam, dest, { amostragem: 1, forcar: true });
        var q = C.ultimoQuadro;
        var f = C.E.frameEmDir(cam.centro);
        var mPorPx = Mz / larg;
        var cxp = (larg - 1) * 0.5, cyp = (alt - 1) * 0.5;
        var pior = 0;
        for (var jj = 0; jj < q.nAy; jj += 7) {
          for (var ii = 0; ii < q.nAx; ii += 7) {
            var sxp = (ii - cxp) * mPorPx, syp = (jj - cyp) * mPorPx;
            var dirp = C.E.dirDeslocada(f, sxp, -syp, C.Rm);
            var exato = elevacaoDaDir(C, dirp, info.oitavas);
            var d = Math.abs(q.H[jj * q.nAx + ii] - exato);
            if (d > pior) pior = d;
          }
        }
        /* relevo que cabe em meio pixel, medido pelo declive tipico do quadro */
        var limite = Math.max(0.5, mPorPx * 0.5);
        var ok = pior < limite;
        if (!ok) todosOk = false;
        linhas.push((Mz >= 1000 ? (Mz / 1000) + ' km' : Mz + ' m') +
                    ': desvio ' + pior.toFixed(3) + ' m, limite ' + limite.toFixed(2) + ' m' +
                    (ok ? '' : '  <-- FALHA'));
      }
      add('S12', 'o render rapido desenha o mesmo campo que o caminho exato', todosOk,
        { 'zooms conferidos': zooms.length, 'por zoom': linhas.join(' | ') },
        'Grade grossa, janela de oitavas e corte de Nyquist sao otimizacao de render. O mundo nao muda.');
    })();

    /* S13 · NENHUMA COSTURA NO QUADRO.

       Uma costura é uma linha reta que atravessa a tela e que não corresponde
       a nada no mundo: a marca de onde duas partes do código se encontram. É
       o defeito mais fácil de não ver lendo o código e o mais fácil de ver na
       tela, então ele é medido em vez de olhado.

       A medida é a diferença média de luminância entre linhas vizinhas do
       quadro. Uma costa, uma falha ou uma crista produzem linhas fortes —
       essas são o mundo. Uma costura produz uma linha MUITO mais forte que a
       variação típica, e é a razão entre as duas que denuncia.

       Esta suíte já pegou três costuras de verdade por este número: a borda
       da região a 31 vezes a média, a cruz de Chebyshev e o degrau de meio
       metro do clamp duplicado. */
    (function () {
      var larg = 160, alt = 320;
      var dest = { larg: larg, alt: alt, dados: new Uint8ClampedArray(larg * alt * 4) };
      var zooms = [80, 160, 420, 2400, 20000, 200000];
      var linhas = [], piorRazao = 0;
      for (var z = 0; z < zooms.length; z++) {
        pintarQuadro(C, { centro: dirDoLocal(C, 80, 80), metrosNaTela: zooms[z] },
                     dest, { amostragem: 1, forcar: true });
        var d = dest.dados;
        var pior = 0, soma = 0, n = 0;
        for (var y = 2; y < alt - 1; y++) {
          var sl = 0;
          for (var x = 0; x < larg; x++) {
            var i = (y * larg + x) * 4, j = ((y - 1) * larg + x) * 4;
            sl += Math.abs((d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) -
                           (d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114));
          }
          sl /= larg; soma += sl; n++;
          if (sl > pior) pior = sl;
        }
        var media = soma / n;
        var razao = media > 1e-6 ? pior / media : 0;
        if (razao > piorRazao) piorRazao = razao;
        linhas.push((zooms[z] >= 1000 ? (zooms[z] / 1000) + ' km' : zooms[z] + ' m') +
                    ': ' + razao.toFixed(1) + 'x');
      }
      add('S13', 'nenhuma costura: nenhuma linha destoa do quadro', piorRazao < 9,
        { 'zooms conferidos': zooms.length,
          'razao entre a linha mais forte e a media, por zoom': linhas.join(' | '),
          'limite': '9x  (a borda da regiao chegou a marcar 31x antes da correcao)' },
        'Uma costa e uma linha forte e legitima. Uma costura e uma linha muito mais forte que tudo.');
    })();

    /* S14 · pintar em faixas dá exatamente o mesmo quadro que pintar de uma
       vez. O refino progressivo depende disso: se não fosse bit a bit igual,
       cada faixa deixaria uma emenda ao terminar. */
    (function () {
      var larg = 120, alt = 240;
      var a = { larg: larg, alt: alt, dados: new Uint8ClampedArray(larg * alt * 4) };
      var b = { larg: larg, alt: alt, dados: new Uint8ClampedArray(larg * alt * 4) };
      var linhas = [], tudoIgual = true;
      var casos = [[160, 1], [1200, 2], [60000, 2]];
      for (var q = 0; q < casos.length; q++) {
        var cam = { centro: dirDoLocal(C, 80, 80), metrosNaTela: casos[q][0] };
        var am = casos[q][1];
        pintarQuadro(C, cam, a, { amostragem: am, forcar: true });
        for (var k = 0; k < 7; k++) {
          pintarQuadro(C, cam, b, {
            amostragem: am, forcar: true,
            faixa: { de: Math.round(k * alt / 7), ate: Math.round((k + 1) * alt / 7) }
          });
        }
        var dif = 0;
        for (var i = 0; i < a.dados.length; i++) if (a.dados[i] !== b.dados[i]) dif++;
        if (dif) tudoIgual = false;
        linhas.push(casos[q][0] + ' m / am' + am + ': ' + dif + ' bytes diferentes');
      }
      add('S14', 'pintar em faixas e igual a pintar de uma vez', tudoIgual,
        { 'casos': casos.length, 'por caso': linhas.join(' | ') },
        'O refino progressivo depende disto. Qualquer diferenca vira uma emenda na tela.');
    })();

    return out;
  }

  /* ========================================================================== */
  return {
    VERSAO: VERSAO, CONTRATO: CONTRATO,
    NIVEIS: NIVEIS, OITAVAS_MAX: OITAVAS_MAX,
    CRUZAMENTO_ALTO: CRUZAMENTO_ALTO, CRUZAMENTO_BAIXO: CRUZAMENTO_BAIXO,
    PALETA: PALETA,

    criar: criar,
    nivelDoZoom: nivelDoZoom,
    oitavasDoZoom: oitavasDoZoom,
    pesoDaSuperficie: pesoDaSuperficie,
    pesoDoGlobo: pesoDoGlobo,

    ruido3: ruido3, fbmContinuo: fbmContinuo, fbmCrista: fbmCrista,
    bilinear: bilinear,
    classificarBioma: classificarBioma,
    alturaNaEscalaDoClassificador: alturaNaEscalaDoClassificador,

    localDaDir: localDaDir, dirDoLocal: dirDoLocal,
    pesoDaRegiao: pesoDaRegiao, pesoDeDistancia: pesoDeDistancia,
    lerRegExtrapolada: lerRegExtrapolada, lerRegCubica: lerRegCubica,
    distanciaDaBacia: distanciaDaBacia, raioDaBacia: raioDaBacia,
    elevacaoDaDir: elevacaoDaDir,
    amostrarDir: amostrarDir,
    amostraEm: amostraEm,

    pintarQuadro: pintarQuadro,
    corDoBioma: corDoBioma, corDeAmostra: corDeAmostra,
    normaFbm: normaFbm, fbmJanela: fbmJanela, fbmVisivel: fbmVisivel,
    JANELA_TEXTURA: JANELA_TEXTURA, oitavaDeCorte: oitavaDeCorte,
    oitavaMaxima: oitavaMaxima, JANELA_FINA: JANELA_FINA,
    enderecoDoPixel: enderecoDoPixel,

    hashMundo: hashMundo,
    rodarTestes: rodarTestes
  };
});
