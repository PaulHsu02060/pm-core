// settings.js — 設定頁(行事曆/安全/雲端同步/登出)+ 備份還原(App.*)。app.js 之後載入；TDZ 鐵則見 docs §18.7.1。
// ═══════════════════════════════════════════════════════
//  PAGE: SETTINGS
// ═══════════════════════════════════════════════════════
// 設定頁子分頁切換：純切 .active class（CSS display 控制顯隱），不 re-render。
//   → 各 tab 的 set-* 元素永遠留在 DOM，saveSettings 跨 tab 讀取不會 crash。
//   querySelectorAll 限定 #page-settings，避免動到儀表板/專案頁的 .tab-btn。
App.showSettingsTab = function(btn, id) {
  // §19.11 E：離開「專案範本」tab 但範本編輯未存 → 先彈窗（切別 tab 會重繪清掉 draft）
  if (id !== '範本' && App._tplDraft && App._tplDirty) {
    App.confirmModal({ title: '未儲存的範本內容', msg: '範本編輯有未儲存的修改，切換頁籤會遺失。確定離開？', okText: '離開不存', cancelText: '留下', okClass: 'danger',
      onConfirm: () => { App._tplDraft = null; App._tplDirty = false; App.showSettingsTab(btn, id); } });
    return;
  }
  document.querySelectorAll('#page-settings .tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('#page-settings .tab-panel').forEach(p => p.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const panel = document.getElementById(id);
  if (panel) panel.classList.add('active');
  if (id === '資料與備份') App._loadBackupPanel();   // §17：進 tab 才拉備份設定 + 快照清單
  if (id === '範本') App._loadTplPanel();             // §19.11：進 tab 才渲染範本卡片列
};

App._pendingCalendar = null;   // 解析後暫存，確認才寫入

// §工作日曆匯入器欄位規格（別名對齊 app.js parseCalendarPaste 的 SYN·單一真實來源）；供 Excel 精靈＋下載範例
const CAL_COLUMNS = [
  { key: 'date', header: '日期', aliases: ['Date', '年月日', '西元日期'], tip: '公休/補班的日期（YYYY-MM-DD）', sample: '2026-01-01' },
  { key: 'type', header: '類型', aliases: ['假別', '性質', '類別', 'Type'], tip: '「公休日」或「補班」——決定這天放假還是要上班', sample: '公休日' },
  { key: 'name', header: '節日名稱', aliases: ['名稱', '假日名', '說明', '節日', 'Name'], tip: '假日／補班名稱（顯示用，選填）', sample: '元旦' },
  { key: 'workday', header: '工作日', aliases: ['上班', '是否上班', 'Workday'], tip: '0＝放假、1＝上班（沒有「類型」欄時用來判定，選填）', sample: '0' },
  { key: 'weekday', header: '星期', aliases: ['Weekday', '週次'], tip: '星期幾（選填，輔助判定補班）', sample: '四' },
];
const CAL_REQUIRED_KEYS = ['date', 'type'];

// 解析貼上文字 → 沙盒預覽（不寫入）。共用 _calShowPreview
App.parseCalendarImport = function() {
  const ta = document.getElementById('cal-paste');
  const text = ((ta && ta.value) || '').trim();
  if (!text) { App._calShowPreview({ error: '請先貼上行事曆文字' }); return; }
  App._calShowPreview(D.parseCalendarPaste(text));
};

// 共用沙盒預覽 renderer（貼文字／Excel 兩路徑共用）：error→提示、0 筆→引導、有料→沙盒卡＋確認鈕
App._calShowPreview = function(r) {
  const prev = document.getElementById('cal-preview'); if (!prev) return;
  const map = document.getElementById('cal-map'); if (map) { map.innerHTML = ''; map.style.display = 'none'; }
  if (r.error) { App._pendingCalendar = null; prev.innerHTML = `<div class="cal-hint">${U.esc(r.error)}</div>`; return; }
  const N = Object.keys(r.holidays).length, M = Object.keys(r.workOverrides).length, K = r.skipped || 0;
  if (N === 0 && M === 0) {
    App._pendingCalendar = null;
    prev.innerHTML = `<div class="cal-hint">未解析到公休／補班（跳過 ${K} 行）。請確認有「類型」欄（公休日／補班），或「工作日」欄填 0／1。未寫入。</div>`;
    return;
  }
  App._pendingCalendar = { holidays: r.holidays, workOverrides: r.workOverrides };
  const cur = Object.keys((DATA.calendars && DATA.calendars.base && DATA.calendars.base.holidays) || {}).length;
  prev.innerHTML =
    `<div class="cal-sandbox"><div class="cal-sb-big"><span class="cal-sb-num">${N + M}</span><span class="cal-sb-lbl">預計寫入筆數</span></div>` +
    `<div class="cal-sb-chips"><span class="cal-chip hol">公休 ${N}</span><span class="cal-chip wk">補班 ${M}</span>${K ? `<span class="cal-chip skip">跳過 ${K}</span>` : ''}</div>` +
    `<div class="cal-sb-warn">⚠ 將<b>覆蓋現有 ${cur} 筆公休</b>（整批取代）${K ? '；跳過的為無效日期，不寫入' : ''}。</div></div>` +
    `<button class="tb-action" onclick="App.confirmCalendarImport()">✓ 確認寫入 ${N + M} 筆</button>`;
};

// 確認寫入：整批覆蓋 base.holidays（+ 有補班才寫 override.workOverrides）→ Storage.save → 重渲染
App.confirmCalendarImport = function() {
  const p = App._pendingCalendar;
  if (!p || !Object.keys(p.holidays).length) { U.toast('⚠ 沒有可寫入的公休', 'warning'); return; }
  if (!DATA.calendars) DATA.calendars = { base: { name: '台灣公版', holidays: {} }, override: null };
  DATA.calendars.base.holidays = p.holidays;
  if (Object.keys(p.workOverrides).length) {
    if (!DATA.calendars.override) DATA.calendars.override = { name: '公司調休', extraHolidays: {}, workOverrides: {} };
    DATA.calendars.override.workOverrides = p.workOverrides;
  }
  Store.calendars.save();
  const n = Object.keys(p.holidays).length;
  App._pendingCalendar = null;
  const ta = document.getElementById('cal-paste'); if (ta) ta.value = '';
  document.getElementById('cal-preview').innerHTML = '';
  document.getElementById('cal-loaded').innerHTML = App.buildLoadedHolidaysHtml();
  U.toast(`✅ 已寫入 ${n} 筆公休`, 'success');
};

// 刪單筆公休
App.deleteHoliday = function(date) {
  const hol = DATA.calendars && DATA.calendars.base && DATA.calendars.base.holidays;
  if (!hol || !(date in hol)) return;
  delete hol[date];
  Store.calendars.save();
  document.getElementById('cal-loaded').innerHTML = App.buildLoadedHolidaysHtml();
};

// 清空貼上區
App.clearCalendarPaste = function() {
  const ta = document.getElementById('cal-paste'); if (ta) ta.value = '';
  document.getElementById('cal-preview').innerHTML = '';
  App._pendingCalendar = null;
};

// 下載匯入範例（工作日曆）
App.downloadCalSample = function() { App.exportImportSample(CAL_COLUMNS, CAL_REQUIRED_KEYS, '工作日曆'); };

// 切換輸入方式（Excel／貼文字）
App.calInputMode = function(mode) {
  ['excel', 'paste'].forEach(m => {
    const pane = document.getElementById('cal-pane-' + m); if (pane) pane.style.display = (m === mode) ? '' : 'none';
    const tab = document.getElementById('cal-tab-' + m); if (tab) tab.classList.toggle('on', m === mode);
  });
};

// Excel 上傳 → 挑含「日期」表頭的分頁 → 走 fuzzy/精靈 → 沙盒預覽
App.calImportExcelPick = async function(inputEl) {
  const file = inputEl.files && inputEl.files[0]; inputEl.value = '';
  if (!file) return;
  let wb;
  try { wb = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true }); }
  catch (e) { U.toast('⚠ 讀檔失敗：' + e.message, 'warning'); return; }
  const learned = (typeof importLearnedMap === 'function') ? importLearnedMap('cal') : null;
  let aoa = null;
  for (const nm of wb.SheetNames) {
    const a = XLSX.utils.sheet_to_json(wb.Sheets[nm], { header: 1, defval: null });
    if (fuzzyFindHeaderRow(a, CAL_COLUMNS, 1, learned) >= 0) { aoa = a; break; }
  }
  if (!aoa) aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  const nameEl = document.getElementById('cal-excelName'); if (nameEl) nameEl.textContent = file.name;
  App._calRunFromAoa(aoa, null);
};

// aoa(+選用 mapping) → 定欄位（fuzzy／精靈）→ 重排 canonical 表頭 tab-text → 沿用 D.parseCalendarPaste（分類單一真實來源·規則15）
App._calRunFromAoa = function(aoa, mapping) {
  const learned = (typeof importLearnedMap === 'function') ? importLearnedMap('cal') : null;
  let headerIdx = fuzzyFindHeaderRow(aoa, CAL_COLUMNS, 1, learned);
  if (headerIdx < 0) headerIdx = 0;
  const headerRow = aoa[headerIdx] || [];
  const byKey = fuzzyResolveColumns(headerRow, CAL_COLUMNS, learned).byKey;
  if (mapping) CAL_COLUMNS.forEach(sp => { const ix = mapping[sp.key]; if (ix != null && ix >= 0) byKey[sp.key] = ix; });
  // 日期缺、或 類型＋工作日 都缺（無從分類公休/補班）→ 精簡精靈。有工作日欄時類型非必填（可用 0/1 判）
  if (byKey.date == null || (byKey.type == null && byKey.workday == null)) {
    App.renderImportMapping({
      title: '工作日曆', domain: 'cal', containerId: 'cal-map',
      specs: CAL_COLUMNS, headerCells: (headerRow || []).map(h => String(h == null ? '' : h).trim()),
      resolved: byKey, requiredKeys: (byKey.workday != null ? ['date'] : CAL_REQUIRED_KEYS),
      onConfirm: m => App._calRunFromAoa(aoa, m),
    });
    return;
  }
  const order = ['date', 'type', 'name', 'workday', 'weekday'];
  const lines = ['日期\t類型\t節日名稱\t工作日\t星期'];
  for (let i = headerIdx + 1; i < aoa.length; i++) {
    const row = aoa[i]; if (!row) continue;
    lines.push(order.map(k => { const ci = byKey[k]; if (ci == null) return ''; const v = row[ci]; if (v instanceof Date) return wbsDateStr(v); return v == null ? '' : String(v).trim(); }).join('\t'));
  }
  App._calShowPreview(D.parseCalendarPaste(lines.join('\n')));
};

// 已載入公休清單（年份分組，第一版只顯示公休；單筆刪）
App.buildLoadedHolidaysHtml = function() {
  const hol = (DATA.calendars && DATA.calendars.base && DATA.calendars.base.holidays) || {};
  const dates = Object.keys(hol).sort();
  if (!dates.length) return '<div class="cal-empty">尚未載入公休</div>';
  const byYear = {};
  dates.forEach(d => { const y = d.slice(0, 4); (byYear[y] = byYear[y] || []).push(d); });
  const groups = Object.keys(byYear).sort().map(y =>
    `<tbody><tr><td colspan="3" class="cal-year">${y}（${byYear[y].length}）</td></tr>` +
    byYear[y].map(d => {
      const nm = U.esc(hol[d]);
      return `<tr><td class="col-mid"><span class="cal-row-date">${d}</span></td>` +
        `<td class="col-flex" title="${nm}"><span class="cal-row-name">${nm}</span></td>` +
        `<td class="col-action"><button class="cal-del" onclick="App.deleteHoliday('${d}')" title="刪除">✕</button></td></tr>`;
    }).join('') +
    `</tbody>`
  ).join('');
  return `<div class="cal-loaded-head">共 ${dates.length} 筆公休</div>` +
    `<table class="data-table cal-table">${groups}</table>`;
};

// ─── 安全防護網（設定→安全 tab，給 MIS/主管審閱）───────────────
//   資料驅動：文案集中此物件，Gemini 潤稿後只改這裡的字串、不動版面/render。
//   ⚠ 每項都對應實際 code/後端，禁浮報——改文案前先核對對應機制（§8f 權限、§14 雲端授權、§8f.6 硬化）。
const SECURITY_INFO = {
  principle: '系統安全界線鎖在「後端授權」，不依賴隱藏前端程式碼。前端公開（GitHub Pages）屬正常——未通過後端授權，即使取得程式碼也讀不到任何資料。',
  groups: [
    { title: '🔑 身分驗證', items: [
      { name: 'Google 帳號登入（OAuth 2.0），不自建密碼', desc: '系統內不存任何密碼，消滅密碼庫外洩風險；沿用 Google 企業級身分驗證（含雙重驗證）。' },
      { name: '後端簽章嚴格校對', desc: '後端在讀寫資料時向 Google 官方端點重驗 id_token 的簽章真偽、受眾（aud）與 Email 驗證狀態，偽造或過期 Token 一律封鎖。' },
    ]},
    { title: '🛡 授權（系統的真正防線）', items: [
      { name: '四層權限白名單', desc: 'SuperAdmin / Admin / Editor / Viewonly；不在名單者預設無權限、完全無法進入系統。' },
      { name: '後端強制授權閘', desc: '權限不由前端判定。即使直接叫用 API，後端皆依身分反查：讀取 ≥ Viewonly、寫入 ≥ Editor、改名單限 Admin、改 Admin 名單限 SuperAdmin（防自我提權）。' },
      { name: '失敗即關閉（Fail-Closed）', desc: '驗證流程一發生非預期錯誤（連線逾時／回應異常），預設判定「無權限」直接擋下，絕不放行。' },
    ]},
    { title: '🔒 防竄改機制', items: [
      { name: '最高權限死鎖', desc: 'SuperAdmin 由後端環境變數（Script Properties）指定，前端不提供任何可改寫最高權限的介面或管道。' },
      { name: '唯讀模式咽喉', desc: 'Viewonly 帳號在「本機存檔」與「上傳雲端」兩處後端接口皆被硬編碼攔阻，只能檢視、無法修改或外傳。' },
    ]},
    { title: '📦 資料保護與隱私', items: [
      { name: '機密與前端抽離', desc: '白名單 Email、資料表位置均存於後端，公開程式碼不含任何敏感設定；本機機密檔不進版本控制。' },
      { name: '登入前零資料載入', desc: '資料僅在通過後端驗證後才下載至瀏覽器；未授權者即使打開開發者工具（F12），網頁背後也無資料可讀。' },
      { name: '登出即清空快取', desc: '登出時立即銷毀本機快取；資料以雲端為唯一真實來源、未登入不寫入任何資料，防裝置遺失外洩。' },
      { name: '上傳自動剝除個資', desc: '同步至雲端時自動剔除使用者 Email、頭像與角色資訊，落實資料最小化。' },
      { name: '憑證不落地、短時效', desc: 'Google 身分憑證僅留存於記憶體且時效極短，本機不存放長期存取憑證。' },
      { name: '全域每日自動備份 ＋ 版本還原', desc: '後端每天定時自動將完整資料存成帶日期快照（保留天數可設，預設 30 天），不依賴使用者開啟網頁；誤刪／覆蓋／損壞時可選定任一天快照整份還原，並自動回寫雲端。' },
    ]},
    { title: '🔐 傳輸安全', items: [
      { name: '全程 HTTPS 加密', desc: '網頁與後端 API 之間所有通訊強制加密傳輸。' },
    ]},
  ],
  positioning: '本系統屬「Google 身分驗證 ＋ 後端授權的內部工具」等級，防護強度與多數 SaaS 內部後台同級（非國防／零信任架構）。',
  limits: [
    '被授權的合法使用者，在其權限範圍內本就能檢視並匯出他被允許的資料（由權限分級與人員管理控管）。',
    '資料同步採整份覆蓋、目前不做欄位級合併；單人輪流編輯安全，多人同時編輯存在覆蓋風險。',
  ],
  roadmap: [
    '單一專案精準還原（目前為整份還原；未來鎖定單一專案回溯、其他專案不動）。',
  ],
};

// 安全 tab 內層 HTML（由 SECURITY_INFO 渲染；版面固定、文字吃資料）
App._securityTabHtml = function() {
  const grp = g => `
    <div class="settings-section">
      <div class="ss-title">${g.title}</div>
      <ol class="sec-list">
        ${g.items.map(it => `<li><b>${U.esc(it.name)}</b>：${U.esc(it.desc)}</li>`).join('')}
      </ol>
    </div>`;
  // 雙欄黃金對稱（建議一）：分組順序固定＝身分驗證／授權／防竄改／資料保護／傳輸
  const [identity, authz, antitamper, dataprot, transport] = SECURITY_INFO.groups;
  return `<div class="sec-wrap">
    <div class="settings-section sec-banner">
      <div class="ss-title">🛡 安全防護網</div>
      <div class="ss-desc" style="margin-bottom:0;">${U.esc(SECURITY_INFO.principle)}</div>
    </div>
    <div class="sec-cols">
      <div class="sec-col">${grp(identity)}${grp(authz)}</div>
      <div class="sec-col">${grp(antitamper)}${grp(transport)}</div>
    </div>
    ${grp(dataprot)}
    <div class="settings-section">
      <div class="ss-title">📋 定位與範圍（誠實揭露，供 MIS 評估）</div>
      <div class="sec-sub">定位</div>
      <div class="sec-pos">${U.esc(SECURITY_INFO.positioning)}</div>
      <div class="sec-sub">既有限制（任何 Web 系統共通）</div>
      <ul class="sec-ul">${SECURITY_INFO.limits.map(x => `<li>${U.esc(x)}</li>`).join('')}</ul>
      <div class="sec-sub">規劃中強化</div>
      <ul class="sec-ul">${SECURITY_INFO.roadmap.map(x => `<li>${U.esc(x)}</li>`).join('')}</ul>
    </div>
  </div>`;
};

// ECN 財務特批權責名冊（§19.5）：標籤清單編輯（可打字或從現有人員 datalist 挑·加入即成可刪標籤·儲存時從 DOM 蒐集·比照 dept 收集模型）
App._ecnApproverChipHtml = function(name) {
  return '<span class="ecn-appr-chip" data-name="' + U.esc(name) + '">' + U.esc(name) + '<button type="button" class="ecn-appr-x" title="移除" onclick="App._ecnApproverDel(this)">×</button></span>';
};
App._ecnApproverAdd = function() {
  const inp = document.getElementById('ecn-appr-in'), box = document.getElementById('ecn-appr-chips');
  if (!inp || !box) return;
  const name = (inp.value || '').trim(); if (!name) return;
  const dup = Array.from(box.querySelectorAll('.ecn-appr-chip')).some(c => c.getAttribute('data-name') === name);
  if (!dup) { box.insertAdjacentHTML('beforeend', App._ecnApproverChipHtml(name)); App._settingsDirty = true; }
  inp.value = ''; inp.focus();
};
App._ecnApproverDel = function(btn) {
  const chip = btn.closest('.ecn-appr-chip'); if (chip) { chip.remove(); App._settingsDirty = true; }
};
App.saveGeminiKey = function() {   // AI 報價單辨識金鑰：只存這台機器本機（不進 DATA/不上雲）·§21.16 路線2
  const el = document.getElementById('set-gemini-key'); if (!el) return;
  const v = (el.value || '').trim();
  try { if (v) localStorage.setItem('PMCORE_GEMINI_KEY', v); else localStorage.removeItem('PMCORE_GEMINI_KEY'); } catch (e) { U.toast('存不進本機儲存：' + (e && e.message || e), 'warning'); return; }
  const mSel = document.getElementById('set-gemini-model'), mCust = document.getElementById('set-gemini-model-custom');
  let model = (mCust && (mCust.value || '').trim()) || (mSel && mSel.value !== '__custom' ? mSel.value : '');
  if (!model) model = 'gemini-flash-latest';
  try { localStorage.setItem('PMCORE_GEMINI_MODEL', model); } catch (e) {}
  const hint = document.getElementById('set-gemini-hint'); if (hint) hint.textContent = v ? '✓ 已儲存（只在這台機器）· 模型 ' + model : '已清除';
  U.toast(v ? '✓ 已儲存 AI 金鑰（只存這台機器·不上雲）' : '已清除 AI 金鑰');
};
App.fetchGeminiModels = async function () {   // 直接向 Google ListModels 抓「這把金鑰實際可用」的模型·填進下拉（免猜型號·§21.16）
  let key = '';
  const kEl = document.getElementById('set-gemini-key');
  if (kEl && (kEl.value || '').trim()) key = kEl.value.trim(); else { try { key = localStorage.getItem('PMCORE_GEMINI_KEY') || ''; } catch (e) {} }
  if (!key) { U.toast('請先在上面貼金鑰', 'warning'); return; }
  U.toast('向 Google 抓取你可用的模型 …');
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000&key=' + encodeURIComponent(key));
    if (!res.ok) { U.toast('抓取失敗：' + res.status + ' ' + (await res.text()).slice(0, 200), 'warning'); return; }
    const j = await res.json();
    const names = (j.models || []).filter(m => (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0)
      .map(m => String(m.name || '').replace(/^models\//, ''))
      .filter(n => /gemini/i.test(n) && !/embedding|aqa|imagen|tts|audio|image-generation|live|learnlm|veo/i.test(n));
    if (!names.length) { U.toast('這把金鑰沒有可用的 Gemini 生成模型 — 可能要在 AI Studio 綁 billing 或換金鑰', 'warning'); return; }
    const sel = document.getElementById('set-gemini-model');
    if (sel) { let cur = ''; try { cur = localStorage.getItem('PMCORE_GEMINI_MODEL') || ''; } catch (e) {} sel.innerHTML = names.map(n => '<option value="' + n + '"' + (n === cur ? ' selected' : '') + '>' + n + '</option>').join('') + '<option value="__custom">自訂（下面自己輸入）</option>'; }
    const cust = document.getElementById('set-gemini-model-custom'); if (cust) cust.value = '';
    U.toast('✓ 抓到 ' + names.length + ' 個可用模型 · 已填進下拉 — 選一個（建議含 flash 的）再按「儲存金鑰」');
  } catch (e) { U.toast('抓取失敗：' + (e && e.message || e) + '（可能被瀏覽器 CORS 擋）', 'warning'); }
};
App.renderSettings = function() {
  if (!isAdmin()) return;
  App._settingsDirty = false;   // 修正3：重繪＝乾淨狀態
  App._bindSettingsDirty();
  const s = DATA.settings;

  document.getElementById('page-settings').innerHTML = `
    <div class="tabs" style="margin-bottom:18px;">
      <button class="tab-btn active" onclick="App.showSettingsTab(this,'排程')">排程與日曆</button>
      <button class="tab-btn" onclick="App.showSettingsTab(this,'資料與備份')">資料與備份</button>
      <button class="tab-btn" onclick="App.showSettingsTab(this,'資料來源')">資料來源</button>
      <button class="tab-btn" onclick="App.showSettingsTab(this,'範本')">專案範本</button>
      <button class="tab-btn" onclick="App.showSettingsTab(this,'權限管理')">權限管理</button>
      <button class="tab-btn" onclick="App.showSettingsTab(this,'安全')">🛡 安全</button>
      <button class="tab-btn" onclick="App.showSettingsTab(this,'關於')">關於</button>
    </div>

    <div class="tab-panel active" id="排程"><div class="settings-grid">
      <!-- 工時設定（全系統單一來源，§18.10）-->
      <div class="settings-section">
        <div class="ss-title">🗓 基礎工時與排程日曆</div>
        <div class="ss-desc">此設定是全系統時程計算與人力負載分析的基準。調整後，系統會依此日曆自動預設未來所有新專案的排程工作日；變更時會提示影響範圍。</div>
        <div class="ss-wh-row">
          <div class="form-field" style="max-width:150px;margin-bottom:0;"><label>每日標準工作時數（h）</label>
            <input type="number" id="set-hours" min="1" max="24" step="0.5" value="${s.dailyHours}" placeholder="每日標準上班工時">
          </div>
          <div class="form-field ss-wh-days" style="margin-bottom:0;"><label>固定上班日（排程工作天）</label>
            <div id="dayPills" class="day-pills">${[[1,'一'],[2,'二'],[3,'三'],[4,'四'],[5,'五'],[6,'六'],[0,'日']].map(p => `<button type="button" class="day-pill${(s.workDays || []).includes(p[0]) ? ' on' : ''}" data-day="${p[0]}" onclick="this.classList.toggle('on');App._settingsDirty=true">${p[1]}</button>`).join('')}</div>
          </div>
        </div>
      </div>

      <!-- 工作日曆（公休 / 補班）匯入（§13.7·排程基準·公休/補班判 isWorkday·2026-07-16 由資料與備份遷回排程）-->
      <div class="settings-section">
        <div class="ss-title">🗓 工作日曆（公休 / 補班）</div>
        <div class="ss-desc">匯入或設定公司專屬行事曆，系統將自動解析公休與補班日，作為專案工作日之計算基礎（isWorkday／排程依此判工作日）。</div>

        <div class="cal-import">
          <div class="cal-head">
            <div class="cal-tabs">
              <button id="cal-tab-excel" class="cal-tab on" onclick="App.calInputMode('excel')">📄 上傳 Excel</button>
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
          <input type="number" id="set-longdays" min="1" max="90" step="1" value="${s.longTaskDays ?? 5}" oninput="App._settingsDirty=true">
        </div>
        <div class="form-field" style="max-width:260px;"><label class="ss-lbl-info">任務未指定人力時的預設佔用率（%）<span class="ss-info" tabindex="0"><span class="ss-info-i">i</span><span class="ss-info-pop"><b>什麼是預設佔用率？</b>規劃排程時若沒指定某任務的「投入 %」，系統算部門負載時就用此比例代入（例如 50%），避免人力被無端當成「100% 塞滿」導致假性爆表。已填投入 % 的任務不受影響。</span></span></label>
          <input type="number" id="set-legacyload" min="10" max="100" step="5" value="${s.legacyLoadPct ?? 50}" oninput="App._settingsDirty=true">
        </div>
        <div class="ss-movedout">
          <i class="ti ti-package"></i>
          <div><b>部門總人數改去哪裡設定了？</b>為了讓您「就近在看負荷的地方修改」，部門人數已移至「全專案總覽（戰情室）」的部門人力水位板中登記。<button type="button" class="ss-movedout-link" onclick="Portfolio.openDeptHeadcount()">立即前往部門人數 →</button></div>
        </div>
      </div>

      <!-- /排程 --></div></div>
    <div class="tab-panel" id="資料與備份"><div class="settings-grid">
      <!-- 雲端同步（訪客唯讀時隱藏，editor/admin 才顯示：CSS body.viewonly .cloud-sync-sec） -->
      <div class="settings-section cloud-sync-sec">
        <div class="ss-title">☁ ${CFG('APP_NAME', 'PM-Core')} 跨裝置同步</div>
        <div class="ss-desc">綁定個人 Google 帳號進行多裝置資料同步，確保各使用者資料獨立與安全（透過你自己的 Google Sheet + Apps Script，首次使用需自行部署，見下方教學）。</div>

        <div class="ss-field" style="margin-top:12px;">
          <label>啟用雲端同步</label>
          <div>
            <select id="set-cloud-enabled" style="width:200px;">
              <option value="false" ${!s.cloudSyncEnabled ? 'selected' : ''}>停用</option>
              <option value="true" ${s.cloudSyncEnabled ? 'selected' : ''}>啟用</option>
            </select>
            ${s.cloudSyncEnabled && s.cloudLastSync ? `
              <span style="margin-left:14px; font-size:12px; color:var(--sage-700);">
                最後同步：<b id="cloudSyncLastEl">${new Date(s.cloudLastSync).toLocaleDateString('zh-TW')} ${new Date(s.cloudLastSync).toTimeString().slice(0,5)}</b>
              </span>
            ` : ''}
          </div>
        </div>

        <div class="ss-field">
          <label>跨裝置 Apps Script URL</label>
          <div>
            <input type="text" id="set-cloud-url" value="${U.esc(s.cloudSyncUrl || '')}" placeholder="https://script.google.com/macros/s/.../exec  (跨裝置同步 API)" style="font-family:var(--mono); font-size:11.5px;">
            <div class="help">部署跨裝置同步 Apps Script 後取得（部署方式見 README）</div>
          </div>
        </div>

        <div class="ss-field">
          <label>自動同步</label>
          <div>
            <select id="set-cloud-autosync" style="width:240px;">
              <option value="true" ${s.cloudAutoSync !== false ? 'selected' : ''}>儲存後自動上傳（推薦）</option>
              <option value="false" ${s.cloudAutoSync === false ? 'selected' : ''}>停用（僅手動）</option>
            </select>
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
            5. 取得 URL 貼到上方欄位，按「啟用」+「儲存所有設定」<br>
            6. 在第二台裝置打開 ${CFG('APP_NAME', 'PM-Core')}、設定一樣的 URL + Token → 自動同步 ✨
          </div>
        </details>
      </div>

      <!-- 會議逐字稿·雲端轉譯後端（§27 第二層·比照跨裝置同步的設定方式·前台逐字稿只呈現） -->
      <div class="settings-section cloud-sync-sec" id="ss-whisper">
        <div class="ss-title">🎙 會議逐字稿 · 雲端轉譯後端</div>
        <div class="ss-desc">把會議錄音自動轉成逐字稿的後端。OpenAI 金鑰藏在 Apps Script 後台；誰能用＝後端白名單（指令碼屬性 ALLOWED_EMAILS）＋Google 登入驗證，前台不存任何密碼。設定好後，逐字稿編輯視窗的「🎙 雲端自動轉譯」就會解鎖。</div>
        <div class="ss-field">
          <label>轉譯 Apps Script URL</label>
          <div>
            <input type="text" id="set-whisper-url" value="${U.esc(s.whisperUrl || '')}" placeholder="https://script.google.com/macros/s/.../exec  (語音轉譯 API)" style="font-family:var(--mono); font-size:11.5px;">
            <div class="help">部署 <code>backend/apps-script-whisper.gs</code>（JWT 版）後取得；用轉譯前要先 Google 登入</div>
          </div>
        </div>
      </div>

      <!-- 雲端每日備份（§17，訪客唯讀時隱藏） -->
      <div class="settings-section cloud-sync-sec">
        <div class="ss-title">🕓 雲端備份與還原</div>
        <div class="ss-desc">系統每日自動建立雲端資料快照（不需開著網頁·誤刪或故障可回溯）；下方可選歷史版本還原。設定與還原僅限管理員（Admin）權限。</div>
        <div class="ss-field">
          <label>啟用每日備份</label>
          <div><select id="set-backup-enabled" style="width:160px;"><option value="true">啟用</option><option value="false">停用</option></select></div>
        </div>
        <div class="ss-field">
          <label>備份時間</label>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:13px; color:var(--ink3);">每天</span>
            <select id="set-backup-hour" style="width:90px;">${Array.from({ length: 24 }, (_, h) => `<option value="${h}">${String(h).padStart(2, '0')}</option>`).join('')}</select>
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

      <!-- Data -->
      <div class="settings-section">
        <div class="ss-title">💾 本機資料</div>
        <div class="ss-desc">管理儲存在這台瀏覽器的本機資料：手動下載 JSON 備份、上傳還原、或清除本機所有資料。</div>

        <div class="ss-field">
          <label>已完成清理</label>
          <div>
            <select id="set-retention">
              <option value="30" ${s.doneRetentionDays === 30 ? 'selected' : ''}>30 天後自動清除（推薦）</option>
              <option value="60" ${s.doneRetentionDays === 60 ? 'selected' : ''}>60 天後自動清除</option>
              <option value="90" ${s.doneRetentionDays === 90 ? 'selected' : ''}>90 天後自動清除</option>
              <option value="0" ${s.doneRetentionDays === 0 ? 'selected' : ''}>永不清除</option>
            </select>
          </div>
        </div>

        <div style="display:flex; gap:8px; margin-top:14px; flex-wrap:wrap;">
          <button class="tb-action ghost" onclick="App.backupAll()">⬇ 下載 JSON 備份</button>
          <button class="tb-action ghost" onclick="document.getElementById('restoreInput').click()">📥 上傳還原</button>
          <input type="file" id="restoreInput" accept=".json" style="display:none" onchange="App.restoreAll(this.files[0])">
          <button class="tb-action danger" onclick="App.clearAll()" style="margin-left:auto;">🗑 清除所有資料</button>
        </div>
      </div>

      <!-- /資料 --></div></div>
    <div class="tab-panel" id="資料來源"><div class="settings-grid">
      <!-- 🔌 資料來源 adapter（形式二·§20.9）：介面/計算一致，只切「寫到哪、要不要上雲」 -->
      <div class="settings-section">
        <div class="ss-title">📡 資料儲存與同步模式</div>
        <div class="ss-desc">設定這台設備的專案資料儲存方式。不論選擇哪種模式，系統功能與計算邏輯完全相同；切換後按下方「💾 儲存所有設定」生效。</div>
        <label class="ss-check"><input type="radio" name="set-datasource" value="online" ${(s.dataSource || 'online') === 'online' ? 'checked' : ''} onchange="App._settingsDirty=true"><span><b>雲端同步模式（線上版）</b> — 資料會安全儲存於雲端，並自動同步至您的其他裝置（建議個人或一般家用環境使用·現況預設）。</span></label>
        <label class="ss-check"><input type="radio" name="set-datasource" value="offline" ${s.dataSource === 'offline' ? 'checked' : ''} onchange="App._settingsDirty=true"><span><b>本機儲存模式（離線版）</b> — 資料僅存在此瀏覽器中，完全不對外聯結；適合公司內部、高機密性內網或無網路環境。若需備份，請至「資料與備份」手動匯出 JSON 保存。</span></label>
        <div class="ss-desc" style="margin-top:12px;">離線「單檔打包版」（內嵌零外連）為日後另做；此處為執行時切換寫入行為。</div>
      </div>
      <!-- 🤖 AI 報價單辨識金鑰（本機·不上雲·§21.16 路線2）-->
      <div class="settings-section">
        <div class="ss-title">🤖 AI 智慧辨識設定（Gemini API）</div>
        <div class="ss-desc">設定您專屬的 Gemini 金鑰，即可在物料清單使用「智慧匯入」——AI 會自動閱讀掃描的報價單，解析帶入料號、品名與單價。沒貼金鑰＝匯入時退回人工填。</div>
        <div style="margin:2px 0 12px; padding:9px 12px; background:var(--sage-50); border:1px solid var(--sage-200); border-radius:8px; font-size:12.5px; color:var(--sage-700); line-height:1.6;">🔒 您的 API 金鑰僅儲存於<b>這台瀏覽器</b>，絕對不會上傳至雲端伺服器；換另一台設備需各自重新設定。</div>
        <div class="ss-field">
          <label>Gemini API 金鑰</label>
          <input type="text" id="set-gemini-key" placeholder="請在此貼上您的 Gemini API Key（例如 AIzaSy...）" value="${((window.localStorage && localStorage.getItem('PMCORE_GEMINI_KEY')) || '')}" style="font-family:monospace;" autocomplete="off">
        </div>
        <div class="ss-field" style="margin-top:10px;">
          <label class="ss-lbl-info">預設 AI 辨識模型<span class="ss-info" tabindex="0"><span class="ss-info-i">i</span><span class="ss-info-pop"><b>如何選擇模型？</b><b>Flash</b>：速度極快、免費額度高，不易觸發流量限制（推薦日常使用）。<b>Pro</b>：辨識更精準但免費額度較窄；若頻繁出現限制錯誤（如 429），建議切回 Flash。</span></span></label>
          <select id="set-gemini-model" style="padding:7px 8px;">
            ${(function () { var m = (window.localStorage && localStorage.getItem('PMCORE_GEMINI_MODEL')) || 'gemini-flash-latest'; var list = [['gemini-flash-latest', 'gemini-flash-latest — ⭐推薦·永遠指向最新 Flash（不會過期）'], ['gemini-flash-lite-latest', 'gemini-flash-lite-latest — 最省·免費額度最寬'], ['gemini-pro-latest', 'gemini-pro-latest — 最準·最新 Pro·額度較窄'], ['gemini-3.5-flash', 'gemini-3.5-flash — 指定新版 Flash'], ['gemini-2.5-flash-lite', 'gemini-2.5-flash-lite — 舊版備援·額度寬']]; var known = list.some(function (o) { return o[0] === m; }); return list.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === m ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '<option value="__custom"' + (known ? '' : ' selected') + '>自訂（用下面欄位自己輸入任一型號）</option>'; })()}
          </select>
        </div>
        <div class="ss-field" style="margin-top:8px;">
          <label>手動指定模型型號（進階）</label>
          <input type="text" id="set-gemini-model-custom" placeholder="留空＝用上面下拉；或輸入特定/最新型號，例 gemini-2.5-pro" value="${(function () { var m = (window.localStorage && localStorage.getItem('PMCORE_GEMINI_MODEL')) || ''; var known = ['gemini-flash-latest', 'gemini-flash-lite-latest', 'gemini-pro-latest', 'gemini-3.5-flash', 'gemini-2.5-flash-lite']; return known.indexOf(m) >= 0 ? '' : m; })()}" style="font-family:monospace;" autocomplete="off">
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
        ${isSuperAdmin() ? `
        <div class="ss-field">
          <label>管理員權限（Admin）</label>
          <div>
            <div class="wl-add">
              <input type="email" id="wl-admin-input" placeholder="請輸入管理員的 Google 帳號（Email）">
              <button class="tb-action ghost" onclick="Auth.addToList('admin','wl-admin-input')">加入</button>
            </div>
            <div id="wl-admin-list" class="wl-list"></div>
          </div>
        </div>` : ''}

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
          <input type="number" id="set-ecnthreshold" min="0" step="1000" value="${s.ecnScrapThreshold ?? 30000}" oninput="App._settingsDirty=true">
        </div>
        <label class="ss-check"><input type="checkbox" id="set-ecngate" ${(s.ecnScrapGateOn ?? true) ? 'checked' : ''} onchange="App._settingsDirty=true"><span class="ss-lbl-info">啟用超額硬性管控（未經特批不允許結案）<span class="ss-info" tabindex="0"><span class="ss-info-i">i</span><span class="ss-info-pop"><b>勾選：</b>嚴格管控——超過門檻必須完成特批流程，否則系統拒絕結案。<b>取消勾選：</b>僅作警示——超過門檻時只以紅字提示、不強制擋結案，亦不留特批紀錄（退回現況行為）。</span></span></span></label>
        <div style="margin-bottom:14px;"></div>
        <div class="form-field"><label class="ss-lbl-info">有權簽核特批的主管名冊<span class="ss-info" tabindex="0"><span class="ss-info-i">i</span><span class="ss-info-pop"><b>簽核安全機制：</b>此為有權核准高額呆滯特批的主管名單（如廠區總經理／PMC 協理／研發處長）。ECN 結案特批時，申請人<b>僅能從此名冊點選</b>核決主管、不開放自由手打，以防隨意指派。可從現有人員挑選，或自行輸入後按「加入」。</span></span></label>
          <div class="ecn-appr">
            <div id="ecn-appr-chips" class="ecn-appr-chips">${(s.ecnApprovers || []).map(a => App._ecnApproverChipHtml(a)).join('')}</div>
            <div class="ecn-appr-add">
              <input id="ecn-appr-in" list="ecn-appr-roster" placeholder="輸入主管姓名，或從現有人員挑選…" onkeydown="if(event.key==='Enter'){event.preventDefault();App._ecnApproverAdd();}">
              <datalist id="ecn-appr-roster">${Portfolio.personRoster().map(r => '<option value="' + U.esc(r.name) + '"></option>').join('')}</datalist>
              <button type="button" class="tb-action ghost" onclick="App._ecnApproverAdd()">＋ 加入</button>
            </div>
          </div>
        </div>
      </div>
      <!-- /編輯權限 --></div></div>
    <div class="tab-panel" id="關於"><div class="settings-grid">
      <!-- Personal -->
      <div class="settings-section">
        <div class="ss-title">📝 個人資訊</div>
        <div class="ss-desc">用於週報抬頭</div>

        <div class="ss-field">
          <label>姓名</label>
          <div><input type="text" id="set-uname" value="${U.esc(s.userName || '')}"></div>
        </div>

        <div class="ss-field">
          <label>部門</label>
          <div><input type="text" id="set-dept" value="${U.esc(s.department || '')}" placeholder="e.g. 研發部"></div>
        </div>
      </div>
      <!-- Google OAuth + 白名單 -->
      <div class="settings-section">
        <div class="ss-title">🔐 Google 登入</div>
        <div class="ss-desc">用 Google 帳號登入，資料以 Gmail 區分，各使用者完全獨立</div>

        ${s._loggedInEmail ? `
        <div class="sync-status" style="margin-bottom:14px;">
          <div class="sync-pulse"></div>
          <div class="sync-status-text">
            目前登入：<b>${U.esc(s._loggedInEmail)}</b>${isAdmin() ? ' <span style="font-size:10.5px; background:var(--sage-100); color:var(--sage-700); padding:1px 6px; border-radius:8px; margin-left:6px;">👑 ADMIN</span>' : ''}
          </div>
        </div>` : ''}

        ${isAdmin() ? `
        <div class="ss-field">
          <label>Google OAuth Client ID <span style="font-size:10.5px; color:var(--ink4);">(admin only)</span></label>
          <div>
            <input type="text" id="set-gci" value="${U.esc(s.googleClientId || '')}" placeholder="留空 = 使用內建預設 Client ID" style="font-family:var(--mono); font-size:11px;">
            <div class="help">
              留空時自動使用內建預設值（同事零設定即可登入）<br>
              如要自訂：到 <a href="https://console.cloud.google.com/apis/credentials" target="_blank" style="color:var(--sage-600);">Google Cloud Console</a> 建立 OAuth 2.0 Client ID（Web application 類型）<br>
              授權的 JavaScript 來源加入：<code style="background:var(--surface2); padding:1px 5px; border-radius:3px;">https://your-name.github.io</code>
            </div>
          </div>
        </div>
        ` : `
        <div style="padding:12px 14px; background:var(--surface2); border-radius:6px; font-size:12px; color:var(--ink3); line-height:1.6;">
          💡 你的資料以 Gmail 區分，完全獨立。<br>
          • 想跨裝置同步：到下方「☁ ${CFG('APP_NAME', 'PM-Core')} 跨裝置同步」設定<br>
          • 想本機備份：到下方「📦 資料管理」下載 JSON 備份
        </div>
        `}
      </div></div></div>

    <div class="tab-panel" id="安全">${App._securityTabHtml()}</div>

    <div style="text-align:center; margin-top:14px;">
      <button class="tb-action" onclick="App.saveSettings()" style="padding:12px 32px;">💾 儲存所有設定</button>
    </div>
  `;
  Auth.renderLists();   // ④ 名單容器在「編輯權限」tab 模板，innerHTML 設好後即時填
};

// 修正3：設定頁未存提醒——dirty 旗標 + 離開攔截彈窗（儲存並離開／放棄並離開／取消）
App._bindSettingsDirty = function() {
  if (App._settingsDirtyBound) return;
  App._settingsDirtyBound = true;
  const mark = (e) => { if (e.target && e.target.closest && e.target.closest('#page-settings')) App._settingsDirty = true; };
  document.addEventListener('input', mark);
  document.addEventListener('change', mark);
};
App._confirmLeaveSettings = function(name, btn) {
  App._pendingNav = { name, btn };
  App.openModal({
    title: '設定尚未儲存',
    body: '<div style="font-size:14px;color:var(--ink2);line-height:1.7;">你在設定頁有未儲存的變更。要先儲存再離開嗎？</div>',
    footer: `<button class="tb-action ghost" onclick="App.closeModal()">取消</button>
             <button class="tb-action ghost" onclick="App._leaveSettings(false)">放棄變更離開</button>
             <button class="tb-action" onclick="App._leaveSettings(true)">儲存並離開</button>`,
  });
};
App._leaveSettings = function(doSave) {
  const nav = App._pendingNav || {}; App._pendingNav = null;
  if (doSave) App.saveSettings(true);   // 跳過工時 confirm，直接存（含 Storage.save + 清 dirty）
  App._settingsDirty = false;
  App.closeModal();
  if (nav.name) App.showPage(nav.name, nav.btn, true);
};
App.saveSettings = function(_skipWorkConfirm) {
  const el = (id) => document.getElementById(id);
  const sv = (id) => { const e = el(id); return e ? e.value : null; };
  // §18.10：每日工時／每週工作日變更 → 彈影響清單確認（confirmModal 無 onCancel：取消＝整個儲存中止、工時與其餘設定都不寫，需重按儲存）
  if (!_skipWorkConfirm) {
    const _nh = sv('set-hours'); const _newHours = _nh !== null ? parseFloat(_nh) : null;
    const _dp = el('dayPills');
    const _newDays = _dp ? Array.from(_dp.querySelectorAll('.day-pill.on')).map(b => parseInt(b.dataset.day)) : null;
    const _curDays = DATA.settings.workDays || [];
    const _hoursChg = _newHours !== null && !isNaN(_newHours) && _newHours !== DATA.settings.dailyHours;
    const _daysChg = _newDays !== null && (_newDays.length !== _curDays.length || _newDays.some(d => !_curDays.includes(d)));
    if (_hoursChg || _daysChg) {
      App.confirmModal({
        icon: 'ti-alert-triangle', iconBg: '--amber-l', iconColor: '--amber-ink',
        title: '確認變更工時設定',
        msg: '修改「每日工時／每週工作日」會連動重算：<br>· WBS 任務工時換算（estHours）<br>· 部門負載與容量線<br>· 個人雜事佔比<br>· <b>每週工作日更會改變「哪幾天算工作日」→ 全系統排程日期、工期、甘特、剩餘工作天全部重算</b><br><br>確定要修改嗎？',
        okText: '確定修改', cancelText: '取消',
        onConfirm: () => App.saveSettings(true),
      });
      return;
    }
  }
  let v;
  if ((v = sv('set-preview')) !== null) DATA.settings.previewWeeks = parseInt(v);
  if ((v = sv('set-hours')) !== null) DATA.settings.dailyHours = parseFloat(v);
  if ((v = sv('set-longdays')) !== null) DATA.settings.longTaskDays = parseInt(v);
  if ((v = sv('set-legacyload')) !== null) DATA.settings.legacyLoadPct = parseInt(v);
  if ((v = sv('set-ecnthreshold')) !== null) DATA.settings.ecnScrapThreshold = Math.max(0, parseInt(v) || 0);
  { const ge = el('set-ecngate'); if (ge) DATA.settings.ecnScrapGateOn = ge.checked; }
  { const cb = document.getElementById('ecn-appr-chips'); if (cb) DATA.settings.ecnApprovers = Array.from(cb.querySelectorAll('.ecn-appr-chip')).map(c => c.getAttribute('data-name')).filter(Boolean); }
  // §18.16 部門人力登記已移至戰情室 Modal（Portfolio._deptHeadcountModalSave 獨立存），設定頁不再讀取
  if ((v = sv('set-ws1')) !== null) DATA.settings.workStart1 = v;
  if ((v = sv('set-we1')) !== null) DATA.settings.workEnd1 = v;
  if ((v = sv('set-ws2')) !== null) DATA.settings.workStart2 = v;
  if ((v = sv('set-we2')) !== null) DATA.settings.workEnd2 = v;
  if ((v = sv('set-golden')) !== null) DATA.settings.goldenTime = v;
  const dayPillBox = document.getElementById('dayPills');
  if (dayPillBox) DATA.settings.workDays = Array.from(dayPillBox.querySelectorAll('.day-pill.on')).map(b => parseInt(b.dataset.day));
  if ((v = sv('set-split')) !== null) DATA.settings.splitThreshold = parseFloat(v);
  if ((v = sv('set-uname')) !== null) DATA.settings.userName = v.trim();
  if ((v = sv('set-dept')) !== null) DATA.settings.department = v.trim();
  if ((v = sv('set-retention')) !== null) DATA.settings.doneRetentionDays = parseInt(v);

  // Google OAuth + whitelist
  const gciEl = document.getElementById('set-gci');
  if (gciEl) DATA.settings.googleClientId = gciEl.value.trim();
  const wlEl = document.getElementById('set-whitelist');
  if (wlEl) {
    DATA.settings.allowedEmails = wlEl.value.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean);
  }

  // ☁ Cloud sync
  const cuEl = document.getElementById('set-cloud-url');
  const ceEl = document.getElementById('set-cloud-enabled');
  const caEl = document.getElementById('set-cloud-autosync');
  if (cuEl) DATA.settings.cloudSyncUrl = cuEl.value.trim();
  if (ceEl) DATA.settings.cloudSyncEnabled = ceEl.value === 'true';
  if (caEl) DATA.settings.cloudAutoSync = caEl.value === 'true';

  // 🎙 會議逐字稿·雲端轉譯後端（§27 第二層·JWT 版只存網址）
  const wuEl = document.getElementById('set-whisper-url');
  if (wuEl) DATA.settings.whisperUrl = wuEl.value.trim();
  delete DATA.settings.whisperToken;   // 舊通行碼制殘值清除（JWT 版不存任何靜態密碼）

  // 🔌 資料來源 adapter（線上/離線·§20.9）——切 offline 即停雲端上傳
  const dsEl = document.querySelector('input[name="set-datasource"]:checked');
  if (dsEl) DATA.settings.dataSource = dsEl.value;

  Store.settings.save();
  App._settingsDirty = false;   // 修正3：存檔後清除未存旗標
  this.refreshUserBadge();
  U.toast('✓ 設定已儲存');
};

// ─── CLOUD SYNC HANDLERS ───
App.cloudUploadNow = function() {
  // 先把設定頁可能未存的 URL 抓進來
  const cuEl = document.getElementById('set-cloud-url');
  if (cuEl && cuEl.value.trim()) DATA.settings.cloudSyncUrl = cuEl.value.trim();
  if (!DATA.settings.cloudSyncUrl) {
    U.toast('⚠ 請先設定 Apps Script URL 並儲存', 'warning');
    return;
  }
  CloudSync.upload(false);
};

App.cloudDownloadNow = function() {
  const cuEl = document.getElementById('set-cloud-url');
  if (cuEl && cuEl.value.trim()) DATA.settings.cloudSyncUrl = cuEl.value.trim();
  if (!DATA.settings.cloudSyncUrl) {
    U.toast('⚠ 請先設定 Apps Script URL 並儲存', 'warning');
    return;
  }
  App.confirmModal({
    icon: 'ti-cloud-download', iconBg: '--amber-l', iconColor: '--amber-ink',
    title: '從雲端下載最新資料？', msg: '這會用雲端的資料「完全覆蓋」本地所有任務、專案、設定。建議先按「⬇ 下載 JSON 備份」備份本地資料。', okText: '下載並覆蓋', cancelText: '取消', okClass: 'danger',
    onConfirm: () => {
      CloudSync.download(false).then(success => {
        if (success) {
          App.refreshAll();
          App.renderSidebar();
          const currentPage = App.currentPage;
          if (currentPage) {
            const btn = document.querySelector(`[data-page="${currentPage}"]`);
            App.showPage(currentPage, btn);
          }
        }
      });
    },
  });
};

App.cloudTestConnection = async function() {
  const cuEl = document.getElementById('set-cloud-url');
  const url = cuEl ? cuEl.value.trim() : DATA.settings.cloudSyncUrl;
  if (!url) {
    U.toast('⚠ 請先填入 Apps Script URL', 'warning');
    return;
  }
  if (!Auth._idToken) { U.toast('登入已過期，請重新登入', 'error'); return; }
  U.toast('🔌 測試連線中...', 'info');
  try {
    const sep = url.includes('?') ? '&' : '?';
    const res = await fetch(url + sep + 'id_token=' + encodeURIComponent(Auth._idToken || ''), {
      method: 'GET',
      mode: 'cors',
      redirect: 'follow',
    });
    const result = await res.json();
    if (result.error) {
      U.toast('⚠ 連線失敗：' + result.error, 'warning');
    } else if (result.ok) {
      U.toast(`✓ 連線成功！雲端${result.data ? '已有資料' : '是空的，可以按上傳建立'}`, 'success');
    } else {
      U.toast('⚠ 回應格式異常：' + JSON.stringify(result).slice(0, 80), 'warning');
    }
  } catch (e) {
    U.toast('⚠ 連線失敗：' + e.message, 'warning');
    console.error(e);
  }
};

// ─── §17 BACKUP / RESTORE HANDLERS ───
App._backupUrl = function() { return (DATA.settings.cloudSyncUrl || CFG('BACKEND_URL', '') || '').trim(); };

// GET 後端備份 API（沿用 §14 JWT）：action=snapshots/snapshot/backupConfig。回 parsed JSON；error 或無憑證 throw。
App._backupGet = async function(action, extra) {
  const url = App._backupUrl();
  if (!url) throw new Error('尚未設定雲端 URL');
  if (!Auth._idToken) throw new Error('登入已過期，請重新登入');
  const sep = url.includes('?') ? '&' : '?';
  const res = await fetch(url + sep + 'action=' + action + (extra || '') + '&id_token=' + encodeURIComponent(Auth._idToken), { method: 'GET', mode: 'cors', redirect: 'follow' });
  const j = await res.json();
  if (j.error) throw new Error(j.error);
  return j;
};

// 進「資料與備份」tab 時載入備份設定 + 快照清單（設定頁本就 admin 才進）
App._loadBackupPanel = async function() {
  const st = document.getElementById('backupStatusEl');
  if (!Auth._idToken || !App._backupUrl()) { if (st) st.textContent = '需登入且設定雲端 URL 後才能使用'; return; }
  try {
    const j = await App._backupGet('backupConfig');
    const c = j.config || {};
    const setV = (id, v) => { const e = document.getElementById(id); if (e != null && v != null) e.value = String(v); };
    setV('set-backup-enabled', c.enabled ? 'true' : 'false');
    setV('set-backup-hour', c.hour);
    setV('set-backup-retention', c.retentionDays);
    if (st) st.textContent = c.lastBackup ? `最後備份 ${c.lastBackup} · 共 ${c.count} 份快照` : `尚無快照（啟用後每天自動備份，目前 ${c.count || 0} 份）`;
  } catch (e) {
    if (st) st.textContent = '讀取備份狀態失敗：' + e.message;
  }
  App.loadSnapshots();
};

App.loadSnapshots = async function() {
  const sel = document.getElementById('restore-snap');
  if (!sel) return;
  try {
    const j = await App._backupGet('snapshots');
    const list = j.snapshots || [];
    if (!list.length) { sel.innerHTML = '<option value="">（目前沒有快照）</option>'; document.getElementById('restorePreviewEl').textContent = '目前沒有可還原的快照。'; return; }
    sel.innerHTML = list.map(s => `<option value="${s.date}">${s.date}（${Math.round((s.chars || 0) / 1024)} KB）</option>`).join('');
    App.onSnapshotPick();
  } catch (e) {
    sel.innerHTML = `<option value="">讀取失敗：${U.esc(e.message)}</option>`;
  }
};

App.saveBackupConfig = async function() {
  const gv = id => { const e = document.getElementById(id); return e ? e.value : null; };
  if (!Auth._idToken) { U.toast('登入已過期，請重新登入', 'error'); return; }
  const enabled = gv('set-backup-enabled') === 'true';
  const hour = parseInt(gv('set-backup-hour'), 10);
  const retentionDays = parseInt(gv('set-backup-retention'), 10);
  try {
    const j = await Auth._postBackend({ action: 'setBackupConfig', id_token: Auth._idToken, enabled, hour, retentionDays });
    if (j.error) throw new Error(j.error);
    U.toast('✓ 備份設定已儲存', 'success');
    const c = j.config || {};
    const st = document.getElementById('backupStatusEl');
    if (st) st.textContent = c.lastBackup ? `最後備份 ${c.lastBackup} · 共 ${c.count} 份快照` : `尚無快照（目前 ${c.count || 0} 份）`;
  } catch (e) {
    U.toast('⚠ 儲存失敗：' + e.message, 'warning');
  }
};

App.onSnapshotPick = async function() {
  const sel = document.getElementById('restore-snap');
  const prev = document.getElementById('restorePreviewEl');
  if (!sel || !prev) return;
  const date = sel.value;
  if (!date) { prev.textContent = '選一個版本以預覽內容。'; App._restorePreviewData = null; return; }
  prev.textContent = '讀取中…';
  try {
    const j = await App._backupGet('snapshot', '&date=' + encodeURIComponent(date));
    const d = j.data || {};
    prev.innerHTML = `👁 這個版本有 <b>${(d.projects || []).length}</b> 個專案、<b>${(d.tasks || []).length}</b> 筆任務`;
    App._restorePreviewData = d; App._restorePreviewDate = date;   // 快取，還原直接用免重抓
  } catch (e) {
    prev.textContent = '預覽失敗：' + e.message; App._restorePreviewData = null;
  }
};

App.restoreSnapshot = function() {
  const sel = document.getElementById('restore-snap');
  const date = sel ? sel.value : '';
  if (!date) { U.toast('⚠ 請先選一個還原版本', 'warning'); return; }
  App.confirmModal({
    icon: 'ti-alert-triangle', iconBg: '--rose-l', iconColor: '--rose-ink',
    title: `還原到 ${date}？`,
    msg: `會把目前<b>所有</b>資料（含這天之後的改動、其他專案）覆蓋成 <b>${date}</b> 的狀態，<b>無法復原</b>。<br>建議先按「⬇ 下載 JSON 備份」再還原。`,
    okText: '還原並覆蓋', cancelText: '取消', okClass: 'danger',
    onConfirm: async () => {
      if (!Auth._idToken) { U.toast('登入已過期，請重新登入', 'error'); return; }
      U.toast('⏮ 還原中…', 'info');
      try {
        let data = (App._restorePreviewDate === date && App._restorePreviewData) ? App._restorePreviewData : null;
        if (!data) { const j = await App._backupGet('snapshot', '&date=' + encodeURIComponent(date)); data = j.data; }
        if (!data) throw new Error('找不到該快照資料');
        CloudSync._applyCloudData(data);   // 整碗替換本地（含 localStorage + migration）
        await CloudSync.upload(true);       // 決策3：回寫雲端最新，避免下次同步被舊 blob 蓋回
        App.refreshAll();
        App.renderSidebar();
        const cp = App.currentPage; if (cp) { const btn = document.querySelector(`[data-page="${cp}"]`); App.showPage(cp, btn); }
        U.toast(`✓ 已還原到 ${date}`, 'success');
      } catch (e) {
        U.toast('⚠ 還原失敗：' + e.message, 'warning'); console.error(e);
      }
    },
  });
};

App.googleSignOut = function() {
  App.confirmModal({
    icon: 'ti-logout', iconBg: '--amber-l', iconColor: '--amber-ink',
    title: '確定要登出？', okText: '登出', cancelText: '取消',
    msg: '登出會清除本機快取的專案資料。雲端不受影響，下次登入會自動還原。',
    onConfirm: async () => {
      U.toast('☁ 登出中，正在同步…', 'info');
      // 安全(§8f.6 Level 2)＋防掉資料(Paul 2026-07-05)：先 flush 上雲，只有「確認雲端已收到」(flush 回 true)才清本機；
      // 失敗(離線/逾時/token 過期/未開同步)＝中止登出、保留資料與登入狀態，避免清了無處還原。
      let safeToClear = false;
      try { safeToClear = await CloudSync.flushPendingUpload(); } catch (e) { console.error('logout flush failed', e); safeToClear = false; }
      if (!safeToClear) {
        App.confirmModal({
          icon: 'ti-alert-triangle', iconBg: '--rose-l', iconColor: '--rose-ink',
          title: '同步未完成，暫不登出', okText: '知道了', cancelText: null,
          msg: '雲端同步沒成功，為避免遺失本機尚未上傳的資料，這次先不登出、不清除。請確認網路連線（或重新整理、重新登入）後再登出。',
        });
        return;   // 中止：資料與登入狀態全保留，un-synced 改動不會被清
      }
      DATA.settings._loggedInEmail = '';
      DATA.settings._loggedInPicture = '';
      DATA.settings._role = undefined;   // 登出清身份（否則 isAdmin() 仍 true，只是被 overlay 遮住）；auth_admin_bound 保留不清
      Store.settings.save();             // 存回清過身份的 settings
      Storage.clearLocalData();          // 清本機快取的專案/工作資料(settings 保留供雲端重連)
      if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
        google.accounts.id.disableAutoSelect();
      }
      location.reload();
    },
  });
};


// ─── 備份/還原/清除（原 WBS 區尾挖入）───
App.backupAll = function() {
  const data = { DATA, exported: new Date().toISOString(), version: '1.0' };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${CFG('APP_NAME', 'PM-Core').toLowerCase()}-backup-${D.fmt(new Date(),'ymd').replace(/\//g,'-')}.json`;
  a.click();
  URL.revokeObjectURL(url);
  U.toast('✓ 備份已下載');
};

App.restoreAll = function(file) {
  if (!file) return;
  App.confirmModal({
    icon: 'ti-alert-triangle', iconBg: '--rose-l', iconColor: '--rose-ink',
    title: '還原將覆蓋目前所有資料', msg: '確定用此備份檔還原？目前所有任務、專案、設定會被覆蓋。', okText: '還原', cancelText: '取消', okClass: 'danger',
    onConfirm: () => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const obj = JSON.parse(e.target.result);
          if (!obj.DATA) throw new Error('檔案格式錯誤');
          DATA = obj.DATA;
          Storage.save();
          App.refreshAll();
          U.toast('✓ 資料已還原');
        } catch (err) {
          U.toast(`❌ 還原失敗：${err.message}`, 'error');
        }
      };
      reader.readAsText(file);
    },
  });
};

App.clearAll = function() {
  App.confirmModal({
    icon: 'ti-alert-triangle', iconBg: '--rose-l', iconColor: '--rose-ink',
    title: '確定清除所有資料？', msg: '將清空本機所有任務、專案、設定，<b>此操作無法復原</b>。建議先「下載 JSON 備份」再清除。', okText: '清除全部', cancelText: '取消', okClass: 'danger',
    onConfirm: () => {
      Object.values(STORE).forEach(key => localStorage.removeItem(key));
      location.reload();
    },
  });
};

// ═══════════════════════════════════════════════════════
//  §19.11 範本管理（設定頁「範本」tab·限 Admin·Wave 1）
//  Override 模型（Paul 定 a）：內建檔案不動；修改/複製存 DATA.templates；getter（tplResolve）override 優先。
//  生效範圍＝之後新開的案；既有專案零影響。
// ═══════════════════════════════════════════════════════
App._loadTplPanel = function() {
  const el = document.getElementById('tpl-admin-body'); if (!el) return;
  App._tplDraft = null; App._tplDirty = false;
  const ovIds = new Set((DATA.templates || []).map(t => t.templateId));
  const builtinIds = new Set(tplBuiltins().map(t => t.templateId));
  const card = (t) => {
    const isBuiltinId = builtinIds.has(t.templateId);
    const customized = isBuiltinId && ovIds.has(t.templateId);
    const isExtra = !isBuiltinId;   // 複製新增的自訂範本
    const kind = tplKind(t);
    const nTasks = (t.cases && t.cases[0] ? t.cases[0].modules : []).reduce((a, m) => a + (m.tasks || []).length, 0);
    const nStages = (t.stageDefaults || []).length;
    const badge = isExtra ? '<span class="tpl-badge custom">自訂範本</span>'
      : (customized ? '<span class="tpl-badge ovr">已自訂</span>' : '<span class="tpl-badge">內建</span>');
    return '<div class="tpl-card">' +
      '<div class="tpl-card-hd"><span class="tpl-dot ' + kind + '"></span><b>' + U.esc(t.templateName) + '</b>' + badge + '</div>' +
      '<div class="tpl-card-meta">' + (kind === 'ecn' ? 'ECN' : 'NPI') + ' · ' + nStages + ' 階段 · ' + nTasks + ' 筆任務 · ' + (t.roles || []).length + ' 角色' + (t.sizeMeta ? ' · S/M/L 條件開關' : '') + '</div>' +
      '<div class="tpl-card-ver">版本 ' + U.esc(t.version || '—') + '</div>' +
      '<div class="tpl-card-acts">' +
        '<button class="tb-action" onclick="App._tplEdit(\'' + U.esc(t.templateId) + '\')">編輯範本</button>' +
        '<button class="tb-action ghost" onclick="App._tplExportExcel(\'' + U.esc(t.templateId) + '\')">⬇ 匯出 Excel</button>' +
        '<label class="tb-action ghost tpl-imp-btn">⬆ 匯入 Excel<input type="file" accept=".xlsx,.xls" onchange="App._tplImportPick(\'' + U.esc(t.templateId) + '\',this)"></label>' +
        '<button class="tb-action ghost" onclick="App._tplCopy(\'' + U.esc(t.templateId) + '\')">複製為新範本</button>' +
        (customized ? '<button class="tb-action ghost tpl-danger" onclick="App._tplRevert(\'' + U.esc(t.templateId) + '\')">還原內建</button>' : '') +
        (isExtra ? '<button class="tb-action ghost tpl-danger" onclick="App._tplDelete(\'' + U.esc(t.templateId) + '\')">刪除</button>' : '') +
      '</div></div>';
  };
  // §19.11 Wave2-A：從 Excel 新增範本（虛線卡·依所在塊鎖定類型 NPI／ECN·不再彈類型選擇）
  const newCard = (kind) => '<button class="tpl-card-new" onclick="App._tplNewFromExcel(\'' + kind + '\')">' +
    '<span class="tnc-ic">⬆</span><b>從 Excel 新增 ' + (kind === 'ecn' ? 'ECN' : 'NPI') + ' 範本</b>' +
    '<span class="tnc-sub">上傳試算表 → 解析成流程母版 → 檢視後存</span></button>';
  const all = tplAll();
  const npiList = all.filter(t => tplKind(t) !== 'ecn');
  const ecnList = all.filter(t => tplKind(t) === 'ecn');
  // NPI／ECN 兩類分開呈現（Paul 定：不混放·避免混亂）；從 Excel 新增虛線卡各自入該類尾端·鎖定該類骨架
  const grp = (dot, label, sub, list) =>
    '<div class="tpl-group"><div class="tpl-group-hd"><span class="tpl-dot ' + dot + '"></span><b>' + label + '</b><span class="tpl-group-sub">' + sub + '</span></div>' +
    '<div class="tpl-cards">' + list.map(card).join('') + newCard(dot) + '</div></div>';
  el.innerHTML = '<div class="settings-section">' +
    '<div class="ss-title">🧩 專案範本管理</div>' +
    '<div class="ss-desc">管理員可直接於系統內編輯專案範本（含階段、任務、工期與角色）。修改後將同步至雲端，<b>僅套用於新建立之專案，既有專案不受影響</b>。</div>' +
    grp('npi', 'NPI 開發流程', '新產品開發專案', npiList) +
    grp('ecn', 'ECN 設變流程', '工程變更／設變案', ecnList) +
    '<div class="tpl-group"><div class="tpl-group-hd"><span class="tpl-dot npi"></span><b>範本校準建議</b><span class="tpl-group-sub">完工任務實際 vs 預估·據此修正範本工期（§18.16 從總覽 P3 移入·後台覆盤）</span></div>' +
      (typeof Portfolio !== 'undefined' ? (Portfolio._calibHtml() + Portfolio._calibAliasHtml()) : '') + '</div>' +
    '</div>';
};

// 進編輯器：深拷貝 working copy（存檔才寫回 DATA.templates）
App._tplEdit = function(id) {
  const src = tplResolve(id); if (!src) { U.toast('⚠ 找不到範本', 'warning'); return; }
  App._tplDraft = JSON.parse(JSON.stringify(src));
  App._tplDraft.templateId = id;   // 保持原 id（override 以 id 對應）
  App._tplDirty = false;
  App._tplRenderEditor();
};
App._tplBack = function() {
  if (App._tplDirty) {
    App.confirmModal({ title: '未儲存的範本內容', msg: '有未儲存的修改，離開會遺失。確定離開？', okText: '離開不存', cancelText: '留下', okClass: 'danger',
      onConfirm: () => { App._tplDraft = null; App._tplDirty = false; App._loadTplPanel(); } });
    return;
  }
  App._tplDraft = null; App._loadTplPanel();
};

// 編輯器 render（列表↔編輯同 panel 切換）；ECN＝多 sizeMeta 表＋任務 sizes 勾選
App._tplRenderEditor = function() {
  const el = document.getElementById('tpl-admin-body'); if (!el) return;
  const t = App._tplDraft; if (!t) return;
  const roles = t.roles || [];
  const roleOpts = (cur) => roles.map(r => '<option value="' + U.esc(r) + '"' + (r === cur ? ' selected' : '') + '>' + U.esc(r) + '</option>').join('') + (roles.indexOf(cur) < 0 && cur ? '<option value="' + U.esc(cur) + '" selected>' + U.esc(cur) + '</option>' : '');
  const stageList = (t.stageDefaults || []);
  // sizeMeta 表（ECN）：S/M/L pmEffort＋包含階段勾選
  const sizeMetaHtml = t.sizeMeta ? '<div class="tpl-szm"><div class="tpl-sec-title">S/M/L 分級設定（sizeMeta）</div><table class="tpl-szm-tbl"><thead><tr><th>分級</th><th>PM 常駐%</th><th>包含階段</th></tr></thead><tbody>' +
    ['S', 'M', 'L'].map(sz => { const m = t.sizeMeta[sz] || { pmEffort: 0, stages: [] };
      return '<tr><td class="tpl-szm-k">' + sz + '</td>' +
        '<td><input type="number" min="0" max="100" step="5" value="' + (m.pmEffort || 0) + '" class="tpl-in n" onchange="App._tplDraft.sizeMeta[\'' + sz + '\'].pmEffort=parseFloat(this.value)||0;App._tplDirty=true"></td>' +
        '<td class="tpl-szm-st">' + stageList.map(s => '<label class="tpl-szm-chk"><input type="checkbox"' + ((m.stages || []).indexOf(s.stage) >= 0 ? ' checked' : '') + ' onchange="App._tplSzStage(\'' + sz + '\',\'' + U.esc(s.stage) + '\',this.checked)">' + U.esc(s.stageNameCN || s.stage) + '</label>').join('') + '</td></tr>'; }).join('') +
    '</tbody></table></div>' : '';
  // NPI：每階段 pmCoordEffort
  const npiStageHtml = (!t.sizeMeta && stageList.some(s => s.pmCoordEffort != null)) ? '<div class="tpl-szm"><div class="tpl-sec-title">每階段 PM 常駐協調%（stageDefaults.pmCoordEffort）</div><div class="tpl-npi-pm">' +
    stageList.map((s, i) => '<label class="tpl-npi-pmf">' + U.esc(s.stageNameCN || s.stage) + '<input type="number" min="0" max="100" step="5" value="' + (s.pmCoordEffort || 0) + '" class="tpl-in n" onchange="App._tplDraft.stageDefaults[' + i + '].pmCoordEffort=parseFloat(this.value)||0;App._tplDirty=true"></label>').join('') + '</div></div>' : '';
  // 任務表（依 cases[0].modules 分階段折疊段；多 case 範本編第一 case——內建兩範本 cases[0]=主案）
  const mods = (t.cases && t.cases[0] ? t.cases[0].modules : []) || [];
  const tierOpts = (cur) => App._EFFORT_TIERS.map(o => '<option value="' + o.v + '"' + (o.v === (cur != null ? cur : 100) ? ' selected' : '') + '>' + o.v + '% ' + o.short + '</option>').join('');
  const typeOpts = (cur) => ['任務', '里程碑', '群組'].map(x => '<option' + (x === (cur || '任務') ? ' selected' : '') + '>' + x + '</option>').join('');
  const rowHtml = (tk, mi, ti) => {
    const p = 'App._tplDraft.cases[0].modules[' + mi + '].tasks[' + ti + ']';
    const nT = ((t.cases[0].modules[mi] || {}).tasks || []).length;   // §Wave2-B：任務 ▲▼ 端點禁用用
    const cols = t.sizeMeta ? 10 : 9;   // 列間插入 colspan（#/名/類型/子群組/工期/前置/角色/投入%[/分級]/操作）
    const szCell = t.sizeMeta ? '<td class="tpl-sz-cell">' + ['S', 'M', 'L'].map(sz =>
      '<label><input type="checkbox"' + (String(tk.sizes || 'SML').indexOf(sz) >= 0 ? ' checked' : '') + ' onchange="App._tplTaskSize(' + mi + ',' + ti + ',\'' + sz + '\',this.checked)">' + sz + '</label>').join('') +
      (tk.predBySize ? ' <span class="tpl-pbs" title="分級前置覆寫">' + U.esc(Object.keys(tk.predBySize).map(k => k + ':' + tk.predBySize[k]).join(' ')) + '</span>' : '') + '</td>' : '';
    return '<tr>' +
      '<td class="tpl-n">' + (tk.n != null ? tk.n : '') + '</td>' +
      '<td><input type="text" value="' + U.esc(tk.name || '') + '" class="tpl-in w" onchange="' + p + '.name=this.value;App._tplDirty=true"></td>' +
      '<td><select class="tpl-in" onchange="' + p + '.type=this.value;App._tplDirty=true">' + typeOpts(tk.type) + '</select></td>' +
      '<td><input type="text" value="' + U.esc(tk.subgroup || '') + '" class="tpl-in s" onchange="' + p + '.subgroup=this.value;App._tplDirty=true"></td>' +
      '<td><input type="number" min="0" value="' + (tk.durationDays != null ? tk.durationDays : 0) + '" class="tpl-in n" onchange="' + p + '.durationDays=parseFloat(this.value)||0;App._tplDirty=true"></td>' +
      '<td><input type="text" value="' + U.esc(tk.predecessor || '') + '" class="tpl-in s" placeholder="如 3FS+5" onchange="' + p + '.predecessor=this.value;App._tplDirty=true"></td>' +
      '<td><select class="tpl-in" onchange="' + p + '.role=this.value;App._tplDirty=true">' + roleOpts(tk.role) + '</select></td>' +
      '<td><select class="tpl-in" onchange="' + p + '.effortRatio=parseFloat(this.value);App._tplDirty=true">' + tierOpts(tk.effortRatio) + '</select></td>' +
      szCell +
      '<td class="tpl-row-acts">' +
        '<button class="tpl-st-btn" title="上移此任務（調整任務先後順序）"' + (ti === 0 ? ' disabled' : '') + ' onclick="App._tplTaskMove(' + mi + ',' + ti + ',-1)">▲</button>' +
        '<button class="tpl-st-btn" title="下移此任務（調整任務先後順序）"' + (ti === nT - 1 ? ' disabled' : '') + ' onclick="App._tplTaskMove(' + mi + ',' + ti + ',1)">▼</button>' +
        '<button class="tpl-x" title="刪除任務" onclick="App._tplTaskDel(' + mi + ',' + ti + ')">✕</button>' +
      '</td></tr>' +
      '<tr class="dt-insert-row"><td colspan="' + cols + '" class="dt-insert-cell"><div class="dt-insert"><button class="dt-insert-btn" title="在此任務後插入一列（可從中間插入，非只加在最後）" onclick="App._tplTaskInsert(' + mi + ',' + ti + ')">＋</button></div></td></tr>';
  };
  const nStages = mods.length;
  // §19.11 Wave2-B：階段列標頭加控件（改名 inline／▲▼ 調序／🗑 刪階段）
  const modHtml = (m, mi) => '<div class="tpl-mod">' +
    '<div class="tpl-mod-hd"><span class="tpl-mod-caret">▾</span>' +
      '<input class="tpl-stage-name" value="' + U.esc(m.stageNameCN || m.stage) + '" title="階段名稱（改名會同步到此範本各處，含已勾選分級）" onchange="App._tplStageRename(' + mi + ', this.value)">' +
      '<span class="tpl-mod-cnt">' + (m.tasks || []).length + ' 筆任務</span>' +
      '<span class="tpl-stage-tools">' +
        '<button class="tpl-st-btn" title="上移此階段（調整階段先後順序·含其下任務）"' + (mi === 0 ? ' disabled' : '') + ' onclick="App._tplStageMove(' + mi + ',-1)">▲</button>' +
        '<button class="tpl-st-btn" title="下移此階段（調整階段先後順序·含其下任務）"' + (mi === nStages - 1 ? ' disabled' : '') + ' onclick="App._tplStageMove(' + mi + ',1)">▼</button>' +
        '<button class="tpl-st-btn del" title="刪除整個階段" onclick="App._tplStageDel(' + mi + ')">🗑</button>' +
      '</span>' +
      '<button class="tb-action ghost tpl-add" onclick="App._tplTaskAdd(' + mi + ')">＋ 加任務</button></div>' +
    '<div class="tpl-mod-scroll"><table class="tpl-tbl"><thead><tr><th>#</th><th>任務名</th><th>類型</th><th>子群組</th><th>工期</th><th>前置</th><th>角色</th><th>投入%</th>' + (t.sizeMeta ? '<th>分級</th>' : '') + '<th></th></tr></thead><tbody>' +
    (m.tasks || []).map((tk, ti) => rowHtml(tk, mi, ti)).join('') + '</tbody></table></div></div>';
  el.innerHTML = '<div class="settings-section tpl-editor">' +
    '<div class="tpl-ed-hd"><b>✏ 編輯範本 — ' + U.esc(t.templateName) + '</b><span class="tpl-badge warn">範本＝流程母版 · 不含日期</span>' +
      '<span class="tpl-ed-acts"><button class="tb-action ghost" onclick="App._tplBack()">← 返回列表</button>' +
      '<button class="tb-action" onclick="App._tplSave()">存成範本</button></span></div>' +
    '<div class="tpl-base"><label>範本名稱<input type="text" value="' + U.esc(t.templateName) + '" class="tpl-in w" onchange="App._tplDraft.templateName=this.value;App._tplDirty=true"></label>' +
      '<label>說明<input type="text" value="' + U.esc(t.description || '') + '" class="tpl-in xw" onchange="App._tplDraft.description=this.value;App._tplDirty=true"></label></div>' +
    sizeMetaHtml + npiStageHtml +
    '<div class="tpl-sec-title">任務內容（前置＝範本序號 n，如「3FS+5」；階段可改名／▲▼ 調序／🗑 刪除，最下方可加階段）</div>' +
    mods.map(modHtml).join('') +
    '<button class="tpl-add-stage" onclick="App._tplStageAdd()">＋ 加階段（新增到最後，可用 ▲▼ 調序）</button>' +
    App._tplTrialPanelHtml() + '</div>';
  // 試算面板開著且已有日期 → 重繪後自動帶出甘特（比照 Stage 1 反應式·並反映剛才的範本編輯）
  if (App._tplTrialState && App._tplTrialState.open && (App._tplTrialState.start || App._tplTrialState.end)) App._tplTrialRun();
};

// sizeMeta 包含階段勾選
App._tplSzStage = function(sz, stage, on) {
  const m = App._tplDraft.sizeMeta[sz]; if (!m) return;
  m.stages = m.stages || [];
  const i = m.stages.indexOf(stage);
  if (on && i < 0) m.stages.push(stage);
  if (!on && i >= 0) m.stages.splice(i, 1);
  App._tplDirty = true;
};
// 任務 sizes 勾選（'SML' 字串增減；至少留一級）
App._tplTaskSize = function(mi, ti, sz, on) {
  const tk = App._tplDraft.cases[0].modules[mi].tasks[ti]; if (!tk) return;
  let s = String(tk.sizes || 'SML');
  if (on && s.indexOf(sz) < 0) s = ['S', 'M', 'L'].filter(x => s.indexOf(x) >= 0 || x === sz).join('');
  if (!on) s = s.replace(sz, '');
  if (!s) { U.toast('⚠ 至少保留一個分級', 'warning'); App._tplRenderEditor(); return; }
  tk.sizes = s; App._tplDirty = true;
};
App._tplTaskAdd = function(mi) {
  const m = App._tplDraft.cases[0].modules[mi]; if (!m) return;
  const t = App._tplDraft;
  const maxN = Math.max(0, ...(t.cases[0].modules.flatMap(x => (x.tasks || []).map(tk => tk.n || 0))));
  const tk = { tplId: 'c' + U.id().slice(-6), n: maxN + 1, name: '', type: '任務', subgroup: '', durationDays: 1, predecessor: '', deliverable: '', role: (t.roles || [])[0] || '' };
  if (t.sizeMeta) { tk.sizes = 'SML'; tk.effortRatio = 25; tk.taskAttr = 'baseline'; }
  m.tasks = m.tasks || []; m.tasks.push(tk);
  App._tplDirty = true; App._tplRenderEditor();
};
// §19.11 Wave2-B：任務上下調序（cases[0]／主案內容·同 _tplTaskAdd/_tplTaskDel 只動主案）→ 換位後 _tplRenumber 重排 1..N＋前置重連，# 維持連號
App._tplTaskMove = function(mi, ti, dir) {
  const t = App._tplDraft; if (!t) return;
  const tasks = (t.cases[0].modules[mi] || {}).tasks; if (!tasks) return;
  const j = ti + dir; if (j < 0 || j >= tasks.length) return;
  const tmp = tasks[ti]; tasks[ti] = tasks[j]; tasks[j] = tmp;
  App._tplRenumber(t);
  App._tplDirty = true; App._tplRenderEditor();
};
// §19.11 Wave2-B：列間插入任務（跟主任務清單一樣·可從中間插入·非只 append）→ 插空白列於 ti+1，_tplRenumber 給序號＋後續重排＋前置重連
App._tplTaskInsert = function(mi, ti) {
  const t = App._tplDraft; if (!t) return;
  const m = t.cases[0].modules[mi]; if (!m) return;
  const nt = { tplId: 'c' + U.id().slice(-6), n: 0, name: '', type: '任務', subgroup: '', durationDays: 1, predecessor: '', deliverable: '', role: (t.roles || [])[0] || '' };
  if (t.sizeMeta) { nt.sizes = 'SML'; nt.effortRatio = 25; nt.taskAttr = 'baseline'; }
  m.tasks = m.tasks || []; m.tasks.splice(ti + 1, 0, nt);
  App._tplRenumber(t);
  App._tplDirty = true; App._tplRenderEditor();
};
// §19.11：把所有任務前置中指向 delN 的段落移除（前置格式如「3FS+5,6」；比對開頭數字＝序號）
App._tplStripPred = function(delN) {
  const t = App._tplDraft; if (!t) return;
  (t.cases || []).forEach(c => (c.modules || []).forEach(m => (m.tasks || []).forEach(tk => {
    if (!tk.predecessor) return;
    const kept = String(tk.predecessor).split(/[,，;；]/).map(s => s.trim()).filter(Boolean)
      .filter(part => { const mm = part.match(/^(\d+)/); return !(mm && parseInt(mm[1], 10) === delN); });
    tk.predecessor = kept.join(',');
    // predBySize 內的分級前置也一併清
    if (tk.predBySize) Object.keys(tk.predBySize).forEach(k => {
      const kp = String(tk.predBySize[k]).split(/[,，;；]/).map(s => s.trim()).filter(Boolean)
        .filter(part => { const mm = part.match(/^(\d+)/); return !(mm && parseInt(mm[1], 10) === delN); });
      tk.predBySize[k] = kp.join(',');
    });
  })));
};
App._tplTaskDel = function(mi, ti) {
  const m = App._tplDraft.cases[0].modules[mi]; if (!m) return;
  const tk = m.tasks[ti];
  const delN = tk ? tk.n : null;
  App.confirmModal({ title: '刪除範本任務', msg: '刪除「' + (tk && tk.name ? tk.name : '（未命名）') + '」？指向它（序號 ' + (delN != null ? delN : '') + '）的前置會自動移除。', okText: '刪除', okClass: 'danger',
    onConfirm: () => {
      m.tasks.splice(ti, 1);
      // §19.11 D 修：順手清 dependents 對被刪序號的前置，避免留下 dangling ref（套用時斷鏈）
      if (delN != null) App._tplStripPred(delN);
      App._tplDirty = true; App._tplRenderEditor();
    } });
};

// ── §19.11 Wave2-B：階段改名／調序／刪除／新增（三處同步 stageDefaults＋各 case modules/stages＋ECN sizeMeta.stages；前置認任務序號 n·不受階段影響）──
// 改名＝連內部代號 stage 一起改（系統各處以 stage 當顯示名·Paul 定 cascade）；結構操作套用所有 case（另案＝主案複本·保持一致）。
App._tplStageRename = function(mi, newName) {
  const t = App._tplDraft; if (!t) return;
  const mod0 = t.cases[0].modules[mi]; if (!mod0) return;
  const oldKey = mod0.stage;
  const nm = String(newName || '').trim();
  if (!nm) { U.toast('⚠ 階段名稱不可空白', 'warning'); App._tplRenderEditor(); return; }
  if (nm === oldKey) return;
  if (t.cases[0].modules.some((m, i) => i !== mi && m.stage === nm)) { U.toast('⚠ 已有同名階段', 'warning'); App._tplRenderEditor(); return; }
  (t.stageDefaults || []).forEach(s => { if (s.stage === oldKey) { s.stage = nm; s.stageNameCN = nm; } });
  (t.cases || []).forEach(c => {
    (c.modules || []).forEach(m => { if (m.stage === oldKey) { m.stage = nm; m.stageNameCN = nm; } });
    if (Array.isArray(c.stages)) c.stages = c.stages.map(s => s === oldKey ? nm : s);
  });
  if (t.sizeMeta) Object.keys(t.sizeMeta).forEach(sz => { const m = t.sizeMeta[sz]; if (m && Array.isArray(m.stages)) m.stages = m.stages.map(s => s === oldKey ? nm : s); });
  App._tplDirty = true; App._tplRenderEditor();
};
App._tplStageMove = function(mi, dir) {
  const t = App._tplDraft; if (!t) return;
  const mods0 = t.cases[0].modules; const j = mi + dir;
  if (j < 0 || j >= mods0.length) return;
  const keyA = mods0[mi].stage, keyB = mods0[j].stage;
  const swap = (arr, getKey) => { if (!Array.isArray(arr)) return; const ia = arr.findIndex(x => getKey(x) === keyA), ib = arr.findIndex(x => getKey(x) === keyB); if (ia >= 0 && ib >= 0) { const tmp = arr[ia]; arr[ia] = arr[ib]; arr[ib] = tmp; } };
  (t.cases || []).forEach(c => { swap(c.modules || [], m => m.stage); swap(c.stages, s => s); });
  swap(t.stageDefaults || [], s => s.stage);
  (t.stageDefaults || []).forEach((s, i) => { if (s.order != null) s.order = i + 1; });
  App._tplDirty = true; App._tplRenderEditor();
};
App._tplStageDel = function(mi) {
  const t = App._tplDraft; if (!t) return;
  const mods0 = t.cases[0].modules;
  if (mods0.length <= 1) { U.toast('⚠ 至少保留一個階段', 'warning'); return; }
  const mod0 = mods0[mi]; if (!mod0) return;
  const key = mod0.stage;
  const nTasks = (mod0.tasks || []).length;
  App.confirmModal({ title: '刪除階段', okText: '刪除階段', okClass: 'danger',
    msg: '刪除階段「' + U.esc(key) + '」會一併刪除其下 ' + nTasks + ' 筆任務，並移除指向它們的前置' + (t.sizeMeta ? '；ECN 分級的包含階段也會取消勾選' : '') + '。確定？',
    onConfirm: () => {
      const delNs = [];
      (t.cases || []).forEach(c => (c.modules || []).forEach(m => { if (m.stage === key) (m.tasks || []).forEach(tk => { if (tk.n != null) delNs.push(tk.n); }); }));
      (t.cases || []).forEach(c => {
        c.modules = (c.modules || []).filter(m => m.stage !== key);
        if (Array.isArray(c.stages)) c.stages = c.stages.filter(s => s !== key);
      });
      t.stageDefaults = (t.stageDefaults || []).filter(s => s.stage !== key);
      (t.stageDefaults || []).forEach((s, i) => { if (s.order != null) s.order = i + 1; });   // 重排 order·避免後續加階段 order 撞號
      if (t.sizeMeta) Object.keys(t.sizeMeta).forEach(sz => { const m = t.sizeMeta[sz]; if (m && Array.isArray(m.stages)) m.stages = m.stages.filter(s => s !== key); });
      delNs.forEach(n => App._tplStripPred(n));   // 清指向被刪任務的前置（同 _tplTaskDel·不重排序號）
      App._tplDirty = true; App._tplRenderEditor();
    } });
};
App._tplStageAdd = function() {
  const t = App._tplDraft; if (!t) return;
  App.promptModal({ title: '新增階段', label: '階段名稱', value: '', okText: '新增',
    onSubmit: (name) => {
      const nm = String(name || '').trim();
      if (!nm) { U.toast('⚠ 階段名稱不可空白', 'warning'); return; }
      if ((t.stageDefaults || []).some(s => s.stage === nm) || (t.cases[0].modules || []).some(m => m.stage === nm)) { U.toast('⚠ 已有同名階段', 'warning'); return; }
      t.stageDefaults = t.stageDefaults || [];
      const sd = { stage: nm, stageNameCN: nm, order: t.stageDefaults.length + 1 };
      if (t.stageDefaults.some(s => s.pmCoordEffort != null)) sd.pmCoordEffort = 0;   // NPI 骨架帶 pmCoordEffort
      t.stageDefaults.push(sd);
      (t.cases || []).forEach(c => {   // 每個 case 補空 module＋stages（另案一起，保持一致）
        c.modules = c.modules || []; c.modules.push({ stage: nm, stageNameCN: nm, tasks: [] });
        if (Array.isArray(c.stages)) c.stages.push(nm);
      });
      // ECN sizeMeta：新階段各分級預設不勾（不加進 stages 陣列即為不勾）
      App._tplDirty = true; App._tplRenderEditor();
    } });
};

// ── §19.11 Wave2-C：試算排程（接塊3·§8d.16.4）——比照 Stage 1：只填假設日期即自動帶出甘特＋各階段餘裕燈號＋排不進溢出提示（無方向鈕、無試算鈕）。
// 方向由日期自動判定（`_effScheduleDir`：只填開始日＝順排／只填上市日＝倒排／兩者皆填＝夾排）。乙案：不回寫範本（要改工期回任務表）。
App._tplTrialState = App._tplTrialState || { open: true, start: '', end: '' };   // 預設展開
App._tplTrialToggle = function() { App._tplTrialState.open = !App._tplTrialState.open; App._tplRenderEditor(); };
App._tplTrialPanelHtml = function() {
  const TS = App._tplTrialState;
  // Hint 直接沿用 Stage 1 兩個 HintBox（排程小秘訣＋甘特顏色說明），移除範本試算沒有的功能文案（子案／下一步智慧排程面板）
  const tips = App.buildHintBox({ key: 'tpl-trial-tips', icon: 'ti-info-circle', title: '排程小秘訣', summary: '怎麼填日期決定排程方向', collapsed: false,
    bodyHtml:
      '<div class="s1-tips-line"><span class="s1-tips-dot"></span>只填開始日：自動順推，算出預計完工日。</div>' +
      '<div class="s1-tips-line"><span class="s1-tips-dot"></span>只填上市日期：自動倒推最晚開工日<b class="s1-tips-warn">（若發現來不及，會自動改為建議最快完工日）</b>。</div>' +
      '<div class="s1-tips-line"><span class="s1-tips-dot"></span>兩者皆填齊：精算時間是否足夠，下方甘特會標出各階段緊迫度。</div>'
  });
  const slack = App.buildHintBox({ key: 'tpl-trial-slack', icon: 'ti-info-circle', title: '甘特圖階段顏色說明', summary: '一分鐘看懂各階段排程緊迫度', collapsed: true,
    bodyHtml:
      '<div class="slack-help-ambox"><i class="ti ti-alert-triangle"></i><span>須在<span class="slack-help-hl">開始與上市日期皆填齊</span>時，各開發階段才會觸發以下顏色；只填單一日期，甘特圖維持預設單色。</span></div>' +
      '<div class="slack-help-grid">' +
        '<div class="slack-help-cell"><span class="slack-dot sd-green"></span><div><div class="slack-help-ct">綠色 ── 安全</div><div class="slack-help-cd">完工日比該段 Deadline 提前 5 天以上。</div></div></div>' +
        '<div class="slack-help-cell"><span class="slack-dot sd-yellow"></span><div><div class="slack-help-ct">黃色 ── 警告</div><div class="slack-help-cd">完工日離該段 Deadline 僅差 0～4 天。</div></div></div>' +
        '<div class="slack-help-cell"><span class="slack-dot sd-red"></span><div><div class="slack-help-ct">紅色 ── 延誤</div><div class="slack-help-cd">完工日已落在該段 Deadline 之後。</div></div></div>' +
      '</div>'
  });
  const body = !TS.open ? '' : '<div class="tpl-trial-body">' +
    '<div class="tpl-trial-inputs">' +
      '<label class="tpl-trial-fld">假設開始日<input type="date" value="' + (TS.start || '') + '" onchange="App._tplTrialState.start=this.value;App._tplTrialRun()"></label>' +
      '<label class="tpl-trial-fld">假設上市日<input type="date" value="' + (TS.end || '') + '" onchange="App._tplTrialState.end=this.value;App._tplTrialRun()"></label>' +
    '</div>' + tips + slack +
    '<div id="tpl-trial-result" class="tpl-trial-result"></div></div>';
  return '<div class="tpl-trial">' +
    '<button class="tpl-trial-hd" onclick="App._tplTrialToggle()">🧮 試算排程（選填·填假設日期即自動排程看各階段餘裕；不影響範本，要改工期回上方任務表）<span class="tpl-trial-caret">' + (TS.open ? '▾' : '▸') + '</span></button>' +
    body + '</div>';
};
App._tplTrialRun = function() {
  const t = App._tplDraft; if (!t) return;
  const TS = App._tplTrialState;
  const start = TS.start || '', end = TS.end || '';
  const box = document.getElementById('tpl-trial-result');
  if (!start && !end) { if (box) box.innerHTML = ''; return; }   // 無日期＝不試算（清空）
  const c0 = (t.cases || [])[0];
  if (!c0) { if (box) box.innerHTML = ''; return; }
  // 只試算主案（另案＝主案複本·不另顯甘特，Paul 定）
  const cases = [{
    variantName: c0.variant || '主案', templateVariant: c0.variant || '主案',
    startDate: start, endDate: end, direction: 'forward',   // 方向由 _effScheduleDir(start,end) 依填了哪個自動判定
    selectedStages: (c0.modules || []).map(m => m.stage),
  }];
  let res;
  try { res = App.applyTemplate(t, { projectName: '（試算）', cases: cases, depts: [] }); }
  catch (e) { U.toast('❌ 試算失敗：' + e.message, 'error'); return; }
  App._tplPreview = res;   // 供 _s2StageStatuses/_s2GanttHtml 讀（設定頁無其他消費者）
  const v0 = (res.variants || [])[0];
  if (box) box.innerHTML = v0 ? App._tplTrialVariantHtml(v0, false) : '';
};
App._tplTrialVariantHtml = function(v, showName) {
  const st = App._s2StageStatuses(v.id);
  const gantt = '<div class="s2-gantt" data-variant="' + v.id + '">' + App._s2GanttHtml(v.id) + '</div>';
  const lack = (st.ranges || []).filter(r => r.lack > 0);
  const foot = lack.length
    ? '<div class="tpl-trial-of">⚠ 時程不足：' + lack.map(r => U.esc(r.stage) + ' 尚缺 ' + r.lack + ' 個工作天').join('、') + '。可放寬上方「假設上市日」，或回任務表縮短工期。</div>'
    : (st.endDate ? '<div class="tpl-trial-ok">✓ 時程充足，各階段都排得進上市日。</div>' : '<div class="tpl-trial-ok">✓ 已依假設開始日順推，下方為各階段預計落點。</div>');
  return '<div class="tpl-trial-var">' + (showName ? '<div class="tpl-trial-vname">' + U.esc(v.name || '') + '</div>' : '') + gantt + foot + '</div>';
};

// 存檔：輕驗證→寫 DATA.templates（同 id 替換/新增）→ Storage.save
App._tplSave = function() {
  const t = App._tplDraft; if (!t) return;
  if (!String(t.templateName || '').trim()) { U.toast('⚠ 範本名稱不可空白', 'warning'); return; }
  const emptyName = (t.cases[0].modules || []).some(m => (m.tasks || []).some(tk => !String(tk.name || '').trim()));
  if (emptyName) { U.toast('⚠ 有任務名稱空白——填好或刪掉該列', 'warning'); return; }
  t.kind = tplKind(t);   // 自訂層固定帶 kind（複製副本判別不靠 sizeMeta 特徵）
  t.version = D.fmt(new Date(), 'iso') + '（自訂）';
  DATA.templates = DATA.templates || [];
  const i = DATA.templates.findIndex(x => x.templateId === t.templateId);
  if (i >= 0) DATA.templates[i] = t; else DATA.templates.push(t);
  Store.templates.save();
  App._tplDraft = null; App._tplDirty = false;
  U.toast('✓ 範本已儲存（之後新開的案生效）');
  App._loadTplPanel();
};
// 還原內建：移除 override
App._tplRevert = function(id) {
  App.confirmModal({ title: '還原內建範本', msg: '丟棄這個範本的所有自訂內容、回到內建版本？既有專案不受影響。', okText: '還原內建', okClass: 'danger',
    onConfirm: () => { DATA.templates = (DATA.templates || []).filter(x => x.templateId !== id); Store.templates.save(); U.toast('✓ 已還原內建'); App._loadTplPanel(); } });
};
// 複製為新範本（§8d.16.1 輔助路徑）：新 id＋問名→直接進編輯
App._tplCopy = function(id) {
  const src = tplResolve(id); if (!src) return;
  App.promptModal({ title: '複製為新範本', label: '新範本名稱', value: src.templateName + '（複本）', okText: '建立並編輯',
    onSubmit: (name) => {
      if (!String(name || '').trim()) { U.toast('⚠ 名稱不可空白', 'warning'); return; }
      const cp = JSON.parse(JSON.stringify(src));
      cp.templateId = 'custom-' + U.id();
      cp.templateName = String(name).trim();
      cp.kind = tplKind(src);
      cp.version = D.fmt(new Date(), 'iso') + '（自訂）';
      DATA.templates = DATA.templates || [];
      DATA.templates.push(cp);
      Store.templates.save();
      App._tplEdit(cp.templateId);
    } });
};
// 刪除自訂範本（內建不可刪；既有專案任務已生成、不受影響）
App._tplDelete = function(id) {
  App.confirmModal({ title: '刪除自訂範本', msg: '刪除後建案下拉不再出現此範本；已用它開的專案不受影響。確定刪除？', okText: '刪除', okClass: 'danger',
    onConfirm: () => { DATA.templates = (DATA.templates || []).filter(x => x.templateId !== id); Store.templates.save(); U.toast('✓ 已刪除'); App._loadTplPanel(); } });
};

// ── §19.11 Wave2-A：從 Excel「新增」範本（主路徑；Wave1 的匯入＝套進既有基底）──
// 先選 NPI/ECN 類型（決定骨架）→ 以該 kind 內建範本為空骨架（保 roles/sizeMeta/stageDefaults·清空任務）→ 跑既有匯入管線覆蓋階段＋任務 → 進編輯器檢視才存。
App._tplNewFromExcel = function(kind) {
  kind = kind === 'ecn' ? 'ecn' : 'npi';
  App._tplNewKind = kind;
  const isEcn = kind === 'ecn';
  App.openModal({
    title: '從 Excel 新增 ' + (isEcn ? 'ECN' : 'NPI') + ' 範本',
    body: '<div class="tpl-map-hint">' + (isEcn
        ? '以 <b>ECN 設變骨架</b>建立（角色清單／S/M/L 分級結構／各分級 PM 常駐%）；Excel 只覆蓋「階段＋任務」內容。'
        : '以 <b>NPI 開發骨架</b>建立（角色清單／每階段 PM 常駐協調%）；Excel 只覆蓋「階段＋任務」內容。')
      + '<b>範本＝流程母版·不含日期。</b></div>',
    footer: '<button class="tb-action ghost" onclick="App.closeModal()">取消</button>' +
      '<button class="tb-action ghost" onclick="App.downloadTplSample(\'' + kind + '\')">⬇ 下載 ' + (isEcn ? 'ECN' : 'NPI') + ' 範例</button>' +
      '<label class="tb-action amber tpl-imp-btn">選檔並解析 Excel<input type="file" accept=".xlsx,.xls" onchange="App._tplNewFromExcelPick(this)"></label>',
  });
};
App._tplNewFromExcelPick = async function(fileEl) {
  const kind = App._tplNewKind === 'ecn' ? 'ecn' : 'npi';
  const src = kind === 'ecn' ? tplEcn() : tplNpi();
  if (!src) { U.toast('⚠ 找不到內建骨架', 'warning'); return; }
  const base = JSON.parse(JSON.stringify(src));
  base.templateId = 'custom-' + U.id();
  base.kind = kind;
  base.templateName = '';                                    // 由檔名帶入（見 _tplApplyImport）
  base.cases = [{ variant: '主案', stages: [], modules: [] }];  // 清空任務，只留骨架設定（roles/sizeMeta/stageDefaults）
  App.closeModal();
  await App._tplImportPick(base.templateId, fileEl, base);
};

// ═══════════════════════════════════════════════════════
//  §19.11 範本 Excel 匯出/匯入（模糊匯入器 §13.7 + 欄位對應精靈）
//  放 settings.js（excel.js 為 CRLF·避 flip）；fuzzyResolveColumns/XLSX/_xlHouse 皆全域 runtime 可用。
// ═══════════════════════════════════════════════════════
const TPL_COLUMNS = [
  { key: 'stage', header: '階段', aliases: ['PLM階段', '開發階段', 'Stage', 'Phase'], tip: '任務所屬階段（須對應範本階段名）', sample: '規劃' },
  { key: 'n', header: '序號', aliases: ['N', 'No', 'NO', '#', '序', '編號', 'Item'], tip: '任務流水序號（前置用它指涉）', sample: '1' },
  { key: 'name', header: '任務名', aliases: ['任務名稱', '任務', '工作項目', 'Task', 'Task Name', 'Activity'], tip: '任務標題（必要）', sample: '需求訪談' },
  { key: 'type', header: '類型', aliases: ['任務類型', 'Type'], tip: '任務／里程碑／群組', sample: '任務' },
  { key: 'subgroup', header: '子群組', aliases: ['群組', '子分類'], tip: '階段內小分類（選填）', sample: '' },
  { key: 'durationDays', header: '工期', aliases: ['工期(天)', '工作天', '天數', 'Duration', 'Days'], tip: '工作天數', sample: '3' },
  { key: 'predecessor', header: '前置', aliases: ['前置任務', '前置(N)', '前置(序號)', 'Predecessor', 'Depends On'], tip: '接在哪個序號後（如 3FS+5）', sample: '' },
  { key: 'role', header: '角色', aliases: ['負責角色', '擔當角色', 'Role'], tip: '負責角色（對應名冊部門）', sample: '研發' },
  { key: 'effortRatio', header: '投入%', aliases: ['投入', '投入比例', '投入比例%', 'Effort'], tip: '投入比例%（0/10/25/50/75/100）', sample: '50' },
  { key: 'sizes', header: '分級', aliases: ['SML', '適用分級', '分級(SML)', 'Size'], tip: 'ECN 專用：該任務出現在哪些級別（如 SML、ML、L）', sample: 'SML' },
];
const TPL_REQUIRED = ['stage', 'name'];
// 下載範例（範本）＝匯出系統內建「真範本」完整內容（NPI 拿最長骨架／ECN 拿有 S/M/L 三級那份）；
// 有完整任務可改，比空範例從零生快（Paul 2026-07-08）。內建 JS 全域·開站即在（非 0 資料）。
App.downloadTplSample = function(kind) {
  const t = (kind === 'ecn') ? (typeof tplEcn === 'function' ? tplEcn() : null) : (typeof tplNpi === 'function' ? tplNpi() : null);
  if (!t) { U.toast('⚠ 找不到內建範本', 'warning'); return; }
  App._tplExportExcel(t.templateId);
};

// ── 匯出：範本 → Excel（§13.8 豪華標準格式；不含日期）──
App._tplExportExcel = async function(id) {
  if (typeof ExcelJS === 'undefined') { U.toast('❌ ExcelJS 未載入，請重整頁面', 'error'); return; }
  const t = tplResolve(id); if (!t) { U.toast('⚠ 找不到範本', 'warning'); return; }
  const isEcn = tplKind(t) === 'ecn';
  const H = App._xlHouse();
  const wb = new ExcelJS.Workbook(); wb.creator = DATA.settings.userName || 'PM-Core'; wb.created = new Date();
  const heads = ['階段', '序號', '任務名', '類型', '子群組', '工期', '前置(序號)', '角色', '投入%'].concat(isEcn ? ['分級(SML)'] : []);
  const NC = heads.length;
  const ws = wb.addWorksheet('範本', { views: [{ state: 'frozen', ySplit: 3 }] });
  H.titleRow(ws, (t.templateName || '範本') + ' — 專案範本（' + (isEcn ? 'ECN' : 'NPI') + '·不含日期）', NC);
  const memo = ws.addRow(['前置＝接在哪個「序號」後（如 3FS+5）；階段須對應範本階段名；投入%＝0/25/50/75/100；' + (isEcn ? '分級＝該任務出現在哪些級別 S/M/L（如 SML、ML、L）；' : '') + '改完存檔後回系統「⬆ 匯入 Excel」套用（欄位可模糊對應、對不上跳精靈）。']);
  ws.mergeCells(memo.number, 1, memo.number, NC); memo.getCell(1).font = H.FMEMO; memo.getCell(1).alignment = { wrapText: true, vertical: 'middle', horizontal: 'left' };
  H.hdrRow(ws, heads, NC);
  const mods = (t.cases && t.cases[0] ? t.cases[0].modules : []);
  mods.forEach(m => (m.tasks || []).forEach(tk => {
    const r = ws.addRow([m.stageNameCN || m.stage, tk.n, tk.name || '', tk.type || '任務', tk.subgroup || '', tk.durationDays != null ? tk.durationDays : 0, tk.predecessor || '', tk.role || '', tk.effortRatio != null ? tk.effortRatio : ''].concat(isEcn ? [tk.sizes || 'SML'] : []));
    r.eachCell({ includeEmpty: true }, c => { c.font = H.FD; c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }; });
    H.box(r, NC);
  }));
  ws.columns = [{ width: 14 }, { width: 7 }, { width: 34 }, { width: 9 }, { width: 12 }, { width: 8 }, { width: 14 }, { width: 14 }, { width: 9 }].concat(isEcn ? [{ width: 10 }] : []);
  const fn = (t.templateName || '範本').replace(/[\\/:*?"<>|]/g, '_') + '_範本_' + D.fmt(new Date(), 'ymd').replace(/\//g, '') + '.xlsx';
  await App._xlDownload(wb, fn);
};

// ── 匯入：Excel → 範本（模糊找表頭＋欄位；認不出跳精靈）──
App._tplImportPick = async function(id, fileEl, base) {   // base：Wave2-A 從 Excel 新增範本時傳入空骨架；不傳＝Wave1 套進既有 id 基底
  const file = fileEl.files && fileEl.files[0]; fileEl.value = '';
  if (!file) return;
  if (typeof XLSX === 'undefined') { U.toast('❌ 匯入函式庫未載入，請重整頁面', 'error'); return; }
  let aoa;
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', cellDates: false });
    aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: null });
  } catch (e) { U.toast('❌ 讀取失敗：' + e.message, 'error'); return; }
  if (!aoa || !aoa.length) { U.toast('⚠ 檔案沒有內容', 'warning'); return; }
  const learned = (typeof importLearnedMap === 'function') ? importLearnedMap('tpl') : null;
  let hi = fuzzyFindHeaderRow(aoa, TPL_COLUMNS, 2, learned);
  if (hi < 0) hi = 0;
  const byKey = fuzzyResolveColumns(aoa[hi] || [], TPL_COLUMNS, learned).byKey;
  App._tplImportCtx = { id, aoa, hi, base: base || null, fileName: (file && file.name) || '' };
  const missing = TPL_REQUIRED.filter(k => byKey[k] == null);
  if (missing.length) {   // §精簡精靈（共用 renderImportMapping·取代舊自訂 _tplImportWizard；mapping 即完整 byKey）
    App.renderImportMapping({
      title: '範本', domain: 'tpl',
      specs: TPL_COLUMNS, headerCells: (aoa[hi] || []).map(h => String(h == null ? '' : h).trim()),
      resolved: byKey, requiredKeys: TPL_REQUIRED,
      onConfirm: m => App._tplApplyImport(m),
    });
    return;
  }
  App._tplApplyImport(byKey);
};

// 依 byKey 把 aoa 建成 cases[0]（以現有範本為基底保 stageDefaults/roles/sizeMeta），進編輯器檢視後才存
App._tplApplyImport = function(byKey) {
  const { id, aoa, hi } = App._tplImportCtx;
  const base = App._tplImportCtx.base || tplResolve(id) || tplNpi(); if (!base) { U.toast('⚠ 找不到基底範本', 'warning'); return; }
  const draft = JSON.parse(JSON.stringify(base));
  draft.templateId = id;
  const isEcn = tplKind(draft) === 'ecn';
  const cell = (row, key) => { const ci = byKey[key]; return (ci != null && row[ci] != null) ? String(row[ci]).trim() : ''; };
  const stageByName = {}; (draft.stageDefaults || []).forEach(s => { stageByName[impNorm(s.stageNameCN || s.stage)] = s.stage; stageByName[impNorm(s.stage)] = s.stage; });
  const order = (draft.stageDefaults || []).map(s => s.stage);
  const extra = [];
  let autoN = 0;
  const collected = [];
  for (let i = hi + 1; i < aoa.length; i++) {
    const row = aoa[i]; if (!row || row.every(c => c == null || String(c).trim() === '')) continue;
    const name = cell(row, 'name'); if (!name) continue;
    const stName = cell(row, 'stage'); const stKey = stageByName[impNorm(stName)] || stName || (order[0] || '未分階段');
    if (order.indexOf(stKey) < 0 && extra.indexOf(stKey) < 0) extra.push(stKey);
    const nRaw = cell(row, 'n'); const n = nRaw ? (parseInt(nRaw, 10) || (++autoN)) : (++autoN);
    if (nRaw && !isNaN(parseInt(nRaw, 10))) autoN = Math.max(autoN, n);
    const tk = { tplId: 'x' + i, n: n, name: name, type: cell(row, 'type') || '任務', subgroup: cell(row, 'subgroup'), durationDays: parseFloat(cell(row, 'durationDays')) || 0, predecessor: cell(row, 'predecessor'), deliverable: '', role: cell(row, 'role') };
    const er = cell(row, 'effortRatio'); if (er !== '') tk.effortRatio = parseFloat(er) || 0;
    if (isEcn) { tk.sizes = (cell(row, 'sizes') || 'SML').toUpperCase().replace(/[^SML]/g, '') || 'SML'; tk.taskAttr = 'baseline'; }
    collected.push({ tk: tk, stKey: stKey });
  }
  if (!collected.length) { U.toast('⚠ 沒讀到任何任務（確認「任務名」欄有值）', 'warning'); return; }
  const allStages = order.concat(extra);
  const modules = allStages.map(st => {
    const sd = (draft.stageDefaults || []).find(s => s.stage === st);
    return { stage: st, stageNameCN: sd ? (sd.stageNameCN || st) : st, tasks: collected.filter(x => x.stKey === st).map(x => x.tk) };
  }).filter(m => m.tasks.length);
  if (!draft.cases || !draft.cases[0]) draft.cases = [{ variant: '主案', stages: [], modules: [] }];
  draft.cases[0].modules = modules;
  draft.cases[0].stages = modules.map(m => m.stage);
  // Wave2-B：Excel 帶入骨架沒有的新階段 → 補進 stageDefaults，讓 pmCoordEffort／ECN sizeMeta 面板涵蓋它（否則新階段無 PM 常駐%／無法勾入分級）
  modules.forEach(m => { if (!(draft.stageDefaults || []).some(s => s.stage === m.stage)) { const sd = { stage: m.stage, stageNameCN: m.stageNameCN || m.stage, order: (draft.stageDefaults || []).length + 1 }; if ((draft.stageDefaults || []).some(s => s.pmCoordEffort != null)) sd.pmCoordEffort = 0; (draft.stageDefaults = draft.stageDefaults || []).push(sd); } });
  // Wave2-A 從 Excel 新增：範本名稱預設帶 Excel 檔名（骨架 templateName 為空）
  if (App._tplImportCtx.base && !String(draft.templateName || '').trim()) {
    draft.templateName = String(App._tplImportCtx.fileName || '').replace(/\.[^.]+$/, '').trim() || '未命名範本';
  }
  const renum = App._tplRenumber(draft);   // §19.11：Excel 序號跳號（刪中間 task）→自動重排 1..N＋前置跟著重連·指向已刪任務的前置丟棄
  App._tplDraft = draft; App._tplDirty = true;
  U.toast('✓ 已匯入 ' + collected.length + ' 筆任務' + (renum.dropped ? '（序號已重排、' + renum.dropped + ' 個失效前置已移除）' : '（序號已重排）') + '——請檢視後按「存成範本」');
  App._tplRenderEditor();
};

// §19.11：把 cases[0] 全任務依現有順序重編序號 1..N，並把所有前置(含 predBySize)的舊序號改成新序號；指向已刪(不在表中)的前置丟棄。回傳 { dropped }。
App._tplRenumber = function(draft) {
  const mods = (draft.cases && draft.cases[0] ? draft.cases[0].modules : []);
  const map = {};   // 舊序號 → 新序號
  let seq = 0;
  mods.forEach(m => (m.tasks || []).forEach(tk => { seq++; if (tk.n != null && map[tk.n] == null) map[tk.n] = seq; tk._newN = seq; }));
  let dropped = 0;
  const relink = (pred) => String(pred || '').split(/[,，;；]/).map(s => s.trim()).filter(Boolean).map(part => {
    const mm = part.match(/^(\d+)([A-Za-z]{2})?([+-]\s*\d+)?$/);
    if (!mm) return part;                                   // 認不出格式→原樣留
    const nn = map[parseInt(mm[1], 10)];
    if (nn == null) { dropped++; return null; }             // 指向已刪任務→丟棄
    return nn + (mm[2] || '') + (mm[3] ? mm[3].replace(/\s+/g, '') : '');
  }).filter(x => x != null).join(',');
  mods.forEach(m => (m.tasks || []).forEach(tk => {
    tk.predecessor = relink(tk.predecessor);
    if (tk.predBySize) Object.keys(tk.predBySize).forEach(k => { tk.predBySize[k] = relink(tk.predBySize[k]); });
    tk.n = tk._newN; delete tk._newN;
  }));
  return { dropped: dropped };
};
