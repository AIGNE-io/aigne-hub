import { env } from '@blocklet/sdk/lib/config';
import { joinURL } from 'ufo';

export async function getOpenGraphInfo() {
  const info = {
    ogTitle: env.appName,
    ogDescription: env.appDescription,
    ogImage: joinURL(env.appUrl, '/.well-known/service/blocklet/og.png'),
  };

  return info;
}
