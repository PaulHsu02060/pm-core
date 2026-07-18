// transcripts.js — §27 會議逐字稿（Meeting Transcript）。app.js 之後載入。
//   定位＝檔案櫃＋規則式整理器（非 AI·不接任何 AI API·§27.0）：逐字稿歸檔（專案自動分組＋手動資料夾 3 層）
//   ＋規則式重點整理（日期/決議/待辦關鍵字＋名冊比對→候選表格）＋TSV 複製貼 Excel＋狀態自動流轉（§27.7）。
//   domain＝DATA.transcripts（{id,title,date,project,folderId,transcript,minutes:{table,text},status,createdAt,updatedAt}）
//   ＋DATA.folders（{id,name,parentId,depth}·巢狀最多 3 層 甲＞乙＞丙）。資料觸點在 app.js（比照 reportTemplates·§27.2）。
//   第二層 Whisper 線上版（Prod）另批施工；此檔僅留鎖定入口（🎙 鈕恆鎖＋說明）。Mockup v5 定版（§27）。
(function () {
  'use strict';

  // ── Home 工具卡自我註冊（§25 NAV_MODULES 單一真實來源·rule10·新模組一行自動長進 Home）──
  App.registerModule({
    id: 'transcripts', page: 'transcripts', cat: 'tools', title: '會議逐字稿', icon: 'ti-microphone',
    desc: '會議錄音轉出的逐字稿存這裡：自動依專案歸檔，一鍵整理成可貼 Excel 的會議紀錄草稿。',
    badge: () => { const n = (DATA.transcripts || []).length; return n ? n + ' 筆' : ''; },
  });

  // ── 小工具 ──
  const trAll = () => DATA.transcripts || [];
  const trFolders = () => DATA.folders || [];
  const trFind = id => trAll().find(t => t && t.id === id);
  const fmtN = n => (n || 0).toLocaleString('zh-Hant');
  const byDateDesc = (a, b) => String(b.date || '').localeCompare(String(a.date || ''));
  const TR_ST = { wait: '待整理', draft: '已生成草稿', done: '已完成' };
  const ST_ORDER = ['未開始', '進行中', '暫緩', '已完成'];
  const ST_CLS = { '未開始': 'no', '進行中': 'go', '暫緩': 'hold', '已完成': 'done' };

  // 目前彈窗中的紀錄：已入庫走 store；全新草稿（尚無任何內容）留記憶體，首次有內容才入庫（防幽靈空紀錄）
  function trCurRec() { return trFind(App._trCur) || (App._trDraft && App._trDraft.id === App._trCur ? App._trDraft : null); }
  function trEnsureStored(rec) { if (!trFind(rec.id)) Store.transcripts.add(rec); }

  // ── §27.7 狀態自動流轉（單一真實來源）：貼了/改了會議紀錄→done；表格有內容→draft；其餘→wait ──
  function trCalcStatus(rec) {
    const mm = rec.minutes || {};
    if (String(mm.text || '').trim() || rec.minutesTouched) return 'done';
    const hasTable = (mm.table || []).some(r => ((r.task || '') + (r.owner || '') + (r.due || '')).trim());
    return hasTable ? 'draft' : 'wait';
  }
  function trSave(rec) {
    rec.status = trCalcStatus(rec);
    rec.updatedAt = new Date().toISOString();
    if (trFind(rec.id)) Store.transcripts.save();
    trListRefresh();
  }
  let _trT = null;
  function trSaveDebounced(rec) {
    const ind = document.getElementById('tr-save'); if (ind) ind.textContent = '…儲存中';
    clearTimeout(_trT);
    _trT = setTimeout(() => { trSave(rec); const el = document.getElementById('tr-save'); if (el) el.textContent = '✓ 已自動儲存'; }, 500);
  }
  // 清單頁若在背景（彈窗開著）也同步刷新，關彈窗即是最新
  function trListRefresh() {
    const el = document.getElementById('tr-list');
    if (el && App.currentPage === 'transcripts') el.innerHTML = trListHtml();
  }

  // ══════════ 清單頁（§27.3）══════════
  App.renderTranscripts = function () {
    const el = document.getElementById('page-transcripts'); if (!el) return;
    el.innerHTML = `<div class="tr-wrap">
      <div class="tr-head">
        <div class="tr-hico">🎙</div>
        <div><h1>會議逐字稿</h1><p class="tr-hdesc">依專案自動歸檔＋自建資料夾整理；搜尋、檢視、整理成會議紀錄</p></div>
      </div>
      <div class="tr-toolbar">
        <div class="tr-search"><input id="tr-q" placeholder="搜尋標題或內容…" value="${U.esc(App._trQ || '')}" oninput="App._trSetQ(this.value)"></div>
        <select class="tr-sel tr-viewsel" onchange="App._trSetView(this.value)">
          <option value="group"${App._trView !== 'flat' ? ' selected' : ''}>檢視：分組</option>
          <option value="flat"${App._trView === 'flat' ? ' selected' : ''}>檢視：平鋪（依日期）</option>
        </select>
        <button class="tb-action ghost" onclick="App._trNewFolder(null)">📁 新增資料夾</button>
        <button class="tb-action" onclick="App._trNew()">＋ 新增逐字稿</button>
      </div>
      <div id="tr-list">${trListHtml()}</div>
    </div>`;
  };
  App._trSetQ = function (v) { App._trQ = v; trListRefresh(); };
  App._trSetView = function (v) { App._trView = v; trListRefresh(); };

  function trListHtml() {
    const q = String(App._trQ || '').trim().toLowerCase();
    const match = t => !q || [t.title, t.transcript, (t.minutes && t.minutes.text) || ''].some(s => String(s || '').toLowerCase().includes(q));
    const items = trAll().filter(match);

    // 空狀態才顯示大張新增引導（§27.3）；有自建資料夾仍列出
    if (!trAll().length) {
      return trEmptyHtml() + (trFolders().length ? trFolderSection({}, false) : '');
    }
    // 平鋪（依日期）
    if (App._trView === 'flat') {
      const sorted = items.slice().sort(byDateDesc);
      return sorted.length ? `<div class="tr-gbody tr-flat">${sorted.map(trCardHtml).join('')}</div>`
        : `<div class="tr-nohit">找不到符合「${U.esc(App._trQ || '')}」的逐字稿。</div>`;
    }
    // 分組：依專案（有 project 且查得到）→ 手動資料夾 → 未歸類
    const byProj = {}, byFolder = {}, loose = [];
    items.forEach(t => {
      const p = t.project ? App.getProj(t.project) : null;
      if (p) (byProj[p.id] || (byProj[p.id] = [])).push(t);
      else if (t.folderId && trFolders().some(f => f.id === t.folderId)) (byFolder[t.folderId] || (byFolder[t.folderId] = [])).push(t);
      else loose.push(t);
    });
    const projs = (DATA.projects || []).filter(p => byProj[p.id]);
    const ordered = [...projs.filter(p => !p.ecnType), ...projs.filter(p => p.ecnType)];   // NPI 先·ECN 後（比照側欄）
    const projGrp = p => {
      const its = byProj[p.id].slice().sort(byDateDesc);
      return `<details class="tr-grp" open><summary><span class="tr-caret">▶</span><span class="tr-fico">📁</span><span class="tr-gname">${U.esc(p.name)}</span><span class="tr-tag ${p.ecnType ? 'tr-tag-ecn' : 'tr-tag-npi'}">${p.ecnType ? 'ECN' : 'NPI'}</span><span class="tr-cnt">${its.length} 筆</span></summary><div class="tr-gbody">${its.map(trCardHtml).join('')}</div></details>`;
    };
    let html = `<div class="tr-treehead">依專案（自動歸檔）</div>`;
    html += ordered.length ? ordered.map(projGrp).join('')
      : `<div class="tr-secempty">（逐字稿在編輯視窗掛上專案後，會自動歸到這裡）</div>`;
    html += trFolderSection(byFolder, !!q);
    if (loose.length) {
      const its = loose.slice().sort(byDateDesc);
      html += `<details class="tr-grp" open><summary><span class="tr-caret">▶</span><span class="tr-fico">📂</span><span class="tr-gname">未歸類</span><span class="tr-tag tr-tag-none">待整理歸檔</span><span class="tr-cnt">${its.length} 筆</span></summary><div class="tr-gbody">${its.map(trCardHtml).join('')}</div></details>`;
    }
    if (q && !ordered.length && !loose.length && !Object.keys(byFolder).length) {
      html += `<div class="tr-nohit">找不到符合「${U.esc(App._trQ || '')}」的逐字稿。</div>`;
    }
    return html;
  }
  function trEmptyHtml() {
    return `<div class="tr-empty" onclick="App._trNew()">
      <div class="tr-plus">＋</div><div class="tr-empty-t">新增第一份逐字稿</div>
      <div class="tr-empty-h">把會議錄音轉出的 .txt 匯入（或直接貼上），系統幫你歸檔＋整理成會議紀錄草稿</div>
    </div>`;
  }
  function trFolderSection(byFolder, searching) {
    const roots = trFolders().filter(f => !f.parentId);
    let html = `<div class="tr-treehead">手動資料夾（可自建·最多 3 層）</div>`;
    if (!roots.length) return html + `<div class="tr-secempty">（還沒有自建資料夾——右上「📁 新增資料夾」建立第一個）</div>`;
    const body = roots.map(f => trFolderHtml(f, byFolder, searching)).join('');
    return html + (body || `<div class="tr-secempty">（資料夾裡沒有符合搜尋的逐字稿）</div>`);
  }
  function trFolderDeep(fid, byFolder) {
    const own = (byFolder[fid] || []).length;
    return own + trFolders().filter(x => x.parentId === fid).reduce((s, k) => s + trFolderDeep(k.id, byFolder), 0);
  }
  function trFolderEmptyDeep(fid) {   // 刪除判定用「未過濾」實際內容
    if (trAll().some(t => t.folderId === fid)) return false;
    return trFolders().filter(x => x.parentId === fid).every(k => trFolderEmptyDeep(k.id));
  }
  function trFolderHtml(f, byFolder, searching) {
    const kids = trFolders().filter(x => x.parentId === f.id);
    const own = (byFolder[f.id] || []).slice().sort(byDateDesc);
    const deep = trFolderDeep(f.id, byFolder);
    if (searching && !deep) return '';   // 搜尋時整棵無命中→整夾隱藏
    const del = trFolderEmptyDeep(f.id)
      ? `<button class="tr-fdel" onclick="event.preventDefault();event.stopPropagation();App._trDelFolder('${f.id}')" title="刪除空資料夾">🗑</button>` : '';
    const kidsHtml = kids.map(k => trFolderHtml(k, byFolder, searching)).join('');
    return `<details class="tr-grp${f.depth > 1 ? ' tr-sub' : ''}" open>
      <summary><span class="tr-caret">▶</span><span class="tr-fico">📁</span><span class="tr-gname">${U.esc(f.name)}</span><span class="tr-cnt">${deep} 筆</span>${del}</summary>
      ${kidsHtml ? `<div class="tr-nest">${kidsHtml}</div>` : ''}
      ${own.length ? `<div class="tr-gbody">${own.map(trCardHtml).join('')}</div>` : ''}
      ${f.depth < 3 ? `<button class="tr-mkdir" onclick="App._trNewFolder('${f.id}')">＋ 在此新增子資料夾</button>` : ''}
    </details>`;
  }
  function trCardHtml(t) {
    const st = TR_ST[t.status] ? t.status : 'wait';
    const prev = String(t.transcript || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    const hasProj = !!(t.project && App.getProj(t.project));
    const moveLabel = t.folderId ? '↪ 移動' : '↪ 移動到資料夾';
    return `<div class="tr-card">
      <div class="tr-ctop"><h3 class="tr-ctitle">${U.esc(t.title || '未命名會議')}</h3><span class="tr-cdate">${U.esc(t.date || '')}</span></div>
      <p class="tr-cprev">${prev ? U.esc(prev) + '…' : '（還沒有逐字稿內容）'}</p>
      <div class="tr-chips"><span class="tr-st tr-st-${st}">${TR_ST[st]}</span><span class="tr-cmeta">· ${fmtN(String(t.transcript || '').length)} 字</span></div>
      <div class="tr-cacts">
        <button class="tr-ico" onclick="App._trCopy('${t.id}')">📋 複製</button>
        <button class="tr-ico" onclick="App._trOpen('${t.id}')">✎ 檢視/編輯</button>
        ${hasProj ? '' : `<button class="tr-ico tr-move" onclick="App._trMove('${t.id}')">${moveLabel}</button>`}
        <button class="tr-ico tr-del" onclick="App._trDel('${t.id}')">🗑</button>
      </div>
    </div>`;
  }

  // ── 卡片動作 ──
  App._trCopy = function (id) {
    const rec = trFind(id); if (!rec) return;
    if (!String(rec.transcript || '').trim()) return U.toast('這筆還沒有逐字稿內容', 'warning');
    U.copy(rec.transcript, '✓ 已複製逐字稿全文（' + fmtN(rec.transcript.length) + ' 字）', '複製失敗，請開啟後手動選取');
  };
  App._trDel = function (id) {
    const rec = trFind(id); if (!rec) return;
    App.confirmModal({ title: '刪除逐字稿', msg: `「${U.esc(rec.title || '未命名會議')}」會連同右側會議紀錄一起刪除，救不回來。確定刪除？`, okText: '刪除', okClass: 'danger',
      onConfirm: () => { Store.transcripts.remove(id); trListRefresh(); U.toast('已刪除'); } });
  };
  App._trMove = function (id) {
    const rec = trFind(id); if (!rec) return;
    const opts = [`<option value=""${!rec.folderId ? ' selected' : ''}>（未歸類）</option>`];
    const walk = (pid, depth) => trFolders().filter(f => (f.parentId || null) === pid).forEach(f => {
      opts.push(`<option value="${f.id}"${rec.folderId === f.id ? ' selected' : ''}>${'　'.repeat(depth)}📁 ${U.esc(f.name)}</option>`);
      walk(f.id, depth + 1);
    });
    walk(null, 0);
    if (opts.length === 1) return App.confirmModal({ title: '還沒有資料夾', msg: '先用右上「📁 新增資料夾」建一個，再把逐字稿搬進去。', okText: '知道了', cancelText: null });
    App.openModal({
      title: '↪ 移動到資料夾',
      body: `<div class="tr-field"><label>把「${U.esc(rec.title || '未命名會議')}」放到</label><select id="tr-move-sel" class="tr-sel">${opts.join('')}</select></div>`,
      footer: `<button class="tb-action ghost" onclick="App.closeModal()">取消</button><button class="tb-action" onclick="App._trDoMove('${id}')">移動</button>`,
    });
  };
  App._trDoMove = function (id) {
    const rec = trFind(id); const sel = document.getElementById('tr-move-sel');
    if (rec && sel) { rec.folderId = sel.value || null; Store.transcripts.save(); }
    App.closeModal(); trListRefresh(); U.toast('已移動');
  };
  App._trNewFolder = function (parentId) {
    const parent = parentId ? trFolders().find(f => f.id === parentId) : null;
    if (parent && parent.depth >= 3) return U.toast('最多三層（甲＞乙＞丙），這層不能再建子資料夾', 'warning');
    App.promptModal({ title: parent ? `在「${U.esc(parent.name)}」下新增子資料夾` : '新增資料夾', label: '資料夾名稱', rows: 1, okText: '建立',
      onSubmit: v => {
        const name = String(v || '').trim(); if (!name) return;
        Store.folders.add({ id: U.id(), name, parentId: parent ? parent.id : null, depth: parent ? parent.depth + 1 : 1 });
        trListRefresh(); U.toast('已建立資料夾「' + name + '」');
      } });
  };
  App._trDelFolder = function (id) {
    const f = trFolders().find(x => x.id === id); if (!f) return;
    if (!trFolderEmptyDeep(id)) return App.confirmModal({ title: '資料夾還有東西', msg: `「${U.esc(f.name)}」（或它的子資料夾）裡還有逐字稿，先把它們搬走再刪。`, okText: '知道了', cancelText: null });
    App.confirmModal({ title: '刪除資料夾', msg: `刪除空資料夾「${U.esc(f.name)}」（含其下空的子資料夾）？`, okText: '刪除', okClass: 'danger',
      onConfirm: () => {
        const rm = fid => { trFolders().filter(x => x.parentId === fid).forEach(k => rm(k.id)); DATA.folders = trFolders().filter(x => x.id !== fid); };
        rm(id); Store.folders.save(); trListRefresh(); U.toast('已刪除');
      } });
  };

  // ══════════ 檢視／編輯彈窗（§27.4·XL 左右分欄）══════════
  App._trNew = function () {
    const now = new Date().toISOString();
    const rec = { id: U.id(), title: '', date: D.fmt(D.today(), 'iso'), project: null, folderId: null,
      transcript: '', minutes: { table: [], text: '' }, status: 'wait', createdAt: now, updatedAt: now };
    App._trDraft = rec; App._trCur = rec.id; App._trTab = 'table';
    trOpenModal(rec);
  };
  App._trOpen = function (id) {
    const rec = trFind(id); if (!rec) return;
    rec.minutes = rec.minutes || { table: [], text: '' };
    rec.minutes.table = (rec.minutes.table || []).filter(r => ((r.task || '') + (r.owner || '') + (r.due || '')).trim());   // 開檔清幽靈空列
    App._trDraft = null; App._trCur = id; App._trTab = 'table';
    trOpenModal(rec);
  };
  function trOpenModal(rec) {
    App._trSrcOpen = null;   // 每次開檔依字數重算收合預設（§27.9 定案④：<500 展開／≥500 收合）
    App.openModal({
      title: `${U.esc(rec.title || '會議逐字稿')} <span class="tr-mode">離線·手動</span>`,
      body: trModalHtml(rec),
      footer: `<span class="tr-foothint">左右兩邊都可以直接編輯，改了就自動儲存（右側貼了或改了會議紀錄 → 狀態自動變「已完成」）</span>
        <button class="tb-action ghost" onclick="App.closeModal()">關閉</button>`,
    });
  }
  function trModalHtml(rec) {
    const lw = App._trSplit || 32;   // 左欄寬（fr·per-session 記憶·§27.9 定案②）
    return `<div class="tr-2col" style="--tr-cols:${lw}fr 6px ${100 - lw}fr">
      <div class="tr-col-l">${trLeftHtml(rec)}</div>
      <div class="tr-split" onmousedown="App._trSplitStart(event)" title="拖曳調整左右寬度"><span class="tr-split-bar"></span></div>
      <div class="tr-col-r" id="tr-rwrap">${trRightHtml(rec)}</div>
    </div>`;
  }
  function trProjOptions(sel) {
    const live = (DATA.projects || []).filter(p => App._isLiveProject(p));
    const npi = live.filter(p => !p.ecnType), ecn = live.filter(p => p.ecnType);
    const cur = sel && !live.some(p => p.id === sel) ? App.getProj(sel) : null;
    const opt = p => `<option value="${p.id}"${p.id === sel ? ' selected' : ''}>${U.esc(p.name)}</option>`;
    return `<option value=""${!sel ? ' selected' : ''}>— 不指定 —</option>`
      + (npi.length ? `<optgroup label="NPI">${npi.map(opt).join('')}</optgroup>` : '')
      + (ecn.length ? `<optgroup label="ECN">${ecn.map(opt).join('')}</optgroup>` : '')
      + (cur ? `<optgroup label="已結案／封存">${opt(cur)}</optgroup>` : '');
  }
  function trLeftHtml(rec) {
    return `<div class="tr-row2">
        <div class="tr-field"><label>日期</label><input type="date" class="tr-input" value="${U.esc(rec.date || '')}" onchange="App._trField('date', this.value)"></div>
        <div class="tr-field"><label>專案 <span class="tr-opt">（歸檔用）</span></label>
          <select class="tr-sel" onchange="App._trField('project', this.value)">${trProjOptions(rec.project)}</select></div>
      </div>
      <div class="tr-field"><label>標題</label><input class="tr-input" value="${U.esc(rec.title || '')}" placeholder="例：G3 電控可靠度週會" oninput="App._trField('title', this.value)"></div>
      <div class="tr-subt"><span class="tr-n">1</span>逐字稿 <span class="tr-opt">（可直接改）</span></div>
      <div class="tr-pathbar">
        ${trWhisperCfg().url
          ? `<button class="tr-sm ghost" id="tr-recbtn" onclick="App._trRecToggle()" title="按一下開始錄音·再按一下停止並自動轉逐字稿">🎙 錄音</button>
             <button class="tr-sm ghost" id="tr-cloudbtn" onclick="App._trCloudClick()" title="選手機錄好的音檔（.aac/.m4a/.mp3…）自動轉逐字稿">🎵 匯入音檔</button>`
          : `<button class="tr-sm tr-lock" id="tr-cloudbtn" onclick="App._trCloudClick()" title="點一下去設定後端網址就能用">🎙 雲端自動轉譯 <span class="tr-lockpill">需設定</span></button>`}
        <button class="tr-sm ghost" onclick="document.getElementById('tr-file').click()">📄 匯入 .txt</button>
        <span class="tr-info" title="後端在「設定 → 資料與備份 → 會議逐字稿·雲端轉譯後端」設定。離線備援：用 Buzz 把音檔轉 .txt 再匯入或貼上。">i</span>
        <input type="file" id="tr-file" accept=".txt" style="display:none" onchange="App._trOnTxt(this)">
        <input type="file" id="tr-audio" accept="audio/*,.m4a,.mp3,.webm,.wav,.mp4,.ogg,.oga,.flac,.aac" style="display:none" onchange="App._trOnAudio(this)">
        <span id="tr-cloudst" style="font-size:12px;color:var(--ink3)"></span>
      </div>
      ${trSrcCardHtml(rec)}
      <div class="tr-runbar"><button class="tr-sm ghost" onclick="App._trSummarize()">🔎 重點整理 →</button></div>
      <div class="tr-relnote">改逐字稿後按「重點整理」會<b>重生右側的會議紀錄表格</b>（會先提醒、你確認才覆蓋）；反過來，右側改了<b>不會動到逐字稿</b>。</div>`;
  }
  // 來源卡（§27.9 定案①）：逐字稿降級為可收合來源——字數/段數＋3 行淡出預覽；展開＝固定高度內捲＋🔍 搜尋標黃
  function trSrcCardHtml(rec) {
    const txt = String(rec.transcript || '');
    const nchar = txt.length, nseg = trSegsPos(txt).length;
    const open = App._trSrcOpen != null ? App._trSrcOpen : (nchar < 500);   // <500 展開／≥500 收合
    const prev = txt.replace(/\s+/g, ' ').trim().slice(0, 140);
    return `<div class="tr-src${open ? ' open' : ''}" id="tr-src">
        <div class="tr-src-h" onclick="App._trSrcToggle()">
          <span class="tr-src-car">▶</span><span class="tr-src-ttl">📝 逐字稿</span>
          <span class="tr-src-meta">${fmtN(nchar)} 字 · ${nseg} 段</span>
        </div>
        <div class="tr-src-prev">${prev ? U.esc(prev) : '<span class="tr-src-ph">還沒有逐字稿——用上面按鈕匯入，或展開直接貼上。</span>'}</div>
        <div class="tr-src-body">
          <div class="tr-src-tools"><div class="tr-src-qwrap"><input class="tr-src-q" placeholder="搜尋逐字稿…" oninput="App._trSrcSearch(this.value)"></div></div>
          <div class="tr-srcdoc" id="tr-srcdoc" contenteditable="plaintext-only" data-ph="貼上會議逐字稿，或用上面「📄 匯入 .txt」…" oninput="App._trSrcInput(this)">${trSrcDocHtml(txt, '')}</div>
          <div class="tr-src-foot">在這裡直接改字即時儲存 · 內容多時這區自己捲動、不撐開視窗 · 搜尋命中會標黃</div>
        </div>
      </div>`;
  }
  // 逐字稿內文 render：每句段包成 <span data-seg="i">（供跳轉定位）＋搜尋 query 標黃；段間原文（標點/換行）原樣保留，innerText 可還原全文供編輯
  function trSrcDocHtml(text, query) {
    text = String(text || '');
    const segs = trSegsPos(text), q = String(query || '').trim(), ql = q.toLowerCase();
    const mkSeg = s => {
      if (!q) return U.esc(s);
      let out = '', lo = s.toLowerCase(), i = 0, idx;
      while ((idx = lo.indexOf(ql, i)) >= 0) { out += U.esc(s.slice(i, idx)) + '<mark class="tr-mk">' + U.esc(s.slice(idx, idx + q.length)) + '</mark>'; i = idx + q.length; }
      return out + U.esc(s.slice(i));
    };
    let html = '', prev = 0;
    for (let k = 0; k < segs.length; k++) {
      const sg = segs[k];
      if (sg.start > prev) html += U.esc(text.slice(prev, sg.start));
      html += '<span class="tr-seg" data-seg="' + k + '">' + mkSeg(sg.text) + '</span>';
      prev = sg.end;
    }
    if (prev < text.length) html += U.esc(text.slice(prev));
    return html;
  }
  function trRightHtml(rec) {
    const tab = App._trTab === 'text' ? 'text' : 'table';
    const mm = rec.minutes || { table: [], text: '' };
    let body;
    if (tab === 'table') {
      const rows = mm.table || [];
      const cell = (i, k, v, cls) => `<td><span class="tr-cell${cls ? ' ' + cls : ''}" contenteditable data-i="${i}" data-k="${k}" oninput="App._trCell(this)">${U.esc(v || '')}</span></td>`;
      const rowsHtml = rows.map((r, i) =>
        `<tr>${cell(i, 'task', r.task)}${cell(i, 'owner', r.owner)}${cell(i, 'due', r.due, 'tr-num')}<td class="tr-stcell"><button class="tr-stchip tr-stc-${ST_CLS[r.status] || 'no'}" onclick="App._trCycleSt(${i})" title="點擊切換進度">${U.esc(r.status || '未開始')}</button></td><td class="tr-jcell">${r.srcSeg != null ? `<button class="tr-jump" onclick="App._trJump(${r.srcSeg})" title="跳到逐字稿出處並高亮">↖ 原文</button>` : ''}</td></tr>`).join('');
      body = `<div class="tr-rtop"><span class="tr-rtip">點任一格即可改，Tab 跳下一格</span>
          <button class="tr-sm ghost" onclick="App._trAddRow()">＋ 加一列</button>
          <button class="tr-sm ghost" onclick="App._trCopyTable()">📋 複製表格</button></div>
        <table class="tr-tbl" onkeydown="App._trCellKey(event)">
          <thead><tr><th>待辦事項</th><th>負責人</th><th>預期完成日</th><th>進度</th><th class="tr-jth"></th></tr></thead>
          <tbody>${rowsHtml || `<tr><td colspan="5" class="tr-tbl-empty">還沒有內容——按左邊「🔎 重點整理」生成候選，或點「＋ 加一列」自己填。</td></tr>`}</tbody>
        </table>
        <div class="tr-editnote">系統規則式抽的候選（<b>非 AI·可能不準</b>）——格子隨時可改（右上淡淡 ✎ 表示可編輯），改完自動存。點欄位旁的「<b>↖ 原文</b>」，左側會自動跳轉並高亮對應的會議發言。「複製表格」以 TSV 貼 Excel 零跑格；要更漂亮，把左邊逐字稿丟 Claude chat 精修，再貼回「純文字」頁。</div>`;
    } else {
      body = `<textarea class="tr-free" rows="14" placeholder="貼上 Claude 精修後的會議紀錄，或直接在這裡自己寫…" oninput="App._trText(this.value)">${U.esc(mm.text || '')}</textarea>
        <div class="tr-editnote">這頁＝定稿用的純文字會議紀錄；貼了內容，狀態就自動變「已完成」。</div>`;
    }
    return `<div class="tr-rhead">
        <span class="tr-rtitle">📋 會議紀錄</span>
        <span class="tr-editchip">✎ 可直接編輯</span>
        <span class="tr-saveind" id="tr-save">✓ 已自動儲存</span>
        <div class="tr-tabs">
          <button class="tr-tab${tab === 'table' ? ' active' : ''}" onclick="App._trSwitchTab('table')">表格</button>
          <button class="tr-tab${tab === 'text' ? ' active' : ''}" onclick="App._trSwitchTab('text')">純文字</button>
        </div></div>
      <div class="tr-rbody">${body}</div>`;
  }
  function trRepaintRight() {
    const el = document.getElementById('tr-rwrap'); const rec = trCurRec();
    if (el && rec) el.innerHTML = trRightHtml(rec);
  }

  // ── 彈窗互動 ──
  App._trField = function (field, val) {
    const rec = trCurRec(); if (!rec) return;
    if (field === 'project') rec.project = val || null;
    else rec[field] = val;
    trEnsureStored(rec); trSaveDebounced(rec);
  };
  App._trSwitchTab = function (t) { App._trTab = t; trRepaintRight(); };
  // ── 來源卡：收合／編輯／搜尋／跳轉（§27.9 定案①③）──
  App._trSrcToggle = function () {
    const c = document.getElementById('tr-src'); if (!c) return;
    App._trSrcOpen = !c.classList.contains('open');
    c.classList.toggle('open', App._trSrcOpen);
  };
  App._trSrcInput = function (el) {   // 直接改逐字稿即時儲存（不重繪·保留游標；段落錨點重繪留給搜尋/重開）
    const rec = trCurRec(); if (!rec) return;
    rec.transcript = el.innerText;
    trEnsureStored(rec); trSaveDebounced(rec);
  };
  App._trSrcSearch = function (q) {
    const doc = document.getElementById('tr-srcdoc'); if (!doc) return;
    doc.innerHTML = trSrcDocHtml(doc.innerText, q);   // 以當前內文（含手改）重繪＋標黃
    const first = doc.querySelector('.tr-mk'); if (first) trScrollDocTo(first);
  };
  function trScrollDocTo(el) {
    const doc = document.getElementById('tr-srcdoc'); if (!doc || !el) return;
    doc.scrollTo({ top: Math.max(0, el.offsetTop - doc.clientHeight / 2 + el.offsetHeight / 2), behavior: 'smooth' });
  }
  App._trJump = function (i) {   // ↖ 原文：展開來源卡→捲到該句段→閃兩下淡黃
    const c = document.getElementById('tr-src');
    if (c && !c.classList.contains('open')) { c.classList.add('open'); App._trSrcOpen = true; }
    const doc = document.getElementById('tr-srcdoc'); if (!doc) return;
    const seg = doc.querySelector('[data-seg="' + i + '"]');
    if (!seg) return U.toast('原文已改動，找不到對應段落', 'warning');
    void doc.offsetHeight;   // 剛展開時 display:none→block，強制 layout 後才捲得動（不靠 rAF·背景分頁也可靠）
    trScrollDocTo(seg);
    seg.classList.remove('tr-flash'); void seg.offsetWidth; seg.classList.add('tr-flash');
  };
  App._trSplitStart = function (e) {   // 拖曳分割線調整左右寬（§27.9 定案②·per-session）
    const cols = document.querySelector('.tr-2col'); if (!cols) return;
    const rect = cols.getBoundingClientRect();
    const move = ev => {
      let l = (ev.clientX - rect.left) / rect.width * 100;
      App._trSplit = Math.max(22, Math.min(72, Math.round(l)));
      cols.style.setProperty('--tr-cols', App._trSplit + 'fr 6px ' + (100 - App._trSplit) + 'fr');
    };
    const up = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', up); document.body.classList.remove('tr-dragging'); };
    document.addEventListener('mousemove', move); document.addEventListener('mouseup', up);
    document.body.classList.add('tr-dragging'); e.preventDefault();
  };
  App._trText = function (v) {
    const rec = trCurRec(); if (!rec) return;
    rec.minutes = rec.minutes || { table: [], text: '' };
    rec.minutes.text = v;
    trEnsureStored(rec); trSaveDebounced(rec);
  };
  App._trCell = function (el) {
    const rec = trCurRec(); if (!rec) return;
    const i = +el.getAttribute('data-i'), k = el.getAttribute('data-k');
    const row = rec.minutes && rec.minutes.table && rec.minutes.table[i]; if (!row) return;
    row[k] = el.textContent;
    rec.minutesTouched = true;   // §27.7 手動改表格 → 已完成
    trEnsureStored(rec); trSaveDebounced(rec);
  };
  App._trCellKey = function (e) {   // Tab 跳下一格（Shift+Tab 回上一格）；到頭到尾交還瀏覽器預設
    if (e.key !== 'Tab') return;
    const cur = e.target && e.target.closest ? e.target.closest('.tr-cell') : null; if (!cur) return;
    const cells = Array.prototype.slice.call(document.querySelectorAll('#modal .tr-cell'));
    const i = cells.indexOf(cur); if (i < 0) return;
    const nxt = cells[i + (e.shiftKey ? -1 : 1)]; if (!nxt) return;
    e.preventDefault(); nxt.focus();
    const r = document.createRange(); r.selectNodeContents(nxt);
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
  };
  App._trCycleSt = function (i) {
    const rec = trCurRec(); if (!rec) return;
    const row = rec.minutes && rec.minutes.table && rec.minutes.table[i]; if (!row) return;
    row.status = ST_ORDER[(ST_ORDER.indexOf(row.status) + 1 + ST_ORDER.length) % ST_ORDER.length];
    rec.minutesTouched = true;
    trEnsureStored(rec); trSave(rec); trRepaintRight();
  };
  App._trAddRow = function () {
    const rec = trCurRec(); if (!rec) return;
    rec.minutes = rec.minutes || { table: [], text: '' };
    (rec.minutes.table = rec.minutes.table || []).push({ task: '', owner: '', due: '', status: '未開始' });
    trRepaintRight();
  };
  App._trCopyTable = function () {
    const rec = trCurRec(); if (!rec) return;
    const rows = ((rec.minutes && rec.minutes.table) || []).filter(r => ((r.task || '') + (r.owner || '') + (r.due || '')).trim());
    if (!rows.length) return U.toast('表格還是空的，先按「重點整理」或自己填', 'warning');
    const clean = v => String(v || '').replace(/[\t\r\n]+/g, ' ').trim();
    const tsv = ['待辦事項\t負責人\t預期完成日\t進度',
      ...rows.map(r => [clean(r.task), clean(r.owner), clean(r.due), clean(r.status || '未開始')].join('\t'))].join('\n');
    U.copy(tsv, '✓ 已複製表格（TSV，貼進 Excel 不跑格）', '複製失敗，請直接框選表格複製');
  };
  App._trOnTxt = function (input) {
    const f = input.files && input.files[0]; input.value = '';
    if (!f) return;
    if (!/\.txt$/i.test(f.name)) return App.confirmModal({ title: '格式不支援', msg: '這裡只吃純文字 .txt（用 Buzz 等工具把錄音轉成 .txt 再匯入）。', okText: '知道了', cancelText: null });
    const rd = new FileReader();
    rd.onload = e => {
      const rec = trCurRec(); if (!rec) return;
      rec.transcript = String(e.target.result || '');
      if (!String(rec.title || '').trim()) rec.title = f.name.replace(/\.txt$/i, '');
      trEnsureStored(rec); trSave(rec);
      App._trSrcOpen = null;   // 匯入後依新字數重算收合預設
      const mb = document.querySelector('#modal .modal-body'); if (mb) mb.innerHTML = trModalHtml(rec);   // 標題/內文/右側一起換
      U.toast('已匯入 ' + f.name + '（' + fmtN(rec.transcript.length) + ' 字）');
    };
    rd.readAsText(f);
  };
  App._trSummarize = function () {
    const rec = trCurRec(); if (!rec) return;
    const doc = document.getElementById('tr-srcdoc'); if (doc) rec.transcript = doc.innerText;   // 拿最新（debounce 可能還沒落）
    const txt = String(rec.transcript || '').trim();
    if (!txt) return U.toast('逐字稿還是空的，先貼上或匯入 .txt', 'warning');
    const run = () => {
      const rows = trExtract(txt);
      rec.minutes = rec.minutes || { table: [], text: '' };
      rec.minutes.table = rows;
      rec.minutesTouched = false;   // 重生＝回到「草稿」（純文字頁不動·§27.6）
      trEnsureStored(rec); trSave(rec);
      App._trTab = 'table'; trRepaintRight();
      U.toast(rows.length ? '已生成 ' + rows.length + ' 列候選（非 AI·可能不準，請逐列確認）' : '規則式沒抓到可整理的句子，可點「＋ 加一列」自己填', rows.length ? 'success' : 'warning');
    };
    const mm = rec.minutes || {};
    const hasOld = (mm.table || []).some(r => ((r.task || '') + (r.owner || '') + (r.due || '')).trim()) || rec.minutesTouched;
    if (hasOld) App.confirmModal({ title: '重生會議紀錄表格', msg: '會用左邊逐字稿<b>重新產生</b>右側表格，表格裡的手動修改會被覆蓋（「純文字」頁不受影響）。確定重生？', okText: '重生', cancelText: '先不要', onConfirm: run });
    else run();
  };

  // ══════════ §27 第二層：雲端自動轉譯（瀏覽器轉檔管線 → GAS 藏金鑰 → OpenAI）══════════
  // 三限制的解法（POC 實測定案·§27.9）：6 分＝GAS「單次呼叫」上限、25MB/25 分＝「單段」上限
  //   → 前端把音檔解碼成 16kHz 單聲道、每 8 分鐘切一段 WAV、逐段打 GAS、回來自動接成一篇。
  //   直送捷徑：格式已支援＋≤15MB＋≤20 分 → 原檔直接送（省解碼）。.aac 一律走轉檔（OpenAI 不收）。
  //   記憶體界線：解碼整檔進記憶體，單檔約 90 分鐘內；更長請分段錄音（掛未來 WebCodecs 串流解碼）。
  const TR_SR = 16000, TR_CHUNK_SEC = 480;
  // JWT 版（Paul 2026-07-18 定案·比照 §14）：前台只存後端網址；呼叫時帶當下登入的 id_token，後端驗白名單。不存任何靜態密碼。
  function trWhisperCfg() { const s = DATA.settings || {}; return { url: String(s.whisperUrl || '').trim() }; }
  function trIdToken() { return (typeof Auth !== 'undefined' && Auth._idToken) || ''; }
  App._trCloudClick = function () {
    if (!trWhisperCfg().url) return App._trCloudSetup();
    if (!trIdToken()) return U.toast('要先用 Google 登入才能用雲端轉譯（後端會驗白名單）', 'warning');
    const a = document.getElementById('tr-audio'); if (a) a.click();
  };
  // 設定集中在設定頁（Paul 定 UX：比照跨裝置同步·前台逐字稿只呈現）——這裡只做引導
  App._trCloudSetup = function () {
    App.confirmModal({
      title: '還沒設定雲端轉譯', icon: 'ti-cloud',
      msg: '到「設定 → 資料與備份」的「<b>🎙 會議逐字稿 · 雲端轉譯後端</b>」貼 Apps Script 網址（只要網址·誰能用由後端白名單管），儲存後回來這顆鈕就會解鎖。',
      okText: '前往設定', cancelText: '先不要',
      onConfirm: () => {
        App.closeModal(); App.showPage('settings');
        setTimeout(() => {   // 跳「資料與備份」分頁＋捲到 Whisper 區塊＋亮紅示意（Paul 定 UX）
          const btn = Array.from(document.querySelectorAll('#page-settings .tab-btn')).find(b => (b.getAttribute('onclick') || '').includes('資料與備份'));
          if (btn) App.showSettingsTab(btn, '資料與備份');
          const sec = document.getElementById('ss-whisper');
          if (sec) {
            sec.scrollIntoView({ behavior: 'smooth', block: 'center' });
            sec.style.outline = '2px solid var(--sig-red)'; sec.style.outlineOffset = '3px';
            setTimeout(() => { sec.style.outline = ''; sec.style.outlineOffset = ''; }, 4000);
          }
        }, 80);
      },
    });
  };
  // ── 🎙 瀏覽器錄音（MediaRecorder → webm → 同一條轉譯管線）──
  App._trRecToggle = async function () {
    if (App._trRec) { App._trRec.stop(); return; }   // 再按一次＝停止（onstop 收尾送轉譯）
    if (!trWhisperCfg().url) return App._trCloudSetup();
    if (!trIdToken()) return U.toast('要先用 Google 登入才能用雲端轉譯（後端會驗白名單）', 'warning');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { return App.confirmModal({ title: '拿不到麥克風', msg: '瀏覽器擋了麥克風權限——點網址列右邊的 🎤 圖示改「允許」，再按一次錄音。', okText: '知道了', cancelText: null }); }
    const mr = new MediaRecorder(stream);
    const chunks = [];
    mr.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    mr.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      clearInterval(App._trRecTimer); App._trRec = null; trRecBtnUi(false);
      const mime = mr.mimeType || 'audio/webm';
      const ext = /mp4/.test(mime) ? 'mp4' : /ogg/.test(mime) ? 'ogg' : 'webm';
      const f = new File([new Blob(chunks, { type: mime })], '會議錄音.' + ext, { type: mime });
      if (f.size < 2000) return U.toast('錄音太短，沒有內容', 'warning');
      App._trTranscribe(f);
    };
    mr.start(1000);
    App._trRec = mr; App._trRecT0 = Date.now();
    trRecBtnUi(true);
    App._trRecTimer = setInterval(() => trRecBtnUi(true), 1000);
  };
  function trRecBtnUi(on) {
    const b = document.getElementById('tr-recbtn'); if (!b) return;
    if (!on) { b.innerHTML = '🎙 錄音'; b.classList.remove('tr-recing'); return; }
    const s = Math.floor((Date.now() - App._trRecT0) / 1000);
    b.innerHTML = '⏹ 停止錄音 ' + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
    b.classList.add('tr-recing');
  }
  App._trOnAudio = function (input) {
    const f = input.files && input.files[0]; input.value = '';
    if (f) App._trTranscribe(f);
  };
  App._trTranscribe = async function (f) {
    const c = trWhisperCfg(); const rec = trCurRec(); if (!rec || !c.url) return;
    if (!trIdToken()) return U.toast('要先用 Google 登入才能用雲端轉譯（後端會驗白名單）', 'warning');
    const st = t => { const el = document.getElementById('tr-cloudst'); if (el) el.textContent = t; };
    const btn = document.getElementById('tr-cloudbtn'); if (btn) btn.disabled = true;
    try {
      const okExt = /\.(m4a|mp3|webm|wav|mp4|mpga|mpeg|ogg|oga|flac)$/i.test(f.name);
      let dur = null; try { dur = await trAudioDuration(f); } catch (e) {}
      if (dur != null && !isFinite(dur)) dur = null;
      let parts;
      if (okExt && f.size <= 15 * 1048576 && dur && dur <= 1200) {
        st('直接上傳（約 ' + Math.round(dur / 60) + ' 分鐘）…');
        parts = [{ name: f.name, mime: f.type || 'audio/mpeg', b64: await trFileB64(f) }];
      } else {
        if (dur && dur > 95 * 60) {
          if (btn) btn.disabled = false; st('');
          return App.confirmModal({ title: '檔案太長', msg: '這版單檔支援約 90 分鐘（' + Math.round(dur / 60) + ' 分鐘超過了）。請分段錄音再各自轉譯，或用 Buzz 離線轉 .txt 匯入。', okText: '知道了', cancelText: null });
        }
        st('解碼音檔中…（大檔要一點時間，別關頁面）');
        const samples = await trDecode16k(f);
        const n = Math.max(1, Math.ceil(samples.length / (TR_CHUNK_SEC * TR_SR)));
        parts = [];
        for (let i = 0; i < n; i++) {
          const s0 = i * TR_CHUNK_SEC * TR_SR, s1 = Math.min(samples.length, s0 + TR_CHUNK_SEC * TR_SR);
          parts.push({ name: 'chunk' + i + '.wav', mime: 'audio/wav', b64: trWavB64(samples, s0, s1) });
        }
      }
      const texts = [];
      for (let i = 0; i < parts.length; i++) {
        st('轉譯中 第 ' + (i + 1) + '/' + parts.length + ' 段…（每段約半分鐘）');
        const res = await fetch(c.url, {
          method: 'POST', mode: 'cors', redirect: 'follow',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },   // simple request 避 CORS preflight
          body: JSON.stringify({ action: 'transcribe', id_token: trIdToken(), name: parts[i].name, mime: parts[i].mime, audio_b64: parts[i].b64 }),
        }).then(r => r.json());
        if (res && res.error) throw new Error((res.stage === 'auth' ? '登入／白名單問題：' : '') + res.error);
        if (!res || res.ok !== true) throw new Error('後端回應格式不對（網址貼錯？）');
        texts.push(String(res.text || ''));
      }
      rec.transcript = (rec.transcript ? rec.transcript + '\n' : '') + texts.join('\n');
      trEnsureStored(rec); trSave(rec);
      App._trSrcOpen = null;   // 轉譯後依新字數重算收合預設
      const mb = document.querySelector('#modal .modal-body'); if (mb) mb.innerHTML = trModalHtml(rec);
      U.toast('✓ 轉譯完成（' + parts.length + ' 段·共 ' + fmtN(rec.transcript.length) + ' 字），自動整理中…');
      App._trSummarize();   // §27.1 Prod：轉完自動接第一層規則式整理（表格已有內容會先確認）
    } catch (e) {
      U.toast('雲端轉譯失敗：' + ((e && e.message) || e), 'error', { duration: 6000 });
      st('');
    } finally {
      const b = document.getElementById('tr-cloudbtn'); if (b) b.disabled = false;
    }
  };
  function trFileB64(f) {
    return new Promise((res, rej) => {
      const rd = new FileReader();
      rd.onerror = () => rej(new Error('讀檔失敗，請重新選一次'));
      rd.onload = () => res(String(rd.result).split(',')[1] || '');
      rd.readAsDataURL(f);
    });
  }
  function trAudioDuration(f) {
    return new Promise((res, rej) => {
      const u = URL.createObjectURL(f); const a = new Audio();
      a.preload = 'metadata';
      a.onloadedmetadata = () => { URL.revokeObjectURL(u); res(a.duration); };
      a.onerror = () => { URL.revokeObjectURL(u); rej(new Error('讀不出音檔長度')); };
      a.src = u;
    });
  }
  // 解碼＋重採樣到 16k（decodeAudioData 會重採樣到 context 的 sampleRate）＋混單聲道 → Float32Array
  async function trDecode16k(f) {
    const ab = await f.arrayBuffer();
    const ctx = new OfflineAudioContext(1, 1, TR_SR);
    let buf;
    try { buf = await ctx.decodeAudioData(ab); }
    catch (e) { throw new Error('這個格式瀏覽器解不開（' + f.name + '）——請改用 .m4a／.mp3，或用 Buzz 轉 .txt 匯入'); }
    const ch0 = buf.getChannelData(0);
    if (buf.numberOfChannels === 1) return ch0;
    const ch1 = buf.getChannelData(1);
    const out = new Float32Array(buf.length);
    for (let i = 0; i < buf.length; i++) out[i] = (ch0[i] + ch1[i]) / 2;
    return out;
  }
  // Float32 切片 → 16-bit PCM WAV → base64（分塊 fromCharCode 防爆棧）
  function trWavB64(samples, s0, s1) {
    const n = s1 - s0;
    const bytes = new Uint8Array(44 + n * 2); const dv = new DataView(bytes.buffer);
    const ws = (o, s) => { for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
    ws(0, 'RIFF'); dv.setUint32(4, 36 + n * 2, true); ws(8, 'WAVE'); ws(12, 'fmt ');
    dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
    dv.setUint32(24, TR_SR, true); dv.setUint32(28, TR_SR * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true);
    ws(36, 'data'); dv.setUint32(40, n * 2, true);
    for (let i = 0; i < n; i++) { const v = Math.max(-1, Math.min(1, samples[s0 + i])); dv.setInt16(44 + i * 2, v < 0 ? v * 0x8000 : v * 0x7FFF, true); }
    let bin = ''; const CH = 0x8000;
    for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(bin);
  }

  // ══════════ §27.5 規則式重點整理（非 AI·純 JS·基本版：先收真稿再補規則）══════════
  // 句段切分（記原文位置）：來源卡展開顯示與 trExtract 共用同一套索引，srcSeg 才對得上（§27.9 定案③）
  function trSegsPos(text) {
    text = String(text || '');
    const out = [], re = /[^。；;！!？?\r\n]+/g;   // 一段＝相鄰的非（句末標點/換行）字元（等價舊「先拆行再拆句末標點」）
    let m;
    while ((m = re.exec(text))) {
      const raw = m[0], t = raw.trim();
      if (!t) continue;
      const start = m.index + (raw.length - raw.replace(/^\s+/, '').length);
      out.push({ text: t, start, end: start + t.length });
    }
    return out;
  }
  function trExtract(text) {
    const roster = (typeof Portfolio !== 'undefined' && Portfolio.personRoster) ? Portfolio.personRoster() : [];
    const names = roster.map(r => r.name).filter(n => n && n.length >= 2).sort((a, b) => b.length - a.length);   // 長名先比對
    const today = D.today();
    const TODO_RE = /(請|要|負責|追蹤|跟催|確認|回覆|回報|提供|安排|完成|處理|提出|交付|補齊|更新|寄|交|給|follow\s*up|\bby\b)/i;
    const DECIDE_RE = /(決定|拍板|同意|結論|定案|敲定|通過)/;
    const segs = trSegsPos(text);
    const rows = [], seen = new Set();
    for (let si = 0; si < segs.length; si++) {
      if (rows.length >= 30) break;   // 候選上限，避免長稿灌爆表格
      const s = segs[si].text.replace(/^[^：:]{1,12}[：:]\s*/, '').trim();   // 去「發言人：」前綴
      if (s.length < 6) continue;
      const due = trParseDate(s, today);
      // 三路命中其一才收：待辦關鍵字／決議關鍵字／「日期＋前」（例：25 號前把報告出來）
      if (!TODO_RE.test(s) && !DECIDE_RE.test(s) && !(due && /前/.test(s))) continue;
      let owner = '';
      for (const n of names) { if (s.includes(n)) { owner = n; break; } }
      const task = s.length > 60 ? s.slice(0, 60) + '…' : s;
      if (seen.has(task)) continue; seen.add(task);
      rows.push({ task, owner, due, status: '未開始', srcSeg: si });   // srcSeg＝來源句段 index（供「↖ 原文」跳轉）
    }
    return rows;
  }
  // 日期抓取：西元/民國/月日/僅日＋今天明天後天/（下（下））週X/月中/月底（基本版）
  function trParseDate(s, today) {
    const Y = today.getFullYear(), M = today.getMonth(), TD = today.getDate();
    const mk = (y, mo, d) => { const dt = new Date(y, mo - 1, d); return (dt.getMonth() === mo - 1 && dt.getDate() === d) ? D.fmt(dt, 'iso') : ''; };
    let m;
    if ((m = s.match(/(\d{4})\s*[年\/\-.]\s*(\d{1,2})\s*[月\/\-.]\s*(\d{1,2})/))) return mk(+m[1], +m[2], +m[3]);
    if ((m = s.match(/(1[01]\d)\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})/))) return mk(+m[1] + 1911, +m[2], +m[3]);   // 民國
    if ((m = s.match(/(\d{1,2})\s*[月\/]\s*(\d{1,2})\s*[日號]?/))) {
      let y = Y; const dt = new Date(y, +m[1] - 1, +m[2]);
      if ((dt - today) / 86400000 < -180) y++;   // 過去半年以上→視為明年（跨年常見）
      return mk(y, +m[1], +m[2]);
    }
    if ((m = s.match(/(\d{1,2})\s*[號日]/))) { let mo = M + 1, y = Y; if (+m[1] < TD) { mo++; if (mo > 12) { mo = 1; y++; } } return mk(y, mo, +m[1]); }
    if (/今天/.test(s)) return D.fmt(today, 'iso');
    if (/明天/.test(s)) return D.fmt(D.addDays(today, 1), 'iso');
    if (/後天/.test(s)) return D.fmt(D.addDays(today, 2), 'iso');
    if ((m = s.match(/(下下|下)?(?:週|星期|禮拜)([一二三四五六日天])/))) {
      const map = { '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '日': 0, '天': 0 };
      const tw = map[m[2]]; const off = tw === 0 ? 6 : tw - 1;   // 週一=0 … 週日=6
      const curMon = D.monday(today);
      let target;
      if (!m[1]) { target = D.addDays(curMon, off); if (target <= today) target = D.addDays(target, 7); }   // 「週三」已過→下週
      else if (m[1] === '下') target = D.addDays(curMon, 7 + off);
      else target = D.addDays(curMon, 14 + off);
      return D.fmt(target, 'iso');
    }
    if (/下(個)?月底/.test(s)) return D.fmt(new Date(Y, M + 2, 0), 'iso');
    if (/月底/.test(s)) return D.fmt(new Date(Y, M + 1, 0), 'iso');
    if (/月中/.test(s)) return D.fmt(TD > 15 ? new Date(Y, M + 1, 15) : new Date(Y, M, 15), 'iso');
    return '';
  }
})();
