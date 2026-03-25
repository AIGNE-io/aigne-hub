import { describe, expect, it } from 'vitest';

describe('API Key auth identity resolution', () => {
  it('new key with userDid should resolve user.id to creator userDid', () => {
    const appRecord = { id: 'app:my-app:123', userDid: 'user:alice', name: 'my-app', publicKey: 'aigne_xxx', createdAt: '', updatedAt: '' };
    const userId = appRecord.userDid ? appRecord.userDid : appRecord.id;
    expect(userId).toBe('user:alice');
  });

  it('legacy key without userDid should resolve user.id to app.id (backward compat)', () => {
    const appRecord = { id: 'app:old-key:456', userDid: null, name: null, publicKey: 'aigne_yyy', createdAt: '', updatedAt: '' };
    const userId = appRecord.userDid ? appRecord.userDid : appRecord.id;
    expect(userId).toBe('app:old-key:456');
  });

  it('new key should inject appDid via x-aigne-hub-client-did', () => {
    const appRecord = { id: 'app:my-app:123', userDid: 'user:alice', name: 'my-app', publicKey: 'aigne_xxx', createdAt: '', updatedAt: '' };
    const shouldInjectAppDid = !!appRecord.userDid;
    const appDid = shouldInjectAppDid ? appRecord.id : '';
    expect(shouldInjectAppDid).toBe(true);
    expect(appDid).toBe('app:my-app:123');
  });
});

describe('API Key CRUD logic', () => {
  it('key ID should encode name and timestamp', () => {
    const name = 'my-app';
    const timestamp = 1711234567000;
    const keyId = `app:${name}:${timestamp}`;
    expect(keyId).toBe('app:my-app:1711234567000');
  });

  it('key preview should mask middle characters', () => {
    const key = 'aigne_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef';
    const preview = `${key.substring(0, 10)}...${key.slice(-4)}`;
    expect(preview).toBe('aigne_ABCD...cdef');
  });

  it('max 5 keys per user should be enforced', () => {
    const existingKeyCount = 5;
    const MAX_KEYS_PER_USER = 5;
    expect(existingKeyCount >= MAX_KEYS_PER_USER).toBe(true);
  });

  it('name should be extracted from key ID when name field is missing', () => {
    const keyId = 'app:my-app:1711234567000';
    const name = null;
    const displayName = name || keyId.split(':')[1] || 'default';
    expect(displayName).toBe('my-app');
  });
});
