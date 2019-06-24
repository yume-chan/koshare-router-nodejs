import debug from 'debug';
import WebSocket from 'ws';

import AsyncOperationManager from '@yume-chan/async-operation-manager';

import MultiMap, { ReadonlyMultiMap } from './multi-map';
import { ServerPacket, PacketType, SubscribeSuccessResponsePacket, ForwardPacket } from './packet';

const log = debug('koshare-client');

type ForwardPacketHandler<T> = (packet: ForwardPacket<T>) => void;

export interface AsyncOperationResponsePacket {
    id: number;
}

export type ExcludeCommon<T> = T extends { topic: string }
    ? Pick<T, Exclude<keyof T, 'topic' | 'dst'>>
    : T;

export function connectWebSocket(endpoint: string): Promise<WebSocket> {
    debug(`connecting to ${endpoint}`);

    return new Promise((resolve, reject) => {
        function handleOpen() {
            log(`connection to ${endpoint} established`);

            socket.off('open', handleOpen);
            socket.off('error', handleError);

            resolve(socket);
        }

        function handleError(e: Error) {
            log(`connection to ${endpoint} failed`);
            log(e.stack!);

            socket.off('open', handleOpen);
            socket.off('error', handleError);

            reject(e);
        }

        const socket = new WebSocket(endpoint);

        socket.on("open", handleOpen);
        socket.on("error", handleError);
    });
}

export default class KoshareClient {
    public static async connect(endpoint: string, prefix: string = ''): Promise<KoshareClient> {
        return new KoshareClient(prefix, await connectWebSocket(endpoint));
    }

    private _prefix: string;
    public get prefix(): string { return this._prefix; }

    protected _socket: WebSocket;
    public get socket(): WebSocket { return this._socket; }

    protected _disconnected: boolean;
    public get disconnected(): boolean { return this._disconnected; }

    private _operationManager: AsyncOperationManager = new AsyncOperationManager();

    protected _handlers: MultiMap<string, Function> = new MultiMap();
    public get handlers(): ReadonlyMultiMap<string, Function> { return this._handlers; }

    private _keepAliveInterval: number;

    private _keepAliveTimeoutId: NodeJS.Timeout | null = null;

    protected constructor(prefix: string, socket: WebSocket, keepAliveInterval = 60 * 1000) {
        this._prefix = prefix;

        this.prepareSocket(socket);
        this._socket = socket;
        this._disconnected = false;

        this._keepAliveInterval = keepAliveInterval;
        this.resetKeepAlive();
    }

    protected prepareSocket(socket: WebSocket) {
        socket.on('error', (e) => {
            log('connection error:');
            log(e.stack!);

            this._disconnected = true;
        });

        socket.on('close', () => {
            log('connection closed');

            this._disconnected = true;
            socket.terminate();
        });

        socket.on('message', (data) => {
            const packet = JSON.parse(data as string) as ServerPacket<AsyncOperationResponsePacket>;

            log('received: %s', PacketType[packet.type] || 'UNKNOWN');
            log('%j', packet);

            const topic = packet.topic.substring(this._prefix.length);

            switch (packet.type) {
                case PacketType.Message:
                case PacketType.Broadcast:
                    for (const handler of this._handlers.get(topic)) {
                        handler(packet);
                    }
                    break;
                case PacketType.Subscribe:
                    /* istanbul ignore if */
                    if ('error' in packet) {
                        this._operationManager.reject(packet.id, new Error(packet.error));
                    } else {
                        this._operationManager.resolve(packet.id, packet);
                    }
                    break;
            }
        });
    }

    private resetKeepAlive() {
        if (this._keepAliveTimeoutId !== null) {
            clearTimeout(this._keepAliveTimeoutId);
        }

        this._keepAliveTimeoutId = setTimeout(async () => {
            try {
                await this.send(PacketType.Error, 'keep-alive');
            } catch (e) {
                // do nothing
            }
        }, this._keepAliveInterval);
    }

    protected checkMessageBody(forbiddenKeys: string[], body: object | undefined): void {
        if (typeof body !== 'object' || body === null) {
            return;
        }

        for (const key of forbiddenKeys) {
            if (key in body) {
                throw new TypeError(`key "${key}" is forbidden in message body`);
            }
        }
    }

    protected send(type: PacketType, topic: string, body?: object): Promise<void> {
        if (this._disconnected) {
            return Promise.reject(new Error('the KoshareRouterClient instance is disconnected'));
        }

        log('sending: %s %s', PacketType[type] || 'UNKNOWN', topic);
        if (typeof body === 'object') {
            log('body: %j', body);
        }

        topic = this._prefix + topic;

        return new Promise((resolve, reject) => {
            const forbiddenKeys = ['type', 'topic'];
            this.checkMessageBody(forbiddenKeys, body);

            this._socket.send(JSON.stringify({ ...body, type, topic, }), (e) => {
                /* istanbul ignore if */
                if (e) {
                    log('send failed');
                    log(e.stack!);

                    reject(e);
                    return;
                }

                log('sent');

                this.resetKeepAlive();
                resolve();
            });
        });
    }

    protected async sendOperation<T>(type: PacketType, topic: string, body?: object): Promise<ServerPacket<T>> {
        const forbiddenKeys = ['id'];
        this.checkMessageBody(forbiddenKeys, body);

        const { id, promise } = this._operationManager.add<ServerPacket<T>>();
        await this.send(type, topic, { id, ...body });
        return await promise;
    }

    public async subscribe<T extends object>(topic: string, handler: ForwardPacketHandler<T>): Promise<void> {
        if (this._handlers.get(topic).length === 0) {
            await this.sendOperation<SubscribeSuccessResponsePacket>(PacketType.Subscribe, topic);
        }

        this._handlers.add(topic, handler);
    }

    public unsubscribe(topic: string): Promise<void>;
    public unsubscribe<T extends object>(topic: string, handler: ForwardPacketHandler<T>): Promise<void>;
    public async unsubscribe<T extends object>(topic: string, handler?: ForwardPacketHandler<T>): Promise<void> {
        if (typeof handler === 'undefined') {
            this._handlers.clear(topic);
        } else {
            this._handlers.remove(topic, handler);
        }

        if (this._handlers.get(topic).length === 0) {
            await this.send(PacketType.Unsubscribe, topic);
        }
    }

    public broadcast<T extends object>(topic: string, body?: T): Promise<void> {
        return this.send(PacketType.Broadcast, topic, body);
    }

    public message<T extends object>(topic: string, destination: number, body?: T): Promise<void> {
        return this.send(PacketType.Message, topic, { dst: destination, ...body });
    }

    public close() {
        log('closing');

        this._disconnected = true;

        this._socket.close();
        clearTimeout(this._keepAliveTimeoutId!);
    }
}
