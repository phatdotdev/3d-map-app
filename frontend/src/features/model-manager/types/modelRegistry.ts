export type ModelSplitPart = {
  id: string;
  name: string;
  url: string;
  sourceNodeName?: string;
  visible?: boolean;
  metadata?: {
    bounds?: ModelBounds;
  } & Record<string, unknown>;
};

export type ModelBounds = {
  min?: number[];
  max?: number[];
  size?: number[];
};

export type ModelRegistryEntry = {
  id: string;
  name: string;
  originalFileName: string;
  url: string;
  type: string;
  uploadedAt: string;
  split?: {
    enabled?: boolean;
    manifestUrl?: string;
  };
  metadata?: Record<string, unknown>;
};

export type ModelSplitResponse = {
  modelId: string;
  parentModelUrl: string;
  parent?: {
    bounds?: ModelBounds;
  };
  manifestUrl: string | null;
  parts: ModelSplitPart[];
  alreadySplit?: boolean;
  regenerated?: boolean;
};
