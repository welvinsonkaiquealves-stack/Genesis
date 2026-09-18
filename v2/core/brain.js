/* ============================================================
   GÊNESIS v2 — core/brain.js
   CÉREBRO EVOLUTIVO (plano completo, camadas 1..54)

     CORPO → PERCEPÇÃO → ATENÇÃO → MEMÓRIA → NECESSIDADES →
     EMOÇÃO → MODELO DO MUNDO → LÓGICA/CAUSALIDADE → HIPÓTESES →
     PLANEJAMENTO → SIMULAÇÃO DE FUTUROS → DECISÃO → AÇÃO →
     RESULTADO → APRENDIZADO → COMUNICAÇÃO → CULTURA
     + GENÉTICA → PREDISPOSIÇÕES → SELEÇÃO → NOVA GENÉTICA

   O cérebro NÃO move o corpo: ele decide e grava npc.acao.
   O mundo (world.js) executa a física e devolve o resultado.
   Todo o estado é dado puro (serializável).
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./util.js'), require('./data.js'));
  else root.GenesisBrain = factory(root.GenesisUtil, root.GenesisData);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (U, D) {
  'use strict';

  /* ============================================================
     0. GENOMA — predisposições (nunca conhecimento)
     ============================================================ */
  const GENES = [
    'aprendizado', 'memoria', 'curiosidade', 'atencao', 'planejamento', 'risco',
    'cooperacao', 'criatividade', 'percepcao', 'social', 'abstracao', 'persistencia',
    'impulsividade', 'agressividade', 'altruismo', 'empatia', 'metabolismo',
    'forca', 'velocidade', 'resistencia', 'destreza', 'acuidade', 'longevidade', 'fertilidade'
  ];

  function genomaAleatorio(rng, base) {
    const g = {};
    for (const k of GENES) {
      let v = U.clamp01(0.5 + rng.gauss(0, 0.16));
      if (base && base[k] !== undefined) v = U.clamp01(base[k] * 0.55 + v * 0.45);
      g[k] = v;
    }
    g.longevidade = U.clamp(65 + g.longevidade * 32, 45, 108);   // anos
    g.altura = U.clamp(1.52 + g.forca * 0.28 + rng.gauss(0, 0.05), 1.35, 2.05);
    g.metabolismo = U.clamp(0.8 + g.metabolismo * 0.5, 0.7, 1.7);
    return g;
  }

  function genomaFilho(genA, genB, rng, pressao) {
    const g = {};
    for (const k of GENES) {
      let v = (genA[k] + genB[k]) * 0.5;
      if (rng.chance(0.35)) v = rng.chance(0.5) ? genA[k] : genB[k];
      v += rng.gauss(0, 0.055);                                  // mutação
      // pressao por gene so existe quando o chamador passa uma FUNCAO.
      // O mundo passa um OBJETO {hostilidade, escassez}, tratado mais abaixo:
      // sem esta guarda todo parto estourava TypeError e a natalidade era zero.
      if (typeof pressao === 'function') v += pressao(k) * 0.06 * (rng.next() - 0.35);
      g[k] = U.clamp01(v);
    }
    g.longevidade = U.clamp((genA.longevidade + genB.longevidade) / 2 + rng.gauss(0, 3.5), 40, 115);
    g.altura = U.clamp((genA.altura + genB.altura) / 2 + rng.gauss(0, 0.035), 1.3, 2.1);
    g.metabolismo = U.clamp((genA.metabolismo + genB.metabolismo) / 2 + rng.gauss(0, 0.08), 0.7, 1.8);
    // pressao seletiva direta: ambiente hostil empurra percepcao/cautela/planejamento
    if (pressao && typeof pressao === 'object') {
      const h = pressao.hostilidade || 0;
      g.percepcao = U.clamp01(g.percepcao + h * 0.05);
      g.planejamento = U.clamp01(g.planejamento + h * 0.05);
      g.risco = U.clamp01(g.risco - h * 0.06);
      g.cooperacao = U.clamp01(g.cooperacao + (pressao.escassez || 0) * 0.05);
    }
    return g;
  }

  /* ============================================================
     1. CAPACIDADES FÍSICAS x IDADE
     O corpo envelhece: o que era rápido fica lento, a vista cai,
     a força vai embora. É aqui que isso vira número.
     ============================================================ */
  const CURVAS = {
    forca: { sobe: 17, pico: 28, cai: 42, perda40: 0.75 },
    velocidade: { sobe: 13, pico: 24, cai: 34, perda40: 0.78 },
    resistencia: { sobe: 15, pico: 26, cai: 36, perda40: 0.7 },
    destreza: { sobe: 12, pico: 30, cai: 52, perda40: 0.45 },
    visao: { sobe: 14, pico: 20, cai: 40, perda40: 0.85 },
    audicao: { sobe: 10, pico: 20, cai: 48, perda40: 0.6 },
    cognitivo: { sobe: 23, pico: 34, cai: 62, perda40: 0.38 },
    fertilidade: { sobe: 14, pico: 22, cai: 42, perda40: 1.0 }
  };
  function curvaIdade(campo, anos) {
    const k = CURVAS[campo] || CURVAS.forca;
    if (anos <= 0) return 0.05;
    if (anos < k.sobe) {
      const t = anos / k.sobe;
      return U.clamp(0.14 + 0.86 * U.suave(t) + (t > 0.85 ? 0.06 : 0), 0.05, 1.08);
    }
    if (anos <= k.cai) return 1.06 - (anos - k.pico) * 0.002;
    const d = anos - k.cai;
    return Math.max(0.16, 1 - (d / 40) * k.perda40);
  }

  function capacidades(npc) {
    const anos = U.idadeAnos(npc.idadeSeg);
    const g = npc.gene;
    const c = {};
    c.forca = curvaIdade('forca', anos) * (0.55 + g.forca * 0.9);
    c.velocidade = curvaIdade('velocidade', anos) * (0.6 + g.velocidade * 0.85);
    c.resistencia = curvaIdade('resistencia', anos) * (0.55 + g.resistencia * 0.9);
    c.destreza = curvaIdade('destreza', anos) * (0.5 + g.destreza * 1.0);
    c.visao = curvaIdade('visao', anos) * (0.55 + g.acuidade * 0.85) * (0.6 + g.percepcao * 0.8);
    c.audicao = curvaIdade('audicao', anos) * (0.6 + g.percepcao * 0.7);
    c.cognitivo = curvaIdade('cognitivo', anos) * (0.45 + g.abstracao * 0.6 + g.aprendizado * 0.55);
    c.fertilidade = curvaIdade('fertilidade', anos) * g.fertilidade;
    c.idadeAnos = anos;
    c.alcanceVisao = 3 + c.visao * 34;                       // metros
    c.alcanceOuvido = 6 + c.audicao * 26;
    c.fov = (Math.PI * (0.72 + c.visao * 0.2));               // campo de visão
    c.altura = g.altura * (anos < 14 ? 0.45 + anos * 0.04 : 1);
    c.alcanceBraco = c.altura * 0.52 + 0.35;                  // até onde a mão chega
    c.cargaMax = 4 + c.forca * 28;                            // kg
    c.velAndar = 0.55 + c.velocidade * 1.15;
    c.velCorrer = c.velAndar * (2.0 + c.resistencia * 0.7);
    c.fase = anos < 2 ? 'bebe' : anos < 7 ? 'crianca' : anos < 14 ? 'jovem' : anos < 20 ? 'adolescente' : anos < 45 ? 'adulto' : anos < 62 ? 'maduro' : 'idoso';
    return c;
  }

  function capsAnimal(an) {
    const def = D.FAUNA[an.especie] || { visao: 20, altura: 0.5, velMax: 2, vidaAnos: 10, maturidade: 1 };
    const sv = def.sentidos ? def.sentidos.visao : 0.9;
    const sa = def.sentidos ? def.sentidos.audicao : 1.0;
    const anos = U.idadeAnos(an.idadeSeg);
    const senesc = anos > def.vidaAnos * 0.8 ? 0.62 : 1;
    return {
      visao: sv * 0.85 * senesc, audicao: sa * senesc, cognitivo: 0.3, forca: 0.5, destreza: 0.4,
      resistencia: 0.5, velocidade: 0.5, fertilidade: 0.5,
      alcanceVisao: (def.visao || 20) * sv * 0.8 * senesc,
      alcanceOuvido: (def.visao || 20) * sa * 0.95,
      fov: Math.PI * 0.92, altura: def.altura, alcanceBraco: def.altura * 0.4, cargaMax: Math.max(1, def.massa * 0.25),
      velAndar: (def.velMax || 2) * 0.55, velCorrer: (def.velMax || 2) * 1.15,
      fase: anos < def.maturidade ? 'crianca' : (anos > def.vidaAnos * 0.75 ? 'idoso' : 'adulto'),
      idadeAnos: anos
    };
  }

  /* ============================================================
     2. ESTADO INICIAL DO CÉREBRO
     ============================================================ */
  function novoCerebro(npc, rng, opcoes) {
    opcoes = opcoes || {};
    const g = npc.gene;
    const c = {
      // --- memória ---
      episodica: [],          // acontecimentos
      conhecimento: {},       // 'vis:X' / 'c:X' / 't:r_id' -> {conf,n,fonte,t,tags}
      mapa: {},               // 'agua'|'comida'|'abrigo'|'perigo'|'animal' -> [{x,y,t,q}]
      social: {},             // id -> {confianca,afeicao,medo,respeito,parentesco,visto,ajudou}
      // --- emoções funcionais ---
      emocao: { medo: 0, curiosidade: g.curiosidade * 45, raiva: 0, alegria: 40, tristeza: 0, tédio: 10, confianca: 50 },
      // --- atenção ---
      atencao: { foco: null, alvoId: null, desde: 0 },
      // --- raciocínio ---
      hipoteses: [],          // {texto, evid+ , evid- , conf}
      crendices: [],          // crenças culturais absorvidas
      // --- planejamento ---
      profundidade: Math.round(1 + g.planejamento * 4 + g.abstracao * 2),
      processamento: 40 + g.abstracao * 60,   // "CPU mental"
      // --- metacognição ---
      confiancaPropria: 0.5, falhasSeguidas: 0, ultimaAvaliacao: '',
      // --- personalidade (nasce da genética, muda com a vida) ---
      personalidade: {
        curiosidade: g.curiosidade, cautela: 1 - g.risco, sociabilidade: g.social,
        agressividade: g.agressividade, altruismo: g.altruismo, persistencia: g.persistencia,
        impulsividade: g.impulsividade, risco: g.risco
      },
      // --- contadores internos ---
      tPercepcao: 0, tDecisao: 0, tEmocao: 0, tMemoria: 0, tRegistro: 0,
      perceptos: [], pensamento: 'acordando...', ultimaFala: '',
      nivelLingua: opcoes.lingua || 0,
      geracao: opcoes.geracao || 0,
      // --- histórico ---
      feito: { colheu: 0, comeu: 0, bebeu: 0, construiu: 0, fabricou: 0, cacou: 0, ensinou: 0, filhos: 0, mortes: 0, fugiu: 0 },
      diario: []
    };
    return c;
  }

  /* ============================================================
     3. PERCEPÇÃO — só se sabe o que os sentidos alcançam
     ============================================================ */
  function aparenciaVisual(e) {
    switch (e.classe) {
      case 'humano': return 'vis:humanos';
      case 'animal':
        return e.especie && (D.FAUNA[e.especie] ? D.FAUNA[e.especie].perigo >= 0.5 : false)
          ? 'vis:animal_perigoso'
          : (e.tamanho && e.tamanho > 0.9 ? 'vis:animal_grande' : 'vis:animal_pequeno');
      case 'planta': return e.visual || 'vis:folha';
      case 'objeto': return e.visual || 'vis:pedra';
      case 'construcao': return 'vis:construcao';
      case 'agua': return 'vis:agua';
      case 'fogo': return 'vis:fogo';
      default: return 'vis:pedra';
    }
  }

  function perceber(npc, mundo, raioMax) {
    const caps = npc.caps || (npc.classe === 'animal' ? (npc.caps = capsAnimal(npc)) : capacidades(npc));
    const c = npc.cerebro || (npc.cerebro = { perceptos: [], conhecimento: {}, social: {}, emocao: { medo: 0 }, mapa: {} });
    const clima = mundo.clima;
    const noite = mundo.luzNoite();                     // 0 = dia claro, 1 = noite fechada
    const fatorLuz = U.clamp(1 - noite * 0.72, 0.15, 1) * (clima.visao || 1);
    const alcance = caps.alcanceVisao * fatorLuz * (npc.dormindo ? 0 : 1);
    const fov = caps.fov;
    const out = [];
    const raioBusca = Math.min(Math.max(alcance, caps.alcanceOuvido), raioMax || 40);
    const candidatos = mundo.proximos(npc.pos.x, npc.pos.y, raioBusca, npc);
    for (const e of candidatos) {
      if (e === npc || e.perceptivel === false) continue;
      const dx = e.pos.x - npc.pos.x, dy = e.pos.y - npc.pos.y;
      const d = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      const noCone = U.dentroCone(npc.pos.x, npc.pos.y, npc.dir, fov, e.pos.x, e.pos.y);
      let visto = false;
      if (d <= alcance && (noCone || d < 2.2)) {
        visto = mundo.temVisaoLivre(npc.pos.x, npc.pos.y, e.pos.x, e.pos.y, e);
        if (visto) {
          // objetos pequenos exigem proximidade e boa vista
          const tam = e.tamanho || 0.4;
          const precisa = U.clamp(3.5 / (tam + 0.25), 0.8, 26);
          if (d > precisa * (1 + (1 - caps.visao) * 0.6)) visto = false;
        }
      }
      const ouvido = !visto && d <= caps.alcanceOuvido * (e.som ? 1.4 : 0.6);
      if (!visto && !ouvido) continue;

      const apa = aparenciaVisual(e);
      const reg = c.conhecimento[apa];
      const identificado = !!(reg && reg.conf > 0.45);
      const assoc = reg && reg.tags ? reg.tags : null;
      out.push({
        id: e.id, classe: e.classe, especie: e.especie || null, nome: e.nome || null,
        x: e.pos.x, y: e.pos.y, z: (e.pos.z || 0) + (e.tamanho || 0.4) * 0.5,
        dist: d, ang: ang, dx: dx, dy: dy, dz: (e.pos.z || 0) - (npc.pos.z || 0),
        visto: visto, ouvido: !!ouvido, som: e.som || null,
        frutos: e.frutos || 0, abrigo: e.abrigo || 0, q: e.qualidade !== undefined ? e.qualidade : (e.q || 0),
        adulto: e.classe === 'humano' ? !!(e.caps && e.caps.idadeAnos >= 13) : false,
        crianca: e.classe === 'humano' ? !!(e.caps && e.caps.idadeAnos < 13) : false,
        sexo: e.classe === 'humano' ? e.sexo : null,
        parente: e.classe === 'humano' ? (!!(npc.pais && npc.pais.indexOf(e.id) >= 0) || !!(e.pais && e.pais.indexOf(npc.id) >= 0) || !!(c.social && c.social[e.id] && c.social[e.id].parentesco && c.social[e.id].parentesco !== 'parceiro')) : false,
        plantaSemente: !!e.plantaSemente,
        estado: e.estado || null,
        visual: apa, cor: e.cor || '#999', tamanho: e.tamanho || 0.4,
        movimento: U.clamp01((e.velocidadeAtual || 0) / 3),
        identificado: identificado,
        comestivel: assoc ? U.clamp01(assoc.comestivel || 0) : 0,
        venenoso: assoc ? U.clamp01(assoc.venenoso || 0) : 0,
        perigo: assoc ? U.clamp01(assoc.perigoso || 0) : (e.classe === 'animal' ? U.clamp01((D.FAUNA[e.especie] ? D.FAUNA[e.especie].perigo : 0.2) * (identificado ? 1 : 0.3)) : 0),
        agua: assoc ? U.clamp01(assoc.agua || 0) : 0,
        combustivel: assoc ? U.clamp01(assoc.combustivel || 0) : 0,
        material: assoc ? U.clamp01(assoc.construcao || 0) : 0,
        conhecido: identificado
      });
      if (out.length > 90) break;
    }
    // ordena por proximidade e relevância
    out.sort((a, b) => a.dist - b.dist);
    return out;
  }

  /* ============================================================
     4. NECESSIDADES
     ============================================================ */
  function necessidades(npc, mundo) {
    const b = npc.corpo, g = npc.gene;
    const n = {};
    n.fome = U.clamp(b.fome, 0, 100);
    n.sede = U.clamp(b.sede, 0, 100);
    n.sono = U.clamp(b.sono, 0, 100);
    const tempIdeal = 20;
    const frio = Math.max(0, tempIdeal - b.temperaturaCorp);
    const calor = Math.max(0, b.temperaturaCorp - 32);
    n.frio = U.clamp(frio * 4 + (mundo.clima.frio ? 25 : 0), 0, 100);
    n.calor = U.clamp(calor * 5 + (mundo.clima.quente ? 20 : 0), 0, 100);
    n.dor = U.clamp(100 - b.saude, 0, 100) * 0.8 + (b.ferimentos.length ? 25 : 0);
    n.medo = npc.cerebro.emocao.medo;
    n.social = U.clamp(npc.cerebro.social ? 30 : 30, 0, 100) * (npc.caps.fase === 'crianca' ? 1.4 : 1);
    n.social = U.clamp(20 + (npc.ultimoContatoSocial ? U.clamp01((mundo.tempo.segMundo - npc.ultimoContatoSocial) / 43200) : 1) * 80, 0, 100);
    n.curiosidade = npc.cerebro.emocao.curiosidade;
    n.reproducao = 0;
    const IDADE_FERTIL = 13;      // anos
    const DIAS_DESEJO = 30;       // dias ate o desejo saturar
    if (npc.caps.fertilidade > 0.25 && npc.caps.idadeAnos >= IDADE_FERTIL) {
      // A ancora e a maturidade do proprio NPC, nao a epoca do mundo:
      // antes, quem nunca tivera filho media o desejo desde o ano zero,
      // entao precisava de ~156 dias de mundo para querer procriar.
      const base = (npc.ultimoFilho > 0) ? npc.ultimoFilho
        : ((npc.nascimentoSeg || 0) + IDADE_FERTIL * U.SEG_ANO);
      const desde = Math.max(0, (mundo.tempo.segMundo - base) / U.SEG_DIA);
      // o desejo e de todos; a fertilidade modula, mas nao veta
      n.reproducao = U.clamp(U.map(desde, 0, DIAS_DESEJO, 20, 100) * (0.75 + npc.caps.fertilidade * 0.35), 0, 100);
      if (npc.gravida > 0) n.reproducao = 0;
    }
    // criança quer a mãe/pai por perto
    n.vinculo = 0;
    if (npc.caps.idadeAnos < 12 && npc.pais && npc.pais.length) {
      const mae = mundo.porId(npc.pais[0]);
      if (mae && mae.vivo) n.vinculo = U.clamp(100 - U.dist(npc.pos.x, npc.pos.y, mae.pos.x, mae.pos.y) * 3, 0, 100);
    }
    return n;
  }

  /* ============================================================
     5. ATENÇÃO — o que domina a mente agora
     ============================================================ */
  function atencao(npc, nec, perceptos, mundo) {
    const c = npc.cerebro;
    const cand = [];
    const ameaca = perceptos.filter(p => p.perigo > 0.42 && p.dist < 22).sort((a, b) => b.perigo - a.perigo || a.dist - b.dist)[0];
    if (ameaca) cand.push({ foco: 'ameaca', alvo: ameaca, peso: ameaca.perigo * 100 + (1 - ameaca.dist / 25) * 40 - (npc.caps.fase === 'crianca' ? -15 : 0) });
    if (nec.fome > 35) cand.push({ foco: 'comida', alvo: perceptos.find(p => p.comestivel > 0.5 && (p.classe === 'objeto' || p.classe === 'planta')), peso: nec.fome });
    if (nec.sede > 35) cand.push({ foco: 'agua', alvo: perceptos.find(p => p.classe === 'agua'), peso: nec.sede });
    if (nec.sono > 55) cand.push({ foco: 'sono', alvo: null, peso: nec.sono * 0.9 });
    const desconhecido = perceptos.find(p => !p.identificado && p.classe !== 'agua' && p.dist < 14);
    if (desconhecido) cand.push({ foco: 'novidade', alvo: desconhecido, peso: c.emocao.curiosidade * (0.5 + c.personalidade.curiosidade) });
    if (nec.dor > 30) cand.push({ foco: 'dor', alvo: null, peso: nec.dor + 20 });
    if (nec.frio > 50) cand.push({ foco: 'frio', alvo: perceptos.find(p => p.classe === 'fogo'), peso: nec.frio });
    if (nec.vinculo > 60) cand.push({ foco: 'vinculo', alvo: null, peso: nec.vinculo * 0.8 });
    if (!cand.length) cand.push({ foco: 'ocioso', alvo: null, peso: 10 });
    cand.sort((a, b) => b.peso - a.peso);
    const top = cand[0];
    if (!c.atencao.foco || c.atencao.peso !== top.peso || cand.length === 1) {
      c.atencao.foco = top.foco;
      c.atencao.alvoId = top.alvo ? top.alvo.id : null;
      c.atencao.peso = top.peso;
    }
    return top;
  }

  /* ============================================================
     6. MEMÓRIA — espacial, episódica e esquecimento
     ============================================================ */
  function lembrar(c, categoria, x, y, q, mundo, max) {
    if (!c.mapa[categoria]) c.mapa[categoria] = [];
    const arr = c.mapa[categoria];
    for (const m of arr) {
      if (U.dist(m.x, m.y, x, y) < 2.5) { m.t = mundo.tempo.segMundo; m.q = Math.max(m.q || 0, q || 0.5); return; }
    }
    arr.push({ x: x, y: y, t: mundo.tempo.segMundo, q: q || 0.5 });
    const lim = max || Math.round(4 + c.profundidade * 2 + (npc_mem(c)) * 6);
    while (arr.length > lim) arr.shift();
  }
  function npc_mem(c) { return c && c._memCap !== undefined ? c._memCap : 0.5; }

  function memoriaMelhor(c, categoria, x, y, mundo) {
    const arr = c.mapa[categoria];
    if (!arr || !arr.length) return null;
    let melhor = null, melhorNota = -1e9;
    for (const m of arr) {
      // memória enfraquece com o tempo: quanto mais velha, menos confiável
      const idade = (mundo.tempo.segMundo - m.t) / U.SEG_DIA;
      const forca = U.clamp01(m.q * Math.exp(-idade / 60));
      const d = U.dist(x, y, m.x, m.y);
      const nota = forca * 100 - d * 0.8;
      if (nota > melhorNota) { melhorNota = nota; melhor = m; }
    }
    return melhorNota > -50 ? melhor : null;
  }

  function episodio(c, texto, importancia, mundo) {
    c.episodica.push({ t: mundo.tempo.segMundo, texto: texto, imp: importancia || 0.5 });
    const max = Math.round(8 + c.profundidade * 3);
    while (c.episodica.length > max) {
      // esquece o menos importante e mais antigo
      let pior = 0, piorNota = 1e9;
      for (let i = 0; i < c.episodica.length; i++) {
        const e = c.episodica[i];
        const nota = e.imp * 100 - (mundo.tempo.segMundo - e.t) / U.SEG_DIA;
        if (nota < piorNota) { piorNota = nota; pior = i; }
      }
      c.episodica.splice(pior, 1);
    }
  }

  function reforcar(c, chave, valor, forca, fonte, tag, mundo, deltaTag) {
    let reg = c.conhecimento[chave];
    if (!reg) reg = c.conhecimento[chave] = { conf: 0.5, n: 0, ev: 1, fonte: fonte || 'experiencia', t: mundo.tempo.segMundo, tags: {} };
    const agora = mundo.tempo.segMundo;
    // Evidencia RECENTE, nao total historico. Praticar todo dia mantem ev alto
    // e o conhecimento consolida; parar de praticar derruba ev e ele volta a
    // ser fragil. Antes o denominador era reg.n (vitalicio), entao depois de
    // milhares de repeticoes a taxa travava no piso e a confianca nunca
    // fechava -- o NPC "descobria" a mesma coisa para sempre.
    const diasSem = Math.max(0, (agora - (reg.t === undefined ? agora : reg.t)) / U.SEG_DIA);
    reg.ev = (reg.ev === undefined ? 1 : reg.ev) * Math.exp(-diasSem / 20) + 1;
    reg.n++;
    if (valor < reg.conf) reg.nBaixa = (reg.nBaixa || 0) + 1;   // diagnostico
    const w = U.clamp(forca / (reg.ev + 1.2), 0.10, 0.85) * (0.5 + npc_mem(c) + 0.4);
    reg.conf = U.clamp01(reg.conf + (valor - reg.conf) * U.clamp01(w));
    reg.t = agora;
    reg.fonte = fonte || reg.fonte;
    if (tag) reg.tags[tag] = U.clamp01((reg.tags[tag] || 0) + (deltaTag === undefined ? 0.35 : deltaTag));
    return reg;
  }

  /* ============================================================
     7. EMOÇÕES FUNCIONAIS
     ============================================================ */
  function atualizarEmocoes(npc, mundo, dt) {
    const c = npc.cerebro, b = npc.corpo;
    const e = c.emocao;
    const dec = Math.exp(-dt / 900);
    e.medo *= dec; e.raiva *= dec; e.tristeza *= dec;
    e.alegria = U.lerp(e.alegria, 45 + (b.fome < 40 && b.sede < 40 && b.saude > 70 ? 15 : -25), 0.05);
    e.curiosidade = U.lerp(e.curiosidade, 20 + c.personalidade.curiosidade * 60, 0.03);
    const nec = npc.nec;
    if (nec) {
      if (nec.fome > 70) e.tristeza += dt / 7200 * 4;
      if (nec.sede > 75) e.tristeza += dt / 7200 * 5;
      if (b.saude < 60) e.tristeza += dt / 7200 * 3;
    }
    if (npc.gravida > 0) e.alegria += dt / 86400;
    e.medo = U.clamp(e.medo, 0, 100); e.raiva = U.clamp(e.raiva, 0, 100);
    e.tristeza = U.clamp(e.tristeza, 0, 100); e.alegria = U.clamp(e.alegria, 0, 100);
    // traços de personalidade derivam devagar com a experiência
    const p = c.personalidade;
    p.cautela = U.lerp(p.cautela, U.clamp01(p.cautela + (npc.experiencias && npc.experiencias.perigo ? 0.1 : -0.02)), 0.01);
    p.altruismo = U.lerp(p.altruismo, npc.gene.altruismo * 0.7 + (c.social && Object.keys(c.social).length ? 0.3 : 0), 0.005);
  }

  /* ============================================================
     8. GERAÇÃO DE OBJETIVOS + PLANEJAMENTO
     ============================================================ */
  function achaPercepto(perceptos, fn) { return perceptos.filter(fn).sort((a, b) => (b.q || 0) - (a.q || 0) || a.dist - b.dist)[0] || null; }

  function planos(npc, mundo, nec, perc, foco) {
    const c = npc.cerebro, caps = npc.caps, p = c.personalidade;
    const lista = [];
    const PU = c.profundidade;                                  // profundidade de planejamento
    const idade = caps.idadeAnos;
    const crianca = idade < 12;

    /* --- COMER --- */
    if (nec.fome > 22) {
      const peso = nec.fome * (1 + p.persistencia * 0.2);
      // Um alvo que o corpo JA mediu como inalcancavel sai da disputa normal
      // e passa a ser tratado pelo aprendizado (transpor). Isto preserva o
      // filtro que evita desperdicio quando existe alternativa facil -- e
      // resolve o caso em que TODAS as alternativas sao dificeis.
      const travComer = (c.travado && c.travado.objetivo === 'comer' &&
                         (mundo.tempo.segMundo - c.travado.t) < 1800 &&
                         perc.some(x => x.id === c.travado.alvoId)) ? c.travado : null;
      const percC = travComer ? perc.filter(x => x.id !== travComer.alvoId) : perc;
      const emMao = (npc.inventario || []).find(i => D.ITENS[i.tipo] && D.ITENS[i.tipo].comida);
      const comidaVista = achaPercepto(percC, x => (x.classe === 'objeto' || x.classe === 'planta') && (x.comestivel > 0.5 || (x.venenoso < 0.3 && !x.identificado)) && x.dist < 30);
      const frutoPlanta = percC.filter(x => x.classe === 'planta' && x.frutos > 0)
        .sort((a, b) => (((a.tamanho || 1) <= 1.45 ? 0 : 300) + a.dist) - (((b.tamanho || 1) <= 1.45 ? 0 : 300) + b.dist))[0];
      let plano = null;
      if (emMao) plano = [{ tipo: 'comer', alvoId: emMao.id }];
      else if (comidaVista) {
        const act = comidaVista.classe === 'planta' ? 'colher_planta' : 'pegar';
        plano = [{ tipo: 'ir', x: comidaVista.x, y: comidaVista.y, alvoId: comidaVista.id, proximidade: comidaVista.classe === 'planta' ? 1.3 : 0.7 }, { tipo: act, alvoId: comidaVista.id }, { tipo: 'comer' }];
      }
      else if (frutoPlanta && frutoPlanta.dist < 26) plano = [{ tipo: 'ir', x: frutoPlanta.x, y: frutoPlanta.y, alvoId: frutoPlanta.id, proximidade: 1.2 }, { tipo: 'colher_planta', alvoId: frutoPlanta.id }, { tipo: 'comer' }];
      else {
        const mem = memoriaMelhor(c, 'comida', npc.pos.x, npc.pos.y, mundo);
        if (mem) plano = [{ tipo: 'ir', x: mem.x, y: mem.y, explorando: true }, { tipo: 'procurar_comida' }];
        else plano = [{ tipo: 'explorar', raio: 25 + PU * 6 }];
      }
      // Pendencia aberta: existe um alvo conhecido que o corpo ainda nao sabe
      // alcancar. Em vez de sofrer com ele, o cerebro tenta aprender.
      if (travComer && !emMao) {
        const alvoT = perc.find(x => x.id === travComer.alvoId);
        if (alvoT && alvoT.frutos > 0) {
          const cands = candidatosTranspor(c, travComer.imp, npc, mundo);
          if (cands.length) {
            lista.push({ objetivo: 'comer', urg: nec.fome, util: peso * 1.04, transpor: true,
              plano: [{ tipo: 'ir', x: alvoT.x, y: alvoT.y, alvoId: alvoT.id, proximidade: 1.2 },
                      { tipo: 'transpor', alvoId: alvoT.id, impedimento: travComer.imp, operador: cands[0].operador }],
              pensamento: 'como eu pego isso?' });
          }
        }
      }
      if (plano) lista.push({ objetivo: 'comer', urg: nec.fome, util: peso, plano: plano, pensamento: idade < 7 ? 'quero comer' : 'preciso comer' });
    }

    /* --- BEBER --- */
    if (nec.sede > 20) {
      const aguaVista = achaPercepto(perc, x => x.classe === 'agua' && x.dist < 34);
      let plano = null;
      if (aguaVista) plano = [{ tipo: 'ir', x: aguaVista.x, y: aguaVista.y, alvoId: aguaVista.id, proximidade: 1.2 }, { tipo: 'beber', alvoId: aguaVista.id }];
      else {
        const mem = memoriaMelhor(c, 'agua', npc.pos.x, npc.pos.y, mundo);
        const cheiro = (!mem && nec.sede > 28 && mundo.aguaMaisProxima) ? mundo.aguaMaisProxima(npc.pos.x, npc.pos.y, 120) : null;
        if (mem) plano = [{ tipo: 'ir', x: mem.x, y: mem.y }, { tipo: 'beber' }];
        else if (cheiro) plano = [{ tipo: 'ir', x: cheiro.pos.x, y: cheiro.pos.y, alvoId: cheiro.id, proximidade: 1.3 }, { tipo: 'beber', alvoId: cheiro.id }];
        else plano = [{ tipo: 'explorar', procurando: 'agua', raio: 30 }];
      }
      lista.push({ objetivo: 'beber', urg: nec.sede, util: nec.sede * 1.25, plano: plano, pensamento: 'sede' });
    }

    /* --- PERIGO --- */
    const ameaca = perc.filter(x => x.perigo > 0.4 && x.dist < 20).sort((a, b) => a.dist - b.dist)[0];
    if (ameaca) {
      const temArma = (npc.inventario || []).some(i => D.ITENS[i.tipo] && D.ITENS[i.tipo].dano >= 12);
      const coragem = (p.agressividade * 60 + npc.corpo.saude * 0.2 + (temArma ? 25 : 0) + (caps.forca * 30)) - ameaca.perigo * 90 - c.emocao.medo * 0.5;
      const defender = coragem > 10 && !crianca && ameaca.dist < 8;
      lista.push({
        objetivo: defender ? 'defender' : 'fugir', urg: 90 * ameaca.perigo,
        util: 130 * ameaca.perigo + (defender ? 10 : 0),
        plano: defender
          ? [{ tipo: 'ir', x: ameaca.x, y: ameaca.y, alvoId: ameaca.id }, { tipo: 'atacar', alvoId: ameaca.id }]
          : [{ tipo: 'fugir', alvoId: ameaca.id, distancia: 26 + (1 - p.cautela) * 8 }],
        pensamento: defender ? 'vou enfrentar' : 'perigo!'
      });
    }

    /* --- SONO / ABRIGO --- */
    const noite = mundo.luzNoite();
    if (nec.sono > 40 || noite > 0.7) {
      const abrigoVisto = perc.filter(x => x.classe === 'construcao' && x.abrigo > 0.3).sort((a, b) => a.dist - b.dist)[0];
      const fogo = perc.filter(x => x.classe === 'fogo').sort((a, b) => a.dist - b.dist)[0];
      let plano;
      if (abrigoVisto) plano = [{ tipo: 'ir', x: abrigoVisto.x, y: abrigoVisto.y, proximidade: 0.8 }, { tipo: 'dormir' }];
      else {
        const mem = memoriaMelhor(c, 'abrigo', npc.pos.x, npc.pos.y, mundo);
        if (mem) plano = [{ tipo: 'ir', x: mem.x, y: mem.y }, { tipo: 'dormir' }];
        else if (fogo && nec.frio > 40) plano = [{ tipo: 'ir', x: fogo.x, y: fogo.y, proximidade: 1.2 }, { tipo: 'dormir' }];
        else plano = [{ tipo: 'dormir' }];
      }
      const urgencia = Math.max(nec.sono, noite * 100 * 0.8);
      lista.push({ objetivo: 'dormir', urg: urgencia, util: urgencia * (noite > 0.7 ? 1.3 : 1), plano: plano, pensamento: 'sono' });
    }

    /* --- FRIO / FOGO --- */
    if (nec.frio > 35) {
      const fogo = perc.filter(x => x.classe === 'fogo').sort((a, b) => a.dist - b.dist)[0];
      const abrigo = perc.filter(x => x.classe === 'construcao' && x.abrigo > 0.3).sort((a, b) => a.dist - b.dist)[0];
      let plano;
      if (fogo) plano = [{ tipo: 'ir', x: fogo.x, y: fogo.y, proximidade: 1.0 }, { tipo: 'aquecer' }];
      else if (abrigo) plano = [{ tipo: 'ir', x: abrigo.x, y: abrigo.y, proximidade: 0.7 }, { tipo: 'aquecer' }];
      else if (c.conhecimento['t:r_fogueira'] && c.conhecimento['t:r_fogueira'].conf > 0.4) plano = [{ tipo: 'fabricar', receita: 'r_fogueira' }];
      else plano = [{ tipo: 'explorar', procurando: 'abrigo', raio: 20 }];
      lista.push({ objetivo: 'aquecer', urg: nec.frio, util: nec.frio * 1.15, plano: plano, pensamento: 'frio' });
    }

    /* --- CRIANÇA: vínculo com os pais + brincar (aprender brincando) --- */
    if (crianca && npc.pais && npc.pais.length) {
      const mae = npc.pais.map(id => mundo.porId(id)).find(x => x && x.vivo);
      if (mae) {
        const d = U.dist(npc.pos.x, npc.pos.y, mae.pos.x, mae.pos.y);
        if (d > 6) lista.push({ objetivo: 'seguir_pais', urg: 60, util: 70, plano: [{ tipo: 'ir', x: mae.pos.x, y: mae.pos.y, alvoId: mae.id, proximidade: 2.5 }], pensamento: 'cadê minha mãe?' });
        else if (idade < 6) lista.push({ objetivo: 'brincar', urg: 30, util: 34 - nec.fome * 0.3, plano: [{ tipo: 'brincar' }], pensamento: 'brincar' });
      }
    }

    /* --- RELAÇÃO COM PARCEIRO / REPRODUÇÃO --- */
    if (nec.reproducao > 45 && !npc.gravida) {
      const cand = perc.filter(x => x.classe === 'humano' && x.id !== npc.id && x.adulto && x.sexo !== npc.sexo && x.dist < 40 && !x.parente)
        .sort((a, b) => a.dist - b.dist)[0];
      if (cand) lista.push({ objetivo: 'reproduzir', urg: nec.reproducao, util: nec.reproducao * 1.1, plano: [{ tipo: 'ir', x: cand.x, y: cand.y, alvoId: cand.id, proximidade: 1.0 }, { tipo: 'cortejar', alvoId: cand.id }], pensamento: 'quero companhia' });
    }
    if (npc.gravida > 0) {
      const abrigo = perc.filter(x => x.classe === 'construcao' && x.abrigo > 0.4).sort((a, b) => a.dist - b.dist)[0];
      if (abrigo && abrigo.dist > 2) lista.push({ objetivo: 'cuidar_gravidez', urg: 55, util: 60, plano: [{ tipo: 'ir', x: abrigo.x, y: abrigo.y, proximidade: 0.8 }, { tipo: 'descansar' }], pensamento: 'meu filho vai nascer' });
    }

    /* --- CURIOSIDADE / DESCOBERTA --- */
    const novidade = perc.find(x => !x.identificado && x.dist < 20 && x.classe !== 'agua');
    if (novidade && nec.fome < 70 && !ameaca) {
      const u = (20 + p.curiosidade * 70) * (idade < 16 ? 1.3 : 1);
      lista.push({
        objetivo: 'descobrir', urg: u, util: u,
        plano: [{ tipo: 'ir', x: novidade.x, y: novidade.y, alvoId: novidade.id, proximidade: 1.4 }, { tipo: 'observar', alvoId: novidade.id }, { tipo: 'experimentar', alvoId: novidade.id }],
        pensamento: 'o que é isso?'
      });
    }

    /* --- TRABALHO: ferramenta, fogo, abrigo, construção (adultos) --- */
    if (!crianca && nec.fome < 65 && nec.sede < 70 && !ameaca) {
      const temFogo = mundo.proximos(npc.pos.x, npc.pos.y, 30).some(e => e.classe === 'fogo');
      const temAbrigo = mundo.proximos(npc.pos.x, npc.pos.y, 45).some(e => e.classe === 'construcao' && e.abrigo > 0.4);
      const inv = npc.inventario || [];
      const temFerramenta = inv.some(i => D.ITENS[i.tipo] && D.ITENS[i.tipo].corte >= 0.4);
      const urgenciaTrabalho = (p.persistencia * 55 + npc.corpo.energia * 0.3) * (noite > 0.75 ? 0.25 : 1);
      let alvoTrab = null;
      if (!temFogo && c.conhecimento['t:r_fogueira'] && c.conhecimento['t:r_fogueira'].conf > 0.5) alvoTrab = { tipo: 'fabricar', receita: 'r_fogueira' };
      else if (!temFerramenta && c.conhecimento['t:r_lasca'] && c.conhecimento['t:r_lasca'].conf > 0.5 && inv.some(i => i.tipo === 'pedra')) alvoTrab = { tipo: 'fabricar', receita: 'r_lasca' };
      else if (inv.some(i => i.tipo === 'pedra') && c.conhecimento['t:r_lasca']) alvoTrab = { tipo: 'fabricar', receita: 'r_lasca' };
      // junta material para a próxima estrutura conhecida
      const constr = estruturasConhecidas(c, mundo).filter(e => !mundo.temConstrucaoPerto(e, npc.pos.x, npc.pos.y, 30));
      if (!alvoTrab && constr.length) {
        const alvo = constr[0];
        const def = D.ESTRUTURAS[alvo];
        const falta = [];
        for (const mat in def.materiais) {
          let tem = inv.filter(i => i.tipo === mat).length + mundo.contarObjetoPerto(mat, npc.pos.x, npc.pos.y, 12) * 0.5;
          if (tem < def.materiais[mat]) falta.push({ mat: mat, qtd: def.materiais[mat] - tem });
        }
        if (falta.length) {
          const f = falta[0];
          alvoTrab = { tipo: 'juntar', material: f.mat, estrutura: alvo };
        } else alvoTrab = { tipo: 'construir', estrutura: alvo };
      }
      if (!alvoTrab && !temAbrigo && c.conhecimento['t:r_abrigo_folhas']) alvoTrab = { tipo: 'juntar', material: 'folha', estrutura: 'abrigo_folhas' };
      if (alvoTrab) {
        lista.push({
          objetivo: 'trabalho', urg: urgenciaTrabalho, util: urgenciaTrabalho * 0.95,
          plano: [Object.assign({}, alvoTrab)], pensamento: rotuloTrabalho(alvoTrab)
        });
      }
      // experimentação de tecnologia (criatividade → combinações)
      const exp = tentarReceita(npc, mundo, inv);
      if (exp) lista.push({ objetivo: 'experimentar', urg: 30 + p.curiosidade * 40, util: 35 + p.curiosidade * 45 + p.criatividade * 25, plano: [{ tipo: 'fabricar', receita: exp.id }], pensamento: 'e se eu juntar?' });
    }

    /* --- AGRICULTURA (só depois de descoberto) --- */
    if (!crianca && c.conhecimento['t:r_agricultura'] && c.conhecimento['t:r_agricultura'].conf > 0.45 && nec.fome < 60) {
      const inv = npc.inventario || [];
      const sem = inv.find(i => i.tipo === 'semente');
      if (sem) {
        const perto = mundo.proximos(npc.pos.x, npc.pos.y, 12).some(e => e.classe === 'plantacao');
        if (!perto) lista.push({ objetivo: 'plantar', urg: 35, util: 40, plano: [{ tipo: 'ir', x: npc.pos.x + mundo.rng.range(-8, 8), y: npc.pos.y + mundo.rng.range(-8, 8) }, { tipo: 'plantar', semente: sem.id }], pensamento: 'plantar' });
      } else {
        const fonte = perc.find(x => x.plantaSemente);
        if (fonte) lista.push({ objetivo: 'pegar_semente', urg: 25, util: 28, plano: [{ tipo: 'ir', x: fonte.x, y: fonte.y, alvoId: fonte.id, proximidade: 1.2 }, { tipo: 'colher_planta', alvoId: fonte.id }], pensamento: 'sementes' });
      }
    }

    /* --- SOCIAL --- */
    if (nec.social > 45) {
      const outro = perc.filter(x => x.classe === 'humano' && x.id !== npc.id && x.dist < 30).sort((a, b) => a.dist - b.dist)[0];
      if (outro) {
        const soc = c.social[outro.id];
        const afeto = soc ? soc.afeicao : 0;
        lista.push({
          objetivo: 'social', urg: nec.social * (0.7 + p.sociabilidade * 0.5), util: nec.social * (0.6 + p.sociabilidade * 0.6) + afeto * 20,
          plano: [{ tipo: 'ir', x: outro.x, y: outro.y, alvoId: outro.id, proximidade: 1.6 }, { tipo: 'falar', alvoId: outro.id }],
          pensamento: afeto > 0.4 ? 'quero ver essa pessoa' : 'quem está ali?'
        });
      }
    }

    /* --- ENSINAR (transmissão cultural) --- */
    const filho = perc.filter(x => x.classe === 'humano' && x.crianca && c.social[x.id]).sort((a, b) => a.dist - b.dist)[0];
    if (filho && Object.keys(c.conhecimento).length > 2 && !crianca && nec.fome < 60) {
      const u = 25 + p.altruismo * 45 + (c.social[filho.id] ? c.social[filho.id].parentesco ? 30 : 0 : 0);
      lista.push({ objetivo: 'ensinar', urg: u, util: u, plano: [{ tipo: 'ir', x: filho.x, y: filho.y, alvoId: filho.id, proximidade: 1.8 }, { tipo: 'ensinar', alvoId: filho.id }], pensamento: 'vou ensinar' });
    }

    /* --- OCIOSO / EXPLORAÇÃO --- */
    lista.push({
      objetivo: 'explorar', urg: 8, util: 8 + p.curiosidade * 22,
      plano: [{ tipo: 'explorar', raio: 15 + PU * 8 }], pensamento: 'vagar'
    });
    return lista;
  }

  function estruturasConhecidas(c, mundo) {
    const out = [];
    for (const r of D.RECEITAS) {
      if (!r.estrutura) continue;
      const k = c.conhecimento['t:' + r.id];
      if (k && k.conf > 0.5) out.push(r.estrutura);
    }
    // prioriza a mais avançada que ele conhece
    out.sort((a, b) => (D.ESTRUTURAS[b].peso || 0) - (D.ESTRUTURAS[a].peso || 0));
    return out;
  }

  function rotuloTrabalho(t) {
    switch (t.tipo) {
      case 'fabricar': { const r = D.RECEITAS.find(x => x.id === t.receita); return r ? 'fabricar ' + r.nome.toLowerCase() : 'fabricar'; }
      case 'juntar': return 'buscar ' + (D.ITENS[t.material] ? D.ITENS[t.material].nome.toLowerCase() : t.material);
      case 'construir': return 'construir ' + (D.ESTRUTURAS[t.estrutura] ? D.ESTRUTURAS[t.estrutura].nome.toLowerCase() : t.estrutura);
      default: return 'trabalhar';
    }
  }

  /* Procura uma receita que o NPC CONSIGA tentar com o que tem em mãos.
     É assim que nasce tecnologia nova: combinar o que existe.        */
  function tentarReceita(npc, mundo, inv) {
    const c = npc.cerebro;
    const tem = {};
    for (const i of inv) tem[i.tipo] = (tem[i.tipo] || 0) + 1;
    const perto = mundo.objetosPerto(npc.pos.x, npc.pos.y, 6);
    for (const o of perto) tem[o.tipo] = (tem[o.tipo] || 0) + 1;
    const cand = [];
    for (const r of D.RECEITAS) {
      if (r.saida === null && !r.estrutura) continue;
      const ja = c.conhecimento['t:' + r.id];
      const domina = ja ? ja.conf : 0;
      const falta = r.entrada.filter(ent => {
        if (ent === 'animal' || ent === 'fogueira' || ent === 'forno') return false;
        return true;
      });
      let ok = true;
      const nec = {};
      for (const ent of falta) { nec[ent] = (nec[ent] || 0) + 1; if ((tem[ent] || 0) < nec[ent]) { ok = false; break; } }
      if (!ok) continue;
      if (domina > 0.85) continue;      // já domina: não é novidade
      const dep = (r.dep || []).every(d => c.conhecimento['t:' + d] && c.conhecimento['t:' + d].conf > 0.4);
      const chance = (r.dep && r.dep.length && !dep) ? 0.06 : U.clamp01(0.5 - r.dif * 0.4) * (0.4 + c.personalidade.curiosidade * 0.5 + npc.gene.criatividade * 0.6);
      cand.push({ id: r.id, r: r, chance: chance, novidade: 1 - domina });
    }
    if (!cand.length) return null;
    cand.sort((a, b) => (b.novidade * b.chance) - (a.novidade * a.chance));
    const melhor = cand[0];
    if (mundo.rng.next() > 0.35 + c.personalidade.curiosidade * 0.4) return null;
    return { id: melhor.id, r: melhor.r };
  }

  /* ============================================================
     9. DECISÃO (com "simulação de futuros" — contrafactual)
     ============================================================ */
  function prever(npc, plano, mundo) {
    // Simulação mental curta: estima custo e ganho de cada plano
    let custo = 0, risco = 0, prazer = 0;
    let x = npc.pos.x, y = npc.pos.y;
    for (const passo of plano) {
      const d = U.dist(x, y, passo.x || x, passo.y || y);
      custo += d * 0.02;
      switch (passo.tipo) {
        case 'comer': prazer += 26; break;
        case 'beber': prazer += 24; break;
        case 'dormir': prazer += 20; break;
        case 'atacar': risco += 22; prazer += 8; break;
        case 'fugir': prazer += 18 + npc.cerebro.personalidade.cautela * 10; break;
        case 'fabricar': prazer += 12; custo += 4; break;
        case 'construir': prazer += 18; custo += 8; break;
        case 'observar': case 'experimentar': prazer += 6 + npc.cerebro.personalidade.curiosidade * 14; break;
        case 'transpor': prazer += 6 + npc.cerebro.personalidade.curiosidade * 20; break;
        case 'falar': prazer += 10; break;
        case 'ensinar': prazer += 8 + npc.cerebro.personalidade.altruismo * 10; break;
        case 'cortejar': prazer += 16; break;
        default: break;
      }
      if (passo.x) { x = passo.x; y = passo.y; }
    }
    return { custo: custo, risco: risco, prazer: prazer };
  }

  function negoSede(nec) {
    const s = nec.sede;
    if (s < 50) return 0;
    return Math.pow((s - 50) / 50, 2.1) * 240;
  }
  function negoFome(nec) {
    const f = nec.fome;
    if (f < 55) return 0;
    return Math.pow((f - 55) / 45, 2.0) * 200;
  }
  /* ============================================================
     8.1 IMPEDIMENTO E TRANSPOSICAO
     ------------------------------------------------------------
     Um impedimento nao e um fracasso: e um FATO medido sobre o alvo
     ("esta alto", "e duro"). O que o cerebro aprende e a associacao
     entre AQUELE fato e CADA operador do corpo. Nada aqui sabe que
     sacudir derruba fruta -- isso so existe se for tentado e medido.
     ============================================================ */
  function esquemasDe(c) {
    if (!c.esquemas) c.esquemas = {};
    return c.esquemas;
  }

  // Mesma matematica do reforcar() geral, mas num compartimento proprio:
  // o esquema e a fase de aprendizado e nao deve poluir o conhecimento
  // declarativo (fala, ensino, receitas) antes de virar tecnica de fato.
  function reforcarEsquema(c, impedimento, operador, valor, forca, mundo) {
    const esq = esquemasDe(c);
    if (!esq[impedimento]) esq[impedimento] = {};
    let reg = esq[impedimento][operador];
    if (!reg) { reg = esq[impedimento][operador] = { conf: 0.10, n: 0, ev: 1, t: 0 }; }
    const agora = mundo.tempo.segMundo;
    const diasSem = Math.max(0, (agora - (reg.t || agora)) / U.SEG_DIA);
    reg.ev = (reg.ev === undefined ? 1 : reg.ev) * Math.exp(-diasSem / 20) + 1;
    reg.n++;
    if (valor < reg.conf) reg.nBaixa = (reg.nBaixa || 0) + 1;
    const w = U.clamp(forca / (reg.ev + 1.2), 0.10, 0.85) * (0.5 + npc_mem(c) + 0.4);
    reg.conf = U.clamp01(reg.conf + (valor - reg.conf) * U.clamp01(w));
    reg.t = agora;
    return reg;
  }

  // O corpo percebeu que existe um impedimento. Isto e OBSERVACAO,
  // nao aprendizado de solucao: registra o fato, nao o remedio.
  function observarImpedimento(c, impedimento, mundo) {
    const esq = esquemasDe(c);
    if (!esq[impedimento]) esq[impedimento] = {};
    const b = esq[impedimento];
    b._visto = (b._visto || 0) + 1;
    b._t = mundo ? mundo.tempo.segMundo : 0;
    return b._visto;
  }

  const LIMIAR_ESQUEMA = 3;    // tentativas antes de a tecnica existir
  const LIMIAR_CONF = 0.55;    // confianca antes de a tecnica existir

  // O corpo tentou UM operador contra UM impedimento e o mundo respondeu.
  // efeito = quanto o estado do alvo mudou. Zero e resposta legitima.
  function aprenderTransposicao(c, impedimento, operador, efeito, alvo, mundo) {
    const esq = esquemasDe(c);
    if (!esq[impedimento]) esq[impedimento] = {};
    const b = esq[impedimento];
    // O valor-alvo e o proprio efeito normalizado: derrubar fruta vale mais
    // que derrubar folha, e nao derrubar nada vale zero.
    const valor = efeito > 0 ? (efeito >= 4 ? 1.0 : U.clamp01(0.6 + efeito * 0.1)) : 0.0;
    const forca = efeito > 0 ? 0.9 : 0.45;     // tentar tambem ensina algo
    const reg = reforcarEsquema(c, impedimento, operador, valor, forca, mundo);
    b._ultimo = operador;
    b._ganho = (b._ganho || 0) + efeito;
    if (c.travado && c.travado.imp === impedimento) c.travado.ganho = (c.travado.ganho || 0) + efeito;

    // Virou tecnica? Entao entra no conhecimento normal do NPC e passa a
    // valer tudo que o conhecimento ja vale: fala, ensino, cultura, reuso.
    // O esquema e a fase de aprendizado; a tecnica e o que sobra depois.
    const tecnica = 't:r_' + operador;
    const jaTem = c.conhecimento[tecnica];
    if (reg.n >= LIMIAR_ESQUEMA && reg.conf >= LIMIAR_CONF && !(jaTem && jaTem.promovida)) {
      const r2 = reforcar(c, tecnica, reg.conf, 0.85, 'descoberta', null, mundo);
      r2.promovida = true;
      b._promovida = operador;
      return { promoveu: true, operador: operador, reg: r2 };
    }
    return { promoveu: false, operador: operador, reg: reg };
  }

  // Quais operadores o corpo pode tentar contra este impedimento AGORA.
  // Nao existe lista de "qual serve": existe curiosidade (atrai o que nunca
  // foi tentado) e experiencia (usa o que ja rendeu). Quem decide e o mundo.
  function candidatosTranspor(c, impedimento, npc, mundo) {
    const b = esquemasDe(c)[impedimento] || {};
    const ops = D.OPERADORES || [];
    const out = [];
    const cur = c.personalidade.curiosidade;
    for (let i = 0; i < ops.length; i++) {
      const op = ops[i];
      const reg = b[op.id];
      const conf = reg ? reg.conf : 0;
      const tentativas = reg ? reg.n : 0;
      const novidade = 1 / (1 + tentativas);
      const tecnica = c.conhecimento['t:r_' + op.id];
      let nota = conf * 2.0 + novidade * (0.35 + cur * 0.85);
      if (tecnica && tecnica.conf > 0.4) nota += tecnica.conf * 1.3;   // sabe fazer: reusa
      if (reg && reg.nBaixa > 2 && conf < 0.30) nota -= 0.30;          // caminho que nao rende
      nota += mundo.rng.range(-0.10, 0.10);                            // nao e maquina
      out.push({ operador: op.id, nota: nota, conf: conf, n: tentativas });
    }
    out.sort((a, b2) => b2.nota - a.nota);
    return out;
  }

  function escolher(npc, mundo, candidatos, nec, foco) {
    const c = npc.cerebro, p = c.personalidade;
    let melhor = null, melhorNota = -1e9;
    const orcamento = c.processamento;
    // instinto de sobrevivencia: perto da morte, nada compete
    const sedeCrit = nec.sede >= 68, fomeCrit = nec.fome >= 68;
    const sufocado = (sedeCrit || fomeCrit) && c.processamento > 12 ? false : false;
    for (const cand of candidatos) {
      const prev = prever(npc, cand.plano, mundo);
      const custoMental = cand.plano.length * 6;
      if (custoMental > orcamento * 0.9) continue;                   // cérebro é recurso limitado
      const riscoPonderado = prev.risco * (1 - p.risco) * (0.7 + c.emocao.medo / 200);
      let nota = cand.util - prev.custo * 8 - riscoPonderado + prev.prazer * (0.6 + c.emocao.alegria / 200);
      if (cand.objetivo === foco.foco) nota += 15;
      if (foco.foco === 'ameaca' && cand.objetivo !== 'fugir' && cand.objetivo !== 'defender') nota -= 40;
      if (npc.corpo.energia < 20 && (cand.objetivo === 'trabalho' || cand.objetivo === 'explorar')) nota -= 30;
      if (npc.corpo.energia < 12) nota -= 10;
      if (npc.gravida > 0 && (cand.objetivo === 'trabalho' || cand.objetivo === 'defender')) nota -= 18;
      if (cand.objetivo === 'beber' || cand.objetivo === 'comer' || cand.objetivo === 'aquecer' || cand.objetivo === 'dormir' || cand.objetivo === 'fugir') nota *= 1.45;
      // --- sobrevivência tem prioridade absoluta ---
      const sedeUrg = negoSede(nec), fomeUrg = negoFome(nec);
      if (cand.objetivo === 'beber') nota += sedeUrg;
      else if (cand.objetivo === 'comer') nota += fomeUrg * (1 - Math.min(0.6, sedeUrg / 300));
      else nota -= (sedeUrg + fomeUrg) * 0.85;
      // --- memória de fracasso: o que não deu certo há pouco perde valor ---
      if (c.bloqueio && c.bloqueio[cand.objetivo] > mundo.tempo.segMundo) nota -= 55;
      if (c.dificil && c.dificil[cand.objetivo]) nota -= 14 * Math.min(4, c.dificil[cand.objetivo]);
      // Pendencia aberta: um alvo que o corpo ainda nao sabe alcancar nao
      // bloqueia o objetivo -- ele puxa para a tentativa. E persistencia,
      // nao teimosia cega: o esquema aprende e o proprio mecanismo para.
      if (cand.transpor) nota += 22 * (0.4 + p.persistencia);
      nota += mundo.rng.range(-4, 4) * (0.5 + p.impulsividade);      // não é máquina
      if (nota > melhorNota) { melhorNota = nota; melhor = cand; }
    }
    return melhor;
  }

  /* ============================================================
     10. PASSO PRINCIPAL DO CÉREBRO
     ============================================================ */
  function passo(npc, mundo, dt) {
    const c = npc.cerebro;
    if (!npc.vivo || npc.dormindo && c.tDecisao > 2) return;
    c._memCap = npc.gene.memoria;

    // (1) capacidades (custo baixo, recalcula a cada ~5 s de mundo)
    c.tCap = (c.tCap || 0) + dt;
    if (c.tCap > 5 || !npc.caps) { npc.caps = capacidades(npc); c.tCap = 0; }
    const caps = npc.caps;

    // (2) percepção (~0.4 s)
    c.tPercepcao += dt;
    if (c.tPercepcao > 0.4) {
      c.tPercepcao = 0;
      c.perceptos = perceber(npc, mundo);
      // registrar lugares notáveis na memória espacial
      for (const pc of c.perceptos) {
        if (pc.classe === 'agua' && pc.dist < 8) lembrar(c, 'agua', pc.x, pc.y, 0.9, mundo);
        else if (pc.comestivel > 0.5 && pc.classe === 'objeto') lembrar(c, 'comida', pc.x, pc.y, 0.5 + pc.comestivel * 0.5, mundo);
        else if (pc.classe === 'planta' && pc.frutos > 0) lembrar(c, 'comida', pc.x, pc.y, 0.7, mundo);
        else if (pc.classe === 'construcao' && pc.abrigo > 0.3) lembrar(c, 'abrigo', pc.x, pc.y, 0.8, mundo);
        else if (pc.perigo > 0.5) lembrar(c, 'perigo', pc.x, pc.y, 0.9, mundo, 12);
      }
    }

    // (3) necessidades
    const nec = npc.nec = necessidades(npc, mundo);

    // (4) emoções (~4 s)
    c.tEmocao += dt;
    if (c.tEmocao > 4) { atualizarEmocoes(npc, mundo, c.tEmocao); c.tEmocao = 0; }

    // (5) esquecimento (~1 h de mundo)
    c.tMemoria += dt;
    if (c.tMemoria > 3600) {
      // Normaliza pelo tempo de MUNDO acumulado, nao por tick: com o mundo
      // acelerado um tick vale varios minutos e o esquecimento ficava medido
      // em ticks, nao em horas de mundo.
      const horas = c.tMemoria / 3600;
      c.tMemoria = 0;
      for (const k in c.conhecimento) {
        const reg = c.conhecimento[k];
        const idade = (mundo.tempo.segMundo - reg.t) / U.SEG_DIA;
        if (idade > 30) {
          const taxa = 0.01 * horas * (1 - npc.gene.memoria);
          reg.conf = U.clamp01(reg.conf - taxa);
        }
      }
    }

    // (6) atenção
    const foco = atencao(npc, nec, c.perceptos, mundo);

    // (7) decisão: só decide quando está sem ação; se a ação terminou, avança a fila do plano
    c.tDecisao += dt;
    if (npc.acao && npc.acao.feito) {
      const falhou = npc.acao.falhou;
      c.bloqueio = c.bloqueio || {}; c.dificil = c.dificil || {}; c.feitos = c.feitos || {};
      const bloqueado = npc.acao.bloqueado;      // impedimento fisico nomeado
      c.bloqueio = c.bloqueio || {}; c.dificil = c.dificil || {}; c.feitos = c.feitos || {};
      if (bloqueado) {
        // O objetivo NAO falhou: o mundo apresentou um obstaculo nomeado.
        // Guarda a questao para o gerador de planos responder aprendendo.
        if (!c.travado || c.travado.alvoId !== npc.acao.alvoTravado || c.travado.imp !== bloqueado) {
          c.travado = { objetivo: npc.objetivo || '?', alvoId: npc.acao.alvoTravado, imp: bloqueado,
                        t: mundo.tempo.segMundo, n: 0, ganho: 0 };
        }
        c.travado.n++;
        c.travado.t = mundo.tempo.segMundo;
        // Se nada rendeu em muitas tentativas, ele desiste por um tempo.
        // Desistir e informacao: aquele caminho nao esta dando em nada.
        if (c.travado.n > 10 && (c.travado.ganho || 0) <= 0) {
          const objT = npc.objetivo || '?';
          c.travado = null;
          c.dificil[objT] = (c.dificil[objT] || 0) + 1;
          c.bloqueio[objT] = mundo.tempo.segMundo + 600;
          episodio(c, 'Ja tentei de tudo um pouco e nada caiu.', 0.30, mundo);
        }
      } else if (falhou) {
        const obj = npc.objetivo || '?';
        c.feitos[obj] = 0;
        c.dificil[obj] = (c.dificil[obj] || 0) + 1;
        c.bloqueio[obj] = mundo.tempo.segMundo + 900 * Math.min(6, c.dificil[obj]);
        if (c.dificil[obj] === 1) episodio(c, 'Do jeito que eu tentei nao deu certo.', 0.35, mundo);
      } else if (npc.objetivo) {
        c.dificil[npc.objetivo] = 0;
        c.bloqueio[npc.objetivo] = 0;
      }
      c.falhasSeguidas = falhou ? c.falhasSeguidas + 1 : 0;
      if (c.falhasSeguidas >= 3) {
        c.confiancaPropria = U.clamp01(c.confiancaPropria - 0.12);
        c.ultimaAvaliacao = 'meu plano não está funcionando';
        c.falhasSeguidas = 0;
      }
      npc.acaoExecutando = false;
      npc.acao = null;
      if (npc.plano && npc.planoIdx < npc.plano.length - 1 && !falhou && !bloqueado) {
        npc.planoIdx++;
        npc.acao = Object.assign({}, npc.plano[npc.planoIdx], { inicio: mundo.tempo.segMundo, progresso: 0 });
      } else {
        npc.plano = null; npc.planoIdx = 0;
      }
    }
    if (!npc.acao) {
      c.tDecisao = 0;
      const cands = planos(npc, mundo, nec, c.perceptos, foco);
      const escolhido = escolher(npc, mundo, cands, nec, foco);
      if (escolhido) {
        npc.plano = escolhido.plano;
        npc.planoIdx = 0;
        npc.objetivo = escolhido.objetivo;
        npc.acao = Object.assign({}, escolhido.plano[0], { inicio: mundo.tempo.segMundo, progresso: 0 });
        c.pensamento = escolhido.pensamento;
        c.confiancaPropria = U.clamp01(c.confiancaPropria * 0.9 + 0.1);
      } else {
        npc.plano = null; npc.planoIdx = 0;
      }
    }
    if (c.tDecisao > 25) c.tDecisao = 0;

    // (8) fala espontânea (bebês e crianças balbuciam; adultos comentam)
    c.tRegistro += dt;
    if (c.tRegistro > 90 && mundo.rng.chance(0.25)) {
      c.tRegistro = 0;
      if (caps.fase === 'bebe') { c.ultimaFala = '«balbucia»'; c.falaAte = mundo.tempo.segMundo + 60; }
      else if (c.emocao.medo > 60) { c.ultimaFala = '«grita de medo»'; c.falaAte = mundo.tempo.segMundo + 60; }
    }

    // (9) comunicação real com quem está perto (transmissão cultural)
    c.tCom = (c.tCom || 0) + dt;
    if (c.tCom > 45) {
      c.tCom = 0;
      const perto = c.perceptos.find(p => p.classe === 'humano' && p.dist < 3.5);
      if (perto) {
        const alvo = mundo.porId(perto.id);
        if (alvo && alvo.vivo) comunicar(npc, alvo, mundo);
      }
    }
  }

  /* ============================================================
     11. COMUNICAÇÃO / TRANSMISSÃO CULTURAL
     ============================================================ */
  function comunicar(a, b, mundo) {
    const ca = a.cerebro, cb = b.cerebro;
    if (ca.nivelLingua < 1 && a.caps.fase === 'bebe') return;
    const afinidade = cb.social[a.id] ? cb.social[a.id].afeicao : 0.2;
    const receptividade = 0.25 + afinidade * 0.5 + b.gene.social * 0.4;
    const chaves = Object.keys(ca.conhecimento);
    if (!chaves.length) return;
    let transmitiu = 0;
    // quanto maior a linguagem, mais conhecimento passa por conversa
    const capacidade = (0.15 + ca.nivelLingua * 0.3) * receptividade;
    for (const k of chaves) {
      if (mundo.rng.next() > capacidade) continue;
      const reg = ca.conhecimento[k];
      if (reg.conf < 0.4) continue;
      const ja = cb.conhecimento[k];
      if (ja && ja.conf >= reg.conf * 0.85) continue;
      reforcar(cb, k, Math.max(0.3, reg.conf - 0.15), 0.5, 'outro', null, mundo);
      if (reg.tags) {
        cb.conhecimento[k].tags = cb.conhecimento[k].tags || {};
        for (const t in reg.tags) cb.conhecimento[k].tags[t] = U.clamp01(reg.tags[t] * 0.75);
      }
      transmitiu++;
      if (transmitiu > 2) break;
    }
    registrarSocial(cb, a, mundo, 0.02);
    registrarSocial(ca, b, mundo, 0.03);
    a.ultimoContatoSocial = mundo.tempo.segMundo;
    b.ultimoContatoSocial = mundo.tempo.segMundo;
    if (transmitiu && mundo.rng.chance(0.3)) {
      mundo.registrarCultura(chaves[0], a, b);
    }
    // sobe o nível de língua da cultura conforme o conhecimento circula
    if (mundo.cultura.riqueza > 6 && ca.nivelLingua < 4 && mundo.rng.chance(0.02)) ca.nivelLingua++;
    if (mundo.cultura.riqueza > 6 && cb.nivelLingua < 4 && mundo.rng.chance(0.02)) cb.nivelLingua++;
  }

  function registrarSocial(c, outro, mundo, delta) {
    let s = c.social[outro.id];
    if (!s) s = c.social[outro.id] = { confianca: 0.5, afeicao: 0.2, medo: 0, respeito: 0.3, divida: 0, parentesco: null, visto: mundo.tempo.segMundo, interacoes: 0 };
    s.interacoes++;
    s.visto = mundo.tempo.segMundo;
    s.confianca = U.clamp01(s.confianca + delta);
    s.afeicao = U.clamp01(s.afeicao + delta * 1.4);
    return s;
  }

  /* ============================================================
     12. APRENDIZADO — consequência vira conhecimento
     ============================================================ */
  function aprender(npc, evento, mundo, extra) {
    const c = npc.cerebro;
    if (!c) return;
    switch (evento.tipo) {
      case 'comeu': {
        const apa = evento.visual || 'vis:fruta_vermelha';
        const valor = evento.bom ? 0.95 : 0.05;
        reforcar(c, apa, 0.8 + npc.gene.memoria * 0.2, valor, 'experiencia', 'comestivel', mundo, evento.bom ? 0.45 : -0.5);
        if (evento.bom) reforcar(c, apa, 0.8, 0.9, 'experiencia', 'comestivel', mundo, 0.3);
        else reforcar(c, apa, 0.9, 0.95, 'experiencia', 'venenoso', mundo, 0.6);
        c.feito.comeu++;
        break;
      }
      case 'bebeu': reforcar(c, 'vis:agua', 0.7, 0.95, 'experiencia', 'agua', mundo, 0.5); c.feito.bebeu++; break;
      case 'dor': {
        const apa = evento.visual || 'vis:animal_perigoso';
        reforcar(c, apa, 0.95, 0.98, 'experiencia', 'perigoso', mundo, 0.7);
        npc.experiencias = npc.experiencias || {};
        npc.experiencias.perigo = (npc.experiencias.perigo || 0) + 1;
        c.emocao.medo = U.clamp(c.emocao.medo + 45, 0, 100);
        c.falhasSeguidas += 1;
        episodio(c, 'Fui ferido por ' + (evento.nome || 'algo') + '.', 0.9, mundo);
        break;
      }
      case 'quente': reforcar(c, 'vis:fogo', 0.9, 0.9, 'experiencia', 'quente', mundo, 0.8); break;
      case 'colheu': c.feito.colheu++; if (evento.recurso) lembrar(c, 'comida', evento.x || npc.pos.x, evento.y || npc.pos.y, 0.5, mundo); break;
      case 'receita_ok': {
        reforcar(c, 't:' + evento.receita, 1.0, 0.95, 'experiencia', null, mundo);
        c.feito.fabricou++;
        c.emocao.alegria = U.clamp(c.emocao.alegria + 25, 0, 100);
        c.confiancaPropria = U.clamp01(c.confiancaPropria + 0.15);
        c.hipoteses.push({ texto: evento.texto || ('Juntar as coisas fez ' + evento.nome), evidPos: 1, evidNeg: 0, conf: 0.6 });
        episodio(c, 'Descobri como ' + (evento.nome || 'fazer algo novo') + '!', 1.0, mundo);
        mundo.registrarDescoberta(evento.receita, npc);
        break;
      }
      case 'receita_falha': {
        const reg = c.conhecimento['t:' + evento.receita];
        if (reg) reg.conf = U.clamp01(reg.conf - 0.12);
        if (c.hipoteses.length > 12) c.hipoteses.shift();
        break;
      }
      case 'construiu': {
        reforcar(c, 't:' + evento.receita, 0.9, 0.9, 'experiencia', null, mundo); c.feito.construiu++;
        episodio(c, 'Levantei um ' + (evento.nome || 'abrigo') + '.', 0.8, mundo);
        c.emocao.alegria = U.clamp(c.emocao.alegria + 20, 0, 100);
        break;
      }
      case 'colapso': {
        const reg = c.conhecimento['t:' + (evento.receita || '')];
        if (reg) reg.conf = U.clamp01(reg.conf - 0.2);
        c.hipoteses.push({ texto: 'Construir rápido demais derruba.', evidPos: 1, evidNeg: 0, conf: 0.55 });
        episodio(c, 'A construção caiu.', 0.7, mundo);
        break;
      }
      case 'observou': {
        if (evento.visual) reforcar(c, evento.visual, 0.6, evento.conf || 0.7, 'observacao', evento.tag || null, mundo);
        break;
      }
      case 'viu_fazer': {
        // imitação: aprende vendo outro executar
        const k = 't:' + evento.receita;
        reforcar(c, k, 0.35 * (0.4 + npc.gene.aprendizado), 0.7, 'imitacao', null, mundo);
        break;
      }
      case 'ensinado': {
        reforcar(c, evento.chave, 0.7, evento.valor || 0.8, 'ensinado', evento.tag || null, mundo);
        if (evento.tag) reforcar(c, evento.chave, 0.5, 0.8, 'ensinado', evento.tag, mundo, 0.4);
        break;
      }
      case 'cacou': c.feito.cacou++; break;
      case 'criou_filho': c.feito.filhos++; c.emocao.alegria = U.clamp(c.emocao.alegria + 40, 0, 100); episodio(c, 'Nasceu ' + (evento.nome || 'um filho') + '.', 1.0, mundo); break;
      case 'perdeu': c.emocao.tristeza = U.clamp(c.emocao.tristeza + 60, 0, 100); break;
      case 'acasalou': {
        registrarSocial(c, evento.parceiro, mundo, 0.35);
        if (evento.parceiro && c.social[evento.parceiro.id]) c.social[evento.parceiro.id].parentesco = 'parceiro';
        c.emocao.alegria = U.clamp(c.emocao.alegria + 30, 0, 100);
        c.hipoteses.push({ texto: 'Uma companhia faz filho.', evidPos: 1, evidNeg: 0, conf: 0.7 });
        reforcar(c, 'c:maternidade', 0.4, 0.6, 'experiencia', null, mundo);
        break;
      }
      case 'fugiu': c.feito.fugiu++; break;
      case 'doente': c.emocao.tristeza = U.clamp(c.emocao.tristeza + 20, 0, 100); break;
      case 'cura': reforcar(c, 'c:remedio', 0.5, 0.8, 'experiencia', null, mundo); break;
    }
  }

  /* ============================================================
     13. HERANÇA CULTURAL (pais → filhos)
     ============================================================ */
  function herdarCultura(filho, pais, mundo) {
    const c = filho.cerebro;
    const paisVivos = pais.filter(p => p && p.cerebro);
    if (!paisVivos.length) return;
    const base = paisVivos[0].cerebro;
    c.nivelLingua = Math.max(0, Math.min(base.nivelLingua, Math.round(U.media(paisVivos.map(p => p.cerebro.nivelLingua)))));
    c.geracao = Math.max.apply(null, paisVivos.map(p => (p.cerebro.geracao || 0) + 1));
    const chaves = Object.keys(base.conhecimento);
    // filhos herdam as técnicas consolidadas (conf. alta) e a cultura geral
    for (const k of chaves) {
      const reg = base.conhecimento[k];
      const prevalencia = mundo.cultura.conhecimentos[k] ? mundo.cultura.conhecimentos[k].n : 0;
      const prob = 0.18 + reg.conf * 0.5 + U.clamp01(prevalencia / 8) * 0.35;
      if (mundo.rng.next() < prob) {
        reforcar(c, k, 0.5 * (0.5 + filho.gene.memoria), U.clamp01(reg.conf * 0.7 + 0.1), 'pai', null, mundo);
        if (reg.tags) { c.conhecimento[k].tags = {}; for (const t in reg.tags) c.conhecimento[k].tags[t] = reg.tags[t] * 0.6; }
      }
    }
    // medos e crenças também se herdam
    c.emocao.medo = base.emocao.medo * 0.15;
    for (const h of base.hipoteses.slice(0, 3)) c.hipoteses.push({ texto: h.texto, evidPos: 0.5, evidNeg: 0, conf: h.conf * 0.5 });
    episodio(c, 'Nasci na cultura de ' + (paisVivos[0].nome || 'meus pais') + '.', 1.0, mundo);
  }

  /* ============================================================
     14. FALA — o idioma evolui com a cultura (níveis 0..4)
     ============================================================ */
  function rotulo(conceito) { return (D.CONCEITOS[conceito] ? D.CONCEITOS[conceito].label : conceito); }

  function falaSituacao(npc, mundo) {
    const c = npc.cerebro;
    const nec = npc.nec || {};
    const obj = npc.objetivo || 'ocioso';
    const mapa = {
      comer: { acao: 'comer', ger: 'com fome', coisa: 'fruta' },
      beber: { acao: 'beber', ger: 'com sede', coisa: 'água' },
      dormir: { acao: 'dormir', ger: 'com sono', coisa: 'abrigo' },
      fugir: { acao: 'fugir', ger: 'com medo', coisa: 'perigo' },
      defender: { acao: 'lutar', ger: 'com raiva', coisa: 'animal' },
      aquecer: { acao: 'aquecer', ger: 'com frio', coisa: 'fogo' },
      trabalho: { acao: 'trabalhar', ger: 'ocupado', coisa: 'pedra' },
      construir: { acao: 'construir', ger: 'construindo', coisa: 'abrigo' },
      descobrir: { acao: 'olhar', ger: 'curioso', coisa: 'aquilo' },
      social: { acao: 'falar', ger: 'sozinho', coisa: 'você' },
      ensinar: { acao: 'ensinar', ger: 'ensinando', coisa: 'o jeito' },
      reproduzir: { acao: 'cortejar', ger: 'só', coisa: 'companhia' },
      brincar: { acao: 'brincar', ger: 'brincando', coisa: 'pedrinha' },
      seguir_pais: { acao: 'seguir', ger: 'perdido', coisa: 'mãe' },
      plantar: { acao: 'plantar', ger: 'plantando', coisa: 'semente' },
      explorar: { acao: 'andar', ger: 'andando', coisa: 'nada' },
      ocioso: { acao: 'parar', ger: 'parado', coisa: 'nada' }
    };
    const m = mapa[obj] || mapa.ocioso;
    const nivel = c.nivelLingua;
    const lv = nivel >= 4 ? D.LINGUA.nivel4 : nivel === 3 ? D.LINGUA.nivel3 : nivel === 2 ? D.LINGUA.nivel2 : nivel === 1 ? D.LINGUA.nivel1 : D.LINGUA.nivel0;
    let t = lv[Math.floor(mundo.rng.next() * lv.length) % lv.length];
    t = t.replace('{acao}', m.acao).replace('{coisa}', m.coisa).replace('{ger}', m.ger)
      .replace('{lugar}', 'rio').replace('{uso}', 'comer').replace('{razao}', 'é melhor')
      .replace('{emocao}', c.emocao.medo > 50 ? 'medo' : (c.emocao.alegria > 60 ? 'alegria' : 'vontade'));
    return t;
  }

  function falar(npc, pergunta, mundo) {
    const c = npc.cerebro;
    const q = (pergunta || '').toLowerCase();
    const nivel = c.nivelLingua;
    const diga = (txt) => { c.ultimaFala = txt; c.falaAte = mundo.tempo.segMundo + 900; return txt; };

    // o que ele sabe sobre o mundo
    const conhece = Object.keys(c.conhecimento).filter(k => c.conhecimento[k].conf > 0.4);

    if (/nome|chama/.test(q)) {
      if (npc.fundador || c.conhecimento['c:nomes'] || c.conhecimento['c:proprio_nome']) {
        return diga(nivel >= 2 ? 'Meu nome é ' + npc.nome + '.' : npc.nome + '.');
      }
      return diga(nivel >= 1 ? 'nome? ... eu?' : '«inclina a cabeça, sem entender»');
    }
    if (/quantos anos|idade/.test(q)) {
      const a = Math.floor(npc.caps.idadeAnos);
      if (c.conhecimento['c:contagem']) return diga(nivel >= 3 ? 'Tenho ' + a + ' invernos.' : a + ' frios.');
      return diga('«mostra os dedos, não sabe contar»');
    }
    if (/o que (você )?(está |ta )?faz|fazendo/.test(q)) {
      return diga(falaSituacao(npc, mundo));
    }
    if (/com (fome|sede)|sentindo/.test(q)) {
      if (npc.corpo.fome > 60) return diga(nivel >= 2 ? 'eu com fome.' : 'fome!');
      if (npc.corpo.sede > 60) return diga(nivel >= 2 ? 'eu com sede.' : 'água!');
      if (npc.corpo.saude < 60) return diga(nivel >= 2 ? 'eu com dor.' : 'dor...');
      return diga(nivel >= 3 ? 'Estou bem.' : 'bom.');
    }
    if (/comer|comida|fruta/.test(q)) {
      const f = conhece.filter(k => k.startsWith('vis:') && c.conhecimento[k].tags && c.conhecimento[k].tags.comestivel > 0.5);
      if (f.length) return diga(nivel >= 3 ? 'Como ' + rotulo(f[0]) + '. É bom.' : (nivel >= 1 ? rotulo(f[0]) + ' bom.' : '«aponta para a boca»'));
      return diga(nivel >= 2 ? 'não sei o que come.' : '«encolhe os ombros»');
    }
    if (/perigo|medo|animal/.test(q)) {
      const p = conhece.filter(k => c.conhecimento[k].tags && c.conhecimento[k].tags.perigoso > 0.4);
      if (p.length) return diga(nivel >= 3 ? 'Cuidado com ' + rotulo(p[0]) + '.' : rotulo(p[0]) + ' mau!');
      return diga(nivel >= 2 ? 'nada mau aqui.' : '«olha em volta»');
    }
    if (/água|agua|rio|beber/.test(q)) {
      const m = memoriaMelhor(c, 'agua', npc.pos.x, npc.pos.y, mundo);
      if (m && nivel >= 2) return diga('Tem água naquela direção, eu já bebi lá.');
      return diga(nivel >= 3 ? 'Sei onde tem água.' : 'água ali.');
    }
    if (/construir|casa|abrigo/.test(q)) {
      const k = Object.keys(c.conhecimento).filter(x => x.startsWith('t:') && c.conhecimento[x].conf > 0.5);
      if (!k.length) return diga(nivel >= 2 ? 'eu não sei fazer.' : '«não sabe»');
      const r = D.RECEITAS.find(x => 't:' + x.id === k[k.length - 1]);
      return diga(nivel >= 3 ? 'Sei fazer ' + (r ? r.nome : 'algo') + '.' : (r ? r.nome : 'fazer'));
    }
    if (/quem é você|o que você é|humano/.test(q)) {
      return diga(nivel >= 3 ? 'Sou ' + npc.nome + ', vivo aqui.' : 'eu vivo aqui.');
    }
    if (/deus|deuses|criador|maior/.test(q)) {
      if (c.conhecimento['c:religiao']) return diga(nivel >= 3 ? 'Existe algo maior. A gente não vê, mas cuida.' : 'algo grande. cuida.');
      return diga(nivel >= 2 ? 'não sei.' : '«olha o céu»');
    }
    if (/morte|morrer|morto/.test(q)) {
      if (c.conhecimento['c:morte']) return diga(nivel >= 3 ? 'Vi alguém parar de respirar. Nunca mais voltou.' : 'parou. nunca volta.');
      return diga('«não entende»');
    }
    if (/filho|nascer|criança/.test(q)) {
      if (c.conhecimento['c:maternidade']) return diga(nivel >= 3 ? 'Filho nasce de homem e mulher.' : 'homem + mulher = filho.');
      return diga('«não sabe de onde vêm os filhos»');
    }
    if (/fogo/.test(q)) {
      if (c.conhecimento['vis:fogo'] && c.conhecimento['vis:fogo'].tags.quente > 0.4) return diga(nivel >= 3 ? 'Fogo queima. Mas aquece.' : 'fogo quente!');
      return diga('«não conhece fogo»');
    }
    // resposta genérica
    if (nivel === 0) return diga('«gesticula»');
    if (nivel === 1) return diga('«' + falaSituacao(npc, mundo) + '»');
    return diga(falaSituacao(npc, mundo));
  }

  /* ============================================================
     15. ANIMAIS — cérebro simplificado, mesmas bases
     ============================================================ */
  function mreg(an, k) { an.cerebro.feito = an.cerebro.feito || {}; an.cerebro.feito[k] = (an.cerebro.feito[k] || 0) + 1; }

  function comidaPara(esp, e, an) {
    if (e === an) return false;
    if (esp.classe === 'carnivoro') {
      return e.classe === 'animal' && e.tamanho < an.tamanho * 3.2 && (e.corpo ? e.corpo.saude > 0 : true);
    }
    if (e.classe === 'planta') return e.altura !== undefined && e.altura < 3.2;
    if (e.classe === 'plantacao') return true;
    if (e.classe === 'animal' && esp.classe === 'onivoro') return e.tamanho < an.tamanho * 0.6;
    return false;
  }

  function passoAnimal(an, mundo, dt) {
    const c = an.cerebro;
    if (!an.caps) an.caps = capsAnimal(an);
    if (!c.conhecimento) { c.conhecimento = {}; c.social = {}; c.mapa = {}; c.emocao = { medo: 0 }; }
    c.tDecisao = (c.tDecisao || 0) + dt;
    c.tPercepcao = (c.tPercepcao || 0) + dt;
    const esp = D.FAUNA[an.especie];
    if (!esp) return;
    if (c.tPercepcao > 0.5) {
      c.tPercepcao = 0;
      const alc = (esp.visao || 20) * (esp.sentidos ? esp.sentidos.visao : 1) * (1 - mundo.luzNoite() * 0.5);
      c.perceptos = perceber(an, mundo, 22).sort((a, b) => a.dist - b.dist);
      c.perceptos = c.perceptos.filter(p => p.dist < alc);
    }
    if (c.tDecisao < 0.9) return;
    c.tDecisao = 0;

    // necessidades básicas
    const fome = an.corpo.fome, sede = an.corpo.sede;

    // --- COME o que está ao alcance (plantas, frutos, plantações, presas) ---
    if (fome > 22) {
      if (esp.peixe) {
        if (esp.classe !== 'carnivoro' || fome > 45) { an.corpo.fome = Math.max(0, an.corpo.fome - (esp.classe === 'carnivoro' ? 22 : 40)); an.estado = 'comendo'; return; }
      }
      const perto = mundo.proximos(an.pos.x, an.pos.y, 2.8, an);
      let alvo = null;
      for (const e of perto) { if (comidaPara(esp, e, an)) { alvo = e; break; } }
      if (alvo) {
        if (alvo.classe === 'animal') {
          alvo.corpo.saude = 0;                 // abateu a presa
          an.corpo.fome = Math.max(0, an.corpo.fome - 70);
          mreg(an, 'cacou');
        } else {
          if (alvo.frutos > 0) alvo.frutos--;
          else if (alvo.nFolhas !== undefined && alvo.nFolhas > 0) alvo.nFolhas--;
          an.corpo.fome = Math.max(0, an.corpo.fome - (esp.massa > 300 ? 55 : 38));
        }
        an.estado = 'comendo';
        return;
      }
    }
    // --- BEBE se estiver ao lado da água ---
    if (sede > 22 && !esp.nado) {
      const po = mundo.aguaMaisProxima ? mundo.aguaMaisProxima(an.pos.x, an.pos.y, 3.0) : null;
      if (po) { an.corpo.sede = 0; an.estado = 'bebendo'; return; }
    }
    const ameaca = c.perceptos.find(p => (p.classe === 'humano' && esp.presa) || (p.classe === 'animal' && p.id !== an.id && p.perigo > esp.perigo * 0.8 && p.dist < 14));
    const presa = esp.classe === 'carnivoro' ? c.perceptos.find(p => p.classe === 'animal' && p.id !== an.id && !p.perigo && p.tamanho > 0.2 && p.dist < (esp.visao || 20)) : null;

    if (ameaca && esp.presa || (ameaca && esp.perigo < 0.5)) {
      an.acao = { tipo: 'fugir', alvoId: ameaca.id };
      an.estado = 'fugindo';
      return;
    }
    if (fome > 45 && presa && !esp.peixe) { an.acao = { tipo: 'cacar', alvoId: presa.id }; an.estado = 'caçando'; return; }
    if (fome > 40 && esp.classe !== 'carnivoro') {
      const comida = c.perceptos.find(p => (p.classe === 'planta' || p.classe === 'plantacao') && p.dist < 26);
      if (comida) { an.acao = { tipo: 'ir', x: comida.x, y: comida.y, alvoId: comida.id, proximidade: 0.9, vagar: false }; an.estado = 'procurando comida'; return; }
    }
    if (sede > 42) {
      if (!esp.nado) {
        const vista = c.perceptos.find(p => p.classe === 'agua' && p.dist < 40);
        const cheiro = (!vista && mundo.aguaMaisProxima) ? mundo.aguaMaisProxima(an.pos.x, an.pos.y, 130) : null;
        const agua = vista || cheiro;
        if (agua) {
          const ax = agua.pos ? agua.pos.x : agua.x, ay = agua.pos ? agua.pos.y : agua.y;
          an.acao = { tipo: 'ir', x: ax, y: ay, alvoId: agua.id, proximidade: 1.6 };
          an.estado = 'bebendo';
          return;
        }
      }
    }
    if (an.domesticado > 0.5 && esp.rebanho) {
      // segue o dono ou o grupo
      const dono = an.dono ? mundo.porId(an.dono) : null;
      if (dono && dono.vivo && U.dist(an.pos.x, an.pos.y, dono.pos.x, dono.pos.y) > 6) {
        an.acao = { tipo: 'ir', x: dono.pos.x, y: dono.pos.y, proximidade: 2.5 }; an.estado = 'seguindo dono'; return;
      }
      const igual = c.perceptos.find(p => p.classe === 'animal' && p.especie === an.especie && p.dist > 3);
      if (igual) { an.acao = { tipo: 'ir', x: igual.x, y: igual.y, proximidade: 2.0 }; an.estado = 'em grupo'; return; }
    }
    // vagar
    if (!an.acao || an.acao.feito) {
      const rr = esp.nado ? 9 : (6 + (esp.velMax || 1) * 2);
      an.acao = { tipo: 'ir', x: an.pos.x + mundo.rng.range(-rr, rr), y: an.pos.y + mundo.rng.range(-rr, rr), vagar: true };
      an.estado = 'vagueando';
    }
  }

  /* ============================================================
     16. API
     ============================================================ */
  return {
    GENES, genomaAleatorio, genomaFilho,
    CURVAS, curvaIdade, capacidades, capsAnimal,
    novoCerebro,
    perceber, aparenciaVisual, necessidades, atencao,
    lembrar, memoriaMelhor, episodio, reforcar,
    atualizarEmocoes, planos, escolher, prever,
    passo, passoAnimal, comunicar, registrarSocial,
    aprender, herdarCultura, falar, falaSituacao, rotulo, tentarReceita,
    esquemasDe, observarImpedimento, aprenderTransposicao, candidatosTranspor
  };
});
