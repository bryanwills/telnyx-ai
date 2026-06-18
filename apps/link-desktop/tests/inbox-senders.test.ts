import test from "node:test";
import assert from "node:assert/strict";
import {
  displayInboxThreadSender,
  emailAddressOnly,
  mergeInboxLatestSenderRecord,
  preferredInboxSender,
} from "../src/renderer/inbox-senders.js";

test("mergeInboxLatestSenderRecord keeps a known sender when a later refresh returns a placeholder", () => {
  const initial = mergeInboxLatestSenderRecord({}, "thread-1", "Mock Customer <mock@example.com>");
  const preserved = mergeInboxLatestSenderRecord(initial, "thread-1", "Unknown sender");

  assert.deepEqual(preserved, {
    "thread-1": "Mock Customer <mock@example.com>",
  });
});

test("preferredInboxSender and emailAddressOnly favor a cached sender over a placeholder row value", () => {
  const sender = preferredInboxSender(
    "Mock Customer <mock@example.com>",
    "Unknown sender",
  );

  assert.equal(emailAddressOnly(sender), "mock@example.com");
});

test("displayInboxThreadSender falls back to thread metadata when messages do not include a sender", () => {
  const sender = displayInboxThreadSender({
    from: "Finance Team <finance@example.com>",
    messages: [{ from: "Unknown sender" }],
    participants: ["finance@example.com"],
  });

  assert.equal(sender, "Finance Team <finance@example.com>");
});
