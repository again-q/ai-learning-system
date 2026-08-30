const g = require('/Users/apple/Desktop/ai-learning-system/cloudfunctions/reportService/generateV2.js');
(async () => {
  const s = await g.batchSummary({ totalQuestions: 10, correctCount: 7 }, [{ topic: '集合与函数', errorCategory: 'concept' }]);
  console.log('[批次总结]', s);
  const n = await g.progressNarrative({ processScore: 0.85, breakpoint: { nature: '收尾断' }, questionType: '解答' });
  console.log('[进度叙事]', n);
  const d = await g.diagnosis({
    questionText: '已知实数 a,b 满足 2026^a=2027^b，可能成立的有（多选）A.0<b<a B.a<b<0 C.0<a<b D.a=b=0',
    traceReport: '学生划掉了选项 C 和 D，在题目右下方写了 AB。',
    segments: [{ step: '判断 a,b 关系', status: '断', evidence: '划掉C和D，写AB' }],
    breakpoint: { index: 1, nature: '收尾断' },
    errorType: '结果错',
    errorLevel: 'concept',
    processScore: 0.6,
    correctAnswer: 'A、B、D',
  });
  console.log('[诊断]', JSON.stringify(d, null, 1));
  const hits = [
    { createdAt: '2026-07-20', isCorrect: false, breakpoint: { nature: '起步即停' }, errorLevel: 'skill', processScore: 0.3, errorAttribution: '整题空白未下笔', knowledgeNodeName: '含参恒成立' },
    { createdAt: '2026-08-06', isCorrect: false, breakpoint: { nature: '中途断' }, errorLevel: 'rule', processScore: 0.6, errorAttribution: '漏了分类讨论', knowledgeNodeName: '含参恒成立' },
    { createdAt: '2026-08-18', isCorrect: false, breakpoint: { nature: '收尾断' }, errorLevel: 'concept', processScore: 0.5, errorAttribution: '区间方向写反', knowledgeNodeName: '含参恒成立' },
    { createdAt: '2026-08-25', isCorrect: true, breakpoint: null, errorLevel: null, processScore: 1, errorAttribution: null, knowledgeNodeName: '含参恒成立' },
  ];
  const a = await g.advancedAnalysis('含参不等式恒成立求参数范围', hits);
  console.log('[进阶分析]', a);
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
