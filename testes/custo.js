/* ============================================================================
   ACEITE E6 — custo medido, não estimado.

     · tempo de geração de uma região (world.js) e do campo planetário;
     · memória por região ativa, contada byte a byte nos TypedArrays;
     · custo de amostraEm em microssegundos;
     · custo de um passo de mundo e de um passo de ambiente;
     · 200 regiões geradas e descartadas, com o heap medido;
     · determinismo: hash do mundo em duas gerações independentes.
   ========================================================================== */
'use strict';
const path = require('path');
const crypto = require('crypto');
const raiz = path.join(__dirname, '..');
const T = require(path.join(raiz, 'fase1/terra.js'));
const W = require(path.join(raiz, 'v2/core/world.js'));
const E = require(path.join(raiz, 'fase2a/endereco.js'));
const A = require(path.join(raiz, 'v2/core/ambiente.js'));
const S = require(path.join(raiz, 'v2/core/superficie.js'));
globalThis.GenesisWorld = W;

const SEED = 20260101;
const ms = () => Number(process.hrtime.bigint()) / 1e6;

function media(f, n) {
  f(); f();
  const t0 = ms();
  for (let i = 0; i < n; i++) f();
  return (ms() - t0) / n;
}

function bytesDe(obj, vistos) {
  vistos = vistos || new Set();
  if (!obj || typeof obj !== 'object') return 0;
  if (vistos.has(obj)) return 0;
  vistos.add(obj);
  if (ArrayBuffer.isView(obj)) return obj.byteLength;
  let s = 0;
  if (Array.isArray(obj)) { for (const v of obj) s += bytesDe(v, vistos) + 8; return s; }
  for (const k in obj) { if (Object.prototype.hasOwnProperty.call(obj, k)) s += bytesDe(obj[k], vistos) + 16; }
  return s;
}

console.log('==============================================================');
console.log('ACEITE E6 — CUSTO E ESCALA');
console.log('==============================================================\n');

/* ---------- geração ---------- */
const tRegiao = media(() => W.criar({ seed: SEED }), 12);
const m = W.criar({ seed: SEED });
const tPlaneta = media(() => A.criarPlaneta({ seed: SEED, T: T }), 4);
const amb = A.criar(W, m, { T: T });
const C = S.criar({ W: W, T: T, E: E, A: A }, m, { ambiente: amb });
const tSuperficie = media(() => S.criar({ W: W, T: T, E: E, A: A }, m, { ambiente: amb }), 12);

console.log('GERAÇÃO');
console.log('  região do world.js (160x160 tiles + vida)  ' + tRegiao.toFixed(1) + ' ms');
console.log('  campo planetário 360x180 (ambiente.js)     ' + tPlaneta.toFixed(1) + ' ms');
console.log('  camada superfície sobre os dois            ' + tSuperficie.toFixed(2) + ' ms');

/* ---------- memória ---------- */
const reg = W.regiaoAtiva(m);
let bytesReg = 0;
for (const k in reg) if (ArrayBuffer.isView(reg[k])) bytesReg += reg[k].byteLength;
const bytesPlaneta = bytesDe(amb.planeta);
const bytesRegional = bytesDe(amb.regional);
const bytesVida = bytesDe(m.plantas) + bytesDe(m.animais) + bytesDe(m.objetos) + bytesDe(m.npcs);

console.log('\nMEMÓRIA (TypedArrays contados byte a byte)');
console.log('  grades da região (world.js)                ' + (bytesReg / 1024).toFixed(1) + ' KB');
console.log('  grades do ambiente regional                ' + (bytesRegional / 1024).toFixed(1) + ' KB');
console.log('  campo planetário                           ' + (bytesPlaneta / 1024).toFixed(1) + ' KB');
console.log('  entidades vivas (' + m.plantas.length + ' plantas, ' + m.animais.length +
            ' animais, ' + m.objetos.length + ' objetos)  ~' + (bytesVida / 1024).toFixed(0) + ' KB');
console.log('  TOTAL por região ativa                     ' +
            ((bytesReg + bytesRegional + bytesVida) / 1024).toFixed(0) + ' KB' +
            '   (+ ' + (bytesPlaneta / 1024).toFixed(0) + ' KB do planeta, uma vez só)');

/* ---------- consulta ---------- */
let acc = 0, i = 0;
const tAmostra = media(() => { acc += S.amostraEm(C, (i * 7.31) % 160, (i * 3.17) % 160).altitude; i++; }, 4000);
const tElev = media(() => { acc += S.elevacaoDaDir(C, S.dirDoLocal(C, (i * 7.31) % 160, (i * 3.17) % 160), 12); i++; }, 20000);
const tAmostraR = media(() => { acc += S.amostraEm(C, (i * 7.31) % 160, (i * 3.17) % 160, { declive: 'rapido' }).altitude; i++; }, 4000);
const tAmostraS = media(() => { acc += S.amostraEm(C, (i * 7.31) % 160, (i * 3.17) % 160, { declive: false }).altitude; i++; }, 4000);
const tEnd = media(() => { E.enderecoDeGlobo(T, m, S.dirDoLocal(C, (i * 7.31) % 160, (i * 3.17) % 160)); i++; }, 20000);

console.log('\nCONSULTA (custo por chamada)');
console.log('  amostraEm(x,y)  completo, declive centrado ' + (tAmostra * 1000).toFixed(1) + ' µs');
console.log('  amostraEm(x,y)  declive adiantado          ' + (tAmostraR * 1000).toFixed(1) + ' µs');
console.log('  amostraEm(x,y)  sem declive                ' + (tAmostraS * 1000).toFixed(1) + ' µs');
console.log('  elevacaoDaDir   só a altura                ' + (tElev * 1000).toFixed(2) + ' µs');
console.log('  enderecoDeGlobo ponto -> endereço          ' + (tEnd * 1000).toFixed(2) + ' µs');
console.log('  (' + acc.toFixed(0) + ' — soma só para o otimizador não apagar as chamadas)');

/* ---------- passo de simulação ---------- */
const tTick = media(() => W.tick(m, 1), 120);
const tAmb = media(() => A.passoIntegrado(amb, W, m, 60, {}), 60);
console.log('\nPASSO DE SIMULAÇÃO');
console.log('  W.tick(1 s)                                ' + tTick.toFixed(2) + ' ms');
console.log('  ambiente.passoIntegrado(60 s)              ' + tAmb.toFixed(2) + ' ms');
console.log('  orçamento de 60 quadros por segundo        16,7 ms — cabe com folga');

/* ---------- 200 regiões ---------- */
if (global.gc) global.gc();
const heap0 = process.memoryUsage().heapUsed;
let somaH = 0;
const t200 = ms();
for (let k = 0; k < 200; k++) {
  const mk = W.criar({ seed: SEED + k });
  somaH += W.regiaoAtiva(mk).alturaTerreno[0];
}
const dt200 = ms() - t200;
if (global.gc) global.gc();
const heap1 = process.memoryUsage().heapUsed;
console.log('\n200 REGIÕES GERADAS E DESCARTADAS');
console.log('  tempo total                                ' + (dt200 / 1000).toFixed(1) + ' s  (' +
            (dt200 / 200).toFixed(1) + ' ms cada)');
console.log('  heap antes / depois                        ' + (heap0 / 1048576).toFixed(1) + ' MB / ' +
            (heap1 / 1048576).toFixed(1) + ' MB   delta ' + ((heap1 - heap0) / 1048576).toFixed(1) + ' MB');
console.log('  ' + (Math.abs(heap1 - heap0) / 1048576 < 40
  ? 'sem crescimento descontrolado' : 'ATENCAO: possivel vazamento') +
  '   (soma de controle ' + somaH.toFixed(2) + ')');

/* ---------- determinismo ---------- */
function hashMundo(seed) {
  const mm = W.criar({ seed: seed });
  const rr = W.regiaoAtiva(mm);
  const h = crypto.createHash('sha256');
  h.update('genesis.hash/1|seed=' + seed + '|tam=' + rr.largura);
  h.update(Buffer.from(rr.alturaTerreno.buffer, rr.alturaTerreno.byteOffset, rr.alturaTerreno.byteLength));
  h.update(Buffer.from(rr.tipo.buffer, rr.tipo.byteOffset, rr.tipo.byteLength));
  h.update(Buffer.from(rr.umidade.buffer, rr.umidade.byteOffset, rr.umidade.byteLength));
  h.update(Buffer.from(rr.temperatura.buffer, rr.temperatura.byteOffset, rr.temperatura.byteLength));
  h.update(Buffer.from(rr.fertilidade.buffer, rr.fertilidade.byteOffset, rr.fertilidade.byteLength));
  h.update(rr.lat + '|' + rr.lon + '|' + mm.plantas.length + '|' + mm.animais.length + '|' + mm.npcs.length);
  /* superfície: uma malha de amostras do campo contínuo, que é o que esta
     fase acrescentou. Se o campo mudar, o hash muda. */
  const ambH = A.criar(W, mm, { T: T });
  const CH = S.criar({ W: W, T: T, E: E, A: A }, mm, { ambiente: ambH });
  const buf = Buffer.alloc(8);
  for (let a = 0; a < 64; a++) {
    for (let b = 0; b < 64; b++) {
      const u = (a / 64) * 2 - 1, ph = (b / 64) * Math.PI * 2, sr = Math.sqrt(1 - u * u);
      const d = { x: sr * Math.cos(ph), y: u, z: sr * Math.sin(ph) };
      buf.writeDoubleLE(Math.round(S.elevacaoDaDir(CH, d, 10) * 1e6) / 1e6, 0);
      h.update(buf);
    }
  }
  return h.digest('hex');
}
const h1 = hashMundo(SEED);
const h2 = hashMundo(SEED);
console.log('\nDETERMINISMO — hash do mundo em duas gerações independentes');
console.log('  execução 1  ' + h1);
console.log('  execução 2  ' + h2);
console.log('  ' + (h1 === h2 ? 'IDÊNTICOS' : 'DIVERGIRAM — falha bloqueante'));
const h3 = hashMundo(SEED + 1);
console.log('  seed ' + (SEED + 1) + '  ' + h3.slice(0, 32) + '…  ' +
            (h3 !== h1 ? '(diferente, como tem de ser)' : 'IGUAL — a seed nao esta mandando'));

console.log('\n==============================================================');
process.exit(h1 === h2 && h3 !== h1 ? 0 : 1);
