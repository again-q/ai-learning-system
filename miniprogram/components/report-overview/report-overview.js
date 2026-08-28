function parseScore(anchor) {
  const s = String(anchor || '');
  const m = s.match(/(\d+)\s*道.*?(\d+)\s*道.*?([\d.]+)\s*%/);
  if (m) {
    const last = s.match(/上次\s*([\d.]+)\s*%/);
    return {
      scoreMain: `${m[2]}/${m[1]}`,
      scoreSub: last ? `${m[3]}% · 上次 ${last[1]}%` : `${m[3]}%`,
    };
  }
  const m2 = s.match(/正确率\s*([\d.]+)\s*%/);
  return { scoreMain: m2 ? `${m2[1]}%` : (s.slice(0, 12) || '本次'), scoreSub: '' };
}

Component({
  properties: {
    ov: { type: Object, value: {} },
    deepVisible: { type: Boolean, value: false },
  },
  data: {
    scoreMain: '',
    scoreSub: '',
    mainPattern: null,
  },
  observers: {
    ov(ov) {
      const o = ov || {};
      const patterns = o.patterns || [];
      const main = patterns.find((p) => p && p.isMain) || patterns[0] || null;
      const score = parseScore(o.dataAnchor);
      this.setData({
        scoreMain: score.scoreMain,
        scoreSub: score.scoreSub,
        mainPattern: main,
      });
    },
  },
});
