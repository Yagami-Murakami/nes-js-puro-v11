# 🕹️ Do Zero ao Bit: Construindo um Emulador de NES em JavaScript Puro com TV CRT Interativa e WebAssembly!

<p align="center">
  <img src="assets/emulador_final.gif" width="700" alt="Demonstração do Emulador" />
</p>

Quem viveu a era dos 8 bits sabe o quanto a experiência física importava: o barulho de encaixar o cartucho, o botão de EJECT, o chiado da TV saindo do ar e a imagem de tubo (CRT) se contraindo ao desligar a TV.

Decidi recriar essa nostalgia construindo um Emulador de NES 100% Client-Side usando JavaScript Puro (Vanilla JS), focado tanto em precisão de arquitetura quanto em fidelidade estética.

---

## 🚀 Principais Recursos Técnicos

### 👾 1. Core do Emulador (NES.js)
- **Mappers Comerciais:** Suporte completo a múltiplos mappers clássicos (Mapper 0 - NROM, Mapper 1 - MMC1, Mapper 2 - UxROM, Mapper 3 - CNROM, Mapper 7 - AxROM e Mapper 4 - MMC3 com CHR-RAM) para rodar a grande maioria dos clássicos comerciais.
- **Instruções Não-Oficiais:** Mapeamento de opcodes de CPU 6502 não-oficiais (como NOPs extras, LAX e SAX) e tratamento seguro de erros para evitar travamentos em traduções e romhacks.
- **PRG-RAM ($6000 - $7FFF):** Suporte para jogos que utilizam memória de trabalho extra e salvamento por bateria.

### 📺 2. Gabinete CRT Retro Interativo (HTML & CSS Avançado)
- **Efeito CRT vs Digital:** Filtro de imagem analógico completo com scanlines, curvatura de tela (bezel shadow), reflexo de fósforo e oscilação de brilho analógica que pode ser desativado pelo botão `V.MODE`.
- **Animação CRT Power Collapse:** O botão físico `POWER` desliga a TV realizando um efeito realista de colapso de imagem (encolhendo em uma linha e depois em um ponto branco antes de sumir).
- **Dials 3D Rotativos:** Botões rotativos em CSS 3D com LEDs indicadores amarelos para ajuste de volume, modo e tamanho de tela.
- **Chuvisco e Chiado Analógico (TV fora do ar):** Quando a TV está sem jogo, ela gera ruído visual de estática e reproduz um chiado de estática realista (ruído branco gerado dinamicamente via Web Audio API com um filtro passa-banda em 1000Hz). Ambos silenciam imediatamente ao inserir um jogo!

### 🖨️ 3. Console Famicom Virtual & Disquetes de Save
- **Encaixe e Hashing de Cartucho:** Ao selecionar um jogo, a fita surge e desliza animada para dentro do slot. A cor do cartucho e o design mudam com base no nome do jogo.
- **Alavanca de EJECT Física:** O botão de eject ejeta o cartucho fisicamente, interrompendo a emulação e voltando a TV para o modo de estática/chuvisco.
- **Saves em Disquetes Retro:** Dois slots de salvamento representados por disquetes interativos na prateleira. Ao salvar, o nome do jogo é escrito "à mão" na etiqueta do disquete de forma dinâmica. O estado é persistido no `localStorage`.

### 📦 4. Suporte a ZIP e 7-Zip Nativo no Navegador
- Para evitar que o usuário precise descompactar os jogos, integramos o `JSZip` e portamos o motor oficial do **7-Zip para WebAssembly (Wasm)**, permitindo descompactar e extrair ROMs `.nes` de arquivos `.zip` e `.7z` 100% no cliente, sem requisições de backend.

### 🎧 5. Som Chiptune de Alta Fidelidade (SimpleAPU)
- Engine de som calibrada livre de ruído DC e estalos usando filtros passa-alta de 90Hz e passa-baixa de 14.000Hz, além de um Compressor de Dinâmica de 3:1 para trazer o brilho e o ataque das ondas quadradas/triangulares originais.

---

## 💻 Stack Tecnológica

- **Interface:** HTML5, Vanilla CSS (com foco em pseudo-elementos e animações 3D), JavaScript puro.
- **Áudio:** Web Audio API (geração de ruído de estática e síntese chiptune).
- **Módulos:** WebAssembly (motor do 7-Zip portado do C/C++).

Um mergulho incrível em engenharia de software de baixo nível, renderização de vídeo de alta performance no Canvas e interfaces imersivas!

---

## 🛠️ Como Executar o Projeto Localmente

Devido às políticas de segurança dos navegadores modernos (CORS), que bloqueiam o carregamento de arquivos WebAssembly (`.wasm`) e módulos ES6 diretamente pelo protocolo `file://` (ao tentar abrir o arquivo `index.html` clicando duas vezes nele), **é necessário rodar o projeto através de um servidor HTTP local**.

Aqui estão as formas mais fáceis e rápidas de inicializar o servidor:

### Opção 1: Usando Python (Geralmente pré-instalado)
Abra o terminal ou PowerShell na pasta do projeto e execute:
```bash
python -m http.server 8000
```
Depois, abra o seu navegador e acesse: [http://localhost:8000](http://localhost:8000)

### Opção 2: Usando Node.js (npx)
Se você tem o Node.js instalado, execute no terminal da pasta do projeto:
```bash
npx serve
```
Depois, acesse o endereço gerado (geralmente [http://localhost:3000](http://localhost:3000) ou [http://localhost:5000](http://localhost:5000)).

### Opção 3: Extensão "Live Server" do VS Code
Se você utiliza o VS Code:
1. Instale a extensão **Live Server** (desenvolvida por *Ritwick Dey*).
2. Abra a pasta do projeto no VS Code.
3. Clique com o botão direito sobre o arquivo `index.html` e selecione **"Open with Live Server"** (ou clique em **"Go Live"** na barra de status inferior direita).

---

## 🕹️ Guia de Operação do Gabinete Retro

O emulador conta com um gabinete virtual totalmente interativo modelado em CSS 3D. Veja como operá-lo:

1. **Ligar/Desligar a TV (`POWER`):**
   * Pressione o botão vermelho **POWER** do lado direito do monitor. A TV ligará com um chuvisco e chiado analógico (estática) caso não haja cartucho inserido. Ao desligá-la, note a animação clássica de colapso de fósforo CRT (a tela encolhe até virar uma linha horizontal e depois um ponto luminoso antes de apagar).
2. **Inserir um Jogo (ROM):**
   * **Homebrew Integrado:** Clique em qualquer um dos cartuchos na prateleira inferior (**Alter Ego**, **Zooming Secretary** ou **Lawn Mower**). O cartucho deslizará fisicamente para dentro do console e o jogo iniciará automaticamente.
   * **ROM Personalizada:** Arraste e solte ou clique na área de upload acima do console para carregar uma ROM (`.nes`), ou arquivos compactados (`.zip`, `.7z`). O cartucho físico se adaptará dinamicamente ao nome do jogo e entrará no console.
3. **Ejetar o Cartucho (`EJECT`):**
   * Clique na alavanca de **EJECT** central no console Famicom. O cartucho será ejetado, a emulação pausada e a TV voltará para a estática/chiado analógico imediatamente.
4. **Reiniciar o Jogo (`RESET`):**
   * Pressione o botão azul **RESET** no console Famicom para reiniciar o jogo atual do início.
5. **Ajuste de Volume e Modo de Vídeo:**
   * **Volume:** Regule o volume geral da TV e do chiado movendo os seletores ou girando o dial de áudio.
   * **V.MODE (Filtro CRT):** Use o interruptor **V.MODE** para alternar entre o filtro de vídeo retrô CRT (scanlines, curvatura da tela e flicker de tubo) e a imagem digital limpa.
6. **Gravar e Carregar Progresso (Save States):**
   * Utilize os dois disquetes 3.5" na prateleira inferior do console.
   * **Salvar:** Clique no disquete e selecione salvar. A etiqueta do disquete será escrita à mão com o nome do jogo ativo e o estado será persistido localmente.
   * **Carregar:** Clique no respectivo disquete para restaurar o estado instantaneamente no ponto exato onde salvou.

---

## 🎮 Mapeamento de Controles

O emulador suporta teclado padrão e Gamepads (controles de Xbox, PlayStation, etc.) via HTML5 Gamepad API.

### ⌨️ Teclado (Jogador 1)

| Ação NES | Tecla correspondente |
| :--- | :--- |
| **D-Pad (Direcionais)** | Setas direcionais (`↑`, `↓`, `←`, `→`) |
| **Botão A** | Tecla `Z` |
| **Botão B** | Tecla `X` |
| **SELECT** | Tecla `Shift` (Esquerda ou Direita) |
| **START** | Tecla `Enter` |

### 🎮 Gamepad (Xbox, PlayStation, etc.)

| Ação NES | Controle Padrão |
| :--- | :--- |
| **D-Pad (Direcionais)** | D-Pad do controle ou Analógico Esquerdo |
| **Botão A** | Botão `A` (Xbox) ou `❌` (PlayStation) |
| **Botão B** | Botão `B`/`X` (Xbox) ou `⭕`/`⬜` (PlayStation) |
| **SELECT** | Botão `Back`/`Share`/`Select` |
| **START** | Botão `Start`/`Options` |
