# DynamicSuperb Infant Crying Classification Benchmark

Updated: 2026-05-31

## Data

- Source: Hugging Face `DynamicSuperb/Infant_Crying_Classification_Dataset`
- Local root: `D:\量化\yingyu-data\research\dynamicsuperb-infant-crying-classification`
- Format: one parquet test split with embedded CAF audio bytes
- Rows: 414
- Converted analysis files: 414 mono 16 kHz wav files
- Dataset card fields: `audio`, `file`, `instruction`, `label`

The public card has minimal provenance. The labels and CAF format look close to Donate-a-Cry style infant-state labels, so this should be treated as another weak-label engineering benchmark, not an independent product-accuracy source.

## Label Mapping

| Source label | Rows | Yingyu weak label | Comparable |
| --- | ---: | --- | --- |
| `hungry` | 257 | `hunger` | yes |
| `tired` | 39 | `tired` | yes |
| `belly pain` | 17 | `gas` | yes |
| `needs burping` | 9 | `gas` | yes |
| `discomfort` | 22 | `discomfort` | yes |
| `cold/hot` | 2 | `discomfort` | yes |
| `lonely` | 6 | observation only | no |
| `scared` | 2 | observation only | no |
| `don't know` | 60 | observation only | no |

Total comparable weak-label rows before quality gating: 346.

## Commands

```powershell
$root = 'D:\量化\yingyu-data\research\dynamicsuperb-infant-crying-classification'
$python = 'C:\Users\zsc\AppData\Local\Programs\Python\Python312\python.exe'
$pyarrow = 'D:\量化\yingyu-data\python-packages'

npm run prepare:dynamicsuperb -- (Join-Path $root 'test-00000-of-00001.parquet') --out $root --python $python --pyarrow-path $pyarrow --convert-wav
npm run benchmark:wav -- (Join-Path $root 'wav') --out (Join-Path $root 'rows.jsonl') --labels (Join-Path $root 'labels.csv') --max-seconds 20
npm run report:results -- (Join-Path $root 'rows.jsonl') --out (Join-Path $root 'report.md') --limit 40
npm run review:pack -- (Join-Path $root 'rows.jsonl') (Join-Path $root 'wav') --out (Join-Path $root 'review-pack') --limit 30
```

`prepare:dynamicsuperb` needs Python with `pyarrow`. On this machine, `pyarrow` is installed under `D:\量化\yingyu-data\python-packages` so repo runtime and GitHub Pages do not need that dependency.

## Result Summary

| Metric | Value |
| --- | ---: |
| Rows | 414 |
| Decoded | 414 |
| Usable | 211 |
| Rejected | 203 |
| Rejection rate | 49.0% |
| Comparable weak-label rows | 346 |
| Evaluated after quality gate | 171 |
| Top-1 | 43.9% |
| Top-2 | 73.1% |
| Majority Top-2 baseline | 85.4% |
| Medium/high alert | 87 |
| Safety action mode | 8 |
| Age-first questions | 143 |

## Label Breakdown

| Yingyu label | Evaluated | Top-1 | Top-2 | Main issue |
| --- | ---: | ---: | ---: | --- |
| `hunger` | 130 | 55.4% | 84.6% | Many hunger clips are scored as `gas` second or first. |
| `gas` | 13 | 15.4% | 61.5% | Very small subset; mostly predicted as `hunger`. |
| `discomfort` | 12 | 8.3% | 50.0% | Broad label, often predicted as `hunger` or `gas`. |
| `tired` | 16 | 0.0% | 6.3% | Current audio-only rules still fail tired. |

## Review Pack

- Path: `D:\量化\yingyu-data\research\dynamicsuperb-infant-crying-classification\review-pack\review.html`
- Selected clips: 118
- Copied audio: 118
- Missing audio: 0

Review priority: rejected clips first, then `tired` Top-2 misses, then high-alert samples. The 49% rejection rate is the most important signal from this dataset.

## Product Implications

- This dataset reinforces the current product design: use Top-2 plus follow-up questions, not a single hard answer.
- `tired` remains weak across public datasets and should be context-led, especially by awake time and sleep cues.
- The high rejection rate suggests public CAF snippets may contain too little usable crying or poor segmentation; quality guidance matters as much as reason scoring.
- Because the dataset card is sparse and labels resemble existing Donate-a-Cry-style labels, do not count this as independent validation.

## Source

- Dataset: https://huggingface.co/datasets/DynamicSuperb/Infant_Crying_Classification_Dataset
