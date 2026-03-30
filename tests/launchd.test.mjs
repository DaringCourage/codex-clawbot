import test from "node:test";
import assert from "node:assert/strict";

import { renderLaunchAgentPlist, renderWrapperScript } from "../src/launchd.mjs";

const config = {
  projectRoot: "/Users/demo/project/wechat-codex-bridge",
  daemon: {
    label: "com.codex.wechat-bridge",
    nodePath: "/opt/homebrew/bin/node",
    plistPath: "/Users/demo/Library/LaunchAgents/com.codex.wechat-bridge.plist"
  },
  runtime: {
    rootDir: "/Users/demo/.wechat-codex-bridge",
    wrapperPath: "/Users/demo/.wechat-codex-bridge/bin/run-bridge.sh",
    stdoutLogPath: "/Users/demo/.wechat-codex-bridge/logs/stdout.log",
    stderrLogPath: "/Users/demo/.wechat-codex-bridge/logs/stderr.log"
  }
};

test("renderWrapperScript uses quoted paths and explicit PATH", () => {
  const script = renderWrapperScript(config);
  assert.match(script, /export PATH='/);
  assert.match(script, /daemon-run/);
  assert.match(script, /\/opt\/homebrew\/bin\/node/);
});

test("renderLaunchAgentPlist contains label and log paths", () => {
  const plist = renderLaunchAgentPlist(config);
  assert.match(plist, /com\.codex\.wechat-bridge/);
  assert.match(plist, /stdout\.log/);
  assert.match(plist, /stderr\.log/);
  assert.match(plist, /RunAtLoad/);
  assert.match(plist, /KeepAlive/);
});
