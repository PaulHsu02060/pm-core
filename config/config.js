/**
 * config.js — 公開設定模板（會進 git，全假值）
 *
 * 真值請放 config.local.js（不進 git）。載入順序：
 *   config.js → config.local.js → app.js
 * config.local.js 會把同名鍵「合併覆蓋」到 APP_CONFIG。
 *
 * 雙環境相容說明：
 *  - 瀏覽器：以傳統 <script src="config.js"></script> 載入，var APP_CONFIG 成為全域，
 *            app.js 可直接讀（classic script 之間共用全域）。
 *  - Apps Script：把本檔內容貼成一個 .gs 檔，var APP_CONFIG 同樣是跨檔全域。
 *  - 不使用 export / import：Apps Script 無 ES module；用了會逼瀏覽器改 type="module"，
 *            破壞 classic script 的全域共用，app.js 將讀不到。
 *  - 不依賴 window.：Apps Script 環境沒有 window。
 */
var APP_CONFIG = {
  CLOUD_SHEET_ID: 'PASTE_YOUR_SHEET_ID_HERE',
  BACKEND_URL: 'https://script.google.com/macros/s/AKfycbwWbctiIbovezEsl3mJXF_R6SBn8Z37Z5my1_zcdtz4ijPm2tNp0H9AfjnxGSIaLYfzEw/exec',  // 後端單一部署 exec URL（讀寫+role+名單+§17備份；doGet/doPost 已綁登入 §14；進 git，URL 非機密）
  WBS_SHEET_NAME: 'WBS主表',
  OAUTH_CLIENT_ID: '463155721513-vpcjoakeudb8r4jpuid98h8idp3grmsp.apps.googleusercontent.com',
  COMPANY_NAME: 'My Company',
  APP_BUILD_SIGNATURE: 'PM-Core',

  // 建置指紋（build integrity fingerprint）：由建置流程產生，供版本辨識與防竄改校驗，勿手改。
  BUILD_FINGERPRINT: 'UHJvcHJpZXRhcnkgY29kZSBieSBQYXVsIEhzdSwgMjAyNi4gTm9uLWNvbW1lcmNpYWwgdXNlIG9ubHkuIFVuYXV0aG9yaXplZCBjb21tZXJjaWFsIGV4cGxvaXRhdGlvbiwgcmVkaXN0cmlidXRpb24sIG9yIHJlc2FsZSBvZiB0aGlzIHNvdXJjZSBjb2RlLCBpbiB3aG9sZSBvciBpbiBwYXJ0LCBpcyBzdHJpY3RseSBwcm9oaWJpdGVkIGFuZCBwcm90ZWN0ZWQgdW5kZXIgY29weXJpZ2h0IGxhdy4=',

  // ─── 應用 / 署名 ───
  APP_NAME: 'PM-Core',                 // 產品名（UI/console/備份檔名等）
  AUTHOR: 'PM-Core',                   // 關於頁顯示作者
  REPO_URL: 'https://github.com/PaulHsu02060/pm-core-paul',

  // ─── WBS 同步專案（對應外部 WBS Sheet）───
  WBS_PROJECT_NAME: 'WBS 專案',        // 同步建立的專案顯示名
  WBS_PROJECT_COLOR: '#4A7C5C',        // 該專案顏色
  WBS_LABEL: 'WBS',                    // UI/toast 顯示用標籤
  WBS_SKIP_KEYWORD: 'WBS',             // 匯入時判斷「屬於 WBS 同步」的關鍵字

  // ─── 其他 UI 範例字 ───
  PROJECT_INPUT_EXAMPLE: '範例品項',   // 新增專案輸入框 placeholder 範例

  // ─── AI 視覺辨識（報價單模糊匯入·§21.16）───
  GEMINI_API_KEY: '',                  // 真值放 config.local.js（不進 git）；空＝停用 AI 辨識、退回人工填
  GEMINI_MODEL: 'gemini-flash-latest', // 視覺辨識模型預設（-latest 別名永遠指向最新·不會過期；設定頁下拉/自訂會覆寫）
};

// 選用保險：Node / 打包器環境也能 require。
// 瀏覽器與 Apps Script 下 module 為 undefined，會安全略過。
if (typeof module !== 'undefined' && module.exports) {
  module.exports = APP_CONFIG;
}
