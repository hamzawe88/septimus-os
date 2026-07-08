import { Server } from '@hocuspocus/server';

const server = new Server({
  port: 1234,
  async onConnect(data) {
    console.log(`Client connected: ${data.documentName}`);
  },
});

server.listen().then(() => {
  console.log('Hocuspocus Server listening on ws://localhost:1234');
});
