# Koshare Router Server/Client for Node.js

- [Koshare Router Server/Client for Node.js](#Koshare-Router-ServerClient-for-Nodejs)
  - [What's Koshare Router](#Whats-Koshare-Router)
  - [Protocol Specification](#Protocol-Specification)
  - [API](#API)
    - [Client](#Client)
    - [Server](#Server)
- [License](#License)

## What's Koshare Router

Koshare Router is a simple publish/subscribe protocol based on WebSocket designed by [@gladkikhartem](https://github.com/gladkikhartem).

The original C++ server implementation is at [gladkikhartem/koshare-router](https://github.com/gladkikhartem/koshare-router).

Since the original repository has been archived, and the original public server has been shut down, I created this Node.js implementation based on [ws](https://github.com/websockets/ws).

This server implementation is "almost" fully compatible with the original C++ one. And I have a public server at `wss://chensi.moe/koshare`.

## Protocol Specification

Read [here](docs/protocol-specification.md).

## API

### Client

``` ts
type PacketHandler<T> = (packet: T & (ServerMessagePacket | ServerBroadcastPacket)) => void;

class KoshareClient {
    static connect(endpoint: string, prefix?: string): Promise<KoshareClient>;

    subscribe<T extends object>(topic: string, handler: PacketHandler<T>): Promise<void>;

    unsubscribe(topic: string): Promise<void>;
    unsubscribe<T extends object>(topic: string, handler: PacketHandler<T>): Promise<void>;

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

### Server

```ts
class KoshareServer extends EventEmitter {
    static create(options?: import('ws').ServerOptions): Promise<KoshareServer>;

    readonly socket: import('ws').Server;

    on<T>(type: 'packet', listener: (packet: ClientPacket<T>) => void): this;

    handleUpgrade(request: import('http').IncomingMessage, socket: import('net').Socket, upgradeHead: Buffer): void;

    close(): void;
}
```

Example:

``` ts
import { KoshareServer } from '@yume-chan/koshare-router';

(async () => {
    const server = KoshareServer.create({ port: 8080 });

    server.close();
})();
```

# License

MIT
