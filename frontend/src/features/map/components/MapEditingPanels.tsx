import { useAppSelector } from "../../../app/hook";
import { ModelInspector } from "./ModelInspector";
import { TransformPanel } from "./TransformPanel";
import type { ModelTransformState } from "../types/modelEditing";

type MapEditingPanelsProps = {
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onTransformChange: (transform: ModelTransformState) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onToggleSplit?: () => void;
  canToggleSplit?: boolean;
  splitActive?: boolean;
  splitBusy?: boolean;
  readOnly?: boolean;
};

export function MapEditingPanels({
  onClose,
  onEdit,
  onDelete,
  onTransformChange,
  onConfirm,
  onCancel,
  onToggleSplit,
  canToggleSplit = false,
  splitActive = false,
  splitBusy = false,
  readOnly = false,
}: MapEditingPanelsProps) {
  const selectedModel = useAppSelector((state) => state.mapEditing.selectedModel);
  const transformDraft = useAppSelector((state) => state.mapEditing.transformDraft);
  const isEditing = useAppSelector((state) => state.mapEditing.isEditing);

  if (!selectedModel) return null;

  if (isEditing && transformDraft) {
    return (
      <TransformPanel
        transform={transformDraft}
        onTransformChange={onTransformChange}
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
  }

  return (
    <ModelInspector
      model={selectedModel}
      onClose={onClose}
      onEdit={onEdit}
      onDelete={onDelete}
      onToggleSplit={onToggleSplit}
      canToggleSplit={canToggleSplit}
      splitActive={splitActive}
      splitBusy={splitBusy}
      readOnly={readOnly}
    />
  );
}
