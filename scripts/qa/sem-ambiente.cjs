// Quality checks never load local credentials or connect to the configured database.
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Node --require preloads must use CommonJS.
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function (name, ...args) {
  const value = originalLoad.call(this, name, ...args);
  if (name === "@next/env" || name.endsWith("/@next/env")) {
    return { ...value, loadEnvConfig: () => ({ combinedEnv: process.env, parsedEnv: {}, loadedEnvFiles: [] }) };
  }
  return value;
};
process.env.DATABASE_URL = "";
process.env.DATABASE_URL_UNPOOLED = "";
