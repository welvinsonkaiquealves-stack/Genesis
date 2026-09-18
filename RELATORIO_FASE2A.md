# GÊNESIS DIGITAL · FASE 2A
# RELATÓRIO FINAL DE FECHAMENTO

Data: 2026-09-12
Contrato entregue: `genesis.endereco/2a.2` (`endereco.js` versão `fase2a-1.1`)
Escopo: fechamento do contrato de endereço **lógico**, sem tocar na autoridade do mundo.

---

## 1. VEREDITO

**FASE 2A: APROVADA no nível LÓGICO.**

Os nove critérios de aprovação, um a um:

| critério | situação | evidência |
|---|---|---|
| endereço lógico determinístico | atendido | T3, T15, T21, T23 |
| tile ↔ indexLinear exato | atendido | T17, varredura dos 25600 índices |
| picking correto | atendido | T19 em Node, 6/6 no browser em duas viewports |
| câmera, zoom e rotação não alteram o endereço | atendido | medido no Chromium, string idêntica |
| nenhuma identidade falsa criada | atendido | T13, T14, T21 |
| nenhuma coordenada geográfica inventada | atendido | T22, ausência estrutural |
| Node e browser concordam | atendido | 23/23 idêntico, teste a teste |
| limitações documentadas | atendido | `LACUNAS_GEO`, ESTADO.md, seção 7 deste relatório |
| nenhum arquivo de LEI alterado | atendido | md5 conferido, seção 3 |

**A georreferência continua NÃO APROVADA e continua declarada como lacuna.**
Isso é por construção, não por omissão: `geo.valido` é `false` por invariante
testada, e a fase não finge o contrário em nenhum campo, função ou string.

---

## 2. O QUE FOI IMPLEMENTADO

### 2.1. Inversa exata e validação de índice

```js
tileDeIndice(i, tam)   // x = i % tam ; y = floor(i / tam)  -> {x, y, indexLinear, tam}
indiceDeTile(x, y, tam)// versão validada; null fora da grade
indiceLinear(x, y, tam)// PRESERVADA crua, sem validação, espelhando world.js:276
```

A função crua foi mantida intacta de propósito. Ela existe para reproduzir o
motor bit a bit, inclusive quando o motor receberia lixo. Quem valida é
`indiceDeTile`. Isso está documentado no próprio código para que ninguém a
"conserte" depois.

Rejeição verificada nos dois sentidos: coordenadas `-1`, `160`, `NaN`,
`Infinity`, `-0.0001`, `1e9`; índices `-1`, `25600`, `25601`, `NaN`, `Infinity`,
`-0.5`, `12880.5`, `1e9`. Todos devolvem `null`. Limites `0` e `25599` continuam
válidos.

### 2.2. Altura saiu do endereço

`z` não existe mais em `local`, `tile` ou `origemLocal`. Foi substituída por:

```js
alturaNoEndereco(reg, a)  // { z, natureza: 'leitura_de_terreno', dentro, fonte, nota }
```

O motivo é medido, não estilístico. `seriar()` grava `alturaTerreno` com
`Math.round(v*100)/100` (world.js:2425). Na versão 2a.1 a chave canônica do tile
(80,80) mudava de `z=13.788814544677734` para `z=13.789999961853027` depois de um
save/load. Um endereço que carrega altura deixa de ser endereço e vira leitura de
estado. Agora o endereço sobrevive e a perda fica confinada onde ela pertence.

A altura das entidades também saiu de `local` e foi para `alvo.z`, marcada
`leitura_de_entidade`.

### 2.3. tile, origemLocal e deslocamento separados

Conforme a Decisão 1:

```js
tile:         { x: 80, y: 80, indexLinear: 12880, tam: 160, dentro: true }
origemLocal:  { x: 80, y: 80, unidade: 'metro', espaco: 'tile_da_regiao', tile: 1 }
deslocamento: { x: 0, y: 0, unidade: 'metro' }
```

`origemLocal` é o canto **daquele tile** em metros. A origem do **espaço** da
região continua sendo `(0,0)` e está declarada à parte, como constante
(`ESPACO_LOCAL_ORIGEM`), dentro de `local.origemDoEspaco`.

`deslocamento` é a posição contínua dentro do tile. Para uma entidade real do
motor, `tile + deslocamento` reconstrói o float exato: Adão está em
`x = 123.2485175319016`, o que dá tile 6523 e deslocamento `0.248518`, e a soma
volta bit a bit (testado em T8 e T16).

O campo `celula` foi mantido como **alias com a mesma referência de objeto** que
`tile`, e o teste T5 verifica que é a mesma referência, não uma cópia. O nome
`tile` passou a ser o canônico porque `world.js` já usa `CELULA = 8` para a
célula de 8 m da grade espacial de consulta, que é outra coisa. Era uma colisão
de nomenclatura esperando para confundir a fase de objetos.

### 2.4. Chave lógica enraizada na seed

```
G2A:20260101/r0/t12880
```

A seed é a única raiz estável **e persistida** do motor: `seriar()` grava
`m.seed`. Com exatamente uma região, a região é função determinística da seed, e
a chave é inequívoca.

Com duas ou mais regiões, `descreverChaveLogica()` devolve `chave: null`,
`emitida: false` e o motivo por escrito. Essa recusa é testada (T13). Não foi
inventado UUID, `regionIndex` não foi promovido a identidade e `reg.id` continua
exposto como o que é: `const id = 0` hardcoded, igual para qualquer região.

A doutrina anterior permanece intocada: `identidade.autoridade = false`,
`persistencia = 'proibida'`, `regionIndex` declarado como índice de coleção.

### 2.5. A chave canônica ficou limpa

Antes: `A2A:1|p=G%C3%AAnesis|ri=0|x=80|y=80|z=13.78881...|lat=-19.53|lon=31.59`
Agora: `A2A:2|s=20260101|ri=0|x=80|y=80`

Três campos saíram, cada um por um motivo diferente:

- `z`: é terreno. Seção 2.2.
- `lat`/`lon`: é georreferência de nível REGIÃO, com `geo.valido = false`. Dentro
  da mesma string que `x,y`, ela sugeria que aquele tile está naquela coordenada.
  Não está. Continua disponível em `a.geo`, com as quatro lacunas anexas.
- `p` (rótulo do planeta): texto de apresentação, trocável. Uma chave de
  comparação não pode mudar porque alguém renomeou o planeta. T7 agora verifica
  a imunidade: nomes com acento, `|`, `;` e `=` não alteram a chave.

Entrou `s` (seed), que é a raiz estável.

### 2.6. Picking puro

```js
tileDePixel(px, py, rect, tam, opcoes)   // pixel -> tile, sem DOM
pixelDoTile(x, y, rect, tam)             // centro geométrico do tile -> pixel
```

A causa raiz do erro de ±1 tile não era o tamanho do canvas. Era tratar
`MouseEvent.clientX`, que chega **truncado para inteiro**, como se fosse uma
posição exata. Um valor inteiro `p` significa "o ponteiro estava em algum lugar
de `[p, p+1)`". Usar `p` direto enviesa meio pixel para a esquerda, e com 1,05 px
por tile isso derruba o tile em um, sistematicamente.

A convenção implementada: coordenada inteira é índice de pixel e recebe `+0,5`;
coordenada fracionária é posição exata e é usada como veio. Há override explícito
por `opcoes.centroDoPixel`.

Isso corrige o problema **independentemente** do tamanho do canvas. T19 prova:
acerta 6/6 alvos em quatro retângulos diferentes, incluindo o retângulo exato que
quebrou no browser (`left = 910.390625`, 168 px para 160 tiles) e um retângulo de
201 px com offset fracionário. A diagonal completa de 160 tiles também passa.

Clique fora do retângulo devolve `null`, não um clamp silencioso.

### 2.7. Interface da grade

Quatro correções, todas de layout, nenhuma de contrato:

1. Lado da grade é múltiplo inteiro de 160: 320 px no desktop, 160 px no celular.
2. Largura do painel fixa em `LADO + 16`, e o título com `letter-spacing` reduzido
   e `overflow: hidden`. Era o título que alargava o painel e produzia o offset
   fracionário `910.390625`.
3. Altura do bloco de informação reservada em 118 px desde o início. O painel está
   ancorado embaixo, então qualquer crescimento empurrava o canvas para cima. Ele
   subia 27 px depois do primeiro clique, e o segundo clique no mesmo ponto da
   tela caía em outro tile. Agora o deslocamento medido é `0.0 px`.
4. O cálculo saiu da interface: `cliqueGrade` só mede o `rect` e delega para
   `A.tileDePixel`. A interface não faz aritmética de coordenada.

O HUD passou a mostrar a chave lógica, a origem local, a altura como leitura
separada e rotulada, `geo.valido` e os quatro campos que faltam.

### 2.8. Georreferência formalizada como lacuna

`a.globo` virou `a.geo` (o nome antigo continua como alias da mesma referência):

```js
geo: {
  nivel: 'regiao',                  // NUNCA 'tile'
  valido: false,                    // invariante desta fase
  lat, lon, dir, raio, precisao,
  convencaoDeAncora: 'indefinida',
  orientacao: null,
  raioDeReferencia: 'nao_declarado',
  lacunas: LACUNAS_GEO,             // os quatro campos, cada um com motivo
  motivo: MOTIVO_GEO_INVALIDA
}
```

`geoDoTile()` não foi criada. T22 verifica estruturalmente que ela não existe,
junto com sete outros nomes que poderiam sugerir a mesma coisa
(`latLonDeTile`, `tileParaLatLon`, `posicaoDoTile` e afins), que `a.tile` e
`a.origemLocal` não contêm `lat` nem `lon`, e que a string serializada também não.

A ausência é estrutural: não existe função, não existe campo e não existe chave.
Não é "ainda não fizemos".

### 2.9. Sub-região

Continua `null`, com o motivo textual original preservado inteiro. Nada foi
sintetizado para preencher o formato.

---

## 3. ARQUIVOS

### Modificados (os dois autorizados)

| arquivo | md5 antes | md5 depois | linhas |
|---|---|---|---|
| `fase2a/endereco.js` | `1c0069f2177029793310f496f3c89a23` | `f4957ebccd5c5c8b243fc5fd6289d63b` | 1278 → 1837 |
| `fase2a/index.html` | `957986878958e8a5c1ab3f73ceda744a` | `1167caa383c489050848ac5a4f56a68b` | 443 → 480 |

### Criados

| arquivo | md5 | papel |
|---|---|---|
| `ESTADO.md` | `8068ee28d3b0e5043735fb65db9d9cee` | documento canônico de continuidade |
| `AUDITORIA_FASE2A.md` | (etapa anterior) | auditoria e proposta |
| `RELATORIO_FASE2A.md` | este arquivo | relatório de fechamento |

### Atualizado

`LEIA-ME.txt`: o bloco "PONTO DE RETOMADA" apontava para "paramos na criação do
planeta", que ficou falso. Agora aponta para `ESTADO.md`. Quatro linhas.

### Preservados (LEI), md5 conferido antes e depois

```
a5a62e6da602c23e088b1181a44537e5  fase1/terra.js
9bcab37469b0217778317efcd2e162a3  v2/core/world.js
0bf52b6f8d5e4bc1c6a0d876ca055cc4  v2/core/util.js
5151abaf008677d3e6518c65c7bd516c  v2/core/data.js
a65aad160e01ee11edf39591cc3a8d67  v2/core/brain.js
eb8549863a97355411c3259a3f93b8e1  _build/three.min.js
```

Todos `OK` na verificação. Nenhum patch de `world.js` foi feito: nem lat/lon sem
`toFixed`, nem azimute, nem âncora, nem raio de referência, nem id persistente.
Esse trabalho continua separado, como você determinou.

Nenhum arquivo `.l2s.tmp_obj_*` existe no pacote, e nada foi apagado.

### Git

Repositório inicializado para que o `diff` existisse (o pacote veio sem git).
Dois commits:

```
523e767  Estado congelado 2026-09-11: Fase 1 entregue, Fase 2A em contrato 2a.1
0fb1617  Fase 2A fechada no nivel logico: contrato genesis.endereco/2a.2
```

O primeiro é o pacote original bit a bit, para que o segundo seja um diff real:
`865 inserções, 132 remoções, 4 arquivos`, nenhum deles protegido.

---

## 4. TESTES

### Node (v22.22.2)

```
24 testes · 23 executados · 0 falhas · 1 N/A
```

### Chromium (servidor local, página real)

```
24 testes · 23 executados · 0 falhas · 1 N/A · 0 erros de console
```

Idêntico teste a teste. O único N/A é o T12, e o motivo é o mesmo de sempre: o
motor materializa uma região por mundo, então fronteira entre regiões e N regiões
coexistindo não são executáveis contra o motor real. O formato é testado à parte,
em T13, explicitamente marcado como teste do formato e não do motor.

### Testes novos

| id | o que prova |
|---|---|
| T17 | inversa exata em toda a grade: os 25600 índices, os 640 tiles de borda e os seis pontos do contrato |
| T18 | rejeição nos dois sentidos, coordenadas e índices, e limites 0 e 25599 preservados |
| T19 | picking puro acerta o centro geométrico em quatro retângulos, incluindo o caso real que falhava; clique fora devolve null; determinismo em 1000 chamadas |
| T20 | endereço e chave lógica idênticos depois de save/load, **apesar** de a altura mudar |
| T21 | chave lógica enraizada na seed, determinística, sem autoridade |
| T22 | ausência estrutural de qualquer transformação tile para lat/lon |
| T23 | derivar endereço não chama `Date.now` nem `Math.random`, medido por interceptação real das duas funções globais durante 300 derivações, não por leitura do fonte |

### Testes atualizados

T2b (altura virou leitura de terreno e o teste passou a verificar que ela **não**
está no endereço), T5 (usa `tile` e verifica que `celula` é a mesma referência),
T6 (verifica `tile`, `origemLocal` e `deslocamento` nulos fora da grade), T7
(nova projeção e imunidade ao rótulo), T8 (reconstrução do float por
`tile + deslocamento`), T11 (`geo` e o invariante `valido = false`), T13 (recusa
da chave lógica com N regiões), T16 (reconstrução da posição contínua de
entidades reais).

### Validação manual no browser

| verificação | resultado |
|---|---|
| carregamento | sem erro, sem erro de console |
| rect do canvas | `x = 763` e `x = 213`, inteiros nas duas viewports |
| deslocamento do canvas após o primeiro clique | `0.0 px` |
| picking em (0,0) (159,0) (0,159) (159,159) (80,80) (123,40) | 6/6 em 1100×800 |
| os mesmos seis alvos em 390×780 | 6/6 |
| endereço após rotação do planeta, zoom e órbita da câmera | idêntico |
| chave lógica após os mesmos movimentos | idêntica |
| sobreposição entre a barra de botões e o painel da grade | nenhuma, nas duas viewports |

Exemplo real do tile (80,80):

```
endereço : A2A:2|s=20260101|ri=0|x=80|y=80
lógica   : G2A:20260101/r0/t12880
tile     : { x: 80, y: 80, indexLinear: 12880, tam: 160 }
origem   : { x: 80, y: 80, unidade: 'metro' }
desloc   : { x: 0, y: 0 }
terreno  : 13.79 m  (leitura, fora do endereço)
geo      : valido = false · nível = regiao
```

---

## 5. INVARIANTES PRESERVADAS

- `regionIndex` continua índice de coleção, com `autoridade: false` e
  `persistencia: 'proibida'`.
- `reg.id` continua exposto como hardcoded que não discrimina.
- Rótulos continuam sendo rótulos, e agora nem sequer influenciam a chave.
- Nenhum UUID, nenhum id sintético, nenhuma identidade inventada.
- Nenhuma segunda fonte de verdade: toda conversão lat/lon continua passando por
  `terra.js`, e T11 prova por diferença exata zero contra `T.posicaoDaRegiao`.
- Nenhuma matemática geodésica paralela.
- `subregiao` continua `null`, com o motivo real.
- Determinismo: mesma seed produz o mesmo endereço, e a ausência de `Date.now` e
  `Math.random` no caminho do endereço agora é medida, não presumida.
- Os seis arquivos de LEI continuam bit a bit idênticos.

---

## 6. DECISÃO REGISTRADA QUE NÃO FOI TOMADA POR MIM

O float completo de lat/lon é recuperável replicando os dois primeiros sorteios do
RNG a partir da seed. Isso foi confirmado na auditoria e **continua recusado**,
pelo mesmo motivo: dependeria da ordem interna de sorteios dentro de
`gerarRegiao`, que é detalhe de implementação e não API, e criaria uma segunda
fonte de verdade que divergiria em silêncio. Além disso não resolveria a âncora
nem a orientação, que são as lacunas decisivas.

---

## 7. LIMITAÇÕES QUE PERMANECEM

1. **Georreferência de tile não existe.** `geo.valido = false`. Faltam precisão,
   convenção de âncora, orientação e raio de referência. Nenhum dos quatro é
   derivável do que o motor tem hoje.
2. **Picking clique-no-globo não existe.** O picking acontece na grade local, que
   é a única superfície onde o tile é real. Fazer picking no globo exigiria
   escolher uma orientação arbitrária e ela viraria dado herdado pela fase
   seguinte. Registrado na auditoria como opção e recomendado contra.
3. **Identidade persistente de região não existe.** Com mais de uma região, a
   chave lógica é recusada. Isso é o comportamento correto, não um bug.
4. **Multi-região não é testável contra o motor.** T12 permanece N/A.
5. **`W.alturaEm` resolve apenas a região ativa.** Para região não ativa, a
   leitura direta de `reg.alturaTerreno` é a única existente. Já era declarado.
6. **`seriar()` despeja `m.planeta` inteiro**, incluindo os `Float32Array` das
   regiões, que viram objetos gordos no JSON. Não afeta o endereço e está fora do
   escopo da 2A, mas vai incomodar quando houver mais de uma região.

---

## 8. PRÓXIMO BLOQUEIO RECOMENDADO

**A decisão arquitetural de georreferência em `v2/core/world.js`.**

Ela não bloqueia terreno, relevo, vegetação nem objetos dentro de uma única
região: tudo isso vive no espaço local, que está fechado e exato. Ela bloqueia
qualquer coisa que precise posicionar a região no globo com precisão física.

A alteração mínima, os invariantes afetados e os testes a refazer estão em
`ESTADO.md`, seção "PRÓXIMO BLOQUEIO REAL", e no relatório de auditoria, seção 7.

Uma coisa dessa decisão já está medida: remover o `.toFixed(2)` não altera nem um
bit do mundo gerado, verificado por sha256 sobre terreno e 1416 entidades. Os
outros três campos, azimute, âncora e raio de referência, são decisões suas.
Nenhuma delas é dedutível do código, e eu não vou escolher por você onde fica a
âncora nem para onde aponta o norte.
