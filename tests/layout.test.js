import { describe, expect, it, vi } from "vitest";
import { applyPageScale, DESIGN_HEIGHT, DESIGN_WIDTH, getPageScale } from "../public/js/layout.js";

describe("page layout", () => {
  it("uses the design dimensions as the unscaled page size", () => {
    expect(getPageScale(DESIGN_WIDTH, DESIGN_HEIGHT)).toBe(1);
  });

  it("fits a phone viewport by its width without changing the aspect ratio", () => {
    const scale = getPageScale(375, 812);

    expect(scale).toBeCloseTo(375 / DESIGN_WIDTH);
    expect(2436 * scale).toBeCloseTo(812);
  });

  it("fits a wide, short viewport by its height and leaves side areas", () => {
    const scale = getPageScale(1366, 1024);

    expect(scale).toBeCloseTo(1024 / DESIGN_HEIGHT);
    expect(DESIGN_WIDTH * scale).toBeLessThan(1366);
    expect(DESIGN_HEIGHT * scale).toBeCloseTo(1024);
  });

  it("falls back to the design size for an unavailable viewport", () => {
    expect(getPageScale(0, 0)).toBe(1);
    expect(getPageScale(undefined, 768)).toBe(1);
    expect(getPageScale(Infinity, Infinity)).toBe(1);
  });

  it("updates the page scale when the viewport is resized", () => {
    const page = { style: { setProperty: vi.fn() } };
    const listeners = {};
    const viewport = {
      innerWidth: 1125,
      innerHeight: 2436,
      addEventListener: (event, listener) => { listeners[event] = listener; }
    };

    applyPageScale(page, viewport);
    expect(page.style.setProperty).toHaveBeenLastCalledWith("--page-scale", "1");

    viewport.innerWidth = 1366;
    viewport.innerHeight = 1024;
    listeners.resize();
    expect(page.style.setProperty).toHaveBeenLastCalledWith(
      "--page-scale",
      String(1024 / DESIGN_HEIGHT)
    );
  });
});
