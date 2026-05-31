# 婴语 MVP

这是一个本地可跑的 0-4 月婴儿哭声辅助判断原型。

当前测试链接：

```text
https://cloriselvis.github.io/yingyu-app/
```

## 运行

```powershell
cd D:\量化\yingyu-app
npm start
```

打开：

```text
http://localhost:4173
```

支持浏览器安装为 PWA；首次打开后，录音分析页、隐私与安全说明页、评估报告页和反馈复盘页的应用壳可离线加载。

手机同 Wi-Fi 临时测试可以打开电脑局域网地址，例如：

```text
http://192.168.71.23:4173
```

移动端直接录音通常要求 HTTPS；如果用局域网 HTTP，建议先用“上传音频”。发给别人测试时看 `DEPLOY.md`，优先部署成 HTTPS 链接。

生成可部署的静态版本：

```powershell
npm run build
npm run check:release
npm run package:release
```

产物在 `D:\量化\yingyu-app\dist`，当前已部署到 GitHub Pages，也可部署到 Vercel、Netlify、Cloudflare Pages 等 HTTPS 静态托管服务。
压缩包在 `D:\量化\yingyu-app\release`，适合网页后台手动上传。
发给别人测试的步骤见 `DEPLOY.md`，群发文案见 `BETA_TEST_MESSAGE.md`。

评估报告页：

```text
http://localhost:4173/report.html
```

反馈复盘页：

```text
http://localhost:4173/feedback-report.html
```

隐私与安全说明页：

```text
http://localhost:4173/privacy.html
```

## 测试

```powershell
cd D:\量化\yingyu-app
npm test
```

测试覆盖当前核心行为：

- 静音/不可用音频会被拒判。
- 中等节律哭声可分析，并优先排序为想吃奶。
- 连续尖锐哭声会提升高警觉风险并触发安全追问。
- 当前宝宝历史反馈能改变相似哭声的排序。
- 安全追问的“有异常”答案会提高高警觉等级。
- 录完后缺少月龄档案时会追问月龄，并按 0-2 周、3-8 周、9-16 周、早产/不确定校准喂奶和清醒时长阈值。
- 月龄只作为温和先验参与打分，当前默认校准强度为 0.5 倍；避免让月龄压过哭声本身。

## 批量音频验证

分析单个 wav：

```powershell
cd D:\量化\yingyu-app
npm run analyze:wav -- D:\path\to\cry.wav
```

批量分析文件夹里的 wav，并输出 JSONL：

```powershell
cd D:\量化\yingyu-app
npm run benchmark:wav -- D:\path\to\dataset --out D:\path\to\results.jsonl
```

如果是自采音频，可以加一个人工弱标签文件来评估基本盘：

```json
{
  "baby-a/001.wav": "hunger",
  "baby-a/002.wav": "gas",
  "baby-b/003.wav": "tired"
}
```

然后运行：

```powershell
npm run benchmark:wav -- D:\path\to\self-audio --out D:\path\to\self-rows.jsonl --labels D:\path\to\labels.json
```

`labels.csv` 也支持，基础表头用 `file,label`。标签只用四类：`hunger`、`gas`、`tired`、`discomfort`。如果有月龄上下文，可以额外加 `ageBucket` 或 `ageMonth`；`ageMonth` 会自动映射到 `0-2w`、`3-8w`、`9-16w`，用于离线复现“录音后追问月龄再判断”的流程。

这一步是为了接 Donate-a-Cry、Baby Chillanto 或自采样本时，能批量得到质量门控、高警觉分数、Top-2 排序、置信度、行动模式、动态追问 ID 和完整声学特征快照，包括有效哭声时长、哭声占比、信噪比、分段数、音高、频谱、高频占比、爆发度和不稳定度。

## Donate-a-Cry 弱标签评估

Donate-a-Cry 原始文件名包含 app instance、时间、性别、年龄段、用户自标原因。先准备 manifest：

```powershell
cd D:\量化\yingyu-app
npm run prepare:donateacry -- D:\path\to\donateacry-corpus --out D:\path\to\prepared
```

如果本机有 `ffmpeg`，可以把 `.caf`、`.3gp` 等原始格式转成 16 kHz mono wav：

```powershell
npm run prepare:donateacry -- D:\path\to\donateacry-corpus --out D:\path\to\prepared --convert-wav
```

对准备好的 wav 目录做弱标签评估：

```powershell
npm run evaluate:donateacry -- D:\path\to\prepared --out D:\path\to\rows.jsonl --summary D:\path\to\summary.json
npm run evaluate:donateacry -- D:\path\to\prepared --age-context coarse --out D:\path\to\rows-age-coarse.jsonl --summary D:\path\to\summary-age-coarse.json
```

注意：Donate-a-Cry 是用户自标弱标签，只能用于工程基准和错误分析，不能直接当作产品准确率承诺。
`--age-context none` 是默认值；`strict` 只使用 4-8 周到 `3-8w` 的较稳映射；`coarse` 会把 Donate-a-Cry 的 0-4 周、4-8 周、2-6 月粗年龄段映射到婴语年龄桶，只用于离线对照，不当作精确月龄。

生成误差分析报告：

```powershell
npm run report:results -- D:\path\to\rows.jsonl --out D:\path\to\report.md --limit 30
```

报告会列出算法基本盘检查、分标签表现、置信度分层、行动模式分层、质量门控问题、高警觉样本、低信心/Top-2 样本、高置信错判、拒判样本、Top-1/Top-2 失败样本和接近样本，用来决定下一轮调参或人工抽听。

当前基本盘检查项包括：可比较样本数、质量拒判率、Top-2 覆盖、Top-2 模式覆盖、高置信错判率和解码错误。这个阶段先用公开数据和自采音频判断算法是否值得继续打磨，不用真实家庭内测数据证明产品有效。

EnesBabyCries 月龄分层复核：
```powershell
npm run report:enesbabycries -- D:\量化\yingyu-data\research\enesbabycries --out D:\量化\yingyu-data\research\enesbabycries\ENESBABYCRIES_REPORT.md
```

这份报告用于验证 0-4 月内声学特征随月龄变化，以及原因分类不应脱离上下文追问硬判。当前摘要见 `ENESBABYCRIES_RESULTS.md`，公开数据源盘点见 `PUBLIC_DATA_RESEARCH.md`。

EnesBabyCries 真实音频 smoke test：
```powershell
npm run prepare:enes-smoke -- D:\量化\yingyu-data\research\enesbabycries --out D:\量化\yingyu-data\research\enesbabycries\audio-smoke --per-group 2
tar.exe -xf D:\量化\yingyu-data\research\enesbabycries\audio_EnesBabyCries1A_bouts.zip -C D:\量化\yingyu-data\research\enesbabycries\audio-smoke -T D:\量化\yingyu-data\research\enesbabycries\audio-smoke\extract-list.txt
npm run benchmark:wav -- D:\量化\yingyu-data\research\enesbabycries\audio-smoke --out D:\量化\yingyu-data\research\enesbabycries\audio-smoke\rows.jsonl --labels D:\量化\yingyu-data\research\enesbabycries\audio-smoke\labels-no-age.csv --max-seconds 20
npm run benchmark:wav -- D:\量化\yingyu-data\research\enesbabycries\audio-smoke --out D:\量化\yingyu-data\research\enesbabycries\audio-smoke\rows-age-aware.jsonl --labels D:\量化\yingyu-data\research\enesbabycries\audio-smoke\labels.csv --max-seconds 20
npm run sweep:age -- D:\量化\yingyu-data\research\enesbabycries\audio-smoke\rows-age-aware.jsonl --out D:\量化\yingyu-data\research\enesbabycries\audio-smoke\age-sweep.md
npm run review:pack -- D:\量化\yingyu-data\research\enesbabycries\audio-smoke\rows-age-aware.jsonl D:\量化\yingyu-data\research\enesbabycries\audio-smoke --out D:\量化\yingyu-data\research\enesbabycries\review-age-aware --limit 20
```

当前真实音频 smoke test 摘要见 `ENESBABYCRIES_AUDIO_SMOKE.md`。

Mendeley `Infant's Cry Sound` 准备和评估：

```powershell
$root = 'D:\量化\yingyu-data\research\mendeley-infant-cry-sound'
Invoke-WebRequest -Uri 'https://data.mendeley.com/public-api/datasets/hbppd883sd' -UseBasicParsing -Headers @{Accept='application/json'} -OutFile (Join-Path $root 'metadata.json')
npm run prepare:mendeley -- (Join-Path $root 'metadata.json') --out $root --download --convert-wav
npm run benchmark:wav -- (Join-Path $root 'wav') --out (Join-Path $root 'rows.jsonl') --labels (Join-Path $root 'labels.csv') --max-seconds 20
npm run report:results -- (Join-Path $root 'rows.jsonl') --out (Join-Path $root 'report.md') --limit 30
npm run review:pack -- (Join-Path $root 'rows.jsonl') (Join-Path $root 'wav') --out (Join-Path $root 'review-pack') --limit 30
```

当前 Mendeley 评估摘要见 `MENDELEY_INFANT_CRY_RESULTS.md`。注意它的 `uncomfortable` 标签很宽，不能直接等同产品里的 `discomfort`。

跨公开数据源基本盘汇总：

```powershell
npm run report:datasets -- --dataset "EnesBabyCries age-aware smoke=D:\量化\yingyu-data\research\enesbabycries\audio-smoke\rows-age-aware.jsonl" --dataset "Mendeley Infant Cry Sound=D:\量化\yingyu-data\research\mendeley-infant-cry-sound\rows.jsonl" --dataset "Donate-a-Cry clean age-coarse=D:\量化\yingyu-data\research\donateacry-clean\rows-age-coarse.jsonl" --out PUBLIC_AUDIO_BENCHMARKS.md --limit 30
```

当前汇总见 `PUBLIC_AUDIO_BENCHMARKS.md`。这个报告会把 Top-2、质量拒判、年龄追问、中/高警觉和多数类基线放在同一张表里，避免把标签不均衡数据源误读成真实准确率。

基于 `rows.jsonl` 的声学特征快照复跑候选规则：

```powershell
npm run sweep:thresholds -- D:\path\to\rows.jsonl --out D:\path\to\threshold-report.md
```

这个命令不会重新解码音频，会直接比较当前规则、高警觉更克制/更敏感、更多 Top-2、更多单一初判等候选。它用来快速筛调参方向；候选真正进入产品前，仍要重新生成抽听包并人工复核。

如果 `rows.jsonl` 包含 `ageBucket`，可以单独复跑月龄先验强度：

```powershell
npm run sweep:age -- D:\path\to\rows-age-aware.jsonl --out D:\path\to\age-sweep.md
```

这个报告会比较无月龄、0.25/0.5/0.75/1.0/1.25/1.5 倍月龄先验，重点看 Top-2、年龄追问数量、安全优先和高置信错判。

如果数据只有“确认是婴儿哭声”的正样本、没有原因标签，用质量门控报告，不要放进 Top-1/Top-2 准确率汇总：

```powershell
npm run report:cry-positive -- D:\path\to\rows.jsonl --out D:\path\to\positive-cry-quality.md --limit 30
```

这个报告只看解码、可用率、拒判率、中/高警觉、安全模式、Top-1 倾向和首个追问，用于测试真实哭声会不会被质量门控误拒。

生成离线抽听包：

```powershell
npm run review:pack -- D:\path\to\rows.jsonl D:\path\to\audio-root --out D:\path\to\review-pack --limit 30
```

抽听包会按高置信错判、Top-2 未覆盖、中/高警觉、质量拒判、Top-2 接近覆盖和解码错误分组复制音频，并生成 `review.html`、`REVIEW.md`、`manifest.csv` 和 `manifest.json`。这是当前阶段最重要的人工复核入口：直接打开 `review.html` 就能播放音频、查看关键声学特征、标注人工判断，并导出 JSON/CSV。

抽听后，把 `review.html` 导出的标注 JSON 汇总成调参报告：

```powershell
npm run report:review -- D:\path\to\review-pack\manifest.json D:\path\to\yingyu-review-annotations.json --out D:\path\to\review-pack\annotation-report.md
```

这个报告会把“模型确认错判”“弱标签可能噪声”“Top-2 可接受”“高警觉过敏/合理”“质量门控过严/正确”分开，并汇总各组关键声学特征均值，避免只看 Donate-a-Cry 弱标签准确率就误调规则。

也可以打开本地 Web 报告页，直接拖入 rows.jsonl：

```text
http://localhost:4173/report.html
```

本机已跑过一轮 Donate-a-Cry 真实数据，结果记录在 `REAL_DATA_RESULTS.md`。

## 当前宝宝反馈复盘

页面里点击“导出当前宝宝数据”后，可以生成本地复盘报告。导出的 JSON 也可以在页面里“导入宝宝数据”，恢复 session 和校准历史后继续参与当前宝宝个体化判断。如果页面上勾选“保留音频”，反馈保存时会把本次音频留存在本机 IndexedDB，导出时随 JSON 附带，便于人工抽听复盘；默认不保留原始音频。

```powershell
cd D:\量化\yingyu-app
npm run report:feedback -- D:\path\to\yingyu-baby.json --out D:\path\to\feedback-report.md
```

报告会统计用户反馈下的 Top-1 命中、Top-2 覆盖、首步有效率、推荐路径覆盖、平均尝试次数、过程中未缓解尝试、最终未缓解反馈、追问答案分布、高警觉样本和需要复盘的错判。这里把“用户反馈的有效处理”当作弱真值，用于改进规则和当前宝宝个体化校准。

反馈复盘页也会给出第一阶段内测通过线：有效反馈至少 20 条、Top-2 覆盖有效处理不低于 70%、平均尝试次数不高于 2.5 步、最终未缓解率不高于 25%。样本不足时只提示继续收集，不把小样本误判成产品有效。

也可以打开本地 Web 反馈复盘页，直接拖入导出的宝宝 JSON：

```text
http://localhost:4173/feedback-report.html
```

## 当前能力

- 浏览器录音，默认建议录 8-15 秒，并在录音时实时提示音量、哭声是否足够和是否可以停止。
- 首页优先只进入录音流程，录完后再用 1-3 个上下文问题修正判断；如果当前宝宝还没有月龄档案，会在这里补问一次月龄，然后展示分析和建议。
- PWA 安装和离线应用壳缓存，方便在手机浏览器里当作 App 原型使用。
- 产品内有隐私与安全说明页，便于外部测试者了解录音、本地数据和医疗边界。
- 上传本地音频文件分析。
- 音频质量门控：哭声太短、音量偏低、背景噪声偏强、疑似成人声音干扰。
- 质量解释：拒判时给出具体重录建议，而不是只说“失败”。
- 浏览器端特征提取：有效哭声时长、哭声占比、信噪估计、音高、尖锐度、爆发度、段数、不稳定度。
- 高警觉风险评分。
- 常见需求 Top-2 排序：想吃奶、拍嗝/胀气、困烦/过度刺激、一般不适。
- 初判会显示置信度、Top-1/Top-2 差距和主要声学依据；低置信时按两个最可能原因组合排查。
- 不确定时动态追问。
- 下一步处理会显示为手机端排查卡片，每步有观察时间、“这步有效”和“这步没缓解”的一键入口。
- 困烦/过度刺激更多依赖醒着多久的动态追问，不强行靠音频硬判。
- 反馈学习：记录当前宝宝哪类处理有效、多久缓解、是否复哭/部分缓解，也记录同一次排查里先尝试但未缓解的动作；相似哭声会强校准，当前宝宝长期有效/无效的处理也会形成低幅度先验。
- 每次有效反馈会保存结构化 session：音频质量、声学特征、Top-2 初判、动态追问答案、用户验证结果和特征向量。
- 主页面会显示当前宝宝最近反馈，方便快速查看初判、实际有效处理和是否缓解。
- 当前宝宝数据可导出/导入 JSON，方便换设备、离线误差分析、人工复核或训练集整理。
- 原始音频留存为可选项，默认关闭；开启后音频只存在本机 IndexedDB，并在导出当前宝宝数据时作为附件写入 JSON。
- 当前宝宝反馈复盘页支持拖入导出的 JSON，展示反馈命中、错判、高警觉、追问答案和可播放音频附件。
- 当前宝宝反馈复盘页会计算内测有效性指标和通过线，用来判断产品是否真的帮家长更快找到有效处理路径。
- 音频分析核心在 `audio-core.js`，页面和测试共用同一套逻辑。
- Node 侧 wav 解码和批量分析入口，方便后续公开数据集验证。
- Donate-a-Cry 文件名解析、弱标签映射和评估汇总。
- rows.jsonl 误差分析报告生成器，方便定位拒判、高警觉和 Top-2 失败样本。
- rows.jsonl 本地可视化报告页，支持拖拽上传、指标卡片、分类表现、质量问题和样本列表。
- rows.jsonl 报告会给出算法基本盘检查，先服务公开数据和自采音频的离线验证。
- 离线抽听包生成器会把最该听的音频复制出来，配好可播放、可标注、可导出的本地复核页面。
- 抽听标注汇总器会把人工判断变成调参报告，区分模型错误、弱标签噪声、安全阈值和质量门控问题。
- 离线复评分器会用已缓存的声学特征快照比较规则候选，缩短调参迭代。
- 批量评估会输出置信度和行动模式，报告页能单独看低信心追问样本、高信心错判样本和安全模式样本。
- 当前宝宝反馈复盘报告生成器，方便把导出的真实使用反馈变成下一轮调参依据。

## 当前限制

- 这是启发式 + 轻量个体化原型，还不是训练后的医学级模型。
- 高警觉输出只做风险提醒，不做诊断。
- 反馈数据只保存在当前浏览器 localStorage；可选留存的原始音频只保存在当前浏览器 IndexedDB。
- 后续应接入离线验证方案中的公开数据集和预训练语音 embedding。
