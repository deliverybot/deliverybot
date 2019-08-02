import Handlebars from "handlebars";

export function render<T>(template: T, data: any) {
  try {
    return JSON.parse(Handlebars.compile(JSON.stringify(template))(data));
  } catch (err) {
    return template;
  }
}
