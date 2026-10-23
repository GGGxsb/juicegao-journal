# 评论身份登录

本站支持 QQ、GitHub 和游客三种评论身份。QQ/GitHub 应用各自配置后，对应入口才会出现在评论区。登录后的昵称、头像和平台标识来自服务端验证的账号；选择游客后仍可自行填写昵称。两种评论都沿用原来的审核、回复、分页和限流。访客账号与管理员账号独立。

## 网站及平台地址

正式站点为 `https://juicegao.site`，先确保服务器的 `APP_ORIGIN=https://juicegao.site`，并能通过该地址正常访问 HTTPS 页面。

| 平台 | 网站首页 | 授权回调地址 |
| --- | --- | --- |
| QQ | `https://juicegao.site` | `https://juicegao.site/api/comment-auth/qq/callback` |
| GitHub | `https://juicegao.site` | `https://juicegao.site/api/comment-auth/github/callback` |

后台“账号设置 → 第三方评论登录”会显示配置状态及可复制的回调地址；它不会显示应用密钥。

## QQ

在 [QQ 互联](https://connect.qq.com/)注册开发者后创建“网站应用”，填写本人真实的开发者、网站及备案资料，并按照平台要求完成审核。请参照官方的[成为开发者](https://wiki.connect.qq.com/成为开发者/)和[创建应用](https://wiki.connect.qq.com/__trashed-2/)说明；本站不会代填身份资料或绕过平台审核。

网站首页和回调地址填写上表中的 QQ 地址。获取应用的 App ID 和 App Key 后，将它们写入服务器现有 `.env`，保留原有配置：

```dotenv
QQ_OAUTH_APP_ID=平台提供的AppID
QQ_OAUTH_APP_KEY=平台提供的AppKey
```

只请求 `get_user_info`，用于读取昵称和头像；使用 QQ 的授权码流程，并验证返回 OpenID 所属的应用。实现参照[授权码及令牌](https://wiki.connect.qq.com/使用authorization_code获取access_token/)、[OpenID](https://wiki.connect.qq.com/获取用户openid_oauth2-0/)和[用户信息](https://wiki.connect.qq.com/get_user_info/)官方文档。

## GitHub

打开 [GitHub Developer settings → OAuth Apps](https://github.com/settings/developers)，选择 New OAuth App。应用名称可填 `JuiceGao Blog Comments`，Homepage URL 和 Authorization callback URL 填写上表中的 GitHub 地址。

从应用设置取得 Client ID、生成 Client secret，写入服务器 `.env`：

```dotenv
GITHUB_OAUTH_CLIENT_ID=平台提供的ClientID
GITHUB_OAUTH_CLIENT_SECRET=平台提供的ClientSecret
```

本站仅使用公开身份，不申请邮箱、仓库或组织权限；授权采用随机 state 和 PKCE S256，遵循 [GitHub OAuth 官方文档](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)。

## 启用与验证

在服务器项目目录执行原来的部署命令：

```sh
git pull --ff-only
sudo docker compose --env-file .env -f deploy/compose.nginx-https.yaml up -d --build
```

三份 Compose 配置均已传入上述四个可选变量。密钥仅在服务端读取，不写入构建参数、前端代码或 Git。若本轮代码已构建完成、只是补充密钥，也可去掉 `--build` 让 Compose 根据更新的环境变量重建应用容器。

1. 在后台账号设置确认对应平台显示“已配置”。这只表示配置已填写，不表示平台审核已通过。
2. 从一篇已发布文章的评论区发起登录，完成平台授权后应回到原文章。
3. 确认所选身份显示自己的昵称和平台标识，提交评论，再到后台审核通过。
4. 检查前台头像、标识和回复是否正常；切换到游客评论时应重新要求填写昵称。
5. 退出后，再提交“已登录身份”的请求应被拒绝，管理员后台登录不受影响。

## 存储与恢复

升级自动执行 `0008_comment_identities.sql`，原文章和旧评论保持不变。旧评论展示为游客。

- `comment_accounts`：平台、应用 ID、平台内部用户标识、昵称及头像。不同应用/平台不会因昵称相同而合并。
- `comment_sessions`：仅保存会话令牌的散列，七天有效；浏览器使用 HttpOnly、SameSite=Lax、HTTPS Secure cookie。
- `comment_oauth_attempts`：十分钟有效、一次性的登录验证状态，绑定发起登录的浏览器和平台。
- `comments`：新增私有作者关联、平台及头像快照；对外接口不返回平台 OpenID、作者内部 ID 或会话信息。

不保存平台 access token、refresh token、邮箱或仓库数据。登录跳转前，将当前评论草稿临时放在本标签页的 sessionStorage 中，返回后恢复，避免正文因授权跳转丢失；此草稿不自动提交。

开发验证：`node scripts/verify-comment-auth.mjs` 使用独立临时数据库和模拟平台响应，覆盖旧库升级、state/PKCE、防重放、身份伪造、审核、账号切换、取消和退出。真实平台的登录仍需在应用申请完成后验证。
