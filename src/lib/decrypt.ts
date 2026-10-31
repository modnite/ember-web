import {
  decryptText,
  decryptWithRoomKey,
  isEncrypted,
  isEncryptedV2,
  roomKeyFromGroup,
  type GroupKeys,
} from './crypto';

export interface DecryptResult {
  text: string;
  locked: boolean;
  failed: boolean;
}

/**
 * Decrypt a chat body, whichever scheme it used. v2 (group key) is preferred;
 * v1 (passphrase) still decrypts older history. `locked` means "we don't have
 * the key yet", which is different from `failed` (we do, but it didn't open).
 */
export function decryptBody(
  roomId: string,
  body: string,
  groupKey: Uint8Array | null,
  keys: GroupKeys | null,
): DecryptResult {
  if (!body) return { text: '', locked: false, failed: false };

  if (isEncryptedV2(body)) {
    if (!groupKey) return { text: '', locked: true, failed: false };
    try {
      return {
        text: decryptWithRoomKey(roomKeyFromGroup(groupKey, roomId, 'chat'), body),
        locked: false,
        failed: false,
      };
    } catch {
      return { text: '', locked: false, failed: true };
    }
  }

  if (isEncrypted(body)) {
    if (!keys) return { text: '', locked: true, failed: false };
    try {
      return { text: decryptText(keys, roomId, body), locked: false, failed: false };
    } catch {
      return { text: '', locked: false, failed: true };
    }
  }

  return { text: body, locked: false, failed: false };
}
