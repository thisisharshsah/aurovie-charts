import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    index: "src/index.ts",
    "react/index": "react/index.ts",
  },
  format: ["esm"], // add "cjs" only if you must support require()
  dts: true, // emits dist/index.d.ts + dist/react/index.d.ts
  sourcemap: true,
  clean: true,
  splitting: true, // shared core chunk between "." and "./react" (no duplicated engine)
  treeshake: true,
  target: "es2020",
  outDir: "dist",
  external: ["react", "react-dom", "react/jsx-runtime"], // never bundle the peer
  // esbuild strips the top-of-file "use client" directive when bundling; the build script
  // re-adds it to dist/react/index.js afterward (scripts/preserve-use-client.mjs).
});
