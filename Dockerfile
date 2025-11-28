FROM apify/actor-node:20

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy actor code
COPY . .

# Run the actor
CMD ["npm", "start"]
