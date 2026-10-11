#!/usr/bin/env node
/**
 * 同步 packageSync 分包声明 —— 让 app.json 适配「目录在不在」两种现实。
 *
 * 背景（决策 042/060）：智学网页面（miniprogram/packageSync/）在 .gitignore 内，不进 public 仓库。
 *   但 app.json 本身要进仓库 —— 于是出现「声明与目录不同源」：
 *     · 本地：目录在（被 gitignore 只是不进 git）→ 需要声明，否则页面跳不过去
 *     · CI  ：仓库里没有该目录          → 不能声明，否则微信报 code 10009 拒绝上传
 *   本脚本按「目录是否存在」自动增删声明，两种环境都正确。
 *
 * 做法：JSON.parse 判结构 → 按缩进逐行增删 → JSON.parse 验回写。
 *      不用 JSON.stringify 整体回写，避免重排无关格式产生噪音 diff。
 *
 * 用法：
 *   node scripts/sync-subpackage.mjs          # 按实际情况同步（本地/CI 通用）
 *   node scripts/sync-subpackage.mjs --check  # 只检查不改，不一致时 exit 1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const APP_JSON = path.join(ROOT, 'miniprogram/app.json');
const PAGE = path.join(ROOT, 'miniprogram/packageSync/pages/zhixue/zhixue');

const checkOnly = process.argv.includes('--check');
// 目录存在**且有页面文件**才算数（空目录微信同样会拒绝）
const exists = fs.existsSync(PAGE + '.js') || fs.existsSync(PAGE + '.wxml');

const raw = fs.readFileSync(APP_JSON, 'utf8');
const parsed = JSON.parse(raw); // 结构合法性早失败早报错
const declared = (parsed.subPackages || []).some((s) => s && s.root === 'packageSync');

if (exists === declared) {
  console.log(`✅ 无需改动：packageSync 目录${exists ? '存在' : '不存在'}，声明也${declared ? '在' : '不在'}`);
  process.exit(0);
}
if (checkOnly) {
  console.error(`❌ 不一致：目录${exists ? '存在' : '不存在'}，但 app.json 里声明${declared ? '在' : '不在'}`);
  process.exit(1);
}

const lines = raw.split('\n');

if (exists) {
  // —— 注入：找到 subPackages 数组内最后一个 `}` 行（即最后一块的收尾），补逗号后接新块 ——
  const subIdx = lines.findIndex((l) => /"subPackages"\s*:/.test(l));
  if (subIdx < 0) { console.error('❌ app.json 里没有 subPackages'); process.exit(1); }
  // subPackages 数组的缩进 = 2 空格；块内 pages 数组的 `]` 缩进更深，靠缩进区分
  const arrIndent = (lines[subIdx].match(/^\s*/) || [''])[0];
  let lastClose = -1;
  for (let i = subIdx + 1; i < lines.length; i++) {
    if (lines[i] === arrIndent + ']' || lines[i] === arrIndent + '],') break;   // 数组收尾
    if (lines[i] === arrIndent + '  }' || lines[i] === arrIndent + '  },') lastClose = i;
  }
  if (lastClose < 0) { console.error('❌ 没找到可插入位置'); process.exit(1); }
  const indent = (lines[lastClose].match(/^\s*/) || [''])[0];
  lines[lastClose] = indent + '},';
  lines.splice(lastClose + 1, 0,
    indent + '{',
    indent + '  "root": "packageSync",',
    indent + '  "name": "sync",',
    indent + '  "pages": [',
    indent + '    "pages/zhixue/zhixue"',
    indent + '  ]',
    indent + '}');
  console.log('＋ 已注入 packageSync 分包声明（目录存在）');
} else {
  // —— 移除：从 `"root": "packageSync"` 行向上找块首 `{`、向下找块尾 `}`，整块删掉 ——
  const rootIdx = lines.findIndex((l) => /"root"\s*:\s*"packageSync"/.test(l));
  if (rootIdx < 0) { console.error('❌ 找不到 packageSync 声明'); process.exit(1); }
  let start = rootIdx, end = rootIdx;
  while (start > 0 && !/^\s*\{\s*,?\s*$/.test(lines[start])) start--;
  while (end < lines.length - 1 && !/^\s*\}\s*,?\s*$/.test(lines[end])) end++;
  const wasLast = !lines.slice(end + 1).some((l) => /"root"\s*:/.test(l)) ||
                  /^\s*\]/.test((lines.find((l, i) => i > end && /^\s*\]/.test(l)) || ''));
  lines.splice(start, end - start + 1);
  if (wasLast) {
    // 它原来是最后一块 → 前一块末尾的逗号要去掉
    for (let i = start - 1; i >= 0; i--) {
      if (/^\s*\}\s*,\s*$/.test(lines[i])) { lines[i] = lines[i].replace(/,\s*$/, ''); break; }
    }
  }
  console.log('－ 已移除 packageSync 分包声明（目录不存在，避免微信 code 10009）');
}

const out = lines.join('\n');
JSON.parse(out); // 回写前再次确认合法
fs.writeFileSync(APP_JSON, out);
