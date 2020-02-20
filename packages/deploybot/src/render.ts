import Mustache from "mustache";

export function render<T>(template: T, data: any) {
  const tags: [string, string] = ["${{", "}}"];
  try {
    const content = JSON.stringify(template);
    const rendered = Mustache.render(content, data, {}, tags);
    return JSON.parse(rendered);
  } catch (err) {
    return template;
  }
}
