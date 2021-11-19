const fs = require('fs');
const { spawn } = require('child_process');

const procs = [];

function shutdown() {
  procs.forEach(proc => {
    proc.kill('SIGTERM');
  });
}

function run(pkg, cmd, onChange) {
  function pad(name, to) {
    let p = "";
    for (let i = 0; i < to - name.length; i++) {
      p += " ";
    }
    return `${name}:${p}`
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('npm', ['run', cmd], { cwd: pkg === '.' ? '.' : `./packages/${pkg}` });
    const name = pad(pkg, 10);
    procs.push(proc);
    proc.stdout.on('data', (data) => {
      data.toString().split("\n").forEach(line => {
        if (line.trim()) process.stdout.write(`${name} ${line}\n`);
      });
      if (onChange) onChange();
    });
    proc.stderr.on('data', (data) => {
      data.toString().split("\n").forEach(line => {
        if (line.trim()) process.stdout.write(`${name} ${line}\n`);
      });
      if (onChange) onChange();
    });
    proc.on("close", (code) => {
      if (code !== 0) {
        console.log(`${name} ${cmd} exited with code ${code}`);
        return reject(code);
      }
      return resolve();
    });
  });
}

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      func.apply(this, args);
    }, wait);
  };
}

const restart = debounce(() => {
  console.log("--> restart");
  fs.utimes("tmp/restart.txt", new Date(), new Date(), (err) => {
    if (err) console.error("Failed touch restart.txt", err);
  });
}, 1000);

async function main() {
  try {
    fs.mkdirSync("./tmp");
  } catch (err) {
    // Ignore.
  }
  try {
    fs.writeFileSync("./tmp/restart.txt", "");
  } catch (err) {
    // Ignore.
  }

  const watch = process.argv[2] == '--watch';
  const publish = process.argv[2] == '--publish';
  const test = process.argv[2] == '--test';

  if (watch) {
    await Promise.all([
      run('.', 'server'),
      run('core', 'build:watch', restart),
      run('app', 'build:watch', restart),
      run('app', 'partials:watch', restart),
      run('client', 'build:watch', restart),
      run('run', 'build:watch', restart),
      run('run', 'bundle:watch', restart),
    ]);
  } else if (test) {
    await Promise.all([
      run('app', 'test'),
    ]);
  } else {
    await Promise.all([
      run('core', 'clean'),
      run('app', 'clean'),
      run('client', 'clean'),
      run('run', 'clean'),
      run('firebase', 'clean'),
      run('deploybot', 'clean'),
      run('slackbot', 'clean'),
    ]);
    await run('core', 'build');
    await Promise.all([
      await run('deploybot', 'build'),
      await run('slackbot', 'build'),
    ]);
    await Promise.all([
      run('app', 'build'),
      run('app', 'partials'),
      run('client', 'build'),
    ]);
    await run('run', 'build');
    await run('run', 'bundle');
    await run('firebase', 'build');
  }

  if (publish) {
    console.log("\n\nPublishing...")
    await run('app', 'publish');
    await run('client', 'publish');
    await run('core', 'publish');
  }

  console.log("done");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  shutdown();
});

['SIGINT', 'SIGTERM', 'SIGQUIT'].forEach(sig => process.on(sig, () => {
  shutdown();
}));
