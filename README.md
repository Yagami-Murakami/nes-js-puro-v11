# 🎮 NES Emulator — JS Puro (v11)

Um emulador de **Nintendo Entertainment System (NES)** de alta fidelidade escrito inteiramente em **JavaScript Puro (Vanilla JS)**, sem dependências ou motores externos. O projeto executa diretamente no navegador através de renderização gráfica acelerada via HTML5 Canvas e síntese de áudio de baixa latência com Web Audio API.

<p align="center">
  <img src="assets/emulador.gif" width="700" alt="Demonstração do Emulador rodando Super Mario Bros" />
</p>

---

## 🚀 Funcionalidades e Arquitetura

O emulador simula os componentes de hardware internos do console original de 8 bits:

### 1. Processador (CPU 6502)
- Emulação do processador **Ricoh 2A03** (baseado no MOS Technology 6502).
- Mapeamento completo de ciclos de instrução, registradores, pilha e modos de endereçamento oficiais.
- Mecanismo integrado para interrupções de hardware e software (**NMI** para V-Blank, **IRQ** e **RESET**).

### 2. Unidade de Processamento Gráfico (PPU)
- Renderização avançada baseada em **scanline** para máxima performance gráfica no navegador.
- Suporte completo a sprites em tamanhos de 8x8 e 8x16 pixels.
- Detecção precisa de colisão de **Sprite Zero Hit** para sincronização da tela.
- **Split Scroll (Scroll Dividido):** Trava do scroll das primeiras 32 linhas de scanline em jogos Mapper 0/NROM (como *Super Mario Bros*), garantindo que a barra de status do topo (HUD) permaneça estática enquanto o cenário inferior rola normalmente.

### 3. Unidade de Processamento de Áudio (APU)
- Emulação de canais de áudio 8-bit nativos (v7):
  - 2 canais de ondas quadradas (Pulse/Square).
  - 1 canal de onda triangular (Triangle).
  - 1 canal de ruído branco (Noise) para efeitos sonoros de percussão/explosão.
  - Síntese de áudio em tempo real com a **Web Audio API**.

### 4. Mappers de Cartuchos
- **Mapper 0 (NROM):** Compatibilidade total com jogos clássicos (ex: *Super Mario Bros*, *Ice Climber*, *Pac-Man*).
- **Mapper 4 (MMC3):** Suporte experimental para paginação de memória e IRQs baseados em scanline para jogos mais avançados.

---

## 🎮 Controles Mapeados

O teclado do computador simula o controle original do NES:

| Botão do NES | Tecla Mapeada |
| :--- | :--- |
| **D-Pad (Direcional)** | Setas do Teclado (↑, ↓, ←, →) |
| **Botão A** | Tecla `Z` |
| **Botão B** | Tecla `X` |
| **Botão SELECT** | Tecla `Shift` (Esquerdo) |
| **Botão START** | Tecla `Enter` |

---

## 🛠️ Como Executar o Projeto

Devido a restrições de segurança do navegador para carregamento de arquivos locais via JavaScript (CORS ao ler arquivos de ROM localmente), é necessário servir o projeto através de um servidor HTTP simples.

1. Navegue até a pasta do projeto em seu terminal:
   ```bash
   cd nes-js-puro-v11
   ```
2. Inicie o servidor local (utilizando Python 3):
   ```bash
   python3 -m http.server 8080
   ```
3. Abra seu navegador de preferência e acesse:
   ```text
   http://localhost:8080
   ```
4. Clique em **Escolher arquivo**, selecione uma ROM válida do console com a extensão `.nes`, e clique em **▶️ Rodar**.

---

## 💻 Tecnologias Utilizadas

- **Linguagem:** JavaScript Puro (ECMAScript 6+)
- **Interface:** HTML5 & CSS3 moderno
- **Renderização:** Canvas 2D API (Pixelated Rendering)
- **Áudio:** Web Audio API (OscillatorNodes & Custom AudioBuffers)
