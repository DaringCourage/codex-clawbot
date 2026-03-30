import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  hasProcessedMessage,
  rememberProcessedMessage,
  saveLastExchange
} from "../src/store.mjs";

test("rememberProcessedMessage keeps recent unique ids", () => {
  const state = {
    processedMessageIds: ["1", "2"],
    sessions: {},
    cursor: ""
  };

  rememberProcessedMessage(state, "2");
  rememberProcessedMessage(state, "3");

  assert.deepEqual(state.processedMessageIds, ["1", "2", "3"]);
  assert.equal(hasProcessedMessage(state, "3"), true);
  assert.equal(hasProcessedMessage(state, "4"), false);
});

test("saveLastExchange writes timestamped debug payload", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "wechat-bridge-store-"));
  const filePath = path.join(dir, "last-exchange.json");

  saveLastExchange(filePath, {
    status: "sent",
    inbound: {
      messageId: "123"
    }
  });

  const saved = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.equal(saved.status, "sent");
  assert.equal(saved.inbound.messageId, "123");
  assert.equal(typeof saved.savedAt, "string");

  fs.rmSync(dir, { recursive: true, force: true });
});
