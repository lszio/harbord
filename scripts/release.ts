import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "util";

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    version: {
      type: "string",
      short: "v",
    },
    yes: {
      type: "boolean",
      short: "y",
    },
  },
  strict: false,
});

function run(command: string) {
  console.log(`> ${command}`);
  return execSync(command, { stdio: "inherit" });
}

async function main() {
  const pkgPath = join(process.cwd(), "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const currentVersion = pkg.version;

  let newVersion = values.version as string;

  if (!newVersion) {
    if (values.yes) {
      newVersion = "patch";
    } else {
      console.log(`Current version: ${currentVersion}`);
      console.log("Press Enter to default to 'patch' or provide a new version/bump type (patch, minor, major):");
      
      const input = await new Promise<string>((resolve) => {
        process.stdout.write("New version/bump [patch]: ");
        process.stdin.once("data", (data) => resolve(data.toString().trim()));
      });
      newVersion = input || "patch";
    }
  }

  if (["patch", "minor", "major"].includes(newVersion!)) {
    const parts = currentVersion.split(".").map(Number);
    if (newVersion === "patch") parts[2]++;
    if (newVersion === "minor") {
      parts[1]++;
      parts[2] = 0;
    }
    if (newVersion === "major") {
      parts[0]++;
      parts[1] = 0;
      parts[2] = 0;
    }
    newVersion = parts.join(".");
  }

  if (!newVersion || !/^\d+\.\d+\.\d+/.test(newVersion)) {
    console.error("Invalid version format. Use x.y.z or patch/minor/major.");
    process.exit(1);
  }

  console.log(`Releasing version ${newVersion}...`);

  // 1. Update root package.json
  pkg.version = newVersion;
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  // 2. Commit and Tag
  try {
    run(`git add package.json`);
    run(`git commit -m "chore: release v${newVersion}"`);
    run(`git tag v${newVersion}`);
  } catch (e) {
    console.error("Git operations failed. Ensure you have no unstaged changes.");
    process.exit(1);
  }

  // 3. Push
  try {
    // Determine current branch
    const branch = execSync("git rev-parse --abbrev-ref HEAD").toString().trim();
    run(`git push origin ${branch}`);
    run(`git push origin v${newVersion}`);
  } catch (e) {
    console.error("Push failed. Check your remote connection.");
    process.exit(1);
  }

  console.log(`Successfully released v${newVersion}!`);
  
  // Explicitly exit to prevent hanging due to open process.stdin
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
