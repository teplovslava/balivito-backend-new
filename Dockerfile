ARG PORT
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --production

COPY . .

# Передаём порт в runtime
ENV PORT=${PORT}
EXPOSE ${PORT}

CMD ["node", "src/index.js"]
