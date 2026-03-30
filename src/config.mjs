import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

import { parseBoolean, parseInteger, resolveProjectPath } from "./utils.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "..");

export function loadEnv() {
  const envPath = path.join(PROJECT_ROOT, ".env");
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
}

export function buildConfig() {
  const parentWorkspace = path.resolve(PROJECT_ROOT, "..");
  const dataDir = resolveProjectPath(PROJECT_ROOT, process.env.CODEX_WECHAT_DATA_DIR || "data");
  const accountFile = path.join(dataDir, "account.json");
  const stateFile = path.join(dataDir, "state.json");
  const lastExchangeFile = path.join(dataDir, "last-exchange.json");
  const runtimeDir = resolveProjectPath(
    PROJECT_ROOT,
    process.env.CODEX_WECHAT_RUNTIME_DIR || path.join(os.homedir(), ".wechat-codex-bridge")
  );
  const launchAgentLabel = process.env.CODEX_WECHAT_LAUNCH_LABEL || "com.codex.wechat-bridge";
  const launchAgentsDir = path.join(os.homedir(), "Library", "LaunchAgents");

  return {
    projectRoot: PROJECT_ROOT,
    dataDir,
    accountFile,
    stateFile,
    lastExchangeFile,
    runtime: {
      rootDir: runtimeDir,
      binDir: path.join(runtimeDir, "bin"),
      logsDir: path.join(runtimeDir, "logs"),
      wrapperPath: path.join(runtimeDir, "bin", "run-bridge.sh"),
      stdoutLogPath: path.join(runtimeDir, "logs", "stdout.log"),
      stderrLogPath: path.join(runtimeDir, "logs", "stderr.log")
    },
    daemon: {
      label: launchAgentLabel,
      nodePath: process.execPath,
      launchAgentsDir,
      plistPath: path.join(launchAgentsDir, `${launchAgentLabel}.plist`),
      waitForAccountMs: parseInteger(process.env.CODEX_WECHAT_DAEMON_WAIT_MS, 30_000)
    },
    wechat: {
      baseUrl: process.env.WECHAT_BASE_URL || "https://ilinkai.weixin.qq.com",
      channelVersion: process.env.WECHAT_CHANNEL_VERSION || "1.0.0",
      botType: process.env.WECHAT_BOT_TYPE || "3",
      pollTimeoutMs: parseInteger(process.env.CODEX_WECHAT_POLL_TIMEOUT_MS, 35_000),
      maxChunkChars: 2_000
    },
    codex: {
      executable: process.env.CODEX_WECHAT_EXECUTABLE || "codex",
      workdir: resolveProjectPath(PROJECT_ROOT, process.env.CODEX_WECHAT_WORKDIR || parentWorkspace),
      model: process.env.CODEX_WECHAT_MODEL || "",
      sandbox: process.env.CODEX_WECHAT_SANDBOX || "workspace-write",
      sessionMode: process.env.CODEX_WECHAT_SESSION_MODE || "per-sender",
      autoTyping: parseBoolean(process.env.CODEX_WECHAT_AUTO_TYPING, true),
      progressAckMs: parseInteger(process.env.CODEX_WECHAT_PROGRESS_ACK_MS, 1500),
      progressAckText:
        process.env.CODEX_WECHAT_PROGRESS_ACK_TEXT || "收到，正在处理，马上回复你。",
      promptPreamble: process.env.CODEX_WECHAT_PROMPT_PREAMBLE || "",
      maxReplyChars: parseInteger(process.env.CODEX_WECHAT_MAX_REPLY_CHARS, 6_000),
      errorRetryMs: parseInteger(process.env.CODEX_WECHAT_ERROR_RETRY_MS, 3_000)
    }
  };
}

export function validateConfig(config) {
  if (!fs.existsSync(config.codex.workdir)) {
    throw new Error(`CODEX_WECHAT_WORKDIR 不存在: ${config.codex.workdir}`);
  }

  if (!["single-turn", "per-sender"].includes(config.codex.sessionMode)) {
    throw new Error(
      `CODEX_WECHAT_SESSION_MODE 仅支持 "single-turn" 或 "per-sender"，当前为: ${config.codex.sessionMode}`
    );
  }

  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(config.daemon.launchAgentsDir, { recursive: true });

  if (!fs.existsSync(config.daemon.nodePath)) {
    throw new Error(`当前 Node 可执行文件不存在: ${config.daemon.nodePath}`);
  }
}
