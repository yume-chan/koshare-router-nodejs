import { EventEmitter } from 'events';

import WebSocket, { Server } from 'ws';

import { PromiseResolver } from './async-operation-manager';
import MultiMap from './multi-map';
import { PacketType } from './packet';

export default class KoshareServer extends EventEmitter {
    static async create(options?: import('ws').ServerOptions): Promise<KoshareServer> {
        const resolver = new PromiseResolver<void>();

        const result = new KoshareServer(options);
        result._socket.on('listening', () => {
            resolver.resolve();
        });

        await resolver.promise;
        return result;
    }

    private _socket: import('ws').Server;
    public get socket(): import('ws').Server { return this._socket; }

    private _id: number = 0;

    private _topicPeers: MultiMap<string, number> = new MultiMap();

    private _connections: Map<number, WebSocket> = new Map();

    private constructor(options?: import('ws').ServerOptions) {
        super();

        this._socket = new Server(options);
        this._socket.on('connection', this.handleClient);
    }

    private subscribe(id: number, topic: string): boolean {
        if (this._topicPeers.get(topic).includes(id)) {
            return false;
        }

        this._topicPeers.add(topic, id);
        return true;
    }

    private unsubscribe(id: number, topic: string): boolean {
        if (!this._topicPeers.get(topic).includes(id)) {
            return false;
        }

        this._topicPeers.remove(topic, id);
        return true;
    }

    private handleClient = async (client: WebSocket) => {
        const id = this._id++;

        this._connections.set(id, client);

        client.on('message', async (message: string) => {
            let packet: any;

            if (message.length > 65000) {
                client.send(JSON.stringify({ error: 'MessageIsTooLong' }));
                return;
            }

            try {
                packet = JSON.parse(message);
            } catch (error) {
                client.send(JSON.stringify({ error: 'InvalidJSON' }));
                return;
            }

            if (typeof packet !== 'object' || packet === null) {
                client.send(JSON.stringify({ error: 'InvalidParams' }));
                return;
            }

            if (typeof packet.type !== 'number' || typeof packet.topic !== 'string') {
                packet.error = 'InvalidParams';
                client.send(JSON.stringify(packet));
                return;
            }

            this.emit('packet', { ...packet });

            const { topic } = packet;

            if (packet.topic.length > 30) {
                packet.error = 'TopicNameIsTooLong';
                client.send(JSON.stringify(packet));
                return;
            }

            switch (packet.type) {
                case PacketType.Subscribe:
                    if (!this.subscribe(id, topic)) {
                        packet.error = 'AlreadySubscribed';
                        client.send(JSON.stringify(packet));
                        break;
                    }

                    const hello = JSON.stringify({
                        type: PacketType.Hello,
                        topic,
                        src: id,
                    });

                    const peers: number[] = [];
                    for (const item of this._topicPeers.get(topic)) {
                        if (item !== id) {
                            peers.push(item);
                            this._connections.get(item)!.send(hello);
                        }
                    }

                    packet.peers = peers;
                    client.send(JSON.stringify(packet));
                    break;

                case PacketType.Unsubscribe:
                    if (!this.unsubscribe(id, topic)) {
                        packet.error = 'NotSubscribed';
                        client.send(JSON.stringify(packet));
                    }
                    break;

                case PacketType.Broadcast:
                    packet.src = id;
                    let broadcast = JSON.stringify(packet);
                    for (const item of this._topicPeers.get(topic)) {
                        if (item !== id) {
                            this._connections.get(item)!.send(broadcast);
                        }
                    }
                    break;

                case PacketType.Message:
                    if (typeof packet.dst !== 'number') {
                        packet.error = 'NoDestination';
                        client.send(JSON.stringify(packet));
                        break;
                    }

                    if (!this._topicPeers.get(topic).includes(packet.dst)) {
                        break;
                    }

                    packet.src = id;
                    this._connections.get(packet.dst)!.send(JSON.stringify(packet));
                    break;

                case PacketType.Error:
                    break;

                default:
                    client.send(JSON.stringify({ error: 'UnsupportedMessageType' }));
                    break;
            }
        });

        client.addEventListener('error', () => {
            for (const key of this._topicPeers.keys()) {
                this._topicPeers.remove(key, id);
            }
            this._connections.delete(id);
        });

        client.addEventListener('close', () => {
            for (const key of this._topicPeers.keys()) {
                this._topicPeers.remove(key, id);
            }
            this._connections.delete(id);
        });
    }

    public handleUpgrade(request: import('http').IncomingMessage, socket: import('net').Socket, upgradeHead: Buffer) {
        this._socket.handleUpgrade(request, socket, upgradeHead, this.handleClient);
    }

    public close() {
        this._socket.close();
    }
}
