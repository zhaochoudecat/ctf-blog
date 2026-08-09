# CTF Notes

线上地址：[ctf-blog-mocha.vercel.app](https://ctf-blog-mocha.vercel.app/)

一个面向 CTF Writeup 的 Astro 博客：保留 Astro Cactus 的 Markdown、MDX、Expressive Code、目录、搜索、标签、RSS、深浅主题与 OG 图片能力，首页采用 AstroPaper 风格的极简文章列表。

## 本地运行

需要 Node.js 24 与 pnpm。

```bash
pnpm install
pnpm dev
```

构建与检查：

```bash
pnpm check
pnpm build
```

## 在 Obsidian 中写文章

将仓库中的 `content` 文件夹作为 Obsidian Vault 打开。文章保存在 `content/posts/<slug>/index.md`，模板位于 `content/templates/CTF WP.md`。

Windows、macOS、GitHub 与 Vercel 的完整工作流见 [同步与发布说明](docs/同步与发布.md)。

## 部署

生产站点托管在 Vercel，`main` 分支是唯一生产源码。项目首次通过 Vercel API 部署；在 [Vercel Git 设置](https://vercel.com/luoyunzong1/ctf-blog/settings/git) 中连接本仓库后，`main` 更新会自动生产部署，功能分支会生成预览部署。

## 上游

本项目 Fork 自 [Astro Cactus](https://github.com/chrismwilliams/astro-theme-cactus)，MIT License。`upstream` Git remote 保留用于按需同步主题更新。
