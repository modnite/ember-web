import { useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { Avatar, Icon, Sheet, Toggle } from './kit';

/** Start a chat with someone you know, or make a group. Only people you are connected to are offered (the server never lists strangers). */
export function NewChat({ onClose, onOpen }: { onClose: () => void; onOpen: (roomId: string) => void }) {
  const { users, contacts, rooms, me, openDm, createGroup, showToast } = useStore();
  const [group, setGroup] = useState(false);
  const [q, setQ] = useState('');
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [encrypted, setEncrypted] = useState(false);
  const [busy, setBusy] = useState(false);

  const people = useMemo(() => {
    const ids = new Set(contacts.contacts);
    // Everyone you share a chat with counts as someone you know, too.
    for (const r of rooms) for (const m of r.members) ids.add(m.id);
    ids.delete(me!.id);
    const needle = q.trim().toLowerCase();
    return [...ids].map((id) => users[id]).filter(Boolean).filter((u) => !needle || u!.displayName.toLowerCase().includes(needle) || u!.username.toLowerCase().includes(needle)).sort((a, b) => a!.displayName.localeCompare(b!.displayName));
  }, [contacts.contacts, rooms, users, me, q]);

  async function pick(id: string): Promise<void> {
    if (busy) return;
    if (group) {
      setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
      return;
    }
    setBusy(true);
    try {
      onOpen(await openDm(id));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not open that chat.');
      setBusy(false);
    }
  }

  async function make(): Promise<void> {
    setBusy(true);
    try {
      onOpen(await createGroup(name, picked, encrypted));
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not make the group.');
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={group ? 'New group' : 'New chat'}
      onClose={onClose}
      actions={group ? <><button className="btn text" onClick={() => setGroup(false)}>Back</button><button className="btn" disabled={busy || !name.trim() || picked.length === 0} onClick={() => void make()}>Create</button></> : undefined}
    >
      {group ? (
        <>
          <label className="field-label" htmlFor="gn">Group name</label>
          <input id="gn" className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus />
          <Toggle icon="lock" title="End-to-end encrypted" checked={encrypted} onChange={setEncrypted} />
        </>
      ) : (
        <button type="button" className="menu-item" style={{ padding: 0 }} onClick={() => setGroup(true)}>
          <Icon name="people" />New group
        </button>
      )}
      <label className="field-label" htmlFor="np">{group ? 'Add people' : 'People'}</label>
      <input id="np" className="input" type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
      <div style={{ marginTop: 8 }}>
        {people.map((u) => (
          <button key={u!.id} type="button" className="check-row" onClick={() => void pick(u!.id)}>
            {group ? <input type="checkbox" readOnly checked={picked.includes(u!.id)} tabIndex={-1} aria-hidden="true" /> : null}
            <Avatar user={u} size={40} dot />
            <span style={{ flex: 1, minWidth: 0 }}>{u!.displayName}<small style={{ display: 'block', color: 'var(--on-surface-variant)' }}>@{u!.username}</small></span>
          </button>
        ))}
        {people.length === 0 ? <p className="empty">Nobody here yet. Add a friend from the People tab first.</p> : null}
      </div>
    </Sheet>
  );
}
