#!/usr/bin/env node
import path from "node:path";

import QRCode from "qrcode";
import qrcodeTerminal from "qrcode-terminal";

import { WechatCodexBridge } from "./bridge.mjs";
import { buildConfig, loadEnv, validateConfig } from "./config.mjs";
import {
  getDaemonStatus,
  installDaemon,
  readDaemonLogs,
  restartDaemon,
  startDaemon,
  stopDaemon,
  uninstallDaemon
} from "./launchd.mjs";
import { loadAccount, loadState, resetState, saveAccount } from "./store.mjs";
import { getErrorMessage, sleep } from "./utils.mjs";
import { WechatApiClient } from "./wechat-api.mjs";

function printHelp() {
  console.log(`
用法:
  npm run setup    微信扫码登录并保存 bot token
  npm run status   查看当前账号与桥接状态
  npm run start    启动桥接器
  npm run reset    清空本地 cursor 和会话映射
  node src/cli.mjs daemon install
  node src/cli.mjs daemon status
  node src/cli.mjs daemon logs

可选:
  node src/cli.mjs start --once   只轮询一次，适合调试
`.trim());
}

async function runSetup(config, client) {
  const qr = await client.fetchQrCode();
  const qrText = qr.qrcode_img_content || qr.qrcode;
  if (!qrText) {
    throw new Error("微信接口没有返回可用二维码内容");
  }

  const qrImagePath = path.join(config.dataDir, "wechat-login-qr.png");
  await QRCode.toFile(qrImagePath, qrText, {
    margin: 2,
    width: 320
  });

  console.log("请用微信 ClawBot 扫描下面的二维码并确认登录:\n");
  qrcodeTerminal.generate(qrText, { small: true });
  console.log(`\n二维码图片已保存到:\n${qrImagePath}\n`);
  console.log(`如果终端二维码显示异常，也可以打开这个文本地址再扫码:\n${qrText}\n`);

  let scanned = false;
  while (true) {
    const status = await client.pollQrStatus(qr.qrcode);
    if (status.status === "scaned" && !scanned) {
      scanned = true;
      console.log("已扫码，请在微信里点确认。");
    }

    if (status.status === "confirmed") {
      const account = {
        botToken: status.bot_token,
        botId: status.ilink_bot_id || "",
        userId: status.ilink_user_id || "",
        baseUrl: status.baseurl || config.wechat.baseUrl
      };
      saveAccount(config.accountFile, account);
      console.log(`登录成功，凭据已保存到 ${config.accountFile}`);
      return;
    }

    if (status.status === "expired") {
      throw new Error("二维码已过期，请重新执行 npm run setup");
    }

    await sleep(1500);
  }
}

function runStatus(config) {
  const account = loadAccount(config.accountFile);
  const state = loadState(config.stateFile);
  const daemon = getDaemonStatus(config);

  console.log(`项目目录: ${config.projectRoot}`);
  console.log(`Codex 工作目录: ${config.codex.workdir}`);
  console.log(`账号文件: ${config.accountFile}`);
  console.log(`状态文件: ${config.stateFile}`);
  console.log(`会话模式: ${config.codex.sessionMode}`);
  console.log(`自动输入态: ${config.codex.autoTyping ? "开启" : "关闭"}`);
  console.log(`账号状态: ${account ? "已登录" : "未登录"}`);
  if (account) {
    console.log(`微信 botId: ${account.botId || "(空)"}`);
    console.log(`微信 userId: ${account.userId || "(空)"}`);
    console.log(`微信 baseUrl: ${account.baseUrl || config.wechat.baseUrl}`);
  }
  console.log(`已缓存 cursor: ${state.cursor ? "是" : "否"}`);
  console.log(`已缓存联系人会话数: ${Object.keys(state.sessions || {}).length}`);
  console.log(`去重消息数: ${(state.processedMessageIds || []).length}`);
  console.log(`守护服务已安装: ${daemon.installed ? "是" : "否"}`);
  console.log(`守护服务已加载: ${daemon.loaded ? "是" : "否"}`);
  if (daemon.pid) {
    console.log(`守护进程 PID: ${daemon.pid}`);
  }
}

async function runStart(config, client, options) {
  const account = loadAccount(config.accountFile);
  if (!account?.botToken) {
    throw new Error("未找到登录凭据，请先执行 npm run setup");
  }

  client.setAccount(account);
  const state = loadState(config.stateFile);
  const bridge = new WechatCodexBridge({
    config,
    account,
    state,
    client
  });

  console.log(`桥接器已启动，当前工作目录: ${config.codex.workdir}`);
  await bridge.runForever({ once: options.once });
}

function runReset(config) {
  resetState(config.stateFile);
  console.log(`已重置状态文件: ${config.stateFile}`);
}

function runDaemonStatus(config) {
  const status = getDaemonStatus(config);
  console.log(`daemon label: ${status.label}`);
  console.log(`plist: ${status.plistPath}`);
  console.log(`wrapper: ${status.wrapperPath}`);
  console.log(`stdout log: ${status.stdoutLogPath}`);
  console.log(`stderr log: ${status.stderrLogPath}`);
  console.log(`已安装: ${status.installed ? "是" : "否"}`);
  console.log(`wrapper 已生成: ${status.wrapperExists ? "是" : "否"}`);
  console.log(`已加载: ${status.loaded ? "是" : "否"}`);
  if (status.pid) {
    console.log(`PID: ${status.pid}`);
  }
}

function runDaemonLogs(config) {
  const logs = readDaemonLogs(config, 60);
  console.log(`== stdout: ${config.runtime.stdoutLogPath} ==`);
  console.log(logs.stdout || "(空)");
  console.log(`\n== stderr: ${config.runtime.stderrLogPath} ==`);
  console.log(logs.stderr || "(空)");
}

async function runDaemonSupervisor(config, client) {
  let lastWaitReason = "";
  let blockedToken = "";

  while (true) {
    const account = loadAccount(config.accountFile);
    if (!account?.botToken) {
      if (lastWaitReason !== "missing-account") {
        console.log("[daemon] 未发现微信登录凭据，等待执行 npm run setup。");
        lastWaitReason = "missing-account";
      }
      blockedToken = "";
      await sleep(config.daemon.waitForAccountMs);
      continue;
    }

    if (blockedToken && account.botToken === blockedToken) {
      if (lastWaitReason !== "waiting-new-account") {
        console.log("[daemon] 旧登录态已失效，等待重新扫码登录。");
        lastWaitReason = "waiting-new-account";
      }
      await sleep(config.daemon.waitForAccountMs);
      continue;
    }

    lastWaitReason = "";
    blockedToken = "";
    client.setAccount(account);
    const state = loadState(config.stateFile);
    const bridge = new WechatCodexBridge({
      config,
      account,
      state,
      client
    });

    console.log("[daemon] 微信凭据已就绪，开始常驻轮询。");
    try {
      await bridge.runForever();
    } catch (error) {
      const message = getErrorMessage(error);
      console.error(`[daemon] 桥接器退出: ${message}`);

      if (message.includes("微信登录态已失效")) {
        blockedToken = account.botToken;
      }
      await sleep(config.codex.errorRetryMs);
    }
  }
}

async function main() {
  loadEnv();
  const config = buildConfig();
  validateConfig(config);

  const client = new WechatApiClient({
    baseUrl: config.wechat.baseUrl,
    channelVersion: config.wechat.channelVersion,
    botType: config.wechat.botType,
    maxChunkChars: config.wechat.maxChunkChars,
    pollTimeoutMs: config.wechat.pollTimeoutMs
  });

  const [, , command = "help", ...args] = process.argv;
  const once = args.includes("--once");

  switch (command) {
    case "setup":
      await runSetup(config, client);
      break;
    case "status":
      runStatus(config);
      break;
    case "start":
      await runStart(config, client, { once });
      break;
    case "reset":
      runReset(config);
      break;
    case "daemon": {
      const action = args[0] || "status";
      switch (action) {
        case "install":
          installDaemon(config);
          console.log(`launchd 已安装并启动: ${config.daemon.label}`);
          break;
        case "start":
          startDaemon(config);
          console.log(`launchd 已启动: ${config.daemon.label}`);
          break;
        case "stop":
          stopDaemon(config);
          console.log(`launchd 已停止: ${config.daemon.label}`);
          break;
        case "restart":
          restartDaemon(config);
          console.log(`launchd 已重启: ${config.daemon.label}`);
          break;
        case "uninstall":
          uninstallDaemon(config);
          console.log(`launchd 已卸载: ${config.daemon.label}`);
          break;
        case "status":
          runDaemonStatus(config);
          break;
        case "logs":
          runDaemonLogs(config);
          break;
        default:
          throw new Error(`未知 daemon 子命令: ${action}`);
      }
      break;
    }
    case "daemon-run":
      await runDaemonSupervisor(config, client);
      break;
    case "help":
    case "--help":
    case "-h":
      printHelp();
      break;
    default:
      console.error(`未知命令: ${command}`);
      printHelp();
      process.exitCode = 1;
      break;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
