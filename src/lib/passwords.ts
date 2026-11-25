import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const keyLength = 64;
const parameters = { N: 2 ** 15, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const hashVersion = "scrypt-v1";

function deriveKey(password: string, salt: Buffer) {
  return new Promise<Buffer>((resolve, reject) => {
    scrypt(password, salt, keyLength, parameters, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt);
  return [hashVersion, salt.toString("hex"), key.toString("hex")].join(":");
}

export async function verifyPassword(password: string, storedHash: string | undefined) {
  const match = storedHash?.match(/^scrypt-v1:([a-f0-9]{32}):([a-f0-9]{128})$/);
  // Unknown accounts still perform the same password work as registered accounts.
  const salt = match ? Buffer.from(match[1], "hex") : Buffer.alloc(16);
  const key = await deriveKey(password, salt);
  return match ? timingSafeEqual(key, Buffer.from(match[2], "hex")) : false;
}
