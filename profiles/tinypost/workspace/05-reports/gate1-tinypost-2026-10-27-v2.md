# Gate 1: 设计→代码门控报告 v1.1 — tinypost（复核修复后重判）

| 属性 | 值 |
|------|-----|
| 判定日期 | 2026-10-27 |
| 前置 | design-review-2026-10-27.md：27 条确证问题（high 9 / medium 12 / low 6）已全部处置（代码修复 8 项、文档修复 19 项） |
| **总体判定** | **PASS（附 1 项 WARN）——按 /pipeline 指令暂停，等待用户确认后进入 B/F 后续阶段与 Gate 2** |
| 取代 | gate1-tinypost-2026-10-27.md（v1.0 判定被复核部分击穿，见 M10；本版为权威） |

## 本轮修复清单（复核驱动）

**代码（8 项，src/）**：
1. db.ts `setActiveEnvironment` / `deleteCollection` 事务化（INV-01/04 落地为真）
2. db.ts `deleteEnvironment` 保底守卫（至少保留一个环境，通道级）
3. db.ts `reorderSavedRequests` 校验 orderedIds 与集合内请求项集合一致（INV-02 落地为真）
4. db.ts `createCollection`/`renameCollection` 名称非空 + 目标存在校验（通道级）
5. http.ts `httpCancel` 无参时取消最近在途请求（对齐契约「取消最近一个进行中请求」）
6. App.tsx 清空历史、删除请求增加二次确认（破坏性操作确认矩阵补齐）
7. App.tsx + App.css insecure 常驻警示条（TP-BR-08 落地为真）
8. 交叉核对脚本随仓留存（05-reports/verify-crosscheck.mjs，解决 v1.0 证据不可复现）

**文档（19 项，profiles/tinypost/，全部 v1.1）**：返回类型/排序口径对齐实现、meta 契约 runEnabled、AppTheme 删除、IPC 分域计数、service-pool dialog 域、集合运行失败语义全链记载、BA 附录A↔AA 同步、领域分层口径、AppSettings 归类、子流程契约偏差声明、P4/P5 统一、SS 编码分配、FL 功能说明与树展开、PageSpec as-built 重写（21 Action/26 通道引用重计）、PRD 完备性口径（✅11+N/A3）。

## 门控检查项

| # | 检查项 | 结果 | 证据 |
|---|--------|------|------|
| G1-01 | 三文档全局检查 | ✅ | BA 附录A↔AA 双向同步（M2 修复）；BA 7 L3/21 L4 ↔ AA/FL 覆盖维持零缺失（复核评审员 grep 复核） |
| G1-02 | PRD 完备性检查 | ✅ | 修复后口径：✅11 项、N/A 3 项（T2/T3/T5），无未通过项；支撑引用均指向 PRD 正文 |
| G1-03 | 领域模型分离 | ✅ | 3 聚合根 + 2 子流程；AppSettings 归类实体（边界声明）；子流程跨聚合编排为显式偏差 |
| G1-04 | API 文档全局合规 | ✅ | 27 通道与 ipc.ts 一致（verify-crosscheck #1）；返回类型/排序/meta 契约与实现对齐（#11）；INV-01/02/04/05 现由代码事实支撑（#3-#5） |
| G1-05 | API 变更摘要 | ✅ | api-tinypost.md 更新记录 v1.1（field_changed/interface_changed，目标节号在列） |
| G1-06 | PageSpec 输出校验 | ✅ | v1.1 as-built：21 Action ↔ 26 通道引用全部真实（verify-crosscheck #10）；字典与枚举池一致（RunEnabledFlag） |
| G1-07 | 跨阶段一致性 | ✅ | 文档↔代码语义一致由 22 项交叉核对判定（ALL PASS，脚本随仓可复现） |
| G1-08 | 枚举池无冲突 | ✅ | 公共池 4 + 业务池 6，无重复；AppTheme 已移除 |

**验证命令**：`npm run typecheck` ✅；`npm test` ✅ 55/55；`node profiles/tinypost/workspace/05-reports/verify-crosscheck.mjs` → ALL PASS（22 项）；`engine-cli check` PASS（11/0/0）；`engine-cli sync` 已刷新规则挂载副本。

## WARN

| # | 说明 |
|---|------|
| W-1 | PageSpec v1.1 为 as-built 口径：五处「理想化 UI」按实装修正（设置内联而非 Dialog、两栏布局、无 Set-Cookie 卡、历史单按钮行、运行面板无提取列）。若产品上需要这些形态，属**新增需求**，应走增量模式（D4 变更→重跑 Gate 1→F 阶段实现），不在本次「修复代码」范围 |

## 待用户确认（/pipeline 检查点）

- [ ] 确认 Gate 1 v1.1 判定，进入 Gate 2（validation：代码扫描按激活链规则 + 上述验证命令复核）
- [ ] 或指示 W-1 所列 UI 形态哪些要作为新需求实现（则先走 D4 增量再实现）
