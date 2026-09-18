# GÊNESIS DIGITAL · FASE 2A
# ETAPA 1 (AUDITORIA) + ETAPA 2 (PROPOSTA MÍNIMA)

Data: 2026-09-12
Escopo executado: auditoria e proposta.
Escopo NÃO executado: nenhuma correção, nenhuma implementação, nenhum teste novo.

---

## 0. PROTOCOLO DE SEGURANÇA · ESTADO DOS ARQUIVOS

Nenhum arquivo foi modificado. Verificação por md5 antes e depois de toda a auditoria:

| arquivo | md5 | estado |
|---|---|---|
| `fase2a/endereco.js` | `1c0069f2177029793310f496f3c89a23` | intocado |
| `fase2a/index.html` | `957986878958e8a5c1ab3f73ceda744a` | intocado |
| `fase1/terra.js` | `a5a62e6da602c23e088b1181a44537e5` | intocado (LEI) |
| `v2/core/world.js` | `9bcab37469b0217778317efcd2e162a3` | intocado (LEI) |
| `v2/core/util.js` | `0bf52b6f8d5e4bc1c6a0d876ca055cc4` | intocado (LEI) |
| `v2/core/data.js` | `5151abaf008677d3e6518c65c7bd516c` | intocado (LEI) |
| `v2/core/brain.js` | `a65aad160e01ee11edf39591cc3a8d67` | intocado (LEI) |
| `_build/three.min.js` | `eb8549863a97355411c3259a3f93b8e1` | intocado |

Arquivos `.l2s.tmp_obj_*`: nenhum presente no pacote. Nada foi apagado.

Único artefato novo: este relatório. Toda a experimentação ocorreu em cópias descartáveis fora da pasta do projeto, e a cópia patchada usada na seção 3.1 nunca tocou o original.

**Como a auditoria foi feita.** Não por leitura apenas. O motor foi executado em Node (v22.22.2) e a página foi carregada num Chromium real via servidor local, com clique programático de verdade na grade, arrasto do planeta, zoom e órbita da câmera. Todo número abaixo é medido.

---

## 1. A CADEIA, RECONSTRUÍDA, COM A NATUREZA DE CADA DADO

```
world.js (autoridade)
  │
  ├─ criar({seed:20260101})                world.js:42
  │     seed .......................... CANÔNICO      (persistido por seriar)
  │     m.rng = U.RNG(seed) ........... CANÔNICO      (determinístico, sem Math.random)
  │     m.planeta = {nome,raioKm,       
  │                 regioes:[], regiaoAtiva:0}
  │        nome ...................... VISUAL        (rótulo, trocável)
  │        raioKm = 6371 ............. CANÔNICO      (mas ver 3.2: não entra em cálculo na fase 1)
  │        regiaoAtiva = 0 ........... TEMPORÁRIO    (posição na coleção, não identidade)
  │
  ├─ gerarRegiao(m)                        world.js:80
  │     reg.id = 0 ................... NÃO PERSISTENTE / INVÁLIDO  (`const id = 0`, igual para toda região)
  │     reg.idx = 0 .................. NÃO PERSISTENTE / INVÁLIDO  (hardcoded, nem sequer é serializado)
  │     reg.nome ..................... VISUAL
  │     reg.lat, reg.lon ............. DERIVADO + DEGRADADO
  │           = rng.range(...).toFixed(2)  → STRING de 2 casas
  │     reg.largura = reg.altura = 160  CANÔNICO      (W.TAM)
  │     TILE = 1 m ................... CANÔNICO      (W.TILE)
  │     reg.alturaTerreno[25600] ..... CANÔNICO      (Float32Array, índice = y*160+x)
  │
  ├─ regiaoAtiva(m) = m.planeta.regioes[m.planeta.regiaoAtiva]   world.js:275
  │     acesso real do motor ......... POR ÍNDICE, não por id
  │
  ├─ idx(x,y) = (y|0)*160 + (x|0)          world.js:276
  │     ............................... CANÔNICO      (é o layout de memória, não uma convenção)
  │
terra.js (visual, fase 1)
  │
  ├─ lerRegiaoCanonica(W, seed)            terra.js:323
  │     lat = parseFloat(reg.lat) ..... DERIVADO de um valor já degradado
  │     dir = dirDeLatLon(lat,lon) .... DERIVADO      (exato dado o input; o input é que é grosso)
  │     R = 1 ........................ VISUAL        (esfera unitária de render)
  │     raioKm ....................... rótulo, "NÃO entra em nenhum cálculo" (terra.js:64)
  │
  ├─ posicaoDaRegiao(reg) = dir * R        terra.js:380
  │     ............................... DERIVADO, nível REGIÃO, nunca nível TILE
  │
endereco.js (fase 2A)
  │
  ├─ regionIndex = indexOf(reg) ....... DERIVADO, INSTÁVEL   (já declarado assim pelo próprio arquivo)
  ├─ celula.indiceLinear .............. CANÔNICO             (idêntico a world.js:276, medido)
  ├─ local.x, local.y ................. CANÔNICO             (mesmo espaço de ent.pos)
  ├─ local.z .......................... CANÔNICO no tempo t, mas LOSSY na persistência (ver 3.3)
  └─ globo.dir ........................ DERIVADO, nível REGIÃO, com erro de ±556 m
```

### Valores reais medidos (seed 20260101)

```
W.TAM 160 · W.TILE 1 · W.CELULA 8 · W.AREA 25600
reg.id      0        (number)
reg.idx     0        (number)
reg.nome    "Ilha Gênesis"
reg.lat     "-19.53" (STRING)
reg.lon     "31.59"  (STRING)
reg.largura 160 · reg.altura 160
planeta     {nome:"Gênesis", raioKm:6371, nRegioes:1, regiaoAtiva:0}
m.centro    {x:123.2485175319016, y:40.16643107868731}
censo       2 NPCs · 129 animais · 900 plantas · 385 objetos
```

O censo bate com o estado canônico declarado no briefing. A base é a mesma.

---

## 2. RESPOSTAS DIRETAS ÀS PERGUNTAS A ATÉ H

**A) Qual é a identidade real da região?**
Não existe. Não é "fraca", não é "implícita": não existe. Prova executada: criei três regiões no mesmo mundo.

```
[0] id=0 idx=0 nome=Ilha Gênesis lat=-19.53 lon=31.59
[1] id=0 idx=0 nome=Segunda      lat=1.04   lon=-157.16
[2] id=0 idx=0 nome=Terceira     lat=22.81  lon=38.81
ids únicos: 1 de 3
```

**B) O que realmente identifica uma região hoje?**
Uma só coisa: **a seed do mundo**, e apenas enquanto existir exatamente uma região. A região é função pura determinística da seed, e `seriar()` persiste `m.seed` (confirmado: `j.seed === 20260101`). Com uma região, `seed` identifica a região sem ambiguidade. Com duas ou mais, nada identifica, porque a ordem de criação não é gravada em lugar nenhum e `id`/`idx` colidem.

**C) O que é apenas posição na coleção?**
`regionIndex` e `m.planeta.regiaoAtiva`. Prova executada: invertendo a ordem do array, o **mesmo objeto** de região migrou de índice 0 para índice 2. O objeto não mudou; o endereço mudou. Isso é a definição de "não é identidade".

**D) Qual é a unidade física de uma região?**
160 × 160 tiles, 1 tile = 1 metro, logo 160 m × 160 m, 25600 tiles. Vem de `W.TAM` e `W.TILE`, valores canônicos.

Alerta de nomenclatura: `world.js` já usa a palavra **CELULA** para outra coisa (`CELULA = 8`, a célula de 8 m da grade espacial de consulta, broadphase). `endereco.js` usa **celula** para a forma discreta do local. São conceitos diferentes com o mesmo nome. Isso vai gerar confusão assim que a fase de objetos entrar.

**E) Como o tile é identificado?**
Por `(x|0, y|0)` no espaço local da região, com `indiceLinear = (y|0)*160 + (x|0)`. Esse índice **não é uma convenção adotada pela fase 2A**: é literalmente o índice com que o motor endereça `alturaTerreno`, `tipo`, `umidade`, `fertilidade` e `temperatura`. É o dado mais canônico de toda a cadeia. Verificado nos cinco pontos exigidos pelo contrato:

```
(0,0)     → 0       (esperado 0)
(159,0)   → 159     (esperado 159)
(0,159)   → 25440   (esperado 25440)
(159,159) → 25599   (esperado 25599)
(80,80)   → 12880   (esperado 12880)
```

E a rejeição de fora da grade funciona: `(-1,0)`, `(160,0)`, `(0,-1)`, `(0,160)` e `(NaN,0)` retornam `fora=true`, `celula=null`, `z=null`, sem vazar a sentinela interna `-3`.

**F) Onde existe origem local?**
Existe, e é canônica, mas nunca foi declarada por nome. O espaço local da região é: origem no canto `(0,0)`, eixos x e y em tiles que valem 1 metro, z em metros com `NIVEL_MAR = 0` como zero. As posições contínuas das entidades (`ent.pos.x`, `ent.pos.y`) vivem exatamente nesse espaço, com valores fracionários. Confirmado: `m.centro = {x:123.2485..., y:40.1664...}`.

Ou seja: a origem local não precisa ser inventada. Precisa apenas ser **nomeada** no contrato.

**G) Existe uma transformação exata entre tile e posição geográfica?**
Não. E aqui está a correção mais importante desta auditoria: **faltam três coisas, não uma.** O briefing atribui o bloqueio inteiramente aos 556 m. Os 556 m são o problema mais visível, mas não são o mais profundo.

1. **Precisão.** `.toFixed(2)` → passo de 0,01° = 1111,95 m, erro máximo ±555,97 m, o que equivale a ±3,47 larguras de região. Confirmado pelo próprio `precisaoDeAncoragem()`: `erroMaxMetros = 555.9746332227937`.

2. **Convenção de âncora.** `world.js` nunca diz **que ponto** da região o par lat/lon representa. Centro? Canto `(0,0)`? Centroide da ilha? Sem essa definição, mesmo com lat/lon de precisão infinita restaria ambiguidade de até 160 m, porque não se sabe onde encaixar a grade em relação ao ponto.

3. **Orientação.** Este é o bloqueio real. Não existe em lugar nenhum do motor um azimute, um rumo ou uma declaração de que o eixo `+y` da grade de tiles aponta para o norte geográfico. Sem orientação, um deslocamento em tiles não pode virar deslocamento em lat/lon **de jeito nenhum**, com qualquer precisão. Adicionar casas decimais não resolve isto. É uma informação que simplesmente não existe.

Um quarto item, menor: `terra.js` declara explicitamente que `raioKm` é rótulo e "NÃO entra em nenhum cálculo" (terra.js:64), enquanto o render usa `R = 1`. Para converter metros em ângulo é preciso fixar qual raio é o de referência. Hoje isso só aparece dentro de `precisaoDeAncoragem()`, como diagnóstico, não como convenção do sistema.

**H) Qual informação falta?**
Exatamente: lat/lon em ponto flutuante, convenção de âncora, orientação da grade e raio de referência declarado. Além disso, para o nível REGIÃO da hierarquia funcionar com N regiões: uma identidade persistente de região. São cinco lacunas, todas na autoridade do mundo, nenhuma resolvível dentro da fase 2A.

---

## 3. ACHADOS QUE A AUDITORIA PRODUZIU E QUE NÃO ESTAVAM NO BRIEFING

### 3.1. A precisão não se perdeu: ela foi descartada, e recuperá-la é inerte para a simulação

O float completo existe no instante da criação e é jogado fora na mesma linha em que nasce (world.js:85). Reproduzindo o RNG:

```
float que o RNG produziu : -19.526880830526352 / 31.587653481401503
string guardada por world: "-19.53" / "31.59"
erro do arredondamento   : 0,00312° em lat e 0,00235° em lon  (≈ 347 m e ≈ 261 m)
```

Isso levanta uma tentação que eu quero **registrar e recusar explicitamente**: seria possível recuperar o float replicando os dois primeiros sorteios do RNG a partir da seed. Não vou fazer isso, e recomendo que nunca seja feito, por três motivos: depende da ordem interna de sorteios dentro de `gerarRegiao`, que é detalhe de implementação e não API; criaria uma segunda fonte de verdade que passaria a divergir em silêncio se alguém acrescentasse um `rng` antes do `lat`; e não resolveria as lacunas 2 e 3 acima, que são as decisivas. Recuperar precisão sem orientação não produz nenhuma ancoragem de tile.

O que essa investigação produziu de útil é outra coisa, e é forte. Apliquei o patch mínimo (`toFixed(2)` removido, lat/lon como número) **numa cópia descartável** e comparei o mundo inteiro contra o original:

```
ORIGINAL  lat="-19.53"                hash=fb1092051858d0ae...ccccd42
PATCHADO  lat=-19.526880830526352     hash=fb1092051858d0ae...ccccd42
terreno + entidades IDÊNTICOS?  true
censo idêntico?                 true   (2 / 129 / 900)
m.centro idêntico?              true
```

O hash cobre `alturaTerreno`, `tipo`, `umidade`, `fertilidade`, `temperatura` e a posição de todas as 1416 entidades. A conclusão é medida, não argumentada: **remover o `.toFixed(2)` não altera nem um bit do mundo gerado.** Ele não muda a ordem dos sorteios, porque os sorteios acontecem antes da formatação. O efeito é puramente de representação.

Isso não autoriza a mudança. Autoriza dizer que, quando ela for autorizada, o risco de regressão na simulação é zero e mensurável.

### 3.2. A chave canônica não sobrevive a um save/load, e a culpa é do `z`

Medido:

```
antes do save : A2A:1|p=G%C3%AAnesis|ri=0|x=80|y=80|z=13.788814544677734|lat=-19.53|lon=31.59
depois do load: A2A:1|p=G%C3%AAnesis|ri=0|x=80|y=80|z=13.789999961853027|lat=-19.53|lon=31.59
idêntico? false
```

Causa: `seriar()` grava `alturaTerreno` com `Math.round(v*100)/100`. O endereço lógico (planeta, região, tile, índice) sobreviveu perfeitamente. Quem quebrou foi o `z`, que está dentro da chave.

E isso expõe um erro conceitual do contrato atual, não apenas um bug: **`z` é terreno, não é endereço.** Altura é um dado do mundo amostrado naquele tile, pertence ao nível TERRENO da hierarquia, que está fora do escopo da 2A. Um endereço que carrega `z` deixa de ser endereço e vira leitura de estado. Endereço tem que ser estável enquanto o lugar for o mesmo, mesmo que o terreno mude.

### 3.3. Falta a inversa `indiceLinear → tile`

O contrato mínimo do briefing (item 8) exige `x = indexLinear % 160` e `y = floor(indexLinear / 160)` com inversão exata. Essa função **não existe** no `endereco.js`. Verificado na lista de exportações: há `indiceLinear`, não há nenhuma inversa. E `indiceLinear` é função crua, sem validação: `A.indiceLinear(-1, 0, 160)` devolve `-1` em silêncio. A validação mora só em `enderecoDeTile`, um nível acima.

### 3.4. O picking existe, é determinístico, é independente da câmera, e erra o alvo por um tile

Executado em Chromium real. Boa notícia primeiro: **a independência é total e medida.** Girei o planeta por arrasto, apliquei zoom em duas direções e orbitei a câmera com shift, e depois cliquei no mesmo tile:

```
antes : A2A:1|...|x=79|y=80|z=13.66324234008789|lat=-19.53|lon=31.59
depois: A2A:1|...|x=79|y=80|z=13.66324234008789|lat=-19.53|lon=31.59
idêntico? true
```

Isso é esperado por construção, porque o picking atual não toca a cena 3D: ele acontece na grade 2D, derivado da grade física. Os critérios de câmera, zoom e rotação estão satisfeitos pelo desenho, não por acaso.

A má notícia é a fidelidade do apontamento. Mirando o centro geométrico de cada tile, com o retângulo remedido a cada clique:

```
alvo (0,0)     → tile (0,0)     OK
alvo (159,0)   → tile (158,0)   errou 1
alvo (0,159)   → tile (0,158)   errou 1
alvo (159,159) → tile (158,158) errou 1
alvo (80,80)   → tile (79,80)   errou 1
alvo (123,40)  → tile (123,40)  OK
```

Duas causas, ambas de layout, nenhuma de contrato:

1. O canvas tem 168 px CSS para 160 tiles (1,05 px por tile) e o painel fica com offset fracionário (`left = 910.390625`). `MouseEvent.clientX` chega truncado para inteiro (medido: enviei 920,76, o handler recebeu 920). O resultado é um viés sistemático de até um tile. Varri todos os pixels inteiros do canvas: os 160 tiles **são** alcançáveis, nenhum fica órfão, mas o pixel que atinge um tile específico não é o pixel que está visualmente no centro dele.

2. O painel da grade cresce quando a string do endereço aparece, e como está ancorado embaixo, ele cresce para cima. Medido: **o canvas sobe 27 px depois do primeiro clique.** Quem clica duas vezes seguidas no mesmo ponto da tela acerta dois tiles diferentes.

O comentário na própria página já admite "±1 tile" e atribui ao pixel. A atribuição está certa. O que a página não diz é que isso é corrigível sem tocar em nada do contrato.

### 3.5. Node e browser concordam

Rodei a suíte nos dois. Resultado idêntico, teste a teste: T1, T2, T2b, T3, T4, T5, T6, T7, T8, T9, T10, T11, T13, T14, T15, T16 passaram; T12 N/A. 16 executados, 0 falhas, 1 N/A, nos dois ambientes. Zero erros de página, zero erros de console.

### 3.6. Determinismo: limpo, com uma ressalva

`Math.random()` no `endereco.js`: zero ocorrências em código (há uma menção dentro de um comentário). `Date.now()`: uma ocorrência, no fallback de `agora()`, usado apenas para cronometrar benchmark, nunca para derivar endereço. `terra.js`: mesma situação. `world.js:44` usa `Math.random()` **apenas** quando nenhuma seed é passada, e a fase 2A sempre passa. O risco existe, mas é latente e está fora do caminho atual.

---

## 4. DECISÃO SOBRE O PROBLEMA DOS 556 METROS

**Decisão: declarar a lacuna, não contorná-la, e reclassificá-la.**

Os 556 m estão corretos como número e incompletos como diagnóstico. Corrigir só a precisão daria a sensação de ter resolvido e não resolveria: sem convenção de âncora e sem orientação, um tile continua sem posição no globo. Por isso a recomendação é não tratar "556 m" como o bug a consertar, e sim tratar **"a região não tem georreferência, só tem uma coordenada aproximada de exibição"** como o fato a declarar.

Consequência prática para a fase 2A: a ancoragem geográfica permanece **exclusivamente no nível REGIÃO**, marcada com `valido: false`, e o contrato passa a **proibir estruturalmente** a existência de qualquer função `tile → lat/lon`. Não é uma função que "ainda não foi escrita". É uma função que não pode existir até que a autoridade do mundo forneça os três dados que faltam.

---

## 5. DECISÃO SOBRE IDENTIDADE DE REGIÃO

**Decisão: manter `regionIndex` como índice, não promover nada, e nomear a única raiz estável que existe, que é a seed.**

O tratamento atual do `endereco.js` está certo e deve ser preservado inteiro: descritor de identidade com `autoridade: false`, `persistencia: 'proibida'`, ausência declarada em vez de UUID inventado. Nada disso muda.

O que proponho acrescentar é uma correção de escopo, não uma identidade nova. A chave lógica passa a conter a `seed`, e passa a ser **emitida apenas quando o mundo tem exatamente uma região**. Com uma região, a seed identifica a região de forma determinística, persistida e verificável. Com duas ou mais, a chave retorna `null` com motivo textual, porque aí realmente não existe resposta honesta.

Isso não inventa autoridade. Apenas para de fingir que um contrato sem identidade pode gerar chave em um cenário em que ele comprovadamente não pode.

---

## 6. PROPOSTA TÉCNICA MÍNIMA

Separando os dois conceitos que o briefing exige separar.

### 6.1. ENDEREÇO LÓGICO (fechável hoje, 100% de dado verdadeiro)

```js
{
  contrato: 'genesis.endereco/2a.2',

  mundo:   { seed: 20260101 },              // CANÔNICO, persistido por seriar()

  planeta: { rotulo: 'Gênesis',
             identidade: { tipo: 'ausente', autoridade: false } },

  regiao:  { regionIndex: 0,                // ÍNDICE, instável, nunca chave
             totalRegioes: 1,
             rotulo: 'Ilha Gênesis',
             tam: 160, tileMetros: 1,
             identidade: { tipo:'derivada', autoridade:false, persistencia:'proibida' } },

  tile:    { x: 80, y: 80,
             indexLinear: 12880,            // CANÔNICO: é o índice real dos arrays
             tam: 160 },

  origemLocal: { x: 80, y: 80,              // canto do tile em metros no espaço da região
                 unidade: 'metro',
                 espaco: 'tile_da_regiao',
                 zeroZ: 'NIVEL_MAR = 0' },

  deslocamento: { x: 0.0, y: 0.0 },         // resto sub-tile, para posições contínuas de entidades

  subregiao: null,                          // ausência real, motivo preservado

  geo: { /* ver 6.2 */ }
}
```

Três decisões dentro disso que valem discussão explícita:

**`origemLocal` é o canto do tile em metros, não o canto da região.** A cadeia do projeto é PLANETA → REGIÃO → TILE → ORIGEM LOCAL → TERRENO. ORIGEM LOCAL está abaixo de TILE e acima de TERRENO, então o que faz sentido ali é o referencial em que terreno e objetos vão ser expressos: a origem do tile. Para tile `(80,80)` com TILE = 1 m, `origemLocal = {x:80, y:80}`. Se a leitura pretendida for outra, ou seja a origem da região (sempre `{0,0}`), é trocar uma linha, mas aí o campo não carrega informação nenhuma. Preciso da sua decisão nesse ponto.

**`deslocamento` preserva a posição contínua.** As entidades vivem em float dentro do espaço de tiles. `tile + deslocamento` reconstrói o float exato, e o endereço deixa de ser lossy para entidades sem precisar carregar `z`.

**`z` sai do endereço e sai da chave.** Motivo na seção 3.2. Altura vira uma consulta separada, `alturaNoEndereco(a)`, explicitamente marcada como leitura de terreno e não como componente de endereço.

Funções novas mínimas, todas puras e testáveis em Node:

```js
tileDeIndice(i, tam)      // inversa exata, com rejeição de i<0 e i>=tam*tam
indiceDeTile(x, y, tam)   // versão validada de indiceLinear (a crua continua, sem validação)
chaveLogica(a)            // 'G2A:20260101/r0/t12880'  ou null quando totalRegioes !== 1
tileDePixel(px, py, rect, tam)  // picking puro, sem DOM, testável headless
```

### 6.2. POSIÇÃO GEOGRÁFICA (lacuna declarada, não fechável hoje)

```js
geo: {
  nivel: 'regiao',                // nunca 'tile'
  valido: false,
  lat: -19.53, lon: 31.59,        // valor de EXIBIÇÃO, degradado na origem
  dir: [x, y, z],                 // via T.dirDeLatLon, reuso da fase 1, sem segunda matemática
  precisao: { passoGraus: 0.01, passoMetros: 1111.95,
              erroMaxMetros: 555.97, erroMaxEmRegioes: 3.47 },
  convencaoDeAncora: 'indefinida',   // o motor não diz que ponto da região é este
  orientacao: null,                  // o motor não tem azimute
  raioDeReferencia: 'nao_declarado', // R=1 no render, 6371 km como rótulo
  motivo: 'ver seção 2.G desta auditoria'
}
```

E, tão importante quanto o que existe: `geoDoTile()` **não será implementada**. Se alguém chamar, lança erro com o motivo. A ausência vira estrutural, não vira "ainda não fizemos".

### 6.3. PICKING

Mantido onde está, na grade local, que é a única superfície onde o tile é real. Sem clique-no-globo. As correções são de apontamento, não de contrato:

1. Canvas com lado múltiplo inteiro de 160 (160 ou 320 px CSS), para que pixel → tile seja exato.
2. Painel alinhado a pixel inteiro, eliminando o offset fracionário.
3. Altura da área de informação reservada desde o início, eliminando o salto de 27 px depois do primeiro clique.
4. Lógica extraída para `tileDePixel()`, função pura, testada em Node nos quatro cantos e no centro, sem depender do browser para provar correção.

Existe uma alternativa para clique-no-globo que eu quero registrar e não recomendar. Seria possível desenhar a região como um quad local ancorado em `regiao.dir` com uma orientação **arbitrária mas declarada**, e fazer picking no UV desse quad. O tile retornado seria exato, porque viria da grade do próprio quad. O problema é que a posição desse quad no globo seria uma convenção visual inventada, e a fase seguinte herdaria essa convenção como se fosse dado. É exatamente o modo como precisão falsa entra num projeto: por um caminho que funciona. Fica registrado como opção; minha recomendação é não.

---

## 7. LACUNA ARQUITETURAL · RELATÓRIO FORMAL (item 4 do protocolo)

Nenhuma alteração foi executada. Este é o pedido de autorização.

**1. Qual capacidade falta**
Georreferência real da região: lat/lon em ponto flutuante, convenção de âncora, orientação da grade e raio de referência declarado. E, para N regiões, identidade persistente de região.

**2. Por que é necessária**
Sem ela, os níveis TILE e ORIGEM LOCAL da hierarquia existem apenas dentro da região, desconectados do globo. A representação espacial funciona como simulação, mas não como mapa. Toda fase futura que precise posicionar duas regiões, streaming, ou qualquer continuidade geográfica, esbarra nisto.

**3. Qual seria a alteração mínima**
Em `v2/core/world.js`, dentro de `gerarRegiao`, linha 85:

```js
// hoje
lat: (rng.range(-40, 40)).toFixed(2), lon: (rng.range(-170, 170)).toFixed(2),

// mínimo
lat: rng.range(-40, 40), lon: rng.range(-170, 170),
```

Acrescido de três campos declarativos, que são **decisões de projeto**, não dados recuperáveis:

```js
azimute: 0,              // decisão: +y da grade aponta para o norte geográfico
ancora: 'centro',        // decisão: lat/lon referem-se ao centro da região
raioRefKm: 6371,         // decisão: raio usado para converter metro em ângulo
```

E, opcionalmente e separadamente, identidade real de região: `id: m.planeta.regioes.length` no lugar de `const id = 0`, mais inclusão de `id` em `seriar()`.

Insisto na distinção: remover o `toFixed` é **recuperar** um dado que o motor já produz. Os três campos declarativos são **criar** informação nova, e isso é decisão sua, não dedução minha. Eu não escolho onde fica a âncora nem para onde aponta o norte.

**4. Quais invariantes seriam afetadas**
Geração do mundo: **nenhuma**, e isso está medido na seção 3.1, com hash idêntico sobre terreno e 1416 entidades. Afetados de fato: todo consumidor que faz `String(reg.lat)` ou `parseFloat`, ou seja `terra.js:354-357` (`latStr`/`lonStr`) e o HUD; o round-trip `seriar`/`desserializar`, que hoje grava e devolve string; a exibição de 2 casas na interface, que passa a ser formatação no consumidor em vez de no produtor. A mudança de `id` afeta qualquer código que assuma `reg.id === 0`.

**5. Quais testes precisariam ser refeitos**
Fase 1: os testes de `lerRegiaoCanonica` que comparam `latStr`. Fase 2A: T2 (campos conferem com world.js), T8 (mede as 2 casas decimais, que deixariam de existir na origem), T11 (âncora bit a bit contra `posicaoDaRegiao`, que muda de valor ainda que não de fórmula). Novos: precisão do round-trip de save/load, coerência do azimute, coerência da âncora, e unicidade de `id` com N regiões.

---

## 8. PLANO DE TESTES PROPOSTO (a executar só depois da sua aprovação)

| teste | exigência | executável? | observação |
|---|---|---|---|
| T1 | determinismo do endereço | sim | já coberto por T3 atual, mantém |
| T2 | região canônica → endereço estável | sim | mantém, ajustar após retirada do `z` |
| T3 | tile → indexLinear | sim | cinco pontos + toda a borda |
| T4 | indexLinear → tile | sim | **função nova**, não existe hoje |
| T5 | limites 0 e 159 | sim | |
| T6 | rejeição fora da grade | sim | ampliar para índices, não só coordenadas |
| T7 | picking em tiles conhecidos | sim, na grade local | via `tileDePixel()` puro, headless |
| T8 | independência da câmera | sim | já medido nesta auditoria, formalizar |
| T9 | independência do zoom | sim | idem |
| T10 | independência da rotação | sim | idem |
| T11 | Node e browser concordam | sim | já medido: 16/16 idêntico |
| T12 | sem `Date.now()` | sim | teste estrutural sobre o fonte |
| T13 | sem `Math.random()` | sim | idem |
| T14 | `regionIndex` não é identidade | sim | mantém T14 atual, acrescentar a regra da chave |
| T15 | nenhuma transformação falsa lat/lon → tile | sim | teste estrutural: o módulo não exporta a função e `geo.valido === false` |
| extra | endereço sobrevive a save/load | sim | falha hoje, passa depois da retirada do `z` |
| N/A | fronteira entre regiões, N regiões no motor | **não** | o motor materializa uma região por mundo |
| N/A | picking clique-no-globo → tile | **não** | faltam âncora, orientação e precisão |

---

## 9. VEREDITO PRELIMINAR

**FASE 2A: NÃO APROVADA.**

O que já está certo e não deve ser mexido: a doutrina identidade/índice/rótulo, a ausência declarada da sub-região, a recusa de inventar UUID, o reuso de `terra.js` sem segunda matemática, o determinismo, a concordância Node/browser, e a medição honesta dos 556 m dentro do próprio código.

O que impede a aprovação, em ordem de gravidade:

1. Falta a inversa `indexLinear → tile`, exigida pelo contrato mínimo do item 8.
2. A chave canônica carrega `z` e não sobrevive a save/load. Medido.
3. O picking erra o tile alvo por um tile em 4 de 6 casos testados, por layout, e o painel desloca 27 px depois do primeiro clique.
4. A ancoragem geográfica está documentada como imprecisa, mas as duas lacunas mais graves, âncora e orientação, não estão declaradas em lugar nenhum. O contrato hoje dá a entender que só falta precisão.
5. A chave lógica não inclui a seed, que é a única raiz estável e persistida que o motor oferece.

Nenhum desses cinco exige tocar em arquivo de lei. Os cinco são fecháveis dentro de `fase2a/endereco.js` e `fase2a/index.html`.

A alteração em `world.js` é necessária para a georreferência, não para fechar o contrato de endereço lógico. São coisas separáveis, e essa separabilidade é o principal resultado desta auditoria.

---

## 10. O QUE EU NÃO FIZ, DE PROPÓSITO

Não implementei nada. Não toquei em arquivo de lei. Não inventei coordenada, id ou UUID. Não recuperei o float via replay do RNG, mesmo tendo confirmado que funcionaria. Não escrevi de volta no `world.js`. Não criei segunda fonte de verdade. Não fiz terreno, relevo, FBM, vegetação, animais, NPCs, física, chunks, streaming, LOD, atmosfera, nem expansão de região. Não avancei para a 2B.

Aguardo decisão sobre: a leitura de `origemLocal` (canto do tile ou canto da região), a autorização para implementar os cinco itens da seção 9 dentro da fase 2A, e a autorização, separada, para o patch mínimo no `world.js` descrito na seção 7.
