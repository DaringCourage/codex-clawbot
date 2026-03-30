import test from "node:test";
import assert from "node:assert/strict";

import { buildPrompt } from "../src/codex-runner.mjs";

test("buildPrompt includes chat assistant style defaults", () => {
  const prompt = buildPrompt({
    messageText: "帮我看看这个报错",
    senderId: "demo@im.wechat",
    isResume: false,
    promptPreamble: ""
  });

  assert.match(prompt, /微信里和用户对话的聊天助手/);
  assert.match(prompt, /自然、口语化、友好但专业的中文/);
  assert.match(prompt, /回复尽量简洁/);
  assert.match(prompt, /sender_id: demo@im\.wechat/);
});

test("buildPrompt appends custom preamble", () => {
  const prompt = buildPrompt({
    messageText: "你好",
    senderId: "demo@im.wechat",
    isResume: true,
    promptPreamble: "遇到产品问题时先给操作步骤。"
  });

  assert.match(prompt, /同一位微信用户的新消息/);
  assert.match(prompt, /遇到产品问题时先给操作步骤/);
});
