# 首页 GitHub 贡献格

首页使用 GitHub 官方 GraphQL API 获取每天的贡献数量和强度等级，并与博客写作日历切换。访客无需登录 GitHub。

## 获取和填写 Token

1. 打开 [Fine-grained token 创建页](https://github.com/settings/personal-access-tokens/new)。对应路径是 GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token。
2. Token name 可填 `juicegao-site-contributions`，有效期可先选 90 天，Resource owner 选自己的账号。
3. 先展示公开贡献：Repository access 选 **Public repositories**，不添加额外仓库或账号权限。不要授予写入权限。
4. 点击 Generate token，自行保存生成的值。
5. 在服务器项目的 `.env` 中填写：

```dotenv
GITHUB_CONTRIBUTIONS_TOKEN=填入你生成的Token
GITHUB_CONTRIBUTIONS_USERNAME=你的GitHub用户名
```

用户名也可以留空，默认读取后台「网站资料 → GitHub 主页」，例如 `https://github.com/GGGxsb`。不要把 Token 写入后台公开资料、文章、源码或 `NEXT_PUBLIC_*` 变量，也不要发送到聊天中。

服务器更新并重建容器后生效：

```sh
git pull --ff-only
sudo docker compose --env-file .env -f deploy/compose.nginx-https.yaml up -d --build
```

令牌过期或撤销后，替换 `.env` 中的值并重新创建容器。

## 无法加载时排查

显示日历切换按钮只说明程序读取到了非空 Token 和格式有效的用户名，不代表 GitHub 已经验证它们。

在服务器项目目录拉取更新，然后执行以下只读诊断。脚本在现有应用容器中读取已生效的配置，不输出 Token；不修改数据库，也不使用缓存。即使暂时没有重建镜像，也能运行：

```sh
git pull --ff-only
sudo docker compose --env-file .env -f deploy/compose.nginx-https.yaml exec -T app node --input-type=module < scripts/diagnose-github-contributions.mjs
```

输出会区分容器未收到配置、Token 无效或过期、权限被拒、用户名不存在、GitHub 限流、网络或 DNS 故障、请求超时，以及数据格式不符。只需提供该诊断输出，不要提供 `.env` 内容、完整容器环境或 Token。

编辑 `.env` 后，普通 `restart` 不会重新读取容器环境；执行原部署命令 `up -d --build`，或用 `up -d --force-recreate app` 重新创建应用容器。源码更新时使用前面的重建命令。失败结果会暂存一分钟，修正后等待一分钟再刷新。

## 更新和展示规则

- 只请求 `contributionsCollection.contributionCalendar` 的每日日期、数量、等级和总量；不获取仓库内容或保存仓库详情。
- GitHub 的日期键直接用于日历，不换算为北京时间。博客写作日历仍按北京时间统计，两者各自保留原始日期规则。
- 首页异步读取贡献格，GitHub 请求不会阻塞页面主体；未配置 Token 或账号时仅显示写作日历。
- 成功结果在 SQLite 的 `github_contribution_cache` 中缓存一小时。刷新失败时继续展示上次成功结果，并提示尚未更新；首次失败时显示可重试状态，不伪造零贡献。
- 请求失败后暂缓一分钟再访问 GitHub；同一进程的并发请求合并。凭据更换后不会复用旧凭据下的缓存。
- Token 仅保存在服务器环境中，数据库只保存凭据的 SHA-256 指纹和日历数据。接口与网页不会返回 Token 或 GitHub 原始错误内容。

当前默认配置面向公开贡献。若要纳入私有或内部仓库贡献，需另行确认账号的贡献可见性设置和令牌权限；官方对这类数据还要求可选的 `read:user` scope。无需为日历授予完整 `repo` 写入权限。

参考：[创建 Token](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens)、[GraphQL 认证](https://docs.github.com/en/graphql/guides/forming-calls-with-graphql)、[贡献日历字段与私有贡献限制](https://docs.github.com/en/graphql/reference/users#contributionscollection)。
