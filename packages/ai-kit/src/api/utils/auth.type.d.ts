declare namespace Express {
  interface Request {
    appClient?: {
      appId: string;
      userDid?: string;
    };
    user?: {
      did: string;
      role: string;
      provider: string;
      fullName: string;
      walletOS: string;
      via: string;
    };
  }
}
