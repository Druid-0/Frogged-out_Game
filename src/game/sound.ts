import { PowerUpType } from "./rules";

export interface CroakSoundPreset {
  id: string;
  label: string;
  url: string;
}

export const LYAGUSHKA3_AUDIO_URL = "/assets/aistudio/lyagushka3_c7cf9b97.mp3";
export const FROG_LAUGH_AUDIO_URL = "/assets/aistudio/frog-laugh_7e868243.mp3";

export const FROG_CROAK_LIBRARY: CroakSoundPreset[] = [
  {
    id: "lyagushka3",
    label: "Лягушка (lyagushka3.mp3)",
    url: LYAGUSHKA3_AUDIO_URL,
  },
  {
    id: "frog_laugh",
    label: "Смех жабы (frog-laugh.mp3)",
    url: FROG_LAUGH_AUDIO_URL,
  },
  {
    id: "single",
    label: "Болотный Квак (single_frog_croak)",
    url: "/media/frog-sounds/single_frog_croak.mp3",
  },
  {
    id: "short_1",
    label: "Звонкий Квак (frog-sound-short)",
    url: "/media/frog-sounds/frog-sound-short.mp3",
  },
  {
    id: "short_2",
    label: "Быстрый Квак (frog-sound-short 1)",
    url: "/media/frog-sounds/frog-sound-short (1).mp3",
  },
  {
    id: "croaking",
    label: "Раскатистый Квак (frog-croaking)",
    url: "/media/frog-sounds/frog-croaking.mp3",
  },
  {
    id: "huge",
    label: "Царь-Жаба (huge-frog-croaking)",
    url: "/media/frog-sounds/huge-frog-croaking.mp3",
  },
  {
    id: "xiaomi",
    label: "Смешная Xiaomi-Жаба (xiaomi-frog)",
    url: "/media/frog-sounds/xiaomi-frog.mp3",
  },
  {
    id: "classic_ogg",
    label: "Дикий Квак (sound.ogg)",
    url: "/media/frog-sounds/sound.ogg",
  },
  {
    id: "classic_mp3",
    label: "Лесной Квак (sound.mp3)",
    url: "/media/frog-sounds/sound.mp3",
  },
];

class SoundEngine {
  private ctx: AudioContext | null = null;
  private decodedBuffers = new Map<string, AudioBuffer>();
  private loadingUrls = new Set<string>();
  private noiseBuffer: AudioBuffer | null = null;
  private lastSecretLaughTime = 0;

  public sfxVolume = 0.85;
  public musicVolume = 0.65;
  public croakOnJumpEnabled = true;
  public jumpBackgroundSfxEnabled = true;
  public selectedCroakId = "random"; // "random" or any id from FROG_CROAK_LIBRARY
  public isMuted = false;

  private getContext(): AudioContext | null {
    if (this.isMuted) return null;
    if (typeof window === "undefined") return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private getOrCreateNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const length = Math.floor(ctx.sampleRate * 0.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let lastOut = 0.0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      // Pinkish organic swamp noise
      data[i] = (lastOut + 0.06 * white) / 1.06;
      lastOut = data[i];
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  private preloadCroakLibrary(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    for (const item of FROG_CROAK_LIBRARY) {
      if (this.decodedBuffers.has(item.url) || this.loadingUrls.has(item.url)) {
        continue;
      }
      this.loadingUrls.add(item.url);
      fetch(encodeURI(item.url))
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("404"))))
        .then((buf) => ctx.decodeAudioData(buf))
        .then((audioBuf) => {
          this.decodedBuffers.set(item.url, audioBuf);
        })
        .catch(() => {
          // Graceful fallback to synth croak if asset fetch fails
        })
        .finally(() => {
          this.loadingUrls.delete(item.url);
        });
    }
  }

  private pitchJitter(base: number, range = 0.08): number {
    return base * (1 + (Math.random() * 2 - 1) * range);
  }

  public unlock(): void {
    this.getContext();
    this.preloadCroakLibrary();
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  public setSfxVolume(vol: number): void {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
  }

  public setMusicVolume(vol: number): void {
    this.musicVolume = Math.max(0, Math.min(1, vol));
  }

  /**
   * Проигрывает полный аудиофайл по URL через WebAudio (или HTMLAudioElement, если буфер ещё декодируется)
   */
  public playFullAudioFile(url: string, gainMultiplier = 0.78, rate = 1.0): void {
    if (this.isMuted || this.sfxVolume <= 0.01) return;
    const ctx = this.getContext();
    this.preloadCroakLibrary();

    const decoded = this.decodedBuffers.get(url);
    if (ctx && decoded) {
      const now = ctx.currentTime;
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      source.playbackRate.setValueAtTime(rate, now);

      const gain = ctx.createGain();
      const peakGain = Math.min(0.9, gainMultiplier * this.sfxVolume);
      gain.gain.setValueAtTime(peakGain, now);
      gain.gain.exponentialRampToValueAtTime(
        0.01,
        now + Math.max(0.15, decoded.duration)
      );

      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(now);
      return;
    }

    if (typeof Audio !== "undefined") {
      try {
        const audio = new Audio(url);
        audio.volume = Math.min(1, gainMultiplier * this.sfxVolume);
        audio.playbackRate = rate;
        audio.play().catch(() => {});
        return;
      } catch {
        // Fallback below
      }
    }

    this.playCroak();
  }

  /**
   * Звук при нажатии на 3D-лягушку в превью (lyagushka3.mp3)
   */
  public playFrogPreviewClick(): void {
    this.playFullAudioFile(LYAGUSHKA3_AUDIO_URL, 0.85, 1.0);
  }

  /**
   * Секретный звук смеха жабы при прыжке на триггер возле камеры (frog-laugh.mp3)
   */
  public playSecretFrogLaugh(): void {
    const nowMs = typeof performance !== "undefined" ? performance.now() : Date.now();
    if (nowMs - this.lastSecretLaughTime < 900) return;
    this.lastSecretLaughTime = nowMs;
    this.playFullAudioFile(FROG_LAUGH_AUDIO_URL, 0.9, 1.0);
  }

  /**
   * Воспроизводит звук кваканья из медиа-библиотеки (/media/frog-sounds/* и /assets/aistudio/*)
   * с поддержкой случайного выбора или конкретного пресета.
   */
  public playLibraryCroak(powerRatio = 0.75, customId?: string): void {
    if (this.isMuted || this.sfxVolume <= 0.01) return;
    const ctx = this.getContext();
    this.preloadCroakLibrary();

    const targetId = customId ?? this.selectedCroakId;
    let preset: CroakSoundPreset;
    if (targetId === "random") {
      // Pick one of the croaks from the library
      const pool = FROG_CROAK_LIBRARY.filter((c) => c.id !== "frog_laugh");
      preset = pool[Math.floor(Math.random() * pool.length)];
    } else {
      preset =
        FROG_CROAK_LIBRARY.find((c) => c.id === targetId) || FROG_CROAK_LIBRARY[0];
    }

    if (preset.id === "lyagushka3" || preset.id === "frog_laugh") {
      this.playFullAudioFile(preset.url, 0.82, 1.0);
      return;
    }

    const decoded = this.decodedBuffers.get(preset.url);
    if (ctx && decoded) {
      const now = ctx.currentTime;
      const source = ctx.createBufferSource();
      source.buffer = decoded;
      // Vary pitch slightly with jump power
      source.playbackRate.setValueAtTime(
        this.pitchJitter(0.92 + powerRatio * 0.22, 0.06),
        now
      );

      const gain = ctx.createGain();
      const maxDuration = Math.min(decoded.duration, 0.85);
      const peakGain = Math.min(0.65, (0.28 + powerRatio * 0.22) * this.sfxVolume);
      gain.gain.setValueAtTime(peakGain, now);
      gain.gain.exponentialRampToValueAtTime(0.008, now + maxDuration);

      source.connect(gain);
      gain.connect(ctx.destination);
      source.start(now, 0, maxDuration + 0.05);
      return;
    }

    // Fallback procedural croak while buffers decode
    this.playCroak();
  }

  /**
   * Фоновые звуки при прыжке:
   * шелест болотной листвы и камышей, свист ветра в ветвях и чавкающий отрыв от кочки.
   */
  public playJumpBackgroundAmbience(powerRatio = 0.7, isAirJump = false): void {
    if (this.isMuted || !this.jumpBackgroundSfxEnabled) return;
    const effVol = Math.max(this.sfxVolume * 0.6, this.musicVolume * 0.85);
    if (effVol <= 0.01) return;

    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. Шелест камышей / ветра при прыжке (полосовой фильтр по розовому шуму)
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = this.getOrCreateNoiseBuffer(ctx);

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    const startCenter = isAirJump ? 950 : 480 + powerRatio * 420;
    bandpass.frequency.setValueAtTime(startCenter, now);
    bandpass.frequency.exponentialRampToValueAtTime(startCenter * 1.75, now + 0.22);
    bandpass.Q.setValueAtTime(2.4, now);

    const noiseGain = ctx.createGain();
    const whooshPeak = Math.min(0.28, (0.12 + powerRatio * 0.14) * effVol);
    noiseGain.gain.setValueAtTime(0.001, now);
    noiseGain.gain.linearRampToValueAtTime(whooshPeak, now + 0.045);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

    noiseSource.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(ctx.destination);
    noiseSource.start(now);
    noiseSource.stop(now + 0.3);

    // 2. Мягкий болотный бульк / отрыв лап от мшистой кочки
    if (!isAirJump) {
      const bubbleOsc = ctx.createOscillator();
      const bubbleGain = ctx.createGain();
      bubbleOsc.type = "sine";
      const fStart = this.pitchJitter(95 + powerRatio * 35, 0.07);
      bubbleOsc.frequency.setValueAtTime(fStart, now);
      bubbleOsc.frequency.exponentialRampToValueAtTime(fStart * 2.4, now + 0.09);

      bubbleGain.gain.setValueAtTime(0.14 * effVol, now);
      bubbleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

      bubbleOsc.connect(bubbleGain);
      bubbleGain.connect(ctx.destination);
      bubbleOsc.start(now);
      bubbleOsc.stop(now + 0.12);
    }
  }

  public playLand(): void {
    const ctx = this.getContext();
    if (!ctx || this.sfxVolume <= 0.01) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.09);
    gain.gain.setValueAtTime(0.14 * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.11);
  }

  public playEliminated(): void {
    this.playStompHit(true);
  }

  /**
   * Полный звук прыжка:
   * 1) Упругий импульс прыжка
   * 2) Кваканье лягушки из библиотеки (/media/frog-sounds/*)
   * 3) Фоновые болотные звуки прыжка (шелест травы/камыша, ветер, отрыв от мха)
   */
  public playJump(powerRatio = 0.7, isAirJump = false, isLocalOrClose = true): void {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (this.sfxVolume > 0.01) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      const startFreq = this.pitchJitter(isAirJump ? 260 : 145 + powerRatio * 60);
      const endFreq = startFreq * (isAirJump ? 2.1 : 1.85);

      osc.type = isAirJump ? "triangle" : "sine";
      osc.frequency.setValueAtTime(startFreq, now);
      osc.frequency.exponentialRampToValueAtTime(endFreq, now + 0.14);

      const vol = Math.min(0.28, 0.14 * this.sfxVolume);
      gain.gain.setValueAtTime(vol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.17);
    }

    // Фоновый звук шелеста камышей/ветра и отрыва от кочки при каждом прыжке
    this.playJumpBackgroundAmbience(powerRatio, isAirJump);

    // Кваканье из библиотеки при прыжке
    if (this.croakOnJumpEnabled && isLocalOrClose) {
      this.playLibraryCroak(powerRatio);
    }
  }

  public playCroak(): void {
    const ctx = this.getContext();
    if (!ctx || this.sfxVolume <= 0.01) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const modGain = ctx.createGain();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    const base = this.pitchJitter(115, 0.12);
    osc.frequency.setValueAtTime(base, now);
    osc.frequency.linearRampToValueAtTime(base * 1.45, now + 0.09);
    osc.frequency.linearRampToValueAtTime(base * 0.9, now + 0.18);

    mod.type = "sine";
    mod.frequency.setValueAtTime(38, now);
    modGain.gain.setValueAtTime(35, now);

    const vol = Math.min(0.24, 0.14 * this.sfxVolume);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(vol, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);

    mod.connect(modGain);
    modGain.connect(osc.frequency);
    osc.connect(gain);
    gain.connect(ctx.destination);

    mod.start(now);
    osc.start(now);
    mod.stop(now + 0.2);
    osc.stop(now + 0.2);
  }

  public playStompHit(isLethal = false): void {
    const ctx = this.getContext();
    if (!ctx || this.sfxVolume <= 0.01) return;
    const now = ctx.currentTime;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = isLethal ? "sawtooth" : "triangle";
    osc.frequency.setValueAtTime(this.pitchJitter(190), now);
    osc.frequency.exponentialRampToValueAtTime(42, now + (isLethal ? 0.28 : 0.18));

    const vol = Math.min(0.45, (isLethal ? 0.34 : 0.25) * this.sfxVolume);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (isLethal ? 0.3 : 0.2));

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (isLethal ? 0.31 : 0.21));
  }

  public playBarkArmorBlock(): void {
    const ctx = this.getContext();
    if (!ctx || this.sfxVolume <= 0.01) return;
    const now = ctx.currentTime;
    const notes = [180, 125];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      const t = now + idx * 0.045;
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(65, t + 0.12);
      gain.gain.setValueAtTime(0.28 * this.sfxVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.15);
    });
  }

  public playBouncePad(isCenterFlower = false): void {
    const ctx = this.getContext();
    if (!ctx || this.sfxVolume <= 0.01) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    const f0 = isCenterFlower ? 180 : 150;
    const f1 = isCenterFlower ? 540 : 390;
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(f1, now + 0.22);

    gain.gain.setValueAtTime(0.24 * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  public playWaterSplash(): void {
    const ctx = this.getContext();
    if (!ctx || this.sfxVolume <= 0.01) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(95, now + 0.16);
    gain.gain.setValueAtTime(0.18 * this.sfxVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  public playBuffPickupByType(type: PowerUpType): void {
    const ctx = this.getContext();
    if (!ctx || this.sfxVolume <= 0.01) return;
    const now = ctx.currentTime;

    if (type === PowerUpType.BARK_ARMOR) {
      const freqs = [165, 220, 293.66];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "triangle";
        const t = now + idx * 0.045;
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.78, t + 0.12);
        gain.gain.setValueAtTime(0.24 * this.sfxVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.15);
      });
    } else if (type === PowerUpType.DOUBLE_JUMP) {
      const freqs = [587.33, 783.99, 987.77, 1174.66];
      freqs.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        const t = now + idx * 0.038;
        osc.frequency.setValueAtTime(freq, t);
        gain.gain.setValueAtTime(0.18 * this.sfxVolume, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + 0.13);
      });
    } else {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(210, now);
      osc.frequency.exponentialRampToValueAtTime(680, now + 0.22);
      gain.gain.setValueAtTime(0.2 * this.sfxVolume, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.25);
    }
  }

  public playVictory(): void {
    const ctx = this.getContext();
    if (!ctx || this.sfxVolume <= 0.01) return;
    const now = ctx.currentTime;
    const notes = [392.0, 493.88, 587.33, 783.99];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      const t = now + idx * 0.09;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.22 * this.sfxVolume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }
}

export const soundEngine = new SoundEngine();

