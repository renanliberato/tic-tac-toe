export const DESIGN_WIDTH = 1125;
export const DESIGN_HEIGHT = 2436;

export function getPageScale(viewportWidth, viewportHeight) {
  const width = Number(viewportWidth);
  const height = Number(viewportHeight);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return 1;

  return Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
}

export function applyPageScale(page, viewport) {
  if (!page || !viewport) return;

  const updateScale = () => {
    const scale = getPageScale(viewport.innerWidth, viewport.innerHeight);
    page.style.setProperty("--page-scale", String(scale));
  };

  updateScale();
  viewport.addEventListener("resize", updateScale);
}
