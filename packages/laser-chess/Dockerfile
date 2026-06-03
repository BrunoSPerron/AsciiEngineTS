FROM oven/bun:1

WORKDIR /app

COPY package.json ./

COPY server ./server
COPY shared ./shared

RUN bun install

WORKDIR /app/server

CMD ["bun", "run", "server.ts"]
