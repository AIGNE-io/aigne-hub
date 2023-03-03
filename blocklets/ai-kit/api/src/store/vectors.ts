import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

import { Embeddings } from 'langchain/dist/embeddings/base';
import { HNSWLib } from 'langchain/vectorstores';

import env from '../libs/env';

export default class MyVectorStore extends HNSWLib {
  private static cache: Map<string, Promise<MyVectorStore>> = new Map();

  static override async load(id: string, embeddings: Embeddings): Promise<MyVectorStore> {
    let store = this.cache.get(id);
    if (!store) {
      store = (async () => {
        const dir = join(env.dataDir, 'db', id);
        const hnsw = existsSync(dir)
          ? await HNSWLib.load(dir, embeddings)
          : await HNSWLib.fromDocuments([], embeddings);
        return new MyVectorStore(id, hnsw);
      })();
      this.cache.set(id, store);
    }
    return store;
  }

  constructor(private id: string, hnsw: HNSWLib) {
    super(hnsw.args, hnsw.embeddings, hnsw.docstore, hnsw.index);
  }

  override async save(): Promise<void> {
    const dir = join(env.dataDir, 'db', this.id);
    mkdirSync(dir, { recursive: true });
    await super.save(dir);
  }
}
