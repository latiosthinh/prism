import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  outDir: "dist",
  clean: true,
  external: ["vscode", "@cursor/sdk"],
  noExternal: [/prism\/src/],
  dts: false,
  sourcemap: true,
  target: "es2022",
});
