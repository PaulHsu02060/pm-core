/*! PM-Core (c) 2026 Paul Hsu. All Rights Reserved. Proprietary — see LICENSE. */
App.showSettingsTab=function(btn,id){if(id!=="範本"&&App._tplDraft&&App._tplDirty){App.confirmModal({title:"未儲存的範本內容",msg:"範本編輯有未儲存的修改，切換頁籤會遺失。確定離開？",okText:"離開不存",cancelText:"留下",okClass:"danger",onConfirm:()=>{App._tplDraft=null;App._tplDirty=false;App.showSettingsTab(btn,id)}});return}document.querySelectorAll("#page-settings .tab-btn").forEach(b=>b.classList.remove("active"));document.querySelectorAll("#page-settings .tab-panel").forEach(p=>p.classList.remove("active"));if(btn)btn.classList.add("active");const panel=document.getElementById(id);if(panel)panel.classList.add("active");if(id==="資料與備份")App._loadBackupPanel();if(id==="範本")App._loadTplPanel()};App.renderSettings=function(){if(!isAdmin())return;App._settingsDirty=false;App._bindSettingsDirty();const s=DATA.settings;document.getElementById("page-settings").innerHTML=`
    <div class="tabs" style="margin-bottom:18px;">
      <button class="tab-btn active" onclick="App.showSettingsTab(this,'排程')">排程與日曆</button>
      <button class="tab-btn" onclick="App.showSettingsTab(this,'資料與備份')">資料與備份</button>
      <button class="tab-btn" onclick="App.showSettingsTab(this,'資料來源')">資料來源</button><!-- §20.8 選配：離線版也開此 tab（AI 辨識開關在此·adapter 區塊另掛 so-online 隱藏） -->
      <button class="tab-btn" onclick="App.showSettingsTab(this,'範本')">專案範本</button>
      <button class="tab-btn so-online" onclick="App.showSettingsTab(this,'權限管理')">權限管理</button>
      <button class="tab-btn" onclick="App.showSettingsTab(this,'安全')">安全</button>
    </div>

    <div class="tab-panel active" id="排程"><div class="settings-grid">
      <!-- 個人資訊（2026-07-19 由已裁撤的「關於」tab 移入：姓名/部門仍是負責人預設/匯出建立者欄的來源） -->
      <div class="settings-section">
        <div class="ss-title">📝 個人資訊</div>
        <div class="ss-desc">你的顯示名稱——側欄問候、會議與任務的負責人預設值、匯出 Excel 的建立者欄，都用這裡的名字</div>
        <div class="ss-field">
          <label>姓名</label>
          <div><input type="text" id="set-uname" value="${U.esc(s.userName||"")}"></div>
        </div>
      </div><!-- 「部門」欄已移除（2026-07-27 減法）：存了但全站零讀取——說明文字承諾的三件事（側欄問候／負責人預設／匯出建立者）實際全部由「姓名」完成。專案的部門結構走各案 depts 名冊，非個人設定。 -->

      <!-- 工時設定（全系統單一來源，§18.10）-->
      <div class="settings-section">
        <div class="ss-title">🗓 基礎工時與排程日曆</div>
        <div class="ss-desc">此設定是全系統時程計算與人力負載分析的基準。調整後，系統會依此日曆自動預設未來所有新專案的排程工作日；變更時會提示影響範圍。</div>
        ${App.workCalFieldsHtml("set-",false)}
      </div>

      <!-- 工作日曆（公休 / 補班）匯入（§13.7·排程基準·公休/補班判 isWorkday·2026-07-16 由資料與備份遷回排程）-->
      <div class="settings-section">
        <div class="ss-title">🗓 工作日曆（公休 / 補班）</div>
        <div class="ss-desc">匯入或設定公司專屬行事曆，系統將自動解析公休與補班日，作為專案工作日之計算基礎（isWorkday／排程依此判工作日）。</div>

        <div class="cal-import">
          <div class="cal-head">
            <div class="cal-tabs">
              <button id="cal-tab-excel" class="cal-tab on" onclick="App.calInputMode('excel')">📄 匯入 Excel</button><!-- 稽核機61：「匯入」＝檔案進系統；「上傳」保留給雲端同步 -->
              <button id="cal-tab-paste" class="cal-tab" onclick="App.calInputMode('paste')">📋 貼上文字</button>
            </div>
            <button class="tb-action ghost" onclick="App.downloadCalSample()">⬇ 下載匯入範例</button>
          </div>
          <div id="cal-pane-excel" class="cal-pane">
            <label class="cal-filebtn"><i class="ti ti-table-import"></i> 選擇 Excel 檔<input type="file" accept=".xlsx,.xls" onchange="App.calImportExcelPick(this)"><span id="cal-excelName" class="cal-filename">尚未選擇</span></label>
            <div class="cal-note">讀含「日期」表頭的分頁，自動對應公休／補班；欄位對不上時會跳欄位精靈讓你指定。系統不留存檔案，只寫入解析結果。</div>
          </div>
          <div id="cal-pane-paste" class="cal-pane" style="display:none">
            <label class="cal-label">貼上行事曆文字（須含表頭那一行，如 日期／星期／類型／節日名稱／工作日；欄位順序不限）</label>
            <textarea id="cal-paste" class="cal-textarea" placeholder="日期&#9;星期&#9;類型&#9;節日名稱&#9;工作日&#10;2026-01-01&#9;四&#9;公休日&#9;元旦&#9;0"></textarea>
            <div class="cal-btns">
              <button class="tb-action" onclick="App.parseCalendarImport()">解析</button>
              <button class="tb-action ghost" onclick="App.clearCalendarPaste()">清空</button>
            </div>
          </div>
          <div id="cal-map" class="cal-map" style="display:none"></div>
          <div id="cal-preview" class="cal-preview"></div>
          <div id="cal-loaded" class="cal-loaded">${App.buildLoadedHolidaysHtml()}</div>
        </div>
      </div>

      <!-- 負荷與資源精算（§18.10d：淨工作天門檻＋預設佔用權重；部門登記已移至戰情室 Modal）-->
      <div class="settings-section ss-loadcalc">
        <div class="ss-title">📊 資源負載與自動回報機制</div>
        <div class="ss-desc">此設定僅用於系統精算「部門人力負載」與「自動偵測進度落差」，不會更動您既有的專案甘特圖排程。</div>
        <div class="form-field" style="max-width:260px;"><label class="ss-lbl-info">觸發完工回報的任務長度（天）<span class="ss-info" tabindex="0"><span class="ss-info-i">i</span><span class="ss-info-pop"><b>為什麼要設定這個？</b>為了不讓瑣碎短任務天天打擾。只有當任務的排程工期<b>大於</b>此天數，標記完成時系統才會彈窗確認「實際動工天數」（供校準未來範本）；未超過的短任務直接完成、不打擾。</span></span></label>
          <input type="number" id="set-longdays" min="1" max="90" step="1" value="${s.longTaskDays??5}" oninput="App._settingsDirty=true">
        </div>
        <div class="form-field" style="max-width:260px;"><label class="ss-lbl-info">任務未指定人力時的預設佔用率（%）<span class="ss-info" tabindex="0"><span class="ss-info-i">i</span><span class="ss-info-pop"><b>什麼是預設佔用率？</b>規劃排程時若沒指定某任務的「投入 %」，系統算部門負載時就用此比例代入（例如 50%），避免人力被無端當成「100% 塞滿」導致假性爆表。已填投入 % 的任務不受影響。</span></span></label>
          <input type="number" id="set-legacyload" min="10" max="100" step="5" value="${s.legacyLoadPct??50}" oninput="App._settingsDirty=true">
        </div>
        <div class="ss-movedout">
          <i class="ti ti-package"></i>
          <div><b>部門總人數改去哪裡設定了？</b>為了讓您「就近在看負荷的地方修改」，部門人數已移至「全專案總覽（戰情室）」的部門人力水位板中登記。<button type="button" class="ss-movedout-link" onclick="Portfolio.openDeptHeadcount()">立即前往部門人數 →</button></div>
        </div>
      </div>

      <!-- /排程 --></div></div>
    <div class="tab-panel" id="資料與備份"><div class="settings-grid">
      <!-- 純備份分頁（Paul 2026-07-19 重排）：常用的本機 JSON 備份在前、設一次的雲端備份在後；儲存模式/同步/轉譯/AI 已移「資料來源」tab -->
      <!-- Data -->
      <div class="settings-section">
        <div class="ss-title">💾 本機資料</div>
        <div class="ss-desc">管理儲存在這台瀏覽器的本機資料：手動下載 JSON 備份、上傳還原、或清除本機所有資料。<br>⚠ JSON 備份<b>不含「報表產出」的範本原檔</b>（Excel／PPT 檔本體存在瀏覽器另一區）——搬新電腦時範本要用報表頁的範本匯出功能另外帶，或重新上傳原檔。</div>

        <div class="ss-field">
          <label>站台名稱 <span style="color:var(--rose-ink); font-size:11px; font-weight:700;">必填</span></label>
          <div>
            <input type="text" id="set-station-name" value="${U.esc(s.stationName||"")}" placeholder="例：NPI-王五（辨識這台電腦的資料）" style="width:320px;${s.stationName?"":" border-color:var(--rose);"}"
              onchange="DATA.settings.stationName=this.value.trim(); Store.settings.save(); this.style.borderColor=this.value.trim()?'':'var(--rose)'; U.toast('✓ 已記住站台名稱','success',{soft:true})">
            <div class="help">會寫進 JSON 備份檔與檔名——多站台彙整/跨專案分析靠它認出「這包是誰的」（§20.10e）。${s.stationName?"":'<b style="color:var(--rose-ink);">尚未設定——下載備份時會先請你填。</b>'}</div>
          </div>
        </div>

        <div class="ss-field">
          <label>已完成清理</label>
          <div>
            <select id="set-retention">
              <option value="30" ${s.doneRetentionDays===30?"selected":""}>30 天後自動清除（推薦）</option>
              <option value="60" ${s.doneRetentionDays===60?"selected":""}>60 天後自動清除</option>
              <option value="90" ${s.doneRetentionDays===90?"selected":""}>90 天後自動清除</option>
              <option value="0" ${s.doneRetentionDays===0?"selected":""}>永不清除</option>
            </select>
          </div>
        </div>

        <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;">
          <button class="tb-action ghost" onclick="App.backupAll()">⬇ 下載 JSON 備份</button>
          <button class="tb-action ghost" onclick="document.getElementById('restoreInput').click()">⬆ 匯入還原</button><!-- 稽核機61/64：動詞與圖示統一箭頭系（同排「⬇ 下載 JSON 備份」成對） -->
          <input type="file" id="restoreInput" accept=".json" style="display:none" onchange="App.restoreAll(this.files[0])">
          <button class="tb-action danger" onclick="App.clearAll()" style="margin-left:auto;">🗑 清除所有資料</button>
        </div>
      </div>



      <!-- 雲端每日備份（§17，訪客唯讀時隱藏） -->
      <div class="settings-section cloud-sync-sec">
        <div class="ss-title">🕓 雲端備份與還原</div>
        <div class="ss-desc">系統每日會自動建立雲端資料快照，即使關閉網頁也不受影響，遭遇誤刪或故障時可隨時回溯還原。<br>💡 下方可選取歷史版本進行還原。本設定與還原功能僅限<b>管理員（Admin）權限</b>操作。</div>
        <div class="ss-field">
          <label>啟用每日備份</label>
          <div><select id="set-backup-enabled" style="width:160px;"><option value="true">啟用</option><option value="false">停用</option></select></div>
        </div>
        <div class="ss-field">
          <label>備份時間</label>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:13px; color:var(--ink3);">每天</span>
            <select id="set-backup-hour" style="width:90px;">${Array.from({length:24},(_,h)=>`<option value="${h}">${String(h).padStart(2,"0")}</option>`).join("")}</select>
            <span style="font-size:13px; color:var(--ink3);">時（台灣時間）</span>
          </div>
        </div>
        <div class="ss-field">
          <label>保留天數</label>
          <div><select id="set-backup-retention" style="width:160px;"><option value="14">14 天</option><option value="30">30 天</option><option value="60">60 天</option></select></div>
        </div>
        <div style="display:flex; gap:8px; margin-top:12px; align-items:center; flex-wrap:wrap;">
          <button class="tb-action" onclick="App.saveBackupConfig()">💾 儲存備份設定</button>
          <span id="backupStatusEl" style="font-size:12px; color:var(--ink4);">讀取備份狀態中…</span>
        </div>
        <div style="font-size:13.5px; font-weight:600; color:var(--ink2); margin:18px 0 4px; padding-top:14px; border-top:1px solid var(--rule);">⏮ 還原到歷史版本</div>
        <div class="ss-desc" style="margin-top:0;">選歷史快照還原系統狀態；⚠ 會覆蓋當前所有資料（含之後改動），建議還原前先「下載 JSON 備份」，還原時會二次確認。</div>
        <div class="ss-field">
          <label>選擇還原版本</label>
          <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
            <select id="restore-snap" style="width:240px;" onchange="App.onSnapshotPick()"><option value="">讀取中…</option></select>
            <button class="tb-action ghost" onclick="App.loadSnapshots()">🔄 重新整理</button>
          </div>
        </div>
        <div id="restorePreviewEl" style="padding:10px 12px; background:var(--surface2); border-radius:8px; margin-top:6px; font-size:12px; color:var(--ink3);">選一個版本以預覽內容。</div>
        <div style="display:flex; align-items:center; gap:12px; margin-top:12px; flex-wrap:wrap;">
          <button class="tb-action danger" onclick="App.restoreSnapshot()">⏮ 還原到此版本</button>
          <span style="font-size:12px; color:var(--ink4);">⚠ 會覆蓋目前所有資料、無法復原</span>
        </div>
      </div>

</div></div>
    <div class="tab-panel" id="資料來源"><div class="settings-grid">
      <!-- 資料來源分頁（Paul 2026-07-19 重排）＝資料存放與 API：儲存模式+跨裝置同步／錄音轉逐字稿（Buzz+雲端）／Gemini AI -->
      <!-- 儲存模式＋跨裝置同步（§20.9 合併版 2026-07-19：模式單選＝唯一開關，取代舊「啟用雲端同步」下拉與資料來源 tab 的重複卡）
           訪客唯讀時隱藏，editor/admin 才顯示：CSS body.viewonly .cloud-sync-sec；離線包整卡隱藏（強制離線模式） -->
      <div class="settings-section cloud-sync-sec">
        <div class="ss-title">☁ 資料儲存與跨裝置同步</div>
        <div class="ss-desc">設定此台設備的專案資料存放方式。不論選擇哪種模式，系統功能與計算邏輯完全相同。切換模式後，請務必點擊下方的「<b>💾 儲存所有設定</b>」以使其生效。</div>
        <label class="ss-check"><input type="radio" name="set-datasource" value="online" ${(s.dataSource||"online")!=="offline"?"checked":""} onchange="App._dsModeChange('online')"><span><b>雲端同步模式（線上版）</b><br>資料安全儲存於雲端，並自動同步至您的其他裝置（透過您個人的 Google Sheet + Apps Script 進行同步，首次使用需自行部署，請參考下方教學）。</span></label>
        <label class="ss-check"><input type="radio" name="set-datasource" value="offline" ${(s.dataSource||"online")==="offline"?"checked":""} onchange="App._dsModeChange('offline')"><span><b>本機儲存模式（離線版）</b><br>資料僅儲存於此瀏覽器中，完全不對外聯絡。適合公司內部、高機密性內網或無網路環境。<b>若需備份，請至「資料與備份」分頁手動匯出 JSON 檔保存。</b></span></label>

        <div id="cloud-sync-fields" style="${(s.dataSource||"online")==="offline"?"display:none;":""}">
        <div class="ss-field" style="margin-top:12px;">
          <label>跨裝置 Apps Script URL</label>
          <div>
            <input type="text" id="set-cloud-url" value="${U.esc(s.cloudSyncUrl||"")}" placeholder="https://script.google.com/macros/s/.../exec  (跨裝置同步 API)" style="font-family:var(--mono); font-size:11.5px;">
            <div class="help">部署跨裝置同步 Apps Script 後取得（部署方式見 README）</div>
          </div>
        </div>

        <div class="ss-field">
          <label>自動同步</label>
          <div>
            <select id="set-cloud-autosync" style="width:240px;">
              <option value="true" ${s.cloudAutoSync!==false?"selected":""}>儲存後自動上傳（推薦）</option>
              <option value="false" ${s.cloudAutoSync===false?"selected":""}>停用（僅手動）</option>
            </select>
            ${s.cloudLastSync?`
              <span style="margin-left:14px; font-size:12px; color:var(--sage-700);">
                最後同步：<b id="cloudSyncLastEl">${new Date(s.cloudLastSync).toLocaleDateString("zh-TW")} ${new Date(s.cloudLastSync).toTimeString().slice(0,5)}</b>
              </span>
            `:""}
          </div>
        </div>

        <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;">
          <button class="tb-action" onclick="App.cloudUploadNow()">⬆ 立即上傳到雲端</button>
          <button class="tb-action ghost" onclick="App.cloudDownloadNow()">⬇ 從雲端下載最新</button>
          <button class="tb-action ghost" onclick="App.cloudTestConnection()">🔌 測試連線</button>
        </div>
        <details class="ss-teach">
          <summary>📖 查看設定教學（首次使用：建立 Sheet + 部署 Apps Script）</summary>
          <div class="ss-teach-body">
            1. 在 Google Drive 新建一個 Sheet（隨意命名）<br>
            2. 開啟「擴充功能 → Apps Script」<br>
            3. 把 <code>backend/apps-script-cloud-sync.gs</code> 內容貼上、修改 SHEET_ID + Token<br>
            4. 部署 → 網頁應用程式（執行身分：我；存取對象：任何人）<br>
            5. 取得 URL 貼到上方欄位，按「儲存所有設定」<br>
            6. 在第二台裝置打開 ${CFG("APP_NAME","PM-Core")}、設定一樣的 URL + Token → 自動同步 ✨
          </div>
        </details>
        </div><!-- /cloud-sync-fields -->
      </div>

      <!-- 會議錄音轉逐字稿（§27 改版 2026-07-19 Mockup v1：方式一 Buzz 單機＝預設推薦·離線包也顯示；方式二雲端轉譯收進階摺疊·cloud-sync-sec 離線/唯讀隱藏） -->
      <div class="settings-section" id="ss-whisper">
        <div class="ss-title">🎙 會議錄音轉逐字稿</div>
        <div class="ss-desc">將會議錄音轉換為文字的兩種方式。<b>推薦使用「方式一」：免設定、完全單機運行，安裝後即可使用。</b></div>
        <div style="margin:2px 0 12px; padding:11px 14px; background:var(--sage-50); border:1.5px solid var(--sage-200); border-radius:8px; font-size:12.5px; color:var(--ink2); line-height:1.9;">
          <b style="color:var(--sage-700);">🟢 方式一：單機轉譯 Buzz（預設·推薦）</b><br>
          ${App._buzzStepsHtml?App._buzzStepsHtml():""}<!-- 教學單一來源＝transcripts.js App._buzzStepsHtml（規則10·與逐字稿視窗教學窗同文） -->
        </div>
        <details class="ss-teach cloud-sync-sec">
          <summary>⚙ 方式二：雲端自動轉譯（進階·選配）——在網頁裡直接按錄音，系統將自動轉換為逐字稿</summary>
          <div class="ss-teach-body">
            要自行部署 Apps Script＋OpenAI 金鑰、用 Google 登入，設定較繁瑣。OpenAI 金鑰藏在 Apps Script 後台；誰能用＝後端白名單（指令碼屬性 ALLOWED_EMAILS）＋Google 登入驗證，前台不存任何密碼。設定好後，逐字稿編輯視窗會多「🎙 錄音」「🎵 匯入音檔」兩顆鈕。
            <div class="ss-field" style="margin-top:10px;">
              <label>轉譯 Apps Script URL</label>
              <div>
                <input type="text" id="set-whisper-url" value="${U.esc(s.whisperUrl||"")}" placeholder="https://script.google.com/macros/s/.../exec  (語音轉譯 API)" style="font-family:var(--mono); font-size:11.5px;">
                <div class="help">部署 <code>backend/apps-script-whisper.gs</code>（JWT 版）後取得；用轉譯前要先 Google 登入</div>
              </div>
            </div>
          </div>
        </details>
      </div>

      <!-- 🤖 AI 報價單辨識金鑰（本機·不上雲·§21.16 路線2）-->
      <div class="settings-section">
        <div class="ss-title">🤖 AI 智慧辨識設定（Gemini API）</div>
        <div class="ss-desc">設定您專屬的 Gemini 金鑰，即可在物料清單使用「智慧匯入」——AI 會自動閱讀掃描的報價單，解析帶入料號、品名與單價。沒貼金鑰＝匯入時退回人工填。</div>
        <!-- §20.8 選配開關（僅離線版顯示·so-offline）：預設開（2026-07-20 拍板）·未貼金鑰前實際零外連；關＝回完全零外連 -->
        <div class="ss-field so-offline">
          <label>離線版 AI 辨識（選配）</label>
          <div>
            <select id="set-offline-ai" style="width:160px;" onchange="App.setOfflineAi(this.value)">
              <option value="false" ${s.offlineAiEnabled?"":"selected"}>停用（完全零外連）</option>
              <option value="true" ${s.offlineAiEnabled?"selected":""}>啟用</option>
            </select>
            <div class="help"><b>預設「啟用」＝功能待命，尚未連線</b>——沒貼金鑰前，系統不會發出任何對外連線；貼了金鑰後，也只在按「智慧匯入單據」解析報價單的當下，對 Google AI（generativelanguage.googleapis.com）建立唯一連線。<br><b>其他模組：</b>會議錄音／逐字稿功能 100% 在您的電腦運算，<b>絕不連網</b>。<br>平常不用管這頁——上傳 PDF 需要 AI 解析時，系統會自動引導你回來貼金鑰。<br>⚠ <b>要保證「完全零外連」＝選「停用」</b>；公司資安政策禁止任何外連時，請直接切換停用。</div>
          </div>
        </div>
        <div style="margin:2px 0 12px; padding:9px 12px; background:var(--paper); border:1px solid var(--rule); border-radius:8px; font-size:12.5px; color:var(--ink2); line-height:1.8;">
          <b>金鑰怎麼拿？（免費·約 2 分鐘）</b><br>
          1. 用瀏覽器開 <a href="https://aistudio.google.com/apikey" target="_blank" style="color:var(--sage-600);">aistudio.google.com/apikey</a>，登入你的 Google 帳號<br>
          2. 按藍色的「<b>建立 API 金鑰</b>（Create API key）」<br>
          3. 複製出現的一整串金鑰（<code style="background:var(--surface2); padding:1px 5px; border-radius:3px;">AIzaSy…</code> 或 <code style="background:var(--surface2); padding:1px 5px; border-radius:3px;">AQ.…</code> 開頭都對，照貼即可）<br>
          4. 貼到下面「Gemini API 金鑰」欄 → 按「儲存金鑰」→ 按「抓可用模型」挑一個（推薦 Flash）<br>
          免費額度就夠日常用；金鑰只存這台電腦，換機要重貼。
        </div>
        <div style="margin:2px 0 12px; padding:9px 12px; background:var(--sage-50); border:1px solid var(--sage-200); border-radius:8px; font-size:12.5px; color:var(--sage-700); line-height:1.6;">🔒 您的 API 金鑰僅儲存於<b>這台瀏覽器</b>，絕對不會上傳至雲端伺服器；換另一台設備需各自重新設定。</div>
        <div class="ss-field">
          <label>Gemini API 金鑰</label>
          <input type="text" id="set-gemini-key" placeholder="請在此貼上您的 Gemini API Key（AIzaSy… 或 AQ.… 開頭皆可）" value="${window.localStorage&&localStorage.getItem("PMCORE_GEMINI_KEY")||""}" style="font-family:monospace;" autocomplete="off">
        </div>
        <div class="ss-field" style="margin-top:10px;">
          <label class="ss-lbl-info">預設 AI 辨識模型<span class="ss-info" tabindex="0"><span class="ss-info-i">i</span><span class="ss-info-pop"><b>如何選擇模型？</b><b>Flash</b>：速度極快、免費額度高，不易觸發流量限制（推薦日常使用）。<b>Pro</b>：辨識更精準但免費額度較窄；若頻繁出現限制錯誤（如 429），建議切回 Flash。</span></span></label>
          <select id="set-gemini-model" style="padding:7px 8px;">
            ${function(){var m=window.localStorage&&localStorage.getItem("PMCORE_GEMINI_MODEL")||"gemini-flash-latest";var list=[["gemini-flash-latest","gemini-flash-latest — ⭐推薦·永遠指向最新 Flash（不會過期）"],["gemini-flash-lite-latest","gemini-flash-lite-latest — 最省·免費額度最寬"],["gemini-pro-latest","gemini-pro-latest — 最準·最新 Pro·額度較窄"],["gemini-3.5-flash","gemini-3.5-flash — 指定新版 Flash"],["gemini-2.5-flash-lite","gemini-2.5-flash-lite — 舊版備援·額度寬"]];var known=list.some(function(o){return o[0]===m});return list.map(function(o){return'<option value="'+o[0]+'"'+(o[0]===m?" selected":"")+">"+o[1]+"</option>"}).join("")+'<option value="__custom"'+(known?"":" selected")+">自訂（用下面欄位自己輸入任一型號）</option>"}()}
          </select>
        </div>
        <div class="ss-field" style="margin-top:8px;">
          <label>手動指定模型型號（進階）</label>
          <input type="text" id="set-gemini-model-custom" placeholder="留空＝用上面下拉；或輸入特定/最新型號，例 gemini-2.5-pro" value="${function(){var m=window.localStorage&&localStorage.getItem("PMCORE_GEMINI_MODEL")||"";var known=["gemini-flash-latest","gemini-flash-lite-latest","gemini-pro-latest","gemini-3.5-flash","gemini-2.5-flash-lite"];return known.indexOf(m)>=0?"":m}()}" style="font-family:monospace;" autocomplete="off">
        </div>
        <div style="margin-top:8px;"><button class="tb-action ghost" onclick="App.fetchGeminiModels()" style="padding:8px 16px;">🧪 測試金鑰並取得可用模型</button> <span class="ss-desc" style="display:inline;margin-left:6px;">不確定金鑰支援哪些模型、或跳 404「模型不存在」時按這個——向 Google 驗證你的金鑰，把可用模型填進上面下拉。</span></div>
        <div style="margin-top:10px;"><button class="tb-action" onclick="App.saveGeminiKey()" style="padding:8px 20px;">💾 儲存金鑰</button> <span id="set-gemini-hint" class="ss-desc" style="display:inline;margin-left:8px;"></span></div>
      </div>
      <!-- /資料來源 --></div></div>
    <div class="tab-panel" id="範本"><div id="tpl-admin-body"></div></div>
    <div class="tab-panel" id="權限管理"><div class="settings-grid">
      <!-- 編輯權限名單（admin/editor/viewonly，後端 Script Properties）；admin 組僅 SuperAdmin 可見可改。此 tab 已限 Admin。 -->
      <div class="settings-section">
        <div class="ss-title">👥 專案協作權限管理</div>
        <div class="ss-desc">設定可存取此系統的團隊成員。經授權的 Google 帳號登入後即可取得對應權限（名單存後端·跨裝置同步）；您可於下方列表隨時新增或移除成員。</div>
        ${isSuperAdmin()?`
        <div class="ss-field">
          <label>管理員權限（Admin）</label>
          <div>
            <div class="wl-add">
              <input type="email" id="wl-admin-input" placeholder="請輸入管理員的 Google 帳號（Email）">
              <button class="tb-action ghost" onclick="Auth.addToList('admin','wl-admin-input')">加入</button>
            </div>
            <div id="wl-admin-list" class="wl-list"></div>
          </div>
        </div>`:""}

        <div class="ss-field">
          <label>編輯者權限（Editor）</label>
          <div>
            <div class="wl-add">
              <input type="email" id="wl-editor-input" placeholder="請輸入協作者的 Google 帳號（Email）">
              <button class="tb-action ghost" onclick="Auth.addToList('editor','wl-editor-input')">加入</button>
            </div>
            <div id="wl-editor-list" class="wl-list"></div>
          </div>
        </div>

        <div class="ss-field">
          <label>唯讀者權限（Viewer）</label>
          <div>
            <div class="wl-add">
              <input type="email" id="wl-viewonly-input" placeholder="請輸入僅供檢視者的 Google 帳號（Email）">
              <button class="tb-action ghost" onclick="Auth.addToList('viewonly','wl-viewonly-input')">加入</button>
            </div>
            <div id="wl-viewonly-list" class="wl-list"></div>
          </div>
        </div>
      </div>

      <!-- ECN 流程參數配置（§19.5：呆滯料特批門檻／開關／財務特批權責名冊；由「排程」tab 遷入·2026-07-08 設定頁重構——特批「權責名冊」屬權限治理）-->
      <div class="settings-section ss-ecnparam">
        <div class="ss-title">⚙ ECN 工程設變 — 呆滯料風控設定</div>
        <div class="ss-desc">本設定僅用於「工程設變（ECN）」結案時的財務風險控制，不影響新產品開發（NPI）流程；用於防範設變導致的大額廢料未經審核即結案。</div>
        <div class="form-field" style="max-width:300px;"><label class="ss-lbl-info">超額報廢強制審核門檻（NTD $）<span class="ss-info" tabindex="0"><span class="ss-info-i">i</span><span class="ss-info-pop"><b>控制邏輯：</b>ECN 結案時若舊料報廢金額<b>超過</b>此門檻，系統會擋下自動結案，強制填寫「特批申請理由」並指定核決主管。各專案可於「專案基本資料」自訂專屬門檻，未指定時沿用此預設值。</span></span></label>
          <input type="number" id="set-ecnthreshold" min="0" step="1000" value="${s.ecnScrapThreshold??3e4}" oninput="App._settingsDirty=true">
        </div>
        <label class="ss-check"><input type="checkbox" id="set-ecngate" ${s.ecnScrapGateOn??true?"checked":""} onchange="App._settingsDirty=true"><span class="ss-lbl-info">啟用超額硬性管控（未經特批不允許結案）<span class="ss-info" tabindex="0"><span class="ss-info-i">i</span><span class="ss-info-pop"><b>勾選：</b>嚴格管控——超過門檻必須完成特批流程，否則系統拒絕結案。<b>取消勾選：</b>僅作警示——超過門檻時只以紅字提示、不強制擋結案，亦不留特批紀錄（退回現況行為）。</span></span></span></label>
        <div style="margin-bottom:14px;"></div>
        <div class="form-field"><label class="ss-lbl-info">有權簽核特批的主管名冊<span class="ss-info" tabindex="0"><span class="ss-info-i">i</span><span class="ss-info-pop"><b>簽核安全機制：</b>此為有權核准高額呆滯特批的主管名單（如廠區總經理／PMC 協理／研發處長）。ECN 結案特批時，申請人<b>僅能從此名冊點選</b>核決主管、不開放自由手打，以防隨意指派。可從現有人員挑選，或自行輸入後按「加入」。</span></span></label>
          <div class="ecn-appr">
            <div id="ecn-appr-chips" class="ecn-appr-chips">${(s.ecnApprovers||[]).map(a=>App._ecnApproverChipHtml(a)).join("")}</div>
            <div class="ecn-appr-add">
              <input id="ecn-appr-in" list="ecn-appr-roster" placeholder="輸入主管姓名，或從現有人員挑選…" onkeydown="if(event.key==='Enter'){event.preventDefault();App._ecnApproverAdd();}">
              <datalist id="ecn-appr-roster">${Portfolio.personRoster().map(r=>'<option value="'+U.esc(r.name)+'"></option>').join("")}</datalist>
              <button type="button" class="tb-action ghost" onclick="App._ecnApproverAdd()">＋ 加入</button>
            </div>
          </div>
        </div>
      </div>
      <!-- /編輯權限 --></div></div>
    <div class="tab-panel" id="安全">${App._securityTabHtml()}</div>

    <div style="text-align:center; margin-top:14px;">
      <button class="tb-action" onclick="App.saveSettings()" style="padding:12px 32px;">💾 儲存所有設定</button>
    </div>
  `;Auth.renderLists();App.bindRestAxes("set-",false)};App._bindSettingsDirty=function(){if(App._settingsDirtyBound)return;App._settingsDirtyBound=true;const mark=e=>{if(e.target&&e.target.closest&&e.target.closest("#page-settings"))App._settingsDirty=true};document.addEventListener("input",mark);document.addEventListener("change",mark)};App._confirmLeaveSettings=function(name,btn){App._pendingNav={name,btn};App.openModal({title:"設定尚未儲存",body:'<div style="font-size:14px;color:var(--ink2);line-height:1.7;">你在設定頁有未儲存的變更。要先儲存再離開嗎？</div>',footer:`<button class="tb-action ghost" onclick="App.closeModal()">取消</button>
             <button class="tb-action ghost" onclick="App._leaveSettings(false)">放棄變更離開</button>
             <button class="tb-action" onclick="App._leaveSettings(true)">儲存並離開</button>`})};App._leaveSettings=function(doSave){if(doSave&&App.saveSettings(true)===false){App.closeModal();return}const nav=App._pendingNav||{};App._pendingNav=null;if(!doSave)App._settingsDirty=false;App.closeModal();if(nav.name)App.showPage(nav.name,nav.btn,true)};App.saveSettings=function(_skipWorkConfirm){const el=id=>document.getElementById(id);const sv=id=>{const e=el(id);return e?e.value:null};const _restD=(App._restDraft||{})["set-"];const _restChanged=_restD&&_restD.length&&JSON.stringify(_restD)!==JSON.stringify(DATA.settings.restBreaks||[]);if(_restChanged){const _bad=App._lunchCheck({...DATA.settings,restBreaks:_restD});if(_bad){U.toast("休息時間存不了："+_bad,"warning");return false}}if(!_skipWorkConfirm){const _nh=sv("set-hours");const _newHours=_nh!==null?parseFloat(_nh):null;const _dp=el("set-dayPills");const _newDays=_dp?Array.from(_dp.querySelectorAll(".day-pill.on")).map(b=>parseInt(b.dataset.day)):null;const _curDays=DATA.settings.workDays||[];const _hoursChg=_newHours!==null&&!isNaN(_newHours)&&_newHours!==DATA.settings.dailyHours;const _daysChg=_newDays!==null&&(_newDays.length!==_curDays.length||_newDays.some(d=>!_curDays.includes(d)));if(_hoursChg||_daysChg){App.confirmModal({icon:"ti-alert-triangle",iconBg:"--amber-l",iconColor:"--amber-ink",title:"確認變更工時設定",msg:"修改「每日工時／每週工作日」會連動重算：<br>· 部門負載與容量線<br>· PM 與各部門負荷率<br>· 個人雜事佔比<br>· <b>每週工作日更會改變「哪幾天算工作日」→ 全系統排程日期、工期、甘特、剩餘工作天全部重算</b><br><br>確定要修改嗎？",okText:"確定修改",cancelText:"取消",onConfirm:()=>App.saveSettings(true)});return false}}let v;if((v=sv("set-hours"))!==null)DATA.settings.dailyHours=parseFloat(v);if((v=sv("set-longdays"))!==null)DATA.settings.longTaskDays=parseInt(v);if((v=sv("set-legacyload"))!==null)DATA.settings.legacyLoadPct=parseInt(v);if((v=sv("set-ecnthreshold"))!==null)DATA.settings.ecnScrapThreshold=Math.max(0,parseInt(v)||0);{const ge=el("set-ecngate");if(ge)DATA.settings.ecnScrapGateOn=ge.checked}{const cb=document.getElementById("ecn-appr-chips");if(cb)DATA.settings.ecnApprovers=Array.from(cb.querySelectorAll(".ecn-appr-chip")).map(c=>c.getAttribute("data-name")).filter(Boolean)}if(_restChanged)App._writeRestBreaks(_restD);const dayPillBox=document.getElementById("set-dayPills");if(dayPillBox){const _wd=Array.from(dayPillBox.querySelectorAll(".day-pill.on")).map(b=>parseInt(b.dataset.day));if(_wd.length)DATA.settings.workDays=_wd;else{DATA.settings.workDays=[1,2,3,4,5];U.toast("⚠ 未選任何上班日，已回復為週一~週五（排程需要至少一天工作日）","warning",{soft:true})}}if((v=sv("set-uname"))!==null)DATA.settings.userName=v.trim();if((v=sv("set-retention"))!==null)DATA.settings.doneRetentionDays=parseInt(v);const cuEl=document.getElementById("set-cloud-url");const caEl=document.getElementById("set-cloud-autosync");if(cuEl)DATA.settings.cloudSyncUrl=cuEl.value.trim();if(caEl)DATA.settings.cloudAutoSync=caEl.value==="true";const wuEl=document.getElementById("set-whisper-url");if(wuEl)DATA.settings.whisperUrl=wuEl.value.trim();delete DATA.settings.whisperToken;const dsEl=document.querySelector('input[name="set-datasource"]:checked');if(dsEl){DATA.settings.dataSource=dsEl.value;DATA.settings.cloudSyncEnabled=dsEl.value!=="offline"}Store.settings.save();App._settingsDirty=false;this.refreshUserBadge();U.toast("✓ 設定已儲存");return true};App.workCalFieldsHtml=function(p,live,opts){const s=DATA.settings;const onEdit=live?`App.wcLive('${p}')`:`App._whCapSync('${p}')`;const days=[[1,"一"],[2,"二"],[3,"三"],[4,"四"],[5,"五"],[6,"六"],[0,"日"]];const lunchOut=!!(opts&&opts.lunchOut);const capHint=App._whCapHint();return`<div class="ss-wh-row">
      <div class="form-field" style="max-width:150px;margin-bottom:0;"><label>每日標準工作時數（h）</label>
        <input type="number" id="${p}hours" min="1" max="24" step="0.5" value="${s.dailyHours}" placeholder="每日標準上班工時" oninput="${onEdit}">
      </div>
      <div class="form-field ss-wh-days" style="margin-bottom:0;"><label>固定上班日（排程工作天）</label>
        <div id="${p}dayPills" class="day-pills">${days.map(d=>`<button type="button" class="day-pill${(s.workDays||[]).includes(d[0])?" on":""}" data-day="${d[0]}" onclick="App._dayPillToggle(this);${live?onEdit:"App._settingsDirty=true"}">${d[1]}</button>`).join("")}</div>
      </div>
    </div>
    ${lunchOut?"":App.restAxesHtml(p)}
    ${lunchOut?"":`<div class="field-hint" id="${p}cap-hint" style="margin-top:8px;${capHint?"":"display:none;"}">${capHint}</div>`}`};App._bindRangeAxis=function(el,cfg){if(!el)return;el.innerHTML='<div class="tr-track"></div>';const band=document.createElement("div");band.className="tr-band"+(cfg.bandCls?" "+cfg.bandCls:"");el.appendChild(band);const pct=m=>(m-cfg.lo)/(cfg.hi-cfg.lo)*100;const pad2=n=>String(n).padStart(2,"0");for(let m=cfg.lo;m<=cfg.hi;m+=60){const h=m/60;if(h%cfg.labelStep===0){const lab=document.createElement("span");lab.className="tr-lab";lab.style.left=pct(m)+"%";lab.textContent=pad2(h);el.appendChild(lab)}const tk=document.createElement("span");tk.className="tr-tick";tk.style.left=pct(m)+"%";el.appendChild(tk)}if(cfg.grid<60)for(let m=cfg.lo;m<=cfg.hi;m+=cfg.grid){if(m%60===0)continue;const tk=document.createElement("span");tk.className="tr-tick tr-tick-minor";tk.style.left=pct(m)+"%";el.appendChild(tk)}const hS=document.createElement("div");hS.className="tr-handle";const hE=document.createElement("div");hE.className="tr-handle";el.append(hS,hE);const clampN=(v,a,b)=>Math.max(a,Math.min(b,v));const toMin=clientX=>{const r=el.getBoundingClientRect();const ratio=clampN((clientX-r.left)/(r.width||1),0,1);return clampN(Math.round((cfg.lo+ratio*(cfg.hi-cfg.lo))/cfg.grid)*cfg.grid,cfg.lo,cfg.hi)};function layout(){const v=cfg.get();hS.style.left=pct(v.s)+"%";hE.style.left=pct(v.e)+"%";band.style.left=pct(v.s)+"%";band.style.width=pct(v.e)-pct(v.s)+"%"}const drag=(h,isStart)=>{h.addEventListener("pointerdown",ev=>{if(cfg.guard&&cfg.guard())return;ev.preventDefault();try{h.setPointerCapture(ev.pointerId)}catch(e){}const mv=e=>{const v=cfg.get();const m=toMin(e.clientX);if(isStart)cfg.set(clampN(m,cfg.lo,v.e-cfg.minGap),v.e);else cfg.set(v.s,clampN(m,v.s+cfg.minGap,cfg.hi));layout()};const up=()=>{h.removeEventListener("pointermove",mv);h.removeEventListener("pointerup",up);h.removeEventListener("pointercancel",up)};h.addEventListener("pointermove",mv);h.addEventListener("pointerup",up);h.addEventListener("pointercancel",up);mv(ev)})};drag(hS,true);drag(hE,false);layout()};App._restDraft={};App._restLive={};App._REST_MAX=3;App.restAxesHtml=function(p,scopeHtml){return`<div class="ss-rest-block"><label class="ss-rest-label">休息時間（這些時段不排程）${scopeHtml||""}</label>
      <div id="${p}rest-rows"></div>
      <button type="button" class="tb-action ghost tr-rest-add" id="${p}rest-add" onclick="App._restAdd('${p}')">＋ 新增休息時間</button>
    </div>`};App.bindRestAxes=function(p,live){const t2=m=>String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");App._restDraft[p]=(typeof normRestBreaks==="function"?normRestBreaks(DATA.settings):[]).map(r=>({s:t2(r.a),e:t2(r.b),n:r.n||""}));App._restLive[p]=!!live;App._restRenderRows(p)};App._restRenderRows=function(p){const box=document.getElementById(p+"rest-rows");if(!box)return;const hm=v=>{const q=String(v||"").split(":");return(parseInt(q[0],10)||0)*60+(parseInt(q[1],10)||0)};const t2=m=>String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");const s=DATA.settings;const lo=hm(s.workStart1||"09:00"),hi=hm(s.workEnd2||"18:00");const draft=App._restDraft[p]||[];box.innerHTML="";draft.forEach((b,i)=>{const item=document.createElement("div");item.className="tr-rest-item";const head=document.createElement("div");head.className="tr-rest-head";const no=document.createElement("span");no.className="tr-rest-no";no.textContent="☕";const nameIn=document.createElement("input");nameIn.className="tr-rest-name";nameIn.type="text";nameIn.maxLength=12;nameIn.placeholder="休息 "+(i+1);nameIn.value=b.n||"";nameIn.title="幫這段休息取個名字（例如 午休、下午茶），週曆會照這個名字顯示";nameIn.addEventListener("input",()=>{draft[i].n=nameIn.value.trim()});nameIn.addEventListener("change",()=>App._restApply(p));const read=document.createElement("b");read.id=`${p}rest-read-${i}`;read.textContent=`${b.s}–${b.e}`;head.append(no,nameIn,read);if(draft.length>1){const x=document.createElement("button");x.type="button";x.className="tr-rest-x";x.textContent="✕";x.title="移除這段休息";x.onclick=()=>{if(App._roGuard&&App._roGuard())return;draft.splice(i,1);App._restRenderRows(p);App._restApply(p)};head.appendChild(x)}const ax=document.createElement("div");ax.className="tr-axis";item.append(head,ax);box.appendChild(item);App._bindRangeAxis(ax,{lo,hi,grid:15,minGap:15,labelStep:1,bandCls:"tr-band-rest",guard:()=>App._roGuard&&App._roGuard(),get:()=>({s:hm(draft[i].s),e:hm(draft[i].e)}),set:(a,z)=>{draft[i]={s:t2(a),e:t2(z),n:draft[i].n||""};const rd=document.getElementById(`${p}rest-read-${i}`);if(rd)rd.textContent=draft[i].s+"–"+draft[i].e;App._restApply(p)}})});const add=document.getElementById(p+"rest-add");if(add)add.disabled=draft.length>=App._REST_MAX};App._restAdd=function(p){if(App._roGuard&&App._roGuard())return;const draft=App._restDraft[p]||[];if(draft.length>=App._REST_MAX)return;const hm=v=>{const q=String(v||"").split(":");return(parseInt(q[0],10)||0)*60+(parseInt(q[1],10)||0)};const t2=m=>String(Math.floor(m/60)).padStart(2,"0")+":"+String(m%60).padStart(2,"0");const s=DATA.settings;const lo=hm(s.workStart1||"09:00"),hi=hm(s.workEnd2||"18:00");const tryAt=a2=>!App._lunchCheck({...DATA.settings,restBreaks:draft.concat([{s:t2(a2),e:t2(a2+15),n:""}])});const lastEnd=draft.length?Math.max.apply(null,draft.map(b=>hm(b.e))):lo;let a=Math.min(Math.max(lastEnd+60,lo+60),hi-75);if(!tryAt(a)){a=null;for(let m=lo+60;m<=hi-75;m+=15){if(tryAt(m)){a=m;break}}}if(a===null){U.toast("排不進新的休息時間了——現有休息把一天占滿，先調整或刪掉一段再加。","warning",{soft:true});return}draft.push({s:t2(a),e:t2(a+15),n:""});App._restRenderRows(p);App._restApply(p)};App._restApply=function(p){if(App._roGuard&&App._roGuard())return;const draft=App._restDraft[p]||[];const trial={...DATA.settings,restBreaks:draft};const box=document.getElementById(p+"cap-hint");if(box){const h=App._whCapHint(trial);box.innerHTML=h;box.style.display=h?"":"none"}if(App._lunchCheck(trial))return;if(App._restLive[p]){App._writeRestBreaks(draft);Store.settings.save();if(typeof Workspace!=="undefined"&&Workspace.render)Workspace.render()}else{App._settingsDirty=true}};App._writeRestBreaks=function(arr){DATA.settings.restBreaks=arr.map(b=>({s:b.s,e:b.e,n:b.n||""}));const b0=DATA.settings.restBreaks[0];if(b0){DATA.settings.workEnd1=b0.s;DATA.settings.workStart2=b0.e}};App._dayPillToggle=function(btn){if(!btn)return;const box=btn.parentElement;btn.classList.toggle("on");if(box&&!box.querySelector(".day-pill.on")){btn.classList.add("on");U.toast("⚠ 至少要保留一天上班日，否則排程算不出工作天","warning")}};App._wcRead=function(p){const g=id=>document.getElementById(p+id);const hs=g("hours"),dp=g("dayPills");const out={};if(hs&&parseFloat(hs.value))out.dailyHours=parseFloat(hs.value);if(dp)out.workDays=Array.from(dp.querySelectorAll(".day-pill.on")).map(b=>parseInt(b.dataset.day,10));return out};App.wcLive=function(p){if(App._roGuard&&App._roGuard())return;const draft={...DATA.settings,...App._wcRead(p)};const box=document.getElementById(p+"cap-hint");if(box){const h=App._whCapHint(draft);box.innerHTML=h;box.style.display=h?"":"none"}if(App._lunchCheck(draft))return;Object.assign(DATA.settings,App._wcRead(p));Store.settings.save();if(typeof Workspace!=="undefined"&&Workspace.render)Workspace.render()};App._lunchCheck=function(s){const hm=v=>{const p=String(v||"").split(":");return(parseInt(p[0],10)||0)*60+(parseInt(p[1],10)||0)};const ws1=s.workStart1||"09:00",we2=s.workEnd2||"18:00";const arr=Array.isArray(s.restBreaks)&&s.restBreaks.length?s.restBreaks:[{s:s.workEnd1,e:s.workStart2}];if(arr.length>(App._REST_MAX||3))return`休息時間最多 ${App._REST_MAX||3} 段`;const mins=[];for(const b of arr){if(!b||!b.s||!b.e)return"休息的開始與結束時間都要填";const a=hm(b.s),z=hm(b.e);if(a>=z)return"休息的結束時間要晚於開始時間";if(a<hm(ws1)||z>hm(we2))return`休息要落在上班時段 ${ws1}–${we2} 之內`;mins.push({a,z})}mins.sort((x,y)=>x.a-y.a);for(let i=1;i<mins.length;i++)if(mins[i].a<mins[i-1].z)return"兩段休息時間重疊了，請錯開";if(mins[0].a<hm(ws1)+60||mins[mins.length-1].z>hm(we2)-60)return`第一段休息前、最後一段後各要留至少 1 小時可排程（上班時段 ${ws1}–${we2}）`;return""};App._whCapHint=function(draft,opts){const s=draft||DATA.settings;const _where=opts&&opts.lunchWhere?"休息時間請至 個人工作台 ➔ 時程表設定 調整。":"";const bad=App._lunchCheck(s);if(bad)return`<span class="wh-hint-bad">⚠ ${U.esc(bad)}</span>`;const p=dailySlotPlan(s);const dh=parseFloat(s.dailyHours)||6;if(p.short){const _remMin=(typeof workWindows==="function"?workWindows(s):[]).reduce((acc,w)=>acc+(w.b-w.a),0)-p.winSlots*60;return`<span class="wh-hint-warn">⚠ 上班時段扣除休息後，只能排出 ${p.winSlots} 個 1 小時時段${_remMin>0?`（另有 ${_remMin} 分鐘零頭不足 1 小時、無法排程）`:""}，不足每日上限 ${dh} 小時。</span>系統最多排程至 ${p.lastEnd}，負荷容量仍以 ${dh} 小時計；縮短休息或調降每日工時即可一致。${_where}`}return""};App._whCapSync=function(p){p=p||"set-";App._settingsDirty=true;const box=document.getElementById(p+"cap-hint");if(!box)return;const _rd=(App._restDraft||{})[p];const h=App._whCapHint({...DATA.settings,...App._wcRead(p),restBreaks:_rd&&_rd.length?_rd:DATA.settings.restBreaks});box.innerHTML=h;box.style.display=h?"":"none"};
