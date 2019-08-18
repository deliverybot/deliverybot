// Precompiles handlebars partials using the same naming strategy as hbs for
// express. Writes to stdout.

const path = require("path");
const walk = require('walk').walk;
const hb = require("handlebars");
const fs = require("fs");
const dir = path.join(__dirname, "..", "views", "partials");
const partials = {}
const p = console.log;

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
  p("var template = Handlebars.template, templates = Handlebars.templates = Handlebars.templates || {};");
  Object.keys(partials).forEach(partial => {
    const compiled = hb.precompile(partials[partial]);
    p("Handlebars.partials['" + partial + "'] = template(" + compiled + ");\n")
  })
})

