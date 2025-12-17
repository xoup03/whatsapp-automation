import express from "express";
import qrcode from "qrcode";
import pkg from "whatsapp-web.js";
import cors from "cors";
import dotenv from "dotenv";

dotenv.config();

const { Client, LocalAuth, MessageMedia, Events } = pkg;

const app = express();
app.use(cors());
app.use(express.json());

/* ------------------ GLOBAL SAFETY ------------------ */

process.on("unhandledRejection", (reason) => {
  console.error("❌ Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("❌ Uncaught Exception:", err);
});

/* ------------------ STATE ------------------ */

let qrCodeData = "";
let isClientReady = false;
let lastQrTime = 0;

/* ------------------ WHATSAPP CLIENT ------------------ */

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "main-session",
    dataPath: process.env.WWEBJS_AUTH_DIR || "/app/.wwebjs_auth",
  }),
  puppeteer: {
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-software-rasterizer",
      "--no-zygote",
      "--single-process",
    ],
  },
});

/* ------------------ EVENTS ------------------ */

client.on(Events.QR_RECEIVED, async (qr) => {
  try {
    const now = Date.now();
    if (now - lastQrTime < 10000) return; // debounce 10s
    lastQrTime = now;

    qrCodeData = await qrcode.toDataURL(qr);
    console.log("📸 QR Code generated");
  } catch (err) {
    console.error("QR generation error:", err);
  }
});

client.on(Events.AUTHENTICATED, () => {
  console.log("✅ WhatsApp authenticated");
});

client.on(Events.READY, () => {
  isClientReady = true;
  qrCodeData = "";
  console.log("🚀 WhatsApp client ready");
});

client.on(Events.DISCONNECTED, async (reason) => {
  console.error("❌ WhatsApp disconnected:", reason);
  isClientReady = false;

  try {
    await client.destroy();
  } catch (e) {
    console.error("Destroy error:", e);
  }

  setTimeout(() => {
    console.log("♻️ Reinitializing WhatsApp client...");
    client.initialize();
  }, 5000);
});

/* ------------------ INIT ------------------ */

console.log("⚙️ Initializing WhatsApp client...");
client.initialize();

/* ------------------ ROUTES ------------------ */

app.get("/", (_, res) => {
  res.send("🚀 Xoup WhatsApp Service Running");
});

app.get("/health", (_, res) => {
  res.json({
    ready: isClientReady,
    uptime: process.uptime(),
  });
});

app.get("/qr", (_, res) => {
  if (!qrCodeData) {
    return res.status(404).send(`
      <html>
        <body style="text-align:center;padding:2rem;">
          <h2>No QR code available</h2>
          <p>Client may already be authenticated</p>
        </body>
      </html>
    `);
  }

  res.send(`
    <html>
      <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;">
        <h2>Scan QR Code</h2>
        <img src="${qrCodeData}" width="300" />
      </body>
    </html>
  `);
});

app.post("/send", async (req, res) => {
  const { number, message, imageUrl } = req.body;
  const apiKey = req.headers["x-apikey"];

  if (apiKey !== process.env.MY_API_KEY) {
    return res.status(403).json({ error: "Invalid API Key" });
  }

  if (!isClientReady) {
    return res.status(503).json({ error: "WhatsApp not ready" });
  }

  if (!number || (!message && !imageUrl)) {
    return res.status(400).json({
      error: "number + message or imageUrl required",
    });
  }

  try {
    const chatId = `${number}@c.us`;

    if (imageUrl) {
      const media = await MessageMedia.fromUrl(imageUrl, {
        unsafeMime: true,
      });

      await client.sendMessage(chatId, media, {
        caption: message || "",
      });
    } else {
      await client.sendMessage(chatId, message);
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Send error:", err);
    res.status(500).json({ error: "Message send failed" });
  }
});

/* ------------------ SERVER ------------------ */

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🌐 Server listening on port ${PORT}`);
});