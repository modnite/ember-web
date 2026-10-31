import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useStore } from '../lib/store';
import type { LookupResult, User } from '../lib/types';
import { Avatar, Confirm, Icon, IconButton, Sheet } from './kit';

/** Contacts: friend requests to answer, everyone you know, and adding by exact username or friend code (the server never lists strangers). */
export function People({ onOpenChat }: { onOpenChat: (roomId: string) => void }) {
  const { contacts, users, me, openDm, acceptContact, removeContact, loadContacts, showToast } = useStore();
  const [adding, setAdding] = useState(false);
  const [remove, setRemove] = useState<User | null>(null);
  useEffect(() => void loadContacts(), [loadContacts]);

  const known = contacts.contacts.map((id) => users[id]).filter((u): u is User => !!u && u.id !== me?.id).sort((a, b) => a.displayName.localeCompare(b.displayName));

  async function message(u: User): Promise<void> {
    try {
      onOpenChat(await openDm(u.id));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not open that chat.');
    }
  }

  return (
    <>
      <div className="topbar"><h1>People</h1><IconButton icon="personAdd" label="Add a person" onClick={() => setAdding(true)} /></div>
      <div className="scroll page">
        {contacts.incoming.length > 0 ? <div className="section-title">Friend requests ({contacts.incoming.length})</div> : null}
        {contacts.incoming.map((u) => (
          <div className="row" key={u.id}>
            <Avatar user={u} />
            <span className="main"><span className="name">{u.displayName}</span><span className="line2">@{u.username}</span></span>
            <button className="btn tonal" onClick={() => void acceptContact(u.id).catch((e: Error) => showToast(e.message))}>Accept</button>
            <IconButton icon="close" label={`Decline ${u.displayName}`} onClick={() => void removeContact(u.id).catch((e: Error) => showToast(e.message))} />
          </div>
        ))}
        <div className="section-title">Everyone you know ({known.length})</div>
        {known.map((u) => (
          <div className="row" key={u.id} style={{ paddingRight: 8 }}>
            <button type="button" className="row" style={{ padding: 0, minHeight: 0, flex: 1, width: 'auto' }} onClick={() => void message(u)} aria-label={`Message ${u.displayName}`}>
              <Avatar user={u} dot />
              <span className="main"><span className="name">{u.displayName}</span><span className="line2">{u.statusMessage || (u.status === 'offline' ? 'Offline' : 'Online')}</span></span>
            </button>
            <IconButton icon="more" label={`More about ${u.displayName}`} onClick={() => setRemove(u)} />
          </div>
        ))}
        {contacts.outgoing.length > 0 ? <div className="section-title">Waiting for an answer</div> : null}
        {contacts.outgoing.map((u) => (
          <div className="row" key={u.id}>
            <Avatar user={u} />
            <span className="main"><span className="name">{u.displayName}</span><span className="line2">@{u.username}</span></span>
            <button className="btn text" onClick={() => void removeContact(u.id)}>Cancel</button>
          </div>
        ))}
        {known.length === 0 && contacts.incoming.length === 0 ? <div className="empty">Add people by username or friend code with the button above.</div> : null}
      </div>
      {adding ? <AddPerson onClose={() => setAdding(false)} /> : null}
      {remove ? <Confirm title={`Remove ${remove.displayName}?`} text="They stay in any chats you share. You can add them again later." yes="Remove" danger onYes={() => void removeContact(remove.id)} onClose={() => setRemove(null)} /> : null}
    </>
  );
}

function AddPerson({ onClose }: { onClose: () => void }) {
  const { addContact, showToast } = useStore();
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<LookupResult | null>(null);
  const [mine, setMine] = useState<string>('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api.friendCode().then((c) => setMine(c.display)).catch(() => undefined);
  }, []);

  async function look(): Promise<void> {
    setBusy(true);
    try {
      setFound(await api.lookup(query.trim()));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not look that up.');
    } finally {
      setBusy(false);
    }
  }

  async function add(): Promise<void> {
    if (!found?.user) return;
    try {
      await addContact(found.user.username);
      showToast('Request sent');
      onClose();
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not send the request.');
    }
  }

  return (
    <Sheet title="Add a person" onClose={onClose}>
      {mine ? <p style={{ margin: '0 0 8px' }}>Your friend code: <b>{mine}</b><br /><small style={{ color: 'var(--on-surface-variant)' }}>Share it so people can add you without knowing your username.</small></p> : null}
      <form className="lookup" onSubmit={(e) => { e.preventDefault(); void look(); }}>
        <input className="input" placeholder="Username or friend code" aria-label="Username or friend code" value={query} onChange={(e) => { setQuery(e.target.value); setFound(null); }} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoFocus />
        <button className="btn" type="submit" disabled={busy || !query.trim()}>Find</button>
      </form>
      {found ? (
        found.user ? (
          <div className="row" style={{ padding: '12px 0' }}>
            <Avatar user={found.user} />
            <span className="main"><span className="name">{found.user.displayName}</span><span className="line2">@{found.user.username}</span></span>
            {found.relation === 'none' ? <button className="btn" onClick={() => void add()}><Icon name="personAdd" />Add</button> : <span className="line2">{found.relation === 'contact' ? 'Already a contact' : found.relation === 'outgoing' ? 'Request sent' : found.relation === 'incoming' ? 'Wants to add you' : 'Blocked'}</span>}
          </div>
        ) : <p className="error-text">No one found with that.</p>
      ) : null}
    </Sheet>
  );
}
