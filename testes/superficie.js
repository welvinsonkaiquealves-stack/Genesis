/* Executa a suíte da camada superfície em Node puro. */
'use strict';
var path = require('path');
var raiz = path.join(__dirname, '..');
var T = require(path.join(raiz, 'fase1/terra.js'));
var W = require(path.join(raiz, 'v2/core/world.js'));
var E = require(path.join(raiz, 'fase2a/endereco.js'));
var A = require(path.join(raiz, 'v2/core/ambiente.js'));
var S = require(path.join(raiz, 'v2/core/superficie.js'));
globalThis.GenesisWorld = W;

var SEED = Number(process.argv[2]) || 20260101;
var m = W.criar({ seed: SEED });
var amb = A.criar(W, m, { T: T });
var C = S.criar({ W: W, T: T, E: E, A: A }, m, { ambiente: amb });

console.log('=== camada superficie  ' + S.CONTRATO + '  seed ' + SEED + ' ===\n');
var r = S.rodarTestes(C);
var f = 0;
r.forEach(function (t) {
  console.log('[' + (t.ok ? 'PASSA' : 'FALHA') + '] ' + t.id + ' · ' + t.nome);
  if (!t.ok) f++;
  Object.keys(t.valores).forEach(function (k) {
    console.log('          ' + k + ': ' + t.valores[k]);
  });
});
console.log('\n' + (f === 0 ? 'TODOS OS ' + r.length + ' TESTES PASSAM' : f + ' FALHAS'));
process.exit(f === 0 ? 0 : 1);
