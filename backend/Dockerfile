FROM node:18-alpine

WORKDIR /app

# Install build tools for mssql
RUN apk add --no-cache g++ make python3

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .

EXPOSE 3000

CMD ["node", "server.js"]
