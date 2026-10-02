/* 独立设置页面脚本 */
(function () {
  'use strict';

  const D = document;
  const $$ = (id) => D.getElementById(id);
  const SETTINGS_KEYS = [
    'formats', 'saveAs', 'downloadSubdir', 'filenameTemplate', 'conflictAction',
    'delayMsMin', 'delayMsMax', 'maxAttempts', 'pageTimeoutMs',
    'chapterRangeEnabled', 'startChapter', 'endChapter',
    'preferFetchFallback', 'autoCloseCrawlTab',
    'txtIncludeMeta', 'txtBom', 'txtChapterSeparator',
    'epubIncludeCover', 'epubIncludeToc', 'epubLanguage', 'epubAuthorAsCreator',
    'uiInjectEnabled', 'uiOpenOptionsInNewTab'
  ];

  /* ---------- 工具 ---------- */
  function notify(txt, type = 'info') {
    const el = D.createElement('div');
    Object.assign(el.style, {
      position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)',
      padding: '10px 16px', borderRadius: '8px',
      background: type === 'danger' ? '#e5484d' : '#1f2330',
      color: '#fff', fontSize: '13px', zIndex: 999, boxShadow: '0 8px 20px rgba(0,0,0,0.2)',
      opacity: 0, transition: 'opacity .2s ease'
    });
    el.textContent = txt;
    D.body.appendChild(el);
    requestAnimationFrame(() => el.style.opacity = '1');
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2000);
  }

  async function loadSettings() {
    const defaults = {
      formats: ['txt', 'epub'], saveAs: false, downloadSubdir: '',
      filenameTemplate: '[{author}] {title}', conflictAction: 'uniquify',
      delayMsMin: 3000, delayMsMax: 8000, maxAttempts: 3, pageTimeoutMs: 20000,
      chapterRangeEnabled: false, startChapter: 1, endChapter: null,
      preferFetchFallback: true, autoCloseCrawlTab: true,
      txtIncludeMeta: true, txtBom: true, txtChapterSeparator: '---',
      epubIncludeCover: true, epubIncludeToc: true, epubLanguage: 'en', epubAuthorAsCreator: true,
      uiInjectEnabled: true, uiOpenOptionsInNewTab: true
    };
    const res = await chrome.storage.local.get(SETTINGS_KEYS);
    return Object.assign({}, defaults, res);
  }

  function patchSettings(patch) {
    return chrome.storage.local.set(patch);
  }

  /* ---------- 绑定表单：读入设置 -> DOM ---------- */
  function fillForm(s) {
    $('f-f-txt').checked = s.formats.includes('txt');
    $('f-f-epub').checked = s.formats.includes('epub');
    $('f-filenameTemplate').value = s.filenameTemplate || '';
    $('f-downloadSubdir').value = s.downloadSubdir || '';
    $('f-conflictAction').value = s.conflictAction || 'uniquify';
    $('f-saveAs').checked = !!s.saveAs;
    $('f-chapterRangeEnabled').checked = !!s.chapterRangeEnabled;
    $('f-startChapter').value = s.startChapter || 1;
    $('f-endChapter').value = s.endChapter || '';
    $('f-delayMsMin').value = s.delayMsMin ?? 3000;
    $('f-delayMsMax').value = s.delayMsMax ?? 8000;
    $('f-pageTimeoutMs').value = s.pageTimeoutMs ?? 20000;
    $('f-maxAttempts').value = s.maxAttempts ?? 3;
    $('f-preferFetchFallback').checked = !!s.preferFetchFallback;
    $('f-autoCloseCrawlTab').checked = !!s.autoCloseCrawlTab;
    $('f-txtIncludeMeta').checked = !!s.txtIncludeMeta;
    $('f-txtBom').checked = !!s.txtBom;
    $('f-txtChapterSeparator').value = s.txtChapterSeparator ?? '---';
    $('f-epubIncludeCover').checked = !!s.epubIncludeCover;
    $('f-epubIncludeToc').checked = !!s.epubIncludeToc;
    $('f-epubLanguage').value = s.epubLanguage || 'en';
    $('f-epubAuthorAsCreator').checked = !!s.epubAuthorAsCreator;
    $('f-uiInjectEnabled').checked = !!s.uiInjectEnabled;
    $('f-uiOpenOptionsInNewTab').checked = !!s.uiOpenOptionsInNewTab;
  }

  /* ---------- 从 DOM 收集 patch ---------- */
  function collectFromDom() {
    const formats = [];
    if ($('f-f-txt').checked) formats.push('txt');
    if ($('f-f-epub').checked) formats.push('epub');
    const startChapter = Math.max(1, parseInt($('f-startChapter').value, 10) || 1);
    const endChapter = $('f-endChapter').value === '' ? null : Math.max(1, parseInt($('f-endChapter').value, 10) || null);
    return {
      formats,
      saveAs: $('f-saveAs').checked,
      downloadSubdir: $('f-downloadSubdir').value.trim(),
      filenameTemplate: $('f-filenameTemplate').value.trim() || '[{author}] {title}',
      conflictAction: $('f-conflictAction').value,
      chapterRangeEnabled: $('f-chapterRangeEnabled').checked,
      startChapter,
      endChapter: $('f-chapterRangeEnabled').checked ? endChapter : null,
      delayMsMin: Math.max(0, parseInt($('f-delayMsMin').value, 10) || 0),
      delayMsMax: Math.max(0, parseInt($('f-delayMsMax').value, 10) || 0),
      pageTimeoutMs: Math.max(3000, parseInt($('f-pageTimeoutMs').value, 10) || 20000),
      maxAttempts: Math.max(1, Math.min(20, parseInt($('f-maxAttempts').value, 10) || 3)),
      preferFetchFallback: $('f-preferFetchFallback').checked,
      autoCloseCrawlTab: $('f-autoCloseCrawlTab').checked,
      txtIncludeMeta: $('f-txtIncludeMeta').checked,
      txtBom: $('f-txtBom').checked,
      txtChapterSeparator: $('f-txtChapterSeparator').value,
      epubIncludeCover: $('f-epubIncludeCover').checked,
      epubIncludeToc: $('f-epubIncludeToc').checked,
      epubLanguage: $('f-epubLanguage').value.trim() || 'en',
      epubAuthorAsCreator: $('f-epubAuthorAsCreator').checked,
      uiInjectEnabled: $('f-uiInjectEnabled').checked,
      uiOpenOptionsInNewTab: $('f-uiOpenOptionsInNewTab').checked
    };
  }

  /* ---------- 给所有表单项挂上 auto-save ---------- */
  function bindAutoSave() {
    const inputs = D.querySelectorAll('#f-delayMsMin, #f-delayMsMax, #f-pageTimeoutMs, #f-maxAttempts, #f-startChapter, #f-endChapter, #f-filenameTemplate, #f-downloadSubdir, #f-txtChapterSeparator, #f-epubLanguage');
    inputs.forEach((el) => {
      let t;
      el.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => patchSettings(collectFromDom()).then(() => notify('已保存')), 400);
      });
    });

    const checkboxes = D.querySelectorAll('input[type=checkbox]');
    checkboxes.forEach((el) => {
      el.addEventListener('change', () => patchSettings(collectFromDom()).then(() => notify('已保存')));
    });

    const select = $('f-conflictAction');
    select.addEventListener('change', () => patchSettings(collectFromDom()).then(() => notify('已保存')));
  }

  /* ---------- 导出 / 导入 / 重置 ---------- */
  function bindTopActions() {
    $('btn-export-config').addEventListener('click', async () => {
      const s = await loadSettings();
      const blob = new Blob([JSON.stringify({ version: 1, settings: s }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = D.createElement('a');
      a.href = url; a.download = 'ffnet-settings.json';
      D.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    });
    $('btn-import-config').addEventListener('click', () => $('import-file').click());
    $('import-file').addEventListener('change', async (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      try {
        const txt = await f.text();
        const data = JSON.parse(txt);
        const s = data && data.settings;
        if (!s) throw new Error('格式不正确');
        const valid = {};
        SETTINGS_KEYS.forEach((k) => { if (s[k] !== undefined) valid[k] = s[k]; });
        await patchSettings(valid);
        fillForm(await loadSettings());
        notify('已导入');
      } catch (err) {
        notify('导入失败：' + err.message, 'danger');
      } finally {
        e.target.value = '';
      }
    });
    $('btn-reset').addEventListener('click', async () => {
      if (!confirm('确定把所有设置恢复为默认？')) return;
      const keys = SETTINGS_KEYS.slice();
      await chrome.storage.local.remove(keys);
      fillForm(await loadSettings());
      notify('已恢复默认');
    });
  }

  /* ---------- 侧栏锚点 & 高亮 ---------- */
  function bindSidebar() {
    const map = { download: 'sec-download', manager: 'sec-manager', history: 'sec-history', crawl: 'sec-crawl', output: 'sec-output', ui: 'sec-ui', about: 'sec-about' };
    const items = D.querySelectorAll('.side-item');

    function updateActive() {
      let active = 'download';
      for (const [hash, id] of Object.entries(map)) {
        const sec = $(id); if (!sec) continue;
        const rect = sec.getBoundingClientRect();
        if (rect.top <= 120 && rect.bottom >= 120) active = hash;
      }
      items.forEach((el) => el.classList.toggle('active', el.dataset.hash === active));
    }
    window.addEventListener('scroll', updateActive, { passive: true });

    items.forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const id = map[el.dataset.hash]; const sec = $(id);
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  /* ---------- 下载管理器 ---------- */
  const HISTORY_KEY = 'ffnet_history_v1';

  async function getHistory() {
    const r = await chrome.storage.local.get(HISTORY_KEY);
    return Array.isArray(r[HISTORY_KEY]) ? r[HISTORY_KEY] : [];
  }
  async function setHistory(arr) {
    return chrome.storage.local.set({ [HISTORY_KEY]: arr });
  }
  async function appendHistory(entry) {
    const list = await getHistory();
    const i = list.findIndex((x) => x.storyId === entry.storyId);
    if (i >= 0) list.splice(i, 1);
    list.unshift(entry);
    if (list.length > 200) list.length = 200;
    await setHistory(list);
  }

  async function renderManager() {
    const list = $('mgr-list');
    const res = await chrome.runtime.sendMessage({ type: 'FFNET_GET_STATE' });
    const s = (res && res.state) || null;
    if (!s || s.status === 'idle' || !s.storyId) {
      $('mgr-status').textContent = '暂无正在进行的任务';
      list.innerHTML = '';
      list.appendChild(Object.assign(D.createElement('div'), { className: 'empty', textContent: '到任意 FF.net 小说页点「下载小说」即可开始，任务进度会在这里实时显示。' }));
      return;
    }
    $('mgr-status').textContent = '正在进行的任务（实时同步于后台抓取服务）';
    list.innerHTML = '';
    list.appendChild(makeItemFromState(s));
  }

  function badge(status) {
    const map = { idle: ['idle','待机'], running:['running','抓取中'], paused:['paused','已暂停'], done:['done','已完成'], error:['error','出错'] };
    const [cls, txt] = map[status] || ['idle','待机'];
    return '<span class="badge ' + cls + '">' + txt + '</span>';
  }

  function makeItemFromState(s) {
    const meta = s.meta || {};
    const total = s.total || null;
    const cur = s.chapters ? s.chapters.length : 0;
    const pct = total ? Math.round(cur / total * 100) : 0;
    const el = D.createElement('div');
    el.className = 'item';
    el.innerHTML =
      '<div class="ico">FF</div>' +
      '<div>' +
        '<div class="t-title"></div>' +
        '<div class="t-sub"></div>' +
        '<div class="progress"><div style="width:' + pct + '%"></div></div>' +
      '</div>' +
      '<div class="actions">' +
        badge(s.status) +
        (s.status === 'running' ? '<button class="mini" data-act="pause">暂停</button>' : s.status === 'paused' || s.status === 'error' ? '<button class="mini" data-act="resume">继续</button>' : '<button class="mini" data-act="reset">重置</button>') +
      '</div>';
    const [title, sub] = el.querySelectorAll('.t-title, .t-sub');
    title.textContent = meta.title || ('小说 ' + s.storyId);
    sub.textContent = [
      meta.author ? '作者：' + meta.author : null,
      total ? ('进度 ' + cur + ' / ' + total + ' 章 (' + pct + '%)') : ('已完成 ' + cur + ' 章'),
      s.error ? '错误：' + s.error : null
    ].filter(Boolean).join('   ·   ');
    el.addEventListener('click', async (e) => {
      const act = e.target && e.target.dataset.act;
      if (!act) return;
      await chrome.runtime.sendMessage({ type: act === 'pause' ? 'FFNET_PAUSE' : act === 'resume' ? 'FFNET_RESUME' : 'FFNET_RESET' });
      setTimeout(renderManager, 200);
    });
    return el;
  }

  async function bindManagerActions() {
    $('btn-clear-finished').addEventListener('click', async () => notify('已隐藏已完成项'));
    $('btn-clear-all').addEventListener('click', async () => {
      if (!confirm('清空所有记录（含正在进行的任务进度）？')) return;
      await chrome.runtime.sendMessage({ type: 'FFNET_RESET' });
      await setHistory([]);
      renderManager(); renderHistory();
      notify('已清空');
    });
  }

  /* ---------- 历史记录 ---------- */
  async function renderHistory() {
    const host = $('history-list');
    const list = await getHistory();
    host.innerHTML = '';
    if (!list.length) {
      host.appendChild(Object.assign(D.createElement('div'), { className: 'empty', textContent: '还没有历史记录。' }));
      return;
    }
    for (const h of list) {
      const el = D.createElement('div');
      el.className = 'item';
      const date = new Date(h.date || Date.now());
      const dateStr = date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0') + ' ' + String(date.getHours()).padStart(2,'0') + ':' + String(date.getMinutes()).padStart(2,'0');
      el.innerHTML =
        '<div class="ico">📖</div>' +
        '<div>' +
          '<div class="t-title"></div>' +
          '<div class="t-sub"></div>' +
        '</div>' +
        '<div class="actions">' +
          '<button class="mini" data-act="open">打开原页面</button>' +
          '<button class="mini" data-act="remove">删除</button>' +
        '</div>';
      const [t, s] = el.querySelectorAll('.t-title, .t-sub');
      t.textContent = h.title || ('小说 ' + h.storyId);
      s.textContent = [h.author ? '作者：' + h.author : null, h.chapters ? h.chapters + ' 章' : null, dateStr].filter(Boolean).join('   ·   ');
      el.addEventListener('click', async (e) => {
        const act = e.target && e.target.dataset.act;
        if (act === 'remove') {
          const all = await getHistory();
          await setHistory(all.filter((x) => x.storyId !== h.storyId));
          renderHistory();
        } else if (act === 'open' && h.url) {
          chrome.tabs.create({ url: h.url });
        }
      });
      host.appendChild(el);
    }
  }

  async function bindHistoryActions() {
    $('btn-clear-history').addEventListener('click', async () => {
      if (!confirm('确定清空历史记录？')) return;
      await setHistory([]);
      renderHistory();
      notify('历史已清空');
    });
  }

  /* ---------- 启动 ---------- */
  (async function init() {
    const s = await loadSettings();
    fillForm(s);
    bindAutoSave();
    bindTopActions();
    bindSidebar();
    bindManagerActions();
    bindHistoryActions();
    renderManager();
    renderHistory();

    // 订阅后台 state 变化
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'FFNET_STATE') renderManager();
    });
    setInterval(renderManager, 3000); // 兜底轮询
    setInterval(renderHistory, 5000);
  })();
})();
