import { useEffect, useRef } from 'react';
import { Engine } from '../game/engine';
import { initMusic } from '../game/music';
import { get, toast } from '../state/store';
import { bindEngine, setStatus, toggleCam, toggleMic, toggleMusic, zoomBy } from './actions';
import { ChatPanel } from './ChatPanel';
import { Dock, Hint, MeetingBanner, PlayerCard, SelectedCard, Toasts, TopRight } from './Hud';
import { MediaStrip } from './MediaStrip';
import { PeoplePanel } from './PeoplePanel';
import { SettingsModal } from './SettingsModal';

const AWAY_AFTER_MS = 5 * 60 * 1000;

export function Office() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const engine = new Engine(canvasRef.current!);
    bindEngine(engine);
    engine.start();
    const stopMusic = initMusic();
    toast('Welcome in! Walk with WASD — get close to someone to talk.');
    return () => { engine.stop(); bindEngine(null); stopMusic(); };
  }, []);

  // keyboard shortcuts + automatic "away"
  useEffect(() => {
    let lastActive = Date.now();
    let autoAway = false;
    const typing = () => ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName ?? '');
    const active = () => {
      lastActive = Date.now();
      if (autoAway && get().me.status === 'away') { setStatus('available'); autoAway = false; }
    };
    const onKey = (e: KeyboardEvent) => {
      active();
      if (typing() || e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'm') toggleMic();
      if (k === 'v') toggleCam();
      if (k === 'b') toggleMusic();
      if (k === '=' || k === '+') zoomBy(1);
      if (k === '-' || k === '_') zoomBy(-1);
      if (k === '0') zoomBy(0);
    };
    const iv = window.setInterval(() => {
      const idle = Date.now() - lastActive > AWAY_AFTER_MS;
      if (idle && get().me.status === 'available' && !get().me.inMeeting) { setStatus('away'); autoAway = true; }
    }, 15000);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', active);
    window.addEventListener('pointermove', active);
    return () => {
      clearInterval(iv);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', active);
      window.removeEventListener('pointermove', active);
    };
  }, []);

  return (
    <div className="office">
      <canvas ref={canvasRef} className="world" />
      <div className="hud">
        <div className="top-left"><PlayerCard /></div>
        <TopRight />
        <div className="top-center"><MeetingBanner /><MediaStrip /></div>
        <Toasts />
        <div className="right-col"><PeoplePanel /><ChatPanel /></div>
        <SelectedCard />
        <div className="bottom-center"><Hint /><Dock /></div>
        <SettingsModal />
      </div>
    </div>
  );
}
