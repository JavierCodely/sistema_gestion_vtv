import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      "coverage",
      "playwright-report",
      "test-results",
      "src/types/database.ts",
      // Deno (imports npm:/jsr:); se valida con sus tests de integración.
      "supabase/functions",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  {
    // Arquitectura en capas: app → modulos → compartido (nunca al revés).
    files: ["src/compartido/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/modulos/*", "@/app/*", "@tests/*"],
              message: "compartido/ no puede depender de módulos, de app/ ni de tests.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["src/modulos/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/*", "@tests/*"],
              message: "Un módulo no puede depender de app/ ni de tests.",
            },
          ],
        },
      ],
    },
  },
  {
    // Componentes generados por shadcn: exportan variantes junto al componente.
    files: ["src/compartido/ui/**/*.tsx"],
    rules: { "react-refresh/only-export-components": "off" },
  },
  {
    files: ["**/*.{js,mjs}"],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2023, globals: globals.node },
  },
  {
    // Service worker de la PWA (corre en el navegador, no en Node).
    files: ["public/sw.js"],
    languageOptions: { globals: globals.serviceworker },
  },
  prettier,
);
