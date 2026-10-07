import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-svelte"],
  srcDir: ".",
  vite: () => ({
    // `make extdev` pre-bundles deps for Vite's Node-side (SSR) environment.
    // Rolldown's tsconfig lookup there lands on the app's root tsconfig.json,
    // which extends .svelte-kit/tsconfig.json — gone after `make clean` — and
    // dev fails with "Could not resolve 'node:module'". Pre-bundling doesn't
    // need tsconfig, so skip the lookup.
    ssr: { optimizeDeps: { rolldownOptions: { tsconfig: false } } },
  }),
  manifest: {
    // Chrome shows these in the browser's language (public/_locales).
    name: "__MSG_extName__",
    description: "__MSG_extDescription__",
    default_locale: "en",
    permissions: ["storage", "unlimitedStorage"],
    action: { default_title: "Notavid" },
  },
});
