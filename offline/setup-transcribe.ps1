<#
  會議錄音轉逐字稿 — 一鍵安裝（tools/·使用者自己雙擊·不進 run-all）

  它做什麼：把「錄音自動變逐字稿」需要的東西一次弄好——
            下載轉檔程式 Faster-Whisper-XXL → 解壓到桌面 → 判斷這台該用顯卡還是 CPU
            → 先把對應的模型抓好 → 建桌面捷徑 → 直接把監看程式跑起來。
            使用者從頭到尾不用打任何指令、不用挑任何選項。

  由來（Paul 2026-08-27 問「能不能把 XXL 預載入包在 PM-Core 裡？」）：
    ⛔ 內嵌不可能——XXL 解壓後 4.5 GB、模型 1.5 GB，而 PM-Core 離線單檔只有 6.9 MB；
       更根本的是瀏覽器不能啟動本機程式（§27.12 定調未被推翻）。
    ⇒ 改成「把下載＋解壓＋挑配置＋建捷徑這四件事做成一支腳本代跑」。詳 SOP §14-5b。

  ⚠⚠ 這是整套工具裡**唯一會連外網的一支**（其餘全部零外連）。
      它只連一個地方：GitHub 的 Releases 下載點，抓那顆 1.4 GB 的壓縮檔。
      裝完之後轉檔全程離線——拔掉網路線照樣會轉，可自行驗證。
      公司機器要先過資安的話，把這一段給 MIS 看即可（另見 離線版-MIS資安說明.md）。

  用法：雙擊 setup-transcribe.cmd。
        ⚠ 三支 .ps1／.cmd 是一組，要放在同一個資料夾（release 包裡本來就是）。

  ⛔ 刻意不做的三件（Paul 2026-08-27 決定）：
    ① 下載失敗**不自動幫使用者開瀏覽器**——這整套的賣點是「全程在你電腦上跑」，
       失敗時自己彈一個瀏覽器出去，觀感上就破功了，公司資安也容易盯上這種行為。只印網址。
    ② **不下載第二支解壓工具**（原本設計要退 7zr.exe）——2026-08-27 **拿真的那顆 1.4 GB 的包實測**：
       Windows 內建的 tar.exe（bsdtar 3.8.4·含 liblzma）82 秒解完、exit 0、4.39 GB／5127 個檔，
       exe 就落在 Find-FwExe 預期的位置。真的解不開就請使用者用檔案總管手動解（Win11 本身就開得了 .7z）。
       多抓一支未簽章的 exe 只是多一個資安爭議。
    ③ **不自己裝驅動、不動任何系統設定**——判不出顯卡就走 CPU，不會去「幫忙修好」。
#>
param(
  [switch]$NoStartWatcher,      # 裝完不要自動啟動監看（測試用）
  [switch]$KeepArchive          # 解壓成功後保留那顆 1.4 GB 的 .7z（預設會刪掉）
)

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

# ⛔ 找程式／判顯卡／挑模型的邏輯不在這裡——單一來源＝transcribe-lib.ps1（G22）
$libPath = Join-Path $PSScriptRoot 'transcribe-lib.ps1'
if (-not (Test-Path $libPath)) {
  Write-Host ''
  Write-Host "  ✗ 少了共用函式檔：$libPath" -ForegroundColor Red
  Write-Host '    transcribe-lib.ps1 必須跟這支放在同一個資料夾（腳本是一組，不能只複製其中一支）。'
  Write-Host ''; Read-Host '  按 Enter 關閉'; exit 1
}
. $libPath

function Write-Step { param([int]$N, [string]$Text) Write-Host ''; Write-Host ("  [{0}/6] {1}" -f $N, $Text) -ForegroundColor Cyan }
function Write-Bad  { param([string]$Text) Write-Host ("  ✗ " + $Text) -ForegroundColor Red }
function Write-Good { param([string]$Text) Write-Host ("  ✓ " + $Text) -ForegroundColor Green }
function Write-Dim  { param([string]$Text) Write-Host ("    " + $Text) -ForegroundColor DarkGray }
function Stop-Here  { Write-Host ''; Read-Host '  按 Enter 關閉'; exit 1 }

$root     = Get-XxlInstallRoot
$xxlDir   = Join-Path $root 'Faster-Whisper-XXL'
$archive  = Join-Path $env:TEMP ('Faster-Whisper-XXL_{0}_windows.7z' -f $XXL_VERSION)
$startCmd = Join-Path $PSScriptRoot 'start-watch-transcribe.cmd'

Write-Host ''
Write-Host '  會議錄音 → 逐字稿  一鍵安裝' -ForegroundColor Cyan
Write-Host '  ─────────────────────────────────────────────' -ForegroundColor DarkGray
Write-Host '  接下來會做這幾件事（全自動，你不用選任何東西）：'
Write-Host ''
Write-Host ('    1. 下載轉檔程式 Faster-Whisper-XXL {0}（約 1.4 GB·來源 GitHub）' -f $XXL_VERSION)
Write-Host ('    2. 解壓到：{0}' -f $xxlDir)
Write-Host '    3. 判斷這台該用顯卡還是 CPU，並挑對應的模型'
Write-Host '    4. 先把那個模型抓好（第一次要連網·之後永遠離線）'
Write-Host '    5. 在桌面建一個「開始自動轉逐字稿」的捷徑'
Write-Host '    6. 直接把監看程式跑起來'
Write-Host ''
Write-Host '  ⚠ 只有第 1、4 步會連網，連的是 GitHub 與模型下載點；裝完之後轉檔全程離線。' -ForegroundColor Yellow
Write-Host '  ⚠ 網路慢的話第 1 步會跑很久，中途不要關視窗（斷了可以重跑，會從斷點續傳）。' -ForegroundColor Yellow
Write-Host '  ─────────────────────────────────────────────' -ForegroundColor DarkGray
Read-Host '  按 Enter 開始（不想裝就直接關掉這個視窗）' | Out-Null

# ══════ 1. 已經裝好了就跳過下載 ══════
Write-Step 1 '檢查有沒有裝過'
$fw = Find-FwExe
if ($fw) {
  Write-Good ("已經有了：{0}" -f $fw)
  Write-Dim '⇒ 跳過下載與解壓，直接往下做。'
} else {
  Write-Dim '沒找到，要下載。'

  $curl = 'C:\Windows\System32\curl.exe'
  if (-not (Test-Path $curl)) {
    $g = Get-Command 'curl.exe' -ErrorAction SilentlyContinue
    if ($g) { $curl = $g.Source } else { $curl = '' }
  }
  if (-not $curl) {
    Write-Bad '這台找不到 curl.exe（Windows 10 1803 以後內建），沒辦法自動下載。'
    Write-Dim '請手動下載後解壓到桌面，網址：'
    Write-Dim $XXL_URL
    Stop-Here
  }

  Write-Step 2 ('下載中…（約 1.4 GB·斷線可重跑續傳）')
  Write-Dim $XXL_URL
  # -C - ＝斷點續傳（抓一半斷掉重跑不用從頭）；--fail ＝ HTTP 錯誤就當失敗，不要把錯誤頁存成檔案
  & $curl -L --fail --retry 3 --retry-delay 5 -C - -o $archive $XXL_URL
  $curlCode = $LASTEXITCODE

  if (-not (Test-Path $archive)) {
    Write-Bad ('下載失敗（curl 結束碼 {0}），檔案根本沒產生。' -f $curlCode)
    Write-Dim '常見原因：公司網路擋掉 GitHub、或需要走 Proxy。'
    Write-Dim '要手動下載的話，網址是（複製到瀏覽器）：'
    Write-Dim $XXL_URL
    Write-Dim ('下載完把解壓出來的 Faster-Whisper-XXL 資料夾放到：{0}' -f $root)
    Stop-Here
  }

  # ── 完整性：先比大小（能擋住斷線／截斷／抓到錯的檔·來源＝GitHub API 的 asset.size）──
  $got = (Get-Item $archive).Length
  if ($got -ne $XXL_SIZE) {
    Write-Bad ('檔案大小不對：拿到 {0:N0} bytes，應該是 {1:N0} bytes。' -f $got, $XXL_SIZE)
    Write-Dim '多半是下載沒完成，或對方換過檔案。已保留檔案讓你檢查：'
    Write-Dim $archive
    Write-Dim '再跑一次這支腳本會從斷點續傳；還是不對就手動下載。'
    Stop-Here
  }
  Write-Good ('下載完成，大小正確（{0:N0} bytes）' -f $got)

  # ── 指紋：有寫死才比對；還沒寫死就把算出來的印出來讓人貼回去（見 transcribe-lib.ps1 的說明）──
  Write-Dim '正在算檔案指紋（SHA256）…這一步會讀完整個 1.4 GB，約十幾秒。'
  $sha = ''
  try { $sha = (Get-FileHash -Path $archive -Algorithm SHA256 -ErrorAction Stop).Hash } catch {}
  if ($XXL_SHA256) {
    if ($sha -and $sha.ToUpper() -eq $XXL_SHA256.ToUpper()) {
      Write-Good '指紋比對通過'
    } else {
      Write-Bad '指紋比對不符！這個檔跟預期的不一樣，為安全起見停在這裡。'
      Write-Dim ('  拿到：{0}' -f $sha)
      Write-Dim ('  預期：{0}' -f $XXL_SHA256)
      Write-Dim ('檔案保留在 {0}，請找 IT 確認後再處理。' -f $archive)
      Stop-Here
    }
  } else {
    Write-Host ''
    Write-Host '  ℹ 這個版本還沒有寫死指紋，所以這次只驗了檔案大小。' -ForegroundColor Yellow
    Write-Host ('     這個檔實際的 SHA256 是：{0}' -f $sha) -ForegroundColor Yellow
    Write-Host '     把它貼進 transcribe-lib.ps1 的 $XXL_SHA256 那一行，之後每一台都會真的比對。' -ForegroundColor DarkGray
  }

  # ══════ 解壓 ══════
  # ⚠ 先解到暫存再搬，**不要直接解到桌面**：這顆包的頂層除了 Faster-Whisper-XXL 資料夾，
  #   還有一個 license.txt（2026-08-27 拿真檔實測才發現）⇒ 直接解到桌面會在桌面多一個
  #   來路不明的 license.txt。解到暫存再只搬資料夾、把授權檔收進資料夾裡，桌面就乾淨。
  Write-Step 3 ('解壓到 {0}（約 4.4 GB·1 分半上下）' -f $root)
  $stage = Join-Path $env:TEMP 'pm-core-xxl-staging'
  $extracted = $false
  $tar = 'C:\Windows\System32\tar.exe'
  if (Test-Path $tar) {
    try { if (Test-Path $stage) { Remove-Item $stage -Recurse -Force -ErrorAction Stop } } catch {}
    New-Item -ItemType Directory -Path $stage -Force | Out-Null
    & $tar -xf $archive -C $stage
    $staged = Join-Path $stage 'Faster-Whisper-XXL'
    if (Test-Path (Join-Path $staged 'faster-whisper-xxl.exe')) {
      try {
        $lic = Join-Path $stage 'license.txt'
        if (Test-Path $lic) { Move-Item $lic (Join-Path $staged 'license.txt') -Force -ErrorAction SilentlyContinue }
        if (Test-Path $xxlDir) { Remove-Item $xxlDir -Recurse -Force -ErrorAction Stop }
        Move-Item $staged $xxlDir -Force -ErrorAction Stop
        $extracted = [bool](Find-FwExe)
      } catch {
        Write-Bad ('搬到桌面時失敗：{0}' -f $_.Exception.Message)
        Write-Dim ('解出來的東西還在 {0}，手動搬過去也可以。' -f $staged)
        Stop-Here
      }
    }
    try { if (Test-Path $stage) { Remove-Item $stage -Recurse -Force -ErrorAction Stop } } catch {}
  }
  if (-not $extracted) {
    Write-Bad '自動解壓沒成功（這台的內建 tar 可能不支援 .7z）。'
    Write-Dim '手動做也很快，Windows 11 的檔案總管本身就開得了 .7z：'
    Write-Dim ('  1. 開啟這個檔：{0}' -f $archive)
    Write-Dim ('  2. 把裡面的 Faster-Whisper-XXL 整個資料夾拖到：{0}' -f $root)
    Write-Dim '  3. 再雙擊一次這支一鍵安裝，它會接著把剩下的做完。'
    Stop-Here
  }
  Write-Good ('解壓完成：{0}' -f $xxlDir)

  if ($KeepArchive) {
    Write-Dim ('壓縮檔保留在 {0}（你加了 -KeepArchive）' -f $archive)
  } else {
    try { Remove-Item $archive -Force -ErrorAction Stop; Write-Dim '已刪掉那顆 1.4 GB 的壓縮檔（解完就沒用了，留著只是佔空間）。' } catch {}
  }
  $fw = Find-FwExe
}

# ══════ 4. 判這台該怎麼跑 ══════
Write-Step 4 '判斷這台該用顯卡還是 CPU'
$choice = Get-ComputeChoice
Write-Host ('    運算裝置：{0}' -f $choice.Device) -ForegroundColor Cyan
Write-Dim ('原因：{0}' -f $choice.Why)
Write-Host ('    模型　　：{0}' -f $choice.Model) -ForegroundColor Cyan
Write-Dim (Get-SpeedHint -Device $choice.Device -Model $choice.Model)
Write-Dim '（監看程式每次啟動都會重新判一次，換了顯卡不用重裝。）'

# ══════ 5. 先把模型抓好 ══════
Write-Step 5 ('先把模型 {0} 抓好（第一次要連網·之後永遠離線）' -f $choice.Model)
Write-Dim '做法是拿一段 1 秒的無聲音檔跑一次轉檔，順便確認這台真的跑得起來。'
$probeWav = Join-Path $env:TEMP 'pm-core-transcribe-probe.wav'
try {
  # 16kHz 單聲道 16bit、1 秒無聲：直接手寫 WAV 檔頭，不依賴任何外部工具
  $dataLen = 32000
  $ms = New-Object System.IO.MemoryStream
  $bw = New-Object System.IO.BinaryWriter($ms)
  $bw.Write([char[]]'RIFF'); $bw.Write([int](36 + $dataLen)); $bw.Write([char[]]'WAVE')
  $bw.Write([char[]]'fmt '); $bw.Write([int]16); $bw.Write([int16]1); $bw.Write([int16]1)
  $bw.Write([int]16000); $bw.Write([int]32000); $bw.Write([int16]2); $bw.Write([int16]16)
  $bw.Write([char[]]'data'); $bw.Write([int]$dataLen)
  $bw.Write((New-Object byte[] $dataLen))
  $bw.Flush()
  [System.IO.File]::WriteAllBytes($probeWav, $ms.ToArray())
  $bw.Dispose(); $ms.Dispose()
} catch {
  Write-Dim ('產測試音檔失敗（{0}）——跳過這一步，第一次真的錄音時才會抓模型。' -f $_.Exception.Message)
  $probeWav = ''
}

if ($probeWav -and (Test-Path $probeWav)) {
  # ⚠ 公司機器幾乎一定要這一步：資安軟體攔 HTTPS ⇒ 那包 Python 不信任重簽過的憑證，
  #   模型下載會爆一整片 traceback。這裡把 Windows 的信任清單交給它用（不是關掉驗證）。詳 transcribe-lib.ps1
  $pem = Set-CaBundleEnv
  if ($pem) { Write-Dim '已把這台 Windows 信任的憑證清單交給下載程式用（公司網路攔 HTTPS 時需要）。' }
  $probeLog = Join-Path $env:TEMP 'pm-core-transcribe-probe.log'
  # ⚠ 變數不能叫 $args——那是 PowerShell 的自動變數，覆寫它會踩到不好查的怪事
  $probeArgs = @($probeWav, '-m', $choice.Model, '--language', 'zh', '-f', 'text',
                 '-o', (Split-Path $probeWav -Parent), '--device', $choice.Device)
  # 第二十輪 TRx-01：同一支共用實作（⛔ 別在這裡自己 Start-Process——`$probeWav` 與 `-o` 的資料夾
  #   都可能含空白，被拆掉之後看到的訊息會是「沒有轉出內容」，指向完全錯誤的方向）。
  $pr = Invoke-Fw -Exe $fw -FwArgs $probeArgs -LogPath $probeLog
  if (-not $pr.Ok) { Write-Dim ('跑不起來：{0}' -f $pr.Err) }
  # ⚠ 不看 exit code——XXL 收工必噴 0xC0000409（檔案已經寫完之後的離場崩潰）
  $modelDir = Join-Path (Split-Path $fw -Parent) '_models'
  $hit = @()
  if (Test-Path $modelDir) { $hit = @(Get-ChildItem $modelDir -Directory -Filter ('*' + $choice.Model + '*') -ErrorAction SilentlyContinue) }
  if ($hit.Count -gt 0) {
    Write-Good ('模型就位：{0}' -f $hit[0].FullName)
  } else {
    Write-Host '  ⚠ 沒能確認模型抓好了。' -ForegroundColor Yellow
    Write-Dim '不算致命——第一次真的錄音轉檔時它會自己再抓一次（那次要等比較久）。'
    Write-Dim ('要看發生什麼事：{0}' -f "$probeLog.err")
    # ⚠ 最常見的兩種失敗都不是「程式壞了」，直接把話講白，不要讓人去讀那一整片 Python traceback
    $errTxt = ''
    try { $errTxt = Get-Content "$probeLog.err" -Raw -ErrorAction Stop } catch {}
    if ($errTxt -match 'CERTIFICATE_VERIFY_FAILED|SSLError|self signed certificate') {
      Write-Host '  ⇒ 看起來是公司網路在攔 HTTPS（把憑證換成公司自簽的）。' -ForegroundColor Yellow
      Write-Dim '    本腳本已經先把 Windows 的憑證清單交給它用了，還是不行代表這台的政策更嚴。'
      Write-Dim ('    最快的解法：從別台已經裝好的機器，把整個 {0}\_models 資料夾複製過來（不必重下載）。' -f $xxlDir)
    } elseif ($errTxt -match 'ConnectionError|Max retries|Failed to establish|getaddrinfo') {
      Write-Host '  ⇒ 看起來是連不到模型下載點（HuggingFace）。' -ForegroundColor Yellow
      Write-Dim ('    網路恢復後再跑一次這支就好；或從別台把 {0}\_models 整個資料夾複製過來。' -f $xxlDir)
    }
  }
  foreach ($p in @($probeWav, ($probeWav -replace '\.wav$', '.text'))) {
    try { if (Test-Path $p) { Remove-Item $p -Force -ErrorAction Stop } } catch {}
  }
}

# ══════ 6. 桌面捷徑 ══════
Write-Step 6 '在桌面建捷徑，並把監看程式跑起來'
if (-not (Test-Path $startCmd)) {
  Write-Host '  ⚠ 找不到 start-watch-transcribe.cmd，跳過建捷徑。' -ForegroundColor Yellow
  Write-Dim '（三支腳本要放在同一個資料夾——只複製其中一支就會這樣。）'
} else {
  try {
    $lnk = Join-Path ([Environment]::GetFolderPath('Desktop')) '開始自動轉逐字稿.lnk'
    $ws  = New-Object -ComObject WScript.Shell
    $sc  = $ws.CreateShortcut($lnk)
    $sc.TargetPath       = $startCmd
    $sc.WorkingDirectory = $PSScriptRoot
    $sc.Description      = 'PM-Core：開著它，錄完的會議就會自動轉成逐字稿'
    $sc.Save()
    Write-Good ('桌面捷徑好了：{0}' -f (Split-Path $lnk -Leaf))
  } catch {
    Write-Host ('  ⚠ 建捷徑失敗：{0}' -f $_.Exception.Message) -ForegroundColor Yellow
    Write-Dim ('不影響使用，直接雙擊 {0} 也一樣。' -f (Split-Path $startCmd -Leaf))
  }
}

Write-Host ''
Write-Host '  ─────────────────────────────────────────────' -ForegroundColor DarkGray
Write-Host '  🎉 裝好了。之後每天開工只要做一件事：' -ForegroundColor Green
Write-Host '     雙擊桌面的「開始自動轉逐字稿」，讓那個黑色視窗開著。'
Write-Host ''
Write-Host '  然後在 PM-Core 的逐字稿視窗按 🎙 錄音 → 開完會按停止 →'
Write-Host '  黑色視窗會自己轉完並嗶兩聲 → 把產生的 .txt 拖回逐字稿視窗就好。'
Write-Host '  ─────────────────────────────────────────────' -ForegroundColor DarkGray
Write-Host ''

if ($NoStartWatcher) {
  Write-Dim '（你加了 -NoStartWatcher，這次不自動啟動監看。）'
  Read-Host '  按 Enter 關閉' | Out-Null
} elseif (Test-Path $startCmd) {
  Write-Host '  正在幫你把監看程式開起來…' -ForegroundColor Cyan
  try { Start-Process -FilePath $startCmd -WorkingDirectory $PSScriptRoot } catch {
    Write-Host ('  ⚠ 啟動失敗：{0}——自己雙擊桌面捷徑即可。' -f $_.Exception.Message) -ForegroundColor Yellow
    Read-Host '  按 Enter 關閉' | Out-Null
  }
} else {
  Read-Host '  按 Enter 關閉' | Out-Null
}
