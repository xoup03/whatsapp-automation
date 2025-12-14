import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import qrcode from "qrcode";
import pkg from "whatsapp-web.js";
import rateLimit from "express-rate-limit";

dotenv.config();
const { Client, LocalAuth, MessageMedia, Events } = pkg;
const app = express();
const allowedOriginRegex = /^https:\/\/([a-z0-9-]+\.)*xoup\.co\.in$/i;

app.use(cors());

app.use(express.json());

/* =========================
   SECURITY
   ========================= */

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20, // 20 requests per minute
});

const apiKeyMiddleware = (req, res, next) => {
  if (req.headers["x-apikey"] !== process.env.MY_API_KEY) {
    return res.status(403).json({ error: "Invalid API key" });
  }
  next();
};

/* =========================
   STATE
   ========================= */

let qrCodeData = "";
let isClientReady = false;
let reconnecting = false;

/* =========================
   WHATSAPP CLIENT
   ========================= */

const client = new Client({
  authStrategy: new LocalAuth({ clientId: "main-session" }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  },
});


/* =========================
   EVENTS
   ========================= */

client.on(Events.QR_RECEIVED, async (qr) => {
  qrCodeData = await qrcode.toDataURL(qr);
  console.log("📱 QR available at /qr");
});

client.on(Events.READY, () => {
  console.log("🚀 WhatsApp ready");
  isClientReady = true;
  reconnecting = false;
  qrCodeData = "";
});

client.on(Events.AUTH_FAILURE, (msg) => {
  console.error("❌ Auth failure:", msg);
  isClientReady = false;
});

client.on(Events.DISCONNECTED, (reason) => {
  console.warn("⚠️ Disconnected:", reason);
  isClientReady = false;

  if (!reconnecting) {
    reconnecting = true;
    setTimeout(() => {
      console.log("🔄 Reconnecting WhatsApp...");
      client.initialize();
    }, 10_000);
  }
});

client.initialize();

/* =========================
   ROUTES
   ========================= */

app.get("/qr", (req, res) => {
  if (!qrCodeData) return res.status(404).send("QR not available");
  res.send(`<img src="${qrCodeData}" width="300"/>`);
});

app.post("/send-text", apiLimiter, apiKeyMiddleware, async (req, res) => {
  const { number, message } = req.body;
  if (!isClientReady) return res.status(503).json({ error: "WhatsApp not ready" });
  if (!number || !message) return res.status(400).json({ error: "number & message required" });

  try {
    await client.sendMessage(`${number}@c.us`, message);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Send failed" });
  }
});

app.post("/send", apiLimiter, apiKeyMiddleware, async (req, res) => {
  const { number, imageUrl, caption } = req.body;
  if (!isClientReady) return res.status(503).json({ error: "WhatsApp not ready" });
  if (!number || !imageUrl) return res.status(400).json({ error: "number & imageUrl required" });

  try {
    const media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
    await client.sendMessage(`${number}@c.us`, media, { caption });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Send failed" });
  }
});

/* =========================
   START SERVER
   ========================= */

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => console.log(`🌐 Running on port ${PORT}`));
