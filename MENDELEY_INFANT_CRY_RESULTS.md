# Mendeley Infant's Cry Sound 评估记录

更新日期：2026-05-31

## 数据状态

- 数据源：Mendeley Data `Infant's Cry Sound`
- DOI：`10.17632/hbppd883sd.1`
- 本地路径：`D:\量化\yingyu-data\research\mendeley-infant-cry-sound`
- 授权：CC BY 4.0
- 文件：63 个，公开 API metadata 标称总大小 35,573,165 bytes
- 原始格式：57 个 wav、3 个 m4a、3 个 3gp
- 已下载：63/63
- 已转码：63/63，16 kHz mono wav

文件夹到哭了么弱标签的映射：

| Mendeley source label | 文件数 | 哭了么弱标签 |
| --- | ---: | --- |
| hungry | 31 | `hunger` |
| uncomfortable | 31 | `discomfort` |
| tired | 1 | `tired` |

## 复现命令

```powershell
$root = 'D:\量化\yingyu-data\research\mendeley-infant-cry-sound'
Invoke-WebRequest -Uri 'https://data.mendeley.com/public-api/datasets/hbppd883sd' -UseBasicParsing -Headers @{Accept='application/json'} -OutFile (Join-Path $root 'metadata.json')
npm run prepare:mendeley -- (Join-Path $root 'metadata.json') --out $root --download --convert-wav
npm run benchmark:wav -- (Join-Path $root 'wav') --out (Join-Path $root 'rows.jsonl') --labels (Join-Path $root 'labels.csv') --max-seconds 20
npm run report:results -- (Join-Path $root 'rows.jsonl') --out (Join-Path $root 'report.md') --limit 30
npm run review:pack -- (Join-Path $root 'rows.jsonl') (Join-Path $root 'wav') --out (Join-Path $root 'review-pack') --limit 30
```

## 当前结果

- 总样本：63
- 解码成功：63
- 可分析：48
- 质量拒判：15，主要是有效哭声不足
- 弱标签可比较：63
- 实际进入评估：48
- Top-1：17/48 = 35.4%
- Top-2：30/48 = 62.5%
- 高置信错判：0
- 抽听包：`D:\量化\yingyu-data\research\mendeley-infant-cry-sound\review-pack\review.html`
  - 抽听样本 63
  - 音频复制 63 成功，0 缺失
  - Top-2 未覆盖 18
  - 中/高警觉 14
  - 质量拒判 13
  - Top-2 接近且覆盖 18

分类表现：

| 弱标签 | 评估样本 | Top-1 | Top-2 | 主要预测 |
| --- | ---: | ---: | ---: | --- |
| `hunger` | 24 | 66.7% | 91.7% | `hunger` 16, `gas` 7, `tired` 1 |
| `discomfort` | 23 | 4.3% | 34.8% | `gas` 11, `hunger` 10, `discomfort` 1, `tired` 1 |
| `tired` | 1 | 0% | 0% | `hunger` 1 |

## 关键判断

- 这是目前最接近我们四类意图里的公开小数据之一，但标签仍是弱标签。
- `hungry -> hunger` 对齐度较好，Top-2 覆盖 91.7%，可以进入后续工程基准。
- `uncomfortable -> discomfort` 对齐度很差。文件名里包含 `minta_gendong`（要抱）、`popok_basah/ganti_popok`（尿布）、`natan` 等来源，语义更像“需要照护/一般不舒服”的大桶，不等同于我们当前 `discomfort` 类。
- `tired` 只有 1 条，不能用于估计困烦类准确率。
- 多数类 Top-2 基线达到 97.9%，因为标签几乎只有 hunger/discomfort 两类；所以 Mendeley 的总 Top-2 不能单独作为产品有效性指标。

## 下一步

- 先人工抽听 `review-pack` 里的 18 个 Top-2 未覆盖样本，判断是弱标签粗、音频质量差，还是 `discomfort/gas/hunger` 边界确实要调。
- 如果人工确认 `uncomfortable` 多数更像抱抱、尿布、找奶头，应在产品解释里把这类归为“先检查身体/环境和安抚需求”，不要强行当作单一声学类别。
- 后续可以把 Mendeley `hunger` 子集作为回归基准，把 `uncomfortable` 子集作为抽听和标签体系复盘基准。
