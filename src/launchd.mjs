import fs from "node:fs";
import { spawnSync } from "node:child_process";

import { tailLines } from "./utils.mjs";

const DEFAULT_PATH =
  "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:/Applications/Codex.app/Contents/Resources";

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

function getLaunchctlDomain() {
  return `gui/${process.getuid()}`;
}

function getServiceTarget(label) {
  return `${getLaunchctlDomain()}/${label}`;
}

function runLaunchctl(args, options = {}) {
  return spawnSync("launchctl", args, {
    encoding: "utf8",
    ...options
  });
}

export function renderWrapperScript(config) {
  return `#!/bin/zsh
export PATH=${shellQuote(DEFAULT_PATH)}
cd ${shellQuote(config.projectRoot)}
exec ${shellQuote(config.daemon.nodePath)} ${shellQuote(`${config.projectRoot}/src/cli.mjs`)} daemon-run
`;
}

export function renderLaunchAgentPlist(config) {
  const { label } = config.daemon;
  const { wrapperPath, stdoutLogPath, stderrLogPath } = config.runtime;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${xmlEscape(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEscape(wrapperPath)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>ProcessType</key>
  <string>Background</string>
  <key>StandardOutPath</key>
  <string>${xmlEscape(stdoutLogPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xmlEscape(stderrLogPath)}</string>
  <key>WorkingDirectory</key>
  <string>${xmlEscape(config.runtime.rootDir)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>${xmlEscape(DEFAULT_PATH)}</string>
  </dict>
</dict>
</plist>
`;
}

export function ensureDaemonFiles(config) {
  fs.mkdirSync(config.runtime.rootDir, { recursive: true });
  fs.mkdirSync(config.runtime.binDir, { recursive: true });
  fs.mkdirSync(config.runtime.logsDir, { recursive: true });
  fs.mkdirSync(config.daemon.launchAgentsDir, { recursive: true });

  fs.writeFileSync(config.runtime.wrapperPath, renderWrapperScript(config), {
    encoding: "utf8",
    mode: 0o755
  });
  fs.chmodSync(config.runtime.wrapperPath, 0o755);
  fs.writeFileSync(config.daemon.plistPath, renderLaunchAgentPlist(config), "utf8");

  if (!fs.existsSync(config.runtime.stdoutLogPath)) {
    fs.writeFileSync(config.runtime.stdoutLogPath, "", "utf8");
  }
  if (!fs.existsSync(config.runtime.stderrLogPath)) {
    fs.writeFileSync(config.runtime.stderrLogPath, "", "utf8");
  }
}

export function isDaemonLoaded(config) {
  const result = runLaunchctl(["print", getServiceTarget(config.daemon.label)]);
  return result.status === 0;
}

export function installDaemon(config) {
  ensureDaemonFiles(config);
  bootoutDaemon(config, { ignoreFailure: true });

  const bootstrap = runLaunchctl(["bootstrap", getLaunchctlDomain(), config.daemon.plistPath]);
  if (bootstrap.status !== 0) {
    throw new Error(bootstrap.stderr || bootstrap.stdout || "launchctl bootstrap 失败");
  }

  runLaunchctl(["enable", getServiceTarget(config.daemon.label)]);
  const kickstart = runLaunchctl(["kickstart", "-k", getServiceTarget(config.daemon.label)]);
  if (kickstart.status !== 0) {
    throw new Error(kickstart.stderr || kickstart.stdout || "launchctl kickstart 失败");
  }
}

export function startDaemon(config) {
  ensureDaemonFiles(config);
  if (!isDaemonLoaded(config)) {
    const bootstrap = runLaunchctl(["bootstrap", getLaunchctlDomain(), config.daemon.plistPath]);
    if (bootstrap.status !== 0) {
      throw new Error(bootstrap.stderr || bootstrap.stdout || "launchctl bootstrap 失败");
    }
  }

  const kickstart = runLaunchctl(["kickstart", "-k", getServiceTarget(config.daemon.label)]);
  if (kickstart.status !== 0) {
    throw new Error(kickstart.stderr || kickstart.stdout || "launchctl kickstart 失败");
  }
}

export function bootoutDaemon(config, { ignoreFailure = false } = {}) {
  const result = runLaunchctl(["bootout", getLaunchctlDomain(), config.daemon.plistPath]);
  if (result.status !== 0 && !ignoreFailure) {
    throw new Error(result.stderr || result.stdout || "launchctl bootout 失败");
  }
}

export function stopDaemon(config) {
  bootoutDaemon(config, { ignoreFailure: false });
}

export function restartDaemon(config) {
  bootoutDaemon(config, { ignoreFailure: true });
  startDaemon(config);
}

export function uninstallDaemon(config) {
  bootoutDaemon(config, { ignoreFailure: true });
  fs.rmSync(config.daemon.plistPath, { force: true });
  fs.rmSync(config.runtime.wrapperPath, { force: true });
}

export function getDaemonStatus(config) {
  const installed = fs.existsSync(config.daemon.plistPath);
  const wrapperExists = fs.existsSync(config.runtime.wrapperPath);
  const loaded = installed ? isDaemonLoaded(config) : false;

  let launchctlOutput = "";
  let pid = "";
  if (loaded) {
    const result = runLaunchctl(["print", getServiceTarget(config.daemon.label)]);
    launchctlOutput = `${result.stdout || ""}${result.stderr || ""}`.trim();
    const match = launchctlOutput.match(/\bpid = (\d+)/);
    pid = match?.[1] || "";
  }

  return {
    installed,
    wrapperExists,
    loaded,
    pid,
    label: config.daemon.label,
    plistPath: config.daemon.plistPath,
    wrapperPath: config.runtime.wrapperPath,
    stdoutLogPath: config.runtime.stdoutLogPath,
    stderrLogPath: config.runtime.stderrLogPath,
    launchctlOutput
  };
}

export function readDaemonLogs(config, maxLines = 40) {
  const stdout = fs.existsSync(config.runtime.stdoutLogPath)
    ? fs.readFileSync(config.runtime.stdoutLogPath, "utf8")
    : "";
  const stderr = fs.existsSync(config.runtime.stderrLogPath)
    ? fs.readFileSync(config.runtime.stderrLogPath, "utf8")
    : "";

  return {
    stdout: tailLines(stdout, maxLines),
    stderr: tailLines(stderr, maxLines)
  };
}
