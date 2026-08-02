/*! PM-Core (c) 2026 Paul Hsu. All Rights Reserved. Proprietary — see LICENSE. */
Portfolio._p1Html=function(){const projects=DATA.projects||[];if(!projects.length)return'<div class="pf-card"><div class="pf-mini-empty">尚無專案</div></div>';const today=D.today(),todayIso=D.fmt(today,"iso");const rows=projects.map(p=>{const closed=!App._isLiveProject(p);const pr=this.projectProgress(p.id,today);const gap=pr.actual!=null&&pr.planned!=null?pr.actual-pr.planned:null;let sev,lightTxt;if(closed){sev="closed";lightTxt=App._isProjectDone(p)?"結案":"封存"}else if(gap==null){sev="none";lightTxt="待排程"}else if(App.healthTier(gap)==="over"){sev="red";lightTxt="異常"}else if(App.healthTier(gap)==="warn"){sev="yellow";lightTxt="偏緊"}else{sev="green";lightTxt="正常"}const sortKey=closed?1e9:gap==null?1e8:gap;return{p,closed,pr,gap,sev,lightTxt,sortKey}}).sort((a,b)=>a.sortKey-b.sortKey);const dot={closed:"⚪",red:"🔴",yellow:"🟡",green:"🟢",none:"⚪"};const body=rows.map(r=>{const p=r.p,pr=r.pr,behind=r.gap!=null&&r.gap<0,exp=this._p1Exp===p.id;const ms=this._projNextMilestone(p,todayIso);const msTxt=r.sev==="none"?'<span class="pf-vt-todo">尚未排程 · 去設日期</span>':ms?`${U.esc(ms.name)}${ms.end?" · 迄 "+D.fmt(ms.end,"md"):""}`:"—";const gapTxt=r.gap==null?"—":(r.gap>0?"+":"")+r.gap+"%";return`<div class="pf-vt-row pf-vt-sev-${r.sev}${exp?" on":""}" onclick="Portfolio.toggleVarRow('${p.id}')">
        <span class="pf-vt-sevbar"></span>
        <span class="pf-vt-name">${U.esc(p.name)}</span>
        <span class="pf-vt-prog"><span class="pf-vt-track"><span class="pf-vt-fill${behind?" behind":""}" style="width:${pr.actual||0}%"></span>${pr.planned!=null?`<span class="pf-vt-planmark" style="left:${pr.planned}%"></span>`:""}</span></span>
        <span class="pf-vt-num">${pr.planned==null?"—":pr.planned+"%"}</span>
        <span class="pf-vt-num pf-vt-cur">${pr.actual==null?"—":pr.actual+"%"}</span>
        <span class="pf-vt-gap${behind?" neg":r.gap!=null&&r.gap>0?" pos":""}">${gapTxt}</span>
        <span class="pf-vt-light" title="${r.lightTxt}">${dot[r.sev]}</span>
        <span class="pf-vt-ms">${msTxt}</span>
        <i class="ti ti-chevron-${exp?"down":"right"} pf-vt-caret"></i>
      </div>${exp?`<div class="pf-vt-detail">${this._p1DetailHtml(p,todayIso)}</div>`:""}`}).join("");const hint=App.buildHintBox({key:"portfolio-variance",icon:"ti-help-circle",collapsed:true,title:"這張表怎麼看（落後排序）",summary:"預期 vs 目前、落差、點列展開",bodyHtml:`<ol class="pf-hint-list">
      <li><b>排序</b>：落差（目前−預期）最負的專案自動排最上面，左側色條紅→黃→綠標嚴重度，結案沉底。</li>
      <li><b>預期進度</b>：依時程到今天「本該做到」的比例（按工作量加權）。<b>目前進度</b>：實際做完的比例。落後時進度條轉紅、預期位置以琥珀線標示。</li>
      <li><b>點一列展開</b>：看這案接下來的關鍵階段時間點，與最要命的一個指標（設變案＝成本調降達成率／開發案＝離上市剩幾天）。</li>
    </ol>`});return`<div class="pf-card"><div class="pf-card-t">專案差異總覽（落後優先）</div>${hint}
    <div class="pf-vt">
      <div class="pf-vt-head"><span></span><span>專案</span><span>進度（目前條＋預期線）</span><span>預期</span><span>目前</span><span>落差</span><span>狀態</span><span>近期里程碑</span><span></span></div>
      ${body}
    </div></div>`};Portfolio._p1DetailHtml=function(p,todayIso){const stages=this._projStages(p);const msRows=stages.length?stages.map(s=>{const passed=s.done>=s.total,upcoming=!passed&&(!s.end||s.end>=todayIso);return`<div class="pf-vd-ms${upcoming?" up":""}${passed?" done":""}">
        <span class="pf-vd-ms-name">${U.esc(stageLabelOf(p,s.name))}</span>${""}
        <span class="pf-vd-ms-date">${s.start||s.end?D.fmtRange(s.start,s.end," ~ "):"— ~ —"}</span>${""}
        <span class="pf-vd-ms-dept">${s.dept?U.esc(s.dept):""}</span>
        <span class="pf-vd-ms-cnt">${s.done}/${s.total}</span>
      </div>`}).join(""):'<div class="pf-mini-empty">尚無排定階段</div>';const kr=this._projKeyRisk(p);const note=kr.note?`<div class="pf-vd-note">「${U.esc(kr.note)}」<button class="pf-vd-note-edit" onclick="event.stopPropagation();Portfolio.editKeyRisk('${p.id}')">改</button></div>`:`<button class="pf-vd-note-add" onclick="event.stopPropagation();Portfolio.editKeyRisk('${p.id}')"><i class="ti ti-plus"></i> 補一句風險註記</button>`;const msHead=stages.length?`<div class="pf-vd-ms pf-vd-ms-head">
        <span class="pf-vd-ms-name">階段</span>
        <span class="pf-vd-ms-date">期間</span>
        <span class="pf-vd-ms-dept">主責部門</span>
        <span class="pf-vd-ms-cnt">完成/總數</span>
      </div>`:"";return`<div class="pf-vd">
      <div class="pf-vd-col">
        <div class="pf-vd-h"><i class="ti ti-calendar-event"></i> 近期關鍵里程碑 <span class="pf-vd-q" data-tip="近期關鍵里程碑|這案各階段的時間窗與完成進度：綠＝該階段任務全數完成、加亮＝接下來要走的階段|「完成/總數」＝該階段已完成任務數／全部任務數">?</span></div>${msHead}${msRows}
      </div>
      <div class="pf-vd-col">
        <div class="pf-vd-h"><i class="ti ti-target"></i> 本案致命傷指標 <span class="pf-vd-q" data-tip="本案致命傷指標|這案「最可能出事」的單一指標，系統自動算：|設變案＝成本調降達成率（開案填的目標 vs BOM 實際算出的調降）|開發案＝剩餘緩衝（最末完工日到目標上市日還剩幾個工作天）|下方可補一句人工風險註記（例：卡在等客戶承認）">?</span></div>
        <div class="pf-vd-kr pf-vd-kr-${kr.tone}"><span class="pf-vd-kr-lbl">${kr.label}<span class="pf-vd-kr-auto">自動</span></span><span class="pf-vd-kr-val">${kr.value}</span></div>
        ${kr.sub?`<div class="pf-vd-kr-sub">${kr.sub}</div>`:""}${note}
      </div>
      <div class="pf-vd-foot"><button class="pf-vd-jump" onclick="event.stopPropagation();Portfolio.jumpToP2('${p.id}')">查看本案異常任務（P2）→</button></div>
    </div>`};Portfolio.toggleVarRow=function(projId){this._p1Exp=this._p1Exp===projId?null:projId;const panel=document.querySelector('.pf-panel[data-pf="1"]');if(panel)panel.innerHTML=this._p1Html()};Portfolio.editKeyRisk=function(projId){const p=App.getProj(projId);if(!p)return;App.promptModal({title:"風險註記（選填）",label:"補一句這案最要命的風險或現況（例：卡在等客戶承認）",value:p.keyRiskNote||"",okText:"儲存",onSubmit:val=>{p.keyRiskNote=(val||"").trim();Store.projects.save();const panel=document.querySelector('.pf-panel[data-pf="1"]');if(panel)panel.innerHTML=this._p1Html()}})};Portfolio.jumpToP2=function(projId){this._p2Filter=projId||"";this._p2Exp=null;this._p2Rerender();this.setOvTab("2")};Portfolio._p2Rows=function(){const today=D.today(),todayIso=D.fmt(today,"iso");const projName={},projColor={},projRed={};(DATA.projects||[]).forEach(p=>{projName[p.id]=p.name;projColor[p.id]=p.color||"";const pr=this.projectProgress(p.id,today);const gap=pr.actual!=null&&pr.planned!=null?pr.actual-pr.planned:null;projRed[p.id]=App._isLiveProject(p)&&App.healthTier(gap)==="over"});const activeSet=new Set((DATA.projects||[]).filter(p=>App._isLiveProject(p)).map(p=>p.id));const verById={};(DATA.projects||[]).forEach(p=>{verById[p.id]=p.version||1});const wlTotal={};this._live().forEach(t=>{if(activeSet.has(t.project)&&isCurrentEpoch(t,verById[t.project]))wlTotal[t.project]=(wlTotal[t.project]||0)+taskWorkload(t)});const rows=[];this._live().forEach(t=>{if(!activeSet.has(t.project))return;if(!isCurrentEpoch(t,verById[t.project]))return;const delayed=isTaskDelayed(t,today),held=t.status==="hold";if(!delayed&&!held)return;const e=getEffectiveSchedule(t);const odDays=delayed?Math.max(0,D.workdaysBetween(e.end,todayIso)-1):0;const eff=wlTotal[t.project]>0?Math.round(taskWorkload(t)/wlTotal[t.project]*100):0;const block=held?t.holdReason||"（未填擱置原因）":"逾期 "+odDays+" 工作天";rows.push({t,pid:t.project,kind:held?"hold":"delay",odDays,eff,block,rescueN:(t.rescueActions||[]).length,red:!!projRed[t.project]})});rows.sort((a,b)=>(b.red?1:0)-(a.red?1:0)||b.odDays-a.odDays||b.eff-a.eff);return{rows,projName,projColor}};Portfolio._p2Html=function(){const{rows,projName,projColor}=this._p2Rows();const filt=this._p2Filter||"";const shown=filt?rows.filter(r=>r.pid===filt):rows;const projOpts=['<option value="">全部異常任務</option>'].concat([...new Set(rows.map(r=>r.pid))].map(pid=>`<option value="${pid}"${filt===pid?" selected":""}>${U.esc(projName[pid]||"")}</option>`)).join("");const hint=App.buildHintBox({key:"portfolio-risk",icon:"ti-help-circle",collapsed:true,title:"這張表怎麼看（異常驅動）",summary:"只列延遲/卡關·權重凸顯·救援行動",bodyHtml:`<ol class="pf-hint-list">
      <li><b>只列異常</b>：目前「已逾期」或「卡關擱置」的任務；正常進行中的不佔版面。落差大的專案（P1 紅燈）其任務自動排最上。</li>
      <li><b>任務權重</b>：這件在專案裡的工作量佔比（工期×投入程度）。<b>≥40% 高權重</b>又出事＝紅字粗體，最該先救。</li>
      <li><b>點一列展開救援行動</b>：記下對策、負責人、預計解鎖日、處理狀態，讓「問題」變「追蹤中的解法」。狀態燈 🔴未動／🟡處理中／🟢已解，點燈可切換。</li>
    </ol>`});const body=shown.length?shown.map(r=>{const t=r.t,exp=this._p2Exp===t.id,hi=r.eff>=40;const stTxt=r.kind==="hold"?"卡關":"逾期";return`<div class="pf-rt-row${exp?" on":""}" onclick="Portfolio.toggleP2Row('${t.id}')">
        <span class="pf-rt-proj">${U.esc(projName[r.pid]||"")}</span>
        <span class="pf-rt-name">${U.esc(t.name)}</span>
        <span class="pf-rt-owner">${U.esc(t.owner||"未指派")}</span>
        <span class="pf-rt-wt"><span class="pf-rt-wbar"><span class="pf-rt-wfill${hi?" hi":""}" style="width:${Math.min(100,r.eff)}%"></span></span><span class="pf-rt-wn${hi?" hi":""}">${r.eff}%</span></span>
        <span class="pf-rt-st pf-rt-st-${r.kind}">${stTxt}</span>
        <span class="pf-rt-block">${U.esc(r.block)}</span>
        <span class="pf-rt-rescue">${r.rescueN?'<i class="ti ti-lifebuoy"></i>'+r.rescueN:""}</span>
        <i class="ti ti-chevron-${exp?"down":"right"} pf-rt-caret"></i>
      </div>${exp?`<div class="pf-rt-detail">${this._p2DetailHtml(t)}</div>`:""}`}).join(""):`<div class="pf-mini-empty">${filt?"此專案目前無異常任務":"目前沒有延遲或卡關的任務 🎉"}</div>`;const filterBar=rows.length?`<div class="pf-rt-filter"><span class="pf-rt-fl">專案</span><select class="pf-rt-fsel" onchange="Portfolio.setP2Filter(this.value)">${projOpts}</select><span class="pf-rt-cnt">${shown.length} 筆異常</span></div>`:"";return`<div class="pf-card"><div class="pf-card-t">異常任務追蹤（延遲／卡關）</div>${hint}${filterBar}
    <div class="pf-rt">
      <div class="pf-rt-head"><span>專案</span><span>任務·工作包</span><span>負責人</span><span>權重</span><span>狀態</span><span>阻礙說明</span><span></span><span></span></div>
      ${body}
    </div></div>`};Portfolio._p2DetailHtml=function(t){const acts=t.rescueActions||[];const stDot={red:"🔴",yellow:"🟡",green:"🟢"};const list=acts.length?acts.map(a=>`<div class="pf-ra-row">
      <button class="pf-ra-st" title="點擊切換狀態：未動→處理中→已解" onclick="event.stopPropagation();Portfolio.cycleRescue('${t.id}','${a.id}')">${stDot[a.status]||"🔴"}</button>
      <span class="pf-ra-action">${U.esc(a.action)}</span>
      <span class="pf-ra-owner">${a.owner?U.esc(a.owner):"—"}</span>
      <span class="pf-ra-date">${a.targetDate?"解鎖 "+D.fmt(a.targetDate,"md"):"—"}</span>
      <button class="pf-ra-del" title="刪除此行動" onclick="event.stopPropagation();Portfolio.delRescue('${t.id}','${a.id}')"><i class="ti ti-x"></i></button>
    </div>`).join(""):'<div class="pf-ra-empty">尚無救援行動——在下方新增第一條對策。</div>';const raHead=acts.length?`<div class="pf-ra-row pf-ra-head">
      <span class="pf-ra-st-h" data-tip="狀態燈|🔴 未動 → 🟡 處理中 → 🟢 已解，點燈可切換">狀態</span>
      <span class="pf-ra-action">對策／要做什麼</span>
      <span class="pf-ra-owner">負責人</span>
      <span class="pf-ra-date">預計解鎖日</span>
      <span></span>
    </div>`:"";return`<div class="pf-ra">
      <div class="pf-ra-h"><i class="ti ti-lifebuoy"></i> 救援行動（對策追蹤）</div>${raHead}${list}
      <div class="pf-ra-add" onclick="event.stopPropagation()">
        <input type="text" class="pf-ra-in-action" placeholder="對策／要做什麼">
        <input type="text" class="pf-ra-in-owner" placeholder="負責人">
        <input type="date" class="pf-ra-in-date" title="預計解鎖日">
        <button class="pf-ra-addbtn" onclick="Portfolio.addRescue('${t.id}')"><i class="ti ti-plus"></i> 加入行動</button>
      </div>
    </div>`};Portfolio.toggleP2Row=function(tid){this._p2Exp=this._p2Exp===tid?null:tid;this._p2Rerender()};Portfolio.setP2Filter=function(pid){this._p2Filter=pid||"";this._p2Rerender()};Portfolio._p2Rerender=function(){const el=document.querySelector('.pf-panel[data-pf="2"]');if(el)el.innerHTML=this._p2Html()};Portfolio._findTask=function(tid){return(DATA.tasks||[]).find(t=>t.id===tid)||null};Portfolio.addRescue=function(tid){const t=this._findTask(tid);if(!t)return;const root=document.querySelector(".pf-rt-detail .pf-ra-add");if(!root)return;const action=(root.querySelector(".pf-ra-in-action").value||"").trim();if(!action){if(U.toast)U.toast("請先填對策");return}const owner=(root.querySelector(".pf-ra-in-owner").value||"").trim();const targetDate=(root.querySelector(".pf-ra-in-date").value||"").trim();t.rescueActions=t.rescueActions||[];t.rescueActions.push({id:U.id(),action,owner,targetDate,status:"red",createdAt:D.fmt(D.today(),"iso")});Store.tasks.save();this._p2Rerender()};Portfolio.cycleRescue=function(tid,rid){const t=this._findTask(tid);if(!t)return;const a=(t.rescueActions||[]).find(x=>x.id===rid);if(!a)return;a.status={red:"yellow",yellow:"green",green:"red"}[a.status]||"yellow";Store.tasks.save();this._p2Rerender()};Portfolio.delRescue=function(tid,rid){const t=this._findTask(tid);if(!t)return;t.rescueActions=(t.rescueActions||[]).filter(x=>x.id!==rid);Store.tasks.save();this._p2Rerender()};
