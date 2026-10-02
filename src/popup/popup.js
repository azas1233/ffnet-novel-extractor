/**
 * 弹窗逻辑：获取当前小说页 → 触发/暂停/继续/重置 → 展示进度。
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const els = {
    dot: $('status-dot'),
    story: $('current-story'),
    storyTitle: $('story-title'),
    storyAuthor: $('story-author'),
    storySummary: $('story-summary'),
    urlInput: $('url-input'),
    fmtTxt: $('fmt-txt'),
    fmtEpub: $('fmt-epub'),
    btnStart: $('btn-start'),
    btnPause: $('btn-pause'),
    btnResume: $('btn-resume'),
    btnReset: $('btn-reset'),
    progress: $('progress-section'),
    fill: $('progress-fill'),
    progressText: $('progress-text'),
    log: $('log')
  };

  function send(msg) {
    return chrome.runtime.sendMessage(msg).catch(() => null);
  }

  /* ---------- 渲染状态 ---------- */

  function fmtChapter(i, total) {
    if (!total) return '已抓取 ' + i + ' 章';
    return '第 ' + Math.min(i, total) + ' / ' + total + ' 章';
  }

  function render(state) {
    if (!state) return;
    const running = state.status === 'running';
    const done = state.status === 'done';
    const paused = state.status === 'paused';
    const error = state.status === 'error';
    const active = running || paused;

    els.dot.className = 'dot ' + (running ? 'running' : paused ? 'paused' : done ? 'done' : error ? 'error' : 'idle');

    // 当前小说信息
    if (state.meta && state.meta.title) {
      els.story.classList.remove('hidden');
      els.storyTitle.textContent = state.meta.title;
      els.storyAuthor.textContent = state.meta.author ? ('作者：' + state.meta.author) : '';
      els.storySummary.textContent = state.meta.summary ? state.meta.summary.slice(0, 90) : '';
    }

    // 按钮态
    els.btnStart.classList.toggle('hidden', active);
    els.btnPause.classList.toggle('hidden', !running);
    els.btnResume.classList.toggle('hidden', !(paused || error));
    els.btnStart.disabled = false;

    // 进度
    const total = state.total || state.meta && state.meta.chapters && parseInt(state.meta.chapters, 10);
    const cur = Math.min(state.nextIndex - 1, state.chapters.length);
    if (active || done || error) {
      els.progress.classList.remove('hidden');
      const pct = total ? Math.round(cur / total * 100) : 0;
      els.fill.style.width = pct + '%';
      if (done) {
        els.progressText.textContent = '提取完成，已开始下载文件';
      } else if (error) {
        els.progressText.textContent = state.error || '出错';
      } else if (paused) {
        els.progressText.textContent = '已暂停 · ' + fmtChapter(cur, total);
      } else {
        els.progressText.textContent = '正在提取 · ' + fmtChapter(cur, total) + '（' + pct + '%）';
      }
    } else {
      els.progress.classList.add('hidden');
    }

    if (state.error) addLog(state.error, 'err');
  }

  function addLog(text, cls) {
    const div = document.createElement('div');
    if (cls) div.className = cls;
    div.textContent = '· ' + text;
    els.log.appendChild(div);
    while (els.log.childNodes.length > 8) els.log.removeChild(els.log.firstChild);
  }

  /* ---------- 当前标签页检测 ---------- */

  async function detectCurrentTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url) return;
    const m = tab.url.match(/\/s\/(\d+)/);
    if (!m) return;
    els.urlInput.value = tab.url;
  }

  /* ---------- 事件 ---------- */

  els.btnStart.addEventListener('click', async () => {
    const url = els.urlInput.value.trim();
    const formats = [];
    if (els.fmtTxt.checked) formats.push('txt');
    if (els.fmtEpub.checked) formats.push('epub');
    await send({ type: 'FFNET_SET_FORMATS', formats });
    const r = await send({ type: 'FFNET_START', url });
    if (r && r.ok === false) addLog(r.error || '无法启动', 'err');
    else addLog('开始提取', 'ok');
  });

  els.btnPause.addEventListener('click', () => send({ type: 'FFNET_PAUSE' }));
  els.btnResume.addEventListener('click', () => send({ type: 'FFNET_RESUME' }));
  els.btnReset.addEventListener('click', async () => {
    await send({ type: 'FFNET_RESET' });
    els.progress.classList.add('hidden');
    els.log.textContent = '';
  });

  /* ---------- 初始化 ---------- */

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === 'FFNET_STATE') render(msg.state);
  });

  (async function init() {
    await detectCurrentTab();
    const r = await send({ type: 'FFNET_GET_STATE' });
    render(r ? r.state : null);
  })();
})();
