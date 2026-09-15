# GitHub 源码仓库快照

这个目录由 `pnpm run stage:release` 生成，包含源码、测试、锁文件、CI 工作流及 Git 忽略规则；不包含 `node_modules`、构建输出、测试截图和发布快照。

推荐在项目根目录初始化并推送 Git 仓库，因为根目录才是后续持续开发的唯一来源。若需要交付一份独立源码快照，则可在本目录执行以下操作。

## 推送到 GitHub

1. 在 GitHub 网站创建一个**空仓库**；不要勾选 README、.gitignore 或 License，避免首次推送冲突。
2. 在此目录执行：

`git init`

`git add .`

`git commit -m "feat: initial Reference Scout release"`

`git branch -M main`

`git remote add origin https://github.com/<OWNER>/<REPOSITORY>.git`

`git push -u origin main`

3. 发布版本时，更新根目录版本并重新生成快照；推送对应提交后执行：

`git tag v0.1.0`

`git push origin v0.1.0`

然后可在 GitHub 的 Releases 页面基于该 tag 创建 Release。

## CI

`.github/workflows/ci.yml` 会在推送到 `main` 及 Pull Request 时运行 `pnpm run check`。
