import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const release = join(root, 'release')
const npmPackage = join(release, 'ReferenceScout for DSH - npm')
const githubRepository = join(release, 'ReferenceScout for DSH - GitHub')

const copyFile = async (from, to) => cp(join(root, from), join(to, from), { recursive: true })

await rm(release, { recursive: true, force: true })
await mkdir(npmPackage, { recursive: true })

for (const file of ['cordis.patch.yml', 'LICENSE', 'README.md']) await copyFile(file, npmPackage)
await cp(join(root, 'lib'), join(npmPackage, 'lib'), {
  recursive: true,
  filter: source => !source.endsWith('.d.ts.map'),
})

const packageManifest = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
delete packageManifest.scripts
delete packageManifest.devDependencies
delete packageManifest.packageManager
await writeFile(join(npmPackage, 'package.json'), `${JSON.stringify(packageManifest, null, 2)}\n`)

await mkdir(githubRepository, { recursive: true })
for (const file of [
  '.github',
  '.gitignore',
  'LICENSE',
  'README.md',
  'cordis.patch.yml',
  'package.json',
  'plan.md',
  'pnpm-lock.yaml',
  'scripts',
  'src',
  'tests',
  'tsconfig.json',
  'tsdown.config.ts',
  'vitest.config.ts',
]) await copyFile(file, githubRepository)

for (const file of [
  'benchmarks/quality-ab/README.md',
  'benchmarks/quality-ab/task.txt',
  'benchmarks/quality-ab/results.json',
  'benchmarks/quality-ab/results.md',
  'benchmarks/quality-ab/seed',
  'benchmarks/quality-ab/hidden',
  'benchmarks/quality-ab/baseline/src',
  'benchmarks/quality-ab/with-plugin/src',
]) await copyFile(file, githubRepository)

const npmGuide = `# npm 公共仓库发布包\n\n这个目录由 \`pnpm run stage:release\` 从项目根目录生成。除本说明外，其他内容与 npm 的实际包文件清单一致，可直接作为发布目录；不要在此目录修复源码。\n\n## 发布前\n\n1. 回到项目根目录，更新 \`package.json\` 的 \`version\`，并运行 \`pnpm run check\`。\n2. 运行 \`pnpm run stage:release\` 更新本目录。\n3. 在本目录执行 \`npm pack --dry-run\`，核对包名、版本和文件清单。\n4. 确认名称可用：\`npm view dsh-reference-scout version\`。若返回已存在版本或名称冲突，应先修改根目录的 \`name\`/\`version\`，再重新生成。\n5. 发布账户须启用 2FA，或使用允许绕过 2FA 的 granular access token；不要把 token 写入仓库、日志或 CI 配置。\n\n## 手动发布\n\n\`npm login\` 后，在此目录执行：\n\n\`npm publish\`\n\n当前包名未使用 scope，公开包默认发布为 public。若未来改成 \`@scope/name\`，首次公开发布应执行 \`npm publish --access public\`。同一个包名和版本一旦发布，不能重新使用。\n\n发布完成后的安装验证：\n\n\`pnpm dlx @deepseek-ai/dsh plugin --profile web add dsh-reference-scout@0.1.0\`\n\n上述命令中的版本号应替换为本次真实版本。\n`
await writeFile(join(npmPackage, 'PUBLISH.md'), npmGuide)

const githubGuide = `# GitHub 源码仓库快照\n\n这个目录由 \`pnpm run stage:release\` 生成，包含源码、测试、锁文件、CI 工作流及 Git 忽略规则；不包含 \`node_modules\`、构建输出、测试截图和发布快照。\n\n推荐在项目根目录初始化并推送 Git 仓库，因为根目录才是后续持续开发的唯一来源。若需要交付一份独立源码快照，则可在本目录执行以下操作。\n\n## 推送到 GitHub\n\n1. 在 GitHub 网站创建一个**空仓库**；不要勾选 README、.gitignore 或 License，避免首次推送冲突。\n2. 在此目录执行：\n\n\`git init\`\n\n\`git add .\`\n\n\`git commit -m "feat: initial Reference Scout release"\`\n\n\`git branch -M main\`\n\n\`git remote add origin https://github.com/<OWNER>/<REPOSITORY>.git\`\n\n\`git push -u origin main\`\n\n3. 发布版本时，更新根目录版本并重新生成快照；推送对应提交后执行：\n\n\`git tag v0.1.0\`\n\n\`git push origin v0.1.0\`\n\n然后可在 GitHub 的 Releases 页面基于该 tag 创建 Release。\n\n## CI\n\n\`.github/workflows/ci.yml\` 会在推送到 \`main\` 及 Pull Request 时运行 \`pnpm run check\`。\n`
// The GitHub snapshot is the public repository itself; keep local push instructions out of it.
void githubGuide

const overview = `# 发布目录\n\n- \`ReferenceScout for DSH - npm/\`：可直接提交给 npm 的最小包内容；说明见该目录内的 \`PUBLISH.md\`。\n- \`ReferenceScout for DSH - GitHub/\`：可独立初始化 Git 仓库的源码快照；说明见该目录内的 \`PUSH.md\`。\n\n这两个目录均为生成产物，源码修改或版本变更后请在项目根目录重新执行：\n\n\`pnpm run stage:release\`\n`
await writeFile(join(release, 'README.md'), overview)

console.log(`Release staging created:\n- ${npmPackage}\n- ${githubRepository}`)
