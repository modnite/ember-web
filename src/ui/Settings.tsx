import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { usePrefs, type Prefs } from '../lib/prefs';
import { disablePush, enablePush, pushState, type PushState } from '../lib/push';
import { useStore } from '../lib/store';
import type { TwoStepStatus, User } from '../lib/types';
import { isIOS, isStandalone } from '../lib/viewport';
import { canInstall, promptInstall } from '../lib/install';
import { AppearanceRows } from './Appearance';
import { Avatar, Icon, Sheet, Toggle, type IconName } from './kit';

declare const __APP_VERSION__: string;

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><div className="group-title">{title}</div>{children}</section>;
}

function Action({ icon, title, sub, onClick, danger }: { icon: IconName; title: string; sub?: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" className="setting" onClick={onClick} style={danger ? { color: 'var(--error)' } : undefined}>
      <Icon name={icon} className="ico" />
      <span className="main">{title}{sub ? <small>{sub}</small> : null}</span>
    </button>
  );
}

const PUSH_TEXT: Record<PushState, string> = {
  unsupported: 'This browser cannot show notifications.',
  'needs-install': 'On iPhone and iPad, add Ember to your Home Screen first (Share, then Add to Home Screen). Notifications work from the installed app.',
  blocked: 'Notifications are blocked. Allow them for this site in the browser or phone settings.',
  off: 'Off. Turn on to hear about new messages when Ember is closed.',
  on: 'On for this browser.',
  'server-off': 'This server has no push notifications set up.',
};

export function Settings() {
  const { me, info, e2ee, signOut, updateProfile, setAvatar, setupE2ee, showToast } = useStore();
  const prefs = usePrefs();
  const [push, setPush] = useState<PushState>('off');
  const [dialog, setDialog] = useState<'name' | 'password' | 'username' | 'twostep' | 'blocked' | 'ios' | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const ios = isIOS();
  const installed = isStandalone();

  useEffect(() => { void pushState(installed, ios).then(setPush); }, [installed, ios]);

  async function togglePush(on: boolean): Promise<void> {
    try {
      if (on) await enablePush();
      else await disablePush();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'That did not work.');
    }
    setPush(await pushState(installed, ios));
  }

  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]): void => prefs.set({ [k]: v } as Partial<Prefs>);
  const Seg = <T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) => (
    <span className="seg" role="group" aria-label={label}>{options.map(([v, t]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{t}</button>)}</span>
  );

  return (
    <>
      <div className="topbar"><h1>Settings</h1></div>
      <div className="scroll page" style={{ paddingBottom: 24 }}>
        <div className="profile">
          <button type="button" aria-label="Change your picture" onClick={() => picker.current?.click()}><Avatar user={me} size={72} /></button>
          <input ref={picker} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void setAvatar(f).catch((er: Error) => showToast(er.message)); e.target.value = ''; }} />
          <div style={{ minWidth: 0 }}>
            <h2>{me?.displayName}</h2>
            <p>@{me?.username}</p>
            {me?.avatar ? <button className="btn text" style={{ padding: 0, minHeight: 32 }} onClick={() => void setAvatar(null)}>Remove picture</button> : null}
          </div>
        </div>
        <Action icon="edit" title="Name and status" sub={me?.statusMessage || me?.displayName} onClick={() => setDialog('name')} />

        <Group title="Notifications">
          <Toggle icon="bell" title="Message and call alerts" sub={PUSH_TEXT[push]} checked={push === 'on'} disabled={push !== 'on' && push !== 'off'} onChange={(v) => void togglePush(v)} />
          <Toggle icon="bell" title="Sounds" sub="Short sounds for new messages and calls" checked={prefs.sounds} onChange={(v) => set('sounds', v)} />
          {push === 'on' ? <Action icon="bell" title="Send a test notification" onClick={() => void api.pushTest().then((r) => showToast(r.sent ? 'Sent. It should arrive in a moment.' : r.error ?? 'Nothing was sent.')).catch((e: Error) => showToast(e.message))} /> : null}
          {ios && !installed ? <Action icon="info" title="Add Ember to your Home Screen" sub="Needed for notifications on iPhone and iPad" onClick={() => setDialog('ios')} /> : null}
          {canInstall() ? <Action icon="download" title="Install Ember" sub="Open it like an app, with its own window" onClick={() => void promptInstall()} /> : null}
        </Group>

        <Group title="Appearance">
          <AppearanceRows />
        </Group>

        <Group title="Chats">
          <Toggle icon="send" title="Enter sends" sub="Off: Enter adds a new line. Ctrl or Cmd with Enter always sends." checked={prefs.enterSends} onChange={(v) => set('enterSends', v)} />
          <Toggle icon="edit" title="Check spelling" sub="Underline misspelt words in the message box" checked={prefs.spellcheck} onChange={(v) => set('spellcheck', v)} />
        </Group>

        <Group title="GIFs and stickers">
          <div className="setting"><Icon name="photo" className="ico" /><span className="main"><label htmlFor="giphy">Giphy key</label><small>Your own key from developers.giphy.com. Without one, Giphy stays off.</small><input id="giphy" className="key-input" type="text" autoComplete="off" autoCapitalize="off" spellCheck={false} value={prefs.giphyKey} onChange={(e) => set('giphyKey', e.target.value)} /></span></div>
          <div className="setting"><Icon name="photo" className="ico" /><span className="main"><label htmlFor="imgur">Imgur client ID</label><small>Your own ID from api.imgur.com. Without one, Imgur stays off.</small><input id="imgur" className="key-input" type="text" autoComplete="off" autoCapitalize="off" spellCheck={false} value={prefs.imgurId} onChange={(e) => set('imgurId', e.target.value)} /></span></div>
        </Group>

        <Group title="Calls">
          <Toggle icon="camera" title="Mirror my own picture" sub="You see yourself like in a mirror. Others see you as you are." checked={prefs.mirrorSelf} onChange={(v) => set('mirrorSelf', v)} />
          <div className="setting"><Icon name="flip" className="ico" /><span className="main">Flip front camera for others<small>Auto flips on Samsung phones, whose cameras send an already flipped picture</small></span><Seg label="Flip front camera" value={prefs.flipFront} options={[['auto', 'Auto'], ['on', 'On'], ['off', 'Off']]} onChange={(v) => set('flipFront', v)} /></div>
        </Group>

        <Group title="Security">
          <div className="setting">
            <Icon name="lock" className="ico" />
            <span className="main">End-to-end encryption<small>{e2ee.status === 'ready' ? 'Set up in this browser' : e2ee.status === 'waiting' ? 'Waiting for another device to approve this browser' : 'Not set up in this browser'}</small></span>
            {e2ee.status !== 'ready' ? <button className="btn tonal" disabled={e2ee.busy} onClick={() => void setupE2ee(e2ee.status !== 'waiting')}>{e2ee.status === 'waiting' ? 'Check' : 'Set up'}</button> : null}
          </div>
          {info?.features?.twoStep !== false ? <Action icon="shield" title="Two-step sign-in" sub="A code from an authenticator app when you sign in" onClick={() => setDialog('twostep')} /> : null}
          <Action icon="edit" title="Username" sub={`@${me?.username}`} onClick={() => setDialog('username')} />
          <Action icon="lock" title="Change password" onClick={() => setDialog('password')} />
          <Action icon="people" title="Blocked people" onClick={() => setDialog('blocked')} />
        </Group>

        <Group title="Help">
          <Toggle icon="info" title="Send crash reports" sub="To your Hearth server, so a fix can be made" checked={prefs.crashReports} onChange={(v) => set('crashReports', v)} />
          <div className="setting"><Icon name="info" className="ico" /><span className="main">Ember web {__APP_VERSION__}<small>{info?.name ?? 'Hearth server'}{info?.version ? ` ${info.version}` : ''} · {location.host}</small></span></div>
          <Action icon="logout" title="Sign out" danger onClick={() => void signOut()} />
        </Group>
      </div>

      {dialog === 'name' && me ? <NameDialog me={me} onSave={async (n, s) => { await updateProfile({ displayName: n, statusMessage: s }); setDialog(null); }} onClose={() => setDialog(null)} /> : null}
      {dialog === 'password' ? <PasswordDialog onClose={() => setDialog(null)} /> : null}
      {dialog === 'username' ? <UsernameDialog onClose={() => setDialog(null)} /> : null}
      {dialog === 'twostep' ? <TwoStepDialog onClose={() => setDialog(null)} /> : null}
      {dialog === 'blocked' ? <BlockedDialog onClose={() => setDialog(null)} /> : null}
      {dialog === 'ios' ? (
        <Sheet title="Add to Home Screen" onClose={() => setDialog(null)} actions={<button className="btn" onClick={() => setDialog(null)}>Got it</button>}>
          <ol style={{ paddingLeft: 20, margin: 0, lineHeight: 1.8 }}>
            <li>Open this page in Safari.</li>
            <li>Tap the Share button (the square with an arrow).</li>
            <li>Choose <b>Add to Home Screen</b>, then <b>Add</b>.</li>
            <li>Open Ember from the Home Screen and turn on notifications here.</li>
          </ol>
        </Sheet>
      ) : null}
    </>
  );
}

function useAction(): [boolean, string, (job: () => Promise<void>) => Promise<void>] {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return [busy, error, async (job) => { setBusy(true); setError(''); try { await job(); } catch (e) { setError(e instanceof Error ? e.message : 'That did not work.'); } finally { setBusy(false); } }];
}

function NameDialog({ me, onSave, onClose }: { me: User; onSave: (name: string, status: string) => Promise<void>; onClose: () => void }) {
  const [name, setName] = useState(me.displayName);
  const [status, setStatus] = useState(me.statusMessage);
  const [busy, error, run] = useAction();
  return (
    <Sheet title="Name and status" onClose={onClose} actions={<><button className="btn text" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || !name.trim()} onClick={() => void run(() => onSave(name.trim(), status.trim()))}>Save</button></>}>
      <label className="field-label" htmlFor="n">Name</label>
      <input id="n" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      <label className="field-label" htmlFor="s">Status</label>
      <input id="s" className="input" value={status} maxLength={120} onChange={(e) => setStatus(e.target.value)} />
      {error ? <p className="error-text" role="alert">{error}</p> : null}
    </Sheet>
  );
}

function PasswordDialog({ onClose }: { onClose: () => void }) {
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [busy, error, run] = useAction();
  const { showToast } = useStore();
  return (
    <Sheet title="Change password" onClose={onClose} actions={<><button className="btn text" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || !cur || next.length < 8} onClick={() => void run(async () => { await api.changePassword(cur, next); showToast('Password changed'); onClose(); })}>Change</button></>}>
      <label className="field-label" htmlFor="cp">Current password</label>
      <input id="cp" className="input" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
      <label className="field-label" htmlFor="np2">New password (8 or more characters)</label>
      <input id="np2" className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      {error ? <p className="error-text" role="alert">{error}</p> : null}
    </Sheet>
  );
}

function UsernameDialog({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [pw, setPw] = useState('');
  const [busy, error, run] = useAction();
  const { showToast } = useStore();
  return (
    <Sheet title="Change username" onClose={onClose} actions={<><button className="btn text" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || !name.trim() || !pw} onClick={() => void run(async () => { const { user } = await api.changeUsername(name.trim(), pw); useStore.setState({ me: user }); showToast('Username changed'); onClose(); })}>Change</button></>}>
      <label className="field-label" htmlFor="un">New username</label>
      <input id="un" className="input" value={name} autoCapitalize="none" autoCorrect="off" spellCheck={false} onChange={(e) => setName(e.target.value)} />
      <label className="field-label" htmlFor="up">Your password</label>
      <input id="up" className="input" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      {error ? <p className="error-text" role="alert">{error}</p> : null}
    </Sheet>
  );
}

function TwoStepDialog({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<TwoStepStatus | null>(null);
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [busy, error, run] = useAction();
  useEffect(() => { void api.twoStep().then(setStatus).catch(() => undefined); }, []);
  return (
    <Sheet title="Two-step sign-in" onClose={onClose} actions={<button className="btn" onClick={onClose}>Done</button>}>
      {recovery ? (
        <>
          <p>Two-step sign-in is on. Keep these recovery codes somewhere safe. Each works once if you lose your authenticator.</p>
          <pre style={{ background: 'var(--container-high)', padding: 12, borderRadius: 12, userSelect: 'all', fontSize: 15 }}>{recovery.join('\n')}</pre>
        </>
      ) : status?.enabled ? (
        <>
          <p>Two-step sign-in is on ({status.recoveryLeft} recovery codes left). To switch it off, enter your password and a current code.</p>
          <input className="input" type="password" placeholder="Password" aria-label="Password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} />
          <input className="input" style={{ marginTop: 8 }} placeholder="Code" aria-label="Code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn danger" disabled={busy || !pw || !code} onClick={() => void run(async () => { await api.twoStepDisable(pw, code.trim()); setStatus({ enabled: false, recoveryLeft: 0 }); setPw(''); setCode(''); })}>Switch off</button>
        </>
      ) : setup ? (
        <>
          <p>Add this account to your authenticator app. On a phone, <a href={setup.uri}>tap here to open it</a>; otherwise type this key in:</p>
          <pre style={{ background: 'var(--container-high)', padding: 12, borderRadius: 12, userSelect: 'all', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{setup.secret}</pre>
          <label className="field-label" htmlFor="tc">Then enter the 6-digit code it shows</label>
          <input id="tc" className="input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} />
          <button className="btn" style={{ marginTop: 12 }} disabled={busy || code.trim().length < 6} onClick={() => void run(async () => { const r = await api.twoStepEnable(code.trim()); setRecovery(r.recovery); setSetup(null); })}>Turn on</button>
        </>
      ) : (
        <>
          <p>Ask for a code from an authenticator app each time you sign in.</p>
          <button className="btn" disabled={busy} onClick={() => void run(async () => setSetup(await api.twoStepSetup()))}>Set up</button>
        </>
      )}
      {error ? <p className="error-text" role="alert">{error}</p> : null}
    </Sheet>
  );
}

function BlockedDialog({ onClose }: { onClose: () => void }) {
  const [list, setList] = useState<User[] | null>(null);
  const load = (): void => void api.blocks().then((r) => setList(r.blocked)).catch(() => setList([]));
  useEffect(load, []);
  return (
    <Sheet title="Blocked people" onClose={onClose} actions={<button className="btn" onClick={onClose}>Done</button>}>
      {list?.length === 0 ? <p className="empty">Nobody is blocked.</p> : null}
      {list?.map((u) => (
        <div key={u.id} className="check-row"><Avatar user={u} size={40} /><span style={{ flex: 1 }}>{u.displayName}</span><button className="btn tonal" onClick={() => void api.unblock(u.id).then(load)}>Unblock</button></div>
      ))}
    </Sheet>
  );
}
