FROM node:18-alpine

WORKDIR /app

# Install build tools and dependencies required for mssql native module
RUN apk add --no-cache \
    g++ \
    make \
    python3 \
    py3-pip \
    libffi-dev \
    openssl-dev

# Copy package files first (for better caching)
COPY package*.json ./

# Install ALL dependencies (not just production)
RUN npm install --legacy-peer-deps

# Copy the rest of the application
COPY . .

EXPOSE 3000

CMD ["node", "server.js"]