import path from 'path';

import AuthStorage from '@arcblock/did-connect-storage-nedb';
import env from '@blocklet/sdk/lib/env';
import AuthService from '@blocklet/sdk/lib/service/auth';
import getWallet from '@blocklet/sdk/lib/wallet';
import WalletAuthenticator from '@blocklet/sdk/lib/wallet-authenticator';
import WalletHandler from '@blocklet/sdk/lib/wallet-handler';

import { Config } from './env';

export const blocklet = new AuthService();

export const wallet = getWallet();

export const authenticator = new WalletAuthenticator();
export const walletHandler = new WalletHandler({
  authenticator,
  tokenStorage: new AuthStorage({
    dbPath: path.join(Config.dataDir, 'auth.db'),
  }),
});

export const passportsAllowUnsubscribeAIService = ['owner', 'admin'];

type DIDConnectCustomQuery = {
  // 填写用户的 DID
  forceConnected: string;
  sourceAppPid?: string;
  // auto 代表引导切换（进行弹窗提示，用户可选择不切换）；
  // disabled 代表不提示（适用于支付页面，允许用户不以当前登录账户来进行支付）；
  // required 代表强制要求切换（进行页面跳转强制切换账号）
  // switchAccount?: boolean || 'auto'; // 默认 'auto'
  switchBehavior?: 'auto' | 'disabled' | 'required';
  showClose?: true | false;
};

export function getConnectQueryParam({ userDid }: { userDid: string }): {
  '__did-connect__': string;
} {
  const data: DIDConnectCustomQuery = {
    forceConnected: userDid,
    sourceAppPid: env.appPid,
    switchBehavior: 'auto',
    showClose: false,
  };

  return {
    '__did-connect__': Buffer.from(JSON.stringify(data), 'utf8').toString('base64'),
  };
}
