#!/usr/bin/env node

import { LinkRuntime } from "./runtime.js";
import { formatSharedChannelResponse } from "./shared-channel.js";
import { createLinkAppPublisherServer, listenLinkAppPublisherServer } from "./app-publisher.js";

const runtime = new LinkRuntime();
const [command = "chat", ...args] = process.argv.slice(2);

try {
  if (command === "chat") {
    const prompt = args.join(" ") || "Help me understand what Telnyx Link can do in this MVP.";
    const result = await runtime.chat({ prompt, actorId: "dev_user" });
    console.log(result.response ?? result.finalOutput);
  } else if (command === "skill") {
    const skillName = args.join(" ") || "Account Briefing";
    const result = await runtime.runSkill(skillName, {
      accountId: "acct_mock_001",
      query: skillName,
    });
    console.log(JSON.stringify(result, null, 2));
  } else if (command === "shared-channel") {
    const result = runtime.runSharedChannel({
      actorId: "dev_user",
      channelType: "shared_customer",
      customerIdentifier: "Acme Messaging Co.",
      userPrompt: "Draft a customer-safe response about the SMS delivery escalation.",
      requestedAction: "post update to shared customer Slack channel",
      threadContext:
        "Internal note: carrier route id R-42 showed latency. Raw log trace id abc123. Customer impact appears limited to delayed SMS delivery for a subset of US traffic.",
    });
    console.log(formatSharedChannelResponse(result));
  } else if (command === "app-publisher") {
    const port = Number(args.find((arg) => /^\d+$/.test(arg)) ?? process.env.PORT ?? 0);
    const requireAuth = !args.includes("--dev-no-auth");
    const server = createLinkAppPublisherServer(undefined, { requireAuth });
    const listener = await listenLinkAppPublisherServer(server, port);
    console.log(`Link App Publisher listening at ${listener.url}`);
    console.log(requireAuth ? "Auth required: Bearer, x-telnyx-auth-rev2, or x-telnyx-api-key." : "Auth disabled for local development.");
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
