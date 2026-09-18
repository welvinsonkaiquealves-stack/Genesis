# GÊNESIS DIGITAL · FASE TERRA
# RELATÓRIO DAS CAMADAS 1 A 6

Data: 2026-09-12
Entregue: `v2/core/ambiente.js` (contrato `genesis.ambiente/1`) e `fase2b/index.html`
Escopo: ambiente físico, químico e biológico. Sem cérebro, sem corpo, sem evolução.

---

## 1. SITUAÇÃO

A Terra tem agora duas escalas e seis camadas de estado, nenhuma delas decorativa.

| camada | situação | onde se vê |
|---|---|---|
| 1. Planeta | fechada | mapa planetário, 7 campos |
| 2. Oceano | fechada | salinidade, densidade, corrente, onda, temperatura |
| 3. Atmosfera | fechada | pressão, campo de vento, umidade do ar |
| 4. Ciclo da água | fechada, com a escrita autorizada | evaporação, drenagem, escoamento |
| 5. Solo e materiais | fechada | textura, matéria orgânica, capacidade de campo, densidade dos materiais |
| 6. Física do ambiente | fechada | arrasto, flexão da planta, erosão, partículas |
| 7. Ilha detalhada | **parcial** | ver seção 7 |
| 8. Integração | fechada | 18 testes, Node e Chromium |

Nenhum arquivo de LEI foi tocado. O `git status` não mostra nenhum arquivo
rastreado modificado: só entraram arquivos novos.

---

## 2. O QUE A AUDITORIA ENCONTROU E O QUE FOI FEITO COM ISSO

### 2.1. O ciclo da água não fechava, e agora fecha

Medido antes: a chuva somava umidade e nada nunca a removia. Busca por
`evapor`, `escoa`, `infiltr`, `drenag` no `world.js`: zero ocorrências. Em sete
dias de mundo, 11.316 das 25.600 células saturavam.

Medido depois, com os dois mundos rodando lado a lado a partir da mesma seed:

```
                        t = 0      7 dias SEM ambiente    7 dias COM ambiente
umidade média           0,6382     0,7823                 0,6398
células saturadas        2.012     11.316                  4.815
```

A ilha parou de afogar. A evaporação média fica em torno de 2 mm/dia com sol e
passa de 3 mm/dia em vendaval, que é a faixa real de uma ilha tropical ventilada.

**Como a água sai**: evaporação pelo termo aerodinâmico do método de
Penman-Monteith na forma da FAO-56, limitada pela água disponível acima do ponto
de murcha; e drenagem do que passa da capacidade de campo, descendo pelo
gradiente do terreno com vazão à la Manning, mais rápida em solo arenoso que em
argiloso. O que chega ao mar ou ao rio sai do sistema.

**Como a água volta**: pelo `world.js`, e só por ele. A primeira execução do
teste A14 mostrou a umidade subindo **mais** com o ambiente ligado, porque o
módulo estava somando chuva ao solo que o motor já somava. A chuva do ambiente
virou campo de diagnóstico orográfico, com barlavento molhado e sotavento seco,
e não toca no solo. O motor é dono do que devolve água; o ambiente é dono do que
a tira.

### 2.2. O oceano deixou de ser textura

Antes: 8.328 tiles com bioma `oceano` e nenhum campo de estado. A profundidade
existia só implícita, na altitude negativa.

Agora, nas 8.957 células com água da ilha:

```
salinidade    19,26 a 35,00 g/kg   (cai na foz e na costa rasa, onde entra água doce)
densidade   1013,21 a 1028,44 kg/m³ (água do mar real: 1020 a 1030)
temperatura  termoclina simplificada, cai 0,22 C por metro de profundidade
corrente     deriva de ~3% do vento, defletida 45°, freada em água rasa
onda         Sverdrup-Munk-Bretschneider, arrebenta a 1,3 vez a profundidade
```

A densidade sai de uma equação de estado linearizada em torno de 35 g/kg e 15 C,
não de um número escolhido para o efeito ficar bom.

No planeta há a mesma estrutura, com salinidade máxima nos cinturões
subtropicais onde a evaporação supera a chuva, e mínima no equador e nos polos.

### 2.3. O vento virou campo

Antes: `m.clima.vento = {x: 0.9969, y: -0.0787}`, módulo exatamente 1. Um vetor
normalizado, mais uma intensidade global. Um único vento para 25.600 tiles.

Agora: 599 velocidades distintas sobre a mesma ilha, entre 0,13 e 0,78 m/s com
sol, e entre 0,02 e 4,83 m/s em vendaval.

**A autoridade não mudou.** O vetor e a intensidade continuam vindo do
`world.js`. O que se acrescenta é estrutura espacial, e cada termo tem razão
física: o escoamento contorna a encosta em vez de subi-la, a crista acelera, o
vale abriga, a floresta freia muito mais que a areia (rugosidade de 0,60 contra
0,06), e a brisa entre mar e terra nasce da diferença de temperatura medida
entre as duas superfícies, com sinal que inverte sozinho entre dia e noite.

A pressão, que não existia em nenhum ponto do motor, agora existe por célula,
pela fórmula barométrica com altura de escala de 8.400 m.

### 2.4. Materiais sem gravar nada nos objetos

O `world.js` dá aos objetos `massa` e `tamanho`. Não dá densidade, material nem
atrito, e não posso acrescentar campos aos objetos dele.

A saída foi derivar em vez de gravar: uma tabela de 14 materiais com densidades
reais (granito 2650, madeira 650, osso 1900, metal 7800 kg/m³), um mapa de tipo
para material usando os próprios nomes do motor, e `materialDe(objeto)` que
devolve densidade, volume, peso e área frontal calculados a partir da massa que
o motor já tem. Nada é escrito no objeto.

Um tipo que não está no mapa devolve `conhecido: false` com o motivo por escrito,
em vez de receber um material inventado.

### 2.5. A planta responde ao vento por medida

O tronco é tratado como viga engastada de seção circular sob carga no topo:

```
I = π·d⁴/64          k = 3·E·I/L³          δ = F/k          f = (1/2π)·√(k/mef)
```

com E de 10 GPa (madeira verde), massa vinda do volume real do tronco e da copa
multiplicado pela densidade da madeira da tabela, e massa efetiva de 0,24·m, que
é o valor correto para uma viga engastada com massa distribuída.

Em vendaval, medido:

```
pinheiro  h 25,60 m  d 0,500 m   F 23,8 N   massa 7826 kg   δ 4,3 mm   f 0,27 Hz
bambu     h  7,52 m  d 0,090 m   F  2,4 N   massa  212 kg   δ 10,6 mm  f 0,34 Hz
```

Árvores reais oscilam entre 0,2 e 0,5 Hz. O modelo cai dentro da faixa sem ter
sido ajustado para isso. A deflexão de milímetros também está certa: um tronco de
meio metro praticamente não entorta com 4 m/s de vento. Quem balança visivelmente
é a copa, e a amplitude que o render deve usar é essa, não uma escolhida.

Há também a tensão de flexão na base contra os 50 MPa de resistência da madeira
verde, que é o critério de quebra, e o desprendimento do fruto por comparação
entre a força de arranque e a resistência do pedúnculo, que enfraquece com a
maturidade.

### 2.6. Solo com propriedades de solo

Textura em fração de areia, silte e argila, somando exatamente 1 em todas as
25.600 células. Derivada do que o mundo já afirma: encosta íngreme perde fino e
fica arenosa, baixada acumula argila, praia é areia, e a matéria orgânica segue a
fertilidade que o `world.js` sorteou.

Capacidade de campo e ponto de murcha por função de pedotransferência, e a água
disponível é a diferença entre os dois. Classe textural pelo triângulo do USDA.
Distribuição na ilha: arenosa 18.227, argilo-arenosa 4.172, franco-arenosa 2.758,
argilosa 420, franca 23.

Nenhum código Munsell foi fabricado.

---

## 3. O PLANETA

Grade equirretangular de 360 por 180, uma célula por grau, campos 2D.

A elevação é avaliada na **direção 3D** do ponto na esfera, usando ruído 3D
construído sobre o `U.hash3i` do próprio motor. Ruído 2D sobre lat/lon costura
mal: deixa emenda em ±180 e esmaga os polos. As placas continentais são bolhas
por distância angular, o que é exato na esfera por construção.

Estatísticas **ponderadas por área** (`cos lat`), porque numa grade
equirretangular contar célula por célula infla os polos e daria uma fração de
terra falsa:

| seed | oceano | ilha em | elevação | terra? |
|---|---|---|---|---|
| 20260101 | 76,0% | -19,53 , 31,59 | 15,0 m | sim |
| 20260102 | 76,4% | -27,40 , 105,68 | 14,7 m | sim |
| 777 | 72,9% | 14,91 , -158,29 | 16,6 m | sim |
| 12345 | 73,1% | 38,38 , -65,70 | 14,0 m | sim |

A Terra real tem 71% de oceano. O planeta fica entre 73% e 76% em qualquer seed,
e a ilha cai em terra em todas.

### A âncora, e por que ela é restrição e não invenção

O `world.js` sorteou lat -19,53 e lon 31,59 para a Ilha Gênesis. Um gerador de
massas de terra que colocasse oceano ali criaria uma ilha com rio, montanha e
floresta boiando no meio do mar do mapa. Então uma das placas continentais é
ancorada nessa direção, e o teste A2 verifica que a célula é terra.

Duas coisas daquela célula vêm do motor, não do modelo:

- **elevação**: o pico real do terreno da região, 15,0 m. Sem isso a placa
  ancorada fazia uma cordilheira de 5,2 km e a ilha tropical ficava a -12,9 C.
- **chuva**: a média do peso de chuva dos biomas que o motor sorteou para os
  25.600 tiles, 4,62 mm/dia ou 1.686 mm/ano. A latitude -19,5 cai no cinturão
  subtropical seco, e o modelo climático genérico daria 0,06 mm/dia. O motor diz
  que a ilha é floresta tropical com rio perene. Onde há conflito, o motor vence.

### A lacuna da fase 2A não bloqueou, e o motivo é escala

O erro de âncora de ±556 m vale 0,5% de uma célula planetária de 1 grau, que mede
cerca de 111 km. A ilha de 160 m é sub-pixel em qualquer mapa planetário.

Por isso a ilha entra como **ponto**, honestamente. O que continua impossível é
o contrário: descer do planeta para o tile, porque aí faltam âncora, orientação e
raio de referência. A costura entre as duas escalas continua sendo lacuna
declarada, e o planeta não precisa dela para existir.

---

## 4. ESCALA E DESEMPENHO

O projeto é 2D por decisão, e a decisão foi respeitada em todo lugar:

- Um `Float32Array` por propriedade. Nenhum objeto por célula.
- Partículas são **campo de densidade advectado**, não objetos. O custo é
  O(células) e não O(partículas): soltar dez ou dez mil partículas custa igual.
- O caminho de descida da água e o declive são pré-computados uma vez, porque o
  relevo é imutável e o teste A16 prova que o ambiente nunca o altera. O
  escoamento e a erosão deixaram de varrer 9 vizinhos por célula a cada passo.
- A rugosidade aerodinâmica por célula é pré-resolvida a partir do bioma, o que
  tirou uma busca por string do laço mais quente.
- Água e terra têm listas de índices próprias: o oceano não varre terra.

Medido:

```
passo do ambiente (25600 células)   2,4 ms
passo do motor em modo rápido       0,5 ms
orçamento a 60 fps                 16,7 ms
passos de ambiente por quadro           7
```

Essas duas otimizações cortaram o passo de 4,7 ms para 2,4 ms. O ambiente roda em
passo próprio e pode ser chamado com frequência menor que o motor, que é a
atualização em lotes pedida na seção 10 do briefing.

---

## 5. TESTES

Node 18/18. Chromium 18/18. Zero falhas, zero N/A, zero erros de console.

| id | o que prova |
|---|---|
| A1 | oceano e continentes em proporção plausível, ponderado por área |
| A2 | a coordenada que o motor sorteou cai em terra |
| A3 | `dirDeLatLon` local idêntico ao da fase 1, diferença exata zero |
| A4 | mesma seed dá o mesmo ambiente bit a bit; outra seed dá outro |
| A5 | criar e passo não chamam `Date.now` nem `Math.random`, medido por interceptação |
| A6 | o vento virou campo, com 599 velocidades distintas |
| A7 | pressão cai com a altitude e fica em faixa física |
| A8 | oceano com profundidade, salinidade, densidade e onda |
| A9 | textura soma 1 em todas as células; murcha sempre abaixo da capacidade |
| A10 | materiais derivados da massa do motor, sem gravar nada no objeto |
| A11 | arrasto real, diferente por posição |
| A12 | fruto maduro desprende mais fácil que fruto verde |
| A13 | partículas como campo agregado |
| A14 | **o ciclo da água fecha e a ilha para de afogar** |
| A15 | o mutator pode ser desligado e o motor fica intocado |
| A16 | além da umidade, o ambiente não toca em nada do motor |
| A17 | custo por passo dentro do orçamento |
| A18 | a fase 2A continua passando e o endereço não muda |

Os testes A14 e A1 falharam na primeira execução, e as duas falhas eram reais:
a dupla contagem de chuva e um planeta com 98% de terra porque as placas tinham
raio angular de até 153 graus. Estão descritas nas seções 2.1 e 3.

---

## 6. ARQUIVOS

### Criados

| arquivo | md5 | linhas |
|---|---|---|
| `v2/core/ambiente.js` | `2f0517af67aa6496876edcc9efcaf074` | 1703 |
| `fase2b/index.html` | `5ae680611cbb161d278d2d3e601dc1a2` | 569 |
| `AUDITORIA_AMBIENTE.md` | auditoria da etapa 1 | |
| `RELATORIO_TERRA.md` | este arquivo | |

### Preservados (LEI), md5 conferido

```
a5a62e6da602c23e088b1181a44537e5  fase1/terra.js
9bcab37469b0217778317efcd2e162a3  v2/core/world.js
0bf52b6f8d5e4bc1c6a0d876ca055cc4  v2/core/util.js
5151abaf008677d3e6518c65c7bd516c  v2/core/data.js
a65aad160e01ee11edf39591cc3a8d67  v2/core/brain.js
eb8549863a97355411c3259a3f93b8e1  _build/three.min.js
```

Todos `OK`. A fase 2A também ficou intocada nesta etapa.

### A única escrita em estado de LEI

`aplicarUmidadeNoSolo(reg, delta)`. Uma função, doze linhas, que soma os deltas
em `reg.umidade` com o mesmo clamp do motor e devolve quantas células mudaram.
Autorizada por você em 2026-09-12. Desligável com `{ escreverUmidade: false }`, e
o teste A15 prova que desligada o motor fica bit a bit intocado.

Continua existindo **uma** umidade no mundo. O módulo é um segundo escritor, não
uma segunda fonte de verdade.

---

## 7. O QUE FALTA PARA A TERRA ESTAR CONCLUÍDA

A camada 7 do plano, vegetação e recursos detalhados da ilha, está **parcial**, e
é honesto dizer onde ela para.

**Feito**: a planta responde ao vento por medida, o fruto desprende por força, o
solo tem água disponível e estresse hídrico por célula, os materiais têm
densidade e volume reais, e a matéria orgânica existe e é levada pela erosão.

**Não feito, e cada um esbarra no mesmo lugar**: decomposição, consumo de
nutrientes pelas raízes, ciclo de vida vegetal completo e propriedades gravadas
nas plantas e objetos exigem **escrever nas entidades do `world.js`**, que é
onde `frescor`, `crescimento`, `q`, `fertilidade` e `integridade` vivem. Hoje o
ambiente lê tudo isso e não escreve em nada além da umidade.

São quatro decisões da mesma família da que você tomou hoje, e elas ficam para a
próxima conversa:

1. **Decomposição**: `frescor` existe em 68 objetos e nunca decai. Fazer a
   matéria orgânica apodrecer e devolver nutriente ao solo exige escrever em
   `objeto.frescor` e em `reg.fertilidade`.
2. **Nutrientes**: `fertilidade` é um campo que ninguém consome nem regenera.
   Fechar esse ciclo exige escrever nele.
3. **Vento agindo de fato nas plantas e objetos**: hoje o ambiente calcula a
   força; quem move objeto é a `fisicaObjetos` do motor, que lê o vento global.
   Para o vento local agir, ou o motor passa a ler o campo, ou o ambiente passa a
   escrever em `objeto.pos`.
4. **Erosão rebaixando o relevo**: o sedimento já é contabilizado, mas
   `alturaTerreno` é do motor e continua estática por decisão minha.

Minha recomendação é a mesma que funcionou hoje: um mutator por ciclo, declarado,
desligável e com um teste que prove o efeito medido antes e depois. Mas é
decisão sua, e não vou tomá-la sozinho.

---

## 8. PRÓXIMO PASSO RECOMENDADO

Fechar a camada 7 com as quatro decisões acima, o que completa a Terra como
ambiente e deixa a ilha pronta para ser o laboratório da vida.

Depois disso, e só depois, o cérebro dos NPCs.

A decisão de georreferência no `world.js` continua aberta, mas agora é possível
dizer com precisão o que ela bloqueia e o que não bloqueia: ela **não** bloqueia
nada do ambiente dentro da ilha, e **não** bloqueou o planeta. Ela bloqueia
apenas a costura entre as duas escalas, ou seja, uma segunda região e qualquer
continuidade geográfica real entre elas.
