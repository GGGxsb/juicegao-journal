# GitHub Pages：同步服务器上的公开内容

腾讯云继续运行完整网站、后台和 SQLite 数据库。GitHub Actions 从原站的公开接口读取内容，将文章、个人资料、引用的本站上传图片及已审核评论生成静态文件，再发布到 GitHub Pages。以后仍在腾讯云后台写作。

## 首次启用

1. 打开 GitHub 仓库的 **Settings → Pages**，将 **Build and deployment → Source** 选为 **GitHub Actions**。
2. 打开 **Settings → Secrets and variables → Actions → Variables**，新增 Repository variable：

   | Name | Value |
   | --- | --- |
   | `PAGES_SOURCE_URL` | 原网站完整 HTTPS 地址，例如 `https://origin.example.com` |

   地址只填写协议和域名，不加 `/admin`、路径、查询参数或账号密码。它是公开地址，填写到 Variables 即可；无需提供服务器密码、管理员密码或数据库。

3. 在仓库 **Actions** 中打开 **Sync public content and deploy Pages**，点击 **Run workflow**，选择 `main`。
4. 等待 `build` 和 `deploy` 都成功，再从 **Settings → Pages → Visit site** 打开网站。普通项目仓库地址形如 `https://用户名.github.io/仓库名/`。

工作流首先尝试 `/api/pages-export`；旧版服务器没有此接口时，会通过已有的文章、资料、评论、点赞和统计公开接口同步，所以无需先更新服务器。服务器升级到本仓库新版本后会自动使用聚合接口，减少请求数量。

## 日常使用

- 在腾讯云后台发布或修改内容。工作流每小时的第 23 分钟尝试同步，也可以随时手动 **Run workflow**。GitHub 定时任务可能延迟，不能保证即时更新。
- 每次成功同步都会重新生成整站；删除或撤回的文章会从新的 Pages 站点移除。已经下载的旧副本、浏览器缓存和搜索引擎缓存无法由此撤回。
- 文章、标签、分类、分页、搜索、地图及图片可以在 Pages 阅读。搜索在浏览器中完成，图片使用本次同步下载的文件；外部图床图片仍依赖原图床。
- 点赞数、阅读量、访问量、GitHub 贡献格及评论显示同步时的快照。Pages 访问不会写入腾讯云的访问统计；发表评论、回复、点赞和管理均通过页面入口回到腾讯云原站。
- 原站或图片下载失败时，本次运行停止，不发布不完整内容；已有 Pages 部署继续保留。原站恢复后重新运行即可。
- 临时 DNS、连接错误及 HTTP 429/502/503/504 会短暂等待后重试，每个资源最多尝试四次。
- `/sync-info.json` 记录本次内容生成时间、公开文章数和镜像图片数，可用于确认是否更新。

GitHub 对公开仓库的定时工作流有停用规则：仓库 60 天没有活动时，定时任务可能被自动停用。到 Actions 页面重新启用该工作流即可。参见 [GitHub 定时事件说明](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)。

## 保留两个不同的地址

先保持原域名指向腾讯云，Pages 使用默认 `github.io` 地址。原站必须允许 GitHub 的构建环境访问 HTTPS 公开接口和 `/media/` 图片；接口返回登录页、连接被重置或证书链错误都会导致同步失败。

如果以后想把现有域名改到 Pages，先给腾讯云配置另一个稳定的 HTTPS 域名，再将 `PAGES_SOURCE_URL` 改成这个原站地址并验证同步成功，最后才修改 Pages 自定义域名和 DNS。Pages 与同步来源不能使用同一域名，否则将无法继续取得服务器的新内容。构建脚本也会阻止这种配置。

Pages 自定义域名的证书由 GitHub Pages 管理，不需要把腾讯云证书私钥放进仓库。参见 [GitHub Pages 自定义域名](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site)。

## 同步范围

导出接口与同步脚本都使用明确的字段白名单，只接受已发布文章及公开资料。仅下载这些字段实际引用的本站 `/media/` 图片，不遍历服务器上传目录。待审核评论、草稿、自动写作备份、账号、会话、访客标识、数据库文件、`.env` 和证书不会进入导出内容。

只有 `.pages-build/out` 被上传为 Pages 产物；`.pages-content` 和 `.pages-build` 均已从 Git 及 Docker 构建上下文排除。请勿手动上传整个项目目录、服务器数据卷或备份包。

## 本地排查（可选）

日常部署由 Actions 完成，不需要在自己的电脑上启动网站。需要排查构建时，使用 Node.js 24，在项目目录运行：

```sh
npm ci
PAGES_SOURCE_URL=https://origin.example.com npm run pages:sync
PAGES_BASE_PATH=/repository-name PAGES_SITE_URL=https://username.github.io/repository-name npm run pages:build
```

Windows PowerShell 中，先通过 `$env:PAGES_SOURCE_URL='https://origin.example.com'` 等命令设置相同变量，再运行对应的 `npm run` 命令。`PAGES_BASE_PATH` 是默认 Pages 地址中的仓库名，个人主页仓库或自定义域名时留空。Actions 会自动从 Pages 配置读取这些值。

同步成功后才会更新本地内容指针。构建每次清空并重建隔离的 `.pages-build`，输出为 `.pages-build/out`，可交给任意普通静态文件服务器预览；不需要启动数据库或登录服务。

相关说明：[GitHub Pages 自定义工作流](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages)、[Next.js 静态导出](https://nextjs.org/docs/app/guides/static-exports)。
