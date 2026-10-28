/**
 * Behaviour tests for the Composer Rewind store, run against the real client.js
 * inside a vm sandbox (no browser needed).
 *
 * Run: node tools/logic-test.mjs
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const source = fs.readFileSync(path.join(root, 'client.js'), 'utf8');

function makeStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    dump: () => Object.fromEntries(map),
  };
}

function load(seed) {
  const storage = makeStorage(seed);
  const timers = [];
  const sandbox = {
    console,
    JSON,
    Math,
    Date,
    String,
    Number,
    Object,
    Array,
    Set,
    Map,
    Error,
    parseFloat,
    setTimeout: (fn, ms) => {
      timers.push(fn);
      return timers.length;
    },
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
  };
  const window = {
    innerWidth: 1280,
    innerHeight: 720,
    localStorage: storage,
    setTimeout: sandbox.setTimeout,
    clearTimeout: sandbox.clearTimeout,
    setInterval: sandbox.setInterval,
    clearInterval: sandbox.clearInterval,
    matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
    __PV_TEST__: {},
  };
  sandbox.window = window;
  sandbox.globalThis = sandbox;
  sandbox.document = {
    head: { appendChild() {} },
    body: null,
    documentElement: { nodeName: 'HTML' },
    getElementById: () => null,
    createElement: () => ({ style: {}, set textContent(value) {}, id: '' }),
    addEventListener() {},
    removeEventListener() {},
  };
  sandbox.navigator = { language: 'zh-CN' };
  sandbox.crypto = { randomUUID: (() => {
    let counter = 0;
    return () => 'id-' + ++counter;
  })() };
  sandbox.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  sandbox.matchMedia = window.matchMedia;

  const react = {
    createElement: () => null,
    Fragment: 'fragment',
    useCallback: (fn) => fn,
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useRef: (value) => ({ current: value }),
    useState: (value) => [value, () => {}],
    useSyncExternalStore: (subscribe, snapshot) => snapshot(),
  };

  vm.createContext(sandbox);
  sandbox.window.__ModuleLoader__ = {
    load({ factory }) {
      factory((id) => {
        if (id === 'react') return react;
        throw new Error('unexpected require: ' + id);
      });
    },
  };
  vm.runInContext(source, sandbox, { filename: 'client.js' });
  return { api: window.__PV_TEST__.api, storage };
}

/** Strip the vm realm from a value so assert.deepEqual can compare it. */
const plain = (value) => JSON.parse(JSON.stringify(value));

const results = [];
const pending = [];
function test(name, fn) {
  pending.push(
    (async () => {
      try {
        await fn();
        results.push(['ok  ', name]);
      } catch (error) {
        results.push(['FAIL', name + ' — ' + error.message]);
      }
    })(),
  );
}

/* ---------------------------------------------------------------- junk ---- */

test('drops single characters and bare IME debris', () => {
  const { api } = load();
  assert.equal(api.isJunk('l'), true);
  assert.equal(api.isJunk('liuujt'), true);
  assert.equal(api.isJunk('继续'), true, '两个汉字太短');
  assert.equal(api.isJunk('继续优化一下'), false);
  assert.equal(api.isJunk('hello world'), false);
  assert.equal(api.isJunk('fix the bug.'), false);
});

test('backspacing the IME debris leaves no history entries', () => {
  const { api } = load();
  for (const text of ['l', 'li', 'liu', 'liuj', 'liuujt', '']) api.retire(text, 's1');
  assert.equal(api.entries().length, 0);
});

/* ------------------------------------------------------------ coalescing ---- */

test('prefix revisions collapse into one entry', () => {
  const { api } = load();
  api.retire('帮我把这段代码重写一下', 's1');
  api.retire('帮我把这段代码重写一下，顺便加注释', 's1');
  assert.equal(api.entries().length, 1);
  assert.match(api.entries()[0].text, /顺便加注释$/);
});

test('a genuinely different draft is a second entry', () => {
  const { api } = load();
  api.retire('帮我写一个周报', 's1');
  api.retire('分析这段 SQL 为什么慢', 's1');
  assert.equal(api.entries().length, 2);
  assert.equal(api.entries()[0].text, '分析这段 SQL 为什么慢');
});

test('the same text twice does not duplicate', () => {
  const { api } = load();
  api.retire('分析这段 SQL 为什么慢', 's1');
  api.retire('分析这段 SQL 为什么慢', 's2');
  assert.equal(api.entries().length, 1);
});

/* ------------------------------------------------------------ live draft ---- */

test('live draft replaces itself instead of appending', () => {
  const { api } = load();
  api.setLive('第一版草稿', 's1');
  api.setLive('第一版草稿，加一点', 's1');
  assert.equal(api.live().text, '第一版草稿，加一点');
  assert.equal(api.entries().length, 0, '写草稿不应产生历史条目');
});

test('clearing the composer drops the live draft but keeps history', () => {
  const { api } = load();
  api.retire('分析这段 SQL 为什么慢', 's1');
  api.setLive('还没写完的半句', 's1');
  api.setLive('', 's1');
  assert.equal(api.live(), null);
  assert.equal(api.entries().length, 1);
});

/* ------------------------------------------------------------ migration ---- */

test('legacy v1 entries are cleaned once and written to the v3 store', () => {
  const legacy = JSON.stringify([
    { id: 'a', text: 'l', at: 1 },
    { id: 'b', text: 'li', at: 2 },
    { id: 'c', text: '帮我把这段代码重写一下', at: 3 },
  ]);
  const { api, storage } = load({ 'dsh-prompt-vault:v1': legacy });
  assert.equal(api.entries().length, 1);
  assert.equal(api.entries()[0].text, '帮我把这段代码重写一下');
  assert.ok(storage.getItem('dsh-composer-rewind:v3'));
});

test('legacy v2 entries migrate into the v3 store', () => {
  const legacy = JSON.stringify([{ id: 'a', text: '旧版记录也要保留', at: 1 }]);
  const { api, storage } = load({ 'dsh-prompt-vault:v2': legacy });
  assert.equal(api.entries().length, 1);
  assert.ok(storage.getItem('dsh-composer-rewind:v3'));
});

test('previous package name v3 entries migrate to the new key', () => {
  const legacy = JSON.stringify([{ id: 'a', text: '改名之前的记录也不能丢', at: 2 }]);
  const { api, storage } = load({ 'dsh-prompt-vault:v3': legacy });
  assert.equal(api.entries().length, 1);
  assert.ok(storage.getItem('dsh-composer-rewind:v3'));
});

test('same text and same file merge even when upload ids differ', () => {
  const { api } = load();
  api.reset();
  const base = { text: '继续优化：同一段内容', sessionId: 's1' };
  api.retireSnapshot({ ...base, attachments: [
    { key: 'upload-a', name: 'Creature #2.gif', mime: 'image/gif', size: 255192, kind: 'image' },
  ] });
  api.retireSnapshot({ ...base, attachments: [
    { key: 'upload-b', name: 'Creature #2.gif', mime: 'image/gif', size: 255192, kind: 'image' },
  ] });
  assert.equal(api.entries().length, 1);
  assert.equal(api.entries()[0].attachments[0].key, 'upload-b');
});

test('text-only and text-with-file stay separate', () => {
  const { api } = load();
  api.reset();
  api.retireSnapshot({ text: '同一段内容', sessionId: 's1' });
  api.retireSnapshot({ text: '同一段内容', sessionId: 's1', attachments: [
    { key: 'upload-a', name: 'note.txt', mime: 'text/plain', size: 12, kind: 'file' },
  ] });
  assert.equal(api.entries().length, 2);
});

test('hover card is clamped inside the viewport', () => {
  const { api } = load();
  const right = api.placeHoverCard({ left: 1200, right: 1260, top: 100, bottom: 130 }, 430, 300);
  assert.ok(right.left >= 10, 'left margin');
  assert.ok(right.left + 430 <= 1270, 'right edge stays inside');
  const bottom = api.placeHoverCard({ left: 100, right: 400, top: 650, bottom: 680 }, 430, 300);
  assert.ok(bottom.top >= 10, 'top margin');
  assert.ok(bottom.top + 300 <= 710, 'bottom edge stays inside');
});

/* -------------------------------------------------------------- settings ---- */

test('settings survive retirement and junk filtering keeps attachments', () => {
  const { api } = load();
  api.retireSnapshot({
    text: '帮我分析这个表格',
    sessionId: 's1',
    at: Date.now(),
    references: [],
    command: null,
    attachments: [{ key: 'blob-1', name: 'data.csv', mime: 'text/csv', size: 12, kind: 'file' }],
    settings: {
      model: { provider: 'deepseek', model: 'deepseek-chat', reasoningEffort: 'high' },
      permission: 'read-only',
      agentPreset: 'standard',
    },
  });
  const entry = api.entries()[0];
  assert.equal(entry.attachments.length, 1);
  assert.equal(entry.attachments[0].name, 'data.csv');
  assert.equal(entry.settings.model.reasoningEffort, 'high');
  assert.equal(entry.settings.permission, 'read-only');
  assert.equal(entry.settings.agentPreset, 'standard');
});

test('attachment-only drafts are recorded even with no text', () => {
  const { api } = load();
  api.retireSnapshot({
    text: '',
    sessionId: 's1',
    at: Date.now(),
    references: [],
    command: null,
    attachments: [{ key: 'blob-2', name: 'chart.png', mime: 'image/png', size: 34, kind: 'image' }],
    settings: null,
  });
  assert.equal(api.entries().length, 1);
  assert.equal(api.entries()[0].text, '');
  assert.equal(api.entries()[0].attachments[0].kind, 'image');
});

test('structured drafts rebuild references for setDraft', () => {
  const { api } = load();
  const entry = {
    text: '看看 @src/app.ts 的写法',
    references: [
      {
        source: 'file',
        ref: { path: 'src/app.ts' },
        offset: 3,
        length: 11,
        label: 'app.ts',
        clipboardText: '@src/app.ts',
      },
    ],
    command: null,
  };
  const draft = api.draftOf(entry);
  assert.equal(typeof draft, 'object');
  assert.equal(draft.text, entry.text);
  assert.equal(draft.references.length, 1);
  assert.equal(draft.references[0].ref.path, 'src/app.ts');
});

/* --------------------------------------------------------------- recall ---- */

test('ctrl+alt+z setDraft walks backwards through history', () => {
  const { api } = load();
  const applied = [];
  api.publishComposer('s1', { setDraft: (text) => applied.push(text) });
  api.retire('第一条提示词内容', 's1');
  api.retire('第二条提示词内容', 's1');
  api.retire('第三条提示词内容', 's1');

  api.recallPrevious();
  api.currentDraft(); // composer echoes the inserted text through the tracker
  assert.equal(applied[0], '第三条提示词内容');

  // simulate the composer reflecting the inserted text
  api.publishComposer('s1', { setDraft: (text) => applied.push(text) });
  api.recallPrevious();
  assert.equal(applied[1], '第二条提示词内容');
});

test('recall without a composer reports instead of throwing', () => {
  const { api } = load();
  api.retire('一条已经存在的提示词', 's1');
  assert.doesNotThrow(() => api.recallPrevious());
});

/* -------------------------------------------------------------- sessions ---- */

test('history entries stay scoped to the session they belong to', () => {
  const { api } = load();
  api.publishComposer('s1', { setDraft() {} });
  api.retire('session one draft', 's1');
  api.retire('session two draft', 's2');
  api.retire('another session one draft', 's1');

  assert.equal(api.activeSession(), 's1');
  assert.equal(
    api.entriesForSession('s1').map((entry) => entry.text).join('|'),
    'another session one draft|session one draft',
  );
  assert.equal(
    api.entriesForSession('s2').map((entry) => entry.text).join('|'),
    'session two draft',
  );

  api.clearSession('s1');
  assert.equal(api.entriesForSession('s1').length, 0);
  assert.equal(api.entriesForSession('s2').length, 1);
});

test('publishing another composer switches the active session', () => {
  const { api } = load();
  api.retire('first session content', 's1');
  api.retire('second session content', 's2');
  api.publishComposer('s2', { setDraft() {} });
  assert.equal(api.activeSession(), 's2');
  assert.equal(api.entries().length, 2);
  assert.equal(api.entriesForSession('s2')[0].text, 'second session content');
});

test('ctrl+alt+z skips entries from other sessions', () => {
  const { api } = load();
  const applied = [];
  api.publishComposer('s1', { setDraft: (text) => applied.push(text) });
  api.retire('session one only', 's1');
  api.retire('session two only', 's2');
  api.recallPrevious();
  assert.equal(applied[0], 'session one only');
});

test('legacy entries without a session are adopted by the first session', () => {
  const { api } = load();
  api.retire('written before session scoping');
  assert.equal(api.entriesForSession('s1').length, 0);
  api.publishComposer('s1', { setDraft() {} });
  assert.equal(api.entriesForSession('s1').length, 1);
});

/* ------------------------------------------------------------- settings ---- */

/**
 * Fake DSH 0.2.x host: the sessions service only offers `binding`, the live
 * session exposes `getSnapshot()`/`projections`, and model writes go through
 * `remote.session.selectModel`.
 */
function fakeHost(options = {}) {
  const { blank = true, preset = null, model = null, permission = null, rejectModel = false, binding = true } = options;
  const calls = [];
  const values = {
    modelSelection: model ? { lastUsed: model } : undefined,
    permissions: permission ? { currentValue: permission } : undefined,
    agentPreset: preset === null ? undefined : preset,
  };
  const session = {
    getSnapshot: () => ({ blank }),
    projections: {
      faceOf: (name) => ({ getSnapshot: () => values[name] }),
      get: (name) => values[name],
    },
    command: async (line) => {
      calls.push(['command', line]);
      return { ok: true, value: { matched: true } };
    },
  };
  const sessions = {
    binding: (id) => (binding ? { sessionId: id, session } : undefined),
    scope: () => (binding ? null : { scoped: true }),
    sessionOf: () => session,
  };
  const runtime = {
    get: (name) => (name === 'sessions' ? sessions : null),
    remote: {
      agentPresets: {
        select: async (id, next) => {
          calls.push(['preset', id, next]);
          return { ok: true };
        },
      },
      session: {
        selectModel: async (selection) => {
          calls.push(['model', selection]);
          return rejectModel ? { ok: false, error: { code: 'model/unknown', message: 'nope' } } : { ok: true };
        },
      },
    },
  };
  return { runtime, calls, session };
}

test('reads model, permission and preset from the session projections', () => {
  const { api } = load();
  const { runtime } = fakeHost({
    preset: 'craft',
    permission: 'acceptEdits',
    model: { provider: 'deepseek', model: 'deepseek-v4', reasoningEffort: 'high' },
  });
  api.setRuntime(runtime);
  assert.deepEqual(plain(api.readSettings('s1')), {
    model: { provider: 'deepseek', model: 'deepseek-v4', reasoningEffort: 'high' },
    permission: 'acceptEdits',
    agentPreset: 'craft',
  });
});

test('liveSessionOf falls back to the session scope when nothing is bound', () => {
  const { api } = load();
  const { runtime, session } = fakeHost({ binding: false });
  api.setRuntime(runtime);
  assert.equal(api.liveSessionOf('s1'), session);
});

test('blank detection reads the session snapshot, not the legacy flag', () => {
  const { api } = load();
  assert.equal(api.sessionIsBlank({ getSnapshot: () => ({ blank: true }), blank: false }), true);
  assert.equal(api.sessionIsBlank({ getSnapshot: () => ({ blank: false }) }), false);
  assert.equal(api.sessionIsBlank({ blank: true }), true, 'legacy builds still work');
  assert.equal(api.sessionIsBlank(null), false);
});

test('model and permission restore through the 0.2.x write paths', async () => {
  const { api } = load();
  const { runtime, calls } = fakeHost({ blank: true, permission: 'ask' });
  api.setRuntime(runtime);
  const failures = await api.applySettings(
    { model: { provider: 'deepseek', model: 'deepseek-v4', reasoningEffort: 'high' }, permission: 'acceptEdits' },
    's1',
  );
  assert.deepEqual(plain(failures), []);
  assert.deepEqual(plain(calls[0]), [
    'model',
    { sessionId: 's1', provider: 'deepseek', model: 'deepseek-v4', reasoningEffort: 'high' },
  ]);
  assert.deepEqual(plain(calls[1]), ['command', '/permission acceptEdits']);
});

test('the agent preset only switches on a blank session', async () => {
  const { api } = load();
  const started = fakeHost({ blank: false });
  api.setRuntime(started.runtime);
  assert.deepEqual(plain(await api.applySettings({ agentPreset: 'craft' }, 's1')), ['preset']);
  assert.equal(
    started.calls.some(([kind]) => kind === 'preset'),
    false,
    'a started session must not be switched',
  );

  const blank = fakeHost({ blank: true, preset: 'default' });
  api.setRuntime(blank.runtime);
  assert.deepEqual(plain(await api.applySettings({ agentPreset: 'craft' }, 's1')), []);
  assert.deepEqual(plain(blank.calls[0]), ['preset', 's1', 'craft']);
});

test('a rejected model write is reported, not swallowed', async () => {
  const { api } = load();
  const { runtime } = fakeHost({ rejectModel: true });
  api.setRuntime(runtime);
  assert.deepEqual(plain(await api.applySettings({ model: { provider: 'p', model: 'm' } }, 's1')), ['model']);
});

test('settings restore degrades gracefully without a host runtime', async () => {
  const { api } = load();
  api.setRuntime(null);
  assert.deepEqual(plain(await api.applySettings({ model: { provider: 'p', model: 'm' } }, 's1')), ['model']);
  assert.equal(api.readSettings('s1'), null);
});

/* --------------------------------------------------------------- report ---- */

await Promise.all(pending);

let failed = 0;
for (const [status, name] of results) {
  if (status === 'FAIL') failed += 1;
  console.log(status + ' ' + name);
}
console.log('\n' + (results.length - failed) + '/' + results.length + ' passed');
if (failed > 0) process.exit(1);
