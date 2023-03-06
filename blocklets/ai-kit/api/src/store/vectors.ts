import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';

import type { Document } from 'langchain/document';
import type { Embeddings } from 'langchain/embeddings';
import type { HNSWLib, SaveableVectorStore } from 'langchain/vectorstores';

import env from '../libs/env';
import langchain from '../libs/langchain';

export default class MyVectorStore implements SaveableVectorStore {
  private static cache: Map<string, Promise<MyVectorStore>> = new Map();

  static async load(id: string, embeddings: Embeddings): Promise<MyVectorStore> {
    let store = this.cache.get(id);
    if (!store) {
      store = (async () => {
        const dir = join(env.dataDir, 'db', id);
        const { HNSWLib } = (await langchain).vectorstores;
        const hnsw = existsSync(dir)
          ? await HNSWLib.load(dir, embeddings)
          : await HNSWLib.fromDocuments([], embeddings);
        return new MyVectorStore(id, hnsw);
      })();
      this.cache.set(id, store);
    }
    return store;
  }

  private constructor(private id: string, private hnsw: HNSWLib) {
    this.embeddings = hnsw.embeddings;
  }

  embeddings: Embeddings;

  async addVectors(vectors: number[][], documents: Document[]): Promise<void> {
    return this.hnsw.addVectors(vectors, documents);
  }

  async addDocuments(documents: Document[]): Promise<void> {
    return this.hnsw.addDocuments(documents);
  }

  async similaritySearchVectorWithScore(query: number[], k: number): Promise<[Document, number][]> {
    return this.hnsw.similaritySearchVectorWithScore(query, k);
  }

  async similaritySearch(query: string, k?: number | undefined): Promise<Document[]> {
    return this.hnsw.similaritySearch(query, k);
  }

  async similaritySearchWithScore(query: string, k?: number | undefined): Promise<[object, number][]> {
    return this.hnsw.similaritySearchWithScore(query, k);
  }

  async save(): Promise<void> {
    const dir = join(env.dataDir, 'db', this.id);
    mkdirSync(dir, { recursive: true });
    await this.hnsw.save(dir);
  }
}
