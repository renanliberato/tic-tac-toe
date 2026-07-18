import { JSDOM } from "jsdom";

const page = JSON.parse(process.env.RESEARCH_FEATURE_SEARCH_PAGE || "{}");
const dom = new JSDOM(page.html || "", { url: page.url || "https://www.google.com/search?q=fixture" });

const browserPage = {
  async setDefaultNavigationTimeout() {},
  _client() { return { send: async () => {} }; },
  async setRequestInterception() {},
  on() {},
  async goto() {},
  async $$eval(selector, callback) {
    return callback([...dom.window.document.querySelectorAll(selector)]);
  }
};

export default {
  async launch() {
    return {
      async newPage() { return browserPage; },
      async close() { dom.window.close(); }
    };
  }
};
