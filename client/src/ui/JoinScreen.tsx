import { useState } from 'react';
import { MAX_NAME_LEN } from '../../../shared/protocol';
import { DEFAULT_AVATARS } from '../game/art/character';
import { connect } from '../net/socket';
import { media } from '../rtc/media';
import { startRTC } from '../rtc/peers';
import { patchMe, persistProfile, set, useStore } from '../state/store';
import { AvatarEditor } from './AvatarEditor';
import { MapBackdrop } from './MapBackdrop';
import { Portrait } from './Portrait';

export function JoinScreen() {
  const me = useStore((s) => s.me);
  const phase = useStore((s) => s.phase);
  const [name, setName] = useState(me.name);
  const [avatar, setAvatar] = useState(me.avatar);
  const [error, setError] = useState('');

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim().slice(0, MAX_NAME_LEN);
    if (!n) { setError('Pick a name so your teammates know who you are.'); return; }
    patchMe({ name: n, avatar });
    persistProfile();
    set({ phase: 'connecting' });
    setError('');
    try {
      startRTC();
      await connect();
      void media.initMic();
    } catch (err) {
      set({ phase: 'join' });
      setError((err as Error).message);
    }
  };

  return (
    <div className="join">
      <MapBackdrop />
      <form className="panel join-card" onSubmit={join}>
        <h1 className="title">Pixel HQ</h1>
        <p className="subtitle">a cozy little office for your dev team</p>
        <div className="join-body">
          <div className="join-preview">
            <div className="preview-stage">
              <Portrait avatar={avatar} full size={96} animate />
            </div>
            <button type="button" className="btn small" onClick={() => setAvatar(DEFAULT_AVATARS[Math.floor(Math.random() * DEFAULT_AVATARS.length)])}>🎲 Random</button>
          </div>
          <div className="join-fields">
            <label className="field">
              <span className="field-label">Your name</span>
              <input autoFocus value={name} maxLength={MAX_NAME_LEN} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rina" />
            </label>
            <AvatarEditor value={avatar} onChange={setAvatar} />
          </div>
        </div>
        {error && <div className="error">{error}</div>}
        <button className="btn primary big" disabled={phase === 'connecting'}>
          {phase === 'connecting' ? 'Opening the door…' : '🚪 Enter the office'}
        </button>
        <p className="fineprint">We'll ask for your microphone so nearby teammates can hear you. Walk away to leave a conversation.</p>
      </form>
    </div>
  );
}
