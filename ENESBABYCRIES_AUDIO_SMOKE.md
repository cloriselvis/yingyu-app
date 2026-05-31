# EnesBabyCries 真实音频 Smoke Test

更新日期：2026-05-31

## 为什么做这一步

上一轮只复核了 EnesBabyCries 的特征 CSV。为了确认我们的离线音频链路真的能吃公开数据，这轮从 `audio_EnesBabyCries1A_bouts.zip` 抽取长哭闹 bout，跑本项目自己的 wav 解码、声学特征、质量门控、Top-2 和动态追问。

## 复现命令

```powershell
npm run prepare:enes-smoke -- D:\量化\yingyu-data\research\enesbabycries --out D:\量化\yingyu-data\research\enesbabycries\audio-smoke --per-group 2
tar.exe -xf D:\量化\yingyu-data\research\enesbabycries\audio_EnesBabyCries1A_bouts.zip -C D:\量化\yingyu-data\research\enesbabycries\audio-smoke -T D:\量化\yingyu-data\research\enesbabycries\audio-smoke\extract-list.txt
npm run benchmark:wav -- D:\量化\yingyu-data\research\enesbabycries\audio-smoke --out D:\量化\yingyu-data\research\enesbabycries\audio-smoke\rows.jsonl --labels D:\量化\yingyu-data\research\enesbabycries\audio-smoke\labels.csv --max-seconds 20
npm run report:results -- D:\量化\yingyu-data\research\enesbabycries\audio-smoke\rows.jsonl --out D:\量化\yingyu-data\research\enesbabycries\audio-smoke\report.md --limit 20
```

## 样本选择

- 每个 `age_month x cause_stop_engl` 组合抽 2 个长 bout。
- 年龄：0.5、1.5、2.5、3.5 月。
- 原因：`hunger`、`discomfort`、`loneliness`。
- 总计：24 个 wav。
- 可比较标签：只映射 `hunger -> hunger`、`discomfort -> discomfort`。`loneliness` 不直接映射到婴语的 `tired/gas/discomfort`，只做观察样本。

## 当前结果

- 总样本：24
- 解码成功：24
- 可分析：20
- 质量拒判：4
- 可比较样本：16
- 实际进入弱标签评估：13
- Top-2 覆盖：9/13 = 69.2%
- 所有可分析样本置信度均为 low，行动模式均为 Top-2。

## 发现的问题和修复

- EnesBabyCries 的 wav 使用 `WAVE_FORMAT_EXTENSIBLE`，原解码器只支持普通 PCM/float，已补充 extensible PCM 支持。
- 长 bout 和手机 8-15 秒录音不同，`benchmark:wav` 已新增 `--max-seconds 20`，用于模拟前端最多取前 20 秒分析。
- 对于公开弱标签，Top-2 比 Top-1 更符合产品目标。这个 smoke test 不能证明准确率，只能证明离线链路可跑，并暴露质量门控和高警觉样本。

## 下一步

- 抽听 Top-2 未覆盖样本，区分真实模型错判、Enes 标签与婴语标签体系不一致、以及截取前 20 秒不含主要哭声的问题。
- 对 `loneliness` 单独做安抚/接触类分析，不把它强行并入 `tired`。
- 后续如果加入后端模型或 embedding，这批 1A 长 bout 可作为回归 smoke test。
