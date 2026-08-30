#!/usr/bin/env node
/**
 * clear-user-data.js — 清空学习数据（9/1 全量上传前一次性脚本）
 *
 * 清空范围：
 *   数据库：batches / questions / mastery_logs / reports / knowledge_progress / unit_progress
 *   云存储：photos/ 前缀下全部文件
 * 保护范围（绝不动）：
 *   users（身份）、knowledge_nodes / custom_nodes（宪法：官方图谱不可改）、debug_logs
 *
 * 用法：
 *   node scripts/clear-user-data.js            # 干跑：只统计，不删除
 *   node scripts/clear-user-data.js --yes      # 执行删除
 *   node scripts/clear-user-data.js --env cloud1-xxx   # 覆盖环境 ID
 *
 * 前置：CloudBase 登录态（登录一次即可）：
 *   HOME=/tmp/cloudbase-home ./node_modules/.bin/tcb login
 */
'use strict';

const { execFile } = require('child_process');

const TCB_BIN = require('path').join(__dirname, '..', 'node_modules', '.bin', 'tcb');
const TCB_HOME = '/tmp/cloudbase-home';
const DEFAULT_ENV = 'cloud1-d8g0ty39wd73f430a';

const CLEAR_COLLECTIONS = ['batches', 'questions', 'mastery_logs', 'reports', 'knowledge_progress', 'unit_progress'];
const PROTECTED = ['users', 'knowledge_nodes', 'custom_nodes', 'debug_logs']; // 仅作展示提示，脚本从不触碰

const args = process.argv.slice(2);
const doDelete = args.includes('--yes');
const envIdx = args.indexOf('--env');
const envId = envIdx >= 0 ? args[envIdx + 1] : DEFAULT_ENV;

function tcb(tcbArgs) {
  return new Promise((resolve) => {
    execFile(TCB_BIN, tcbArgs, {
      env: { ...process.env, HOME: TCB_HOME },
      maxBuffer: 32 * 1024 * 1024,
      timeout: 120000,
    }, (err, stdout, stderr) => {
      const out = (stdout || '') + (stderr || '');
      if (err && /无有效身份信息|please.*login|请使用 cloudbase login/i.test(out)) {
        console.error('\n[✗] CloudBase 登录态失效（/tmp 会被系统清理）。请先执行一次：');
        console.error('    HOME=/tmp/cloudbase-home ./node_modules/.bin/tcb login');
        console.error('    （浏览器扫码授权后重跑本脚本）\n');
        process.exit(2);
      }
      resolve({ err, out });
    });
  });
}

function mgoCommand(commandObj) {
  return JSON.stringify([{ TableName: commandObj.name, CommandType: commandObj.type, Command: JSON.stringify(commandObj.cmd) }]);
}

async function countCollection(name) {
  const { err, out } = await tcb(['db', 'nosql', 'execute', '--env-id', envId, '--json',
    '-c', mgoCommand({ name, type: 'COMMAND', cmd: { count: name, query: {} } })]);
  if (err) return { name, error: out.slice(0, 200) };
  try {
    // 输出可能是 JSON 或含 JSON 的文本，宽松提取 count 结果
    const j = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1));
    const n = j.n ?? j.count ?? j.Response?.n ?? null;
    return { name, count: typeof n === 'number' ? n : out.slice(0, 120) };
  } catch (_) {
    return { name, count: out.slice(0, 120) };
  }
}

async function clearCollection(name) {
  const { err, out } = await tcb(['db', 'nosql', 'execute', '--env-id', envId, '--json',
    '-c', mgoCommand({ name, type: 'DELETE', cmd: { delete: name, deletes: [{ q: {}, limit: 0 }] } })]);
  return { name, ok: !err, detail: err ? out.slice(0, 300) : out.slice(0, 300) };
}

async function storageStats() {
  const { err, out } = await tcb(['storage', 'list', 'photos/', '--env-id', envId]);
  if (err) return { error: out.slice(0, 200) };
  const lines = out.split('\n').filter((l) => /photos\//.test(l));
  return { fileCount: lines.length, sample: lines.slice(0, 3) };
}

(async () => {
  console.log(`环境：${envId}   模式：${doDelete ? '⚠️  执行删除 (--yes)' : '干跑（不删除）'}`);
  console.log(`清空集合：${CLEAR_COLLECTIONS.join(', ')}`);
  console.log(`保护集合（不动）：${PROTECTED.join(', ')}`);
  console.log('云存储：photos/ 前缀全部文件\n');

  console.log('—— 统计 ——');
  const stats = [];
  for (const c of CLEAR_COLLECTIONS) stats.push(await countCollection(c));
  for (const s of stats) {
    console.log(s.error ? `  ${s.name}: 查询失败 ${s.error}` : `  ${s.name}: ${s.count}`);
  }
  const st = await storageStats();
  console.log(st.error ? `  storage photos/: 查询失败 ${st.error}` : `  storage photos/: ${st.fileCount} 个文件${st.sample?.length ? '（如 ' + st.sample[0].trim().slice(0, 60) + '…）' : ''}`);

  if (!doDelete) {
    console.log('\n[干跑结束] 确认无误后加 --yes 执行删除：node scripts/clear-user-data.js --yes');
    return;
  }

  console.log('\n—— 执行删除 ——');
  for (const c of CLEAR_COLLECTIONS) {
    const r = await clearCollection(c);
    console.log(`  ${c}: ${r.ok ? '已清空' : '失败 ' + r.detail}`);
  }
  const rm = await tcb(['storage', 'rm', 'photos/*', '--env-id', envId]);
  console.log(rm.err ? `  storage photos/*: 失败 ${rm.out.slice(0, 300)}` : '  storage photos/*: 已删除');
  console.log('\n[完成] 数据已清空，可开始全量重传。');
})();
