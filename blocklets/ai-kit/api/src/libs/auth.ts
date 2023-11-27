import path from 'path';

import AuthStorage from '@arcblock/did-auth-storage-nedb';
import getWallet from '@blocklet/sdk/lib/wallet';
import WalletAuthenticator from '@blocklet/sdk/lib/wallet-authenticator';
import WalletHandler from '@blocklet/sdk/lib/wallet-handler';

import { Config } from './env';

export const wallet = getWallet();
export const authenticator = new WalletAuthenticator();
export const handlers = new WalletHandler({
  authenticator,
  tokenStorage: new AuthStorage({
    dbPath: path.join(Config.dataDir, 'auth.db'),
  }),
});
