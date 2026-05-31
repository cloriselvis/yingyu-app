# EnesBabyCries 数据复核结果

生成命令：

```powershell
npm run report:enesbabycries -- D:\量化\yingyu-data\research\enesbabycries --out D:\量化\yingyu-data\research\enesbabycries\ENESBABYCRIES_REPORT.md
```

数据位置：

- `D:\量化\yingyu-data\research\enesbabycries\data\dataset_44605_short.csv`
- `D:\量化\yingyu-data\research\enesbabycries\source-data-for-figures`
- 音频大包保留为 zip，避免额外占用磁盘。

## 总览

- 分段样本：44605
- 宝宝数：24
- 录音 session：674
- 三个主要原因样本：39201，标签为 `hunger`、`discomfort`、`loneliness`

## 月龄分层

| 月龄 | 样本 | hunger | discomfort | loneliness | pitchHz | segmentSec | entropy | voiced |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 0.5 | 13062 | 5406 | 1627 | 3954 | 441.2 | 0.738 | 0.341 | 0.630 |
| 1.5 | 14203 | 3379 | 3845 | 5175 | 438.7 | 0.837 | 0.325 | 0.651 |
| 2.5 | 12236 | 3189 | 3968 | 4078 | 460.5 | 0.860 | 0.294 | 0.702 |
| 3.5 | 5104 | 1121 | 1057 | 2402 | 459.4 | 0.907 | 0.279 | 0.721 |

## 原因分布

| 原因 | 样本 | 占比 |
| --- | ---: | ---: |
| loneliness | 15609 | 35.0% |
| hunger | 13095 | 29.4% |
| discomfort | 10497 | 23.5% |
| DK | 5233 | 11.7% |
| pain | 95 | 0.2% |
| other | 76 | 0.2% |

## 论文图表源数据复核

- 年龄 RF 矩阵：对角均值 5.45，非对角均值 3.35，对角/非对角 1.63。
- 原因 RF 矩阵：对角均值 1.13，非对角均值 1.10，对角/非对角 1.02。

这个差异支持当前产品判断：月龄/个体信息比“直接从哭声判离散原因”更稳定，所以月龄应该用于校准，原因判断要结合录音后追问。

## 产品含义

- 月龄变量是必要的：0.5 到 3.5 月之间，哭声段时长、voiced 比例、entropy、pitch 都在变化。
- `loneliness` 不能直接等价成我们的 `tired`、`gas` 或 `discomfort`，只能作为“需要接触/安抚”的参考信号。
- 继续保持“先录音，再少量追问，再输出 Top-2 和处理路径”的交互，不把前置问卷堆到首页。
