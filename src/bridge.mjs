import { runCodexMessage } from "./codex-runner.mjs";
import {
  extractInboundText,
  getMessageId,
  isInboundUserMessage
} from "./wechat-api.mjs";
import {
  hasProcessedMessage,
  rememberProcessedMessage,
  saveLastExchange,
  saveState
} from "./store.mjs";
import { getErrorMessage, sleep } from "./utils.mjs";

function tokenHint(value) {
  const text = String(value || "");
  if (!text) {
    return "";
  }
  if (text.length <= 16) {
    return text;
  }
  return `${text.slice(0, 8)}...${text.slice(-8)}`;
}

function previewText(text, limit = 120) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= limit) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, limit - 3))}...`;
}

export class WechatCodexBridge {
  constructor({ config, account, state, client }) {
    this.config = config;
    this.account = account;
    this.state = state;
    this.client = client;
  }

  async runForever({ once = false } = {}) {
    while (true) {
      try {
        await this.runPollCycle();
      } catch (error) {
        const message = getErrorMessage(error);
        if (this.isAuthExpiredError(error)) {
          throw new Error(`微信登录态已失效，请重新执行 npm run setup\n\n原始错误: ${message}`);
        }

        console.error(`[bridge] 轮询失败: ${message}`);
        await sleep(this.config.codex.errorRetryMs);
      }

      if (once) {
        break;
      }
    }
  }

  async runPollCycle() {
    const response = await this.client.getUpdates(this.state.cursor);
    if (response.get_updates_buf) {
      this.state.cursor = response.get_updates_buf;
      saveState(this.config.stateFile, this.state);
    }

    const messages = response.msgs || [];
    if (messages.length === 0) {
      return;
    }

    for (const message of messages) {
      await this.handleMessage(message);
      saveState(this.config.stateFile, this.state);
    }
  }

  async handleMessage(message) {
    if (!isInboundUserMessage(message)) {
      return;
    }

    const messageId = getMessageId(message);
    if (hasProcessedMessage(this.state, messageId)) {
      return;
    }

    const senderId = message.from_user_id;
    const contextToken = message.context_token || "";
    const userText = extractInboundText(message);
    if (!senderId || !contextToken || !userText) {
      rememberProcessedMessage(this.state, messageId);
      return;
    }

    console.log(`[bridge] 收到 ${senderId} 的消息: ${userText.replace(/\n/g, " ")}`);

    const existingThreadId =
      this.config.codex.sessionMode === "per-sender" ? this.state.sessions[senderId] : "";
    const typingPromise = this.config.codex.autoTyping
      ? this.client.startTyping(senderId, contextToken)
      : Promise.resolve(null);
    const startedAt = Date.now();
    let progressAckSent = false;
    let progressAckTimer = null;
    let resolveProgressAck = () => {};
    let progressAckPromise = Promise.resolve();

    if (this.config.codex.progressAckMs > 0 && this.config.codex.progressAckText) {
      progressAckPromise = new Promise((resolve) => {
        resolveProgressAck = resolve;
        progressAckTimer = setTimeout(() => {
          progressAckTimer = null;
          void (async () => {
            try {
              await this.client.sendMessage(
                senderId,
                contextToken,
                this.config.codex.progressAckText
              );
              progressAckSent = true;
              console.log(`[bridge] 已发送处理中提示给 ${senderId}`);
            } catch (error) {
              console.error(`[bridge] 发送处理中提示失败: ${getErrorMessage(error)}`);
            } finally {
              resolve();
            }
          })();
        }, this.config.codex.progressAckMs);
      });
    }

    try {
      const result = await runCodexMessage({
        codexConfig: this.config.codex,
        messageText: userText,
        senderId,
        threadId: existingThreadId
      });

      if (progressAckTimer) {
        clearTimeout(progressAckTimer);
        progressAckTimer = null;
        resolveProgressAck();
      }
      await progressAckPromise;

      const sendResponse = await this.client.sendMessage(senderId, contextToken, result.reply);
      const totalMs = Date.now() - startedAt;

      if (this.config.codex.sessionMode === "per-sender" && result.threadId) {
        this.state.sessions[senderId] = result.threadId;
      }

      saveLastExchange(this.config.lastExchangeFile, {
        status: "sent",
        inbound: {
          messageId,
          senderId,
          contextTokenHint: tokenHint(contextToken),
          text: userText
        },
        outbound: {
          reply: result.reply,
          replyPreview: previewText(result.reply),
          replyChars: result.reply.length,
          threadId: result.threadId || existingThreadId || ""
        },
        timings: {
          totalMs,
          progressAckSent
        },
        delivery: {
          sendResponse
        }
      });

      console.log(
        `[bridge] 已回复 ${senderId} (${totalMs}ms): ${previewText(result.reply, 80)}`
      );
    } catch (error) {
      if (progressAckTimer) {
        clearTimeout(progressAckTimer);
        progressAckTimer = null;
        resolveProgressAck();
      }
      await progressAckPromise;

      const errorMessage = `桥接器执行失败:\n${getErrorMessage(error)}`;
      const sendResponse = await this.client.sendMessage(senderId, contextToken, errorMessage);
      const totalMs = Date.now() - startedAt;
      saveLastExchange(this.config.lastExchangeFile, {
        status: "error-replied",
        inbound: {
          messageId,
          senderId,
          contextTokenHint: tokenHint(contextToken),
          text: userText
        },
        outbound: {
          reply: errorMessage,
          replyPreview: previewText(errorMessage),
          replyChars: errorMessage.length,
          threadId: existingThreadId || ""
        },
        timings: {
          totalMs,
          progressAckSent
        },
        delivery: {
          sendResponse
        },
        bridgeError: getErrorMessage(error)
      });
      console.error(`[bridge] 回复 ${senderId} 失败: ${getErrorMessage(error)}`);
    } finally {
      const typingTicket = await typingPromise;
      await this.client.stopTyping(senderId, typingTicket);
      rememberProcessedMessage(this.state, messageId);
    }
  }

  isAuthExpiredError(error) {
    const message = getErrorMessage(error).toLowerCase();
    return error?.code === -14 || message.includes("expired") || message.includes("ret=-14");
  }
}
