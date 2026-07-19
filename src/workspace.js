/*! PM-Core (c) 2026 Paul Hsu. All Rights Reserved. Proprietary — see LICENSE. */
App.buildProjectViewTabsHtml=function(){return`
    <div class="tabs">
      <button class="tab-btn ${this.projectView==="dashboard"?"active":""}" onclick="App.switchProjectView('dashboard')">儀表板</button>
      <button class="tab-btn ${this.projectView==="list"?"active":""}" onclick="App.switchProjectView('list')">任務清單</button>
      <button class="tab-btn ${this.projectView==="gantt"?"active":""}" onclick="App.switchProjectView('gantt')">甘特圖</button>
      <button class="tab-btn ${this.projectView==="month"?"active":""}" onclick="App.switchProjectView('month')">月曆</button>
      <button class="tab-btn ${this.projectView==="bom"?"active":""}" onclick="App.switchProjectView('bom')">BOM · 成本</button>
    </div>`};Workspace.render=function(){if(typeof this.dashboardWeekOffset!=="number"){const _dow=D.today().getDay();this.dashboardWeekOffset=_dow===0||_dow===6?1:0}const today=D.today();const baseMonday=D.monday(today);const monday=D.addDays(baseMonday,this.dashboardWeekOffset*7);const sunday=D.addDays(monday,6);const wk=D.weekKey(monday);const wkNum=D.weekNum(monday);const _todayIso=D.fmt(today,"iso");const _schItems=DATA.schedule.items||[];const _todayTaskCount=new Set(_schItems.filter(it=>it.date===_todayIso).map(it=>it.taskId)).size;const _weekTaskCount=new Set(_schItems.filter(it=>it.week===wk).map(it=>it.taskId)).size;const _urgentHours=DATA.tasks.filter(t=>!t._deleted&&t.measureType==="hours"&&t.status!=="done"&&t.status!=="hold").filter(t=>{const sch=getEffectiveSchedule(t);return t.urgency==="high"||sch.end&&D.daysBetween(today,new Date(sch.end))<=1});const totalHours=weeklyScheduledHours(wk);const availableHours=weekCapacityHours();const scheduleHtml=this.buildWeekScheduleHtml(monday);let weekLabelSuffix="";if(this.dashboardWeekOffset===0)weekLabelSuffix="（本週）";else if(this.dashboardWeekOffset===-1)weekLabelSuffix="（上週）";else if(this.dashboardWeekOffset===1)weekLabelSuffix="（下週）";else if(this.dashboardWeekOffset<0)weekLabelSuffix=`（${-this.dashboardWeekOffset} 週前）`;else weekLabelSuffix=`（${this.dashboardWeekOffset} 週後）`;const weekOpts=[];for(let off=-8;off<=8;off++){const m=D.addDays(baseMonday,off*7);const e=D.addDays(m,6);const num=D.weekNum(m);let suffix="";if(off===-1)suffix="（上週）";else if(off===0)suffix="（本週）";else if(off===1)suffix="（下週）";weekOpts.push(`<option value="${off}" ${off===this.dashboardWeekOffset?"selected":""}>W${num}  ${D.fmt(m,"ymd")} – ${D.fmt(e,"md")}${suffix}</option>`)}const statsHtml=`<div class="stats-row">
    <div class="stat">
      <div class="stat-num">${_todayTaskCount}</div>
      <div class="stat-label">今日時段任務</div>
    </div>
    <div class="stat">
      <div class="stat-num">${_weekTaskCount}</div>
      <div class="stat-label">${this.dashboardWeekOffset===0?"本週":"W"+wkNum} 時段任務</div>
    </div>
    <div class="stat stat-urgent" onclick="App.showUrgentModal()" title="點擊查看緊急小時 Task">
      <div class="stat-num">${_urgentHours.length}</div>
      <div class="stat-label">緊急 ↗</div>
    </div>
    <div class="stat">
      <div class="stat-num">${Math.round(totalHours)}h</div>
      <div class="stat-label">${this.dashboardWeekOffset===0?"本週":"W"+wkNum} 工時 / ${availableHours}h</div>
    </div>
  </div>`;const memoHtml=`<div class="memo-board">
    <div class="memo-head">
      <div class="memo-title">便利貼</div>
      <button class="memo-add" data-edit onclick="App.addMemo()">＋ 新增</button>
    </div>
    <div class="memo-list" id="memoList">
      ${this.buildMemoListHtml()}
    </div>
  </div>`;document.getElementById("page-workspace").innerHTML=`
    <div class="dash-grid">
      <div>
        ${statsHtml}
        <div class="card" style="padding-bottom:14px;">
          <div class="card-head">
            <div class="card-title">時程表</div>
            <div class="week-nav-mini">
              <button class="rw-arrow" onclick="Workspace.dashboardWeekShift(-1)" title="上一週">‹</button>
              <select class="rw-select-mini" onchange="Workspace.dashboardWeekOffset = parseInt(this.value); Workspace.render();">
                ${weekOpts.join("")}
              </select>
              <button class="rw-arrow" onclick="Workspace.dashboardWeekShift(1)" title="下一週">›</button>
              ${this.dashboardWeekOffset!==0?`<button class="rw-arrow" onclick="Workspace.dashboardWeekOffset=0; Workspace.render();" title="回到本週" style="background: var(--ws-gold-soft); color: var(--ws-gold-ink);">今</button>`:""}
            </div>
            <button class="tb-action" data-edit onclick="App.openHoursTaskDialog()" style="margin-left:auto;"><i class="ti ti-plus"></i> 新增小時 Task</button>
            <button class="tb-action ws-smart" data-edit onclick="App.generateGlobalSchedule()" data-tip="智慧排程|依緊急度 × Deadline 自動把本週任務排入時段（避開會議時段）"><i class="ti ti-bolt"></i> 智慧排程</button>
            <span class="hdr-menu-wrap">
              <button class="rw-arrow hdr-menu-toggle" title="設定" aria-label="設定" onclick="App.toggleWsSettingsMenu(event)"><i class="ti ti-settings"></i><i class="ti ti-chevron-down" style="font-size:12px;"></i></button>
              <div class="hdr-menu hdr-menu-right" id="wsSettingsMenu">
                <button class="hdr-menu-item" data-edit onclick="App.openMeetingModal(); App.closeHdrMenus();"><span class="hdr-menu-rt"><i class="ti ti-calendar"></i>管理會議</span></button>
                <button class="hdr-menu-item" onclick="App.openGridSettingsModal(); App.closeHdrMenus();"><span class="hdr-menu-rt"><i class="ti ti-adjustments"></i>顯示設定（時間範圍）</span></button>
              </div>
            </span>
          </div>
          ${scheduleHtml}
          <div class="legend-row">
            <span class="legend-item"><span class="legend-sw" style="background:var(--sage-500)"></span>深度工作</span>
            <span class="legend-item"><span class="legend-sw" style="background:var(--amber)"></span>雜事零碎</span>
            <span class="legend-item"><span class="legend-sw" style="background:var(--navy)"></span>📅 會議</span>
            <span class="legend-item"><span class="legend-sw" style="background:var(--clay)"></span>🧹 打掃</span>
            <span class="legend-item"><span style="color:var(--terracotta);">⚠</span> 延遲</span>
            <span style="margin-left:auto; font-size:10.5px;">⋮⋮ 拖曳調整 · 🔒 已鎖定</span>
          </div>
          <details class="sched-rules">
            <summary>📊 排序規則：任務優先序怎麼算？</summary>
            <div class="sched-rules-body">
              <p class="sr-sink">⬇ <b>已完成 / 擱置：強制壓到最底</b> — 完成（−9999）與擱置（−9000）會被直接壓到最底，<b>無論其他條件如何都不參與本週搶時段</b>（這條的絕對影響最大）。</p>
              <p class="sr-intro">其餘未完成任務，系統會累加分數，分數高的排在前面、優先佔用本週時段：</p>
              <ul>
                <li>⏰ <b>deadline 逼近度</b>：已逾期 +500 起（每超時 1 天再 +10）· 剩 1 天內 +400 · 3 天內 +250 · 7 天內 +120 · 14 天內 +50；沒有預計完成日 −20</li>
                <li>🔴 <b>緊急程度</b>：緊急 +300 · 普通 +100 · 不急 +0</li>
                <li>▶ <b>進行中加分</b>：狀態為「進行中」+80</li>
              </ul>
              <p class="sr-note">附註：分數只決定「誰先排」，不決定「排幾小時」——實際排程時數另看任務的預計工時（estHours）。</p>
            </div>
          </details>
          ${this.buildNextWeekTodoHtml()}
        </div>
      </div>
      <div class="dash-side">${memoHtml}</div>
    </div>
  `;this.attachMemoDrag();const _tb=document.querySelector(".main > .topbar");if(_tb)document.documentElement.style.setProperty("--ws-sticky-top",_tb.offsetHeight+"px")};Workspace.dashboardWeekShift=function(delta){this.dashboardWeekOffset=(this.dashboardWeekOffset||0)+delta;Workspace.render()};App.toggleWsSettingsMenu=function(ev){ev.stopPropagation();this._ensureHdrMenuClose();const m=document.getElementById("wsSettingsMenu");const open=m&&m.classList.contains("open");this.closeHdrMenus();if(m&&!open)m.classList.add("open")};Workspace.buildWeekScheduleHtml=function(targetMonday){const monday=targetMonday||D.monday();const wk=D.weekKey(monday);const today=D.today();const wd=["一","二","三","四","五"];let html='<div class="week-schedule"><div class="ws-corner"></div>';for(let i=0;i<5;i++){const d=D.addDays(monday,i);const isToday=D.isSameDay(d,today);html+=`<div class="ws-day-header ${isToday?"today":""}">
      <span class="date">${d.getDate()}</span>週${wd[i]}
    </div>`}const _gs=Math.max(0,Math.min(22,parseInt(DATA.settings.gridStartHour,10)||8));const _ge=Math.max(_gs+1,Math.min(24,parseInt(DATA.settings.gridEndHour,10)||18));const hours=[];for(let _h=_gs;_h<_ge;_h++)hours.push(_h);const _lastHr=hours.length?hours[hours.length-1]:_gs;const _slots=[0];const CELL_H=66,ROW_GAP=1,PITCH=CELL_H+ROW_GAP;const _tmin=s=>{const p=String(s||"").split(":");return(parseInt(p[0],10)||0)*60+(parseInt(p[1],10)||0)};const _minPx=min=>min/60*PITCH;const items=(DATA.schedule.items||[]).filter(it=>it.week===wk);const meetings=DATA.meetings.filter(m=>{if(!m.date)return false;const md=new Date(m.date);return D.daysBetween(monday,md)>=0&&D.daysBetween(monday,md)<=6});const recurring=(DATA.settings.recurringMeetings||[]).filter(m=>m.enabled!==false);const special=DATA.settings.specialMeetings||[];function freqLabel(f){return{once:"單次",daily:"每天",weekly:"每週",biweekly:"隔週(一天)",triweekly:"隔兩週(一天)",monthly:"每月","biweekly-allday":"隔週整週每天","triweekly-allday":"隔兩週整週每天"}[f]||"每週"}function findMeetingAt(dateIso,hr){const sortedRecurring=[...recurring].sort((a,b)=>{const aRank=a.category==="cleaning"?1:0;const bRank=b.category==="cleaning"?1:0;return aRank-bRank});const occurringEvents=[];for(const m of sortedRecurring){if(!eventOccursOnDate(m,dateIso))continue;const[sh,sm]=m.start.split(":").map(Number);const[eh,em]=m.end.split(":").map(Number);occurringEvents.push({...m,mStart:sh*60+sm,mEnd:eh*60+em})}for(const m of special){if(m.date!==dateIso)continue;const[sh,sm]=m.start.split(":").map(Number);const[eh,em]=m.end.split(":").map(Number);occurringEvents.push({...m,category:m.category||"meeting",mStart:sh*60+sm,mEnd:eh*60+em,isSpecial:true})}const meetingsOnly=occurringEvents.filter(e=>e.category==="meeting");const filtered=occurringEvents.filter(e=>{if(e.category!=="cleaning")return true;const covered=meetingsOnly.some(m=>m.mStart<=e.mStart&&m.mEnd>=e.mEnd);return!covered});const slotStart=hr*60;const slotEnd=slotStart+60;for(const ev of filtered){if(slotStart<ev.mEnd&&slotEnd>ev.mStart){const overlappingHrs=hours.filter(h=>{const hStart=h*60;const hEnd=hStart+60;return hStart<ev.mEnd&&hEnd>ev.mStart});const firstOverlappingHr=overlappingHrs[0];const isFirstSlot=hr===firstOverlappingHr;let spanHours=1;if(isFirstSlot){const startIdx=hours.indexOf(firstOverlappingHr);for(let i=startIdx+1;i<hours.length;i++){if(overlappingHrs.includes(hours[i]))spanHours++;else break}}return{title:ev.title,start:ev.start,end:ev.end,category:ev.category||"meeting",frequency:ev.frequency||"weekly",type:ev.isSpecial?"special":"recurring",isFirstSlot,spanHours}}}return null}for(const hr of hours){for(const mm of _slots){if(hr===12){if(mm===0){html+=`<div class="ws-time-col ws-time-lunch"><span class="ws-tlabel${hr===_gs?" ws-tlabel-first":""}">12:00</span>${hr===_lastHr?`<span class="ws-tlabel ws-tlabel-end">${String(_ge).padStart(2,"0")}:00</span>`:""}</div>`;html+=`<div class="ws-lunch-band">☕ 午休時間</div>`}continue}const half=mm===0?"00":"30";html+=`<div class="ws-time-col"><span class="ws-tlabel${hr===_gs?" ws-tlabel-first":""}">${String(hr).padStart(2,"0")}:${half}</span>${hr===_lastHr?`<span class="ws-tlabel ws-tlabel-end">${String(_ge).padStart(2,"0")}:00</span>`:""}</div>`;for(let i=0;i<5;i++){const d=D.addDays(monday,i);const dateIso=D.fmt(d,"iso");const hrStr=`${String(hr).padStart(2,"0")}:${half}`;const item=items.find(it=>it.date===dateIso&&Math.floor(_tmin(it.start)/60)===hr);const meeting=mm===0?meetings.find(m=>{if(m.date!==dateIso)return false;const[mh]=(m.startTime||"").split(":").map(Number);return mh===hr}):null;const meetingAuto=mm===0?findMeetingAt(dateIso,hr):null;html+=`<div class="ws-cell ${D.isSameDay(d,today)?"today-col":""}" data-date="${dateIso}" data-start="${hrStr}" ondragover="event.preventDefault(); this.classList.add('drag-over');" ondragleave="this.classList.remove('drag-over');" ondrop="App.handleScheduleDrop(event, '${dateIso}', '${hrStr}')">`;if(item){const task=DATA.tasks.find(t=>t.id===item.taskId);if(task){const cat=task.taskType==="milestone"?"milestone":task.category||"deep";const proj=App.getProj(task.project);const projName=proj?proj.name:"";const today2=D.today();const sch=getEffectiveSchedule(task);const isOverdue=isTaskDelayed(task,today2);const tipParts=[projName?`${projName}｜${task.name}`:task.name];const total=item.totalHours||task.estHours||0;tipParts.push(`預估總工時：${total} h`);if(total>6){const days=Math.ceil(total/6);const weeks=Math.ceil(days/5);tipParts.push(`預估需要：${days} 個工作天 (約 ${weeks} 週)`)}tipParts.push(`本週已排：${(item.duration/60).toFixed(1)} h（僅提醒用，實際時間請自行安排）`);if(sch.start)tipParts.push(`預計開始：${D.fmt(sch.start,"ymdShort")}`);if(sch.end)tipParts.push(`預計完成：${D.fmt(sch.end,"ymdShort")}`);if(isOverdue)tipParts.push(`⚠ 已逾期 ${D.workdaysBetween(sch.end,today2)-1} 個工作天`);if(item.completed)tipParts.push(`✓ 已完成`);if(task.owner)tipParts.push(`擔當：${task.owner}`);if(task.note)tipParts.push(`備註：${task.note}`);const tipText=tipParts.join("\n");const _stM=_tmin(item.start),_enM=_stM+(item.duration||60);let _top=_minPx(_stM-hr*60);if(_top<0)_top=0;const _h=Math.max(18,_minPx(_enM-hr*60)-_top-ROW_GAP);html+=`<div class="ws-event ws-ev-task ${cat} ${item.locked?"locked":""} ${isOverdue?"overdue":""} ${item.completed?"completed":""}"
            style="top:${_top}px;height:${_h}px;"
            ${item.completed?"":'draggable="true"'}
            data-task-id="${task.id}"
            data-from-date="${dateIso}"
            data-from-start="${hrStr}"
            ${item.completed?"":`ondragstart="App.handleScheduleDragStart(event)" ondragend="event.target.classList.remove('dragging')"`}
            ondblclick="App.openTaskInProject('${task.id}')"
            title="${U.esc(tipText)}&#10;━━━━━━━━━━━━━━&#10;💡 雙擊跳到專案頁編輯">
            ${item.completed?'<span class="done-badge">✓</span>':item.locked?'<span class="lock-ico">🔒</span>':""}
            ${isOverdue&&!item.completed?'<span class="overdue-badge">⚠</span>':""}
            <div class="ws-ev-line">${projName?`<span class="ws-ev-proj">${U.esc(projName)}</span> `:""}<b>${U.esc(task.name)}</b></div>
          </div>`}}else if(meeting){const mMisc=meeting.category==="cleaning";const mIcon=mMisc?"🏷":"📅";const mLbl=mMisc&&meeting.categoryLabel?`[${U.esc(meeting.categoryLabel)}] `:"";const _mSt=_tmin(meeting.startTime||`${hr}:00`);const _mEn=meeting.endTime?_tmin(meeting.endTime):_mSt+60;let _mTop=_minPx(_mSt-hr*60);if(_mTop<0)_mTop=0;const _mH=Math.max(18,_minPx(_mEn-hr*60)-_mTop-ROW_GAP);html+=`<div class="ws-event ${mMisc?"cleaning":"meeting"}" style="top:${_mTop}px;height:${_mH}px;" title="${U.esc((mMisc&&meeting.categoryLabel?"["+meeting.categoryLabel+"] ":"")+meeting.title)}">
          <b>${mIcon} ${mLbl}${U.esc(meeting.title).slice(0,12)}</b>
          <div class="ev-meta">${meeting.startTime||""}</div>
        </div>`}else if(meetingAuto){if(meetingAuto.isFirstSlot){const aMisc=meetingAuto.category==="cleaning";const aLbl=aMisc&&meetingAuto.categoryLabel?`[${meetingAuto.categoryLabel}] `:"";const catTxt=aMisc?meetingAuto.categoryLabel||"雜項":"會議";const tip=`${aLbl}${meetingAuto.title}
${meetingAuto.start}–${meetingAuto.end}
${aMisc?"🏷":"📅"} ${catTxt}（${freqLabel(meetingAuto.frequency)}）`;const _aSt=_tmin(meetingAuto.start),_aEn=meetingAuto.end?_tmin(meetingAuto.end):_aSt+60;let _aTop=_minPx(_aSt-hr*60);if(_aTop<0)_aTop=0;const _aH=Math.max(18,_minPx(_aEn-hr*60)-_aTop-ROW_GAP);const cssClass=aMisc?"cleaning":"auto-meeting";const icon=aMisc?meetingAuto.categoryLabel?"🏷":"🧹":"📅";html+=`<div class="ws-event meeting ${cssClass}" style="top:${_aTop}px; height:${_aH}px; z-index:var(--z-ws-event-low);" title="${U.esc(tip)}">
            <b>${icon} ${U.esc(aLbl+meetingAuto.title).slice(0,16)}</b>
            <div class="ev-meta">${meetingAuto.start}–${meetingAuto.end}</div>
          </div>`}}html+="</div>"}}}html+="</div>";return html};App.handleScheduleDragStart=function(e){const target=e.target.closest(".ws-event");if(!target)return;target.classList.add("dragging");e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("taskId",target.dataset.taskId);e.dataTransfer.setData("fromDate",target.dataset.fromDate);e.dataTransfer.setData("fromStart",target.dataset.fromStart)};App.handleScheduleDrop=function(e,toDate,toStart){e.preventDefault();const cell=e.currentTarget;cell.classList.remove("drag-over");const taskId=e.dataTransfer.getData("taskId");const fromDate=e.dataTransfer.getData("fromDate");const fromStart=e.dataTransfer.getData("fromStart");if(!taskId)return;const items=DATA.schedule.items||[];const draggedIdx=items.findIndex(it=>it.taskId===taskId&&it.date===fromDate&&it.start===fromStart);const targetIdx=items.findIndex(it=>it.date===toDate&&it.start===toStart);if(draggedIdx===-1)return;if(targetIdx!==-1&&draggedIdx!==targetIdx){const a=items[draggedIdx];const b=items[targetIdx];a.date=toDate;a.start=toStart;b.date=fromDate;b.start=fromStart;a.locked=true;b.locked=true}else{items[draggedIdx].date=toDate;items[draggedIdx].start=toStart;items[draggedIdx].locked=true}Store.schedule.save();Workspace.render();U.toast("✓ 已調整並鎖定")};App.pinTaskToWeek=function(taskId){if(App._roGuard())return;if(!taskId)return;const s=DATA.settings;if(!Array.isArray(s.pinnedWeekTaskIds))s.pinnedWeekTaskIds=[];if(!s.pinnedWeekTaskIds.includes(taskId))s.pinnedWeekTaskIds.push(taskId);Store.settings.save();generateSchedule();Workspace.render();U.toast("📌 已釘選到本週")};App.unpinTaskFromWeek=function(taskId){if(App._roGuard())return;if(!taskId)return;const s=DATA.settings;s.pinnedWeekTaskIds=(s.pinnedWeekTaskIds||[]).filter(id=>id!==taskId);Store.settings.save();generateSchedule();Workspace.render();U.toast("已取消釘選")};Workspace.buildNextWeekTodoHtml=function(){const sunday=D.addDays(D.monday(),6);const weekAfter=D.addDays(sunday,7);const pinnedIds=DATA.settings.pinnedWeekTaskIds||[];const projName=id=>{const p=DATA.projects.find(x=>x.id===id);return p?p.name:""};const base=DATA.tasks.filter(t=>!t._deleted&&t.status!=="done"&&t.status!=="hold"&&t.plannedStart&&new Date(t.plannedStart)>sunday&&!pinnedIds.includes(t.id));const inWeek=t=>new Date(t.plannedStart)<=weekAfter;const groupBy=pred=>DATA.projects.filter(p=>App._isLiveProject(p)).map(p=>({proj:p,tasks:base.filter(t=>t.project===p.id&&pred(t)).sort((a,b)=>scoreTask(b)-scoreTask(a))})).filter(g=>g.tasks.length>0);const weekGroups=groupBy(inWeek);const farGroups=groupBy(t=>!inWeek(t));const rowOf=t=>`
    <div class="nwt-row">
      <span class="nwt-name">${U.esc(t.name)}</span>
      <span class="nwt-date">${D.fmt(t.plannedStart,"ymdShort")}</span>
      <button class="nwt-pin" data-edit onclick="App.pinTaskToWeek('${t.id}')">📌 釘選本週</button>
    </div>`;const weekBlock=weekGroups.map(g=>{const top=g.tasks.slice(0,5),rest=g.tasks.slice(5);const restHtml=rest.length?`
      <details class="nwt-more">
        <summary>展開其餘 ${rest.length} 項</summary>
        <div class="nwt-scroll">${rest.map(rowOf).join("")}</div>
      </details>`:"";return`<div class="nwt-proj-group">
      <div class="nwt-proj-title">${U.esc(g.proj.name)} <span class="nwt-proj-count">${g.tasks.length} 項</span></div>
      ${top.map(rowOf).join("")}
      ${restHtml}
    </div>`}).join("")||'<div class="nwt-empty">本週無一週內的待辦</div>';const farCount=farGroups.reduce((n,g)=>n+g.tasks.length,0);const farBlock=farCount?`
    <details class="nwt-far">
      <summary>📦 更遠的待辦（${farCount} 項，預計開始日 ${D.fmt(D.addDays(weekAfter,1),"md")} 以後）</summary>
      <div class="nwt-far-body">${farGroups.map(g=>`
        <div class="nwt-proj-group">
          <div class="nwt-proj-title">${U.esc(g.proj.name)} <span class="nwt-proj-count">${g.tasks.length} 項</span></div>
          <div class="nwt-scroll">${g.tasks.map(rowOf).join("")}</div>
        </div>`).join("")}</div>
    </details>`:"";const pinned=DATA.tasks.filter(t=>!t._deleted&&pinnedIds.includes(t.id));const pinnedBlock=pinned.length?`
    <div class="nwt-subtitle">📌 已釘選本週（${pinned.length}）</div>
    ${pinned.map(t=>`
    <div class="nwt-row nwt-pinned">
      <span class="nwt-name">${U.esc(t.name)}</span>
      <span class="nwt-proj">${U.esc(projName(t.project))}</span>
      <span class="nwt-date">${t.plannedStart?D.fmt(t.plannedStart,"ymdShort"):"—"}</span>
      <button class="nwt-unpin" data-edit onclick="App.unpinTaskFromWeek('${t.id}')">取消釘選</button>
    </div>`).join("")}`:"";return`<div class="next-week-todo">
    <div class="nwt-head">📅 下週待辦 <span class="nwt-hint">（一週內 ${D.fmt(D.addDays(sunday,1),"md")}–${D.fmt(weekAfter,"md")}）</span></div>
    ${weekBlock}
    ${farBlock}
    ${pinnedBlock}
  </div>`};Workspace.buildMemoListHtml=function(){if(DATA.memos.length===0){return'<div style="text-align:center; padding:60px 20px; color:var(--ink3); font-size:13px;">尚無便利貼<br><span style="font-size:11px;">點右上「＋ 新增」加一張</span></div>'}return DATA.memos.map(m=>`
    <div class="memo" style="background:var(--${m.color}); top:${m.x}px; left:${m.y}px; transform:rotate(${m.rotate}deg);" data-id="${m.id}"
         ondblclick="App.editMemo('${m.id}')"
         title="拖曳移動 · 雙擊編輯">
      <button class="memo-del" data-edit onclick="App.deleteMemo('${m.id}')">×</button>
      ${U.esc(m.text)}
      <div class="memo-author">${m.date}</div>
    </div>
  `).join("")};Workspace.attachMemoDrag=function(){if(document.body.classList.contains("viewonly"))return;let dragMemo=null,offsetX=0,offsetY=0;document.querySelectorAll(".memo").forEach(m=>{m.addEventListener("mousedown",e=>{if(e.target.classList.contains("memo-del"))return;dragMemo=m;const rect=m.getBoundingClientRect();offsetX=e.clientX-rect.left;offsetY=e.clientY-rect.top;m.style.cursor="grabbing";m.style.zIndex=10})});document.addEventListener("mousemove",e=>{if(!dragMemo)return;const parent=dragMemo.parentElement.getBoundingClientRect();const x=e.clientX-parent.left-offsetX;const y=e.clientY-parent.top-offsetY;const ny=Math.max(0,Math.min(x,parent.width-dragMemo.offsetWidth));const nx=Math.max(0,Math.min(y,parent.height-dragMemo.offsetHeight));dragMemo.style.left=ny+"px";dragMemo.style.top=nx+"px"});document.addEventListener("mouseup",()=>{if(dragMemo){const id=dragMemo.dataset.id;const memo=DATA.memos.find(m=>m.id===id);if(memo){memo.x=parseInt(dragMemo.style.top);memo.y=parseInt(dragMemo.style.left);Store.memos.save()}dragMemo.style.cursor="grab";dragMemo.style.zIndex="";dragMemo=null}})};App.addMemo=function(){if(App._roGuard())return;App.promptModal({title:"新增便利貼",label:"便利貼內容",placeholder:"輸入內容…",okText:"加入",onSubmit:text=>{if(!text||!text.trim())return;const memo={id:U.id(),text:text.slice(0,80),color:MEMO_COLORS[Math.floor(Math.random()*MEMO_COLORS.length)],x:10+Math.floor(Math.random()*100),y:10+Math.floor(Math.random()*50),rotate:-4+Math.floor(Math.random()*9),date:D.fmt(new Date,"md")};DATA.memos.push(memo);Store.memos.save();Workspace.render();U.toast("✓ 便利貼已加入")}})};App.editMemo=function(id){const memo=DATA.memos.find(m=>m.id===id);if(!memo)return;App.promptModal({title:"編輯便利貼",label:"便利貼內容",value:memo.text,okText:"儲存",onSubmit:newText=>{const trimmed=(newText||"").trim();if(!trimmed){App.confirmModal({icon:"ti-trash",iconBg:"--rose-l",iconColor:"--rose-ink",title:"內容為空，刪除這張便利貼？",okText:"刪除",cancelText:"取消",okClass:"danger",onConfirm:()=>{DATA.memos=DATA.memos.filter(m=>m.id!==id);Store.memos.save();Workspace.render();U.toast("✓ 已刪除")}});return}memo.text=trimmed.slice(0,200);Store.memos.save();Workspace.render();U.toast("✓ 已更新")}})};App.deleteMemo=function(id){if(App._roGuard())return;App.confirmModal({icon:"ti-trash",iconBg:"--rose-l",iconColor:"--rose-ink",title:"刪除這張便利貼？",okText:"刪除",cancelText:"取消",okClass:"danger",onConfirm:()=>{DATA.memos=DATA.memos.filter(m=>m.id!==id);Store.memos.save();Workspace.render()}})};App.showUrgentModal=function(){const urgent=DATA.tasks.filter(t=>t.status!=="done"&&t.status!=="hold").filter(t=>t.measureType==="hours").filter(t=>{const sch=getEffectiveSchedule(t);return t.urgency==="high"||sch.end&&D.daysBetween(D.today(),new Date(sch.end))<=1});const sorted=sortTasks(urgent);const body=sorted.length===0?'<div style="text-align:center; padding:32px 0; color:var(--ink3);">目前沒有緊急任務 🎉</div>':sorted.map(t=>{const sch=getEffectiveSchedule(t);const proj=this.getProj(t.project);let dlText="無 deadline";if(sch.end){const days=D.daysBetween(D.today(),new Date(sch.end));dlText=days<0?`逾期 ${D.workdaysBetween(sch.end,D.today())-1} 工作天`:days===0?"今天截止":days===1?"明天截止":`${days} 天後`}return`<div class="urgent-row" onclick="App.openTaskModal('${t.id}'); App.closeModal();">
        <span class="u-proj">${U.esc(proj?.name||"其他")}</span>
        <span class="u-name">${U.esc(t.name)}</span>
        <span class="u-deadline">${dlText}</span>
      </div>`}).join("");this.openModal({title:`🚨 緊急任務 (${urgent.length} 項)`,body,footer:'<button class="tb-action ghost" onclick="App.closeModal()">關閉</button>'})};
