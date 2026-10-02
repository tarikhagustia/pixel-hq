import { useEffect, useState } from 'react';
import { MAX_NAME_LEN } from '../../../shared/protocol';
import { DEFAULT_AVATARS } from '../game/art/character';
import { patchMe, persistProfile, useStore } from '../state/store';
import { AvatarEditor } from './AvatarEditor';
import { enterOffice } from './actions';
import { MapBackdrop } from './MapBackdrop';
import { Portrait } from './Portrait';

export function JoinScreen() {
  const me = useStore((s) => s.me);
  const phase = useStore((s) => s.phase);
  const [name, setName] = useState(me.name);
  const [avatar, setAvatar] = useState(me.avatar);
  const [error, setError] = useState('');
  // Refreshing the page restores the saved name/avatar and phase='connecting' (state/store.ts) —
  // pick that up on mount and rejoin automatically instead of making the user fill the form again.
  // Deliberately runs once on mount only (not on every `phase` change), since later transitions
  // into 'connecting' come from the manual `join()` submit handler below, which already connects.
  useEffect(() => {
    if (phase === 'connecting') enterOffice().catch((err) => setError((err as Error).message));
  }, []);

  const join = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim().slice(0, MAX_NAME_LEN);
    if (!n) { setError('Pick a name so your teammates know who you are.'); return; }
    patchMe({ name: n, avatar });
    persistProfile();
    setError('');
    try {
      await enterOffice();
    } catch (err) {
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
