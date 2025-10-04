import express from "express";
import qrcode from "qrcode";
import pkg from "whatsapp-web.js";

const { Client, LocalAuth, MessageMedia, Events } = pkg;

const app = express();
app.use(express.json());

let qrCodeData = ""; // store QR temporarily

// ✅ Initialize client using LocalAuth (session persistence)
const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "main-session", // optional unique ID for session folder
  }),
  puppeteer: {
    executablePath: undefined,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  },
});

// ✅ New event system (v1.34.1 uses named Events constants)
client.on(Events.QR_RECEIVED, async (qr) => {
  try {
    qrCodeData = await qrcode.toDataURL(qr);
    console.log("QR Code generated, visit /qr to view it");
  } catch (err) {
    console.error("Error generating QR code:", err);
  }
});

client.on(Events.AUTHENTICATED, () => {
  console.log("✅ Client authenticated");
});

client.on(Events.READY, () => {
  console.log("🚀 WhatsApp client is ready!");
});

client.on(Events.DISCONNECTED, (reason) => {
  console.log("❌ Client disconnected:", reason);
});

// Initialize WhatsApp client
client.initialize();

/* ------------------ ROUTES ------------------ */

// Root route
app.get("/", (req, res) => {
  res.status(200).send("Hello from Xoup WhatsApp Service 🚀");
});

// QR route
app.get("/qr", (req, res) => {
  if (qrCodeData) {
    return res.send(`
      <html>
        <head>
          <title>WhatsApp QR Code</title>
        </head>
        <body style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;">
          <h1>Scan this QR Code to Login</h1>
          <img src="${qrCodeData}" alt="QR Code" style="width:300px;height:300px;"/>
        </body>
      </html>
    `);
  } else {
    return res.status(400).send(`
      <html>
        <head><title>No QR Yet</title></head>
        <body style="text-align:center;padding:2rem;">
          <h2>QR code not generated yet</h2>
        </body>
      </html>
    `);
  }
});

// Send message or media
app.post("/send", async (req, res) => {
  const { number, message, imageUrl } = req.body;

  if (!number || (!message && !imageUrl)) {
    return res.status(400).json({
      error: "Number and at least one of 'message' or 'imageUrl' are required.",
    });
  }

  try {
    const chatId = `${number}@c.us`;

    if (imageUrl) {
      const media = await MessageMedia.fromUrl(imageUrl);
      await client.sendMessage(chatId, media, { caption: message || "" });
    } else {
      await client.sendMessage(chatId, message);
    }

    res.json({ success: true, message: "Message sent successfully" });
  } catch (err) {
    console.error("Error sending message:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// Start Express server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🌐 Server started on port ${PORT}`);
});
