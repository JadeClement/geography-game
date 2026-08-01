// Registers the `@/` + JSON ESM loader hooks for standalone scripts.
// Usage: node --import ./scripts/register-alias.mjs <script>
import { register } from "node:module";

register("./alias-loader.mjs", import.meta.url);
