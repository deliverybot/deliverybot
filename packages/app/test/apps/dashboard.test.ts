import nock from "nock";
import * as factory from "../factory.js";
import { app as deliverybot } from "../app.js";

const app = deliverybot.express;

function repo(name: string, archived = false) {
  return {
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

  afterEach(() => {
    factory.cleanAll();
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

  // Answers the deploy config check, where `configured` names the
  // repositories that have one, in the order the query asks for them.
  function configs(names: string[], configured: string[]) {
    const data: any = {};
    names.forEach((name, i) => {
      data[`r${i}`] = {
        object: configured.includes(name) ? { __typename: "Blob" } : null,
      };
    });
    nock("https://api.github.com")
      .post("/graphql", (body: any) => body.query.includes("deploy.yml"))
      .reply(200, { data });
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
    configs(["app", "docs"], ["app"]);
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
    configs(["app", "docs"], ["app"]);

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
    configs(["docs"], []);

    const response = await get("/Codertocat");
    expect(response.status).toBe(200);
    expect(response.text).toContain('href="/Codertocat?tab=setup"');
    expect(response.text).not.toContain('href="/Codertocat/docs"');
  });

  it("pages the configured repositories", async () => {
    const names = Array.from({ length: 51 }, (_, i) => `r${i}`);
    repositories(names.map((name) => repo(name)));
    configs(names, names);
    stats(1);

    const response = await get("/Codertocat?after=2");
    expect(response.text).toContain('href="/Codertocat/r50"');
    expect(response.text).not.toContain('href="/Codertocat/r0"');
    expect(response.text).toContain('href="/Codertocat?before=1"');
  });

  it("keeps the setup tab when paging", async () => {
    const names = Array.from({ length: 51 }, (_, i) => `r${i}`);
    repositories(names.map((name) => repo(name)));
    configs(names, []);

    const response = await get("/Codertocat?tab=setup");
    expect(response.text).toContain('href="/Codertocat?tab=setup&after=2"');
  });
});
