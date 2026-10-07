import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

// Read by svelte-check (and stops it picking up the app's config one level up).
export default { preprocess: vitePreprocess() };
