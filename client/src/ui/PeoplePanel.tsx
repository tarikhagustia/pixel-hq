import type { PlayerState } from '../../../shared/protocol';
import { zoneById } from '../game/map';
import { set, useStore } from '../state/store';
import { openDM, walkToPlayer } from './actions';
import { Portrait } from './Portrait';

export function statusOf(p: Pick<PlayerState, 'status' | 'inMeeting'>) {
  if (p.inMeeting) return { cls: 'meeting', label: 'In a meeting' };
  if (p.status === 'busy') return { cls: 'busy', label: 'Busy' };
  if (p.status === 'away') return { cls: 'away', label: 'Away' };
  return { cls: 'available', label: 'Available' };
}

export function PeoplePanel() {
  const open = useStore((s) => s.ui.people);
  const players = useStore((s) => s.players);
  const me = useStore((s) => s.me);
  const voice = useStore((s) => s.voicePeers);
  if (!open) return null;
  const list = Object.values(players).sort((a, b) => a.name.localeCompare(b.name));
  const Row = ({ p, self }: { p: PlayerState | (typeof me & { id: string }); self?: boolean }) => {
    const st = statusOf(p);
    const zone = zoneById(p.zone);
    return (
      <div className="person">
        <div className="person-portrait"><Portrait avatar={p.avatar} size={36} /><span className={`dot ${st.cls}`} /></div>
        <div className="person-info">
          <div className="person-name">{p.name}{self && <span className="muted"> (you)</span>}</div>
          <div className="person-sub">{st.label} · {zone ? `${zone.icon} ${zone.name}` : '—'}</div>
        </div>
        <div className="person-icons">
          {p.mic ? (p.speaking ? <span title="Speaking" className="speaking">🔊</span> : <span title="Mic on">🎙️</span>) : <span title="Muted">🔇</span>}
          {p.cam && <span title="Camera on">📷</span>}
          {p.screen && <span title="Sharing screen">🖥️</span>}
          {!self && voice.includes(p.id) && <span title="You can hear each other" className="linked">●</span>}
        </div>
        {!self && (
          <div className="person-actions">
            <button className="icon-btn" title="Message" onClick={() => openDM(p.id)}>💬</button>
            <button className="icon-btn" title="Walk over" onClick={() => walkToPlayer(p.id)}>🚶</button>
          </div>
        )}
      </div>
    );
  };
  return (
    <section className="panel side-panel people" aria-label="Participants">
      <header className="panel-head">
        <h3>In the office · {list.length + 1}</h3>
        <button className="icon-btn" onClick={() => set((s) => ({ ui: { ...s.ui, people: false } }))} aria-label="Close">✕</button>
      </header>
      <div className="people-list">
        <Row p={{ ...me, id: 'self' }} self />
        {list.map((p) => <Row key={p.id} p={p} />)}
      </div>
    </section>
  );
}
