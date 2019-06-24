import { PromiseResolver } from '@yume-chan/async-operation-manager';

import { KoshareClient, KoshareServer, PacketType } from '../src';
import { delay } from '../src/util';

import { randomString, randomPort } from './util';

const noop = () => { };

interface Data {
    data: string;
}

describe('client', () => {
    let server!: KoshareServer;
    let client!: KoshareClient;
    let echo!: KoshareClient;

    const port = randomPort();

    beforeEach(async () => {
        server = await KoshareServer.listen({ port });
        client = await KoshareClient.connect(`ws://localhost:${port}`);
        echo = await KoshareClient.connect(`ws://localhost:${port}`);
    });

    afterEach(() => {
        if (typeof echo !== 'undefined') {
            echo.close();
        }

        if (typeof client !== 'undefined') {
            client.close();
        }

        if (typeof server !== 'undefined') {
            server.close();
        }
    });

    describe('connect', () => {
        it('should success', async () => {
            const prefix = randomString();
            const client = await KoshareClient.connect(`ws://localhost:${port}`, prefix);

            expect(client.prefix).toBe(prefix);
            expect(client.socket).toBeTruthy();
        })

        it('should throw when error', () => {
            return expect(KoshareClient.connect('', 'ws://localhost:7999')).rejects.toThrow();
        });
    });

    describe('subscribe', () => {
        it('should success', async () => {
            const handlePacket = jest.fn();
            server.on('packet', handlePacket);

            const topic = Date.now().toString();
            await client.subscribe(topic, noop);

            expect(handlePacket).toBeCalledTimes(1);
            expect(handlePacket).toBeCalledWith({ type: PacketType.Subscribe, topic, id: expect.any(Number) });
        });

        it('should throw when disconnected', async () => {
            client.close();

            const topic = Date.now().toString();
            return expect(client.subscribe(topic, noop)).rejects.toThrow();
        })
    });

    describe('broadcast', () => {
        it('should success', async () => {
            const topic = Date.now().toString();
            const data = randomString();

            let resolver = new PromiseResolver<void>();
            await echo.subscribe<Data>(topic, () => {
                resolver.resolve();
            });

            const handlePacket = jest.fn();
            server.on('packet', handlePacket);

            await client.broadcast<Data>(topic, { data });

            await resolver.promise;

            expect(handlePacket).toBeCalledTimes(1);
            expect(handlePacket).toBeCalledWith({ type: PacketType.Broadcast, topic, data });
        });

        it('should throw if containing invalid body', () => {
            const topic = Date.now().toString();
            return expect(client.broadcast(topic, { topic })).rejects.toThrow();
        });
    });

    test('message', async () => {
        const topic = Date.now().toString();
        const data = randomString();

        let handlePacket!: jest.Mock;
        let resolver = new PromiseResolver<void>();

        await echo.subscribe<Data>(topic, async (packet) => {
            handlePacket = jest.fn();
            server.on('packet', handlePacket);

            await echo!.message<Data>(topic, packet.src, { data: packet.data });
        });

        await client.subscribe(topic, () => {
            resolver.resolve();
        });

        await client.broadcast<Data>(topic, { data });

        await resolver.promise;

        expect(handlePacket).toBeDefined();
        expect(handlePacket).toBeCalledWith({ type: PacketType.Message, topic, data, dst: expect.any(Number) });
    });

    test('unsubscribe handler', async () => {
        const topic = Date.now().toString();
        const handler = jest.fn(() => { });

        await echo.subscribe(topic, handler);
        await client.broadcast(topic);

        await delay(100);

        await echo.unsubscribe(topic, handler);
        await client.broadcast(topic);

        await delay(100);

        expect(handler).toBeCalledTimes(1);
    });

    test('unsubscribe topic', async () => {
        const topic = Date.now().toString();
        const handler = jest.fn(() => { });

        await echo.subscribe(topic, handler);
        await client.broadcast(topic);

        await delay(100);

        await echo.unsubscribe(topic);
        await client.broadcast(topic);

        await delay(100);

        expect(handler).toBeCalledTimes(1);
    });
})
