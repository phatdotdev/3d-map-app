const { splitModel } = require("../src/services/modelSplitService");

const args = process.argv.slice(2);
const modelId = args.find((arg) => !arg.startsWith("-"));
const force = args.includes("--force");

if (!modelId) {
  console.error("Usage: node scripts/splitModel.js <modelId> [--force]");
  process.exit(1);
}

splitModel(modelId, { strategy: "by-node", force })
  .then((result) => {
    console.log(JSON.stringify(result, null, 2));
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
