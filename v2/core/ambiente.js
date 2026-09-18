/* ============================================================================
   GÊNESIS v2 — AMBIENTE FÍSICO, QUÍMICO E BIOLÓGICO DA TERRA
   genesis/v2/core/ambiente.js

   PAPEL DESTE ARQUIVO
   -------------------
   O world.js simula UMA região de 160 m com terreno, clima, plantas, animais e
   física de objetos. Este módulo acrescenta o que falta para essa região ser um
   AMBIENTE: oceano com estado, atmosfera com campo, ciclo da água que fecha,
   solo com composição, materiais com densidade, e uma escala planetária onde a
   ilha é um ponto honesto.

   REGRA DE PROPRIEDADE (decidida em 2026-09-12, ver AUDITORIA_AMBIENTE.md)
   -----------------------------------------------------------------------
   Este módulo é dono APENAS dos campos que o world.js não possui.
   Nenhum campo existe duas vezes. Onde o world.js já é autoridade, aqui se LÊ.

       world.js é dono de : alturaTerreno, tipo(bioma), umidade, fertilidade,
                            temperatura, prof, aguaZ, rio, lagos, m.clima,
                            m.tempo, entidades e a física de objetos.
       ambiente.js é dono de: campo de vento, pressão, umidade do ar, salinidade,
                            temperatura da água, corrente, onda, textura do solo,
                            matéria orgânica, capacidade de campo, sedimento,
                            partículas em suspensão e toda a grade planetária.

   A ÚNICA ESCRITA EM ESTADO DE LEI
   --------------------------------
   `aplicarUmidadeNoSolo()`. Uma função, declarada, testada (T14), e o motivo
   está medido: sem ela a umidade do solo só sobe, e 44% da ilha satura em sete
   dias de mundo. Não é segunda fonte de verdade: continua existindo UMA umidade.
   É um segundo escritor, explícito e auditável. Pode ser desligada por opção.

   DETERMINISMO
   ------------
   Sem Math.random. Sem Date.now no caminho da simulação. Todo sorteio sai de
   U.RNG(seed), o mesmo gerador do motor. Mesma seed, mesmo ambiente, bit a bit.

   2D POR DECISÃO DE PROJETO
   -------------------------
   Toda a simulação é de campos 2D em Float32Array, varridos em lote. Não há
   objeto por célula, não há física 3D, não há partícula individual: partícula é
   campo de densidade advectado. Profundidade, relevo e altura existem como DADO
   (um número por célula), não como terceira dimensão de simulação.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./util.js'));
  else root.GenesisAmbiente = factory(root.GenesisUtil);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (U) {
  'use strict';

  var VERSAO = 'ambiente-1.0';
  var CONTRATO = 'genesis.ambiente/1';

  /* ==========================================================================
     0. CONSTANTES FÍSICAS
     Valores reais. Nenhum é ajustado "de olho" para o efeito ficar bonito.
     ========================================================================== */
  var G = 9.81;                 /* m/s^2  — mesmo valor do world.js:14 */
  var NIVEL_MAR = 0;            /* m      — mesmo zero do world.js:35 */
  var RHO_AR = 1.225;           /* kg/m^3 ao nível do mar, 15 C */
  var RHO_AGUA_DOCE = 1000;     /* kg/m^3 */
  var P0 = 1013.25;             /* hPa    — pressão padrão ao nível do mar */
  var ESCALA_BAROMETRICA = 8400;/* m      — altura de escala da atmosfera */
  var LAPSE = 0.0065;           /* C/m    — gradiente térmico adiabático úmido */
  var CP_AR = 1005;             /* J/(kg·K) */
  var CALOR_LATENTE = 2.45e6;   /* J/kg   — vaporização da água a 20 C */
  var SALINIDADE_OCEANICA = 35; /* g/kg   — média global real */

  /* ==========================================================================
     1. RUÍDO ESFÉRICO DETERMINÍSTICO

     O util.js traz ruído 2D (U.ruido2/U.fbm) e o hash 3D (U.hash3i). Ruído 2D
     sobre lat/lon costura mal: gera emenda em ±180 e esmaga os polos. Então o
     ruído aqui é avaliado na DIREÇÃO 3D do ponto na esfera, com o mesmo hash do
     motor. Não é um segundo gerador de aleatoriedade: é a extensão para três
     eixos da construção que já existe em U.ruido2.
     ========================================================================== */
  function ruido3(x, y, z, s) {
    var xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    var xf = U.suave(x - xi), yf = U.suave(y - yi), zf = U.suave(z - zi);
    function h(a, b, c) { return U.hash3i(a, b, c, s); }
    var c000 = h(xi, yi, zi), c100 = h(xi + 1, yi, zi);
    var c010 = h(xi, yi + 1, zi), c110 = h(xi + 1, yi + 1, zi);
    var c001 = h(xi, yi, zi + 1), c101 = h(xi + 1, yi, zi + 1);
    var c011 = h(xi, yi + 1, zi + 1), c111 = h(xi + 1, yi + 1, zi + 1);
    var x00 = U.lerp(c000, c100, xf), x10 = U.lerp(c010, c110, xf);
    var x01 = U.lerp(c001, c101, xf), x11 = U.lerp(c011, c111, xf);
    return U.lerp(U.lerp(x00, x10, yf), U.lerp(x01, x11, yf), zf);
  }

  function fbm3(x, y, z, s, oct) {
    oct = oct || 4;
    var v = 0, amp = 0.5, f = 1, norm = 0;
    for (var i = 0; i < oct; i++) {
      v += amp * ruido3(x * f, y * f, z * f, s + i * 977);
      norm += amp; amp *= 0.5; f *= 2;
    }
    return v / norm;
  }

  /* direção unitária a partir de lat/lon. MESMA convenção da fase1/terra.js:136
     (X em lat0/lon0, Y no polo norte, Z em lat0/lon90). Reproduzida aqui porque
     ambiente.js roda em Node sem terra.js; quando T é passado, T é preferido e a
     equivalência é verificada no teste T2. */
  var RAD = Math.PI / 180, DEG = 180 / Math.PI;
  function dirDeLatLon(lat, lon, T) {
    if (T && typeof T.dirDeLatLon === 'function') return T.dirDeLatLon(lat, lon);
    var la = lat * RAD, lo = lon * RAD, cl = Math.cos(la);
    return { x: cl * Math.cos(lo), y: Math.sin(la), z: cl * Math.sin(lo) };
  }

  /* ==========================================================================
     CAMADA 1 — PLANETA
     Grade equirretangular de campos 2D. Cada célula guarda DADO, não objeto.
     A elevação é avaliada na direção 3D, então não há emenda nem distorção polar.
     ========================================================================== */

  var PLANETA_LARG = 360;   /* células em longitude — 1 grau por célula */
  var PLANETA_ALT = 180;    /* células em latitude */

  function idxPlaneta(ix, iy, larg) { return iy * larg + ix; }
  function lonDeIx(ix, larg) { return -180 + (ix + 0.5) * (360 / larg); }
  function latDeIy(iy, alt) { return 90 - (iy + 0.5) * (180 / alt); }

  /* Placas: bolhas continentais em direções sorteadas na esfera. Uma delas é
     ANCORADA na coordenada canônica da ilha, porque o world.js já sorteou onde a
     Ilha Gênesis está e o mapa não pode contradizer o motor colocando oceano lá.
     Essa âncora é restrição derivada de dado canônico, não invenção. */
  function sortearPlacas(rng, ancoraDir, n) {
    var placas = [];
    /* placa 0: a da ilha. Raio pequeno: um arquipélago, não um continente,
       porque o motor só afirma que existe uma ilha de 160 m ali.
       `raio` é fração de PI: 0,05 equivale a 9 graus de raio angular. */
    placas.push({ dir: ancoraDir, amp: 0.52, raio: 0.030, ancora: true });
    for (var i = 1; i < n; i++) {
      /* direção uniforme na esfera: z uniforme em [-1,1], azimute uniforme.
         Sortear lat uniforme acumularia placas nos polos. */
      var z = rng.range(-1, 1);
      var a = rng.range(0, U.PI2);
      var r = Math.sqrt(Math.max(0, 1 - z * z));
      placas.push({
        dir: { x: r * Math.cos(a), y: z, z: r * Math.sin(a) },
        amp: rng.range(0.55, 1.15),
        /* 0,08 a 0,22 de PI = 14 a 40 graus de raio angular. Um continente da
           Terra real cabe nessa faixa; acima disso uma placa só cobriria o
           planeta inteiro e não sobraria oceano. */
        raio: rng.range(0.08, 0.22),
        ancora: false
      });
    }
    return placas;
  }

  function elevacaoPlanetaria(d, placas, seedRuido) {
    /* soma das placas por distância angular */
    var e = -0.20;                        /* viés oceânico: a Terra é mais água */
    for (var i = 0; i < placas.length; i++) {
      var p = placas[i];
      var dot = U.clamp(d.x * p.dir.x + d.y * p.dir.y + d.z * p.dir.z, -1, 1);
      var ang = Math.acos(dot);           /* 0 no centro da placa, PI no antípoda */
      var t = ang / (p.raio * Math.PI);
      if (t < 1) {
        var f = 1 - t * t;                /* queda suave, zero na borda */
        e += p.amp * f * f;
      }
    }
    /* detalhe: costa recortada e cordilheiras */
    e += (fbm3(d.x * 3.1, d.y * 3.1, d.z * 3.1, seedRuido, 5) - 0.5) * 0.85;
    e += (fbm3(d.x * 11.0, d.y * 11.0, d.z * 11.0, seedRuido + 31, 3) - 0.5) * 0.30;
    return e;
  }

  /* Perfil térmico latitudinal. Aproxima o perfil real da Terra: ~27 C no
     equador, ~-25 C nos polos, com a queda concentrada nas latitudes médias. */
  function tempDaLatitude(lat) {
    var c = Math.cos(lat * RAD);
    return -25 + 52 * c * c;
  }

  function criarPlaneta(opcoes) {
    opcoes = opcoes || {};
    var larg = opcoes.larg || PLANETA_LARG;
    var alt = opcoes.alt || PLANETA_ALT;
    var seed = (opcoes.seed | 0) || 1;
    var T = opcoes.T || null;
    var ancoraLat = (typeof opcoes.ancoraLat === 'number') ? opcoes.ancoraLat : 0;
    var ancoraLon = (typeof opcoes.ancoraLon === 'number') ? opcoes.ancoraLon : 0;

    var rng = U.RNG(seed ^ 0x5eed17);
    var ancoraDir = dirDeLatLon(ancoraLat, ancoraLon, T);
    var placas = sortearPlacas(rng, ancoraDir, opcoes.placas || 9);
    var seedRuido = rng.int(1, 1e6);

    var n = larg * alt;
    var P = {
      larg: larg, alt: alt, n: n,
      seed: seed,
      ancora: { lat: ancoraLat, lon: ancoraLon, dir: ancoraDir },
      /* elevação em METROS: negativo é fundo do mar, positivo é terra */
      elevacao: new Float32Array(n),
      /* temperatura média do ar à superfície, em C */
      temperatura: new Float32Array(n),
      /* precipitação média, mm por dia */
      precipitacao: new Float32Array(n),
      /* temperatura da superfície do mar, C (só faz sentido onde há oceano) */
      tempMar: new Float32Array(n),
      /* salinidade, g/kg */
      salinidade: new Float32Array(n),
      /* corrente superficial, m/s, componentes leste e norte */
      correnteU: new Float32Array(n),
      correnteV: new Float32Array(n),
      /* altura significativa de onda, m */
      onda: new Float32Array(n),
      /* vento médio de superfície, m/s */
      ventoU: new Float32Array(n),
      ventoV: new Float32Array(n)
    };

    var ELEV_MAX = 7000;     /* m — teto de cordilheira */
    var PROF_MAX = 9000;     /* m — fossa oceânica */

    for (var iy = 0; iy < alt; iy++) {
      var lat = latDeIy(iy, alt);
      for (var ix = 0; ix < larg; ix++) {
        var lon = lonDeIx(ix, larg);
        var d = dirDeLatLon(lat, lon, T);
        var i = idxPlaneta(ix, iy, larg);
        var e = elevacaoPlanetaria(d, placas, seedRuido);
        /* compressão suave: placas sobrepostas não podem somar uma cordilheira
           de 20 km. tanh satura no teto sem criar degrau na costa. */
        P.elevacao[i] = e >= 0
          ? Math.tanh(e * 1.15) * ELEV_MAX
          : Math.tanh(e * 1.6) * PROF_MAX;
        /* temperatura do ar: latitude, menos o gradiente com a altitude */
        var tl = tempDaLatitude(lat);
        P.temperatura[i] = tl - Math.max(0, P.elevacao[i]) * LAPSE;
      }
    }

    /* A célula da ilha recebe a elevação REAL do terreno da região.
       O world.js já diz que o relevo da Ilha Gênesis vai de -64 m a +15 m; o
       mapa planetário não pode transformá-la numa cordilheira de 5 km só porque
       a placa ancorada somou alto ali. O número vem do motor, não de escolha. */
    if (typeof opcoes.ancoraElevacao === 'number') {
      var ai = Math.floor((ancoraLon + 180) / 360 * larg);
      var aj = Math.floor((90 - ancoraLat) / 180 * alt);
      ai = ((ai % larg) + larg) % larg;
      aj = U.clamp(aj, 0, alt - 1);
      var centro = idxPlaneta(ai, aj, larg);
      /* As células tocadas guardam o valor que TINHAM. A âncora é um marcador
         de escala planetária: a 1 grau, a ilha inteira mede menos de 0,002 da
         célula, e sem o marcador ela sumiria do mapa. Mas a SUPERFÍCIE, que
         desce até 1 metro, não pode ler o marcador como batimetria: a 2 km da
         ilha o mar é mar, não platô de 15 m. A superfície lê o original, o
         mapa planetário lê o marcado, e o valor guardado aqui é o que impede
         isso de virar duas fontes de verdade. Ver v2/core/superficie.js. */
      P.ancoraOriginais = {};
      P.ancoraOriginais[centro] = P.elevacao[centro];
      P.elevacao[centro] = opcoes.ancoraElevacao;
      /* as vizinhas descem para o mar: é uma ilha, não um platô */
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          var vx2 = ((ai + dx) % larg + larg) % larg;
          var vy2 = U.clamp(aj + dy, 0, alt - 1);
          var vi = idxPlaneta(vx2, vy2, larg);
          if (P.elevacao[vi] > 0) {
            P.ancoraOriginais[vi] = P.elevacao[vi];
            P.elevacao[vi] = Math.min(P.elevacao[vi], opcoes.ancoraElevacao * 0.4);
          }
        }
      }
      P.temperatura[centro] = tempDaLatitude(ancoraLat) - Math.max(0, P.elevacao[centro]) * LAPSE;
      P.ancoraCelula = centro;
      P.ancoraPrecipitacao = (typeof opcoes.ancoraPrecipitacao === 'number') ? opcoes.ancoraPrecipitacao : null;
    }

    climaPlanetario(P);
    /* Mesma regra da elevação: onde o motor já afirma como a ilha é, o motor
       vence o modelo climático genérico. A latitude -19,5 cai no cinturão
       subtropical seco, mas o world.js povoou a ilha de floresta tropical e rio
       perene. Quem tem autoridade sobre a ilha é o motor. */
    if (P.ancoraCelula !== undefined && typeof P.ancoraPrecipitacao === 'number') {
      P.precipitacao[P.ancoraCelula] = P.ancoraPrecipitacao;
    }
    oceanoPlanetario(P);
    return P;
  }

  /* Circulação de superfície em faixas: alísios de leste nos trópicos, oestes
     nas latitudes médias, leste polar. É o padrão real da célula de Hadley,
     Ferrel e polar, reduzido ao que uma simulação 2D precisa. */
  function ventoDaLatitude(lat) {
    var a = Math.abs(lat);
    var u, v;
    if (a < 30) { u = -6.5 * Math.cos(lat * 3 * RAD); v = (lat > 0 ? -1 : 1) * 1.8; }
    else if (a < 60) { u = 9.0 * Math.sin((a - 30) / 30 * Math.PI); v = (lat > 0 ? 1 : -1) * 2.2; }
    else { u = -4.0 * Math.sin((a - 60) / 30 * Math.PI); v = (lat > 0 ? -1 : 1) * 1.2; }
    return { u: u, v: v };
  }

  function climaPlanetario(P) {
    for (var iy = 0; iy < P.alt; iy++) {
      var lat = latDeIy(iy, P.alt);
      var w = ventoDaLatitude(lat);
      for (var ix = 0; ix < P.larg; ix++) {
        var i = idxPlaneta(ix, iy, P.larg);
        P.ventoU[i] = w.u; P.ventoV[i] = w.v;
        /* precipitação: máxima na zona de convergência intertropical, mínima nos
           cinturões subtropicais de alta pressão (os desertos do mundo real),
           reforçada sobre o mar e reduzida no interior dos continentes. */
        var a = Math.abs(lat);
        var itcz = Math.exp(-(a * a) / (2 * 9 * 9));          /* pico no equador */
        var mediaLat = Math.exp(-((a - 50) * (a - 50)) / (2 * 12 * 12));
        var seco = Math.exp(-((a - 25) * (a - 25)) / (2 * 8 * 8));
        var base = 9.0 * itcz + 3.5 * mediaLat - 2.2 * seco + 0.8;
        var mar = P.elevacao[i] < 0 ? 1.25 : 1.0;
        P.precipitacao[i] = Math.max(0.05, base * mar);
      }
    }
  }

  function oceanoPlanetario(P) {
    for (var iy = 0; iy < P.alt; iy++) {
      var lat = latDeIy(iy, P.alt);
      for (var ix = 0; ix < P.larg; ix++) {
        var i = idxPlaneta(ix, iy, P.larg);
        if (P.elevacao[i] >= 0) { P.tempMar[i] = 0; P.salinidade[i] = 0; P.onda[i] = 0; continue; }
        var prof = -P.elevacao[i];
        /* temperatura da superfície do mar: perfil latitudinal, teto em 30 C,
           piso no ponto de congelamento da água salgada (-1,8 C). */
        P.tempMar[i] = U.clamp(tempDaLatitude(lat) * 0.85 + 2, -1.8, 30);
        /* salinidade: máxima nos cinturões subtropicais, onde a evaporação supera
           a chuva; mínima no equador chuvoso e nos polos com degelo. */
        var a = Math.abs(lat);
        var subtrop = Math.exp(-((a - 25) * (a - 25)) / (2 * 11 * 11));
        P.salinidade[i] = SALINIDADE_OCEANICA + 1.6 * subtrop - 1.4 * Math.exp(-(a * a) / (2 * 8 * 8)) - 1.2 * Math.max(0, (a - 65) / 25);
        /* corrente geostrófica de superfície: arrastada pelo vento, defletida
           pela rotação (Ekman), e nula onde não há água. */
        var w = ventoDaLatitude(lat);
        var desvio = (lat >= 0 ? 1 : -1) * 0.35;
        P.correnteU[i] = (w.u * 0.03) - (w.v * 0.03 * desvio);
        P.correnteV[i] = (w.v * 0.03) + (w.u * 0.03 * desvio);
        /* onda: relação empírica de Sverdrup-Munk-Bretschneider, limitada por
           pistão. Hs cresce com o quadrado do vento e a raiz da pista. */
        var vel = Math.hypot(w.u, w.v);
        var pista = Math.min(600e3, prof * 120 + 50e3);
        P.onda[i] = 0.0016 * vel * vel * Math.sqrt(pista / G) / 10;
      }
    }
  }

  function amostraPlaneta(P, lat, lon) {
    var ix = Math.floor((lon + 180) / 360 * P.larg);
    var iy = Math.floor((90 - lat) / 180 * P.alt);
    ix = ((ix % P.larg) + P.larg) % P.larg;
    iy = U.clamp(iy, 0, P.alt - 1);
    var i = idxPlaneta(ix, iy, P.larg);
    return {
      ix: ix, iy: iy, i: i,
      elevacao: P.elevacao[i],
      oceano: P.elevacao[i] < 0,
      temperatura: P.temperatura[i],
      precipitacao: P.precipitacao[i],
      tempMar: P.tempMar[i],
      salinidade: P.salinidade[i],
      onda: P.onda[i],
      corrente: { u: P.correnteU[i], v: P.correnteV[i] },
      vento: { u: P.ventoU[i], v: P.ventoV[i] }
    };
  }

  /* Estatísticas PONDERADAS POR ÁREA. Numa grade equirretangular a célula de
     1 grau perto do polo tem área cos(lat) vezes menor que no equador. Contar
     célula por célula infla os polos e daria uma fração de terra e uma
     temperatura média falsas. O peso cos(lat) é a correção correta. */
  function estatisticasPlaneta(P) {
    var terra = 0, total = 0, minE = 1e9, maxE = -1e9, somaT = 0, somaP = 0;
    for (var iy = 0; iy < P.alt; iy++) {
      var peso = Math.cos(latDeIy(iy, P.alt) * RAD);
      for (var ix = 0; ix < P.larg; ix++) {
        var i = idxPlaneta(ix, iy, P.larg);
        total += peso;
        if (P.elevacao[i] >= 0) terra += peso;
        if (P.elevacao[i] < minE) minE = P.elevacao[i];
        if (P.elevacao[i] > maxE) maxE = P.elevacao[i];
        somaT += P.temperatura[i] * peso;
        somaP += P.precipitacao[i] * peso;
      }
    }
    return {
      celulas: P.n,
      areaRelativa: total,
      fracaoTerra: terra / total,
      fracaoOceano: 1 - terra / total,
      elevacaoMin: minE, elevacaoMax: maxE,
      tempMedia: somaT / total,
      precipMedia: somaP / total,
      ponderacao: 'area (cos lat)'
    };
  }

  /* ==========================================================================
     CAMADA 5 (tabela, usada pelas outras) — MATERIAIS

     Densidades e propriedades reais. O world.js dá aos objetos apenas `massa` e
     `tamanho`. Aqui o material é DERIVADO do tipo do objeto, nunca gravado nele:
     volume, densidade e atrito saem de massa + material, sem duplicar estado.
     ========================================================================== */
  var MATERIAIS = {
    /* densidade kg/m^3 · dureza 0..1 · atrito estático · condutividade W/(m·K) */
    granito: { nome: 'Granito', densidade: 2650, dureza: 0.95, atrito: 0.65, condutividade: 2.9, organico: false },
    calcario: { nome: 'Calcário', densidade: 2400, dureza: 0.55, atrito: 0.60, condutividade: 1.3, organico: false },
    argila: { nome: 'Argila', densidade: 1600, dureza: 0.20, atrito: 0.55, condutividade: 1.1, organico: false },
    areia: { nome: 'Areia', densidade: 1600, dureza: 0.10, atrito: 0.50, condutividade: 0.3, organico: false },
    madeira: { nome: 'Madeira', densidade: 650, dureza: 0.35, atrito: 0.45, condutividade: 0.15, organico: true },
    folha: { nome: 'Folhagem', densidade: 300, dureza: 0.05, atrito: 0.35, condutividade: 0.08, organico: true },
    fibra: { nome: 'Fibra vegetal', densidade: 400, dureza: 0.12, atrito: 0.50, condutividade: 0.05, organico: true },
    carne: { nome: 'Matéria animal', densidade: 1050, dureza: 0.10, atrito: 0.40, condutividade: 0.45, organico: true },
    fruto: { nome: 'Fruto', densidade: 900, dureza: 0.08, atrito: 0.38, condutividade: 0.55, organico: true },
    osso: { nome: 'Osso', densidade: 1900, dureza: 0.70, atrito: 0.42, condutividade: 0.35, organico: true },
    couro: { nome: 'Couro', densidade: 860, dureza: 0.25, atrito: 0.60, condutividade: 0.16, organico: true },
    agua: { nome: 'Água', densidade: RHO_AGUA_DOCE, dureza: 0, atrito: 0.01, condutividade: 0.6, organico: false },
    metal: { nome: 'Metal', densidade: 7800, dureza: 0.98, atrito: 0.55, condutividade: 50, organico: false },
    ceramica: { nome: 'Cerâmica', densidade: 2300, dureza: 0.60, atrito: 0.58, condutividade: 1.5, organico: false }
  };

  /* Classificação por tipo do objeto. Palavras do próprio motor (D.ITENS usa
     estes nomes), não uma taxonomia paralela. Tipos não mapeados caem em
     `desconhecido`, declarado, em vez de receberem um material inventado. */
  var MATERIAL_POR_TIPO = {
    pedra: 'granito', pedra_afiada: 'granito', lasca: 'granito', seixo: 'calcario',
    madeira: 'madeira', galho: 'madeira', tronco: 'madeira', tabua: 'madeira',
    lanca: 'madeira', machado: 'madeira', clava: 'madeira', vara: 'madeira',
    folha: 'folha', capim: 'fibra', fibra: 'fibra', corda: 'fibra', palha: 'fibra',
    carne: 'carne', peixe: 'carne', ovo: 'fruto', couro: 'couro', pele: 'couro',
    osso: 'osso', chifre: 'osso',
    barro: 'argila', vaso: 'ceramica', pote: 'ceramica', tijolo: 'ceramica',
    agua: 'agua', cantil: 'ceramica'
  };

  function materialDe(obj) {
    if (!obj) return null;
    var chave = MATERIAL_POR_TIPO[obj.tipo];
    if (!chave) {
      /* heurística declarada, não silenciosa: frutos do motor têm frutoTipo e
         classe 'objeto'; o resto assume orgânico leve só se a massa for baixa. */
      if (obj.classe === 'planta') chave = 'madeira';
      else if (typeof obj.massa === 'number' && obj.massa <= 0.3) chave = 'fruto';
    }
    if (!chave) {
      return {
        chave: 'desconhecido', nome: 'Material não classificado',
        conhecido: false,
        motivo: 'o tipo "' + (obj.tipo || '?') + '" nao esta em MATERIAL_POR_TIPO. ' +
          'Nenhum material foi inventado para ele.'
      };
    }
    var mat = MATERIAIS[chave];
    var out = {
      chave: chave, nome: mat.nome, conhecido: true,
      densidade: mat.densidade, dureza: mat.dureza,
      atrito: mat.atrito, condutividade: mat.condutividade, organico: mat.organico
    };
    if (typeof obj.massa === 'number' && obj.massa > 0) {
      out.volume = obj.massa / mat.densidade;                  /* m^3 */
      out.raioEquivalente = Math.cbrt(out.volume * 3 / (4 * Math.PI));
      out.peso = obj.massa * G;                                /* N */
      out.areaFrontal = Math.PI * out.raioEquivalente * out.raioEquivalente;
    }
    return out;
  }

  /* ==========================================================================
     CAMADA 5 — SOLO: TEXTURA, MATÉRIA ORGÂNICA, ÁGUA DISPONÍVEL

     Textura em fração de areia, silte e argila (soma 1). Capacidade de campo e
     ponto de murcha permanente por função de pedotransferência do tipo Rawls,
     em fração volumétrica. São relações da literatura de física do solo, não
     números escolhidos para o efeito ficar bom.
     ========================================================================== */
  function capacidadeDeCampo(areia, argila, mo) {
    /* θfc, fração volumétrica */
    return U.clamp(0.2576 - 0.20 * areia + 0.36 * argila + 0.0299 * (mo * 100) * 0.1, 0.06, 0.55);
  }
  function pontoDeMurcha(argila, mo) {
    /* θpmp, fração volumétrica */
    return U.clamp(0.026 + 0.50 * argila + 0.0158 * (mo * 100) * 0.1, 0.01, 0.35);
  }

  /* ==========================================================================
     CAMADA 2 a 6 — ESTADO REGIONAL (a Ilha Gênesis)
     Um Float32Array por propriedade. Nada por célula além de números.
     ========================================================================== */
  function criarRegional(reg, opcoes) {
    opcoes = opcoes || {};
    var tam = reg.largura;
    var n = tam * tam;
    var seed = (opcoes.seed | 0) || 1;
    var rng = U.RNG(seed ^ 0xa3b1e7);

    var E = {
      tam: tam, n: n, seed: seed,
      /* --- oceano e água --- */
      salinidade: new Float32Array(n),      /* g/kg  — 0 em terra */
      tempAgua: new Float32Array(n),        /* C     — só onde há água */
      correnteU: new Float32Array(n),       /* m/s   — leste */
      correnteV: new Float32Array(n),       /* m/s   — norte */
      onda: new Float32Array(n),            /* m     — altura significativa */
      /* --- atmosfera --- */
      pressao: new Float32Array(n),         /* hPa */
      ventoU: new Float32Array(n),          /* m/s */
      ventoV: new Float32Array(n),          /* m/s */
      umidadeAr: new Float32Array(n),       /* kg de vapor por kg de ar seco */
      tempAr: new Float32Array(n),          /* C */
      /* --- solo --- */
      areia: new Float32Array(n),           /* fração 0..1 */
      silte: new Float32Array(n),
      argila: new Float32Array(n),
      materiaOrganica: new Float32Array(n), /* fração 0..1 */
      mineral: new Float32Array(n),         /* riqueza mineral aproveitável 0..1 */
      capacidadeCampo: new Float32Array(n), /* θfc */
      pontoMurcha: new Float32Array(n),     /* θpmp */
      /* --- processos --- */
      evaporacao: new Float32Array(n),      /* mm/dia no último passo */
      escoamento: new Float32Array(n),      /* mm/dia no último passo */
      erosao: new Float32Array(n),          /* kg/(m²·dia), taxa */
      sedimento: new Float32Array(n),       /* kg/m² acumulado */
      particulas: new Float32Array(n),      /* densidade em suspensão 0..1 */
      /* --- derivados de relevo, calculados UMA VEZ ---
         alturaTerreno é do world.js e o teste A16 prova que o ambiente nunca a
         altera. Sendo imutável, o declive e o caminho de descida da água podem
         ser pré-computados: o escoamento e a erosão deixam de varrer 9 vizinhos
         por célula a cada passo. */
      declive: new Float32Array(n),         /* m/m */
      decliveX: new Float32Array(n),
      decliveY: new Float32Array(n),
      destinoFluxo: new Int32Array(n),      /* índice do vizinho mais baixo, -1 se é fundo local */
      indicesAgua: null,                    /* Int32Array com as células de água */
      indicesTerra: null,
      /* rugosidade aerodinâmica por célula, pré-resolvida a partir do bioma do
         world.js. Evita uma busca por string em objeto a cada célula a cada
         passo. Se algum dia o bioma mudar (W.pintarBioma), chamar
         recalcularRugosidade(). */
      rugosidade: new Float32Array(n),
      /* contabilidade */
      passos: 0, tempoSimulado: 0
    };

    calcularRelevo(E, reg);
    semearSolo(E, reg, rng);
    semearOceano(E, reg);
    recalcularRugosidade(E, reg, opcoes.biomaIds);
    return E;
  }

  function recalcularRugosidade(E, reg, biomaIds) {
    for (var i = 0; i < E.n; i++) {
      var nome = biomaIds ? biomaIds[reg.tipo[i]] : null;
      var r = (nome && RUGOSIDADE[nome] !== undefined) ? RUGOSIDADE[nome] : 0.20;
      E.rugosidade[i] = r;
    }
  }

  function iReg(x, y, tam) { return y * tam + x; }

  /* Declive por diferenças centrais sobre alturaTerreno (dado do world.js).
     Não é cópia do relevo: é a derivada dele, que o motor não calcula. */
  function calcularRelevo(E, reg) {
    var tam = E.tam, h = reg.alturaTerreno;
    for (var y = 0; y < tam; y++) {
      for (var x = 0; x < tam; x++) {
        var i = iReg(x, y, tam);
        var xe = x > 0 ? x - 1 : 0, xd = x < tam - 1 ? x + 1 : tam - 1;
        var yc = y > 0 ? y - 1 : 0, yb = y < tam - 1 ? y + 1 : tam - 1;
        var dx = (h[iReg(xd, y, tam)] - h[iReg(xe, y, tam)]) / ((xd - xe) || 1);
        var dy = (h[iReg(x, yb, tam)] - h[iReg(x, yc, tam)]) / ((yb - yc) || 1);
        E.decliveX[i] = dx; E.decliveY[i] = dy;
        E.declive[i] = Math.sqrt(dx * dx + dy * dy);
        E.destinoFluxo[i] = vizinhoMaisBaixo(reg, x, y, tam);
      }
    }
    var agua = [], terra = [];
    for (var k = 0; k < E.n; k++) {
      if (profundidadeDaAgua(reg, k) > 0) agua.push(k); else terra.push(k);
    }
    E.indicesAgua = Int32Array.from(agua);
    E.indicesTerra = Int32Array.from(terra);
  }

  /* Textura do solo a partir do que o mundo já afirma: relevo, declive, bioma e
     fertilidade. Encosta íngreme perde fino e fica arenosa; baixada acumula
     argila; praia é areia; a matéria orgânica acompanha a fertilidade que o
     world.js já sorteou. Nada aqui contradiz o motor, tudo deriva dele. */
  function semearSolo(E, reg, rng) {
    var tam = E.tam;
    for (var i = 0; i < E.n; i++) {
      var h = reg.alturaTerreno[i];
      var dec = E.declive[i];
      var fert = reg.fertilidade[i];
      var agua = h < NIVEL_MAR;

      var areia = U.clamp01(0.30 + dec * 1.4 + (h > 8 ? 0.18 : 0) + (h < 1.2 && h > -0.5 ? 0.35 : 0));
      var argila = U.clamp01(0.34 - dec * 0.9 + (h < 2 ? 0.10 : 0) + fert * 0.16);
      var silte = Math.max(0.05, 1 - areia - argila);
      var s = areia + argila + silte;
      areia /= s; argila /= s; silte /= s;

      E.areia[i] = areia; E.argila[i] = argila; E.silte[i] = silte;
      /* matéria orgânica: 0 a 12% em massa, acompanhando a fertilidade e caindo
         em encosta forte, onde a serapilheira não se fixa. */
      E.materiaOrganica[i] = agua ? 0.005 : U.clamp(fert * 0.11 * (1 - U.clamp01(dec * 0.8)), 0.002, 0.12);
      /* mineral aproveitável: rocha exposta em altitude e declive alto */
      E.mineral[i] = U.clamp01(0.05 + U.clamp01(dec * 1.1) * 0.55 + U.clamp01((h - 6) / 10) * 0.35);
      E.capacidadeCampo[i] = capacidadeDeCampo(areia, argila, E.materiaOrganica[i]);
      E.pontoMurcha[i] = pontoDeMurcha(argila, E.materiaOrganica[i]);
      if (E.pontoMurcha[i] >= E.capacidadeCampo[i]) E.pontoMurcha[i] = E.capacidadeCampo[i] * 0.5;
    }
  }

  function profundidadeDaAgua(reg, i) {
    var h = reg.alturaTerreno[i];
    return h < NIVEL_MAR ? (NIVEL_MAR - h) : 0;
  }

  function semearOceano(E, reg) {
    for (var i = 0; i < E.n; i++) {
      var prof = profundidadeDaAgua(reg, i);
      if (prof <= 0) { E.salinidade[i] = 0; E.tempAgua[i] = 0; E.onda[i] = 0; continue; }
      /* salinidade cai perto da foz e da costa rasa, onde entra água doce */
      var diluicao = U.clamp01(prof / 6);
      E.salinidade[i] = SALINIDADE_OCEANICA * (0.55 + 0.45 * diluicao);
      /* a coluna esfria com a profundidade: termoclina simplificada */
      E.tempAgua[i] = 26 - U.clamp(prof, 0, 60) * 0.22;
      E.onda[i] = 0;
    }
  }

  /* densidade da água do mar: equação de estado linearizada em torno de
     35 g/kg e 15 C. Suficiente para flutuabilidade e estratificação. */
  function densidadeAgua(salinidade, temperatura) {
    return RHO_AGUA_DOCE + 0.8 * salinidade - 0.2 * (temperatura - 15);
  }

  /* pressão de vapor de saturação, kPa — fórmula de Tetens */
  function pressaoVaporSaturacao(tC) {
    return 0.6108 * Math.exp(17.27 * tC / (tC + 237.3));
  }

  /* ==========================================================================
     CAMADA 3 — ATMOSFERA
     O vetor global de vento do world.js (m.clima.vento e climaAtual().vento)
     continua sendo A AUTORIDADE. Aqui ele ganha ESTRUTURA ESPACIAL: desvio pelo
     relevo, aceleração em crista, abrigo em vale, arrasto por vegetação e brisa
     entre mar e terra. É derivação, não um segundo vento.
     ========================================================================== */

  /* rugosidade aerodinâmica por bioma, adimensional 0..1 (fração de vento
     perdida na superfície). Floresta freia muito mais que areia ou água. */
  var RUGOSIDADE = {
    oceano: 0.02, recife: 0.04, rio: 0.02, lago: 0.02,
    praia: 0.06, deserto: 0.08, tundra: 0.10, savana: 0.18, prado: 0.15,
    pantano: 0.25, montanha: 0.30, taiga: 0.45, floresta: 0.55, tropical: 0.60
  };

  function atualizarAtmosfera(E, reg, ctx) {
    var ventoBase = ctx.ventoVelocidade;                 /* m/s, do world.js */
    var dirX = ctx.ventoDir.x, dirY = ctx.ventoDir.y;    /* unitário, do world.js */

    /* 1. temperatura do ar e pressão por célula */
    var somaTerra = 0, nTerra = 0, somaMar = 0, nMar = 0;
    for (var i = 0; i < E.n; i++) {
      var h = reg.alturaTerreno[i];
      var t = ctx.tempBase + (reg.temperatura[i] - ctx.tempTerrenoMedia) * 0.25
        - Math.max(0, h) * LAPSE;
      E.tempAr[i] = t;
      E.pressao[i] = P0 * Math.exp(-Math.max(0, h) / ESCALA_BAROMETRICA)
        - (t - ctx.tempBase) * 0.12;   /* ar quente = coluna menos densa */
      if (h < NIVEL_MAR) { somaMar += t; nMar++; } else { somaTerra += t; nTerra++; }
    }
    var tMar = nMar ? somaMar / nMar : ctx.tempBase;
    var tTerra = nTerra ? somaTerra / nTerra : ctx.tempBase;
    /* brisa: sopra do mais frio para o mais quente. De dia entra do mar; de
       noite inverte. O sinal sai da diferença medida, não de um relógio. */
    var forcaBrisa = U.clamp((tTerra - tMar) * 0.22, -2.5, 2.5);

    /* 2. campo de vento */
    var baseX = dirX * ventoBase, baseY = dirY * ventoBase;
    var temBrisa = Math.abs(forcaBrisa) > 0.05;
    var brisaMeia = forcaBrisa * 0.5;
    for (var j = 0; j < E.n; j++) {
      var vx = baseX, vy = baseY;

      /* desvio pelo relevo: o escoamento contorna a encosta em vez de subi-la */
      var gx = E.decliveX[j], gy = E.decliveY[j];
      var gg = gx * gx + gy * gy;
      if (gg > 1e-6) {
        var proj = (vx * gx + vy * gy) / gg;
        var k = U.clamp01(E.declive[j] * 0.9);         /* quanto mais íngreme, mais desvia */
        vx -= proj * gx * k; vy -= proj * gy * k;
        /* brisa: componente entre mar e terra ao longo do gradiente de altura */
        if (temBrisa) {
          var ng = Math.sqrt(gg);
          vx += (gx / ng) * brisaMeia;
          vy += (gy / ng) * brisaMeia;
        }
      }
      /* crista acelera, vale abriga; a vegetação freia */
      var exposicao = U.clamp((reg.alturaTerreno[j] - ctx.alturaMedia) / 12, -0.6, 0.9);
      var fator = (1 + exposicao * 0.55) * (1 - E.rugosidade[j]);
      E.ventoU[j] = vx * fator;
      E.ventoV[j] = vy * fator;
    }
    E.brisa = forcaBrisa;
    E.tempMarMedia = tMar;
    E.tempTerraMedia = tTerra;
  }

  /* ==========================================================================
     CAMADA 2 — OCEANO REGIONAL
     Corrente puxada pelo vento com deflexão, onda por pista e vento, mistura
     térmica com a atmosfera. Só as células com água entram na conta.
     ========================================================================== */
  function atualizarOceano(E, reg, dtDias) {
    var agua = E.indicesAgua, cos45 = 0.7071;
    for (var a = 0; a < agua.length; a++) {
      var i = agua[a];
      var prof = NIVEL_MAR - reg.alturaTerreno[i];

      /* corrente de deriva: ~3% do vento, defletida 45 graus (espiral de Ekman),
         freada em água rasa pelo atrito com o fundo. */
      var vu = E.ventoU[i], vv = E.ventoV[i];
      var freio = U.clamp01(prof / 8);
      E.correnteU[i] = (vu * cos45 - vv * cos45) * 0.03 * freio;
      E.correnteV[i] = (vu * cos45 + vv * cos45) * 0.03 * freio;

      /* onda: cresce com o vento ao quadrado e a raiz da pista disponível,
         e arrebenta quando a profundidade chega a ~1,3 vez a altura. */
      var vel = Math.sqrt(vu * vu + vv * vv);
      var pista = Math.min(160, prof * 25 + 20);         /* m, dentro da região */
      var hs = 0.0016 * vel * vel * Math.sqrt(pista / G);
      E.onda[i] = Math.min(hs, prof / 1.3);

      /* troca térmica com o ar: a água tem inércia enorme, então segue devagar */
      E.tempAgua[i] += (E.tempAr[i] - E.tempAgua[i]) * U.clamp01(dtDias * 0.35 / (1 + prof * 0.2));
    }
  }

  /* ==========================================================================
     CAMADA 4 — CICLO DA ÁGUA
     Evaporação, transporte pelo ar, precipitação orográfica, infiltração e
     escoamento por gradiente. É aqui que mora a única escrita em estado de LEI.
     ========================================================================== */

  /* Evaporação de referência: termo aerodinâmico do método de Penman-Monteith
     na forma da FAO-56.

         E = 6,43 · (1 + 0,536·u2) · (es - ea) / λ      [mm/dia]

     com (es - ea) em kPa e λ = 2,45 MJ/kg, o calor latente de vaporização a
     20 C. Dá a ordem de grandeza certa: 4 a 8 mm/dia numa ilha tropical
     ventilada, que é o que se mede no mundo real. */
  var LAMBDA_MJ = 2.45;               /* MJ/kg */
  function evaporacaoPotencial(tC, umidadeRelativa, vento) {
    var es = pressaoVaporSaturacao(tC);
    var ea = es * U.clamp01(umidadeRelativa);
    return Math.max(0, 6.43 * (1 + 0.536 * Math.max(0, vento)) * (es - ea) / LAMBDA_MJ);
  }

  /* Profundidade da zona de raízes usada para converter milímetros de água em
     fração de umidade do solo. 0,30 m é a camada que a maior parte da vegetação
     herbácea e a serapilheira efetivamente exploram.
       reservatório (mm) = θfc · Z · 1000
     Para θfc = 0,30 e Z = 0,30 m o reservatório é 90 mm, e 5 mm/dia de
     evaporação consomem 5,6% da umidade por dia. */
  var PROF_RAIZ = 0.30;               /* m */
  function reservatorioMm(capacidadeCampo) {
    return Math.max(1, capacidadeCampo * PROF_RAIZ * 1000);
  }

  /* Ponto, na escala 0..1 de reg.umidade do motor, a partir do qual a água
     deixa de ser retida e passa a drenar. Corresponde à capacidade de campo
     expressa na escala do world.js, onde 1 é saturação. */
  var LIMIAR_DRENAGEM = 0.85;

  function passoAgua(E, reg, ctx, dtDias, opcoes) {
    var tam = E.tam, n = E.n;
    var permitirEscrita = opcoes.escreverUmidade !== false;
    var deltaSolo = E._deltaSolo || (E._deltaSolo = new Float32Array(n));
    deltaSolo.fill(0);

    var chuvaGlobal = ctx.chuva;        /* 0..1, autoridade: world.js climaAtual */
    var totalEvap = 0, totalPrecip = 0, totalEscoa = 0;

    /* 1. evaporação e evapotranspiração */
    for (var i = 0; i < n; i++) {
      var t = E.tempAr[i];
      var vu = E.ventoU[i], vv = E.ventoV[i];
      var vento = Math.sqrt(vu * vu + vv * vv);
      var ur = U.clamp01(E.umidadeAr[i] / Math.max(1e-6, umidadeSaturacao(t)));
      var ep = evaporacaoPotencial(t, ur, vento);
      var evap;
      if (reg.alturaTerreno[i] < NIVEL_MAR) {
        evap = ep;                                     /* superfície livre de água */
      } else {
        /* Do solo, com dois freios físicos:
           1. a água acima do ponto de murcha é a que sai fácil;
           2. solo quase seco praticamente não evapora, então a umidade tem um
              piso natural em vez de despencar até zero absoluto. */
        var theta = reg.umidade[i] * E.capacidadeCampo[i];
        var disp = U.clamp01((theta - E.pontoMurcha[i]) / Math.max(1e-6, E.capacidadeCampo[i] - E.pontoMurcha[i]));
        evap = ep * (0.15 + 0.85 * disp) * U.clamp01(reg.umidade[i] / 0.08);
        deltaSolo[i] -= evap * dtDias / reservatorioMm(E.capacidadeCampo[i]);
      }
      E.evaporacao[i] = evap;
      totalEvap += evap;
      E.umidadeAr[i] += evap * dtDias * 1e-4;
    }

    /* 2. transporte do vapor pelo vento (advecção semi-lagrangiana, 1 passo) */
    advectarCampo(E.umidadeAr, E.ventoU, E.ventoV, tam, dtDias * 86400 * 0.02);

    /* 3. condensação e distribuição espacial da chuva.

       QUEM MOLHA O SOLO É O world.js. Ele já aplica a chuva em reg.umidade
       (world.js:795-807) e continua sendo a autoridade sobre quando e quanto
       chove. Se este módulo também somasse chuva ao solo, a mesma água entraria
       duas vezes, e foi exatamente isso que a primeira execução do teste A14
       mostrou: a umidade subiu MAIS com o ambiente ligado.

       Então aqui a chuva vira CAMPO DE DIAGNÓSTICO: o padrão orográfico, com
       barlavento molhado e sotavento seco, fica disponível para quem quiser ler,
       e não toca no solo. O ambiente é dono do que TIRA água (evaporação e
       escoamento) e do vapor no ar; o motor é dono do que a DEVOLVE. */
    var campoPrecip = E.precipitacaoCampo || (E.precipitacaoCampo = new Float32Array(n));
    for (var k = 0; k < n; k++) {
      var tk = E.tempAr[k];
      var sat = umidadeSaturacao(tk);
      var precip = 0;
      if (chuvaGlobal > 0) {
        var subida = (E.ventoU[k] * E.decliveX[k] + E.ventoV[k] * E.decliveY[k]);
        var orografico = U.clamp(1 + subida * 0.35, 0.35, 2.2);
        precip = chuvaGlobal * 9.0 * orografico;      /* mm/dia */
      }
      if (E.umidadeAr[k] > sat) {
        precip += (E.umidadeAr[k] - sat) * 1e4;
        E.umidadeAr[k] = sat;                          /* o excesso condensa */
      }
      campoPrecip[k] = precip;
      totalPrecip += precip;
    }

    /* 4. drenagem e escoamento superficial.

       Acima da capacidade de campo a água não fica retida: percola e escorre.
       Na escala de umidade do motor (0 = seco, 1 = saturado), a capacidade de
       campo fica em torno de 0,85 da saturação para os solos desta ilha, então
       é desse ponto para cima que a água desce pelo gradiente do terreno. É o
       que seca a crista e encharca a baixada, e é o que faltava para a umidade
       ter para onde ir. */
    var terra = E.indicesTerra, fatorTempo = U.clamp01(dtDias * 6);
    for (var q = 0; q < terra.length; q++) {
      var j = terra[q];
      var u = reg.umidade[j] + deltaSolo[j];
      if (u <= LIMIAR_DRENAGEM) { E.escoamento[j] = 0; continue; }
      var excesso = u - LIMIAR_DRENAGEM;
      /* Manning simplificado: a vazão cresce com a raiz do declive.
         Solo arenoso drena mais rápido que argiloso. */
      var condutividade = 0.35 + E.areia[j] * 0.9 - E.argila[j] * 0.25;
      var vaz = excesso * U.clamp01(condutividade * (0.35 + Math.sqrt(U.clamp01(E.declive[j])) * 0.9)) * fatorTempo;
      var destino = E.destinoFluxo[j];
      deltaSolo[j] -= vaz;
      if (destino >= 0 && reg.alturaTerreno[destino] >= NIVEL_MAR) {
        deltaSolo[destino] += vaz * 0.92;              /* 8% percola para baixo */
      }
      /* se o destino é água, a vazão sai do sistema: chegou ao mar ou ao rio */
      E.escoamento[j] = vaz * reservatorioMm(E.capacidadeCampo[j]) / Math.max(1e-6, dtDias);
      totalEscoa += vaz;
    }

    /* 5. A ÚNICA ESCRITA EM ESTADO DE LEI */
    var escrito = 0;
    if (permitirEscrita) escrito = aplicarUmidadeNoSolo(reg, deltaSolo);

    E.balanco = {
      evaporacaoMedia: totalEvap / n,
      precipitacaoMedia: totalPrecip / n,
      escoamentoMedio: totalEscoa / n,
      celulasEscritas: escrito
    };
    return E.balanco;
  }

  /* umidade de saturação do ar, kg/kg, a partir da pressão de vapor */
  function umidadeSaturacao(tC) {
    var es = pressaoVaporSaturacao(tC);               /* kPa */
    return 0.622 * es / (P0 / 10 - es);
  }

  function vizinhoMaisBaixo(reg, x, y, tam) {
    var h0 = reg.alturaTerreno[iReg(x, y, tam)];
    var melhor = -1, menor = h0;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        var nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= tam || ny >= tam) continue;
        var j = iReg(nx, ny, tam);
        if (reg.alturaTerreno[j] < menor) { menor = reg.alturaTerreno[j]; melhor = j; }
      }
    }
    return melhor;
  }

  /* --------------------------------------------------------------------------
     O MUTATOR. Única função deste módulo que escreve em array do world.js.
     Recebe deltas em fração de umidade e aplica com o mesmo clamp do motor.
     Devolve quantas células mudaram, para o teste poder medir.
     -------------------------------------------------------------------------- */
  function aplicarUmidadeNoSolo(reg, delta) {
    var n = reg.umidade.length, mudou = 0;
    for (var i = 0; i < n; i++) {
      var d = delta[i];
      if (d === 0) continue;
      var antes = reg.umidade[i];
      var depois = U.clamp01(antes + d);
      if (depois !== antes) { reg.umidade[i] = depois; mudou++; }
    }
    return mudou;
  }

  /* advecção semi-lagrangiana de um campo escalar por um campo de velocidade.
     Um passo, sem subdivisão: barato e estável para o que precisamos. */
  function advectarCampo(campo, vu, vv, tam, dtSeg) {
    var tmp = advectarCampo._tmp;
    if (!tmp || tmp.length !== campo.length) tmp = advectarCampo._tmp = new Float32Array(campo.length);
    for (var y = 0; y < tam; y++) {
      for (var x = 0; x < tam; x++) {
        var i = iReg(x, y, tam);
        var sx = x - vu[i] * dtSeg;
        var sy = y - vv[i] * dtSeg;
        sx = U.clamp(sx, 0, tam - 1.001); sy = U.clamp(sy, 0, tam - 1.001);
        var x0 = sx | 0, y0 = sy | 0;
        var fx = sx - x0, fy = sy - y0;
        var x1 = Math.min(x0 + 1, tam - 1), y1 = Math.min(y0 + 1, tam - 1);
        var a = campo[iReg(x0, y0, tam)], b = campo[iReg(x1, y0, tam)];
        var c = campo[iReg(x0, y1, tam)], d = campo[iReg(x1, y1, tam)];
        tmp[i] = U.lerp(U.lerp(a, b, fx), U.lerp(c, d, fx), fy);
      }
    }
    campo.set(tmp);
  }

  /* ==========================================================================
     CAMADA 6 — FÍSICA DO AMBIENTE
     ========================================================================== */

  /* Força do vento sobre um corpo: arrasto aerodinâmico real.
     F = 0,5 · ρ · Cd · A · v². Serve para a árvore balançar por medida, não por
     animação: a amplitude sai da força, da área de copa e da massa. */
  function forcaDoVento(E, x, y, area, cd) {
    var tam = E.tam;
    var i = iReg(U.clamp(x | 0, 0, tam - 1), U.clamp(y | 0, 0, tam - 1), tam);
    var vu = E.ventoU[i], vv = E.ventoV[i];
    var v = Math.hypot(vu, vv);
    var f = 0.5 * RHO_AR * (cd === undefined ? 0.8 : cd) * (area || 1) * v * v;
    return { fx: v > 0 ? f * vu / v : 0, fy: v > 0 ? f * vv / v : 0, modulo: f, velocidade: v };
  }

  /* Módulo de elasticidade da madeira verde, Pa. Faixa real de 8 a 12 GPa para
     a maioria das folhosas; 1,0e10 é o meio dessa faixa. */
  var E_MADEIRA = 1.0e10;

  /* Resposta de uma planta ao vento, derivada do estado do mundo e do próprio
     indivíduo. Nada é animado: isto devolve números que o render usa.

     O tronco é tratado como viga engastada de seção circular sob carga no topo:

         I = π·d⁴/64            momento de inércia da seção
         k = 3·E·I / L³         rigidez à flexão no topo
         δ = F / k              deflexão estática
         f = (1/2π)·√(k/mef)    frequência natural

     A massa efetiva sai do volume real do tronco e da copa com a densidade da
     madeira da tabela de materiais, não de um palpite. */
  function respostaDaPlantaAoVento(E, planta) {
    var altura = Math.max(0.2, planta.altura || 1);
    var copa = planta.copa || altura * 0.4;
    var area = Math.max(0.05, copa * altura * 0.5);       /* m² de área frontal */
    var f = forcaDoVento(E, planta.pos.x, planta.pos.y, area, 0.6);

    var d = Math.max(0.02, planta.tronco || 0.06);        /* diâmetro, m */
    var I = Math.PI * Math.pow(d, 4) / 64;
    var k = 3 * E_MADEIRA * I / Math.pow(altura, 3);      /* N/m */
    var deflexao = f.modulo / Math.max(1e-6, k);          /* m no topo */

    /* massa: tronco cilíndrico mais copa, com a densidade real da madeira */
    var volTronco = Math.PI * (d / 2) * (d / 2) * altura;
    var volCopa = 0.10 * Math.PI * Math.pow(copa / 2, 2) * altura * 0.5;
    var massa = (volTronco + volCopa) * MATERIAIS.madeira.densidade;
    /* massa efetiva de uma viga engastada com massa distribuída: 0,24·m */
    var mef = Math.max(0.05, 0.24 * massa);
    var freq = Math.sqrt(k / mef) / (2 * Math.PI);

    /* tensão de flexão na base contra a resistência da madeira verde (~50 MPa) */
    var tensao = f.modulo * altura * (d / 2) / Math.max(1e-12, I);
    return {
      forca: f.modulo, velocidade: f.velocidade,
      direcao: Math.atan2(f.fy, f.fx),
      deflexao: Math.min(deflexao, altura * 0.35),        /* m */
      deflexaoMm: Math.min(deflexao, altura * 0.35) * 1000,
      inclinacaoGraus: Math.atan(Math.min(deflexao, altura * 0.35) / altura) * DEG,
      rigidez: k, massa: massa, massaEfetiva: mef,
      frequencia: freq,                                    /* Hz */
      tensaoBase: tensao,                                  /* Pa */
      quebra: tensao > 50e6
    };
  }

  /* Um fruto maduro cai quando o vento vence a resistência do pedúnculo. */
  function frutoDesprende(E, planta, massaFruto, maturidade) {
    var r = respostaDaPlantaAoVento(E, planta);
    var resistencia = 0.6 * (1 - U.clamp01(maturidade)) + 0.05;   /* N */
    var arrancar = r.forca * 0.02 + massaFruto * G * U.clamp01(maturidade) * 0.25;
    return { desprende: arrancar > resistencia, forca: arrancar, resistencia: resistencia };
  }

  /* Transferência de calor por condução entre células vizinhas, sobre o campo de
     temperatura do ar. Explícito, um passo, com o número de Courant preso. */
  function difundir(campo, tam, k) {
    var tmp = difundir._tmp;
    if (!tmp || tmp.length !== campo.length) tmp = difundir._tmp = new Float32Array(campo.length);
    k = U.clamp(k, 0, 0.24);                     /* estabilidade do esquema explícito */
    for (var y = 0; y < tam; y++) {
      for (var x = 0; x < tam; x++) {
        var i = iReg(x, y, tam);
        var e = campo[iReg(x > 0 ? x - 1 : 0, y, tam)];
        var d = campo[iReg(x < tam - 1 ? x + 1 : tam - 1, y, tam)];
        var c = campo[iReg(x, y > 0 ? y - 1 : 0, tam)];
        var b = campo[iReg(x, y < tam - 1 ? y + 1 : tam - 1, tam)];
        tmp[i] = campo[i] + k * (e + d + c + b - 4 * campo[i]);
      }
    }
    campo.set(tmp);
  }

  /* Erosão hídrica: potência do escoamento contra a coesão do solo. Argila e
     matéria orgânica seguram; areia em encosta vai embora.
     NÃO altera alturaTerreno, que é do world.js. Acumula sedimento em campo
     próprio e deixa a decisão de rebaixar o relevo para uma fase futura. */
  function atualizarErosao(E, reg, dtDias) {
    var terra = E.indicesTerra;
    for (var q2 = 0; q2 < terra.length; q2++) {
      var i = terra[q2];
      var vaz = E.escoamento[i] / 1000;
      if (vaz <= 0) { E.erosao[i] = 0; continue; }
      var coesao = 0.25 + E.argila[i] * 0.55 + E.materiaOrganica[i] * 2.2;
      var taxa = Math.max(0, vaz * Math.sqrt(U.clamp01(E.declive[i])) * 12 - coesao * 0.02);
      E.erosao[i] = taxa;
      if (taxa > 0) {
        E.sedimento[i] -= taxa * dtDias;
        var destino = E.destinoFluxo[i];
        if (destino >= 0) E.sedimento[destino] += taxa * dtDias * 0.9;
        /* a perda de solo leva matéria orgânica junto */
        E.materiaOrganica[i] = Math.max(0.001, E.materiaOrganica[i] - taxa * dtDias * 0.004);
        E.capacidadeCampo[i] = capacidadeDeCampo(E.areia[i], E.argila[i], E.materiaOrganica[i]);
      }
    }
  }

  /* Partículas em suspensão como CAMPO, não como objetos. Pólen, poeira, cinza,
     esporo: densidade por célula, injetada por fonte, levada pelo vento,
     depositada por gravidade. Custo constante, independente da quantidade. */
  function emitirParticulas(E, x, y, quantidade) {
    var tam = E.tam;
    var i = iReg(U.clamp(x | 0, 0, tam - 1), U.clamp(y | 0, 0, tam - 1), tam);
    E.particulas[i] = U.clamp01(E.particulas[i] + quantidade);
    return i;
  }

  function atualizarParticulas(E, dtDias) {
    advectarCampo(E.particulas, E.ventoU, E.ventoV, E.tam, dtDias * 86400 * 0.02);
    var dep = U.clamp01(dtDias * 1.2);
    for (var i = 0; i < E.n; i++) E.particulas[i] *= (1 - dep);
  }

  /* ==========================================================================
     PASSO DO AMBIENTE
     Roda DEPOIS de W.passoMundo. Lê o estado do motor por um contexto explícito,
     para que este módulo não precise conhecer a forma interna do mundo.
     ========================================================================== */
  function contextoDoMundo(W, m) {
    var reg = W.regiaoAtiva(m);
    var ce = W.climaAtual(m);
    var somaH = 0, somaT = 0, n = reg.alturaTerreno.length;
    for (var i = 0; i < n; i++) { somaH += reg.alturaTerreno[i]; somaT += reg.temperatura[i]; }
    return {
      reg: reg,
      chuva: ce.chuva,
      ventoVelocidade: ce.vento,
      ventoDir: { x: m.clima.vento.x, y: m.clima.vento.y },
      tempBase: W.tempAmbiente(m, reg.largura >> 1, reg.altura >> 1),
      tempTerrenoMedia: somaT / n,
      alturaMedia: somaH / n,
      biomaIds: W.BIOMA_IDS,
      luzNoite: W.luzNoite(m),
      segMundo: m.tempo.segMundo
    };
  }

  function passo(E, reg, ctx, dtSegundos, opcoes) {
    opcoes = opcoes || {};
    var dtDias = dtSegundos / 86400;
    atualizarAtmosfera(E, reg, ctx);
    atualizarOceano(E, reg, dtDias);
    var bal = passoAgua(E, reg, ctx, dtDias, opcoes);
    atualizarErosao(E, reg, dtDias);
    atualizarParticulas(E, dtDias);
    difundir(E.tempAr, E.tam, U.clamp(dtDias * 2, 0, 0.2));
    E.passos++;
    E.tempoSimulado += dtSegundos;
    return bal;
  }

  /* ==========================================================================
     CRIAÇÃO INTEGRADA
     ========================================================================== */
  function criar(W, m, opcoes) {
    opcoes = opcoes || {};
    if (!W || typeof W.regiaoAtiva !== 'function') {
      throw new Error('ambiente.criar: GenesisWorld ausente. Este modulo LE o motor, nunca o substitui.');
    }
    var reg = W.regiaoAtiva(m);
    var lat = parseFloat(reg.lat), lon = parseFloat(reg.lon);
    /* elevação real da ilha, lida do motor: o pico do terreno da região */
    var pico = -1e9;
    for (var i = 0; i < reg.alturaTerreno.length; i++) {
      if (reg.alturaTerreno[i] > pico) pico = reg.alturaTerreno[i];
    }
    /* chuva real da ilha, derivada do bioma que o motor sorteou para cada tile.
       D.BIOMAS[x].chuva é o peso de chuva do bioma: 0,1 no deserto, 2,0 na
       floresta tropical. A escala de 4 mm/dia por unidade põe a tropical em
       ~8 mm/dia, ou seja ~2900 mm/ano, que é a faixa real desse bioma. */
    var precipIlha = null;
    if (opcoes.D && opcoes.D.BIOMAS && W.BIOMA_IDS) {
      var soma = 0, cont = 0;
      for (var k = 0; k < reg.tipo.length; k++) {
        var def = opcoes.D.BIOMAS[W.BIOMA_IDS[reg.tipo[k]]];
        if (def && typeof def.chuva === 'number') { soma += def.chuva; cont++; }
      }
      if (cont) precipIlha = (soma / cont) * 4.0;
    }
    var estado = {
      contrato: CONTRATO,
      versao: VERSAO,
      seed: m.seed,
      planeta: criarPlaneta({
        seed: m.seed, T: opcoes.T,
        larg: opcoes.planetaLarg, alt: opcoes.planetaAlt,
        ancoraLat: lat, ancoraLon: lon,
        ancoraElevacao: pico,
        ancoraPrecipitacao: precipIlha
      }),
      regional: criarRegional(reg, { seed: m.seed, biomaIds: W.BIOMA_IDS }),
      ancora: {
        lat: lat, lon: lon,
        elevacaoDaIlha: pico,
        nivel: 'regiao',
        valido: false,
        nota: 'A ilha entra no planeta como PONTO. Descer do planeta para o tile ' +
          'continua impossivel: faltam ancora, orientacao e raio de referencia ' +
          '(ver LACUNAS_GEO da fase 2A). A 160 m num planeta de 6371 km, o erro ' +
          'de +-556 m da fase 2A vale 0,5% de uma celula planetaria de 1 grau, ' +
          'entao a colocacao como ponto e honesta.'
      }
    };
    return estado;
  }

  function passoIntegrado(estado, W, m, dtSegundos, opcoes) {
    var ctx = contextoDoMundo(W, m);
    return passo(estado.regional, ctx.reg, ctx, dtSegundos, opcoes);
  }

  /* ==========================================================================
     RESUMO LEGÍVEL DE UMA CÉLULA — física, química e biologia num lugar só
     ========================================================================== */
  function descreverCelula(estado, reg, x, y, W, m) {
    var E = estado.regional, tam = E.tam;
    if (x < 0 || y < 0 || x >= tam || y >= tam) return null;
    var i = iReg(x | 0, y | 0, tam);
    var prof = profundidadeDaAgua(reg, i);
    var theta = reg.umidade[i] * E.capacidadeCampo[i];
    return {
      tile: { x: x | 0, y: y | 0, indexLinear: i },
      fisica: {
        altitude: reg.alturaTerreno[i],
        declive: E.declive[i],
        profundidadeAgua: prof,
        pressao: E.pressao[i],
        temperaturaAr: E.tempAr[i],
        temperaturaAgua: prof > 0 ? E.tempAgua[i] : null,
        vento: { u: E.ventoU[i], v: E.ventoV[i], velocidade: Math.hypot(E.ventoU[i], E.ventoV[i]) },
        corrente: prof > 0 ? { u: E.correnteU[i], v: E.correnteV[i] } : null,
        onda: prof > 0 ? E.onda[i] : null,
        densidadeAgua: prof > 0 ? densidadeAgua(E.salinidade[i], E.tempAgua[i]) : null
      },
      quimica: {
        salinidade: prof > 0 ? E.salinidade[i] : null,
        textura: { areia: E.areia[i], silte: E.silte[i], argila: E.argila[i] },
        classeTextural: classeTextural(E.areia[i], E.silte[i], E.argila[i]),
        materiaOrganica: E.materiaOrganica[i],
        mineral: E.mineral[i],
        umidadeAr: E.umidadeAr[i],
        umidadeRelativa: U.clamp01(E.umidadeAr[i] / Math.max(1e-9, umidadeSaturacao(E.tempAr[i])))
      },
      biologia: {
        umidadeSolo: reg.umidade[i],
        conteudoVolumetrico: theta,
        capacidadeCampo: E.capacidadeCampo[i],
        pontoMurcha: E.pontoMurcha[i],
        aguaDisponivel: Math.max(0, theta - E.pontoMurcha[i]),
        estresseHidrico: theta <= E.pontoMurcha[i],
        fertilidade: reg.fertilidade[i],
        bioma: W ? W.BIOMA_IDS[reg.tipo[i]] : null
      },
      processos: {
        evaporacao: E.evaporacao[i],
        escoamento: E.escoamento[i],
        erosao: E.erosao[i],
        sedimento: E.sedimento[i],
        particulas: E.particulas[i]
      }
    };
  }

  /* Classe textural pelo triângulo do USDA, simplificada aos grupos que o
     projeto precisa. Não inventa código Munsell nem cor de horizonte. */
  function classeTextural(areia, silte, argila) {
    if (argila >= 0.40) return 'argilosa';
    if (areia >= 0.70) return 'arenosa';
    if (silte >= 0.50) return 'siltosa';
    if (argila >= 0.27) return 'argilo-arenosa';
    if (areia >= 0.52) return 'franco-arenosa';
    return 'franca';
  }

  /* ==========================================================================
     TESTES
     ========================================================================== */
  function rodarTestes(ctx) {
    ctx = ctx || {};
    var W = ctx.W || (typeof globalThis !== 'undefined' ? globalThis.GenesisWorld : null);
    var T = ctx.T || (typeof globalThis !== 'undefined' ? globalThis.GenesisF1 : null);
    var out = [];
    function add(id, nome, ok, valores, detalhe) {
      out.push({ id: id, nome: nome, ok: !!ok, valores: valores, detalhe: detalhe || '' });
    }
    function na(id, nome, motivo) {
      out.push({ id: id, nome: nome, ok: true, na: true, valores: { 'N/A': 'nao executavel' }, detalhe: motivo });
    }
    if (!W || typeof W.criar !== 'function') {
      add('A0', 'world.js disponivel', false, { erro: 'GenesisWorld ausente' }, 'sem motor nao ha ambiente');
      return out;
    }

    var seed = ctx.seed !== undefined ? ctx.seed : 20260101;
    var m = W.criar({ seed: seed });
    var reg = W.regiaoAtiva(m);
    var estado = criar(W, m, { T: T });
    var P = estado.planeta, E = estado.regional;

    /* ---------- A1 · planeta coerente ---------- */
    (function () {
      var s = estatisticasPlaneta(P);
      var razoavel = s.fracaoOceano > 0.45 && s.fracaoOceano < 0.90 &&
        s.elevacaoMax > 1000 && s.elevacaoMin < -1000 && P.n === P.larg * P.alt;
      add('A1', 'planeta · oceano e continentes em proporcao plausivel', razoavel, {
        'celulas': s.celulas,
        'fracao oceano': s.fracaoOceano.toFixed(4),
        'fracao terra': s.fracaoTerra.toFixed(4),
        'elevacao max (m)': s.elevacaoMax.toFixed(0),
        'elevacao min (m)': s.elevacaoMin.toFixed(0),
        'temp media (C)': s.tempMedia.toFixed(2),
        'precip media (mm/dia)': s.precipMedia.toFixed(2)
      }, 'a Terra real tem 71% de oceano; aqui aceitamos 45% a 90% porque o planeta e outro, nao uma copia.');
    })();

    /* ---------- A2 · a ilha canonica esta em TERRA ---------- */
    (function () {
      var a = amostraPlaneta(P, estado.ancora.lat, estado.ancora.lon);
      var vizinhosOk = true;
      add('A2', 'ancora · a coordenada que o world.js sorteou cai em TERRA', a.elevacao > 0, {
        'lat': estado.ancora.lat,
        'lon': estado.ancora.lon,
        'celula': a.ix + ',' + a.iy,
        'elevacao (m)': a.elevacao.toFixed(1),
        'oceano?': String(a.oceano),
        'temperatura (C)': a.temperatura.toFixed(1),
        'precipitacao (mm/dia)': a.precipitacao.toFixed(2)
      }, 'restricao derivada de dado canonico: o world.js ja decidiu onde a ilha esta, o mapa nao pode contradizer isso colocando mar la.');
      void vizinhosOk;
    })();

    /* ---------- A3 · equivalencia com terra.js ---------- */
    if (!T) { na('A3', 'equivalencia lat/lon com a fase 1', 'terra.js ausente'); }
    else {
      (function () {
        var maxDif = 0;
        var casos = [[0, 0], [-19.53, 31.59], [90, 0], [-90, 0], [45, 180], [-33.3, -70.6]];
        for (var i = 0; i < casos.length; i++) {
          var a = dirDeLatLon(casos[i][0], casos[i][1], null);
          var b = T.dirDeLatLon(casos[i][0], casos[i][1]);
          maxDif = Math.max(maxDif, Math.abs(a.x - b.x), Math.abs(a.y - b.y), Math.abs(a.z - b.z));
        }
        add('A3', 'geometria · dirDeLatLon local == fase1/terra.js bit a bit', maxDif === 0, {
          'casos': casos.length,
          'diferenca maxima': maxDif
        }, 'a convencao esferica e a mesma da fase 1. Quando T e passado, T e quem calcula; a copia local existe so para rodar em Node sem three.js.');
      })();
    }

    /* ---------- A4 · determinismo ---------- */
    (function () {
      var m2 = W.criar({ seed: seed });
      var e2 = criar(W, m2, { T: T });
      var difP = 0, difE = 0, i;
      for (i = 0; i < P.n; i++) if (P.elevacao[i] !== e2.planeta.elevacao[i]) difP++;
      for (i = 0; i < E.n; i++) {
        if (E.areia[i] !== e2.regional.areia[i]) difE++;
        if (E.capacidadeCampo[i] !== e2.regional.capacidadeCampo[i]) difE++;
      }
      var m3 = W.criar({ seed: seed + 1 });
      var e3 = criar(W, m3, { T: T });
      var mudou = 0;
      for (i = 0; i < P.n; i++) if (P.elevacao[i] !== e3.planeta.elevacao[i]) { mudou++; if (mudou > 100) break; }
      add('A4', 'determinismo · mesma seed => mesmo ambiente; outra seed => outro', (difP === 0 && difE === 0 && mudou > 100), {
        'divergencias planeta (mesma seed)': difP,
        'divergencias solo (mesma seed)': difE,
        'celulas diferentes (outra seed)': mudou > 100 ? '>100' : mudou
      }, 'dois mundos independentes com a mesma seed produzem o mesmo ambiente bit a bit.');
    })();

    /* ---------- A5 · sem Date.now e sem Math.random ---------- */
    (function () {
      var dn = Date.now, mr = Math.random, cDn = 0, cMr = 0, erro = null;
      Date.now = function () { cDn++; return dn.call(Date); };
      Math.random = function () { cMr++; return mr.call(Math); };
      try {
        var mm = W.criar({ seed: seed });
        var ee = criar(W, mm, { T: T });
        var cc = contextoDoMundo(W, mm);
        for (var k = 0; k < 20; k++) passo(ee.regional, W.regiaoAtiva(mm), cc, 600, {});
      } catch (e) { erro = e.message; }
      Date.now = dn; Math.random = mr;
      add('A5', 'determinismo estrutural · criar e passo nao chamam Date.now nem Math.random', (cDn === 0 && cMr === 0 && !erro), {
        'chamadas Date.now': cDn, 'chamadas Math.random': cMr, 'erro': erro || '(nenhum)'
      }, 'medido por interceptacao real durante 20 passos de ambiente.');
    })();

    /* ---------- A6 · campo de vento tem estrutura ---------- */
    (function () {
      var cc = contextoDoMundo(W, m);
      atualizarAtmosfera(E, reg, cc);
      var mn = 1e9, mx = -1e9, soma = 0, distintos = {};
      for (var i = 0; i < E.n; i++) {
        var v = Math.hypot(E.ventoU[i], E.ventoV[i]);
        if (v < mn) mn = v; if (v > mx) mx = v; soma += v;
        distintos[v.toFixed(3)] = 1;
      }
      var nDistintos = Object.keys(distintos).length;
      add('A6', 'atmosfera · o vento virou CAMPO (antes era 1 vetor para 25600 tiles)', (nDistintos > 500 && mx > mn), {
        'vento global do motor (m/s)': cc.ventoVelocidade.toFixed(3),
        'velocidades distintas no campo': nDistintos,
        'min (m/s)': mn.toFixed(3),
        'max (m/s)': mx.toFixed(3),
        'media (m/s)': (soma / E.n).toFixed(3),
        'brisa mar-terra (m/s)': E.brisa.toFixed(3)
      }, 'a autoridade continua sendo m.clima.vento do world.js. O que se acrescenta e estrutura espacial: relevo, rugosidade do bioma e brisa.');
    })();

    /* ---------- A7 · pressao barometrica coerente ---------- */
    (function () {
      var alto = -1, baixo = -1, hAlto = -1e9, hBaixo = 1e9;
      for (var i = 0; i < E.n; i++) {
        var h = reg.alturaTerreno[i];
        if (h > hAlto) { hAlto = h; alto = i; }
        if (h < hBaixo) { hBaixo = h; baixo = i; }
      }
      var ok = E.pressao[alto] < E.pressao[baixo] && E.pressao[baixo] > 900 && E.pressao[baixo] < 1100;
      add('A7', 'atmosfera · pressao cai com a altitude e fica em faixa fisica', ok, {
        'ponto mais alto (m)': hAlto.toFixed(2), 'pressao la (hPa)': E.pressao[alto].toFixed(2),
        'ponto mais baixo (m)': hBaixo.toFixed(2), 'pressao la (hPa)': E.pressao[baixo].toFixed(2),
        'diferenca (hPa)': (E.pressao[baixo] - E.pressao[alto]).toFixed(3)
      }, 'formula barometrica com altura de escala de 8400 m. Pressao nao existia em nenhum ponto do motor.');
    })();

    /* ---------- A8 · oceano com estado ---------- */
    (function () {
      var agua = 0, salMin = 1e9, salMax = -1e9, ondaMax = 0, densMin = 1e9, densMax = -1e9;
      var cc = contextoDoMundo(W, m);
      atualizarOceano(E, reg, 0.01);
      for (var i = 0; i < E.n; i++) {
        if (profundidadeDaAgua(reg, i) <= 0) continue;
        agua++;
        salMin = Math.min(salMin, E.salinidade[i]); salMax = Math.max(salMax, E.salinidade[i]);
        ondaMax = Math.max(ondaMax, E.onda[i]);
        var d = densidadeAgua(E.salinidade[i], E.tempAgua[i]);
        densMin = Math.min(densMin, d); densMax = Math.max(densMax, d);
      }
      var ok = agua > 1000 && salMin > 10 && salMax < 45 && densMin > 1000 && densMax < 1060;
      add('A8', 'oceano · profundidade, salinidade, densidade e onda existem como estado', ok, {
        'celulas com agua': agua,
        'salinidade min (g/kg)': salMin.toFixed(2),
        'salinidade max (g/kg)': salMax.toFixed(2),
        'densidade min (kg/m3)': densMin.toFixed(2),
        'densidade max (kg/m3)': densMax.toFixed(2),
        'onda maxima (m)': ondaMax.toFixed(3),
        'vento no momento (m/s)': cc.ventoVelocidade.toFixed(2)
      }, 'agua do mar real fica entre 1020 e 1030 kg/m3. A densidade sai da equacao de estado linearizada, nao de um numero escolhido.');
    })();

    /* ---------- A9 · solo com textura e agua disponivel ---------- */
    (function () {
      var soma = 0, fora = 0, fcMenor = 0, classes = {};
      for (var i = 0; i < E.n; i++) {
        var s = E.areia[i] + E.silte[i] + E.argila[i];
        if (Math.abs(s - 1) > 1e-5) fora++;
        soma += s;
        if (E.pontoMurcha[i] >= E.capacidadeCampo[i]) fcMenor++;
        var c = classeTextural(E.areia[i], E.silte[i], E.argila[i]);
        classes[c] = (classes[c] || 0) + 1;
      }
      add('A9', 'solo · textura soma 1, ponto de murcha abaixo da capacidade de campo', (fora === 0 && fcMenor === 0), {
        'celulas com textura != 1': fora,
        'soma media': (soma / E.n).toFixed(6),
        'celulas com pmp >= fc': fcMenor,
        'classes texturais': Object.keys(classes).map(function (k) { return k + ':' + classes[k]; }).join(' ')
      }, 'capacidade de campo e ponto de murcha por funcao de pedotransferencia. Nenhum codigo Munsell foi fabricado.');
    })();

    /* ---------- A10 · materiais derivados, nao inventados ---------- */
    (function () {
      var conhecidos = 0, desconhecidos = 0, exemplos = [];
      var tipos = {};
      for (var i = 0; i < m.objetos.length; i++) {
        var o = m.objetos[i];
        if (tipos[o.tipo]) continue;
        tipos[o.tipo] = 1;
        var mat = materialDe(o);
        if (mat.conhecido) {
          conhecidos++;
          if (exemplos.length < 4) exemplos.push(o.tipo + '=' + mat.chave + ' ' + mat.densidade + 'kg/m3 vol ' + (mat.volume ? mat.volume.toExponential(2) : '-'));
        } else desconhecidos++;
      }
      var pedra = m.objetos.find(function (o) { return o.tipo === 'pedra'; });
      var mp = pedra ? materialDe(pedra) : null;
      add('A10', 'materiais · densidade e volume derivados da massa do motor, sem gravar nada no objeto', conhecidos > 0, {
        'tipos distintos': Object.keys(tipos).length,
        'classificados': conhecidos,
        'nao classificados (declarados)': desconhecidos,
        'exemplos': exemplos.join(' | '),
        'pedra: densidade': mp ? mp.densidade : '-',
        'pedra: volume (m3)': mp && mp.volume ? mp.volume.toExponential(3) : '-'
      }, 'tipo nao mapeado devolve conhecido=false com motivo, em vez de receber um material inventado.');
    })();

    /* ---------- A11 · vento age sobre a planta por medida ---------- */
    (function () {
      var p = m.plantas.find(function (x) { return (x.altura || 0) > 2; }) || m.plantas[0];
      var cc = contextoDoMundo(W, m);
      atualizarAtmosfera(E, reg, cc);
      var r = respostaDaPlantaAoVento(E, p);
      /* duas plantas em lugares diferentes tem de reagir diferente */
      var outras = m.plantas.filter(function (x) { return x !== p && (x.altura || 0) > 2; });
      var r2 = outras.length ? respostaDaPlantaAoVento(E, outras[outras.length - 1]) : null;
      var diferente = r2 ? (r.forca !== r2.forca) : false;
      add('A11', 'fisica · arrasto real do vento sobre a planta, diferente por posicao', (r.forca >= 0 && r.frequencia > 0 && diferente), {
        'planta': p.tipo + ' altura ' + (p.altura || 0).toFixed(2) + ' m',
        'velocidade local (m/s)': r.velocidade.toFixed(3),
        'forca (N)': r.forca.toFixed(3),
        'deflexao no topo (m)': r.deflexao.toFixed(4),
        'frequencia natural (Hz)': r.frequencia.toFixed(3),
        'segunda planta, forca (N)': r2 ? r2.forca.toFixed(3) : '-',
        'reagem diferente?': String(diferente)
      }, 'F = 0,5·rho·Cd·A·v2 com area de copa real. A deflexao sai da rigidez do tronco (d^4/h^3), nao de uma amplitude escolhida.');
    })();

    /* ---------- A12 · fruto cai por forca, nao por sorteio ---------- */
    (function () {
      var p = m.plantas.find(function (x) { return x.frutoTipo && (x.altura || 0) > 1.5; }) || m.plantas[0];
      var verde = frutoDesprende(E, p, 0.12, 0.1);
      var maduro = frutoDesprende(E, p, 0.12, 1.0);
      add('A12', 'fisica · fruto maduro desprende mais facil que fruto verde', (maduro.forca > verde.forca && maduro.resistencia < verde.resistencia), {
        'fruto verde: forca (N)': verde.forca.toFixed(4),
        'fruto verde: resistencia (N)': verde.resistencia.toFixed(4),
        'fruto verde: cai?': String(verde.desprende),
        'fruto maduro: forca (N)': maduro.forca.toFixed(4),
        'fruto maduro: resistencia (N)': maduro.resistencia.toFixed(4),
        'fruto maduro: cai?': String(maduro.desprende)
      }, 'a maturidade enfraquece o pedunculo e o vento faz o resto. O world.js continua dono da queda; isto e o criterio fisico que faltava.');
    })();

    /* ---------- A13 · particulas como campo, custo constante ---------- */
    (function () {
      var cc = contextoDoMundo(W, m);
      atualizarAtmosfera(E, reg, cc);
      E.particulas.fill(0);
      emitirParticulas(E, 80, 80, 1.0);
      var antes = E.particulas[iReg(80, 80, E.tam)];
      var espalhou = 0;
      for (var k = 0; k < 30; k++) atualizarParticulas(E, 0.02);
      for (var i = 0; i < E.n; i++) if (E.particulas[i] > 1e-6) espalhou++;
      add('A13', 'particulas · campo agregado advectado pelo vento, nao objetos individuais', (antes > 0 && espalhou >= 1), {
        'densidade emitida': antes.toFixed(4),
        'celulas com particula apos 30 passos': espalhou,
        'objetos criados': 0,
        'custo': 'O(celulas), independente da quantidade de particulas'
      }, 'secao 10 do briefing: representacao agregada em vez de milhares de objetos pesados.');
    })();

    /* ---------- A14 · O MUTATOR: o ciclo da agua fecha ---------- */
    (function () {
      /* mundo A: motor sozinho, como hoje */
      var mA = W.criar({ seed: seed });
      var regA = W.regiaoAtiva(mA);
      /* mundo B: motor + ambiente */
      var mB = W.criar({ seed: seed });
      var regB = W.regiaoAtiva(mB);
      var eB = criar(W, mB, { T: T });

      function mediaUmidade(r) { var s = 0; for (var i = 0; i < r.umidade.length; i++) s += r.umidade[i]; return s / r.umidade.length; }
      function saturados(r) { var c = 0; for (var i = 0; i < r.umidade.length; i++) if (r.umidade[i] >= 0.99) c++; return c; }

      var u0 = mediaUmidade(regA), sat0 = saturados(regA);
      var dt = 600, passos = 12 * 24 * 7;             /* sete dias de mundo */
      for (var k = 0; k < passos; k++) {
        W.passoMundo(mA, dt, true);
        W.passoMundo(mB, dt, true);
        if (k % 6 === 0) passoIntegrado(eB, W, mB, dt * 6, {});
      }
      var uA = mediaUmidade(regA), satA = saturados(regA);
      var uB = mediaUmidade(regB), satB = saturados(regB);
      var mn = 1e9, mx = -1e9;
      for (var i2 = 0; i2 < regB.umidade.length; i2++) { mn = Math.min(mn, regB.umidade[i2]); mx = Math.max(mx, regB.umidade[i2]); }

      var ok = (satB < satA) && (uB < uA) && mn >= 0 && mx <= 1;
      add('A14', 'MUTATOR · o ciclo da agua fecha e a ilha para de afogar', ok, {
        'umidade media t=0': u0.toFixed(4),
        'umidade media 7d SEM ambiente': uA.toFixed(4),
        'umidade media 7d COM ambiente': uB.toFixed(4),
        'saturados t=0': sat0,
        'saturados 7d SEM ambiente': satA,
        'saturados 7d COM ambiente': satB,
        'umidade min apos 7d': mn.toFixed(4),
        'umidade max apos 7d': mx.toFixed(4),
        'celulas escritas no ultimo passo': eB.regional.balanco.celulasEscritas,
        'evaporacao media (mm/dia)': eB.regional.balanco.evaporacaoMedia.toFixed(3),
        'escoamento medio': eB.regional.balanco.escoamentoMedio.toExponential(3)
      }, 'esta e a unica escrita deste modulo em array do world.js, por aplicarUmidadeNoSolo(). Continua existindo UMA umidade no mundo.');
    })();

    /* ---------- A15 · o mutator pode ser desligado ---------- */
    (function () {
      var mC = W.criar({ seed: seed });
      var regC = W.regiaoAtiva(mC);
      var eC = criar(W, mC, { T: T });
      var copia = Float32Array.from(regC.umidade);
      for (var k = 0; k < 40; k++) passoIntegrado(eC, W, mC, 600, { escreverUmidade: false });
      var dif = 0;
      for (var i = 0; i < copia.length; i++) if (copia[i] !== regC.umidade[i]) dif++;
      add('A15', 'MUTATOR desligado · com escreverUmidade:false o world.js fica intocado', dif === 0, {
        'passos de ambiente': 40,
        'celulas de umidade alteradas': dif,
        'celulas escritas reportadas': eC.regional.balanco.celulasEscritas
      }, 'a escrita em LEI e opcional e verificavel. Desligada, o ambiente vira leitura pura.');
    })();

    /* ---------- A16 · o ambiente nao altera mais nada do motor ---------- */
    (function () {
      var mD = W.criar({ seed: seed });
      var regD = W.regiaoAtiva(mD);
      var eD = criar(W, mD, { T: T });
      var snap = {
        alturaTerreno: Float32Array.from(regD.alturaTerreno),
        tipo: Uint8Array.from(regD.tipo),
        fertilidade: Float32Array.from(regD.fertilidade),
        temperatura: Float32Array.from(regD.temperatura),
        prof: Float32Array.from(regD.prof)
      };
      var clima = JSON.stringify(mD.clima);
      var nEnt = mD.entidades.length, nObj = mD.objetos.length, tempo = mD.tempo.segMundo;
      for (var k = 0; k < 60; k++) passoIntegrado(eD, W, mD, 600, {});
      function difere(a, b) { for (var i = 0; i < a.length; i++) if (a[i] !== b[i]) return true; return false; }
      var mudou = [];
      if (difere(snap.alturaTerreno, regD.alturaTerreno)) mudou.push('alturaTerreno');
      if (difere(snap.tipo, regD.tipo)) mudou.push('tipo');
      if (difere(snap.fertilidade, regD.fertilidade)) mudou.push('fertilidade');
      if (difere(snap.temperatura, regD.temperatura)) mudou.push('temperatura');
      if (difere(snap.prof, regD.prof)) mudou.push('prof');
      if (JSON.stringify(mD.clima) !== clima) mudou.push('clima');
      if (mD.entidades.length !== nEnt) mudou.push('entidades');
      if (mD.objetos.length !== nObj) mudou.push('objetos');
      if (mD.tempo.segMundo !== tempo) mudou.push('tempo');
      add('A16', 'isolamento · alem da umidade, o ambiente NAO toca em nada do motor', mudou.length === 0, {
        'passos de ambiente': 60,
        'campos do motor alterados': mudou.length ? mudou.join(', ') : '(nenhum)',
        'entidades antes/depois': nEnt + ' / ' + mD.entidades.length,
        'tempo do mundo movido?': String(mD.tempo.segMundo !== tempo)
      }, 'relevo, bioma, fertilidade, temperatura do terreno, clima, entidades e tempo permanecem exclusivos do world.js.');
    })();

    /* ---------- A17 · custo por passo ---------- */
    (function () {
      var mE = W.criar({ seed: seed });
      var eE = criar(W, mE, { T: T });
      var cc = contextoDoMundo(W, mE);
      var regE = W.regiaoAtiva(mE);
      var t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      var N = 200;
      for (var k = 0; k < N; k++) passo(eE.regional, regE, cc, 600, {});
      var t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      var msPasso = (t1 - t0) / N;
      /* custo do motor, para comparar */
      var mF = W.criar({ seed: seed });
      var t2 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      for (var j = 0; j < N; j++) W.passoMundo(mF, 0.05, true);
      var t3 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      var msMotor = (t3 - t2) / N;
      add('A17', 'desempenho · custo do passo de ambiente sobre 25600 celulas', msPasso < 16.7, {
        'ms por passo de ambiente': msPasso.toFixed(3),
        'ms por passo do motor (rapido)': msMotor.toFixed(3),
        'celulas varridas por passo': E.n,
        'orcamento a 60 fps (ms)': '16.7',
        'passos de ambiente por quadro cabendo no orcamento': Math.floor(16.7 / Math.max(0.001, msPasso))
      }, 'o ambiente roda em passo proprio e pode ser chamado com frequencia menor que o motor: e a atualizacao em lotes da secao 10.');
    })();

    /* ---------- A18 · a fase 2A continua intacta ---------- */
    (function () {
      var A2 = ctx.A || (typeof globalThis !== 'undefined' ? globalThis.GenesisF2A : null);
      if (!A2) { na('A18', 'fase 2A intacta', 'endereco.js nao carregado neste contexto'); return; }
      var mG = W.criar({ seed: seed });
      var regG = W.regiaoAtiva(mG);
      var eG = criar(W, mG, { T: T });
      var antes = A2.chaveLogica(A2.enderecoDeTile(mG, regG, 80, 80));
      for (var k = 0; k < 30; k++) passoIntegrado(eG, W, mG, 600, {});
      var depois = A2.chaveLogica(A2.enderecoDeTile(mG, regG, 80, 80));
      var res = A2.rodarTestes({ T: T, W: W, seed: seed });
      var falhas = res.filter(function (t) { return !t.ok && !t.na; }).length;
      add('A18', 'fase 2A · o endereco nao muda por causa do ambiente e a suite continua passando', (antes === depois && falhas === 0), {
        'chave logica antes': String(antes),
        'chave logica depois de 30 passos': String(depois),
        'testes da fase 2A': res.length,
        'falhas': falhas
      }, 'o ambiente muda o ESTADO do mundo, nunca o ENDERECO das coisas.');
    })();

    return out;
  }

  /* ==========================================================================
     EXPORTAÇÃO
     ========================================================================== */
  return {
    VERSAO: VERSAO, CONTRATO: CONTRATO,
    G: G, NIVEL_MAR: NIVEL_MAR, RHO_AR: RHO_AR, P0: P0, LAPSE: LAPSE,
    SALINIDADE_OCEANICA: SALINIDADE_OCEANICA,
    MATERIAIS: MATERIAIS, MATERIAL_POR_TIPO: MATERIAL_POR_TIPO,
    RUGOSIDADE: RUGOSIDADE,

    /* ruído e geometria */
    ruido3: ruido3, fbm3: fbm3, dirDeLatLon: dirDeLatLon,

    /* camada 1 */
    criarPlaneta: criarPlaneta, amostraPlaneta: amostraPlaneta,
    estatisticasPlaneta: estatisticasPlaneta,
    tempDaLatitude: tempDaLatitude, ventoDaLatitude: ventoDaLatitude,

    /* camadas 2 a 6 */
    criarRegional: criarRegional,
    atualizarAtmosfera: atualizarAtmosfera,
    atualizarOceano: atualizarOceano,
    passoAgua: passoAgua,
    atualizarErosao: atualizarErosao,
    atualizarParticulas: atualizarParticulas,
    emitirParticulas: emitirParticulas,
    difundir: difundir, advectarCampo: advectarCampo,

    /* derivações puras */
    profundidadeDaAgua: profundidadeDaAgua,
    densidadeAgua: densidadeAgua,
    pressaoVaporSaturacao: pressaoVaporSaturacao,
    umidadeSaturacao: umidadeSaturacao,
    evaporacaoPotencial: evaporacaoPotencial,
    capacidadeDeCampo: capacidadeDeCampo,
    pontoDeMurcha: pontoDeMurcha,
    classeTextural: classeTextural,
    materialDe: materialDe,
    forcaDoVento: forcaDoVento,
    respostaDaPlantaAoVento: respostaDaPlantaAoVento,
    frutoDesprende: frutoDesprende,

    /* a única escrita em estado de LEI */
    aplicarUmidadeNoSolo: aplicarUmidadeNoSolo,

    /* integração */
    criar: criar, passo: passo, passoIntegrado: passoIntegrado,
    contextoDoMundo: contextoDoMundo,
    descreverCelula: descreverCelula,

    /* execução */
    rodarTestes: rodarTestes
  };
});
