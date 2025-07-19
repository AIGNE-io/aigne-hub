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
  unitCosts?: {
    input: number;
    output: number;
  };
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
  unitCosts?: {
    input: number;
    output: number;
  };
}

// LiteLLM 模型数据类型
export interface LiteLLMModelOptions {
  max_tokens?: number;
  max_input_tokens?: number;
  max_output_tokens?: number;
  input_cost_per_token?: number;
  output_cost_per_token?: number;
  litellm_provider: string;
  mode?: string;
  supports_function_calling?: boolean;
  supports_parallel_function_calling?: boolean;
  supports_vision?: boolean;
  source?: string;
}

export interface LiteLLMModelData {
  [modelName: string]: LiteLLMModelOptions;
}

export interface CachedModelData {
  data: ModelOption[];
  timestamp: number;
  expiresAt: number;
  totalModels: number;
  filteredModels: number;
  version: string;
}

export interface ModelOption {
  name: string;
  displayName: string;
  provider: string;
  inputCost?: number;
  outputCost?: number;
  maxTokens?: number;
  supportsVision?: boolean;
  supportsFunctionCalling?: boolean;
  mode: string;
}
