// ============ D1 空图（最小可运行的传送带） ============
// 作用：验证 LangGraph 装好、能跑。没有任何业务逻辑。
// 图：START → inc(计数器+1) → END
const { StateGraph, START, END, Annotation } = require('@langchain/langgraph');

const DemoState = Annotation.Root({
  count: Annotation({ reducer: (a, b) => (b === undefined ? a : b), default: () => 0 }),
});

// 一个最简节点：进来 count，出去 count+1
async function incNode(state) {
  return { count: (state.count || 0) + 1 };
}

const graph = new StateGraph(DemoState)
  .addNode('inc', incNode)
  .addEdge(START, 'inc')
  .addEdge('inc', END)
  .compile();

module.exports = { graph, incNode };
