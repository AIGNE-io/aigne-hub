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

export interface ModelMetadata {
  maxTokens?: number;
  features?: ('tools' | 'thinking' | 'vision')[];
  imageGeneration?: {
    max?: number;
    quality?: string[];
    size?: string[];
    style?: string[];
  };
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
  modelMetadata?: ModelMetadata;
}

export interface ModelRatesResponse {
  data: ModelRate[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface ModelRatesQuery {
  page?: number;
  pageSize?: number;
  providerId?: string;
  model?: string;
  q?: string;
  o?: 'asc' | 'desc';
}

export interface ModelWithRates {
  model: string;
  modelDisplay?: string;
  description?: string;
  rates: ModelRate[];
  providers: Array<{ id: string; name: string; displayName: string }>;
}

export interface ModelRateFormData {
  model: string;
  modelDisplay?: string;
  type: 'chatCompletion' | 'imageGeneration' | 'embedding';
  inputRate: number;
  outputRate: number;
  description?: string;
  providers: string[];
  unitCosts?: {
    input: number;
    output: number;
  };
  modelMetadata?: ModelMetadata;
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
  supports_tool_choice?: boolean;
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
  supportsToolChoice?: boolean;
  mode: string;
}
