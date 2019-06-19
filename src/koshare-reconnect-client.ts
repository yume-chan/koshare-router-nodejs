import debug from 'debug';
import WebSocket from 'ws';

import KoshareClient, { connectWebSocket, AsyncOperationResponsePacket } from "./koshare-client";
import { delay } from './util';
import { PacketType, SubscribeSuccessResponsePacket } from './packet';

const log = debug('koshare-reconnect-client');

export default class KoshareReconnectClient extends KoshareClient {
    public static async connect(endpoint: string, prefix: string = ''): Promise<KoshareReconnectClient> {
        return new KoshareReconnectClient(endpoint, prefix, await connectWebSocket(endpoint));
    }

    private _endpoint: string;

    private _reconnectPromise: Promise<void> | null = null;

    private _closed = false;

    protected constructor(endpoint: string, prefix: string, socket: WebSocket, keepAliveInterval = 60 * 1000) {
        super(prefix, socket, keepAliveInterval);

        this._endpoint = endpoint;
    }

    private async reconnect(): Promise<void> {
        while (true) {
            try {
                log('disconnected from %s, reconnect after 5s', this._endpoint);
                await delay(5000);

                const socket = await connectWebSocket(this._endpoint);
                this.prepareSocket(socket);

                this._socket = socket;
                this._disconnected = false;

                for (const topic of this._handlers.keys()) {
                    await this.sendOperation<AsyncOperationResponsePacket>(PacketType.Subscribe, topic);
                }

                log('reconnected to %s', this._endpoint);
                return;
            } catch (e) {
                // do nothing
            }
        }
    }

    protected prepareSocket(socket: WebSocket) {
        super.prepareSocket(socket);

        socket.on('close', () => {
            if (!this._closed) {
                this._reconnectPromise = this.reconnect();
            }
        });
    }

    protected async send(type: PacketType, topic: string, extra?: object): Promise<void> {
        if (this._disconnected) {
            await this._reconnectPromise;
        }

        return super.send(type, topic, extra);
    }

    public close() {
        this._closed = true;

        super.close();
    }
}
