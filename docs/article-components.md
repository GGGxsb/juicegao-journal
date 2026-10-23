# 正文组件

后台编辑栏的「插入组件」可加入以下模板，前台与后台预览使用相同语法。
普通 Markdown 仍然照常使用，无需重新保存已有文章。

## 提示框

`note`、`info`、`tip`、`warning`、`danger` 分别提供不同语气的提示。`caution` 与 `warning` 等效。
提示框采用 8px 色条、12px 圆角和轻背景；框内链接悬停会反转前景与背景色。

```markdown
:::tip{title="小建议"}
先写下一个小想法，再慢慢补充 **细节**。
:::
```

## 折叠内容

```markdown
:::details{title="展开查看推导"}
这里放详细说明，也可以加入代码和公式。
:::
```

添加 `open="true"` 可默认展开。折叠内部标题不加入外部文章目录。
`collapse` 是 `details` 的别名；展开与收起使用 300ms 过渡，箭头同步形变，展开时切换为柔和背景。

## 标签页

外层比内层多用一个冒号，以明确嵌套边界。

```markdown
::::tabs{title="操作系统" syncKey="os"}
:::tab{title="Windows"}
Windows 的操作说明。
:::
:::tab{title="macOS"}
macOS 的操作说明。
:::
::::
```

支持方向键、Home 和 End 切换；各标签页内的标题不加入外部目录。
相同 `syncKey` 的标签组按标签文字同步，例如选择一组中的「macOS」，其他具有「macOS」的同组标签页也会切换。
选择会保存在当前浏览器，刷新或打开另一篇文章时恢复。省略 `syncKey` 则各组独立；浏览器不允许本地存储时仍可正常切换。
标签栏使用 2px 底线和选中强调色，不额外包裹卡片边框。

## 步骤

```markdown
::::steps{title="准备发布"}
:::step{title="整理内容"}
补充背景和例子。
:::
:::step{title="检查并发布"}
预览格式，填写摘要和标签。
:::
::::
```

## 图片组

先通过后台上传图片，再把正文中的图片链接放进图片组。不同图片之间保留空行。
图片组中的图片仍可点击放大。图片按各自宽高比分配宽度、等高排列，不再统一裁切；载入后从图片本身读取宽高，无需服务端下载外站图片。

```markdown
:::gallery{title="周末的一些瞬间" gap="12"}
![图片说明](/media/替换成实际图片文件名.png)

![另一张图片](/media/替换成另一张图片文件名.png)
:::
```

`image-group` 是 `gallery` 的别名。`gap` 指定间距（0–48px，默认 12px）；可用 `aspectRatio="1.5"` 为整组指定统一宽高比（0.2–5），省略时按图片自身比例排列。

## GitHub 仓库卡片

```markdown
::github{repo="Axi404/Axi-Theme" description="这里可以写项目简介。"}
```

卡片进入可视范围后尝试读取公开的仓库描述、语言、Star、Fork、许可证与头像；请求失败时仍保留可点击的链接及手写简介。仓库资料通过固定的 GitHub API 地址读取，文章无需提供令牌。也可填写完整的 `https://github.com/owner/repository` 地址。

这些组件不会执行 MDX、HTML 或 JavaScript。组件名称和属性按固定名单处理，正文和属性中的文字会作为普通文本显示。

## 参考源码与许可

视觉与交互参考 [Axi-Theme](https://github.com/Axi404/Axi-Theme)，核对版本为 `c6470e7308bad839489932601e2be08f9b542e70`。
对应源码：[Aside](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/src/components/user/Aside.astro)、[Collapse](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/src/components/user/Collapse.astro)、[Tabs](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/src/components/user/Tabs.astro)、[Steps](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/src/components/user/Steps.astro)、[ImageGroup](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/src/components/advanced/ImageGroup.astro)、[GithubCard](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/src/components/advanced/GithubCard.astro)。

参考仓库采用 [Apache License 2.0](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/LICENSE)，许可副本保存在 [docs/licenses/axi-theme-LICENSE.txt](licenses/axi-theme-LICENSE.txt)。上述 Aside、Tabs、Steps 的原文件亦注明了 Astro Starlight 来源。本项目将这些组件改为 React 与安全的 Markdown 指令实现，保留键盘操作、ARIA、降低动态效果偏好与请求失败回退；没有执行文章中的 MDX 或注入源 HTML。
