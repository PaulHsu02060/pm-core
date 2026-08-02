/*! PM-Core (c) 2026 Paul Hsu. All Rights Reserved. Proprietary — see LICENSE. */
App._backBtnHtml=function(){const prevNames={home:"首頁",workspace:"個人工作台",portfolio:"全專案總覽",materials:"物料分析",gantt:"跨專案時程",reportgen:"報表產出",transcripts:"會議逐字稿",settings:"設定",archive:"專案檔案室"};if(!this._prevPage||this._prevPage==="project"||!prevNames[this._prevPage])return"";let label=prevNames[this._prevPage];if(this._prevPage==="portfolio")label=this.currentView==="gantt"?"跨專案時程":this.currentView==="month"?"歷史月曆":label;return`<button class="tb-action ghost proj-back" onclick="App.goBack()" title="回到剛才的頁面繼續看其他專案">← 回${label}</button>`};App.buildProjectHeaderHtml=function(){const proj=this.getProj(this.currentProjectId);if(!proj)return"";return`<div class="proj-header">
        ${App._backBtnHtml()}
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
      </div>`};App._projExportBtnHtml=function(proj){const view=this.projectView,pid=proj.id;const dl='<i class="ti ti-download" style="font-size:15px; vertical-align:-2px; margin-right:5px; color:var(--sage-600);"></i>';const wrap=(label,body)=>`<span class="hdr-menu-wrap"><button class="tb-action ghost hdr-menu-toggle" data-edit-hide onclick="App.toggleExportMenu(event, '`+pid+`')">`+dl+label+' ▾</button><div class="hdr-menu hdr-menu-right hdr-menu-export" id="hdrExportMenu">'+body+'</div></span><span class="hdr-divider"></span>';const rt=o=>'<span class="hdr-menu-rt"><i class="ti '+o.icon+'"></i>'+o.title+(o.tag?'<span class="hdr-menu-rtag">'+o.tag+"</span>":"")+"</span>";const item=o=>o.enabled?'<button class="hdr-menu-item rich" onclick="'+o.onclick+' App.closeHdrMenus();">'+rt(o)+'<span class="hdr-menu-rr">結果：'+o.result+'</span><span class="hdr-menu-rc">情境：'+o.scene+"</span></button>":'<div class="hdr-menu-item rich disabled">'+rt(o)+'<span class="hdr-menu-rr">結果：'+o.result+'</span><span class="hdr-menu-rc">情境：'+o.scene+'</span><span class="hdr-menu-hint">＊'+o.disabledHint+"</span></div>";if(view==="dashboard"){return`<button class="tb-action ghost" data-edit-hide onclick="App.exportProjectWbs('`+pid+`', null, 'data');">`+dl+'匯出任務清單</button><span class="hdr-divider"></span>'}if(view==="gantt"){const sch=(g,icon,title,tag,coarse,scene)=>item({enabled:true,icon,onclick:"App.exportProjectWbs('"+pid+"','"+g+"','gantt');",title,tag,result:"甘特圖分頁（"+coarse+"）",scene});return wrap("匯出甘特圖",'<div class="hdr-menu-title">匯出甘特圖</div><div class="hdr-menu-sub">只含甘特分頁（任務清單／專案資訊改在「儀表板」頁匯出）</div>'+sch("week","ti-calendar-week","週刻度","最常用","每週一欄","例行週會報告，分析預期與實際進度差異")+sch("day","ti-calendar","日刻度","","每日一欄，最細","專案短期衝刺、細部排程檢視")+sch("month","ti-calendar-stats","月刻度","","每月一欄，最粗","跨月長專案評估，高階主管"))}if(view==="bom"){const models=proj.bomModels||[];const hasModels=models.length>0;const bs=proj.bomSheets;const hasSingle=!!(bs&&bs.new&&bs.old);return wrap("匯出成本差異報告",'<div class="hdr-menu-title">匯出成本差異報告</div><div class="hdr-menu-sub">系統不留存 Excel，按即時資料產生</div>'+item({enabled:hasModels,icon:"ti-table",onclick:"App.exportBomModels(App.getProj('"+pid+"'));",title:"跨機種成本比較報告",tag:"全型號·分析報表",result:"全系列型號的「成本價差」與「降幅成效總表」",scene:"主管開會、採購總覽全系列「省了多少錢」時",disabledHint:"先在上方上傳新舊 BOM、按「全機種自動比對」"})+item({enabled:hasSingle,icon:"ti-file-invoice",onclick:"App._bomExportWizard('"+pid+"');",title:"單一機種設變效益分析",tag:"當前型號·含試算公式",result:"當前型號的「設變回本期」與「損耗效益估算表（帶 Excel 公式）」",scene:"需要精算「特定這台冷氣」改了之後多久能回本時",disabledHint:"先在上方上傳新舊 BOM 並比對（選一個機種）"})+item({enabled:hasModels,icon:"ti-list-details",onclick:"App.exportBomModelsFullBom(App.getProj('"+pid+"'));",title:"各機種完整新 BOM 料表",tag:"全型號·純生產料表",result:"變更後的「全新完整乾淨料表」（非數據分析表）",scene:"工程師、採購需要拿去「直接建檔或回填 ERP」時",disabledHint:"先在上方上傳新舊 BOM、按「全機種自動比對」"}))}return""};App.toggleExportMenu=function(ev,projId){ev.stopPropagation();this._ensureHdrMenuClose();const m=document.getElementById("hdrExportMenu");const open=m&&m.classList.contains("open");this.closeHdrMenus();if(m&&!open)m.classList.add("open")};App.toggleMoreMenu=function(ev,projId){ev.stopPropagation();this._ensureHdrMenuClose();const m=document.getElementById("hdrMoreMenu");const open=m&&m.classList.contains("open");this.closeHdrMenus();if(m&&!open)m.classList.add("open")};App.closeHdrMenus=function(){document.querySelectorAll(".hdr-menu.open").forEach(m=>m.classList.remove("open"))};App._ensureHdrMenuClose=function(){if(this._hdrMenuCloseBound)return;this._hdrMenuCloseBound=true;document.addEventListener("click",e=>{if(!e.target.closest(".hdr-menu"))App.closeHdrMenus()})};App.renderProject=function(){if(!this.currentProjectId){if(DATA.projects.length>0){this.currentProjectId=DATA.projects[0].id}else{document.getElementById("page-project").innerHTML='<div class="empty-task-list"><div class="empty-task-list-icon">📁</div>請先建立專案</div>';return}}const proj=this.getProj(this.currentProjectId);if(!proj){document.getElementById("page-project").innerHTML='<div class="empty-task-list">專案不存在</div>';return}document.getElementById("page-project").classList.toggle("proj-npi",!proj.ecnType);if(proj.ecnType)return App.renderEcnDashboard(proj);App._s2EcnMode=null;if(this.projectView==="gantt"||this.projectView==="month"||this.projectView==="bom"){return App._renderProjectSubView(this.projectView)}const _body=this.projectView==="list"?this.buildProjectTaskListHtml(proj):this.renderProjectDashboard(proj);const html=`
    ${this.buildProjectHeaderHtml()}
    <div class="view-tabs-bar">${this.buildProjectViewTabsHtml()}</div>

    ${_body}
  `;document.getElementById("page-project").innerHTML=html;if(this.projectView!=="list"){App._maybePromptUnscheduled(proj);App._maybePromptPmCoord(proj)}};App._maybePromptUnscheduled=function(proj){if(!proj||proj.ecnType)return;this._unschedPrompted=this._unschedPrompted||{};if(this._unschedPrompted[proj.id])return;const ts=DATA.tasks.filter(t=>t.project===proj.id&&!t._deleted&&!t.isPmCoord);const bad=ts.filter(t=>!isTaskDone(t)&&!getEffectiveSchedule(t).start);if(!bad.length)return;this._unschedPrompted[proj.id]=true;App.confirmModal({title:"有 "+bad.length+" 項任務排不進時程",icon:"ti-alert-triangle",iconBg:"--amber-l",iconColor:"--amber-ink",msg:'<div style="text-align:left;font-size:12.5px;line-height:1.6;color:var(--ink2);">本案有 <b>'+bad.length+"</b> 項任務算不出計畫日期（多為前置指向已刪除的任務、或循環依賴）。<br>建議到<b>設定 → 範本</b>把該範本的前置修好後<b>重新開案</b>，或在本案甘特圖／任務大表逐筆調整前置。</div>",okText:"我知道了",cancelText:null})};App.renderProjectDashboard=function(proj){return`    ${this.buildProjKpiHtml(proj)}

    <div class="proj-dash-grid">
      ${this.buildProjStagesHtml(proj)}
      <div class="proj-load-col">${this.buildProjLoadCol(proj)}</div>
    </div>
    ${this.buildProjSafetyHtml(proj)}
`};App.buildProjectTaskListHtml=function(proj){const allTasks=this.getTasksOf(proj.id);const today=D.today();const ordered=this.orderedProjectTasks(proj.id);const taskFilter=this.getTaskFilter(proj.id);const q=(this._taskSearch&&this._taskSearch[proj.id]||"").trim();const npiTabs=this._npiVariantTabs(proj);const activeVid=npiTabs?this._npiActiveVariant(proj):null;const hasFilter=["stages","owners","urg","status"].some(k=>taskFilter[k]&&taskFilter[k].size>0)||!!q;let filtered=applyTaskFilter(ordered,taskFilter);if(npiTabs){const firstId=npiTabs[0].id;filtered=filtered.filter(t=>{const tv=t.variant||"";return activeVid===firstId?tv===firstId||tv==="":tv===activeVid})}if(q){const ql=q.toLowerCase();filtered=filtered.filter(t=>(t.name||"").toLowerCase().includes(ql)||(t.owner||"").toLowerCase().includes(ql))}const activeCount=filtered.filter(t=>t.status!=="done").length;const doneCount=filtered.length-activeCount;const deletedTasks=allTasks.filter(t=>t._deleted).sort((a,b)=>(b._deletedAt||"").localeCompare(a._deletedAt||""));const PREVIEW_ACTIVE_LIMIT=15;this._projectExpanded=this._projectExpanded||{};const isExpanded=!!this._projectExpanded[proj.id];let activeSeen=0,cutIdx=filtered.length-1;for(let p=0;p<filtered.length;p++){if(filtered[p].status!=="done"){activeSeen++;if(activeSeen===PREVIEW_ACTIVE_LIMIT){cutIdx=p;break}}}const overflow=activeCount>PREVIEW_ACTIVE_LIMIT;const showAll=hasFilter||isExpanded||!overflow;const visible=showAll?filtered:filtered.slice(0,cutIdx+1);this._doneVisible=this._doneVisible||{};const doneVisible=!!this._doneVisible[proj.id];this._toScheduleVisible=this._toScheduleVisible||{};const toScheduleVisible=this._toScheduleVisible[proj.id]!==false;const firstUndated=visible.findIndex(t=>getEffectiveSchedule(t).start==="");const tsCollapsed=toScheduleVisible?"":"collapsed";const bulk=!!(this._bulkMode||{})[proj.id];const COLS=bulk?11:10;let activeListInner;if(visible.length===0){activeListInner=hasFilter?`<tr class="empty-task-list bar-row"><td colspan="${COLS}"><div class="empty-task-list-icon">🔍</div>無符合篩選條件的任務</td></tr>`:`<tr class="empty-task-list bar-row"><td colspan="${COLS}"><div class="empty-task-list-icon">📝</div>尚無待辦任務</td></tr>`}else if(firstUndated<0){activeListInner=visible.map(t=>this.buildTaskRowHtml(t)).join("")}else{const datedRows=visible.slice(0,firstUndated).map(t=>this.buildTaskRowHtml(t)).join("");const undatedRows=visible.slice(firstUndated).map(t=>this.buildTaskRowHtml(t,"undated")).join("");const undatedCount=visible.length-firstUndated;activeListInner=datedRows+`<tr class="toschedule-bar bar-row ${tsCollapsed}" onclick="App.toggleToScheduleVisible('${proj.id}')"><td colspan="${COLS}"><div class="bar-inner">
            <span class="done-head-chevron">▼</span>
            <span class="done-head-title">待排</span>
            <span class="done-head-count">${undatedCount}</span>
            <span class="done-toggle-note">${toScheduleVisible?"未填開始日（補開始日或前置即排入）":"已收合"}</span>
          </div></td></tr>`+undatedRows}return`
    <div class="proj-grid">
      <div>
        <!-- Active tasks -->
        <div class="task-list-card">
          <div class="tlc-head">
            <span class="tlc-title">待辦任務</span>
            <span class="tlc-count">${activeCount}</span>
            <button class="tb-action" onclick="App.toggleBulkEdit('${proj.id}')" style="margin-left:auto;">${bulk?"完成批量編輯":"☑ 批量編輯"}</button>
            <button class="tb-action" onclick="App.openNewTaskDialog('${proj.id}')">＋ 新增任務</button>
          </div>
          ${this._npiVariantTabsHtml(proj)}
          ${this.buildTaskFilterBar(proj.id)}
          ${bulk?this._bulkBarHtml(proj):""}
          <!-- 第二刀-A 已接線：applyTaskFilter(ordered, getTaskFilter) 四 Set 過濾 → filtered，下游 counts／預覽／visible 全吃 filtered。 -->
          <!-- subgrid 步2：單一 .task-grid 父，header/done-bar/各列直屬，欄軌共用自動算；hide-done/ts-collapsed 摺疊 class 烤在父上。 -->
          <table id="activeTaskList" class="data-table task-table${doneVisible?"":" hide-done"}${toScheduleVisible?"":" ts-collapsed"}">
            <thead>
              <tr class="task-row-header">
                ${bulk?`<th class="col-chk"><input type="checkbox" onclick="event.stopPropagation()" onchange="App._bulkSelectAll('${proj.id}', this.checked)" data-tip="全選|勾選目前顯示的全部未完成任務"></th>`:""}
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
            ${doneCount>0?`
            <tr class="done-toggle-bar bar-row ${doneVisible?"":"collapsed"}" onclick="App.toggleDoneVisible('${proj.id}')"><td colspan="${COLS}"><div class="bar-inner">
              <span class="done-head-chevron">▼</span>
              <span class="done-head-title">已完成</span>
              <span class="done-head-count">${doneCount}</span>
              <span class="done-toggle-note">${doneVisible?"原位顯示（灰字刪除線）":"已收合"}</span>
            </div></td></tr>`:""}
            ${activeListInner}
            </tbody>
          </table>
          ${!showAll?`
          <div style="padding:10px 16px; border-top:1px solid var(--rule); text-align:center; background:var(--surface2);">
            <button class="tb-action ghost" onclick="App.toggleProjectExpanded('${proj.id}')" style="font-size:11.5px; padding:5px 14px;">
              展開全部（還有 ${activeCount-PREVIEW_ACTIVE_LIMIT} 筆）▼
            </button>
          </div>`:isExpanded&&overflow?`
          <div style="padding:10px 16px; border-top:1px solid var(--rule); text-align:center; background:var(--surface2);">
            <button class="tb-action ghost" onclick="App.toggleProjectExpanded('${proj.id}')" style="font-size:11.5px; padding:5px 14px;">
              收起（只顯示前 ${PREVIEW_ACTIVE_LIMIT} 個未完成）▲
            </button>
          </div>`:""}
          <div class="list-foot">
            <input id="quickAddTask" placeholder="＋ 快速新增任務（按 Enter 完成）" data-edit
                   onkeydown="if(event.key==='Enter') App.quickAddTask('${proj.id}', this)">
            <button data-edit onclick="App.quickAddTask('${proj.id}', document.getElementById('quickAddTask'))">新增</button>
          </div>
        </div>


        ${deletedTasks.length>0?`
        <div class="done-section deleted-section collapsed" id="deletedSection">
          <div class="done-head" onclick="document.getElementById('deletedSection').classList.toggle('collapsed')">
            <span class="done-head-title">🗑 已刪除</span>
            <span class="done-head-count" style="background:var(--terracotta-l); color:var(--terracotta);">${deletedTasks.length}</span>
            <span class="done-head-chevron">▼</span>
          </div>
          <div class="done-list">
            ${deletedTasks.map(t=>`<div class="deleted-row" style="display:flex; align-items:center; gap:10px; padding:9px 14px; border-bottom:1px solid var(--rule);">
              <div style="flex:1; min-width:0;">
                <div style="font-size:12.5px; text-decoration:line-through; color:var(--ink3);">${U.esc(t.name)}</div>
                <div style="font-size:10.5px; color:var(--ink4); margin-top:2px;">刪除於 ${t._deletedAt?D.fmt(t._deletedAt,"ymd"):"—"}</div>
              </div>
              <button class="tb-action ghost" onclick="App.restoreTask('${t.id}')" style="font-size:10.5px; padding:3px 10px; color:var(--sage-700);">↺ 還原</button>
              <button class="tb-action ghost" onclick="App.permanentDeleteTask('${t.id}')" style="font-size:10.5px; padding:3px 10px; color:var(--terracotta);">永久刪除</button>
            </div>`).join("")}
          </div>
          <div class="done-clear-tip">
            💡 已刪除任務保留 14 天，過期自動清除
          </div>
        </div>`:""}
      </div>
    </div>
`};App.toggleProjectExpanded=function(projId){this._projectExpanded=this._projectExpanded||{};this._projectExpanded[projId]=!this._projectExpanded[projId];this.renderProject()};App.toggleDoneVisible=function(projId){this._doneVisible=this._doneVisible||{};this._doneVisible[projId]=!this._doneVisible[projId];this.renderProject()};App.toggleToScheduleVisible=function(projId){this._toScheduleVisible=this._toScheduleVisible||{};const cur=this._toScheduleVisible[projId]!==false;this._toScheduleVisible[projId]=!cur;this.renderProject()};App.buildTaskRowHtml=function(t,cls){const sch=getEffectiveSchedule(t);const cat=t.taskType==="milestone"?"milestone":t.category||"deep";const isPreview=!DATA.settings.previewWeeks?false:sch.end&&D.daysBetween(D.today(),new Date(sch.end))>7&&D.daysBetween(D.today(),new Date(sch.end))<=DATA.settings.previewWeeks*7;let dlText="—";let dlClass="";if(sch.end){const days=D.daysBetween(D.today(),new Date(sch.end));if(days<0){dlText=`逾${overdueWorkdays(sch.end,D.today())}`;dlClass="overdue"}else if(days===0){dlText="今日";dlClass="near"}else if(days===1){dlText="明日";dlClass="near"}else if(days<=3){dlText=`${days}天`;dlClass="near"}else{dlText=D.fmt(new Date(sch.end),"md")}}const rangeText=sch.start&&sch.end?D.fmtRange(sch.start,sch.end):"—";const _negDur=t.taskType!=="milestone"&&(sch.start&&sch.end&&new Date(sch.end)<new Date(sch.start)||parseFloat(t.durationDays)<=0);const SRC_LABELS={planned:"預計（未排程）",scheduled:"排程算出",override:"手釘錨點",actual:"實際",manual:"手填"};const srcLabel=SRC_LABELS[sch.startSource]||"";const pct=taskDisplayProgress(t);const barColor=pct>=100?"var(--sage-500)":"var(--ink4)";const isDelayed=dlClass==="overdue"&&t.status!=="done"&&t.status!=="hold";const statusCls=isDelayed?"late":t.status==="done"?"done":t.status==="wip"?"wip":"";const statusTxt=isDelayed?"逾期":STATUS_LABELS_ZH[t.status]||t.status||"";let slackTxt,slackTip="";if(t.status==="done"||!sch.end){slackTxt="—"}else{const today=D.today();today.setHours(0,0,0,0);if(new Date(sch.end)<today){const _over=overdueWorkdays(sch.end,today);slackTxt="超"+_over+"天";slackTip="已超出 "+_over+" 個工作天（不含假日）"}else{const _slack=Math.max(0,D.workdaysBetween(today,sch.end)-1);slackTxt="餘"+_slack+"天";slackTip="還有 "+_slack+" 個工作天餘裕（不含假日）"}}const _bk=(this._bulkMode||{})[t.project];const _bkSel=_bk&&this._bulkSel&&this._bulkSel[t.project];const chkTd=_bk?t.status==="done"?'<td class="col-chk"></td>':`<td class="col-chk" onclick="event.stopPropagation()"><input type="checkbox" class="bulk-chk" ${_bkSel&&_bkSel.has(t.id)?"checked":""} onchange="App._bulkToggle('${t.project}','${t.id}', this.checked)"></td>`:"";return`<tr class="task-row ${t.status==="done"?"done":""} ${_negDur?"neg-dur":""} ${cls||""}" data-taskid="${t.id}" onclick="App.openTaskModal('${t.id}')">
    ${chkTd}
    <td class="col-num">${_negDur?'<span class="neg-flag" data-tip="負工期|工期為負數，請確認是否調整">⚠</span>':""}<span style="font-family:var(--mono); font-size:11px; color:var(--ink4);">${App._seqOf(t.id)}</span></td>
    <td class="col-mid"><span style="font-size:12px; color:var(--ink2);">${U.esc(t.stage?stageLabelOf(App.getProj(t.project),t.stage):"—")}</span></td>
    <td class="col-flex" title="${U.esc(t.name)}">
      <div class="task-info">
        <div class="task-name" style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${U.esc(t.name)}
          ${isPreview?'<span class="preview-tag">📅 兩週預告</span>':""}
          ${(()=>{const _u=safeExternalUrl(t.deliverableLink);return _u?`<a class="task-link" href="${U.esc(_u)}" target="_blank" rel="noopener noreferrer" onclick="event.stopPropagation()" title="開啟交付物連結（另開分頁）">🔗</a>`:""})()}
        </div>
      </div>
    </td>
    <td class="col-mid">
      <div style="display:flex; justify-content:flex-start; align-items:center; gap:6px;">
        <div class="stage-bar" style="border:1px solid var(--rule2);"><div class="stage-bar-fill" style="width:${pct}%; background:${barColor};"></div></div>
        <span style="font-family:var(--mono); font-size:10.5px; color:var(--ink3); min-width:30px; text-align:right;">${pct}%</span>
      </div>
    </td>
    <td class="col-mid"><span style="font-size:12px; color:var(--ink2);">${U.esc(t.owner||"—")}</span></td>
    <td class="col-mid task-pred" data-preds="${parsePredecessors(t.predecessor).map(p=>p.dep).join(",")}" onmouseenter="App._s2PredHlOn(this)" onmouseleave="App._s2PredHlOff()" title="${U.esc(predTitleOf(t.predecessor))}">${U.esc(prettyPredecessor(t.predecessor))}</td>
    <td class="col-num"><span class="rp-status ${statusCls}">${statusTxt}</span></td>
    <td class="col-mid">
      <div style="display:flex; flex-direction:column; align-items:flex-start; gap:2px;">
        <span class="task-range${_negDur?" neg":""}"${_negDur?' data-tip="負工期|工期為負數，請確認是否調整"':""}>${rangeText}</span>
        ${srcLabel?`<span class="task-tag tag-other">${srcLabel}</span>`:""}
      </div>
    </td>
    <td class="col-num"${slackTip?` title="${U.esc(slackTip)}"`:""}><span style="font-style:italic; color:var(--ink4); font-size:12px;">${slackTxt}</span></td>
    <td class="col-num"><span class="task-deadline ${dlClass}" style="font-size:12px;"${dlClass==="overdue"?` title="已逾期 ${overdueWorkdays(sch.end,D.today())} 個工作天（不含假日）"`:""}>${dlText}</span></td>
  </tr>
  <tr class="dt-insert-row"><td colspan="10" class="dt-insert-cell"><div class="dt-insert"><button class="dt-insert-btn" title="在此列後插入" onclick="event.stopPropagation(); App._insertAfterId='${t.id}'; App.openNewTaskDialog('${t.project}');"><i class="ti ti-plus"></i></button></div></td></tr>`};App.generateGlobalSchedule=function(){const activeTasks=DATA.tasks.filter(t=>t.status!=="done"&&t.status!=="hold");if(activeTasks.length===0){U.toast("⚠ 沒有任務可排程","warning");return}const result=generateSchedule();this.refreshAll();if(result.scheduledCount===0){const hoursCandidates=DATA.tasks.filter(t=>!t._deleted&&t.measureType==="hours"&&t.status!=="done"&&t.status!=="hold");if(!hoursCandidates.length){U.toast("⚠ 本週時程表只放「時段制（小時計）」任務，目前一支都沒有——工期制任務不會被排進時段格，請到任務裡把要排時段的那幾筆改成時段制。","warning");return}U.toast("⚠ 本週沒有需要排程的任務（時段制任務的日期都在本週外）","warning",{soft:true});return}U.toast(`⚡ 本週智慧排程完成：${result.scheduledCount} 個時段`);if(this.currentPage!=="workspace"){this.showPage("workspace",document.querySelector("[data-page=workspace]"))}};App.quickAddTask=function(projId,input){if(App._roGuard())return;const name=input.value.trim();if(!name){this.openNewTaskDialog(projId);return}const task={id:U.id(),project:projId,name,desc:"",owner:DATA.settings.userName||"",urgency:"medium",category:"deep",estHours:1,canSplit:false,predecessor:"",wbs:"",durationDays:1,scheduledStart:"",scheduledEnd:"",parentWbsId:"",start:"",end:"",status:"pending",method:"",createdAt:new Date().toISOString()};DATA.tasks.push(task);Store.tasks.save();input.value="";this.renderProject();this.renderSidebar();U.toast(`✓ 已新增「${name}」`)};App.orderedProjectTasks=function(projId){return orderTasksByDispStart((DATA.tasks||[]).filter(t=>t.project===projId&&!t._deleted&&!t.isPmCoord))};App._seqOf=function(taskId){const t=(DATA.tasks||[]).find(x=>x.id===taskId);if(!t)return"?";const i=this.orderedProjectTasks(t.project).findIndex(x=>x.id===taskId);return i<0?"?":i+1};
