import { usePrefs } from '../lib/prefs';
import { ACCENTS } from '../lib/theme';

export function FirstLook({ onDone }: { onDone: () => void }) {
  const p = usePrefs();
  return <div className="login-wrap"><main className="first-look">
    <h1>Make Ember yours</h1>
    <section aria-label="Theme"><h2>Theme</h2><div className="look-modes">
      {(['system', 'light', 'dark', 'black'] as const).map((mode) => <button className="btn" key={mode} aria-pressed={p.theme === mode} onClick={() => p.set({ theme: mode })}>{mode === 'system' ? 'Follow system' : mode === 'black' ? 'Black' : mode === 'light' ? 'Light' : 'Dark'}</button>)}
    </div></section>
    <section aria-label="Accent colour"><h2>Accent colour</h2><div className="swatches">
      {ACCENTS.map((a) => <button key={a.name} className={`swatch${p.accent === (a.hex ?? '') ? ' on' : ''}`} aria-pressed={p.accent === (a.hex ?? '')} onClick={() => p.set({ accent: a.hex ?? '' })}><span className="dot" style={{ background: a.hex ?? '#e8590c' }} />{a.name}</button>)}
    </div></section>
    <section className="look-preview" aria-label="Appearance preview"><b>Ember</b><div className="look-bubble">Hi there!</div><div className="look-bubble outgoing">Hello!</div></section>
    <label className="look-toggle"><input type="checkbox" checked={p.doodles} onChange={(e) => p.set({ doodles: e.target.checked })} /> Chat doodles</label>
    <div className="look-actions"><button className="btn text" onClick={() => { p.set({ theme: 'system', accent: '', wallpaper: 'default', doodles: true }); onDone(); }}>Skip</button><button className="btn" onClick={onDone}>Continue</button></div>
  </main></div>;
}
