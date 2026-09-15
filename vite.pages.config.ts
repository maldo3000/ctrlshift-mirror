import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root:resolve("standalone"),base:"./",publicDir:resolve("public"),
  resolve:{alias:{"@":resolve(".")}},plugins:[react()],
  build:{outDir:resolve("pages-dist"),emptyOutDir:true},
});
