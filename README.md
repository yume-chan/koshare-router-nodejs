# Koshare Router Server/Client for Node.js

![Node.js CI](https://github.com/yume-chan/koshare-router-nodejs/workflows/Node.js%20CI/badge.svg)

- [Koshare Router Server/Client for Node.js](#Koshare-Router-ServerClient-for-Nodejs)
  - [What's Koshare Router](#Whats-Koshare-Router)
  - [Protocol Specification](#Protocol-Specification)
  - [API](#API)
    - [Client](#Client)
      - [Reconnect Client](#Reconnect-Client)
    - [Server](#Server)
      - [`listen`](#listen)
      - [constructor](#constructor)
  - [License](#License)

## What's Koshare Router

Koshare Router is a simple publish/subscribe protocol based on WebSocket designed by [@gladkikhartem](https://github.com/gladkikhartem).

The original C++ server implementation used to be at [gladkikhartem/koshare-router](https://github.com/gladkikhartem/koshare-router), but had been deleted by its author.

Since the original repository has been archived, and the original public server has been shut down, I created this Node.js implementation based on [ws](https://github.com/websockets/ws).

This server implementation is "almost" fully compatible with the original C++ one. And I have a public server at `wss://chensi.moe/koshare`.

## Protocol Specification

Read [here](docs/protocol-specification.md).

## API

### Client

``` ts
type ForwardPacketHandler<T> = (packet: ForwardPacket<T>) => void;

class KoshareClient {
    static connect(endpoint: string, prefix?: string): Promise<KoshareClient>;

    subscribe<T extends object>(topic: string, handler: ForwardPacketHandler<T>): Promise<void>;

    unsubscribe(topic: string): Promise<void>;
    unsubscribe<T extends object>(topic: string, handler: ForwardPacketHandler<T>): Promise<void>;

    broadcast<T extends object>(topic: string, body?: T): Promise<void>;
    message<T extends object>(topic: string, destination: number, body?: T): Promise<void>;

    close(): void;
}
```

Example:

``` ts
import { KoshareClient } from '@yume-chan/koshare-router';

(async () => {
    const echo = await KoshareClient.connect('wss://chensi.moe/koshare');
    await echo.subscribe('echo', async (packet) => {
        await echo.message('echo', packet.src, { ...packet, type: undefined, topic: undefined, src: undefined, dst: undefined });
    });

    const client = await KoshareClient.connect('wss://chensi.moe/koshare');
    await client.subscribe('echo', (packet) => {
        console.log(packet);
    });
    await client.broadcast('echo', { content: 'test' });

    echo.close();
    client.close();
})();
```

#### Reconnect Client

The `KoshareReconnectClient`, wraps `KoshareClient`, will automatically reconnect if it got disconnected.

### Server

```ts
class KoshareServer extends EventEmitter {
    static listen(options?: import('ws').ServerOptions): Promise<KoshareServer>;

    constructor(options?: import('ws').ServerOptions);

    readonly socket: import('ws').Server;

    on<T>(type: 'packet', listener: (packet: ClientPacket<T>) => void): this;

    handleUpgrade(request: import('http').IncomingMessage, socket: import('net').Socket, upgradeHead: Buffer): void;

    close(): void;
}
```

#### `listen`

Use `listen` with `host`, `port`, `path` options to create a new Koshare server.

The result `Promise` will be resolved after the server is in listening state.

Example:

``` ts
import { KoshareServer } from '@yume-chan/koshare-router';

(async () => {
    const server = KoshareServer.create({ port: 8080 });

    // connect to ws://localhost:8080

    server.close();
})();
```

#### constructor

Use `new KoshareServer` with `server` option to reuse an exist HTTP/S server, or with `noServer: true` option to not create a server.

You can use `handleUpgrade` with `noServer: true` to share single HTTP/S server with multiple WebSocket servers (including Koshare servers).

See [Multiple servers sharing a single HTTP/S server](https://github.com/websockets/ws#multiple-servers-sharing-a-single-https-server) in ws's documetation.

``` ts
import http from 'http';
import url from 'url';

import ws from 'ws';

const server = http.createServer();
const koshare = new KoshareServer({ noServer: true });
const wss = new ws.Server({ noServer: true });

wss.on('connection', function connection(ws) {
  // ...
});

server.on('upgrade', function upgrade(request, socket, head) {
  const pathname = url.parse(request.url).pathname;

  if (pathname === '/foo') {
    koshare.handleUpgrade(request, socket, head);
  } else if (pathname === '/bar') {
    wss.handleUpgrade(request, socket, head, function done(ws) {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(8080);
```

Note that `handleUpgrade` in `KoshareServer` doesn't need a callback. It's handled internally.

## License

MIT
