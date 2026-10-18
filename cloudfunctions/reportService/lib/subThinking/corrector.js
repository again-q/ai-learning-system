// ============ 诊断文案更正 ============
// 用户 2026-10-18 明确：「不是改判定，是 AI 把之前错误的诊断改掉」
//
// 边界（PRD AC-8 / R8）：
//   可改：diagnosis.comment / diagnosis.inference / diagnosis.hook
//   只读：errorType / processScore / errorLevel / segments / breakpoint / official*
//
// 顺序要求：先写 revisions[]，再改 diagnosis —— 第二步失败时至少留痕可回溯。
'use strict';

const WRITABLE_FIELDS = [
  'diagnosis.comment',
  'diagnosis.inference',
  'diagnosis.hook',
];

const READONLY_FIELDS = [
  'errorType', 'processScore', 'errorLevel', 'errorDimension',
  'segments', 'breakpoint', 'processAvailable',
  'officialScore', 'officialStatus', 'officialStandardScore',
];

/**
 * 校验字段是否可写（供接口层在写库前调用）
 * @returns {{ok:boolean, code?:number, message?:string, key?:string}}
 */
function checkField(field) {
  const f = String(field || '').trim();
  if (READONLY_FIELDS.includes(f)) {
    return { ok: false, code: 403, message: '该字段是判定结果，不可修改' };
  }
  if (!WRITABLE_FIELDS.includes(f)) {
    return { ok: false, code: 403, message: '只能更正诊断文案（diagnosis.comment / inference / hook）' };
  }
  return { ok: true, key: f.split('.')[1] };
}

/**
 * 执行更正。
 * @param {object} args
 * @param {object} args.db         云数据库实例
 * @param {object} args._          db.command
 * @param {string} args.questionId
 * @param {string} args.userId
 * @param {string} args.field
 * @param {string} args.newText
 * @param {string} args.evidence   原诊断错在哪（必填）
 */
async function correctDiagnosis({ db, _, questionId, userId, field, newText, evidence }) {
  const chk = checkField(field);
  if (!chk.ok) return { code: chk.code, message: chk.message };

  const text = String(newText || '').trim();
  if (!text) return { code: 400, message: '更正内容不能为空' };

  const ev = String(evidence || '').trim();
  if (!ev) return { code: 400, message: '必须说明原诊断错在哪' };

  // 归属校验
  let doc;
  try {
    const r = await db.collection('questions').doc(questionId).get();
    doc = r && (r.data || (Array.isArray(r) ? r[0] : null));
  } catch (e) {
    return { code: 404, message: '题目不存在' };
  }
  if (!doc) return { code: 404, message: '题目不存在' };
  if (doc.userId && doc.userId !== userId) return { code: 403, message: '无权修改' };

  const key = chk.key;
  const before = String((doc.diagnosis || {})[key] || '');
  if (before === text) return { code: 0, data: { updated: false, reason: '内容未变化' } };

  const revision = {
    field,
    before,
    after: text,
    evidence: ev,
    confirmedBy: 'student',
    createdAt: Date.now(),
  };

  // ① 先写留痕
  try {
    await db.collection('questions').doc(questionId).update({
      data: { revisions: _.push([revision]) },
    });
  } catch (e) {
    return { code: 500, message: '留痕失败，未做修改' };
  }

  // ② 再改诊断
  try {
    await db.collection('questions').doc(questionId).update({
      data: { ['diagnosis.' + key]: text },
    });
  } catch (e) {
    return { code: 500, message: '写入失败（已留痕，可回溯）' };
  }

  return { code: 0, data: { updated: true, field, before, after: text, revision } };
}

module.exports = { correctDiagnosis, checkField, WRITABLE_FIELDS, READONLY_FIELDS };
