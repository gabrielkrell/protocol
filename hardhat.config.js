// Note: this config is only here as a matter of convenience to allow all truffle commands that can be run from core work at root as well.
const { getHardhatConfig} = require("@uma/common");

const path = require("path");
const coreWkdir = path.dirname(require.resolve("@uma/core/package.json"));
const packageWkdir = path.dirname(require.resolve("@uma/core/package.json"));
const configOverride = {
  paths: {
    root: coreWkdir,
    sources: `${coreWkdir}/contracts`,
    artifacts: `${coreWkdir}/artifacts`,
    cache: `${coreWkdir}/cache`,
    tests: `${packageWkdir}/test`
  }
};

module.exports = getHardhatConfig(configOverride);