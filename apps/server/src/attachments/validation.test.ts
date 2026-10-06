import { describe, expect, it } from 'vitest';
import { attachmentName, validateAttachment } from './validation.js';

describe('attachment type validation', () => {
  it.each([
    ['photo.jpg', 'image/jpeg', Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0])],
    ['photo.jpeg', 'image/jpeg', Buffer.from([255, 216, 255, 224, 0, 16, 74, 70, 73, 70, 0])],
    ['photo.webp', 'image/webp', Buffer.from('RIFF0000WEBPVP8L0000000000000000')],
    ['guide.pdf', 'application/pdf', Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF')],
    ['archive.zip', 'application/zip', Buffer.from('UEsFBgAAAAAAAAAAAAAAAAAAAAAAAA==', 'base64')],
    ['diagram.svg', 'image/svg+xml', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')],
    ['note.txt', 'text/plain', Buffer.from('hello')],
    ['config.yaml', 'text/yaml', Buffer.from('services: {}')],
    ['config.yml', 'application/yaml', Buffer.from('services: {}')],
    ['config.json', 'application/json', Buffer.from('{}')],
  ])('accepts supported %s', async (name, mime, bytes) => {
    await expect(validateAttachment(name, mime, bytes, 1024)).resolves.toBeDefined();
    await expect(
      validateAttachment(name, 'application/octet-stream', bytes, 1024),
    ).resolves.toBeDefined();
  });
  it('normalizes readable names and blocks Windows devices', () => {
    expect(attachmentName('  My: photo.PNG')).toBe('My- photo.png');
    for (const name of ['CON.txt', 'NUL.png', 'COM1.pdf'])
      expect(() => attachmentName(name)).toThrow();
  });
});
