#!/usr/bin/env node
// ============ 同步 cloudfunctions/shared/ 到各云函数的 lib/ ============
//
// 为什么需要这个脚本：
//   每个云函数部署时**只上传自己的目录**（project.config.json 的 cloudfunctionRoot），
//   所以云函数里 `require('../shared/x')` 在云端会**找不到文件**。
//   但把同一份代码复制到多个云函数目录，又会带来**漂移风险**（改了一处忘了另一处）。
//   折中：源文件只放 cloudfunctions/shared/，用本脚本复制到各函数的 lib/，
//   并提供 `--check` 模式在 CI/提交前校验副本是否与源文件一致。
//
// 用法：
//   node scripts/sync-shared.mjs           # 同步（覆盖副本）
//   node scripts/sync-shared.mjs --check   # 只校验，不一致则退出码 1
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = path.join(ROOT, 'cloudfunctions/shared');

// 需要分发到哪些云函数（函数名 → 目标 lib 目录）
const TARGETS = ['ragService', 'reportService'];

// 只分发这些文件（test/ 不分发）
const FILES = fs.readdirSync(SRC_DIR).filter((f) => f.endsWith('.js'));

const checkOnly = process.argv.includes('--check');
let drift = 0;

for (const t of TARGETS) {
  const libDir = path.join(ROOT, 'cloudfunctions', t, 'lib');
  if (!checkOnly) fs.mkdirSync(libDir, { recursive: true });
  for (const f of FILES) {
    const src = path.join(SRC_DIR, f);
    const dst = path.join(libDir, f);
    const srcText = fs.readFileSync(src, 'utf8');
    if (checkOnly) {
      const dstText = fs.existsSync(dst) ? fs.readFileSync(dst, 'utf8') : null;
      if (dstText !== srcText) {
        console.error(`✖ 副本不一致：cloudfunctions/${t}/lib/${f}`);
        drift++;
      }
      continue;
    }
    fs.writeFileSync(dst, srcText);
    console.log(`  → cloudfunctions/${t}/lib/${f}`);
  }
}

if (checkOnly) {
  if (drift) {
    console.error(`\n✖ 有 ${drift} 个副本与 cloudfunctions/shared/ 不一致。`);
    console.error('  跑 `node scripts/sync-shared.mjs` 同步后再提交。');
    process.exit(1);
  }
  console.log(`✔ 全部副本与源文件一致（${FILES.length} 个文件 × ${TARGETS.length} 个函数）`);
} else {
  console.log(`\n✔ 已同步 ${FILES.length} 个文件到 ${TARGETS.length} 个云函数`);
}
