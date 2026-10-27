# 设计产物复核报告 — tinypost（2026-10-27）

| 属性 | 值 |
|------|-----|
| 复核方式 | 动态工作流：机器门禁复跑 + 5 路独立评审 + 逐条独立证实（27/27 全部 verified） |
| 机器检查 | engine-cli check PASS；doctor 仅插件模式预期 WARN；通道/表机器核对零缺失零多余 |
| 处置 | 本报告所列问题已于同日修复完毕（见「处置」列与 gate1-tinypost-2026-10-27-v2.md） |

## High（9 条）

| # | 位置 | 问题 | 处置 |
|---|------|------|------|
| H1 | api-tinypost.md:183 ↔ db.ts:302-308 | 「不允许删除唯一环境」守卫不存在，可删至 0 环境 0 激活；接管者是 remaining[0] 非「默认环境」 | **代码已修**：db.ts deleteEnvironment 增加保底守卫（抛「至少保留一个环境」）；文档措辞保留 |
| H2 | api-tinypost.md:147/151/179/182 | 四通道返回类型虚构（实返回 number id / 数组；默认环境名「本地」非「默认」） | **文档已修**（对齐实现：渲染层以 id 为契约） |
| H3 | api-tinypost.md:70/154 ↔ db.ts:171-179 | INV-02 无校验：reorder 传子集静默产生重复 sort_order | **代码已修**：reorderSavedRequests 校验 orderedIds 与集合内请求项集合一致，不一致抛错 |
| H4 | PageSpec:76/117/143 ↔ App.tsx | 「破坏性操作全部二次确认」不实：清空历史/删请求/删环境无确认 | **代码已修**：onClearHistory、onDeleteSavedRequest 增加 window.confirm（删除环境改为守卫拦截）；PageSpec §5.4 确认矩阵更新 |
| H5 | PageSpec:19/22/111-113/137 | 三栏布局/设置 Dialog/顶栏菜单/顶栏运行入口均不存在（实为两栏+顶栏内联+侧栏按钮） | **文档已修**（as-built v1.1）；如需真实现属新需求，待用户决断 |
| H6 | PageSpec:113/145 | insecure「顶栏常驻警示条」不存在（实为普通 checkbox） | **代码已修**：insecure 勾选时顶栏下方常驻警示条（App.tsx + App.css）——TP-BR-08 落地为真 |
| H7 | knowledge/service-pool | dialog 域登记失实：「pickFile/读文件」无读文件通道；漏登 saveBinaryResponse/saveText | **文档已修** |
| H8 | knowledge/architecture-choices | IPC 分域计数错位：db 20≠19、dialog 5≠6（总数 27 恰对） | **文档已修** |
| H9 | common-spec/03-common-enums | AppTheme 枚举不存在（types.ts/settings 均无主题持久化） | **文档已修**：删行+注记「主题仅跟随系统行为」 |

## Medium（12 条）

| # | 位置 | 问题 | 处置 |
|---|------|------|------|
| M1 | function-list.md:237-254 | S-05 三个子模块缺「功能说明」（模板违例） | **文档已修** |
| M2 | business-arch.md:222-231 ↔ application-arch.md | BA 附录A 与 AA 调用关系双向未同步 | **文档已修**：删 1 增 3，双向一致 |
| M3 | domain-model.md:19 | 整域标「核心域」但聚合根全来自支撑域（自相矛盾） | **文档已修**：改「单一上下文」口径 |
| M4 | domain-model.md:52 | 子流程「父聚合根」契约不成立（输入跨聚合/输出新建聚合根） | **文档已修**：改「来源/去向」措辞+显式偏差声明 |
| M5 | domain-model.md:46 | AppSettings「基础数据」是五类体系外发明分类 | **文档已修**：改「域内对象（实体；全局单例边界情形）」 |
| M6 | rules TP-BR-06 等 | 集合运行失败语义全库未记载（非 2xx/二进制即止且不提取，collectionRun.ts:40-43） | **文档已修**：TP-BR-06/知识库/BA/AA/FL/PRD 全链补失败语义（行为与代码一致，属记载缺失） |
| M7 | api-tinypost.md:69/72/181 ↔ db.ts:265-268/324-327 | INV-01/04「事务内」不实（两条裸 autocommit） | **代码已修**：setActiveEnvironment/deleteCollection 包 withTransaction |
| M8 | api-tinypost.md:217 ↔ http.ts:117-125 | http:cancel「无参取消最近一个」不实（只查固定 default 槽） | **代码已修**：无参时取消最近在途请求（inflight 插入序末位） |
| M9 | api-tinypost.md:147 ↔ db.ts:310-314 | listCollections 排序方向相反；name 非空校验只在渲染层 | **文档已修**（排序对齐 id DESC）+ **代码已修**（通道级非空/存在性校验） |
| M10 | gate1 报告:19/44 | 「18 个 Action 通道」计数不实（实为 17/19）；验证脚本未随仓库留存 | **文档已修**：Gate1 v1.1 重写 + verify-crosscheck.mjs 随仓留存；PageSpec v1.1 重计（21 Action/26 通道引用） |
| M11 | PageSpec:82-84/129 | Set-Cookie 卡/运行面板提取结果列/「查看该步响应」均不存在 | **文档已修**（as-built：提取结果=全局通知条；步骤点击仅回填定义） |
| M12 | PageSpec:36/65/73-74/92/108-109/144 | 右键菜单/历史列结构/滚动加载/{{var}} 高亮/Cookie 只读表/激活 switch/CodeEditor 主题等不实 | **文档已修**（as-built v1.1 逐项改为实装描述） |

## Low（6 条）

| # | 位置 | 问题 | 处置 |
|---|------|------|------|
| L1 | prd.md:95 | T5「无列表导出」应记 N/A 却判 ✅；「见响应落盘」悬空引用 | **文档已修** |
| L2 | prd.md:145 | T9 循环引用 D3；N3 引用漏节；「14/14」计数口径混用 | **文档已修**（✅11 + N/A3） |
| L3 | domain-model.md:63 | HTTP 载荷 P5/P4 两处归类矛盾 | **文档已修**（统一 P4） |
| L4 | application-arch.md:451-459 | 模块编码未落实 X-MM-SS-NN 的 SS 分层 | **文档已修**（编码表补 21 个 SS 分配） |
| L5 | function-list.md:304-325 | FL 第三部分树粒度不一致（S-05 等未展开到菜单级） | **文档已修**（全分支展开） |
| L6 | application-arch.md:354-356 | P-01「零业务语义」与绑定 5 张业务表矛盾 | **文档已修**（持有 schema≠业务规则的边界措辞） |

## 未覆盖

应用未实际启动运行（仅静态比对）；.claude/ 挂载副本逐字节一致性；与本次交付无关的未跟踪内容。
