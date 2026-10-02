/**
 * FF.net 页面解析库
 * 同时用于：内容脚本（document）和后台 SW 的 fetch 兜底（DOMParser 结果）。
 * 通过 importScripts / <script> 加载，挂载到 globalThis.FFParser。
 */
(function (global) {
  'use strict';

  const FFParser = {
    /* ---------- 通用 ---------- */

    /** 从 URL 解析 storyId 和章节号：/s/{id}/{chapter}/{slug} */
    parseUrl(url) {
      const m = (url || '').match(/\/s\/(\d+)(?:\/(\d+))?/);
      if (!m) return null;
      return { storyId: m[1], chapter: m[2] ? parseInt(m[2], 10) : 1 };
    },

    /** 页面标题里去掉站点后缀 */
    cleanTitle(t) {
      return (t || '').replace(/\s*[-–—|]\s*fanfiction/gi, '').trim();
    },

    /* ---------- 阻塞/拦截检测 ---------- */

    /** Cloudflare 人机校验页 */
    isCloudflareChallenge(doc) {
      const title = (doc.title || '').toLowerCase();
      if (title.includes('just a moment') || title.includes('attention required')) return true;
      if (doc.getElementById('challenge-form') || doc.getElementById('challenge-running')) return true;
      const body = (doc.body && doc.body.textContent || '').toLowerCase();
      return body.includes('checking your browser before accessing') ||
        body.includes('cdn-cgi/challenge-platform') ||
        body.includes('cf-browser-verification');
    },

    /** 成人内容确认页 / 登录门（FF.net 对部分 M/MA 内容要求登录，未登录会提示） */
    isAdultGate(doc) {
      const body = (doc.body && doc.body.textContent || '');
      if (/you must be logged in/i.test(body) && /adult|mature/i.test(body)) return true;
      // 确认页特征：内容替换为警告文案
      const text = body.replace(/\s+/g, ' ').slice(0, 3000);
      return /this (story|content) .{0,80}(contains|may contain) .{0,80}(adult|mature)/i.test(text) &&
        !doc.getElementById('storytext');
    },

    /** 登录状态：头部有 logout 链接视为已登录 */
    isLoggedIn(doc) {
      const body = (doc.body && doc.body.innerHTML || '');
      return /\/logout|log out/i.test(body) && !/sign in|log in/i.test(body);
    },

    /* ---------- 元数据 ---------- */

    /**
     * 从 #profile_top 提取小说元数据（尽力而为，单项失败不影响整体）。
     */
    parseMeta(doc) {
      const top = doc.querySelector('#profile_top') || doc.querySelector('.m-profile-top');
      if (!top) return null;
      const meta = {};

      // 标题：<b class="xcontrast_txt">
      const titleEl = top.querySelector('b');
      if (titleEl) meta.title = this.cleanTitle(titleEl.textContent);

      // 作者：第一个 /u/ 链接
      const authorEl = top.querySelector('a[href^="/u/"]');
      if (authorEl) meta.author = authorEl.textContent.trim();

      // 简介：profile_top 内、非统计行的块级 div
      const infoEl = top.querySelector('.profile_top_info, .m-profile-top-info');
      const infoText = infoEl ? infoEl.textContent : '';
      const statEl = top.querySelector('[class*="profile_top_info"]');
      const statText = statEl ? statEl.textContent : '';

      // 简介 fallback：样式带 margin-top 的 div，或 profile_top 全文去掉已知噪声
      const sumEl = top.querySelector('div[style*="margin-top"]');
      if (sumEl) meta.summary = sumEl.textContent.trim();

      // 统计行：Rated / Chapters / Words / Published / Updated / Status
      const statsText = statText || infoText || '';
      const grab = (re) => {
        const m = statsText.match(re);
        return m ? m[1].trim() : undefined;
      };
      meta.rating = grab(/Rated:?\s*(?:fictio[n]?\s*)?([A-Z+]+)/i) || grab(/Rated:?\s*([A-Z+]+)/i);
      meta.language = grab(/(?:Fiction|Rated)[^-]*-\s*([A-Za-z\u4e00-\u9fa5]+)\s*-\s*(?:[A-Za-z\u4e00-\u9fa5\/]+)?\s*-\s*(?:Chapters|Words)/);
      meta.chapters = grab(/Chapters:?\s*(\d+)/i);
      // 兜底：用章节下拉框的选项数量
      if (!meta.chapters) {
        try {
          const sel = doc.querySelector('#chap_select');
          if (sel && sel.options && sel.options.length) meta.chapters = String(sel.options.length);
        } catch (_) {}
      }
      meta.words = grab(/Words:?\s*([\d,]+)/i);
      meta.reviews = grab(/Reviews:?\s*([\d,]+)/i);
      meta.favs = grab(/Favs:?\s*([\d,]+)/i);
      meta.follows = grab(/Follows:?\s*([\d,]+)/i);
      meta.updated = grab(/Updated:?\s*([^\-]+)/i);
      meta.published = grab(/Published:?\s*([^\-]+)/i);
      meta.status = grab(/(Complete|In-Progress)/i);
      meta.genre = grab(/Genre:?\s*([^\-]+)/i);
      meta.characters = grab(/Characters:?\s*([^\-]+)/i);
      meta.tags = grab(/Tags:?\s*([^\-]+)/i);
      if (meta.language === 'Fiction') meta.language = undefined;

      return meta;
    },

    /* ---------- 章节列表 ---------- */

    /** 从下拉框 #chap_select 提取全部章节链接与标题 */
    parseChapterList(doc) {
      const sel = doc.querySelector('#chap_select');
      if (!sel || !sel.options) return null;
      const list = [];
      for (const opt of sel.options) {
        const url = opt.getAttribute('value') || opt.value;
        if (!url) continue;
        const text = (opt.textContent || '').trim();
        const title = text.replace(/^\s*\d+\.\s*/, '');
        const index = parseInt(text, 10) || list.length + 1;
        list.push({ index, title: title || '第 ' + index + ' 章', url });
      }
      return list.length ? list : null;
    },

    /** 当前选中章节 */
    currentChapter(doc, list) {
      const sel = doc.querySelector('#chap_select');
      if (sel && sel.options && sel.selectedIndex >= 0) {
        const opt = sel.options[sel.selectedIndex];
        const text = (opt.textContent || '').trim();
        return {
          index: parseInt(text, 10) || 1,
          title: text.replace(/^\s*\d+\.\s*/, '').trim() || '第 1 章'
        };
      }
      if (list && list.length) return { index: list[0].index, title: list[0].title };
      return { index: 1, title: '第 1 章' };
    },

    /* ---------- 正文 ---------- */

    /**
     * 提取 #storytext 正文，保留段落结构（含章节首尾作者注 A/N）。
     * 块级元素之间空行分隔，<br> 转行。
     */
    extractStoryText(el) {
      if (!el) return '';
      const BLOCK = /^(p|div|blockquote|li|h[1-6]|center|section|article|pre)$/i;
      const lines = [];

      const walk = (node, inBlock) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const text = node.textContent.replace(/\s+/g, ' ').trim();
          if (text) lines.push(text);
          return;
        }
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const tag = node.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return;
        if (tag === 'BR') { lines.push(''); return; }
        if (BLOCK.test(tag)) {
          lines.push(''); // 块级分隔
          for (const child of node.childNodes) walk(child, true);
          lines.push('');
        } else {
          for (const child of node.childNodes) walk(child, inBlock);
        }
      };
      walk(el, false);

      // 合并多余空行
      const out = [];
      for (const l of lines) {
        if (l === '' && (out.length === 0 || out[out.length - 1] === '')) continue;
        out.push(l);
      }
      while (out.length && out[out.length - 1] === '') out.pop();
      return out.join('\n');
    },

    /**
     * 解析一页，返回统一结构。
     * @param {Document} doc
     * @param {string} url 页面 URL
     */
    parsePage(doc, url) {
      const parsed = this.parseUrl(url);
      const isStory = !!(parsed && parsed.storyId);
      const result = {
        url,
        storyId: parsed ? parsed.storyId : null,
        isStory,
        cloudflare: false,
        adultGate: false,
        loggedIn: false,
        meta: null,
        chapterList: null,
        chapter: null
      };
      if (!isStory) return result;

      result.cloudflare = this.isCloudflareChallenge(doc);
      result.adultGate = this.isAdultGate(doc);
      result.loggedIn = this.isLoggedIn(doc);

      if (result.cloudflare || result.adultGate) return result;

      result.meta = this.parseMeta(doc);
      result.chapterList = this.parseChapterList(doc);
      const storyEl = doc.getElementById('storytext');
      if (storyEl) {
        const cur = this.currentChapter(doc, result.chapterList);
        result.chapter = {
          index: cur.index,
          title: cur.title,
          text: this.extractStoryText(storyEl)
        };
      }
      return result;
    }
  };

  global.FFParser = FFParser;
})(typeof self !== 'undefined' ? self : this);
