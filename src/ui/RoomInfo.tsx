import { useRef, useState } from 'react';
import { roomPeer, roomTitle } from '../lib/format';
import { useStore } from '../lib/store';
import type { Room, User } from '../lib/types';
import { Avatar, Confirm, Icon, IconButton, Sheet, Toggle } from './kit';

/**
 * Chat details. For a group: its picture and name, who is in it, adding people (anyone in the group can add their own contacts), removing
 * people (only whoever made it), leaving. For a direct chat: the person, archive and the encryption switch.
 */
export function RoomInfo({ room, onClose, onLeft }: { room: Room; onClose: () => void; onLeft: () => void }) {
  const { me, users, contacts, renameRoom, addMembers, removeMember, leaveRoom, archiveRoom, setRoomAvatar, showToast } = useStore();
  const meId = me!.id;
  const isGroup = room.kind === 'group';
  const maker = room.createdBy === meId;
  const peer = roomPeer(room, meId);
  const [name, setName] = useState(room.name);
  const [adding, setAdding] = useState(false);
  const [leave, setLeave] = useState(false);
  const [removing, setRemoving] = useState<User | null>(null);
  const pic = useRef<HTMLInputElement>(null);

  const guard = (p: Promise<unknown>): void => void p.catch((e: Error) => showToast(e.message || 'That did not work.'));

  return (
    <Sheet title={isGroup ? 'Group' : 'Chat'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, paddingBottom: 8 }}>
        <Avatar user={peer} name={roomTitle(room, meId)} src={isGroup ? room.avatar : undefined} color={isGroup ? '#6b8e23' : undefined} size={88} dot />
        <b style={{ fontSize: 20 }}>{roomTitle(room, meId)}</b>
        {isGroup ? (
          <>
            <input ref={pic} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) guard(setRoomAvatar(room.id, f)); e.target.value = ''; }} />
            <span><button className="btn text" onClick={() => pic.current?.click()}>Change picture</button>{room.avatar ? <button className="btn text" onClick={() => guard(setRoomAvatar(room.id, null))}>Remove</button> : null}</span>
            <form style={{ display: 'flex', gap: 8, width: '100%' }} onSubmit={(e) => { e.preventDefault(); if (name.trim() && name.trim() !== room.name) guard(renameRoom(room.id, name)); }}>
              <input className="input" aria-label="Group name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
              <button className="btn tonal" type="submit" disabled={!name.trim() || name.trim() === room.name}>Rename</button>
            </form>
          </>
        ) : peer ? <span style={{ color: 'var(--on-surface-variant)' }}>@{peer.username}{peer.statusMessage ? ` · ${peer.statusMessage}` : ''}</span> : null}
      </div>

      {isGroup ? (
        <>
          <div className="section-title" style={{ padding: '12px 0 4px' }}>{room.members.length} members</div>
          <button type="button" className="check-row" onClick={() => setAdding(true)}><span className="icon-btn primary" style={{ width: 40, height: 40 }}><Icon name="personAdd" /></span>Add people</button>
          {room.members.map((m) => (
            <div key={m.id} className="check-row">
              <Avatar user={m} size={40} dot />
              <span style={{ flex: 1, minWidth: 0 }}>{m.displayName}{m.id === meId ? ' (you)' : ''}<small style={{ display: 'block', color: 'var(--on-surface-variant)' }}>{m.id === room.createdBy ? 'Made this group' : `@${m.username}`}</small></span>
              {maker && m.id !== meId ? <IconButton icon="personRemove" label={`Remove ${m.displayName}`} onClick={() => setRemoving(m)} /> : null}
            </div>
          ))}
        </>
      ) : null}

      <div style={{ marginTop: 12 }}>
        <Toggle icon="lock" title="End-to-end encrypted" sub={room.encrypted ? 'Only people in this chat can read it' : 'Switch on to seal new messages'} checked={room.encrypted} onChange={(v) => guard(useStore.getState().setupE2ee(true).then(() => import('../lib/api').then(({ api }) => api.setEncrypted(room.id, v))))} />
        <button type="button" className="menu-item" style={{ padding: 0 }} onClick={() => { guard(archiveRoom(room.id, !room.archived)); onClose(); }}><Icon name="archive" />{room.archived ? 'Move out of the archive' : 'Archive this chat'}</button>
        {isGroup ? <button type="button" className="menu-item danger" style={{ padding: 0 }} onClick={() => setLeave(true)}><Icon name="logout" />Leave group</button> : null}
      </div>

      {adding ? <AddPeople room={room} onClose={() => setAdding(false)} onAdd={(ids) => { guard(addMembers(room.id, ids)); setAdding(false); }} contacts={contacts.contacts} users={users} meId={meId} /> : null}
      {removing ? <Confirm title={`Remove ${removing.displayName}?`} text="They stop receiving this group's messages." yes="Remove" danger onYes={() => guard(removeMember(room.id, removing.id))} onClose={() => setRemoving(null)} /> : null}
      {leave ? <Confirm title="Leave this group?" text="You stop receiving its messages. Someone else has to add you back." yes="Leave" danger onYes={() => { void leaveRoom(room.id).then(onLeft).catch((e: Error) => showToast(e.message)); }} onClose={() => setLeave(false)} /> : null}
    </Sheet>
  );
}

function AddPeople({ room, contacts, users, meId, onAdd, onClose }: { room: Room; contacts: string[]; users: Record<string, User>; meId: string; onAdd: (ids: string[]) => void; onClose: () => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const inRoom = new Set(room.members.map((m) => m.id));
  const candidates = contacts.map((id) => users[id]).filter((u): u is User => !!u && u.id !== meId && !inRoom.has(u.id));
  return (
    <Sheet title="Add people" onClose={onClose} actions={<><button className="btn text" onClick={onClose}>Cancel</button><button className="btn" disabled={!picked.length} onClick={() => onAdd(picked)}>Add</button></>}>
      {candidates.length === 0 ? <p className="empty">Everyone you know is already here.</p> : null}
      {candidates.map((u) => (
        <button key={u.id} type="button" className="check-row" onClick={() => setPicked((p) => (p.includes(u.id) ? p.filter((x) => x !== u.id) : [...p, u.id]))}>
          <input type="checkbox" readOnly checked={picked.includes(u.id)} tabIndex={-1} aria-hidden="true" />
          <Avatar user={u} size={40} dot /><span>{u.displayName}</span>
        </button>
      ))}
    </Sheet>
  );
}
