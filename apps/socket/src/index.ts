import { Server } from "@hocuspocus/server";

const port = Number(process.env.SOCKET_PORT ?? 1234);

const server = Server.configure({
  port,
  async onListen() {
    console.log(`[socket] hocuspocus listening on ws://localhost:${port}`);
  },
});

server.listen();
