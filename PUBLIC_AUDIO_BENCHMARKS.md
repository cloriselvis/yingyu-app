# Public Audio Benchmark Comparison

- Generated: 2026-05-31T04:00:31.113Z
- Datasets: 4
- Total rows: 958
- Total evaluated weak-label rows: 563

This report compares engineering benchmarks only. Public labels are weak labels and have different definitions, so these numbers are not product accuracy claims.

## Dataset Summary

| Dataset | Rows | Decoded | Usable | Evaluated | Reject | Top-1 | Top-2 | Majority Top-2 | Medium/high alert | Safety | Age questions | Gate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| EnesBabyCries age-aware smoke | 24 | 24 | 20 | 13 | 16.7% | 30.8% | 69.2% | 100% | 6 | 0 | 0 | 未过线，需要复盘 |
| Mendeley Infant Cry Sound | 63 | 63 | 48 | 48 | 23.8% | 35.4% | 62.5% | 97.9% | 22 | 1 | 28 | 未过线，需要复盘 |
| Donate-a-Cry clean age-coarse | 457 | 457 | 331 | 331 | 27.6% | 32% | 74% | 89.1% | 195 | 25 | 40 | 样本不足，继续收集/抽听 |
| DynamicSuperb Infant Crying Classification | 414 | 414 | 211 | 171 | 49% | 43.9% | 73.1% | 85.4% | 87 | 8 | 143 | 样本不足，继续收集/抽听 |

## Label Breakdown

### EnesBabyCries age-aware smoke

Rows: `D:\量化\yingyu-data\research\enesbabycries\audio-smoke\rows-age-aware.jsonl`

| Label | Evaluated | Top-1 | Top-2 | Most common prediction |
| --- | ---: | ---: | ---: | --- |
| discomfort | 7 | 28.6% | 57.1% | hunger 3, discomfort 2, gas 1, tired 1 |
| hunger | 6 | 33.3% | 83.3% | discomfort 3, hunger 2, gas 1 |

### Mendeley Infant Cry Sound

Rows: `D:\量化\yingyu-data\research\mendeley-infant-cry-sound\rows.jsonl`

| Label | Evaluated | Top-1 | Top-2 | Most common prediction |
| --- | ---: | ---: | ---: | --- |
| hunger | 24 | 66.7% | 91.7% | hunger 16, gas 7, tired 1 |
| discomfort | 23 | 4.3% | 34.8% | gas 11, hunger 10, discomfort 1, tired 1 |
| tired | 1 | 0% | 0% | hunger 1 |

### Donate-a-Cry clean age-coarse

Rows: `D:\量化\yingyu-data\research\donateacry-clean\rows-age-coarse.jsonl`

| Label | Evaluated | Top-1 | Top-2 | Most common prediction |
| --- | ---: | ---: | ---: | --- |
| hunger | 274 | 34.3% | 78.5% | gas 139, hunger 94, discomfort 26, tired 15 |
| discomfort | 21 | 4.8% | 47.6% | gas 13, hunger 7, discomfort 1 |
| gas | 20 | 50% | 90% | gas 10, hunger 9, discomfort 1 |
| tired | 16 | 6.3% | 12.5% | hunger 8, gas 6, discomfort 1, tired 1 |

### DynamicSuperb Infant Crying Classification

Rows: `D:\量化\yingyu-data\research\dynamicsuperb-infant-crying-classification\rows.jsonl`

| Label | Evaluated | Top-1 | Top-2 | Most common prediction |
| --- | ---: | ---: | ---: | --- |
| hunger | 130 | 55.4% | 84.6% | hunger 72, gas 38, tired 11, discomfort 9 |
| tired | 16 | 0% | 6.3% | hunger 14, discomfort 1, gas 1 |
| gas | 13 | 15.4% | 61.5% | hunger 10, gas 2, discomfort 1 |
| discomfort | 12 | 8.3% | 50% | hunger 8, gas 3, discomfort 1 |

## Cautions

### EnesBabyCries age-aware smoke

- Only 13 evaluated rows; use as smoke/regression data, not a stable accuracy estimate.
- Top-2 below 70% gate (69.2%); needs review before rule changes.
- Majority Top-2 baseline (100%) exceeds model Top-2 by more than 20 points; labels are likely imbalanced or too broad.

### Mendeley Infant Cry Sound

- Only 48 evaluated rows; use as smoke/regression data, not a stable accuracy estimate.
- Top-2 below 70% gate (62.5%); needs review before rule changes.
- Majority Top-2 baseline (97.9%) exceeds model Top-2 by more than 20 points; labels are likely imbalanced or too broad.
- 28 rows still ask age first; add age context before judging downstream questions.

### Donate-a-Cry clean age-coarse

- 40 rows still ask age first; add age context before judging downstream questions.
- 1 high-confidence Top-1 misses require priority review.

### DynamicSuperb Infant Crying Classification

- High rejection rate (49%); inspect recording quality and segmentation.
- 143 rows still ask age first; add age context before judging downstream questions.
- 1 high-confidence Top-1 misses require priority review.

## Recommended Next Checks

- Keep EnesBabyCries as the age/context calibration regression set.
- Use Mendeley hunger as a small hunger regression set, but treat `uncomfortable` as a broad care-needs bucket until human review confirms subtypes.
- Keep Donate-a-Cry clean as a larger weak-label stress set; treat its age buckets as coarse and review `tired` plus high-alert misses before tuning.
- Treat DynamicSuperb as a prompt-benchmark copy of weak infant-state labels until provenance is clearer; its high rejection rate makes it useful for quality-gate review.
- Do not merge datasets into one headline accuracy number; compare per-source label definitions and majority baselines first.
- Build or import more balanced `tired` and safety/pain datasets before tuning those categories.
