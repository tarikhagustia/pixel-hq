// Local devices: microphone (with voice-activity detection), camera and screen share.
import { send } from '../net/socket';
import { get, patchMe, set, toast } from '../state/store';

type TrackListener = (kind: 'audio' | 'cam' | 'screen', track: MediaStreamTrack | null) => void;

class LocalMedia {
  audio: MediaStreamTrack | null = null;
  cam: MediaStreamTrack | null = null;
  screen: MediaStreamTrack | null = null;
  private listeners: TrackListener[] = [];
  private audioCtx: AudioContext | null = null;
  private vadTimer: number | undefined;

  onTrack(l: TrackListener) { this.listeners.push(l); }
  private emit(kind: 'audio' | 'cam' | 'screen', track: MediaStreamTrack | null) { this.listeners.forEach((l) => l(kind, track)); }

  /** Ask for the microphone. Safe to call again to switch devices. */
  async initMic() {
    const { settings, me } = get();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: settings.micId ? { exact: settings.micId } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      this.audio?.stop();
      this.audio = stream.getAudioTracks()[0];
      this.audio.enabled = me.mic;
      set({ micAvailable: true });
      this.emit('audio', this.audio);
      this.startVAD(stream);
    } catch (err) {
      console.warn('mic unavailable', err);
      set({ micAvailable: false });
      patchMe({ mic: false });
      send({ t: 'presence', p: { mic: false } });
      toast('Microphone unavailable — you can still chat by text.');
    }
  }

  setMic(on: boolean) {
    if (on && !this.audio) { toast('No microphone access. Check browser permissions.'); return; }
    if (this.audio) this.audio.enabled = on;
    patchMe({ mic: on, speaking: on ? get().me.speaking : false });
    send({ t: 'presence', p: { mic: on, ...(on ? {} : { speaking: false }) } });
  }

  async setCam(on: boolean) {
    if (on) {
      try {
        const { camId } = get().settings;
        const s = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: camId ? { exact: camId } : undefined, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { max: 24 } },
        });
        this.cam = s.getVideoTracks()[0];
      } catch {
        toast('Camera unavailable.');
        return;
      }
    } else {
      this.cam?.stop();
      this.cam = null;
    }
    this.emit('cam', this.cam);
    patchMe({ cam: !!this.cam });
    send({ t: 'presence', p: { cam: !!this.cam } });
  }

  async setScreen(on: boolean) {
    if (on) {
      try {
        const s = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { max: 15 } }, audio: false });
        this.screen = s.getVideoTracks()[0];
        this.screen.contentHint = 'detail';
        this.screen.onended = () => this.setScreen(false);
      } catch {
        return; // user cancelled the picker
      }
    } else {
      this.screen?.stop();
      this.screen = null;
    }
    this.emit('screen', this.screen);
    patchMe({ screen: !!this.screen });
    send({ t: 'presence', p: { screen: !!this.screen } });
  }

  /** Lightweight voice activity detection; broadcasts a `speaking` flag. */
  private startVAD(stream: MediaStream) {
    clearInterval(this.vadTimer);
    this.audioCtx?.close().catch(() => {});
    const ctx = new AudioContext();
    this.audioCtx = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Float32Array(an.fftSize);
    let speaking = false, lastLoud = 0;
    this.vadTimer = window.setInterval(() => {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const now = performance.now();
      const enabled = get().me.mic;
      if (enabled && rms > 0.02) lastLoud = now;
      const next = enabled && now - lastLoud < 350;
      if (next !== speaking) {
        speaking = next;
        patchMe({ speaking });
        send({ t: 'presence', p: { speaking } });
      }
    }, 80);
  }
}

export const media = new LocalMedia();
