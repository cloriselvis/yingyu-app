# 公开数据源研究记录

更新日期：2026-05-31

## 已落地

| 数据源 | 状态 | 当前价值 |
| --- | --- | --- |
| Donate-a-Cry | 已下载并已有评估脚本 | 用户自标弱标签，适合做工程基准、质量门控、Top-2 和错判复盘。 |
| EnesBabyCries | 已下载大包和特征数据 | 0.5、1.5、2.5、3.5 月纵向家庭录音，适合验证月龄校准、个体差异和“原因分类需谨慎”。 |

## 已尝试但需要授权或人工步骤

| 数据源 | 证据 | 下一步 |
| --- | --- | --- |
| Mendeley `Infant's Cry Sound` | 页面标注 CC BY 4.0，分类为 hungry、tired、uncomfortable；API zip 下载在当前环境返回 401。 | 后续可用浏览器人工下载或配置 Mendeley/Data API 授权，下载到 `D:\量化\yingyu-data\research\mendeley-infant-cry-sound`。 |
| ICSD | 官方 GitHub 说明数据在 Hugging Face，需要 request access 和 token；任务是 infant cry/snoring detection，不是意图分类。 | 申请 Hugging Face 访问；拿到后用于哭声检测、噪声鲁棒性和分段质量门控。 |
| Ubenwa CryCeleb2023 | Hugging Face 数据集需要同意共享联系信息；GitHub 仓库只有 SpeechBrain baseline 代码。 | 申请数据访问；主要用于 baby identity / speaker verification，不直接做意图分类。 |

## 研究但暂不下载

| 数据源/项目 | 当前判断 |
| --- | --- |
| Baby Chillanto | 常见于论文，类别偏病理/疼痛/正常等，公开可得性不稳定；暂时只作为文献基准。 |
| ChatterBaby | 有论文和产品说明，训练集包含 pain / hunger / fussy，公开页面称包含大量婴儿声音；原始数据不公开。 |
| Dunstan Baby Language | 常被论文引用，但公开数据来源和标签可靠性不够清楚；不作为近期算法基本盘。 |

## 对产品测试的影响

- 近期最有价值的不是追逐一个“大而全准确率”，而是建立三类离线检查：哭声/非哭声质量门控、月龄校准是否改善阈值、Top-2 + 追问是否覆盖有效处理。
- 公开数据标签来源差异很大，不能混在一起宣称统一准确率；每个数据源应单独报告标签定义、年龄范围、录音环境和可比较范围。
- 下一步优先把 EnesBabyCries 的年龄分层报告纳入常规复盘；如果拿到 ICSD/Mendeley 授权，再扩展批量评估入口。

## 来源

- EnesBabyCries: https://osf.io/ru7na/
- EnesBabyCries paper: https://www.nature.com/articles/s44271-023-00022-z
- Donate-a-Cry: https://github.com/gveres/donateacry-corpus
- Mendeley Infant's Cry Sound: https://data.mendeley.com/datasets/hbppd883sd
- ICSD: https://github.com/QingyuLiu0521/ICSD
- CryCeleb2023: https://huggingface.co/datasets/Ubenwa/CryCeleb2023
- ChatterBaby: https://www.chatterbaby.org/
