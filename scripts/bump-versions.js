const pkg = require("../package.json");
const fs = require("fs");

const version = pkg.version;

pkg.workspaces.forEach(wrk => {
  const path = `${wrk}/package.json`;
  const wrkPkg = JSON.parse(fs.readFileSync(path).toString());
  wrkPkg.version = version;
  Object.keys(wrkPkg.dependencies).forEach(dep => {
    if (dep.startsWith("@deliverybot")) {
      wrkPkg.dependencies[dep] = version;
    }
  });
  fs.writeFileSync(path, JSON.stringify(wrkPkg, null, 2) + "\n");
});
