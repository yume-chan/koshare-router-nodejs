import { randomBytes } from "crypto";

export function randomString() {
    return randomBytes(20).toString('hex');
}

export function randomPort() {
    return 9000 + Math.floor(Math.random() * 1000);
}
