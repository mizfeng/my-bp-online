/**
 * app.js - 核心應用程式邏輯控制器
 * 包含頁籤切換、滾輪選擇器、歷史紀錄管理、統計分析與 PWA 生命週期
 */

(function () {
  'use strict';

  // 星期名稱表
  const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

  // 應用程式狀態
  const state = {
    currentTab: 'enter',
    // 預設血壓/心率暫存
    enterBp: {
      high: 120,
      low: 80,
      pulse: 72,
      noPulse: false,
    },
    // 編輯中的紀錄
    editingRecord: null,
    editingBp: {
      high: 120,
      low: 80,
      pulse: 72,
      noPulse: false,
    },
    // 歷史紀錄快取
    records: [],
    // 圖表實例
    chartInstance: null,
  };

  /**
   * 根據當前系統時間推算預設時段 (0~3)
   */
  function getCurrentTimePeriod() {
    const hour = new Date().getHours();
    if (hour >= 0 && hour < 6) return 0; // 凌晨
    if (hour >= 6 && hour < 12) return 1; // 上午
    if (hour >= 12 && hour < 18) return 2; // 下午
    return 3; // 晚上
  }

  /**
   * 取得今日本地 ISO 日期字串 (YYYY-MM-DD)
   */
  function getTodayISO() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  /**
   * 格式化日期與星期，例如 "2024年3月5日星期二"
   */
  function formatDateWithWeekday(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const dateObj = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
      const weekday = WEEKDAYS[dateObj.getDay()] || '';
      return `${csvUtils.formatDateToChinese(dateStr)}${weekday}`;
    }
    return dateStr;
  }

  /**
   * 顯示 Toast 提示
   */
  function showToast(message, duration = 2500) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timeout);
    toast._timeout = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  // ==========================================
  // 頁籤切換
  // ==========================================
  function switchTab(tabName) {
    state.currentTab = tabName;
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.tab-pane').forEach((pane) => {
      pane.classList.toggle('active', pane.id === `tab-${tabName}`);
    });

    if (tabName === 'history') {
      loadHistoryList();
    } else if (tabName === 'statistic') {
      loadStatistics();
    } else if (tabName === 'chart') {
      loadChart();
    }
  }

  // ==========================================
  // Tab 1: 添加記錄邏輯 (修復重複綁定 Bug)
  // ==========================================
  async function resetEnterTabState() {
    const todayISO = getTodayISO();
    const dateInput = document.getElementById('enter-date-input');
    const dateDisplay = document.getElementById('enter-date-display');
    const timeSelect = document.getElementById('enter-time-select');

    if (dateInput) dateInput.value = todayISO;
    if (dateDisplay) dateDisplay.textContent = formatDateWithWeekday(todayISO);
    if (timeSelect) timeSelect.value = getCurrentTimePeriod();

    // 載入最後一筆紀錄作為預設值
    const latest = await bpDB.getLatestRecord();
    if (latest) {
      state.enterBp.high = latest.bphigh || 120;
      state.enterBp.low = latest.bplow || 80;
      if (latest.bpPulse) {
        state.enterBp.pulse = latest.bpPulse;
        state.enterBp.noPulse = false;
      } else {
        state.enterBp.noPulse = true;
      }
    }
    updateBpDisplay('enter');
  }

  function setupEnterTabListeners() {
    const dateInput = document.getElementById('enter-date-input');
    const dateDisplay = document.getElementById('enter-date-display');
    if (dateInput) {
      dateInput.addEventListener('change', (e) => {
        if (dateDisplay) {
          dateDisplay.textContent = formatDateWithWeekday(e.target.value);
        }
      });
    }

    const saveBtn = document.getElementById('enter-save-btn');
    if (saveBtn) {
      saveBtn.addEventListener('click', handleSaveRecord);
    }
  }

  function updateBpDisplay(mode = 'enter') {
    const bpState = mode === 'enter' ? state.enterBp : state.editingBp;
    const displayEl = document.getElementById(`${mode}-bp-display`);
    if (!displayEl) return;

    if (bpState.noPulse) {
      displayEl.textContent = `${bpState.high} / ${bpState.low}`;
    } else {
      displayEl.textContent = `${bpState.high} / ${bpState.low}  -  ${bpState.pulse}`;
    }
  }

  async function handleSaveRecord() {
    const dateInput = document.getElementById('enter-date-input');
    const timeSelect = document.getElementById('enter-time-select');
    const notesInput = document.getElementById('enter-notes-input');

    const bpdate = dateInput.value || getTodayISO();
    const bptime = parseInt(timeSelect.value, 10);
    const bpNotes = notesInput.value.trim();

    const record = {
      bphigh: state.enterBp.high,
      bplow: state.enterBp.low,
      bpPulse: state.enterBp.noPulse ? null : state.enterBp.pulse,
      bpdate,
      bptime,
      bpNotes,
    };

    try {
      await bpDB.addRecord(record);
      notesInput.value = '';
      showToast('記錄已經保存');
    } catch (err) {
      console.error(err);
      showToast('保存失敗，請重試');
    }
  }

  // ==========================================
  // 滾輪與數字輸入選擇器 (BpPicker Modal)
  // ==========================================
  let currentPickerMode = 'enter'; // 'enter' | 'edit'

  function openBpPickerModal(mode = 'enter') {
    currentPickerMode = mode;
    const bpState = mode === 'enter' ? state.enterBp : state.editingBp;

    const modal = document.getElementById('bp-picker-modal');
    const highInput = document.getElementById('picker-high-input');
    const lowInput = document.getElementById('picker-low-input');
    const pulseInput = document.getElementById('picker-pulse-input');
    const noPulseCb = document.getElementById('picker-no-pulse-cb');

    highInput.value = bpState.high;
    lowInput.value = bpState.low;
    pulseInput.value = bpState.pulse;
    noPulseCb.checked = bpState.noPulse;
    pulseInput.disabled = bpState.noPulse;

    setupWheelScroll('wheel-high', highInput, 50, 260);
    setupWheelScroll('wheel-low', lowInput, 30, 160);
    setupWheelScroll('wheel-pulse', pulseInput, 40, 200);

    modal.classList.add('active');
  }

  function setupWheelScroll(wheelId, inputEl, min, max) {
    const wheel = document.getElementById(wheelId);
    if (!wheel) return;
    wheel.innerHTML = '';

    const currentVal = parseInt(inputEl.value, 10) || min;
    const itemHeight = 36;

    // 前後加入空白佔位以利置中對齊
    const padTop = document.createElement('div');
    padTop.style.height = `${itemHeight * 2}px`;
    wheel.appendChild(padTop);

    for (let i = min; i <= max; i++) {
      const item = document.createElement('div');
      item.className = 'wheel-item';
      item.dataset.value = i;
      item.textContent = i;
      if (i === currentVal) item.classList.add('selected');

      // 支援點擊數字直接選取
      item.addEventListener('click', () => {
        inputEl.value = i;
        wheel.scrollTop = (i - min) * itemHeight;
        wheel.querySelectorAll('.wheel-item').forEach((it) => {
          it.classList.toggle('selected', parseInt(it.dataset.value, 10) === i);
        });
      });

      wheel.appendChild(item);
    }

    const padBottom = document.createElement('div');
    padBottom.style.height = `${itemHeight * 2}px`;
    wheel.appendChild(padBottom);

    // 滾動至當前選中項
    setTimeout(() => {
      const scrollPos = (currentVal - min) * itemHeight;
      wheel.scrollTop = scrollPos;
    }, 50);

    // 支援滑鼠實體滾輪與觸控板滾動 (Wheel Event)
    wheel.onwheel = (e) => {
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      const val = parseInt(inputEl.value, 10) || min;
      const targetVal = Math.min(max, Math.max(min, val + delta));
      if (targetVal !== val) {
        inputEl.value = targetVal;
        wheel.scrollTop = (targetVal - min) * itemHeight;
        wheel.querySelectorAll('.wheel-item').forEach((it) => {
          it.classList.toggle('selected', parseInt(it.dataset.value, 10) === targetVal);
        });
      }
    };

    // 觸控/自然滾動事件防抖同步
    let scrollTimer = null;
    wheel.onscroll = () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => {
        const idx = Math.round(wheel.scrollTop / itemHeight);
        const val = Math.min(max, Math.max(min, min + idx));
        inputEl.value = val;

        wheel.querySelectorAll('.wheel-item').forEach((it) => {
          it.classList.toggle('selected', parseInt(it.dataset.value, 10) === val);
        });
      }, 60);
    };

    // input 手動改動時連動滾輪
    inputEl.oninput = () => {
      const val = parseInt(inputEl.value, 10);
      if (!isNaN(val) && val >= min && val <= max) {
        wheel.scrollTop = (val - min) * itemHeight;
        wheel.querySelectorAll('.wheel-item').forEach((it) => {
          it.classList.toggle('selected', parseInt(it.dataset.value, 10) === val);
        });
      }
    };
  }

  /**
   * 關閉選擇器並執行數值範圍檢查 (P0-3 邊界驗證)
   */
  function closeBpPickerModal(confirm = false) {
    const modal = document.getElementById('bp-picker-modal');
    if (confirm) {
      const highInput = document.getElementById('picker-high-input');
      const lowInput = document.getElementById('picker-low-input');
      const pulseInput = document.getElementById('picker-pulse-input');
      const noPulseCb = document.getElementById('picker-no-pulse-cb');

      const highRaw = highInput.value.trim();
      const lowRaw = lowInput.value.trim();
      const pulseRaw = pulseInput.value.trim();

      // 檢查是否為空或非法字元
      if (!highRaw || isNaN(highRaw)) {
        showToast('請輸入有效的收縮壓數值');
        highInput.focus();
        return;
      }
      if (!lowRaw || isNaN(lowRaw)) {
        showToast('請輸入有效的舒張壓數值');
        lowInput.focus();
        return;
      }
      if (!noPulseCb.checked && (!pulseRaw || isNaN(pulseRaw))) {
        showToast('請輸入有效的心率數值');
        pulseInput.focus();
        return;
      }

      let highVal = parseInt(highRaw, 10);
      let lowVal = parseInt(lowRaw, 10);
      let pulseVal = noPulseCb.checked ? 72 : parseInt(pulseRaw, 10);

      // Clamp 合法範圍
      highVal = Math.min(260, Math.max(50, highVal));
      lowVal = Math.min(160, Math.max(30, lowVal));
      pulseVal = Math.min(200, Math.max(40, pulseVal));

      // 臨床邏輯防呆：收縮壓應大於舒張壓
      if (highVal <= lowVal) {
        showToast('收縮壓數值應大於舒張壓');
        return;
      }

      const bpState = currentPickerMode === 'enter' ? state.enterBp : state.editingBp;
      bpState.high = highVal;
      bpState.low = lowVal;
      bpState.pulse = pulseVal;
      bpState.noPulse = noPulseCb.checked;

      updateBpDisplay(currentPickerMode);
    }
    modal.classList.remove('active');
  }

  // ==========================================
  // Tab 2: 歷史記錄 (採用事件委託優化)
  // ==========================================
  async function loadHistoryList() {
    const container = document.getElementById('history-list-container');
    const records = await bpDB.getAllRecordsDesc();
    state.records = records;

    if (!container) return;

    if (records.length === 0) {
      container.innerHTML = '<div class="empty-state">尚無歷史紀錄，請至「添加記錄」新增或從右上角匯入 CSV。</div>';
      return;
    }

    const html = records
      .map((r) => {
        const pulseText = r.bpPulse ? r.bpPulse : '-';
        const dateText = csvUtils.formatDateToChinese(r.bpdate);
        const timeText = csvUtils.TIME_NAMES[r.bptime] || '';
        const hasNote = Boolean(r.bpNotes && r.bpNotes.trim());
        const noteBadge = hasNote ? `<span class="history-note-badge">${escapeHtml(r.bpNotes)}</span>` : '';

        return `
        <div class="history-row" data-id="${r._id}">
          <div class="col-bp">${r.bphigh} / ${r.bplow}</div>
          <div class="col-pulse">${pulseText}</div>
          <div class="col-date">${dateText}</div>
          <div class="col-time">${timeText}</div>
          ${noteBadge}
        </div>
      `;
      })
      .join('');

    container.innerHTML = html;
  }

  function setupHistoryListDelegation() {
    const container = document.getElementById('history-list-container');
    if (!container) return;
    // 使用事件委託，避免每一列重複 addEventListener
    container.addEventListener('click', (e) => {
      const row = e.target.closest('.history-row');
      if (row && row.dataset.id) {
        const id = parseInt(row.dataset.id, 10);
        openEditRecordModal(id);
      }
    });
  }

  function openEditRecordModal(id) {
    const record = state.records.find((r) => r._id === id);
    if (!record) return;

    state.editingRecord = record;
    state.editingBp.high = record.bphigh;
    state.editingBp.low = record.bplow;
    state.editingBp.pulse = record.bpPulse || 72;
    state.editingBp.noPulse = record.bpPulse === null || record.bpPulse === undefined;

    const modal = document.getElementById('edit-record-modal');
    const dateInput = document.getElementById('edit-date-input');
    const dateDisplay = document.getElementById('edit-date-display');
    const timeSelect = document.getElementById('edit-time-select');
    const notesInput = document.getElementById('edit-notes-input');

    dateInput.value = record.bpdate;
    dateDisplay.textContent = formatDateWithWeekday(record.bpdate);
    timeSelect.value = record.bptime;
    notesInput.value = record.bpNotes || '';

    updateBpDisplay('edit');

    dateInput.onchange = (e) => {
      dateDisplay.textContent = formatDateWithWeekday(e.target.value);
    };

    modal.classList.add('active');
  }

  async function handleUpdateRecord() {
    if (!state.editingRecord) return;
    const dateInput = document.getElementById('edit-date-input');
    const timeSelect = document.getElementById('edit-time-select');
    const notesInput = document.getElementById('edit-notes-input');

    const updated = {
      bphigh: state.editingBp.high,
      bplow: state.editingBp.low,
      bpPulse: state.editingBp.noPulse ? null : state.editingBp.pulse,
      bpdate: dateInput.value,
      bptime: parseInt(timeSelect.value, 10),
      bpNotes: notesInput.value.trim(),
    };

    try {
      await bpDB.updateRecord(state.editingRecord._id, updated);
      document.getElementById('edit-record-modal').classList.remove('active');
      showToast('記錄已經更新');
      loadHistoryList();
    } catch (err) {
      console.error(err);
      showToast('更新失敗，請重試');
    }
  }

  // 自訂刪除對話框 (P1-5)
  function promptDeleteRecord() {
    if (!state.editingRecord) return;
    document.getElementById('delete-confirm-modal').classList.add('active');
  }

  async function executeDeleteRecord() {
    if (!state.editingRecord) return;
    try {
      await bpDB.deleteRecord(state.editingRecord._id);
      document.getElementById('delete-confirm-modal').classList.remove('active');
      document.getElementById('edit-record-modal').classList.remove('active');
      showToast('記錄已經刪除');
      loadHistoryList();
    } catch (err) {
      console.error(err);
      showToast('刪除失敗');
    }
  }

  // ==========================================
  // Tab 3: 統計分析
  // ==========================================
  async function loadStatistics() {
    const timeFilter = document.getElementById('stat-time-filter').value;
    const periodType = document.getElementById('stat-period-filter').value;
    const container = document.getElementById('stat-content-container');

    const records = await bpDB.getAllRecordsDesc();
    if (!container) return;

    // 時段過濾
    let filtered = records;
    if (timeFilter !== 'all') {
      const t = parseInt(timeFilter, 10);
      filtered = filtered.filter((r) => r.bptime === t);
    }

    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state">尚無符合此條件的統計紀錄。</div>';
      return;
    }

    // 分組計算
    const groups = groupRecordsByPeriod(filtered, periodType);

    // 渲染分組卡片
    const html = groups
      .map((grp) => {
        return `
        <div class="stat-card">
          <div class="stat-card-header">${grp.title}</div>
          <table class="stat-table">
            <thead>
              <tr>
                <th>項目</th>
                <th>最低值</th>
                <th>最高值</th>
                <th>平均值</th>
                <th>趨勢</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>收縮壓</td>
                <td>${grp.stats.high.min}</td>
                <td>${grp.stats.high.max}</td>
                <td>${grp.stats.high.avg}</td>
                <td class="trend-cell">${formatTrend(grp.stats.high.trend)}</td>
              </tr>
              <tr>
                <td>舒張壓</td>
                <td>${grp.stats.low.min}</td>
                <td>${grp.stats.low.max}</td>
                <td>${grp.stats.low.avg}</td>
                <td class="trend-cell">${formatTrend(grp.stats.low.trend)}</td>
              </tr>
              <tr>
                <td>心率</td>
                <td>${grp.stats.pulse.min !== null ? grp.stats.pulse.min : '-'}</td>
                <td>${grp.stats.pulse.max !== null ? grp.stats.pulse.max : '-'}</td>
                <td>${grp.stats.pulse.avg !== null ? grp.stats.pulse.avg : '-'}</td>
                <td class="trend-cell">${formatTrend(grp.stats.pulse.trend)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
      })
      .join('');

    container.innerHTML = html;
  }

  function formatTrend(trend) {
    if (trend === 'up') return '<span class="trend-up">↗</span>';
    if (trend === 'down') return '<span class="trend-down">↘</span>';
    if (trend === 'flat') return '<span class="trend-flat">→</span>';
    return '';
  }

  /**
   * 週期分組計算邏輯（每週附帶起訖日期）
   */
  function groupRecordsByPeriod(records, periodType) {
    const ascList = records.slice().reverse();
    const map = new Map();

    for (const r of ascList) {
      const { key, title } = getPeriodKeyAndTitle(r.bpdate, periodType);
      if (!map.has(key)) {
        map.set(key, { key, title, items: [] });
      }
      map.get(key).items.push(r);
    }

    const groupList = Array.from(map.values());

    let prevGroupStats = null;
    for (const grp of groupList) {
      const stats = calculateGroupStats(grp.items, prevGroupStats);
      grp.stats = stats;
      prevGroupStats = stats;
    }

    return groupList.reverse();
  }

  function calculateGroupStats(items, prevStats) {
    const highs = items.map((i) => i.bphigh);
    const lows = items.map((i) => i.bplow);
    const pulses = items.map((i) => i.bpPulse).filter((p) => p !== null && p !== undefined);

    const calc = (arr) => {
      if (arr.length === 0) return { min: null, max: null, avg: null };
      const min = Math.min(...arr);
      const max = Math.max(...arr);
      const sum = arr.reduce((a, b) => a + b, 0);
      const avg = Math.round(sum / arr.length);
      return { min, max, avg };
    };

    const highStat = calc(highs);
    const lowStat = calc(lows);
    const pulseStat = calc(pulses);

    const getTrend = (currentAvg, prevAvg) => {
      if (currentAvg === null || prevAvg === null || prevAvg === undefined) return '';
      if (currentAvg > prevAvg) return 'up';
      if (currentAvg < prevAvg) return 'down';
      return 'flat';
    };

    highStat.trend = getTrend(highStat.avg, prevStats ? prevStats.high.avg : null);
    lowStat.trend = getTrend(lowStat.avg, prevStats ? prevStats.low.avg : null);
    pulseStat.trend = getTrend(pulseStat.avg, prevStats ? prevStats.pulse.avg : null);

    return {
      high: highStat,
      low: lowStat,
      pulse: pulseStat,
    };
  }

  function getPeriodKeyAndTitle(dateStr, periodType) {
    const [yStr, mStr, dStr] = dateStr.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    const day = parseInt(dStr, 10);
    const dateObj = new Date(year, month - 1, day);

    if (periodType === 'week') {
      const { weekNum, weekYear, startDate, endDate } = getISOWeekDetails(dateObj);
      const startM = startDate.getMonth() + 1;
      const startD = startDate.getDate();
      const endM = endDate.getMonth() + 1;
      const endD = endDate.getDate();
      const key = `${weekYear}-W${String(weekNum).padStart(2, '0')}`;
      const title = `${weekYear} 年 / 第 ${weekNum} 週 (${startM}/${startD} - ${endM}/${endD})`;
      return { key, title };
    }

    if (periodType === 'month') {
      const key = `${year}-${String(month).padStart(2, '0')}`;
      const title = `${year} 年 / ${month} 月`;
      return { key, title };
    }

    if (periodType === 'quarter') {
      const q = Math.floor((month - 1) / 3) + 1;
      const key = `${year}-Q${q}`;
      const title = `${year} 年 / 第 ${q} 季度`;
      return { key, title };
    }

    const key = `${year}`;
    const title = `${year} 年`;
    return { key, title };
  }

  function getISOWeekDetails(d) {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNum = Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
    const weekYear = date.getUTCFullYear();

    const monday = new Date(date);
    monday.setUTCDate(date.getUTCDate() - 3);
    const sunday = new Date(date);
    sunday.setUTCDate(date.getUTCDate() + 3);

    return {
      weekNum,
      weekYear,
      startDate: new Date(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate()),
      endDate: new Date(sunday.getUTCFullYear(), sunday.getUTCMonth(), sunday.getUTCDate()),
    };
  }

  // ==========================================
  // Tab 4: 圖表
  // ==========================================
  async function loadChart() {
    const timeFilter = document.getElementById('chart-time-filter').value;
    const rangeFilter = document.getElementById('chart-range-filter').value;
    const container = document.getElementById('chart-canvas-container');

    if (!state.chartInstance && container) {
      state.chartInstance = new BPChart(container);
    }

    const records = await bpDB.getAllRecordsAsc();
    if (state.chartInstance) {
      state.chartInstance.setData(records, timeFilter, rangeFilter);
    }
  }

  // ==========================================
  // 右上角選單與 CSV 匯入/匯出/關於
  // ==========================================
  function initHeaderMenu() {
    const menuBtn = document.getElementById('menu-overflow-btn');
    const menuDropdown = document.getElementById('menu-dropdown');

    if (menuBtn && menuDropdown) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        menuDropdown.classList.toggle('active');
      });

      document.addEventListener('click', () => {
        menuDropdown.classList.remove('active');
      });
    }

    // 1. 匯出 / 分享 CSV
    document.getElementById('menu-export-btn').addEventListener('click', async () => {
      const records = await bpDB.getAllRecordsDesc();
      if (records.length === 0) {
        showToast('目前尚無資料可匯出');
        return;
      }
      const res = await csvUtils.exportOrShareCSV(records);
      if (res.success) {
        showToast(res.mode === 'share' ? '已喚起分享選單' : 'CSV 下載完成');
      }
    });

    // 2. 匯入 CSV
    const fileInput = document.getElementById('csv-file-input');
    document.getElementById('menu-import-btn').addEventListener('click', () => {
      fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        const text = event.target.result;
        const parsed = csvUtils.parseCSV(text);
        if (parsed.length === 0) {
          showToast('無法讀取有效血壓紀錄，請檢查 CSV 格式');
          fileInput.value = '';
          return;
        }

        const existing = await bpDB.getAllRecordsDesc();
        if (existing.length > 0) {
          openImportConfirmModal(parsed);
        } else {
          const count = await bpDB.importRecords(parsed, false);
          showToast(`${count} 個記錄被成功恢復`);
          refreshCurrentTab();
        }
        fileInput.value = '';
      };
      reader.readAsText(file);
    });

    // 3. 關於
    document.getElementById('menu-about-btn').addEventListener('click', openAboutModal);
  }

  let pendingImportRecords = [];
  function openImportConfirmModal(records) {
    pendingImportRecords = records;
    const modal = document.getElementById('import-confirm-modal');
    modal.classList.add('active');
  }

  async function executeImport(overwrite) {
    document.getElementById('import-confirm-modal').classList.remove('active');
    const count = await bpDB.importRecords(pendingImportRecords, overwrite);
    showToast(`${count} 個記錄被成功恢復`);
    pendingImportRecords = [];
    refreshCurrentTab();
  }

  async function openAboutModal() {
    const modal = document.getElementById('about-modal');
    const storageStatusEl = document.getElementById('about-storage-status');
    const versionEl = document.getElementById('about-version-text');

    if (versionEl && window.APP_VERSION) {
      versionEl.textContent = `版本: ${window.APP_VERSION} (${window.APP_BUILD_DATE || '2026.11'})`;
    }

    if (storageStatusEl) {
      const persisted = await bpDB.isPersisted();
      storageStatusEl.textContent = persisted ? '已啟用持久化保護 ✅' : '標準瀏覽器儲存 ℹ️';
    }

    modal.classList.add('active');
  }

  function refreshCurrentTab() {
    if (state.currentTab === 'history') loadHistoryList();
    if (state.currentTab === 'statistic') loadStatistics();
    if (state.currentTab === 'chart') loadChart();
    if (state.currentTab === 'enter') resetEnterTabState();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ==========================================
  // 全域 Modal 點擊遮罩與 Escape 鍵關閉 (P2-9, P2-2)
  // ==========================================
  function setupModalDismissals() {
    document.querySelectorAll('.modal-overlay').forEach((overlay) => {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          overlay.classList.remove('active');
          if (overlay.id === 'import-confirm-modal') {
            pendingImportRecords = [];
          }
        }
      });
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const activeModals = document.querySelectorAll('.modal-overlay.active');
        activeModals.forEach((m) => {
          m.classList.remove('active');
          if (m.id === 'import-confirm-modal') {
            pendingImportRecords = [];
          }
        });
      }
    });
  }

  // ==========================================
  // 初始化與事件綁定
  // ==========================================
  async function initApp() {
    // 申請持久化儲存
    await bpDB.requestPersistence();

    // 頁籤點擊
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // 頂部選單
    initHeaderMenu();

    // Tab 1 相關 (只綁定一次 listener)
    setupEnterTabListeners();
    await resetEnterTabState();
    document.getElementById('enter-bp-card').addEventListener('click', () => openBpPickerModal('enter'));

    // 歷史紀錄委託監聽
    setupHistoryListDelegation();

    // 編輯視窗相關
    document.getElementById('edit-bp-card').addEventListener('click', () => openBpPickerModal('edit'));
    document.getElementById('edit-cancel-btn').addEventListener('click', () => {
      document.getElementById('edit-record-modal').classList.remove('active');
    });
    document.getElementById('edit-update-btn').addEventListener('click', handleUpdateRecord);
    document.getElementById('edit-delete-btn').addEventListener('click', promptDeleteRecord);

    // 自訂刪除對話框
    document.getElementById('delete-confirm-cancel-btn').addEventListener('click', () => {
      document.getElementById('delete-confirm-modal').classList.remove('active');
    });
    document.getElementById('delete-confirm-ok-btn').addEventListener('click', executeDeleteRecord);

    // BpPicker 視窗確認 / 取消
    document.getElementById('picker-confirm-btn').addEventListener('click', () => closeBpPickerModal(true));
    document.getElementById('picker-cancel-btn').addEventListener('click', () => closeBpPickerModal(false));
    document.getElementById('picker-no-pulse-cb').addEventListener('change', (e) => {
      document.getElementById('picker-pulse-input').disabled = e.target.checked;
    });

    // 統計篩選器
    document.getElementById('stat-time-filter').addEventListener('change', loadStatistics);
    document.getElementById('stat-period-filter').addEventListener('change', loadStatistics);

    // 圖表篩選器
    document.getElementById('chart-time-filter').addEventListener('change', loadChart);
    document.getElementById('chart-range-filter').addEventListener('change', loadChart);

    // 匯入確認對話框
    document.getElementById('import-merge-btn').addEventListener('click', () => executeImport(false));
    document.getElementById('import-overwrite-btn').addEventListener('click', () => executeImport(true));
    document.getElementById('import-cancel-btn').addEventListener('click', () => {
      document.getElementById('import-confirm-modal').classList.remove('active');
      pendingImportRecords = [];
    });

    // 關於對話框
    document.getElementById('about-close-btn').addEventListener('click', () => {
      document.getElementById('about-modal').classList.remove('active');
    });
    document.getElementById('about-refresh-cache-btn').addEventListener('click', async () => {
      const btn = document.getElementById('about-refresh-cache-btn');
      const msg = document.getElementById('about-update-msg');
      btn.disabled = true;
      btn.textContent = '⏳ 正在檢查更新...';
      if (msg) msg.textContent = '';

      let hasUpdate = false;

      try {
        if ('serviceWorker' in navigator) {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg) {
            await reg.update();
            if (reg.waiting || reg.installing) {
              hasUpdate = true;
            }
          }
        }

        // 雙重保險防呆：直接 fetch 線上版 version.js 比對版本字串
        try {
          const res = await fetch('./js/version.js?t=' + Date.now(), { cache: 'no-store' });
          if (res.ok) {
            const text = await res.text();
            const remoteMatch = text.match(/VERSION\s*=\s*['"]([^'"]+)['"]/);
            if (remoteMatch && remoteMatch[1] && remoteMatch[1] !== window.APP_VERSION) {
              hasUpdate = true;
            }
          }
        } catch (fetchErr) {
          // 離線狀態忽略
        }

        if (hasUpdate) {
          btn.textContent = '🚀 發現新版本！';
          if (msg) {
            msg.style.color = '#12a8ee';
            msg.textContent = '發現新版本！正在無縫更新...';
          }
          showToast('發現新版本！即將自動更新...');

          // 1. 清空舊快取，確保重新抓取新資源
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }

          // 2. 監聽新 Service Worker 接管事件 (controllerchange)
          let reloaded = false;
          const triggerReload = () => {
            if (reloaded) return;
            reloaded = true;
            window.location.reload();
          };

          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.addEventListener('controllerchange', triggerReload);

            const reg = await navigator.serviceWorker.getRegistration();
            if (reg) {
              if (reg.waiting) {
                // 傳遞訊息命令 waiting worker 立即跳過等待上位
                reg.waiting.postMessage({ type: 'SKIP_WAITING' });
              } else if (reg.installing) {
                reg.installing.addEventListener('statechange', (e) => {
                  if (e.target.state === 'installed') {
                    e.target.postMessage({ type: 'SKIP_WAITING' });
                  }
                });
              }
            }
          }

          // 3. 安全防呆：若 1.8 秒內 controllerchange 尚未觸發，手動強制重整
          setTimeout(triggerReload, 1800);
          return;
        }

        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = '🔍 檢查更新';
          if (msg) {
            msg.style.color = '#2e7d32';
            msg.textContent = '🎉 目前已經是最新版本！';
          }
          showToast('🎉 目前已經是最新版本！');
          setTimeout(() => {
            if (msg) msg.textContent = '';
          }, 3500);
        }, 500);
      } catch (err) {
        console.warn('檢查更新出錯:', err);
        btn.disabled = false;
        btn.textContent = '🔍 檢查更新';
        if (msg) {
          msg.style.color = '#555555';
          msg.textContent = '目前為最新版本 (離線可用)';
        }
        showToast('目前已經是最新版本');
      }
    });

    // Modal 快捷關閉
    setupModalDismissals();

    // 註冊 Service Worker
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => {
          console.warn('Service Worker 註冊失敗:', err);
        });
      });
    }
  }

  window.addEventListener('DOMContentLoaded', initApp);
})();
