import { Server } from '@hocuspocus/server';

const port = Number(process.env.PORT || 1234);

const server = new Server({
  port,
  async onConnect(data) {
    console.log(`Client connected: ${data.documentName}`);
  },
});

server.listen().then(() => {
  console.log(`Hocuspocus Server listening on ws://0.0.0.0:${port}`);
});
