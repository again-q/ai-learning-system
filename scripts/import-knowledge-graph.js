#!/usr/bin/env node
/**
 * 知识图谱导入脚本 — 本地 knowledge-graph/nodes/*.json → knowledge_nodes 集合
 *
 * 用法: node scripts/import-knowledge-graph.js
 * 说明: 在云函数环境外运行（管理端脚本），需配置 CloudBase 环境或本地 wx-server-sdk。
 *       简化版：输出待导入的节点 JSON 到 stdout，供管理端批量写入。
 */

const fs = require('fs');
const path = require('path');

const NODES_DIR = path.join(__dirname, '../knowledge-graph/nodes');

function collectNodes(dir) {
  const nodes = [];
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  for (const file of files) {
    const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
    // 兼容两种结构：数组或 {nodes: [...]}
    const list = Array.isArray(data) ? data : (data.nodes || []);
    for (const n of list) {
      nodes.push({
        knowledgeId: n.knowledge_id || n.knowledgeId || `${file.replace('.json', '')}_${nodes.length}`,
        name: (n.basic && n.basic.name) || n.name || '',
        type: (n.basic && n.basic.type) || n.type || 'definition',
        subject: (n.basic && n.basic.subject) || '数学',
        stage: (n.basic && n.basic.stage) || '',
        level: (n.basic && n.basic.level) || 1,
        parentId: (n.tree && n.tree.parent_id) || n.parentId || null,
        path: (n.tree && n.tree.path) || n.path || '',
        concept: n.concept || null,
        importance: n.importance || null,
      });
    }
  }
  return nodes;
}

try {
  const nodes = collectNodes(NODES_DIR);
  console.log(JSON.stringify({ total: nodes.length, nodes }, null, 2));
  console.error(`✅ 共收集 ${nodes.length} 个知识点节点`);
} catch (e) {
  console.error('❌ 导入失败:', e.message);
  process.exit(1);
}
