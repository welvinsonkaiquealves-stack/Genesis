/* ============================================================================
   Gera a versão publicável da página a partir de fase2b/index.html.

   A publicação envolve o conteúdo num esqueleto próprio, então o arquivo
   publicado não pode ter doctype, <html>, <head> nem <body>. Este script faz
   essa conversão A PARTIR DO MESMO ARQUIVO que roda no servidor local, para
   que as duas versões nunca divirjam: se a página mudar, basta rodar isto de
   novo. Nada é reescrito à mão.

   Os módulos vão como arquivos de apoio, ao lado da página, com os mesmos
   nomes achatados. Nenhum é embutido: o conteúdo do JavaScript continua
   sendo exatamente o dos arquivos do repositório, byte a byte.
   ========================================================================== */
'use strict';
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
const saida = path.join(raiz, '_publicar');

const MAPA = {
  '../_build/three.min.js': 'three.min.js',
  '../v2/core/util.js': 'util.js',
  '../v2/core/data.js': 'data.js',
  '../v2/core/brain.js': 'brain.js',
  '../v2/core/world.js': 'world.js',
  '../v2/core/ambiente.js': 'ambiente.js',
  '../v2/core/superficie.js': 'superficie.js',
  '../fase1/terra.js': 'terra.js',
  '../fase2a/endereco.js': 'endereco.js'
};
const ORIGEM = {
  'three.min.js': '_build/three.min.js',
  'util.js': 'v2/core/util.js',
  'data.js': 'v2/core/data.js',
  'brain.js': 'v2/core/brain.js',
  'world.js': 'v2/core/world.js',
  'ambiente.js': 'v2/core/ambiente.js',
  'superficie.js': 'v2/core/superficie.js',
  'terra.js': 'fase1/terra.js',
  'endereco.js': 'fase2a/endereco.js'
};

fs.mkdirSync(saida, { recursive: true });
let html = fs.readFileSync(path.join(raiz, 'fase2b/index.html'), 'utf8');

/* recorta o miolo: tudo entre <title> e </body> */
const iTitulo = html.indexOf('<title>');
const iFimHead = html.indexOf('</head>');
const iCorpo = html.indexOf('<body>');
const iFimCorpo = html.lastIndexOf('</body>');
if (iTitulo < 0 || iFimHead < 0 || iCorpo < 0 || iFimCorpo < 0) {
  console.error('estrutura inesperada em fase2b/index.html'); process.exit(1);
}
const cabeca = html.slice(iTitulo, iFimHead).trim();
const corpo = html.slice(iCorpo + '<body>'.length, iFimCorpo).trim();

let miolo = cabeca + '\n\n' + corpo;
for (const [de, para] of Object.entries(MAPA)) {
  if (!miolo.includes(de)) { console.error('caminho nao encontrado: ' + de); process.exit(1); }
  miolo = miolo.split(de).join(para);
}

fs.writeFileSync(path.join(saida, 'index.html'), miolo + '\n');

/* Cópia SÓ PARA TESTE, com o esqueleto que a publicação acrescenta.
   Sem isso o teste local roda sem <meta charset>, o navegador decodifica os
   módulos como latin-1 e data.js quebra na primeira palavra acentuada — um
   defeito do arnês, não da página. Melhor testar o que vai rodar. */
fs.writeFileSync(path.join(saida, '_teste.html'),
  '<!doctype html>\n<html><head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n' +
  '<style>:root{color-scheme:light}body{margin:0;font:14px system-ui}' +
  'img{max-width:100%}[hidden]{display:none!important}</style>\n' +
  miolo + '\n</head></html>');
let total = Buffer.byteLength(miolo);
for (const [nome, rel] of Object.entries(ORIGEM)) {
  const b = fs.readFileSync(path.join(raiz, rel));
  fs.writeFileSync(path.join(saida, nome), b);
  total += b.length;
}
console.log('_publicar/ pronto: ' + (Object.keys(ORIGEM).length + 1) + ' arquivos, ' +
            (total / 1024).toFixed(0) + ' KB');
console.log('pagina: ' + (Buffer.byteLength(miolo) / 1024).toFixed(1) + ' KB' +
            (/<!doctype|<html|<head|<body/i.test(miolo) ? '   ATENCAO: sobrou tag de esqueleto' : ''));
