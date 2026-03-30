# Open Source Checklist

在把这个仓库推到 GitHub 之前，建议先过一遍下面这份清单。

## 必做

- 确认 `.env` 没有提交
- 确认 `data/account.json` 没有提交
- 确认 `data/state.json` 没有提交
- 确认 `data/last-exchange.json` 没有提交
- 确认 `data/wechat-login-qr.png` 没有提交
- 确认 README 里的仓库地址、截图和示例命令已改成通用内容
- 跑一遍 `npm test`

## 推荐

- 用一个全新目录执行一次 `npm install`
- 执行一次 `npm run init`
- 执行一次 `npm run setup`
- 执行一次 `npm run daemon:install`
- 确认朋友照着 README 可以独立完成接入

## 说明

这个项目最适合的开源方式不是“托管别人的机器人”，而是“每个人在自己的电脑上跑自己的桥接器”。这样最容易安装，也最不容易泄露凭据。
