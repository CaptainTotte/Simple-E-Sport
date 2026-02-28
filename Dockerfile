FROM node:20-alpine

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["sh", "-c", "set -e; npm run db:generate; npm run db:push; npm run db:seed; rm -rf .next/* .next-dev/* .next-prod/* 2>/dev/null || true; npm run dev"]
