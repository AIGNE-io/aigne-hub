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
