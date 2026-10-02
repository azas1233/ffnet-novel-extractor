/**
 * 重做版：extractor.js
 * 在每个 FF.net 页面（小说详情页/章节页）上自动解析当前 DOM，把结果发给 SW。
 * 触发时机：
 *   1) document_idle（content script 注入后立即跑一次）
 *   2) MutationObserver 观察 #storytext 是否出现（防加载顺序问题）
 *   3) 节流，同一张页面最多发 2 次
 */
(function () {
  'use strict';
  var SENT_KEY = '__ffnet_v3_parsed_sent';
  if (window[SENT_KEY] >= 3) return;
  window[SENT_KEY] = (window[SENT_KEY] || 0) + 1;

  function parseCurrent() {
    var m = (location.pathname || '').match(/\/s\/(\d+)/);
    if (!m) return null;
    var data;
    try {
      data = FFParser.parsePage(document, location.href);
    } catch (e) {
      console.warn('[FFNet] parsePage error', e);
      return null;
    }
    if (!data) return null;
    data.storyId = m[1];
    data.url = location.href;
    return data;
  }

  function send() {
    var data = parseCurrent();
    if (!data) return false;
    // 只有当有章节内容或者有 meta+chapters（详情页首章也会有 chapterList）时才发
    var hasContent = !!(data.chapter && data.chapter.text && data.chapter.text.length > 200);
    var hasMeta    = !!(data.meta && data.meta.chapters);
    if (!hasContent && !hasMeta) return false;
    try {
      chrome.runtime.sendMessage(
        { type: 'FFNET_PAGE_V3', data: data },
        function () { /* 忽略响应 */ }
      );
      console.log('[FFNet] extractor sent chapter ' + ((data.chapter && data.chapter.index) || '(meta)'));
      return true;
    } catch (e) {
      console.warn('[FFNet] send fail', e);
      return false;
    }
  }

  // 1) 立即试一次
  setTimeout(function () { send(); }, 800);

  // 2) 监听 DOM，等到 storytext 出现再补发
  try {
    var mo = new MutationObserver(function () {
      if (document.getElementById('storytext')) {
        mo.disconnect();
        send();
      }
    });
    mo.observe(document.documentElement, { childList: true, subtree: true });
    // 15 秒后强制断开
    setTimeout(function () { mo.disconnect(); }, 15000);
  } catch (e) {}
})();
