# JuiceGao 个人记录网站

可部署在自己的服务器上。文章、随记、站点资料和上传图片在自己的 Docker 数据卷中保存；后台使用独立的管理员账号与密码。

## 功能

- 首页参考 [Axi-Theme](https://github.com/Axi404/Axi-Theme) 的个人资料与分节布局，展示个人介绍、学习经历、最近三条生活随谈、站点统计和写作日历。学习经历未填写、随记未发布时，对应模块自动隐藏。
- 文章、随记、分类、归档和搜索均支持数据库分页；前台列表每页 15 条，后台每页 10 条。统计覆盖全部内容，公开页面不会计入草稿。
- Markdown 编辑与预览、草稿发布、图片上传、站点资料和独立账号管理。
- 访客填写昵称即可评论和回复，评论审核通过后公开；后台支持搜索、分页、通过、拒绝、删除与站主公开回复。评论以纯文本展示。
- 文章支持点赞与取消点赞，同一 IP 对同一篇文章只计一票；评论每 IP 每 10 分钟最多 5 次，点赞操作每 IP 每 10 分钟最多 30 次。

多人共用同一公网 IP 时会共用点赞状态和频率额度。互动数据库仅保存基于私密配置计算的地址摘要，不保存原始 IP；评论不要求邮箱。Docker 自带代理会覆盖访客地址头，应用端口仅在容器内部使用。

## 部署到自己的服务器

以下 Docker 命令在服务器的 Linux 终端中执行。文档中的 `YOUR_SERVER_IP`、`YOUR_SSH_USER` 需要替换为你自己的服务器 IP 和 SSH 登录用户名。网站和数据均运行在服务器上。服务器需要已安装 Docker Engine 和 Docker Compose 插件，先确认 `docker compose version` 能正常运行。

1. 从 GitHub 下载源码压缩包并解压，把项目源码上传到服务器，例如 `~/juicegao-journal`，进入该目录。上传源码时不要上传本地的 `node_modules`、`.next`、`.env` 或测试数据。

2. 生成一次性初始化链接。此步骤只需要 Docker，不需要在服务器安装 Node.js：

   ```sh
   docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/workspace" -w /workspace node:24-bookworm-slim node scripts/setup-admin.mjs
   ```

   命令会新建 `.env`，并显示形如 `http://localhost:8081/admin#setup=...` 的私人链接。保存这条完整链接，稍后创建管理员账号。已有 `.env` 时脚本会停止，不覆盖原配置。

3. 构建并启动：

   ```sh
   docker compose up -d --build
   docker compose ps
   ```

   首次构建会下载依赖；`app` 显示 healthy、`web` 显示 running 后即可访问。

4. 在腾讯云安全组和服务器防火墙放行 TCP `8080`，保留已有的 SSH 端口规则。页面地址为：

   **<http://YOUR_SERVER_IP:8080>**

   应用的 `3000` 端口只在容器之间使用，不需要放行。

## 首次创建管理员

公网 IP 的 HTTP 地址可以浏览网站；后台提交账号、密码需要 HTTPS，或通过下面的 SSH 隧道访问本机地址。

在自己的电脑上打开终端，执行：

```sh
ssh -N -L 8081:127.0.0.1:8080 YOUR_SSH_USER@YOUR_SERVER_IP
```

将 `YOUR_SSH_USER` 替换成服务器实际使用的登录用户名。如果 SSH 使用了其他端口，加入 `-p 端口号`。保持这个终端开启，然后在电脑浏览器中打开第 2 步生成的 `http://localhost:8081/admin#setup=...` 链接。

创建管理员账号后，初始化链接自动失效。以后仍通过隧道访问 **<http://localhost:8081/admin>**，使用自己的账号和密码登录。接入域名与 HTTPS 后可以直接在域名后台登录，无需隧道。这里的 localhost 只是电脑到服务器的 SSH 转发入口，网站仍部署在服务器上。

## 发布内容

在 `/admin` 中发布、编辑或删除文章与随记，上传图片，并修改网站资料。草稿仅在后台显示，发布后出现在前台。个人资料和正文由你自己填写。

在后台「网站资料」填写个人介绍和学习经历（支持 Markdown），可上传头像和设置建站日期。首页「生活随谈」自动展示最近三条已发布的随记。写作日历按北京时间统计公开文章与随记的首次发布日期，不计草稿，也不从 GitHub 拉取贡献数据；点击日期可查看当天发布数量。运行天数使用填写的建站日期，留空时从第一篇公开记录算起；尚无起始日期或公开记录时显示「—」。

## 更新与日常操作

更新前请先按下文备份数据。上传新的源码后，在服务器项目目录执行：

```sh
docker compose up -d --build
```

此次评论与点赞更新会在容器启动时自动追加数据库表，保留已有文章和账号，无需重新运行管理员初始化。保留原 `.env` 和数据卷；不要修改已应用的旧迁移文件。

首页更新会自动追加学习经历与建站日期字段，已有资料和内容保持不变；更新后可直接在后台填写新字段。

数据库和上传图片保存在名为 `juicegao_data` 的 Docker 数据卷中，重建镜像、重启容器不会清空它们。`.env` 中的 `JOURNAL_DATA_VOLUME` 可指定其他卷名。

```sh
docker compose logs --tail=100 app web
docker compose restart
docker compose down
```

上面依次为查看日志、重启和停止网站。需要再次启动时执行 `docker compose up -d`。保留项目的 `.env` 文件及数据卷。

## 备份

备份包含文章、账号、会话、站点配置和上传图片。先短暂停止写入，备份后恢复运行：

```sh
mkdir -p backups
chmod 700 backups
backup_name="journal-$(date +%Y%m%d-%H%M%S).tar.gz"
docker compose stop app
docker run --rm -v juicegao_data:/data:ro -v "$PWD/backups:/backup" alpine:3.22 tar -czf "/backup/$backup_name" -C /data .
docker compose start app
```

如果设置了自定义数据卷名，将命令中的 `juicegao_data` 替换为实际名称。确认备份命令成功，并将备份文件复制到服务器以外的设备。`.env` 单独妥善备份。

## 恢复备份

恢复到一个新卷，保留原来的卷以便回退。把 `备份文件.tar.gz` 替换为 `backups` 中实际存在的文件名：

```sh
docker compose stop app
restore_volume="juicegao_restore_$(date +%Y%m%d_%H%M%S)"
docker volume create "$restore_volume"
docker run --rm -v "$restore_volume:/data" -v "$PWD/backups:/backup:ro" alpine:3.22 sh -c 'tar -xzf "/backup/备份文件.tar.gz" -C /data && chown -R 1001:1001 /data'
printf '%s\n' "$restore_volume"
```

仅在解压命令成功后，把 `.env` 中 `JOURNAL_DATA_VOLUME` 改为最后显示的新卷名，再执行 `docker compose up -d`。确认内容和登录正常后再自行决定何时清理旧备份与旧卷。

## 使用已有证书启用 Nginx HTTPS

网站默认由 Docker 内的 Nginx 反向代理 Next.js。已有证书时可以继续使用 Nginx，通过 `deploy/compose.nginx-https.yaml` 开启 HTTPS，无需在宿主机另装 Nginx。

1. 在 DNS 中将实际使用域名的 A 记录指向服务器，若配置了 AAAA 记录，也应指向本机可用的 IPv6。安全组与系统防火墙放行 TCP `80` 和 `443`；确认这两个端口未被其他站点占用。
2. 先备份数据，在服务器项目目录拉取最新代码，创建证书目录：

   ```sh
   git pull --ff-only
   mkdir -p deploy/certs
   ```

   将证书平台下载的 Nginx 格式文件（PEM 编码）上传为：

   ```text
   deploy/certs/fullchain.pem  # 站点证书及中间证书链
   deploy/certs/privkey.pem   # 对应的私钥
   ```

   `fullchain.pem` 中站点证书应位于中间证书之前；若平台提供的是 `.crt` 或 `.key` 文件，确认是 PEM 编码后按上述名称保存。`certs/` 已从 Git 与镜像构建中排除，证书只读挂载到 Nginx 容器。
3. 编辑原 `.env`，保留初始化散列和数据卷配置，只设置或更新以下两项。示例域名需要替换成证书覆盖的真实域名：

   ```dotenv
   APP_ORIGIN=https://example.com
   SITE_DOMAIN=example.com
   ```

4. 限制私钥读取权限，构建应用并检查 Nginx 配置。以下操作不会先停止现有网站：

   ```sh
   sudo chmod 600 deploy/certs/privkey.pem
   sudo docker compose --env-file .env -f deploy/compose.nginx-https.yaml build app
   sudo docker compose --env-file .env -f deploy/compose.nginx-https.yaml run --rm --no-deps web nginx -t
   ```

   只有显示配置检查成功后，才继续切换：

   ```sh
   sudo docker compose --env-file .env -f deploy/compose.nginx-https.yaml up -d
   sudo docker compose --env-file .env -f deploy/compose.nginx-https.yaml ps
   ```

   配置沿用原项目名称、服务和数据卷，Compose 会更新现有容器。之后通过 `https://你的域名` 访问网站，`https://你的域名/admin` 登录后台，无需 SSH 隧道。HTTP `80` 会跳转到 HTTPS，原默认 `8080` 入口不再由此配置发布。

5. 后续更新、日志与重启都使用同一配置前缀，例如：

   ```sh
   sudo docker compose --env-file .env -f deploy/compose.nginx-https.yaml logs --tail=100 app web
   ```

   此方案使用你已有的证书，不负责自动续期。续期后替换目录里的两个文件，再检查并重载：

   ```sh
   sudo docker compose --env-file .env -f deploy/compose.nginx-https.yaml exec web nginx -t
   sudo docker compose --env-file .env -f deploy/compose.nginx-https.yaml exec web nginx -s reload
   ```

## 有域名后启用自动 HTTPS（Caddy）

提供了一个独立的 Caddy 部署配置，自动申请和续期域名证书。先将域名的 A 记录指向 `YOUR_SERVER_IP`，确保服务器的 `80`、`443` 端口未被其他服务占用，并在安全组及防火墙放行 TCP `80`、TCP `443`。若已有网站占用这两个端口，请继续使用前面的 IP 与 SSH 隧道方案，不要直接启动本节配置。

在 `.env` 中填写自己的真实域名，例如：

```dotenv
APP_ORIGIN=https://example.com
SITE_DOMAIN=example.com
```

停止默认 HTTP 部署，再启用 HTTPS 配置。数据卷名称保持一致：

```sh
docker compose down
docker compose --env-file .env -f deploy/compose.https.yaml up -d --build
```

此后访问 `https://你的域名` 和 `https://你的域名/admin`。HTTPS 模式的后续更新、查看日志、备份前停止与备份后启动，都使用 `docker compose --env-file .env -f deploy/compose.https.yaml` 作为命令前缀。证书保存在 `juicegao_caddy_data` 卷中。

若一开始就使用域名，可以在生成配置时执行下面的命令，让初始化链接直接使用域名：

```sh
docker run --rm --user "$(id -u):$(id -g)" -v "$PWD:/workspace" -w /workspace node:24-bookworm-slim node scripts/setup-admin.mjs --app-origin https://你的域名
```

生成后再向 `.env` 添加 `SITE_DOMAIN=你的域名`，然后使用 HTTPS 配置启动。

## 组成

- Next.js 服务端渲染，文章支持 Markdown。
- Node.js 内置 SQLite；数据库和图片保存在同一个数据卷中。
- 独立管理员账号、密码散列、服务端会话及一次性初始化凭据。
- 默认 Nginx 入口 `8080`；可选 Caddy 域名 HTTPS 入口。
