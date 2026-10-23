# Axi-Theme 实现对照

参考仓库：[Axi404/Axi-Theme](https://github.com/Axi404/Axi-Theme)。
本轮核对版本：`c6470e7308bad839489932601e2be08f9b542e70`。

以下效果按该版本的结构、参数和交互方式改写到本项目的 React 组件中。

| 本站功能 | 参考源码 | 对齐的细节 |
| --- | --- | --- |
| 点击粒子 | [BaseLayout.astro](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/src/layouts/BaseLayout.astro) | 10 个环形及 4 个散射粒子、10 种颜色、1.1 秒淡出，深浅色分别配色 |
| 滚动导航 | [Header.astro](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/src/components/basic/Header.astro) | 20px 后收窄、模糊背景与阴影，600px 后下滚隐藏、上滚显示，300ms 过渡 |
| 内容入场 | [global.css](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/public/styles/global.css) | 从下方 32px 淡入、300ms、50–150ms 分段延迟 |
| 文章卡片 | [PostPreview.astro](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/src/components/pages/PostPreview.astro) | 圆角边框与悬停背景色，箭头线条在 300ms 内伸出；封面在桌面占卡片右侧 60% 并向左渐隐，手机改上方 2/3 向下渐隐，悬停/键盘聚焦时不透明度从 0.5 过渡至 0.7 |
| 封面光晕 | [Hero.astro](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/src/components/pages/Hero.astro) | 封面下方模糊副本，滚动到 1/9、2/9、3/9 屏高度时逐级淡化 |
| 提示框 | [Aside.astro](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/src/components/user/Aside.astro) | 8px 左色条、12px 圆角及 note/tip/caution/danger 配色 |
| 折叠 | [Collapse.astro](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/src/components/user/Collapse.astro) | 网格高度 0fr→1fr、300ms 展开、箭头线条形变 |
| 标签页 | [Tabs.astro](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/src/components/user/Tabs.astro) | 底部 2px 选中线、键盘操作、相同 syncKey 的标签同步与记忆 |
| 步骤 | [Steps.astro](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/src/components/user/Steps.astro) | 编号及竖向步骤连接线 |
| 图片组 | [ImageGroup.astro](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/src/components/advanced/ImageGroup.astro) | 按图片宽高比分配宽度，同行等高、保留整张图片及 12px 间距 |
| GitHub 卡片 | [GithubCard.astro](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/src/components/advanced/GithubCard.astro) | 头像、owner/repo、简介、stars、forks、license、language |
| 搜索与分享信息 | [BaseHead.astro](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/src/components/BaseHead.astro) | 页面独立标题/摘要、canonical、Open Graph、Twitter 大图卡片及文章时间 |
| 教育经历 | [首页](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/src/pages/index.astro)、[Section.astro](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/src/components/home/Section.astro)、[Card.astro](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/src/components/user/Card.astro) | 桌面 144px 左标题、右卡片；12px 圆角、24px / 16px 内边距；18px 学校、14px 专业、12px 等宽日期及 4px 间距；填写网址后卡片整体可点击，200ms 边框和背景过渡；768px 以下上下排列 |
| 履历 | [Card.astro](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/src/components/user/Card.astro) | 与教育经历共用卡片组件，机构、职位、日期及 Markdown 说明在卡片内纵向排列；同样的边框、间距和悬停效果 |
| 站点统计卡片 | [Card.astro](https://github.com/Axi404/Axi-Theme/blob/c6470e7308bad839489932601e2be08f9b542e70/src/components/user/Card.astro) | 本站扩展：四项统计分别使用 12px 圆角、1px 边框与主题背景的小卡片；桌面四列、窄屏两列；文章总数卡片可整体点击，沿用 200ms 悬停与键盘聚焦效果 |

适配差异：本站保留 SQL 文章 ID 路由与后台 Markdown 写作，通过受限 directive 使用正文组件。点击粒子设有数量上限，跳过文本输入和后台；所有非必要动效尊重系统“减少动态效果”。标签页和折叠继续提供 ARIA 与键盘操作，GitHub API 失败时保留可访问的静态卡片。

教育经历和履历共用同一卡片组件，采用标题链接覆盖卡片的方式，支持键盘聚焦，补充说明中的 Markdown 链接仍可独立访问，避免嵌套链接。履历按站主要求使用与教育经历相同的卡片布局，日期放在职位下方。资料仍来自现有 SQL 设置，首页与关于页共用组件。

在渐隐封面基础上，本站增加自动提取封面主色：客户端缩小采样图片并忽略透明、近黑和近白区域，将主色混合到当前主题的背景与文字中，联动卡片悬停和键盘聚焦状态；读取失败保留默认配色。这是本站的扩展实现。后台独立的 SQL 自动备份、本机离线备份与版本冲突恢复，也属于本站写作流程的扩展。

## 来源与许可

Axi-Theme 使用 Apache License 2.0；完整原许可见 [axi-theme-LICENSE.txt](licenses/axi-theme-LICENSE.txt)。本轮对粒子、导航、卡片、提示框、折叠、标签页、步骤、图片组及仓库卡片作 React/Next.js 改写。原项目中 Aside、Tabs、Steps 亦注明其实现参考 [Astro Starlight](https://github.com/withastro/starlight)。未使用参考站点的个人资料、头像、文章、分析统计标识或第三方追踪脚本。
