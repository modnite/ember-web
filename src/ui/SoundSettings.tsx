import { useEffect, useRef, useState } from 'react';
import { usePrefs } from '../lib/prefs';
import { clearSound, loadSound, saveSound, type SoundSlot } from '../lib/soundFiles';
import { previewSound } from '../lib/sounds';
import { useStore } from '../lib/store';
import { Icon, Sheet } from './kit';

const SLOTS: Record<SoundSlot, { title: string; pref: 'messageSound' | 'callSound'; own: string }> = {
  message: { title: 'Message sound', pref: 'messageSound', own: "Ember's chime" },
  call: { title: 'Ringtone', pref: 'callSound', own: "Ember's ringtone" },
};

function Radio({ checked, label, onSelect }: { checked: boolean; label: string; onSelect: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={checked} className="check-row" onClick={onSelect}>
      <span className={`radio${checked ? ' on' : ''}`} aria-hidden="true" />
      <span>{label}</span>
    </button>
  );
}

function SoundSheet({ slot, onClose }: { slot: SoundSlot; onClose: () => void }) {
  const def = SLOTS[slot];
  const choice = usePrefs((s) => s[def.pref]);
  const set = usePrefs((s) => s.set);
  const showToast = useStore((s) => s.showToast);
  const pick = useRef<HTMLInputElement>(null);
  const [name, setName] = useState<string | null>(null);
  useEffect(() => { void loadSound(slot).then((f) => setName(f?.name ?? null)); }, [slot]);
  const choose = (v: 'ember' | 'none' | 'file'): void => { set({ [def.pref]: v } as Partial<ReturnType<typeof usePrefs.getState>>); };
  return (
    <Sheet title={def.title} onClose={onClose} actions={<><button className="btn text" onClick={() => previewSound(slot)}>Try it</button><button className="btn" onClick={onClose}>Done</button></>}>
      <div role="radiogroup" aria-label={def.title}>
        <Radio checked={choice === 'ember'} label={def.own} onSelect={() => choose('ember')} />
        <Radio checked={choice === 'none'} label="None" onSelect={() => choose('none')} />
        {name ? <Radio checked={choice === 'file'} label={name} onSelect={() => choose('file')} /> : null}
      </div>
      <input ref={pick} type="file" accept="audio/*" hidden onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        void saveSound(slot, file).then(async (err) => {
          if (err) { showToast(err); return; }
          setName((await loadSound(slot))?.name ?? file.name);
          choose('file');
        });
      }} />
      <button type="button" className="btn tonal block" style={{ marginTop: 12 }} onClick={() => pick.current?.click()}>Choose a sound file</button>
      {name ? <button type="button" className="btn text block" onClick={() => { void clearSound(slot).then(() => { setName(null); if (choice === 'file') choose('ember'); }); }}>Remove {name.length > 24 ? `${name.slice(0, 24)}…` : name}</button> : null}
    </Sheet>
  );
}

/** Which sound a new message and a ring make. A file of your own can be used for either. */
export function SoundRows() {
  const message = usePrefs((s) => s.messageSound);
  const call = usePrefs((s) => s.callSound);
  const [open, setOpen] = useState<SoundSlot | null>(null);
  const [names, setNames] = useState<Record<SoundSlot, string | null>>({ message: null, call: null });
  useEffect(() => { void Promise.all([loadSound('message'), loadSound('call')]).then(([m, c]) => setNames({ message: m?.name ?? null, call: c?.name ?? null })); }, [open, message, call]);
  const label = (slot: SoundSlot, choice: 'ember' | 'none' | 'file'): string => (choice === 'none' ? 'None' : choice === 'file' && names[slot] ? names[slot]! : SLOTS[slot].own);
  return (
    <>
      <button type="button" className="setting" onClick={() => setOpen('message')}><Icon name="bell" className="ico" /><span className="main">Message sound<small>{label('message', message)}</small></span></button>
      <button type="button" className="setting" onClick={() => setOpen('call')}><Icon name="phone" className="ico" /><span className="main">Ringtone<small>{label('call', call)}</small></span></button>
      {open ? <SoundSheet slot={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
