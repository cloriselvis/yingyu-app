# 月龄变量研究记录

## 结论

月龄应该进入“听完哭声后的追问和校准”，不应该放在首页让用户先填。原因是：0-4 月内哭声声学特征会随月龄变化，但公开研究并不支持仅靠声音稳定判断“饥饿/不适/孤独”等离散原因。

最新离线测试结论：月龄应该是温和先验，而不是强先验。EnesBabyCries 24 条真实音频 smoke test 里，0.5 倍月龄校准让 Top-1 从无月龄 15.4% 提到 30.8%，Top-2 保持 69.2%，同时把年龄追问从 19 条降到 0 条；1.0 倍月龄校准会把 Top-2 拉低到 61.5%。因此当前产品默认使用 0.5 倍月龄校准。

产品实现采用四档：

- `0-2w`：新生儿/出生头两周，喂奶间隔和安全阈值更保守。
- `3-8w`：第一、二个月，拍嗝/胀气和困烦问题仍靠追问确认。
- `9-16w`：第三、四个月，清醒时长阈值放宽。
- `preterm_or_uncertain`：早产或不确定，安全阈值更保守。

## 研究依据

- Nature / Communications Psychology 的 EnesBabyCries 纵向家庭录音研究覆盖 24 名婴儿、39201 段哭声，按约 15 天、1.5 月、2.5 月、3.5 月追踪。论文明确研究 age 对声学特征的影响，并指出哭声携带 age 和 baby identity 信息，但 cause 识别要控制个体差异。
- 本地已下载 OSF 数据到 `D:\量化\yingyu-data\research\enesbabycries`：
  - `data.zip`：358664167 bytes，已解压。
  - `audio_EnesBabyCries1B_cries.zip`：1731235114 bytes，保留 zip。
  - `audio_EnesBabyCries1A_bouts.zip`：3701617621 bytes，保留 zip。
  - `scripts.zip`、`source-data-for-figures.zip`：已解压，用于复核论文分析脚本和图表数据。
- `dataset_44605_short.csv` 本地统计：
  - age 0.5 月：13062 段，平均 pitch 441.2 Hz，平均 segment 0.738s，entropy 0.341。
  - age 1.5 月：14203 段，平均 pitch 438.7 Hz，平均 segment 0.837s，entropy 0.325。
  - age 2.5 月：12236 段，平均 pitch 460.5 Hz，平均 segment 0.860s，entropy 0.294。
  - age 3.5 月：5104 段，平均 pitch 459.4 Hz，平均 segment 0.907s，entropy 0.279。
- CDC 对喂养频率的公开建议也按“出生最初几天/最初几周和几个月/6-12 月”等年龄阶段描述，因此“上次喂奶多久前”不能用单一阈值。
- AAP infant fever 指南按低龄婴儿分层处理发热风险，因此 0-2 周、早产/不确定的高警觉阈值应更保守。

## 产品落地

- 首页仍然只做录音。
- 如果当前宝宝没有月龄档案，录完后第一轮追问里补问“宝宝现在多大？”，回答一次后保存到本机 localStorage。
- 有月龄档案后，不再重复问月龄；算法直接使用该档案校准：
  - 喂奶时间选项：0-2 周用 45 分钟/2 小时阈值，3-8 周用 1 小时/3 小时，9-16 周用 90 分钟/3 小时。
  - 清醒时长选项：0-2 周用 45 分钟，3-8 周用 1 小时，9-16 周用 90 分钟。
  - 安全阈值：0-2 周和早产/不确定更保守。
- 打分校准：月龄先验默认只按 0.5 倍进入分数，后续用 `npm run sweep:age` 在更大样本上复核。

## 主要来源

- EnesBabyCries paper: https://www.nature.com/articles/s44271-023-00022-z
- EnesBabyCries OSF dataset: https://osf.io/ru7na/
- CDC breastfeeding frequency: https://www.cdc.gov/infant-toddler-nutrition/breastfeeding/how-much-and-how-often.html
- AAP infant fever: https://www.aap.org/en/patient-care/infant-fever/
