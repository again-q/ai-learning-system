const g = require('/Users/apple/Desktop/ai-learning-system/cloudfunctions/reportService/generateV2.js');
(async () => {
  // 情况①：学生提议合理 → 应 accepted=true
  const r1 = await g.disputePattern('不等式 / 基本不等式求最值', '这题其实是恒成立求参数范围，不是最值——题设是“对任意x恒成立”，我写的是参数范围');
  console.log('[情况①·允许更改]', JSON.stringify(r1, null, 1));
  // 情况②：学生提议不合理 → 应 accepted=false
  const r2 = await g.disputePattern('含参不等式恒成立求参数范围', '我觉得这是数列题，因为是“任意n”' );
  console.log('[情况②·不允许更改]', JSON.stringify(r2, null, 1));
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });