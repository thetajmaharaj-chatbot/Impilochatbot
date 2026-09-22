import crypto from "node:crypto";
import express from "express";

export const app = express();

app.use(
  express.json({
    verify: (req, _res, buffer) => {
      req.rawBody = buffer;
    },
  }),
);

function verifyMetaSignature(req) {
  const appSecret = process.env.META_APP_SECRET;

  // Allow local setup before a Meta App Secret has been configured.
  // Production deployments should always set META_APP_SECRET.
  if (!appSecret) return true;

  const signature = req.get("x-hub-signature-256");
  if (!signature?.startsWith("sha256=") || !req.rawBody) return false;

  const expected = `sha256=${crypto
    .createHmac("sha256", appSecret)
    .update(req.rawBody)
    .digest("hex")}`;

  const receivedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    crypto.timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

async function sendTextMessage(recipientId, text) {
  const pageAccessToken = process.env.META_PAGE_ACCESS_TOKEN;
  const apiVersion = process.env.META_GRAPH_API_VERSION;

  if (!pageAccessToken) {
    throw new Error("META_PAGE_ACCESS_TOKEN is not configured");
  }

  if (!apiVersion || apiVersion === "vXX.X") {
    throw new Error("META_GRAPH_API_VERSION is not configured");
  }

  const response = await fetch(
    `https://graph.facebook.com/${apiVersion}/me/messages?access_token=${encodeURIComponent(
      pageAccessToken,
    )}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        messaging_type: "RESPONSE",
        message: { text },
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Meta Send API failed (${response.status}): ${body}`);
  }
}

async function processMessagingEvent(event) {
  const senderId = event?.sender?.id;
  const message = event?.message;

  if (!senderId || !message || message.is_echo) return;

  if (message.text) {
    const reply =
      process.env.DEFAULT_REPLY ||
      "Thanks for messaging Impilo Drilling. Our chatbot connection is working.";

    await sendTextMessage(senderId, reply);
  }
}

async function processWebhook(body) {
  for (const entry of body.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      await processMessagingEvent(event);
    }
  }
}

app.get("/", (_req, res) => {
  res.json({
    service: "Impilo Drilling Facebook Chatbot",
    status: "online",
  });
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (
    mode === "subscribe" &&
    token &&
    token === process.env.META_VERIFY_TOKEN
  ) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
  if (!verifyMetaSignature(req)) {
    return res.sendStatus(403);
  }

  if (req.body?.object !== "page") {
    return res.sendStatus(404);
  }

  // Acknowledge Meta immediately, then process the event.
  res.status(200).send("EVENT_RECEIVED");

  processWebhook(req.body).catch((error) => {
    console.error("Webhook processing error:", error);
  });
});
