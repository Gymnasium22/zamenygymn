import { expect } from 'vitest';
import * as matchers from '@testing-library/jest-dom/matchers';
import { randomUUID } from 'node:crypto';

expect.extend(matchers);

// Polyfill crypto.randomUUID for jsdom
if (!globalThis.crypto) {
    (globalThis as unknown as { crypto: Crypto }).crypto = {} as Crypto;
}
if (!globalThis.crypto.randomUUID) {
    Object.defineProperty(globalThis.crypto, 'randomUUID', {
        value: () => randomUUID(),
    });
}
