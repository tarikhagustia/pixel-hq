import { useEffect, useState } from 'react';
import { MAX_NAME_LEN } from '../../../shared/protocol';
import { media } from '../rtc/media';
import { persistProfile, set, useStore } from '../state/store';
import { updateProfile } from './actions';
import { AvatarEditor } from './AvatarEditor';
import { Portrait } from './Portrait';

export function SettingsModal() {
  const open = useStore((s) => s.ui.settings);
  const me = useStore((s) => s.me);
  const settings = useStore((s) => s.settings);
  const [name, setName] = useState(me.name);
  const [avatar, setAvatar] = useState(me.avatar);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  useEffect(() => {
    if (!open) return;
    setName(me.name); setAvatar(me.avatar);
    navigator.mediaDevices?.enumerateDevices().then(setDevices).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const close = () => set((s) => ({ ui: { ...s.ui, settings: false } }));
  const patch = (p: Partial<typeof settings>) => { set((s) => ({ settings: { ...s.settings, ...p } })); persistProfile(); };
  const save = () => { updateProfile(name.trim() || me.name, avatar); close(); };

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="panel modal" role="dialog" aria-label="Settings">
        <header className="panel-head"><h3>⚙️ Settings</h3><button className="icon-btn" onClick={close}>✕</button></header>
        <div className="modal-body">
          <section>
            <h4>Character</h4>
            <div className="settings-char">
              <div className="preview-stage small"><Portrait avatar={avatar} full size={64} animate /></div>
              <div style={{ flex: 1 }}>
                <label className="field"><span className="field-label">Name</span>
                  <input value={name} maxLength={MAX_NAME_LEN} onChange={(e) => setName(e.target.value)} /></label>
                <AvatarEditor value={avatar} onChange={setAvatar} />
              </div>
            </div>
          </section>
          <section>
            <h4>Audio & video</h4>
            <label className="field"><span className="field-label">Microphone</span>
              <select value={settings.micId} onChange={(e) => { patch({ micId: e.target.value }); void media.initMic(); }}>
                <option value="">System default</option>
                {devices.filter((d) => d.kind === 'audioinput').map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Microphone'}</option>)}
              </select></label>
            <label className="field"><span className="field-label">Camera</span>
              <select value={settings.camId} onChange={(e) => patch({ camId: e.target.value })}>
                <option value="">System default</option>
                {devices.filter((d) => d.kind === 'videoinput').map((d) => <option key={d.deviceId} value={d.deviceId}>{d.label || 'Camera'}</option>)}
              </select></label>
            <label className="field"><span className="field-label">Voices volume · {Math.round(settings.volume * 100)}%</span>
              <input type="range" min={0} max={1} step={0.05} value={settings.volume} onChange={(e) => patch({ volume: Number(e.target.value) })} /></label>
            <label className="check"><input type="checkbox" checked={settings.showNames} onChange={(e) => patch({ showNames: e.target.checked })} /> Show everyone's names</label>
            <label className="check"><input type="checkbox" checked={settings.showRange} onChange={(e) => patch({ showRange: e.target.checked })} /> Show my hearing range</label>
          </section>
          <section>
            <h4>Controls</h4>
            <ul className="keys">
              <li><kbd>WASD</kbd>/<kbd>↑↓←→</kbd> walk · <kbd>Shift</kbd> run · or click the floor</li>
              <li><kbd>E</kbd>/<kbd>Space</kbd> sit / stand · click a chair to walk there and sit</li>
              <li><kbd>Enter</kbd> chat · <kbd>Esc</kbd> back to the office</li>
              <li><kbd>1</kbd>–<kbd>8</kbd> emotes · click a person for options</li>
              <li><kbd>M</kbd> mute · <kbd>V</kbd> camera</li>
            </ul>
          </section>
        </div>
        <footer className="modal-foot"><button className="btn" onClick={close}>Cancel</button><button className="btn primary" onClick={save}>Save</button></footer>
      </div>
    </div>
  );
}
