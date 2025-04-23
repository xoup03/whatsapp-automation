const express = require('express');
const { Client, MessageMedia, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');

const app = express();

// Initialize the client with LocalAuth for session persistence
const client = new Client({
  authStrategy: new LocalAuth(), // This will store session data locally
  puppeteer: {
    headless: true,  // Run in headless mode for production
    args: ['--no-sandbox', '--disable-setuid-sandbox'], // Common arguments for Docker
  },
});

// Middleware for parsing JSON requests
app.use(express.json());

// Store the QR code temporarily
let qrCodeData = '';

// Event listener when the client is ready
client.on('ready', () => {
  console.log('Client is ready!');
});

// Event listener for QR code generation (without printing it to the terminal)
client.on('qr', (qr) => {
  qrcode.toDataURL(qr, (err, url) => {
    if (err) {
      console.log('Error generating QR code:', err);
    } else {
      qrCodeData = url;
      console.log('QR code generated!');
    }
  });
});

// Event listener for successful login
client.on('authenticated', () => {
  console.log('Client authenticated');
});

// Initialize the WhatsApp client
client.initialize();

// Route to get the current QR code as HTML
app.get('/qr', (req, res) => {
  if (qrCodeData) {
    return res.send(`
      <html>
        <head>
          <title>WhatsApp QR Code</title>
        </head>
        <body style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh;">
          <h1>Scan the QR Code to Login</h1>
          <img src="${qrCodeData}" alt="QR Code" />
        </body>
      </html>
    `);
  } else {
    return res.status(400).send(`
      <html>
        <head>
          <title>No QR Code</title>
        </head>
        <body style="text-align: center; padding: 2rem;">
          <h1>QR code not generated yet</h1>
        </body>
      </html>
    `);
  }
});

app.get("/",async(req,res)=>{
  return res.status(200).send("hello xoup whatsapp ");
})

// Route to send a text message with an image
app.post('/send', async (req, res) => {
  const { number, message, imageUrl } = req.body;

  if (!number || (!message && !imageUrl)) {
    return res.status(400).json({ error: 'Number and at least message or imageUrl are required' });
  }

  try {
    const chatId = `${number}@c.us`;

    if (imageUrl) {
      // Get media and send with caption
      const media = await MessageMedia.fromUrl(imageUrl);
      await client.sendMessage(chatId, media, { caption: message || '' });
    } else {
      // Send only text message
      await client.sendMessage(chatId, message);
    }

    res.json({ success: true, message: 'Message sent successfully' });
  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});




// Start the server
app.listen(8000, () => {
  console.log('Server started on port 8000');
});
