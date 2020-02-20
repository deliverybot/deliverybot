import * as fs from "fs";

export class KVStore {
  private store: { [k: string]: any } = {};

  constructor() {
    this.load();
  }

  async put<T>(key: string, val: T) {
    this.store[key] = val;
    this.flush();
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.store[key];
  }

  async del(key: string) {
    delete this.store[key];
    this.flush();
  }

  async list<T>(prefix: string): Promise<T[]> {
    return Object.keys(this.store)
      .filter(k => k.startsWith(prefix))
      .map(k => this.store[k]!);
  }

  clear() {
    this.store = {};
  }

  flush() {
    if (process.env.NODE_ENV === "test") {
      return;
    }
    fs.writeFileSync("tmp/db.json", JSON.stringify(this.store));
  }

  load() {
    if (process.env.NODE_ENV === "test") {
      return;
    }
    if (!fs.existsSync("tmp/db.json")) {
      return;
    }
    this.store = JSON.parse(fs.readFileSync("tmp/db.json").toString());
  }
}
