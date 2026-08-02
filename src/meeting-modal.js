/*! PM-Core (c) 2026 Paul Hsu. All Rights Reserved. Proprietary — see LICENSE. */
App.openMeetingModal=function(){App.shotFiles=[];App.openModal({title:"📅 會議時程設定",body:App.buildMeetingModalBody(),footer:'<button class="tb-action" onclick="App.closeModal()" style="background:var(--surface2); color:var(--ink2);">關閉</button>',wide:true});if(!App._meetingPasteBound){App._meetingPasteBound=true;document.addEventListener("paste",App._meetingPasteHandler)}};App._meetingPasteHandler=function(e){const _ov=document.getElementById("modalOverlay");if(!document.getElementById("meetingModalBody")||!_ov||!_ov.classList.contains("open"))return;const items=e.clipboardData&&e.clipboardData.items||[];const files=[];for(const it of items){if(it.type&&it.type.indexOf("image/")===0){const f=it.getAsFile();if(f)files.push(f)}}if(!files.length)return;e.preventDefault();App.showMeetingAddView();const shot=document.getElementById("am-shot"),manual=document.getElementById("am-manual");if(shot&&manual){shot.style.display="";manual.style.display="none";document.querySelectorAll("#meetingModalBody .am-tab").forEach(b=>b.classList.toggle("active",/截圖/.test(b.textContent)))}App.handleShotUpload(files);U.toast("📋 已貼上截圖，按「🪄 一次解析全部」辨識","info")};App._meetingDeptOptions=function(sel){const pool=[...new Set((DATA.projects||[]).flatMap(p=>(p.depts||[]).map(d=>(d.name||"").trim())).filter(Boolean))];const cur=sel||"";let html=`<option value=""${cur===""?" selected":""}>未指派</option>`;html+=pool.map(n=>`<option value="${U.esc(n)}"${cur===n?" selected":""}>${U.esc(n)}</option>`).join("");html+=`<option value="__ALL__"${cur==="__ALL__"?" selected":""}>★ 全體均攤（跨部門）</option>`;return html};App.buildMeetingModalBody=function(){return`<div id="meetingModalBody">
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

      <div style="display:flex; align-items:center; justify-content:space-between; margin:16px 0 8px;">
        <div style="font-size:13px; font-weight:600; color:var(--ink2);">🗓 單次事件（截圖辨識／單次加入）</div>
      </div>
      <div id="onceMeetingList" style="border:1px solid var(--rule); border-radius:8px; overflow:hidden; max-height:240px; overflow-y:auto;">${App.buildOnceMeetingsHtml()}</div>
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
            <input type="date" id="mDate" value="${D.fmt(D.today(),"iso")}">
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
            <input type="text" id="mOwner" value="${U.esc(DATA.settings.userName||"")}">
          </div>
          <div class="form-field">
            <label>部門（負載分流）</label>
            <select id="mDept">${App._meetingDeptOptions("")}</select>
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
  </div>`};App._refreshMeetingUI=function(){if(typeof Workspace.render==="function")Workspace.render();const mb=document.querySelector("#modal .modal-body");if(mb&&document.getElementById("meetingModalBody"))mb.innerHTML=App.buildMeetingModalBody()};App.switchAmTab=function(btn,name){btn.parentElement.querySelectorAll(".am-tab").forEach(b=>b.classList.remove("active"));btn.classList.add("active");["shot","manual"].forEach(n=>{const el=document.getElementById("am-"+n);if(el)el.style.display=n===name?"":"none"})};App.showMeetingAddView=function(){const home=document.getElementById("am-home"),add=document.getElementById("am-add");if(home)home.style.display="none";if(add)add.style.display=""};App.showMeetingManageView=function(){const home=document.getElementById("am-home"),add=document.getElementById("am-add");if(add)add.style.display="none";if(home)home.style.display=""};App._toggleMcatLabel=function(){const row=document.getElementById("mCatLabelRow");if(row)row.style.display=(document.getElementById("mCat")||{}).value==="cleaning"?"":"none"};App.addManualMeeting=function(){if(App._roGuard())return;const freq=(document.getElementById("mFreq")||{}).value||"once";const cat=(document.getElementById("mCat")||{}).value||"meeting";const catLabelRaw=((document.getElementById("mCatLabel")||{}).value||"").trim();const catLabel=cat==="cleaning"?catLabelRaw||"雜項":"";const dateStr=(document.getElementById("mDate")||{}).value||D.fmt(D.today(),"iso");const start=document.getElementById("mStart").value;const end=document.getElementById("mEnd").value;const title=document.getElementById("mTitle").value.trim();if(!title){U.toast("⚠ 請填主題","warning");return}const owner=((document.getElementById("mOwner")||{}).value||"").trim();const dept=(document.getElementById("mDept")||{}).value||"";const dayNum=new Date(dateStr+"T00:00:00").getDay();const fl={once:"單次",weekly:"每週",biweekly:"隔週",monthly:"每月"}[freq]||"";const doneMsg=`✓ 已加入${fl?"（"+fl+"）":""}${cat==="cleaning"?"雜項":"會議"}`;if(freq==="once"){DATA.meetings.push({id:U.id(),date:dateStr,startTime:start,endTime:end,title,category:cat,categoryLabel:catLabel,owner,dept});Store.meetings.save();App._refreshMeetingUI();U.toast(doneMsg,"success");return}App._reopenMeetingManage=true;const _p={title,category:cat,categoryLabel:catLabel,frequency:freq,day:dayNum,start,end,startDate:dateStr,endDate:"",owner,dept,_doneToast:doneMsg};if(App._mtMonthlyGate("",_p))return;App._commitRecurringMeeting("",_p)};
