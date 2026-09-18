/* ============================================================================
   GÊNESIS v2 — FASE 1 · FUNDAÇÃO PLANETÁRIA
   genesis/fase1/terra.js

   PAPEL DESTE ARQUIVO
   -------------------
   Representação visual do MESMO mundo da simulação. Nada mais.

       SIMULAÇÃO  → região canônica → lat/lon → posição 3D → geometria
                  → WebGL → câmera

   AUTORIDADE DA REALIDADE: genesis/v2/core/world.js
   A região canônica é lida de W.regiaoAtiva(W.criar({seed})) — o MESMO caminho
   que genesis/v2/render/app.js:134 usa. Este arquivo NUNCA escreve na simulação
   e NUNCA cria uma segunda fonte de verdade para a posição da ilha.

   O QUE ESTE ARQUIVO NÃO FAZ (Fase 1 é deliberadamente mínima)
   -----------------------------------------------------------
   Sem chunks. Sem streaming. Sem LOD. Sem terreno. Sem relevo. Sem FBM.
   Sem Morphic Terrain. Sem materiais avançados. Sem vegetação. Sem animais.
   Sem biologia. Sem física. Sem NPCs. Sem cérebro. Sem cultura. Sem linguagem.
   Sem sociedade. Sem atmosfera. Sem árvores. Sem humanos.
   Sem OrbitControls. Sem sprite. Sem overlay. Sem textura 2D de mapa.
   Sem lógica especial de ocultação.

   DUAS CAMADAS
   ------------
   Camada 1 (pura)  — matemática esférica, quaternion, câmera, testes.
                      Roda em Node sem DOM. É o que permite medir de verdade.
   Camada 2 (visual) — THREE. Só existe quando window.THREE existe.

   INTEGRAÇÃO FUTURA (por que isto não é um terceiro projeto paralelo)
   -------------------------------------------------------------------
   A camada pura é o núcleo de coordenadas do Gênesis. Na Fase 2 ela migra para
   genesis/v2/core/geo.js (UMD, mesma assinatura de fábrica dos outros módulos
   de core) e passa a ser consumida por:
     · v2/render/app.js      — troca a projeção 2D por projeção na esfera
     · genesis/fase1/*       — vira só um harness de teste
   A hierarquia planeta → região → origem local (precisão float32) é o contrato
   que esta camada deixa pronto: `dirDeLatLon` devolve direção unitária e
   `latLonDeDir` é a inversa exata — nada aqui trava a hierarquia futura.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GenesisF1 = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* Referência ao objeto global.
     NÃO usar o parâmetro `root` do wrapper UMD aqui dentro: a fábrica é
     declarada no escopo externo e NÃO fecha sobre esse parâmetro. Usar `root`
     aqui dentro dá ReferenceError em Node e no browser.                        */
  var GLOBAL = (typeof globalThis !== 'undefined') ? globalThis
    : (typeof window !== 'undefined') ? window
      : (typeof self !== 'undefined') ? self : {};

  /* ==========================================================================
     0. CONSTANTES
     ========================================================================== */

  var R = 1.0;                       // raio canônico da Fase 1 (o planeta É a unidade)
  var RAD = Math.PI / 180;
  var DEG = 180 / Math.PI;
  var RAIO_KM = 6371;                // rótulo humano; NÃO entra em nenhum cálculo
  var DOIS_PI = Math.PI * 2;

  /* Seed canônica da Fase 1.
     POR QUE ISTO EXISTE: world.js gera lat/lon da região a partir do RNG do
     mundo (world.js:85), e a v2 NÃO persiste nenhuma seed canônica — app.js:134
     usa `seed || (Date.now() % 100000)`. Sem uma seed pinada, a ilha nasce em
     um lat/lon diferente a cada sessão e a Fase 1 não é reprodutível.
     Esta constante é PROVISÓRIA e explícita. A decisão definitiva (persistir a
     seed do mundo) pertence à Fase 2 e precisa passar por app.js/world.js.
     Override por query string:  ?seed=12345                                  */
  var SEED_CANONICA = 20260101;

  var SENS_ROTACAO = 0.0045;         // rad por pixel de arrasto
  var LIMITE_PITCH = 89 * RAD;       // ±89° — evita a degenerescência do vetor "cima"

  var CAM_MIN = 1.06;                // zoom máximo (perto da superfície)
  var CAM_MAX = 24.0;                // zoom mínimo (espaço)
  var CAM_INICIAL = 3.1;

  /* Tamanho VISUAL do marcador da região, em graus de raio angular.
     Isto NÃO é escala física — é legibilidade. O ângulo real da região é
     larguraTiles*TILE/(raioKm*1000) rad ≈ 0,00144° para uma região de 160 m
     num planeta de 6371 km: invisível de qualquer órbita. O valor real é
     calculado e exibido no HUD junto do valor visual, para que o exagero
     nunca seja confundido com a geometria.                                */
  var MARCADOR_GRAUS = 2.0;

  function agora() {
    return (typeof performance !== 'undefined' && performance.now)
      ? performance.now() : Date.now();
  }
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

  /* sRGB → linear.
     three.js r128 com outputEncoding = sRGBEncoding trata TODA cor como
     linear e converte na saída. Uma paleta autorada em sRGB (hex "de olho")
     sai estourada para branco se não for convertida aqui.                    */
  function srgbParaLinear(c) {
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  function linearDeHex(hex) {
    return [
      srgbParaLinear(((hex >> 16) & 255) / 255),
      srgbParaLinear(((hex >> 8) & 255) / 255),
      srgbParaLinear((hex & 255) / 255)
    ];
  }

  /* ==========================================================================
     1. ÁLGEBRA VETORIAL MÍNIMA (objetos simples: sem THREE na camada pura)
     ========================================================================== */
  function v3(x, y, z) { return { x: x, y: y, z: z }; }
  function soma(a, b) { return v3(a.x + b.x, a.y + b.y, a.z + b.z); }
  function sub(a, b) { return v3(a.x - b.x, a.y - b.y, a.z - b.z); }
  function esc(a, s) { return v3(a.x * s, a.y * s, a.z * s); }
  function dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
  function cruz(a, b) {
    return v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }
  function comp(a) { return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); }
  function normal(a) { var n = comp(a); return n < 1e-12 ? v3(0, 0, 0) : esc(a, 1 / n); }
  function dist(a, b) { return comp(sub(a, b)); }

  /* ==========================================================================
     2. SISTEMA ESPACIAL — lat/lon ↔ XYZ
     Convenção (idêntica à já validada no projeto, planeta.js:99-105):
       X = latitude 0°,  longitude 0°
       Y = polo norte
       Z = latitude 0°,  longitude 90°
     Mão direita. Latitude −90°..+90°. Longitude −180°..+180°.
     ========================================================================== */
  function dirDeLatLon(lat, lon) {
    var la = lat * RAD, lo = lon * RAD, cl = Math.cos(la);
    return v3(cl * Math.cos(lo), Math.sin(la), cl * Math.sin(lo));
  }

  function latLonDeDir(x, y, z) {
    var n = Math.sqrt(x * x + y * y + z * z);
    if (n < 1e-12) return { lat: 0, lon: 0, n: 0 };
    var yn = clamp(y / n, -1, 1);
    return {
      lat: Math.asin(yn) * DEG,
      lon: Math.atan2(z / n, x / n) * DEG,
      n: n
    };
  }

  function erroLonGraus(a, b) {
    var d = ((a - b + 180) % 360 + 360) % 360 - 180;
    return Math.abs(d);
  }

  /* ==========================================================================
     3. QUATERNION — orientação do planeta (Q_planeta)
     Q = qYaw(yaw) ⊗ qPitch(pitch)
     yaw   → rotação em torno do eixo Y do MUNDO (nunca eixo de tela,
             nunca conversão dupla, nunca invertido)
     pitch → rotação em torno do eixo X do mundo, depois do yaw
     ========================================================================== */
  function qIdent() { return { x: 0, y: 0, z: 0, w: 1 }; }

  function qEixo(ax, ay, az, ang) {
    var n = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
    var s = Math.sin(ang / 2);
    return { x: ax / n * s, y: ay / n * s, z: az / n * s, w: Math.cos(ang / 2) };
  }

  function qMul(a, b) {
    return {
      w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
      x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
      y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
      z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w
    };
  }

  function qNorm(q) {
    var n = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w) || 1;
    return { x: q.x / n, y: q.y / n, z: q.z / n, w: q.w / n };
  }

  function qRotV(q, v) {
    var t = v3(
      2 * (q.y * v.z - q.z * v.y),
      2 * (q.z * v.x - q.x * v.z),
      2 * (q.x * v.y - q.y * v.x)
    );
    return v3(
      v.x + q.w * t.x + (q.y * t.z - q.z * t.y),
      v.y + q.w * t.y + (q.z * t.x - q.x * t.z),
      v.z + q.w * t.z + (q.x * t.y - q.y * t.x)
    );
  }

  function qDeYawPitch(yaw, pitch) {
    return qMul(qEixo(0, 1, 0, yaw), qEixo(1, 0, 0, pitch));
  }

  /* Métrica de erro ENTRE ROTAÇÕES (não entre componentes).
     q e −q são a mesma rotação; comparar componentes crus daria erro 2.0
     num giro de 360° perfeitamente correto. Isto compara o efeito.       */
  function erroRotacional(a, b) {
    var e = 0, vs = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (var i = 0; i < 3; i++) {
      var p = qRotV(a, v3(vs[i][0], vs[i][1], vs[i][2]));
      var q = qRotV(b, v3(vs[i][0], vs[i][1], vs[i][2]));
      e = Math.max(e, Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y), Math.abs(p.z - q.z)));
    }
    return e;
  }
  function erroRotacionalAngular(a, b) {
    var d = Math.abs(a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w);
    return Math.abs(1 - Math.min(1, d));
  }

  /* ==========================================================================
     4. CÂMERA — estado próprio, totalmente separado do planeta
     cam = { alvo:{x,y,z}, dist, yaw, pitch, fov }
     NADA aqui toca Q_planeta. NADA aqui é escrito pelo controlador do planeta.
     ========================================================================== */
  function camPadrao() {
    return { alvo: v3(0, 0, 0), dist: CAM_INICIAL, yaw: 0, pitch: 0.22, fov: 45 * RAD };
  }

  /* Distância mínima para o planeta INTEIRO caber no quadro.
     Numa tela alta e estreita (celular, aspecto ~0,46) o FOV horizontal é
     menos da metade do vertical: um planeta que "cabe" na altura transborda
     na largura. O enquadramento tem de usar o MENOR dos dois semiângulos. */
  function distParaEnquadrar(aspecto, fov, raio, margem) {
    var t = Math.tan(fov / 2);
    var lim = t * Math.min(1, aspecto);
    return (raio / lim) * (margem || 1.0);
  }

  /* vetor unitário que sai do alvo e vai até a câmera */
  function dirAtras(cam) {
    var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    return v3(cp * Math.sin(cam.yaw), sp, cp * Math.cos(cam.yaw));
  }

  function posicaoCamera(cam) {
    return soma(cam.alvo, esc(dirAtras(cam), cam.dist));
  }

  function baseCamera(cam) {
    var d = dirAtras(cam);
    var f = v3(-d.x, -d.y, -d.z);              // frente da câmera
    var up = v3(0, 1, 0);
    var r = normal(cruz(f, up));
    if (comp(r) < 1e-9) r = v3(1, 0, 0);       // pitch ±90°: degenerado, nunca ocorre (limitado a 89°)
    var u = normal(cruz(r, f));
    return {
      pos: posicaoCamera(cam),
      frente: f, direita: r, cima: u,
      tanMeio: Math.tan(cam.fov / 2),
      aspecto: 1
    };
  }

  function projetar(p, B, largura, altura) {
    var v = sub(p, B.pos);
    var z = dot(v, B.frente);
    if (z <= 1e-6) return { x: NaN, y: NaN, z: z, visivel: false };
    var x = dot(v, B.direita);
    var y = dot(v, B.cima);
    var aspecto = largura / altura;
    var xn = x / (z * B.tanMeio * aspecto);
    var yn = y / (z * B.tanMeio);
    return {
      x: (xn + 1) * 0.5 * largura,
      y: (1 - yn) * 0.5 * altura,
      z: z, ndcX: xn, ndcY: yn, visivel: true
    };
  }

  function raioDoPixel(sx, sy, B, largura, altura) {
    var aspecto = largura / altura;
    var xn = (sx / largura) * 2 - 1;
    var yn = 1 - (sy / altura) * 2;
    return normal(v3(
      B.frente.x + B.direita.x * xn * B.tanMeio * aspecto + B.cima.x * yn * B.tanMeio,
      B.frente.y + B.direita.y * xn * B.tanMeio * aspecto + B.cima.y * yn * B.tanMeio,
      B.frente.z + B.direita.z * xn * B.tanMeio * aspecto + B.cima.z * yn * B.tanMeio
    ));
  }

  function intersecaoEsfera(o, d, raio) {
    var b = dot(o, d);
    var c = dot(o, o) - raio * raio;
    var disc = b * b - c;
    if (disc < 0) return { acerta: false, t0: NaN, t1: NaN };
    var sq = Math.sqrt(disc);
    return { acerta: true, t0: -b - sq, t1: -b + sq };
  }

  /* ponto da superfície sob um pixel (projeção inversa + interseção exata) */
  function pontoSuperficieNoPixel(sx, sy, cam, largura, altura, raio) {
    var B = baseCamera(cam);
    var d = raioDoPixel(sx, sy, B, largura, altura);
    var hit = intersecaoEsfera(B.pos, d, raio === undefined ? R : raio);
    if (!hit.acerta || hit.t1 < 0) return null;
    var t = hit.t0 > 0 ? hit.t0 : hit.t1;
    return { ponto: soma(B.pos, esc(d, t)), t: t, dir: d };
  }

  /* yaw/pitch que fazem a câmera olhar exatamente da direção `d` */
  function cameraParaDir(cam, d) {
    var c = { alvo: cam.alvo, dist: cam.dist, yaw: cam.yaw, pitch: cam.pitch, fov: cam.fov };
    c.yaw = Math.atan2(d.x, d.z);
    c.pitch = clamp(Math.asin(clamp(d.y, -1, 1)), -LIMITE_PITCH, LIMITE_PITCH);
    return c;
  }

  /* ==========================================================================
     5. REGIÃO CANÔNICA — leitura pura da simulação v2
     Nada é escrito de volta. Nada é copiado da linhagem antiga
     (genesis/planeta/*): nem lat −7,40, nem lon 23,80, nem raioAng 0,30.
     ========================================================================== */
  function lerRegiaoCanonica(W, seed) {
    if (!W || typeof W.criar !== 'function') {
      throw new Error('lerRegiaoCanonica: GenesisWorld ausente (world.js não carregou)');
    }
    var s = (seed === undefined || seed === null) ? SEED_CANONICA : seed;
    var t0 = agora();
    var m = W.criar({ seed: s });
    var ms = agora() - t0;
    var reg = W.regiaoAtiva(m);

    var TAM = (typeof W.TAM === 'number') ? W.TAM : reg.largura;
    var TILE = (typeof W.TILE === 'number') ? W.TILE : 1;

    var r = {
      fonte: 'genesis/v2/core/world.js',
      via: 'W.regiaoAtiva(W.criar({seed}))',
      seed: m.seed,
      seedPedida: s,
      id: reg.id,
      idx: reg.idx,
      nome: reg.nome,
      regiaoAtiva: m.planeta.regiaoAtiva,
      regioes: m.planeta.regioes.length,
      nomePlaneta: m.planeta.nome,
      raioKm: m.planeta.raioKm,
      larguraTiles: reg.largura,
      alturaTiles: reg.altura,
      tam: TAM,
      tile: TILE,
      /* lat/lon vêm de world.js como STRING (reg.lat = rng.range(...).toFixed(2)).
         Convertidas aqui, e aqui somente. Nenhum === ingênuo.               */
      latStr: String(reg.lat),
      lonStr: String(reg.lon),
      lat: parseFloat(reg.lat),
      lon: parseFloat(reg.lon),
      msCriacao: ms
    };

    r.dir = dirDeLatLon(r.lat, r.lon);
    r.pos = esc(r.dir, R);
    var volta = latLonDeDir(r.pos.x, r.pos.y, r.pos.z);
    r.latRecuperada = volta.lat;
    r.lonRecuperada = volta.lon;

    /* tamanho angular REAL da região (não o do marcador visual) */
    r.larguraMetros = r.larguraTiles * r.tile;
    r.anguloRealRad = r.larguraMetros / (r.raioKm * 1000);
    r.anguloRealGraus = r.anguloRealRad * DEG;
    r.anguloVisualGraus = MARCADOR_GRAUS;
    r.exagero = (MARCADOR_GRAUS * RAD) / r.anguloRealRad;

    return r;
  }

  /* A posição da região depende APENAS da região. Assinatura de 1 parâmetro,
     de propósito: é auditável por leitura e testável por aridade.
     Se algum dia alguém passar a câmera aqui, o teste T3 cai.              */
  function posicaoDaRegiao(reg) {
    return esc(dirDeLatLon(reg.lat, reg.lon), R);
  }

  /* ==========================================================================
     6. CONTROLADOR DO PLANETA — fluxo explícito do input
        input → transformação de input → Δ → yaw/pitch do PLANETA → Q_planeta
     Nunca: input → câmera → fingir que o planeta girou.
     ========================================================================== */
  function estadoPlaneta() { return { yaw: 0, pitch: 0 }; }

  function aplicarArrasto(planeta, dx, dy) {
    planeta.yaw = (planeta.yaw + dx * SENS_ROTACAO) % DOIS_PI;
    planeta.pitch = clamp(planeta.pitch + dy * SENS_ROTACAO, -LIMITE_PITCH, LIMITE_PITCH);
    return planeta;
  }

  function quaternionDoPlaneta(planeta) {
    return qDeYawPitch(planeta.yaw, planeta.pitch);
  }

  /* ponto material do planeta → posição no mundo (a região é filha do planeta) */
  function mundoDeLocal(qPlaneta, pLocal) { return qRotV(qPlaneta, pLocal); }
  function localDeMundo(qPlaneta, pMundo) {
    return qRotV({ x: -qPlaneta.x, y: -qPlaneta.y, z: -qPlaneta.z, w: qPlaneta.w }, pMundo);
  }

  /* ==========================================================================
     7. TESTES — numéricos, com valores reportados. Nunca só "PASSOU".
     ========================================================================== */
  function rodarTestes(ctx) {
    ctx = ctx || {};
    var out = [];
    var reg = ctx.regiao || null;

    function add(id, nome, ok, valores, detalhe) {
      out.push({ id: id, nome: nome, ok: !!ok, valores: valores, detalhe: detalhe || '' });
    }

    /* ---------- T1 · R360 ---------- */
    (function () {
      var passos = 72, yaw = 0, passo = DOIS_PI / passos;
      for (var i = 0; i < passos; i++) yaw += passo;
      var qFim = qDeYawPitch(yaw, 0);
      var qFimP = qDeYawPitch(yaw, 0.3);

      var eGeo = erroRotacional(qFim, qIdent());
      var eAng = erroRotacionalAngular(qFim, qIdent());
      var eGeoP = erroRotacional(qFimP, qDeYawPitch(0, 0.3));
      var eAngP = erroRotacionalAngular(qFimP, qDeYawPitch(0, 0.3));

      add('T1', 'R360 · 360° retorna à orientação inicial', (eGeo < 1e-12 && eGeoP < 1e-12), {
        'passos': passos,
        'yaw acumulado (rad)': yaw,
        '2π (rad)': DOIS_PI,
        'desvio do yaw (rad)': Math.abs(yaw - DOIS_PI),
        'erro geométrico (pitch 0)': eGeo,
        'erro angular (pitch 0)': eAng,
        'erro geométrico (pitch 0,3 rad)': eGeoP,
        'erro angular (pitch 0,3 rad)': eAngP
      }, 'Métrica sobre o EFEITO da rotação, não sobre componentes — q e −q são a mesma rotação.');
    })();

    /* ---------- T2 · Coordenada ---------- */
    (function () {
      var casos = [
        [0, 0], [45, 90], [-45, -90], [12.34, -56.78], [-60, 170],
        [89.9, 0], [-89.9, 45], [0, 180], [0, -180], [30, 0], [0, 95]
      ];
      if (reg) casos.push([reg.lat, reg.lon]);
      var piorLat = 0, piorLon = 0, piorCaso = null, piorDirecao = 0;
      for (var i = 0; i < casos.length; i++) {
        var d = dirDeLatLon(casos[i][0], casos[i][1]);
        var e = latLonDeDir(d.x, d.y, d.z);
        var el = Math.abs(e.lat - casos[i][0]);
        var eo = erroLonGraus(e.lon, casos[i][1]);
        if (el > piorLat || eo > piorLon) piorCaso = casos[i].slice();
        piorLat = Math.max(piorLat, el);
        piorLon = Math.max(piorLon, eo);
        piorDirecao = Math.max(piorDirecao, Math.abs(comp(d) - 1));
      }
      add('T2', 'Coordenada · lat/lon → XYZ → lat/lon', (piorLat < 1e-9 && piorLon < 1e-9), {
        'casos testados': casos.length,
        'erro máx latitude (°)': piorLat,
        'erro máx longitude (°)': piorLon,
        'pior caso': piorCaso ? (piorCaso[0] + ', ' + piorCaso[1]) : '-',
        'desvio do módulo unitário': piorDirecao
      }, 'Longitude comparada com wrap de 360° (180° e −180° são o mesmo meridiano).');
    })();

    /* ---------- T3 · Identidade da região ---------- */
    (function () {
      var dists = [20, 12, 6, 3, 1.5, 1.2, 1.06];
      var cam = camPadrao();
      var primeira = null, igual = true, pior = 0;
      for (var i = 0; i < dists.length; i++) {
        cam.dist = dists[i];
        var p = posicaoDaRegiao(reg);
        var ll = latLonDeDir(p.x, p.y, p.z);
        var snap = [p.x, p.y, p.z, ll.lat, ll.lon];
        if (!primeira) primeira = snap;
        else for (var k = 0; k < snap.length; k++) {
          var d = Math.abs(snap[k] - primeira[k]);
          pior = Math.max(pior, d);
          if (d !== 0) igual = false;
        }
      }
      var okChain = reg
        ? (Math.abs(reg.latRecuperada - reg.lat) < 1e-12 && Math.abs(reg.lonRecuperada - reg.lon) < 1e-12)
        : false;
      var aridade = posicaoDaRegiao.length;
      add('T3', 'Identidade da região · independe da distância da câmera',
        (igual && pior === 0 && aridade === 1 && okChain), {
          'distâncias varridas': dists.join(' / '),
          'delta máx posição+latlon': pior,
          'bit a bit idêntico': igual,
          'aridade de posicaoDaRegiao': aridade,
          'lat world.js → 3D → lat': reg ? (reg.latStr + ' → ' + reg.latRecuperada.toFixed(12)) : '-',
          'lon world.js → 3D → lon': reg ? (reg.lonStr + ' → ' + reg.lonRecuperada.toFixed(12)) : '-'
        }, 'posicaoDaRegiao recebe SÓ a região. Se a câmera entrar na assinatura, este teste cai.');
    })();

    /* ---------- T4 · Oclusão ---------- */
    (function () {
      var cam = camPadrao(); cam.dist = 6;
      var P = esc(reg.dir, R);

      function medir(c) {
        var B = baseCamera(c);
        var d = normal(sub(P, B.pos));
        var tP = dist(B.pos, P);
        var hit = intersecaoEsfera(B.pos, d, R);
        return { t0: hit.t0, tP: tP, ocluida: hit.acerta && hit.t0 < tP - 1e-6, B: B };
      }
      var frente = medir(cameraParaDir(cam, reg.dir));            // região de frente
      var atras = medir(cameraParaDir(cam, esc(reg.dir, -1)));    // região no lado oposto

      /* O horizonte de uma esfera de raio R vista de distância d corta a
         superfície em cos θ = R/d — NÃO em cos θ = 0. O critério abaixo é o
         confronto entre a oclusão real por profundidade e o horizonte analítico. */
      var yaws = 36, casam = 0, divergentes = 0, piorDiv = 0, D = 6;
      var horizonte = R / D;
      for (var i = 0; i < yaws; i++) {
        var c = camPadrao(); c.dist = D; c.pitch = 0;
        c.yaw = (i / yaws) * DOIS_PI;
        var r0 = medir(c);
        var cosv = dot(reg.dir, dirAtras(c));
        var previsto = cosv < horizonte;
        if (r0.ocluida === previsto) casam++;
        else { divergentes++; piorDiv = Math.max(piorDiv, Math.abs(cosv - horizonte)); }
      }

      add('T4', 'Oclusão · a geometria do planeta é o primeiro obstáculo',
        (!frente.ocluida && atras.ocluida && divergentes === 0), {
          'frente · t0': frente.t0,
          'frente · tP': frente.tP,
          'frente · tP − t0': frente.tP - frente.t0,
          'frente · ocluída': frente.ocluida,
          'lado oposto · t0': atras.t0,
          'lado oposto · tP': atras.tP,
          'lado oposto · tP − t0': atras.tP - atras.t0,
          'lado oposto · ocluída': atras.ocluida,
          'varredura 36 yaws · casam': casam,
          'varredura 36 yaws · divergentes': divergentes,
          'pior desvio do horizonte numa divergência': piorDiv,
          'horizonte analítico R/d': horizonte,
          'critério de visibilidade': 'cos(região, direção da câmera) ≥ R/d'
        }, 'Ponto da região no lado oposto: o raio câmera→região entra na esfera (t0) muito antes de chegar (tP). Sem nenhum if especial.');
    })();

    /* ---------- T5 · Retorno ---------- */
    (function () {
      var p0 = mundoDeLocal(qDeYawPitch(0, 0), reg.pos);
      var p180 = mundoDeLocal(qDeYawPitch(Math.PI, 0), reg.pos);
      var p360 = mundoDeLocal(qDeYawPitch(DOIS_PI, 0), reg.pos);

      var d360 = Math.max(Math.abs(p360.x - p0.x), Math.abs(p360.y - p0.y), Math.abs(p360.z - p0.z));
      var espelho = v3(-reg.pos.x, reg.pos.y, -reg.pos.z);
      var d180 = Math.max(Math.abs(p180.x - espelho.x), Math.abs(p180.y - espelho.y), Math.abs(p180.z - espelho.z));
      var separou = dist(p180, p0);

      add('T5', 'Retorno · 0° → 180° → 360° volta à posição original',
        (d360 < 1e-15 && d180 < 1e-15 && separou > 0.1), {
          'P(0°)': p0.x.toFixed(12) + ', ' + p0.y.toFixed(12) + ', ' + p0.z.toFixed(12),
          'P(180°)': p180.x.toFixed(12) + ', ' + p180.y.toFixed(12) + ', ' + p180.z.toFixed(12),
          'P(360°)': p360.x.toFixed(12) + ', ' + p360.y.toFixed(12) + ', ' + p360.z.toFixed(12),
          '|P(360°) − P(0°)|': d360,
          '|P(180°) − espelho|': d180,
          '|P(180°) − P(0°)|': separou
        }, '180° tem de ser um ponto DIFERENTE (a região vai para o lado oculto); 360° tem de ser o MESMO ponto.');
    })();

    /* ---------- T6 · Zoom (reformulado: ponto físico mantém lat/lon) ---------- */
    (function () {
      var dists = [20, 12, 6, 3, 1.5, 1.2];
      var cam = camPadrao(); cam.yaw = 0.6; cam.pitch = 0.3;
      var largura = 1000, altura = 700;
      var serie = [], primeira = null, pior = 0;

      for (var i = 0; i < dists.length; i++) {
        var c = { alvo: cam.alvo, dist: dists[i], yaw: cam.yaw, pitch: cam.pitch, fov: cam.fov };
        var alvoPixel = pontoSuperficieNoPixel(largura / 2, altura / 2, c, largura, altura, R);
        var ll = latLonDeDir(alvoPixel.ponto.x, alvoPixel.ponto.y, alvoPixel.ponto.z);
        serie.push(dists[i] + ' un → lat ' + ll.lat.toFixed(9) + '° / lon ' + ll.lon.toFixed(9) + '°');
        if (!primeira) primeira = [ll.lat, ll.lon];
        else pior = Math.max(pior, Math.abs(ll.lat - primeira[0]), erroLonGraus(ll.lon, primeira[1]));
      }
      add('T6', 'Zoom · ponto físico mantém o mesmo lat/lon', (pior < 1e-9), {
        'série': serie.join('  |  '),
        'maior desvio (°)': pior
      }, 'A câmera só muda de distância; yaw, pitch e alvo ficam congelados. Se o terreno fosse reconstruído pela distância, este teste acusaria.');
    })();

    /* ---------- T7 · Input ---------- */
    (function () {
      var largura = 1000, altura = 700;
      var cam = camPadrao(); cam.dist = 3.1; cam.yaw = 0; cam.pitch = 0;
      var camAntes = JSON.stringify(cam);

      var planeta = estadoPlaneta();
      var q0 = quaternionDoPlaneta(planeta);

      var B = baseCamera(cam);
      var sobCursor = pontoSuperficieNoPixel(largura / 2, altura / 2, cam, largura, altura, R);
      var material = localDeMundo(q0, sobCursor.ponto);
      var sxAntes = projetar(mundoDeLocal(q0, material), B, largura, altura).x;

      var dx = 120;
      aplicarArrasto(planeta, dx, 0);
      var q1 = quaternionDoPlaneta(planeta);
      var sxDepois = projetar(mundoDeLocal(q1, material), B, largura, altura).x;

      var planeta2 = estadoPlaneta();
      aplicarArrasto(planeta2, -dx, 0);
      var sxOposto = projetar(mundoDeLocal(quaternionDoPlaneta(planeta2), material), B, largura, altura).x;

      var planeta3 = estadoPlaneta();
      aplicarArrasto(planeta3, 0, dx);
      var B3 = baseCamera(cam);
      var sobCursor3 = pontoSuperficieNoPixel(largura / 2, altura / 2, cam, largura, altura, R);
      var mat3 = localDeMundo(q0, sobCursor3.ponto);
      var syAntes = projetar(mundoDeLocal(q0, mat3), B3, largura, altura).y;
      var syDepois = projetar(mundoDeLocal(quaternionDoPlaneta(planeta3), mat3), B3, largura, altura).y;

      var camIntacta = (JSON.stringify(cam) === camAntes);

      add('T7', 'Input · arrastar para a direita move a superfície para a direita',
        (sxDepois > sxAntes + 5 && sxOposto < sxAntes - 5 && syDepois > syAntes + 5 && camIntacta), {
          'px arrastados (dx)': dx,
          'Δyaw do planeta (°)': (planeta.yaw * DEG),
          'tela x antes': sxAntes,
          'tela x depois (+dx)': sxDepois,
          'tela x depois (−dx)': sxOposto,
          'Δx na tela': sxDepois - sxAntes,
          'tela y antes': syAntes,
          'tela y depois (+dy)': syDepois,
          'Δy na tela': syDepois - syAntes,
          'estado da câmera intacto': camIntacta
        }, 'O ponto físico é reamostrado sob o cursor, convertido para coordenada local do planeta, rotacionado por Q_planeta e reprojetado. A câmera não participa da rotação.');
    })();

    /* ---------- T8 · Determinismo ---------- */
    (function () {
      var n = 2000, ok = true, checksum = 0;
      var base = dirDeLatLon(37.59, 45.82);
      for (var i = 0; i < n; i++) {
        var d = dirDeLatLon(37.59, 45.82);
        if (!Object.is(d.x, base.x) || !Object.is(d.y, base.y) || !Object.is(d.z, base.z)) ok = false;
        var e = latLonDeDir(d.x, d.y, d.z);
        var f = latLonDeDir(base.x, base.y, base.z);
        if (!Object.is(e.lat, f.lat) || !Object.is(e.lon, f.lon)) ok = false;
        checksum += e.lat;
      }
      var q1 = qDeYawPitch(1.2345, -0.6789);
      var q2 = qDeYawPitch(1.2345, -0.6789);
      var qOk = Object.is(q1.x, q2.x) && Object.is(q1.y, q2.y) && Object.is(q1.z, q2.z) && Object.is(q1.w, q2.w);

      add('T8', 'Determinismo · mesmas coordenadas → mesmo XYZ', (ok && qOk), {
        'iterações': n,
        'bit a bit igual (lat/lon/xyz)': ok,
        'quaternion bit a bit igual': qOk,
        'checksum (Σ lat)': checksum
      }, 'Comparação com Object.is (igualdade exata), não com epsilon.');
    })();

    /* ---------- T9 · Independência ---------- */
    (function () {
      var temW = !!ctx.W;
      var temTHREE = (typeof ctx.THREE_ATIVO !== 'undefined') ? ctx.THREE_ATIVO : false;
      var censo = ctx.censo || null;
      var msTick = null;
      var rodou = false;

      if (temW && ctx.mundo) {
        var t0 = agora();
        for (var i = 0; i < 20; i++) ctx.W.tick(ctx.mundo, 0.1);
        msTick = agora() - t0;
        rodou = true;
      }

      add('T9', 'Independência · a simulação v2 roda sem o renderer', (temW && rodou), {
        'GenesisWorld presente': temW,
        'THREE carregado nesta página': temTHREE,
        'simulação rodou 20 ticks sem THREE': rodou,
        '20 ticks (ms)': msTick === null ? '-' : msTick,
        'censo após ticks': censo ? JSON.stringify(censo) : '-'
      }, 'Executado dentro da camada pura, que não referencia THREE em nenhum ponto. A simulação não sabe que um renderer existe.');
    })();

    return out;
  }

  /* ==========================================================================
     8. BENCHMARK (browser) — números brutos, sem narrativa
     ========================================================================== */
  function criarBenchmark(laco) {
    return {
      medir: function (frames) {
        frames = frames || 300;
        return new Promise(function (resolve) {
          var amostras = [];
          var ultimo = agora();
          var contador = 0;
          var inicial = laco.info();
          function passo() {
            var t = agora();
            amostras.push(t - ultimo);
            ultimo = t;
            contador++;
            if (contador < frames) { requestAnimationFrame(passo); return; }
            amostras.sort(function (a, b) { return a - b; });
            var soma = 0;
            for (var i = 0; i < amostras.length; i++) soma += amostras[i];
            var media = soma / amostras.length;
            var final = laco.info();
            resolve({
              frames: amostras.length,
              fps: 1000 / media,
              mediaMs: media,
              p50Ms: amostras[Math.floor(amostras.length * 0.50)],
              p95Ms: amostras[Math.floor(amostras.length * 0.95)],
              piorMs: amostras[amostras.length - 1],
              melhorMs: amostras[0],
              triangulos: final.triangulos,
              drawCalls: final.drawCalls,
              geometrias: final.geometrias,
              texturas: final.texturas,
              programas: final.programas,
              dpr: final.dpr,
              largura: final.largura,
              altura: final.altura,
              inicial: inicial
            });
          }
          requestAnimationFrame(passo);
        });
      }
    };
  }

  /* ==========================================================================
     9. CAMADA VISUAL (THREE) — só existe se window.THREE existir
     ========================================================================== */
  function boot(opcoes) {
    var THREE = GLOBAL.THREE;
    if (!THREE) throw new Error('boot: THREE ausente. Carregue ../_build/three.min.js antes de terra.js.');
    var op = opcoes || {};
    var canvas = op.canvas || document.getElementById('cena');
    if (!canvas) throw new Error('boot: canvas ausente.');

    var evento = op.onEstado || function () {};

    /* ---------- renderer ---------- */
    var DPR_MAX = op.dprMax || 1.5;
    var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' });
    renderer.setClearColor(0x05070c, 1);
    if (THREE.sRGBEncoding !== undefined) renderer.outputEncoding = THREE.sRGBEncoding;

    /* ---------- cena ---------- */
    var cena = new THREE.Scene();
    var noPlaneta = new THREE.Group();          // SÓ o controlador do planeta escreve aqui
    cena.add(noPlaneta);

    var cam = camPadrao();
    var planeta = estadoPlaneta();
    var camera = new THREE.PerspectiveCamera(cam.fov * DEG, 1, 0.01, 200);

    /* ---------- região canônica (autoridade: world.js) ---------- */
    var regiao = lerRegiaoCanonica(GLOBAL.GenesisWorld, op.seed);
    var mundo = null, censoInicial = null;
    try {
      mundo = GLOBAL.GenesisWorld.criar({ seed: op.seed === undefined ? SEED_CANONICA : op.seed });
      censoInicial = GLOBAL.GenesisWorld.censo ? GLOBAL.GenesisWorld.censo(mundo) : null;
    } catch (e) { mundo = null; }

    /* A câmera abre OLHANDO PARA A REGIÃO CANÔNICA. O primeiro quadro tem de
       mostrar a região viva da simulação, não um hemisfério vazio.            */
    cam.yaw = Math.atan2(regiao.dir.x, regiao.dir.z);
    cam.pitch = clamp(Math.asin(clamp(regiao.dir.y, -1, 1)), -LIMITE_PITCH, LIMITE_PITCH);
    var autoEnquadrar = true;

    /* ---------- esfera: o planeta. Fechada, opaca, com depth. ----------
       A malha carrega o SISTEMA DE COORDENADAS visível (paralelos e meridianos
       em vertex colors). Não é textura, não é imagem, não é terreno, não é LOD:
       é a própria grade lat/lon, e é o que torna a rotação observável a olho nu. */
    var SEG_W = 96, SEG_H = 64;
    var geoEsfera = new THREE.SphereGeometry(R, SEG_W, SEG_H);
    (function pintarGrade() {
      var pos = geoEsfera.attributes.position;
      var cores = new Float32Array(pos.count * 3);
      /* paleta autorada em sRGB, convertida para linear (ver srgbParaLinear) */
      var base = linearDeHex(0x293442);   // casco
      var linha = linearDeHex(0x4d80a0);  // paralelos e meridianos a cada 15°
      var forte = linearDeHex(0x85b8cf);  // equador, meridiano 0, trópicos
      var dLon = 360 / SEG_W, dLat = 180 / SEG_H;

      function perto(v, passo) {
        var m = Math.abs(((v % passo) + passo) % passo);
        return Math.min(m, passo - m) < passo * 0.5;
      }
      for (var i = 0; i < pos.count; i++) {
        var x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        var ll = latLonDeDir(x, y, z);
        var c = base;
        if (perto(ll.lat, 15) || perto(ll.lon, 15)) c = linha;
        if (perto(ll.lat, 90) || perto(ll.lon, 90)) c = forte;   // trópicos e meridianos mestres
        if (Math.abs(ll.lat) < dLat * 0.5 || perto(ll.lon, 360)) c = forte; // equador e meridiano 0
        cores[i * 3] = c[0]; cores[i * 3 + 1] = c[1]; cores[i * 3 + 2] = c[2];
      }
      geoEsfera.setAttribute('color', new THREE.BufferAttribute(cores, 3));
    })();

    var matEsfera = new THREE.MeshPhongMaterial({
      vertexColors: true, shininess: 3,
      emissive: new THREE.Color(0, 0, 0)
    });
    var linBase = linearDeHex(0x293442);
    matEsfera.emissive.setRGB(linBase[0] * 0.35, linBase[1] * 0.35, linBase[2] * 0.35);
    var esfera = new THREE.Mesh(geoEsfera, matEsfera);
    esfera.castShadow = false; esfera.receiveShadow = false;
    noPlaneta.add(esfera);

    /* ---------- marcador da região: filho do planeta, preso à superfície ----------
       Nasce em raio R*1.002 apenas para não brigar com o z-buffer da esfera.
       É a MESMA direção que world.js entrega; o tamanho angular é exagerado
       por legibilidade e o exagero é reportado no HUD.                      */
    var geoMarcador, geoAnel;
    (function construirMarcador() {
      var alfa = MARCADOR_GRAUS * RAD;
      var rSup = R * 1.002;
      var C = regiao.dir;
      var norte = v3(0, 1, 0);
      var u = normal(cruz(C, norte));
      if (comp(u) < 1e-6) u = v3(1, 0, 0);
      var w = normal(cruz(C, u));

      function pontoSetor(fi, ang) {
        var d = normal(soma(esc(C, Math.cos(ang)), soma(esc(u, Math.sin(ang) * Math.cos(fi)), esc(w, Math.sin(ang) * Math.sin(fi)))));
        return esc(d, rSup);
      }

      var N = 48;
      /* leque central */
      var verts = [], a0 = esc(C, rSup);
      for (var i = 0; i < N; i++) {
        var f1 = (i / N) * DOIS_PI, f2 = ((i + 1) / N) * DOIS_PI;
        var p1 = pontoSetor(f1, alfa * 0.62), p2 = pontoSetor(f2, alfa * 0.62);
        verts.push(a0.x, a0.y, a0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z);
      }
      var g1 = new THREE.BufferGeometry();
      g1.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
      g1.computeVertexNormals();
      geoMarcador = g1;

      /* anel externo */
      var v2 = [];
      for (var j = 0; j < N; j++) {
        var fa = (j / N) * DOIS_PI, fb = ((j + 1) / N) * DOIS_PI;
        var iA = pontoSetor(fa, alfa * 0.86), iB = pontoSetor(fb, alfa * 0.86);
        var oA = pontoSetor(fa, alfa), oB = pontoSetor(fb, alfa);
        v2.push(iA.x, iA.y, iA.z, oA.x, oA.y, oA.z, oB.x, oB.y, oB.z);
        v2.push(iA.x, iA.y, iA.z, oB.x, oB.y, oB.z, iB.x, iB.y, iB.z);
      }
      var g2 = new THREE.BufferGeometry();
      g2.setAttribute('position', new THREE.BufferAttribute(new Float32Array(v2), 3));
      g2.computeVertexNormals();
      geoAnel = g2;
    })();

    var linMarcador = linearDeHex(0xffb03a);
    var linAnel = linearDeHex(0xffd98a);
    var marcador = new THREE.Mesh(geoMarcador, new THREE.MeshPhongMaterial({
      color: new THREE.Color(linMarcador[0], linMarcador[1], linMarcador[2]),
      emissive: new THREE.Color(linMarcador[0] * 0.30, linMarcador[1] * 0.30, linMarcador[2] * 0.30),
      shininess: 8
    }));
    var anel = new THREE.Mesh(geoAnel, new THREE.MeshBasicMaterial({
      color: new THREE.Color(linAnel[0] * 0.75, linAnel[1] * 0.75, linAnel[2] * 0.75),
      side: THREE.DoubleSide
    }));
    noPlaneta.add(marcador);
    noPlaneta.add(anel);

    /* ---------- luz ---------- */
    cena.add(new THREE.AmbientLight(0x3a4a5c, 1.0));
    var sol = new THREE.DirectionalLight(0xfff3e2, 1.15);
    sol.position.set(3.2, 1.6, 2.4);
    cena.add(sol);

    /* ---------- redimensionamento ---------- */
    var dim = { l: 1, a: 1 };
    function redimensionar() {
      var l = canvas.clientWidth || window.innerWidth;
      var a = canvas.clientHeight || window.innerHeight;
      dim.l = l; dim.a = a;
      var dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
      renderer.setPixelRatio(dpr);
      renderer.setSize(l, a, false);
      camera.aspect = l / a;
      camera.fov = cam.fov * DEG;
      camera.updateProjectionMatrix();
      dprAtual = dpr;
      /* enquanto o usuário não mexeu no zoom, o planeta inteiro cabe no quadro */
      if (autoEnquadrar) cam.dist = clamp(distParaEnquadrar(l / a, cam.fov, R, 1.25), CAM_MIN, CAM_MAX);
    }
    var dprAtual = 1;
    window.addEventListener('resize', redimensionar);

    /* ---------- input: um handler por preocupação ---------- */
    var arrasto = null;
    var pinca = null;

    canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    canvas.addEventListener('pointerdown', function (e) {
      /* alguns navegadores lançam com pointerId sintético/inativo */
      try { canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId); } catch (err) { }
      arrasto = { id: e.pointerId, x: e.clientX, y: e.clientY, camera: (e.button === 2 || e.shiftKey) };
      if (e.button === 2 || e.shiftKey) e.preventDefault();
    });

    canvas.addEventListener('pointermove', function (e) {
      if (!arrasto || arrasto.id !== e.pointerId) return;
      var dx = e.clientX - arrasto.x, dy = e.clientY - arrasto.y;
      arrasto.x = e.clientX; arrasto.y = e.clientY;

      if (arrasto.camera) {
        /* caminho da CÂMERA — nunca chamado pelo caminho do planeta */
        cam.yaw -= dx * SENS_ROTACAO;
        cam.pitch = clamp(cam.pitch + dy * SENS_ROTACAO, -LIMITE_PITCH, LIMITE_PITCH);
      } else {
        /* caminho do PLANETA — input → transformação → Δ → Q_planeta */
        aplicarArrasto(planeta, dx, dy);
      }
    });

    function soltar(e) {
      if (arrasto && arrasto.id === e.pointerId) arrasto = null;
    }
    canvas.addEventListener('pointerup', soltar);
    canvas.addEventListener('pointercancel', soltar);
    canvas.addEventListener('pointerleave', soltar);

    canvas.addEventListener('wheel', function (e) {
      e.preventDefault();
      autoEnquadrar = false;
      cam.dist = clamp(cam.dist * Math.exp(e.deltaY * 0.0012), CAM_MIN, CAM_MAX);
    }, { passive: false });

    canvas.addEventListener('touchmove', function (e) {
      if (e.touches.length !== 2) { pinca = null; return; }
      e.preventDefault();
      var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (pinca) { autoEnquadrar = false; cam.dist = clamp(cam.dist * (pinca / d), CAM_MIN, CAM_MAX); }
      pinca = d;
    }, { passive: false });
    canvas.addEventListener('touchend', function () { pinca = null; });

    /* ---------- laço ---------- */
    var ultimoFrame = agora();
    var fpsSuave = 0;
    var msSuave = 0;
    var encerrado = false;

    /* Um único ponto onde Q_planeta e a câmera são aplicados e o quadro sai.
       Chamado pelo laço E uma vez no boot: o primeiro quadro não pode depender
       de o rAF estar ativo (aba em segundo plano, captura, ambiente de teste). */
    function desenhar() {
      /* uma única aplicação de Q_planeta — no nó do planeta */
      var q = quaternionDoPlaneta(planeta);
      noPlaneta.quaternion.set(q.x, q.y, q.z, q.w);

      /* câmera: estado próprio, aplicado separadamente */
      var B = baseCamera(cam);
      camera.position.set(B.pos.x, B.pos.y, B.pos.z);
      camera.up.set(0, 1, 0);
      camera.lookAt(cam.alvo.x, cam.alvo.y, cam.alvo.z);

      renderer.render(cena, camera);
      quadro++;
    }

    function laco() {
      if (encerrado) return;
      requestAnimationFrame(laco);

      var t = agora();
      var dt = t - ultimoFrame;
      ultimoFrame = t;
      if (dt > 0) {
        msSuave = msSuave ? msSuave * 0.9 + dt * 0.1 : dt;
        fpsSuave = 1000 / msSuave;
      }

      desenhar();

      if (t - ultimaPublicacao > 250) {
        ultimaPublicacao = t;
        publicar();
      }
    }
    var ultimaPublicacao = 0;
    var quadro = 0;

    function publicar() {
      var info = renderer.info;
      evento({
        regiao: regiao,
        planeta: { yaw: planeta.yaw, pitch: planeta.pitch },
        cam: { dist: cam.dist, yaw: cam.yaw, pitch: cam.pitch, fov: cam.fov },
        fps: fpsSuave, msFrame: msSuave,
        dpr: dprAtual,
        censo: censoInicial,
        render: {
          triangulos: info.render.triangles,
          drawCalls: info.render.calls,
          geometrias: info.memory.geometries,
          texturas: info.memory.textures,
          programas: (info.programs || []).length
        }
      });
    }

    function info() {
      var info2 = renderer.info;
      return {
        triangulos: info2.render.triangles,
        drawCalls: info2.render.calls,
        geometrias: info2.memory.geometries,
        texturas: info2.memory.textures,
        programas: (info2.programs || []).length,
        dpr: dprAtual,
        largura: dim.l, altura: dim.a
      };
    }

    /* ---------- API do harness ---------- */
    var bench = criarBenchmark({ info: info });

    var api = {
      THREE: THREE,
      renderer: renderer, cena: cena, camera: camera,
      noPlaneta: noPlaneta,
      regiao: regiao,
      mundo: mundo,
      lerRegiaoCanonica: function (seed) { return lerRegiaoCanonica(GLOBAL.GenesisWorld, seed); },
      seed: regiao.seed,

      estado: function () {
        return { planeta: { yaw: planeta.yaw, pitch: planeta.pitch }, cam: cam, regiao: regiao };
      },
      definirPlaneta: function (yaw, pitch) {
        planeta.yaw = yaw; planeta.pitch = clamp(pitch, -LIMITE_PITCH, LIMITE_PITCH);
      },
      definirCamera: function (d) {
        autoEnquadrar = false;
        if (d.dist !== undefined) cam.dist = clamp(d.dist, CAM_MIN, CAM_MAX);
        if (d.yaw !== undefined) cam.yaw = d.yaw;
        if (d.pitch !== undefined) cam.pitch = clamp(d.pitch, -LIMITE_PITCH, LIMITE_PITCH);
      },
      /* volta a enquadrar o planeta inteiro no quadro atual e devolve a distância */
      enquadrar: function () { autoEnquadrar = true; redimensionar(); return cam.dist; },
      resetar: function () {
        planeta.yaw = 0; planeta.pitch = 0;
        cam.yaw = Math.atan2(regiao.dir.x, regiao.dir.z);
        cam.pitch = clamp(Math.asin(clamp(regiao.dir.y, -1, 1)), -LIMITE_PITCH, LIMITE_PITCH);
        autoEnquadrar = true;
        redimensionar();
      },
      /* olha o planeta já com a região de frente — usado pelo botão "Ir para a região" */
      olharRegiao: function (escondida) {
        var d = escondida ? esc(regiao.dir, -1) : regiao.dir;
        cam.yaw = Math.atan2(d.x, d.z);
        cam.pitch = clamp(Math.asin(clamp(d.y, -1, 1)), -LIMITE_PITCH, LIMITE_PITCH);
        return cam;
      },
      pontoSobPonteiro: function (sx, sy) {
        var p = pontoSuperficieNoPixel(sx, sy, cam, dim.l, dim.a, R);
        return p ? p.ponto : null;
      },
      projetar: function (p) { return projetar(p, baseCamera(cam), dim.l, dim.a); },
      rodarTestes: function () {
        return rodarTestes({
          regiao: regiao,
          W: GLOBAL.GenesisWorld,
          mundo: mundo,
          censo: censoInicial,
          THREE_ATIVO: true
        });
      },
      benchmark: function (frames) { return bench.medir(frames); },
      desenhar: desenhar,
      info: info,
      publicar: publicar,
      parar: function () { encerrado = true; }
    };

    redimensionar();
    desenhar();          // primeiro quadro garantido, sem depender do rAF
    publicar();
    requestAnimationFrame(laco);
    return api;
  }

  /* ==========================================================================
     10. EXPORTAÇÃO
     ========================================================================== */
  return {
    /* constantes */
    R: R, RAD: RAD, DEG: DEG, RAIO_KM: RAIO_KM,
    SEED_CANONICA: SEED_CANONICA,
    SENS_ROTACAO: SENS_ROTACAO, LIMITE_PITCH: LIMITE_PITCH,
    CAM_MIN: CAM_MIN, CAM_MAX: CAM_MAX,
    MARCADOR_GRAUS: MARCADOR_GRAUS,
    QUADRANTES: 'Fase 1',

    /* vetorial */
    v3: v3, soma: soma, sub: sub, esc: esc, dot: dot, cruz: cruz,
    comp: comp, normal: normal, dist: dist,

    /* espacial */
    dirDeLatLon: dirDeLatLon,
    latLonDeDir: latLonDeDir,
    erroLonGraus: erroLonGraus,

    /* cor */
    srgbParaLinear: srgbParaLinear,
    linearDeHex: linearDeHex,

    /* quaternion */
    qIdent: qIdent, qEixo: qEixo, qMul: qMul, qNorm: qNorm, qRotV: qRotV,
    qDeYawPitch: qDeYawPitch,
    erroRotacional: erroRotacional,
    erroRotacionalAngular: erroRotacionalAngular,

    /* câmera */
    camPadrao: camPadrao, dirAtras: dirAtras, posicaoCamera: posicaoCamera,
    distParaEnquadrar: distParaEnquadrar,
    baseCamera: baseCamera, projetar: projetar, raioDoPixel: raioDoPixel,
    intersecaoEsfera: intersecaoEsfera,
    pontoSuperficieNoPixel: pontoSuperficieNoPixel,
    cameraParaDir: cameraParaDir,

    /* região */
    lerRegiaoCanonica: lerRegiaoCanonica,
    posicaoDaRegiao: posicaoDaRegiao,

    /* planeta */
    estadoPlaneta: estadoPlaneta, aplicarArrasto: aplicarArrasto,
    quaternionDoPlaneta: quaternionDoPlaneta,
    mundoDeLocal: mundoDeLocal, localDeMundo: localDeMundo,

    /* testes + visual */
    rodarTestes: rodarTestes,
    criarBenchmark: criarBenchmark,
    boot: boot,

    versao: 'fase1-1.0'
  };
});
