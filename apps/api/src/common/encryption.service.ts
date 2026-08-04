import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../config/environment';

@Injectable()
export class EncryptionService {
  private readonly key: Buffer;

  constructor(config: ConfigService<Environment, true>) {
    this.key = createHash('sha256')
      .update(config.get('FIELD_ENCRYPTION_KEY', { infer: true }))
      .digest();
  }

  encryptUtf8(value: string): Uint8Array<ArrayBuffer> {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Uint8Array.from(Buffer.concat([Buffer.from([1]), iv, tag, encrypted]));
  }

  decryptUtf8(value: Uint8Array): string {
    const buffer = Buffer.from(value);
    if (buffer[0] !== 1 || buffer.length < 30) throw new Error('Unsupported ciphertext');
    const iv = buffer.subarray(1, 13);
    const tag = buffer.subarray(13, 29);
    const ciphertext = buffer.subarray(29);
    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
