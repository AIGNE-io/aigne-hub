declare namespace Express {
  interface Request {
    appClient?: {
      appId: string;
    };
  }
}
