"use client";

import { useCallback, useRef, useState } from "react";

export interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "danger";
  /** Hide the Cancel button for info-only dialogs with a single acknowledgement action. */
  hideCancel?: boolean;
}

export interface ConfirmState extends ConfirmOptions {
  message: string;
}

// Promise-based replacement for window.confirm(): `await confirm(message)`
// resolves to true/false once the user responds to the rendered <ConfirmDialog>.
export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((message: string, options?: ConfirmOptions) => {
    setState({ message, ...options });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function respond(value: boolean) {
    setState(null);
    resolver.current?.(value);
    resolver.current = null;
  }

  return {
    confirm,
    confirmState: state,
    handleConfirm: () => respond(true),
    handleCancel: () => respond(false),
  };
}
