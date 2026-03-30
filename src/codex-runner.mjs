import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { getErrorMessage, isJsonLine, normalizeMultiline, tail, trimTo } from "./utils.mjs";

const DEFAULT_CHAT_ASSISTANT_RULES = [
  "你现在是一个在微信里和用户对话的聊天助手，同时也是能实际做事的 Codex 助手。",
  "请直接把最终回复写成发给微信用户的纯文本，不要写成给开发者或 API 的说明。",
  "默认使用自然、口语化、友好但专业的中文，除非用户明确要求别的语言。",
  "优先像聊天助手一样先给结论、建议或下一步，再补最必要的说明。",
  "回复尽量简洁，默认控制在 2 到 6 句；除非用户要求详细，否则不要长篇大论。",
  "不要使用 Markdown 表格，不要输出多余的前言、标题或'作为 AI'这类措辞。",
  "遇到代码、仓库、命令、排障问题时，你仍然可以像工程助手一样分析和执行，但最终表达要像在微信聊天。",
  "如果信息不确定，直接用自然语言简短说明不确定点，不要装作确定。"
];

export function buildPrompt({ messageText, senderId, isResume, promptPreamble }) {
  const bridgeRules = [
    ...DEFAULT_CHAT_ASSISTANT_RULES,
    "如果需要查看代码、运行命令或修改文件，请直接在当前工作目录处理。"
  ];

  if (promptPreamble) {
    bridgeRules.push(promptPreamble);
  }

  const intro = isResume ? "这是同一位微信用户的新消息，请延续之前上下文继续处理。" : "这是一个新的微信会话消息。";

  return normalizeMultiline(
    [
      intro,
      ...bridgeRules,
      `sender_id: ${senderId}`,
      "用户消息:",
      messageText
    ].join("\n\n")
  );
}

function buildNewSessionArgs(config, outputFile, prompt) {
  const args = [
    "exec",
    "--json",
    "--skip-git-repo-check",
    "--cd",
    config.workdir,
    "--sandbox",
    config.sandbox,
    "--output-last-message",
    outputFile
  ];

  if (config.model) {
    args.push("--model", config.model);
  }

  args.push(prompt);
  return args;
}

function buildResumeArgs(config, outputFile, threadId, prompt) {
  const args = [
    "exec",
    "resume",
    "--json",
    "--skip-git-repo-check",
    "--output-last-message",
    outputFile
  ];

  if (config.model) {
    args.push("--model", config.model);
  }

  args.push(threadId, prompt);
  return args;
}

export async function runCodexMessage({
  codexConfig,
  messageText,
  senderId,
  threadId
}) {
  const outputFile = path.join(
    os.tmpdir(),
    `wechat-codex-last-${Date.now()}-${Math.random().toString(36).slice(2)}.txt`
  );
  const prompt = buildPrompt({
    messageText,
    senderId,
    isResume: Boolean(threadId),
    promptPreamble: codexConfig.promptPreamble
  });
  const args = threadId
    ? buildResumeArgs(codexConfig, outputFile, threadId, prompt)
    : buildNewSessionArgs(codexConfig, outputFile, prompt);

  return new Promise((resolve, reject) => {
    const child = spawn(codexConfig.executable, args, {
      cwd: codexConfig.workdir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";
    let resolvedThreadId = threadId || "";
    const agentMessages = [];
    let stdoutLineBuffer = "";

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString("utf8");
      stdout += text;
      stdoutLineBuffer += text;

      const lines = stdoutLineBuffer.split("\n");
      stdoutLineBuffer = lines.pop() || "";

      for (const line of lines) {
        if (!isJsonLine(line)) {
          continue;
        }

        try {
          const event = JSON.parse(line);
          if (event.type === "thread.started" && event.thread_id) {
            resolvedThreadId = event.thread_id;
          }
          if (
            event.type === "item.completed" &&
            event.item?.type === "agent_message" &&
            event.item?.text
          ) {
            agentMessages.push(event.item.text);
          }
        } catch {
          // 忽略非完整 JSON 行
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      let reply = "";
      if (fs.existsSync(outputFile)) {
        reply = fs.readFileSync(outputFile, "utf8").trim();
        fs.rmSync(outputFile, { force: true });
      }

      if (!reply && agentMessages.length > 0) {
        reply = agentMessages.at(-1) || "";
      }

      if (!reply && isJsonLine(stdoutLineBuffer)) {
        try {
          const event = JSON.parse(stdoutLineBuffer);
          if (
            event.type === "item.completed" &&
            event.item?.type === "agent_message" &&
            event.item?.text
          ) {
            reply = event.item.text;
          }
        } catch {
          // ignore
        }
      }

      reply = trimTo(normalizeMultiline(reply), codexConfig.maxReplyChars);

      if (code !== 0) {
        reject(
          new Error(
            [
              `Codex 执行失败，退出码 ${code}`,
              stderr ? `stderr:\n${tail(stderr)}` : "",
              stdout ? `stdout:\n${tail(stdout)}` : ""
            ]
              .filter(Boolean)
              .join("\n\n")
          )
        );
        return;
      }

      if (!reply) {
        reject(
          new Error(
            `Codex 没有返回可发送的消息。stderr: ${tail(stderr || getErrorMessage("empty reply"))}`
          )
        );
        return;
      }

      resolve({
        reply,
        threadId: resolvedThreadId,
        stderr
      });
    });
  });
}
