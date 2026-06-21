/*
  NES Emulator JS Puro
  ------------------------------------------------------------
  Esta é uma base própria, sem core externo.

  Implementado:
  - Loader iNES
  - Mapper 0 / NROM
  - RAM CPU
  - PRG-ROM
  - CHR-ROM
  - Controller 1
  - CPU 6502 com instruções principais
  - PPU simplificada com renderização de tiles/background
  - Canvas 256x240

  Observação:
  Para rodar Super Mario Bros 100%, ainda precisa completar detalhes
  de PPU timing, scrolling fino, sprites, NMI preciso e opcodes restantes.
*/

const SCREEN_W = 256;
const SCREEN_H = 240;

const canvas = document.getElementById("screen");
const ctx = canvas.getContext("2d");
const imageData = ctx.createImageData(SCREEN_W, SCREEN_H);
const bgOpaque = new Uint8Array(SCREEN_W * SCREEN_H);
const statusEl = document.getElementById("status");

const CPU_CLOCK = 1789773;
const FRAME_CPU_CYCLES = 29780;

const NES_PALETTE = [
  [84,84,84],[0,30,116],[8,16,144],[48,0,136],[68,0,100],[92,0,48],[84,4,0],[60,24,0],
  [32,42,0],[8,58,0],[0,64,0],[0,60,0],[0,50,60],[0,0,0],[0,0,0],[0,0,0],
  [152,150,152],[8,76,196],[48,50,236],[92,30,228],[136,20,176],[160,20,100],[152,34,32],[120,60,0],
  [84,90,0],[40,114,0],[8,124,0],[0,118,40],[0,102,120],[0,0,0],[0,0,0],[0,0,0],
  [236,238,236],[76,154,236],[120,124,236],[176,98,236],[228,84,236],[236,88,180],[236,106,100],[212,136,32],
  [160,170,0],[116,196,0],[76,208,32],[56,204,108],[56,180,204],[60,60,60],[0,0,0],[0,0,0],
  [236,238,236],[168,204,236],[188,188,236],[212,178,236],[236,174,236],[236,174,212],[236,180,176],[228,196,144],
  [204,210,120],[180,222,120],[168,226,144],[152,226,180],[160,214,228],[160,162,160],[0,0,0],[0,0,0]
];

class Cartridge {
  constructor(bytes) {
    if (bytes[0] !== 0x4E || bytes[1] !== 0x45 || bytes[2] !== 0x53 || bytes[3] !== 0x1A) {
      throw new Error("Arquivo .nes inválido.");
    }

    this.prgBanks = bytes[4];
    this.chrBanks = bytes[5];
    this.flags6 = bytes[6];
    this.flags7 = bytes[7];

    this.mapper = (this.flags6 >> 4) | (this.flags7 & 0xF0);
    this.mirroring = (this.flags6 & 1) ? "vertical" : "horizontal";

    let offset = 16;
    if (this.flags6 & 0x04) offset += 512;

    const prgSize = this.prgBanks * 16384;
    const chrSize = Math.max(1, this.chrBanks) * 8192;

    this.prg = bytes.slice(offset, offset + prgSize);
    offset += prgSize;

    if (this.chrBanks > 0) {
      this.chr = bytes.slice(offset, offset + chrSize);
      this.chrRam = false;
    } else {
      this.chr = new Uint8Array(chrSize);
      this.chrRam = true;
    }

    if (this.mapper === 4) {
      this.mmc3 = {
        bankSelect: 0,
        regs: new Uint8Array(8),
        prgMode: 0,
        chrMode: 0,
        irqReload: 0,
        irqCounter: 0,
        irqEnable: false,
        irqPending: false
      };

      // Valores iniciais seguros para MMC3.
      this.mmc3.regs[0] = 0;
      this.mmc3.regs[1] = 2;
      this.mmc3.regs[2] = 4;
      this.mmc3.regs[3] = 5;
      this.mmc3.regs[4] = 6;
      this.mmc3.regs[5] = 7;
      this.mmc3.regs[6] = 0;
      this.mmc3.regs[7] = 1;
    }

    if (![0, 4].includes(this.mapper)) {
      throw new Error("Mapper ainda não suportado nesta versão: " + this.mapper);
    }

    this.profile = this.detectProfile();
  }

  detectProfile() {
    // Perfis automáticos para evitar que correções específicas de um jogo
    // quebrem outro. A regra principal:
    // - Mapper 4/MMC3 fica com o comportamento gráfico da v8, que estava bom no Shadow.
    // - Super Mario Bros recebe correções específicas de sprite zero/HUD.
    if (this.mapper === 0 && this.prgBanks === 2 && this.chrBanks === 1) {
      // Super Mario Bros geralmente é NROM-256: PRG 2, CHR 1, mapper 0.
      // Sem depender de nome de arquivo, porque o loader recebe só bytes.
      return {
        name: "smb_nrom",
        lockTopStatusBarScroll: true,
        statusBarHeight: 32,
        spriteZeroFallback: true
      };
    }

    if (this.mapper === 4) {
      return {
        name: "mmc3_v8_safe",
        lockTopStatusBarScroll: false,
        statusBarHeight: 0,
        spriteZeroFallback: false
      };
    }

    return {
      name: "generic",
      lockTopStatusBarScroll: false,
      statusBarHeight: 0,
      spriteZeroFallback: false
    };
  }

  cpuRead(addr) {
    if (this.mapper === 0) return this.cpuReadMapper0(addr);
    if (this.mapper === 4) return this.cpuReadMMC3(addr);
    return 0;
  }

  cpuWrite(addr, value) {
    value &= 0xFF;
    if (this.mapper === 4) this.cpuWriteMMC3(addr, value);
  }

  ppuRead(addr) {
    addr &= 0x1FFF;
    if (this.mapper === 4) return this.ppuReadMMC3(addr);
    return this.chr[addr % this.chr.length];
  }

  ppuWrite(addr, value) {
    addr &= 0x1FFF;
    value &= 0xFF;
    if (this.chrRam) this.chr[addr % this.chr.length] = value;
  }

  cpuReadMapper0(addr) {
    if (addr >= 0x8000) {
      let mapped = addr - 0x8000;
      if (this.prgBanks === 1) mapped %= 0x4000;
      return this.prg[mapped];
    }
    return 0;
  }

  cpuReadMMC3(addr) {
    if (addr < 0x8000) return 0;

    const total8k = this.prg.length >> 13;
    const last = total8k - 1;
    const secondLast = total8k - 2;

    let bank = 0;

    if (addr >= 0x8000 && addr <= 0x9FFF) {
      bank = this.mmc3.prgMode ? secondLast : (this.mmc3.regs[6] & 0x3F);
    } else if (addr >= 0xA000 && addr <= 0xBFFF) {
      bank = this.mmc3.regs[7] & 0x3F;
    } else if (addr >= 0xC000 && addr <= 0xDFFF) {
      bank = this.mmc3.prgMode ? (this.mmc3.regs[6] & 0x3F) : secondLast;
    } else {
      bank = last;
    }

    bank %= total8k;
    const offset = bank * 0x2000 + (addr & 0x1FFF);
    return this.prg[offset % this.prg.length];
  }

  cpuWriteMMC3(addr, value) {
    if (addr >= 0x8000 && addr <= 0x9FFF) {
      if ((addr & 1) === 0) {
        this.mmc3.bankSelect = value & 7;
        this.mmc3.prgMode = (value >> 6) & 1;
        this.mmc3.chrMode = (value >> 7) & 1;
      } else {
        this.mmc3.regs[this.mmc3.bankSelect] = value;
      }
    } else if (addr >= 0xA000 && addr <= 0xBFFF) {
      if ((addr & 1) === 0) {
        this.mirroring = (value & 1) ? "horizontal" : "vertical";
      }
    } else if (addr >= 0xC000 && addr <= 0xDFFF) {
      if ((addr & 1) === 0) this.mmc3.irqReload = value;
      else this.mmc3.irqCounter = 0;
    } else if (addr >= 0xE000) {
      if ((addr & 1) === 0) {
        this.mmc3.irqEnable = false;
        this.mmc3.irqPending = false;
      } else {
        this.mmc3.irqEnable = true;
      }
    }
  }

  clockIRQ() {
    if (this.mapper !== 4) return;
    if (this.mmc3.irqCounter === 0) {
      this.mmc3.irqCounter = this.mmc3.irqReload;
    } else {
      this.mmc3.irqCounter--;
      if (this.mmc3.irqCounter === 0 && this.mmc3.irqEnable) {
        this.mmc3.irqPending = true;
      }
    }
  }

  clearIRQ() {
    if (this.mapper === 4) this.mmc3.irqPending = false;
  }

  hasIRQ() {
    return this.mapper === 4 && this.mmc3.irqPending;
  }

  ppuReadMMC3(addr) {
    const total1k = this.chr.length >> 10;
    if (total1k <= 0) return 0;

    const r = this.mmc3.regs;
    let bank = 0;

    if (!this.mmc3.chrMode) {
      if (addr < 0x0800) bank = (r[0] & 0xFE) + ((addr >> 10) & 1);
      else if (addr < 0x1000) bank = (r[1] & 0xFE) + ((addr >> 10) & 1);
      else if (addr < 0x1400) bank = r[2];
      else if (addr < 0x1800) bank = r[3];
      else if (addr < 0x1C00) bank = r[4];
      else bank = r[5];
    } else {
      if (addr < 0x0400) bank = r[2];
      else if (addr < 0x0800) bank = r[3];
      else if (addr < 0x0C00) bank = r[4];
      else if (addr < 0x1000) bank = r[5];
      else if (addr < 0x1800) bank = (r[0] & 0xFE) + ((addr >> 10) & 1);
      else bank = (r[1] & 0xFE) + ((addr >> 10) & 1);
    }

    bank %= total1k;
    const offset = bank * 0x400 + (addr & 0x3FF);
    return this.chr[offset % this.chr.length];
  }
}


class SimpleAPU {
  constructor(bus = null) {
    this.bus = bus;

    this.regs = new Uint8Array(0x18);

    this.audioCtx = null;
    this.masterGain = null;
    this.compressor = null;
    this.filter = null;

    this.enabled = false;
    this.muted = false;

    this.channels = [];
    this.noise = null;
    this.dmc = null;

    this.dutyWaves = {};

    this.lengthTable = [
      10,254,20,2,40,4,80,6,160,8,60,10,14,12,26,14,
      12,16,24,18,48,20,96,22,192,24,72,26,16,28,32,30
    ];

    this.lengthCounters = [0, 0, 0, 0];

    this.env = [
      { volume: 15, divider: 0, start: false },
      { volume: 15, divider: 0, start: false },
      { volume: 15, divider: 0, start: false }
    ];

    this.sweep = [
      { divider: 0 },
      { divider: 0 }
    ];

    this.triangleLinear = {
      counter: 0,
      reload: false
    };

    this.frameStep = 0;
  }

  start() {
    if (this.enabled) {
      if (this.audioCtx && this.audioCtx.state === "suspended") this.audioCtx.resume();
      this.setMuted(false);
      this.updateAll();
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.audioCtx = new AudioCtx();

    this.masterGain = this.audioCtx.createGain();
    this.masterGain.gain.value = 0.30;

    this.filter = this.audioCtx.createBiquadFilter();
    this.filter.type = "lowpass";
    this.filter.frequency.value = 12000;
    this.filter.Q.value = 0.4;

    this.compressor = this.audioCtx.createDynamicsCompressor();
    this.compressor.threshold.value = -20;
    this.compressor.knee.value = 18;
    this.compressor.ratio.value = 5;
    this.compressor.attack.value = 0.003;
    this.compressor.release.value = 0.12;

    this.masterGain.connect(this.filter);
    this.filter.connect(this.compressor);
    this.compressor.connect(this.audioCtx.destination);

    this.channels = [
      this.createOsc("pulse"),
      this.createOsc("pulse"),
      this.createOsc("triangle")
    ];

    this.noise = this.createNoiseChannel();
    this.dmc = this.createDMCChannel();

    this.enabled = true;
    this.updateAll();
  }

  createOsc(kind) {
    const osc = this.audioCtx.createOscillator();
    const gain = this.audioCtx.createGain();

    if (kind === "triangle") {
      osc.type = "triangle";
    } else {
      osc.setPeriodicWave(this.getDutyWave(2));
    }

    osc.frequency.value = 440;
    gain.gain.value = 0;

    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();

    return { osc, gain, duty: 2, timer: 0 };
  }

  getDutyWave(dutyIndex) {
    if (this.dutyWaves[dutyIndex]) return this.dutyWaves[dutyIndex];

    const dutyTable = [0.125, 0.25, 0.50, 0.75];
    const duty = dutyTable[dutyIndex] || 0.5;
    const harmonics = 48;

    const real = new Float32Array(harmonics);
    const imag = new Float32Array(harmonics);

    for (let n = 1; n < harmonics; n++) {
      real[n] = 0;
      imag[n] = (2 / (Math.PI * n)) * Math.sin(Math.PI * n * duty);
    }

    this.dutyWaves[dutyIndex] = this.audioCtx.createPeriodicWave(real, imag, {
      disableNormalization: false
    });

    return this.dutyWaves[dutyIndex];
  }

  createNoiseChannel() {
    const node = this.audioCtx.createScriptProcessor(1024, 0, 1);
    const gain = this.audioCtx.createGain();

    const state = {
      lfsr: 1,
      phase: 0,
      freq: 4400,
      mode: 0,
      output: 0
    };

    node.onaudioprocess = (event) => {
      const out = event.outputBuffer.getChannelData(0);
      const sr = this.audioCtx.sampleRate;
      const step = Math.max(1, state.freq) / sr;

      for (let i = 0; i < out.length; i++) {
        state.phase += step;

        while (state.phase >= 1) {
          state.phase -= 1;

          const tap = state.mode ? 6 : 1;
          const feedback = (state.lfsr & 1) ^ ((state.lfsr >> tap) & 1);
          state.lfsr = (state.lfsr >> 1) | (feedback << 14);
          state.output = (state.lfsr & 1) ? 1 : -1;
        }

        out[i] = state.output;
      }
    };

    node.connect(gain);
    gain.connect(this.masterGain);
    gain.gain.value = 0;

    return { node, gain, state };
  }

  createDMCChannel() {
    const node = this.audioCtx.createScriptProcessor(1024, 0, 1);
    const gain = this.audioCtx.createGain();

    const state = {
      phase: 0,
      freq: 4181,
      outputLevel: 64,
      sampleAddress: 0xC000,
      currentAddress: 0xC000,
      sampleLength: 1,
      bytesRemaining: 0,
      shiftRegister: 0,
      bitsRemaining: 0,
      silence: true,
      loop: false,
      irqEnable: false
    };

    node.onaudioprocess = (event) => {
      const out = event.outputBuffer.getChannelData(0);
      const sr = this.audioCtx.sampleRate;
      const step = Math.max(1, state.freq) / sr;

      for (let i = 0; i < out.length; i++) {
        state.phase += step;

        while (state.phase >= 1) {
          state.phase -= 1;
          this.dmcClockSample(state);
        }

        out[i] = ((state.outputLevel - 64) / 64);
      }
    };

    node.connect(gain);
    gain.connect(this.masterGain);
    gain.gain.value = 0;

    return { node, gain, state };
  }

  dmcClockSample(state) {
    if (state.bitsRemaining === 0) {
      if (state.bytesRemaining === 0) {
        if (state.loop && state.sampleLength > 0) {
          state.currentAddress = state.sampleAddress;
          state.bytesRemaining = state.sampleLength;
        } else {
          state.silence = true;
          return;
        }
      }

      if (this.bus && this.bus.cart && state.bytesRemaining > 0) {
        state.shiftRegister = this.bus.cart.cpuRead(state.currentAddress);
        state.currentAddress++;
        if (state.currentAddress > 0xFFFF) state.currentAddress = 0x8000;
        state.bytesRemaining--;
        state.bitsRemaining = 8;
        state.silence = false;
      }
    }

    if (!state.silence) {
      if (state.shiftRegister & 1) {
        if (state.outputLevel <= 125) state.outputLevel += 2;
      } else {
        if (state.outputLevel >= 2) state.outputLevel -= 2;
      }

      state.shiftRegister >>= 1;
      state.bitsRemaining--;
    }
  }

  reset() {
    this.regs.fill(0);
    this.lengthCounters.fill(0);

    for (const e of this.env) {
      e.volume = 15;
      e.divider = 0;
      e.start = true;
    }

    this.triangleLinear.counter = 0;
    this.triangleLinear.reload = false;
    this.frameStep = 0;

    if (this.dmc) {
      this.dmc.state.outputLevel = 64;
      this.dmc.state.bytesRemaining = 0;
      this.dmc.state.bitsRemaining = 0;
      this.dmc.state.silence = true;
    }

    this.updateAll();
  }

  setMuted(value) {
    this.muted = value;
    if (!this.masterGain || !this.audioCtx) return;

    const target = value ? 0 : 0.30;
    this.masterGain.gain.setTargetAtTime(target, this.audioCtx.currentTime, 0.025);
  }

  readRegister(addr) {
    if (addr === 0x4015) {
      let v = 0;
      if (this.lengthCounters[0] > 0) v |= 0x01;
      if (this.lengthCounters[1] > 0) v |= 0x02;
      if (this.lengthCounters[2] > 0) v |= 0x04;
      if (this.lengthCounters[3] > 0) v |= 0x08;
      if (this.dmc && this.dmc.state.bytesRemaining > 0) v |= 0x10;
      return v;
    }

    return 0;
  }

  writeRegister(addr, value) {
    const index = addr - 0x4000;
    if (index < 0 || index >= this.regs.length) return;

    this.regs[index] = value & 0xFF;

    if (addr === 0x4003) {
      this.loadLength(0, value);
      this.env[0].start = true;
    } else if (addr === 0x4007) {
      this.loadLength(1, value);
      this.env[1].start = true;
    } else if (addr === 0x400B) {
      this.loadLength(2, value);
      this.triangleLinear.reload = true;
    } else if (addr === 0x400F) {
      this.loadLength(3, value);
      this.env[2].start = true;
    } else if (addr === 0x4015) {
      if (!(value & 0x01)) this.lengthCounters[0] = 0;
      if (!(value & 0x02)) this.lengthCounters[1] = 0;
      if (!(value & 0x04)) this.lengthCounters[2] = 0;
      if (!(value & 0x08)) this.lengthCounters[3] = 0;

      if (this.dmc) {
        if (!(value & 0x10)) {
          this.dmc.state.bytesRemaining = 0;
          this.dmc.state.bitsRemaining = 0;
          this.dmc.state.silence = true;
        } else if (this.dmc.state.bytesRemaining === 0) {
          this.restartDMC();
        }
      }
    } else if (addr === 0x4011 && this.dmc) {
      this.dmc.state.outputLevel = value & 0x7F;
    }

    if (!this.enabled) return;

    if (addr >= 0x4000 && addr <= 0x4003) {
      this.updatePulse(0, 0x00, 0x01);
    } else if (addr >= 0x4004 && addr <= 0x4007) {
      this.updatePulse(1, 0x04, 0x02);
    } else if (addr >= 0x4008 && addr <= 0x400B) {
      this.updateTriangle();
    } else if (addr >= 0x400C && addr <= 0x400F) {
      this.updateNoise();
    } else if (addr >= 0x4010 && addr <= 0x4013) {
      this.updateDMC();
    } else if (addr === 0x4015 || addr === 0x4017) {
      this.updateAll();
    }
  }

  loadLength(channel, highRegisterValue) {
    const enabledMask = [0x01, 0x02, 0x04, 0x08][channel];
    if (!(this.regs[0x15] & enabledMask)) return;

    const index = (highRegisterValue >> 3) & 0x1F;
    this.lengthCounters[channel] = this.lengthTable[index] || 0;
  }

  clockFrameSequencer() {
    this.frameStep = (this.frameStep + 1) & 3;

    this.clockEnvelopes();
    this.clockTriangleLinear();

    if (this.frameStep === 1 || this.frameStep === 3) {
      this.clockLengthCounters();
      this.clockSweep(0, 0x00, 0x01);
      this.clockSweep(1, 0x04, 0x02);
    }

    this.updateAll();
  }

  clockEnvelopes() {
    this.clockEnvelopeUnit(0, this.regs[0x00]);
    this.clockEnvelopeUnit(1, this.regs[0x04]);
    this.clockEnvelopeUnit(2, this.regs[0x0C]);
  }

  clockEnvelopeUnit(index, reg) {
    const env = this.env[index];
    const period = reg & 0x0F;
    const loop = !!(reg & 0x20);

    if (env.start) {
      env.start = false;
      env.volume = 15;
      env.divider = period;
      return;
    }

    if (env.divider > 0) {
      env.divider--;
    } else {
      env.divider = period;

      if (env.volume > 0) {
        env.volume--;
      } else if (loop) {
        env.volume = 15;
      }
    }
  }

  clockTriangleLinear() {
    const reg = this.regs[0x08];
    const reloadValue = reg & 0x7F;
    const control = !!(reg & 0x80);

    if (this.triangleLinear.reload) {
      this.triangleLinear.counter = reloadValue;
    } else if (this.triangleLinear.counter > 0) {
      this.triangleLinear.counter--;
    }

    if (!control) {
      this.triangleLinear.reload = false;
    }
  }

  clockLengthCounters() {
    const halt0 = !!(this.regs[0x00] & 0x20);
    const halt1 = !!(this.regs[0x04] & 0x20);
    const halt2 = !!(this.regs[0x08] & 0x80);
    const halt3 = !!(this.regs[0x0C] & 0x20);

    if (!halt0 && this.lengthCounters[0] > 0) this.lengthCounters[0]--;
    if (!halt1 && this.lengthCounters[1] > 0) this.lengthCounters[1]--;
    if (!halt2 && this.lengthCounters[2] > 0) this.lengthCounters[2]--;
    if (!halt3 && this.lengthCounters[3] > 0) this.lengthCounters[3]--;
  }

  clockSweep(channel, base, enableBit) {
    const sweepReg = this.regs[base + 1];
    const enabled = !!(sweepReg & 0x80);
    const period = (sweepReg >> 4) & 0x07;
    const negate = !!(sweepReg & 0x08);
    const shift = sweepReg & 0x07;

    if (!enabled || shift === 0 || this.lengthCounters[channel] <= 0) return;

    const sw = this.sweep[channel];

    if (sw.divider > 0) {
      sw.divider--;
      return;
    }

    sw.divider = period || 1;

    let timer = this.regs[base + 2] | ((this.regs[base + 3] & 0x07) << 8);
    const change = timer >> shift;

    if (negate) {
      timer -= change + (channel === 0 ? 1 : 0);
    } else {
      timer += change;
    }

    if (timer >= 8 && timer <= 0x7FF) {
      this.regs[base + 2] = timer & 0xFF;
      this.regs[base + 3] = (this.regs[base + 3] & 0xF8) | ((timer >> 8) & 0x07);
    }
  }

  updateAll() {
    if (!this.enabled) return;

    this.updatePulse(0, 0x00, 0x01);
    this.updatePulse(1, 0x04, 0x02);
    this.updateTriangle();
    this.updateNoise();
    this.updateDMC();
  }

  envelopeVolume(index, regValue, fallback = 10) {
    const constantVolume = !!(regValue & 0x10);
    const raw = regValue & 0x0F;

    if (constantVolume) return raw;

    const env = this.env[index];
    return env ? env.volume : fallback;
  }

  updatePulse(channelIndex, base, enableBit) {
    const ch = this.channels[channelIndex];
    if (!ch || !this.audioCtx) return;

    const enabled = !!(this.regs[0x15] & enableBit);
    const duty = (this.regs[base] >> 6) & 0x03;
    const vol = this.envelopeVolume(channelIndex, this.regs[base], 10);
    const timer = this.regs[base + 2] | ((this.regs[base + 3] & 0x07) << 8);

    if (ch.duty !== duty) {
      ch.osc.setPeriodicWave(this.getDutyWave(duty));
      ch.duty = duty;
    }

    if (!enabled || timer < 8 || this.lengthCounters[channelIndex] <= 0) {
      ch.gain.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.006);
      return;
    }

    const freq = CPU_CLOCK / (16 * (timer + 1));
    const gain = Math.min(0.060, (vol / 15) * 0.060);

    ch.timer = timer;
    ch.osc.frequency.setTargetAtTime(
      Math.max(20, Math.min(12000, freq)),
      this.audioCtx.currentTime,
      0.0018
    );

    ch.gain.gain.setTargetAtTime(gain, this.audioCtx.currentTime, 0.006);
  }

  updateTriangle() {
    const ch = this.channels[2];
    if (!ch || !this.audioCtx) return;

    const enabled = !!(this.regs[0x15] & 0x04);
    const timer = this.regs[0x0A] | ((this.regs[0x0B] & 0x07) << 8);

    if (!enabled || timer < 2 || this.lengthCounters[2] <= 0 || this.triangleLinear.counter <= 0) {
      ch.gain.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.006);
      return;
    }

    const freq = CPU_CLOCK / (32 * (timer + 1));

    ch.osc.frequency.setTargetAtTime(
      Math.max(20, Math.min(12000, freq)),
      this.audioCtx.currentTime,
      0.0018
    );

    ch.gain.gain.setTargetAtTime(0.048, this.audioCtx.currentTime, 0.006);
  }

  updateNoise() {
    if (!this.noise || !this.audioCtx) return;

    const enabled = !!(this.regs[0x15] & 0x08);
    const vol = this.envelopeVolume(2, this.regs[0x0C], 9);
    const mode = (this.regs[0x0E] >> 7) & 1;
    const periodIndex = this.regs[0x0E] & 0x0F;

    const noisePeriods = [
      4, 8, 16, 32, 64, 96, 128, 160,
      202, 254, 380, 508, 762, 1016, 2034, 4068
    ];

    const period = noisePeriods[periodIndex] || 4;
    const freq = CPU_CLOCK / period;

    this.noise.state.freq = Math.max(60, Math.min(24000, freq));
    this.noise.state.mode = mode;

    if (!enabled || this.lengthCounters[3] <= 0) {
      this.noise.gain.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.005);
      return;
    }

    const gain = Math.min(0.075, (vol / 15) * 0.075);
    this.noise.gain.gain.setTargetAtTime(gain, this.audioCtx.currentTime, 0.005);
  }

  restartDMC() {
    if (!this.dmc) return;

    const s = this.dmc.state;
    s.sampleAddress = 0xC000 + ((this.regs[0x12] & 0xFF) << 6);
    s.currentAddress = s.sampleAddress;
    s.sampleLength = ((this.regs[0x13] & 0xFF) << 4) + 1;
    s.bytesRemaining = s.sampleLength;
    s.bitsRemaining = 0;
    s.silence = false;
  }

  updateDMC() {
    if (!this.dmc || !this.audioCtx) return;

    const enabled = !!(this.regs[0x15] & 0x10);
    const rateIndex = this.regs[0x10] & 0x0F;
    const direct = this.regs[0x11] & 0x7F;

    const dmcPeriods = [
      428, 380, 340, 320, 286, 254, 226, 214,
      190, 160, 142, 128, 106, 85, 72, 54
    ];

    const period = dmcPeriods[rateIndex] || 428;
    const freq = CPU_CLOCK / period;

    this.dmc.state.freq = Math.max(1000, Math.min(34000, freq));
    this.dmc.state.outputLevel = direct;
    this.dmc.state.loop = !!(this.regs[0x10] & 0x40);
    this.dmc.state.irqEnable = !!(this.regs[0x10] & 0x80);
    this.dmc.state.sampleAddress = 0xC000 + ((this.regs[0x12] & 0xFF) << 6);
    this.dmc.state.sampleLength = ((this.regs[0x13] & 0xFF) << 4) + 1;

    if (!enabled) {
      this.dmc.gain.gain.setTargetAtTime(0, this.audioCtx.currentTime, 0.008);
      return;
    }

    if (this.dmc.state.bytesRemaining === 0) {
      this.restartDMC();
    }

    this.dmc.gain.gain.setTargetAtTime(0.030, this.audioCtx.currentTime, 0.008);
  }
}

class Bus {
  constructor() {
    this.ram = new Uint8Array(2048);
    this.cart = null;
    this.ppu = null;
    this.apu = null;
    this.controller = 0;
    this.controllerShift = 0;
    this.controllerStrobe = 0;
  }

  read(addr) {
    addr &= 0xFFFF;

    if (addr < 0x2000) return this.ram[addr & 0x07FF];

    if (addr < 0x4000) return this.ppu.cpuRead(0x2000 + (addr & 7));

    if (addr === 0x4016) {
      if (this.controllerStrobe) {
        return (this.controller & 0x80) ? 1 : 0;
      }

      const value = (this.controllerShift & 0x80) ? 1 : 0;
      this.controllerShift = (this.controllerShift << 1) & 0xFF;
      return value;
    }

    if (addr >= 0x4000 && addr <= 0x4017) {
      return this.apu ? this.apu.readRegister(addr) : 0;
    }

    if (addr >= 0x8000) return this.cart ? this.cart.cpuRead(addr) : 0;

    return 0;
  }

  write(addr, value) {
    addr &= 0xFFFF;
    value &= 0xFF;

    if (addr < 0x2000) {
      this.ram[addr & 0x07FF] = value;
      return;
    }

    if (addr < 0x4000) {
      this.ppu.cpuWrite(0x2000 + (addr & 7), value);
      return;
    }

    if (addr === 0x4014) {
      // OAM DMA simplificado.
      const page = value << 8;
      for (let i = 0; i < 256; i++) {
        this.ppu.oam[i] = this.read(page + i);
      }
      return;
    }

    if (addr === 0x4016) {
      this.controllerStrobe = value & 1;
      if (this.controllerStrobe) this.controllerShift = this.controller;
      return;
    }

    if (addr >= 0x4000 && addr <= 0x4017) {
      if (this.apu) this.apu.writeRegister(addr, value);
      return;
    }

    if (addr >= 0x8000 && this.cart && this.cart.cpuWrite) {
      this.cart.cpuWrite(addr, value);
      return;
    }
  }
}


class CPU6502 {
  constructor(bus) {
    this.bus = bus;
    this.a = 0;
    this.x = 0;
    this.y = 0;
    this.sp = 0xFD;
    this.pc = 0;
    this.p = 0x24;
    this.cycles = 0;
  }

  // Flags
  C(){return this.p & 0x01}
  Z(){return this.p & 0x02}
  I(){return this.p & 0x04}
  D(){return this.p & 0x08}
  B(){return this.p & 0x10}
  U(){return this.p & 0x20}
  V(){return this.p & 0x40}
  N(){return this.p & 0x80}

  set(flag, v) {
    if (v) this.p |= flag;
    else this.p &= ~flag;
    this.p |= 0x20;
  }

  setZN(v) {
    v &= 0xFF;
    this.set(0x02, v === 0);
    this.set(0x80, v & 0x80);
  }

  read(a){ return this.bus.read(a & 0xFFFF); }
  write(a,v){ this.bus.write(a & 0xFFFF, v & 0xFF); }

  reset() {
    this.a = 0;
    this.x = 0;
    this.y = 0;
    this.sp = 0xFD;
    this.p = 0x24;
    this.pc = this.read(0xFFFC) | (this.read(0xFFFD) << 8);
    this.cycles = 7;
  }

  nmi() {
    this.push((this.pc >> 8) & 0xFF);
    this.push(this.pc & 0xFF);
    this.set(0x10, false);
    this.set(0x20, true);
    this.push(this.p);
    this.set(0x04, true);
    this.pc = this.read(0xFFFA) | (this.read(0xFFFB) << 8);
    this.cycles = 8;
  }

  irq() {
    if (this.I()) return;
    this.push((this.pc >> 8) & 0xFF);
    this.push(this.pc & 0xFF);
    this.set(0x10, false);
    this.set(0x20, true);
    this.push(this.p);
    this.set(0x04, true);
    this.pc = this.read(0xFFFE) | (this.read(0xFFFF) << 8);
    this.cycles = 7;
  }

  push(v) {
    this.write(0x0100 + this.sp, v);
    this.sp = (this.sp - 1) & 0xFF;
  }

  pull() {
    this.sp = (this.sp + 1) & 0xFF;
    return this.read(0x0100 + this.sp);
  }

  fetch() {
    const v = this.read(this.pc);
    this.pc = (this.pc + 1) & 0xFFFF;
    return v;
  }

  imm(){ return this.pc++; }
  zp(){ return this.fetch(); }
  zpx(){ return (this.fetch() + this.x) & 0xFF; }
  zpy(){ return (this.fetch() + this.y) & 0xFF; }

  abs(){
    const lo = this.fetch();
    const hi = this.fetch();
    return lo | (hi << 8);
  }

  absx(){ return (this.abs() + this.x) & 0xFFFF; }
  absy(){ return (this.abs() + this.y) & 0xFFFF; }

  indx(){
    const t = (this.fetch() + this.x) & 0xFF;
    return this.read(t) | (this.read((t + 1) & 0xFF) << 8);
  }

  indy(){
    const t = this.fetch();
    return ((this.read(t) | (this.read((t + 1) & 0xFF) << 8)) + this.y) & 0xFFFF;
  }

  branch(cond) {
    const off = this.fetch();
    if (cond) {
      const rel = off < 0x80 ? off : off - 256;
      this.pc = (this.pc + rel) & 0xFFFF;
      this.cycles++;
    }
  }

  adc(v) {
    v &= 0xFF;
    const sum = this.a + v + (this.C() ? 1 : 0);
    this.set(0x01, sum > 0xFF);
    this.set(0x40, (~(this.a ^ v) & (this.a ^ sum) & 0x80));
    this.a = sum & 0xFF;
    this.setZN(this.a);
  }

  sbc(v) {
    this.adc((v ^ 0xFF) & 0xFF);
  }

  cmp(r, v) {
    r &= 0xFF;
    v &= 0xFF;
    const t = (r - v) & 0x1FF;
    this.set(0x01, r >= v);
    this.setZN(t & 0xFF);
  }

  and(v){ this.a &= v; this.a &= 0xFF; this.setZN(this.a); }
  ora(v){ this.a |= v; this.a &= 0xFF; this.setZN(this.a); }
  eor(v){ this.a ^= v; this.a &= 0xFF; this.setZN(this.a); }

  aslVal(v) {
    this.set(0x01, v & 0x80);
    v = (v << 1) & 0xFF;
    this.setZN(v);
    return v;
  }

  lsrVal(v) {
    this.set(0x01, v & 0x01);
    v = (v >> 1) & 0xFF;
    this.setZN(v);
    return v;
  }

  rolVal(v) {
    const oldCarry = this.C() ? 1 : 0;
    this.set(0x01, v & 0x80);
    v = ((v << 1) | oldCarry) & 0xFF;
    this.setZN(v);
    return v;
  }

  rorVal(v) {
    const oldCarry = this.C() ? 0x80 : 0;
    this.set(0x01, v & 0x01);
    v = ((v >> 1) | oldCarry) & 0xFF;
    this.setZN(v);
    return v;
  }

  bit(v) {
    this.set(0x02, (this.a & v) === 0);
    this.set(0x40, v & 0x40);
    this.set(0x80, v & 0x80);
  }

  inc(addr) {
    const v = (this.read(addr) + 1) & 0xFF;
    this.write(addr, v);
    this.setZN(v);
  }

  dec(addr) {
    const v = (this.read(addr) - 1) & 0xFF;
    this.write(addr, v);
    this.setZN(v);
  }

  step() {
    if (this.cycles > 0) {
      this.cycles--;
      return;
    }

    const opAddr = this.pc;
    const op = this.fetch();

    switch(op) {
      // ORA
      case 0x09: this.ora(this.read(this.imm())); this.cycles=2; break;
      case 0x05: this.ora(this.read(this.zp())); this.cycles=3; break;
      case 0x15: this.ora(this.read(this.zpx())); this.cycles=4; break;
      case 0x0D: this.ora(this.read(this.abs())); this.cycles=4; break;
      case 0x1D: this.ora(this.read(this.absx())); this.cycles=4; break;
      case 0x19: this.ora(this.read(this.absy())); this.cycles=4; break;
      case 0x01: this.ora(this.read(this.indx())); this.cycles=6; break;
      case 0x11: this.ora(this.read(this.indy())); this.cycles=5; break;

      // AND
      case 0x29: this.and(this.read(this.imm())); this.cycles=2; break;
      case 0x25: this.and(this.read(this.zp())); this.cycles=3; break;
      case 0x35: this.and(this.read(this.zpx())); this.cycles=4; break;
      case 0x2D: this.and(this.read(this.abs())); this.cycles=4; break;
      case 0x3D: this.and(this.read(this.absx())); this.cycles=4; break;
      case 0x39: this.and(this.read(this.absy())); this.cycles=4; break;
      case 0x21: this.and(this.read(this.indx())); this.cycles=6; break;
      case 0x31: this.and(this.read(this.indy())); this.cycles=5; break;

      // EOR
      case 0x49: this.eor(this.read(this.imm())); this.cycles=2; break;
      case 0x45: this.eor(this.read(this.zp())); this.cycles=3; break;
      case 0x55: this.eor(this.read(this.zpx())); this.cycles=4; break;
      case 0x4D: this.eor(this.read(this.abs())); this.cycles=4; break;
      case 0x5D: this.eor(this.read(this.absx())); this.cycles=4; break;
      case 0x59: this.eor(this.read(this.absy())); this.cycles=4; break;
      case 0x41: this.eor(this.read(this.indx())); this.cycles=6; break;
      case 0x51: this.eor(this.read(this.indy())); this.cycles=5; break;

      // ADC
      case 0x69: this.adc(this.read(this.imm())); this.cycles=2; break;
      case 0x65: this.adc(this.read(this.zp())); this.cycles=3; break;
      case 0x75: this.adc(this.read(this.zpx())); this.cycles=4; break;
      case 0x6D: this.adc(this.read(this.abs())); this.cycles=4; break;
      case 0x7D: this.adc(this.read(this.absx())); this.cycles=4; break;
      case 0x79: this.adc(this.read(this.absy())); this.cycles=4; break;
      case 0x61: this.adc(this.read(this.indx())); this.cycles=6; break;
      case 0x71: this.adc(this.read(this.indy())); this.cycles=5; break;

      // SBC
      case 0xE9: case 0xEB: this.sbc(this.read(this.imm())); this.cycles=2; break;
      case 0xE5: this.sbc(this.read(this.zp())); this.cycles=3; break;
      case 0xF5: this.sbc(this.read(this.zpx())); this.cycles=4; break;
      case 0xED: this.sbc(this.read(this.abs())); this.cycles=4; break;
      case 0xFD: this.sbc(this.read(this.absx())); this.cycles=4; break;
      case 0xF9: this.sbc(this.read(this.absy())); this.cycles=4; break;
      case 0xE1: this.sbc(this.read(this.indx())); this.cycles=6; break;
      case 0xF1: this.sbc(this.read(this.indy())); this.cycles=5; break;

      // LDA
      case 0xA9: this.a=this.read(this.imm()); this.setZN(this.a); this.cycles=2; break;
      case 0xA5: this.a=this.read(this.zp()); this.setZN(this.a); this.cycles=3; break;
      case 0xB5: this.a=this.read(this.zpx()); this.setZN(this.a); this.cycles=4; break;
      case 0xAD: this.a=this.read(this.abs()); this.setZN(this.a); this.cycles=4; break;
      case 0xBD: this.a=this.read(this.absx()); this.setZN(this.a); this.cycles=4; break;
      case 0xB9: this.a=this.read(this.absy()); this.setZN(this.a); this.cycles=4; break;
      case 0xA1: this.a=this.read(this.indx()); this.setZN(this.a); this.cycles=6; break;
      case 0xB1: this.a=this.read(this.indy()); this.setZN(this.a); this.cycles=5; break;

      // LDX
      case 0xA2: this.x=this.read(this.imm()); this.setZN(this.x); this.cycles=2; break;
      case 0xA6: this.x=this.read(this.zp()); this.setZN(this.x); this.cycles=3; break;
      case 0xB6: this.x=this.read(this.zpy()); this.setZN(this.x); this.cycles=4; break;
      case 0xAE: this.x=this.read(this.abs()); this.setZN(this.x); this.cycles=4; break;
      case 0xBE: this.x=this.read(this.absy()); this.setZN(this.x); this.cycles=4; break;

      // LDY
      case 0xA0: this.y=this.read(this.imm()); this.setZN(this.y); this.cycles=2; break;
      case 0xA4: this.y=this.read(this.zp()); this.setZN(this.y); this.cycles=3; break;
      case 0xB4: this.y=this.read(this.zpx()); this.setZN(this.y); this.cycles=4; break;
      case 0xAC: this.y=this.read(this.abs()); this.setZN(this.y); this.cycles=4; break;
      case 0xBC: this.y=this.read(this.absx()); this.setZN(this.y); this.cycles=4; break;

      // STA/STX/STY
      case 0x85: this.write(this.zp(), this.a); this.cycles=3; break;
      case 0x95: this.write(this.zpx(), this.a); this.cycles=4; break;
      case 0x8D: this.write(this.abs(), this.a); this.cycles=4; break;
      case 0x9D: this.write(this.absx(), this.a); this.cycles=5; break;
      case 0x99: this.write(this.absy(), this.a); this.cycles=5; break;
      case 0x81: this.write(this.indx(), this.a); this.cycles=6; break;
      case 0x91: this.write(this.indy(), this.a); this.cycles=6; break;

      case 0x86: this.write(this.zp(), this.x); this.cycles=3; break;
      case 0x96: this.write(this.zpy(), this.x); this.cycles=4; break;
      case 0x8E: this.write(this.abs(), this.x); this.cycles=4; break;

      case 0x84: this.write(this.zp(), this.y); this.cycles=3; break;
      case 0x94: this.write(this.zpx(), this.y); this.cycles=4; break;
      case 0x8C: this.write(this.abs(), this.y); this.cycles=4; break;

      // ASL
      case 0x0A: this.a = this.aslVal(this.a); this.cycles=2; break;
      case 0x06: { const a=this.zp(); this.write(a,this.aslVal(this.read(a))); this.cycles=5; break; }
      case 0x16: { const a=this.zpx(); this.write(a,this.aslVal(this.read(a))); this.cycles=6; break; }
      case 0x0E: { const a=this.abs(); this.write(a,this.aslVal(this.read(a))); this.cycles=6; break; }
      case 0x1E: { const a=this.absx(); this.write(a,this.aslVal(this.read(a))); this.cycles=7; break; }

      // LSR
      case 0x4A: this.a = this.lsrVal(this.a); this.cycles=2; break;
      case 0x46: { const a=this.zp(); this.write(a,this.lsrVal(this.read(a))); this.cycles=5; break; }
      case 0x56: { const a=this.zpx(); this.write(a,this.lsrVal(this.read(a))); this.cycles=6; break; }
      case 0x4E: { const a=this.abs(); this.write(a,this.lsrVal(this.read(a))); this.cycles=6; break; }
      case 0x5E: { const a=this.absx(); this.write(a,this.lsrVal(this.read(a))); this.cycles=7; break; }

      // ROL
      case 0x2A: this.a = this.rolVal(this.a); this.cycles=2; break;
      case 0x26: { const a=this.zp(); this.write(a,this.rolVal(this.read(a))); this.cycles=5; break; }
      case 0x36: { const a=this.zpx(); this.write(a,this.rolVal(this.read(a))); this.cycles=6; break; }
      case 0x2E: { const a=this.abs(); this.write(a,this.rolVal(this.read(a))); this.cycles=6; break; }
      case 0x3E: { const a=this.absx(); this.write(a,this.rolVal(this.read(a))); this.cycles=7; break; }

      // ROR
      case 0x6A: this.a = this.rorVal(this.a); this.cycles=2; break;
      case 0x66: { const a=this.zp(); this.write(a,this.rorVal(this.read(a))); this.cycles=5; break; }
      case 0x76: { const a=this.zpx(); this.write(a,this.rorVal(this.read(a))); this.cycles=6; break; }
      case 0x6E: { const a=this.abs(); this.write(a,this.rorVal(this.read(a))); this.cycles=6; break; }
      case 0x7E: { const a=this.absx(); this.write(a,this.rorVal(this.read(a))); this.cycles=7; break; }

      // INC/DEC
      case 0xE6: this.inc(this.zp()); this.cycles=5; break;
      case 0xF6: this.inc(this.zpx()); this.cycles=6; break;
      case 0xEE: this.inc(this.abs()); this.cycles=6; break;
      case 0xFE: this.inc(this.absx()); this.cycles=7; break;

      case 0xC6: this.dec(this.zp()); this.cycles=5; break;
      case 0xD6: this.dec(this.zpx()); this.cycles=6; break;
      case 0xCE: this.dec(this.abs()); this.cycles=6; break;
      case 0xDE: this.dec(this.absx()); this.cycles=7; break;

      // CMP/CPX/CPY
      case 0xC9: this.cmp(this.a,this.read(this.imm())); this.cycles=2; break;
      case 0xC5: this.cmp(this.a,this.read(this.zp())); this.cycles=3; break;
      case 0xD5: this.cmp(this.a,this.read(this.zpx())); this.cycles=4; break;
      case 0xCD: this.cmp(this.a,this.read(this.abs())); this.cycles=4; break;
      case 0xDD: this.cmp(this.a,this.read(this.absx())); this.cycles=4; break;
      case 0xD9: this.cmp(this.a,this.read(this.absy())); this.cycles=4; break;
      case 0xC1: this.cmp(this.a,this.read(this.indx())); this.cycles=6; break;
      case 0xD1: this.cmp(this.a,this.read(this.indy())); this.cycles=5; break;

      case 0xE0: this.cmp(this.x,this.read(this.imm())); this.cycles=2; break;
      case 0xE4: this.cmp(this.x,this.read(this.zp())); this.cycles=3; break;
      case 0xEC: this.cmp(this.x,this.read(this.abs())); this.cycles=4; break;

      case 0xC0: this.cmp(this.y,this.read(this.imm())); this.cycles=2; break;
      case 0xC4: this.cmp(this.y,this.read(this.zp())); this.cycles=3; break;
      case 0xCC: this.cmp(this.y,this.read(this.abs())); this.cycles=4; break;

      // BIT
      case 0x24: this.bit(this.read(this.zp())); this.cycles=3; break;
      case 0x2C: this.bit(this.read(this.abs())); this.cycles=4; break;

      // Transfers
      case 0xAA: this.x=this.a; this.setZN(this.x); this.cycles=2; break;
      case 0xA8: this.y=this.a; this.setZN(this.y); this.cycles=2; break;
      case 0x8A: this.a=this.x; this.setZN(this.a); this.cycles=2; break;
      case 0x98: this.a=this.y; this.setZN(this.a); this.cycles=2; break;
      case 0xBA: this.x=this.sp; this.setZN(this.x); this.cycles=2; break;
      case 0x9A: this.sp=this.x; this.cycles=2; break;

      // Register inc/dec
      case 0xE8: this.x=(this.x+1)&255; this.setZN(this.x); this.cycles=2; break;
      case 0xC8: this.y=(this.y+1)&255; this.setZN(this.y); this.cycles=2; break;
      case 0xCA: this.x=(this.x-1)&255; this.setZN(this.x); this.cycles=2; break;
      case 0x88: this.y=(this.y-1)&255; this.setZN(this.y); this.cycles=2; break;

      // Jumps/subroutines
      case 0x4C: this.pc=this.abs(); this.cycles=3; break;
      case 0x6C: {
        const a=this.abs();
        const lo=this.read(a);
        const hi=this.read((a&0xFF00)|((a+1)&0xFF));
        this.pc=lo|(hi<<8);
        this.cycles=5;
        break;
      }
      case 0x20: {
        const addr=this.abs();
        const ret=(this.pc-1)&0xFFFF;
        this.push((ret>>8)&255);
        this.push(ret&255);
        this.pc=addr;
        this.cycles=6;
        break;
      }
      case 0x60: {
        const lo=this.pull();
        const hi=this.pull();
        this.pc=((lo|(hi<<8))+1)&0xFFFF;
        this.cycles=6;
        break;
      }
      case 0x40: {
        this.p=this.pull();
        this.p |= 0x20;
        const lo=this.pull();
        const hi=this.pull();
        this.pc=lo|(hi<<8);
        this.cycles=6;
        break;
      }

      // Branches
      case 0xD0: this.branch(!this.Z()); this.cycles=2; break;
      case 0xF0: this.branch(this.Z()); this.cycles=2; break;
      case 0x10: this.branch(!this.N()); this.cycles=2; break;
      case 0x30: this.branch(this.N()); this.cycles=2; break;
      case 0x90: this.branch(!this.C()); this.cycles=2; break;
      case 0xB0: this.branch(this.C()); this.cycles=2; break;
      case 0x50: this.branch(!this.V()); this.cycles=2; break;
      case 0x70: this.branch(this.V()); this.cycles=2; break;

      // Flags
      case 0x18: this.set(0x01,false); this.cycles=2; break;
      case 0x38: this.set(0x01,true); this.cycles=2; break;
      case 0x58: this.set(0x04,false); this.cycles=2; break;
      case 0x78: this.set(0x04,true); this.cycles=2; break;
      case 0xB8: this.set(0x40,false); this.cycles=2; break;
      case 0xD8: this.set(0x08,false); this.cycles=2; break;
      case 0xF8: this.set(0x08,true); this.cycles=2; break;

      // Stack
      case 0x48: this.push(this.a); this.cycles=3; break;
      case 0x68: this.a=this.pull(); this.setZN(this.a); this.cycles=4; break;
      case 0x08: this.push(this.p | 0x30); this.cycles=3; break;
      case 0x28: this.p=this.pull(); this.p |= 0x20; this.cycles=4; break;

      // NOP/BRK
      case 0xEA: this.cycles=2; break;
      case 0x00:
        this.pc = (this.pc + 1) & 0xFFFF;
        this.push((this.pc >> 8) & 255);
        this.push(this.pc & 255);
        this.push(this.p | 0x30);
        this.set(0x04,true);
        this.pc = this.read(0xFFFE) | (this.read(0xFFFF) << 8);
        this.cycles = 7;
        break;

      // Alguns NOPs não oficiais comuns. Não fazem operação, mas evitam travar em ROMs que usam padding.
      case 0x1A: case 0x3A: case 0x5A: case 0x7A: case 0xDA: case 0xFA:
        this.cycles = 2;
        break;

      default:
        throw new Error("Opcode não implementado: $" + op.toString(16).padStart(2,"0") + " PC=$" + opAddr.toString(16));
    }

    this.cycles--;
  }
}

class PPU {
  constructor(bus) {
    this.bus = bus;

    this.ctrl = 0;
    this.mask = 0;
    this.status = 0xA0;

    this.oamAddr = 0;
    this.oam = new Uint8Array(256);

    this.vram = new Uint8Array(2048);
    this.palette = new Uint8Array(32);

    this.ppuAddr = 0;
    this.tempAddr = 0;
    this.fineX = 0;
    this.writeToggle = 0;

    // Correção importante:
    // tempAddr é alterado por $2006 quando o jogo escreve na VRAM.
    // Se usarmos tempAddr diretamente como scroll, a tela quebra.
    // Por isso mantemos o scroll visível separado.
    this.scrollX = 0;
    this.scrollY = 0;
    this.scrollNt = 0;

    this.readBuffer = 0;

    this.cycles = 0;
    this.scanline = 0;
    this.frame = 0;
    this.nmiRequested = false;

    this.frameRendered = false;

    // v14: perfil inteligente por ROM.
    // Por padrão, tudo fica desligado para não quebrar jogos MMC3.
    this.spriteZeroFallback = false;
    this.lockTopStatusBarScroll = false;
    this.statusBarHeight = 0;
  }

  reset() {
    this.ctrl = 0;
    this.mask = 0;
    this.status = 0xA0;
    this.oamAddr = 0;
    this.ppuAddr = 0;
    this.tempAddr = 0;
    this.fineX = 0;
    this.writeToggle = 0;
    this.scrollX = 0;
    this.scrollY = 0;
    this.scrollNt = 0;
    this.readBuffer = 0;
    this.cycles = 0;
    this.scanline = 0;
    this.frame = 0;
    this.nmiRequested = false;
    this.frameRendered = false;

    // Recarrega o perfil da ROM a cada reset.
    this.applyGameProfile();

    bgOpaque.fill(0);
  }

  applyGameProfile() {
    const profile = this.bus.cart && this.bus.cart.profile
      ? this.bus.cart.profile
      : {
          name: "generic",
          lockTopStatusBarScroll: false,
          statusBarHeight: 0,
          spriteZeroFallback: false
        };

    this.spriteZeroFallback = !!profile.spriteZeroFallback;
    this.lockTopStatusBarScroll = !!profile.lockTopStatusBarScroll;
    this.statusBarHeight = profile.statusBarHeight || 0;
  }

  paletteMirrorIndex(addr) {
    let index = (addr - 0x3F00) & 0x1F;
    if (index === 0x10) index = 0x00;
    if (index === 0x14) index = 0x04;
    if (index === 0x18) index = 0x08;
    if (index === 0x1C) index = 0x0C;
    return index;
  }

  mirrorNametableAddr(addr) {
    let v = (addr - 0x2000) & 0x0FFF;
    const table = Math.floor(v / 0x400);
    const offset = v & 0x03FF;

    if (!this.bus.cart) return offset & 0x07FF;

    if (this.bus.cart.mirroring === "vertical") {
      return ((table & 1) * 0x400 + offset) & 0x07FF;
    }

    return (((table >> 1) & 1) * 0x400 + offset) & 0x07FF;
  }

  ppuRead(addr) {
    addr &= 0x3FFF;

    if (addr < 0x2000) {
      return this.bus.cart ? this.bus.cart.ppuRead(addr) : 0;
    }

    if (addr < 0x3F00) {
      return this.vram[this.mirrorNametableAddr(addr)];
    }

    return this.palette[this.paletteMirrorIndex(addr)] & 0x3F;
  }

  ppuWrite(addr, value) {
    addr &= 0x3FFF;
    value &= 0xFF;

    if (addr < 0x2000) {
      if (this.bus.cart) this.bus.cart.ppuWrite(addr, value);
      return;
    }

    if (addr < 0x3F00) {
      this.vram[this.mirrorNametableAddr(addr)] = value;
      return;
    }

    this.palette[this.paletteMirrorIndex(addr)] = value & 0x3F;
  }

  cpuRead(addr) {
    const r = addr & 7;

    if (r === 2) {
      this.maybeForceSpriteZeroHit();

      const v = this.status;
      this.status &= ~0x80;
      this.writeToggle = 0;
      return v;
    }

    if (r === 4) {
      return this.oam[this.oamAddr & 0xFF];
    }

    if (r === 7) {
      const addrNow = this.ppuAddr & 0x3FFF;
      let value;

      if (addrNow < 0x3F00) {
        value = this.readBuffer;
        this.readBuffer = this.ppuRead(addrNow);
      } else {
        value = this.ppuRead(addrNow);
        this.readBuffer = this.ppuRead(addrNow - 0x1000);
      }

      this.ppuAddr = (this.ppuAddr + ((this.ctrl & 0x04) ? 32 : 1)) & 0x7FFF;
      return value;
    }

    return 0;
  }

  cpuWrite(addr, value) {
    const r = addr & 7;
    value &= 0xFF;

    if (r === 0) {
      this.ctrl = value;
      this.scrollNt = value & 0x03;
      this.tempAddr = (this.tempAddr & 0xF3FF) | ((value & 0x03) << 10);
      return;
    }

    if (r === 1) {
      this.mask = value;
      return;
    }

    if (r === 3) {
      this.oamAddr = value;
      return;
    }

    if (r === 4) {
      this.oam[this.oamAddr & 0xFF] = value;
      this.oamAddr = (this.oamAddr + 1) & 0xFF;
      return;
    }

    if (r === 5) {
      if (this.writeToggle === 0) {
        this.fineX = value & 0x07;
        this.scrollX = value & 0xFF;
        this.tempAddr = (this.tempAddr & 0xFFE0) | (value >> 3);
        this.writeToggle = 1;
      } else {
        this.scrollY = value & 0xFF;
        this.tempAddr = (this.tempAddr & 0x8FFF) | ((value & 0x07) << 12);
        this.tempAddr = (this.tempAddr & 0xFC1F) | ((value & 0xF8) << 2);
        this.writeToggle = 0;
      }
      return;
    }

    if (r === 6) {
      // $2006 é endereço de VRAM. Ele não pode destruir o scroll visível usado
      // pelo renderizador simplificado.
      if (this.writeToggle === 0) {
        this.tempAddr = (this.tempAddr & 0x00FF) | ((value & 0x3F) << 8);
        this.writeToggle = 1;
      } else {
        this.tempAddr = (this.tempAddr & 0x7F00) | value;
        this.ppuAddr = this.tempAddr;
        this.writeToggle = 0;
      }
      return;
    }

    if (r === 7) {
      this.ppuWrite(this.ppuAddr, value);
      this.ppuAddr = (this.ppuAddr + ((this.ctrl & 0x04) ? 32 : 1)) & 0x7FFF;
      return;
    }
  }

  tick() {
    this.tickFast(1);
  }

  tickFast(ppuCycles) {
    while (ppuCycles > 0) {
      const oldCycles = this.cycles;
      const toScanlineEnd = 341 - this.cycles;
      const step = Math.min(ppuCycles, toScanlineEnd);

      this.cycles += step;
      ppuCycles -= step;

      // Fallback específico de Super Mario Bros.
      // Desligado para MMC3/Shadow para manter a renderização boa da v8.
      if (
        this.spriteZeroFallback &&
        !(this.status & 0x40) &&
        this.scanline >= (this.statusBarHeight || 32) &&
        this.scanline < 240 &&
        oldCycles < 240 &&
        this.cycles >= 240 &&
        (this.mask & 0x18) === 0x18
      ) {
        this.status |= 0x40;
      }

      // Clock aproximado do IRQ MMC3 por scanline.
      if (oldCycles < 260 && this.cycles >= 260 && this.scanline >= 0 && this.scanline < 240) {
        if (this.bus.cart && this.bus.cart.mapper === 4 && (this.mask & 0x18)) {
          this.bus.cart.clockIRQ();
        }
      }

      if (this.cycles >= 341) {
        // Renderiza a scanline logo ao terminar a linha, usando os registradores
        // do momento. Isso melhora jogos que mudam scroll/bancos no meio do frame.
        if (this.scanline >= 0 && this.scanline < 240) {
          this.renderScanline(this.scanline);
        }

        this.cycles = 0;
        this.scanline++;

        if (this.scanline === 241) {
          this.status |= 0x80;
          this.presentFrame();

          if (this.ctrl & 0x80) {
            this.nmiRequested = true;
          }
        }

        if (this.scanline >= 262) {
          this.scanline = 0;
          this.status &= ~0x80;
          this.status &= ~0x40;
          this.status &= ~0x20;
          this.frame++;
          this.frameRendered = false;
          bgOpaque.fill(0);
        }
      }
    }
  }

  maybeForceSpriteZeroHit() {
    if (!this.spriteZeroFallback) return;
    if (this.status & 0x40) return;
    if ((this.mask & 0x18) !== 0x18) return;

    const minLine = this.statusBarHeight || 32;
    if (this.scanline < minLine || this.scanline >= 240) return;

    // Fallback específico de SMB:
    // evita o loop infinito esperando sprite zero hit, sem afetar Shadow/MMC3.
    this.status |= 0x40;
  }

  getBgPixelForLine(x, y) {
    const bgColor = this.ppuRead(0x3F00) & 0x3F;

    if (!(this.mask & 0x08)) {
      return {
        colorIndex: bgColor,
        opaque: false
      };
    }

    // Clipping dos 8 pixels esquerdos, usado em muitos jogos.
    if (x < 8 && !(this.mask & 0x02)) {
      return {
        colorIndex: bgColor,
        opaque: false
      };
    }

    let effectiveScrollX = this.scrollX;
    let effectiveScrollY = this.scrollY;
    let baseNt = this.scrollNt & 0x03;

    // HUD fix inteligente:
    // só aplica para perfil SMB/NROM. Shadow/MMC3 fica com a PPU v14 original.
    if (this.lockTopStatusBarScroll && y < this.statusBarHeight) {
      effectiveScrollX = 0;
      effectiveScrollY = 0;
      baseNt = 0;
    }

    let worldX = (x + effectiveScrollX) & 0x1FF;
    let worldY = (y + effectiveScrollY) & 0x1FF;

    let ntX = (baseNt & 1) ^ (worldX >= 256 ? 1 : 0);
    let ntY = ((baseNt >> 1) & 1) ^ (worldY >= 240 ? 1 : 0);

    const ntBase = 0x2000 + (ntY * 2 + ntX) * 0x400;

    const localX = worldX & 0xFF;
    const localY = worldY % 240;

    const tileX = localX >> 3;
    const tileY = localY >> 3;
    const fineY = localY & 7;
    const finePixelX = localX & 7;

    const tileIndex = this.ppuRead(ntBase + tileY * 32 + tileX);

    const attrAddr = ntBase + 0x03C0 + ((tileY >> 2) * 8) + (tileX >> 2);
    const attrByte = this.ppuRead(attrAddr);
    const shift = ((tileY & 2) ? 4 : 0) + ((tileX & 2) ? 2 : 0);
    const paletteId = (attrByte >> shift) & 0x03;

    const patternBase = (this.ctrl & 0x10) ? 0x1000 : 0x0000;
    const tileAddr = patternBase + tileIndex * 16 + fineY;
    const lo = this.ppuRead(tileAddr);
    const hi = this.ppuRead(tileAddr + 8);
    const bit = 7 - finePixelX;

    const colorBits = ((lo >> bit) & 1) | (((hi >> bit) & 1) << 1);

    if (colorBits === 0) {
      return {
        colorIndex: bgColor,
        opaque: false
      };
    }

    return {
      colorIndex: this.ppuRead(0x3F00 + paletteId * 4 + colorBits) & 0x3F,
      opaque: true
    };
  }

  renderBackgroundLine(y) {
    const data = imageData.data;

    for (let x = 0; x < SCREEN_W; x++) {
      const bg = this.getBgPixelForLine(x, y);
      const p = y * SCREEN_W + x;
      bgOpaque[p] = bg.opaque ? 1 : 0;

      const rgb = NES_PALETTE[bg.colorIndex % NES_PALETTE.length];
      const idx = p * 4;

      data[idx] = rgb[0];
      data[idx + 1] = rgb[1];
      data[idx + 2] = rgb[2];
      data[idx + 3] = 255;
    }
  }

  renderSpriteLine(y) {
    if (!(this.mask & 0x10)) return;

    // Clipping dos sprites nos 8 pixels esquerdos.
    const clipLeftSprites = !(this.mask & 0x04);

    const data = imageData.data;
    const spriteSize16 = !!(this.ctrl & 0x20);
    const spriteHeight = spriteSize16 ? 16 : 8;

    // Desenha do índice maior para o menor para preservar prioridade.
    for (let i = 63; i >= 0; i--) {
      const o = i * 4;
      const sy = this.oam[o] + 1;
      const tile = this.oam[o + 1];
      const attr = this.oam[o + 2];
      const sx = this.oam[o + 3];

      if (y < sy || y >= sy + spriteHeight) continue;

      const priorityBehindBg = !!(attr & 0x20);
      const flipH = !!(attr & 0x40);
      const flipV = !!(attr & 0x80);
      const paletteId = attr & 0x03;

      let py = y - sy;
      if (flipV) py = spriteHeight - 1 - py;

      let patternAddr;

      if (spriteSize16) {
        const table = (tile & 1) ? 0x1000 : 0x0000;
        const baseTile = tile & 0xFE;
        const tileOffset = py >= 8 ? 1 : 0;
        patternAddr = table + (baseTile + tileOffset) * 16 + (py & 7);
      } else {
        const table = (this.ctrl & 0x08) ? 0x1000 : 0x0000;
        patternAddr = table + tile * 16 + py;
      }

      const lo = this.ppuRead(patternAddr);
      const hi = this.ppuRead(patternAddr + 8);

      for (let col = 0; col < 8; col++) {
        const x = sx + col;
        if (x < 0 || x >= SCREEN_W) continue;
        if (clipLeftSprites && x < 8) continue;

        const px = flipH ? col : (7 - col);
        const colorBits = ((lo >> px) & 1) | (((hi >> px) & 1) << 1);
        if (colorBits === 0) continue;

        const p = y * SCREEN_W + x;

        if (i === 0 && bgOpaque[p] && x < 255 && y < 240) {
          this.status |= 0x40;
        }

        if (priorityBehindBg && bgOpaque[p]) continue;

        const colorIndex = this.ppuRead(0x3F10 + paletteId * 4 + colorBits) & 0x3F;
        const rgb = NES_PALETTE[colorIndex % NES_PALETTE.length];
        const idx = p * 4;

        data[idx] = rgb[0];
        data[idx + 1] = rgb[1];
        data[idx + 2] = rgb[2];
        data[idx + 3] = 255;
      }
    }
  }

  renderScanline(y) {
    this.renderBackgroundLine(y);
    this.renderSpriteLine(y);
  }

  presentFrame() {
    if (this.frameRendered) return;
    this.frameRendered = true;
    ctx.putImageData(imageData, 0, 0);
  }

  // Mantido por compatibilidade com chamadas antigas/debug.
  renderFrame() {
    bgOpaque.fill(0);
    this.status &= ~0x40;

    for (let y = 0; y < SCREEN_H; y++) {
      this.renderScanline(y);
    }

    this.presentFrame();
  }
}

class NES {
  constructor() {
    this.bus = new Bus();
    this.ppu = new PPU(this.bus);
    this.apu = new SimpleAPU(this.bus);

    this.bus.ppu = this.ppu;
    this.bus.apu = this.apu;

    this.cpu = new CPU6502(this.bus);

    this.running = false;
    this.paused = false;

    this.statusBase = "Status: aguardando ROM .nes";
    this.fpsCounter = 0;
    this.fps = 0;
    this.lastFpsTime = performance.now();
  }

  load(bytes) {
    this.bus.cart = new Cartridge(bytes);
    this.bus.ram.fill(0);
    this.ppu.reset();
    this.ppu.applyGameProfile();
    this.apu.reset();
    this.cpu.reset();

    this.statusBase =
      `Status: ROM carregada | PRG: ${this.bus.cart.prgBanks} | CHR: ${this.bus.cart.chrBanks} | Mapper: ${this.bus.cart.mapper}${this.bus.cart.mapper === 4 ? " / MMC3 experimental" : ""} | Mirror: ${this.bus.cart.mirroring} | Perfil: ${this.bus.cart.profile.name}`;

    statusEl.textContent = this.statusBase + " | Som: APU v7 + PPU v14";
  }

  reset() {
    if (!this.bus.cart) return;
    this.cpu.reset();
    this.ppu.reset();
    this.apu.reset();
    statusEl.textContent = this.statusBase + " | Reset aplicado";
  }

  runFrame() {
    for (let i = 0; i < FRAME_CPU_CYCLES; i++) {
      try {
        this.cpu.step();
      } catch (e) {
        this.running = false;
        this.apu.setMuted(true);
        statusEl.textContent = "Erro: " + e.message;
        console.error(e);
        break;
      }

      this.ppu.tickFast(3);

      if (this.ppu.nmiRequested) {
        this.ppu.nmiRequested = false;
        this.cpu.nmi();
      }

      if (this.bus.cart && this.bus.cart.hasIRQ && this.bus.cart.hasIRQ()) {
        this.bus.cart.clearIRQ();
        this.cpu.irq();
      }
    }

    // Frame counter aproximado da APU: 4 passos por frame NTSC.
    for (let q = 0; q < 4; q++) {
      this.apu.clockFrameSequencer();
    }
  }

  loop(timestamp) {
    if (!this.running) return;

    if (!this.paused) {
      this.runFrame();
      this.fpsCounter++;
    }

    if (timestamp - this.lastFpsTime >= 1000) {
      this.fps = this.fpsCounter;
      this.fpsCounter = 0;
      this.lastFpsTime = timestamp;

      if (this.bus.cart) {
        statusEl.textContent =
          `${this.statusBase} | FPS: ${this.fps} | Som: ${this.apu.enabled ? "APU v7 ativo | PPU v14" : "clique em Rodar para ativar"}`;
      }
    }

    requestAnimationFrame((t) => this.loop(t));
  }

  start() {
    if (!this.bus.cart) {
      statusEl.textContent = "Status: carregue uma ROM .nes primeiro.";
      return;
    }

    // O navegador só libera áudio depois de uma ação do usuário.
    this.apu.start();

    if (!this.running) {
      this.running = true;
      this.paused = false;
      this.loop(performance.now());
    } else {
      this.paused = false;
      this.apu.setMuted(false);
    }
  }

  pause() {
    this.paused = !this.paused;
    this.apu.setMuted(this.paused);
    statusEl.textContent = this.statusBase + (this.paused ? " | Pausado" : " | Executando");
  }
}

const nes = new NES();

document.getElementById("romInput").addEventListener("change", async e => {
  const file = e.target.files[0];
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    nes.load(bytes);
  } catch (err) {
    statusEl.textContent = "Erro: " + err.message;
  }
});

document.getElementById("btnRun").onclick = () => nes.start();
document.getElementById("btnReset").onclick = () => nes.reset();
document.getElementById("btnPause").onclick = () => nes.pause();

const keys = {};
window.addEventListener("keydown", e => {
  keys[e.code] = true;
  updateController();
  if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space"].includes(e.code)) e.preventDefault();
});
window.addEventListener("keyup", e => {
  keys[e.code] = false;
  updateController();
});

function updateController() {
  let c = 0;
  if (keys["KeyZ"]) c |= 1 << 7;       // A
  if (keys["KeyX"]) c |= 1 << 6;       // B
  if (keys["ShiftLeft"] || keys["ShiftRight"]) c |= 1 << 5; // Select
  if (keys["Enter"]) c |= 1 << 4;      // Start
  if (keys["ArrowUp"]) c |= 1 << 3;
  if (keys["ArrowDown"]) c |= 1 << 2;
  if (keys["ArrowLeft"]) c |= 1 << 1;
  if (keys["ArrowRight"]) c |= 1 << 0;
  nes.bus.controller = c;
}

// tela inicial
for (let y = 0; y < SCREEN_H; y++) {
  for (let x = 0; x < SCREEN_W; x++) {
    const i = (y * SCREEN_W + x) * 4;
    const v = ((x >> 4) ^ (y >> 4)) & 1 ? 35 : 20;
    imageData.data[i] = v;
    imageData.data[i+1] = v;
    imageData.data[i+2] = v + 20;
    imageData.data[i+3] = 255;
  }
}
ctx.putImageData(imageData, 0, 0);
