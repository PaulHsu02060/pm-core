// template.js — 範本套用引擎(applyTemplate/_reschedulePreview/_computeSlack)+ 路線B 建立流程 + Stage2(_s1/_s2/_ovf)+ 部門 component(buildDeptRowsHtml/deptUI/deleteProject)。app.js(app-core)之後載入。docs §18.7.2。
// ═══ 範本套用引擎（§8d.6）═══════════════════════════════════
// _reschedulePreview：applyTemplate ⑧+6b 抽出的純排程段，供 applyTemplate 與 _s2SetDuration 共用。
// 直接 mutate tasks[].plannedStart/End（純資料層，不碰 DOM/Storage）；warnings 由呼叫端傳入收集。
App._reschedulePreview = function(tasks, variants, warnings) {
  const variantStart = {}, variantEnd = {}, variantDir = {};
  variants.forEach(v => {
    variantStart[v.id] = v.schedule.startDate || '';
    variantEnd[v.id] = v.schedule.endDate || '';
    variantDir[v.id] = v.schedule.direction || 'forward';
  });
  // 每案有效方向：複用 App._effScheduleDir 單一真實來源（§4.8.7.2/.3），與燈號 slackOf 共用，防判定漂移。
  const effDir = (vid) => App._effScheduleDir(variantStart[vid], variantEnd[vid], variantDir[vid]);

  // 6b 溢出偵測（per 案別 computedEnd=max(plannedEnd) vs 設定結束日），只對 forward 案有意義
  const detectOverflow6b = (vid, vname) => {
    const endLimit = variantEnd[vid];
    if (!endLimit) return;
    const vts = tasks.filter(t => t.variant === vid && t.plannedEnd);
    if (!vts.length) return;
    let binding = vts[0];
    vts.forEach(t => { if (t.plannedEnd > binding.plannedEnd) binding = t; });
    const computedEnd = binding.plannedEnd;
    if (computedEnd > endLimit) {
      const overDays = Math.max(0, D.workdaysBetween(endLimit, computedEnd) - 1);
      warnings.push('「' + vname + '」排程溢出：最晚「' + binding.name + '」需排到 ' + computedEnd +
        '，超過設定結束日 ' + endLimit + '（約 ' + overDays + ' 工作天）');
    }
  };

  // 方案 B：所有案皆 forward → 走原單次正推 path（行為與舊版逐字等價）。
  if (variants.every(v => effDir(v.id) === 'forward')) {
    tasks.forEach(t => { if (!t.predecessor) t.plannedStart = variantStart[t.variant] || ''; });
    const sch = computeSchedule(tasks);
    const schById = new Map();
    sch.results.forEach(r => schById.set(r.taskId, r));
    tasks.forEach(t => {
      const r = schById.get(t.id);
      if (r && r.suggestedStart) { t.plannedStart = r.suggestedStart; t.plannedEnd = r.suggestedEnd; }
      else { t.plannedStart = ''; t.plannedEnd = ''; warnings.push('「' + t.name + '」未能排入（無起算日或循環依賴）'); }
    });
    variants.forEach(v => detectOverflow6b(v.id, v.name));
    return;
  }

  // 任一案非 forward → 逐案依方向分派（範本零跨案邊，子集排程與全陣列等價）。
  variants.forEach(v => {
    const vid = v.id;
    const vtasks = tasks.filter(t => t.variant === vid);
    if (!vtasks.length) return;
    const dir = effDir(vid);

    if (dir === 'forward') {
      vtasks.forEach(t => { if (!t.predecessor) t.plannedStart = variantStart[vid] || ''; });
      const sch = computeSchedule(vtasks);
      const m = new Map(); sch.results.forEach(r => m.set(r.taskId, r));
      vtasks.forEach(t => {
        const r = m.get(t.id);
        if (r && r.suggestedStart) { t.plannedStart = r.suggestedStart; t.plannedEnd = r.suggestedEnd; }
        else { t.plannedStart = ''; t.plannedEnd = ''; warnings.push('「' + t.name + '」未能排入（無起算日或循環依賴）'); }
      });
      detectOverflow6b(vid, v.name);
      return;
    }

    // backward / interval：seed targetEnd(transient) → 反推 → 映射 lateStart/lateFinish→plannedStart/End
    const endDate = variantEnd[vid];
    let sch;
    try {
      vtasks.forEach(t => { t.targetEnd = endDate; });
      sch = computeScheduleBackward(vtasks);
    } finally {
      vtasks.forEach(t => { delete t.targetEnd; });   // transient seed：無條件清，不隨建立落地
    }
    const m = new Map(); sch.results.forEach(r => m.set(r.taskId, r));
    vtasks.forEach(t => {
      const r = m.get(t.id);
      // ★ 映射轉換（最大技術風險）：反推吐 lateStart/lateFinish，這張圖讀 plannedStart/plannedEnd
      if (r && r.lateStart != null) { t.plannedStart = r.lateStart; t.plannedEnd = r.lateFinish; }
      else { t.plannedStart = ''; t.plannedEnd = ''; warnings.push('「' + t.name + '」未能排入（無目標可販日或循環依賴）'); }
    });

    if (dir === 'interval') {
      const slack = App._computeSlack(sch.results, variantStart[vid], endDate);
      if (slack && slack.light === 'red') {
        warnings.push('「' + v.name + '」時間不足：最快 ' + slack.earliestFinish +
          ' 完成，超出結束日 ' + endDate + ' 約 ' + slack.overDays + ' 工作天');
      }
    }
  });
};

// _computeSlack(results, startDate, endDate)：interval 餘裕 + 三級燈號（§4.8.7.4，純函式 [CORE]）。
//   可用工作天 = workdaysBetween(start,end)；需要工作天 = 關鍵路徑(最長依賴鏈) = workdaysBetween(min lateStart, max lateFinish)；
//   餘裕 = 可用 - 需要；燈號 ≥5 綠 / 0~4 黃 / <0 紅；紅燈附 earliestFinish(從 start 順推 needed) + overDays。
//   start/end 任一缺 → 回 null（非 interval，不顯示燈號）。
App._computeSlack = function(results, startDate, endDate) {
  if (!startDate || !endDate) return null;
  let minStart = null, maxFinish = null;
  (results || []).forEach(r => {
    if (r.lateStart != null && (minStart === null || r.lateStart < minStart)) minStart = r.lateStart;
    if (r.lateFinish != null && (maxFinish === null || r.lateFinish > maxFinish)) maxFinish = r.lateFinish;
  });
  const available = D.workdaysBetween(startDate, endDate);
  const needed = (minStart && maxFinish) ? D.workdaysBetween(minStart, maxFinish) : 0;
  const slack = available - needed;
  const light = slack >= 5 ? 'green' : (slack >= 0 ? 'yellow' : 'red');
  const earliestFinish = needed > 0 ? D.fmt(D.addWorkdays(startDate, needed - 1), 'iso') : '';
  const overDays = slack < 0 ? Math.max(0, D.workdaysBetween(endDate, earliestFinish) - 1) : 0;
  return { available, needed, slack, light, earliestFinish, overDays };
};

// _effScheduleDir(startDate, endDate, direction)：三模式有效方向單一真實來源（§4.8.7.2/.3＋§4.8.7.4b A 自動判定）。
//   開始+結束→interval；只結束→backward（倒推）；只開始→forward（順推）；皆空→沿用 direction 下拉（預設 forward）。
//   _reschedulePreview 與燈號／動態提示共用，防判定漂移。
App._effScheduleDir = function(startDate, endDate, direction) {
  if (startDate && endDate) return 'interval';
  if (endDate) return 'backward';
  if (startDate) return 'forward';
  return direction === 'backward' ? 'backward' : 'forward';
};

// App.applyTemplate(template, userInput)：純函式，只回傳資料、不碰 DOM/Storage（[CORE]）。
//   批1：①建專案 ②建 variants(含 schedule)+對照表 ③建 depts(ui.depts→多成員,空部門/無成員跳過)。
//   task/warnings 暫留空；步驟④~⑧(篩階段/id重產/依賴重指/排程)後批接入。
//   userInput = { projectName, color?, note,
//     cases:[{variantName,templateVariant,startDate,endDate,direction,selectedStages,stageRenames}],
//     depts:[{name,members:[{name}]}] }；cases[0]=主案。
//   templateVariant=範本來源 key（對 template.cases[].variant，如「主案」/「另案」）；無則退回 variantName。
//   ④ 跑 ui.cases（非 template.cases）：多個自訂名另案各用 templateVariant 反查同一範本來源、各生成一份。
App.applyTemplate = function(template, userInput) {
  const ui = userInput || {};

  // ① 專案物件（形狀對齊 saveProject/performWbsImport；ensurePdcaData 補 pdca）
  const project = {
    id: U.id(),
    name: (ui.projectName || '').trim(),
    color: ui.color || PROJ_COLORS[0],
    note: (ui.note || '').trim(),
    synced: false,
    createdAt: new Date().toISOString(),
    // §19.6.2 A：NPI 立案捕捉目標成本/售價——base=穩定立案基準（機種繼承源）；targetUnitCost/unitSellPrice 為工作值，先＝base，之後由 _bomActivateModel 依當前機種鏡射覆寫
    targetUnitCostBase: ui.targetUnitCostBase || 0,
    unitSellPriceBase: ui.unitSellPriceBase || 0,
    targetUnitCost: ui.targetUnitCostBase || 0,
    unitSellPrice: ui.unitSellPriceBase || 0,
  };
  ensurePdcaData(project);

  // ② variants(含 schedule) + variantNameToId 對照表（平行 depts 的 nameToId）
  const variants = [];
  const variantNameToId = {};
  (ui.cases || []).forEach(c => {
    const id = U.id();
    const name = (c.variantName || '').trim();
    variants.push({
      id, name,
      schedule: {
        startDate: c.startDate || '',
        endDate: c.endDate || '',
        direction: c.direction || 'forward',
      },
      stages: c.selectedStages ? c.selectedStages.slice() : [],
    });
    variantNameToId[name] = id;
  });

  // ③ depts（共用部門編輯元件的 ui.depts → 多成員；空部門名 / 無有效成員 → 跳過不建空部門）
  const depts = [];
  (ui.depts || []).forEach(d => {
    const name = (d.name || '').trim();
    if (!name) return;
    const members = (d.members || [])
      .map(m => (m.name || '').trim()).filter(Boolean)
      .map(nm => ({ id: U.id(), name: nm }));
    if (!members.length) return;
    depts.push({ id: U.id(), name: name, members: members });
  });

  // ④ 篩選勾選階段 + 收集 excludedNs / ⑤ id重產 / ⑦ task組裝（38欄）
  //   predecessor 暫留 raw 序號字串，批2b 才譯 id（excludedNs 斷依賴+warning）
  const roleToDeptId = {};
  depts.forEach(d => { roleToDeptId[d.name] = d.id; });
  const dailyHours = (typeof DATA !== 'undefined' && DATA.settings && DATA.settings.dailyHours) || 6;

  const tasks = [];
  // 被砍階段的 n 改「按案別」收集（variantId→Set(n)；null/通案 → 空字串 key）。
  // 同源範本兩案 n 重複，全域 Set 會跨案誤砍另案前置，故分案。
  const excludedByVariant = {};
  const variantKey = (v) => (v == null ? '' : v);
  // 跑 ui.cases（非 template.cases）：每個使用者案別用 templateVariant 反查範本來源，
  // 多個自訂名另案各生成一份（templateVariant 無則退回 variantName，向後相容舊測試）。
  (ui.cases || []).forEach(uiCase => {
    const srcKey = (uiCase.templateVariant || uiCase.variantName || '').trim();
    const tc = (template && template.cases ? template.cases : []).find(t => (t.variant || '').trim() === srcKey);
    if (!tc) return;   // 找不到對應範本來源 → 不生成（§8d.4 另案不選則不建）
    const variantId = variantNameToId[(uiCase.variantName || '').trim()] || null;
    const selected = uiCase.selectedStages || null;
    (tc.modules || []).forEach(mod => {
      const included = !selected || selected.indexOf(mod.stage) >= 0;
      (mod.tasks || []).forEach(tk => {
        if (!included) {
          const _vk = variantKey(variantId);
          (excludedByVariant[_vk] || (excludedByVariant[_vk] = new Set())).add(tk.n);
          return;
        }
        tasks.push({
          id: U.id(),
          project: project.id,
          wbs: tk.n,
          parentWbsId: '',
          name: tk.name || '',
          desc: mod.stage ? (mod.stage + ' / ' + (tk.subgroup || '')) : (tk.subgroup || ''),
          category: (tk.type || '').indexOf('里程碑') >= 0 ? 'meeting' : 'deep',
          taskType: tk.type || '任務',
          predecessor: tk.predecessor || '',
          durationDays: tk.durationDays,
          owner: '',
          dept: roleToDeptId[(tk.role || '').trim()] || '',
          role: (tk.role || '').trim(),   // §4.8.7.4b Stage2 New：留範本角色，供部門彈窗「儲存並套用」時 role→dept 重映射（不重跑 applyTemplate 即可保留手改）
          variant: variantId,
          start: '',
          end: '',
          plannedStart: '',
          plannedEnd: '',
          actualStart: '',
          actualEnd: '',
          progress: 0,
          status: 'pending',
          urgency: 'med',
          estHours: parseFloat(tk.durationDays || 0) * dailyHours || 4,
          method: '',
          canSplit: false,
          completedAt: null,
          createdAt: new Date().toISOString(),
          scheduledStart: '',
          scheduledEnd: '',
          synced: false,
          stage: mod.stage || '',
          subgroup: tk.subgroup || '',
          mustDeliver: false,
          deliverableType: '',   // §7.1（不接 UI，預設值）
          requiredTask: true,    // §7.1（預設全必要）
          mustIssue: false,      // §7.1
          deliverable: tk.deliverable || '',
          riskIssue: '',
          delivered: '',
          deliverableLink: '',
          note: '',
          effortRatio: (tk.effortRatio != null) ? tk.effortRatio : defaultEffort(mod.stage, (tk.role || '').trim() === 'PM'),   // §19.4：範本帶值優先；空值＝PM 任務帶階段標準%、非 PM 帶 100（Paul 2026-07-03）
          taskAttr: tk.taskAttr || 'baseline',                            // §19.9 baseline/conditional/fog
        });
      });
    });
  });

  // 衍生扁平 excludedNs（各案 Set 的 union）供回傳契約（test 斷言 res.excludedNs；回傳形狀不變）
  const excludedNs = [].concat(...Object.values(excludedByVariant).map(s => [...s]));

  // ⑥ 依賴重指：predecessor(raw序號) → 剝除指向被砍階段的前置(+warning) → translatePredToId 譯新id
  //   map 改「按案別」各 build 一張（variantKey→Map）：同源範本兩案 n 重複，全域單張 first-wins
  //   會讓另案前置全翻成主案 id（跨案污染）。翻譯時吃「該 task 自己 variant 的 map」（見 relinkPred）。
  const wbsToIdMapByVariant = {};
  {
    const tasksByVariant = {};
    tasks.forEach(t => { const k = variantKey(t.variant); (tasksByVariant[k] || (tasksByVariant[k] = [])).push(t); });
    Object.keys(tasksByVariant).forEach(k => { wbsToIdMapByVariant[k] = buildWbsToIdMap(tasksByVariant[k]); });
  }
  const nToName = {};
  (template && template.cases ? template.cases : []).forEach(tc => {
    (tc.modules || []).forEach(mod => {
      (mod.tasks || []).forEach(tk => { nToName[tk.n] = tk.name || ''; });
    });
  });
  const warnings = [];
  function relinkPred(rawPred, selfName, vMap, vExcluded) {
    const parts = String(rawPred || '').split(/[,，;；]/).map(p => p.trim()).filter(Boolean);
    const kept = [];
    for (const part of parts) {
      const m = part.match(/^(\d+)/);
      if (m && vExcluded && vExcluded.has(parseInt(m[1], 10))) {
        const depName = nToName[m[1]] || ('#' + m[1]);
        warnings.push('「' + selfName + '」的前置「' + depName + '」因所在階段未選，已自動移除');
        continue;
      }
      // §19.11 D 修：前置指向本案不存在的序號（範本編修刪任務留下的 dangling ref）→ 丟棄，避免 translatePredToId 保留假 id 導致下游整條斷鏈（無起算日）
      if (m && vMap && !vMap.get(String(parseInt(m[1], 10)))) {
        const depName = nToName[m[1]] || ('#' + m[1]);
        warnings.push('「' + selfName + '」的前置「' + depName + '」已不存在（範本中被刪除），已自動移除');
        continue;
      }
      kept.push(part);
    }
    return translatePredToId(kept.join(','), vMap);
  }
  tasks.forEach(t => {
    const k = variantKey(t.variant);
    t.predecessor = relinkPred(t.predecessor, t.name, wbsToIdMapByVariant[k], excludedByVariant[k]);
  });

  // ⑧ 各案別順推排程（抽共用純函式 _reschedulePreview，applyTemplate 與 _s2SetDuration 共用）
  App._reschedulePreview(tasks, variants, warnings);

  return { project, variants, variantNameToId, depts, tasks, excludedNs, warnings };
};

// ─── 路線B 建立流程 + Stage2 + _s1/_s2/_ovf + 部門 component（原 project 區後段＋5965–8272）───
// ─── 專案 KPI 卡片排(圖1 第一塊):純顯示層,讀引擎不寫回 ───
// ─── PROJECT CRUD ───
App._stagePickHtml = function(stages) {
  const _tpl = tplNpi();   // §19.11 getter：override 優先
  if (!_tpl) return '';
  const cn = {};
  (_tpl.stageDefaults || []).forEach(s => { cn[s.stage] = s.stageNameCN; });
  // 預設主案階段；另案卡餵 cases[1].stages（單一膠囊產生器，不複製兩份 HTML）
  const list = stages || (_tpl.cases[0] ? _tpl.cases[0].stages : []) || [];
  const pills = list.map(st =>
    `<button type="button" class="stage-pick on" data-stage="${st}" onclick="this.classList.toggle('on')">${cn[st] || st}</button>`
  ).join('');
  return `<div class="form-field"><label>選擇階段（不選=不建該階段）</label><div class="stage-pick-row">${pills}</div></div>`;
};

// 階段膠囊精確設定：依 selectedStages 把該卡所有 .stage-pick 設成 on/off（精確覆蓋，非 additive；_stagePickHtml 預設全 on）。
App._applyStagePicks = function(cardEl, selectedStages) {
  if (!cardEl) return;
  const want = new Set(selectedStages || []);
  cardEl.querySelectorAll('.stage-pick').forEach(b => {
    b.classList.toggle('on', want.has(b.dataset.stage));
  });
};

// 另案卡：動態 append 進 #pf-otherCases（可加 0~N 張）。膠囊餵另案範本階段 cases[1].stages。
App._tplAddOtherCase = function() {
  const box = document.getElementById('pf-otherCases');
  if (!box) return;
  const _tpl = tplNpi();
  const otherStages = (_tpl && _tpl.cases[1]) ? _tpl.cases[1].stages : undefined;
  const card = document.createElement('div');
  card.className = 'case-card case-other';
  card.dataset.case = 'other';
  card.innerHTML =
      `<div class="case-card-head">`
    +   `<div class="form-field"><label>案別名稱</label><input type="text" class="case-variant-name" placeholder="案別名稱（例：2.2kW）"></div>`
    +   `<button type="button" class="tb-action ghost case-del" onclick="this.closest('.case-card').remove()">刪除</button>`
    + `</div>`
    + `<div class="form-row">`
    +   `<div class="form-field"><label>開始日</label><input type="date" class="case-start"></div>`
    +   `<div class="form-field"><label>結束日</label><input type="date" class="case-end"></div>`
    + `</div>`
    + `<div class="form-field"><label>排程方向</label>`
    +   `<select class="case-direction"><option value="forward">順推（從開始日）</option><option value="backward">逆推（從結束日）</option></select>`
    + `</div>`
    + App._stagePickHtml(otherStages);
  box.appendChild(card);
};

// 部門編輯區 HTML（範本表單與空白專案共用，避免重複）：讀 App._tplDepts、mode=tpl。
App._deptEditorHtml = function() {
  return `        <div class="form-field"><label>部門與負責人（支援彈性增減）</label>
          <div class="dept-editor-head"><span class="dept-head-name">部門名稱</span><span class="dept-head-members">擔當姓名</span></div>
          <div class="dept-edit-list" id="deptEditorList">${App.buildDeptRowsHtml(App._tplDepts, 'tpl', null)}</div>
          <button class="tb-action ghost dept-add-btn" onclick="App.deptUI.addDept('tpl', '')">＋ 新增部門</button>
        </div>`;
};

// 第一階段表單 HTML（pf-tplBox + pf-excelBox）：抽出供新增專案 modal 共用（路線B 打底；純搬移、零行為改變）。
App._stage1FormHtml = function() {
  return `      <div id="pf-tplBox">
        <div class="form-field">
          <label>選擇範本</label>
          <select id="pf-tpl">${tplAll('npi').map(t => `<option value="${U.esc(t.templateId)}">${U.esc(t.templateName)}</option>`).join('')}</select>
        </div>
        <div class="case-card case-main" data-case="main">
          <div class="case-card-head">
            <div class="form-field">
              <label>案別名稱</label>
              <input type="text" class="case-variant-name" id="pf-mainName" placeholder="主案名稱（例：7.3kW）" value="" oninput="this.dataset.touched='1'">
              <div class="case-name-hint">已帶入專案名，可自行修改</div>
            </div>
          </div>
          <div class="form-row">
            <div class="form-field"><label>主案開始日</label><input type="date" id="pf-start" class="case-start"></div>
            <div class="form-field"><label>主案結束日</label><input type="date" id="pf-end" class="case-end"></div>
          </div>
          <div class="form-field">
            <label>排程方向</label>
            <select id="pf-direction" class="case-direction">
              <option value="forward">順推（從開始日）</option>
              <option value="backward">逆推（從結束日）</option>
            </select>
          </div>
          ${App._stagePickHtml()}
        </div>
        <div id="pf-otherCases"></div>
        <button type="button" class="tb-action ghost" onclick="App._tplAddOtherCase()">＋ 新增另案</button>
${App._deptEditorHtml()}
      </div>`;
};

// ═══ 路線B 建立流程（UI 流程層，兩步 modal）：① 選建立方式卡 → ② 填表單。B-1a 純新增、不接 openProjectDialog ═══
// ─── §19.10 ECN 範本引擎接線 ───
// _ecnTplForSize(size)：從 ECN_TEMPLATE 依 S/M/L 派生「該分級的子範本」——過濾 sizes 不含該級的任務、
//   解析 predBySize 覆寫前置（過濾＋覆寫後所有前置必指向留存任務，applyTemplate 零改動可吃）。
App._ecnTplForSize = function(size, tplId) {
  const src = tplId ? (tplResolve(tplId) || tplEcn()) : tplEcn();   // §19.11 getter：override/自訂副本優先
  if (!src) return null;
  const filterMods = (mods) => (mods || []).map(m => ({
    stage: m.stage, stageNameCN: m.stageNameCN,
    tasks: (m.tasks || [])
      .filter(tk => String(tk.sizes || 'SML').indexOf(size) >= 0)
      .map(tk => {
        const t = Object.assign({}, tk);
        if (tk.predBySize && tk.predBySize[size] != null) t.predecessor = tk.predBySize[size];
        delete t.predBySize; delete t.sizes;
        return t;
      })
  })).filter(m => m.tasks.length);
  return {
    templateId: src.templateId + '-' + size,
    templateName: src.templateName,
    stageDefaults: src.stageDefaults,
    roles: src.roles,
    sizeMeta: src.sizeMeta,
    cases: (src.cases || []).map(c => ({
      variant: c.variant,
      stages: (src.sizeMeta[size] ? src.sizeMeta[size].stages : []).slice(),
      modules: filterMods(c.modules),
    })),
  };
};
// _s1Tpl()：s1 流程使用中的範本單一取用點——ECN 模式回分級派生範本，否則回產品開發範本。
App._s1Tpl = function() {
  if (App._s1Ecn) return App._ecnTplForSize(App._s1Ecn.size, App._s1Ecn.tplId);
  return tplResolve(App._s1TplId) || tplNpi();   // §19.11：s1 頁「選擇範本」下拉選值（未選＝內建/override NPI）
};
// _flowStartEcn(size)：選型頁 ECN 卡入口——設 ECN 模式狀態、預載名冊角色、直進 s1 頁（跳過教育卡，時程說明由開案小幫手 HintBox 承載）。
App._flowStartEcn = function(size) {
  App._createFlow = { step: 1, mode: 'ecn', stage1Data: null };
  App._s1Ecn = { size: size || 'S' };
  App._s1Cases = null;   // 重置案卡（ECN 階段集與 NPI 不同）
  App.closeModal();   // ⚠ 先關（closeModal 會清 _tplDepts）——名冊種子必須在關閉之後，否則被清成空（問題1 根因）
  const _ecnT = tplEcn();
  const _roles = (_ecnT && _ecnT.roles) ? _ecnT.roles : [''];
  App._tplDepts = _roles.map(r => ({ id: U.id(), name: r, members: [{ id: U.id(), name: '' }] }));
  App._renderStage1Preview();
};
// s1 頁「上一步」：先彈資料不保留警告（本頁輸入活在 DOM、重繪即失，無備份機制——NPI/ECN 都擋誤觸），
// 確定才離開（還原 topbar＋切回原頁）再回上一動——NPI＝教育卡（其上一步再回選型頁，鏈條完整）；ECN 無教育卡＝直回選型頁。
App._s1Back = function() {
  App.confirmModal({
    icon: 'ti-alert-triangle', iconBg: '--amber-l', iconColor: '--amber-ink',
    title: '返回上一步？', msg: '本頁已填寫的資料（名稱、日期、各項設定）<b>將不會保留</b>，確定要返回？',
    okText: '返回上一步', cancelText: '留在本頁',
    onConfirm: function() {
      const tb = document.querySelector('.main > .topbar');
      if (tb) tb.classList.remove('topbar-hidden');
      App.showPage(App.currentPage || 'workspace', null);
      if (App._s1Ecn) App._flowStep1(); else App._scheduleEduCard();
    },
  });
};
// 第一步：選建立方式（範本→Excel→空白，預設範本 .on）。重置 _createFlow。
// （_s1Ecn／_s1Cases 不在此清——只在模式切換點清：NPI 入口 _flowPickMode('template')、ECN 入口 _flowStartEcn，
//   保留既有「上一步回 s1 輸入仍在」行為。）
App._flowStep1 = function() {
  App._s2EcnMode = null;   // 進 NPI/建案流程前清 ECN hijack 旗標（防 _s2RefreshCase 誤持久化到已離開的 ECN 案）
  App._createFlow = { step: 1, mode: 'template', stage1Data: null };
  App.openModal({
    title: '建立新案 · 選擇類型',
    wide: true,
    body: `<div class="wiz">
      <div class="wiz-warn"><i class="ti ti-alert-triangle wiz-warn-ic"></i><span>「新產品開發」與「工程設變」的管理重點與介面完全不同，<b>立案後無法互轉</b>，請依任務性質謹慎選擇。（設變案的 S/M/L 規模，開案後仍可隨進度調整）</span></div>
      <div class="wiz-cols">
        <div class="wiz-col wiz-npi">
          <div class="wiz-colhead"><span class="wiz-dot"></span>開發專案 · NPI</div>
          <div class="wiz-colnote">適合「從無到有」的新產品開發，提供甘特圖、WBS 與月曆等多種排程檢視。</div>
          <div class="wiz-card" onclick="App._flowPickMode('template')">
            <div class="wiz-ct"><i class="ti ti-template wiz-ci"></i><span class="wiz-cn">套用範本</span></div>
            <div class="wiz-cd">載入標準開發流程，自動帶入各部門負責人與預設工期，最快建立完整骨架。</div>
            <div class="wiz-ch">→ 產出：一般專案 Dashboard（含甘特／WBS）</div>
          </div>
          <div class="wiz-card" onclick="App._flowPickMode('excel')">
            <div class="wiz-ct"><i class="ti ti-table-import wiz-ci"></i><span class="wiz-cn">從 Excel 匯入</span></div>
            <div class="wiz-cd">上傳既有 WBS Excel，自動解析並轉為任務排程，無縫接軌。</div>
            <div class="wiz-ch">→ 產出：一般專案 Dashboard（依 Excel 長甘特）</div>
          </div>
          <div class="wiz-card" onclick="App._flowBlankChoice()">
            <div class="wiz-ct"><i class="ti ti-file wiz-ci"></i><span class="wiz-cn">空白專案</span></div>
            <div class="wiz-cd">從零開始建立，無預設流程框架，適合階段特殊或不適用標準範本的微型專案。</div>
            <div class="wiz-ch">→ 先畫時程骨架，或直接完全空白</div>
          </div>
        </div>
        <div class="wiz-col wiz-ecn">
          <div class="wiz-colhead"><span class="wiz-dot"></span>設變案 · ECN</div>
          <div class="wiz-colnote">啟用設變專屬戰情室，精準追蹤「進度落差」、「重工次數」與「成本調降效益（ROI）」。</div>
          <div class="wiz-card" onclick="App._flowEcnStart()">
            <div class="wiz-ct"><i class="ti ti-replace wiz-ci"></i><span class="wiz-cn">套用設變範本</span></div>
            <div class="wiz-cd">載入標準設變流程，啟用戰情室。<b>下一步依風險選 S／M／L 規模</b>（換料 3 階段／結構 6 階段／改模含 DR 審查·開案後仍可調）。</div>
            <div class="wiz-ch">→ 產出：ECN 戰情室（S/M/L 於下一步選）</div>
          </div>
          <div class="wiz-card" onclick="App._flowBlankSkelStart('ecn')">
            <div class="wiz-ct"><i class="ti ti-file wiz-ci"></i><span class="wiz-cn">空白設變案</span></div>
            <div class="wiz-cd">不套範本，自己劃分設變階段、抓粗工期，系統排里程碑甘特，下一步再填任務。適合非標準流程的設變案。</div>
            <div class="wiz-ch">→ 先畫時程骨架 → 檢視任務</div>
          </div>
          <div class="wiz-prot"><i class="ti ti-shield-check wiz-prot-ic"></i>防過勞機制：全級別皆強制掛載「PM 協調工時」以計算跨案負載。</div>
        </div>
      </div>
    </div>`,
    footer: `<button class="tb-action ghost" onclick="App.closeModal()">取消</button>`,
  });
};

// 點卡：記 mode、清 stage1Data，進第二步。
App._flowPickMode = function(mode) {
  if (App._createFlow) { App._createFlow.mode = mode; App._createFlow.stage1Data = null; }
  if (App._s1Ecn) { App._s1Ecn = null; App._s1Cases = null; }   // §19.10：從 ECN 模式切回 NPI → 清 ECN 狀態＋案卡（階段集不同）
  if (mode === 'template') { App._scheduleEduCard(); return; }   // §4.8.7.4b 3-7：範本走新流程（教育卡→第一階段預覽頁）；Excel/空白維持舊 _flowStep2
  App._flowStep2();
};

// 第二步（B-1a 最小佔位版）：依 mode 顯表單；顏色/備註/部門回填、_flowStage2Next 後面段接。
App._flowStep2 = function() {
  if (App._createFlow) App._createFlow.step = 2;
  const mode = App._createFlow ? App._createFlow.mode : 'template';
  // 全新進入②（非從③上一步退回）才預載標準部門 roles；stage1Data 有值=回填情境，不碰 _tplDepts（保留使用者編輯）。
  if (!App._createFlow || !App._createFlow.stage1Data) {
    if (mode === 'blank') {
      App._tplDepts = [{ id: U.id(), name: '', members: [{ id: U.id(), name: '' }] }];   // 空白專案：預載一列空部門待填
    } else {
      const _npiT = tplNpi();
      const _roles = (_npiT && _npiT.roles && _npiT.roles.length) ? _npiT.roles : [''];
      App._tplDepts = _roles.map(r => ({ id: U.id(), name: r, members: [{ id: U.id(), name: '' }] }));
    }
  }
  App.openModal({
    title: mode === 'blank' ? '新增空白專案' : '填寫專案資料',
    body: `<div class="form-field"><label>專案名稱 *</label><input type="text" id="pf-name" placeholder="e.g. ${CFG('PROJECT_INPUT_EXAMPLE','範例品項')}" oninput="App._syncMainName()"></div>
      <div class="form-field"><label>備註</label><input type="text" id="pf-note" placeholder="簡短描述"></div>
      ${mode === 'template' ? App._stage1FormHtml() : ''}
      ${mode === 'blank' ? App._deptEditorHtml() : ''}
      <div class="form-field excel-upload" style="${mode==='excel'?'':'display:none'}">
        <label>WBS Excel 檔</label>
        <label class="eu-filebtn"><i class="ti ti-table-import"></i> 選擇檔案<span id="pf-excelName" class="eu-filename">尚未選擇</span><input type="file" id="pf-excelFile" accept=".xlsx,.xls" onchange="App._flowExcelPick(event)"></label>
        <div id="pf-excelStatus" class="excel-status"></div>
        <div id="pf-excelMap" style="display:none"></div>
      </div>`,
    footer: `<button class="tb-action ghost" onclick="${mode==='blank'?'App._flowBlankChoice()':'App._flowStep1()'}">上一步</button>
      <button class="tb-action" onclick="App._flowStage2Next()">${mode==='blank'?'建立':'下一步：檢視任務'}</button>`,
  });
};

// viewonly 捷徑：唯讀直接開第②段範本表單全 disabled（不走三段、不用三卡）。搬原 viewonly 假資料+disabled 邏輯，body 自己開。
App._flowViewonlyPreview = function() {
  App._createFlow = { step: 2, mode: 'template', stage1Data: null };
  // 唯讀預覽每次全新：無條件預載標準部門 roles
  const _npiT2 = tplNpi();
  const _roles = (_npiT2 && _npiT2.roles && _npiT2.roles.length) ? _npiT2.roles : [''];
  App._tplDepts = _roles.map(r => ({ id: U.id(), name: r, members: [{ id: U.id(), name: '' }] }));
  App.openModal({
    title: '範本預覽（唯讀）',
    body: `<div class="form-field"><label>專案名稱 *</label><input type="text" id="pf-name"></div>${App._stage1FormHtml()}`,
    footer: `<button class="tb-action ghost" onclick="App.closeModal()">關閉</button>`,
  });
  const nameEl = document.getElementById('pf-name'); if (nameEl) nameEl.value = CFG('PROJECT_INPUT_EXAMPLE','範例品項');
  const mainNameEl = document.getElementById('pf-mainName'); if (mainNameEl) mainNameEl.value = CFG('PROJECT_INPUT_EXAMPLE','範例品項');
  const startEl = document.getElementById('pf-start'); if (startEl) startEl.value = D.fmt(new Date(),'iso');
  ['pf-name','pf-note','pf-mainName','pf-start','pf-end','pf-direction','pf-tpl'].forEach(id => { const el = document.getElementById(id); if (el) el.disabled = true; });
  document.querySelectorAll('#pf-tplBox .stage-pick, #pf-tplBox #deptEditorList input, #pf-tplBox #deptEditorList button, #pf-tplBox .dept-add-btn').forEach(el => el.disabled = true);
  const addCaseBtn = document.querySelector('#pf-tplBox button[onclick*="_tplAddOtherCase"]'); if (addCaseBtn) addCaseBtn.style.display = 'none';
};

// 第②段「下一步/建立」handler：依 _createFlow.mode 分流。空白→落地（_flowBlankCommit，動作D）；Excel→佔位；範本→掃表單成 cases、存 stage1Data、算 preview 進第③段。
// Excel 上傳狀態三態（wait/ok/err）統一設定：className 重置 + textContent，避免前態 class 殘留。
App._setExcelStatus = function(text, kind) {
  const st = document.getElementById('pf-excelStatus');
  if (st) { st.className = 'excel-status ' + (kind || ''); st.textContent = text; }
};

// Excel ②選檔：async 解析→存 _createFlow.excelParsed→顯示狀態（下一步讀它進第三段）。
App._flowExcelPick = async function(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  App._setExcelStatus('解析中…', 'wait');
  await App._flowExcelParse(file, null);
};
// 解析＋接收（needMapping→嵌入欄位對應面板，指定後帶 mapping 重解析；§13.7）
App._flowExcelParse = async function(file, mapping) {
  try {
    const parsed = await parseWbsExcel(file, mapping ? { mapping } : undefined);
    if (parsed && parsed.needMapping) {
      if (App._createFlow) App._createFlow.excelParsed = null;
      App._setExcelStatus('⚠ 部分欄位對不上，請在下方指定對應', 'err');
      App.renderImportMapping({
        containerId: 'pf-excelMap', specs: WBS_COLUMNS, headerCells: parsed.headerCells,
        resolved: parsed.resolved, requiredKeys: WBS_REQUIRED_KEYS, domain: 'wbs',
        onConfirm: m => { App._setExcelStatus('解析中…', 'wait'); App._flowExcelParse(file, m); },
      });
      return;
    }
    if (!parsed || !parsed.ok) {
      if (App._createFlow) App._createFlow.excelParsed = null;
      App._setExcelStatus('⚠ 解析失敗：' + ((parsed && parsed.errors && parsed.errors[0]) || '檔案格式不符'), 'err');
      return;
    }
    if (App._createFlow) App._createFlow.excelParsed = parsed;
    App._setExcelStatus('✓ 已讀取「' + (parsed.projectName || '未命名') + '」共 ' + parsed.rows.length + ' 筆任務，按下一步檢視', 'ok');
    const nameSpan = document.getElementById('pf-excelName'); if (nameSpan && file) nameSpan.textContent = file.name;
    const nameEl = document.getElementById('pf-name');
    if (nameEl && !nameEl.value.trim() && parsed.projectName) nameEl.value = parsed.projectName;
  } catch (err) {
    if (App._createFlow) App._createFlow.excelParsed = null;
    App._setExcelStatus('⚠ 解析錯誤：' + (err.message || err), 'err');
  }
};

App._flowStage2Next = function() {
  const name = document.getElementById('pf-name').value.trim();
  if (!name) { U.toast('⚠ 請填專案名稱', 'warning'); return; }
  const color = PROJ_COLORS[0];   // 專案色已移除顯示·保留預設值不破壞既有流程簽章
  const note = document.getElementById('pf-note').value.trim();
  const mode = App._createFlow ? App._createFlow.mode : 'template';

  if (mode === 'blank') { return App._flowBlankCommit(name, color, note); }   // 空白落地，動作D 定義；先呼叫，D 做完才不炸
  if (mode === 'excel') {
    const parsed = App._createFlow ? App._createFlow.excelParsed : null;
    if (!parsed || !parsed.ok) { U.toast('⚠ 請先選擇 Excel 檔', 'warning'); return; }
    this._tplPreview = buildWbsPreview(parsed);
    this._tplPreview.project.name = name;
    this.closeModal();
    App._s2From = 'excel';   // §19.10 F.3：Excel 從 modal 進來、無 Stage 1 →「上一步」重開 Excel 表單（_s2BackToStage1 分流）
    this._renderStage2New();
    return;
  }

  // 範本：掃表單成 cases（搬自 saveProject 範本分支，唯一真實來源）
  const _pfSel = document.getElementById('pf-tpl');
  const tpl = (_pfSel && _pfSel.value) ? (tplResolve(_pfSel.value) || tplNpi()) : tplNpi();   // §19.11：舊 modal 下拉選值生效
  if (!tpl) { U.toast('⚠ 找不到範本', 'warning'); return; }
  const cards = document.querySelectorAll('#pf-tplBox .case-card');
  const cases = [];
  for (const card of cards) {
    const isMain = card.dataset.case === 'main';
    const vnEl = card.querySelector('.case-variant-name');
    const variantName = vnEl ? vnEl.value.trim() : '';
    if (!variantName) { U.toast(isMain ? '⚠️請填主案的案別名稱' : '⚠️請填另案的案別名稱', 'warning'); return; }
    const startEl = card.querySelector('.case-start');
    const startDate = startEl ? startEl.value : '';
    if (isMain && !startDate) { U.toast('⚠ 套用範本請填主案開始日', 'warning'); return; }
    const stages = [...card.querySelectorAll('.stage-pick.on')].map(b => b.dataset.stage);
    if (!stages.length) { U.toast('⚠️請為「' + variantName + '」至少選一個階段', 'warning'); return; }
    cases.push({
      variantName,
      templateVariant: isMain ? '主案' : '另案',
      startDate,
      endDate: (card.querySelector('.case-end') || {}).value || '',
      direction: (card.querySelector('.case-direction') || {}).value || 'forward',
      selectedStages: stages,
    });
  }
  // 存 stage1Data（供③上一步回填）
  App._createFlow.stage1Data = {
    name, color, note, mode: 'template',
    cases: JSON.parse(JSON.stringify(cases)),
    depts: JSON.parse(JSON.stringify(App._tplDepts || [])),
  };
  // 算 preview 不落地，進第③段
  const userInput = { projectName: name, color, note, cases, depts: App._tplDepts || [] };
  this._tplPreview = App.applyTemplate(tpl, userInput);
  App._attachStageCoord(this._tplPreview, tpl, !!(App._createFlow && App._createFlow.ecn));   // §19.10 F.3 NPI 每階段常駐協調%
  this.closeModal();
  this._renderStage2();
};

// 空白專案落地：name/color/note 由 _flowStage2Next 傳入（已驗 name 非空），複用 saveProject 空白分支邏輯，不重掃 DOM。
App._flowBlankCommit = function(name, color, note) {
  if (App._roGuard()) return;
  const np = { id: U.id(), name, color, note, depts: JSON.parse(JSON.stringify(App._tplDepts || [])), synced: false, createdAt: new Date().toISOString() };
  // §15 同名告警 + 並存（三模式齊全，鏡像 _stage2Commit）：blank 無 importedAt（不假造匯入日；段4 sidebar 用 importedAt||createdAt fallback）
  const dup = DATA.projects.filter(p => p.name === name);
  const _commit = () => {
    np.version = dup.length ? Math.max(...dup.map(p => p.version || 1)) + 1 : 1;
    ensurePdcaData(np);
    DATA.projects.push(np);
    App.currentProjectId = np.id;
    Store.projects.save();
    App._createFlow = null;   // 流程結束，清狀態
    App.closeModal();
    App.refreshAll();
    U.toast('✓ 專案已建立');
    App.showPage('project', null);
  };
  if (dup.length) {
    App.confirmModal({ icon: 'ti-copy', iconBg: '--amber-l', iconColor: '--amber-ink',
      title: `已有 ${dup.length} 個同名專案「${name}」`, msg: '要建立新版本嗎？兩者並存，可在側邊欄辨識版號。', okText: '建立新版本', cancelText: '返回修改', onConfirm: _commit });
  } else { _commit(); }
};

App.openProjectDialog = function(projId) {
  const editing = projId ? this.getProj(projId) : null;
  const isEdit = !!editing;
  // 路線B：新增專案走兩步 modal 流程（viewonly 走唯讀捷徑、一般走 _flowStep1）；isEdit 維持現有編輯 modal。
  if (!isEdit && document.body.classList.contains('viewonly')) return App._flowViewonlyPreview();
  if (!isEdit) return App._flowStep1();

  this.openModal({
    title: isEdit ? '編輯專案' : '新增專案',
    body: `
      <div class="form-field">
        <label>專案名稱 *</label>
        <input type="text" id="pf-name" value="${editing ? U.esc(editing.name) : ''}" placeholder="e.g. ${CFG('PROJECT_INPUT_EXAMPLE', '範例品項')}" oninput="App._syncMainName()">
      </div>
      <div class="form-field">
        <label>備註</label>
        <input type="text" id="pf-note" value="${editing ? U.esc(editing.note || '') : ''}" placeholder="簡短描述">
      </div>
      <div class="form-field">
        <label>專案狀態</label>
        <select id="pf-status" onchange="App._pfStatusChange()" style="max-width:220px;">
          <option value="active"${(!editing.archived && !App._isProjectDone(editing)) ? ' selected' : ''}>進行中</option>
          <option value="done"${(!editing.archived && App._isProjectDone(editing)) ? ' selected' : ''}>已完成</option>
          <option value="archived"${editing.archived ? ' selected' : ''}>已封存</option>
        </select>
        <div id="pf-status-reason" class="form-field" style="margin-top:10px;${editing.archived ? '' : 'display:none;'}">
          <label>封存原因（必填）</label>
          <textarea id="pf-arch-reason" rows="2" style="width:100%;resize:vertical;" placeholder="例：專案損益不佳被喊停 / 需求變更暫停 / 已被新案取代…" oninput="App._pfStatusChange()">${editing.archiveReason ? U.esc(editing.archiveReason) : ''}</textarea>
          <div id="pf-arch-hint" style="margin-top:4px;font-size:12px;color:var(--rose-ink);display:none;">選「已封存」需填原因——一定有原因才會喊停一個專案。</div>
        </div>
        <div style="margin-top:4px;font-size:11.5px;color:var(--ink3);">完成或封存的專案會移到「專案檔案室」、不在側欄顯示；改回「進行中」即退回側欄。</div>
      </div>
        ${isEdit ? `
        <div class="form-field">
          <label>部門擔當</label>
          <div class="dept-editor-head"><span class="dept-head-name">部門名稱</span><span class="dept-head-members">擔當姓名</span></div>
          <div class="dept-edit-list" id="deptEditorList">${App.buildDeptRowsHtml(editing.depts || [], 'edit', projId)}</div>
          <button class="tb-action ghost dept-add-btn" onclick="App.deptUI.addDept('edit', '${projId}')">＋ 新增部門</button>
        </div>
        ${editing.ecnType ? `
        <div class="form-field" style="max-width:300px;">
          <label>本案呆滯特批門檻覆寫（NTD $，選填）</label>
          <input type="number" id="pf-scrapthreshold" min="0" step="1000" value="${editing.scrapThresholdOverride != null ? editing.scrapThresholdOverride : ''}" placeholder="留空＝沿用全域 ${DATA.settings.ecnScrapThreshold ?? 30000}">
          <div style="margin-top:4px;font-size:11.5px;color:var(--ink3);">結案時舊料報廢金額超過此值就擋下、需特批；留空＝沿用系統設定的全域門檻。</div>
        </div>
        ` : ''}
        ` : ''}
    `,
    footer: `
      ${isEdit ? `<button class="tb-action danger" data-edit-hide onclick="App.deleteProject('${projId}')" style="margin-right:auto;">刪除專案</button>` : ''}
      <button class="tb-action ghost" onclick="App.closeModal()">取消</button>
      <button class="tb-action pf-btn-create" id="pf-submitBtn" data-edit-hide onclick="App.saveProject('${projId || ''}')">${isEdit ? '儲存' : '建立'}</button>
    `,
  });
  setTimeout(() => { if (App._pfStatusChange) App._pfStatusChange(); }, 30);   // §23 初始化狀態欄位驗證（已封存缺原因→disable 儲存）
};

// §23 專案狀態欄位：切「已封存」顯必填原因；原因空 → disable 儲存＋紅字內聯（規則·不用 toast）
App._pfStatusChange = function() {
  const sel = document.getElementById('pf-status');
  if (!sel) return;
  const box = document.getElementById('pf-status-reason');
  const ta = document.getElementById('pf-arch-reason');
  const hint = document.getElementById('pf-arch-hint');
  const submit = document.getElementById('pf-submitBtn');
  const isArch = sel.value === 'archived';
  if (box) box.style.display = isArch ? '' : 'none';
  const needReason = isArch && !(ta && ta.value.trim());
  if (submit) submit.disabled = needReason;
  if (hint) hint.style.display = needReason ? '' : 'none';
};

App.editProject = function(id) { this.openProjectDialog(id); };

// 主案名鏡像專案名：未被手動編輯（無 dataset.touched）時跟著專案名走；編輯模式無 #pf-mainName → 早返。
App._syncMainName = function() {
  const proj = document.getElementById('pf-name');
  const main = document.getElementById('pf-mainName');
  if (!proj || !main) return;
  if (!main.dataset.touched) main.value = proj.value;
};

// 套範本提醒清單：把 applyTemplate 回傳的 warnings 字串陣列列在 #content 頂部常駐 banner
// （不進 page-project，避開 renderProject 整段重繪洗掉）。空陣列不 render。
// §19.11（Paul 2026-07-05）：改設計款彈窗（非黏著·不再塞 #content 導致跨頁卡住）；列出自動調整項＋引導去甘特圖/任務表確認排程。
App._showTplWarnings = function(warnings) {
  if (!warnings || !warnings.length) return;
  const MAX = 12;
  const shown = warnings.slice(0, MAX).map(w => '<li>' + U.esc(w) + '</li>').join('');
  const more = warnings.length > MAX ? '<li class="tpl-warn-more">…另 ' + (warnings.length - MAX) + ' 項</li>' : '';
  App.confirmModal({
    title: '套用範本提醒（' + warnings.length + ' 項自動調整）',
    icon: 'ti-info-circle', iconBg: '--amber-l', iconColor: '--amber-ink',
    msg: '<div class="tpl-warn-modal-body">建立時系統自動處理了下列項目（多為「前置已刪除／階段未選 → 自動移除該前置」）：' +
      '<ul class="tpl-warn-list">' + shown + more + '</ul>' +
      '<div class="tpl-warn-tip">📌 請到<b>甘特圖／任務大表</b>確認排程是否符合預期；要改流程母版請回<b>設定 → 範本</b>編修後重新開案。</div></div>',
    okText: '我知道了', cancelText: null,
  });
};

App.saveProject = function(id) {
  const name = document.getElementById('pf-name').value.trim();
  if (!name) { U.toast('⚠ 請填專案名稱', 'warning'); return; }
  const note = document.getElementById('pf-note').value.trim();

  // 此函式只處理「編輯既有專案」。新增專案走 _flowStep1 多步流程；
  // 舊單一彈窗的 create 分支（pf-mode + template/blank + Excel「下一批實作」stub）已退役、不可達，移除。
  if (App._roGuard()) return;
  const p = this.getProj(id);
  if (p) {
    p.name = name; p.note = note;   // 專案色欄位已移除·編輯不動 p.color（保留既有值）
    const stEl = document.getElementById('pf-scrapthreshold');   // ECN 本案呆滯特批門檻覆寫（§19.5·留空＝沿用全域）
    if (stEl) { const raw = stEl.value.trim(); p.scrapThresholdOverride = raw === '' ? undefined : Math.max(0, parseInt(raw) || 0); }
    // §23 專案狀態欄位（進行中／已完成／已封存·封存必填原因）
    const statusSel = document.getElementById('pf-status');
    if (statusSel) {
      const v = statusSel.value;
      if (v === 'archived') {
        const reason = (document.getElementById('pf-arch-reason')?.value || '').trim();
        if (!reason) { App._pfStatusChange(); return; }   // 保險：空原因不存（UI 已 disable 儲存）
        p.archived = true; p.archiveReason = reason; if (!p.archivedAt) p.archivedAt = new Date().toISOString();
      } else if (v === 'done') {
        p.archived = false; delete p.archiveReason; delete p.archivedAt;
        if (!App._isProjectDone(p)) { p.status = 'done'; p.completedAt = new Date().toISOString(); }
      } else {   // active
        p.archived = false; delete p.archiveReason; delete p.archivedAt;
        p.status = 'active'; delete p.completedAt;
      }
    }
  }
  Store.projects.save();
  this.closeModal();
  this.refreshAll();
  U.toast('✓ 專案已更新');
};

// ─── 範本第二階段：編輯任務骨架頁（§8d.15）。B 步驟2：頁殼+標頭+案別區塊；Gantt軸/任務清單留步驟3/4。───
// 吃 this._tplPreview（applyTemplate 回傳的 res，未落地）；render 進 #page-stage2，仿 showPage 切 .active。
App._renderStage2 = function() {
  const res = this._tplPreview;
  if (!res) { U.toast('\u26a0 無範本預覽資料，請重新套用範本', 'warning'); return; }
  const variants = res.variants || [];
  const tasks = res.tasks || [];
  // 預設每案選中第一個階段（既有有效選擇保留；新 preview/失效選擇 → 回第一階段）
  if (!this._s2Stage) this._s2Stage = {};
  variants.forEach(v => {
    const g = this._s2GroupByStage(v.id);
    if (g.order.length && g.order.indexOf(this._s2Stage[v.id]) < 0) this._s2Stage[v.id] = g.order[0];
  });
  const fmtD = (s) => s ? String(s).replace(/-/g, '/') : '';
  // 案別總區間：純讀該案 preview tasks 的 min plannedStart \u2192 max plannedEnd（引擎\u2467已順推寫入，不落地）。
  const caseRange = (vid) => {
    const ts = tasks.filter(t => t.variant === vid);
    const starts = ts.map(t => t.plannedStart).filter(Boolean).sort();
    const ends = ts.map(t => t.plannedEnd).filter(Boolean).sort();
    const a = starts[0], b = ends[ends.length - 1];
    return (a || b) ? (fmtD(a) + ' \u2192 ' + fmtD(b)) : '（待排程）';
  };

  const help =
    '<div class="stage2-help">' +
      '<div class="stage2-help-head">\u2753 填寫說明</div>' +
      '<div class="stage2-help-block"><b>日期（起訖）</b>：系統自動計算，不直接填；請以「前置任務 \uff0b 工期」調整。</div>' +
      '<div class="stage2-help-block"><b>需交付</b>：此任務是否須繳交付件（如報告、樣品）。可逐筆勾或整階段全選。</div>' +
      '<div class="stage2-help-block"><b>前置任務</b>三種設定：' +
        '<br>\u30fb接在《A》後 \u2014 等 A 做完，隔天才開始。例：樣機組裝 接在《零件到料》後' +
        '<br>\u30fb接在《A》後 \uff0b2天 \u2014 等 A 做完，再多等 2 天才開始。例：塗裝 接在《組裝》後 \uff0b2天（等乾）' +
        '<br>\u30fb無前置 \u2014 不用等其他項目，從專案開始日就排入。例：規格訂定' +
      '</div>' +
    '</div>';
  const blocks = variants.map((v, i) => {
    const isMain = i === 0;
    return '' +
      '<div class="s2-case ' + (isMain ? 's2-case-main' : 's2-case-other') + '" data-variant="' + v.id + '">' +
        '<div class="s2-case-head">' +
          '<span class="stage-cap-pill cap-' + (i % 3) + '">' + (isMain ? '主案' : '另案') + '</span>' +
          '<span class="s2-case-name">' + U.esc(v.name || '') + '</span>' +
          '<span class="s2-case-range">' + caseRange(v.id) + '</span>' +
        '</div>' +
        '<div class="s2-slack-wrap" data-variant="' + v.id + '">' + this._s2SlackHtml(v.id) + '</div>' +
        '<div class="s2-gantt" data-variant="' + v.id + '">' + this._s2GanttHtml(v.id) + '</div>' +
        '<div class="s2-list" data-variant="' + v.id + '">' + this._s2ListHtml(v.id) + '</div>' +
      '</div>';
  }).join('');
  document.querySelectorAll('.page').forEach(pg => pg.classList.remove('active'));
  const page = document.getElementById('page-stage2');
  page.classList.add('active');
  page.innerHTML =
    '<div class="stage2-wrap">' +
      '<div class="stage2-head"><span class="s2-num">2</span>編輯任務骨架</div>' +
      help +
      blocks +
      (n => n > 0 ? '<div class="s2-unassigned-bar">⚠ 還有 ' + n + ' 個任務未指派負責人</div>' : '')((res.tasks || []).filter(t => !t.owner).length) +
      '<div class="stage2-foot">' +
        '<button class="tb-action ghost" onclick="App._flowStage3Back()">上一步</button>' +
        '<button class="tb-action" data-edit-hide onclick="App._stage2Commit()">建立專案</button>' +
      '</div>' +
    '</div>';
  // §8f.9 viewonly 第二階段：所有可編輯控制項 disabled（純展示，不可改）；建立鈕已 data-edit-hide + _roGuard 雙防
  if (document.body.classList.contains('viewonly')) {
    document.querySelectorAll('#page-stage2 input, #page-stage2 select, #page-stage2 .s2-del, #page-stage2 .dt-insert-btn').forEach(el => { el.disabled = true; });
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ═══ §4.8.7.4b Stage 2 New UI（Mockup⑤⑥）：編輯任務骨架 — 左部門面板＋右甘特＋階段任務表＋部門彈窗 ═══
// 接線：第一階段預覽「下一步」→ _flowStage1Next（collect→applyTemplate→_renderStage2New）。
// 不接舊 _renderStage2/_stage2Commit 的 render；建立仍複用 _stage2Commit（讀 _tplPreview，邏輯不變）。

// 第一階段「下一步：檢視任務」：掃第一階段輸入 → applyTemplate（不落地）→ 進新 Stage 2。
// 上一步靠切 .active 不重繪 page-stage1，故回上一步輸入仍在（DOM 不清）。
App._flowStage1Next = function() {
  const tpl = App._s1Tpl();   // §19.10：ECN 分級派生範本／NPI 產品開發範本，單一取用點
  if (!tpl) { U.toast('⚠ 找不到範本', 'warning'); return; }
  const input = App._s1CollectInput();
  if (!input || !input.cases.length) { U.toast('⚠ 無案別資料，請重新套用範本', 'warning'); return; }
  const main = input.cases[0];
  if (!main.startDate && !main.endDate) { U.toast('⚠ 主案請至少填開始日或上市日期', 'warning'); return; }
  input.depts = App._tplDepts || [];   // 新流程部門多在 Stage 2 才編（ECN＝名冊挪前，此處已有值）
  // §19.10 A.1 ECN：收開案 meta（分級/原因/ROI/單號/PM Effort）暫存 _createFlow.ecn，_stage2Commit 落地時寫進專案
  if (App._s1Ecn) {
    App._createFlow = App._createFlow || {};
    App._createFlow.ecn = {
      size: App._s1Ecn.size,
      changeReason: ((document.getElementById('s1-ecn-reason') || {}).value || '').trim(),   // 設變背景與原因（整併欄，textarea 自由文字）
      roiType: ((document.getElementById('s1-ecn-roi') || {}).value) || 'benefit',   // 純手動下拉（效益型/被迫型·效益型放第一為預設）
      sourceNo: ((document.getElementById('s1-ecn-src') || {}).value || '').trim(),   // 溯源：需求單號（客訴單/CAR/會議記錄）
      targetSavePerUnit: parseFloat((document.getElementById('s1-ecn-target') || {}).value) || 0,   // §ECN 總覽 Phase3：目標成本調降/台（開案捕捉·餵①核心目標＋③達成率；BOM tab 亦可調同欄）
      ecnNo: '',   // 正式 ECN 單號＝結案時打進 PLM/ERP 才產生，開案不填（§19.2 結案必填）
      pmEffort: (function(){ const t = tplEcn(); return (t && t.sizeMeta && t.sizeMeta[App._s1Ecn.size]) ? t.sizeMeta[App._s1Ecn.size].pmEffort : 20; })(),
    };
  } else if (App._createFlow) { App._createFlow.ecn = null; }
  this._tplPreview = App.applyTemplate(tpl, input);
  App._attachStageCoord(this._tplPreview, tpl, !!(App._createFlow && App._createFlow.ecn));   // §19.10 F.3 NPI 每階段常駐協調%
  // ③ 過渡中繼彈窗：偵測到任一案別時程不足（紅燈）→ 先彈智慧排程引導窗，按「開始智慧排程」才進 Stage 2；夠就直接進。
  const reds = (this._tplPreview.variants || []).filter(v => { const s = App._s2VariantSlack(v.id); return s && s.light === 'red'; });
  if (reds.length) {
    let maxOver = 0;
    reds.forEach(v => { const s = App._s2VariantSlack(v.id); if (s && s.overDays > maxOver) maxOver = s.overDays; });
    App.confirmModal({
      icon: 'ti-chart-bar', iconBg: '--rose-l', iconColor: '--rose',
      title: '偵測到時程衝突！已為您開啟智慧排程引導',
      msg: '目前排程規劃尚缺 <b>' + maxOver + '</b> 個工作天' + (reds.length > 1 ? '（共 ' + reds.length + ' 個案別時程不足）' : '') + '。為了協助您快速順時程，系統已將此專案導入「智慧排程衝突處理面板」。<br><br>您可以透過系統建議一鍵微調，或透過精選的長工時任務快速進行扣減。',
      okText: '開始智慧排程 →', cancelText: '返回上一步',
      onConfirm: function() { App._renderOverflowFlow(); }
    });
    return;
  }
  // §19.10 A.1（2026-07-02 定案）：ECN 按「建立專案」直落地（跳過 Stage 2 檢視——任務調整在戰情室大表 §19.10 B）；
  // _stage2Commit 內含 ECN 防呆彈窗＋未指派/同名 confirm 鏈。NPI 照舊進 Stage 2。
  if (App._s1Ecn) { App._stage2Commit(); return; }
  App._s2From = 'stage1';   // §第3：綠/黃直接進 Stage 2（未經 overflow 面板）→「上一步」回 Stage 1
  this._renderStage2New();
};

// 上一步分情境（§第3）：經 overflow 面板來的回面板、保留層一二設定（層別/工期/採用的上市日全在）；綠黃直接來的回 Stage 1。
App._s2BackToStage1 = function() {
  if (App._s2From === 'overflow' && App._ovfState) {
    App._ovfRender();   // 回智慧排程面板，_ovfState 不重置 → 設定全保留，不會被打回 Stage 1 重來
    return;
  }
  if (App._s2From === 'excel') {   // §19.10 F.3：Excel 無 Stage 1 → 上一步重開 Excel 表單那步（modal 覆蓋 Stage 2，取消即回原表）
    App._flowStep2();
    return;
  }
  document.querySelectorAll('.page').forEach(pg => pg.classList.remove('active'));
  const p = document.getElementById('page-stage1');
  if (p) p.classList.add('active');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// 建立專案：先還原全域 topbar（離開流程頁）再走既有 _stage2Commit（落地邏輯單一真實來源、不重寫）。
App._s2CommitNew = function() {
  // 紅燈軟提醒閘門（§4.8.7.5）：有案別餘裕<0 → 先彈設計款確認，不硬擋（可先用紅燈引導調上市日/工期）。
  const res = this._tplPreview;
  const reds = res ? (res.variants || []).filter(v => { const s = App._s2VariantSlack(v.id); return s && s.light === 'red'; }) : [];
  if (reds.length) {
    App.confirmModal({
      icon: 'ti-tool', iconBg: '--rose-l', iconColor: '--rose',
      title: '工期仍不足，確定建立？',
      msg: '尚有 <b>' + reds.length + '</b> 個案別時程不足（餘裕 < 0）。可先用上方紅燈引導調整上市日或壓縮工期；仍要強制建立嗎？',
      okText: '仍要強制建立', okClass: 'danger', cancelText: '返回調整',
      onConfirm: function() { App._s2DoCommit(); }
    });
    return;
  }
  App._s2DoCommit();
};
// 實際落地：還原全域 topbar（離開流程頁）再走既有 _stage2Commit（落地邏輯單一真實來源、不重寫）。
App._s2DoCommit = function() {
  const tb = document.querySelector('.main > .topbar');
  if (tb) tb.classList.remove('topbar-hidden');
  App._stage2Commit();
};

// 左部門面板（純顯示，Mockup⑤左欄）：列各部門→成員＋該案任務數；「未指派」筆數標紅。
// 不可點（v1）；資料讀 _tplPreview，套用部門後由 _renderStage2New 整頁重繪刷新。
App._s2DeptPanelHtml = function(variantId) {
  const res = this._tplPreview; if (!res) return '';
  const depts = res.depts || [];
  const tasks = (res.tasks || []).filter(t => t.variant === variantId);
  const unassigned = tasks.filter(t => !t.owner).length;
  let rows = depts.map(d => {
    const cnt = tasks.filter(t => t.dept === d.id).length;
    const names = (d.members || []).map(m => U.esc(m.name)).filter(Boolean).join('、') || '<span class="s2n-dp-empty">無成員</span>';
    return '<div class="s2n-dp-row">' +
        '<div class="s2n-dp-name">' + U.esc(d.name) + '</div>' +
        '<div class="s2n-dp-members">' + names + '</div>' +
        '<div class="s2n-dp-cnt">' + cnt + ' 件</div>' +
      '</div>';
  }).join('');
  if (!depts.length) rows = '<div class="s2n-dp-none">尚未設定部門，點右上「新增/編輯部門」建立</div>';
  const unRow = '<div class="s2n-dp-row s2n-dp-unassigned' + (unassigned ? '' : ' ok') + '">' +
      '<div class="s2n-dp-name">未指派</div>' +
      '<div class="s2n-dp-members"></div>' +
      '<div class="s2n-dp-cnt">' + unassigned + ' 件</div>' +
    '</div>';
  return '<div class="s2n-deptpanel">' +
      '<div class="s2n-dp-head">' +
        '<span class="s2n-dp-title">部門與負責人</span>' +
        '<button class="s2n-dp-btn" onclick="App._s2OpenDeptModal()"><i class="ti ti-pencil"></i> 新增/編輯部門</button>' +
      '</div>' + rows + unRow +
    '</div>';
};

// 部門彈窗（Mockup⑥）：複用共用部門元件（buildDeptRowsHtml + deptUI tpl 模式，暫存 _tplDepts）。
// 開窗前把 _tplPreview.depts deep-clone 進 _tplDepts 當工作副本；取消＝closeModal 清掉副本、不動 preview。
App._s2OpenDeptModal = function() {
  const res = this._tplPreview; if (!res) return;
  // 預載：依本專案任務的範本角色（task.role）抓出既有部門，user 只需填負責人姓名；
  // 已存的部門沿用其成員（不重置），非角色的自建部門也保留。
  const roles = [];
  (res.tasks || []).forEach(t => { const r = (t.role || '').trim(); if (r && roles.indexOf(r) < 0) roles.push(r); });
  const existing = {};
  (res.depts || []).forEach(d => { existing[d.name] = d; });
  const working = roles.map(r => existing[r]
    ? JSON.parse(JSON.stringify(existing[r]))
    : { id: U.id(), name: r, members: [{ id: U.id(), name: '' }] });
  (res.depts || []).forEach(d => { if (roles.indexOf(d.name) < 0) working.push(JSON.parse(JSON.stringify(d))); });
  App._tplDepts = working;
  const body =
    '<div class="form-field">' +
      '<label>部門與負責人（可自由增減）</label>' +
      '<div class="s2n-dept-hint">先建立部門與成員；儲存後系統會依任務角色自動指派負責人，之後可在任務表逐筆微調。</div>' +
      '<div class="dept-edit-list" id="deptEditorList">' + App.buildDeptRowsHtml(App._tplDepts, 'tpl', null) + '</div>' +
      '<button class="dept-add-btn" onclick="App.deptUI.addDept(\'tpl\', \'\')">＋增加部門</button>' +
    '</div>';
  const footer =
    '<button class="tb-action ghost" onclick="App.closeModal()">取消</button>' +
    '<button class="tb-action" onclick="App._s2ApplyDepts()">儲存並套用</button>';
  App.openModal({ title: '部門與負責人', body: body, footer: footer });
};

// 儲存並套用：工作副本 → _tplPreview.depts（清空部門/無成員，鏡像 applyTemplate ③）；
// 依 role 重映射 task.dept（保留 owner/工期/需交付等手改；dept 不影響排程、不重算）→ 整頁重繪。
App._s2ApplyDepts = function() {
  const res = this._tplPreview;
  const edited = JSON.parse(JSON.stringify(App._tplDepts || []));   // 先擷取，closeModal 會清 _tplDepts
  if (!res) { App.closeModal(); return; }
  const depts = [];
  edited.forEach(d => {
    const name = (d.name || '').trim();
    if (!name) return;
    const members = (d.members || []).map(m => ({ id: m.id, name: (m.name || '').trim() })).filter(m => m.name);
    if (!members.length) return;
    depts.push({ id: d.id, name: name, members: members });
  });
  res.depts = depts;
  const roleToDeptId = {};
  const deptById = {};
  depts.forEach(d => { roleToDeptId[d.name] = d.id; deptById[d.id] = d; });
  // 重映射 task.dept；負責人自動帶入：未指派的任務帶該部門第一位成員（手動 > 系統，已填的不覆蓋）。
  (res.tasks || []).forEach(t => {
    t.dept = roleToDeptId[(t.role || '').trim()] || '';
    if (!t.owner && t.dept) {
      const d = deptById[t.dept];
      if (d && d.members && d.members[0]) t.owner = d.members[0].name;
    }
  });
  App.closeModal();
  if (App._s2EcnMode) {   // §19 ECN 戰情室：res.depts 只是 hijack 副本引用 → 同步寫回 proj.depts，存檔重繪 dashboard
    const proj = App.getProj(App._s2EcnMode);
    if (proj) proj.depts = depts;
    App._s2EcnPersist();
    return;
  }
  this._renderStage2New();
};

// 新 Stage 2 頁殼（Mockup⑤）：標頭＋提示條（新增/編輯部門鈕）＋每案（案頭＋燈號＋左部門面板/右甘特＋任務表）。
// 甘特/燈號/任務表全複用既有 _s2GanttHtml/_s2SlackHtml/_s2ListHtml；data-variant 容器同名，_s2RefreshCase 可刷。
App._renderStage2New = function() {
  const res = this._tplPreview;
  if (!res) { U.toast('⚠ 無範本預覽資料，請重新套用範本', 'warning'); return; }
  const variants = res.variants || [];
  const tasks = res.tasks || [];
  if (!this._s2Stage) this._s2Stage = {};
  variants.forEach(v => {
    const g = this._s2GroupByStage(v.id);
    if (g.order.length && g.order.indexOf(this._s2Stage[v.id]) < 0) this._s2Stage[v.id] = g.order[0];
  });
  const fmtD = (s) => s ? String(s).replace(/-/g, '/') : '';
  const caseRange = (vid) => {
    const ts = tasks.filter(t => t.variant === vid);
    const starts = ts.map(t => t.plannedStart).filter(Boolean).sort();
    const ends = ts.map(t => t.plannedEnd).filter(Boolean).sort();
    const a = starts[0], b = ends[ends.length - 1];
    return (a || b) ? (fmtD(a) + ' → ' + fmtD(b)) : '（待排程）';
  };
  // 頂部說明：標準收折 HintBox（buildHintBox，字級吃 UI-CSS 規範、收合狀態持久化）
  const topGuide = App.buildHintBox({
    key: 's2-guide', icon: 'ti-info-circle', title: '骨架與階段切換指南',
    summary: '先建名冊自動帶擔當（手動優先）；點甘特切換階段', collapsed: false,
    bodyHtml:
      '<div class="s2n-gd-row"><i class="ti ti-speakerphone"></i><span><b>先建名冊再排程</b>：請先至左側「部門與負責人」區塊建立清單，系統會自動將人員帶入下方任務大表的擔當欄。手動修改的指派結果將受系統保護，不會被覆蓋。</span></div>' +
      '<div class="s2n-gd-row"><i class="ti ti-chart-bar"></i><span><b>快速切換開發階段</b>：點擊上方甘特圖的綠色進度條（如：設計、手工機），下方大表即會同步切換至該階段的專屬任務清單。</span></div>'
  });
  const _hasCoord = !!(res.project && res.project.stageCoordDefaults);   // §19.10 F.3：Excel/無範本階段＝無 PM 常駐列 → 隱藏該說明句
  const predHelpHtml = (i) => App.buildHintBox({
    key: 's2-pred-help-' + i, icon: 'ti-list-details', title: '任務大表填寫指南',
    summary: _hasCoord ? '前置防呆／投入%負荷／PM 隱形負荷' : '前置防呆／投入%負荷', collapsed: true,
    bodyHtml:
      '<div class="s2n-gd-row"><i class="ti ti-link"></i><span><b>前置連動與防呆</b>：依序設定「序號 → 銜接方式 → 緩衝天數」。<b>系統防呆</b>：前置任務僅能綁定「當前階段」或「過去 3 個階段」內的項目，嚴禁綁定未來任務以防排程死鎖。</span></div>' +
      '<div class="s2n-gd-row s2n-gd-warn"><i class="ti ti-gauge"></i><span><b>負荷警示與投入級別</b>：投入%＝這件事吃掉負責人一天的幾成，六檔（100% 獨佔／75% 大半天／50% 半天／25% 零星盯／10% 點一下／0% 掛名未出力）。同人跨案單日疊加破百＝爆單，會在總覽 PM 負荷／部門負載轉紅示警。</span></div>' +
      (_hasCoord ? '<div class="s2n-gd-row"><i class="ti ti-user-cog"></i><span><b>PM 隱形負荷保護</b>：每階段最底部的「PM 階段協調（常駐）」專門記錄你的跨部門溝通心血，請依該階段的實際硬度自由調整投入%（其餘各部門常規任務預設為 100%）。</span></div>' : '')
  });
  const blocks = variants.map((v, i) => {
    const isMain = i === 0;
    return '' +
      '<div class="s2n-case s2-case ' + (isMain ? 's2-case-main' : 's2-case-other') + '" data-variant="' + v.id + '">' +
        '<div class="s2-case-head">' +
          '<span class="stage-cap-pill cap-' + (i % 3) + '">' + (isMain ? '主案' : '子案') + '</span>' +
          '<span class="s2-case-name">' + U.esc(v.name || '') + '</span>' +
          '<span class="s2-case-range">' + caseRange(v.id) + '</span>' +
        '</div>' +
        '<div class="s2-slack-wrap" data-variant="' + v.id + '">' + this._s2SlackHtml(v.id) + '</div>' +
        '<div class="s2n-body">' +
          '<div class="s2n-left">' + this._s2DeptPanelHtml(v.id) + '</div>' +
          '<div class="s2-gantt s2n-right" data-variant="' + v.id + '">' + this._s2GanttHtml(v.id) + '</div>' +
        '</div>' +
        '<div class="s2n-banner-wrap" data-variant="' + v.id + '">' + this._s2BannerHtml(v.id) + '</div>' +
        predHelpHtml(i) +
        '<div class="s2-list" data-variant="' + v.id + '">' + this._s2ListHtml(v.id) + '</div>' +
      '</div>';
  }).join('');
  const unbar = (n => n > 0 ? '<div class="s2-unassigned-bar">⚠ 還有 ' + n + ' 個任務未指派負責人</div>' : '')(tasks.filter(t => !t.owner).length);
  document.querySelectorAll('.page').forEach(pg => pg.classList.remove('active'));
  const page = document.getElementById('page-stage2');
  page.classList.add('active');
  page.innerHTML =
    '<div class="s2n-wrap">' +
      '<div class="s2n-pagehd">' +
        '<div class="s1-crumb">總儀表板 <span class="s1-crumb-sep">/</span> 新增專案 <span class="s1-crumb-sep">/</span> 編輯任務</div>' +
        '<div class="s2n-head"><span class="s2-num">2</span>編輯任務骨架</div>' +
      '</div>' +
      topGuide + blocks + unbar +
      '<div class="stage2-foot">' +
        '<button class="tb-action ghost" onclick="App._s2BackToStage1()">上一步</button>' +
        '<button class="tb-action" data-edit-hide onclick="App._s2CommitNew()">建立專案</button>' +
      '</div>' +
    '</div>';
  if (document.body.classList.contains('viewonly')) {
    document.querySelectorAll('#page-stage2 input, #page-stage2 select, #page-stage2 .s2-del, #page-stage2 .dt-insert-btn').forEach(el => { el.disabled = true; });
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// §4.8.7.4b 塊3a-刀1：第一頁入口教育卡（Mockup①，文-A 定稿）。openModal 渲染三情境說明卡（純說明、非選項），→ _renderStage1Preview。
// §22/P2：排程模式說明指南——所有「會進 Stage 1」的流程（NPI 範本／NPI 空白骨架／ECN 設變／ECN 空白骨架）
//   進 Stage 1 前一律先跳此頁，讓 User 先懂三型時間設定與結果。next/back 由呼叫端決定（免參＝NPI 範本預設）。
App._scheduleEduCard = function(nextFn, backFn, kind) {
  App._eduNext = nextFn || function() { App._renderStage1Preview(); };
  App._eduBack = backFn || function() { App._flowStep1(); };
  const k = (kind === 'ecn') ? 'ecn' : 'npi';   // 識別色連動：NPI 湛藍／ECN amber（Point 1）
  // 三欄橫向並排（圖二）：主標題＋核心運算＋小秘訣；文案精煉潤稿（Gemini 版·Paul 定）。
  const cards = [
    { icon: 'ti-calendar', tag: '填開始日', tagcls: 's1-tag-start', title: '已指定開工日',
      desc: '採「正向順推」機制，由您的開工日往後自動推算各階段預計完工日。',
      secret: '適合已有明確開工時間，想精算「最終何時能完工/上市」的專案。' },
    { icon: 'ti-flag', tag: '填上市日期', tagcls: 's1-tag-end', title: '有指定上市日',
      desc: '採「逆向倒推」機制，依據目標上市日自動反推最晚必須開工的時間。',
      secret: '若倒推出的時間不夠，系統將自動啟動智慧排程，為您建議最快完工的黃金時程。' },
    { icon: 'ti-arrows-left-right', tag: '都填', tagcls: 's1-tag-both', title: '雙端日期皆鎖定',
      desc: '採「雙端對比」機制，同時鎖定開工與上市日，嚴格精算專案時間彈性。',
      secret: '當時間出現衝突時，系統將自動開啟「時程引導面板」，協助您無痛化解時程衝突。' },
  ];
  const cardsHtml = cards.map(c =>
    '<div class="s1-edu-card">' +
      '<div class="s1-edu-coretop">' +
        '<div class="s1-edu-cardhd"><i class="ti ' + c.icon + ' s1-edu-ico"></i>' +
          '<span class="s1-edu-tag ' + c.tagcls + '">' + c.tag + '</span></div>' +
        '<div class="s1-edu-cardtitle">' + c.title + '</div>' +
        '<div class="s1-edu-carddesc">' + c.desc + '</div>' +
      '</div>' +
      '<div class="s1-edu-secret"><span class="s1-edu-skey">小秘訣：</span>' + c.secret + '</div>' +
    '</div>'
  ).join('');
  App.openModal({
    title: '<i class="ti ti-book-open"></i> 排程模式說明指南',
    wide: true,
    body: '<div class="s1-edu s1-edu-' + k + '">' +
      '<div class="s1-edu-lead">本頁為排程模式導覽（僅供功能理解），下一頁直接輸入日期，系統即會依據您的填寫自動切換對應模式。</div>' +
      '<div class="s1-edu-cards">' + cardsHtml + '</div>' +
      '<div class="s1-edu-bulb"><i class="ti ti-bulb"></i><span><b>排程小貼士：</b>不論您在下一頁填寫哪一個欄位，系統皆會智慧判斷並自動切換排程方向。若手頭已有完整時間規劃，建議兩者皆填，算出來的時程容裕度與預算最為精準。</span></div>' +
    '</div>',
    footer: '<button class="tb-action ghost" onclick="App._eduGoBack()">上一步</button>' +   // 回上一步（NPI 範本/ECN=選型頁·空白骨架=Screen 0，由呼叫端 backFn 定）
      '<button class="tb-action edu-go-' + k + '" onclick="App._eduGoNext()">我懂了，開始填寫 →</button>',
  });
};
// 指南頁 next/back：先關指南彈窗再執行呼叫端指定動作（骨架流程 _flowBlankSkeleton 自帶 closeModal，重複無害）。
App._eduGoNext = function() { const f = App._eduNext; App.closeModal(); if (f) f(); };
App._eduGoBack = function() { const f = App._eduBack; App.closeModal(); if (f) f(); };

// §4.8.7.4b 塊3a-刀1：第一階段「大局時間」預覽頁（靜態版面，假資料，照第②張定稿 + 今日文案/UI 調整）。
// 本步仍靜態（只主案一條 + ＋新增子案佔位 + 動態提示靜態情境A）；第三步才接 _reschedulePreview/_computeSlack 真資料 + 動態提示切換。
// console 可直接呼叫 App._scheduleEduCard() / App._renderStage1Preview() 看版面；尚未接 modal flow。
App._renderStage1Preview = function() {
  // demo fallback 假案（首開/無輸入不空白）走 App._s1FallbackCase；甘特＋真燈號膠囊建構移至
  // App._s1PreviewBlocksHtml（初次 render 與 date 改動 re-render 共用單一真實來源，§4.8.7.4b 3-3）。
  // 每案獨立狀態（§4.8.7.4b 3-5）：主案＋各子案各自 stages/renames；首次用範本主案階段（缺則退 demo）
  const _tpl0 = App._s1Tpl();   // §19.10：ECN 模式吃分級派生範本，否則產品開發範本（單一取用點）
  if (!App._s1Cases) {
    const tplMain = (_tpl0 && _tpl0.cases && _tpl0.cases[0])
      ? _tpl0.cases[0].stages.slice() : App._s1FallbackCase().stages.map(s => s.stage);
    App._s1Cases = [{ key: 'main', templateVariant: '主案', stages: tplMain, renames: {} }];
  }
  const casesHtml = App._s1Cases.map((c, i) => App._s1CaseColHtml(c, i === 0)).join('');
  // §19.10 A.1（2026-07-02 覆核修訂）：ECN Phase 1＝單案制——受影響機種/多子案（含 per-機種 BOM）留 Phase 2 與 variant 架構一起規劃
  const addCase = App._s1Ecn ? '' : '<div class="s1-add-case" onclick="App._s1AddSubcase()"><i class="ti ti-plus"></i><span>新增子案</span></div>';
  // 說明區：NPI＝排程小秘訣（文-B）；ECN＝開案小幫手（§19.10 A.2 四條、預設收合、時程說明由此承載——不走教育卡）
  const tips = App._s1Ecn
    ? App.buildHintBox({
        key: 's1-ecn-helper', icon: 'ti-bulb', title: '開案小幫手', summary: '點擊了解類型、時程與分級邏輯', collapsed: true,
        bodyHtml:
          '<ol class="s1-ecn-helpol">' +
            '<li><b>設變類型</b>：「效益型」（如 Cost Down）結案時系統自動對比新舊 BOM 算出省下的成本；「被迫型」（如停產／法規）系統會著重追蹤舊料消耗率、卡控生效日以降低報廢損失。</li>' +
            '<li><b>時程推算</b>：填「開始日」系統順推預估完工日；只填「上市日」回推最晚必須動工的日期；若算出工期超出上市死線，進度條將亮紅燈警示。</li>' +
            '<li><b>設變分級（S/M/L）</b>：S 為單純換料（免認證）；M 涉及結構變更（需重新認定）；L 涉及改模。開案時依初步評估選擇，執行中若範圍擴大，系統會自動提醒您升級。</li>' +
            '<li><b>PM 協調工時（防呆保護）</b>：設變不是只有 RD 在忙——每張單都預設保留 PM 的跨部門協調時間。多案疊加總負載超過 100% 時，系統會發出排擠告警，避免隱形過勞。</li>' +
          '</ol>'
      })
    : App.buildHintBox({
    key: 's1-sched-tips', icon: 'ti-info-circle', title: '排程小秘訣', summary: '怎麼填日期決定排程方向', collapsed: false,
    bodyHtml:
      '<div class="s1-tips-line"><span class="s1-tips-dot"></span>只填開始日：自動順推，算出預計完工日。</div>' +
      '<div class="s1-tips-line"><span class="s1-tips-dot"></span>只填上市日期：自動倒推最晚開工日<b class="s1-tips-warn">（若發現來不及，會自動改為建議最快完工日）</b>。</div>' +
      '<div class="s1-tips-line"><span class="s1-tips-dot"></span>兩者皆填齊：精算時間是否足夠。<b class="s1-tips-warn">若發生超時衝突（如目前顯示：時程不足），點擊「下一步」後系統將引導您透過智慧排程面板一鍵優化。</b></div>' +
      '<div class="s1-tips-line s1-tips-cap"><i class="ti ti-info-circle"></i>若有多個產品規格（如 7.3kW ／ 2.2kW），點擊主案右側 ＋【新增子案】即可獨立排程。</div>'
  });
  // 甘特三色 HintBox（瘦身：只留甘特顏色說明；大局狀態說明改 hover 燈號顯示。預設收起）
  const helpBody =
    '<div class="slack-help-ambox"><i class="ti ti-alert-triangle"></i><span>須在<span class="slack-help-hl">開始與上市日期皆填齊</span>時，各開發階段才會觸發以下顏色；只填單一日期，甘特圖維持預設單色。</span></div>' +
    '<div class="slack-help-grid">' +
      '<div class="slack-help-cell"><span class="slack-dot sd-green"></span><div><div class="slack-help-ct">綠色 ── 安全</div><div class="slack-help-cd">完工日比該段 Deadline 提前 5 天以上。</div></div></div>' +
      '<div class="slack-help-cell"><span class="slack-dot sd-yellow"></span><div><div class="slack-help-ct">黃色 ── 警告</div><div class="slack-help-cd">完工日離該段 Deadline 僅差 0～4 天。</div></div></div>' +
      '<div class="slack-help-cell"><span class="slack-dot sd-red"></span><div><div class="slack-help-ct">紅色 ── 延誤</div><div class="slack-help-cd">完工日已落在該段 Deadline 之後。</div></div></div>' +
    '</div>';
  const hint = App.buildHintBox({ key: 's1-slack-help', icon: 'ti-info-circle', title: '甘特圖階段顏色說明', summary: '一分鐘看懂各階段排程緊迫度', bodyHtml: helpBody, collapsed: true });
  // 頂部：專案名稱（label+窄 input） + 範本 橫排（辨識顏色欄位已移除）
  const top =
    '<div class="s1-top">' +
      '<div class="s1-top-col"><span class="s1-top-label">專案名稱</span><input type="text" class="s1-proj-name" value="範例專案" placeholder="專案名稱" oninput="App._s1SyncMainName();App._s1RefreshPreview()"></div>' +
      (App._s1Ecn
        ? (tplAll('ecn').length > 1 ? '<div class="s1-top-col"><span class="s1-top-label">選擇範本</span><select class="s1-tpl-sel" onchange="App._s1Ecn.tplId=this.value;App._s1RefreshPreview()">' +
            tplAll('ecn').map(t => '<option value="' + U.esc(t.templateId) + '"' + (t.templateId === App._s1Ecn.tplId ? ' selected' : '') + '>' + U.esc(t.templateName) + '</option>').join('') + '</select></div>' : '')
        : '<div class="s1-top-col"><span class="s1-top-label">選擇範本</span><select class="s1-tpl-sel" onchange="App._s1TplId=this.value;App._s1RefreshPreview()">' +
            tplAll('npi').map(t => '<option value="' + U.esc(t.templateId) + '"' + (t.templateId === App._s1TplId ? ' selected' : '') + '>' + U.esc(t.templateName) + '</option>').join('') + '</select></div>') +
      // §19.6.2 A：NPI 立案捕捉「目標 BOM 成本/台」＋「預估售價/台」（立案主檔屬性·選填·存 targetUnitCostBase/unitSellPriceBase→機種繼承）；ECN 用 targetSavePerUnit 不顯此
      (!App._s1Ecn ? '<div class="s1-top-col"><span class="s1-top-label">目標 BOM 成本 / 台（選填）</span><input type="number" class="s1-src-in" id="s1-npi-tuc" min="0" step="1" placeholder="例：1200（元/台）"></div>' +
        '<div class="s1-top-col"><span class="s1-top-label">預估售價 / 台（選填 · 開毛利）</span><input type="number" class="s1-src-in" id="s1-npi-usp" min="0" step="1" placeholder="例：2000（元/台）"></div>' : '') +
    '</div>';
  // §19.10 A.1（2026-07-02 覆核修訂）：型別 Banner 拔除——不可轉警示改「按建立時」一次性防呆彈窗（_stage2Commit）；
  // ECN 專屬列（分級 S/M/L＋分級說明行／ROI 下拉＋原因／單號）
  const ecnMetaTop = App._s1Ecn ? App._s1EcnMetaTopHtml() : '';        // 需求單號＋背景（日期卡前）
  const ecnMetaBottom = App._s1Ecn ? App._s1EcnMetaBottomHtml() : '';  // 設變類型＋分級（日期卡後）
  // §19.10 A：ECN 名冊挪前到 Stage 1（複用共用部門元件，讀 App._tplDepts；套範本依「部門→人」帶擔當）＋ 目的 HintBox（賦能非麻煩）
  // 名冊 HintBox 預設展開（Paul 定版：讓人一眼知道這區要填什麼、為什麼填）
  const rosterHint = App._s1Ecn ? App.buildHintBox({
    key: 's1-roster-help', icon: 'ti-info-circle', title: '為什麼要先填名冊？', summary: '先填人，後面全自動帶入', collapsed: false,
    bodyHtml:
      '<ol class="s1-ecn-helpol">' +
        '<li><b>自動帶擔當</b>：套範本時系統依「部門 → 人」把名冊自動填進各任務的擔當欄，不用一筆一筆指派。</li>' +
        '<li><b>大表下拉直選</b>：後續任務大表的「擔當」欄＝直接下拉選名冊，改人一鍵完成。</li>' +
        '<li><b>負荷自動計算</b>：每個人的投入比例會自動疊進部門／個人負荷，跨案同人同日超過 100% 立即紅旗示警。</li>' +
      '</ol>'
  }) : '';
  const roster = App._s1Ecn
    ? '<div class="s1-roster"><div class="s1-prev-title">部門 / 負責人名冊</div>' + rosterHint + App._deptEditorHtml() + '</div>'
    : '';
  // 預覽區塊（本步只主案一條；甘特＋真燈號膠囊由 _s1PreviewBlocksHtml 建，date 改動時局部重畫此容器）
  const previewBlocks = '<div id="s1-prev-blocks">' + App._s1PreviewBlocksHtml() + '</div>';
  // 隱藏全域 topbar（智慧排程鈕/重複標題不屬此頁）；本頁自帶麵包屑 + 大標題。（flow 接線後離開頁面再恢復）
  const tb = document.querySelector('.main > .topbar');
  if (tb) tb.classList.add('topbar-hidden');
  document.querySelectorAll('.page').forEach(pg => pg.classList.remove('active'));
  const page = document.getElementById('page-stage1');
  page.classList.add('active');
  page.innerHTML =
    '<div class="s1-preview' + (App._s1Ecn ? ' s1-ecnpage' : '') + '">' +
      '<div class="s1-pagehd">' +
        '<div class="s1-crumb">總儀表板 <span class="s1-crumb-sep">/</span> ' + (App._s1Ecn ? '新增設變案' : '新增專案') + '</div>' +
        '<div class="s1-pagetitle">' + (App._s1Ecn ? '套用範本創建 · 設變案' : '套用範本創建') + '</div>' +
        (App._s1Ecn ? '<div class="s1-pagesub">點 S / M / L 看時程與 PM 負荷即時變化。排程模式由你填的日期系統自判。</div>' : '') +
      '</div>' +
      top +
      tips +
      ecnMetaTop +
      (App._s1Ecn
        ? '<div class="s1-sched-frame"><div class="s1-sched-lbl">排程設定（開始日/上市日期＋設變分級，共同決定下方甘特）</div>' +
            '<div class="s1-cases">' + casesHtml + addCase + '</div>' + ecnMetaBottom + '</div>'
        : '<div class="s1-cases">' + casesHtml + addCase + '</div>') +
      '<div class="s1-prev-section">' +
        '<div class="s1-prev-title">階段區間預覽</div>' +
        hint +
        previewBlocks +
      '</div>' +
      roster +
      '<div class="stage2-foot">' +
        '<button class="tb-action ghost" onclick="App._s1Back()">上一步</button>' +
        '<button class="tb-action" onclick="App._flowStage1Next()">' + (App._s1Ecn ? '建立專案' : '下一步：檢視任務') + '</button>' +
      '</div>' +
    '</div>';
  // date input 改動即時重算改用各案卡 inline onchange（支援動態新增的子案卡，§4.8.7.4b 3-5）
  App._s1SyncMainName();     // 初始把專案名帶入主案名（未手改前）
  App._s1RefreshPreview();   // DOM 就緒後校正一次：依實際輸入（初始留空）同步動態提示與甘特空狀態
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ─── §19.10 A.1 ECN 開案專屬列（分級 S/M/L＋分級說明行／ROI 下拉＋原因分類／單號）───
// 分級/原因/單號值活在 DOM＋_s1Ecn 狀態；S/M/L 切換只重繪膠囊與預覽（不整頁重繪，日期輸入不掉）。
// 各級白話說明（選型頁文案濃縮＋PM Effort）：點誰顯示誰，掛按鈕列下方（同日期 dynhint 模式）。
App._S1_SZ_HINT = {
  S: '單純零件替代或文件修改，免安規重測——「評估 → 改圖 → 結案」3 階段快速放行。PM 常駐 Effort 15%。',
  M: '牽涉結構變更的中型案件，標準 6 階段流程，含實體打樣、品保測試與安規驗證檢核。PM 常駐 Effort 20%。',
  L: '改模或高風險大型案件，6 階段外強制追加跨部門「DR 設計審查」關卡，嚴格卡控。PM 常駐 Effort 40%。',
};
// §19.6.1 #1：設變類型＝可點選 Radio Cards（取代下拉），選中亮邊框＋琥珀底＋右上 ✓；文案拆「適用情境／系統結算模式」
App._s1RoiCardsHtml = function(sel) {
  const benefitOn = sel !== 'forced';
  const card = (type, on) => {
    const cls = 's1-roicard' + (on ? ' on' : '');
    const check = on ? '<span class="s1-rc-check">✓</span>' : '';
    if (type === 'benefit') {
      return '<div class="' + cls + '" onclick="App._s1SelectRoi(\'benefit\')">' + check +
        '<div class="s1-rc-h">效益型・主動成本調降</div>' +
        '<div class="s1-rc-sec"><span class="s1-rc-lbl">適用情境</span>針對<b>換料、議價</b>等主動降低 BOM 成本之變更案。</div>' +
        '<div class="s1-rc-sec"><span class="s1-rc-lbl">系統結算模式</span>將啟用 ROI 計算，結算面板顯示「<b>回本期</b>」與「<b>N 年淨效益</b>」，評估每台成本降幅。</div></div>';
    }
    return '<div class="' + cls + '" onclick="App._s1SelectRoi(\'forced\')">' + check +
      '<div class="s1-rc-h">被迫型・不可抗力</div>' +
      '<div class="s1-rc-sec"><span class="s1-rc-lbl">適用情境</span>針對料件<b>停產 (EOL)</b>、<b>法規安規變更</b>或設計品質修正之案件。</div>' +
      '<div class="s1-rc-sec"><span class="s1-rc-lbl">系統結算模式</span>不適用回本計算，結算面板轉為評估「<b>合約／變更總代價</b>」與每台成本最小化損失。</div></div>';
  };
  return card('benefit', benefitOn) + card('forced', !benefitOn);
};
App._s1SelectRoi = function(v) {
  const h = document.getElementById('s1-ecn-roi'); if (h) h.value = v;
  const c = document.getElementById('s1-roi-cards'); if (c) c.innerHTML = App._s1RoiCardsHtml(v);
};
// §19.6.1 #1 欄位重排：上半（單號＋背景＋設變類型）放日期卡前；下半（設變分級）放日期卡後——日期卡緊貼設變類型底下。
App._s1EcnMetaTopHtml = function() {
  return '<div class="s1-ecnmeta">' +
    '<div class="s1-ecnmeta-col">' +
      '<span class="s1-top-label">需求單號（選填）<span class="s1-qmark">?<span class="s1-qtip">此單號往後會與正式 ECN 單號關聯，記錄在專案內頁中，作為開案與結案的追溯紀錄。</span></span></span>' +
      '<input type="text" id="s1-ecn-src" class="s1-src-in" placeholder="觸發此案的客訴單或異常單號">' +
    '</div>' +
    '<div class="s1-ecnmeta-col">' +
      '<span class="s1-top-label">設變背景與原因（簡述 2～3 句即可）</span>' +
      '<textarea id="s1-ecn-reason" class="s1-reason-in" rows="2" placeholder="請描述變更背景，例：客戶反映壓縮機外殼異音，需增加緩衝墊片"></textarea>' +
    '</div>' +
    '<div class="s1-ecnmeta-col">' +
      '<span class="s1-top-label">設變類型（點卡片選擇，決定結案怎麼算錢）</span>' +
      '<input type="hidden" id="s1-ecn-roi" value="benefit">' +
      '<div class="s1-roicards" id="s1-roi-cards">' + App._s1RoiCardsHtml('benefit') + '</div>' +
    '</div>' +
    '<div class="s1-ecnmeta-col">' +
      '<span class="s1-top-label">目標成本調降 / 台（選填 · 效益型結案達成率基準）</span>' +
      '<input type="number" id="s1-ecn-target" class="s1-src-in" min="0" step="1" placeholder="例：120（單位：元/台）">' +
    '</div>' +
  '</div>';
};
App._s1EcnMetaBottomHtml = function() {
  const size = App._s1Ecn.size;
  const szBtn = (s, lbl) => '<button type="button" class="s1-szbtn' + (s === size ? ' on' : '') + '" data-size="' + s + '" onclick="App._s1SetEcnSize(\'' + s + '\')"><b>' + s + '</b><span>' + lbl + '</span></button>';
  return '<div class="s1-ecnmeta">' +
    '<div class="s1-ecnmeta-col">' +
      '<span class="s1-top-label">設變分級（S/M/L，點選看時程變化）</span>' +
      '<div class="s1-szrow">' + szBtn('S', '換料·免認證') + szBtn('M', '結構·需認定') + szBtn('L', '改模·認證') + '</div>' +
      '<div class="s1-szpanel" id="s1-sz-hint">' + App._S1_SZ_HINT[size] + '</div>' +
    '</div>' +
  '</div>';
};
// S/M/L 切換（§19.10 A.1 核心互動）：改分級 → 各案階段集重設為該級 sizeMeta＋膠囊/甘特/PM 條/排程建議/分級說明行即時重繪。
// renames 保留（keys 不在新階段集就不顯示，切回來仍在）；日期/名稱在 DOM 不動。
App._s1SetEcnSize = function(size) {
  if (!App._s1Ecn) return;
  App._s1Ecn.size = size;
  const _et2 = tplEcn();
  const meta = (_et2 && _et2.sizeMeta && _et2.sizeMeta[size]) || null;
  (App._s1Cases || []).forEach(c => { if (meta) c.stages = meta.stages.slice(); });   // ECN 案卡無膠囊列，只更新 state（甘特預覽吃 state）
  document.querySelectorAll('#page-stage1 .s1-szbtn').forEach(b => b.classList.toggle('on', b.dataset.size === size));
  const h = document.getElementById('s1-sz-hint'); if (h) h.textContent = App._S1_SZ_HINT[size] || '';
  App._s1RefreshPreview();
};
// 原因分類 → ROI 下拉自動推導（Cost Down＝效益型、其餘＝被迫型；§19.2 可覆寫——手動改過下拉後不再自動動它）。

// _s1FallbackCase：第一階段預覽 demo 假案的階段清單來源（範本缺時退此），名稱/日期已不再使用。
App._s1FallbackCase = function() {
  return { name: '7.3kW 主案', start: '2026-03-02', end: '2026-12-28', light: 'green', slack: 12, overDays: 0,
    stages: [
      { stage: '設計', start: '2026-03-02', end: '2026-05-15' },
      { stage: '手工機', start: '2026-05-18', end: '2026-07-31' },
      { stage: '性試', start: '2026-08-03', end: '2026-10-09' },
      { stage: '量試', start: '2026-10-12', end: '2026-12-28' },
    ] };
};

// _s1CaseByKey：依 key 取案狀態（§4.8.7.4b 3-5 每案獨立 stages/renames）。
App._s1CaseByKey = function(key) { return (App._s1Cases || []).find(x => x.key === key) || null; };

// _s1CaseColHtml：渲染一張案卡（主案或子案）；名稱/日期/動態提示/階段膠囊各自獨立。
App._s1CaseColHtml = function(c, isMain) {
  const pill = isMain ? '<span class="stage-cap-pill cap-0">主案</span>' : '<span class="stage-cap-pill cap-1">子案</span>';
  const del = isMain ? '' : '<button class="s1-case-del" title="刪除子案" onclick="App._s1DelSubcase(\'' + c.key + '\')"><i class="ti ti-x"></i></button>';
  const nameVal = isMain ? '' : (c.dname || '');
  const ph = isMain ? '主案名稱' : '子案名稱（例：2.2kW）';
  return '<div class="s1-case-col case-card ' + (isMain ? 's2-case-main' : 's2-case-other') + '" data-case="' + (isMain ? 'main' : c.key) + '" data-case-key="' + c.key + '" data-tplvariant="' + c.templateVariant + '">' +
      // ECN 單案制：不渲染主案膠囊/名稱欄——上方「專案名稱」即唯一值（_s1CollectInput fallback 帶入）
      (App._s1Ecn ? '' :
      '<div class="s1-case-head">' + pill +
        '<input type="text" class="s1-case-name" value="' + U.esc(nameVal) + '" placeholder="' + ph + '" oninput="App._s1RefreshPreview()">' + del +
      '</div>') +
      '<div class="s1-case-dates">' +
        '<label>開始日<input type="date" class="s1-in-start" value="" onchange="App._s1RefreshPreview()"></label>' +
        '<label>上市日期<input type="date" class="s1-in-end" value="" onchange="App._s1RefreshPreview()"></label>' +
      '</div>' +
      '<div class="s1-dynhint s1-dynhint-init">' + App._s1DynHintHtml('', '', '') + '</div>' +
      // ECN 不渲染階段膠囊列（Gemini 覆核痛點三：與下方甘特預覽重複——ECN 階段由 S/M/L 分級決定，增刪改名留 NPI）
      (App._s1Ecn ? '' :
      '<div class="s1-stage-hd">開發階段</div>' +
      '<div class="s1-stage-note"><i class="ti ti-info-circle"></i>此處直接決定專案流程（由左至右）：點擊膠囊可重新命名和刪除階段，按 ＋ 可增加階段。<br><b class="s1-stage-note-em">調整後系統將自動重排下方甘特圖、並重新精算時間餘裕與燈號。</b></div>' +
      '<div class="s1-stagelist">' + App._s1StageChipsHtml(c) + '</div>') +
    '</div>';
};

// _s1AddSubcase：新增一張子案卡（預設帶範本另案階段＋唯一預設名），append 不重繪其他卡。
App._s1AddSubcase = function() {
  if (!App._s1Cases) return;
  const _tpl = App._s1Tpl();
  const tplCases = (_tpl && _tpl.cases) ? _tpl.cases : [];
  const tplSub = (tplCases[1] ? tplCases[1].stages : (tplCases[0] ? tplCases[0].stages : [])).slice();
  App._s1SubSeq = (App._s1SubSeq || 0) + 1;
  const c = { key: 'c' + App._s1SubSeq, templateVariant: '另案', stages: tplSub, renames: {}, dname: '子案 ' + App._s1SubSeq };
  App._s1Cases.push(c);
  const wrap = document.querySelector('#page-stage1 .s1-cases');
  const addBox = wrap ? wrap.querySelector('.s1-add-case') : null;
  if (wrap && addBox) {
    const tmp = document.createElement('div');
    tmp.innerHTML = App._s1CaseColHtml(c, false);
    if (tmp.firstChild) wrap.insertBefore(tmp.firstChild, addBox);
  }
  App._s1RefreshPreview();
};

// _s1DelSubcase：刪一張子案卡（移除狀態＋DOM），重算預覽。
App._s1DelSubcase = function(key) {
  App._s1Cases = (App._s1Cases || []).filter(x => x.key !== key);
  const col = document.querySelector('#page-stage1 .s1-case-col[data-case-key="' + key + '"]');
  if (col) col.remove();
  App._s1RefreshPreview();
};

// _s1PreviewBlocksHtml：階段區間預覽（甘特＋真燈號膠囊）。初次 render 與 date 改動 re-render 共用單一真實來源。
//   燈號吃 _s1ComputePreview 各案真 slack（interval 雙填才有；單填回 null＝不顯示膠囊）；無真資料退回 demo 案不空白。
App._s1PreviewBlocksHtml = function(real) {
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  const miniGantt = (stages) => {
    const toNum = (d) => d ? Date.parse(d) : NaN;
    const allS = stages.map(s => toNum(s.start)).filter(n => !isNaN(n));
    const allE = stages.map(s => toNum(s.end)).filter(n => !isNaN(n));
    const minN = allS.length ? Math.min.apply(null, allS) : 0;
    const maxN = allE.length ? Math.max.apply(null, allE) : 0;
    const span = (maxN - minN) || 1;
    const shortD = (x) => { const p = String(x).split('-'); return (p[1] || '') + '/' + (p[2] || ''); };
    let rows = '';
    stages.forEach(r => {
      const a = toNum(r.start), b = toNum(r.end);
      const left = ((a - minN) / span) * 100;
      const width = Math.max(((b - a) / span) * 100, 1.5);
      rows +=
        '<div class="s2-grow">' +
          '<div class="s2-gname">' + U.esc(r.label || r.stage) + '</div>' +
          '<div class="s2-gbar-track"><div class="s2-gbar' + (r.light ? ' s2-gbar-' + r.light : '') + '" style="left:' + left + '%;width:' + width + '%"></div></div>' +
          '<div class="s2-gdate">' + shortD(r.start) + ' → ' + shortD(r.end) + '</div>' +
        '</div>';
    });
    return '<div class="s2-gantt-axis">' + rows + '</div>';
  };
  const lightTxt = (light, slack, overDays) => light === 'green' ? ('時程充足·餘裕 ' + slack + ' 天')
    : light === 'yellow' ? ('時程偏緊·餘裕 ' + slack + ' 天')
    : ('時程不足·超出 ' + overDays + ' 工作天');
  if (real === undefined) real = App._s1ComputePreview();
  if (!real || !real.length) return '';
  const PILL_IC = { green: 'ti-circle-check', yellow: 'ti-alert-circle', red: 'ti-alert-triangle' };
  const PILL_LB = { green: '時程充足', yellow: '時程偏緊', red: '時程不足' };
  const PILL_TIP = {
    green: '時程非常安全！整體進度皆在上市截止日控制範圍內。',
    yellow: '勉強能如期完成，但毫無緩衝。時程扣得很死，後續階段將非常緊湊。',
    red: '依照現有範本工期排下去將會超過上市截止日，建議重新調整人力或壓縮工期。'
  };
  // 逐案一張預覽卡（§4.8.7.4b 3-5）：有日期→真甘特＋燈號；無日期→骨架（用該案階段膠囊）＋引導
  const blockOf = (v, isMain) => {
    const cls = isMain ? 's2-case-main' : 's2-case-other';
    if (!v.stages || !v.stages.length) {
      const skel = (v.skelStages || []).map(lb =>
        '<div class="s2-grow"><div class="s2-gname">' + U.esc(lb) + '</div><div class="s2-gbar-track"><div class="s2-gbar s2-gbar-none"></div></div><div class="s2-gdate"></div></div>'
      ).join('');
      return '<div class="s1-prev-case case-card ' + cls + ' s1-prev-empty">' +
          '<div class="s1-prev-head"><span class="s1-prev-name">' + U.esc(v.name || '') + '</span></div>' +
          '<div class="s2-gantt-axis">' + skel + '</div>' +
          '<div class="s1-prev-empty-hint">請於上方輸入日期以產生進度預覽</div>' +
        '</div>';
    }
    const pill = v.light
      ? '<span class="s1-pill-wrap">' +
          '<span class="slack-pill slack-pill-' + v.light + '"><i class="ti ' + PILL_IC[v.light] + '"></i>' + lightTxt(v.light, v.slack, v.overDays) + '</span>' +
          '<span class="s1-pill-tip"><span class="s1-pill-tip-hd s1-tiphd-' + v.light + '"><i class="ti ' + PILL_IC[v.light] + '"></i>' + PILL_LB[v.light] + '</span>' + PILL_TIP[v.light] + '</span>' +
        '</span>'
      : '';
    // §19.10 A.1 PM 協調負荷條（Model Y 招牌）：ECN 模式甘特最下方固定一條、每案強制、不可降級；Effort 依 S15/M20/L40
    const _etPm = App._s1Ecn ? tplEcn() : null;
    const pmRow = (App._s1Ecn && _etPm && _etPm.sizeMeta && _etPm.sizeMeta[App._s1Ecn.size])
      ? '<div class="s1-pm-bar"><div class="s2-gname">PM 協調</div><div class="s1-pm-track">常駐 · 全程鎖定 · Effort ' + _etPm.sizeMeta[App._s1Ecn.size].pmEffort + '%</div><div class="s2-gdate">全程</div></div>'
      : '';
    return '<div class="s1-prev-case case-card ' + cls + '">' +
        '<div class="s1-prev-head">' +
          '<span class="s1-prev-name">' + U.esc(v.name || '') + '</span>' +
          '<span class="s1-prev-range">' + fmtD(v.start) + ' → ' + fmtD(v.end) + '</span>' +
          pill +
        '</div>' +
        miniGantt(v.stages) +
        pmRow +
      '</div>';
  };
  return real.map((v, i) => blockOf(v, i === 0)).join('');
};

// _s1DynHintHtml：動態狀態提示（文-C）依填法切情境——雙空=初始引導(CTA)／只開始=A順推／只上市=B倒推
//   ／只上市但來不及=C防呆(改今天順推、報最快完工日)／兩者皆填=D雙向精算。meta=_s1ComputePreview 該案資訊。
App._s1DynHintHtml = function(startDate, endDate, meta) {
  // 雙空＝初始引導：尚無基準日，給行動導引，不顯示「排程中」假象
  if (!startDate && !endDate) {
    return '<i class="ti ti-calendar-event"></i><span>請輸入或選擇日期：填入「開始日」或「上市日期」，系統將自動為您啟動智慧時程推算。</span>';
  }
  const fmt = (x) => x ? String(x).replace(/-/g, '/') : '';
  const eff = App._effScheduleDir(startDate, endDate, 'forward');
  let ic = 'ti-arrow-narrow-right', txt;
  if (eff === 'interval') {
    txt = '雙向精算中：已幫您比對開工與上市日期，中間的彈性天數已呈現在下方的「餘裕燈號」中。';
  } else if (eff === 'backward' && meta && meta.backFallback) {
    // 情境C：倒推最晚開工日已過 → 改今天順推、報最快完工日
    ic = 'ti-alert-triangle';
    const d = fmt(meta.forwardFinish);
    txt = '時空警報！上市日期太緊，最晚開工日已過。系統已自動改以「今天」開工順推' + (d ? ('，最快完工日為 ' + d + '。') : '。');
  } else if (eff === 'backward') {
    const d = meta ? fmt(meta.backStart) : '';
    txt = d ? ('逆向倒推中：已為您推算出最晚必須在 ' + d + ' 前開工，才趕得上上市。')
            : '逆向倒推中：系統正從您的上市日期往前推算最晚開工日。';
  } else {
    txt = '正向排程中：系統正從您的開工日往後順推，自動算出最後的預計完工日。';
  }
  return '<i class="ti ' + ic + '"></i><span>' + txt + '</span>';
};

// _s1RefreshPreview：date/階段膠囊改動時即時重算，局部重畫預覽容器＋同步更新動態提示（不動輸入卡、保留焦點）。
App._s1RefreshPreview = function() {
  const real = App._s1ComputePreview();
  const c = document.getElementById('s1-prev-blocks');
  if (c) c.innerHTML = App._s1PreviewBlocksHtml(real);
  // 各案動態提示：逐 col 依自己日期＋該案 meta 切情境（文-C；§4.8.7.4b #1＋3-5）
  const cols = document.querySelectorAll('#page-stage1 .s1-case-col');
  cols.forEach((col, i) => {
    const hintBox = col.querySelector('.s1-dynhint');
    if (!hintBox) return;
    const s = ((col.querySelector('.s1-in-start')) || {}).value || '';
    const e = ((col.querySelector('.s1-in-end')) || {}).value || '';
    const meta = (real && real[i]) ? real[i] : null;
    hintBox.innerHTML = App._s1DynHintHtml(s, e, meta);
    hintBox.classList.toggle('s1-dynhint-init', !s && !e);   // 雙空＝淡化引導態
    hintBox.classList.toggle('s1-dynhint-alert', !!(meta && meta.backFallback));   // 情境C 來不及＝紅底警示
  });
};

// _s1SyncMainName：頂部專案名帶入主案名——專案名每次修改都覆蓋主案名；改主案名不回寫專案名（單向）。
//   （此關聯只在「專案↔各案」之間；主案與子案名彼此不連動，留待 3-5 子案。）
App._s1SyncMainName = function() {
  const page = document.getElementById('page-stage1');
  if (!page) return;
  const proj = page.querySelector('.s1-proj-name');
  const main = page.querySelector('.s1-case-col[data-case="main"] .s1-case-name');
  if (!proj || !main) return;
  main.value = proj.value;
};

App._s1CollectInput = function() {
  const page = document.getElementById('page-stage1');
  if (!page) return null;
  const projectName = (page.querySelector('.s1-proj-name') || {}).value || '';
  const color = PROJ_COLORS[0] || '';   // 專案色欄位已移除·保留預設值不破壞既有流程簽章
  const cases = [];
  page.querySelectorAll('.s1-case-col').forEach(col => {
    const key = col.dataset.caseKey;
    const cs = App._s1CaseByKey(key);
    const nameEl = col.querySelector('.s1-case-name');
    // ECN 單案制無案名欄 → 用上方專案名稱當 variant 名（唯一值）；NPI 照舊讀案卡輸入
    const rawName = nameEl ? (nameEl.value || '').trim() : (App._s1Ecn ? (projectName || '').trim() : '');
    const variantName = rawName || ('案-' + (key || ''));   // 空名退回唯一 key（防 applyTemplate variantNameToId 撞 id）
    const templateVariant = col.dataset.tplvariant || '主案';
    const startDate = (col.querySelector('.s1-in-start') || {}).value || '';
    const endDate = (col.querySelector('.s1-in-end') || {}).value || '';
    const direction = App._effScheduleDir(startDate, endDate, 'forward');
    const selectedStages = cs ? cs.stages.slice() : [];
    cases.push({ variantName, templateVariant, startDate, endDate, direction, selectedStages, renames: cs ? cs.renames : {} });
  });
  const tucBase = parseFloat((page.querySelector('#s1-npi-tuc') || {}).value) || 0;   // §19.6.2 A：NPI 立案基準（ECN 無此欄→0）
  const uspBase = parseFloat((page.querySelector('#s1-npi-usp') || {}).value) || 0;
  return { projectName, color, cases, targetUnitCostBase: tucBase, unitSellPriceBase: uspBase };
};

// _s1ColorStagesForward：interval 各段上色（§4.8.7.4b #2）。從開始日順推取各段自然完工日，
//   比對上市日期算 margin（>5 綠／0~4 黃／<0 紅，同燈號門檻），並把 stage 起訖改成順推值（讓超出上市日視覺可見）。
//   用 clone 跑正向 computeSchedule，不動 res.tasks（pill 仍吃 backward 結果，互不影響）。
App._s1ColorStagesForward = function(res, v, stages, startDate, endDate) {
  if (!startDate || !endDate) return;
  const fwd = res.tasks.filter(t => t.variant === v.id).map(t => Object.assign({}, t));
  fwd.forEach(t => { if (!t.predecessor) t.plannedStart = startDate; });
  const fsch = computeSchedule(fwd);
  const fm = new Map(); fsch.results.forEach(r => fm.set(r.taskId, r));
  const fStage = {};
  fwd.forEach(t => {
    const r = fm.get(t.id);
    if (!r || !r.suggestedStart) return;
    const stage = (t.desc || '').split(' / ')[0] || '其他';
    if (!fStage[stage]) fStage[stage] = { start: r.suggestedStart, end: r.suggestedEnd };
    else {
      if (r.suggestedStart < fStage[stage].start) fStage[stage].start = r.suggestedStart;
      if (r.suggestedEnd > fStage[stage].end) fStage[stage].end = r.suggestedEnd;
    }
  });
  stages.forEach(s => { const f = fStage[s.stage]; if (f) { s.start = f.start; s.end = f.end; } });   // 改順推落點（超出上市日視覺可見）
  App._chainStages(stages);   // 階段順序鏈（跳階段→下游不浮到前面）
  stages.forEach(s => {
    const margin = (s.end <= endDate)
      ? D.workdaysBetween(s.end, endDate) - 1
      : -(D.workdaysBetween(endDate, s.end) - 1);
    s.light = margin >= 5 ? 'green' : (margin >= 0 ? 'yellow' : 'red');
  });
};

// 階段順序鏈（共用）：依顯示順序，某段起點若早於前段結束（跳階段→前置被剝離浮到前面），
// 改「接在前段之後」（保留原工期跨度）。idempotent：已是順序排列則不動。Stage 1／2 各模式甘特共用。
App._chainStages = function(stages) {
  let prevEnd = '';
  (stages || []).forEach(s => {
    if (!s || !s.start || !s.end) return;
    if (prevEnd && s.start < prevEnd) {
      const span = Math.max(D.workdaysBetween(s.start, s.end) - 1, 0);
      s.start = D.fmt(D.addWorkdays(prevEnd, 1), 'iso');
      s.end = D.fmt(D.addWorkdays(s.start, span), 'iso');
    }
    prevEnd = s.end;
  });
};

// 階段反向順序鏈（backward 專用）：依顯示順序，把末段對齊 deadline、其餘各段依序往前接（保留各段工期跨度）。
// 修 backward 跳階段時各段 lateFinish 全錨在 deadline → 甘特塌成一團、順序錯亂（坑6 的 backward 版）。
// idempotent：已正確序列（末段貼齊 deadline）則近似不變。回算後首段起點＝真正的最晚開工日。
App._chainStagesBackward = function(stages, deadline) {
  let nextStart = '';
  for (let i = (stages || []).length - 1; i >= 0; i--) {
    const s = stages[i];
    if (!s || !s.start || !s.end) continue;
    const span = Math.max(D.workdaysBetween(s.start, s.end) - 1, 0);
    s.end = nextStart ? D.fmt(D.addWorkdays(nextStart, -1), 'iso') : deadline;
    s.start = D.fmt(D.addWorkdays(s.end, -span), 'iso');
    nextStart = s.start;
  }
};

App._s1ComputePreview = function() {
  const tpl = App._s1Tpl();
  if (!tpl) return null;
  const input = App._s1CollectInput();
  if (!input || !input.cases.length) return null;
  const res = App.applyTemplate(tpl, input);
  const byVariant = [];
  res.variants.forEach((v, i) => {
    const vtasks = res.tasks.filter(t => t.variant === v.id && t.plannedStart && t.plannedEnd);
    const stageMap = {};
    vtasks.forEach(t => {
      const stage = (t.desc || '').split(' / ')[0] || '其他';
      if (!stageMap[stage]) stageMap[stage] = { stage, start: t.plannedStart, end: t.plannedEnd };
      else {
        if (t.plannedStart < stageMap[stage].start) stageMap[stage].start = t.plannedStart;
        if (t.plannedEnd > stageMap[stage].end) stageMap[stage].end = t.plannedEnd;
      }
    });
    const stages = (v.stages || []).map(s => stageMap[s]).filter(Boolean);
    const _rn = (input.cases[i] && input.cases[i].renames) || {};   // 該案改名表（§4.8.7.4b 3-5 每案獨立）
    stages.forEach(s => { s.label = (_rn[s.stage] != null) ? _rn[s.stage] : s.stage; });   // 顯示名（改名只動顯示，id=s.stage 不變）
    const skelStages = ((input.cases[i] && input.cases[i].selectedStages) || []).map(id => (_rn[id] != null) ? _rn[id] : id);   // 空狀態骨架列（顯示名）
    // 真燈號（§4.8.7.4b 3-3）：interval 案 plannedStart/End＝lateStart/lateFinish（_reschedulePreview :2543 映射），
    // 餵既有 _computeSlack 重算（單一真實來源、不重跑排程）；start/end 缺一→回 null→不顯示膠囊。
    const vsch = v.schedule || {};
    const pseudoResults = vtasks.map(t => ({ lateStart: t.plannedStart, lateFinish: t.plannedEnd }));
    const sl = App._computeSlack(pseudoResults, vsch.startDate, vsch.endDate);
    // per-stage 上色＋方向情境（§4.8.7.4b #2＋情境C 防呆）
    const eff = App._effScheduleDir(vsch.startDate, vsch.endDate, vsch.direction);
    let backStart = '', backFallback = false, forwardFinish = '';
    if (eff === 'interval') {
      // interval：順推各段、比對上市日期算 margin → 綠/黃/紅，並改 stage 起訖為順推值
      App._s1ColorStagesForward(res, v, stages, vsch.startDate, vsch.endDate);
    } else if (eff === 'backward' && vsch.endDate) {
      // 先反向串接：末段對齊上市日、各段依序往前（修跳階段塌 deadline／順序錯亂）。回算後首段起點＝真最晚開工日。
      App._chainStagesBackward(stages, vsch.endDate);
      const todayIso = D.fmt(D.today(), 'iso');
      backStart = stages.length ? (stages[0].start || '') : '';
      if (backStart && backStart < todayIso) {
        // 情境C 防呆：真最晚開工日早於今天＝來不及 → 改以今天順推上色（顯示紅/不足）＋報最快完工日
        App._s1ColorStagesForward(res, v, stages, todayIso, vsch.endDate);
        backStart = stages.length ? (stages[0].start || backStart) : backStart;
        backFallback = true;
        forwardFinish = stages.reduce((m, s) => (s.end > m) ? s.end : m, '');
      } else {
        // 來得及：各段依序貼齊上市日，比對 deadline 上色（餘裕 ≥5 綠／0~4 黃／<0 紅）
        stages.forEach(s => {
          if (!s.end) return;
          const margin = (s.end <= vsch.endDate) ? D.workdaysBetween(s.end, vsch.endDate) - 1 : -(D.workdaysBetween(vsch.endDate, s.end) - 1);
          s.light = margin >= 5 ? 'green' : (margin >= 0 ? 'yellow' : 'red');
        });
      }
    } else {
      App._chainStages(stages);   // forward（只填開始日）／倒推來得及：套順序鏈，跳階段時下游不浮到前面
    }
    const allS = stages.map(s => s.start).filter(Boolean);
    const allE = stages.map(s => s.end).filter(Boolean);
    const caseEnd = allE.length ? allE.reduce((a,b)=>a>b?a:b) : '';
    // 整體燈號/餘裕：interval/backward 一律用「串接後各段最末落點 vs 上市日」算（與甘特同源），
    // 修「膠囊綠但甘特紅」矛盾——跳階段時 backward 把各段塌到 deadline 使 _computeSlack 低估 needed、誤判餘裕為正。
    let light = sl ? sl.light : '', slack = sl ? sl.slack : null, overDays = sl ? sl.overDays : null;
    if (caseEnd && vsch.endDate && (eff === 'interval' || eff === 'backward')) {
      const m = (caseEnd <= vsch.endDate) ? D.workdaysBetween(caseEnd, vsch.endDate) - 1 : -(D.workdaysBetween(vsch.endDate, caseEnd) - 1);
      light = m >= 5 ? 'green' : (m >= 0 ? 'yellow' : 'red');
      slack = m;
      overDays = m < 0 ? Math.abs(m) : 0;
    }
    byVariant.push({
      id: v.id, name: v.name,
      start: allS.length ? allS.reduce((a,b)=>a<b?a:b) : '',
      end: caseEnd,
      stages: stages,
      light: light,
      slack: slack,
      overDays: overDays,
      dir: eff, backStart: backStart, backFallback: backFallback, forwardFinish: forwardFinish,
      skelStages: skelStages,
    });
  });
  return byVariant;
};

// §4.8.7.4b 塊3a-刀1 第二步追加1 + 3-5：開發階段膠囊 inline 編輯（事件委派，每案獨立）。
// 每案 _s1CaseByKey(key).stages 存「階段 id（範本階段碼，供排程比對）」；.renames{id:顯示名} 存改名
// （只動顯示、不動 id → applyTemplate 仍對到任務、不被砍）。膠囊事件靠 .s1-case-col[data-case-key] 找所屬案。
App._s1StageChipsHtml = function(c) {
  const arr = (c && c.stages) || [];
  const rn = (c && c.renames) || {};
  return arr.map((id, i) => {
    const label = (rn[id] != null) ? rn[id] : id;
    return '<span class="s1-stage-chip" data-idx="' + i + '"><span class="chip-text">' + U.esc(label) + '</span><span class="chip-del" title="刪除">×</span></span>';
  }).join('<i class="ti ti-chevron-right s1-stage-arrow"></i>') + '<span class="s1-stage-add" title="新增階段"><i class="ti ti-plus"></i></span>';
};
App._renderStageChips = function(key) {
  const col = document.querySelector('#page-stage1 .s1-case-col[data-case-key="' + key + '"]');
  const c = App._s1CaseByKey(key);
  if (col && c) { const box = col.querySelector('.s1-stagelist'); if (box) box.innerHTML = App._s1StageChipsHtml(c); }
};
App._stageChipToInput = function(textEl) {
  if (!textEl) return;
  const chip = textEl.closest('.s1-stage-chip'); if (!chip) return;
  const col = chip.closest('.s1-case-col'); if (!col) return;
  const key = col.dataset.caseKey;
  const c = App._s1CaseByKey(key); if (!c) return;
  const idx = +chip.getAttribute('data-idx');
  const id0 = c.stages[idx];
  const cur = (c.renames[id0] != null) ? c.renames[id0] : (id0 != null ? id0 : '');
  const inp = document.createElement('input');
  inp.type = 'text'; inp.className = 'chip-edit'; inp.value = cur;
  chip.classList.add('editing');
  textEl.style.display = 'none';
  const delEl = chip.querySelector('.chip-del'); if (delEl) delEl.style.display = 'none';
  chip.insertBefore(inp, textEl);
  inp.focus(); inp.select();
  let done = false;
  const commit = () => {
    if (done) return; done = true;
    const v = inp.value.trim();
    const id = c.stages[idx];
    if (v === '') {                          // 清空＝刪該段（連帶清 rename）
      c.stages.splice(idx, 1);
      if (id) delete c.renames[id];
    } else if (!id) {                        // 新增空膠囊命名：id 即輸入值（對到範本階段碼才有任務）
      c.stages[idx] = v;
    } else if (v !== id) {                   // 既有階段改名：只動顯示名、保留 id（任務不掉）
      c.renames[id] = v;
    } else {                                 // 改回原名：清掉 rename
      delete c.renames[id];
    }
    App._renderStageChips(key);
    App._s1RefreshPreview();   // 膠囊改名/增刪 → 即時重算甘特＋燈號（§4.8.7.4b 2b）
  };
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); }
    else if (ev.key === 'Escape') { inp.value = cur; inp.blur(); }
  });
};
App._bindStageChipEvents = function() {
  if (App._stageChipDelegated) return;   // 只綁一次（仿 §6.5 _taskTimeDelegated）
  App._stageChipDelegated = true;
  document.addEventListener('click', (e) => {
    const page = document.getElementById('page-stage1');
    if (!page || !page.classList.contains('active')) return;   // 僅第一階段頁作用
    const del = e.target.closest('.chip-del');
    if (del) {
      const chip = del.closest('.s1-stage-chip'); const col = chip && chip.closest('.s1-case-col');
      const c = col && App._s1CaseByKey(col.dataset.caseKey);
      if (chip && c) { const di = +chip.getAttribute('data-idx'); const id0 = c.stages[di]; c.stages.splice(di, 1); if (id0) delete c.renames[id0]; App._renderStageChips(col.dataset.caseKey); App._s1RefreshPreview(); }
      return;
    }
    const add = e.target.closest('.s1-stage-add');
    if (add) {
      const col = add.closest('.s1-case-col'); const c = col && App._s1CaseByKey(col.dataset.caseKey);
      if (c) {
        c.stages.push('');
        App._renderStageChips(col.dataset.caseKey);
        const chips = col.querySelectorAll('.s1-stage-chip');
        const last = chips[chips.length - 1];
        if (last) App._stageChipToInput(last.querySelector('.chip-text'));
      }
      return;
    }
    const txt = e.target.closest('.chip-text');
    if (txt) { App._stageChipToInput(txt); return; }
  });
};
App._bindStageChipEvents();

// 第③段上一步（路線B）：退回第②段並用 _createFlow.stage1Data 回填（部門先還原；_flowStep2 因 stage1Data 有值不重設 _tplDepts）。
App._flowStage3Back = function() {
  if (App._createFlow && App._createFlow.mode === 'excel') {
    this.showPage('workspace');
    App._flowStep2();
    const parsed = App._createFlow.excelParsed;
    const st = document.getElementById('pf-excelStatus');
    if (st && parsed && parsed.ok) {
      st.textContent = '✓ 已讀取「' + (parsed.projectName || '未命名') + '」共 ' + parsed.rows.length + ' 筆任務，按下一步檢視';
    }
    return;
  }
  const snap = App._createFlow ? App._createFlow.stage1Data : null;
  // 先把第③段 page 切掉、回到個人工作台（與舊退場一致），再開②
  this.showPage('workspace');
  if (!snap) { return App._flowStep1(); }   // 無快照（異常），退回①重來
  // 部門先還原（_flowStep2 因 stage1Data 有值不會預載，需手動還原）
  App._tplDepts = JSON.parse(JSON.stringify(snap.depts || []));
  // 開第②段（_flowStep2 讀 _createFlow.mode/stage1Data；stage1Data 有值故不重設 _tplDepts）
  App._flowStep2();
  // openModal 同步，DOM 就緒，開始回填
  const nameEl = document.getElementById('pf-name'); if (nameEl) nameEl.value = snap.name || '';
  const noteEl = document.getElementById('pf-note'); if (noteEl) noteEl.value = snap.note || '';
  const cs = snap.cases || [];
  // 主案卡（cases[0]）
  const mainCard = document.querySelector('#pf-tplBox .case-card.case-main');
  if (cs[0] && mainCard) {
    const m = cs[0];
    const mn = document.getElementById('pf-mainName'); if (mn) { mn.value = m.variantName || ''; mn.dataset.touched = '1'; }
    const ms = document.getElementById('pf-start'); if (ms) ms.value = m.startDate || '';
    const me = document.getElementById('pf-end'); if (me) me.value = m.endDate || '';
    const md = document.getElementById('pf-direction'); if (md) md.value = m.direction || 'forward';
    App._applyStagePicks(mainCard, m.selectedStages);
  }
  // 另案卡（cases[1..N]）：逐張生成 + 回填
  for (let i = 1; i < cs.length; i++) {
    const c = cs[i];
    App._tplAddOtherCase();
    const cards = document.querySelectorAll('#pf-otherCases .case-card.case-other');
    const card = cards[cards.length - 1];
    if (!card) continue;
    const vn = card.querySelector('.case-variant-name'); if (vn) vn.value = c.variantName || '';
    const st = card.querySelector('.case-start'); if (st) st.value = c.startDate || '';
    const en = card.querySelector('.case-end'); if (en) en.value = c.endDate || '';
    const dr = card.querySelector('.case-direction'); if (dr) dr.value = c.direction || 'forward';
    App._applyStagePicks(card, c.selectedStages);
  }
};

// 建立專案：步驟5 落地，吃 _tplPreview push/save（depts/variants 掛回 res.project + DATA push + Storage.save + 清 preview 防重複建）。
App._stage2Commit = function() {
  if (App._roGuard()) return;
  // §19.10 A.1（2026-07-02 覆核修訂）：ECN 建立前一次性防呆彈窗（取代常駐型別 Banner）——不可逆操作的最後閘門
  const ecnGate = App._createFlow && App._createFlow.ecn;
  if (ecnGate && !App._createFlow._ecnWarned) {
    App.confirmModal({
      icon: 'ti-settings', iconBg: '--amber-l', iconColor: '--amber-ink',
      title: '此案將建立為工程設變案（ECN）',
      msg: '建立後將使用設變專屬儀表板，<b>無法轉為一般開發案</b>。（S/M/L 分級之後仍可調整）確定建立？',
      okText: '確定建立', cancelText: '返回修改',
      onConfirm: function() { App._createFlow._ecnWarned = true; App._stage2Commit(); },
    });
    return;
  }
  const res = this._tplPreview;
  if (!res) { U.toast('\u26a0 無範本預覽資料，請重新套用範本', 'warning'); return; }
  // 掛回 project（同 performWbsImport），否則 task 的 dept/variant id 解析不到（步驟1 從 saveProject 挪來此落地步）
  res.project.depts = res.depts;
  res.project.variants = res.variants;
  // §19.10／§19.2 ECN 落地：寫設變專案欄位 ＋ 動態生成 PM 常駐協調任務（範本不含——工期＝全案跨度需排程後才知）
  const ecn = App._createFlow && App._createFlow.ecn;
  if (ecn && !res.project.ecnType) {
    Object.assign(res.project, {
      ecnType: true, size: ecn.size, changeReason: ecn.changeReason, roiType: ecn.roiType,
      sourceNo: ecn.sourceNo, ecnNo: ecn.ecnNo, targetSavePerUnit: ecn.targetSavePerUnit, status: 'active', loopCount: 0, scopeGrowthCount: 0, reopenCount: 0,
    });
    const ds = res.tasks.map(t => t.plannedStart).filter(Boolean).sort();
    const de = res.tasks.map(t => t.plannedEnd).filter(Boolean).sort();
    if (ds.length && de.length) {
      const s0 = ds[0], e0 = de[de.length - 1];
      const span = Math.max(D.workdaysBetween(s0, e0), 1);
      const dailyHours = (DATA.settings && DATA.settings.dailyHours) || 6;
      const pmDept = (res.depts || []).find(d => d.name === 'PM');
      res.tasks.push({
        id: U.id(), project: res.project.id, wbs: 99, parentWbsId: '',
        name: 'PM 設變協調／文件彙整（常駐）', desc: '全程 / PM 協調', category: 'deep', taskType: '任務',
        predecessor: '', durationDays: span, owner: '', dept: pmDept ? pmDept.id : '', role: 'PM',
        variant: (res.variants[0] || {}).id || null,
        start: '', end: '', plannedStart: s0, plannedEnd: e0, actualStart: '', actualEnd: '',
        progress: 0, status: 'pending', urgency: 'med',
        estHours: Math.round(span * dailyHours * (ecn.pmEffort / 100) * 10) / 10,   // §19.4 工時點數＝比例×日工時×工期
        method: '', canSplit: false, completedAt: null, createdAt: new Date().toISOString(),
        scheduledStart: '', scheduledEnd: '', synced: false, stage: '', subgroup: '',
        mustDeliver: false, deliverableType: '', requiredTask: true, mustIssue: false,
        deliverable: '', riskIssue: '', delivered: '', deliverableLink: '', note: '',
        effortRatio: ecn.pmEffort, taskAttr: 'baseline', isPmCoord: true,   // Model Y 常駐盾，不可降級（§19.4）
      });
    }
    // §19 問題2/3：ECN 為 live 專案 → 落地即清 endDate 轉 forward 並重排（開始為錨，_ecnForwardVariants），
    // 戰情室初次顯示與後續編輯一致、避免「首次改工期日期整批跳動」。工時點數不受日期影響，baselineHours 照算。
    App._ecnForwardVariants(res.variants, res.tasks);
    App._reschedulePreview(res.tasks, res.variants, []);
    // §19.10 B.1／§19.2：開案落地當下凍結 baselineHours（總工時點數＝範圍蔓延分母）＋ ecnEvents 事件時間軸種子（開案）
    const _dh = (DATA.settings && DATA.settings.dailyHours) || 6;
    res.project.baselineHours = Math.round(res.tasks.reduce((s, t) => s + ((t.effortRatio != null ? t.effortRatio : 100) / 100) * _dh * (t.durationDays || 0), 0) * 10) / 10;
    res.project.ecnEvents = [{ type: 'open', date: D.fmt(new Date(), 'iso'), label: '開案（' + ecn.size + ' 級）', cause: '' }];
  }
  // §19.10 F.3：NPI 每階段 PM 常駐協調列——排程後才材料化（不進排程避免無前置被重置為案別起始日）
  else if (res.project.stageCoordDefaults) {
    App._materializeNpiStageCoord(res);
  }
  const dup = DATA.projects.filter(p => p.name === res.project.name && !!p.ecnType === !!res.project.ecnType);   // 同名檢查限同分類（NPI↔ECN 同名不算重複，問題4）
  const unassigned = res.tasks.filter(t => !t.owner).length;
  const _commit = () => {
    const tb = document.querySelector('.main > .topbar');   // ECN 直落地路徑不經 _s2DoCommit → 此處還原（idempotent，NPI 再 remove 無害）
    if (tb) tb.classList.remove('topbar-hidden');
    res.project.version = dup.length ? Math.max(...dup.map(p => p.version || 1)) + 1 : 1;
    res.project.importedAt = D.fmt(new Date(), 'iso');
    DATA.projects.push(res.project);
    res.tasks.forEach(t => DATA.tasks.push(t));
    App.currentProjectId = res.project.id;
    Store.projects.save();   // 新專案
    Store.tasks.save();      // 套範本生成的任務
    App._tplPreview = null;
    App._createFlow = null;
    App.refreshAll();
    if (res.warnings.length) {
      console.warn('套範本提醒:', res.warnings);
      App._showTplWarnings(res.warnings);
      U.toast('\u2713 已建立 ' + res.tasks.length + ' 筆（' + res.warnings.length + ' 項提醒見上方）', 'warning');
    } else {
      U.toast('\u2713 已建立 ' + res.tasks.length + ' 筆任務', 'success');
    }
    App.showPage('project', null);
  };
  const _checkDup = () => {
    if (dup.length) {
      App.confirmModal({ icon: 'ti-copy', iconBg: '--amber-l', iconColor: '--amber-ink',
        title: `已有 ${dup.length} 個同名專案「${res.project.name}」`, msg: '要建立新版本嗎？兩者並存，可在側邊欄辨識版號。', okText: '建立新版本', cancelText: '返回修改', onConfirm: _commit });
    } else { _commit(); }
  };
  if (unassigned > 0) {
    App.confirmModal({ icon: 'ti-alert-triangle', iconBg: '--amber-l', iconColor: '--amber-ink',
      title: `還有 ${unassigned} 個任務未指派負責人`, msg: '確定建立？', okText: '確定建立', cancelText: '取消', onConfirm: _checkDup });
  } else { _checkDup(); }
};

// ─── 範本第二階段 步驟4：任務清單可編輯（負責人下拉＋需交付勾選，不碰工期/不重算）───
// 全部讀寫 this._tplPreview（preview 未落地，建立時才 push）；負責人/需交付不影響日期，故只寫值不重算。
App._s2GroupByStage = function(variantId) {
  const res = this._tplPreview;
  const order = [], byStage = {};
  ((res && res.tasks) || []).filter(t => t.variant === variantId).forEach(t => {
    const st = t.stage || '（未分階段）';
    if (!byStage[st]) { byStage[st] = []; order.push(st); }
    byStage[st].push(t);
  });
  return { order, byStage };
};
// 負責人下拉：該任務所屬部門(task.dept)的人排最前(本部門・)，其餘在後；首列未指派。只選不可手打(select)。
App._s2OwnerOptions = function(t) {
  const res = this._tplPreview; if (!res) return '';
  const depts = res.depts || [];
  const cur = t.owner || '';
  const ownDeptId = t.dept || '';
  let html = '<option value=""' + (cur === '' ? ' selected' : '') + '>未指派</option>';
  const ordered = depts.slice().sort((a, b) => (a.id === ownDeptId ? -1 : (b.id === ownDeptId ? 1 : 0)));
  ordered.forEach(d => {
    const members = d.members || [];
    if (!members.length) return;
    html += '<optgroup label="' + U.esc((d.id === ownDeptId ? '本部門・' : '') + d.name) + '">';
    members.forEach(m => {
      html += '<option value="' + U.esc(m.name) + '"' + (m.name === cur ? ' selected' : '') + '>' + U.esc(m.name) + '</option>';
    });
    html += '</optgroup>';
  });
  return html;
};
// 前置 hover 高亮：滑入前置欄 → 依 data-preds（render 時 baked 的前置 id 清單）反色高亮被指向的列；滑出清除。純 UI。
App._s2PredHlOn = function(td) {
  (td.dataset.preds || '').split(',').filter(Boolean).forEach(id => {
    const r = document.querySelector('[data-taskid="' + id + '"]');
    if (r) r.classList.add('s2-pred-hl');
  });
};
App._s2PredHlOff = function() {
  document.querySelectorAll('.s2-pred-hl').forEach(e => e.classList.remove('s2-pred-hl'));
};

// 前置白話：無→「無」/單→「接在《X》後」(id 反查 name)/多→「接在 N 項後」。predecessor 為 id#關係 格式(取 # 前 id)。
App._s2PredText = function(t) {
  const res = this._tplPreview; if (!res) return '無';
  const parts = String(t.predecessor || '').split(/[,，;；]/).map(x => x.trim()).filter(Boolean);
  if (!parts.length) return '無';
  if (parts.length === 1) {
    const pid = parts[0].split('#')[0];
    const dep = (res.tasks || []).find(x => x.id === pid);
    return dep ? ('接在《' + dep.name + '》後') : '接在 1 項後';
  }
  return '接在 ' + parts.length + ' 項後';
};
// 前置候選下拉：同案別、序之前（flat 跨階段序）的任務 → <option>（含「無」＋目前選中）。
App._s2PredOptions = function(t, variantId) {
  const g = this._s2GroupByStage(variantId);
  const flat = g.order.reduce((a, st) => a.concat(g.byStage[st] || []), []);
  const idx = flat.findIndex(x => x.id === t.id);
  const cur = String(t.predecessor || '').split('#')[0];
  let html = '<option value=""' + (cur ? '' : ' selected') + '>無</option>';
  for (let i = 0; i < idx; i++) {
    const x = flat[i];
    html += '<option value="' + x.id + '"' + (x.id === cur ? ' selected' : '') + '>' + U.esc((i + 1) + '·' + x.name) + '</option>';
  }
  return html;
};
// 寫回 preview：前置（單選 FS，存 id#FS）→ 重排所有案。predId 空＝清前置。多前置任務走唯讀、不進此函式。
App._s2SetPred = function(taskId, predId) {
  const res = this._tplPreview; if (!res) return;
  const t = res.tasks.find(t => t.id === taskId); if (!t) return;
  t.predecessor = predId ? (predId + '#FS') : '';
  App._reschedulePreview(res.tasks, res.variants, []);
  res.variants.forEach(v => this._s2RefreshCase(v.id));
};
// 任務清單表（單一案別）：按 stage 正常序分組，每組標題列含「全選需交付」；每列 序/任務名+子群組/負責人下拉/前置白話/工期(唯讀)/日期(唯讀)/需交付勾。
App._s2ListHtml = function(variantId) {
  const res = this._tplPreview; if (!res) return '';
  const _idToName = {}; (res.depts || []).forEach(d => { _idToName[d.id] = d.name; });   // §19.10 F.3：部門欄顯 dept 名（Excel 匯入無 role → 靠 dept；範本 role/dept 同名）
  const g = this._s2GroupByStage(variantId);
  if (!g.order.length) return '<div class="s2-ph">此案別無任務</div>';
  const sel = (this._s2Stage && this._s2Stage[variantId]) || g.order[0];
  const selIdx = g.order.indexOf(sel);
  const group = g.byStage[sel] || [];
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  const mmdd = (x) => { const p = String(x || '').split('-'); return p.length >= 3 ? (p[1] + '/' + p[2]) : ''; };   // 只顯示月/日（不顯示年）
  // 序＝案內跨階段累計（前面各階段任務數加總），切階段不重編號
  let seqBase = 0;
  for (let i = 0; i < selIdx; i++) seqBase += (g.byStage[g.order[i]] || []).length;
  const allDeliver = group.length > 0 && group.every(t => t.mustDeliver);
  let rows = '';   // §N3-A：刪除「階段名＋全選」分隔列，純列 Task（當前階段由甘特＋Banner 已標示）；全選移到表頭「需交付」欄
  const gains = App._effectiveGains(variantId);   // §A 有效縮短瓶頸（模擬法）：gain>0＝改其工期能真正縮短總工期
  group.forEach((t, gi) => {
    const seq = seqBase + gi + 1;
    const isCrit = (gains.get(t.id) || 0) > 0;   // §A 改其工期能有效縮短總天數（取代長工時門檻近似）
    rows +=
      '<tr data-taskid="' + t.id + '" class="' + (seq % 2 === 0 ? 's2-rz ' : '') + (isCrit ? 's2-crit' : '') + '">' +
        '<td class="col-num">' + seq + '</td>' +
        '<td class="col-flex s2-namecell" title="' + U.esc(t.name) + '"><div class="s2-nameflex"><input class="s2-name-inp" value="' + U.esc(t.name) + '" onchange="App._s2SetName(\'' + t.id + '\', this.value)">' + (isCrit ? '<span class="s2-crit-tag">關鍵路徑</span>' : '') + '</div></td>' +
        '<td class="col-mid s2-deptcell" title="此任務所屬部門（在「新增/編輯部門」設定負責人）">' + (U.esc(_idToName[t.dept] || t.role) || '<span class="s2-dept-none">—</span>') + '</td>' +
        '<td class="col-mid s2-ownercell"><select class="s2-owner-sel' + (t.owner ? '' : ' s2-owner-unassigned') + '" onchange="App._s2SetOwner(\'' + t.id + '\', this.value)">' + this._s2OwnerOptions(t) + '</select></td>' +
        this._s2PredCells(t, variantId) +
        '<td class="col-mid s2-dur"><input class="s2-dur-inp" type="number" min="0" value="' + (t.durationDays != null ? t.durationDays : '') + '" onchange="App._s2SetDuration(\'' + t.id + '\', this.value)"></td>' +
        '<td class="col-mid s2-date" title="' + (t.plannedStart ? (fmtD(t.plannedStart) + ' → ' + fmtD(t.plannedEnd)) : '') + '">' + (t.plannedStart ? (mmdd(t.plannedStart) + ' → ' + mmdd(t.plannedEnd)) : '（待排）') + '</td>' +
        '<td class="col-mid s2-pct-cell"><select class="s2-pct-sel" onchange="App._s2SetEffort(\'' + t.id + '\', this.value)">' + App._ecnEffortOptions(t.effortRatio) + '</select></td>' +
        '<td class="col-mid s2-deliver"><input type="checkbox"' + (t.mustDeliver ? ' checked' : '') + ' onchange="App._s2SetDeliver(\'' + t.id + '\', this.checked)"></td>' +
        '<td class="col-action s2-del-cell"><button class="s2-del" title="刪除此列" onclick="App._s2DelRow(\'' + t.id + '\')">✕</button></td>' +
      '</tr>' +
      '<tr class="dt-insert-row"><td colspan="12" class="dt-insert-cell"><div class="dt-insert"><button class="dt-insert-btn" title="在此列後插入" onclick="App._s2InsertRow(\'' + t.id + '\', \'' + variantId + '\')">＋</button></div></td></tr>';
  });
  // §19.10 F.3：NPI 每階段末尾一列「PM 階段協調（常駐）」——變數層 variant.stageCoord（非排程任務、不漂移），落地 commit 才材料化
  if (res.project && res.project.stageCoordDefaults && res.project.stageCoordDefaults[sel] != null) {
    const vv = (res.variants || []).find(x => x.id === variantId);
    const cur = (vv && vv.stageCoord && vv.stageCoord[sel] != null) ? vv.stageCoord[sel] : res.project.stageCoordDefaults[sel];
    rows += '<tr class="s2-coord-row"><td class="col-num"></td>' +
      '<td colspan="8" class="s2-coord-label"><b>PM 階段協調（常駐）</b><span class="s2-coord-note">「' + U.esc(sel) + '」全程背景協調</span></td>' +
      '<td class="col-mid s2-pct-cell"><select class="s2-pct-sel" onchange="App._s2SetStageCoord(\'' + variantId + '\', \'' + U.esc(sel) + '\', this.value)">' + App._ecnEffortOptions(cur) + '</select></td>' +
      '<td class="col-mid"></td><td class="col-action"></td></tr>';
  }
  return '<table class="data-table s2-tbl"><thead>' +
    '<tr>' +
      '<th class="col-num" rowspan="2">序</th>' +
      '<th class="col-flex" rowspan="2">任務名</th>' +
      '<th class="col-mid" rowspan="2">部門</th>' +
      '<th class="col-mid" rowspan="2">負責人</th>' +
      '<th class="col-pred-group" colspan="3">前置任務</th>' +
      '<th class="col-mid s2-dur-th" rowspan="2">工期</th>' +
      '<th class="col-mid" rowspan="2">日期（起訖）</th>' +
      '<th class="col-mid s2-pct-th" rowspan="2">投入%</th>' +
      '<th class="col-mid s2-deliver-th" rowspan="2">需交付<label class="s2-all-th"><input type="checkbox"' + (allDeliver ? ' checked' : '') + ' onchange="App._s2DeliverAll(\'' + variantId + '\', ' + selIdx + ', this.checked)"> 全選</label></th>' +
      '<th class="col-action" rowspan="2"></th>' +
    '</tr>' +
    '<tr>' +
      '<th class="col-pred-sub">序號</th>' +
      '<th class="col-pred-sub">銜接方式</th>' +
      '<th class="col-pred-sub">緩衝</th>' +
    '</tr>' +
    '</thead><tbody>' + rows + '</tbody></table>';
};
// 寫回 preview：工期 → 重排所有案別（呼叫共用 _reschedulePreview 重算 plannedStart/End）。
// parseInt 防呆（負值/NaN→0）；warnings 此處丟棄（preview 不顯示，建立時 applyTemplate 會重算收集）。
App._s2SetDuration = function(taskId, value) {
  const res = this._tplPreview; if (!res) return;
  const t = res.tasks.find(t => t.id === taskId); if (!t) return;
  t.durationDays = Math.max(0, parseInt(value) || 0);
  App._reschedulePreview(res.tasks, res.variants, []);
  // 重繪所有案別（前置鏈跨案/跨階段連動，不能只重繪單一案）
  res.variants.forEach(v => this._s2RefreshCase(v.id));
};

// §19.10 F.3：寫回一般任務投入%（不影響排程，改值即存、只重繪本案）
App._s2SetEffort = function(taskId, val) {
  const res = this._tplPreview; if (!res) return;
  const t = res.tasks.find(t => t.id === taskId); if (!t) return;
  t.effortRatio = parseInt(val, 10) || 0;
  this._s2RefreshCase(t.variant);
};
// §19.10 F.3：寫回某階段 PM 常駐協調%（存 variant.stageCoord，非排程任務、不漂移；落地才材料化）
App._s2SetStageCoord = function(variantId, stage, val) {
  const res = this._tplPreview; if (!res) return;
  const v = (res.variants || []).find(x => x.id === variantId); if (!v) return;
  v.stageCoord = v.stageCoord || {};
  v.stageCoord[stage] = parseInt(val, 10) || 0;
  this._s2RefreshCase(variantId);
};
// §19.10 F.3：NPI 才掛每階段 PM 常駐協調% 預設（存 project 供 render/材料化讀；非 ECN、範本有 pmCoordEffort 才掛）
App._attachStageCoord = function(res, tpl, isEcn) {
  if (isEcn || !res || !res.project || !tpl || !tpl.stageDefaults) return;
  const m = {};
  tpl.stageDefaults.forEach(s => { if (s.pmCoordEffort != null) m[s.stage] = s.pmCoordEffort; });
  if (Object.keys(m).length) res.project.stageCoordDefaults = m;
};
// §19.10 F.3：落地時把 variant.stageCoord 材料化成每階段 isPmCoord 任務（排程後呼叫、不再重排 → 保住階段起訖）
App._materializeNpiStageCoord = function(res) {
  const defs = (res.project && res.project.stageCoordDefaults) || {};
  const dailyHours = (DATA.settings && DATA.settings.dailyHours) || 6;
  const pmDept = (res.depts || []).find(d => d.name === 'PM');
  (res.variants || []).forEach(v => {
    const byStage = {};
    res.tasks.filter(t => t.variant === v.id && t.stage && !t.isPmCoord).forEach(t => { (byStage[t.stage] = byStage[t.stage] || []).push(t); });
    Object.keys(byStage).forEach(st => {
      const eff = (v.stageCoord && v.stageCoord[st] != null) ? v.stageCoord[st] : defs[st];
      if (eff == null) return;
      const ss = byStage[st].map(t => t.plannedStart).filter(Boolean).sort();
      const ee = byStage[st].map(t => t.plannedEnd).filter(Boolean).sort();
      if (!ss.length || !ee.length) return;
      const s0 = ss[0], e0 = ee[ee.length - 1];
      const span = Math.max(D.workdaysBetween(s0, e0), 1);
      res.tasks.push({
        id: U.id(), project: res.project.id, wbs: 0, parentWbsId: '',
        name: 'PM 階段協調（常駐）', desc: st + ' / PM 協調', category: 'deep', taskType: '任務',
        predecessor: '', durationDays: span, owner: '', dept: pmDept ? pmDept.id : '', role: 'PM',
        variant: v.id, start: '', end: '', plannedStart: s0, plannedEnd: e0, actualStart: '', actualEnd: '',
        progress: 0, status: 'pending', urgency: 'med',
        estHours: Math.round(span * dailyHours * (eff / 100) * 10) / 10,
        method: '', canSplit: false, completedAt: null, createdAt: new Date().toISOString(),
        scheduledStart: '', scheduledEnd: '', synced: false, stage: st, subgroup: '',
        mustDeliver: false, deliverableType: '', requiredTask: true, mustIssue: false,
        deliverable: '', riskIssue: '', delivered: '', deliverableLink: '', note: '',
        effortRatio: eff, taskAttr: 'baseline', isPmCoord: true,
      });
    });
  });
};

// 寫回 preview（不落地、不重算）：負責人
App._s2SetOwner = function(taskId, value) {
  const res = this._tplPreview; if (!res) return;
  const t = (res.tasks || []).find(x => x.id === taskId);
  if (t) t.owner = value;
};
// 寫回 preview：任務名（只改顯示名）→ 從 task 反查 variant 重繪該案，讓前置白話即時同步。
// ⚠ 只動 t.name，不碰 t.predecessor / t.id / t.wbs(n)——前置鏈靠 id 串，改名只改顯示。
App._s2SetName = function(taskId, value) {
  const res = this._tplPreview; if (!res) return;
  const t = (res.tasks || []).find(x => x.id === taskId);
  if (!t) return;
  t.name = value;
  this._s2RefreshCase(t.variant);
};
// 刪除該列（preview 陣列 filter）→ 重繪該案。懸空前置不清，建立時 relinkPred 收尾。
// ⚠ 先取 variant 再 filter（filter 後找不到該筆拿不到 variant）。
App._s2DelRow = function(taskId) {
  const res = this._tplPreview; if (!res) return;
  const t = (res.tasks || []).find(x => x.id === taskId);
  if (!t) return;
  const variantId = t.variant;
  res.tasks = res.tasks.filter(x => x.id !== taskId);
  this._s2RefreshCase(variantId);
};
// 列間插入：在指定列之後 splice 新任務（全 schema，照 applyTemplate 欄位）→ 重排 → 重繪所有案。
// 前置留空＝落待排（§8d.15 N.6）；owner 空＝吃未指派橘標。
App._s2InsertRow = function(taskId, variantId) {
  const res = this._tplPreview; if (!res) return;
  const idx = res.tasks.findIndex(x => x.id === taskId);
  if (idx < 0) return;
  const ref = res.tasks[idx];
  const dailyHours = (DATA.settings && DATA.settings.dailyHours) || 6;
  const newTask = {
    id: U.id(), project: res.project.id, wbs: '', parentWbsId: '',
    name: '新任務', desc: ref.stage || '', category: 'deep', taskType: '任務',
    predecessor: '', durationDays: 1, owner: '', dept: '', role: '', variant: variantId,
    start: '', end: '', plannedStart: '', plannedEnd: '', actualStart: '', actualEnd: '',
    progress: 0, status: 'pending', urgency: 'med', estHours: dailyHours,
    method: '', canSplit: false, completedAt: null, createdAt: new Date().toISOString(),
    scheduledStart: '', scheduledEnd: '', synced: false, stage: ref.stage || '', subgroup: '',
    mustDeliver: false, deliverableType: '', requiredTask: true, mustIssue: false,
    deliverable: '', riskIssue: '', delivered: '', deliverableLink: '', note: ''
  };
  res.tasks.splice(idx + 1, 0, newTask);
  App._reschedulePreview(res.tasks, res.variants, []);
  res.variants.forEach(v => this._s2RefreshCase(v.id));
};
// 寫回 preview：需交付（單筆）
App._s2SetDeliver = function(taskId, checked) {
  const res = this._tplPreview; if (!res) return;
  const t = (res.tasks || []).find(x => x.id === taskId);
  if (t) t.mustDeliver = !!checked;
};
// 寫回 preview：需交付（該階段全選）→ 重繪同步子勾選
App._s2DeliverAll = function(variantId, si, checked) {
  const g = this._s2GroupByStage(variantId);
  const st = g.order[si]; if (st == null) return;
  g.byStage[st].forEach(t => { t.mustDeliver = !!checked; });
  this._s2RefreshCase(variantId);
};
// ─── 步驟3：Gantt 階段軸 + 點階段切換清單 ───
// 各階段起迄：純讀該案 preview tasks 的 min plannedStart → max plannedEnd（不落地）。
App._s2StageRanges = function(variantId) {
  const g = this._s2GroupByStage(variantId);
  const ranges = g.order.map(st => {
    const ts = g.byStage[st];
    const starts = ts.map(t => t.plannedStart).filter(Boolean).sort();
    const ends = ts.map(t => t.plannedEnd).filter(Boolean).sort();
    return { stage: st, start: starts[0] || '', end: ends[ends.length - 1] || '' };
  });
  return { order: g.order, ranges };
};
// Gantt 階段軸：每階段一列(色點+名+橫條+日期)，橫條 left/width 相對該案總區間；選中階段加 .on 高亮。
// 階段燈號＋落點：完全共用 Stage 1 的 _s1ColorStagesForward（interval/情境C 用「順推落點 vs 上市日期」算 margin
// 上色，超出上市日的段顯紅且橫條延伸可見；純順推/倒推來得及則維持原落點、不上色＝綠）。確保 Stage 1↔2 同案同色同落點。
// §4.8.7.10：Stage 2 各階段時程狀態（單一真實來源，甘特標籤＋當前階段橫條共用）。
// 上色（interval/backward 同 Stage1 邏輯）＋算每階段 lack＝該段落點超出上市日的工作天（>0＝紅、尚缺 N）。
App._s2StageStatuses = function(variantId) {
  const res = this._tplPreview;
  const data = this._s2StageRanges(variantId);
  const order = data.order, ranges = data.ranges;
  const v = res ? (res.variants || []).find(x => x.id === variantId) : null;
  let ed = '';
  if (res && v) {
    const vsch = v.schedule || {};
    ed = vsch.endDate || '';
    const eff = App._effScheduleDir(vsch.startDate, vsch.endDate, vsch.direction);
    if (eff === 'interval') {
      App._s1ColorStagesForward(res, v, ranges, vsch.startDate, vsch.endDate);
    } else if (eff === 'backward' && ed) {
      // 比照 Stage 1 _s1ComputePreview backward 分支：先反向串接（末段貼齊上市日、各段依序往前），算出真最晚開工日 backStart；
      // backStart < today＝來不及 → 以今天順推上色（_s1ColorStagesForward 內含 margin 上色，超出上市日顯紅）；
      // 來得及 → 各段比對上市日算 margin 上色（≥5 綠／0~4 黃／<0 紅）。修「甘特條全綠但 lack 標籤紅」的不同源矛盾。
      App._chainStagesBackward(ranges, ed);
      const todayIso = D.fmt(D.today(), 'iso');
      const backStart = ranges.length ? (ranges[0].start || '') : '';
      if (backStart && backStart < todayIso) {
        App._s1ColorStagesForward(res, v, ranges, todayIso, ed);
      } else {
        ranges.forEach(s => {
          if (!s.end) return;
          const margin = (s.end <= ed) ? D.workdaysBetween(s.end, ed) - 1 : -(D.workdaysBetween(ed, s.end) - 1);
          s.light = margin >= 5 ? 'green' : (margin >= 0 ? 'yellow' : 'red');
        });
      }
    } else {
      App._chainStages(ranges);
    }
  }
  ranges.forEach(r => { r.lack = (ed && r.end && r.end > ed) ? Math.max(0, D.workdaysBetween(ed, r.end) - 1) : 0; });
  return { order: order, ranges: ranges, endDate: ed };
};
// 點甘特⚠️標籤：選中該階段（表格換成該階段任務）＋平滑捲到任務表。
App._s2GotoStage = function(variantId, si) {
  App._s2SelectStage(variantId, si);
  const list = document.querySelector('.s2-list[data-variant="' + variantId + '"]');
  if (list) list.scrollIntoView({ behavior: 'smooth', block: 'start' });
};
App._s2GanttHtml = function(variantId) {
  const data = App._s2StageStatuses(variantId);
  const order = data.order, ranges = data.ranges, ed = data.endDate;
  if (!order.length) return '';
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  const toNum = (d) => d ? Date.parse(d) : NaN;
  const sel = (this._s2Stage && this._s2Stage[variantId]) || order[0];
  const allStarts = ranges.map(r => toNum(r.start)).filter(n => !isNaN(n));
  const allEnds = ranges.map(r => toNum(r.end)).filter(n => !isNaN(n));
  // §甘特今日線：時間軸一律納入「今天」——剛開案（工作還沒排到今天）或全部完工的案子，今天本會落在任務日期範圍外而畫不出今日線。
  // 先把 min/max 撐到含 todayN 再算 span，bar 位置隨之重排，今日線永遠落在軸內（規則16：基準線常駐，不因「還沒做到今天」就藏）。
  const todayN = Date.parse(D.fmt(D.today(), 'iso'));
  let minN = allStarts.length ? Math.min.apply(null, allStarts) : (isNaN(todayN) ? 0 : todayN);
  let maxN = allEnds.length ? Math.max.apply(null, allEnds) : (isNaN(todayN) ? 0 : todayN);
  if (!isNaN(todayN)) { minN = Math.min(minN, todayN); maxN = Math.max(maxN, todayN); }
  const span = (maxN - minN) || 1;
  const _todayLeft = (todayN - minN) / span * 100;
  const _todayOn = (!isNaN(todayN) && maxN > minN);
  const todayMark = _todayOn ? '<div class="s2-gtoday" style="left:' + _todayLeft + '%"></div>' : '';
  // 首列今日線頂端掛「今天」旗標→一眼標出今天位置（其餘列只畫線，視覺連貫）。
  // C 方案：各子案甘特各自縮放、各自掛旗標；今天落最左/最右時旗標靠內錨定（避免擠出 track、壓到階段名）。
  const _flagStyle = _todayLeft < 10 ? 'left:0;transform:none' : (_todayLeft > 90 ? 'left:auto;right:0;transform:none' : '');
  const todayMarkLead = _todayOn ? '<div class="s2-gtoday" style="left:' + _todayLeft + '%"><span class="s2-gtoday-flag"' + (_flagStyle ? ' style="' + _flagStyle + '"' : '') + '>今天</span></div>' : '';
  let rows = '';
  ranges.forEach((r, si) => {
    const isSel = r.stage === sel;
    const a = toNum(r.start), b = toNum(r.end);
    const light = r.light || 'green';
    const tMark = si === 0 ? todayMarkLead : todayMark;
    let bar;
    if (isNaN(a) || isNaN(b)) {
      bar = '<div class="s2-gbar-track">' + tMark + '<div class="s2-gbar s2-gbar-none"></div></div>';
    } else {
      const left = ((a - minN) / span) * 100;
      const width = Math.max(((b - a) / span) * 100, 1.5);
      bar = '<div class="s2-gbar-track">' + tMark + '<div class="s2-gbar s2-gbar-' + light + '" style="left:' + left + '%;width:' + width + '%"></div></div>';
    }
    // 顯示短日期：同年 MM/DD、跨年 YY/MM/DD；title hover 看完整 YYYY/MM/DD
    const shortD = (x) => { if (!x) return ''; const p = String(x).split('-'); return (p[1] || '') + '/' + (p[2] || ''); };
    const sameYr = r.start && r.end && r.start.slice(0, 4) === r.end.slice(0, 4);
    const oneD = (x) => x ? (sameYr ? shortD(x) : (String(x).slice(2, 4) + '/' + shortD(x))) : '';
    const dateLbl = (r.start || r.end) ? (oneD(r.start) + ' → ' + oneD(r.end)) : '待排';
    const dateFull = (r.start || r.end) ? (fmtD(r.start) + ' → ' + fmtD(r.end)) : '待排';
    const dot = (isNaN(a) || isNaN(b)) ? '<span class="s2-gdot"></span>' : '<span class="s2-gdot s2-gdot-' + light + '"></span>';
    // §4.8.7.10 嵌入 dashboard：階段尾端狀態標籤（紅＝尚缺 N 天、可點捲到該階段；綠＝正常）。只填單一日期(無上市日)→不顯示。
    const stat = !ed ? '' : (r.lack > 0
      ? '<span class="s2-gstat bad" onclick="event.stopPropagation();App._s2GotoStage(\'' + variantId + '\', ' + si + ')"><i class="ti ti-alert-triangle"></i> 尚缺 ' + r.lack + ' 天</span>'
      : '<span class="s2-gstat ok"><i class="ti ti-circle-check"></i> 正常</span>');
    rows +=
      '<div class="s2-grow' + (isSel ? ' on' : '') + '" onclick="App._s2SelectStage(\'' + variantId + '\', ' + si + ')">' +
        dot +
        '<div class="s2-gname">' + U.esc(r.stage) + '</div>' +
        bar +
        '<div class="s2-gdate" title="' + dateFull + '">' + dateLbl + '</div>' +
        stat +
      '</div>';
  });
  return '<div class="s2-gantt-axis">' + rows + '</div>';
};
// 階段 Banner（Mockup）：當前階段名＋該段日期區間（Deadline）。固定專案綠（不隨階段換色），切階段更新文字。
App._s2BannerHtml = function(variantId) {
  const data = App._s2StageStatuses(variantId);
  if (!data.order.length) return '';
  const sel = (this._s2Stage && this._s2Stage[variantId]) || data.order[0];
  const r = data.ranges.find(x => x.stage === sel) || {};
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  const dl = (r.start || r.end) ? (fmtD(r.start) + ' → ' + fmtD(r.end)) : '（待排）';
  const status = (data.endDate && r.lack > 0)
    ? '<span class="s2n-bn-bad">（⚠ 排程尚缺 ' + r.lack + ' 個工作天，請縮減下方關鍵路徑工期）</span>'
    : (data.endDate ? '<span class="s2n-bn-ok">（時程充足）</span>' : '');
  return '<div class="s2n-banner">' +
      '<i class="ti ti-tool s2n-bn-ico"></i>' +
      '<span class="s2n-bn-name">當前階段：' + U.esc(sel) + status + '</span>' +
      '<span class="s2n-bn-dl"><i class="ti ti-calendar"></i> 階段 Deadline：' + dl + '</span>' +
    '</div>';
};
// ─── 前置任務組合框（[序號][白話銜接型][緩衝]）：白話文＋3 階段防呆過濾 ───
// 解析現存 predecessor（id#型別±lag）為 {id,type,lag}；多前置 → {multi:true} 走唯讀白話。
App._s2ParsePred = function(t) {
  const parts = String(t.predecessor || '').split(/[,，;；]/).map(x => x.trim()).filter(Boolean);
  if (parts.length >= 2) return { multi: true };
  if (!parts.length) return { id: '', type: 'FS', lag: 0 };
  const p = parts[0];
  const h = p.indexOf('#');
  const id = h >= 0 ? p.slice(0, h).trim() : p.trim();
  const tail = h >= 0 ? p.slice(h + 1).trim() : '';
  const m = tail.match(/^([A-Za-z]{2})?\s*([+-]\s*\d+)?$/) || [];
  let type = (m[1] || 'FS').toUpperCase();
  if (['FS', 'SS', 'FF', 'SF'].indexOf(type) < 0) type = 'FS';
  let lag = m[2] ? parseInt(m[2].replace(/\s+/g, ''), 10) : 0;
  if (isNaN(lag)) lag = 0;
  return { id: id, type: type, lag: lag };
};
// 序號下拉選項（防呆）：同案、序在本任務之前、且階段在「當前～過去 3 階段」窗內者才可選。
// 現存前置若落在窗外仍保留為選中項（不誤清），其餘窗外項不列。
// 前置序號輸入（可手動打字＋下拉建議 datalist）：value＝現存前置的「序」；datalist 建議＝序在前且當前/過去 3 階段內。
// 手動可輸入更早的項目（防呆窗只當建議，不限制手動）；未來/自己由 _s2SetPredCombo 擋（序須 < 本任務序）。
App._s2PredSeqInput = function(t, variantId, curId) {
  const g = this._s2GroupByStage(variantId);
  const stageIdxOf = {};
  g.order.forEach((st, si) => (g.byStage[st] || []).forEach(x => { stageIdxOf[x.id] = si; }));
  const flat = g.order.reduce((a, st) => a.concat(g.byStage[st] || []), []);
  const myIdx = flat.findIndex(x => x.id === t.id);
  const mySi = stageIdxOf[t.id];
  let curSeq = '';
  if (curId) { const ci = flat.findIndex(x => x.id === curId); if (ci >= 0) curSeq = String(ci + 1); }
  let opts = '';
  for (let i = 0; i < myIdx; i++) {
    const x = flat[i], xsi = stageIdxOf[x.id];
    if (xsi <= mySi && xsi >= mySi - 3) opts += '<option value="' + (i + 1) + '">' + U.esc((i + 1) + '·' + x.name) + '</option>';
  }
  const did = 's2pl-' + t.id;
  return '<input class="s2-pc-seq" type="text" list="' + did + '" value="' + curSeq + '" placeholder="序號" ' +
      'title="輸入或下拉前置序號（可手動輸入更早項目；建議僅當前或過去 3 階段）" ' +
      'onchange="App._s2SetPredCombo(\'' + t.id + '\')"><datalist id="' + did + '">' + opts + '</datalist>';
};
// 白話銜接型選項（移除 FS/FF 縮寫，UI 全白話；value 仍存引擎碼）
App._s2PredTypeOptions = function(type) {
  const opts = [['FS', '完成後才開始'], ['SS', '同一天開始'], ['FF', '同一天完成'], ['SF', '開始才完成']];
  return opts.map(o => '<option value="' + o[0] + '"' + (o[0] === type ? ' selected' : '') + '>' + o[1] + '</option>').join('');
};
// 組合框寫回：讀該列三控制項 → predecessor=id#型別±lag（空序號＝清前置）→ 重排重繪所有案。
// 序號為手動輸入：先把「序」映射回 taskId（容忍「3·任務名」取數字）；只接受序在本任務之前（未來/自己→清空）。
App._s2SetPredCombo = function(taskId) {
  const res = this._tplPreview; if (!res) return;
  const t = res.tasks.find(x => x.id === taskId); if (!t) return;
  const row = document.querySelector('[data-taskid="' + taskId + '"]');
  if (!row) return;
  const seqRaw = ((row.querySelector('.s2-pc-seq') || {}).value || '').trim();
  const type = (row.querySelector('.s2-pc-type') || {}).value || 'FS';
  let lag = parseInt((row.querySelector('.s2-pc-lag') || {}).value, 10);
  if (isNaN(lag)) lag = 0;
  let predId = '';
  if (seqRaw) {
    const g = this._s2GroupByStage(t.variant);
    const flat = g.order.reduce((a, st) => a.concat(g.byStage[st] || []), []);
    const myIdx = flat.findIndex(x => x.id === t.id);
    const n = parseInt(String(seqRaw).split('·')[0], 10);
    if (!isNaN(n) && n >= 1 && (n - 1) < myIdx) predId = flat[n - 1].id;   // 只接受序在本任務之前（不可綁未來/自己）
  }
  if (!predId) { t.predecessor = ''; }
  else { const lagStr = lag > 0 ? ('+' + lag) : (lag < 0 ? String(lag) : ''); t.predecessor = predId + '#' + type + lagStr; }
  App._reschedulePreview(res.tasks, res.variants, []);
  res.variants.forEach(v => this._s2RefreshCase(v.id));
};
// 前置欄：拆三個獨立儲存格（序號／銜接方式／緩衝），交由表格自動分配欄寬、互不重疊（解決組合框溢出壓字）。
// 多前置→唯讀白話，跨三欄（colspan=3）。data-preds + hover 高亮掛在序號格。
App._s2PredCells = function(t, variantId) {
  const preds = String(t.predecessor || '').split(/[,，;；]/).map(x => x.split('#')[0].trim()).filter(Boolean).join(',');
  const pp = this._s2ParsePred(t);
  if (pp.multi) {
    return '<td class="col-pred s2-pred s2-pred-multi" colspan="3" data-preds="' + preds + '" onmouseenter="App._s2PredHlOn(this)" onmouseleave="App._s2PredHlOff()">' + U.esc(this._s2PredText(t)) + '</td>';
  }
  return '<td class="col-pred s2-pred s2-pc-seqcell" data-preds="' + preds + '" onmouseenter="App._s2PredHlOn(this)" onmouseleave="App._s2PredHlOff()">' + this._s2PredSeqInput(t, variantId, pp.id) + '</td>' +
    '<td class="col-pred s2-pc-typecell"><select class="s2-pc-type" title="銜接方式" onchange="App._s2SetPredCombo(\'' + t.id + '\')">' + this._s2PredTypeOptions(pp.type) + '</select></td>' +
    '<td class="col-pred s2-pc-lagcell"><input class="s2-pc-lag" type="number" value="' + pp.lag + '" title="緩衝天數：+2 多等兩天、-1 提前一天" onchange="App._s2SetPredCombo(\'' + t.id + '\')"></td>';
};
// 餘裕燈號 HTML（interval 才顯示，§4.8.7.4）：純讀 _tplPreview，初繪與 refresh 共用（單一真實來源）。
// 非 interval（純 forward/backward）回 '' 不顯示（§4.8.5：餘裕需雙錨開始+結束）。
// 該案餘裕（interval 才算，非 interval 回 null）：抽共用，供燈號 HTML／溢出引導／建立閘門同一真實來源。
App._s2VariantSlack = function(variantId) {
  const res = this._tplPreview; if (!res) return null;
  const v = (res.variants || []).find(x => x.id === variantId); if (!v) return null;
  const dir = App._effScheduleDir(v.schedule.startDate, v.schedule.endDate, v.schedule.direction);
  if (dir === 'interval' && v.schedule.startDate && v.schedule.endDate) {
    // interval（開始+結束都填）：改用「從開始日順推各段取最末完工」算 earliestFinish／餘裕（與 backward 分支、Gantt _s1ColorStagesForward 同源）。
    // 取代舊 _computeSlack 用 needed=workdaysBetween(minStart,maxFinish) 的近似——近似 earliestFinish 與真實順推完工不一致，
    // 造成「採用最快上市日後仍判紅、Gantt 階段紅但 banner 說達標、slack off-by-one 顯示紅+尚缺0天」。順推冪等：採用 fin 當上市日後再順推仍得 fin → slack=0 → 達標。
    const g = App._s2GroupByStage(variantId);
    const stages = g.order.map(st => ({ stage: st }));
    App._s1ColorStagesForward(res, v, stages, v.schedule.startDate, v.schedule.endDate);
    let fin = ''; stages.forEach(s => { if (s.end && s.end > fin) fin = s.end; });
    if (!fin) return null;
    const start = v.schedule.startDate, end = v.schedule.endDate;
    const available = D.workdaysBetween(start, end);
    const needed = D.workdaysBetween(start, fin);
    const slack = available - needed;
    return { available, needed, slack,
      light: slack >= 5 ? 'green' : (slack >= 0 ? 'yellow' : 'red'),
      earliestFinish: fin, overDays: slack < 0 ? Math.max(0, D.workdaysBetween(end, fin) - 1) : 0 };
  }
  if (dir === 'backward' && v.schedule.endDate) {
    // backward（只填上市日）：順推自今日＋階段串接取最末完工（與 Stage1 情境C 同源；desc==stage key 對得上），比對上市日 → 紅/黃/綠。
    const g = App._s2GroupByStage(variantId);
    const stages = g.order.map(st => ({ stage: st }));
    App._s1ColorStagesForward(res, v, stages, D.fmt(D.today(), 'iso'), v.schedule.endDate);
    let fin = ''; stages.forEach(s => { if (s.end && s.end > fin) fin = s.end; });
    if (!fin) return null;
    const end = v.schedule.endDate;
    const m = (fin <= end) ? D.workdaysBetween(fin, end) - 1 : -(D.workdaysBetween(end, fin) - 1);
    return { available: null, needed: null, slack: m,
      light: m >= 5 ? 'green' : (m >= 0 ? 'yellow' : 'red'),
      earliestFinish: fin, overDays: m < 0 ? Math.abs(m) : 0 };
  }
  return null;
};
App._s2SlackHtml = function(variantId) {
  const res = this._tplPreview; if (!res) return '';
  const v = (res.variants || []).find(x => x.id === variantId);
  if (!v) return '';
  const s = App._s2VariantSlack(variantId);
  if (!s) return '';
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  const wkd = (iso) => iso ? '（週' + ['日','一','二','三','四','五','六'][new Date(iso).getDay()] + '）' : '';
  const sd = v.schedule.startDate, ed = v.schedule.endDate;
  const msg = s.light === 'green' ? ('時間充足，還有 ' + s.slack + ' 個工作天緩衝')
    : s.light === 'yellow' ? ('時間偏緊，只剩 ' + s.slack + ' 個工作天緩衝，任何延誤都可能時程延誤、緩衝期較少')
    : ('時間不足，照專案範本的工期排，比需求的最快完成日晚 ' + s.overDays + ' 個工作天');
  const diffTxt = s.light === 'green' ? ('多出 ' + s.slack)
    : s.light === 'yellow' ? ('只多 ' + s.slack)
    : ('少了 ' + Math.abs(s.slack));
  const fastest = (s.light === 'red' && s.earliestFinish)
    ? '<span class="s2-slack-fastest">實際最快完成 ' + fmtD(s.earliestFinish) + wkd(s.earliestFinish) + '（晚 ' + s.overDays + ' 個工作天）</span>'
    : '';
  return '<div class="s2-slack s2-slack-' + s.light + '">' +
    '<span class="s2-slack-dot"></span>' +
    '<span class="s2-slack-msg">' + msg + '</span>' +
    '<span class="s2-slack-period">需求專案週期 ' + fmtD(sd) + wkd(sd) + ' → ' + fmtD(ed) + wkd(ed) + '</span>' +
    '<span class="s2-slack-nums">可排工作天 ' + s.available + ' ／ 任務需要 ' + s.needed + ' ／ ' + diffTxt + '</span>' +
    fastest +
  '</div>';
};
// ─── §4.8.7.8 舊版「嵌入 Stage 2」溢出引導已退役（2026-06-27），由 §4.8.7.9 獨立聚焦面板 `_ovf*` 取代。
// 已刪：_s2OverflowGuideHtml／_s2AdoptFastest／_s2OverflowHandoff／_s2OverflowRecalc（接線同步移除）。
// 仍保留共用：_s2VariantSlack（餘裕，新面板續用）、_s2CommitNew/_s2DoCommit（建立）、_s2SlackHtml（Stage 2 狀態條）。
// 點階段：設選中 → 只重繪該案（軸高亮 + 清單篩選），不洗整頁（已改 owner/mustDeliver 存 _tplPreview 不掉）。
App._s2SelectStage = function(variantId, si) {
  const g = this._s2GroupByStage(variantId);
  const st = g.order[si]; if (st == null) return;
  if (!this._s2Stage) this._s2Stage = {};
  this._s2Stage[variantId] = st;
  this._s2RefreshCase(variantId);
};
// §19 ECN 戰情室存檔：hijack 模式下 _tplPreview.tasks 為 DATA 活引用，欄位編輯已改 DATA；
// 插入/刪除會重賦 res.tasks（本地陣列），故同步回 DATA（保留本專案 _deleted 任務）→ 存檔 → 重繪 dashboard。
App._s2EcnPersist = function() {
  const pid = App._s2EcnMode; if (!pid) return;
  const proj = App.getProj(pid);
  if (!proj || !proj.ecnType) { App._s2EcnMode = null; return; }
  const res = App._tplPreview; if (!res) return;
  DATA.tasks = DATA.tasks.filter(t => !(t.project === pid && !t._deleted)).concat(res.tasks);
  Store.tasks.save();
  App.renderEcnDashboard(proj);
};
// 只重繪單一案別的 Gantt 軸 + 任務清單（讀 _tplPreview，已改值不掉）。
App._s2RefreshCase = function(variantId) {
  if (App._s2EcnMode) { App._s2EcnPersist(); return; }   // §19 ECN 戰情室：改工期/前置/名稱/刪除/插入 → 存檔重繪
  const slack = document.querySelector('.s2-slack-wrap[data-variant="' + variantId + '"]');
  if (slack) slack.innerHTML = this._s2SlackHtml(variantId);
  const gantt = document.querySelector('.s2-gantt[data-variant="' + variantId + '"]');
  if (gantt) gantt.innerHTML = this._s2GanttHtml(variantId);
  const bn = document.querySelector('.s2n-banner-wrap[data-variant="' + variantId + '"]');
  if (bn) bn.innerHTML = this._s2BannerHtml(variantId);
  const list = document.querySelector('.s2-list[data-variant="' + variantId + '"]');
  if (list) list.innerHTML = this._s2ListHtml(variantId);
};

// ═══ §4.8.7.9 智慧排程衝突處理面板（聚焦獨立頁，照 2026-06-27 定案 Mockup）═══
// 時程不足才走此頁（時間足夠走 _renderStage2New 骨架編輯）。分頁切案＋三層卡（階段一）→ 層二 Top3 長工時快選＋mini戰報（階段二）→ 層三 segmented＋即時戰報＋時程異動表（階段三）。
// 進場 snapshot 各任務原排程＋各案原 endDate/缺口當「變更前」基準（戰報/時程異動 diff 用）。state 存 App._ovfState。
App._ovfState = null;
App._renderOverflowFlow = function() {
  const res = this._tplPreview;
  if (!res) { U.toast('⚠ 無範本預覽資料，請重新套用範本', 'warning'); return; }
  const variants = res.variants || [];
  const baseTask = {};
  (res.tasks || []).forEach(t => { baseTask[t.id] = { s: t.plannedStart || null, e: t.plannedEnd || null }; });
  const baseEnd = {}, baseOver = {};
  variants.forEach(v => {
    baseEnd[v.id] = v.schedule.endDate;
    const s = App._s2VariantSlack(v.id);
    baseOver[v.id] = (s && s.light === 'red') ? s.overDays : 0;
  });
  let firstRed = null;
  variants.forEach(v => { if (firstRed) return; const s = App._s2VariantSlack(v.id); if (s && s.light === 'red') firstRed = v.id; });
  App._ovfState = { tab: firstRed || (variants[0] && variants[0].id) || null, sel: {}, modified: {}, topN: {}, baseTask: baseTask, baseEnd: baseEnd, baseOver: baseOver };
  App._s2From = 'overflow';   // §第3：Stage 2 來源＝智慧排程面板 →「上一步」回此面板（保留層一二設定），非回 Stage 1
  App._ovfRender();
};
App._ovfRender = function() {
  const page = document.getElementById('page-stage2');
  document.querySelectorAll('.page').forEach(pg => pg.classList.remove('active'));
  page.classList.add('active');
  page.innerHTML =
    '<div class="s2n-wrap ovf-wrap">' +
      '<div class="s2n-pagehd">' +
        '<div class="s1-crumb">總儀表板 <span class="s1-crumb-sep">/</span> 新增專案 <span class="s1-crumb-sep">/</span> 智慧排程衝突處理</div>' +
        '<div class="s2n-head"><span class="s2-num"><i class="ti ti-wand"></i></span>智慧排程衝突處理面板</div>' +
      '</div>' +
      '<div class="ovf-tabs" id="ovf-tabs">' + App._ovfTabsInner() + '</div>' +
      '<div class="ovf-casebox" id="ovf-casebox">' + App._ovfCaseHtml(App._ovfState.tab) + '</div>' +
      '<div class="stage2-foot">' +
        '<button class="tb-action ghost" onclick="App._ovfBack()">上一步</button>' +
        '<button class="tb-action ovf-next-btn" onclick="App._ovfGotoStage2()">下一步：進入 Stage 2 調整各階段工期 →</button>' +
      '</div>' +
    '</div>';
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
App._ovfRefresh = function() {
  const tabs = document.getElementById('ovf-tabs');
  if (tabs) tabs.innerHTML = App._ovfTabsInner();
  const box = document.getElementById('ovf-casebox');
  if (box) box.innerHTML = App._ovfCaseHtml(App._ovfState.tab);
};
App._ovfTabsInner = function() {
  const res = this._tplPreview; const st = App._ovfState;
  return (res.variants || []).map((v, i) => {
    const s = App._s2VariantSlack(v.id);
    const sub = (s && s.light === 'red') ? '<span class="ovf-tab-lack">● 尚缺 ' + s.overDays + ' 天</span>'
      : (s ? '<span class="ovf-tab-ok">✓ 已足夠</span>' : '');
    return '<button class="ovf-tab' + (v.id === st.tab ? ' on' : '') + '" onclick="App._ovfSelectTab(\'' + v.id + '\')">' +
      '<span class="ovf-tab-name">' + (i === 0 ? '主案' : '子案') + ' ' + U.esc(v.name || '') + '</span>' + sub + '</button>';
  }).join('');
};
App._ovfSelectTab = function(vid) { App._ovfState.tab = vid; App._ovfRefresh(); };
App._ovfPickLayer = function(vid, n) {
  App._ovfState.sel[vid] = n;
  if (n === '2') {   // §b 進層二＝開始調整：snapshot 此刻尚缺當基準，「已縮短」與當下尚缺同基準、不再對不上
    const s = App._s2VariantSlack(vid);
    App._ovfState.baseOver[vid] = (s && s.light === 'red') ? s.overDays : 0;
  }
  App._ovfRefresh();
};
App._ovfCaseHtml = function(vid) {
  const res = this._tplPreview; const v = (res.variants || []).find(x => x.id === vid); if (!v) return '';
  const isMain = (res.variants || [])[0] && (res.variants || [])[0].id === vid;
  const sel = App._ovfState.sel[vid] || null;
  const s = App._s2VariantSlack(vid);
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  const resolved = !s || s.light !== 'red';
  const head = '<div class="ovf-case-head">' +
      '<span class="stage-cap-pill cap-0">' + (isMain ? '主案' : '子案') + '</span>' +
      '<span class="ovf-case-name">' + U.esc(v.name || '') + '</span>' +
      App._ovfRangeBadge(vid, v) +
    '</div>';
  const banner = resolved
    ? '<div class="ovf-banner ok"><i class="ti ti-circle-check"></i> 時程已足夠：已成功解決排程衝突' + (s ? '（餘裕 ' + s.slack + ' 個工作天）' : '') + '。</div>'
    : '<div class="ovf-banner"><span class="ovf-bdot"></span> 排程時間不足：照範本工期排，比需求上市日晚 <b>' + s.overDays + '</b> 個工作天（尚缺 ' + s.overDays + ' 個工作天）</div>';
  // §4.8.7.10：砍層三獨立頁，頂部只到層二。層二搞不定 → 按右下角「下一步」直接進 Stage 2 大表逐項微調（帶入層二改好的工期）。
  if (sel === '2') {
    return head + banner + App._ovfLayer2Panel(vid, s, v);
  }
  if (sel === '1') {
    // §N1：採用層一後 → 層一卡選中（燈亮）＋層二卡反灰鎖；達標 banner；按右下角「下一步」進 Stage 2 或切上方 Tab 處理別案。
    return head + banner + App._ovfLayer1Html(vid, s, v, true) + App._ovfLayer2CardHtml(vid, v, true);
  }
  if (resolved) {
    return head + banner + '<div class="ovf-resolved-hint"><i class="ti ti-arrow-down-circle"></i> 可直接點右下角「下一步」進任務大表，或切換上方其他案別繼續處理。</div>';
  }
  return head + banner + '<div class="ovf-hd">排程時間不足（尚缺 ' + s.overDays + ' 個工作天），請用以下方式處理；仍不足可按右下角「下一步：進入 Stage 2」進大表逐項微調：</div>' +
    App._ovfLayer1Html(vid, s, v) + App._ovfLayer2CardHtml(vid, v);
};
App._ovfLayer1Html = function(vid, s, v, selected) {
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  if (selected) {
    return '<div class="ovf-plan ovf-p1 on">' +
      '<div class="ovf-radio on"><span></span></div>' +
      '<div class="ovf-pbody">' +
        '<div class="ovf-pt">已採用系統建議的最快可行上市日 <span class="ovf-tag easy">已套用</span></div>' +
        '<div class="ovf-pd">上市日已改為 <b>' + fmtD(v.schedule.endDate) + '</b>，系統已重排並點亮綠燈。如需改用其他方式，按左下「上一步」可退回重選。</div>' +
      '</div></div>';
  }
  return '<div class="ovf-plan ovf-p1">' +
    '<div class="ovf-radio" onclick="App._ovfAdoptFastest(\'' + vid + '\')"></div>' +
    '<div class="ovf-pbody">' +
      '<div class="ovf-pt">採用系統建議的最快可行上市日 <span class="ovf-tag easy">最省力</span></div>' +
      '<div class="ovf-pd">依現有工期與前置，最快 <b>' + fmtD(s.earliestFinish) + '</b> 可上市，比原定 ' + fmtD(v.schedule.endDate) + ' 順延 ' + s.overDays + ' 個工作天。</div>' +
      '<button class="tb-action ovf-p1btn" onclick="App._ovfAdoptFastest(\'' + vid + '\')">把上市日期改成 ' + fmtD(s.earliestFinish) + '</button>' +
    '</div></div>';
};
App._ovfLayer2CardHtml = function(vid, v, locked) {
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  const click = locked ? '' : ' onclick="App._ovfPickLayer(\'' + vid + '\',\'2\')"';
  return '<div class="ovf-plan ovf-p2' + (locked ? ' locked' : '') + '">' +
    '<div class="ovf-radio"' + click + '></div>' +
    '<div class="ovf-pbody">' +
      '<div class="ovf-pt"' + click + '>延後需求上市日 <span class="ovf-tag mid">中度微調 · 核心主線</span></div>' +
      '<div class="ovf-pd">重新指定一個您可以接受的較晚日期（須晚於 ' + fmtD(v.schedule.endDate) + '），或在內部精選長工時任務快速縮減。</div>' +
    '</div></div>';
};
App._ovfLayer2Panel = function(vid, s, v) {
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  return '<div class="ovf-plan ovf-p2 on">' +
    '<div class="ovf-radio on"><span></span></div>' +
    '<div class="ovf-pbody">' +
      '<div class="ovf-pt">延後需求上市日 <span class="ovf-tag mid">中度微調 · 核心主線</span></div>' +
      '<div class="ovf-pd">重新指定一個您可以接受的較晚日期（須晚於 ' + fmtD(v.schedule.endDate) + '），由系統重算時間差。</div>' +
      '<div class="ovf-l2-row"><input class="ovf-l2-date" type="date" min="' + v.schedule.endDate + '">' +
        '<button class="ovf-l2-recalc-btn" onclick="App._ovfRecalc(\'' + vid + '\')">重新計算餘裕</button></div>' +
      App._ovfTop3Html(vid, s) +
    '</div></div>';
};
// §A 有效縮短瓶頸（模擬法）：對各任務模擬「工期縮到 1 天」重算總完工日，能真正縮短總天數的才算「有效瓶頸」、縮短量＝該任務有效上限。
// 取代 CPM 零浮時近似——零浮時會把「多前置匯合（如 13『6,9』）的並行等長鏈」全標關鍵，但改其中單一條、另一條還拖著＝改了沒用（Paul 實測「扣不下來」根因）。
// 回 Map(id → 可縮短日曆天上限)；>0＝改了有效。純函式（clone，不碰 res.tasks），只順推不逆推。
App._effectiveGains = function(variantId) {
  const res = this._tplPreview; if (!res) return new Map();
  const ts = (res.tasks || []).filter(t => t.variant === variantId);
  if (!ts.length) return new Map();
  const todayIso = D.fmt(D.today(), 'iso');
  const finishOf = (tasks) => {
    const fwd = tasks.map(t => Object.assign({}, t, { start: '' }));
    fwd.forEach(t => { if (!t.predecessor) t.plannedStart = todayIso; });   // 統一起點（瓶頸結構與絕對起點無關）
    const r = computeSchedule(fwd); let fin = '';
    r.results.forEach(x => { if (x.suggestedEnd && x.suggestedEnd > fin) fin = x.suggestedEnd; });
    return fin;
  };
  const baseFin = finishOf(ts);
  const gains = new Map();
  ts.forEach(t => {
    if ((t.durationDays || 0) <= 1) { gains.set(t.id, 0); return; }
    const sim = ts.map(x => x.id === t.id ? Object.assign({}, x, { durationDays: 1 }) : x);
    const f = finishOf(sim);
    const g = (f && baseFin) ? Math.max(0, Math.round((new Date(baseFin) - new Date(f)) / 86400000)) : 0;
    gains.set(t.id, g);
  });
  return gains;
};
// 精選：只列「關鍵路徑上」的長工時前 5（§A，改了才有效縮短總工期）。清單穩定（首次算定存 topN，扣減不重排→防手動值跳回）；
// 「重新計算/再次重算」時清 topN 重列當前關鍵路徑（壓縮後關鍵路徑可能轉移到另一條鏈）。
App._ovfTopTasks = function(vid) {
  const res = this._tplPreview; const st = App._ovfState;
  if (st && st.topN && st.topN[vid]) {
    return st.topN[vid].map(id => (res.tasks || []).find(t => t.id === id)).filter(Boolean);
  }
  const gains = App._effectiveGains(vid);
  // §A 每階段取「改了最有效(gain 最大>0)」的 1 個代表 → 避免同階段並行等長任務一次列多個(改任一個被另一個拖、白改)。
  // 同階段並行互拖(全 gain=0)→該階段不列；改源頭/串行瓶頸(讓整階段一起動)會被選為代表。跨階段按 gain 排序取前 5(自然 3~5 個)。
  const byStage = {};
  (res.tasks || []).filter(t => t.variant === vid).forEach(t => {
    const s = (t.stage || '').trim() || '其他';
    (byStage[s] = byStage[s] || []).push(t);
  });
  const reps = [];
  Object.keys(byStage).forEach(s => {
    const cand = byStage[s].filter(t => (gains.get(t.id) || 0) > 0).sort((a, b) => (gains.get(b.id) || 0) - (gains.get(a.id) || 0));
    if (cand.length) reps.push(cand[0]);
  });
  reps.sort((a, b) => (gains.get(b.id) || 0) - (gains.get(a.id) || 0));
  const ts = reps.slice(0, 5);
  if (st) { if (!st.topN) st.topN = {}; st.topN[vid] = ts.map(t => t.id); }
  return ts;
};
// §c 有效縮減上限：對單一任務二分搜尋「工期最多能縮幾天、再縮就被並行任務接手、總時程不再變短」。
// 回 {dur, cap(最多有效縮減工作天), minDur(縮到此值就見底)}。純函式只順推。供 Top5 顯示上限＋扣減 clamp 防縮過頭。
App._taskCap = function(vid, taskId) {
  const res = this._tplPreview; if (!res) return { dur: 0, cap: 0, minDur: 0 };
  const ts = (res.tasks || []).filter(t => t.variant === vid);
  const t = ts.find(x => x.id === taskId); if (!t) return { dur: 0, cap: 0, minDur: 0 };
  const dur = t.durationDays || 0;
  if (dur <= 1) return { dur, cap: 0, minDur: dur };
  const todayIso = D.fmt(D.today(), 'iso');
  const finWith = (d) => {
    const fwd = ts.map(x => Object.assign({}, x, { start: '', durationDays: x.id === taskId ? d : (x.durationDays || 0) }));
    fwd.forEach(x => { if (!x.predecessor) x.plannedStart = todayIso; });
    const r = computeSchedule(fwd); let f = '';
    r.results.forEach(z => { if (z.suggestedEnd && z.suggestedEnd > f) f = z.suggestedEnd; });
    return f;
  };
  const baseFin = finWith(dur), minFin = finWith(1);
  if (!baseFin || !minFin || minFin >= baseFin) return { dur, cap: 0, minDur: dur };   // 縮了也不影響總時程（非瓶頸）
  let lo = 1, hi = dur - 1, cap = dur - 1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (finWith(dur - mid) <= minFin) { cap = mid; hi = mid - 1; } else lo = mid + 1; }
  return { dur, cap, minDur: dur - cap };
};
App._ovfTop3Html = function(vid, s) {
  const ts = App._ovfTopTasks(vid);
  const rows = ts.map((t, i) => {
    const dur = t.durationDays || 0;
    const cp = App._taskCap(vid, t.id);
    const cap = cp.cap, minDur = cp.minDur;
    let d1 = Math.min(3, Math.max(1, Math.round(dur * 0.15)));
    let d2 = Math.min(5, Math.max(2, Math.round(dur * 0.25)));
    d1 = Math.min(d1, cap); d2 = Math.min(d2, cap);   // §c 膠囊不超過有效上限
    const meta = [(t.stage || '').trim(), (t.role || '').trim()].filter(Boolean).join(' · ') || '未分階段';
    const capNote = cap > 0
      ? '<span class="ovf-t3cap">工期 ' + dur + ' 天，但最多有效縮 <b>' + cap + '</b> 天（縮到 ' + minDur + ' 天就見底，再縮會被並行任務接手、省不了總時程）</span>'
      : '<span class="ovf-t3cap none">此任務已不在瓶頸上，縮了不影響總時程</span>';
    const pills = cap > 0
      ? '<button class="ovf-pill" onclick="App._ovfTrim(\'' + vid + '\',\'' + t.id + '\',' + d1 + ')">−' + d1 + ' 天</button>' +
        (d2 > d1 ? '<button class="ovf-pill" onclick="App._ovfTrim(\'' + vid + '\',\'' + t.id + '\',' + d2 + ')">−' + d2 + ' 天</button>' : '') +
        '<span class="ovf-t3or">或</span>' +
        '<span class="ovf-t3man">手動 <input type="number" min="' + minDur + '" class="ovf-t3inp" value="' + dur + '" ' +
          'onkeydown="if(event.key===\'Enter\'){event.preventDefault();this.blur();}" ' +
          'onchange="App._ovfSetDur(\'' + vid + '\',\'' + t.id + '\',this.value)"> 天</span>'
      : '';
    return '<div class="ovf-t3row">' +
      '<span class="ovf-t3n">' + String.fromCharCode(65 + i) + '</span>' +
      '<span class="ovf-t3nmwrap"><span class="ovf-t3nm" title="' + U.esc(t.name) + '">' + U.esc(t.name) + '</span>' +
        '<span class="ovf-t3meta">' + U.esc(meta) + '</span></span>' +
      '<span class="ovf-t3dur">目前工期 <b>' + dur + '</b> 天</span><span class="ovf-t3arr">→</span>' +
      pills + capNote +
    '</div>';
  }).join('');
  const resolved = !s || s.light !== 'red';
  const hd = resolved
    ? '<div class="ovf-t3hd ok"><i class="ti ti-circle-check"></i> 時間已足夠！可直接建立，或繼續微調以下各階段瓶頸任務：</div>'
    : '<div class="ovf-t3hd"><i class="ti ti-alert-triangle"></i> 時間仍不足 ' + s.overDays + ' 個工作天！系統為您精選各階段「改了最能縮短總時程」的瓶頸任務（每階段一個·避免並行互拖白改），請嘗試縮減：</div>';
  return '<div class="ovf-t3box">' + hd + rows + App._ovfMiniBattleHtml(vid, s) +
    '<div class="ovf-t3foot"><button class="tb-action ovf-recalc" onclick="App._ovfReeval(\'' + vid + '\')">再次重算</button>' +
      (resolved ? '' : '<span class="ovf-t3tip"><i class="ti ti-bulb"></i> 小祕訣：每按一次重算，系統會自動撈出下一批<b>不重複</b>的瓶頸任務讓您繼續縮減，可一路扣到<b>尚缺歸零</b>；仍不足也可按右下角「下一步」進大表微調。</span>') + '</div>' +
  '</div>';
};
App._ovfMiniBattleHtml = function(vid, s) {
  const st = App._ovfState; const v = (this._tplPreview.variants || []).find(x => x.id === vid);
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  const nowOver = (s && s.light === 'red') ? s.overDays : 0;
  const cut = Math.max(0, (st.baseOver[vid] || 0) - nowOver);
  const enough = nowOver <= 0;
  return '<div class="ovf-mini">' +
    '<div class="ovf-mini-hd"><i class="ti ti-chart-line"></i> 層二微調即時戰報</div>' +
    '<div class="ovf-mini-row"><span class="ovf-mini-k">目標上市日對齊</span><span class="ovf-mini-old">預期 ' + fmtD(v.schedule.endDate) + '</span><span class="ovf-mini-arr">➔</span>' +
      (enough ? '<b class="ovf-mini-ok">時間已足夠，可直接套用</b>'
              : '<b class="ovf-mini-lack">還差 ' + nowOver + ' 個工作天</b><span class="ovf-mini-cut">（已縮短 ' + cut + ' 天）</span>') + '</div>' +
    '<div class="ovf-mini-judge">' + (enough
      ? '<i class="ti ti-circle-check"></i> 已解決，按上方「建立專案」或「再次重算」確認。'
      : '<i class="ti ti-alert-triangle"></i> <b>仍超出目標</b>，建議繼續扣減瓶頸任務，或按右下角「下一步：進入 Stage 2」進大表逐項微調。') + '</div>' +
  '</div>';
};
// §4.8.7.10：層三獨立頁退役（2026-06-27）。已刪 _ovfLayer3CardHtml／_ovfLockedTableHtml／_ovfSegmentedHtml／_ovfBattleHtml／_ovfStage3TableHtml。
// 層二搞不定 → 右下角「下一步」直接進 Stage 2 大表（帶入層二工期），由 Stage 2 頂部進度條 dashboard＋⚠️標籤指引補完。
App._ovfAdoptFastest = function(vid) {
  const res = this._tplPreview; const v = (res.variants || []).find(x => x.id === vid); if (!v) return;
  const s = App._s2VariantSlack(vid); if (!s || !s.earliestFinish) return;
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  App.confirmModal({
    icon: 'ti-circle-check', iconBg: '--sage-50', iconColor: '--sage-600',
    title: '確認更換為系統建議上市日？',
    msg: '系統已為您重新規劃最佳排程。確認後，本案的需求上市日將改為 <b>' + fmtD(s.earliestFinish) + '</b>（順延 ' + s.overDays + ' 個工作天），系統將自動點亮綠燈並套用排程。',
    okText: '確認套用並關閉',
    onConfirm: function() {
      v.schedule.endDate = s.earliestFinish;
      App._reschedulePreview(res.tasks, res.variants, []);
      App._ovfState.sel[vid] = '1';   // §N1：採用層一後停留本案，層一燈亮、層二鎖；使用者自行按「下一步」進 Stage 2 或切 Tab 處理別案
      App._ovfRefresh();
    }
  });
};
// 達標後轉場：全案都解決→前往 Stage 2（任務細節/負責人在那編，不在溢出面板硬擋）；仍有紅案→自動切到下一個紅案接力。
App._ovfAfterResolve = function(vid) {
  const res = App._tplPreview; if (!res) return;
  const reds = (res.variants || []).filter(x => { const ss = App._s2VariantSlack(x.id); return ss && ss.light === 'red'; });
  if (!reds.length) {
    App._renderStage2New();
  } else {
    App._ovfState.tab = reds[0].id;
    App._ovfState.sel[reds[0].id] = null;
    App._ovfRefresh();
    U.toast('✓ 本案已解決，請繼續處理下一個時程不足的案別：' + (reds[0].name || ''), 'success');
  }
};
// 前往 Stage 2（任務大表）：§第1 進場前掃所有案，仍有紅燈（未處理）→ 彈設計款窗列出哪些案尚缺幾天，按「仍要進」才進、否則留在面板逐案處理。
App._ovfGotoStage2 = function() {
  const res = App._tplPreview;
  const reds = res ? (res.variants || []).filter(v => { const s = App._s2VariantSlack(v.id); return s && s.light === 'red'; }) : [];
  if (reds.length) {
    const names = reds.map(v => {
      const s = App._s2VariantSlack(v.id);
      const isMain = (res.variants || [])[0] && (res.variants || [])[0].id === v.id;
      return '・' + (isMain ? '主案' : '子案') + ' ' + U.esc(v.name || '') + '（尚缺 ' + (s ? s.overDays : 0) + ' 個工作天）';
    }).join('<br>');
    App.confirmModal({
      icon: 'ti-alert-triangle', iconBg: '--rose-l', iconColor: '--rose',
      title: '還有案別時程未處理',
      msg: '以下案別仍時程不足、尚未在本面板處理：<br><br>' + names + '<br><br>可切換上方頁籤逐案處理，或仍要直接進入任務大表逐項微調？',
      okText: '仍要進入大表 →', cancelText: '留在此繼續處理',
      onConfirm: function() { App._renderStage2New(); }
    });
    return;
  }
  App._renderStage2New();
};
// 案頭前後時程對照看板：原始 Stage1 區間 ➔ 變更後區間（順延 N 工作天）。未變更則只顯示需求上市日。
App._ovfRangeBadge = function(vid, v) {
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  const st = App._ovfState;
  const baseEnd = (st && st.baseEnd) ? st.baseEnd[vid] : '';
  const curEnd = v.schedule.endDate;
  const sd = v.schedule.startDate;
  const sFmt = sd ? fmtD(sd) : '（自動起算）';
  if (baseEnd && curEnd && curEnd !== baseEnd) {
    const delay = curEnd > baseEnd ? Math.max(0, D.workdaysBetween(baseEnd, curEnd) - 1) : 0;
    return '<span class="ovf-rangebadge">' +
      '<span class="ovf-rb-old"><i class="ti ti-history"></i> 原始 ' + sFmt + ' → ' + fmtD(baseEnd) + '</span>' +
      '<span class="ovf-rb-arr">➔</span>' +
      '<span class="ovf-rb-new">新時程 ' + sFmt + ' → ' + fmtD(curEnd) + (delay > 0 ? ' <span class="ovf-rb-delay">順延 ' + delay + ' 個工作天</span>' : '') + '</span>' +
    '</span>';
  }
  return '<span class="ovf-case-range">' + sFmt + ' → ' + fmtD(curEnd) + '（需求上市日）</span>';
};
App._ovfRecalc = function(vid) {
  const res = this._tplPreview; const v = (res.variants || []).find(x => x.id === vid); if (!v) return;
  const box = document.getElementById('ovf-casebox'); const inp = box ? box.querySelector('.ovf-l2-date') : null;
  const val = inp ? inp.value : '';
  if (val && val > v.schedule.endDate) { v.schedule.endDate = val; App._reschedulePreview(res.tasks, res.variants, []); }
  if (App._ovfState && App._ovfState.topN) delete App._ovfState.topN[vid];   // §A 重算→清 Top5 快取，重列當前關鍵路徑
  App._ovfRefresh();
  App._ovfResultModal(vid);   // 回饋一律走中央白底窗（取代右下角灰 toast）；無效/未填日期＝就地重算現況
};
App._ovfTrim = function(vid, taskId, days) {
  const res = this._tplPreview; const t = (res.tasks || []).find(x => x.id === taskId); if (!t) return;
  const cp = App._taskCap(vid, taskId);
  const target = (t.durationDays || 0) - days;
  const clamped = Math.max(cp.minDur, target);   // §c 不能縮過有效上限（再縮被並行任務接手、白縮）
  if (clamped > target) U.toast('已達有效上限（縮到 ' + cp.minDur + ' 天），再縮也省不了總時程——瓶頸已轉移到並行任務', 'warning');
  t.durationDays = Math.max(0, clamped);
  App._ovfState.modified[taskId] = true;
  App._reschedulePreview(res.tasks, res.variants, []); App._ovfRefresh();
};
App._ovfSetDur = function(vid, taskId, value) {
  const res = this._tplPreview; const t = (res.tasks || []).find(x => x.id === taskId); if (!t) return;
  const cp = App._taskCap(vid, taskId);
  const target = Math.max(0, parseInt(value) || 0);
  const clamped = Math.max(cp.minDur, target);   // §c clamp 到有效上限
  if (clamped > target) U.toast('已達有效上限（縮到 ' + cp.minDur + ' 天），再縮也省不了總時程——瓶頸已轉移到並行任務', 'warning');
  t.durationDays = clamped;
  App._ovfState.modified[taskId] = true;
  App._reschedulePreview(res.tasks, res.variants, []); App._ovfRefresh();
};
// 重算/再次重算後的結果回饋窗：夠了→問是否直接建立；不夠→告知還差幾天＋下一步建議。
App._ovfResultModal = function(vid) {
  const res = App._tplPreview; const v = (res.variants || []).find(x => x.id === vid); if (!v) return;
  const s = App._s2VariantSlack(vid);
  const fmtD = (x) => x ? String(x).replace(/-/g, '/') : '';
  const resolved = !s || s.light !== 'red';
  if (resolved) {
    App.confirmModal({
      icon: 'ti-calendar-check', iconBg: '--sage-50', iconColor: '--sage-600',
      title: '時間已足夠！',
      msg: '新排程已可在 <b>' + fmtD(v.schedule.endDate) + '</b> 前完成' + (s ? '，餘裕 ' + s.slack + ' 個工作天' : '') + '。下一步前往任務細節編輯頁（指派負責人、調整任務）。',
      okText: '確認並前往調整任務細節', cancelText: '留在此頁微調',
      onConfirm: function() { App._ovfAfterResolve(vid); }
    });
  } else {
    App.confirmModal({
      icon: 'ti-calendar', iconBg: '--amber-l', iconColor: '--amber-accent',
      title: '重新計算完成：時間仍不足',
      msg: '目前仍差 <b>' + s.overDays + '</b> 個工作天。您可以繼續扣減上方瓶頸任務、改更晚的上市日，或按右下角「下一步」進 Stage 2 大表逐項微調。',
      okText: '我知道了', cancelText: null
    });
  }
};
// 再次重算：刷新即時戰報＋彈結果回饋窗（與重新計算同一回饋來源）。
App._ovfReeval = function(vid) { if (App._ovfState && App._ovfState.topN) delete App._ovfState.topN[vid]; App._ovfRefresh(); App._ovfResultModal(vid); };   // §A 再次重算→清 Top5 快取，重列當前關鍵路徑
// 上一步：在層別內（選過層二/三）先退回三層選擇（保留本案排程編輯，不離開面板）；已在三層選擇頁才回 Stage 1。
App._ovfBack = function() {
  const tab = App._ovfState ? App._ovfState.tab : null;
  if (tab && App._ovfState.sel[tab]) { App._ovfState.sel[tab] = null; App._ovfRefresh(); return; }
  App._s2BackToStage1();
};

// ═══ 共用部門編輯 component（buildDeptRowsHtml 渲染 + deptUI 互動；編輯/模板兩端共用）═══
// 資料結構統一：depts = [{id, name, members:[{id, name}]}]
// mode='edit'：backing=project.depts，每動即時 Storage.save + 重繪容器
// mode='tpl' ：backing=App._tplDepts（暫存），每動只重繪容器、不存（下一步由 saveProject 收集）
App.buildDeptRowsHtml = function(depts, mode, projId) {
  const pid = projId || '';
  return (depts || []).map(d => `
      <div class="dept-edit-row" data-dept-id="${d.id}">
        <div class="dept-pill">
          <input class="dept-edit-name" value="${U.esc(d.name)}" placeholder="例：研發部" onchange="App.deptUI.renameDept('${mode}','${pid}','${d.id}',this.value)">
          <span class="dept-pill-sep"></span>
          <div class="dept-members">
            ${(d.members || []).map(m => `<span class="dept-member-chip"><input class="dept-member-name" data-member-id="${m.id}" value="${U.esc(m.name)}" placeholder="例：王小明" onchange="App.deptUI.renameMember('${mode}','${pid}','${d.id}','${m.id}',this.value)"><button class="dept-member-del" title="刪除擔當" onclick="App.deptUI.removeMember('${mode}','${pid}','${d.id}','${m.id}')">×</button></span>`).join('')}
            <button class="dept-member-add" onclick="App.deptUI.addMember('${mode}','${pid}','${d.id}')">＋擔當</button>
          </div>
        </div>
        <button class="dept-del-btn" title="刪除部門" onclick="App.deptUI.removeDept('${mode}','${pid}','${d.id}')">×</button>
      </div>`).join('');
};

App.deptUI = {
  // backing store 分流：edit→project.depts（持久）/ tpl→App._tplDepts（暫存）
  _store(mode, projId) {
    if (mode === 'edit') {
      const p = App.getProj(projId);
      if (!p) return null;
      if (!p.depts) p.depts = [];
      return p.depts;
    }
    if (!App._tplDepts) App._tplDepts = [];
    return App._tplDepts;
  },
  // 寫入時機分流：edit→存檔+重繪 / tpl→只重繪（不存）
  _after(mode, projId, focusSel) {
    if (mode === 'edit') Store.projects.save();   // 部門編輯只動 project.depts
    this._rerender(mode, projId, focusSel);
  },
  // 只重繪部門容器（#deptEditorList），不重開整個 modal → 保住其他未存欄位
  // 多專案一鍵配置時各段容器為 deptEditorList-<projId>；找不到才 fallback 舊單一 id（既有單案編輯不受影響）
  _rerender(mode, projId, focusSel) {
    const box = document.getElementById('deptEditorList-' + projId) || document.getElementById('deptEditorList');
    if (!box) return;
    box.innerHTML = App.buildDeptRowsHtml(this._store(mode, projId), mode, projId);
    if (focusSel) {
      const el = box.querySelector(focusSel);
      if (el) el.focus();
    }
  },
  addDept(mode, projId) {
    const store = this._store(mode, projId);
    if (!store) return;
    const id = U.id();
    store.push({ id: id, name: '', members: [{ id: U.id(), name: '' }] });
    this._after(mode, projId, '.dept-edit-row[data-dept-id="' + id + '"] .dept-edit-name');
  },
  renameDept(mode, projId, deptId, val) {
    const store = this._store(mode, projId);
    if (!store) return;
    const d = store.find(x => x.id === deptId);
    if (!d) return;
    const v = (val || '').trim();
    if (mode === 'edit' && !v) { U.toast('部門名不可空白'); return; }
    d.name = v;
    this._after(mode, projId);
  },
  removeDept(mode, projId, deptId) {
    const store = this._store(mode, projId);
    if (!store) return;
    const self = this;
    const _doRemove = () => {
      const i = store.findIndex(x => x.id === deptId);
      if (i >= 0) store.splice(i, 1);
      if (mode === 'tpl' && store.length === 0) store.push({ id: U.id(), name: '', members: [{ id: U.id(), name: '' }] });   // 模板維持至少 1 列
      self._after(mode, projId);
    };
    if (mode === 'edit') {
      const n = DATA.tasks.filter(t => t.dept === deptId).length;
      if (n > 0) { App.openDeptReassign(projId, deptId); return; }   // 有任務掛著 → 改派彈窗（安全網）
      const d0 = store.find(x => x.id === deptId);
      App.confirmModal({ icon: 'ti-trash', iconBg: '--rose-l', iconColor: '--rose-ink',
        title: `確定刪除部門「${d0 ? d0.name : deptId}」？`, okText: '刪除', cancelText: '取消', okClass: 'danger', onConfirm: _doRemove });
      return;
    }
    _doRemove();
  },
  addMember(mode, projId, deptId) {
    const store = this._store(mode, projId);
    if (!store) return;
    const d = store.find(x => x.id === deptId);
    if (!d) return;
    if (!d.members) d.members = [];
    const mid = U.id();
    d.members.push({ id: mid, name: '' });
    this._after(mode, projId, '[data-member-id="' + mid + '"]');
  },
  renameMember(mode, projId, deptId, memberId, val) {   // 修 bug：成員姓名改成可編輯
    const store = this._store(mode, projId);
    if (!store) return;
    const d = store.find(x => x.id === deptId);
    if (!d || !d.members) return;
    const m = d.members.find(x => x.id === memberId);
    if (!m) return;
    m.name = (val || '').trim();
    this._after(mode, projId);
  },
  removeMember(mode, projId, deptId, memberId) {
    const store = this._store(mode, projId);
    if (!store) return;
    const d = store.find(x => x.id === deptId);
    if (!d || !d.members) return;
    d.members = d.members.filter(x => x.id !== memberId);
    this._after(mode, projId);
  }
};

App.openDeptReassign = function(projId, deptId) {
  const p = App.getProj(projId);
  if (!p || !p.depts) return;
  const delDept = p.depts.find(x => x.id === deptId);
  const affected = DATA.tasks.filter(t => t.dept === deptId);
  // 下拉選項:其他部門 + 未指派
  const optDepts = p.depts.filter(x => x.id !== deptId);
  const rows = affected.map(t => {
    const label = (t.wbs !== undefined && t.wbs !== null && String(t.wbs).trim() !== '')
      ? (U.esc(String(t.wbs)) + ' ' + U.esc(t.name || ''))
      : U.esc(t.name || '');
    const opts = ['<option value="">— 請選擇 —</option>']
      .concat(optDepts.map(d => '<option value="' + d.id + '">' + U.esc(d.name) + '</option>'))
      .concat(['<option value="__UNASSIGN__">未指派</option>'])
      .join('');
    return '<div class="reassign-row" data-task-id="' + t.id + '">'
      + '<span class="reassign-task">' + label + '</span>'
      + '<select class="reassign-select" onchange="App.checkReassignReady()">' + opts + '</select>'
      + '</div>';
  }).join('');
  const body = '<div class="reassign-list">' + rows + '</div>';
  const footer = '<button class="tb-action ghost" onclick="App.openProjectDialog(\'' + projId + '\')">取消</button>'
    + '<button id="reassign-del-btn" class="tb-action danger" disabled '
    + 'onclick="App.confirmDeptReassign(\'' + projId + '\',\'' + deptId + '\')">刪除部門</button>';
  App.openModal({
    title: '刪除部門「' + (delDept ? U.esc(delDept.name) : deptId) + '」— 改派 ' + affected.length + ' 個任務',
    body: body,
    footer: footer
  });
};

App.checkReassignReady = function() {
  const sels = document.querySelectorAll('.reassign-select');
  const btn = document.getElementById('reassign-del-btn');
  if (!btn) return;
  const allChosen = Array.from(sels).every(s => s.value !== '');
  btn.disabled = !allChosen;
};

App.confirmDeptReassign = function(projId, deptId) {
  const p = App.getProj(projId);
  if (!p || !p.depts) return;
  const rows = Array.from(document.querySelectorAll('.reassign-row'));
  // 防呆:全部 select 有值才執行(防繞過 disabled 造成半套寫入)
  if (!rows.every(r => { const s = r.querySelector('.reassign-select'); return s && s.value !== ''; })) return;
  rows.forEach(r => {
    const taskId = r.getAttribute('data-task-id');
    const val = r.querySelector('.reassign-select').value;
    const t = DATA.tasks.find(x => x.id === taskId);
    if (!t) return;
    t.dept = (val === '__UNASSIGN__') ? '未指派' : val;
  });
  p.depts = p.depts.filter(x => x.id !== deptId);
  Store.tasks.save();                  // 上方迴圈改了 t.dept（reassign）→ 需存 tasks（_after 只存 project.depts）
  App.deptUI._after('edit', projId);   // 存 project.depts + 重繪部門容器（取代舊 deptEdit._commit）
};

App.deleteProject = function(id) {
  if (App._roGuard()) return;
  const p = this.getProj(id);
  if (!p) return;
  const taskCnt = this.getTasksOf(id).length;
  App.confirmModal({
    icon: 'ti-trash', iconBg: '--rose-l', iconColor: '--rose-ink',
    title: `刪除專案「${p.name}」？`, msg: `含 ${taskCnt} 個任務會一起移到「專案檔案室 · 回收桶」，30 天內可還原。`, okText: '刪除', cancelText: '取消', okClass: 'danger',
    onConfirm: () => {
      // §23 approach B：軟刪除＝把專案搬到獨立回收桶 DATA.projectsTrash（離開 DATA.projects → 全站 60+ 專案迭代點零改動即不再看到）。
      //   該案任務沿用既有 _deleted 過濾（標 _delWithProj 供還原時精準復原、不動使用者先前個別刪的任務）。逾期 30 天由 purgeExpiredTrash 真清。
      p.deletedAt = new Date().toISOString();
      DATA.tasks.forEach(t => { if (t.project === id && !t._deleted) { t._deleted = true; t._deletedAt = p.deletedAt; t._delWithProj = true; } });
      DATA.projects = DATA.projects.filter(x => x.id !== id);
      (DATA.projectsTrash = DATA.projectsTrash || []).push(p);
      if (App.currentProjectId === id) App.currentProjectId = null;
      Store.projects.save();        // 移出活案
      Store.projectsTrash.save();   // 進回收桶
      Store.tasks.save();           // 該案任務軟刪
      App.closeModal();
      App.showPage('workspace', document.querySelector('[data-page=workspace]'));
      App.refreshAll();   // 刪完重繪 sidebar + 工作台彙總；showPage 已先設 currentPage=workspace，避開 renderProject null 自動跳第一個專案
      U.toast('已移到回收桶（30 天內可在專案檔案室還原）', 'success');
    },
  });
};

// §23 還原：從回收桶搬回活案＋復原隨案軟刪的任務（stage3 檔案室 UI 呼叫；不動使用者先前個別刪的任務）
App.restoreProject = function(id) {
  const trash = DATA.projectsTrash || [];
  const i = trash.findIndex(x => x.id === id);
  if (i < 0) return;
  const p = trash[i];
  delete p.deletedAt;
  DATA.tasks.forEach(t => { if (t.project === id && t._delWithProj) { t._deleted = false; delete t._deletedAt; delete t._delWithProj; } });
  trash.splice(i, 1);
  DATA.projects.push(p);
  Store.projects.save(); Store.projectsTrash.save(); Store.tasks.save();
  App.refreshAll();
  U.toast('已還原專案', 'success');
};

// §23 永久刪除：從回收桶清掉＋真刪該案任務（confirmModal danger·不可還原·規則·彈窗只用設計款）
App.purgeProject = function(id) {
  const p = (DATA.projectsTrash || []).find(x => x.id === id);
  if (!p) return;
  App.confirmModal({
    icon: 'ti-trash', iconBg: '--rose-l', iconColor: '--rose-ink',
    title: `永久刪除「${p.name}」？`, msg: '永久刪除後無法還原，該案任務也一併清除。', okText: '永久刪除', cancelText: '取消', okClass: 'danger',
    onConfirm: () => {
      DATA.projectsTrash = (DATA.projectsTrash || []).filter(x => x.id !== id);
      DATA.tasks = DATA.tasks.filter(t => t.project !== id);   // 真刪該案任務
      Store.projectsTrash.save(); Store.tasks.save();
      App.closeModal(); App.refreshAll();
      U.toast('已永久刪除', 'info');
    },
  });
};

// §23 init 呼叫：回收桶保留 30 天，逾期自動永久清（比照 cleanExpiredDeletedTasks 任務 14 天·專案 30 天）
App.purgeExpiredTrash = function() {
  const trash = DATA.projectsTrash || [];
  if (!trash.length) return;
  const cutoff = D.addDays(D.today(), -30);
  const keep = trash.filter(p => !p.deletedAt || new Date(p.deletedAt) > cutoff);
  if (keep.length === trash.length) return;
  const goneIds = new Set(trash.filter(p => !keep.includes(p)).map(p => p.id));
  DATA.projectsTrash = keep;
  DATA.tasks = DATA.tasks.filter(t => !goneIds.has(t.project));   // 真刪逾期案的任務
  Store.projectsTrash.save(); Store.tasks.save();
};

// ─── §23 完成 / 封存 / 重開（狀態旗標留 DATA.projects·非 trash）───
App.reopenProject = function(id) {   // 重新開啟：回進行中、退回側欄（檔案室已完成 tab 用）
  const p = this.getProj(id); if (!p) return;
  p.status = 'active'; delete p.completedAt;
  Store.projects.save();
  App.closeModal();
  App.refreshAll();
  U.toast('已重新開啟', 'success');
};
App.unarchiveProject = function(id) {   // 取消封存：清旗標、依 status 退回原位（done→已完成、active→側欄）
  const p = this.getProj(id); if (!p) return;
  p.archived = false; delete p.archiveReason; delete p.archivedAt;
  Store.projects.save();
  App.refreshAll();
  U.toast('已取消封存', 'success');
};
App.archiveProject = function(id) {   // 收進封存：必填「封存原因」（一定有原因才封存·填了才能按·不用 toast 驗證）
  const p = this.getProj(id); if (!p) return;
  App.openModal({
    title: `收進封存 · ${U.esc(p.name)}`,
    body: `<div class="form-field">
      <label>封存原因（必填）</label>
      <textarea id="pf-arch-reason" rows="3" style="width:100%;resize:vertical;" placeholder="例：專案損益不佳被喊停 / 需求變更暫停 / 已被新案取代…" oninput="App._archReasonCheck()">${U.esc(p.archiveReason || '')}</textarea>
      <div id="pf-arch-hint" style="margin-top:6px;font-size:12px;color:var(--rose-ink);display:none;">請填封存原因才能封存——一定有原因才會喊停一個專案。</div>
      <div style="margin-top:6px;font-size:12px;color:var(--ink3);">封存的專案移到「專案檔案室 · 已封存」，不在側欄顯示；日後可取消封存退回。</div>
    </div>`,
    footer: `<button class="tb-action ghost" onclick="App.closeModal()">取消</button>
             <button class="tb-action" id="pf-arch-ok" disabled onclick="App._archiveConfirm('${id}')">收進封存</button>`,
  });
  setTimeout(() => { const i = document.getElementById('pf-arch-reason'); if (i) i.focus(); App._archReasonCheck(); }, 30);
};
App._archReasonCheck = function() {   // 原因空 → OK 鈕 disabled ＋紅字內聯（規則·不用 toast）
  const ta = document.getElementById('pf-arch-reason'), ok = document.getElementById('pf-arch-ok'), hint = document.getElementById('pf-arch-hint');
  if (!ta || !ok) return;
  const v = ta.value.trim();
  ok.disabled = !v;
  if (hint) hint.style.display = v ? 'none' : '';
};
App._archiveConfirm = function(id) {
  const p = this.getProj(id); if (!p) return;
  const ta = document.getElementById('pf-arch-reason');
  const reason = ta ? ta.value.trim() : '';
  if (!reason) return;   // 保險：空值不封存（UI 已 disable）
  p.archived = true; p.archiveReason = reason; p.archivedAt = new Date().toISOString();
  Store.projects.save();
  App.closeModal();
  if (App.currentPage === 'project' && App.currentProjectId === id) App.showPage('workspace', document.querySelector('[data-page=workspace]'));
  App.refreshAll();
  U.toast('已收進封存', 'success');
};

// ─── §23 專案檔案室頁（#page-archive·三頁籤：已完成／已封存／回收桶）───
App._archTab = 'done';
App._archSwitchTab = function(t) { App._archTab = t; App.renderArchive(); };
App.renderArchive = function() {
  const el = document.getElementById('page-archive'); if (!el) return;
  const c = this._archCounts();
  const tab = this._archTab || 'done';
  const badge = (p) => p.ecnType ? '<span class="arch-badge arch-badge-ecn">設變 ECN</span>' : '<span class="arch-badge arch-badge-npi">NPI 開發</span>';
  const liveTaskCnt = (pid) => DATA.tasks.filter(t => t.project === pid && !t._deleted).length;
  const allTaskCnt = (pid) => DATA.tasks.filter(t => t.project === pid).length;
  const doneList  = (DATA.projects || []).filter(p => !p.archived && this._isProjectDone(p));
  const archList  = (DATA.projects || []).filter(p => p.archived);
  const trashList = (DATA.projectsTrash || []).slice().sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));

  const rowDone = (p) => `<div class="arch-pc arch-done">
    <div class="arch-body"><div class="arch-name">${U.esc(p.name)} ${badge(p)}</div>
      <div class="arch-meta">${p.ecnType ? '結案' : '完成'}於 ${p.completedAt ? D.fmt(p.completedAt, 'ymd') : '—'} · ${liveTaskCnt(p.id)} 任務 · <span class="arch-pill">${p.ecnType ? '已結案' : '進度 100%'}</span></div></div>
    <div class="arch-acts">
      <button class="tb-action ghost" onclick="App.reopenProject('${p.id}')">重新開啟</button>
      <button class="tb-action ghost" onclick="App.archiveProject('${p.id}')">收進封存</button>
      <button class="tb-action ghost arch-icon" title="移到回收桶" onclick="App.deleteProject('${p.id}')"><i class="ti ti-trash"></i></button>
    </div></div>`;
  const rowArch = (p) => `<div class="arch-pc arch-arch">
    <div class="arch-body"><div class="arch-name arch-dim">${U.esc(p.name)} ${badge(p)}</div>
      <div class="arch-meta">封存於 ${p.archivedAt ? D.fmt(p.archivedAt, 'ymd') : '—'} · ${liveTaskCnt(p.id)} 任務</div>
      ${p.archiveReason ? `<div class="arch-reason">封存原因：${U.esc(p.archiveReason)}</div>` : ''}</div>
    <div class="arch-acts">
      <button class="tb-action" onclick="App.unarchiveProject('${p.id}')">取消封存</button>
      <button class="tb-action ghost arch-icon" title="移到回收桶" onclick="App.deleteProject('${p.id}')"><i class="ti ti-trash"></i></button>
    </div></div>`;
  const rowTrash = (p) => {
    const until = p.deletedAt ? D.addDays(new Date(p.deletedAt), 30) : null;
    const left = until ? Math.max(0, D.daysBetween(D.today(), until)) : '—';
    return `<div class="arch-pc arch-trash">
    <div class="arch-body"><div class="arch-name arch-dim">${U.esc(p.name)} ${badge(p)}</div>
      <div class="arch-meta">刪除於 ${p.deletedAt ? D.fmt(p.deletedAt, 'ymd') : '—'} · <span class="arch-left">保留至 ${until ? D.fmt(until, 'ymd') : '—'}（剩 ${left} 天）</span> · ${allTaskCnt(p.id)} 任務一併刪除</div></div>
    <div class="arch-acts">
      <button class="tb-action" onclick="App.restoreProject('${p.id}')">↺ 還原</button>
      <button class="tb-action danger" onclick="App.purgeProject('${p.id}')">永久刪除</button>
    </div></div>`;
  };
  const empty = (m) => `<div class="arch-empty">${m}</div>`;
  let body;
  if (tab === 'done') body = doneList.length ? doneList.map(rowDone).join('') : empty('目前沒有已完成的專案。在專案編輯視窗按「標記完成」即可收尾。');
  else if (tab === 'arch') body = archList.length ? archList.map(rowArch).join('') : empty('目前沒有已封存的專案。');
  else body = (trashList.length ? `<div class="arch-hint arch-hint-warn">🗑 已刪除的專案保留 30 天可還原，過期自動永久清除。</div>` + trashList.map(rowTrash).join('') : empty('回收桶是空的。'));

  const tbtn = (k, label) => `<button class="arch-tab ${tab === k ? 'on' : ''}${k === 'trash' ? ' arch-tab-trash' : ''}" onclick="App._archSwitchTab('${k}')">${label}<span class="arch-tn">${k === 'done' ? c.done : k === 'arch' ? c.arch : c.trash}</span></button>`;
  el.innerHTML = `
    <div class="arch-hd">
      <h1 class="arch-title"><i class="ti ti-archive"></i> 專案檔案室</h1>
      <p class="arch-sub">已收尾、已封存與已刪除的專案都在這裡。側欄只保留進行中的活案，讓正在追的專案一眼看完。</p>
    </div>
    <div class="arch-tabs">${tbtn('done', '已完成')}${tbtn('arch', '已封存')}${tbtn('trash', '🗑 回收桶')}</div>
    <div class="arch-cards">${body}</div>`;
};

// ═══════════════════════════════════════════════════════════════════════════
// §22 空白專案自訂階段骨架建立流程（NPI＋ECN）——把「空白」升級成「PM 當場捏一次性範本」。
// 施工分期（§22.9）：本刀＝①引導選擇頁（Screen 0）＋②③④ Stage 1 骨架頁（階段表/月·工作天鎖欄/日期推斷/
// dynhint/甘特/餘裕/部門名冊/ECN 欄位）。Stage 2「檢視任務」＋落地映射為下一刀。
// 狀態：App._bs = { kind:'npi'|'ecn', name, color, start, end, roiType, sourceNo, reason,
//   stages:[{ id, name, months, wd, driver:'months'|'wd'|null }] }；部門名冊複用 App._tplDepts。
// 複用：_s1DynHintHtml（推斷提示）／_effScheduleDir（方向推斷）／_s1RoiCardsHtml 精神（設變類型兩卡）／
//   _deptEditorHtml（名冊）／buildHintBox（HintBox）／s2-gantt-axis 甘特結構＋s2-gbar-{綠黃紅} 號誌色。
// ═══════════════════════════════════════════════════════════════════════════

// Screen 0 引導選擇頁（§22.3）：點「空白」卡後出兩張卡——先畫骨架／完全空白。
App._flowBlankChoice = function() {
  App.openModal({
    title: '空白專案 · 建立方式',
    wide: true,
    body: '<div class="bs-choice">' +
      '<div class="bs-choice-card bs-choice-skel" onclick="App._flowBlankSkelStart(\'npi\')">' +
        '<div class="bsc-hd"><i class="ti ti-timeline-event bsc-ic"></i><span class="bsc-title">自訂時程骨架</span><span class="bsc-rec">推薦</span></div>' +
        '<div class="bsc-body">不套用複雜範本，僅需快速定義大階段與粗估工期。系統將自動換算工作天並產出里程碑甘特圖，隨後再填入細部任務。</div>' +
        '<div class="bsc-fit"><span class="bsc-fit-ic">🎯</span>適合：已有專案大方向、需優先確認大時間軸與截止日的情境。</div>' +
        '<div class="bsc-foot">預設結構：≥ 1 個階段　｜　流程：階段骨架 → 細部任務</div>' +
      '</div>' +
      '<div class="bs-choice-card bs-choice-plain" onclick="App._flowPickMode(\'blank\')">' +
        '<div class="bsc-hd"><i class="ti ti-file bsc-ic"></i><span class="bsc-title">完全空白專案</span></div>' +
        '<div class="bsc-body">跳過所有預設結構與階段劃分，直接建立一個乾淨的空白看板。您可以隨時手動新增臨時任務，彈性記錄時程與交辦事項。</div>' +
        '<div class="bsc-fit"><span class="bsc-fit-ic">🎯</span>適合：臨時交辦小案、單純記事或無需分階段的扁平化專案。</div>' +
        '<div class="bsc-foot">預設結構：0 個階段　｜　流程：直接進入任務面板</div>' +
      '</div>' +
    '</div>',
    footer: '<button class="tb-action ghost" onclick="App._flowStep1()">上一步</button>',
  });
};

// ECN「套用設變範本」入口（P5 合併 S/M/L）：先跳排程指南（P2）→ 進 ECN Stage 1（預設 M·規模於 Stage 1 內可改）。
App._flowEcnStart = function() {
  App._scheduleEduCard(
    function() { App._flowStartEcn('M'); },   // next：ECN 標準流程（S/M/L 於 Stage 1 內選）
    function() { App._flowStep1(); },          // back：回選型頁
    'ecn'
  );
};
// 骨架流程入口（P2）：先跳排程指南 → 進骨架 Stage 1。kind＝npi/ecn（由入口卡固定，不再頁內切換）。
App._flowBlankSkelStart = function(kind) {
  kind = (kind === 'ecn') ? 'ecn' : 'npi';
  App._scheduleEduCard(
    function() { App._flowBlankSkeleton(kind); },
    function() { if (kind === 'ecn') App._flowStep1(); else App._flowBlankChoice(); },   // back：ECN 骨架→選型頁·NPI 骨架→Screen 0
    kind
  );
};

// 骨架流程預設階段（NPI/ECN 共用一份，切換 kind 不動階段——同一份骨架、只換識別色與 ECN 欄位盒）。
App._bsDefaultStages = function() {
  return [
    { id: U.id(), name: 'P1 規劃 / 立項', months: 2, wd: 0, driver: 'months' },
    { id: U.id(), name: 'EVT 工程驗證', months: 3, wd: 0, driver: 'months' },
    { id: U.id(), name: 'DVT 設計驗證', months: 3, wd: 0, driver: 'months' },
    { id: U.id(), name: 'PVT / 量產導入', months: 2, wd: 0, driver: 'months' },
  ];
};
// 骨架流程預設部門骨架（複用 _tplDepts 結構；成員留空由 PM 填，placeholder 引導）。
App._bsDefaultDepts = function() {
  return [
    { id: U.id(), name: '研發部', members: [{ id: U.id(), name: '' }] },
    { id: U.id(), name: '採購', members: [{ id: U.id(), name: '' }] },
    { id: U.id(), name: '品保', members: [{ id: U.id(), name: '' }] },
    { id: U.id(), name: '專案管理 PM', members: [{ id: U.id(), name: '' }] },
  ];
};

// 先畫骨架入口（Screen 0「先畫骨架」/ Stage 1 頂部 NPI↔ECN 切換皆走此）。kind 預設 npi（由 NPI 空白卡進）。
App._flowBlankSkeleton = function(kind) {
  kind = (kind === 'ecn') ? 'ecn' : 'npi';
  App.closeModal();
  const today = D.fmt(new Date(), 'iso');   // 預設開始日＝今天（順推），甘特即時可見
  App._bs = {
    kind: kind, name: '', color: (typeof PROJ_COLORS !== 'undefined' && PROJ_COLORS[0]) || '',
    start: today, end: '',
    roiType: 'benefit', sourceNo: '', reason: '',
    stages: App._bsDefaultStages(),
  };
  App._tplDepts = App._bsDefaultDepts();
  App._renderBsStage1();
};

// （P5：Stage 1 頂部 NPI/ECN 切換鈕已移除——類型由入口卡固定，_bsSetKind 隨之退場。）

// ─── 日期換算：月↔工作天、階段接續（不重疊）、號誌燈號 ───
// 加 N 日曆月（整數月，取 round）：保日、跨月溢位由 Date 自動歸整。
App._bsAddMonths = function(d, n) {
  const x = new Date(d); x.setHours(0, 0, 0, 0);
  x.setMonth(x.getMonth() + Math.round(n || 0));
  return x;
};
// 就地取工作日：往後找到 ≥ anchor 的第一個工作日。
App._bsFirstWorkOnAfter = function(d) {
  return D.isWorkday(d) ? new Date(d) : D.addWorkdays(d, 1);
};
// 就地取工作日：往前找到 ≤ anchor 的最後一個工作日。
App._bsLastWorkOnBefore = function(d) {
  return D.isWorkday(d) ? new Date(d) : D.addWorkdays(d, -1);
};
// _bsComputeStages()：依方向推斷把 stages 排成有日期的階段串（起訖 iso＋工作天＋號誌燈號）。
//   forward（只開始日）/ interval（都填）＝從開始日順推接續；backward（只上市）＝從上市日往前接續。
//   月為主控→迄＝起 +N 日曆月（末日往前收到工作日）、wd 衍生；工作天為主控→迄＝addWorkdays(起,wd-1)、月衍生。
//   燈號：有上市日→各段迄 vs 上市日工作天差（≥5 綠／0~4 黃／<0 紅）；只填開始日→全綠。
App._bsComputeStages = function() {
  const bs = App._bs; if (!bs) return { dir: 'forward', stages: [], totalStart: '', totalEnd: '' };
  const dir = App._effScheduleDir(bs.start, bs.end, 'forward');
  const list = (bs.stages || []).map(s => Object.assign({}, s));
  const out = [];
  const durEnd = (startD, s) => {   // 順推：由起日得迄日（工作日）＋wd
    let endW;
    if (s.driver === 'wd' && s.wd > 0) endW = D.addWorkdays(startD, Math.max(1, s.wd) - 1);
    else {
      let endCal = D.addDays(App._bsAddMonths(startD, s.months || 0), -1);
      endW = App._bsLastWorkOnBefore(endCal);
      if (endW < startD) endW = new Date(startD);
    }
    return endW;
  };
  const durStart = (endD, s) => {   // 倒推：由迄日得起日（工作日）
    let startW;
    if (s.driver === 'wd' && s.wd > 0) startW = D.addWorkdays(endD, -(Math.max(1, s.wd) - 1));
    else {
      let startCal = D.addDays(App._bsAddMonths(endD, -(s.months || 0)), 1);
      startW = App._bsFirstWorkOnAfter(startCal);
      if (startW > endD) startW = new Date(endD);
    }
    return startW;
  };
  if (dir === 'backward') {
    let cursor = App._bsLastWorkOnBefore(new Date(bs.end));
    for (let i = list.length - 1; i >= 0; i--) {
      const endW = cursor, startW = durStart(endW, list[i]);
      out[i] = { start: D.fmt(startW, 'iso'), end: D.fmt(endW, 'iso'), wd: D.workdaysBetween(startW, endW) };
      cursor = D.addWorkdays(startW, -1);
    }
  } else {   // forward / interval：從開始日（無則今天）順推
    let cursor = App._bsFirstWorkOnAfter(new Date(bs.start || D.fmt(new Date(), 'iso')));
    for (let i = 0; i < list.length; i++) {
      const startW = cursor, endW = durEnd(startW, list[i]);
      out[i] = { start: D.fmt(startW, 'iso'), end: D.fmt(endW, 'iso'), wd: D.workdaysBetween(startW, endW) };
      cursor = D.addWorkdays(endW, 1);
    }
  }
  // 燈號：有上市日才算，各段迄 vs 上市日
  list.forEach((s, i) => {
    const c = out[i]; if (!c) return;
    c.name = s.name; c.months = s.months; c.driverWd = s.driver;
    // 衍生「約」值：月為主控→衍生 wd（=c.wd）；工作天為主控→衍生月（由日曆天/30.44）
    c.approxMonths = Math.max(1, Math.round((D.daysBetween(c.start, c.end) + 1) / 30.44));
    if (!bs.end) { c.light = 'green'; c.margin = null; return; }
    let margin;
    if (c.end <= bs.end) margin = D.workdaysBetween(c.end, bs.end);
    else margin = -D.workdaysBetween(bs.end, c.end);
    c.margin = margin;
    c.light = margin >= 5 ? 'green' : (margin >= 0 ? 'yellow' : 'red');
  });
  const totalStart = out.length ? out[0].start : '';
  const totalEnd = out.length ? out[out.length - 1].end : '';
  return { dir: dir, stages: out, totalStart: totalStart, totalEnd: totalEnd };
};

// ─── Stage 1 骨架頁渲染 ───
App._renderBsStage1 = function() {
  const bs = App._bs; if (!bs) return;
  const isEcn = bs.kind === 'ecn';
  const accentCls = isEcn ? 'bs-ecn' : 'bs-npi';
  // 頂部類型徽章（P5：改靜態·不可切換——類型由入口卡決定）
  const typeBadge = '<span class="bs-typebadge">' + (isEcn ? 'ECN 設變' : 'NPI 開發') + '</span>';
  // 排程小秘訣 / 開案小幫手 HintBox（文案 §22.10）
  const npiTips = App.buildHintBox({ key: 'bs-sched-tips', icon: 'ti-bulb', title: '排程導航秘訣', summary: '怎麼填日期決定排程方向', collapsed: false,
    bodyHtml: '<ul class="bs-tiplist">' +
      '<li><b>正向推演</b>（僅填開始日）：系統將自動順推各階段，算出預計完工日。</li>' +
      '<li><b>逆向倒推</b>（僅填上市日）：系統將自動逆推最晚需開工日（若時程來不及，將建議最快完工日）。</li>' +
      '<li><b>雙向精算</b>（兩者皆填）：系統自動精算時程容裕度。若產生衝突，下一步將引導您進行一鍵時程優化。</li>' +
    '</ul>' });
  const ecnHelper = App.buildHintBox({ key: 'bs-ecn-helper', icon: 'ti-bulb', title: '開案小幫手', summary: '點擊了解類型與時程邏輯', collapsed: true,
    bodyHtml: '<ol class="bs-tiplist bs-tiplist-ol">' +
      '<li><b>設變類型</b>：「效益型」（如 Cost Down）結案時系統自動對比新舊 BOM 算出省下的成本；「被迫型」（如停產／法規）系統會著重追蹤舊料消耗率、卡控生效日以降低報廢損失。</li>' +
      '<li><b>時程推算</b>：填「開始日」系統順推預估完工日；只填「上市日」回推最晚必須動工的日期；若算出工期超出上市死線，進度條將亮紅燈警示。</li>' +
      '<li><b>PM 協調工時（防呆保護）</b>：設變不是只有 RD 在忙——每張單都預設保留 PM 的跨部門協調時間。多案疊加總負載超過 100% 時，系統會發出排擠告警，避免隱形過勞。</li>' +
    '</ol>' });
  // 名冊 HintBox（§22.10 為什麼要先填名冊·預設展開）
  const rosterHint = App.buildHintBox({ key: 'bs-roster-help', icon: 'ti-info-circle', title: '為什麼要先建立部門與人名？', summary: '先填人，後面全自動帶入', collapsed: true,
    bodyHtml: '<ol class="bs-tiplist bs-tiplist-ol">' +
      '<li><b>自動配對</b>：套用範本時，系統會自動將部門成員配對至對應任務，省去逐筆指派時間。</li>' +
      '<li><b>直選下拉選單</b>：後續任務大表的「擔當」欄將自動帶入此名冊，改人、派工一鍵搞定。</li>' +
      '<li><b>人均負荷防線</b>：系統將自動統計成員的專案投入度，若跨案同人同日負荷超過 100% 將主動紅旗警示。</li>' +
    '</ol>' });
  const ecnBox = isEcn ? App._bsEcnBoxHtml() : '';
  const dateCard =
    '<div class="bs-datecard">' +
      '<label class="bs-datefield"><span class="bs-dlabel">開始日</span><input type="date" class="bs-in-start" value="' + U.esc(bs.start || '') + '" onchange="App._bsSetDate(\'start\',this.value)"></label>' +
      '<label class="bs-datefield"><span class="bs-dlabel">上市日期<span class="bs-dopt">（可留空）</span></span><input type="date" class="bs-in-end" value="' + U.esc(bs.end || '') + '" onchange="App._bsSetDate(\'end\',this.value)"></label>' +
    '</div>';
  const tb = document.querySelector('.main > .topbar');
  if (tb) tb.classList.add('topbar-hidden');
  document.querySelectorAll('.page').forEach(pg => pg.classList.remove('active'));
  const page = document.getElementById('page-bs1');
  page.className = 'page active ' + accentCls;
  page.innerHTML =
    '<div class="bs-wrap">' +
      '<div class="bs-pagehd">' +
        '<div class="bs-crumb">總儀表板 <span class="bs-crumb-sep">/</span> ' + (isEcn ? '新增設變案' : '新增專案') + '</div>' +
        typeBadge +
      '</div>' +
      '<div class="bs-title">自訂階段骨架' + (isEcn ? ' · 設變案' : '') + '</div>' +
      '<div class="bs-namecard">' +
        '<div class="bs-field"><span class="bs-flabel">專案名稱 <span class="bs-req">*</span></span>' +
          '<input type="text" class="bs-proj-name" value="' + U.esc(bs.name || '') + '" placeholder="' + U.esc(CFG('PROJECT_INPUT_EXAMPLE', '範例品項')) + '" oninput="App._bsSetName(this.value)"></div>' +
      '</div>' +
      (isEcn ? ecnHelper : npiTips) +
      ecnBox +
      dateCard +
      '<div id="bs-dyn">' + App._bsDynSectionHtml() + '</div>' +
      '<div class="bs-roster">' +
        '<div class="bs-sectitle">部門 / 負責人名冊</div>' + rosterHint + App._deptEditorHtml() +
      '</div>' +
      '<div class="bs-foot">' +
        '<button class="tb-action ghost" onclick="App._bsBack()">上一步</button>' +
        '<button class="tb-action bs-next" onclick="App._bsNext()">下一步：檢視任務</button>' +
      '</div>' +
    '</div>';
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// #bs-dyn 內容（隨日期/階段即時重畫）：推斷提示＋階段表＋甘特＋餘裕。
App._bsDynSectionHtml = function() {
  const bs = App._bs; if (!bs) return '';
  const comp = App._bsComputeStages();
  const bothEmpty = !bs.start && !bs.end;
  // 圖示：順推/區間＝綠色打勾（「已幫你算好」即時感·Point 2⑦a）；倒推＝左箭頭；雙空＝行事曆引導。
  let dynhint = App._s1DynHintHtml(bs.start, bs.end, App._bsDynMeta(comp));
  const dhIcon = bothEmpty ? 'ti-calendar-event' : (comp.dir === 'backward' ? 'ti-arrow-narrow-left' : 'ti-circle-check bs-dyn-ok');
  dynhint = dynhint.replace(/^<i[^>]*><\/i>/, '<i class="ti ' + dhIcon + '"></i>');
  dynhint = '<div class="bs-dynhint' + (bothEmpty ? ' bs-dynhint-init' : '') + '">' + dynhint + '</div>';
  return dynhint + App._bsStageSecHtml(comp) + App._bsGanttSecHtml(comp);
};
// 供 _s1DynHintHtml 的 meta（倒推最晚開工日／區間彈性）——由 comp 派生。
App._bsDynMeta = function(comp) {
  if (!comp || !comp.stages.length) return null;
  return { backStart: comp.totalStart, forwardFinish: comp.totalEnd, backFallback: false };
};
App._bsRefresh = function() {
  const c = document.getElementById('bs-dyn');
  if (c) c.innerHTML = App._bsDynSectionHtml();
};

// 階段清單區塊（標題＋新增鈕＋note＋階段表）
App._bsStageSecHtml = function(comp) {
  return '<div class="bs-stagesec">' +
      '<div class="bs-sechd"><span class="bs-sectitle">專案階段<span class="bs-sechint">（自己劃分·每階段抓幾個月，系統換算工作天）</span></span>' +
        '<button type="button" class="tb-action ghost bs-addstage" onclick="App._bsAddStage()">＋ 新增階段</button></div>' +
      '<div class="bs-stagenote">此處直接決定專案流程（由上而下）：點階段名可重新命名、按 ✕ 刪除、按 ＋ 新增階段。<b class="bs-note-em">調整後系統將自動重排下方甘特圖、並重新精算時間餘裕與燈號。</b></div>' +
      App._bsStageTableHtml(comp) +
      '<div class="bs-stagetip"><i class="ti ti-bulb"></i>耗時(月) 與 工作天 二擇一填：填了月數，工作天自動換算且反灰（反之亦然）。要改另一欄，先把目前這欄清空。</div>' +
    '</div>';
};
App._bsStageTableHtml = function(comp) {
  const bs = App._bs; const rows = bs.stages || [];
  const fmtMD = (iso) => { if (!iso) return ''; const p = String(iso).split('-'); return (+p[1]) + '/' + (+p[2]); };
  let body = '';
  rows.forEach((s, i) => {
    const c = (comp.stages[i]) || {};
    const isM = s.driver === 'months';
    const isW = s.driver === 'wd';
    const monthsCell = isW
      ? '<span class="bs-lockval"><span class="bs-approx">約</span> ' + (c.approxMonths || 0) + ' 個月</span>'
      : '<span class="bs-numwrap"><input type="number" class="bs-months bs-driverin" min="0" step="1" value="' + (s.months || '') + '" onchange="App._bsMonths(' + i + ',this.value)"><span class="bs-unit">個月</span></span>';
    const wdCell = isM
      ? '<span class="bs-lockval"><span class="bs-approx">約</span> ' + (c.wd || 0) + ' 天</span>'
      : '<span class="bs-numwrap"><input type="number" class="bs-wd bs-driverin" min="0" step="1" value="' + (s.wd || '') + '" onchange="App._bsWd(' + i + ',this.value)"><span class="bs-unit">天</span></span>';
    const range = (c.start && c.end) ? (fmtMD(c.start) + ' → ' + fmtMD(c.end)) : '—';
    const del = rows.length > 1 ? '<button type="button" class="bs-delstage" title="刪除階段" onclick="App._bsDelStage(' + i + ')"><i class="ti ti-x"></i></button>' : '<span class="bs-delstage bs-del-off"></span>';
    body +=
      '<div class="bs-strow" draggable="true" data-idx="' + i + '" ondragstart="App._bsDragStart(event,' + i + ')" ondragover="App._bsDragOver(event)" ondrop="App._bsDrop(event,' + i + ')" ondragend="App._bsDragEnd(event)">' +
        '<span class="bs-drag" title="拖曳排序">⠿</span>' +
        '<input type="text" class="bs-stagename" value="' + U.esc(s.name || '') + '" placeholder="階段名稱" onchange="App._bsRenameStage(' + i + ',this.value)">' +
        '<span class="bs-cell bs-cell-m">' + monthsCell + '</span>' +
        '<span class="bs-cell bs-cell-w">' + wdCell + '</span>' +
        '<span class="bs-cell bs-cell-r">' + range + '</span>' +
        del +
      '</div>';
  });
  return '<div class="bs-stagetbl">' +
      '<div class="bs-strow bs-sthead"><span class="bs-drag"></span><span class="bs-hname">階段名稱</span><span class="bs-cell bs-cell-m">耗時(月)</span><span class="bs-cell bs-cell-w">工作天</span><span class="bs-cell bs-cell-r">起 → 迄</span><span class="bs-delstage bs-del-off"></span></div>' +
      body +
    '</div>';
};

// 甘特區塊（HintBox 顏色說明＋里程碑甘特＋餘裕/溢出提示）
App._bsGanttSecHtml = function(comp) {
  const help = App.buildHintBox({ key: 'bs-slack-help', icon: 'ti-info-circle', title: '甘特圖顏色定義', summary: '一分鐘看懂各階段時程緊迫度', collapsed: true,
    bodyHtml: '<div class="bs-slackhelp-warn">須在開始與上市日期皆填齊時，各開發階段才會觸發以下顏色；只填單一日期，甘特圖維持預設單色。</div>' +
      '<div class="bs-slackrow"><span class="bs-slackdot bs-sd-green"></span><b>安全（綠）</b>：完工日較截止日（Deadline）提前 5 天以上。</div>' +
      '<div class="bs-slackrow"><span class="bs-slackdot bs-sd-yellow"></span><b>緊繃（黃）</b>：完工日已臨近截止日，緩衝時間僅剩 0～4 天。</div>' +
      '<div class="bs-slackrow"><span class="bs-slackdot bs-sd-red"></span><b>逾期（紅）</b>：預計完工日已超出設定之截止日。</div>' });
  return '<div class="bs-ganttsec">' +
      '<div class="bs-sectitle">階段區間預覽</div>' + help +
      App._bsGanttHtml(comp) +
      App._bsFitHintHtml(comp) +
    '</div>';
};
// 里程碑甘特：複用 s2-gantt-axis / s2-grow 結構＋s2-gbar-{綠黃紅} 號誌色。
App._bsGanttHtml = function(comp) {
  const stages = comp.stages || [];
  if (!stages.length) return '<div class="bs-gantt-empty">尚無階段，按「＋ 新增階段」開始。</div>';
  const nums = stages.flatMap(s => [Date.parse(s.start), Date.parse(s.end)]).filter(n => !isNaN(n));
  const minN = nums.length ? Math.min.apply(null, nums) : 0;
  const maxN = nums.length ? Math.max.apply(null, nums) : 1;
  const span = (maxN - minN) || 1;
  const fmtFull = (iso, forceYear) => { if (!iso) return ''; const p = String(iso).split('-'); return forceYear ? (p[0].slice(2) + '/' + (+p[1]) + '/' + (+p[2])) : ((+p[1]) + '/' + (+p[2])); };
  let rows = '';
  stages.forEach((s, i) => {
    const a = Date.parse(s.start), b = Date.parse(s.end);
    const left = ((a - minN) / span) * 100;
    const width = Math.max(((b - a) / span) * 100, 1.5);
    const forceYear = (i === 0 || i === stages.length - 1);
    rows +=
      '<div class="s2-grow bs-grow">' +
        '<span class="s2-gname bs-gname" title="' + U.esc(s.name || '') + '">' + U.esc(s.name || '') + '</span>' +
        '<span class="s2-gbar-track"><span class="s2-gbar s2-gbar-' + (s.light || 'green') + '" style="left:' + left + '%;width:' + width + '%"></span></span>' +
        '<span class="s2-gdate bs-gdate">' + fmtFull(s.start, forceYear) + ' → ' + fmtFull(s.end, forceYear) + '<span class="bs-gwd">' + (s.wd || 0) + ' 工作天</span></span>' +
      '</div>';
  });
  // 總期程 chip
  const totWd = stages.reduce((n, s) => n + (s.wd || 0), 0);
  const chip = comp.totalStart ? '<div class="bs-gantt-total">總期程 ' + fmtFull(comp.totalStart, true) + ' → ' + fmtFull(comp.totalEnd, true) + ' · ' + totWd + ' 工作天</div>' : '';
  return '<div class="bs-gantt">' + chip + '<div class="s2-gantt-axis bs-gantt-axis">' + rows + '</div></div>';
};
// 餘裕／溢出提示（§22.4 H·僅 interval/backward）
App._bsFitHintHtml = function(comp) {
  const bs = App._bs; if (!bs) return '';
  if (comp.dir === 'interval') {
    if (!comp.totalEnd || !bs.end) return '';
    if (comp.totalEnd <= bs.end) {
      const slack = D.workdaysBetween(comp.totalEnd, bs.end);
      return '<div class="bs-fit bs-fit-ok"><i class="ti ti-circle-check"></i>時程充足 · 餘裕 ' + slack + ' 個工作天</div>';
    }
    const over = D.workdaysBetween(bs.end, comp.totalEnd);
    return '<div class="bs-fit bs-fit-over"><i class="ti ti-alert-triangle"></i>時程不足，差 ' + over + ' 個工作天（下一步將引導智慧排程面板優化）</div>';
  }
  if (comp.dir === 'backward') {
    if (!comp.totalStart) return '';
    const p = String(comp.totalStart).split('-');
    return '<div class="bs-fit bs-fit-back"><i class="ti ti-arrow-narrow-left"></i>最晚 ' + (p[0].slice(2) + '/' + (+p[1]) + '/' + (+p[2])) + ' 就得開工，才趕得上上市。</div>';
  }
  return '';
};

// ECN 專屬欄位盒（§22.4 E·需求單號＋背景＋設變類型兩卡·去 S/M/L）
App._bsEcnBoxHtml = function() {
  const bs = App._bs;
  const card = (type) => {
    const on = (bs.roiType || 'benefit') === type;
    const cls = 'bs-roicard' + (on ? ' on' : '');
    const check = on ? '<span class="bs-rc-check">✓</span>' : '';
    if (type === 'benefit') {
      return '<div class="' + cls + '" onclick="App._bsSelectRoi(\'benefit\')">' + check +
        '<div class="bs-rc-h">效益型・主動成本調降</div>' +
        '<div class="bs-rc-sec"><span class="bs-rc-lbl">適用情境</span>針對<b>換料、議價</b>等主動降低 BOM 成本之變更案。</div>' +
        '<div class="bs-rc-sec"><span class="bs-rc-lbl">系統結算模式</span>將啟用 ROI 計算，結算面板顯示「<b>回本期</b>」與「<b>N 年淨效益</b>」，評估每台成本降幅。</div></div>';
    }
    return '<div class="' + cls + '" onclick="App._bsSelectRoi(\'forced\')">' + check +
      '<div class="bs-rc-h">被迫型・不可抗力</div>' +
      '<div class="bs-rc-sec"><span class="bs-rc-lbl">適用情境</span>針對料件<b>停產 (EOL)</b>、<b>法規安規變更</b>或設計品質修正之案件。</div>' +
      '<div class="bs-rc-sec"><span class="bs-rc-lbl">系統結算模式</span>不適用回本計算，結算面板轉為評估「<b>合約／變更總代價</b>」與每台成本最小化損失。</div></div>';
  };
  return '<div class="bs-ecnbox">' +
      '<div class="bs-ecnbox-hd"><i class="ti ti-replace"></i>設變（ECN）專屬欄位</div>' +
      '<div class="bs-field"><span class="bs-flabel">需求單號（選填）</span>' +
        '<input type="text" class="bs-ecn-src" value="' + U.esc(bs.sourceNo || '') + '" placeholder="觸發此案的客訴單或異常單號" onchange="App._bs.sourceNo=this.value"></div>' +
      '<div class="bs-field"><span class="bs-flabel">設變背景與原因（簡述 2～3 句即可）</span>' +
        '<textarea class="bs-ecn-reason" rows="2" placeholder="請描述變更背景，例：客戶反映壓縮機外殼異音，需增加緩衝墊片" onchange="App._bs.reason=this.value">' + U.esc(bs.reason || '') + '</textarea></div>' +
      '<div class="bs-field"><span class="bs-flabel">設變類型（點卡片選擇，決定結案怎麼算錢）</span>' +
        '<div class="bs-roicards">' + card('benefit') + card('forced') + '</div></div>' +
    '</div>';
};
App._bsSelectRoi = function(v) { if (App._bs) { App._bs.roiType = v; } App._renderBsStage1(); };

// ─── 互動 handler ───
App._bsSetName = function(v) { if (App._bs) App._bs.name = v; };
App._bsSetDate = function(which, v) { if (!App._bs) return; if (which === 'end') App._bs.end = v; else App._bs.start = v; App._bsRefresh(); };
App._bsRenameStage = function(i, v) { const s = App._bs && App._bs.stages[i]; if (s) { s.name = v; App._bsRefresh(); } };
App._bsMonths = function(i, v) {
  const s = App._bs && App._bs.stages[i]; if (!s) return;
  const n = parseFloat(v) || 0;
  if (n <= 0) { s.months = 0; if (s.driver === 'months') s.driver = null; }
  else { s.months = n; s.driver = 'months'; }
  App._bsRefresh();
};
App._bsWd = function(i, v) {
  const s = App._bs && App._bs.stages[i]; if (!s) return;
  const n = parseInt(v) || 0;
  if (n <= 0) { s.wd = 0; if (s.driver === 'wd') s.driver = null; }
  else { s.wd = n; s.driver = 'wd'; }
  App._bsRefresh();
};
App._bsAddStage = function() {
  if (!App._bs) return;
  App._bs.stages.push({ id: U.id(), name: '新階段', months: 1, wd: 0, driver: 'months' });
  App._bsRefresh();
};
App._bsDelStage = function(i) {
  if (!App._bs || App._bs.stages.length <= 1) return;
  App._bs.stages.splice(i, 1);
  App._bsRefresh();
};
// 拖曳排序
App._bsDragStart = function(e, i) { App._bsDragIdx = i; if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; const row = e.target.closest('.bs-strow'); if (row) row.classList.add('bs-dragging'); };
App._bsDragOver = function(e) { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; };
App._bsDrop = function(e, j) {
  e.preventDefault();
  const i = App._bsDragIdx;
  if (i == null || i === j || !App._bs) return;
  const arr = App._bs.stages; const [moved] = arr.splice(i, 1); arr.splice(j, 0, moved);
  App._bsDragIdx = null; App._bsRefresh();
};
App._bsDragEnd = function() { App._bsDragIdx = null; document.querySelectorAll('#page-bs1 .bs-dragging').forEach(x => x.classList.remove('bs-dragging')); };

App._bsBack = function() {
  App.confirmModal({
    icon: 'ti-alert-triangle', iconBg: '--amber-l', iconColor: '--amber-ink',
    title: '返回上一步？', msg: '本頁已填寫的資料（名稱、日期、階段、名冊）<b>將不會保留</b>，確定要返回？',
    okText: '返回上一步', cancelText: '留在本頁',
    onConfirm: function() {
      const tb = document.querySelector('.main > .topbar');
      if (tb) tb.classList.remove('topbar-hidden');
      App.showPage(App.currentPage || 'workspace', null);
      App._flowBlankChoice();
    },
  });
};
// ═══ §22.5 Stage 2 檢視任務（基準線 vs 實際）＋§22.8 落地映射 ═══
// 進 Stage 2：驗名→初始化每階段 tasks/pmCoord→page-bs1 重繪（App._bs 存全狀態·上一步無損回 Stage 1）。
App._bsNext = function() {
  const bs = App._bs;
  if (!bs || !(bs.name || '').trim()) { U.toast('⚠ 請填專案名稱', 'warning'); return; }
  (bs.stages || []).forEach(s => {
    if (!s.tasks) s.tasks = [];
    if (!s.tasks.length) s.tasks.push({ id: U.id(), name: '', who: '', dur: 5, effort: 100, so: null, eo: null });   // 每階段預設帶一筆任務列（Paul 定·避免空到只剩新增鈕）
    if (s.pmCoord === undefined) s.pmCoord = null;
  });
  App._renderBsStage2();
};

// 全域流水序：跨階段連號 → { taskId: 序號 }。
App._bsTaskSeq = function() {
  const seq = {}; let n = 0;
  (App._bs.stages || []).forEach(s => (s.tasks || []).forEach(t => { seq[t.id] = ++n; }));
  return seq;
};
// 每階段任務 FS 鏈（錨在階段起日·§22.5 C）：回 dated [{start,end,dur,startD,endD}] 對齊 tasks 順序。
//   釘住 so→以此開工；釘住 eo→以此收工（回推工期）；未釘→首筆接階段起、之後接前一筆末+1 工作日。
App._bsChainTasks = function(stageStartIso, tasks) {
  const anchor = App._bsFirstWorkOnAfter(new Date(stageStartIso));
  const out = [];
  (tasks || []).forEach((t, i) => {
    let startW;
    if (t.so) startW = App._bsFirstWorkOnAfter(new Date(t.so));
    else if (i === 0) startW = new Date(anchor);
    else startW = D.addWorkdays(new Date(out[i - 1].endD), 1);
    let endW, dur;
    if (t.eo) { endW = App._bsLastWorkOnBefore(new Date(t.eo)); if (endW < startW) endW = new Date(startW); dur = D.workdaysBetween(startW, endW); }
    else { dur = Math.max(1, parseInt(t.dur) || 1); endW = D.addWorkdays(startW, dur - 1); }
    out.push({ start: D.fmt(startW, 'iso'), end: D.fmt(endW, 'iso'), dur: dur, startD: startW, endD: endW });
  });
  return out;
};
// 擔當下拉（依部門分組 optgroup·只列該部門成員·§22.5 C 不設部門欄）。
App._bsOwnerOptions = function(cur) {
  let html = '<option value=""' + (cur ? '' : ' selected') + '>未指派</option>';
  (App._tplDepts || []).forEach(d => {
    const nm = (d.name || '').trim(); if (!nm) return;
    const members = (d.members || []).map(m => (m.name || '').trim()).filter(Boolean);
    if (!members.length) return;
    html += '<optgroup label="' + U.esc(nm) + '">' +
      members.map(m => '<option value="' + U.esc(m) + '"' + (m === cur ? ' selected' : '') + '>' + U.esc(m) + '</option>').join('') + '</optgroup>';
  });
  return html;
};
// 任務名 datalist（範本任務名建議）。
App._bsTaskNameList = function() {
  const t = (App._bs && App._bs.kind === 'ecn') ? tplEcn() : tplNpi();
  const names = new Set();
  ((t && t.cases) || []).forEach(c => (c.modules || []).forEach(m => (m.tasks || []).forEach(tk => { if (tk.name) names.add(tk.name); })));
  return [...names].map(n => '<option value="' + U.esc(n) + '">').join('');
};
// PM 協調% 下拉（六檔·空值＝請自選·§22.5 A）。
App._bsPmCoordOptions = function(cur) {
  return '<option value=""' + (cur == null ? ' selected' : '') + '>— 選 PM 協調% —</option>' +
    App._EFFORT_TIERS.map(o => '<option value="' + o.v + '"' + (o.v === cur ? ' selected' : '') + '>' + o.v + '% ' + o.short + '</option>').join('');
};

App._renderBsStage2 = function() {
  const bs = App._bs; if (!bs) return;
  const isEcn = bs.kind === 'ecn';
  const accentCls = isEcn ? 'bs-ecn' : 'bs-npi';
  const guide = App.buildHintBox({ key: 'bs-s2-guide', icon: 'ti-info-circle', title: '檢視任務（Stage 2）排程指引', summary: '點擊看基準線對比與連動邏輯', collapsed: true,
    bodyHtml: '<ol class="bs-tiplist bs-tiplist-ol">' +
      '<li><b>基準線對比</b>：每個階段頂部皆顯示「湛藍色基準線」（含時間區間與總工作天），即使未排任務也會維持長條，方便您隨時掌握可排時程空間。</li>' +
      '<li><b>擔當依部門分組</b>：擔當下拉依部門（optgroup）分組，只在各部門標題下顯示該部門成員（依上一步名冊設定）。</li>' +
      '<li><b>智慧接續連動</b>：第二筆任務起，開始日預設自動接續「前一筆結束日 + 1 天」。若手動修改單筆日期（釘住），後續未釘住的任務將隨之整串連動。</li>' +
      '<li><b>負荷警示與投入級別</b>：投入%＝這件事吃掉負責人一天的幾成，六檔（100% 獨佔／75% 大半天／50% 半天／25% 零星盯／10% 點一下／0% 掛名未出力）。同人跨案單日疊加破百＝爆單，會在總覽 PM 負荷／部門負載轉紅示警。</li>' +
      '<li><b>PM 協調（每階段一格）</b>：代表 PM 對整個階段的跨部門協調負荷（撐滿階段跨度、非某張任務）。自訂階段吃不到範本標準值，請自行選一檔；此值會另計進 PM 負荷、不與任務投入% 重複。</li>' +
    '</ol>' });
  const comp = App._bsComputeStages();
  const seq = App._bsTaskSeq();
  const cards = bs.stages.map((s, si) => App._bsStageCardHtml(s, si, comp.stages[si] || {}, seq)).join('');
  const tb = document.querySelector('.main > .topbar');
  if (tb) tb.classList.add('topbar-hidden');
  document.querySelectorAll('.page').forEach(pg => pg.classList.remove('active'));
  const page = document.getElementById('page-bs1');
  page.className = 'page active bs-s2page ' + accentCls;
  page.innerHTML =
    '<div class="bs-wrap">' +
      '<div class="bs-pagehd">' +
        '<div class="bs-crumb">總儀表板 <span class="bs-crumb-sep">/</span> ' + (isEcn ? '新增設變案' : '新增專案') + ' <span class="bs-crumb-sep">/</span> 檢視任務</div>' +
        '<span class="bs-typebadge">' + (isEcn ? 'ECN 設變' : 'NPI 開發') + '</span>' +
      '</div>' +
      '<div class="bs-title">檢視任務（Stage 2）</div>' +
      guide +
      '<div id="bs-s2cards">' + cards + '</div>' +
      '<div class="bs-foot">' +
        '<button class="tb-action ghost" onclick="App._renderBsStage1()">上一步</button>' +
        '<button class="tb-action bs-next" onclick="App._bsCommit()">建立專案</button>' +
      '</div>' +
      '<datalist id="bs-tasknames">' + App._bsTaskNameList() + '</datalist>' +
    '</div>';
  window.scrollTo({ top: 0, behavior: 'smooth' });
};
// 只重畫任務卡區（編輯任務即時更新基準線對比·onchange 已 blur·重畫不掉焦點）。
App._bsS2Refresh = function() {
  const c = document.getElementById('bs-s2cards'); if (!c || !App._bs) return;
  const comp = App._bsComputeStages();
  const seq = App._bsTaskSeq();
  c.innerHTML = App._bs.stages.map((s, si) => App._bsStageCardHtml(s, si, comp.stages[si] || {}, seq)).join('');
};

App._bsStageCardHtml = function(stage, si, sComp, seq) {
  const fmtFull = (iso) => { if (!iso) return ''; const p = String(iso).split('-'); return p[0].slice(2) + '/' + (+p[1]) + '/' + (+p[2]); };
  const dated = App._bsChainTasks(sComp.start || (App._bs.start || D.fmt(new Date(), 'iso')), stage.tasks);
  const baseWd = sComp.wd || 0;
  const k = stage.tasks ? stage.tasks.length : 0;
  // 基準線膠囊
  const mLabel = sComp.months || sComp.approxMonths || 0;
  const pill = '<span class="bs-base-pill">基準線 ' + mLabel + ' 個月（' + baseWd + ' 工作天）· ' + (k ? ('已排 ' + k + ' 任務') : '尚無任務') + '</span>';
  const pmSel = '<span class="bs-pmcoord"><span class="bs-pm-lbl">PM 協調</span><select onchange="App._bsStagePmCoord(' + si + ',this.value)">' + App._bsPmCoordOptions(stage.pmCoord) + '</select></span>';
  const range = (sComp.start && sComp.end) ? (fmtFull(sComp.start) + ' → ' + fmtFull(sComp.end)) : '';
  const head =
    '<div class="bs-s2hd">' +
      '<span class="bs-s2name">' + U.esc(stage.name || '') + '</span>' +
      (range ? '<span class="bs-s2range">' + range + '</span>' : '') +
      pmSel + pill +
    '</div>';
  // 任務即時預覽（基準線支柱＋任務條）
  const bars = App._bsTkBarsHtml(sComp, stage.tasks, dated);
  // 任務編輯列
  const rows = App._bsTaskRowsHtml(stage, si, dated, seq);
  // 超支軟通知
  const totWd = dated.reduce((n, d) => n + (d.dur || 0), 0);
  const over = totWd - baseWd;
  const overHint = (k && over > 0)
    ? '<div class="bs-s2over"><i class="ti ti-alert-triangle"></i>已排任務共 ' + totWd + ' 工作天，超過基準線 ' + baseWd + ' 天（超 ' + over + ' 天）… 後段時程將順延，不強制擋，你自己評估要不要壓。</div>'
    : '';
  return '<div class="bs-s2card">' + head + bars + rows +
    '<button type="button" class="tb-action ghost bs-addtask" onclick="App._bsAddTask(' + si + ')">＋ 新增任務' + (k ? '（接在最後一筆之後）' : '（第一筆接階段起日）') + '</button>' +
    overHint + '</div>';
};
// 基準線支柱＋任務條（號誌色·超出紅斜線網底·§22.5 B）
App._bsTkBarsHtml = function(sComp, tasks, dated) {
  const bStart = Date.parse(sComp.start), bEnd = Date.parse(sComp.end);
  if (isNaN(bStart) || isNaN(bEnd)) return '';
  const taskEnds = dated.map(d => Date.parse(d.end)).filter(n => !isNaN(n));
  const maxEnd = Math.max(bEnd, taskEnds.length ? Math.max.apply(null, taskEnds) : bEnd);
  const span = (maxEnd - bStart) || 1;
  const baseW = ((bEnd - bStart) / span) * 100;
  const baseline = '<div class="bs-baseline" style="width:' + baseW + '%">基準線 ' + (sComp.wd || 0) + ' 天</div>';
  let over = false;
  const rows = (tasks || []).map((t, i) => {
    const d = dated[i]; const a = Date.parse(d.start), b = Date.parse(d.end);
    const left = ((a - bStart) / span) * 100, width = Math.max(((b - a) / span) * 100, 1.5);
    const margin = (d.end <= sComp.end) ? D.workdaysBetween(d.end, sComp.end) : -D.workdaysBetween(sComp.end, d.end);
    const light = margin >= 5 ? 'green' : (margin >= 0 ? 'yellow' : 'red');
    if (margin < 0) over = true;
    return '<div class="bs-tkrow"><span class="bs-tkname" title="' + U.esc(t.name || '') + '">' + U.esc(t.name || ('任務 ' + (i + 1))) + '</span>' +
      '<span class="bs-tktrack"><span class="bs-tkbar bs-tkbar-' + light + (margin < 0 ? ' over' : '') + '" style="left:' + left + '%;width:' + width + '%"></span></span></div>';
  }).join('');
  const baseend = over ? '<div class="bs-baseend" style="left:' + baseW + '%"></div>' : '';
  return '<div class="bs-tkbars">' + baseline + rows + baseend + '</div>';
};
App._bsTaskRowsHtml = function(stage, si, dated, seq) {
  const tasks = stage.tasks || [];
  const head = '<div class="bs-tkrowform bs-tkform-head"><span class="bs-tc-seq">序</span><span class="bs-tc-name">任務名稱</span><span class="bs-tc-d">開始日</span><span class="bs-tc-dur">工期(天)</span><span class="bs-tc-d">結束日</span><span class="bs-tc-who">擔當</span><span class="bs-tc-eff">投入%</span><span class="bs-tc-del"></span></div>';
  const body = tasks.map((t, ti) => {
    const d = dated[ti] || {};
    const soPin = t.so ? ' bs-pinned' : '';
    const eoPin = t.eo ? ' bs-pinned' : '';
    return '<div class="bs-tkrowform">' +
      '<span class="bs-tc-seq"><span class="bs-seqpill">' + (seq[t.id] || '') + '</span></span>' +
      '<span class="bs-tc-name"><input type="text" list="bs-tasknames" value="' + U.esc(t.name || '') + '" placeholder="任務名稱" onchange="App._bsTaskField(' + si + ',' + ti + ',\'name\',this.value)"></span>' +
      '<span class="bs-tc-d"><input type="date" class="bs-tkdate' + soPin + '" value="' + U.esc(t.so || d.start || '') + '" onchange="App._bsTaskField(' + si + ',' + ti + ',\'so\',this.value)"></span>' +
      '<span class="bs-tc-dur"><input type="number" min="1" step="1" value="' + (d.dur || t.dur || 1) + '" onchange="App._bsTaskField(' + si + ',' + ti + ',\'dur\',this.value)"></span>' +
      '<span class="bs-tc-d"><input type="date" class="bs-tkdate' + eoPin + '" value="' + U.esc(t.eo || d.end || '') + '" onchange="App._bsTaskField(' + si + ',' + ti + ',\'eo\',this.value)"></span>' +
      '<span class="bs-tc-who"><select onchange="App._bsTaskField(' + si + ',' + ti + ',\'who\',this.value)">' + App._bsOwnerOptions(t.who || '') + '</select></span>' +
      '<span class="bs-tc-eff"><select onchange="App._bsTaskField(' + si + ',' + ti + ',\'effort\',this.value)">' + App._ecnEffortOptions(t.effort != null ? t.effort : 100) + '</select></span>' +
      '<span class="bs-tc-del"><button type="button" class="bs-delstage" title="刪除任務" onclick="App._bsDelTask(' + si + ',' + ti + ')"><i class="ti ti-x"></i></button></span>' +
    '</div>';
  }).join('');
  return '<div class="bs-tkform">' + head + body + '</div>';
};

// ─── Stage 2 互動 ───
App._bsAddTask = function(si) {
  const s = App._bs && App._bs.stages[si]; if (!s) return;
  s.tasks = s.tasks || [];
  s.tasks.push({ id: U.id(), name: '', who: '', dur: 5, effort: 100, so: null, eo: null });
  App._bsS2Refresh();
};
App._bsDelTask = function(si, ti) {
  const s = App._bs && App._bs.stages[si]; if (!s || !s.tasks) return;
  s.tasks.splice(ti, 1);
  App._bsS2Refresh();
};
App._bsTaskField = function(si, ti, field, val) {
  const s = App._bs && App._bs.stages[si]; if (!s || !s.tasks || !s.tasks[ti]) return;
  const t = s.tasks[ti];
  if (field === 'name') { t.name = val; return; }             // 不動日期·免重畫
  if (field === 'who') { t.who = val; return; }
  if (field === 'effort') { t.effort = parseInt(val); return; }
  if (field === 'so') { t.so = val || null; }                  // 釘開始
  else if (field === 'eo') { t.eo = val || null; }             // 釘結束（回推工期）
  else if (field === 'dur') { t.dur = Math.max(1, parseInt(val) || 1); t.eo = null; }   // 工期為主控→清釘結束
  App._bsS2Refresh();
};
App._bsStagePmCoord = function(si, val) {
  const s = App._bs && App._bs.stages[si]; if (!s) return;
  s.pmCoord = (val === '') ? null : parseInt(val);
};

// ─── §22.8 落地映射：自寫 _bsCommit（每階段 PM 協調 for NPI＋ECN·§22.6·持久化尾段鏡像 _stage2Commit）───
App._bsCommit = function() {
  if (App._roGuard()) return;
  const bs = App._bs; if (!bs) return;
  const name = (bs.name || '').trim();
  if (!name) { U.toast('⚠ 請填專案名稱', 'warning'); return; }
  const isEcn = bs.kind === 'ecn';
  const comp = App._bsComputeStages();
  const dailyHours = (DATA.settings && DATA.settings.dailyHours) || 6;
  // depts（複用 applyTemplate 規則：空名/無成員跳過）
  const depts = [];
  (App._tplDepts || []).forEach(d => {
    const nm = (d.name || '').trim(); if (!nm) return;
    const members = (d.members || []).map(m => (m.name || '').trim()).filter(Boolean).map(x => ({ id: U.id(), name: x }));
    if (!members.length) return;
    depts.push({ id: U.id(), name: nm, members: members });
  });
  const ownerDept = (who) => { const d = depts.find(dd => (dd.members || []).some(m => m.name === who)); return d ? d.id : ''; };
  const isPmName = (who) => { const d = depts.find(dd => (dd.members || []).some(m => m.name === who)); return !!(d && /PM/i.test(d.name)); };
  const pmDept = depts.find(d => /PM/i.test(d.name));
  // project
  const proj = {
    id: U.id(), name: name, color: bs.color || PROJ_COLORS[0], note: '', synced: false, createdAt: new Date().toISOString(),
    targetUnitCostBase: 0, unitSellPriceBase: 0, targetUnitCost: 0, unitSellPrice: 0,
  };
  ensurePdcaData(proj);
  const vId = U.id();
  const variant = { id: vId, name: name, schedule: { startDate: bs.start || '', endDate: bs.end || '', direction: comp.dir }, stages: bs.stages.map(s => s.name), stageCoord: {} };
  bs.stages.forEach(s => { if (s.pmCoord != null) variant.stageCoord[s.name] = s.pmCoord; });
  proj.depts = depts; proj.variants = [variant];
  // tasks
  const tasks = [];
  const mkTask = (o) => Object.assign({
    id: U.id(), project: proj.id, wbs: 0, parentWbsId: '', name: '', desc: '', category: 'deep', taskType: '任務',
    predecessor: '', durationDays: 1, owner: '', dept: '', role: '', variant: vId,
    start: '', end: '', plannedStart: '', plannedEnd: '', actualStart: '', actualEnd: '',
    progress: 0, status: 'pending', urgency: 'med', estHours: 4, method: '', canSplit: false, completedAt: null,
    createdAt: new Date().toISOString(), scheduledStart: '', scheduledEnd: '', synced: false, stage: '', subgroup: '',
    mustDeliver: false, deliverableType: '', requiredTask: true, mustIssue: false, deliverable: '', riskIssue: '',
    delivered: '', deliverableLink: '', note: '', effortRatio: 100, taskAttr: 'baseline',
  }, o);
  let seqN = 0;
  bs.stages.forEach((s, si) => {
    const dated = App._bsChainTasks((comp.stages[si] || {}).start || bs.start, s.tasks);
    (s.tasks || []).forEach((t, ti) => {
      const d = dated[ti]; const who = (t.who || '').trim(); seqN++;
      const eff = (t.effort != null) ? t.effort : 100;
      tasks.push(mkTask({
        wbs: seqN, name: (t.name || '').trim() || ('任務 ' + seqN), desc: s.name + ' / ',
        durationDays: d.dur, owner: who, dept: ownerDept(who), role: isPmName(who) ? 'PM' : '',
        plannedStart: d.start, plannedEnd: d.end, stage: s.name, effortRatio: eff,
        estHours: Math.round(d.dur * dailyHours * (eff / 100) * 10) / 10,
      }));
    });
    // 每階段 PM 協調（NPI＋ECN·§22.6）
    if (s.pmCoord != null && s.pmCoord > 0) {
      const sc = comp.stages[si] || {}; const span = Math.max(sc.wd || 0, 1);
      tasks.push(mkTask({
        wbs: 0, name: 'PM 階段協調（常駐）', desc: s.name + ' / PM 協調',
        durationDays: span, dept: pmDept ? pmDept.id : '', role: 'PM',
        plannedStart: sc.start, plannedEnd: sc.end, stage: s.name, effortRatio: s.pmCoord,
        estHours: Math.round(span * dailyHours * (s.pmCoord / 100) * 10) / 10, isPmCoord: true,
      }));
    }
  });
  // ECN 專屬欄位＋baselineHours＋ecnEvents（比照 _stage2Commit ECN 分支·但 PM 協調走每階段·size 無 S/M/L→預設 M）
  if (isEcn) {
    Object.assign(proj, {
      ecnType: true, size: 'M', changeReason: bs.reason || '', roiType: bs.roiType || 'benefit',
      sourceNo: bs.sourceNo || '', ecnNo: '', targetSavePerUnit: 0, status: 'active', loopCount: 0, scopeGrowthCount: 0, reopenCount: 0,
    });
    proj.baselineHours = Math.round(tasks.reduce((a, t) => a + ((t.effortRatio != null ? t.effortRatio : 100) / 100) * dailyHours * (t.durationDays || 0), 0) * 10) / 10;
    proj.ecnEvents = [{ type: 'open', date: D.fmt(new Date(), 'iso'), label: '開案（空白設變）', cause: '' }];
  }
  // 持久化（鏡像 _stage2Commit 尾段：同名限同分類＋未指派＋版號＋push＋save）
  const dup = DATA.projects.filter(p => p.name === proj.name && !!p.ecnType === !!proj.ecnType);
  const unassigned = tasks.filter(t => !t.owner && !t.isPmCoord).length;
  const _commit = () => {
    const tb = document.querySelector('.main > .topbar'); if (tb) tb.classList.remove('topbar-hidden');
    proj.version = dup.length ? Math.max(...dup.map(p => p.version || 1)) + 1 : 1;
    proj.importedAt = D.fmt(new Date(), 'iso');
    DATA.projects.push(proj);
    tasks.forEach(t => DATA.tasks.push(t));
    App.currentProjectId = proj.id;
    Store.projects.save(); Store.tasks.save();
    App._bs = null; App._createFlow = null;
    App.refreshAll();
    U.toast('✓ 已建立 ' + tasks.length + ' 筆任務', 'success');
    App.showPage('project', null);
  };
  const _checkDup = () => {
    if (dup.length) App.confirmModal({ icon: 'ti-copy', iconBg: '--amber-l', iconColor: '--amber-ink', title: '已有 ' + dup.length + ' 個同名專案「' + proj.name + '」', msg: '要建立新版本嗎？兩者並存，可在側邊欄辨識版號。', okText: '建立新版本', cancelText: '返回修改', onConfirm: _commit });
    else _commit();
  };
  if (unassigned > 0) App.confirmModal({ icon: 'ti-alert-triangle', iconBg: '--amber-l', iconColor: '--amber-ink', title: '還有 ' + unassigned + ' 個任務未指派負責人', msg: '確定建立？', okText: '確定建立', cancelText: '取消', onConfirm: _checkDup });
  else _checkDup();
};
