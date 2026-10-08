#!/usr/bin/env node
/**
 * 密钥扫描（推送前必跑）
 *
 * 用法：
 *   node scripts/scan-secrets.mjs            # 扫工作区（tracked + scripts/ 未跟踪 + .env 提示）
 *   node scripts/scan-secrets.mjs --history  # 额外扫全部 git 历史（改历史/强推前后用）
 *
 * 纪律来源：doc/standards/开发经验.md §51（2026-09-06 DeepSeek key 被盗刷事故）
 * 原则：只输出掩码，绝不打印明文密钥；命中即 exit 1，阻断提交/推送流程。
 */
import { execSync } from 'node:child_process';
import { readFileSync, existsSync, statSync } from 'node:fs';

const PATTERNS = [
  ['sk-key', /sk-[A-Za-z0-9._-]{20,}/g],
  ['腾讯云AKID', /AKID[A-Za-z0-9]{20,}/g],
  ['AWS-AKIA', /AKIA[0-9A-Z]{16}/g],
  ['GitHub-token', /gh[pousr]_[A-Za-z0-9]{30,}/g],
  ['赋值式密钥', /(?:api[_-]?key|apikey|secret|passwd|password|access[_-]?token|appsecret)\s*[:=]\s*['"]([^'"\s]{12,})['"]/gi],
  ['Bearer', /Bearer\s+[A-Za-z0-9._-]{20,}/g],
  ['webhook', /(?:hooks\.slack\.com\/\S+|oapi\.dingtalk\.com\/\S+|sctapi\.ftqq\.com\/\S+)/g],
  ['连接串', /(?:mongodb|mysql|postgres|redis):\/\/[^\s'"]{10,}/g],
];

// 已知误报：第三方库单词子串、字体 base64、占位符变量
const IGNORE_PATH = [
  /node_modules\//, /\.git\//, /\.npmcache/, /\.venv/,
  /packageDiagnose\/towxml\//,       // "sk-list..." 等单词子串
  /styles\/katex\.wxss/,             // 字体 base64 里的 AKIA* 巧合
  /reasonix_global_config_merged\.toml/, // ${ENV_VAR} 占位符
  /scan-secrets\.mjs$/,              // 本脚本自身的模式定义
];
const TEXT_EXT = /\.(js|mjs|cjs|ts|json|md|txt|sh|yml|yaml|py|wxml|wxss|toml|env)$/i;
const mask = (s) => `${s.slice(0, 6)}...${s.slice(-4)}(len=${s.length})`;
const ignored = (p) => IGNORE_PATH.some((r) => r.test(p));

let bad = 0;
let scanned = 0;

function scanText(label, text, path, count = true) {
  for (const [name, pat] of PATTERNS) {
    pat.lastIndex = 0;
    let m;
    while ((m = pat.exec(text))) {
      const raw = m[1] || m[0];
      console.log(`  ${count ? '✗' : '⚠'} [${label}] ${path} → ${name} ${mask(raw)}`);
      if (count) bad++;
    }
  }
  scanned++;
}

function scanFile(label, path) {
  if (ignored(path) || !existsSync(path) || !statSync(path).isFile()) return;
  if (!TEXT_EXT.test(path)) return;
  let text;
  try { text = readFileSync(path, 'utf8'); } catch { return; }
  scanText(label, text, path);
}

console.log('== 密钥扫描（输出均为掩码）==');

// A. git 跟踪的文件
console.log('-- A. git 跟踪文件 --');
let tracked;
try {
  tracked = execSync('git ls-files', { encoding: 'utf8' }).split('\n').filter(Boolean);
} catch { tracked = []; }
for (const f of tracked) scanFile('tracked', f);

// B. 常见未跟踪风险位置（scripts/ 与根目录敏感文件）
console.log('-- B. 未跟踪风险位置（本地文件，勿入库）--');
let untracked = [];
try {
  untracked = execSync('git ls-files --others --exclude-standard scripts/', { encoding: 'utf8' }).split('\n').filter(Boolean);
} catch { /* ignore */ }
for (const f of untracked) scanFile('untracked', f);
for (const f of ['.env', '.env.local', '.env.production']) {
  if (existsSync(f)) {
    const before = bad;
    scanText('local', readFileSync(f, 'utf8'), f, false);
    if (bad === before) console.log(`  · ${f} 已扫（gitignored，正常）`);
  }
}

// C. 可选：全部 git 历史（逐对象扫描，较慢但可靠）
if (process.argv.includes('--history')) {
  console.log('-- C. git 历史（全部对象，约 10-30 秒）--');
  const objs = execSync('git rev-list --objects --all', { encoding: 'utf8' }).split('\n')
    .map((l) => l.split(' '))
    .filter((p) => p.length === 2 && TEXT_EXT.test(p[1]) && !ignored(p[1]));
  console.log(`   待扫对象: ${objs.length}`);
  for (const [sha, path] of objs) {
    try {
      const body = execSync(`git cat-file -p ${sha}`, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
      scanText('history', body, path);
    } catch { /* 二进制/缺失对象，跳过 */ }
  }
}

console.log('');
if (bad === 0) {
  console.log(`✅ 未发现真密钥（扫描 ${scanned} 个文件/对象）`);
  process.exit(0);
} else {
  console.log(`❌ 发现 ${bad} 处疑似密钥 —— 禁止提交/推送！先脱敏（改 process.env 读）再重跑`);
  process.exit(1);
}
