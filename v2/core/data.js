/* ============================================================
   GÊNESIS v2 — core/data.js
   Catálogo do universo: biomas, flora, fauna, itens, receitas
   (árvore tecnológica), conceitos, nomes e língua proto.
   Regra: aqui só existem LEIS e MATERIAIS. Nada de roteiro.
   ============================================================ */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GenesisData = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ============================================================
     BIOMAS — temperatura/chuva/flora/fauna definem o que vive ali
     ============================================================ */
  const BIOMAS = {
    oceano: { nome: 'Oceano', agua: true, cor: '#0e3d63', corTopo: '#17578a', tempBase: 14, chuva: 1.1, fertil: 0.02, dureza: 0, vegetacao: 0.0, fauna: ['peixe', 'tubarao', 'baleia'] },
    recife: { nome: 'Recife', agua: true, cor: '#17739c', corTopo: '#3ec2d6', tempBase: 22, chuva: 1.0, fertil: 0.1, dureza: 0, vegetacao: 0.05, fauna: ['peixe', 'tartaruga', 'caranguejo'] },
    praia: { nome: 'Praia', cor: '#e3d5a8', corTopo: '#efe4c2', tempBase: 24, chuva: 0.7, fertil: 0.15, dureza: 0.25, vegetacao: 0.05, flora: ['palmeira', 'capim'], fauna: ['caranguejo', 'tartaruga', 'gaivota'] },
    prado: { nome: 'Prado', cor: '#6ea84a', corTopo: '#8cc063', tempBase: 20, chuva: 1.0, fertil: 0.75, dureza: 0.15, vegetacao: 0.55, flora: ['capim', 'arbusto_fruta', 'flor_selvagem', 'trigo_selvagem'], fauna: ['coelho', 'vaca', 'ovelha', 'cabra', 'galinha', 'abelha', 'raposa', 'cavalo'] },
    floresta: { nome: 'Floresta', cor: '#2f6a33', corTopo: '#417f3d', tempBase: 18, chuva: 1.25, fertil: 0.85, dureza: 0.2, vegetacao: 0.95, flora: ['arvore_frutifera', 'carvalho', 'pinheiro', 'arbusto_fruta', 'cogumelo', 'bambu'], fauna: ['veado', 'javali', 'lobo', 'raposa', 'coruja', 'esquilo', 'urso', 'cobra', 'abelha'] },
    tropical: { nome: 'Floresta Tropical', cor: '#1f6b30', corTopo: '#2c8440', tempBase: 27, chuva: 2.0, fertil: 0.9, dureza: 0.2, vegetacao: 1.0, flora: ['arvore_frutifera', 'palmeira', 'bambu', 'arbusto_fruta', 'cogumelo'], fauna: ['macaco', 'onca', 'cobra', 'jacare', 'papagaio', 'capivara', 'abelha'] },
    savana: { nome: 'Savana', cor: '#a9a martial', corTopo: '#c4b06a', tempBase: 28, chuva: 0.5, fertil: 0.4, dureza: 0.3, vegetacao: 0.3, flora: ['capim', 'acacia', 'arbusto_fruta'], fauna: ['zebra', 'gnu', 'leao', 'elefante', 'avestruz'] },
    deserto: { nome: 'Deserto', cor: '#dbc47e', corTopo: '#e8d69b', tempBase: 34, chuva: 0.1, fertil: 0.05, dureza: 0.45, vegetacao: 0.03, flora: ['cacto', 'palmeira'], fauna: ['camelo', 'escorpiao', 'cobra', 'raposa'] },
    montanha: { nome: 'Montanha', cor: '#8a8375', corTopo: '#a8a294', tempBase: 8, chuva: 0.9, fertil: 0.2, dureza: 0.95, vegetacao: 0.15, flora: ['pinheiro', 'arbusto_fruta'], fauna: ['cabra', 'aguia', 'lobo', 'urso'] },
    taiga: { nome: 'Taiga', cor: '#3d5c4a', corTopo: '#547055', tempBase: 2, chuva: 0.8, fertil: 0.4, dureza: 0.5, vegetacao: 0.6, flora: ['pinheiro', 'cogumelo'], fauna: ['lobo', 'urso', 'veado', 'alce'] },
    tundra: { nome: 'Tundra', cor: '#b9c3c8', corTopo: '#d9e2e6', tempBase: -8, chuva: 0.4, fertil: 0.15, dureza: 0.6, vegetacao: 0.1, flora: ['musgo', 'arbusto_fruta'], fauna: ['rena', 'lobo', 'urso_branco'] },
    pantano: { nome: 'Pântano', cor: '#4a5c33', corTopo: '#5f6f42', tempBase: 24, chuva: 1.6, fertil: 0.7, dureza: 0.1, vegetacao: 0.7, flora: ['junco', 'cogumelo', 'carvalho'], fauna: ['jacare', 'sapo', 'cobra', 'capivara', 'mosquito'] },
    rio: { nome: 'Rio', agua: true, corrente: true, cor: '#1d6f9e', corTopo: '#3396c4', tempBase: 19, chuva: 1.0, fertil: 0.6, dureza: 0, vegetacao: 0, fauna: ['peixe', 'pato', 'jacare'] },
    lago: { nome: 'Lago', agua: true, cor: '#1a6a96', corTopo: '#2e94bd', tempBase: 19, chuva: 1.0, fertil: 0.5, dureza: 0, vegetacao: 0, fauna: ['peixe', 'pato', 'sapo'] }
  };
  // correção do typo acima, mantendo os dados íntegros
  BIOMAS.savana.cor = '#b5a35f'; BIOMAS.savana.corTopo = '#cdb871';

  const BIOMAS_IDS = Object.keys(BIOMAS);

  /* ============================================================
     FLORA — cada árvore nasce como indivíduo com folhas e frutos
     ============================================================ */
  const FLORA = {
    capim: { nome: 'Capim', tipo: 'graminea', altura: [0.25, 0.6], massa: 0.05, colheita: 'fibra', qtd: [1, 3], regenera: 600, cor: '#7cb14e' },
    trigo_selvagem: { nome: 'Trigo selvagem', tipo: 'graminea', altura: [0.5, 0.9], massa: 0.1, colheita: 'semente', qtd: [2, 5], regenera: 1800, cor: '#c8b45c' },
    junco: { nome: 'Junco', tipo: 'graminea', altura: [0.8, 1.6], massa: 0.2, colheita: 'fibra', qtd: [2, 4], regenera: 900, cor: '#8fae5a' },
    musgo: { nome: 'Musgo', tipo: 'rasteiro', altura: [0.03, 0.1], massa: 0.02, colheita: 'fibra', qtd: [1, 2], regenera: 1200, cor: '#6d8f54' },
    flor_selvagem: { nome: 'Flor silvestre', tipo: 'erva', altura: [0.2, 0.5], massa: 0.03, colheita: 'folha', qtd: [1, 2], regenera: 1000, cor: '#d86ba8' },
    cogumelo: { nome: 'Cogumelo', tipo: 'fungo', altura: [0.1, 0.3], massa: 0.04, colheita: 'cogumelo', qtd: [1, 3], regenera: 3600, cor: '#c4553f' },
    cacto: { nome: 'Cacto', tipo: 'suculenta', altura: [1.2, 3.5], massa: 60, colheita: 'agua_vegetal', qtd: [1, 2], regenera: 7200, cor: '#4f7a45', espinhos: 0.7 },
    arbusto_fruta: { nome: 'Arbusto frutífero', tipo: 'arbusto', altura: [1.1, 1.9], tronco: 0.1, copa: [0.7, 1.2], massa: 12, qtdFolhas: [24, 40], qtdFrutos: [4, 12], fruto: 'fruta_baga', frutoTam: 0.03, regenera: 4200, cor: '#4d7f36' },
    arvore_frutifera: { nome: 'Árvore frutífera', tipo: 'arvore', altura: [5, 10], tronco: 0.32, copa: [2.4, 3.8], massa: 800, qtdFolhas: [70, 120], qtdFrutos: [6, 18], fruto: 'fruta_vermelha', frutoTam: 0.09, regenera: 6000, cor: '#f0a83c', madeira: 'tronco', corFlora: '#3b7a3a' },
    acacia: { nome: 'Acácia', tipo: 'arvore', altura: [4, 8], tronco: 0.28, copa: [3.0, 4.6], massa: 700, qtdFolhas: [50, 90], qtdFrutos: [0, 3], fruto: 'vagem', frutoTam: 0.06, regenera: 7200, cor: '#d8c46a', madeira: 'tronco', corFlora: '#6d8f4a' },
    carvalho: { nome: 'Carvalho', tipo: 'arvore', altura: [8, 16], tronco: 0.55, copa: [3.2, 5.2], massa: 1800, qtdFolhas: [110, 190], qtdFrutos: [2, 9], fruto: 'noz', frutoTam: 0.05, regenera: 9000, cor: '#8a6a45', madeira: 'tronco', corFlora: '#2f6b34' },
    pinheiro: { nome: 'Pinheiro', tipo: 'conifera', altura: [10, 26], tronco: 0.5, copa: [2.0, 3.4], massa: 1400, qtdFolhas: [140, 240], qtdFrutos: [1, 5], fruto: 'pinha', frutoTam: 0.1, regenera: 12000, cor: '#2c5540', madeira: 'tronco', corFlora: '#1f4a33' },
    palmeira: { nome: 'Palmeira', tipo: 'palmeira', altura: [6, 14], tronco: 0.3, copa: [1.8, 3.0], massa: 600, qtdFolhas: [18, 34], qtdFrutos: [4, 14], fruto: 'coco', frutoTam: 0.22, regenera: 5400, cor: '#a08050', madeira: 'tronco', corFlora: '#3f8a3f' },
    bambu: { nome: 'Bambu', tipo: 'bambu', altura: [6, 14], tronco: 0.09, copa: [0.6, 1.2], massa: 90, qtdFolhas: [30, 60], qtdFrutos: [0, 0], regenera: 3000, cor: '#88a04a', madeira: 'graveto', corFlora: '#6d8f3a' }
  };

  /* ============================================================
     FAUNA — 34 espécies. Domesticação, produtos, perigo, sentidos.
     ============================================================ */
  const F = (nome, emoji, classe, massa, altura, velMax, forca, perigo, vidaAnos, matur, gest, cria, domest, visao, som, cor, extra) => {
    const o = {
      nome, emoji, classe, massa, altura, velMax, forca, perigo, vidaAnos,
      maturidade: matur, gestacao: gest, filhotes: cria, domest,
      visao, som, cor, cor2: '#3a2a1e',
      dieta: classe === 'carnivoro' ? 'carne' : (classe === 'onivoro' ? 'tudo' : classe === 'inseto' ? 'nectar' : 'vegetal'),
      sentidos: { visao: extra && extra.sv !== undefined ? extra.sv : 0.9, audicao: 1.0, olfato: 0.9 },
      nado: false, voa: false, prod: [], perigoAtaque: perigo, manso: classe === 'herbivoro'
    };
    if (extra) for (const k in extra) o[k] = extra[k];
    return o;
  };

  const FAUNA = {
    vaca: F('Vaca', '🐄', 'herbivoro', 520, 1.45, 1.4, 55, 0.06, 20, 2, 283, 1, 0.95, 24, 'muu', '#f4ece0', { prod: ['leite', 'couro', 'carne'], produtoSeg: 86400, rebanho: true, chifres: true, manso: true }),
    boi: F('Boi', '🐂', 'herbivoro', 750, 1.6, 1.3, 80, 0.15, 18, 2.5, 283, 1, 0.9, 22, 'muu', '#6b4a33', { prod: ['carne', 'couro'], rebanho: true, chifres: true, manso: true }),
    ovelha: F('Ovelha', '🐑', 'herbivoro', 60, 0.9, 1.2, 15, 0.03, 12, 1.5, 147, 1, 0.98, 20, 'béé', '#f0efe8', { prod: ['la', 'carne', 'couro'], produtoSeg: 43200, rebanho: true, manso: true, fofura: 0.9 }),
    cabra: F('Cabra', '🐐', 'herbivoro', 55, 0.85, 1.8, 14, 0.08, 14, 1.4, 150, 1, 0.95, 22, 'méé', '#c9bda6', { prod: ['leite', 'couro', 'carne'], produtoSeg: 43200, rebanho: true, chifres: true, manso: true, escalada: 0.8 }),
    porco: F('Porco', '🐖', 'onivoro', 130, 0.8, 1.5, 30, 0.12, 15, 1.5, 114, 4, 0.9, 18, 'oinc', '#e0a8a0', { prod: ['carne', 'couro'], rebanho: true, manso: true, farejador: 1.0 }),
    galinha: F('Galinha', '🐔', 'onivoro', 2.5, 0.4, 1.1, 1, 0.02, 8, 0.7, 21, 6, 0.98, 16, 'có', '#f2f0ec', { prod: ['ovo', 'carne', 'pena'], produtoSeg: 86400, voa: false, manso: true, fofura: 0.7 }),
    pato: F('Pato', '🦆', 'onivoro', 3, 0.35, 1.2, 1, 0.03, 10, 0.8, 28, 6, 0.9, 18, 'quá', '#d8d2c0', { prod: ['ovo', 'pena'], nado: 1.0, voa: 0.6, manso: true }),
    cavalo: F('Cavalo', '🐎', 'herbivoro', 480, 1.7, 7.5, 90, 0.1, 26, 3.5, 340, 1, 0.85, 26, 'ihh', '#5a3a24', { prod: ['couro', 'carne'], montavel: true, manso: true, velMax: 7.5 }),
    burro: F('Burro', '🫏', 'herbivoro', 350, 1.4, 4.5, 70, 0.08, 28, 3.5, 365, 1, 0.9, 22, 'ió', '#8a7a68', { montavel: true, carga: 60, manso: true }),
    caes: F('Cão selvagem', '🐕', 'carnivoro', 28, 0.7, 6.0, 25, 0.45, 14, 1.5, 63, 5, 0.95, 30, 'au', '#a08050', { caçador: true, guarda: 0.8, domest: 0.95 }),
    gato: F('Gato selvagem', '🐈', 'carnivoro', 4, 0.3, 5.0, 4, 0.12, 13, 1, 65, 4, 0.7, 28, 'miau', '#8a7a60', { caçador: true, roedor: true }),
    coelho: F('Coelho', '🐇', 'herbivoro', 3, 0.25, 3.2, 1, 0.01, 8, 0.6, 31, 5, 0.6, 22, '*silêncio*', '#c8baa8', { presa: 1.0, reproduz: 1.6, fofura: 1.0, altSalto: 0.5 }),
    veado: F('Veado', '🦌', 'herbivoro', 90, 1.2, 4.4, 20, 0.1, 16, 1.5, 235, 1, 0.2, 26, 'bramido', '#a06a3a', { presa: 1.0, fuga: 1.0 }),
    alce: F('Alce', '🫎', 'herbivoro', 400, 1.9, 3.6, 90, 0.35, 20, 3, 240, 1, 0.1, 24, 'bramido', '#5a4028', { presa: 1.0, chifres: true }),
    rena: F('Rena', '🦌', 'herbivoro', 160, 1.3, 3.8, 40, 0.15, 17, 2.5, 228, 1, 0.3, 24, 'grunhido', '#a89880', { presa: 1.0, frio: 1.0 }),
    javali: F('Javali', '🐗', 'onivoro', 110, 0.85, 3.4, 60, 0.55, 15, 1.5, 120, 4, 0.3, 20, 'grunhido', '#4a3a2a', { perigoso: true, presas: 1.0 }),
    capivara: F('Capivara', '🦫', 'herbivoro', 60, 0.6, 1.8, 14, 0.05, 10, 1.2, 150, 4, 0.4, 20, 'assobio', '#8a6a48', { presa: 1.0, nado: 0.9 }),
    macaco: F('Macaco', '🐒', 'onivoro', 8, 0.5, 3.0, 6, 0.1, 22, 4, 160, 1, 0.1, 24, 'uú-uú', '#8a6a50', { escalada: 1.0, esperto: 0.9 }),
    esquilo: F('Esquilo', '🐿️', 'herbivoro', 0.5, 0.2, 3.5, 0.5, 0.01, 6, 0.5, 40, 4, 0.1, 22, '*chiii*', '#a0703a', { escalada: 1.0, presa: 0.8 }),
    lobo: F('Lobo', '🐺', 'carnivoro', 45, 0.85, 6.5, 45, 0.8, 14, 2, 63, 4, 0.05, 34, 'uivo', '#6a6a72', { cacador: true, matilha: true, perigoso: true, ataqueGrupo: true }),
    raposa: F('Raposa', '🦊', 'carnivoro', 8, 0.4, 5.2, 8, 0.25, 11, 1, 52, 4, 0.1, 30, 'ganido', '#c05a2a', { cacador: true, astuto: 1.0 }),
    urso: F('Urso', '🐻', 'onivoro', 400, 1.8, 4.5, 200, 0.95, 25, 4, 220, 2, 0.02, 28, 'rugido', '#4a3428', { perigoso: true, tanque: 1.0 }),
    urso_branco: F('Urso polar', '🐻‍❄️', 'carnivoro', 450, 1.9, 4.8, 220, 1.0, 24, 4, 240, 2, 0.02, 30, 'rugido', '#e8eef0', { perigoso: true, frio: 1.0 }),
    onca: F('Onça', '🐆', 'carnivoro', 100, 0.9, 7.5, 120, 1.0, 18, 3, 100, 2, 0.02, 32, 'rugido', '#c8a050', { perigoso: true, emboscada: 1.0 }),
    leao: F('Leão', '🦁', 'carnivoro', 190, 1.2, 6.8, 200, 1.0, 18, 3.5, 110, 3, 0.02, 34, 'rugido', '#c8a860', { perigoso: true, matilha: true }),
    gnu: F('Gnu', '🦬', 'herbivoro', 250, 1.4, 4.2, 70, 0.3, 20, 3, 260, 1, 0.05, 24, 'grunhido', '#5a4a3a', { presa: 1.0, manada: true }),
    zebra: F('Zebra', '🦓', 'herbivoro', 300, 1.5, 5.0, 80, 0.25, 22, 3, 370, 1, 0.05, 26, 'zurro', '#e8e4dc', { presa: 1.0, manada: true }),
    elefante: F('Elefante', '🐘', 'herbivoro', 4000, 3.0, 2.5, 600, 0.7, 60, 12, 640, 1, 0.01, 28, 'trombeta', '#8a8a8a', { presa: 0.5, memoria: 1.0, carga: 400 }),
    camelo: F('Camelo', '🐪', 'herbivoro', 500, 2.0, 4.0, 90, 0.2, 40, 5, 400, 1, 0.4, 26, 'bramido', '#c8a878', { deserto: 1.0, montavel: true, carga: 150 }),
    avestruz: F('Avestruz', '🦤', 'onivoro', 120, 2.0, 8.0, 30, 0.4, 40, 4, 42, 6, 0.2, 30, 'grasnido', '#3a3028', { voa: false, velMax: 8.0 }),
    aguia: F('Águia', '🦅', 'carnivoro', 6, 0.8, 9.0, 10, 0.6, 20, 5, 45, 2, 0.01, 60, 'grito', '#6a4a2a', { voa: true, caçaAerea: 1.0, perigoso: true, sentidos: { visao: 2.0, audicao: 1.0, olfato: 0.6 } }),
    coruja: F('Coruja', '🦉', 'carnivoro', 2, 0.4, 6.0, 2, 0.1, 12, 2, 30, 3, 0.05, 50, 'uh-u', '#8a7a60', { voa: true, noturno: 1.0, sentidos: { visao: 1.6, audicao: 1.8, olfato: 0.4 } }),
    gaivota: F('Gaivota', '🐦', 'onivoro', 1, 0.4, 8.0, 1, 0.01, 15, 3, 26, 3, 0.1, 40, 'grasnido', '#f0f0f0', { voa: true }),
    papagaio: F('Papagaio', '🦜', 'herbivoro', 0.5, 0.3, 5.0, 0.3, 0.01, 40, 3, 26, 3, 0.2, 30, 'curupaco', '#3aa03a', { voa: true, imita: 1.0 }),
    cobra: F('Cobra', '🐍', 'carnivoro', 4, 0.2, 1.2, 3, 0.7, 20, 4, 60, 8, 0.02, 12, 'ssss', '#5a7a3a', { veneno: 0.8, perigoso: true, sentidos: { visao: 0.4, audicao: 0.1, olfato: 1.4 } }),
    jacare: F('Jacaré', '🐊', 'carnivoro', 250, 0.6, 2.0, 150, 0.9, 40, 8, 90, 20, 0.02, 20, 'bramido', '#4a5a3a', { perigoso: true, nado: 1.0, emboscada: 1.0 }),
    escorpiao: F('Escorpião', '🦂', 'carnivoro', 0.03, 0.1, 0.6, 0.5, 0.35, 6, 1, 60, 20, 0.0, 6, '*clique*', '#3a2a1a', { veneno: 0.7 }),
    tartaruga: F('Tartaruga', '🐢', 'herbivoro', 30, 0.4, 0.4, 5, 0.02, 80, 12, 90, 8, 0.1, 16, '*nada*', '#5a7a50', { casco: 1.0, nado: 0.8 }),
    sapo: F('Sapo', '🐸', 'inseto', 0.2, 0.1, 0.8, 0.2, 0.01, 6, 1, 20, 30, 0.0, 12, 'croac', '#4a8a3a', { veneno: 0.3, salto: 1.0 }),
    abelha: F('Abelha', '🐝', 'inseto', 0.001, 0.02, 4.0, 0.1, 0.12, 2, 0.2, 20, 50, 0.0, 10, 'zzzz', '#e8c03a', { voa: true, veneno: 0.3, poliniza: 1.0, enxame: true, colmeia: 1.0 }),
    formiga: F('Formiga', '🐜', 'inseto', 0.001, 0.01, 1.0, 0.05, 0.01, 1, 0.1, 10, 100, 0.0, 4, '*nada*', '#3a2a1a', { enxame: 1.0 }),
    borboleta: F('Borboleta', '🦋', 'inseto', 0.001, 0.05, 2.5, 0.01, 0.0, 0.5, 0.1, 14, 30, 0.0, 8, '*nada*', '#d86ba8', { voa: true, poliniza: 0.8 }),
    mosquito: F('Mosquito', '🦟', 'inseto', 0.0001, 0.01, 1.5, 0.01, 0.05, 0.2, 0.05, 4, 100, 0.0, 5, 'zzzz', '#5a5a5a', { voa: true, doenca: 0.4 }),
    rato: F('Rato', '🐀', 'onivoro', 0.4, 0.1, 2.0, 0.5, 0.02, 3, 0.3, 21, 6, 0.0, 12, '*chiado*', '#6a6a6a', { nojento: 0.5, roedor: true }),
    morcego: F('Morcego', '🦇', 'inseto', 0.1, 0.15, 5.0, 0.1, 0.05, 12, 1, 60, 1, 0.0, 20, '*ecoa*', '#3a3038', { voa: true, noturno: 1.0 }),
    peixe: F('Peixe', '🐟', 'onivoro', 1.5, 0.2, 1.5, 1, 0.0, 6, 1, 30, 200, 0.0, 10, '*silêncio*', '#7ab0c0', { peixe: true, nado: 1.0 }),
    tubarao: F('Tubarão', '🦈', 'carnivoro', 700, 2.5, 4.0, 300, 1.0, 30, 8, 330, 6, 0.0, 24, '*silêncio*', '#5a6a72', { peixe: true, nado: 1.0, perigoso: true }),
    baleia: F('Baleia', '🐋', 'onivoro', 30000, 12, 3.0, 2000, 0.1, 80, 8, 400, 1, 0.0, 40, 'canto', '#4a6a8a', { peixe: true, nado: 1.0 }),
    caranguejo: F('Caranguejo', '🦀', 'onivoro', 0.6, 0.15, 0.7, 2, 0.1, 5, 1, 30, 200, 0.0, 8, '*clique*', '#c05a3a', { casco: 0.6, pinça: 0.4 })
  };

  const FAUNA_IDS = Object.keys(FAUNA);
  const ESPECIES_DOMESTICAVEIS = FAUNA_IDS.filter(k => (FAUNA[k].domest || 0) > 0.5);
  const ESPECIES_PREDADORAS = FAUNA_IDS.filter(k => FAUNA[k].perigo >= 0.5);
  const ESPECIES_PRESA = FAUNA_IDS.filter(k => FAUNA[k].presa || (FAUNA[k].classe === 'herbivoro' && FAUNA[k].massa > 2));

  /* ============================================================
     ITENS / MATERIAIS
     ============================================================ */
  const ITENS = {
    folha: { nome: 'Folha', massa: 0.005, mao: true, cat: 'vegetal', cor: '#6aa84f', combustivel: 0.35 },
    graveto: { nome: 'Graveto', massa: 0.3, mao: true, cat: 'madeira', cor: '#8a6a42', combustivel: 1.0 },
    tronco: { nome: 'Tronco', massa: 55, mao: false, cat: 'madeira', cor: '#6a4a2a', combustivel: 3.0, arrastavel: true },
    fibra: { nome: 'Fibra', massa: 0.05, mao: true, cat: 'vegetal', cor: '#a8b06a', combustivel: 0.5 },
    palha: { nome: 'Palha', massa: 0.2, mao: true, cat: 'vegetal', cor: '#d8c070', combustivel: 1.2 },
    pedra: { nome: 'Pedra', massa: 3.5, mao: true, cat: 'mineral', cor: '#8a8a86', arremessavel: true },
    pedra_afiada: { nome: 'Pedra lascada', massa: 1.2, mao: true, cat: 'ferramenta', cor: '#a09a8a', corte: 0.5, ferramenta: 'corte' },
    pedra_lisa: { nome: 'Pedra lisa', massa: 4, mao: true, cat: 'mineral', cor: '#9a9a94', moidor: 0.5 },
    minerio: { nome: 'Minério', massa: 6, mao: true, cat: 'mineral', cor: '#7a6a5a', metal: 0.4 },
    argila: { nome: 'Argila', massa: 1.5, mao: true, cat: 'mineral', cor: '#b06a4a', maleavel: 1 },
    areia: { nome: 'Areia', massa: 2, mao: true, cat: 'mineral', cor: '#e0d0a0' },
    terra: { nome: 'Terra', massa: 2, mao: true, cat: 'mineral', cor: '#6a4a30', fertilizante: 0.5 },
    semente: { nome: 'Semente', massa: 0.02, mao: true, cat: 'vegetal', cor: '#c8b070', plantavel: 1 },
    fruta_vermelha: { nome: 'Fruta vermelha', massa: 0.12, mao: true, cat: 'comida', cor: '#d4342a', comida: 22, agua: 0.06, semente: 'semente' },
    fruta_baga: { nome: 'Baga', massa: 0.02, mao: true, cat: 'comida', cor: '#7a3aa0', comida: 6, agua: 0.01, semente: 'semente' },
    vagem: { nome: 'Vagem', massa: 0.05, mao: true, cat: 'comida', cor: '#8ab04a', comida: 8, semente: 'semente' },
    noz: { nome: 'Noz', massa: 0.04, mao: true, cat: 'comida', cor: '#8a5a2a', comida: 12, duro: 0.6 },
    pinha: { nome: 'Pinha', massa: 0.3, mao: true, cat: 'comida', cor: '#6a4a2a', comida: 10, duro: 0.5 },
    coco: { nome: 'Coco', massa: 1.4, mao: true, cat: 'comida', cor: '#6a4a2a', comida: 25, agua: 0.35, duro: 0.7, casca: 'cuia' },
    cogumelo: { nome: 'Cogumelo', massa: 0.05, mao: true, cat: 'comida', cor: '#c4553f', comida: 8, veneno: 0.35 },
    cogumelo_bom: { nome: 'Cogumelo comestível', massa: 0.05, mao: true, cat: 'comida', cor: '#d8b070', comida: 10 },
    carne: { nome: 'Carne crua', massa: 1.2, mao: true, cat: 'comida', cor: '#b03a3a', comida: 30, cru: 1, cozinhar: 'carne_assada' },
    carne_assada: { nome: 'Carne assada', massa: 1, mao: true, cat: 'comida', cor: '#7a3a1a', comida: 55 },
    peixe: { nome: 'Peixe', massa: 1, mao: true, cat: 'comida', cor: '#7ab0c0', comida: 26, cru: 1, cozinhar: 'peixe_assado' },
    peixe_assado: { nome: 'Peixe assado', massa: 0.9, mao: true, cat: 'comida', cor: '#a08a6a', comida: 46 },
    ovo: { nome: 'Ovo', massa: 0.06, mao: true, cat: 'comida', cor: '#f0e8d8', comida: 14 },
    leite: { nome: 'Leite', massa: 1, mao: true, cat: 'comida', cor: '#f4f4ec', comida: 20, agua: 0.6, liquido: 1 },
    couro: { nome: 'Couro', massa: 1.5, mao: true, cat: 'animal', cor: '#9a7040', vestivel: 1 },
    pele: { nome: 'Pele', massa: 1.5, mao: true, cat: 'animal', cor: '#a08060' },
    osso: { nome: 'Osso', massa: 0.6, mao: true, cat: 'animal', cor: '#e2ded0', ferramenta: 'furador' },
    pena: { nome: 'Pena', massa: 0.01, mao: true, cat: 'animal', cor: '#e8e8e0' },
    la: { nome: 'Lã', massa: 0.4, mao: true, cat: 'animal', cor: '#eeeae0', vestivel: 1 },
    mel: { nome: 'Mel', massa: 0.7, mao: true, cat: 'comida', cor: '#e0a83a', comida: 30 },
    veneno: { nome: 'Veneno', massa: 0.2, mao: true, cat: 'perigo', cor: '#4a8a3a', toxico: 1 },
    cuia: { nome: 'Cuia', massa: 0.3, mao: true, cat: 'recipiente', cor: '#b08a4a', capacidade: 0.4, recipiente: 1 },
    balde: { nome: 'Balde', massa: 1.2, mao: true, cat: 'recipiente', cor: '#8a6a3a', capacidade: 8, recipiente: 1 },
    cesto: { nome: 'Cesto', massa: 0.8, mao: true, cat: 'recipiente', cor: '#c0a060', capacidadeCarga: 18, recipiente: 1 },
    vaso: { nome: 'Vaso de barro', massa: 2.5, mao: false, cat: 'recipiente', cor: '#a05a3a', capacidade: 12, recipiente: 1 },
    corda: { nome: 'Corda', massa: 0.4, mao: true, cat: 'ferramenta', cor: '#b0a070', amarrar: 1, ferramenta: 'amarrar' },
    lanca: { nome: 'Lança', massa: 2.2, mao: true, cat: 'ferramenta', cor: '#8a6a3a', dano: 25, ferramenta: 'caca', alcance: 1.6 },
    machado_pedra: { nome: 'Machado de pedra', massa: 3.0, mao: true, cat: 'ferramenta', cor: '#7a6a4a', corte: 1.0, ferramenta: 'corte', dano: 18 },
    faca_pedra: { nome: 'Faca de pedra', massa: 0.8, mao: true, cat: 'ferramenta', cor: '#8a8272', corte: 0.8, ferramenta: 'corte', dano: 12 },
    enxada: { nome: 'Enxada', massa: 3.5, mao: true, cat: 'ferramenta', cor: '#7a6a4a', ferramenta: 'arar', dano: 10 },
    arado: { nome: 'Arado', massa: 40, mao: false, cat: 'ferramenta', cor: '#6a5a3a', ferramenta: 'arar' },
    roda: { nome: 'Roda', massa: 25, mao: false, cat: 'tecnologia', cor: '#8a6a3a', roda: 1 },
    carroca: { nome: 'Carroça', massa: 90, mao: false, cat: 'tecnologia', cor: '#8a6a3a', capacidadeCarga: 200, veiculo: 1 },
    serra: { nome: 'Serra de metal', massa: 2.5, mao: true, cat: 'ferramenta', cor: '#a0a0a8', corte: 1.6, ferramenta: 'corte', metal: 1 },
    prego: { nome: 'Prego', massa: 0.05, mao: true, cat: 'ferramenta', cor: '#a0a0a8', metal: 1 },
    martelo: { nome: 'Martelo', massa: 2.0, mao: true, cat: 'ferramenta', cor: '#8a6a4a', ferramenta: 'bater', metal: 0.5, dano: 20 },
    metal: { nome: 'Metal bruto', massa: 5, mao: true, cat: 'mineral', cor: '#9aa0a8', metal: 1 },
    tijolo: { nome: 'Tijolo', massa: 3, mao: true, cat: 'construcao', cor: '#b05a3a' },
    tabua: { nome: 'Tábua', massa: 8, mao: true, cat: 'construcao', cor: '#a08050' },
    viga: { nome: 'Viga', massa: 20, mao: true, cat: 'construcao', cor: '#8a6a3a' },
    telha: { nome: 'Telha', massa: 2, mao: true, cat: 'construcao', cor: '#a04a2a' },
    fogueira: { nome: 'Fogueira', massa: 0, mao: false, cat: 'estrutura', cor: '#ff9a3a', fogo: 1 },
    tocha: { nome: 'Tocha', massa: 0.6, mao: true, cat: 'ferramenta', cor: '#ffb03a', fogo: 1, luz: 8 },
    agua: { nome: 'Água', massa: 1, mao: false, cat: 'recurso', cor: '#3a9ad0', liquido: 1 }
  };
  const ITENS_IDS = Object.keys(ITENS);

  /* ============================================================
     RECEITAS — descobertas por tentativa/erro e por imitação.
     'dep' = conhecimento necessário (não conta como pré-requisito
     rígido: só aumenta muito a chance de dar certo).
     ============================================================ */
  const RECEITAS = [
    // ---- TIER 1: primeiras tecnologias ----
    { id: 'r_lasca', nome: 'Lascar pedra', saida: 'pedra_afiada', entrada: ['pedra', 'pedra'], tier: 1, dif: 0.55, acao: 'bater' },
    { id: 'r_palha_punhado', nome: 'Juntar palha', saida: 'palha', entrada: ['fibra', 'fibra'], tier: 1, dif: 0.3, acao: 'juntar' },
    { id: 'r_corda', nome: 'Torcer corda', saida: 'corda', entrada: ['fibra', 'fibra', 'fibra'], tier: 1, dif: 0.6, acao: 'torcer', dep: ['r_palha_punhado'] },
    { id: 'r_cuia', nome: 'Fazer cuia', saida: 'cuia', entrada: ['coco'], tier: 1, dif: 0.65, acao: 'cavar', dep: ['r_lasca'] },
    { id: 'r_abrigo_folhas', nome: 'Abrigo de folhas', saida: null, entrada: ['folha', 'folha', 'graveto'], tier: 1, dif: 0.5, acao: 'construir', estrutura: 'abrigo_folhas' },
    { id: 'r_fogueira', nome: 'Acender fogo', saida: 'fogueira', entrada: ['graveto', 'graveto', 'folha'], tier: 1, dif: 0.7, acao: 'atritar' },
    { id: 'r_cesto', nome: 'Trançar cesto', saida: 'cesto', entrada: ['fibra', 'fibra', 'fibra', 'fibra'], tier: 1, dif: 0.6, acao: 'trançar', dep: ['r_corda'] },
    { id: 'r_lanca', nome: 'Fazer lança', saida: 'lanca', entrada: ['graveto', 'pedra_afiada', 'corda'], tier: 1, dif: 0.55, acao: 'amarrar', dep: ['r_lasca'] },
    { id: 'r_cava_pau', nome: 'Cavar com pau', saida: 'terra', entrada: ['graveto'], tier: 1, dif: 0.2, acao: 'cavar' },
    // ---- TIER 2 ----
    { id: 'r_machado', nome: 'Machado de pedra', saida: 'machado_pedra', entrada: ['graveto', 'pedra_afiada', 'corda'], tier: 2, dif: 0.5, acao: 'amarrar', dep: ['r_lanca'] },
    { id: 'r_faca', nome: 'Faca de pedra', saida: 'faca_pedra', entrada: ['pedra_afiada', 'graveto'], tier: 2, dif: 0.45, acao: 'amarrar', dep: ['r_lasca'] },
    { id: 'r_abrigo_palha', nome: 'Abrigo de palha', saida: null, entrada: ['palha', 'palha', 'graveto'], tier: 2, dif: 0.35, acao: 'construir', estrutura: 'abrigo_palha', dep: ['r_palha_punhado'] },
    { id: 'r_assar', nome: 'Assar carne no fogo', saida: 'carne_assada', entrada: ['carne', 'fogueira'], tier: 2, dif: 0.4, acao: 'assar', dep: ['r_fogueira'] },
    { id: 'r_assar_peixe', nome: 'Assar peixe', saida: 'peixe_assado', entrada: ['peixe', 'fogueira'], tier: 2, dif: 0.4, acao: 'assar', dep: ['r_fogueira'] },
    { id: 'r_vaso', nome: 'Modelar vaso de barro', saida: 'vaso', entrada: ['argila', 'argila'], tier: 2, dif: 0.65, acao: 'modelar' },
    { id: 'r_vaso_cozido', nome: 'Queimar o vaso', saida: 'vaso', entrada: ['argila', 'fogueira'], tier: 2, dif: 0.7, acao: 'assar', dep: ['r_fogueira'] },
    { id: 'r_curtir', nome: 'Curtir couro', saida: 'couro', entrada: ['pele', 'fogueira'], tier: 2, dif: 0.6, acao: 'assar', dep: ['r_fogueira'] },
    { id: 'r_cerca', nome: 'Cerca de gravetos', saida: null, entrada: ['graveto', 'graveto', 'corda'], tier: 2, dif: 0.3, acao: 'construir', estrutura: 'cerca', dep: ['r_corda'] },
    { id: 'r_poco', nome: 'Cavar poço', saida: null, entrada: ['pedra', 'pedra', 'graveto'], tier: 2, dif: 0.6, acao: 'construir', estrutura: 'poco', dep: ['r_cava_pau'] },
    { id: 'r_agricultura', nome: 'Plantar semente', saida: null, entrada: ['semente', 'terra'], tier: 2, dif: 0.75, acao: 'plantar' },
    { id: 'r_domesticar', nome: 'Domesticar animal', saida: null, entrada: ['folha', 'animal'], tier: 2, dif: 0.85, acao: 'domesticar' },
    // ---- TIER 3 ----
    { id: 'r_cabana', nome: 'Cabana de madeira', saida: null, entrada: ['tronco', 'graveto', 'palha'], tier: 3, dif: 0.45, acao: 'construir', estrutura: 'cabana', dep: ['r_machado', 'r_abrigo_palha'] },
    { id: 'r_casa_barro', nome: 'Casa de barro (adobe)', saida: null, entrada: ['argila', 'palha', 'tronco'], tier: 3, dif: 0.42, acao: 'construir', estrutura: 'casa_barro', dep: ['r_cabana', 'r_vaso'] },
    { id: 'r_forno', nome: 'Forno de barro', saida: null, entrada: ['argila', 'pedra', 'fogueira'], tier: 3, dif: 0.6, acao: 'construir', estrutura: 'forno', dep: ['r_vaso_cozido'] },
    { id: 'r_ceramica_avancada', nome: 'Cerâmica avançada', saida: 'vaso', entrada: ['argila', 'forno'], tier: 3, dif: 0.5, acao: 'modelar', dep: ['r_forno'] },
    { id: 'r_enxada', nome: 'Enxada', saida: 'enxada', entrada: ['graveto', 'pedra_afiada', 'corda'], tier: 3, dif: 0.5, acao: 'amarrar', dep: ['r_machado', 'r_agricultura'] },
    { id: 'r_roda', nome: 'Roda', saida: 'roda', entrada: ['tronco', 'machado_pedra'], tier: 3, dif: 0.7, acao: 'cortar', dep: ['r_machado'] },
    { id: 'r_carroca', nome: 'Carroça', saida: 'carroca', entrada: ['roda', 'tronco', 'corda'], tier: 3, dif: 0.65, acao: 'montar', dep: ['r_roda'] },
    { id: 'r_fundição', nome: 'Fundir metal', saida: 'metal', entrada: ['minerio', 'forno'], tier: 3, dif: 0.8, acao: 'fundir', dep: ['r_forno'] },
    { id: 'r_tabua', nome: 'Serrar tábua', saida: 'tabua', entrada: ['tronco', 'machado_pedra'], tier: 3, dif: 0.45, acao: 'cortar', dep: ['r_machado'] },
    // ---- TIER 4 ----
    { id: 'r_casa_pedra', nome: 'Casa de pedra', saida: null, entrada: ['pedra', 'tronco', 'corda'], tier: 4, dif: 0.5, acao: 'construir', estrutura: 'casa_pedra', dep: ['r_casa_barro', 'r_tabua'] },
    { id: 'r_celeiro', nome: 'Celeiro', saida: null, entrada: ['tabua', 'tronco', 'corda'], tier: 4, dif: 0.5, acao: 'construir', estrutura: 'celeiro', dep: ['r_tabua'] },
    { id: 'r_oficina', nome: 'Oficina', saida: null, entrada: ['tabua', 'pedra', 'forno'], tier: 4, dif: 0.55, acao: 'construir', estrutura: 'oficina', dep: ['r_casa_pedra'] },
    { id: 'r_moinho', nome: 'Moinho de mão', saida: 'pedra_lisa', entrada: ['pedra', 'pedra_lisa'], tier: 4, dif: 0.6, acao: 'bater', dep: ['r_agricultura'] },
    { id: 'r_serra', nome: 'Serra de metal', saida: 'serra', entrada: ['metal', 'martelo'], tier: 4, dif: 0.7, acao: 'forjar', dep: ['r_fundição'] },
    { id: 'r_martelo', nome: 'Martelo', saida: 'martelo', entrada: ['metal', 'graveto'], tier: 4, dif: 0.65, acao: 'forjar', dep: ['r_fundição'] },
    { id: 'r_prego', nome: 'Prego', saida: 'prego', entrada: ['metal'], tier: 4, dif: 0.6, acao: 'forjar', dep: ['r_martelo'] },
    { id: 'r_tijolo', nome: 'Tijolo cozido', saida: 'tijolo', entrada: ['argila', 'forno'], tier: 4, dif: 0.55, acao: 'assar', dep: ['r_forno'] },
    // ---- TIER 5+ : futuro (cidade) ----
    { id: 'r_estrada', nome: 'Calçar caminho', saida: null, entrada: ['pedra', 'areia'], tier: 5, dif: 0.4, acao: 'construir', estrutura: 'estrada', dep: ['r_carroca'] },
    { id: 'r_casa_tijolo', nome: 'Casa de tijolo', saida: null, entrada: ['tijolo', 'tijolo', 'tabua'], tier: 5, dif: 0.5, acao: 'construir', estrutura: 'casa_tijolo', dep: ['r_tijolo', 'r_casa_pedra'] },
    { id: 'r_aqueduto', nome: 'Aqueduto', saida: null, entrada: ['pedra', 'pedra', 'corda'], tier: 5, dif: 0.6, acao: 'construir', estrutura: 'aqueduto', dep: ['r_estrada'] },
    { id: 'r_ponte', nome: 'Ponte', saida: null, entrada: ['tronco', 'tabua', 'corda'], tier: 5, dif: 0.55, acao: 'construir', estrutura: 'ponte', dep: ['r_estrada'] },
    { id: 'r_predio', nome: 'Edifício', saida: null, entrada: ['tijolo', 'viga', 'serra'], tier: 6, dif: 0.75, acao: 'construir', estrutura: 'predio', dep: ['r_casa_tijolo', 'r_serra'] }
  ];

  /* Estruturas construíveis (com materiais físicos e qualidade) */
  const ESTRUTURAS = {
    abrigo_folhas: { nome: 'Abrigo de folhas', peso: 1, abrigo: 0.35, cap: 2, m2: 2, materiais: { folha: 8, graveto: 4 }, tempo: 900, colapso: 0.5, cor: '#7a8a4a' },
    abrigo_palha: { nome: 'Abrigo de palha', peso: 2, abrigo: 0.6, cap: 3, m2: 4, materiais: { palha: 6, graveto: 5 }, tempo: 1800, colapso: 0.35, cor: '#d0b060' },
    cerca: { nome: 'Cerca', peso: 1, abrigo: 0.1, cap: 0, m2: 3, materiais: { graveto: 6, corda: 1 }, tempo: 900, colapso: 0.3, cor: '#a08050' },
    poco: { nome: 'Poço', peso: 3, abrigo: 0, agua: 1, cap: 0, m2: 2, materiais: { pedra: 8, graveto: 2 }, tempo: 2400, colapso: 0.4, cor: '#8a8a86' },
    cabana: { nome: 'Cabana', peso: 4, abrigo: 0.85, cap: 4, m2: 9, materiais: { tronco: 6, graveto: 10, palha: 8 }, tempo: 5400, colapso: 0.3, cor: '#8a6a3a' },
    casa_barro: { nome: 'Casa de barro', peso: 6, abrigo: 0.95, cap: 6, m2: 16, materiais: { argila: 20, palha: 10, tronco: 4 }, tempo: 10800, colapso: 0.25, cor: '#b06a4a' },
    forno: { nome: 'Forno', peso: 5, abrigo: 0.3, cap: 0, especial: 'forno', m2: 4, materiais: { argila: 12, pedra: 8 }, tempo: 5400, colapso: 0.3, cor: '#a05a3a' },
    casa_pedra: { nome: 'Casa de pedra', peso: 10, abrigo: 1.0, cap: 8, m2: 25, materiais: { pedra: 30, tronco: 8, corda: 4 }, tempo: 21600, colapso: 0.2, cor: '#9a9a94' },
    celeiro: { nome: 'Celeiro', peso: 10, abrigo: 0.7, cap: 2, estoque: 500, m2: 30, materiais: { tabua: 20, tronco: 10, corda: 6 }, tempo: 21600, colapso: 0.22, cor: '#a08050' },
    oficina: { nome: 'Oficina', peso: 12, abrigo: 0.9, cap: 4, especial: 'fabrica', m2: 30, materiais: { tabua: 16, pedra: 12, tijolo: 8 }, tempo: 28800, colapso: 0.2, cor: '#8a7a5a' },
    estrada: { nome: 'Estrada', peso: 2, abrigo: 0, via: 1, cap: 0, m2: 40, materiais: { pedra: 12, areia: 8 }, tempo: 7200, colapso: 0.1, cor: '#9a9080' },
    casa_tijolo: { nome: 'Casa de tijolo', peso: 14, abrigo: 1.0, cap: 10, m2: 40, materiais: { tijolo: 30, tabua: 12 }, tempo: 36000, colapso: 0.15, cor: '#b0563a' },
    aqueduto: { nome: 'Aqueduto', peso: 16, abrigo: 0, agua: 1, cap: 0, m2: 60, materiais: { pedra: 40, corda: 8 }, tempo: 43200, colapso: 0.18, cor: '#a09a90' },
    ponte: { nome: 'Ponte', peso: 15, abrigo: 0, via: 1, cap: 0, m2: 50, materiais: { tronco: 14, tabua: 16, corda: 8 }, tempo: 36000, colapso: 0.2, cor: '#9a7a4a' },
    predio: { nome: 'Edifício', peso: 30, abrigo: 1.0, cap: 40, m2: 120, materiais: { tijolo: 90, viga: 30, prego: 60 }, tempo: 129600, colapso: 0.12, cor: '#c07a5a', andares: 4 }
  };

  /* ============================================================
     CONCEITOS — o que a mente pode aprender.
     'vis:XXX' = reconhecimento visual (a cor/forma das coisas).
     ============================================================ */
  const CONCEITOS = {
    'vis:fruta_vermelha': { label: 'Fruta vermelha', grupo: 'visao' },
    'vis:fruta_baga': { label: 'Baga roxa', grupo: 'visao' },
    'vis:folha': { label: 'Folha', grupo: 'visao' },
    'vis:tronco': { label: 'Tronco', grupo: 'visao' },
    'vis:pedra': { label: 'Pedra', grupo: 'visao' },
    'vis:agua': { label: 'Água', grupo: 'visao' },
    'vis:humanos': { label: 'Outro humano', grupo: 'visao' },
    'vis:animal_grande': { label: 'Animal grande', grupo: 'visao' },
    'vis:animal_pequeno': { label: 'Animal pequeno', grupo: 'visao' },
    'vis:animal_perigoso': { label: 'Animal perigoso', grupo: 'visao' },
    'vis:cogumelo': { label: 'Cogumelo', grupo: 'visao' },
    'vis:flor': { label: 'Flor', grupo: 'visao' },
    'vis:fogo': { label: 'Fogo', grupo: 'visao' },
    'vis:construcao': { label: 'Construção', grupo: 'visao' },
    'c:comestivel': { label: 'Isso se come', grupo: 'saber' },
    'c:venenoso': { label: 'Isso faz mal', grupo: 'saber' },
    'c:agua_bebe': { label: 'Isso mata a sede', grupo: 'saber' },
    'c:perigoso': { label: 'Isso é perigoso', grupo: 'saber' },
    'c:quente': { label: 'Isso queima', grupo: 'saber' },
    'c:ferramenta_corte': { label: 'Isso corta', grupo: 'saber' },
    'c:combustivel': { label: 'Isso queima bem', grupo: 'saber' },
    'c:material_construcao': { label: 'Isso serve para construir', grupo: 'saber' },
    'c:abrigo': { label: 'Isso abriga', grupo: 'saber' },
    'c:remedio': { label: 'Isso cura', grupo: 'saber' },
    'c:domesticavel': { label: 'Esse animal se deixa criar', grupo: 'saber' },
    'c:plantar': { label: 'Plantar produz comida', grupo: 'saber' },
    'c:proprio_nome': { label: 'Eu tenho um nome', grupo: 'abstrato' },
    'c:nomes': { label: 'As coisas têm nomes', grupo: 'abstrato' },
    'c:contagem': { label: 'Contar quantidades', grupo: 'abstrato' },
    'c:tempo': { label: 'O tempo passa em ciclos', grupo: 'abstrato' },
    'c:morte': { label: 'A morte existe', grupo: 'abstrato' },
    'c:maternidade': { label: 'De onde vêm os filhos', grupo: 'abstrato' },
    'c:troca': { label: 'Trocar coisas com outros', grupo: 'social' },
    'c:grupo': { label: 'Pertencer a um grupo', grupo: 'social' },
    'c:lideranca': { label: 'Alguém pode liderar', grupo: 'social' },
    'c:religiao': { label: 'Existe algo maior que nós', grupo: 'social' },
    'c:escrita': { label: 'Marcas podem guardar ideias', grupo: 'abstrato' }
  };
  /* ============================================================
     OPERADORES — o repertório motor do corpo humano.
     Cada operador é uma AÇÃO FÍSICA genérica que pode ser tentada
     contra um IMPEDIMENTO. Nenhum deles declara contra o que serve --
     isso é aprendido (c.esquemas). Aqui existe só o que o corpo sabe fazer.
     ============================================================ */
  const OPERADORES = [
    { id: 'sacudir',    nome: 'Sacudir',    verbo: 'sacudiu' },
    { id: 'arremessar', nome: 'Arremessar', verbo: 'arremessou' },
    { id: 'puxar',      nome: 'Puxar',      verbo: 'puxou' }
  ];

  /* ============================================================
     IMPEDIMENTOS — fatos FÍSICOS sobre um alvo, medidos pelo corpo.
     São perguntas, não respostas: "está alto", "é duro", "é pesado".
     Quem responde é o aprendizado (esquema impedimento x operador).
     ============================================================ */
  const IMPEDIMENTOS = {
    alto:   { label: 'está alto demais', grupo: 'alcance' },
    duro:   { label: 'é duro demais',    grupo: 'resistencia' },
    pesado: { label: 'é pesado demais',  grupo: 'forca' }
  };

  // conhecimento gerado automaticamente pelas receitas
  for (const r of RECEITAS) CONCEITOS['t:' + r.id] = { label: r.nome, grupo: 'tecnica' };
  for (const o of OPERADORES) CONCEITOS['t:r_' + o.id] = { label: o.nome, grupo: 'tecnica' };

  /* ============================================================
     NOMES — os fundadores recebem nome próprio; os filhos aprendem
     o conceito de nome conforme a cultura avança.
     ============================================================ */
  const NOMES_M = ['Adão', 'Caim', 'Abel', 'Sete', 'Enoque', 'Irad', 'Matusalém', 'Lameque', 'Noé', 'Sem', 'Cam', 'Jafé', 'Eber', 'Pelegue', 'Serugue', 'Terá', 'Abraão', 'Isaque', 'Jacó', 'José', 'Aarão', 'Calebe', 'Davi', 'Saul', 'Elias', 'Eliseu', 'Isaías', 'Jeremias', 'Ezequiel', 'Dario', 'Ciro', 'Tito', 'Silas', 'Timóteo', 'Lucas', 'Marcos', 'Mateus', 'André', 'Filipe', 'Barnabé', 'Estêvão', 'Filemom', 'Onésimo', 'Tíquico', 'Aristarco', 'Gaio', 'Demétrio', 'Erasto', 'Tércio', 'Quarto', 'Nereu', 'Zenas', 'Apolo', 'Cefas'];
  const NOMES_F = ['Eva', 'Ada', 'Zilá', 'Naamá', 'Sara', 'Rebeca', 'Raquel', 'Lia', 'Bila', 'Zilpa', 'Débora', 'Ana', 'Ester', 'Noemi', 'Rute', 'Abigail', 'Micol', 'Bate-Seba', 'Sunamita', 'Maria', 'Marta', 'Madalena', 'Isabel', 'Salomé', 'Joana', 'Susana', 'Priscila', 'Febe', 'Lídia', 'Dorcas', 'Eunice', 'Loide', 'Atena', 'Íris', 'Flora', 'Amara', 'Naia', 'Maia', 'Terra', 'Aurora'];
  const SUFIXOS_GERACAO = ['', ' II', ' III', ' IV', ' V', ' VI', ' VII', ' VIII', ' IX', ' X', ' XI', ' XII'];

  /* ============================================================
     LÍNGUA — a fala nasce gestual e evolui por nível (0..4).
     Templates usados pelo gerador de fala (brain.explicar).
     ============================================================ */
  const LINGUA = {
    nivel0: ['«aponta e grunhe»', '«olha fixo»', '«arqueja»', '«recua»', '«bate no peito»'],
    nivel1: ['{coisa}.', '{coisa}. {acao}.', '{acao}!', '{coisa}...'],
    nivel2: ['eu {acao}.', 'eu quer {coisa}.', '{coisa} bom.', '{coisa} ruim.', 'eu {acao} {coisa}.'],
    nivel3: ['Eu estou {ger}.', 'Eu quero {coisa}.', 'Vi {coisa} perto do {lugar}.', 'Isso me faz {emocao}.', 'Vou {acao} agora.'],
    nivel4: ['Acho que {coisa} serve para {uso}.', 'Se eu {acao}, talvez eu consiga {coisa}.', 'Já vi isso antes: {coisa}.', 'Prefiro {coisa} porque {razao}.']
  };

  /* ============================================================
     ESTAÇÕES / CLIMA
     ============================================================ */
  const CLIMAS = {
    sol: { nome: 'Sol', emoji: '☀️', luz: 1.0, chuva: 0, vento: 0.4, temp: 0 },
    nublado: { nome: 'Nublado', emoji: '☁️', luz: 0.75, chuva: 0.05, vento: 0.6, temp: -1 },
    neblina: { nome: 'Neblina', emoji: '🌫️', luz: 0.6, chuva: 0.1, vento: 0.2, temp: -2, visao: 0.45 },
    chuva: { nome: 'Chuva', emoji: '🌧️', luz: 0.55, chuva: 0.6, vento: 0.8, temp: -3 },
    tempestade: { nome: 'Tempestade', emoji: '⛈️', luz: 0.35, chuva: 1.0, vento: 2.2, temp: -6, raios: 1 },
    neve: { nome: 'Neve', emoji: '❄️', luz: 0.7, chuva: 0.35, vento: 0.7, temp: -12, frio: 1 },
    nevasca: { nome: 'Nevasca', emoji: '🌨️', luz: 0.45, chuva: 0.8, vento: 2.6, temp: -18, frio: 1, visao: 0.5 },
    granizo: { nome: 'Granizo', emoji: '🧊', luz: 0.5, chuva: 0.7, vento: 1.6, temp: -5, dano: 1 },
    seca: { nome: 'Seca', emoji: '🔥', luz: 1.1, chuva: -0.4, vento: 0.5, temp: 8, quente: 1 },
    vendaval: { nome: 'Vendaval', emoji: '💨', luz: 0.8, chuva: 0.2, vento: 3.2, temp: -2 }
  };

  return {
    BIOMAS, BIOMAS_IDS, FLORA, FAUNA, FAUNA_IDS,
    ESPECIES_DOMESTICAVEIS, ESPECIES_PREDADORAS, ESPECIES_PRESA,
    ITENS, ITENS_IDS, RECEITAS, OPERADORES, IMPEDIMENTOS, ESTRUTURAS, CONCEITOS,
    NOMES_M, NOMES_F, SUFIXOS_GERACAO, LINGUA, CLIMAS
  };
});
