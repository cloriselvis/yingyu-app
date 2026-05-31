# AxonData Infant Cry Detection Sample

Updated: 2026-05-31

## Data

- Source: Hugging Face `AxonData/infant-cry-detection-dataset`
- License shown on dataset card: `cc-by-4.0`
- Task fit: cry-positive detection and quality-gate testing
- Local root: `D:\量化\yingyu-data\research\axon-infant-cry-detection-sample`
- Downloaded public sample files: 18 audio files
- Converted analysis files: 18 mono 16 kHz wav files

This dataset does not provide `hunger/pain/discomfort/tired` reason labels in the public sample. It should not enter reason-label accuracy reports. Its immediate value is testing whether real cry-positive audio is decoded, accepted by quality gates, and routed sensibly.

## Commands

```powershell
$root = 'D:\量化\yingyu-data\research\axon-infant-cry-detection-sample'

npm run benchmark:wav -- (Join-Path $root 'wav') --out (Join-Path $root 'rows.jsonl') --max-seconds 20
npm run report:cry-positive -- (Join-Path $root 'rows.jsonl') --out (Join-Path $root 'positive-cry-quality.md') --limit 30
npm run review:pack -- (Join-Path $root 'rows.jsonl') (Join-Path $root 'wav') --out (Join-Path $root 'review-pack') --limit 30
```

## Quality Result

| Metric | Value |
| --- | ---: |
| Rows | 18 |
| Decoded | 18 |
| Usable | 18 |
| Rejected | 0 |
| Positive-cry usable rate | 100% |
| Medium/high alert | 8 |
| Safety action mode | 0 |
| Avg quality score | 0.924 |
| Avg valid cry seconds | 9.394 |
| Avg cry ratio | 47.0% |

Gate result: passed the positive-cry quality gate, with alert samples requiring review.

## Routing Distribution

Top-1 distribution:

| Top-1 | Count |
| --- | ---: |
| `hunger` | 12 |
| `gas` | 4 |
| `tired` | 2 |

First question distribution:

| Question | Count |
| --- | ---: |
| `age_bucket` | 10 |
| `safety` | 8 |

## Review Pack

- Path: `D:\量化\yingyu-data\research\axon-infant-cry-detection-sample\review-pack\review.html`
- Selected clips: 8
- Copied audio: 8
- Missing audio: 0

Review priority: listen to all 8 medium-alert clips. The question is not whether their reason label is correct; the question is whether the safety/high-alert route is clinically conservative enough without being noisy.

## Product Implications

- Current quality gates did not reject any known cry-positive sample in this small public set.
- High-alert sensitivity still needs human listening because nearly half the clips triggered medium alert.
- This adds a new testing lane separate from reason accuracy: cry-positive quality/alert regression.
- Next useful dataset type is negative or mixed audio: non-cry infant sounds, household noise, adult speech, white noise, and short partial cries.

## Source

- Dataset: https://huggingface.co/datasets/AxonData/infant-cry-detection-dataset
