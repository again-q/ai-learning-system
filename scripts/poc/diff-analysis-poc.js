#!/usr/bin/env node
/** 差异分析生成器 POC：用户的 system prompt 原样 + 真实错题 → deepseek-v4-flash 生成三段 */
'use strict';
const fs = require('fs');
const path = require('path');

const SYSTEM_PROMPT = fs.readFileSync(__dirname + '/' + (process.env.PROMPT_FILE || 'diff-analysis-prompt.txt'), 'utf8');

function loadDSKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  const cred = path.join(process.env.HOME || '', '.dsh', '.credentials.yaml');
  if (fs.existsSync(cred)) {
    const m = fs.readFileSync(cred, 'utf8').match(/DEEPSEEK_API_KEY:\s*(\S+)/);
    if (m) return m[1];
  }
  return null;
}

(async () => {
  const key = loadDSKey();
  if (!key) { console.error('缺 DEEPSEEK_API_KEY'); process.exit(1); }
  const input = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const userMsg = [
    '输入：',
    '• 题面：' + input.question,
    '• 学生笔迹/过程：' + input.studentWork,
    '• 标准答案/正确路径：' + input.answer,
    '• 错误位置：' + input.errorPos,
  ].join('\n');
  const t0 = Date.now();
  const resp = await fetch('https://api.deepseek.com/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: 'deepseek-v4-flash',
      thinking: { type: 'disabled' },
      temperature: 0.2,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ],
      max_tokens: 1000,
    }),
  });
  if (!resp.ok) { console.error('HTTP', resp.status, (await resp.text()).slice(0, 300)); process.exit(1); }
  const data = await resp.json();
  const out = (data.choices[0].message.content || '').trim();
  console.log('== 输入 ==\n' + userMsg);
  console.log('\n== 输出（' + ((Date.now() - t0) / 1000).toFixed(1) + 's, ' + out.length + ' 字）==\n' + out);
  // 违禁检查
  const bans = ['你粗心', '你概念', '你记混', '你忽略了', '你的路线', '正确路线', '你脑子里', '你以为', '你觉得', '应该是', '答案是', '解集为'];
  const hits = bans.filter((b) => out.includes(b));
  console.log('\n[违禁词命中] ' + (hits.length ? hits.join(' / ') : '无 ✓'));
})();
