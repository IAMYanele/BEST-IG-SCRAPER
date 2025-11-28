FROM node:18-alpine

# Install dependencies
RUN apk add --no-cache \
    chromium \
    ca-certificates \
    dumb-init

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node dependencies
RUN npm install --production

# Copy actor code
COPY . .

# Set environment variables for Playwright
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# Run the actor
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
