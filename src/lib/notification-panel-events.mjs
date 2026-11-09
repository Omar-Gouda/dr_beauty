export function attachNotificationPanelDismissal(documentTarget, {
  trigger,
  panel,
  onDismiss,
}) {
  function handlePointerDown(event) {
    if (trigger?.contains(event.target) || panel?.contains(event.target)) return;
    onDismiss();
  }

  function handleKeyDown(event) {
    if (event.key === "Escape") onDismiss();
  }

  documentTarget.addEventListener("pointerdown", handlePointerDown, true);
  documentTarget.addEventListener("keydown", handleKeyDown, true);

  return () => {
    documentTarget.removeEventListener("pointerdown", handlePointerDown, true);
    documentTarget.removeEventListener("keydown", handleKeyDown, true);
  };
}
