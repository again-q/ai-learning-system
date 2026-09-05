// ============ 知识图谱候选接口（拆考点节点第②步用） ============
// 来源：设计《判定节点设计-拆考点节点.md》§2 步② + scripts/smoke-decompose-points.mjs
// 原则：确定性图谱分层检索（章 = tree.path[2]），不向量检索、零成本、可解释。
// 依赖注入：输入 nodes = [{ name, chapter }]（生产：knowledge_nodes 云库或 knowledge-graph/nodes/*.json）

/**
 * 从节点列表构建「章 → 候选知识点名」索引
 * @param {Array<{name?:string, chapter?:string}>} nodes
 * @returns {{ chapters: string[], getPointsByChapter: (ch:string)=>string[], maxCand:number }}
 */
function buildChapterIndex(nodes) {
  const list = (Array.isArray(nodes) ? nodes : [])
    .map((n) => ({ name: String((n && (n.name || n.basic?.name)) || '').trim(), chapter: String((n && (n.chapter || n.tree?.path?.[2])) || '').trim() }))
    .filter((n) => n.name && n.chapter);
  const chapters = [...new Set(list.map((n) => n.chapter))].sort();
  const byChapter = new Map();
  for (const n of list) {
    if (!byChapter.has(n.chapter)) byChapter.set(n.chapter, new Set());
    byChapter.get(n.chapter).add(n.name);
  }
  const getPointsByChapter = (ch) => [...(byChapter.get(ch) || [])];
  const maxCand = chapters.reduce((m, c) => Math.max(m, getPointsByChapter(c).length), 0);
  return { chapters, getPointsByChapter, maxCand };
}

module.exports = { buildChapterIndex };
