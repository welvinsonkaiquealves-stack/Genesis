/* ============================================================================
   GÊNESIS v2 — ACEITE E1 + E2
   Prova numérica do contrato genesis.endereco/2a.3 (Rota A: âncora derivada).

   Executa:
     A) 100.000 amostras  endereço → globo → endereço   (erro em metros)
     B) 100.000 amostras  globo → endereço → globo      (erro em metros)
     C) idempotência       e(g(e)) === e                 (100% ou falha)
     D) estabilidade de regionIndex em 100.000 repetições
     E) 0 colisões em 100.000 chaves canônicas distintas (fixture N regiões)
     F) ortonormalidade do frame e coerência da orientação declarada

   Roda em Node puro. Sem DOM, sem THREE, sem rede.
   ========================================================================== */
'use strict';

var path = require('path');
var raiz = path.join(__dirname, '..');
var T = require(path.join(raiz, 'fase1/terra.js'));
var W = require(path.join(raiz, 'v2/core/world.js'));
var E = require(path.join(raiz, 'fase2a/endereco.js'));

var SEED = 20260101;
var N = 100000;

/* RNG determinístico do teste (não é do mundo; só sorteia pontos de prova) */
function rng(s) {
  var a = s >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    var t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

var falhas = [];
function ok(nome, cond, dados) {
  var s = cond ? 'PASSA' : 'FALHA';
  if (!cond) falhas.push(nome);
  console.log('[' + s + '] ' + nome);
  if (dados) {
    Object.keys(dados).forEach(function (k) {
      console.log('          ' + k + ': ' + dados[k]);
    });
  }
}

console.log('================================================================');
console.log('ACEITE E1 + E2 — contrato ' + E.CONTRATO + ' (era ' + E.CONTRATO_ANTERIOR + ')');
console.log('================================================================\n');

var m = W.criar({ seed: SEED });
var reg = W.regiaoAtiva(m);
var tam = reg.largura;
var Rm = E.raioMetros(m);

console.log('mundo      seed=' + SEED + '  regioes=' + m.planeta.regioes.length +
            '  raio=' + (Rm / 1000) + ' km');
console.log('regiao     "' + reg.nome + '"  ' + reg.largura + 'x' + reg.altura +
            '  lat=' + reg.lat + ' lon=' + reg.lon + ' (tipo ' + typeof reg.lat + ')');
console.log('ancora     ' + E.CONVENCAO_ANCORA +
            '   orientacao +x=' + E.ORIENTACAO_DA_GRADE.eixoX +
            ' +y=' + E.ORIENTACAO_DA_GRADE.eixoY + '\n');

/* -------- F. frame ortonormal e orientação ------------------------------- */
(function () {
  var f = E.frameDaRegiao(T, reg);
  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function comp(a) { return Math.sqrt(dot(a, a)); }
  var erros = [
    Math.abs(comp(f.centro) - 1), Math.abs(comp(f.leste) - 1), Math.abs(comp(f.norte) - 1),
    Math.abs(dot(f.centro, f.leste)), Math.abs(dot(f.centro, f.norte)), Math.abs(dot(f.leste, f.norte))
  ];
  var pior = Math.max.apply(null, erros);

  /* leste deve apontar para longitude crescente; norte para latitude crescente */
  var passo = 1e-4;
  var pL = { x: f.centro.x + f.leste.x * passo, y: f.centro.y + f.leste.y * passo, z: f.centro.z + f.leste.z * passo };
  var pN = { x: f.centro.x + f.norte.x * passo, y: f.centro.y + f.norte.y * passo, z: f.centro.z + f.norte.z * passo };
  var llL = T.latLonDeDir(pL.x, pL.y, pL.z);
  var llN = T.latLonDeDir(pN.x, pN.y, pN.z);
  var lat0 = Number(reg.lat), lon0 = Number(reg.lon);

  ok('F1 · frame ortonormal (|v|=1, produtos escalares nulos)', pior < 1e-12,
     { 'pior desvio': pior.toExponential(3) });
  ok('F2 · leste aumenta longitude', llL.lon > lon0,
     { 'lon centro': lon0, 'lon + leste': llL.lon.toFixed(6) });
  ok('F3 · norte aumenta latitude', llN.lat > lat0,
     { 'lat centro': lat0, 'lat + norte': llN.lat.toFixed(6) });

  /* +y local aponta para o sul: tile (80,81) deve ter latitude MENOR que (80,80) */
  var g0 = E.globoDoEndereco(T, m, E.enderecoDeTile(m, reg, 80, 80));
  var gy = E.globoDoEndereco(T, m, E.enderecoDeTile(m, reg, 80, 81));
  var gx = E.globoDoEndereco(T, m, E.enderecoDeTile(m, reg, 81, 80));
  ok('F4 · +y local aponta para o SUL (latitude diminui)', gy.lat < g0.lat,
     { 'lat em y=80': g0.lat.toFixed(8), 'lat em y=81': gy.lat.toFixed(8) });
  ok('F5 · +x local aponta para o LESTE (longitude aumenta)', gx.lon > g0.lon,
     { 'lon em x=80': g0.lon.toFixed(8), 'lon em x=81': gx.lon.toFixed(8) });
})();

/* -------- A. endereço → globo → endereço --------------------------------- */
var piorA = 0, piorAonde = null, trocouRegiao = 0;
(function () {
  var r = rng(11);
  for (var i = 0; i < N; i++) {
    var x = r() * tam, y = r() * tam;
    var a = E.enderecoDeTile(m, reg, x, y);
    var g = E.globoDoEndereco(T, m, a);
    var b = E.enderecoDeGlobo(T, m, { x: g.dir[0], y: g.dir[1], z: g.dir[2] });
    var dx = (b.local.x - x), dy = (b.local.y - y);
    var e = Math.sqrt(dx * dx + dy * dy) * E.TILE_METROS;
    if (e > piorA) { piorA = e; piorAonde = { x: x, y: y }; }
    if (b.regiao.regionIndex !== a.regiao.regionIndex) trocouRegiao++;
  }
  ok('A · ' + N + ' amostras  endereco -> globo -> endereco  (erro < 1 m)', piorA < 1,
     { 'erro maximo': piorA.toExponential(4) + ' m',
       'onde': 'x=' + piorAonde.x.toFixed(4) + ' y=' + piorAonde.y.toFixed(4),
       'trocas de regiao': trocouRegiao,
       'alvo do plano': '< 1 m   (meta ambiciosa: < 1e-6 m)',
       'meta ambiciosa atingida': (piorA < 1e-6) ? 'SIM' : 'NAO' });
})();

/* -------- B. globo → endereço → globo ------------------------------------ */
var piorB = 0;
(function () {
  var r = rng(22);
  var f = E.frameDaRegiao(T, reg);
  /* pontos sorteados dentro da pegada da região (o domínio que interessa) */
  for (var i = 0; i < N; i++) {
    var dl = (r() - 0.5) * tam * E.TILE_METROS;
    var dn = (r() - 0.5) * tam * E.TILE_METROS;
    var rr = Math.sqrt(dl * dl + dn * dn);
    var p;
    if (rr < 1e-12) { p = f.centro; }
    else {
      var th = rr / Rm, c = Math.cos(th), s = Math.sin(th);
      var ux = (f.leste.x * dl + f.norte.x * dn) / rr;
      var uy = (f.leste.y * dl + f.norte.y * dn) / rr;
      var uz = (f.leste.z * dl + f.norte.z * dn) / rr;
      p = { x: f.centro.x * c + ux * s, y: f.centro.y * c + uy * s, z: f.centro.z * c + uz * s };
    }
    var a = E.enderecoDeGlobo(T, m, p);
    var g = E.globoDoEndereco(T, m, a);
    /* erro angular entre p e g, convertido para metros de superfície */
    var d = Math.max(-1, Math.min(1, p.x * g.dir[0] + p.y * g.dir[1] + p.z * g.dir[2]));
    var cx = p.y * g.dir[2] - p.z * g.dir[1];
    var cy = p.z * g.dir[0] - p.x * g.dir[2];
    var cz = p.x * g.dir[1] - p.y * g.dir[0];
    var e = Math.atan2(Math.sqrt(cx * cx + cy * cy + cz * cz), d) * Rm;
    if (e > piorB) piorB = e;
  }
  ok('B · ' + N + ' amostras  globo -> endereco -> globo  (erro < 1 m)', piorB < 1,
     { 'erro maximo': piorB.toExponential(4) + ' m',
       'meta ambiciosa atingida': (piorB < 1e-6) ? 'SIM' : 'NAO' });
})();

/* -------- C. idempotência ------------------------------------------------
   O endereço tem uma parte DISCRETA (região + tile) e uma parte CONTÍNUA
   (local.x, local.y em ponto flutuante). São coisas diferentes e por isso o
   aceite é diferente para cada uma:

     discreta   → tem de ser bit a bit idêntica. 100% ou falha.
     contínua   → é um real. Exigir igualdade de float seria exigir que
                  cos/atan2 fossem exatos. O aceite é: a deriva não acumula.

   O teste roda o ciclo DEZ vezes e prova que a deriva do passo 10 é da mesma
   ordem da do passo 1. Se houvesse acúmulo, ela cresceria.
   ------------------------------------------------------------------------ */
(function () {
  var r = rng(33);
  var iguaisDiscreto = 0, total = N;
  var piorDelta1 = 0, piorDelta10 = 0, naFronteira = 0;

  for (var i = 0; i < total; i++) {
    var x = r() * tam, y = r() * tam;
    var a1 = E.enderecoDeGlobo(T, m, dirDe(x, y));
    var cur = a1, d1 = 0;
    for (var k = 0; k < 10; k++) {
      var g = E.globoDoEndereco(T, m, cur);
      var prox = E.enderecoDeGlobo(T, m, { x: g.dir[0], y: g.dir[1], z: g.dir[2] });
      var d = Math.max(Math.abs(prox.local.x - cur.local.x), Math.abs(prox.local.y - cur.local.y));
      if (k === 0) d1 = d;
      cur = prox;
    }
    var dTot = Math.max(Math.abs(cur.local.x - a1.local.x), Math.abs(cur.local.y - a1.local.y));
    if (d1 > piorDelta1) piorDelta1 = d1;
    if (dTot > piorDelta10) piorDelta10 = dTot;

    var mesmoDiscreto = (cur.regiao.regionIndex === a1.regiao.regionIndex) &&
                        (!!cur.tile === !!a1.tile) &&
                        (!cur.tile || cur.tile.indexLinear === a1.tile.indexLinear);
    if (mesmoDiscreto) iguaisDiscreto++;
    else naFronteira++;
  }

  ok('C1 · idempotencia da parte DISCRETA (regiao + tile) apos 10 ciclos',
     iguaisDiscreto === total,
     { 'identicos': iguaisDiscreto + ' / ' + total,
       'divergencias': naFronteira });

  ok('C2 · a deriva da parte CONTINUA nao acumula (10 ciclos ~ 1 ciclo)',
     piorDelta10 <= Math.max(piorDelta1 * 20, E.RESOLUCAO_LOCAL_METROS) &&
     piorDelta10 * E.TILE_METROS < 1e-6,
     { 'deriva em 1 ciclo ': (piorDelta1 * E.TILE_METROS).toExponential(4) + ' m',
       'deriva em 10 ciclos': (piorDelta10 * E.TILE_METROS).toExponential(4) + ' m',
       'razao': (piorDelta1 > 0 ? (piorDelta10 / piorDelta1).toFixed(2) : 'n/a') + 'x' });

  /* Caso de fronteira, declarado em vez de escondido: exatamente sobre a
     borda de um tile, uma deriva de 1e-9 m pode cair de qualquer lado. */
  var fronteiras = 0;
  for (var j = 0; j < 1000; j++) {
    var tx = j % tam, ty = (j / tam) | 0;
    var a = E.enderecoDeGlobo(T, m, dirDe(tx, ty));   /* exatamente no canto */
    if (!a.tile || a.tile.x !== tx || a.tile.y !== ty) fronteiras++;
  }
  console.log('          nota: em 1000 cantos exatos de tile, ' + fronteiras +
              ' cairam no tile vizinho (deriva sub-nanometrica na borda).');

  function dirDe(x, y) {
    var g = E.globoDoEndereco(T, m, E.enderecoDeTile(m, reg, x, y));
    return { x: g.dir[0], y: g.dir[1], z: g.dir[2] };
  }
})();

/* -------- D. estabilidade de regionIndex --------------------------------- */
(function () {
  var r = rng(44);
  var estaveis = 0, total = N;
  for (var i = 0; i < total; i++) {
    /* ponto qualquer da esfera inteira, não só da região */
    var u = r() * 2 - 1, ph = r() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    var p = { x: s * Math.cos(ph), y: u, z: s * Math.sin(ph) };
    var i1 = E.regiaoMaisProxima(T, m, p).regionIndex;
    var i2 = E.regiaoMaisProxima(T, m, p).regionIndex;
    var i3 = E.enderecoDeGlobo(T, m, p).regiao.regionIndex;
    if (i1 === i2 && i2 === i3 && i1 >= 0) estaveis++;
  }
  ok('D · regionIndex estavel em ' + total + ' amostras (esfera inteira)', estaveis === total,
     { 'estaveis': estaveis + ' / ' + total });
})();

/* -------- E. 0 colisões em 100.000 chaves -------------------------------- */
(function () {
  /* Fixture de N regiões: testa o FORMATO do endereço, não o motor
     (o motor materializa uma região por vez — limitação já declarada em 2a.2). */
  var nReg = 25;
  var fx = { seed: SEED, planeta: { nome: 'Gênesis', raioKm: 6371, regiaoAtiva: 0, regioes: [] } };
  var rr = rng(55);
  for (var k = 0; k < nReg; k++) {
    fx.planeta.regioes.push({
      id: 0, nome: 'R' + k, idx: 0,
      lat: (rr() * 80 - 40).toFixed(2),
      lon: (rr() * 340 - 170).toFixed(2),
      largura: tam, altura: tam,
      alturaTerreno: new Float32Array(tam * tam)
    });
  }
  var vistos = Object.create(null);
  var colisoes = 0, distintos = 0;
  var porRegiao = Math.ceil(N / nReg);
  for (var ri = 0; ri < nReg; ri++) {
    var rg = fx.planeta.regioes[ri];
    for (var j = 0; j < porRegiao && distintos < N; j++) {
      var x = j % tam, y = (j / tam) | 0;
      var a = E.enderecoDeTile(fx, rg, x, y);
      a.regiao.regionIndex = ri;
      var ch = E.formatarEndereco(a);
      if (vistos[ch]) colisoes++; else vistos[ch] = 1;
      distintos++;
    }
  }
  ok('E · 0 colisoes em ' + distintos + ' chaves canonicas (' + nReg + ' regioes)',
     colisoes === 0, { 'colisoes': colisoes, 'chaves unicas': Object.keys(vistos).length });

  /* e a ancoragem por tile também não pode colidir entre regiões distintas */
  var d0 = E.globoDoEndereco(T, fx, (function () {
    var a = E.enderecoDeTile(fx, fx.planeta.regioes[0], 80, 80); a.regiao.regionIndex = 0; return a;
  })());
  var d1 = E.globoDoEndereco(T, fx, (function () {
    var a = E.enderecoDeTile(fx, fx.planeta.regioes[1], 80, 80); a.regiao.regionIndex = 1; return a;
  })());
  var sep = Math.acos(Math.max(-1, Math.min(1,
    d0.dir[0] * d1.dir[0] + d0.dir[1] * d1.dir[1] + d0.dir[2] * d1.dir[2]))) * Rm;
  ok('E2 · tile (80,80) de regioes distintas cai em pontos distintos', sep > 1,
     { 'separacao': (sep / 1000).toFixed(1) + ' km' });
})();

/* -------- G. a granularidade declarada, medida ---------------------------- */
(function () {
  var pr = E.precisaoDeAncoragem(reg, m.planeta.raioKm);
  console.log('\n--- granularidade de POSICIONAMENTO da regiao (nao e erro do endereco) ---');
  console.log('  passo de 0,01 grau      : ' + pr.passoMetros.toFixed(2) + ' m');
  console.log('  largura da regiao       : ' + pr.larguraRegiaoMetros.toFixed(2) + ' m');
  console.log('  passos por regiao       : ' + pr.razaoPassoPorRegiao.toFixed(2));
  console.log('  leitura 2a.2 (obsoleta) : erro de +-' + pr.erroMaxMetros.toFixed(2) + ' m');
  console.log('  leitura 2a.3 (vigente)  : a regiao so pode nascer em multiplos de 0,01 grau.');
  console.log('                            O endereco dentro dela fecha com erro de ' +
              piorA.toExponential(2) + ' m.');
})();

console.log('\n================================================================');
if (falhas.length === 0) {
  console.log('ACEITE E1 + E2: TODOS OS CRITERIOS CUMPRIDOS');
} else {
  console.log('FALHAS: ' + falhas.join(', '));
}
console.log('================================================================');
process.exit(falhas.length === 0 ? 0 : 1);
