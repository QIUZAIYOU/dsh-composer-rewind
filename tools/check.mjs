/**
 * Static checks for the prompt-vault client bundle.
 * Run: node tools/check.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = fs.readFileSync(path.join(root, 'client.js'), 'utf8');

const ALLOWED_TOKENS = new Set([
  '--dsw-alias-bg-base',
  '--dsw-alias-bg-layer-1',
  '--dsw-alias-bg-layer-2',
  '--dsw-alias-bg-overlay',
  '--dsw-alias-border-l1',
  '--dsw-alias-border-l2',
  '--dsw-alias-brand-primary',
  '--dsw-alias-label-primary',
  '--dsw-alias-label-secondary',
  '--dsw-alias-state-error-primary',
  '--dsw-alias-state-idle-primary',
  '--dsw-alias-state-success-primary',
  '--dsw-alias-state-warn-primary',
  '--dsw-specific-sidebar-fill',
  '--dsw-radius-md',
  '--dsw-radius-lg',
  '--dsw-elevation-prominent',
  '--dsw-alias-interactive-bg-hover',
  '--dsw-alias-label-tertiary',
]);

const failures = [];
const notes = [];

function fail(message) {
  failures.push(message);
}

function check(label, condition, detail) {
  if (condition) notes.push('ok   ' + label);
  else fail(label + (detail ? ' — ' + detail : ''));
}

/* ---------------------------------------------------------------- CSS ---- */

const cssMatch = source.match(/const CSS = `([\s\S]*?)`;\n/);
check('CSS block found', Boolean(cssMatch));
const css = cssMatch ? cssMatch[1] : '';

const tokens = [...new Set([...css.matchAll(/var\((--dsw-[a-z0-9-]+)/g)].map((m) => m[1]))];
const unknown = tokens.filter((token) => !ALLOWED_TOKENS.has(token));
check('all theme tokens are published by the Theme provider', unknown.length === 0, unknown.join(', '));

const hardcoded = [...css.matchAll(/#(?:[0-9a-f]{3,8})\b/gi)].map((m) => m[0]);
check('no hard-coded hex colors in CSS', hardcoded.length === 0, hardcoded.join(', '));

const openBraces = (css.match(/\{/g) || []).length;
const closeBraces = (css.match(/\}/g) || []).length;
check('CSS braces balanced', openBraces === closeBraces, openBraces + ' / ' + closeBraces);

check('trigger resets host button styles', /\.pv-trigger\{all:unset!important/.test(css));
check('panel follows theme via data-scheme', /\.pv-backdrop\[data-scheme="dark"\]/.test(css) && /\.pv-backdrop\[data-scheme="light"\]/.test(css));
check('toast follows theme via data-scheme', /\.pv-toast\[data-scheme="dark"\]/.test(css) && /\.pv-toast\[data-scheme="light"\]/.test(css));

/* --------------------------------------------------------------- icon ---- */

const iconPaths = source.match(/ACTION_PATHS = \{([\s\S]*?)\};/);
check('icon paths declared', Boolean(iconPaths));
check('icon svg is stroked, never filled', /stroke: 'none'/.test(source) && /stroke: 'currentColor'/.test(source));
check('icon inherits the theme text color', /stroke: 'currentColor'/.test(source));
check('trigger icon is drawn on a 20px grid', /viewBox: '0 0 20 20'/.test(source));

/* ----------------------------------------------------------- behaviour ---- */

check(
  'hotkey matcher handles ctrl+alt+z',
  /function matchesHotkey/.test(source) && /event\.ctrlKey/.test(source) && /event\.altKey/.test(source) && /key === 'z'/.test(source),
);
check('hotkey listener registered in capture phase', /addEventListener\('keydown', onKeyDown, true\)/.test(source));
check('recall walks the history backwards', /function recallPrevious/.test(source));
check('history entries retire instead of stream', /function retire\(/.test(source) && /COALESCE_WINDOW_MS/.test(source));
check('live draft is stored separately from history', /LIVE_KEY/.test(source) && /function setLive/.test(source));
check('junk filter present', /function isJunk/.test(source) && /CJK\.test/.test(source));
check('legacy v1 entries migrate once', /LEGACY_KEY/.test(source));
check('composer inserts through inputActions.setDraft', /setDraft\(text\)/.test(source));
check('structured draft snapshots are supported', /function buildSnapshotFrom/.test(source) && /function referencesOf/.test(source));
check('attachments are persisted in IndexedDB', /function idb\(/.test(source) && /BLOB_DB/.test(source) && /indexedDB\.open/.test(source));
check('attachments restore through the conversation service', /createDrafts\(/.test(source) && /addAttachments\(/.test(source));
check('settings restores model, permission and agent preset', /selectModel/.test(source) && /\/permission /.test(source) && /agentPresets/.test(source));
check('hover card shows the full record', /className: 'pv-hover'/.test(source) && /pv-hover-text/.test(source));
check('popup shell reuses the Harness MenuSurface', /dsh-client-ui-primitives/.test(source) && /MenuSurface/.test(source));

/* -------------------------------------------------------------- files ---- */

for (const file of ['index.js', 'cordis.patch.yml', 'locale/en.json', 'locale/zh.json', 'icon.svg', 'README.md']) {
  check('file present: ' + file, fs.existsSync(path.join(root, file)));
}

let manifest = null;
try {
  manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
} catch {
  fail('package.json readable');
}
if (manifest) {
  check('package exports ./client', manifest.exports && manifest.exports['./client'] === './client.js');
  check('package exports ./icon', manifest.exports && manifest.exports['./icon'] === './icon.svg');
  check('package exports locale files', manifest.exports && manifest.exports['./locale/*.json'] === './locale/*.json');
  check('bundle patch declared', Boolean(manifest.dsh && manifest.dsh.bundle && manifest.dsh.bundle.patch));
  check('client platform is web', Boolean(manifest.dsh && manifest.dsh.client && manifest.dsh.client.platform === 'web'));
  const external = (manifest.dsh && manifest.dsh.client && manifest.dsh.client.external) || [];
  check('client declares primitives as external', external.includes('@deepseek-ai/dsh-client-ui-primitives'));
  const listed = new Set(manifest.files || []);
  for (const required of ['index.js', 'client.js', 'cordis.patch.yml', 'locale/*.json', 'icon.svg']) {
    check('files[] lists ' + required, listed.has(required));
  }
}

/* ------------------------------------------------------------- report ---- */

for (const line of notes) console.log(line);
if (failures.length > 0) {
  console.error('\nFAILED (' + failures.length + '):');
  for (const message of failures) console.error(' - ' + message);
  process.exit(1);
}
console.log('\nall static checks passed');
