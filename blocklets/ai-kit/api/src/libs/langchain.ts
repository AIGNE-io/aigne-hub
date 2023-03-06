const langchain = require('./langchain.polyfill');

export default langchain as Promise<{
  text_splitter: typeof import('langchain/text_splitter');
  document: typeof import('langchain/document');
  embeddings: typeof import('langchain/embeddings');
  chains: typeof import('langchain/chains');
  llms: typeof import('langchain/llms');
  vectorstores: typeof import('langchain/vectorstores');
  agents: typeof import('langchain/agents');
  tools: typeof import('langchain/tools');
  document_loaders: typeof import('langchain/document_loaders');
  docstore: typeof import('langchain/docstore');
  memory: typeof import('langchain/memory');
  prompts: typeof import('langchain/prompts');
}>;
