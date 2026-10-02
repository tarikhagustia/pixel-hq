import { useState } from 'react';
import { EMOTES, type Status } from '../../../shared/protocol';
import { zoneById } from '../game/map';
import { set, useStore } from '../state/store';
import { emote, leaveMeeting, openDM, setStatus, toggleCam, toggleMic, toggleScreen, walkToPlayer } from './actions';
import { statusOf } from './PeoplePanel';
import { Portrait } from './Portrait';

const STATUSES: Array<{ id: Status; label: string; note: string }> = [
  { id: 'available', label: 'Available', note: 'Nearby people can hear you' },
  { id: 'busy', label: 'Busy', note: 'Focus mode — proximity audio paused' },
  { id: 'away', label: 'Away', note: 'Grab a coffee — audio paused' },
];

export function PlayerCard() {
  const me = useStore((s) => s.me);
  const [open, setOpen] = useState(false);
  const st = statusOf(me);
  const zone = zoneById(me.zone);
  return (
    <div className="panel player-card">
      <div className="pc-portrait"><Portrait avatar={me.avatar} size={44} /></div>
      <div className="pc-info">
        <div className="pc-name">{me.name}</div>
        <button className="status-btn" onClick={() => setOpen(!open)} aria-haspopup="menu">
          <span className={`dot ${st.cls}`} /> {st.label} ▾
        </button>
        {open && (
          <div className="menu" role="menu" onMouseLeave={() => setOpen(false)}>
            {STATUSES.map((s) => (
              <button key={s.id} role="menuitem" className={me.status === s.id ? 'on' : ''} onClick={() => { setStatus(s.id); setOpen(false); }}>
                <span className={`dot ${s.id}`} /> <b>{s.label}</b><small>{s.note}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      {zone && <div className="pc-zone" title="Where you are">{zone.icon} {zone.name}</div>}
    </div>
  );
}

export function TopRight() {
  const count = useStore((s) => Object.keys(s.players).length + 1);
  return (
    <div className="top-right">
      <button className="panel pill" onClick={() => set((s) => ({ ui: { ...s.ui, people: !s.ui.people } }))} title="Participants">👥 {count}</button>
      <button className="panel pill" onClick={() => set((s) => ({ ui: { ...s.ui, settings: true } }))} title="Settings">⚙️</button>
    </div>
  );
}

export function Dock() {
  const me = useStore((s) => s.me);
  const ui = useStore((s) => s.ui);
  const micAvailable = useStore((s) => s.micAvailable);
  const unread = useStore((s) => s.unread);
  const totalUnread = unread.global + unread.nearby + Object.values(unread.dm).reduce((a, b) => a + b, 0);
  return (
    <div className="dock-wrap">
      {ui.emotes && (
        <div className="panel emote-bar">
          {EMOTES.map((e, i) => <button key={e} onClick={() => { emote(e); set((s) => ({ ui: { ...s.ui, emotes: false } })); }} title={`Key ${i + 1}`}>{e}</button>)}
        </div>
      )}
      <div className="panel dock">
        <button className={`dock-btn ${me.mic ? 'on' : 'off'}`} onClick={toggleMic} title={me.mic ? 'Mute (M)' : 'Unmute (M)'} disabled={!micAvailable && !me.mic}>
          {me.mic ? '🎙️' : '🔇'}<span>{me.mic ? 'Mic on' : 'Muted'}</span>
        </button>
        <button className={`dock-btn ${me.cam ? 'on' : 'off'}`} onClick={toggleCam} title="Camera (V)">
          {me.cam ? '📷' : '📷'}<span>{me.cam ? 'Cam on' : 'Cam off'}</span>
        </button>
        {me.inMeeting && (
          <button className={`dock-btn ${me.screen ? 'on live' : ''}`} onClick={toggleScreen} title="Share your screen">
            🖥️<span>{me.screen ? 'Stop share' : 'Share'}</span>
          </button>
        )}
        <div className="dock-sep" />
        <button className={`dock-btn ${ui.emotes ? 'on' : ''}`} onClick={() => set((s) => ({ ui: { ...s.ui, emotes: !s.ui.emotes } }))} title="Emotes (1-8)">
          😊<span>React</span>
        </button>
        <button className={`dock-btn ${ui.chat ? 'on' : ''}`} onClick={() => set((s) => ({ ui: { ...s.ui, chat: !s.ui.chat } }))} title="Chat (Enter)">
          💬<span>Chat</span>{totalUnread > 0 && !ui.chat && <i className="badge">{totalUnread}</i>}
        </button>
        <button className={`dock-btn ${ui.people ? 'on' : ''}`} onClick={() => set((s) => ({ ui: { ...s.ui, people: !s.ui.people } }))} title="Participants">
          👥<span>People</span>
        </button>
        {me.inMeeting && (
          <button className="dock-btn danger" onClick={leaveMeeting} title="Leave the meeting room">
            🚪<span>Leave</span>
          </button>
        )}
      </div>
    </div>
  );
}

export function Hint() {
  const hint = useStore((s) => s.hint);
  return hint ? <div className="hint">{hint}</div> : null;
}

export function MeetingBanner() {
  const inMeeting = useStore((s) => s.me.inMeeting);
  const n = useStore((s) => Object.values(s.players).filter((p) => p.inMeeting).length + 1);
  if (!inMeeting) return null;
  return (
    <div className="panel meeting-banner">
      <span className="rec" /> <b>Meeting Room</b> · {n} in the call
      <span className="muted"> — only people in this room can hear you</span>
    </div>
  );
}

export function SelectedCard() {
  const id = useStore((s) => s.selected);
  const p = useStore((s) => (s.selected ? s.players[s.selected] : undefined));
  const linked = useStore((s) => (id ? s.voicePeers.includes(id) : false));
  if (!id || !p) return null;
  const st = statusOf(p);
  const zone = zoneById(p.zone);
  return (
    <div className="panel selected-card">
      <button className="icon-btn close" onClick={() => set({ selected: null })}>✕</button>
      <div className="sel-head">
        <Portrait avatar={p.avatar} size={52} />
        <div>
          <div className="pc-name">{p.name}</div>
          <div className="person-sub"><span className={`dot ${st.cls}`} /> {st.label}</div>
          <div className="person-sub">{zone ? `${zone.icon} ${zone.name}` : ''}{linked ? ' · 🔊 in earshot' : ''}</div>
        </div>
      </div>
      <div className="sel-actions">
        <button className="btn small" onClick={() => openDM(p.id)}>💬 Message</button>
        <button className="btn small" onClick={() => walkToPlayer(p.id)}>🚶 Walk over</button>
        <button className="btn small" onClick={() => emote('👋')}>👋 Wave</button>
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => <div key={t.id} className="toast">{t.text}</div>)}
    </div>
  );
}
