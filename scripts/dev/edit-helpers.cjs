'use strict';
// ============ AI 操作辅助：把「文本锚点 / 字符串注入」从手打变成派生 ============
// 背景：2026-09-25 一个 turn 内同类失败 4 次（行号猜锚点 / 固定窗口截半块 / 手拼引号），
//       教训见 doc/standards/开发经验.md §五-9（引号嵌套）与 §五-11（行号当锚点）。
// 用法（在 run_code 里）：
//   const H = require('<repo>/scripts/dev/edit-helpers.cjs');
//   const hits = await H.grep(tools, 'doc/STATUS.md', /评测资产/);        // 1) 按内容定位，不猜行号
//   const blk  = await H.block(tools, 'doc/STATUS.md', hits[0].line, 1);  // 2) 由 read 工具派生原块
//   await H.replace(tools, 'doc/STATUS.md', { line: hits[0].line, count: 1 }, newRow, { startsWith: '| 11 |' });
//   const js = H.inject(['第一行', '第二行']);                              // 3) 注入脚本的字符串一律 JSON.stringify
// 关键约束：本模块**只用 tools.read 读文件**（满足「edit 前必须读过」的策略），绝不 fs 直读后再 edit。

async function grep(tools, file, re) {
  const src = re instanceof RegExp ? re.source : String(re);
  const r = await tools.bash({ command: "grep -nE " + JSON.stringify(src) + " " + JSON.stringify(file), description: "locate by content: " + src });
  const text = r.kind === 'foreground' ? r.stdout.text : '';
  return text.split('\n').filter(Boolean).map((l) => {
    const i = l.indexOf(':');
    return { line: Number(l.slice(0, i)), text: l.slice(i + 1) };
  });
}

async function block(tools, file, line, count) {
  const r = await tools.read({ file_path: file, offset: line, limit: count });
  return r.lines.map((l) => l.text).join('\n');
}

async function replace(tools, file, loc, newText, expect) {
  const old = await block(tools, file, loc.line, loc.count);
  const checks = expect || {};
  const fail = [];
  if (checks.startsWith && !old.startsWith(checks.startsWith)) fail.push('startsWith ' + JSON.stringify(checks.startsWith));
  if (checks.endsWith && !old.endsWith(checks.endsWith)) fail.push('endsWith ' + JSON.stringify(checks.endsWith));
  if (checks.includes && !old.includes(checks.includes)) fail.push('includes ' + JSON.stringify(checks.includes));
  if (fail.length) throw new Error('块校验失败（未改动文件）: ' + fail.join(' / ') + '\n实到: ' + JSON.stringify(old.slice(0, 200)));
  await tools.edit({ file_path: file, old_string: old, new_string: newText });
  return { replaced: loc.count, from: loc.line };
}

/** 把多行文本安全注入到脚本源码里（避免手拼引号） */
function inject(lines) {
  return JSON.stringify(Array.isArray(lines) ? lines.join('\n') : String(lines));
}

module.exports = { grep, block, replace, inject };
