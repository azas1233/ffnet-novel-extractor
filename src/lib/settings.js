/**
 * 扩展设置的默认值与 schema（options 页、inject.js、service-worker 均引用这份）。
 * 所有设置项都走 chrome.storage.local。
 */
var FFSettingsSchema = {
  defaults: {
    // ---------- 下载 ----------
    formats: ['txt', 'epub'],
    saveAs: false,        // true 时调用 chrome.downloads.saveAs 让用户选路径
    downloadSubdir: '',   // 下载子目录（留空就下载到用户默认路径）
    filenameTemplate: '[作者] {title}',   // 支持占位符：{title} {author} {storyId} {chapters}
    conflictAction: 'uniquify',           // uniquify | overwrite | prompt

    // ---------- 抓取 ----------
    delayMsMin: 3000,
    delayMsMax: 8000,
    maxAttempts: 3,
    pageTimeoutMs: 20000,
    // 抓取范围：默认整本；可改成从 startChapter 到 endChapter
    chapterRangeEnabled: false,
    startChapter: 1,
    endChapter: null,
    // 使用隐藏 tab 模式（false 时用 fetch 兜底；这个是 tab 模式本身）
    preferFetchFallback: true,
    // 关闭抓取后自动清理 crawlTab
    autoCloseCrawlTab: true,

    // ---------- 输出 ----------
    // TXT
    txtIncludeMeta: true,       // TXT 文件头加元信息
    txtBom: true,               // 写 UTF-8 BOM
    txtChapterSeparator: '---', // 每章之间的分隔线
    // EPUB
    epubIncludeCover: true,     // 是否生成封面（用封面图 URL）
    epubLanguage: 'en',         // dc:language
    epubIncludeToc: true,       // 目录 NCX/nav
    epubAuthorAsCreator: true,  // 作者作为 dc:creator

    // ---------- UI ----------
    uiInjectEnabled: true,      // 是否显示页面内悬浮胶囊
    uiOpenOptionsInNewTab: true // 点胶囊上的「选项」是否新开独立页面
  }
};

if (typeof globalThis !== 'undefined') {
  globalThis.FFSettingsSchema = FFSettingsSchema;
}

/**
 * 读合并后的当前设置（用户已覆盖的 + 默认值补齐）。
 * 同时作为工具函数导出，SW 与 options 页 / inject 都可调用。
 */
async function ffGetSettings() {
  const d = FFSettingsSchema.defaults;
  const keys = Object.keys(d);
  const res = await chrome.storage.local.get(keys);
  const out = {};
  for (const k of keys) out[k] = (res[k] === undefined) ? d[k] : res[k];
  return out;
}
async function ffSetSettings(patch) {
  await chrome.storage.local.set(patch);
}
