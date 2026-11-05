#!/usr/bin/env node

/**
 * scripts/test-sort.js
 * 驗證 chart.js 的日期與時段排序邏輯
 * 確保在任何輸入順序（亂序、逆序）下，輸出皆嚴格為日期升序。
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// 模擬瀏覽器環境
global.window = { addEventListener: () => {} };
global.document = { createElement: () => ({ getContext: () => ({}) }) };

const chartJsPath = path.join(__dirname, '..', 'js', 'chart.js');
const chartCode = fs.readFileSync(chartJsPath, 'utf8');
eval(chartCode);

const chart = new window.BPChart({
  appendChild: () => {},
  getBoundingClientRect: () => ({ width: 400, height: 300 }),
});

// 故意提供被打亂順序的真實結構樣本
const mockRecords = [
  { bpdate: '2024-06-28', bptime: 3, bphigh: 142, bplow: 80, bpPulse: 72, _id: 10 },
  { bpdate: '2021-11-24', bptime: 0, bphigh: 106, bplow: 78, bpPulse: 78, _id: 1 },
  { bpdate: '2024-06-28', bptime: 3, bphigh: 131, bplow: 79, bpPulse: 79, _id: 9 },
  { bpdate: '2024-02-29', bptime: 1, bphigh: 149, bplow: 93, bpPulse: 84, _id: 5 },
  { bpdate: '2026-06-06', bptime: 0, bphigh: 143, bplow: 87, bpPulse: 73, _id: 20 },
  { bpdate: '2024-02-29', bptime: 0, bphigh: 152, bplow: 91, bpPulse: 88, _id: 4 },
];

const sorted = chart.filterData(mockRecords, 'all', 'all');

console.log('--- 排序輸出結果 ---');
sorted.forEach((r, idx) => {
  console.log(`[${idx + 1}] ${r.bpdate} 時段:${r.bptime} (id:${r._id}) -> ${r.bphigh}/${r.bplow}`);
});

// 驗證斷言：
// 1. 最舊的 2021-11-24 必須在第一筆
assert.strictEqual(sorted[0].bpdate, '2021-11-24', '第一筆應為最舊日期 2021-11-24');

// 2. 2024-02-29 時段 0 必須在 時段 1 之前
assert.strictEqual(sorted[1].bptime, 0, '2024-02-29 凌晨(0) 應在 上午(1) 之前');
assert.strictEqual(sorted[2].bptime, 1, '2024-02-29 上午(1) 應排在第二');

// 3. 2024-06-28 晚上同日同時段，先新增的 _id:9 應在 _id:10 之前
assert.strictEqual(sorted[3]._id, 9, '同日同時段 _id:9 應排在 _id:10 之前');
assert.strictEqual(sorted[4]._id, 10, '同日同時段 _id:10 應排在 _id:9 之後');

// 4. 最新的 2026-06-06 必須在最後一筆
assert.strictEqual(sorted[sorted.length - 1].bpdate, '2026-06-06', '最後一筆應為最新日期 2026-06-06');

console.log('\n✅ 所有日期排序斷言測試全數通過 (ALL ASSERTIONS PASSED)！');
