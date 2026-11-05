/**
 * db.js - IndexedDB 本地資料庫封裝與儲存持久化
 * 資料表結構對齊原版 SQLite bloodpressure 表
 */

const DB_NAME = 'my_blood_pressure_db';
const DB_VERSION = 1;
const STORE_NAME = 'bloodpressure';

class BPDatabase {
  constructor() {
    this.db = null;
  }

  async init() {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, {
            keyPath: '_id',
            autoIncrement: true,
          });
          // 建立索引以加速排序與查詢
          store.createIndex('bpdate', 'bpdate', { unique: false });
          store.createIndex('bptime', 'bptime', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('IndexedDB 打開失敗:', event.target.error);
        reject(event.target.error);
      };
    });
  }

  /**
   * 請求持久化儲存權限 (Persistent Storage)
   */
  async requestPersistence() {
    if (navigator.storage && navigator.storage.persist) {
      try {
        const isPersisted = await navigator.storage.persist();
        return isPersisted;
      } catch (err) {
        console.warn('持久化儲存申請出錯:', err);
      }
    }
    return false;
  }

  /**
   * 檢查當前儲存是否已處於持久化狀態
   */
  async isPersisted() {
    if (navigator.storage && navigator.storage.persisted) {
      try {
        return await navigator.storage.persisted();
      } catch (err) {
        console.warn('查詢持久化狀態出錯:', err);
      }
    }
    return false;
  }

  /**
   * 新增一筆血壓記錄
   * @param {Object} record { bphigh, bplow, bpdate, bptime, bpPulse, bpNotes }
   */
  async addRecord(record) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.add({
        bphigh: Number(record.bphigh),
        bplow: Number(record.bplow),
        bpdate: String(record.bpdate), // YYYY-MM-DD
        bptime: Number(record.bptime), // 0: 凌晨, 1: 上午, 2: 下午, 3: 晚上
        bpPulse: record.bpPulse !== null && record.bpPulse !== undefined && record.bpPulse !== '' ? Number(record.bpPulse) : null,
        bpNotes: record.bpNotes ? String(record.bpNotes) : '',
        createdAt: Date.now(),
      });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * 更新一筆記錄
   */
  async updateRecord(id, record) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const data = getReq.result;
        if (!data) {
          reject(new Error('找不到該筆記錄'));
          return;
        }
        data.bphigh = Number(record.bphigh);
        data.bplow = Number(record.bplow);
        data.bpdate = String(record.bpdate);
        data.bptime = Number(record.bptime);
        data.bpPulse = record.bpPulse !== null && record.bpPulse !== undefined && record.bpPulse !== '' ? Number(record.bpPulse) : null;
        data.bpNotes = record.bpNotes ? String(record.bpNotes) : '';
        data.updatedAt = Date.now();

        const putReq = store.put(data);
        putReq.onsuccess = () => resolve(true);
        putReq.onerror = () => reject(putReq.error);
      };
      getReq.onerror = () => reject(getReq.error);
    });
  }

  /**
   * 刪除一筆記錄
   */
  async deleteRecord(id) {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * 清空所有記錄（覆蓋匯入時使用）
   */
  async clearAll() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * 取得所有記錄，按原始排序邏輯降序排列（最新在前）：
   * ORDER BY date(bpdate) DESC, bptime DESC, _id DESC
   */
  async getAllRecordsDesc() {
    await this.init();
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME], 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const list = req.result || [];
        list.sort((a, b) => {
          if (a.bpdate !== b.bpdate) {
            return b.bpdate.localeCompare(a.bpdate);
          }
          if (a.bptime !== b.bptime) {
            return b.bptime - a.bptime;
          }
          return (b._id || 0) - (a._id || 0);
        });
        resolve(list);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /**
   * 取得所有記錄，按升序排列（繪製圖表使用）：
   * ORDER BY date(bpdate) ASC, bptime ASC, _id ASC
   */
  async getAllRecordsAsc() {
    const list = await this.getAllRecordsDesc();
    return list.reverse();
  }

  /**
   * 取得最新的一筆記錄，作為添加記錄時的預設值
   */
  async getLatestRecord() {
    const list = await this.getAllRecordsDesc();
    return list.length > 0 ? list[0] : null;
  }

  /**
   * 批次匯入記錄
   * @param {Array} records 
   * @param {boolean} overwrite 若為 true 則先清空再匯入；false 則合併略過完全重複
   * @returns {number} 成功新增的筆數
   */
  async importRecords(records, overwrite = false) {
    await this.init();
    if (overwrite) {
      await this.clearAll();
    }

    const getDedupeKey = (r) => {
      const pulseKey = (r.bpPulse === null || r.bpPulse === undefined || r.bpPulse === '') ? 'N' : String(r.bpPulse);
      return `${r.bpdate}|${r.bptime}|${r.bphigh}|${r.bplow}|${pulseKey}|${r.bpNotes || ''}`;
    };

    const existing = overwrite ? [] : await this.getAllRecordsDesc();
    const existingKeys = new Set(existing.map(getDedupeKey));

    let addedCount = 0;
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction([STORE_NAME], 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      for (const item of records) {
        const key = getDedupeKey(item);
        if (!overwrite && existingKeys.has(key)) {
          continue; // 略過完全重複
        }
        store.add({
          bphigh: Number(item.bphigh),
          bplow: Number(item.bplow),
          bpdate: String(item.bpdate),
          bptime: Number(item.bptime),
          bpPulse: item.bpPulse !== null && item.bpPulse !== undefined && item.bpPulse !== '' ? Number(item.bpPulse) : null,
          bpNotes: item.bpNotes ? String(item.bpNotes) : '',
          createdAt: Date.now(),
        });
        existingKeys.add(key);
        addedCount++;
      }

      tx.oncomplete = () => resolve(addedCount);
      tx.onerror = () => reject(tx.error);
    });
  }
}

window.bpDB = new BPDatabase();
