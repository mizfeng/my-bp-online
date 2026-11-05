/**
 * csv.js - CSV 檔案匯出、匯入解析與原生分享 (Web Share API)
 * 完全相容原版《我的血壓》CSV 規格
 */

const TIME_NAMES = ['凌晨', '上午', '下午', '晚上'];
const TIME_RANGES = [
  '凌晨 (00:00 - 06:00)',
  '上午 (06:00 - 12:00)',
  '下午 (12:00 - 18:00)',
  '晚上 (18:00 - 24:00)',
];

/**
 * 將標準 Date 物件或 YYYY-MM-DD 字串轉為原版中文無補零格式：
 * 例如 "2024-03-01" -> "2024年3月1日"
 */
function formatDateToChinese(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10);
    const day = parseInt(parts[2], 10);
    return `${year}年${month}月${day}日`;
  }
  return dateStr;
}

/**
 * 將中文無補零日期解析為 YYYY-MM-DD：
 * 例如 "2024年3月1日" -> "2024-03-01"
 */
function parseChineseDateToISO(chineseDateStr) {
  if (!chineseDateStr) return '';
  const match = chineseDateStr.trim().match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (match) {
    const y = match[1];
    const m = match[2].padStart(2, '0');
    const d = match[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return chineseDateStr;
}

/**
 * 將時段中文名稱轉為代碼 0~3
 */
function parseTimePeriodToCode(periodStr) {
  const p = (periodStr || '').trim();
  const idx = TIME_NAMES.indexOf(p);
  return idx >= 0 ? idx : 1; // 預設上午
}

/**
 * 將記錄陣列產生原版 CSV 字串
 * @param {Array} records 
 * @returns {string} CSV 格式文字
 */
function generateCSV(records) {
  const header = '血壓,心率,日期,時間,附註';
  const rows = [header];

  for (const r of records) {
    const bp = `"${r.bphigh} / ${r.bplow}"`;
    const pulse = r.bpPulse !== null && r.bpPulse !== undefined && r.bpPulse !== '' ? `"${r.bpPulse}"` : '""';
    const date = `"${formatDateToChinese(r.bpdate)}"`;
    const time = `"${TIME_NAMES[r.bptime] || '上午'}"`;
    // 若附註中有雙引號，轉義為兩個雙引號
    const cleanNote = (r.bpNotes || '').replace(/"/g, '""');
    const note = `"${cleanNote}"`;

    rows.push(`${bp},${pulse},${date},${time},${note}`);
  }

  return rows.join('\r\n') + '\r\n';
}

/**
 * 解析 CSV 文字為記錄物件陣列
 * @param {string} csvText 
 * @returns {Array} 解析後的記錄陣列
 */
function parseCSV(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  // 檢查並跳過標頭列
  const firstLine = lines[0].replace(/"/g, '').trim();
  const startIndex = firstLine.includes('血壓') ? 1 : 0;
  const records = [];

  for (let i = startIndex; i < lines.length; i++) {
    const row = parseCSVRow(lines[i]);
    if (!row || row.length < 4) continue;

    const bpStr = (row[0] || '').trim();
    const pulseStr = (row[1] || '').trim();
    const dateStr = (row[2] || '').trim();
    const timeStr = (row[3] || '').trim();
    const noteStr = (row[4] || '').trim();

    // 解析收縮壓與舒張壓，格式例如 "138 / 98" 或 "138/98"
    const bpMatch = bpStr.match(/(\d+)\s*\/\s*(\d+)/);
    if (!bpMatch) continue;

    const bphigh = parseInt(bpMatch[1], 10);
    const bplow = parseInt(bpMatch[2], 10);
    const bpPulse = pulseStr ? parseInt(pulseStr, 10) : null;
    const bpdate = parseChineseDateToISO(dateStr);
    const bptime = parseTimePeriodToCode(timeStr);

    records.push({
      bphigh,
      bplow,
      bpPulse: isNaN(bpPulse) ? null : bpPulse,
      bpdate,
      bptime,
      bpNotes: noteStr,
    });
  }

  return records;
}

/**
 * 簡易而穩定的雙引號 CSV 行解析器
 */
function parseCSVRow(rowStr) {
  const fields = [];
  let inQuotes = false;
  let currentField = '';

  for (let i = 0; i < rowStr.length; i++) {
    const char = rowStr[i];
    if (char === '"') {
      if (inQuotes && rowStr[i + 1] === '"') {
        currentField += '"';
        i++; // 略過轉義的引號
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      fields.push(currentField);
      currentField = '';
    } else {
      currentField += char;
    }
  }
  fields.push(currentField);
  return fields;
}

/**
 * 匯出或分享 CSV 檔案
 * 手機瀏覽器優先呼叫系統原生分享 (Web Share API，可直接丟給 LINE、Google Drive)
 * 不支援時自動降級觸發本機下載
 */
async function exportOrShareCSV(records) {
  const csvContent = generateCSV(records);
  // 加 UTF-8 BOM 以防部分手機或軟體開啟亂碼
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const filename = 'my blood pressure.csv';

  // 嘗試透過 Web Share API 檔案分享
  if (navigator.canShare && navigator.share) {
    try {
      const file = new File([blob], filename, { type: 'text/csv' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: '我的血壓備份',
          text: '我的血壓歷史紀錄 CSV 備份檔案',
        });
        return { success: true, mode: 'share' };
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        // 使用者主動取消分享
        return { success: false, cancelled: true };
      }
      console.warn('Web Share 失敗，轉為直接下載:', err);
    }
  }

  // 降級為常規下載
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { success: true, mode: 'download' };
}

window.csvUtils = {
  TIME_NAMES,
  TIME_RANGES,
  formatDateToChinese,
  parseChineseDateToISO,
  parseTimePeriodToCode,
  generateCSV,
  parseCSV,
  exportOrShareCSV,
};
