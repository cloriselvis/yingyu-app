export const COPY = {
  brand: "哭了么",
  subtitle: "0-4 月哭声辅助判断",

  labels: {
    hunger: "想吃奶",
    gas: "拍嗝/胀气",
    tired: "困烦/过度刺激",
    discomfort: "一般不适"
  },

  ageBucketLabels: {
    "0-2w": "0-2 周",
    "3-8w": "3-8 周",
    "9-16w": "9-16 周",
    preterm_or_uncertain: "早产/不确定"
  },

  featureLabels: {
    durationSec: "录音时长",
    validCrySec: "有效哭声",
    cryRatio: "哭声占比",
    snrDb: "信噪估计",
    pitchMedian: "中位音高",
    pitchP90: "高位音高",
    highBandRatio: "尖锐度",
    burstiness: "爆发度",
    episodeCount: "哭声段数",
    irregularity: "不稳定度"
  },

  ui: {
    defaultBabyName: "宝宝",
    babyNameLabel: "宝宝",
    release: {
      title: "测试版",
      short: "只做辅助排查，不替代医生。",
      detail:
        "发热、摔碰后异常、精神差、呼吸或肤色异常、持续尖锐哭，先联系医生。录音默认只在本机分析；勾选“保留音频”后才会写入导出数据。",
      link: "隐私与安全"
    },
    capture: {
      ready: "准备录音",
      recording: "正在录音",
      analyzing: "正在分析",
      processing: "处理中",
      waitingCry: "等待哭声",
      liveHint: "建议 8-15 秒",
      qualityPrefix: "质量",
      needsRerecord: "需要重录",
      contextNeeded: "补充信息",
      done: "分析完成",
      recordButton: "开始录音",
      stopButton: "停止录音",
      secondarySummary: "录音不可用或需要留样",
      uploadAudio: "上传音频",
      keepAudio: "保留音频",
      microphoneBlocked: "当前地址不能直接录音。手机测试请用 HTTPS 链接；现在可以先上传音频。",
      microphoneError: "无法使用麦克风。请检查浏览器权限，或上传一段音频。",
      decodeError: "这段音频无法解码，请换一段 wav、mp3、m4a 或 webm 音频。",
      sampleError: "测试样本分析失败，可以重新加载页面后再试。",
      invalidAudio: "这段音频无法分析，请换一段更清楚的哭声。",
      environmentHint:
        "当前地址不是安全上下文，手机浏览器可能禁止直接录音。可以先上传音频；发给别人测试时建议部署成 HTTPS 链接。"
    },
    context: {
      title: "先确认几件事",
      pending: "待回答",
      continue: "查看分析",
      skip: "跳过"
    },
    result: {
      analysisTitle: "初判",
      actionTitle: "下一步",
      detailTitle: "信号",
      notAnalyzed: "未分析",
      waitingResult: "等待结果",
      analyzed: "已分析",
      error: "出错",
      waiting: "等待",
      uncertain: "不确定",
      openingLow: "先别急，录音里没有明显高警觉信号。先按下面步骤验证。",
      openingMedium: "先做一次安全确认，再看常规需求。",
      openingHigh: "这段更像需要先做安全排查。",
      likely: "最可能",
      close: "初判接近",
      second: "次可能",
      confidence: "把握",
      margin: "差距",
      percentagePointUnit: "个百分点",
      highAlert: "高警觉风险",
      evidence: "听到的信号",
      qualityHint: "质量提示",
      personalized: "个体化",
      personalEvidence: "已参考当前宝宝的历史反馈",
      empty:
        "录 8-15 秒哭声后，会先看录音质量，再给出最可能的两个方向和下一步处理。",
      qualityUnsuitable: "这段录音不适合判断。",
      retryAction: "可以重新录音，或上传另一段音频。",
      waitingActionPlan: "结果出来后，这里会显示优先处理步骤。",
      secondsUnit: "秒",
      insufficient: "不足",
      itemUnit: "条",
      firstPrediction: "初判",
      highAlertLevels: {
        high: "高",
        medium: "中",
        low: "低"
      }
    },
    detail: {
      feedbackReport: "反馈复盘",
      importBaby: "导入宝宝数据",
      exportBaby: "导出当前宝宝数据",
      resetBaby: "清空当前宝宝反馈",
      recentTitle: "最近反馈",
      none: "暂无",
      recentEmpty: "当前宝宝保存反馈后会显示在这里。",
      lowAlert: "低警觉",
      mediumAlert: "中警觉",
      highAlert: "高警觉",
      partial: "部分",
      recurred: "复哭",
      audio: "音频",
      unknownTime: "未知时间",
      unknown: "未知"
    },
    feedback: {
      effective: "这步有效",
      unresolved: "这步没缓解",
      unresolvedMarked: "已记下没缓解",
      saved: "已记录这次处理结果，并用于当前宝宝后续校准。",
      dataNote: "当前宝宝数据可在“信号”面板导出。",
      prompt: "处理后点一下：这次哪一步最有效？",
      localNote: "只在本机保存，用来逐步校准当前宝宝。",
      attemptPrefix: "已记下没缓解",
      selected: "已选：{action}。多久缓解？",
      back: "重选有效动作",
      saveFailed: "这次反馈没有保存成功。",
      storageFull: "可能是浏览器本地存储已满，可以先导出或清空当前宝宝反馈。",
      savedPrefix: "已记录",
      noRelief: "没有缓解",
      audioSaved: "，已保留音频",
      attemptSaved: "；也记下 {count} 个未缓解尝试",
      savedNote: "这条记录会影响当前宝宝后续相似哭声的排序。"
    },
    importExport: {
      exported: "已导出 {count} 条",
      imported: "已导入 {count} 条",
      importFailed: "导入失败",
      importUnknown: "导入文件无法识别。",
      invalidData: "导入文件不是有效的哭了么数据。",
      unsupportedVersion: "导入文件版本不支持。"
    }
  },

  feedbackActions: {
    hunger: "喂奶",
    gas: "拍嗝/排气",
    tired: "抱哄/睡眠",
    discomfort: "尿布/冷热/衣物检查",
    unresolved: "没有缓解"
  },

  reliefOptions: {
    fast: { label: "5 分钟内明显缓解", reliefTimeSec: 300, resolved: true },
    slow: { label: "10 分钟内才缓解", reliefTimeSec: 600, resolved: true },
    partial: { label: "只是部分缓解", reliefTimeSec: null, resolved: true, partial: true },
    recurred: { label: "缓解后又哭", reliefTimeSec: null, resolved: true, recurred: true },
    unresolved: { label: "没有缓解", reliefTimeSec: null, resolved: false }
  },

  quality: {
    issues: {
      tooShort: "录音少于 4 秒",
      lowVolume: "整体音量偏低",
      notEnoughCry: "有效哭声不足",
      lowCryRatio: "哭声占比偏低",
      noisy: "背景噪声偏强",
      adultVoice: "疑似成人声音干扰"
    },
    guidance: {
      "录音少于 4 秒": "录音时间太短：重新录 8-15 秒，尽量包含几次连续哭声。",
      整体音量偏低: "音量偏低：手机靠近宝宝 20-40 厘米，麦克风不要被手或衣物挡住。",
      有效哭声不足: "有效哭声太少：等宝宝正在哭时再录，至少保留 3 次呼气哭声。",
      哭声占比偏低: "哭声占比偏低：减少前后空白和安静等待，录宝宝正在哭的 8-15 秒。",
      背景噪声偏强: "背景噪声偏强：先关掉电视、音乐、白噪音或风扇，再靠近录。",
      疑似成人声音干扰: "疑似成人声音干扰：录音时先不要说话，让宝宝哭声单独进入麦克风。"
    },
    fallbackGuidance: "{issue}：建议重新录一段更清楚的哭声。",
    okGuidance: "这段录音质量可以分析。"
  },

  analysis: {
    confidenceLabels: {
      high: "较高",
      medium: "中等",
      low: "偏低"
    }
  },

  decisionEvidence: {
    highAlert: "尖锐度、持续性或爆发度偏高，先按高警觉流程排查。",
    mediumAlert: "高警觉风险不是低位，建议先回答安全追问。",
    lowQuality: "录音质量一般，结论需要更保守。",
    hungerRhythm: "哭声分段较清楚，节律相对重复。",
    hungerPitch: "中位音高处在普通需求哭声常见区间。",
    gasPitch: "高位音高或尖锐度偏高。",
    gasIrregular: "哭声不稳定度偏高，拍嗝/排气需要靠前排查。",
    tiredContinuous: "哭声更连续或爆发度较低，可能和困烦/过度刺激有关。",
    tiredHighBand: "高频占比不低，需结合醒着多久判断。",
    discomfortIrregular: "哭声不稳定或单段持续较长，先排查身体和环境不适。",
    discomfortLong: "有效哭声持续时间较长，一般不适需要快速检查。",
    personal: "已叠加当前宝宝历史反馈的个体化校准。",
    fallback: "声学特征组合得分最高的是 {label}。"
  },

  questions: {
    safety: {
      id: "safety",
      text: "是否伴随发热、摔碰、刚接种或精神状态异常？",
      options: [
        { label: "有", delta: { discomfort: 0.08 }, highAlertDelta: 0.25 },
        { label: "没有", delta: {}, highAlertDelta: -0.08 },
        { label: "不确定", delta: { discomfort: 0.04 }, highAlertDelta: 0.05 }
      ]
    },
    ageBucket: {
      id: "age_bucket",
      text: "宝宝现在多大？",
      options: [
        {
          label: "0-2 周",
          delta: { hunger: 0.04, discomfort: 0.02 },
          highAlertDelta: 0.04,
          profilePatch: { ageBucket: "0-2w" }
        },
        {
          label: "3-8 周",
          delta: { gas: 0.03, tired: 0.02 },
          highAlertDelta: 0.01,
          profilePatch: { ageBucket: "3-8w" }
        },
        {
          label: "9-16 周",
          delta: { tired: 0.04, hunger: -0.02 },
          highAlertDelta: 0,
          profilePatch: { ageBucket: "9-16w" }
        },
        {
          label: "早产/不确定",
          delta: { discomfort: 0.04 },
          highAlertDelta: 0.06,
          profilePatch: { ageBucket: "preterm_or_uncertain" }
        }
      ]
    },
    feedingTiming: {
      id: "feeding_timing",
      text: "上次喂奶大概多久前？",
      options: [
        { label: "45 分钟内", delta: { hunger: -0.14, gas: 0.1, discomfort: 0.04 } },
        { label: "45-120 分钟", delta: { hunger: 0.1 } },
        { label: "超过 2 小时/不确定", delta: { hunger: 0.12, gas: -0.03 } }
      ]
    },
    feedingByAge: {
      "0-2w": [
        { label: "45 分钟内", delta: { hunger: -0.12, gas: 0.1, discomfort: 0.04 } },
        { label: "45-120 分钟", delta: { hunger: 0.08 } },
        { label: "超过 2 小时/不确定", delta: { hunger: 0.14, gas: -0.03 } }
      ],
      "3-8w": [
        { label: "60 分钟内", delta: { hunger: -0.12, gas: 0.1, discomfort: 0.03 } },
        { label: "1-3 小时", delta: { hunger: 0.08 } },
        { label: "超过 3 小时/不确定", delta: { hunger: 0.13, gas: -0.03 } }
      ],
      "9-16w": [
        { label: "90 分钟内", delta: { hunger: -0.1, gas: 0.08, discomfort: 0.02 } },
        { label: "1.5-3 小时", delta: { hunger: 0.06 } },
        { label: "超过 3 小时/不确定", delta: { hunger: 0.12, gas: -0.03 } }
      ],
      preterm_or_uncertain: [
        { label: "45 分钟内", delta: { hunger: -0.1, gas: 0.09, discomfort: 0.05 } },
        { label: "45-120 分钟", delta: { hunger: 0.06 } },
        { label: "超过 2 小时/不确定", delta: { hunger: 0.12, discomfort: 0.02 } }
      ]
    },
    awakeLong: {
      id: "awake_long",
      text: "这次哭前醒着多久？",
      options: [
        { label: "超过 1 小时", delta: { tired: 0.22, hunger: -0.08, gas: -0.04 } },
        { label: "30-60 分钟", delta: { tired: 0.06 } },
        { label: "刚醒不久", delta: { hunger: 0.12, tired: -0.1 } }
      ]
    },
    awakeByAge: {
      "0-2w": [
        { label: "超过 45 分钟", delta: { tired: 0.2, hunger: -0.06, gas: -0.03 } },
        { label: "20-45 分钟", delta: { tired: 0.04 } },
        { label: "刚醒不久", delta: { hunger: 0.1, tired: -0.08 } }
      ],
      "3-8w": [
        { label: "超过 1 小时", delta: { tired: 0.22, hunger: -0.08, gas: -0.04 } },
        { label: "30-60 分钟", delta: { tired: 0.06 } },
        { label: "刚醒不久", delta: { hunger: 0.12, tired: -0.1 } }
      ],
      "9-16w": [
        { label: "超过 90 分钟", delta: { tired: 0.22, hunger: -0.08, gas: -0.04 } },
        { label: "45-90 分钟", delta: { tired: 0.06 } },
        { label: "刚醒不久", delta: { hunger: 0.1, tired: -0.1 } }
      ],
      preterm_or_uncertain: [
        { label: "超过 45 分钟", delta: { tired: 0.18, discomfort: 0.04, hunger: -0.05 } },
        { label: "20-45 分钟", delta: { tired: 0.04 } },
        { label: "刚醒不久", delta: { hunger: 0.08, tired: -0.07 } }
      ]
    },
    gasSigns: {
      id: "gas_signs",
      text: "有没有拱背、蹬腿、吐奶或肚子紧？",
      options: [
        { label: "有", delta: { gas: 0.18, discomfort: -0.04 } },
        { label: "没有", delta: { discomfort: 0.08, gas: -0.08 } },
        { label: "不确定", delta: { gas: 0.03 } }
      ]
    },
    bodyCheck: {
      id: "body_check",
      text: "尿布、冷热、衣物勒痕有明显不舒服吗？",
      options: [
        { label: "有", delta: { discomfort: 0.2, hunger: -0.06, tired: -0.04 } },
        { label: "没有", delta: { discomfort: -0.08 } },
        { label: "不确定", delta: { discomfort: 0.04 } }
      ]
    }
  },

  actionFlow: {
    safetyNote: "先按安全优先处理，别只当普通哭闹。",
    top2Note: "{first} 和 {second} 很接近，先做两件最容易验证的事。",
    top1Note: "先试“{first}”。没缓解，再切换第二项。",
    fallbackNote: "先做低成本安抚和身体检查。",
    safetySteps: [
      {
        category: "discomfort",
        title: "先排除危险信号",
        time: "立即",
        body: "测体温，检查是否摔碰、刚接种后异常、呼吸/肤色/精神状态异常。",
        next: "有异常或持续尖锐哭，尽快联系医生。"
      },
      {
        category: "discomfort",
        title: "做身体和衣物检查",
        time: "1-2 分钟",
        body: "看尿布、冷热、衣物勒痕、头发缠绕手脚、皮肤红肿。",
        next: "没有发现异常，再进入安抚和常规需求排查。"
      }
    ],
    steps: {
      hunger: {
        category: "hunger",
        title: "试喂奶",
        time: "3-5 分钟",
        body: "按需试喂，观察吸吮后哭声是否明显减弱。",
        next: "没有缓解就先抱直拍嗝，不继续硬喂。"
      },
      gas: {
        category: "gas",
        title: "拍嗝/排气",
        time: "3-5 分钟",
        body: "抱直拍嗝，或轻柔做排气动作；刚喂完先保持竖抱。",
        next: "没有缓解再回到吃奶、尿布冷热或困烦排查。"
      },
      tired: {
        category: "tired",
        title: "降低刺激并抱哄",
        time: "5-10 分钟",
        body: "降低灯光和声音，停止逗弄，抱哄或包裹安抚。",
        next: "越哭越尖锐就停止强哄，回到体温和身体检查。"
      },
      discomfort: {
        category: "discomfort",
        title: "尿布/冷热/衣物检查",
        time: "1-3 分钟",
        body: "检查尿布、冷热、衣物勒痕、头发缠绕手脚和姿势不适。",
        next: "发现异常先处理；没有异常再试喂奶或拍嗝。"
      }
    }
  }
};

export function formatCopy(template, values = {}) {
  return String(template).replace(/\{(\w+)\}/g, (_, key) => values[key] ?? "");
}
