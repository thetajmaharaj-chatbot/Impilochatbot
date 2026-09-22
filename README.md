# Impilo Drilling Facebook Chatbot

A clean starter webhook for connecting the **Impilo Drilling Facebook Page** to Facebook Messenger.

## What works in this first build

- Public health endpoint
- Meta webhook verification
- Facebook Page webhook event receiver
- Meta webhook signature validation using the App Secret
- Receives Messenger text messages
- Sends a temporary acknowledgement reply
- Secrets are kept in environment variables, not committed to GitHub

This first build intentionally does **not** contain the final AI knowledge base yet. The goal is to prove that Facebook can send a message to the server and receive a reply. GPT/AI, lead capture, drilling knowledge, quote flows and human handoff can then be added safely on top.

## Requirements

- Node.js 20+
- A Meta developer account
- A Meta app with Messenger configured
- The Impilo Drilling Facebook Page connected to the Meta app
- A Page Access Token
- A public HTTPS deployment URL

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

3. Fill in:

   - `META_VERIFY_TOKEN`
   - `META_PAGE_ACCESS_TOKEN`
   - `META_APP_SECRET`
   - `META_GRAPH_API_VERSION`

4. Start:

   ```bash
   npm start
   ```

5. Health check:

   ```text
   GET /health
   ```

## Meta webhook

After deployment, use:

```text
https://YOUR-DOMAIN/webhook
```

as the callback URL in the Meta app.

The **Verify Token** entered in Meta must exactly match `META_VERIFY_TOKEN`.

Subscribe the Page webhook to the messaging events required by the Messenger setup, including incoming messages.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `META_VERIFY_TOKEN` | Secret phrase used when Meta verifies the webhook URL |
| `META_PAGE_ACCESS_TOKEN` | Token used to send replies as the Facebook Page |
| `META_APP_SECRET` | Validates signed webhook requests from Meta |
| `META_GRAPH_API_VERSION` | Graph API version supported by the Meta app |
| `DEFAULT_REPLY` | Temporary text sent while testing the connection |

## Next build stages

1. Deploy the webhook.
2. Connect the Impilo Drilling Facebook Page in Meta.
3. Send a real Messenger test message.
4. Add the AI response service.
5. Add Impilo Drilling knowledge and FAQs.
6. Add lead capture: name, location, phone number and drilling enquiry.
7. Add human/WhatsApp handoff.
8. Add conversation logging and admin controls.

## Security

Never commit Facebook tokens, Meta secrets or future AI API keys to this repository. Keep them in Render/hosting environment variables.
