import type { Avatar, HairStyle } from '../../../shared/protocol';
import { CLOTH_COLORS, HAIR_COLORS, SKIN_TONES } from '../game/art/character';

const STYLES: HairStyle[] = ['short', 'long', 'bun', 'spiky'];

function Swatches({ label, colors, value, onPick }: { label: string; colors: string[]; value: string; onPick: (c: string) => void }) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="swatches">
        {colors.map((c) => (
          <button key={c} type="button" className={`swatch ${c === value ? 'on' : ''}`} style={{ background: c }} onClick={() => onPick(c)} aria-label={`${label} ${c}`} />
        ))}
      </div>
    </div>
  );
}

export function AvatarEditor({ value, onChange }: { value: Avatar; onChange: (a: Avatar) => void }) {
  const set = (p: Partial<Avatar>) => onChange({ ...value, ...p });
  return (
    <div className="avatar-editor">
      <Swatches label="Skin" colors={SKIN_TONES} value={value.skin} onPick={(skin) => set({ skin })} />
      <Swatches label="Hair" colors={HAIR_COLORS} value={value.hair} onPick={(hair) => set({ hair })} />
      <div className="field">
        <span className="field-label">Style</span>
        <div className="seg">
          {STYLES.map((s) => (
            <button key={s} type="button" className={value.hairStyle === s ? 'on' : ''} onClick={() => set({ hairStyle: s })}>{s}</button>
          ))}
        </div>
      </div>
      <Swatches label="Shirt" colors={CLOTH_COLORS} value={value.shirt} onPick={(shirt) => set({ shirt })} />
      <Swatches label="Pants" colors={CLOTH_COLORS} value={value.pants} onPick={(pants) => set({ pants })} />
    </div>
  );
}
