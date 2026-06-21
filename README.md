# NES Emulator JS Puro v14

<p align="center">
  <img src="assets/emulador_final.gif" width="700" alt="Demonstração do Emulador v14" />
</p>

Versão criada para resolver o problema de regressão gráfica.

## Ideia principal

A v8 estava funcionando melhor no **Shadow of the Ninja**.  
As versões seguintes melhoraram o Mario, mas algumas correções globais acabaram atrapalhando jogos MMC3.

A v14 usa uma abordagem mais inteligente:

- mantém a **base gráfica da v8** para jogos MMC3, como Shadow of the Ninja;
- aplica correções de Mario **somente quando a ROM parece ser Super Mario Bros / NROM**;
- evita que um fix específico de um jogo quebre outro.

## Perfis automáticos

O emulador agora detecta um perfil simples da ROM:

### Perfil `mmc3_v8_safe`

Usado para Mapper 4/MMC3.

- mantém comportamento gráfico da v8;
- não aplica HUD fix do Mario;
- não força sprite zero hit;
- evita as regressões da v11/v12/v13 no Shadow.

### Perfil `smb_nrom`

Usado para ROMs NROM típicas do Super Mario Bros.

- ativa fallback de sprite zero hit;
- trava o scroll do HUD nas primeiras linhas;
- melhora o status bar do Mario;
- mantém o jogo sem travar no loop de `$2002`.

### Perfil `generic`

Usado para outras ROMs.

- sem hacks específicos;
- comportamento mais neutro.

## Melhorias da v14

- base PPU v8 restaurada para MMC3
- sistema de perfil automático por ROM
- correções do Mario isoladas
- Shadow of the Ninja não recebe hacks do Mario
- Mario recebe apenas os fixes necessários
- status mostra o perfil usado
- mantém APU v7
- mantém Mapper 0 e Mapper 4/MMC3 experimental

## Como rodar

```bash
python3 -m http.server 8080
```

Abra:

```text
http://localhost:8080
```

Carregue a ROM e clique em **Rodar**.

## Observação

Essa versão prioriza estabilidade prática por jogo/perfil, em vez de aplicar correções globais que podem causar regressões.
