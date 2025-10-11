// Model types for AI Kit
export interface ModelOption {
  value: string;
  label: string;
  description?: string;
  type?: string;
}

export interface ModelGroup {
  provider: string;
  displayName: string;
  models: ModelOption[];
}
