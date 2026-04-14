# Final Cleanup & Lock Audit

## 1. Blocker 1 Fixes
- **Product Search (Convex Test)**: Replaced hardcoded 'tedytech' fallback with dynamic `$env.SELLER_ID`.

## 2. Blocker 2: Credential Coupling (External Deployment Requirement)

The following nodes are bound to the `telegram_tedytech_customer` credential. In n8n, credential linkage is stored by the credential's internal name/ID. This is an **External Deployment Requirement** and cannot be abstracted within the workflow JSON without unlinking the node.

- Admin Handoff Telegram Send
- Callback Admin Telegram Send
- Callback Telegram Send
- Telegram Input
- Telegram Send
- Telegram Typing

> [!IMPORTANT]
> When cloning this workflow, the user MUST manually update the credentials in the nodes listed above to match their own Telegram Bot credentials.
