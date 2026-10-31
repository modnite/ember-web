import re, sys

def patch(path, pairs):
    s = open(path, encoding='utf-8', newline='').read()
    crlf = '\r\n' in s
    s = s.replace('\r\n', '\n')
    for old, new in pairs:
        assert old in s, (path, old[:70])
        s = s.replace(old, new, 1)
    if crlf:
        s = s.replace('\n', '\r\n')
    open(path, 'w', encoding='utf-8', newline='').write(s)

# icon
patch('src/ui/kit.tsx', [(
    "  photo: ",
    "  emoji: 'M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z',\n  photo: ")])

# attachment blob helper shared by the viewer and "save to favourites"
patch('src/ui/media.tsx', [
    ("""export function useAttachment(""",
     """/** The picture or file of an attachment as a Blob, opened with the room key when it is sealed. */
export async function attachmentBlob(a: Attachment, roomId: string, key: Uint8Array | null): Promise<Blob> {
  const res = await fetch(attachmentUrl(a.id), { credentials: 'same-origin' });
  if (!res.ok) throw new Error('Could not download that.');
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!a.encrypted) return new Blob([bytes as BlobPart], { type: a.mime || 'application/octet-stream' });
  if (!key) throw new Error('Set up encryption in this browser first.');
  const env = decodeEnvelope(a.envelope ?? '');
  const plain = env.v === 2 ? openBytes(roomKeyFromGroup(key, roomId, 'file'), env, bytes) : decryptBytes({ kid: env.kid } as never, roomId, env, bytes);
  return new Blob([plain as BlobPart], { type: env.mime || a.mime || 'application/octet-stream' });
}

export function useAttachment("""),
])

# chat screen
patch('src/ui/ChatScreen.tsx', [
    ("import { AttachmentView, Viewer } from './media';",
     "import { addFav } from '../lib/favourites';\nimport { isJumbo } from '../lib/emoji';\nimport { Emoji, EmojiText } from './EmojiText';\nimport { EmojiPicker, MediaPanel } from './MediaPanel';\nimport { AttachmentView, attachmentBlob, Viewer } from './media';"),
    ("(i % 2 === 1 ? <a key={i} href={p} target=\"_blank\" rel=\"noopener noreferrer nofollow\">{p}</a> : p))}",
     "(i % 2 === 1 ? <a key={i} href={p} target=\"_blank\" rel=\"noopener noreferrer nofollow\">{p}</a> : <EmojiText key={i} text={p} />))}"),
    ("<span>{m.replyTo.deleted ? 'This message was deleted' : quoteText}</span>",
     "<span>{m.replyTo.deleted ? 'This message was deleted' : <EmojiText text={quoteText} />}</span>"),
    ("{body ? <div className=\"text\">",
     "{body ? <div className={`text${!deleted && !text.locked && !text.failed && !m.attachments.length && isJumbo(body) ? ' jumbo' : ''}`}>"),
    ("{emoji}{c.n > 1 ? <small>{c.n}</small> : null}</button>",
     "<Emoji emoji={emoji} />{c.n > 1 ? <small>{c.n}</small> : null}</button>"),
    ("  const [attach, setAttach] = useState(false);",
     "  const [attach, setAttach] = useState(false);\n  const [panel, setPanel] = useState(false);\n  const [moreReact, setMoreReact] = useState<Message | null>(null);"),
    ("""  const mineMsg = menu?.userId === meId;""",
     """  function insertEmoji(e: string): void {
    const el = input.current;
    const at = el?.selectionStart ?? draft.length;
    const to = el?.selectionEnd ?? at;
    const next = draft.slice(0, at) + e + draft.slice(to);
    setDraft(next);
    window.requestAnimationFrame(() => {
      if (!el) return;
      el.setSelectionRange(at + e.length, at + e.length);
      grow(el);
    });
    store.typingNow(roomId);
  }

  async function saveFavourite(m: Message): Promise<void> {
    const a = m.attachments.find((x) => isSticker(x) || /gif/i.test(x.mime) || /\\.gif$/i.test(x.filename));
    if (!a) return;
    try {
      await addFav(isSticker(a) ? 'sticker' : 'gif', await attachmentBlob(a, m.roomId, e2ee.key));
      store.showToast(isSticker(a) ? 'Sticker saved' : 'GIF saved');
    } catch (e) {
      store.showToast(e instanceof Error ? e.message : 'Could not save that.');
    }
  }

  const mineMsg = menu?.userId === meId;
  const savable = !!menu && !menu.deletedAt && menu.attachments.some((x) => isSticker(x) || /gif/i.test(x.mime) || /\\.gif$/i.test(x.filename));"""),
    ("""              <div className="field">
                <textarea""",
     """              <div className="field">
                {!sealedBlocked ? <IconButton icon="emoji" label={panel ? 'Keyboard' : 'Emoji, GIFs and stickers'} pressed={panel} onClick={() => { if (!panel) input.current?.blur(); setPanel(!panel); if (panel) input.current?.focus(); }} /> : null}
                <textarea"""),
    ("""                  onFocus={() => { stick.current = true; window.setTimeout(() => toBottom(), 250); }}""",
     """                  onFocus={() => { stick.current = true; setPanel(false); window.setTimeout(() => toBottom(), 250); }}"""),
    ("""        <input ref={picker} type="file" """,
     """        {panel && !sealedBlocked ? (
          <MediaPanel onEmoji={insertEmoji} onSend={(file) => { setPanel(false); stick.current = true; void sendFiles(roomId, [file]); }} onClose={() => { setPanel(false); input.current?.focus(); }} />
        ) : null}
        <input ref={picker} type="file" """),
    ("""{QUICK.map((e) => <button key={e} type="button" aria-label={`React ${e}`} onClick={() => { void store.react(menu, e); setMenu(null); }}>{e}</button>)}</div>""",
     """{QUICK.map((e) => <button key={e} type="button" aria-label={`React ${e}`} onClick={() => { void store.react(menu, e); setMenu(null); }}><Emoji emoji={e} size={30} /></button>)}<button type="button" aria-label="More reactions" onClick={() => { setMoreReact(menu); setMenu(null); }}><Icon name="add" /></button></div>"""),
    ("""          {!menu.deletedAt ? <MenuItem icon="forward" label="Forward\"""",
     """          {savable ? <MenuItem icon="photo" label="Save to favourites" onClick={() => { void saveFavourite(menu); setMenu(null); }} /> : null}
          {!menu.deletedAt ? <MenuItem icon="forward" label="Forward\""""),
    ("""      {fwd ? <ForwardTo""",
     """      {moreReact ? (
        <Sheet title="React" onClose={() => setMoreReact(null)}>
          <div className="react-more"><EmojiPicker onPick={(e) => { void store.react(moreReact, e); setMoreReact(null); }} /></div>
        </Sheet>
      ) : null}
      {fwd ? <ForwardTo"""),
])

# settings
patch('src/ui/Settings.tsx', [(
    """        <Group title="Calls">""",
    """        <Group title="GIFs and stickers">
          <div className="setting"><Icon name="photo" className="ico" /><span className="main"><label htmlFor="giphy">Giphy key</label><small>Your own key from developers.giphy.com. Without one, Giphy stays off.</small><input id="giphy" className="key-input" type="text" autoComplete="off" autoCapitalize="off" spellCheck={false} value={prefs.giphyKey} onChange={(e) => set('giphyKey', e.target.value)} /></span></div>
          <div className="setting"><Icon name="photo" className="ico" /><span className="main"><label htmlFor="imgur">Imgur client ID</label><small>Your own ID from api.imgur.com. Without one, Imgur stays off.</small><input id="imgur" className="key-input" type="text" autoComplete="off" autoCapitalize="off" spellCheck={false} value={prefs.imgurId} onChange={(e) => set('imgurId', e.target.value)} /></span></div>
        </Group>

        <Group title="Calls">"""),
])
print('patched')
