import type { ConfirmState } from "@/lib/hooks/useConfirm";

interface Props {
  state: ConfirmState | null;
  onConfirm: () => void;
  onCancel: () => void;
}

// Reusable confirm/cancel dialog — replaces window.confirm() everywhere so
// warnings match the app's own dark-card + depth-button styling instead of
// the browser's native prompt.
export function ConfirmDialog({ state, onConfirm, onCancel }: Props) {
  if (!state) return null;

  const {
    message,
    title = "Please confirm",
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    variant = "default",
    hideCancel = false,
  } = state;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4 backdrop-blur-sm dark:bg-black/60"
      onClick={(e) => {
        // Stop here so this doesn't bubble up and dismiss a parent modal
        // (e.g. the dividend modal) that this dialog is nested inside.
        e.stopPropagation();
        onCancel();
      }}
    >
      <div
        className="w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-800 dark:bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold tracking-tight text-gray-900 dark:text-gray-100">
          {title}
        </h2>
        <p className="mt-2 whitespace-pre-line text-sm text-gray-600 dark:text-gray-300">
          {message}
        </p>
        <div className="mt-6 flex justify-end gap-3">
          {!hideCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="cursor-pointer rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all duration-150 hover:-translate-y-px hover:bg-gray-50 hover:shadow-md active:translate-y-0 active:shadow-sm dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:hover:bg-gray-800"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm transition-all duration-150 hover:-translate-y-px hover:shadow-md active:translate-y-0 active:shadow-sm ${
              variant === "danger"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
