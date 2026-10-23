// ============ 编排入口 ============
// 把 splitter → solver → verifier → thinker 串起来，并按需缓存。
//
// 流程（详细设计 §3.7）：
//   ① 缓存命中直接返回
//   ② 切分（只切一次，取目标小问）
//   ③ 求解 → 验证 → 不通过则重解（最多 2 次）
//   ④ fail → 不出思路，诚实降级
//   ⑤ pass/partial → 生成思路 → 存库
'use strict';

const { splitSubQuestions } = require('./splitter');
const { solve } = require('./solver');
const { verify } = require('./verifier');
const { think } = require('./thinker');

const MAX_RETRY = 2;   // 验证失败后最多重解 2 次（异常路径）

/** 取题目里属于切分输入的几个字段 */
function pickQuestion(q) {
  return {
    questionText: q.questionText || '',
    studentWork: (q.traceReport || '') || (Array.isArray(q.segments)
      ? q.segments.map((s) => s.evidence || s.step || '').filter(Boolean).join('\n')
      : ''),
    referenceProcess: Array.isArray(q.referenceProcess) ? q.referenceProcess : [],
    question: q,
  };
}

/**
 * 生成某一小问的思路（不负责接口层，只做业务编排）。
 *
 * @param {object} args
 * @param {object} args.db
 * @param {object} args._
 * @param {function} args.call
 * @param {object} args.question   题目文档
 * @param {string} args.subNo
 * @param {object} [args.logger]
 * @param {string} args.model
 */
async function generateSubThinking({ db, _, call, question, subNo, logger, model, force }) {
  const t0 = Date.now();
  const qid = question._id || question.questionId;
  const log = (m) => logger && logger.info && logger.info('[subThinking] ' + m);

  // ① 缓存（force=true 时跳过 —— 供前端「再试一次」用）
  const list = Array.isArray(question.subThinking) ? question.subThinking : [];
  const cached = list.find((x) => x.subNo === subNo);
  if (!force && cached && cached.verified === 'pass') {
    log('命中缓存 ' + subNo);
    return Object.assign({}, cached, { cached: true });
  }

  // ② 切分
  const { subQuestions, splitFallback, reason } = splitSubQuestions(pickQuestion(question));
  const sub = subQuestions.find((s) => s.subNo === subNo) || subQuestions[0];
  if (!sub) {
    return { subNo, verified: 'fail', verifyNote: '无法切分该小问', thinking: null };
  }
  if (splitFallback) log('切分退化为整题：' + reason);

  const ctx = {
    questionText: question.questionText || '',
    subNo: sub.subNo,
    ask: sub.ask,
  };

  // ③ 求解 + 验证（含重试）
  let solution = await solve({ call, ...ctx });
  if (!solution) {
    return { subNo: sub.subNo, verified: 'fail', verifyNote: 'AI 没能完成这一问', thinking: null };
  }

  let ver = await verify({ call, ...ctx, solution });
  let retries = 0;
  while (ver.overall === 'fail' && retries < MAX_RETRY) {
    retries++;
    log('验证未通过，重解第 ' + retries + ' 次');
    const retried = await solve({ call, ...ctx, previousIssues: ver.problems });
    if (!retried) break;
    solution = retried;
    ver = await verify({ call, ...ctx, solution });
  }

  // ④ fail → 不出思路
  if (ver.overall === 'fail') {
    const record = {
      subNo: sub.subNo,
      ask: sub.ask,
      verified: 'fail',
      verifyNote: ver.note || '这一问我没能稳稳做出来',
      thinking: null,
      model: model || '',
      elapsedMs: Date.now() - t0,
      generatedAt: Date.now(),
      followUps: cached ? cached.followUps || [] : [],
    };
    await persist({ db, _, qid, record, cached });
    return record;
  }

  // ⑤ 出思路
  const thinking = await think({ call, ...ctx, solution });
  if (!thinking) {
    return {
      subNo: sub.subNo,
      verified: ver.overall,
      verifyNote: '思路生成失败（输出不完整）',
      thinking: null,
    };
  }

  const record = {
    subNo: sub.subNo,
    ask: sub.ask,
    verified: ver.overall,                       // pass | partial
    verifyNote: ver.overall === 'partial' ? (ver.note || '这一问证得不够严，补全后结论成立') : '',
    solution,
    thinking,
    model: model || '',
    elapsedMs: Date.now() - t0,
    generatedAt: Date.now(),
    followUps: cached ? cached.followUps || [] : [],
  };
  await persist({ db, _, qid, record, cached });
  log('已生成 ' + sub.subNo + '，耗时 ' + record.elapsedMs + 'ms，verified=' + record.verified);
  return record;
}

/** 存库：先 pull 旧记录再 push 新的（同一小问只保留一份） */
async function persist({ db, _, qid, record, cached }) {
  try {
    if (cached) {
      await db.collection('questions').doc(qid).update({
        data: { subThinking: _.pull({ subNo: record.subNo }) },
      });
    }
    await db.collection('questions').doc(qid).update({
      data: { subThinking: _.push([record]) },
    });
  } catch (e) {
    // 存库失败不影响本次返回（学生已经看到了生成结果）
    if (console && console.warn) console.warn('[subThinking] 存库失败:', e && e.message);
  }
}

module.exports = { generateSubThinking, pickQuestion, MAX_RETRY };
