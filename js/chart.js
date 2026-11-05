/**
 * chart.js - 純 Canvas 走勢折線圖
 * 忠實還原原版配色與數值標記，支援高解析度螢幕與橫向平移
 */

class BPChart {
  constructor(canvasContainer) {
    this.container = canvasContainer;
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.container.appendChild(this.canvas);

    // 配色定義（對齊原版 AChartEngine 配色）
    this.colors = {
      systolic: '#29b6f6', // 天藍色
      diastolic: '#8bc34a', // 黃綠色
      pulse: '#ef5350', // 珊瑚紅
      grid: '#e0e0e0', // 淺灰格線
      text: '#555555', // 軸文字
      bg: '#ffffff',
    };

    // 監聽視窗縮放以自適應重繪
    window.addEventListener('resize', () => this.resizeAndDraw());
  }

  setData(records, timeFilter = 'all', rangeFilter = 'week') {
    this.rawRecords = records;
    this.timeFilter = timeFilter;
    this.rangeFilter = rangeFilter;
    this.filteredRecords = this.filterData(records, timeFilter, rangeFilter);
    this.resizeAndDraw();
  }

  /**
   * 根據時段與時間跨度進行資料過濾
   * 特別規格：時間範圍以「資料中最新一筆紀錄的日期」為基準往前推算
   */
  filterData(records, timeFilter, rangeFilter) {
    if (!records || records.length === 0) return [];

    // 1. 時段篩選
    let list = records.slice();
    if (timeFilter !== 'all') {
      const targetTime = parseInt(timeFilter, 10);
      list = list.filter((r) => r.bptime === targetTime);
    }

    if (list.length === 0) return [];

    // 依日期升序排序
    list.sort((a, b) => {
      if (a.bpdate !== b.bpdate) return a.bpdate.localeCompare(b.bpdate);
      if (a.bptime !== b.bptime) return a.bptime - b.bptime;
      return (a._id || 0) - (b._id || 0);
    });

    if (rangeFilter === 'all') {
      return list;
    }

    // 最新一筆紀錄的日期作為基準
    const latestRecord = list[list.length - 1];
    const latestDate = new Date(latestRecord.bpdate);
    const startDate = new Date(latestDate);

    switch (rangeFilter) {
      case 'week':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case '3months':
        startDate.setMonth(startDate.getMonth() - 3);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
    }

    const startISO = startDate.toISOString().split('T')[0];
    return list.filter((r) => r.bpdate >= startISO);
  }

  resizeAndDraw() {
    if (!this.canvas) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(rect.width, 320);
    const height = Math.max(rect.height || 360, 320);

    // 依資料點多寡計算內容寬度（若資料點多則可橫向滑動）
    const minPointWidth = 46;
    const dataPoints = (this.filteredRecords || []).length;
    const contentWidth = Math.max(width, dataPoints * minPointWidth + 80);

    this.canvas.width = contentWidth * dpr;
    this.canvas.height = height * dpr;
    this.canvas.style.width = `${contentWidth}px`;
    this.canvas.style.height = `${height}px`;

    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
    this.draw(contentWidth, height);
  }

  draw(width, height) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);

    const records = this.filteredRecords || [];
    if (records.length === 0) {
      ctx.fillStyle = '#888888';
      ctx.font = '14px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('此區間內無血壓紀錄', width / 2, height / 2);
      return;
    }

    // 佈局邊距
    const padLeft = 45;
    const padRight = 25;
    const padTop = 30;
    const padBottom = 65; // 留給 X 軸日期與圖例
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;

    // 計算 Y 軸極值（以 10 為單位對齊）
    let minY = 60;
    let maxY = 160;

    for (const r of records) {
      if (r.bphigh) maxY = Math.max(maxY, r.bphigh);
      if (r.bplow) minY = Math.min(minY, r.bplow);
      if (r.bpPulse) {
        maxY = Math.max(maxY, r.bpPulse);
        minY = Math.min(minY, r.bpPulse);
      }
    }

    // 向上向下取整至 10 的倍數，並保留邊距
    minY = Math.max(40, Math.floor((minY - 10) / 10) * 10);
    maxY = Math.min(240, Math.ceil((maxY + 15) / 10) * 10);

    // 1. 繪製水平格線與 Y 軸刻度 (每 10 或 20 畫一條)
    const step = maxY - minY > 90 ? 20 : 10;
    ctx.lineWidth = 1;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.font = '11px -apple-system, sans-serif';

    for (let val = minY; val <= maxY; val += step) {
      const y = padTop + plotH - ((val - minY) / (maxY - minY)) * plotH;

      ctx.strokeStyle = this.colors.grid;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(padLeft + plotW, y);
      ctx.stroke();

      ctx.fillStyle = this.colors.text;
      ctx.fillText(String(val), padLeft - 6, y);
    }

    // Y 軸單位
    ctx.save();
    ctx.fillStyle = '#666666';
    ctx.font = '10px -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('mmHg / bpm', padLeft, padTop - 12);
    ctx.restore();

    // 2. 計算各點的 X 座標
    const stepX = records.length === 1 ? plotW / 2 : plotW / (records.length - 1);
    const getX = (i) => (records.length === 1 ? padLeft + plotW / 2 : padLeft + i * stepX);
    const getY = (val) => padTop + plotH - ((val - minY) / (maxY - minY)) * plotH;

    // 3. 繪製 X 軸日期與時段標籤
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = this.colors.text;
    ctx.font = '10px -apple-system, sans-serif';

    const timeShortNames = ['夜', '早', '午', '晚'];

    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      const x = getX(i);

      // 日期 M/D
      const dParts = r.bpdate.split('-');
      const dateLabel = `${parseInt(dParts[1], 10)}/${parseInt(dParts[2], 10)}`;
      ctx.fillText(dateLabel, x, padTop + plotH + 8);

      // 時段標記
      ctx.fillStyle = '#888888';
      ctx.fillText(timeShortNames[r.bptime] || '', x, padTop + plotH + 22);
      ctx.fillStyle = this.colors.text;
    }

    // 4. 繪製折線與節點數值 (依序：收縮壓、舒張壓、心率)
    this.drawLineSeries(records, (r) => r.bphigh, this.colors.systolic, getX, getY);
    this.drawLineSeries(records, (r) => r.bplow, this.colors.diastolic, getX, getY);
    this.drawLineSeries(records, (r) => r.bpPulse, this.colors.pulse, getX, getY);

    // 5. 繪製圖例 (Legend) 位於左下方
    this.drawLegend(padLeft, height - 20);
  }

  drawLineSeries(records, valFn, color, getX, getY) {
    const ctx = this.ctx;
    const points = [];

    for (let i = 0; i < records.length; i++) {
      const val = valFn(records[i]);
      if (val !== null && val !== undefined && !isNaN(val)) {
        points.push({ x: getX(i), y: getY(val), val });
      }
    }

    if (points.length === 0) return;

    // 繪製連線
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    // 繪製節點圓點與數值標記
    for (const pt of points) {
      // 圓點
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // 數值文字
      ctx.fillStyle = color;
      ctx.font = 'bold 10px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(String(pt.val), pt.x, pt.y - 4);
    }
  }

  drawLegend(x, y) {
    const ctx = this.ctx;
    const items = [
      { label: '收縮壓', color: this.colors.systolic },
      { label: '舒張壓', color: this.colors.diastolic },
      { label: '心率', color: this.colors.pulse },
    ];

    let curX = x;
    ctx.font = '12px -apple-system, sans-serif';
    ctx.textBaseline = 'middle';

    for (const item of items) {
      // 畫實心線條指示
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(curX, y);
      ctx.lineTo(curX + 16, y);
      ctx.stroke();

      // 畫線條中間的小圓點
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(curX + 8, y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = item.color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      curX += 22;
      ctx.fillStyle = '#333333';
      ctx.textAlign = 'left';
      ctx.fillText(item.label, curX, y);
      curX += ctx.measureText(item.label).width + 16;
    }
  }
}

window.BPChart = BPChart;
