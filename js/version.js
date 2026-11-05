/**
 * version.js - 全專案唯一的版本號來源 (Single Source of Truth)
 * 同時注入主頁面 Window 與 Service Worker (self)
 * 未來發布新版本「只需要修改此檔案」即可！
 */
(function () {
  'use strict';

  var VERSION = 'v1.0.10';
  var BUILD_DATE = '2026.11';

  if (typeof window !== 'undefined') {
    window.APP_VERSION = VERSION;
    window.APP_BUILD_DATE = BUILD_DATE;
  }
  if (typeof self !== 'undefined') {
    self.APP_VERSION = VERSION;
    self.APP_BUILD_DATE = BUILD_DATE;
  }
  if (typeof globalThis !== 'undefined') {
    globalThis.APP_VERSION = VERSION;
    globalThis.APP_BUILD_DATE = BUILD_DATE;
  }
})();
