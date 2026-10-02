/**
 * EPUB3 生成器：挂载到 globalThis.EpubBuilder，依赖全局 JSZip。
 * options 支持：
 *  - includeCover    是否生成封面页（title.xhtml + 可选封面图）
 *  - includeToc      是否生成目录 NCX / nav.xhtml
 *  - language        dc:language
 *  - authorAsCreator 作者写入 dc:creator
 */
(function (global) {
  'use strict';

  const escapeXml = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

  const EpubBuilder = {
    async build(meta, chapters, options) {
      if (typeof JSZip === 'undefined') throw new Error('JSZip 未加载');
      options = options || {};
      const zip = new JSZip();
      const title = meta.title || '未命名小说';
      const author = meta.author || 'Unknown';
      const lang = options.language || 'zh';
      const authorField = (options.authorAsCreator !== false) ? author : 'Unknown';
      const uuid = 'urn:uuid:' + (meta.storyId
        ? '00000000-0000-0000-0000-' + String(meta.storyId).padStart(12, '0')
        : crypto.randomUUID());

      zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' });
      zip.file('META-INF/container.xml',
        `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`);

      const chapterFiles = [];
      chapters.forEach((ch, i) => {
        if (!ch || !ch.text) return;
        const file = 'text/chapter' + (i + 1) + '.xhtml';
        chapterFiles.push(file);
        const body = ch.text.split('\n').map((p) => {
          const t = escapeXml(p.trim());
          return t ? '<p>' + t + '</p>' : '';
        }).join('\n');
        zip.file('OEBPS/' + file,
          `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(lang)}">
<head><title>${escapeXml(ch.title || ('第 ' + ch.index + ' 章'))}</title>
<link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
<h2 class="chapter-title">${escapeXml(ch.title || ('第 ' + ch.index + ' 章'))}</h2>
${body}
</body>
</html>`);
      });

      const manifestItems = [['css', 'style.css', 'text/css']];
      const spineOrder = [];
      if (options.includeCover !== false) {
        const titleFile = 'title.xhtml';
        zip.file('OEBPS/' + titleFile,
          `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="${escapeXml(lang)}">
<head><title>${escapeXml(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
<div class="title-page">
<h1>${escapeXml(title)}</h1>
<p class="author">${escapeXml(author)}</p>
${meta.summary ? '<p class="summary">' + escapeXml(meta.summary) + '</p>' : ''}
${meta.rating ? '<p class="meta">评分：' + escapeXml(meta.rating) + '</p>' : ''}
${meta.tags ? '<p class="meta">标签：' + escapeXml(meta.tags) + '</p>' : ''}
${meta.characters ? '<p class="meta">角色：' + escapeXml(meta.characters) + '</p>' : ''}
${meta.words ? '<p class="meta">字数：' + escapeXml(meta.words) + '</p>' : ''}
${meta.status ? '<p class="meta">状态：' + escapeXml(meta.status) + '</p>' : ''}
</div>
</body>
</html>`);
        manifestItems.unshift(['title', titleFile, 'application/xhtml+xml']);
        spineOrder.push('title');
      }
      chapterFiles.forEach((f, i) => manifestItems.push(['ch' + (i + 1), f, 'application/xhtml+xml']));
      chapterFiles.forEach((_, i) => spineOrder.push('ch' + (i + 1)));

      if (options.includeToc !== false) {
        manifestItems.push(['ncx', 'toc.ncx', 'application/x-dtbncx+xml']);
        manifestItems.push(['nav', 'nav.xhtml', 'application/xhtml+xml']);

        const navLi = chapterFiles.map((f, i) => {
          const ch = chapters[i];
          return `    <li><a href="${f}">${escapeXml(ch.title || ('第 ' + ch.index + ' 章'))}</a></li>`;
        }).join('\n');

        zip.file('OEBPS/toc.ncx',
          `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${uuid}"/>
    <meta name="dtb:depth" content="1"/>
  </head>
  <docTitle><text>${escapeXml(title)}</text></docTitle>
  <navMap>
${(options.includeCover !== false) ? '    <navPoint id="title" playOrder="1"><navLabel><text>封面</text></navLabel><content src="title.xhtml"/></navPoint>\n' : ''}
${chapterFiles.map((f, i) => `    <navPoint id="ch${i + 1}" playOrder="${i + 2}"><navLabel><text>${escapeXml(chapters[i].title || ('第 ' + chapters[i].index + ' 章'))}</text></navLabel><content src="${f}"/></navPoint>`).join('\n')}
  </navMap>
</ncx>`);

        zip.file('OEBPS/nav.xhtml',
          `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${escapeXml(lang)}">
<head><title>目录</title></head>
<body>
<nav epub:type="toc" id="toc">
  <h1>目录</h1>
  <ol>
${navLi}
  </ol>
</nav>
</body>
</html>`);
      }

      zip.file('OEBPS/style.css',
        `body { font-family: serif; line-height: 1.7; margin: 1em; }
h1 { text-align: center; }
h2.chapter-title { text-align: center; margin: 1.5em 0 1em; }
p { text-indent: 2em; margin: 0.4em 0; }
.title-page { text-align: center; margin-top: 20%; }
.author { font-style: italic; }
.summary { margin-top: 2em; text-align: left; }
.meta { font-size: 0.9em; color: #555; text-align: left; }`);

      const manifestXml = manifestItems.map(([id, href, mt]) =>
        `    <item id="${id}" href="${href}" media-type="${mt}"/>`).join('\n');
      const spineXml = spineOrder.map((id) => `    <itemref idref="${id}"/>`).join('\n');

      zip.file('OEBPS/content.opf',
        `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${escapeXml(lang)}">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${uuid}</dc:identifier>
    <dc:title>${escapeXml(title)}</dc:title>
    <dc:creator>${escapeXml(authorField)}</dc:creator>
    <dc:language>${escapeXml(lang)}</dc:language>
    ${meta.summary ? '<dc:description>' + escapeXml(meta.summary) + '</dc:description>' : ''}
  </metadata>
  <manifest>
${manifestXml}
  </manifest>
  <spine${options.includeToc !== false ? ' toc="ncx"' : ''}>
${spineXml}
  </spine>
</package>`);

      return await zip.generateAsync({
        type: 'blob',
        mimeType: 'application/epub+zip',
        compression: 'DEFLATE'
      });
    }
  };

  global.EpubBuilder = EpubBuilder;
})(typeof self !== 'undefined' ? self : this);
