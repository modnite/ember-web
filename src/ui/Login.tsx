import { useState, type FormEvent } from 'react';
import { ApiError } from '../lib/api';
import { useStore } from '../lib/store';
import { desktopChangeServer, isDesktop } from '../lib/desktop';

/**
 * Sign in or create an account, the way the Android app does it: one screen, an account created from the same place, an invite code only when
 * the server asks for one, and the two-step code only when the account has it. The field types and autocomplete values are what lets iOS and
 * browsers offer saved passwords, and every input is 16px so iOS does not zoom.
 */
export function Login() {
  const { signIn, register, info, authConfig } = useStore();
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [display, setDisplay] = useState('');
  const [invite, setInvite] = useState('');
  const [code, setCode] = useState('');
  const [needsCode, setNeedsCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [show, setShow] = useState(false);
  const open = (authConfig?.registration ?? info?.registration) === 'open';

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (mode === 'in') await signIn(username, password, needsCode ? code.trim() : undefined);
      else await register(invite, username, display || username, password);
    } catch (err) {
      if (err instanceof ApiError && err.body?.needs2fa) {
        setNeedsCode(true);
        setError(code ? 'That code did not work.' : '');
      } else setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="login">
        <form onSubmit={submit} noValidate>
          <svg className="logo" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path fillRule="evenodd" d="M8,3 H16 A5,5 0 0 1 21,8 V11 A5,5 0 0 1 16,16 H13 L7,20.5 L8,16 A5,5 0 0 1 3,11 V8 A5,5 0 0 1 8,3 Z M12,5.8 C12,5.8 9.3,8.3 9.3,10.6 C9.3,12.1 10.5,13.2 12,13.2 C13.5,13.2 14.7,12.1 14.7,10.6 C14.7,9.4 14.1,8.5 13.4,7.8 C13.4,8.8 12.9,9.3 12.4,9.3 C12.7,8.2 12.4,6.9 12,5.8 Z" />
          </svg>
          <h1>Ember</h1>
          {info?.name ? <p style={{ textAlign: 'center', margin: '0 0 8px', color: 'var(--on-surface-variant)' }}>{info.name}</p> : null}

          <label className="field-label" htmlFor="u">Username</label>
          <input id="u" className="input" name="username" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={username} onChange={(e) => setUsername(e.target.value)} required />

          {mode === 'up' ? (
            <>
              <label className="field-label" htmlFor="d">Your name</label>
              <input id="d" className="input" name="name" autoComplete="name" value={display} onChange={(e) => setDisplay(e.target.value)} />
              {!open ? (
                <>
                  <label className="field-label" htmlFor="i">Invite code</label>
                  <input id="i" className="input" name="invite" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={invite} onChange={(e) => setInvite(e.target.value)} />
                </>
              ) : null}
            </>
          ) : null}

          <label className="field-label" htmlFor="p">Password</label>
          <div style={{ position: 'relative' }}>
            <input id="p" className="input" name="password" type={show ? 'text' : 'password'} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} required style={{ paddingRight: 64 }} />
            <button type="button" className="btn text" style={{ position: 'absolute', right: 0, top: 0, minHeight: 48 }} onClick={() => setShow((v) => !v)} aria-pressed={show}>{show ? 'Hide' : 'Show'}</button>
          </div>

          {needsCode && mode === 'in' ? (
            <>
              <label className="field-label" htmlFor="c">Code from your authenticator app</label>
              <input id="c" className="input" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]*" value={code} onChange={(e) => setCode(e.target.value)} autoFocus />
            </>
          ) : null}

          {error ? <p className="error-text" role="alert">{error}</p> : null}
          <button className="btn block" type="submit" disabled={busy || !username || !password} style={{ marginTop: 16 }}>
            {busy ? 'One moment…' : mode === 'in' ? 'Sign in' : 'Create account'}
          </button>
          <div className="links">
            <button type="button" className="btn text" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(''); setNeedsCode(false); }}>
              {mode === 'in' ? 'Create an account' : 'I already have an account'}
            </button>
            {isDesktop() ? <button type="button" className="btn text" onClick={desktopChangeServer}>Change server</button> : null}
          </div>
        </form>
      </div>
    </div>
  );
}
