import { checkModelIsValid } from '@api/providers/models';
import AiCredential from '@api/store/models/ai-credential';
import AiProvider from '@api/store/models/ai-provider';

import { AIGNE_HUB_DEFAULT_WEIGHT } from './constants';

const checkCredentials = async (credentialId: string, providerId: string, testModel?: string) => {
  const [credential, provider] = await Promise.all([
    AiCredential.findOne({ where: { id: credentialId, providerId } }),
    AiProvider.findByPk(providerId),
  ]);

  if (!credential) {
    throw new Error('Credential not found');
  }
  if (!provider) {
    throw new Error('Provider not found');
  }

  const value = AiCredential.decryptCredentialValue(credential.credentialValue);

  const params: {
    apiKey?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    region?: string;
  } = {};

  if (credential.credentialType === 'api_key') {
    params.apiKey = value.api_key;
  } else if (credential.credentialType === 'access_key_pair') {
    params.accessKeyId = value.access_key_id;
    params.secretAccessKey = value.secret_access_key;
    if (provider.region) {
      params.region = provider.region;
    }
  }

  await checkModelIsValid(provider.name, params, testModel);
  await credential.update({ active: true, error: null, weight: AIGNE_HUB_DEFAULT_WEIGHT });

  return credential;
};

export default checkCredentials;
