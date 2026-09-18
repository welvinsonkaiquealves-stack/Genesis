# GÊNESIS DIGITAL · FASE TERRA
# AUDITORIA DO AMBIENTE ATUAL (etapa 1 de 12.METODOLOGIA)

Data: 2026-09-12
Escopo executado: auditoria medida do que o motor já simula. Nenhum arquivo alterado.
Escopo não executado: nenhuma camada nova, nenhuma implementação.

Método: o motor foi executado em Node, não apenas lido. Sete dias de mundo foram
simulados para medir comportamento, não intenção.

---

## 1. A DESCOBERTA PRINCIPAL

Boa parte do que a seção 3 pede já existe no `world.js`, e o `world.js` é LEI.
Isso muda a natureza da tarefa: **não é construir um ambiente do zero, é
descobrir onde ele para e estender a partir dali sem duplicar nada.**

O que já existe e funciona, medido na seed canônica:

| sistema | estado real |
|---|---|
| relevo | `alturaTerreno` de -63,98 m a +15,04 m. A batimetria do oceano já existe como altitude negativa |
| biomas | 8 tipos presentes na ilha: oceano 8328 tiles, floresta 8851, montanha 4367, tropical 2080, savana 1076, praia 654, prado 130, rio 114 |
| solo | `umidade`, `fertilidade`, `temperatura` como campos por tile, todos Float32Array de 25600 |
| água | `prof`, `aguaZ`, `rio`, `lagos`. Rios nascem no ponto mais alto e descem por gradiente |
| clima | 10 tipos, estações, ciclo dia/noite, chuva molhando o solo, transições estocásticas |
| temperatura ambiente | `tempAmbiente(x,y)` combina terreno, estação, hora, clima e noite |
| física | gravidade 9,81, queda, quique com restituição 0,28, arrasto no ar, balística de arremesso |
| vento sobre objetos | objetos com massa < 0,4 kg são empurrados; é o que faz folha voar |
| plantas | idade, crescimento, qualidade, frutos, folhas, fruto que cai por gravidade, seca que mata |
| fogo | combustível que queima e chuva que apaga mais rápido |
| espacialização | grade de consulta de 8 m, reconstruída a cada 20 ticks |
| LOD | modo rápido: animais em 5 fatias, plantas a cada 4 ticks, física real só a 55 m da câmera |

A arquitetura de escala que a seção 10 pede, portanto, **já começou**. Não é
preciso inventá-la, é preciso estendê-la.

---

## 2. ONDE O AMBIENTE PARA (medido, não suposto)

### 2.1. O ciclo da água não fecha. A ilha está afogando.

Simulei sete dias do mundo e medi a umidade do solo antes e depois:

```
umidade t=0   média 0,6382   min 0,102   max 1,000
umidade t=7d  média 0,7823   min 0,102   max 1,000
tiles saturados (>= 0,99): 11.316 de 25.600  (44%)
```

A chuva adiciona umidade. Nada nunca a remove. Busca por `evapor`, `escoa`,
`infiltr` e `drenag` no `world.js`: zero ocorrências. A umidade é monotonicamente
não decrescente, então o solo satura e fica saturado para sempre. Em escala de
meses, a ilha inteira vira pântano numérico, e como o crescimento das plantas lê
`umidade`, a biologia inteira deriva junto.

Este é o defeito mais grave do ambiente atual, e é exatamente o que a seção 4
("ciclo da água") e a seção 6 ("retenção de água") pedem para resolver.

### 2.2. O oceano é bioma, não corpo d'água

8328 tiles têm bioma `oceano`, mas `prof` maior que 0,02 existe em apenas 235
tiles, todos de rio e lago. O mar que cerca a ilha tem cor, temperatura base e
fauna associada, e tem profundidade implícita na altitude negativa, mas não tem:

salinidade, densidade, corrente, onda, temperatura por profundidade, evaporação,
troca com a atmosfera. Nenhum desses campos existe em lugar nenhum.

Confirma a seção 4 ao pé da letra: hoje ele é uma textura azul com metadados.

### 2.3. O vento é um vetor só para os 25.600 tiles

```
m.clima.vento = { x: 0.9969, y: -0.0787 }     módulo 1,000000
```

É direção normalizada e nada mais. A intensidade vem do tipo de clima
(`D.CLIMAS[tipo].vento * intensidade`, 2,746 m/s no momento medido) e também é
global. Não existe campo de vento por tile, não existe circulação, não existe
advecção, e **pressão não existe em nenhum ponto do motor**.

Consequência direta para a seção 7: uma árvore não tem o que ler para balançar de
forma diferente de outra árvore. Hoje todas balançariam igual, porque o mundo só
sabe um vento.

### 2.4. Objetos têm massa e tamanho, e só

```
pedra: id, classe, tipo, nome, pos, vz, vx, vy, massa, tamanho, cor, visual,
       emRepouso, emVoo, empunhado, noChao, conteudo, integridade, qualidade,
       dono, criadoEm, percepivel, som, aceso
```

Ausentes: densidade, material, composição, atrito, dureza efetiva,
condutividade térmica. A seção 8 pede exatamente isso. `D.BIOMAS` tem `dureza`
por bioma, mas nenhum objeto tem material próprio.

### 2.5. Decomposição existe como campo e não como processo

68 objetos nascem com `frescor: 1`. Nenhuma linha do `world.js` decrementa
`frescor`. Matéria orgânica não apodrece, não devolve nutriente ao solo, e
`fertilidade` é um campo que ninguém consome nem regenera.

### 2.6. A temperatura do terreno não é uma temperatura

```
reg.temperatura  min 21,24   max 69,99   média 31,07
```

`tempAmbiente` usa esse valor como `b * 0,55 + ...`, ou seja, ele é um número
base de sintonia, não graus Celsius calibrados. Não é um bug, mas é importante
saber antes de acoplar qualquer troca de calor a ele: hoje ele não fecha
dimensionalmente.

### 2.7. Não existe escala planetária

`m.planeta.regioes` tem exatamente um elemento: 160 m por 160 m. Oceano global,
massas de terra, relevo continental, circulação planetária: nada disso existe, em
nenhuma forma, nem como dado nem como rascunho.

---

## 3. PERFORMANCE, BASELINE MEDIDO

```
passoMundo normal   1,161 ms por passo
passoMundo rápido   0,268 ms por passo
entidades           1.461  (2 NPCs, 106 animais, 900 plantas, 440 objetos)
orçamento a 60 fps  16,7 ms por quadro
```

Sobra folga, mas não é infinita: cerca de 14 vezes o custo atual. Qualquer campo
novo varrido sobre 25.600 células a cada passo precisa custar menos de 0,1 ms,
ou entra em passo próprio, mais lento que o passo das entidades. Isso é uma
restrição de projeto, não um detalhe de otimização.

---

## 4. O PROBLEMA ARQUITETURAL QUE ISSO CRIA

Tudo que as seções 4 a 9 pedem é **estado novo**. Estado é o que o `world.js`
possui, e o `world.js` é LEI. Existem três saídas, e elas não são equivalentes.

**A. Módulo novo `v2/core/ambiente.js`, dono apenas do que não existe.**
Ele lê o `world.js`, acrescenta os campos ausentes (salinidade, corrente, onda,
pressão, campo de vento, minerais, matéria orgânica, erosão) e roda num passo
próprio, chamado logo depois de `W.passoMundo`. Nenhum arquivo de LEI muda.

O preço: para o ciclo da água fechar, alguém precisa **baixar** `reg.umidade`,
que é um array do `world.js`. Então `ambiente.js` passa a escrever num array de
LEI, por um mutator único, declarado e testado. Não vira segunda fonte de verdade,
porque continua existindo uma só umidade. Vira um segundo escritor.

**B. Emendar o `world.js`.**
Honesto quanto à propriedade, e permite hospedar os campos novos junto dos
antigos. O preço é mexer na LEI, com tudo que o protocolo exige, e num arquivo de
2.499 linhas que hoje está validado.

**C. `ambiente.js` assume todo o ambiente e trata o `world.js` como condição
inicial.**
Arquiteturalmente limpo no papel e perigoso na prática: `umidade`,
`temperatura` e `clima` passariam a existir nos dois lugares, que é precisamente
a segunda fonte de verdade que o projeto proíbe. Não recomendo.

Minha recomendação é **A**, com o mutator de `reg.umidade` explicitado e testado,
e a decisão sobre a opção B adiada até que o ciclo da água prove que precisa de
mais do que um campo escrito de fora.

---

## 5. A BOA NOTÍCIA SOBRE A LACUNA DE GEORREFERÊNCIA

A Fase 2A parou por falta de precisão, âncora, orientação e raio de referência.
Isso **não bloqueia** a escala planetária, e vale entender por quê.

O erro da âncora é de ±556 m. Numa grade planetária de 1 grau, uma célula mede
cerca de 111 km. O erro é 0,5% de uma célula. A ilha inteira, com seus 160 m, é
sub-pixel em qualquer mapa planetário razoável.

Ou seja: **a ilha pode ser colocada no planeta como um ponto, honestamente.**
O que continua impossível é o contrário, descer do planeta para o tile, porque aí
faltam a âncora e a orientação. A costura entre as duas escalas continua sendo
uma lacuna declarada, e o planeta não precisa dela para existir.

Há uma restrição que nasce daí e que precisa ser respeitada desde a primeira
linha: o `world.js` sorteou lat -19,53 e lon 31,59 para a ilha. Qualquer gerador
de massas de terra **tem de colocar terra nessa coordenada**, senão o mundo se
contradiz: uma ilha com rio, montanha e floresta boiando no meio do oceano do
mapa. Isso é uma restrição derivada do dado canônico, não uma invenção.

---

## 6. ORDEM DE CONSTRUÇÃO PROPOSTA

Seguindo a seção 12, com o que a auditoria mostrou:

| camada | o que entra | precisa de LEI? |
|---|---|---|
| 1. Planeta | grade planetária, oceano global, massas de terra, relevo continental, ancorado no ponto da ilha | não |
| 2. Oceano | profundidade, salinidade, densidade, temperatura por profundidade, corrente, onda | não |
| 3. Atmosfera | pressão, campo de vento derivado do vetor global, circulação, precipitação | não |
| 4. Ciclo da água | evaporação, infiltração, escoamento, retenção. **Fecha o defeito 2.1** | escreve em `reg.umidade` |
| 5. Solo e materiais | composição, minerais, matéria orgânica, densidade, atrito, erosão | não |
| 6. Física | troca de calor, transporte de partículas, vento por tile agindo em objetos | não |
| 7. Ilha detalhada | vegetação com propriedades, pedras e recursos com material, decomposição | provável |
| 8. Integração | testes, determinismo, desempenho, LEI intacta | não |

Cada camada com teste próprio em Node, medição de custo por passo, e verificação
de que a Fase 1 e a Fase 2A continuam passando.

---

## 7. O QUE PRECISO DECIDIDO ANTES DE ESCREVER A PRIMEIRA LINHA

1. **Onde mora o estado novo**: opção A, B ou C da seção 4.
2. **Autorização para o mutator de `reg.umidade`** na camada 4, sem o qual o
   ciclo da água não fecha e o defeito 2.1 permanece.

Nada mais está bloqueado. As camadas 1, 2, 3, 5 e 6 podem ser construídas sem
tocar em nada protegido, assim que a opção da seção 4 estiver escolhida.
