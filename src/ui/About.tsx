import { useEffect, useState } from 'react';
import { desktopCheckUpdate, desktopInfo, desktopInstallUpdate, isDesktop, type DesktopInfo, type DesktopUpdate } from '../lib/desktop';
import { useStore } from '../lib/store';
import { checkForWebUpdate, reloadForUpdate } from '../lib/update';
import { Icon, Sheet, type IconName } from './kit';

declare const __APP_VERSION__: string;

/** Where the source of each part lives. */
const REPOS: Array<[string, string, string]> = [
  ['Ember for Android', 'Source code of the phone app', 'https://github.com/modnite/ember-android'],
  ['Ember web', 'This page, in the browser and inside the desktop app', 'https://github.com/modnite/ember-web'],
  ['Ember for desktop', 'Windows, Mac and Linux', 'https://github.com/modnite/ember-desktop'],
  ['Hearth server', 'The server Ember talks to', 'https://github.com/modnite/hearth-server'],
];

function Row({ icon, title, sub, onClick, href }: { icon: IconName; title: string; sub?: string; onClick?: () => void; href?: string }) {
  const body = <><Icon name={icon} className="ico" /><span className="main">{title}{sub ? <small>{sub}</small> : null}</span></>;
  if (href) return <a className="setting" href={href} target="_blank" rel="noreferrer">{body}</a>;
  if (onClick) return <button type="button" className="setting" onClick={onClick}>{body}</button>;
  return <div className="setting">{body}</div>;
}

/** About Ember: the app and server versions, a check for updates, and the source of every part. */
export function AboutDialog({ onClose }: { onClose: () => void }) {
  const info = useStore((s) => s.info);
  const desktop = isDesktop();
  const [shell, setShell] = useState<DesktopInfo | null>(null);
  const [status, setStatus] = useState('');
  const [found, setFound] = useState<DesktopUpdate | null>(null);
  const [webReady, setWebReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (desktop) void desktopInfo().then(setShell).catch(() => undefined); }, [desktop]);

  const check = async (): Promise<void> => {
    setBusy(true);
    setStatus('Looking…');
    try {
      // The web page is what the server hands out, so it updates by reloading; the desktop app around it is updated from its own releases.
      const web = await checkForWebUpdate();
      setWebReady(web);
      if (desktop) {
        const u = await desktopCheckUpdate();
        setFound(u.newer ? u : null);
        setStatus(web || u.newer ? '' : 'Everything is up to date.');
      } else {
        setStatus(web ? '' : 'Everything is up to date.');
      }
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not check.');
    } finally {
      setBusy(false);
    }
  };

  const install = async (): Promise<void> => {
    if (!found) return;
    setBusy(true);
    setStatus(found.installer ? 'Downloading…' : '');
    try {
      if (found.installer) await desktopInstallUpdate(found.installer);
      else window.open(found.page, '_blank', 'noreferrer');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const serverLine = [info?.name, info?.version ? `version ${info.version}` : '', info?.software && !info.version ? info.software : ''].filter(Boolean).join(', ') || 'Version not given';

  return (
    <Sheet title="About Ember" onClose={onClose} actions={<button className="btn" onClick={onClose}>Done</button>}>
      <div className="group-title">Versions</div>
      <Row icon="info" title={desktop ? 'Ember desktop' : 'Ember web'} sub={desktop ? `App ${shell?.version ?? '…'}${shell ? ` on ${shell.os}` : ''}, page ${__APP_VERSION__}` : `Version ${__APP_VERSION__}`} />
      <Row icon="info" title={location.host} sub={serverLine} />
      <div className="group-title">Updates</div>
      {webReady ? <Row icon="download" title="A new version of the page is ready" sub="Reload to use it" onClick={reloadForUpdate} /> : null}
      {found ? <Row icon="download" title={`Ember desktop ${found.latest} is available`} sub={found.installer ? 'Download and install, the app restarts' : 'Open the download'} onClick={() => void install()} /> : null}
      <Row icon="download" title={busy ? 'Looking…' : 'Check for updates'} sub={status || undefined} onClick={busy ? undefined : () => void check()} />
      <div className="group-title">Source code</div>
      {REPOS.map(([title, sub, url]) => <Row key={url} icon="file" title={title} sub={sub} href={url} />)}
    </Sheet>
  );
}
