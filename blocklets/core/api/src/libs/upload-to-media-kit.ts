import { v7 } from '@aigne/uuid';
import { BlockletStatus } from '@blocklet/constant';
import { CustomError } from '@blocklet/error';
import { getComponentMountPoint } from '@blocklet/sdk/lib/component';
import config from '@blocklet/sdk/lib/config';
import { uploadToMediaKit } from '@blocklet/uploader-server';
import mime from 'mime';
import { joinURL } from 'ufo';

import { MEDIA_KIT_DID } from './constants';

const getFileExtension = (type: string) => mime.getExtension(type) || 'png';
const getMediaKitUrl = () => joinURL(config.env.appUrl, getComponentMountPoint(MEDIA_KIT_DID));

const isMediaKitRunning = () => {
  return !!config.components.find((i) => i.did === MEDIA_KIT_DID && i.status === BlockletStatus.running);
};

async function convertMediaToOnlineUrl(
  path: string,
  mimeType: string
): Promise<{ type: 'url'; url: string; mimeType?: string; filename?: string }> {
  if (!isMediaKitRunning()) {
    throw new CustomError(500, 'MediaKit is not available');
  }

  const id = v7();
  const ext = getFileExtension(mimeType);
  const fileName = ext ? `${id}.${ext}` : id;

  const uploadResult = (await uploadToMediaKit({ filePath: path, fileName }))?.data;

  return {
    type: 'url',
    url: joinURL(getMediaKitUrl(), '/uploads', uploadResult?.filename),
    mimeType,
    filename: uploadResult?.filename,
  } as const;
}

export default convertMediaToOnlineUrl;
