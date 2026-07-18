// dev-seed-data.js — DEV 假資料「資料表」（純宣告·無邏輯·全虛構無機密）。
// 與 dev-seed.js（注入引擎）分離：本檔只描述「要哪些專案/料號/模具/報價、長什麼樣」，不含任何建構 code。
// 引擎（dev-seed.js）讀本表 → App.applyTemplate 套範本 → 後處理（日期/owner/dept/status/effort）→ 物料注入 pass → 注入 DATA。
// 日期一律用「相對今天的天數位移」（引擎轉成 iso），使 done/wip/pending 永遠跟著今天走、不會過期。
//
// ── 負荷檔位 loadProfile（引擎據此縮放 effortRatio·製造綠/黃/紅三色對照）──
//   'light'＝該案投入低；'normal'＝中；'busy'＝高。
// ── 進度檔位 progressProfile（引擎據此決定完工/逾期比例·製造 P1 綠/黃/紅）──
//   'ontrack'＝過去階段幾乎全完工（綠）；'tight'＝略落後（黃）；'behind'＝多筆逾裸（紅）。
// ── taskOverrides：{ wbs: { owner, status:'overdue'|'hold', progress, effort, holdReason, rescue:[...], urgency } }
//
// ── 物料模組假資料（2026-07-13 擴充·讓缺口/庫存/模具/報價/單據/替代料/BOM 商情各畫面從空白變有料）──
//   全域 parts（料號主檔·跨案共用 master）＋ molds（模具·projKey 分攤）＋ quotes（報價·projKey scope）＋
//   每案 row.bom（NPI 補 BOM grid·撐缺口/戰情室）＋ row.materials（stageQty/rdPlan/invTxns/machineTxns·綁 inject 當下 projId）。
//   壓力型（stress）＝ J-NPI + J-ECN 由引擎迴圈灌 bulk 料號/交易/BOM 列，壓測畫面與邊界。
//   ⚠ 一致性鐵則：part.partNo 必與專案 BOM 內 partNo 一致；stageQty 的 model key 由引擎照 _demandModels 派生（單機種=variants[0].id·J-NPI 多機種=bomModel id），不寫死。
var DEV_SEED_DATA = {
  deptOwners: {
    '研發部': ['家豪', '志明', '宗翰'], '電控部': ['龍哥', '彥彬', '柏宇'], '機構部': ['家銘', '雅婷'],
    '採購部': ['淑芬', '孟儒'], '品保部': ['怡君', '品保', '欣怡'], 'PM室': ['Paul'],
  },
  deptHeadcount: { '研發部': 3, '電控部': 3, '機構部': 2, '採購部': 2, '品保部': 3, 'PM室': 1 },
  roleToDept: {
    '系統工程師': '研發部', 'RD': '研發部',
    '硬體工程師': '電控部', '韌體工程師': '電控部', '馬達驅動工程師': '電控部',
    '結構工程師': '機構部', '機構工程師': '機構部',
    '採購': '採購部', '生產': '採購部', '生管': '採購部',
    '品保': '品保部', '品管': '品保部', '業務': '品保部', 'DCC': '品保部',
    'PM': 'PM室',
  },
  coreRoles: ['系統工程師', '硬體工程師', '韌體工程師', '結構工程師', '機構工程師', '馬達驅動工程師', 'RD'],

  // ══════════════ 全域料號主檔（DATA.parts·跨案共用 master）══════════════
  // 只列非預設欄位；引擎補 partId/status(Released)/ver/spec/moq(0)/internalBuffer(null)/inTransit(0)/history([])/createdAt。
  // 變化刻意鋪：alt=替代料鏈、st='Preliminary'=樣品、onHand<safetyStock=黃、onHand=0=紅、currency=進口料、hist=履歷軌跡。
  parts: [
    // 壓縮機
    { partNo: 'CMP-410A', name: '壓縮機 R410A', category: '壓縮機', unitPrice: 850, vendor: '東元冷氣', leadTime: 45, safetyStock: 20, onHand: 60, alternates: 'CMP-32' },
    { partNo: 'CMP-32', name: '壓縮機 R32', category: '壓縮機', unitPrice: 700, vendor: '聲寶', leadTime: 45, safetyStock: 20, onHand: 48, hist: [{ field: '單價', from: '760', to: '700', off: -50, note: '年度議價調降' }] },
    { partNo: 'CMP-INV-12', name: '變頻壓縮機 1.2t', category: '壓縮機', unitPrice: 1180, vendor: '三菱', leadTime: 60, safetyStock: 10, onHand: 12, st: 'Preliminary' },
    { partNo: 'CMP-ROT', name: '轉子壓縮機', category: '壓縮機', unitPrice: 620, vendor: '華凌', leadTime: 40, safetyStock: 15, onHand: 30 },
    { partNo: 'CMP-SCROLL', name: '渦捲壓縮機', category: '壓縮機', unitPrice: 1650, vendor: '谷輪', leadTime: 75, safetyStock: 6, onHand: 0, st: 'Preliminary' },
    // 閥件
    { partNo: 'VLV-01', name: '膨脹閥', category: '閥件', unitPrice: 135, vendor: '三花', leadTime: 30, safetyStock: 30, onHand: 90 },
    { partNo: 'VLV-EEV', name: '電子膨脹閥', category: '閥件', unitPrice: 210, vendor: '盾安', leadTime: 35, safetyStock: 20, onHand: 14 },
    { partNo: 'VLV-4WAY', name: '四通閥', category: '閥件', unitPrice: 320, vendor: '盾安', leadTime: 40, safetyStock: 10, onHand: 22, st: 'Preliminary' },
    // 換熱器
    { partNo: 'HEX-CU', name: '銅換熱器', category: '換熱器', unitPrice: 480, vendor: '長聲', leadTime: 30, safetyStock: 15, onHand: 40, hist: [{ field: '廠商', from: '恆昌', to: '長聲', off: -60, note: '轉單' }] },
    { partNo: 'HEX-AL', name: '鋁換熱器', category: '換熱器', unitPrice: 360, vendor: '長聲', leadTime: 30, safetyStock: 20, onHand: 8 },
    { partNo: 'HEX-EVAP', name: '蒸發器', category: '換熱器', unitPrice: 290, vendor: '長聲', leadTime: 25, safetyStock: 15, onHand: 35 },
    { partNo: 'HEX-PLATE', name: '板式換熱器', category: '換熱器', unitPrice: 540, vendor: 'Alfa Laval', currency: 'EUR', leadTime: 50, safetyStock: 8, onHand: 10, st: 'Preliminary' },
    // 馬達（風扇/泵）
    { partNo: 'MOT-BLDC', name: 'BLDC 馬達', category: '馬達', unitPrice: 260, vendor: '建準', currency: 'CNY', leadTime: 40, safetyStock: 20, onHand: 50 },
    { partNo: 'FAN-CROSS', name: '貫流風扇', category: '馬達', unitPrice: 145, vendor: '建準', leadTime: 25, safetyStock: 25, onHand: 70 },
    { partNo: 'FAN-12V', name: '風扇 12V', category: '馬達', unitPrice: 95, vendor: '廣達', leadTime: 20, safetyStock: 20, onHand: 40, alternates: 'FAN-12S' },
    { partNo: 'FAN-12S', name: '風扇 12V 靜音', category: '馬達', unitPrice: 110, vendor: '台達', leadTime: 20, safetyStock: 20, onHand: 30, hist: [{ field: '單價', from: '98', to: '110', off: -35, note: '靜音升級' }] },
    { partNo: 'PUMP-DRAIN', name: '排水泵', category: '馬達', unitPrice: 180, vendor: '協磁', leadTime: 30, safetyStock: 10, onHand: 20 },
    { partNo: 'PUMP-CIRC', name: '循環泵', category: '馬達', unitPrice: 420, vendor: '協磁', leadTime: 45, safetyStock: 8, onHand: 5, st: 'Preliminary' },
    // 電控
    { partNo: 'MCU-OLD', name: '主控 MCU（EOL）', category: '電控', unitPrice: 220, vendor: 'NXP', leadTime: 90, safetyStock: 10, onHand: 1200, alternates: 'MCU-NEW' },
    { partNo: 'MCU-NEW', name: '替代 MCU', category: '電控', unitPrice: 275, vendor: 'ST', currency: 'USD', leadTime: 70, safetyStock: 15, onHand: 12, hist: [{ field: '單價', from: '240', to: '275', off: -20, note: '停產替代漲價' }] },
    { partNo: 'PCB-4L', name: '四層板', category: '電控', unitPrice: 180, vendor: '欣興', leadTime: 35, safetyStock: 20, onHand: 40 },
    { partNo: 'PCB-MAIN', name: '主控板', category: '電控', unitPrice: 320, vendor: '欣興', leadTime: 35, safetyStock: 20, onHand: 45 },
    { partNo: 'PCB-DISP', name: '顯示板', category: '電控', unitPrice: 130, vendor: '欣興', leadTime: 30, safetyStock: 20, onHand: 9 },
    { partNo: 'IGBT-30A', name: '功率模組 30A', category: '電控', unitPrice: 340, vendor: 'Infineon', currency: 'USD', leadTime: 55, safetyStock: 15, onHand: 10, hist: [{ field: '單價', from: '310', to: '340', off: -28, note: '缺料漲價' }] },
    { partNo: 'TERMINAL', name: '端子台', category: '電控', unitPrice: 45, vendor: '進聯', leadTime: 20, safetyStock: 40, onHand: 120 },
    { partNo: 'WIRE-SET', name: '線材組', category: '電控', unitPrice: 60, vendor: '大電', leadTime: 15, safetyStock: 30, onHand: 100 },
    { partNo: 'REMOTE-IR', name: '紅外線遙控器', category: '電控', unitPrice: 85, vendor: '群光', leadTime: 30, safetyStock: 20, onHand: 25, st: 'Preliminary' },
    // 感測器
    { partNo: 'SEN-PIPE', name: '管溫感測器', category: '感測器', unitPrice: 38, vendor: '泰科', leadTime: 25, safetyStock: 30, onHand: 80 },
    { partNo: 'SEN-ROOM', name: '室溫感測器', category: '感測器', unitPrice: 42, vendor: '泰科', leadTime: 25, safetyStock: 30, onHand: 75 },
    { partNo: 'SEN-HUM', name: '濕度感測器', category: '感測器', unitPrice: 95, vendor: 'Sensirion', leadTime: 30, safetyStock: 15, onHand: 7 },
    { partNo: 'SEN-TEMP-H', name: '高溫感測器', category: '感測器', unitPrice: 120, vendor: '泰科', leadTime: 35, safetyStock: 10, onHand: 18 },
    { partNo: 'SEN-PRES', name: '壓力感測器', category: '感測器', unitPrice: 160, vendor: 'Sensata', currency: 'USD', leadTime: 40, safetyStock: 10, onHand: 15 },
    { partNo: 'SEN-T1', name: '溫感 T1', category: '感測器', unitPrice: 55, vendor: '泰科', leadTime: 25, safetyStock: 20, onHand: 30, alternates: 'SEN-T2、SEN-T3' },
    { partNo: 'SEN-T2', name: '溫感 T2', category: '感測器', unitPrice: 52, vendor: '泰科', leadTime: 25, safetyStock: 20, onHand: 20, st: 'Preliminary' },
    { partNo: 'SEN-T3', name: '溫感 T3', category: '感測器', unitPrice: 58, vendor: '和碩', leadTime: 25, safetyStock: 20, onHand: 0, st: 'Preliminary' },
    // 管件
    { partNo: 'PIP-CU', name: '銅管組', category: '管件', unitPrice: 250, vendor: '第一銅', leadTime: 30, safetyStock: 20, onHand: 50 },
    { partNo: 'TUBE-INS', name: '保溫管', category: '管件', unitPrice: 40, vendor: '華新', leadTime: 20, safetyStock: 30, onHand: 90 },
    { partNo: 'JOINT-Y', name: 'Y 型接頭', category: '管件', unitPrice: 18, vendor: '川湖', leadTime: 15, safetyStock: 40, onHand: 150 },
    // 包材
    { partNo: 'BOX-J', name: 'J 系列外箱', category: '包材', unitPrice: 55, vendor: '正隆', leadTime: 20, safetyStock: 30, onHand: 60 },
    { partNo: 'BOX-D', name: '除濕機外箱', category: '包材', unitPrice: 48, vendor: '正隆', leadTime: 20, safetyStock: 30, onHand: 55 },
    { partNo: 'BOX-H', name: '熱泵外箱', category: '包材', unitPrice: 65, vendor: '正隆', leadTime: 20, safetyStock: 20, onHand: 40 },
    { partNo: 'FOAM-EPE', name: 'EPE 緩衝', category: '包材', unitPrice: 22, vendor: '謙信', leadTime: 15, safetyStock: 40, onHand: 130 },
    { partNo: 'LABEL-EN', name: '英文銘牌', category: '包材', unitPrice: 6, vendor: '永勝', leadTime: 10, safetyStock: 100, onHand: 300 },
    { partNo: 'FILTER-PM25', name: 'PM2.5 濾網', category: '包材', unitPrice: 75, vendor: '康那香', leadTime: 25, safetyStock: 20, onHand: 12 },
    // 其他
    { partNo: 'PAD-EVA', name: 'EVA 緩衝墊', category: '其他', unitPrice: 30, vendor: '謙信', leadTime: 20, safetyStock: 20, onHand: 40, alternates: 'PAD-PORON' },
    { partNo: 'PAD-PORON', name: 'PORON 緩衝墊', category: '其他', unitPrice: 20, vendor: 'Rogers', leadTime: 20, safetyStock: 20, onHand: 35, hist: [{ field: '單價', from: '26', to: '20', off: -15, note: '替代降本' }] },
    { partNo: 'SCR-01', name: '螺絲組', category: '其他', unitPrice: 12, vendor: '恆耀', leadTime: 10, safetyStock: 100, onHand: 400 },
    { partNo: 'GSK-330', name: '緩衝墊片 EPDM', category: '其他', unitPrice: 18, vendor: '固滿德', leadTime: 20, safetyStock: 30, onHand: 60, alternates: 'GSK-345' },
    { partNo: 'GSK-345', name: '緩衝墊片 矽膠', category: '其他', unitPrice: 24, vendor: '固滿德', leadTime: 20, safetyStock: 30, onHand: 40 },
    { partNo: 'LOUVER', name: '導風板', category: '其他', unitPrice: 90, vendor: '銓寶', leadTime: 30, safetyStock: 15, onHand: 28 },
    { partNo: 'CASTER', name: '腳輪', category: '其他', unitPrice: 35, vendor: '川湖', leadTime: 20, safetyStock: 20, onHand: 44 },
    { partNo: 'TANK-WATER', name: '水箱', category: '其他', unitPrice: 140, vendor: '銓寶', leadTime: 30, safetyStock: 10, onHand: 16 },
    { partNo: 'TANK-INS', name: '保溫水箱', category: '其他', unitPrice: 380, vendor: '銓寶', leadTime: 40, safetyStock: 8, onHand: 9 },
  ],

  // ══════════════ 模具（Store.molds·alloc 用 projKey·引擎轉 projId）══════════════
  molds: [
    { moldName: '壓縮機外殼模', cavity: '1x2', vendor: '昱盛模具', currency: 'USD', baseCurrency: 'NTD', price: 8000, rate: 32, quoteFile: '壓縮機外殼模報價.pdf', dOff: -25, alloc: [{ projKey: 'ecn-r32', sharePct: 60 }, { projKey: 'npi-j', sharePct: 40 }] },
    { moldName: '緩衝墊沖切模', cavity: '1x4', vendor: '大井模具', currency: 'NTD', baseCurrency: 'NTD', price: 120000, rate: 1, quoteFile: '緩衝墊模報價.pdf', dOff: -22, alloc: [{ projKey: 'ecn-pad', sharePct: 100 }] },
    { moldName: 'MCU 端子模', cavity: '1x8', vendor: '東莞精模', currency: 'CNY', baseCurrency: 'NTD', price: 30000, rate: 4.4, quoteFile: 'MCU端子模報價.pdf', dOff: -18, alloc: [{ projKey: 'ecn-mcu', sharePct: 100 }] },
    { moldName: '換熱器折彎模', cavity: '1x1', vendor: '昱盛模具', currency: 'NTD', baseCurrency: 'NTD', price: 260000, rate: 1, quoteFile: '換熱器模報價.pdf', dOff: -30, alloc: [{ projKey: 'npi-j', sharePct: 40 }, { projKey: 'npi-d', sharePct: 30 }, { projKey: 'npi-h', sharePct: 30 }] },
    { moldName: '貫流風扇模', cavity: '1x2', vendor: '大井模具', currency: 'NTD', baseCurrency: 'NTD', price: 85000, rate: 1, quoteFile: '風扇模報價.pdf', dOff: -28, alloc: [{ projKey: 'npi-j', sharePct: 100 }] },
    { moldName: '外箱刀模', cavity: '1x1', vendor: '正隆刀模', currency: 'NTD', baseCurrency: 'NTD', price: 45000, rate: 1, quoteFile: '外箱刀模報價.pdf', dOff: -20, alloc: [{ projKey: 'npi-j', sharePct: 50 }, { projKey: 'npi-d', sharePct: 50 }] },
  ],

  // ══════════════ 報價（Store.quotes·同料多廠比價·projKey null=全域）══════════════
  quotes: [
    { partNo: 'CMP-32', vendor: '聲寶', price: 730, currency: 'NTD', rate: 1, leadTime: 45, dOff: -14 },
    { partNo: 'CMP-32', vendor: '大同', price: 745, currency: 'NTD', rate: 1, leadTime: 40, dOff: -12 },
    { partNo: 'CMP-32', vendor: '樂金', price: 22, currency: 'USD', rate: 32, leadTime: 50, dOff: -10 },
    { partNo: 'FAN-12S', vendor: '台達', price: 110, currency: 'NTD', rate: 1, leadTime: 20, dOff: -13 },
    { partNo: 'FAN-12S', vendor: '廣達', price: 24, currency: 'CNY', rate: 4.4, leadTime: 25, dOff: -11 },
    { partNo: 'MCU-NEW', vendor: 'ST 原廠', price: 8, currency: 'USD', rate: 32, leadTime: 70, dOff: -16, projKey: 'ecn-mcu' },
    { partNo: 'MCU-NEW', vendor: '大聯大', price: 275, currency: 'NTD', rate: 1, leadTime: 60, dOff: -15, projKey: 'ecn-mcu' },
    { partNo: 'IGBT-30A', vendor: 'Infineon', price: 10.5, currency: 'USD', rate: 32, leadTime: 55, dOff: -9 },
    { partNo: 'IGBT-30A', vendor: '文曄', price: 350, currency: 'NTD', rate: 1, leadTime: 45, dOff: -8 },
    { partNo: 'PAD-PORON', vendor: 'Rogers', price: 22, currency: 'NTD', rate: 1, leadTime: 20, dOff: -13, projKey: 'ecn-pad' },
    { partNo: 'HEX-CU', vendor: '長聲', price: 480, currency: 'NTD', rate: 1, leadTime: 30, dOff: -18 },
    { partNo: 'SEN-ROOM', vendor: '泰科', price: 42, currency: 'NTD', rate: 1, leadTime: 25, dOff: -17 },
    { partNo: 'BOX-J', vendor: '正隆', price: 55, currency: 'NTD', rate: 1, leadTime: 20, dOff: -19 },
    { partNo: 'PCB-MAIN', vendor: '欣興', price: 320, currency: 'NTD', rate: 1, leadTime: 35, dOff: -16 },
  ],

  // ══════════════ 壓力型 bulk 設定（引擎迴圈生成·壓測畫面/邊界）══════════════
  stress: {
    extraMaster: 66,        // 額外 STR-### 料號主檔（撐料號清單量）
    npiKey: 'npi-j', npiLeafPerModel: 11,   // J-NPI 每機種再補 N 筆葉節點（撐缺口大表）
    ecnKey: 'ecn-r32', ecnRows: 18,         // J-ECN 再補 N 列 bomRows（含多列 del+多列 add·壓測跨列配對）
    invNpi: 40, invEcn: 30,                 // 兩壓力案各補 N 筆庫存異動
  },

  // ══════════════ 專案表（一列一案·key 供物料交易綁 projId）══════════════
  projects: [
    // ═══ NPI 1（壓力型）：J 系列 壁掛變頻冷暖·busy/ontrack·2 機種 BOM ═══
    {
      kind: 'npi', key: 'npi-j', name: 'J 系列 壁掛變頻冷暖空調', color: '#4A7C5C',
      loadProfile: 'busy', progressProfile: 'ontrack', targetOffset: 95,
      stageWindows: { '設計': [-60, -30], '手工機': [-30, -2], '性試': [-2, 40], '量試': [40, 75], '量產': [75, 110] },
      taskOverrides: {
        18: { owner: '龍哥', progress: 55, effort: 60 },
        20: { owner: '龍哥', progress: 40, effort: 60 },
      },
      bom: {
        annualVolume: 12000, evalYears: 3, targetUnitCost: 2400, unitSellPrice: 6800,
        models: [
          { name: '壁掛 R32', grid: [['料號', '品名', '用量', '單價', '類別'],
            ['CMP-32', '壓縮機 R32', 1, 730, 'M'], ['HEX-CU', '銅換熱器', 1, 480, 'M'], ['HEX-AL', '鋁換熱器', 1, 360, 'M'],
            ['FAN-CROSS', '貫流風扇', 1, 145, 'M'], ['MOT-BLDC', 'BLDC 馬達', 1, 260, 'M'], ['VLV-EEV', '電子膨脹閥', 1, 210, 'M'],
            ['SEN-PIPE', '管溫感測器', 1, 38, 'M'], ['SEN-ROOM', '室溫感測器', 1, 42, 'M'], ['PCB-MAIN', '主控板', 1, 320, 'M'],
            ['PCB-DISP', '顯示板', 1, 130, 'M'], ['IGBT-30A', '功率模組', 1, 340, 'M'], ['WIRE-SET', '線材組', 1, 60, 'A'],
            ['REMOTE-IR', '遙控器', 1, 85, 'M'], ['BOX-J', '外箱', 1, 55, 'A'], ['FOAM-EPE', 'EPE 緩衝', 2, 22, 'A'],
            ['FILTER-PM25', '濾網', 1, 75, 'M'], ['LOUVER', '導風板', 1, 90, 'A'], ['TERMINAL', '端子台', 2, 45, 'M']] },
          { name: '壁掛 變頻旗艦', grid: [['料號', '品名', '用量', '單價', '類別'],
            ['CMP-INV-12', '變頻壓縮機', 1, 1180, 'M'], ['HEX-CU', '銅換熱器', 1, 480, 'M'], ['HEX-AL', '鋁換熱器', 1, 360, 'M'],
            ['FAN-CROSS', '貫流風扇', 1, 145, 'M'], ['MOT-BLDC', 'BLDC 馬達', 1, 260, 'M'], ['VLV-EEV', '電子膨脹閥', 1, 210, 'M'],
            ['SEN-PIPE', '管溫感測器', 1, 38, 'M'], ['SEN-ROOM', '室溫感測器', 1, 42, 'M'], ['PCB-MAIN', '主控板', 1, 320, 'M'],
            ['PCB-DISP', '顯示板', 1, 130, 'M'], ['IGBT-30A', '功率模組', 1, 340, 'M'], ['WIRE-SET', '線材組', 1, 60, 'A'],
            ['REMOTE-IR', '遙控器', 1, 85, 'M'], ['BOX-J', '外箱', 1, 55, 'A'], ['FOAM-EPE', 'EPE 緩衝', 2, 22, 'A'],
            ['FILTER-PM25', '濾網', 1, 75, 'M'], ['LOUVER', '導風板', 1, 90, 'A'], ['TERMINAL', '端子台', 2, 45, 'M']] },
        ],
      },
      materials: {
        stageQtyModels: [
          { '手工機': 2, '性試': 3, '量試': 10, '量產': 50 },
          { '手工機': 1, '性試': 2, '量試': 8, '量產': 40 },
        ],
        rdPlan: { '手工機': 1, '性試': 2, '量試': 3 },
        invTxns: [
          { stage: '手工機', partNo: 'CMP-32', type: '到料', qty: 3, dOff: -28, doc: 'PO', vendor: '聲寶', srcName: 'PO-壓縮機.pdf' },
          { stage: '手工機', partNo: 'PCB-MAIN', type: '到料', qty: 5, dOff: -26, doc: 'PO', vendor: '欣興', srcName: 'PO-主控板.pdf' },
          { stage: '手工機', partNo: 'IGBT-30A', type: '額外需求', qty: 2, dOff: -20, doc: 'RQ', note: '打件燒毀補料' },
          { stage: '性試', partNo: 'HEX-AL', type: '到料', qty: 4, dOff: -5, doc: 'PO', vendor: '長聲', srcName: 'PO-鋁換熱.pdf' },
          { stage: '性試', partNo: 'SEN-ROOM', type: '盤點', qty: 12, dOff: -3, note: '季盤校正' },
          { stage: '量試', partNo: 'FILTER-PM25', type: '額外需求', qty: 8, dOff: 2, note: '量試追加濾網' },
        ],
        machineTxns: [
          { stage: '手工機', use: '送商檢', qty: 2, dOff: -18, note: '安規初測' },
          { stage: '性試', use: '長期運轉', qty: 1, dOff: -1, note: '性能長跑機' },
          { stage: '量試', use: '客戶送樣', qty: 1, dOff: 20, note: '客戶承認樣機' },
        ],
      },
    },
    // ═══ NPI 2（填滿）：D 系列 節能除濕機·light/tight ═══
    {
      kind: 'npi', key: 'npi-d', name: 'D 系列 節能除濕機', color: '#C4956C',
      loadProfile: 'light', progressProfile: 'tight', targetOffset: 80,
      stageWindows: { '設計': [-15, 25], '手工機': [25, 60] },
      taskOverrides: { 1: { progress: 60, owner: '家豪' }, 4: { owner: '家銘', progress: 30 } },
      bom: {
        annualVolume: 6000, evalYears: 3, targetUnitCost: 1350, unitSellPrice: 3900,
        models: [{ name: '除濕機 主機', grid: [['料號', '品名', '用量', '單價', '類別'],
          ['CMP-ROT', '轉子壓縮機', 1, 620, 'M'], ['HEX-EVAP', '蒸發器', 1, 290, 'M'], ['TANK-WATER', '水箱', 1, 140, 'M'],
          ['PUMP-DRAIN', '排水泵', 1, 180, 'M'], ['SEN-HUM', '濕度感測器', 1, 95, 'M'], ['CASTER', '腳輪', 4, 35, 'M'],
          ['FILTER-PM25', '濾網', 1, 75, 'M'], ['WIRE-SET', '線材組', 1, 60, 'A'], ['PCB-MAIN', '主控板', 1, 320, 'M'],
          ['BOX-D', '外箱', 1, 48, 'A'], ['FOAM-EPE', 'EPE 緩衝', 2, 22, 'A'], ['TERMINAL', '端子台', 2, 45, 'M']] }],
      },
      materials: {
        stageQty: { '手工機': 3 },
        rdPlan: { '手工機': 1 },
        invTxns: [
          { stage: '手工機', partNo: 'CMP-ROT', type: '到料', qty: 3, dOff: 30, doc: 'PO', vendor: '華凌', srcName: 'PO-轉子壓縮.pdf' },
          { stage: '手工機', partNo: 'TANK-WATER', type: '到料', qty: 4, dOff: 32, doc: 'PO', vendor: '銓寶', srcName: 'PO-水箱.pdf' },
          { stage: '手工機', partNo: 'SEN-HUM', type: '額外需求', qty: 2, dOff: 35, note: '感測器不良補料' },
          { stage: '手工機', partNo: 'PUMP-DRAIN', type: '盤點', qty: 20, dOff: 20 },
        ],
        machineTxns: [
          { stage: '手工機', use: '送商檢', qty: 1, dOff: 40, note: '除濕量測試' },
          { stage: '手工機', use: '報廢損壞', qty: 1, dOff: 45, note: '壓縮機異音報廢' },
        ],
      },
    },
    // ═══ NPI 3（填滿）：H 系列 熱泵熱水器·normal/behind ═══
    {
      kind: 'npi', key: 'npi-h', name: 'H 系列 熱泵熱水器', color: '#B8504D',
      loadProfile: 'normal', progressProfile: 'behind', targetOffset: -10,
      stageWindows: { '設計': [-70, -35], '手工機': [-35, -3], '性試': [-3, 30], '量試': [30, 60] },
      taskOverrides: {
        16: { status: 'overdue', progress: 40, owner: '龍哥', effort: 60,
              rescue: [{ action: '加班趕打件、外包 SMT 併線', owner: '龍哥', targetOffset: 5, status: 'yellow' }] },
        17: { status: 'hold', progress: 20, owner: '家銘', holdReason: '等待供應商樣品（模具修改中）',
              rescue: [{ action: '改用替代供應商報價中', owner: '淑芬', targetOffset: 8, status: 'red' },
                       { action: '協調原廠加急，預計本週回覆', owner: '家銘', targetOffset: 3, status: 'yellow' }] },
        22: { status: 'overdue', progress: 0, owner: '彥彬' },
      },
      bom: {
        annualVolume: 3500, evalYears: 5, targetUnitCost: 3200, unitSellPrice: 9800,
        models: [{ name: '熱泵 主機', grid: [['料號', '品名', '用量', '單價', '類別'],
          ['CMP-SCROLL', '渦捲壓縮機', 1, 1650, 'M'], ['HEX-PLATE', '板式換熱器', 1, 540, 'M'], ['PUMP-CIRC', '循環泵', 1, 420, 'M'],
          ['TANK-INS', '保溫水箱', 1, 380, 'M'], ['VLV-4WAY', '四通閥', 1, 320, 'M'], ['SEN-TEMP-H', '高溫感測器', 2, 120, 'M'],
          ['PCB-MAIN', '主控板', 1, 320, 'M'], ['WIRE-SET', '線材組', 1, 60, 'A'], ['BOX-H', '外箱', 1, 65, 'A'],
          ['FOAM-EPE', 'EPE 緩衝', 2, 22, 'A'], ['TUBE-INS', '保溫管', 3, 40, 'M'], ['TERMINAL', '端子台', 2, 45, 'M']] }],
      },
      materials: {
        stageQty: { '手工機': 2, '性試': 2, '量試': 6 },
        rdPlan: { '手工機': 1, '性試': 1 },
        invTxns: [
          { stage: '手工機', partNo: 'CMP-SCROLL', type: '到料', qty: 1, dOff: -30, doc: 'PO', vendor: '谷輪', srcName: 'PO-渦捲.pdf' },
          { stage: '手工機', partNo: 'HEX-PLATE', type: '額外需求', qty: 1, dOff: -25, doc: 'RQ', note: '板換洩漏補料' },
          { stage: '性試', partNo: 'PUMP-CIRC', type: '到料', qty: 2, dOff: -2, doc: 'PO', vendor: '協磁', srcName: 'PO-循環泵.pdf' },
          { stage: '性試', partNo: 'TANK-INS', type: '盤點', qty: 3, dOff: 0 },
        ],
        machineTxns: [
          { stage: '手工機', use: '送商檢', qty: 1, dOff: -20, note: '安規' },
          { stage: '性試', use: '長期運轉', qty: 1, dOff: -1, note: 'COP 長跑' },
        ],
      },
    },
    // ═══ ECN 1（壓力型）：J 系列 冷媒替代 R32·L·效益·busy/behind ═══
    {
      kind: 'ecn', key: 'ecn-r32', name: 'J 系列 冷媒替代 R32', color: '#d99a3c', size: 'L', roiType: 'benefit',
      changeReason: '主冷媒 R410A 逐步淘汰，切換 R32 並整併壓縮機料號成本調降', sourceNo: 'CAR-2026-018',
      targetSave: 120, baselineHours: 620, effectiveOffset: 50, loopCount: 1, scopeCount: 1,
      loadProfile: 'busy', progressProfile: 'behind',
      stageWindows: { '立案評估': [-40, -30], '設計變更': [-30, -12], '部品認定': [-12, 8], '驗證測試': [8, 28], 'DR 審核': [28, 38], '客戶決策': [38, 45], '生效結案': [45, 55] },
      pmSpan: [-40, 20],
      events: [
        { type: 'open', dateOffset: -40, label: '開案 · 凍結基準工時 620h' },
        { type: 'scope', dateOffset: -18, label: '中途追加：EMI 重測', cause: '客戶追加需求' },
        { type: 'loop', dateOffset: -6, label: '打回重測：壓縮機可靠性', cause: '測試未過' },
      ],
      taskOverrides: {
        6: { owner: '龍哥', progress: 20, status: 'hold', effort: 60, holdReason: '壓縮機可靠性複測未過·打回重測',
             rescue: [{ action: '調整潤滑油配方重測', owner: '龍哥', targetOffset: 6, status: 'yellow' }] },
      },
      cost: {
        annualVolume: 8000, evalYears: 3, oneTimeCost: { mold: 60000, cert: 40000, deadStock: 0 },
        targetUnitCost: 1100, unitSellPrice: 3200,
        oldGrid: [['料號', '品名', '用量', '單價', '類別'], ['CMP-410A', '壓縮機 R410A', 1, 850, 'M'], ['VLV-01', '膨脹閥', 1, 130, 'M'], ['PIP-CU', '銅管組', 1, 240, 'M']],
        newGrid: [['料號', '品名', '用量', '單價', '類別'], ['CMP-32', '壓縮機 R32', 1, 730, 'M'], ['VLV-01', '膨脹閥', 1, 130, 'M'], ['PIP-CU', '銅管組', 1, 240, 'M']],
        rows: [{ changeKind: 'rev', partNoA: 'CMP-410A', replacePartNoB: 'CMP-32', partName: '壓縮機', oldPrice: 850, oldQty: 1, newPrice: 730, newQty: 1, switchMode: 'running', stockQty: 0 }],
        model: { name: 'J 系列 冷媒替代 R32', oldTotal: 1220, newTotal: 1100, delta: -120, dropPct: 9.8, bomOldCount: 3, bomNewCount: 3, targetSavePerUnit: 120 },
      },
      materials: {
        stageQty: { '部品認定': 3, '驗證測試': 5 },
        rdPlan: { '驗證測試': 2 },
        invTxns: [
          { stage: '部品認定', partNo: 'CMP-32', type: '到料', qty: 5, dOff: -10, doc: 'PO', vendor: '聲寶', srcName: 'PO-R32壓縮機.pdf' },
          { stage: '驗證測試', partNo: 'CMP-32', type: '額外需求', qty: 2, dOff: 10, doc: 'RQ', note: '打回重測補件' },
          { stage: '部品認定', partNo: 'VLV-01', type: '盤點', qty: 30, dOff: -8 },
        ],
        machineTxns: [
          { stage: '部品認定', use: '送商檢', qty: 3, dOff: -6, note: 'R32 冷媒安規' },
          { stage: '驗證測試', use: '客戶送樣', qty: 2, dOff: 25, note: '客戶承認' },
        ],
      },
    },
    // ═══ ECN 2（填滿）：主控板 IC 停產替代·M·被迫·light/ontrack ═══
    {
      kind: 'ecn', key: 'ecn-mcu', name: '主控板 IC 停產替代', color: '#d99a3c', size: 'M', roiType: 'forced',
      changeReason: '主控 MCU 原廠 EOL 停產，需替代料重新佈線與認證', sourceNo: 'EOL-2026-007',
      targetSave: 0, baselineHours: 280, effectiveOffset: 58, loopCount: 0, scopeCount: 0,
      loadProfile: 'light', progressProfile: 'ontrack',
      stageWindows: { '立案評估': [-20, -8], '設計變更': [-8, 10], '部品認定': [10, 28], '驗證測試': [28, 45], '客戶決策': [45, 52], '生效結案': [52, 62] },
      pmSpan: [-20, 30],
      events: [{ type: 'open', dateOffset: -20, label: '開案 · 凍結基準工時 280h' }],
      taskOverrides: { 1: { owner: '孟儒', progress: 50 } },
      cost: {
        annualVolume: 5000, evalYears: 3, oneTimeCost: { mold: 0, cert: 120000, deadStock: 264000 },
        targetUnitCost: 0, unitSellPrice: 0,
        oldGrid: [['料號', '品名', '用量', '單價', '類別'], ['MCU-OLD', '主控 MCU（EOL）', 1, 220, 'M'], ['PCB-4L', '四層板', 1, 180, 'M']],
        newGrid: [['料號', '品名', '用量', '單價', '類別'], ['MCU-NEW', '替代 MCU', 1, 260, 'M'], ['PCB-4L', '四層板', 1, 180, 'M']],
        rows: [{ changeKind: 'rev', partNoA: 'MCU-OLD', replacePartNoB: 'MCU-NEW', partName: '主控 MCU', oldPrice: 220, oldQty: 1, newPrice: 260, newQty: 1, switchMode: 'immediately', stockQty: 1200 }],
        model: { name: '全機種共用板', oldTotal: 400, newTotal: 440, delta: 40, dropPct: -10, bomOldCount: 2, bomNewCount: 2, targetSavePerUnit: 0 },
      },
      materials: {
        stageQty: { '部品認定': 2, '驗證測試': 3 },
        rdPlan: { '驗證測試': 1 },
        invTxns: [
          { stage: '部品認定', partNo: 'MCU-NEW', type: '到料', qty: 4, dOff: 12, doc: 'PO', vendor: '大聯大', srcName: 'PO-替代MCU.pdf' },
          { stage: '部品認定', partNo: 'MCU-OLD', type: '盤點', qty: 1200, dOff: 10, note: '呆滯庫存盤點' },
          { stage: '驗證測試', partNo: 'MCU-NEW', type: '額外需求', qty: 2, dOff: 30, doc: 'RQ', note: '佈線改版補件' },
        ],
        machineTxns: [
          { stage: '部品認定', use: '送商檢', qty: 2, dOff: 15, note: '替代料 EMC' },
        ],
      },
    },
    // ═══ ECN 3（填滿）：外殼異音緩衝墊改善·S·效益·normal/tight ═══
    {
      kind: 'ecn', key: 'ecn-pad', name: '外殼異音緩衝墊改善', color: '#d99a3c', size: 'S', roiType: 'benefit',
      changeReason: '客訴壓縮機外殼共振異音，增加緩衝墊片並改材質', sourceNo: '8D-2026-031',
      targetSave: 15, baselineHours: 90, effectiveOffset: 18, loopCount: 0, scopeCount: 0,
      loadProfile: 'normal', progressProfile: 'tight',
      stageWindows: { '立案評估': [-12, -4], '設計變更': [-4, 12], '生效結案': [12, 22] },
      pmSpan: [-12, 12],
      events: [{ type: 'open', dateOffset: -8, label: '開案 · 凍結基準工時 90h' }],
      taskOverrides: { 3: { owner: '家豪', progress: 35 } },
      cost: {
        annualVolume: 20000, evalYears: 3, oneTimeCost: { mold: 0, cert: 8000, deadStock: 0 },
        targetUnitCost: 56, unitSellPrice: 1800,
        oldGrid: [['料號', '品名', '用量', '單價', '類別'], ['PAD-EVA', 'EVA 緩衝墊', 2, 30, 'M'], ['SCR-01', '螺絲組', 1, 12, 'M']],
        newGrid: [['料號', '品名', '用量', '單價', '類別'], ['PAD-PORON', 'PORON 緩衝墊', 2, 22, 'M'], ['SCR-01', '螺絲組', 1, 12, 'M']],
        rows: [{ changeKind: 'rev', partNoA: 'PAD-EVA', replacePartNoB: 'PAD-PORON', partName: '緩衝墊', oldPrice: 30, oldQty: 2, newPrice: 22, newQty: 2, switchMode: 'running', stockQty: 0 }],
        model: { name: '壁掛全系列', oldTotal: 72, newTotal: 56, delta: -16, dropPct: 22.2, bomOldCount: 2, bomNewCount: 2, targetSavePerUnit: 15 },
      },
      materials: {
        stageQty: { '設計變更': 2 },
        invTxns: [
          { stage: '設計變更', partNo: 'PAD-PORON', type: '到料', qty: 10, dOff: -2, doc: 'PO', vendor: 'Rogers', srcName: 'PO-PORON.pdf' },
          { stage: '設計變更', partNo: 'PAD-EVA', type: '盤點', qty: 200, dOff: -3, note: '舊料盤點' },
        ],
        machineTxns: [
          { stage: '設計變更', use: '送商檢', qty: 1, dOff: 5, note: '異音複測' },
        ],
      },
    },
  ],
};
