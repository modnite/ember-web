// Copies the Apple emoji pictures (the same set Hearth uses) from the emoji-datasource-apple package into public/emoji/apple/64.
// Runs before dev and build, so the pictures never sit in the repository.
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const from = join(root, 'node_modules', 'emoji-datasource-apple', 'img', 'apple', '64');
const to = join(root, 'public', 'emoji', 'apple', '64');
if (!existsSync(from)) throw new Error('emoji-datasource-apple is not installed: run npm install');
mkdirSync(to, { recursive: true });
if (readdirSync(to).length < readdirSync(from).length) cpSync(from, to, { recursive: true });
console.log(`emoji: ${readdirSync(to).length} pictures in public/emoji/apple/64`);
