/**
 * TXT 生成器：挂载到 globalThis.TxtBuilder
 * 支持 options：
 *  - includeMeta    文件头元信息
 *  - chapterSeparator  章节间分隔线文本
 */
(function (global) {
  'use strict';

  const TxtBuilder = {
    /**
     * @param {object} meta
     * @param {Array} chapters
     * @param {object} [options]
     * @returns {string} UTF-8 文本
     */
    build(meta, chapters, options) {
      options = options || {};
      const separator = (options.chapterSeparator != null) ? String(options.chapterSeparator) : '---';
      const lines = [];
      const field = (label, val) => { if (val) lines.push(label + '：' + val); };

      if (options.includeMeta !== false) {
        lines.push(meta.title || '未命名小说');
        lines.push('='.repeat(40));
        field('作者', meta.author);
        field('原作', meta.fandom);
        field('评分', meta.rating);
        field('标签', meta.tags);
        field('角色', meta.characters);
        field('类型', meta.genre);
        field('语言', meta.language);
        field('字数', meta.words);
        field('章节数', meta.chapters);
        field('发布时间', meta.published);
        field('更新时间', meta.updated);
        field('状态', meta.status);
        field('来源', meta.url);
        if (meta.summary) {
          lines.push(''); lines.push('简介：'); lines.push(meta.summary);
        }
        lines.push(''); lines.push('='.repeat(40));
      }

      let first = true;
      for (const ch of chapters) {
        if (!ch || !ch.text) continue;
        lines.push('');
        if (!first && separator) lines.push(separator);
        first = false;
        lines.push(ch.title || ('第 ' + ch.index + ' 章'));
        lines.push('-'.repeat(40));
        lines.push(ch.text);
      }

      return lines.join('\n').replace(/\n{3,}/g, '\n\n') + '\n';
    }
  };

  global.TxtBuilder = TxtBuilder;
})(typeof self !== 'undefined' ? self : this);
