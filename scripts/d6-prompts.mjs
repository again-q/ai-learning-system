// ============ D6 · 两段 prompt（A 认题 / B 看过程） ============
// 原则（重要）：**不重打一个字**——A/B 的指令文本全部从线上 userMsg **切片派生**，
//   标尺与「约束」段保持与线上逐字一致，这样 D6 实验里**唯一的变量就是「拆成两段」**。
//   字段模板用 JSON.stringify 生成，避免手写花括号/引号（教训：开发经验 §五-9/§五-11）。
// 用法：const D6 = await import('file://<repo>/scripts/d6-prompts.mjs');
//   const A = D6.buildA(questionText);
//   const B = D6.buildB({ questionText, answer, referenceProcess, knowledgeUsage, traceText });
//   const raw = D6.mergeAB(rawA, rawB);
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = require(path.join(ROOT, 'cloudfunctions/graphEngine/src/lib/prompts.js'));

const U = P.userMsg;
const M = (marker) => { const i = U.indexOf(marker); if (i < 0) throw new Error('prompt marker 缺失: ' + marker); return i; };
const seg = (a, b) => U.slice(M(a), b ? M(b) : undefined);

const P1 = seg('第一步', '第二步');            // 学生视角感受难度
const P2 = seg('第二步', '第三步');            // 判档 + 判对错（题侧部分：判档）
const P3 = seg('第三步', '第四步');            // 题型归类
const P4 = seg('第四步', '只输出 JSON');       // 过程分段（学生侧）
const CONSTRAINTS = U.slice(M('约束：'));      // 约束全文，逐字保留

export const RUBRIC_V2 = P.RUBRIC_V2;

const SYSTEM_A = '你是数学题面分析引擎。你只分析【题目本身】：这道题考什么、有多难、标准答案与参考解法。你没有学生作答信息，也不得推测学生做得如何。输出纯 JSON。';
const SYSTEM_B = '你是学生作答诊断引擎。你会拿到题目、标准答案、参考解法，以及学生写在答题纸上的作答痕迹。你的任务是判定这份作答。输出纯 JSON。';

const SCHEMA_A = {
  questionType: '选择|填空|解答|其他', questionCategory: '', level: 'L1~L11', D: 0.5,
  correctAnswer: '', referenceProcess: [{ step: '步骤标题', content: '该步推导（LaTeX，可空）', note: '该步为什么这么做（可空）' }],
  knowledgeNodeName: '题目考察的核心知识点（教材术语）',
  knowledgeUsage: [{ name: '知识点教材术语', D: 0.5 }],
  pattern: { domain: '知识板块', pattern: '中粒度题型描述（同类题共用）', variant: '变体细节' },
  isRecallQuestion: true, isOutOfSyllabus: false,
  fiveDim: { K: 0.5, A: 0.5, T: 0.5, Q: 0.5, S: 0.5 },
};
const SCHEMA_B = {
  P: 1, errorType: '结果错|过程风险|无', errorLevel: 'skill|rule|concept|null',
  errorAttribution: null, errorDimension: 'K|A|T|S|null', eta: '0.4~1.0|null',
  segments: [{ step: '段内容摘要', status: '通|断|空白', evidence: '该段过程原文片段' }],
  breakpoint: { index: 2, nature: '起步即停|中途断|收尾断' },
  processAvailable: true,
  knowledgeUsage: [{ name: '知识点教材术语', P: 1 }],
};

// A 段必须只看题面：把原第二步里属于「学生侧」的措辞剥掉（2026-09-25 实验：残留越界指令是两段变差的可疑原因之一）
function stripStudentClauses(p2) {
  return p2.replace('【判定作答 + 对照标尺判档】', '【对照标尺判档】').replace(/，同时判定对错\/作答质量/g, '');
}

export function buildA(questionText) {
  return {
    system: SYSTEM_A,
    user: [
      P1.trim(),
      stripStudentClauses(P2), P3.trim(),
      '【本次你只输出以下【题侧】字段（没有学生作答信息，不要给 P、不要给 segments/breakpoint/eta/errorType）】',
      JSON.stringify(SCHEMA_A),
      CONSTRAINTS,
      '【题目】' + questionText,
    ].join('\n\n'),
  };
}

export function buildB({ questionText, answer, referenceProcess, knowledgeUsage, traceText }) {
  const kn = (knowledgeUsage || []).map((x) => x.name + '（该环节难度 D=' + x.D + '）').join(' ｜ ');
  return {
    system: SYSTEM_B,
    user: [
      P4.trim(),
      '【本次你只输出以下【学生侧】字段（题型/难度/知识点名已在认题阶段定稿，不要重复输出、不要修改）】',
      JSON.stringify(SCHEMA_B),
      CONSTRAINTS,
      '【题目】' + questionText,
      '【正确答案（老师给的，**不是学生的答案**；学生的答案只在他们自己的痕迹里）】' + (answer || ''),
      '【参考解法（认题阶段产出）】' + JSON.stringify(referenceProcess || []),
      '【本题知识点清单 —— 只需为每个点给出 P（三问判据见约束）】' + (kn || '（无）'),
      '【学生作答痕迹（仅用于判定对错/P/η/归因）】\n' + String(traceText || '').slice(0, 1500),
    ].join('\n\n'),
  };
}

/** 把 A/B 两段结果合并成与线上同形的 raw（字段名与线上一致，便于用同一套指标比较） */
export function mergeAB(ra, rb) {
  const A = ra || {}, B = rb || {};
  const knA = Array.isArray(A.knowledgeUsage) ? A.knowledgeUsage : [];
  const knB = Array.isArray(B.knowledgeUsage) ? B.knowledgeUsage : [];
  const findP = (name) => { const hit = knB.find((x) => String(x.name || '').trim() === String(name || '').trim()); return hit ? hit.P : undefined; };
  return {
    questionType: A.questionType, questionCategory: A.questionCategory, level: A.level, D: A.D,
    correctAnswer: A.correctAnswer, referenceProcess: A.referenceProcess,
    knowledgeNodeName: A.knowledgeNodeName, pattern: A.pattern,
    isRecallQuestion: A.isRecallQuestion, isOutOfSyllabus: A.isOutOfSyllabus, fiveDim: A.fiveDim,
    P: B.P, errorType: B.errorType, errorLevel: B.errorLevel, errorAttribution: B.errorAttribution,
    errorDimension: B.errorDimension, eta: B.eta, segments: B.segments, breakpoint: B.breakpoint,
    processAvailable: B.processAvailable,
    knowledgeUsage: knA.map((x) => ({ name: x.name, D: x.D, P: findP(x.name) })),
  };
}
