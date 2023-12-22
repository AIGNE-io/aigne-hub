export interface EmbeddingInput {
  model: string;
  input: string | Array<string> | Array<number> | Array<Array<number>>;
}

export interface EmbeddingResponse {
  data: {
    embedding: number[];
  }[];
}
