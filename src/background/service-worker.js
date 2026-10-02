/**
 * 重做版：极简 Service Worker（v5）
 * 修复：SW keepalive（防 MV3 SW 30s 空闲被杀）
 *       tab 被杀自动恢复
 *       章节顺序基于 currentIndex+1
 */
importScripts(
  '/src/lib/jszip.min.js',
  '/src/lib/parser.js',
  '/src/lib/txt.js',
  '/src/lib/epub.js'
);

const STORE_KEY = 'ffnet_state_v3';
const KEEPALIVE_ALARM = 'ffnet-keepalive';
let state = null;
const PAGE_TIMEOUT_MS = 30000;
let watchDog = null;
let keepaliveTimer = null;

/* ---------- 持久化 ---------- */

async function loadState() {
  try {
    const r = await chrome.storage.local.get(STORE_KEY);
    return r[STORE_KEY] || null;
  } catch (_) { return null; }
}

async function saveState() {
  if (!state) return;
  state.updatedAt = Date.now();
  try { await chrome.storage.local.set({ [STORE_KEY]: state }); }
  catch (e) { console.warn('[FFNet] save state fail', e); }
}

/* ---------- 广播 ---------- */

async function broadcastToTabs() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs.sendMessage(tab.id, { type: 'FFNET_STATE_V3', state }).catch(() => {});
    }
  } catch (_) {}
}

function broadcast() { saveState(); broadcastToTabs(); }

/* ---------- Keepalive ---------- */

async function startKeepalive() {
  try {
    await chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.25 });
    console.log('[FFNet] keepalive started');
  } catch (e) { console.warn('[FFNet] keepalive fail', e); }
}

async function stopKeepalive() {
  try { await chrome.alarms.clear(KEEPALIVE_ALARM); } catch (_) {}
}

/* ---------- 状态机 ---------- */

const SAFETY_MAX_CHAPTERS = 5000;   // 绝对安全上限，超过强制停
const SAFETY_PAD = 20;             // 如果只知道 maxKnownIndex，允许再超这么多

function effectiveCount(state) {
  const a = parseInt(state.chapterCount, 10);
  if (a > 0) return a;
  const list = state.chapters || [];
  const maxKnown = list.reduce((m, c) => Math.max(m, c.index || 0), 0);
  if (maxKnown > 0) return Math.max(maxKnown + SAFETY_PAD, maxKnown + Math.ceil(maxKnown * 0.05));
  return SAFETY_MAX_CHAPTERS;
}

function newState(url, opts) {
  opts = opts || {};
  const p = FFParser.parseUrl(url);
  const initCnt = parseInt(opts.initialChapterCount, 10) || 0;
  return {
    status: 'running',
    storyId: p ? p.storyId : null,
    url,
    meta: null,
    chapterCount: initCnt,
    chapters: [],
    currentIndex: 1,
    crawlTabId: null,
    formats: ['txt'],
    error: null,
    startedAt: Date.now(),
    updatedAt: Date.now()
  };
}

function chapterUrl(storyId, idx) {
  return 'https://www.fanfiction.net/s/' + storyId + '/' + idx + '/';
}

async function goTo(idx) {
  const url = chapterUrl(state.storyId, idx);
  state.currentIndex = idx;
  broadcast();
  clearTimeout(watchDog);
  watchDog = setTimeout(() => {
    console.warn('[FFNet] 第 ' + idx + ' 章加载超时，重试');
    appendLog('第 ' + idx + ' 章加载超时，正在重试…');
    goTo(idx);
  }, PAGE_TIMEOUT_MS);

  try {
    if (!state.crawlTabId) {
      const tab = await chrome.tabs.create({ url, active: false });
      state.crawlTabId = tab.id;
      saveState();
    } else {
      try {
        await chrome.tabs.update(state.crawlTabId, { url });
      } catch (e) {
        // tab 可能已被关，重新建一个
        console.warn('[FFNet] tabs.update 失败，重建 tab', e);
        state.crawlTabId = null;
        const tab = await chrome.tabs.create({ url, active: false });
        state.crawlTabId = tab.id;
        saveState();
      }
    }
  } catch (e) {
    console.error('[FFNet] goTo nav fail', e);
    state.error = '无法打开标签页：' + (e.message || e);
    state.status = 'error';
    broadcast();
  }
}

function appendLog(text, level) {
  const prefix = level === 'err' ? '[错误] ' : '';
  console.log('[FFNet] ' + prefix + text);
}

/* ---------- 收尾 ---------- */

function safeFilename(s) {
  return (s || 'ffnet-novel').replace(/[\\/:*?"<>|\r\n\t]/g, '_').substring(0, 80);
}

async function textToBase64WithBom(text) {
  const content = '\uFEFF' + text;
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const buf = await blob.arrayBuffer();
  return arrayBufferToBase64(buf);
}

async function finishCrawl() {
  clearTimeout(watchDog);
  stopKeepalive();
  state.status = 'done';
  if (!state.chapters.length) {
    state.error = '没有抓到任何章节。请确认能正常访问 FF.net 并刷新页面重试。';
    state.status = 'error';
    broadcast();
    return;
  }
  broadcast();

  appendLog('全部 ' + state.chapters.length + ' 章抓取完毕，开始生成文件…');
  const meta = Object.assign({
    title: '小说 ' + state.storyId,
    author: 'Unknown',
    chapters: state.chapters.length,
    storyId: state.storyId
  }, state.meta || {});
  const sorted = state.chapters.slice().sort((a, b) => a.index - b.index);

  try {
    // TXT：统一用 base64 data URL，避免超长 encodeURIComponent 被截断
    const text = TxtBuilder.build(meta, sorted, {
      includeMeta: true,
      chapterSeparator: '---'
    });
    const filename = safeFilename((meta.author ? meta.author + ' - ' : '') + meta.title) + '.txt';
    try {
      const b64 = await textToBase64WithBom(text);
      await chrome.downloads.download({
        url: 'data:text/plain;charset=utf-8;base64,' + b64,
        filename: filename,
        conflictAction: 'uniquify',
        saveAs: false
      });
      appendLog('TXT 已开始下载：' + filename);
    } catch (e) {
      console.error('[FFNet] TXT 下载失败', e);
      state.error = 'TXT 下载失败：' + (e.message || e);
      state.status = 'error';
      broadcast();
    }

    // EPUB
    try {
      const epubBlob = await EpubBuilder.build(meta, sorted, {});
      const epubBuf = await epubBlob.arrayBuffer();
      const b64 = arrayBufferToBase64(epubBuf);
      const epubName = safeFilename((meta.author ? meta.author + ' - ' : '') + meta.title) + '.epub';
      try {
        await chrome.downloads.download({
          url: 'data:application/epub+zip;base64,' + b64,
          filename: epubName,
          conflictAction: 'uniquify',
          saveAs: false
        });
        appendLog('EPUB 已开始下载：' + epubName);
      } catch (e) {
        console.warn('[FFNet] EPUB 下载失败（不影响 TXT）', e);
      }
    } catch (e) {
      console.warn('[FFNet] EPUB 生成失败（不影响 TXT）', e);
    }
  } catch (e) {
    console.error('[FFNet] finish 生成文件出错', e);
    state.error = '生成文件失败：' + (e.message || e);
    state.status = 'error';
  }
  // 关抓取 tab
  if (state.crawlTabId) { try { await chrome.tabs.remove(state.crawlTabId); } catch (_) {} state.crawlTabId = null; }
  broadcast();
}

function arrayBufferToBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + CHUNK, bytes.length)));
  }
  return btoa(binary);
}

/* ---------- 命令入口 ---------- */

async function cmdStart(msg) {
  clearTimeout(watchDog);
  const url = msg.url;
  const p = FFParser.parseUrl(url);
  if (!p || !p.storyId) return { error: '请在 FF.net 小说页启动' };

  if (state && state.crawlTabId) {
    try { await chrome.tabs.remove(state.crawlTabId); } catch (_) {}
  }

  state = newState(url, { initialChapterCount: msg.chapterCount });
  state.formats = Array.isArray(msg.formats) && msg.formats.length ? msg.formats : ['txt'];
  broadcast();
  startKeepalive();
  appendLog('开始抓取小说 id=' + state.storyId + '（总章数=' + (state.chapterCount || '未知，稍后自动发现') + '）');

  goTo(1);
  return { ok: true };
}

async function cmdReset() {
  clearTimeout(watchDog);
  stopKeepalive();
  if (state && state.crawlTabId) { try { await chrome.tabs.remove(state.crawlTabId); } catch (_) {} }
  state = null;
  try { await chrome.storage.local.remove(STORE_KEY); } catch (_) {}
  broadcastToTabs();
  return { ok: true };
}

async function cmdPing() {
  const loaded = state ? state.status : 'idle';
  return { ok: true, alive: true, status: loaded };
}

/* ---------- 收到内容脚本解析的章节数据 ---------- */

async function onChapterParsed(sender, data) {
  if (!state || state.status !== 'running') return;
  if (sender.tab && sender.tab.id && sender.tab.id !== state.crawlTabId) {
    return;
  }
  if (!data || !data.storyId || String(data.storyId) !== String(state.storyId)) return;

  clearTimeout(watchDog);

  if (data.meta) {
    // 如果解析到了更可靠的总章数就更新
    if (data.meta.chapters) {
      const cnt = parseInt(data.meta.chapters, 10);
      if (cnt > 0 && (state.chapterCount === 0 || cnt > state.chapterCount)) {
        state.chapterCount = cnt;
      }
    }
    if (!state.meta) state.meta = data.meta;
  }

  if (data.chapter && data.chapter.index) {
    const dup = state.chapters.find(c => c.index === data.chapter.index);
    if (!dup) state.chapters.push({ index: data.chapter.index, title: data.chapter.title, text: data.chapter.text });
    appendLog('第 ' + data.chapter.index + ' 章保存成功（' + state.chapters.length + '/' + (state.chapterCount || '?') + '）');
  }

  // 如果当前章节号还没推进到 data.chapter.index，推进
  if (data.chapter && data.chapter.index && data.chapter.index > state.currentIndex) {
    state.currentIndex = data.chapter.index;
  }

  const limit = Math.min(effectiveCount(state), SAFETY_MAX_CHAPTERS);
  const allReached = state.chapterCount > 0 && state.chapters.length >= state.chapterCount;

  // 防死循环：currentIndex 或 next 超过合理上限
  const next = state.currentIndex + 1;
  const overshoot = next > limit;

  if (allReached || overshoot) {
    if (overshoot && !allReached) {
      appendLog('到达安全上限（' + limit + '），强制收尾…', 'err');
      state.error = '总章数未正确解析，已在第 ' + state.currentIndex + ' 章安全停止。请确认章节下拉框是否正常。';
    }
    finishCrawl();
  } else {
    goTo(next);
  }
  broadcast();
}

/* ---------- 事件注册 ---------- */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const handle = async () => {
    try {
      if (!msg || !msg.type) return { error: 'empty' };
      if (msg.type === 'FFNET_PAGE_V3') { await onChapterParsed(sender, msg.data); return { ok: true }; }
      if (msg.type === 'FFNET_START_V3') return await cmdStart(msg);
      if (msg.type === 'FFNET_RESET_V3') return await cmdReset();
      if (msg.type === 'FFNET_PING_V3')  return await cmdPing();
      if (msg.type === 'FFNET_GET_V3')   return { state: state || await loadState() };
      return { error: 'unknown type ' + msg.type };
    } catch (e) {
      console.error('[FFNet] handler error', msg && msg.type, e);
      return { error: (e && e.message) || String(e) };
    }
  };
  handle().then(sendResponse).catch((e) => {
    try { sendResponse({ error: String(e) }); } catch (_) {}
  });
  return true;
});

// tab 被关时自动恢复（如果还有章节没抓完）
chrome.tabs.onRemoved.addListener((tabId) => {
  if (state && state.crawlTabId === tabId && state.status === 'running') {
    state.crawlTabId = null;
    appendLog('抓取标签页被关闭，自动重建继续…');
    broadcast();
    // 继续抓 currentIndex（因为这一章还没收到解析结果）
    setTimeout(() => {
      if (state && state.status === 'running') {
        goTo(state.currentIndex);
      }
    }, 500);
  }
});

// Keepalive alarm handler：只要还有任务在跑，就保活 SW
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== KEEPALIVE_ALARM) return;
  if (state && state.status === 'running') {
    // 重新注册 alarm 继续保活
    try { await chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.25 }); } catch (_) {}
  } else {
    try { await chrome.alarms.clear(KEEPALIVE_ALARM); } catch (_) {}
  }
});

// SW 启动时恢复状态
loadState().then((st) => {
  if (st && st.status === 'running' && st.crawlTabId) {
    state = st;
    console.log('[FFNet] restored state, resuming chapter', st.currentIndex);
    startKeepalive();
    // 验证 tab 是否还在
    chrome.tabs.get(st.crawlTabId, (tab) => {
      if (chrome.runtime.lastError || !tab) {
        state.crawlTabId = null;
        appendLog('恢复时 tab 已丢失，重建…');
      }
      goTo(state.currentIndex);
    });
  } else {
    console.log('[FFNet] SW ready (v5, no running state)');
  }
});
