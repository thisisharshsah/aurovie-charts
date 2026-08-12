import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      "react/index": "react/index.ts",
    },
    format: ["esm"], // add "cjs" only if you must support require()
    dts: true, // emits dist/index.d.ts + dist/react/index.d.ts
    sourcemap: true,
    clean: false, // the build script cleans once, up front (scripts/clean-dist.mjs)
    splitting: true, // shared core chunk between "." and "./react" (no duplicated engine)
    treeshake: true,
    target: "es2020",
    outDir: "dist",
    external: ["react", "react-dom", "react/jsx-runtime"], // never bundle the peer
    // esbuild strips the top-of-file "use client" directive when bundling; the build script
    // re-adds it to dist/react/index.js afterward (scripts/preserve-use-client.mjs).
  },
  {
    // Standalone IIFE of the React-free core, for hosts that cannot run an ES module: a
    // React Native WebView, a <script> tag, a CSP'd page that inlines its bundle. The engine
    // lands on `window.AurovieCharts`.
    //
    // Consumers that inline this (base64 in a WebView, say) pin the version they generated
    // FROM — so it is deliberately dependency-free and self-contained, exactly like the file
    // it replaces on that path.
    entry: { "aurovie-charts.standalone": "src/index.ts" },
    format: ["iife"],
    globalName: "AurovieCharts",
    minify: true,
    dts: false,
    sourcemap: false,
    clean: false, // see above — cleaning here would race the ESM build's output
    splitting: false, // a standalone global cannot import a shared chunk
    treeshake: true,
    target: "es2020",
    outDir: "dist",
  },
]);
