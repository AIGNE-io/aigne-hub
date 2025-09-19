import { ChatModelOutput } from '@aigne/core';
import { getComponentMountPoint } from '@blocklet/sdk/lib/component';
import Config from '@blocklet/sdk/lib/config';
import { Request } from 'express';
import { joinURL, withQuery } from 'ufo';

import { OBSERVABILITY_DID } from './env';
import logger from './logger';

export type InvokeOptions = {
  onEnd?: (data?: {
    output?: ChatModelOutput;
    context?: { id?: string };
  }) => Promise<{ output?: ChatModelOutput } | undefined>;
  onError?: (data: { context: { id?: string }; error: Error }) => void;
};

const onError = async (result: { context: { id?: string } }, req: Request) => {
  const mountPoint = getComponentMountPoint(OBSERVABILITY_DID);

  if (mountPoint) {
    const link = withQuery(joinURL(Config.env.appUrl, mountPoint), { traceId: result.context.id });
    logger.error(`Visit the link to view the error details in observability: ${link}`);
  }

  if (req?.modelCallContext && result?.context?.id) {
    req.modelCallContext?.update({ traceId: result.context.id });
  }
};

export default onError;
