import path from "node:path";

export function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

export function parseInteger(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function chunkText(text, limit) {
  if (!text) {
    return [""];
  }

  if (text.length <= limit) {
    return [text];
  }

  const chunks = [];
  let cursor = 0;
  while (cursor < text.length) {
    chunks.push(text.slice(cursor, cursor + limit));
    cursor += limit;
  }
  return chunks;
}

export function trimTo(text, limit) {
  if (!text || text.length <= limit) {
    return text;
  }
  return `${text.slice(0, Math.max(0, limit - 12))}\n\n[内容已截断]`;
}

export function normalizeMultiline(text) {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function formatTimestamp(date = new Date()) {
  return date.toISOString();
}

export function resolveProjectPath(projectRoot, target) {
  if (!target) {
    return projectRoot;
  }
  return path.isAbsolute(target) ? target : path.resolve(projectRoot, target);
}

export function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function isJsonLine(line) {
  const trimmed = line.trim();
  return trimmed.startsWith("{") && trimmed.endsWith("}");
}

export function tail(text, maxChars = 1200) {
  if (!text || text.length <= maxChars) {
    return text;
  }
  return text.slice(text.length - maxChars);
}

export function tailLines(text, maxLines = 40) {
  if (!text) {
    return "";
  }

  const lines = String(text).split(/\r?\n/);
  return lines.slice(-maxLines).join("\n");
}
