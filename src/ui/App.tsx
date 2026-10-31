import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import { usePrefs } from '../lib/prefs';
import { applyLook } from '../lib/theme';
import { onUpdateReady, reloadForUpdate } from '../lib/update';
import { CallScreen, RingCard } from './Call';
import { ChatList } from './ChatList';
import { ChatScreen } from './ChatScreen';
import { Icon, type IconName } from './kit';
import { Login } from './Login';
import { People } from './People';
import { Settings } from './Settings';

type Tab = 'chats' | 'people' | 'settings';
interface Route { tab: Tab; chatId: string | null }

function parse(hash: string, last: Tab): Route {
  const parts = hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'chat' && parts[1]) return { tab: last, chatId: decodeURIComponent(parts[1]) };
  if (parts[0] === 'people' || parts[0] === 'settings') return { tab: parts[0], chatId: null };
  return { tab: 'chats', chatId: null };
}

const NAV: [Tab, string, IconName][] = [['chats', 'Chats', 'chat'], ['people', 'People', 'people'], ['settings', 'Settings', 'settings']];

function useWide(): boolean {
  const [wide, setWide] = useState(() => window.matchMedia('(min-width: 900px)').matches);
  useEffect(() => {
    const q = window.matchMedia('(min-width: 900px)');
    const on = (): void => setWide(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return wide;
}

export function App() {
  const boot = useStore((s) => s.boot);
  const toast = useStore((s) => s.toast);
  const online = useStore((s) => s.online);
  const rooms = useStore((s) => s.rooms);
  const requests = useStore((s) => s.contacts.incoming.length);
  const theme = usePrefs((s) => s.theme);
  const accent = usePrefs((s) => s.accent);
  const wallpaper = usePrefs((s) => s.wallpaper);
  const wallpaperDim = usePrefs((s) => s.wallpaperDim);
  const wallpaperPhoto = usePrefs((s) => s.wallpaperPhoto);
  const wide = useWide();
  const [last, setLast] = useState<Tab>('chats');
  const [hash, setHash] = useState(location.hash);
  const [update, setUpdate] = useState(false);

  useEffect(() => { void applyLook({ theme, accent, wallpaper, wallpaperDim }); }, [theme, accent, wallpaper, wallpaperDim, wallpaperPhoto]);
  useEffect(() => {
    if (theme !== 'system') return;
    const q = window.matchMedia('(prefers-color-scheme: dark)');
    const on = (): void => { void applyLook({ theme, accent, wallpaper, wallpaperDim }); };
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, [theme, accent, wallpaper, wallpaperDim]);
  useEffect(() => { void useStore.getState().init(); onUpdateReady(() => setUpdate(true)); }, []);
  useEffect(() => {
    const on = (): void => setHash(location.hash);
    window.addEventListener('hashchange', on);
    const sw = (e: MessageEvent): void => { const d = e.data as { type?: string; roomId?: string } | undefined; if (d?.type === 'OPEN_ROOM' && d.roomId) location.hash = `#/chat/${d.roomId}`; };
    navigator.serviceWorker?.addEventListener('message', sw);
    return () => { window.removeEventListener('hashchange', on); navigator.serviceWorker?.removeEventListener('message', sw); };
  }, []);

  const route = parse(hash, last);
  useEffect(() => { if (!route.chatId) setLast(route.tab); }, [route.chatId, route.tab]);

  const go = useCallback((h: string) => { if (location.hash === h) setHash(h); else location.hash = h; }, []);
  const openChat = useCallback((id: string) => go(`#/chat/${encodeURIComponent(id)}`), [go]);
  const back = useCallback(() => go(`#/${last === 'chats' ? '' : last}`), [go, last]);

  if (boot === 'loading') return <div className="app" aria-busy="true"><div className="empty-main"><img src="/icons/icon-192.png" alt="" />Ember</div></div>;
  if (boot === 'signedOut') return <><Login />{toast ? <div className="toast" role="status">{toast.text}</div> : null}</>;

  const unread = rooms.filter((r) => !r.archived).reduce((n, r) => n + r.unread, 0);
  const chatOpen = !!route.chatId;
  const screen = chatOpen ? 'chat' : 'list';
  const nav = (
    <nav className="bottom-nav" aria-label="Sections">
      {NAV.map(([tab, label, icon]) => (
        <button key={tab} type="button" aria-current={route.tab === tab ? 'page' : undefined} onClick={() => go(tab === 'chats' ? '#/' : `#/${tab}`)}>
          <span className="pill"><Icon name={icon} />{tab === 'chats' && unread > 0 ? <span className="badge">{unread > 99 ? '99+' : unread}</span> : null}{tab === 'people' && requests > 0 ? <span className="badge">{requests}</span> : null}</span>
          {label}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="app" data-screen={screen}>
      <div className="pane-list">
        {!online ? <div className="top-note" role="status">You are offline. Messages wait until you are back.</div> : null}
        {route.tab === 'chats' ? <ChatList activeId={route.chatId} onOpen={openChat} /> : route.tab === 'people' ? <People onOpenChat={openChat} /> : <Settings />}
        {nav}
      </div>
      <main className="pane-main">
        {route.chatId ? <ChatScreen key={route.chatId} roomId={route.chatId} onBack={back} onClose={back} wide={wide} /> : wide ? <div className="empty-main"><img src="/icons/icon-192.png" alt="" /><p>Pick a chat, or start a new one.</p></div> : null}
      </main>
      <RingCard />
      <CallScreen />
      {update ? <div className="update-bar" role="status"><span style={{ flex: 1 }}>A new version of Ember is ready.</span><button type="button" onClick={reloadForUpdate}>Reload</button></div> : null}
      {toast ? <div className="toast" role="status" aria-live="polite">{toast.text}</div> : null}
    </div>
  );
}
