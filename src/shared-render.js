/*! PM-Core (c) 2026 Paul Hsu. All Rights Reserved. Proprietary — see LICENSE. */
App.renderGantt=function(targetId="page-gantt",singleProject=false){this.ganttScope={targetId,singleProject};if(this.ganttFilterOpen===void 0)this.ganttFilterOpen=false;if(!this.ganttStart)this.ganttStart=D.monday();if(!this.ganttProjectFilter)this.ganttProjectFilter=new Set(DATA.projects.map(p=>p.id));const start=this.ganttStart;const days=[];for(let i=0;i<14;i++)days.push(D.addDays(start,i));const endDay=days[13];const today=D.today();const wd=["日","一","二","三","四","五","六"];let headerHtml='<div class="gantt-corner">任務</div>';for(const d of days){const isHol=!D.isWorkday(d);const isToday=D.isSameDay(d,today);const holName=(()=>{if(!isHol)return"";const hols=DATA.calendars?.base?.holidays||{};const selfKey=D.fmt(d,"iso");if(hols[selfKey])return hols[selfKey].slice(0,2);for(let back=1;back<=4;back++){const prev=new Date(d);prev.setDate(prev.getDate()-back);if(D.isWorkday(prev))break;const prevKey=D.fmt(prev,"iso");if(hols[prevKey])return hols[prevKey].slice(0,2)}return""})();headerHtml+=`<div class="gantt-day-header ${isHol?"holiday":""} ${isToday?"today":""}">
      <span class="gd-day">${d.getDate()}</span>${wd[d.getDay()]}${holName?`<span class="gd-hol">${holName}</span>`:""}
    </div>`}const projFilter=this.ganttProjectFilter;const tasks=DATA.tasks.filter(t=>{if(t._deleted)return false;if(!projFilter.has(t.project))return false;if(this.ganttStageFilter&&!this.ganttStageFilter.has(t.stage))return false;if(this.ganttOwnerFilter){const owners=(t.owner||"").split(/[、\/＋+]/).map(s=>s.trim()).filter(Boolean);if(!owners.some(o=>this.ganttOwnerFilter.has(o)))return false}const sch=getEffectiveSchedule(t);if(!sch.start&&!sch.end)return false;const ts=sch.start?new Date(sch.start):new Date(sch.end);const te=sch.end?new Date(sch.end):new Date(sch.start);return D.daysBetween(start,te)>=0&&D.daysBetween(ts,endDay)>=0});if(tasks.length===0){document.getElementById(targetId).innerHTML=`
      <div class="gantt-card">
        ${this.buildGanttHeaderHtml(days)}
        ${this.buildGanttFilterHtml(singleProject)}
        <div class="empty-task-list" style="grid-column: 1 / -1;">
          <div class="empty-task-list-icon">📊</div>
          ${singleProject?"此專案目前沒有任務":'目前篩選沒有任務<br><span style="font-size:11px;">請勾選至少一個專案</span>'}
        </div>
      </div>`;return}const sortedTasks=tasks.sort((a,b)=>{const aSch=getEffectiveSchedule(a);const bSch=getEffectiveSchedule(b);const aStart=new Date(aSch.start||aSch.end);const bStart=new Date(bSch.start||bSch.end);return aStart-bStart});const schedById=new Map;new Set(sortedTasks.map(t=>t.project)).forEach(pid=>{const projTasks=DATA.tasks.filter(t=>t.project===pid&&!t._deleted);const{results}=computeSchedule(projTasks);results.forEach(r=>schedById.set(r.taskId,r))});const rowsHtml=sortedTasks.map(t=>this.buildGanttRowHtml(t,start,days,schedById)).join("");document.getElementById(targetId).innerHTML=`
    <div class="gantt-card">
      ${this.buildGanttHeaderHtml(days)}
      ${this.buildGanttFilterHtml(singleProject)}
      <div class="gantt">
        ${headerHtml}
        ${rowsHtml}
        <svg class="gantt-links" aria-hidden="true"></svg>
      </div>
      ${!singleProject?`<div class="legend-row" style="border-top:1px solid var(--rule); margin-top:18px; padding-top:14px;">
        <span style="margin-left:auto; font-size:10.5px;">◆ 里程碑 · 進度條顯示完成度</span>
      </div>`:""}
    </div>
  `;if(singleProject)this._drawGanttLinks(targetId)};App.buildGanttHeaderHtml=function(days){const periodStr=`${D.fmt(days[0],"ymd")} – ${D.fmt(days[13],"md")}`;return`<div class="gantt-header-row">
    <div class="gantt-period">${periodStr}</div>
    <div style="flex:1"></div>
    <div class="gantt-nav">
      <button onclick="App.ganttShift(-7)">« 上週</button>
      <button onclick="App.ganttToday()">今天</button>
      <button onclick="App.ganttShift(7)">下週 »</button>
    </div>
  </div>`};App.ganttShift=function(days){this.ganttStart=D.addDays(this.ganttStart||D.monday(),days);this.renderGantt(this.ganttScope.targetId,this.ganttScope.singleProject)};App.ganttToday=function(){this.ganttStart=D.monday();this.renderGantt(this.ganttScope.targetId,this.ganttScope.singleProject)};App.buildGanttFilterHtml=function(singleProject){const tasks=DATA.tasks.filter(t=>!t._deleted);const stages=[...new Set(tasks.map(t=>t.stage).filter(Boolean))];const owners=[...new Set(tasks.flatMap(t=>(t.owner||"").split(/[、\/＋+]/).map(s=>s.trim()).filter(Boolean)))].sort();const sf=this.ganttStageFilter;const of_=this.ganttOwnerFilter;const pf=this.ganttProjectFilter||new Set;const projOpen=this.ganttFilterOpen;const projMenu=projOpen?`<div class="gantt-filter-menu">
    ${DATA.projects.map(p=>`
      <label class="gantt-filter-item">
        <input type="checkbox" ${pf.has(p.id)?"checked":""} onchange="App.toggleGanttProject('${p.id}')">
        ${U.esc(p.name)}
      </label>
    `).join("")}
  </div>`:"";const projFilter=singleProject?"":`<div class="gantt-filter">
    <button class="gantt-filter-field ${projOpen?"open":""}" onclick="App.toggleGanttFilterOpen()">
      <span class="gantt-filter-label">by 專案</span>
      <span class="gantt-filter-summary">已選 ${pf.size} 個</span>
      <span class="gantt-filter-chevron">▼</span>
    </button>
    ${projMenu}
  </div>`;const stageOpen=this.ganttStageOpen;const stageMenu=stageOpen?`<div class="gantt-filter-menu">
    ${stages.map(s=>`
      <label class="gantt-filter-item">
        <input type="checkbox" ${!sf||sf.has(s)?"checked":""} onchange="App.toggleGanttStage('${U.esc(s)}')">
        ${U.esc(s)}
      </label>
    `).join("")}
  </div>`:"";const stageFilter=`<div class="gantt-filter">
    <button class="gantt-filter-field ${stageOpen?"open":""}" onclick="App.toggleGanttStageOpen()">
      <span class="gantt-filter-label">階段</span>
      <span class="gantt-filter-summary">${sf?`已選 ${sf.size} 個`:"全部"}</span>
      <span class="gantt-filter-chevron">▼</span>
    </button>
    ${stageMenu}
  </div>`;const ownerOpen=this.ganttOwnerOpen;const ownerMenu=ownerOpen?`<div class="gantt-filter-menu">
    ${owners.map(o=>`
      <label class="gantt-filter-item">
        <input type="checkbox" ${!of_||of_.has(o)?"checked":""} onchange="App.toggleGanttOwner('${U.esc(o)}')">
        ${U.esc(o)}
      </label>
    `).join("")}
  </div>`:"";const ownerFilter=`<div class="gantt-filter">
    <button class="gantt-filter-field ${ownerOpen?"open":""}" onclick="App.toggleGanttOwnerOpen()">
      <span class="gantt-filter-label">負責人</span>
      <span class="gantt-filter-summary">${of_?`已選 ${of_.size} 人`:"全部"}</span>
      <span class="gantt-filter-chevron">▼</span>
    </button>
    ${ownerMenu}
  </div>`;return`<div class="gantt-filter-bar">${projFilter}${stageFilter}${ownerFilter}</div>`};App.toggleGanttFilterOpen=function(){this.ganttFilterOpen=!this.ganttFilterOpen;this.renderGantt(this.ganttScope.targetId,this.ganttScope.singleProject)};App.toggleGanttProject=function(id){if(!this.ganttProjectFilter)this.ganttProjectFilter=new Set(DATA.projects.map(p=>p.id));if(this.ganttProjectFilter.has(id))this.ganttProjectFilter.delete(id);else this.ganttProjectFilter.add(id);this.renderGantt(this.ganttScope.targetId,this.ganttScope.singleProject)};App.toggleGanttStageOpen=function(){this.ganttStageOpen=!this.ganttStageOpen;this.renderGantt(this.ganttScope.targetId,this.ganttScope.singleProject)};App.toggleGanttOwnerOpen=function(){this.ganttOwnerOpen=!this.ganttOwnerOpen;this.renderGantt(this.ganttScope.targetId,this.ganttScope.singleProject)};App.toggleGanttStage=function(s){const all=[...new Set(DATA.tasks.filter(t=>!t._deleted).map(t=>t.stage).filter(Boolean))];if(!this.ganttStageFilter)this.ganttStageFilter=new Set(all);if(this.ganttStageFilter.has(s))this.ganttStageFilter.delete(s);else this.ganttStageFilter.add(s);if(this.ganttStageFilter.size===0||this.ganttStageFilter.size===all.length)this.ganttStageFilter=null;this.renderGantt(this.ganttScope.targetId,this.ganttScope.singleProject)};App.toggleGanttOwner=function(o){const all=[...new Set(DATA.tasks.filter(t=>!t._deleted).flatMap(t=>(t.owner||"").split(/[、\/＋+]/).map(s=>s.trim()).filter(Boolean)))];if(!this.ganttOwnerFilter)this.ganttOwnerFilter=new Set(all);if(this.ganttOwnerFilter.has(o))this.ganttOwnerFilter.delete(o);else this.ganttOwnerFilter.add(o);if(this.ganttOwnerFilter.size===0||this.ganttOwnerFilter.size===all.length)this.ganttOwnerFilter=null;this.renderGantt(this.ganttScope.targetId,this.ganttScope.singleProject)};const GANTT_STATUS_LABELS={manual:"手動",override:"鎖",scheduled:"排程"};const GANTT_SOURCE_DESC={manual:"手動錨點",override:"本地鎖定（override）",scheduled:"機器排程連動"};App.buildGanttRowHtml=function(task,start,days,schedById){const proj=this.getProj(task.project);const sch=getEffectiveSchedule(task);const isMilestone=task.taskType==="milestone";const col=d=>D.daysBetween(start,new Date(d));const clampIdx=n=>Math.max(0,Math.min(13,n));const psIdx=isMilestone?col(sch.start||sch.end):col(sch.plannedStart||sch.start||sch.end);const peIdx=isMilestone?psIdx:col(sch.plannedEnd||sch.end||sch.start);let aSIdx=psIdx,aEIdx=peIdx;let fillClass="",showFill=false,overdueDays=0;const todayD=D.today();if(!isMilestone){if(task.status==="done"||task.actualEnd){aSIdx=col(task.actualStart||sch.plannedStart||sch.start);aEIdx=col(task.actualEnd||sch.plannedEnd||sch.end);fillClass="fill-done";showFill=true}else if(task.status==="hold"){fillClass="fill-hold";showFill=true}else if(isTaskDelayed(task,todayD)){aSIdx=psIdx;aEIdx=col(todayD);fillClass="fill-over";showFill=true;overdueDays=D.workdaysBetween(sch.end,todayD)-1}else if(task.actualStart){aSIdx=col(task.actualStart);aEIdx=col(todayD);fillClass="fill-wip";showFill=true}}const startCol=Math.max(0,Math.min(psIdx,aSIdx));const endCol=Math.min(13,Math.max(peIdx,aEIdx));const span=endCol-startCol+1;if(startCol>13||endCol<0)return"";const leftPct=idx=>(clampIdx(idx)-startCol)/span*100;const rightPct=idx=>(clampIdx(idx)+1-startCol)/span*100;const r=schedById&&schedById.get(task.id);let statusKey=null;if(r){if(r.anchorSource==="manual")statusKey="manual";else if(r.anchorSource==="override")statusKey="override";else if(!r.blocked&&!r.toSchedule&&!r.error&&r.suggestedStart)statusKey="scheduled"}const hasIssue=!!(r&&(r.error==="circular"||r.blocked||r.toSchedule));const statusTagHtml=statusKey?`<span class="gantt-status-tag tag-${statusKey}">${GANTT_STATUS_LABELS[statusKey]}</span>`:"";const warnHtml=hasIssue?`<span class="gantt-warn" title="排程異常">!</span>`:"";const titleLines=[];if(statusKey)titleLines.push(`來源：${GANTT_STATUS_LABELS[statusKey]}（${GANTT_SOURCE_DESC[statusKey]}）`);if(r){if(r.error==="circular")titleLines.push("⚠ 循環依賴：無法排程");else if(r.blocked)titleLines.push("⚠ 受阻：上游尚未排出");else if(r.toSchedule)titleLines.push("⚠ 待排：無前置且未填開始日");if(r.warnings&&r.warnings.length)titleLines.push("提醒："+r.warnings.join("；"))}const barTitle=titleLines.join("|");let html=`<div class="gantt-row-label">
    <span class="gantt-row-label-text">${U.esc(task.name)}</span>
  </div>`;for(let i=0;i<startCol;i++){const d=days[i];html+=`<div class="gantt-cell ${!D.isWorkday(d)?"holiday":""} ${D.isSameDay(d,D.today())?"today":""}"></div>`}const progress=taskDisplayProgress(task);if(isMilestone){html+=`<div class="gantt-cell" style="position:relative;">
      <div class="gantt-bar milestone" data-link-id="${task.id}" style="left:50%; transform:translateX(-50%);" onclick="App.openTaskModal('${task.id}')"${barTitle?` data-tip="甘特狀態|${U.esc(barTitle)}"`:""}></div>
    </div>`}else{const frameStyle=`left:${leftPct(psIdx).toFixed(2)}%; right:${(100-rightPct(peIdx)).toFixed(2)}%;`;const fillStyle=`left:${leftPct(aSIdx).toFixed(2)}%; right:${(100-rightPct(aEIdx)).toFixed(2)}%;`;html+=`<div class="gantt-cell" style="grid-column: span ${span}; position:relative;">
      <div class="gantt-plan-frame" data-link-id="${task.id}" style="${frameStyle}"></div>
      <div class="gantt-actual-fill ${showFill?fillClass:""}" style="${fillStyle}" onclick="App.openTaskModal('${task.id}')"${barTitle?` data-tip="甘特狀態|${U.esc(barTitle)}"`:""}>
        ${statusTagHtml}${warnHtml}${(()=>{const xPreds=App._ganttPreds(task).filter(p=>p.stage!==task.stage);return xPreds.length?`<span class="gantt-xstage-badge" data-tip="跨階段前置|${U.esc(xPreds.map(p=>p.name).join("、"))}"><i class="ti ti-link"></i>${xPreds.length}</span>`:""})()}${showFill?`${U.esc(task.name)} <span class="pill">${fillClass==="fill-hold"?"⏸ 擱置":overdueDays>0?`逾期+${overdueDays}工作天`:progress+"%"}</span>`:""}
      </div>
    </div>`}for(let i=endCol+1;i<14;i++){const d=days[i];html+=`<div class="gantt-cell ${!D.isWorkday(d)?"holiday":""}"></div>`}return html};App._ganttPreds=function(task){if(!task.predecessor)return[];return parsePredecessors(task.predecessor).filter(p=>p.type==="FS").map(p=>DATA.tasks.find(t=>t.id===p.dep)).filter(Boolean)};App._drawGanttLinks=function(targetId){};App.renderMonth=function(targetId="page-month",pid=null){this.monthScope={targetId,pid};if(!this.monthCursor){const today2=D.today();this.monthCursor={year:today2.getFullYear(),month:today2.getMonth()}}const{year,month}=this.monthCursor;const firstDay=new Date(year,month,1);const lastDay=new Date(year,month+1,0);const firstDayOfWeek=firstDay.getDay();const cells=[];for(let i=0;i<firstDayOfWeek;i++){const d=new Date(year,month,-firstDayOfWeek+i+1);cells.push({d,other:true})}for(let i=1;i<=lastDay.getDate();i++){cells.push({d:new Date(year,month,i),other:false})}while(cells.length%7!==0||cells.length<35){const last=cells[cells.length-1].d;const next=new Date(last);next.setDate(last.getDate()+1);cells.push({d:next,other:next.getMonth()!==month});if(cells.length>=42)break}const today=D.today();const previewDays=(DATA.settings.previewWeeks||2)*7;const _mLiveSet=new Set((DATA.projects||[]).filter(p=>App._isLiveProject(p)).map(p=>p.id));const cellsHtml=cells.map(c=>{const isToday=D.isSameDay(c.d,today);const isWk=!D.isWorkday(c.d);const dateIso=D.fmt(c.d,"iso");const meetings=DATA.meetings.filter(m=>m.date===dateIso);const taskDeadlines=DATA.tasks.filter(t=>!t._deleted&&(!pid||t.project===pid)&&(!t.project||_mLiveSet.has(t.project))&&getEffectiveSchedule(t).end===dateIso&&t.status!=="done"&&t.status!=="hold");const dayEvents=[];for(const m of meetings){dayEvents.push(`<div class="month-evt meeting" title="${U.esc(m.title)}">${U.esc(m.startTime||"")} ${U.esc(m.title).slice(0,6)}</div>`)}for(const t of taskDeadlines){const sch=getEffectiveSchedule(t);const days=D.daysBetween(today,new Date(sch.end));const isPreview=days>7&&days<=previewDays;const cls=days<=3?"rust-evt":isPreview?"preview":"deep";dayEvents.push(`<div class="month-evt ${cls}" title="${U.esc(t.name)}" onclick="event.stopPropagation(); App.openTaskModal('${t.id}')">${U.esc(t.name).slice(0,8)}</div>`)}const MONTH_CELL_MAX=6;let evtsHtml=dayEvents.slice(0,MONTH_CELL_MAX).join("");if(dayEvents.length>MONTH_CELL_MAX){evtsHtml+=`<div style="font-size:9px; color:var(--ink3); font-family:var(--mono);">+ ${dayEvents.length-MONTH_CELL_MAX} 個</div>`}return`<div class="month-cell ${c.other?"other-month":""} ${isWk?"weekend":""} ${isToday?"today":""}">
      <div class="date">${c.d.getDate()}</div>
      ${evtsHtml}
    </div>`}).join("");document.getElementById(targetId).innerHTML=`
    <div class="month-card">
      <div class="month-head-row" style="position:relative;">
        <button class="month-title-btn" onclick="App.toggleYMPicker(event)">
          ${year} 年 ${month+1} 月 <span class="chevron">▼</span>
        </button>
        <div class="ym-picker" id="ymPicker">
          ${this.buildYMPickerHtml(year,month)}
        </div>
        <div class="month-spacer"></div>
        <div class="month-nav">
          <button onclick="App.monthShift(-1)">‹</button>
          <button onclick="App.monthToday()">今天</button>
          <button onclick="App.monthShift(1)">›</button>
        </div>
      </div>
      <div class="month-weekday-row">
        <div>日</div><div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div>
      </div>
      <div class="month-grid">${cellsHtml}</div>
      <div class="legend-row" style="border-top:1px solid var(--rule); margin-top:18px; padding-top:14px;">
        <span class="legend-item"><span class="legend-sw" style="background:var(--slate)"></span>會議</span>
        <span class="legend-item"><span class="legend-sw" style="background:var(--sage-500)"></span>任務截止</span>
        <span class="legend-item"><span class="legend-sw" style="background:var(--terracotta)"></span>緊急截止</span>
        <span class="legend-item"><span style="display:inline-block; width:10px; height:10px; border-radius:3px; border:1px dashed var(--amber);"></span>兩週預告</span>
      </div>
    </div>
  `};App.buildYMPickerHtml=function(curYear,curMonth){const yearOptions=[];for(let y=curYear-3;y<=curYear+3;y++){yearOptions.push(`<option value="${y}" ${y===curYear?"selected":""}>${y} 年</option>`)}return`
    <div class="ym-picker-year-row">
      <button onclick="event.stopPropagation(); App.monthYearShift(-1)">‹</button>
      <select id="ymYearSelect" onchange="App.monthYearSelect(this.value); event.stopPropagation();">${yearOptions.join("")}</select>
      <button onclick="event.stopPropagation(); App.monthYearShift(1)">›</button>
    </div>
    <div class="ym-months">
      ${[1,2,3,4,5,6,7,8,9,10,11,12].map(m=>`
        <button class="${m===curMonth+1?"current":""}" onclick="App.monthPick(${m-1}); event.stopPropagation();">${m}月</button>
      `).join("")}
    </div>
  `};App.toggleYMPicker=function(e){e.stopPropagation();document.getElementById("ymPicker").classList.toggle("open")};App.monthShift=function(n){this.monthCursor.month+=n;if(this.monthCursor.month<0){this.monthCursor.month=11;this.monthCursor.year--}if(this.monthCursor.month>11){this.monthCursor.month=0;this.monthCursor.year++}this.renderMonth(this.monthScope.targetId,this.monthScope.pid)};App.monthToday=function(){const today=D.today();this.monthCursor={year:today.getFullYear(),month:today.getMonth()};this.renderMonth(this.monthScope.targetId,this.monthScope.pid)};App.monthYearShift=function(n){this.monthCursor.year+=n;this.renderMonth(this.monthScope.targetId,this.monthScope.pid)};App.monthYearSelect=function(y){this.monthCursor.year=parseInt(y);this.renderMonth(this.monthScope.targetId,this.monthScope.pid)};App.monthPick=function(m){this.monthCursor.month=m;document.getElementById("ymPicker").classList.remove("open");this.renderMonth(this.monthScope.targetId,this.monthScope.pid)};document.addEventListener("click",e=>{const picker=document.getElementById("ymPicker");if(picker&&!picker.contains(e.target)&&!e.target.classList.contains("month-title-btn")){picker.classList.remove("open")}});
