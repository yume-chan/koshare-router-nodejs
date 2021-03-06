import { randomBytes } from "crypto";

export function randomString(length: number = 20) {
    return randomBytes(length).toString('hex');
}

export function randomPort() {
    return 9000 + Math.floor(Math.random() * 1000);
}

export function delay(time: number): Promise<void> {
    return new Promise<void>(resolve => {
        setTimeout(resolve, time);
    });
}
