import test from "node:test";
import assert from "node:assert/strict";

import { isLongPollTimeoutError } from "../src/wechat-api.mjs";

test("isLongPollTimeoutError matches common timeout forms", () => {
  assert.equal(
    isLongPollTimeoutError(new Error("The operation was aborted due to timeout")),
    true
  );

  const abortError = new Error("aborted");
  abortError.name = "AbortError";
  assert.equal(isLongPollTimeoutError(abortError), true);

  const timeoutError = new Error("timed out");
  timeoutError.name = "TimeoutError";
  assert.equal(isLongPollTimeoutError(timeoutError), true);
});

test("isLongPollTimeoutError ignores non-timeout errors", () => {
  assert.equal(isLongPollTimeoutError(new Error("401 unauthorized")), false);
  assert.equal(isLongPollTimeoutError(null), false);
});
