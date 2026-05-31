# Public Audio Benchmark Comparison

- Generated: 2026-05-31T03:23:05.176Z
- Datasets: 3
- Total rows: 544
- Total evaluated weak-label rows: 392

This report compares engineering benchmarks only. Public labels are weak labels and have different definitions, so these numbers are not product accuracy claims.

## Dataset Summary

| Dataset | Rows | Decoded | Usable | Evaluated | Reject | Top-1 | Top-2 | Majority Top-2 | Medium/high alert | Safety | Age questions | Gate |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| EnesBabyCries age-aware smoke | 24 | 24 | 20 | 13 | 16.7% | 30.8% | 69.2% | 100% | 6 | 0 | 0 | 未过线，需要复盘 |
| Mendeley Infant Cry Sound | 63 | 63 | 48 | 48 | 23.8% | 35.4% | 62.5% | 97.9% | 22 | 1 | 28 | 未过线，需要复盘 |
| Donate-a-Cry clean age-coarse | 457 | 457 | 331 | 331 | 27.6% | 32% | 74% | 89.1% | 195 | 25 | 40 | 样本不足，继续收集/抽听 |

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

## Recommended Next Checks

- Keep EnesBabyCries as the age/context calibration regression set.
- Use Mendeley hunger as a small hunger regression set, but treat `uncomfortable` as a broad care-needs bucket until human review confirms subtypes.
- Keep Donate-a-Cry clean as a larger weak-label stress set; treat its age buckets as coarse and review `tired` plus high-alert misses before tuning.
- Do not merge datasets into one headline accuracy number; compare per-source label definitions and majority baselines first.
- Build or import more balanced `tired` and safety/pain datasets before tuning those categories.
