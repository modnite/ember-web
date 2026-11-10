import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { disablePush, enablePush, pushState, type PushState } from '../lib/push';
import { Icon, Sheet, Toggle } from './kit';

const TEXT: Record<PushState, string> = {
  unsupported: 'This browser cannot show notifications.',
  'needs-install': 'Open Ember from its Home Screen icon to enable iPhone or iPad notifications.',
  blocked: 'The system reports notifications as blocked. Try enabling them or open Notification help.',
  off: 'Receive message and call alerts when Ember is closed.',
  on: 'This device is registered for notifications.',
  'server-off': 'This server has no push notifications set up.',
  unregistered: 'Permission is allowed, but this device needs to reconnect to the server.',
  unavailable: 'Could not check notifications. Check your connection and try again.',
};

export function NotificationSettings({ installed, ios, onError }: { installed: boolean; ios: boolean; onError: (message: string) => void }) {
  const [state, setState] = useState<PushState | 'checking'>('checking');
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState(false);
  const revision = useRef(0);
  const changing = useRef(false);
  useEffect(() => {
    let alive = true;
    const refresh = (): void => {
      if (changing.current || document.visibilityState === 'hidden') return;
      const current = ++revision.current;
      void pushState(installed, ios).then((value) => { if (alive && current === revision.current) setState(value); });
    };
    refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('pageshow', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => { alive = false; window.removeEventListener('focus', refresh); window.removeEventListener('pageshow', refresh); document.removeEventListener('visibilitychange', refresh); };
  }, [installed, ios]);

  async function change(enabled: boolean): Promise<void> {
    if (changing.current) return;
    changing.current = true; ++revision.current; setBusy(true);
    try {
      // Request permission in this button's tap, before awaiting network or worker readiness.
      if (enabled) await enablePush(); else await disablePush();
    } catch (error) { onError(error instanceof Error ? error.message : 'Could not change notifications.'); setHelp(true); }
    finally {
      const value = await pushState(installed, ios);
      setState(value); changing.current = false; setBusy(false);
    }
  }
  const description = state === 'checking' ? 'Checking this device…' : TEXT[state];
  const canEnable = state === 'off' || state === 'blocked' || state === 'unregistered' || state === 'unavailable';
  return <>
    {state === 'on' ? <Toggle icon="bell" title="Message and call alerts" sub={description} checked disabled={busy} onChange={() => void change(false)} /> :
      <div className="setting"><Icon name="bell" className="ico" /><span className="main">Message and call alerts<small>{description}</small></span></div>}
    {canEnable ? <button type="button" className="setting" disabled={busy} onClick={() => void change(true)}><Icon name="bell" className="ico" /><span className="main">{busy ? 'Enabling notifications…' : state === 'unregistered' ? 'Reconnect notifications' : 'Enable notifications'}</span></button> : null}
    <button type="button" className="setting" onClick={() => setHelp(true)}><Icon name="info" className="ico" /><span className="main">Notification help</span></button>
    {state === 'on' ? <button type="button" className="setting" onClick={() => void api.pushTest().then((result) => onError(result.sent ? 'Sent. Check your notifications.' : result.error ?? 'Nothing was sent.')).catch((error: Error) => onError(error.message))}><Icon name="bell" className="ico" /><span className="main">Send a test notification</span></button> : null}
    {help ? <Sheet title="Notification help" onClose={() => setHelp(false)} actions={<button className="btn" onClick={() => setHelp(false)}>Done</button>}>
      {ios ? <>
        <p>iPhone and iPad notifications require iOS or iPadOS 16.4 or later and Ember opened from its Home Screen icon.</p>
        <p>If needed, open Ember in Safari, tap Share, then Add to Home Screen. Keep Open as Web App enabled if that option appears, and launch the new icon.</p>
        <p>Tap Enable notifications in Ember, then Allow in the iOS prompt.</p>
        <p>If no prompt appears, open iPhone Settings → Notifications → Ember and turn on Allow Notifications, if Ember is listed. Return here to check again.</p>
        <p>If Ember is not listed, confirm that the Home Screen icon opens the installed web app rather than a Safari bookmark. The blocked status alone does not mean you declined a prompt.</p>
        <p>If alerts are enabled but quiet, also check Focus and notification delivery settings.</p>
      </> : <p>Allow notifications for this site in your browser settings, then return here and enable them. Check system notification and Focus settings if delivery is quiet.</p>}
      <p>Use Send a test notification after this device is registered. An app update cannot override a system-level block.</p>
    </Sheet> : null}
  </>;
}
