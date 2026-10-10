#!/usr/bin/env node

const walk = require('walk').walk;
const path = require('path');
const fs = require("fs");
const hb = require("handlebars");

function partials() {
  const dir = path.join(__dirname, "views", "partials");
  const partials = {}
  const lines = [];
  const p = (line) => { lines.push(line) };

  const definition = `type Template = (data: any) => string;
export const partials: { [k: string]: Template | undefined };
`;

  walk(dir).on('file', function (root, stat, next) {
    const filepath = path.join(root, stat.name);
    fs.readFile(filepath, 'utf8', (err, data) => {
      if (err) {
        next(err);
        return;
      }
      var ext = path.extname(filepath);
      var templateName = path.relative(dir, filepath)
        .slice(0, -(ext.length)).replace(/[ -]/g, '_')
        .replace(/\\/g, '/')
      partials[templateName] = data;
      next();
    });
  }).on('end', function () {
    p("var Handlebars = require('handlebars');");
    p("var partials = {};");
    p("Handlebars.partials = partials;")
    Object.keys(partials).forEach(partial => {
      const compiled = hb.precompile(partials[partial]);
      p("// ======> " + partial);
      p("partials['" + partial + "'] = Handlebars.template(" + compiled + ");\n\n");
    });
    p("module.exports = { partials: partials };")

    try {
      fs.mkdirSync("lib/views", { recursive: true });
    } catch (error) {
      // Ignore.
    }
    fs.writeFileSync("lib/views/partials.js", lines.join("\n"));
    fs.writeFileSync("lib/views/partials.d.ts", definition);
    console.log('Synced partials to lib/views/partials.js');
  });

  return Promise.resolve();
}

function watch() {
  let queued = false;
  setInterval(() => {
    if (queued) {
      queued = false;
      partials();
    }
  }, 1000);

  return new Promise(() => {
    fs.watch("views/partials", () => {
      queued = true;
    });
  });
}

function main() {
  switch (process.argv[2]) {
    case "build":
      return partials();
    case "watch":
      return partials().then(watch);
    default:
      return Promise.reject(`Unknown command ${process.argv[2]}`)
  }
}

main().catch(err => {
  if (err.stdout) {
    console.error(err.stdout);
    return;
  }
  console.error(err);
});
