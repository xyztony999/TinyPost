---
# TinyPost 工作区状态索引（{ws.index}；schema：引擎 01-pipeline-definition.md §4）
pipeline:
  - id: d0-clarification
    title: "D0 需求澄清报告"
    path: "00-architecture/D0-clarification.md"
    status: complete
    note: "代码库 v0.2.0 逆向建档，7 项澄清全部闭合"
  - id: d1-architecture
    title: "D1 架构三文档（BA/AA/FL）"
    path: "00-architecture/"
    status: complete
    note: "v1.1（复核修复：附录A同步/SS编码/树展开/失败语义）"
  - id: d2-prd
    title: "D2 PRD 与领域模型"
    path: "02-detailed/prd/"
    status: complete
    note: "v1.1（复核修复：完备性口径 ✅11+N/A3、领域分层、子流程偏差声明）"
  - id: d3-api
    title: "D3 IPC 契约设计"
    path: "02-detailed/api/"
    status: complete
    note: "v1.1（复核修复：返回类型/排序/meta 契约对齐实现；INV 由代码落地）"
  - id: d4-interaction
    title: "D4 交互 PageSpec"
    path: "02-detailed/interaction/"
    status: complete
    note: "v1.1 as-built（虚构 UI 改实装描述；21 Action/26 通道重计）"
  - id: design-review
    title: "设计产物复核报告（27 项确证）"
    path: "05-reports/design-review-2026-10-27.md"
    status: complete
    note: "high9/med12/low6 全部 verified 并处置（代码8+文档19）"
  - id: gate1
    title: "Gate 1 设计门控报告 v1.1"
    path: "05-reports/gate1-tinypost-2026-10-27-v2.md"
    status: complete
    note: "PASS 附 W-1；用户已确认（2026-10-27），Gate 2 随之通过"
  - id: gate2
    title: "Gate 2 代码→交付门控报告"
    path: "05-reports/gate2-tinypost-2026-10-27.md"
    status: complete
    note: "PASS 附 3 项披露（E2E/coverage/lint 未配置）"

reference:
  - title: "业务概念与模块清单"
    path: "../knowledge/business-concepts/index.md"
  - title: "设计决策"
    path: "../knowledge/design-decisions/index.md"
  - title: "IPC 服务池"
    path: "../knowledge/service-pool/index.md"
  - title: "架构分层选择"
    path: "../knowledge/architecture-choices/index.md"
  - title: "公共枚举"
    path: "01-solution/common-spec/03-common-enums.md"
  - title: "业务枚举池"
    path: "01-solution/common-spec/04-business-enum.md"
  - title: "选择服务池"
    path: "01-solution/common-spec/05-select-service-pool.md"
  - title: "交叉核对脚本（可复现证据）"
    path: "05-reports/verify-crosscheck.mjs"

modules:
  - name: tinypost
    domain: core
    stages:
      requirement: { status: complete, note: "D0-D2 v1.1（2026-10-27 复核修复）" }
      api: { status: complete, note: "D3 v1.1：27 通道契约与实现对齐" }
      interaction: { status: complete, note: "D4 v1.1 as-built" }
      backend: { status: complete, note: "主进程修复完成：事务化×2/守卫/校验/cancel 语义（2026-10-27）；本项目无独立后端服务" }
      frontend: { status: complete, note: "渲染层修复完成：二次确认×2/insecure 警示条（2026-10-27）；增量 UI 形态待用户决断（Gate1 W-1）" }
      validation: { status: complete, note: "Gate 2 PASS（2026-10-27：TP-BR 全过+对齐全过；E2E/coverage 未配置为披露）" }
    gates:
      gate1: { status: pass, note: "v1.1 重判 PASS；用户已确认（2026-10-27）" }
      gate2: { status: pass, note: "PASS（2026-10-27，附 3 项披露：E2E/coverage/lint 未配置）" }
