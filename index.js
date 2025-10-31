import express from "express";
import AWS from "aws-sdk";
import qrcode from "qrcode";
import pkg from "whatsapp-web.js";
import cors from "cors";
import puppeteer from "puppeteer";
import dotenv from "dotenv";
dotenv.config();

const { Client, LocalAuth, MessageMedia, Events } = pkg;

const app = express();

app.use(cors());
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



// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
});

const uploadPDFBufferToS3 = async (buffer, bucketName, key) => {
  try {
    const params = {
      Bucket: bucketName,
      Key: key,
      Body: buffer,
    };
    const data = await s3.upload(params).promise();
    return data.Location;
  } catch (error) {
    console.error(
      generateErrorLog("uploadBufferToS3", "Failed to upload buffer to S3", error, {
        bucketName,
        key,
      })
    );
    return null;
  }
};

const getPresignedUrl = (bucketName, key, expiresInSeconds = 3600) => {
  return s3.getSignedUrl("getObject", {
    Bucket: bucketName,
    Key: key,
    Expires: expiresInSeconds, // 1 hour by default
  });
};

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
  const { "x-apikey": x_apikey} = req.headers;

  if (x_apikey !== process.env.MY_API_KEY){
    return res.status(403).json({ error: "Invalid API Key" });
  }
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
// Generate PDF from HTML
app.post("/send-bill", async (req, res) => {
  const { x_origin_url, "x-apikey": x_apikey} = req.headers;
  const { html, number, message, bill } = req.body;

  if (x_apikey !== process.env.MY_API_KEY){
    return res.status(403).json({ error: "Invalid API Key" });
  }
  if (!html || !number || !bill || !message)
    return res
      .status(400)
      .json({ error: "HTML content, number, message, and bill are required" });

  try {
    // Generate PDF
    console.log("Generating PDF from HTML...");
    // Upload PDF to S3
    console.log("Uploading PDF to S3...");
    const bucketName = process.env.AWS_S3_BUCKET;
    const key = `kartiq_bills/${bill.shop_name}/${bill.bill_number}.pdf`;
    await uploadPDFBufferToS3(pdfBuffer , bucketName, key);
    const pdfUrl = getPresignedUrl(bucketName, key, 3600);
    console.log("PDF uploaded to S3, URL:", pdfUrl);

    const chatId = `${number}@c.us`;
    // Send message with PDF
    console.log("Sending bill to", number);
    if (pdfUrl) {
      try {
        console.log("Sending Bill PDF via WhatsApp to", number);
        const media = await MessageMedia.fromUrl(pdfUrl);
        await client.sendMessage(chatId, media, { caption: message });
      } catch (whatsappErr) {
        console.error("Failed to send PDF via WhatsApp:", whatsappErr);
        await client.sendMessage(chatId, message);
      }
    } else {
      await client.sendMessage(chatId, message);
    }
    console.log("Bill sent successfully to", number);
    res.status(200).json({ success: true, apiResponse: "Successfully sent bill" });
  } catch (err) {
    console.error("Error sending bill:", err);
    res.status(500).json({ error: "Failed to generate/send PDF" });
  }
});

// Start Express server
const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`🌐 Server started on port ${PORT}`);
});


