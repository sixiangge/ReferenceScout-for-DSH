export const NS = 'referenceScout' as const

export const en = {
  title: 'Reference Scout', description: 'Research reusable GitHub references before implementation.',
  enabled: 'Enable plugin', autoTrigger: 'Automatically research explicit coding tasks',
  skipSmall: 'Skip typo, comment, formatting, and rename-only tasks', mode: 'Enforcement mode',
  suggest: 'Suggest', strict: 'Strict', strictHint: 'Strict mode blocks mutation tools until research completes or is explicitly skipped.',
  credential: 'GitHub credential', configured: 'Configured', notConfigured: 'Not configured', unknown: 'Unavailable',
  credentialHint: 'Only credential status is displayed. Secret values never enter the browser.', tokenEnv: 'Credential reference',
  budgets: 'Research budget', maxCandidates: 'Search candidates', hydrateTop: 'Inspect top results', selectTop: 'Keep references',
  maxRequests: 'GitHub request cap', timeout: 'Timeout (ms)', concurrency: 'Concurrency', minStars: 'Minimum stars',
  evidence: 'Evidence and policy', excerpts: 'Allow bounded code excerpts', maxFiles: 'Files per repository',
  maxChars: 'Total excerpt characters', licenses: 'Allowed SPDX licenses', network: 'Network access', always: 'Allowed', never: 'Disabled',
  cacheTtl: 'Cache lifetime (minutes)', security: 'Repository text is treated as untrusted evidence. Instruction-like lines, secret paths, binary files, oversized files, forks, archived repositories, and unapproved licenses are filtered by policy.',
  save: 'Save settings', saved: 'Settings saved', saveFailed: 'Could not save settings', readOnly: 'Settings are read-only in this connection.',
  clearCache: 'Clear research cache', clearConfirm: 'Clear all in-memory Reference Scout results on the Host?', cancel: 'Cancel', confirm: 'Clear cache', cleared: 'Cache invalidation requested',
  panelTitle: 'References', panelDescription: 'Pinned, read-only research evidence for this session.', noResearch: 'No reference research in this session yet.',
  openPanel: 'Open reference research', rerun: 'Research again', skip: 'Skip for this task', skipReason: 'Reason for skipping', runFailed: 'Action failed', running: 'Working…',
  latest: 'Latest result', history: 'History', task: 'Task', generated: 'Generated', cached: 'Cached', selected: 'Selected references', excluded: 'Excluded', warnings: 'Warnings',
  stars: 'stars', score: 'score', commit: 'Commit', evidencePaths: 'Evidence paths', signals: 'Signals', excerptsLabel: 'Code excerpts', repository: 'Open repository',
  originAutomatic: 'Automatic', originCommand: 'Panel action', originTool: 'Manual tool', close: 'Close', toolRunning: 'Researching GitHub references', toolResult: 'Reference research', details: 'Show details',
} as const

export type ReferenceScoutKey = keyof typeof en

export const zh: Record<ReferenceScoutKey, string> = {
  title: 'Reference Scout', description: '在开始实现前检索可复用的 GitHub 参考项目。',
  enabled: '启用插件', autoTrigger: '对明确的编码任务自动研究', skipSmall: '跳过仅错别字、注释、格式和重命名的任务', mode: '执行模式',
  suggest: '建议模式', strict: '严格模式', strictHint: '严格模式会阻止写入类工具，直到研究完成或明确跳过。',
  credential: 'GitHub 凭据', configured: '已配置', notConfigured: '未配置', unknown: '不可用',
  credentialHint: '界面只显示凭据状态；密钥值不会进入浏览器。', tokenEnv: '凭据引用',
  budgets: '研究预算', maxCandidates: '搜索候选数', hydrateTop: '深度检查数', selectTop: '保留参考数', maxRequests: 'GitHub 请求上限', timeout: '超时（毫秒）', concurrency: '并发数', minStars: '最低 Star 数',
  evidence: '证据与策略', excerpts: '允许受限的代码摘录', maxFiles: '每仓库文件数', maxChars: '摘录总字符数', licenses: '允许的 SPDX 许可证', network: '网络访问', always: '允许', never: '禁用',
  cacheTtl: '缓存时间（分钟）', security: '仓库文本只作为不可信证据。类似指令的文本、敏感路径、二进制文件、超大文件、Fork、归档仓库及未批准许可证都会按策略过滤。',
  save: '保存设置', saved: '设置已保存', saveFailed: '设置保存失败', readOnly: '当前连接中的设置为只读。',
  clearCache: '清除研究缓存', clearConfirm: '确认清除 Host 中 Reference Scout 的全部内存缓存？', cancel: '取消', confirm: '清除缓存', cleared: '已请求清除缓存',
  panelTitle: '参考研究', panelDescription: '本会话中固定到提交的只读研究证据。', noResearch: '本会话尚无参考研究。',
  openPanel: '打开参考研究', rerun: '重新研究', skip: '为此任务跳过', skipReason: '说明跳过原因', runFailed: '操作失败', running: '处理中…',
  latest: '最新结果', history: '历史记录', task: '任务', generated: '生成时间', cached: '来自缓存', selected: '入选参考', excluded: '已排除', warnings: '警告',
  stars: 'stars', score: '得分', commit: '提交', evidencePaths: '证据路径', signals: '信号', excerptsLabel: '代码摘录', repository: '打开仓库',
  originAutomatic: '自动触发', originCommand: '面板操作', originTool: '手动工具', close: '关闭', toolRunning: '正在研究 GitHub 参考', toolResult: '参考研究', details: '显示详情',
}
