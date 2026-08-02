/*! PM-Core (c) 2026 Paul Hsu. All Rights Reserved. Proprietary — see LICENSE. */
App.buildTaskFormHtml=function(task,mode,measure="duration"){const t=task||{};const v=x=>x==null?"":x;const startMode=mode==="new"?"auto":App.startModeOf(t);const effSch=getEffectiveSchedule(t);const deptNames=[...new Set((DATA.projects||[]).flatMap(p=>(p.depts||[]).map(d=>(d.name||"").trim())).filter(Boolean))];const isAutoStart=startMode==="auto";const startInputVal=isAutoStart?effSch.start||"":v(t.start);const startHint=isAutoStart?effSch.start?"預計開始目前依前置排到 "+D.fmt(effSch.start,"ymd")+"；直接改此日即固定為起點，下游接著排。改完成日會自動反推工期。":"預計開始留白＝依前置自動排；填入日期即固定為起點。改完成日會自動反推工期。":"預計開始已固定為起點，下游接著排；清空可改回依前置自動排。改完成日會自動反推工期。";const _held=t.status==="hold";const _dstat=App._deriveStatus(t.actualStart,t.actualEnd,_held,t.status);const _stChip=App._TF_STMAP[_dstat]||App._TF_STMAP.pending;const _todayIsoTf=D.fmt(D.today(),"iso");const _delayShow=_dstat!=="done"&&_dstat!=="hold"&&effSch.end&&effSch.end<_todayIsoTf||t.delayReason&&String(t.delayReason).trim();const _spanWd=Number(t.durationDays)||0;const _netVal=t.netWorkDays!=null&&t.netWorkDays!==""?t.netWorkDays:"";const _pctMode=!(Number(_netVal)>0)&&Number(t.effortRatio)===0;const _advFilled=[t.predecessor&&String(t.predecessor).trim(),t.taskType&&t.taskType!=="task",t.riskIssue&&String(t.riskIssue).trim(),t.deliverable&&String(t.deliverable).trim(),t.deliverableLink&&String(t.deliverableLink).trim()].filter(Boolean).length;return`
    <div class="task-form tf-redesign" data-measure="${measure}">
    ${mode==="new"?`
    <div class="form-field">
      <label>專案 *</label>
      <select id="tf-project"><option value="" ${!t.project?"selected":""}>— 請選擇 —</option>${DATA.projects.map(p=>`<option value="${p.id}" ${t.project===p.id?"selected":""}>${U.esc(p.name)}</option>`).join("")}</select>
    </div>`:`
    <div class="form-field tf-proj-field">
      <label>專案</label>
      <div class="task-proj-readonly">${U.esc((DATA.projects.find(p=>p.id===t.project)||{}).name||"")}</div>
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
      <div class="form-field"><label>負責人 *</label><input type="text" id="tf-owner" value="${U.esc(v(t.owner)||(mode==="new"?DATA.settings.userName||"":""))}"></div>
    </div>

    <div class="form-field mg-hours"><label>部門 <span data-tip="部門|這件雜事掛哪個部門：該部門的可用容量會扣掉它的預估工時（雜事＝容量流失·總覽部門水位即時反映）；選項為全專案出現過的部門" style="cursor:help;">?</span></label><!-- 稽核中11+高08B：tooltip 改寫為當前真行為（部門容量扣減） -->
      <select id="tf-dept">
        <option value="">未指派</option>
        ${deptNames.map(n=>`<option value="${U.esc(n)}" ${(t.dept||"")===n?"selected":""}>${U.esc(n)}</option>`).join("")}
      </select>
    </div>

    <div class="tf-sched-card">
      <div class="tf-sched-title"><i class="ti ti-clock-bolt" aria-hidden="true"></i>排程與進度</div>
      <div class="tf-chain">
        <div class="tf-chain-cell tf-start-cell">
          <div class="tf-cell-label">預計開始</div>
          <input type="date" id="tf-start" value="${startInputVal}"${isAutoStart?' data-autostart="1"':""}>
        </div>
        <div class="tf-chain-arrow dur-only"><i class="ti ti-arrow-right" aria-hidden="true"></i></div>
        <div class="tf-chain-cell tf-dur-cell mg-duration">
          <div class="tf-cell-label tf-cell-accent">工期（工作天）</div><!-- 稽核機66：天＝工作天標明（hint 有講欄名沒講） -->
          <input type="number" id="tf-duration" value="${v(t.durationDays)||1}" step="1">
        </div>
        <div class="tf-chain-cell tf-hours-cell mg-hours">
          <div class="tf-cell-label">預估工時 (h)</div>
          <input type="number" id="tf-hours" value="${v(t.estHours)||1}" min="0.5" step="0.5">
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
        <label class="tf-hold"><input type="checkbox" id="tf-hold" ${_held?"checked":""} onchange="App._tfSyncStatus()"> 擱置</label>
      </div>
      <div class="tf-holdreason" id="tf-holdreason-wrap" style="${_held?"":"display:none"}">
        <input type="text" id="tf-holdReason" value="${U.esc(v(t.holdReason))}" placeholder="擱置原因（便於日後復盤）">
      </div>
      <div class="tf-delayreason" id="tf-delayreason-wrap" style="${_delayShow?"":"display:none"}"><!-- §24.16-C 報告融合：延誤理由（逾期才顯·報告端 TABLE_FIELDS.delayReason 已在讀） -->
        <div class="tf-cell-label tf-delay-lbl"><i class="ti ti-alert-triangle" aria-hidden="true"></i> 延誤理由 <span class="tf-sublabel">· 會帶進專案報告的延誤說明欄</span></div>
        <input type="text" id="tf-delayReason" value="${U.esc(v(t.delayReason))}" placeholder="例：治具到料延遲 3 天，改用替代治具續測">
      </div>

      <div class="dur-only">${App.buildHintBox({key:"task-time",icon:"ti-clock-bolt",title:"時間怎麼連動",summary:"填兩個，第三個自動算",collapsed:true,bodyHtml:'<div class="ht-rule ht-start"><b>改開始日</b><span>工期不動，自動算出新的完成日。例：開始改 6/25、工期 5 天 → 完成自動變 7/1（跳週末與國定假日）。</span></div><div class="ht-rule ht-dur"><b>改工期</b><span>開始日當錨不動，自動算出新的完成日。例：工期改 7 天 → 完成日往後移到第 7 個工作天。</span></div><div class="ht-rule ht-end"><b>改完成日</b><span>開始日不動，回算工期（等於調整這任務要做多久）。例：完成改 7/3 → 工期自動變成 6/25 到 7/3 的工作天數。</span></div><div class="ht-rule ht-down"><b>下游連動</b><span>這任務時間一改，有設前置的下游任務跟著自動重排；你手動指定過日期的任務不會被動到。</span></div>'})}</div>
    </div>

    <div class="form-row">
      <!-- D3 第 3 步（§18.10d ⑤-b·Mockup 定版 2026-07-27）：主欄改「這段期間實際會動工幾天」並常駐，投入% 降為次要入口。
           兩者**共用同一個欄位格**（切換顯示），故 form-row 永遠只有兩欄、版面不會因切換而跳動。
           ⚠ tf-netdays／tf-effort 兩個 id 一律保留且**永遠留在 DOM**（只是隱藏）——存檔端
           saveNewTask／saveTask 是靠這兩個 id 讀值，拿掉任一個就會踩坑2（被移除的欄位仍被裸讀 → 存檔中斷）。
           （本行刻意不用反引號：template literal 內的註解用反引號會就地截斷樣板字串·坑19） -->
      <div class="form-field dur-only"><!-- 稽核中11：時段制隱藏——hours 任務的 effortRatio 全站零消費（負荷走 estHours 容量扣減·高08B），顯示會讓人以為有作用＝UI 說謊 -->
        <label id="tf-net-label">${_pctMode?"每日投入程度":"這段期間實際會動工幾天"}</label>
        <div id="tf-net-days-wrap" class="tf-net-inwrap"${_pctMode?' style="display:none"':""}>
          <input type="number" id="tf-netdays" min="0" step="0.5" value="${_netVal}" oninput="App._tfNetConv()" placeholder="—">
          <span class="tf-net-unit">個工作天</span>
        </div>
        <div id="tf-net-pct-wrap"${_pctMode?"":' style="display:none"'}>
          <select id="tf-effort" onchange="App._tfNetConv()">${App._effortOptionsFull(t.effortRatio,mode==="edit")}</select><!-- 稽核中05：編輯態空值顯「未設定」不假裝 100 -->
          ${App._effortLogHtml(t)}
        </div>
      </div>
      <div class="form-field"><label>緊急程度 <span data-tip="緊急程度|系統自動推算，可手動覆蓋" style="cursor:help;">?</span></label>
        <select id="tf-urgency">
          <option value="high" ${urgencyOf(t)==="high"?"selected":""}>🔴 緊急</option>
          <option value="medium" ${urgencyOf(t)==="medium"?"selected":""}>🔵 普通</option>
          <option value="low" ${urgencyOf(t)==="low"?"selected":""}>⚪ 不急</option>
        </select>
      </div>
    </div>
    <div class="form-field dur-only">
      <!-- D3 第 3 步 定案3：換算結果常駐一行（天數 → 每天百分比 → 估計工時·三個數字同源）。
           定案2：沒填也不留空白——顯示系統實際採用的預設（守規則16）。內容全由 _tfNetConv 產生，初值在開窗後由 bindTaskTimeListeners 呼一次。 -->
      <div class="tf-net-conv" id="tf-net-conv"></div>
      <div class="tf-net-warn" id="tf-net-warn" style="display:none"></div>
      <div class="field-hint tf-net-foot">系統用這個數字算負荷。<button type="button" class="tf-net-swap" id="tf-net-swap" onclick="App._tfEffortMode()">${_pctMode?"改用天數填":"改用百分比填"}</button></div>
      <div class="field-hint">單日累計投入超過 100% 時，系統會警示資源過載。</div><!-- 稽核中11：此承諾只在工期制成立（時段制不進投入%告警）——整區 dur-only -->
    </div>

    <!-- §24.16-A/B 報告融合：報告說明（可截圖 AI 帶入）——獨立卡·報告產出自動抓此欄填 PPT 文字/表格 -->
    <div class="tf-report-card">
      <div class="tf-report-head">
        <span class="tf-report-title"><i class="ti ti-report" aria-hidden="true"></i> 進度／狀況說明 <span class="tf-report-tag">可貼截圖帶入</span></span>
      </div>
      <div class="tf-report-desc">這段文字會自動帶進「專案報告」的說明欄（依專案／階段對應到正確的頁），不用產報告時再逐頁手打。<b>原本的「備註」欄已併入這裡</b>——只留一格，不必再猜要打哪一欄。</div>
      <div class="tf-shot" id="tf-shot" ondragover="App._tfShotDragOver(event)" ondragleave="App._tfShotDragLeave(event)" ondrop="App._tfShotDrop(event)">
        <span class="tf-shot-ic">📸</span>
        <div class="tf-shot-body">
          <b>貼上或拖入截圖，AI 幫你讀成文字</b>
          <span>Ctrl+V 貼上 · 拖曳圖檔 · 或 <a onclick="App._tfShotPick()">選擇檔案</a>（測試結果／量測圖／白板都行）</span>
        </div>
        <button type="button" class="tf-shot-btn" id="tf-shot-btn" onclick="App._tfShotRecog()">🔍 辨識帶入</button>
        <input type="file" id="tf-shot-input" accept="image/*" multiple style="display:none" onchange="App._tfOnShotInput(this)">
      </div>
      <div class="tf-shot-thumbs" id="tf-shot-thumbs"></div>
      <div class="tf-shot-prev" id="tf-shot-prev" style="display:none"></div>
      <textarea id="tf-reportNote" class="tf-report-note" placeholder="在此輸入，或用上方截圖讓 AI 幫你讀成文字…">${U.esc(v(t.reportNote))}</textarea>
      <div class="field-hint tf-report-foot">🎙 逐字稿的待辦／結論日後也能一鍵帶進這欄（接口先留）。</div>
    </div>

    <div class="form-collapse" id="tf-advSection">
      <div class="form-collapse-head" onclick="document.getElementById('tf-advSection').classList.toggle('open')">
        <span class="form-collapse-chevron">▸</span> 進階設定${_advFilled>0?'<span class="tf-adv-badge">'+_advFilled+" 項已填</span>":""}
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
              <option value="task" ${t.taskType==="task"||!t.taskType?"selected":""}>📋 任務</option>
              <option value="milestone" ${t.taskType==="milestone"?"selected":""}>◆ 里程碑</option>
              <option value="group" ${t.taskType==="group"?"selected":""}>▦ 群組</option>
            </select>
          </div>
        </div>
        <!-- D5(a)：「標示為高風險任務」勾選已移除（riskHL 全 repo 零消費者＝寫進去沒人讀的死旗標；風險本來就由系統依日期/前置自動判，
             再讓 PM 手勾一個沒人看的旗標＝假的操作感）。風險內容文字欄保留——它有真內容、且走 Excel round-trip，
             比照 D5(b)「自由文字欄不要直接刪」的原則；勾選拿掉後改為進階區常駐，不再被旗標鎖住（原本沒勾就看不到匯入的內容·今晨才修過）。
             ⚠ 本註解在 template literal 內：禁用反引號（會直接截斷樣板字串·踩過） -->
        <div class="form-field" id="tf-riskissue-wrap">
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
        <!-- D5(b)：任務層「備註」欄已移除，內容一次性併進上方「進度／狀況說明」(reportNote·migration taskNoteMergeReportNote_v1)。
             原因：note 全站零下游（只有表單自己讀寫），reportNote 才有真消費者（報表精靈的 PPT／Excel 說明欄）；
             兩個都留＝叫使用者猜該打哪一格。Excel「備註」欄標題不動、改對應到 reportNote，round-trip 不破（規則18）。 -->
      </div>
    </div>
    </div>
  `};App._TF_STMAP={pending:["未開始","st-pending"],wip:["進行中","st-wip"],done:["已完成","st-done"],hold:["擱置中","st-hold"]};App._deriveStatus=function(actualStart,actualEnd,held,prevStatus){if(actualEnd)return"done";if(held)return"hold";if(actualStart)return"wip";if(prevStatus==="done")return"done";if(prevStatus==="wip")return"wip";return"pending"};App._tfSyncStatus=function(){const chip=document.getElementById("tf-stchip");if(!chip)return;const held=!!(document.getElementById("tf-hold")||{}).checked;const aS=(document.getElementById("tf-actualStart")||{}).value||"";const aE=(document.getElementById("tf-actualEnd")||{}).value||"";const st=App._deriveStatus(aS,aE,held,chip.dataset.prev||"");const m=App._TF_STMAP[st]||App._TF_STMAP.pending;chip.className="tf-stchip "+m[1];chip.textContent="● "+m[0];const hr=document.getElementById("tf-holdreason-wrap");if(hr)hr.style.display=held?"":"none";const dr=document.getElementById("tf-delayreason-wrap");if(dr){const endV=(document.getElementById("tf-end")||{}).value||"";const hasVal=((document.getElementById("tf-delayReason")||{}).value||"").trim();const overdue=st!=="done"&&st!=="hold"&&endV&&endV<D.fmt(D.today(),"iso");dr.style.display=overdue||hasVal?"":"none"}};App._tfEffortMode=function(){const dw=document.getElementById("tf-net-days-wrap"),pw=document.getElementById("tf-net-pct-wrap");const lb=document.getElementById("tf-net-label"),sw=document.getElementById("tf-net-swap");if(!dw||!pw)return;const toPct=dw.style.display!=="none";dw.style.display=toPct?"none":"";pw.style.display=toPct?"":"none";if(lb)lb.textContent=toPct?"每日投入程度":"這段期間實際會動工幾天";if(sw)sw.textContent=toPct?"改用天數填":"改用百分比填";if(toPct){const inp=document.getElementById("tf-netdays");if(inp)inp.value=""}else{const inp=document.getElementById("tf-netdays");if(inp)inp.focus()}App._tfNetConv()};App._tfNetConv=function(){const conv=document.getElementById("tf-net-conv");if(!conv)return;const warn=document.getElementById("tf-net-warn");const inp=document.getElementById("tf-netdays"),effSel=document.getElementById("tf-effort");const dw=document.getElementById("tf-net-days-wrap");const pctMode=dw?dw.style.display==="none":false;const daily=DATA.settings&&DATA.settings.dailyHours||6;const durEl=document.getElementById("tf-duration");const span=durEl?parseFloat(durEl.value):0;const nd=inp?parseFloat(inp.value):NaN;const effRaw=effSel?parseInt(effSel.value,10):NaN;const num=x=>Math.round(x*100)/100;const pctTxt=p2=>(Math.abs(p2-Math.round(p2))<.005?" <b>":"約 <b>")+Math.round(p2)+"%</b>";if(warn)warn.style.display="none";if(!(span>0)){conv.innerHTML="填了工期就會在這裡算出「每天投入幾成、估計幾小時」。";return}if(pctMode){const p2=isNaN(effRaw)?100:effRaw;if(p2===0){conv.innerHTML="每天 <b>0%</b> ＝ 這件事不計入資源負荷（認證、等待類任務用）。";return}const days=num(span*p2/100);conv.innerHTML="＝ 工期 <b>"+num(span)+"</b> 天中約 <b>"+days+"</b> 天　·　估計工時 <b>"+num(days*daily)+"h</b>";return}if(!(nd>0)){const p2=isNaN(effRaw)?100:effRaw;if(p2===0){conv.innerHTML="預設 ＝ 每天 <b>0%</b>（不計入資源負荷）。";return}if(p2===100){conv.innerHTML="預設 ＝ 工期 <b>"+num(span)+"</b> 天全做　·　每天 <b>100%</b>　·　估計工時 <b>"+num(span*daily)+"h</b>";return}const days=num(span*p2/100);conv.innerHTML="預設 ＝ 每天 <b>"+p2+"%</b>（工期 "+num(span)+" 天中約 <b>"+days+"</b> 天）　·　估計工時 <b>"+num(days*daily)+"h</b>";return}const p=nd/span*100;conv.innerHTML="工期 <b>"+num(span)+"</b> 天中實做 <b>"+num(nd)+"</b> 天　→　每天"+pctTxt(p)+"　·　估計工時 <b>"+num(nd*daily)+"h</b>";if(warn&&nd>span){warn.style.display="";warn.innerHTML="⚠ 動工 <b>"+num(nd)+"</b> 天超過工期 <b>"+num(span)+"</b> 天 ＝ 每天要"+pctTxt(p)+"。確定是加班或多人同做嗎？"}};App._tfShotFiles=[];App._tfPasteHandler=function(e){if(!document.getElementById("tf-reportNote"))return;const items=e.clipboardData&&e.clipboardData.items||[];const files=[];for(const it of items){if(it.type&&it.type.indexOf("image/")===0){const f=it.getAsFile();if(f)files.push(f)}}if(!files.length)return;e.preventDefault();App._tfAddShots(files);U.toast("📋 已貼上截圖，按「🔍 辨識帶入」","info",{soft:true})};App._tfShotPick=function(){const i=document.getElementById("tf-shot-input");if(i)i.click()};App._tfOnShotInput=function(input){const fs=Array.from(input.files||[]);if(fs.length)App._tfAddShots(fs);input.value=""};App._tfShotDragOver=function(e){e.preventDefault();const z=document.getElementById("tf-shot");if(z)z.classList.add("drag")};App._tfShotDragLeave=function(e){const z=document.getElementById("tf-shot");if(z)z.classList.remove("drag")};App._tfShotDrop=function(e){e.preventDefault();const z=document.getElementById("tf-shot");if(z)z.classList.remove("drag");const fs=Array.from(e.dataTransfer&&e.dataTransfer.files||[]).filter(f=>f.type&&f.type.indexOf("image/")===0);if(fs.length)App._tfAddShots(fs)};App._tfAddShots=function(files){App._tfShotFiles=App._tfShotFiles||[];let pending=files.length;files.forEach(f=>{const rd=new FileReader;rd.onload=()=>{App._tfShotFiles.push(rd.result);if(--pending===0)App._tfRenderShots()};rd.onerror=()=>{if(--pending===0)App._tfRenderShots()};rd.readAsDataURL(f)})};App._tfClearShots=function(){App._tfShotFiles=[];App._tfRenderShots()};App._tfShotRm=function(i){(App._tfShotFiles||[]).splice(i,1);App._tfRenderShots()};App._tfRenderShots=function(){const box=document.getElementById("tf-shot-thumbs");if(!box)return;const fs=App._tfShotFiles||[];box.innerHTML=fs.map((u,i)=>`<span class="tf-shot-thumb"><img src="${u}" alt="截圖 ${i+1}"><i class="tf-shot-del" onclick="App._tfShotRm(${i})" title="移除">✕</i></span>`).join("")+(fs.length?`<button type="button" class="tf-shot-clear" onclick="App._tfClearShots()">清空</button>`:"")};App._tfShotRecog=async function(){const fs=App._tfShotFiles||[];if(!fs.length){U.toast("請先貼上或選擇截圖","info",{soft:true});return}if(typeof Materials==="undefined"||!Materials._aiAllowed||!Materials._aiAllowed()){App.confirmModal({title:"需要 AI 辨識",icon:"ti-key",iconBg:"--amber-l",iconColor:"--amber-ink",msg:"截圖辨識要用到 AI（Google Gemini）。請到「設定 → 資料來源」貼上金鑰（免費·約 2 分鐘·有四步教學），回來再按「辨識帶入」。"+(typeof OFFLINE_BUILD!=="undefined"&&OFFLINE_BUILD?"<br><br>離線版：可在「設定 → 資料來源」開啟「AI 辨識（選配）」並貼金鑰。":""),okText:"前往設定貼金鑰",cancelText:"取消",onConfirm:()=>{App.closeModal();if(typeof Materials!=="undefined"&&Materials._gotoAiSettings)Materials._gotoAiSettings();else if(App.showPage)App.showPage("settings")}});return}const btn=document.getElementById("tf-shot-btn");const _old=btn?btn.textContent:"";if(btn){btn.textContent="⏳ 辨識中…";btn.disabled=true}try{const prompt="這是一或多張與專案任務進度有關的截圖（可能是測試結果、量測數據、白板、簡報頁或對話紀錄）。請摘要成可直接放進「專案報告」的重點文字（繁體中文）。規則：\n1. 條列 2~6 點，每點一句、精簡但保留關鍵數字與結論。\n2. 只寫截圖看得到的內容，不要編造；看不懂就略過。\n3. 若有異常／延誤／待辦，明確點出。\n4. 回傳 { bullets: [字串] }。";const schema={type:"OBJECT",properties:{bullets:{type:"ARRAY",items:{type:"STRING"}}}};const out=await App.geminiVision(fs,prompt,schema);const bullets=(out&&out.bullets||[]).map(s=>String(s==null?"":s).trim()).filter(Boolean);if(!bullets.length){U.toast("AI 沒讀到可用內容，請換張清楚的截圖","warning",{soft:true});return}App._tfShotPreview(bullets.map(b=>"• "+b).join("\n"))}catch(e){U.toast("辨識失敗："+(e&&e.message||e),"warning")}finally{if(btn){btn.textContent=_old||"🔍 辨識帶入";btn.disabled=false}}};App._tfShotPreview=function(text){const box=document.getElementById("tf-shot-prev");if(!box)return;box.innerHTML=`<div class="tf-shot-prev-in">
      <div class="tf-shot-prev-hd">📸 AI 讀出的重點（可增刪）</div>
      <textarea id="tf-shot-prevta" class="tf-report-note">${U.esc(text)}</textarea>
      <div class="tf-shot-prev-act">
        <button type="button" class="tf-shot-prev-btn primary" onclick="App._tfShotApply('append')">＋ 附加到報告說明</button>
        <button type="button" class="tf-shot-prev-btn" onclick="App._tfShotApply('replace')">取代</button>
        <button type="button" class="tf-shot-prev-btn ghost" onclick="App._tfShotPrevClose()">丟棄</button>
      </div>
    </div>`;box.style.display=""};App._tfShotPrevClose=function(){const box=document.getElementById("tf-shot-prev");if(box){box.innerHTML="";box.style.display="none"}};App._tfShotApply=function(mode){const prev=document.getElementById("tf-shot-prevta");const add=prev?prev.value.trim():"";const ta=document.getElementById("tf-reportNote");if(ta&&add){const cur=ta.value.trim();ta.value=mode==="replace"||!cur?add:cur+"\n"+add}App._tfShotPrevClose();App._tfClearShots();U.toast("✓ 已帶入報告說明，請核對後儲存","success")};App._NETDAYS_MIN_SPAN=()=>DATA.settings&&DATA.settings.longTaskDays>0?DATA.settings.longTaskDays:5;App._promptNetDaysCalib=function(taskId){const t=(DATA.tasks||[]).find(x=>x.id===taskId);if(!t)return;const span=Number(t.durationDays)||0;const sch=getEffectiveSchedule(t)||{};const hasNet=t.netWorkDays>0;const autoWd=t.actualStart&&t.actualEnd?D.workdaysBetween(t.actualStart,t.actualEnd):0;const preset=hasNet?"actual":autoWd>0?"auto":"actual";App.openModal({title:"實際工作天數回報",body:'<div class="netcalib"><ul class="netcalib-info"><li><b>任務：</b>'+U.esc(t.name)+"</li><li><b>預期進度：</b>"+span+" 天（"+D.fmtRange(sch.start,sch.end)+"）</li>"+(autoWd>0?"<li><b>實際起訖：</b>"+D.fmtRange(t.actualStart,t.actualEnd)+"</li>":"")+'</ul><div class="netcalib-opts">'+(autoWd>0?'<label class="netcalib-opt"><input type="radio" name="netcalib-mode" value="auto"'+(preset==="auto"?" checked":"")+' onchange="App._netCalibMode()"><span>依實際起訖日自動計算（<b>'+autoWd+"</b> 個工作天）</span></label>":"")+'<label class="netcalib-opt"><input type="radio" name="netcalib-mode" value="actual"'+(preset==="actual"?" checked":"")+' onchange="App._netCalibMode()"><span>'+(autoWd>0?"中間有等待，改填：":"填寫實際工期：")+'</span><input type="number" id="netcalib-input" min="0" step="0.5" value="'+(hasNet?t.netWorkDays:"")+'" placeholder="填寫數字"'+(preset==="actual"?"":" disabled")+'><span class="netcalib-unit">天</span></label><label class="netcalib-opt"><input type="radio" name="netcalib-mode" value="est" onchange="App._netCalibMode()"><span class="netcalib-est">跟預估一樣（'+span+' 天）</span></label></div><div class="netcalib-feel"><span class="netcalib-feel-lbl">主觀感受：</span><label class="netcalib-feel-opt"><input type="radio" name="netcalib-feel" value="lighter"'+(t.calibFeel==="lighter"?" checked":"")+'><span>比預估輕</span></label><label class="netcalib-feel-opt"><input type="radio" name="netcalib-feel" value="asExpected"'+(t.calibFeel==="asExpected"?" checked":"")+'><span>差不多</span></label><label class="netcalib-feel-opt"><input type="radio" name="netcalib-feel" value="heavier"'+(t.calibFeel==="heavier"?" checked":"")+'><span>比預估重</span></label></div><div class="netcalib-desc">💡 這個數字用來算你的工時負荷，也讓系統比對「估的」與「實際的」差多少，之後排程才會越估越準。<br>系統只知道你從哪天做到哪天，<b>不知道中間有沒有在等料</b>——真的有等待再改小即可。（無法評估可先取消）</div></div>',footer:`<button class="tb-action ghost" onclick="App.closeModal()">取消</button><button class="tb-action" onclick="App._netDaysCalibOk('`+t.id+`')">確認更新</button>`});setTimeout(()=>{App._netCalibMode()},50)};App._netCalibMode=function(){const actual=document.querySelector('input[name="netcalib-mode"][value="actual"]');const inp=document.getElementById("netcalib-input");if(!inp)return;const on=!!(actual&&actual.checked);inp.disabled=!on;if(on){inp.focus();if(inp.select)inp.select()}};App._netDaysCalibOk=function(taskId){const t=(DATA.tasks||[]).find(x=>x.id===taskId);const mode=(document.querySelector('input[name="netcalib-mode"]:checked')||{}).value;let n;if(mode==="actual"){const i=document.getElementById("netcalib-input");n=i?parseFloat(i.value):NaN}else if(mode==="auto"){n=t&&t.actualStart&&t.actualEnd?D.workdaysBetween(t.actualStart,t.actualEnd):0}else{n=Number(t&&t.durationDays)||0}App.closeModal();const feel=(document.querySelector('input[name="netcalib-feel"]:checked')||{}).value||"";if(t&&n>0){t.netWorkDays=n;t.calibSrc=mode==="actual"?"manual":mode==="auto"?"auto":"est";if(feel)t.calibFeel=feel;Store.tasks.save();App.refreshAll();U.toast("已記錄實際淨工作天："+n+" 天","success")}};App.openNewTaskDialog=function(projId){this.openModal({title:"新增任務",body:App.buildTaskFormHtml({project:projId,start:D.fmt(D.today(),"iso")},"new"),footer:`
      <button class="tb-action ghost" onclick="App.closeModal()">取消</button>
      <button class="tb-action" data-edit-hide onclick="App.saveNewTask('${projId}')">建立任務</button>
    `});App.bindTaskTimeListeners();setTimeout(()=>{const nameField=document.getElementById("tf-name");if(nameField)nameField.focus()},50)};App.openHoursTaskDialog=function(){this.openModal({title:"新增小時 Task",body:App.buildTaskFormHtml({start:D.fmt(D.today(),"iso")},"new","hours"),footer:`<button class="tb-action ghost" onclick="App.closeModal()">取消</button>
             <button class="tb-action" data-edit-hide onclick="App.saveNewTask()">建立任務</button>`});App.bindTaskTimeListeners();setTimeout(()=>{const n=document.getElementById("tf-name");if(n)n.focus()},50)};App.saveNewTask=function(projId,_skipNegCheck){if(App._roGuard())return;const _miss=App._markTaskRequired([{id:"tf-project",name:"專案"},{id:"tf-name",name:"任務名稱"},{id:"tf-owner",name:"負責人"},{id:"tf-stage",name:"階段"}]);if(_miss.length){U.toast("⚠ 請填必填欄位："+_miss.join("、"),"warning");return}const name=document.getElementById("tf-name").value.trim();const _aS=(document.getElementById("tf-actualStart")||{}).value||"";const _aE=(document.getElementById("tf-actualEnd")||{}).value||"";const _held=!!(document.getElementById("tf-hold")||{}).checked;const _nd=parseFloat((document.getElementById("tf-netdays")||{}).value);const status=App._deriveStatus(_aS,_aE,_held,"");const startField=App.readStartField();const _negStart=App.readEffStart();const _pEnd=document.getElementById("tf-end").value;const _taskTypeV=document.getElementById("tf-taskType").value;if(!_skipNegCheck&&_taskTypeV!=="milestone"&&_negStart&&_pEnd&&_pEnd<_negStart){App.confirmModal({title:"工期為負數",msg:"預計完成日早於開始日（工期為負數），確認要這樣修改嗎？系統會照您輸入儲存。",okText:"確認儲存",cancelText:"取消",onConfirm:()=>App.saveNewTask(projId,true)});return}const task={id:U.id(),project:document.getElementById("tf-project").value||projId,name,desc:"",owner:document.getElementById("tf-owner").value.trim(),dept:document.querySelector(".task-form").dataset.measure==="hours"?(document.getElementById("tf-dept")||{}).value||"":"",category:"deep",taskType:document.getElementById("tf-taskType").value,stage:document.getElementById("tf-stage").value.trim(),subgroup:"",urgency:document.getElementById("tf-urgency").value,status,actualStart:_aS,actualEnd:_aE,holdReason:_held?((document.getElementById("tf-holdReason")||{}).value||"").trim():"",netWorkDays:_nd>0?_nd:void 0,start:startField.start,startMode:startField.startMode,estHours:(document.querySelector(".task-form").dataset.measure||"duration")==="hours"?parseFloat(document.getElementById("tf-hours").value)||1:null,effortRatio:(()=>{const _v=parseInt((document.getElementById("tf-effort")||{}).value,10);return isNaN(_v)?100:_v})(),predecessor:App.serializePredecessors(),wbs:"",durationDays:App.readDurationField(),measureType:document.querySelector(".task-form").dataset.measure||"duration",scheduledStart:"",scheduledEnd:"",parentWbsId:"",method:"",riskIssue:document.getElementById("tf-riskIssue").value.trim(),deliverable:document.getElementById("tf-deliverable").value.trim(),deliverableLink:document.getElementById("tf-deliverableLink").value.trim(),deliverableType:"",requiredTask:true,mustIssue:false,reportNote:((document.getElementById("tf-reportNote")||{}).value||"").trim(),delayReason:((document.getElementById("tf-delayReason")||{}).value||"").trim(),canSplit:true,scheduleToCalendar:false,completedAt:status==="done"?new Date().toISOString():null,createdAt:new Date().toISOString()};if(App._insertAfterId){if(!task.predecessor)task.predecessor=App._insertAfterId+"#FS";const _i=DATA.tasks.findIndex(x=>x.id===App._insertAfterId);if(_i>=0){DATA.tasks.splice(_i+1,0,task)}else{DATA.tasks.push(task)}App._insertAfterId=null}else{DATA.tasks.push(task)}if(task.measureType==="hours"){const _ps=document.getElementById("tf-start")&&document.getElementById("tf-start").value||D.fmt(D.today(),"iso");if(!DATA.schedule||!Array.isArray(DATA.schedule.items))DATA.schedule={week:null,items:[]};const _dur=Math.max(30,Math.round((parseFloat(task.estHours)||1)*60));const _need=Math.max(1,Math.ceil(_dur/60));const _m2=s=>{const p=String(s||"").split(":");return(parseInt(p[0],10)||0)*60+(parseInt(p[1],10)||0)};const _slots=typeof App._engineSlotStarts==="function"?App._engineSlotStarts(_ps)||[]:[];const _busy=(DATA.schedule.items||[]).filter(it=>it.date===_ps).map(it=>({a:_m2(it.start),b:_m2(it.start)+(it.duration||60)})).concat((App._meetingsOn?App._meetingsOn(new Date(_ps+"T00:00:00")):[]).map(m=>({a:_m2(m.start),b:_m2(m.end||m.start)})));const _free=_slots.find(s=>{if(typeof App._hasSlotRun==="function"&&!App._hasSlotRun(_ps,s,_need))return false;const a=_m2(s),b=a+_need*60;return!_busy.some(x=>x.b>a&&x.a<b)});if(_free){DATA.schedule.items.push({taskId:task.id,date:_ps,start:_free,duration:_dur,chunk:null,totalHours:parseFloat(task.estHours)||1,week:D.weekKey(new Date(_ps)),locked:false,provisional:true})}else{U.toast("已建立。這一天的時段都排滿了（或不是上班日），按一下工作台的「智慧排程」就會替它找位置。","info",{duration:7e3})}}const _snap=App._schedSnap();const _sch=applySchedule(DATA.tasks,"full");const _blocked=_sch.skipped.filter(s=>!String(s.reason||"").startsWith("anchor"));const _pid=this.currentProjectId;if(_pid){const _proj=(DATA.projects||[]).find(p=>p.id===_pid);const _projBlocked=_blocked.filter(b=>(DATA.tasks.find(t=>t.id===b.id)||{}).project===_pid);if(_projBlocked.length){U.toast("⚠️【"+(_proj&&_proj.name||"本專案")+"】"+_projBlocked.length+" 筆任務無法排程（循環或缺前置）","warning")}}App._schedReport(_snap,task.id);Store.tasks.save();Store.schedule.save();this.closeModal();this.refreshAll();U.toast(`✓ 已新增「${name}」`)};App.openTaskInProject=function(id){const task=DATA.tasks.find(t=>t.id===id);if(!task){U.toast("⚠ 找不到任務","warning");return}this.currentProjectId=task.project;const btn=document.querySelector(`.sb-proj[onclick*="${task.project}"]`);this.showPage("project",btn);setTimeout(()=>{this.openTaskModal(id)},100)};App.openTaskModal=function(id){const t=DATA.tasks.find(x=>x.id===id);if(!t)return;const proj=this.getProj(t.project);const currentWeekBadge=t.currentWeek&&t.status!=="done"?`<span style="display:inline-block; margin-left:8px; padding:2px 8px; background:var(--terracotta-l); color:var(--terracotta); border-radius:10px; font-size:11px; font-weight:600;">${U.esc(t.currentWeek)} <span style="color:var(--terracotta);">⁂</span></span>`:t.currentWeek?`<span style="display:inline-block; margin-left:8px; padding:2px 8px; background:var(--sage-50); color:var(--sage-700); border-radius:10px; font-size:11px; font-weight:600;">${U.esc(t.currentWeek)} ✓</span>`:"";const history=t.history||[];let historyHtml="";if(history.length>0){const rows=history.map(h=>{const statusColor=h.status?.includes("完成")?"var(--sage-700)":h.status?.includes("延遲")?"var(--terracotta)":"var(--ink2)";return`<tr>
        <td class="col-num" style="font-family:var(--mono); font-size:10.5px; color:var(--ink3);">${U.esc(h.week||"")}</td>
        <td class="col-num" style="color:${statusColor};">${U.esc(h.status||"")}</td>
        <td class="col-flex col-wrap" style="line-height:1.4;">${U.esc(h.work||"—")}</td>
        <td class="col-mid col-wrap" style="font-family:var(--mono); font-size:10.5px; color:var(--ink3);">${h.planEnd||"—"}${h.planEndOriginal&&h.planEndOriginal!==h.planEnd?'<br><span style="color:var(--ink4); font-size:10px;">原:'+h.planEndOriginal+"</span>":""}</td>
        <td class="col-mid" style="font-family:var(--mono); font-size:10.5px; color:${h.actualEnd?"var(--sage-700)":"var(--ink3)"};">${h.actualEnd||"—"}</td>
        <td class="col-mid" style="color:var(--terracotta); font-size:11px;" title="${U.esc(h.delayReason||"")}">${U.esc(h.delayReason||"")}</td>
      </tr>`}).join("");historyHtml=`
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
    `}this.openModal({title:`編輯任務 ${currentWeekBadge}`,body:App.buildTaskFormHtml(t,"edit",t.measureType==="hours"?"hours":"duration")+`${historyHtml}`,footer:`
      <button class="tb-action danger" data-edit-hide onclick="App.deleteTask('${t.id}')" style="margin-right:auto;">刪除任務</button>
      <button class="tb-action ghost" onclick="App.closeModal()">取消</button>
      <button class="tb-action" data-edit-hide onclick="App.saveTask('${t.id}')">儲存</button>
    `});App.bindTaskTimeListeners()};App.saveTask=function(id,_skipNegCheck){if(App._roGuard())return;const t=DATA.tasks.find(x=>x.id===id);if(!t)return;if(App._bomGuard(t.project))return;const _req=[{id:"tf-name",name:"任務名稱"}];if(!t.certGroup)_req.push({id:"tf-owner",name:"負責人"},{id:"tf-stage",name:"階段"});const _miss=App._markTaskRequired(_req);if(_miss.length){U.toast("⚠ 請填必填欄位："+_miss.join("、"),"warning");return}const name=document.getElementById("tf-name").value.trim();const _negStart=App.readEffStart();const _pEnd=document.getElementById("tf-end").value;const _taskTypeV=document.getElementById("tf-taskType").value;if(!_skipNegCheck&&_taskTypeV!=="milestone"&&_negStart&&_pEnd&&_pEnd<_negStart){App.confirmModal({title:"工期為負數",msg:"預計完成日早於開始日（工期為負數），確認要這樣修改嗎？系統會照您輸入儲存。",okText:"確認儲存",cancelText:"取消",onConfirm:()=>App.saveTask(id,true)});return}const _aS=document.getElementById("tf-actualStart").value;const _aE=document.getElementById("tf-actualEnd").value;if(_aS&&_aE&&_aE<_aS){U.toast("⚠ 實際完成日不能早於實際開始日","warning");return}delete t._pendingNew;t.name=name;t.owner=document.getElementById("tf-owner").value.trim();t.taskType=document.getElementById("tf-taskType").value;t.stage=document.getElementById("tf-stage").value.trim();t.predecessor=App.serializePredecessors();t.durationDays=App.readDurationField();t.measureType=t.measureType||"duration";if(t.measureType==="hours"){const _de=document.getElementById("tf-dept");if(_de)t.dept=_de.value}t.urgency=document.getElementById("tf-urgency").value;{const _ef=document.getElementById("tf-effort");if(_ef&&_ef.value!==""){const _v=parseInt(_ef.value,10);const _nv=isNaN(_v)?100:_v;App._effortLogPush(t,t.effortRatio,_nv);t.effortRatio=_nv}}const startField=App.readStartField();t.start=startField.start;t.startMode=startField.startMode;if(t.startMode==="manual"){t.scheduledStart="";t.scheduledEnd=""}const _prevAE=t.actualEnd||"";t.actualStart=document.getElementById("tf-actualStart").value;t.actualEnd=document.getElementById("tf-actualEnd").value;if(t.measureType==="hours")t.estHours=parseFloat(document.getElementById("tf-hours").value)||1;t.riskIssue=document.getElementById("tf-riskIssue").value.trim();t.deliverable=document.getElementById("tf-deliverable").value.trim();t.deliverableLink=document.getElementById("tf-deliverableLink").value.trim();{const _rn=document.getElementById("tf-reportNote");if(_rn)t.reportNote=_rn.value.trim()}{const _dr=document.getElementById("tf-delayReason");if(_dr)t.delayReason=_dr.value.trim()}ensureDeliverFields(t);const _held=!!(document.getElementById("tf-hold")||{}).checked;t.holdReason=_held?((document.getElementById("tf-holdReason")||{}).value||"").trim():"";{const _nEl=document.getElementById("tf-netdays");const _nd=_nEl?parseFloat(_nEl.value):NaN;if(_nd>0)t.netWorkDays=_nd;else delete t.netWorkDays}let newStatus=App._deriveStatus(t.actualStart,t.actualEnd,_held,t.status);if(newStatus==="done"){if(t.status!=="done")t.completedAt=t.actualEnd||new Date().toISOString();t.progress=100}else{t.completedAt=null;if(t.progress===100)t.progress=0}t.status=newStatus;const _snap=App._schedSnap();const _sch=applySchedule(DATA.tasks,"full");const _blocked=_sch.skipped.filter(s=>!String(s.reason||"").startsWith("anchor"));const _pid=this.currentProjectId;if(_pid){const _proj=(DATA.projects||[]).find(p=>p.id===_pid);const _projBlocked=_blocked.filter(b=>(DATA.tasks.find(t2=>t2.id===b.id)||{}).project===_pid);if(_projBlocked.length){U.toast("⚠️【"+(_proj&&_proj.name||"本專案")+"】"+_projBlocked.length+" 筆任務無法排程（循環或缺前置）","warning")}}App._schedReport(_snap,t.id);Store.tasks.save();this.closeModal();this.refreshAll();U.toast("✓ 任務已儲存");if(t.measureType!=="hours"&&t.status==="done"&&t.actualEnd&&t.actualEnd!==_prevAE&&(Number(t.durationDays)||0)>App._NETDAYS_MIN_SPAN()){App._promptNetDaysCalib(t.id)}};App._downstreamNamesOf=function(ids){const idSet=new Set(Array.isArray(ids)?ids:[ids]);return(DATA.tasks||[]).filter(t=>!t._deleted&&!idSet.has(t.id)&&parsePredecessors(t.predecessor).some(p=>idSet.has(p.dep))).map(t=>t.name||"(未命名)")};App._downstreamConfirmNote=function(names){if(!names||!names.length)return"";const shown=names.slice(0,5).map(n=>U.esc(n)).join("、")+(names.length>5?" 等 "+names.length+" 筆":"");return"<br><br>⚠ 有 "+names.length+" 筆任務接在它後面（"+shown+"）——刪掉後它們會少一個前置、系統會立刻幫它們重排（日期可能往前移）。"};App._schedSnap=function(){const m=new Map;(DATA.tasks||[]).forEach(t=>{if(!t._deleted){const e=getEffectiveSchedule(t);m.set(t.id,e.start+"~"+e.end)}});return m};App._schedReport=function(snap,excludeId){const moved=[];(DATA.tasks||[]).forEach(t=>{if(t._deleted||t.id===excludeId||!snap.has(t.id))return;const e=getEffectiveSchedule(t);if(snap.get(t.id)!==e.start+"~"+e.end)moved.push(t)});if(!moved.length)return moved;const worst=moved.map(t=>{const b=snap.get(t.id).split("~")[0],a=getEffectiveSchedule(t).start;const d=b&&a?Math.round((new Date(a)-new Date(b))/864e5):0;return{n:t.name||"(未命名)",d}}).sort((x,y)=>Math.abs(y.d)-Math.abs(x.d));U.toast("📅 連動重排："+moved.length+" 筆任務的日期跟著改了（最大位移 "+U.esc(worst[0].n)+" "+(worst[0].d>0?"+":"")+worst[0].d+" 天）。不是預期的話，檢查那條前置鏈或改用手動固定開始日。","info",{duration:8e3});return moved};App._reschedAfterTrash=function(verb,mutate){applySchedule(DATA.tasks,"full");const snap=new Map;(DATA.tasks||[]).forEach(t=>{if(!t._deleted){const e=getEffectiveSchedule(t);snap.set(t.id,e.start+"~"+e.end)}});mutate();applySchedule(DATA.tasks,"full");const moved=[];(DATA.tasks||[]).forEach(t=>{if(t._deleted||!snap.has(t.id))return;const e=getEffectiveSchedule(t);if(snap.get(t.id)!==e.start+"~"+e.end)moved.push(t.name||"(未命名)")});Store.tasks.save();if(moved.length){U.toast("📅 "+verb+"後已自動重排 "+moved.length+" 筆任務："+moved.slice(0,5).map(n=>U.esc(n)).join("、")+(moved.length>5?" 等":""),"info",{duration:8e3})}return moved};App.deleteTask=function(id){if(App._roGuard())return;const _t0=DATA.tasks.find(x=>x.id===id);if(_t0&&App._bomGuard(_t0.project))return;App.confirmModal({icon:"ti-trash",iconBg:"--rose-l",iconColor:"--rose-ink",title:"刪除任務？",msg:"刪除的任務會移到專案下方「🗑 已刪除」區塊保留 14 天，期間可隨時還原。"+App._downstreamConfirmNote(App._downstreamNamesOf(id)),okText:"刪除",cancelText:"取消",okClass:"danger",onConfirm:()=>{const t=DATA.tasks.find(x=>x.id===id);if(!t)return;App._reschedAfterTrash("刪除",()=>{t._deleted=true;t._deletedAt=new Date().toISOString();if(DATA.schedule&&DATA.schedule.items){DATA.schedule.items=DATA.schedule.items.filter(it=>it.taskId!==id)}Store.schedule.save()});App.closeModal();App.refreshAll();U.toast("✓ 已移到「已刪除」區塊（14 天內可還原）")}})};App.startModeOf=function(t){if(t&&(t.startMode==="manual"||t.startMode==="auto"))return t.startMode;return t&&t.start&&String(t.start).trim()?"manual":"auto"};App.readStartField=function(){const el=document.getElementById("tf-start");if(!el)return{startMode:"auto",start:""};const form=document.querySelector(".task-form");if(form&&form.dataset.measure==="hours"){const v=el.value||"";return{startMode:"manual",start:v}}if(el.dataset.autostart==="1")return{startMode:"auto",start:""};const val=el.value||"";return{startMode:val?"manual":"auto",start:val}};App.readEffStart=function(){const manual=(document.getElementById("tf-start")||{}).value||"";if(manual)return manual;return(document.getElementById("tf-effstart")||{}).value||""};App.readDurationField=function(){const start=App.readEffStart();const endVal=(document.getElementById("tf-end")||{}).value||"";const durRaw=parseFloat((document.getElementById("tf-duration")||{}).value);const taskType=(document.getElementById("tf-taskType")||{}).value;if(taskType==="milestone")return 1;if(start&&endVal)return D.deriveDurationFromEnd(start,endVal);return isNaN(durRaw)?1:durRaw};App.recalcTaskTimeFields=function(){const startEl=document.getElementById("tf-start");const durEl=document.getElementById("tf-duration");const endEl=document.getElementById("tf-end");if(!durEl||!endEl)return;const start=App.readEffStart();if(!start)return;const dur=parseFloat(durEl.value);if(isNaN(dur))return;endEl.value=D.fmt(D.addWorkdays(start,dur-1),"iso")};App.bindTaskTimeListeners=function(){App._tfShotFiles=[];if(App._tfRenderShots)App._tfRenderShots();if(!App._tfPasteBound){App._tfPasteBound=true;document.addEventListener("paste",App._tfPasteHandler)}if(App._tfNetConv)App._tfNetConv();if(App._taskTimeDelegated)return;App._taskTimeDelegated=true;const f=e=>{const id=e.target&&e.target.id;if(e.target&&e.target.classList)e.target.classList.remove("tf-invalid");if(id==="tf-start"&&e.target.dataset)delete e.target.dataset.autostart;if(id==="tf-duration"||id==="tf-start")App.recalcTaskTimeFields();if(id==="tf-duration"||id==="tf-end"||id==="tf-start"){if(App._tfNetConv)App._tfNetConv()}};document.addEventListener("input",f);document.addEventListener("change",f)};App._markTaskRequired=function(reqs){const missing=[];reqs.forEach(r=>{const e=document.getElementById(r.id);if(!e)return;const empty=!(e.value||"").trim();e.classList.toggle("tf-invalid",empty);if(empty)missing.push(r.name)});return missing};
