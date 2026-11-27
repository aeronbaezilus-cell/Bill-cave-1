import { Track } from '../types/music';

const EQ_BAND_FREQS = [60, 230, 910, 3600, 14000];

class CaveAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private eqFilters: BiquadFilterNode[] = [];
  private dryGain: GainNode | null = null;
  private wetGain: GainNode | null = null;
  private convolver: ConvolverNode | null = null;
  private analyser: AnalyserNode | null = null;

  private htmlAudio: HTMLAudioElement | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;

  private activeTrack: Track | null = null;
  private isPlaying = false;
  private currentTime = 0;
  private pendingSeekSeconds: number | null = null;
  private volume = 0.78;
  private caveReverb = false;
  private eqBands: [number, number, number, number, number] = [0, 0, 0, 0, 0];

  private onTimeUpdateCb: ((time: number) => void) | null = null;
  private onEndedCb: (() => void) | null = null;
  private onDurationCb: ((trackId: string, duration: number) => void) | null = null;

  public setCallbacks(
    onTimeUpdate: (time: number) => void,
    onEnded: () => void,
    onDuration?: (trackId: string, duration: number) => void
  ) {
    this.onTimeUpdateCb = onTimeUpdate;
    this.onEndedCb = onEnded;
    this.onDurationCb = onDuration ?? null;
  }

  private ensureContext() {
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;

      this.analyser = this.ctx.createAnalyser();
      this.analyser.fftSize = 64;
      this.analyser.smoothingTimeConstant = 0.82;

      this.eqFilters = EQ_BAND_FREQS.map((freq, idx) => {
        const filter = this.ctx!.createBiquadFilter();
        filter.type =
          idx === 0 ? 'lowshelf' : idx === EQ_BAND_FREQS.length - 1 ? 'highshelf' : 'peaking';
        filter.frequency.value = freq;
        filter.Q.value = 1.1;
        filter.gain.value = this.eqBands[idx];
        return filter;
      });

      for (let i = 0; i < this.eqFilters.length - 1; i++) {
        this.eqFilters[i].connect(this.eqFilters[i + 1]);
      }

      this.dryGain = this.ctx.createGain();
      this.dryGain.gain.value = this.caveReverb ? 0.72 : 1.0;

      this.wetGain = this.ctx.createGain();
      this.wetGain.gain.value = this.caveReverb ? 0.42 : 0.0;

      this.convolver = this.ctx.createConvolver();
      this.convolver.buffer = this.createCaveImpulse(2.6, 3.0);

      const lastEq = this.eqFilters[this.eqFilters.length - 1];
      lastEq.connect(this.dryGain);
      lastEq.connect(this.convolver);
      this.convolver.connect(this.wetGain);

      this.dryGain.connect(this.masterGain);
      this.wetGain.connect(this.masterGain);

      this.masterGain.connect(this.analyser);
      this.analyser.connect(this.ctx.destination);
    }

    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  private createCaveImpulse(duration: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * duration);
    const impulse = ctx.createBuffer(2, length, rate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const env = Math.pow(1 - i / length, decay);
        data[i] = (Math.random() * 2 - 1) * env * 0.55;
      }
    }
    return impulse;
  }

  private ensureHtmlAudio() {
    if (!this.htmlAudio) {
      this.htmlAudio = new Audio();
      this.htmlAudio.crossOrigin = 'anonymous';
      this.htmlAudio.preload = 'metadata';

      this.htmlAudio.addEventListener('loadedmetadata', () => {
        if (!this.htmlAudio) return;
        const realDuration =
          Number.isFinite(this.htmlAudio.duration) && this.htmlAudio.duration > 0
            ? Math.round(this.htmlAudio.duration)
            : null;
        if (realDuration && this.activeTrack) {
          this.onDurationCb?.(this.activeTrack.id, realDuration);
        }
        if (this.pendingSeekSeconds !== null) {
          const maxDur = realDuration ?? this.activeTrack?.duration ?? this.pendingSeekSeconds;
          const clamped = Math.max(0, Math.min(this.pendingSeekSeconds, maxDur));
          this.pendingSeekSeconds = null;
          this.htmlAudio.currentTime = clamped;
          this.currentTime = clamped;
          this.onTimeUpdateCb?.(clamped);
        }
      });

      this.htmlAudio.addEventListener('timeupdate', () => {
        if (!this.htmlAudio || this.pendingSeekSeconds !== null) return;
        this.currentTime = this.htmlAudio.currentTime;
        this.onTimeUpdateCb?.(this.currentTime);
      });

      this.htmlAudio.addEventListener('ended', () => {
        this.isPlaying = false;
        this.currentTime = 0;
        this.onEndedCb?.();
      });
    }

    if (!this.mediaSource && this.ctx) {
      this.mediaSource = this.ctx.createMediaElementSource(this.htmlAudio);
      this.mediaSource.connect(this.eqFilters[0]);
    }
  }

  public async loadTrack(track: Track, startSeconds = 0, autoplay = false) {
    if (!track.audioUrl) return;
    if (autoplay) {
      this.ensureContext();
    }
    this.ensureHtmlAudio();
    if (!this.htmlAudio) return;

    this.htmlAudio.pause();
    this.activeTrack = track;
    const clamped = Math.max(0, Math.min(startSeconds, Math.max(0, track.duration || startSeconds)));
    this.currentTime = clamped;
    this.isPlaying = autoplay;

    const sameSrc = this.htmlAudio.src === track.audioUrl;
    if (!sameSrc) {
      this.pendingSeekSeconds = clamped;
      this.htmlAudio.src = track.audioUrl;
      this.htmlAudio.load();
    } else if (this.htmlAudio.readyState >= 1) {
      this.pendingSeekSeconds = null;
      this.htmlAudio.currentTime = clamped;
    } else {
      this.pendingSeekSeconds = clamped;
    }

    this.onTimeUpdateCb?.(clamped);

    if (autoplay) {
      try {
        await this.htmlAudio.play();
      } catch {
        this.isPlaying = false;
      }
    }
  }

  public async playTrack(track: Track, startSeconds = 0) {
    await this.loadTrack(track, startSeconds, true);
  }

  public pause() {
    this.isPlaying = false;
    if (this.htmlAudio) {
      this.htmlAudio.pause();
      if (this.pendingSeekSeconds === null && Number.isFinite(this.htmlAudio.currentTime)) {
        this.currentTime = this.htmlAudio.currentTime;
      }
    }
  }

  public stop() {
    this.isPlaying = false;
    this.currentTime = 0;
    this.pendingSeekSeconds = null;
    if (this.htmlAudio) {
      this.htmlAudio.pause();
      if (this.htmlAudio.readyState >= 1) {
        this.htmlAudio.currentTime = 0;
      }
    }
    this.onTimeUpdateCb?.(0);
  }

  public async resume() {
    if (!this.activeTrack || !this.activeTrack.audioUrl) return;
    this.ensureContext();
    this.ensureHtmlAudio();
    if (!this.htmlAudio) return;

    if (this.htmlAudio.src !== this.activeTrack.audioUrl) {
      await this.loadTrack(this.activeTrack, this.currentTime, true);
      return;
    }

    this.isPlaying = true;
    try {
      await this.htmlAudio.play();
    } catch {
      this.isPlaying = false;
    }
  }

  public seek(seconds: number) {
    if (!this.activeTrack) return;
    const maxDur =
      this.htmlAudio && Number.isFinite(this.htmlAudio.duration) && this.htmlAudio.duration > 0
        ? this.htmlAudio.duration
        : this.activeTrack.duration;
    const clamped = Math.max(0, Math.min(seconds, maxDur));
    this.currentTime = clamped;
    this.onTimeUpdateCb?.(clamped);

    if (this.htmlAudio) {
      if (this.htmlAudio.readyState >= 1) {
        this.pendingSeekSeconds = null;
        this.htmlAudio.currentTime = clamped;
      } else {
        this.pendingSeekSeconds = clamped;
      }
    }
  }

  public getCurrentTime(): number {
    if (
      this.htmlAudio &&
      this.pendingSeekSeconds === null &&
      Number.isFinite(this.htmlAudio.currentTime) &&
      this.activeTrack
    ) {
      return this.htmlAudio.currentTime;
    }
    return this.currentTime;
  }

  public setVolume(val: number) {
    this.volume = Math.max(0, Math.min(1, val));
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.04);
    }
    if (this.htmlAudio) {
      this.htmlAudio.volume = this.volume;
    }
  }

  public setEqBands(bands: [number, number, number, number, number]) {
    this.eqBands = bands;
    if (this.eqFilters.length && this.ctx) {
      bands.forEach((db, idx) => {
        this.eqFilters[idx].gain.setTargetAtTime(db, this.ctx!.currentTime, 0.05);
      });
    }
  }

  public setCaveReverb(enabled: boolean) {
    this.caveReverb = enabled;
    if (this.dryGain && this.wetGain && this.ctx) {
      this.dryGain.gain.setTargetAtTime(enabled ? 0.72 : 1.0, this.ctx.currentTime, 0.06);
      this.wetGain.gain.setTargetAtTime(enabled ? 0.42 : 0.0, this.ctx.currentTime, 0.06);
    }
  }

  public getFrequencyBars(barCount = 12): number[] {
    if (!this.analyser || !this.isPlaying) {
      return Array(barCount).fill(0.12);
    }
    const data = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteFrequencyData(data);
    const step = Math.max(1, Math.floor(data.length / barCount));
    const bars: number[] = [];
    for (let i = 0; i < barCount; i++) {
      const val = data[i * step] ?? 0;
      bars.push(Math.max(0.12, Math.min(1, val / 220)));
    }
    return bars;
  }
}

export const audioEngine = new CaveAudioEngine();

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const totalSecs = Math.floor(seconds);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;
  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
