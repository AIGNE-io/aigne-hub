// Model types for AI Kit
export interface ModelOption {
  value: string;
  label: string;
  description?: string;
  type?: string;
  types?: string[]; // All supported types for multi-capability models
}

export interface ModelGroup {
  provider: string;
  displayName: string;
  models: ModelOption[];
}
