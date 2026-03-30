# wechat-codex-bridge

[![Node.js 20+](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](./package.json)
[![macOS](https://img.shields.io/badge/platform-macOS-000000?logo=apple&logoColor=white)](./README.md)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

把你自己的微信 ClawBot 接到你自己的本地 Codex 上，让消息留在你自己的电脑里处理。

这个项目适合的方式不是托管一个公共服务，而是让每个人在自己的电脑上跑自己的桥接器。

这意味着：

- 每个人用自己的 `codex`
- 每个人扫自己的微信 ClawBot
- 每个人在自己的 Mac 上运行桥接器
- 不共享服务器，也不共享 token

如果你只是想 5 分钟内跑起来，最短路径是：

```bash
git clone https://github.com/DaringCourage/wechat-codex-bridge.git
cd wechat-codex-bridge
npm install
npm run init
npm run setup
npm run daemon:install
```

## 它做什么

1. 用微信 ClawBot 扫码登录，拿到本机可用的 `bot_token`
2. 长轮询微信官方 iLink 接口收消息
3. 把消息转给本机 `codex exec`
4. 把 Codex 最后一条回复发回微信

当前版本已经支持：

- 文本消息
- 语音转写文本、图片、文件、视频的占位描述
- 按 `sender_id` 复用 Codex 会话上下文
- 纯文本微信回复
- 更像聊天助手的默认提示词
- 慢于阈值时先发“正在处理”提示，降低等待感
- macOS `launchd` 后台常驻

## 前置条件

- macOS
- Node.js 20+
- 本机已经安装并可运行 `codex`
- 你的 `codex` 已经完成登录，并且平时能在终端正常使用
- 你的微信账号能使用 ClawBot

如果你还不确定自己的 Codex 是否已经就绪，最稳的判断方式不是“命令装上了没”，而是“你平时能不能在终端正常跑 Codex”。

## 快速开始

```bash
git clone https://github.com/DaringCourage/wechat-codex-bridge.git
cd wechat-codex-bridge
npm install
npm run init
```

如果你想让 Codex 在特定项目里工作：

```bash
npm run init -- --force --workdir /path/to/your/workspace
```

然后扫码登录：

```bash
npm run setup
```

看状态：

```bash
npm run status
```

前台启动：

```bash
npm run start
```

## 常用命令

```bash
npm run init
npm run setup
npm run status
npm run start
node src/cli.mjs start --once
npm run reset
npm run daemon:install
npm run daemon:status
npm run daemon:logs
npm run daemon:restart
npm run daemon:stop
npm run daemon:uninstall
```

`start --once` 只轮询一次，适合调试。

## 后台常驻

安装后台服务：

```bash
npm run daemon:install
```

它会：

1. 在 `~/.wechat-codex-bridge/bin/run-bridge.sh` 生成包装脚本
2. 在 `~/Library/LaunchAgents/com.codex.wechat-bridge.plist` 写入 LaunchAgent
3. 立即用 `launchctl` 加载并启动服务

服务管理命令：

```bash
npm run daemon:status
npm run daemon:logs
npm run daemon:restart
npm run daemon:stop
npm run daemon:uninstall
```

即使你还没扫码登录，常驻服务也不会反复崩溃，而是等待你执行 `npm run setup` 后自动接管。

## 开源给朋友的正确方式

如果你想让朋友也能用，最好的方式不是把你的桥接器复制给他，而是让他自己本地安装：

1. 他先安装并登录自己的 `codex`
2. 他 `git clone` 这个仓库
3. 他运行 `npm install`
4. 他运行 `npm run init`
5. 他运行 `npm run setup`
6. 他运行 `npm run daemon:install`

这样每个人都只使用自己的：

- `.env`
- `data/account.json`
- `data/state.json`
- 本机 `codex` 会话
- 自己的微信 ClawBot 登录态

不要把你的 `.env`、`data/account.json`、`data/state.json` 或运行日志直接发给别人。

## 配置项

`.env.example` 里最重要的几项：

- `CODEX_WECHAT_WORKDIR`: Codex 真正工作的目录
- `CODEX_WECHAT_EXECUTABLE`: 默认是 `codex`
- `CODEX_WECHAT_MODEL`: 可选，指定更快或更强的模型
- `CODEX_WECHAT_SANDBOX`: 默认 `workspace-write`
- `CODEX_WECHAT_SESSION_MODE`: `per-sender` 或 `single-turn`
- `CODEX_WECHAT_AUTO_TYPING`: 是否在微信里显示“正在输入”
- `CODEX_WECHAT_PROGRESS_ACK_MS`: 超过多少毫秒先发处理中提示，默认 `1500`
- `CODEX_WECHAT_PROGRESS_ACK_TEXT`: 处理中提示文案
- `CODEX_WECHAT_RUNTIME_DIR`: 后台服务运行目录
- `CODEX_WECHAT_LAUNCH_LABEL`: launchd label

## 本地文件

- `data/account.json`: 微信扫码后的 bot 凭据
- `data/state.json`: 轮询 cursor、去重消息列表、联系人到 Codex thread 的映射
- `data/last-exchange.json`: 最近一次收发调试记录
- `~/.wechat-codex-bridge/logs/stdout.log`: launchd stdout 日志
- `~/.wechat-codex-bridge/logs/stderr.log`: launchd stderr 日志

## 已知限制

- 暂未实现媒体文件上传回微信，只回文本
- 当前按单进程串行处理消息，高并发场景不适合
- 主要耗时来自本机 `codex exec` 与模型推理，不是微信接口本身

## 排障

如果 `npm run start` 报“未找到登录凭据”：

```bash
npm run setup
```

如果微信扫码后很快失效，通常是 iLink 登录态过期，重新扫码即可。

如果 Codex 没按你预期读项目代码：

```bash
npm run status
```

确认 `Codex 工作目录` 是你真正想操作的仓库目录。

如果你感觉“最终答案出来慢”，可以从两类方向优化：

- 体感提速：默认已加入“正在处理”提示
- 真正提速：在 `.env` 里指定更快的 `CODEX_WECHAT_MODEL`

## English README

英文说明见 [README.en.md](./README.en.md)。

## License

[MIT](./LICENSE)
