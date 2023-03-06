import { Headers, ProxyAgent, Request, Response, fetch, setGlobalDispatcher } from 'undici';

// set proxy for openai api
if (process.env.HTTP_PROXY) {
  setGlobalDispatcher(new ProxyAgent(process.env.HTTP_PROXY));
}

globalThis.fetch = fetch as any;
globalThis.Headers = Headers as any;
globalThis.Request = Request as any;
globalThis.Response = Response as any;
