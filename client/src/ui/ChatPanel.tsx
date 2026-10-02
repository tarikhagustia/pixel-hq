import { useEffect, useMemo, useRef, useState } from 'react';
import { MAX_CHAT_LEN } from '../../../shared/protocol';
import { set, useStore, type ChatTab } from '../state/store';
import { sendChat } from './actions';

const TABS: Array<{ id: ChatTab; label: string; hint: string }> = [
  { id: 'global', label: 'Office', hint: 'Everyone in the office' },
  { id: 'nearby', label: 'Nearby', hint: 'People within a few steps — shows as a speech bubble' },
  { id: 'dm', label: 'Direct', hint: 'Private messages' },
];

export function ChatPanel() {
  const ui = useStore((s) => s.ui);
  const chat = useStore((s) => s.chat);
  const unread = useStore((s) => s.unread);
  const selfId = useStore((s) => s.selfId);
  const players = useStore((s) => s.players);
  const [text, setText] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const msgs = useMemo(() => chat.filter((m) => {
    if (ui.tab === 'dm') return m.channel === 'dm' && ui.dmWith && (m.from === ui.dmWith || m.to === ui.dmWith);
    return m.channel === ui.tab;
  }), [chat, ui.tab, ui.dmWith]);

  useEffect(() => { listRef.current?.scrollTo({ top: 1e9 }); }, [msgs.length, ui.tab, ui.chat]);

  // Enter focuses chat from the game; Escape returns focus to the office.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
      if (e.key === 'Enter' && !typing) {
        e.preventDefault();
        set((s) => ({ ui: { ...s.ui, chat: true } }));
        setTimeout(() => inputRef.current?.focus(), 0);
      }
      if (e.key === 'Escape' && document.activeElement === inputRef.current) inputRef.current?.blur();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const setTab = (tab: ChatTab) => set((s) => ({
    ui: { ...s.ui, tab },
    unread: tab === 'dm' ? s.unread : { ...s.unread, [tab]: 0 },
  }));

  const dmTargets = Object.values(players).sort((a, b) => a.name.localeCompare(b.name));
  const dmUnread = Object.values(unread.dm).reduce((a, b) => a + b, 0);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (ui.tab === 'dm' && !ui.dmWith) return;
    sendChat(ui.tab, text, ui.tab === 'dm' ? ui.dmWith! : undefined);
    setText('');
  };

  if (!ui.chat) return null;
  const tabInfo = TABS.find((t) => t.id === ui.tab)!;
  const fmt = (ts: number) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <section className="panel side-panel chat" aria-label="Chat">
      <header className="panel-head">
        <div className="tabs">
          {TABS.map((t) => {
            const n = t.id === 'dm' ? dmUnread : unread[t.id];
            return (
              <button key={t.id} className={ui.tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>
                {t.label}{n > 0 && <span className="badge">{n}</span>}
              </button>
            );
          })}
        </div>
        <button className="icon-btn" onClick={() => set((s) => ({ ui: { ...s.ui, chat: false } }))} aria-label="Close chat">✕</button>
      </header>
      {ui.tab === 'dm' && (
        <div className="dm-picker">
          {dmTargets.length === 0 && <span className="muted">Nobody else is here yet.</span>}
          {dmTargets.map((p) => (
            <button key={p.id} className={`chip ${ui.dmWith === p.id ? 'on' : ''}`}
              onClick={() => set((s) => ({ ui: { ...s.ui, dmWith: p.id }, unread: { ...s.unread, dm: { ...s.unread.dm, [p.id]: 0 } } }))}>
              {p.name}{(unread.dm[p.id] ?? 0) > 0 && <span className="badge">{unread.dm[p.id]}</span>}
            </button>
          ))}
        </div>
      )}
      <div className="chat-list" ref={listRef}>
        {msgs.length === 0 && <div className="muted center">{tabInfo.hint}</div>}
        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.from === selfId ? 'mine' : ''}`}>
            <div className="msg-meta"><b>{m.from === selfId ? 'You' : m.fromName}</b> <span>{fmt(m.ts)}</span></div>
            <div className="msg-text">{m.text}</div>
          </div>
        ))}
      </div>
      <form className="chat-input" onSubmit={submit}>
        <input ref={inputRef} value={text} maxLength={MAX_CHAT_LEN} onChange={(e) => setText(e.target.value)}
          placeholder={ui.tab === 'dm' ? (ui.dmWith ? `Message ${players[ui.dmWith]?.name ?? ''}…` : 'Pick someone above') : ui.tab === 'nearby' ? 'Say something to people nearby…' : 'Message the whole office…'}
          disabled={ui.tab === 'dm' && !ui.dmWith} />
        <button className="btn small" disabled={!text.trim()}>Send</button>
      </form>
    </section>
  );
}
