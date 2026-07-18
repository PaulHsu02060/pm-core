// dev-seed.js — DEV 假資料「注入引擎」（純邏輯·不含任何專案具體資料）。
// 資料在 dev-seed-data.js（DEV_SEED_DATA 表）；本檔只負責：讀表 → App.applyTemplate 套範本
//   → 後處理（依 stageWindows 把日期重排到今天附近／role→dept 映射／owner 指派／loadProfile 縮放 effort／
//     progressProfile+taskOverrides 決定 status/actual/netWorkDays/hold/rescue）→ 注入 DATA。
// 僅 isLocalDev 且「空專案」時由 App.init() 呼叫 App._devSeedInject()；線上 Prod（https）永不執行。
// ★DEV 純沙盒（2026-07-15·`8bd791f`·app.js DEV_SANDBOX）：本地一律記憶體版——load() 不讀（先清 DATA 殘留再讀空）、
//   save()/Store._canPersist() 皆 no-op 不落地、seed 條件改「DATA.projects 空就灌」（丟棄 pm_dev_seeded 持久旗標）。
//   ⇒ 測試改動用完即丟、**重整即回 seed（不必再手動清 localStorage）**、關網頁不留本機、跨機 git pull 拉下來畫面一致（seed 檔=dev-seed-data.js·有進版控）。
//   與 seed.local.js（本機真值·各機 gitignore·不入版控·不會 git 同步）互不相干。
App._devSeedInject = function() {
  if (typeof DATA === 'undefined' || !DATA.projects) return;   // DATA/U/Storage 為詞法全域（const·不掛 window）
  if (typeof DEV_SEED_DATA === 'undefined') return;            // 資料表未載入
  if (typeof App.applyTemplate !== 'function' || typeof tplNpi !== 'function' || typeof App._ecnTplForSize !== 'function') return;
  const D0 = DEV_SEED_DATA;
  const uid = () => (typeof U !== 'undefined' && U.id) ? U.id() : ('ds' + Math.random().toString(36).slice(2, 9));
  const _t0 = new Date(); _t0.setHours(0, 0, 0, 0);
  const iso = off => { const x = new Date(_t0); x.setDate(x.getDate() + off); return x.toISOString().slice(0, 10); };
  const offOf = s => Math.round((new Date(s + 'T00:00:00') - _t0) / 86400000);
  const nowIso = new Date().toISOString();
  const projs = [], tasks = [];
  const sheetMeta = g => ({ grid: g, partNoIdx: 0, qtyIdx: 2, priceIdx: 3, levelIdx: null, matCatIdx: 4 });

  // ── 表驅動的映射／池 ──
  const deptOwners = D0.deptOwners, roleToDept = D0.roleToDept, coreRoles = D0.coreRoles || [];
  const makeDepts = () => Object.keys(deptOwners).map(nm => ({
    id: uid(), name: nm, members: (deptOwners[nm] || []).map(pn => ({ id: uid(), name: pn })),
  }));
  const deptOf = role => roleToDept[(role || '').trim()] || Object.keys(deptOwners)[0];
  const ownerOf = (role, i) => { const ms = deptOwners[deptOf(role)] || ['家豪']; return ms[i % ms.length]; };

  // ── loadProfile → effortRatio 六檔（核心 role／支援 role），製造綠/黃/紅負荷層次 ──
  const EFFORT = { light: { core: 8, sup: 3 }, normal: { core: 17, sup: 7 }, busy: { core: 27, sup: 13 } };
  const spreadEffort = (t, profile) => {
    if (t.isPmCoord || (t.role || '').trim() === 'PM') return;      // PM 保 sizeMeta 值
    if ((t.taskType || '').indexOf('里程碑') >= 0) { t.effortRatio = 0; return; }
    const e = EFFORT[profile] || EFFORT.normal;
    t.effortRatio = coreRoles.indexOf((t.role || '').trim()) >= 0 ? e.core : e.sup;
  };

  // ── 依 stageWindows 把任務日期重排到今天附近（丟棄範本原生 2 年跨度）──
  const layoutByStage = (ts, plan) => {
    const byStage = {};
    ts.forEach(t => { (byStage[t.stage] || (byStage[t.stage] = [])).push(t); });
    Object.keys(byStage).forEach(stage => {
      const win = plan[stage], list = byStage[stage];
      if (!win) { list.forEach(t => { t.plannedStart = iso(240); t.plannedEnd = iso(250); }); return; }
      const [ws, we] = win, span = Math.max(we - ws, list.length * 2), step = span / list.length;
      list.forEach((t, i) => {
        const s = Math.round(ws + i * step);
        const isMs = (t.taskType || '').indexOf('里程碑') >= 0;
        const dur = isMs ? 0 : Math.min(Math.max(Math.round(step * 0.7), 2), Math.max(we - s, 2));
        t.plannedStart = iso(s); t.plannedEnd = iso(s + dur);
        t.start = ''; t.end = ''; t.scheduledStart = ''; t.scheduledEnd = '';
      });
    });
  };

  // ── progressProfile → wip 進度（越落後越低·拉低 actual）；taskOverrides 覆寫逾期/卡關/救援/投入 ──
  const WIP_PROG = { ontrack: 68, tight: 45, behind: 25 };
  const applyStatus = (ts, overrides, profile) => {
    overrides = overrides || {};
    const wip = WIP_PROG[profile] != null ? WIP_PROG[profile] : 45;
    ts.forEach(t => {
      const sp = overrides[t.wbs] || {};
      const eEnd = offOf(t.plannedEnd), eStart = offOf(t.plannedStart);
      const isMs = (t.taskType || '').indexOf('里程碑') >= 0;
      if (sp.status === 'overdue') {
        t.status = 'pending'; t.progress = sp.progress || 0; t.urgency = 'high';
      } else if (sp.status === 'hold') {
        t.status = 'hold'; t.progress = sp.progress || 20; t.holdReason = sp.holdReason || '等待供應商回覆'; t.actualStart = t.plannedStart;
      } else if (eEnd < 0) {                     // 過去→完工
        t.status = 'done'; t.progress = 100; t.actualStart = t.plannedStart;
        t.actualEnd = iso(Math.min(eEnd + (sp.lateDays || 0), -1)); t.completedAt = nowIso;
        if (!isMs) {                             // 完工帶淨工作天→校準卡各階段·比值有偏鬆/準/偏緊
          const span = Math.max(offOf(t.plannedEnd) - offOf(t.plannedStart), 1);
          const factor = [0.7, 0.9, 1.1, 1.35][t.wbs % 4];
          t.netWorkDays = sp.netWorkDays != null ? sp.netWorkDays : Math.max(1, Math.round(span * 5 / 7 * factor));
        }
      } else if (eStart <= 0 && eEnd >= 0) {     // 跨今天→進行中（進度依 profile）
        t.status = 'wip'; t.progress = sp.progress != null ? sp.progress : wip; t.actualStart = t.plannedStart;
        if (sp.netWorkDays != null) t.netWorkDays = sp.netWorkDays;
      } else {                                   // 未來→未開始
        t.status = 'pending'; t.progress = 0; if (sp.urgency) t.urgency = sp.urgency;
      }
      if (sp.owner) t.owner = sp.owner;
      if (sp.effort != null) t.effortRatio = sp.effort;          // 重點過載人覆寫投入%
      if (sp.rescue) t.rescueActions = sp.rescue.map(r => ({ id: uid(), action: r.action, owner: r.owner, targetDate: iso(r.targetOffset || 3), status: r.status || 'yellow' }));
    });
  };

  // ── 建 NPI 案 ──
  const buildNpi = row => {
    const res = App.applyTemplate(tplNpi(), {
      projectName: row.name, color: row.color,
      cases: [{ variantName: '主案', templateVariant: '主案', startDate: iso(-60), direction: 'forward', selectedStages: Object.keys(row.stageWindows) }],
      depts: [],
    });
    const p = res.project;
    p.variants = res.variants; p.depts = makeDepts();
    const deptId = {}; p.depts.forEach(d => { deptId[d.name] = d.id; });
    p.pdcaData = p.pdcaData || {}; p.pdcaData.targetDate = iso(row.targetOffset);
    if (p.variants[0]) { p.variants[0].schedule = p.variants[0].schedule || {}; p.variants[0].schedule.endDate = iso(row.targetOffset); p.variants[0].schedule.targetEndDate = iso(row.targetOffset); }
    // NPI BOM（撐缺口/戰情室；bomModels grid 葉節點·單機種走 variants[0].id 軸·多機種走 bomModel id 軸）
    if (row.bom) {
      const models = row.bom.models.map(mm => ({
        id: uid(), name: mm.name, bomSheets: { new: sheetMeta(mm.grid) }, bomRows: [], matched: true,
        annualVolume: row.bom.annualVolume, targetUnitCost: row.bom.targetUnitCost, unitSellPrice: row.bom.unitSellPrice,
      }));
      Object.assign(p, {
        bomBaseCurrency: 'NTD', bomQuoteCurrency: 'NTD', bomRate: 1, bomModelIdx: 0,
        annualVolume: row.bom.annualVolume, evalYears: row.bom.evalYears || 3,
        targetUnitCost: row.bom.targetUnitCost, unitSellPrice: row.bom.unitSellPrice,
        bomSheets: models[0].bomSheets, bomRows: [], bomModels: models,
      });
    }
    const cnt = {};
    res.tasks.forEach(t => {
      const dn = deptOf(t.role); t.dept = deptId[dn] || '';
      cnt[dn] = (cnt[dn] || 0) + 1; t.owner = ownerOf(t.role, cnt[dn]);
      spreadEffort(t, row.loadProfile);
    });
    layoutByStage(res.tasks, row.stageWindows);
    applyStatus(res.tasks, row.taskOverrides, row.progressProfile);
    projs.push(p); res.tasks.forEach(t => tasks.push(t));
  };

  // ── 建 ECN 案 ──
  const buildEcn = row => {
    const res = App.applyTemplate(App._ecnTplForSize(row.size), {
      projectName: row.name, color: row.color,
      cases: [{ variantName: '主案', templateVariant: '主案', startDate: iso(-40), direction: 'forward', selectedStages: null }],
      depts: [],
    });
    const p = res.project;
    p.variants = res.variants; p.depts = makeDepts();
    const deptId = {}; p.depts.forEach(d => { deptId[d.name] = d.id; });
    Object.assign(p, {
      ecnType: true, size: row.size, roiType: row.roiType, changeReason: row.changeReason, sourceNo: row.sourceNo,
      ecnNo: '', status: 'active', loopCount: row.loopCount || 0, scopeGrowthCount: row.scopeCount || 0, reopenCount: 0,
      targetSavePerUnit: row.targetSave, baselineHours: row.baselineHours, version: 1, epochs: [],
      effectiveDate: iso(row.effectiveOffset),
      ecnEvents: (row.events || []).map(e => ({ type: e.type, date: iso(e.dateOffset), label: e.label, cause: e.cause })),
    });
    // BOM 成本（讓成本四卡/達成率亮）
    const c = row.cost;
    if (c) {
      const _rows = (c.rows || []).map(r => Object.assign({ id: uid(), includeInTarget: true, approveStatus: '' }, r));
      const _sheets = { old: sheetMeta(c.oldGrid), new: sheetMeta(c.newGrid) };
      Object.assign(p, {
        bomBaseCurrency: 'NTD', bomQuoteCurrency: 'NTD', bomRate: 1, bomModelIdx: 0,
        annualVolume: c.annualVolume, evalYears: c.evalYears, oneTimeCost: c.oneTimeCost,
        targetUnitCost: c.targetUnitCost, unitSellPrice: c.unitSellPrice,
        bomSheets: _sheets, bomRows: _rows,
        bomModels: [Object.assign({ id: uid(), bomSheets: _sheets, bomRows: _rows, matched: true,
          annualVolume: c.annualVolume, targetUnitCost: c.targetUnitCost, unitSellPrice: c.unitSellPrice }, c.model)],
      });
    }
    const cnt = {};
    res.tasks.forEach(t => {
      const dn = deptOf(t.role); t.dept = deptId[dn] || '';
      cnt[dn] = (cnt[dn] || 0) + 1; t.owner = ownerOf(t.role, cnt[dn]);
      spreadEffort(t, row.loadProfile);
    });
    // PM 常駐協調任務（範本不含·isPmCoord·工期＝全案跨度）
    const pmEff = ({ S: 15, M: 20, L: 40 })[row.size] || 20;
    const v0 = res.variants[0] ? res.variants[0].id : '';
    const pm = {
      id: uid(), project: p.id, variant: v0, wbs: 99, name: 'PM 設變協調／文件彙整（常駐）',
      stage: '立案評估', subgroup: '', taskType: '任務', role: 'PM', dept: deptId['PM室'] || '', owner: 'Paul',
      status: 'wip', urgency: 'medium', measureType: 'duration', durationDays: 30, effortRatio: pmEff, progress: 40,
      predecessor: '', isPmCoord: true, taskAttr: 'baseline', plannedStart: '', plannedEnd: '', actualStart: '', actualEnd: '',
      scheduledStart: '', scheduledEnd: '', estHours: 0, completedAt: null, createdAt: nowIso, synced: false,
    };
    res.tasks.push(pm);
    layoutByStage(res.tasks, row.stageWindows);
    if (row.pmSpan) { pm.plannedStart = iso(row.pmSpan[0]); pm.plannedEnd = iso(row.pmSpan[1]); }
    applyStatus(res.tasks, row.taskOverrides, row.progressProfile);
    pm.status = 'wip'; pm.progress = 40; pm.actualStart = pm.plannedStart;   // 保 PM wip
    projs.push(p); res.tasks.forEach(t => tasks.push(t));
  };

  // ── 跑表 ──
  (D0.projects || []).forEach(row => { (row.kind === 'ecn') ? buildEcn(row) : buildNpi(row); });
  DATA.settings.deptHeadcount = Object.assign({}, DATA.settings.deptHeadcount, D0.deptHeadcount || {});

  // ══════════════ 物料模組注入 pass（2026-07-13·parts/molds/quotes/交易·綁 inject 當下 projId）══════════════
  const keyToId = {};
  (D0.projects || []).forEach((row, i) => { if (row.key && projs[i]) keyToId[row.key] = projs[i].id; });
  const projById = id => projs.filter(p => p.id === id)[0];
  const CATS = ['壓縮機', '閥件', '換熱器', '馬達', '電控', '感測器', '管件', '包材', '其他'];
  const seenPN = {};
  const mkPart = o => {
    const p = Object.assign({ partId: 'pt_' + uid(), partNo: '', name: '', category: '其他', status: 'Released',
      ver: '', spec: '', vendor: '', unitPrice: 0, leadTime: 0, internalBuffer: null, moq: 0,
      safetyStock: 0, onHand: 0, inTransit: 0, alternates: '', history: [], createdAt: iso(-30) }, o);
    if (o.st) { p.status = o.st; delete p.st; }
    if (o.hist) { p.history = o.hist.map(h => ({ field: h.field, from: h.from, to: h.to, at: iso(h.off != null ? h.off : -40), note: h.note || '', by: h.by || '採購' })); delete p.hist; }
    return p;
  };
  const addPart = o => { const pn = o.partNo; if (!pn || seenPN[pn]) return; seenPN[pn] = 1; DATA.parts.push(mkPart(o)); };
  // ① 全域料號主檔
  (D0.parts || []).forEach(addPart);
  // ② 模具
  (D0.molds || []).forEach(m => {
    const rate = m.rate || 1;
    DATA.molds.push({
      id: 'md_' + uid(), moldName: m.moldName, cavity: m.cavity || '', vendor: m.vendor || '',
      currency: m.currency || 'NTD', baseCurrency: m.baseCurrency || 'NTD', price: m.price || 0, rate: rate,
      priceTwd: m.priceTwd != null ? m.priceTwd : Math.round((m.price || 0) * rate),
      quoteFile: m.quoteFile || '', date: iso(m.dOff != null ? m.dOff : -25),
      allocations: (m.alloc || []).map(a => ({ projId: keyToId[a.projKey] || '', sharePct: a.sharePct })),
      history: [{ field: '建立', from: '', to: m.moldName || '', at: iso(m.dOff != null ? m.dOff : -25), note: 'DEV 種子', by: 'system' }],
    });
  });
  // ③ 報價（docNo 流水）
  const docCnt = {};
  const docNoFor = (prefix, off) => { const d = iso(off != null ? off : -5).replace(/-/g, ''); const k = prefix + d; docCnt[k] = (docCnt[k] || 0) + 1; return prefix + '-' + d + '-' + ('00' + docCnt[k]).slice(-3); };
  (D0.quotes || []).forEach(q => {
    const rate = q.rate || 1;
    DATA.quotes.push({
      id: 'q_' + uid(), partNo: q.partNo, vendor: q.vendor || '', currency: q.currency || 'NTD',
      baseCurrency: q.baseCurrency || 'NTD', price: q.price || 0, rate: rate,
      priceTwd: q.priceTwd != null ? q.priceTwd : Math.round((q.price || 0) * rate),
      leadTime: q.leadTime || 0, arriveDate: q.arriveOff != null ? iso(q.arriveOff) : '',
      projId: q.projKey ? (keyToId[q.projKey] || null) : null, sourceFile: q.sourceFile || '',
      date: iso(q.dOff != null ? q.dOff : -12), docNo: docNoFor('QT', q.dOff != null ? q.dOff : -12),
      docType: 'quote', by: '採購',
    });
  });
  // ④ 每案交易（stageQty model key 照 _demandModels 派生：單機種=variants[0].id·J-NPI 多機種=bomModel id）
  const demandModelIds = p => {
    if (p.bomModels && p.bomModels.length >= 2) return p.bomModels.map((m, i) => m.id || ('m' + i));
    if (p.variants && p.variants.length) return p.variants.map((v, i) => (v && v.id) || ('v' + i));
    if (p.bomModels && p.bomModels.length) return p.bomModels.map((m, i) => m.id || ('m' + i));
    return ['_main'];
  };
  (D0.projects || []).forEach((row, i) => {
    const p = projs[i], mat = row.materials; if (!p || !mat) return;
    const pid = p.id, mids = demandModelIds(p);
    if (mat.stageQtyModels || mat.stageQty) {
      DATA.stageQty[pid] = DATA.stageQty[pid] || {};
      mids.forEach((mid, mi) => {
        const src = mat.stageQtyModels ? (mat.stageQtyModels[mi] || mat.stageQtyModels[0] || {}) : mat.stageQty;
        DATA.stageQty[pid][mid] = Object.assign({}, src);
      });
    }
    if (mat.rdPlan) DATA.rdPlan[pid] = Object.assign({}, mat.rdPlan);
    (mat.invTxns || []).forEach(t => {
      const tx = { id: 'iv_' + uid(), projId: pid, stage: t.stage, partNo: t.partNo, type: t.type, qty: t.qty, date: iso(t.dOff != null ? t.dOff : -5), note: t.note || '' };
      if (t.doc) { tx.docNo = docNoFor(t.doc, t.dOff); tx.docType = (t.doc === 'PO' ? 'order' : 'demand'); tx.srcName = t.srcName || ''; tx.vendor = t.vendor || ''; tx.by = '採購'; }
      DATA.invTxns.push(tx);
    });
    (mat.machineTxns || []).forEach(t => DATA.machineTxns.push({ id: 'mg_' + uid(), projId: pid, stage: t.stage, use: t.use, qty: t.qty, note: t.note || '', date: iso(t.dOff != null ? t.dOff : -5) }));
  });
  // ⑤ 壓力型 bulk（額外料號 + 兩壓力案 BOM/庫存加碼）
  const st = D0.stress;
  if (st) {
    for (let i = 1; i <= (st.extraMaster || 0); i++) {
      addPart({ partNo: 'STR-' + ('00' + i).slice(-3), name: '壓測料件 ' + i, category: CATS[i % CATS.length], unitPrice: 20 + (i * 7) % 480,
        vendor: '壓測供應商', leadTime: 10 + i % 40, safetyStock: 10, onHand: (i % 6 === 0 ? 0 : 8 + (i * 3) % 60), inTransit: i % 4 === 0 ? 5 : 0,
        st: i % 9 === 0 ? 'Preliminary' : 'Released' });
    }
    // J-NPI：每機種補葉節點（STRN 料號 + BOM grid 列）+ 壓測庫存
    const npi = projById(keyToId[st.npiKey]);
    if (npi && npi.bomModels) {
      let sc = 0;
      npi.bomModels.forEach(m => {
        const g = m.bomSheets && m.bomSheets.new && m.bomSheets.new.grid;
        for (let k = 0; k < (st.npiLeafPerModel || 0); k++) {
          sc++; const pn = 'STRN-' + ('00' + sc).slice(-3), pr = 15 + (sc * 5) % 300;
          addPart({ partNo: pn, name: '壓測子件 ' + sc, category: CATS[sc % CATS.length], unitPrice: pr, vendor: '壓測供應商', leadTime: 15, safetyStock: 10, onHand: 20 + (sc * 4) % 40 });
          if (g) g.push([pn, '壓測子件 ' + sc, 1, pr, sc % 3 === 0 ? 'A' : 'M']);
        }
      });
      const npiStages = Object.keys((D0.projects.filter(r => r.key === st.npiKey)[0] || {}).stageWindows || {});
      for (let i = 1; i <= (st.invNpi || 0); i++) {
        DATA.invTxns.push({ id: 'iv_' + uid(), projId: npi.id, stage: npiStages[i % npiStages.length] || '手工機', partNo: 'STRN-' + ('00' + ((sc ? i % sc : 0) + 1)).slice(-3),
          type: ['到料', '額外需求', '盤點'][i % 3], qty: 2 + (i * 3) % 18, date: iso(-40 + i), note: '壓測異動 ' + i });
      }
    }
    // J-ECN：補 bomRows（多列 del + 多列 add·壓測跨列配對）+ 壓測庫存
    const ecn = projById(keyToId[st.ecnKey]);
    if (ecn) {
      ecn.bomRows = ecn.bomRows || [];
      const kinds = ['del', 'add', 'rev', 'priceOnly'];
      for (let i = 1; i <= (st.ecnRows || 0); i++) {
        const kind = kinds[i % kinds.length], pn = 'STRE-' + ('00' + i).slice(-3), base = 30 + (i * 6) % 260;
        addPart({ partNo: pn, name: '設變壓測料 ' + i, category: CATS[i % CATS.length], unitPrice: base, vendor: '壓測供應商', leadTime: 20, safetyStock: 10, onHand: 12 + (i * 2) % 30 });
        const r = { id: 'bx_' + uid(), changeKind: kind, partNoA: pn, replacePartNoB: '', partName: '設變壓測料 ' + i,
          oldPrice: base, oldQty: 1, newPrice: base, newQty: 1, switchMode: 'running', stockQty: 0, includeInTarget: true, approveStatus: '' };
        if (kind === 'add') { r.oldPrice = 0; r.oldQty = 0; }
        else if (kind === 'del') { r.newPrice = 0; r.newQty = 0; r.stockQty = (i * 3) % 40; }
        else if (kind === 'rev') { r.replacePartNoB = 'STRE-' + ('00' + (i + 100)).slice(-3); r.newPrice = base - (i % 20); addPart({ partNo: r.replacePartNoB, name: '設變壓測新料 ' + i, category: CATS[i % CATS.length], unitPrice: base - (i % 20), vendor: '壓測供應商', leadTime: 20, safetyStock: 10, onHand: 10 }); }
        else if (kind === 'priceOnly') { r.newPrice = base - (i % 15); }
        ecn.bomRows.push(r);
      }
      const ecnStages = Object.keys((D0.projects.filter(r => r.key === st.ecnKey)[0] || {}).stageWindows || {});
      for (let i = 1; i <= (st.invEcn || 0); i++) {
        DATA.invTxns.push({ id: 'iv_' + uid(), projId: ecn.id, stage: ecnStages[i % ecnStages.length] || '部品認定', partNo: 'STRE-' + ('00' + ((i % (st.ecnRows || 1)) + 1)).slice(-3),
          type: ['到料', '額外需求', '盤點'][i % 3], qty: 2 + (i * 2) % 16, date: iso(-30 + i), note: '設變壓測異動 ' + i });
      }
    }
  }

  DATA.projects.push.apply(DATA.projects, projs);
  DATA.tasks.push.apply(DATA.tasks, tasks);
  if (typeof Storage !== 'undefined' && Storage.save) Storage.save();
  try { console.info('[dev-seed] 已注入 ' + projs.length + ' 專案 / ' + tasks.length + ' 任務 / ' + DATA.parts.length + ' 料號 / ' + DATA.molds.length + ' 模具 / ' + DATA.quotes.length + ' 報價 / ' + DATA.invTxns.length + ' 庫存異動 / ' + DATA.machineTxns.length + ' 樣機（DEV·空環境·表驅動版）'); } catch (e) {}
};
