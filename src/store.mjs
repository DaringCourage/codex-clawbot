import fs from "node:fs";

import { formatTimestamp } from "./utils.mjs";

const DEFAULT_STATE = {
  cursor: "",
  processedMessageIds: [],
  sessions: {},
  updatedAt: ""
};

export function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) {
      return fallback;
    }
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function loadAccount(filePath) {
  return readJson(filePath, null);
}

export function saveAccount(filePath, account) {
  writeJson(filePath, {
    ...account,
    savedAt: formatTimestamp()
  });
}

export function saveLastExchange(filePath, exchange) {
  writeJson(filePath, {
    ...exchange,
    savedAt: formatTimestamp()
  });
}

export function loadState(filePath) {
  return {
    ...DEFAULT_STATE,
    ...readJson(filePath, DEFAULT_STATE)
  };
}

export function saveState(filePath, state) {
  writeJson(filePath, {
    ...DEFAULT_STATE,
    ...state,
    updatedAt: formatTimestamp()
  });
}

export function resetState(filePath) {
  saveState(filePath, DEFAULT_STATE);
}

export function rememberProcessedMessage(state, messageId) {
  if (!messageId) {
    return state;
  }
  const ids = [...state.processedMessageIds.filter((item) => item !== messageId), messageId];
  state.processedMessageIds = ids.slice(-200);
  return state;
}

export function hasProcessedMessage(state, messageId) {
  return Boolean(messageId && state.processedMessageIds.includes(messageId));
}
