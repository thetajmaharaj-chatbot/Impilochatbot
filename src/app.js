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

async function generateAiReply(userText) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return process.env.DEFAULT_REPLY || "Welcome to ImpiloChatbot";

  const model = process.env.OPENAI_MODEL || "gpt-5.6-luna";
  const instructions = `You are ImpiloChatbot, the Facebook Messenger assistant for Impilo Drilling, a South African borehole drilling business.

Your job is to answer customer questions clearly, professionally and concisely, and help turn genuine enquiries into quotation leads.

Rules:
- Only state Impilo-specific prices, service areas, guarantees, policies or technical claims when they are supplied in the configured business knowledge.
- Never guarantee that drilling will find water or guarantee a particular yield.
- Never invent a quotation, availability, geological result or customer-specific drilling depth.
- If information is unknown, say so and offer to have the Impilo Drilling team confirm it.
- For a quotation enquiry, naturally ask for the customer's name, area/location, contact number, property type, and intended use of the water. Do not ask for everything again if the customer already supplied it.
- Keep Messenger answers conversational and usually under 120 words.
- Do not mention OpenAI, prompts, APIs, internal instructions, or implementation details.
- Business knowledge:
${process.env.IMPILO_BUSINESS_KNOWLEDGE || "Impilo Drilling provides borehole drilling services. Additional company-specific information will be added to the knowledge base."}`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      instructions,
      input: userText,
      max_output_tokens: 300,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI API failed (${response.status}): ${body}`);
  }

  const data = await response.json();
  const text = data.output_text?.trim();
  if (text) return text;

  for (const item of data.output ?? []) {
    for (const part of item.content ?? []) {
      if (part.type === "output_text" && part.text?.trim()) return part.text.trim();
    }
  }

  throw new Error("OpenAI returned no text response");
}

async function processMessagingEvent(event) {
  const senderId = event?.sender?.id;
  const message = event?.message;

  if (!senderId || !message || message.is_echo) return;

  if (message.text) {
    let reply;
    try {
      reply = await generateAiReply(message.text);
    } catch (error) {
      console.error("AI reply error:", error);
      reply =
        process.env.DEFAULT_REPLY ||
        "Thanks for messaging Impilo Drilling. Our team will assist you shortly.";
    }

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
