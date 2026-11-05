#!/usr/bin/env node

/**
 * scripts/sync-version.js
 * Git pre-commit 自動同步腳本：
 * 自動讀取 js/version.js 的 VERSION，並確保 sw.js 頂部的 // build: <version> 保持同步，
 * 若有變動則自動將 sw.js 加入 git 暫存區 (git add)。
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const versionPath = path.join(__dirname, '..', 'js', 'version.js');
const swPath = path.join(__dirname, '..', 'sw.js');

if (!fs.existsSync(versionPath) || !fs.existsSync(swPath)) {
  process.exit(0);
}

const versionContent = fs.readFileSync(versionPath, 'utf8');
const match = versionContent.match(/VERSION\s*=\s*['"]([^'"]+)['"]/);

if (!match) {
  process.exit(0);
}

const currentVersion = match[1];
let swContent = fs.readFileSync(swPath, 'utf8');

// 檢查 sw.js 是否已有該版本的 build 標記
const buildTagRegex = /\/\/\s*build:\s*[^\r\n]*/;
const expectedTag = `// build: ${currentVersion}`;

if (buildTagRegex.test(swContent)) {
  const currentTagMatch = swContent.match(buildTagRegex);
  if (currentTagMatch && currentTagMatch[0] !== expectedTag) {
    swContent = swContent.replace(buildTagRegex, expectedTag);
    fs.writeFileSync(swPath, swContent, 'utf8');
    execSync(`git add "${swPath}"`);
    console.log(`[pre-commit] 自動同步 sw.js 版本標記 -> ${expectedTag}`);
  }
} else {
  // 若 sw.js 頂部尚未有 build 標記，插入到開頭
  swContent = `${expectedTag}\n` + swContent;
  fs.writeFileSync(swPath, swContent, 'utf8');
  execSync(`git add "${swPath}"`);
  console.log(`[pre-commit] 自動新增 sw.js 版本標記 -> ${expectedTag}`);
}
