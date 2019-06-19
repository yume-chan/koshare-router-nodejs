import KoshareReconnectClient from '../src/koshare-reconnect-client';
import KoshareServer from '../src/koshare-server';
import { delay } from '../src/util';
import { randomPort } from './util';

type SpiedObject<T> = {
    [key in keyof T]-?: Required<T>[key] extends (...args: infer A) => infer R ? jest.MockContext<R, A> : never;
}

function spyObject<T extends object>(object: T): SpiedObject<T> {
    const result: any = {};
    for (const [key, value] of Object.entries(object)) {
        if (typeof value === 'function') {
            result[key] = jest.spyOn(object, key as any);
        }
    }
    return result;
}

describe('koshare reconnect client', () => {
    let server!: KoshareServer;
    let client!: KoshareReconnectClient;
    let echo!: KoshareReconnectClient;

    const port = randomPort();

    beforeEach(async () => {
        server = await KoshareServer.create({ port });
        client = await KoshareReconnectClient.connect(`ws://localhost:${port}`);
        echo = await KoshareReconnectClient.connect(`ws://localhost:${port}`);
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

    test('reconnect', async () => {
        await client.subscribe('test', () => { });

        server.close();

        await delay(100);

        server = await KoshareServer.create({ port });

        const handlePacket = jest.fn();
        server.on('packet', handlePacket);

        await client.broadcast('test');

        expect(client).toHaveProperty('disconnected', false);
        expect(handlePacket).toBeCalledTimes(1);
    }, 10000);
})
