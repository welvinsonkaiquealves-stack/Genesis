# GÊNESIS DIGITAL · PLANO DE AUDITORIA DO MUNDO

Data: 2026-09-18
Documento de entrada. Define **como** decidimos o que o Gênesis constrói,
o que ele importa e o que ele recusa.

Este plano não implementa nada. Ele estabelece os critérios que tornam a
decisão seguinte defensável. Auditoria que começa olhando candidatos sempre
termina racionalizando o mais bonito.

---

## 0. A PERGUNTA QUE ESTA AUDITORIA RESPONDE

Não é *"qual engine open source usamos?"*.

É: **"que parte do Mundo Gênesis não precisa ser escrita do zero, sem que o
motor perca a autoridade única sobre a verdade?"**

A diferença importa. A primeira pergunta aceita qualquer resposta bonita.
A segunda tem critério de reprovação.

### O que esta auditoria NÃO é

- Não é busca de substituto para o `superficie.js`. A superfície está FECHADA,
  com contrato `genesis.superficie/1` e 14 testes. Trocá-la seria descartar
  trabalho validado e criar a segunda fonte de verdade que as regras
  permanentes do projeto proíbem.
- Não é busca de renderizador. O Gênesis não tem problema de renderização
  pendente: 500 passos do espaço ao chão, 0 quadros vazios, 0 exceções.
- Não é adoção de universo/sistemas estelares. Os NPCs vivem em 160 × 160 m
  de uma ilha. Universo interestelar é cenário, não lei, e resolve um problema
  que o projeto ainda não tem. "Terra antes de vida, vida antes de mente."

### O que esta auditoria É

A busca pela **camada que falta de verdade**: matéria, geologia, química,
termodinâmica e transformação — a ponte entre o planeta (pronto) e os seres
vivos (não iniciados).

---

## 1. O DIAGNÓSTICO QUE MOTIVA O PLANO

### 1.1 A contradição dentro do `data.js`

O `data.js` contém, hoje, duas coisas incompatíveis como lei:

```
MATERIAIS   → propriedades  → o mundo permite o que a física permite   (emergência)
RECEITAS    → lista fixa    → o mundo permite o que foi antecipado     (jogo)
```

Enquanto `RECEITAS` for lei do universo, **nenhum NPC pode inventar nada**.
Ele só executa o catálogo que já escrevemos. Isso encerra o projeto antes da
fase de cultura, ciência e tecnologia.

A inversão exigida pela filosofia do Gênesis:

> **O universo só tem física. A receita é conhecimento aprendido e mora na
> mente do NPC (`brain.js`), nunca na lei do mundo (`data.js`).**

Consequência formal: `data.js` e `brain.js` são arquivos de LEI. Esta inversão
exige parada, relatório com os cinco itens do protocolo, e autorização.
Está registrada aqui como **decisão pendente D1**, não como alteração feita.

### 1.2 O nível de abstração correto para "propriedades"

O objetivo declarado — que a árvore possa ser cortada como o NPC achar melhor,
que o minério forje arma, que a folha carregue água — **não exige átomos nem
fótons**. Uma árvore tem cerca de 10²⁹ átomos. Não é caro: é impossível, e é
o nível errado.

O que esses exemplos exigem é outra coisa:

| exigência do mundo | mecanismo real necessário |
|---|---|
| cortar como ele achar melhor | matéria **subdivisível recursivamente**, com conservação de massa |
| minério vira lâmina | **transformação por estado térmico**, com propriedades herdadas |
| folha carrega água | **conter = geometria côncava + impermeabilidade**, nunca uma flag |
| a ferramenta certa corta | **dureza relativa**, nunca `machado corta árvore` no código |
| fricção acende fogo | **energia → temperatura → `pontoTermico` → combustão → condutividade** |

A tabela `MATERIAIS` já injetada (14 substâncias, com densidade, dureza,
atrito, condutividade, `pontoTermico` e flag `organico`) **já é o nível de
abstração correto**. Não descer abaixo dela é uma decisão de engenharia, não
uma concessão.

### 1.3 Onde o projeto realmente está

| camada | situação real |
|---|---|
| planeta, geodésia, LOD, superfície contínua | **fechada e validada** |
| ambiente: clima, mar, solo, ar | **fechada**, 18 testes |
| **matéria: propriedades, transformação, química** | **inexistente** ← o gargalo |
| fisiologia, percepção, cérebro | não iniciado |
| cultura, sociedade, ciência | não iniciado |

O gargalo não é o planeta. É a matéria.

---

## 2. FASE 0 — SALVAR O PROJETO  *(bloqueia tudo)*

**O repositório `Genesis` está vazio. Nenhum commit existe.**

Todo o projeto — 25 arquivos, 16.008 linhas — existe apenas dentro do anexo
`genesis_terra_habitavel.txt`. Enquanto isso for verdade, não há baseline,
não há auditoria possível, e uma perda de anexo apaga o projeto inteiro.

Nenhuma outra fase começa antes desta.

| passo | ação | verificação |
|---|---|---|
| 0.1 | Reconstruir a árvore a partir do dump | 25 arquivos nos caminhos do índice |
| 0.2 | Conferir o md5 de cada arquivo | o dump traz o md5 por arquivo: verificação mecânica, não opinião |
| 0.3 | Conferir os 6 md5 de LEI contra o `LEIA-ME.txt` | os seis devem bater exatamente |
| 0.4 | Commit inicial: **originais intocados** | nenhuma modificação neste commit |
| 0.5 | Rodar a suíte em Node puro | `e1e2_endereco`, `superficie` (S1–S14), `custo`, `hash` |
| 0.6 | Conferir `hashMundo(20260101)` | deve dar `75ec72bc4eccad7c612b232d1b8cdcbb` |

**Critério de parada:** se o hash não bater, o dump não é fiel ao projeto
original e nada mais pode ser confiado. Paramos e investigamos.

As capturas `.png` (L0–L4) não estão no dump e são regeneráveis por
`node testes/pagina.js`. Não bloqueiam.

---

## 3. FASE 1 — A PROVA DE HABITABILIDADE  *(antes dos candidatos)*

Escrita **antes** de olhar qualquer engine. É a régua. Um candidato não é
julgado por beleza, estrelas no GitHub ou lista de features: é julgado por
quantos destes cenários ele consegue **expressar**.

Cada item é falsificável e vira teste de aceite permanente (série `H`).

### H1 · Subdivisão recursiva
Uma árvore é derrubada. O tronco é dividido em peças de dimensão **escolhida
em tempo de execução**, não de um catálogo. Cada peça é divisível de novo.
A massa total se conserva.
*Reprova se:* a árvore for item atômico de inventário, ou se as divisões
vierem de uma lista fixa.

### H2 · Dureza relativa
Cortar tem sucesso ou falha comparando `ferramenta.dureza` contra
`alvo.dureza` e a força aplicada. Nenhum lugar do código diz "machado corta
árvore".
*Reprova se:* existir qualquer par ferramenta→alvo escrito à mão.

### H3 · Transformação térmica
Minério de ferro atinge 1538 °C e funde; o produto **herda** as propriedades
do material e ganha a geometria da forja. Madeira a 300 °C queima. O calor se
propaga por `condutividade`.
*Reprova se:* "minério + fogo = lingote" for uma entrada de tabela.

### H4 · Conter é geometria, não categoria
Uma folha carrega água porque tem forma côncava e é impermeável o bastante —
a mesma regra que faz uma casca, um crânio ou um pote de cerâmica funcionarem.
*Reprova se:* existir flag `ehRecipiente` ou lista de recipientes válidos.

### H5 · Conservação
Massa e energia se conservam em toda transformação. Nada é criado do nada,
nada desaparece em silêncio.

### H6 · A receita não-nativa  ← **critério decisivo**
Um NPC produz um artefato para o qual **não existe entrada em `RECEITAS`**,
combinando verbos gerais sobre materiais reais.
*Reprova se:* impossível. Se o mundo só permite o que foi antecipado, ele é um
jogo, e a fase de ciência e tecnologia nunca acontece.

### H7 · Autoridade única
O terreno que o NPC pisa é bit-a-bit o mesmo que a tela desenha.
*Reprova se:* o candidato trouxer geração de terreno própria que não leia o
`world.js`. Este critério sozinho elimina todo engine de planeta visual.

### H8 · Determinismo
Mesma seed, mesmo hash, em processos separados. Sem `Math.random` em geração,
endereço ou geometria procedural.

---

## 4. FASE 2 — TRIAGEM: EXISTÊNCIA E LICENÇA  *(filtro barato e brutal)*

Executada **antes** de qualquer leitura de arquitetura. A maioria dos
candidatos morre aqui, e morrer aqui custa minutos.

### 4.1 Existência real

Os candidatos levantados vieram de pesquisa feita por um modelo de linguagem.
Nomes de repositório plausíveis estão entre as coisas que modelos mais
inventam. **Nenhum foi confirmado ainda.** Cada um precisa de: URL real,
último commit, número de contribuidores, e se o que o README promete aparece
no código.

Restrição de acesso desta sessão, registrada para honestidade do processo:
o acesso GitHub está limitado ao repositório do projeto, e a fonte da pesquisa
original (`chatgpt.com`) está bloqueada pelo proxy de egresso. Confirmar os
candidatos exige adicioná-los explicitamente ao escopo da sessão.

### 4.2 Triagem de licença

O Gênesis pretende compilar como aplicativo nativo. Isso torna a licença uma
questão de viabilidade, não de formalidade.

| licença | veredito | motivo |
|---|---|---|
| MIT, Apache-2.0, BSD, zlib | **aproveitável** | permite código e ideias, com atribuição |
| MPL, LGPL | **só como módulo isolado** | exige cuidado de fronteira |
| **GPL, AGPL** | **rejeitado para código** | viral: contaminaria o Gênesis inteiro |
| "All rights reserved", sem licença | **intocável** | repositório visível não é repositório licenciado |

Regra que vale para **todos**, inclusive os rejeitados:
**ler para aprender é sempre permitido; copiar é o que a licença governa.**
Um projeto GPL continua útil como leitura de algoritmo — e o que sai dessa
leitura é especificação escrita por nós, não trecho transplantado.

### 4.3 Saída da Fase 2

Uma tabela: candidato · existe? · licença · linguagem · vivo? · veredito.
Nada além disso. Sobreviventes seguem para a Fase 3.

---

## 5. FASE 3 — AUDITORIA ESTRUTURAL  *(só os sobreviventes)*

Para cada sobrevivente, um relatório curto respondendo exatamente isto:

1. **Qual camada ele resolve** — planeta, geologia, matéria, química, vida?
2. **Ele viola H7?** Traz fonte de verdade própria sobre o terreno? Se sim,
   só pode entrar como conhecimento, nunca como código.
3. **Quantos itens da Prova de Habitabilidade ele expressa?** (H1–H8, pass/fail)
4. **Custo real de porte** — de C#/OpenGL ou Rust/Bevy para Vanilla JS **não é
   porte, é reescrita**. O que atravessa é o algoritmo, não o arquivo.
5. **O que extraímos concretamente** — uma função de ruído? um modelo de
   tectônica? uma tabela de propriedades? um esquema de dados? Nomeie.
6. **O que teria que ser refeito de qualquer jeito.**

### Prioridade de investigação, corrigida pelo diagnóstico

| ordem | candidato | por que nesta posição |
|---|---|---|
| 1 | The Dark Candle | é o único que promete a camada que falta: tectônica → geologia → materiais → química. Licença supostamente permissiva. Modo headless conversa com nossa suíte em Node. |
| 2 | Pixeldarium | mesmo ambiente tecnológico (JS + WebGL2, sem build). Valor como **referência arquitetural**. Licença provavelmente proibitiva — leitura sim, código não. |
| 3 | NoMansTerrain | valor restrito a técnicas de ruído (erosão, ridges, domain warping). Nossa superfície já está fechada; entra só se houver ganho medível. |
| 4 | ProceduralTerrains | resolve o que já temos resolvido. Baixa prioridade. |
| 5 | DeepSpaceEngine / Pioneer | resolvem universo e sistemas estelares: um problema que o projeto ainda não tem. **Adiados, não descartados.** |

A inversão de prioridade em relação à pesquisa original é deliberada: os dois
projetos mais impressionantes resolvem a camada de que menos precisamos agora.

---

## 6. FASE 4 — A CAMADA DE MATÉRIA  *(o entregável real)*

O produto da auditoria **não é código importado**. É a especificação de
`v2/core/materia.js` — contrato `genesis.materia/1` — informada pelo que a
auditoria ensinou.

Posição na hierarquia de autoridade:

```
world.js      autoridade dentro da região
ambiente.js   autoridade de clima, mar, solo, ar
superficie.js autoridade fora da região e da ponte entre escalas
materia.js    autoridade de DO QUE as coisas são feitas e do que se pode fazer com elas
brain.js      autoridade do que o NPC SABE sobre tudo isso
```

`materia.js` nasce fora da LEI, como `ambiente.js` e `superficie.js`:
escrito nesta linhagem, alterável com relatório.

### 6.1 A forma do objeto material

```
objeto = {
  material : id da tabela MATERIAIS,
  forma    : { tipo, dimensoes[], volume, concavidade },
  estado   : { temperatura, integridade, umidade, massa },
  partes   : [ objeto, ... ]        // recursivo: é isto que satisfaz H1
}
```

`partes` recursivo é o que transforma "árvore" de item de inventário em
matéria divisível. É a diferença entre H1 passar e reprovar.

### 6.2 Os verbos gerais

Nenhum verbo conhece nomes de coisas. Todos operam sobre propriedades.

| verbo | governado por | satisfaz |
|---|---|---|
| `SEPARAR(alvo, ferramenta, plano)` | dureza relativa, força, geometria do corte | H1, H2 |
| `UNIR(a, b, meio)` | material, temperatura, adesão | H6 |
| `AQUECER(alvo, fonte, dt)` | condutividade, massa, `pontoTermico` | H3 |
| `DESGASTAR(alvo, contra, dt)` | atrito → energia → temperatura → faísca | H3 |
| `CONTER(recipiente, fluido)` | concavidade, permeabilidade, volume | H4 |
| `MOVER(alvo, força)` | massa, densidade, gravidade (inclui `antigravity`) | H5 |

Se um artefato só pode existir através de uma entrada de tabela, o verbo está
errado. Esse é o teste permanente de qualidade desta camada.

### 6.3 A migração de `RECEITAS`  *(decisão pendente D1)*

`RECEITAS` deixa de ser lei do universo e passa a ser conhecimento adquirido,
armazenado por NPC no `brain.js`. O mundo para de conter o catálogo do que é
possível; passa a conter apenas a física que decide o que funciona.

Sem isso, H6 é impossível e o projeto não alcança ciência nem tecnologia.
Com isso, dois arquivos de LEI são tocados — exige o protocolo completo.

---

## 7. REGRAS INVIOLÁVEIS DESTA AUDITORIA

Herdadas das regras permanentes do projeto, mais as que a auditoria acrescenta:

- **Importamos conhecimento, não código. Importamos algoritmo, não autoridade.**
- Nenhum arquivo de LEI é tocado sem parada, relatório de cinco itens e
  autorização explícita.
- Nenhum candidato entra trazendo geração de terreno própria (H7).
- Nunca uma segunda fonte de verdade. Nunca matemática geodésica paralela ao
  `terra.js`.
- Nunca `Math.random` em geração, endereço ou geometria procedural.
- Declarar lacuna é sempre preferível a fabricar precisão.
- Licença é verificada antes da arquitetura, sempre.
- Nenhuma fase começa antes da Fase 0 fechar.

---

## 8. DECISÕES QUE DEPENDEM DE VOCÊ

Nenhuma destas é dedutível do código. Todas bloqueiam alguma fase.

### D1 · A inversão de `RECEITAS`  *(bloqueia a Fase 4)*
Mover as receitas do `data.js` (lei) para o `brain.js` (conhecimento
aprendido). Toca dois arquivos de LEI. É a decisão que determina se o Gênesis
é simulação ou jogo. **Recomendação: aprovar** — sem ela, H6 é impossível.

### D2 · O conflito entre as duas linhagens de patch  *(bloqueia a Fase 0.4)*
Os dois anexos divergem e não podem ser aplicados juntos:

| | `genesis_v2_modificacoes` (AntiGravity) | `genesis_revisoes_20260915` (visual) |
|---|---|---|
| `amostragem` | travada em 1, refino removido | 2–3 adaptativo, refino por faixas |
| objetivo | nitidez cirúrgica, pixel-snap | qualidade de oceano, praia, luz |

**Recomendação:** commitar os **originais intocados** primeiro (Fase 0.4), e
tratar cada linhagem como rodada separada, validada isoladamente. A Rodada 03
das revisões está marcada NÃO APLICAR pelo próprio autor.

### D3 · O achado do lago  *(pendente desde 2026-09-12)*
`world.js:209` — o lago escava o terreno e não pinta o bioma. Índice
fracionário descartado em silêncio: 121 tiles com leito e 0 com bioma de lago.
Peixe não nasce, planta cresce dentro d'água. Correção de uma linha
(`Math.round`), em arquivo de LEI. Muda o hash do mundo.
**Recomendação: corrigir agora**, antes que o hash `75ec72bc…` seja usado como
referência de mais coisas. O custo só cresce.

### D4 · Escopo do universo
Confirmar que sistemas estelares e viagem interestelar ficam **adiados**, não
descartados. Isto libera a auditoria para focar em matéria e química.

### D5 · Acesso aos candidatos
Para verificar existência, licença e arquitetura, os repositórios precisam ser
adicionados ao escopo desta sessão. Sem isso, a Fase 2 não sai do papel.

---

## 9. ORDEM DE EXECUÇÃO

```
Fase 0  reconstruir, verificar md5, rodar testes, conferir hash, commitar
   │    └─ trava: hash 75ec72bc4eccad7c612b232d1b8cdcbb
   ▼
Fase 1  escrever a Prova de Habitabilidade como testes H1–H8
   │    └─ trava: existir antes de qualquer candidato ser olhado
   ▼
Fase 2  existência + licença dos candidatos
   │    └─ trava: nada sem licença verificada
   ▼
Fase 3  auditoria estrutural dos sobreviventes contra H1–H8
   │
   ▼
Fase 4  especificar genesis.materia/1 e implementar materia.js
   │
   ▼
        fisiologia → percepção → cérebro → cultura → ciência
```

Terra antes de vida. Vida antes de mente. Mente antes de civilização.
E agora, explicitamente: **matéria antes de vida** — porque sem matéria
transformável, a vida não tem o que fazer.
