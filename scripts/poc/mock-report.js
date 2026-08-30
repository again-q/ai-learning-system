const g = require('/Users/apple/Desktop/ai-learning-system/cloudfunctions/reportService/generateV2.js');
(async () => {
  const s = await g.batchSummary({ totalQuestions: 8, correctCount: 5 }, [{ topic: '指数函数过定点', errorCategory: 'concept' }, { topic: '复合函数值域', errorCategory: 'rule' }]);
  console.log('【首页一句话】' + s);
  const cases = [
    { label: '场景1  结果错+concept', q: { questionText: '已知实数a,b满足2026^a=2027^b，可能成立的有：A.0<b<a B.a<b<0 C.0<a<b D.a=b=0', traceReport: '划掉C和D，右下角写AB', segments: [{ step: '判断a,b关系', status: '断', evidence: '写AB' }], breakpoint: { index: 1, nature: '收尾断' }, errorType: '结果错', errorLevel: 'concept', processScore: 0.6, correctAnswer: 'A、B、D' } },
    { label: '场景2  过程险+rule', q: { questionText: '求函数y=4+2^x的图象恒过定点坐标', traceReport: '令x=0得y=5，未写理由', segments: [{ step: '令x=0', status: '断', evidence: 'x=0,y=5' }], breakpoint: { index: 1, nature: '收尾断' }, errorType: '过程风险', errorLevel: 'rule', processScore: 0.85, correctAnswer: 'P(0,5)' } },
    { label: '场景3  没答完+skill', q: { questionText: '解不等式 x^2-3x+2>0', traceReport: '只写了一个解x>2', segments: [{ step: '因式分解', status: '断', evidence: 'x>2' }], breakpoint: { index: 1, nature: '起步即停' }, errorType: '过程风险', errorLevel: 'skill', processScore: 0.4, correctAnswer: '{x<1 或 x>2}' } },
    { label: '场景4  做对+null', q: { questionText: '求函数y=4+2^x过定点坐标', traceReport: '完整写出令指数=0→x=0→y=5→P(0,5)', segments: [{ step: '令指数=0', status: '通', evidence: 'x=0,y=5' }], breakpoint: null, errorType: '无', errorLevel: null, processScore: 1, correctAnswer: 'P(0,5)' } },
  ];
  for (const c of cases) {
    const d = await g.diagnosis(c.q);
    console.log('\n---' + c.label + '---');
    console.log('过程点评：' + d.comment);
    console.log('问题在哪儿：' + d.inference);
    console.log('下一步：' + d.hook);
  }
})().catch((e) => { console.error('FAIL', e); process.exit(1); });
