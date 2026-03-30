import crypto from "node:crypto";

import { chunkText, normalizeMultiline } from "./utils.mjs";

const MESSAGE_TYPE_USER = 1;
const ITEM_TYPE_TEXT = 1;
const ITEM_TYPE_IMAGE = 2;
const ITEM_TYPE_VOICE = 3;
const ITEM_TYPE_FILE = 4;
const ITEM_TYPE_VIDEO = 5;

function stripTrailingSlashes(url) {
  let end = url.length;
  while (end > 0 && url[end - 1] === "/") {
    end -= 1;
  }
  return url.slice(0, end);
}

function randomUin() {
  const uint32 = crypto.randomBytes(4).readUInt32BE(0);
  return Buffer.from(String(uint32), "utf8").toString("base64");
}

function buildAuthHeaders(botToken) {
  return {
    "Authorization": `Bearer ${botToken}`,
    "AuthorizationType": "ilink_bot_token",
    "Content-Type": "application/json",
    "X-WECHAT-UIN": randomUin(),
    "iLink-App-Id": "bot",
    "iLink-App-ClientVersion": "1"
  };
}

export function isLongPollTimeoutError(error) {
  if (!error) {
    return false;
  }

  const name = String(error.name || "").toLowerCase();
  const message = String(error.message || "").toLowerCase();

  return (
    name === "aborterror" ||
    name === "timeouterror" ||
    message.includes("aborted due to timeout") ||
    message.includes("operation was aborted") ||
    message.includes("timeout")
  );
}

async function parseJsonResponse(response, label) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message = payload.errmsg || `${label} 失败，HTTP ${response.status}`;
    throw new Error(message);
  }

  if (typeof payload.ret === "number" && payload.ret !== 0) {
    const error = new Error(payload.errmsg || `${label} 失败，ret=${payload.ret}`);
    error.code = payload.errcode ?? payload.ret;
    throw error;
  }

  return payload;
}

export class WechatApiClient {
  constructor(options) {
    this.baseUrl = stripTrailingSlashes(options.baseUrl);
    this.channelVersion = options.channelVersion;
    this.botType = options.botType;
    this.botToken = options.botToken || "";
    this.maxChunkChars = options.maxChunkChars || 2000;
    this.pollTimeoutMs = options.pollTimeoutMs || 35_000;
  }

  setAccount(account) {
    this.botToken = account?.botToken || "";
    if (account?.baseUrl) {
      this.baseUrl = stripTrailingSlashes(account.baseUrl);
    }
  }

  async fetchQrCode() {
    const response = await fetch(
      `${this.baseUrl}/ilink/bot/get_bot_qrcode?bot_type=${encodeURIComponent(this.botType)}`,
      {
        headers: {
          "iLink-App-ClientVersion": "1"
        },
        signal: AbortSignal.timeout(15_000)
      }
    );

    return parseJsonResponse(response, "获取二维码");
  }

  async pollQrStatus(qrcode) {
    const response = await fetch(
      `${this.baseUrl}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`,
      {
        headers: {
          "iLink-App-ClientVersion": "1"
        },
        signal: AbortSignal.timeout(40_000)
      }
    );

    return parseJsonResponse(response, "查询二维码状态");
  }

  async getUpdates(cursor = "") {
    try {
      const response = await fetch(`${this.baseUrl}/ilink/bot/getupdates`, {
        method: "POST",
        headers: buildAuthHeaders(this.botToken),
        body: JSON.stringify({
          base_info: {
            channel_version: this.channelVersion
          },
          get_updates_buf: cursor
        }),
        signal: AbortSignal.timeout(this.pollTimeoutMs + 5_000)
      });

      return parseJsonResponse(response, "拉取消息");
    } catch (error) {
      if (isLongPollTimeoutError(error)) {
        return {
          ret: 0,
          msgs: [],
          get_updates_buf: cursor,
          longpolling_timeout_ms: this.pollTimeoutMs
        };
      }
      throw error;
    }
  }

  async sendMessage(toUserId, contextToken, text) {
    const chunks = chunkText(text, this.maxChunkChars);
    let lastResponse = { ret: 0 };

    for (const chunk of chunks) {
      const response = await fetch(`${this.baseUrl}/ilink/bot/sendmessage`, {
        method: "POST",
        headers: buildAuthHeaders(this.botToken),
        body: JSON.stringify({
          base_info: {
            channel_version: this.channelVersion
          },
          msg: {
            from_user_id: "",
            to_user_id: toUserId,
            client_id: crypto.randomUUID(),
            message_type: 2,
            message_state: 2,
            context_token: contextToken,
            item_list: [
              {
                type: ITEM_TYPE_TEXT,
                text_item: {
                  text: chunk
                }
              }
            ]
          }
        }),
        signal: AbortSignal.timeout(20_000)
      });

      lastResponse = await parseJsonResponse(response, "发送消息");
    }

    return lastResponse;
  }

  async getConfig(userId, contextToken) {
    const response = await fetch(`${this.baseUrl}/ilink/bot/getconfig`, {
      method: "POST",
      headers: buildAuthHeaders(this.botToken),
      body: JSON.stringify({
        base_info: {
          channel_version: this.channelVersion
        },
        ilink_user_id: userId,
        context_token: contextToken
      }),
      signal: AbortSignal.timeout(15_000)
    });

    return parseJsonResponse(response, "读取配置");
  }

  async sendTyping(userId, typingTicket, status = 1) {
    const response = await fetch(`${this.baseUrl}/ilink/bot/sendtyping`, {
      method: "POST",
      headers: buildAuthHeaders(this.botToken),
      body: JSON.stringify({
        base_info: {
          channel_version: this.channelVersion
        },
        ilink_user_id: userId,
        typing_ticket: typingTicket,
        status
      }),
      signal: AbortSignal.timeout(15_000)
    });

    return parseJsonResponse(response, "发送输入态");
  }

  async startTyping(userId, contextToken) {
    try {
      const config = await this.getConfig(userId, contextToken);
      if (!config.typing_ticket) {
        return null;
      }
      await this.sendTyping(userId, config.typing_ticket, 1);
      return config.typing_ticket;
    } catch {
      return null;
    }
  }

  async stopTyping(userId, typingTicket) {
    if (!typingTicket) {
      return;
    }

    try {
      await this.sendTyping(userId, typingTicket, 2);
    } catch {
      // 输入态停止失败不影响主流程
    }
  }
}

export function getMessageId(message) {
  return String(message.message_id ?? message.msgid ?? "");
}

export function isInboundUserMessage(message) {
  return Number(message.message_type) === MESSAGE_TYPE_USER;
}

export function extractInboundText(message) {
  const parts = [];

  for (const item of message.item_list || []) {
    switch (Number(item.type)) {
      case ITEM_TYPE_TEXT:
        if (item.text_item?.text) {
          parts.push(item.text_item.text);
        }
        break;
      case ITEM_TYPE_IMAGE:
        parts.push("[用户发送了一张图片]");
        break;
      case ITEM_TYPE_VOICE:
        if (item.voice_item?.text) {
          parts.push(`[用户发送了一段语音，转写如下]\n${item.voice_item.text}`);
        } else {
          parts.push("[用户发送了一段语音]");
        }
        break;
      case ITEM_TYPE_FILE:
        if (item.file_item?.file_name) {
          parts.push(`[用户发送了文件: ${item.file_item.file_name}]`);
        } else {
          parts.push("[用户发送了一个文件]");
        }
        break;
      case ITEM_TYPE_VIDEO:
        parts.push("[用户发送了一个视频]");
        break;
      default:
        parts.push("[用户发送了暂未解析的消息类型]");
        break;
    }
  }

  return normalizeMultiline(parts.join("\n\n"));
}
