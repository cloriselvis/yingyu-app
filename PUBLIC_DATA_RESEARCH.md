# 公开数据源研究记录

更新日期：2026-05-31

## 已落地

| 数据源 | 状态 | 当前价值 |
| --- | --- | --- |
| Donate-a-Cry | 已重跑 clean 子集无年龄/粗年龄两套评估 | 用户自标弱标签，适合做工程基准、质量门控、Top-2 和错判复盘；当前摘要见 `DONATEACRY_CLEAN_RESULTS.md`。 |
| EnesBabyCries | 已下载大包和特征数据 | 0.5、1.5、2.5、3.5 月纵向家庭录音，适合验证月龄校准、个体差异和“原因分类需谨慎”。 |
| Mendeley `Infant's Cry Sound` | 已通过公开 API 下载 63 个文件，并转成 16 kHz mono wav | 标签为 hungry、tired、uncomfortable；`hunger` 子集可做小型回归基准，`uncomfortable` 标签过宽，需要人工抽听复核。 |
| AxonData Infant Cry Detection sample | 已下载 Hugging Face 公开 sample 18 段音频，并转成 16 kHz mono wav | 不是原因分类数据，适合做 cry-positive 质量门控和高警觉抽听；当前摘要见 `AXON_INFANT_CRY_SAMPLE_RESULTS.md`。 |
| DynamicSuperb Infant Crying Classification | 已下载 414 条 parquet 内嵌 CAF 音频并转成 16 kHz mono wav | 标签接近 Donate-a-Cry 风格但来源说明很少，适合作为弱标签质量门控和 Top-2 回归集；当前摘要见 `DYNAMICSUPERB_INFANT_CRYING_RESULTS.md`。 |

## 已尝试但需要授权或人工步骤

| 数据源 | 证据 | 下一步 |
| --- | --- | --- |
| ICSD | 官方 GitHub 说明数据在 Hugging Face，需要 request access 和 token；任务是 infant cry/snoring detection，不是意图分类。 | 申请 Hugging Face 访问；拿到后用于哭声检测、噪声鲁棒性和分段质量门控。 |
| Ubenwa CryCeleb2023 | Hugging Face 数据集需要同意共享联系信息；GitHub 仓库只有 SpeechBrain baseline 代码。 | 申请数据访问；主要用于 baby identity / speaker verification，不直接做意图分类。 |

## 研究但暂不下载

| 数据源/项目 | 当前判断 |
| --- | --- |
| Baby Chillanto | 常见于论文，类别偏病理/疼痛/正常等，公开可得性不稳定；暂时只作为文献基准。 |
| ChatterBaby | Pediatric Research 论文使用 691 名 0-24 月婴儿、pain/hungry/fussy 三类训练；UCLA 产品页面称重点是 hunger / pain / fussy。原始数据不公开，但它支持我们把 pain/high-alert 与普通需求分开。 |
| Dunstan Baby Language | 常被论文引用，但公开数据来源和标签可靠性不够清楚；不作为近期算法基本盘。 |
| p-j-r-1-2-3 Baby-Cry-Classification | Hugging Face 非 gated audiofolder，约 1GB zip，数据卡信息很少；下载前先核验 zip 目录结构、标签和授权。 |

## 新增论文要点

- ICSD arXiv v3（2025-04-02）把任务定义为 infant cry and snoring detection，包含真实强标、弱标和合成强标子集。它对我们最有价值的是“哭声检测/分段/噪声鲁棒性”，不是 `hunger/gas/tired/discomfort` 原因分类。
- InfantCryNet（ACML 2024，PMLR 2025）强调背景噪声和标注稀缺是婴儿哭声理解落地的核心问题，并用预训练音频模型、pooling、蒸馏和量化支持移动端部署。它支持我们的路线：先做端侧可跑的轻量规则/特征评估，后续再接后端 embedding 或压缩模型。
- 2024 EMBC / IEEE JBHI 的 ICDR multi-task 路线把 detection 和 reasoning 联合训练，用跨任务数据缓解数据稀缺和跨婴儿泛化问题。对产品路线的启发是：不要只训练“原因分类器”，哭声检测、质量门控和原因推断应共享表示但分开评估。
- 2024 Frontiers 的 Donate-a-Cry 研究明确使用 457 条 Donate-a-Cry 原始样本，类别极不均衡：hungry 382、tired 24、burping 8、belly pain 16、discomfort 27。这解释了为什么 Donate-a-Cry 只能做弱标签工程基准，不能当产品准确率承诺。
- ChatterBaby / UCLA 路线把类别限制在 `hungry`、`pain`、`fussy`，并强调这三类相对不依赖发育阶段。对我们来说，`pain` 更应该进入高警觉/安全流程，而不是和 `hunger/gas/tired/discomfort` 平级排序。
- Pediatric Research 的 colic 研究用 probabilistic random forest 区分 fussy / hungry / pain，并把 colic cry 与 pain cry 的声学相似性作为研究问题。这说明“持续尖锐痛哭”类场景需要安全优先，而不是只输出生活照护建议。
- 2024 Sensors 的多数据集整合论文提到 Donate-a-Cry、Chillanto、ESC-50 等标签体系和数据量不均衡，直接合并会造成多类别和样本不平衡问题。我们后续合并公开数据时必须保留数据源、标签定义和年龄范围，不能混成一个总准确率。
- 2026 pain-assessment review 总结了公开 neonatal/infant cry 数据集，也指出许多研究样本小、录音环境受控，年龄、临床状态和背景噪声变化不足。这支持我们继续做公开数据 + 自采音频 + 真实家庭反馈三层验证。

## 对产品测试的影响

- 近期最有价值的不是追逐一个“大而全准确率”，而是建立三类离线检查：哭声/非哭声质量门控、月龄校准是否改善阈值、Top-2 + 追问是否覆盖有效处理。
- 公开数据标签来源差异很大，不能混在一起宣称统一准确率；每个数据源应单独报告标签定义、年龄范围、录音环境和可比较范围。
- Mendeley 的 `uncomfortable` 不能直接等同哭了么 `discomfort`，更像“照护需求大桶”；这类数据要先人工抽听，再决定是否调 `discomfort/gas/hunger` 边界。
- 跨数据源汇总见 `PUBLIC_AUDIO_BENCHMARKS.md`：Enes、Mendeley 和 Donate-a-Cry 要按各自标签定义单独看，不能汇总成一个产品准确率。
- AxonData sample 进入 `report:cry-positive` 质量门控链路，18/18 通过可用性门控，但 8 段触发中警觉，需要抽听确认高警觉阈值是否过敏。
- DynamicSuperb 414 条已进入弱标签评估：Top-2 73.1%，但拒判率 49%，且 `tired` Top-2 只有 6.3%；它更适合作为质量门控和疲劳类失败样本库，而不是准确率宣传材料。
- 下一步优先把 EnesBabyCries、Mendeley、Donate-a-Cry 和 AxonData 的抽听包纳入常规复盘；如果拿到 ICSD 授权，再扩展哭声检测和质量门控评估入口。

## 来源

- EnesBabyCries: https://osf.io/ru7na/
- EnesBabyCries paper: https://www.nature.com/articles/s44271-023-00022-z
- Donate-a-Cry: https://github.com/gveres/donateacry-corpus
- Mendeley Infant's Cry Sound: https://data.mendeley.com/datasets/hbppd883sd
- ICSD: https://github.com/QingyuLiu0521/ICSD
- ICSD arXiv: https://arxiv.org/abs/2408.10561
- CryCeleb2023: https://huggingface.co/datasets/Ubenwa/CryCeleb2023
- AxonData Infant Cry Detection Dataset: https://huggingface.co/datasets/AxonData/infant-cry-detection-dataset
- DynamicSuperb Infant Crying Classification Dataset: https://huggingface.co/datasets/DynamicSuperb/Infant_Crying_Classification_Dataset
- Baby-Cry-Classification: https://huggingface.co/datasets/p-j-r-1-2-3/Baby-Cry-Classification
- InfantCryNet: https://arxiv.org/abs/2409.19689
- Multi-task Infant Crying Detection and Reasoning: https://pubmed.ncbi.nlm.nih.gov/40039419/
- Donate-a-Cry Frontiers interpretation paper: https://www.frontiersin.org/journals/artificial-intelligence/articles/10.3389/frai.2024.1337356/full
- ChatterBaby: https://www.chatterbaby.org/
- ChatterBaby / colic paper: https://www.nature.com/articles/s41390-019-0592-4
- UCLA ChatterBaby overview: https://newsroom.ucla.edu/magazine/chatterbaby-app-artificial-intelligence-infant-cries
- 2024 infant cry classification integration paper: https://www.mdpi.com/1424-8220/24/20/6575
- Pain assessment review: https://www.mdpi.com/2504-4990/8/3/76
