import base from "./eslint.config.mjs";

const qualityConfig = [
  ...base,
  { ignores: [".maestri/**"] },
  {
    files: ["app/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}", "modules/**/*.{ts,tsx}", "hooks/**/*.{ts,tsx}"],
    ignores: ["components/ui/**"],
    rules: {
      complexity: ["error", 15],
      "max-lines-per-function": ["error", { max: 80, skipBlankLines: true, skipComments: true }],
      "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
];

export default qualityConfig;
