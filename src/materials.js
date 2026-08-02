/*! PM-Core (c) 2026 Paul Hsu. All Rights Reserved. Proprietary — see LICENSE. */
const Materials={_state:{tab:"gap",view:"list",cat:"ALL",q:"",proj:"ALL",matProj:"",dqDraft:null,mgExpand:null,gapExpand:null},_CATS:["壓縮機","閥件","換熱器","馬達","電控","感測器","管件","包材","其他"],_TRACK:[["partNo","料號"],["ver","版次"],["status","狀態","Released"],["unitPrice","單價"],["leadTime","廠商交期"],["internalBuffer","內部緩衝"],["moq","MOQ"],["safetyStock","安全庫存"],["vendor","廠商"],["certStatus","認定狀態","未送"],["certVendor","認定廠商"],["certDate","認定日"]],_CERT_TRACK:{"認定狀態":1,"認定廠商":1,"認定日":1},_trackSame(nv,ov,dflt){const nz=v=>v===void 0||v===null||v===""?"":String(v);return nz(nv)===nz(ov===void 0&&dflt!==void 0?dflt:ov)},_BUF_DEF:4,_num(v){const n=Number(v);return isNaN(n)?0:n},_gapIndex(){if(this._gapIdx)return this._gapIdx;const rank=h=>h==="bad"?0:h==="warn"?1:2;const idx={};(DATA.projects||[]).filter(p=>App._isLiveProject(p)).forEach(proj=>(this._balanceFor(proj)||[]).forEach(b=>{const e=idx[b.partNo]||(idx[b.partNo]={buy:0,worst:b.worst,health:"ok",projs:0,safety:b.safety});e.buy+=this._num(b.buyQty);e.worst=Math.min(e.worst,b.worst);if(rank(b.health)<rank(e.health))e.health=b.health;e.projs++}));return this._gapIdx=idx},_gapReset(){this._gapIdx=null},_gapOf(p){return this._gapIndex()[p&&p.partNo]||null},_buyOf(p){const g=this._gapOf(p);return g?g.buy:0},_gapBar(g){const safe=this._num(g&&g.safety),cap=Math.max(safe*2,1);return{fill:Math.max(0,Math.min(100,Math.max(this._num(g&&g.worst),0)/cap*100)),safe:Math.min(100,safe/cap*100)}},_health(p){const g=this._gapOf(p);return g?g.health:"none"},_hlabel(h){return h==="bad"?"已缺":h==="warn"?"將缺":h==="none"?"無需求":"足"},_certBadge(p){const s=p&&p.certStatus||"未送";const k={"OK":"ok","NG":"ng","認定中":"ing","取消":"cancel"}[s]||"unsent";return'<span class="mat-certchip cert-'+k+'">'+this._esc(s)+"</span>"},_leadTotal(p){return this._num(p.leadTime)+(p.internalBuffer!=null?this._num(p.internalBuffer):this._BUF_DEF)},_delHistCount(p){return(p&&p.history||[]).filter(h=>!this._CERT_TRACK[h&&h.field]).length},_canDelete(p){return this._delHistCount(p)<=2},_money(n){return"$"+this._num(n).toLocaleString()},_today(){return D.fmt(D.today(),"iso")},_addDays(iso,days){if(!iso)return"";const d=new Date(iso);if(isNaN(d.getTime()))return"";d.setDate(d.getDate()+days);return d.toISOString().slice(0,10)},_daysBetween(a,b){if(!a||!b)return null;const da=new Date(a),db=new Date(b);if(isNaN(da.getTime())||isNaN(db.getTime()))return null;return Math.round((db-da)/864e5)},_esc(s){return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")},_projOptions(selId){const all=DATA.projects||[];const live=all.filter(p=>App._isLiveProject(p)),dead=all.filter(p=>!App._isLiveProject(p));const opt=p=>`<option value="${p.id}" ${selId===p.id?"selected":""}>${this._esc(p.name)}</option>`;return live.map(opt).join("")+(dead.length?`<optgroup label="已結案／封存">${dead.map(opt).join("")}</optgroup>`:"")},_filtered(){const q=this._state.q.trim().toLowerCase();let projSet=null;if(this._state.proj!=="ALL"){const proj=(DATA.projects||[]).find(p=>p.id===this._state.proj);projSet=new Set(proj?this._extractProjectMaterials(proj).map(m=>m.partNo):[])}return(DATA.parts||[]).filter(p=>{if(projSet&&!projSet.has(p.partNo))return false;if(this._state.cat!=="ALL"&&p.category!==this._state.cat)return false;if(q&&!((p.partNo||"")+(p.name||"")+(p.vendor||"")).toLowerCase().includes(q))return false;return true})},setProj(v){this._state.proj=v;this._renderBody()},render(){const page=document.getElementById("page-materials");if(!page)return;const tab=this._state.tab||"parts";const stab=(k,label)=>`<button class="mat-subtab ${tab===k?"on":""}" onclick="Materials.setTab('${k}')">${label}</button>`;page.innerHTML=`
      <div class="mat-wrap">
        <div class="mat-head">
          <h1 class="mat-title">物料分析總覽 <span class="mat-idchip">物料控管</span></h1>
          <div class="mat-subtabs">${stab("gap","缺口總表")}${stab("parts","料號主檔")}${stab("demand","需求來源")}${stab("inv","庫存異動")}${stab("mold","模具費用")}${stab("docs","單據歷史")}</div>
        </div>
        <div id="mat-tabbody"></div>
      </div>
      <div class="mat-drawer-scrim" id="mat-drawer-scrim" onclick="Materials.closeDrawer()"></div>
      <aside class="mat-drawer" id="mat-drawer"></aside>`;this._renderTab()},setTab(t){this._state.tab=t;if(t!=="demand")this._state.dqDraft=null;this.render()},_renderTab(){this._gapReset();const el=document.getElementById("mat-tabbody");if(!el)return;const tab=this._state.tab||"gap";if(tab==="gap"){el.innerHTML=this._gapHtml();return}if(tab==="demand"){el.innerHTML=this._demandHtml();return}if(tab==="inv"){el.innerHTML=this._invHtml();return}if(tab==="mold"){el.innerHTML=this._moldHtml();return}if(tab==="docs"){el.innerHTML=this._docsHtml();return}el.innerHTML=`
      <div id="mat-newbanner"></div>
      <div class="mat-kpirow" id="mat-kpirow"></div>
      <div class="mat-tbar">
        <div class="mat-search"><input type="text" placeholder="搜尋料號 / 品名 / 廠商" value="${this._esc(this._state.q)}" oninput="Materials.setSearch(this.value)"></div>
        <select class="mat-sel" onchange="Materials.setProj(this.value)" title="依專案篩選：只看該案 BOM 用到的料號">
          <option value="ALL">全部專案</option>
          ${this._projOptions(this._state.proj)}
        </select>
        <select class="mat-sel" onchange="Materials.setCat(this.value)">
          <option value="ALL">全部類別</option>
          ${this._CATS.map(c=>`<option value="${c}" ${this._state.cat===c?"selected":""}>${c}</option>`).join("")}
        </select>
        <div class="mat-seg">
          <button class="${this._state.view==="list"?"on":""}" onclick="Materials.setView('list')">清單</button>
          <button class="${this._state.view==="table"?"on":""}" onclick="Materials.setView('table')">表格</button>
        </div>
        <button class="btn-ghost" onclick="Materials.openImportPicker()">📥 從專案帶入</button>
        <button class="btn-ghost" onclick="Materials.openImporterFile()">📄 智慧匯入單據</button><!-- §20.8+PDF文字層接線 2026-07-19：離線也常駐——Excel/數位 PDF 文字層路徑零外連可用；掃描件才需 AI（離線未開選配時給白話指引·_aiAllowed 閘在流程內） -->
        <button class="btn-mat" data-edit onclick="Materials.openAdd()">＋ 新增料號</button>
      </div>
      <div id="mat-body"></div>`;this._renderBody()},_renderBody(){this._gapReset();const fp=this._filtered();const bn=document.getElementById("mat-newbanner");if(bn){const news=this._allNewProjectParts();const np=new Set;news.forEach(n=>n.projs.forEach(x=>np.add(x)));bn.innerHTML=news.length?`<div class="mat-newbn"><span class="mat-newbn-t">💡 偵測到 <b>${news.length}</b> 個全新料號（來自 ${np.size} 個專案 BOM）尚未登記至主檔</span><button class="btn-mat" onclick="Materials.importAllNewParts()">檢視並全部帶入</button></div>`:""}document.getElementById("mat-kpirow").innerHTML=this._kpiHtml(fp);document.getElementById("mat-body").innerHTML=(DATA.parts||[]).length===0?this._importHeroHtml(false):this._state.view==="list"?this._listHtml(fp):this._tableHtml(fp)},_kpiHtml(fp){const bad=fp.filter(p=>this._health(p)==="bad").length;const warn=fp.filter(p=>this._health(p)==="warn").length;const reorder=fp.filter(p=>this._buyOf(p)>0).length;const filtered=this._state.cat!=="ALL"||this._state.proj!=="ALL"||this._state.q.trim();const projName=this._state.proj!=="ALL"?((DATA.projects||[]).find(p=>p.id===this._state.proj)||{}).name:"";const cards=[{cls:"neu",k:projName?"本專案用到料號":filtered?"篩選出料號":"料號總數",v:fp.length,u:"項",sub:`共 ${(DATA.parts||[]).length} 顆`},{cls:"bad",k:"已缺料",v:bad,u:"項",sub:"有專案期末結存 < 0"},{cls:"warn",k:"將缺料",v:warn,u:"項",sub:"期末低於安全庫存"},{cls:"mat",k:"建議下單品項",v:reorder,u:"項",sub:"各專案缺口相加"}];return cards.map(c=>`<div class="mat-kpi mat-kpi-${c.cls}">
      <div class="mat-kpi-k">${c.k}</div>
      <div class="mat-kpi-v">${c.v}<small>${c.u}</small></div>
      <div class="mat-kpi-s">${c.sub}</div></div>`).join("")},_listHtml(fp){const grp=h=>fp.filter(p=>this._health(p)===h);const bad=grp("bad"),warn=grp("warn"),ok=grp("ok"),none=grp("none");const seg=(title,dot,arr,note)=>`<div class="mat-lgroup">
      <div class="mat-lgh"><span class="mat-dot ${dot}"></span>${title} <span class="mat-lgn">· ${arr.length} 項${note?" "+note:""}</span></div>
      <div class="mat-lcard">${arr.length?arr.map(p=>this._rowHtml(p)).join(""):'<div class="mat-lempty">此分類目前無料號</div>'}</div></div>`;return`<div class="mat-lgroups">
      ${seg("已缺料","bad",bad,"有專案期末結存 < 0")}
      ${seg("將缺料","warn",warn,"期末低於安全庫存")}
      ${seg("庫存充足","ok",ok,"")}
      ${none.length?seg("未納入任何專案","none",none,"目前沒有 BOM 用到它·無需求"):""}
    </div>
    <div class="mat-hint">燈號與建議下單量<b>一律來自缺口推演</b>（各專案逐階段結存·與「缺口總表」同一把尺）：<b>建議下單＝各專案缺口相加</b>（三個案各缺 8 顆就是要買 24 顆）。<b>現有庫存／在途</b>是主檔的全域參考值、<b>不進本案缺口</b>——各案可用料一律以「庫存異動→到料」為準（各案期初 0）；在途填起始值後，登記到料會自動扣掉。點任一料號展開詳情：現值、買料前置、進版履歷、刪除。</div>`},_rowHtml(p){const gp=this._gapOf(p),h=this._health(p),g=this._gapBar(gp),b=this._buyOf(p);const color=`var(--mat-h-${h})`;return`<div class="mat-row" onclick="Materials.openDrawer('${p.partId}')">
      <span class="mat-stripe ${h}"></span>
      <div class="mat-r-id">
        <div class="mat-r-pn">${this._esc(p.partNo)}${p.ver?`<span class="mat-ver">版 ${this._esc(p.ver)}</span>`:""}${p.status==="Preliminary"?'<span class="mat-prelim">樣品</span>':""}<span class="mat-catchip">${this._esc(p.category||"未分類")}</span>${p.certStatus&&p.certStatus!=="未送"?this._certBadge(p):""}</div>
        <div class="mat-r-nm">${this._esc(p.name)}</div>
        <div class="mat-r-meta">${this._esc(p.spec||"")}${p.vendor?" · "+this._esc(p.vendor):""}</div>
      </div>
      <div class="mat-r-gauge">
        <div class="mat-glab"><span>${gp?"最低期末結存":"未納入任何專案"}</span>${gp?`<b class="${gp.worst<0?"neg":""}">${gp.worst}</b>`:"<b>—</b>"}</div>
        <div class="mat-track"><div class="mat-fill" style="width:${gp?g.fill:0}%;background:${color}"></div><div class="mat-safe" style="left:${g.safe}%"></div></div>
        <div class="mat-glab mat-glab2"><span>安全 ${this._num(p.safetyStock)}${gp?" · "+gp.projs+" 案在用":""}</span><span class="mat-pill ${h}">${this._hlabel(h)}</span></div>
      </div>
      <div class="mat-r-proc"><div><span class="k">單價</span> <b>${this._money(p.unitPrice)}</b></div><div><span class="k">買料前置</span> <b>${this._leadTotal(p)}天</b></div></div>
      <div class="mat-r-buy"><div class="lb">建議下單</div><div class="v ${b>0?"pos":""}">${b>0?"+"+b:"—"}</div></div>
    </div>`},_tableHtml(fp){const rows=fp.map(p=>{const h=this._health(p),lock=!this._canDelete(p);return`<tr onclick="Materials.openDrawer('${p.partId}')">
        <td><div class="mat-t-pn"><span class="mat-dot ${h}"></span>${this._esc(p.partNo)}${p.ver?` <span class="mat-ver">版${this._esc(p.ver)}</span>`:""}</div><div class="mat-t-nm">${this._esc(p.name)}</div></td>
        <td><span class="mat-catchip">${this._esc(p.category||"未分類")}</span></td>
        <td class="r">${this._money(p.unitPrice)}</td>
        <td class="r">${this._num(p.leadTime)}<span class="u">天</span></td>
        <td class="r">${this._num(p.moq)}</td>
        <td class="r">${this._num(p.safetyStock)}</td>
        <td class="r ${this._num(p.onHand)<0?"neg":""}">${this._num(p.onHand)}</td>
        <td class="r">${this._num(p.inTransit)||"–"}</td>
        <td class="r mat-hcount ${lock?"lock":""}">${(p.history||[]).length}${lock?" 🔒":""}</td>
      </tr>`}).join("");return`<div class="mat-tcard"><div class="mat-twrap"><table class="mat-table">
      <thead><tr><th>料號 / 品名</th><th>類別</th><th class="r">單價</th><th class="r">交期</th><th class="r">MOQ</th><th class="r">安全</th><th class="r">現有</th><th class="r">在途</th><th class="r">修改</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>
      <div class="mat-tfoot">顯示 ${fp.length} 筆 · 點列展開詳情。「修改」欄＝履歷筆數，>2（🔒）代表持續維護中的正確資料、不可刪除。</div>`},setView(v){this._state.view=v;this._renderBody()},setCat(v){this._state.cat=v;this._renderBody()},setSearch(v){this._state.q=v;this._renderBody()},_formBody(p,asNew){const g=(k,v)=>this._esc(p&&p[k]!=null?p[k]:v==null?"":v);const catOpts=this._CATS.map(c=>`<option ${p&&p.category===c?"selected":""}>${c}</option>`).join("");const isEdit=!!p&&!asNew;return`<div class="mat-form">
      <div class="mat-fgrid">
        <label class="mat-fld"><span>料號 <b class="req">*</b></span><input id="mf-pn" value="${g("partNo")}" placeholder="FA000027B"${isEdit?" readonly":""}>${isEdit?'<div class="field-hint">料號是全站的識別鍵——庫存異動與各案 BOM 都靠這串字對帳，改掉會讓先前登記的到料／盤點對不回來，因此不開放修改。要換料號請關掉此視窗，用料號明細下方的「⧉ 複製為新料號」另建一筆。</div>':""}</label>
        <label class="mat-fld"><span>版次</span><input id="mf-ver" value="${g("ver")}" placeholder="A（選填·清單顯示為「版 A」）"></label>
        <label class="mat-fld"><span>品名 <b class="req">*</b></span><input id="mf-nm" value="${g("name")}" placeholder="迴轉式壓縮機"></label>
        <label class="mat-fld"><span>類別 <b class="req">*</b></span><select id="mf-cat">${catOpts}</select></label>
        <label class="mat-fld"><span>狀態</span><select id="mf-st"><option ${p&&p.status==="Preliminary"?"selected":""}>Preliminary</option><option ${!p||p.status!=="Preliminary"?"selected":""}>Released</option></select></label>
      </div>
      <div class="mat-fmore-h">採購參數／庫存起始（皆選填，可後補）</div>
      <div class="mat-fgrid">
        <label class="mat-fld"><span>規格</span><input id="mf-spec" value="${g("spec")}"></label>
        <label class="mat-fld"><span>廠商</span><input id="mf-v" value="${g("vendor")}"></label>
        <label class="mat-fld"><span>單價</span><input id="mf-price" type="number" value="${g("unitPrice")}"></label>
        <label class="mat-fld"><span>廠商交期 L/T（天）</span><input id="mf-lt" type="number" value="${g("leadTime")}"></label>
        <label class="mat-fld"><span>內部＋入庫緩衝（天·預設 4）</span><input id="mf-buf" type="number" value="${g("internalBuffer")}" placeholder="4"></label>
        <label class="mat-fld"><span>MOQ 最小訂購量</span><input id="mf-moq" type="number" value="${g("moq")}"></label>
        <label class="mat-fld"><span>安全庫存</span><input id="mf-safe" type="number" value="${g("safetyStock")}"></label>
        <label class="mat-fld"><span>現有庫存（起始）</span><input id="mf-on" type="number" value="${g("onHand")}"></label>
        <label class="mat-fld"><span>在途（起始·登記到料會自動扣）</span><input id="mf-tr" type="number" value="${g("inTransit")}"></label>
        <label class="mat-fld"><span>替代料（A換B·不同料）</span><input id="mf-alt" value="${g("alternates")}" placeholder="選填"></label>
      </div>
      <div class="mat-fmore-h">部品認定（品保承認狀態·§24.18）</div>
      <div class="mat-fgrid">
        <label class="mat-fld"><span>認定狀態</span><select id="mf-cert">${["未送","認定中","OK","NG","取消"].map(c=>`<option ${(p&&p.certStatus||"未送")===c?"selected":""}>${c}</option>`).join("")}</select></label>
        <label class="mat-fld"><span>認定日</span><input id="mf-cd" type="date" value="${g("certDate")}"></label>
        <label class="mat-fld"><span>核定廠商</span><input id="mf-cv" value="${g("certVendor")}"></label>
      </div>
      ${isEdit?`<label class="mat-fld mat-fwide"><span>本次調整原因（選填·會存進履歷）</span><input id="mf-note" placeholder="例：Q2 銅料上漲反映 / 樣品料號轉正式"></label>`:""}
    </div>`},_readForm(){const val=id=>{const el=document.getElementById(id);return el?el.value.trim():""};const numOrNull=id=>{const v=val(id);return v===""?null:Number(v)};return{partNo:val("mf-pn"),ver:val("mf-ver"),name:val("mf-nm"),category:val("mf-cat"),status:val("mf-st"),spec:val("mf-spec"),vendor:val("mf-v"),unitPrice:numOrNull("mf-price"),leadTime:numOrNull("mf-lt"),internalBuffer:numOrNull("mf-buf"),moq:numOrNull("mf-moq"),safetyStock:numOrNull("mf-safe"),onHand:numOrNull("mf-on"),inTransit:numOrNull("mf-tr"),alternates:val("mf-alt"),certStatus:val("mf-cert"),certDate:val("mf-cd"),certVendor:val("mf-cv"),note:val("mf-note")}},openAdd(){App.openModal({title:"新增料號",wide:true,body:this._formBody(null),footer:`<button class="btn-ghost" onclick="App.closeModal()">取消</button><button class="btn-mat" onclick="Materials._submit(null)">確定</button>`})},openEdit(partId){const p=Store.parts.find(partId);if(!p)return;App.closeModal();App.openModal({title:"編輯料號 · "+p.partNo,wide:true,body:this._formBody(p),footer:`<button class="btn-ghost" onclick="App.closeModal()">取消</button><button class="btn-mat" onclick="Materials._submit('${partId}')">確定</button>`})},openCopy(partId){const src=Store.parts.find(partId);if(!src)return;const seed=Object.assign({},src,{partNo:"",ver:"",status:"Released",onHand:null,inTransit:null,history:[],certStatus:"未送",certDate:"",certVendor:""});App.closeModal();App.openModal({title:"複製為新料號 · 參考 "+src.partNo,wide:true,body:this._formBody(seed,true),footer:`<button class="btn-ghost" onclick="App.closeModal()">取消</button><button class="btn-mat" onclick="Materials._submit(null)">確定新增</button>`})},_submit(partId){const f=this._readForm();if(!f.partNo||!f.name||!f.category){U.toast("料號／品名／類別為必填");return}{const _pn=String(f.partNo).trim();const _dup=(DATA.parts||[]).some(p=>p&&p.partId!==partId&&String(p.partNo||"").trim()===_pn);if(_dup){U.toast(`⚠ 料號「${_pn}」已存在於主檔，請改用不同料號（或直接編輯那一筆）`,"warning");return}}App.confirmModal({title:partId?"確定要寫入這筆變更？":"確定要新增此料號？",msg:partId?"物料資料改了無法還原先前值，變更會記進履歷、永久保留。":`新增料號「${this._esc(f.partNo)}」到料號主檔。`,okText:partId?"確認寫入":"確認新增",cancelText:"再想想",onConfirm:()=>Materials._commit(partId,f)})},_commit(partId,f){const today=this._today();if(!partId){const p={partId:U.uid("pt_"),partNo:f.partNo,name:f.name,category:f.category,status:f.status,ver:f.ver||"",spec:f.spec,vendor:f.vendor,unitPrice:f.unitPrice??0,leadTime:f.leadTime??0,internalBuffer:f.internalBuffer,moq:f.moq??0,safetyStock:f.safetyStock??0,onHand:f.onHand??0,inTransit:f.inTransit??0,alternates:f.alternates,certStatus:f.certStatus||"未送",certDate:f.certDate||"",certVendor:f.certVendor||"",history:[],createdAt:today};Store.parts.add(p);U.toast("✓ 已新增料號 "+p.partNo)}else{const p=Store.parts.find(partId);if(!p)return;const changes={};this._TRACK.forEach(([k,label,dflt])=>{const nv=f[k];const ov=p[k]===void 0&&dflt!==void 0?dflt:p[k];const same=this._trackSame(nv,p[k],dflt);if(!same){const note=f.note||(k==="status"&&ov==="Preliminary"&&nv==="Released"?"樣品/暫定料號轉正式——同一顆料件，庫存與到貨沿用不重開帳":"");(p.history=p.history||[]).push({field:label,from:ov==null||ov===""?"（空）":String(ov),to:nv==null?"（空）":String(nv),at:today,note,by:DATA.settings._role||""});changes[k]=nv}});Object.assign(p,{partNo:f.partNo,ver:f.ver||"",name:f.name,category:f.category,status:f.status,spec:f.spec,vendor:f.vendor,unitPrice:f.unitPrice??0,leadTime:f.leadTime??0,internalBuffer:f.internalBuffer,moq:f.moq??0,safetyStock:f.safetyStock??0,onHand:f.onHand??0,inTransit:f.inTransit??0,alternates:f.alternates,certStatus:f.certStatus||"未送",certDate:f.certDate||"",certVendor:f.certVendor||""});Store.parts.save();U.toast("✓ 已更新料號 · 已記入履歷")}App.closeModal();this.closeDrawer();this.render()},askDelete(partId){const p=Store.parts.find(partId);if(!p)return;const n=this._delHistCount(p);if(n>2){U.toast("🔒 已有 "+n+" 筆修改紀錄（>2）·維護中不可刪");return}App.confirmModal({title:"刪除料號 "+p.partNo+"？",msg:`此料僅 ${n} 筆修改紀錄（≤2）·可能是手誤建立。刪除後不影響其他料號。`,okText:"確認刪除",okClass:"danger",cancelText:"取消",onConfirm:()=>{Store.parts.remove(partId);U.toast("已刪除料號 "+p.partNo);Materials.closeDrawer();Materials.render()}})},openDrawer(partId){const p=Store.parts.find(partId);if(!p)return;const gp=this._gapOf(p),h=this._health(p),g=this._gapBar(gp),b=this._buyOf(p),lock=!this._canDelete(p);const frow=(k,v)=>`<div class="mat-drow"><span class="k">${k}</span><span class="v">${v}</span></div>`;const hist=p.history||[];const histHtml=hist.length?`<div class="mat-tl">${hist.slice().reverse().map(e=>`
      <div class="mat-te"><div class="mat-td"></div>
        <div class="mat-te-r"><span class="f">${this._esc(e.field)}</span><span class="v"><span class="o">${this._esc(e.from)}</span> → <span class="n">${this._esc(e.to)}</span></span><span class="d">${this._esc(e.at)}</span></div>
        ${e.note?`<div class="mat-te-note">${this._esc(e.note)}</div>`:""}${e.by?`<div class="mat-te-by">${this._esc(e.by)}</div>`:""}</div>`).join("")}</div>`:`<div class="mat-emptyk">尚無修改紀錄 — 新建立、未變更過的料號</div>`;document.getElementById("mat-drawer").innerHTML=`
      <div class="mat-dhead">
        <div class="mat-dh-top">
          <div><div class="mat-dh-pnrow"><span class="mat-dh-pn">${this._esc(p.partNo)}</span>${p.ver?`<span class="mat-ver">版 ${this._esc(p.ver)}</span>`:""}<span class="mat-pill ${h}">${h==="ok"?"庫存充足":h==="none"?"無需求":this._hlabel(h)+"料"}</span></div>
          <div class="mat-dh-nm">${this._esc(p.name)} · <span class="mat-catchip">${this._esc(p.category||"未分類")}</span> · ${this._esc(p.status||"Released")}</div></div>
          <button class="mat-dclose" onclick="Materials.closeDrawer()">✕</button>
        </div>
      </div>
      <div class="mat-dbody">
        ${p.status==="Preliminary"?`<div class="mat-prelim-banner"><span>🧪 樣品/暫定料號 — 可先跑排程與買料通知，取得正式料號後轉正（走進版·庫存共用）</span><button class="btn-ghost sm" onclick="Materials.openEdit('${p.partId}')">🔗 轉正/改料號</button></div>`:""}
        <div class="mat-dsec"><div class="mat-dsh">庫存現況</div><div class="mat-dstat">
          <div class="s"><div class="k">最低期末結存</div><div class="v ${gp&&gp.worst<0?"neg":""}">${gp?gp.worst:"—"}</div></div>
          <div class="s"><div class="k">現有庫存<span class="mat-dref">參考</span></div><div class="v ${this._num(p.onHand)<0?"neg":""}">${this._num(p.onHand)}</div></div>
          <div class="s"><div class="k">在途<span class="mat-dref">參考</span></div><div class="v">${this._num(p.inTransit)||"—"}</div></div>
          <div class="s"><div class="k">建議下單</div><div class="v" style="color:${b>0?"var(--mat)":"inherit"}">${b>0?"+"+b:"—"}</div></div>
        </div><div class="mat-track" style="height:8px;margin-top:10px"><div class="mat-fill" style="width:${gp?g.fill:0}%;height:100%;background:var(--mat-h-${h})"></div><div class="mat-safe" style="left:${g.safe}%"></div></div>
        <div class="mat-dnote">${gp?`燈號與建議下單量來自缺口推演（${gp.projs} 個專案·各案缺口相加），與「缺口總表」同一把尺。現有庫存／在途是主檔全域參考值，不進本案缺口。`:"目前沒有任何專案 BOM 用到這顆料＝無需求，因此不判缺料。"}</div></div>
        <div class="mat-dsec"><div class="mat-dsh">基本 / 採購參數 <button class="btn-ghost sm" onclick="Materials.openEdit('${p.partId}')">✎ 編輯</button></div>
          ${frow("規格",this._esc(p.spec)||"—")}
          ${frow("廠商",this._esc(p.vendor)||"—")}
          ${frow("單價",this._money(p.unitPrice))}
          ${frow("廠商交期 L/T",this._num(p.leadTime)+" 天")}
          ${frow("內部流程＋入庫緩衝",(p.internalBuffer!=null?this._num(p.internalBuffer):this._BUF_DEF)+" 天")}
          ${frow("<b>買料前置（下單死線用）</b>",`<b style="color:var(--mat)">${this._leadTotal(p)} 天</b>`)}
          ${frow("MOQ · 安全庫存",this._num(p.moq)+" · "+this._num(p.safetyStock))}
          ${frow("替代料（A換B·不同料）",p.alternates?`<span style="color:var(--mat)">${this._esc(p.alternates)}</span>`:"無")}
          ${frow("部品認定",this._certBadge(p)+(p.certVendor?" · "+this._esc(p.certVendor):"")+(p.certDate?" · "+this._esc(p.certDate):""))}
        </div>
        <div class="mat-dsec"><div class="mat-dsh">上階 · 被哪些專案/機種用到（where-used）<span class="mat-auto">自動來自 BOM</span></div>
          ${this._whereUsedHtml(p)}</div>
        <div class="mat-dsec"><div class="mat-dsh">下階 · 這顆的組成散料（BOM 展開）<span class="mat-auto">自動來自 BOM</span></div>
          ${this._childrenHtml(p)}</div>
        <div class="mat-dsec"><div class="mat-dsh">料號 / 版本 · 修改履歷（永久保留）</div>${histHtml}</div>
      </div>
      <div class="mat-dfoot">
        <button class="btn-ghost sm" onclick="Materials.openEdit('${p.partId}')">✎ 編輯料號</button>
        <button class="btn-ghost sm" onclick="Materials.openCopy('${p.partId}')">⧉ 複製為新料號</button>
        <div style="flex:1"></div>
        ${lock?`<div class="mat-lockmsg">🔒 ${this._delHistCount(p)} 筆維護紀錄（>2）· 維護中不可刪</div>`:`<button class="btn-ghost sm danger" onclick="Materials.askDelete('${p.partId}')">🗑 刪除料號</button>`}
      </div>`;document.getElementById("mat-drawer").classList.add("on");document.getElementById("mat-drawer-scrim").classList.add("on")},closeDrawer(){const d=document.getElementById("mat-drawer"),s=document.getElementById("mat-drawer-scrim");if(d)d.classList.remove("on");if(s)s.classList.remove("on")},_openImportPreview(srcName,mats,srcKind){srcKind=srcKind||"project";const data=mats.map(m=>{const ex=Store.parts.all().find(p=>p.partNo===m.partNo);let st="new";if(ex)st=this._num(ex.unitPrice)===this._num(m.price)?"same":"conf";return{pn:m.partNo,nm:m.name,qty:m.qty,price:m.price,st,master:ex?this._num(ex.unitPrice):null}});this._imp={projName:srcName,srcKind,data,checked:{},pick:{},batch:"keep"};data.forEach(d=>{this._imp.checked[d.pn]=true;if(d.st==="conf")this._imp.pick[d.pn]="master"});App.closeModal();const priceHd=srcKind==="excel"?"Excel 單價":"專案單價";App.openModal({title:(srcKind==="excel"?"從 Excel 就地匯入物料 · ":"從專案帶入物料 · ")+this._esc(srcName),wide:true,body:`<div class="mat-imp-sum" id="mat-imp-sum"></div><div class="mat-cfbar" id="mat-imp-cf"></div><div class="mat-pv-wrap"><table class="mat-pv"><thead><tr><th style="width:32px"></th><th>料號 / 品名</th><th class="r">用量</th><th class="r">${priceHd}</th><th>帶入狀態</th></tr></thead><tbody id="mat-imp-tb"></tbody></table></div>`,footer:`<div style="display:flex;align-items:center;gap:10px;width:100%"><span class="mat-imp-selinfo" id="mat-imp-selinfo"></span><div style="flex:1"></div><button class="btn-ghost" onclick="App.closeModal()">取消</button><button class="btn-mat" onclick="Materials._doImport()">帶入勾選料號到主檔</button></div>`});this._renderImp()},_jsq(s){return String(s==null?"":s).replace(/\\/g,"\\\\").replace(/'/g,"\\'")}};
