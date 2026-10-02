# ============================================================
# FF.net 小说提取器 一键打包脚本
# 用法：在项目根目录执行  ./build.ps1
#
# 产物（ysb 目录）：
#   「加载这个文件夹」/    <- Edge 加载解压缩时选它（核心）
#   安装说明.txt            <- 给用户看的说明
#   「备用文件」/           <- 平时用不到的东西（zip/crx/pem/reg）
#
# 注意：备用文件里的 .pem 是签名私钥，更新版本必须复用，别删。
# ============================================================

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$outDir   = Join-Path $root 'ysb'
$ver      = '1.0.0'
$extName  = '小说提取器'
$buildDir = Join-Path $outDir 'ffnet-extractor'
$finalDir = Join-Path $outDir '加载这个文件夹'
$backupDir= Join-Path $outDir '备用文件'
$zipPath  = Join-Path $backupDir ("{0}-v{1}.zip" -f $extName, $ver)
$crxPath  = Join-Path $backupDir ("{0}-v{1}.crx" -f $extName, $ver)
$pemPath  = Join-Path $backupDir 'ffnet-extractor.pem'
$idPath   = Join-Path $backupDir 'extension-id.txt'
$tmpProfile = Join-Path $outDir 'tmp-pack-profile'

# ---------- 1. 定位 Chrome/Edge ----------
$browsers = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles(x86)\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
  "$env:LOCALAPPDATA\Microsoft\Edge\Application\msedge.exe"
)
$browser = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $browser) {
  Write-Host '[警告] 未找到 Chrome 或 Edge，跳过 crx 签名包。' -ForegroundColor Yellow
}
Write-Host '[1/5] 打包内核：' -ForegroundColor Cyan -NoNewline
if ($browser) { Write-Host $browser } else { Write-Host '(跳过 crx)' }

# ---------- 2. 组装干净的源码目录 ----------
Write-Host '[2/5] 组装扩展目录…' -ForegroundColor Cyan
if (Test-Path $buildDir) { Remove-Item -Recurse -Force $buildDir }
New-Item -ItemType Directory -Force -Path $buildDir | Out-Null
Copy-Item -Recurse -Force (Join-Path $root 'manifest.json')  $buildDir
Copy-Item -Recurse -Force (Join-Path $root 'src')            $buildDir
Copy-Item -Recurse -Force (Join-Path $root 'icons')          $buildDir

# ---------- 3. 生成 zip ----------
Write-Host '[3/5] 生成 zip 压缩包…' -ForegroundColor Cyan
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Force -Path $backupDir | Out-Null }
if (Test-Path $zipPath) { Remove-Item -Force $zipPath }
Compress-Archive -Path (Join-Path $buildDir '*') -DestinationPath $zipPath -CompressionLevel Optimal
Write-Host "      zip: $zipPath ($([math]::Round((Get-Item $zipPath).Length / 1KB, 1)) KB)"

# ---------- 4. 生成 crx（复用 pem） ----------
if ($browser) {
  Write-Host '[4/5] 生成 crx 签名包…' -ForegroundColor Cyan
  if (Test-Path $tmpProfile) { Remove-Item -Recurse -Force $tmpProfile }

  # pem 可能在 ysb/ 根目录（上次 Chrome 生成后遗留），先归位
  $strayPem = Join-Path $outDir 'ffnet-extractor.pem'
  if ((Test-Path $strayPem) -and -not (Test-Path $pemPath)) {
    Move-Item -Force $strayPem $pemPath
  }

  $packArgs = @('--pack-extension=' + $buildDir)
  if (Test-Path $pemPath) {
    $packArgs += '--pack-extension-key=' + $pemPath
  } else {
    Write-Host '      首次打包，自动生成签名密钥'
  }
  $packArgs += '--no-message-box'
  $packArgs += '--user-data-dir=' + $tmpProfile

  & $browser $packArgs 2>$null | Out-Null
  Start-Sleep -Seconds 2
  if (Test-Path $tmpProfile) { Remove-Item -Recurse -Force $tmpProfile }

  # Chrome 生成 pem 后会放在 buildDir 同级，归位到备用文件
  if ((Test-Path $strayPem) -and -not (Test-Path $pemPath)) {
    Move-Item -Force $strayPem $pemPath
  }

  $rawCrx = Join-Path $outDir 'ffnet-extractor.crx'
  if (Test-Path $rawCrx) {
    if (Test-Path $crxPath) { Remove-Item -Force $crxPath }
    Move-Item -Force $rawCrx $crxPath
    Write-Host "      crx: $crxPath ($([math]::Round((Get-Item $crxPath).Length / 1KB, 1)) KB)"

    $id = & node (Join-Path $root 'test\crxid2.js') $crxPath 2>$null
    if ($id) { Set-Content $idPath $id -NoNewline; Write-Host "      扩展 ID: $id" }
  } else {
    Write-Host '      crx 生成失败（可直接用「加载这个文件夹」）' -ForegroundColor Yellow
  }
} else {
  Write-Host '[4/5] 跳过 crx 签名。' -ForegroundColor Yellow
}

# ---------- 5. 收尾：重命名目录 + 生成说明 ----------
Write-Host '[5/5] 整理目录与说明…' -ForegroundColor Cyan

if (Test-Path $finalDir) { Remove-Item -Recurse -Force $finalDir }
Rename-Item -Path $buildDir -NewName '加载这个文件夹'

$readme = @"
====================
 FF.net 小说提取器 - 安装说明
====================

【安装步骤】（两步搞定）

1. 打开 Edge，地址栏输入：edge://extensions/
   然后打开左下角的「开发人员模式」开关

2. 点左上角「加载解压缩的扩展」
   选择本目录里的「加载这个文件夹」

完成。打开任意 fanfiction.net 小说页面，
页面底部中央会出现蓝色的「下载小说」按钮。


【常见问题】

· 提示"无法为脚本加载...src/lib/parser.js"
  -> 选错目录了，必须选「加载这个文件夹」这一层，
     进去后要能直接看到 manifest.json 文件。

· 想升级（改了代码重新打包后）
  -> 回 edge://extensions/ 页面，点扩展卡片上的「重新加载」。

· 卸载
  -> 在 edge://extensions/ 点扩展卡片的「删除」。


【备用文件说明】（在「备用文件」文件夹里，一般用不到）

· ${extName}-v${ver}.zip      压缩包备份
· ${extName}-v${ver}.crx      双击安装包（Edge 需要额外策略，不推荐）
· ffnet-extractor.pem        签名私钥（重打包必须保留，别删）
· install-trust-crx.reg      （可选）让 Edge 允许安装 crx
· uninstall-trust-crx.reg    撤销上面那个策略
· extension-id.txt           扩展编号
"@
[System.IO.File]::WriteAllText((Join-Path $outDir '安装说明.txt'), $readme, (New-Object System.Text.UTF8Encoding($true)))
Write-Host '      安装说明.txt 已生成'

# ---------- 6. 归档到 demo/{version}/ ----------
$demoDir = Join-Path $root "demo\$ver"
if (-not (Test-Path $demoDir)) {
  New-Item -ItemType Directory -Force -Path $demoDir | Out-Null
  New-Item -ItemType Directory -Force -Path (Join-Path $demoDir '备用文件') | Out-Null
  Copy-Item -Recurse -Force $finalDir $demoDir
  Copy-Item -Force $zipPath (Join-Path $demoDir '备用文件')
  if (Test-Path $crxPath) { Copy-Item -Force $crxPath (Join-Path $demoDir '备用文件') }
  Copy-Item -Force $pemPath (Join-Path $demoDir '备用文件')
  Copy-Item -Force (Join-Path $outDir '安装说明.txt') $demoDir
  Write-Host "      已归档到 demo/$ver/"
} else {
  Write-Host "      demo/$ver/ 已存在，跳过归档"
}

Write-Host ''
Write-Host '打包完成' -ForegroundColor Green
Write-Host '  安装方法：edge://extensions -> 开发者模式 -> 加载解压缩 -> 选「加载这个文件夹」' -ForegroundColor Yellow
