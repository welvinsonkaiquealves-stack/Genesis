/* ============================================================
   GÊNESIS v2 — core/util.js
   Matemática, RNG determinístico, ruído procedural e tempo.
   Navegador: window.GenesisUtil   Node: require('./util.js')
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GenesisUtil = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const PI2 = Math.PI * 2;

  /* ---------- TEMPO ----------
     1 dia do mundo = 24 h = 86400 s do mundo.
     1 ano do mundo = 365 dias.
     "escala" = quantos SEGUNDOS DO MUNDO passam por 1 segundo NOSSO.
       1      -> tempo real (1 s nosso = 1 s deles)
       86400  -> 1 dia deles por 1 segundo nosso
       604800 -> 1 semana deles por segundo
  */
  const SEG_DIA = 86400;
  const DIAS_ANO = 365;
  const SEG_ANO = SEG_DIA * DIAS_ANO;
  const SEG_MES = SEG_DIA * 30;
  const NOMES_ESTACAO = ['Primavera', 'Verão', 'Outono', 'Inverno'];

  function decomporTempo(seg) {
    let s = seg, neg = false;
    if (s < 0) { neg = true; s = -s; }
    const anos = Math.floor(s / SEG_ANO);
    const restoAno = s - anos * SEG_ANO;
    const diaDoAno = Math.floor(restoAno / SEG_DIA);
    const restoSeg = restoAno - diaDoAno * SEG_DIA;
    const diaAbs = Math.floor(s / SEG_DIA);
    const res = {
      anos: neg ? -anos : anos,
      negativo: neg,
      diaDoAno: diaDoAno + 1,
      diaAbs: diaAbs + 1,
      hora: Math.floor(restoSeg / 3600),
      min: Math.floor((restoSeg % 3600) / 60),
      seg: Math.floor(restoSeg % 60),
      fracDia: restoSeg / SEG_DIA
    };
    return res;
  }
  function estacao(diaDoAno) {
    // 0=Primavera 1=Verão 2=Outono 3=Inverno
    return Math.floor(((diaDoAno - 1) / DIAS_ANO) * 4) % 4;
  }
  function formatarData(seg) {
    const t = decomporTempo(seg);
    const a = t.negativo ? ('-' + (t.anos + 1)) : t.anos;
    return 'ano ' + a + ', dia ' + t.diaDoAno + ' (' + NOMES_ESTACAO[estacao(t.diaDoAno)] + ') ' +
      String(t.hora).padStart(2, '0') + ':' + String(t.min).padStart(2, '0');
  }
  function formatarDuracao(seg) {
    if (seg < 90) return seg.toFixed(1) + 's';
    if (seg < 5400) return (seg / 60).toFixed(1) + 'min';
    if (seg < SEG_DIA * 2) return (seg / 3600).toFixed(1) + 'h';
    if (seg < SEG_ANO) return (seg / SEG_DIA).toFixed(1) + ' dias';
    return (seg / SEG_ANO).toFixed(2) + ' anos';
  }
  function idadeAnos(seg) { return seg / SEG_ANO; }

  /* ---------- MATEMÁTICA ---------- */
  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function clamp01(v) { return v < 0 ? 0 : (v > 1 ? 1 : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function inv(v, a, b) { return b > a ? clamp01((v - a) / (b - a)) : 0; }   // normaliza
  function map(v, a, b, c, d) { return c + (d - c) * inv(v, a, b); }
  function suave(t) { t = clamp01(t); return t * t * (3 - 2 * t); }
  function suave2(t) { t = clamp01(t); return t * t * t * (t * (t * 6 - 15) + 10); }
  function sign(v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); }
  function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
  function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }
  function angDiff(a, b) { let d = (b - a) % PI2; if (d > Math.PI) d -= PI2; if (d < -Math.PI) d += PI2; return d; }
  function angLerp(a, b, t) { return a + angDiff(a, b) * clamp01(t); }
  function dentroCone(ax, ay, dir, fovRad, tx, ty) {
    const a = Math.atan2(ty - ay, tx - ax);
    return Math.abs(angDiff(dir, a)) <= fovRad * 0.5;
  }

  /* ---------- RNG DETERMINÍSTICO (mulberry32) ---------- */
  function RNG(seed) {
    let s = (seed | 0) || 1;
    const api = {
      seed: s,
      next() {
        s = (s + 0x6D2B79F5) | 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      },
      range(a, b) { return a + api.next() * (b - a); },
      int(a, b) { return Math.floor(api.range(a, b + 1 - 1e-9)); },
      pick(arr) { return arr[Math.floor(api.next() * arr.length) % arr.length]; },
      chance(p) { return api.next() < p; },
      sinal() { return api.next() < 0.5 ? -1 : 1; },
      gauss(m, sd) {
        let u = 0, v = 0;
        while (u === 0) u = api.next();
        while (v === 0) v = api.next();
        return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(PI2 * v);
      },
      fork(tag) { return RNG((s ^ ((tag || 0) * 2654435761)) | 0); },
      estado() { return s; },
      restaurar(v) { s = v | 0; }
    };
    return api;
  }

  /* ---------- RUÍDO PROCEDURAL (sem estado global => seguro p/ render) ---------- */
  function hash2i(x, y, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function hash3i(x, y, z, s) {
    let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1440662683) ^ Math.imul(s | 0, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function ruido2(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = suave(x - xi), yf = suave(y - yi);
    const a = hash2i(xi, yi, s), b = hash2i(xi + 1, yi, s);
    const c = hash2i(xi, yi + 1, s), d = hash2i(xi + 1, yi + 1, s);
    return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
  }
  function fbm(x, y, s, oct) {
    oct = oct || 4;
    let v = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      v += amp * ruido2(x * f, y * f, s + i * 977);
      norm += amp; amp *= 0.5; f *= 2;
    }
    return v / norm;
  }

  /* ---------- IDS ---------- */
  let _idSeq = 1;
  function novoId(prefixo) { return (prefixo || 'e') + (_idSeq++); }
  function resetIds(v) { _idSeq = v || 1; }

  /* ---------- COLORES ---------- */
  function hsl(h, s, l, a) {
    return 'hsla(' + (h | 0) + ',' + (s | 0) + '%,' + (l | 0) + '%,' + (a === undefined ? 1 : a) + ')';
  }
  function hexParaRgb(hex) {
    if (typeof hex === 'string') hex = parseInt(hex.replace('#', ''), 16);
    return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  }
  function rgbParaHex(r, g, b) {
    return '#' + ((1 << 24) + ((clamp(r, 0, 255) | 0) << 16) + ((clamp(g, 0, 255) | 0) << 8) + (clamp(b, 0, 255) | 0)).toString(16).slice(1);
  }
  function misturarHex(h1, h2, t) {
    const a = hexParaRgb(h1), b = hexParaRgb(h2);
    return rgbParaHex(lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t));
  }
  function escurecer(hex, t) { return misturarHex(hex, '#000000', clamp01(t)); }
  function clarear(hex, t) { return misturarHex(hex, '#ffffff', clamp01(t)); }

  /* ---------- MISC ---------- */
  function escolherPonderado(rng, itens, pesoFn) {
    let total = 0;
    for (const it of itens) total += Math.max(0, pesoFn(it));
    if (total <= 0) return itens[0];
    let r = rng.next() * total;
    for (const it of itens) { r -= Math.max(0, pesoFn(it)); if (r <= 0) return it; }
    return itens[itens.length - 1];
  }
  function media(arr) { if (!arr.length) return 0; let s = 0; for (const v of arr) s += v; return s / arr.length; }
  function somar(arr, f) { let s = 0; for (const v of arr) s += f ? f(v) : v; return s; }
  function limitarArray(arr, max) { while (arr.length > max) arr.shift(); return arr; }

  return {
    PI2, SEG_DIA, DIAS_ANO, SEG_ANO, SEG_MES, NOMES_ESTACAO,
    decomporTempo, estacao, formatarData, formatarDuracao, idadeAnos,
    clamp, clamp01, lerp, inv, map, suave, suave2, sign, dist, dist2,
    angDiff, angLerp, dentroCone,
    RNG, hash2i, hash3i, ruido2, fbm,
    novoId, resetIds,
    hsl, hexParaRgb, rgbParaHex, misturarHex, escurecer, clarear,
    escolherPonderado, media, somar, limitarArray
  };
});
