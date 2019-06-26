import WebSocket from 'ws';

import { PromiseResolver } from '@yume-chan/async-operation-manager';
import { PacketType } from '@yume-chan/koshare-router-client';

import KoshareServer from '../src';
import { delay } from './util';

import { randomPort, randomString } from './util';

describe('server', () => {
    describe('listen', () => {
        it('should success', async () => {
            const server = await KoshareServer.listen({ port: randomPort() });
            expect(server).toBeInstanceOf(KoshareServer);

            server.close();
        });

        it('should throw if port is already used', async () => {
            const port = randomPort();

            const server = await KoshareServer.listen({ port });
            await expect(KoshareServer.listen({ port })).rejects.toThrow();

            server.close();
        });
    });
});

function sendPacket(socket: WebSocket, packet: object): Promise<void> {
    const resolver = new PromiseResolver<void>();

    socket.send(JSON.stringify(packet), (err) => {
        if (typeof err !== 'undefined') {
            resolver.reject(err);
        } else {
            resolver.resolve();
        }
    });

    return resolver.promise;
}

function handlePacket<A extends any[], R>(
    socket: WebSocket,
    times: number,
    callback: (packet: object) => void,
): Promise<void> {
    const resolver = new PromiseResolver<void>();
    let i = 0;

    socket.on('message', (message: string) => {
        i += 1;
        if (i === times) {
            process.nextTick(() => {
                resolver.resolve();
            });
        }

        callback(JSON.parse(message));
    });

    return resolver.promise;
}

describe('server', () => {
    let server!: KoshareServer;
    let client!: WebSocket;

    beforeEach(async (done) => {
        const port = randomPort();

        server = await KoshareServer.listen({ port });

        client = new WebSocket(`ws://localhost:${port}`);
        client.on('open', done);
    });

    afterEach(() => {
        client.close();

        server.close();
    });

    it('should return error for over-sized message', async () => {
        const handleResponse = jest.fn();
        const handlePacketPromise = handlePacket(client, 1, handleResponse);

        client.send(randomString(65535));

        await handlePacketPromise;

        expect(handleResponse).toBeCalledTimes(1);
        expect(handleResponse).toBeCalledWith({ error: 'MessageIsTooLong' });
    });

    it('should return error for non-JSON message', async () => {
        const handleResponse = jest.fn();
        const handlePacketPromise = handlePacket(client, 1, handleResponse);

        client.send(randomString());

        await handlePacketPromise;

        expect(handleResponse).toBeCalledTimes(1);
        expect(handleResponse).toBeCalledWith({ error: 'InvalidJSON' });
    });

    it('should return error for non-JSON-object message', async () => {
        const handleResponse = jest.fn();
        const handlePacketPromise = handlePacket(client, 1, handleResponse);

        client.send('42');

        await handlePacketPromise;

        expect(handleResponse).toBeCalledTimes(1);
        expect(handleResponse).toBeCalledWith({ error: 'InvalidParams' });
    });

    it('should return error for packet without type', async () => {
        const handleResponse = jest.fn();
        const handlePacketPromise = handlePacket(client, 1, handleResponse);

        const packet = { topic: randomString(5) };
        await sendPacket(client, packet);

        await handlePacketPromise;

        expect(handleResponse).toBeCalledTimes(1);
        expect(handleResponse).toBeCalledWith({ ...packet, error: 'InvalidParams' });
    });

    it('should return error for packet with long topic', async () => {
        const handleResponse = jest.fn();
        const handlePacketPromise = handlePacket(client, 1, handleResponse);

        const packet = { type: PacketType.Subscribe, topic: randomString(20) };
        await sendPacket(client, packet);

        await handlePacketPromise;

        expect(handleResponse).toBeCalledTimes(1);
        expect(handleResponse).toBeCalledWith({ ...packet, error: 'TopicNameIsTooLong' });
    });

    describe('subscribe', () => {
        it('should success', async () => {
            const handleResponse = jest.fn();
            const handlePacketPromise = handlePacket(client, 1, handleResponse);

            const packet = { type: PacketType.Subscribe, topic: randomString(5) };
            await sendPacket(client, packet);

            await handlePacketPromise;

            expect(server.subscription.size(packet.topic)).toBe(1);

            expect(handleResponse).toBeCalledTimes(1);
            expect(handleResponse).toBeCalledWith({ ...packet, peers: [] });
        });

        it('should return error if already subscribed', async () => {
            const handleResponse = jest.fn();
            const handlePacketPromise = handlePacket(client, 2, handleResponse);

            const packet = { type: PacketType.Subscribe, topic: randomString(5) };
            await sendPacket(client, packet);
            await sendPacket(client, packet);

            await handlePacketPromise;

            expect(server.subscription.size(packet.topic)).toBe(1);

            expect(handleResponse).toBeCalledTimes(2);
            expect(handleResponse).nthCalledWith(2, { ...packet, error: 'AlreadySubscribed' });
        });
    });

    describe('unsubscribe', () => {
        it('should success', async () => {
            const topic = randomString(5);

            await sendPacket(client, { type: PacketType.Subscribe, topic });
            await delay(100);
            expect(server.subscription.size(topic)).toBe(1);

            await sendPacket(client, { type: PacketType.Unsubscribe, topic });
            await delay(100);
            expect(server.subscription.size(topic)).toBe(0);
        });

        it('should return error if not subscribed', async () => {
            const handleResponse = jest.fn();
            const handlePacketPromise = handlePacket(client, 1, handleResponse);

            const packet = { type: PacketType.Unsubscribe, topic: randomString(5) };
            await sendPacket(client, packet);

            await handlePacketPromise;

            expect(server.subscription.size(packet.topic)).toBe(0);

            expect(handleResponse).toBeCalledTimes(1);
            expect(handleResponse).toBeCalledWith({ ...packet, error: 'NotSubscribed' });
        });
    });
});
