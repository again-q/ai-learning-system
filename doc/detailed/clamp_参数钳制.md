# AI 学习助手 — clamp 参数钳制 详细设计文档

**文档编号**：DES-20260808-002
**版本**：v1.0.0
**状态**：🟡 草稿
**创建日期**：2026-08-08
**最后更新**：2026-08-09
**作者**：task-decomposer（AI）
**所属层次**：Layer 0（基础层——被 diagnose 依赖）
**关联文档**：`doc/arch/拍照录入MVP_SAD_后端.md`

---

## 1. 功能描述

- **D 档位钳制**：将 DeepSeek 输出的 D 值钳制到 L1~L11 档位区间内，越界即钳回边界
- **η（路径质量）强制规则**：填空/选择题（无过程证据）→ η = null；解答题保留 AI 判定值
- **r 强制规则**：本轮一律 null（无追问）
- **P（过程分）归一化**：确保 P 值在 {0, 0.3, 0.5, 1.0} 四档内

## 2. 业务规则

| 规则编号 | 规则描述 |
|----------|----------|
| CL-REG-01 | D 值 = clamp(AI原始D, Lx区间下界, Lx区间上界) |
| CL-REG-02 | 填空/选择题 η = null（getProcessEvidence 判断题目类型） |
| CL-REG-03 | r = null（本轮统一） |
| CL-REG-04 | P 若不在 {0, 0.3, 0.5, 1.0} 中，钳到最近档位 |

## 3. 接口定义

### 3.1 clamp(input) — 内部函数，无 HTTP 端点

```yaml
# 伪契约（内部函数）
clamp:
  input:
    rawDiagnosis:      # DeepSeek 原始输出
      difficultyLevel:  string   # L1~L11
      difficultyValue:  number   # AI 打的 D 原始值
      pathQuality:      number|null  # η
      transferQuality:  null     # r
      processScore:     number   # P
    questionType:       string   # "选择"/"填空"/"解答"/"其他"
  output:
    difficultyValue:   number   # 钳制后 D
    pathQuality:       number|null  # 强制 null（若无过程）
    transferQuality:   null
    processScore:      number   # 归一化后 P
```

## 4. 功能逻辑（伪代码）

```
const LR = {
  L1: [0.01, 0.15], L2: [0.15, 0.30], L3: [0.30, 0.45],
  L4: [0.45, 0.60], L5: [0.60, 0.70], L6: [0.70, 0.79],
  L7: [0.79, 0.85], L8: [0.85, 0.90], L9: [0.90, 0.94],
  L10: [0.94, 0.98], L11: [0.98, 0.999]
};

const P_BINS = [0, 0.3, 0.5, 1.0];

function clamp(raw, questionType) {
  // D 钳制
  const [lo, hi] = LR[raw.difficultyLevel] || [0.01, 0.999];
  let D = Math.min(hi, Math.max(lo, raw.difficultyValue));

  // η 强制规则：非解答题 → null
  const isOpen = questionType === '解答';
  let eta = raw.pathQuality;
  if (!isOpen) eta = null;

  // r 强制 null
  let r = null;

  // P 归一化
  let P = raw.processScore;
  if (!P_BINS.includes(P)) {
    P = P_BINS.reduce((prev, curr) =>
      Math.abs(curr - P) < Math.abs(prev - P) ? curr : prev
    );
  }

  return { D, eta, r, P };
}
```

## 5. 算法

- **钳制算法**：`Math.min(hi, Math.max(lo, value))`——O(1)，无循环
- **P 归一化**：最近邻查找（4 档遍历，O(4)=O(1)）

## 6. DDL

无（纯逻辑模块，不直接访问数据库）。

## 7. 外部接口

无。

## 8. 内部接口

| 接口 | 调用方 | 说明 |
|------|--------|------|
| clamp(raw, questionType) | diagnose, dispute | 诊断后/异议后参数钳制 |

## 9. 性能要求

单次钳制 <0.1ms（纯内存计算）。

## 10. 安全要求

无（不涉及外部调用和数据访问）。

## 11. 测试要点

| 场景 | 预期 |
|------|------|
| D 在区间内 | 不变化 |
| D 超出区间 | 钳回到边界 |
| 选择题 η 输入 0.9 | 输出 null |
| 解答题 η 输入 0.9 | 输出 0.9 |
| r 任何值 | 输出 null |
| P=0.6（不在四档） | 归一化到 0.5 |

## 12. 依赖关系

- 无外部依赖（Layer 0）
- 被依赖：diagnose、dispute

---

## 变更记录

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| v1.0.0 | 2026-08-09 | 初版：D/η/r/P 钳制逻辑 |
