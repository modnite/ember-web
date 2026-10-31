import { useEffect, useRef, useState } from 'react';
import { usePrefs, type Prefs } from '../lib/prefs';
import { ACCENTS, WALLPAPERS, accentName, onColor, parseHex, wallpaperCss, type WallpaperChoice } from '../lib/theme';
import { hasPhoto, loadPhoto, savePhoto } from '../lib/wallpaper';
import { useStore } from '../lib/store';
import { Icon, Sheet, type IconName } from './kit';

const THEMES: Array<[Prefs['theme'], string]> = [
  ['system', 'Same as the device'],
  ['light', 'Light'],
  ['dark', 'Dark'],
  ['black', 'Black (pure black, saves power on OLED screens)'],
];

function Row({ icon, title, sub, onClick }: { icon: IconName; title: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" className="setting" onClick={onClick}>
      <Icon name={icon} className="ico" />
      <span className="main">{title}<small>{sub}</small></span>
    </button>
  );
}

function Radio({ checked, label, onSelect }: { checked: boolean; label: string; onSelect: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={checked} className="check-row" onClick={onSelect}>
      <span className={`radio${checked ? ' on' : ''}`} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

/** What the accent looks like now: the page's own primary colour, which is the accent in light and its lighter form in dark. */
const currentInk = (): string => parseHex(getComputedStyle(document.documentElement).getPropertyValue('--primary')) ?? '#e8590c';
const isDark = (): boolean => document.documentElement.dataset.theme === 'dark';

function ThemeSheet({ onClose }: { onClose: () => void }) {
  const theme = usePrefs((s) => s.theme);
  const set = usePrefs((s) => s.set);
  return (
    <Sheet title="Theme" onClose={onClose}>
      <div role="radiogroup" aria-label="Theme">
        {THEMES.map(([id, label]) => <Radio key={id} checked={theme === id} label={label} onSelect={() => { set({ theme: id }); onClose(); }} />)}
      </div>
    </Sheet>
  );
}

function AccentSheet({ onClose }: { onClose: () => void }) {
  const accent = usePrefs((s) => s.accent);
  const set = usePrefs((s) => s.set);
  const [hex, setHex] = useState('');
  const custom = parseHex(hex);
  return (
    <Sheet title="Accent colour" onClose={onClose} actions={<button className="btn text" onClick={onClose}>Close</button>}>
      <div className="swatches" role="radiogroup" aria-label="Accent colour">
        {ACCENTS.map((a) => {
          const shown = a.hex ?? '#e8590c';
          const on = (a.hex ?? '') === accent;
          return (
            <button key={a.name} type="button" role="radio" aria-checked={on} className={`swatch${on ? ' on' : ''}`} onClick={() => { set({ accent: a.hex ?? '' }); onClose(); }}>
              <span className="dot" style={{ background: shown, color: onColor(shown) }}>{on ? <Icon name="check" /> : null}</span>
              <span>{a.name}</span>
            </button>
          );
        })}
      </div>
      <label className="field-label" htmlFor="accent-hex">Your own colour</label>
      <div className="hex-row">
        <span className="dot small" style={{ background: custom ?? 'transparent' }} aria-hidden="true" />
        <input id="accent-hex" className="key-input" style={{ marginTop: 0 }} placeholder="#2f6fed" maxLength={7} autoComplete="off" autoCapitalize="off" spellCheck={false} value={hex} onChange={(e) => setHex(e.target.value)} />
        <button type="button" className="btn tonal" disabled={!custom} onClick={() => { if (custom) { set({ accent: custom }); onClose(); } }}>Use</button>
      </div>
    </Sheet>
  );
}

function Preview({ choice, photo, dim }: { choice: WallpaperChoice; photo: string | null; dim: number }) {
  const w = wallpaperCss(choice, currentInk(), isDark(), photo, dim);
  return <span className="wall-preview" style={{ backgroundImage: w.image, backgroundSize: w.size }} />;
}

function WallpaperSheet({ onClose }: { onClose: () => void }) {
  const wallpaper = usePrefs((s) => s.wallpaper);
  const dim = usePrefs((s) => s.wallpaperDim);
  const set = usePrefs((s) => s.set);
  const showToast = useStore((s) => s.showToast);
  const pick = useRef<HTMLInputElement>(null);
  const [photo, setPhoto] = useState<string | null>(null);
  useEffect(() => { void loadPhoto().then(setPhoto); }, []);
  const options: Array<{ id: WallpaperChoice; label: string }> = [...WALLPAPERS, ...(photo ? [{ id: 'photo' as const, label: 'Your photo' }] : [])];
  return (
    <Sheet title="Chat wallpaper" onClose={onClose} actions={<><button className="btn text" onClick={() => set({ wallpaper: 'doodle' })}>Reset</button><button className="btn" onClick={onClose}>Done</button></>}>
      <div className="walls" role="radiogroup" aria-label="Chat wallpaper">
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={wallpaper === o.id} className={`wall${wallpaper === o.id ? ' on' : ''}`} onClick={() => set({ wallpaper: o.id })}>
            <Preview choice={o.id} photo={photo} dim={dim} />
            <span>{o.label}</span>
          </button>
        ))}
      </div>
      <input ref={pick} type="file" accept="image/*" hidden onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        void savePhoto(file).then(async (ok) => {
          if (!ok) { showToast('That picture could not be used.'); return; }
          setPhoto(await loadPhoto());
          set({ wallpaper: 'photo', wallpaperPhoto: usePrefs.getState().wallpaperPhoto + 1 });
        });
      }} />
      <button type="button" className="btn tonal block" style={{ marginTop: 12 }} onClick={() => pick.current?.click()}>Choose a photo</button>
      {wallpaper === 'photo' ? (
        <>
          <label className="field-label" htmlFor="wall-dim">Darken the photo: {dim}%</label>
          <input id="wall-dim" type="range" min={0} max={70} step={5} value={dim} onChange={(e) => set({ wallpaperDim: Number(e.target.value) })} style={{ width: '100%' }} />
        </>
      ) : null}
    </Sheet>
  );
}

/** Theme, accent colour and chat wallpaper: the same choices as the Android app. */
export function AppearanceRows() {
  const theme = usePrefs((s) => s.theme);
  const accent = usePrefs((s) => s.accent);
  const wallpaper = usePrefs((s) => s.wallpaper);
  const [dialog, setDialog] = useState<'theme' | 'accent' | 'wallpaper' | null>(null);
  const [photoKept, setPhotoKept] = useState(false);
  useEffect(() => { void hasPhoto().then(setPhotoKept); }, [wallpaper]);
  const themeLabel = THEMES.find(([id]) => id === theme)?.[1].replace(/ \(.*/, '') ?? '';
  const wallLabel = wallpaper === 'photo' && photoKept ? 'Your photo' : WALLPAPERS.find((w) => w.id === wallpaper)?.label ?? 'Doodles';
  return (
    <>
      <Row icon="palette" title="Theme" sub={themeLabel} onClick={() => setDialog('theme')} />
      <Row icon="palette" title="Accent colour" sub={accent ? accentName(accent) : 'Ember'} onClick={() => setDialog('accent')} />
      <Row icon="photo" title="Chat wallpaper" sub={wallLabel} onClick={() => setDialog('wallpaper')} />
      {dialog === 'theme' ? <ThemeSheet onClose={() => setDialog(null)} /> : null}
      {dialog === 'accent' ? <AccentSheet onClose={() => setDialog(null)} /> : null}
      {dialog === 'wallpaper' ? <WallpaperSheet onClose={() => setDialog(null)} /> : null}
    </>
  );
}
