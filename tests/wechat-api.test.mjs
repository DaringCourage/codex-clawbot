import test from "node:test";
import assert from "node:assert/strict";

import { extractInboundText, getMessageId, isInboundUserMessage } from "../src/wechat-api.mjs";

test("extractInboundText merges text and media placeholders", () => {
  const text = extractInboundText({
    item_list: [
      { type: 1, text_item: { text: "你好" } },
      { type: 2, image_item: {} },
      { type: 4, file_item: { file_name: "report.pdf" } }
    ]
  });

  assert.equal(text, "你好\n\n[用户发送了一张图片]\n\n[用户发送了文件: report.pdf]");
});

test("voice message prefers transcript when present", () => {
  const text = extractInboundText({
    item_list: [{ type: 3, voice_item: { text: "帮我看一下这个仓库" } }]
  });

  assert.equal(text, "[用户发送了一段语音，转写如下]\n帮我看一下这个仓库");
});

test("message helpers identify user message and id", () => {
  assert.equal(isInboundUserMessage({ message_type: 1 }), true);
  assert.equal(isInboundUserMessage({ message_type: 2 }), false);
  assert.equal(getMessageId({ message_id: 123 }), "123");
  assert.equal(getMessageId({ msgid: "abc" }), "abc");
});
