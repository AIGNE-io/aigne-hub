import { getDidDomainForBlocklet } from '@abtnode/util/lib/get-domain-for-blocklet';
import logger from '@api/libs/logger';
import axios from 'axios';
import { joinURL } from 'ufo';

export const getAppName = async (appDid: string) => {
  try {
    if (/[.@]/.test(appDid)) {
      return { appName: '', appDid, appLogo: '', appUrl: '' };
    }

    const domain = getDidDomainForBlocklet({ did: appDid });
    if (!domain) {
      logger.warn('Invalid blocklet DID, skipping fetch', { appDid });
      return { appName: '', appDid, appLogo: '', appUrl: '' };
    }
    const url = joinURL(`https://${domain}`, '__blocklet__.js?type=json');
    const { data } = await axios.get(url, { timeout: 30000 });

    // Validate that we got valid app name from API
    if (!data?.appName) {
      logger.warn('No appName found in blocklet metadata', { appDid, domain });
      return { appName: '', appDid, appLogo: '', appUrl: '' };
    }

    const { appName, appUrl, appLogo } = data;

    return {
      appName,
      appDid,
      appLogo,
      appUrl,
    };
  } catch (error) {
    logger.error('Failed to get app name', {
      appDid,
      domain: getDidDomainForBlocklet({ did: appDid }),
      error: error?.message || error,
    });
    return { appName: '', appDid, appLogo: '', appUrl: '' };
  }
};
