import { Installation } from "../services.js";

export class InstallationStore {
  private installations: { [id: number]: Installation } = {};

  async upsert(installation: Installation): Promise<void> {
    this.installations[installation.id] = installation;
  }

  async get(id: number): Promise<Installation | undefined> {
    return this.installations[id];
  }

  async delete(id: number): Promise<void> {
    delete this.installations[id];
  }
}
