/**
 * 生成一个真实 EPUB 到磁盘并验证结构。
 * 运行：node test/epub-check.js
 */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require(path.join(__dirname, '..', 'node_modules_tmp', 'node_modules', 'jsdom'));
const root = path.join(__dirname, '..');

const global = {};
const evalInGlobal = (rel) => {
  const code = fs.readFileSync(path.join(root, rel), 'utf8');
  return new Function('self', code + '\n;return self;');
};
evalInGlobal('src/lib/jszip.min.js')(global);
evalInGlobal('src/lib/epub.js')(global);
const { EpubBuilder } = global;

(async () => {
  const meta = { title: '测试书名 <&>', author: '作者 & 朋友', storyId: '123456789012' };
  const chapters = [
    { index: 1, title: '第一章', text: '这是第一段。\n这是第二段。' },
    { index: 2, title: '第二章 "引号"', text: 'A & B <C>.' }
  ];
  const blob = await EpubBuilder.build(meta, chapters);
  fs.writeFileSync(path.join(root, 'test', 'sample.epub'), Buffer.from(await blob.arrayBuffer()));
  console.log('EPUB 已写入 test/sample.epub, size=' + blob.size);
})().catch(e => { console.error(e); process.exit(1); });
