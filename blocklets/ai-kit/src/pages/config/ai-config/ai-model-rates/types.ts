export interface Provider {
  id: string;
  name: string;
  displayName: string;
  baseUrl?: string;
  region?: string;
  enabled: boolean;
  config?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface ModelRate {
  id: string;
  providerId: string;
  model: string;
  modelDisplay?: string;
  type: 'chatCompletion' | 'imageGeneration' | 'embedding';
  inputRate: number;
  outputRate: number;
  description?: string;
  provider: Provider;
  createdAt: string;
  updatedAt: string;
}

export interface ModelWithRates {
  model: string;
  modelDisplay?: string;
  description?: string;
  rates: ModelRate[];
  providers: Array<{ id: string; name: string; displayName: string }>;
}

export interface ModelRateFormData {
  modelName: string;
  modelDisplay?: string;
  rateType: 'chatCompletion' | 'imageGeneration' | 'embedding';
  inputRate: number;
  outputRate: number;
  description?: string;
  providers: string[];
}
