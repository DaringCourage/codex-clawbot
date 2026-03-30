#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const options = {
    force: false,
    output: "",
    workdir: "",
    runtimeDir: "",
    model: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case "--force":
        options.force = true;
        break;
      case "--output":
        options.output = argv[index + 1] || "";
        index += 1;
        break;
      case "--workdir":
        options.workdir = argv[index + 1] || "";
        index += 1;
        break;
      case "--runtime-dir":
        options.runtimeDir = argv[index + 1] || "";
        index += 1;
        break;
      case "--model":
        options.model = argv[index + 1] || "";
        index += 1;
        break;
      default:
        break;
    }
  }

  return options;
}

export function renderEnvTemplate({
  workdir,
  runtimeDir,
  model = "",
  launchLabel = "com.codex.wechat-bridge"
}) {
  return [
    "# 这个目录决定 Codex 真正在哪个工作区里处理消息",
    `CODEX_WECHAT_WORKDIR=${workdir}`,
    "CODEX_WECHAT_EXECUTABLE=codex",
    `CODEX_WECHAT_MODEL=${model}`,
    "CODEX_WECHAT_SANDBOX=workspace-write",
    "CODEX_WECHAT_SESSION_MODE=per-sender",
    "CODEX_WECHAT_AUTO_TYPING=true",
    "CODEX_WECHAT_PROGRESS_ACK_MS=1500",
    "CODEX_WECHAT_PROGRESS_ACK_TEXT=收到，正在处理，马上回复你。",
    "CODEX_WECHAT_MAX_REPLY_CHARS=6000",
    "CODEX_WECHAT_POLL_TIMEOUT_MS=35000",
    "CODEX_WECHAT_ERROR_RETRY_MS=3000",
    "CODEX_WECHAT_DAEMON_WAIT_MS=30000",
    "CODEX_WECHAT_PROMPT_PREAMBLE=",
    `CODEX_WECHAT_RUNTIME_DIR=${runtimeDir}`,
    `CODEX_WECHAT_LAUNCH_LABEL=${launchLabel}`,
    "WECHAT_BASE_URL=https://ilinkai.weixin.qq.com",
    "WECHAT_CHANNEL_VERSION=1.0.0",
    "WECHAT_BOT_TYPE=3",
    ""
  ].join("\n");
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const outputPath = options.output
    ? path.resolve(options.output)
    : path.join(PROJECT_ROOT, ".env");
  const defaultWorkdir = path.resolve(PROJECT_ROOT, "..");
  const workdir = path.resolve(options.workdir || defaultWorkdir);
  const runtimeDir = path.resolve(
    options.runtimeDir || path.join(os.homedir(), ".wechat-codex-bridge")
  );

  if (fs.existsSync(outputPath) && !options.force) {
    console.log(`已存在配置文件，未覆盖: ${outputPath}`);
    console.log("如果你想重新生成，可执行: npm run init -- --force");
    return;
  }

  const content = renderEnvTemplate({
    workdir,
    runtimeDir,
    model: options.model
  });

  fs.writeFileSync(outputPath, content, "utf8");
  console.log(`已生成配置文件: ${outputPath}`);
  console.log(`Codex 工作目录: ${workdir}`);
  console.log(`运行时目录: ${runtimeDir}`);

  if (!options.output) {
    console.log("\n下一步:");
    console.log("1. 如果需要，先手动编辑 .env 里的工作目录或模型");
    console.log("2. 执行 npm run setup，用你自己的微信 ClawBot 扫码登录");
    console.log("3. 执行 npm run daemon:install，挂成后台服务");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
