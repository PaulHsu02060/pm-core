<#
  會議錄音自動轉逐字稿 — 資料夾監看（tools/·使用者自己雙擊啟動·不進 run-all）

  它做什麼：盯著「下載」資料夾，看到 PM-Core 錄音下載下來的 `會議錄音-*.webm`，
            就自動用 Faster-Whisper-XXL 轉成 .txt 與 .srt 放在同一個資料夾，
            你回來把 .txt 拖進 PM-Core 的逐字稿視窗就好。

  為什麼是這個做法（階段 0·Paul 2026-08-20 選）：
    瀏覽器基於安全設計不能啟動本機程式，所以「錄完自動轉」中間一定要有一支橋。
    ⭐ 這支橋刻意做成「監看資料夾」而不是本機服務——**不開任何監聽埠、不動 PM-Core 一行程式**，
       在公司資安政策上最沒有爭議，也不必推翻 §27.12「本機服務屬架構大改另議」那條定調。
    完全在本機跑，**零外連**（模型檔已在硬碟上·拔掉網路線照樣會動，可自行驗證）。

  用法：雙擊 start-watch-transcribe.cmd（或右鍵那個檔 → 傳送到 → 桌面捷徑）。
        關掉那個黑色視窗就是停止監看。
        還沒裝轉檔程式 ⇒ 先雙擊同一個資料夾裡的 setup-transcribe.cmd（一鍵安裝）。
        ⚠ 這幾支檔有兩個落點，內容同一份（`publish-offline.sh` 打包時從 tools/ 複製過去）：
          repo ＝ tools\ 底下；發布給同事的離線包 ＝ 跟 pm-core-offline.html 同一層。
          .cmd 用 %~dp0 找同目錄的這支 .ps1 ⇒ 兩者同層即可，不必改路徑。

  用哪個轉檔程式：**只有 Faster-Whisper-XXL**（2026-08-27 §14-5 刀2 同批單引擎化·Paul 2026-08-21 定）
    ⛔ 原本還有 Buzz 備援分支，已整段移除。理由：Buzz 三個後端實測只有原版 `whisper` 乾淨
       （`fasterwhisper` 靜默吞掉整句、`whispercpp` 只吐簡體），而那唯一乾淨的一個在沒有顯卡的機器上
       慢到不能用 ⇒ **備援實質不存在**，卻佔掉全檔約 1/3 的分支與說明。
       而且會因為「未簽章執行檔」擋掉 XXL 的資安政策，多半也會擋 Buzz，還多一道安裝程式。
    ⇒ 真正的保底一直都是「音檔照樣會下載，手動轉完拖回 PM-Core」那條，那條沒有被動到。
    完整由來與實測數據 → docs/guides/轉錄工具測速-SOP.md §14-5。

  運算裝置與模型：**預設自動判**（2026-08-27 加·原本要人自己選對啟動檔）
    -Device auto（預設）＝當場問這台有沒有堪用的 NVIDIA 顯卡，再決定走顯卡還是 CPU，
    並連帶決定模型（顯卡→large-v3-turbo／CPU→small）。判斷規則見下方 Get-ComputeChoice。
    ⛔ 別把「auto」讀成舊版那個意思——舊版的 auto 是「不傳 --device、讓 XXL 自己挑」，
       而 XXL 自己挑一定挑顯卡，2 GB 級的卡直接 CUDA OOM、一個字都轉不出來（坑⑤）。

  參數（平常都不用給）：
    -Folder   要盯的資料夾（預設＝這台的「下載」資料夾·會自動處理 OneDrive 轉向）
    -Device   auto（預設·自動判）／cpu／cuda——明講就照你講的做，不再自動判
    -Model    XXL 用的模型（預設空＝跟著 -Device 的判斷走）
              ⛔ 別改成 large-v3：實測比 large-v3-turbo 慢 6 倍、正確率還低 3.9pp（SOP §6-2）
    -NoBatched  關掉批次模式（批次快 2–3 倍、正確率幾乎不變，正常不需要關）
    -FwExe    faster-whisper-xxl.exe 的路徑（預設會自己找）

  判準與完整實測數據 → docs/guides/轉錄工具測速-SOP.md（§6 記錄表·§11 最佳配置·§13 公司筆電實測）

  ⚠ 五個實測踩過、本檔已處理的坑：
    ① XXL 收工必噴 exit code 0xC0000409（檔案寫完之後的離場崩潰）⇒ 一律看輸出檔在不在，不看 exit code。
    ② XXL 的 `-f text` 輸出副檔名是 **.text**，但 PM-Core 的匯入只收 .txt/.srt/.vtt ⇒ 本檔負責改名，否則拖不進去。
    ③ 瀏覽器還在寫檔時就去轉＝轉到半截的音檔 ⇒ 本檔會等檔案大小穩定且沒被鎖住才動手。
    ④ 本檔存成 UTF-8 with BOM——PS 5.1 讀沒有 BOM 的檔會用 ANSI 解碼，中文全變亂碼。
    ⑤ ⛔ **不傳 --device ＝ XXL 一定自己挑顯卡，2 GB 級的顯卡會直接 CUDA OOM、整支轉檔失敗。**
       2026-08-21 公司筆電（MX450／2 GB）實測：預設組合（large-v3-turbo ＋ --batched）必爆
       `RuntimeError: CUDA failed with error out of memory`，一個字都轉不出來；
       而且那張卡就算閃過 OOM 也比它自己的 CPU 慢一半（GPU-small 1.23x vs CPU-small-batched 2.46x）。
       ⇒ 本檔一律明講 --device，且預設由 Get-ComputeChoice 當場判。
#>
param(
  [string]$Folder = '',
  [string]$Filter = '會議錄音-*',
  [string]$FwExe   = '',
  [string]$Model  = '',
  # ⚠ 留空＝自動：同資料夾有「詞彙表.txt」就用它，沒有才用下面那句預設（見 Get-Prompt）。
  #   明確傳 -Prompt 時一律以傳進來的為準（除錯／比對用）。
  [string]$Prompt = '',
  [switch]$NoBatched,
  [ValidateSet('auto','cpu','cuda')][string]$Device = 'auto',   # 坑⑤
  [int]$PollSeconds = 3
)

$ErrorActionPreference = 'Continue'
try { [Console]::OutputEncoding = [Text.Encoding]::UTF8 } catch {}

$AUDIO_EXT = @('.webm', '.mp4', '.ogg', '.m4a', '.mp3', '.wav', '.flac')

$DEFAULT_PROMPT = '以下是繁體中文的會議逐字稿，內容包含新專案、工程變更、試產、供應商交期、品質異常。'
$VOCAB_FILE = "$PSScriptRoot\詞彙表.txt"

# 詞彙表（§14-5c）：Whisper 的 -prompt 正是它用來認**專有名詞**的地方。
#   2026-08-27 實測：同一段音檔換三種模型，人名照樣各說各話 ⇒ 換模型救不了專有名詞，prompt 才救得了。
#   ⚠ 放同資料夾、純文字，使用者用記事本就能改——⛔ 不要叫非技術使用者去改 .ps1。
#   ⚠ 以 # 開頭的行一律當註解剝掉 ⇒ 範本檔可以整份都是說明，剝完是空的就自動退回預設。
#   ⚠ Whisper 的 prompt 有長度上限（約 224 token），太長會被**從頭截斷**、反而丟掉重要的詞 ⇒ 超過就出聲。
function Get-Prompt {
  if ($Prompt) { return @{ Text = $Prompt; Note = "由 -Prompt 參數指定" } }
  if (Test-Path $VOCAB_FILE) {
    try {
      $raw = Get-Content $VOCAB_FILE -Encoding UTF8 -ErrorAction Stop
      $body = ($raw | Where-Object { $_ -notmatch '^\s*#' }) -join ' '
      $body = ($body -replace '\s+', ' ').Trim()
      if ($body.Length -gt 0) {
        $note = "詞彙表.txt（$($body.Length) 字）"
        if ($body.Length -gt 200) { $note += " ⚠ 偏長，可能被截斷，建議 200 字內" }
        return @{ Text = $body; Note = $note }
      }
      return @{ Text = $DEFAULT_PROMPT; Note = "詞彙表.txt 目前只有說明、沒有詞 ⇒ 用預設" }
    } catch {
      return @{ Text = $DEFAULT_PROMPT; Note = "詞彙表.txt 讀不到（$($_.Exception.Message)）⇒ 用預設" }
    }
  }
  return @{ Text = $DEFAULT_PROMPT; Note = "沒有詞彙表.txt ⇒ 用預設" }
}
$promptInfo = Get-Prompt
$Prompt = $promptInfo.Text

# ⛔ 找程式／判顯卡／挑模型的邏輯**不在這裡**——那是安裝腳本也要用的同一個判斷，
#    抄第二份的下場是有一天只改到一邊（裝了 turbo 卻用 small 跑，而且不會有任何提示）。
#    單一來源＝transcribe-lib.ps1，改判準只改那一支。
$libPath = Join-Path $PSScriptRoot 'transcribe-lib.ps1'
if (-not (Test-Path $libPath)) {
  Write-Host ''
  Write-Host "  ✗ 少了共用函式檔：$libPath" -ForegroundColor Red
  Write-Host '    transcribe-lib.ps1 必須跟這支放在同一個資料夾（三支腳本是一組，不能只複製其中一支）。'
  Write-Host ''; Read-Host '  按 Enter 關閉'; exit 1
}
. $libPath

if (-not $Folder) { $Folder = Get-DownloadsFolder }
if (-not $FwExe)  { $FwExe  = Find-FwExe }

$choice   = Get-ComputeChoice -WantDevice $Device -WantModel $Model
$useDev   = $choice.Device
$useModel = $choice.Model

# ⚠ 監看這一側也要設：模型是「第一次用到才下載」的，所以第一次真的錄音時會走那條網路
#   ——而公司機器上那條會被資安軟體攔 HTTPS 擋掉（詳 transcribe-lib.ps1 的 Set-CaBundleEnv）。
#   沒設的話那次轉檔會失敗，而使用者看到的只有「轉檔沒成功」。裝好模型之後這行不影響任何事。
[void](Set-CaBundleEnv)

Write-Host ''
Write-Host '  會議錄音 → 逐字稿  自動轉檔監看' -ForegroundColor Cyan
Write-Host '  ─────────────────────────────────────────────' -ForegroundColor DarkGray

if (-not (Test-Path $Folder)) {
  Write-Host "  ✗ 找不到要盯的資料夾：$Folder" -ForegroundColor Red
  Write-Host '    用 -Folder "資料夾完整路徑" 指定一個存在的資料夾再試。'
  Write-Host ''; Read-Host '  按 Enter 關閉'; exit 1
}
if (-not ($FwExe -and (Test-Path $FwExe))) {
  Write-Host '  ✗ 找不到轉檔程式 Faster-Whisper-XXL' -ForegroundColor Red
  Write-Host ''
  Write-Host '    ⭐ 最快的解法：雙擊同一個資料夾裡的 setup-transcribe.cmd（一鍵安裝，會自己下載並設定好）'
  Write-Host ''
  Write-Host '    想自己來也可以：'
  Write-Host '    1. 到 https://github.com/Purfview/whisper-standalone-win/releases/tag/Faster-Whisper-XXL'
  Write-Host '    2. 下載 Faster-Whisper-XXL_r245.4_windows.7z（約 1.4 GB）'
  Write-Host '    3. 解壓縮，把整個 Faster-Whisper-XXL 資料夾放到「桌面」'
  Write-Host ''; Read-Host '  按 Enter 關閉'; exit 1
}

$batchNote = if ($NoBatched) { '循序（--batched 已關）' } else { '批次（--batched）' }
Write-Host "  盯著這個資料夾 ： $Folder"
Write-Host "  檔名要長這樣   ： $Filter．($($AUDIO_EXT -join ' / '))"
Write-Host "  轉檔程式       ： Faster-Whisper-XXL"
Write-Host "  運算裝置       ： $useDev" -ForegroundColor Cyan
Write-Host "                    （$($choice.Why)）" -ForegroundColor DarkGray
Write-Host "  模型           ： $useModel ・ $batchNote"
Write-Host "  程式位置       ： $FwExe"
# ⛔ 這一行不可拿掉：使用者改完詞彙表要能當場確認「有吃到」，否則他只能靠猜（規則23：靜默生效＝等於沒做）。
Write-Host "  詞彙表         ： $($promptInfo.Note)" -ForegroundColor DarkGray
Write-Host ''
Write-Host '  ⭐ 全程在這台電腦上跑，沒有任何東西送到網路上。' -ForegroundColor Green
Write-Host '     （不信可以拔掉網路線再錄一段試試，照樣會轉出來。）' -ForegroundColor DarkGray
Write-Host ''
Write-Host '  轉好的 .txt 會放在同一個資料夾，拖進 PM-Core 的逐字稿視窗即可。'
Write-Host '  ⏹ 關掉這個視窗就是停止監看。' -ForegroundColor Yellow
Write-Host '  ─────────────────────────────────────────────' -ForegroundColor DarkGray
Write-Host ''

$done   = New-Object 'System.Collections.Generic.HashSet[string]'
$failed = New-Object 'System.Collections.Generic.HashSet[string]'
$logDir = Join-Path $Folder '_逐字稿轉檔紀錄'

function Test-FileReady {
  # 瀏覽器還在寫檔的時候不能動它：①大小要連兩次相同 ②要能拿到獨佔存取（沒被鎖住）
  param([string]$Path)
  try {
    $a = (Get-Item $Path -ErrorAction Stop).Length
    Start-Sleep -Milliseconds 900
    $b = (Get-Item $Path -ErrorAction Stop).Length
    if ($a -ne $b -or $b -lt 2000) { return $false }
    $fs = [System.IO.File]::Open($Path, 'Open', 'Read', 'None')
    $fs.Close(); $fs.Dispose()
    return $true
  } catch { return $false }
}

function Convert-One {
  param([System.IO.FileInfo]$File)
  $base = [System.IO.Path]::GetFileNameWithoutExtension($File.Name)
  $dir  = $File.DirectoryName
  Write-Host ("  ▶ 開始轉：{0}" -f $File.Name) -ForegroundColor Cyan
  $t0 = Get-Date

  if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
  $log = Join-Path $logDir ($base + '.log')

  $txtFile = Join-Path $dir ($base + '.txt')
  $srtFile = Join-Path $dir ($base + '.srt')

  $a = @($File.FullName, '-m', $useModel, '--language', 'zh', '-prompt', $Prompt,
         '-f', 'text', 'srt', '-o', 'source', '--device', $useDev)
  if (-not $NoBatched) { $a += @('--batched', '--batch_size', '8') }

  # 第二十輪 TRx-01：⛔ 別改回 `Start-Process -ArgumentList $a`——它不會替含空白的元素加引號，
  #   詞彙表（一定含空白）只有第一個詞會進 -prompt，音檔路徑含空白（OneDrive 導向）也會被拆掉。
  #   單一實作在 transcribe-lib.ps1 的 Invoke-Fw（G22·三個呼叫端共用）。
  $r = Invoke-Fw -Exe $FwExe -FwArgs $a -LogPath $log
  if (-not $r.Ok) {
    Write-Host ("  ✗ 轉檔程式啟動失敗：{0}" -f $r.Err) -ForegroundColor Red
    return $false
  }

  # ⚠ 一律看檔案、不看 exit code（XXL 收工必噴 0xC0000409·坑①）
  # ⚠ .text → .txt（坑②：PM-Core 的匯入只收 .txt / .srt / .vtt，.text 會被擋掉）
  $textFile = Join-Path $dir ($base + '.text')
  if (-not (Test-Path $textFile) -or (Get-Item $textFile).Length -lt 20) {
    Write-Host '  ✗ 沒有轉出內容——錄音可能是空的，或轉檔程式出錯。' -ForegroundColor Red
    Write-Host ("    詳細訊息看：{0}" -f $log) -ForegroundColor DarkGray
    return $false
  }
  try {
    if (Test-Path $txtFile) { Remove-Item $txtFile -Force -ErrorAction Stop }
    Move-Item $textFile $txtFile -Force -ErrorAction Stop
  } catch {
    Write-Host ("  ⚠ 改名 .text → .txt 失敗：{0}（檔案還在，副檔名是 .text）" -f $_.Exception.Message) -ForegroundColor Yellow
    $txtFile = $textFile
  }

  $sec   = [math]::Round(((Get-Date) - $t0).TotalSeconds, 1)
  $chars = (Get-Content $txtFile -Encoding UTF8 -Raw -ErrorAction SilentlyContinue).Length
  Write-Host ("  ✓ 完成（{0} 秒・約 {1:N0} 字）→ {2}" -f $sec, $chars, (Split-Path $txtFile -Leaf)) -ForegroundColor Green
  if (Test-Path $srtFile) { Write-Host ("    另外也產了字幕檔 {0}" -f (Split-Path $srtFile -Leaf)) -ForegroundColor DarkGray }
  Write-Host '    ⇒ 把這個 .txt 拖進 PM-Core 的逐字稿視窗就好。' -ForegroundColor DarkGray
  Write-Host ''
  try { [Console]::Beep(880, 150); [Console]::Beep(1170, 220) } catch {}
  return $true
}

Write-Host '  監看中…（把 PM-Core 錄好的音檔下載到上面那個資料夾即可）'
Write-Host ''
while ($true) {
  try {
    $files = Get-ChildItem -Path $Folder -Filter $Filter -File -ErrorAction SilentlyContinue |
             Where-Object { $AUDIO_EXT -contains $_.Extension.ToLower() } |
             Sort-Object LastWriteTime
    foreach ($f in $files) {
      $key = $f.FullName
      if ($done.Contains($key) -or $failed.Contains($key)) { continue }
      # 已經有轉好的結果就當作做過了（重開監看不會重轉一遍）
      $sib = Join-Path $f.DirectoryName ([System.IO.Path]::GetFileNameWithoutExtension($f.Name) + '.txt')
      if (Test-Path $sib) { [void]$done.Add($key); continue }
      if (-not (Test-FileReady $f.FullName)) { continue }   # 還在寫，下一輪再看
      if (Convert-One $f) { [void]$done.Add($key) } else { [void]$failed.Add($key) }
    }
  } catch {
    Write-Host ("  ⚠ 監看時出錯（會繼續跑）：{0}" -f $_.Exception.Message) -ForegroundColor Yellow
  }
  Start-Sleep -Seconds $PollSeconds
}
