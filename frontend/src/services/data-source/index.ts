import { isWebMode } from "../../config/runtime";
import { ApiEntityDataSource } from "./ApiEntityDataSource";
import { staticAssetEntityDataSource } from "./StaticAssetEntityDataSource";

const apiEntityDataSource = new ApiEntityDataSource();

export function getEntityDataSource() {
  return isWebMode() ? staticAssetEntityDataSource : apiEntityDataSource;
}

