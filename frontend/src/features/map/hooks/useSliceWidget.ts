import { useCallback, useEffect, useRef, useState } from "react";

import Slice from "@arcgis/core/widgets/Slice";
import type SceneView from "@arcgis/core/views/SceneView";

type UseSliceWidgetParams = {
  view: SceneView | null;
  onBeforeEnable?: () => Promise<void> | void;
};

export function useSliceWidget({ view, onBeforeEnable }: UseSliceWidgetParams) {
  const widgetRef = useRef<Slice | null>(null);
  const [active, setActive] = useState(false);

  const disable = useCallback(() => {
    if (view && widgetRef.current) {
      view.ui.remove(widgetRef.current);
    }

    widgetRef.current?.destroy();
    widgetRef.current = null;
    setActive(false);
  }, [view]);

  const enable = useCallback(async () => {
    if (!view || widgetRef.current) return;

    await onBeforeEnable?.();

    const widget = new Slice({
      view,
    });
    widget.viewModel.tiltEnabled = true;

    widgetRef.current = widget;
    view.ui.add(widget, {
      position: "bottom-right",
      index: 0,
    });
    setActive(true);

    await widget.viewModel.start().catch(() => undefined);
  }, [onBeforeEnable, view]);

  const toggle = useCallback(async () => {
    if (!widgetRef.current) {
      await enable();
      return;
    }

    disable();
  }, [disable, enable]);

  const startNewSlice = useCallback(async () => {
    if (!widgetRef.current) {
      await enable();
    }

    const widget = widgetRef.current;

    if (!widget) return;

    await onBeforeEnable?.();
    widget.viewModel.tiltEnabled = true;
    await widget.viewModel.start();
  }, [enable, onBeforeEnable]);

  useEffect(() => {
    if (!view) {
      disable();
      return undefined;
    }

    return () => {
      disable();
    };
  }, [disable, view]);

  return {
    active,
    disable,
    enable,
    startNewSlice,
    toggle,
  };
}
