/*! PM-Core (c) 2026 Paul Hsu. All Rights Reserved. Proprietary — see LICENSE. */
App.toggleBulkEdit=function(projId){this._bulkMode=this._bulkMode||{};this._bulkSel=this._bulkSel||{};this._bulkMode[projId]=!this._bulkMode[projId];if(!this._bulkMode[projId])delete this._bulkSel[projId];this.renderProject()};App._bulkSelOf=function(projId){this._bulkSel=this._bulkSel||{};return this._bulkSel[projId]=this._bulkSel[projId]||new Set};App._bulkToggle=function(projId,taskId,checked){const sel=this._bulkSelOf(projId);if(checked)sel.add(taskId);else sel.delete(taskId);const n=document.getElementById("bulk-count");if(n)n.textContent=sel.size};App._bulkSelectAll=function(projId,checked){const sel=this._bulkSelOf(projId);document.querySelectorAll("input.bulk-chk").forEach(cb=>{cb.checked=checked;const row=cb.closest("tr");const id=row?row.getAttribute("data-taskid"):null;if(!id)return;if(checked)sel.add(id);else sel.delete(id)});const n=document.getElementById("bulk-count");if(n)n.textContent=sel.size};App._bulkBarHtml=function(proj){const sel=this._bulkSelOf(proj.id);return`<div class="bulk-bar">
    <span class="bulk-info">已選 <b id="bulk-count">${sel.size}</b> 筆</span>
    <span class="bulk-hint">勾選下方任務列，再按「編輯已選」一次修改多筆</span>
    <button class="tb-action" onclick="App._bulkOpenModal('${proj.id}')" style="margin-left:auto;">✏ 編輯已選</button>
    ${proj.ecnType?"":`<button class="tb-action danger" onclick="App._bulkDelete('${proj.id}')">批量刪除</button>`}
  </div>`};App._bulkOpenModal=function(projId){const sel=this._bulkSelOf(projId);if(!sel.size){U.toast("⚠ 請先勾選任務","warning");return}const proj=this.getProj(projId);if(!proj)return;const ecn=!!proj.ecnType;const KEEP='<option value="__keep__" selected>— 不變更 —</option>';const owners=[...new Set(DATA.tasks.filter(t=>t.project===projId&&!t._deleted&&t.owner).map(t=>t.owner))].sort((a,b)=>a.localeCompare(b,"zh-Hant"));const tiers=App._EFFORT_TIERS.map(o=>`<option value="${o.v}">${o.v}% ${o.short}</option>`).join("");const ownerDeptRow=`
      <div class="form-row">
        <div class="form-field"><label>負責人 <span data-tip="負責人×部門|擇一批量：填了負責人會自動歸到名冊上他所屬的部門" style="cursor:help;">?</span></label>
          <input id="blk-owner" list="blk-own-dl" placeholder="不變更（留空）" oninput="App._bulkOwnerDeptExcl('owner')"><datalist id="blk-own-dl">${owners.map(o=>`<option value="${U.esc(o)}"></option>`).join("")}</datalist>
        </div>
        <div class="form-field"><label>部門 <span data-tip="負責人×部門|擇一批量：選了部門會自動帶該部門名冊負責人" style="cursor:help;">?</span></label>
          <select id="blk-dept" onchange="App._bulkOwnerDeptExcl('dept')">${KEEP}${ecn?"":'<option value="">未指派</option>'}${(proj.depts||[]).map(d=>`<option value="${d.id}">${U.esc(d.name)}</option>`).join("")}</select>
        </div>
      </div>`;const effortField=`
        <div class="form-field"><label>投入% <span data-tip="投入%|這件事吃掉某人一天的百分比；同一人同一天相加 >100% 就爆單" style="cursor:help;">?</span></label>
          <select id="blk-effort">${KEEP}${tiers}</select>
        </div>`;const npiRows=`
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
      </div>`;const ecnRows=`
      ${ownerDeptRow}
      <div class="form-row">
        ${effortField}
        <div class="form-field"></div>
      </div>`;this.openModal({title:`批量編輯（已選 ${sel.size} 筆）`,body:`<div class="task-form">
      ${ecn?ecnRows:npiRows}
      <div class="field-hint">留空或「不變更」的欄位不會動到任務。<b>負責人與部門擇一批量</b>（互相連動，避免指派衝突）。日期／工期／前置不支援批量（會連動整批重排），請逐筆調整。</div>
    </div>`,footer:`
      <button class="tb-action ghost" onclick="App.closeModal()">取消</button>
      <button class="tb-action" onclick="App._bulkApplyFromModal('${projId}')">套用到 ${sel.size} 筆</button>
    `})};App._bulkOwnerDeptExcl=function(which){const owner=document.getElementById("blk-owner");const dept=document.getElementById("blk-dept");if(!owner||!dept)return;if(which==="dept"){const on=dept.value!=="__keep__";if(on)owner.value="";owner.disabled=on}else{const on=!!owner.value.trim();if(on)dept.value="__keep__";dept.disabled=on}};App._bulkApplyFromModal=function(projId){if(App._roGuard())return;const proj=this.getProj(projId);if(!proj)return;const ecn=!!proj.ecnType;const sel=this._bulkSelOf(projId);const v=id=>{const e=document.getElementById(id);return e?e.value:"__keep__"};const txt=id=>{const e=document.getElementById(id);return e?e.value.trim():""};const _deptVal=(t,d)=>t&&t.measureType==="hours"?d.name||"":d.id;const ops=[];if(txt("blk-stage"))ops.push(["階段",t=>t.stage=txt("blk-stage")]);if(txt("blk-subgroup"))ops.push(["子群組",t=>t.subgroup=txt("blk-subgroup")]);if(txt("blk-owner"))ops.push(["負責人",t=>{const name=txt("blk-owner");t.owner=name;const d=(proj.depts||[]).find(dp=>(dp.members||[]).some(m=>m.name===name));if(d){t.dept=_deptVal(t,d);if(ecn)t.role=d.name}}]);if(v("blk-dept")!=="__keep__")ops.push(["部門",t=>{const dId=v("blk-dept");const d=(proj.depts||[]).find(dp=>dp.id===dId);t.dept=d?_deptVal(t,d):dId;if(ecn&&d)t.role=d.name;if(d&&!(d.members||[]).some(m=>m.name===t.owner)){const fm=(d.members||[]).find(m=>m.name);t.owner=fm?fm.name:""}}]);if(v("blk-urgency")!=="__keep__")ops.push(["緊急程度",t=>t.urgency=v("blk-urgency")]);if(v("blk-status")!=="__keep__")ops.push(["狀態",t=>{const s=v("blk-status");if(s==="pending"){delete t.actualStart;delete t.actualEnd;t.completedAt=null;if(t.progress)t.progress=0}else if(s==="wip"){if(!t.actualStart)t.actualStart=D.fmt(D.today(),"iso");delete t.actualEnd;t.completedAt=null;if(t.progress===100)t.progress=0}t.status=s}]);if(v("blk-effort")!=="__keep__")ops.push(["投入%",t=>{App._effortLogPush(t,t.effortRatio,parseInt(v("blk-effort"),10)||0);t.effortRatio=parseInt(v("blk-effort"),10)||0}]);if(v("blk-deliver")!=="__keep__")ops.push(["需交付",t=>t.mustDeliver=v("blk-deliver")==="1"]);if(!ops.length){U.toast("⚠ 沒有要變更的欄位（全部維持不變更）","warning");return}let n=0;sel.forEach(id=>{const t=DATA.tasks.find(x=>x.id===id);if(!t||t._deleted||t.status==="done")return;ops.forEach(([,set])=>set(t));n++});Store.tasks.save();this.closeModal();this.renderProject();U.toast(`已套用 ${ops.map(o=>o[0]).join("、")} 到 ${n} 筆`,"success")};App._bulkDelete=function(projId){if(App._roGuard())return;const sel=this._bulkSelOf(projId);if(!sel.size){U.toast("⚠ 請先勾選任務","warning");return}App.confirmModal({icon:"ti-trash",iconBg:"--rose-l",iconColor:"--rose-ink",title:`批量刪除 ${sel.size} 筆任務？`,msg:"刪除的任務會移到專案下方「🗑 已刪除」區塊保留 14 天，期間可隨時還原。"+App._downstreamConfirmNote(App._downstreamNamesOf([...sel])),okText:"刪除",cancelText:"取消",okClass:"danger",onConfirm:()=>{let n=0;App._reschedAfterTrash("刪除",()=>{sel.forEach(id=>{const t=DATA.tasks.find(x=>x.id===id);if(!t||t._deleted)return;t._deleted=true;t._deletedAt=new Date().toISOString();if(DATA.schedule&&DATA.schedule.items)DATA.schedule.items=DATA.schedule.items.filter(it=>it.taskId!==id);n++});Store.schedule.save()});sel.clear();App.renderProject();U.toast(`已刪除 ${n} 筆（可在已刪除區還原）`,"success")}})};App.restoreTask=function(id){const t=DATA.tasks.find(x=>x.id===id);if(!t)return;App._reschedAfterTrash("還原",()=>{delete t._deleted;delete t._deletedAt});this.refreshAll();U.toast("↺ 已還原");if(t.measureType==="hours"){U.toast("這是時段任務：它在週曆上的時段（含你手動固定過的位置）刪除時已經釋放——按一次工作台的「智慧排程」就會重新排回週曆。","warning",{duration:8e3})}};App.permanentDeleteTask=function(id){App.confirmModal({icon:"ti-alert-triangle",iconBg:"--rose-l",iconColor:"--rose-ink",title:"永久刪除？",msg:"此操作無法復原。",okText:"永久刪除",cancelText:"取消",okClass:"danger",onConfirm:()=>{DATA.tasks=DATA.tasks.filter(t=>t.id!==id);if(DATA.schedule&&DATA.schedule.items){DATA.schedule.items=DATA.schedule.items.filter(it=>it.taskId!==id)}Store.tasks.save();Store.schedule.save();App.refreshAll();U.toast("🗑 已永久刪除")}})};App.cleanExpiredDeletedTasks=function(){const cutoff=D.addDays(D.today(),-14);const before=DATA.tasks.length;DATA.tasks=DATA.tasks.filter(t=>{if(!t._deleted)return true;if(t._delWithProj)return true;const delDate=new Date(t._deletedAt||0);return delDate>cutoff});if(before!==DATA.tasks.length){Store.tasks.save()}};
