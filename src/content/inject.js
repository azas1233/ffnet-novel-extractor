/**
 * 重做版：inject.js（极简 UI）
 * 底部胶囊 + 展开面板：显示当前小说信息、实时日志、进度条，点开始就能跑。
 * 与 SW 通过 FFNET_*_V3 系列消息通信，同时订阅 chrome.storage.onChanged 同步 ffnet_state_v3。
 */
(function () {
  'use strict';
  if (window.__ffnet_ui_v3) return;
  window.__ffnet_ui_v3 = true;

  // 只在小说页注入
  var m = location.pathname.match(/\/s\/(\d+)/);
  if (!m) return;
  var STORY_ID = m[1];
  var STORE_KEY = 'ffnet_state_v3';

  /* ---------- 工具 ---------- */
  function h(tag, attrs, children) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) {
      if (!Object.prototype.hasOwnProperty.call(attrs, k)) continue;
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.substring(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.substring(2), v);
      else el.setAttribute(k, v);
    }
    if (children) for (var i = 0; i < children.length; i++) {
      var c = children[i];
      if (c == null) continue;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }
  function $(id) { return document.getElementById(id); }

  function send(msg) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.runtime.sendMessage(msg, function (resp) {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message || 'runtime error'));
          resolve(resp);
        });
      } catch (e) { reject(e); }
    });
  }

  /* ---------- 构建 UI ---------- */
  var barDot = h('span', { class: 'ffnet-dot' });
  var barCount = h('span', { class: 'ffnet-count', style: { display: 'none' } });
  var dlBtn = h('button', { class: 'ffnet-btn ffnet-btn-primary', id: 'ffnet-bar-dl', type: 'button' },
    [barDot, ' 下载小说 ', barCount]);
  var optBtn = h('button', { class: 'ffnet-btn ffnet-btn-ghost', id: 'ffnet-bar-opt', type: 'button' }, ['选项']);
  var bar = h('div', { id: 'ffnet-bar-root' }, [dlBtn, optBtn]);

  var closeBtn = h('button', { class: 'ffnet-panel-close', type: 'button', html: '&times;' });
  var panelHead = h('div', { class: 'ffnet-panel-head' }, [
    h('div', { class: 'ffnet-panel-title' }, ['提取这本小说']),
    closeBtn
  ]);

  var lineTitle = h('div', { class: 'ffnet-meta-line',  id: 'ffnet-l-title' }, ['加载中…']);
  var lineSub   = h('div', { class: 'ffnet-meta-sub',   id: 'ffnet-l-sub' });

  var txtInput = h('input', { type: 'checkbox', id: 'ffnet-fmt-txt' });
  txtInput.checked = true;
  var txtLabel = h('label', { class: 'ffnet-format-item', id: 'ffnet-lbl-txt' }, [txtInput, 'TXT']);
  var epubInput = h('input', { type: 'checkbox', id: 'ffnet-fmt-epub' });
  epubInput.checked = true;
  var epubLabel = h('label', { class: 'ffnet-format-item', id: 'ffnet-lbl-epub' }, [epubInput, 'EPUB']);
  var fmtRow = h('div', { class: 'ffnet-format-row' }, [txtLabel, epubLabel]);

  var errBox = h('div', { class: 'ffnet-error-box', id: 'ffnet-err', style: { display: 'none' } });
  var progFill = h('div', { class: 'ffnet-progress-fill', id: 'ffnet-pfill' });
  var progBar = h('div', { class: 'ffnet-progress' }, [progFill]);
  var progText = h('div', { class: 'ffnet-progress-text', id: 'ffnet-ptext' });

  var startBtn = h('button', { class: 'ffnet-btn ffnet-btn-primary', id: 'ffnet-start' }, ['开始提取']);
  var resetBtn = h('button', { class: 'ffnet-btn ffnet-btn-ghost',  id: 'ffnet-reset' }, ['重置']);
  var actionsRow = h('div', { class: 'ffnet-actions' }, [startBtn, resetBtn]);

  var logBox = h('div', { class: 'ffnet-log', id: 'ffnet-log' });
  var panelBody = h('div', { class: 'ffnet-panel-body' },
    [lineTitle, lineSub, fmtRow, errBox, progBar, progText, actionsRow, logBox]);
  var panel = h('div', { id: 'ffnet-panel-root' }, [panelHead, panelBody]);

  document.documentElement.appendChild(bar);
  document.documentElement.appendChild(panel);

  // 复选框样式同步
  function refreshFmtClass() {
    txtLabel.classList.toggle('checked', txtInput.checked);
    epubLabel.classList.toggle('checked', epubInput.checked);
  }
  refreshFmtClass();
  txtInput.addEventListener('change', refreshFmtClass);
  epubInput.addEventListener('change', refreshFmtClass);

  /* ---------- 面板开合 ---------- */
  var open = false;
  function setPanel(flag) {
    open = !!flag;
    panel.classList.toggle('ffnet-visible', open);
  }
  dlBtn.addEventListener('click', function () {
    if (!open) { setPanel(true); startCrawl(); }
    else startCrawl();
  });
  optBtn.addEventListener('click', function () {
    if (chrome.runtime.openOptionsPage) try { chrome.runtime.openOptionsPage(); return; } catch(e) {}
    try {
      chrome.tabs.create({ url: chrome.runtime.getURL('src/options/options.html') });
    } catch (e) { setPanel(!open); }
  });
  closeBtn.addEventListener('click', function () { setPanel(false); });
  document.addEventListener('click', function (e) {
    if (!open) return;
    if (panel.contains(e.target) || bar.contains(e.target)) return;
    setPanel(false);
  }, true);

  /* ---------- 状态渲染 ---------- */
  var current = null;
  function addLog(t, cls) {
    var d = h('div', cls ? { class: cls } : {}, [t]);
    logBox.appendChild(d);
    while (logBox.childNodes.length > 20) logBox.removeChild(logBox.firstChild);
    logBox.scrollTop = logBox.scrollHeight;
  }
  function setErr(msg) {
    if (!msg) { errBox.style.display = 'none'; errBox.textContent = ''; return; }
    errBox.style.display = '';
    errBox.textContent = msg;
  }
  function readDomMeta() {
    var top = document.getElementById('profile_top');
    if (!top) return { title: '小说 ' + STORY_ID };
    var titleEl = top.querySelector('b');
    var authorEl = top.querySelector('a[href^="/u/"]');
    var chapSel = document.getElementById('chap_select');
    var txt = (top.innerText || '');
    var mm = txt.match(/Chapters:?\s*(\d+)/i);
    return {
      title: titleEl ? titleEl.textContent.trim() : ('小说 ' + STORY_ID),
      author: authorEl ? authorEl.textContent.trim() : '',
      chapters: mm ? mm[1] : (chapSel ? chapSel.options.length : null)
    };
  }

  function render(st) {
    current = st;
    var running = !!(st && st.status === 'running');
    var done    = !!(st && st.status === 'done');
    var err     = !!(st && st.status === 'error');

    // dot + 胶囊文字
    var cls = running ? 'running' : done ? 'done' : err ? 'error' : '';
    barDot.className = 'ffnet-dot' + (cls ? ' ' + cls : '');
    dlBtn.childNodes[1].nodeValue =
      running ? ' 提取中… ' : done ? ' 已完成 ' : err ? ' 重试 ' : ' 下载小说 ';

    var meta = (st && st.meta) || readDomMeta();
    lineTitle.textContent = (meta.title || '小说 ' + STORY_ID) + (done ? ' · 完成' : '');
    lineSub.textContent = [
      meta.author ? '作者：' + meta.author : '',
      (meta.chapters) ? '共 ' + meta.chapters + ' 章' : '',
      st && ('currentIndex' in st) ? '当前：第 ' + st.currentIndex + ' 章' : '',
    ].filter(Boolean).join('  ·  ');

    var cur = st && st.chapters ? st.chapters.length : 0;
    var total = st ? (st.chapterCount || meta.chapters || 0) : 0;
    if (running || done || err) {
      barCount.textContent = cur + '/' + (total || '?');
      barCount.style.display = '';
    } else {
      barCount.style.display = 'none';
    }
    var pct = total ? Math.min(100, Math.round(cur / total * 100)) : 0;
    progFill.style.width = pct + '%';
    var statusText = '';
    if (done) statusText = '已完成，文件已保存到系统「下载」文件夹。';
    else if (err) statusText = st.error || '出错了，请点「重置」再试。';
    else if (running) statusText = '抓取中…第 ' + (st && st.currentIndex || 1) + ' 章（' + cur + '/' + (total || '?') + '）';
    else statusText = '未开始';
    progText.textContent = statusText;

    // 按钮可点状态
    startBtn.disabled = running;
    startBtn.textContent = (done || err) ? '重新提取' : '开始提取';

    // 错误条
    setErr(st && st.error ? st.error : null);
  }

  /* ---------- 按钮动作 ---------- */
  resetBtn.addEventListener('click', async function () {
    try {
      await send({ type: 'FFNET_RESET_V3' });
      logBox.textContent = '';
      setErr(null);
      render(null);
      addLog('已重置', 'ok');
    } catch (e) {
      addLog('重置失败：' + (e.message || e), 'err');
    }
  });

  async function pingSW() {
    try {
      var r = await send({ type: 'FFNET_PING_V3' });
      return !!(r && r.alive);
    } catch (e) { return false; }
  }

  startBtn.addEventListener('click', startCrawl);

  async function startCrawl() {
    var fmts = [];
    if (txtInput.checked) fmts.push('txt');
    if (epubInput.checked) fmts.push('epub');
    if (!fmts.length) {
      setErr('请至少勾选一种格式（TXT 或 EPUB）');
      return;
    }
    setErr(null);

    var alive = await pingSW();
    if (!alive) {
      setErr('扩展后台未启动。请到 edge://extensions 找到该扩展，点卡片上的「↻」重新加载，再刷新本页。');
      addLog('扩展后台未启动', 'err');
      return;
    }

    try {
      var domMeta = readDomMeta();
      var cc = parseInt(domMeta.chapters, 10) || 0;
      var r = await send({
        type: 'FFNET_START_V3',
        url: location.href,
        formats: fmts,
        chapterCount: cc
      });
      if (r && r.error) {
        setErr(r.error);
        addLog(r.error, 'err');
        return;
      }
      addLog('开始抓取（完成后会自动下载到「下载」文件夹）', 'ok');
    } catch (e) {
      setErr('无法启动：' + (e.message || e));
      addLog('启动失败：' + (e.message || e), 'err');
    }
  }

  /* ---------- 状态订阅：storage.onChanged + runtime.onMessage 双保险 ---------- */
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    if (changes[STORE_KEY]) {
      var st = changes[STORE_KEY].newValue;
      if (!st || !st.storyId || st.storyId === STORY_ID) {
        render(st);
        if (st && st.status && st.status !== 'idle' && st.updatedAt) {
          // 每次状态变了，打一行到 log 让用户看到心跳
          addLog('[状态] ' +
            (st.status === 'running' ? '抓取中 · 第 ' + st.currentIndex + ' 章' :
             st.status === 'done' ? '抓取完成，正在生成文件…' :
             st.status === 'error' ? '出错：' + (st.error || '') : st.status)
          , st.status === 'error' ? 'err' : 'ok');
        }
      }
    }
  });

  chrome.runtime.onMessage.addListener(function (msg) {
    if (msg && msg.type === 'FFNET_STATE_V3') {
      var st = msg.state;
      if (!st || !st.storyId || st.storyId === STORY_ID) render(st);
    }
  });

  // 启动时拉一下当前 state
  (async function init() {
    try {
      var r = await send({ type: 'FFNET_GET_V3' });
      var st = r && r.state;
      if (st && st.storyId === STORY_ID) render(st); else render(null);
    } catch (e) {
      render(null);
    }
  })();
})();
