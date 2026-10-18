import nock from "nock";
import * as factory from "../factory.js";
import { app as deliverybot, services } from "../app.js";

const app = deliverybot.express;
const store = services.installationService();

// Repository ids by name, so configured repositories can be stored by id.
const ids: { [name: string]: number } = {};

function repo(name: string, archived = false) {
  ids[name] = ids[name] || Object.keys(ids).length + 1000;
  return {
    id: ids[name],
    name,
    archived,
    description: null,
    default_branch: "main",
    owner: { login: "Codertocat" },
  };
}

describe("Dashboard", () => {
  let session: string;

  beforeAll(async () => {
    await deliverybot.loaded();
  });

  afterEach(async () => {
    factory.cleanAll();
    await store.forgetRepositories(Object.values(ids));
  });

  beforeEach(async () => {
    [, session] = await factory.login(app);
    nock("https://api.github.com")
      .get("/user/installations")
      .reply(200, {
        total_count: 1,
        installations: [
          {
            id: 1,
            account: { login: "Codertocat", type: "User", id: 1 },
            target_type: "User",
            html_url: "https://github.com/settings/installations/1",
          },
        ],
      });
  });

  function repositories(list: any[]) {
    nock("https://api.github.com")
      .get("/user/installations/1/repositories")
      .query({ per_page: 100 })
      .reply(200, { total_count: list.length, repositories: list });
  }

  // Marks the named repositories, made by `repo`, as configured.
  async function configs(names: string[]) {
    for (const name of names) await store.setConfigured(ids[name], 1, true);
  }

  function stats(count: number) {
    const data: any = {};
    for (let i = 0; i < count; i++) {
      data[`r${i}`] = { deployments: { totalCount: 0, nodes: [] } };
    }
    nock("https://api.github.com")
      .post("/graphql", (body: any) => body.query.includes("deployments"))
      .reply(200, { data });
  }

  // Fetches a page with the HTML entities Handlebars escapes in links
  // decoded.
  async function get(path: string) {
    const response = await factory
      .request(app)
      .get(path)
      .set("cookie", session);
    return {
      status: response.status,
      text: response.text.replace(/&#x3D;/g, "=").replace(/&amp;/g, "&"),
    };
  }

  it("lists only configured repositories, leaving out archived ones", async () => {
    repositories([repo("app"), repo("docs"), repo("old", true)]);
    await configs(["app"]);
    stats(1);

    const response = await get("/Codertocat");
    expect(response.status).toBe(200);
    expect(response.text).toContain('href="/Codertocat/app"');
    expect(response.text).not.toContain('href="/Codertocat/docs"');
    expect(response.text).not.toContain('href="/Codertocat/old"');
    expect(nock.isDone()).toBe(true);
  });

  it("lists repositories without a deploy config to set up", async () => {
    repositories([repo("app"), repo("docs"), repo("old", true)]);
    await configs(["app"]);

    const response = await get("/Codertocat?tab=setup");
    expect(response.status).toBe(200);
    expect(response.text).toContain('href="/Codertocat/docs"');
    expect(response.text).toContain(
      "https://github.com/Codertocat/docs/new/main?filename=.github%2Fdeploy.yml",
    );
    expect(response.text).not.toContain('href="/Codertocat/app"');
    expect(response.text).not.toContain('href="/Codertocat/old"');
  });

  it("points to the setup tab when no repository is configured", async () => {
    repositories([repo("docs")]);

    const response = await get("/Codertocat");
    expect(response.status).toBe(200);
    expect(response.text).toContain('href="/Codertocat?tab=setup"');
    expect(response.text).not.toContain('href="/Codertocat/docs"');
  });

  it("pages the configured repositories", async () => {
    const names = Array.from({ length: 51 }, (_, i) => `r${i}`);
    repositories(names.map((name) => repo(name)));
    await configs(names);
    stats(1);

    const response = await get("/Codertocat?after=2");
    expect(response.text).toContain('href="/Codertocat/r50"');
    expect(response.text).not.toContain('href="/Codertocat/r0"');
    expect(response.text).toContain('href="/Codertocat?before=1"');
  });

  it("keeps the setup tab when paging", async () => {
    const names = Array.from({ length: 51 }, (_, i) => `r${i}`);
    repositories(names.map((name) => repo(name)));

    const response = await get("/Codertocat?tab=setup");
    expect(response.text).toContain('href="/Codertocat?tab=setup&after=2"');
  });
});
