// tsup/esbuild strips the top-of-file "use client" directive when bundling the ./react entry.
// Re-add it so the built widget keeps its React Server Components client boundary — without it,
// a Next.js server component importing aurovie-charts/react errors on useState/useRef.
import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../dist/react/index.js", import.meta.url);
const src = readFileSync(file, "utf8");
if (!src.startsWith('"use client"') && !src.startsWith("'use client'")) {
  writeFileSync(file, '"use client";\n' + src);
  console.log('preserve-use-client: prepended "use client" to dist/react/index.js');
} else {
  console.log('preserve-use-client: "use client" already present');
}
