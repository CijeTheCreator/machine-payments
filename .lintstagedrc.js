const path = require("path");

const buildNextEslintCommand = (filenames) => {
  const filtered = filenames
    .filter((f) => !f.endsWith(".d.ts"))
    .map((f) => path.relative(path.join("packages", "nextjs"), f));
  if (filtered.length === 0) return "true";
  return `yarn next:lint --fix --file ${filtered.join(" --file ")}`;
};

const checkTypesNextCommand = () => "yarn next:check-types";

const buildHardhatEslintCommand = (filenames) =>
  `yarn hardhat:lint-staged --fix ${filenames
    .map((f) => path.relative(path.join("packages", "hardhat"), f))
    .join(" ")}`;

module.exports = {
  "packages/nextjs/**/*.{ts,tsx}": [
    buildNextEslintCommand,
    checkTypesNextCommand,
  ],
  "packages/hardhat/**/*.{ts,tsx}": [buildHardhatEslintCommand],
};
