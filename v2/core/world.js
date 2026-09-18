/* ============================================================
   GÊNESIS v2 — core/world.js  (parte 1/2)
   MUNDO: planeta → regiões → tiles de 1 m, física de objetos,
   clima, tempo acelerável, entidades e grade espacial.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./util.js'), require('./data.js'), require('./brain.js'));
  else root.GenesisWorld = factory(root.GenesisUtil, root.GenesisData, root.GenesisBrain);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (U, D, B) {
  'use strict';

  const TAM = 160;         // tiles por lado (1 tile = 1 m)
  const TILE = 1;
  const G = 9.81;          // gravidade (m/s²) em segundos do mundo

  /* --- FIS: constantes de fisiologia (Fase 0) ---
     Todas as taxas sao por HORA de tempo do mundo.
     fome 100 => ~7,6 dias sem comer | sede 100 => ~3,2 dias sem beber. */
  const FIS = {
    fomePorHora: 0.55,
    sedePorHora: 1.30,
    danoFomeLimiar: 80,
    danoFomeMax: 1.2,
    danoSedeLimiar: 80,
    danoSedeMax: 1.7,
    curaPorHora: 1.35,
    energiaBem: 6,
    energiaBemDormindo: 24,
    energiaFamintoDormindo: 2.7,
    energiaPerdeFaminto: 1.2,
    energiaPerdeCritico: 2.4,
    velEnergiaPiso: 0.35
  };
  const CELULA = 8;        // célula da grade espacial (m)
  const NIVEL_MAR = 0;
  const AREA = TAM * TAM;
  const BIOMA_IDS = D.BIOMAS_IDS;

  /* ============================================================
     1. CRIAÇÃO
     ============================================================ */
  function criar(opcoes) {
    opcoes = opcoes || {};
    const seed = opcoes.seed || Math.floor(Math.random() * 1e9);
    const m = {
      versao: 2,
      seed: seed,
      rng: U.RNG(seed),
      tempo: { segMundo: opcoes.segInicial || 0, escala: 1, realDecorrido: 0, tick: 0 },
      planeta: {
        nome: opcoes.nomePlaneta || 'Gênesis',
        raioKm: 6371,
        regioes: [],           // setores
        regiaoAtiva: 0
      },
      clima: { tipo: 'sol', intensidade: 1, vento: { x: 0.5, y: 0.2 }, tempExtra: 0, forca: 0, transicao: 0 },
      cultura: { conhecimentos: {}, geracoes: 1, riqueza: 0, descobertas: [] },
      entidades: [],
      npcs: [], animais: [], objetos: [], plantas: [], construcoes: [], aguas: [], fogos: [], plantacoes: [],
      mortos: [],
      eventos: [],
      contadores: { nascimentos: 0, mortes: {}, construcoes: 0, receitas: 0, geracoes: 1 },
      proxId: 1,
      proximoNomeM: 2, proximoNomeF: 2, ultimoLog: 0
    };
    anexarMetodos(m);
    gerarRegiao(m, opcoes);
    if (!opcoes.vazio) {
      semearVida(m);
      criarFundadores(m);
    }
    m.grade = null;
    reconstruirGrade(m);
    return m;
  }

  /* ============================================================
     2. TERRENO — ilha com relevo, rios, lagos e biomas
     ============================================================ */
  function gerarRegiao(m, opcoes) {
    const rng = m.rng;
    const id = 0;
    const reg = {
      id: id, nome: opcoes.nomeIlha || 'Ilha Gênesis', idx: 0,
      lat: (rng.range(-40, 40)).toFixed(2), lon: (rng.range(-170, 170)).toFixed(2),
      largura: TAM, altura: TAM,
      alturaTerreno: new Float32Array(AREA),
      tipo: new Uint8Array(AREA),
      umidade: new Float32Array(AREA),
      fertilidade: new Float32Array(AREA),
      temperatura: new Float32Array(AREA),
      biomaBase: 'prado'
    };
    const s = rng.int(1, 1e6);
    const tempIlha = rng.range(13, 31);          // faixa climática da ilha
    const chuvoso = rng.range(0.35, 0.75);       // umidade geral

    /* --- RELEVO: domo suave + colinas; praia larga; mar em volta --- */
    for (let y = 0; y < TAM; y++) {
      for (let x = 0; x < TAM; x++) {
        const nx = (x / TAM - 0.5) * 2, ny = (y / TAM - 0.5) * 2;
        const raio = Math.hypot(nx, ny);
        let e = (1 - raio * raio) * 13.5;
        e += U.fbm(x / 30, y / 30, s, 4) * 7.5 - 3.2;
        e += U.fbm(x / 8, y / 8, s + 77, 3) * 1.4 - 0.7;
        if (raio > 0.88) e -= (raio - 0.88) * 95;
        if (raio > 1.02) e = Math.min(e, -2.2 - (raio - 1.02) * 40);
        reg.alturaTerreno[y * TAM + x] = e;
      }
    }

    /* --- RIO: nasce no ponto mais alto e desce até o mar --- */
    let topo = { x: (TAM / 2) | 0, y: (TAM / 2) | 0, h: -1e9 };
    for (let y = 6; y < TAM - 6; y++) for (let x = 6; x < TAM - 6; x++) {
      const h = reg.alturaTerreno[y * TAM + x];
      if (h > topo.h) topo = { x: x, y: y, h: h };
    }
    const rio = [];
    const visitado = new Set();
    let cx = topo.x, cy = topo.y, guarda = 0;
    visitado.add(cy * TAM + cx);
    while (guarda++ < 900 && reg.alturaTerreno[cy * TAM + cx] > 0.3) {
      rio.push([cx, cy]);
      let melhorDir = null, melhorH = 1e9;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx2 = cx + dx, ny2 = cy + dy;
        if (nx2 < 2 || ny2 < 2 || nx2 >= TAM - 2 || ny2 >= TAM - 2) continue;
        if (visitado.has(ny2 * TAM + nx2)) continue;
        const h = reg.alturaTerreno[ny2 * TAM + nx2] + rng.range(0, 0.04);
        if (h < melhorH) { melhorH = h; melhorDir = [nx2, ny2]; }
      }
      if (!melhorDir) break;
      cx = melhorDir[0]; cy = melhorDir[1];
      visitado.add(cy * TAM + cx);
      if (rng.chance(0.25)) {
        const lx = U.clamp(cx + rng.int(-1, 1), 2, TAM - 3), ly = U.clamp(cy + rng.int(-1, 1), 2, TAM - 3);
        if (!visitado.has(ly * TAM + lx)) { rio.push([lx, ly]); visitado.add(ly * TAM + lx); }
      }
    }
    const reg2 = reg;
    const cravaAgua = (x, y, h) => {
      if (x < 1 || y < 1 || x >= TAM - 1 || y >= TAM - 1) return;
      const j = y * TAM + x;
      reg2.alturaTerreno[j] = Math.min(reg2.alturaTerreno[j], h);
      reg2.umidade[j] = 0.98;
    };
    for (let i = 0; i < rio.length; i++) {
      const rx = rio[i][0], ry = rio[i][1];
      cravaAgua(rx, ry, -0.5);
      if (i % 4 === 0) { cravaAgua(rx + 1, ry, -0.5); cravaAgua(rx, ry + 1, -0.5); }
    }

    /* --- LAGOS --- */
    const lagos = [];
    const nLagos = rng.int(1, 3);
    for (let i = 0; i < nLagos; i++) {
      const lx = rng.int(24, TAM - 24), ly = rng.int(24, TAM - 24);
      const raio = rng.range(4, 8);
      lagos.push({ x: lx, y: ly, r: raio });
      for (let y = ly - raio - 2; y <= ly + raio + 2; y++) for (let x = lx - raio - 2; x <= lx + raio + 2; x++) {
        if (x < 1 || y < 1 || x >= TAM - 1 || y >= TAM - 1) continue;
        const d = U.dist(x, y, lx, ly);
        if (d < raio) cravaAgua(x, y, -0.6 - (raio - d) * 0.12);
      }
    }

    /* --- BIOMA por altura, umidade e temperatura --- */
    const umiSeed = s + 313;
    for (let y = 0; y < TAM; y++) {
      for (let x = 0; x < TAM; x++) {
        const i = y * TAM + x;
        const h = reg.alturaTerreno[i];
        const umid = U.clamp01(chuvoso + (U.fbm(x / 26, y / 26, umiSeed, 4) - 0.5) * 0.9 - h * 0.012);
        reg.umidade[i] = umid;
        const t = tempIlha + U.fbm(x / 40, y / 40, s + 5, 3) * 4 - 2 - h * 0.62;
        reg.temperatura[i] = t;
        let bi;
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
        reg.tipo[i] = BIOMA_IDS.indexOf(bi);
        const def = D.BIOMAS[bi];
        reg.fertilidade[i] = U.clamp01(def.fertil * (0.6 + umid * 0.6));
      }
    }
    /* --- aplica rio e lagos por cima (tipo de terreno) --- */
    const rioIdx = BIOMA_IDS.indexOf('rio'), lagoIdx = BIOMA_IDS.indexOf('lago');
    for (let i = 0; i < rio.length; i++) {
      const rx = rio[i][0], ry = rio[i][1];
      const aplica = (x, y) => {
        if (x < 1 || y < 1 || x >= TAM - 1 || y >= TAM - 1) return;
        const j = y * TAM + x;
        if (reg.tipo[j] === BIOMA_IDS.indexOf('oceano')) return;
        reg.tipo[j] = rioIdx;
      };
      aplica(rx, ry);
      if (i % 4 === 0) { aplica(rx + 1, ry); aplica(rx, ry + 1); }
    }
    for (const l of lagos) {
      for (let y = l.y - l.r - 1; y <= l.y + l.r + 1; y++) for (let x = l.x - l.r - 1; x <= l.x + l.r + 1; x++) {
        if (x < 1 || y < 1 || x >= TAM - 1 || y >= TAM - 1) continue;
        if (U.dist(x, y, l.x, l.y) < l.r) reg.tipo[y * TAM + x] = lagoIdx;
      }
    }
    /* --- ESCAVA os leitos: água tem que estar ABAIXO do solo --- */
    reg.prof = new Float32Array(AREA);
    reg.aguaZ = new Float32Array(AREA);
    // rio: cava um canal de 0,45 m sobre o próprio leito
    for (let i = 0; i < rio.length; i++) {
      const rx = rio[i][0], ry = rio[i][1];
      const marca = (x, y) => {
        if (!tileValido(x, y)) return;
        const j = idx(x, y);
        if (reg.tipo[j] === BIOMA_IDS.indexOf('oceano')) return;
        const sup = reg.alturaTerreno[j];
        reg.alturaTerreno[j] = sup - 0.45;
        reg.prof[j] = 0.45;
        reg.aguaZ[j] = sup - 0.06;
      };
      marca(rx, ry);
      if (i % 4 === 0) { marca(rx + 1, ry); marca(rx, ry + 1); }
    }
    // lagos: cuba funda no centro, rasa na borda
    for (const l of lagos) {
      let mn = 1e9;
      for (let a = 0; a < 360; a += 15) {
        const x = Math.round(l.x + Math.cos(a * Math.PI / 180) * (l.r + 1.4));
        const y = Math.round(l.y + Math.sin(a * Math.PI / 180) * (l.r + 1.4));
        if (tileValido(x, y)) mn = Math.min(mn, reg.alturaTerreno[idx(x, y)]);
      }
      if (mn === 1e9) mn = reg.alturaTerreno[idx(Math.round(l.x), Math.round(l.y))];
      l.aguaZ = mn - 0.18;
      for (let y = Math.round(l.y - l.r - 1); y <= Math.round(l.y + l.r + 1); y++) {
        for (let x = Math.round(l.x - l.r - 1); x <= Math.round(l.x + l.r + 1); x++) {
          if (!tileValido(x, y)) continue;
          const d = U.dist(x, y, l.x, l.y);
          if (d >= l.r) continue;
          const j = idx(x, y);
          const prof = 0.5 + 1.5 * Math.pow(1 - d / l.r, 1.4);
          reg.alturaTerreno[j] = Math.min(reg.alturaTerreno[j], l.aguaZ - prof);
          reg.prof[j] = Math.max(reg.prof[j], l.aguaZ - reg.alturaTerreno[j]);
          reg.aguaZ[j] = l.aguaZ;
        }
      }
    }
    reg.rio = [];
    for (let i = 0; i < rio.length; i += 2) reg.rio.push({ x: rio[i][0], y: rio[i][1] });
    reg.lagos = lagos;
    m.planeta.regioes.push(reg);

    /* --- corpos d'água navegáveis (entidades) --- */
    const geraAgua = (x, y, tipo, r, nome, z) => {
      const j = idx(U.clamp(Math.round(x), 0, TAM - 1), U.clamp(Math.round(y), 0, TAM - 1));
      const sup = (z !== undefined) ? z : (reg.aguaZ && reg.aguaZ[j] ? reg.aguaZ[j] : reg.alturaTerreno[j] - 0.05);
      const w = { id: 'w' + (m.proxId++), classe: 'agua', tipo: tipo, nome: nome, pos: { x: x, y: y, z: sup }, z: sup, tamanho: r * 2, raio: r, cor: '#2e94bd', som: 'água', percepivel: true, nivel: 1, beberivel: true, vivo: true };
      m.aguas.push(w);
      m.entidades.push(w);
    };
    for (const l of lagos) geraAgua(l.x, l.y, 'lago', l.r, 'lago', l.aguaZ);
    for (let i = 0; i < reg.rio.length; i += 4) geraAgua(reg.rio[i].x, reg.rio[i].y, 'rio', 1.7, 'rio');
    /* poças de água doce para nascer o primeiro acampamento */
    if (reg.rio.length) geraAgua(reg.rio[0].x, reg.rio[0].y, 'rio', 2.2, 'nascente');
    return reg;
  }

  const regiaoAtiva = (m) => m.planeta.regioes[m.planeta.regiaoAtiva];
  const idx = (x, y) => (y | 0) * TAM + (x | 0);
  function tileValido(x, y) { return x >= 0 && y >= 0 && x < TAM && y < TAM; }
  function alturaEm(m, x, y) {
    if (!tileValido(x, y)) return -3;
    return regiaoAtiva(m).alturaTerreno[idx(x, y)];
  }
  function profundidadeEm(m, x, y) {
    if (!tileValido(x, y)) return 0;
    const r = regiaoAtiva(m);
    return r.prof ? r.prof[idx(x, y)] : 0;
  }
  function ehAguaDoce(m, x, y) {
    const b = biomaEm(m, x, y);
    return b === 'rio' || b === 'lago';
  }
  function biomaEm(m, x, y) {
    if (!tileValido(x, y)) return 'oceano';
    return BIOMA_IDS[regiaoAtiva(m).tipo[idx(x, y)]] || 'prado';
  }
  function biomaDef(m, x, y) { return D.BIOMAS[biomaEm(m, x, y)] || D.BIOMAS.prado; }
  function ehAgua(m, x, y) { return (biomaDef(m, x, y).agua === true); }

  /* ============================================================
     3. SPAWN DE VIDA
     ============================================================ */
  function criarPlanta(m, tipo, x, y, rng) {
    const def = D.FLORA[tipo];
    if (!def) return null;
    const h = alturaEm(m, x, y);
    if (h < 0.3) return null;
    const altura = rng.range(def.altura[0], def.altura[1]);
    const p = {
      id: 'p' + (m.proxId++), classe: 'planta', tipo: tipo, nome: def.nome,
      pos: { x: x, y: y, z: h }, altura: altura, tamanho: altura * 0.6,
      visual: tipo === 'arbusto_fruta' ? 'vis:fruta_baga' : (def.tipo === 'arvore' || def.tipo === 'conifera' || def.tipo === 'palmeira' ? 'vis:tronco' : 'vis:folha'),
      cor: def.corFlora || def.cor, corFruto: (D.ITENS[def.fruto] ? D.ITENS[def.fruto].cor : '#d4342a'),
      frutoTipo: def.fruto || null, frutos: 0, q: 1, crescimento: 1, idade: rng.range(0, 3000),
      tronco: def.tronco || 0.06, copa: def.copa ? rng.range(def.copa[0], def.copa[1]) : altura * 0.4, nFolhas: 0, folhasTotal: 0,
      plantaSemente: tipo === 'trigo_selvagem' || tipo === 'arbusto_fruta' || tipo === 'arvore_frutifera',
      recurso: def.colheita, recursoQtd: def.qtd, cortada: false, percepivel: true
    };
    if (def.tipo === 'arvore' || def.tipo === 'conifera' || def.tipo === 'palmeira' || def.tipo === 'arbusto') {
      p.nFolhas = rng.int(def.qtdFolhas[0], def.qtdFolhas[1]);
      p.folhasTotal = p.nFolhas;
      p.frutos = def.qtdFrutos ? rng.int(def.qtdFrutos[0], def.qtdFrutos[1]) : 0;
    }
    m.plantas.push(p); m.entidades.push(p);
    return p;
  }

  function semearVida(m) {
    const rng = m.rng.fork(7);
    const reg = regiaoAtiva(m);
    // plantas
    let tentativas = 0, alvo = 900;
    while (m.plantas.length < alvo && tentativas < alvo * 26) {
      tentativas++;
      const x = rng.int(2, TAM - 3), y = rng.int(2, TAM - 3);
      const def = D.BIOMAS[biomaEm(m, x, y)];
      if (!def || !def.flora || def.agua) continue;
      const veget = def.vegetacao;
      if (rng.next() > veget) continue;
      const tipos = def.flora.filter(t => D.FLORA[t] && D.FLORA[t].tipo !== 'rastreiro');
      if (!tipos.length) continue;
      const t = tipos[rng.int(0, tipos.length - 1)];
      // gramíneas aparecem em tufos
      if (D.FLORA[t].tipo === 'graminea' || D.FLORA[t].tipo === 'erva') {
        const n = rng.int(1, 3);
        for (let k = 0; k < n; k++) criarPlanta(m, t, x + rng.range(-1.5, 1.5), y + rng.range(-1.5, 1.5), rng);
      } else criarPlanta(m, t, x, y, rng);
    }
    // pedras soltas
    for (let i = 0; i < 220; i++) {
      const x = rng.int(2, TAM - 3), y = rng.int(2, TAM - 3);
      if (alturaEm(m, x, y) < 0.2) continue;
      criarObjeto(m, rng.chance(0.7) ? 'pedra' : 'pedra_lisa', x, y, rng);
    }
    // gravetos e folhas
    for (let i = 0; i < 320; i++) {
      const x = rng.int(2, TAM - 3), y = rng.int(2, TAM - 3);
      if (ehAgua(m, x, y)) continue;
      criarObjeto(m, rng.chance(0.5) ? 'graveto' : 'folha', x, y, rng);
    }
    // argila perto da água
    for (let i = 0; i < 90; i++) {
      const x = rng.int(2, TAM - 3), y = rng.int(2, TAM - 3);
      if (!ehAgua(m, x, y) && m.aguas.some(a => U.dist(a.pos.x, a.pos.y, x, y) < 8)) criarObjeto(m, 'argila', x, y, rng);
    }
    // fauna
    const N_ANIMAIS = 130;
    for (let i = 0; i < N_ANIMAIS; i++) {
      const x = rng.range(8, TAM - 8), y = rng.range(8, TAM - 8);
      const def = D.BIOMAS[biomaEm(m, x, y)];
      if (!def || !def.fauna || !def.fauna.length) continue;
      let esp = def.fauna[rng.int(0, def.fauna.length - 1)];
      if (!D.FAUNA[esp]) continue;
      if (!tileCombina(D.FAUNA[esp], m, x, y)) continue;
      criarAnimal(m, esp, x, y, rng);
    }
  }

  /* ============================================================
     4. FÁBRICAS DE ENTIDADES
     ============================================================ */
  function criarObjeto(m, tipo, x, y, rng, extras) {
    rng = rng || m.rng;
    const def = D.ITENS[tipo] || D.ITENS.pedra;
    const o = {
      id: 'o' + (m.proxId++), classe: 'objeto', tipo: tipo, nome: def.nome,
      pos: { x: x, y: y, z: alturaEm(m, x, y) + 0.06 },
      vz: 0, vx: 0, vy: 0, massa: def.massa, tamanho: U.clamp(0.08 + def.massa * 0.05, 0.08, 0.5),
      cor: def.cor, visual: def.comida ? ('vis:' + tipo) : (tipo === 'folha' ? 'vis:folha' : (tipo === 'graveto' ? 'vis:folha' : 'vis:pedra')),
      emRepouso: true, emVoo: false, empunhado: false, noChao: true,
      conteudo: def.recipiente ? { agua: 0 } : null,
      integridade: 1, qualidade: 0.8, dono: null, criadoEm: m.tempo.segMundo,
      percepivel: true, som: null, aceso: false
    };
    if (extras) Object.assign(o, extras);
    m.objetos.push(o); m.entidades.push(o);
    return o;
  }

  /* --- compatibilidade de bioma: peixe so na agua, bicho de terra so em terra --- */
  function tileCombina(def, m, x, y) {
    if (!def) return false;
    if (!(x >= 0 && y >= 0 && x < TAM && y < TAM)) return false;
    const agua = ehAgua(m, x, y);
    return def.peixe ? agua : !agua;
  }
  function acharTileValido(m, def, x, y) {
    if (tileCombina(def, m, x, y)) return { x: x, y: y };
    for (let r = 1; r <= 18; r++) {
      for (let k = 0; k < 12; k++) {
        const a = m.rng.range(0, U.PI2);
        const nx = U.clamp(x + Math.cos(a) * r, 1, TAM - 2);
        const ny = U.clamp(y + Math.sin(a) * r, 1, TAM - 2);
        if (tileCombina(def, m, nx, ny)) return { x: nx, y: ny };
      }
    }
    return null;
  }

  function criarAnimal(m, especie, x, y, rng) {
    rng = rng || m.rng;
    const def = D.FAUNA[especie];
    if (!def) return null;
    const _tv = acharTileValido(m, def, x, y);
    if (!_tv) return null;                 // sem tile compativel: nao existe
    x = _tv.x; y = _tv.y;
    const gene = {
      forca: U.clamp01(0.5 + rng.gauss(0, 0.18)), velocidade: U.clamp01(0.5 + rng.gauss(0, 0.18)),
      resistencia: U.clamp01(0.5 + rng.gauss(0, 0.18)), visao: U.clamp01(0.5 + rng.gauss(0, 0.2)),
      memoria: U.clamp01(0.5 + rng.gauss(0, 0.2)), percepcao: U.clamp01(0.5 + rng.gauss(0, 0.2)),
      curiosidade: U.clamp01(0.5 + rng.gauss(0, 0.2)), metabolismo: U.clamp01(0.5 + rng.gauss(0, 0.2)),
      longevidade: def.vidaAnos * U.clamp(0.7 + rng.next() * 0.6, 0.6, 1.4)
    };
    const an = {
      id: 'a' + (m.proxId++), classe: 'animal', especie: especie, nome: null,
      sexo: rng.chance(0.5) ? 'M' : 'F',
      pos: { x: x, y: y, z: alturaEm(m, x, y) + def.altura },
      dir: rng.range(0, U.PI2), tamanho: def.altura, altura: def.altura,
      cor: def.cor, som: def.som, percepivel: true, velocidadeAtual: 0,
      corpo: {
        energia: rng.range(55, 95), fome: rng.range(5, 45), sede: rng.range(5, 45),
        saude: 100, temperaturaCorp: U.clamp(30 + (def.massa > 100 ? 4 : 0), 12, 41),
        ferimentos: []
      },
      gene: gene, cerebro: null, vivo: true, idadeSeg: rng.range(0, def.maturidade * U.SEG_ANO * 2),
      acao: null, estado: 'vagueando', domesticado: 0, dono: null,
      gravida: 0, gestacao: 0, ultimoFilho: 0, presa: !!def.presa,
      fugindo: false, alvoId: null, atacou: 0, cor2: def.cor2
    };
    an.cerebro = { perceptos: [], tDecisao: 0, tPercepcao: 0, memoria: {}, medo: 0 };
    m.animais.push(an); m.entidades.push(an);
    return an;
  }

  function nomeHumano(m, sexo) {
    const lista = sexo === 'F' ? D.NOMES_F : D.NOMES_M;
    const n = sexo === 'F' ? m.proximoNomeF++ : m.proximoNomeM++;
    const base = lista[(n - 1) % lista.length];
    const ger = Math.floor((n - 1) / lista.length) % D.SUFIXOS_GERACAO.length;
    return base + D.SUFIXOS_GERACAO[ger];
  }

  function criarHumano(m, x, y, rng, opcoes) {
    rng = rng || m.rng;
    opcoes = opcoes || {};
    const sexo = opcoes.sexo || (rng.chance(0.5) ? 'M' : 'F');
    const gene = opcoes.gene || B.genomaAleatorio(rng);
    const idadeAnos = opcoes.idadeAnos !== undefined ? opcoes.idadeAnos : rng.range(16, 30);
    const npc = {
      id: 'n' + (m.proxId++), classe: 'humano', tipo: 'humano',
      nome: opcoes.nome || nomeHumano(m, sexo), sexo: sexo,
      pos: { x: x, y: y, z: alturaEm(m, x, y) + 0.9 },
      dir: rng.range(0, U.PI2), velocidadeAtual: 0, tamanho: 1.7,
      cor: '#e8b48a', som: 'voz', percepivel: true, vivo: true,
      gene: gene, idadeSeg: idadeAnos * U.SEG_ANO, nascimentoSeg: m.tempo.segMundo - idadeAnos * U.SEG_ANO,
      corpo: {
        energia: 100, fome: 12, sede: 12, sono: 15, saude: 100, temperaturaCorp: 36.5,
        hidratacao: 80, ferimentos: [], calorias: 0
      },
      caps: null, cerebro: null, inventario: [], maoDireita: null, maoEsquerda: null,
      acao: null, plano: null, planoIdx: 0, objetivo: 'ocioso',
      dormindo: false, gravida: 0, gestacao: 0, ultimoFilho: 0,
      pais: opcoes.pais || [], filhos: [], parceiro: null,
      fundador: !!opcoes.fundador, protegido: false,
      ultimoContatoSocial: m.tempo.segMundo, memorias: [], experiencias: {},
      causaMorte: null, morreuEm: null
    };
    npc.caps = B.capacidades(npc);
    npc.cerebro = B.novoCerebro(npc, m.rng, { lingua: opcoes.lingua || 0, geracao: opcoes.geracao || 0 });
    m.npcs.push(npc); m.entidades.push(npc);
    // roupa básica e conhecimento zero
    if (opcoes.fundador) {
      npc.cerebro.nivelLingua = opcoes.lingua !== undefined ? opcoes.lingua : 1;
    }
    return npc;
  }

  function criarFundadores(m) {
    const rng = m.rng.fork(99);
    const c = regiaoAtiva(m);
    // acha um lugar plano e perto de água
    let melhor = null, melhorNota = -1e9;
    for (let t = 0; t < 4000; t++) {
      const x = rng.range(30, TAM - 30), y = rng.range(30, TAM - 30);
      const h = alturaEm(m, x, y);
      if (h < 1.2 || h > 12) continue;
      if (ehAgua(m, x, y)) continue;
      const dAgua = m.aguas.reduce((mn, a) => Math.min(mn, U.dist(a.pos.x, a.pos.y, x, y)), 999);
      if (dAgua > 45) continue;
      const decl = Math.abs(alturaEm(m, x + 1, y) - h) + Math.abs(alturaEm(m, x, y + 1) - h);
      const nota = -decl * 6 - dAgua * 0.25 + (rng.next() * 3);
      if (nota > melhorNota) { melhorNota = nota; melhor = { x: x, y: y }; }
    }
    if (!melhor) melhor = { x: TAM / 2, y: TAM / 2 };
    const adao = criarHumano(m, melhor.x, melhor.y, rng, { nome: 'Adão', sexo: 'M', idadeAnos: 22, fundador: true, lingua: 1 });
    const eva = criarHumano(m, melhor.x + 3, melhor.y + 2, rng, { nome: 'Eva', sexo: 'F', idadeAnos: 21, fundador: true, lingua: 1 });
    adao.parceiro = eva.id; eva.parceiro = adao.id;
    adao.cerebro.conhecimento['c:proprio_nome'] = { conf: 0.6, n: 1, fonte: 'inato', t: 0, tags: {} };
    eva.cerebro.conhecimento['c:proprio_nome'] = { conf: 0.6, n: 1, fonte: 'inato', t: 0, tags: {} };
    B.registrarSocial(adao.cerebro, eva, m, 0.5);
    B.registrarSocial(eva.cerebro, adao, m, 0.5);
    m.centro = melhor;
    m.registrar('🌟 Adão e Eva foram colocados na Ilha Gênesis.', 'marco');
  }

  /* ============================================================
     5. GRADE ESPACIAL
     ============================================================ */
  function reconstruirGrade(m) {
    const g = new Map();
    const put = (e) => {
      if (!e.percepivel) return;
      const cx = Math.floor(e.pos.x / CELULA), cy = Math.floor(e.pos.y / CELULA);
      const k = cx + ':' + cy;
      let cell = g.get(k);
      if (!cell) { cell = []; g.set(k, cell); }
      cell.push(e);
    };
    for (const e of m.entidades) put(e);
    m.grade = g;
  }
  function proximos(m, x, y, raio, excluir) {
    const g = m.grade;
    if (!g) return [];
    const out = [];
    const c0x = Math.floor((x - raio) / CELULA), c1x = Math.floor((x + raio) / CELULA);
    const c0y = Math.floor((y - raio) / CELULA), c1y = Math.floor((y + raio) / CELULA);
    const r2 = raio * raio;
    for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) {
      const cell = g.get(cx + ':' + cy);
      if (!cell) continue;
      for (const e of cell) {
        if (e === excluir || e.vivo === false) continue;
        const dx = e.pos.x - x, dy = e.pos.y - y;
        if (dx * dx + dy * dy <= r2) out.push(e);
      }
    }
    return out;
  }
  function porId(m, id) {
    for (const arr of [m.npcs, m.animais, m.objetos, m.plantas, m.construcoes, m.aguas, m.fogos, m.plantacoes]) {
      for (const e of arr) if (e.id === id) return e;
    }
    for (const e of m.mortos) if (e.id === id) return e;
    return null;
  }

  /* ============================================================
     6. OCLUSÃO DE VISÃO (eles só veem o que está à vista)
     ============================================================ */
  function segCirculo(x1, y1, x2, y2, cx, cy, r) {
    const dx = x2 - x1, dy = y2 - y1;
    const fx = x1 - cx, fy = y1 - cy;
    const a = dx * dx + dy * dy;
    if (a < 1e-9) return false;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - r * r;
    let disc = b * b - 4 * a * c;
    if (disc < 0) return false;
    disc = Math.sqrt(disc);
    const t1 = (-b - disc) / (2 * a), t2 = (-b + disc) / (2 * a);
    return (t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1) || (t1 < 0 && t2 > 1);
  }
  function temVisaoLivre(m, x1, y1, x2, y2, alvo) {
    const d = U.dist(x1, y1, x2, y2);
    if (d < 1.6) return true;
    const meios = proximos(m, (x1 + x2) / 2, (y1 + y2) / 2, d * 0.5 + 2, alvo);
    for (const e of meios) {
      if (e === alvo) continue;
      if (e.classe === 'planta' && e.altura > 1.0) {
        if (segCirculo(x1, y1, x2, y2, e.pos.x, e.pos.y, Math.max(0.15, e.tronco))) return false;
      } else if (e.classe === 'construcao' && e.abrigo > 0.5) {
        if (segCirculo(x1, y1, x2, y2, e.pos.x, e.pos.y, (e.largura || 3) * 0.5)) return false;
      }
    }
    const passo = 1.2;
    const passos = Math.min(10, Math.ceil(d / 3));
    for (let i = 1; i < passos; i++) {
      const t = i / passos;
      const px = x1 + (x2 - x1) * t, py = y1 + (y2 - y1) * t;
      if (alturaEm(m, px, py) > 3.0 && alturaEm(m, px, py) - Math.max(alturaEm(m, x1, y1), alturaEm(m, x2, y2)) > 2.2) return false;
    }
    return true;
  }

  /* ============================================================
     7. TEMPO, LUZ E CLIMA
     ============================================================ */
  function luzNoite(m) {
    const t = U.decomporTempo(m.tempo.segMundo);
    const h = t.hora + t.min / 60;
    let luz;
    if (h < 5 || h > 20) luz = 0;
    else if (h < 7) luz = (h - 5) / 2;
    else if (h < 18) luz = 1;
    else luz = 1 - (h - 18) / 2;
    const def = D.CLIMAS[m.clima.tipo] || D.CLIMAS.sol;
    luz *= U.clamp(def.luz, 0.2, 1.2);
    return U.clamp01(1 - luz);
  }
  function climaAtual(m) {
    const base = D.CLIMAS[m.clima.tipo] || D.CLIMAS.sol;
    return {
      tipo: m.clima.tipo, nome: base.nome, emoji: base.emoji,
      luz: base.luz, chuva: base.chuva * m.clima.intensidade, vento: U.clamp(base.vento * m.clima.intensidade, 0, 5),
      temp: base.temp + m.clima.tempExtra, visao: base.visao || 1, frio: base.frio || 0, quente: base.quente || 0,
      raios: base.raios || 0, dano: base.dano || 0, forca: m.clima.intensidade
    };
  }
  function tempAmbiente(m, x, y) {
    const t = U.decomporTempo(m.tempo.segMundo);
    const est = U.estacao(t.diaDoAno);
    const estTemp = [-1, 6, 1, -7][est];
    const hora = t.hora + t.min / 60;
    const ciclo = -Math.cos((hora - 4) / 24 * U.PI2) * 5.5;
    const reg = regiaoAtiva(m);
    const b = reg.temperatura[idx(U.clamp(x | 0, 0, TAM - 1), U.clamp(y | 0, 0, TAM - 1))] || 20;
    const ce = climaAtual(m);
    return b * 0.55 + estTemp + ciclo + ce.temp + 8 + (luzNoite(m) * -3);
  }

  /* ============================================================
     8. FÍSICA DOS OBJETOS
     ============================================================ */
  /* objetos a menos de 55 m da camera ganham fisica REAL mesmo em tempo rapido:
     e isso que faz a fruta cair, quicar e a folha voar com o vento. */
  /* --- um bicho de terra nao pode ACABAR dentro da agua (empurrao, fuga, nado errado) --- */
  function corrigirLocomocao(m, a) {
    const def = D.FAUNA[a.especie];
    if (!def) return;
    const reg = regiaoAtiva(m);
    const i = U.clamp(a.pos.y | 0, 0, TAM - 1) * TAM + U.clamp(a.pos.x | 0, 0, TAM - 1);
    const naAgua = reg.prof[i] > 0.02;
    if (!!def.peixe === naAgua) return;
    const alvo = acharTileValido(m, def, a.pos.x, a.pos.y);
    if (alvo) { a.pos.x = alvo.x; a.pos.y = alvo.y; a.pos.z = alturaEm(m, alvo.x, alvo.y) + (def.altura || 0); }
  }

  function simViva(m, o) {
    const c = m.cameraAlvo;
    if (!c) return false;
    const dx = o.pos.x - c.x, dy = o.pos.y - c.y;
    return dx * dx + dy * dy < 55 * 55;
  }

  function fisicaObjetos(m, dt, modoRapido) {
    const ce = climaAtual(m);
    const vento = ce.vento;
    const ventoAng = Math.atan2(m.clima.vento.y, m.clima.vento.x);
    for (const o of m.objetos) {
      if (o.empunhado) continue;
      if (o.emRepouso) {                       // parado no chao: so o vento mexe
        if (o.massa < 0.4 && vento > 0.4) {
          o.pos.x += Math.cos(ventoAng) * vento * 0.25 * dt;
          o.pos.y += Math.sin(ventoAng) * vento * 0.25 * dt;
          o.pos.x = U.clamp(o.pos.x, 1, TAM - 2); o.pos.y = U.clamp(o.pos.y, 1, TAM - 2);
        }
        continue;
      }
      const chao = alturaEm(m, o.pos.x, o.pos.y);
      const leve = o.massa < 0.4;
      if (leve && vento > 0.4 && (!modoRapido || simViva(m, o))) {           // vento move folhas
        o.pos.x += Math.cos(ventoAng) * vento * 0.25 * dt;
        o.pos.y += Math.sin(ventoAng) * vento * 0.25 * dt;
        if (!tileValido(o.pos.x, o.pos.y)) { o.pos.x = U.clamp(o.pos.x, 1, TAM - 2); o.pos.y = U.clamp(o.pos.y, 1, TAM - 2); }
      }
      if ((!modoRapido || simViva(m, o)) && (o.vz !== 0 || o.pos.z > chao + 0.02)) {
        o.vz -= G * dt;
        o.pos.z += o.vz * dt;
        o.vx *= (1 - 1.4 * dt); o.vy *= (1 - 1.4 * dt);
        o.pos.x += o.vx * dt; o.pos.y += o.vy * dt;
        if (o.pos.z <= chao) {
          o.pos.z = chao + 0.03;
          if (Math.abs(o.vz) > 1.2) { o.vz = -o.vz * 0.28; o.vx *= 0.5; o.vy *= 0.5; }
          else { o.vz = 0; o.vx = 0; o.vy = 0; o.emRepouso = true; o.emVoo = false; o.noChao = true; }
        }
      } else {
        o.pos.z = chao + 0.03;
        o.emRepouso = true; o.emVoo = false;
      }
      // água derrama de recipiente derrubado
      if (o.conteudo && o.conteudo.agua > 0 && o.derramando) {
        const reg = regiaoAtiva(m);
        const i = idx(U.clamp(o.pos.x | 0, 0, TAM - 1), U.clamp(o.pos.y | 0, 0, TAM - 1));
        reg.umidade[i] = U.clamp01(reg.umidade[i] + 0.05);
        o.conteudo.agua = Math.max(0, o.conteudo.agua - 0.3 * dt);
        if (o.conteudo.agua <= 0) o.derramando = false;
      }
    }
  }

  function arremessar(m, quem, obj, alvo, forca) {
    const dx = alvo.pos.x - quem.pos.x, dy = alvo.pos.y - quem.pos.y;
    const d = Math.max(0.5, Math.hypot(dx, dy));
    const altAlvo = (alvo.pos.z || 0) + (alvo.tamanho || 1) * 0.5;
    const dz = altAlvo - (quem.pos.z + 1.2);
    const f = U.clamp(forca || 1, 0.2, 2);
    const v = Math.sqrt(Math.max(1, G * (d + 2))) * 1.05 * f;
    obj.emVoo = true; obj.emRepouso = false; obj.vz = 0;
    obj.vx = (dx / d) * v * 0.55;
    obj.vy = (dy / d) * v * 0.55;
    obj.vz = (d * G) / (v * 0.8) + dz * 0.6;
    obj.alvoVoo = alvo.id;
    obj.tirouDe = quem.id;
    return true;
  }

  /* ============================================================
     9. STEP DO MUNDO
     ============================================================ */
  function tick(m, dtReal) {
    dtReal = U.clamp(dtReal, 0, 0.5);
    m.realDecorrido += dtReal;
    const escala = m.tempo.escala;
    let dtMundo = escala * dtReal;
    if (dtMundo <= 0) return;
    // Nenhum passo de simulacao passa de ~1 minuto de mundo. Com passos
    // grandes (tempo acelerado) o movimento "fura" a checagem de obstaculo
    // e o NPC trava de vez: era isso que matava os fundadores de sede.
    // O passo interno NUNCA deve passar de ~1 min de mundo. Antes havia um
    // teto de 40 passos, entao com aceleracao alta (escala 21600 x 0,5 s)
    // dtPasso subia para 270 s e o destino do mundo passava a depender da
    // posicao do controle de velocidade: mesma seed sobrevivia ou morria.
    const PASSO_MAX = 60, PASSOS_MAX = 240;
    let passos = 1, dtPasso = dtMundo;
    if (dtMundo > PASSO_MAX) {
      passos = Math.min(PASSOS_MAX, Math.max(2, Math.ceil(dtMundo / PASSO_MAX)));
      dtPasso = dtMundo / passos;
    }
    // decidido pelo tempo de MUNDO, nao por dtPasso: antes um ruido de ponto
    // flutuante em escala*dtReal alternava entre modo lento e rapido.
    const modoRapido = dtMundo > 40;
    for (let i = 0; i < passos; i++) passoMundo(m, dtPasso, modoRapido);
    m.tempo.realDecorridoGuardado = (m.tempo.realDecorridoGuardado || 0) + dtReal;
  }

  function passoMundo(m, dt, modoRapido) {
    m.tempo.segMundo += dt;
    m.tempo.tick++;
    if (m.tempo.tick % 20 === 0) reconstruirGrade(m);

    atualizarClima(m, dt);
    // pessoas
    for (const n of m.npcs) {
      if (!n.vivo) continue;
      if (modoRapido) {
        // em modo acelerado o corpo envelhece e as necessidades correm
        simularCorpoRapido(m, n, dt);
        B.passo(n, m, dt);
        executarAcao(m, n, dt, true);
      } else {
        simularCorpo(m, n, dt);
        B.passo(n, m, dt);
        executarAcao(m, n, dt, false);
      }
      checarMorte(m, n);
    }
    // animais (no modo acelerado o cérebro roda em fatias para não travar)
    const fatia = modoRapido ? (m.tempo.tick % 5) : -1;
    for (let ia = 0; ia < m.animais.length; ia++) {
      const a = m.animais[ia];
      if (!a.vivo) continue;
      simularCorpoAnimal(m, a, dt);
      if (!modoRapido || (ia % 5) === fatia) {
        B.passoAnimal(a, m, dt);
        if (m.tempo.tick % 20 === 0) corrigirLocomocao(m, a);   // terrestre nunca fica na agua
      }
      executarAcaoAnimal(m, a, dt);
      checarMorteAnimal(m, a);
    }
    // fisiologia de plantas e objetos
    if (!modoRapido || m.tempo.tick % 4 === 0) atualizarPlantas(m, modoRapido ? dt * 4 : dt);
    fisicaObjetos(m, modoRapido ? Math.min(dt, 0.05) : dt, modoRapido);   // passo curto: nada explode
    atualizarFogo(m, dt);
    atualizarPlantacoes(m, dt);
    atualizarConstrucoes(m, dt);
    // chuva molha o solo
    const ce = climaAtual(m);
    if (ce.chuva > 0) {
      const reg = regiaoAtiva(m);
      const passo = Math.min(0.0006 * ce.chuva * dt, 0.03);
      if (m.tempo.tick % 5 === 0) {
        const s = m.rng.int(0, AREA - 1);
        for (let k = 0; k < 40; k++) {
          const i = (s + k * 977) % AREA;
          reg.umidade[i] = U.clamp01(reg.umidade[i] + passo * 40);
        }
      }
    }
    // limpeza
    if (m.tempo.tick % 400 === 0) limpar(m);
  }

  function limpar(m) {
    // remove objetos em excesso (os mais antigos e sem valor)
    const max = 2600;
    if (m.objetos.length > max) {
      m.objetos.sort((a, b) => (a.criadoEm || 0) - (b.criadoEm || 0));
      const remover = [];
      for (const o of m.objetos) {
        if (m.objetos.length - remover.length <= max) break;
        if (o.empunhado) continue;                 // nunca apaga o que está na mão
        remover.push(o);
      }
      for (const o of remover) { const i = m.objetos.indexOf(o); if (i >= 0) m.objetos.splice(i, 1); }
      const set = new Set(remover);
      m.entidades = m.entidades.filter(e => !set.has(e));
    }
    m.npcs = m.npcs.filter(n => n.vivo);
    m.animais = m.animais.filter(a => a.vivo);
  }

  function atualizarClima(m, dt) {
    const c = m.clima;
    c.transicao -= dt / U.SEG_DIA;
    if (c.transicao <= 0) {
      c.transicao = m.rng.range(0.4, 2.6);   // dias
      if (!c.forcado) {
        const t = U.decomporTempo(m.tempo.segMundo);
        const est = U.estacao(t.diaDoAno);
        const pool = est === 3 ? ['neve', 'nevasca', 'nublado', 'neblina', 'sol', 'chuva']
          : est === 1 ? ['sol', 'sol', 'nublado', 'chuva', 'tempestade', 'seca']
            : est === 2 ? ['nublado', 'chuva', 'vendaval', 'neblina', 'sol', 'tempestade']
              : ['sol', 'chuva', 'chuva', 'nublado', 'tempestade', 'neblina'];
        c.tipo = pool[m.rng.int(0, pool.length - 1)];
        c.intensidade = m.rng.range(0.6, 1.25);
      } else {
        c.forcado = false;
      }
      const ang = m.rng.range(0, U.PI2);
      c.vento = { x: Math.cos(ang), y: Math.sin(ang) };
    }
    c.vento.x += m.rng.range(-0.02, 0.02); c.vento.y += m.rng.range(-0.02, 0.02);
    const nv = Math.hypot(c.vento.x, c.vento.y) || 1;
    c.vento.x /= nv; c.vento.y /= nv;
  }

  function definirClima(m, tipo, intensidade) {
    if (!D.CLIMAS[tipo]) return false;
    m.clima.tipo = tipo; m.clima.intensidade = intensidade || 1;
    m.clima.forcado = true; m.clima.transicao = 3;
    m.registrar((D.CLIMAS[tipo].emoji || '') + ' O céu muda: ' + D.CLIMAS[tipo].nome + '.', 'clima');
    return true;
  }

  /* ============================================================
     10. CORPO HUMANO (fome, sede, sono, temperatura, doença)
     ============================================================ */
  function simularCorpo(m, n, dt) {
    const c = n.corpo, caps = n.caps, g = n.gene;
    const horas = dt / 3600;
    const fatorMetab = g.metabolismo * (n.dormindo ? 0.55 : 1) * (1 + (n.gravida > 0 ? 0.2 : 0));
    c.fome = U.clamp(c.fome + horas * FIS.fomePorHora * fatorMetab, 0, 100);
    c.sede = U.clamp(c.sede + horas * FIS.sedePorHora * fatorMetab, 0, 100);
    if (!n.dormindo) c.sono = U.clamp(c.sono + horas * 3.1, 0, 100);
    else c.sono = U.clamp(c.sono - horas * 9, 0, 100);
    // temperatura corporal busca o ambiente
    const amb = tempAmbiente(m, n.pos.x, n.pos.y);
    const abrigado = n.emAbrigo ? 0.55 : 0;
    const alvo = 36.5 - U.clamp((amb - 22) * 0.06, -1.2, 1.2) * (1 - abrigado) - (amb < 8 ? (8 - amb) * 0.06 * (1 - abrigado) : 0);
    c.temperaturaCorp = U.lerp(c.temperaturaCorp, alvo, U.clamp01(dt / 900));
    // fome/sede viram dano
    if (c.fome >= FIS.danoFomeLimiar) c.saude -= dt / 3600 * ((c.fome - FIS.danoFomeLimiar) / 20) * FIS.danoFomeMax;
    if (c.sede >= FIS.danoSedeLimiar) c.saude -= dt / 3600 * ((c.sede - FIS.danoSedeLimiar) / 20) * FIS.danoSedeMax;
    if (c.temperaturaCorp < 32) c.saude -= dt / 3600 * (32 - c.temperaturaCorp) * 1.6;
    if (c.temperaturaCorp > 40.5) c.saude -= dt / 3600 * 3;
    // recuperação
    const bemAlimentado = c.fome < 55 && c.sede < 55 && c.temperaturaCorp > 34 && c.temperaturaCorp < 39 && !c.ferimentos.length;
    if (bemAlimentado) {
      c.saude = U.clamp(c.saude + dt / 3600 * FIS.curaPorHora, 0, 100);
      c.energia = U.clamp(c.energia + dt / 3600 * (n.dormindo ? FIS.energiaBemDormindo : FIS.energiaBem), 0, 100);
    } else if (c.saude > 25) {
      // faminto ou ferido nao congela: dormir ainda devolve um resto de energia
      c.energia = U.clamp(c.energia + dt / 3600 * (n.dormindo ? FIS.energiaFamintoDormindo : -FIS.energiaPerdeFaminto), 0, 100);
    } else {
      c.energia = U.clamp(c.energia - dt / 3600 * FIS.energiaPerdeCritico, 0, 100);
    }
    c.energia = U.clamp(c.energia, 0, 100);
    // ferimentos cicatrizam
    for (let i = c.ferimentos.length - 1; i >= 0; i--) {
      const f = c.ferimentos[i];
      f.t = (f.t || 0) + dt;
      if (f.t > 86400 * 2) c.ferimentos.splice(i, 1);
    }
    if (c.saude > 30) {
      // cura lenta
      c.saude = Math.min(100, c.saude + dt / U.SEG_DIA * 0.6);
    }
    // gravidez
    if (n.gravida > 0) {
      n.gravida -= dt;
      if (n.gravida <= 0) nascer(m, n);
    }
    // sede/fome crítica gera evento
    if (c.sede > 92 && !n.avisoSede) { n.avisoSede = true; m.registrar('💧 ' + n.nome + ' está morrendo de sede.', 'aviso'); }
    if (c.fome > 92 && !n.avisoFome) { n.avisoFome = true; m.registrar('🍖 ' + n.nome + ' está morrendo de fome.', 'aviso'); }
    if (c.sede < 70) n.avisoSede = false;
    if (c.fome < 70) n.avisoFome = false;
  }

  function simularCorpoRapido(m, n, dt) {
    // O corpo avanca em fatias de no maximo 30 min: cada fatia passa pelo
    // MESMO metabolismo do modo normal, entao nada e contado duas vezes
    // (antes a fome subia ~2x e a gravidez era descontada em dobro).
    let resta = dt, guarda = 0;
    while (resta > 1e-4 && guarda++ < 60) {
      const passo = Math.min(resta, 1800);
      simularCorpo(m, n, passo);
      resta -= passo;
    }
    idadePasso(m, n, dt);
  }
  function idadePasso(m, n, dt) {
    n.idadeSeg += dt;
  }

  function simularCorpoAnimal(m, a, dt) {
    const def = D.FAUNA[a.especie];
    const horas = dt / 3600;
    a.corpo.fome = U.clamp(a.corpo.fome + horas * (2.6 - (def.massa > 200 ? 0.8 : 0)), 0, 100);
    const aquatico = def.nado ? 1 : 0;
    if (aquatico) a.corpo.sede = U.clamp(a.corpo.sede - horas * 90, 0, 100);
    else a.corpo.sede = U.clamp(a.corpo.sede + horas * (def.classe === 'herbivoro' ? 2.1 : 2.7), 0, 100);
    a.idadeSeg += dt;
    a.velocidadeAtual = U.lerp(a.velocidadeAtual, 0, U.clamp01(dt * 3));
    if (a.corpo.fome >= 85) a.corpo.saude -= horas * ((a.corpo.fome - 85) / 15) * 1.8;
    if (a.corpo.sede >= 99) a.corpo.saude -= horas * 4;
    const anos = U.idadeAnos(a.idadeSeg);
    if (anos > def.vidaAnos * 0.85) a.corpo.saude -= horas * 0.6;
    if (a.gravida > 0) { a.gravida -= dt; if (a.gravida <= 0) nascerAnimal(m, a); }
  }

  /* ============================================================
     11. PLANTAS, FOGO E PLANTAÇÕES
     ============================================================ */
  function atualizarPlantas(m, dt) {
    const ce = climaAtual(m);
    const dias = dt / U.SEG_DIA;

    /* --- frutas maduras caem sozinhas: a floresta alimenta quem cata do chão --- */
    let cair = 9 * dias;
    while (cair > 0) {
      if (cair >= 1 || m.rng.chance(cair)) {
        const pc = m.plantas[m.rng.int(0, m.plantas.length - 1)];
        if (pc && !pc.cortada && pc.frutos > 0 && (pc.altura || 0) > 1.4 && pc.frutoTipo) {
          pc.frutos--;
          const o = criarObjeto(m, pc.frutoTipo, pc.pos.x + m.rng.range(-1.4, 1.4), pc.pos.y + m.rng.range(-1.4, 1.4), m.rng,
            { pos: { x: pc.pos.x, y: pc.pos.y, z: pc.pos.z + (pc.altura || 2) * 0.85 } });
          o.tamanho = (D.FLORA[pc.tipo] && D.FLORA[pc.tipo].frutoTam) || 0.12;
          o.visual = 'vis:' + pc.frutoTipo;
          o.caiu = true;
          o.frescor = 1;
        }
      }
      cair -= 1;
    }
    for (const p of m.plantas) {
      if (p.cortada) continue;
      const def = D.FLORA[p.tipo];
      p.idade += dt;
      const i = idx(U.clamp(p.pos.x | 0, 0, TAM - 1), U.clamp(p.pos.y | 0, 0, TAM - 1));
      const umid = regiaoAtiva(m).umidade[i];
      const cresc = 0.00004 * dias * (0.4 + umid) * (1 + (m.tempo.tick % 7 === 0 ? 0.05 : 0));
      p.q = U.clamp01(p.q + cresc * (def.qtdFrutos ? 1 : 0.4));
      p.crescimento = U.clamp01(p.crescimento + cresc);
      if (def.qtdFrutos) {
        if (p.frutos < def.qtdFrutos[1] && p.q > 0.55 && m.rng.chance(0.02 + dias)) {
          p.frutos++;
          if (m.rng.chance(0.5) && p.nFolhas < def.qtdFolhas[1]) p.nFolhas++;
        }
        if (p.frutos > 0 && m.rng.chance(0.004 * dias * 24)) {   // fruta cai sozinha
          p.frutos--;
          const f = criarObjeto(m, def.fruto, p.pos.x + m.rng.range(-1, 1), p.pos.y + m.rng.range(-1, 1), m.rng, { pos: { x: p.pos.x, y: p.pos.y, z: (p.pos.z || 0) + p.altura * 0.8 }, vz: -0.2, emRepouso: false });
        }
        if (D.ITENS.folha && m.objetos.length < 2400 && m.rng.chance(0.05 * dias)) {   // folhas caem
          const fx = p.pos.x + m.rng.range(-1.8, 1.8), fy = p.pos.y + m.rng.range(-1.8, 1.8);
          const fz = (p.pos.z || 0) + (p.altura || 1.5) * 0.75;
          criarObjeto(m, 'folha', fx, fy, m.rng, { pos: { x: fx, y: fy, z: fz }, vz: -0.12, emRepouso: false });
        }
      }
      // seca mata
      if (ce.tipo === 'seca' && m.rng.chance(0.0004 * dias * 24)) p.q = U.clamp01(p.q - 0.1);
      if (p.q <= 0.02 && def.qtdFolhas) { p.saude = 0; }
    }
  }

  function atualizarFogo(m, dt) {
    for (let i = m.fogos.length - 1; i >= 0; i--) {
      const f = m.fogos[i];
      f.combustivel -= dt / 3600 * 1.1 * (m.clima.tipo === 'chuva' || m.clima.tipo === 'tempestade' ? 3.2 : 1);
      f.tamanho = 0.6 + Math.sin(m.tempo.segMundo / 3) * 0.08 + (f.combustivel > 30 ? 0.3 : 0);
      const ce = climaAtual(m);
      if (ce.chuva > 0.5 && m.rng.chance(0.002 * (dt / 60))) f.combustivel -= 5;
      if (f.combustivel <= 0) {
        m.registrar('🪵 Uma fogueira apagou.', 'clima');
        m.fogos.splice(i, 1);
        m.entidades = m.entidades.filter(e => e !== f);
      }
    }
  }

  function atualizarPlantacoes(m, dt) {
    for (const p of m.plantacoes) {
      p.crescimento += dt / (60 * U.SEG_DIA) * (0.5 + regiaoAtiva(m).umidade[idx(U.clamp(p.pos.x | 0, 0, TAM - 1), U.clamp(p.pos.y | 0, 0, TAM - 1))]);
      if (p.crescimento >= 1 && !p.madura) { p.madura = true; p.frutos = m.rng.int(3, 8); }
      if (p.madura && p.frutos < 12 && m.rng.chance(dt / U.SEG_DIA * 0.4)) p.frutos++;
    }
  }

  /* ============================================================
     12. MORTE
     ============================================================ */
  function registrarMorte(m, n, causa) {
    n.vivo = false; n.causaMorte = causa; n.morreuEm = m.tempo.segMundo;
    m.contadores.mortes[causa] = (m.contadores.mortes[causa] || 0) + 1;
    const causaTxt = { velhice: 'de velhice', fome: 'de fome', sede: 'de sede', frio: 'de frio', ferimentos: 'dos ferimentos', doenca: 'de doença', predador: 'atacado', afogamento: 'afogado', queda: 'de uma queda', parto: 'no parto', acidente: 'num acidente', veneno: 'envenenado' }[causa] || 'de causas desconhecidas';
    m.registrar('💀 ' + n.nome + ' morreu ' + causaTxt + ' — ' + Math.floor(U.idadeAnos(n.idadeSeg)) + ' anos.', 'morte');
    // solta o inventário
    for (const it of n.inventario || []) {
      const o = criarObjeto(m, it.tipo, n.pos.x + m.rng.range(-0.8, 0.8), n.pos.y + m.rng.range(-0.8, 0.8), m.rng);
      o.conteudo = it.conteudo || o.conteudo;
      o.qualidade = it.qualidade || 0.8;
    }
    n.inventario = [];
    if (n.cerebro) {
      n.cerebro.episodica.length = 0;
      for (const outro of m.npcs) {
        if (outro === n || !outro.vivo) continue;
        const rel = outro.cerebro.social[n.id];
        if (rel && rel.afeicao > 0.3) B.aprender(outro, { tipo: 'perdeu', quem: n.id }, m);
      }
    }
    // conhecimento de morte
    for (const outro of m.npcs) if (outro.vivo && outro.cerebro.conhecimento['c:morte']) B.reforcar(outro.cerebro, 'c:morte', 0.85, 0.5, 'experiencia', null, m);
    m.mortos.push({
      id: n.id, nome: n.nome, sexo: n.sexo, gene: n.gene, idadeSeg: n.idadeSeg,
      nascimentoSeg: n.nascimentoSeg, causaMorte: causa, morreuEm: m.tempo.segMundo,
      pos: { x: n.pos.x, y: n.pos.y }, cerebro: { nivelLingua: n.cerebro ? n.cerebro.nivelLingua : 0, geracao: n.cerebro ? n.cerebro.geracao : 0, feito: n.cerebro ? n.cerebro.feito : {}, conhecimento: n.cerebro ? Object.keys(n.cerebro.conhecimento).length : 0 }
    });
    if (m.mortos.length > 400) m.mortos.shift();
    return true;
  }

  function checarMorte(m, n) {
    const c = n.corpo;
    if (!n.vivo) return;
    if (c.saude <= 0) {
      // autopsia: a causa e o fator dominante real, nao um rotulo de conveniencia
      const cand = [
        { k: 'sede', v: c.sede >= 85 ? c.sede : 0 },
        { k: 'fome', v: c.fome >= 85 ? c.fome : 0 },
        { k: 'ferimentos', v: c.ferimentos.length ? 100 + c.ferimentos.length : 0 },
        { k: 'frio', v: c.temperaturaCorp < 32 ? (32 - c.temperaturaCorp) * 20 : 0 },
        { k: 'calor', v: c.temperaturaCorp > 40.5 ? (c.temperaturaCorp - 40.5) * 20 : 0 },
        { k: 'exaustao', v: c.energia < 8 ? 50 : 0 },
        { k: 'infeccao', v: 10 }
      ].sort((x, y) => y.v - x.v);
      return registrarMorte(m, n, cand[0].v > 0 ? cand[0].k : 'causas naturais');
    }
    const anos = U.idadeAnos(n.idadeSeg);
    const limite = n.gene.longevidade;
    if (anos > limite * 0.7) {
      const excesso = (anos - limite * 0.7) / Math.max(1, limite * 0.3);
      const risco = Math.pow(excesso, 3.2) * 0.00009 * (m.tempo.tick % 10 === 0 ? 10 : 0) * (c.saude < 60 ? 2.2 : 1);
      if (m.rng.chance(risco)) {
        if (c.saude > 25) c.saude -= 22;
        else return registrarMorte(m, n, 'velhice');
      }
      // senescência visível: capacidades caindo afetam a vida diária
      if (m.tempo.tick % 600 === 0) n.caps = B.capacidades(n);
    }
  }

  function checarMorteAnimal(m, a) {
    if (!a.vivo) return;
    if (a.corpo.saude <= 0) {
      a.vivo = false;
      const def = D.FAUNA[a.especie];
      const carne = Math.max(1, Math.round(def.massa * 0.4));
      m.registrar('🦴 Um ' + def.nome.toLowerCase() + ' morreu.', 'fauna');
      for (let i = 0; i < Math.min(4, Math.ceil(carne / 12)); i++) {
        criarObjeto(m, def.massa > 60 ? 'carne' : 'carne', a.pos.x + m.rng.range(-1, 1), a.pos.y + m.rng.range(-1, 1), m.rng);
      }
      if (def.massa > 20) criarObjeto(m, 'pele', a.pos.x + m.rng.range(-1, 1), a.pos.y + m.rng.range(-1, 1), m.rng);
      if (def.massa > 100) criarObjeto(m, 'osso', a.pos.x + m.rng.range(-1, 1), a.pos.y + m.rng.range(-1, 1), m.rng);
      m.animais = m.animais.filter(x => x !== a);
      m.entidades = m.entidades.filter(e => e !== a);
    }
  }

  /* ============================================================
     13. REGISTRO / EVENTOS
     ============================================================ */
  function registrar(m, texto, tipo) {
    m.eventos.push({ t: m.tempo.segMundo, texto: texto, tipo: tipo || 'info' });
    if (m.eventos.length > 400) m.eventos.shift();
  }
  function registrarCultura(m, chave, de, para) {
    const k = 'vis:' + chave.replace('vis:', '');
    if (!m.cultura.conhecimentos[chave]) {
      m.cultura.conhecimentos[chave] = { n: 0, primeiraVez: m.tempo.segMundo, descobridor: de ? de.nome : '?', eficiencia: 0.5 };
      m.cultura.riqueza++;
    }
    m.cultura.conhecimentos[chave].n++;
    m.cultura.conhecimentos[chave].eficiencia = U.clamp01(m.cultura.conhecimentos[chave].eficiencia + 0.01);
  }
  function registrarDescoberta(m, receitaId, npc) {
    const r = D.RECEITAS.find(x => x.id === receitaId);
    if (!r) return;
    const chave = 't:' + receitaId;
    if (!m.cultura.conhecimentos[chave] || m.cultura.conhecimentos[chave].n < 1) {
      m.cultura.riqueza++;
      m.contadores.receitas++;
      m.cultura.descobertas.push({ id: receitaId, nome: r.nome, por: npc ? npc.nome : '?', t: m.tempo.segMundo, tier: r.tier });
      m.registrar('💡 ' + (npc ? npc.nome : 'Alguém') + ' descobriu: ' + r.nome + '!', 'descoberta');
    }
    if (!m.cultura.conhecimentos[chave]) m.cultura.conhecimentos[chave] = { n: 0, primeiraVez: m.tempo.segMundo, descobridor: npc ? npc.nome : '?', eficiencia: 0.5 };
    m.cultura.conhecimentos[chave].n++;
    // sobe o nível de língua conforme a cultura fica rica
    const riq = m.cultura.riqueza;
    const meta = [0, 4, 10, 18, 30][Math.min(4, Math.floor(riq / 8))];
    for (const n of m.npcs) if (n.vivo && n.cerebro.nivelLingua < 4 && n.cerebro.nivelLingua < meta && m.rng.chance(0.25)) n.cerebro.nivelLingua++;
    if (m.rng.chance(0.12)) {
      for (const n of m.npcs) if (n.vivo && n.cerebro.nivelLingua < 4) n.cerebro.nivelLingua++;
    }
  }
  function aguaMaisProxima(m, x, y, raio) {
    let melhor = null, melhorD = raio || 1e9;
    for (const a of m.aguas) {
      const borda = Math.max(1.2, (a.raio || 2) * 0.55);
      const d = Math.max(0, U.dist(x, y, a.pos.x, a.pos.y) - borda);
      if (d < melhorD) { melhorD = d; melhor = a; }
    }
    return melhor;
  }
  function distBorda(m, a, x, y) {
    const borda = Math.max(1.2, (a.raio || 2) * 0.55);
    return Math.max(0, U.dist(x, y, a.pos.x, a.pos.y) - borda);
  }
  // ponto seco mais próximo da água (para beber na margem)
  function aguaNaBorda(m, n, fonte) {
    const R = (fonte.raio || 2) * 0.6 + 3.0;
    let melhor = null, melhorD = 1e9;
    for (let a = 0; a < Math.PI * 2; a += 0.35) {
      for (let r = (fonte.raio || 2) * 0.6; r <= R; r += 0.8) {
        const x = fonte.pos.x + Math.cos(a) * r, y = fonte.pos.y + Math.sin(a) * r;
        if (!tileValido(Math.round(x), Math.round(y))) continue;
        if (profundidadeEm(m, x, y) > 0.95) continue;
        const d = U.dist(n.pos.x, n.pos.y, x, y);
        if (d < melhorD) { melhorD = d; melhor = { x: x, y: y }; }
      }
    }
    return (melhor && melhorD < 30) ? melhor : null;
  }

  function temConstrucaoPerto(m, estruturaId, x, y, raio) {
    return m.construcoes.some(c => c.tipo === estruturaId && !c.colapsou && U.dist(c.pos.x, c.pos.y, x, y) < raio);
  }
  function objetosPerto(m, x, y, raio) {
    return m.objetos.filter(o => !o.empunhado && U.dist(o.pos.x, o.pos.y, x, y) < raio);
  }
  function contarObjetoPerto(m, tipo, x, y, raio) {
    let n = 0;
    for (const o of m.objetos) if (o.tipo === tipo && !o.empunhado && U.dist(o.pos.x, o.pos.y, x, y) < raio) n++;
    return n;
  }


  /* ============================================================
     PARTE 2 — MÉTODOS DO MUNDO, AÇÕES, NASCIMENTO E PODERES
     ============================================================ */

  function anexarMetodos(m) {
    m.registrar = (t, k) => registrar(m, t, k);
    m.registrarCultura = (c, a, b) => registrarCultura(m, c, a, b);
    m.registrarDescoberta = (i, n) => registrarDescoberta(m, i, n);
    m.temConstrucaoPerto = (e, x, y, r) => temConstrucaoPerto(m, e, x, y, r);
    m.aguaMaisProxima = (x, y, r) => aguaMaisProxima(m, x, y, r);
    m.objetosPerto = (x, y, r) => objetosPerto(m, x, y, r);
    m.contarObjetoPerto = (t, x, y, r) => contarObjetoPerto(m, t, x, y, r);
    m.proximos = (x, y, r, ex) => proximos(m, x, y, r, ex);
    m.porId = (id) => porId(m, id);
    m.temVisaoLivre = (a, b, c, d, e) => temVisaoLivre(m, a, b, c, d, e);
    m.alturaEm = (x, y) => alturaEm(m, x, y);
    m.biomaEm = (x, y) => biomaEm(m, x, y);
    m.ehAgua = (x, y) => ehAgua(m, x, y);
    m.luzNoite = () => luzNoite(m);
    m.climaAtual = () => climaAtual(m);
    m.tempAmbiente = (x, y) => tempAmbiente(m, x, y);
    m.invocar = (especie, x, y, qtd, extras) => invocar(m, especie, x, y, qtd, extras);
    m.reviver = (id) => reviver(m, id);
    m.curar = (quem) => curar(m, quem);
    m.teleportar = (npc, x, y) => teleportar(m, npc, x, y);
    m.darItem = (tipo, qtd, quem) => darItem(m, tipo, qtd, quem);
    m.definirClima = (t, i) => definirClima(m, t, i);
    m.pintarBioma = (x, y, r, b) => pintarBioma(m, x, y, r, b);
    m.catastrofe = (tipo, x, y, r) => catastrofe(m, tipo, x, y, r);
    m.ensinarPoder = (quem, chave) => ensinarPoder(m, quem, chave);
    m.censo = () => censo(m);
    m.seriar = () => seriar(m);
    m.tempoTexto = () => U.formatarData(m.tempo.segMundo);
  }

  /* ---------- carga e ferramentas ---------- */
  function cargaAtual(n) {
    let s = 0;
    for (const i of n.inventario || []) s += (D.ITENS[i.tipo] ? D.ITENS[i.tipo].massa : 1) * (i.qtd || 1);
    return s;
  }
  function usarFerramenta(n, tipo) {
    for (const i of n.inventario || []) {
      const d = D.ITENS[i.tipo];
      if (d && d.ferramenta === tipo && (i.integridade === undefined || i.integridade > 0.15)) {
        i.integridade = (i.integridade === undefined ? 1 : i.integridade) - 0.006 - (1 - (i.qualidade || 0.8)) * 0.02;
        return i;
      }
    }
    return null;
  }
  function quebrarFerramenta(m, n, item) {
    if (!item) return;
    if (item.integridade <= 0.02) {
      n.inventario = n.inventario.filter(x => x !== item);
      item.empunhado = false;
      m.objetos = m.objetos.filter(o => o !== item);
      m.entidades = m.entidades.filter(e => e !== item);
      m.registrar('🔨 Uma ferramenta de ' + n.nome + ' quebrou (mal feita).', 'detalhe');
      B.episodio(n.cerebro, 'Minha ferramenta quebrou. Preciso fazer melhor.', 0.5, m);
    }
  }
  function largar(m, n, obj) {
    if (!obj) return;
    obj.empunhado = false; obj.dono = null;
    obj.pos.x = n.pos.x + Math.cos(n.dir) * 0.6 + m.rng.range(-0.3, 0.3);
    obj.pos.y = n.pos.y + Math.sin(n.dir) * 0.6 + m.rng.range(-0.3, 0.3);
    obj.pos.z = alturaEm(m, obj.pos.x, obj.pos.y) + 0.05;
    obj.emRepouso = true;
    n.inventario = (n.inventario || []).filter(x => x !== obj);
    reconstruirGrade(m);
  }
  function segurar(m, n, obj) {
    if ((n.inventario || []).length > 0 && cargaAtual(n) + (D.ITENS[obj.tipo] ? D.ITENS[obj.tipo].massa : 1) > n.caps.cargaMax) return false;
    obj.empunhado = true; obj.dono = n.id; obj.emRepouso = true; obj.emVoo = false;
    n.inventario = n.inventario || [];
    if (n.inventario.indexOf(obj) < 0) n.inventario.push(obj);
    return true;
  }

  /* ---------- movimento ---------- */
  function velocidadeDe(m, n) {
    const caps = n.caps, c = n.corpo;
    let vel = caps.velAndar;
    const acao = n.acao || {};
    if (acao.tipo === 'fugir' || acao.correndo) vel = caps.velCorrer;
    const carga = U.clamp01(cargaAtual(n) / Math.max(4, caps.cargaMax));
    vel *= (1 - carga * 0.55);
    vel *= (FIS.velEnergiaPiso + (1 - FIS.velEnergiaPiso) * U.clamp01(c.energia / 55));
    if (c.saude < 45) vel *= 0.72;
    if (n.gravida > 0) vel *= 0.75;
    vel *= (0.45 + 0.55 * caps.velocidade);
    if (n.dormindo) vel = 0;
    return Math.max(0.05, vel);
  }
  function livrePara(m, x, y, n) {
    if (!tileValido(Math.round(x), Math.round(y))) return false;
    if (profundidadeEm(m, x, y) > 1.05) return false;
    if (alturaEm(m, x, y) < -1.1 && !ehAguaDoce(m, x, y)) return false;
    return true;
  }
  function moverPara(m, n, tx, ty, dt, precisao) {
    const dx = tx - n.pos.x, dy = ty - n.pos.y;
    const d = Math.hypot(dx, dy);
    if (d < (precisao || 0.6)) return true;
    const vel = velocidadeDe(m, n);
    let passo = Math.min(vel * dt, d);
    let ang = Math.atan2(dy, dx);
    let nx = n.pos.x + Math.cos(ang) * passo, ny = n.pos.y + Math.sin(ang) * passo;
    if (!livrePara(m, nx, ny, n)) {
      // 1) recua por bisseccao ate a borda do obstaculo: avanca o maximo
      //    possivel em vez de dar um passo invalido e travar para sempre
      let bom = 0;
      for (let k = 0; k < 14; k++) {
        const meio = (bom + passo) / 2;
        if (livrePara(m, n.pos.x + Math.cos(ang) * meio, n.pos.y + Math.sin(ang) * meio, n)) bom = meio;
        else passo = meio;
      }
      if (bom >= 0.02) {
        passo = bom;
        nx = n.pos.x + Math.cos(ang) * passo; ny = n.pos.y + Math.sin(ang) * passo;
      } else {
        // 2) encostado na parede: contorna com um passo curto e util
        const util = Math.max(0.35, Math.min(vel * dt, 2.5));
        let achou = false;
        for (const desvio of [0.52, -0.52, 1.05, -1.05, 1.65, -1.65, 2.2, -2.2]) {
          const a2 = ang + desvio;
          const cx = n.pos.x + Math.cos(a2) * util, cy = n.pos.y + Math.sin(a2) * util;
          if (livrePara(m, cx, cy, n)) { ang = a2; nx = cx; ny = cy; passo = util; achou = true; break; }
        }
        if (!achou) return false;
      }
    }
    const decl = Math.abs(alturaEm(m, nx, ny) - alturaEm(m, n.pos.x, n.pos.y));
    const custo = 1 + decl * 0.6;
    n.pos.x = nx; n.pos.y = ny;
    n.pos.z = alturaEm(m, nx, ny) + 0.9 * (n.caps.altura / 1.7);
    n.dir = U.angLerp(n.dir, ang, 0.25);
    n.corpo.energia = U.clamp(n.corpo.energia - passo * 0.055 * custo * (n.acao && n.acao.tipo === 'fugir' ? 2.4 : 1), 0, 100);
    n.velocidadeAtual = vel;
    // pegadas / trilha
    n.passos = (n.passos || 0) + dt * vel;
    return false;
  }

  /* ---------- AÇÕES DO HUMANO ---------- */
  function executarAcao(m, n, dt, modoRapido) {
    const a = n.acao;
    const c = n.cerebro, caps = n.caps;
    // objetos na mão seguem a pessoa
    for (const o of n.inventario || []) { o.pos.x = n.pos.x; o.pos.y = n.pos.y; o.pos.z = n.pos.z - 0.2; o.empunhado = true; }
    if (!a) return;
    a.progresso = (a.progresso || 0) + dt;
    if (!a.posIni) a.posIni = { x: n.pos.x, y: n.pos.y };
    if (a.progresso > 600 && a.tipo !== 'dormir' && a.tipo !== 'falar' && a.tipo !== 'esperar' && a.tipo !== 'descansar') {
      const andou = U.dist(a.posIni.x, a.posIni.y, n.pos.x, n.pos.y);
      if (andou < 1.2) { a.feito = true; a.falhou = true; c.pensamento = 'não consigo chegar lá'; }
    }
    const ce = climaAtual(m);
    switch (a.tipo) {
      case 'ir': {
        const alvoE = a.alvoId ? porId(m, a.alvoId) : null;
        if (!alvoE && a.progresso > 700) {
          const dd = U.dist(n.pos.x, n.pos.y, a.x, a.y);
          if (dd <= 3.0) { a.feito = true; break; }
        }
        if (alvoE && alvoE.classe === 'agua') {
          const ang = Math.atan2(alvoE.pos.y - n.pos.y, alvoE.pos.x - n.pos.x);
          const tx2 = alvoE.pos.x - Math.cos(ang) * (alvoE.raio || 2) * 0.78;
          const ty2 = alvoE.pos.y - Math.sin(ang) * (alvoE.raio || 2) * 0.78;
          const d = distBorda(m, alvoE, n.pos.x, n.pos.y);
          if (d <= 2.0) { a.feito = true; break; }
          moverPara(m, n, tx2, ty2, dt, 1.0);
          const d2 = distBorda(m, alvoE, n.pos.x, n.pos.y);
          if (d2 >= d - 0.001 && d2 <= 3.2) { a.feito = true; break; }
          if (a.progresso > 900) { a.feito = true; a.falhou = true; }
          break;
        }
        const chegou = moverPara(m, n, a.x, a.y, dt, a.proximidade || 0.7);
        if (chegou || a.progresso > 900) {
          if (chegou) a.feito = true; else { a.feito = true; a.falhou = true; }
        }
        break;
      }
      case 'explorar': {
        if (!a.destino) {
          const ang = m.rng.range(0, U.PI2), r = a.raio || 18;
          a.destino = { x: U.clamp(n.pos.x + Math.cos(ang) * r, 4, TAM - 5), y: U.clamp(n.pos.y + Math.sin(ang) * r, 4, TAM - 5) };
        }
        if (moverPara(m, n, a.destino.x, a.destino.y, dt, 1.2)) a.feito = true;
        if (a.progresso > 2400) { a.feito = true; a.falhou = true; }
        break;
      }
      case 'procurar_comida': {
        const perto = proximos(m, n.pos.x, n.pos.y, 30, n).filter(e =>
          (e.classe === 'planta' && e.frutos > 0) || (e.classe === 'objeto' && D.ITENS[e.tipo] && D.ITENS[e.tipo].comida));
        if (perto.length) { const p = perto[0]; a.feito = true; n.acao = { tipo: 'ir', x: p.pos.x, y: p.pos.y, alvoId: p.id, proximidade: 1.0, progresso: 0 }; }
        else if (a.progresso > 60) { a.feito = true; a.falhou = true; }
        break;
      }
      case 'pegar': {
        // se o alvo for planta com fruto, isso é colheita
        const alvoP = a.alvoId ? porId(m, a.alvoId) : null;
        if (alvoP && alvoP.classe === 'planta' && alvoP.frutos > 0) {
          a.tipo = 'colher_planta';
          break;
        }
        const alvo = porId(m, a.alvoId);
        if (!alvo || alvo.empunhado) { a.feito = true; a.falhou = true; break; }
        const d = U.dist(n.pos.x, n.pos.y, alvo.pos.x, alvo.pos.y);
        if (d > 1.8) { moverPara(m, n, alvo.pos.x, alvo.pos.y, dt, 1.0); break; }
        if (segurar(m, n, alvo)) {
          a.feito = true;
          const int = D.ITENS[alvo.tipo];
          if (int && int.comida) B.reforcar(c, alvo.visual || 'vis:folha', 0.4, 0.7, 'observacao', null, m);
          n.acaoExecutando = false;
        } else { a.feito = true; a.falhou = true; c.pensamento = 'não consigo carregar mais'; }
        break;
      }
      case 'colher_planta': {
        const p = porId(m, a.alvoId);
        if (!p || p.cortada) { a.feito = true; a.falhou = true; break; }
        const d = U.dist(n.pos.x, n.pos.y, p.pos.x, p.pos.y);
        if (d > caps.alcanceBraco + p.tronco + 0.5) { moverPara(m, n, p.pos.x, p.pos.y, dt, caps.alcanceBraco + p.tronco + 0.3); break; }
        const defP0 = D.FLORA[p.tipo] || {};
        const pedido = a.material || ((p.frutoTipo && p.frutos > 0) ? null : defP0.colheita);
        if (pedido) {
          const ehArvore = (defP0.tipo === 'arvore' || defP0.tipo === 'conifera' || defP0.tipo === 'palmeira' || defP0.tipo === 'bambu');
          if (pedido === 'tronco' || (ehArvore && pedido === 'folha') || (ehArvore && !defP0.colheita)) {
            const rec = colherRecurso(m, n, p);
            if (!rec) {
              if (!n.avisoMachado || n.avisoMachado < m.tempo.segMundo - 1800) {
                n.avisoMachado = m.tempo.segMundo;
                c.pensamento = 'preciso de algo que corte';
              }
              a.feito = true; a.falhou = true; break;
            }
            a.feito = true; n.acaoExecutando = false; break;
          }
          const qtdC = defP0.qtd ? m.rng.int(defP0.qtd[0], defP0.qtd[1]) : 1;
          for (let i = 0; i < qtdC; i++) {
            const o = criarObjeto(m, pedido, p.pos.x, p.pos.y, m.rng, { pos: { x: n.pos.x, y: n.pos.y, z: n.pos.z - 0.1 } });
            if (!segurar(m, n, o)) largar(m, n, o);
          }
          B.reforcar(c, p.visual || 'vis:folha', 0.5, 0.7, 'experiencia', 'construcao', m, 0.25);
          B.aprender(n, { tipo: 'colheu', recurso: pedido, x: p.pos.x, y: p.pos.y }, m);
          a.feito = true; n.acaoExecutando = false; break;
        }
        const def = D.FLORA[p.tipo];
        const zFruto = p.pos.z + p.altura * (def.tipo === 'arbusto' ? 0.7 : 0.78);
        const alcanca = (n.pos.z + caps.alcanceBraco) >= zFruto;
        if (p.frutos > 0 && alcanca) {
          p.frutos--;
          const fruta = criarObjeto(m, p.frutoTipo, p.pos.x, p.pos.y, m.rng, { pos: { x: n.pos.x, y: n.pos.y, z: n.pos.z - 0.1 } });
          fruta.tamanho = def.frutoTam || 0.1;
          fruta.visual = 'vis:' + p.frutoTipo;
          if (!segurar(m, n, fruta)) largar(m, n, fruta);
          B.aprender(n, { tipo: 'colheu', recurso: p.frutoTipo, x: p.pos.x, y: p.pos.y, visual: 'vis:' + p.frutoTipo }, m);
          B.reforcar(c, 'vis:' + p.frutoTipo, 0.5, 0.8, 'experiencia', null, m);
          B.reforcar(c, 'vis:folha', 0.4, 0.8, 'observacao', null, m);
          a.feito = true;
          n.acaoExecutando = false;
        } else if (p.frutos > 0) {
          // O alvo tem comida visivel, mas o corpo nao alcanca. Isto NAO e
          // fracasso do objetivo: e um FATO sobre o alvo. O cerebro guarda
          // o fato e devolve a pergunta "como transpor isto?".
          const imp = detectarImpedimento(m, n, p);
          if (imp) {
            B.observarImpedimento(c, imp, m);
            a.bloqueado = imp;
            a.alvoTravado = p.id;
            c.pensamento = (D.IMPEDIMENTOS[imp] ? D.IMPEDIMENTOS[imp].label : 'nao alcanço');
          } else {
            a.falhou = true;
          }
          a.feito = true;
        } else { a.feito = true; a.falhou = true; }
        break;
      }
      case 'transpor': {
        // Executa UM operador contra UM impedimento e mede o que mudou no
        // mundo. O aprendizado vive em B.aprenderTransposicao().
        const alvo = porId(m, a.alvoId);
        if (!alvo) { a.feito = true; a.falhou = true; break; }
        const alcT = n.caps.alcanceBraco + 0.9;
        if (U.dist(n.pos.x, n.pos.y, alvo.pos.x, alvo.pos.y) > alcT) {
          moverPara(m, n, alvo.pos.x, alvo.pos.y, dt, alcT);
          break;
        }
        const ex = EXECUTORES[a.operador];
        if (!ex) { a.feito = true; a.bloqueado = a.impedimento; break; }
        if (n.corpo.energia < 6) { a.feito = true; a.falhou = true; break; }
        const antes = observarEfeito(alvo);
        ex(m, n, alvo);
        const depois = observarEfeito(alvo);
        const efeito = Math.max(0, antes - depois);
        B.aprenderTransposicao(c, a.impedimento, a.operador, efeito, alvo, m);
        a.feito = true;
        // O impedimento continua sendo um fato conhecido do mundo: o corpo
        // aprendeu que aquele caminho rende (ou nao rende), e isso tambem
        // e informacao. O objetivo nao e punido por causa disto.
        a.bloqueado = a.impedimento;
        a.alvoTravado = alvo.id;
        break;
      }
      case 'arremessar': {
        const alvo = porId(m, a.alvoId);
        const obj = (n.inventario || []).find(i => i.tipo === 'pedra') || (n.inventario || [])[0];
        if (!alvo || !obj) { a.feito = true; a.falhou = true; break; }
        arremessar(m, n, obj, alvo, 1);
        largar(m, n, obj);
        a.feito = true;
        B.reforcar(c, 't:r_arremesso', 0.6, 0.8, 'experiencia', null, m);
        break;
      }
      case 'comer': {
        let item = (n.inventario || []).find(i => D.ITENS[i.tipo] && D.ITENS[i.tipo].comida);
        if (!item) {
          // nada na mao: comida que esta no chao ao alcance tambem e refeicao.
          // Sem isso, fruta derrubada da arvore era invisivel para a fome.
          const alc = caps.alcanceBraco + 0.8;
          const perto = [];
          for (const o of m.objetos) {
            if (o.empunhado) continue;
            const di = D.ITENS[o.tipo];
            if (!di || !di.comida) continue;
            if (Math.abs(o.pos.x - n.pos.x) > alc || Math.abs(o.pos.y - n.pos.y) > alc) continue;
            perto.push({ o: o, d: U.dist(n.pos.x, n.pos.y, o.pos.x, o.pos.y) });
          }
          perto.sort((x, y) => x.d - y.d);
          if (perto.length && perto[0].d <= alc) { item = perto[0].o; segurar(m, n, item); }
        }
        if (!item) {
          // se ha comida conhecida por perto, nao desiste: sinaliza para re-planejar
          const mem = B.memoriaMelhor(c, 'comida', n.pos.x, n.pos.y, m);
          c.pensamento = mem ? 'a comida estava aqui' : 'nao acho comida';
          a.feito = true; a.falhou = true; break;
        }
        const def = D.ITENS[item.tipo];
        let valor = def.comida || 5;
        const veneno = def.veneno || 0;
        n.corpo.fome = U.clamp(n.corpo.fome - ((valor * 0.85) * 3.4), 0, 100);
        if (def.agua) n.corpo.sede = U.clamp(n.corpo.sede - def.agua * 120, 0, 100);
        n.corpo.energia = U.clamp(n.corpo.energia + valor * 0.25, 0, 100);
        n.inventario = n.inventario.filter(x => x !== item);
        m.objetos = m.objetos.filter(o => o !== item);
        m.entidades = m.entidades.filter(e => e !== item);
        const bom = !(veneno > 0 && m.rng.chance(veneno));
        if (!bom) {
          n.corpo.saude -= 22; n.corpo.ferimentos.push({ t: 0, tipo: 'envenenado', dano: 22 });
          B.aprender(n, { tipo: 'comeu', bom: false, visual: item.visual || 'vis:cogumelo' }, m);
          B.aprender(n, { tipo: 'doente' }, m);
          m.registrar('🤢 ' + n.nome + ' passou mal comendo ' + def.nome.toLowerCase() + '.', 'detalhe');
        } else {
          B.aprender(n, { tipo: 'comeu', bom: true, visual: item.visual || 'vis:fruta_vermelha' }, m);
        }
        c.emocao.alegria = U.clamp(c.emocao.alegria + (bom ? 12 : -25), 0, 100);
        a.feito = true;
        n.acaoExecutando = false;
        break;
      }
      case 'experimentar': {
        const alvo = porId(m, a.alvoId);
        if (!alvo) { a.feito = true; a.falhou = true; break; }
        if (U.dist(n.pos.x, n.pos.y, alvo.pos.x, alvo.pos.y) > 1.8) { moverPara(m, n, alvo.pos.x, alvo.pos.y, dt, 1.4); break; }
        if (alvo.classe === 'objeto') {
          const def = D.ITENS[alvo.tipo] || {};
          if (def.comida) { if (segurar(m, n, alvo)) n.acao = { tipo: 'comer', progresso: 0 }; a.feito = true; }
          else {
            B.reforcar(c, alvo.visual || 'vis:pedra', 0.55, 0.7, 'experiencia', def.massa > 1 ? 'construcao' : null, m);
            c.pensamento = 'não dá para comer isso';
            a.feito = true;
          }
        } else if (alvo.classe === 'animal') {
          B.reforcar(c, 'vis:animal_' + (alvo.tamanho > 0.9 ? 'grande' : 'pequeno'), 0.5, 0.7, 'observacao', null, m);
          if (D.FAUNA[alvo.especie] && D.FAUNA[alvo.especie].domest > 0.5 && m.rng.chance(0.3 + n.gene.cooperacao * 0.3)) {
            alvo.domesticado = U.clamp01(alvo.domesticado + 0.25); alvo.dono = n.id;
            B.reforcar(c, 'c:domesticavel', 0.7, 0.8, 'experiencia', null, m);
            m.registrar('🐾 ' + n.nome + ' está domesticando um ' + D.FAUNA[alvo.especie].nome.toLowerCase() + '.', 'descoberta');
          }
          a.feito = true;
        } else { a.feito = true; a.falhou = true; }
        break;
      }
      case 'observar': {
        const alvo = porId(m, a.alvoId);
        if (!alvo) { a.feito = true; a.falhou = true; break; }
        if (U.dist(n.pos.x, n.pos.y, alvo.pos.x, alvo.pos.y) > 6) { moverPara(m, n, alvo.pos.x, alvo.pos.y, dt, 4); break; }
        n.dir = U.angLerp(n.dir, Math.atan2(alvo.pos.y - n.pos.y, alvo.pos.x - n.pos.x), 0.15);
        const vis = B.aparenciaVisual(alvo);
        B.reforcar(c, vis, 0.6, 0.75, 'observacao', null, m);
        if (alvo.classe === 'planta' && alvo.frutos > 0) B.reforcar(c, vis, 0.4, 0.7, 'observacao', 'comestivel', m, 0.2);
        if (alvo.classe === 'agua') B.reforcar(c, 'vis:agua', 0.6, 0.85, 'observacao', 'agua', m, 0.5);
        if (a.progresso > 12) a.feito = true;
        break;
      }
      case 'beber': {
        // 1) está em cima da água ou encostado nela? (checagem direta do terreno)
        let naAgua = false;
        for (let dx = -2.6; dx <= 2.6 && !naAgua; dx += 1.3) {
          for (let dy = -2.6; dy <= 2.6 && !naAgua; dy += 1.3) {
            if (profundidadeEm(m, n.pos.x + dx, n.pos.y + dy) > 0.02 || ehAguaDoce(m, n.pos.x + dx, n.pos.y + dy)) naAgua = true;
          }
        }
        if (naAgua) {
          const ganho = 32 + (n.caps ? n.caps.altura * 6 : 10);
          n.corpo.sede = U.clamp(n.corpo.sede - ganho, 0, 100);
          n.corpo.hidratacao = U.clamp((n.corpo.hidratacao || 50) + 40, 0, 100);
          c.pensamento = 'bebendo água';
          B.aprender(n, { tipo: 'bebeu', x: n.pos.x, y: n.pos.y }, m);
          B.reforcar(c, 'vis:agua', 0.8, 0.9, 'experiencia', null, m);
          if (!c.conhecimento['c:agua_potavel']) B.reforcar(c, 'c:agua_potavel', 0.9, 0.7, 'experiencia', null, m);
          a.feito = true; a.sucesso = true;
          break;
        }
        const fonte = porId(m, a.alvoId) || aguaMaisProxima(m, n.pos.x, n.pos.y, 160);
        if (fonte) {
          const d = distBorda(m, fonte, n.pos.x, n.pos.y);
          if (d > 1.3) {
            const ang = Math.atan2(fonte.pos.y - n.pos.y, fonte.pos.x - n.pos.x);
            const tx2 = fonte.pos.x - Math.cos(ang) * (fonte.raio || 2) * 0.78;
            const ty2 = fonte.pos.y - Math.sin(ang) * (fonte.raio || 2) * 0.78;
            const dAntes = d;
            moverPara(m, n, tx2, ty2, dt, 1.0);
            const dDepois = distBorda(m, fonte, n.pos.x, n.pos.y);
            if (dDepois >= dAntes - 0.001) {
              // não conseguiu avançar (barranco / fundo demais): tenta chegar pela borda mais próxima
              const perto = aguaNaBorda(m, n, fonte);
              if (perto) { n.pos.x = perto.x; n.pos.y = perto.y; n.pos.z = alturaEm(m, perto.x, perto.y) + 0.9 * (n.caps.altura / 1.7); }
              a.feito = true;
            }
            if (a.progresso > 900) { a.feito = true; a.falhou = true; }
            break;
          }
        } else { a.feito = true; a.falhou = true; break; }
        const pote = (n.inventario || []).find(i => i.conteudo && (D.ITENS[i.tipo].capacidade || 0) > 0.2);
        const sabeUsarPote = c.conhecimento['t:r_cuia'] || c.conhecimento['c:recipiente'];
        if (pote && sabeUsarPote && (pote.conteudo.agua || 0) < D.ITENS[pote.tipo].capacidade * 0.9) {
          pote.conteudo.agua = D.ITENS[pote.tipo].capacidade;
          a.feito = true;
          B.aprender(n, { tipo: 'bebeu' }, m);
          c.pensamento = 'enchi o ' + D.ITENS[pote.tipo].nome.toLowerCase();
          break;
        }
        n.corpo.sede = U.clamp(n.corpo.sede - 55, 0, 100);
        n.corpo.energia = U.clamp(n.corpo.energia + 3, 0, 100);
        B.aprender(n, { tipo: 'bebeu' }, m);
        if (m.rng.chance(0.05)) { n.corpo.saude -= 6; B.aprender(n, { tipo: 'doente' }, m); }
        a.feito = true;
        n.acaoExecutando = false;
        break;
      }
      case 'dormir': {
        if (!n.dormindo) { n.dormindo = true; n.inicioSono = m.tempo.segMundo; }
        const noite = luzNoite(m);
        if (n.corpo.sono < 8 && noite < 0.5) { n.dormindo = false; a.feito = true; }
        if (a.progresso > 40000) { n.dormindo = false; a.feito = true; }
        break;
      }
      case 'descansar': {
        n.corpo.energia = U.clamp(n.corpo.energia + dt * 1.6, 0, 100);
        if (a.progresso > 300 || n.corpo.energia > 85) a.feito = true;
        break;
      }
      case 'aquecer': {
        const fogo = proximos(m, n.pos.x, n.pos.y, 3.2, n).find(e => e.classe === 'fogo');
        if (fogo) { n.corpo.temperaturaCorp = U.lerp(n.corpo.temperaturaCorp, 36.8, U.clamp01(dt / 300)); }
        if (n.corpo.temperaturaCorp > 35.6 || a.progresso > 900) a.feito = true;
        break;
      }
      case 'fugir': {
        const ameaca = porId(m, a.alvoId);
        const dist = ameaca ? U.dist(n.pos.x, n.pos.y, ameaca.pos.x, ameaca.pos.y) : 99;
        if (!ameaca || dist > (a.distancia || 22)) { a.feito = true; B.aprender(n, { tipo: 'fugiu' }, m); break; }
        const ang = Math.atan2(n.pos.y - ameaca.pos.y, n.pos.x - ameaca.pos.x);
        const tx = U.clamp(n.pos.x + Math.cos(ang) * 6, 3, TAM - 4), ty = U.clamp(n.pos.y + Math.sin(ang) * 6, 3, TAM - 4);
        n.acao.correndo = true;
        if (!moverPara(m, n, tx, ty, dt, 0.5)) { /* bloqueado: tenta outra direção */ n.dir += 1.2; }
        c.emocao.medo = U.clamp(c.emocao.medo + dt * 8, 0, 100);
        break;
      }
      case 'atacar': {
        const alvo = porId(m, a.alvoId);
        if (!alvo || alvo.vivo === false) { a.feito = true; a.falhou = true; break; }
        const d = U.dist(n.pos.x, n.pos.y, alvo.pos.x, alvo.pos.y);
        const arma = (n.inventario || []).find(i => D.ITENS[i.tipo] && D.ITENS[i.tipo].dano > 0);
        const alcance = caps.alcanceBraco + 0.6 + (arma && D.ITENS[arma.tipo].alcance ? D.ITENS[arma.tipo].alcance : 0);
        if (d > alcance) { moverPara(m, n, alvo.pos.x, alvo.pos.y, dt, alcance - 0.3); break; }
        if (a.progresso < 1.2) break;                    // tempo de golpe
        a.progresso = 0;
        const dano = (4 + caps.forca * 26) * (arma ? (0.6 + D.ITENS[arma.tipo].dano / 20) : 0.5);
        if (alvo.classe === 'animal') {
          alvo.corpo.saude -= dano;
          alvo.corpo.fome = Math.min(100, alvo.corpo.fome + 5);
          const def = D.FAUNA[alvo.especie];
          B.reforcar(c, 'vis:animal_' + (alvo.tamanho > 0.9 ? 'grande' : 'pequeno'), 0.6, 0.8, 'experiencia', null, m);
          if (alvo.domesticado > 0.4) alvo.domesticado = U.clamp01(alvo.domesticado - 0.4);
          m.registrar('🗡️ ' + n.nome + ' feriu um ' + def.nome.toLowerCase() + '.', 'detalhe');
          if (alvo.corpo.saude <= 0) {
            B.aprender(n, { tipo: 'cacou' }, m);
            B.reforcar(c, 'c:' + def.nome.toLowerCase(), 0.9, 0.9, 'experiencia', 'comestivel', m, 0.6);
          }
          // revide
          if (def.perigo > 0.3 && m.rng.chance(def.perigo)) {
            const rev = def.forca * 0.25;
            ferir(n, rev, 'predador', def.nome, m);
          }
        } else if (alvo.classe === 'humano') {
          ferir(alvo, dano * 0.5, 'conflito', n.nome, m);
          B.registrarSocial(c, alvo, m, -0.5);
          B.registrarSocial(alvo.cerebro, n, m, -0.6);
          m.registrar('⚔️ ' + n.nome + ' atacou ' + alvo.nome + '.', 'conflito');
        }
        if (arma) quebrarFerramenta(m, n, arma);
        B.aprender(n, { tipo: 'fugiu' }, m);
        a.feito = true;
        break;
      }
      case 'fabricar': {
        const r = D.RECEITAS.find(x => x.id === a.receita);
        if (!r) { a.feito = true; a.falhou = true; break; }
        if (a.progresso < 4) {
          // reúne os materiais que estão no chão perto
          const perto = objetosPerto(m, n.pos.x, n.pos.y, 3.5);
          for (const o of perto) if (segurar(m, n, o)) break;
          break;
        }
        // precisa dos ingredientes
        const precisa = {};
        for (const ent of r.entrada) if (ent !== 'animal' && ent !== 'fogueira' && ent !== 'forno') precisa[ent] = (precisa[ent] || 0) + 1;
        const temFogo = r.entrada.indexOf('fogueira') >= 0 || r.entrada.indexOf('forno') >= 0;
        if (temFogo && !proximos(m, n.pos.x, n.pos.y, 3.2, n).some(e => e.classe === 'fogo' || (e.classe === 'construcao' && e.especial === 'forno'))) {
          a.feito = true; a.falhou = true; break;
        }
        let falta = null;
        for (const k in precisa) {
          const qtd = (n.inventario || []).filter(i => i.tipo === k).length;
          if (qtd < precisa[k]) { falta = k; break; }
        }
        if (falta) {
          const alvo = proximos(m, n.pos.x, n.pos.y, 25, n).find(e => e.tipo === falta || (e.classe === 'planta' && e.recurso === falta && !e.cortada));
          if (alvo) { a.feito = true; n.acao = alvo.classe === 'planta' ? { tipo: 'colher_planta', alvoId: alvo.id, progresso: 0 } : { tipo: 'ir', x: alvo.pos.x, y: alvo.pos.y, alvoId: alvo.id, proximidade: 0.8, progresso: 0 }; }
          else { a.feito = true; a.falhou = true; }
          break;
        }
        // consome
        const consumir = (k) => { const it = (n.inventario || []).find(i => i.tipo === k); if (it) { n.inventario = n.inventario.filter(x => x !== it); m.objetos = m.objetos.filter(o => o !== it); m.entidades = m.entidades.filter(e => e !== it); } };
        for (const k in precisa) for (let i = 0; i < precisa[k]; i++) consumir(k);
        // rolagem de sucesso: conhecimento + criatividade + metais do corpo
        const dep = (r.dep || []).filter(d => c.conhecimento['t:' + d] && c.conhecimento['t:' + d].conf > 0.4).length;
        const depTotal = (r.dep || []).length || 1;
        const skill = (caps.destreza * 0.35 + caps.cognitivo * 0.3 + n.gene.criatividade * 0.35);
        const chance = U.clamp01(skill * 1.25 - r.dif * 0.75 + (dep / depTotal) * 0.45 + 0.12);
        if (m.rng.chance(chance)) {
          if (r.estrutura) {
            criarObra(m, n, r.estrutura, n.pos.x + Math.cos(n.dir) * 2, n.pos.y + Math.sin(n.dir) * 2, r.id);
          } else if (r.saida) {
            const o = criarObjeto(m, r.saida, n.pos.x, n.pos.y, m.rng, { qualidade: U.clamp01(skill * 0.7 + 0.3) });
            o.pos.z = n.pos.z - 0.1;
            if (r.saida === 'fogueira') {
              const f = { id: 'f' + (m.proxId++), classe: 'fogo', tipo: 'fogueira', nome: 'Fogueira', pos: { x: n.pos.x, y: n.pos.y, z: alturaEm(m, n.pos.x, n.pos.y) + 0.2 }, tamanho: 0.7, cor: '#ff9a3a', combustivel: 100, percepivel: true, som: 'crepitar', abrigo: 0.15 };
              m.fogos.push(f); m.entidades.push(f);
              m.objetos = m.objetos.filter(x => x !== o); m.entidades = m.entidades.filter(e => e !== o);
              B.reforcar(c, 'vis:fogo', 0.9, 0.9, 'experiencia', 'quente', m, 0.7);
              B.reforcar(c, 'vis:fogo', 0.6, 0.7, 'experiencia', 'combustivel', m, 0.3);
              m.registrar('🔥 ' + n.nome + ' acendeu uma fogueira!', 'descoberta');
            } else {
              segurar(m, n, o);
            }
          }
          B.aprender(n, { tipo: 'receita_ok', receita: r.id, nome: r.nome }, m);
        } else {
          B.aprender(n, { tipo: 'receita_falha', receita: r.id }, m);
        }
        a.feito = true;
        break;
      }
      case 'construir': {
        const def = D.ESTRUTURAS[a.estrutura];
        if (!def) { a.feito = true; a.falhou = true; break; }
        let obra = n.obraAlvo ? porId(m, n.obraAlvo) : null;
        if (!obra || obra.pronta || obra.colapsou) {
          obra = criarObra(m, n, a.estrutura, n.pos.x + Math.cos(n.dir) * 2.2, n.pos.y + Math.sin(n.dir) * 2.2, a.receita);
          n.obraAlvo = obra.id;
        }
        if (U.dist(n.pos.x, n.pos.y, obra.pos.x, obra.pos.y) > 3.2) { moverPara(m, n, obra.pos.x, obra.pos.y, dt, 2.6); break; }
        // escolhe o material que falta
        let mat = null;
        for (const k in obra.materiais) if ((obra.materiais[k].entregue || 0) < obra.materiais[k].total) { mat = k; break; }
        if (!mat) { a.feito = true; break; }
        if (a.progresso < 3) break;
        a.progresso = 0;
        const item = (n.inventario || []).find(i => i.tipo === mat);
        if (!item) {
          const alvo = proximos(m, n.pos.x, n.pos.y, 30, n).find(e => e.tipo === mat || (e.classe === 'planta' && e.recurso === mat && !e.cortada));
          if (alvo) { a.feito = true; n.acao = alvo.classe === 'planta' ? { tipo: 'colher_planta', alvoId: alvo.id, progresso: 0 } : { tipo: 'ir', x: alvo.pos.x, y: alvo.pos.y, alvoId: alvo.id, proximidade: 0.8, progresso: 0 }; }
          else { a.feito = true; a.falhou = true; }
          break;
        }
        n.inventario = n.inventario.filter(x => x !== item);
        m.objetos = m.objetos.filter(o => o !== item);
        m.entidades = m.entidades.filter(e => e !== item);
        obra.materiais[mat].entregue++;
        const skill = caps.destreza * 0.5 + caps.forca * 0.15 + caps.cognitivo * 0.2 + (c.conhecimento['t:' + a.receita] ? c.conhecimento['t:' + a.receita].conf * 0.3 : 0);
        obra.q = U.lerp(obra.q, U.clamp01(skill * 1.15), 0.34);
        obra.progresso = U.clamp01(obra.progresso + 1 / obra.totalPecas);
        obra.alturaParcial = def.altura ? def.altura * obra.progresso : obra.progresso;
        obra.pecas.push({ tipo: 'peca', z: obra.progresso, mat: mat, q: obra.q });
        const fim = Object.keys(obra.materiais).every(k => obra.materiais[k].entregue >= obra.materiais[k].total);
        if (fim) {
          obra.pronta = true;
          // A OBRA PODE CAIR: qualidade baixa = risco alto
          const risco = U.clamp01((0.92 - obra.q) * 1.5) * (1 + (def.peso || 2) * 0.04);
          if (m.rng.chance(risco)) {
            obra.colapsou = true; obra.pronta = false;
            m.registrar('💥 A ' + def.nome.toLowerCase() + ' de ' + n.nome + ' desabou! (mal feita)', 'colapso');
            B.aprender(n, { tipo: 'colapso', receita: a.receita }, m);
            for (const perto of proximos(m, obra.pos.x, obra.pos.y, 4, n)) {
              if (perto.classe === 'humano') ferir(perto, m.rng.range(5, 35), 'acidente', 'a construção', m);
              else if (perto.classe === 'animal') perto.corpo.saude -= m.rng.range(5, 30);
            }
            // devolve parte do material
            for (const k in obra.materiais) {
              const s = Math.ceil(obra.materiais[k].total * 0.3);
              for (let i = 0; i < s; i++) criarObjeto(m, k, obra.pos.x + m.rng.range(-2, 2), obra.pos.y + m.rng.range(-2, 2), m.rng);
            }
            obra.materiais = {};
          } else {
            obra.abrigo = (def.abrigo || 0) * obra.q;
            m.contadores.construcoes++;
            B.aprender(n, { tipo: 'construiu', receita: a.receita, nome: def.nome }, m);
            m.registrar('🏠 ' + n.nome + ' terminou: ' + def.nome + ' (qualidade ' + Math.round(obra.q * 100) + '%).', 'construcao');
            if (def.abrigo > 0.5) {
              for (const outro of m.npcs) if (outro.vivo) B.reforcar(outro.cerebro, 'vis:construcao', 0.6, 0.8, 'observacao', 'abrigo', m, 0.4);
            }
          }
        }
        a.feito = true;
        break;
      }
      case 'juntar': {
        const mat = a.material;
        const precisaQtd = a.estrutura ? (D.ESTRUTURAS[a.estrutura].materiais[mat] || 3) : 4;
        const tem = (n.inventario || []).filter(i => i.tipo === mat).length;
        if (tem >= precisaQtd) { a.feito = true; break; }
        // 1) pega do chão
        const noChao = objetosPerto(m, n.pos.x, n.pos.y, 20).filter(o => o.tipo === mat);
        if (noChao.length) {
          const o = noChao[0];
          if (U.dist(n.pos.x, n.pos.y, o.pos.x, o.pos.y) < 1.6) {
            if (!segurar(m, n, o)) { a.feito = true; a.falhou = true; }
          } else moverPara(m, n, o.pos.x, o.pos.y, dt, 1.0);
          if (a.progresso > 600) a.feito = true;
          break;
        }
        // 2) colhe da planta que fornece
        const planta = proximos(m, n.pos.x, n.pos.y, 45, n)
          .filter(e => e.classe === 'planta' && !e.cortada && (e.recurso === mat || (mat === 'tronco' && e.altura > 3)))
          .sort((x, y) => U.dist(n.pos.x, n.pos.y, x.pos.x, x.pos.y) - U.dist(n.pos.x, n.pos.y, y.pos.x, y.pos.y))[0];
        if (planta) {
          a.feito = true;
          n.acao = { tipo: 'colher_planta', alvoId: planta.id, progresso: 0, material: mat };
          break;
        }
        a.feito = true; a.falhou = true;
        c.pensamento = 'não acho ' + mat;
        break;
      }
      case 'cortejar': {
        const alvo = porId(m, a.alvoId);
        if (!alvo || !alvo.vivo) { a.feito = true; a.falhou = true; break; }
        if (U.dist(n.pos.x, n.pos.y, alvo.pos.x, alvo.pos.y) > 2.2) { moverPara(m, n, alvo.pos.x, alvo.pos.y, dt, 1.6); break; }
        B.registrarSocial(c, alvo, m, 0.25); B.registrarSocial(alvo.cerebro, n, m, 0.25);
        n.parceiro = alvo.id; alvo.parceiro = n.id;
        if (c.social[alvo.id]) c.social[alvo.id].parentesco = 'parceiro';
        const ca = alvo.cerebro;
        if (ca && ca.social && ca.social[n.id]) ca.social[n.id].parentesco = 'parceiro';
        B.aprender(n, { tipo: 'acasalou', parceiro: alvo }, m);
        if (n.sexo === 'F' && n.gravida <= 0 && n.caps.fertilidade > 0.3 && alvo.caps.fertilidade > 0.3 && m.rng.chance(0.35 + n.caps.fertilidade * 0.4)) {
          n.gravida = 9 * 30 * U.SEG_DIA;
          n.ultimoFilho = m.tempo.segMundo;
          m.registrar('🤰 ' + n.nome + ' está grávida.', 'vida');
        } else if (alvo.sexo === 'F' && alvo.gravida <= 0 && alvo.caps.fertilidade > 0.3 && m.rng.chance(0.35)) {
          alvo.gravida = 9 * 30 * U.SEG_DIA;
          alvo.ultimoFilho = m.tempo.segMundo;
          m.registrar('🤰 ' + alvo.nome + ' está grávida.', 'vida');
        }
        a.feito = true;
        break;
      }
      case 'plantar': {
        const sem = (n.inventario || []).find(i => D.ITENS[i.tipo] && D.ITENS[i.tipo].plantavel);
        if (!sem) { a.feito = true; a.falhou = true; break; }
        const px = n.pos.x + Math.cos(n.dir) * 1.2, py = n.pos.y + Math.sin(n.dir) * 1.2;
        if (alturaEm(m, px, py) < 0.4 || ehAgua(m, px, py)) { a.feito = true; a.falhou = true; break; }
        n.inventario = n.inventario.filter(x => x !== sem);
        m.objetos = m.objetos.filter(o => o !== sem); m.entidades = m.entidades.filter(e => e !== sem);
        const cult = { id: 'c' + (m.proxId++), classe: 'plantacao', tipo: 'plantacao', nome: 'Plantação', pos: { x: px, y: py, z: alturaEm(m, px, py) }, crescimento: 0, madura: false, frutos: 0, dono: n.id, tamanho: 0.4, cor: '#7cb14e', percepivel: true, tipoSemente: sem.tipo };
        m.plantacoes.push(cult); m.entidades.push(cult);
        B.aprender(n, { tipo: 'receita_ok', receita: 'r_agricultura', nome: 'Plantar semente' }, m);
        m.registrar('🌱 ' + n.nome + ' plantou uma semente. Agricultura começa.', 'descoberta');
        a.feito = true;
        break;
      }
      case 'brincar': {
        if (a.progresso > 20) {
          a.feito = true;
          if (m.rng.chance(0.3)) {
            // aprender brincando: imita um conhecimento que existe na cultura
            const chaves = Object.keys(m.cultura.conhecimentos);
            if (chaves.length) {
              const k = chaves[m.rng.int(0, chaves.length - 1)];
              B.reforcar(c, k, 0.3, 0.25, 'brincadeira', null, m);
            } else if (m.rng.chance(0.5)) {
              B.reforcar(c, 'vis:' + (m.rng.chance(0.5) ? 'folha' : 'pedra'), 0.4, 0.3, 'brincadeira', null, m);
            }
          }
        } else { n.dir += dt * 2.5; n.pos.x += Math.cos(n.dir) * 0.4 * dt; n.pos.y += Math.sin(n.dir) * 0.4 * dt; }
        break;
      }
      case 'falar': {
        const alvo = porId(m, a.alvoId);
        if (alvo && alvo.vivo) {
          if (U.dist(n.pos.x, n.pos.y, alvo.pos.x, alvo.pos.y) > 3) { moverPara(m, n, alvo.pos.x, alvo.pos.y, dt, 1.8); break; }
          B.comunicar(n, alvo, m);
          if (m.rng.chance(0.25)) {
            c.ultimaFala = c.nivelLingua >= 3 ? 'Está tudo bem?' : (c.nivelLingua >= 1 ? 'você. bem?' : '«acena»');
            c.falaAte = m.tempo.segMundo + 300;
          }
          a.feito = true;
        } else a.feito = true;
        break;
      }
      case 'ensinar': {
        const alvo = porId(m, a.alvoId);
        if (!alvo || !alvo.vivo) { a.feito = true; break; }
        if (U.dist(n.pos.x, n.pos.y, alvo.pos.x, alvo.pos.y) > 2.6) { moverPara(m, n, alvo.pos.x, alvo.pos.y, dt, 1.8); break; }
        const chaves = Object.keys(c.conhecimento).filter(k => c.conhecimento[k].conf > 0.55);
        if (chaves.length) {
          const k = chaves[m.rng.int(0, chaves.length - 1)];
          const reg = c.conhecimento[k];
          B.aprender(alvo, { tipo: 'ensinado', chave: k, valor: Math.max(0.4, reg.conf - 0.1), tag: reg.tags ? Object.keys(reg.tags)[0] : null }, m);
          if (reg.tags) for (const t in reg.tags) B.reforcar(alvo.cerebro, k, 0.5, 0.6, 'ensinado', t, m, reg.tags[t] * 0.5);
          c.feito.ensinou++;
          B.reforcar(c, k, 0.5, 0.9, 'ensinar', null, m);
          B.registrarSocial(alvo.cerebro, n, m, 0.2);
          if (m.rng.chance(0.12)) m.registrar('📚 ' + n.nome + ' ensinou algo a ' + alvo.nome + '.', 'cultura');
        }
        a.feito = true;
        break;
      }
      default: a.feito = true; break;
    }
    if (a && a.feito) { a.fim = m.tempo.segMundo; n.acaoExecutando = false; }
  }

  /* ============================================================
     TRANSPOSICAO DE IMPEDIMENTO
     ------------------------------------------------------------
     O corpo mede o mundo. Quando um alvo util esta a vista mas o corpo
     nao o alcanca, isso NAO e fracasso do objetivo: e um FATO sobre o
     alvo (um impedimento). O cerebro guarda o fato e devolve a pergunta
     "como transpor isso?". Quem responde e o aprendizado (esquema
     impedimento x operador) -- nao existe regra escrita aqui dizendo
     qual acao resolve qual problema.
     ============================================================ */

  // Detectores: recebem o corpo e o alvo e devolvem o impedimento fisico,
  // ou null. Nenhum deles sabe qual acao serve para resolver nada.
  const DETECTORES = {
    alto: function (m, n, alvo) {
      const base = (alvo.altura !== undefined) ? alvo.altura * 0.78
                                               : ((alvo.tamanho || 0.2) * 0.5);
      const zUtil = (alvo.pos.z || 0) + base;
      return zUtil > (n.pos.z + n.caps.alcanceBraco) + 0.02;
    },
    duro: function (m, n, alvo) {
      const def = alvo.tipo ? D.FLORA[alvo.tipo] : null;
      if (!def) return false;
      if (def.tipo !== 'arvore' && def.tipo !== 'conifera' && def.tipo !== 'palmeira') return false;
      return !alvo.cortada;
    },
    pesado: function (m, n, alvo) {
      if (alvo.massa === undefined) return false;
      return alvo.massa > 40 * (0.5 + n.caps.forca);
    }
  };
  const ORDEM_DETECCAO = ['alto', 'duro', 'pesado'];

  function detectarImpedimento(m, n, alvo) {
    if (!alvo || !alvo.pos) return null;
    for (let i = 0; i < ORDEM_DETECCAO.length; i++) {
      if (DETECTORES[ORDEM_DETECCAO[i]](m, n, alvo)) return ORDEM_DETECCAO[i];
    }
    return null;
  }

  // Efeito observado: um numero tirado do ESTADO do alvo, nao do retorno da
  // primitiva. Medir por observacao permite que qualquer operador novo
  // aprenda sem inventar uma convencao propria de retorno.
  function observarEfeito(alvo) {
    if (!alvo) return 0;
    let v = 0;
    if (alvo.frutos !== undefined) v += alvo.frutos * 4;
    if (alvo.nFolhas !== undefined) v += alvo.nFolhas * 0.1;
    if (alvo.q !== undefined) v += alvo.q * 0.2;
    v += (alvo.pos.z || 0) * 0.05;
    if (alvo.cortada) v += 200;
    return v;
  }

  // Operadores: a acao fisica em si. Nao devolvem efeito -- quem mede e
  // observarEfeito(). Se o corpo nao tem o que a acao exige, ela nao acontece.
  const EXECUTORES = {
    sacudir: function (m, n, alvo) { sacudirPlanta(m, n, alvo, 'sacudir'); },
    puxar: function (m, n, alvo) { puxarPlanta(m, n, alvo); },
    arremessar: function (m, n, alvo) {
      const pedra = (n.inventario || []).find(i => i.tipo === 'pedra');
      if (!pedra) return;
      const zA = (alvo.pos.z || 0) + (alvo.altura || 0.5) * 0.78;
      arremessar(m, n, pedra, { pos: { x: alvo.pos.x, y: alvo.pos.y, z: zA }, tamanho: 0.2 }, 1);
      largar(m, n, pedra);
    }
  };

  // Puxar: agarra o que estiver ao alcance e traciona. Efeito menor e mais
  // incerto que sacudir, mas NAO exige pedra nem ferramenta. Existe porque
  // o corpo humano faz isso -- nao porque alguem decidiu que "resolve".
  function puxarPlanta(m, n, p) {
    if (!p || !p.frutos) return 0;
    let caiu = 0;
    const forca = 0.1 + n.caps.forca * 0.35;
    if (m.rng.chance(0.18 + forca * 0.45)) {
      p.frutos--;
      const fruta = criarObjeto(m, p.frutoTipo, p.pos.x, p.pos.y, m.rng, { pos: { x: p.pos.x + m.rng.range(-1.2, 1.2), y: p.pos.y + m.rng.range(-1.2, 1.2), z: p.pos.z + p.altura * 0.8 }, vz: -0.5, emRepouso: false });
      fruta.visual = 'vis:' + p.frutoTipo;
      caiu++;
    }
    return caiu;
  }

  function sacudirPlanta(m, n, p, modo) {
    const def = D.FLORA[p.tipo];
    let caiu = 0;
    const forca = 0.3 + n.caps.forca * 0.6;
    const alvo = p.frutos > 0 ? Math.min(p.frutos, 1 + Math.floor(forca * 3)) : 0;
    for (let i = 0; i < alvo; i++) {
      if (m.rng.chance(0.45 + forca * 0.5)) {
        p.frutos--;
        const fruta = criarObjeto(m, p.frutoTipo, p.pos.x, p.pos.y, m.rng, { pos: { x: p.pos.x + m.rng.range(-1.5, 1.5), y: p.pos.y + m.rng.range(-1.5, 1.5), z: p.pos.z + p.altura * 0.8 }, vz: -0.5, emRepouso: false });
        fruta.visual = 'vis:' + p.frutoTipo;
        caiu++;
      }
    }
    // derruba folhas também
    if (p.nFolhas > 3 && m.rng.chance(0.5)) {
      const q = Math.min(3, p.nFolhas - 2);
      p.nFolhas -= q;
      for (let i = 0; i < q; i++) criarObjeto(m, 'folha', p.pos.x + m.rng.range(-2, 2), p.pos.y + m.rng.range(-2, 2), m.rng, { emRepouso: false, vz: -0.2 });
    }
    if (caio_vazio(caiu) && p.frutos === 0) n.cerebro.pensamento = 'não caiu nada';
    return caiu;
  }
  function caio_vazio(x) { return x === 0; }

  /* ---------- COLHER da planta (ramos, fibra, folhas, tronco) ---------- */
  function colherRecurso(m, n, p) {
    const def = D.FLORA[p.tipo];
    if (!def) return null;
    if (p.tipo && (def.tipo === 'arvore' || def.tipo === 'conifera' || def.tipo === 'palmeira')) {
      const f = usarFerramenta(n, 'corte');
      if (!f) return null;                         // sem machado não derruba árvore
      quebrarFerramenta(m, n, f);
      p.cortada = true;
      const nT = 2 + Math.floor(n.caps.forca * 3);
      for (let i = 0; i < nT; i++) criarObjeto(m, 'tronco', p.pos.x + m.rng.range(-1.5, 1.5), p.pos.y + m.rng.range(-1.5, 1.5), m.rng);
      for (let i = 0; i < 6; i++) criarObjeto(m, 'graveto', p.pos.x + m.rng.range(-2, 2), p.pos.y + m.rng.range(-2, 2), m.rng);
      m.registrar('🪓 ' + n.nome + ' derrubou uma árvore.', 'detalhe');
      return 'tronco';
    }
    return def.colheita || 'folha';
  }

  /* ---------- AÇÕES DO ANIMAL ---------- */
  function executarAcaoAnimal(m, a, dt) {
    const def = D.FAUNA[a.especie];
    const ac = a.acao;
    if (!ac) return;
    ac.progresso = (ac.progresso || 0) + dt;
    switch (ac.tipo) {
      case 'ir': {
        const vel = (def.velMax || 1.5) * (a.fugindo ? 1.25 : 0.55);
        const dx = ac.x - a.pos.x, dy = ac.y - a.pos.y;
        const d = Math.hypot(dx, dy);
        if (d < (ac.proximidade || 0.8)) { ac.feito = true; break; }
        const passo = Math.min(vel * dt, d);
        const nx = a.pos.x + dx / d * passo, ny = a.pos.y + dy / d * passo;
        const hd = alturaEm(m, nx, ny);
        const okTerreno = def.nado ? (hd < -0.1) : (hd > -1.1);
        if (okTerreno) { a.pos.x = nx; a.pos.y = ny; }
        else { ac.feito = true; }
        a.pos.z = alturaEm(m, a.pos.x, a.pos.y) + a.tamanho;
        a.dir = U.angLerp(a.dir, Math.atan2(dy, dx), 0.2);
        a.velocidadeAtual = vel;
        if (ac.progresso > 900) ac.feito = true;
        break;
      }
      case 'cacar': {
        const alvo = porId(m, ac.alvoId);
        if (!alvo || alvo.vivo === false || (alvo.classe === 'animal' && !alvo.vivo)) { ac.feito = true; break; }
        const d = U.dist(a.pos.x, a.pos.y, alvo.pos.x, alvo.pos.y);
        if (d > 1.6) {
          const vel = def.velMax * 1.0;
          const dx = alvo.pos.x - a.pos.x, dy = alvo.pos.y - a.pos.y;
          a.pos.x += dx / d * Math.min(vel * dt, d);
          a.pos.y += dy / d * Math.min(vel * dt, d);
          a.pos.z = alturaEm(m, a.pos.x, a.pos.y) + a.tamanho;
          a.velocidadeAtual = vel;
          if (ac.progresso > 300) ac.feito = true;
        } else {
          a.velocidadeAtual = 0;
          if (ac.progresso > 0.8) {
            ac.progresso = 0;
            if (alvo.classe === 'animal') {
              alvo.corpo.saude -= def.forca * 0.5;
              alvo.fugindo = true;
              alvo.acao = { tipo: 'fugir', alvoId: a.id, progresso: 0 };
            } else if (alvo.classe === 'humano') {
              ferir(alvo, def.forca * 0.22, 'predador', def.nome, m);
            }
            a.corpo.fome = Math.max(0, a.corpo.fome - 12);
          }
          if (a.corpo.fome < 15 || ac.progresso > 120) ac.feito = true;
        }
        break;
      }
      case 'fugir': {
        const am = porId(m, ac.alvoId);
        if (!am) { ac.feito = true; break; }
        const ang = Math.atan2(a.pos.y - am.pos.y, a.pos.x - am.pos.x);
        const vel = (def.velMax || 2) * 1.3;
        a.pos.x = U.clamp(a.pos.x + Math.cos(ang) * vel * dt, 2, TAM - 3);
        a.pos.y = U.clamp(a.pos.y + Math.sin(ang) * vel * dt, 2, TAM - 3);
        a.pos.z = alturaEm(m, a.pos.x, a.pos.y) + a.tamanho;
        a.velocidadeAtual = vel;
        a.fugindo = true;
        if (U.dist(a.pos.x, a.pos.y, am.pos.x, am.pos.y) > 24 || ac.progresso > 30) ac.feito = true;
        break;
      }
      default: ac.feito = true;
    }
  }

  /* ---------- FERIMENTOS ---------- */
  function ferir(n, dano, tipo, fonte, m) {
    if (!n || !n.vivo) return;
    n.corpo.saude -= dano;
    n.corpo.ferimentos.push({ t: 0, tipo: tipo, dano: dano, fonte: fonte });
    B.aprender(n, { tipo: 'dor', nome: fonte, visual: tipo === 'predador' ? 'vis:animal_perigoso' : null }, m);
    if (n.corpo.saude < 40) n.corpo.energia = U.clamp(n.corpo.energia - 20, 0, 100);
  }

  /* ---------- NASCIMENTO ---------- */
  function nascer(m, mae) {
    const pai = mae.parceiro ? porId(m, mae.parceiro) : null;
    const gene = B.genomaFilho(pai ? pai.gene : mae.gene, mae.gene, m.rng, {
      hostilidade: U.clamp01(m.contadores.mortes.predador ? 0.6 : 0.15),
      escassez: U.clamp01(m.contadores.mortes.fome ? 0.7 : 0.2)
    });
    const bebe = criarHumano(m, mae.pos.x, mae.pos.y, m.rng, {
      gene: gene, idadeAnos: 0, sexo: m.rng.chance(0.5) ? 'M' : 'F',
      pais: [mae.id, pai ? pai.id : null].filter(Boolean), geracao: (mae.cerebro.geracao || 0) + 1
    });
    B.herdarCultura(bebe, [mae, pai].filter(Boolean), m);
    mae.filhos.push(bebe.id);
    if (pai) pai.filhos.push(bebe.id);
    B.aprender(mae, { tipo: 'criou_filho', nome: bebe.nome }, m);
    if (pai) B.aprender(pai, { tipo: 'criou_filho', nome: bebe.nome }, m);
    m.contadores.nascimentos++;
    m.contadores.geracoes = Math.max(m.contadores.geracoes || 1, bebe.cerebro.geracao || 1);
    m.registrar('👶 Nasceu ' + bebe.nome + ' — filho de ' + mae.nome + (pai ? ' e ' + pai.nome : '') + '.', 'vida');
    return bebe;
  }
  function nascerAnimal(m, a) {
    const def = D.FAUNA[a.especie];
    const filhote = criarAnimal(m, a.especie, a.pos.x + m.rng.range(-2, 2), a.pos.y + m.rng.range(-2, 2), m.rng);
    if (filhote) {
      filhote.idadeSeg = 0;
      filhote.tamanho = def.altura * 0.4;
      filhote.corpo.saude = 100;
      for (const k in a.gene) filhote.gene[k] = U.clamp01(a.gene[k] + m.rng.gauss(0, 0.06));
      filhote.domesticado = a.domesticado * 0.8;
      filhote.dono = a.dono;
      a.ultimoFilho = m.tempo.segMundo;
    }
  }

  /* ---------- OBRAS ---------- */
  function criarObra(m, n, tipo, x, y, receitaId) {
    const def = D.ESTRUTURAS[tipo];
    x = U.clamp(x, 2, TAM - 3); y = U.clamp(y, 2, TAM - 3);
    const mats = {};
    let total = 0;
    for (const k in def.materiais) { mats[k] = { total: def.materiais[k], entregue: 0 }; total += def.materiais[k]; }
    const obra = {
      id: 'b' + (m.proxId++), classe: 'construcao', tipo: tipo, nome: def.nome,
      pos: { x: x, y: y, z: alturaEm(m, x, y) }, largura: Math.sqrt(def.m2 || 4) + 1, m2: def.m2,
      q: 0, progresso: 0, pronta: false, colapsou: false, abrigo: 0, especial: def.especial || null,
      materiais: mats, totalPecas: total, pecas: [], construtores: [n.id], percepivel: true,
      cor: def.cor, receita: receitaId || null, criadaEm: m.tempo.segMundo, desgaste: 0,
      tamanho: 1.5, alturaParcial: 0.3
    };
    m.construcoes.push(obra); m.entidades.push(obra);
    m.registrar('🔨 ' + n.nome + ' começou a obra: ' + def.nome + '.', 'construcao');
    return obra;
  }

  /* ---------- ATUALIZAÇÕES DE ABRIGO E DESGASTE ---------- */
  function atualizarConstrucoes(m, dt) {
    const dias = dt / U.SEG_DIA;
    const ce = climaAtual(m);
    for (const o of m.construcoes) {
      if (o.colapsou) continue;
      o.desgaste += dias * (0.0009 * (1 - o.q) + (ce.tipo === 'tempestade' || ce.tipo === 'vendaval' ? 0.004 : 0));
      if (o.pronta && o.desgaste > 1) {
        o.desgaste = 0;
        o.q -= 0.08;
        if (o.q <= 0.05 && m.rng.chance(0.6)) {
          o.colapsou = true; o.pronta = false;
          m.registrar('🏚️ ' + o.nome + ' desabou com o tempo.', 'colapso');
        }
      }
    }
    if (m.tempo.tick % 120 === 0) {
      for (const n of m.npcs) {
        if (!n.vivo) continue;
        const ab = m.construcoes.find(o => o.pronta && !o.colapsou && o.abrigo > 0.25 && U.dist(o.pos.x, o.pos.y, n.pos.x, n.pos.y) < o.largura * 0.75 + 2);
        n.emAbrigo = !!ab;
      }
    }
  }

  /* ============================================================
     PODERES DIVINOS (o chat do usuário)
     ============================================================ */
  function invocar(m, especie, x, y, qtd, extras) {
    qtd = qtd || 1;
    const criados = [];
    if (!especie) return criados;
    const nome = String(especie).toLowerCase();
    if (nome === 'humano' || nome === 'humana' || nome === 'pessoa' || nome === 'humans' || nome === 'npcs' || nome === 'gente') {
      for (let i = 0; i < qtd; i++) {
        const sexo = (extras && extras.sexo) || (m.rng.chance(0.5) ? 'M' : 'F');
        const h = criarHumano(m, (x || m.centro.x) + m.rng.range(-2, 2), (y || m.centro.y) + m.rng.range(-2, 2), m.rng, { idadeAnos: extras && extras.idade !== undefined ? extras.idade : m.rng.range(16, 32), sexo: sexo, lingua: m.cultura.riqueza > 8 ? 2 : 1 });
        criados.push(h);
      }
      m.registrar('✨ ' + qtd + ' humano(s) apareceram.', 'divino');
      return criados;
    }
    for (let i = 0; i < qtd; i++) {
      const a = criarAnimal(m, nome, (x || TAM / 2) + m.rng.range(-3, 3), (y || TAM / 2) + m.rng.range(-3, 3), m.rng);
      if (a) criados.push(a);
    }
    if (criados.length) m.registrar('✨ ' + criados.length + '× ' + (D.FAUNA[nome] ? D.FAUNA[nome].nome : nome) + ' foram invocados.', 'divino');
    reconstruirGrade(m);
    return criados;
  }

  function reviver(m, id) {
    const alvos = id === 'todos' || id === 'all' ? m.mortos.slice() : m.mortos.filter(x => x.id === id || x.nome === id);
    const feitos = [];
    for (const morto of alvos) {
      const h = criarHumano(m, morto.pos.x, morto.pos.y, m.rng, {
        gene: morto.gene, idadeAnos: Math.max(15, U.idadeAnos(morto.idadeSeg) * 0.75),
        sexo: morto.sexo, nome: morto.nome, lingua: morto.cerebro ? morto.cerebro.nivelLingua : 1,
        geracao: morto.cerebro ? morto.cerebro.geracao : 0
      });
      h.ressuscitado = true;
      h.corpo.energia = 70; h.corpo.saude = 100; h.corpo.fome = 25; h.corpo.sede = 25;
      m.registrar('🕊️ ' + h.nome + ' voltou à vida.', 'divino');
      const i = m.mortos.indexOf(morto);
      if (i >= 0) m.mortos.splice(i, 1);
      feitos.push(h);
    }
    if (id === 'todos') m.mortos.length = 0;
    return feitos;
  }

  function curar(m, quem) {
    const alvos = quem === 'todos' || !quem ? m.npcs.filter(n => n.vivo) : [quem].flat().filter(n => n && n.vivo);
    for (const n of alvos) {
      n.corpo.saude = 100; n.corpo.fome = Math.min(n.corpo.fome, 25); n.corpo.sede = Math.min(n.corpo.sede, 25);
      n.corpo.ferimentos.length = 0; n.corpo.temperaturaCorp = 36.5; n.corpo.energia = 100;
    }
    if (alvos.length) m.registrar('💚 ' + alvos.length + ' pessoa(s) foram curadas.', 'divino');
    return alvos.length;
  }

  function teleportar(m, n, x, y) {
    if (!n) return false;
    n.pos.x = U.clamp(x, 2, TAM - 3); n.pos.y = U.clamp(y, 2, TAM - 3);
    n.pos.z = alturaEm(m, n.pos.x, n.pos.y) + 0.9;
    n.acao = null; n.plano = null; n.planoIdx = 0;
    return true;
  }

  function darItem(m, tipo, qtd, quem) {
    if (!D.ITENS[tipo]) return 0;
    const alvos = quem === 'todos' || !quem ? m.npcs.filter(n => n.vivo) : [quem].flat().filter(n => n && n.vivo);
    let total = 0;
    for (const n of alvos) {
      for (let i = 0; i < (qtd || 1); i++) {
        const o = criarObjeto(m, tipo, n.pos.x, n.pos.y, m.rng);
        o.pos.z = n.pos.z;
        if (!segurar(m, n, o)) largar(m, n, o);
        total++;
      }
    }
    if (total) m.registrar('🎁 ' + total + '× ' + D.ITENS[tipo].nome + ' entregues.', 'divino');
    return total;
  }

  function pintarBioma(m, x, y, raio, bioma) {
    const bi = BIOMA_IDS.indexOf(bioma);
    if (bi < 0) return false;
    const reg = regiaoAtiva(m);
    const def = D.BIOMAS[bioma];
    for (let ty = Math.max(0, (y - raio) | 0); ty < Math.min(TAM, y + raio); ty++) {
      for (let tx = Math.max(0, (x - raio) | 0); tx < Math.min(TAM, x + raio); tx++) {
        if (U.dist(tx, ty, x, y) > raio) continue;
        const i = idx(tx, ty);
        reg.tipo[i] = bi;
        reg.fertilidade[i] = def.fertil;
        if (def.agua) reg.alturaTerreno[i] = Math.min(reg.alturaTerreno[i], -0.6);
      }
    }
    m.registrar('🎨 Bioma ' + def.nome + ' pintado em (' + (x | 0) + ',' + (y | 0) + ') raio ' + raio + '.', 'divino');
    return true;
  }

  function catastrofe(m, tipo, x, y, raio) {
    raio = raio || 12;
    const reg = regiaoAtiva(m);
    if (tipo === 'meteoro') {
      for (let ty = Math.max(0, (y - raio) | 0); ty < Math.min(TAM, y + raio); ty++)
        for (let tx = Math.max(0, (x - raio) | 0); tx < Math.min(TAM, x + raio); tx++) {
          if (U.dist(tx, ty, x, y) > raio) continue;
          const i = idx(tx, ty);
          reg.alturaTerreno[i] -= (1 - U.dist(tx, ty, x, y) / raio) * 4;
        }
      for (const p of m.plantas) if (U.dist(p.pos.x, p.pos.y, x, y) < raio) { p.cortada = true; p.q = 0; }
      for (const n of m.npcs) if (n.vivo && U.dist(n.pos.x, n.pos.y, x, y) < raio) ferir(n, 80, 'acidente', 'meteoro', m);
      for (const a of m.animais) if (U.dist(a.pos.x, a.pos.y, x, y) < raio) a.corpo.saude -= 90;
      m.registrar('☄️ Um meteoro caiu em (' + (x | 0) + ',' + (y | 0) + ')!', 'catastrofe');
    } else if (tipo === 'incendio') {
      for (let i = 0; i < 6; i++) {
        const fx = x + m.rng.range(-raio, raio), fy = y + m.rng.range(-raio, raio);
        const f = { id: 'f' + (m.proxId++), classe: 'fogo', tipo: 'incendio', nome: 'Incêndio', pos: { x: fx, y: fy, z: alturaEm(m, fx, fy) + 0.2 }, tamanho: 2.2, cor: '#ff6a1a', combustivel: 400, percepivel: true, som: 'rugido', abrigo: 0, dano: 1 };
        m.fogos.push(f); m.entidades.push(f);
      }
      m.registrar('🔥 Um incêndio começou em (' + (x | 0) + ',' + (y | 0) + ')!', 'catastrofe');
    } else if (tipo === 'terremoto') {
      for (const o of m.construcoes) if (U.dist(o.pos.x, o.pos.y, x, y) < raio * 2) { o.q -= 0.35; if (m.rng.chance(0.5)) { o.colapsou = true; o.pronta = false; } }
      for (const n of m.npcs) if (n.vivo && U.dist(n.pos.x, n.pos.y, x, y) < raio * 2) { ferir(n, 18, 'acidente', 'terremoto', m); n.acao = null; }
      m.registrar('🌋 Terremoto em (' + (x | 0) + ',' + (y | 0) + ')!', 'catastrofe');
    } else if (tipo === 'enchente') {
      for (let ty = Math.max(0, (y - raio) | 0); ty < Math.min(TAM, y + raio); ty++)
        for (let tx = Math.max(0, (x - raio) | 0); tx < Math.min(TAM, x + raio); tx++) {
          if (U.dist(tx, ty, x, y) > raio) continue;
          reg.alturaTerreno[idx(tx, ty)] -= 2.2;
        }
      m.registrar('🌊 Enchente em (' + (x | 0) + ',' + (y | 0) + ')!', 'catastrofe');
    } else if (tipo === 'praga') {
      for (const p of m.plantas) if (U.dist(p.pos.x, p.pos.y, x, y) < raio * 2) p.q = 0.05;
      m.registrar('🐛 Uma praga atacou as plantas.', 'catastrofe');
    }
    reconstruirGrade(m);
    return true;
  }

  function ensinarPoder(m, quem, chave) {
    const alvos = quem === 'todos' || !quem ? m.npcs.filter(n => n.vivo) : [quem].flat().filter(n => n && n.vivo);
    for (const n of alvos) {
      B.reforcar(n.cerebro, chave, 0.95, 0.85, 'divino', null, m);
      if (D.CONCEITOS[chave] && D.CONCEITOS[chave].grupo === 'abstrato' && chave === 'c:contagem') n.cerebro.nivelLingua = Math.max(n.cerebro.nivelLingua, 2);
    }
    if (alvos.length) m.registrar('📖 Revelação divina: "' + (D.CONCEITOS[chave] ? D.CONCEITOS[chave].label : chave) + '" para ' + alvos.length + ' pessoa(s).', 'divino');
    if (!m.cultura.conhecimentos[chave]) { m.cultura.conhecimentos[chave] = { n: alvos.length, primeiraVez: m.tempo.segMundo, descobridor: 'o Criador', eficiencia: 0.9 }; m.cultura.riqueza++; }
    if (chave.startsWith('t:r_')) {
      const r = D.RECEITAS.find(x => 't:' + x.id === chave);
      if (r) { m.contadores.receitas++; m.cultura.descobertas.push({ id: r.id, nome: r.nome, por: 'o Criador', t: m.tempo.segMundo, tier: r.tier }); }
    }
    return alvos.length;
  }

  /* ============================================================
     CENSO E SERIALIZAÇÃO
     ============================================================ */
  function censo(m) {
    const porEspecie = {};
    for (const a of m.animais) porEspecie[a.especie] = (porEspecie[a.especie] || 0) + 1;
    return {
      populacao: m.npcs.filter(n => n.vivo).length,
      mortos: m.mortos.length,
      animais: m.animais.length,
      porEspecie: porEspecie,
      plantas: m.plantas.length,
      objetos: m.objetos.length,
      construcoes: m.construcoes.filter(c => c.pronta && !c.colapsou).length,
      ruinas: m.construcoes.filter(c => c.colapsou).length,
      nascimentos: m.contadores.nascimentos,
      mortes: m.contadores.mortes,
      geracoes: Math.max(1, ...m.npcs.filter(n => n.vivo).map(n => (n.cerebro.geracao || 0) + 1)),
      cultura: m.cultura.riqueza,
      receitas: m.contadores.receitas,
      plantasCultivadas: m.plantacoes.length
    };
  }

  function seriar(m) {
    const reg = regiaoAtiva(m);
    const limpaNpc = (n) => {
      const o = {};
      for (const k in n) {
        if (k === 'caps') continue;                       // recalculado
        o[k] = n[k];
      }
      if (n.cerebro) {
        o.cerebro = JSON.parse(JSON.stringify(n.cerebro, (k, v) => (k === 'ref' ? undefined : v)));
      }
      return o;
    };
    return {
      versao: m.versao, seed: m.seed, tempo: m.tempo, clima: m.clima, cultura: m.cultura,
      planeta: m.planeta, centro: m.centro, contadores: m.contadores, proxId: m.proxId,
      proximoNomeM: m.proximoNomeM, proximoNomeF: m.proximoNomeF,
      regiao: {
        id: reg.id, nome: reg.nome, lat: reg.lat, lon: reg.lon,
        alturaTerreno: Array.from(reg.alturaTerreno).map(v => Math.round(v * 100) / 100),
        tipo: Array.from(reg.tipo), umidade: Array.from(reg.umidade).map(v => Math.round(v * 100) / 100),
        fertilidade: Array.from(reg.fertilidade).map(v => Math.round(v * 100) / 100),
        temperatura: Array.from(reg.temperatura).map(v => Math.round(v * 10) / 10),
        rio: reg.rio, lagos: reg.lagos
      },
      npcs: m.npcs.map(limpaNpc),
      animais: m.animais.map(a => ({ id: a.id, classe: a.classe, especie: a.especie, sexo: a.sexo, nome: a.nome, pos: a.pos, dir: a.dir, tamanho: a.tamanho, cor: a.cor, som: a.som, corpo: a.corpo, gene: a.gene, idadeSeg: a.idadeSeg, domesticado: a.domesticado, dono: a.dono, gravida: a.gravida, vivo: a.vivo, tamanho2: a.tamanho, percepivel: true, estado: a.estado })),
      objetos: m.objetos.map(o => ({ id: o.id, classe: o.classe, tipo: o.tipo, nome: o.nome, pos: o.pos, massa: o.massa, tamanho: o.tamanho, cor: o.cor, visual: o.visual, conteudo: o.conteudo, integridade: o.integridade, qualidade: o.qualidade, dono: o.dono, percepivel: true, emRepouso: true })),
      plantas: m.plantas, construcoes: m.construcoes, aguas: m.aguas, fogos: m.fogos, plantacoes: m.plantacoes,
      mortos: m.mortos, eventos: m.eventos.slice(-120)
    };
  }

  function desserializar(json) {
    const m = criar({ seed: json.seed, vazio: true, segInicial: json.tempo ? json.tempo.segMundo : 0 });
    m.tempo = Object.assign(m.tempo, json.tempo || {});
    m.clima = Object.assign(m.clima, json.clima || {});
    m.cultura = json.cultura || m.cultura;
    m.planeta = json.planeta || m.planeta;
    m.centro = json.centro || { x: TAM / 2, y: TAM / 2 };
    m.contadores = json.contadores || m.contadores;
    m.proxId = json.proxId || 1;
    m.proximoNomeM = json.proximoNomeM || 2;
    m.proximoNomeF = json.proximoNomeF || 2;
    m.mortos = json.mortos || [];
    m.eventos = json.eventos || [];
    const reg = regiaoAtiva(m);
    const r = json.regiao;
    if (r) {
      reg.nome = r.nome; reg.lat = r.lat; reg.lon = r.lon;
      reg.alturaTerreno = Float32Array.from(r.alturaTerreno || []);
      reg.tipo = Uint8Array.from(r.tipo || []);
      reg.umidade = Float32Array.from(r.umidade || []);
      reg.fertilidade = Float32Array.from(r.fertilidade || []);
      reg.temperatura = Float32Array.from(r.temperatura || []);
      reg.rio = r.rio || []; reg.lagos = r.lagos || [];
    }
    m.entidades = [];
    m.npcs = (json.npcs || []).map(n => {
      n.caps = B.capacidades(n);
      return n;
    });
    m.animais = json.animais || [];
    m.objetos = json.objetos || [];
    m.plantas = json.plantas || [];
    m.construcoes = json.construcoes || [];
    m.aguas = json.aguas || [];
    m.fogos = json.fogos || [];
    m.plantacoes = json.plantacoes || [];
    for (const arr of [m.npcs, m.animais, m.objetos, m.plantas, m.construcoes, m.aguas, m.fogos, m.plantacoes]) {
      for (const e of arr) m.entidades.push(e);
    }
    for (const a of m.animais) a.cerebro = { perceptos: [], tDecisao: 0, tPercepcao: 0, memoria: {}, medo: 0 };
    reconstruirGrade(m);
    return m;
  }

  return {
    TAM, TILE, G, CELULA, AREA, BIOMA_IDS,
    criar, tick, passoMundo, desserializar,
    regiaoAtiva, alturaEm, biomaEm, biomaDef, profundidadeEm, ehAguaDoce, ehAgua, luzNoite, climaAtual, tempAmbiente,
    criarPlanta, criarObjeto, criarAnimal, criarHumano, nomeHumano, criarFundadores,
    reconstruirGrade, proximos, porId, temVisaoLivre, segCirculo,
    fisicaObjetos, arremessar, definirClima, ferir, largar, segurar, cargaAtual,
    simularCorpo, simularCorpoAnimal, simularCorpoRapido,
    atualizarPlantas, atualizarFogo, atualizarPlantacoes, atualizarConstrucoes,
    registrarMorte, checarMorte, checarMorteAnimal,
    registrar, registrarCultura, registrarDescoberta,
    temConstrucaoPerto, objetosPerto, contarObjetoPerto,
    gerarRegiao, semearVida, criarObra, colherRecurso, sacudirPlanta, distBorda,
    invocar, reviver, curar, teleportar, darItem, pintarBioma, catastrofe, ensinarPoder,
    censo, seriar
  };
});
