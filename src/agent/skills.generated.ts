// 由 scripts/sync-skills.mjs 从仓库根的 skills/ 生成，不要手改。
// 重新生成：npm run sync-skills

export type Skill = {
  id: string;
  title: string;
  summary: string;
  body: string;
};

export const SKILLS: Skill[] = [
  {
    id: "condition-screening",
    title: "条件筛选分析流程",
    summary: "Design a bounded condition screen with explicit variables, budget, controls, and information value.",
    body: "---\nname: condition-screening\ndescription: \"Design a bounded condition screen with explicit variables, budget, controls, and information value.\"\nversion: 1.0.0\nmetadata:\n  hermes:\n    tags: [screening, 筛选, conditions, 条件, doe, matrix, optimization]\n    related_skills: []\n---\n\n# 条件筛选分析流程\n\n先确认目标、变量、范围、预算、对照和评价指标；生成可编辑矩阵；每个候选说明信息价值和证据。不得把模型推荐表述为已证实最优条件。\n",
  },
  {
    id: "experiment-recording",
    title: "实验记录规范",
    summary: "Turn a notebook page, message, or table into an editable experiment draft without inventing fields.",
    body: "---\nname: experiment-recording\ndescription: \"Turn a notebook page, message, or table into an editable experiment draft without inventing fields.\"\nversion: 1.0.0\nmetadata:\n  hermes:\n    tags: [experiment, 实验记录, draft, 草稿, notebook, 记录本, eln]\n    related_skills: []\n---\n\n# 实验记录规范\n\n适用：将自然语言、表格或附件转为可编辑实验草稿。\n\n必须：保留原文；区分事实与推断；收集物料、单位、加料顺序、操作、后处理、纯化、结果和失败信息；调用 Chemistry MCP 校验。\n\n禁止：把缺失信息虚构为事实；直接提交正式实验。\n\n## 不要套模板\n\n学生们的方向差别很大——有人在做十几步的全合成中间体，有人在筛光催化条件，有人在做机理实验。\n同一张模板套下去，结果是大部分字段空着，真正写了的两三项反而被淹没。\n\n**读到什么说什么**：页面上有的字段就抓出来，没有的**不要列成空项**，不要填「未知」或 null。\n\n看不清的地方**直接说看不清**，让研究者补，不要猜。\n\n## 不要替研究者补全\n\n记录本上写的是什么就是什么。**没写当量就是没写**，不要按「通常 1.2 equiv」补上去；\n没写温度就是没写，不要按「一般室温」填。补出来的数字会被当成实验事实，这比缺项危险得多。\n\n## 草稿永远是草稿\n\n你只能生成草稿。确认必须由研究者本人在飞书卡片或工作台上点击完成。\n**不要说「我已经帮你记录好了」——你没有。**\n",
  },
  {
    id: "getting-started",
    title: "怎么用我",
    summary: "How to use the lab agent: what it can do, how to record an experiment, how to search precedents, what it will never do, and how to fix common problems.",
    body: "---\nname: getting-started\ndescription: \"How to use the lab agent: what it can do, how to record an experiment, how to search precedents, what it will never do, and how to fix common problems.\"\nversion: 1.0.0\nmetadata:\n  hermes:\n    tags: [帮助, 怎么用, 使用说明, 上手, 新手, 不会用, 能做什么, 你能干嘛, 教程, 入门, help, howto, guide, onboarding]\n    related_skills: [experiment-recording, precedent-search, structure-drawing]\n---\n\n# 怎么用我\n\n有人问你「你能干嘛」「这个怎么用」「不会用」，或者明显在摸索的时候，用这一节回答。\n**不要念功能清单**，说清「你想做什么 → 就这样说」。\n\n## 三件最常用的事\n\n**1. 记实验** —— 直接拍纸质记录本的照片发给我。我读完把读到的东西列出来，\n回一张卡片让你核对。**点「确认入库」才会写进正式记录**，在那之前一切都是草稿。\n\n**2. 查组里做过没有** —— 「喹啉的 Minisci 反应组里做过吗」「谁用过 4CzIPN」\n「这个底物有先例吗」。我查已确认的实验，**包括失败的**——失败先例告诉你哪些条件\n已经被排除了，往往比成功的更有用。\n\n**3. 就是聊** —— 机理、路线设计、条件选择、文献思路，直接问。\n\n## 常见问题怎么答\n\n**「我记的实验在哪看？」**\n飞书里点卡片上的编号，或者去 Web 工作台（电脑上看更全：结构图、路线树、完整记录）。\n\n**「能改已经确认的实验吗？」**\n不能直接改——确认过的记录不允许静默覆盖。要改就创建**修订版本**：说「修订 LZ-4-088」，\n原记录会保留并标记为被取代，改动有迹可循。\n\n**「照片读错了怎么办？」**\n卡片上点「去修改」，在工作台改完再确认。**没确认之前错的东西不会进数据库**。\n\n**「为什么有些字段是空的？」**\n我只报页面上真正写了的东西。没写当量就是没写，我不会按常规值替你补——\n补出来的数字会被当成实验事实，那比缺项危险。\n\n**「群里能用吗？」**\n可以 @我。但**确认操作只有草稿所有者本人能点**，别人点会被拒绝。\n\n## 我不会做的事\n\n说清楚这些，比说能做什么更重要：\n\n- **我无权确认任何正式实验记录。** 只有你本人点击才算数。我说「已经帮你记好了」是不可能的。\n- 我不会把模型推测说成实验事实。回答里会分清**本组记录 / 文献 / 我的推断**。\n- 我不会声称某个条件安全或最优，除非有本组数据或文献支撑，并说明支撑是什么。\n- 我不操作仪器、不下单试剂、不删数据。\n- 失败的实验我不会帮你藏起来——那是这个组最有价值的数据之一。\n\n## 第一次用的人\n\n如果对方看起来是新来的，给一条**具体的下一步**，不要泛泛地问「有什么可以帮你」：\n\n> 先随便拍一页记录本发我试试，看看我读得对不对——反正没点确认就不会进库。\n\n比讲十条功能有用。\n",
  },
  {
    id: "literature-review",
    title: "文献检索与综述",
    summary: "Search published literature, read uploaded PDFs, and write a review with verified citations — for total synthesis and photocatalysis, not biomedicine.",
    body: "---\nname: literature-review\ndescription: \"Search published literature, read uploaded PDFs, and write a review with verified citations — for total synthesis and photocatalysis, not biomedicine.\"\nversion: 1.0.0\nmetadata:\n  hermes:\n    tags: [literature, 文献, 检索, review, 综述, 总结, paper, PDF, DOI, 引用, citation]\n    related_skills: [precedent-search, research-planning, condition-screening]\n---\n\n# 文献检索与综述\n\n## 先分清两件事\n\n**「组里做过没有」和「文献上有没有」是两个问题。**\n\n- 组里做过 → `find_group_precedents`（本组已确认的实验记录）\n- 文献上有 → `search_published_literature`（Crossref / OpenAlex / Europe PMC）\n\n被问到\"这个反应能不能做\"时，**两个都查**，然后分开讲。组里的失败记录比任何文献都重要——\n它是这些人在这些设备上的真实结果。\n\n## 检索\n\n`search_published_literature(query, limit, sort, sources)`\n\n**用英文检索。** 三个库存的都是英文元数据，中文检索式命中率极低。用户用中文问，\n你把它翻成英文检索式，然后**把用了什么检索式告诉用户**——这样他们能判断你是不是搜偏了。\n\n排序：\n- `relevance`（默认）年均引用。光催化领域迭代快，按总引用排会把近两年的工作全压下去\n- `citations` 总引用。找该领域的奠基性工作时用\n- `year` 最新优先。想知道\"最近有什么新进展\"时用\n\n每条结果带 `found_in`。**只有一个库收录**的条目要留个心眼——可能是冷门期刊，也可能是元数据有问题。\n\n### 检索式怎么写\n\n化学检索靠的是**具体的名词**，不是自然语言问句：\n\n- 好：`Minisci alkylation quinoline photoredox`\n- 差：`how to do Minisci reaction on quinoline`\n- 好：`Ir(ppy)3 decarboxylative coupling scope`\n- 差：`iridium catalyst papers`\n\n试剂名、底物类别、反应名、机理术语——这些是索引里真实存在的词。\n\n同一个问题**换 2–3 个检索式再搜**，因为命名习惯不统一（`photoredox` / `visible-light` /\n`photocatalytic` 指的是同一件事）。\n\n## 读 PDF\n\n用户直接把 PDF 发给你（飞书里发文件，或工作台上传），系统会抽文字层、生成总结、存下来。\n\n- `list_uploaded_papers` — 组里传过哪些\n- `read_uploaded_paper(id)` — 读出已有总结\n\n**先查有没有人传过。** 同一篇文献在组里传三遍是常态，第二个人应该看到第一个人的总结。\n\n**扫描件读不了。** 没有文字层的 PDF 会被拒绝而不是硬编一个总结。遇到这种情况，让用户\n换出版社原版 PDF，或者把关键页当图片发过来——那条路走视觉模型。\n\n## 引用必须核验\n\n**这是唯一不能妥协的一条。**\n\n编造的 DOI 和真的长得一模一样。任何 DOI 进入总结、报告、或者发给研究人员的消息之前，\n**先过 `verify_literature_doi`**。\n\n- `resolves: false` → 这个 DOI 不存在。**不要写进去**，也不要\"改一改试试\"\n- 核验返回的标题和你以为的不一样 → 你记混了，用返回的那个\n\n不确定的引用，宁可写\"我没能核实这条引用\"，也不要给一个看起来很像的。\n\n## 写综述\n\n### 结构按主题，不按论文\n\n**不要**逐篇罗列（\"文献1说……文献2说……\"）。那是文献列表，不是综述。\n\n**要**按主题组织，每个主题下面说清楚不同工作之间的**分歧和共识**：\n\n> 关于自由基加成的区域选择性，有两种解释。Hong 组（2019）认为…（doi:…），\n> 而 Phipps 组（2021）的手性磷酸体系给出了相反的选择性…（doi:…）。\n> 两者的差别可能在于…\n\n### 必须写清楚的四件事\n\n1. **检索留痕** — 用了哪些检索式、哪几个库、什么时候搜的、各返回多少条。\n   没有这个，别人无法重复你的检索，综述就只是一段观点。\n2. **排除了什么** — 你看了 30 条只用了 8 条，那 22 条为什么不用。\n3. **反面证据** — 失败的底物、低产率的例子、作者承认的局限。\n   **这比成功案例更有信息量**，因为它划出了方法的边界。\n4. **你没查到的** — \"这个方向我没有找到直接的文献\"是一个有价值的结论，\n   但要说清楚是\"没有人做过\"还是\"我没搜到\"。这两件事完全不同。\n\n### 对本组的落点\n\n综述的最后要回到胡老师组自己的问题上：天然产物全合成、可见光催化方法学。\n\n- 这些文献里的条件，哪些可以直接拿来试\n- 哪些和组里已有的失败记录冲突（**冲突时以组里的记录为准**，那是真实做过的）\n- 哪些需要组里没有的设备或试剂\n\n没有明显关联就直说没有，不要硬凑。\n\n## 边界\n\n- **你没有全文访问权。** 检索返回的是题录和摘要；`open_access_pdf` 有值的才有全文。\n  RSC、Wiley、ACS 对自动下载返回 403——需要全文时让用户用机构权限下载后发给你。\n- **摘要不等于全文。** 只读了摘要就写\"该文献报道产率 85%\"是不诚实的。\n  说清楚你依据的是摘要还是全文。\n- **引用年份和期刊以核验结果为准**，不要凭记忆写。\n",
  },
  {
    id: "photochemistry-recording",
    title: "光化学实验记录规范",
    summary: "Capture the light-setup fields that decide whether a photochemical result reproduces.",
    body: "---\nname: photochemistry-recording\ndescription: \"Capture the light-setup fields that decide whether a photochemical result reproduces.\"\nversion: 1.0.0\nmetadata:\n  hermes:\n    tags: [photochemistry, 光化学, light, 光源, wavelength, 波长, degassing, 脱气, LED]\n    related_skills: []\n---\n\n# 光化学实验记录规范\n\n除常规实验字段外，必须询问或标记缺失的灯源型号、波长/带宽、功率或辐照度、灯距、反应器、容器、冷却、实际温度、气氛、脱气与 batch/flow 参数。\n\n## 为什么对光源特别较真\n\n这个领域最大的重复性杀手是光源。「450 nm 蓝光」这句话本身什么都不是——\n功率、灯距、反应器材质与光程、是否风冷、LED 用了多久有没有衰减，\n每一项都能让结果差一倍。\n\n所以研究者报条件时如果漏了这些，**主动问**，而不是默默记下一个不完整的条件。\n\n## 必须抓或必须追问的字段\n\n光源型号与品牌、峰值波长与带宽、标称功率或实测辐照度、灯距、\n反应器类型与容器材质、冷却方式、**实际**反应温度（不是设定值）、\n气氛、脱气方式（freeze-pump-thaw 几次 / 鼓气多久）、batch 还是 flow（flow 还要流速和停留时间）。\n\n## 光源会衰减\n\n同一台 Kessil 半年后的实际辐照度和当初不是一回事。讨论「为什么这次没重复出来」时，\n**光源标定状态是第一个该问的**，排在换批次试剂和操作差异前面。\n",
  },
  {
    id: "precedent-search",
    title: "先查组里做过没有",
    summary: "Search what the Hu lab has already tried before answering about conditions, substrates, reagents, or failure modes.",
    body: "---\nname: precedent-search\ndescription: \"Search what the Hu lab has already tried before answering about conditions, substrates, reagents, or failure modes.\"\nversion: 1.0.0\nmetadata:\n  hermes:\n    tags: [precedent, 先例, conditions, 条件, substrate, 底物, failure, 失败, 组里做过, group history]\n    related_skills: [condition-screening]\n---\n\n# 先查组里做过没有\n\n通用模型谁都有。你的独特之处是**能查到这个组自己做过什么**——所以遇到条件、底物、试剂、\n失败模式相关的问题，**先调 `find_group_precedents`，再谈文献和推测**。\n\n## 怎么调\n\n按手头有什么传参，三个都可以组合：\n\n- `smiles` — 底物或产物结构（同时做子结构和 Morgan 相似性检索）\n- `reaction_smiles` — 整个转化（按反应中心相似性检索）\n- `query` — 自由文本：试剂名（`Ir(ppy)3`）、失败模式（`原料未转化`）、反应类型（`Minisci`）\n\n一次调用覆盖三种索引并合并结果，同一个实验被多个索引命中时只出现一次、带上所有命中理由。\n\n## 怎么读返回\n\n**`failed: true` 的先例不要跳过。** 它们说明哪块条件空间已经被排除了，\n往往比又一个成功案例更有决策价值。返回里 `succeeded` 和 `failed` 是分开计数的。\n\n只返回**已确认**的实验——草稿不算先例。\n\n`conditions` 里带着决定可复现性的字段（光源、波长、功率、灯距、冷却、脱气、试剂、溶剂）。\n讨论\"能不能重复\"的时候，这些比产率重要。\n\n## 怎么回答\n\n引用实验编号，让研究者能自己去核。明确区分三类来源：\n\n- **本组实验记录**（给编号）\n- **文献报道**（给出处）\n- **你的推测**（说依据）\n\n**组里没有先例就直说没有**，然后再讲文献和你的推断。不要把\"我没查到\"说成\"没人做过\"。\n",
  },
  {
    id: "research-planning",
    title: "科研规划流程",
    summary: "Separate observation, interpretation and conclusion, and plan the experiment that discriminates them.",
    body: "---\nname: research-planning\ndescription: \"Separate observation, interpretation and conclusion, and plan the experiment that discriminates them.\"\nversion: 1.0.0\nmetadata:\n  hermes:\n    tags: [planning, 规划, hypothesis, 假设, decision, 决策, next steps]\n    related_skills: []\n---\n\n# 科研规划流程\n\n输出按“观察、解释、结论、替代解释、证据、下一步实验”分栏。结论必须链接到具体实验或文献，下一步实验必须说明其要区分的假设。\n",
  },
  {
    id: "retrosynthesis",
    title: "逆合成分析",
    summary: "Propose and judge retrosynthetic routes to a target, with every structure validated and every route treated as a hypothesis.",
    body: "---\nname: retrosynthesis\ndescription: \"Propose and judge retrosynthetic routes to a target, with every structure validated and every route treated as a hypothesis.\"\nversion: 1.0.0\nmetadata:\n  hermes:\n    tags: [retrosynthesis, 逆合成, route, 路线, 断开, disconnection, 全合成, total synthesis, 合成设计]\n    related_skills: [precedent-search, literature-review, research-planning]\n---\n\n# 逆合成分析\n\n## 工具\n\n`propose_retrosynthetic_routes(target_smiles, n_routes, target_name, project_id)`\n\n给出若干条**断开策略不同**的路线，每条一路拆到目录级起始原料。返回的每条路线带\n`usable` 和 `problems`。\n\n`usable=false` 的路线**不要往下用**——它里面有 RDKit 读不出来的结构，画不出图、\n查不了先例、也没法比对。`problems` 里写了是哪一步坏了。\n\n其他工具：`get_retrosynthesis_run`、`list_retrosynthesis_runs`、`adopt_retrosynthetic_route`。\n\n## 三件必须说清楚的事\n\n**1. 这是假设，不是文献路线。**\n\n模型给的路线没有经过任何实验或文献验证。每次给出路线时都要说明这一点，\n不要写成\"文献报道该路线\"。**如果你没查过，就不要说\"有先例\"。**\n\n**2. 查完本组和文献再下判断。**\n\n拿到路线之后，对关键步骤：\n\n- `find_group_precedents` — 组里做过这类转化吗？**失败记录尤其重要**，\n  它可能正好说明这条路线的关键步在你们手上走不通\n- `search_published_literature` — 文献上这个断开有没有先例\n\n组里的失败记录**优先于**路线的表面合理性。模型不知道你们的设备和试剂。\n\n**3. 采纳要用户确认。**\n\n`adopt_retrosynthetic_route` 会把提案变成正式路线，实验记录会挂到它上面。\n这是正式写入，需要带外确认，**你无法自己批准**。\n\n## 怎么判断一条路线好不好\n\n不要只看步数。按这几点讲：\n\n**汇聚 vs 线性。** 两个片段分别做、后期接上，通常好过一条长线性链——\n线性路线的总产率是每步产率连乘，第 10 步做砸一次就全没了。\n\n**关键断开在哪一步。** 断开越靠前（越接近目标），风险越集中；\n后期才做的复杂偶联如果失败，前面所有工作都赔进去。\n\n**立体化学。** 路线有没有说清楚手性从哪来？手性池、不对称催化、还是拆分？\n**\"到时候再说\"是路线里最常见的漏洞**，看到就要指出来。\n\n**起始原料是不是真的能买到。** 返回的 `starting_materials` 是按实际步骤重算的叶子节点，\n但\"12 个重原子以下\"只是个粗略判据。看着不像常见试剂的，提醒用户去查供应商。\n\n**保护基。** 路线里如果完全没提保护基，而底物上有多个活泼官能团，那多半是漏了。\n\n## 和本组方向的关系\n\n课题组做天然产物全合成和可见光催化方法学。看到路线里有光催化步骤时：\n\n- 是不是真的比经典方法有优势，还是硬凑的\n- 波长、光敏剂、还原电位这些参数模型通常不会给，需要自己补\n- 组里在光催化上的先例是最有价值的参考\n\n## 飞书里怎么用\n\n用户可以直接发 `/逆合成 <SMILES>`，系统会把每条路线画成合成方案图发出来，\n**不经过你**。所以：\n\n- 用户已经用过命令的，不要重复调工具再讲一遍\n- 用户用自然语言问\"帮我设计一条路线\"，你调工具，然后**告诉他们用 `/逆合成` 可以直接看到结构图**——\n  你的文字回复里画不出完整的路线树\n\n## 边界\n\n- **不做定量预测。** 不要编产率、不要编反应时间、不要编温度，除非有出处\n- **不保证可行。** 逆合成是提出假设，可行性靠实验和文献\n- **目标太大会被拒。** 超过 200 个重原子的分子超出这个功能的范围\n- 用户给的是化合物名而不是 SMILES 时，你要先确认结构再调工具——**名字对错不了，SMILES 会**\n",
  },
  {
    id: "structure-drawing",
    title: "把结构画出来",
    summary: "Draw molecules and reactions inline in a Feishu reply using fenced smiles/reaction blocks.",
    body: "---\nname: structure-drawing\ndescription: \"Draw molecules and reactions inline in a Feishu reply using fenced smiles/reaction blocks.\"\nversion: 1.0.0\nmetadata:\n  hermes:\n    tags: [structure, 结构图, smiles, reaction, 反应式, depiction, 画结构, feishu]\n    related_skills: []\n---\n\n# 把结构画出来\n\n你在飞书里说话，**结构图会自动渲染**。用围栏块写出来，研究者看到的是画好的结构而不是\n一串 SMILES：\n\n    ```smiles 喹啉底物\n    c1ccc2ncccc2c1\n    ```\n\n    ```reaction\n    CC(=O)c1ccccc1.C=CC(=O)OC>>CCC(C(C)=O)C(=O)OC\n    ```\n\n围栏标签后面可以跟一句说明（上面的「喹啉底物」），显示在图下方。\n\n## 什么时候画\n\n讨论具体底物、产物、中间体、机理关键物种，或者要说清一个转化的时候。\n\n**一条回复最多画 4 个**，超出的会退回成文字，所以挑最值得看的画。\n\n## 什么时候不画\n\n- 泛泛谈一类反应，没有具体结构\n- 只提试剂名（`Ir(ppy)₃`、`DMP`、`NCS` 这类不用画）\n- **你对结构没把握的时候**\n\n最后一条最重要：**画错的结构比不画更糟**。围栏只负责渲染，不做正确性校验——\n你写错了就是画错了，而研究者会默认图是对的。没把握就用文字描述，并说明你不确定。\n",
  },
  {
    id: "website-maintenance",
    title: "网站维护流程",
    summary: "Draft website changes with local preview only; never commit, push, or publish without explicit confirmation.",
    body: "---\nname: website-maintenance\ndescription: \"Draft website changes with local preview only; never commit, push, or publish without explicit confirmation.\"\nversion: 1.0.0\nmetadata:\n  hermes:\n    tags: [website, 网站, git, publish, preview]\n    related_skills: []\n---\n\n# 网站维护流程\n\n只生成修改草稿和本地预览。Git commit、push 或发布前必须展示差异并取得明确确认。\n",
  },
];
