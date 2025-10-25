const EQ_FREQUENCIES = [80, 750, 3500];

const DEFAULT_STATE = {
  heroId: null,
  heroName: '',
  trackUrl: null,
  enabled: false,
  isPlaying: false,
  progress: 0,
  duration: 0,
  loop: true,
  volume: 0.72,
  eqEnabled: false,
  equalizer: { low: 0, mid: 0, high: 0 },
  reverbEnabled: false,
  reverbDetail: { mix: 0.3, decay: 1.8 },
  compressorEnabled: false,
  compressorDetail: { threshold: -28, ratio: 2.5, release: 0.25 },
};

const cloneState = state => ({
  ...state,
  equalizer: { ...state.equalizer },
  reverbDetail: { ...state.reverbDetail },
  compressorDetail: { ...state.compressorDetail },
});

class HeroAudioManager {
  constructor() {
    this.state = cloneState(DEFAULT_STATE);
    this.listeners = new Set();

    this.audio = null;
    this.audioContext = null;
    this.sourceNode = null;
    this.gainNode = null;
    this.eqNodes = [];
    this.reverbNode = null;
    this.reverbWetGain = null;
    this.reverbDryGain = null;
    this.reverbMerge = null;
    this.compressorNode = null;

    this.handleLoaded = this.handleLoaded.bind(this);
    this.handleTimeUpdate = this.handleTimeUpdate.bind(this);
    this.handleEnded = this.handleEnded.bind(this);
  }

  getState() {
    return cloneState(this.state);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit() {
    const snapshot = this.getState();
    this.listeners.forEach(listener => {
      try {
        listener(snapshot);
      } catch (error) {
        console.error('HeroAudioManager listener error:', error);
      }
    });
  }

  setState(patch) {
    const next = {
      ...this.state,
      ...patch,
      equalizer: patch.equalizer ? { ...patch.equalizer } : { ...this.state.equalizer },
      reverbDetail: patch.reverbDetail ? { ...patch.reverbDetail } : { ...this.state.reverbDetail },
      compressorDetail: patch.compressorDetail
        ? { ...patch.compressorDetail }
        : { ...this.state.compressorDetail },
    };

    this.state = next;
    this.emit();
  }

  ensureAudioElement() {
    if (typeof window === 'undefined') return null;
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.crossOrigin = 'anonymous';
      this.audio.loop = this.state.loop;
      this.audio.addEventListener('loadedmetadata', this.handleLoaded);
      this.audio.addEventListener('timeupdate', this.handleTimeUpdate);
      this.audio.addEventListener('ended', this.handleEnded);
    }
    return this.audio;
  }

  ensureAudioContext() {
    if (typeof window === 'undefined') return null;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!this.audioContext) {
      this.audioContext = new AudioContextClass();
    }
    return this.audioContext;
  }

  disconnectNode(node) {
    if (!node) return;
    try {
      node.disconnect();
    } catch (error) {
      // ignore
    }
  }

  ensureNodes() {
    const audio = this.ensureAudioElement();
    const context = this.ensureAudioContext();
    if (!audio || !context) return;

    if (!this.sourceNode) {
      this.sourceNode = context.createMediaElementSource(audio);
    }

    if (!this.gainNode) {
      this.gainNode = context.createGain();
      this.gainNode.gain.value = this.state.volume;
    }

    if (!this.eqNodes.length) {
      this.eqNodes = EQ_FREQUENCIES.map((frequency, index) => {
        const node = context.createBiquadFilter();
        node.type = 'peaking';
        node.frequency.value = frequency;
        node.Q.value = index === 1 ? 0.9 : 1.1;
        node.gain.value = 0;
        return node;
      });
    }

    if (!this.reverbNode) {
      this.reverbNode = context.createConvolver();
      this.reverbNode.normalize = true;
      this.refreshReverbBuffer();
    }

    if (!this.reverbWetGain) {
      this.reverbWetGain = context.createGain();
    }

    if (!this.reverbDryGain) {
      this.reverbDryGain = context.createGain();
    }

    if (!this.reverbMerge) {
      this.reverbMerge = context.createGain();
    }

    if (!this.compressorNode) {
      this.compressorNode = context.createDynamicsCompressor();
      this.compressorNode.attack.value = 0.003;
    }
  }

  refreshReverbBuffer() {
    if (!this.reverbNode) return;
    const context = this.audioContext;
    if (!context) return;
    const decaySeconds = Math.min(Math.max(this.state.reverbDetail.decay, 0.1), 6);
    const length = Math.floor(context.sampleRate * decaySeconds);
    const impulse = context.createBuffer(2, length, context.sampleRate);
    for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
      const channelData = impulse.getChannelData(channel);
      for (let i = 0; i < length; i += 1) {
        const random = Math.random() * 2 - 1;
        channelData[i] = random * (1 - i / length);
      }
    }
    this.reverbNode.buffer = impulse;
  }

  disconnectGraph() {
    this.eqNodes.forEach(node => this.disconnectNode(node));
    this.disconnectNode(this.reverbNode);
    this.disconnectNode(this.reverbWetGain);
    this.disconnectNode(this.reverbDryGain);
    this.disconnectNode(this.reverbMerge);
    this.disconnectNode(this.compressorNode);
    this.disconnectNode(this.gainNode);
  }

  connectGraph() {
    if (!this.audio || !this.audioContext || !this.sourceNode || !this.gainNode) return;

    this.disconnectGraph();

    let cursor = this.sourceNode;

    if (this.eqNodes.length) {
      const values = [
        this.state.equalizer.low,
        this.state.equalizer.mid,
        this.state.equalizer.high,
      ];
      this.eqNodes.forEach((node, index) => {
        node.frequency.value = EQ_FREQUENCIES[index];
        node.Q.value = index === 1 ? 0.9 : 1.1;
        node.gain.value = this.state.eqEnabled ? (values[index] ?? 0) : 0;
      });
      if (this.state.eqEnabled) {
        this.eqNodes.forEach(node => {
          cursor.connect(node);
          cursor = node;
        });
      }
    }

    let postEffectNode = cursor;

    if (
      this.state.reverbEnabled &&
      this.reverbNode &&
      this.reverbWetGain &&
      this.reverbDryGain &&
      this.reverbMerge
    ) {
      const mix = Math.min(Math.max(this.state.reverbDetail.mix, 0), 1);
      this.reverbDryGain.gain.value = Math.max(0, 1 - mix);
      this.reverbWetGain.gain.value = mix;

      cursor.connect(this.reverbDryGain);
      cursor.connect(this.reverbWetGain);
      this.reverbDryGain.connect(this.reverbMerge);
      this.reverbWetGain.connect(this.reverbNode);
      this.reverbNode.connect(this.reverbMerge);
      postEffectNode = this.reverbMerge;
    } else if (this.reverbDryGain) {
      this.reverbDryGain.gain.value = 1;
      cursor.connect(this.reverbDryGain);
      postEffectNode = this.reverbDryGain;
    }

    let dynamicsInput = postEffectNode;

    if (this.state.compressorEnabled && this.compressorNode) {
      const detail = this.state.compressorDetail;
      this.compressorNode.threshold.value = detail.threshold;
      this.compressorNode.ratio.value = detail.ratio;
      this.compressorNode.release.value = detail.release;
      dynamicsInput.connect(this.compressorNode);
      dynamicsInput = this.compressorNode;
    }

    dynamicsInput.connect(this.gainNode);
    this.gainNode.gain.value = this.state.volume;
    this.gainNode.connect(this.audioContext.destination);
  }

  async loadHeroTrack({ heroId, heroName, trackUrl, duration = 0, autoPlay = true, loop = true }) {
    const audio = this.ensureAudioElement();
    const context = this.ensureAudioContext();
    if (!audio) return;

    const url = trackUrl || null;
    const isSameTrack = this.state.trackUrl === url && this.state.heroId === heroId;

    this.setState({
      heroId: heroId || null,
      heroName: heroName || '',
      trackUrl: url,
      loop,
      duration,
    });

    audio.loop = loop;

    if (!url) {
      if (this.state.enabled) {
        audio.pause();
      }
      this.setState({ isPlaying: false, progress: 0 });
      return;
    }

    if (!isSameTrack || audio.src !== url) {
      audio.src = url;
      try {
        audio.load();
      } catch (error) {
        // ignore load errors
      }
    }

    if (duration && (!Number.isFinite(this.state.duration) || !this.state.duration)) {
      this.setState({ duration });
    }

    this.ensureNodes();
    if (context && context.state === 'suspended') {
      try {
        await context.resume();
      } catch (error) {
        // ignore
      }
    }
    this.refreshReverbBuffer();
    this.connectGraph();

    if (this.state.enabled && autoPlay) {
      try {
        await this.play();
      } catch (error) {
        // ignore autoplay rejection
      }
    }
  }

  async play() {
    if (!this.audio || !this.state.enabled || !this.state.trackUrl) {
      this.setState({ isPlaying: false });
      return;
    }
    const context = this.ensureAudioContext();
    if (context && context.state === 'suspended') {
      try {
        await context.resume();
      } catch (error) {
        // ignore resume failure
      }
    }
    try {
      await this.audio.play();
      this.setState({ isPlaying: true });
    } catch (error) {
      this.setState({ isPlaying: false });
      throw error;
    }
  }

  pause() {
    if (!this.audio) return;
    this.audio.pause();
    this.setState({ isPlaying: false });
  }

  stop() {
    if (!this.audio) return;
    this.audio.pause();
    this.audio.currentTime = 0;
    this.setState({ isPlaying: false, progress: 0 });
  }

  toggle() {
    if (!this.audio) return;
    if (this.audio.paused) {
      this.play().catch(() => {});
    } else {
      this.pause();
    }
  }

  seek(time) {
    if (!this.audio || !Number.isFinite(time)) return;
    const clamped = Math.min(
      Math.max(time, 0),
      Number.isFinite(this.state.duration) ? this.state.duration : time
    );
    try {
      this.audio.currentTime = clamped;
      this.setState({ progress: clamped });
    } catch (error) {
      // ignore seek errors
    }
  }

  setEnabled(flag, options = {}) {
    const enabled = Boolean(flag);
    const { resume = true } = options;
    if (enabled === this.state.enabled) return;
    if (!enabled) {
      this.stop();
      this.setState({ enabled: false });
      return;
    }
    this.setState({ enabled: true });
    this.ensureNodes();
    this.refreshReverbBuffer();
    this.connectGraph();
    if (resume) {
      this.play().catch(() => {});
    } else {
      this.setState({ isPlaying: false });
    }
  }

  setVolume(value) {
    const clamped = Math.min(Math.max(value, 0), 1);
    this.setState({ volume: clamped });
    if (this.gainNode) {
      this.gainNode.gain.value = clamped;
    }
  }

  setLoop(flag) {
    const loop = Boolean(flag);
    this.setState({ loop });
    if (this.audio) {
      this.audio.loop = loop;
    }
  }

  setEqEnabled(flag) {
    this.setState({ eqEnabled: Boolean(flag) });
    this.connectGraph();
  }

  setEqualizer(values) {
    const merged = {
      low: Number.isFinite(values?.low) ? values.low : this.state.equalizer.low,
      mid: Number.isFinite(values?.mid) ? values.mid : this.state.equalizer.mid,
      high: Number.isFinite(values?.high) ? values.high : this.state.equalizer.high,
    };
    this.setState({ equalizer: merged });
    if (this.eqNodes.length) {
      const payload = [merged.low, merged.mid, merged.high];
      this.eqNodes.forEach((node, index) => {
        node.frequency.value = EQ_FREQUENCIES[index];
        node.Q.value = index === 1 ? 0.9 : 1.1;
        node.gain.value = this.state.eqEnabled ? (payload[index] ?? 0) : 0;
      });
    }
    this.connectGraph();
  }

  setReverbEnabled(flag) {
    this.setState({ reverbEnabled: Boolean(flag) });
    this.connectGraph();
  }

  setReverbDetail(detail) {
    const mix = Number.isFinite(detail?.mix) ? detail.mix : this.state.reverbDetail.mix;
    const decay = Number.isFinite(detail?.decay) ? detail.decay : this.state.reverbDetail.decay;
    this.setState({ reverbDetail: { mix, decay } });
    this.refreshReverbBuffer();
    this.connectGraph();
  }

  setCompressorEnabled(flag) {
    this.setState({ compressorEnabled: Boolean(flag) });
    this.connectGraph();
  }

  setCompressorDetail(detail) {
    const next = {
      threshold: Number.isFinite(detail?.threshold)
        ? detail.threshold
        : this.state.compressorDetail.threshold,
      ratio: Number.isFinite(detail?.ratio) ? detail.ratio : this.state.compressorDetail.ratio,
      release: Number.isFinite(detail?.release)
        ? detail.release
        : this.state.compressorDetail.release,
    };
    this.setState({ compressorDetail: next });
    this.connectGraph();
  }

  handleLoaded() {
    if (!this.audio) return;
    if (Number.isFinite(this.audio.duration)) {
      this.setState({ duration: this.audio.duration });
    }
  }

  handleTimeUpdate() {
    if (!this.audio) return;
    this.setState({ progress: this.audio.currentTime });
  }

  handleEnded() {
    if (!this.audio) return;
    if (this.audio.loop || this.state.loop) {
      this.setState({ progress: 0 });
      return;
    }
    this.setState({ isPlaying: false, progress: this.audio.duration || 0 });
  }
}

let singleton = null;

export const getHeroAudioManager = () => {
  if (!singleton) {
    singleton = new HeroAudioManager();
  }
  return singleton;
};

export default getHeroAudioManager;
