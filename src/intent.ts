import type { TaskCard } from './types.js'

const CODING_VERBS = /(?:implement|build|create|write|add|fix|refactor|migrate|integrate|develop|debug|optimi[sz]e|实现|开发|编写|新增|添加|修复|修正|纠正|修改|更新|重命名|格式化|重构|迁移|接入|集成|调试|优化|完成|设计)/iu
const CODING_NOUNS = /(?:code|app|plugin|component|api|endpoint|library|module|database|test|cli|webui|function|class|typo|spelling|comment|formatting|variable name|代码|程序|插件|组件|接口|库|模块|数据库|测试|命令行|网页|功能|函数|类|阶段|错别字|拼写|注释|格式|变量名)/iu
const NON_IMPLEMENTATION = /(?:explain|summari[sz]e|translate|review only|what is|analy[sz]e only|解释|总结|翻译|仅审查|只审查|是什么|分析一下|给出建议|可行性)/iu
const SMALL_CHANGE = /^(?:(?:please|请|帮我|麻烦)?\s*)?(?:(?:fix|correct|change|update|rename|format|修正|纠正|修改|更新|重命名|格式化)\s*)?(?:a |an |the |一个|一下|这些|此)?\s*(?:typo|spelling|comment|formatting|variable name|错别字|拼写|注释|格式|变量名)(?:\s*(?:only|而已|即可|就行))?[.!。！]?$/iu

const TERM_MAP: ReadonlyArray<readonly [RegExp, string]> = [
  [/(?:插件|\bplugin\b)/iu, 'plugin'],
  [/(?:搜索|\bsearch\b)/iu, 'search'],
  [/(?:缓存|\bcach(?:e|ing)\b|[a-z0-9]Cache\b|-cache\b|\bCACHE\b)/u, 'cache'],
  [/(?:\blru\b)/iu, 'lru'],
  [/(?:\bttl\b)/iu, 'ttl'],
  [/(?:\basync(?:hronous)?\b)/iu, 'async'],
  [/(?:认证|鉴权|\bauth(?:entication|orization)?\b)/iu, 'authentication'],
  [/(?:导入|\bimport\b)/iu, 'import'],
  [/(?:校验|验证|\bvalidation\b)/iu, 'validation'],
  [/(?:预览|\bpreview\b)/iu, 'preview'],
  [/(?:界面|\bwebui\b|\bui\b)/iu, 'ui'],
  [/(?:接口|\bapi\b)/iu, 'api'],
  [/(?:测试|\btests?\b|\btesting\b)/iu, 'testing'],
  [/(?:数据库|\bdatabase\b)/iu, 'database'],
  [/(?:上传|\bupload\b)/iu, 'upload'],
  [/(?:下载|\bdownload\b)/iu, 'download'],
  [/(?:命令行|\bcli\b)/iu, 'cli'],
]

const LANGUAGES: ReadonlyArray<readonly [RegExp, string]> = [
  [/(?:typescript|\bts\b)/iu, 'TypeScript'],
  [/(?:javascript|\bjs\b|node\.js|nodejs)/iu, 'JavaScript'],
  [/(?:python|\bpy\b)/iu, 'Python'],
  [/(?:rust)/iu, 'Rust'],
  [/(?:golang|\bgo\b)/iu, 'Go'],
  [/(?:c\+\+)/iu, 'C++'],
  [/(?:c#|csharp)/iu, 'C#'],
  [/(?:java)/iu, 'Java'],
  [/(?:kotlin)/iu, 'Kotlin'],
  [/(?:swift)/iu, 'Swift'],
  [/(?:php)/iu, 'PHP'],
  [/(?:ruby)/iu, 'Ruby'],
]

export interface IntentOptions {
  skipSmallChanges?: boolean
}

export function classifyCodingIntent(text: string, options: IntentOptions = {}): boolean {
  const normalized = text.replace(/\s+/gu, ' ').trim()
  if (!normalized || NON_IMPLEMENTATION.test(normalized)) return false
  if (options.skipSmallChanges !== false && SMALL_CHANGE.test(normalized)) return false
  return CODING_VERBS.test(normalized) && CODING_NOUNS.test(normalized)
}

export function extractKeywords(text: string): string[] {
  const result: string[] = []
  for (const [pattern, term] of TERM_MAP) if (pattern.test(text)) result.push(term)
  const rawLatin = text.match(/[a-z][a-z0-9.+#-]{2,}/giu) ?? []
  const latin = rawLatin.flatMap(raw => {
    const camelBreaks = raw.match(/[a-z0-9][A-Z]/g)?.length ?? 0
    if (!raw.includes('-') && camelBreaks < 2) return [raw.toLowerCase()]
    return raw
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .split(/[\s.-]+/gu)
      .map(part => part.toLowerCase())
      .filter(part => part.length >= 2)
  })
  const ignored = new Set(['the', 'and', 'for', 'with', 'this', 'that', 'from', 'into', 'using', 'please', 'implement'])
  for (const term of latin) if (!ignored.has(term) && !result.includes(term)) result.push(term)
  return result.slice(0, 12)
}

export function inferLanguage(text: string): string | undefined {
  return LANGUAGES.find(([pattern]) => pattern.test(text))?.[1]
}

export function buildTaskCard(text: string, options: IntentOptions = {}): TaskCard {
  const task = text.replace(/\s+/gu, ' ').trim().slice(0, 1_500)
  const language = inferLanguage(task)
  return {
    task,
    keywords: extractKeywords(task),
    codingIntent: classifyCodingIntent(task, options),
    ...(language === undefined ? {} : { language }),
  }
}
