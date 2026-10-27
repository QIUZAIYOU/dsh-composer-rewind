window.__ModuleLoader__.load({
  id: 'dsh-composer-rewind',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } = React;

    /**
     * The Harness popup shell used by the composer's + menu. Optional: if the
     * primitives module is unavailable the panel falls back to a plain div that
     * our own CSS styles, so the plugin still renders on older builds.
     */
    let primitives = null;
    try {
      primitives = require('@deepseek-ai/dsh-client-ui-primitives');
    } catch {
      primitives = null;
    }
    const MenuSurface = primitives && primitives.MenuSurface ? primitives.MenuSurface : 'div';
    const NATIVE_SURFACE = MenuSurface !== 'div';

    /** The plugin context, captured in apply(); settings access goes through it. */
    let runtime = null;

    /* ------------------------------------------------------------------ *
     * Text
     * ------------------------------------------------------------------ */

    const DICT = {
      zh: {
        trigger: '输入框历史',
        triggerHint: '输入框历史 · Ctrl+Alt+Z 回溯上一条',
        open: '打开输入框历史',
        title: '输入框历史',
        subtitle: '输入内容、附件和当时的 DSH 配置',
        search: '搜索输入内容、附件或配置',
        emptyTitle: '还没有历史记录',
        empty: '发送、清空输入框或切换会话时，当前内容会存到这里。',
        emptySearch: '没有匹配的记录。',
        current: '当前草稿',
        draft: '草稿',
        insert: '恢复',
        copy: '复制',
        remove: '删除',
        copied: '已复制',
        copyFailed: '复制失败',
        deleted: '已删除',
        clear: '清空',
        clearTitle: '清空全部历史？',
        clearBody: '所有记录和附件缓存都会被删除，无法撤销。',
        cancel: '取消',
        confirmClear: '清空',
        cleared: '已清空',
        chars: '字',
        attachments: '附件',
        attachmentsOnly: '仅附件，没有文字',
        groupCurrent: '当前草稿',
        groupToday: '今天',
        groupYesterday: '昨天',
        groupEarlier: '更早',
        close: '关闭',
        hintNav: '选择',
        footer: '恢复会把输入内容、附件和当时的配置写回输入框',
        hint: 'Ctrl+Alt+Z 取上一条',
        noHistory: '还没有历史记录',
        inserted: '已插入',
        noComposer: '输入框还没准备好，稍后再试',
        restoring: '正在恢复输入内容、附件与配置…',
        restored: '已恢复',
        restoredWith: '已恢复，但未能应用：',
        restoreFailed: '恢复失败',
        pendingAttachment: '正在保存附件…',
        missingAttachment: '附件内容已失效',
        settings: '当时配置',
        model: '模型',
        permission: '权限',
        mode: '模式',
        effort: '思考',
        hoverHint: '悬浮查看完整内容',
        count: '条',
        attachmentCount: '个附件',
        failAttachment: '附件',
        failModel: '模型',
        failPermission: '权限',
        failPreset: '使用模式',
        failSettings: '配置',
      },
      en: {
        trigger: 'Composer history',
        triggerHint: 'Composer history · Ctrl+Alt+Z for the previous one',
        open: 'Open composer history',
        title: 'Composer history',
        subtitle: 'Composer contents, attachments and the DSH setup you used',
        search: 'Search contents, attachments or setup',
        emptyTitle: 'No history yet',
        empty: 'Send, clear the composer or switch sessions and what you had is saved here.',
        emptySearch: 'No matching entries.',
        current: 'Current draft',
        draft: 'Draft',
        insert: 'Restore',
        copy: 'Copy',
        remove: 'Delete',
        copied: 'Copied',
        copyFailed: 'Copy failed',
        deleted: 'Deleted',
        clear: 'Clear',
        clearTitle: 'Clear the whole history?',
        clearBody: 'Every entry and cached attachment is removed. This cannot be undone.',
        cancel: 'Cancel',
        confirmClear: 'Clear',
        cleared: 'Cleared',
        chars: 'chars',
        attachments: 'Attachments',
        attachmentsOnly: 'Attachments only',
        groupCurrent: 'Current draft',
        groupToday: 'Today',
        groupYesterday: 'Yesterday',
        groupEarlier: 'Earlier',
        close: 'Close',
        hintNav: 'to move',
        footer: 'Restore writes the contents, attachments and setup back into the composer',
        hint: 'Ctrl+Alt+Z recalls the previous one',
        noHistory: 'No history yet',
        inserted: 'Inserted',
        noComposer: 'The composer is not ready yet',
        restoring: 'Restoring the composer contents, attachments and setup…',
        restored: 'Restored',
        restoredWith: 'Restored, but could not apply:',
        restoreFailed: 'Restore failed',
        pendingAttachment: 'Saving attachment…',
        missingAttachment: 'Attachment content is gone',
        settings: 'Setup',
        model: 'Model',
        permission: 'Permission',
        mode: 'Mode',
        effort: 'Thinking',
        hoverHint: 'Hover for the full entry',
        count: 'entries',
        attachmentCount: 'attachments',
        failAttachment: 'attachments',
        failModel: 'model',
        failPermission: 'permission',
        failPreset: 'mode',
        failSettings: 'setup',
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

    const PERMISSION_NAMES = {
      plan: ['计划', 'Plan'],
      'accept-edits': ['接受编辑', 'Accept edits'],
      auto: ['自动', 'Auto'],
      'danger-full-access': ['完全访问', 'Full access'],
      'read-only': ['只读', 'Read only'],
      'workspace-write': ['工作区写入', 'Workspace write'],
      default: ['默认', 'Default'],
    };

    const PRESET_NAMES = {
      standard: ['标准', 'Standard'],
      minimal: ['精简', 'Minimal'],
      ptc: ['PTC', 'PTC'],
      cordis: ['创造', 'Creator'],
      creator: ['创造', 'Creator'],
    };

    const EFFORT_NAMES = {
      none: ['无', 'None'],
      minimal: ['极简', 'Minimal'],
      low: ['低', 'Low'],
      medium: ['中', 'Medium'],
      high: ['高', 'High'],
      max: ['最高', 'Max'],
    };

    function pickName(table, value, fallback) {
      const row = table[value];
      if (row) return row[LANG === 'zh' ? 0 : 1];
      return fallback === undefined ? value : fallback;
    }

    function permissionLabel(value) {
      return pickName(PERMISSION_NAMES, value, value);
    }

    function presetLabel(value) {
      return pickName(PRESET_NAMES, value, value);
    }

    function effortLabel(value) {
      return pickName(EFFORT_NAMES, value, value);
    }

    /* ------------------------------------------------------------------ *
     * Store
     *
     * Three kinds of state are persisted:
     *  - the live snapshot: one record, replaced in place, with text,
     *    semantic references, attachment descriptors and the DSH setup;
     *  - history entries: whole snapshots that were abandoned (sent, cleared,
     *    session switched, page closed) — never one entry per keystroke;
     *  - attachment bytes, in IndexedDB, referenced from the snapshots by key.
     * ------------------------------------------------------------------ */

    const STORAGE_KEY = 'dsh-composer-rewind:v3';
    const PREV_STORAGE_KEY = 'dsh-prompt-vault:v3';
    const LEGACY_STORAGE_KEY = 'dsh-prompt-vault:v2';
    const LEGACY_KEY = 'dsh-prompt-vault:v1';
    const LIVE_KEY = 'dsh-composer-rewind:live:v3';
    const PREV_LIVE_KEY = 'dsh-prompt-vault:live:v3';
    const LEGACY_LIVE_KEY = 'dsh-prompt-vault:live';
    const MAX_ENTRIES = 300;
    const MIN_CHARS = 3;
    const COALESCE_WINDOW_MS = 10 * 60 * 1000;
    const HOLD_MS = 450;
    const MAX_ATTACHMENTS = 20;
    const MAX_BLOB_BYTES = 32 * 1024 * 1024;
    const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;

    // Kept from the previous package name so already-cached attachment bytes stay reachable.
    const BLOB_DB = 'dsh-prompt-vault';
    const BLOB_STORE = 'blobs';

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
      const value = String(text == null ? '' : text).trim();
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

    function clone(value) {
      try {
        return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
      } catch {
        return undefined;
      }
    }

    function sanitizeSettings(raw) {
      if (!raw || typeof raw !== 'object') return null;
      const model = raw.model && typeof raw.model === 'object' ? raw.model : null;
      const modelProvider = model && typeof model.provider === 'string' ? model.provider : '';
      const modelId = model && typeof model.model === 'string' ? model.model : '';
      const settings = {
        model: model && (modelProvider !== '' || modelId !== '')
          ? {
              provider: modelProvider,
              model: modelId,
              ...(typeof model.reasoningEffort === 'string' ? { reasoningEffort: model.reasoningEffort } : {}),
            }
          : null,
        permission: typeof raw.permission === 'string' && raw.permission !== '' ? raw.permission : null,
        agentPreset: typeof raw.agentPreset === 'string' && raw.agentPreset !== '' ? raw.agentPreset : null,
      };
      if (!settings.model && !settings.permission && !settings.agentPreset) return null;
      return settings;
    }

    function sanitizeAttachments(raw) {
      if (!Array.isArray(raw)) return [];
      const out = [];
      for (const item of raw) {
        if (!item || typeof item !== 'object' || typeof item.key !== 'string' || item.key === '') continue;
        out.push({
          key: item.key,
          name: typeof item.name === 'string' && item.name !== '' ? item.name : 'file',
          mime: typeof item.mime === 'string' ? item.mime : '',
          size: typeof item.size === 'number' && item.size >= 0 ? item.size : 0,
          kind: item.kind === 'image' ? 'image' : 'file',
          ...(typeof item.width === 'number' ? { width: item.width } : {}),
          ...(typeof item.height === 'number' ? { height: item.height } : {}),
          ...(item.pending === true ? { pending: true } : {}),
          ...(item.missing === true ? { missing: true } : {}),
        });
        if (out.length >= MAX_ATTACHMENTS) break;
      }
      return out;
    }

    function sanitizeReferences(raw, text) {
      if (!Array.isArray(raw) || typeof text !== 'string') return [];
      const out = [];
      for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const offset = Number(item.offset);
        const length = Number(item.length);
        if (!Number.isFinite(offset) || !Number.isFinite(length) || offset < 0 || length <= 0) continue;
        if (offset + length > text.length) continue;
        if (typeof item.source !== 'string') continue;
        out.push({
          source: item.source,
          ref: clone(item.ref),
          offset,
          length,
          label: typeof item.label === 'string' ? item.label : '',
          clipboardText: typeof item.clipboardText === 'string' ? item.clipboardText : '',
          ...(item.appearance === undefined ? {} : { appearance: clone(item.appearance) }),
          ...(item.invalid === true ? { invalid: true } : {}),
        });
      }
      out.sort((a, b) => a.offset - b.offset);
      let cursor = 0;
      const clean = [];
      for (const reference of out) {
        if (reference.offset < cursor) continue;
        clean.push(reference);
        cursor = reference.offset + reference.length;
      }
      return clean;
    }

    function attachmentKeys(attachments) {
      return (attachments || []).map((item) => item.key).join('|');
    }

    function sameAttachmentKeys(left, right) {
      return attachmentKeys(left) === attachmentKeys(right);
    }

    function entrySignature(text, attachments) {
      return normalize(text) + '\u0001' + attachmentKeys(attachments);
    }

    function sanitize(list) {
      if (!Array.isArray(list)) return [];
      const seen = new Set();
      const out = [];
      for (const item of list) {
        if (!item || typeof item.text !== 'string') continue;
        const text = normalize(item.text);
        const attachments = sanitizeAttachments(item.attachments);
        if (text === '' && attachments.length === 0) continue;
        if (attachments.length === 0 && isJunk(text)) continue;
        const signature = entrySignature(text, attachments);
        if (seen.has(signature)) continue;
        seen.add(signature);
        out.push({
          id: typeof item.id === 'string' ? item.id : uid(),
          text,
          at: typeof item.at === 'number' ? item.at : Date.now(),
          sessionId: typeof item.sessionId === 'string' ? item.sessionId : null,
          references: sanitizeReferences(item.references, text),
          command: typeof item.command === 'string' && item.command.startsWith('/') ? item.command : null,
          attachments,
          settings: sanitizeSettings(item.settings),
        });
        if (out.length >= MAX_ENTRIES) break;
      }
      return out;
    }

    function loadEntries() {
      const current = readRaw(STORAGE_KEY);
      if (Array.isArray(current)) return sanitize(current);
      const previous = sanitize(readRaw(PREV_STORAGE_KEY));
      if (previous.length > 0) {
        writeRaw(STORAGE_KEY, previous);
        return previous;
      }
      const legacy = sanitize(readRaw(LEGACY_STORAGE_KEY));
      if (legacy.length > 0) {
        writeRaw(STORAGE_KEY, legacy);
        return legacy;
      }
      const oldest = sanitize(readRaw(LEGACY_KEY));
      if (oldest.length > 0) writeRaw(STORAGE_KEY, oldest);
      return oldest;
    }

    function liveOf(raw) {
      if (!raw || typeof raw.text !== 'string') return null;
      const text = normalize(raw.text);
      const attachments = sanitizeAttachments(raw.attachments);
      if (text === '' && attachments.length === 0) return null;
      return {
        text,
        at: typeof raw.at === 'number' ? raw.at : Date.now(),
        sessionId: typeof raw.sessionId === 'string' ? raw.sessionId : null,
        references: sanitizeReferences(raw.references, text),
        command: typeof raw.command === 'string' && raw.command.startsWith('/') ? raw.command : null,
        attachments,
        settings: sanitizeSettings(raw.settings),
      };
    }

    function loadLive() {
      const current = liveOf(readRaw(LIVE_KEY));
      if (current) return current;
      const previous = liveOf(readRaw(PREV_LIVE_KEY));
      if (previous) return previous;
      return liveOf(readRaw(LEGACY_LIVE_KEY));
    }

    let entries = loadEntries();
    let live = loadLive();
    let lastRetiredSignature = '';
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
      schedulePrune();
    }

    function setLiveSnapshot(raw) {
      const next = liveOf(raw);
      if (!next) {
        if (live !== null) {
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
      live = next;
      writeRaw(LIVE_KEY, live);
      emit();
    }

    function signatureOf(snapshot) {
      return entrySignature(snapshot.text, snapshot.attachments || []);
    }

    function retireSnapshot(snapshot) {
      if (!snapshot) return false;
      const text = normalize(snapshot.text);
      const attachments = sanitizeAttachments(snapshot.attachments);
      if (text === '' && attachments.length === 0) return false;
      if (attachments.length === 0 && isJunk(text)) return false;

      const signature = entrySignature(text, attachments);
      if (lastRetiredSignature === signature) return false;

      const now = Date.now();
      const fresh = {
        id: uid(),
        at: now,
        text,
        sessionId: typeof snapshot.sessionId === 'string' ? snapshot.sessionId : null,
        references: sanitizeReferences(snapshot.references, text),
        command: typeof snapshot.command === 'string' && snapshot.command.startsWith('/') ? snapshot.command : null,
        attachments,
        settings: sanitizeSettings(snapshot.settings),
      };

      const head = entries[0];
      if (head && head.text === text && sameAttachmentKeys(head.attachments, attachments)) {
        const refreshed = {
          ...head,
          at: now,
          references: fresh.references,
          command: fresh.command,
          settings: fresh.settings || head.settings,
        };
        lastRetiredSignature = signature;
        commitEntries([refreshed, ...entries.slice(1)]);
        return true;
      }

      if (head && now - head.at < COALESCE_WINDOW_MS && text !== '' && head.text !== '') {
        const sameAttachments = sameAttachmentKeys(head.attachments, attachments);
        // Typing more of the same draft: replace the head so references,
        // attachments and setup all describe the newest revision.
        if (sameAttachments && text.startsWith(head.text)) {
          lastRetiredSignature = signature;
          commitEntries([{ ...fresh, id: head.id }, ...entries.slice(1)]);
          return true;
        }
        // Backspacing inside a draft we already hold: keep the fuller head.
        if (sameAttachments && head.text.startsWith(text)) {
          lastRetiredSignature = signature;
          commitEntries([{ ...head, at: now, settings: fresh.settings || head.settings }, ...entries.slice(1)]);
          return true;
        }
      }

      lastRetiredSignature = signature;
      commitEntries([
        fresh,
        ...entries.filter((item) => entrySignature(item.text, item.attachments) !== signature),
      ]);
      return true;
    }

    /** Compatibility shim used by the old hotkey/tests: plain text retirement. */
    function retire(text, sessionId) {
      return retireSnapshot({
        text,
        sessionId,
        at: Date.now(),
        references: [],
        command: null,
        attachments: [],
        settings: null,
      });
    }

    function setLive(text, sessionId) {
      return setLiveSnapshot({
        text,
        sessionId,
        at: Date.now(),
        references: [],
        command: null,
        attachments: [],
        settings: null,
      });
    }

    function removeEntry(id) {
      commitEntries(entries.filter((item) => item.id !== id));
    }

    function clearAll() {
      lastRetiredSignature = '';
      commitEntries([]);
    }

    function patchEntryAttachments(id, info) {
      if (!Array.isArray(info) || info.length === 0) return;
      const byKey = new Map(info.map((item) => [item.key, item]));
      let changed = false;
      const next = entries.map((entry) => {
        if (!entry.attachments.some((item) => byKey.has(item.key))) return entry;
        changed = true;
        return {
          ...entry,
          attachments: entry.attachments.map((item) => {
            const found = byKey.get(item.key);
            return found ? { ...found, key: item.key } : item;
          }),
        };
      });
      if (changed) commitEntries(next);
    }

    function patchLiveAttachments(sessionId, info) {
      if (!live || !Array.isArray(info) || info.length === 0) return;
      if (sessionId && live.sessionId !== sessionId) return;
      const byKey = new Map(info.map((item) => [item.key, item]));
      if (!live.attachments.some((item) => byKey.has(item.key))) return;
      const next = {
        ...live,
        attachments: live.attachments.map((item) => {
          const found = byKey.get(item.key);
          return found ? { ...found, key: item.key } : item;
        }),
      };
      live = next;
      writeRaw(LIVE_KEY, live);
      emit();
    }

    /* ------------------------------------------------------------------ *
     * Attachment bytes (IndexedDB)
     * ------------------------------------------------------------------ */

    let dbPromise = null;
    const attachInfo = new Map(); // attachment id -> descriptor
    const attachPromises = new Map(); // attachment id -> Promise<descriptor|null>
    const attachAliases = new Map(); // restored attachment id -> reused blob key
    const blobUrls = new Map(); // blob key -> object URL
    let pruneTimer = null;
    let prunePending = false;

    function idb() {
      if (typeof window === 'undefined' || typeof window.indexedDB === 'undefined') return Promise.resolve(null);
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve) => {
        let request;
        try {
          request = window.indexedDB.open(BLOB_DB, 1);
        } catch {
          resolve(null);
          return;
        }
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(BLOB_STORE)) db.createObjectStore(BLOB_STORE, { keyPath: 'id' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(null);
        request.onblocked = () => resolve(null);
      });
      return dbPromise;
    }

    function getBlob(key) {
      return idb().then((db) => {
        if (!db || !key) return null;
        return new Promise((resolve) => {
          try {
            const request = db.transaction(BLOB_STORE, 'readonly').objectStore(BLOB_STORE).get(key);
            request.onsuccess = () => resolve(request.result && request.result.blob ? request.result.blob : null);
            request.onerror = () => resolve(null);
          } catch {
            resolve(null);
          }
        });
      });
    }

    function saveBlob(key, file) {
      return idb().then((db) => {
        if (!db || !file) return false;
        return new Promise((resolve) => {
          try {
            const tx = db.transaction(BLOB_STORE, 'readwrite');
            tx.objectStore(BLOB_STORE).put({ id: key, blob: file, at: Date.now() });
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => resolve(false);
            tx.onabort = () => resolve(false);
          } catch {
            resolve(false);
          }
        });
      });
    }

    function referencedBlobKeys() {
      const keys = new Set();
      for (const entry of entries) for (const item of entry.attachments) keys.add(item.key);
      if (live) for (const item of live.attachments) keys.add(item.key);
      return keys;
    }

    function schedulePrune() {
      if (pruneTimer || prunePending) return;
      prunePending = true;
      const run = () => {
        prunePending = false;
        pruneTimer = null;
        pruneBlobs();
      };
      if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(run, { timeout: 4000 });
      } else {
        pruneTimer = window.setTimeout(run, 1500);
      }
    }

    function pruneBlobs() {
      const keep = referencedBlobKeys();
      return idb().then((db) => {
        if (!db) return;
        try {
          const store = db.transaction(BLOB_STORE, 'readwrite').objectStore(BLOB_STORE);
          const cursor = store.openCursor();
          cursor.onsuccess = () => {
            const row = cursor.result;
            if (!row) return;
            if (!keep.has(row.value.id)) row.delete();
            row.continue();
          };
        } catch {
          /* ignore */
        }
      });
    }

    function describeAttachment(draft, id) {
      const file = draft && draft.file ? draft.file : null;
      const size = file && typeof file.size === 'number' ? file.size : 0;
      return {
        key: id,
        name: file && file.name ? file.name : draft && draft.kind === 'image' ? 'image' : 'file',
        mime: file && file.type ? file.type : '',
        size,
        kind: draft && draft.kind === 'image' ? 'image' : 'file',
        ...(draft && typeof draft.width === 'number' ? { width: draft.width } : {}),
        ...(draft && typeof draft.height === 'number' ? { height: draft.height } : {}),
        ...(size > MAX_BLOB_BYTES ? { missing: true } : {}),
      };
    }

    function rememberAttachments(sessionId, ids) {
      if (!Array.isArray(ids) || ids.length === 0) return;
      const conversation = getConversation();
      if (!conversation || typeof conversation.resolveDraftAttachments !== 'function') return;
      for (const id of ids) {
        if (attachPromises.has(id)) continue;
        const promise = Promise.resolve()
          .then(() => conversation.resolveDraftAttachments([id]))
          .then((list) => {
            const draft = Array.isArray(list) ? list[0] : null;
            if (!draft) return null;
            const info = describeAttachment(draft, id);
            const alias = attachAliases.get(id);
            const known = alias ? attachInfo.get(alias) : null;
            if (known) {
              const reuse = { ...known, key: known.key, pending: false };
              attachInfo.set(id, reuse);
              return reuse;
            }
            if (info.missing) {
              attachInfo.set(id, info);
              return info;
            }
            return saveBlob(info.key, draft.file).then((saved) => {
              if (!saved) info.missing = true;
              attachInfo.set(id, info);
              return info;
            });
          })
          .catch(() => null)
          .then((info) => {
            if (info) emit();
            return info;
          });
        attachPromises.set(id, promise);
      }
      Promise.all(ids.map((id) => attachPromises.get(id))).then((list) => {
        const info = list.filter(Boolean);
        if (info.length === 0) return;
        patchLiveAttachments(sessionId, info);
        for (const entry of entries) {
          if (entry.attachments.some((item) => item.pending && ids.includes(item.key))) {
            patchEntryAttachments(entry.id, info);
          }
        }
      });
    }

    function attachmentsForIds(ids) {
      return (Array.isArray(ids) ? ids : []).map((id) => {
        const info = attachInfo.get(id);
        if (info) return { ...info, key: info.key || id };
        const alias = attachAliases.get(id);
        const known = alias ? attachInfo.get(alias) : null;
        if (known) return { ...known, key: known.key };
        return { key: id, name: 'file', mime: '', size: 0, kind: 'file', pending: true };
      });
    }

    /* ------------------------------------------------------------------ *
     * DSH setup (model, thinking effort, permission, agent preset)
     * ------------------------------------------------------------------ */

    function sessionsService() {
      if (!runtime) return null;
      try {
        if (runtime.sessions) return runtime.sessions;
        if (typeof runtime.get === 'function') return runtime.get('sessions') || null;
      } catch {
        /* ignore */
      }
      return null;
    }

    function liveSessionOf(sessionId) {
      const sessions = sessionsService();
      if (!sessions || !sessionId || typeof sessions.binding !== 'function') return null;
      try {
        return sessions.binding(sessionId)?.session || null;
      } catch {
        return null;
      }
    }

    function projectionOf(session, name) {
      try {
        return session?.projections?.faceOf?.(name)?.getSnapshot?.() ?? null;
      } catch {
        return null;
      }
    }

    function readSettings(sessionId) {
      if (!sessionId) return null;
      const session = liveSessionOf(sessionId);
      if (!session) return null;
      const selection = projectionOf(session, 'modelSelection');
      const chosen = selection ? selection.next || selection.lastUsed || null : null;
      const permissions = projectionOf(session, 'permissions');
      const preset = projectionOf(session, 'agentPreset');
      return sanitizeSettings({
        model: chosen
          ? {
              provider: chosen.provider,
              model: chosen.model,
              ...(chosen.reasoningEffort ? { reasoningEffort: chosen.reasoningEffort } : {}),
            }
          : null,
        permission: permissions && typeof permissions.currentValue === 'string' ? permissions.currentValue : null,
        agentPreset:
          typeof preset === 'string'
            ? preset
            : typeof session?.projectionValues?.agentPreset === 'string'
              ? session.projectionValues.agentPreset
              : null,
      });
    }

    function mergeSettings(fresh, fallback) {
      if (!fresh) return fallback || null;
      if (!fallback) return fresh;
      return sanitizeSettings({
        model: fresh.model || fallback.model || null,
        permission: fresh.permission || fallback.permission || null,
        agentPreset: fresh.agentPreset || fallback.agentPreset || null,
      });
    }

    function failureLabel(kind) {
      if (kind === 'model') return t('failModel');
      if (kind === 'permission') return t('failPermission');
      if (kind === 'preset') return t('failPreset');
      if (kind === 'settings') return t('failSettings');
      return t('failAttachment');
    }

    async function applySettings(settings, sessionId) {
      const failures = [];
      if (!settings || !sessionId) return failures;
      const sessions = sessionsService();
      if (!sessions) {
        failures.push('settings');
        return failures;
      }

      // 1. Agent preset first: it can only change on a blank session, and a
      //    successful switch may recreate the session that the other writes
      //    must target.
      if (settings.agentPreset) {
        try {
          const session = liveSessionOf(sessionId);
          const current =
            projectionOf(session, 'agentPreset') ||
            (session && session.projectionValues ? session.projectionValues.agentPreset : null);
          if (session && current !== settings.agentPreset) {
            const blank = session.blank === true || (typeof session.blank === 'function' && session.blank());
            const remote = runtime && runtime.remote;
            if (blank && remote && remote.agentPresets && typeof remote.agentPresets.select === 'function') {
              const result = await remote.agentPresets.select(sessionId, settings.agentPreset);
              if (result && result.ok === false) failures.push('preset');
            } else {
              failures.push('preset');
            }
          }
        } catch {
          failures.push('preset');
        }
      }

      // 2. Model + reasoning effort.
      if (settings.model && settings.model.model) {
        try {
          if (typeof sessions.selectModel !== 'function') {
            failures.push('model');
          } else {
            const result = await sessions.selectModel({
              sessionId,
              provider: settings.model.provider,
              model: settings.model.model,
              ...(settings.model.reasoningEffort ? { reasoningEffort: settings.model.reasoningEffort } : {}),
            });
            if (result && result.ok === false) failures.push('model');
          }
        } catch {
          failures.push('model');
        }
      }

      // 3. Permission preset, through the same live slash command the picker uses.
      if (settings.permission) {
        try {
          const session = liveSessionOf(sessionId);
          if (!session || typeof session.command !== 'function') {
            failures.push('permission');
          } else {
            const result = await session.command('/permission ' + settings.permission);
            if (!result || result.ok === false || (result.value && result.value.matched === false)) {
              failures.push('permission');
            }
          }
        } catch {
          failures.push('permission');
        }
      }

      return failures;
    }

    function getConversation() {
      if (!runtime) return null;
      try {
        if (typeof runtime.get === 'function') return runtime.get('conversation') || null;
        return runtime.conversation || null;
      } catch {
        return null;
      }
    }

    /* ------------------------------------------------------------------ *
     * UI state shared between the composer and the overlay
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
      }, 2200);
    }

    function subscribeToast(listener) {
      toastListeners.add(listener);
      return () => toastListeners.delete(listener);
    }

    const composerBySession = new Map();
    let activeSessionId = null;
    let lastDraft = '';
    let lastState = null;
    let lastCapture = null;

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

    function textOf(state) {
      if (!state || typeof state !== 'object') return '';
      const text = state.draft ?? state.text ?? state.value ?? state.input ?? '';
      return typeof text === 'string' ? text : '';
    }

    function referencesOf(state) {
      return sanitizeReferences(state && Array.isArray(state.occurrences) ? state.occurrences : [], textOf(state));
    }

    function commandOf(state) {
      const token = state && state.claim ? state.claim.token : null;
      return typeof token === 'string' && token.startsWith('/') ? token : null;
    }

    function buildSnapshotFrom(state, sessionId) {
      const text = normalize(textOf(state));
      const attachmentIds = state && Array.isArray(state.attachmentIds) ? [...state.attachmentIds] : [];
      return {
        text,
        sessionId: sessionId || null,
        at: Date.now(),
        references: referencesOf(state),
        command: commandOf(state),
        attachmentIds,
        attachments: attachmentsForIds(attachmentIds),
        settings: readSettings(sessionId),
      };
    }

    function flushFromLastState() {
      if (!lastState || !lastState.sessionId) return null;
      const snapshot = buildSnapshotFrom(lastState.state, lastState.sessionId);
      lastCapture = snapshot;
      setLiveSnapshot(snapshot);
      return snapshot;
    }

    /** Keep the panel's live row and the crash-recovery record in step. */
    function rememberCapture(snapshot) {
      if (!snapshot) return;
      lastCapture = snapshot;
      setLiveSnapshot(snapshot);
    }

    function retireParts(parts) {
      if (!parts || !parts.sessionId) return false;
      const snapshot = {
        text: parts.text,
        sessionId: parts.sessionId,
        at: Date.now(),
        references: parts.references,
        command: parts.command,
        attachmentIds: parts.ids,
        attachments: attachmentsForIds(parts.ids),
        settings:
          mergeSettings(
            readSettings(parts.sessionId),
            lastCapture && lastCapture.sessionId === parts.sessionId ? lastCapture.settings : null,
          ) || null,
      };
      if (!snapshot.text && snapshot.attachments.length === 0) return false;
      const retired = retireSnapshot(snapshot);
      if (retired && live && live.sessionId === parts.sessionId) setLiveSnapshot(null);
      return retired;
    }

    /* ------------------------------------------------------------------ *
     * Restore
     * ------------------------------------------------------------------ */

    function draftOf(entry) {
      const references = sanitizeReferences(entry && entry.references, normalize(entry && entry.text));
      const command = entry && typeof entry.command === 'string' && entry.command.startsWith('/') ? entry.command : null;
      if (references.length === 0 && !command) return normalize(entry && entry.text);
      return {
        text: normalize(entry && entry.text),
        references,
        ...(command ? { command: { token: command } } : {}),
      };
    }

    function releaseDrafts(ids) {
      const conversation = getConversation();
      if (!conversation || typeof conversation.releaseDraftAttachment !== 'function') return;
      for (const id of ids || []) {
        try {
          conversation.releaseDraftAttachment(id);
        } catch {
          /* ignore */
        }
      }
    }

    /** Drop the attachments currently on the composer, then free their drafts. */
    function clearComposerAttachments(actions, ids) {
      if (!Array.isArray(ids) || ids.length === 0) return;
      if (actions && typeof actions.pruneAttachments === 'function') {
        try {
          actions.pruneAttachments([]);
        } catch {
          /* ignore */
        }
      }
      releaseDrafts(ids);
    }

    async function restoreEntry(entry) {
      let actions = composerActions();
      if (!actions || typeof actions.setDraft !== 'function') {
        toast(t('noComposer'));
        return { ok: false, failures: [] };
      }
      const sessionId = activeSessionId;

      if (entry.live) {
        const currentText = normalize(currentDraft());
        const currentCount =
          lastState && lastState.state && Array.isArray(lastState.state.attachmentIds)
            ? lastState.state.attachmentIds.length
            : 0;
        if (currentText === normalize(entry.text) && currentCount === (entry.attachments || []).length) {
          actions.setDraft(draftOf(entry));
          setOpen(false);
          toast(t('restored'));
          return { ok: true, failures: [] };
        }
      }

      // The draft being replaced is itself worth keeping.
      if (lastState && lastState.state) {
        const current = buildSnapshotFrom(lastState.state, lastState.sessionId || sessionId);
        if (current.text || current.attachments.length) retireSnapshot(current);
      }

      const failures = [];
      const oldIds =
        lastState && lastState.sessionId === sessionId && Array.isArray(lastState.state?.attachmentIds)
          ? lastState.state.attachmentIds.slice()
          : [];
      clearComposerAttachments(actions, oldIds);

      // Setup first: switching the agent preset can rebuild the session that the
      // draft and its attachments must be restored into.
      if (entry.settings) {
        try {
          for (const item of await applySettings(entry.settings, sessionId)) failures.push(item);
        } catch {
          failures.push('settings');
        }
        // The preset switch can remount the composer; give the tracker one tick
        // to publish the fresh inputActions before writing the draft.
        await new Promise((resolve) => window.setTimeout(resolve, 60));
        actions = composerActions() || actions;
      }
      if (!actions || typeof actions.setDraft !== 'function') {
        toast(t('noComposer'));
        return { ok: false, failures };
      }

      const sources = [];
      const files = [];
      const attachments = Array.isArray(entry.attachments) ? entry.attachments.slice(0, MAX_ATTACHMENTS) : [];
      for (const attachment of attachments) {
        let blob = null;
        try {
          blob = await getBlob(attachment.key);
        } catch {
          blob = null;
        }
        if (!blob) {
          failures.push('attachment');
          continue;
        }
        try {
          files.push(new File([blob], attachment.name || 'file', { type: attachment.mime || blob.type || '' }));
          sources.push(attachment);
        } catch {
          failures.push('attachment');
        }
      }

      const created = [];
      if (files.length > 0) {
        const conversation = getConversation();
        if (!conversation || typeof conversation.createDrafts !== 'function') {
          failures.push('attachments');
        } else {
          try {
            const drafts = conversation.createDrafts(sessionId, files);
            const ids = (drafts || []).map((draft) => draft && draft.id).filter(Boolean);
            if (ids.length !== files.length) failures.push('attachments');
            const accepted = typeof actions.addAttachments === 'function' ? actions.addAttachments(ids) : false;
            if (!accepted) {
              releaseDrafts(ids);
              failures.push('attachments');
            } else {
              for (let index = 0; index < ids.length; index += 1) {
                const source = sources[index];
                if (!source) continue;
                created.push(ids[index]);
                if (source.key) {
                  attachAliases.set(ids[index], source.key);
                  const known = attachInfo.get(source.key);
                  if (known) attachInfo.set(ids[index], { ...known, key: source.key, pending: false });
                }
              }
            }
          } catch {
            failures.push('attachments');
          }
        }
      }

      actions.setDraft(draftOf(entry));
      lastDraft = normalize(entry.text);
      const restoredSnapshot = {
        text: normalize(entry.text),
        sessionId,
        at: Date.now(),
        references: sanitizeReferences(entry.references, normalize(entry.text)),
        command: entry.command || null,
        attachmentIds: created,
        settings: mergeSettings(readSettings(sessionId), entry.settings),
      };
      // Map the restored attachment rail back to the recorded thumbnails.
      if (created.length > 0) {
        restoredSnapshot.attachments = created.map((id, index) => {
          const source = sources[index];
          const known = source ? attachInfo.get(source.key) : null;
          return known ? { ...known, key: known.key, pending: false } : source || { key: id, name: 'file', mime: '', size: 0, kind: 'file' };
        });
      }
      lastCapture = restoredSnapshot;
      setLiveSnapshot(restoredSnapshot);
      setOpen(false);

      const failedLabels = [...new Set(failures.map(failureLabel))];
      if (failedLabels.length > 0) {
        toast(t('restoredWith') + ' ' + failedLabels.join(' / '));
      } else {
        toast(t('restored'));
      }
      return { ok: true, failures };
    }

    function insertText(text) {
      const actions = composerActions();
      if (!actions || typeof actions.setDraft !== 'function') return false;
      if (lastState && lastState.state) {
        const before = buildSnapshotFrom(lastState.state, lastState.sessionId || activeSessionId);
        if (before.text || before.attachments.length) retireSnapshot(before);
        clearComposerAttachments(actions, lastState.state.attachmentIds);
      }
      actions.setDraft(text);
      lastDraft = text;
      const snapshot = {
        text: normalize(text),
        sessionId: activeSessionId,
        at: Date.now(),
        references: [],
        command: null,
        attachmentIds: [],
        attachments: [],
        settings: readSettings(activeSessionId),
      };
      lastCapture = snapshot;
      setLiveSnapshot(snapshot);
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

    function useBlobUrl(attachment) {
      const key = attachment && attachment.key;
      const pending = attachment && attachment.pending;
      const [url, setUrl] = useState(() => (key ? blobUrls.get(key) || null : null));
      useEffect(() => {
        if (!key) return undefined;
        const cached = blobUrls.get(key);
        if (cached) {
          setUrl(cached);
          return undefined;
        }
        let alive = true;
        let tries = 0;
        let timer = null;
        const load = () => {
          getBlob(key).then((blob) => {
            if (!alive) return;
            if (blob) {
              let objectUrl = blobUrls.get(key);
              if (!objectUrl && typeof URL !== 'undefined' && URL.createObjectURL) {
                objectUrl = URL.createObjectURL(blob);
                blobUrls.set(key, objectUrl);
              }
              setUrl(objectUrl || null);
              return;
            }
            if (pending && tries < 4) {
              tries += 1;
              timer = window.setTimeout(load, 400);
              return;
            }
            setUrl('missing');
          });
        };
        load();
        return () => {
          alive = false;
          if (timer) window.clearTimeout(timer);
        };
      }, [key, pending]);
      return url;
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
      try {
        const declared = (window.getComputedStyle(document.documentElement).colorScheme || '').toLowerCase();
        if (declared.indexOf('dark') >= 0 && declared.indexOf('light') < 0) return 'dark';
        if (declared.indexOf('light') >= 0 && declared.indexOf('dark') < 0) return 'light';
      } catch {
        /* fall through */
      }
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
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    function useScheme() {
      const [scheme, setScheme] = useState(detectScheme);
      useEffect(() => {
        const update = () => setScheme(detectScheme());
        update();
        const observer = new MutationObserver(update);
        observer.observe(document.documentElement, {
          attributes: true,
          attributeFilter: ['class', 'style', 'data-theme', 'data-color-scheme', 'data-mode'],
        });
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

    function formatBytes(size) {
      if (!size) return '';
      if (size < 1024) return size + ' B';
      if (size < 1024 * 1024) return Math.round(size / 1024) + ' KB';
      return (size / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function haystack(entry) {
      const pieces = [entry.text || ''];
      for (const item of entry.attachments || []) pieces.push(item.name || '');
      const settings = entry.settings;
      if (settings) {
        if (settings.model) pieces.push(settings.model.provider || '', settings.model.model || '', settings.model.reasoningEffort || '');
        if (settings.permission) pieces.push(settings.permission, permissionLabel(settings.permission));
        if (settings.agentPreset) pieces.push(settings.agentPreset, presetLabel(settings.agentPreset));
      }
      return pieces.join(' ').toLowerCase();
    }

    /* ------------------------------------------------------------------ *
     * Styles
     * ------------------------------------------------------------------ */

    const STYLE_ID = 'pv-styles';

    const CSS = `
      .pv-trigger{all:unset!important;box-sizing:border-box!important;position:relative!important;display:inline-flex!important;
        align-items:center!important;justify-content:center!important;width:28px!important;height:28px!important;min-width:28px!important;
        padding:0!important;margin:0!important;border:0!important;border-radius:8px!important;background:transparent!important;
        color:var(--dsw-alias-label-secondary)!important;cursor:pointer!important;font:inherit!important;line-height:1!important;
        -webkit-appearance:none!important;appearance:none!important;transition:background-color .12s ease,color .12s ease}
      .pv-trigger:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 9%,transparent)!important;
        color:var(--dsw-alias-label-primary)!important}
      .pv-trigger:active{background:color-mix(in srgb,var(--dsw-alias-label-primary) 15%,transparent)!important}
      .pv-trigger:focus-visible{outline:2px solid var(--dsw-alias-brand-primary)!important;outline-offset:2px}
      .pv-trigger[data-open="1"]{background:color-mix(in srgb,var(--dsw-alias-label-primary) 11%,transparent)!important;
        color:var(--dsw-alias-label-primary)!important}
      .pv-trigger svg{display:block!important;width:18px!important;height:18px!important;pointer-events:none!important}

      .pv-backdrop{position:fixed!important;inset:0!important;z-index:2147483000!important;display:flex!important;
        align-items:center!important;justify-content:center!important;padding:24px!important;box-sizing:border-box!important;
        animation:pv-fade .12s ease-out}
      .pv-backdrop[data-scheme="dark"]{background:rgba(0,0,0,.46)!important}
      .pv-backdrop[data-scheme="light"]{background:rgba(15,23,42,.18)!important}
      .pv-panel{display:flex!important;flex-direction:column!important;width:min(640px,100%)!important;
        max-height:min(76vh,660px)!important;box-sizing:border-box!important;overflow:hidden!important;
        color:var(--dsw-alias-label-primary)!important;
        font-family:inherit!important;font-size:13px!important;line-height:1.5!important;animation:pv-pop .14s ease-out}
      .pv-panel[data-pv-surface="fallback"]{background:var(--dsw-alias-bg-layer-2)!important;
        border:1px solid var(--dsw-alias-border-l1)!important;border-radius:18px!important}
      .pv-backdrop[data-scheme="dark"] .pv-panel[data-pv-surface="fallback"]{box-shadow:0 28px 70px rgba(0,0,0,.58),0 3px 10px rgba(0,0,0,.36)!important}
      .pv-backdrop[data-scheme="light"] .pv-panel[data-pv-surface="fallback"]{box-shadow:0 28px 64px rgba(15,23,42,.18),0 3px 10px rgba(15,23,42,.08)!important}
      .pv-panel *{box-sizing:border-box!important;font-family:inherit!important}

      .pv-head{display:flex!important;align-items:flex-start!important;gap:10px!important;padding:16px 16px 12px!important}
      .pv-head-copy{min-width:0!important;flex:1 1 auto!important;display:flex!important;flex-direction:column!important;gap:2px!important}
      .pv-title{font-size:14px!important;font-weight:600!important;letter-spacing:.01em!important;line-height:1.35!important;
        color:var(--dsw-alias-label-primary)!important}
      .pv-sub{font-size:11.5px!important;line-height:1.45!important;
        color:color-mix(in srgb,var(--dsw-alias-label-secondary) 84%,transparent)!important}
      .pv-count{flex:0 0 auto!important;height:20px!important;padding:0 7px!important;border-radius:10px!important;
        font-size:10.5px!important;font-weight:600!important;line-height:20px!important;font-variant-numeric:tabular-nums!important;
        color:var(--dsw-alias-label-secondary)!important;background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent)!important}
      .pv-close{all:unset!important;flex:0 0 auto!important;width:26px!important;height:26px!important;display:inline-flex!important;
        align-items:center!important;justify-content:center!important;border-radius:7px!important;cursor:pointer!important;
        color:var(--dsw-alias-label-secondary)!important;font-size:17px!important;line-height:1!important}
      .pv-close:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 9%,transparent)!important;
        color:var(--dsw-alias-label-primary)!important}
      .pv-close:focus-visible{outline:2px solid var(--dsw-alias-brand-primary)!important;outline-offset:1px}

      .pv-searchrow{padding:0 16px 12px!important}
      .pv-search{display:flex!important;align-items:center!important;gap:8px!important;height:34px!important;
        padding:0 10px!important;border-radius:9px!important;border:1px solid var(--dsw-alias-border-l1)!important;
        background:var(--dsw-alias-bg-layer-2)!important;transition:border-color .12s ease,box-shadow .12s ease}
      .pv-search:focus-within{border-color:var(--dsw-alias-brand-primary)!important;
        box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-brand-primary) 18%,transparent)!important}
      .pv-search svg{flex:0 0 auto!important;color:color-mix(in srgb,var(--dsw-alias-label-secondary) 80%,transparent)!important}
      .pv-search input{flex:1 1 auto!important;min-width:0!important;height:100%!important;padding:0!important;border:0!important;
        outline:0!important;background:transparent!important;color:var(--dsw-alias-label-primary)!important;
        font-size:12.5px!important;line-height:1.4!important}
      .pv-search input::placeholder{color:color-mix(in srgb,var(--dsw-alias-label-secondary) 70%,transparent)!important}
      .pv-search kbd{flex:0 0 auto!important;padding:1px 5px!important;border-radius:5px!important;font-size:10px!important;
        color:color-mix(in srgb,var(--dsw-alias-label-secondary) 82%,transparent)!important;
        border:1px solid var(--dsw-alias-border-l1)!important;font-variant-numeric:tabular-nums!important}

      .pv-list{list-style:none!important;margin:0!important;padding:0 8px 8px!important;overflow-y:auto!important;
        flex:1 1 auto!important;min-height:0!important;display:flex!important;flex-direction:column!important;gap:2px!important;
        scrollbar-width:thin!important;scrollbar-color:color-mix(in srgb,var(--dsw-alias-label-primary) 20%,transparent) transparent!important}
      .pv-list::-webkit-scrollbar{width:10px!important}
      .pv-list::-webkit-scrollbar-thumb{background:color-mix(in srgb,var(--dsw-alias-label-primary) 16%,transparent)!important;
        border-radius:5px!important;border:3px solid transparent!important;background-clip:padding-box!important}

      .pv-item{position:relative!important;display:flex!important;gap:10px!important;align-items:flex-start!important;
        padding:10px 12px!important;border-radius:11px!important;border:1px solid transparent!important;cursor:pointer!important;
        transition:background-color .1s ease,border-color .1s ease}
      .pv-item:hover,.pv-item[data-active="1"]{background:color-mix(in srgb,var(--dsw-alias-label-primary) 6.5%,transparent)!important}
      .pv-item[data-active="1"]{border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 26%,transparent)!important}
      .pv-item[data-live="1"]{background:color-mix(in srgb,var(--dsw-alias-brand-primary) 8%,transparent)!important;
        border-color:color-mix(in srgb,var(--dsw-alias-brand-primary) 26%,transparent)!important}
      .pv-item-main{flex:1 1 auto!important;min-width:0!important;display:flex!important;flex-direction:column!important;gap:5px!important}
      .pv-textrow{display:flex!important;align-items:baseline!important;gap:7px!important;min-width:0!important;padding-right:82px!important}
      .pv-live{flex:0 0 auto!important;display:inline-block!important;height:16px!important;padding:0 5px!important;border-radius:4px!important;
        font-size:9.5px!important;font-weight:600!important;line-height:16px!important;color:var(--dsw-alias-brand-primary)!important;
        background:color-mix(in srgb,var(--dsw-alias-brand-primary) 14%,transparent)!important}
      .pv-text{flex:1 1 auto!important;min-width:0!important;display:-webkit-box!important;-webkit-line-clamp:2!important;
        -webkit-box-orient:vertical!important;overflow:hidden!important;white-space:pre-wrap!important;overflow-wrap:anywhere!important;
        font-size:12.8px!important;line-height:1.55!important;color:var(--dsw-alias-label-primary)!important}
      .pv-muted{color:color-mix(in srgb,var(--dsw-alias-label-secondary) 80%,transparent)!important}

      .pv-atts{display:flex!important;align-items:center!important;gap:5px!important;flex-wrap:wrap!important;padding-right:82px!important}
      .pv-thumb{position:relative!important;width:32px!important;height:32px!important;flex:0 0 auto!important;border-radius:7px!important;
        overflow:hidden!important;border:1px solid var(--dsw-alias-border-l1)!important;
        background:var(--dsw-alias-bg-layer-2)!important;display:flex!important;align-items:center!important;justify-content:center!important}
      .pv-thumb img{width:100%!important;height:100%!important;object-fit:cover!important;display:block!important}
      .pv-thumb-file{font-size:8px!important;font-weight:700!important;line-height:1!important;text-transform:uppercase!important;
        color:color-mix(in srgb,var(--dsw-alias-label-secondary) 88%,transparent)!important;letter-spacing:.02em!important}
      .pv-thumb[data-pending="1"]{background:color-mix(in srgb,var(--dsw-alias-label-primary) 7%,transparent)!important}
      .pv-thumb[data-missing="1"]{border-style:dashed!important;color:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 80%,transparent)!important}
      .pv-more{height:22px!important;padding:0 6px!important;border-radius:6px!important;font-size:10.5px!important;
        line-height:22px!important;color:var(--dsw-alias-label-secondary)!important;
        background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent)!important}

      .pv-meta{display:flex!important;align-items:center!important;gap:6px!important;flex-wrap:wrap!important;
        font-size:10.8px!important;line-height:1.4!important;font-variant-numeric:tabular-nums!important;
        color:color-mix(in srgb,var(--dsw-alias-label-secondary) 80%,transparent)!important}
      .pv-dot{opacity:.55!important}
      .pv-chip{display:inline-flex!important;align-items:center!important;gap:4px!important;max-width:200px!important;
        height:18px!important;padding:0 6px!important;border-radius:5px!important;font-size:10.2px!important;line-height:18px!important;
        white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;
        color:color-mix(in srgb,var(--dsw-alias-label-secondary) 94%,transparent)!important;
        background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent)!important}
      .pv-chip[data-kind="model"]{color:color-mix(in srgb,var(--dsw-alias-brand-primary) 88%,var(--dsw-alias-label-primary))!important;
        background:color-mix(in srgb,var(--dsw-alias-brand-primary) 10%,transparent)!important}
      .pv-chip[data-kind="permission"]{color:color-mix(in srgb,var(--dsw-alias-state-success-primary) 70%,var(--dsw-alias-label-primary))!important;
        background:color-mix(in srgb,var(--dsw-alias-state-success-primary) 10%,transparent)!important}
      .pv-chip[data-kind="mode"]{color:color-mix(in srgb,var(--dsw-alias-label-primary) 88%,transparent)!important;
        background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent)!important}

      .pv-acts{position:absolute!important;top:7px!important;right:7px!important;display:flex!important;gap:1px!important;
        padding:2px!important;border-radius:8px!important;background:var(--dsw-alias-bg-layer-2)!important;
        border:1px solid var(--dsw-alias-border-l1)!important;opacity:0!important;pointer-events:none!important;
        transition:opacity .1s ease}
      .pv-item:hover .pv-acts,.pv-item[data-active="1"] .pv-acts,.pv-item:focus-within .pv-acts{opacity:1!important;
        pointer-events:auto!important}
      .pv-act{all:unset!important;width:24px!important;height:24px!important;display:inline-flex!important;align-items:center!important;
        justify-content:center!important;border-radius:5px!important;cursor:pointer!important;
        color:var(--dsw-alias-label-secondary)!important}
      .pv-act:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 10%,transparent)!important;
        color:var(--dsw-alias-label-primary)!important}
      .pv-act[data-tone="danger"]:hover{color:var(--dsw-alias-state-error-primary)!important;
        background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)!important}
      .pv-act:focus-visible{outline:2px solid var(--dsw-alias-brand-primary)!important;outline-offset:1px}
      .pv-act:disabled{opacity:.4!important;cursor:default!important}

      .pv-empty{display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;
        gap:8px!important;padding:46px 28px 52px!important;text-align:center!important}
      .pv-empty-icon{color:color-mix(in srgb,var(--dsw-alias-label-secondary) 58%,transparent)!important;
        margin-bottom:2px!important}
      .pv-empty-title{font-size:13px!important;font-weight:600!important;color:var(--dsw-alias-label-primary)!important}
      .pv-empty-body{max-width:320px!important;font-size:11.8px!important;line-height:1.6!important;
        color:color-mix(in srgb,var(--dsw-alias-label-secondary) 86%,transparent)!important}

      .pv-foot{display:flex!important;align-items:center!important;gap:8px!important;padding:10px 16px!important;
        border-top:1px solid var(--dsw-alias-border-l1)!important;font-size:11px!important;line-height:1.45!important;
        color:color-mix(in srgb,var(--dsw-alias-label-secondary) 82%,transparent)!important;min-height:42px!important}
      .pv-foot-note{flex:1 1 auto!important;min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;
        white-space:nowrap!important}
      .pv-foot kbd{display:inline-block!important;padding:1px 5px!important;border-radius:5px!important;font-size:10px!important;
        border:1px solid var(--dsw-alias-border-l1)!important;font-variant-numeric:tabular-nums!important;margin-right:6px!important}
      .pv-clear{all:unset!important;flex:0 0 auto!important;height:24px!important;padding:0 8px!important;border-radius:6px!important;
        font-size:11px!important;line-height:24px!important;cursor:pointer!important;
        color:color-mix(in srgb,var(--dsw-alias-label-secondary) 90%,transparent)!important}
      .pv-clear:hover{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 10%,transparent)!important;
        color:var(--dsw-alias-state-error-primary)!important}
      .pv-clear:disabled{opacity:.4!important;cursor:default!important}
      .pv-clear:focus-visible{outline:2px solid var(--dsw-alias-brand-primary)!important;outline-offset:1px}

      .pv-confirm{display:flex!important;align-items:center!important;gap:8px!important;width:100%!important}
      .pv-confirm-text{flex:1 1 auto!important;min-width:0!important;font-size:11.5px!important;
        color:var(--dsw-alias-label-primary)!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important}
      .pv-confirm-text small{display:block!important;font-size:10.5px!important;
        color:color-mix(in srgb,var(--dsw-alias-label-secondary) 84%,transparent)!important;white-space:normal!important}
      .pv-btn{all:unset!important;flex:0 0 auto!important;height:26px!important;padding:0 10px!important;border-radius:6px!important;
        font-size:11.5px!important;line-height:26px!important;cursor:pointer!important;
        color:var(--dsw-alias-label-secondary)!important;border:1px solid var(--dsw-alias-border-l1)!important}
      .pv-btn:hover{background:color-mix(in srgb,var(--dsw-alias-label-primary) 8%,transparent)!important;
        color:var(--dsw-alias-label-primary)!important}
      .pv-btn-danger{color:var(--dsw-alias-state-error-primary)!important;border-color:color-mix(in srgb,var(--dsw-alias-state-error-primary) 38%,transparent)!important}
      .pv-btn-danger:hover{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)!important;
        color:var(--dsw-alias-state-error-primary)!important}
      .pv-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary)!important;outline-offset:1px}

      .pv-hover{position:fixed!important;z-index:2147483002!important;width:min(430px,calc(100vw - 32px))!important;
        max-height:min(62vh,540px)!important;overflow-y:auto!important;padding:14px 15px!important;border-radius:13px!important;
        background:var(--dsw-alias-bg-layer-2)!important;color:var(--dsw-alias-label-primary)!important;
        border:1px solid var(--dsw-alias-border-l2)!important;font-size:12px!important;line-height:1.55!important;
        scrollbar-width:thin!important;animation:pv-fade .1s ease-out}
      .pv-hover[data-scheme="dark"]{box-shadow:0 18px 48px rgba(0,0,0,.62)!important}
      .pv-hover[data-scheme="light"]{box-shadow:0 18px 44px rgba(15,23,42,.2)!important}
      .pv-hover-head{display:flex!important;align-items:center!important;gap:8px!important;flex-wrap:wrap!important;
        margin-bottom:7px!important;padding-bottom:7px!important;border-bottom:1px solid var(--dsw-alias-border-l1)!important}
      .pv-hover-time{font-size:11px!important;font-variant-numeric:tabular-nums!important;
        color:color-mix(in srgb,var(--dsw-alias-label-secondary) 84%,transparent)!important}
      .pv-hover-text{white-space:pre-wrap!important;overflow-wrap:anywhere!important;font-size:12.5px!important;
        line-height:1.62!important;color:var(--dsw-alias-label-primary)!important}
      .pv-hover-section{margin-top:10px!important;padding-top:8px!important;border-top:1px solid var(--dsw-alias-border-l1)!important}
      .pv-hover-label{font-size:10px!important;font-weight:600!important;letter-spacing:.04em!important;text-transform:uppercase!important;
        color:color-mix(in srgb,var(--dsw-alias-label-secondary) 78%,transparent)!important;margin-bottom:5px!important}
      .pv-hover-row{display:flex!important;align-items:center!important;gap:7px!important;padding:3px 0!important;min-width:0!important}
      .pv-hover-name{flex:1 1 auto!important;min-width:0!important;overflow:hidden!important;text-overflow:ellipsis!important;
        white-space:nowrap!important}
      .pv-hover-size{flex:0 0 auto!important;font-size:10.5px!important;
        color:color-mix(in srgb,var(--dsw-alias-label-secondary) 76%,transparent)!important}
      .pv-hover-chips{display:flex!important;flex-wrap:wrap!important;gap:5px!important}

      .pv-toast{position:fixed!important;left:50%!important;bottom:88px!important;transform:translateX(-50%)!important;
        z-index:2147483003!important;max-width:min(540px,86vw)!important;padding:8px 13px!important;border-radius:9px!important;
        font-size:12px!important;line-height:1.4!important;background:var(--dsw-alias-bg-layer-2)!important;
        color:var(--dsw-alias-label-primary)!important;border:1px solid var(--dsw-alias-border-l2)!important;
        pointer-events:none!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
      .pv-toast[data-scheme="dark"]{box-shadow:0 12px 32px rgba(0,0,0,.5)!important}
      .pv-toast[data-scheme="light"]{box-shadow:0 12px 28px rgba(15,23,42,.16)!important}

      /* Command-list surface: anchored above the composer like the + menu. */
      .pv-backdrop{display:flex!important;align-items:flex-end!important;justify-content:flex-start!important;padding:0!important;
        background:transparent!important}
      .pv-backdrop[data-scheme="dark"]{background:transparent!important}
      .pv-backdrop[data-scheme="light"]{background:transparent!important}
      .pv-panel{position:fixed!important;width:var(--pv-w,min(720px,calc(100vw - 24px)))!important;
        max-height:var(--pv-h,520px)!important;padding:4px!important;
        animation:pv-pop .12s ease-out}
      .pv-panel[data-pv-surface="fallback"]{border:0!important;border-radius:var(--dsw-radius-lg,10px)!important;
        background:var(--dsw-alias-bg-layer-2)!important;box-shadow:var(--dsw-elevation-prominent)!important}
      .pv-backdrop[data-scheme="dark"] .pv-panel[data-pv-surface="fallback"],
      .pv-backdrop[data-scheme="light"] .pv-panel[data-pv-surface="fallback"]{box-shadow:var(--dsw-elevation-prominent)!important}
      .pv-top{display:flex!important;align-items:center!important;gap:2px!important;flex:0 0 auto!important;padding:1px!important}
      .pv-search{display:flex!important;align-items:center!important;gap:6px!important;flex:1 1 auto!important;min-width:0!important;
        height:auto!important;padding:5px 7px!important;border:0!important;border-radius:var(--dsw-radius-md)!important;
        background:transparent!important;box-shadow:none!important;transition:background-color .12s ease}
      .pv-search:focus-within{background:color-mix(in srgb,var(--dsw-alias-label-primary) 5%,transparent)!important;
        border:0!important;box-shadow:none!important}
      .pv-search svg{flex:0 0 auto!important;color:var(--dsw-alias-label-tertiary)!important}
      .pv-search input{flex:1 1 auto!important;min-width:0!important;height:auto!important;padding:0!important;border:0!important;
        outline:0!important;background:transparent!important;color:var(--dsw-alias-label-primary)!important;
        font-size:12px!important;line-height:1.5!important}
      .pv-search input::placeholder{color:var(--dsw-alias-label-tertiary)!important}
      .pv-search kbd{flex:0 0 auto!important;padding:0 4px!important;border:0!important;border-radius:3px!important;
        font-size:9px!important;line-height:14px!important;color:var(--dsw-alias-label-tertiary)!important;
        background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent)!important}
      .pv-count{flex:0 0 auto!important;padding:0 4px!important;font-size:10.5px!important;line-height:22px!important;
        color:var(--dsw-alias-label-tertiary)!important;font-variant-numeric:tabular-nums!important}
      .pv-tool{all:unset!important;flex:0 0 auto!important;display:inline-flex!important;align-items:center!important;
        justify-content:center!important;height:22px!important;min-width:22px!important;padding:0 6px!important;
        border-radius:6px!important;cursor:pointer!important;font-size:11px!important;line-height:22px!important;
        color:var(--dsw-alias-label-tertiary)!important}
      .pv-tool:hover{background:var(--dsw-alias-interactive-bg-hover)!important;color:var(--dsw-alias-label-primary)!important}
      .pv-tool[data-tone="danger"]:hover{background:color-mix(in srgb,var(--dsw-alias-state-error-primary) 12%,transparent)!important;
        color:var(--dsw-alias-state-error-primary)!important}
      .pv-tool:focus-visible{outline:2px solid var(--dsw-alias-brand-primary)!important;outline-offset:1px}
      .pv-tool:disabled{opacity:.4!important;cursor:default!important}

      .pv-list{padding:2px 0 0!important;gap:0!important;display:block!important}
      .pv-group-label{display:block!important;padding:8px 8px 3px!important;font-size:11px!important;font-weight:500!important;
        line-height:16px!important;letter-spacing:.01em!important;color:var(--dsw-alias-label-tertiary)!important}
      .pv-item{align-items:center!important;gap:8px!important;padding:7px 8px!important;
        border:0!important;border-radius:var(--dsw-radius-md)!important;font-size:13px!important;line-height:1.5!important}
      .pv-item:hover,.pv-item[data-active="1"]{background:var(--dsw-alias-interactive-bg-hover)!important;
        border:0!important}
      .pv-item[data-live="1"]{background:transparent!important;border:0!important}
      .pv-item[data-live="1"]:hover,.pv-item[data-live="1"][data-active="1"]{background:var(--dsw-alias-interactive-bg-hover)!important}
      .pv-item-main{flex-direction:row!important;align-items:center!important;gap:8px!important}
      .pv-text{display:block!important;flex:1 1 auto!important;min-width:0!important;white-space:nowrap!important;
        overflow:hidden!important;text-overflow:ellipsis!important;font-size:13px!important;line-height:1.5!important;
        -webkit-line-clamp:unset!important;padding:0!important}
      .pv-live{height:15px!important;padding:0 5px!important;border-radius:3px!important;font-size:9px!important;
        font-weight:600!important;line-height:15px!important;letter-spacing:.03em!important}
      .pv-atts{gap:3px!important;padding:0!important;flex-wrap:nowrap!important;flex:0 0 auto!important}
      .pv-thumb{width:20px!important;height:20px!important;border-radius:4px!important}
      .pv-thumb-file{font-size:7px!important;letter-spacing:0!important}
      .pv-more{height:18px!important;padding:0 4px!important;font-size:9px!important;line-height:18px!important}
      .pv-detail{flex:0 0 auto!important;max-width:42%!important;overflow:hidden!important;text-overflow:ellipsis!important;
        white-space:nowrap!important;color:var(--dsw-alias-label-tertiary)!important;font-size:11px!important;
        font-variant-numeric:tabular-nums!important}
      .pv-item:hover .pv-detail,.pv-item[data-active="1"] .pv-detail{opacity:0!important}

      .pv-acts{top:50%!important;right:3px!important;transform:translateY(-50%)!important;padding:2px!important;
        border-radius:6px!important;background:var(--dsw-alias-bg-layer-2)!important;border:0!important;
        box-shadow:0 0 0 1px var(--dsw-alias-border-l1)!important}
      .pv-act{width:22px!important;height:22px!important;border-radius:5px!important}

      .pv-empty{padding:26px 16px 30px!important;gap:6px!important}
      .pv-empty-title{font-size:12px!important}
      .pv-empty-body{font-size:11px!important;max-width:280px!important}

      .pv-confirm{display:flex!important;align-items:center!important;gap:7px!important;margin-top:3px!important;
        padding:7px 8px!important;border-top:1px solid var(--dsw-alias-border-l1)!important;flex:0 0 auto!important}
      .pv-confirm-text{font-size:11px!important}
      .pv-confirm-text small{font-size:10px!important}
      .pv-btn{height:24px!important;padding:0 9px!important;border-radius:6px!important;font-size:11px!important;line-height:24px!important}
      .pv-hint{display:flex!important;align-items:center!important;gap:6px!important;flex:0 0 auto!important;
        margin-top:2px!important;padding:4px 8px 2px!important;border-top:1px solid var(--dsw-alias-border-l1)!important;
        font-size:10.5px!important;line-height:1.4!important;color:var(--dsw-alias-label-tertiary)!important}
      .pv-hint kbd{padding:0 4px!important;border:0!important;border-radius:3px!important;font-size:9px!important;
        line-height:14px!important;color:var(--dsw-alias-label-tertiary)!important;
        background:color-mix(in srgb,var(--dsw-alias-label-primary) 6%,transparent)!important}

      @keyframes pv-fade{from{opacity:0}to{opacity:1}}
      @keyframes pv-pop{from{opacity:0;transform:translateY(4px) scale(.994)}to{opacity:1;transform:none}}
      @media (prefers-reduced-motion:reduce){
        .pv-backdrop,.pv-panel,.pv-hover{animation:none!important}
      }
      @media (hover:none){
        .pv-acts{opacity:1!important;pointer-events:auto!important}
      }
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
     * Icons
     * ------------------------------------------------------------------ */

    // A plain clock: one continuous circle plus two hands. No arrowheads,
    // notches or count badge that turn into visual noise at 18px.
    const ICON_PATHS = [
      'M10 3.1a6.9 6.9 0 1 0 0 13.8 6.9 6.9 0 0 0 0-13.8Z',
      'M10 6.5v3.7l2.4 1.5',
    ];

    const ACTION_PATHS = {
      restore: ['M8 2.6v7.1', 'M4.9 6.7 8 9.8l3.1-3.1', 'M2.9 12.7h10.2'],
      copy: ['M5.6 5.6h6.8v6.8H5.6z', 'M3.6 10.4V3.6h6.8'],
      trash: ['M2.9 4.4h10.2', 'M6 4.4V2.9h4v1.5', 'M4.4 4.4l.7 8.7h5.8l.7-8.7', 'M6.6 6.8v4.2', 'M9.4 6.8v4.2'],
      search: ['M7.2 12a4.8 4.8 0 1 0 0-9.6 4.8 4.8 0 0 0 0 9.6Z', 'M10.7 10.7 13.6 13.6'],
    };

    function Icon(props) {
      const { paths, size = 16, strokeWidth = 1.5, className } = props;
      return h(
        'svg',
        {
          viewBox: '0 0 16 16',
          width: String(size),
          height: String(size),
          fill: 'none',
          stroke: 'none',
          focusable: 'false',
          'aria-hidden': 'true',
          className,
          style: { display: 'block', width: size, height: size, fill: 'none' },
        },
        paths.map((d, index) =>
          h('path', {
            key: index,
            d,
            fill: 'none',
            stroke: 'currentColor',
            'stroke-width': String(strokeWidth),
            'stroke-linecap': 'round',
            'stroke-linejoin': 'round',
            style: {
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            },
          }),
        ),
      );
    }

    function TriggerIcon(props) {
      const size = props.size || 18;
      return h(
        'svg',
        {
          viewBox: '0 0 20 20',
          width: String(size),
          height: String(size),
          fill: 'none',
          stroke: 'none',
          focusable: 'false',
          'aria-hidden': 'true',
          style: { display: 'block', width: size, height: size, fill: 'none' },
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
            style: {
              fill: 'none',
              stroke: 'currentColor',
              strokeWidth: 1.5,
              strokeLinecap: 'round',
              strokeLinejoin: 'round',
            },
          }),
        ),
      );
    }

    /* ------------------------------------------------------------------ *
     * Entry rendering
     * ------------------------------------------------------------------ */

    function fileExtension(name) {
      const match = /\.([a-z0-9]{1,5})$/i.exec(name || '');
      return match ? match[1].toUpperCase() : 'FILE';
    }

    function AttachmentThumb(props) {
      const { attachment, size = 32 } = props;
      const url = useBlobUrl(attachment);
      const pending = attachment.pending === true && !url;
      const missing = attachment.missing === true || url === 'missing';
      const isImage = attachment.kind === 'image';
      const style = { width: size, height: size };
      const label = attachment.name || 'file';
      return h(
        'span',
        {
          className: 'pv-thumb',
          style,
          title: label,
          'data-pending': pending ? '1' : '0',
          'data-missing': missing ? '1' : '0',
        },
        isImage && url && url !== 'missing'
          ? h('img', { src: url, alt: label, loading: 'lazy' })
          : h('span', { className: 'pv-thumb-file' }, missing ? '!' : isImage ? 'IMG' : fileExtension(label)),
      );
    }

    function AttachmentStrip(props) {
      const attachments = props.attachments || [];
      if (attachments.length === 0) return null;
      const shown = attachments.slice(0, props.limit || 4);
      const rest = attachments.length - shown.length;
      return h(
        'div',
        { className: 'pv-atts' },
        shown.map((attachment, index) =>
          h(AttachmentThumb, { key: attachment.key || index, attachment, size: props.size || 32 }),
        ),
        rest > 0 ? h('span', { className: 'pv-more' }, '+' + rest) : null,
      );
    }

    function Item(props) {
      const { entry, active, busy, onActivate, onInsert, onCopy, onRemove } = props;
      const text = entry.text || '';
      const attachments = entry.attachments || [];
      return h(
        'li',
        {
          className: 'pv-item',
          'data-id': entry.id,
          'data-active': active ? '1' : '0',
          'data-live': entry.live ? '1' : '0',
          onMouseEnter: (event) => {
            onActivate(entry.id);
            if (props.onHover) props.onHover(entry, event.currentTarget);
          },
          onMouseLeave: props.onLeave,
          onClick: () => onInsert(entry),
        },
        h(
          'div',
          { className: 'pv-item-main' },
          entry.live && !entry.isCurrent ? h('span', { className: 'pv-live' }, t('draft')) : null,
          h(
            'span',
            { className: 'pv-text', title: text || t('attachmentsOnly') },
            text || h('span', { className: 'pv-muted' }, t('attachmentsOnly')),
          ),
          h(AttachmentStrip, { attachments, size: 20, limit: 3 }),
          h(
            'span',
            { className: 'pv-detail' },
            formatTime(entry.at) + (text ? ' · ' + text.length + ' ' + t('chars') : ''),
          ),
        ),
        h(
          'div',
          { className: 'pv-acts', onClick: (event) => event.stopPropagation() },
          h(
            'button',
            {
              type: 'button',
              className: 'pv-act',
              title: t('insert'),
              'aria-label': t('insert'),
              disabled: busy,
              onClick: (event) => {
                event.stopPropagation();
                onInsert(entry);
              },
            },
            h(Icon, { paths: ACTION_PATHS.restore, size: 15 }),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'pv-act',
              title: t('copy'),
              'aria-label': t('copy'),
              onClick: (event) => {
                event.stopPropagation();
                onCopy(entry);
              },
            },
            h(Icon, { paths: ACTION_PATHS.copy, size: 15 }),
          ),
          entry.live
            ? null
            : h(
                'button',
                {
                  type: 'button',
                  className: 'pv-act',
                  'data-tone': 'danger',
                  title: t('remove'),
                  'aria-label': t('remove'),
                  onClick: (event) => {
                    event.stopPropagation();
                    onRemove(entry.id);
                  },
                },
                h(Icon, { paths: ACTION_PATHS.trash, size: 15 }),
              ),
        ),
      );
    }

    function HoverCard(props) {
      const { entry, rect, scheme } = props;
      const width = 430;
      const margin = 12;
      let left = rect.right + 14;
      if (left + width > window.innerWidth - margin) left = Math.max(margin, rect.left - width - 14);
      let top = Math.max(margin, rect.top);
      const estimated = 320;
      if (top + estimated > window.innerHeight - margin) {
        top = Math.max(margin, window.innerHeight - estimated - margin);
      }
      const settings = entry.settings;
      return h(
        'div',
        {
          className: 'pv-hover',
          'data-scheme': scheme,
          style: { left: left + 'px', top: top + 'px' },
          onMouseDown: (event) => event.stopPropagation(),
          onMouseEnter: props.onMouseEnter,
          onMouseLeave: props.onMouseLeave,
        },
        h(
          'div',
          { className: 'pv-hover-head' },
          entry.live ? h('span', { className: 'pv-live' }, entry.isCurrent ? t('current') : t('draft')) : null,
          h('span', { className: 'pv-hover-time' }, formatTime(entry.at)),
          entry.text ? h('span', { className: 'pv-hover-time' }, entry.text.length + ' ' + t('chars')) : null,
          h('span', { className: 'pv-hover-time', style: { marginLeft: 'auto' } }, entry.text ? '' : t('attachmentsOnly')),
        ),
        h('div', { className: 'pv-hover-text' }, entry.text || h('span', { className: 'pv-muted' }, t('attachmentsOnly'))),
        (entry.attachments || []).length > 0
          ? h(
              'div',
              { className: 'pv-hover-section' },
              h('div', { className: 'pv-hover-label' }, t('attachments')),
              (entry.attachments || []).map((attachment, index) =>
                h(
                  'div',
                  { key: attachment.key || index, className: 'pv-hover-row' },
                  h(AttachmentThumb, { attachment, size: 26 }),
                  h('span', { className: 'pv-hover-name', title: attachment.name }, attachment.name || 'file'),
                  h(
                    'span',
                    { className: 'pv-hover-size' },
                    attachment.missing ? t('missingAttachment') : formatBytes(attachment.size),
                  ),
                ),
              ),
            )
          : null,
        settings
          ? h(
              'div',
              { className: 'pv-hover-section' },
              h('div', { className: 'pv-hover-label' }, t('settings')),
              h(
                'div',
                { className: 'pv-hover-chips' },
                settings.model
                  ? h(
                      'span',
                      { className: 'pv-chip', 'data-kind': 'model' },
                      t('model') + ' · ' + [settings.model.provider, settings.model.model].filter(Boolean).join(' / ') +
                        (settings.model.reasoningEffort ? ' · ' + effortLabel(settings.model.reasoningEffort) : ''),
                    )
                  : null,
                settings.permission
                  ? h(
                      'span',
                      { className: 'pv-chip', 'data-kind': 'permission' },
                      t('permission') + ' · ' + permissionLabel(settings.permission),
                    )
                  : null,
                settings.agentPreset
                  ? h(
                      'span',
                      { className: 'pv-chip', 'data-kind': 'mode' },
                      t('mode') + ' · ' + presetLabel(settings.agentPreset),
                    )
                  : null,
              ),
            )
          : null,
      );
    }

    /* ------------------------------------------------------------------ *
     * Composer tracker
     * ------------------------------------------------------------------ */

    function DraftTracker(props) {
      const state = props.useInput((value) => value);
      const draft = textOf(state);
      const sessionId = props.sessionId || null;
      const attachmentIds = state && Array.isArray(state.attachmentIds) ? state.attachmentIds : [];
      const attachmentKey = attachmentIds.join('|');
      const phase = state && state.phase ? state.phase : 'plain';
      const stateRef = useRef(null);
      const previousInfo = useRef({ text: '', references: [], command: null, ids: [], sessionId: null });
      const previousPhase = useRef('plain');
      const holdTimer = useRef(null);
      const mounted = useRef(true);

      stateRef.current = { state, sessionId };
      lastState = { state, sessionId };
      lastDraft = draft;
      activeSessionId = sessionId || activeSessionId;

      useEffect(() => {
        if (!sessionId) return;
        publishComposer(sessionId, props.inputActions);
      }, [sessionId, props.inputActions]);

      // Resolve and persist attachment bytes as soon as the rail changes; the
      // snapshot itself is written on the debounce below.
      useEffect(() => {
        if (sessionId && attachmentIds.length > 0) rememberAttachments(sessionId, attachmentIds);
      }, [sessionId, attachmentKey]);

      // Debounced live snapshot. One write per pause, never one per keystroke.
      useEffect(() => {
        if (!sessionId) return undefined;
        if (holdTimer.current) window.clearTimeout(holdTimer.current);
        holdTimer.current = window.setTimeout(() => {
          holdTimer.current = null;
          if (!mounted.current) return;
          const snapshot = buildSnapshotFrom(stateRef.current.state, sessionId);
          lastCapture = snapshot;
          setLiveSnapshot(snapshot);
        }, HOLD_MS);
        return () => {
          if (holdTimer.current) {
            window.clearTimeout(holdTimer.current);
            holdTimer.current = null;
          }
        };
      }, [draft, attachmentKey, sessionId]);

      // Sending freezes the draft: flush the full snapshot before the composer
      // clears its text and releases its attachments.
      useEffect(() => {
        if (!sessionId) return;
        if (previousPhase.current === 'plain' && phase !== 'plain') {
          if (holdTimer.current) {
            window.clearTimeout(holdTimer.current);
            holdTimer.current = null;
          }
          const snapshot = buildSnapshotFrom(stateRef.current.state, sessionId);
          lastCapture = snapshot;
          setLiveSnapshot(snapshot);
        }
        previousPhase.current = phase;
      }, [phase, sessionId]);

      // Retire only whole drafts: on clear, send, session switch or unmount.
      useEffect(() => {
        const before = previousInfo.current;
        if (before.sessionId && before.sessionId !== sessionId) {
          retireParts(before);
        }
        if (before.sessionId === sessionId && normalize(before.text) !== '' && normalize(draft) === '') {
          if (before.ids.length > 0) rememberAttachments(sessionId, before.ids);
          retireParts(before);
        }
        if (sessionId && live && live.sessionId !== sessionId) setLiveSnapshot(null);
        previousInfo.current = {
          text: draft,
          references: referencesOf(state),
          command: commandOf(state),
          ids: [...attachmentIds],
          sessionId,
        };
      }, [draft, attachmentKey, sessionId]);

      useEffect(() => {
        const flush = () => {
          if (!lastState || !lastState.sessionId) return;
          const snapshot = buildSnapshotFrom(lastState.state, lastState.sessionId);
          lastCapture = snapshot;
          setLiveSnapshot(snapshot);
          retireSnapshot(snapshot);
        };
        const onVisibility = () => {
          if (document.visibilityState === 'hidden') {
            const snapshot = buildSnapshotFrom(lastState ? lastState.state : null, lastState ? lastState.sessionId : null);
            if (snapshot.text || snapshot.attachments.length) {
              lastCapture = snapshot;
              setLiveSnapshot(snapshot);
            }
          }
        };
        window.addEventListener('pagehide', flush);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
          mounted.current = false;
          window.removeEventListener('pagehide', flush);
          document.removeEventListener('visibilitychange', onVisibility);
          if (holdTimer.current) window.clearTimeout(holdTimer.current);
          flush();
        };
      }, []);

      return null;
    }

    /* ------------------------------------------------------------------ *
     * Trigger
     * ------------------------------------------------------------------ */

    // The panel is a popover, not a centered modal: measure the trigger so the
    // card opens upward, with the same compact rhythm as the composer + menu.
    let panelFrame = null;

    function measurePanelFrame() {
      if (typeof window === 'undefined') return { left: 12, width: 360, bottom: 96, maxHeight: 420 };
      const node = typeof document !== 'undefined' ? document.querySelector('.pv-trigger') : null;
      const rect = node && node.getBoundingClientRect ? node.getBoundingClientRect() : null;
      const width = Math.min(860, Math.max(320, window.innerWidth - 48));
      const left = rect
        ? Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))
        : Math.max(12, (window.innerWidth - width) / 2);
      const bottom = rect ? Math.max(12, window.innerHeight - rect.top + 6) : 96;
      return { left, width, bottom, maxHeight: Math.max(220, Math.min(520, bottom - 16)) };
    }

    function dayBucket(at) {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
      if (at >= start) return 'today';
      if (at >= start - 86400000) return 'yesterday';
      return 'earlier';
    }

    function Trigger(props) {
      const open = useUiOpen();
      return h(
        'button',
        {
          type: 'button',
          className: 'pv-trigger',
          'data-open': open ? '1' : '0',
          title: t('triggerHint'),
          'aria-label': t('open'),
          onClick: () => {
            publishComposer(props.sessionId, props.inputActions);
            panelFrame = open ? null : measurePanelFrame();
            setOpen(!open);
          },
        },
        h(TriggerIcon, { size: 18 }),
      );
    }

    /* ------------------------------------------------------------------ *
     * Panel
     * ------------------------------------------------------------------ */

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

    function copyText(text) {
      const clipboard = navigator.clipboard;
      if (clipboard && clipboard.writeText) {
        return clipboard.writeText(text).then(
          () => true,
          () => false,
        );
      }
      return Promise.resolve(false);
    }

    function Panel() {
      const open = useUiOpen();
      const history = useEntries();
      const liveDraft = useLive();
      const scheme = useScheme();
      const [query, setQuery] = useState('');
      const [activeId, setActiveId] = useState(null);
      const [confirming, setConfirming] = useState(false);
      const [restoringId, setRestoringId] = useState(null);
      const [hover, setHover] = useState(null);
      const [frameRevision, setFrameRevision] = useState(0);
      const searchRef = useRef(null);
      const panelRef = useRef(null);
      const listRef = useRef(null);
      const showTimer = useRef(null);
      const hideTimer = useRef(null);

      const rows = useMemo(() => {
        const needle = query.trim().toLowerCase();
        const liveCount =
          lastState && lastState.state && Array.isArray(lastState.state.attachmentIds)
            ? lastState.state.attachmentIds.length
            : 0;
        const isCurrent =
          !!liveDraft &&
          liveDraft.sessionId === activeSessionId &&
          normalize(liveDraft.text) === normalize(currentDraft()) &&
          (liveDraft.attachments || []).length === liveCount;
        const draftRow =
          liveDraft && (liveDraft.text || (liveDraft.attachments || []).length > 0)
            ? {
                id: '__live',
                text: liveDraft.text,
                at: liveDraft.at,
                attachments: liveDraft.attachments || [],
                settings: liveDraft.settings,
                references: liveDraft.references,
                command: liveDraft.command,
                live: true,
                isCurrent,
              }
            : null;
        // A closed page retires the live draft too, so the same snapshot can be
        // both "current draft" and the newest history entry. Show it once; the
        // history copy reappears as soon as the composer no longer holds it.
        const liveSignature = draftRow ? entrySignature(draftRow.text, draftRow.attachments) : null;
        const list = history.filter((entry) => !liveSignature || entrySignature(entry.text, entry.attachments) !== liveSignature);
        const matches = needle ? list.filter((entry) => haystack(entry).includes(needle)) : list;
        if (draftRow && (!needle || haystack(draftRow).includes(needle))) return [draftRow, ...matches];
        return matches;
      }, [history, liveDraft, query]);

      const groups = useMemo(() => {
        const order = [];
        const map = new Map();
        for (const entry of rows) {
          const key = entry.live ? 'live' : dayBucket(entry.at);
          if (!map.has(key)) {
            map.set(key, []);
            order.push(key);
          }
          map.get(key).push(entry);
        }
        const labels = {
          live: t('groupCurrent'),
          today: t('groupToday'),
          yesterday: t('groupYesterday'),
          earlier: t('groupEarlier'),
        };
        return order.map((key) => ({ key, label: labels[key] || '', rows: map.get(key) }));
      }, [rows]);

      const frame = useMemo(
        () => (open ? panelFrame || measurePanelFrame() : null),
        [open, frameRevision],
      );

      useEffect(() => {
        if (!open) {
          panelFrame = null;
          return undefined;
        }
        const sync = () => {
          panelFrame = measurePanelFrame();
          setFrameRevision((value) => value + 1);
        };
        sync();
        window.addEventListener('resize', sync);
        return () => window.removeEventListener('resize', sync);
      }, [open]);

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
        setQuery('');
        setActiveId(null);
        setConfirming(false);
        setHover(null);
        const id = window.setTimeout(() => {
          if (searchRef.current) searchRef.current.focus();
        }, 30);
        return () => window.clearTimeout(id);
      }, [open]);

      useEffect(
        () => () => {
          if (showTimer.current) window.clearTimeout(showTimer.current);
          if (hideTimer.current) window.clearTimeout(hideTimer.current);
        },
        [],
      );

      const scheduleShow = useCallback((entry, node) => {
        if (hideTimer.current) window.clearTimeout(hideTimer.current);
        if (showTimer.current) window.clearTimeout(showTimer.current);
        showTimer.current = window.setTimeout(() => {
          if (!node || !node.getBoundingClientRect) return;
          const rect = node.getBoundingClientRect();
          setHover({
            entry,
            rect: { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom },
          });
        }, 340);
      }, []);

      const scheduleHide = useCallback(() => {
        if (showTimer.current) window.clearTimeout(showTimer.current);
        if (hideTimer.current) window.clearTimeout(hideTimer.current);
        hideTimer.current = window.setTimeout(() => setHover(null), 150);
      }, []);

      const keepHover = useCallback(() => {
        if (hideTimer.current) window.clearTimeout(hideTimer.current);
      }, []);

      const onCopy = useCallback((entry) => {
        copyText(entry.text || (entry.attachments || []).map((item) => item.name).join('\n')).then((ok) => {
          toast(ok ? t('copied') : t('copyFailed'));
        });
      }, []);

      const onRemove = useCallback((id) => {
        setHover(null);
        removeEntry(id);
        setActiveId(null);
        toast(t('deleted'));
      }, []);

      const onInsert = useCallback(
        async (entry) => {
          if (restoringId) return;
          setHover(null);
          setRestoringId(entry.id);
          try {
            const result = await restoreEntry(entry);
            if (!result || !result.ok) return;
          } catch {
            toast(t('restoreFailed'));
          } finally {
            setRestoringId(null);
          }
        },
        [restoringId],
      );

      const onKeyDown = useCallback(
        (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            if (hover) {
              setHover(null);
              return;
            }
            if (confirming) {
              setConfirming(false);
              return;
            }
            setOpen(false);
            return;
          }
          if (event.key === 'Tab') {
            const root = panelRef.current;
            if (!root) return;
            const nodes = Array.from(
              root.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'),
            ).filter((node) => node.offsetParent !== null);
            if (nodes.length === 0) return;
            const first = nodes[0];
            const last = nodes[nodes.length - 1];
            if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            } else if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            }
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
        [activeId, rows, hover, confirming],
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
              MenuSurface,
              {
                className: 'pv-panel',
                role: 'dialog',
                'data-pv-surface': NATIVE_SURFACE ? 'native' : 'fallback',
                'aria-label': t('title'),
                tabIndex: -1,
                ref: panelRef,
                style: frame
                  ? {
                      left: frame.left + 'px',
                      bottom: frame.bottom + 'px',
                      '--pv-w': frame.width + 'px',
                      '--pv-h': frame.maxHeight + 'px',
                    }
                  : undefined,
                onKeyDown,
              },
              h(
                'div',
                { className: 'pv-top' },
                h(
                  'div',
                  { className: 'pv-search' },
                  h(Icon, { paths: ACTION_PATHS.search, size: 14 }),
                  h('input', {
                    ref: searchRef,
                    type: 'search',
                    value: query,
                    placeholder: t('search'),
                    'aria-label': t('search'),
                    onChange: (event) => {
                      setQuery(event.target.value);
                      setActiveId(null);
                      setHover(null);
                    },
                    onKeyDown: (event) => {
                      if (event.key === 'Enter' && rows.length > 0) {
                        event.preventDefault();
                        const target = rows.find((entry) => entry.id === activeId) || rows[0];
                        onInsert(target);
                      }
                    },
                  }),
                ),
                confirming
                  ? null
                  : h(
                      'button',
                      {
                        type: 'button',
                        className: 'pv-tool',
                        disabled: history.length === 0,
                        onClick: () => setConfirming(true),
                      },
                      t('clear'),
                    ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'pv-tool',
                    title: t('close'),
                    'aria-label': t('close'),
                    onClick: () => setOpen(false),
                  },
                  '×',
                ),
              ),
              h(
                'ul',
                {
                  className: 'pv-list',
                  ref: listRef,
                  onScroll: () => setHover(null),
                },
                rows.length === 0
                  ? h(
                      'li',
                      { className: 'pv-empty' },
                      h('div', { className: 'pv-empty-icon' }, h(TriggerIcon, { size: 34 })),
                      h('div', { className: 'pv-empty-title' }, t('emptyTitle')),
                      h('div', { className: 'pv-empty-body' }, history.length === 0 ? t('empty') : t('emptySearch')),
                    )
                  : groups.map((group) =>
                      h(
                        React.Fragment,
                        { key: group.key },
                        h('li', { className: 'pv-group-label', role: 'presentation' }, group.label),
                        group.rows.map((entry) =>
                          h(Item, {
                            key: entry.id,
                            entry,
                            active: entry.id === activeId,
                            busy: restoringId === entry.id,
                            onActivate: setActiveId,
                            onInsert,
                            onCopy,
                            onRemove,
                            onHover: scheduleShow,
                            onLeave: scheduleHide,
                          }),
                        ),
                      ),
                    ),
              ),
              confirming
                ? h(
                    'div',
                    { className: 'pv-confirm' },
                    h(
                      'div',
                      { className: 'pv-confirm-text' },
                      t('clearTitle'),
                      h('small', null, t('clearBody')),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'pv-btn',
                        onClick: () => setConfirming(false),
                      },
                      t('cancel'),
                    ),
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'pv-btn pv-btn-danger',
                        onClick: () => {
                          clearAll();
                          setConfirming(false);
                          setHover(null);
                          toast(t('cleared'));
                        },
                      },
                      t('confirmClear'),
                    ),
                  )
                : h(
                    'div',
                    { className: 'pv-hint' },
                    h('kbd', null, '↑↓'),
                    h('span', null, t('hintNav')),
                    h('span', null, '·'),
                    h('kbd', null, 'Enter'),
                    h('span', null, t('insert')),
                    h('span', null, '·'),
                    h('kbd', null, 'Esc'),
                    h('span', null, t('close')),
                  ),
            ),
            hover
              ? h(HoverCard, {
                  entry: hover.entry,
                  rect: hover.rect,
                  scheme,
                  onMouseEnter: keepHover,
                  onMouseLeave: scheduleHide,
                })
              : null,
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
     * Test seam
     * ------------------------------------------------------------------ */

    if (typeof window !== 'undefined' && window.__PV_TEST__) {
      window.__PV_TEST__.api = {
        isJunk,
        normalize,
        retire,
        retireSnapshot,
        setLive,
        setLiveSnapshot,
        clearAll,
        removeEntry,
        publishComposer,
        insertText,
        recallPrevious,
        currentDraft,
        entries: () => entries,
        live: () => live,
        sanitizeReferences,
        sanitizeAttachments,
        sanitizeSettings,
        draftOf,
        buildSnapshotFrom,
        formatTime,
        permissionLabel,
        presetLabel,
        reset: () => {
          entries = [];
          live = null;
          lastRetiredSignature = '';
          recall.index = -1;
          recall.at = 0;
          recall.text = '';
        },
      };
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        runtime = ctx;
        ctx.effect(() => installStyles());
        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register({ name: 'conversation.input.left', id: 'composer-rewind-tracker', order: 1 }, DraftTracker),
        );
        ctx.slots.inject('conversation.input.left', () =>
          ctx.slots.register({ name: 'conversation.input.left', id: 'composer-rewind', order: 99 }, Trigger),
        );
        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register({ name: 'shell.overlay', id: 'composer-rewind-panel', order: 90 }, Panel),
        );
        // Release object URLs when the page goes away.
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
          window.addEventListener('pagehide', () => {
            for (const url of blobUrls.values()) {
              try {
                URL.revokeObjectURL(url);
              } catch {
                /* ignore */
              }
            }
            blobUrls.clear();
          });
        }
      },
    };
  },
});
