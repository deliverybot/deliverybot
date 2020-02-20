import { dateInWords, isoDate, distanceInWords } from "../util";

export interface Measure {
  createdAt: Date;
  deployedAt: Date | null;
  startedAt: Date | null;
  committedAt: Date;
  env: string;
  state: string;
}

export class Measurements {
  days: number;
  end: Date;
  start: Date;
  measures: Measure[];

  constructor(start: Date, end: Date, measures: Measure[]) {
    this.measures = measures;
    this.start = new Date(start.getTime());
    this.end = new Date(end.getTime());
    this.start.setHours(0, 0, 0);
    this.end.setHours(0, 0, 0);

    this.days =
      Math.ceil(
        (this.end.getTime() - this.start.getTime()) / (1000 * 3600 * 24),
      ) + 1;
  }

  get environments(): string[] {
    return this.measures
      .map(m => m.env)
      .filter((x, i, a) => a.indexOf(x) === i)
      .sort();
  }

  eachDay(cb: (day: Date) => void) {
    for (let dayAgo = 0; dayAgo <= this.days; dayAgo++) {
      const day = new Date(this.start.getTime());
      day.setDate(this.start.getDate() + dayAgo);
      cb(day);
    }
  }

  get range(): [string, string] {
    return [isoDate(this.start), isoDate(this.end)];
  }

  get allDays(): string[] {
    const days: string[] = [];
    this.eachDay(day => {
      days.push(isoDate(day));
    });
    return days;
  }

  get allDaysWords(): string[] {
    const days: string[] = [];
    this.eachDay(day => {
      days.push(dateInWords(day));
    });
    return days;
  }

  get totalDeploys(): number {
    return this.measures.length;
  }

  get totalLeadTimeSec(): number {
    return this.measures.reduce((val, m, i, arr) => {
      if (m.deployedAt) {
        return (
          val +
          Math.floor((m.deployedAt.getTime() - m.committedAt.getTime()) / 1000)
        );
      }
      return val;
    }, 0);
  }

  get avgDeploysPerDayWords(): string {
    return `${this.avgDeploysPerDay.toFixed(1)}`;
  }

  get avgDeploysPerDay(): number {
    return this.totalDeploys / this.days;
  }

  get avgLeadTimeSec(): number {
    return this.totalLeadTimeSec / this.totalDeploys;
  }

  get avgLeadTimeWords(): string {
    return distanceInWords(this.avgLeadTimeSec);
  }

  get deploysByDay(): { [d: string]: number } {
    const days: { [d: string]: number } = {};
    for (const day of this.allDays) {
      days[day] = this.measures.filter(
        d => isoDate(d.createdAt) === day,
      ).length;
    }
    return days;
  }

  get deploysByEnv(): { [d: string]: number } {
    const envs: { [d: string]: number } = {};
    for (const env of this.environments) {
      envs[env] = this.measures.filter(d => d.env === env).length;
    }
    return envs;
  }

  get deploysByDayAndEnv(): { [d: string]: number } {
    const results: { [d: string]: number } = {};
    for (const env of this.environments) {
      for (const day of this.allDays) {
        results[`${day}.${env}`] = this.measures.filter(
          d => d.env === env && isoDate(d.createdAt) === day,
        ).length;
      }
    }
    return results;
  }

  toJSON(): any {
    const obj: any = {};
    for (const key in this) {
      const val = this[key];
      if (typeof val === "function") {
        continue;
      }
      obj[key] = val;
    }
    return obj;
  }
}
