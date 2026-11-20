export type Locale = 'zh' | 'en';

export interface Translations {
  'overlay.pill.calls': string;
  'overlay.pill.Collapse': string;
  'overlay.pill.Expand': string;
  'overlay.detail.sessionUsage': string;
  'overlay.detail.totalTokens': string;
  'overlay.detail.prompt': string;
  'overlay.detail.completion': string;
  'overlay.detail.cacheHit': string;
  'overlay.detail.cacheSaved': string;
  'overlay.detail.cost': string;
  'overlay.detail.turns': string;
  'overlay.detail.budget': string;
  'overlay.detail.budgetRemaining': string;
  'overlay.detail.budgetExceeded': string;
  'overlay.detail.recentTurns': string;
  'overlay.detail.byModel': string;
  'overlay.detail.noCalls': string;
  'overlay.detail.reset': string;
  'overlay.detail.copyReport': string;
  'overlay.detail.copiedReport': string;
  'overlay.detail.minimize': string;
  'overlay.detail.close': string;
  'overlay.turn.cached': string;
}

const zh: Translations = {
  'overlay.pill.calls': '次',
  'overlay.pill.Collapse': '收起用量详情',
  'overlay.pill.Expand': '展开用量详情',
  'overlay.detail.sessionUsage': '本次会话用量',
  'overlay.detail.totalTokens': '总 Token',
  'overlay.detail.prompt': '输入 (Prompt)',
  'overlay.detail.completion': '输出 (Completion)',
  'overlay.detail.cacheHit': '缓存命中率',
  'overlay.detail.cacheSaved': '缓存已省',
  'overlay.detail.cost': '预估花费',
  'overlay.detail.turns': '对话轮次',
  'overlay.detail.budget': '会话预算',
  'overlay.detail.budgetRemaining': '剩余',
  'overlay.detail.budgetExceeded': '已超支',
  'overlay.detail.recentTurns': '最近轮次明细',
  'overlay.detail.byModel': '按模型统计',
  'overlay.detail.noCalls': '等待第一次模型调用…',
  'overlay.detail.reset': '重置会话计数',
  'overlay.detail.copyReport': '复制费用报告',
  'overlay.detail.copiedReport': '已复制报告 ✓',
  'overlay.detail.minimize': '最小化为胶囊',
  'overlay.detail.close': '收起',
  'overlay.turn.cached': '缓存',
};

const en: Translations = {
  'overlay.pill.calls': 'calls',
  'overlay.pill.Collapse': 'Collapse usage details',
  'overlay.pill.Expand': 'Expand usage details',
  'overlay.detail.sessionUsage': 'Session Usage',
  'overlay.detail.totalTokens': 'Total Tokens',
  'overlay.detail.prompt': 'Prompt',
  'overlay.detail.completion': 'Completion',
  'overlay.detail.cacheHit': 'Cache hit rate',
  'overlay.detail.cacheSaved': 'Cache saved',
  'overlay.detail.cost': 'Est. cost',
  'overlay.detail.turns': 'Turns',
  'overlay.detail.budget': 'Session budget',
  'overlay.detail.budgetRemaining': 'left',
  'overlay.detail.budgetExceeded': 'exceeded',
  'overlay.detail.recentTurns': 'Recent turns',
  'overlay.detail.byModel': 'By model',
  'overlay.detail.noCalls': 'Waiting for first LLM call…',
  'overlay.detail.reset': 'Reset session counter',
  'overlay.detail.copyReport': 'Copy cost report',
  'overlay.detail.copiedReport': 'Report copied ✓',
  'overlay.detail.minimize': 'Minimize to pill',
  'overlay.detail.close': 'Collapse',
  'overlay.turn.cached': 'cached',
};

export function getTranslations(locale: Locale = 'zh'): Translations {
  return locale === 'en' ? en : zh;
}
