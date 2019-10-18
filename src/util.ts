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
  environment: production
  production_environment: true
`;

export function newDeployFileUrl(owner: string, repo: string) {
  const encoded = encodeURIComponent(example);
  const filepath = encodeURIComponent(".github/deploy.yml");
  return `https://github.com/${owner}/${repo}/new/master?filename=${filepath}&value=${encoded}`;
}

export function timeAgoInWords(timeAgo: number): string {
  const locales: { [k: string]: string } = {
    prefix: "",
    sufix: "ago",

    seconds: "a few seconds",
    minute: "about a minute",
    minutes: "%d minutes",
    hour: "about an hour",
    hours: "about %d hours",
    day: "a day",
    days: "%d days",
    month: "about a month",
    months: "%d months",
    year: "about a year",
    years: "%d years"
  };
  const seconds = Math.floor((Date.now() - timeAgo) / 1000);
  const separator = locales.separator || " ";
  const intervals: { [k: string]: number } = {
    year: seconds / 31536000,
    month: seconds / 2592000,
    day: seconds / 86400,
    hour: seconds / 3600,
    minute: seconds / 60
  };

  let words = locales.prefix + separator;
  let distance = locales.seconds;
  let interval = 0;

  for (const key in intervals) {
    interval = Math.floor(intervals[key]);

    if (interval > 1) {
      distance = locales[key + "s"];
      break;
    } else if (interval === 1) {
      distance = locales[key];
      break;
    }
  }

  distance = distance.replace(/%d/i, interval.toString());
  words += distance + separator + locales.sufix;

  return words.trim();
}
