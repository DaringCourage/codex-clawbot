import test from "node:test";
import assert from "node:assert/strict";

import { renderEnvTemplate } from "../src/init.mjs";

test("renderEnvTemplate outputs portable defaults", () => {
  const text = renderEnvTemplate({
    workdir: "/Users/demo/workspace",
    runtimeDir: "/Users/demo/.wechat-codex-bridge",
    model: "gpt-5.4-mini"
  });

  assert.match(text, /CODEX_WECHAT_WORKDIR=\/Users\/demo\/workspace/);
  assert.match(text, /CODEX_WECHAT_RUNTIME_DIR=\/Users\/demo\/\.wechat-codex-bridge/);
  assert.match(text, /CODEX_WECHAT_MODEL=gpt-5\.4-mini/);
  assert.match(text, /CODEX_WECHAT_PROGRESS_ACK_MS=1500/);
});
