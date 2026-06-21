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
