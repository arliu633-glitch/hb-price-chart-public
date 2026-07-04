# Vercel 开放发布部署

这个目录可以直接部署到 Vercel。部署后，所有访问者都可以在公开网页上传 `index.pdf`，后端会用 Vercel 环境变量里的 GitHub token 更新 `chart.svg`，刷新后不会丢。

## 需要的 GitHub token

创建一个 fine-grained personal access token：

- Repository access: `arliu633-glitch/hb-price-chart-public`
- Permissions: `Contents: Read and write`

## Vercel 设置

1. 在 Vercel 新建项目，导入仓库 `hb-price-chart-public`。
2. Framework Preset 选 `Other`。
3. Root Directory 保持仓库根目录。
4. 添加 Environment Variable：
   - Name: `GITHUB_TOKEN`
   - Value: 上面的 GitHub token
5. Deploy。

部署完成后，把 Vercel 提供的公开网址作为新的访问地址。
