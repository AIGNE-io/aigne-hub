import { createHash } from 'crypto';

import { wallet } from '@api/libs/auth';
import { Event } from '@blocklet/payment-js';
import { call } from '@blocklet/sdk/lib/component';
import { Router } from 'express';
import Joi from 'joi';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';

const router = Router();

export interface CallbackPayload extends Event {}

const embeddingsBodySchema = Joi.object<{
  model: string;
  data: {
    text: string;
  };
}>({
  model: Joi.string().empty(['', null]).default('text-embedding-3-small'),
  data: Joi.object({
    text: Joi.string().required(),
  }).required(),
});

const securityKey = createHash('sha256').update(`${wallet.secretKey}:/ai-kit/api/meilisearch/embeddings`).digest('hex');

router.post('/embeddings', async (req, res) => {
  if (req.get('authorization')?.replace(/^bearer\s+/i, '') !== securityKey) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const input = await embeddingsBodySchema.validateAsync(req.body, { stripUnknown: true });

  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 2048 });
  const texts = await splitter.splitText(input.data.text);

  const result = await Promise.all(
    texts.map(async (text) =>
      call<{ data: { embedding: number[] }[] }>({
        name: 'ai-kit',
        method: 'POST',
        path: '/api/v1/embeddings',
        data: { input: text, model: input.model },
      })
    )
  );

  const embeddings = result.map((i) => i.data.data[0]!.embedding);

  return res.json({ data: { embedding: !embeddings.length ? [] : meanPooling(embeddings) } });
});

function meanPooling(embeddings: number[][]): number[] {
  const numEmbeddings = embeddings.length;
  const embeddingSize = embeddings[0]!.length;
  const meanEmbedding = new Array(embeddingSize).fill(0);

  embeddings.forEach((embedding) => {
    for (let i = 0; i < embeddingSize; i++) {
      meanEmbedding[i] += embedding[i];
    }
  });

  return meanEmbedding.map((value) => value / numEmbeddings);
}

export default router;
