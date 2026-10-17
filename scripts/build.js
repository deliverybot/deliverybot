// Builds the packages, starts the app in watch mode or runs the tests.
//
//   node scripts/build.js           build everything once
//   node scripts/build.js --watch   rebuild on changes and run the server
//   node scripts/build.js --test    run the tests
//   node scripts/build.js --clean   remove all build output
//
// TypeScript is compiled with `tsc -b` from the root tsconfig.json, which
// builds the packages in dependency order and skips the ones that haven't
// changed since the last build.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const root = path.join(__dirname, "..");
const procs = [];

function shutdown() {
  procs.forEach((proc) => proc.kill("SIGTERM"));
}

// Runs a command, prefixing its output with a label so the output of
// processes running side by side stays readable.
function run(label, cmd, args, cwd = ".") {
  const prefix = `${label}:`.padEnd(10);
  const print = (data) => {
    data
      .toString()
      .split("\n")
      .forEach((line) => {
        if (line.trim()) process.stdout.write(`${prefix} ${line}\n`);
      });
  };

  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { cwd: path.join(root, cwd) });
    procs.push(proc);
    proc.stdout.on("data", print);
    proc.stderr.on("data", print);
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        return reject(new Error(`${label}: ${cmd} exited with code ${code}`));
      }
      return resolve();
    });
  });
}

const bin = (name) => path.join(root, "node_modules", ".bin", name);
const webpack = ["--config", "config/webpack.config.cjs"];

// The client imports the precompiled partials, so they're generated before
// the TypeScript build.
async function build() {
  await run("partials", "node", ["build.cjs", "build"], "packages/app");
  await run("tsc", bin("tsc"), ["-b"]);
  await run("bundle", bin("webpack"), webpack, "packages/run");
}

function watch() {
  // In-memory storage (no DATABASE_URL) is saved to tmp/db.json.
  fs.mkdirSync(path.join(root, "tmp"), { recursive: true });
  return Promise.all([
    run("server", "node", ["scripts/server.js"]),
    run("tsc", bin("tsc"), ["-b", "--watch", "--preserveWatchOutput"]),
    run("partials", "node", ["build.cjs", "watch"], "packages/app"),
    run("bundle", bin("webpack"), [...webpack, "--watch"], "packages/run"),
  ]);
}

function test() {
  return Promise.all(
    ["deploybot", "slackbot", "app", "postgres"].map((pkg) =>
      run(pkg, "yarn", ["test"], `packages/${pkg}`),
    ),
  );
}

function clean() {
  for (const pkg of fs.readdirSync(path.join(root, "packages"))) {
    for (const dir of ["lib", "bundle"]) {
      fs.rmSync(path.join(root, "packages", pkg, dir), {
        recursive: true,
        force: true,
      });
    }
  }
}

const commands = { "--watch": watch, "--test": test, "--clean": clean };

async function main() {
  const command = commands[process.argv[2]] || build;
  await command();
  console.log("done");
  process.exit(0);
}

main().catch((err) => {
  console.error(err.message || err);
  shutdown();
  process.exit(1);
});

["SIGINT", "SIGTERM", "SIGQUIT"].forEach((sig) =>
  process.on(sig, () => {
    shutdown();
  }),
);
