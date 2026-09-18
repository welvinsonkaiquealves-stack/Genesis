# AUDITORIA · THE DARK CANDLE

Repositório: https://github.com/feinorgh/the-dark-candle
Autor: Pär Karlsson (feinorgh)
Auditado em: 2026-09-18, contra o commit `dfa890b` (último: 2026-05-20)
Método: clone real e leitura de código. Nenhuma afirmação abaixo vem do README
sem ter sido conferida no fonte.

---

## 1. VEREDITO

**O projeto é real e entrega o que anuncia.** 211 arquivos Rust, 94.204 linhas,
estrutura de módulos que corresponde exatamente às features declaradas.
Não é vaporware nem README inflado.

Para a pergunta feita — *os NPCs conseguem pisar, andar e fazer coisas nesse
mundo?* — a resposta é **sim, e num nível que o Gênesis atual não alcança.**

Mas ele **não é** a simulação que o Gênesis quer ser. Ele é o **mundo físico e
o corpo**; falta inteiramente a **mente**. Isso não é defeito: é exatamente a
divisão que serve ao projeto.

---

## 2. LICENÇA  ⚠️

| onde | o que diz |
|---|---|
| `Cargo.toml` | `license = "MIT OR Apache-2.0"` |
| raiz do repositório | **nenhum arquivo LICENSE ou COPYING** |

A declaração no manifesto é uma declaração real de licenciamento e é
permissiva — compatível com o Gênesis, inclusive para distribuição nativa.
Mas a ausência do texto das licenças é uma ponta solta.

**Ação recomendada:** abrir uma issue educada pedindo os arquivos
`LICENSE-MIT` e `LICENSE-APACHE`. É pedido trivial, o autor quase certamente
atende, e resolve a questão antes de existir qualquer dependência.
Não bloqueia estudo nem experimentação. Bloqueia distribuição tranquila.

---

## 3. O QUE FOI CONFIRMADO NO CÓDIGO

### 3.1 Os NPCs andam de verdade

| capacidade | arquivo | linhas |
|---|---|---|
| A* em grade de voxels, custo por material | `behavior/pathfinding.rs` | 554 |
| Locomoção com marchas (walk/run/trot/gallop) | `bodies/locomotion.rs` | 612 |
| Cinemática inversa FABRIK — pé no terreno irregular | `bodies/ik.rs` | 293 |
| Esqueletos articulados, restrições de junta | `bodies/skeleton.rs` | — |
| Camadas de tecido (pele, músculo, osso, órgão) | `bodies/tissue.rs` | — |
| Lesão por região do corpo, afeta locomoção | `bodies/injury.rs` | — |
| Percepção: `EyeMount` (cone de visão), `EarMount` (alcance + atenuação) | `bodies/perception.rs` | — |
| Metabolismo, hidratação, temperatura corporal, saúde | `biology/` | 7 arquivos |
| Facções, relacionamentos, reputação, comportamento de grupo | `social/` | 6 arquivos |
| Inventário com limite de peso (kg) e volume (m³) | `entities/inventory.rs` | — |

### 3.2 O achado arquitetural mais importante

> **O jogador é uma criatura comum.** `PlayerBody` usa o *mesmo* controlador
> de locomoção das criaturas de IA.

Isso significa que **não existe caminho privilegiado do jogador**. O que o
humano faz, o NPC executa pelo mesmo código. É, na prática, paridade de
possibilidades imposta pela arquitetura — exatamente o critério que o Gênesis
precisa e que quase nenhum jogo respeita.

### 3.3 A física é séria

Exemplo real, `assets/data/materials/iron.material.ron` — 30 propriedades em
unidades SI:

```
densidade 7874 kg/m³ · fusão 1811 K · ebulição 3134 K · dureza 4,5
condutividade térmica 80,2 W/m·K · calor específico 449 J/kg·K
calor latente de fusão 247 kJ/kg · de vaporização 6088 kJ/kg
módulo de Young 200 GPa · resistência à tração 400 MPa
compressão 250 MPa · cisalhamento 170 MPa · flexão 350 MPa
tenacidade à fratura 50 MPa·√m · massa molar 0,055845 kg/mol
emissividade 0,21 · refletividade 0,65 · albedo 0,20
```

Comparação direta com a tabela `MATERIAIS` que havíamos injetado no Gênesis:
**6 propriedades contra 30**, e lá estão justamente as que faltavam para
estrutura, fratura e química quantitativa.

Sobre isso roda: difusão de calor por lei de Fourier, transições de fase com
calor latente, reações químicas (combustão, oxidação, termita, oxi-hidrogênio),
propagação de fogo com consumo de combustível, radiação de Stefan-Boltzmann,
três modelos de fluidos (Navier-Stokes com AMR, Lattice-Boltzmann D3Q19,
FLIP/PIC), e análise de tensão estrutural com ruptura de junta e colapso
progressivo.

### 3.4 O planeta

Grade geodésica icosaédrica até ~2,6 M células, tectônica com força de
slab-pull, rifteamento e sutura de placas, orogenia, vulcanismo por plumas
do manto, crateras de impacto, clima por balanço de energia de insolação
(Berger 1978, feedback de gelo-albedo), 14 biomas de Whittaker, 10 tipos de
rocha e 7 de minério com idade geológica e depósitos hidrotermais.

O minério de ferro do exemplo que você deu existe, **e existe porque a
geologia o colocou lá**, não porque alguém espalhou minério no mapa.

---

## 4. AS LACUNAS REAIS

São quatro, e são exatamente as que a Prova de Habitabilidade previa.

### G1 · Voxel de 1 metro  → **reprova H1**

`physics/constants.rs`: `voxel_size: 1.0`. Um voxel é um metro cúbico.

Não é possível talhar uma tábua dentro de um cubo de 1 m. O octree existe
(`subdivision_config.ron`, `max_depth: 4`), mas refina por **gradiente térmico
e de pressão** — é refinamento de simulação, não geometria talhável pelo NPC.

**"Cortar a árvore nos detalhes que ele achar melhor" não funciona hoje.**
A derrubada existe (`PlantBody` cai quando a junta do tronco falha), o que
falta é a matéria sub-métrica depois da queda.

### G2 · Cinco receitas  → **reprova H6**

`assets/data/recipes/` tem exatamente 5 arquivos: argila→tijolo,
minério→lingote, concreto, areia→vidro, madeira→tábuas.

`RecipeData` é `inputs → output` com porta de temperatura e ferramenta.
É o teto artificial, idêntico ao `RECEITAS` do Gênesis.

**Mas aqui é bem mais barato de remover:** `building/crafting.rs` tem 198
linhas, e as 30 propriedades SI necessárias para derivar a transformação
**já estão nos materiais**. Substituir a tabela por transformação derivada é
trabalho de dias, não de meses. No Gênesis seria refundação.

### G3 · Nenhuma mente

4 criaturas, todas animais: lobo, cervo, coelho, aranha-das-cavernas.
Nenhum humanoide. A IA é árvore de comportamento com utilidade —
`behaviors.rs` 322 linhas + `utility.rs` 330 — resolvendo procurar comida,
fugir, vagar, ficar parado.

Isso é IA de jogo, não cognição. O `brain.js` do Gênesis tem 1426 linhas
dedicadas só a isso. **É aqui que o Gênesis continua sendo o Gênesis.**

### G4 · É um jogo, não um simulador de longo prazo

Único binário extra: `worldgen`. O modo headless existe, mas para renderizar
sem janela (fotos de céu, diagnóstico), não para rodar milênios sem gráficos.
Salvamento em RON, 4 slots.

Para evolução cultural em escala longa, será necessário construir um laço de
simulação desacoplado do render. O ECS do Bevy favorece isso, mas não vem
pronto.

---

## 5. O CUSTO QUE ELE IMPÕE

**Rust 2024 + Bevy 0.18 + wgpu, GPU Vulkan obrigatória.**

Isso encerra o plano de Vanilla JS compilado via AntiGravity. Não é porte:
é troca de base tecnológica.

Em troca: Rust compila nativo de verdade, com desempenho que o JS não alcança,
e o ECS do Bevy é a estrutura certa para milhares de entidades — que é
exatamente para onde o Gênesis vai.

Escala relativa, para dimensionar a decisão:

| | linhas |
|---|---|
| Gênesis inteiro (25 arquivos) | ~16.000 |
| The Dark Candle (211 arquivos) | ~94.200 |
| só `world.js` do Gênesis | 2.499 |

---

## 6. A DIVISÃO QUE ISSO PROPÕE

Encaixa na árvore que já havia sido desenhada para o projeto:

```
THE DARK CANDLE                      GÊNESIS
─────────────────                    ───────
planeta, tectônica, geologia         cognição
materiais SI, química, fogo          aprendizado
fluidos, clima, atmosfera            memória
voxels, construção, tensão           linguagem
esqueletos, marchas, IK              cultura
percepção, metabolismo               sociedade
facções, relacionamentos             ciência
                                     tecnologia
        MUNDO FÍSICO + CORPO    │    MENTE
```

Ele é forte exatamente onde o Gênesis é fraco, e ausente exatamente onde o
Gênesis é forte. A sobreposição é pequena, e o que se perde do Gênesis é a
camada que você mesmo já julgou ruim olhando.

---

## 7. ORDEM DE TRABALHO, SE ADOTADO

1. **Compilar e rodar.** Nada se decide antes de ver na tela. Exige GPU
   Vulkan — não é este contêiner, é a sua máquina.
2. **Pedir os arquivos de licença** por issue. Paralelo, custa minutos.
3. **Fechar G1** — matéria sub-métrica. É o que libera a árvore virar tábua
   nas dimensões que o NPC escolher.
4. **Fechar G2** — trocar `RecipeData` por transformação derivada das 30
   propriedades. Mata o teto artificial.
5. **Fechar G3** — NPC humanoide e porte da cognição do `brain.js` para o
   ECS do Bevy. É a parte longa, e é o Gênesis propriamente dito.
6. **Fechar G4** — laço de simulação headless de longo prazo.

Os átomos entram depois, sob a camada de materiais, pela interface de
propriedade — sem invalidar nada acima. As 30 propriedades SI são o
ponto de encaixe natural: são exatamente o que uma composição atômica
teria que reproduzir.

---

## 8. O QUE AINDA NÃO SE SABE

- Roda? Com quantos FPS? Em qual GPU? Não testado — este contêiner não tem
  GPU Vulkan.
- `docs/ROADMAP.md` não foi lido nesta passagem.
- Não se sabe se o autor aceita contribuição, nem qual o ritmo do projeto.
- Os outros candidatos (Pixeldarium, DeepSpaceEngine, NoMansTerrain,
  ProceduralTerrains, Pioneer) seguem não verificados.
