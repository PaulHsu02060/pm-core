<#
  轉逐字稿工具鏈 — 共用函式（tools/·不單獨執行·由 watch-transcribe.ps1 與 setup-transcribe.ps1 dot-source）

  為什麼要有這一支（G22「同一份邏輯只有一份」）：
    安裝腳本要決定「這台該裝哪個模型」，監看腳本要決定「這台該用哪個裝置跑」——
    那是**同一個判斷**。抄成兩份的下場是有一天只改到一邊：安裝時預抓了 turbo，
    監看時卻判成 CPU＋small ⇒ 使用者等了 1.5 GB 下載，跑的卻是另一個模型，而且沒有任何提示。
  ⇒ 判斷只寫在這裡，兩邊都 dot-source 這一支。**改判準只改這個檔。**

  ⚠ 本檔存成 UTF-8 with BOM——PS 5.1 讀沒有 BOM 的檔會用 ANSI 解碼，中文全變亂碼。
  ⚠ 本檔只定義函式與常數，**不准放會執行的動作**（dot-source 進來的東西會當場跑）。
#>

# XXL 的下載來源與版本（安裝腳本用·改版號時這三行一起改）
$script:XXL_VERSION  = 'r245.4'
$script:XXL_URL      = 'https://github.com/Purfview/whisper-standalone-win/releases/download/Faster-Whisper-XXL/Faster-Whisper-XXL_r245.4_windows.7z'
$script:XXL_SIZE     = 1424256246          # bytes·來源＝GitHub Releases API 的 asset.size（權威值）
# 指紋（Paul 2026-08-27 決定①「要 pin」·同日實際下載那顆 1.4 GB 的檔算出來後填入）
# ⚠ 這個數字**不是從網路上抄來的**——Purfview 沒公布、GitHub API 的 `digest` 欄位是 null、
#   scoop／chocolatey／winget 也沒人包過它 ⇒ 唯一取得方式就是真的下載一次自己算。
#   2026-08-27 在 DM-007 上下載完整檔（大小與 GitHub API 的 asset.size 逐位元組相符）後
#   用 Get-FileHash 算出，並拿同一顆檔實測解壓＋執行都正常。
# ⛔ 換 XXL 版本時這一行**一定要跟著換**（連同 $XXL_VERSION／$XXL_URL／$XXL_SIZE 四行一起）——
#   忘了換的下場是所有人都卡在「指紋比對不符」，而那個訊息會讓人以為檔案被掉包了。
$script:XXL_SHA256   = '237DEE23939CDABFC96EF859FC5E584B842C3A5557E0D2CA744E1F87C14C5844'

# 顯存門檻：低於這個數字一律走 CPU。
# ⚠ 這是**判斷值不是實測線**——實測只知道兩點：2 GB 必 OOM（公司筆電 MX450·SOP §13-7）、
#   8 GB 沒事（家用機 RTX 3070·§11-1），中間沒有人量過。
#   代價不對稱：判太保守只是慢（CPU 還是轉得出來），判太樂觀＝ CUDA OOM 一個字都沒有，
#   而畫面上只看得到「轉檔沒成功」⇒ 刻意往保守倒，取 6 GB。
#   真的想在 4 GB 卡上試顯卡：監看那支加 `-Device cuda` 明講就會照做。
$script:VRAM_MIN_MB = 6144

# 安裝位置（Paul 2026-08-27 決定②「裝桌面」）
# ⚠ 這個路徑必須是 Find-FwExe 認得的位置之一——它們是 G18 配對，改一邊就要改另一邊。
function Get-XxlInstallRoot { return (Join-Path $env:USERPROFILE 'Desktop') }

# ── 找「下載」資料夾：不寫死 %USERPROFILE%\Downloads，OneDrive 會把它轉向到別處 ──
function Get-DownloadsFolder {
  try {
    $k = Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\User Shell Folders' -ErrorAction Stop
    $v = $k.'{374DE290-123F-4565-9164-39C4925E467B}'
    if ($v) { return [Environment]::ExpandEnvironmentVariables($v) }
  } catch {}
  return (Join-Path $env:USERPROFILE 'Downloads')
}

# ── 找 XXL：預設位置找不到就往幾個常見處掃，還是沒有就回空字串 ──
function Find-FwExe {
  $cands = @(
    (Join-Path $env:USERPROFILE 'Desktop\Faster-Whisper-XXL\faster-whisper-xxl.exe'),
    (Join-Path $env:USERPROFILE 'Desktop\轉錄測速\Faster-Whisper-XXL\faster-whisper-xxl.exe'),
    (Join-Path $env:USERPROFILE 'Faster-Whisper-XXL\faster-whisper-xxl.exe'),
    'C:\Faster-Whisper-XXL\faster-whisper-xxl.exe'
  )
  foreach ($c in $cands) { if (Test-Path $c) { return $c } }
  $g = Get-Command 'faster-whisper-xxl.exe' -ErrorAction SilentlyContinue
  if ($g) { return $g.Source }
  return ''
}

# ── 這台有沒有堪用的 NVIDIA 顯卡？回傳顯存 MB；沒有可用的 CUDA 環境回 -1 ──
#    為什麼只認 NVIDIA：XXL 的加速走 CUDA，AMD／Intel 的顯卡吃不到，有也等於沒有。
#    為什麼用 nvidia-smi 而不是 Win32_VideoController.AdapterRAM：
#      ⛔ 那個屬性是 32-bit，**超過 4 GB 會溢位**（8 GB 的卡讀出來是負數或 0）⇒ 拿它判門檻必錯。
#      nvidia-smi 是 NVIDIA 驅動自己裝的，它不在＝這台沒有可用的 CUDA 環境，直接判 CPU 就對了。
function Get-NvidiaVramMB {
  $smi = ''
  $g = Get-Command 'nvidia-smi.exe' -ErrorAction SilentlyContinue
  if ($g) { $smi = $g.Source }
  elseif (Test-Path 'C:\Windows\System32\nvidia-smi.exe') { $smi = 'C:\Windows\System32\nvidia-smi.exe' }
  if (-not $smi) { return -1 }
  try {
    $out = & $smi --query-gpu=memory.total --format=csv,noheader,nounits 2>$null
    $vals = @($out | ForEach-Object { ($_ -replace '[^\d]', '') } | Where-Object { $_ } | ForEach-Object { [int]$_ })
    if ($vals.Count -eq 0) { return -1 }
    return ($vals | Measure-Object -Maximum).Maximum
  } catch { return -1 }
}

# ── 決定「走顯卡還是 CPU、配哪個模型」──
#    回傳 @{ Device; Model; Why }：Why 是要印給使用者看的白話理由，別省略——
#    「為什麼這台是 CPU」是使用者第一個會問的事，不印他只會覺得慢得莫名其妙。
function Get-ComputeChoice {
  param([string]$WantDevice = 'auto', [string]$WantModel = '')

  if ($WantDevice -eq 'cuda') {
    $m = if ($WantModel) { $WantModel } else { 'large-v3-turbo' }
    return @{ Device = 'cuda'; Model = $m; Why = '你自己指定了 cuda（不自動判）' }
  }
  if ($WantDevice -eq 'cpu') {
    $m = if ($WantModel) { $WantModel } else { 'small' }
    return @{ Device = 'cpu'; Model = $m; Why = '你自己指定了 cpu（不自動判）' }
  }

  $vram = Get-NvidiaVramMB
  if ($vram -lt 0) {
    $m = if ($WantModel) { $WantModel } else { 'small' }
    return @{ Device = 'cpu'; Model = $m; Why = '找不到 NVIDIA 顯卡（或沒裝驅動）⇒ 走 CPU' }
  }
  if ($vram -lt $script:VRAM_MIN_MB) {
    $m = if ($WantModel) { $WantModel } else { 'small' }
    return @{ Device = 'cpu'; Model = $m
              Why = ('顯卡只有 {0} MB 顯存，低於 {1} MB 門檻 ⇒ 走 CPU（硬上顯卡會 OOM，整支轉不出來）' -f $vram, $script:VRAM_MIN_MB) }
  }
  $m = if ($WantModel) { $WantModel } else { 'large-v3-turbo' }
  return @{ Device = 'cuda'; Model = $m; Why = ('顯卡有 {0} MB 顯存 ⇒ 走顯卡' -f $vram) }
}

# ── 讓 XXL 內建的 Python 信任「這台 Windows 已經信任的憑證」────────────────────
#   ⛔ 這不是關掉驗證——是把 **Windows 的信任清單**交給那包 Python 用。
#      它預設吃自己帶的 certifi 清單，看不到公司資安軟體裝進 Windows 的攔截根憑證。
#
#   由來（2026-08-27 在 DM-007 實測抓到·**不是推測**）：一鍵安裝跑到「預抓模型」那步爆掉，
#      err log 是 `SSL: CERTIFICATE_VERIFY_FAILED ... self signed certificate in certificate chain`。
#      這台的 `Cert:\LocalMachine\Root` 裡有
#      `CN=Kaspersky Endpoint Security Personal Certification Authority` ⇒ 公司的防毒在攔 HTTPS、
#      用自簽根憑證重簽每一條連線。**Windows 信任它**（所以 curl 抓 GitHub 一路順、1.4 GB 沒問題），
#      但 XXL 那包 Python 不看 Windows 憑證庫 ⇒ **只有連 HuggingFace 抓模型那一步會爆**，
#      而且錯誤是一整片 Python traceback，完全看不出來是公司網路的事。
#   ⚠ 這在公司機器上是**常態不是例外** ⇒ 預設就做，不要等使用者踩到。設完只影響這支腳本
#      叫起來的子行程（環境變數），不動機器上任何設定。
#   ⛔ **絕對不要改成 `HF_HUB_DISABLE_SSL_VERIFICATION` 或 `CURL_CA_BUNDLE=''`**——
#      那兩個是真的把驗證關掉。這裡是「多信任 Windows 已經信任的那些」，兩件事天差地遠。
function Set-CaBundleEnv {
  $pem = Join-Path $env:TEMP 'pm-core-ca-bundle.pem'
  try {
    $sb = New-Object System.Text.StringBuilder
    $n = 0
    foreach ($store in @('Cert:\LocalMachine\Root', 'Cert:\CurrentUser\Root', 'Cert:\LocalMachine\CA')) {
      foreach ($c in (Get-ChildItem $store -ErrorAction SilentlyContinue)) {
        try {
          [void]$sb.AppendLine('-----BEGIN CERTIFICATE-----')
          [void]$sb.AppendLine([Convert]::ToBase64String($c.RawData, 'InsertLineBreaks'))
          [void]$sb.AppendLine('-----END CERTIFICATE-----')
          $n++
        } catch {}
      }
    }
    if ($n -lt 1) { return '' }
    # ⚠ 一定要 ASCII：PEM 是純文字格式，寫成 UTF-8 with BOM 會讓 OpenSSL 讀不到第一張憑證
    [System.IO.File]::WriteAllText($pem, $sb.ToString(), (New-Object System.Text.ASCIIEncoding))
    $env:SSL_CERT_FILE = $pem
    $env:REQUESTS_CA_BUNDLE = $pem
    return $pem
  } catch { return '' }
}

# ── 一小時會議大概要跑多久（給使用者一個預期·數字來源見 SOP §11／§13-7）──
function Get-SpeedHint {
  param([string]$Device, [string]$Model)
  if ($Device -eq 'cuda') { return '一小時的會議大約 1 分鐘內轉完' }
  # ⚠ CPU 這條**很看機器**，別只報一個數字：實測公司筆電（i7-1165G7）約 25 分、
  #   公司桌機（DM-007）5 分鐘的檔 53.5 秒＝一小時約 11 分 ⇒ 報區間才不會讓人以為壞了。
  if ($Model -eq 'small')  { return '一小時的會議大約 10～25 分鐘，看這台 CPU 多快（丟著去做別的事即可）' }
  return '一小時的會議可能要 50 分鐘以上（模型不是這台的最佳解）'
}

# ── 跑 Faster-Whisper-XXL：⛔ 一律走這一支，別在呼叫端自己 Start-Process（G22·第二十輪 TRx-01）──
# 病灶：`Start-Process -ArgumentList $陣列` 是把元素用空白**接起來**、而且**不會替含空白的元素加引號**。
#   詞彙表一定含空白（範本自己叫使用者用頓號或空白隔開）⇒ 只有第一個詞會進 `-prompt`，
#   其餘變成多餘的位置參數（XXL 會當成另外的輸入檔）：輕則專有名詞完全沒救到、重則整支轉檔失敗，
#   而畫面上還照樣印著「詞彙表：詞彙表.txt（N 字）」＝規則23 的靜默生效反例。
#   同型第二處：`$File.FullName` 在 OneDrive 導向（「…\OneDrive - 公司名\…」）或使用者名稱含空白時
#   也會被拆掉，而使用者看到的訊息是「✗ 沒有轉出內容——錄音可能是空的」＝指向完全錯誤的方向。
# 為什麼一直沒被實測抓到：打包產的詞彙表範本整份都是註解（守衛 test-release-package.js 還特地釘住這件事），
#   剝完是空的 ⇒ 走的是沒有空白的 $DEFAULT_PROMPT，那條路永遠是對的。
# 修法：呼叫運算子 ＋ splatting（`& $exe @args`）——PowerShell 自己處理含空白的元素。
#   2026-08-28 在 Windows PowerShell 5.1 實測：舊寫法把「亞德客 直流無刷 馬達」拆成三個參數，新寫法完整送達。
#   ⛔ log 不准順手拿掉：坑① 是「一律看輸出檔不看 exit code」，訊息還得靠它。改用 Tee-Object 落檔。
#   ⚠ `2>&1` 在這裡是安全的：兩支呼叫端都設 `$ErrorActionPreference = 'Continue'`，
#     stderr 只會變成 pipeline 裡的 ErrorRecord 被 Tee 寫進 log，不會拋出（XXL 收工必噴 0xC0000409 也一樣）。
#   ⚠ 原本另外寫的 `"$log.err"` 全 repo 沒有任何讀取端 ⇒ 併進同一個 log，訊息反而集中。
function Invoke-Fw {
  param(
    [Parameter(Mandatory)][string]$Exe,
    [Parameter(Mandatory)][string[]]$FwArgs,
    [Parameter(Mandatory)][string]$LogPath
  )
  try {
    & $Exe @FwArgs 2>&1 | Tee-Object -FilePath $LogPath | Out-Null
    return @{ Ok = $true; Err = '' }
  } catch {
    return @{ Ok = $false; Err = $_.Exception.Message }
  }
}
