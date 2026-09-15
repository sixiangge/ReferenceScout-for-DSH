# Reference Scout for DeepSeek Harness

Reference Scout 在编码开始前检索公开 GitHub 仓库，先进行确定性过滤和可解释评分，再把固定到 commit SHA 的有限参考简报追加到 DSH 首步上下文。它不会克隆、安装或执行候选仓库代码。

经测试，本插件可以减少约40%的时间消耗和约64%的token消耗，但是可能会略微降低编码质量。

当前实现已覆盖：

- 自动识别明确的中英文编码任务，并在 `agent/pre-step` 中保留原消息、追加可回放的插件 notice；
- 提供模型可调用的 `research_reference` 工具，支持主动研究和带理由跳过；
- 使用 GitHub REST API 搜索、固定 commit、读取 README/文件树，并按任务匹配、维护活跃度、工程质量、架构、许可证和社区信号评分；
- 支持 `suggest` 与 `strict`。严格模式在成功研究、无合格结果或明确跳过前，阻止 `write`、`edit`、`str_replace_editor`、`bash`、`pwsh`；
- 默认不读取代码正文。显式打开代码证据后，仍执行路径白名单、体积限制、总字符限制和指令化文本清洗；
- WebUI 提供完整 Settings 卡、自动 notice、手动工具结果卡、会话头“参考研究”入口与只读右侧面板；面板支持重新研究和带理由跳过。

## 兼容基线

- DeepSeek Harness npm：`0.1.5-rc.2`
- 对应上游提交：`c291e7961a515f6d7af9304e7fd1d257929aef26`
- Node.js：`^22.19.0 || >=24.0.0`
- pnpm：`11.7.0`

DSH 仍是预览版本。升级 DSH 前应重新运行本项目的完整检查，并在真实 Web profile 中复测 Host 与 client bundle。

## 构建和安装

```powershell
Set-Location "E:\dshAddons\ReferenceScout for DSH"
pnpm install
pnpm run check
```

本地开发安装（把 `web` 替换成实际 profile）：

```powershell
pnpm dlx @deepseek-ai/dsh plugin --profile web add "E:\dshAddons\ReferenceScout for DSH"
pnpm dlx @deepseek-ai/dsh --profile web --dump-config
pnpm dlx @deepseek-ai/dsh web
```

发布到 npm 后，可将本地目录改为包名和版本号安装：

```powershell
pnpm dlx @deepseek-ai/dsh plugin --profile web add dsh-reference-scout@0.1.0
```

请将 `0.1.0` 替换为已发布的真实版本。发布所需的 npm 包快照、GitHub 源码快照和操作说明可由 `pnpm run stage:release` 生成到 `release/`。

随后重启该 DSH Web profile 并刷新浏览器。打开 **Settings → Plugins → Reference Scout**，可直接编辑自动触发、suggest/strict 模式、意图排除、GitHub 预算、许可证、网络、证据和缓存设置。会话出现研究记录后，可从会话头的“参考研究”入口打开右侧面板。

## 配置

插件 settings namespace 为 `reference-scout`。安装 patch 后，基础配置由插件 schema 提供默认值；可在 profile 的配置层覆盖。核心默认值如下：

```yaml
reference-scout:
  enabled: true
  autoTrigger: true
  mode: suggest
  intent:
    skipSmallChanges: true
  github:
    maxCandidates: 10
    hydrateTop: 5
    selectTop: 3
    timeoutMs: 15000
    maxRequests: 20
    concurrency: 3
    minStars: 5
    tokenEnv: GITHUB_TOKEN
  evidence:
    allowCodeExcerpts: false
    maxFilesPerRepo: 3
    maxTotalChars: 12000
    maxFileBytes: 100000
  policy:
    network: always
    allowedLicenses: [MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, MPL-2.0]
    allowArchived: false
    allowForks: false
    requirePinnedCommit: true
  cacheTtlMs: 900000
```

如果需要更高的 GitHub API 限额，在启动 DSH 的进程环境中设置 `GITHUB_TOKEN`。令牌只在 Host 进程中读取，不会写入工具结果、简报或浏览器 bundle。设置 `policy.network: never` 会完全关闭网络访问。

## 使用

通常无需额外操作。用户提出“实现、开发、修复、重构”等明确编码请求后，插件在首个模型步骤前运行，并附加一份 `Reference Scout: completed/no-results/failed` 简报。解释、总结、翻译、禁网状态以及默认的纯错别字/注释/格式/重命名任务不会自动触发。

Agent 也可以手动调用：

```json
{
  "query": "用 TypeScript 实现带缓存的搜索插件并添加测试",
  "action": "research"
}
```

WebUI 的“重新研究”和“为此任务跳过”通过 Host 命令执行；也可手工输入：

```text
/reference {"action":"research","query":"用 TypeScript 实现带缓存的搜索插件"}
/reference {"action":"skip","query":"用 TypeScript 实现带缓存的搜索插件","reason":"已有固定内部参考"}
```

严格模式下允许显式跳过，但必须提供理由：

```json
{
  "query": "用 TypeScript 实现带缓存的搜索插件并添加测试",
  "action": "skip",
  "reason": "任务是对本仓库现有实现的机械重命名，不需要外部参考"
}
```

`suggest` 模式遇到限流、超时或无结果时会给出真实状态并继续；`strict` 模式不会把失败伪装成成功，研究失败后仍阻止变更，直到重试成功、得到无结果结论或明确跳过。

## 安全边界与已知限制

- 只访问 `api.github.com` 的公开 REST API，不自动 clone，不运行第三方代码，不安装第三方依赖。
- 许可证未知或不在 allowlist、归档、fork、显式语言不匹配的候选会被硬过滤。
- 研究台账和缓存目前仅在进程内存中保存，DSH 重启后清空。
- GitHub 搜索使用确定性关键词，中文领域词映射是有限词表，不是语义检索。
- 查询会拆分常见驼峰/连字符技术名，并在精确结果为空或全部未通过许可证等硬策略时，以两个核心领域词回退；仍可能找到“工程质量高但只部分相关”的仓库。
- 已在 DSH `0.1.5-rc.2` 的真实 `web` profile 和系统 Chrome 中通过亮/暗主题、设置卡、确认框、会话入口、`/reference`、原生 notice、右侧面板及 390px 面板布局回归；暗色主按钮对比度实测为 18.08:1。
- DSH 自带 Settings 弹窗目前在 390px 视口仍采用桌面宽度，宿主导航和内容会横向裁切。插件卡自身会切为单列并扩大触控目标，但外部插件无法修改宿主弹窗布局；移动端右侧研究面板已验证不越界。发布前仍建议人工完成一次全键盘巡检。

## 开发验证

```powershell
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run pack:check
```

测试使用本地 fake fetch，不访问 GitHub。完整的 `pnpm run check` 同时验证声明文件、Host bundle、DSH lazy-CJS client bundle 和安装包必需文件。

小型 `AsyncTtlCache` A/B 的方法、原始 token 投影和隐藏测试结果见 `benchmarks/quality-ab/`。该实验是单次样本，不应解读为普遍质量提升声明。

真实 Web profile 回归使用已安装的系统 Chrome，不下载浏览器，也不会调用模型或访问 GitHub。先启动 DSH 并保留终端：

```powershell
pnpm dlx @deepseek-ai/dsh web --no-open --port 0
```

把终端打印的完整认证 URL 传给测试：

```powershell
pnpm run test:web -- "http://127.0.0.1:<port>/?token=<token>"
```

截图与回归证据写入 `artifacts/web-profile-test/`。测试只发送一条带理由的 `/reference {"action":"skip", ...}` 命令，以验证 Host–Client 数据路径；它不会触发模型推理。
