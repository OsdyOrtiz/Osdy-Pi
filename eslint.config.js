import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
	{
		ignores: [
			"node_modules/**",
			"dist/**",
			"scripts/**",
			"*.tgz",
			"eslint.config.js",
		],
	},
	js.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	{
		files: ["extensions/**/*.ts"],
		languageOptions: {
			parserOptions: {
				project: "./tsconfig.json",
				tsconfigRootDir: import.meta.dirname,
			},
		},
		rules: {
			"@typescript-eslint/no-explicit-any": "error",
			"@typescript-eslint/consistent-type-imports": [
				"error",
				{ prefer: "type-imports" },
			],
			"@typescript-eslint/no-unnecessary-type-assertion": "error",
		},
	},
);
