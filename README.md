# FF.net 小说提取器

> 一键将 [FanFiction.net](https://www.fanfiction.net/) 上的整本小说提取并下载为 **TXT** 和 **EPUB** 文件，自动保存到系统「下载」文件夹。

Edge / Chrome 浏览器扩展（Manifest V3），适用于 Windows / macOS / Linux 桌面端 Edge 浏览器。

---

## 功能特性

- **整本抓取**：自动遍历小说所有章节，按顺序合并。
- **双格式输出**：同时生成 `.txt`（带 BOM，全平台正常显示中文）和 `.epub`（含章节目录、作者、封面元信息）。
- **实时进度**：页面底部胶囊 UI 显示进度条、当前章节、日志、错误提示。
- **后台 Service Worker + Alarms keepalive**：突破 MV3 30 秒空闲限制，长篇也能稳定抓完。
- **章节顺序校正**：基于 `currentIndex + 1` 推进，遇到 FF.net 异常跳号自动容错。
- **安全上限**：默认最多 5000 章 + 5% 余量，避免死循环。
- **可配置**：选项页可设置默认格式、章节分隔符、是否包含元数据等。

---

## 安装方法

### 方法 1：加载解压缩扩展（推荐，开发体验最好）

1. 下载本仓库源码（Code → Download ZIP 或 `git clone`）。
2. 解压后进入 `加载这个文件夹` 目录（**注意：要选这一层，里面要能直接看到 `manifest.json`**）。
3. 打开 Edge，地址栏输入 `edge://extensions/`。
4. 打开左下角「开发人员模式」开关。
5. 点左上角「加载解压缩的扩展」，选择刚才的 `加载这个文件夹`。
6. 打开任意 `https://www.fanfiction.net/s/...` 页面，底部出现蓝色「下载小说」按钮即成功。

### 方法 2：用 build.ps1 自行打包

```powershell
# 在项目根目录执行
./build.ps1
```

打包产物输出到 `ysb/` 目录：
- `加载这个文件夹/` —— Edge 加载解压缩时选它（核心）
- `备用文件/小说提取器-v1.0.6.zip` —— 压缩包备份
- `备用文件/小说提取器-v1.0.6.crx` —— 双击安装包（Edge 需额外策略，不推荐）
- `备用文件/ffnet-extractor.pem` —— 签名私钥，**重打包必须保留，别删**
- `安装说明.txt` —— 给最终用户看的说明

---

## 使用方法

1. 安装扩展后，打开任意 FF.net 小说页面（章节页或故事主页均可）。
2. 页面底部中央会出现蓝色胶囊「下载小说」。
3. 点击胶囊，弹出操作面板：
   - **格式**：勾选 TXT / EPUB（默认两个都勾）。
   - 点 **开始提取**：开始抓取。
   - 进度条实时显示 `已抓 / 总章`，日志框显示当前章节状态。
4. 抓取完成后，浏览器自动下载到系统「下载」文件夹。
   - 文件名：`作者 - 书名.txt` / `.epub`
5. 出错时可点 **重置** 清空状态重来。

---

## 项目结构

```
ffnet-novel-extractor/
├── manifest.json              # MV3 清单
├── build.ps1                  # 一键打包脚本
├── 安装说明.txt                # 给最终用户的说明
├── README.md
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── background/
│   │   └── service-worker.js  # 状态机 + 章节调度 + keepalive + 文件生成
│   ├── content/
│   │   ├── extractor.js        # 页面 DOM 解析（标题/作者/正文）
│   │   ├── inject.css          # 底部胶囊 UI 样式
│   │   └── inject.js           # 胶囊 UI + 面板 + 状态渲染
│   ├── lib/
│   │   ├── parser.js           # URL 解析、章节 DOM 提取
│   │   ├── txt.js              # TXT 生成（含 BOM）
│   │   ├── epub.js             # EPUB 生成（含 zip 打包）
│   │   ├── jszip.min.js        # ZIP 打包库
│   │   └── settings.js         # 选项读写
│   ├── options/
│   │   ├── options.html / .css / .js   # 选项页
│   └── popup/
│       └── popup.html / .css / .js     # 工具栏弹窗
├── release/
│   ├── 小说提取器-v1.0.6.zip    # 完整打包
│   └── 小说提取器-v1.0.6.crx    # 签名包
└── test/
    ├── crxid.js / crxid2.js / crxid-dump.js  # 扩展 ID 工具
    ├── epub-check.js           # EPUB 校验
    └── smoke.js                # 冒烟测试
```

---

## 技术要点

- **Manifest V3** + Service Worker，使用 `chrome.alarms`（最小间隔 15 秒）保活。
- **状态持久化**：所有进度写入 `chrome.storage.local` 的 `ffnet_state_v3`，刷新页面不丢。
- **章节去重**：用 `index` 字段去重，重复章节会自动跳过。
- **TXT 用 base64 data URL**：避免超长 `encodeURIComponent` 在 MV3 下载时被截断。
- **EPUB 用 JSZip**：纯前端生成，无需后端。
- **超时重试**：单页 30 秒未返回自动重新加载该章。
- **Tab 自动恢复**：抓取 tab 被关后会自动重建并继续。

---

## 版本历史

### v1.0.6

- ✅ 修复「提取开始后无法停止」问题
- ✅ 修复「提取完了也没有 txt 文件」问题
- ✅ 修复「循环提取」死循环问题
  - 新增 `effectiveCount()` 安全上限算法（默认最多 5000 章 + 5% 余量）
  - `START_V3` 现在正确传递 `chapterCount`
  - 收到章节后立即推进 `currentIndex`
- ✅ TXT 改用 base64 data URL 下载，避免超长内容截断
- ✅ `parser.js` `meta.chapters` 兜底（chap_select 优先）

### v1.0.5

- 极简 UI 重做：底部胶囊 + 展开面板
- 状态机 v3 重写

### v1.0.0

- 首个可用版本

---

## 兼容性

- ✅ Edge（Chromium 内核，推荐）
- ✅ Chrome
- ⚠️ Firefox：未测试，MV3 兼容性未知
- ❌ 移动端浏览器：不支持扩展

---

## 许可

本项目仅用于个人学习与研究。请遵守 FanFiction.net 的服务条款与原作版权，下载内容仅供个人离线阅读，请勿用于商业用途或公开传播。

---

## 鸣谢

- [JSZip](https://stuk.github.io/jszip/) —— EPUB 打包
- FanFiction.net 上的所有作者
