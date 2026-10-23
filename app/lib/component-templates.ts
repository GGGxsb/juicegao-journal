export const componentTemplates = [
  { label:'提示框', source:':::note{title="小提示"}\n在这里写提示内容，支持 **Markdown**。\n:::' },
  { label:'折叠内容', source:':::details{title="展开查看详情"}\n在这里写详细说明。\n:::' },
  { label:'标签页', source:'::::tabs{title="操作系统"}\n:::tab{title="Windows"}\nWindows 的说明。\n:::\n:::tab{title="macOS"}\nmacOS 的说明。\n:::\n::::' },
  { label:'步骤说明', source:'::::steps\n:::step{title="准备"}\n准备工作。\n:::\n:::step{title="开始"}\n具体操作。\n:::\n::::' },
  { label:'图片组', source:':::gallery{title="一些瞬间"}\n![图片说明](/media/替换为已上传图片的文件名.png)\n\n![另一张图片](/media/替换为另一张图片的文件名.png)\n:::' },
  { label:'GitHub 卡片', source:'::github{repo="Axi404/Axi-Theme" description="这里可以填写项目介绍。"}' },
];
