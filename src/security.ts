const INSTRUCTION_PATTERNS = [
  /ignore (?:all |any )?(?:previous|prior|above) instructions?/iu,
  /system prompt/iu,
  /developer message/iu,
  /execute (?:this |the following )?(?:command|script)/iu,
  /(?:忽略|无视).{0,16}(?:之前|以上|系统|开发者).{0,8}(?:指令|提示词|消息)/u,
  /(?:执行|运行).{0,12}(?:命令|脚本)/u,
]

const SECRET_NAMES = /(?:^|\/)(?:\.env(?:\.|$)|id_rsa|id_ed25519|credentials?(?:\.|$)|secrets?(?:\.|$)|.*\.(?:pem|p12|pfx|key))$/iu
const TEXT_EXTENSIONS = /\.(?:[cm]?[jt]sx?|py|rs|go|java|kt|kts|swift|php|rb|cs|cpp|cc|cxx|c|h|hpp|vue|svelte|astro|md|mdx|json|ya?ml|toml|ini|css|scss|html|sql|sh|ps1)$/iu

export function sanitizeUntrustedText(input: string, maxChars = 4_000): string {
  const normalized = input.normalize('NFKC').replace(/\0/gu, '')
  const safeLines = normalized.split(/\r?\n/u).filter(line => !INSTRUCTION_PATTERNS.some(pattern => pattern.test(line)))
  return safeLines.join('\n').replace(/\n{4,}/gu, '\n\n\n').slice(0, maxChars)
}

export function isSafeRepositoryPath(path: string): boolean {
  const normalized = path.replace(/\\/gu, '/')
  if (!normalized || normalized.startsWith('/') || normalized.includes('../') || normalized.includes('/..')) return false
  if (SECRET_NAMES.test(normalized)) return false
  return TEXT_EXTENSIONS.test(normalized)
}

export function chooseEvidencePaths(paths: readonly string[], limit: number): string[] {
  const weights: ReadonlyArray<readonly [RegExp, number]> = [
    [/(?:^|\/)(?:test|tests|spec|specs)(?:\/|$)/iu, 5],
    [/(?:^|\/)(?:src|lib|packages)(?:\/|$)/iu, 4],
    [/(?:architecture|design|adr)/iu, 3],
    [/(?:readme|docs?)(?:\.|\/|$)/iu, 2],
  ]
  return paths
    .filter(isSafeRepositoryPath)
    .map(path => ({ path, score: weights.reduce((total, [pattern, weight]) => total + (pattern.test(path) ? weight : 0), 0) }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, Math.max(0, limit))
    .map(item => item.path)
}
