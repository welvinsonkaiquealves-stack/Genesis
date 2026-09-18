/* ============================================================================
   ACEITE E3 / E6 / E8 — a página, num navegador de verdade.

     · varredura de 500 passos de zoom, do espaço a 2 metros;
     · em 100% dos passos a tela tem superfície desenhada, nunca vazia;
     · 0 exceções no console em toda a varredura;
     · sem salto de informação entre passos vizinhos;
     · medições: ms de pintura, fps, amostragem por nível;
     · capturas de L0 a L4.
   ========================================================================== */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const URL_BASE = process.env.URL_BASE || 'http://127.0.0.1:8741/fase2b/';
const SAIDA = path.join(__dirname, '..', 'capturas');

(async () => {
  fs.mkdirSync(SAIDA, { recursive: true });
  const navegador = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage']
  });
  const pagina = await navegador.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2 });

  const erros = [];
  pagina.on('console', msg => { if (msg.type() === 'error') erros.push('console: ' + msg.text()); });
  pagina.on('pageerror', e => erros.push('pageerror: ' + e.message));

  await pagina.goto(URL_BASE, { waitUntil: 'load' });
  await pagina.waitForFunction('window.GENESIS_TERRA !== undefined', { timeout: 30000 });
  await pagina.waitForTimeout(2500);

  const erroVisivel = await pagina.evaluate(() => {
    const el = document.getElementById('erro');
    return (el && el.style.display === 'block') ? el.textContent : null;
  });
  if (erroVisivel) {
    console.log('A PAGINA NAO MONTOU:\n' + erroVisivel);
    await navegador.close();
    process.exit(1);
  }

  /* ---------------- suites dentro da página ---------------- */
  const suites = await pagina.evaluate(() => {
    const r = window.GENESIS_TERRA.testes();
    const cont = l => {
      const a = Array.isArray(l) ? l : (l.testes || []);
      return { total: a.length, falhas: a.filter(t => t.ok === false).map(t => t.id + ' ' + t.nome) };
    };
    return { superficie: cont(r.superficie), endereco: cont(r.endereco) };
  });

  /* ---------------- varredura de 500 passos ---------------- */
  const PASSOS = 500;
  const M0 = 4.2e7, M1 = 2.0;
  const razao = Math.pow(M1 / M0, 1 / (PASSOS - 1));

  const varredura = await pagina.evaluate(async ({ PASSOS, M0, razao }) => {
    const G = window.GENESIS_TERRA;
    const SU = G.modulos.SU;
    const cvSup = document.getElementById('sup');
    const ctx = cvSup.getContext('2d');
    const espera = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const linhas = [];
    let M = M0;
    let anterior = null;
    let vazios = 0, saltos = 0, piorSalto = 0, piorSaltoOnde = 0;
    const porNivel = {};

    for (let i = 0; i < PASSOS; i++) {
      G.irPara(M);
      await espera();
      const est = G.estado();
      const pesoSup = est.pesoSuperficie;

      /* assinatura do quadro: média e desvio de uma malha de amostras da
         superfície, mais a contagem de cores distintas. Um quadro "só azul"
         chapado tem desvio zero e uma cor só. */
      let desvio = null, cores = null, media = null;
      if (pesoSup > 0.02) {
        const w = cvSup.width, h = cvSup.height;
        const d = ctx.getImageData(0, 0, w, h).data;
        let s = 0, s2 = 0, n = 0;
        const set = new Set();
        for (let y = 0; y < h; y += 7) {
          for (let x = 0; x < w; x += 7) {
            const k = (y * w + x) * 4;
            const lum = d[k] * 0.299 + d[k + 1] * 0.587 + d[k + 2] * 0.114;
            s += lum; s2 += lum * lum; n++;
            set.add((d[k] >> 3) << 10 | (d[k + 1] >> 3) << 5 | (d[k + 2] >> 3));
          }
        }
        media = s / n;
        desvio = Math.sqrt(Math.max(0, s2 / n - media * media));
        cores = set.size;
        /* vazio = quadro sem informação nenhuma */
        if (cores <= 1 || desvio < 0.35) vazios++;
        if (anterior && anterior.media !== null) {
          const salto = Math.abs(media - anterior.media);
          if (salto > piorSalto) { piorSalto = salto; piorSaltoOnde = M; }
          if (salto > 40) saltos++;
        }
      }

      const nivel = est.nivel;
      if (!porNivel[nivel]) porNivel[nivel] = { n: 0, nPintado: 0, ms: 0, msMax: 0, amostragem: 0, fps: 0 };
      const pn = porNivel[nivel];
      pn.n++;
      /* so conta o custo de pintura onde a superficie de fato pintou. Onde
         quem desenha e o globo, `ms` seria o valor velho da ultima pintura. */
      if (pesoSup > 0.02) { pn.nPintado++; pn.ms += est.ms; pn.msMax = Math.max(pn.msMax, est.ms); }
      pn.amostragem += est.amostragem; pn.fps += est.fps;

      linhas.push({ i, M, nivel, pesoSup, media, desvio, cores, ms: est.ms, am: est.amostragem });
      anterior = { media };
      M *= razao;
    }

    for (const k in porNivel) {
      porNivel[k].msMedio = porNivel[k].nPintado ? porNivel[k].ms / porNivel[k].nPintado : null;
      porNivel[k].amostragemMedia = porNivel[k].amostragem / porNivel[k].n;
      porNivel[k].fpsMedio = porNivel[k].fps / porNivel[k].n;
    }
    return { linhas, vazios, saltos, piorSalto, piorSaltoOnde, porNivel };
  }, { PASSOS, M0, razao });

  /* ---------------- capturas L0 a L4 ---------------- */
  const alvos = [
    ['L0', 4.0e7], ['L1', 2.0e6], ['L2', 6.0e4], ['L2b', 1.2e3],
    ['L3', 1.6e2], ['L3b', 3.0e1], ['L4', 8]
  ];
  const capturas = [];
  for (const [nome, M] of alvos) {
    await pagina.evaluate(M => window.GENESIS_TERRA.irPara(M, 80, 80), M);
    await pagina.waitForTimeout(900);
    const arq = path.join(SAIDA, 'terra_' + nome + '.png');
    await pagina.screenshot({ path: arq });
    const est = await pagina.evaluate(() => window.GENESIS_TERRA.estado());
    capturas.push({ nome, M, arquivo: arq, est });
  }

  /* ---------------- vazamento: 200 idas e voltas ---------------- */
  const memoria = await pagina.evaluate(async () => {
    const G = window.GENESIS_TERRA;
    const espera = () => new Promise(r => requestAnimationFrame(r));
    const antes = performance.memory ? performance.memory.usedJSHeapSize : null;
    for (let i = 0; i < 200; i++) {
      G.irPara(20 + (i % 50) * 400, 20 + (i % 120), 20 + ((i * 7) % 120));
      if (i % 10 === 0) await espera();
    }
    await espera();
    const depois = performance.memory ? performance.memory.usedJSHeapSize : null;
    return { antes, depois };
  });

  await navegador.close();

  /* ---------------- relatório ---------------- */
  const ok = [];
  function diz(nome, cond, txt) {
    ok.push(cond);
    console.log('[' + (cond ? 'PASSA' : 'FALHA') + '] ' + nome);
    if (txt) console.log('          ' + txt);
  }

  console.log('==============================================================');
  console.log('ACEITE DA PAGINA — varredura de ' + PASSOS + ' passos, 390x780');
  console.log('==============================================================\n');

  diz('suite da superficie dentro do navegador',
      suites.superficie.falhas.length === 0,
      suites.superficie.total + ' testes, falhas: ' + (suites.superficie.falhas.join(', ') || 'nenhuma'));
  diz('suite do endereco dentro do navegador',
      suites.endereco.falhas.length === 0,
      suites.endereco.total + ' testes, falhas: ' + (suites.endereco.falhas.join(', ') || 'nenhuma'));

  const comSup = varredura.linhas.filter(l => l.pesoSup > 0.02).length;
  diz('nenhum quadro vazio em ' + PASSOS + ' passos de zoom',
      varredura.vazios === 0,
      'passos com superficie ativa: ' + comSup + ' · quadros vazios: ' + varredura.vazios);
  diz('0 excecoes no console durante toda a varredura',
      erros.length === 0,
      erros.length ? erros.slice(0, 5).join(' | ') : 'nenhuma');
  diz('sem salto de informacao entre passos vizinhos',
      varredura.saltos === 0,
      'maior salto de luminancia media: ' + varredura.piorSalto.toFixed(2) +
      ' (de 255) em ' + varredura.piorSaltoOnde.toExponential(2) + ' m de tela');

  console.log('\n--- orcamento de quadro por nivel de LOD ---');
  Object.keys(varredura.porNivel).sort().forEach(k => {
    const p = varredura.porNivel[k];
    console.log('  ' + k + '  passos ' + String(p.n).padStart(3) +
      '   pintura ' + (p.msMedio === null ? 'globo 3D' :
          p.msMedio.toFixed(1) + ' ms media, pico ' + p.msMax.toFixed(1)) +
      '   amostragem ' + p.amostragemMedia.toFixed(2) +
      '   fps ' + p.fpsMedio.toFixed(0));
  });

  console.log('\n--- capturas ---');
  capturas.forEach(c => {
    console.log('  ' + c.nome.padEnd(4) + ' ' +
      (c.M >= 1000 ? (c.M / 1000).toFixed(0) + ' km' : c.M + ' m').padStart(9) +
      '  nivel ' + c.est.nivel + '  superficie ' + (c.est.pesoSuperficie * 100).toFixed(0) + '%' +
      '  vida ' + c.est.vida + '  amostragem ' + c.est.amostragem +
      '  ' + c.est.ms.toFixed(0) + ' ms  ' + path.basename(c.arquivo));
  });

  if (memoria.antes) {
    const cresc = (memoria.depois - memoria.antes) / 1048576;
    diz('200 idas e voltas sem crescimento descontrolado de memoria',
        cresc < 40, 'heap antes ' + (memoria.antes / 1048576).toFixed(1) + ' MB, depois ' +
        (memoria.depois / 1048576).toFixed(1) + ' MB, delta ' + cresc.toFixed(1) + ' MB');
  } else {
    console.log('\n(memoria: performance.memory indisponivel neste navegador)');
  }

  const falhou = ok.filter(v => !v).length;
  console.log('\n==============================================================');
  console.log(falhou === 0 ? 'PAGINA: TODOS OS CRITERIOS CUMPRIDOS'
                           : falhou + ' CRITERIOS FALHARAM');
  console.log('==============================================================');
  process.exit(falhou === 0 ? 0 : 1);
})().catch(e => { console.error('ERRO NO HARNESS:', e); process.exit(2); });
