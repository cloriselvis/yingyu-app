# Donate-a-Cry Clean Benchmark

Updated: 2026-05-31

## Data

- Source: Donate-a-Cry cleaned and updated subset
- Audio root: `D:\量化\yingyu-data\donateacry-raw\donateacry-corpus-master\donateacry_corpus_cleaned_and_updated_data`
- Result root: `D:\量化\yingyu-data\research\donateacry-clean`
- Source labels: `hungry`, `needs_burping`, `belly_pain`, `discomfort`, `cold_hot`, `tired`
- Yingyu weak-label mapping: `hungry -> hunger`, `needs_burping/belly_pain -> gas`, `discomfort/cold_hot -> discomfort`, `tired -> tired`

Donate-a-Cry is user self-labeled and highly imbalanced. It is useful as an engineering regression and review set, not as product accuracy evidence.

## Commands

```powershell
$audio = 'D:\量化\yingyu-data\donateacry-raw\donateacry-corpus-master\donateacry_corpus_cleaned_and_updated_data'
$out = 'D:\量化\yingyu-data\research\donateacry-clean'

npm run evaluate:donateacry -- $audio --age-context none --out (Join-Path $out 'rows-no-age.jsonl') --summary (Join-Path $out 'summary-no-age.json')
npm run evaluate:donateacry -- $audio --age-context coarse --out (Join-Path $out 'rows-age-coarse.jsonl') --summary (Join-Path $out 'summary-age-coarse.json')
npm run sweep:age -- (Join-Path $out 'rows-age-coarse.jsonl') --out (Join-Path $out 'age-sweep.md') --limit 40
npm run review:pack -- (Join-Path $out 'rows-age-coarse.jsonl') $audio --out (Join-Path $out 'review-age-coarse') --limit 30
```

## Result Summary

| Run | Rows | Usable | Reject | Evaluated | Top-1 | Top-2 | Core-age Top-2 | Age questions |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| No age context | 457 | 331 | 27.6% | 331 | 32.6% | 73.7% | 71.3% | 163 |
| Coarse age context | 457 | 331 | 27.6% | 331 | 32.0% | 74.0% | 79.3% | 40 |

Coarse age context only slightly changes overall Top-2, but it substantially reduces the number of first follow-up questions spent on age. That supports the product flow: record first, then ask for the missing context needed to interpret the cry.

## Coarse-Age Label Breakdown

| Yingyu label | Evaluated | Top-1 | Top-2 | Main issue |
| --- | ---: | ---: | ---: | --- |
| `hunger` | 274 | 34.3% | 78.5% | Many hunger clips are acoustically scored as `gas` first. |
| `gas` | 20 | 50.0% | 90.0% | Small but useful regression slice. |
| `discomfort` | 21 | 4.8% | 47.6% | Donate labels are broad and overlap with hunger/gas care needs. |
| `tired` | 16 | 6.3% | 12.5% | Current acoustic rules do not capture tired reliably without context. |

## Age Sweep Readout

- Current default age calibration strength remains `0.5`.
- On this dataset, current age calibration changes Top-2 by `+0.3%` versus no-age replay and reduces age-first questions from `163` to `40`.
- The highest sweep score was `1.5`, but it reduced Top-2 to `73.1%` and increased safety/high-alert activity, so it is not enough to justify changing the product default.

## Review Pack

- Path: `D:\量化\yingyu-data\research\donateacry-clean\review-age-coarse\review.html`
- Selected clips: 114
- Copied audio: 114
- Missing audio: 0

Review priority: high-confidence miss first, then Top-2 misses, then high-alert samples. In particular, inspect `tired` and high-alert clips before changing scoring rules.

## Product Implications

- Donate-a-Cry clean now passes a weak-label Top-2 engineering gate, but its majority-label baseline is still high, so it cannot become a headline accuracy claim.
- Age is useful, but mostly as a context-routing variable. It should not overpower the acoustic evidence.
- The app should keep the current interaction shape: record first, then ask targeted follow-up questions, then output Top-2 plus concrete care actions.
- We still need better balanced data for `tired`, pain/high-alert, and non-cry/noisy recordings.
