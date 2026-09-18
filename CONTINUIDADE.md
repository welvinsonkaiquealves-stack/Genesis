# GÊNESIS DIGITAL · CONTINUIDADE

Última atualização: 2026-09-12
Documento canônico de retomada. **Leia este antes de qualquer outra coisa.**
Substitui `ESTADO.md`, que agora aponta para cá.

---

## ONDE O PROJETO ESTÁ

| fase | conteúdo | situação |
|---|---|---|
| Fase 0 | fundação | entregue |
| Fase 1 | fundação planetária (`fase1/terra.js`) | entregue e validada, 9 testes |
| Fase 2A | contrato de endereço (`fase2a/endereco.js`) | **FECHADA, contrato `genesis.endereco/2a.3`, ancoragem por tile** |
| Terra 1 a 6 | ambiente físico, químico e biológico (`v2/core/ambiente.js`) | FECHADA, contrato `genesis.ambiente/1`, 18 testes |
| **Terra habitável** | **superfície contínua (`v2/core/superficie.js`)** | **FECHADA, contrato `genesis.superficie/1`, 14 testes** |
| Terra 7 | vegetação e recursos detalhados | parcial: falta escrever nas entidades do motor |
| Cérebro dos NPCs | não iniciado | próximo, só depois da validação visual da Terra |

**A TERRA ESTÁ FECHADA COMO ESPAÇO DE SIMULAÇÃO.** O que falta nela é
acabamento declarado, não estrutura. O relatório completo de entrega está em
`RELATORIO_TERRA_HABITAVEL.md`.

### Estado canônico do mundo

```
seed canônica ....... 20260101
região .............. "Ilha Gênesis"
grade ............... 160 × 160 tiles · TILE = 1 m · 25600 tiles
lat/lon do motor .... "-19.53" / "31.59"  (STRING, 2 casas — e está certo assim)
relevo da região .... -63,98 m a +15,04 m
censo ............... 2 NPCs · 129 animais · 900 plantas · 385 objetos
hash do mundo ....... 75ec72bc4eccad7c612b232d1b8cdcbb
```

O hash cobre as cinco grades do `world.js`, a âncora, o censo e uma malha de
64 × 64 amostras do campo contínuo da superfície. Se ele mudar sem que alguém
tenha mudado o mundo de propósito, algo quebrou.

---

## AS TRÊS CAMADAS, E QUEM MANDA EM QUÊ

```
world.js        autoridade de tudo dentro da Ilha Gênesis, 160 × 160 m
ambiente.js     autoridade do que o world.js não tem: clima, mar, solo, ar
superficie.js   autoridade de tudo FORA da região, e da ponte entre as escalas
endereco.js     não é autoridade de nada. Descreve onde as coisas estão.
```

A regra que impede a segunda fonte de verdade: **onde o motor fala, a
superfície LÊ e não recalcula.** Provado tile a tile no teste S3 (divergência
máxima de 1,1 × 10⁻⁴ m) e no teste S5 (25.317 tiles, 0 divergências).

A autoridade do motor termina a **420 m** do centro da região. Entre 420 m e
55 km quem fala é a bacia da ilha. Além disso, o campo planetário.

### A escada de LOD

| nível | escala da tela | quem desenha |
|---|---|---|
| L0 | acima de 4.000 km | globo 3D da Fase 1 |
| L1 | 400 a 4.000 km | globo 3D da Fase 1 |
| L2 | 1 km a 400 km | superfície 2D |
| L3 | 10 m a 1 km | superfície 2D |
| L4 | abaixo de 10 m | superfície 2D |

Entre **1.200 km e 400 km** os dois desenham ao mesmo tempo e a opacidade
cruza. A banda termina acima dos 317 km, que é onde a câmera do globo bate no
batente (`CAM_MIN = 1,06` raios). Isso não é folga estética: se a banda
terminasse abaixo, o globo ficaria preso enquanto a superfície ainda não
assumiu, e é exatamente aí que apareceria um quadro errado.

---

## O QUE ESTA FASE FECHOU

- Endereço por tile no globo, com erro de **7 × 10⁻⁷ m** em 100.000 amostras.
- As quatro lacunas geográficas de `2a.2`, fechadas por **declaração do
  contrato**: âncora no centro da região, `+x` leste e `+y` sul, raio de
  referência `m.planeta.raioKm`, precisão derivada e nunca gravada.
- Campo de elevação contínuo do espaço ao chão, em que o nível de detalhe é
  quantas oitavas foram somadas.
- `amostraEm(x, y)` com altitude, declive, solo, água, temperatura, umidade,
  fertilidade, luz e recursos. 14 µs com declive centrado, 2,5 µs sem declive.
- `hashMundo(seed)`, idêntico em processos separados.
- Uma página só, do espaço a 2 metros de chão, com a simulação rodando.

**Nenhum arquivo de LEI foi alterado.** Os seis md5 continuam os mesmos.

---

## PRÓXIMO PASSO, NA ORDEM

1. **Validação visual sua, num aparelho de verdade.** É a única coisa que este
   contêiner não consegue fazer: o WebGL dele é software e o FPS que ele mede
   não vale para nada. Abrir, descer do espaço até o chão, e dizer o que está
   errado.
2. **Decidir sobre o achado do lago** (seção abaixo). Uma linha em arquivo de
   LEI, aguardando autorização.
3. **Fase 0B, natalidade.** Só depois de 1 e 2.
4. **Cérebro dos NPCs, por seção, nunca de uma vez.**

---

## ACHADO EM ARQUIVO DE LEI, AGUARDANDO AUTORIZAÇÃO

**`world.js:209` — o lago escava o terreno e não pinta o bioma.**

`l.r` é fracionário, o índice do `TypedArray` sai fracionário, e a escrita é
descartada em silêncio. A linha 243 faz a mesma coisa com `Math.round` e
funciona.

Medido: dos 121 tiles dentro do raio do Lago Gênesis, **121 têm leito escavado
e 0 têm bioma de lago**. `W.ehAgua` devolve falso em cima do lago. Peixe não
nasce ali. Planta cresce dentro d'água. Vale desde a Fase 1.

Correção mínima: `Math.round` nos dois limites do laço. Uma linha.
O que muda: `reg.tipo` em até 121 tiles, e por consequência `biomaEm`,
`ehAgua`, e o sorteio de flora e fauna. O hash do mundo muda.
Testes a refazer: referência de `hashMundo`, e os testes S5 e S11.

Registrado como teste **S11**, que passa enquanto o defeito existir.

---

## DECISÕES AINDA ABERTAS

### Camada 7 do ambiente, quatro escritas

Decomposição (`objeto.frescor` não decai), nutrientes (`reg.fertilidade` não é
consumida nem regenerada), vento local movendo objetos, e erosão rebaixando
`reg.alturaTerreno`. Todas da mesma família da decisão sobre a umidade, que já
foi tomada e está implementada como mutator único.

### Georreferência em `world.js`

Continua aberta, e agora é **opcional**. A Rota A tornou desnecessário mexer:
o endereço fecha sem tocar no motor. Se um dia o motor declarar as próprias
convenções de âncora, orientação e raio, as dele vencem e o bloco `GEO_2A3` de
`endereco.js` vira errata.

O que já foi medido: remover o `.toFixed(2)` não altera um bit do mundo gerado,
verificado por sha256. Os outros campos (azimute, âncora, raio de referência,
id persistente de região) são decisões humanas, não deduzíveis do código.

### Streaming de N regiões

Não exequível contra o motor real: `world.js` materializa uma região por vez.
O que existe e está medido é o streaming da superfície.

---

## REGRAS PERMANENTES DO PROJETO

- Arquivos de LEI: `v2/core/util.js`, `data.js`, `brain.js`, `world.js`,
  `fase1/terra.js`, `_build/three.min.js`. Não reescrever. Alteração exige
  parada, relatório com os cinco itens do protocolo, e autorização.
  `v2/core/ambiente.js` e `v2/core/superficie.js` NÃO são LEI: foram escritos
  nesta linhagem e podem ser alterados com relatório.
- Nunca inventar coordenada, id ou UUID.
- Nunca transformar índice de coleção em identidade.
- Nunca criar segunda fonte de verdade nem matemática geodésica paralela a
  `terra.js`.
- Nunca usar `Math.random` em geração, endereço ou geometria procedural.
- Declarar lacuna é sempre preferível a fabricar precisão.
- Não apagar arquivos `.l2s.tmp_obj_*`: pertencem ao storage do OmniBot.
- Terra antes de vida. Vida antes de mente. Mente antes de civilização.

---

## COMO RODAR

```bash
cd <esta pasta>
python3 -m http.server 8741
# a Terra, do espaço ao chão:
#   http://127.0.0.1:8741/fase2b/
# painéis de instrumentação da Fase 2A:
#   http://127.0.0.1:8741/fase2a/
# outra seed:  ?seed=12345
```

Testes, todos em Node puro:

```bash
node testes/e1e2_endereco.js       # E1 e E2, 100.000 amostras
node testes/superficie.js          # S1 a S14
node --expose-gc testes/custo.js   # custo, memória, determinismo
node testes/hash.js 20260101       # hashMundo em processo isolado
node testes/pagina.js              # 500 passos no navegador + capturas
node testes/gerar_artefato.js      # versão publicável, gerada do mesmo fonte
```

Dentro da página, `window.GENESIS_TERRA` expõe `m`, `reg`, `amb`, `C`,
`camara`, `irPara(metrosNaTela, x, y)`, `estado()` e `testes()`.

---

## DOCUMENTOS

| arquivo | o que é |
|---|---|
| `CONTINUIDADE.md` | este. O estado, sempre. |
| `RELATORIO_TERRA_HABITAVEL.md` | entrega da Terra habitável, na ordem do Anexo C |
| `RELATORIO_TERRA.md` | entrega do ambiente, camadas 1 a 6 |
| `RELATORIO_FASE2A.md` | entrega do contrato de endereço |
| `AUDITORIA_FASE2A.md` | auditoria que antecedeu a Fase 2A |
| `AUDITORIA_AMBIENTE.md` | auditoria que antecedeu o ambiente |
| `capturas/` | L0 a L4, geradas por `testes/pagina.js` |
