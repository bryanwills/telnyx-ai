---
name: telnyx-bot-signup
description: Automated Telnyx bot account signup via obfuscated mathematical challenge
homepage: https://telnyx.com/agent-signup.md
docs: https://developers.telnyx.com/docs/account-setup/create-account
metadata: {
  "api_base": "https://api.telnyx.com/v2"
}
---

# Telnyx Bot Signup

Create a new Telnyx bot account through the bot-challenge flow at `https://api.telnyx.com`.

This repo-owned mirror is the source document for the public guide at `https://telnyx.com/agent-signup.md`. It is intentionally explicit about the current split:

- Repo-owned today: discovery, demo-first guidance, and the documented intended no-email contract
- Upstream dependency: returning a temporary session token directly from `POST /v2/bot_signup` for bot accounts

## Start With the No-Auth Fast Path

If you only need to validate your integration, do this before attempting account creation.

Fetch `https://telnyx.com/.well-known/agent-access.json` and inspect `fast_path.primary_path`.

The primary first-run evaluation route today is:

- `POST https://telnyx.com/api/inference`
- Auth label: `no_auth_host_authenticated`
- Governance: `guarded_write`, `confirm_before_mutation`, `stateless`, `request_selected`

That means the caller does not send a bearer token. Telnyx proxies the request with server-side auth and rate limits for evaluation traffic. The main REST and MCP surfaces remain API-key authenticated.

Available demo endpoints today:

- `POST https://telnyx.com/api/demo/send-sms`
- `POST https://telnyx.com/api/inference`
- `POST https://telnyx.com/api/tts-demo`
- `POST https://telnyx.com/api/stt-demo`
- `GET https://telnyx.com/api/number-lookup`
- `POST https://telnyx.com/api/voice-ai-agent/register-web-caller`

These endpoints keep the no-email trial path intact while production signup still depends on the account platform flow below.

## Current Production Signup Flow

As of 2026-05-27, the production bot-signup flow is:

1. `POST https://api.telnyx.com/v2/bot_challenge`
2. Solve the returned obfuscated math problem
3. `POST https://api.telnyx.com/v2/bot_signup`
4. Retrieve the single-use magic link from email and exchange it for `data.api_v2_token`
5. `POST https://api.telnyx.com/v2/api_keys`

This works for:

- agents with mailbox access
- human-assisted flows where the operator pastes the magic link

This does not yet work for:

- fully autonomous agents with no mailbox access

## Known Limitation

Step 4 is still the dead-end. `POST /v2/bot_signup` creates the account, but the next credential is only available through the magic-link email. That means the current production flow is not fully autonomous.

## Intended No-Email Contract

The smallest backend change that removes the dead-end is:

- Owner: Telnyx API / account platform
- Required change: return a temporary session token directly from `POST /v2/bot_signup` for bot accounts
- Repo status: documented here and in `/.well-known/agent-access.json`; not implemented in this repository

Proposed response shape:

```json
{
  "data": {
    "message": "Account created successfully.",
    "api_v2_token": "<temporary-session-token>",
    "magic_link_sent": true
  }
}
```

If that upstream change ships, autonomous agents can skip the email retrieval step and proceed directly to API key creation. The email can remain as a fallback for human operators.

## Current Flow Details

### Step 1: Get Bot Challenge

```bash
curl -s -X POST https://api.telnyx.com/v2/bot_challenge
```

### Step 2: Solve the Challenge

Extract the math from the obfuscated prompt and return the rounded numeric answer. No external solver binary is required.

### Step 3: Submit Bot Signup

```bash
curl -s -X POST https://api.telnyx.com/v2/bot_signup \
  -H "Content-Type: application/json" \
  -d '{
    "bot_challenge_nonce": "<nonce>",
    "bot_challenge_answer": "<numeric answer>",
    "terms_and_conditions_url": "<url from challenge>",
    "privacy_policy_url": "<url from challenge>",
    "email": "<email address>",
    "terms_of_service": true
  }'
```

### Step 4: Exchange the Magic Link

If you have mailbox access, extract the single-use sign-in link from the email and request it:

```bash
curl -s -L "<single-use-link-from-email>"
```

If you do not have mailbox access, a human must provide the unused link.

Expected response:

```json
{
  "data": {
    "api_v2_token": "<temporary-session-token>"
  }
}
```

### Step 5: Create the API Key

```bash
curl -s -X POST https://api.telnyx.com/v2/api_keys \
  -H "Authorization: Bearer <api_v2_token>" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Notes

- The fast path is the correct no-auth evaluation route today.
- The production no-email fix is upstream work, not a repo-local code path.
- If a live Telnyx endpoint disagrees with this file, the live endpoint wins until the public mirrors are redeployed.
