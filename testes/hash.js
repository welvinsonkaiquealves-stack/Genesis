/* hashMundo(seed) — impresso e nada mais, para ser chamado em processos
   separados e os dois resultados comparados de fora. */
'use strict';
const path = require('path');
const raiz = path.join(__dirname, '..');
const T = require(path.join(raiz, 'fase1/terra.js'));
const W = require(path.join(raiz, 'v2/core/world.js'));
const E = require(path.join(raiz, 'fase2a/endereco.js'));
const A = require(path.join(raiz, 'v2/core/ambiente.js'));
const S = require(path.join(raiz, 'v2/core/superficie.js'));
globalThis.GenesisWorld = W;
const seed = Number(process.argv[2]) || 20260101;
process.stdout.write(S.hashMundo({ W, T, E, A }, seed) + '\n');
