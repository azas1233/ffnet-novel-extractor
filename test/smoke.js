/**
 * 冒烟测试：解析器 + TXT/EPUB 生成器 + 后台引擎核心逻辑（无浏览器环境用 jsdom 模拟）。
 * 运行：node test/smoke.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(path.join(__dirname, '..', 'node_modules_tmp', 'node_modules', 'jsdom'));

const root = path.join(__dirname, '..');
const loadLib = (rel) => {
  const code = fs.readFileSync(path.join(root, rel), 'utf8');
  const fn = new Function('self', 'Node', code + '\n;return {FFParser: self.FFParser, TxtBuilder: self.TxtBuilder, EpubBuilder: self.EpubBuilder};');
  return fn({}, { TEXT_NODE: 3, ELEMENT_NODE: 1 });
};

const global = {};
const { FFParser } = loadLib('src/lib/parser.js');
// 加载 JSZip + txt/epub 到共享 global
const evalInGlobal = (rel) => {
  const code = fs.readFileSync(path.join(root, rel), 'utf8');
  return new Function('self', code + '\n;return self;');
};
evalInGlobal('src/lib/jszip.min.js')(global);
const g = evalInGlobal('src/lib/txt.js')(global);
evalInGlobal('src/lib/epub.js')(g);
const { TxtBuilder, EpubBuilder } = global;

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; console.log('  ✓ ' + msg); }
  else { failed++; console.error('  ✗ FAIL: ' + msg); }
}

// ---------- 样例 FF.net 页面 ----------
const storyHtml = `<!DOCTYPE html>
<html><head><title>Harry Potter and the Golden Path - Chapter 1 - HermioneFan</title></head>
<body>
<div id="p_login"><a href="/logout">Logout</a></div>
<div id="content_wrapper_inner">
  <div id="profile_top">
    <b class="xcontrast_txt">Harry Potter and the Golden Path</b><br>
    <span class="xgray xcontrast_txt">by</span>
    <a class="xcontrast_txt" href="/u/12345/HermioneFan">HermioneFan</a>
    <div class="xcontrast_txt" style="margin-top:5px">A retelling of the trio's seventh year at Hogwarts.</div>
    <div class="profile_top_info">Rated: Fiction T - English - Adventure/Romance - Harry P., Hermione G. - Chapters: 3 - Words: 12,345 - Reviews: 42 - Favs: 100 - Follows: 50 - Updated: 12/1/2023 - Published: 1/1/2023 - Status: Complete - id: 987654</div>
  </div>
  <select id="chap_select">
    <option value="/s/987654/1/Harry-Potter-and-the-Golden-Path" selected>1. The Letter</option>
    <option value="/s/987654/2/Harry-Potter-and-the-Golden-Path">2. Platform Nine and Three-Quarters</option>
    <option value="/s/987654/3/Harry-Potter-and-the-Golden-Path">3. The Golden Path</option>
  </select>
  <div id="storycontent">
    <div id="storytext">
      <p>A/N: This is my first fic, please review!</p>
      <p>Harry woke up in his cupboard under the stairs.</p>
      <p>The sunlight filtered through the cracks.</p>
      <br>
      <p>A/N: Hope you enjoyed chapter one.</p>
    </div>
  </div>
</div>
</body></html>`;

console.log('== FFParser ==');
{
  const dom = new JSDOM(storyHtml);
  const data = FFParser.parsePage(dom.window.document, 'https://www.fanfiction.net/s/987654/1/Harry-Potter-and-the-Golden-Path');
  assert(data.isStory === true, '识别为小说页');
  assert(data.storyId === '987654', 'storyId 解析: ' + data.storyId);
  assert(data.cloudflare === false, '非 Cloudflare 拦截');
  assert(data.adultGate === false, '非成人门');
  assert(data.loggedIn === true, '登录状态检测');
  assert(data.meta && data.meta.title === 'Harry Potter and the Golden Path', '标题');
  assert(data.meta.author === 'HermioneFan', '作者');
  assert(data.meta.rating === 'T', '评分: ' + data.meta.rating);
  assert(data.meta.chapters === '3', '总章节数: ' + data.meta.chapters);
  assert(data.meta.words === '12,345', '字数');
  assert(data.meta.status === 'Complete', '状态: ' + data.meta.status);
  assert(data.chapterList && data.chapterList.length === 3, '章节列表 3 章');
  assert(data.chapter.index === 1, '当前章节 index 1');
  assert(data.chapter.title === 'The Letter', '章节标题: ' + data.chapter.title);
  assert(data.chapter.text.includes('Harry woke up in his cupboard'), '正文包含段落');
  assert(data.chapter.text.includes('A/N: This is my first fic'), '作者注包含');
  assert(data.chapter.text.split('\n').filter(l=>l.trim()).length === 4, '段落数=4 (含首尾A/N)');
}

// ---------- 未登录 + 成人门 ----------
console.log('== 成人内容门 ==');
{
  const gateHtml = storyHtml.replace('<a href="/logout">Logout</a>', '<a href="/login">Login</a>')
    .replace(/<div id="storytext">[\s\S]*?<\/div>\s*<\/div>/i, '<p>This story may contain adult content. You must be logged in to view it.</p>');
  const dom = new JSDOM(gateHtml);
  const data = FFParser.parsePage(dom.window.document, 'https://www.fanfiction.net/s/987654/1/');
  assert(data.adultGate === true, '检测到成人内容门');
  assert(data.loggedIn === false, '未登录检测');
}

// ---------- Cloudflare ----------
console.log('== Cloudflare ==');
{
  const cfHtml = '<html><head><title>Just a moment...</title></head><body><form id="challenge-form"></form></body></html>';
  const dom = new JSDOM(cfHtml);
  const data = FFParser.parsePage(dom.window.document, 'https://www.fanfiction.net/s/987654/1/');
  assert(data.cloudflare === true, '检测到 Cloudflare 校验页');
}

// ---------- TxtBuilder ----------
console.log('== TxtBuilder ==');
{
  const meta = { title: 'T', author: 'A', rating: 'T', words: '100', chapters: '1', summary: 'S' };
  const chapters = [{ index: 1, title: 'Ch1', text: 'Para one.\n\nPara two.' }];
  const txt = TxtBuilder.build(meta, chapters);
  assert(txt.startsWith('T\n'), 'TXT 首行为标题');
  assert(txt.includes('作者：A'), 'TXT 含作者');
  assert(txt.includes('Ch1'), 'TXT 含章节名');
  assert(txt.includes('Para one.'), 'TXT 含正文');
}

// ---------- EpubBuilder ----------
console.log('== EpubBuilder ==');
{
  (async () => {
    const meta = { title: 'Test Book', author: 'Author Name', storyId: '987654' };
    const chapters = [
      { index: 1, title: 'Chapter One', text: 'Hello <world> & everyone.\nSecond para.' },
      { index: 2, title: 'Chapter Two', text: 'More content.' }
    ];
    const blob = await EpubBuilder.build(meta, chapters);
    assert(blob instanceof Blob, 'EPUB 生成 Blob');
    assert(blob.size > 500, 'EPUB 大小合理: ' + blob.size);
    assert(blob.type === 'application/epub+zip', 'MIME 正确');
    const buf = Buffer.from(await blob.arrayBuffer());
    assert(buf.slice(0, 4).toString() === 'PK\u0003\u0004', 'EPUB 是 zip 格式');
    // 验证 mimetype 条目未被压缩（STORE）
    const s = buf.slice(30, 62).toString();
    console.log('    zip 头部采样:', JSON.stringify(buf.slice(30, 58).toString()));
  })().then(() => {
    console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
    process.exit(failed ? 1 : 0);
  }).catch((e) => { console.error('EPUB 测试异常', e); process.exit(1); });
}
