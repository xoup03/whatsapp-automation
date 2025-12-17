# Use an AMD64 base image to avoid Apple Silicon issues
FROM --platform=linux/amd64 node:22-slim

# Install system dependencies for Chromium (required by Puppeteer)
RUN apt-get update && apt-get install -y \
    wget \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    libgbm1 \
    libgtk-3-0 \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy package files first (better build caching)
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy rest of app files
COPY . .

# Expose port
EXPOSE 8000

# Run app
CMD ["npm", "start"]