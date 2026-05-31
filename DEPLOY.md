# 婴语测试链接发布

## 结论

发给别人用手机测试时，优先发 HTTPS 链接。局域网 `http://192.168.x.x:4173` 只能临时同 Wi-Fi 访问，移动端浏览器通常会拦截麦克风录音。

## 推荐方式：静态托管

这个原型是纯前端 PWA，音频在浏览器本地分析，不需要后端服务。可以部署到 Vercel、Cloudflare Pages、Netlify、GitHub Pages 或任意 HTTPS 静态站点。

部署前先构建静态产物：

```powershell
cd D:\量化\yingyu-app
npm test
npm run build
npm run check:release
npm run package:release
```

构建结果在：

```text
D:\量化\yingyu-app\dist
```

可直接上传的压缩包在：

```text
D:\量化\yingyu-app\release
```

常见配置：

- Build command：`npm run build`
- Output directory：`dist`
- Node version：20+。

仓库里已经有 `vercel.json`、`netlify.toml` 和 GitHub Pages workflow。Vercel / Netlify 通常可以直接识别。Cloudflare Pages 手动填同样的 build command 和 output directory。

如果用网页后台手动上传，优先上传 `release\yingyu-static-YYYY-MM-DD.zip`，或直接拖拽 `dist` 文件夹。

## GitHub Pages

1. 把项目推到 GitHub 仓库。
2. 在仓库 Settings -> Pages 里选择 GitHub Actions。
3. 推送到 `main`，或手动运行 `Deploy static preview` workflow。
4. Actions 会依次运行 `npm test`、`npm run build`、`npm run check:release`，通过后发布 `dist`。

部署后把 HTTPS 地址发给测试者，例如：

```text
https://your-yingyu-preview.example.com
```

## 临时方式：HTTPS 隧道

如果只想当天快速发几个人试，可以用 Cloudflare Tunnel、ngrok 等工具把本机 `http://localhost:4173` 映射成临时 HTTPS 地址。

这种方式适合短测，不适合长期发放，因为链接可能会变，且本机服务必须一直开着。

## 本地同 Wi-Fi 方式

电脑本机：

```powershell
cd D:\量化\yingyu-app
npm start
```

手机和电脑连同一个 Wi-Fi 后，手机打开电脑局域网地址，例如：

```text
http://192.168.71.23:4173
```

这种方式可用于看页面、上传音频；直接录音大概率需要 HTTPS。

## 测试者说明

可以直接告诉测试者：

```text
这是 0-4 月婴儿哭声辅助判断原型。请用手机浏览器打开链接，录 8-15 秒哭声，先看音频质量提示，再看 Top-2 初判和处理步骤。它不是医疗诊断，高警觉提示只用于提醒尽快排查异常。页面里有“隐私与安全说明”，测试前可以先看。
```

隐私说明：

```text
当前版本默认不上传原始音频；录音在浏览器本地分析。除非主动勾选“保留音频”并导出当前宝宝数据，否则不会把音频打包进导出文件。
```

更完整的群发文案见 `BETA_TEST_MESSAGE.md`。
