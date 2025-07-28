import axios from 'axios';
import { joinURL } from 'ufo';

const AIGNE_HUB_DID = 'z8ia3xzq2tMq8CRHfaXj1BTYJyYnEcHbqP8cJ';

export const getRemoteBaseUrl = async (url: string): Promise<string> => {
  const tmp = new URL(url);
  if (tmp.origin === window.location.origin) {
    return getPrefix();
  }
  const scriptUrl = joinURL(tmp.origin, '__blocklet__.js?type=json');
  const blockletInfo = await axios.get(scriptUrl).then((res) => res.data);
  const componentId = (blockletInfo?.componentId || '').split('/').pop();
  if (componentId === AIGNE_HUB_DID) {
    return joinURL(tmp.origin, blockletInfo.prefix || '/');
  }
  const component = (blockletInfo?.componentMountPoints || []).find((x: any) => x?.did === AIGNE_HUB_DID);
  return component ? joinURL(tmp.origin, component.mountPoint) : url;
};

export const getPrefix = (): string => {
  const prefix = window.blocklet?.prefix || '/';
  const baseUrl = window.location?.origin; // required when use payment feature cross origin
  const componentId = (window.blocklet?.componentId || '').split('/').pop();
  if (componentId === AIGNE_HUB_DID) {
    return joinURL(baseUrl, prefix);
  }
  const component = (window.blocklet?.componentMountPoints || []).find((x: any) => x?.did === AIGNE_HUB_DID);
  if (component) {
    return joinURL(baseUrl, component.mountPoint);
  }

  return joinURL(baseUrl, prefix);
};
