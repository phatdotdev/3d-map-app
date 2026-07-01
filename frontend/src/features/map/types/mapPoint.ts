export type MapPoint3D = {
  id: string;
  name: string;
  type?: "model3d" | "point";

  longitude: number;
  latitude: number;
  z?: number;
  metadata?: Record<string, unknown>;
  source?:
    | {
        kind: "independent";
      }
    | {
        kind: "layer-entity";
        layerId: string;
        layerName: string;
      };

  pin?: {
    enabled?: boolean;
    color?: string;
    size?: number;
    iconUrl?: string;
    showAtScale?: number;
  };

  model3D?: {
    enabled?: boolean;
    url: string;
    scale?: number;
    width?: number;
    depth?: number;
    height?: number;
    heading?: number;
    tilt?: number;
    roll?: number;
    showModelAtScale?: number;
  };
};
