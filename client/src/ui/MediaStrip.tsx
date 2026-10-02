import { useEffect, useReducer, useRef, useState } from 'react';
import type { Avatar } from '../../../shared/protocol';
import { media } from '../rtc/media';
import { remoteMedia, subscribeMedia } from '../rtc/peers';
import { useStore } from '../state/store';
import { Portrait } from './Portrait';

function Video({ stream, track, mirror }: { stream?: MediaStream; track?: MediaStreamTrack | null; mirror?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const v = ref.current;
    if (!v) return;
    v.srcObject = stream ?? (track ? new MediaStream([track]) : null);
    v.play().catch(() => {});
  }, [stream, track]);
  return <video ref={ref} autoPlay playsInline muted className={mirror ? 'mirror' : ''} />;
}

interface TileInfo { key: string; name: string; avatar: Avatar; speaking: boolean; mic: boolean; video?: MediaStream; track?: MediaStreamTrack | null; kind: 'cam' | 'screen' | 'avatar'; self?: boolean }

function Tile({ t, onFocus, big }: { t: TileInfo; onFocus?: () => void; big?: boolean }) {
  return (
    <div className={`tile ${t.speaking ? 'speaking' : ''} ${t.kind} ${big ? 'big' : ''}`} onClick={onFocus} title={onFocus ? 'Click to enlarge' : undefined}>
      {t.kind === 'avatar'
        ? <div className="tile-avatar"><Portrait avatar={t.avatar} size={big ? 96 : 44} /></div>
        : <Video stream={t.video} track={t.track} mirror={t.self && t.kind === 'cam'} />}
      <div className="tile-name">{!t.mic && '🔇 '}{t.kind === 'screen' ? `🖥️ ${t.name}` : t.name}</div>
    </div>
  );
}

export function MediaStrip() {
  const voice = useStore((s) => s.voicePeers);
  const players = useStore((s) => s.players);
  const me = useStore((s) => s.me);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => subscribeMedia(force), []);

  const tiles: TileInfo[] = [];
  const screens: TileInfo[] = [];
  const meeting = me.inMeeting;
  if (voice.length > 0 || meeting) {
    tiles.push({ key: 'self', name: 'You', avatar: me.avatar, speaking: me.speaking, mic: me.mic, kind: me.cam ? 'cam' : 'avatar', track: me.cam ? media.cam : null, self: true });
    if (me.screen) screens.push({ key: 'self-screen', name: 'You', avatar: me.avatar, speaking: false, mic: true, kind: 'screen', track: media.screen, self: true });
  }
  for (const id of voice) {
    const p = players[id];
    if (!p) continue;
    const m = remoteMedia(id);
    tiles.push({ key: id, name: p.name, avatar: p.avatar, speaking: p.speaking, mic: p.mic, kind: p.cam && m.cam ? 'cam' : 'avatar', video: p.cam ? m.cam : undefined });
    if (p.screen && m.screen) screens.push({ key: `${id}-screen`, name: p.name, avatar: p.avatar, speaking: false, mic: true, kind: 'screen', video: m.screen });
  }
  if (tiles.length === 0) return null;

  const all = [...screens, ...tiles];
  const featured = all.find((t) => t.key === focus) ?? (meeting ? screens[0] : undefined);

  return (
    <div className={`media-strip ${meeting ? 'meeting' : ''}`}>
      {featured && (
        <div className="stage">
          <Tile t={featured} big onFocus={() => setFocus(null)} />
        </div>
      )}
      <div className="tiles">
        {all.filter((t) => t !== featured).map((t) => <Tile key={t.key} t={t} onFocus={() => setFocus(t.key)} />)}
      </div>
    </div>
  );
}
