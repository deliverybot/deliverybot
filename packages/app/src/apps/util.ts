import objectHash from "object-hash";
import yaml from "js-yaml";
import { Dependencies } from "@deliverybot/core";

export function yamlEncode(data: any) {
  try {
    return yaml.dump(data);
  } catch (error) {
    return null;
  }
}

export const hash = (a: any): string => objectHash(a);

const example = `# View examples and documentation at https://deliverybot.dev/docs/
production:
  environment: production
  production_environment: true
`;

export function newDeployFileUrl(owner: string, repo: string) {
  const encoded = encodeURIComponent(example);
  const filepath = encodeURIComponent(".github/deploy.yml");
  return `https://github.com/${owner}/${repo}/new/master?filename=${filepath}&value=${encoded}`;
}

export function editDeployFileUrl(owner: string, repo: string) {
  const filepath = ".github/deploy.yml";
  return `https://github.com/${owner}/${repo}/edit/master/${filepath}`;
}

export function isoDate(day: Date) {
  return day.toISOString().split("T")[0];
}

export function today() {
  return new Date();
}

export function daysAgo(day: Date, daysAgo: number) {
  const ago = new Date(day.getTime());
  ago.setDate(day.getDate() - daysAgo);
  return ago;
}

export function dateInWords(day: Date) {
  return `${day.getMonth() + 1}/${day.getDate()}`;
}

export function distanceInWords(seconds: number) {
  if (isNaN(seconds)) {
    return "0s";
  }
  if (seconds > 86400) {
    // Days
    return `${Math.floor(seconds / 86400)}d`;
  }
  if (seconds > 3600) {
    // Hours
    return `${Math.floor(seconds / 3600)}h`;
  }
  if (seconds > 60) {
    // Mins
    return `${Math.floor(seconds / 60)}m`;
  }
  return `${Math.floor(seconds)}s`;
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
    years: "%d years",
  };
  const seconds = Math.floor((Date.now() - timeAgo) / 1000);
  const separator = locales.separator || " ";
  const intervals: { [k: string]: number } = {
    year: seconds / 31536000,
    month: seconds / 2592000,
    day: seconds / 86400,
    hour: seconds / 3600,
    minute: seconds / 60,
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

export const branch = {
  encode(b: string): string {
    return b.replace(/\//g, "%20");
  },
  decode(a: string): string {
    return a.replace(/ /g, "/").replace(/%20/g, "/");
  },
};

export function util({ registerHelper }: Dependencies) {
  registerHelper("json", (ctx: any) => JSON.stringify(ctx));
  registerHelper("branchencode", (ctx: any) => branch.encode(ctx));
}
