import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "puppeteer") {
      return { url: new URL("./research-puppeteer.mjs", import.meta.url).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  }
});
