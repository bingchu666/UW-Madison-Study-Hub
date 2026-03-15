export const openExternalUrl = (url: string) => {
  const target = String(url || "").trim();
  if (!target) {
    return;
  }

  const popup = window.open(target, "_blank", "noopener,noreferrer");
  if (!popup) {
    window.location.assign(target);
  }
};
