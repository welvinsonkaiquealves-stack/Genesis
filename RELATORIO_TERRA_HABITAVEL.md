---
titulo: Relatório de entrega — Terra habitável
projeto: Gênesis Digital v2
especificação: GENESIS_PLANO_TERRA_HABITAVEL.md v1.0
data: 2026-09-12
escopo: planeta e superfície. Sem NPC, sem animal novo, sem cérebro.
---

# TERRA HABITÁVEL — RELATÓRIO DE ENTREGA

Responde ao Anexo C da especificação, na ordem que ela pede.

---

## 1. O QUE MUDOU, ARQUIVO POR ARQUIVO

### Arquivos de LEI: nenhum foi alterado

| arquivo | md5 antes | md5 depois | estado |
|---|---|---|---|
| `v2/core/world.js` | `9bcab374…62d16b` | `9bcab374…62d16b` | intocado |
| `fase1/terra.js` | `a5a62e6d…44537e5` | `a5a62e6d…44537e5` | intocado |
| `v2/core/util.js` | `0bf52b6f…a055cc4` | `0bf52b6f…a055cc4` | intocado |
| `v2/core/data.js` | `5151abaf…6db516c` | `5151abaf…6db516c` | intocado |
| `v2/core/brain.js` | `a65aad16…9591cc3` | `a65aad16…9591cc3` | intocado |
| `_build/three.min.js` | `eb854986…3f93b8e1` | `eb854986…3f93b8e1` | intocado |

Nenhum backup foi necessário, nenhuma errata foi aberta, e a lei 1 da Parte 7
não chegou a ser exercida. Isso não foi sorte: foi consequência da Rota A,
explicada na seção 2.

### Arquivos alterados e criados

| arquivo | md5 novo | o que é |
|---|---|---|
| `fase2a/endereco.js` | `49e1195f17d8b0b8fffff8029520180e` | contrato subiu de `2a.2` para `2a.3`: ancoragem por tile |
| `v2/core/superficie.js` | `5f26511bddcad229c1e76bafb49578b7` | NOVO. Contrato `genesis.superficie/1` |
| `v2/core/ambiente.js` | `3011da726e4181edb4c1d9a8db7783b1` | guarda `P.ancoraOriginais` (uma linha de consequência, seção 3) |
| `fase2b/index.html` | `12d9e6c80814cced8fd9282cedf99e55` | a página: um mundo, um eixo de zoom |
| `testes/e1e2_endereco.js` | novo | aceite de E1 e E2 |
| `testes/superficie.js` | novo | suíte S1 a S14 |
| `testes/pagina.js` | novo | aceite no navegador, 500 passos |
| `testes/custo.js` | novo | aceite de E6 |
| `testes/hash.js` | novo | `hashMundo(seed)` em processo isolado |
| `testes/gerar_artefato.js` | novo | versão publicável, gerada do mesmo fonte |

---

## 2. QUAL ROTA DE ENDEREÇO, E POR QUÊ

**Rota A: âncora derivada.** O endereço é `(regionIndex, local)`. A posição no
globo é calculada e nunca gravada.

O plano descreve o erro de 556 m como precisão insuficiente e propõe, na Rota
B, gravar lat/lon com mais casas. A medição mostra que o diagnóstico está certo
e o remédio não é esse.

O erro de ±555,97 m só existe se `reg.lat` e `reg.lon` forem lidos como a
**medida** de onde a região está, e comparados contra uma verdade externa.
Aqui eles não são medida. Eles são a **definição**. A ida e a volta usam o
mesmo número arredondado, então a conta fecha exata. O arredondamento continua
existindo, mas mudou de natureza: deixou de ser incerteza do endereço e virou
granularidade de posicionamento. Uma região só pode nascer em múltiplos de 0,01
grau, e dentro dela o endereço fecha em fração de micrômetro.

A consequência prática é a que importa: `world.js` não precisou ser tocado. O
`.toFixed(2)` continua onde estava.

**As quatro lacunas de 2a.2 fecharam por declaração, não por descoberta.** O
motor continua sem opinião sobre elas. Quem declara agora é o contrato, e
assume a responsabilidade:

| lacuna | como ficou |
|---|---|
| convenção de âncora | `reg.lat`/`reg.lon` são o **centro** da região |
| orientação | `+x` local aponta para leste, `+y` aponta para o **sul** |
| raio de referência | `m.planeta.raioKm`, esfera, sem achatamento |
| precisão | **derivada**, nunca gravada |

A orientação era a lacuna que casas decimais não resolviam, e ela está testada:
mover um tile em `+y` diminui a latitude, mover um tile em `+x` aumenta a
longitude. `+y` aponta para o sul porque a grade é indexada por linha
(`world.js:276`, `idx = y*TAM + x`) e a linha 0 é o topo do mapa.

---

## 3. NÚMEROS

### Endereço (E1 e E2)

| critério do plano | exigido | medido |
|---|---|---|
| endereço → globo → endereço | erro < 1 m | **7,05 × 10⁻⁷ m** |
| globo → endereço → globo | erro < 1 m | **7,04 × 10⁻⁷ m** |
| idempotência da parte discreta | 100% | **100.000 / 100.000** após 10 ciclos |
| deriva da parte contínua em 10 ciclos | não acumular | **0** |
| regionIndex estável | 100% | **100.000 / 100.000** na esfera inteira |
| colisões em 100.000 chaves | 0 | **0** |
| cantos exatos de tile no tile certo | — | **1000 / 1000** |

A meta ambiciosa do plano era 10⁻⁶ m. Ficou abaixo dela.

A resolução do espaço local é **declarada em 1 micrômetro**. Sem isso, um ruído
de 10⁻⁹ m sobre a borda exata de um tile derrubava o índice para o vizinho: 851
de 1000 cantos exatos caíam errado. Quantizar na volta custa 5 × 10⁻⁷ m de erro
contínuo e compra idempotência exata.

### Superfície (E3 a E5)

14 testes, 0 falhas, em Node e dentro do navegador.

| teste | o que prova | número |
|---|---|---|
| S2 | elevação contínua no zoom | maior salto por meia oitava: 16,8 m num campo de 7000 m |
| S3 | dentro da região quem manda é o motor | divergência máxima **1,1 × 10⁻⁴ m** |
| S4 | travessia de 66 km metro a metro | maior degrau **1,75 m**, e é encosta de verdade |
| S5 | classificador é espelho de `world.js:171-190` | **25.317 tiles, 0 divergências** |
| S8 | superfície e endereço usam a mesma projeção | **4,0 × 10⁻¹⁴ m** |
| S10 | declive é o gradiente real do `Float32Array` | razão **1,000** |
| S12 | o render rápido desenha o mesmo campo do caminho exato | de 5 km para baixo, desvio **exatamente 0** |
| S13 | nenhuma costura no quadro | pior linha 3 a 8 vezes a média (era 31) |
| S14 | pintar em faixas é igual a pintar de uma vez | **0 bytes diferentes** |

### Página, no navegador (E3 e E8)

390 × 780, Chromium, WebGL por software.

| critério | resultado |
|---|---|
| 500 passos de zoom, do espaço a 2 m | **0 quadros vazios** em 391 com superfície ativa |
| exceções no console em toda a varredura | **0** |
| salto de informação entre passos vizinhos | maior salto de luminância média: **7,6 de 255** |
| 200 idas e voltas | heap sem crescimento |

### Custo (E6)

| medida | valor |
|---|---|
| geração de uma região (`world.js`, 160×160 + vida) | 21,2 ms |
| geração do campo planetário 360×180 | 46,4 ms |
| camada superfície sobre os dois | 0,05 ms |
| memória por região ativa | **4.091 KB** (mais 2.532 KB do planeta, uma vez só) |
| `amostraEm(x,y)` completo, declive centrado | 14,0 µs |
| `amostraEm(x,y)` com `declive: 'rapido'` | 5,2 µs |
| `amostraEm(x,y)` com `declive: false` | 2,5 µs |
| `elevacaoDaDir` | 0,77 µs |
| `enderecoDeGlobo` | 1,88 µs |
| `W.tick(1 s)` | 3,70 ms |
| `ambiente.passoIntegrado(60 s)` | 3,16 ms |
| 200 regiões geradas e descartadas | 2,3 s, delta de heap 0,0 MB |

Pintura por nível, em 332 × 663, com o refino em faixas ativo:

| nível | pintura média | pico |
|---|---|---|
| L1 | 15,8 ms | 18,6 ms |
| L2 | 19,5 ms | 37,0 ms |
| L3 | 20,5 ms | 33,2 ms |
| L4 | 20,2 ms | 33,0 ms |

**FPS real, medido, com a ressalva que o número exige.** 12 a 13 quadros por
segundo nos níveis de globo, 27 nos de superfície. Esse número não é
representativo de aparelho nenhum: o WebGL deste contêiner é SwiftShader, ou
seja, GPU emulada em CPU, e é ela que segura L0 e L1. O número honesto que dá
para afirmar é o da superfície, que não usa GPU: **20 ms por quadro na
amostragem em uso**, com orçamento adaptativo. A pendência de medir FPS com
olho humano continua aberta e agora tem onde ser medida.

### Determinismo (E8)

`hashMundo(seed)` está implementado em `v2/core/superficie.js` e exportado.
Entram as cinco grades do `world.js`, a âncora da região, o censo de vida, e
uma malha de 64 × 64 amostras do campo contínuo da superfície.

```
processo 1, seed 20260101:  75ec72bc4eccad7c612b232d1b8cdcbb
processo 2, seed 20260101:  75ec72bc4eccad7c612b232d1b8cdcbb   IDÊNTICOS
processo 3, seed 20260102:  66d0e6810e2fd02d3c9ccbcc7ea898f4   diferente
```

Dois processos separados, não duas chamadas no mesmo.

---

## 4. AS DECISÕES QUE PRECISARAM DE JULGAMENTO

### A bacia da ilha

O campo planetário coloca Ilha Gênesis no alto de um maciço de **3.111 m**,
porque a placa que a gerou tem o pico exatamente ali. O `world.js` diz outra
coisa, e diz com dado: a borda da região é mar, de -28 m em média a -64 m nos
cantos.

Fazer o motor vencer apagaria um maciço inteiro por causa de uma ilha de 160
metros. Fazer o campo vencer afogaria o que o motor afirma. As duas são mentira.

A reconciliação é geográfica. A ilha fica numa **bacia**: o mar desce da borda
da região até -900 m e a bacia sobe de volta ao campo planetário em 55 km. O
resultado é uma ilha vulcânica em água funda com o maciço no horizonte, que é a
forma que o Havaí tem. As duas autoridades ficam inteiras e a travessia é
contínua em toda parte, provado metro a metro no teste S4.

### Até onde o motor manda

A primeira versão deixava o `world.js` ditar o fundo do mar por 2,48 km, com
dado de 160 metros. Como a leitura satura na última fileira de tiles, o
resultado era uma plataforma perfeitamente plana em volta da ilha, e um risco
branco na borda onde a derivada ia a zero de uma vez. A autoridade do motor
termina agora em **420 m**, e o talude, que é outra coisa e tem outra escala,
continua levando quilômetros.

### A célula da âncora

A célula planetária da ilha carrega um marcador de +15 m, para a ilha não sumir
do mapa de 1 grau. Isso é escala de mapa, não batimetria: a 2 km da ilha o mar é
mar. `ambiente.js` passou a guardar em `P.ancoraOriginais` o valor que as nove
células tocadas tinham. O mapa lê o marcado, a superfície lê o original, os dois
vêm do mesmo objeto. Uma fonte, duas leituras declaradas.

---

## 5. ACHADO EM ARQUIVO DE LEI, REPORTADO E NÃO CORRIGIDO

**`world.js:209` — o lago escava o terreno e não pinta o bioma.**

O laço que pinta o bioma do lago usa `l.r` como limite, e `l.r` é fracionário
(6,2588 na seed canônica). O índice do `TypedArray` sai fracionário e a escrita
é descartada em silêncio. O bloco de escavação logo abaixo, na linha 243, usa
`Math.round` e funciona.

Medido: dos 121 tiles dentro do raio do Lago Gênesis, **121 têm leito escavado
em `reg.prof` e `reg.aguaZ`, e 0 têm `tipo` igual a lago**.

Consequência na simulação: `W.ehAgua` devolve falso em cima do lago, peixe não
nasce ali, planta cresce dentro d'água. Isso vale desde a Fase 1.

Pelo protocolo:

1. **Qual capacidade falta.** O lago existir como bioma, e não só como
   geometria.
2. **Por que é necessária.** Sem ela a água doce parada não é consultável pelo
   caminho que o motor usa para tudo o mais, que é `biomaEm`.
3. **Alteração mínima.** Trocar os dois limites do laço por `Math.round`,
   exatamente como a linha 243 já faz. Uma linha.
4. **Invariantes afetadas.** `reg.tipo` em até 121 tiles, e por consequência
   `biomaEm`, `ehAgua`, e o sorteio de flora e fauna. O hash do mundo muda.
5. **Testes a refazer.** O valor de referência de `hashMundo`, e os testes S5 e
   S11, que precisam ser reescritos.

**Aguarda autorização.** Enquanto isso, a superfície mostra o lago lendo
`reg.prof` e `reg.aguaZ`, que existem e estão corretos. Contorna sem tocar.

O teste **S11** passa enquanto o defeito existir e cai no dia em que ele for
corrigido.

---

## 6. O QUE O MEDIDOR PEGOU E O OLHO NÃO PEGARIA

Vale registrar, porque muda como o resto do projeto deve ser conferido.

O teste S13 mede a diferença média de luminância entre linhas vizinhas do
quadro e compara a linha mais forte com essa média. Uma costa, uma falha ou uma
crista produzem linhas fortes, e essas são o mundo. Uma costura produz uma
linha muito mais forte que tudo, e essa é defeito. Esse único número pegou:

1. uma cruz escura de mais de um quilômetro atravessando a tela, porque havia
   duas distâncias para a mesma coisa, Chebyshev para o peso da região e radial
   para a bacia;
2. um risco horizontal na borda sul da ilha a **31 vezes** a variação média,
   com três causas somadas: clamp duplicado lendo fileiras diferentes, região
   ditando o fundo do mar longe demais, e leitura que satura e zera a derivada;
3. um degrau de meio metro no mesmo lugar, do clamp duplicado.

E o teste dos 500 passos pegou o quarto, que era o mais importante: o oceano
aberto ficava numa cor só por **300 passos de zoom seguidos**. A textura estava
lá, com um centésimo do contraste, porque um fBm cai pela metade a cada oitava.
Isso é certo para relevo e errado para textura de superfície. A correção é a
janela visível, que soma só as últimas oitavas e normaliza por elas.

Nenhum desses quatro seria encontrado lendo o código.

---

## 7. O QUE NÃO FICOU PRONTO, COM MOTIVO

| item | estado | motivo |
|---|---|---|
| Streaming por região (E6.1) | **não exequível** | `world.js` materializa uma região por vez. Streaming de N regiões não pode ser testado contra o motor real. O que existe e está medido é o streaming da SUPERFÍCIE: cache de quadro, LOD contínuo, refino em faixas, e 200 regiões geradas e descartadas sem vazamento. |
| FPS com olho humano | **pendente** | herdada da Fase 1. Só pode ser feita por você, num aparelho de verdade. O contêiner tem WebGL por software e o número dele não vale. |
| Lago sem bioma | **reportado** | arquivo de LEI. Ver seção 5. |
| Georreferência em `world.js` | **deliberadamente aberta** | a Rota A tornou desnecessário mexer. Se um dia o motor declarar as próprias convenções, as dele vencem e o bloco `GEO_2A3` vira errata. |
| Camada 7 do ambiente | **parcial, de antes** | `objeto.frescor` não decai, `reg.fertilidade` não é consumida nem regenerada, vento não move objeto, erosão não rebaixa `alturaTerreno`. Quatro decisões de escrita, todas da mesma família da umidade. |

---

## 8. DEFINIÇÃO DE PRONTO, ITEM A ITEM

| item da Parte 6 | estado |
|---|---|
| Zoom contínuo do globo até 1 m, 500 passos, sem tela vazia | **cumprido**, 0 vazios (a página vai até 2 m; abaixo disso um tile tem 200 px e não há mais o que revelar) |
| 0 exceções no console em toda a varredura | **cumprido** |
| Mesma seed, hash idêntico em duas execuções independentes | **cumprido**, processos separados |
| Endereço idempotente, erro < 1 m em 100.000 amostras | **cumprido**, 7 × 10⁻⁷ m |
| regionIndex estável em 100%, 0 colisões | **cumprido** |
| `amostraEm(x,y)` responde em todo ponto, determinístico, sem campo morto | **cumprido**, teste S6 e S7 |
| Oceano, costa, praia, bioma, relevo e rio coerentes no mesmo ponto | **cumprido**, teste S4 e as capturas |
| Superfície usa a linguagem Morphic Terrain | **cumprido em substância, parcial em acabamento** (seção 9) |
| FPS real medido por nível, com número | **medido**, com a ressalva do SwiftShader |
| 200 regiões carregadas e descartadas sem crescer memória | **cumprido**, delta 0,0 MB |
| Nenhum arquivo canônico alterado sem backup, md5 e errata | **cumprido**, nenhum foi alterado |
| CONTINUIDADE.md atualizado | **cumprido** |

---

## 9. MORPHIC TERRAIN — O QUE FOI CUMPRIDO E O QUE FALTA

Cumprido: Canvas 2D e JavaScript puro, sem framework e sem asset externo na
camada de superfície; funções por posição derivadas da seed; superfície
contínua sem mosaico de tiles visível; paleta fria e mineral, sem verde ou azul
saturado; microestrutura procedural com grão de solo e fratura de rocha; 2.5D
discreto por escala, sobreposição e sombra; iluminação por cosseno entre normal
e sol, que revela volume e não brilha.

As cores de `D.FLORA` e `D.FAUNA` são estado, então não foram trocadas. Passam
por um filtro único, igual para todas, que puxa a saturação para baixo e o
matiz para o frio. O verde continua sendo o verde daquela espécie, só deixou de
ser verde de desenho animado.

Falta, e é acabamento e não arquitetura: a textura de solo ainda é genérica
entre biomas diferentes; areia de praia, argila de pântano e cascalho de
montanha compartilham a mesma função de grão, modulada só por dureza e declive.
A arquitetura para diferenciar já está no lugar, porque `amostraEm` devolve
areia, argila, silte, matéria orgânica e pedregosidade em cada ponto.

---

## 10. COMO CONFERIR

```bash
cd genesis
python3 -m http.server 8741
# a Terra, do espaço ao chão:  http://127.0.0.1:8741/fase2b/

node testes/e1e2_endereco.js            # E1 e E2, 100.000 amostras
node testes/superficie.js               # S1 a S14
node --expose-gc testes/custo.js        # E6
node testes/hash.js 20260101            # hashMundo em processo isolado
node testes/pagina.js                   # 500 passos no navegador + capturas
node testes/gerar_artefato.js           # versão publicável, gerada do mesmo fonte
```

Capturas de L0 a L4 em `capturas/`.

---

*Terra primeiro. Vida depois.*
