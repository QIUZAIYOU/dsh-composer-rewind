window.__ModuleLoader__.load({
  id: '@local/dsh-prompt-vault',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React;

    /* ------------------------------------------------------------------ *
     * Text
     * ------------------------------------------------------------------ */

    const DICT = {
      zh: {
        trigger: '提示词历史',
        triggerHint: '提示词历史 · Ctrl+Alt+Z 取上一条',
        title: '提示词历史',
        subtitle: '只保存在这台机器上',
        search: '搜索历史',
        empty: '还没有记录。写完整的一条提示词、发出去或清空输入框，就会存进来。',
        emptySearch: '没有匹配的记录。',
        current: '当前草稿',
        insert: '插入',
        copy: '复制',
        remove: '删除',
        copied: '已复制',
        clear: '清空',
        clearConfirm: '清空全部历史？此操作不可撤销。',
        chars: '字',
        footer: '插入会把内容写回输入框，不会自动发送',
        hint: 'Ctrl+Alt+Z 取上一条',
        noHistory: '还没有历史记录',
        inserted: '已插入',
        noComposer: '输入框还没准备好，稍后再试',
      },
      en: {
        trigger: 'Prompt history',
        triggerHint: 'Prompt history · Ctrl+Alt+Z for the previous one',
        title: 'Prompt history',
        subtitle: 'Stored on this machine only',
        search: 'Search history',
        empty: 'Nothing saved yet. Finish a prompt, send it, or clear the composer — it lands here.',
        emptySearch: 'No matching entries.',
        current: 'Current draft',
        insert: 'Insert',
        copy: 'Copy',
        remove: 'Delete',
        copied: 'Copied',
        clear: 'Clear',
        clearConfirm: 'Clear the whole history? This cannot be undone.',
        chars: 'chars',
        footer: 'Insert writes the text back into the composer; it never sends',
        hint: 'Ctrl+Alt+Z recalls the previous one',
        noHistory: 'No history yet',
        inserted: 'Inserted',
        noComposer: 'The composer is not ready yet',
      },
    };

    function localeId() {
      const lang = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en';
      return /^zh/i.test(lang) ? 'zh' : 'en';
    }

    const LANG = localeId();
    function t(key) {
      return (DICT[LANG] && DICT[LANG][key]) || DICT.en[key] || key;
    }

    /* ------------------------------------------------------------------ *
     * Store
     *
     * Two different things are persisted:
     *  - the live draft: one record, replaced in place, exists so a crash or a
     *    reload never loses what is currently half-typed;
     *  - history entries: only whole drafts that were retired (sent, cleared,
     *    session switched, page closed). Every keystroke is NOT an entry —
     *    otherwise backspacing one word would leave a trail of prefixes.
     * ------------------------------------------------------------------ */

    const STORAGE_KEY = 'dsh-prompt-vault:v2';
    const LEGACY_KEY = 'dsh-prompt-vault:v1';
    const LIVE_KEY = 'dsh-prompt-vault:live';
    const MAX_ENTRIES = 300;
    const MIN_CHARS = 3;
    const COALESCE_WINDOW_MS = 10 * 60 * 1000;
    const HOLD_MS = 620;
    const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;

    function uid() {
      if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
      return String(Date.now()) + Math.random().toString(16).slice(2);
    }

    function normalize(text) {
      return String(text == null ? '' : text).replace(/\s+$/, '');
    }

    /**
     * Drop debris: single characters, and short bare latin strings with no
     * spaces or punctuation — that is what an IME misfire plus backspacing
     * looks like. Sentences (CJK, spaces, punctuation) always pass.
     */
    function isJunk(text) {
      const value = text.trim();
      if (value.length < MIN_CHARS) return true;
      if (CJK.test(value)) return false;
      if (/\s/.test(value)) return false;
      if (/[.!?,;:'"、，。！？；：]/.test(value)) return false;
      return value.length < 8 && /^[a-z0-9]+$/i.test(value);
    }

    function readRaw(key) {
      try {
        const raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    }

    function writeRaw(key, value) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* quota / private mode: the in-memory copy keeps the panel usable */
      }
    }

    function sanitize(list) {
      if (!Array.isArray(list)) return [];
      const seen = new Set();
      const out = [];
      for (const item of list) {
        if (!item || typeof item.text !== 'string') continue;
        const text = normalize(item.text);
        if (text === '' || isJunk(text) || seen.has(text)) continue;
        seen.add(text);
        out.push({
          id: typeof item.id === 'string' ? item.id : uid(),
          text,
          at: typeof item.at === 'number' ? item.at : Date.now(),
          sessionId: typeof item.sessionId === 'string' ? item.sessionId : null,
        });
        if (out.length >= MAX_ENTRIES) break;
      }
      return out;
    }

    function loadEntries() {
      const v2 = readRaw(STORAGE_KEY);
      if (Array.isArray(v2)) return sanitize(v2);
      const legacy = sanitize(readRaw(LEGACY_KEY));
      if (legacy.length > 0) writeRaw(STORAGE_KEY, legacy);
      return legacy;
    }

    function loadLive() {
      const raw = readRaw(LIVE_KEY);
      if (!raw || typeof raw.text !== 'string') return null;
      const text = normalize(raw.text);
      if (text === '') return null;
      return { text, at: typeof raw.at === 'number' ? raw.at : Date.now(), sessionId: raw.sessionId || null };
    }

    let entries = loadEntries();
    let live = loadLive();
    const listeners = new Set();

    function emit() {
      for (const listener of listeners) {
        try {
          listener();
        } catch {
          /* one broken subscriber must not break the rest */
        }
      }
    }

    function subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }

    function snapshotEntries() {
      return entries;
    }

    function snapshotLive() {
      return live;
    }

    function commitEntries(next) {
      entries = next.slice(0, MAX_ENTRIES);
      writeRaw(STORAGE_KEY, entries);
      emit();
    }

    function setLive(text, sessionId) {
      const clean = normalize(text);
      if (clean === '') {
        if (live) {
          live = null;
          try {
            window.localStorage.removeItem(LIVE_KEY);
          } catch {
            /* ignore */
          }
          emit();
        }
        return;
      }
      if (live && live.text === clean) {
        if (live.sessionId !== sessionId) {
          live = { ...live, sessionId, at: Date.now() };
          writeRaw(LIVE_KEY, live);
          emit();
        }
        return;
      }
      live = { text: clean, at: Date.now(), sessionId: sessionId || null };
      writeRaw(LIVE_KEY, live);
      emit();
    }

    /**
     * Retire a draft into history. Prefix revisions of the same draft collapse
     * into the entry they extend instead of piling up.
     */
    function retire(text, sessionId) {
      const clean = normalize(text);
      if (clean === '' || isJunk(clean)) return false;
      const head = entries[0];
      if (head && head.text === clean) return false;
      const now = Date.now();
      if (head && now - head.at < COALESCE_WINDOW_MS && (clean.startsWith(head.text) || head.text.startsWith(clean))) {
        const merged = clean.length >= head.text.length
          ? { ...head, text: clean, at: now, sessionId: sessionId || head.sessionId }
          : { ...head, at: head.at, sessionId: sessionId || head.sessionId };
        commitEntries([merged, ...entries.slice(1)]);
        return true;
      }
      commitEntries([{ id: uid(), text: clean, at: now, sessionId: sessionId || null }, ...entries.filter((item) => item.text !== clean)]);
      return true;
    }

    function removeEntry(id) {
      commitEntries(entries.filter((item) => item.id !== id));
    }

    function clearAll() {
      commitEntries([]);
    }

    /* ------------------------------------------------------------------ *
     * UI state shared between the two slots
     * ------------------------------------------------------------------ */

    const uiListeners = new Set();
    let uiOpen = false;

    function setOpen(value) {
      if (uiOpen === value) return;
      uiOpen = value;
      for (const listener of uiListeners) listener();
    }

    function subscribeUi(listener) {
      uiListeners.add(listener);
      return () => uiListeners.delete(listener);
    }

    let toastText = null;
    let toastTimer = null;
    const toastListeners = new Set();

    function toast(message) {
      toastText = message;
      for (const listener of toastListeners) listener();
      if (toastTimer) window.clearTimeout(toastTimer);
      toastTimer = window.setTimeout(() => {
        toastText = null;
        for (const listener of toastListeners) listener();
      }, 1800);
    }

    function subscribeToast(listener) {
      toastListeners.add(listener);
      return () => toastListeners.delete(listener);
    }

    /**
     * Composer actions per session. The overlay panel lives in the root scope
     * and cannot receive session `inputActions` through props, so the composer
     * component publishes them here; the panel writes to the most recent one.
     */
    const composerBySession = new Map();
    let activeSessionId = null;
    let lastDraft = '';

    function publishComposer(sessionId, inputActions) {
      if (!sessionId || !inputActions) return;
      composerBySession.set(sessionId, inputActions);
      activeSessionId = sessionId;
    }

    function composerActions() {
      if (activeSessionId && composerBySession.has(activeSessionId)) return composerBySession.get(activeSessionId);
      for (const actions of composerBySession.values()) return actions;
      return null;
    }

    function currentDraft() {
      return lastDraft;
    }

    function insertText(text) {
      const actions = composerActions();
      if (!actions || typeof actions.setDraft !== 'function') return false;
      const before = normalize(lastDraft);
      if (before !== '' && before !== normalize(text)) retire(before, activeSessionId);
      actions.setDraft(text);
      lastDraft = text;
      setLive(text, activeSessionId);
      setOpen(false);
      return true;
    }

    /* ------------------------------------------------------------------ *
     * Hooks
     * ------------------------------------------------------------------ */

    function useEntries() {
      return useSyncExternalStore(subscribe, snapshotEntries, snapshotEntries);
    }

    function useLive() {
      return useSyncExternalStore(subscribe, snapshotLive, snapshotLive);
    }

    function useUiOpen() {
      return useSyncExternalStore(subscribeUi, () => uiOpen, () => uiOpen);
    }

    function useToast() {
      return useSyncExternalStore(subscribeToast, () => toastText, () => toastText);
    }

    /**
     * The theme is a runtime choice, not a media query, so read the actual
     * canvas color and re-read it whenever the document churns or the OS
     * preference flips.
     */
    function parseColor(raw) {
      const match = raw && raw.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const parts = match[1].split(',').map((value) => parseFloat(value));
      if (parts.length < 3) return null;
      const alpha = parts.length > 3 ? parts[3] : 1;
      const luminance = (0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2]) / 255;
      return { alpha, luminance };
    }

    function detectScheme() {
      // 1. an explicit `color-scheme` on the root is the most direct signal
      try {
        const declared = (window.getComputedStyle(document.documentElement).colorScheme || '').toLowerCase();
        if (declared.indexOf('dark') >= 0 && declared.indexOf('light') < 0) return 'dark';
        if (declared.indexOf('light') >= 0 && declared.indexOf('dark') < 0) return 'light';
      } catch {
        /* fall through */
      }
      // 2. otherwise look at the first painted surface going up from body
      try {
        let node = document.body;
        let depth = 0;
        while (node && depth < 6) {
          const parsed = parseColor(window.getComputedStyle(node).backgroundColor);
          if (parsed && parsed.alpha > 0.1) return parsed.luminance < 0.5 ? 'dark' : 'light';
          node = node.parentElement;
          depth += 1;
        }
      } catch {
        /* fall through */
      }
      // 3. last resort: the OS preference
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function useScheme() {
      const [scheme, setScheme] = useState(detectScheme);
      useEffect(() => {
        const update = () => setScheme(detectScheme());
        update();
        const observer = new MutationObserver(update);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme', 'data-mode'] });
        if (document.body) observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
        const query = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
        if (query && query.addEventListener) query.addEventListener('change', update);
        const timer = window.setInterval(update, 2000);
        return () => {
          observer.disconnect();
          if (query && query.removeEventListener) query.removeEventListener('change', update);
          window.clearInterval(timer);
        };
      }, []);
      return scheme;
    }

    /* ------------------------------------------------------------------ *
     * Styles — only the tokens the Theme provider publishes, plus
     * label-primary mixes for tints so both themes get the right alpha.
     * ------------------------------------------------------------------ */

    const STYLE_ID = 'pv-styles';

    const CSS = `
      .pv-trigger{all:unset!important;box-sizing:border-box!important;position:relative!important;display:inline-flex!important;
        align-items:center!important;justify-content:center!important;width:28px!important;height:28px!important;min-width:28px!important;
        padding:0!important;margin:0!important;border:0!important;border-radius:8px!important;background:transparent!important;
        color:var(--dsw-alias-label-secondary)!important;cursor:pointer!important;font:inherit!important;line-height:1!important;
        -webkit-appearance:none!important;appearance:none!important;transition:background-color .12s ease,color .12s ease}
      .pv-trigger:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent)!important;
        color:var(--dsw-alias-label-primary)!important}
      .pv-trigger:active{background:color-mix(in srgb, var(--dsw-alias-label-primary) 16%, transparent)!important}
      .pv-trigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary)!important;outline-offset:2px}
      .pv-trigger[data-open="1"]{background:color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent)!important;
        color:var(--dsw-alias-label-primary)!important}
      .pv-trigger svg{display:block!important;width:16px!important;height:16px!important;pointer-events:none}
      .pv-badge{position:absolute;top:2px;right:2px;min-width:13px;height:13px;padding:0 3px;border-radius:7px;
        background:var(--dsw-alias-brand-primary);color:var(--dsw-alias-bg-base);font-size:9px;font-weight:600;
        line-height:13px;text-align:center;font-variant-numeric:tabular-nums;pointer-events:none}

      .pv-backdrop{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-start;justify-content:center;
        padding:10vh 16px 16px}
      .pv-backdrop[data-scheme="dark"]{background:rgba(0,0,0,.52)}
      .pv-backdrop[data-scheme="light"]{background:rgba(15,23,42,.2)}
      .pv-panel{width:min(660px,100%);max-height:min(72vh,620px);display:flex;flex-direction:column;
        background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);
        border:1px solid var(--dsw-alias-border-l2);border-radius:16px;overflow:hidden;
        font-size:13px;line-height:1.5}
      .pv-backdrop[data-scheme="dark"] .pv-panel{box-shadow:0 24px 60px rgba(0,0,0,.55),0 2px 8px rgba(0,0,0,.35)}
      .pv-backdrop[data-scheme="light"] .pv-panel{box-shadow:0 24px 56px rgba(15,23,42,.16),0 2px 8px rgba(15,23,42,.08)}
      .pv-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}
      .pv-head-title{font-size:13px;font-weight:600}
      .pv-head-sub{color:color-mix(in srgb, var(--dsw-alias-label-secondary) 82%, transparent);font-size:11.5px}
      .pv-x{margin-left:auto;width:26px;height:26px;border:0;border-radius:7px;background:transparent;
        color:var(--dsw-alias-label-secondary);font-size:16px;line-height:1;cursor:pointer;font-family:inherit}
      .pv-x:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent);color:var(--dsw-alias-label-primary)}
      .pv-x:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
      .pv-search{padding:10px 14px;border-bottom:1px solid var(--dsw-alias-border-l1)}
      .pv-search input{width:100%;box-sizing:border-box;height:30px;padding:0 10px;border-radius:8px;
        border:1px solid var(--dsw-alias-border-l1);background:color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent);
        color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;outline:none}
      .pv-search input:focus{border-color:var(--dsw-alias-brand-primary)}
      .pv-search input::placeholder{color:color-mix(in srgb, var(--dsw-alias-label-secondary) 72%, transparent)}
      .pv-list{list-style:none;margin:0;padding:6px;overflow:auto;flex:1 1 auto;min-height:0;
        display:flex;flex-direction:column;gap:2px;scrollbar-width:thin}
      .pv-empty{margin:0;padding:28px 18px;text-align:center;
        color:color-mix(in srgb, var(--dsw-alias-label-secondary) 82%, transparent);font-size:12.5px}
      .pv-item{position:relative;padding:8px 10px;border-radius:9px;border:1px solid transparent}
      .pv-item[data-active="1"],.pv-item:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent)}
      .pv-item[data-live="1"]{background:color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent);
        border-color:color-mix(in srgb, var(--dsw-alias-brand-primary) 34%, transparent)}
      .pv-tag{display:inline-block;margin-right:6px;padding:0 5px;height:16px;line-height:16px;border-radius:4px;
        font-size:10.5px;font-weight:600;color:var(--dsw-alias-brand-primary);
        background:color-mix(in srgb, var(--dsw-alias-brand-primary) 16%, transparent);vertical-align:1px}
      .pv-text{white-space:pre-wrap;word-break:break-word;max-height:3.4em;overflow:hidden;
        font-family:inherit;font-size:12.5px;line-height:1.6;color:var(--dsw-alias-label-primary)}
      .pv-meta{margin-top:3px;display:flex;gap:10px;font-size:11px;font-variant-numeric:tabular-nums;
        color:color-mix(in srgb, var(--dsw-alias-label-secondary) 82%, transparent)}
      .pv-acts{position:absolute;top:6px;right:6px;display:none;gap:2px;padding:2px;border-radius:8px;
        background:var(--dsw-alias-bg-overlay)}
      .pv-item:hover .pv-acts,.pv-item[data-active="1"] .pv-acts{display:flex}
      .pv-act{height:22px;padding:0 7px;border:1px solid transparent;border-radius:6px;background:transparent;
        color:var(--dsw-alias-label-secondary);font-family:inherit;font-size:11.5px;cursor:pointer}
      .pv-act:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent);
        color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l1)}
      .pv-act[data-tone="danger"]:hover{color:var(--dsw-alias-state-error-primary,var(--dsw-alias-label-primary))}
      .pv-act:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
      .pv-foot{display:flex;align-items:center;gap:8px;padding:9px 14px;border-top:1px solid var(--dsw-alias-border-l1);
        font-size:11.5px;color:color-mix(in srgb, var(--dsw-alias-label-secondary) 82%, transparent)}
      .pv-kbd{display:inline-block;padding:1px 5px;border-radius:5px;border:1px solid var(--dsw-alias-border-l1);
        font-size:10.5px;font-variant-numeric:tabular-nums}
      .pv-clear{margin-left:auto;height:24px;padding:0 8px;border:1px solid transparent;border-radius:6px;
        background:transparent;color:var(--dsw-alias-label-secondary);font:inherit;font-size:11.5px;cursor:pointer}
      .pv-clear:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 10%, transparent);
        color:var(--dsw-alias-state-error-primary,var(--dsw-alias-label-primary));border-color:var(--dsw-alias-border-l1)}
      .pv-clear:disabled{opacity:.45;cursor:not-allowed}

      .pv-toast{position:fixed;left:50%;bottom:88px;transform:translateX(-50%);z-index:2147483001;
        max-width:min(520px,86vw);padding:7px 12px;border-radius:9px;font-size:12px;line-height:1.4;
        background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);
        border:1px solid var(--dsw-alias-border-l2);pointer-events:none;white-space:nowrap;overflow:hidden;
        text-overflow:ellipsis}
      .pv-toast[data-scheme="dark"]{box-shadow:0 10px 28px rgba(0,0,0,.45)}
      .pv-toast[data-scheme="light"]{box-shadow:0 10px 24px rgba(15,23,42,.14)}
    `;

    function installStyles() {
      if (document.getElementById(STYLE_ID)) return () => {};
      const el = document.createElement('style');
      el.id = STYLE_ID;
      el.textContent = CSS;
      document.head.appendChild(el);
      return () => el.remove();
    }

    /* ------------------------------------------------------------------ *
     * Formatting helpers
     * ------------------------------------------------------------------ */

    const pad = (value) => String(value).padStart(2, '0');

    function formatTime(at) {
      const date = new Date(at);
      const now = new Date();
      const clock = pad(date.getHours()) + ':' + pad(date.getMinutes());
      if (date.toDateString() === now.toDateString()) return clock;
      if (date.getFullYear() === now.getFullYear()) return pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + clock;
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    }

    function preview(text) {
      return text.length > 220 ? text.slice(0, 220) + '…' : text;
    }

    /* ------------------------------------------------------------------ *
     * Composer side
     * ------------------------------------------------------------------ */

    /**
     * Read the composer draft defensively: the snapshot shape is owned by the
     * conversation package, so take the whole snapshot (stable identity) and
     * pick the first plausible text field.
     */
    function useDraft(props) {
      const state = props.useInput((value) => value);
      if (!state || typeof state !== 'object') return '';
      const text = state.draft ?? state.text ?? state.value ?? state.input ?? '';
      return typeof text === 'string' ? text : '';
    }

    /** Invisible sibling of the trigger: owns the live snapshot and retirements. */
    function DraftTracker(props) {
      const draft = useDraft(props);
      const sessionId = props.sessionId || null;
      const previous = useRef('');
      const previousSession = useRef(null);
      const holdTimer = useRef(null);

      useEffect(() => {
        activeSessionId = sessionId;
        publishComposer(sessionId, props.inputActions);
      }, [sessionId, props.inputActions]);

      // Live snapshot: replaced in place, so an interrupted session is recoverable.
      useEffect(() => {
        lastDraft = draft;
        if (holdTimer.current) window.clearTimeout(holdTimer.current);
        holdTimer.current = window.setTimeout(() => setLive(draft, sessionId), HOLD_MS);
        return () => {
          if (holdTimer.current) window.clearTimeout(holdTimer.current);
        };
      }, [draft, sessionId]);

      // A draft that turns empty was either sent or wiped: retire it once.
      useEffect(() => {
        const before = previous.current;
        if (before.trim() !== '' && normalize(draft) === '') retire(before, sessionId);
        previous.current = draft;
      }, [draft, sessionId]);

      // Switching session abandons the draft of the previous one.
      useEffect(() => {
        const from = previousSession.current;
        if (from && from !== sessionId && previous.current.trim() !== '') retire(previous.current, from);
        previousSession.current = sessionId;
      }, [sessionId]);

      // Last chance before the page goes away.
      useEffect(() => {
        const flush = () => {
          const text = lastDraft;
          if (text && text.trim() !== '') {
            setLive(text, activeSessionId);
            retire(text, activeSessionId);
          }
        };
        window.addEventListener('pagehide', flush);
        return () => {
          window.removeEventListener('pagehide', flush);
          flush();
        };
      }, []);

      return null;
    }

    const ICON_PATHS = [
      // circular arrow (history)
      'M12.6 8a4.6 4.6 0 1 1-1.35-3.25',
      'M3.4 2.7v2.7h2.7',
      // clock hands
      'M8 5.4V8l1.95 1.2',
    ];

    function Trigger(props) {
      const history = useEntries();
      const open = useUiOpen();
      const count = history.length;
      return h(
        'button',
        {
          type: 'button',
          className: 'pv-trigger',
          'data-open': open ? '1' : '0',
          title: t('triggerHint'),
          'aria-label': t('trigger') + ' (' + count + ')',
          onClick: () => {
            publishComposer(props.sessionId, props.inputActions);
            setOpen(!open);
          },
        },
        h(
          'svg',
          {
            viewBox: '0 0 16 16',
            width: '16',
            height: '16',
            fill: 'none',
            stroke: 'none',
            focusable: 'false',
            'aria-hidden': 'true',
            style: { display: 'block', width: 16, height: 16, fill: 'none' },
          },
          ICON_PATHS.map((d, index) =>
            h('path', {
              key: index,
              d,
              fill: 'none',
              stroke: 'currentColor',
              'stroke-width': '1.5',
              'stroke-linecap': 'round',
              'stroke-linejoin': 'round',
              // inline, because host stylesheets happily target `path`
              style: { fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
            }),
          ),
        ),
        count > 0 ? h('span', { className: 'pv-badge' }, count > 99 ? '99+' : String(count)) : null,
      );
    }

    /* ------------------------------------------------------------------ *
     * Overlay side: the history panel
     * ------------------------------------------------------------------ */

    function Item(props) {
      const { entry, active, onActivate, onInsert, onCopy, onRemove } = props;
      return h(
        'li',
        {
          className: 'pv-item',
          'data-id': entry.id,
          'data-active': active ? '1' : '0',
          'data-live': entry.live ? '1' : '0',
          onMouseEnter: () => onActivate(entry.id),
        },
        h(
          'div',
          { className: 'pv-text' },
          entry.live ? h('span', { className: 'pv-tag' }, t('current')) : null,
          preview(entry.text),
        ),
        h(
          'div',
          { className: 'pv-meta' },
          h('span', null, formatTime(entry.at)),
          h('span', null, entry.text.length + ' ' + t('chars')),
        ),
        h(
          'div',
          { className: 'pv-acts' },
          h('button', { type: 'button', className: 'pv-act', onClick: () => onInsert(entry) }, t('insert')),
          h('button', { type: 'button', className: 'pv-act', onClick: () => onCopy(entry) }, t('copy')),
          entry.live
            ? null
            : h(
                'button',
                { type: 'button', className: 'pv-act', 'data-tone': 'danger', onClick: () => onRemove(entry.id) },
                t('remove'),
              ),
        ),
      );
    }

    /**
     * Ctrl+Alt+Z walks backwards through the history: first press recalls the
     * newest entry, further presses keep going, and pressing it again after you
     * typed something starts over from the newest.
     */
    const recall = { index: -1, at: 0, text: '' };

    function recallPrevious() {
      if (entries.length === 0) {
        toast(t('noHistory'));
        return;
      }
      const now = Date.now();
      const sameSession = now - recall.at < 6000 && recall.text !== '' && normalize(currentDraft()) === recall.text;
      const index = sameSession ? Math.min(entries.length - 1, recall.index + 1) : 0;
      const entry = entries[index];
      if (insertText(entry.text)) {
        recall.index = index;
        recall.at = now;
        recall.text = entry.text;
        toast(t('inserted') + ' ' + (index + 1) + '/' + entries.length);
      } else {
        toast(t('noComposer'));
      }
    }

    function matchesHotkey(event) {
      if (!event.ctrlKey || !event.altKey || event.shiftKey || event.metaKey) return false;
      const key = (event.key || '').toLowerCase();
      return key === 'z' || event.code === 'KeyZ' || event.keyCode === 90;
    }

    function Panel() {
      const open = useUiOpen();
      const history = useEntries();
      const liveDraft = useLive();
      const scheme = useScheme();
      const [query, setQuery] = useState('');
      const [activeId, setActiveId] = useState(null);
      const [notice, setNotice] = useState('');
      const searchRef = useRef(null);
      const listRef = useRef(null);
      const noticeTimer = useRef(null);

      const rows = useMemo(() => {
        const draftRow = liveDraft && liveDraft.text ? { id: '__live', text: liveDraft.text, at: liveDraft.at, live: true } : null;
        const needle = query.trim().toLowerCase();
        const list = needle ? history.filter((entry) => entry.text.toLowerCase().includes(needle)) : history;
        if (draftRow && (!needle || draftRow.text.toLowerCase().includes(needle))) return [draftRow, ...list];
        return list;
      }, [history, liveDraft, query]);

      useEffect(() => {
        const onKeyDown = (event) => {
          if (!matchesHotkey(event)) return;
          if (uiOpen) return;
          event.preventDefault();
          event.stopPropagation();
          recallPrevious();
        };
        window.addEventListener('keydown', onKeyDown, true);
        return () => window.removeEventListener('keydown', onKeyDown, true);
      }, []);

      useEffect(() => {
        if (!open) return undefined;
        setNotice('');
        setQuery('');
        setActiveId(null);
        const id = window.setTimeout(() => {
          if (searchRef.current) searchRef.current.focus();
        }, 30);
        return () => window.clearTimeout(id);
      }, [open]);

      useEffect(() => () => {
        if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
      }, []);

      const flash = useCallback((message) => {
        setNotice(message);
        if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
        noticeTimer.current = window.setTimeout(() => setNotice(''), 1400);
      }, []);

      const copyEntry = useCallback(
        (entry) => {
          const clipboard = navigator.clipboard;
          if (clipboard && clipboard.writeText) {
            clipboard.writeText(entry.text).then(
              () => flash(t('copied')),
              () => flash(entry.text),
            );
            return;
          }
          flash(entry.text.slice(0, 40));
        },
        [flash],
      );

      const onPanelKeyDown = useCallback(
        (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            setOpen(false);
            return;
          }
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          if (rows.length === 0) return;
          const index = rows.findIndex((entry) => entry.id === activeId);
          const next =
            event.key === 'ArrowDown'
              ? Math.min(rows.length - 1, index < 0 ? 0 : index + 1)
              : Math.max(0, index < 0 ? rows.length - 1 : index - 1);
          const target = rows[next];
          setActiveId(target.id);
          const node = listRef.current ? listRef.current.querySelector('[data-id="' + target.id + '"]') : null;
          if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
        },
        [activeId, rows],
      );

      const panel = open
        ? h(
            'div',
            {
              className: 'pv-backdrop',
              'data-scheme': scheme,
              onMouseDown: (event) => {
                if (event.target === event.currentTarget) setOpen(false);
              },
            },
            h(
              'div',
              { className: 'pv-panel', role: 'dialog', 'aria-label': t('title'), onKeyDown: onPanelKeyDown },
              h(
                'div',
                { className: 'pv-head' },
                h('span', { className: 'pv-head-title' }, t('title')),
                h('span', { className: 'pv-head-sub' }, t('subtitle')),
                h('button', { type: 'button', className: 'pv-x', 'aria-label': 'Close', onClick: () => setOpen(false) }, '×'),
              ),
              h(
                'div',
                { className: 'pv-search' },
                h('input', {
                  ref: searchRef,
                  type: 'search',
                  value: query,
                  placeholder: t('search'),
                  onChange: (event) => {
                    setQuery(event.target.value);
                    setActiveId(null);
                  },
                  onKeyDown: (event) => {
                    if (event.key === 'Enter' && rows.length > 0) {
                      event.preventDefault();
                      insertText((rows.find((entry) => entry.id === activeId) || rows[0]).text);
                    }
                  },
                }),
              ),
              h(
                'ul',
                { className: 'pv-list', ref: listRef },
                rows.length === 0
                  ? h('li', { className: 'pv-empty' }, history.length === 0 ? t('empty') : t('emptySearch'))
                  : rows.map((entry) =>
                      h(Item, {
                        key: entry.id,
                        entry,
                        active: entry.id === activeId,
                        onActivate: setActiveId,
                        onInsert: (item) => insertText(item.text),
                        onCopy: copyEntry,
                        onRemove: (id) => {
                          removeEntry(id);
                          setActiveId(null);
                        },
                      }),
                    ),
              ),
              h(
                'div',
                { className: 'pv-foot' },
                h('span', null, notice || t('footer')),
                h('span', { className: 'pv-kbd', style: { marginLeft: 'auto' } }, 'Ctrl+Alt+Z'),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'pv-clear',
                    disabled: history.length === 0,
                    onClick: () => {
                      if (window.confirm(t('clearConfirm'))) {
                        clearAll();
                        setActiveId(null);
                      }
                    },
                  },
                  t('clear'),
                ),
              ),
            ),
          )
        : null;

      return h(React.Fragment, null, panel, h(Toast, { scheme }));
    }

    function Toast(props) {
      const message = useToast();
      if (!message) return null;
      return h('div', { className: 'pv-toast', 'data-scheme': props.scheme, role: 'status' }, message);
    }

    /* ------------------------------------------------------------------ *
     * Plugin wiring
     * ------------------------------------------------------------------ */

    // Test seam: tools/logic-test.mjs drives the store in a vm sandbox.
    if (typeof window !== 'undefined' && window.__PV_TEST__) {
      window.__PV_TEST__.api = {
        isJunk,
        normalize,
        retire,
        setLive,
        clearAll,
        removeEntry,
        publishComposer,
        insertText,
        recallPrevious,
        currentDraft,
        entries: () => entries,
        live: () => live,
        reset: () => {
          entries = [];
          live = null;
          recall.index = -1;
          recall.at = 0;
          recall.text = '';
        },
      };
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => installStyles());
        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register({ name: 'conversation.input.left', id: 'prompt-vault-tracker', order: 1 }, DraftTracker),
        );
        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register({ name: 'conversation.input.left', id: 'prompt-vault', order: 99 }, Trigger),
        );
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'prompt-vault-panel', order: 90 }, Panel),
        );
      },
    };
  },
});
