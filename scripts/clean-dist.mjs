/**
 * Remove dist/ before a build.
 *
 * tsup runs the entries of an array config CONCURRENTLY, so letting one of them
 * carry `clean: true` races the other's output — the ESM build's clean can land
 * after the IIFE build has already written its bundle, deleting it. Cleaning
 * once, up front, is the only ordering that is actually guaranteed.
 */
import { rmSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
rmSync(join(root, "dist"), { recursive: true, force: true });
