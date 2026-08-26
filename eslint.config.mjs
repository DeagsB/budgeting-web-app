import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Design reference bundle — JSX-in-browser prototypes, not app code.
    "design_handoff_maple/**",
    // Drop-in replacement files; the copies under src/ are what runs.
    "fixes/**",
    // Local Playwright screenshot helper, never committed.
    ".pw-shot.cjs",
  ]),
  {
    // Allow leading-underscore to signal "received but intentionally unused"
    // (matches the convention used in the Maple fix-pack).
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
]);

export default eslintConfig;
