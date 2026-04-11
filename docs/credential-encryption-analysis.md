# AIGNE Hub Credential 加解密机制调研

> 调研日期: 2026-04-11
> 调研范围: 主分支 Blocklet Server 版本 + `feat/cloudflare-migration` 分支 Cloudflare Workers 版本
> 调研目的: 明确 AI Provider credential（API Key / Secret Access Key）的加解密实现、密钥来源，为安全审计与 Cloudflare 迁移决策提供依据

---

## 摘要

| 问题 | 答案 |
|---|---|
| 加密密钥用的是 `BLOCKLET_APP_EK` 还是 `BLOCKLET_APP_SK`？ | **`BLOCKLET_APP_EK`**（EK = Encryption Key）。`BLOCKLET_APP_SK`（Blocklet 钱包私钥，用于签名）**完全没用到** |
| Salt 是什么？ | `BLOCKLET_DID`（当前 Blocklet 实例的 DID，天然实例唯一） |
| 具体算法？ | PBKDF2-HMAC-SHA512 (256 轮 / 32 字节) → 作 passphrase 交给 crypto-js → OpenSSL EVP KDF (MD5) → **AES-256-CBC + PKCS#7**，**无 MAC** |
| 哪些字段被加密？ | `api_key`、`secret_access_key`；`access_key_id` 刻意保持明文 |
| Cloudflare 分支也是这样吗？ | **不是**。CF 分支用 `CREDENTIAL_ENCRYPTION_KEY` Worker Secret + Web Crypto PBKDF2-SHA256 (100k 轮) + **AES-256-GCM**，与 Blocklet 版**完全不兼容** |

---

## 一、Blocklet Server 版本（主分支）

### 1.1 调用入口

业务层只是一层薄包装，只加密两个敏感字段 —— `blocklets/core/api/src/store/models/ai-credential.ts:295-333`：

```typescript
static encryptCredentialValue(credential: CredentialValue): CredentialValue {
  const encrypted: CredentialValue = { ...credential };
  if (credential.secret_access_key) {
    encrypted.secret_access_key = security.encrypt(credential.secret_access_key);
  }
  if (credential.api_key) {
    encrypted.api_key = security.encrypt(credential.api_key);
  }
  // 注意: access_key_id 保持明文（源码注释）
  return encrypted;
}
```

`security` 来自 `@blocklet/sdk/lib/security`。

### 1.2 真正的实现（关键）

`node_modules/@blocklet/sdk/lib/security/index.js:13-29` 是加解密的全部源码：

```javascript
const AES = require('@ocap/mcrypto/lib/crypter/aes-legacy').default;

const encrypt = (message, password, salt) => {
  const _password = password || process.env.BLOCKLET_APP_EK;  // ← 密钥
  const _salt     = salt     || process.env.BLOCKLET_DID;     // ← 盐
  if (!_password || !_salt) {
    return message;  // ⚠ 静默降级为明文
  }
  return AES.encrypt(
    message,
    crypto.pbkdf2Sync(_password, _salt, 256, 32, 'sha512').toString('hex')
  );
};
```

**确认事实**：

| 角色 | 实际值 |
|---|---|
| Password | `process.env.BLOCKLET_APP_EK` |
| Salt | `process.env.BLOCKLET_DID` |
| KDF | PBKDF2-HMAC-**SHA512** |
| 迭代 | **256** 次 |
| 输出长度 | 32 字节 |
| 后续处理 | 转成 **hex 字符串**（64 字符）作为 passphrase 交给 `crypto-js/aes` |

> Blocklet 生态里 EK 与 SK 职责分离：**SK** 是 Blocklet 的钱包私钥，用于签名 / 身份；**EK** 是专为本地对称加密提供的随机密钥。在这里只用到了 EK。

### 1.3 底层 AES 的真实模式

`node_modules/@ocap/mcrypto/lib/crypter/aes-legacy.js:44-53`：

```javascript
// AES-CBC-256  ← 源码注释
class AesCrypter {
  encrypt(message, secret) {
    const text = typeof message === 'string' ? message : JSON.stringify(message);
    return AES.encrypt(text, secret).toString();  // crypto-js/aes
  }
}
```

因为传入 `secret` 是字符串，`crypto-js` 会走 OpenSSL 兼容分支：用 **MD5** 二次派生出真正的 key + IV（即 `EVP_BytesToKey`），每次随机 8 字节 salt，密文格式是 `Salted__ || salt8 || ciphertext` 的 base64，模式是 **AES-256-CBC + PKCS#7**。**无 GCM tag，无任何完整性校验**。

### 1.4 完整密钥派生链

```
BLOCKLET_APP_EK ──┐
                  ├─ PBKDF2(SHA-512, 256 iters, 32 bytes) ──► 64 字符 hex
BLOCKLET_DID ─────┘                                                 │
                                                                    ▼
                                           crypto-js  AES.encrypt(plaintext, passphrase)
                                                                    │
                                                                    ▼
                                           OpenSSL EVP KDF (MD5, rand salt) ──► (key, IV)
                                                                    │
                                                                    ▼
                                                   AES-256-CBC 密文 (Salted__ || salt || ct)
```

### 1.5 数据流

- **写入**: `routes/ai-providers.ts:500-530` → `AiCredential.encryptCredentialValue()` → 存入 SQLite `AiCredentials.credentialValue` (JSON 字段)
- **读取使用**: `libs/ai-credentials.ts:7-50` 从 DB 读出 → `decryptCredentialValue()` → 作为 `apiKey` / `secretAccessKey` 传给 provider SDK
- **UI 回显**: `ai-credential.ts:336-345` `maskCredentialValue` 做 `xxxx************xxxx` 掩码，**不把明文回到前端**

---

## 二、Cloudflare Workers 版本（`feat/cloudflare-migration` 分支）

### 2.1 全新独立实现

`cloudflare/src/libs/crypto.ts:1-79` —— 不复用 `@blocklet/sdk`，用原生 Web Crypto API 重写：

```typescript
async function deriveKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw', encoder.encode(secret), { name: 'PBKDF2' }, false, ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('aigne-hub-credentials'),  // ⚠ 硬编码
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export async function encryptCredential(value: unknown, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
  // 返回 base64(iv || ciphertext)
  ...
}
```

### 2.2 配置

- **Secret 名**: `CREDENTIAL_ENCRYPTION_KEY`
- **类型定义**: `cloudflare/src/worker.ts:68`
- **配置方式**: `cloudflare/wrangler.toml:33` —— `wrangler secret put CREDENTIAL_ENCRYPTION_KEY`
- **加密范围**: 整个 credential JSON 被序列化后一次性加密（与 Blocklet 版"仅加密敏感字段"不同）

### 2.3 缓存注意点

`cloudflare/src/libs/ai-proxy.ts:34-90` 会把**已解密的 apiKey** 放进内存 LRU 缓存，TTL 60 秒、最多 500 条。Workers isolate 本身相对隔离，但在审计时需要知道这一点。

---

## 三、两版实现对比

| 维度 | Blocklet Server | Cloudflare Workers |
|---|---|---|
| 加密库 | `@blocklet/sdk/lib/security` → `crypto-js/aes` | Web Crypto API (`crypto.subtle`) |
| 密钥源 | `BLOCKLET_APP_EK` | Worker Secret `CREDENTIAL_ENCRYPTION_KEY` |
| Salt | `BLOCKLET_DID`（**实例唯一**，天然域分离） | 硬编码 `'aigne-hub-credentials'`（**所有部署共用**） |
| KDF | PBKDF2-**SHA512**，**256** 轮 | PBKDF2-**SHA256**，**100,000** 轮 |
| 底层算法 | AES-256-**CBC** + PKCS#7，**无 MAC** | AES-256-**GCM**，**有 MAC** |
| 二级 KDF | 是（crypto-js 内部 MD5 EVP_BytesToKey） | 无 |
| 加密粒度 | 仅 `api_key` / `secret_access_key` | 整个 credentialValue JSON |
| 明文字段 | `access_key_id` 刻意保持明文 | 无 |
| 密文格式 | `Salted__ \|\| salt8 \|\| ct` 的 base64 (crypto-js) | `iv12 \|\| ct` 的 base64 |
| 同步/异步 | 同步 (`security.encrypt` 直接返回) | 异步 (`crypto.subtle.*` 返回 Promise) |
| 密钥缺失时行为 | **静默返回明文**（`return message`） | 生产环境返回 500，否则明文存储 |
| 数据库 | Sequelize + SQLite | Drizzle + Cloudflare D1 |

**两版密文互不兼容** —— 从 Blocklet 迁到 CF 时 `credentialValue` 字段不能直接搬运，必须重新录入或由旧版解密后再新版加密。这一点在 `docs/migration/` 的 L2 层迁移里有记录。

---

## 四、安全观察

### 4.1 高优先级

1. **Blocklet 版 PBKDF2 只有 256 轮**
   对用户密码来说这是灾难性的低（现代建议 ≥ 100k）。不过因为 `BLOCKLET_APP_EK` 由框架生成、熵足够高，PBKDF2 在这里主要起"域分离 + 盐混合"作用，而非抵御密码暴力破解。**结论**: 实际强度取决于 EK 本身的生成质量。

2. **Blocklet 版使用 AES-CBC，无完整性校验**
   密文被篡改不会报错，只会解密出乱码或损坏的 JSON / API Key，要等到真正调用 Provider 时才暴露。对 DB 被写入的威胁场景下缺一道防线。GCM 是更稳妥的选择。

3. **Blocklet 版密钥缺失时静默降级为明文**（`security/index.js:16`）
   如果 `BLOCKLET_APP_EK` 或 `BLOCKLET_DID` 任一未设置，`encrypt()` 会直接返回原文，且调用方无感知。生产部署需保证环境变量一定存在。

4. **Cloudflare 版 salt 硬编码**（`crypto.ts:19`）
   所有部署共用同一 salt，如果 `CREDENTIAL_ENCRYPTION_KEY` 在多个环境重用，攻击面会叠加。建议改成从 env 读取、或根据 `workerName` / Blocklet DID 派生的唯一 salt。

### 4.2 中优先级

5. **`access_key_id` 明文存储**（Blocklet 版）
   源码注释说明是刻意为之（管理台展示、账号识别）。风险是 DB 泄漏时至少能识别关联的 AWS 账户。属于可接受的 trade-off，但应在安全文档里明确。

6. **Cloudflare 版解密后的 apiKey 进内存缓存 60s**（`ai-proxy.ts`）
   Workers isolate 隔离性较好，60s TTL 相对短，风险可控。但在威胁模型里要有记录。

7. **密钥轮换路径缺失**（两版都）
   Blocklet 版：如果 `BLOCKLET_APP_EK` 被轮换，历史 credential 无法解密。CF 版：同理。两版都没有"旧密钥解密 + 新密钥重新加密"的迁移工具。

### 4.3 信息性

8. **`aes-legacy` 命名**暗示 mcrypto 有更新的 AES 实现，但 Blocklet SDK 目前仍在用 legacy 版。短期看兼容性优先，长期应跟随 mcrypto 升级。

---

## 五、关键文件索引

### Blocklet 版本

| 文件 | 作用 |
|---|---|
| `blocklets/core/api/src/store/models/ai-credential.ts:295-333` | 业务层 encrypt/decrypt 包装 |
| `blocklets/core/api/src/store/models/ai-credential.ts:336-345` | UI 掩码 (`maskCredentialValue`) |
| `blocklets/core/api/src/libs/ai-credentials.ts:7-50` | 解密后提取 `apiKey` 传给 provider |
| `blocklets/core/api/src/routes/ai-providers.ts:500-530` | 创建 credential 的 POST 接口 |
| `node_modules/@blocklet/sdk/lib/security/index.js:13-29` | **真正的密钥来源**（EK + DID） |
| `node_modules/@ocap/mcrypto/lib/crypter/aes-legacy.js:44-53` | AES-256-CBC via crypto-js |

### Cloudflare 版本

| 文件 | 作用 |
|---|---|
| `cloudflare/src/libs/crypto.ts:1-79` | 全量加解密实现（Web Crypto API） |
| `cloudflare/src/routes/ai-providers.ts:700-741` | 创建 credential 的 Hono 路由 |
| `cloudflare/src/libs/ai-proxy.ts:138-200` | 读取 + 解密 + 负载均衡挑选 |
| `cloudflare/src/db/schema.ts:46-75` | `aiCredentials` Drizzle schema |
| `cloudflare/src/worker.ts:68` | `Env` 类型里声明 `CREDENTIAL_ENCRYPTION_KEY` |
| `cloudflare/wrangler.toml:33` | Secret 配置说明 |

---

## 六、给 Cloudflare 迁移的建议

1. **L2 credential 迁移必须手动重新录入**（或写脚本 "Blocklet 版解密 → CF 版加密"），因为两版密文不兼容。
2. **CF 版的 salt 应在迁移稳定前改为实例唯一值**，例如 `env.BLOCKLET_DID || env.WORKER_NAME || env.ENVIRONMENT`。这是一次性小改动，但显著降低横向风险。
3. **迁移完成后，考虑把 Blocklet 版的 legacy CBC 升级为 GCM**（不阻塞迁移，但值得作为独立的安全提升 issue 跟进）。
4. **两版都应补充"密钥轮换"路径**：至少文档化"如何从旧 EK 迁到新 EK"，最好提供脚本。

---

## 附：用户典型问题速查

> Q: Aigne Hub 里 credential 加密用的是 EK 还是 SK？
> **A**: `BLOCKLET_APP_EK`，不是 SK。EK 是专门的本地加密密钥，SK 是钱包私钥（用于签名身份，和加密无关）。

> Q: salt 是固定的吗？
> **A**: Blocklet 版用 `BLOCKLET_DID`（每个实例不同，天然隔离）。Cloudflare 版硬编码为 `'aigne-hub-credentials'`（**所有部署共用**，是已知待改进项）。

> Q: 两版能互通吗？
> **A**: 不能。算法、密钥、salt、密文格式全都不一样。迁移时必须重新加密。

> Q: 如果我 leak 了 SQLite 数据库但没 leak 环境变量，credential 安全吗？
> **A**: 对 `api_key` / `secret_access_key` 字段：理论上安全（AES-256-CBC 没有 MAC 但密钥未知）。但 `access_key_id` 是明文。另外如果 Blocklet 版启动时 `BLOCKLET_APP_EK` 为空，写入的 credential 会直接是明文，这种情况下数据库泄漏 = credential 泄漏。
