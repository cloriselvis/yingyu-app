# Donate-a-Cry 真实数据跑批结果

日期：2026-05-30

数据位置：

- 原始 zip：`D:\量化\yingyu-data\donateacry-corpus-master.zip`
- 解压目录：`D:\量化\yingyu-data\donateacry-raw`
- 转换后 wav：`D:\量化\yingyu-data\donateacry-prepared`
- 全量结果：`D:\量化\yingyu-data\donateacry-results`
- cleaned 子集结果：`D:\量化\yingyu-data\donateacry-clean-results`

## 跑批命令

```powershell
cd D:\量化\yingyu-app

npm run prepare:donateacry -- D:\量化\yingyu-data\donateacry-raw\donateacry-corpus-master --out D:\量化\yingyu-data\donateacry-prepared --convert-wav

npm run evaluate:donateacry -- D:\量化\yingyu-data\donateacry-prepared --out D:\量化\yingyu-data\donateacry-results\rows.jsonl --summary D:\量化\yingyu-data\donateacry-results\summary.json

npm run evaluate:donateacry -- D:\量化\yingyu-data\donateacry-prepared\donateacry_corpus_cleaned_and_updated_data --out D:\量化\yingyu-data\donateacry-clean-results\rows.jsonl --summary D:\量化\yingyu-data\donateacry-clean-results\summary.json

npm run report:results -- D:\量化\yingyu-data\donateacry-results\rows.jsonl --out D:\量化\yingyu-data\donateacry-results\report.md --limit 50
npm run report:results -- D:\量化\yingyu-data\donateacry-clean-results\rows.jsonl --out D:\量化\yingyu-data\donateacry-clean-results\report.md --limit 50

npm run review:pack -- D:\量化\yingyu-data\donateacry-clean-results\rows.jsonl D:\量化\yingyu-data\donateacry-prepared\donateacry_corpus_cleaned_and_updated_data --out D:\量化\yingyu-data\donateacry-clean-results\review-pack --limit 30

npm run sweep:thresholds -- D:\量化\yingyu-data\donateacry-clean-results\rows.jsonl --out D:\量化\yingyu-data\donateacry-clean-results\threshold-report.md
```

## 数据准备结果

- 原始音频：1585 段
- 成功转换：1583 段
- 跳过：2 段，原因是文件名不符合 Donate-a-Cry 命名规范
- 输出格式：16 kHz mono wav

## 全量结果

全量包括 Android bucket、iOS bucket 和 cleaned/updated 数据，存在同 basename 重复样本，因此主要用于压力测试和质量门控观察。

- 总样本：1583
- 可分析：873
- 拒判率：44.9%
- 弱标签可比较：1351
- 实际评估样本：743
- Top-1 弱标签命中率：45.6%
- Top-2 弱标签命中率：79.0%
- 0-8 周核心年龄段 Top-1：49.1%
- 0-8 周核心年龄段 Top-2：78.3%

## cleaned 子集结果

cleaned 子集更适合作为当前工程基准。

- 总样本：457
- 可分析：316
- 拒判率：30.9%
- 实际评估样本：316
- Top-1 弱标签命中率：44.0%
- Top-2 弱标签命中率：79.7%
- 多数类弱标签基线：Top-1 想吃奶 82.3%；Top-2 想吃奶 + 一般不适 88.6%
- 0-8 周核心年龄段 Top-1：47.9%
- 0-8 周核心年龄段 Top-2：78.2%

## 置信度和行动模式，cleaned 子集

- 置信度分布：低 303，中 12，高 1
- 行动模式分布：Top-2 模式 285，安全优先 19，单一初判 12
- 低置信样本：Top-1 43.2%，Top-2 79.5%
- 中置信样本：Top-1 66.7%，Top-2 83.3%
- 高置信样本：1 段，Top-1 未命中但 Top-2 覆盖
- Top-2 模式样本：Top-1 45.3%，Top-2 78.9%
- 安全优先样本：Top-1 10.5%，Top-2 84.2%
- 单一初判样本：Top-1 66.7%，Top-2 91.7%

这说明当前策略非常保守：大多数真实样本不会被产品强行单判，而是进入 Top-2 + 动态追问路径。高置信错判样本很少，但更值得人工抽听，因为它们暴露的是规则方向性问题。

## 算法基本盘检查，cleaned 子集

- 结论：样本不足，继续收集/抽听
- 可比较样本：316，达标
- 质量拒判率：30.9%，达标
- Top-2 覆盖：79.7%，达标
- Top-2 模式覆盖：78.9% / 285 段，达标
- 高置信错判率：100% / 1 段，继续抽听
- 解码错误：0，达标

这个结果说明第一步不是“马上去做真实家庭内测”，而是继续补公开/自采音频里的高置信样本抽听，确认高置信阈值是否过松；同时保持 Top-2 + 动态追问作为当前产品策略。

## cleaned 子集抽听包

位置：`D:\量化\yingyu-data\donateacry-clean-results\review-pack`

打开 `review.html` 可以直接播放抽听包音频、记录人工判断，并导出标注 JSON/CSV。
导出 JSON 后可运行 `npm run report:review -- D:\量化\yingyu-data\donateacry-clean-results\review-pack\manifest.json D:\path\to\yingyu-review-annotations.json --out D:\量化\yingyu-data\donateacry-clean-results\review-pack\annotation-report.md`，把人工判断汇总为调参报告。
2026-05-31 已刷新 cleaned 子集 rows、报告和抽听包，`rows.jsonl`、`manifest.json`、`manifest.csv` 和 `review.html` 都包含新版声学特征快照。

- 抽听样本：118
- 音频复制：118
- 缺失音频：0
- 高置信错判：1
- Top-2 未覆盖：30
- 中/高警觉：27
- 质量拒判：30
- Top-2 接近且覆盖：30
- 解码错误：0

下一步人工抽听优先级：先听 `high-confidence-misses` 的 1 段，再听 `top2-misses` 前 30 段，然后抽听 `high-alert` 判断高警觉是否过度触发。

## cleaned 子集阈值候选对比

位置：`D:\量化\yingyu-data\donateacry-clean-results\threshold-report.md`

这份报告直接用 `rows.jsonl` 里的声学特征快照复评分，不重新解码音频，用来快速筛选规则候选。

- 可复评分：457 / 457
- 当前规则：Top-1 44.3%，Top-2 79.7%，Top-2 模式覆盖 78.9%，高警觉 141，安全优先 19
- 更多 Top-2 排查：Top-1 44.3%，Top-2 79.7%，Top-2 模式覆盖 79.1%，高置信错判 0 / 0
- 高警觉更克制：Top-1 44.3%，Top-2 79.7%，Top-2 模式覆盖 79.5%，高警觉从 141 降到 84，安全优先从 19 降到 4

结论：弱标签指标上，候选没有带来 Top-2 损失；“高警觉更克制”值得进入下一轮抽听复核，重点看它是否漏掉真正尖锐持续哭声。“更多 Top-2 排查”更符合当前产品策略，但需要确认不会让用户感觉过于不确定。

## 分类别表现，cleaned 子集

| 弱标签 | 样本 | Top-1 | Top-2 | 最常预测 |
| --- | ---: | ---: | ---: | --- |
| 想吃奶 | 260 | 49.6% | 85.4% | 想吃奶、拍嗝/胀气 |
| 一般不适 | 20 | 15.0% | 65.0% | 想吃奶、拍嗝/胀气 |
| 拍嗝/胀气 | 19 | 36.8% | 73.7% | 想吃奶、拍嗝/胀气 |
| 困烦/过度刺激 | 17 | 0.0% | 17.6% | 想吃奶、一般不适、拍嗝/胀气 |

## 主要结论

1. Donate-a-Cry 弱标签极度偏向 hungry，不能用 overall accuracy 证明产品准确率。
2. 当前启发式 Top-2 有一定覆盖，但在这个弱标签数据上不如“总猜多数类”的弱标签基线。
3. tired 类几乎没有被当前声学规则捕捉，说明“困烦”不能只靠音频硬判，需要动态追问或个体化反馈。
4. 质量门控拒判率较高，主要原因是有效哭声不足；这和真实移动端音频质量差一致。
5. 高警觉样本大量来自 hungry 标签，说明 Donate-a-Cry 的需求标签不足以验证痛哭/高警觉，只能用于抽听和阈值调试。
6. 置信度分层支持当前产品策略：低信心走 Top-2 和追问，高信心错判进入优先抽听和调参清单。

## 对产品的影响

- 第一版仍应输出 Top-2 和行动路径，不应输出单点确定答案。
- “困烦”需要更多依赖上下文追问，例如醒着多久、是否过度刺激，而不是纯音频判断。
- 真正训练模型前，必须收集“处理后是否缓解”的反馈标签；家长主观原因标签不够可靠。
- 报告页 `http://localhost:4173/report.html` 可以直接拖入 `rows.jsonl` 查看失败样本。

## 下一步

1. 已增加产品内的“录音质量解释”，减少用户对重录/拒判的困惑。
2. 已把 `tired` 的输出策略改成更依赖动态追问，而不是靠弱声学特征硬分。
3. 设计真实用户数据结构，优先保存处理动作和缓解时间，而不是原因猜测。
4. 后续再接预训练 speech embedding；Donate-a-Cry 弱标签只能做工程基准，不能作为最终训练目标。

## 本轮产品修正

- 保留原声学打分，不为了 Donate-a-Cry 弱标签强行调高 `tired`。
- 当音频不能可靠排除困烦/过度刺激时，产品会问“宝宝醒着大概多久了？”。
- 如果用户选择“超过 1 小时”，`tired` 概率会被显著上调，并进入优先处理路径。
- 拒判时会把“有效哭声不足、背景噪声偏强、成人声音干扰”等问题转成具体重录建议。
