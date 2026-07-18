/* ═══════════════════════════════════════════════════════════════════
 * PM-Core · Personal Task Board
 * ───────────────────────────────────────────────────────────────────
 *  作者 (Author)        範例作者
 *  GitHub Username      your-name
 *  共同開發 (Co-author) Anthropic Claude
 *  專案 Repo            github.com/your-name/your-repo
 *  開發歷程            （公司/單位名稱）
 *                       手動需求 → AI 協作 → iterative refinement
 *  License             專有軟體·保留一切權利（All Rights Reserved）·見 repo 根目錄 LICENSE
 *  簽章 (Build hash)    PM-Core
 * ───────────────────────────────────────────────────────────────────
 *  Copyright (c) 2026 Paul Hsu (PaulHsu02060). All Rights Reserved.
 *  本程式為專有且機密之著作，非經著作權人事前書面同意，不得複製、修改、
 *  為再構築目的之逆向工程、散布或商業利用（全部或部分）。詳見 LICENSE。
 *  本程式為作者與 Claude (Anthropic) 共同開發，完整開發記錄保存於 GitHub commit history。
 * ═══════════════════════════════════════════════════════════════════ */

const APP_VERSION = '1.5.0';
const APP_AUTHOR = CFG('AUTHOR', 'PM-Core');

// ─── CONFIG READER ─────────────────────────────────────
// 優先讀 APP_CONFIG（config.js 預設值 + config.local.js 本機覆蓋），
// 未載入時退回中性 fallback，避免 config 尚未接上時整支壞掉。
function CFG(key, fallback) {
  return (typeof APP_CONFIG !== 'undefined' && APP_CONFIG[key] !== undefined)
    ? APP_CONFIG[key] : fallback;
}

// 種子資料讀取：SEED_LOCAL（真值，不進 git）優先，否則 SEED_SAMPLE（假值模板）。
function SEED(key, fallback) {
  if (typeof SEED_LOCAL !== 'undefined' && SEED_LOCAL[key] !== undefined) return SEED_LOCAL[key];
  if (typeof SEED_SAMPLE !== 'undefined' && SEED_SAMPLE[key] !== undefined) return SEED_SAMPLE[key];
  return fallback;
}

const APP_BUILD_SIGNATURE = CFG('APP_BUILD_SIGNATURE', 'PM-Core');

// ─── ADMIN / DEFAULT OAUTH ─────────────────────────────
// 預設 OAuth Client ID：hardcode 在這，同事零設定就能 Google 登入
// 安全性：OAuth Client ID 本來就是公開資訊，配 redirect_uri 白名單防呆
// 來源：https://console.cloud.google.com/apis/credentials  (你的 GitHub Pages 網域)
const DEFAULT_OAUTH_CLIENT_ID = CFG('OAUTH_CLIENT_ID', 'PASTE_YOUR_OAUTH_CLIENT_ID');

// 本地開發偵測：file://（OAuth 無法完成）或 localhost → 跳過 Google、自動 admin、顯示 DEV 切換器。
// 線上 github.io 為 https + hostname 非 localhost → 必為 false，bypass 與 DEV 面板皆不啟用（線上零影響）。
const isLocalDev = (location.protocol === 'file:') || ['localhost', '127.0.0.1'].includes(location.hostname);
// DEV 純沙盒（Paul 2026-07-15 定）：本地開發一律「記憶體沙盒」——不讀不寫 localStorage、每次載入重灌 dev-seed，
//   測試改動用完即丟、重整即回 seed、關網頁不留本機、跨機 git pull 拉下來畫面一致（seed=src/dev-seed-data.js·有進版控）。
//   ★只在 isLocalDev 生效；Prod（https）DEV_SANDBOX=false，落地/雲端同步邏輯完全不受影響。
const DEV_SANDBOX = isLocalDev;

// helper：當前登入的 Gmail 是不是 admin
function isAdmin() {
  // role 由後台 BACKEND_URL 查得後存 _role（接 Auth 三層）；不再讀 config ADMIN_EMAILS（線上空）。
  return (typeof DATA !== 'undefined' && DATA.settings && (DATA.settings._role === 'admin' || DATA.settings._role === 'superadmin'));
}

// helper：當前登入的是不是 SuperAdmin（admin 名單管理等最高權限 UI 用）
function isSuperAdmin() {
  return (typeof DATA !== 'undefined' && DATA.settings && DATA.settings._role === 'superadmin');
}

// build hash 用於辨識：把作者名 + 重要常數 hash 起來
// 任何人移除作者標記都會改變這個 hash → 可比對辨識
const BUILD_FINGERPRINT = CFG('BUILD_FINGERPRINT', '');
// 建置指紋校驗：解出指紋原文後 hash 成整數，供防竄改辨識。
// 指紋一旦被移除或竄改，此整數即改變 → 可比對辨識原始碼來源。
const BUILD_INTEGRITY = (() => { try { return BUILD_FINGERPRINT ? Math.abs([...atob(BUILD_FINGERPRINT)].reduce((h, c) => (((h << 5) - h) + c.charCodeAt(0)) | 0, 0)) : 0; } catch (e) { return 0; } })();
try { document.documentElement.setAttribute('data-bfp', BUILD_FINGERPRINT); } catch (e) {}
console.log(`%c ${CFG('APP_NAME', 'PM-Core')} v${APP_VERSION} `, 'background:#4A7C5C;color:#fff;padding:2px 6px;border-radius:3px;font-weight:bold', `by ${APP_AUTHOR} · build: ${APP_BUILD_SIGNATURE}·${BUILD_INTEGRITY}`);

// ─── BRANCH-AWARE STORAGE ──────────────────────────────
const PATH_KEY = location.pathname.replace(/\/index\.html?$/i, '').replace(/\/$/, '') || 'root';
const STORE = {
  projects: `pmw::${PATH_KEY}::projects`,
  tasks:    `pmw::${PATH_KEY}::tasks`,
  meetings: `pmw::${PATH_KEY}::meetings`,
  memos:    `pmw::${PATH_KEY}::memos`,
  schedule: `pmw::${PATH_KEY}::schedule`,
  settings: `pmw::${PATH_KEY}::settings`,
  password: `pmw::${PATH_KEY}::password`,
  weekNotes: `pmw::${PATH_KEY}::weeknotes`,
  calendars: `pmw::${PATH_KEY}::calendars`,
  templates: `pmw::${PATH_KEY}::templates`,   // §19.11 範本自訂覆蓋層＋複製新增（內建留檔案不入此）
  parts:    `pmw::${PATH_KEY}::parts`,        // §21 物料料號主檔（Part Master·跨案·partId 主鍵）
  stageQty:    `pmw::${PATH_KEY}::stageqty`,     // §21.15 型號×階段台數矩陣（per 專案·專案專屬）
  machineTxns: `pmw::${PATH_KEY}::machinetxns`,  // §21.15 樣機去向領用交易（per 專案×階段）
  invTxns:     `pmw::${PATH_KEY}::invtxns`,      // §21.6② 料件事實交易（到料/額外需求/盤點·per 專案×階段×partNo）
  rdPlan:      `pmw::${PATH_KEY}::rdplan`,        // §21.15 E RD 後續規劃留用需求（per 專案×階段·台/階段）
  quotes:      `pmw::${PATH_KEY}::quotes`,        // §21.16 廠商報價比價紀錄（模糊匯入·per 料號×廠商·projId null=全域）
  molds:       `pmw::${PATH_KEY}::molds`,         // §21.17 模具費用（獨立資產·per 模具·allocations 分攤多案·非料號）
  reportTemplates: `pmw::${PATH_KEY}::reporttemplates`,   // §24 報表產出範本（原檔 base64＋對應 mapping·Phase 1 Excel）
  projectsTrash: `pmw::${PATH_KEY}::projectstrash`,  // §23 專案回收桶（軟刪·離開 projects 進獨立桶·保留 30 天·approach B）
  transcripts: `pmw::${PATH_KEY}::transcripts`,   // §27 會議逐字稿（陣列·逐字稿＋會議紀錄兩存·純文字）
  folders:     `pmw::${PATH_KEY}::folders`,       // §27 逐字稿手動資料夾樹（巢狀最多 3 層）
};

// ─── DEFAULT SETTINGS ──────────────────────────────────
const DEFAULT_SETTINGS = {
  userName: '使用者',
  department: '',
  dailyHours: 6,
  workStart1: '09:00',
  workEnd1: '12:00',
  workStart2: '14:00',
  workEnd2: '18:00',
  goldenTime: 'morning',
  workDays: [1, 2, 3, 4, 5],
  splitThreshold: 4,
  doneRetentionDays: 30,
  previewWeeks: 2,
  // 總儀表板時程表顯示偏好（純顯示，存全域→上雲跨機）；午休 12:00–13:00 固定，不受此影響。
  gridStartHour: 8,
  gridEndHour: 18,
  gridSlotMinutes: 60,   // 週曆固定一小時一格（render 已強制；此值保留相容）
  // HintBox 區塊級說明框收合狀態：{ [key]: true=收起 }；undefined/false=展開（預設展開）。整包隨 settings 持久化＋上雲。
  hintBoxState: {},
  // 【需求 A】手動釘選到本週的 task id；釘選後不因 plannedStart 在未來被排程踢出
  pinnedWeekTaskIds: [],
  // Google OAuth 白名單（只有這些 Gmail 登入後才能編輯）
  allowedEmails: CFG('ALLOWED_EMAILS', []),
  googleClientId: '', // 由使用者在設定頁填入

  // ─── 雲端同步 (Cloud Sync via Google Apps Script) ───
  cloudSyncUrl: CFG('BACKEND_URL', ''),  // 預設讀 config.js 後端 URL（doGet 已綁登入 §14；本機存檔/真值仍優先覆蓋）
  cloudSyncEnabled: true,                // 預設開啟（只要填了 URL 就會自動運作）
  cloudAutoSync: true,                   // 儲存後自動上傳
  cloudLastSync: '',                     // 最後同步時間（ISO）

  // ─── 事件規則（會議/打掃 等定期事件） ───
  // 智慧排程會自動避開這些時段
  // category: 'meeting' (會議) | 'cleaning' (打掃)
  // frequency: 'daily' | 'weekly' | 'biweekly' | 'triweekly' | 'biweekly-allday' | 'triweekly-allday'
  // day: 0~6（週日 ~ 週六）— frequency 非 daily/allday 時使用
  // startDate: 開始日期（iso）— 雙週/三週時用來計算「第幾週」
  // endDate: 結束日期（iso，空=永久）
  recurringMeetings: SEED('recurringMeetings', []),
  // 特定日期會議
  specialMeetings: [],
};

// ─── COLORS FOR PROJECTS ───────────────────────────────
// 專案識別色：讀 :root 的 --proj-c1~8（亮版），不寫死 hex（消 CSS 鐵則重複）。
// CSS 於 <head> 先載、app.js 在 body 末執行 → getComputedStyle 此刻已能解析變數。
const PROJ_COLORS = (() => {
  const _root = getComputedStyle(document.documentElement);
  return [1, 2, 3, 4, 5, 6, 7, 8].map(n => _root.getPropertyValue(`--proj-c${n}`).trim());
})();
const MEMO_COLORS = ['memo-y', 'memo-p', 'memo-b', 'memo-g', 'memo-o'];

// ─── DATA ──────────────────────────────────────────────
let DATA = {
  projects: [],
  tasks: [],
  meetings: [],
  memos: [],
  schedule: { week: null, items: [] },
  settings: { ...DEFAULT_SETTINGS },
  weekNotes: {}, // { 'W21-2026': 'note text' }
  pdcaGroups: {}, // 殘留：PDCA 報表已拔除（§18.14）；僅供 migration 寫入相容、無人讀、不 load/save/sync
  // 工作日曆（架構文件 §第四部分之二）：base 公版假日 + override 公司調休，兩層疊加供 isWorkday/addWorkdays。
  // 步驟 2-1：先建初始結構（holidays 空物件、weekends 先不放維持讀 DATA.settings.workDays、override 待之二.6）；
  // 2-2 才把 isWorkday 改讀此處；第 3 步灌公司公休（約 28 筆範例）進 base.holidays。
  calendars: { base: { name: '台灣公版', holidays: {} }, override: null },
  parts: [],   // §21 料號主檔（Part Master·跨案·partId 主鍵·單價/交期單一真實來源）
  projectsTrash: [],   // §23 專案回收桶（軟刪離場·load 亦設）
};

// ─── STORAGE HELPERS ───────────────────────────────────
const Storage = {
  load() {
    try {
      // DEV 純沙盒：先清掉本機 DATA 殘留（含舊測試資料）＋廢棄的 pm_dev_seeded 旗標，然後照常往下讀——此時讀到全空，
      //   讓所有資料域（含 templates/stageQty/molds 等 line-144 預設沒列到的）都被正確初始化成空默認，dev-seed 才灌得進去（別 early-return 跳過讀取，會漏初始化→dev-seed push 炸）。
      //   只清資料類 STORE key，不碰側欄排序/收合/DEV 身份等 UI 偏好；save() 已 no-op，故不會再落地＝記憶體版、重整回 seed。
      if (DEV_SANDBOX) {
        try { Store._domains.forEach(n => { if (STORE[n]) localStorage.removeItem(STORE[n]); }); localStorage.removeItem('pm_dev_seeded'); } catch (e) {}
      }
      DATA.projects  = JSON.parse(localStorage.getItem(STORE.projects)  || '[]');
      DATA.tasks     = JSON.parse(localStorage.getItem(STORE.tasks)     || '[]');
      DATA.meetings  = JSON.parse(localStorage.getItem(STORE.meetings)  || '[]');
      DATA.memos     = JSON.parse(localStorage.getItem(STORE.memos)     || '[]');
      DATA.schedule  = JSON.parse(localStorage.getItem(STORE.schedule)  || '{"week":null,"items":[]}');
      DATA.settings  = { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem(STORE.settings) || '{}')) };
      DATA.weekNotes = JSON.parse(localStorage.getItem(STORE.weekNotes) || '{}');
      DATA.templates = JSON.parse(localStorage.getItem(STORE.templates) || '[]');   // §19.11：舊環境無 key 回 []
      // 工作日曆：舊環境無此 key → fallback 完整預設結構（非 undefined，避免 isWorkday 讀 .base 炸）
      DATA.calendars = JSON.parse(localStorage.getItem(STORE.calendars) || 'null') || { base: { name: '台灣公版', holidays: {} }, override: null };
      DATA.parts     = JSON.parse(localStorage.getItem(STORE.parts)     || '[]');   // §21 料號主檔
      DATA.stageQty    = JSON.parse(localStorage.getItem(STORE.stageQty)    || '{}');   // §21.15 台數矩陣（per 專案）
      DATA.machineTxns = JSON.parse(localStorage.getItem(STORE.machineTxns) || '[]');   // §21.15 樣機去向領用
      DATA.invTxns     = JSON.parse(localStorage.getItem(STORE.invTxns)     || '[]');   // §21.6② 料件事實交易
      DATA.rdPlan      = JSON.parse(localStorage.getItem(STORE.rdPlan)      || '{}');   // §21.15 E RD 規劃留用需求（per 專案×階段）
      DATA.quotes      = JSON.parse(localStorage.getItem(STORE.quotes)      || '[]');   // §21.16 報價比價紀錄
      DATA.molds       = JSON.parse(localStorage.getItem(STORE.molds)       || '[]');   // §21.17 模具費用
      DATA.reportTemplates = JSON.parse(localStorage.getItem(STORE.reportTemplates) || '[]');   // §24 報表產出範本
      DATA.projectsTrash = JSON.parse(localStorage.getItem(STORE.projectsTrash) || '[]');   // §23 專案回收桶
      DATA.transcripts = JSON.parse(localStorage.getItem(STORE.transcripts) || '[]');   // §27 會議逐字稿
      DATA.folders     = JSON.parse(localStorage.getItem(STORE.folders)     || '[]');   // §27 逐字稿資料夾樹

      // ─── 清掉「找不到任務」的 schedule 殘留 ───
      if (DATA.schedule && Array.isArray(DATA.schedule.items)) {
        const before = DATA.schedule.items.length;
        DATA.schedule.items = DATA.schedule.items.filter(it => {
          const task = DATA.tasks.find(t => t.id === it.taskId);
          return !!task; // 找不到對應任務就清掉
        });
        if (before !== DATA.schedule.items.length) {
          localStorage.setItem(STORE.schedule, JSON.stringify(DATA.schedule));
        }
      }

      // ─── Settings migration: 為舊的 recurringMeetings 補上新欄位 ───
      if (DATA.settings.recurringMeetings && DATA.settings.recurringMeetings.length > 0) {
        let migrated = false;
        for (const m of DATA.settings.recurringMeetings) {
          if (!m.category) { m.category = 'meeting'; migrated = true; }
          if (!m.frequency) { m.frequency = 'weekly'; migrated = true; }
          if (m.startDate === undefined) { m.startDate = ''; migrated = true; }
          if (m.endDate === undefined) { m.endDate = ''; migrated = true; }
          // 把舊的「定期打掃（早）週一」升級為「整週每天」
          if (m.category === 'cleaning' && m.title && m.title.includes('早') && m.frequency === 'biweekly' && m.day === 1) {
            m.frequency = 'biweekly-allday';
            delete m.day; // allday 不需要 day
            migrated = true;
          }
        }

        // 若沒有任何「打掃」項目 → 自動補上預設的兩條
        const hasCleaning = DATA.settings.recurringMeetings.some(m => m.category === 'cleaning');
        if (!hasCleaning) {
          DATA.settings.recurringMeetings.push(
            ...SEED('cleaningDefaults', []).map(o => ({ ...o }))
          );
          migrated = true;
        }

        if (migrated) {
          localStorage.setItem(STORE.settings, JSON.stringify(DATA.settings));
          console.log('Settings migrated: added cleaning defaults + new fields');
        }
      }
      // 可販日：確保 project.pdcaData 殼存在（KPI WORKDAYS LEFT 讀 targetDate；PDCA 報表已拔除 §18.14）
      DATA.projects.forEach(ensurePdcaData);
      DATA.tasks.forEach(ensureTaskType);
      DATA.tasks.forEach(ensureDeliverFields);
      runMigrations();
    } catch(e) { console.error('Load failed', e); }
  },
  save() {
    // 唯讀防線（咽喉）：viewonly 一律不落地。鎖 body.viewonly（非 _role——viewonly 進來只設 body class、無 _role，鎖 _role 會誤擋）。
    // 靜默 return（不 toast）：save 也被 migration/download 等內部流程呼叫，toast 會誤報；UX 提示放各編輯動作入口（第 3 處）。
    if (document.body.classList.contains('viewonly')) return;
    // DEV 純沙盒：一律不落地（記憶體版·含 dev-seed 灌入後的 save 亦 no-op → seed 只進記憶體）
    if (DEV_SANDBOX) return;
    // 安全(§8f.6 Level 2/B)：未登入(無 _role 且非 localDev)不落地——登出清快取後的載入流程(migration／排程殘留整理等)
    //   不再把空殼寫回 localStorage，F12 保持全空。authed(admin/editor/superadmin 登入即設 _role)與 localDev 正常存檔；
    //   雲端 download 走直接 setItem、不經此函式，且登入後 _role 已設，故不受影響。
    if (!isLocalDev && !DATA.settings._role) return;
    // 逐 store 寫入（改用 Store._writeKey 單一真實來源；取值/fallback 集中在 Store._defs，行為與舊整包 dump 等值）。
    Store._domains.forEach(name => Store._writeKey(name));

    // ─── 雲端自動同步（透過資料來源 adapter；離線來源不上雲·§20.9）───
    Store._syncCloud();
  },
  // 安全(§8f.6 Level 2/B)：登出時清本機快取。
  //   當前 app(PATH_KEY) → 全清(含 settings/schedule/synclog，潔癖，登出後 F12 該路徑全空)。
  //   其他路徑(舊部署/平行部署) → 只清專案資料類，保留其 ::settings(不誤傷平行部署的設定)。
  //   被清資料雲端皆有：登入後後端位址來自 config.js 的 BACKEND_URL、自動下載還原，故清除安全、不掉資料。
  clearLocalData() {
    const DATA_SUFFIXES = ['projects', 'tasks', 'meetings', 'memos', 'schedule', 'weeknotes', 'calendars', 'parts'];
    const curPrefix = 'pmw::' + PATH_KEY + '::';
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith('pmw::')) continue;
      if (k.startsWith(curPrefix) || DATA_SUFFIXES.includes(k.split('::').pop())) {
        localStorage.removeItem(k);
      }
    }
  },
};

// ─── PER-DOMAIN STORE（漸進遷移：逐 store 持久化，取代整包 dump）───
// 設計：DATA.* 仍是記憶體單一真實來源（讀取不變、同步、UI/計算零改動）；每個子 store 的 save() 只序列化「自己那把 key」。
//   舊寫入點從 `Storage.save()`（全 dump 9 key）逐批改成單一 `Store.<domain>.save()`（只寫變動那把）＝省序列化＋天生 diff。
//   落地防線與雲端 debounce 沿用 Storage.save 同一套咽喉（viewonly 不落地／未登入非 localDev 不落地）。
//   日後接正規 DB：只需把 _writeKey／各 save() 換成逐筆 API，DATA.* 讀取與呼叫端零改動。
// 資料來源 adapter（形式二 Repository·§20.9）：UI/計算層只呼 Store.<domain>.save()，不知底層是誰。
//   online＝寫 localStorage＋雲端同步（現況等值·預設）；offline＝寫 localStorage、不上雲（設定頁「資料來源」tab 切）。
//   接正規 DB＝日後另加 adapter、把 write 換逐筆 API（讀取層另議·§20.9 邊界＝只包寫入層）。
const StoreAdapters = {
  online: {
    id: 'online',
    write(key, val) { localStorage.setItem(key, val); },
    syncCloud() {
      if (DATA.settings.cloudSyncEnabled && DATA.settings.cloudAutoSync && DATA.settings.cloudSyncUrl) {
        CloudSync.scheduleUpload();
      }
    },
  },
  offline: {
    id: 'offline',
    write(key, val) { localStorage.setItem(key, val); },
    syncCloud() { /* 離線：只寫本機、不上雲 */ },
  },
};
const Store = {
  // 落地防線（與 Storage.save 同一套）：viewonly／未登入非 localDev → 不落地。
  _canPersist() {
    if (DEV_SANDBOX) return false;   // DEV 純沙盒：per-domain save 亦不落地、不觸雲端（記憶體版）
    if (document.body.classList.contains('viewonly')) return false;
    if (!isLocalDev && !DATA.settings._role) return false;
    return true;
  },
  // 當前資料來源 adapter（預設 online＝現況等值·§20.9）；由設定頁 dataSource 切換。
  get _adapter() { return StoreAdapters[DATA.settings.dataSource] || StoreAdapters.online; },
  // 雲端同步（委派 adapter；離線來源 no-op）
  _syncCloud() { this._adapter.syncCloud(); },
  // 各 domain 的取值/fallback 單一真實來源（calendars 空殼、templates []）
  _defs: {
    projects:  () => DATA.projects,
    tasks:     () => DATA.tasks,
    meetings:  () => DATA.meetings,
    memos:     () => DATA.memos,
    schedule:  () => DATA.schedule,
    settings:  () => DATA.settings,
    weekNotes: () => DATA.weekNotes,
    calendars: () => DATA.calendars || { base: { name: '台灣公版', holidays: {} }, override: null },
    templates: () => DATA.templates || [],
    parts:     () => DATA.parts || [],
    stageQty:    () => DATA.stageQty || {},
    machineTxns: () => DATA.machineTxns || [],
    invTxns:     () => DATA.invTxns || [],
    rdPlan:      () => DATA.rdPlan || {},
    quotes:      () => DATA.quotes || [],
    molds:       () => DATA.molds || [],
    reportTemplates: () => DATA.reportTemplates || [],
    projectsTrash: () => DATA.projectsTrash || [],
    transcripts: () => DATA.transcripts || [],
    folders:     () => DATA.folders || [],
  },
  _domains: ['projects', 'tasks', 'meetings', 'memos', 'schedule', 'settings', 'weekNotes', 'calendars', 'templates', 'parts', 'stageQty', 'machineTxns', 'invTxns', 'rdPlan', 'quotes', 'molds', 'projectsTrash', 'reportTemplates', 'transcripts', 'folders'],
  // 只寫單一 key（不過防線、不觸發雲端）——供整包 save 逐 key 呼叫；單 store save() 另過防線＋雲端。
  _writeKey(name) {
    this._adapter.write(STORE[name], JSON.stringify(this._defs[name]()));
  },
};
// 陣列型 store 工廠（projects/tasks/meetings/memos/templates）：all/find/add/update/remove/save
function _makeArrayStore(name, idKey) {
  return {
    all()      { return DATA[name]; },
    find(id)   { return (DATA[name] || []).find(o => o && o[idKey] === id); },
    add(item)  { DATA[name].push(item); this.save(); return item; },
    update(id, changes) { const o = this.find(id); if (o) Object.assign(o, changes); this.save(); return o; },
    remove(id) { DATA[name] = (DATA[name] || []).filter(o => o && o[idKey] !== id); this.save(); },
    save()     { if (!Store._canPersist()) return; Store._writeKey(name); Store._syncCloud(); },
  };
}
// 物件型 store 工廠（schedule/settings/weekNotes/calendars）：就地改後呼 save()
function _makeObjStore(name) {
  return {
    save() { if (!Store._canPersist()) return; Store._writeKey(name); Store._syncCloud(); },
  };
}
Store.projects  = _makeArrayStore('projects', 'id');
Store.tasks     = _makeArrayStore('tasks', 'id');
Store.meetings  = _makeArrayStore('meetings', 'id');
Store.memos     = _makeArrayStore('memos', 'id');
Store.templates = _makeArrayStore('templates', 'templateId');
Store.parts     = _makeArrayStore('parts', 'partId');   // §21 料號主檔
Store.stageQty    = _makeObjStore('stageQty');            // §21.15 台數矩陣（物件·per 專案）
Store.machineTxns = _makeArrayStore('machineTxns', 'id'); // §21.15 樣機去向領用
Store.invTxns     = _makeArrayStore('invTxns', 'id');     // §21.6② 料件事實交易
Store.rdPlan      = _makeObjStore('rdPlan');              // §21.15 E RD 規劃留用需求（物件·per 專案×階段）
Store.quotes      = _makeArrayStore('quotes', 'id');     // §21.16 報價比價紀錄（陣列·per 料號×廠商）
Store.molds       = _makeArrayStore('molds', 'id');      // §21.17 模具費用（陣列·per 模具·分攤多案）
Store.reportTemplates = _makeArrayStore('reportTemplates', 'id');   // §24 報表產出範本（陣列·per 範本·原檔 base64＋mapping）
Store.projectsTrash = _makeArrayStore('projectsTrash', 'id');   // §23 專案回收桶（軟刪離場·approach B）
Store.transcripts = _makeArrayStore('transcripts', 'id');   // §27 會議逐字稿（陣列·逐字稿＋會議紀錄兩存）
Store.folders     = _makeArrayStore('folders', 'id');       // §27 逐字稿手動資料夾樹（巢狀最多 3 層）
Store.schedule  = _makeObjStore('schedule');
Store.settings  = _makeObjStore('settings');
Store.weekNotes = _makeObjStore('weekNotes');
Store.calendars = _makeObjStore('calendars');

// ─── CLOUD SYNC MODULE ───
// 雙向同步：載入時拉雲端，儲存時推雲端
const CloudSync = {
  _uploadTimer: null,
  _isUploading: false,
  _uploadErrNotified: false,
  _downloadErrNotified: false,

  // Debounced upload (3 秒內多次儲存只上傳一次)
  scheduleUpload() {
    if (this._uploadTimer) clearTimeout(this._uploadTimer);
    this._uploadTimer = setTimeout(() => this.upload(true), 3000);
  },

  // 登出/離開前：把待上傳(debounce 中)的改動立即推上雲端，回傳 promise。清本機快取前呼叫，避免遺失最後一次編輯。
  //   viewonly／無憑證／未設雲端 → 直接 return(無可上傳)。
  //   回傳「是否可安全清除本機」：viewonly＝true（無本地編輯）／無同步能力＝false（清了無處還原）／正常＝upload 成功與否（登出端據此決定是否清本機，防掉資料·Paul 2026-07-05）。
  async flushPendingUpload() {
    if (this._uploadTimer) { clearTimeout(this._uploadTimer); this._uploadTimer = null; }
    if (document.body.classList.contains('viewonly')) return true;
    if (!Auth._idToken || !DATA.settings.cloudSyncEnabled || !DATA.settings.cloudSyncUrl) return false;
    return await this.upload(true);
  },

  // 上傳本地資料到雲端
  async upload(silent = false) {
    // 唯讀防線（咽喉）：viewonly 一律不上傳雲端（堵共用 blob 外洩真向量）。鎖 body.viewonly，靜默 return false。
    if (document.body.classList.contains('viewonly')) return false;
    // ★階段2 守衛：無 id_token（重整/本地/DEV 切換、或登入過期）→ 不送。auto(silent) 靜默跳過、手動 toast 重登。
    if (!Auth._idToken) {
      if (!silent) U.toast('登入已過期，請重新登入', 'error');
      return false;
    }
    const url = DATA.settings.cloudSyncUrl;
    if (!url) {
      if (!silent) U.toast('⚠ 尚未設定雲端 URL', 'warning');
      return false;
    }
    if (this._isUploading) return false;
    this._isUploading = true;
    if (!silent) U.toast('☁ 上傳中...', 'info');

    try {
      // ★安全：上傳前剝掉機密/PII，避免「公開讀」時雲端 blob 外洩。
      //   寫入驗證用 payload.id_token（Google JWT，§14；doPost 驗 role≥editor）。cloudSyncToken 已廢（前端 token UI/設定已清）；此處仍解構剝除，防舊機器 localStorage 殘留值上傳。
      //   _loggedInEmail/_loggedInPicture 為 PII，一併剔除。
      const { cloudSyncToken, _loggedInEmail, _loggedInPicture, _role, ...safeSettings } = DATA.settings;
      const payload = {
        id_token: Auth._idToken,
        data: {
          // 根治雲端同步過大：完整新舊 BOM 表 bomSheets 體積可上看數十萬字，不上雲（本機 localStorage 保留供重生完整報表·跨機需重匯）；雲端只留差異行 bomRows＋設定
          projects: DATA.projects.map(p => { const { bomSheets, ...rest } = p; return rest; }),
          tasks: DATA.tasks,
          meetings: DATA.meetings,
          memos: DATA.memos,
          schedule: DATA.schedule,
          settings: safeSettings,
          weekNotes: DATA.weekNotes,
          calendars: DATA.calendars,
          templates: DATA.templates || [],   // §19.11 範本自訂層隨雲端同步（三機一致）
          parts: DATA.parts || [],           // §21 料號主檔隨雲端同步（跨機一致）
          stageQty: DATA.stageQty || {},     // §21.15 台數矩陣（下載端 :517 已讀·補上傳完成 round-trip·跨機同步·規則18）
          machineTxns: DATA.machineTxns || [], // §21.15 樣機去向領用
          invTxns: DATA.invTxns || [],       // §21.6② 料件事實交易（到料/額外/盤點）
          rdPlan: DATA.rdPlan || {},         // §21.15 E RD 規劃留用需求
          quotes: DATA.quotes || [],         // §21.16 報價比價紀錄
          molds: DATA.molds || [],           // §21.17 模具費用
          reportTemplates: DATA.reportTemplates || [],   // §24 報表產出範本
          projectsTrash: DATA.projectsTrash || [],   // §23 專案回收桶（跨機同步·規則18 round-trip）
          transcripts: DATA.transcripts || [],   // §27 會議逐字稿（純文字·隨雲端 pack 三機同步）
          folders: DATA.folders || [],           // §27 逐字稿資料夾樹
          _uploadedAt: new Date().toISOString(),
        },
      };
      // 用 text/plain 避免 CORS preflight
      const res = await fetch(url, {
        method: 'POST',
        mode: 'cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload),
        redirect: 'follow',
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      DATA.settings.cloudLastSync = new Date().toISOString();
      // 不能再呼叫 Storage.save() 否則無限迴圈，直接寫 localStorage
      localStorage.setItem(STORE.settings, JSON.stringify(DATA.settings));
      this._refreshSyncStatus();
      this._uploadErrNotified = false;
      if (!silent) U.toast('☁ 已上傳到雲端', 'success');
      return true;
    } catch (e) {
      console.error('Cloud upload failed:', e);
      // 登入過期（Google JWT 短效，非系統故障）→ 友善 toast、不彈嚇人 alert；auto 靜默、手動才提示（比照 upload 開頭 !_idToken 守衛）
      const m = e && e.message;
      if (m === 'Invalid token' || m === 'Missing id_token' || m === 'Token verify failed') {
        if (!silent) U.toast('登入已過期，請重新登入', 'error');
        return false;
      }
      // 暫時性後端無回應：回傳 HTML/非 JSON（Google quota/rate-limit/瞬斷）或網路錯 → 資料已存本機、下次存檔自動重傳，不彈嚇人 modal（只手動時給溫和 toast）
      if (/JSON|Unexpected token|DOCTYPE|Failed to fetch|NetworkError|Load failed/i.test(m || '')) {
        if (!silent) U.toast('☁ 雲端暫時無回應，已存本機，稍後自動重傳', 'warning');
        return false;
      }
      // 真故障（有 _idToken 卻後端回明確錯誤）→ alert 強提示，不分 silent（auto 也彈）；_uploadErrNotified 一次性防 auto-upload 每 3 秒彈一次（成功上傳才 reset）
      if (!this._uploadErrNotified) {
        this._uploadErrNotified = true;
        App.confirmModal({ icon: 'ti-cloud-off', iconBg: '--rose-l', iconColor: '--rose-ink', title: '雲端同步失敗', msg: '本次改動已存在本機、但未上傳雲端。資料暫時只在這台裝置，請勿清除瀏覽器資料；可稍後重試（再次儲存會自動重傳）。<br>錯誤：' + U.esc(e.message), cancelText: null, okText: '我知道了' });
      }
      return false;
    } finally {
      this._isUploading = false;
    }
  },

  // 從雲端下載最新資料（覆蓋本地）
  async download(silent = false) {
    const url = DATA.settings.cloudSyncUrl;
    if (!url) {
      if (!silent) U.toast('⚠ 尚未設定雲端 URL', 'warning');
      return false;
    }
    if (!Auth._idToken) {
      if (!silent) U.toast('登入已過期，請重新登入', 'error');
      return false;
    }
    if (!silent) U.toast('☁ 從雲端下載中...', 'info');

    try {
      const idt = encodeURIComponent(Auth._idToken || '');
      const sep = url.includes('?') ? '&' : '?';
      const res = await fetch(url + sep + 'id_token=' + idt, {
        method: 'GET',
        mode: 'cors',
        redirect: 'follow',
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      if (!result.data) {
        if (!silent) U.toast('⚠ 雲端目前沒有資料', 'warning');
        return false;
      }

      const cloud = result.data;
      this._applyCloudData(cloud);

      this._refreshSyncStatus();
      this._downloadErrNotified = false;
      if (!silent) U.toast('☁ 已從雲端載入最新資料', 'success');
      return true;
    } catch (e) {
      console.error('Cloud download failed:', e);
      // 真故障 → toast（風險低，本地資料還在）；_downloadErrNotified 一次性防 auto-download 重複彈（成功下載才 reset）
      if (!this._downloadErrNotified) {
        this._downloadErrNotified = true;
        U.toast('⚠ 雲端下載失敗，未能拉取最新資料', 'warning');
      }
      return false;
    }
  },

  // 整碗把一份 DATA blob 套進本地（CloudSync.download 與 §17 快照還原共用；保留本地雲端設定、寫 localStorage、跑 migration）
  _applyCloudData(cloud) {
    const localCloudCfg = {
      cloudSyncUrl: DATA.settings.cloudSyncUrl,
      cloudSyncEnabled: DATA.settings.cloudSyncEnabled,
      cloudAutoSync: DATA.settings.cloudAutoSync,
      whisperUrl: DATA.settings.whisperUrl,   // §27 轉譯後端＝本地連線設定，同 cloudSyncUrl 保留（防舊 blob 下拉洗掉·Paul 實測踩到）
      _role: DATA.settings._role,   // 本地 session 身份，不被沒帶 _role 的雲端 blob 洗掉
    };
    // 雲端不帶 bomSheets（根治同步過大）——同步下拉時保留本機完整 BOM 表，同機仍能重生完整報表（跨機首次需重匯）
    const _localBom = {};
    (DATA.projects || []).forEach(p => { if (p && p.bomSheets) _localBom[p.id] = p.bomSheets; });
    DATA.projects = (cloud.projects || []).map(p => (p && !p.bomSheets && _localBom[p.id]) ? { ...p, bomSheets: _localBom[p.id] } : p);
    DATA.tasks = cloud.tasks || [];
    DATA.meetings = cloud.meetings || [];
    DATA.memos = cloud.memos || [];
    DATA.schedule = cloud.schedule || { week: null, items: [] };
    DATA.settings = { ...DEFAULT_SETTINGS, ...(cloud.settings || {}), ...localCloudCfg };
    DATA.weekNotes = cloud.weekNotes || {};
    // ⚠ 防坑：雲端沒帶 calendars（舊 blob）→ 保留本地剛匯入的，不可用空預設蓋掉
    DATA.calendars = cloud.calendars || DATA.calendars;
    DATA.templates = cloud.templates || DATA.templates || [];   // §19.11 防坑：舊 blob 無此欄不蓋空本地
    DATA.parts = cloud.parts || DATA.parts || [];   // §21 防坑：舊 blob 無此欄不蓋空本地
    DATA.stageQty    = cloud.stageQty    || DATA.stageQty    || {};   // §21.15 防坑：舊 blob 無此欄不蓋空本地
    DATA.machineTxns = cloud.machineTxns || DATA.machineTxns || [];
    DATA.invTxns     = cloud.invTxns     || DATA.invTxns     || [];
    DATA.rdPlan      = cloud.rdPlan      || DATA.rdPlan      || {};   // §21.15 E RD 規劃留用需求
    DATA.quotes      = cloud.quotes      || DATA.quotes      || [];   // §21.16 報價比價紀錄
    DATA.molds       = cloud.molds       || DATA.molds       || [];   // §21.17 模具費用
    DATA.reportTemplates = cloud.reportTemplates || DATA.reportTemplates || [];   // §24 報表產出範本
    DATA.projectsTrash = cloud.projectsTrash || DATA.projectsTrash || [];   // §23 專案回收桶（防坑：舊 blob 無此欄不蓋空本地）
    DATA.transcripts = cloud.transcripts || DATA.transcripts || [];   // §27 會議逐字稿（防坑：舊 blob 無此欄不蓋空本地）
    DATA.folders     = cloud.folders     || DATA.folders     || [];   // §27 逐字稿資料夾樹
    DATA.settings.cloudLastSync = new Date().toISOString();
    // 寫入 localStorage（直接寫，不觸發 auto-upload）
    localStorage.setItem(STORE.projects, JSON.stringify(DATA.projects));
    localStorage.setItem(STORE.tasks,    JSON.stringify(DATA.tasks));
    localStorage.setItem(STORE.meetings, JSON.stringify(DATA.meetings));
    localStorage.setItem(STORE.memos,    JSON.stringify(DATA.memos));
    localStorage.setItem(STORE.schedule, JSON.stringify(DATA.schedule));
    localStorage.setItem(STORE.settings, JSON.stringify(DATA.settings));
    localStorage.setItem(STORE.weekNotes,JSON.stringify(DATA.weekNotes));
    localStorage.setItem(STORE.calendars, JSON.stringify(DATA.calendars));
    localStorage.setItem(STORE.templates, JSON.stringify(DATA.templates || []));   // §19.11
    localStorage.setItem(STORE.parts, JSON.stringify(DATA.parts || []));   // §21
    // 覆蓋後再跑一次 migration（否則 load 時跑的會被蓋掉）；其內 Storage.save 會把結果上傳回雲端
    runMigrations();
  },

  _refreshSyncStatus() {
    // 更新設定頁的 last sync 顯示（如果在設定頁）
    const el = document.getElementById('cloudSyncLastEl');
    if (el && DATA.settings.cloudLastSync) {
      const d = new Date(DATA.settings.cloudLastSync);
      el.textContent = `${d.toLocaleDateString('zh-TW')} ${d.toTimeString().slice(0, 5)}`;
    }
  },
};

// ─── DATE UTILS ────────────────────────────────────────
const D = {
  today() { return new Date(); },
  monday(d = new Date()) {
    const x = new Date(d); x.setHours(0,0,0,0);
    const day = x.getDay(); const diff = day === 0 ? -6 : 1 - day;
    x.setDate(x.getDate() + diff); return x;
  },
  // 規劃週起算:週日視為「下一週」的開始;週一~週六與 monday() 完全一致
  weekStart(d = new Date()) {
    const x = new Date(d); x.setHours(0,0,0,0);
    const day = x.getDay(); const diff = day === 0 ? 1 : 1 - day;
    x.setDate(x.getDate() + diff); return x;
  },
  weekNum(d = new Date()) {
    const target = new Date(d.valueOf());
    const dayNr = (d.getDay() + 6) % 7;
    target.setDate(target.getDate() - dayNr + 3);
    const firstThursday = new Date(target.getFullYear(), 0, 4);
    const diff = target - firstThursday;
    return 1 + Math.ceil(diff / (7 * 86400000));
  },
  weekKey(d = new Date()) { return `W${this.weekNum(d)}-${d.getFullYear()}`; },
  weekRange(d = new Date()) {
    const m = this.monday(d); const s = new Date(m); const e = new Date(m); e.setDate(e.getDate() + 6);
    return { start: s, end: e };
  },
  fmt(d, opt = 'md') {
    if (!d) return '';
    const dt = d instanceof Date ? d : new Date(d);
    if (isNaN(dt)) return '';
    const y = dt.getFullYear(), m = dt.getMonth() + 1, day = dt.getDate();
    if (opt === 'iso') return `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    if (opt === 'md') return `${m}/${day}`;
    if (opt === 'ymd') return `${y}/${String(m).padStart(2,'0')}/${String(day).padStart(2,'0')}`;
    if (opt === 'ymdShort') return `${y}/${m}/${day}`;
    return `${y}/${m}/${day}`;
  },
  daysBetween(a, b) {
    const da = new Date(a); da.setHours(0,0,0,0);
    const db = new Date(b); db.setHours(0,0,0,0);
    return Math.round((db - da) / 86400000);
  },
  addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; },
  isWeekend(d) { const day = d.getDay(); return day === 0 || day === 6; },
  isSameDay(a, b) {
    if (!a || !b) return false;
    const da = new Date(a), db = new Date(b);
    return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate();
  },

  // ─── 工作日曆 + 工作日計算（階段2 新核心）──────────────────────
  // 行事曆資料由後端 API（行事曆分頁）於啟動時填入；預設空陣列，
  // 無資料時自動退回「只認週末」行為（換 Sheet 沒建分頁也不會壞）。
  // holidays / supplementWorkDays 皆為 'YYYY-MM-DD' 字串陣列。
  // 行事曆分頁三欄：日期(YYYY-MM-DD) / 類型(holiday=放假, workday=補班, company=公司事件) / 說明。
  // company 及任何未知類型不放進這兩個陣列，不影響工作日判斷（照常上班）。
  calendar: { holidays: [], supplementWorkDays: [] },

  // 是否為工作日。判斷優先序：補班日 > 放假日 > 設定頁 workDays。
  // workDays 用 JS 原生 getDay() 編號（0=日,1=一,…,6=六；預設 [1,2,3,4,5] 週一~五）。
  isWorkday(date) {
    const iso = this.fmt(date, 'iso');
    if (!iso) return false;
    // 工作日曆兩層疊加（§第四部分之二.5）。DATA.calendars 未載入(舊環境)→ 退回只認週末。
    const cal = (typeof DATA !== 'undefined' && DATA.calendars) || null;
    const base = cal && cal.base;
    const override = cal && cal.override;   // 可能 null
    // a. 覆蓋層補班 → 一定上班（最高優先）
    if (override?.workOverrides && iso in override.workOverrides) return true;
    // b. 覆蓋層額外公休 → 不上班
    if (override?.extraHolidays && iso in override.extraHolidays) return false;
    // c. 基底層國定假日 → 不上班（base.holidays 是物件，用 in 判斷存在）
    if (base?.holidays && iso in base.holidays) return false;
    // d. 否則照 workDays（週末維持現狀；無 DATA 退回週一~五）
    const dt = date instanceof Date ? date : new Date(date);
    const workDays = (typeof DATA !== 'undefined' && DATA.settings && DATA.settings.workDays) || [1, 2, 3, 4, 5];
    return workDays.includes(dt.getDay());
  },

  // 區間工作日數（含頭含尾，逐日 isWorkday 計數）。
  // 邊界：同一天且為工作日 → 1；start > end → 回 0（無效區間視為 0）；日期無法解析 → 回 0。
  workdaysBetween(start, end) {
    const s = start instanceof Date ? new Date(start) : new Date(start);
    const e = end instanceof Date ? new Date(end) : new Date(end);
    if (isNaN(s) || isNaN(e)) return 0;
    s.setHours(0, 0, 0, 0);
    e.setHours(0, 0, 0, 0);
    if (s > e) return 0;
    let count = 0;
    for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
      if (this.isWorkday(d)) count++;
    }
    return count;
  },

  // 從 date 起算 n 個工作日後的日期（排程引擎用）。
  // 不把起算日本身算進 n：從次一日起往指定方向找，數到第 n 個工作日為止。
  // n > 0 往後、n < 0 往前、n = 0 回傳起算日當天（正規化為 00:00，不檢查是否工作日）。
  // 回傳新的 Date 物件（00:00）。
  addWorkdays(date, n) {
    const d = date instanceof Date ? new Date(date) : new Date(date);
    if (isNaN(d)) return d;
    d.setHours(0, 0, 0, 0);
    if (!n) return d;
    const step = n > 0 ? 1 : -1;
    let remaining = Math.abs(n);
    while (remaining > 0) {
      d.setDate(d.getDate() + step);
      if (this.isWorkday(d)) remaining--;
    }
    return d;
  },

  // 從開始日 + 完成日反推工期（工作天，含頭尾）= workdaysBetween 的語意化包裝。
  // §6.5c t.end 衍生化：使用者改「預計完成」時，save 端以此換算工期存（開始日當錨，不存獨立 t.end）。
  // start > end（負工期）→ workdaysBetween 回 0，由 save 端另行判定提示，此處不擋。
  deriveDurationFromEnd(start, end) {
    return this.workdaysBetween(start, end);
  },

  // 解析貼上的行事曆文字（Tab 分隔）→ {holidays, workOverrides, skipped, error?}
  // 彈性表頭對應：靠表頭名稱定位欄位（不要求欄位順序），需含表頭那一行。
  // 純函式：不碰 DOM/Storage，寫入由呼叫端負責（之二.9）。
  parseCalendarPaste(text) {
    const holidays = {};
    const workOverrides = {};
    let skipped = 0;
    const lines = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    // 同義詞表（小寫比對，精確或子字串命中）
    const SYN = {
      date: ['日期', 'date', '年月日'],
      type: ['類型', 'type', '假別', '性質', '類別'],
      name: ['節日名稱', '名稱', '假日名', 'name', '說明', '節日'],
      workday: ['工作日', '上班', '是否上班', 'workday'],
      weekday: ['星期', 'weekday'],
    };
    const matchCol = (h) => {
      const hl = (h || '').trim().toLowerCase();
      if (!hl) return null;
      for (const key in SYN) {
        for (const s of SYN[key]) {
          const sl = s.toLowerCase();
          if (sl === hl || hl.indexOf(sl) !== -1) return key;
        }
      }
      return null;
    };
    // 找表頭行：第一個能對到「日期」欄的行
    let headerIdx = -1;
    let colMap = {};
    for (let i = 0; i < lines.length; i++) {
      const cols = lines[i].split('\t');
      const m = {};
      for (let ci = 0; ci < cols.length; ci++) {
        const k = matchCol(cols[ci]);
        if (k && !(k in m)) m[k] = ci;
      }
      if ('date' in m) { headerIdx = i; colMap = m; break; }
    }
    if (headerIdx < 0 || !('date' in colMap)) {
      return { holidays: {}, workOverrides: {}, skipped: 0, error: '找不到「日期」欄表頭，請確認複製時包含表頭那一行' };
    }
    const di = colMap.date, ti = colMap.type, ni = colMap.name, wi = colMap.workday, wki = colMap.weekday;
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const cols = line.split('\t');
      if (cols.length <= di) { skipped++; continue; }
      const date = (cols[di] || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { skipped++; continue; }
      const type = (ti != null && ti < cols.length) ? (cols[ti] || '').trim() : '';
      const name = (ni != null && ni < cols.length) ? (cols[ni] || '').trim() : '';
      const workFlag = (wi != null && wi < cols.length) ? (cols[wi] || '').trim() : '';
      const wk = (wki != null && wki < cols.length) ? (cols[wki] || '').trim() : '';
      let isHol = false, isMk = false;
      if (ti != null && type) {
        if (type === '公休日') isHol = true;
        else if (type === '補班') isMk = true;
        else if (type === '週末' || type === '工作日') { /* 跳過 */ }
        else if (wi != null && workFlag === '0' && wk !== '六' && wk !== '日') isHol = true;
      } else if (wi != null) {
        if (workFlag === '0' && wk !== '六' && wk !== '日') isHol = true;
        else if (workFlag === '1' && (wk === '六' || wk === '日')) isMk = true;
      }
      if (isHol) holidays[date] = name || '公休';
      else if (isMk) workOverrides[date] = name || '補班';
    }
    return { holidays, workOverrides, skipped };
  },
};

// ─── 可販日：project.pdcaData（PDCA 報表已拔除 §18.14，僅保留供 KPI「WORKDAYS LEFT」讀 targetDate）───
// pdcaData：{ startDate, targetDate（可販日，KPI 用）, summary }；startDate/summary 已成殘欄（無 UI 編輯、無人讀）
function ensurePdcaData(project) {
  if (!project) return project;
  const p = project.pdcaData || (project.pdcaData = {});
  if (p.startDate === undefined) p.startDate = '';
  if (p.targetDate === undefined) p.targetDate = '';
  if (p.summary === undefined) p.summary = '';
  return project;
}

// M2-T：Sheet/Excel 類型欄原字串 → taskType 正典值（task=排甘特 / milestone=節點工期0 / group=母項不執行）
// 未知字串與空值一律退回 'task'（同 parsePredecessors 未知關係退 FS 的容錯先例）
function mapTaskType(rawType) {
  const s = (rawType == null ? '' : String(rawType)).trim();
  if (s === '里程碑') return 'milestone';
  if (s === '群組') return 'group';
  return 'task';
}
// M2-T：taskType 形狀保險（每次 load 跑、只補缺不蓋值）。
// 單一兜底點：手動建任務三路徑（quickAdd/saveNew/excelImport）刻意不各寫預設，避免多份各自演化。
function ensureTaskType(task) {
  if (!task) return task;
  if (typeof task.taskType !== 'string' || !task.taskType) task.taskType = 'task';
  return task;
}

// §7.1：四繳付欄位 schema 兜底（mustDeliver 既有，此處補三新欄）。照 ensureTaskType 模式：
// 每次 load 跑、只補缺不蓋值。布林用 typeof 判缺（false 是合法值，不可被預設蓋掉）。
function ensureDeliverFields(task) {
  if (!task) return task;
  if (typeof task.deliverableType !== 'string') task.deliverableType = '';     // 繳付件類型
  if (typeof task.requiredTask !== 'boolean')    task.requiredTask = true;     // 必要任務（預設全必要）
  if (typeof task.mustIssue !== 'boolean')       task.mustIssue = false;       // 繳付物必須發行
  return task;
}

// ─── 一次性資料 migration（_migrations 記錄已跑過的 key；存在性檢查 → 重複跑安全）───
function runMigrations() {
  DATA.settings._migrations = DATA.settings._migrations || {};
  const M = DATA.settings._migrations;
  let changed = false;

  // pdcaMerge_v1：合併重複專案（搬 task + merge 大項目設定）、刪除/新增特定專案（規則由 seed 提供）
  // ⚠ DEV 跳過：舊專案 seed migration 會從 seed.sample 種「範例專案F」等雜訊；DEV 資料一律走 dev-seed（Prod 照跑·且早已一次性完成）。
  if (!M.pdcaMerge_v1 && !isLocalDev) {
    const byName = nm => DATA.projects.find(p => p.name === nm);
    const moveTasks = (fromId, toId) => DATA.tasks.forEach(t => { if (t.project === fromId) t.project = toId; });
    // merge 大項目設定：keep 沒有的 group 才補、keep 有的不覆蓋（避免搬走的 task 標籤變孤兒）
    const mergePdcaGroups = (fromId, toId) => {
      const from = (DATA.pdcaGroups || {})[fromId];
      if (!from) return;
      DATA.pdcaGroups[toId] = DATA.pdcaGroups[toId] || {};
      Object.keys(from).forEach(g => {
        if (!(g in DATA.pdcaGroups[toId])) DATA.pdcaGroups[toId][g] = from[g];
      });
    };
    const removeProject = pid => {
      DATA.projects = DATA.projects.filter(p => p.id !== pid);
      if (DATA.pdcaGroups) delete DATA.pdcaGroups[pid];
    };

    // 專案資料修正：合併 / 刪除 / 補建，規則由 seed 提供（projMerges / projDeletes / projEnsure）
    SEED('projMerges', []).forEach(m => {
      const keep = byName(m.keep), drop = byName(m.drop);
      if (keep && drop) { moveTasks(drop.id, keep.id); mergePdcaGroups(drop.id, keep.id); removeProject(drop.id); }
    });
    SEED('projDeletes', []).forEach(d => {
      const p = byName(d.name);
      if (p) { DATA.tasks = DATA.tasks.filter(t => t.project !== p.id); removeProject(p.id); }
    });
    SEED('projEnsure', []).forEach(e => {
      if (!DATA.projects.some(p => p.name === e.name)) {
        const used = new Set(DATA.projects.map(p => p.color));
        const color = (e.colorPool || []).find(c => !used.has(c)) || (e.colorPool && e.colorPool[0]) || '#5DCAA5';
        const np = { id: U.id(), name: e.name, color, note: '', synced: false, createdAt: new Date().toISOString() };
        ensurePdcaData(np);
        DATA.projects.push(np);
      }
    });

    M.pdcaMerge_v1 = true;
    changed = true;
  }

  // pdcaInitialData_v1：補六專案 pdcaData/group seed + 依關鍵字自動歸類 task。
  // 只填空、不蓋已有值；group 已有 owner/recoveryMethod 則整組跳過；已歸類的 task 不重歸。
  // → 雲端覆蓋後二次執行沿用同套，不會洗掉使用者手動修改。
  if (!M.pdcaInitialData_v1 && !isLocalDev) {   // 同上·DEV 只吃 dev-seed，不跑舊 INIT/KEYWORDS seed
    const norm = s => (s || '').replace(/\s+/g, '');            // 正規化比對（保險：去空白）
    const findProj = nm => DATA.projects.find(p => norm(p.name) === norm(nm));
    const emptyGroupMeta = () => ({
      level: 'med', owner: '', note: '',
      workContent: '', actualStart: '', targetDate: '',
      delayDaysOverride: null, delayReason: '',
      recoveryMethod: '', recoveryDate: '', affectsLaunch: false,
    });

    // ── 六專案 INIT：pdcaData（時間軸/摘要）+ 要 seed 的 group meta ──
    const INIT = SEED('INIT', {});

    // ── 關鍵字歸類表：每專案陣列「由上到下＝優先序」，先對先設後 break；沒對到留 '' ──
    const KEYWORDS = SEED('KEYWORDS', {});

    Object.keys(INIT).forEach(name => {
      const proj = findProj(name);
      if (!proj) return;                                          // 專案不在（被刪/未建）→ 跳過
      const cfg = INIT[name];

      // 1. pdcaData：只填空、不蓋已有值
      ensurePdcaData(proj);
      if (!proj.pdcaData.startDate  && cfg.startDate)  proj.pdcaData.startDate  = cfg.startDate;
      if (!proj.pdcaData.targetDate && cfg.targetDate) proj.pdcaData.targetDate = cfg.targetDate;
      if (!proj.pdcaData.summary    && cfg.summary)    proj.pdcaData.summary    = cfg.summary;

      // 2. group meta：已存在且 owner 或 recoveryMethod 非空 → 整組跳過；新建用 seed，舊的只填空欄
      DATA.pdcaGroups[proj.id] = DATA.pdcaGroups[proj.id] || {};
      Object.keys(cfg.groups || {}).forEach(gName => {
        const existing = DATA.pdcaGroups[proj.id][gName];
        if (existing && (existing.owner || existing.recoveryMethod)) return;
        const seed = cfg.groups[gName];
        if (!existing) {
          DATA.pdcaGroups[proj.id][gName] = { ...emptyGroupMeta(), ...seed };
        } else {
          Object.keys(seed).forEach(k => { if (!existing[k]) existing[k] = seed[k]; });
        }
      });

      // 3. 自動歸類 task：只動尚未歸類（pdcaGroup=''）的；先對先設後 break；沒對到留 ''
      const table = KEYWORDS[name];
      if (table) {
        DATA.tasks.forEach(t => {
          if (t.project !== proj.id || t.pdcaGroup) return;       // 別的專案 / 已歸類 → 不動
          const nm = t.name || '';
          for (const [gName, kws] of table) {
            if (kws.some(kw => nm.includes(kw))) { t.pdcaGroup = gName; break; }
          }
        });
      }
    });

    M.pdcaInitialData_v1 = true;
    changed = true;
  }

  // taskTypeBackfill_v1：存量任務 category==='meeting'(里程碑) → taskType='milestone'
  // 只轉 WBS 匯入里程碑(wbs 非空)；手動真會議 wbs='' 落不動側，避免誤標 milestone
  // category='meeting' 有兩種來源：(A)手動表單建的真會議 task，wbs 寫死 ''；
  //   (B)WBS 匯入被 lossy 壓進 category 的里程碑，wbs 是 A 欄序號非空。
  //   兩邊 wbs 都程式寫死＝結構性區分訊號，可靠。
  //   排程跳會議讀的是獨立 store(DATA.meetings/recurringMeetings/specialMeetings)、不讀 task.category，
  //   故本 migration 不影響排程；加 t.wbs 是為語意正確(避免手動真會議被誤標 milestone 害甘特畫菱形)。
  // 注意：ensureTaskType(193) 在本 migration(194) 前跑，存量 taskType 已被補成 'task'，
  //       故用 category 判斷直接改寫，不能用「taskType 缺席」當條件
  // group 不處理：存量資料無「群組」痕跡可辨識，group 只從 M2-T1 後新同步/匯入產生
  if (!M.taskTypeBackfill_v1) {
    DATA.tasks.forEach(t => {
      if (t.wbs && t.category === 'meeting') t.taskType = 'milestone';
    });
    M.taskTypeBackfill_v1 = true;
    changed = true;
  }

  // pmCoordExplicitDedup_v1（§18.10c／規則16）：清「同 variant+stage 已有顯性 PM 任務、卻又有常駐協調列」的雙算髒資料。
  // 由來：早期 seedProjStageCoord 對每個階段都建常駐列（含已有顯性 PM 任務的階段）→ 同階段被常駐+顯性各算一份。
  // 規則：常駐協調只留給「該 variant+stage 沒有顯性 PM 任務」的階段；有顯性者的常駐列刪除（顯性任務已代表 PM 該階段工作）。
  if (!M.pmCoordExplicitDedup_v1) {
    DATA.projects.forEach(proj => {
      const explKeys = new Set();
      DATA.tasks.forEach(t => {
        if (t.project === proj.id && !t._deleted && !t.isPmCoord && t.stage && isPmTask(t, proj)) {
          explKeys.add((t.variant || '') + '\x00' + t.stage);
        }
      });
      if (explKeys.size) {
        DATA.tasks = DATA.tasks.filter(t => !(t.project === proj.id && t.isPmCoord && explKeys.has((t.variant || '') + '\x00' + t.stage)));
      }
    });
    M.pmCoordExplicitDedup_v1 = true;
    changed = true;
  }

  if (changed) Storage.save();
}

// ─── 判斷一個定期事件是否發生在指定日期 ───
// event: { category, frequency, day, startDate, endDate, enabled }
function eventOccursOnDate(event, dateIso) {
  if (event.enabled === false) return false;
  const d = new Date(dateIso); d.setHours(0,0,0,0);
  if (isNaN(d)) return false;

  // 範圍檢查
  if (event.startDate) {
    const start = new Date(event.startDate); start.setHours(0,0,0,0);
    if (d < start) return false;
  }
  if (event.endDate) {
    const end = new Date(event.endDate); end.setHours(0,0,0,0);
    if (d > end) return false;
  }

  const freq = event.frequency || 'weekly';

  if (freq === 'once') {
    return event.startDate ? dateIso === event.startDate : false;
  }

  if (freq === 'daily') {
    return true; // 每天
  }

  // ─── biweekly-allday / triweekly-allday: 隔週/隔兩週的「整週每天」 ───
  // 用途：例如定期打掃是「我那週的每一天早上」都要做
  // 規則：從 startDate 那週起算，每隔 2 週（或 3 週）的「週一到週五」都觸發
  if (freq === 'biweekly-allday' || freq === 'triweekly-allday') {
    const start = event.startDate ? new Date(event.startDate) : new Date('2026-01-01');
    start.setHours(0,0,0,0);
    // 對齊到 startDate 所在週的週一
    const startDow = start.getDay();
    const startMonday = new Date(start);
    startMonday.setDate(start.getDate() + (startDow === 0 ? -6 : 1 - startDow));
    startMonday.setHours(0,0,0,0);
    // 算 d 所在週的週一
    const dDow = d.getDay();
    const dMonday = new Date(d);
    dMonday.setDate(d.getDate() + (dDow === 0 ? -6 : 1 - dDow));
    dMonday.setHours(0,0,0,0);
    // 兩個週一相差幾週
    const diffWeeks = Math.round((dMonday - startMonday) / (7 * 86400000));
    if (diffWeeks < 0) return false;
    // 限制週一到週五
    if (dDow === 0 || dDow === 6) return false;
    if (freq === 'biweekly-allday') return diffWeeks % 2 === 0;
    if (freq === 'triweekly-allday') return diffWeeks % 3 === 0;
  }

  // weekly/biweekly/triweekly: 必須是指定週幾
  if (event.day === undefined || event.day === null) return false;
  if (d.getDay() !== event.day) return false;

  if (freq === 'weekly') return true;

  // monthly：每月第 N 個星期幾（依 startDate 推算 N；day 已在上方核對）。無錨點則每月該星期幾都算。
  if (freq === 'monthly') {
    const nthOf = (dt) => Math.floor((dt.getDate() - 1) / 7) + 1;
    if (!event.startDate) return true;
    const sd = new Date(event.startDate); sd.setHours(0, 0, 0, 0);
    return nthOf(d) === nthOf(sd);
  }

  // biweekly / triweekly: 從 startDate 起算第幾週（每幾週一次）
  const start = event.startDate ? new Date(event.startDate) : new Date('2026-01-01');
  start.setHours(0,0,0,0);
  const diffDays = Math.round((d - start) / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);

  if (freq === 'biweekly') return diffWeeks % 2 === 0;
  if (freq === 'triweekly') return diffWeeks % 3 === 0;

  return false;
}

// ─── UTILS ────────────────────────────────────────────
const U = {
  id() { return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
  esc(s) { return String(s ?? '').replace(/[<>&"]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])); },
  hash(s) { let h = 0; for (let i = 0; i < s.length; i++) { h = ((h << 5) - h) + s.charCodeAt(i); h |= 0; } return Math.abs(h); },
  // 共用剪貼簿複製（§27 抽共用·rule10）：成功 toast okMsg；失敗（無權限/舊瀏覽器）toast failMsg 讓使用者手動處理
  copy(text, okMsg, failMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(() => this.toast(okMsg || '✓ 已複製')).catch(() => this.toast(failMsg || okMsg || '複製失敗'));
    else this.toast(failMsg || okMsg || '複製失敗');
  },
  toast(msg, type = 'success', opts = {}) {
    const c = document.getElementById('toastContainer');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = msg;
    const dismiss = () => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); };
    if (opts.closable) {
      const x = document.createElement('button');
      x.className = 'toast-close'; x.setAttribute('aria-label', '關閉'); x.textContent = '×';
      x.addEventListener('click', dismiss);
      t.appendChild(x);
    }
    c.appendChild(t);
    const dur = opts.duration != null ? opts.duration : 3500;
    if (dur > 0) setTimeout(dismiss, dur);   // dur===0 → 不自動消失（需 closable 手動關）
  },
};

// ─── URGENCY / STATUS LABELS ───────────────────────────
const LABELS = {
  urgency:  { high: '緊急', medium: '普通', low: '不急' },
  status:   { pending: '未開始', wip: '進行中', done: '已完成', hold: '擱置中' },
  category: { deep: '深度', admin: '雜事', meeting: '會議', other: '其他', milestone: '◆ 里程碑' },  // milestone 鍵供 taskType 顯示用（M2-T3），非 category 值域
  categoryClass: { deep: 'tag-deep', admin: 'tag-admin', meeting: 'tag-meeting', other: 'tag-other', milestone: 'tag-milestone' },
};

// 狀態中文標籤：刻意獨立於 LABELS.status，供未來語系切換時狀態標籤可各自切換；綜觀清單 row 讀此（非 LABELS.status）
const STATUS_LABELS_ZH = { pending: '未開始', wip: '進行中', done: '已完成', hold: '擱置中' };
// 緊急程度中文標籤：同上獨立於 LABELS.urgency（緊急/普通/不急），綜觀清單用「高/中/低」短字；供語系切換各自切換
const URGENCY_LABELS_ZH = { high: '高', medium: '中', low: '低' };

// ─── TASK SCORING (priority sort) ──────────────────────
function scoreTask(t) {
  if (t.status === 'done')  return -9999;
  if (t.status === 'hold')  return -9000;
  let score = 0;
  score += { high: 300, medium: 100, low: 0 }[t.urgency] || 0;
  const sch = getEffectiveSchedule(t);
  if (sch.end) {
    const days = D.daysBetween(D.today(), new Date(sch.end));
    if (days < 0)      score += 500 + Math.abs(days) * 10;
    else if (days <= 1) score += 400;
    else if (days <= 3) score += 250;
    else if (days <= 7) score += 120;
    else if (days <= 14) score += 50;
  } else score -= 20;
  if (t.status === 'wip') score += 80;
  return score;
}

function sortTasks(arr) {
  return [...arr].sort((a, b) => {
    const ds = scoreTask(b) - scoreTask(a);   // 主鍵：維持現有 scoreTask 降序
    if (ds !== 0) return ds;
    // 平手 tiebreak（決定性）：plannedStart 早的先（空值排最後），再 id 字典序
    const pa = a.plannedStart || '', pb = b.plannedStart || '';
    if (pa !== pb) {
      if (!pa) return 1;            // a 無 plannedStart → 排後
      if (!pb) return -1;           // b 無 → a 在前
      return pa < pb ? -1 : 1;      // ISO 字串比較 = 時序，早的先
    }
    const ia = String(a.id || ''), ib = String(b.id || '');
    return ia < ib ? -1 : (ia > ib ? 1 : 0);   // 最終 id 字典序，保證唯一定序
  });
}

// ─── CLEAN OLD DONE TASKS ──────────────────────────────
function cleanOldDoneTasks() {
  const retentionDays = DATA.settings.doneRetentionDays || 30;
  if (retentionDays === 0) return;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - retentionDays);
  const before = DATA.tasks.length;
  DATA.tasks = DATA.tasks.filter(t => {
    if (t.status !== 'done') return true;
    if (t.measureType !== 'hours') return true; // 工期制（WBS/手動專案任務）永不自動清除，只清時段制雜事
    if (!t.completedAt) { t.completedAt = new Date().toISOString(); return true; }
    return new Date(t.completedAt) >= cutoff;
  });
  if (before !== DATA.tasks.length) Store.tasks.save();
}

// ─── REGEX MEETING PARSER ──────────────────────────────
// 放寬版（2026-06-28）：不要求同行有日期；只要有「起–迄時間範圍」就當一場（過濾時間軸單一刻度）。
// 時間吃 上午/下午/早上/晚上/中午 + H[:MM] + 點[MM分] → 正規化 24h。標題用本行剩字或上一行；
// 日期抓得到(MM/DD 或 星期)就填、抓不到留空，交確認清單讓 User 自己選星期（週檢視截圖先天對不回日期）。
function parseMeetingText(text) {
  if (!text) return [];
  // tesseract 對中文常在每字間插空格（「上 午 8 點」「1 2 3 會 議」）→ 去掉「中日字/數字/冒號/時間字」之間的空白，否則時間/標題對不上
  text = text.split('\n').map(l =>
    l.replace(/[ \t]+/g, ' ').replace(/([一-鿿\d:：點時午])\s(?=[一-鿿\d:：點時午])/g, '$1')
  ).join('\n');
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const dayMap = { '日':0, '天':0, '一':1, '二':2, '三':3, '四':4, '五':5, '六':6 };
  const today = D.today();
  const monday = D.monday(today);

  const toHM = (mer, body) => {
    if (!body) return null;
    let h, mi;
    const cm = String(body).match(/(\d{1,2})[:：](\d{1,2})/);   // H:MM
    if (cm) { h = parseInt(cm[1], 10); mi = parseInt(cm[2], 10); }
    else {
      const dm = String(body).match(/\d+/);
      if (!dm) return null;
      const dig = dm[0];
      if (dig.length >= 3) { h = parseInt(dig.slice(0, dig.length - 2), 10); mi = parseInt(dig.slice(-2), 10); }  // 830→8:30、1030→10:30（OCR 常把冒號吃掉）
      else { h = parseInt(dig, 10); mi = 0; }   // 8點 / 10
    }
    if (/下午|晚上|傍晚|午後/.test(mer || '') && h < 12) h += 12;
    if (/上午|早上|凌晨|清晨/.test(mer || '') && h === 12) h = 0;
    if (/中午/.test(mer || '') && h < 12) h = 12;
    if (h > 23 || mi > 59) return null;
    return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
  };

  const MER = '上午|下午|早上|晚上|傍晚|午後|凌晨|清晨|中午';
  const TIME = '(?:\\d{3,4}|\\d{1,2}(?:[:：]\\d{1,2})?\\s*(?:點|時)?(?:\\d{1,2}\\s*分)?)';   // 先吃 3–4 位連續數字(OCR 吃掉冒號的 830/1030)，再吃一般 H[:MM]/H點[MM分]
  const RANGE = new RegExp(`(${MER})?\\s*(${TIME})\\s*[\\-–—~～至到]+\\s*(${MER})?\\s*(${TIME})`);

  const out = [];
  let prevTitle = '';
  for (const line of lines) {
    const rm = line.match(RANGE);
    if (!rm) {
      const t = line.trim();
      if (t && t.length <= 40 && !/^(GMT|UTC)/i.test(t) && !/^(週|星期)?[日一二三四五六]\s*\d{0,2}$/.test(t)) prevTitle = t;
      continue;
    }
    const startMer = rm[1] || '';
    const start = toHM(startMer, rm[2]);
    const end = toHM(rm[3] || startMer, rm[4]);   // 迄沿用起的上午/下午
    if (!start) continue;
    let title = line.replace(RANGE, ' ')
      .replace(/[（(][^）)]*[）)]/g, ' ')
      .replace(/^\s*\d{1,2}[\/月]\d{1,2}[日]?/, '')
      .replace(/^\s*(週|星期)[日一二三四五六]/, '')
      .replace(/[，,。\-–—~：:]+/g, ' ')
      .trim();
    if (!title) title = prevTitle;
    let date = '';
    const md = line.match(/(\d{1,2})[\/月](\d{1,2})/);
    const wk = line.match(/(?:週|星期)([日一二三四五六])/);
    if (md) {
      const dt = new Date(today.getFullYear(), parseInt(md[1], 10) - 1, parseInt(md[2], 10));
      if (D.daysBetween(today, dt) < -180) dt.setFullYear(dt.getFullYear() + 1);
      date = D.fmt(dt, 'iso');
    } else if (wk) {
      const di = dayMap[wk[1]];
      date = D.fmt(D.addDays(monday, di === 0 ? 6 : di - 1), 'iso');
    }
    out.push({ date, startTime: start, endTime: end || '', title: title || '' });
    prevTitle = '';
  }
  return out;
}

// ─── DEDUPE MEETINGS ───────────────────────────────────
function dedupeMeetings(arr, sourceLabel) {
  const map = new Map();
  for (const m of arr) {
    const key = `${m.date}_${m.startTime}_${m.title}`;
    if (map.has(key)) {
      const existing = map.get(key);
      existing.sources = existing.sources || [];
      if (sourceLabel && !existing.sources.includes(sourceLabel)) {
        existing.sources.push(sourceLabel);
      }
    } else {
      map.set(key, { ...m, sources: sourceLabel ? [sourceLabel] : [] });
    }
  }
  return Array.from(map.values());
}

// ═══ 階段2 排程引擎 ═══════════════════════════════════════════════
// 排入行事曆分流：回傳勾選 scheduleToCalendar 的任務子集（純函式，不碰 DOM/Storage）
//   舊資料無此欄 → undefined !== true → 自然排除，不需 migration
//   第7項只到「回傳正確子集」，時程表 render 吃這個函式是第8項
function getCalendarTasks(tasks) {
  return tasks.filter(t => t.scheduleToCalendar === true);
}

// ── [CORE] 前置依賴 序號→id 翻譯工具（§8b.5 層次二，純函式，不碰 DOM/Storage）──
// 單一真實來源：WBS 匯入 / J 同步 / 手動表單三條路徑共用此翻譯，邏輯只此一份。
//
// buildWbsToIdMap(tasks)：建「wbs序號(String) → task.id」查找表。
//   - 只收有 wbs 的 task（空字串 / null / undefined 跳過）。
//   - 同序號重複：保留先者（map.has 才不覆蓋）。
//   - 純函式，回傳 Map。
function buildWbsToIdMap(tasks) {
  const map = new Map();
  for (const t of (tasks || [])) {
    if (!t) continue;
    if (t.wbs !== '' && t.wbs != null) {
      const k = String(t.wbs).trim();
      if (!map.has(k)) map.set(k, t.id);   // 保留先者
    }
  }
  return map;
}

// translatePredToId(predStr, wbsToIdMap)：把「序號字串 predecessor」翻成「id 字串 predecessor」。
//   - 沿用 parsePredecessors 同一套拆解（逗號/分號分隔、每段 ^(\d+)([A-Za-z]{2})?([+-]數字)?）。
//   - 只翻「序號部分」→ id；關係(FS/SS/FF/SF)與 lag(+N) 原樣保留。
//   - 查得到 → 'id_xxx#FS+2'（# 分隔 id 與 type，純前置 → 'id_xxx#'）；查不到 → 該段原樣保留（不丟棄，好 debug）。
//   - 純函式，回傳翻譯後字串。
function translatePredToId(predStr, wbsToIdMap) {
  if (predStr === null || predStr === undefined) return '';
  const s = String(predStr).trim();
  if (!s) return '';
  // 保留原分隔片段順序；逐段 match，序號翻 id、其餘原樣黏回。
  const parts = s.split(/[,，;；]/).map(p => p.trim()).filter(Boolean);
  const out = [];
  for (const part of parts) {
    const m = part.match(/^(\d+)\s*([A-Za-z]{2})?\s*([+-]\s*\d+)?$/);
    if (!m) { out.push(part); continue; }           // 無法解析 → 原樣保留
    const id = wbsToIdMap && wbsToIdMap.get(String(m[1]).trim());
    if (!id) { out.push(part); continue; }          // 查不到 → 原樣保留
    const type = m[2] ? m[2] : '';
    const lag = m[3] ? m[3].replace(/\s+/g, '') : '';
    out.push(id + '#' + type + lag);                 // id#關係lag（# 分隔，根除 id 結尾字母與 type 撞；type/lag 可空）
  }
  return out.join(',');
}

// 待辦列表前置：顯示「接在 #N 後」（N=_seqOf）。無→「—」；多筆→「接在 #3、#5 後」。
function prettyPredecessor(predStr) {
  const preds = parsePredecessors(predStr);
  if (!preds.length) return '—';
  return '接在 ' + preds.map(p => '#' + App._seqOf(p.dep)).join('、') + ' 後';
}

// 前置 title 全名白話（序號看不懂時 hover 補救）：無→''；單→「接在《X》後」；多→「接在 N 項後」。
function predTitleOf(predStr) {
  const preds = parsePredecessors(predStr);
  if (!preds.length) return '';
  if (preds.length === 1) {
    const dep = DATA.tasks.find(x => x.id === preds[0].dep);
    return dep ? '接在《' + dep.name + '》後' : '接在 1 項後';
  }
  return '接在 ' + preds.length + ' 項後';
}

// 解析 predecessor 前置任務字串 → [{dep, type, lag}]
// 支援兩種格式（同一字串可用逗號/分號分隔多個前置，可混用）：
//   1. 純編號：'5' 或 '5,6'        → {dep:'5', type:'FS', lag:0}
//   2. 含關係：'5FS+2' / '5SS-1'   → 完整解析 type(FS/SS/FF/SF) + lag(正負整數)
// 規則：
//   - 空字串 / null / undefined → []
//   - type 不分大小寫，統一轉大寫；非 FS/SS/FF/SF 的未知關係 → 退回 'FS'
//   - lag 可帶 +/-（容忍空白，如 '+ 2'），無 lag → 0；lag 解析失敗 → 0
//   - dep 一律回字串（task.wbs 可能是數字或字串，實際比對時再正規化）
//   - 無法解析出 dep（無數字開頭）的片段 → 跳過，不報錯
function parsePredecessors(str) {
  if (str === null || str === undefined) return [];
  const s = String(str).trim();
  if (!s) return [];
  const VALID = ['FS', 'SS', 'FF', 'SF'];
  const out = [];
  // 以半形/全形逗號或分號分隔多個前置
  const parts = s.split(/[,，;；]/).map(p => p.trim()).filter(Boolean);
  for (const part of parts) {
    // 兩格式相容（§8b.5 層次二）：以「有無 #」切分支。
    //   有 #（id 格式）：# 前＝dep（任意字元，原樣取，因 id 是 id_xxx/sync_xxx）；# 後＝type+lag。
    //   無 #（舊序號格式）：dep(純數字) + 緊貼 type + lag —— fixture 與未翻譯資料走這條。
    const hashIdx = part.indexOf('#');
    let dep, mTail;
    if (hashIdx >= 0) {
      dep = part.slice(0, hashIdx).trim();
      // # 後只剩可選 type(2 字母) + 可選 lag；type/lag 皆可空（純前置翻成 'id_xxx#'）
      mTail = part.slice(hashIdx + 1).trim().match(/^([A-Za-z]{2})?\s*([+-]\s*\d+)?$/);
      if (!dep || !mTail) continue;            // dep 空 / # 後格式不合 → 跳過
    } else {
      // 舊序號格式：dep(數字) + 可選 type(2 字母) + 可選 lag(+/- 數字，容忍空白)
      const m = part.match(/^(\d+)\s*([A-Za-z]{2})?\s*([+-]\s*\d+)?$/);
      if (!m) continue;                        // 無法解析（非數字開頭）→ 跳過
      dep = m[1];
      mTail = [m[0], m[2], m[3]];              // 對齊 # 分支：[全, type, lag]，下方共用解析
    }
    let type = (mTail[1] || 'FS').toUpperCase();
    if (!VALID.includes(type)) type = 'FS';    // 未知關係 → FS
    let lag = 0;
    if (mTail[2]) {
      const n = parseInt(mTail[2].replace(/\s+/g, ''), 10);
      lag = isNaN(n) ? 0 : n;
    }
    out.push({ dep, type, lag });
  }
  return out;
}

// 偵測 task 是否被前置任務擋住（甲：衝突偵測地基；只偵測 + 回報，不改任何日期）
// @param task        要檢查的任務
// @param allTasksMap 以 wbs 為 key 的查找表（Map 或 plain object 皆可；value = task）
// @return {blocked:boolean, reasons:[{dep, type, conflict}]}
//   conflict（固定字串，方便顯示與測試比對）：
//     '前置不存在' | '前置未完成' | '日期衝突'
//   同一前置可能同時「未完成」+「日期衝突」→ 產生多筆 reason。
// 日期衝突依關係類型判定（lag 以工作日計，套在「前置參考日」上後比較）：
//   FS 本任務 start 不得早於 前置 end  的次一工作日 (+1+lag)  ← 只有 FS 跳一天
//   SS 本任務 start 不得早於 前置 start(+lag)
//   FF 本任務 end   不得早於 前置 end  (+lag)
//   SF 本任務 end   不得早於 前置 start(+lag)
//   參考日任一為空 → 跳過日期檢查（留待排程引擎推算），不視為衝突。
// ── [CORE] 純計算層：查找表由參數注入、回傳資料，禁止呼叫 render/Storage（見 docs/core-layer.md）──
function isTaskBlocked(task, allTasksMap) {
  const result = { blocked: false, reasons: [] };
  if (!task) return result;
  const preds = parsePredecessors(task.predecessor);
  if (preds.length === 0) return result;

  // 同時支援 Map 與 plain object 當查找表
  const lookup = (key) => {
    if (!allTasksMap) return undefined;
    const k = String(key);
    if (typeof allTasksMap.get === 'function') return allTasksMap.get(k) || allTasksMap.get(key);
    return allTasksMap[k];
  };

  for (const p of preds) {
    const dep = lookup(p.dep);
    // 1. 前置不存在
    if (!dep) {
      result.reasons.push({ dep: p.dep, type: p.type, conflict: '前置不存在' });
      continue;
    }
    // 2. 前置未完成
    if (dep.status !== 'done') {
      result.reasons.push({ dep: p.dep, type: p.type, conflict: '前置未完成' });
    }
    // 3. 日期衝突（依關係類型；參考日任一為空則跳過）
    const _taskEff = getEffectiveSchedule(task);
    const _depEff  = getEffectiveSchedule(dep);
    const taskRefStr = (p.type === 'FF' || p.type === 'SF') ? _taskEff.end : _taskEff.start;
    const usesPredEnd = !(p.type === 'SS' || p.type === 'SF');  // FS/FF 讀 dep 完成日；SS/SF 讀 dep 開始日
    const predRefStr = usesPredEnd ? _depEff.end : _depEff.start;
    // 衍生兜底（塊一）已讓 getEffectiveSchedule.end 在 actual/scheduled/planned 全空時現算 start+工期，
    //   故原窄修補丁（dep.end 空補算）不再需要，移除。
    if (taskRefStr && predRefStr) {
      // FS：起點(SOD) ≥ 前置終點(EOD)，offset=Math.max(1,lag)（純FS=1、FS+N=N，下限1），與 computeSchedule 同尺；
      // SS/FF/SF 端點同層級(SOD≥SOD / EOD≥EOD / EOD≥SOD)當日即成立，用純 lag、不墊高。
      const fsOffset = (p.type === 'FS') ? Math.max(1, p.lag) : p.lag;
      const predShifted = D.addWorkdays(new Date(predRefStr), fsOffset);
      const taskRef = new Date(taskRefStr);
      // predShifted 晚於 taskRef（正天數）→ 本任務排太早 → 違反
      if (D.daysBetween(taskRef, predShifted) > 0) {
        result.reasons.push({ dep: p.dep, type: p.type, conflict: '日期衝突' });
      }
    }
  }
  result.blocked = result.reasons.length > 0;
  return result;
}

function isTaskDelayed(task, today) {
  if (!task || task.status === 'done' || task.status === 'hold') return false;
  const end = getEffectiveSchedule(task).end;
  return !!end && new Date(end) < new Date(today);
}

// §18.10c／規則15：完工單一判定——實際完成日已填 OR 狀態=done（打勾完成/匯入「完成」/舊資料 status=done 無 actualEnd 皆算完工）。
// ⚠ 五支負荷函式（_pmWindowLoad/_deptWindowLoad/_personWindowLoad/overloadAlerts/dailyHeat）一律走此判定，杜絕「完工排除」口徑分岔（原 PM 帶只認 actualEnd→status=done 無 actualEnd 的任務被多算進 PM 負荷、與其他卡對不上）。TDZ 安全：全域函式宣告、在 const App 之前。
function isTaskDone(t) {
  return !!t && (!!t.actualEnd || t.status === 'done');
}

// §18.10c：統一「這是 PM 的工作」判定——常駐協調列 isPmCoord／role=PM／部門名=PM 三者任一。
// 單一真實來源（規則15）：部門負荷卡「排除」PM、內頁 PM 負荷卡與總覽 PM 跨案負荷「納入」PM，三處全走此判定，杜絕口徑分岔（顯性 PM 任務只帶 dept=PM、無 role/isPmCoord 旗標時被三處漏算 → PM 負荷歸零）。
function isPmTask(t, project) {
  if (!t) return false;
  if (t.isPmCoord || t.role === 'PM') return true;
  const depts = (project && project.depts) || [];
  const d = depts.find(x => x.id === t.dept);
  return (d ? d.name : t.dept) === 'PM';
}

// NPI 各階段標準 PM 負荷%（§19.4／§18.10c／§19.10 F，Paul 2026-07-03 定）：規律＝試驗/驗證階段(性試/量試)50、其餘25。
// 用途：任務投入% 空值時，PM 任務（role/dept=PM）預設帶「該階段標準%」；非 PM 任務預設 100（開單獨佔）。
// ⚠ TDZ（踩坑）：此處在 const App(1644) 之前，禁掛 App.xxx——用全域函式宣告（hoist 安全，同 isPmTask/isTaskDelayed pattern）。
const STAGE_STD_EFFORT = { '規劃': 25, '設計': 25, '手工機': 25, '性試': 50, '商檢': 25, '量試': 50, '量產': 25 };
// 任務投入% 空值時的預設：PM 任務帶階段標準（無標準則 100）、非 PM 帶 100。isPm 由呼叫端判定（Excel 用 dept 名、範本用 role）。
function defaultEffort(stage, isPm) {
  if (!isPm) return 100;
  const std = STAGE_STD_EFFORT[(stage || '').trim()];
  return std != null ? std : 100;
}

// §18.10d 日均強度（負荷單一抽象）：一件任務每個工作天平均吃掉某人一天的幾成（分數，非 %）。
// 淨工作天模型＝Work/Duration/Units（MS Project）：填了 netWorkDays（真正動工幾天）就用 netWorkDays÷跨度工作天，
// 否則退回 effortRatio/100（ECN 範本六檔＝明確%，直接用）。netWorkDays>span 時 >1＝過度承諾，不 cap（紅色示警有意義）。
// 三階優先：① netWorkDays（實際）→ ② effortRatio（明確%·ECN）→ ③ 未知 legacy（NPI 無投入%欄/舊開發案）＝保守佔用權重
//   （settings.legacyLoadPct，預設 50%），避免「跨度長＝綁滿」假爆。Phase 2a 給 NPI 投入%欄後，NPI 升到第2階自動離開此 fallback。
// ⚠ TDZ（踩坑）：在 const App 之前，用全域函式宣告（hoist 安全，同 isTaskDelayed/defaultEffort）。
function taskIntensity(t) {
  if (!t) return 1;
  const e = getEffectiveSchedule(t);
  const span = (e && e.start && e.end) ? D.workdaysBetween(e.start, e.end) : 0;
  if (t.netWorkDays > 0 && span > 0) return t.netWorkDays / span;
  if (t.effortRatio != null) return t.effortRatio / 100;
  const lw = (DATA.settings && DATA.settings.legacyLoadPct > 0) ? DATA.settings.legacyLoadPct : 50;
  return lw / 100;
}

// ─── §19.11 範本讀取單一來源（全域函式非 App.xxx——避 TDZ 坑；templates/ 檔比 app.js 先載）───
// Override 模型（Paul 定 a）：DATA.templates 內同 templateId＝自訂覆蓋層（優先）；否則內建檔案。
// kind 判別：自訂帶 kind；內建以 sizeMeta 特徵推（有＝ecn、無＝npi）。
function tplKind(t) { return t ? (t.kind || (t.sizeMeta ? 'ecn' : 'npi')) : null; }
function tplBuiltins() {
  const arr = [];
  if (typeof PRODUCT_DEV_TEMPLATE !== 'undefined') arr.push(PRODUCT_DEV_TEMPLATE);
  if (typeof ECN_TEMPLATE !== 'undefined') arr.push(ECN_TEMPLATE);
  return arr;
}
function tplResolve(id) {
  const ov = (DATA.templates || []).find(t => t && t.templateId === id);
  if (ov) return ov;
  return tplBuiltins().find(t => t.templateId === id) || null;
}
function tplNpi() { return tplResolve('product-dev-v1'); }
function tplEcn() { return tplResolve('ecn-v1'); }
// 建案下拉合併清單：內建（被 override 取代顯示）＋複製新增的自訂範本；kind 過濾（'npi'/'ecn'）
function tplAll(kind) {
  const bIds = tplBuiltins().map(t => t.templateId);
  const merged = bIds.map(id => tplResolve(id))
    .concat((DATA.templates || []).filter(t => t && bIds.indexOf(t.templateId) < 0));
  return kind ? merged.filter(t => tplKind(t) === kind) : merged;
}

// 本週已排程時段任務工時（schedule.items duration 分→H 加總）：Portfolio 雜事佔比與工作台本週工時的單一來源。
function weeklyScheduledHours(wk) {
  return (DATA.schedule.items || []).filter(it => it.week === wk).reduce((s, it) => s + (it.duration / 60), 0);
}
// 週容量：每日工時 × 每週工作日數（單一口徑，§18.10）：Portfolio.weekCapacity／雜事佔比 availableHours／工作台本週可用工時共用。
function weekCapacityHours() {
  return (DATA.settings.dailyHours || 6) * ((DATA.settings.workDays || []).length || 0);
}

// 步驟4 第一段：依賴圖 + 拓撲排序 + 循環偵測（不算日期，computeSchedule 第二段會用）
// 節點 key = task.id（前置 id 化後，§8b.5 層次二）；邊 = parsePredecessors(task.predecessor) 的每個 dep(id) → 本任務。
// @param tasks 任務陣列
// @return {
//   order:    [id,...]       拓撲順序（前置在前、依賴在後；不含 circular 節點）
//   circular: [id,...]       落在環上的節點（標 error:'circular'，排程時跳過）
//   nodes:    Map<id,task>   節點查找表
//   edges:    Map<id,[{dep,type,lag}...]>  每個節點「已存在於圖中」的前置邊
// }
// 三色 DFS：white(未訪) / gray(訪問中，在堆疊上) / black(完成)。
//   訪問中又遇到 gray 節點 → 有環；直接環 A→B→A 與間接環 A→B→C→A 都會在重遇 gray 時抓到。
//   只把「環上節點」(gray 重遇點 → 堆疊頂這一段) 標 circular，不誤標單純「依賴環的上游」。
//   用迭代式 DFS（顯式堆疊）避免大圖遞迴爆堆疊。
function topoSortTasks(tasks) {
  const list = (tasks || []).filter(t => t && t.measureType !== 'hours');
  const nodes = new Map();
  for (const t of list) nodes.set(t.id, t);

  // 邊：本任務 → 它的前置；只保留 dep 存在於 nodes 的邊。
  // 不存在的前置不影響拓撲（由 isTaskBlocked 另報「前置不存在」）。
  const edges = new Map();
  for (const t of list) {
    const preds = parsePredecessors(t.predecessor).filter(p => nodes.has(p.dep));
    edges.set(t.id, preds);
  }

  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map();
  for (const k of nodes.keys()) color.set(k, WHITE);
  const order = [];
  const circular = new Set();

  function visit(startKey) {
    const stack = [{ key: startKey, i: 0 }];   // i = 下一個要處理的前置 index
    color.set(startKey, GRAY);
    while (stack.length) {
      const top = stack[stack.length - 1];
      const preds = edges.get(top.key) || [];
      if (top.i < preds.length) {
        const depKey = String(preds[top.i].dep);
        top.i++;
        const c = color.get(depKey);
        if (c === WHITE) {
          color.set(depKey, GRAY);
          stack.push({ key: depKey, i: 0 });
        } else if (c === GRAY) {
          // 環：標記 depKey..堆疊頂 這一段（正好是環上節點）
          let onCycle = false;
          for (const f of stack) {
            if (f.key === depKey) onCycle = true;
            if (onCycle) circular.add(f.key);
          }
        }
        // BLACK：已完成，略過
      } else {
        color.set(top.key, BLACK);
        if (!circular.has(top.key)) order.push(top.key);   // 環上節點不進 order
        stack.pop();
      }
    }
  }

  for (const k of nodes.keys()) {
    if (color.get(k) === WHITE) visit(k);
  }

  return { order, circular: Array.from(circular), nodes, edges };
}

// ── [CORE] 純計算層：只讀 DATA、回傳資料，禁止呼叫 render/Storage（見 docs/core-layer.md）──
function getEffectiveSchedule(task) {
  if (!task) return null;
  // 顯示優先序：actual(已開工) > scheduled(排程算) > planned(初始預計) > start(手填)
  // ⚠ 用 || 不用 ??：空字串也要 fallback 到下層
  const dispStart = (task.actualStart || task.scheduledStart || task.plannedStart || task.start || '');
  const _durNum = parseFloat(task.durationDays);
  // §6.5 負工期：dur≤0 也算 end（addWorkdays 支援負位移，dur=0→前一工作日、dur<0 更早）；milestone dur=1→addWorkdays(start,0)=start。
  const _derivedEnd = (dispStart && !isNaN(_durNum))
    ? D.fmt(D.addWorkdays(dispStart, _durNum - 1), 'iso')
    : '';
  const dispEnd   = (task.actualEnd   || task.scheduledEnd   || task.plannedEnd   || _derivedEnd || '');
  return {
    start: dispStart,
    end: dispEnd,
    plannedStart: task.plannedStart,
    plannedEnd: task.plannedEnd,
    scheduledStart: task.scheduledStart || '',
    scheduledEnd: task.scheduledEnd || '',
    startSource: (task.actualStart ? 'actual' : (task.scheduledStart ? 'scheduled' : (task.plannedStart ? 'planned' : (task.start ? 'manual' : 'none')))),
  };
}


function mapStatus(status, progress) {
  if (!status) return 'pending';
  const s = String(status);
  // 認中文標籤（人工/匯出 WBS）＋英文內碼（自家匯出 round-trip，§13.x Excel 狀態 round-trip 修正）
  if (s === 'done' || s.includes('完成')) return 'done';
  if (s === 'wip' || s.includes('進行') || (parseFloat(progress || 0) > 0 && parseFloat(progress) < 100)) return 'wip';
  if (s === 'hold' || s.includes('擱置') || s.includes('暫停')) return 'hold';
  return 'pending';
}

// ═══════════════════════════════════════════════════════
//  APP CONTROLLER
// ═══════════════════════════════════════════════════════
// ═══ Auth：權限層（§8f.8b 隔離紀律——只判斷、不碰核心資料/排程；未來剪下成獨立檔）═══
const Auth = {
  // 開發測試用 role 切換器：DEV_MODE = isLocalDev → 本地（file:///localhost）才顯示切換器測四層；線上 https 必 false（面板不顯示）。
  DEV_MODE: isLocalDev,
  DEV_FIRST_KEY: 'pmcore-setup-2026',   // ⑤ 本地首登密鑰假值（塊三接後端後移除，改後端驗證）

  // 切換測試身份（superadmin/admin/editor/viewonly/none），寫 localStorage + 設 _role + body class + 重繪
  setDevRole(role) {
    localStorage.setItem('auth_dev_role', role);
    DATA.settings._role = (role === 'admin' || role === 'superadmin' || role === 'editor') ? role : undefined;
    if (role === 'viewonly') {
      document.body.classList.add('viewonly');
    } else if (role === 'none') {
      Auth.enterBlockout();
    } else {
      document.body.classList.remove('viewonly');
    }
    // 切到非 none 身份時收掉殘留擋頁（none→其他身份切回去不殘留）
    const bo = document.getElementById('authBlockout');
    if (bo && role !== 'none') bo.classList.add('hidden');
    Store.settings.save();
    App.refreshUserBadge();
    App.refreshAll();
    U.toast('🔧 [DEV] 切換身份：' + role, 'info');
    Auth.renderDevPanel(); // 重畫面板讓「目前：」即時更新切後身份
  },

  // 渲染浮動切換面板（DEV_MODE 才顯示，角落固定）
  renderDevPanel() {
    if (!this.DEV_MODE) return;
    let panel = document.getElementById('authDevPanel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'authDevPanel';
      document.body.appendChild(panel);
    }
    const cur = localStorage.getItem('auth_dev_role') || '(未設)';
    const open = this._devOpen === true;   // 預設收起，避免擋到右下 toast；點膠囊才展開
    panel.classList.toggle('collapsed', !open);
    if (!open) {
      panel.innerHTML = '<button class="adp-toggle" onclick="Auth.toggleDevPanel()" title="DEV 身份切換">🔧 ' + cur + ' ▸</button>';
      return;
    }
    panel.innerHTML =
      '<div class="adp-title" onclick="Auth.toggleDevPanel()" style="cursor:pointer;">🔧 DEV 身份 ▾</div>' +
      '<div class="adp-cur">目前：' + cur + '</div>' +
      ['superadmin', 'admin', 'editor', 'viewonly', 'none'].map(r =>
        '<button class="adp-btn" onclick="Auth.setDevRole(\'' + r + '\')">' + r + '</button>'
      ).join('');
  },

  toggleDevPanel() {
    this._devOpen = !this._devOpen;
    this.renderDevPanel();
  },

  // none / Can't view：全屏擋頁，只 render 自己、不碰 task/project 資料（§8f.5 / §8f.8b 隔離紀律）
  enterBlockout() {
    document.body.classList.remove('viewonly'); // 擋頁不是唯讀，清掉 viewonly class
    // 安全(§8f.6 硬化)：清掉任何已渲染的敏感內容(sidebar 專案＋各頁)，防 DOM 殘留被偷看。DATA 留記憶體但不入 DOM。
    const pl = document.getElementById('projectList'); if (pl) pl.innerHTML = '';
    document.querySelectorAll('#content .page').forEach(p => { p.innerHTML = ''; });
    const ov = document.getElementById('loginOverlay');
    if (ov) ov.classList.add('hidden'); // 登入框也藏掉，只剩擋頁
    let el = document.getElementById('authBlockout');
    if (!el) {
      el = document.createElement('div');
      el.id = 'authBlockout';
      el.innerHTML = '<div>您沒有檢視權限，請聯絡管理員</div>';
      document.body.appendChild(el);
    }
    el.classList.remove('hidden');
  },

  // §8f.3b：SuperAdmin 進他人副本提醒。後端未接，目前只留介面（DEV 面板手動觸發測）。
  showForeignWarning() {
    U.toast('⚠️ 你正以 SuperAdmin 身份進入他人副本，請小心避免誤改資料', 'warning');
  },

  // ④ 白名單：editor/viewonly 兩名單，localStorage 暫存（auth_* 裸 key，塊三接後端換來源）
  _getList(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch (e) { return []; }
  },
  checkWhitelist(email) {
    // 純判斷：回 editor / viewonly / none（後端接上後換 fetch）
    const e = (email || '').trim().toLowerCase();
    if (!e) return 'none';
    if (this._getList('auth_editor_list').includes(e)) return 'editor';
    if (this._getList('auth_viewonly_list').includes(e)) return 'viewonly';
    return 'none';
  },

  // ④ 名單管理改打後端（getlists/setlist）。in-memory 快取 + id_token（不寫 localStorage）。
  _idToken: '',
  _lists: { editor: [], viewonly: [], admin: [] },

  // POST 後端（BACKEND_URL 同一部署的 doPost）。text/plain 免 CORS preflight；回 parsed JSON，網路失敗 throw。
  async _postBackend(payload) {
    const url = CFG('BACKEND_URL', '');
    if (!url) throw new Error('no-backend');
    const r = await fetch(url, {
      method: 'POST', redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    return await r.json();
  },

  // 後端錯誤 → 對應 toast；token 相關 → 提示重新登入。回 true=有錯（呼叫端 return）。
  _backendErr(j) {
    if (!j || j.ok !== true) {
      const e = (j && j.error) || '';
      if (e === 'Invalid token' || e === 'Missing id_token' || e === 'Token verify failed') {
        U.toast('登入已過期，請重新登入', 'error');
      } else if (e === 'Forbidden' || e === 'aud mismatch' || e === 'email not verified') {
        U.toast('沒有管理權限', 'error');
      } else {
        U.toast('名單操作失敗：' + (e || '未知錯誤'), 'error');
      }
      return true;
    }
    return false;
  },

  // ④ 從後端拉兩份名單 → 快取 + 畫。失敗：toast、不洗掉現有顯示。
  async renderLists() {
    if (!document.getElementById('wl-editor-list')) return;   // 不在設定頁 → 防呆
    if (!this._idToken) return;   // 無憑證(DEV/未登入)：不打後端、不跳「登入已過期」噪音；名單需登入後才載
    let j;
    try {
      j = await this._postBackend({ action: 'getlists', id_token: this._idToken });
    } catch (err) {
      U.toast('讀取名單失敗（連不到後端）', 'error');
      return;   // 不洗掉現有顯示
    }
    if (this._backendErr(j)) return;
    this._lists = { editor: j.editor || [], viewonly: j.viewonly || [], admin: j.admin || [] };
    this._drawLists();
  },

  // 純畫（從 _lists 快取，不 fetch）
  _drawLists() {
    const draw = (type, elId) => {
      const box = document.getElementById(elId);
      if (!box) return;
      const list = this._lists[type] || [];
      if (!list.length) { box.innerHTML = '<div class="wl-empty">尚無</div>'; return; }
      box.innerHTML = list.map(e =>
        '<div class="wl-item"><span>' + U.esc(e) + '</span>' +
        '<button class="wl-del" onclick="Auth.removeFromList(\'' + type + '\',\'' + U.esc(e) + '\')">✕</button></div>'
      ).join('');
    };
    draw('editor', 'wl-editor-list');
    draw('viewonly', 'wl-viewonly-list');
    draw('admin', 'wl-admin-list');
  },

  // ④ 加入名單：前端驗格式/去重/跨名單互斥 → 算新整份 → POST setlist → 成功才更新
  async addToList(listType, inputId) {
    const input = document.getElementById(inputId);
    const email = (input ? input.value : '').trim().toLowerCase();
    if (!email) { U.toast('請輸入 email', 'warning'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { U.toast('email 格式不對', 'error'); return; }
    if ((this._lists[listType] || []).includes(email)) { U.toast('已在名單', 'warning'); return; }
    const others = ['editor', 'viewonly', 'admin'].filter(t => t !== listType);
    if (others.some(t => (this._lists[t] || []).includes(email))) { U.toast('已在其他名單，請先移除', 'warning'); return; }

    const newList = (this._lists[listType] || []).concat(email);
    let j;
    try {
      j = await this._postBackend({ action: 'setlist', id_token: this._idToken, listType: listType, emails: newList });
    } catch (err) { U.toast('寫入失敗（連不到後端）', 'error'); return; }
    if (this._backendErr(j)) return;
    this._lists[listType] = newList;
    if (input) input.value = '';
    this._drawLists();
    U.toast('✓ 已加入名單');
  },

  // ④ 移除名單：算新整份 → POST setlist → 成功才更新
  async removeFromList(listType, email) {
    const newList = (this._lists[listType] || []).filter(e => e !== email);
    let j;
    try {
      j = await this._postBackend({ action: 'setlist', id_token: this._idToken, listType: listType, emails: newList });
    } catch (err) { U.toast('移除失敗（連不到後端）', 'error'); return; }
    if (this._backendErr(j)) return;
    this._lists[listType] = newList;
    this._drawLists();
  },

  // ⑤ 本地首登綁定：記此 email 為本機 admin（一次性，塊三換後端 Script Properties）
  bindAdmin(email) {
    localStorage.setItem('auth_admin_bound', (email || '').trim().toLowerCase());
  },

  // ⑤ 本地 role 判斷（無後端時的 fallback，對齊 §8f.3 順序）：
  //   1. 已綁定本機 admin → admin
  //   2. 首登密鑰對 + 本機尚無 admin → 綁定 + admin（一次性）
  //   3. 否則查名單 → editor/viewonly/none
  tryLocalRole(email, setupKey) {
    const e = (email || '').trim().toLowerCase();
    const bound = (localStorage.getItem('auth_admin_bound') || '').trim().toLowerCase();
    if (bound && bound === e) return 'admin';
    if (!bound && setupKey && setupKey === this.DEV_FIRST_KEY) {
      this.bindAdmin(e);
      return 'admin';
    }
    return this.checkWhitelist(e);
  },
};

const App = {
  currentPage: 'home', // §25 預設落地頁＝Home 首頁（原 workspace）
  currentProjectId: null,
  currentView: 'overview', // 全專案總覽 tab:overview|gantt|month(全專案範圍,§18.4)
  projectView: 'dashboard', // B-2 專案頁視圖:dashboard|gantt|month(單專案範圍,獨立於 currentView)

  init() {
    Storage.load();
    cleanOldDoneTasks();
    this.cleanExpiredDeletedTasks();
    this.purgeExpiredTrash();   // §23 專案回收桶逾期 30 天自動清

    // First time? Set seed data
    // 安全(§8f.6 Level 2)：僅 localDev 或無雲端時 seed。Prod 有雲端時，空專案＝「尚未下載」，不 seed——
    //   否則登出清快取後 reload 會生種子專案，可能被 3 秒 auto-upload 推上雲端覆蓋真資料；交由登入後雲端下載填回。
    if (DATA.projects.length === 0 && !isLocalDev && !DATA.settings.cloudSyncUrl) {   // DEV 不種「其他事項」——DEV 資料一律走 dev-seed（Prod 無雲端仍種起始專案）
      this.seedDefaultProjects();
    }
    // §DEV：豐富測試資料——僅本地（Prod https 不跑）·用旗標避免每次疊加（與 SEED migration 解耦·清 localStorage 即重種）
    if (isLocalDev && typeof App._devSeedInject === 'function' && DATA.projects.length === 0) {
      App._devSeedInject();   // DEV 純沙盒：DATA 每次載入皆空→每次重灌 seed（丟掉 pm_dev_seeded 持久旗標·那會卡住重種）
    }

    this.refreshUserBadge();
    this.updateWeekInfo();
    // 安全(§8f.6 硬化)：驗身分前【不渲染】敏感資料(sidebar 專案清單＋頁面內容)，避免 Prod 資料畫進登入遮罩底下的 DOM 被偷看。
    //   各 auth 成功路徑自行 refreshAll：localDev(checkLoginState)／admin·editor(handleGoogleCredential)／viewonly(enterViewOnly)；none→enterBlockout 不渲染。

    // Login check
    this.checkLoginState();
    Auth.renderDevPanel();   // 🔧 DEV 身份面板（DEV_MODE 才顯示）

    // ☁ 雲端同步：init 不在此自動拉（階段3）——改由 handleGoogleCredential 登入成功後拉（因果正確：有憑證才拉）。
  },

  seedDefaultProjects() {
    const otherProj = {
      id: U.id(), name: '其他事項', color: '#5C7A8B',
      note: '預設專案，用於放置零散任務',
      synced: false,
      createdAt: new Date().toISOString(),
    };
    ensurePdcaData(otherProj);
    DATA.projects.push(otherProj);
    Store.projects.save();
  },

  refreshUserBadge() {
    const name = DATA.settings.userName || '使用者';
    document.getElementById('userName').textContent = name;
    const avatar = document.getElementById('userAvatar');
    const picture = DATA.settings._loggedInPicture;
    if (picture) {
      avatar.textContent = '';
      avatar.style.backgroundImage = `url('${picture}')`;
      avatar.style.backgroundSize = 'cover';
      avatar.style.backgroundPosition = 'center';
    } else {
      avatar.style.backgroundImage = '';
      avatar.textContent = name.charAt(0).toUpperCase();
    }
    // userMode 統一依狀態顯示（單一真實來源）：viewonly > superadmin > admin > editor
    const um = document.getElementById('userMode');
    if (um) {
      if (document.body.classList.contains('viewonly')) um.textContent = 'VIEW ONLY';
      else if (DATA.settings._role === 'superadmin') um.textContent = 'SUPER ADMIN';
      else if (DATA.settings._role === 'admin') um.textContent = 'ADMIN';
      else um.textContent = 'EDITOR';
    }
  },

  updateWeekInfo() {
    const wk = D.weekNum();
    const r = D.weekRange();
    document.getElementById('weekInfo').textContent =
      `本週 W${wk} · ${D.fmt(r.start, 'md')} – ${D.fmt(r.end, 'md')}`;
  },

  // ─── LOGIN ───
  checkLoginState() {
    // 本地開發（file:// 或 localhost）：OAuth 在 file:// 無法完成 → 跳過 Google，自動 admin 直接可編輯。
    //   ★ 在 initGoogleSignIn 之前 return，本地不碰 Google（避免 file:// 上初始化卡住）。
    //   ★ 線上 github.io 為 https，isLocalDev=false → 絕不進此分支，照常走後端四層 role。
    if (isLocalDev) {
      DATA.settings._role = 'admin';
      document.body.classList.remove('viewonly');
      localStorage.setItem('auth_dev_role', 'admin');   // 乙案 session-only：清掉殘留 viewonly，面板顯示=實際 admin，reload 自動復原
      const ov = document.getElementById('loginOverlay'); if (ov) ov.classList.add('hidden');
      const bo = document.getElementById('authBlockout'); if (bo) bo.classList.add('hidden');
      this.refreshUserBadge();
      this.refreshAll();   // _role 設後重畫側邊欄（設定鈕顯隱在 renderSidebar），比照 handleGoogleCredential
      return;
    }
    // landing 只剩單一 Google 登入 + 首登密鑰 + 檢視模式（loginPwMode/googleSetupHint 已拔，無顯隱分支）
    // ★ overlay 預設可見、登入成功才 hide；clientId + initGoogleSignIn 必須留 = 顯示登入框+掛 Google 按鈕本身
    const clientId = DATA.settings.googleClientId || DEFAULT_OAUTH_CLIENT_ID;
    this.initGoogleSignIn(clientId);
  },

  initGoogleSignIn(clientId) {
    const tryInit = () => {
      if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
        setTimeout(tryInit, 200);
        return;
      }
      try {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (resp) => App.handleGoogleCredential(resp),
        });
        const btnEl = document.getElementById('gSignInBtn');
        if (btnEl) {
          btnEl.style.display = '';
          btnEl.innerHTML = ''; // clear
          google.accounts.id.renderButton(btnEl, {
            theme: 'outline',
            size: 'large',
            width: 280,
            text: 'signin_with',
            shape: 'rectangular',
          });
        }
      } catch (e) {
        console.error('Google sign-in init failed', e);
        U.toast('❌ Google 登入初始化失敗：' + e.message, 'error');
      }
    };
    tryInit();
  },

  async handleGoogleCredential(resp) {
    try {
      // Decode JWT payload (no verify needed for client-side, Google has issued it)
      const parts = resp.credential.split('.');
      const payload = JSON.parse(decodeURIComponent(escape(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))));
      const email = (payload.email || '').toLowerCase();
      const name = payload.name || payload.given_name || 'User';
      const picture = payload.picture || '';

      // ─── 四層權限判斷（Admin > Editor > Viewonly > none）───
      // 安全紀律：有後端 roleUrl → 一律走後端，fetch 任何失敗（連不到/逾時/非 JSON）→ role='none' → 絕不放行。
      //   本地 fallback 只在「無 roleUrl」（純前端塊二階段）啟用，不是後端失敗的備胎——
      //   否則塊三上線後，切斷後端網路即可讓登入掉進本地判斷繞過授權。
      let role = 'none';
      const roleUrl = CFG('BACKEND_URL', '');
      if (roleUrl) {
        // 有後端 → 一律走後端，失敗往 none 倒（原安全紀律不變）
        try {
          const r = await fetch(roleUrl + '?action=role&email=' + encodeURIComponent(email), {
            method: 'GET', mode: 'cors', redirect: 'follow',
          });
          const j = await r.json();
          role = (j && j.role) || 'none';
        } catch (err) {
          console.error('Role check failed', err);
          role = 'none';   // 後端失敗 → 絕不放行
        }
      } else {
        // 無後端（塊二純前端階段）→ 本地 fallback 判斷
        const setupKey = (document.getElementById('loginSetupKey') || {}).value || '';  // landing input，子塊2才有，現在讀不到回空
        role = Auth.tryLocalRole(email, setupKey);
      }
      Auth._idToken = resp.credential;   // ★階段3(5a)：JWT 解出即有效憑證（與 role 無關），上移到分支前，供 viewonly 也能讀雲端 + 名單管理用（in-memory 不落地）
      if (role === 'viewonly') {
        // viewonly → 唯讀可看（§8f.4），不設 _loggedInEmail（PII 不留）
        this.enterViewOnly();
        if (DATA.settings.cloudSyncEnabled && DATA.settings.cloudSyncUrl) {
          CloudSync.download(true).then(s => { if (s) { this.refreshAll(); this.renderSidebar(); } });
        }
        U.toast('此帳號僅供檢視', 'warning');
        return;
      }
      if (role !== 'admin' && role !== 'editor' && role !== 'superadmin') {
        // none / 未知 → Can't view 擋頁（§8f.5）；superadmin/admin/editor 才放行，不留 PII、不顯示任何內容
        Auth.enterBlockout();
        return;
      }

      // admin 或 editor → 編輯模式（_role 供 isAdmin() 判 admin 功能）
      DATA.settings.userName = name;
      DATA.settings._role = role;
      DATA.settings._loggedInEmail = email;
      DATA.settings._loggedInPicture = picture;
      Store.settings.save();
      document.body.classList.remove('viewonly');
      document.getElementById('loginOverlay').classList.add('hidden');
      this.refreshUserBadge();
      this.refreshAll();   // ★ 重畫側邊欄，登入後即時算 setBtn 顯隱（admin 設定鈕出現），比照 setDevRole
      U.toast(`✓ 歡迎 ${name}`);

      // ★階段3(5c/4b)：登入成功（已有 _idToken）→ 拉一次雲端（取代 init 800ms 盲猜計時器）。因果正確：有憑證才拉。
      if (DATA.settings.cloudSyncEnabled && DATA.settings.cloudSyncUrl) {
        CloudSync.download(true).then(success => {
          if (success) { this.refreshAll(); this.renderSidebar(); U.toast('☁ 已自動從雲端同步最新資料', 'success'); }
        });
      }
      // 非 admin 首次登入（沒設過雲端同步 URL）→ 顯示 onboarding 提示
      if (!isAdmin() && !DATA.settings.cloudSyncUrl && !DATA.settings._onboardingShown) {
        DATA.settings._onboardingShown = true;
        Store.settings.save();
        setTimeout(() => this.showOnboarding(), 800);
      }
    } catch (e) {
      console.error('Login failed', e);
      U.toast('❌ 登入失敗：' + e.message, 'error');
    }
  },

  enterViewOnly() {
    document.body.classList.add('viewonly');
    document.getElementById('loginOverlay').classList.add('hidden');
    this.refreshUserBadge();
    this.refreshAll();   // 安全(§8f.6 硬化)：init 不再預渲染，viewonly 進來自行畫本地資料(即時顯示，不依賴雲端下載成功)
  },

  // 唯讀編輯守門（UX）：viewonly 時 toast 提示並回 true，呼叫端 `if (App._roGuard()) return;`。
  // 單一真實來源：toast 文字只此一處。安全防線在 Storage.save/upload 咽喉（此僅 UX 提示、非安全層）。
  _roGuard() {
    if (document.body.classList.contains('viewonly')) { U.toast('唯讀模式，無法編輯', 'warning'); return true; }
    return false;
  },

  // ─── PAGE NAV ───
  showPage(name, btn, _force) {
    if (name === 'settings' && !isAdmin()) { return this.showPage('workspace', document.querySelector('[data-page=workspace]')); }
    // §19.11 E：離開設定頁但範本編輯有未存 → 先彈窗（範本 draft 專屬；離開即棄 draft）
    if (!_force && this.currentPage === 'settings' && name !== 'settings' && this._tplDraft && this._tplDirty) {
      this.confirmModal({ title: '未儲存的範本內容', msg: '範本編輯有未儲存的修改，離開會遺失。確定離開？', okText: '離開不存', cancelText: '留下', okClass: 'danger',
        onConfirm: () => { App._tplDraft = null; App._tplDirty = false; App.showPage(name, btn, true); } });
      return;
    }
    // 修正3：離開設定頁且有未儲存變更 → 先彈窗問是否儲存（_force 跳過，供彈窗按鈕回呼）
    if (!_force && this.currentPage === 'settings' && name !== 'settings' && this._settingsDirty) { this._confirmLeaveSettings(name, btn); return; }
    this.currentPage = name;
    if (name === 'portfolio') this.currentView = 'overview';
    if (name === 'project') this.projectView = 'dashboard';
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + name).classList.add('active');

    const titles = {
      home:      '首頁',
      workspace: '個人工作台',
      portfolio: '全專案總覽',
      materials: '物料分析總覽',
      project:   this.currentProjectId ? this.getProj(this.currentProjectId)?.name + ' · 任務管理' : '專案',
      gantt:     '甘特圖 · 跨專案時程',
      month:     '月曆視圖',
      reportgen: '報表產出',
      transcripts: '會議逐字稿',
      settings:  '設定',
      archive:   '專案檔案室',
    };
    document.getElementById('pageTitle').textContent = titles[name] || name;
    document.getElementById('crumbPage').textContent = titles[name] || name;

    this._syncTopbar(name);

    if (btn) {
      document.querySelectorAll('.sb-item, .sb-proj').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    } else {
      // §25：無 btn（狀態卡/回首頁鍵/程式跳頁）也同步點亮對應側欄鈕
      const sb = document.querySelector(`.sb-item[data-page="${name}"]`);
      if (sb) { document.querySelectorAll('.sb-item, .sb-proj').forEach(b => b.classList.remove('active')); sb.classList.add('active'); }
    }

    // Render the active page（進甘特頁重設專案篩選＝全選；切週 ganttShift 不重設）
    if (name === 'gantt') { this.ganttProjectFilter = new Set(DATA.projects.map(p => p.id)); this.ganttStageFilter = null; this.ganttOwnerFilter = null; }
    this.renderPage(name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  switchProjectView(view) {
    this.projectView = view;
    if (view === 'dashboard' || view === 'list') { this.renderProject(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }   // §拆頁：任務清單與儀表板同走 full-page renderProject（分派見 renderProject·重繪自動打對 tab）
    if (view === 'gantt') { this.ganttProjectFilter = new Set([this.currentProjectId]); this.ganttStageFilter = null; this.ganttOwnerFilter = null; }
    document.getElementById('page-project').innerHTML = this.buildProjectHeaderHtml() + '<div class="view-tabs-bar">' + this.buildProjectViewTabsHtml() + '</div><div id="proj-view-body"></div>';
    if (view === 'gantt') this.renderGantt('proj-view-body', true);
    if (view === 'month') this.renderMonth('proj-view-body', this.currentProjectId);
    if (view === 'bom') this.renderProjectBom('proj-view-body', this.currentProjectId);   // §19.6 泛化：NPI BOM·ROI view（取代看板；看板已於 §13.9 退役清除）
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },

  // §22-D：topbar chrome 同步（隱藏/深色）——抽共用，showPage 與 refreshAll（初次載入路徑）兩邊都呼叫，避免初載停在工作檯時 topbar 沒變暗（光暗分割）。智慧排程鈕已移入工作檯工具列，topbar 不再有顯隱邏輯。
  _syncTopbar(name) {
    const tb = document.querySelector('.main > .topbar');
    if (tb) tb.classList.toggle('topbar-hidden', name === 'project');
    const homeBtn = document.getElementById('tbHome');   // §25 回首頁鍵：在 home 頁自己隱藏，其餘頁常駐
    if (homeBtn) homeBtn.style.display = name === 'home' ? 'none' : '';
    if (tb) tb.classList.toggle('topbar-dark', name === 'workspace');   // §22-D：工作檯深色·topbar 只此頁一起變暗（其他頁不受影響）
    this._applyWsTheme(name);   // 工作檯明暗（僅工作檯·localStorage 記憶）；含 topbar 太陽/月亮鈕顯隱
  },

  // ── 工作檯明暗切換（僅工作檯·存 localStorage·各機獨立·不入雲端；深色=現況指示燈、淺色=白底事件）──
  _wsThemeKey: 'pm_ws_theme',
  _wsTheme() { try { return localStorage.getItem(this._wsThemeKey) === 'light' ? 'light' : 'dark'; } catch (e) { return 'dark'; } },
  toggleWsTheme() {
    const next = this._wsTheme() === 'light' ? 'dark' : 'light';
    try { localStorage.setItem(this._wsThemeKey, next); } catch (e) {}
    this._applyWsTheme(this.currentPage);   // 純 CSS token 翻轉，無需重畫週曆
  },
  _applyWsTheme(name) {
    const isWs = name === 'workspace';
    const light = isWs && this._wsTheme() === 'light';
    const main = document.querySelector('.main');
    if (main) main.classList.toggle('ws-light', light);   // 淺色 token 覆蓋掛在 .main（topbar 與 #page-workspace 一起翻）
    const btn = document.getElementById('wsThemeToggle');
    if (btn) {
      btn.style.display = isWs ? '' : 'none';   // 太陽/月亮鈕只在工作檯出現
      btn.innerHTML = light ? '<i class="ti ti-sun"></i>' : '<i class="ti ti-moon"></i>';
      btn.title = light ? '切換深色模式' : '切換淺色模式';
    }
  },

  refreshAll() {
    this.renderSidebar();
    this._syncTopbar(this.currentPage);   // §22-D：初次載入路徑也同步 topbar chrome（不經 showPage）
    this.renderPage(this.currentPage);
  },

  renderPage(name) {
    switch (name) {
      case 'home':      this.renderHome();      break;   // §25 Home 首頁
      case 'workspace': Workspace.render();     break;
      case 'portfolio': Portfolio.render();     break;
      case 'materials': Materials.render();     break;
      case 'project':   this.renderProject();   break;
      case 'gantt':     this.renderGantt();     break;
      case 'month':     this.renderMonth();     break;
      case 'reportgen': this.renderReportGen(); break;   // §24 報表產出
      case 'transcripts': this.renderTranscripts(); break;   // §27 會議逐字稿
      case 'settings':  this.renderSettings();  break;
      case 'archive':   this.renderArchive();   break;   // §23 專案檔案室
    }
  },

  // ─── HELPERS ───
  getProj(id) { return DATA.projects.find(p => p.id === id); },
  getTasksOf(projId) { return DATA.tasks.filter(t => t.project === projId); },

  // §23 專案生命週期判定（done＝NPI status:'done' 或 ECN 'closed'·統一視為已完成）
  _isProjectDone(p) { const s = (p && p.status) || 'active'; return s === 'done' || s === 'closed'; },
  _isLiveProject(p) { return !this._isProjectDone(p) && !(p && p.archived); },   // 側欄活案（_deleted 已搬 projectsTrash、不在 DATA.projects）
  _archCounts() {
    const ps = DATA.projects || [];
    return { done: ps.filter(p => !p.archived && this._isProjectDone(p)).length, arch: ps.filter(p => p.archived).length, trash: (DATA.projectsTrash || []).length };
  },

  // ─── SIDEBAR ───
  renderSidebar() {
    const list = document.getElementById('projectList');
    // §15 段4：同名群組（count>1）才顯版號副標，單一專案不顯（避免雜訊）。key 含分類＝NPI/ECN 同名分開計（問題4）
    const nameCount = {};
    const _nkey = (p) => (p.ecnType ? 'E:' : 'N:') + p.name;
    DATA.projects.forEach(p => { nameCount[_nkey(p)] = (nameCount[_nkey(p)] || 0) + 1; });
    // 單一專案列 HTML（NPI／ECN 兩群共用）
    const today = D.today();
    const sbCollapsed = (() => { try { return localStorage.getItem('pm_sb_collapsed') === '1'; } catch (e) { return false; } })();   // tooltip 依收合/展開切換內容（收合含專案名·展開不含）·toggleSidebar 會重繪
    const renderProj = (p) => {
      const cnt = DATA.tasks.filter(t => t.project === p.id && t.status !== 'done' && !t._deleted).length;
      // §Sidebar 兩行：整體進度＝Portfolio.projectProgress（actual＝weightedProgress 全站單一口徑·rule15）＋預計進度算健康度落差
      const pr = (typeof Portfolio !== 'undefined' && Portfolio.projectProgress) ? Portfolio.projectProgress(p.id, today) : { actual: null, planned: null };
      const prog = pr.actual;   // 無可排程任務→null→不顯進度條
      const planned = pr.planned;
      const gap = (prog != null && planned != null) ? prog - planned : null;   // 目前−預期；負＝落後
      const health = gap == null ? 'none' : (gap >= -5 ? 'safe' : (gap <= -15 ? 'over' : 'warn'));   // 落差≤5%安全／6–15%警告／>15%逾期（與總覽落差表同閾值·rule15）
      const isActive = this.currentPage === 'project' && this.currentProjectId === p.id;
      // 版號 + 日期副標：日期 importedAt||createdAt（B 方案 fallback）、D.fmt 本地避 -1 天；version||1 兜底舊專案
      const ver = nameCount[_nkey(p)] > 1
        ? `<span class="sb-proj-ver">V${p.version || 1} · ${D.fmt(p.importedAt || p.createdAt, 'iso')}</span>`
        : '';
      const behind = gap != null ? -gap : null;   // 落後百分點（正數）
      const statLabel = health === 'safe' ? '安全' : health === 'warn' ? '警告' : health === 'over' ? '逾期' : '待評估';
      const noteText = health === 'safe' ? '目前進度符合預期。'
        : health === 'warn' ? `進度落後 ${behind}%，請留意延誤風險。`
        : health === 'over' ? `嚴重落後 ${behind}%，建議重新檢討排程。`
        : '尚無排程日期，暫無法比對預計進度。';
      // Tooltip：結構化健康度浮卡（狀態燈＋標題／分隔線／冒號對齊 預計·實際·落差·未完任務·數值局部著色）
      // 統一掛整列 button，子元素 hover 冒泡上來（Hover 名稱/進度條/%/待辦皆同一份）；展開不含專案名、收合補專案名（initTooltip.show 依 data-hmode=health 渲染）。
      const hAttrs = `data-hmode="health" data-hstat="${health}" data-hplan="${planned == null ? '' : planned}" data-hact="${prog == null ? '' : prog}" data-hnote="${U.esc(noteText)}" data-htodo="${cnt}" data-hname="${U.esc(p.name)}" data-hcol="${sbCollapsed ? '1' : '0'}"`;
      const plainCore = (planned != null && prog != null)
        ? `專案健康度：${statLabel}|預計 ${planned}%　實際 ${prog}%|${noteText}|待辦 ${cnt} 項`
        : `專案健康度：${statLabel}|${noteText}|待辦 ${cnt} 項`;
      const plainTip = sbCollapsed ? `${U.esc(p.name)}|${plainCore}` : plainCore;   // 純文字備援（結構化失效／無障礙報讀）
      const bar = prog != null
        ? `<span class="sb-proj-bar sb-h-${health}"><i style="width:${prog}%"></i></span><span class="sb-proj-pct sb-h-${health}">${prog}%</span>`
        : '';
      const seq = String(_idxMap[p.id] || 0).padStart(2, '0');   // 跨群連續序號（B 樣式徽章·掃視第幾個）
      return `<button class="sb-proj ${p.ecnType ? 'sb-proj-ecn' : 'sb-proj-npi'} ${isActive ? 'active' : ''}" data-tip="${plainTip}" ${hAttrs} aria-label="${U.esc(p.name)}" draggable="true" data-pid="${p.id}" onclick="App.openProject('${p.id}', this)" ondragstart="App._sbDragStart(event,'${p.id}')" ondragover="App._sbDragOver(event,'${p.id}')" ondrop="App._sbDrop(event,'${p.id}')" ondragend="App._sbDragEnd(event)">
        <span class="sb-proj-top">
          <span class="sb-proj-gutter"><span class="sb-proj-idx">${seq}</span><i class="ti ti-grip-vertical sb-drag" aria-hidden="true"></i></span>
          <span class="sb-txt sb-proj-name"><span class="sb-proj-nm">${U.esc(p.name)}</span>${ver}</span>
        </span>
        <span class="sb-txt sb-proj-meta">${bar}<span class="count">待辦 ${cnt}</span></span>
      </button>`;
    };
    // §19.10 A.0：sidebar 依 ecnType 分兩群（NPI 開發案／設變案 ECN），兩群上方單一「＋建立新案」→ 選型引導頁；兩群退為 View 分類清單、不再各自帶＋鈕
    const _sbCmp = this._sbOrderCmp();   // 套用使用者拖曳排序（localStorage·各機獨立）
    const npiProjs = DATA.projects.filter(p => !p.ecnType && this._isLiveProject(p)).sort(_sbCmp);   // §23 側欄只留活案（完成/封存移檔案室）
    const ecnProjs = DATA.projects.filter(p => p.ecnType && this._isLiveProject(p)).sort(_sbCmp);
    const _idxMap = {};   // 跨群連續編號 1→N（NPI 先、ECN 後）
    [...npiProjs, ...ecnProjs].forEach((p, i) => { _idxMap[p.id] = i + 1; });
    // 建案 CTA 已改靜態置於固定頂（index.html sb-top）；此處只渲染 NPI／ECN 兩群清單（捲動中段）
    // §Sidebar 方案E：群組標題（sticky 吸頂·可點收合）＋ rows 包一層 .sb-grp-rows（收合時整組隱藏·標題留頂）
    const _grpHead = (key, label, cnt, ecn) =>
      `<div class="sb-grp${ecn ? ' sb-grp-ecn' : ''}" data-grp="${key}" onclick="App._sbToggleGroup('${key}')" title="收合／展開這一類">`
      + `<span class="sb-grp-dot"></span><span class="sb-txt">${label}</span><span class="sb-grp-count sb-txt">${cnt} 案</span><span class="sb-grp-chev"></span></div>`;
    list.innerHTML =
      _grpHead('npi', 'NPI 開發案', npiProjs.length, false)
      + `<div class="sb-grp-rows" data-grp="npi">` + (npiProjs.length ? npiProjs.map(renderProj).join('') : `<div class="sb-group-empty sb-txt">（尚無開發案）</div>`) + `</div>`
      + _grpHead('ecn', '設變案 · ECN', ecnProjs.length, true)
      + `<div class="sb-grp-rows" data-grp="ecn">` + (ecnProjs.length ? ecnProjs.map(renderProj).join('') : `<div class="sb-group-empty sb-txt">（尚無設變案）</div>`) + `</div>`;
    this._applySbGroupState();   // 套用上次群組收合狀態（各機獨立·localStorage）
    this._applySidebarState();   // 套用上次側欄窄軌收合/展開狀態

    // §23 側欄底部「專案檔案室」入口計數（完成/封存/回收桶·常駐即使 0·規則16）
    const _ac = this._archCounts();
    const acEl = document.getElementById('archiveCounts');
    if (acEl) acEl.textContent = `完成 ${_ac.done}·封存 ${_ac.arch}·回收 ${_ac.trash}`;


    const setBtn = document.querySelector('[data-page=settings]');
    if (setBtn) setBtn.style.display = isAdmin() ? '' : 'none';

    // 登出鈕：僅真登入身份（有 _role：editor/admin/superadmin）顯示；viewonly/none 無 _role、無 session 可登出
    const logoutBtn = document.querySelector('.sb-logout');
    if (logoutBtn) logoutBtn.style.display = (DATA.settings._role === 'editor' || DATA.settings._role === 'admin' || DATA.settings._role === 'superadmin') ? '' : 'none';
  },

  // ─── §25 HOME 首頁 / 模組註冊表（single source·新模組自我註冊一行即自動長進 Home）───
  NAV_MODULES: [
    { id: 'workspace', page: 'workspace', cat: 'daily', title: '個人工作台', icon: 'ti-layout-dashboard', desc: '專注今日時程與任務，推動你的每日工作流。', badge: () => '待辦 ' + (DATA.tasks || []).filter(t => !t._deleted && t.status !== 'done' && t.measureType === 'hours').length },
    { id: 'portfolio', page: 'portfolio', cat: 'daily', title: '全專案總覽', icon: 'ti-list-details', desc: '大局視角，一眼掌握所有專案的健康度、進度落差與人力負載。', badge: () => (DATA.projects || []).filter(p => App._isLiveProject(p)).length + ' 進行中' },
    { id: 'materials', page: 'materials', cat: 'tools', title: '物料分析', icon: 'ti-box', desc: '跨案 BOM 與替代料件管理，精算成本效益、防堵停產風險。' },
    { id: 'reportgen', page: 'reportgen', cat: 'tools', title: '報表產出', icon: 'ti-file-spreadsheet', desc: '免改格式！一鍵把最新資料灌進你的 Excel／PPT 報告。（設定範本時走智慧對應精靈）', badge: () => { const n = (DATA.reportTemplates || []).length; return n ? n + ' 範本' : ''; } },
    { id: 'newproject', cat: 'manage', title: '建立新案', icon: 'ti-folder-plus', desc: '快速發起 NPI 新品開發、ECN 工程設變或空白自訂專案。', action: '_flowStep1' },
    { id: 'archive', page: 'archive', cat: 'manage', title: '專案檔案室', icon: 'ti-archive', desc: '盤點已完成／已封存／回收桶的歷史專案，隨時可還原。', badge: () => { const a = App._archCounts(); return '完成 ' + a.done + '·封存 ' + a.arch; } },
    { id: 'settings', page: 'settings', cat: 'manage', title: '設定', icon: 'ti-settings', desc: '排程與日曆、資料備份、權限、專案範本。', adminOnly: true },
  ],
  registerModule(m) { if (m && m.id && !this.NAV_MODULES.some(x => x.id === m.id)) this.NAV_MODULES.push(m); },

  _homeGreeting() { const h = new Date().getHours(); return h < 5 ? '晚安' : h < 11 ? '早安' : h < 17 ? '午安' : '晚安'; },
  _weekRange(today) {
    const d = new Date(today); const day = (d.getDay() + 6) % 7;   // Mon=0
    const start = new Date(d); start.setDate(d.getDate() - day); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
    return { start, end };
  },
  _taskDate(t) { const s = t.scheduledStart || t.plannedStart || t.scheduledEnd || t.plannedEnd || t.date; if (!s) return null; const d = new Date(s); return isNaN(d.getTime()) ? null : d; },
  _homeStats() {
    const today = D.today();
    const tasks = (DATA.tasks || []).filter(t => !t._deleted);
    const todos = tasks.filter(t => t.status !== 'done' && t.measureType === 'hours');
    const mtgs = (DATA.meetings || []).filter(m => m.date && D.isSameDay(new Date(m.date), today));
    const nextMtg = mtgs.slice().sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''))[0];
    let behind = 0, worst = null, worstGap = 0;
    (DATA.projects || []).forEach(p => {
      if (!this._isLiveProject(p)) return;
      const pr = (typeof Portfolio !== 'undefined' && Portfolio.projectProgress) ? Portfolio.projectProgress(p.id, today) : null;
      if (pr && pr.actual != null && pr.planned != null) { const gap = pr.actual - pr.planned; if (gap <= -15) { behind++; if (gap < worstGap) { worstGap = gap; worst = p; } } }
    });
    const wk = this._weekRange(today);
    const miles = tasks.filter(t => t.taskType === 'milestone' && t.status !== 'done')
      .filter(t => { const d = this._taskDate(t); return d && d >= wk.start && d <= wk.end; })
      .sort((a, b) => this._taskDate(a) - this._taskDate(b));
    const liveN = (DATA.projects || []).filter(p => this._isLiveProject(p)).length;
    return {
      todo: todos.length, todoSub: todos.length ? '未完成的個人任務' : '今日任務已全數完成',
      mtg: mtgs.length, mtgSub: nextMtg ? ('下一場 ' + (nextMtg.startTime || '') + ' · ' + (nextMtg.title || '會議')) : '今天沒有排定會議',
      behind, behindSub: worst ? (worst.name + ' 落後 ' + Math.abs(Math.round(worstGap)) + '%') : '所有專案皆符合預期',
      mile: miles.length, mileSub: miles[0] ? ('最近：' + miles[0].name) : '本週無即將到期里程碑',
      wk: new Date().getFullYear() + ' · ' + liveN + ' 個進行中專案',
    };
  },
  _homeStatHtml(color, icon, label, val, sub, page) {
    return `<button class="hm-stat s-${color}" onclick="App.showPage('${page}')" title="點擊 → ${label}相關頁">
      <span class="hm-go"><i class="ti ti-arrow-up-right"></i></span>
      <span class="hm-k"><i class="ti ${icon}"></i>${label}</span>
      <span class="hm-v">${val}</span><span class="hm-sub">${U.esc(sub)}</span></button>`;
  },
  _homeOnboardHidden() { try { return localStorage.getItem('pm_home_onboard') === '0'; } catch (e) { return false; } },
  _homeCloseOnboard() { try { localStorage.setItem('pm_home_onboard', '0'); } catch (e) {} const el = document.querySelector('#page-home .hm-onboard'); if (el) el.remove(); },
  _homeOnboardHtml() {
    if (this._homeOnboardHidden()) return '';
    return `<div class="hm-onboard">
      <span class="hm-ob-ico">👋</span>
      <span class="hm-ob-txt"><b>新手上手</b> · 歡迎使用 PM-Core！跟著指引快速熟悉操作，或看系統簡介。</span>
      <span class="hm-ob-actions">
        <button class="hm-obtn primary" onclick="U.toast('操作手冊整合中，報表功能完成後更新', 'info')">📖 先看操作手冊／系統簡介</button>
        <button class="hm-obtn" onclick="App._flowStep1()">＋ 建立第一個專案</button>
      </span>
      <button class="hm-ob-x" onclick="App._homeCloseOnboard()" title="收起（重整後再出現）">✕</button></div>`;
  },
  renderHome() {
    const el = document.getElementById('page-home');
    if (!el) return;
    const st = this._homeStats();
    const CATS = [['daily', '每日'], ['tools', '工具'], ['manage', '管理']];
    const CCOLOR = { workspace: 'slate', portfolio: 'npi', materials: 'amber', reportgen: 'sage', transcripts: 'sage', newproject: 'green', archive: 'stone', settings: 'stone' };
    const card = (m) => {
      let badge = ''; try { badge = m.badge ? m.badge() : ''; } catch (e) { badge = ''; }
      const cc = CCOLOR[m.id] || 'slate';
      const act = m.action ? `App.${m.action}()` : `App.showPage('${m.page}')`;
      return `<button class="hm-card cc-${cc}" onclick="${act}">
        <span class="hm-cico"><i class="ti ${m.icon}"></i></span>
        <span class="hm-cbody"><span class="hm-ct">${U.esc(m.title)}</span><span class="hm-cd">${U.esc(m.desc || '')}</span>${badge ? `<span class="hm-badge">${U.esc(badge)}</span>` : ''}</span></button>`;
    };
    const sects = CATS.map(([c, label]) => {
      const ms = this.NAV_MODULES.filter(m => m.inHome !== false && m.cat === c && (!m.adminOnly || isAdmin()));
      if (!ms.length) return '';
      return `<div class="hm-sect"><div class="hm-sh">${label}</div><div class="hm-cards">${ms.map(card).join('')}</div></div>`;
    }).join('');
    el.innerHTML =
      `<div class="hm-hd"><div class="hm-hi">${this._homeGreeting()} 👋</div><div class="hm-wk">${U.esc(st.wk)}</div></div>`
      + this._homeOnboardHtml()
      + `<div class="hm-strip">`
      + this._homeStatHtml('slate', 'ti-checklist', '我的待辦', st.todo, st.todoSub, 'workspace')
      + this._homeStatHtml('npi', 'ti-calendar-event', '今日會議', st.mtg, st.mtgSub, 'workspace')
      + this._homeStatHtml('amber', 'ti-alert-triangle', '進度落後', st.behind, st.behindSub, 'portfolio')
      + this._homeStatHtml('green', 'ti-flag', '本週里程碑', st.mile, st.mileSub, 'portfolio')
      + `</div>` + sects;
  },

  openProject(id, btn) {
    this.currentProjectId = id;
    this.showPage('project', btn);
  },

  // ── 側欄群組收合（方案E·NPI／ECN 各自收起·狀態存 localStorage·各機獨立·首次全展開）──
  _sbGrpCollapsed() { try { return JSON.parse(localStorage.getItem('pm_sb_grp_collapsed') || '[]'); } catch (e) { return []; } },
  _sbSaveGrpCollapsed(keys) { try { localStorage.setItem('pm_sb_grp_collapsed', JSON.stringify(keys)); } catch (e) {} },
  _sbToggleGroup(key) {   // 點群組標題→toggle 收合、存檔、即時套用（不整頁重繪）
    const keys = this._sbGrpCollapsed();
    const i = keys.indexOf(key);
    if (i >= 0) keys.splice(i, 1); else keys.push(key);
    this._sbSaveGrpCollapsed(keys);
    this._applySbGroupState();
  },
  _applySbGroupState() {   // 依存檔把收合類的標題＋rows 加/去 .collapsed
    const keys = this._sbGrpCollapsed();
    document.querySelectorAll('#projectList .sb-grp').forEach(h => {
      const k = h.getAttribute('data-grp');
      const on = keys.indexOf(k) >= 0;
      h.classList.toggle('collapsed', on);
      const rows = document.querySelector(`#projectList .sb-grp-rows[data-grp="${k}"]`);
      if (rows) rows.classList.toggle('collapsed', on);
    });
  },

  // ── 側欄專案拖曳排序（順序存 localStorage·各機獨立·不入雲端同步）＋跨群連續編號 ──
  _sbProjOrder() { try { return JSON.parse(localStorage.getItem('pm_sb_proj_order') || '[]'); } catch (e) { return []; } },
  _sbSaveOrder(ids) { try { localStorage.setItem('pm_sb_proj_order', JSON.stringify(ids)); } catch (e) {} },
  _sbOrderCmp() {   // 依存檔順序排序；未在存檔中的（新專案）排後、保原相對序
    const ord = this._sbProjOrder();
    return (a, b) => { const ia = ord.indexOf(a.id), ib = ord.indexOf(b.id); if (ia < 0 && ib < 0) return 0; if (ia < 0) return 1; if (ib < 0) return -1; return ia - ib; };
  },
  _sbDisplayOrderIds() {   // 目前側欄顯示順序（NPI 群在前、ECN 群在後·各群內套存檔序）＝拖放重排的基準
    const cmp = this._sbOrderCmp();
    const npi = DATA.projects.filter(p => !p.ecnType).sort(cmp);
    const ecn = DATA.projects.filter(p => p.ecnType).sort(cmp);
    return [...npi, ...ecn].map(p => p.id);
  },
  _sbDragStart(e, id) {
    this._sbDragId = id;
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', id); } catch (_) {} }
    const el = e.currentTarget; if (el && el.classList) el.classList.add('sb-dragging');
  },
  _sbDragOver(e, id) {
    e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.sb-proj.sb-dragover').forEach(n => n.classList.remove('sb-dragover'));
    const d = this.getProj(this._sbDragId), t = this.getProj(id);
    if (d && t && this._sbDragId !== id && !!d.ecnType === !!t.ecnType) {   // 只允許同群（NPI↔NPI／ECN↔ECN）
      const el = e.currentTarget; if (el && el.classList) el.classList.add('sb-dragover');
    }
  },
  _sbDrop(e, targetId) {
    e.preventDefault();
    const dragId = this._sbDragId; this._sbDragEnd(e);
    if (!dragId || dragId === targetId) return;
    const d = this.getProj(dragId), t = this.getProj(targetId);
    if (!d || !t || !!d.ecnType !== !!t.ecnType) return;   // 跨群不接受
    const disp = this._sbDisplayOrderIds();
    const from = disp.indexOf(dragId), to = disp.indexOf(targetId);
    if (from < 0 || to < 0) return;
    disp.splice(from, 1);
    const nt = disp.indexOf(targetId);
    disp.splice(from < to ? nt + 1 : nt, 0, dragId);   // 往下拖插目標之後、往上拖插之前
    this._sbSaveOrder(disp);
    this.renderSidebar();
  },
  _sbDragEnd() {
    this._sbDragId = null;
    document.querySelectorAll('.sb-proj.sb-dragging, .sb-proj.sb-dragover').forEach(n => n.classList.remove('sb-dragging', 'sb-dragover'));
  },

  // 側欄收合/展開：切 .app.sb-collapsed（grid 240↔64px，右側 1fr 自動補寬不破圖）＋存 localStorage 跨 session 記住
  toggleSidebar() {
    const app = document.querySelector('.app');
    if (!app) return;
    const collapsed = app.classList.toggle('sb-collapsed');
    try { localStorage.setItem('pm_sb_collapsed', collapsed ? '1' : '0'); } catch (e) {}
    this.renderSidebar();   // 重繪：專案列 tooltip 依收合/展開切換內容（收合 button 補專案名·展開不含）
  },
  _applySidebarState() {
    const app = document.querySelector('.app');
    if (!app) return;
    let v = '0';
    try { v = localStorage.getItem('pm_sb_collapsed') || '0'; } catch (e) {}
    app.classList.toggle('sb-collapsed', v === '1');
  },

  // §19.10 A.0 ECN 開案：選型頁 ECN 三卡 onclick=App._flowStartEcn(size)（template.js）；建立跳戰情室 dashboard 為下一波（現落地一般內頁過渡）
};

// 雙軌導覽分包（§18.7）：個人工作台 / 全專案總覽 各自命名空間，未來拆檔即剪貼。
const Workspace = {};
const Portfolio = {};

// 設計款輸入彈窗（取代原生 prompt）：textarea + 確定/取消，確定回傳值給 onSubmit
App.promptModal = function(opts) {
  const o = opts || {};
  App.openModal({
    title: o.title || '輸入',
    body: `<div class="form-field"><label>${U.esc(o.label || '')}</label>
      <textarea id="pm-input" rows="${o.rows || 3}" style="width:100%;resize:vertical;" placeholder="${U.esc(o.placeholder || '')}">${U.esc(o.value || '')}</textarea></div>`,
    footer: `<button class="tb-action ghost" onclick="App.closeModal()">取消</button>
             <button class="tb-action" onclick="App._promptModalOk()">${U.esc(o.okText || '確定')}</button>`,
  });
  App._promptModalCb = o.onSubmit || null;
  setTimeout(() => { const i = document.getElementById('pm-input'); if (i) { i.focus(); if (i.select) i.select(); } }, 50);
};
App._promptModalOk = function() {
  const i = document.getElementById('pm-input');
  const val = i ? i.value : '';
  const cb = App._promptModalCb;
  App._promptModalCb = null;
  App.closeModal();
  if (cb) cb(val);
};

// 顯示用任務進度(Dashboard 口徑,KPI OVERALL 與階段進度卡共用,改必同步兩處呼叫端):
// 有 progress 數值 → 夾 0~100 用之;無數值 → 狀態折算(done=100、其餘=0),保守不灌水。
function taskDisplayProgress(t) {
  if (typeof t.progress === 'number') return Math.max(0, Math.min(100, t.progress));
  return t.status === 'done' ? 100 : 0;
}

// ─── §18.15 進度加權單一來源：整體進度按「工作量」加權（大任務算重，非每件等權）───
// 工作量＝taskIntensity(每日投入強度·netWorkDays/span 或 effortRatio/100) × 工期工作天＝估計淨工作天；
// 無日期者退回單日強度（>0，不被丟棄·規則16）。全站「整體進度」headline 單一口徑（總覽總進度／各案實際·預期／專案頁整體進度 KPI）皆走此；階段進度卡另為「階段內每件等重」不走此。
function taskWorkload(t) {
  if (!t) return 0;
  const e = getEffectiveSchedule(t);
  const span = (e && e.start && e.end) ? D.workdaysBetween(e.start, e.end) : 0;
  return span > 0 ? span * taskIntensity(t) : taskIntensity(t);
}
// 加權平均進度：Σ(每任務進度 × 工作量) ÷ Σ工作量。空集合／總權重 0 回 null。scoreFn 未給＝用 taskDisplayProgress。
function weightedProgress(tasks, scoreFn) {
  const sc = scoreFn || taskDisplayProgress;
  let acc = 0, wsum = 0;
  (tasks || []).forEach(t => { const w = taskWorkload(t); if (w > 0) { acc += sc(t) * w; wsum += w; } });
  return wsum > 0 ? Math.round(acc / wsum) : null;
}

// 把專案任務依 PLM 階段(task.stage)分桶，算每階段日期範圍 + 數量，依階段內最小 wbs（minWbs）排序。供階段下拉用。
// 日期走 getEffectiveSchedule 顯示優先序(override>actual>scheduled>planned)；.start==='' 的項目排除，不汙染 min/max。
// 純算：不碰 UI/渲染/引擎/applySchedule。ISO 'YYYY-MM-DD' 字串可直接字典序比較＝時序比較。
// @return [{ stageId, name, earliestStart, latestEnd, itemCount }]；空階段(無有日期項目) earliest/latest = null
// ── [CORE] 純計算層：只讀 DATA、回傳資料，禁止呼叫 render/Storage（見 docs/core-layer.md）──
App.getProjectStages = function(projectId) {
  const NO_STAGE = '未分階段';
  const buckets = {};   // key = 階段名 + '\u0000' + (variant||'')；同名階段跨案別各自一桶
  (DATA.tasks || []).forEach(t => {
    if (t.project !== projectId || t._deleted) return;
    const s = (typeof t.stage === 'string' && t.stage.trim()) ? t.stage.trim() : NO_STAGE;
    const key = s + '\u0000' + (t.variant || '');
    (buckets[key] || (buckets[key] = [])).push(t);
  });
  const stages = Object.keys(buckets).map(key => {
    const ts = buckets[key];
    const name = key.split('\u0000')[0];
    const variantId = key.split('\u0000')[1] || null;
    let earliestStart = null, latestEnd = null, doneCount = 0, minWbs = Infinity;
    ts.forEach(t => {
      if (t.status === 'done') doneCount++;
      const w = parseInt(t.wbs); if (!isNaN(w) && w < minWbs) minWbs = w;
      const sch = getEffectiveSchedule(t);
      if (sch && sch.start && (!earliestStart || sch.start < earliestStart)) earliestStart = sch.start;
      if (sch && sch.end   && (!latestEnd   || sch.end   > latestEnd))       latestEnd   = sch.end;
    });
    return { stageId: key, name, variantId, minWbs,
             earliestStart, latestEnd, itemCount: ts.length, doneCount };
  });
  // 排序：minWbs 升冪(主案 wbs 全小於另案→variant 自然分組)；平手以階段名穩定(防 Infinity-Infinity=NaN)
  stages.sort((a, b) => (a.minWbs - b.minWbs) || a.name.localeCompare(b.name));
  return stages;
};

// M2-2a：任務表單 stage/subgroup datalist——掃該專案任務既有值（trim 非空才收，收 trim 後值統一口徑）。
// 「未分階段」是 getProjectStages 顯示層分桶代稱、task.stage 不存此字面值，故 trim 過濾即足、不特判
// （特判反而會吞掉使用者真打的同名值）。共用核心+薄包裝：兩欄只差欄位名，不重複原則。
function taskFieldDatalistOptions(projectId, field) {
  const set = new Set();
  (DATA.tasks || []).forEach(x => {
    if (x.project === projectId && !x._deleted && typeof x[field] === 'string' && x[field].trim()) set.add(x[field].trim());
  });
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant')).map(s => `<option value="${U.esc(s)}"></option>`).join('');
}
App.stageDatalistOptions = function(projectId) { return taskFieldDatalistOptions(projectId, 'stage'); };
App.subgroupDatalistOptions = function(projectId) { return taskFieldDatalistOptions(projectId, 'subgroup'); };

// ═══════════════════════════════════════════════════════
//  MODAL HELPERS
// ═══════════════════════════════════════════════════════
// ─── ONBOARDING (新使用者第一次登入時的引導) ───
App.showOnboarding = function() {
  this.openModal({
    title: '🎉 歡迎使用 ' + CFG('APP_NAME', 'PM-Core'),
    body: `
      <div style="font-size:13px; line-height:1.7; color:var(--ink2);">
        <p>這是 <b>${U.esc(DATA.settings.userName || '你')}</b> 的個人任務管理工作區。</p>
        <p>所有功能你<b>現在就可以開始用</b>，資料會自動存在這台電腦的瀏覽器裡。</p>

        <div style="margin:18px 0; padding:14px 16px; background:var(--sage-50); border-left:3px solid var(--sage-500); border-radius:6px;">
          <div style="font-weight:600; margin-bottom:6px;">💡 想要跨裝置同步嗎？</div>
          <div style="font-size:12.5px; color:var(--ink3);">
            預設情況下，你的資料只存在這台電腦。如果要在多台裝置（家裡電腦 / 公司桌機 / 筆電）間同步，
            需要建立自己的 Google Sheet 當儲存空間（5 分鐘設定 / 完全免費 / 資料 100% 屬於你）。
          </div>
          <div style="font-size:12px; color:var(--ink4); margin-top:8px;">
            ⚙ 之後到「設定 → ${CFG('APP_NAME', 'PM-Core')} 跨裝置同步」依步驟設定即可
          </div>
        </div>

        <div style="margin-top:14px; padding:12px 14px; background:var(--surface2); border-radius:6px; font-size:12px;">
          <b>📚 快速上手</b><br>
          • 左側 <b>＋ 新增專案</b> 建立你的第一個專案<br>
          • 進入專案後底部「快速新增任務」即可加入任務<br>
          • 任務拖曳到時程表自動排程<br>
          • <b>設定 → 個人資訊</b> 可改名字 / 工時 / 會議時段
        </div>
      </div>
    `,
    footer: `
      <button class="tb-action" onclick="App.closeModal()" style="padding:10px 28px;">開始使用 →</button>
    `,
  });
};

// §6.5 塊三：confirm 公版——渲染到獨立 #confirmOverlay（z 疊在 #modal 上），不覆寫 #modal，底下表單原封不動。
App.confirmModal = function(opts) {
  const o = opts || {};
  const el = document.getElementById('confirmOverlay');
  // 選用 icon 圓（mockup circle-check／calendar／wrench）：給了 icon 才渲染、標題置中；沒給＝維持原樣（向後相容既有呼叫端）。
  const iconHtml = o.icon
    ? `<div style="width:46px;height:46px;border-radius:50%;background:var(${o.iconBg || '--sage-50'});display:flex;align-items:center;justify-content:center;margin:0 auto 12px;"><i class="ti ${o.icon}" style="font-size:23px;color:var(${o.iconColor || '--sage-600'});"></i></div>`
    : '';
  const okCls = o.okClass ? (' ' + o.okClass) : '';
  el.innerHTML = `<div class="confirm-box">
    ${iconHtml}
    <div class="confirm-title" style="font-weight:600;font-size:15px;${o.icon ? 'text-align:center;' : ''}">${o.title || '請確認'}</div>
    <div class="confirm-msg">${o.msg || ''}</div>
    <div class="confirm-actions">
      ${o.cancelText === null ? '' : `<button class="tb-action ghost" onclick="App._confirmModalClose()">${o.cancelText || '取消'}</button>`}
      <button class="tb-action${okCls}" onclick="App._confirmModalYes()">${o.okText || '確認'}</button>
    </div></div>`;
  el.classList.toggle('confirm-ws-dark', App.currentPage === 'workspace' && !document.querySelector('.main.ws-light'));   // 工作檯深色模式：確認框同步深色皮
  el.style.display = 'flex';
  App._confirmModalCb = o.onConfirm || null;
};
App._confirmModalClose = function() {
  const el = document.getElementById('confirmOverlay');
  el.style.display = 'none'; el.innerHTML = '';
  App._confirmModalCb = null;
};
App._confirmModalYes = function() {
  const cb = App._confirmModalCb;
  App._confirmModalClose();
  if (cb) cb();
};

App.openModal = function({ title, body, footer, wide }) {
  const modal = document.getElementById('modal');
  modal.classList.toggle('modal-wide', !!wide);   // 寬版（如會議設定彈窗：確認清單欄位多）
  // 工作檯（深色頁）開的彈窗＝深色皮，與外層深底呼應；工作檯若切亮色模式(.main.ws-light)則維持預設亮彈窗（自然一致）
  modal.classList.toggle('modal-ws-dark', App.currentPage === 'workspace' && !document.querySelector('.main.ws-light'));
  modal.innerHTML = `
    <div class="modal-head">
      <h3>${title}</h3>
      <button class="modal-close" onclick="App.closeModal()">×</button>
    </div>
    <div class="modal-body">${body}</div>
    ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
  `;
  document.getElementById('modalOverlay').classList.add('open');
};

App.closeModal = function() {
  App._insertAfterId = null;   // 取消/關閉(含 X、Esc)清插入旗標，避免殘留下次誤插
  App._tplDepts = null;        // 清模板暫存部門（取消/關閉都清，避免殘留下次誤用）
  document.getElementById('modalOverlay').classList.remove('open');
};

// 共用載入彈窗：長時操作（AI 辨識/OCR）開始即跳·轉圈＋訊息·完成後被結果 Modal 取代（openModal 會覆蓋內容）
App.openLoadingModal = function(title, msg) {
  App.openModal({ title: title || '請稍候', body: `<div class="load-modal"><div class="load-spin"></div><div class="load-msg" id="load-msg">${msg || '處理中…'}</div></div>` });
};
App.setLoadingMsg = function(msg) { const el = document.getElementById('load-msg'); if (el) el.textContent = msg; };

// 匯率來源（報價單/模具匯入共用·§21.16/21.17）：優先「去專案 BOM 已設的匯率」·再退使用者上次手填的記憶（NTD≡TWD 同幣）
App._normCurA = c => { c = String(c == null ? '' : c).toUpperCase(); return c === 'NTD' ? 'TWD' : c; };
App._bomRateFor = function(currency) {   // 掃專案 BOM：有設此報價幣別者取其匯率（Paul：拿 BOM 那邊的匯率·別自己瞎猜）
  const cur = App._normCurA(currency); if (!cur || cur === 'TWD') return cur === 'TWD' ? 1 : null;
  const projs = DATA.projects || [];
  for (const p of projs) { if (App._normCurA(p.bomQuoteCurrency) === cur) { const r = parseFloat(p.bomRate); if (r > 0) return r; } }
  return null;
};
App._ratePref = {
  get(cur) { const b = App._bomRateFor(cur); if (b != null) return b; try { const v = parseFloat(localStorage.getItem('PMCORE_RATE_' + cur)); if (v > 0) return v; } catch (e) {} return App._normCurA(cur) === 'TWD' ? 1 : 1; },
  set(cur, rate) { const r = parseFloat(rate); try { if (r > 0 && cur && App._normCurA(cur) !== 'TWD') localStorage.setItem('PMCORE_RATE_' + cur, String(r)); } catch (e) {} },
};

// 共用 Gemini 視覺引擎（報價單／會議截圖等都用它·§21.16 路線2）：images=dataURL 陣列, schema=回傳結構
App.geminiVision = async function(images, prompt, schema) {
  const key = (typeof Materials !== 'undefined' && Materials._geminiKey) ? Materials._geminiKey() : '';
  const model = (typeof Materials !== 'undefined' && Materials._geminiModel) ? Materials._geminiModel() : 'gemini-flash-latest';
  if (!key) throw new Error('未設定 Gemini 金鑰');
  const imgParts = images.map(u => { const s = String(u); const mt = (s.match(/^data:([^;]+)/) || [])[1] || 'image/png'; return { inlineData: { mimeType: mt, data: s.split(',')[1] || '' } }; });
  const body = { contents: [{ parts: [{ text: prompt }, ...imgParts] }], generationConfig: { responseMimeType: 'application/json', responseSchema: schema, temperature: 0, maxOutputTokens: 8192 } };
  if (/flash/i.test(model) && !/2\.0/.test(model)) body.generationConfig.thinkingConfig = { thinkingBudget: 0 };   // flash 關 thinking 加速
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key);
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error('Gemini ' + res.status + '：' + (await res.text()).slice(0, 300));
  const j = await res.json(), cand = (j.candidates || [])[0] || {}, parts = (cand.content || {}).parts || [];
  const txt = parts.map(p => p.text || '').join('');
  if (!txt) throw new Error('Gemini 回傳空內容' + (cand.finishReason ? '（' + cand.finishReason + '）' : ''));
  let out; try { out = JSON.parse(txt); } catch (e) { throw new Error('Gemini 回傳非 JSON：' + String(txt).slice(0, 200)); }
  return out || {};
};

// ─── Tooltip(data-tip 事件委派):全站單例 DOM,文案格式「標題|內文|內文…」 ───
// CSS 見 style.css .pm-tooltip;掛載於 DOMContentLoaded(initTooltip() 一行)
// 全站不用原生 title 浮框（OS 方框·CSS 管不到圓角/底色·且巢狀時會與 styled 浮卡「雙浮卡並存、內容不同」）——
// 一律把 title 轉成 data-tip（換行 \n → |），原生 title 一律拔除，改走圓角 styled 浮卡；aria-label 保無障礙報讀。
function stripNativeTitles(root) {
  if (!root || root.nodeType !== 1) return;
  const els = [];
  if (root.hasAttribute('title')) els.push(root);
  if (root.querySelectorAll) root.querySelectorAll('[title]').forEach(e => els.push(e));
  els.forEach(el => {
    const t = el.getAttribute('title');
    el.removeAttribute('title');                       // 一律拔掉原生 title（殺 OS 方框；巢狀祖先也一併拔，杜絕雙浮卡）
    if (t == null || !t.trim()) return;                // 空 title：拔掉即可，不轉
    if (!el.hasAttribute('data-tip'))                  // 已有 data-tip 不覆蓋
      el.setAttribute('data-tip', t.split('\n').map(s => s.trim()).filter(Boolean).join('|'));
    if (!el.getAttribute('aria-label'))                // 保無障礙（螢幕報讀讀 aria-label）
      el.setAttribute('aria-label', t.replace(/\s*\n\s*/g, ' ').trim());
  });
}

// CSS 見 style.css .pm-tooltip;掛載於 DOMContentLoaded(initTooltip() 一行)
function initTooltip() {
  const DELAY = 150, GAP = 8, PAD = 8;
  let el = null, timer = null, current = null;

  // 起手掃一次＋MutationObserver 續掃：renders 用 innerHTML 重建 DOM，新出現的 title 立即轉 data-tip
  stripNativeTitles(document.body);
  new MutationObserver(muts => {
    for (const m of muts) {
      m.addedNodes.forEach(n => stripNativeTitles(n));
      if (m.type === 'attributes' && m.target) stripNativeTitles(m.target);   // 動態 el.title=... 也接住（移除 title 不會再觸發，無迴圈）
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['title'] });

  const show = (target) => {
    if (!el) {   // 單例:全站共用一個 DOM,首次才建
      el = document.createElement('div');
      el.className = 'pm-tooltip';
      document.body.appendChild(el);
    }
    // 側欄專案健康度＝結構化浮卡（狀態燈＋標題／分隔線／冒號對齊·數值局部著色）；其餘全站走純文字兩段
    if (target.getAttribute('data-hmode') === 'health') {
      const stat = target.getAttribute('data-hstat') || 'none';
      const statLabel = stat === 'safe' ? '安全' : stat === 'warn' ? '警告' : stat === 'over' ? '逾期' : '待評估';
      const plan = target.getAttribute('data-hplan') || '';
      const act = target.getAttribute('data-hact') || '';
      const note = target.getAttribute('data-hnote') || '';
      const todo = target.getAttribute('data-htodo') || '0';
      const collapsed = target.getAttribute('data-hcol') === '1';
      const name = target.getAttribute('data-hname') || '';
      el.className = 'pm-tooltip pm-tt-health h-' + stat;
      const head = collapsed
        ? `<div class="tth-name">${U.esc(name)}</div><div class="tth-sub"><span class="tth-dot"></span>專案健康度：${statLabel}</div>`
        : `<div class="tth-title"><span class="tth-dot"></span>專案健康度：${statLabel}</div>`;
      const rows = (plan !== '' && act !== '')
        ? `<span class="tth-k">預計進度：</span><span class="tth-v tth-v-pred">${U.esc(plan)}%</span>`
          + `<span class="tth-k">實際進度：</span><span class="tth-v tth-v-act">${U.esc(act)}%</span>`
          + `<span class="tth-note">${U.esc(note)}</span>`
          + `<span class="tth-k">未完任務：</span><span class="tth-v tth-v-task">${U.esc(todo)} 項</span>`
        : `<span class="tth-note">${U.esc(note)}</span>`
          + `<span class="tth-k">未完任務：</span><span class="tth-v tth-v-task">${U.esc(todo)} 項</span>`;
      el.innerHTML = head + `<hr class="tth-hr"><div class="tth-data">${rows}</div>`;
    } else {
      const raw = target.getAttribute('data-tip');
      if (!raw) return;
      el.className = 'pm-tooltip';   // 復位（可能上一個是 health 變體）
      const parts = raw.split('|').map(s => s.trim()).filter(Boolean);
      const title = parts.shift() || '';
      el.innerHTML = `<div class="pm-tooltip-title">${U.esc(title)}</div>${
        parts.length ? `<div class="pm-tooltip-body">${U.esc(parts.join('\n'))}</div>` : ''}`;
    }
    const r = target.getBoundingClientRect();
    if (el.classList.contains('pm-tt-health')) {
      // 側欄健康度：往右展開到主工作區空曠處（不遮下方其他專案列）·垂直對齊該列中央·左緣小箭頭
      const OFF = 10;
      el.classList.remove('tt-flip');
      let left = r.right + OFF;
      if (left + el.offsetWidth > window.innerWidth - PAD) { left = r.left - el.offsetWidth - OFF; el.classList.add('tt-flip'); }   // 右側無空間才翻左（側欄極窄·罕見）
      let top = r.top + r.height / 2 - el.offsetHeight / 2;
      top = Math.max(PAD, Math.min(top, window.innerHeight - el.offsetHeight - PAD));
      el.style.top = top + 'px';
      el.style.left = left + 'px';
    } else {
      // 其餘全站：預設正上方,頂到天花板翻下方;左右夾在 viewport 內(fixed 用 viewport 座標)
      let top = r.top - el.offsetHeight - GAP;
      if (top < PAD) top = r.bottom + GAP;
      let left = r.left + r.width / 2 - el.offsetWidth / 2;
      left = Math.max(PAD, Math.min(left, window.innerWidth - el.offsetWidth - PAD));
      el.style.top = top + 'px';
      el.style.left = left + 'px';
    }
    el.classList.add('show');
  };

  const hide = () => {
    clearTimeout(timer); timer = null; current = null;
    if (el) el.classList.remove('show');
  };

  document.addEventListener('mouseover', e => {
    const target = e.target.closest('[data-tip]');
    if (!target) return;
    if (target === current) return;   // 同目標內子元素間移動,不重啟計時
    hide();
    current = target;
    timer = setTimeout(() => show(target), DELAY);
  });
  document.addEventListener('mouseout', e => {
    const target = e.target.closest('[data-tip]');
    if (!target) return;
    if (e.relatedTarget && target.contains(e.relatedTarget)) return;   // 還在目標內,不收
    hide();
  });
  // 保險:點擊或任何容器捲動(capture)都收掉,避免殘影跟錯位
  document.addEventListener('click', hide);
  window.addEventListener('scroll', hide, true);
}

// ═══════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  App.init();
  // 套用品牌/標籤（讀 CFG：本機顯真值、模板顯中性值）
  const _appName = CFG('APP_NAME', 'PM-Core');
  document.title = _appName;
  document.querySelectorAll('.js-brand-name').forEach(el => el.textContent = _appName);
  const _wbsLabel = CFG('WBS_LABEL', 'WBS');
  document.querySelectorAll('.js-wbs-label').forEach(el => el.textContent = _wbsLabel);
  // ESC closes modal
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') App.closeModal();
  });
  initTooltip();
});
