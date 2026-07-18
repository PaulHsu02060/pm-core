// project.js — 專案頁(header/KPI/階段/部門/任務 CRUD/buildTaskRowHtml/會議彈窗/排程產生/predecessor/taskForm)。app.js 之後載入；taskDisplayProgress/getProjectStages 在 core、範本表單在 template。看板已於 §13.9 退役清除。docs §18.7.2。
// ═══════════════════════════════════════════════════════
//  PAGE: PROJECT
// ═══════════════════════════════════════════════════════
App.buildProjectHeaderHtml = function() {
  const proj = this.getProj(this.currentProjectId);
  if (!proj) return '';
  return `<div class="proj-header">
        <div style="flex:1; min-width:0;">
          <div class="proj-name">
            ${U.esc(proj.name)}
          </div>
        </div>
        <span id="projExportSlot" style="display:contents">${this._projExportBtnHtml(proj)}</span>
        <button class="tb-action ghost" data-edit onclick="App.editProject('${proj.id}')">編輯專案</button>
        <span class="hdr-menu-wrap">
          <button class="tb-action ghost hdr-menu-toggle" data-edit onclick="App.toggleMoreMenu(event, '${proj.id}')">⋯</button>
          <div class="hdr-menu hdr-menu-right" id="hdrMoreMenu">
            <button class="hdr-menu-item hdr-menu-danger" onclick="App.openWbsImport('${proj.id}'); App.closeHdrMenus();">覆蓋匯入<span class="hdr-menu-note hdr-menu-danger-note">危險</span></button>
          </div>
        </span>
      </div>`;
};

// §13.9 方向三：各頁單一匯出口——匯出鈕內容跟著當前頁籤（this.projectView）變。
// 甘特圖→匯出排程（WBS+甘特·週/日/月刻度）；BOM·成本→匯出成本差異報告（多機種比較／本機種設變分析）；儀表板/月曆→不放匯出鈕。
// 下拉每項附「結果／情境」兩行備註；空狀態照規則16 反灰＋提示、不隱藏。
App._projExportBtnHtml = function(proj) {
  const view = this.projectView, pid = proj.id;
  const dl = '<i class="ti ti-download" style="font-size:15px; vertical-align:-2px; margin-right:5px; color:var(--sage-600);"></i>';
  const wrap = (label, body) =>
    '<span class="hdr-menu-wrap">' +
      '<button class="tb-action ghost hdr-menu-toggle" data-edit-hide onclick="App.toggleExportMenu(event, \'' + pid + '\')">' + dl + label + ' ▾</button>' +
      '<div class="hdr-menu hdr-menu-right hdr-menu-export" id="hdrExportMenu">' + body + '</div>' +
    '</span><span class="hdr-divider"></span>';
  // rich 選項：icon＋title＋tag＋結果＋情境（enabled＝button 直接跑；disabled＝div＋停用原因，規則16）
  const rt = (o) => '<span class="hdr-menu-rt"><i class="ti ' + o.icon + '"></i>' + o.title + (o.tag ? '<span class="hdr-menu-rtag">' + o.tag + '</span>' : '') + '</span>';
  const item = (o) => o.enabled
    ? '<button class="hdr-menu-item rich" onclick="' + o.onclick + ' App.closeHdrMenus();">' + rt(o) +
        '<span class="hdr-menu-rr">結果：' + o.result + '</span><span class="hdr-menu-rc">情境：' + o.scene + '</span></button>'
    : '<div class="hdr-menu-item rich disabled">' + rt(o) +
        '<span class="hdr-menu-rr">結果：' + o.result + '</span><span class="hdr-menu-rc">情境：' + o.scene + '</span>' +
        '<span class="hdr-menu-hint">＊' + o.disabledHint + '</span></div>';

  if (view === 'dashboard') {
    // §13.9+（Paul 2026-07-05）：儀表板頁匯出＝Task ＋ 專案資訊兩分頁（甘特分頁移到甘特頁匯出）
    return '<button class="tb-action ghost" data-edit-hide onclick="App.exportProjectWbs(\'' + pid + '\', null, \'data\');">' + dl + '匯出任務清單</button><span class="hdr-divider"></span>';
  }
  if (view === 'gantt') {
    const sch = (g, icon, title, tag, coarse, scene) => item({ enabled: true, icon, onclick: 'App.exportProjectWbs(\'' + pid + '\',\'' + g + '\',\'gantt\');', title, tag, result: '甘特圖分頁（' + coarse + '）', scene });
    return wrap('匯出甘特圖',
      '<div class="hdr-menu-title">匯出甘特圖</div><div class="hdr-menu-sub">只含甘特分頁（任務清單／專案資訊改在「儀表板」頁匯出）</div>' +
      sch('week', 'ti-calendar-week', '週刻度', '最常用', '每週一欄', '例行週會報告，分析預期與實際進度差異') +
      sch('day', 'ti-calendar', '日刻度', '', '每日一欄，最細', '專案短期衝刺、細部排程檢視') +
      sch('month', 'ti-calendar-stats', '月刻度', '', '每月一欄，最粗', '跨月長專案評估，高階主管'));
  }
  if (view === 'bom') {
    const models = proj.bomModels || [];
    const hasModels = models.length > 0;
    const bs = proj.bomSheets;
    const hasSingle = !!(bs && bs.new && bs.old);
    return wrap('匯出成本差異報告',
      '<div class="hdr-menu-title">匯出成本差異報告</div><div class="hdr-menu-sub">系統不留存 Excel，按即時資料產生</div>' +
      item({ enabled: hasModels, icon: 'ti-table', onclick: 'App.exportBomModels(App.getProj(\'' + pid + '\'));',
        title: '跨機種成本比較報告', tag: '全型號·分析報表',
        result: '全系列型號的「成本價差」與「降幅成效總表」',
        scene: '主管開會、採購總覽全系列「省了多少錢」時',
        disabledHint: '先在上方上傳新舊 BOM、按「全機種自動比對」' }) +
      item({ enabled: hasSingle, icon: 'ti-file-invoice', onclick: 'App._bomExportWizard(\'' + pid + '\');',
        title: '單一機種設變效益分析', tag: '當前型號·含試算公式',
        result: '當前型號的「設變回本期」與「損耗效益估算表（帶 Excel 公式）」',
        scene: '需要精算「特定這台冷氣」改了之後多久能回本時',
        disabledHint: '先在上方上傳新舊 BOM 並比對（選一個機種）' }) +
      item({ enabled: hasModels, icon: 'ti-list-details', onclick: 'App.exportBomModelsFullBom(App.getProj(\'' + pid + '\'));',
        title: '各機種完整新 BOM 料表', tag: '全型號·純生產料表',
        result: '變更後的「全新完整乾淨料表」（非數據分析表）',
        scene: '工程師、採購需要拿去「直接建檔或回填 ERP」時',
        disabledHint: '先在上方上傳新舊 BOM、按「全機種自動比對」' }));
  }
  return '';   // 儀表板 / 月曆：不放匯出鈕
};

// §16 塊5：header 下拉/選單（toggle + 點外關閉；單一專案頁故用固定 id）
App.toggleExportMenu = function(ev, projId) {
  ev.stopPropagation();
  this._ensureHdrMenuClose();
  const m = document.getElementById('hdrExportMenu');
  const open = m && m.classList.contains('open');
  this.closeHdrMenus();
  if (m && !open) m.classList.add('open');
};
App.toggleMoreMenu = function(ev, projId) {
  ev.stopPropagation();
  this._ensureHdrMenuClose();
  const m = document.getElementById('hdrMoreMenu');
  const open = m && m.classList.contains('open');
  this.closeHdrMenus();
  if (m && !open) m.classList.add('open');
};
App.closeHdrMenus = function() {
  document.querySelectorAll('.hdr-menu.open').forEach(m => m.classList.remove('open'));
};
App._ensureHdrMenuClose = function() {
  if (this._hdrMenuCloseBound) return;
  this._hdrMenuCloseBound = true;
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.hdr-menu')) App.closeHdrMenus();
  });
};

App.renderProject = function() {
  if (!this.currentProjectId) {
    // Show first project
    if (DATA.projects.length > 0) {
      this.currentProjectId = DATA.projects[0].id;
    } else {
      document.getElementById('page-project').innerHTML = '<div class="empty-task-list"><div class="empty-task-list-icon">📁</div>請先建立專案</div>';
      return;
    }
  }
  const proj = this.getProj(this.currentProjectId);
  if (!proj) {
    document.getElementById('page-project').innerHTML = '<div class="empty-task-list">專案不存在</div>';
    return;
  }

  // §19.6.3 B：NPI 專案頁結構 chrome→靛藍 scope 掛在 #page-project 元素（innerHTML 換不掉·涵蓋所有 tab）；ECN 走戰情室→關閉
  document.getElementById('page-project').classList.toggle('proj-npi', !proj.ecnType);
  // §19：ECN 設變案走專屬戰情室 dashboard（依 ecnType 分流，不套一般專案 view 工具列）；NPI 走原路並清 ECN hijack 旗標
  if (proj.ecnType) return App.renderEcnDashboard(proj);
  App._s2EcnMode = null;

  // §拆頁：任務清單抽成獨立 tab——依 projectView 分派內容（list＝任務大表·其餘＝儀表板 KPI/階段/負荷）
  const _body = (this.projectView === 'list') ? this.buildProjectTaskListHtml(proj) : this.renderProjectDashboard(proj);
  const html = `
    ${this.buildProjectHeaderHtml()}
    <div class="view-tabs-bar">${this.buildProjectViewTabsHtml()}</div>

    ${_body}
  `;
  document.getElementById('page-project').innerHTML = html;
  if (this.projectView !== 'list') {   // §拆頁：進案引導彈窗屬儀表板情境，任務清單 tab 不觸發
    App._maybePromptUnscheduled(proj);   // §19.11：進案發現有任務排不進去 → 彈窗引導回開案修（安全網·取代黏著 banner）
    App._maybePromptPmCoord(proj);   // §18.10c／規則16：PM 負荷空值 → 彈窗引導一鍵設定（每 session 每案一次）
  }
};

// §19.11（Paul 2026-07-05）：安全網——若 NPI 案有「工期任務排不進去」（plannedStart 空·多為前置斷鏈），
// 進案時彈設計款彈窗引導回開案修（每 session 每案一次·非黏著）；取代原 #content 置頂 error banner。
App._maybePromptUnscheduled = function(proj) {
  if (!proj || proj.ecnType) return;
  this._unschedPrompted = this._unschedPrompted || {};
  if (this._unschedPrompted[proj.id]) return;
  const ts = DATA.tasks.filter(t => t.project === proj.id && !t._deleted && !t.isPmCoord);
  const bad = ts.filter(t => !t.plannedStart && !t.actualStart);   // 有任務算不出計畫起日
  if (!bad.length) return;
  this._unschedPrompted[proj.id] = true;
  App.confirmModal({
    title: '有 ' + bad.length + ' 項任務排不進時程',
    icon: 'ti-alert-triangle', iconBg: '--amber-l', iconColor: '--amber-ink',
    msg: '<div style="text-align:left;font-size:12.5px;line-height:1.6;color:var(--ink2);">本案有 <b>' + bad.length + '</b> 項任務算不出計畫日期（多為前置指向已刪除的任務、或循環依賴）。<br>建議到<b>設定 → 範本</b>把該範本的前置修好後<b>重新開案</b>，或在本案甘特圖／任務大表逐筆調整前置。</div>',
    okText: '我知道了', cancelText: null,
  });
};

App.renderProjectDashboard = function(proj) {
  // §拆頁：儀表板瘦身＝只留 KPI ＋ 階段/部門負荷（緊急 Issue 在負荷欄）；待辦任務大表移到「任務清單」tab（buildProjectTaskListHtml）
  return `    ${this.buildProjKpiHtml(proj)}

    <div class="proj-dash-grid">
      ${this.buildProjStagesHtml(proj)}
      <div class="proj-load-col">${this.buildProjLoadCol(proj)}</div>
    </div>
`;
};

// §拆頁：任務清單（獨立 tab）——原儀表板下半的待辦任務大表（篩選/批量/待排/完工/已刪除），整塊搬出、100% 畫面。
App.buildProjectTaskListHtml = function(proj) {
  const allTasks = this.getTasksOf(proj.id);
  const today = D.today();
  // 序基準（同源）：orderedProjectTasks 日期序（dispStart 升序、待排殿後）、排除 deleted、含 done（done 佔號）。外層+前置下拉共用。
  const ordered = this.orderedProjectTasks(proj.id);
  // 第二刀-A：篩選只在 render 局部過濾。filtered 是 const 局部變數，絕不回寫 orderedProjectTasks 本體
  // （本體被 _seqOf／前置下拉共用，需維持全量）。下游 counts／預覽切點／visible／firstUndated 全吃 filtered。
  const taskFilter = this.getTaskFilter(proj.id);
  const q = ((this._taskSearch && this._taskSearch[proj.id]) || '').trim();
  const npiTabs = this._npiVariantTabs(proj);   // 多子案→分頁；null＝不分頁
  const activeVid = npiTabs ? this._npiActiveVariant(proj) : null;
  const hasFilter = ['stages', 'owners', 'urg', 'status'].some(k => taskFilter[k] && taskFilter[k].size > 0) || !!q;   // 2甲：任一維 Set 非空／有搜尋＝篩選啟用（免 15 筆上限）
  let filtered = applyTaskFilter(ordered, taskFilter);
  if (npiTabs) { const firstId = npiTabs[0].id; filtered = filtered.filter(t => { const tv = t.variant || ''; return (activeVid === firstId) ? (tv === firstId || tv === '') : (tv === activeVid); }); }   // 子案分頁：只顯示當前案別；主案吸收無 variant 的孤兒任務
  if (q) { const ql = q.toLowerCase(); filtered = filtered.filter(t => (t.name || '').toLowerCase().includes(ql) || (t.owner || '').toLowerCase().includes(ql)); }   // 搜尋範圍＝當前分頁內·任務名/負責人
  const activeCount = filtered.filter(t => t.status !== 'done').length;
  const doneCount = filtered.length - activeCount;
  const deletedTasks = allTasks.filter(t => t._deleted).sort((a, b) => (b._deletedAt || '').localeCompare(a._deletedAt || ''));

  // 預覽切到「第 15 個未完成」位置（done 不佔額度、夾在中間者原位保留）
  const PREVIEW_ACTIVE_LIMIT = 15;
  this._projectExpanded = this._projectExpanded || {};
  const isExpanded = !!this._projectExpanded[proj.id];
  let activeSeen = 0, cutIdx = filtered.length - 1;
  for (let p = 0; p < filtered.length; p++) {
    if (filtered[p].status !== 'done') {
      activeSeen++;
      if (activeSeen === PREVIEW_ACTIVE_LIMIT) { cutIdx = p; break; }
    }
  }
  const overflow = activeCount > PREVIEW_ACTIVE_LIMIT;
  const showAll = hasFilter || isExpanded || !overflow;   // 2甲：篩選啟用 → 不套 15 筆預覽上限，顯示全部篩後集
  const visible = showAll ? filtered : filtered.slice(0, cutIdx + 1);

  this._doneVisible = this._doneVisible || {};
  const doneVisible = !!this._doneVisible[proj.id];

  this._toScheduleVisible = this._toScheduleVisible || {};
  const toScheduleVisible = this._toScheduleVisible[proj.id] !== false;   // 待排區預設展開（未設過 = true）
  // 待排分隔：orderTasksByDispStart 已把空 dispStart 殿後 → visible 尾段連續；找第一筆切點
  const firstUndated = visible.findIndex(t => getEffectiveSchedule(t).start === '');
  const tsCollapsed = toScheduleVisible ? '' : 'collapsed';
  // 批量編輯模式（2a-5）：勾選欄＋批量列；COLS 隨模式 10/11（bar/empty 列 colspan 共用）
  const bulk = !!(this._bulkMode || {})[proj.id];
  const COLS = bulk ? 11 : 10;
  let activeListInner;
  if (visible.length === 0) {
    activeListInner = hasFilter
      ? `<tr class="empty-task-list bar-row"><td colspan="${COLS}"><div class="empty-task-list-icon">🔍</div>無符合篩選條件的任務</td></tr>`
      : `<tr class="empty-task-list bar-row"><td colspan="${COLS}"><div class="empty-task-list-icon">📝</div>尚無待辦任務</td></tr>`;
  } else if (firstUndated < 0) {
    activeListInner = visible.map(t => this.buildTaskRowHtml(t)).join('');
  } else {
    const datedRows = visible.slice(0, firstUndated).map(t => this.buildTaskRowHtml(t)).join('');
    const undatedRows = visible.slice(firstUndated).map(t => this.buildTaskRowHtml(t, 'undated')).join('');
    const undatedCount = visible.length - firstUndated;
    activeListInner = datedRows +
      `<tr class="toschedule-bar bar-row ${tsCollapsed}" onclick="App.toggleToScheduleVisible('${proj.id}')"><td colspan="${COLS}"><div class="bar-inner">
            <span class="done-head-chevron">▼</span>
            <span class="done-head-title">待排</span>
            <span class="done-head-count">${undatedCount}</span>
            <span class="done-toggle-note">${toScheduleVisible ? '未填開始日（補開始日或前置即排入）' : '已收合'}</span>
          </div></td></tr>` +
          undatedRows;
  }

  return `
    <div class="proj-grid">
      <div>
        <!-- Active tasks -->
        <div class="task-list-card">
          <div class="tlc-head">
            <span class="tlc-title">待辦任務</span>
            <span class="tlc-count">${activeCount}</span>
            <button class="tb-action" onclick="App.toggleBulkEdit('${proj.id}')" style="margin-left:auto;">${bulk ? '完成批量編輯' : '☑ 批量編輯'}</button>
            <button class="tb-action" onclick="App.openNewTaskDialog('${proj.id}')">＋ 新增任務</button>
          </div>
          ${this._npiVariantTabsHtml(proj)}
          ${this.buildTaskFilterBar(proj.id)}
          ${bulk ? this._bulkBarHtml(proj) : ''}
          <!-- 第二刀-A 已接線：applyTaskFilter(ordered, getTaskFilter) 四 Set 過濾 → filtered，下游 counts／預覽／visible 全吃 filtered。 -->
          <!-- subgrid 步2：單一 .task-grid 父，header/done-bar/各列直屬，欄軌共用自動算；hide-done/ts-collapsed 摺疊 class 烤在父上。 -->
          <table id="activeTaskList" class="data-table task-table${doneVisible ? '' : ' hide-done'}${toScheduleVisible ? '' : ' ts-collapsed'}">
            <thead>
              <tr class="task-row-header">
                ${bulk ? `<th class="col-chk"><input type="checkbox" onclick="event.stopPropagation()" onchange="App._bulkSelectAll('${proj.id}', this.checked)" data-tip="全選|勾選目前顯示的全部未完成任務"></th>` : ''}
                <th class="col-num">序</th>
                <th class="col-mid">階段</th>
                <th class="col-flex">任務</th>
                <th class="col-mid">進度%</th>
                <th class="col-mid">負責人</th>
                <th class="col-mid">前置任務</th>
                <th class="col-num">狀態</th>
                <th class="col-mid">預計時程（開始→結束）</th>
                <th class="col-num">餘裕（天）</th>
                <th class="col-num">截止日</th>
              </tr>
            </thead>
            <tbody>
            ${doneCount > 0 ? `
            <tr class="done-toggle-bar bar-row ${doneVisible ? '' : 'collapsed'}" onclick="App.toggleDoneVisible('${proj.id}')"><td colspan="${COLS}"><div class="bar-inner">
              <span class="done-head-chevron">▼</span>
              <span class="done-head-title">已完成</span>
              <span class="done-head-count">${doneCount}</span>
              <span class="done-toggle-note">${doneVisible ? '原位顯示（灰字刪除線）' : '已收合'}</span>
            </div></td></tr>` : ''}
            ${activeListInner}
            </tbody>
          </table>
          ${!showAll ? `
          <div style="padding:10px 16px; border-top:1px solid var(--rule); text-align:center; background:var(--surface2);">
            <button class="tb-action ghost" onclick="App.toggleProjectExpanded('${proj.id}')" style="font-size:11.5px; padding:5px 14px;">
              展開全部（還有 ${activeCount - PREVIEW_ACTIVE_LIMIT} 筆）▼
            </button>
          </div>` : (isExpanded && overflow ? `
          <div style="padding:10px 16px; border-top:1px solid var(--rule); text-align:center; background:var(--surface2);">
            <button class="tb-action ghost" onclick="App.toggleProjectExpanded('${proj.id}')" style="font-size:11.5px; padding:5px 14px;">
              收起（只顯示前 ${PREVIEW_ACTIVE_LIMIT} 個未完成）▲
            </button>
          </div>` : '')}
          <div class="list-foot">
            <input id="quickAddTask" placeholder="＋ 快速新增任務（按 Enter 完成）" data-edit
                   onkeydown="if(event.key==='Enter') App.quickAddTask('${proj.id}', this)">
            <button data-edit onclick="App.quickAddTask('${proj.id}', document.getElementById('quickAddTask'))">新增</button>
          </div>
        </div>


        ${deletedTasks.length > 0 ? `
        <div class="done-section deleted-section collapsed" id="deletedSection">
          <div class="done-head" onclick="document.getElementById('deletedSection').classList.toggle('collapsed')">
            <span class="done-head-title">🗑 已刪除</span>
            <span class="done-head-count" style="background:var(--terracotta-l); color:var(--terracotta);">${deletedTasks.length}</span>
            <span class="done-head-chevron">▼</span>
          </div>
          <div class="done-list">
            ${deletedTasks.map(t => `<div class="deleted-row" style="display:flex; align-items:center; gap:10px; padding:9px 14px; border-bottom:1px solid var(--rule);">
              <div style="flex:1; min-width:0;">
                <div style="font-size:12.5px; text-decoration:line-through; color:var(--ink3);">${U.esc(t.name)}</div>
                <div style="font-size:10.5px; color:var(--ink4); margin-top:2px;">刪除於 ${t._deletedAt ? D.fmt(t._deletedAt, 'ymd') : '—'}</div>
              </div>
              <button class="tb-action ghost" onclick="App.restoreTask('${t.id}')" style="font-size:10.5px; padding:3px 10px; color:var(--sage-700);">↺ 還原</button>
              <button class="tb-action ghost" onclick="App.permanentDeleteTask('${t.id}')" style="font-size:10.5px; padding:3px 10px; color:var(--terracotta);">永久刪除</button>
            </div>`).join('')}
          </div>
          <div class="done-clear-tip">
            💡 已刪除任務保留 14 天，過期自動清除
          </div>
        </div>` : ''}
      </div>
    </div>
`;
};

// ─── 待辦清單篩選器 UI 殼（§塊3）──────────────────────────────
// 膠囊 chip 多選 + 展開面板。本批只做 UI：勾選只更新 state Set + 切 DOM 樣式，
// 不過濾清單（接線見 renderProjectDashboard 內 TODO）。
// state per-proj，不入 localStorage；面板開合真實來源是 DOM .open class，不在 state 存一份。
App.getTaskFilter = function(projId) {
  this._taskFilter = this._taskFilter || {};
  if (!this._taskFilter[projId])
    this._taskFilter[projId] = { stages: new Set(), owners: new Set(), urg: new Set(), status: new Set() };
  return this._taskFilter[projId];
};

// 該專案 task 的 distinct 負責人（排序）。階段選項另用 getProjectStages 的 name。
App.taskOwnerOptions = function(projectId) {
  const set = new Set();
  (DATA.tasks || []).forEach(t => {
    if (t.project === projectId && !t._deleted && typeof t.owner === 'string' && t.owner.trim())
      set.add(t.owner.trim());
  });
  return [...set].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
};

// NPI 子案分頁（§19）：母案（variant 空）＋各子案；tab<2 不顯示。與階段進度卡 variant 分塊同模型。
App._npiVariantTabs = function(proj) {
  const vs = (proj.variants || []);
  return (vs.length < 2) ? null : vs;   // <2 子案不分頁；第一個＝主案，其餘子案（同 ECN、同開案骨架）
};
App._npiActiveVariant = function(proj) {
  const vs = this._npiVariantTabs(proj);
  if (!vs) return null;
  this._npiVariantTab = this._npiVariantTab || {};
  const cur = this._npiVariantTab[proj.id];
  return (cur && vs.some(v => v.id === cur)) ? cur : vs[0].id;   // 預設主案（第一個案別）
};
App._npiVariantTabsHtml = function(proj) {
  const vs = this._npiVariantTabs(proj);
  if (!vs) return '';
  const active = this._npiActiveVariant(proj);
  return '<div class="npi-vtabs">' + vs.map((v, i) =>
    '<button class="npi-vtab' + (v.id === active ? ' on' : '') + '" onclick="App._npiSetVariantTab(\'' + proj.id + '\', \'' + v.id + '\')">' +
      (i === 0 ? '<i class="ti ti-star" aria-hidden="true"></i> 主案 · ' : '') + U.esc(v.name || ('案別' + (i + 1))) +
    '</button>').join('') + '</div>';
};
App._npiSetVariantTab = function(projId, vid) {
  this._npiVariantTab = this._npiVariantTab || {};
  this._npiVariantTab[projId] = vid;
  this.renderProject();
};

App.buildTaskFilterBar = function(projId) {
  const seenStage = new Set();
  const stageOpts = this.getProjectStages(projId)
    .filter(s => { if (seenStage.has(s.name)) return false; seenStage.add(s.name); return true; })
    .map(s => ({ value: s.name, label: s.name }));
  const ownerOpts = this.taskOwnerOptions(projId).map(o => ({ value: o, label: o }));
  const urgOpts = ['high', 'medium', 'low'].map(v => ({ value: v, label: URGENCY_LABELS_ZH[v] }));
  const statusOpts = ['pending', 'wip', 'done', 'hold'].map(v => ({ value: v, label: STATUS_LABELS_ZH[v] }));
  return `<div class="task-filter-bar">
    ${this.buildTaskFilterChip(projId, 'stages', '階段', stageOpts)}
    ${this.buildTaskFilterChip(projId, 'owners', '負責人', ownerOpts)}
    ${this.buildTaskFilterChip(projId, 'urg', '緊急程度', urgOpts)}
    ${this.buildTaskFilterChip(projId, 'status', '狀態', statusOpts)}
    <div class="tf-search"><i class="ti ti-search" aria-hidden="true"></i><input id="taskSearchInput" placeholder="搜尋任務…" value="${U.esc((this._taskSearch && this._taskSearch[projId]) || '')}" oninput="App.setTaskSearch('${projId}', this.value)"></div>
    <button class="tf-clear-all" onclick="App.clearTaskFilter('${projId}')">全部清除</button>
  </div>`;
};

App.buildTaskFilterChip = function(projId, key, label, options) {
  const sel = this.getTaskFilter(projId)[key];
  const selArr = [...sel];
  const chipText = selArr.length === 0 ? label
    : selArr[0] + (selArr.length > 1 ? ` +${selArr.length - 1}` : '');
  const boxes = options.length ? options.map(o =>
    `<label class="tf-opt${sel.has(o.value) ? ' on' : ''}">
      <input type="checkbox" value="${U.esc(o.value)}"${sel.has(o.value) ? ' checked' : ''}
        onchange="App.toggleTaskFilterOpt('${projId}','${key}',this.value,this.checked)">
      <span>${U.esc(o.label)}</span>
    </label>`).join('') : '<div class="tf-empty">無選項</div>';
  return `<div class="tf-chip-wrap" data-key="${key}">
    <button class="tf-chip tf-${key}${selArr.length ? ' active' : ''}" data-label="${U.esc(label)}"
      onclick="App.toggleTaskFilterPanel('${projId}','${key}')">
      <span class="tf-chip-label">${U.esc(chipText)}</span><span class="tf-caret">▾</span>
    </button>
    <div class="tf-panel">
      <div class="tf-opts">${boxes}</div>
      <div class="tf-panel-foot">
        <button onclick="App.clearTaskFilterKey('${projId}','${key}')">清除</button>
        <button onclick="App.toggleTaskFilterPanel('${projId}','${key}')">套用</button>
      </div>
    </div>
  </div>`;
};

// 面板開合:同時只開一顆,純 toggle .open class（不重繪）
App.toggleTaskFilterPanel = function(projId, key) {
  const wrap = document.querySelector(`.tf-chip-wrap[data-key="${key}"]`);
  if (!wrap) return;
  const willOpen = !wrap.classList.contains('open');
  document.querySelectorAll('.tf-chip-wrap.open').forEach(w => w.classList.remove('open'));
  if (willOpen) wrap.classList.add('open');
  else this.renderProject();   // 選項2：關閉面板＝套用篩選（套用鈕/再點 chip 都走這條）→ 重繪待辦列吃 getTaskFilter
};

// chip 勾選:更新 Set + 即時改 DOM 樣式/膠囊文字（本批不觸發過濾）
App.toggleTaskFilterOpt = function(projId, key, value, checked) {
  const sel = this.getTaskFilter(projId)[key];
  checked ? sel.add(value) : sel.delete(value);
  const wrap = document.querySelector(`.tf-chip-wrap[data-key="${key}"]`);
  if (!wrap) return;
  wrap.querySelectorAll('.tf-opt').forEach(l => l.classList.toggle('on', l.querySelector('input').checked));
  const chip = wrap.querySelector('.tf-chip');
  const selArr = [...sel];
  chip.classList.toggle('active', selArr.length > 0);
  wrap.querySelector('.tf-chip-label').textContent =
    selArr.length === 0 ? chip.dataset.label
    : selArr[0] + (selArr.length > 1 ? ` +${selArr.length - 1}` : '');
};

App.clearTaskFilterKey = function(projId, key) {
  this.getTaskFilter(projId)[key].clear();
  const wrap = document.querySelector(`.tf-chip-wrap[data-key="${key}"]`);
  if (wrap) wrap.querySelectorAll('input[type=checkbox]').forEach(cb => {
    cb.checked = false; cb.dispatchEvent(new Event('change'));
  });
  this.renderProject();   // 選項2：清完該維 Set → 重繪套用（重讀空 Set＝該維全顯示），面板隨整頁重繪收合
};

App.clearTaskFilter = function(projId) {
  const f = this.getTaskFilter(projId);
  ['stages', 'owners', 'urg', 'status'].forEach(k => f[k].clear());
  if (this._taskSearch) this._taskSearch[projId] = '';   // 搜尋一併清（子案分頁屬結構導覽·不清）
  document.querySelectorAll('.task-filter-bar input[type=checkbox]').forEach(cb => {
    cb.checked = false; cb.dispatchEvent(new Event('change'));
  });
  this.renderProject();   // 選項2：四維 Set 全清 → 重繪套用（全部重讀空 Set＝清單全顯示）
};
// 搜尋（NPI 任務清單）：即時過濾·重繪後把游標移回搜尋框末端（保持連續輸入）
App.setTaskSearch = function(projId, val) {
  this._taskSearch = this._taskSearch || {};
  this._taskSearch[projId] = val;
  this.renderProject();
  const el = document.getElementById('taskSearchInput');
  if (el) { el.focus(); const n = el.value.length; if (el.setSelectionRange) el.setSelectionRange(n, n); }
};

// ─── 專案 KPI/階段/部門/任務 CRUD（taskDisplayProgress 留 core）───
// 第一原則「資料缺損容忍」:全計數排除 _deleted;分母 0 顯示 —;缺欄位優雅降級,不報錯不出 NaN。
// 推導理由(混合制):卡片格子小 → 公式+降級說明放原生 title tooltip(pm-core 無 tooltip 元件,先例:PDCA 預期進度卡);
//                  關鍵降級數字(無日期件數/逾期天數)放卡片副標常駐顯示,不藏 hover。
App.buildProjKpiHtml = function(proj) {
  const tasks = DATA.tasks.filter(t => t.project === proj.id && !t._deleted);
  const total = tasks.length;
  const today = D.today();

  const done = tasks.filter(t => t.status === 'done').length;
  const donePct = total > 0 ? Math.round(done / total * 100) : null;   // 分母 0 → null → 顯示 —
  const wip = tasks.filter(t => t.status === 'wip').length;

  // DELAYED:未完成且有效結束日<今天(不含擱置=刻意凍結非延遲)。
  // 無日期者不列入(不知 deadline 不能說延遲),另計 noEnd 常駐顯示於副標。
  let delayed = 0, noEnd = 0;
  tasks.forEach(t => {
    if (t.status === 'done' || t.status === 'hold') return;
    if (isTaskDelayed(t, today)) { delayed++; return; }
    if (!getEffectiveSchedule(t).end) noEnd++;
  });

  // OVERALL:§18.15 改按工作量加權(weightedProgress·工期×投入程度＝估計淨工作天,大任務算重)。
  // 取代舊「件數等權」——舊拍板不用 estHours 是因粗衍生值不可靠;新權重走 taskIntensity(netWorkDays/投入程度)較實在,且與總覽整體進度同一口徑(全站對得上)。
  // 進度取值仍共用 taskDisplayProgress:無數值→狀態折算(done=100、其餘=0),0 折算保守但誠實。
  const overall = total > 0 ? weightedProgress(tasks) : null;

  // WORKDAYS LEFT:終點優先序 可販日(pdcaData.targetDate) > 最晚任務有效結束日 > 未設定。
  // workdaysBetween 含頭含尾、s>e 回 0 → 逾期須先比日期,逾期天數反向算再 -1(=終點次一工作日起算)。
  const targetDate = (proj.pdcaData && proj.pdcaData.targetDate) || '';
  let endDate = targetDate;
  if (!endDate) {
    tasks.forEach(t => { const e = getEffectiveSchedule(t).end; if (e && e > endDate) endDate = e; });
  }
  let wdLeft = null, overdueWd = 0;
  if (endDate) {
    if (new Date(endDate) < today) { wdLeft = 0; overdueWd = Math.max(0, D.workdaysBetween(endDate, today) - 1); }
    else wdLeft = D.workdaysBetween(today, endDate);
  }

  // dataTip 格式「標題|內文|內文…」走 initTooltip;stack=true 時 sub 改獨立第二行(.stat-sub),非 stack 維持 inline span
  const card = (label, value, sub, dataTip, warn, stack, tone) => `
    <div class="stat${warn ? ' kpi-warn' : ''}${stack && sub ? ' kpi-stack' : ''}${tone ? ' ' + tone : ''}"${dataTip ? ` data-tip="${U.esc(dataTip)}"` : ''}>
      <div class="stat-num">${value}</div>
      <div class="stat-label">${label}${sub && !stack ? ` <span class="stat-pct">${sub}</span>` : ''}</div>
      ${stack && sub ? `<div class="stat-sub">${sub}</div>` : ''}
    </div>`;

  return `<div class="stats-row proj-kpi">
    ${card('任務總數', total, '',
      '任務總數|這個專案的所有工作項目數(不含已刪除)', false, false, 'kpi-tone-task')}
    ${card('已完成', done, donePct === null ? '—' : donePct + '%',
      '完成件數|已完成的工作項目數|完成% = 已完成 ÷ 任務總數', false, true, 'kpi-tone-done')}
    ${card('進行中', wip, '',
      '進行中|正在進行、還沒完成的項目數', false, false, 'kpi-tone-wip')}
    ${card('延誤', delayed, noEnd > 0 ? `另${noEnd}件無日期` : '',
      '延遲件數|已過結束日但還沒完成的項目數|(暫停的不算;沒設日期的另計)',
      delayed > 0, false, 'kpi-tone-delayed')}
    ${card('整體進度', overall === null ? '—' : overall + '%', '',
      '整體完成度|按工作量加權(工期×每日投入程度),工作量大的任務影響較大', false, false, 'kpi-tone-overall')}
    ${card('剩餘工作天', wdLeft === null ? '—' : wdLeft,
      wdLeft === null ? '未設定' : (overdueWd > 0 ? `已逾期${overdueWd}工作日` : `至${endDate}`),
      '剩餘工作天|到專案結束日還剩幾個上班日(不含週末假日)',
      overdueWd > 0, false, 'kpi-tone-days')}
  </div>`;
};

// ─── 專案階段進度卡(圖1 第二塊):純顯示層,讀 getProjectStages 不改它 ───
// 完成% = 該階段任務進度平均(件數等權,taskDisplayProgress 與 KPI OVERALL 同口徑)。
// (b) 案:不動已驗的 getProjectStages,完成%在此 re-filter 自算;回家有 node 後揉回一次收斂(已記待辦)。
// 推導理由(混合制):卡底常駐公式一行(PDCA pr-formula 模式);每列 data-tip hover 白話說明(走 initTooltip)。
// 2.2KW 另案不做子分區(不寫死 "2.2" 字串),數字前綴排序自然排尾;等真實 Sheet 資料核對後再定。
App.buildProjStagesHtml = function(proj) {
  const stages = this.getProjectStages(proj.id);
  if (stages.length === 0 || (stages.length === 1 && stages[0].name === '未分階段')) {
    return `<div class="proj-stages-card">
      <div class="proj-stages-head">階段進度</div>
      <div class="proj-stages-empty">此專案未分階段(同步專案會自動帶入 PLM 階段)</div>
    </div>`;
  }
  const stageOf = (t) => (typeof t.stage === 'string' && t.stage.trim()) ? t.stage.trim() : '未分階段';
  const tasks = DATA.tasks.filter(t => t.project === proj.id && !t._deleted && !t.isPmCoord);   // §19.10 F.3：常駐列不佔階段件數

  // 日期區間：起迄兩行標籤、完整 YYYY/MM/DD；空值顯 –
  const rangeStr = (s, e) => {
    const sLine = s ? `<span class="stage-date-lbl">起</span> ${D.fmt(s, 'ymd')}` : '<span class="stage-date-lbl">起</span> –';
    const eLine = e ? `<span class="stage-date-lbl">迄</span> ${D.fmt(e, 'ymd')}` : '<span class="stage-date-lbl">迄</span> –';
    return `${sLine}<br>${eLine}`;
  };

  const rowHtml = (st) => {
    const ts = tasks.filter(t => stageOf(t) === st.name && (t.variant || null) === st.variantId);
    const pct = ts.length > 0
      ? Math.round(ts.reduce((s, t) => s + taskDisplayProgress(t), 0) / ts.length)
      : null;
    const tier = pct === null ? 's0' : (pct >= 100 ? 's100' : (pct >= 50 ? 's50' : (pct > 0 ? 's1' : 's0')));
    const dateStr = rangeStr(st.earliestStart, st.latestEnd);
    const dateCls = (st.earliestStart || st.latestEnd) ? '' : ' stage-date-empty';
    return `<div class="stage-row">
      <div class="stage-name">
        <div class="stage-name-txt">${U.esc(st.name)}</div>
        <div class="stage-date${dateCls}">${dateStr}</div>
      </div>
      <div class="stage-bar"><div class="stage-bar-fill ${tier}" style="width:${pct || 0}%"></div></div>
      <div class="stage-pct ${tier}">${pct === null ? '—' : pct + '%'}</div>
      <div class="stage-cnt">${st.doneCount}/${st.itemCount}</div>
    </div>`;
  };

  const colHead = `<div class="stage-colhead">
      <div class="stage-name"></div><div class="stage-bar-spacer"></div>
      <div class="stage-pct-h">完成</div><div class="stage-cnt-h">完成/件數</div>
    </div>`;

  // 分塊：proj.variants 有值→按案別分塊；無→單組顯示(其他專案維持原樣)
  const variantList = (proj.variants && proj.variants.length) ? proj.variants : null;
  let blocks;
  if (variantList) {
    blocks = variantList.map((vr, i) => {
      const gs = stages.filter(st => st.variantId === vr.id);
      if (gs.length === 0) return '';
      const cap = `<div class="stage-group-cap"><span class="stage-cap-pill cap-${i % 3}">${U.esc(vr.name)}</span><span class="stage-cap-rule"></span></div>`;
      return cap + colHead + gs.map(rowHtml).join('');
    }).join('');
    const noVar = stages.filter(st => !st.variantId);
    if (noVar.length) blocks += colHead + noVar.map(rowHtml).join('');
  } else {
    blocks = colHead + stages.map(rowHtml).join('');
  }

  return `<div class="proj-stages-card">
    <div class="proj-stages-head">階段進度 <span class="proj-stages-count">${stages.length} 個階段</span></div>
    ${App.buildHintBox({
      key: 'stage-progress', icon: 'ti-stairs', title: '階段進度怎麼算', summary: '完成%、件數、日期的計算方式', collapsed: true,
      bodyHtml:
        '<div class="ht-rule ht-start"><b>完成%</b><span>將這階段「所有任務的進度」加起來算平均（每個任務的影響力都一樣）。任務有寫進度就依比例計算；沒寫進度的話，已完成的算 100%、沒完成的算 0%。例：階段內有 4 個任務，進度分別是 100 / 50 / 0 / 0，平均下來該階段進度就是 38%。</span></div>' +
        '<div class="ht-rule ht-dur"><b>件數</b><span>顯示「已完成的任務數 / 總任務數」。例：5/16 代表這個階段總共有 16 個任務，目前已經搞定 5 個。</span></div>' +
        '<div class="ht-rule ht-end"><b>日期</b><span>自動抓取這階段裡「最早開始」到「最晚結束」的任務時間，代表整個階段預計要跑的時間跨度。</span></div>' +
        '<div class="ht-rule ht-down"><b>同名階段分開算</b><span>主專案和子專案即使有同名的階段（例如都叫「手工機」），系統也會貼心地把它們各自獨立成一桶、分開計算，絕對不會混在一起。</span></div>'
    })}
    ${blocks}
  </div>`;
};

// ─── 專案部門負荷卡(圖1 第三塊):純顯示層 ───
// 分組三層降級(第一原則:資料缺損容忍):
//   有任一 subgroup → 依子群組(個別空→「未指派」);全無 subgroup 有 owner → 依負責人(標示於標題);
//   兩者全無 → 收斂一句話。動態去重,有什麼列什麼——不寫死部門名單(舊系統 deptKeys/HIDDEN/ORDER 不照抄)。
// owner 不拆頓號多人:拆了一件算多件、總數失真(舊系統有拆,不照抄);公式小字註明依原值分組。
// 每任務恰好進一段(優先序):done → delayed(同 KPI 口徑:非hold且有效end<today) → wip → todo(=未開始+擱置)。
// §18.10c／§19.10 F.3：內頁右欄負荷欄＝3 張卡（部門負荷工時·不含PM → PM 負荷＝常駐協調＋顯性 PM 任務 → 緊急 issue）
App.buildProjLoadCol = function(proj) {
  const daily = DATA.settings.dailyHours || 6;
  const today = D.today();
  const idToName = {};
  (proj.depts || []).forEach(d => { idToName[d.id] = d.name; });
  const dName = v => v ? (idToName[v] || v) : '未指派';
  const tasks = DATA.tasks.filter(t => t.project === proj.id && !t._deleted);

  // 卡1：本案部門負荷（總工時·不含 PM）＝非 PM 任務 Σ(投入% × 日工時 × 工期)，每部門拆「已完工／未完成」兩段（§18.10c 定版 2026-07-05：改總負荷拆段，讓完工段與『完工帳』對得起來）
  const deptDone = {}, deptWip = {}, deptRest = {};
  tasks.forEach(t => {
    if (t.measureType === 'hours') return;
    if (isPmTask(t, proj)) return;   // PM 走 PM 負荷卡（§18.10c 單一判定：isPmCoord／role／部門名=PM）
    const nm = dName(t.dept);
    const h = taskIntensity(t) * daily * (t.durationDays || 0);   // §18.10d 日均強度（netWorkDays 未填＝effortRatio/100 等值）
    if (t.status === 'done') deptDone[nm] = (deptDone[nm] || 0) + h;
    else if (t.status === 'wip') deptWip[nm] = (deptWip[nm] || 0) + h;
    else deptRest[nm] = (deptRest[nm] || 0) + h;   // 未開始／擱置
  });
  const deptRows = [...new Set([...Object.keys(deptDone), ...Object.keys(deptWip), ...Object.keys(deptRest)])]
    .map(nm => { const done = deptDone[nm] || 0, wip = deptWip[nm] || 0, rest = deptRest[nm] || 0; return { nm, done, wip, rest, tot: done + wip + rest }; })
    .sort((a, b) => ((a.nm === '未指派') - (b.nm === '未指派')) || (b.tot - a.tot));
  // 進度條：對「各部門自身總工時」的比例填色＝完工(實心)＋進行中(中)，未開始留白（Paul 2026-07-05）；負荷量看右側總時數
  const pct = (part, tot) => tot > 0 ? Math.round(part / tot * 100) : 0;
  const deptCard = `<div class="proj-stages-card pl-card">
    <div class="proj-stages-head dept-head"><span>本案部門負荷<span class="pl-sub">總工時 · 進度＝完工＋進行中（未開始留白）· 不含 PM</span></span><button class="pl-hist-btn" onclick="App.openLoadHistory('${proj.id}')" title="點看「已完工」段的階段×部門明細（與下方各列的完工工時對得起來）">📜 完工帳</button></div>
    ${deptRows.length ? deptRows.map(r => `<div class="pl-drow">
      <div class="pl-dtop"><span class="pl-name">${U.esc(r.nm)}</span><span class="pl-h">${Math.round(r.tot)}h</span></div>
      <div class="pl-bar split"><div class="pl-fill dept-done" style="width:${pct(r.done, r.tot)}%"></div><div class="pl-fill dept-wip" style="width:${pct(r.wip, r.tot)}%"></div></div>
      <div class="pl-dsub"><span class="pl-done-n">完工 ${Math.round(r.done)}h</span><span class="pl-wip-n">進行 ${Math.round(r.wip)}h</span></div>
    </div>`).join('') + `<div class="pl-legend"><span class="pl-lg pl-lg-done">已完工</span><span class="pl-lg pl-lg-wip">進行中</span><span class="pl-lg pl-lg-blank">未開始＝留白</span></div>` : '<div class="proj-stages-empty">本案無其他部門工時</div>'}
  </div>`;

  // 卡2：本案 PM 負荷——依專案階段順序（getProjectStages 單一真實來源，規則13）每階段一列、依 variant 分組。
  // 整階段實際 task 全結案才反灰（不計負荷、當參考，§18.10c）；否則可調投入%。同階段常駐/顯性擇一（不雙算）。
  const _SNAP = [0, 10, 25, 50, 75, 100];
  const snapEff = v => _SNAP.reduce((a, b) => Math.abs(b - v) < Math.abs(a - v) ? b : a, 100);
  const taskHrs = t => taskIntensity(t) * daily * (t.durationDays || 0);   // §18.10d 日均強度（netWorkDays 未填＝effortRatio/100 等值）
  const stageTasks = sm => tasks.filter(t => (t.variant || '') === (sm.variantId || '') &&
    (((typeof t.stage === 'string' && t.stage.trim()) ? t.stage.trim() : '未分階段') === sm.name));
  const varName = vid => { const v = (proj.variants || []).find(x => x.id === vid); return v ? v.name : ''; };
  const rowObjs = [];
  this.getProjectStages(proj.id).forEach(sm => {   // 已按 variant+minWbs 排序＝專案階段順序
    const all = stageTasks(sm);
    const pm = all.filter(t => t.measureType !== 'hours' && isPmTask(t, proj));
    if (!pm.length) return;                                        // 該階段無 PM 負荷 → 不列
    const real = all.filter(t => !t.isPmCoord);                    // 實際 task（排除常駐 pseudo）
    const complete = real.length > 0 && real.every(t => t.status === 'done');   // 整階段全結案才灰
    const active = pm.filter(t => t.status !== 'done');
    const hrs = (complete ? pm : active).reduce((s, t) => s + taskHrs(t), 0);
    rowObjs.push({ sm, vid: sm.variantId || '', complete, hrs, active });
  });
  const anyPm = rowObjs.length > 0;
  const pmTotal = rowObjs.filter(r => !r.complete).reduce((s, r) => s + r.hrs, 0);   // 合計不含已完成
  const maxPm = Math.max(1, ...rowObjs.map(r => r.hrs));
  const showVarHeads = new Set(rowObjs.map(r => r.vid)).size > 1;
  let curVar = '\x00';
  const stageRows = rowObjs.map(r => {
    let head = '';
    if (showVarHeads && r.vid !== curVar) { curVar = r.vid; head = `<div class="pl-vhead">${U.esc(varName(r.vid))}</div>`; }
    if (r.complete) {
      return head + `<div class="pl-crow pl-dim">
      <div class="pl-cstage">${U.esc(r.sm.name)}</div>
      <div class="pl-done-tag">已完成</div>
      <div class="pl-bar"><div class="pl-fill done" style="width:${Math.round(r.hrs / maxPm * 100)}%"></div></div>
      <div class="pl-h">${Math.round(r.hrs)}h</div>
    </div>`;
    }
    const expl = r.active.filter(t => !t.isPmCoord);
    const cor = r.active.filter(t => t.isPmCoord);
    let sel;
    if (expl.length) {
      const rep = snapEff(expl.reduce((s, t) => s + (t.effortRatio != null ? t.effortRatio : 100), 0) / expl.length);
      sel = `<select class="pl-pct" onchange="App.setProjStagePmEffort('${proj.id}', '${U.esc(r.vid)}', '${U.esc(r.sm.name)}', this.value)">${App._ecnEffortOptions(rep)}</select>`;
    } else if (cor.length) {
      sel = `<select class="pl-pct" onchange="App.setProjStageCoord('${cor[0].id}', this.value)">${App._ecnEffortOptions(cor[0].effortRatio)}</select>`;
    } else { sel = '<div class="pl-done-tag">—</div>'; }
    return head + `<div class="pl-crow">
      <div class="pl-cstage">${U.esc(r.sm.name)}</div>
      ${sel}
      <div class="pl-bar"><div class="pl-fill pm" style="width:${Math.round(r.hrs / maxPm * 100)}%"></div></div>
      <div class="pl-h">${Math.round(r.hrs)}h</div>
    </div>`;
  }).join('');
  // 常駐顯示（規則16／§18.10c）：空值不隱藏，顯示「一鍵設定」引導入口
  const pmCard = `<div class="proj-stages-card pl-card">
    <div class="proj-stages-head"><i class="ti ti-user-cog"></i> 本案 PM 負荷<span class="pl-sub">常駐協調 + 顯性任務</span></div>
    ${stageRows}
    ${!anyPm ? `<div class="pl-empty-cta">
      <div class="proj-stages-empty">尚未有任何 PM 負荷</div>
      <button class="pl-cta-btn" onclick="App.seedProjStageCoord('${proj.id}')">＋ 一鍵設定 PM 常駐協調</button>
    </div>` : ''}
    <div class="pl-total"><span>本案 PM 合計</span><span>${Math.round(pmTotal)}h</span></div>
  </div>`;

  // 卡3：即將到期／延遲（橋樑卡·§拆頁）——逾期＋未來 N 天內到期 Top5，點列開任務、「查看全部 →」跳任務清單 tab。口徑＝isTaskDelayed 單一來源。
  const SOON_DAYS = 7;
  const risks = App._classifyDueRisk(tasks, t => !t.isPmCoord && !t._deleted && t.status !== 'done', SOON_DAYS, today);
  const issueCard = `<div class="proj-stages-card pl-card">
    <div class="proj-stages-head risk-head">即將到期／延遲<span class="proj-stages-count">${risks.length}</span><button class="pl-risk-all" onclick="App.switchProjectView('list')">查看全部 →</button></div>
    ${risks.length ? risks.map(({ t, kind, days }) => `<div class="dept-overdue-row" onclick="App.openTaskModal('${t.id}')">
      <div class="dept-overdue-name"><div>${U.esc(t.name)}</div><div class="dept-overdue-sub">${U.esc(t.stage || '')} ${t.subgroup ? '/ ' + U.esc(t.subgroup) : ''}</div></div>
      <div class="dept-overdue-days ${kind === 'soon' ? 'soon' : ''}">${kind === 'over' ? '逾期 ' + days + ' 天' : (days === 0 ? '今日到期' : days + ' 天內到期')}</div>
    </div>`).join('') : '<div class="proj-stages-empty">目前無逾期或即將到期任務</div>'}
  </div>`;

  return deptCard + pmCard + issueCard;
};

// 規則13/15：「即將到期／延遲」分類+排序 單一來源（原內頁 risks 與 ECN 戰情室 dueItems 逐字元重複）。
// filterFn＝各自的前置過濾（isPmCoord/epoch 等差異）；rangeDays＝soon 到期門檻；today＝Date。回傳 Top5 [{t,kind:'over'|'soon',days}]，逾期優先、同組工時/天數排序。逾期口徑走 isTaskDelayed 單一來源。
App._classifyDueRisk = function(tasks, filterFn, rangeDays, today) {
  return (tasks || []).filter(filterFn).map(t => {
    const end = getEffectiveSchedule(t).end;
    if (!end) return null;
    const dd = D.daysBetween(today, new Date(end));   // >0 未來、<0 逾期
    if (isTaskDelayed(t, today)) return { t, kind: 'over', days: -dd };
    if (t.status !== 'hold' && dd >= 0 && dd <= rangeDays) return { t, kind: 'soon', days: dd };
    return null;
  }).filter(Boolean).sort((a, b) => (a.kind !== b.kind) ? (a.kind === 'over' ? -1 : 1) : (a.kind === 'over' ? b.days - a.days : a.days - b.days)).slice(0, 5);
};

// ─── 刀3 歷史負荷帳（§18.10c）：完工任務的 階段×部門 工時矩陣，從內頁部門負荷卡點開 ───
// 口徑＝統一核心（投入%×日工時×工期，done 才進帳、任務級：階段還在跑也看得到已沉澱工時）；
// 階段順序＝getProjectStages（規則13 單一來源）、多案別依 variant 分組；PM 走 isPmTask 同一把尺、列末欄。
App.openLoadHistory = function(projId) {
  const proj = this.getProj(projId); if (!proj) return;
  const daily = DATA.settings.dailyHours || 6;
  const idToName = {};
  (proj.depts || []).forEach(d => { idToName[d.id] = d.name; });
  const hrsOf = t => taskIntensity(t) * daily * (t.durationDays || 0);   // §18.10d 日均強度（完工帳與部門負荷卡完工段一致·netWorkDays 未填＝effortRatio/100 等值）
  const done = DATA.tasks.filter(t => t.project === projId && !t._deleted && t.status === 'done' && t.measureType !== 'hours');
  if (!done.length) {
    this.openModal({
      title: '📜 完工負荷帳（只列已完工任務）— ' + U.esc(proj.name),
      body: '<div class="proj-stages-empty" style="padding:16px 0;">尚無完工紀錄。任務結案（填實際完成日）後，其工時會沉澱到這本帳。</div>',
      footer: '<button class="tb-action ghost" onclick="App.closeModal()">關閉</button>',
    });
    return;
  }
  // 分桶：variant → stage → dept 欄（PM 用 isPmTask 歸「PM」欄、其餘部門名、無部門=未指派）
  const colOf = t => isPmTask(t, proj) ? 'PM' : (t.dept ? (idToName[t.dept] || t.dept) : '未指派');
  const acc = {};   // vid → stage → col → hrs
  done.forEach(t => {
    const vid = t.variant || '';
    const st = (typeof t.stage === 'string' && t.stage.trim()) ? t.stage.trim() : '未分階段';
    const vv = (acc[vid] = acc[vid] || {});
    const ss = (vv[st] = vv[st] || {});
    const c = colOf(t);
    ss[c] = (ss[c] || 0) + hrsOf(t);
  });
  // 欄序：名冊順序 → 未指派 → PM 殿後。非 PM 欄位涵蓋「本案所有部門」（含 0 完工者如品保），與內頁部門負荷卡的部門集對齊（Paul 2026-07-05）
  const usedCols = new Set();
  Object.values(acc).forEach(vv => Object.values(vv).forEach(ss => Object.keys(ss).forEach(c => usedCols.add(c))));
  // 全案非 PM 部門宇集（任一任務、不限完工）→ 讓 0 完工部門也現欄，內外對得上
  const deptUniverse = new Set();
  DATA.tasks.filter(t => t.project === projId && !t._deleted && t.measureType !== 'hours')
    .forEach(t => { if (!isPmTask(t, proj)) deptUniverse.add(t.dept ? (idToName[t.dept] || t.dept) : '未指派'); });
  const cols = (proj.depts || []).map(d => d.name).filter(n => n !== 'PM' && deptUniverse.has(n));
  [...deptUniverse].forEach(n => { if (n !== '未指派' && n !== 'PM' && !cols.includes(n)) cols.push(n); });   // 名冊外的部門保險補上
  if (deptUniverse.has('未指派')) cols.push('未指派');
  if (usedCols.has('PM')) cols.push('PM');
  const fmtH = h => h > 0 ? Math.round(h) + 'h' : '—';
  const varName = vid => { const v = (proj.variants || []).find(x => x.id === vid); return v ? v.name : ''; };
  const stages = this.getProjectStages(projId);   // 已按 variant+minWbs 排序（含未分階段桶）
  const grand = {};
  let grandAll = 0;
  const sections = [];
  const vids = [...new Set(stages.map(s => s.variantId || ''))].filter(vid => acc[vid]);
  const multi = vids.length > 1;
  vids.forEach(vid => {
    const vv = acc[vid];
    const rows = [];
    const vtotal = {};
    stages.filter(s => (s.variantId || '') === vid && vv[s.name]).forEach(s => {
      const ss = vv[s.name];
      const rowSum = cols.reduce((a, c) => a + (ss[c] || 0), 0);
      rows.push('<tr><td class="lh-st">' + U.esc(s.name) + '</td>' + cols.map(c => '<td class="lh-h">' + fmtH(ss[c] || 0) + '</td>').join('') + '<td class="lh-h lh-sum">' + fmtH(rowSum) + '</td></tr>');
      cols.forEach(c => { vtotal[c] = (vtotal[c] || 0) + (ss[c] || 0); grand[c] = (grand[c] || 0) + (ss[c] || 0); });
      grandAll += rowSum;
    });
    const vSum = cols.reduce((a, c) => a + (vtotal[c] || 0), 0);
    rows.push('<tr class="lh-total"><td class="lh-st">小計</td>' + cols.map(c => '<td class="lh-h">' + fmtH(vtotal[c] || 0) + '</td>').join('') + '<td class="lh-h lh-sum">' + fmtH(vSum) + '</td></tr>');
    sections.push((multi && varName(vid) ? '<div class="pl-vhead">' + U.esc(varName(vid)) + '</div>' : '') +
      '<div class="lh-scroll"><table class="lh-tbl"><thead><tr><th class="lh-st">階段</th>' + cols.map(c => '<th class="lh-h">' + U.esc(c) + '</th>').join('') + '<th class="lh-h lh-sum">合計</th></tr></thead><tbody>' + rows.join('') + '</tbody></table></div>');
  });
  const grandRow = multi ? '<div class="lh-grand"><span>全案完工合計</span><span>' + fmtH(grandAll) + '</span></div>' : '';
  this.openModal({
    wide: true,
    title: '📜 歷史負荷帳 — ' + U.esc(proj.name),
    body: sections.join('') + grandRow +
      '<div class="field-hint">只列完工任務（工時＝結案時的投入% × 日工時 × 工期，§18.10c 同一把尺）；當前負荷請看內頁負荷卡。</div>',
    footer: '<button class="tb-action ghost" onclick="App.closeModal()">關閉</button>',
  });
};

// §19.10 F.3：內頁調某階段 PM 常駐協調%（改 DATA task effortRatio＋估工時、存檔重繪）
App.setProjStageCoord = function(taskId, val) {
  const t = (DATA.tasks || []).find(x => x.id === taskId); if (!t) return;
  const daily = DATA.settings.dailyHours || 6;
  t.effortRatio = parseInt(val, 10) || 0;
  t.estHours = Math.round((t.effortRatio / 100) * daily * (t.durationDays || 0) * 10) / 10;
  Store.tasks.save();
  this.renderProject();
};

// §18.10c／規則16：內頁調某階段「顯性 PM 任務」投入%（把該階段所有非常駐 PM 任務的 effortRatio 一次設為該值）。
// 用途：商檢/安規等長階段 PM 不該預設 100%（時間長≠負荷高），逐階段下修。投入%不影響排程，改值即存重繪。
App.setProjStagePmEffort = function(projId, variantId, stage, val) {
  if (App._roGuard && App._roGuard()) return;
  const proj = this.getProj(projId); if (!proj) return;
  const v = parseInt(val, 10) || 0;
  DATA.tasks.forEach(t => {
    if (t.project !== projId || t._deleted) return;
    if ((t.variant || '') !== (variantId || '') || (t.stage || '—') !== stage) return;
    if (t.status === 'done' || t.measureType === 'hours' || t.isPmCoord) return;
    if (!isPmTask(t, proj)) return;
    t.effortRatio = v;
  });
  Store.tasks.save();
  this.renderProject();
};

// §18.10c／規則16：一鍵材料化本案 PM 各階段常駐協調列（Excel/無範本案的補設定入口）。
// 每 variant+stage 生一列 isPmCoord；預設%取範本 pmCoordEffort 對階段名、無則 25%。之後用 setProjStageCoord 逐階段調。
App.seedProjStageCoord = function(projId) {
  if (App._roGuard && App._roGuard()) return;
  const proj = this.getProj(projId); if (!proj) return;
  const daily = (DATA.settings && DATA.settings.dailyHours) || 6;
  const pmDept = (proj.depts || []).find(d => d.name === 'PM');
  const tpl = tplNpi();   // §19.11 getter：override 優先於內建
  const defByStage = {};
  if (tpl && tpl.stageDefaults) tpl.stageDefaults.forEach(s => { if (s.pmCoordEffort != null) defByStage[s.stage] = s.pmCoordEffort; });
  const DEFAULT_EFF = 25;
  // 該 variant+stage 已有顯性 PM 任務的集合 → 不建常駐（顯性已代表 PM 該階段工作，避免雙算，§18.10c）
  const explKeys = new Set();
  DATA.tasks.forEach(t => { if (t.project === projId && !t._deleted && !t.isPmCoord && t.stage && isPmTask(t, proj)) explKeys.add((t.variant || '') + ' ' + t.stage); });
  const groups = {};
  DATA.tasks.filter(t => t.project === projId && !t._deleted && t.stage && !t.isPmCoord && !isPmTask(t, proj)).forEach(t => {
    const key = (t.variant || '') + '\x00' + t.stage;
    (groups[key] = groups[key] || { variant: t.variant || '', stage: t.stage, tasks: [] }).tasks.push(t);
  });
  const created = [];
  Object.values(groups).forEach(g => {
    if (explKeys.has(g.variant + ' ' + g.stage)) return;   // 有顯性 PM 任務 → 跳過（避免雙算）
    if (DATA.tasks.some(t => t.project === projId && t.isPmCoord && (t.variant || '') === g.variant && t.stage === g.stage)) return;   // 防重複
    const ss = g.tasks.map(t => t.plannedStart).filter(Boolean).sort();
    const ee = g.tasks.map(t => t.plannedEnd).filter(Boolean).sort();
    if (!ss.length || !ee.length) return;
    const s0 = ss[0], e0 = ee[ee.length - 1];
    const span = Math.max(D.workdaysBetween(s0, e0), 1);
    const eff = (defByStage[g.stage] != null) ? defByStage[g.stage] : DEFAULT_EFF;
    created.push({
      id: U.id(), project: projId, wbs: 0, parentWbsId: '',
      name: 'PM 階段協調（常駐）', desc: g.stage + ' / PM 協調', category: 'deep', taskType: '任務',
      predecessor: '', durationDays: span, owner: '', dept: pmDept ? pmDept.id : '', role: 'PM',
      variant: g.variant, start: '', end: '', plannedStart: s0, plannedEnd: e0, actualStart: '', actualEnd: '',
      progress: 0, status: 'pending', urgency: 'med',
      estHours: Math.round(span * daily * (eff / 100) * 10) / 10,
      method: '', canSplit: false, completedAt: null, createdAt: new Date().toISOString(),
      scheduledStart: '', scheduledEnd: '', synced: false, stage: g.stage, subgroup: '',
      mustDeliver: false, deliverableType: '', requiredTask: true, mustIssue: false,
      deliverable: '', riskIssue: '', delivered: '', deliverableLink: '', note: '',
      effortRatio: eff, taskAttr: 'baseline', isPmCoord: true,
    });
  });
  if (!created.length) { U.toast('沒有可帶入的階段（任務缺計畫日期）', 'warning'); return; }
  DATA.tasks.push(...created);
  Store.tasks.save();
  this._pmCoordPrompted = this._pmCoordPrompted || {};
  this._pmCoordPrompted[projId] = true;
  U.toast('已帶入 PM ' + created.length + ' 個階段的常駐協調，可逐階段調整投入%', 'success');
  this.renderProject();
};

// §18.10c／規則16：進 NPI 內頁時，若尚未設定 PM 常駐協調（負荷空值），彈窗引導一鍵設定（同一 session 每案只提示一次）。
App._maybePromptPmCoord = function(proj) {
  if (!proj || proj.ecnType) return;                       // 只 NPI；ECN 常駐由範本帶
  if ((proj.status || 'active') !== 'active') return;
  this._pmCoordPrompted = this._pmCoordPrompted || {};
  if (this._pmCoordPrompted[proj.id]) return;
  const ts = DATA.tasks.filter(t => t.project === proj.id && !t._deleted);
  const seedable = ts.some(t => t.stage && !t.isPmCoord && !isPmTask(t, proj));   // 有「沒顯性 PM 的階段」可帶
  const hasCoord = ts.some(t => t.isPmCoord);
  const hasExplicitPm = ts.some(t => !t.isPmCoord && t.stage && isPmTask(t, proj));
  if (!seedable || hasCoord || hasExplicitPm) return;       // 無可帶階段／已設常駐／已有顯性 PM 負荷 → 不提示
  this._pmCoordPrompted[proj.id] = true;
  App.confirmModal({
    title: '尚未設定 PM 常駐協調負荷',
    msg: '本案還沒設定「PM 各階段常駐協調負荷」（背景盯場的投入%）。要現在一鍵帶入嗎？帶入後可在右欄「本案 PM 負荷」逐階段調整，也能之後再手動設定。',
    okText: '一鍵帶入', cancelText: '稍後再說', icon: 'ti-user-cog',
    onConfirm: () => App.seedProjStageCoord(proj.id),
  });
};

// ─── 批量編輯模式（Phase 2a-5，2026-07-03 Paul 定版）：勾多列→「編輯已選」彈窗一頁全欄位（不變更＝跳過）＋批量刪除 ───
// 可批量欄位＝階段/子群組/負責人/部門/緊急程度/狀態(pending·wip·hold，done走實際完成日不給批量)/投入%/需交付。
// 刻意排除：日期/工期/前置（批量改觸發排程下游連動＝整案重排，風險高；整批平移另議）。done 列不給勾。
App.toggleBulkEdit = function(projId) {
  this._bulkMode = this._bulkMode || {};
  this._bulkSel = this._bulkSel || {};
  this._bulkMode[projId] = !this._bulkMode[projId];
  if (!this._bulkMode[projId]) delete this._bulkSel[projId];   // 退出即清選取
  this.renderProject();
};
App._bulkSelOf = function(projId) {
  this._bulkSel = this._bulkSel || {};
  return (this._bulkSel[projId] = this._bulkSel[projId] || new Set());
};
App._bulkToggle = function(projId, taskId, checked) {
  const sel = this._bulkSelOf(projId);
  if (checked) sel.add(taskId); else sel.delete(taskId);
  const n = document.getElementById('bulk-count');
  if (n) n.textContent = sel.size;   // 輕量更新計數，不整頁重繪（保勾選手感/捲動位置）
};
App._bulkSelectAll = function(projId, checked) {
  const sel = this._bulkSelOf(projId);
  document.querySelectorAll('input.bulk-chk').forEach(cb => {   // 同時只會有一張表在畫面上（NPI 待辦表或 ECN 大表）
    cb.checked = checked;
    const row = cb.closest('tr');
    const id = row ? row.getAttribute('data-taskid') : null;
    if (!id) return;
    if (checked) sel.add(id); else sel.delete(id);
  });
  const n = document.getElementById('bulk-count');
  if (n) n.textContent = sel.size;
};
// 批量列（瘦身版，控件全進彈窗）：已選 N 筆＋引導小字＋「編輯已選」＋「批量刪除」（ECN 無批量刪除——刪除須走 ⚙ 編輯成因閉環）
App._bulkBarHtml = function(proj) {
  const sel = this._bulkSelOf(proj.id);
  return `<div class="bulk-bar">
    <span class="bulk-info">已選 <b id="bulk-count">${sel.size}</b> 筆</span>
    <span class="bulk-hint">勾選下方任務列，再按「編輯已選」一次修改多筆</span>
    <button class="tb-action" onclick="App._bulkOpenModal('${proj.id}')" style="margin-left:auto;">✏ 編輯已選</button>
    ${proj.ecnType ? '' : `<button class="tb-action danger" onclick="App._bulkDelete('${proj.id}')">批量刪除</button>`}
  </div>`;
};
// 批量編輯彈窗（M 檔，UI 規範 §6）：一頁全欄位可編，預設「不變更」；留空/不變更的欄位套用時跳過。
// 部門×負責人互斥（Paul 2026-07-03：同時改會指派衝突，如部門=PM 負責人=RD）＝擇一填；套用時走名冊連動（同 _ecnSetDept/_ecnSetOwner 語意）。
// ECN 變體：只留 負責人/部門/投入%（階段=骨架語意、狀態=實際優先衍生唯讀、緊急/需交付不在 ECN 大表）。
App._bulkOpenModal = function(projId) {
  const sel = this._bulkSelOf(projId);
  if (!sel.size) { U.toast('⚠ 請先勾選任務', 'warning'); return; }
  const proj = this.getProj(projId); if (!proj) return;
  const ecn = !!proj.ecnType;
  const KEEP = '<option value="__keep__" selected>— 不變更 —</option>';
  const owners = [...new Set(DATA.tasks.filter(t => t.project === projId && !t._deleted && t.owner).map(t => t.owner))].sort((a, b) => a.localeCompare(b, 'zh-Hant'));
  const tiers = App._EFFORT_TIERS.map(o => `<option value="${o.v}">${o.v}% ${o.short}</option>`).join('');
  const ownerDeptRow = `
      <div class="form-row">
        <div class="form-field"><label>負責人 <span data-tip="負責人×部門|擇一批量：填了負責人會自動歸到名冊上他所屬的部門" style="cursor:help;">?</span></label>
          <input id="blk-owner" list="blk-own-dl" placeholder="不變更（留空）" oninput="App._bulkOwnerDeptExcl('owner')"><datalist id="blk-own-dl">${owners.map(o => `<option value="${U.esc(o)}"></option>`).join('')}</datalist>
        </div>
        <div class="form-field"><label>部門 <span data-tip="負責人×部門|擇一批量：選了部門會自動帶該部門名冊擔當" style="cursor:help;">?</span></label>
          <select id="blk-dept" onchange="App._bulkOwnerDeptExcl('dept')">${KEEP}${ecn ? '' : '<option value="">未指派</option>'}${(proj.depts || []).map(d => `<option value="${d.id}">${U.esc(d.name)}</option>`).join('')}</select>
        </div>
      </div>`;
  const effortField = `
        <div class="form-field"><label>投入% <span data-tip="投入%|這件事吃掉某人一天的百分比；同一人同一天相加 >100% 就爆單" style="cursor:help;">?</span></label>
          <select id="blk-effort">${KEEP}${tiers}</select>
        </div>`;
  const npiRows = `
      <div class="form-row">
        <div class="form-field"><label>階段</label>
          <input id="blk-stage" list="blk-stage-dl" placeholder="不變更（留空）"><datalist id="blk-stage-dl">${this.stageDatalistOptions(projId)}</datalist>
        </div>
        <div class="form-field"><label>子群組</label>
          <input id="blk-subgroup" list="blk-sub-dl" placeholder="不變更（留空）"><datalist id="blk-sub-dl">${this.subgroupDatalistOptions(projId)}</datalist>
        </div>
      </div>
      ${ownerDeptRow}
      <div class="form-row">
        <div class="form-field"><label>緊急程度</label>
          <select id="blk-urgency">${KEEP}<option value="high">🔴 緊急</option><option value="medium">🟡 普通</option><option value="low">🟢 不急</option></select>
        </div>
        <div class="form-field"><label>狀態 <span data-tip="狀態|已完成走任務的「實際完成日」，不提供批量" style="cursor:help;">?</span></label>
          <select id="blk-status">${KEEP}<option value="pending">未開始</option><option value="wip">進行中</option><option value="hold">擱置</option></select>
        </div>
      </div>
      <div class="form-row">
        ${effortField}
        <div class="form-field"><label>需交付</label>
          <select id="blk-deliver">${KEEP}<option value="1">需交付 ✓</option><option value="0">不需交付</option></select>
        </div>
      </div>`;
  const ecnRows = `
      ${ownerDeptRow}
      <div class="form-row">
        ${effortField}
        <div class="form-field"></div>
      </div>`;
  this.openModal({
    title: `批量編輯（已選 ${sel.size} 筆）`,
    body: `<div class="task-form">
      ${ecn ? ecnRows : npiRows}
      <div class="field-hint">留空或「不變更」的欄位不會動到任務。<b>負責人與部門擇一批量</b>（互相連動，避免指派衝突）。日期／工期／前置不支援批量（會連動整批重排），請逐筆調整。</div>
    </div>`,
    footer: `
      <button class="tb-action ghost" onclick="App.closeModal()">取消</button>
      <button class="tb-action" onclick="App._bulkApplyFromModal('${projId}')">套用到 ${sel.size} 筆</button>
    `,
  });
};
// 部門×負責人互斥：填一邊就鎖另一邊（清回不變更即解鎖）
App._bulkOwnerDeptExcl = function(which) {
  const owner = document.getElementById('blk-owner');
  const dept = document.getElementById('blk-dept');
  if (!owner || !dept) return;
  if (which === 'dept') {
    const on = dept.value !== '__keep__';
    if (on) owner.value = '';
    owner.disabled = on;
  } else {
    const on = !!owner.value.trim();
    if (on) dept.value = '__keep__';
    dept.disabled = on;
  }
};
App._bulkApplyFromModal = function(projId) {
  if (App._roGuard()) return;
  const proj = this.getProj(projId); if (!proj) return;
  const ecn = !!proj.ecnType;
  const sel = this._bulkSelOf(projId);
  const v = id => { const e = document.getElementById(id); return e ? e.value : '__keep__'; };
  const txt = id => { const e = document.getElementById(id); return e ? e.value.trim() : ''; };
  const ops = [];   // [欄位名, setter]
  if (txt('blk-stage')) ops.push(['階段', t => t.stage = txt('blk-stage')]);
  if (txt('blk-subgroup')) ops.push(['子群組', t => t.subgroup = txt('blk-subgroup')]);
  // 負責人×部門互斥（UI 已鎖，一次只會有一邊），套用時走名冊連動（同 _ecnSetDept/_ecnSetOwner 語意，規則13 複用）
  if (txt('blk-owner')) ops.push(['負責人', t => {
    const name = txt('blk-owner');
    t.owner = name;
    const d = (proj.depts || []).find(dp => (dp.members || []).some(m => m.name === name));
    if (d) { t.dept = d.id; if (ecn) t.role = d.name; }   // 名冊找得到 → 自動歸其部門
  }]);
  if (v('blk-dept') !== '__keep__') ops.push(['部門', t => {
    const dId = v('blk-dept');
    const d = (proj.depts || []).find(dp => dp.id === dId);
    t.dept = dId;
    if (ecn && d) t.role = d.name;
    if (d && !(d.members || []).some(m => m.name === t.owner)) {   // 現擔當不屬新部門 → 帶該部門第一個有名字的擔當
      const fm = (d.members || []).find(m => m.name);
      t.owner = fm ? fm.name : '';
    }
  }]);
  if (v('blk-urgency') !== '__keep__') ops.push(['緊急程度', t => t.urgency = v('blk-urgency')]);
  if (v('blk-status') !== '__keep__') ops.push(['狀態', t => t.status = v('blk-status')]);
  if (v('blk-effort') !== '__keep__') ops.push(['投入%', t => t.effortRatio = parseInt(v('blk-effort'), 10) || 0]);
  if (v('blk-deliver') !== '__keep__') ops.push(['需交付', t => t.mustDeliver = v('blk-deliver') === '1']);
  if (!ops.length) { U.toast('⚠ 沒有要變更的欄位（全部維持不變更）', 'warning'); return; }
  let n = 0;
  sel.forEach(id => {
    const t = DATA.tasks.find(x => x.id === id);
    if (!t || t._deleted || t.status === 'done') return;   // done 防呆（理論上勾不到）
    ops.forEach(([, set]) => set(t));
    n++;
  });
  Store.tasks.save();
  this.closeModal();
  this.renderProject();
  U.toast(`已套用 ${ops.map(o => o[0]).join('、')} 到 ${n} 筆`, 'success');
};
App._bulkDelete = function(projId) {
  if (App._roGuard()) return;
  const sel = this._bulkSelOf(projId);
  if (!sel.size) { U.toast('⚠ 請先勾選任務', 'warning'); return; }
  App.confirmModal({
    icon: 'ti-trash', iconBg: '--rose-l', iconColor: '--rose-ink',
    title: `批量刪除 ${sel.size} 筆任務？`, msg: '刪除的任務會移到專案下方「🗑 已刪除」區塊保留 14 天，期間可隨時還原。', okText: '刪除', cancelText: '取消', okClass: 'danger',
    onConfirm: () => {
      let n = 0;
      sel.forEach(id => {
        const t = DATA.tasks.find(x => x.id === id);
        if (!t || t._deleted) return;
        t._deleted = true;
        t._deletedAt = new Date().toISOString();
        if (DATA.schedule && DATA.schedule.items) DATA.schedule.items = DATA.schedule.items.filter(it => it.taskId !== id);
        n++;
      });
      sel.clear();
      Store.tasks.save();
      Store.schedule.save();   // 上方移除了 schedule.items 中對應項
      App.renderProject();
      U.toast(`已刪除 ${n} 筆（可在已刪除區還原）`, 'success');
    },
  });
};

App.toggleProjectExpanded = function(projId) {
  this._projectExpanded = this._projectExpanded || {};
  this._projectExpanded[projId] = !this._projectExpanded[projId];
  this.renderProject();
};

App.toggleDoneVisible = function(projId) {
  this._doneVisible = this._doneVisible || {};
  this._doneVisible[projId] = !this._doneVisible[projId];
  this.renderProject();
};

App.toggleToScheduleVisible = function(projId) {
  this._toScheduleVisible = this._toScheduleVisible || {};
  // 預設展開：未設過視為 true，第一次點 → false（收合）
  const cur = this._toScheduleVisible[projId] !== false;
  this._toScheduleVisible[projId] = !cur;
  this.renderProject();
};

// ─── Soft delete / restore ───
App.restoreTask = function(id) {
  const t = DATA.tasks.find(x => x.id === id);
  if (!t) return;
  delete t._deleted;
  delete t._deletedAt;
  Store.tasks.save();
  this.refreshAll();
  U.toast('↺ 已還原');
};

App.permanentDeleteTask = function(id) {
  App.confirmModal({
    icon: 'ti-alert-triangle', iconBg: '--rose-l', iconColor: '--rose-ink',
    title: '永久刪除？', msg: '此操作無法復原。', okText: '永久刪除', cancelText: '取消', okClass: 'danger',
    onConfirm: () => {
      DATA.tasks = DATA.tasks.filter(t => t.id !== id);
      if (DATA.schedule && DATA.schedule.items) {
        DATA.schedule.items = DATA.schedule.items.filter(it => it.taskId !== id);
      }
      Store.tasks.save();
      Store.schedule.save();   // 上方移除了 schedule.items 中對應項
      App.refreshAll();
      U.toast('🗑 已永久刪除');
    },
  });
};

// 自動清除逾期 14 天的軟刪除任務（在 load 時呼叫）
App.cleanExpiredDeletedTasks = function() {
  const cutoff = D.addDays(D.today(), -14);
  const before = DATA.tasks.length;
  DATA.tasks = DATA.tasks.filter(t => {
    if (!t._deleted) return true;
    const delDate = new Date(t._deletedAt || 0);
    return delDate > cutoff; // 14 天內保留
  });
  if (before !== DATA.tasks.length) {
    Store.tasks.save();
  }
};

App.buildTaskRowHtml = function(t, cls) {
  const sch = getEffectiveSchedule(t);
  const cat = t.taskType === 'milestone' ? 'milestone' : (t.category || 'deep');  // M2-T3：milestone 優先於 category，修 WBS 里程碑誤顯「會議」tag
  const isPreview = !DATA.settings.previewWeeks ? false : (
    sch.end && D.daysBetween(D.today(), new Date(sch.end)) > 7 && D.daysBetween(D.today(), new Date(sch.end)) <= (DATA.settings.previewWeeks * 7)
  );
  let dlText = '—';
  let dlClass = '';
  if (sch.end) {
    const days = D.daysBetween(D.today(), new Date(sch.end));
    if (days < 0)      { dlText = `逾${D.workdaysBetween(sch.end, D.today()) - 1}`; dlClass = 'overdue'; }      // 短格式（截止欄窄）：逾41 / 今日 / 明日 / 2天 / 7/10
    else if (days === 0) { dlText = '今日'; dlClass = 'near'; }
    else if (days === 1) { dlText = '明日'; dlClass = 'near'; }
    else if (days <= 3)  { dlText = `${days}天`; dlClass = 'near'; }
    else                 { dlText = D.fmt(new Date(sch.end), 'md'); }
  }

  // 開始→完成 區間（純顯示，讀 sch.start/sch.end；任一空顯示 '—'。日期格式沿用 D.fmt(date,'md')）
  const rangeText = (sch.start && sch.end)
    ? `${D.fmt(new Date(sch.start), 'md')} → ${D.fmt(new Date(sch.end), 'md')}`
    : '—';
  // §6.5 塊四：負工期（完成日早於開始日 或 工期≤0）→ 整列標紅警示；milestone(工期恆1)不誤觸發。
  const _negDur = (t.taskType !== 'milestone')
    && ((sch.start && sch.end && new Date(sch.end) < new Date(sch.start))
        || (parseFloat(t.durationDays) <= 0));
  // 來源中文標籤（讀 getEffectiveSchedule 的 startSource；'none' 留空不顯示）
  const SRC_LABELS = { planned: '預計（未排程）', scheduled: '排程算出', override: '手釘錨點', actual: '實際', manual: '手填' };
  const srcLabel = SRC_LABELS[sch.startSource] || '';

  // 進度：taskDisplayProgress 回 0-100；100% 成功色、其餘次要色（2 態，不用階段卡 s0/s1/s50/s100 四階）
  const pct = taskDisplayProgress(t);
  const barColor = pct >= 100 ? 'var(--sage-500)' : 'var(--ink4)';

  // 狀態徽章：延遲（overdue 且非 done/非 hold）優先於 status；其餘讀 STATUS_LABELS_ZH。色用現成 .rp-status 修飾
  const isDelayed = dlClass === 'overdue' && t.status !== 'done' && t.status !== 'hold';
  const statusCls = isDelayed ? 'late' : (t.status === 'done' ? 'done' : (t.status === 'wip' ? 'wip' : ''));
  const statusTxt = isDelayed ? '延遲' : (STATUS_LABELS_ZH[t.status] || t.status || '');

  // 餘裕：sch.end − 今天(工作日,含頭尾故 -1);done 或無 end 顯 '—'
  let slackTxt;
  if (t.status === 'done' || !sch.end) {
    slackTxt = '—';
  } else {
    const today = D.today();
    today.setHours(0, 0, 0, 0);
    if (new Date(sch.end) < today) {
      slackTxt = '超' + (D.workdaysBetween(sch.end, today) - 1) + '天';
    } else {
      slackTxt = '餘' + (D.workdaysBetween(today, sch.end) - 1) + '天';
    }
  }

  // 批量編輯（2a-5）：模式開啟時最前加勾選格；done 列不給勾（完工＝歷史帳）；stopPropagation 防觸發列點擊開彈窗
  const _bk = (this._bulkMode || {})[t.project];
  const _bkSel = _bk && this._bulkSel && this._bulkSel[t.project];
  const chkTd = _bk ? (t.status === 'done'
    ? '<td class="col-chk"></td>'
    : `<td class="col-chk" onclick="event.stopPropagation()"><input type="checkbox" class="bulk-chk" ${_bkSel && _bkSel.has(t.id) ? 'checked' : ''} onchange="App._bulkToggle('${t.project}','${t.id}', this.checked)"></td>`) : '';
  return `<tr class="task-row ${t.status === 'done' ? 'done' : ''} ${_negDur ? 'neg-dur' : ''} ${cls || ''}" data-taskid="${t.id}" onclick="App.openTaskModal('${t.id}')">
    ${chkTd}
    <td class="col-num">${_negDur ? '<span class="neg-flag" data-tip="負工期|工期為負數，請確認是否調整">⚠</span>' : ''}<span style="font-family:var(--mono); font-size:11px; color:var(--ink4);">${App._seqOf(t.id)}</span></td>
    <td class="col-mid"><span style="font-size:12px; color:var(--ink2);">${U.esc(t.stage || '—')}</span></td>
    <td class="col-flex" title="${U.esc(t.name)}">
      <div class="task-info">
        <div class="task-name" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${U.esc(t.name)}
          ${isPreview ? '<span class="preview-tag">📅 兩週預告</span>' : ''}
        </div>
      </div>
    </td>
    <td class="col-mid">
      <div style="display:flex; justify-content:flex-start; align-items:center; gap:6px;">
        <div class="stage-bar" style="border:1px solid var(--rule2);"><div class="stage-bar-fill" style="width:${pct}%; background:${barColor};"></div></div>
        <span style="font-family:var(--mono); font-size:10.5px; color:var(--ink3); min-width:30px; text-align:right;">${pct}%</span>
      </div>
    </td>
    <td class="col-mid"><span style="font-size:12px; color:var(--ink2);">${U.esc(t.owner || '—')}</span></td>
    <td class="col-mid task-pred" data-preds="${parsePredecessors(t.predecessor).map(p => p.dep).join(',')}" onmouseenter="App._s2PredHlOn(this)" onmouseleave="App._s2PredHlOff()" title="${U.esc(predTitleOf(t.predecessor))}">${U.esc(prettyPredecessor(t.predecessor))}</td>
    <td class="col-num"><span class="rp-status ${statusCls}">${statusTxt}</span></td>
    <td class="col-mid">
      <div style="display:flex; flex-direction:column; align-items:flex-start; gap:2px;">
        <span class="task-range${_negDur ? ' neg' : ''}"${_negDur ? ' data-tip="負工期|工期為負數，請確認是否調整"' : ''}>${rangeText}</span>
        ${srcLabel ? `<span class="task-tag tag-other">${srcLabel}</span>` : ''}
      </div>
    </td>
    <td class="col-num"><span style="font-style:italic; color:var(--ink4); font-size:12px;">${slackTxt}</span></td>
    <td class="col-num"><span class="task-deadline ${dlClass}" style="font-size:12px;">${dlText}</span></td>
  </tr>
  <tr class="dt-insert-row"><td colspan="10" class="dt-insert-cell"><div class="dt-insert"><button class="dt-insert-btn" title="在此列後插入" onclick="event.stopPropagation(); App._insertAfterId='${t.id}'; App.openNewTaskDialog('${t.project}');"><i class="ti ti-plus"></i></button></div></td></tr>`;
};

// 會議設定彈窗：截圖（OCR）+ 手動兩 tab，比右欄寬、好閱讀（Paul 要求）。設計款 openModal。
App.openMeetingModal = function() {
  App.shotFiles = [];
  App.openModal({
    title: '📅 會議時程設定',
    body: App.buildMeetingModalBody(),
    footer: '<button class="tb-action" onclick="App.closeModal()" style="background:var(--surface2); color:var(--ink2);">關閉</button>',
    wide: true,
  });
  // 剪貼簿貼上截圖（Ctrl+V）：document 級只綁一次，handler 內判斷彈窗開著才吃
  if (!App._meetingPasteBound) {
    App._meetingPasteBound = true;
    document.addEventListener('paste', App._meetingPasteHandler);
  }
};

// Ctrl+V 貼上截圖 → 直接進 OCR（不必先存成 png 再上傳，UX 佳）。只在會議彈窗開著時作用。
App._meetingPasteHandler = function(e) {
  if (!document.getElementById('meetingModalBody')) return;   // 彈窗沒開 → 不攔
  const items = (e.clipboardData && e.clipboardData.items) || [];
  const files = [];
  for (const it of items) {
    if (it.type && it.type.indexOf('image/') === 0) { const f = it.getAsFile(); if (f) files.push(f); }
  }
  if (!files.length) return;
  e.preventDefault();
  // 自動進「新增」子頁並切到「上傳截圖」tab
  App.showMeetingAddView();
  const shot = document.getElementById('am-shot'), manual = document.getElementById('am-manual');
  if (shot && manual) {
    shot.style.display = ''; manual.style.display = 'none';
    document.querySelectorAll('#meetingModalBody .am-tab').forEach(b => b.classList.toggle('active', /截圖/.test(b.textContent)));
  }
  App.handleShotUpload(files);
  U.toast('📋 已貼上截圖，按「🪄 一次解析全部」辨識', 'info');
};

// 會議部門下拉選項（三入口共用，§18.10b）：未指派（value 空）＋選項Y池（全專案部門名去重）＋★全體均攤（__ALL__）
App._meetingDeptOptions = function(sel) {
  const pool = [...new Set((DATA.projects || []).flatMap(p => (p.depts || []).map(d => (d.name || '').trim())).filter(Boolean))];
  const cur = sel || '';
  let html = `<option value=""${cur === '' ? ' selected' : ''}>未指派</option>`;
  html += pool.map(n => `<option value="${U.esc(n)}"${cur === n ? ' selected' : ''}>${U.esc(n)}</option>`).join('');
  html += `<option value="__ALL__"${cur === '__ALL__' ? ' selected' : ''}>★ 全體均攤（跨部門）</option>`;
  return html;
};

// 彈窗 body：截圖（OCR）+ 手動兩 tab（手動頻率 §階段二再補）。包一層 #meetingModalBody 供加入後就地刷新。
App.buildMeetingModalBody = function() {
  return `<div id="meetingModalBody">
    <!-- 管理主頁（開啟即見） -->
    <div id="am-home">
      <div style="display:flex; align-items:center; justify-content:space-between; margin:2px 0 8px;">
        <div style="font-size:13px; font-weight:600; color:var(--ink2);">⏰ 定期事件（會議 / 打掃）</div>
        <button class="am-add-btn" data-edit onclick="App.showMeetingAddView()" style="width:auto; padding:5px 14px; font-size:12px;">＋ 新增事件</button>
      </div>
      <div id="recurringMeetingList" style="border:1px solid var(--rule); border-radius:8px; overflow:hidden;">${App.buildRecurringMeetingsHtml()}</div>

      <div style="display:flex; align-items:center; justify-content:space-between; margin:16px 0 8px;">
        <div style="font-size:13px; font-weight:600; color:var(--ink2);">📌 特定日期事件</div>
        <button class="tb-action ghost" data-edit onclick="App.addSpecialMeeting()" style="font-size:11px; padding:3px 9px;">＋ 新增</button>
      </div>
      <div id="specialMeetingList" style="border:1px solid var(--rule); border-radius:8px; overflow:hidden; max-height:240px; overflow-y:auto;">${App.buildSpecialMeetingsHtml()}</div>
    </div>

    <!-- 新增（手動填入 / 上傳截圖） -->
    <div id="am-add" style="display:none">
      <div style="margin:0 0 10px;">
        <span onclick="App.showMeetingManageView()" style="display:inline-flex; align-items:center; gap:4px; font-size:12px; color:var(--ink3); cursor:pointer;">‹ 返回清單</span>
      </div>
      <div class="add-meeting-tabs">
        <button class="am-tab active" onclick="App.switchAmTab(this, 'manual')">⌨ 手動填入</button>
        <button class="am-tab" onclick="App.switchAmTab(this, 'shot')">📷 上傳截圖</button>
      </div>

      <div id="am-manual" class="am-form">
        <div class="form-row">
          <div class="form-field">
            <label>類型 *</label>
            <select id="mCat" onchange="App._toggleMcatLabel()">
              <option value="meeting">📅 會議</option>
              <option value="cleaning">🧹 雜項</option>
            </select>
          </div>
          <div class="form-field" style="flex:2;">
            <label>名稱 *</label>
            <input type="text" id="mTitle" placeholder="例：主管週會 / 輪值掃地">
          </div>
        </div>
        <div class="form-row" id="mCatLabelRow" style="display:none;">
          <div class="form-field">
            <label>分類名稱（雜項自訂）</label>
            <input id="mCatLabel" placeholder="如：打掃、外出、私人">
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>頻率 *</label>
            <select id="mFreq">
              <option value="once">單次（當週）</option>
              <option value="weekly">每週</option>
              <option value="biweekly">隔週</option>
              <option value="monthly">每月（第N個週幾）</option>
            </select>
          </div>
          <div class="form-field">
            <label>日期 *</label>
            <input type="date" id="mDate" value="${D.fmt(D.today(), 'iso')}">
          </div>
          <div class="form-field">
            <label>開始時間 *</label>
            <input type="time" id="mStart" value="10:00">
          </div>
          <div class="form-field">
            <label>結束時間 *</label>
            <input type="time" id="mEnd" value="11:00">
          </div>
        </div>
        <div class="form-row">
          <div class="form-field">
            <label>負責人（預設＝我）</label>
            <input type="text" id="mOwner" value="${U.esc(DATA.settings.userName || '')}">
          </div>
          <div class="form-field">
            <label>部門（負載分流）</label>
            <select id="mDept">${App._meetingDeptOptions('')}</select>
          </div>
        </div>
        <button class="am-add-btn" data-edit onclick="App.addManualMeeting()">＋ 加入</button>
        <div class="ocr-tip">頻率選「每週/隔週/每月」存定期事件、自動重複；「單次」只放當週。星期由日期自動推算。</div>
      </div>

      <div id="am-shot" class="am-form" style="display:none">
        <div class="am-drop" id="shotDrop" onclick="document.getElementById('shotInput').click()">
          <div class="ic">🖼</div>
          <div class="tx">點擊、拖曳，或直接 Ctrl+V 貼上截圖</div>
          <div class="sub">免費 · 純本地辨識 · 截圖不會被儲存（可多張）</div>
        </div>
        <input type="file" id="shotInput" multiple accept="image/*" style="display:none"
               onchange="App.handleShotUpload(this.files)">
        <div id="shotList" class="shot-list" style="display:none;"></div>
        <div id="ocrResult"></div>
        <div class="ocr-tip">💡 週檢視日期抓不到時請在清單自己選；想最準用「單日檢視」截圖。多張自動去重。</div>
      </div>
    </div>
  </div>`;
};

// 加入/刪除會議後刷新：更新儀表板（週曆 + 右欄精簡卡），彈窗開著就就地重繪 body（更新清單、清表單）。
App._refreshMeetingUI = function() {
  if (typeof Workspace.render === 'function') Workspace.render();
  const mb = document.querySelector('#modal .modal-body');
  if (mb && document.getElementById('meetingModalBody')) mb.innerHTML = App.buildMeetingModalBody();
};

// 時程表顯示設定（設計款彈窗）：起訖時數 + 半/一小時密度。值存全域 settings → 上雲跨機。午休 12–13 固定。
App.openGridSettingsModal = function() {
  const s = DATA.settings;
  App._gridSnap = { s: s.gridStartHour, e: s.gridEndHour };   // 開窗快照：下拉 onchange 即時預覽·「儲存」定案／「取消」還原此快照
  const opt = (sel, lo, hi) => { let o = ''; for (let h = lo; h <= hi; h++) o += `<option value="${h}"${h === sel ? ' selected' : ''}>${String(h).padStart(2, '0')}:00</option>`; return o; };
  App.openModal({
    title: '⚙ 時程表顯示設定',
    body: `<div class="form-field"><label>顯示時間範圍</label>
        <div style="display:flex; align-items:center; gap:8px;">
          <select onchange="App.setGridSetting('gridStartHour', this.value)" style="flex:1;">${opt(parseInt(s.gridStartHour, 10) || 8, 0, 22)}</select>
          <span style="color:var(--ink4);">→</span>
          <select onchange="App.setGridSetting('gridEndHour', this.value)" style="flex:1;">${opt(parseInt(s.gridEndHour, 10) || 18, 1, 24)}</select>
        </div></div>
      <div class="field-hint">☕ 午休 12:00–13:00 固定，不受此設定影響。</div>
      <div class="field-hint">☁ 此偏好存全域設定、自動同步雲端、跨機一致。</div>`,
    footer: '<button class="tb-action ghost" onclick="App._gridSettingsCancel()">取消</button><button class="tb-action" onclick="App.closeModal()">儲存</button>',
  });
};

// 取消：還原開窗快照（下拉是即時預覽·取消要把日曆改回原樣）；儲存＝直接 closeModal（值已即時寫入）
App._gridSettingsCancel = function() {
  const g = App._gridSnap;
  if (g) {
    DATA.settings.gridStartHour = g.s; DATA.settings.gridEndHour = g.e;
    Store.settings.save(); Workspace.render();
  }
  App._gridSnap = null;
  App.closeModal();
};

App.setGridSetting = function(key, val) {
  if (App._roGuard && App._roGuard()) return;
  let v = parseInt(val, 10);
  if (isNaN(v)) return;
  if (key === 'gridStartHour') v = Math.max(0, Math.min(22, v));
  else if (key === 'gridEndHour') v = Math.max(1, Math.min(24, v));
  DATA.settings[key] = v;
  if (DATA.settings.gridEndHour <= DATA.settings.gridStartHour) {   // 夾住起<迄，避免空表
    if (key === 'gridStartHour') DATA.settings.gridEndHour = Math.min(24, DATA.settings.gridStartHour + 1);
    else DATA.settings.gridStartHour = Math.max(0, DATA.settings.gridEndHour - 1);
  }
  Store.settings.save();   // 寫 localStorage + 觸發雲端上傳
  Workspace.render();   // 週曆即時重畫（modal 不重開，改動即時反映在 modal 兩側可見的日曆）
};

App.buildGeneratePanelHtml = function() {
  const lastGen = DATA.schedule.generatedAt;
  return `<div class="generate-section">
    <button class="generate-cta" data-edit onclick="App.generateNow()">
      <span style="font-size:16px;">⚡</span> 產生本週智慧排程
    </button>
    <div class="gen-sub">
      ${lastGen ?
        '最後產生：' + D.fmt(new Date(lastGen), 'md') + ' ' + new Date(lastGen).toTimeString().slice(0,5)
        : '尚未產生過排程'}
    </div>
    <div class="gen-result-card" id="genResult"></div>
  </div>`;
};

App.switchAmTab = function(btn, name) {
  btn.parentElement.querySelectorAll('.am-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['shot','manual'].forEach(n => {
    const el = document.getElementById('am-' + n);
    if (el) el.style.display = n === name ? '' : 'none';
  });
};

// 會議彈窗：管理主頁 ↔ 新增（手動/截圖）子頁切換
App.showMeetingAddView = function() {
  const home = document.getElementById('am-home'), add = document.getElementById('am-add');
  if (home) home.style.display = 'none';
  if (add) add.style.display = '';
};
App.showMeetingManageView = function() {
  const home = document.getElementById('am-home'), add = document.getElementById('am-add');
  if (add) add.style.display = 'none';
  if (home) home.style.display = '';
};

// 手動分類切換：選「雜項」才顯示自訂「分類名稱」欄
App._toggleMcatLabel = function() {
  const row = document.getElementById('mCatLabelRow');
  if (row) row.style.display = ((document.getElementById('mCat') || {}).value === 'cleaning') ? '' : 'none';
};

App.addManualMeeting = function() {
  if (App._roGuard()) return;
  const freq = (document.getElementById('mFreq') || {}).value || 'once';   // 不定期單次 / 每週 / 隔週 / 每月
  const cat = (document.getElementById('mCat') || {}).value || 'meeting';   // 內部分類桶：meeting / cleaning（皆避開排程、週曆分色）
  const catLabelRaw = ((document.getElementById('mCatLabel') || {}).value || '').trim();   // 雜項自訂顯示名（打掃/外出/私人…，不綁死打掃）
  const catLabel = cat === 'cleaning' ? (catLabelRaw || '雜項') : '';
  const dateStr = (document.getElementById('mDate') || {}).value || D.fmt(D.today(), 'iso');
  const start = document.getElementById('mStart').value;
  const end = document.getElementById('mEnd').value;
  const title = document.getElementById('mTitle').value.trim();
  if (!title) { U.toast('⚠ 請填主題', 'warning'); return; }
  const owner = ((document.getElementById('mOwner') || {}).value || '').trim();   // 負責人（預設帶 userName，§18.10b）
  const dept = (document.getElementById('mDept') || {}).value || '';              // 部門（空＝未指派；__ALL__＝全體均攤）
  const dayNum = new Date(dateStr + 'T00:00:00').getDay();   // 由日期推星期（0-6），週期性據此重複

  if (freq === 'once') {
    // 一次性 → 該日期，存 DATA.meetings
    DATA.meetings.push({
      id: U.id(), date: dateStr, startTime: start, endTime: end,
      title, category: cat, categoryLabel: catLabel, owner, dept,
    });
  } else {
    // 週期性（每週/隔週/每月）→ 存 settings.recurringMeetings（與設定頁定期事件同源、自動重複上週曆）；該日期當起算錨點
    if (!DATA.settings.recurringMeetings) DATA.settings.recurringMeetings = [];
    DATA.settings.recurringMeetings.push({
      id: U.id(), category: cat, categoryLabel: catLabel, frequency: freq,
      day: dayNum, start, end, title, startDate: dateStr, endDate: '', enabled: true, owner, dept,
    });
  }
  if (freq === 'once') Store.meetings.save(); else Store.settings.save();   // 一次性存 meetings、週期性存 settings.recurringMeetings
  App._refreshMeetingUI();
  const fl = ({ once: '單次', weekly: '每週', biweekly: '隔週', monthly: '每月' })[freq] || '';
  U.toast(`✓ 已加入${fl ? '（' + fl + '）' : ''}${cat === 'cleaning' ? '雜項' : '會議'}`, 'success');
};

App.generateNow = function() {
  if (App._roGuard()) return;
  if (DATA.tasks.filter(t => t.status !== 'done' && t.status !== 'hold').length === 0) {
    U.toast('⚠ 沒有任務可排程', 'warning');
    return;
  }
  const result = generateSchedule();
  const resultBox = document.getElementById('genResult');
  if (resultBox) {
    resultBox.classList.add('show');
    resultBox.innerHTML = `
      <div class="gen-result-title">✓ 已為你排好本週工作</div>
      <div class="gen-result-sub">
        共安排 <b>${result.scheduledCount}</b> 個任務時段<br>
        ${result.lockedCount > 0 ? `保留 ${result.lockedCount} 個鎖定項目<br>` : ''}
        避開 <b>${DATA.meetings.length}</b> 場會議時段<br><br>
        <a href="#" onclick="App.showPage('workspace', document.querySelector('[data-page=workspace]')); return false;" style="color:var(--sage-600); font-weight:600;">→ 查看個人工作台時程表</a>
      </div>
    `;
  }
  U.toast(`✨ 排程已產生 (${result.scheduledCount} 項)`);
};

// ─── Global schedule (Topbar button) ───
App.generateGlobalSchedule = function() {
  const activeTasks = DATA.tasks.filter(t => t.status !== 'done' && t.status !== 'hold');
  if (activeTasks.length === 0) {
    U.toast('⚠ 沒有任務可排程', 'warning');
    return;
  }

  const result = generateSchedule();
  this.refreshAll();

  if (result.scheduledCount === 0) {
    U.toast('⚠ 本週沒有需要排程的任務（任務日期都在本週外）', 'warning');
    return;
  }
  U.toast(`⚡ 本週智慧排程完成：${result.scheduledCount} 個時段`);
  // Jump to workspace to see the result
  if (this.currentPage !== 'workspace') {
    this.showPage('workspace', document.querySelector('[data-page=workspace]'));
  }
};

// ═══════════════════════════════════════════════════════
//  PAGE: PROJECT — Quick add + task modal + screenshot OCR
// ═══════════════════════════════════════════════════════
App.quickAddTask = function(projId, input) {
  if (App._roGuard()) return;
  const name = input.value.trim();
  if (!name) {
    // Input 是空 → 直接打開完整新增任務對話框
    this.openNewTaskDialog(projId);
    return;
  }
  const task = {
    id: U.id(),
    project: projId,
    name,
    desc: '',
    owner: DATA.settings.userName || '',
    urgency: 'medium',
    category: 'deep',
    estHours: 1,
    canSplit: false,
    predecessor: '',   // 階段2 排程引擎：前置任務編碼（見 parsePredecessors）
    wbs: '',           // 階段2：WBS 識別
    durationDays: 1,     // 手動新建預設1工作天（完整對話框可填工期，UI往後做）
    scheduledStart: '',  // 排程套用結果，四條一致
    scheduledEnd: '',
    parentWbsId: '',   // 階段2：子綁父
    start: '',
    end: '',
    status: 'pending',
    note: '',
    method: '',
    createdAt: new Date().toISOString(),
  };
  DATA.tasks.push(task);
  Store.tasks.save();
  input.value = '';
  this.renderProject();
  this.renderSidebar();
  U.toast(`✓ 已新增「${name}」`);
};

// ── M2-§6.4：前置任務結構化（自由文字 → 一列一條）────────────────────────
// 資料格式不變：序列化回 task.predecessor 字串（16FS / 16FS+2 / 16SS），引擎 parsePredecessors 照吃。
// 候選：同專案(t.project) 且有 wbs 編號的任務（手動無編號暫不可當前置），排除自己。
// 單一真實來源：序列化 serializePredecessors() 兩存檔點共用；反序列化走既有 parsePredecessors。

// 關係白話 ↔ 引擎代碼（單一定義）
App.PRED_RELATIONS = [
  { code: 'FS', label: '等它完成後，本任務才開始（最常用）' },
  { code: 'SS', label: '跟它同一天開始' },
  { code: 'FF', label: '跟它同一天完成' },
  { code: 'SF', label: '它開始後，本任務才能完成' },
];

// 序排序（第一刀，2026-06-17 序改日期排序）：純函式，吃 list 回排序後 list。
// 規則：有有效開始日（dispStart = getEffectiveSchedule(t).start，全系統 ISO YYYY-MM-DD，字串比=時序）→ 升序；
//   空值（待排：無 dispStart）顯式歸殿後組、不參與字串比（空字串字典序最小，naive 比會頂最前）；
//   同 dispStart / 待排組內 → 維持原陣列序（decorate index 穩定排序，不依賴引擎 sort 穩定性）。
// ⚠ 測試副本：test-schedule-cases.js §11，改此函式要兩邊同步。
function orderTasksByDispStart(list) {
  const dec = (list || []).map((t, i) => ({ t, i, ds: getEffectiveSchedule(t).start || '' }));
  const dated   = dec.filter(x => x.ds !== '').sort((a, b) => (a.ds < b.ds ? -1 : (a.ds > b.ds ? 1 : a.i - b.i)));
  const undated = dec.filter(x => x.ds === '');   // 待排：filter 保原陣列序
  return dated.map(x => x.t).concat(undated.map(x => x.t));
}

// 待辦列篩選（第二刀-A 接線）：純函式，吃四 Set 篩選器，.filter 保序（不重排，待排殿後不破）。
// 每維 Set 空 → 該維不篩；非空 → t 對應值 ∈ Set 才留（同維多選＝OR，跨維＝AND 交集）。
// ⚠ status 為待辦列純四枚舉（pending/wip/done/hold），不做 'delayed' 特例（延遲＝衍生態非狀態）。
function applyTaskFilter(tasks, filter) {
  const f = filter || {};
  const has = (s) => s && s.size > 0;
  return (tasks || []).filter(t => {
    if (has(f.stages) && !f.stages.has(t.stage)) return false;
    if (has(f.owners) && !f.owners.has(t.owner)) return false;
    if (has(f.urg)    && !f.urg.has(t.urgency || 'medium')) return false;
    if (has(f.status) && !f.status.has(t.status)) return false;
    return true;
  });
}

// 序基準（單一真實來源）：專案任務按 dispStart 升序、待排殿後（orderTasksByDispStart）。
// 排除已刪除、含 done（done 佔號）。外層待辦列與前置下拉共用此排序與 seq（同源）。
App.orderedProjectTasks = function(projId) {
  // §19.10 F.3：排除 isPmCoord 常駐列——它非可執行/可排序/可當前置的任務（一處解決待辦列表＋序號＋前置候選）；負荷計算走 DATA.tasks 不受影響
  return orderTasksByDispStart((DATA.tasks || []).filter(t => t.project === projId && !t._deleted && !t.isPmCoord));
};

// 任務在其專案 ordered 序中的 seq（同源，1-based）；查無回 '?'（供超範圍前置顯示標籤）
App._seqOf = function(taskId) {
  const t = (DATA.tasks || []).find(x => x.id === taskId);
  if (!t) return '?';
  const i = this.orderedProjectTasks(t.project).findIndex(x => x.id === taskId);
  return i < 0 ? '?' : (i + 1);
};

// 前置候選：本專案、measureType!=='hours'、排除自己；階段窗（前1-2階段全收 + 同階段只列自己之前）。
// 序與 seq 同源 orderedProjectTasks；階段序 SoT = getProjectStages（minWbs，忽略 variant）。
// @param currentStage 表單當前階段（新建讀 tf-stage、編輯讀 t.stage）→ 定本任務階段序 S
App.predCandidates = function(projId, selfId, currentStage, selfVariant) {
  const NO_STAGE = '未分階段';
  const norm = (s) => (typeof s === 'string' && s.trim()) ? s.trim() : NO_STAGE;

  // 階段名 → index（getProjectStages 已按 minWbs 排序；同名取首次序，忽略 variant）
  const stages = App.getProjectStages(projId);
  const nameToIdx = {};
  let k = 0;
  stages.forEach(s => { if (!(s.name in nameToIdx)) nameToIdx[s.name] = k++; });
  const idxOf = (stage) => (norm(stage) in nameToIdx) ? nameToIdx[norm(stage)] : stages.length;

  const S = idxOf(currentStage);   // 本任務階段序（全新階段名 → stages.length，視為最後）

  // 同源序：日期序（orderTasksByDispStart）、含 done、排除 deleted；seq = 日期序位置+1
  const ordered = App.orderedProjectTasks(projId);
  const selfPos = selfId ? ordered.findIndex(t => t.id === selfId) : -1;
  const selfBefore = selfPos < 0 ? Infinity : selfPos;   // 新建自己不在序中 → 視為在尾，同階段全收

  return ordered
    .map((t, pos) => ({ t, pos }))
    .filter(({ t, pos }) => {
      if (t.id === selfId) return false;                 // 排自己
      if (t.measureType === 'hours') return false;       // 對齊 S5c：小時 Task 不可當工期前置
      if ((t.variant || null) !== (selfVariant || null)) return false;   // §8e.6 疊加：同案別才可當前置（通案 null===null）
      const d = S - idxOf(t.stage);                      // 候選比自己早幾個階段
      if (d === 0) return pos < selfBefore;              // 同階段 → 只列開始日早於自己（第一刀後 pos 為日期序位置）
      if (d === 1 || d === 2) return true;               // 前 1-2 階段 → 全收
      return false;                                      // d>=3（太早）/ d<0（同後或更晚）→ 擋
    })
    .map(({ t, pos }) => ({
      id: t.id,
      seq: pos + 1,                                      // 與外層待辦同源序（可非連續）
      name: t.name || '',
      stage: norm(t.stage),                              // 供 optgroup 分組
      stageIdx: idxOf(t.stage),                          // 供 optgroup 依階段序排
    }));
};

// 單列 HTML（pred = {dep,type,lag} 或 null=空白列）：前置任務改 <select>，value=task.id、label「seq · 名稱」、按階段 optgroup。
App._predRowHtml = function(pred, candidates) {
  const cands = candidates || App._predCands || [];
  const depId = pred ? String(pred.dep) : '';
  const type  = pred ? pred.type : 'FS';
  const lag   = pred ? pred.lag : 0;

  // 選項：（不設前置）+ 按階段 optgroup（stageIdx 升冪）
  let optsHtml = `<option value="">（不設前置）</option>`;
  const byIdx = {}, order = [];
  cands.forEach(c => {
    if (!(c.stageIdx in byIdx)) { byIdx[c.stageIdx] = { name: c.stage, items: [] }; order.push(c.stageIdx); }
    byIdx[c.stageIdx].items.push(c);
  });
  order.sort((a, b) => a - b);
  order.forEach(idx => {
    const g = byIdx[idx];
    optsHtml += `<optgroup label="${U.esc(g.name)}">` +
      g.items.map(c => `<option value="${U.esc(c.id)}"${c.id === depId ? ' selected' : ''}>${U.esc(c.seq + ' · ' + c.name)}</option>`).join('') +
      `</optgroup>`;
  });
  // 超範圍 selected（回顯保留，不丟資料；改階段才清＝onTaskStageChange）
  if (depId && !cands.some(c => c.id === depId)) {
    const to = (DATA.tasks || []).find(t => t.id === depId);
    const label = to ? (App._seqOf(depId) + ' · ' + (to.name || '')) : depId;
    optsHtml += `<optgroup label="（目前範圍外）"><option value="${U.esc(depId)}" selected>${U.esc(label)}（範圍外）</option></optgroup>`;
  }

  const rels = App.PRED_RELATIONS.map(r =>
    `<option value="${r.code}" ${type === r.code ? 'selected' : ''}>${U.esc(r.label)}</option>`).join('');
  return `
      <div class="pred-row">
        <div class="pred-field">
          <label class="pred-field-label">🔗 要接在這個任務之後</label>
          <div class="pred-field-line">
            <select class="pred-search">${optsHtml}</select>
            <button type="button" class="pred-del" onclick="App.removePredRow(this)" title="刪除這條前置">✕</button>
          </div>
        </div>
        <div class="pred-field">
          <label class="pred-field-label">🔀 兩者的銜接方式</label>
          <select class="pred-rel">${rels}</select>
        </div>
        <div class="pred-field">
          <label class="pred-field-label">⏳ 中間留幾天緩衝</label>
          <input type="number" class="pred-lag" value="${lag}" step="1" min="0">
          <div class="field-hint">前置完成後想多等幾天再開始（等材料、簽核）才需要填，不需要則維持 0。</div>
        </div>
      </div>`;
};

// 整個前置欄內容（select 候選列 + 加列鈕）；反序列化走 parsePredecessors（字串→陣列）。候選快取供 addPredRow/onTaskStageChange 共用。
App.buildPredListHtml = function(t) {
  const cands = App.predCandidates(t.project, t.id, t.stage, t.variant);
  App._predCands  = cands;       // 快取：addPredRow 新列 + onTaskStageChange 重建共用
  App._predProj   = t.project;   // 快取：onTaskStageChange 重算 predCandidates 用
  App._predSelfId = t.id;
  App._predVariant = t.variant;  // 快取：variant 過濾（onTaskStageChange 重算用）
  const preds = parsePredecessors(t.predecessor);
  const rows = preds.length
    ? preds.map(p => App._predRowHtml(p, cands)).join('')
    : App._predRowHtml(null, cands);   // 沒有前置時給一條空白列起手
  return `
      <div class="field-hint pred-intro">設定這個任務接在哪個任務之後，系統會自動排好開始日期。</div>
      <div id="tf-pred-list">${rows}</div>
      <button type="button" class="pred-add" onclick="App.addPredRow()">＋ 加一條前置</button>
      <div class="tip pred-example">想成『這件事要排在誰後面』。例如本任務要等『#16 模具開發』做完、再隔 2 天材料到位才動工 → 選 #16、選『完成後才開始』、緩衝填 2。</div>`;
};

// 序列化：DOM 列 → task.predecessor 字串（兩存檔點共用，單一真實來源）
App.serializePredecessors = function() {
  const rows = Array.from(document.querySelectorAll('#tf-pred-list .pred-row'));
  const parts = [];
  for (const row of rows) {
    const sel = row.querySelector('.pred-search');
    const id = sel ? (sel.value || '').trim() : '';   // select.value = task.id（空=不設前置）
    if (!id) continue;                                 // 空值 → 跳過該列
    const type = (row.querySelector('.pred-rel') || {}).value || 'FS';
    const lagEl = row.querySelector('.pred-lag');
    const lagVisible = lagEl && lagEl.style.display !== 'none';
    const lag = lagVisible ? (parseInt(lagEl.value, 10) || 0) : 0;
    let token = id + '#' + type;                       // id#關係（# 分隔，對齊 translatePredToId）
    if (lag > 0) token += '+' + lag;
    else if (lag < 0) token += lag;                    // 負 lag 自帶 '-'
    parts.push(token);
  }
  return parts.join(',');
};

// 加一條空白列
App.addPredRow = function() {
  const list = document.getElementById('tf-pred-list');
  if (!list) return;
  list.insertAdjacentHTML('beforeend', App._predRowHtml(null, App._predCands || []));
};

// 刪一條列（刪到空則補一條空白列，維持起手姿態）
App.removePredRow = function(btn) {
  const list = document.getElementById('tf-pred-list');
  const row = btn.closest('.pred-row');
  if (!list || !row) return;
  row.remove();
  if (!list.querySelector('.pred-row')) App.addPredRow();
};

// 階段欄改變 → 用新階段重算候選窗、重建前置 select；超出新窗的「已選」前置清掉+toast。
// （對齊回顯分工：回顯保留超範圍、僅「改階段」這個主動動作才清。）
App.onTaskStageChange = function() {
  const list = document.getElementById('tf-pred-list');
  if (!list) return;
  const newStage = (document.getElementById('tf-stage') || {}).value || '';

  // 重建前，先收集現有列「已選」的前置（含 relation/lag，保留有效者用）
  const current = Array.from(list.querySelectorAll('.pred-row')).map(row => {
    const sel = row.querySelector('.pred-search');
    const id = sel ? (sel.value || '').trim() : '';
    if (!id) return null;
    const type = (row.querySelector('.pred-rel') || {}).value || 'FS';
    const lagEl = row.querySelector('.pred-lag');
    const lag = lagEl ? (parseInt(lagEl.value, 10) || 0) : 0;
    return { dep: id, type: type, lag: lag };
  }).filter(Boolean);

  // 新階段重算候選 + 更新快取
  const cands = App.predCandidates(App._predProj, App._predSelfId, newStage, App._predVariant);
  App._predCands = cands;
  const inWindow = new Set(cands.map(c => c.id));

  // 只保留仍在新窗內的，清掉超範圍的
  const kept = current.filter(p => inWindow.has(p.dep));
  const dropped = current.length - kept.length;

  // 重建列（保留者逐列回填；全清→一條空白列起手）
  list.innerHTML = kept.length
    ? kept.map(p => App._predRowHtml(p, cands)).join('')
    : App._predRowHtml(null, cands);

  if (dropped > 0) {
    U.toast('⚠️' + dropped + ' 筆前置因階段調整超出可選範圍，已移除', 'warning');
  }
};

// ── 2-A：預計開始「自動／手動」雙態（startMode 純 UI 意圖記憶；引擎錨點機制不動）──
// 判定當前態：顯式 startMode 優先；舊任務無此欄位 → t.start 有值當 manual、空當 auto（一次性相容）
App.startModeOf = function(t) {
  if (t && (t.startMode === 'manual' || t.startMode === 'auto')) return t.startMode;
  return (t && t.start && String(t.start).trim()) ? 'manual' : 'auto';
};

// 重構（取消自動/手動切換）：預計開始改單一可編輯日期格，setStartMode 已移除。

// 讀預計開始雙態 → {start, startMode}（saveNewTask / saveTask 共用，單一真實來源）
//   手動態：startMode='manual'，start = #tf-start 值（引擎據此當錨點）
//   自動態：startMode='auto'，start = ''（清空，引擎視為非錨點、由前置推算）
App.readStartField = function() {
  // 重構：預計開始為單一可編輯日期格。經手填/改（data-autostart 已清）=手動錨點；未經手=自動，不落錨、下游連動。
  const el = document.getElementById('tf-start');
  if (!el || el.dataset.autostart === '1') return { startMode: 'auto', start: '' };
  const val = el.value || '';
  return { startMode: val ? 'manual' : 'auto', start: val };
};

// §6.5c 錨點：取有效開始日。手動態用 tf-start 手填值；自動態 tf-start 為空，改讀隱藏 tf-effstart（=getEffectiveSchedule(t).start，渲染時寫入）。
App.readEffStart = function() {
  const manual = (document.getElementById('tf-start') || {}).value || '';
  if (manual) return manual;                                          // 手動態：手填值優先
  return (document.getElementById('tf-effstart') || {}).value || '';  // 自動態：有效開始日
};

// §6.5c t.end 衍生化：save 端取工期。tf-end 反推為主（開始日當錨）、tf-duration 為輔（無法反推時）。
//   start+endVal 都有 → deriveDurationFromEnd（含 negDur→回 0，不套 ||1 才不會把合法 0 蓋成 1）。
//   milestone 工期恆 1，不反推。saveTask/saveNewTask 共用，單一真實來源。
App.readDurationField = function() {
  const start  = App.readEffStart();
  const endVal = (document.getElementById('tf-end')      || {}).value || '';
  const durRaw = parseFloat((document.getElementById('tf-duration') || {}).value);
  const taskType = (document.getElementById('tf-taskType') || {}).value;
  if (taskType === 'milestone') return 1;
  if (start && endVal) return D.deriveDurationFromEnd(start, endVal);
  return isNaN(durRaw) ? 1 : durRaw;   // §6.5 只在非數字時兜 1，0/負數照實回（負工期可手填）
};

// §6.5c 三欄連動：改開始/工期 → 算「預計完成」顯示值（開始當錨，addWorkdays(start, dur-1)）。
//   改完成日不在此（反推工期交給 save 端），故 tf-end 不綁、此函式只算 end。
//   guard：開始日空（待排）或工期非有效數（NaN/<1）→ 不算，保留現值。
App.recalcTaskTimeFields = function() {
  const startEl = document.getElementById('tf-start');
  const durEl   = document.getElementById('tf-duration');
  const endEl   = document.getElementById('tf-end');
  if (!durEl || !endEl) return;
  const start = App.readEffStart();
  if (!start) return;                          // 待排（自動態無有效開始日）→ 不強寫
  const dur = parseFloat(durEl.value);
  if (isNaN(dur)) return;              // §6.5 只擋非數字；dur≤0（負工期）照算 addWorkdays(start,dur-1)=早於start；milestone dur=1→addWorkdays(start,0)=start
  endEl.value = D.fmt(D.addWorkdays(start, dur - 1), 'iso');   // D.fmt iso 避時區 Bug2
};

// 表單渲染後掛三欄連動：只綁 tf-start / tf-duration（改它們→算完成日）；
//   tf-end 不綁（改完成日→反推工期是 save 端的事，綁了會蓋掉使用者輸入）。
App.bindTaskTimeListeners = function() {
  if (App._taskTimeDelegated) return;            // 只綁一次，避免重複
  App._taskTimeDelegated = true;
  const f = (e) => {
    const id = e.target && e.target.id;
    if (e.target && e.target.classList) e.target.classList.remove('tf-invalid');   // 修正2：必填欄位輸入即消紅
    if (id === 'tf-start' && e.target.dataset) delete e.target.dataset.autostart;   // 重構：手改開始日 → 落為手動錨點
    if (id === 'tf-duration' || id === 'tf-start') App.recalcTaskTimeFields();
    if (id === 'tf-duration' || id === 'tf-end' || id === 'tf-start') { if (App._tfNetConv) App._tfNetConv(); }   // §18.10d：工期/日期變動 → 淨工作天換算即時刷新（span＝工期）
  };
  document.addEventListener('input', f);
  document.addEventListener('change', f);
};

// 修正2：必填欄位驗證——空的標紅(.tf-invalid)、有值清紅，回傳缺漏欄位名（saveNewTask/saveTask 共用，單一真實來源）
App._markTaskRequired = function(reqs) {
  const missing = [];
  reqs.forEach(r => {
    const e = document.getElementById(r.id);
    if (!e) return;
    const empty = !((e.value || '').trim());
    e.classList.toggle('tf-invalid', empty);
    if (empty) missing.push(r.name);
  });
  return missing;
};

// ─── HintBox：區塊級說明框公版（展開/收起持久化 + 收起態 hover 浮出，複用 data-tip 引擎）───
//   state 存 DATA.settings.hintBoxState[key]：undefined/false=展開、true=收起（預設展開）。
//   收起態標題列掛 data-tip（標題|body 純文字），hover 浮出；觸控無 hover 則點擊展開。
App.buildHintBox = function(opts) {
  const o = opts || {};
  const key = o.key || '';
  const _hbStored = (DATA.settings.hintBoxState || {})[key];
  const collapsed = _hbStored === undefined ? !!o.collapsed : !!_hbStored;
  const icon = o.icon ? `<i class="ti ${o.icon}"></i>` : '';
  const summary = o.summary ? `<span class="hintbox-summary">${U.esc(o.summary)}</span>` : '';
  const tip = collapsed ? ` data-tip="${U.esc((o.title || '') + '|' + (o.summary || '') + ' — 點擊展開看完整說明')}"` : '';
  return `<div class="hintbox${collapsed ? ' collapsed' : ''}" data-hintkey="${U.esc(key)}">
    <div class="hintbox-bar" onclick="App.toggleHintBox('${U.esc(key)}')"${tip}>
      <span class="hintbox-head">${icon}<b class="hintbox-title">${U.esc(o.title || '')}</b>${summary}</span>
      <span class="hintbox-toggle">${collapsed ? '展開▾' : '收起▴'}</span>
    </div>
    <div class="hintbox-body">${o.bodyHtml || ''}</div>
  </div>`;
};
// 點標題列 toggle：寫 state + Storage.save，局部換 class（不整頁重繪）；收起態補掛 data-tip、展開態拔掉。
App.toggleHintBox = function(key) {
  if (!DATA.settings.hintBoxState) DATA.settings.hintBoxState = {};
  DATA.settings.hintBoxState[key] = !DATA.settings.hintBoxState[key];
  Store.settings.save();
  const box = document.querySelector('.hintbox[data-hintkey="' + key + '"]');
  if (!box) return;
  const collapsed = !!DATA.settings.hintBoxState[key];
  box.classList.toggle('collapsed', collapsed);
  const tg = box.querySelector('.hintbox-toggle');
  if (tg) tg.textContent = collapsed ? '展開▾' : '收起▴';
  const bar = box.querySelector('.hintbox-bar');
  if (bar) {
    if (collapsed) {
      const title = (box.querySelector('.hintbox-title') || {}).textContent || '';
      const summary = (box.querySelector('.hintbox-summary') || {}).textContent || '';
      bar.setAttribute('data-tip', title + '|' + summary + ' — 點擊展開看完整說明');
    } else {
      bar.removeAttribute('data-tip');
    }
  }
};

App.buildTaskFormHtml = function(task, mode, measure = 'duration') {
  const t = task || {};
  const v = (x) => (x == null ? '' : x);
  const startMode = (mode === 'new') ? 'auto' : App.startModeOf(t);   // 2-A：新任務一律 auto；編輯讀 startMode（含舊任務相容）
  const effSch = getEffectiveSchedule(t);
  const deptNames = [...new Set((DATA.projects || []).flatMap(p => (p.depts || []).map(d => (d.name || '').trim())).filter(Boolean))];   // 選項Y：全專案部門名去重池（個人雜事掛公司部門，§18.10）
  const isAutoStart = (startMode === 'auto');                              // 重構：無手填 t.start = 依前置自動排
  const startInputVal = isAutoStart ? (effSch.start || '') : v(t.start);   // 自動態預填引擎算到的日；data-autostart 標記，未經手不落錨（保住下游連動）
  const startHint = isAutoStart
    ? (effSch.start ? '預計開始目前依前置排到 ' + D.fmt(effSch.start, 'ymd') + '；直接改此日即固定為起點，下游接著排。改完成日會自動反推工期。'
                    : '預計開始留白＝依前置自動排；填入日期即固定為起點。改完成日會自動反推工期。')
    : '預計開始已固定為起點，下游接著排；清空可改回依前置自動排。改完成日會自動反推工期。';
  // §18.10d 表單重排：狀態晶片（依實際日推導·hold 覆蓋·不回退既有完成）＋淨工作天精算＋進階展開態
  const _held = (t.status === 'hold');
  const _dstat = App._deriveStatus(t.actualStart, t.actualEnd, _held, t.status);
  const _stChip = App._TF_STMAP[_dstat] || App._TF_STMAP.pending;
  const _spanWd = Number(t.durationDays) || 0;   // 工期＝原估淨工作天（span）
  const _netVal = (t.netWorkDays != null && t.netWorkDays !== '') ? t.netWorkDays : '';
  const _netShown = (_netVal !== '' && Number(_netVal) > 0);
  // 進階設定預設收起（連編輯也收·化繁為簡）；標題顯「N 項已填」讓有料一眼可見、又保持乾淨
  const _advFilled = [
    (t.predecessor && String(t.predecessor).trim()),
    (t.taskType && t.taskType !== 'task'),
    t.riskHL,
    (t.riskIssue && String(t.riskIssue).trim()),
    (t.deliverable && String(t.deliverable).trim()),
    (t.deliverableLink && String(t.deliverableLink).trim()),
    (t.note && String(t.note).trim()),
  ].filter(Boolean).length;
  return `
    <div class="task-form tf-redesign" data-measure="${measure}">
    ${mode === 'new' ? `
    <div class="form-field">
      <label>專案 *</label>
      <select id="tf-project"><option value="" ${!t.project ? 'selected' : ''}>— 請選擇 —</option>${DATA.projects.map(p => `<option value="${p.id}" ${t.project === p.id ? 'selected' : ''}>${U.esc(p.name)}</option>`).join('')}</select>
    </div>` : `
    <div class="form-field tf-proj-field">
      <label>專案</label>
      <div class="task-proj-readonly">${U.esc((DATA.projects.find(p => p.id === t.project) || {}).name || '')}</div>
    </div>`}
    <div class="form-field tf-field-name">
      <label>任務名稱 *</label>
      <input type="text" id="tf-name" value="${U.esc(v(t.name))}" placeholder="例：完成 BOM 表 6 型壁掛機">
    </div>
    <div class="form-row">
      <div class="form-field"><label>階段 *</label>
        <input type="text" id="tf-stage" list="tf-stage-list" value="${U.esc(v(t.stage))}" placeholder="輸入或選擇階段" onchange="App.onTaskStageChange()">
        <datalist id="tf-stage-list">${this.stageDatalistOptions(t.project)}</datalist>
      </div>
      <div class="form-field"><label>擔當 *</label><input type="text" id="tf-owner" value="${U.esc(v(t.owner) || (mode === 'new' ? (DATA.settings.userName || '') : ''))}"></div>
    </div>

    <div class="form-field mg-hours"><label>部門 <span data-tip="部門|個人雜事掛到的公司部門（部門負載依此分流）；選項為全專案出現過的部門" style="cursor:help;">?</span></label>
      <select id="tf-dept">
        <option value="">未指派</option>
        ${deptNames.map(n => `<option value="${U.esc(n)}" ${(t.dept || '') === n ? 'selected' : ''}>${U.esc(n)}</option>`).join('')}
      </select>
    </div>

    <div class="tf-sched-card">
      <div class="tf-sched-title"><i class="ti ti-clock-bolt" aria-hidden="true"></i>排程與進度</div>
      <div class="tf-chain">
        <div class="tf-chain-cell tf-start-cell">
          <div class="tf-cell-label">預計開始</div>
          <input type="date" id="tf-start" value="${startInputVal}"${isAutoStart ? ' data-autostart="1"' : ''}>
        </div>
        <div class="tf-chain-arrow dur-only"><i class="ti ti-arrow-right" aria-hidden="true"></i></div>
        <div class="tf-chain-cell tf-dur-cell mg-duration">
          <div class="tf-cell-label tf-cell-accent">工期（天）</div>
          <input type="number" id="tf-duration" value="${v(t.durationDays) || 1}" step="1">
        </div>
        <div class="tf-chain-cell tf-hours-cell mg-hours">
          <div class="tf-cell-label">預估工時 (h)</div>
          <input type="number" id="tf-hours" value="${v(t.estHours) || 1}" min="0.5" step="0.5">
        </div>
        <div class="tf-chain-arrow dur-only"><i class="ti ti-arrow-right" aria-hidden="true"></i></div>
        <div class="tf-chain-cell tf-end-cell dur-only">
          <div class="tf-cell-label">預計完成 / Deadline</div>
          <input type="date" id="tf-end" value="${v(effSch.end)}">
        </div>
      </div>
      <input type="hidden" id="tf-effstart" value="${v(effSch.start)}">
      <div class="field-hint tf-chain-hint dur-only">${startHint}</div>

      <div class="tf-actual-row">
        <div class="tf-actual-cell"><div class="tf-cell-label tf-actual-lbl">實際開始</div><input type="date" id="tf-actualStart" value="${v(t.actualStart)}" onchange="App._tfSyncStatus()"></div>
        <div class="tf-actual-cell"><div class="tf-cell-label tf-actual-lbl">實際完成</div><input type="date" id="tf-actualEnd" value="${v(t.actualEnd)}" onchange="App._tfSyncStatus()"></div>
      </div>
      <div class="tf-statusbar">
        <span class="tf-stchip ${_stChip[1]}" id="tf-stchip" data-prev="${U.esc(v(t.status))}">● ${_stChip[0]}</span>
        <span class="tf-stlock"><i class="ti ti-lock" aria-hidden="true"></i> 狀態依實際日期自動判定；勾「擱置」則覆蓋</span>
        <label class="tf-hold"><input type="checkbox" id="tf-hold" ${_held ? 'checked' : ''} onchange="App._tfSyncStatus()"> 擱置</label>
      </div>
      <div class="tf-holdreason" id="tf-holdreason-wrap" style="${_held ? '' : 'display:none'}">
        <input type="text" id="tf-holdReason" value="${U.esc(v(t.holdReason))}" placeholder="擱置原因（便於日後復盤）">
      </div>

      <div class="dur-only">${App.buildHintBox({
      key: 'task-time', icon: 'ti-clock-bolt', title: '時間怎麼連動', summary: '填兩個，第三個自動算', collapsed: true,
      bodyHtml:
        '<div class="ht-rule ht-start"><b>改開始日</b><span>工期不動，自動算出新的完成日。例：開始改 6/25、工期 5 天 → 完成自動變 7/1（跳週末與國定假日）。</span></div>' +
        '<div class="ht-rule ht-dur"><b>改工期</b><span>開始日當錨不動，自動算出新的完成日。例：工期改 7 天 → 完成日往後移到第 7 個工作天。</span></div>' +
        '<div class="ht-rule ht-end"><b>改完成日</b><span>開始日不動，回算工期（等於調整這任務要做多久）。例：完成改 7/3 → 工期自動變成 6/25 到 7/3 的工作天數。</span></div>' +
        '<div class="ht-rule ht-down"><b>下游連動</b><span>這任務時間一改，有設前置的下游任務跟著自動重排；你手動指定過日期的任務不會被動到。</span></div>'
    })}</div>
    </div>

    <div class="form-row">
      <div class="form-field"><label>每日投入程度</label>
        <select id="tf-effort">${App._effortOptionsFull(t.effortRatio)}</select>
      </div>
      <div class="form-field"><label>緊急程度 <span data-tip="緊急程度|系統自動推算，可手動覆蓋" style="cursor:help;">?</span></label>
        <select id="tf-urgency">
          <option value="high" ${t.urgency === 'high' ? 'selected' : ''}>🔴 緊急</option>
          <option value="medium" ${t.urgency === 'medium' || !t.urgency ? 'selected' : ''}>🔵 普通</option>
          <option value="low" ${t.urgency === 'low' ? 'selected' : ''}>⚪ 不急</option>
        </select>
      </div>
    </div>
    <div class="form-field">
      <div class="field-hint">資源負荷計算基準：單日累計投入超過 100% 時，系統將警示資源過載。</div>
      <button type="button" class="tf-netdays-btn dur-only" id="tf-netdays-btn" onclick="App.toggleNetDays()" style="${_netShown ? 'display:none' : ''}">＋ 精算淨工作天</button>
      <div class="tf-netdays dur-only" id="tf-netdays-block" style="${_netShown ? '' : 'display:none'}">
        <div class="tf-netdays-head">🎯 淨工作天（資源精算）<span class="tf-netdays-x" onclick="App.toggleNetDays(true)">✕ 收合</span></div>
        <div class="tf-netdays-derived">系統依預計工期初估為 <b id="tf-netdays-span">${_spanWd || '—'}</b> 個工作天。</div>
        <div class="tf-netdays-row">
          <input type="number" id="tf-netdays" min="0" step="0.5" value="${_netVal}" oninput="App._tfNetConv()" placeholder="—"> 個工作天
          <span class="tf-netdays-conv" id="tf-netdays-conv"></span>
        </div>
        <div class="tf-netdays-warn" id="tf-netdays-warn" style="display:none"></div>
        <div class="field-hint">請填寫扣除等待與閒置時間後的實際作業天數。此數值僅用於精算資源負荷，不影響排程區間；若留空，將依每日投入程度自動計算。</div>
      </div>
    </div>

    <div class="form-collapse" id="tf-advSection">
      <div class="form-collapse-head" onclick="document.getElementById('tf-advSection').classList.toggle('open')">
        <span class="form-collapse-chevron">▸</span> 進階設定${_advFilled > 0 ? '<span class="tf-adv-badge">' + _advFilled + ' 項已填</span>' : ''}
        <span class="tf-adv-cap">前置任務 · 類型 · 交付物 · 風險 · 備註</span>
      </div>
      <div class="collapse-body">
        <div class="form-field dur-only tf-pred-field">
          <label>前置任務 <span class="tf-sublabel">· 若留空則依預設排序；設定後將自動連動並推算下游任務排程</span></label>
          ${App.buildPredListHtml(t)}
        </div>
        <div class="form-row">
          <div class="form-field"><label>類型 <span data-tip="類型|任務=要排程的工作；里程碑=時間點標記（工期0）；群組=純分類母項，不排程" style="cursor:help;">?</span></label>
            <select id="tf-taskType">
              <option value="task" ${t.taskType === 'task' || !t.taskType ? 'selected' : ''}>📋 任務</option>
              <option value="milestone" ${t.taskType === 'milestone' ? 'selected' : ''}>◆ 里程碑</option>
              <option value="group" ${t.taskType === 'group' ? 'selected' : ''}>▦ 群組</option>
            </select>
          </div>
          <div class="form-field"><label>風險標記</label>
            <label class="tf-chk"><input type="checkbox" id="tf-riskHL" ${t.riskHL ? 'checked' : ''} onchange="App._tfToggleRisk()"> 標示為高風險任務 (High Risk)</label>
          </div>
        </div>
        <div class="form-field" id="tf-riskissue-wrap" style="${t.riskHL ? '' : 'display:none'}">
          <label>風險內容</label>
          <textarea id="tf-riskIssue" placeholder="請描述風險與因應方式">${U.esc(v(t.riskIssue))}</textarea>
        </div>
        <div class="form-field">
          <label>交付物</label>
          <textarea id="tf-deliverable" placeholder="請簡述本任務的最終產出或驗收標準（選填）">${U.esc(v(t.deliverable))}</textarea>
        </div>
        <div class="form-field">
          <label>交付物連結</label>
          <div class="tf-link-wrap"><i class="ti ti-link tf-link-ico" aria-hidden="true"></i><input type="text" id="tf-deliverableLink" class="tf-has-ico" value="${U.esc(v(t.deliverableLink))}" placeholder="請貼上檔案或雲端資料夾連結（選填）"></div>
        </div>
        <div class="form-field">
          <label>備註</label>
          <input type="text" id="tf-note" value="${U.esc(v(t.note))}">
        </div>
      </div>
    </div>
    </div>
  `;
};

// §18.10d 表單重排：狀態推導（依實際日·hold 覆蓋·不回退既有完成/進行）＋晶片同步＋淨工作天精算＋風險漸進
App._TF_STMAP = { pending: ['未開始', 'st-pending'], wip: ['進行中', 'st-wip'], done: ['已完成', 'st-done'], hold: ['擱置中', 'st-hold'] };
App._deriveStatus = function(actualStart, actualEnd, held, prevStatus) {
  if (held) return 'hold';
  if (actualEnd) return 'done';
  if (actualStart) return 'wip';
  if (prevStatus === 'done') return 'done';   // 舊資料無實際日的既有完成不回退
  if (prevStatus === 'wip') return 'wip';
  return 'pending';
};
App._tfSyncStatus = function() {
  const chip = document.getElementById('tf-stchip'); if (!chip) return;
  const held = !!(document.getElementById('tf-hold') || {}).checked;
  const aS = (document.getElementById('tf-actualStart') || {}).value || '';
  const aE = (document.getElementById('tf-actualEnd') || {}).value || '';
  const st = App._deriveStatus(aS, aE, held, chip.dataset.prev || '');
  const m = App._TF_STMAP[st] || App._TF_STMAP.pending;
  chip.className = 'tf-stchip ' + m[1];
  chip.textContent = '● ' + m[0];
  const hr = document.getElementById('tf-holdreason-wrap');
  if (hr) hr.style.display = held ? '' : 'none';
};
App.toggleNetDays = function(close) {
  const blk = document.getElementById('tf-netdays-block'), btn = document.getElementById('tf-netdays-btn');
  if (!blk) return;
  if (close) { blk.style.display = 'none'; if (btn) btn.style.display = ''; const inp = document.getElementById('tf-netdays'); if (inp) inp.value = ''; App._tfNetConv(); }
  else { blk.style.display = ''; if (btn) btn.style.display = 'none'; const inp = document.getElementById('tf-netdays'); if (inp) inp.focus(); App._tfNetConv(); }
};
App._tfNetConv = function() {
  const inp = document.getElementById('tf-netdays'); if (!inp) return;
  const conv = document.getElementById('tf-netdays-conv'), warn = document.getElementById('tf-netdays-warn'), spanEl = document.getElementById('tf-netdays-span');
  const durEl = document.getElementById('tf-duration');
  const span = durEl ? parseFloat(durEl.value) : 0;
  if (spanEl && span > 0) spanEl.textContent = span;   // 工期即時連動
  const nd = parseFloat(inp.value);
  if (!(nd > 0) || !(span > 0)) { if (conv) conv.textContent = ''; if (warn) warn.style.display = 'none'; return; }
  const pct = Math.round(nd / span * 100);
  if (conv) conv.textContent = '≈ ' + pct + '%／天';
  if (warn) {
    const effSel = document.getElementById('tf-effort');
    const effVal = effSel ? parseInt(effSel.value, 10) : 100;
    warn.style.display = '';
    warn.innerHTML = '負荷以淨工作天精算為準（<b>≈' + pct + '%／天</b>），已覆蓋每日投入程度（' + effVal + '%）。落差大屬正常——反映此任務跨度長、真正動工天數少。';
  }
};
App._tfToggleRisk = function() {
  const cb = document.getElementById('tf-riskHL'), wrap = document.getElementById('tf-riskissue-wrap');
  if (wrap) wrap.style.display = (cb && cb.checked) ? '' : 'none';
};
// §18.10d ⑤ 結案輕彈：長工期任務填實際完工日時，順手問「實際幾個淨工作天」收校準資料（可略過）
App._NETDAYS_MIN_SPAN = () => (DATA.settings && DATA.settings.longTaskDays > 0 ? DATA.settings.longTaskDays : 5);
App._promptNetDaysCalib = function(taskId) {
  const t = (DATA.tasks || []).find(x => x.id === taskId); if (!t) return;
  const span = Number(t.durationDays) || 0;
  const sch = getEffectiveSchedule(t) || {};
  const hasNet = (t.netWorkDays > 0);   // 已填過→預選「填實際」帶值；否則預選「採用預估」
  App.openModal({
    title: '實際工作天數回報',
    body: '<div class="netcalib">' +
      '<ul class="netcalib-info">' +
        '<li><b>任務：</b>' + U.esc(t.name) + '</li>' +
        '<li><b>預期進度：</b>' + span + ' 天（' + D.fmt(sch.start, 'md') + ' → ' + D.fmt(sch.end, 'md') + '）</li>' +
      '</ul>' +
      '<div class="netcalib-opts">' +
        '<label class="netcalib-opt"><input type="radio" name="netcalib-mode" value="est"' + (hasNet ? '' : ' checked') + ' onchange="App._netCalibMode()"><span>採用預估工期（' + span + ' 天）</span></label>' +
        '<label class="netcalib-opt"><input type="radio" name="netcalib-mode" value="actual"' + (hasNet ? ' checked' : '') + ' onchange="App._netCalibMode()"><span>填寫實際工期：</span><input type="number" id="netcalib-input" min="0" step="0.5" value="' + (hasNet ? t.netWorkDays : '') + '" placeholder="填寫數字"' + (hasNet ? '' : ' disabled') + '><span class="netcalib-unit">天</span></label>' +
      '</div>' +
      '<div class="netcalib-feel"><span class="netcalib-feel-lbl">主觀感受：</span>' +
        '<label class="netcalib-feel-opt"><input type="radio" name="netcalib-feel" value="lighter"' + (t.calibFeel === 'lighter' ? ' checked' : '') + '><span>比預估輕</span></label>' +
        '<label class="netcalib-feel-opt"><input type="radio" name="netcalib-feel" value="asExpected"' + (t.calibFeel === 'asExpected' ? ' checked' : '') + '><span>差不多</span></label>' +
        '<label class="netcalib-feel-opt"><input type="radio" name="netcalib-feel" value="heavier"' + (t.calibFeel === 'heavier' ? ' checked' : '') + '><span>比預估重</span></label>' +
      '</div>' +
      '<div class="netcalib-desc">💡 此數據將用於計算您的工時負荷，並讓系統分析預期進度與實際狀況的差異，以利抓出延遲風險與優化未來排程。（若目前無法評估可先取消）</div>' +
    '</div>',
    footer: '<button class="tb-action ghost" onclick="App.closeModal()">取消</button>' +
            '<button class="tb-action" onclick="App._netDaysCalibOk(\'' + t.id + '\')">確認更新</button>',
  });
  setTimeout(() => { App._netCalibMode(); }, 50);
};
App._netCalibMode = function() {
  const actual = document.querySelector('input[name="netcalib-mode"][value="actual"]');
  const inp = document.getElementById('netcalib-input');
  if (!inp) return;
  const on = !!(actual && actual.checked);
  inp.disabled = !on;
  if (on) { inp.focus(); if (inp.select) inp.select(); }
};
App._netDaysCalibOk = function(taskId) {
  const t = (DATA.tasks || []).find(x => x.id === taskId);
  const mode = (document.querySelector('input[name="netcalib-mode"]:checked') || {}).value;
  let n;
  if (mode === 'actual') { const i = document.getElementById('netcalib-input'); n = i ? parseFloat(i.value) : NaN; }
  else { n = Number(t && t.durationDays) || 0; }   // 採用預估工期＝跨度（比值 1.0＝準）
  App.closeModal();
  const feel = (document.querySelector('input[name="netcalib-feel"]:checked') || {}).value || '';
  if (t && n > 0) { t.netWorkDays = n; if (feel) t.calibFeel = feel; Store.tasks.save(); App.refreshAll(); U.toast('已記錄實際淨工作天：' + n + ' 天', 'success'); }
};

// 完整新增任務對話框（含日期、緊急度等所有欄位）
App.openNewTaskDialog = function(projId) {
  this.openModal({
    title: '新增任務',
    body: App.buildTaskFormHtml({ project: projId, start: D.fmt(D.today(), 'iso') }, 'new'),
    footer: `
      <button class="tb-action ghost" onclick="App.closeModal()">取消</button>
      <button class="tb-action" data-edit-hide onclick="App.saveNewTask('${projId}')">建立任務</button>
    `,
  });
  App.bindTaskTimeListeners();
  // Auto-focus on name field
  setTimeout(() => {
    const nameField = document.getElementById('tf-name');
    if (nameField) nameField.focus();
  }, 50);
};

// 總儀表板「+ 新增小時 Task」：照 openNewTaskDialog 同套，差別=不帶 project（跨專案，留空讓使用者選）+ measure='hours'（開出時段制）
App.openHoursTaskDialog = function() {
  this.openModal({
    title: '新增小時 Task',
    body: App.buildTaskFormHtml({ start: D.fmt(D.today(), 'iso') }, 'new', 'hours'),
    footer: `<button class="tb-action ghost" onclick="App.closeModal()">取消</button>
             <button class="tb-action" data-edit-hide onclick="App.saveNewTask()">建立任務</button>`,
  });
  App.bindTaskTimeListeners();
  setTimeout(() => { const n = document.getElementById('tf-name'); if (n) n.focus(); }, 50);
};

App.saveNewTask = function(projId, _skipNegCheck) {
  if (App._roGuard()) return;
  // M2 表單改造：必填檢查（專案/名稱/擔當/類型/階段/預計開始；house style：toast warning + return）
  const _miss = App._markTaskRequired([
    { id: 'tf-project', name: '專案' }, { id: 'tf-name', name: '任務名稱' }, { id: 'tf-owner', name: '擔當' },
    { id: 'tf-stage', name: '階段' },
  ]);
  if (_miss.length) { U.toast('⚠ 請填必填欄位：' + _miss.join('、'), 'warning'); return; }
  const name = document.getElementById('tf-name').value.trim();

  // §18.10d：狀態依實際日推導（新任務無 prevStatus）＋擱置＋淨工作天精算
  const _aS = (document.getElementById('tf-actualStart') || {}).value || '';
  const _aE = (document.getElementById('tf-actualEnd') || {}).value || '';
  const _held = !!(document.getElementById('tf-hold') || {}).checked;
  const _nd = parseFloat((document.getElementById('tf-netdays') || {}).value);
  const status = App._deriveStatus(_aS, _aE, _held, '');
  const startField = App.readStartField();   // 2-A：預計開始雙態 → {start, startMode}（與 saveTask 共用）
  // §6.5 塊三：負工期（完成早於開始）不擋死，改 confirm modal。判定讀 readEffStart 與 save 端/塊四口徑一致（涵蓋自動態）。
  const _negStart = App.readEffStart();
  const _pEnd = document.getElementById('tf-end').value;
  const _taskTypeV = document.getElementById('tf-taskType').value;
  if (!_skipNegCheck && _taskTypeV !== 'milestone' && _negStart && _pEnd && _pEnd < _negStart) {
    App.confirmModal({ title: '工期為負數', msg: '預計完成日早於開始日（工期為負數），確認要這樣修改嗎？系統會照您輸入儲存。', okText: '確認儲存', cancelText: '取消', onConfirm: () => App.saveNewTask(projId, true) });
    return;
  }
  const task = {
    id: U.id(),
    project: document.getElementById('tf-project').value || projId,
    name,
    desc: '',   // 表單改造：「說明」欄已併入「備註」移除；desc 資料層保留供匯入/延誤原因等自動流程
    owner: document.getElementById('tf-owner').value.trim(),
    dept: (document.querySelector('.task-form').dataset.measure === 'hours') ? ((document.getElementById('tf-dept') || {}).value || '') : '',   // 選項Y：時段制存部門名（§18.10）；工期制不掛、留 role 衍生
    category: 'deep',  // M2 表單改造：分類欄 UI 已移除，資料層保留、新任務一律 deep（工作性質維度後續另議）
    taskType: document.getElementById('tf-taskType').value,  // M2-T4：使用者顯式選擇（非 hardcode 預設，quickAdd 仍靠 ensureTaskType 兜底）
    stage: document.getElementById('tf-stage').value.trim(),       // M2-2a：與同步/匯入同欄位，trim 同收集口徑
    subgroup: '',   // 表單改造：子群組欄移出表單；資料層保留（Excel 匯入/大表分組仍用）
    urgency: document.getElementById('tf-urgency').value,
    status,
    actualStart: _aS,
    actualEnd: _aE,
    holdReason: _held ? ((document.getElementById('tf-holdReason') || {}).value || '').trim() : '',
    netWorkDays: (_nd > 0 ? _nd : undefined),   // §18.10d：手填才存（未填＝undefined 不入 JSON，taskIntensity 退 effortRatio）
    start: startField.start,           // 2-A：手動態存值、自動態存 ''（共用 readStartField）
    startMode: startField.startMode,   // 2-A：純 UI 意圖記憶（auto/manual）
    estHours: parseFloat(document.getElementById('tf-hours').value) || 1,
    effortRatio: (() => { const _v = parseInt((document.getElementById('tf-effort') || {}).value, 10); return isNaN(_v) ? 100 : _v; })(),   // §18.10c：投入% 六檔（負荷計算用，預設 100）
    predecessor: App.serializePredecessors(),  // M2-§6.4：結構化列序列化回字串（取代 #tf-predecessor 自由文字；格式同 parsePredecessors）
    wbs: '',           // 階段2：WBS 識別
    durationDays: App.readDurationField(),  // §6.5c：tf-end 反推為主、工期欄為輔（helper 單一真實來源）
    measureType: (document.querySelector('.task-form').dataset.measure) || 'duration',  // 第27項：計量制(duration工期/hours時段)，讀表單 data-measure；讀不到兜 duration
    scheduledStart: '',  // 排程套用結果，四條一致
    scheduledEnd: '',
    parentWbsId: '',   // 階段2：子綁父
    method: '',        // M2 表單改造：處理方式欄 UI 已移除，新任務存空字串
    riskHL: document.getElementById('tf-riskHL').checked,                       // M2 表單改造：HL+交付物四欄（與 WBS 匯入同欄位）
    riskIssue: document.getElementById('tf-riskIssue').value.trim(),
    deliverable: document.getElementById('tf-deliverable').value.trim(),
    deliverableLink: document.getElementById('tf-deliverableLink').value.trim(),
    deliverableType: '',   // §7.1（不接 UI，預設值）
    requiredTask: true,    // §7.1（預設全必要）
    mustIssue: false,      // §7.1
    note: document.getElementById('tf-note').value.trim(),
    canSplit: true,   // 表單改造：可切分欄位移除，新任務沿用預設可切分
    scheduleToCalendar: false,   // 表單改造：「排入行事曆」欄移除；底層排程 plumbing 保留（時段制/既有資料不受影響）
    completedAt: status === 'done' ? new Date().toISOString() : null,
    createdAt: new Date().toISOString(),
  };

  if (App._insertAfterId) {
    // 第二刀-B 選項1：列間➕＝接在上一列後。表單前置為空才自動帶入，不覆蓋使用者明填。
    if (!task.predecessor) task.predecessor = App._insertAfterId + '#FS';
    const _i = DATA.tasks.findIndex(x => x.id === App._insertAfterId);
    if (_i >= 0) { DATA.tasks.splice(_i + 1, 0, task); }   // 保留：同日 tiebreak
    else { DATA.tasks.push(task); }
    App._insertAfterId = null;
  } else {
    DATA.tasks.push(task);
  }
  // 修正1：新建小時 Task 立刻在「預計開始日」放臨時時段，週曆即時可見（智慧排程整批重建 schedule.items 時自然覆蓋重排；applySchedule 是 WBS 引擎、不碰時段 items）
  if (task.measureType === 'hours') {
    const _ps = (document.getElementById('tf-start') && document.getElementById('tf-start').value) || D.fmt(D.today(), 'iso');
    if (!DATA.schedule || !Array.isArray(DATA.schedule.items)) DATA.schedule = { week: null, items: [] };
    DATA.schedule.items.push({
      taskId: task.id, date: _ps, start: DATA.settings.workStart1 || '09:00',
      duration: Math.max(30, Math.round((parseFloat(task.estHours) || 1) * 60)),
      chunk: null, totalHours: parseFloat(task.estHours) || 1,
      week: D.weekKey(new Date(_ps)), locked: false, provisional: true,
    });
  }
  const _sch = applySchedule(DATA.tasks, 'full');
  const _blocked = _sch.skipped.filter(s => !String(s.reason || '').startsWith('anchor'));
  const _pid = this.currentProjectId;
  if (_pid) {
    const _proj = (DATA.projects || []).find(p => p.id === _pid);
    const _projBlocked = _blocked.filter(b => (DATA.tasks.find(t => t.id === b.id) || {}).project === _pid);
    if (_projBlocked.length) { U.toast('⚠️【' + ((_proj && _proj.name) || '本專案') + '】' + _projBlocked.length + ' 筆任務無法排程（循環或缺前置）', 'warning'); }
  }
  Store.tasks.save();
  Store.schedule.save();   // 時段制新任務會 push schedule.items；applySchedule 回寫 task 排程欄
  this.closeModal();
  this.refreshAll();
  U.toast(`✓ 已新增「${name}」`);
};

App.openTaskInProject = function(id) {
  const task = DATA.tasks.find(t => t.id === id);
  if (!task) { U.toast('⚠ 找不到任務', 'warning'); return; }
  // 跳到該專案頁
  this.currentProjectId = task.project;
  // 找對應的左側選單按鈕讓它高亮
  const btn = document.querySelector(`.sb-proj[onclick*="${task.project}"]`);
  this.showPage('project', btn);
  // 等專案頁渲染完再打開編輯 modal
  setTimeout(() => { this.openTaskModal(id); }, 100);
};

App.openTaskModal = function(id) {
  const t = DATA.tasks.find(x => x.id === id);
  if (!t) return;

  // Editable task
  const sch = getEffectiveSchedule(t);
  const proj = this.getProj(t.project);

  // 當前所在週次標示（紅色 ⁂ 表示未結案）
  const currentWeekBadge = t.currentWeek && t.status !== 'done'
    ? `<span style="display:inline-block; margin-left:8px; padding:2px 8px; background:var(--terracotta-l); color:var(--terracotta); border-radius:10px; font-size:11px; font-weight:600;">${U.esc(t.currentWeek)} <span style="color:var(--terracotta);">⁂</span></span>`
    : (t.currentWeek
        ? `<span style="display:inline-block; margin-left:8px; padding:2px 8px; background:var(--sage-50); color:var(--sage-700); border-radius:10px; font-size:11px; font-weight:600;">${U.esc(t.currentWeek)} ✓</span>`
        : '');

  // 歷史紀錄區塊
  const history = t.history || [];
  let historyHtml = '';
  if (history.length > 0) {
    const rows = history.map(h => {
      const statusColor = h.status?.includes('完成') ? 'var(--sage-700)' : h.status?.includes('延遲') ? 'var(--terracotta)' : 'var(--ink2)';
      return `<tr>
        <td class="col-num" style="font-family:var(--mono); font-size:10.5px; color:var(--ink3);">${U.esc(h.week || '')}</td>
        <td class="col-num" style="color:${statusColor};">${U.esc(h.status || '')}</td>
        <td class="col-flex col-wrap" style="line-height:1.4;">${U.esc(h.work || '—')}</td>
        <td class="col-mid col-wrap" style="font-family:var(--mono); font-size:10.5px; color:var(--ink3);">${h.planEnd || '—'}${h.planEndOriginal && h.planEndOriginal !== h.planEnd ? '<br><span style="color:var(--ink4); font-size:10px;">原:' + h.planEndOriginal + '</span>' : ''}</td>
        <td class="col-mid" style="font-family:var(--mono); font-size:10.5px; color:${h.actualEnd ? 'var(--sage-700)' : 'var(--ink3)'};">${h.actualEnd || '—'}</td>
        <td class="col-mid" style="color:var(--terracotta); font-size:11px;" title="${U.esc(h.delayReason || '')}">${U.esc(h.delayReason || '')}</td>
      </tr>`;
    }).join('');
    historyHtml = `
      <div class="form-field" style="margin-top:18px;">
        <label style="display:flex; align-items:center; gap:8px;">
          📋 歷史紀錄
          <span style="font-size:10.5px; color:var(--ink3); font-weight:400;">（共 ${history.length} 週的執行紀錄）</span>
        </label>
        <div style="border:1px solid var(--rule); border-radius:8px; overflow:hidden; max-height:220px; overflow-y:auto;">
          <table class="data-table" style="font-size:11.5px;">
            <thead>
              <tr>
                <th class="col-num">週次</th>
                <th class="col-num">狀態</th>
                <th class="col-flex">本週工作</th>
                <th class="col-mid">預計完成</th>
                <th class="col-mid">實際完成</th>
                <th class="col-mid">延誤理由</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  this.openModal({
    title: `編輯任務 ${currentWeekBadge}`,
    body: App.buildTaskFormHtml({ ...t, start: sch.start, end: sch.end }, 'edit')
      + `${historyHtml}`,
    footer: `
      <button class="tb-action danger" data-edit-hide onclick="App.deleteTask('${t.id}')" style="margin-right:auto;">刪除任務</button>
      <button class="tb-action ghost" onclick="App.closeModal()">取消</button>
      <button class="tb-action" data-edit-hide onclick="App.saveTask('${t.id}')">儲存</button>
    `,
  });
  App.bindTaskTimeListeners();
};

App.saveTask = function(id, _skipNegCheck) {
  if (App._roGuard()) return;
  const t = DATA.tasks.find(x => x.id === id);
  if (!t) return;
  // M2 表單改造：必填檢查（名稱/擔當/類型/階段/預計開始；編輯版專案是唯讀 div 無 tf-project，不檢查）
  const _miss = App._markTaskRequired([
    { id: 'tf-name', name: '任務名稱' }, { id: 'tf-owner', name: '擔當' },
    { id: 'tf-stage', name: '階段' },
  ]);
  if (_miss.length) { U.toast('⚠ 請填必填欄位：' + _miss.join('、'), 'warning'); return; }
  const name = document.getElementById('tf-name').value.trim();

  // §6.5 塊三：負工期（完成早於開始）不擋死，改 confirm modal（核心哲學：不替使用者做主、只提示）。判定讀 readEffStart 與塊四/save 端口徑一致（涵蓋自動態）。
  const _negStart = App.readEffStart();
  const _pEnd = document.getElementById('tf-end').value;
  const _taskTypeV = document.getElementById('tf-taskType').value;
  if (!_skipNegCheck && _taskTypeV !== 'milestone' && _negStart && _pEnd && _pEnd < _negStart) {
    App.confirmModal({ title: '工期為負數', msg: '預計完成日早於開始日（工期為負數），確認要這樣修改嗎？系統會照您輸入儲存。', okText: '確認儲存', cancelText: '取消', onConfirm: () => App.saveTask(id, true) });
    return;
  }
  const _aS = document.getElementById('tf-actualStart').value;
  const _aE = document.getElementById('tf-actualEnd').value;
  if (_aS && _aE && _aE < _aS) {
    U.toast('⚠ 實際完成日不能早於實際開始日', 'warning'); return;
  }

  t.name      = name;
  // 表單改造：「說明」欄移除（併入備註）——t.desc 不從表單覆蓋，保留既有值（匯入/延誤原因等自動流程用）
  t.owner     = document.getElementById('tf-owner').value.trim();
  // M2 表單改造：分類/處理方式欄 UI 已移除——t.category / t.method 保留原值不覆蓋
  t.taskType  = document.getElementById('tf-taskType').value;  // M2-T4：編輯送出同步類型
  t.stage     = document.getElementById('tf-stage').value.trim();     // M2-2a：與同步/匯入同欄位，trim 同收集口徑
  // 表單改造：子群組欄移出表單——t.subgroup 不從表單覆蓋，保留既有值（Excel/大表分組用）
  t.predecessor  = App.serializePredecessors();  // M2-§6.4：結構化列序列化回字串（與 saveNewTask 共用同一函式，單一真實來源）
  t.durationDays = App.readDurationField();   // §6.5c：tf-end 反推為主、工期欄為輔（helper 單一真實來源）
  t.measureType = t.measureType || 'duration';  // 第27項：edit 鎖定計量制——保留既有值不從 form 覆寫；舊資料無此欄兜 duration
  if (t.measureType === 'hours') { const _de = document.getElementById('tf-dept'); if (_de) t.dept = _de.value; }   // 選項Y：時段制編輯同步部門名（§18.10）；工期制不碰、保 role 衍生
  t.urgency   = document.getElementById('tf-urgency').value;
  { const _ef = document.getElementById('tf-effort'); if (_ef) { const _v = parseInt(_ef.value, 10); t.effortRatio = isNaN(_v) ? 100 : _v; } }   // §18.10c：投入% 六檔（負荷計算用）
  const startField = App.readStartField();   // 2-A：預計開始雙態（與 saveNewTask 共用同一取值邏輯）
  t.start     = startField.start;            // 手動態存值、自動態存 ''
  t.startMode = startField.startMode;
  const _prevAE = t.actualEnd || '';   // §18.10d ⑤：比對實際完工日是否本次新填/變更（決定是否跳結案輕彈）
  t.actualStart = document.getElementById('tf-actualStart').value;
  t.actualEnd   = document.getElementById('tf-actualEnd').value;
  t.estHours  = parseFloat(document.getElementById('tf-hours').value) || 1;
  t.riskHL    = document.getElementById('tf-riskHL').checked;                   // M2 表單改造：HL+交付物四欄（與 WBS 匯入同欄位）
  t.riskIssue = document.getElementById('tf-riskIssue').value.trim();
  t.deliverable = document.getElementById('tf-deliverable').value.trim();
  t.deliverableLink = document.getElementById('tf-deliverableLink').value.trim();
  t.note      = document.getElementById('tf-note').value.trim();
  // 表單改造：可切分欄位移除，編輯不覆蓋既有 t.canSplit
  // 表單改造：「排入行事曆」欄移除——t.scheduleToCalendar 不從表單覆蓋，保留既有值
  ensureDeliverFields(t);   // §7.1：UI 未接，只補缺不蓋既有值（單一兜底，不寫死預設覆蓋）

  // §18.10d：狀態依實際日推導（hold 覆蓋·不回退既有完成/進行）＋擱置原因＋淨工作天精算
  const _held = !!(document.getElementById('tf-hold') || {}).checked;
  t.holdReason = _held ? ((document.getElementById('tf-holdReason') || {}).value || '').trim() : '';
  { const _nEl = document.getElementById('tf-netdays'); const _nd = _nEl ? parseFloat(_nEl.value) : NaN; if (_nd > 0) t.netWorkDays = _nd; else delete t.netWorkDays; }
  let newStatus = App._deriveStatus(t.actualStart, t.actualEnd, _held, t.status);
  if (newStatus === 'done') {
    if (t.status !== 'done') t.completedAt = t.actualEnd || new Date().toISOString();
    t.progress = 100;
  } else {
    t.completedAt = null;
    if (t.progress === 100) t.progress = 30;
  }
  t.status = newStatus;

  const _sch = applySchedule(DATA.tasks, 'full');
  const _blocked = _sch.skipped.filter(s => !String(s.reason || '').startsWith('anchor'));
  const _pid = this.currentProjectId;
  if (_pid) {
    const _proj = (DATA.projects || []).find(p => p.id === _pid);
    const _projBlocked = _blocked.filter(b => (DATA.tasks.find(t => t.id === b.id) || {}).project === _pid);
    if (_projBlocked.length) { U.toast('⚠️【' + ((_proj && _proj.name) || '本專案') + '】' + _projBlocked.length + ' 筆任務無法排程（循環或缺前置）', 'warning'); }
  }
  Store.tasks.save();
  this.closeModal();
  this.refreshAll();
  U.toast('✓ 任務已儲存');
  // §18.10d ⑤ 結案輕彈：長工期任務新填/改實際完工日 → 順手問實際淨工作天（校準用·可略過）
  if (t.measureType !== 'hours' && t.status === 'done' && t.actualEnd && t.actualEnd !== _prevAE && (Number(t.durationDays) || 0) > App._NETDAYS_MIN_SPAN()) {
    App._promptNetDaysCalib(t.id);
  }
};

App.deleteTask = function(id) {
  if (App._roGuard()) return;
  App.confirmModal({
    icon: 'ti-trash', iconBg: '--rose-l', iconColor: '--rose-ink',
    title: '刪除任務？', msg: '刪除的任務會移到專案下方「🗑 已刪除」區塊保留 14 天，期間可隨時還原。', okText: '刪除', cancelText: '取消', okClass: 'danger',
    onConfirm: () => {
      const t = DATA.tasks.find(x => x.id === id);
      if (!t) return;
      t._deleted = true;
      t._deletedAt = new Date().toISOString();
      if (DATA.schedule && DATA.schedule.items) {
        DATA.schedule.items = DATA.schedule.items.filter(it => it.taskId !== id);
      }
      Store.tasks.save();
      Store.schedule.save();   // 上方移除了 schedule.items 中對應項
      App.closeModal();
      App.refreshAll();
      U.toast('✓ 已移到「已刪除」區塊（14 天內可還原）');
    },
  });
};

// ═══════════════════════════════════════════════════════
//  §19 ECN 設變案戰情室 dashboard（Tab A 任務與排程；複用 Stage 2 .s2-tbl 結構＋_s2PredCells＋既有 setter，
//  資料源 hijack：renderEcnDashboard 把 _tplPreview 指向 ECN live res（tasks＝DATA 活引用），
//  _s2* handler 全部沿用不改；編輯即改 DATA，_s2RefreshCase 於 ECN 模式走 _s2EcnPersist 存檔＋重繪。§19.10 B/B.1/B.2）
// ═══════════════════════════════════════════════════════

// §19 問題2/3：ECN live 專案一律 forward（開始為錨）。_effScheduleDir 在「開始+結束都有」時強制回 interval（反推），
// 故必須清 endDate（改存 targetEndDate 保留上市日資訊）才會走 forward。無開始日者補起算日＝該案最早 plannedStart。
// 回傳 migrated＝是否清過 endDate（true→呼叫端需重排+存檔，矯正既有 interval 案的日期）。
App._ecnForwardVariants = function(variants, tasks) {
  let migrated = false;
  (variants || []).forEach(v => {
    if (!v.schedule) return;
    if (!v.schedule.startDate && tasks) {
      const ss = tasks.filter(t => t.variant === v.id).map(t => t.plannedStart).filter(Boolean).sort();
      if (ss.length) v.schedule.startDate = ss[0];
    }
    if (v.schedule.endDate) { v.schedule.targetEndDate = v.schedule.endDate; v.schedule.endDate = ''; migrated = true; }
    v.schedule.direction = 'forward';
  });
  return migrated;
};
// 工時點數＝effortRatio% × 每日工時 × 工期（§19.4）
App._ecnPts = function(t) {
  const dh = (DATA.settings && DATA.settings.dailyHours) || 6;
  return ((t.effortRatio != null ? t.effortRatio : 100) / 100) * dh * (t.durationDays || 0);
};
// 投入%六檔行為錨點下拉選項（§19.4；0＝掛名未出力舉證）
// §19.4／§18.10c：投入% 六檔行為錨點——單一真實來源（short 給下拉、def 給定義/HintBox）。
// 判定只有一把尺：投入% ＝「這件事吃掉某人一天的百分比」；同一人同一天各任務投入% 相加 >100% ＝那天爆單。
App._EFFORT_TIERS = [
  { v: 0,   short: '暫無投入',   def: '' },
  { v: 10,  short: '微幅處理',   def: '如：簽核／回信' },
  { v: 25,  short: '零星投入',   def: '約 ¼ 天' },
  { v: 50,  short: '半日投入',   def: '約 ½ 天' },
  { v: 75,  short: '大半日投入', def: '' },
  { v: 100, short: '全日投入',   def: '單一專注' },
];
// 短標下拉（大表用，欄窄不塞定義，避坑10 截字）
App._ecnEffortOptions = function(v) {
  const cur = (v != null) ? v : 100;
  return App._EFFORT_TIERS.map(o => '<option value="' + o.v + '"' + (o.v === cur ? ' selected' : '') + '>' + o.v + '% ' + o.short + '</option>').join('');
};
// 含()定義下拉（任務表單用，欄寬夠、選項旁帶定義）：格式「V% · 短標（定義）」，定義空則省括號
App._effortOptionsFull = function(v) {
  const cur = (v != null) ? v : 100;
  return App._EFFORT_TIERS.map(o => '<option value="' + o.v + '"' + (o.v === cur ? ' selected' : '') + '>' + o.v + '% · ' + o.short + (o.def ? '（' + o.def + '）' : '') + '</option>').join('');
};
// PM 常駐列投入%下拉（§19.4：可上調、不可低於該級預設 floor）＝floor 本身＋六檔中 > floor 者
App._ecnPmEffortOptions = function(cur, floor) {
  const six = [0, 10, 25, 50, 75, 100];
  let vals = [floor].concat(six.filter(v => v > floor));
  if (cur != null && vals.indexOf(cur) < 0) vals.push(cur);
  vals = Array.from(new Set(vals)).sort((a, b) => a - b);
  const c = (cur != null) ? cur : floor;
  return vals.map(v => '<option value="' + v + '"' + (v === c ? ' selected' : '') + '>' + v + '%</option>').join('');
};
App._ecnSetEffort = function(taskId, val) {
  const res = App._tplPreview; if (!res) return;
  const t = (res.tasks || []).find(x => x.id === taskId); if (!t) return;
  t.effortRatio = parseInt(val, 10);   // 投入%不影響日期，改值即存不重排
  App._s2EcnPersist();
};
// 部門下拉選項（§19 #5：設變思維＝任務由哪部門做不固定，部門可換）：名冊各部門名＋「—」未指派
App._ecnDeptOptions = function(cur) {
  const res = App._tplPreview; const depts = (res && res.depts) || [];
  let html = '<option value=""' + (cur ? '' : ' selected') + '>—</option>';
  depts.forEach(d => { html += '<option value="' + U.esc(d.name) + '"' + (d.name === cur ? ' selected' : '') + '>' + U.esc(d.name) + '</option>'; });
  return html;
};
// 換部門：改 t.role（顯示部門）＋ t.dept（id）。#1 選部門→自動帶該部門第一個有名字的擔當；現擔當已屬新部門則保留。
App._ecnSetDept = function(taskId, deptName) {
  const res = App._tplPreview; if (!res) return;
  const t = (res.tasks || []).find(x => x.id === taskId); if (!t) return;
  const d = (res.depts || []).find(x => x.name === deptName);
  t.role = deptName;
  t.dept = d ? d.id : '';
  if (!(d && (d.members || []).some(m => m.name === t.owner))) {
    const fm = d ? (d.members || []).find(m => m.name) : null;
    t.owner = fm ? fm.name : '';
  }
  App._s2EcnPersist();
};
// #1 選擔當 → 自動帶入該人所屬部門（ECN 專用；NPI 用 _s2SetOwner 不連動部門）。
App._ecnSetOwner = function(taskId, value) {
  const res = App._tplPreview; if (!res) return;
  const t = (res.tasks || []).find(x => x.id === taskId); if (!t) return;
  t.owner = value;
  if (value) {
    const d = (res.depts || []).find(dp => (dp.members || []).some(m => m.name === value));
    if (d) { t.role = d.name; t.dept = d.id; }
  }
  App._s2EcnPersist();
};
// §6.5 開始為錨：改開始日＝釘手填錨點 t.start（computeSchedule ① 尊重不覆蓋）；清空＝回歸前置驅動。forward 重排＋存檔。
App._ecnSetStart = function(taskId, val) {
  const res = App._tplPreview; if (!res) return;
  const t = (res.tasks || []).find(x => x.id === taskId); if (!t) return;
  t.start = val || '';
  App._reschedulePreview(res.tasks, res.variants, []);
  App._s2EcnPersist();
};
// §6.5 改完成日→回算工期（開始當錨，不反推開始）。dur＝workdaysBetween(開始, 完成)（含頭尾）。
App._ecnSetEnd = function(taskId, val) {
  const res = App._tplPreview; if (!res) return;
  const t = (res.tasks || []).find(x => x.id === taskId); if (!t) return;
  const eff = getEffectiveSchedule(t);
  const s = t.start || t.plannedStart || eff.start;
  if (val && s) t.durationDays = Math.max(1, D.workdaysBetween(s, val));
  App._reschedulePreview(res.tasks, res.variants, []);
  App._s2EcnPersist();
};
// 狀態＝唯讀·衍生（實際優先，§五對齊）：實際完工→已完工＞擱置＞實際開工→進行中＞計畫結束已過(無實際)→逾期＞計畫已到開工日→進行中＞未開始。
// 大表「日期」是計畫排程；實際開工/完工日在「⚙ 編輯」記錄。逾期＝計畫結束日過了但沒實際完工。
App._ecnStatusDerive = function(t) {
  const todayIso = D.fmt(D.today(), 'iso');
  if (t.actualEnd || t.status === 'done') return { label: '已完工', cls: 'done' };
  if (t.status === 'hold') return { label: '擱置', cls: 'hold' };
  if (t.actualStart) return { label: '進行中', cls: 'wip' };
  if (t.plannedEnd && t.plannedEnd < todayIso) return { label: '逾期', cls: 'delayed' };
  if (t.plannedStart && t.plannedStart <= todayIso) return { label: '進行中', cls: 'wip' };
  return { label: '未開始', cls: 'todo' };
};
// #3 任務名點擊編輯：span→input、focus 全選，失焦/Enter 存檔（_s2SetName→ECN persist 重繪回省略態）
App._ecnEditName = function(span, taskId) {
  const res = App._tplPreview; if (!res) return;
  const t = (res.tasks || []).find(x => x.id === taskId); if (!t) return;
  const inp = document.createElement('input');
  inp.className = 's2-name-inp'; inp.value = t.name;
  inp.onblur = function() { App._s2SetName(taskId, inp.value); };
  inp.onkeydown = function(e) { if (e.key === 'Enter') inp.blur(); };
  span.replaceWith(inp); inp.focus(); if (inp.select) inp.select();
};
// 刪除任務（二次確認，列出連帶影響後置數）→ 走共用 _s2DelRow（ECN 模式自動存檔重繪）
App._ecnDelTask = function(taskId) {
  const res = App._tplPreview; if (!res) return;
  const dependents = (res.tasks || []).filter(t => String(t.predecessor || '').split(/[,，;；]/).some(p => p.split('#')[0].trim() === taskId)).length;
  App.confirmModal({
    icon: 'ti-trash', iconBg: '--rose-l', iconColor: '--rose-ink', okClass: 'danger',
    title: '刪除任務', msg: '此舉將連帶影響 <b>' + dependents + '</b> 個後置任務的排程，確定刪除？', okText: '刪除', cancelText: '取消',
    onConfirm: function() { App._s2DelRow(taskId); },
  });
};
// ⚙ 編輯任務 modal（特殊操作）：狀態＝自動/已完工/擱置(＋原因)、打回重測(已完工才有)、刪除。
App._ecnEditTask = function(taskId) {
  const res = App._tplPreview; if (!res) return;
  const t = (res.tasks || []).find(x => x.id === taskId); if (!t) return;
  const isDone = t.status === 'done' || !!t.actualEnd;
  const isHold = t.status === 'hold';
  const anomaly = isDone
    ? '<div class="form-field"><label>異常變更</label><button class="tb-action ghost" style="color:var(--rose-ink);border-color:var(--rose-l)" onclick="App._ecnLoopTask(\'' + taskId + '\')">↩ 打回重測</button><div class="ecn-edit-hint">👉 點擊後直接連動成因選單（＝完工後被退重做）。</div></div>'
    : '<div class="form-field"><label>異常變更</label><div class="ecn-edit-hint">※ 任務有「實際完工日」後，方可解鎖「打回重測」。<br>中途追加請用大表列間的「＋」；結案後翻案重啟屬整案結案流程（下一波）。</div></div>';
  App.openModal({
    title: '⚙ 編輯任務 · ' + U.esc(t.name),
    body:
      '<div class="ecn-edit-hint" style="margin-bottom:12px">💡 進度狀態由<b>實際日期</b>判定。（外層大表的「計畫日期」僅供排程參考，不影響狀態）</div>' +
      '<div class="form-row">' +
        '<div class="form-field"><label>實際開工日</label><input type="date" id="ecn-edit-astart" value="' + (t.actualStart || '') + '"><div class="ecn-edit-hint">填寫即轉為「進行中」</div></div>' +
        '<div class="form-field"><label>實際完工日</label><input type="date" id="ecn-edit-aend" value="' + (t.actualEnd || '') + '"><div class="ecn-edit-hint">填寫即轉為「已完工」，自動退出待消化工時</div></div>' +
      '</div>' +
      '<div class="form-field" style="margin-top:8px"><label class="ecn-edit-chk"><input type="checkbox" id="ecn-edit-hold"' + (isHold ? ' checked' : '') + ' onchange="App._ecnEditToggleHold()"> 擱置（暫停這項）</label></div>' +
      '<div class="form-field" id="ecn-edit-holdwrap" style="' + (isHold ? '' : 'display:none') + '">' +
        '<label>擱置原因（為何暫停這項？結案檢討會用到）</label>' +
        '<textarea id="ecn-edit-holdreason" rows="2" placeholder="例：等客戶確認規格／供應商缺料／上級喊停">' + U.esc(t.holdReason || '') + '</textarea></div>' +
      anomaly,
    footer:
      '<button class="tb-action ghost" style="color:var(--rose-ink);margin-right:auto" onclick="App._ecnDelTask(\'' + taskId + '\')">🗑 刪除任務</button>' +
      '<button class="tb-action ghost" onclick="App.closeModal()">取消</button>' +
      '<button class="tb-action" onclick="App._ecnEditTaskSave(\'' + taskId + '\')">儲存</button>',
  });
};
App._ecnEditToggleHold = function() {
  const c = document.getElementById('ecn-edit-hold');
  const w = document.getElementById('ecn-edit-holdwrap');
  if (w) w.style.display = (c && c.checked) ? '' : 'none';
};
App._ecnEditTaskSave = function(taskId) {
  const res = App._tplPreview; if (!res) return;
  const t = (res.tasks || []).find(x => x.id === taskId); if (!t) return;
  const hold = !!(document.getElementById('ecn-edit-hold') || {}).checked;
  const reason = (document.getElementById('ecn-edit-holdreason') || {}).value || '';
  const astart = (document.getElementById('ecn-edit-astart') || {}).value || '';
  const aend = (document.getElementById('ecn-edit-aend') || {}).value || '';
  const _prevAE = t.actualEnd || '';   // §18.10d ⑤：比對實際完工日是否本次新填/變更（決定是否跳結案輕彈）
  t.actualStart = astart;
  t.actualEnd = aend;
  if (hold) { t.status = 'hold'; t.holdReason = reason; }
  else {
    t.holdReason = '';
    if (aend) { t.status = 'done'; t.progress = 100; }   // 有實際完工日＝完成、退待消化工時
    else { t.status = astart ? 'wip' : 'pending'; if (typeof t.progress === 'number' && t.progress >= 100) t.progress = 0; }
  }
  App.closeModal();
  App._s2EcnPersist();
  // §18.10d ⑤ 結案輕彈（ECN 同 NPI）：長工期任務新填/改實際完工日 → 順手問實際淨工作天（校準用·可略過）
  if (t.measureType !== 'hours' && t.status === 'done' && t.actualEnd && t.actualEnd !== _prevAE && (Number(t.durationDays) || 0) > App._NETDAYS_MIN_SPAN()) {
    App._promptNetDaysCalib(t.id);
  }
};
// 打回重測（重測迴圈🔄）：成因窗 → loopCount++ ＋ ecnEvents ＋ 生成 isLoopTask 重做列（接原任務、帶原工期/比例）→ 重排存檔。
App._ecnLoopTask = function(taskId) {
  App.closeModal();
  App._ecnCauseModal('loop', function(cause) {
    const res = App._tplPreview; if (!res) return;
    const orig = (res.tasks || []).find(x => x.id === taskId); if (!orig) return;
    const proj = App.getProj(App._s2EcnMode);
    if (proj) { proj.loopCount = (proj.loopCount || 0) + 1; (proj.ecnEvents = proj.ecnEvents || []).push({ type: 'loop', date: D.fmt(new Date(), 'iso'), label: '打回重測：' + orig.name, cause: cause }); }
    const idx = res.tasks.findIndex(x => x.id === taskId);
    const dh = (DATA.settings && DATA.settings.dailyHours) || 6;
    const nt = {
      id: U.id(), project: res.project.id, wbs: '', parentWbsId: '',
      name: '重工：' + orig.name, desc: orig.stage || '', category: 'deep', taskType: '任務',
      predecessor: orig.id + '#FS', durationDays: orig.durationDays || 1, owner: orig.owner || '', dept: orig.dept || '', role: orig.role || '', variant: orig.variant,
      start: '', end: '', plannedStart: '', plannedEnd: '', actualStart: '', actualEnd: '',
      progress: 0, status: 'pending', urgency: 'med', estHours: dh,
      method: '', canSplit: false, completedAt: null, createdAt: new Date().toISOString(), scheduledStart: '', scheduledEnd: '', synced: false, stage: orig.stage || '', subgroup: '',
      mustDeliver: false, deliverableType: '', requiredTask: true, mustIssue: false, deliverable: '', riskIssue: '', delivered: '', deliverableLink: '', note: '',
      effortRatio: (orig.effortRatio != null ? orig.effortRatio : 50), taskAttr: 'baseline', isLoopTask: true, loopFromId: orig.id, causeTag: cause,
    };
    res.tasks.splice(idx + 1, 0, nt);
    App._reschedulePreview(res.tasks, res.variants, []);
    App._s2EcnPersist();
  });
};
App._ecnSetTab = function(tab) { App._ecnTab = tab; const p = App.getProj(App.currentProjectId); if (p) App._bomRerender(p); };
// §19.6.3 頁面重構：BOM 頁內部 sub-tab（結算／明細）·ECN/NPI 共用·沿用 _bomRerender 模式
App._bomSetSubTab = function(t) { App._bomSubTab = t; const p = App.getProj(App.currentProjectId); if (p) App._bomRerender(p); };

// ─── 結案 / 翻案 / epoch 狀態機（§19.5 洞4·§19.10 B.1 #5）───
// epoch 模型（F·輕量）：proj.version＝當前版號（預設1）；task.epoch＝建立時版號（未標＝視為當前，未翻案的案不用標）；
// 翻案時把現有未標任務標成當時版號凍結、version++。在途只算當前 epoch、累計＝全任務。
App._ecnEnsureState = function(proj) {
  if (proj.version == null) proj.version = 1;
  if (!Array.isArray(proj.epochs)) proj.epochs = [];
  if (proj.status == null) proj.status = 'active';
};
App._ecnLocked = function(proj) { return (proj.status || 'active') === 'closed'; };   // 結案＝整案唯讀
App._ecnIsCurrentEpoch = function(t, proj) { return t.epoch == null || t.epoch === (proj.version || 1); };   // 當前 epoch（含未標記）
App._ecnEpochPts = function(proj, tasks) { return tasks.filter(t => App._ecnIsCurrentEpoch(t, proj)).reduce((s, t) => s + App._ecnPts(t), 0); };
// ─── 生效日雙卡（§19.5 Phase 5 呆滯料防報廢）───
// 舊料剩餘量 ÷ 日消耗率 → 耗盡日；生效日早於耗盡日＝切換時舊料沒用完→報廢（剩餘量−到生效日的消耗）×舊單價。回 null＝未填。
App._ecnStockGate = function(qty, rate, unit, price, effDate) {
  const q = parseFloat(qty) || 0, r = parseFloat(rate) || 0, pr = parseFloat(price) || 0;
  if (q <= 0) return null;   // 無舊料＝無呆滯卡控（漸進切換或無舊料）
  if (r <= 0) {   // 有舊料但消耗率=0（特殊專案專用料·無固定消耗）：耗盡日無限遠→全數報廢·避免「剩餘量÷0」除零（§19.5 防呆）
    return { runoutDate: null, infinite: true, scrapQty: Math.round(q * 100) / 100, scrapCost: Math.round(q * pr), red: !!effDate };
  }
  const dailyR = unit === 'week' ? r / 7 : r;
  const todayIso = D.fmt(D.today(), 'iso');
  const runoutDate = D.fmt(D.addDays(D.today(), Math.ceil(q / dailyR)), 'iso');
  const daysToEff = effDate ? Math.round((new Date(effDate) - new Date(todayIso)) / 86400000) : 0;
  const scrapQty = Math.max(0, q - dailyR * Math.max(0, daysToEff));
  return { runoutDate, scrapQty: Math.round(scrapQty * 100) / 100, scrapCost: Math.round(scrapQty * pr), red: !!(effDate && scrapQty > 0) };
};
// 結案彈窗即時算：讀舊料欄＋生效日→更新結果列（紅/綠燈）
App._ecnStockCalc = function(projId) {
  const el = document.getElementById('ecn-stk-result'); if (!el) return;
  const gv = id => (document.getElementById(id) || {}).value;
  const res = App._ecnStockGate(gv('ecn-stk-qty'), gv('ecn-stk-rate'), gv('ecn-stk-unit'), gv('ecn-stk-price'), gv('ecn-close-eff'));
  const p = App.getProj(projId); const base = (p && p.bomBaseCurrency) || 'NTD';
  const _ovrEl = document.getElementById('ecn-override');
  if (!res) { el.className = 'ecn-stk-result na'; el.innerHTML = '填「舊料剩餘量」與「消耗率」即自動算耗盡日並比對生效日。'; if (_ovrEl) _ovrEl.style.display = 'none'; return; }
  el.className = 'ecn-stk-result ' + (res.red ? 'red' : 'green');
  el.innerHTML = res.infinite
    ? '🔴 舊料無固定消耗率（耗盡日視為無限遠）→ 生效日切換將<b>全數報廢 ' + res.scrapQty + '</b> 顆＝<b>' + res.scrapCost.toLocaleString() + ' ' + base + '</b>。請確認是否為專案專用料。'
    : res.red
    ? '🔴 舊料耗盡日 <b>' + res.runoutDate + '</b>，晚於生效日 → 切換時報廢 <b>' + res.scrapQty + '</b> 顆＝<b>' + res.scrapCost.toLocaleString() + ' ' + base + '</b>。改「漸進切換」或延後生效日可消呆滯。'
    : '🟢 舊料耗盡日 <b>' + res.runoutDate + '</b>，不晚於生效日 → 舊料用完再切、無報廢，放行。';
  // B-2（§19.5）：超過特批門檻（開關開 且 red 且 報廢金額 > 有效門檻）→ 顯特批區
  const gateOn = DATA.settings.ecnScrapGateOn ?? true;
  const thr = (p && p.scrapThresholdOverride != null) ? p.scrapThresholdOverride : (DATA.settings.ecnScrapThreshold ?? 30000);
  const over = !!(res.red && gateOn && res.scrapCost > thr);
  if (_ovrEl) _ovrEl.style.display = over ? 'block' : 'none';
  if (over) el.innerHTML += ' <b>· 超過特批門檻 ' + thr.toLocaleString() + ' ' + base + '，需下方特批。</b>';
};
// 結案：ecnNo＋生效日必填 → status=closed → 凍結當前 epoch snapshotHours（歷史總投入）＋事件
App.closeEcn = function(projId) {
  if (App._roGuard()) return;
  const p = App.getProj(projId); if (!p) return;
  App._ecnEnsureState(p);
  const ss = p.stockSnapshot || {};
  const approvers = DATA.settings.ecnApprovers || [];   // B-2：財務特批權責名冊（§19.5）
  const apprOpts = approvers.length
    ? '<option value="">— 請選擇核准人 —</option>' + approvers.map(a => '<option value="' + U.esc(a) + '">' + U.esc(a) + '</option>').join('')
    : '<option value="">（名冊為空 · 請先至 設定 → ECN 流程參數配置 建立）</option>';
  App.openModal({
    title: '結案設變 — 打正式 ECN 單號＋生效日',
    body: '<div class="ecn-close-form">' +
      '<div class="field-hint">結案後本版（v' + p.version + '）任務凍結為唯讀歷史；正式 ECN 單號與生效日為必填（打進 PLM/ERP 的追溯依據）。若後續再有變更，可「翻案重啟」開新版。</div>' +
      '<div class="form-field"><label>正式 ECN 單號 <b class="imap-req">*</b></label><input id="ecn-close-no" type="text" value="' + U.esc(p.ecnNo || '') + '" placeholder="如 ECN-2026-0042"></div>' +
      '<div class="form-field"><label>簽核生效日 <b class="imap-req">*</b></label><input id="ecn-close-eff" type="date" value="' + U.esc(p.effectiveDate || '') + '" oninput="App._ecnStockCalc(\'' + projId + '\')"></div>' +
      '<div class="ecn-stk-sect">舊料切換卡控（選填 · 生效日雙卡）</div>' +
      '<div class="field-hint">切 BOM 前填舊料剩餘量與消耗率，系統算耗盡日、比對生效日：舊料沒用完就切＝報廢，會提醒。漸進切換或無舊料可留空。</div>' +
      '<div class="ecn-stk-row">' +
        '<div class="form-field"><label>舊料剩餘量</label><input id="ecn-stk-qty" type="number" min="0" value="' + (ss.oldQtyLeft != null ? ss.oldQtyLeft : '') + '" oninput="App._ecnStockCalc(\'' + projId + '\')"></div>' +
        '<div class="form-field"><label>消耗率</label><div class="ecn-stk-rate-wrap"><input id="ecn-stk-rate" type="number" min="0" value="' + (ss.consumeRate != null ? ss.consumeRate : '') + '" oninput="App._ecnStockCalc(\'' + projId + '\')"><select id="ecn-stk-unit" onchange="App._ecnStockCalc(\'' + projId + '\')"><option value="day"' + (ss.consumeUnit !== 'week' ? ' selected' : '') + '>顆/日</option><option value="week"' + (ss.consumeUnit === 'week' ? ' selected' : '') + '>顆/週</option></select></div></div>' +
        '<div class="form-field"><label>舊單價（算報廢金額）</label><input id="ecn-stk-price" type="number" min="0" value="' + (ss.oldPrice != null ? ss.oldPrice : '') + '" oninput="App._ecnStockCalc(\'' + projId + '\')"></div>' +
      '</div>' +
      '<div id="ecn-stk-result" class="ecn-stk-result na">填「舊料剩餘量」與「消耗率」即自動算耗盡日並比對生效日。</div>' +
      '<div id="ecn-override" class="ecn-override" style="display:none">' +
        '<div class="form-field"><label>特批理由 <b class="imap-req">*</b>（至少 10 字，避免敷衍留痕）</label><textarea id="ecn-ovr-reason" rows="2" placeholder="請輸入具體特批原因（例如：客戶要求提前導入，料件由專案全額吸收）"></textarea></div>' +
        '<div class="form-field"><label>核准人 <b class="imap-req">*</b>（從「ECN 財務特批權責名冊」選、不可手打）</label><select id="ecn-ovr-approver">' + apprOpts + '</select></div>' +
      '</div>' +
      '</div>',
    footer: '<button class="tb-action ghost" onclick="App.closeModal()">取消</button>' +
      '<button class="tb-action" onclick="App._ecnCloseConfirm(\'' + projId + '\')">確認結案</button>',
  });
  setTimeout(() => App._ecnStockCalc(projId), 0);   // 開窗即算一次（帶回既有 stockSnapshot 時直接顯燈）
};
App._ecnCloseConfirm = function(projId) {
  const p = App.getProj(projId); if (!p) return;
  const gv = id => (document.getElementById(id) || {}).value || '';
  const no = gv('ecn-close-no').trim();
  const eff = gv('ecn-close-eff');
  if (!no) { U.toast('⚠ 正式 ECN 單號必填', 'warning'); return; }
  if (!eff) { U.toast('⚠ 簽核生效日必填', 'warning'); return; }
  App._ecnEnsureState(p);
  // 生效日雙卡（§19.5 Phase 5）：舊料切換卡控快照（選填）
  const stkQty = gv('ecn-stk-qty'), stkRate = gv('ecn-stk-rate'), stkUnit = gv('ecn-stk-unit'), stkPrice = gv('ecn-stk-price');
  const gate = App._ecnStockGate(stkQty, stkRate, stkUnit, stkPrice, eff);
  if (gate) {
    p.stockSnapshot = { oldQtyLeft: parseFloat(stkQty) || 0, consumeRate: parseFloat(stkRate) || 0, consumeUnit: stkUnit || 'day',
      oldPrice: parseFloat(stkPrice) || 0, runoutDate: gate.runoutDate, scrapQty: gate.scrapQty, scrapCost: gate.scrapCost };
  }
  // B-2（§19.5）：呆滯超門檻強制特批＋留痕（事後追溯·不發信；事前線上簽核＝Phase 2）
  const gateOn = DATA.settings.ecnScrapGateOn ?? true;
  const thr = (p.scrapThresholdOverride != null) ? p.scrapThresholdOverride : (DATA.settings.ecnScrapThreshold ?? 30000);
  const over = !!(gate && gate.red && gateOn && gate.scrapCost > thr);
  let override = null;
  if (over) {
    if (!(DATA.settings.ecnApprovers || []).length) { U.toast('⚠ 呆滯超門檻需特批，請先至 設定 → ECN 流程參數配置 建立財務特批權責名冊', 'warning'); return; }
    const reason = gv('ecn-ovr-reason').trim(), approver = gv('ecn-ovr-approver');
    if (reason.length < 10) { U.toast('⚠ 呆滯超門檻：特批理由需至少 10 字', 'warning'); return; }
    if (!approver) { U.toast('⚠ 呆滯超門檻：請從名冊選核准人', 'warning'); return; }
    override = { reason: reason, approver: approver, at: D.fmt(new Date(), 'iso') };
  }
  const tasks = DATA.tasks.filter(t => t.project === p.id && !t._deleted);
  const base = p.bomBaseCurrency || 'NTD';
  p.ecnNo = no; p.effectiveDate = eff; p.status = 'closed';
  p.epochs.push({ v: p.version, frozenAt: D.fmt(new Date(), 'iso'), effectiveDate: eff, ecnNo: no,
    snapshotHours: Math.round(App._ecnEpochPts(p, tasks)), loopCount: p.loopCount || 0, scopeGrowthCount: p.scopeGrowthCount || 0,
    scrapCost: gate ? gate.scrapCost : 0, override: override });
  (p.ecnEvents = p.ecnEvents || []).push({ type: 'close', date: D.fmt(new Date(), 'iso'),
    label: '結案 v' + p.version + '（' + no + '·生效 ' + eff + '）' + (gate && gate.red ? '·切換報廢 ' + gate.scrapCost.toLocaleString() + ' ' + base : '') + (override ? '·特批：' + U.esc(override.approver) : '') });
  Store.projects.save();
  App.closeModal();
  App._bomRerender(p);
  U.toast('✓ 已結案 v' + p.version + '：' + no + (gate && gate.red ? '（⚠ 切換報廢 ' + gate.scrapCost.toLocaleString() + ' ' + base + '）' : ''), gate && gate.red ? 'warning' : 'success');
};
// 翻案重啟：現有任務標當前版號凍結唯讀 → version++ → status=active（回可編輯繼續做）＋reopenCount++＋事件
App.reopenEcn = function(projId) {
  if (App._roGuard()) return;
  const p = App.getProj(projId); if (!p) return;
  App._ecnEnsureState(p);
  App.confirmModal({
    title: '翻案重啟？', okText: '開新版重啟', cancelText: '取消',
    msg: '本版（v' + p.version + '·' + (p.ecnNo || '無單號') + '）將凍結為唯讀歷史，開新版 v' + ((p.version || 1) + 1) + ' 繼續。翻案次數計入紅旗（血淚證據）。確定？',
    onConfirm: () => {
      const tasks = DATA.tasks.filter(t => t.project === p.id && !t._deleted);
      const oldV = p.version || 1;
      tasks.forEach(t => { if (t.epoch == null) t.epoch = oldV; });   // 現有任務凍結為當前版
      p.version = oldV + 1;
      p.status = 'active';
      p.reopenCount = (p.reopenCount || 0) + 1;
      p.ecnNo = '';   // 新版重新結案時再打單號
      (p.ecnEvents = p.ecnEvents || []).push({ type: 'reopen', date: D.fmt(new Date(), 'iso'), label: '翻案重啟 → v' + p.version + '（前版凍結）' });
      Store.tasks.save();      // 上方標 t.epoch 凍結現有任務
      Store.projects.save();   // p.version/status/reopenCount/ecnNo/ecnEvents
      App._bomRerender(p);
      U.toast('↻ 已開新版 v' + p.version + '，前版凍結為唯讀歷史', 'success');
    },
  });
};

// 成因窗（§19.5 六項 enum，必填）：插入=中途追加／打回重測共用；onConfirm(cause) 回選的成因
App._ecnCauseModal = function(kind, onConfirm) {
  const sub = kind === 'loop' ? '這筆退回重做是誰造成的？' : '這筆中途追加是誰造成的？';
  App.openModal({
    title: '記錄異常成因（必填，不可跳過）',
    body: '<div class="form-field"><label>' + sub + '</label>' +
      '<select id="ecn-cause-sel">' + ['客戶方', '供應商', '內部設計', '物理干涉', '法規追加', '測試不確定'].map(c => '<option>' + c + '</option>').join('') + '</select></div>' +
      '<div class="form-field"><label>備註（選填，一句話）</label><input id="ecn-cause-note" type="text" placeholder="例：客戶反映外殼異音，需追加緩衝墊"></div>',
    footer: '<button class="tb-action ghost" onclick="App.closeModal()">取消</button><button class="tb-action" onclick="App._ecnCauseOk()">確認記錄</button>',
  });
  App._ecnCauseCb = onConfirm;
};
App._ecnCauseOk = function() {
  const cause = (document.getElementById('ecn-cause-sel') || {}).value || '';
  const cb = App._ecnCauseCb; App._ecnCauseCb = null;
  App.closeModal();
  if (cb) cb(cause);
};
// 列間插入＝中途追加（範圍蔓延🌫）：成因窗 → scopeGrowthCount++ ＋ ecnEvents ＋ 走共用 _s2InsertRow（ECN 模式自動存檔重繪）
App._ecnInsertTask = function(afterId, variantId) {
  App._ecnCauseModal('scope', function(cause) {
    const proj = App.getProj(App._s2EcnMode);
    if (proj) {
      proj.scopeGrowthCount = (proj.scopeGrowthCount || 0) + 1;
      (proj.ecnEvents = proj.ecnEvents || []).push({ type: 'scope', date: D.fmt(new Date(), 'iso'), label: '中途追加任務', cause: cause });
    }
    App._s2InsertRow(afterId, variantId);
  });
};

// 全新任務（臨時追加）：非重工·非中途追加，不記異常成因、不計範圍蔓延。彈窗問名稱＋歸屬階段（多案別才問案別）。
App._ecnNewTask = function(projId) {
  const proj = App.getProj(projId); if (!proj) return;
  if (App._ecnLocked(proj)) { U.toast('已結案專案為唯讀，如需變更請先翻案重啟', 'warning'); return; }
  const res = App._tplPreview; if (!res) return;
  const variants = (proj.variants && proj.variants.length) ? proj.variants : [{ id: ((res.tasks[0] || {}).variant) || null, name: '' }];
  const stageSeen = [];   // 跨案別收集階段名（去重·保序）
  variants.forEach(v => { App._s2GroupByStage(v.id).order.forEach(st => { if (st && stageSeen.indexOf(st) < 0) stageSeen.push(st); }); });
  const stageOpts = stageSeen.length ? stageSeen.map(s => '<option value="' + U.esc(s) + '">' + U.esc(s) + '</option>').join('') : '<option value="">（無階段）</option>';
  const activeVid = App._ecnActiveVariant(proj);   // 預帶當前分頁案別
  const varRow = variants.length > 1
    ? '<div class="form-field"><label>案別</label><select id="ecn-new-variant">' + variants.map(v => '<option value="' + v.id + '"' + (v.id === activeVid ? ' selected' : '') + '>' + U.esc(v.name || v.id) + '</option>').join('') + '</select></div>'
    : '';
  App.openModal({
    title: '＋ 新增任務',
    body: '<div class="ecn-edit-hint" style="margin-bottom:12px">💡 臨時追加的全新工作項目（非重工、非中途追加，不記異常成因）。建立後可於大表行內續填擔當、工期、前置。</div>' +
      '<div class="form-field"><label>任務名稱</label><input type="text" id="ecn-new-name" placeholder="例：追加防水測試"></div>' +
      '<div class="form-field"><label>歸屬階段</label><select id="ecn-new-stage">' + stageOpts + '</select></div>' +
      varRow,
    footer: '<button class="tb-action ghost" onclick="App.closeModal()">取消</button>' +
            '<button class="tb-action" onclick="App._ecnNewTaskOk(\'' + projId + '\')">建立任務</button>',
  });
  setTimeout(() => { const n = document.getElementById('ecn-new-name'); if (n) { n.focus(); } }, 50);
};
App._ecnNewTaskOk = function(projId) {
  const res = App._tplPreview; if (!res) return;
  const name = ((document.getElementById('ecn-new-name') || {}).value || '').trim();
  if (!name) { U.toast('⚠ 請填任務名稱', 'warning'); return; }
  const stage = (document.getElementById('ecn-new-stage') || {}).value || '';
  const variantSel = (document.getElementById('ecn-new-variant') || {}).value;
  const variantId = variantSel || ((res.tasks[0] || {}).variant) || ((res.variants[0] || {}).id) || null;
  const dailyHours = (DATA.settings && DATA.settings.dailyHours) || 6;
  const newTask = {
    id: U.id(), project: res.project.id, wbs: '', parentWbsId: '',
    name: name, desc: stage, category: 'deep', taskType: '任務',
    predecessor: '', durationDays: 1, owner: '', dept: '', role: '', variant: variantId,
    start: '', end: '', plannedStart: '', plannedEnd: '', actualStart: '', actualEnd: '',
    progress: 0, status: 'pending', urgency: 'med', estHours: dailyHours,
    method: '', canSplit: false, completedAt: null, createdAt: new Date().toISOString(),
    scheduledStart: '', scheduledEnd: '', synced: false, stage: stage, subgroup: '',
    mustDeliver: false, deliverableType: '', requiredTask: true, mustIssue: false,
    deliverable: '', riskIssue: '', delivered: '', deliverableLink: '', note: '', taskAttr: 'baseline',
  };
  // 掛到該案別同階段最後一筆之後；找不到同階段任務則接末尾
  let insertAt = -1;
  for (let i = 0; i < res.tasks.length; i++) { if (res.tasks[i].variant === variantId && res.tasks[i].stage === stage) insertAt = i; }
  if (insertAt >= 0) res.tasks.splice(insertAt + 1, 0, newTask); else res.tasks.push(newTask);
  // 獨立無前置任務不需全域重排（不影響既有鏈、亦避免對無 schedule 的子案 variant 觸發錯誤）；以待排進入，使用者行內填日期即由 _ecnSetStart 處理
  App.closeModal();
  App._s2EcnPersist();
  U.toast('已新增任務：' + name + '（待排，請於大表填日期）', 'success');
};

// 主入口：依 ecnType 由 renderProject 分流進來
App.renderEcnDashboard = function(proj) {
  App._ecnEnsureState(proj);
  const tasks = DATA.tasks.filter(t => t.project === proj.id && !t._deleted);
  // hijack：_tplPreview 指向 ECN live res（tasks 為 DATA 活引用，欄位編輯即改 DATA）；_s2* handler 讀此不改
  App._tplPreview = { project: proj, tasks: tasks, variants: proj.variants || [], depts: proj.depts || [], warnings: [] };
  App._s2EcnMode = proj.id;
  // §19 問題2/3：既有 interval 案（有 endDate）首次進來 → 清 endDate 轉 forward、重排、存檔，矯正「改工期→開始移動」的日期
  if (App._ecnForwardVariants(proj.variants, tasks)) { App._reschedulePreview(tasks, proj.variants || [], []); Store.projects.save(); Store.tasks.save(); }   // variants 轉 forward（projects）＋重排回寫 tasks
  const tab = App._ecnTab || 'overview';   // §ECN 拆頁：總覽＝預設著陸頁
  const sizeLbl = { S: 'S 級 · 輕量換料', M: 'M 級 · 結構認定', L: 'L 級 · 重大改模' }[proj.size] || (proj.size + ' 級');
  const stLbl = { active: '進行中', closed: '已結案', reopened: '已重啟' }[proj.status] || '進行中';
  const roiLbl = proj.roiType === 'forced' ? '被迫型 · 合規/停線' : '效益型 · Cost Down';
  const on = (t) => tab === t ? ' on' : '';
  const locked = App._ecnLocked(proj);
  const headAction = locked
    ? '<button class="ecn-hd-act reopen" onclick="App.reopenEcn(\'' + proj.id + '\')">↻ 翻案重啟</button>'
    : '<button class="ecn-hd-act close" onclick="App.closeEcn(\'' + proj.id + '\')">✔ 結案</button>';
  const lastEp = (proj.epochs && proj.epochs.length) ? proj.epochs[proj.epochs.length - 1] : null;
  const closedBanner = (locked && lastEp)
    ? '<div class="ecn-closed-banner">🔒 已結案（唯讀）· 單號 <b>' + U.esc(proj.ecnNo || lastEp.ecnNo || '') + '</b> · 生效日 ' + U.esc(proj.effectiveDate || lastEp.effectiveDate || '') + ' · 凍結工時 <b>' + (lastEp.snapshotHours || 0) + 'h</b> · v' + lastEp.v + (lastEp.scrapCost ? ' · ⚠ 切換報廢 <b>' + lastEp.scrapCost.toLocaleString() + ' ' + U.esc(proj.bomBaseCurrency || 'NTD') + '</b>' : '') + '。如需再變更，點右上「翻案重啟」開新版。</div>'
    : '';
  const panel = tab === 'overview' ? App._ecnOverviewHtml(proj, tasks)
    : tab === 'b' ? App._ecnTabBHtml(proj)
    : tab === 'c' ? App._ecnTabCHtml(proj)
    : App._ecnTabAHtml(proj);
  document.getElementById('page-project').innerHTML =
    '<div class="ecn-dash">' +
      '<div class="ecn-hd">' +
        '<span class="ecn-hd-name">' + U.esc(proj.name) + '</span>' +
        '<span class="ecn-tag ecn-tag-size">' + sizeLbl + '</span>' +
        '<span class="ecn-tag ecn-tag-st' + (locked ? ' closed' : '') + '">' + stLbl + '</span>' +
        '<span class="ecn-tag ecn-tag-roi">' + roiLbl + '</span>' +
        '<span class="ecn-hd-ver">目前版本 · v' + (proj.version || 1) + (proj.reopenCount ? '（翻案 ' + proj.reopenCount + ' 次）' : '') + '</span>' +
        '<button class="ecn-hd-act edit" data-edit onclick="App.editProject(\'' + proj.id + '\')">編輯專案</button>' +   // §比照 NPI：ECN 也給編輯專案入口（開共用 openProjectDialog·內含「刪除專案」danger＋confirmModal）
        headAction +
      '</div>' + closedBanner +
      '<div class="ecn-layout ecn-focus">' +   // §ECN 拆頁：總覽＝2-column 著陸頁，HUD 內容併入總覽 tab；各 tab 一律全寬（無常駐側欄）
        '<div class="ecn-main">' +
          '<div class="ecn-tabs">' +
            '<span class="ecn-tab' + on('overview') + '" onclick="App._ecnSetTab(\'overview\')">總覽</span>' +
            '<span class="ecn-tab' + on('a') + '" onclick="App._ecnSetTab(\'a\')">任務與排程</span>' +
            '<span class="ecn-tab' + on('b') + '" onclick="App._ecnSetTab(\'b\')">BOM 成本差異分析</span>' +
            '<span class="ecn-tab' + on('c') + '" onclick="App._ecnSetTab(\'c\')">版本歷史</span>' +
          '</div>' +
          '<div class="ecn-panel">' + panel + '</div>' +
        '</div>' +
      '</div>' +
    '</div>';
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ─── BOM·ROI 泛化到 NPI（§19.6 後續·Wave1）：NPI 專案頁「BOM·ROI」view 複用 _ecnTabBHtml ───
App.renderProjectBom = function(targetId, pid) {
  const proj = App.getProj(pid || App.currentProjectId); if (!proj) return;
  const el = document.getElementById(targetId || 'proj-view-body'); if (!el) return;
  App._bomEnsure(proj);
  el.innerHTML = '<div class="bom-npi">' + App._ecnTabBHtml(proj) + '</div>';
};
// BOM handler 重繪分派：ECN→戰情室、NPI→專案 BOM view（讓 _bom* handler 兩邊共用，取代寫死 renderEcnDashboard）
App._bomRerender = function(p) {
  if (!p) return;
  if (p.ecnType) App['renderEcnDashboard'](p);   // bracket 記法：避免被 BOM handler 的 renderEcnDashboard→_bomRerender 批次替換誤傷
  else App.renderProjectBom('proj-view-body', p.id);
  // 比對/切機種/匯入後刷新 header 匯出選單啟用狀態——否則停在「開專案時還沒 bomModels」的停用態、按了沒反應（規則15：狀態一致）
  const _es = document.getElementById('projExportSlot'); if (_es) _es.innerHTML = App._projExportBtnHtml(p);
  App._bomCountUp();   // §19.6.2 收尾：改格→async 重算後·KPI/吸頂條 counter 滾動跳起（給即時成就感反饋）
};

// §19.6.2 收尾：成本 KPI（.bxb-bigcard .bv）＋吸頂條（.bom-stick .v）數字 counter 滾動動畫。
// 只改「第一個數字文字節點」的值→保留 <small>/正負號/單位等前後綴；換專案或無前值＝不動畫（首繪只快取）；「—」等無數字略過。
App._bomCV = { pid: null, vals: {} };
App._bomCountUp = function() {
  if (typeof requestAnimationFrame !== 'function') return;
  const pid = App.currentProjectId;
  const fresh = App._bomCV.pid !== pid;
  if (fresh) App._bomCV = { pid: pid, vals: {} };
  const els = document.querySelectorAll('.bxb-bigcard .bv, .bom-stick .v');
  els.forEach((el, i) => {
    const node = Array.prototype.find.call(el.childNodes, n => n.nodeType === 3 && /-?\d/.test(n.nodeValue));
    if (!node) return;
    const raw = node.nodeValue;
    const m = raw.match(/-?[\d,]+(\.\d+)?/);
    if (!m) return;
    const target = parseFloat(m[0].replace(/,/g, ''));
    if (isNaN(target)) return;
    const key = 'k' + i, prev = App._bomCV.vals[key];
    App._bomCV.vals[key] = target;
    if (fresh || prev == null || prev === target) return;   // 首繪/換案/無變化：不動畫
    const hasComma = m[0].indexOf(',') >= 0, dec = m[1] ? m[1].length - 1 : 0;
    const before = raw.slice(0, m.index), after = raw.slice(m.index + m[0].length);
    const fmt = v => { const n = dec ? Number(v.toFixed(dec)) : Math.round(v); return hasComma ? n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec }) : (dec ? n.toFixed(dec) : String(n)); };
    const t0 = performance.now(), dur = 480, ease = t => 1 - Math.pow(1 - t, 3);
    (function step(now) {
      const t = Math.min(1, (now - t0) / dur);
      node.nodeValue = before + fmt(prev + (target - prev) * ease(t)) + after;
      if (t < 1) requestAnimationFrame(step); else node.nodeValue = raw;   // 收尾還原原始格式字串（保正負號/千分位一致）
    })(t0);
  });
};


// §ECN 拆頁·總覽著陸頁（Phase 2）：⑦階段甘特（複用開案 _s2GanttHtml）＋2-column〔②放大雙軌／⑤負荷分佈／工時 ｜ ④卡關警報／部門名冊〕。
// ①背景動機 bar／③成本摘要 待 Phase 3（動開案表單）；⑥動態時間軸 待 Phase 4。
App._ecnOverviewHtml = function(proj, tasks) {
  const todayIso = D.fmt(D.today(), 'iso'), today = D.today();
  // 工時
  const pending = tasks.filter(t => t.status !== 'done' && App._ecnIsCurrentEpoch(t, proj)).reduce((s, t) => s + App._ecnPts(t), 0);
  const total = tasks.reduce((s, t) => s + App._ecnPts(t), 0);
  // ② 雙軌變異（實際＝進度加權·預期＝今天對排程已過工作天加權·限當前 epoch）
  let wsum = 0, actW = 0, expW = 0;
  tasks.filter(t => App._ecnIsCurrentEpoch(t, proj)).forEach(t => {
    const w = App._ecnPts(t); if (w <= 0) return; wsum += w;
    actW += w * (taskDisplayProgress(t) || 0);
    const eff = getEffectiveSchedule(t); let exp = 0;
    if (eff.start && eff.end) {
      if (todayIso <= eff.start) exp = 0;
      else if (todayIso >= eff.end) exp = 100;
      else exp = Math.max(0, Math.min(100, (D.workdaysBetween(eff.start, todayIso) - 1) / Math.max(1, D.workdaysBetween(eff.start, eff.end) - 1) * 100));
    }
    expW += w * exp;
  });
  const actual = wsum ? Math.round(actW / wsum) : 0;
  const expected = wsum ? Math.round(expW / wsum) : 0;
  const behind = actual - expected;
  const scopeGrowth = proj.baselineHours ? Math.round((total - proj.baselineHours) / proj.baselineHours * 100) : 0;
  // ⑤ 負荷分佈 by 階段（工時點數佔比）
  const stageLoad = {};
  tasks.filter(t => App._ecnIsCurrentEpoch(t, proj) && !t.isPmCoord).forEach(t => {
    const st = (typeof t.stage === 'string' && t.stage.trim()) ? t.stage.trim() : '未分階段';
    stageLoad[st] = (stageLoad[st] || 0) + App._ecnPts(t);
  });
  const loadArr = Object.keys(stageLoad).map(k => ({ st: k, h: Math.round(stageLoad[k]) })).filter(x => x.h > 0).sort((a, b) => b.h - a.h);
  const loadTot = loadArr.reduce((s, x) => s + x.h, 0), loadMax = loadArr.length ? loadArr[0].h : 1;
  // ④ 卡關警報：異常項目（停留天數）＋到期（今日/近兩週切換）
  const alertRange = App._ecnAlertRange || 'soon';
  const rangeDays = alertRange === 'today' ? 0 : 14;
  const loopItems = tasks.filter(t => t.isLoopTask && App._ecnIsCurrentEpoch(t, proj)).map(t => {
    const anchor = t.actualStart || getEffectiveSchedule(t).start;
    return { t, dwell: anchor ? Math.max(0, D.daysBetween(anchor, todayIso)) : 0 };
  }).sort((a, b) => b.dwell - a.dwell).slice(0, 4);
  const dueItems = App._classifyDueRisk(tasks, t => !t.isPmCoord && !t.isLoopTask && t.status !== 'done' && App._ecnIsCurrentEpoch(t, proj), rangeDays, today);
  // ⑦ 甘特 per variant（複用開案 _s2GanttHtml·讀 hijack 的 _tplPreview）
  const variants = (proj.variants && proj.variants.length) ? proj.variants : [{ id: ((tasks[0] || {}).variant) || '', name: '' }];
  const variantId = variants[0].id;

  const helpBox = App.buildHintBox({ key: 'ecn-hud-help', icon: 'ti-bulb', title: '戰情指標面板說明', summary: '進度落差／異常變更／負荷分佈怎麼看', collapsed: true,
    bodyHtml: '<ol><li><b>進度落差</b>：豎線＝預期、實心＝實際，落差自動標紅；再拆「真的做慢」vs「案子變大稀釋」。</li><li><b>卡關警報</b>：異常變更（退回重做/中途追加）＋停留天數＋近兩週到期，點列開任務。</li><li><b>負荷分佈</b>：各階段工時佔比，抓資源瓶頸。</li></ol>' });

  const ganttRows = variants.map(v => { const g = App._s2GanttHtml(v.id); return g ? ((variants.length > 1 ? '<div class="ecn-ov-gvar">' + U.esc(v.name || '') + '</div>' : '') + '<div class="s2-gantt" data-variant="' + v.id + '">' + g + '</div>') : ''; }).join('');
  const ganttCard = '<div class="ecn-hudcard"><div class="ecn-hud-t">各階段時程甘特</div>' + (ganttRows || '<div class="ecn-empty-edu">尚無階段任務。</div>') + '</div>';

  const gapPct = actual < expected ? (expected - actual) : 0;
  const dualCard = '<div class="ecn-hudcard"><div class="ecn-hud-t">進度落差分析（預期 vs 實際）</div>' +
    '<div class="ecn-ov-dual"><div class="ecn-ovd-act" style="width:' + actual + '%"></div>' +
      (gapPct ? '<div class="ecn-ovd-gap" style="left:' + actual + '%;width:' + gapPct + '%"></div>' : '') +
      '<div class="ecn-ovd-mark" style="left:' + expected + '%"></div></div>' +
    '<div class="ecn-ovd-pcts"><div class="ecn-ovd-p"><span>預期</span><b>' + expected + '%</b></div>' +
      '<div class="ecn-ovd-p' + (behind < 0 ? ' bad' : '') + '"><span>實際</span><b>' + actual + '%</b></div>' +
      '<div class="ecn-ovd-p' + (behind < 0 ? ' bad' : '') + '"><span>落差</span><b>' + (behind >= 0 ? '+' : '') + behind + '%</b></div></div>' +
    '<div class="ecn-ovd-split"><div class="ecn-ovd-sp amber"><b>' + (behind >= 0 ? '+' : '') + behind + '%</b>執行落後（真的做慢）</div>' +
      '<div class="ecn-ovd-sp rose"><b>+' + scopeGrowth + '%</b>範圍蔓延（案子變大稀釋）</div></div></div>';

  // ③ 成本效益摘要（拉 BOM 整機總結·空窗引導·被迫型改合規總代價）
  const _base3 = proj.bomBaseCurrency || 'NTD';
  const tv = parseFloat(proj.targetSavePerUnit) || 0;   // 目標成本調降/台（① bar 與 ③ 共用·早定義避 TDZ）
  const fmtC = x => Math.round(x).toLocaleString() + ' ' + _base3;
  const wt = App._bomWholeTotals(proj);
  const cCell = (l, v, hi) => '<div class="ecn-ov-costcell' + (hi ? ' hi' : '') + '"><div class="l">' + l + '</div><div class="v">' + v + '</div></div>';
  let costCard;
  if (!wt.ok) {
    costCard = '<div class="ecn-hudcard"><div class="ecn-hud-t">成本效益摘要</div>' +
      '<div class="ecn-ov-costempty">' + (wt.noData ? '尚未建立成本基準。' : '成本結構待判定，請到 BOM 頁完成設定。') +
      '<button class="ecn-ov-costbtn" onclick="App._ecnSetTab(\'b\')">前往 BOM 頁面執行比對 →</button></div></div>';
  } else if (proj.roiType === 'forced') {
    costCard = '<div class="ecn-hudcard"><div class="ecn-hud-t">變更成本評估<span class="ecn-ov-sub">被迫型 · 合規總代價</span></div>' +
      '<div class="ecn-ov-costgrid">' + cCell('現行成本 / 台', fmtC(wt.oldTotal)) + cCell('變更後 / 台', fmtC(wt.newTotal)) +
      cCell('每台變更代價', (wt.delta >= 0 ? '+' : '') + fmtC(wt.delta), true) + '</div></div>';
  } else {
    const saved = -wt.delta;
    const goalPct = tv > 0 ? Math.max(0, Math.min(100, Math.round(saved / tv * 100))) : null;
    costCard = '<div class="ecn-hudcard"><div class="ecn-hud-t">成本效益摘要<span class="ecn-ov-sub">效益型 · Cost Down</span></div>' +
      '<div class="ecn-ov-costgrid">' + cCell('現行成本 / 台', fmtC(wt.oldTotal)) + cCell('目標成本 / 台', tv > 0 ? fmtC(wt.oldTotal - tv) : '—') +
      cCell('成本調降貢獻 / 台', fmtC(saved), true) + cCell('達成率', goalPct != null ? goalPct + '%' : '—') + '</div>' +
      (goalPct != null ? '<div class="ecn-ov-costprog"><div class="cpbar"><div class="cpfill" style="width:' + goalPct + '%"></div></div><div class="cptxt">目標成本調降 ' + tv.toLocaleString() + ' ' + _base3 + '/台，已達 <b>' + Math.round(saved).toLocaleString() + '（' + goalPct + '%）</b>。</div></div>' : '') +
    '</div>';
  }

  const loadRows = loadArr.slice(0, 6).map(x => { const pct = loadTot ? Math.round(x.h / loadTot * 100) : 0; return '<div class="ecn-ov-lrow"><span class="ecn-ov-lname">' + U.esc(x.st) + '</span><span class="ecn-ov-lbar-w"><span class="ecn-ov-lbar' + (pct >= 35 ? ' hot' : '') + '" style="width:' + Math.round(x.h / loadMax * 100) + '%"></span></span><span class="ecn-ov-lval">' + x.h + 'h · ' + pct + '%</span></div>'; }).join('');
  const loadCard = '<div class="ecn-hudcard"><div class="ecn-hud-t">工作負荷分佈<span class="ecn-ov-sub">按階段 · 工時佔比</span></div>' + (loadRows || '<div class="ecn-empty-edu">尚無工時。</div>') + '</div>';

  const hoursCard = '<div class="ecn-hudcard"><div class="ecn-hud-t dept-head"><span>工時</span><button class="pl-hist-btn" onclick="App.openLoadHistory(\'' + proj.id + '\')" title="只列已完工任務的階段×部門工時">📜 完工帳</button></div><div class="ecn-hud-nums">' +
    '<div class="ecn-hud-num"><b>' + Math.round(pending) + '<span>h</span></b><span>待消化工時</span></div>' +
    '<div class="ecn-hud-num"><b>' + Math.round(total) + '<span>h</span></b><span>歷史總投入</span></div></div></div>';

  const seg = '<span class="ecn-ov-seg"><span class="' + (alertRange === 'today' ? 'on' : '') + '" onclick="App._ecnSetAlertRange(\'today\')">今日</span><span class="' + (alertRange === 'soon' ? 'on' : '') + '" onclick="App._ecnSetAlertRange(\'soon\')">近兩週</span></span>';
  const loopRows = loopItems.map(({ t, dwell }) => '<div class="ecn-ov-arow" onclick="App.openTaskModal(\'' + t.id + '\')"><span class="ecn-ov-aic">↩</span><div class="ecn-ov-abody"><div class="ecn-ov-aname">' + U.esc(t.name) + '</div><div class="ecn-ov-asub">' + (t.causeTag ? '成因：' + U.esc(t.causeTag) + ' · ' : '') + U.esc(t.stage || '') + '</div></div><span class="ecn-ov-apill rose">停留 ' + dwell + ' 天</span></div>').join('');
  const dueRows = dueItems.map(({ t, kind, days }) => '<div class="ecn-ov-arow" onclick="App.openTaskModal(\'' + t.id + '\')"><span class="ecn-ov-aic">◆</span><div class="ecn-ov-abody"><div class="ecn-ov-aname">' + U.esc(t.name) + '</div><div class="ecn-ov-asub">' + U.esc(t.stage || '') + (t.owner ? ' · ' + U.esc(t.owner) : '') + '</div></div><span class="ecn-ov-apill ' + (kind === 'over' ? 'rose' : 'amber') + '">' + (kind === 'over' ? '逾期 ' + days + ' 天' : (days === 0 ? '今日到期' : days + ' 天內')) + '</span></div>').join('');
  const alertBody = (loopRows || dueRows)
    ? ((loopRows ? '<div class="ecn-ov-asec">🚩 異常變更（卡關）</div>' + loopRows : '') + (dueRows ? '<div class="ecn-ov-asec">⏰ ' + (alertRange === 'today' ? '今日' : '近兩週') + '到期</div>' + dueRows : ''))
    : '<div class="ecn-empty-edu">目前無異常變更或' + (alertRange === 'today' ? '今日' : '近兩週') + '到期任務。</div>';
  const alertCard = '<div class="ecn-hudcard"><div class="ecn-hud-t risk-head">里程碑與卡關警報' + seg + '</div>' +
    '<div class="ecn-ov-acounts"><span>📌 中途追加 <b>' + (proj.scopeGrowthCount || 0) + '</b></span><span>↩ 退回重做 <b>' + (proj.loopCount || 0) + '</b></span><span>↻ 翻案 <b>' + (proj.reopenCount || 0) + '</b></span></div>' +
    alertBody + '</div>';

  const deptCard = '<div class="ecn-hudcard ecn-hud-dept">' + App._s2DeptPanelHtml(variantId) + '</div>';

  // ⑥ 動態時間軸：系統事件（開案/追加/退回/結案/翻案·ecnEvents）＋完工里程碑，倒序取近 6；查看全部跳版本歷史
  const tlEvents = (proj.ecnEvents || []).map(e => ({ date: e.date, label: e.label || e.type, cause: e.cause, kind: e.type }));
  tasks.filter(t => t.taskType === 'milestone' && t.actualEnd && App._ecnIsCurrentEpoch(t, proj)).forEach(t => tlEvents.push({ date: t.actualEnd, label: '完成里程碑：' + t.name, kind: 'milestone' }));
  tlEvents.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const tlRows = tlEvents.slice(0, 6).map(e => '<div class="ecn-ov-tlitem' + (e.kind === 'milestone' ? ' done' : '') + '"><div class="ecn-ov-tldate">' + U.esc(e.date || '') + '</div><div class="ecn-ov-tltxt">' + U.esc(e.label || '') + (e.cause ? ' · ' + U.esc(e.cause) : '') + '</div></div>').join('');
  const timelineCard = '<div class="ecn-hudcard"><div class="ecn-hud-t risk-head">專案動態時間軸' + (tlEvents.length ? '<button class="ecn-ov-tlall" onclick="App._ecnSetTab(\'c\')">查看全部 →</button>' : '') + '</div>' +
    (tlRows ? '<div class="ecn-ov-tl">' + tlRows + '</div>' : '<div class="ecn-empty-edu">尚無事件（開案／追加／退回／結案／完工里程碑會自動記錄）。</div>') + '</div>';

  // ① 背景動機 bar：受影響機種＋核心目標（目標成本調降/台·被迫型改合規）＋變更背景
  const variantNames = (proj.variants || []).map(v => v.name).filter(Boolean).join('、') || '（單一 · 未分機種）';
  const goalTxt = (proj.roiType === 'forced') ? '被迫型 · 合規/停線（不計回本）'
    : (tv > 0 ? '目標成本調降 ' + tv.toLocaleString() + ' ' + _base3 + ' / 台' : '尚未設定目標成本調降（開案／BOM 頁可設）');
  const bgBar = '<div class="ecn-ov-ctx">' +
    '<div class="ecn-ov-ctxcell"><span>受影響機種</span><b>' + U.esc(variantNames) + '</b></div>' +
    '<div class="ecn-ov-ctxcell goal"><span>核心目標</span><b>' + U.esc(goalTxt) + '</b></div>' +
    '<div class="ecn-ov-ctxcell"><span>變更背景</span><b>' + (proj.changeReason ? U.esc(proj.changeReason) : '—') + '</b></div>' +
  '</div>';

  // A（§19.5 Phase 0 早期預估）：生效日與舊料呆滯監控卡（可編輯·複用 _ecnStockGate·rate=0 防呆·存 proj.stockEstimate）
  const se = proj.stockEstimate || {};
  const estR = App._ecnEstResultHtml(App._ecnStockGate(se.oldQtyLeft, se.consumeRate, se.consumeUnit, se.oldPrice, se.effectiveDate), _base3);
  const _estIn = (id, val, ty) => '<input id="' + id + '" type="' + (ty || 'number') + '"' + (ty ? '' : ' min="0"') + ' value="' + val + '" oninput="App._ecnEstCalc(\'' + proj.id + '\')" onchange="App._ecnEstSave(\'' + proj.id + '\')">';
  const estCard = '<div class="ecn-hudcard"><div class="ecn-hud-t">生效日與舊料呆滯<span class="ecn-ov-sub">早期預估</span></div>' +
    '<div class="ecn-est-sub">立案評估就先估：切換會不會撞到還沒用完的舊料（同結案卡控算法）</div>' +
    '<div class="ecn-est-grid">' +
      '<div class="ecn-est-f"><label>舊料剩餘量</label>' + _estIn('ecn-est-qty', (se.oldQtyLeft != null ? se.oldQtyLeft : '')) + '</div>' +
      '<div class="ecn-est-f"><label>消耗率</label><div class="ecn-stk-rate-wrap"><input id="ecn-est-rate" type="number" min="0" value="' + (se.consumeRate != null ? se.consumeRate : '') + '" oninput="App._ecnEstCalc(\'' + proj.id + '\')" onchange="App._ecnEstSave(\'' + proj.id + '\')"><select id="ecn-est-unit" onchange="App._ecnEstSave(\'' + proj.id + '\')"><option value="day"' + (se.consumeUnit !== 'week' ? ' selected' : '') + '>顆/日</option><option value="week"' + (se.consumeUnit === 'week' ? ' selected' : '') + '>顆/週</option></select></div></div>' +
      '<div class="ecn-est-f"><label>舊單價</label>' + _estIn('ecn-est-price', (se.oldPrice != null ? se.oldPrice : '')) + '</div>' +
      '<div class="ecn-est-f"><label>預計生效日</label>' + _estIn('ecn-est-eff', U.esc(se.effectiveDate || ''), 'date') + '</div>' +
    '</div>' +
    '<div id="ecn-est-result" class="ecn-stk-result ' + estR.cls + '">' + estR.html + '</div>' +
  '</div>';

  return '<div class="ecn-ov">' + helpBox + bgBar + ganttCard +
    '<div class="ecn-ov-cols">' +
      '<div class="ecn-ov-col">' + dualCard + costCard + estCard + loadCard + hoursCard + '</div>' +
      '<div class="ecn-ov-col">' + alertCard + timelineCard + deptCard + '</div>' +
    '</div></div>';
};
App._ecnSetAlertRange = function(r) { App._ecnAlertRange = r; const p = App.getProj(App.currentProjectId); if (p) App.renderEcnDashboard(p); };

// A（§19.5 Phase 0）：早期預估卡 — 結果 HTML（初次 render 與即時算共用·DRY）
App._ecnEstResultHtml = function(res, base) {
  if (!res) return { cls: 'na', html: '填「舊料剩餘量」與「消耗率」即早估耗盡日與潛在呆滯。' };
  base = base || 'NTD';
  const cls = res.red ? 'red' : 'green';
  const html = res.infinite
    ? '🔴 舊料無固定消耗率（耗盡日視為無限遠）→ 生效日切換將<b>全數報廢 ' + res.scrapQty + '</b> 顆＝<b>' + res.scrapCost.toLocaleString() + ' ' + base + '</b>。請確認是否為專案專用料。'
    : res.red
    ? '🔴 預估耗盡日 <b>' + res.runoutDate + '</b>，晚於預計生效日 → 預估提前切換報廢 <b>' + res.scrapQty + '</b> 顆＝<b>' + res.scrapCost.toLocaleString() + ' ' + base + '</b>。建議延生效日或改漸進切換。'
    : '🟢 預估耗盡日 <b>' + res.runoutDate + '</b>，不晚於預計生效日 → 可如期切換、無呆滯。';
  return { cls: cls, html: html };
};
App._ecnEstCalc = function(projId) {
  const el = document.getElementById('ecn-est-result'); if (!el) return;
  const gv = id => (document.getElementById(id) || {}).value;
  const res = App._ecnStockGate(gv('ecn-est-qty'), gv('ecn-est-rate'), gv('ecn-est-unit'), gv('ecn-est-price'), gv('ecn-est-eff'));
  const p = App.getProj(projId); const r = App._ecnEstResultHtml(res, (p && p.bomBaseCurrency) || 'NTD');
  el.className = 'ecn-stk-result ' + r.cls; el.innerHTML = r.html;
};
App._ecnEstSave = function(projId) {
  const p = App.getProj(projId); if (!p) return;
  if (App._roGuard && App._roGuard()) return;   // viewonly 擋寫
  const gv = id => (document.getElementById(id) || {}).value;
  const qty = parseFloat(gv('ecn-est-qty')) || 0;
  if (qty <= 0) { delete p.stockEstimate; }   // 清空＝移除預估
  else {
    p.stockEstimate = { oldQtyLeft: qty, consumeRate: parseFloat(gv('ecn-est-rate')) || 0,
      consumeUnit: gv('ecn-est-unit') || 'day', oldPrice: parseFloat(gv('ecn-est-price')) || 0, effectiveDate: gv('ecn-est-eff') || '' };
  }
  Store.projects.save();
  App._ecnEstCalc(projId);
};

// Tab A：操作指南 HintBox（收合）＋ 大表（共用 .s2-tbl）
// 子案分頁（§19）：多子案時大表只顯示當前案別，避免不同案別任務混排。單子案不顯示分頁。
App._ecnActiveVariant = function(proj) {
  const vs = (proj.variants && proj.variants.length) ? proj.variants : [];
  if (!vs.length) return null;
  App._ecnVariantTab = App._ecnVariantTab || {};
  const cur = App._ecnVariantTab[proj.id];
  return (cur && vs.some(v => v.id === cur)) ? cur : vs[0].id;   // 預設主案（第一個案別）
};
App._ecnVariantTabsHtml = function(proj) {
  const vs = (proj.variants && proj.variants.length) ? proj.variants : [];
  if (vs.length < 2) return '';   // 單子案不顯示分頁
  const active = App._ecnActiveVariant(proj);
  return '<div class="ecn-vtabs">' + vs.map((v, i) =>
    '<button class="ecn-vtab' + (v.id === active ? ' on' : '') + '" onclick="App._ecnSetVariantTab(\'' + proj.id + '\', \'' + v.id + '\')">' +
      (i === 0 ? '<i class="ti ti-star" aria-hidden="true"></i> 主案 · ' : '') + U.esc(v.name || ('案別' + (i + 1))) +
    '</button>').join('') + '</div>';
};
App._ecnSetVariantTab = function(projId, vid) {
  App._ecnVariantTab = App._ecnVariantTab || {};
  App._ecnVariantTab[projId] = vid;
  const p = App.getProj(projId); if (p) App.renderEcnDashboard(p);
};
App._ecnTabAHtml = function(proj) {
  const guide = App.buildHintBox({
    key: 'ecn-tbl-guide', icon: 'ti-bulb', title: '任務大表操作指南', summary: '負荷警示／行內速改／智慧排程連動', collapsed: true,
    bodyHtml: '<ol>' +
      '<li><b>負荷警示燈與投入級別</b>：投入%改採「行為錨點」下拉評估，無須硬湊 100%。系統會自動跨案疊加，同人單日合計 >100% 會在「全專案總覽 → 同人爆表告警」亮紅旗。' +
        '<ul class="ecn-hint-lv">' +
          '<li><b>100% 獨佔</b>：這天只有這件。</li>' +
          '<li><b>75% 大半天</b>：這天主要在做它。</li>' +
          '<li><b>50% 半天</b>：佔掉半個工作天。</li>' +
          '<li><b>25% 零星盯</b>：發出去等回來，一天巡幾趟。</li>' +
          '<li><b>10% 點一下</b>：幾分鐘、一兩個觸點。</li>' +
          '<li><b>0% 舉證專用（掛名未出力）</b>：列在他名下但實際由別人代打或擺爛。<b>請勿刪除任務</b>，保留此 0% 紀錄作為結案檢討的客觀鐵證。</li>' +
        '</ul></li>' +
      '<li><b>行內編輯與權限</b>：點擊儲存格直接修改任務、擔當、工期與投入級別。PM 具全局權限，各擔當僅限更新自身任務。</li>' +
      '<li><b>智慧排程連動</b>：前置任務採全白話設定。修改前置或工期後，系統會自動重算整體時程（手動鎖定之日期除外）。</li>' +
      '<li><b>異常與進度回報</b>：點列表右側「⚙ 編輯」回報實際開／完工日。中途追加請點列與列之間的「＋」；「打回重測」或「刪除」請進編輯彈窗操作，系統會強制記錄成因以保全客觀證據。</li>' +
      '</ol>',
  });
  const _bk = !!(App._bulkMode || {})[proj.id];   // 批量編輯（2a-5，ECN 同套：勾選→編輯已選彈窗；無批量刪除）
  return guide +
    '<div class="ecn-panel-toolrow"><span class="ecn-pt-title">任務大表</span>' +
      '<div class="ecn-pt-actions">' +
        (App._ecnLocked(proj) ? '' : '<button class="tb-action ecn-newtask-btn" onclick="App._ecnNewTask(\'' + proj.id + '\')">＋ 新增任務</button>') +
        '<button class="tb-action ecn-bulk-btn" onclick="App.toggleBulkEdit(\'' + proj.id + '\')">' + (_bk ? '完成批量編輯' : '☑ 批量編輯') + '</button>' +
      '</div></div>' +
    App._ecnVariantTabsHtml(proj) +
    (_bk ? App._bulkBarHtml(proj) : '') +
    '<div class="ecn-tbl-scroll">' + App._ecnTableHtml(proj) + '</div>';
};

// Tab A 大表：複用 .s2-tbl 結構＋_s2PredCells，欄位＝序/任務名/部門/擔當/前置三窄格/工期/投入%(六檔 select)/日期/狀態·成因/操作
App._ecnTableHtml = function(proj) {
  const res = App._tplPreview;
  const allVariants = (proj.variants && proj.variants.length) ? proj.variants : [{ id: ((res.tasks[0] || {}).variant) || null }];
  const multi = allVariants.length > 1;
  const activeVid = multi ? App._ecnActiveVariant(proj) : allVariants[0].id;   // 多子案：只顯示當前分頁案別
  const variants = multi ? allVariants.filter(v => v.id === activeVid) : allVariants;
  let rows = '', seq = 0;
  variants.forEach(v => {
    const g = App._s2GroupByStage(v.id);
    g.order.forEach(st => { (g.byStage[st] || []).forEach(t => { seq++; rows += App._ecnRowHtml(t, v.id, seq); }); });
  });
  const _bk = !!(App._bulkMode || {})[proj.id];
  if (!rows) rows = '<tr><td colspan="' + (_bk ? 13 : 12) + '" class="ecn-empty">尚無任務</td></tr>';
  return '<table class="data-table s2-tbl ecn-tbl' + (App._ecnLocked(proj) ? ' ecn-tbl-locked' : '') + '"><thead>' +
    '<tr>' +
      (_bk ? '<th class="col-chk" rowspan="2"><input type="checkbox" onchange="App._bulkSelectAll(\'' + proj.id + '\', this.checked)" data-tip="全選|勾選目前顯示的全部未完工任務"></th>' : '') +
      '<th class="col-num" rowspan="2">序</th>' +
      '<th class="col-flex" rowspan="2">任務名</th>' +
      '<th class="col-mid" rowspan="2">部門</th>' +
      '<th class="col-mid" rowspan="2">擔當</th>' +
      '<th class="col-pred-group" colspan="3">前置任務</th>' +
      '<th class="col-mid s2-dur-th" rowspan="2">工期</th>' +
      '<th class="col-mid" rowspan="2">投入%</th>' +
      '<th class="col-mid" rowspan="2">計畫日期（起訖）</th>' +
      '<th class="col-mid" rowspan="2">狀態 · 成因</th>' +
      '<th class="col-action" rowspan="2">操作</th>' +
    '</tr>' +
    '<tr><th class="col-pred-sub">序號</th><th class="col-pred-sub">銜接方式</th><th class="col-pred-sub">緩衝</th></tr>' +
    '</thead><tbody>' + rows + '</tbody></table>';
};

App._ecnRowHtml = function(t, variantId, seq) {
  const _projFr = App.getProj(App._s2EcnMode);
  const frCls = (_projFr && !App._ecnIsCurrentEpoch(t, _projFr)) ? ' ecn-row-frozen' : '';   // 舊 epoch 任務凍結唯讀（翻案後）
  // 批量編輯（2a-5）：模式中最前加勾選格；PM 常駐列（鎖死）與已完工（actualEnd）不給勾
  const _bk = !!(App._bulkMode || {})[App._s2EcnMode];
  const _bkSel = _bk && App._bulkSel && App._bulkSel[App._s2EcnMode];
  const _chk = _bk ? ((t.isPmCoord || t.actualEnd)
    ? '<td class="col-chk"></td>'
    : '<td class="col-chk" onclick="event.stopPropagation()"><input type="checkbox" class="bulk-chk" ' + (_bkSel && _bkSel.has(t.id) ? 'checked ' : '') + 'onchange="App._bulkToggle(\'' + App._s2EcnMode + '\',\'' + t.id + '\', this.checked)"></td>') : '';
  if (t.isPmCoord) {
    const _proj = App.getProj(App._s2EcnMode);
    const _et = tplEcn();
    const _floor = (_proj && _et && _et.sizeMeta && _et.sizeMeta[_proj.size]) ? _et.sizeMeta[_proj.size].pmEffort : 15;
    return '<tr class="ecn-pmrow" data-taskid="' + t.id + '">' +
      _chk +
      '<td class="col-num">—</td>' +
      '<td class="col-flex"><span class="ecn-pm-nm">' + U.esc(t.name) + '</span></td>' +
      '<td class="col-mid">PM</td><td class="col-mid">PM</td>' +
      '<td class="col-pred">—</td><td class="col-pred">—</td><td class="col-pred"></td>' +
      '<td class="col-mid">全程</td>' +
      '<td class="col-mid s2-pct-cell"><select class="s2-pct-sel ecn-pm-pct" title="PM 常駐可上調、不可低於該級預設 ' + _floor + '%" onchange="App._ecnSetEffort(\'' + t.id + '\', this.value)">' + App._ecnPmEffortOptions(t.effortRatio, _floor) + '</select></td>' +
      '<td class="col-mid s2-date">全程</td>' +
      '<td class="col-mid"><span class="ecn-lock">🔒 常駐 · 不可降級</span></td>' +
      '<td class="col-action"></td>' +
    '</tr>';
  }
  const isLoop = !!t.isLoopTask;
  const causeTag = (isLoop && t.causeTag) ? ' <span class="ecn-ct">' + U.esc(t.causeTag) + ' ▾</span>' : '';
  const _st = App._ecnStatusDerive(t);
  return '<tr class="' + (seq % 2 === 0 ? 's2-rz ' : '') + (isLoop ? 'ecn-loop ' : '') + frCls + '" data-taskid="' + t.id + '">' +
    _chk +
    '<td class="col-num">' + (isLoop ? '↳' : seq) + '</td>' +
    '<td class="col-flex s2-namecell" title="' + U.esc(t.name) + '"><div class="s2-nameflex"><span class="ecn-name-txt" title="' + U.esc(t.name) + '（點擊編輯）" onclick="App._ecnEditName(this, \'' + t.id + '\')">' + U.esc(t.name) + '</span>' + (isLoop ? '<span class="ecn-loop-tag">重做 +1</span>' : '') + '</div></td>' +
    '<td class="col-mid s2-deptcell"><select class="ecn-dept-sel" title="可換部門（設變思維：任務由哪部門做不固定）" onchange="App._ecnSetDept(\'' + t.id + '\', this.value)">' + App._ecnDeptOptions(t.role) + '</select></td>' +
    '<td class="col-mid s2-ownercell"><select class="s2-owner-sel' + (t.owner ? '' : ' s2-owner-unassigned') + '" onchange="App._ecnSetOwner(\'' + t.id + '\', this.value)">' + App._s2OwnerOptions(t) + '</select></td>' +
    App._s2PredCells(t, variantId) +
    '<td class="col-mid s2-dur"><input class="s2-dur-inp" type="number" min="0" value="' + (t.durationDays != null ? t.durationDays : '') + '" onchange="App._s2SetDuration(\'' + t.id + '\', this.value)"></td>' +
    '<td class="col-mid s2-pct-cell"><select class="s2-pct-sel" onchange="App._ecnSetEffort(\'' + t.id + '\', this.value)">' + App._ecnEffortOptions(t.effortRatio) + '</select></td>' +
    '<td class="col-mid s2-datecell"><div class="ecn-dates"><input type="date" class="ecn-date-in" value="' + (t.plannedStart || '') + '" title="開始日（手動改＝釘錨點；清空＝回歸前置驅動）" onchange="App._ecnSetStart(\'' + t.id + '\', this.value)"><input type="date" class="ecn-date-in" value="' + (t.plannedEnd || '') + '" title="結束日（改＝回算工期，開始為錨）" onchange="App._ecnSetEnd(\'' + t.id + '\', this.value)"></div></td>' +
    '<td class="col-mid s2-stcell"><span class="ecn-st ecn-st-' + _st.cls + '" title="狀態依時間自動判定；完工/擱置在「⚙ 編輯」設定">' + _st.label + '</span>' + causeTag + '</td>' +
    '<td class="col-action"><button class="ecn-op-btn ecn-op-edit" title="編輯／特殊操作（完工·擱置·打回重測·刪除）" onclick="App._ecnEditTask(\'' + t.id + '\')">⚙ 編輯</button></td>' +
  '</tr>' +
  '<tr class="dt-insert-row"><td colspan="' + (_bk ? 13 : 12) + '" class="dt-insert-cell"><div class="dt-insert"><button class="dt-insert-btn" title="在此列後插入（記為中途追加）" onclick="App._ecnInsertTask(\'' + t.id + '\', \'' + variantId + '\')">＋</button></div></td></tr>';
};

// ─── Tab B：BOM·ROI 差額工具（§19.6，2026-07-01 Mockup 定版）───
// 波1＝資料模型＋差異四區 render＋手動輸入＋合計/ROI 計算；Excel 匯入/差異比對＝波2；匯出/多交付軌＝波3。
// 存資料不存檔：結構化 bomRows 掛專案（§19.2 BOM 層）、隨雲端同步；手動輸入直接填「基準幣」（匯率只在 Excel 匯入時換算）。
App._BOM_ZONES = [
  { kind: 'add', name: '新增', sub: '' },
  { kind: 'del', name: '刪除', sub: '呆滯大來源' },
  { kind: 'rev', name: '進版 · 改量/換料', sub: '' },
  { kind: 'priceOnly', name: '同料號價差 · 採購降價', sub: '非設變本體' },
];
App._BOM_CURR = ['NTD', 'USD', 'EUR', 'JPY', 'RMB'];
App._bomEnsure = function(proj) {
  if (proj.bomQuoteCurrency == null) proj.bomQuoteCurrency = 'NTD';
  if (proj.bomBaseCurrency == null) proj.bomBaseCurrency = 'NTD';
  if (proj.bomRate == null) proj.bomRate = 1;
  if (proj.annualVolume == null) proj.annualVolume = 0;
  if (proj.evalYears == null) proj.evalYears = 3;
  if (proj.targetSavePerUnit == null) proj.targetSavePerUnit = 0;   // §19.6.1 目標成本調降/台（餵 hero 達成進度條）
  if (proj.targetUnitCost == null) proj.targetUnitCost = 0;         // §19.6.2 NPI 目標成本/台（絕對值·工作值·由立案 base 帶入或機種鏡射）
  if (proj.unitSellPrice == null) proj.unitSellPrice = 0;           // §19.6.2 NPI 單台售價（選填·開毛利）
  if (proj.targetUnitCostBase == null) proj.targetUnitCostBase = proj.targetUnitCost || 0;   // §19.6.2 A migration：既有案無立案基準→退當前 targetUnitCost（機種繼承源）
  if (proj.unitSellPriceBase == null) proj.unitSellPriceBase = proj.unitSellPrice || 0;
  proj.oneTimeCost = proj.oneTimeCost || { mold: 0, cert: 0, deadStock: 0 };
  proj.bomRows = proj.bomRows || [];
};
// 單行價差＝新價×新量−舊價×舊量（§19.6 整台口徑；add 舊=0、del 新=0、priceOnly 同量）
App._bomDiff = r => ((parseFloat(r.newPrice) || 0) * (parseFloat(r.newQty) || 0)) - ((parseFloat(r.oldPrice) || 0) * (parseFloat(r.oldQty) || 0));
// §19.6 Wave2②：材料屬性判定（A/組/加工/自製/ASSEM/MAKE＝自製組合品；否則外購 M 料）·_bomWholeMachine matCat 與部位分組共用單一真實來源（規則13/15）
App._matIsAssembly = function(v) { const s = String(v == null ? '' : v).trim().toUpperCase(); return /^A/.test(s) || s.indexOf('組') >= 0 || s.indexOf('加工') >= 0 || s.indexOf('自製') >= 0 || s.indexOf('ASSEM') >= 0 || s.indexOf('MAKE') >= 0; };
// §19.6 Wave2②：某料號在本案 BOM 完整表的內外別（外購 M／自製 A）·掃 bomSheets.new→old 的 matCat 欄；無完整表/無材料欄→''（未標示）
App._bomPartMatClass = function(proj, partNo) {
  const pn = String(partNo == null ? '' : partNo).trim(); if (!pn) return '';
  const scan = sheet => {
    if (!sheet || !sheet.grid || sheet.matCatIdx == null || sheet.partNoIdx == null) return '';
    for (let i = 1; i < sheet.grid.length; i++) { const row = sheet.grid[i]; if (row && String(row[sheet.partNoIdx] == null ? '' : row[sheet.partNoIdx]).trim() === pn) return App._matIsAssembly(row[sheet.matCatIdx]) ? '自製' : '外購'; }
    return '';
  };
  const sh = proj.bomSheets || {};
  return scan(sh.new) || scan(sh.old) || '';
};
// §19.6 Wave2②：BOM 差異依「部位（料號主檔 category）」與「內外（M/A）」分組·回 {rows[依部位·delta由大到小],total,io{外購/自製/未標示},anyUnreg}
App._bomZoneBreakdown = function(proj) {
  const parts = (typeof DATA !== 'undefined' && DATA.parts) || [];
  const catOf = pn => { const p = parts.find(x => x.partNo === pn); return (p && p.category) || '未分類'; };
  const cats = {}, io = { '外購': 0, '自製': 0, '未標示': 0 }; let anyUnreg = false;
  (proj.bomRows || []).forEach(r => {
    if (r.includeInTarget === false) return;   // 同 zone 口徑：只算納入的
    const subj = String(r.replacePartNoB || r.partNoA || '').trim(); if (!subj) return;
    const d = App._bomDiff(r), cat = catOf(subj); if (cat === '未分類') anyUnreg = true;
    const cls = App._bomPartMatClass(proj, subj) || '未標示';
    const g = cats[cat] || (cats[cat] = { cat: cat, delta: 0, count: 0, cls: {} });
    g.delta += d; g.count++; g.cls[cls] = (g.cls[cls] || 0) + 1; io[cls] += d;
  });
  const rows = Object.keys(cats).map(k => {
    const g = cats[k], keys = Object.keys(g.cls);
    const dom = keys.slice().sort((a, b) => g.cls[b] - g.cls[a])[0] || '未標示';
    const mixed = keys.filter(x => x !== '未標示').length > 1;
    return { cat: g.cat, delta: g.delta, count: g.count, cls: mixed ? '混合' : dom };
  }).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return { rows: rows, total: rows.reduce((s, r) => s + r.delta, 0), io: io, anyUnreg: anyUnreg };
};
App._bomBreakdownHtml = function(proj) {
  const bd = App._bomZoneBreakdown(proj);
  if (!bd.rows.length) return '';
  const base = proj.bomBaseCurrency || '';
  const maxAbs = bd.rows.reduce((m, r) => Math.max(m, Math.abs(r.delta)), 0) || 1;
  const ioChip = c => c === '自製' ? '<span class="bbd-io in">自製</span>' : c === '外購' ? '<span class="bbd-io out">外購</span>' : c === '混合' ? '<span class="bbd-io mix">混合</span>' : '<span class="bbd-io na">未標示</span>';
  const catRow = r => {
    const pct = Math.round(Math.abs(r.delta) / maxAbs * 100), cls = r.delta > 0 ? 'up' : r.delta < 0 ? 'dn' : '';
    const fill = r.delta >= 0 ? 'var(--rose)' : 'var(--sage-500)';
    const hint = r.cat === '未分類' ? ' <span class="bbd-hint" onclick="App.showPage(\'materials\')">帶入主檔→</span>' : '';
    return '<tr><td class="bbd-cat">' + U.esc(r.cat) + hint + '</td><td>' + ioChip(r.cls) + '</td><td class="r bbd-cnt">' + r.count + '</td><td class="bbd-barc"><span class="bbd-bar"><span class="bbd-fill" style="width:' + pct + '%;background:' + fill + '"></span></span></td><td class="r bbd-d ' + cls + '">' + App._bomFmt(r.delta) + '</td></tr>';
  };
  const ioCell = (lbl, val) => '<div class="bbd-iocell"><span class="k">' + lbl + '</span><span class="v ' + (val > 0 ? 'up' : val < 0 ? 'dn' : '') + '">' + App._bomFmt(val) + '</span></div>';
  return '<div class="bbd">' +
    '<div class="bbd-h">成本差額 · 依部位彙總 <span class="bbd-sub">每列差異料號→料號主檔部位（類別）加權；內／外＝BOM 材料屬性（外購 M／自製 A）</span></div>' +
    '<div class="bbd-scroll"><table class="bbd-tbl"><thead><tr><th>部位</th><th>內／外</th><th class="r">品項</th><th>差額貢獻</th><th class="r">每台差額（' + U.esc(base) + '）</th></tr></thead><tbody>' +
    bd.rows.map(catRow).join('') +
    '</tbody><tfoot><tr><td>合計</td><td></td><td class="r">' + bd.rows.reduce((s, r) => s + r.count, 0) + '</td><td></td><td class="r bbd-d ' + (bd.total > 0 ? 'up' : bd.total < 0 ? 'dn' : '') + '">' + App._bomFmt(bd.total) + '</td></tr></tfoot></table></div>' +
    '<div class="bbd-io-split">' + ioCell('外購件（M）', bd.io['外購']) + ioCell('自製件（A）', bd.io['自製']) + (bd.io['未標示'] ? ioCell('未標示', bd.io['未標示']) : '') + '</div>' +
    (bd.anyUnreg ? '<div class="bbd-note">「未分類」＝該料號尚未帶入料號主檔（無部位資訊）→ 到「物料 → 從專案帶入」補齊後自動歸位。</div>' : '') +
  '</div>';
};
// §19.6.3 B 替代料配對備查（Phase 1）：偵測同列 A→B 換料→查主檔價差→一鍵登記回 A 主檔 alternates（idempotent＋history）
App._bomAltPairs = function(proj) {
  const parts = (typeof DATA !== 'undefined' && DATA.parts) || [];
  const findP = pn => parts.find(x => x.partNo === pn);
  const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const seen = {}, out = [];
  (proj.bomRows || []).forEach(r => {
    const a = String(r.partNoA == null ? '' : r.partNoA).trim();
    const b = String(r.replacePartNoB == null ? '' : r.replacePartNoB).trim();
    if (!a || !b || a === b) return;                      // Q1：只認同列 A→B 換料
    const key = a + '' + b; if (seen[key]) return; seen[key] = 1;
    const pa = findP(a), pb = findP(b);
    const aPrice = pa ? num(pa.unitPrice) : null, bPrice = pb ? num(pb.unitPrice) : null;
    const alts = pa && pa.alternates ? String(pa.alternates).split(/[,、;；\s]+/).map(s => s.trim()).filter(Boolean) : [];
    out.push({ a: a, b: b, aName: pa ? (pa.name || '') : '', bName: pb ? (pb.name || '') : '',
      aInMaster: !!pa, bInMaster: !!pb, aPrice: aPrice, bPrice: bPrice,
      diff: (aPrice != null && bPrice != null) ? (bPrice - aPrice) : null, alreadyAlt: alts.indexOf(b) >= 0 });
  });
  return out;
};
// 第二階：跨列 del+add 自動配對（del 列舊料 A × add 列新料 B）——方案 A(1:1自動)＋退化 C(多刪多增手動下拉)
App._bomAltCrossPairs = function(proj) {
  const parts = (typeof DATA !== 'undefined' && DATA.parts) || [];
  const findP = pn => parts.find(x => x.partNo === pn);
  const num = v => { const n = parseFloat(v); return isNaN(n) ? null : n; };
  const altsOf = pn => { const p = findP(pn); return p && p.alternates ? String(p.alternates).split(/[,、;；\s]+/).map(s => s.trim()).filter(Boolean) : []; };
  const rows = proj.bomRows || [];
  const dels = rows.filter(r => r.changeKind === 'del' && String(r.partNoA == null ? '' : r.partNoA).trim());
  const adds = rows.filter(r => r.changeKind === 'add' && String(r.partNoA == null ? '' : r.partNoA).trim());
  const addList = [], addSeen = {};                                  // 本案 add 集合（新增列料號·去重·只此·絕不撈主檔全域）
  adds.forEach(r => { const b = String(r.partNoA).trim(); if (addSeen[b]) return; addSeen[b] = 1; const pb = findP(b); addList.push({ partNo: b, name: pb ? (pb.name || '') : '', inMaster: !!pb }); });
  const mk = (aNo, bNo) => {
    aNo = String(aNo || '').trim(); bNo = String(bNo || '').trim();
    const pa = findP(aNo), pb = bNo ? findP(bNo) : null;
    const aPrice = pa ? num(pa.unitPrice) : null, bPrice = pb ? num(pb.unitPrice) : null;
    return { a: aNo, b: bNo, aName: pa ? (pa.name || '') : '', bName: pb ? (pb.name || '') : '',
      aInMaster: !!pa, bInMaster: !!pb, aPrice: aPrice, bPrice: bPrice,
      diff: (aPrice != null && bPrice != null) ? (bPrice - aPrice) : null,
      alreadyAlt: bNo ? altsOf(aNo).indexOf(bNo) >= 0 : false, options: null };
  };
  const auto = dels.length === 1 && adds.length === 1 && String(dels[0].partNoA).trim() !== String(adds[0].partNoA).trim();
  const out = { auto: auto, manual: !auto && dels.length > 0, delCount: dels.length, addCount: adds.length, addList: addList, rows: [], hasAny: dels.length > 0 || adds.length > 0 };
  if (auto) { out.rows.push(mk(dels[0].partNoA, adds[0].partNoA)); return out; }
  if (!dels.length) return out;
  const registered = {};                                             // 已登記的 B（本案 add 中·已是任一 del-A 的替代料）→ 從其他列下拉軟濾
  dels.forEach(r => { const alts = altsOf(String(r.partNoA).trim()); addList.forEach(x => { if (alts.indexOf(x.partNo) >= 0) registered[x.partNo] = 1; }); });
  dels.forEach(r => {
    const aNo = String(r.partNoA).trim(), alts = altsOf(aNo);
    const myB = addList.find(x => alts.indexOf(x.partNo) >= 0);       // A 已登記某 add-B → 顯 ✓
    if (myB) { out.rows.push(mk(aNo, myB.partNo)); return; }
    const row = mk(aNo, '');
    row.options = addList.filter(x => !registered[x.partNo]);         // 軟濾：濾掉已登記的 B（非硬擋·目錄層一 B 對多 A 合法）
    out.rows.push(row);
  });
  return out;
};
App._bomAltPairHtml = function(proj) {
  const pid = proj.id, pairs = App._bomAltPairs(proj), cross = App._bomAltCrossPairs(proj);
  const head = '<div class="bap-h">🔀 替代料配對備查 <span class="bap-badge">同列換料 ' + pairs.length + ' 筆 · 跨列候選 ' + cross.rows.length + ' 組</span></div>' +
    '<div class="bap-sub">把「舊料 A → 新料 B」回登為 A 的主檔替代料（下個設變案自動繼承·出現在缺口對帳單替代料建議）。價差取兩料的料號主檔單價。</div>';
  const rowHtml = p => {
    let diffCell;
    if (p.aInMaster && p.bInMaster && p.diff != null) {
      const cls = p.diff < 0 ? 'dn' : p.diff > 0 ? 'up' : 'eq';
      const tag = p.diff < 0 ? '省 ' + Math.abs(p.diff) : p.diff > 0 ? '貴 ' + p.diff : '同價';
      diffCell = '<div class="bap-diffline">$' + p.aPrice + ' → $' + p.bPrice + '</div><span class="bap-tag ' + cls + '">' + tag + '</span>';
    } else diffCell = '<span class="bap-tag na">' + (!p.aInMaster ? 'A 未帶入主檔' : 'B 未帶入主檔') + ' · 價差不明</span>';
    let statusCell;
    if (!p.aInMaster || !p.bInMaster) statusCell = '<button class="bap-btn ghost" onclick="App.showPage(\'materials\')">帶入主檔 →</button><div class="bap-subact">帶入後才可登記為替代料</div>';
    else if (p.alreadyAlt) statusCell = '<span class="bap-reg">✓ 已是 ' + U.esc(p.a) + ' 的替代料</span>';
    else statusCell = '<button class="bap-btn" onclick="App.registerAlt(\'' + pid + '\',\'' + Materials._jsq(p.a) + '\',\'' + Materials._jsq(p.b) + '\')">登記為替代料</button><div class="bap-subact">寫入 ' + U.esc(p.a) + ' 主檔 · 記履歷</div>';
    return '<tr><td class="bap-old"><span class="bap-pno">' + U.esc(p.a) + '</span>' + (p.aName ? '<br><span class="bap-nm">' + U.esc(p.aName) + '</span>' : '') + '</td>' +
      '<td><span class="bap-arrow">→</span> <span class="bap-pno">' + U.esc(p.b) + '</span>' + (p.bName ? '<br><span class="bap-nm">' + U.esc(p.bName) + '</span>' : '') + '</td>' +
      '<td class="r">' + diffCell + '</td><td>' + statusCell + '</td></tr>';
  };
  const sameBlock = !pairs.length
    ? '<div class="bap-empty">本案 BOM 尚無同列替代／換料（A→B）。當設變在同一列把舊料換成新料時，配對會自動出現在此。</div>'
    : '<div class="bap-scroll"><table class="bap-tbl"><thead><tr><th>舊料（A）</th><th>新料（B）</th><th class="r">單價價差（B−A）</th><th>主檔備查狀態</th></tr></thead><tbody>' + pairs.map(rowHtml).join('') + '</tbody></table></div>';
  return '<div class="bap">' + head + sameBlock + App._bomAltCrossHtml(pid, cross) + '</div>';
};
App._bomAltCrossHtml = function(pid, cross) {
  const diffCell = p => {
    if (p.aInMaster && p.bInMaster && p.diff != null) {
      const cls = p.diff < 0 ? 'dn' : p.diff > 0 ? 'up' : 'eq';
      const tag = p.diff < 0 ? '省 ' + Math.abs(p.diff) : p.diff > 0 ? '貴 ' + p.diff : '同價';
      return '<div class="bap-diffline">$' + p.aPrice + ' → $' + p.bPrice + '</div><span class="bap-tag ' + cls + '">' + tag + '</span>';
    }
    if (!p.b) return '<span class="bap-tag na">未選 · 價差待定</span>';
    return '<span class="bap-tag na">' + (!p.aInMaster ? 'A 未帶入主檔' : 'B 未帶入主檔') + ' · 價差不明</span>';
  };
  const mini = 'del 列 ' + cross.delCount + ' · add 列 ' + cross.addCount + (cross.auto ? ' · 已自動配 ' + cross.rows.length + ' 組' : (cross.manual ? ' · 多刪多增·請手動牽線' : ''));
  const sech = '<div class="bap-sech">↔ 跨列刪＋增 配對 <span class="mini">' + mini + '</span></div>';
  if (!cross.rows.length) return '<div class="bap-sec">' + sech + '<div class="bap-empty2">本案 BOM 無跨列的刪除＋新增。當設變在不同列刪掉舊料、另列新增新料時，配對候選會自動出現在此。</div></div>';
  const subNote = cross.manual ? '<div class="bap-sub" style="color:var(--amber-ink)">本案有多列刪除與多列新增，系統不自動猜哪刪對哪增（避免配錯）。請在「新料 B」欄自行選出對應的新增料號，再登記。已被別列登記的新料會自動從其他列下拉濾掉。</div>' : '';
  const rowHtml = (p, i) => {
    const selId = 'bapx-' + pid + '-' + i, btnId = selId + '-b';
    let bCell, statusCell;
    if (cross.auto || p.alreadyAlt) {
      bCell = '<span class="bap-arrow">→</span> <span class="bap-pno">' + U.esc(p.b) + '</span>' + (cross.auto && !p.alreadyAlt ? '<span class="bap-autoflag">自動配對</span>' : '') + (p.bName ? '<br><span class="bap-nm">' + U.esc(p.bName) + '</span>' : '');
    } else {
      const opts = '<option value="">（尚未選 · 不登記）</option>' + (p.options || []).map(x => '<option value="' + Materials._jsq(x.partNo) + '">' + U.esc(x.partNo) + (x.name ? ' · ' + U.esc(x.name) : '') + (x.inMaster ? '' : ' · 未帶入主檔') + '</option>').join('');
      bCell = '<select id="' + selId + '" class="bap-pick" data-btn="' + btnId + '" onchange="App._bomAltPickSel(this)">' + opts + '</select>';
    }
    if (p.alreadyAlt) statusCell = '<span class="bap-reg">✓ 已是 ' + U.esc(p.a) + ' 的替代料</span>';
    else if (!p.b) statusCell = '<button id="' + btnId + '" class="bap-btn" disabled onclick="App.registerAltPick(\'' + pid + '\',\'' + Materials._jsq(p.a) + '\',\'' + selId + '\')">登記為替代料</button><div class="bap-subact">先在左方選出對應新料</div>';
    else if (!p.aInMaster || !p.bInMaster) statusCell = '<button class="bap-btn ghost" onclick="App.showPage(\'materials\')">帶入主檔 →</button><div class="bap-subact">帶入後才可登記為替代料</div>';
    else statusCell = '<button class="bap-btn" onclick="App.registerAlt(\'' + pid + '\',\'' + Materials._jsq(p.a) + '\',\'' + Materials._jsq(p.b) + '\')">登記為替代料</button><div class="bap-subact">寫入 ' + U.esc(p.a) + ' 主檔 · 記履歷</div>';
    return '<tr><td class="bap-old"><span class="bap-pno">' + U.esc(p.a) + '</span>' + (p.aName ? '<br><span class="bap-nm">' + U.esc(p.aName) + '</span>' : '') + '</td><td>' + bCell + '</td><td class="r">' + diffCell(p) + '</td><td>' + statusCell + '</td></tr>';
  };
  const th = cross.manual ? '選新料 B（本案新增列）' : '新增列（新料 B）';
  return '<div class="bap-sec">' + sech + subNote +
    '<div class="bap-scroll"><table class="bap-tbl"><thead><tr><th>刪除列（舊料 A）</th><th>' + th + '</th><th class="r">單價價差（B−A）</th><th>登記</th></tr></thead><tbody>' +
    cross.rows.map(rowHtml).join('') + '</tbody></table></div></div>';
};
App._bomAltPickSel = function(sel) { const btn = document.getElementById(sel.getAttribute('data-btn')); if (btn) btn.disabled = !sel.value; };
App.registerAltPick = function(pid, aNo, selId) {
  const sel = document.getElementById(selId), bNo = sel ? sel.value : '';
  if (!bNo) { U.toast('請先選出對應的新料'); return; }
  App.registerAlt(pid, aNo, bNo);
};
App.registerAlt = function(pid, aNo, bNo) {
  const p0 = App.getProj(pid); const projName = p0 ? p0.name : '';
  const pa = (DATA.parts || []).find(x => x.partNo === aNo);
  if (!pa) { U.toast('找不到主檔料號 ' + aNo); return; }
  if (!(DATA.parts || []).find(x => x.partNo === bNo)) { U.toast('新料 ' + bNo + ' 未帶入主檔，請先帶入才可登記為替代料'); return; }   // 防幽靈料號·參考完整性
  App.confirmModal({
    title: '登記為替代料', icon: 'ti-arrows-exchange', iconBg: '--mat-l', iconColor: '--mat-ink',
    msg: '<div style="text-align:left;font-size:12.5px;line-height:1.6;color:var(--ink2)">將 <b>' + U.esc(bNo) + '</b> 登記為 <b>' + U.esc(aNo) + '</b> 的替代料：<br>· 寫入 ' + U.esc(aNo) + ' 主檔替代料欄（已存在則不重複）<br>· 記一筆履歷（來源案「' + U.esc(projName) + '」）<br>· 下個設變案換此料自動出現在替代料建議</div>',
    okText: '確認登記', cancelText: '取消',
    onConfirm: () => {
      const cur = pa.alternates ? String(pa.alternates).split(/[,、;；\s]+/).map(s => s.trim()).filter(Boolean) : [];
      if (cur.indexOf(bNo) < 0) {
        cur.push(bNo); pa.alternates = cur.join('、');
        (pa.history = pa.history || []).push({ field: '替代料', from: '', to: bNo, at: new Date().toISOString().slice(0, 10), note: '設變登記·' + projName, by: (DATA.settings && DATA.settings._role) || '' });
        Store.parts.save();
        U.toast('✓ 已登記 ' + bNo + ' 為 ' + aNo + ' 的替代料');
      } else U.toast(bNo + ' 已是 ' + aNo + ' 的替代料');
      const p = App.getProj(pid); if (p) App._bomRerender(p);
    },
  });
};
// 單行呆滯＝即刻切換才有：實際庫存×舊單價（刪除料＋換料舊料；漸進=0）
App._bomDead = r => (r.switchMode === 'immediately') ? ((parseFloat(r.stockQty) || 0) * (parseFloat(r.oldPrice) || 0)) : 0;
// 全案彙總：設變差額（add/del/rev 勾選行）＋採購降價（priceOnly 勾選行）＝每台目標成本差額；呆滯自動
App._bomCalc = function(proj) {
  const rows = proj.bomRows || [];
  const sum = ks => rows.filter(r => ks.includes(r.changeKind) && r.includeInTarget !== false).reduce((a, r) => a + App._bomDiff(r), 0);
  const chg = sum(['add', 'del', 'rev']);
  const buy = sum(['priceOnly']);
  const dead = rows.reduce((a, r) => a + App._bomDead(r), 0);
  const ot = proj.oneTimeCost || {};
  const autoMold = App._moldCostForProject(proj.id);             // §21.17 模具費用自動加總（Store.molds 分攤到本案）
  const manualMold = parseFloat(ot.mold) || 0;                   // 手動加項（試模/臨時修模等無單據者）
  const moldTotal = autoMold + manualMold;
  const oneTime = moldTotal + (parseFloat(ot.cert) || 0) + dead;
  const target = chg + buy;
  const annual = -target * (proj.annualVolume || 0);              // 差額為負（省）→ 年效益為正
  const payback = annual > 0 ? oneTime / (annual / 12) : null;    // 月
  const netN = annual * (proj.evalYears || 0) - oneTime;
  const forcedCost = target * (proj.annualVolume || 0) * (proj.evalYears || 0) + oneTime;   // 被迫型：N 年合規/變更總代價
  return { chg, buy, target, dead, oneTime, annual, payback, netN, forcedCost, autoMold, manualMold, moldTotal };
};
// §21.17 模具金額正規化到 TWD 樞紐：priceTwd 存的是「模具自己的換算基準幣」金額 → 乘 base→TWD 匯率化為 canonical TWD（base=TWD 時 ×1·現況全部零變化）
App._moldTwd = function(m) {
  const base = App._normCurA(m.baseCurrency || 'TWD');
  const amtBase = parseFloat(m.priceTwd) || ((parseFloat(m.price) || 0) * (parseFloat(m.rate) || 1));
  const r = base === 'TWD' ? 1 : (App._ratePref.get(base) || 1);   // 1 base = r TWD
  return amtBase * r;
};
App._moldCostForProject = function(projId) {   // §21.17 本案模具費 derived＝Σ(canonical TWD × 分攤%) → 換成該案 BOM 基準幣（跨基準幣一致·1a）
  const proj = (DATA.projects || []).find(p => p.id === projId);
  const projBase = App._normCurA((proj && proj.bomBaseCurrency) || 'TWD');
  const projRate = projBase === 'TWD' ? 1 : (App._ratePref.get(projBase) || 1);   // 1 projBase = projRate TWD → TWD 換 projBase 需 ÷projRate
  const twdSum = (DATA.molds || []).reduce((sum, m) => {
    const twd = App._moldTwd(m);
    (m.allocations || []).forEach(a => { if (a && a.projId === projId) sum += twd * ((parseFloat(a.sharePct) || 0) / 100); });
    return sum;
  }, 0);
  return twdSum / projRate;
};
App._moldDetailPopup = function(pid) {   // §21.17 本案模具費明細彈窗（哪些模具×分攤比例·金額以該案 BOM 基準幣顯示）
  const proj = (DATA.projects || []).find(p => p.id === pid); if (!proj) return;
  const projBase = App._normCurA(proj.bomBaseCurrency || 'TWD');
  const projRate = projBase === 'TWD' ? 1 : (App._ratePref.get(projBase) || 1);
  const rows = [];
  (DATA.molds || []).forEach(m => { (m.allocations || []).forEach(a => { if (a && a.projId === pid) { const pct = parseFloat(a.sharePct) || 0; rows.push({ name: m.moldName || '(未命名模具)', vendor: m.vendor || '', pct, amt: App._moldTwd(m) * pct / 100 / projRate }); } }); });
  const total = rows.reduce((s, r) => s + r.amt, 0);
  const cell = 'padding:6px 10px;border-bottom:1px solid var(--rule)';
  const body = rows.length
    ? '<table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr><th style="' + cell + ';text-align:left;color:var(--ink3)">模具</th><th style="' + cell + ';text-align:left;color:var(--ink3)">廠商</th><th style="' + cell + ';text-align:right;color:var(--ink3)">分攤</th><th style="' + cell + ';text-align:right;color:var(--ink3)">金額(' + U.esc(projBase) + ')</th></tr></thead><tbody>'
      + rows.map(r => '<tr><td style="' + cell + '">' + U.esc(r.name) + '</td><td style="' + cell + '">' + U.esc(r.vendor) + '</td><td style="' + cell + ';text-align:right">' + r.pct + '%</td><td style="' + cell + ';text-align:right">' + App._bomMoney(r.amt) + '</td></tr>').join('')
      + '</tbody><tfoot><tr><td colspan="3" style="' + cell + ';text-align:right"><b>本案模具費合計</b></td><td style="' + cell + ';text-align:right"><b>' + App._bomMoney(total) + '</b></td></tr></tfoot></table><div style="margin-top:10px;color:var(--ink3);font-size:12px">金額以本案 BOM 基準幣（' + U.esc(projBase) + '）顯示·跨基準幣自動換算。改分攤比例／新增模具請到「物料 → 模具費用」。</div>'
    : '<div style="padding:16px;color:var(--ink3)">本案尚未分攤任何模具費用。到「物料 → 模具費用」匯入或新增模具並分攤到本案。</div>';
  App.openModal({ title: '本案模具費明細 · ' + U.esc(proj.name), body });
};
App._bomFmt = n => { const v = Math.round(n * 10) / 10; return (v > 0 ? '+' : '') + v.toLocaleString(); };
App._bomMoney = n => Math.round(n).toLocaleString();
// §19.6.1 整機成本＝葉節點加總（不寫死欄位，Paul 2026-07-04 定）。sheet＝bomSheets.old|new＝{ grid, partNoIdx, priceIdx, qtyIdx, levelIdx, matCatIdx }；
// grid[0]＝表頭列、grid[1..]＝資料列。method：null=自動（階次欄優先→材料類別→判不出 needWizard）| 'level' | 'matCat' | 'sumAll' | 'topRow'。
// cols＝精靈覆蓋（存表頭字面，對 old/new 各自依表頭名解析 index）：{ level, matCat, amount }。回 { ok, total, leafCount, method } 或 { ok:false, needWizard, reason }。
App._bomWholeMachine = function(sheet, method, cols, outLeaf) {   // outLeaf（選填）：傳陣列進來則順手收集葉節點列 index（供 §檔2 完整 BOM 匯出金額只掛葉節點·單一真實來源·規則15）
  if (!sheet || !sheet.grid || sheet.grid.length < 2) return { ok: false, needWizard: true, reason: 'nodata' };
  const grid = sheet.grid, header = grid[0] || [];
  const norm = v => String(v == null ? '' : v).trim().toUpperCase();
  const num = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  const colByHead = h => { if (h == null) return null; const k = norm(h); for (let i = 0; i < header.length; i++) if (norm(header[i]) === k) return i; return null; };
  let lvlIdx = sheet.levelIdx, matIdx = sheet.matCatIdx, amtIdx = null;
  if (cols) { if (cols.level != null) lvlIdx = colByHead(cols.level); if (cols.matCat != null) matIdx = colByHead(cols.matCat); if (cols.amount != null) amtIdx = colByHead(cols.amount); }
  let m = method || null;
  if (!m) { if (lvlIdx != null) m = 'level'; else if (matIdx != null) m = 'matCat'; else return { ok: false, needWizard: true, reason: 'nostruct' }; }
  const pIdx = sheet.priceIdx, qIdx = sheet.qtyIdx;
  const noPrice = (m !== 'topRow' && pIdx == null);   // 無單價欄→總價無法算·但葉節點判定與單價無關·仍照跑收 outLeaf（物料帶入只要葉·rowVal 單價 0 兜底）
  const hasPart = r => grid[r] && grid[r][sheet.partNoIdx] != null && String(grid[r][sheet.partNoIdx]).trim() !== '';
  const rowVal = r => num(grid[r][pIdx]) * (qIdx != null ? (grid[r][qIdx] == null || grid[r][qIdx] === '' ? 1 : num(grid[r][qIdx])) : 1);
  let total = 0, leafCount = 0;
  if (m === 'level') {
    if (lvlIdx == null) return { ok: false, needWizard: true, reason: 'nolevel' };
    const lv = r => { if (!grid[r]) return null; const n = parseFloat(grid[r][lvlIdx]); return isNaN(n) ? null : n; };
    const nextLv = from => { for (let j = from; j < grid.length; j++) { const v = lv(j); if (v != null) return v; } return null; };   // 下一個有階次的列（跳過空白/無階分隔列·否則父列後夾空白會被誤判為葉）
    for (let i = 1; i < grid.length; i++) {
      if (!hasPart(i)) continue;
      const cur = lv(i), nxt = nextLv(i + 1);
      if (!(nxt != null && cur != null && nxt > cur)) { total += rowVal(i); leafCount++; if (outLeaf) outLeaf.push(i); }   // 葉節點＝下一個有階次資料列未更深（無子件）
    }
  } else if (m === 'matCat') {
    if (matIdx == null) return { ok: false, needWizard: true, reason: 'nomatcat' };
    const isAssembly = App._matIsAssembly;   // §19.6 Wave2②：收斂共用（規則13/15·與部位分組同一判定）
    for (let i = 1; i < grid.length; i++) { if (!hasPart(i)) continue; if (!isAssembly(grid[i][matIdx])) { total += rowVal(i); leafCount++; if (outLeaf) outLeaf.push(i); } }   // 只加 M 料，排除組合/加工品(A)
  } else if (m === 'sumAll') {
    for (let i = 1; i < grid.length; i++) { if (!hasPart(i)) continue; total += rowVal(i); leafCount++; if (outLeaf) outLeaf.push(i); }
  } else if (m === 'topRow') {
    for (let i = 1; i < grid.length; i++) {   // 用金額欄頂列＝第一筆有料號列（BOM 頂層已滾算總成本）；有指定金額欄取原值、否則單價×用量
      if (!hasPart(i)) continue;
      if (amtIdx != null) total = num(grid[i][amtIdx]);
      else if (pIdx != null) total = rowVal(i);
      else return { ok: false, needWizard: true, reason: 'noamount' };
      leafCount = 1; if (outLeaf) outLeaf.push(i); break;
    }
  } else return { ok: false, needWizard: true, reason: 'unknown' };
  return { ok: !noPrice, needWizard: noPrice, reason: noPrice ? 'noprice' : undefined, total, leafCount, method: m };
};
// 合舊/新兩版＋幣別換算（同 bomDiffRows：報價幣≠基準幣才乘匯率），回整機對照三數字
App._bomWholeTotals = function(proj) {
  const bs = proj.bomSheets;
  if (!bs || !bs.old || !bs.new) return { ok: false, noData: true };
  const method = proj.bomWholeMethod || null, cols = proj.bomWholeCols || null;
  const oldR = App._bomWholeMachine(bs.old, method, cols);
  const newR = App._bomWholeMachine(bs.new, method, cols);
  if (!oldR.ok || !newR.ok) return { ok: false, needWizard: true, reason: oldR.reason || newR.reason };
  const f = (proj.bomQuoteCurrency === proj.bomBaseCurrency) ? 1 : (parseFloat(proj.bomRate) || 1);
  const oldTotal = oldR.total * f, newTotal = newR.total * f;
  return { ok: true, oldTotal, newTotal, delta: newTotal - oldTotal, method: newR.method, oldLeaf: oldR.leafCount, newLeaf: newR.leafCount };
};
// ─── BOM·ROI 泛化到 NPI · Wave2：一案多機種（§19.6 一案多 BOM）───
// 舊/新兩檔各 N 分頁（分頁名=機種）→ 按分頁名配對 → 逐對 extract+diff+整機成本 → models[]。純引擎，可 Console/node 驗。
App._bomBuildModels = function(oldCands, newCands, factor, priceIdx, mapping) {
  const f = factor || 1;
  const exOpts = {};   // §13.7 精靈選定套全機種：priceIdx＝金額欄二選一／mapping＝欄位對應回填
  if (priceIdx != null && priceIdx >= 0) exOpts.priceIdx = priceIdx;
  if (mapping) exOpts.mapping = mapping;
  const norm = s => String(s == null ? '' : s).trim().toUpperCase();
  const oldBy = {}, newBy = {};
  (oldCands || []).forEach(c => { if (oldBy[norm(c.sheetName)] == null) oldBy[norm(c.sheetName)] = c; });
  (newCands || []).forEach(c => { if (newBy[norm(c.sheetName)] == null) newBy[norm(c.sheetName)] = c; });
  const order = [];   // 以新版分頁序為主，只在舊版的補後
  (newCands || []).forEach(c => { if (order.indexOf(c.sheetName) < 0) order.push(c.sheetName); });
  (oldCands || []).forEach(c => { if (order.indexOf(c.sheetName) < 0) order.push(c.sheetName); });
  const packEx = (cand, ex) => (cand && ex && ex.ok) ? { sheetName: cand.sheetName, partNoIdx: ex.partNoIdx,
    priceIdx: ex.priceIdxUsed, qtyIdx: ex.qtyIdx, levelIdx: ex.levelIdx, matCatIdx: ex.matCatIdx, grid: cand.aoa.slice(ex.headerIdx) } : null;
  return order.map(nm => {
    const oc = oldBy[norm(nm)], nc = newBy[norm(nm)];
    const oldEx = oc ? extractBomRows(oc.aoa, exOpts) : null;
    const newEx = nc ? extractBomRows(nc.aoa, exOpts) : null;
    const oldRows = (oldEx && oldEx.ok) ? oldEx.rows : [];
    const newRows = (newEx && newEx.ok) ? newEx.rows : [];
    const diff = bomDiffRows(oldRows, newRows, f);
    const sheets = { old: packEx(oc, oldEx), new: packEx(nc, newEx) };
    const ow = sheets.old ? App._bomWholeMachine(sheets.old, null, null) : null;   // per-model 整機成本（葉節點）
    const nw = sheets.new ? App._bomWholeMachine(sheets.new, null, null) : null;
    return { id: U.id(), name: nm, bomRows: diff.rows, bomOldCount: diff.oldCount, bomNewCount: diff.newCount,
      bomSheets: sheets, oldTotal: (ow && ow.ok) ? Math.round(ow.total * f) : null, newTotal: (nw && nw.ok) ? Math.round(nw.total * f) : null, matched: !!(oc && nc) };
  });
};
// 啟用某機種＝把該 model 資料指到 proj 單模型欄位（複用既有單機種 render/handler·同一引用故編輯即改回 model）
App._bomActivateModel = function(proj, idx) {
  const m = (proj.bomModels || [])[idx]; if (!m) return;
  proj.bomModelIdx = idx;
  proj.bomRows = m.bomRows; proj.bomSheets = m.bomSheets;
  proj.bomOldCount = m.bomOldCount; proj.bomNewCount = m.bomNewCount;
  // §19.6.2 fix：目標成本/售價/年產＝逐機種各自記錄（切機種載入該機種值；編輯由 _bomSet 寫回該機種）→ 各機種算各自損益
  proj.targetUnitCost = m.targetUnitCost || proj.targetUnitCostBase || 0;   // §19.6.2 A：機種未填→吃立案基準
  proj.unitSellPrice = m.unitSellPrice || proj.unitSellPriceBase || 0;
  proj.annualVolume = m.annualVolume || 0;
  proj.targetSavePerUnit = m.targetSavePerUnit != null ? m.targetSavePerUnit : (proj.targetSavePerUnit || 0);   // §19.6.2 ECN 目標調降/台 逐機種
};
// §19.6.2 A：既有單 BOM ECN → 自動包成「單一機種」model（bomRows/bomSheets 原封保留·顯示零變化）→ 走多機種矩陣管線。idempotent。
App._bomWrapSingleModel = function(proj) {
  if (proj.bomModels && proj.bomModels.length) return false;   // 已多機種→不動
  if (!(proj.bomRows && proj.bomRows.length) && !proj.bomSheets) return false;   // 無任何 BOM 資料→不包（維持空匯入卡）
  const sh = proj.bomSheets || {};
  const ow = sh.old ? App._bomWholeMachine(sh.old, proj.bomWholeMethod || null, proj.bomWholeCols || null) : null;
  const nw = sh.new ? App._bomWholeMachine(sh.new, proj.bomWholeMethod || null, proj.bomWholeCols || null) : null;
  proj.bomModels = [{
    id: U.id(), name: proj.name || '單一機種', bomRows: proj.bomRows || [], bomSheets: proj.bomSheets || null,
    bomOldCount: proj.bomOldCount || 0, bomNewCount: proj.bomNewCount || 0,
    oldTotal: (ow && ow.ok) ? Math.round(ow.total) : null, newTotal: (nw && nw.ok) ? Math.round(nw.total) : null, matched: true,
    targetSavePerUnit: proj.targetSavePerUnit || 0, annualVolume: proj.annualVolume || 0
  }];
  proj.bomModelIdx = 0;
  return true;
};
// 總彙整：各機種 舊/新整機總額＋整機價差＋降幅＋差異行加總
App._bomModelsSummary = function(proj) {
  return (proj.bomModels || []).map(m => {
    const diffSum = (m.bomRows || []).reduce((a, r) => a + App._bomDiff(r), 0);
    const delta = (m.oldTotal != null && m.newTotal != null) ? (m.newTotal - m.oldTotal) : null;
    const tuc = parseFloat(m.targetUnitCost) || parseFloat(proj.targetUnitCostBase) || 0;   // §19.6.2 各機種目標達成率（NPI·目標÷實際·機種未填→立案基準·皆無顯 —）
    const achv = (tuc > 0 && m.newTotal) ? Math.round(tuc / m.newTotal * 100) : null;
    const vol = parseFloat(m.annualVolume) || 0;
    const annualBenefit = (delta != null && vol > 0) ? -delta * vol : null;   // §19.6.2 ECN 各機種預估年效益（整機價差×年產·負差=省→正效益）
    return { name: m.name, oldTotal: m.oldTotal, newTotal: m.newTotal, delta: delta,
      dropPct: (m.oldTotal && delta != null) ? (-delta / m.oldTotal) : null, diffSum: Math.round(diffSum * 10) / 10, matched: m.matched,
      targetUnitCost: tuc, achv: achv, annualBenefit: annualBenefit };
  });
};
// §19.6.2 全系列加權綜合（依各機種年產量加權）：達成率/專案總毛利(年)/總毛利率/全系列年省總額；主管彙報數
App._bomAllSeriesStats = function(proj) {
  const ms = proj.bomModels || [];
  let volSum = 0, tgtW = 0, actW = 0, oldW = 0, sellW = 0, profitYr = 0, saveYr = 0, anyTarget = false, anySell = false;
  ms.forEach(m => {
    const vol = parseFloat(m.annualVolume) || 0;
    const tgt = parseFloat(m.targetUnitCost) || parseFloat(proj.targetUnitCostBase) || 0;   // §19.6.2 A：機種未填→立案基準
    const sell = parseFloat(m.unitSellPrice) || parseFloat(proj.unitSellPriceBase) || 0;
    const act = (m.newTotal != null) ? m.newTotal : null;
    const old = (m.oldTotal != null) ? m.oldTotal : null;
    if (vol > 0) {
      volSum += vol;
      if (act != null) actW += act * vol;
      if (old != null) oldW += old * vol;
      if (tgt > 0) { tgtW += tgt * vol; anyTarget = true; }
      if (sell > 0) { sellW += sell * vol; anySell = true; }
      if (act != null && sell > 0) profitYr += (sell - act) * vol;
      if (act != null && tgt > 0) saveYr += (tgt - act) * vol;
    }
  });
  return {
    volSum: volSum, anyTarget: anyTarget, anySell: anySell, modelCount: ms.length,
    achv: (tgtW > 0 && actW > 0) ? Math.round(tgtW / actW * 100) : null,
    marginPct: (sellW > 0 && actW > 0) ? ((sellW - actW) / sellW * 100) : null,
    profitYr: profitYr, saveYr: saveYr,
    tgtUnit: volSum ? tgtW / volSum : 0, actUnit: volSum ? actW / volSum : 0, oldUnit: volSum ? oldW / volSum : 0, sellUnit: volSum ? sellW / volSum : 0
  };
};
// ── 多機種匯入 handler：上傳舊/新兩檔（各 N 分頁）→ 全機種自動比對 ──
App._bomModelsPick = async function(projId, which, inputEl) {
  const file = inputEl.files && inputEl.files[0]; inputEl.value = '';
  if (!file) return;
  const parsed = await parseBomAoa(file);
  if (!parsed.ok) { U.toast('⚠ ' + parsed.errors.join('；'), 'warning'); return; }
  App._bomMStage = App._bomMStage || {};
  App._bomMStage[projId] = App._bomMStage[projId] || {};
  App._bomMStage[projId][which] = parsed.candidates;
  U.toast('已讀取' + (which === 'old' ? '舊版' : '新版') + ' ' + parsed.candidates.length + ' 個分頁', 'success');
  const p = App.getProj(projId);
  if (p) { p.bomModelMapping = null; p.bomModelPriceIdx = null; App._bomRerender(p); }   // 換檔＝清記住的欄位對應/金額欄，重新偵測（記住的別名字典仍會自動配）
};
// §13.7 比對範圍切換（全部機種／單一分頁）
App._bomSetScope = function(projId, val) {
  App._bomMScope = App._bomMScope || {};
  App._bomMScope[projId] = val;
  const p = App.getProj(projId); if (p) App._bomRerender(p);
};
App._bomModelsCompare = function(projId, priceIdxArg) {
  if (App._roGuard()) return;
  const p = App.getProj(projId); if (!p) return;
  App._bomEnsure(p);
  const st = (App._bomMStage || {})[projId] || {};
  if (!st.old || !st.new) { U.toast('⚠ 請先上傳「舊版」與「新版」兩份 Excel（單一機種＝單一分頁；多機種＝各機種一分頁）', 'warning'); return; }
  // §13.7 比對範圍：全部分頁各當一機種，或只比對單一分頁（單一機種）
  const scope = (App._bomMScope || {})[projId] || 'all';
  let oldC = st.old, newC = st.new;
  if (scope !== 'all') { oldC = (st.old || []).filter(c => c.sheetName === scope); newC = (st.new || []).filter(c => c.sheetName === scope); }
  // §13.7 判不定欄位一律帶精靈（ECN/NPI 同一管線通用）：先料號等必要欄「欄位對應」，再多金額欄「二選一」；選定套全機種＋記住
  if (priceIdxArg == null && p.bomModelPriceIdx != null) priceIdxArg = p.bomModelPriceIdx;
  const mapping = p.bomModelMapping || null;
  const firstNew = (newC[0] || {}).aoa || [];
  const probe = extractBomRows(firstNew, mapping ? { mapping: mapping } : {});
  if (probe && probe.needMapping) {   // 必要欄（料號等）對不上→欄位對應面板
    App.renderImportMapping({
      title: 'BOM 欄位對應', specs: BOM_COLUMNS, headerCells: probe.headerCells,
      resolved: probe.resolved, requiredKeys: BOM_REQUIRED_KEYS, domain: 'bom',
      onConfirm: m => { p.bomModelMapping = m; App._bomModelsCompare(projId, priceIdxArg); },
    });
    return;
  }
  if (priceIdxArg == null && probe && probe.needPriceChoice && probe.priceHeaders && probe.priceHeaders.length > 1) {   // 多金額欄→二選一
    App._bomModelsPriceWizard(projId, probe.priceHeaders);
    return;
  }
  if (probe && !probe.ok && !probe.needMapping) {   // 連表頭都認不出→別悄悄建空 model，跳提示
    U.toast('⚠ 無法解析 BOM：' + ((probe.errors && probe.errors.length) ? probe.errors.join('；') : '找不到表頭列') + '（請確認新版第一個分頁有「料號」等 BOM 表頭）', 'warning');
    return;
  }
  const f = (p.bomQuoteCurrency === p.bomBaseCurrency) ? 1 : (parseFloat(p.bomRate) || 1);
  const models = App._bomBuildModels(oldC, newC, f, priceIdxArg, mapping);
  p.bomModels = models; p.bomModelIdx = 0;
  p.bomUpdatedAt = new Date().toISOString();   // §21.14 物料帶入「最近更新」排序用（研發跑了 BOM 比對＝這個時間點）
  if (priceIdxArg != null) p.bomModelPriceIdx = priceIdxArg;
  App._bomActivateModel(p, 0);
  try { Store.projects.save(); }
  catch (e) { (p.bomModels || []).forEach(m => delete m.bomSheets); delete p.bomSheets; Store.projects.save(); U.toast('⚠ 多機種原始表過大存不進本機——差異行與整機總額已保留（完整匯出請趁本次比對）', 'warning'); }
  App._bomRerender(p);
  U.toast('比對完成：' + models.length + ' 個機種', 'success');
};
// §13.7 金額欄選擇精靈（多機種比對·Excel 有多個金額欄且欄名與系統不同時）：選定套用全機種分頁
App._bomModelsPriceWizard = function(projId, priceHeaders) {
  const opts = priceHeaders.map((ph, i) => '<label style="display:flex;align-items:center;gap:9px;padding:9px 13px;border:1px solid var(--rule);border-radius:var(--r8);cursor:pointer;font-size:14px"><input type="radio" name="bomm-price" value="' + ph.idx + '"' + (i === 0 ? ' checked' : '') + '><b>' + U.esc(toTrad(ph.header)) + '</b></label>').join('');
  App.openModal({
    title: '選擇計算價差的金額欄位',
    body: '<div class="field-hint">這份 Excel 偵測到<b>多個金額欄</b>（單價／成本欄名與系統定義不同時常見）。請選要用哪一欄計算成本差異，選定會套用到<b>全部機種分頁</b>。</div>' +
      '<div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">' + opts + '</div>',
    footer: '<button class="tb-action ghost" onclick="App.closeModal()">取消</button>' +
      '<button class="tb-action" onclick="App._bomModelsPriceApply(\'' + projId + '\')">套用並比對</button>',
  });
};
App._bomModelsPriceApply = function(projId) {
  const sel = document.querySelector('input[name="bomm-price"]:checked');
  const idx = sel ? parseInt(sel.value, 10) : null;
  App.closeModal();
  if (idx != null && !isNaN(idx)) App._bomModelsCompare(projId, idx);
};
App._bomSelectModel = function(projId, idx) {
  const p = App.getProj(projId); if (!p) return;
  idx = parseInt(idx, 10);
  if (idx === -1) p.bomModelIdx = -1;   // §19.6.2 全系列加權模式（不啟用單機種·區塊2 收空/區塊3 顯綜合）
  else App._bomActivateModel(p, idx);
  Store.projects.save();
  App._bomRerender(p);
};
// 幣別/匯率三欄位（§13.9 共用：NPI 多機種匯入卡 ＋ ECN 區塊①）
App._bomCurFieldsHtml = function(proj) {
  const pid = proj.id, base = proj.bomBaseCurrency || 'NTD';
  const currOpt = (cur) => App._BOM_CURR.map(c => '<option value="' + c + '"' + (c === cur ? ' selected' : '') + '>' + c + '</option>').join('');
  return '<div class="bom-cfield"><label>報價來源幣別</label><select onchange="App._bomSet(\'' + pid + '\',\'bomQuoteCurrency\',this.value)">' + currOpt(proj.bomQuoteCurrency) + '</select></div>' +
    '<div class="bom-cfield"><label>換算基準幣別</label><select onchange="App._bomSet(\'' + pid + '\',\'bomBaseCurrency\',this.value)">' + currOpt(proj.bomBaseCurrency) + '</select></div>' +
    '<div class="bom-cfield bom-rate"><label>匯率</label><span>1 ' + U.esc(proj.bomQuoteCurrency) + ' =</span><input type="number" step="0.001" value="' + proj.bomRate + '" onchange="App._bomSet(\'' + pid + '\',\'bomRate\',this.value)"><span>' + U.esc(base) + '</span></div>';
};
// NPI 多機種頁頭：多機種匯入卡＋型號比較總表＋機種選擇（下方明細=選中機種，複用單機種 render）
App._bomNpiBar = function(proj) {
  const pid = proj.id, base = proj.bomBaseCurrency || 'NTD';
  const st = (App._bomMStage || {})[pid] || {};
  const models = proj.bomModels || [];
  const fileCard = (which, lbl) => {
    const cands = st[which], n = cands ? cands.length : 0, inputId = 'bomm-' + which + '-' + pid;
    return '<div class="bomm-drop' + (n ? ' done' : '') + '"><input type="file" id="' + inputId + '" accept=".xlsx,.xls" style="display:none" onchange="App._bomModelsPick(\'' + pid + '\',\'' + which + '\',this)">' +
      '<div class="bomm-drop-tag">' + lbl + '</div>' +
      (n ? '<div class="bomm-drop-done">✓ 已讀取 <b>' + n + '</b> 個機種分頁 <button class="bxb-relink" onclick="document.getElementById(\'' + inputId + '\').click()">重選</button></div>'
         : '<div class="bomm-drop-ph" onclick="document.getElementById(\'' + inputId + '\').click()"><span class="big">📄</span>上傳（各機種一分頁）</div>') + '</div>';
  };
  // §13.7 比對範圍：預設全部分頁各當一機種；可選單一分頁＝單一機種比對（復原舊精靈「選分頁」能力）
  const scope = (App._bomMScope || {})[pid] || 'all';
  const bothUp = st.old && st.new;
  const sheetNames = bothUp ? Array.from(new Set([].concat((st.new || []).map(c => c.sheetName), (st.old || []).map(c => c.sheetName)))) : [];
  const scopeRow = bothUp ? '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:2px"><label style="font-size:12px;color:var(--ink3);font-weight:600">比對範圍</label>' +
    '<select onchange="App._bomSetScope(\'' + pid + '\',this.value)" style="font-size:13px;padding:6px 9px;border:1px solid var(--rule);border-radius:6px;background:var(--surface)">' +
      '<option value="all"' + (scope === 'all' ? ' selected' : '') + '>全部機種（' + sheetNames.length + ' 分頁各當一機種）</option>' +
      sheetNames.map(nm => '<option value="' + U.esc(nm) + '"' + (scope === nm ? ' selected' : '') + '>單一機種：' + U.esc(nm) + '</option>').join('') + '</select>' +
    '<span style="font-size:11px;color:var(--ink4)">Excel 含多分頁時，可只比對單一機種</span></div>' : '';
  const cmpLabel = (scope !== 'all') ? '⚡ 比對此機種' : '⚡ 全機種自動比對';
  // §13.9：幣別/匯率＝比對前輸入參數 → 併入匯入卡（上傳卡→範圍→幣別→⚡比對 一條龍）；本卡＝流程區塊①（掛 bxb-ey 編號）
  const importCard = '<div class="bomm-import"><div class="bxb-ey"><span class="bxb-no">1</span><span class="bxb-tt">多機種比對匯入</span><span class="bxb-note">單一機種＝單一分頁；多機種＝每機種一分頁（分頁名＝機種）</span></div>' +
    '<div class="bomm-row">' + fileCard('old', '◄ 舊版／上一代') + fileCard('new', '► 新版／這一代') + '</div>' +
    scopeRow +
    '<div class="bxb-cur">' + App._bomCurFieldsHtml(proj) +
      '<div class="bxb-cta-row"><button class="bxb-cta ghost" onclick="App._bomAddManual(\'' + pid + '\')">＋ 手動輸入</button>' +
        '<button class="bxb-cta" onclick="App._bomModelsCompare(\'' + pid + '\')">' + cmpLabel + '</button></div>' +
    '</div></div>';
  if (!models.length) return '<div class="bomm-wrap">' + importCard + '</div>';
  const sum = App._bomModelsSummary(proj);
  const allS = App._bomAllSeriesStats(proj);   // §19.6.2 全系列加權（合計列達成率＋全系列模式結算）
  const allSel = proj.bomModelIdx === -1;
  const money = n => n == null ? '—' : Math.round(n).toLocaleString();
  const fmt = n => n == null ? '—' : (n > 0 ? '+' : '') + Math.round(n).toLocaleString();
  const pctS = n => n == null ? '—' : (Math.round(n * 1000) / 10) + '%';
  const dir = n => n == null ? '' : (n < 0 ? 'neg' : '');   // §13.9 Paul 定 B：總表＝財報慣例（負紅/正黑）；省綠增紅語意色留給差異四區等語意欄
  // §19.6.2 末欄依型態：NPI＝目標達成率／ECN＝預估年效益（整機價差×年產）
  const isEcn = !!proj.ecnType;
  const mfmtM = n => n == null ? '—' : (Math.abs(n) >= 1e6 ? ((n > 0 ? '+' : '') + (Math.round(n / 1e5) / 10) + 'M') : ((n > 0 ? '+' : '') + Math.round(n).toLocaleString()));
  const lastHead = isEcn ? '預估年效益' : '目標達成';
  const lastCell = s => isEcn
    ? '<b style="color:var(--' + (s.annualBenefit != null && s.annualBenefit >= 0 ? 'sage-700' : 'rose-ink') + ')">' + mfmtM(s.annualBenefit) + '</b>'
    : (s.achv != null ? '<b style="color:var(--' + (s.achv >= 100 ? 'sage-700' : 'rose-ink') + ')">' + s.achv + '%</b>' : '<span style="color:var(--ink4);font-size:11px">未填目標</span>');
  const rows = sum.map((s, i) => '<tr class="' + (i === proj.bomModelIdx ? 'bomm-sel' : '') + '" onclick="App._bomSelectModel(\'' + pid + '\',' + i + ')">' +
    '<td>' + U.esc(s.name) + (s.matched ? '' : ' <span class="bomm-unmatched">未配對</span>') + '</td>' +
    '<td class="num">' + money(s.oldTotal) + '</td><td class="num">' + money(s.newTotal) + '</td>' +
    '<td class="num ' + dir(s.delta) + '">' + fmt(s.delta) + '</td><td class="num">' + pctS(s.dropPct) + '</td>' +
    '<td class="num">' + lastCell(s) + '</td></tr>').join('');
  const tot = sum.reduce((a, s) => { a.o += (s.oldTotal || 0); a.n += (s.newTotal || 0); return a; }, { o: 0, n: 0 });
  const totDelta = tot.n - tot.o;
  const totBenefit = sum.reduce((a, s) => a + (s.annualBenefit || 0), 0);
  const lastTot = isEcn ? (sum.some(s => s.annualBenefit != null) ? '<b>' + mfmtM(totBenefit) + '</b>' : '—') : (allS.achv != null ? '<b>' + allS.achv + '%</b>' : '—');
  // §19.6.2 全系列加權模式僅 NPI（ECN 結算無 blended 分支）：ECN 合計列不可點、NPI 合計列＝點入全系列
  const totRowOpen = isEcn ? '<tr class="bomm-tot"><td>合計</td>' : '<tr class="bomm-tot' + (allSel ? ' bomm-sel' : '') + '" onclick="App._bomSelectModel(\'' + pid + '\',-1)" style="cursor:pointer" title="點此看全系列加權綜合結算"><td>全系列加權平均 ◂</td>';
  const summary = '<div class="bomm-sumcard"><div class="bomm-hd">型號比較列表（' + models.length + ' 機種 · 幣別 ' + U.esc(base) + '）· 點擊該列可切換下方機種數據</div>' +
    '<div class="bomm-tbl-scroll"><table class="bomm-tbl"><thead><tr><th>機種</th><th>舊整機總額</th><th>新整機總額</th><th>整機價差</th><th>降幅</th><th>' + lastHead + '</th></tr></thead><tbody>' + rows +
    totRowOpen + '<td class="num">' + money(tot.o) + '</td><td class="num">' + money(tot.n) + '</td><td class="num ' + dir(totDelta) + '">' + fmt(totDelta) + '</td><td class="num">' + (tot.o ? pctS(-totDelta / tot.o) : '—') + '</td><td class="num">' + lastTot + '</td></tr>' +
    '</tbody></table></div></div>';
  const sel = '<div class="bomm-picker"><label>檢視機種明細</label><select onchange="App._bomSelectModel(\'' + pid + '\',this.value)">' +
    (isEcn ? '' : '<option value="-1"' + (allSel ? ' selected' : '') + '>全系列加權平均</option>') +
    models.map((m, i) => '<option value="' + i + '"' + (i === proj.bomModelIdx ? ' selected' : '') + '>' + U.esc(m.name) + '</option>').join('') + '</select><span class="bomm-picker-note">下方差異四區／整機成本＝目前選的機種；在區塊3填' + (isEcn ? '目標調降／年產／一次性' : '目標成本／售價／年產') + '＝記到「這個機種」，各機種各自算損益（切機種各自保留）。匯出在右上「匯出成本差異報告」</span></div>';
  return '<div class="bomm-wrap"><div class="bomm-toprow">' + importCard + summary + '</div>' + sel + '</div>';
};
// §19.6.1 單頁三區塊重設計（引擎零變更·複用 _bomCalc/_bomZoneHtml/所有 handler，只換 UI 殼）
App._ecnTabBHtml = function(proj) {
  App._bomEnsure(proj);
  // §19.6.2 A：ECN 也走多機種矩陣——既有單 BOM 自動包成「單一機種」model（顯示零變化）；已多機種或無資料則不動
  if (proj.ecnType && App._bomWrapSingleModel(proj)) { try { Store.projects.save(); } catch (e) {} }
  const C = App._bomCalc(proj);
  const base = proj.bomBaseCurrency;
  const pid = proj.id;
  const dir = n => n > 0 ? 'up' : 'dn';
  const forced = (proj.roiType === 'forced');
  // 頁首 ROI 類型切換條（§19.6.1 #5：顯眼·置頂·決定下方 ROI 結算方式，可在此改·預設沿用開案選擇）
  const roiModeBar = '<div class="bxb-roimode">' +
    '<div class="bxb-roimode-hd"><b>設變效益評估類型</b><span>決定下方結算方式——可在此修改（預設沿用開案選擇）</span></div>' +
    '<div class="bxb-rmseg">' +
      '<button class="bxb-rmbtn' + (!forced ? ' on' : '') + '" onclick="App._bomSet(\'' + pid + '\',\'roiType\',\'benefit\')"><b>效益型 · 主動成本調降</b><span>算每台省多少 · 多久回本 · N 年賺多少</span></button>' +
      '<button class="bxb-rmbtn' + (forced ? ' on' : '') + '" onclick="App._bomSet(\'' + pid + '\',\'roiType\',\'forced\')"><b>被迫型 · 不可抗力</b><span>不算回本 · 算變更總代價 · 壓到最小</span></button>' +
    '</div></div>';
  // 操作流程 HintBox（六步·預設收合）
  // §13.9：HintBox 移到「差異比對與成本分析看板」正上方；文案依 NPI（多機種匯入·匯出在頁首）／ECN（區塊①單一匯入）分版
  const flowSteps = proj.ecnType
    ? '<li><b>上傳並比對各機種</b>：「多機種比對匯入」放設變前/後各一份 Excel（每受影響機種一分頁）、確認幣別/匯率→按「⚡全機種自動比對」→點型號列表選要看的機種（單機種＝上傳單一分頁即可）。</li>' +
      '<li><b>執行差異比對</b>：自動分四區（新增/刪除/改量·換料/只有價差），每行可決定要不要納入成本，預設全納，未變更料不佔畫面。</li>' +
      '<li><b>標切換方式與庫存</b>：每行選即刻（舊料立停→呆滯）或漸進（用完再換→無呆滯）；刪除料/換掉舊料填庫存，自動算呆滯。</li>' +
      '<li><b>看每台目標成本差額</b>：中間大數字＝每台省（或多花）多少；設「目標成本調降/台」顯達成進度。</li>' +
      '<li><b>設效益參數出回本期</b>：填年產/年限/一次性（模具＋認證，呆滯自動）→年效益/回本期/N年淨效益；被迫型改看合規總代價壓最小。</li>' +
      '<li><b>匯出報告</b>：區塊③「匯出 Excel 報告」→選對照/替換與欄位→三頁報表。系統不存 Excel、現場重生。<span class="bom-wave-tag">不保留上傳檔</span></li>'
    : '<li><b>上傳並比對各機種</b>：「多機種比對匯入」放新舊各一份 Excel（每機種一分頁）、確認幣別/匯率→按「⚡全機種自動比對」→點型號總表選要看的機種。</li>' +
      '<li><b>標切換方式與庫存</b>：每行選即刻（舊料立停→呆滯）或漸進（用完再換→無呆滯）；刪除料/換掉舊料填庫存，自動算呆滯。</li>' +
      '<li><b>看每台目標成本差額</b>：中間大數字＝每台省（或多花）多少；設「目標成本調降/台」顯達成進度。</li>' +
      '<li><b>設效益參數出回本期</b>：填年產/年限/一次性（模具＋認證，呆滯自動）→年效益/回本期/N年淨效益；被迫型改看合規總代價壓最小。</li>' +
      '<li><b>匯出報告</b>：右上「匯出成本差異報告」→多機種比較（全機種）或本機種設變分析（3頁）。系統不存 Excel、現場重生。<span class="bom-wave-tag">不保留上傳檔</span></li>';
  const flow = App.buildHintBox({ key: 'ecn-bom-flow', icon: 'ti-settings', title: 'BOM 成本差異分析 怎麼用', summary: '成本與效益試算流程', collapsed: true,
    bodyHtml: '<ol>' + flowSteps + '</ol>' });

  const bno = { board: '2', roi: '3' };   // 兩版一致：①匯入（ECN=區塊①／NPI=多機種匯入卡）→②看板→③結算

  // ── 區塊二：差異比對與成本分析看板 ──
  const cnt = proj.bomOldCount ? ('舊 ' + proj.bomOldCount + '／新 ' + (proj.bomNewCount || 0) + ' → ' + proj.bomRows.length + ' 項差異') : (proj.bomRows.length ? proj.bomRows.length + ' 項差異' : '尚無差異——先匯入或手動輸入');
  const tv = parseFloat(proj.targetSavePerUnit) || 0;
  const pctRaw = tv > 0 ? ((-C.target) / tv * 100) : 0;
  const pct = Math.max(0, Math.min(100, pctRaw));
  const heroPct = tv > 0 ? '<span class="pct">達成 ' + Math.round(pctRaw) + '%</span>' : '';
  const heroProg = tv > 0
    ? '<div class="bxb-pb"><div class="bxb-pb-t"><div class="bxb-pb-f" style="width:' + pct.toFixed(0) + '%"></div></div>' +
        '<div class="bxb-pb-c"><span>目前 ' + App._bomFmt(C.target) + '</span><span>目標 −' + tv.toLocaleString() + '/台</span></div></div>'
    : '';
  // §19.6.2：NPI 世代語意正名（ECN＝設變／採購；NPI＝結構變更／同料價格／世代淨差）
  const stL = proj.ecnType ? ['設變成本差額', '採購降價貢獻', '每台目標成本差額'] : ['結構變更差額', '同料價格差額', '每台差異淨額'];
  const stats = '<div class="bxb-stats">' +
    '<div class="bxb-stat"><div class="l">' + stL[0] + '</div><div class="v ' + dir(C.chg) + '">' + App._bomFmt(C.chg) + '<span class="u">' + U.esc(base) + '/台</span></div></div>' +
    '<div class="bxb-stat"><div class="l">' + stL[1] + '</div><div class="v ' + dir(C.buy) + '">' + App._bomFmt(C.buy) + '<span class="u">' + U.esc(base) + '/台</span></div></div>' +
    '<div class="bxb-stat hero"><div class="l">' + stL[2] + heroPct + '</div><div class="v ' + dir(C.target) + '">' + App._bomFmt(C.target) + '<span class="u">' + U.esc(base) + ' / 台</span></div>' + heroProg + '</div>' +
  '</div>';
  const zones = App._BOM_ZONES.map(z => App._bomZoneHtml(proj, z)).join('');
  const deadRows = proj.bomRows.filter(r => App._bomDead(r) > 0);
  const deadBar = C.dead > 0 ? '<div class="bom-deadbar">⚠ 呆滯合計 <b>' + App._bomMoney(C.dead) + '</b>：' +
    deadRows.map(r => U.esc(r.partNoA || '') + '（' + (parseFloat(r.stockQty) || 0) + '×' + (parseFloat(r.oldPrice) || 0) + '=' + App._bomMoney(App._bomDead(r)) + '）').join('＋') +
    '，皆走「即刻切換」。改「漸進切換」可消呆滯。</div>' : '';
  // §19.6.2 全系列加權模式（NPI·bomModelIdx=-1）：區塊2 收空狀態（各機種料號不同無法逐件比對）、區塊3 顯綜合
  const allSeries = !proj.ecnType && proj.bomModelIdx === -1 && (proj.bomModels || []).length > 0;
  const blk2 = allSeries
    ? '<div class="bxb-blk"><div class="bxb-ey"><span class="bxb-no">' + bno.board + '</span><span class="bxb-tt">世代差異比對看板</span><span class="bxb-note">全系列加權平均</span></div>' +
        '<div style="padding:32px 20px;text-align:center;color:var(--ink4);font-size:13px;line-height:1.7;background:var(--paper);border:1px dashed var(--rule);border-radius:var(--r8)">各機種的壓縮機、控制板料號與用量不同，無法做實體零件差異比對。<br><b style="color:var(--ink2)">請於上方型號列表點選單一機種</b>，以檢視該機種的零件變更明細。</div></div>'
    : '<div class="bxb-blk"><div class="bxb-ey"><span class="bxb-no">' + bno.board + '</span><span class="bxb-tt">' + (proj.ecnType ? '差異比對與成本分析看板' : '世代差異比對看板') + '</span><span class="bxb-note">' + cnt + '</span></div>' +
    stats + App._bomBreakdownHtml(proj) + '<div style="display:flex;flex-direction:column;gap:9px">' + zones + '</div>' + App._bomAltPairHtml(proj) + deadBar + '</div>';

  // ── 區塊三：ROI 結算與匯出 ──
  // 整機對照卡：舊/新完整 BOM 葉節點加總（§19.6.1 新引擎）；無完整表或判不出基準時退差異行加總＋精靈
  const machineDelta = (proj.bomRows || []).reduce((a, r) => a + App._bomDiff(r), 0);   // 差異行加總（退路/無完整表時顯示）
  const WT = App._bomWholeTotals(proj);
  const mcfgLink = '<a class="bxb-mcfg" onclick="App._bomWholeWizard(\'' + pid + '\')">調整計算基準</a>';
  const phCell = (label, hint) => '<div class="bxb-mcell"><div class="l">' + label + '</div><div class="v" style="color:var(--ink4);font-size:13px;font-weight:500">' + hint + '</div></div>';
  let machine;
  if (WT.ok) {
    const methodLabel = { level: '依階次葉節點', matCat: '依材料類別（M 料）', sumAll: '全部料加總', topRow: '金額欄頂列' }[WT.method] || '';
    machine = '<div class="bxb-machine"><div class="mh">整機成本對照（幣別 ' + U.esc(base) + '） · 舊/新整機總額＝完整 BOM 葉節點加總 · 基準：' + methodLabel + '（舊 ' + WT.oldLeaf + '／新 ' + WT.newLeaf + ' 個葉節點）' + mcfgLink + '</div>' +
      '<div class="bxb-mcell ' + dir(WT.delta) + '"><div class="l">整機價差（新−舊）</div><div class="v">' + App._bomFmt(WT.delta) + '</div></div>' +
      '<div class="bxb-mcell"><div class="l">舊版整機總額</div><div class="v">' + App._bomMoney(WT.oldTotal) + '</div></div>' +
      '<div class="bxb-mcell"><div class="l">新版整機總額</div><div class="v">' + App._bomMoney(WT.newTotal) + '</div></div></div>';
  } else if (WT.noData) {
    machine = '<div class="bxb-machine"><div class="mh">整機成本對照（幣別 ' + U.esc(base) + '） · 匯入舊/新版完整 BOM 並「差異比對」後，自動加總葉節點顯示整機總額</div>' +
      '<div class="bxb-mcell ' + dir(machineDelta) + '"><div class="l">整機價差（差異行加總）</div><div class="v">' + App._bomFmt(machineDelta) + '</div></div>' +
      phCell('舊版整機總額', '匯入後顯示') + phCell('新版整機總額', '匯入後顯示') + '</div>';
  } else {   // 有完整表但判不出葉節點基準（無階次/材料類別欄、或無單價欄）→ 差異行加總 + 精靈
    const reasonMsg = WT.reason === 'noprice' ? '完整表無單價欄——只能核對物料/用量，無法加總整機金額' : '無法自動判斷葉節點基準（找不到階次或材料類別欄）';
    machine = '<div class="bxb-machine"><div class="mh">整機成本對照（幣別 ' + U.esc(base) + '） · ' + reasonMsg + mcfgLink + '</div>' +
      '<div class="bxb-mcell ' + dir(machineDelta) + '"><div class="l">整機價差（差異行加總）</div><div class="v">' + App._bomFmt(machineDelta) + '</div></div>' +
      phCell('舊版整機總額', '點右上選基準') + phCell('新版整機總額', '點右上選基準') + '</div>';
  }
  const num = (label, field, val, ro, note) => '<div class="bxb-rin"><label>' + label + (note || '') + '</label><input type="number" ' + (ro ? 'disabled ' : '') + 'value="' + val + '"' + (ro ? '' : ' onchange="App._bomSet(\'' + pid + '\',\'' + field + '\',this.value)"') + '></div>';
  const roiParams = '<div class="bxb-rins">' +
    num('年產台數（台）', 'annualVolume', proj.annualVolume) + num('評估年限（年）', 'evalYears', proj.evalYears) +
    (C.autoMold > 0
      ? '<div class="bxb-rin"><label>一次性 · 模具（自動加總 · <span style="color:var(--mat);cursor:pointer;text-decoration:underline" onclick="App._moldDetailPopup(\'' + pid + '\')">明細</span>）</label><input value="' + App._bomMoney(C.autoMold) + '" disabled title="來自「物料→模具費用」分攤到本案·改分攤請去該頁"></div>'
        + num('一次性 · 模具（手動加項·試模等）', 'ot_mold', proj.oneTimeCost.mold || 0)
      : num('一次性 · 模具', 'ot_mold', proj.oneTimeCost.mold || 0)) + num('一次性 · 認證', 'ot_cert', proj.oneTimeCost.cert || 0) +
    num('一次性 · 呆滯（自動）', '', App._bomMoney(C.dead), true) +
    (forced ? '<div class="bxb-rin"><label>目標成本調降 / 台<span style="color:var(--ink4);font-size:9.5px"> 不適用</span></label><input value="—" disabled></div>'
            : num('目標成本調降 / 台', 'targetSavePerUnit', tv, false, '<span style="color:var(--amber);font-size:10px"> 餵進度條</span>')) +
  '</div>';
  // 結算輸出＝橫向大卡（壓軸焦點：回本期/淨效益 深綠大字）
  const bigcard = (lbl, val, cls, formula) => '<div class="bxb-bigcard ' + cls + '"><div class="bl">' + lbl + '</div><div class="bv ' + cls + '">' + val + '</div>' + (formula ? '<div class="bf">' + formula + '</div>' : '') + '</div>';
  const roiOut = forced
    ? '<div class="bxb-bigout forced">' +
        bigcard('合規／變更總代價（' + proj.evalYears + ' 年）', App._bomMoney(C.forcedCost) + ' <small>' + U.esc(base) + '</small>', 'cost', '每台差額 ' + App._bomFmt(C.target) + ' × 年產 ' + (proj.annualVolume || 0).toLocaleString() + ' × ' + proj.evalYears + ' 年 ＋ 一次性 ' + App._bomMoney(C.oneTime)) +
        '<div class="bxb-rnote"><b>回本期不適用</b>——被迫型不是為了賺錢，是為了合規/續產。目標＝把總代價壓到最小：改<b>漸進切換</b>消呆滯、壓低模具/認證一次性。</div>' +
      '</div>'
    : '<div class="bxb-bigout">' +
        bigcard('年效益', App._bomMoney(C.annual) + ' <small>' + U.esc(base) + '/年</small>', 'good', '每台差額 ' + App._bomFmt(-C.target).replace('+', '') + ' × 年產 ' + (proj.annualVolume || 0).toLocaleString()) +
        bigcard('回本期', (C.payback != null ? (Math.round(C.payback * 10) / 10) + ' <small>月</small>' : '—'), 'good', '一次性 ' + App._bomMoney(C.oneTime) + ' ÷ 月效益') +
        bigcard(proj.evalYears + ' 年淨效益', App._bomMoney(C.netN) + ' <small>' + U.esc(base) + '</small>', 'good', '年效益 × ' + proj.evalYears + ' − 一次性') +
        bigcard('設變降本達成率', (tv > 0 ? Math.round((-C.target) / tv * 100) + ' <small>%</small>' : '—'), 'good', tv > 0 ? '目標調降 ' + tv.toLocaleString() + ' ｜ 實際調降 ' + App._bomMoney(-C.target) : '開案未填目標調降') +
      '</div>';
  // §13.9：ECN 戰情室無頁籤 header，匯出仍留區塊三；NPI 匯出已移到頁首「匯出成本差異報告」，此處不再放鈕
  const exportBar = proj.ecnType ? '<div class="bxb-expbar">' +
    '<div class="bxb-exp-note"><b>匯出 Excel 報告</b>：' + ((proj.bomModels || []).length > 1 ? '「多機種比較」＝型號比較總表＋各機種差異明細＋換料對照；「本機種設變分析」＝目前機種三頁（公式可改）。' : '選呈現模式（對照／替換）與欄位 → 三頁報表（總覽與效益評估／成本差異明細／設變對照 BOM，公式全串·可改黃格自動重算）。') + '系統不存 Excel，從結構化資料現場重生。</div>' +
    ((proj.bomModels || []).length > 1 ? '<button class="bxb-cta ghost" onclick="App.exportBomModels(App.getProj(\'' + pid + '\'))">📊 多機種比較</button>' : '') +
    '<button class="bxb-cta" onclick="App._bomExportWizard(\'' + pid + '\')">📤 ' + ((proj.bomModels || []).length > 1 ? '本機種設變分析' : '匯出 Excel 報告') + '</button></div>' : '';
  const typeTag = '<span style="font-weight:400;color:var(--ink4);font-size:11px">（' + (forced ? '被迫型' : '效益型') + '·於頁首切換）</span>';
  // §19.5 Tab B closed 鎖：結案＝機種資料/參數輸入唯讀（匯出鈕與結算輸出保留可看可匯）；照 Tab A .ecn-tbl-locked 同 pattern
  const bLock = proj.ecnType && App._ecnLocked(proj);
  const lockWrap = html => bLock ? '<div class="bom-locked">' + html + '</div>' : html;
  let blk3;
  if (proj.ecnType) {
    blk3 = '<div class="bxb-blk"><div class="bxb-ey"><span class="bxb-no">' + bno.roi + '</span><span class="bxb-tt">成本效益結算與匯出</span><span class="bxb-note">' + (forced ? '被迫型 · 追合規總代價壓最小' : '效益型 · 結案時比對新舊 BOM 結算成本調降') + '</span></div>' +
      lockWrap(machine +
      '<div class="bxb-sech">💰 效益試算參數 ' + typeTag + '</div>' + roiParams) +
      '<div class="bxb-sech">📊 結算輸出 <span style="font-weight:400;color:var(--ink4);font-size:11px">— 這次變更值不值得做的最終答案</span></div>' + roiOut +
      exportBar + '</div>';
  } else if (allSeries) {
    // §19.6.2 全系列加權綜合結算：加權達成率／專案總毛利(年)／總毛利率／全系列年省總額（依各機種年產量加權·主管彙報數）
    const A = App._bomAllSeriesStats(proj);
    const mfmtA = n => { const a = Math.abs(n); return a >= 1e6 ? (Math.round(n / 1e5) / 10) + 'M' : Math.round(n).toLocaleString(); };
    const heroA = '<div class="bxb-bigcard hero"><div class="bl">全系列加權達成率' + (A.achv != null ? (A.achv >= 100 ? ' <span class="bxb-badge good">整體達標</span>' : ' <span class="bxb-badge bad">整體超支</span>') : '') + '</div>' +
      '<div class="bv ' + (A.achv == null ? '' : (A.achv >= 100 ? 'good' : 'cost')) + '">' + (A.achv != null ? A.achv + ' <small>%</small>' : '—') + '</div>' +
      '<div class="bf">' + (A.anyTarget ? '加權實際 ' + App._bomMoney(A.actUnit) + ' vs 目標 ' + App._bomMoney(A.tgtUnit) + ' · 全系列年產 ' + Math.round(A.volSum).toLocaleString() + ' 台' : '各機種填目標成本＋年產後計算') + '</div></div>';
    const profitCard = '<div class="bxb-bigcard"><div class="bl">專案總毛利 <span style="font-weight:400;color:var(--ink4)">/ 年</span></div><div class="bv ' + (A.anySell ? 'good' : '') + '">' + (A.anySell ? mfmtA(A.profitYr) + ' <small>' + U.esc(base) + '</small>' : '—') + '</div><div class="bf">' + (A.anySell ? '加權毛利 × 各機種年產加總' : '各機種填售價＋年產後計算') + '</div></div>';
    const mpctCard = '<div class="bxb-bigcard"><div class="bl">總毛利率</div><div class="bv ' + (A.marginPct != null ? 'good' : '') + '">' + (A.marginPct != null ? (Math.round(A.marginPct * 10) / 10) + ' <small>%</small>' : '—') + '</div><div class="bf">加權售價扣除加權成本</div></div>';
    const saveCard = '<div class="bxb-bigcard"><div class="bl">全系列年省總額 <span style="font-weight:400;color:var(--ink4)">/ 年</span></div><div class="bv ' + (A.anyTarget ? (A.saveYr >= 0 ? 'good' : 'cost') : '') + '">' + (A.anyTarget ? mfmtA(A.saveYr) + ' <small>' + U.esc(base) + '</small>' : '—') + '</div><div class="bf">各機種（目標−實際）× 年產加總</div></div>';
    blk3 = '<div class="bxb-blk"><div class="bxb-ey"><span class="bxb-no">' + bno.roi + '</span><span class="bxb-tt">成本目標與毛利結算</span><span class="bxb-note">全系列加權綜合 · 依各機種年產量加權（共 ' + A.modelCount + ' 機種）</span></div>' +
      '<div class="bxb-sech">📊 結算輸出 · 全系列綜合</div><div class="bxb-bigout">' + heroA + profitCard + mpctCard + saveCard + '</div></div>';
  } else {
    // §19.6.2 NPI 目標達成率型結算：目標達成率／單台毛利／毛利率／世代成本效益 四卡（引擎沿用 _bomWholeTotals·新欄位 targetUnitCost/unitSellPrice）
    const tuc = parseFloat(proj.targetUnitCost) || 0;
    const usp = parseFloat(proj.unitSellPrice) || 0;
    const act = WT.ok ? WT.newTotal : null;          // 實際整機成本/台（新版葉節點加總）
    const oldGen = WT.ok ? WT.oldTotal : null;       // 上一代整機成本/台（舊版葉節點）
    const vol = parseFloat(proj.annualVolume) || 0;
    const achv = (tuc > 0 && act) ? Math.round(tuc / act * 100) : null;    // 目標÷實際×100
    const save = (tuc > 0 && act != null) ? (tuc - act) : null;            // >0 省(達標), <0 超支
    const yr = (save != null) ? save * vol : 0;
    const margin = (usp > 0 && act != null) ? (usp - act) : null;
    const marginPct = (usp > 0 && margin != null) ? (margin / usp * 100) : null;
    const gen = (oldGen != null && act != null) ? (act - oldGen) : null;
    const mfmt = n => { const a = Math.abs(n); return a >= 1e6 ? (Math.round(n / 1e5) / 10) + 'M' : Math.round(n).toLocaleString(); };
    const dispVal = v => v != null ? App._bomMoney(v) : '—';
    const rinRO = (label, val) => '<div class="bxb-rin"><label>' + label + '</label><input value="' + val + '" disabled></div>';
    const npiParams = '<div class="bxb-rins">' +
      num('目標成本 / 台', 'targetUnitCost', tuc, false, '<span style="color:var(--ink4);font-size:9.5px"> 立案設定</span>') +
      rinRO('實際整機成本 / 台', dispVal(act)) +
      rinRO('目標差異', (act != null && tuc > 0) ? App._bomFmt(act - tuc) : '—') +
      num('基準售價（選填）', 'unitSellPrice', usp) +
      num('年產台數', 'annualVolume', vol) +
      rinRO('上一代成本', dispVal(oldGen)) +
    '</div><div style="font-size:11px;color:var(--ink4);margin:7px 0 2px">目標成本／基準售價由立案設定同步（此頁即時試算） · ' + mcfgLink + '</div>';
    const okAchv = save != null && save >= 0;
    const pbHtml = achv != null ? '<div class="bxb-pb"><div class="bxb-pb-t"><div class="bxb-pb-f" style="width:' + Math.max(0, Math.min(100, act > 0 ? Math.round(tuc / act * 100) : 0)) + '%"></div></div><div class="bxb-pb-c"><span>實際 ' + App._bomMoney(act) + '</span><span>目標 ' + tuc.toLocaleString() + '</span></div></div>' : '';
    const heroCard = '<div class="bxb-bigcard hero"><div class="bl">成本目標達成率' + (save != null ? (okAchv ? ' <span class="bxb-badge good">已達標</span>' : ' <span class="bxb-badge bad">超支</span>') : '') + '</div>' +
      '<div class="bv ' + (achv == null ? '' : (okAchv ? 'good' : 'cost')) + '">' + (achv != null ? achv + ' <small>%</small>' : '—') + '</div>' + pbHtml +
      '<div class="bf">' + (save != null ? (save >= 0 ? '每台省 ' : '每台超支 ') + App._bomMoney(Math.abs(save)) + ' · 年' + (save >= 0 ? '省 ' : '增 ') + mfmt(Math.abs(yr)) + ' ' + U.esc(base) : '填目標成本／匯入 BOM 後計算') + '</div></div>';
    const marginCard = '<div class="bxb-bigcard"><div class="bl">單台毛利</div><div class="bv ' + (margin == null ? '' : 'good') + '">' + (margin != null ? App._bomFmt(margin).replace('+', '') + ' <small>' + U.esc(base) + '</small>' : '—') + '</div><div class="bf">' + (usp > 0 ? '基於預估售價 ' + usp.toLocaleString() : '填基準售價以啟用毛利') + '</div></div>';
    const marginPctCard = '<div class="bxb-bigcard"><div class="bl">預估毛利率</div><div class="bv ' + (marginPct == null ? '' : 'good') + '">' + (marginPct != null ? (Math.round(marginPct * 10) / 10) + ' <small>%</small>' : '—') + '</div><div class="bf">' + (usp > 0 ? '售價扣除整機成本後' : '填基準售價以啟用') + '</div></div>';
    const genCard = gen != null ? '<div class="bxb-bigcard"><div class="bl">世代成本效益</div><div class="bv ' + (gen <= 0 ? 'good' : 'cost') + '">' + App._bomFmt(gen) + ' <small>' + U.esc(base) + '</small></div><div class="bf">' + (gen <= 0 ? '較上一代降本' : '較上一代增加') + '</div></div>' : '';
    const npiCards = '<div class="bxb-bigout">' + heroCard + marginCard + marginPctCard + genCard + '</div>';
    blk3 = '<div class="bxb-blk"><div class="bxb-ey"><span class="bxb-no">' + bno.roi + '</span><span class="bxb-tt">成本目標與毛利結算</span><span class="bxb-note">新品 · 實際整機成本 vs 目標成本／台</span></div>' +
      '<div class="bxb-sech">💰 結算參數</div>' + npiParams +
      '<div class="bxb-sech">📊 結算輸出 <span style="font-weight:400;color:var(--ink4);font-size:11px">— 這個新品成本站不站得住</span></div>' + npiCards +
      '</div>';
  }

  // §19.6.2 吸頂精簡 KPI 條（Dashboard-First·捲入零件明細時鎖螢幕頂端·頭頂永遠看得到核心數）
  const mfmtS = n => { const a = Math.abs(n); return a >= 1e6 ? (Math.round(n / 1e5) / 10) + 'M' : Math.round(n).toLocaleString(); };
  const stkSeg = (l, v, cls) => '<span class="bom-stick-m"><span class="l">' + l + '</span><span class="v ' + (cls || '') + '">' + v + '</span></span>';
  let stkInner = '';
  if (!proj.ecnType && (proj.bomModels || []).length) {
    if (allSeries) {
      const A = App._bomAllSeriesStats(proj);
      stkInner = '<span class="bom-stick-md">全系列加權</span>' + stkSeg('達成率', A.achv != null ? A.achv + '%' : '—', A.achv != null && A.achv >= 100 ? 'good' : '') + stkSeg('總毛利/年', A.anySell ? mfmtS(A.profitYr) : '—', A.anySell ? 'good' : '') + stkSeg('年省/年', A.anyTarget ? mfmtS(A.saveYr) : '—', '');
    } else {
      const tucS = parseFloat(proj.targetUnitCost) || 0, uspS = parseFloat(proj.unitSellPrice) || 0, actS = WT.ok ? WT.newTotal : null;
      const achvS = (tucS > 0 && actS) ? Math.round(tucS / actS * 100) : null, marS = (uspS > 0 && actS != null) ? (uspS - actS) : null;
      stkInner = '<span class="bom-stick-md">' + U.esc(((proj.bomModels[proj.bomModelIdx] || {}).name) || '本機種') + '</span>' + stkSeg('達成率', achvS != null ? achvS + '%' : '—', achvS != null ? (achvS >= 100 ? 'good' : 'cost') : '') + stkSeg('單台毛利', marS != null ? App._bomMoney(marS) : '—', marS != null ? 'good' : '') + stkSeg('目標差', (actS != null && tucS > 0) ? App._bomFmt(actS - tucS) : '—', '');
    }
  } else if (proj.ecnType) {
    stkInner = '<span class="bom-stick-md">' + (forced ? '被迫型' : '效益型') + '</span>' + (forced ? stkSeg('變更總代價', App._bomMoney(C.forcedCost), 'cost') : stkSeg('年效益', App._bomMoney(C.annual), 'good') + stkSeg('回本', C.payback != null ? (Math.round(C.payback * 10) / 10) + '月' : '—', '') + stkSeg('達成率', tv > 0 ? Math.round((-C.target) / tv * 100) + '%' : '—', tv > 0 ? 'good' : ''));
  }
  const stickyHtml = stkInner ? '<div class="bom-stick">' + stkInner + '</div>' : '';
  // §19.6.2 A：ECN/NPI 統一走多機種矩陣（ECN 多留 roiModeBar 效益型/被迫型條）；Dashboard-First：大盤（矩陣＋結算 blk3）→ 吸頂條 → 零件操盤（差異 blk2）
  const bomHead = (proj.ecnType ? lockWrap(roiModeBar) : '') + '<div class="bomm-head">' + flow + App._bomNpiBar(proj) + '</div>';
  // §21.16.7 跨模組商情變更提示：主檔現價 ≠ BOM 記錄新價 → 溫和黃橘 banner（不自動改·提示＋一鍵套用）
  const drift = App._bomPriceDrift(proj);
  const cinfo = drift.length ? '<div class="bom-cinfo"><span class="bom-cinfo-ic">📣</span>' +
    '<div class="bom-cinfo-tx"><b>系統商情提示</b>：料號主檔偵測到 ' + (drift[0].vendor ? '供應商 ' + U.esc(drift[0].vendor) + ' ' : '') + drift.slice(0, 3).map(function (d) { return U.esc(d.partNo); }).join('、') + (drift.length > 3 ? ' 等' : '') + ' 共 <b>' + drift.length + '</b> 筆物料有新報價，目前 BOM 仍用舊價計算。</div>' +
    '<button class="bom-cinfo-b ghost" onclick="App._bomDriftDetail(\'' + pid + '\')">查看單價差異</button>' +
    '<button class="bom-cinfo-b" onclick="App._bomApplyMasterPrices(\'' + pid + '\')">一鍵套用最新成本</button></div>' : '';
  // §19.6.3 頁面重構：拆「結算／明細」兩 sub-tab（薄殼·ECN/NPI 共用·blk2/blk3 內容零改）
  const subTab = App._bomSubTab === 'detail' ? 'detail' : 'settle';
  const stbtn = (id, name, cue) => '<button class="bom-subtab' + (subTab === id ? ' on' : '') + '" onclick="App._bomSetSubTab(\'' + id + '\')">' + name + '<span class="cue">' + cue + '</span></button>';
  const subtabsBar = '<div class="bom-subtabs">' + stbtn('settle', '結算', '值不值 · 財務結論') + stbtn('detail', '明細', '改了哪些料') + '</div>';
  const pane = subTab === 'detail' ? lockWrap(blk2) : (bomHead + blk3);
  return '<div class="bom-wrap">' + cinfo + stickyHtml + subtabsBar + '<div class="bom-subpane">' + pane + '</div></div>';
};
// 單一差異區（可收合；常駐顯示——空區也列出，規則16）
App._bomZoneHtml = function(proj, z) {
  App._bomZoneOpen = App._bomZoneOpen || {};
  const open = App._bomZoneOpen[z.kind] !== false;
  const rows = (proj.bomRows || []).filter(r => r.changeKind === z.kind);
  const zSum = rows.filter(r => r.includeInTarget !== false).reduce((a, r) => a + App._bomDiff(r), 0);
  // §19.6.2：NPI＝世代差異（收掉切換/庫存/呆滯欄·新品無舊料報廢）；ECN＝設變（保留三欄）
  const npi = !proj.ecnType;
  const zName = npi ? ({ add: '新增', del: '刪除', rev: '改量 · 換料', priceOnly: '同料跨代價差' })[z.kind] : z.name;
  const zSub = npi ? ({ add: '這代新拉的料', del: '這代取消的料', rev: '規格／用量調整、替代料', priceOnly: '同料號、同用量、只單價不同（供應商報價變動）' })[z.kind] : z.sub;
  const heads = (npi ? {
    add: ['納入', '品號', '新 價×量', '價差', ''],
    del: ['納入', '品號', '舊 價×量', '價差', ''],
    rev: ['納入', '品號 A', '替代 B', '舊 價×量', '新 價×量', '價差', ''],
    priceOnly: ['納入', '品號（同料·同量）', '量', '舊單價', '新單價', '價差×量', ''],
  } : {
    add: ['納入', '品號', '新 價×量', '切換', '價差', ''],
    del: ['納入', '品號', '舊 價×量', '切換', '庫存', '呆滯', ''],
    rev: ['納入', '品號 A', '替代 B', '舊 價×量', '新 價×量', '價差', '切換', '庫存', '呆滯', ''],
    priceOnly: ['納入', '品號（同料·同量）', '量', '舊單價', '新單價', '價差×量', ''],
  })[z.kind];
  const inp = (r, f, w) => '<input class="bom-in ' + (w || '') + '" type="' + (f === 'partNoA' || f === 'replacePartNoB' ? 'text' : 'number') + '" value="' + U.esc(r[f] != null ? String(r[f]) : '') + '" onchange="App._bomRowSet(\'' + proj.id + '\',\'' + r.id + '\',\'' + f + '\',this.value)">';
  const pq = (r, pf, qf) => '<span class="bom-pq">' + inp(r, pf, 'n') + '×' + inp(r, qf, 'n') + '</span>';
  const sw = r => '<select class="bom-sw ' + (r.switchMode === 'immediately' ? 'imm' : 'run') + '" onchange="App._bomRowSet(\'' + proj.id + '\',\'' + r.id + '\',\'switchMode\',this.value)">' +
    '<option value="running"' + (r.switchMode !== 'immediately' ? ' selected' : '') + '>漸進</option>' +
    '<option value="immediately"' + (r.switchMode === 'immediately' ? ' selected' : '') + '>即刻</option></select>';
  const chk = r => '<input type="checkbox" ' + (r.includeInTarget !== false ? 'checked ' : '') + 'onchange="App._bomRowSet(\'' + proj.id + '\',\'' + r.id + '\',\'includeInTarget\',this.checked)">';
  const del = r => '<button class="bom-x" title="刪除此行" onclick="App._bomRowDel(\'' + proj.id + '\',\'' + r.id + '\')">×</button>';
  const dcell = r => { const d = App._bomDead(r); return d > 0 ? '<b class="bom-deadv">' + App._bomMoney(d) + '</b>' : '—'; };
  const diff = r => { const d = App._bomDiff(r); return '<b class="' + (d > 0 ? 'up' : 'dn') + '">' + App._bomFmt(d) + '</b>'; };
  const tds = r => {
    if (npi) {   // §19.6.2 NPI：無 sw/stock/dead cell
      if (z.kind === 'add') return [chk(r), inp(r, 'partNoA', 'w'), pq(r, 'newPrice', 'newQty'), diff(r), del(r)];
      if (z.kind === 'del') return [chk(r), inp(r, 'partNoA', 'w'), pq(r, 'oldPrice', 'oldQty'), diff(r), del(r)];
      if (z.kind === 'rev') return [chk(r), inp(r, 'partNoA', 'w'), inp(r, 'replacePartNoB', 'w'), pq(r, 'oldPrice', 'oldQty'), pq(r, 'newPrice', 'newQty'), diff(r), del(r)];
      return [chk(r), inp(r, 'partNoA', 'w'), inp(r, 'newQty', 'n'), inp(r, 'oldPrice', 'n'), inp(r, 'newPrice', 'n'), diff(r), del(r)];
    }
    if (z.kind === 'add') return [chk(r), inp(r, 'partNoA', 'w'), pq(r, 'newPrice', 'newQty'), sw(r), diff(r), del(r)];
    if (z.kind === 'del') return [chk(r), inp(r, 'partNoA', 'w'), pq(r, 'oldPrice', 'oldQty'), sw(r), inp(r, 'stockQty', 'n'), dcell(r), del(r)];
    if (z.kind === 'rev') return [chk(r), inp(r, 'partNoA', 'w'), inp(r, 'replacePartNoB', 'w'), pq(r, 'oldPrice', 'oldQty'), pq(r, 'newPrice', 'newQty'), diff(r), sw(r), inp(r, 'stockQty', 'n'), dcell(r), del(r)];
    return [chk(r), inp(r, 'partNoA', 'w'), inp(r, 'newQty', 'n'), inp(r, 'oldPrice', 'n'), inp(r, 'newPrice', 'n'), diff(r), del(r)];   // priceOnly：量共用 newQty（同量）
  };
  const body = rows.length
    ? rows.map(r => '<tr>' + tds(r).map(c => '<td>' + c + '</td>').join('') + '</tr>').join('')
    : '<tr><td colspan="' + heads.length + '" class="bom-empty">此區尚無差異行（用「＋手動輸入」建立，或等差異比對自動帶入）</td></tr>';
  const allChk = rows.length && rows.every(r => r.includeInTarget !== false);
  return '<div class="bom-zone">' +
    '<div class="bom-zhead" onclick="App._bomZoneToggle(\'' + z.kind + '\')">' +
      '<span class="bom-zchev">' + (open ? '▾' : '▸') + '</span><b>' + zName + '</b><span class="bom-zcnt">' + rows.length + ' 項</span>' +
      (zSub ? '<span class="bom-zsub">' + zSub + '</span>' : '') +
      (rows.length ? '<label class="bom-zall" onclick="event.stopPropagation()"><input type="checkbox" ' + (allChk ? 'checked ' : '') + 'onchange="App._bomZoneAll(\'' + proj.id + '\',\'' + z.kind + '\',this.checked)">整區納入</label>' : '') +
      '<span class="bom-zsum ' + (zSum > 0 ? 'up' : 'dn') + '">' + (rows.length ? App._bomFmt(zSum) : '') + '</span></div>' +
    (open ? '<div class="bom-zscroll"><table class="bom-tbl"><thead><tr>' + heads.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + body + '</tbody></table></div>' +
      (z.kind === 'priceOnly' && rows.length ? '<div class="bom-znote">' + (npi ? '同料號、同用量、只單價不同（供應商跨代報價變動），可整批或逐行決定是否納入成本比對。' : '同料號、同用量、只單價不同（採購談降價）＝採購 performance，非設變本體，可整批或逐行決定是否納入。') + '</div>' : '') : '') +
  '</div>';
};
// ── handlers：全部直寫 proj ＋ Storage.save ＋ 重繪（tab 停留 B）──
// §19.5 Tab B closed 鎖：ECN 結案＝整案唯讀（Tab A 已鎖 .ecn-tbl-locked，此為 BOM 頁寫入 handler 保底；NPI 無結案概念天然放行；匯出/折疊不擋）
App._bomGuard = function(projId) {
  const p = App.getProj(projId);
  if (p && p.ecnType && App._ecnLocked(p)) { U.toast('已結案（唯讀）——如需變更請點右上「翻案重啟」', 'warning'); return true; }
  return false;
};
App._bomSet = function(projId, field, val) {
  if (App._roGuard()) return;
  if (App._bomGuard(projId)) return;
  const p = App.getProj(projId); if (!p) return;
  App._bomEnsure(p);
  if (field === 'ot_mold') p.oneTimeCost.mold = parseFloat(val) || 0;
  else if (field === 'ot_cert') p.oneTimeCost.cert = parseFloat(val) || 0;
  else if (field === 'bomQuoteCurrency' || field === 'bomBaseCurrency' || field === 'roiType') p[field] = val;
  else p[field] = parseFloat(val) || 0;
  // §19.6.2 fix：多機種 NPI 的 目標成本/售價/年產 寫回當前機種（否則各機種共用專案層值·切走即遺失·算不出各自損益）
  if (p.bomModels && p.bomModels[p.bomModelIdx] && (field === 'targetUnitCost' || field === 'unitSellPrice' || field === 'annualVolume' || field === 'targetSavePerUnit')) {
    p.bomModels[p.bomModelIdx][field] = p[field];
  }
  Store.projects.save();
  App._bomRerender(p);
};
App._bomRowSet = function(projId, rowId, field, val) {
  if (App._roGuard()) return;
  if (App._bomGuard(projId)) return;
  const p = App.getProj(projId); if (!p) return;
  const r = (p.bomRows || []).find(x => x.id === rowId); if (!r) return;
  if (field === 'includeInTarget') r.includeInTarget = !!val;
  else if (field === 'partNoA' || field === 'replacePartNoB' || field === 'switchMode') r[field] = val;
  else { r[field] = parseFloat(val) || 0; if (r.changeKind === 'priceOnly' && field === 'newQty') r.oldQty = r.newQty; }   // priceOnly 同量連動
  App._bomSyncDead(p);
  Store.projects.save();
  App._bomRerender(p);
};
App._bomRowDel = function(projId, rowId) {
  if (App._roGuard()) return;
  if (App._bomGuard(projId)) return;
  const p = App.getProj(projId); if (!p) return;
  p.bomRows = (p.bomRows || []).filter(x => x.id !== rowId);
  App._bomSyncDead(p);
  Store.projects.save();
  App._bomRerender(p);
};
App._bomZoneToggle = function(kind) {
  App._bomZoneOpen = App._bomZoneOpen || {};
  App._bomZoneOpen[kind] = App._bomZoneOpen[kind] === false;
  const p = App.getProj(App.currentProjectId); if (p) App._bomRerender(p);
};
App._bomZoneAll = function(projId, kind, checked) {
  if (App._roGuard()) return;
  if (App._bomGuard(projId)) return;
  const p = App.getProj(projId); if (!p) return;
  (p.bomRows || []).forEach(r => { if (r.changeKind === kind) r.includeInTarget = checked; });
  Store.projects.save();
  App._bomRerender(p);
};
App._bomSyncDead = function(p) { App._bomEnsure(p); p.oneTimeCost.deadStock = (p.bomRows || []).reduce((a, r) => a + App._bomDead(r), 0); };

// §21.16.7 跨模組商情變更提示：BOM 用到的料號·料號主檔現價 ≠ BOM 記錄「新價」→ 偵測＋一鍵套用（同基準幣假設·比照 §21.17）
App._bomDriftPart = function(r) {   // BOM 列對應「新狀態」的料號（替換取新料·刪除無新狀態）
  if (!r || r.changeKind === 'del') return '';
  if (r.changeKind === 'rev') return String(r.replacePartNoB || '').trim() || String(r.partNoA || '').trim();
  return String(r.partNoA || '').trim();
};
App._bomPriceDrift = function(proj) {
  const parts = (typeof DATA !== 'undefined' && DATA.parts) || [];
  if (!parts.length || !proj || !(proj.bomRows || []).length) return [];
  const seen = {}, out = [];
  proj.bomRows.forEach(function (r) {
    const pn = App._bomDriftPart(r); if (!pn || seen[pn]) return;
    const mp = parts.find(function (p) { return p.partNo === pn; }); if (!mp) return;
    const master = parseFloat(mp.unitPrice) || 0; if (master <= 0) return;
    const bomPrice = parseFloat(r.newPrice) || 0;
    if (Math.abs(master - bomPrice) < 0.005) return;
    seen[pn] = 1;
    out.push({ rowId: r.id, partNo: pn, bomPrice: bomPrice, masterPrice: master, vendor: mp.vendor || '', diff: master - bomPrice });
  });
  return out;
};
App._bomDriftDetail = function(projId) {
  const p = App.getProj(projId); if (!p) return;
  const drift = App._bomPriceDrift(p);
  if (!drift.length) { U.toast('目前無單價差異'); return; }
  const base = p.bomBaseCurrency || '';
  const rows = drift.map(function (d) {
    return '<tr><td class="dq-lead">' + U.esc(d.partNo) + '</td><td>' + (U.esc(d.vendor) || '—') + '</td><td class="r">' + App._bomMoney(d.bomPrice) + '</td><td class="r">' + App._bomMoney(d.masterPrice) + '</td><td class="r"><b class="' + (d.diff > 0 ? 'up' : 'dn') + '">' + App._bomFmt(d.diff) + '</b></td></tr>';
  }).join('');
  App.openModal({ title: '主檔商情 vs BOM 記錄價', wide: true,
    body: '<div class="drift-box"><div class="drift-note">下列料號的料號主檔最新單價與目前 BOM 記錄的新價不同（同基準幣 ' + (U.esc(base) || '—') + ' 比較）。「一鍵套用」會把主檔價寫進 BOM 的「新價」欄並重算成本／毛利。</div>' +
      '<div class="dq-scroll"><table class="dq-mx drift-tbl"><thead><tr><th class="dq-lead">料號</th><th>廠商</th><th class="r">BOM 記錄價</th><th class="r">主檔最新價</th><th class="r">差額</th></tr></thead><tbody>' + rows + '</tbody></table></div></div>',
    footer: '<div style="flex:1"></div><button class="btn-ghost" onclick="App.closeModal()">關閉</button><button class="bxb-cta" onclick="App._bomApplyMasterPrices(\'' + projId + '\')">一鍵套用最新成本</button>' });
};
App._bomApplyMasterPrices = function(projId) {
  if (App._roGuard && App._roGuard()) return;
  if (App._bomGuard(projId)) return;
  const p = App.getProj(projId); if (!p) return;
  const drift = App._bomPriceDrift(p);
  if (!drift.length) { U.toast('目前無單價差異'); return; }
  App.confirmModal({ title: '套用主檔最新成本？', msg: '將把 ' + drift.length + ' 筆料號的主檔最新單價寫進本案 BOM 的「新價」，並重算成本與毛利（改了無法還原先前值）。', okText: '確認套用', cancelText: '再想想',
    onConfirm: function () {
      const byId = {}; drift.forEach(function (d) { byId[d.rowId] = d.masterPrice; });
      (p.bomRows || []).forEach(function (r) { if (byId[r.id] != null) r.newPrice = byId[r.id]; });
      App._bomSyncDead(p);
      Store.projects.save();
      App.closeModal();
      App._bomRerender(p);
      U.toast('✓ 已套用 ' + drift.length + ' 筆最新成本 · 已重算成本／毛利');
    } });
};
// ＋手動輸入：選差異區 → 建空行、行內直接填（M 檔彈窗、選項卡）
App._bomAddManual = function(projId) {
  if (App._roGuard()) return;
  if (App._bomGuard(projId)) return;
  App.openModal({
    title: '手動輸入差異行 — 選差異類型',
    body: '<div class="bom-pick">' + App._BOM_ZONES.map(z =>
      '<button class="bom-pick-btn" onclick="App._bomCreateRow(\'' + projId + '\',\'' + z.kind + '\')"><b>' + z.name + '</b><span>' +
      ({ add: '料號只在新版（增料）', del: '料號只在舊版（刪料，呆滯大來源）', rev: '同料改量／A 換 B 替代料', priceOnly: '同料同量、只單價變（採購降價）' })[z.kind] +
      '</span></button>').join('') + '</div><div class="field-hint">建立後直接在該區行內填品號/價量/切換/庫存；「納入」預設勾選。' +
      ((((App.getProj(projId) || {}).bomModels || []).length) ? '多機種模式：寫入「檢視機種明細」目前選中的機種。' : '') + '</div>',
    footer: '<button class="tb-action ghost" onclick="App.closeModal()">取消</button>',
  });
};
App._bomCreateRow = function(projId, kind) {
  if (App._bomGuard(projId)) return;
  const p = App.getProj(projId); if (!p) return;
  App._bomEnsure(p);
  p.bomRows.push({ id: U.id(), changeKind: kind, partNoA: '', replacePartNoB: '', oldPrice: 0, oldQty: kind === 'add' ? 0 : 1, newPrice: 0, newQty: kind === 'del' ? 0 : 1, switchMode: 'running', stockQty: 0, includeInTarget: true, approveStatus: '' });
  App._bomZoneOpen = App._bomZoneOpen || {};
  App._bomZoneOpen[kind] = true;
  Store.projects.save();
  App.closeModal();
  App._bomRerender(p);
};
// ── 波3：匯出精靈（Paul 2026-07-04 定）：①BOM 呈現模式 ②欄位勾選（30~50 原始欄常大半用不到，記住上次選擇）→ 雙 sheet 匯出 ──
App._bomExportWizard = function(projId) {
  const p = App.getProj(projId); if (!p) return;
  if (!p.bomSheets || !p.bomSheets.new || !p.bomSheets.old) {
    U.toast('⚠ 尚無完整 BOM 資料——先「匯入舊版＋匯入新版 → 差異比對」，之後隨時可匯出', 'warning'); return;
  }
  const headers = p.bomSheets.new.grid[0] || [];
  const saved = p.bomExportCols ? p.bomExportCols.slice() : null;   // 上次勾選（存表頭字面；null＝沒選過→全勾）
  // 消耗式比對（審查修正）：ERP 表頭常重複（如兩個「說明」）——第 N 個重複對第 N 筆記錄，逐一劃掉才不會全被勾回
  const isOn = h => { if (!saved) return true; const k = saved.indexOf(String(h)); if (k === -1) return false; saved.splice(k, 1); return true; };
  this.openModal({
    wide: true,
    title: '匯出 BOM · ROI — 選呈現模式與欄位',
    body: '<div class="bxw">' +
      '<div class="imap-sect">① BOM 分頁呈現模式</div>' +
      '<div class="bom-pick">' +
        '<button class="bom-pick-btn bxw-mode on" data-mode="compare" onclick="App._bxwMode(this)"><b>對照模式（標準作法）</b><span>以舊版全表為底：舊料灰底、新料黃底插在所屬位置下方，不刪舊料、自行比對</span></button>' +
        '<button class="bom-pick-btn bxw-mode" data-mode="replace" onclick="App._bxwMode(this)"><b>替換模式</b><span>以新版全表為準：變更列黃底、舊料不顯示</span></button>' +
      '</div>' +
      '<div class="imap-sect">② 成本差異明細呈現方式</div>' +
      '<div class="bom-pick">' +
        '<button class="bom-pick-btn bxw-dl' + (p.bomDiffLayout !== 'raw' ? ' on' : '') + '" data-dl="curated" onclick="App._bxwDlayout(this)"><b>系統建議 · 精簡對照（較好閱讀）</b><span>剔除來源重複的單價/用量/金額欄，改用「舊用量｜新用量、舊單價｜新單價」成對並排，一眼看懂差異</span></button>' +
        '<button class="bom-pick-btn bxw-dl' + (p.bomDiffLayout === 'raw' ? ' on' : '') + '" data-dl="raw" onclick="App._bxwDlayout(this)"><b>維持原欄位 · 後方附加</b><span>保留你在下方勾選的所有原始欄位，ROI 欄（舊/新單價·用量·價差）附加在最後（舊行為）</span></button>' +
      '</div>' +
      '<div class="imap-sect">③ 要保留的欄位（' + headers.length + ' 欄，ERP 帶出的用不到就取消勾）' +
        '<span class="bxw-all"><a onclick="App._bxwAll(true)">全選</a>｜<a onclick="App._bxwAll(false)">全不選</a></span></div>' +
      '<div class="bxw-cols">' + headers.map((h, i) => h == null || String(h).trim() === '' ? '' :
        '<label class="bxw-col"><input type="checkbox" class="bxw-chk" value="' + i + '"' + (isOn(h) ? ' checked' : '') + '> ' + U.esc(toTrad(String(h))) + '</label>').join('') + '</div>' +
      '<div class="field-hint">勾選的欄位將套用至匯出的 Excel 報表，黃底輸入格會自動計算。勾選會記住，下次直接匯。</div>' +
    '</div>',
    footer: '<button class="tb-action ghost" onclick="App.closeModal()">取消</button>' +
      '<button class="tb-action" onclick="App._bxwGo(\'' + projId + '\')">匯出 Excel</button>',
  });
};
App._bxwMode = function(btn) {
  document.querySelectorAll('.bxw-mode').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
};
App._bxwDlayout = function(btn) {
  document.querySelectorAll('.bxw-dl').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
};
App._bxwAll = function(on) { document.querySelectorAll('.bxw-chk').forEach(c => { c.checked = on; }); };
App._bxwGo = function(projId) {
  const p = App.getProj(projId); if (!p) return;
  const mode = (document.querySelector('.bxw-mode.on') || {}).dataset ? document.querySelector('.bxw-mode.on').dataset.mode : 'compare';
  const diffLayout = (document.querySelector('.bxw-dl.on') || {}).dataset ? document.querySelector('.bxw-dl.on').dataset.dl : 'curated';
  const colIdx = [...document.querySelectorAll('.bxw-chk')].filter(c => c.checked).map(c => parseInt(c.value, 10));
  if (!colIdx.length) { U.toast('⚠ 至少勾選一個欄位', 'warning'); return; }
  const headers = p.bomSheets.new.grid[0] || [];
  p.bomExportCols = colIdx.map(i => String(headers[i]));   // 記住＝存表頭字面（欄序變了仍對得上）
  p.bomDiffLayout = diffLayout;                            // 記住成本差異明細呈現方式（curated/raw）
  Store.projects.save();
  App.closeModal();
  App.exportBomRoi(p, { mode, colIdx, diffLayout });
};

// §19.6.1 整機加總基準精靈（判不出或想覆蓋自動判斷時手動指定；同 §13.7「自動判＋疑慮跳精靈＋記住」哲學）
App._bomWholeWizard = function(projId) {
  if (App._bomGuard(projId)) return;
  const p = App.getProj(projId); if (!p) return;
  const bs = p.bomSheets;
  if (!bs || !bs.new || !bs.new.grid) { U.toast('⚠ 先匯入舊/新版並「差異比對」，才有完整 BOM 可設定加總基準', 'warning'); return; }
  const headers = bs.new.grid[0] || [];
  const opts = headers.map(h => (h == null || String(h).trim() === '') ? '' : '<option value="' + U.esc(String(h)) + '">' + U.esc(toTrad(String(h))) + '</option>').join('');
  const cur = p.bomWholeMethod || '';
  const wc = p.bomWholeCols || {};
  App._bwmMethod = cur;
  const selHtml = (id, label, val) => '<div class="bom-cfield"><label>' + label + '</label><select id="' + id + '"><option value="">— 自動偵測 / 不指定 —</option>' +
    headers.map(h => (h == null || String(h).trim() === '') ? '' : '<option value="' + U.esc(String(h)) + '"' + (String(val || '') === String(h) ? ' selected' : '') + '>' + U.esc(toTrad(String(h))) + '</option>').join('') + '</select></div>';
  const mbtn = (mk, title, desc) => '<button class="bom-pick-btn' + (cur === mk ? ' on' : '') + '" data-wm="' + mk + '" onclick="App._bwmPick(this)"><b>' + title + '</b><span>' + desc + '</span></button>';
  App.openModal({
    title: '整機總額計算基準 — 選葉節點認定方式',
    body: '<div class="field-hint">不同 BOM 檔結構不一。系統預設<b>自動判斷</b>（有階次欄→取無子件的葉節點；否則材料類別 M 料）。判不準或想改基準時在此手動指定，選擇會記住隨專案同步。</div>' +
      '<div class="bom-pick">' +
        mbtn('', '自動偵測', '階次欄優先 → 材料類別；判不出會提示手動') +
        mbtn('level', '依階次葉節點', '取「下一列階次未更深」的無子件料號，Σ 單價×用量') +
        mbtn('matCat', '依材料類別', '只加總「材料/採購件（M）」列，排除組合/加工品（A）') +
        mbtn('sumAll', '全部料加總', '不判階層，所有料號 Σ 單價×用量（結構單純時用）') +
        mbtn('topRow', '用金額欄頂列', 'BOM 頂層已滾算總成本時，直接取指定金額欄第一列') +
      '</div>' +
      '<div class="bom-wm-cols">' + selHtml('bwm-level', '階次欄（依階次葉節點時可指定）', wc.level) + selHtml('bwm-matcat', '材料類別欄（依材料類別時可指定）', wc.matCat) + selHtml('bwm-amount', '金額欄（用金額欄頂列時指定）', wc.amount) + '</div>' +
      '<div class="field-hint">未指定欄位＝沿用系統自動偵測到的欄；找不到才需在此手動選。</div>',
    footer: '<button class="tb-action ghost" onclick="App.closeModal()">取消</button>' +
      '<button class="tb-action" onclick="App._bomWholeApply(\'' + projId + '\')">套用</button>',
  });
};
App._bwmPick = function(btn) { document.querySelectorAll('.bom-pick-btn[data-wm]').forEach(b => b.classList.remove('on')); btn.classList.add('on'); App._bwmMethod = btn.dataset.wm; };
App._bomWholeApply = function(projId) {
  if (App._roGuard()) return;
  if (App._bomGuard(projId)) return;
  const p = App.getProj(projId); if (!p) return;
  p.bomWholeMethod = App._bwmMethod || null;
  const gv = id => { const e = document.getElementById(id); return e && e.value ? e.value : null; };
  const cols = { level: gv('bwm-level'), matCat: gv('bwm-matcat'), amount: gv('bwm-amount') };
  p.bomWholeCols = (cols.level || cols.matCat || cols.amount) ? cols : null;
  Store.projects.save();
  App.closeModal();
  App._bomRerender(p);
};

// Tab C：版本歷史＝事件時間軸（讀 ecnEvents，§19.10 B.1 第4點）
App._ecnTabCHtml = function(proj) {
  const ev = proj.ecnEvents || [];
  if (!ev.length) return '<div class="ecn-ph"><div class="ecn-ph-ico">🕓</div><b>事件時間軸</b><p>尚無事件紀錄。</p></div>';
  return '<div class="ecn-timeline">' + ev.map(e =>
    '<div class="ecn-tl-item"><span class="ecn-tl-dot"></span><span class="ecn-tl-date">' + U.esc(e.date || '') + '</span>' +
    '<span class="ecn-tl-label">' + U.esc(e.label || e.type || '') + '</span>' +
    (e.cause ? '<span class="ecn-tl-cause">' + U.esc(e.cause) + '</span>' : '') + '</div>'
  ).join('') + '</div>';
};
