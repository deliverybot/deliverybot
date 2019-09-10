import Mustache from "mustache";
import * as pkg from "./package";

export function render<T>(template: T, data: any) {
  const tags = ["${{", "}}"];
  try {
    const content = JSON.stringify(template);
    const rendered = Mustache.render(content, data, {}, tags);
    return JSON.parse(rendered);
  } catch (err) {
    return template;
  }
}

const example = `# View examples and documentation at ${pkg.documentation}
production:
  deployments:
  - environment: production
    production_environment: true
`;

export function newDeployFileUrl(owner: string, repo: string) {
  const encoded = encodeURIComponent(example);
  const filepath = encodeURIComponent(".github/deploy.yml");
  return `https://github.com/${owner}/${repo}/new/master?filename=${filepath}&value=${encoded}`;
}
