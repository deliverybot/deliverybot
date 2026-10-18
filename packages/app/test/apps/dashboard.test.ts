import nock from "nock";
import * as factory from "../factory.js";
import { app as deliverybot, services } from "../app.js";

const app = deliverybot.express;
const store = services.installationService();

// Repository ids by name, so the same name always gets the same id.
const ids: { [name: string]: number } = {};

function repo(name: string, archived = false) {
  ids[name] = ids[name] || Object.keys(ids).length + 1000;
  return {
    id: ids[name],
    node_id: `R_${name}`,
    name,
    archived,
    description: null,
    default_branch: "main",
    owner: { login: "Codertocat" },
  };
}

// The repository as the GraphQL nodes query returns it.
function node(name: string, archived = false) {
  return {
    name,
    owner: { login: "Codertocat" },
    description: null,
    isArchived: archived,
    deployments: { totalCount: 0, nodes: [] },
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

  // Stores the named repositories as configured.
  async function configs(names: string[]) {
    for (const name of names) {
      const r = repo(name);
      await store.setConfigured(
        { id: r.id, nodeId: r.node_id, fullName: `Codertocat/${name}` },
        1,
        true,
      );
    }
  }

  // Answers the nodes query for `names` with `nodes`, checking it asks for
  // exactly those repositories.
  function nodes(names: string[], result: any[]) {
    nock("https://api.github.com")
      .post("/graphql", (body: any) => {
        expect(body.variables.ids).toEqual(names.map((n) => `R_${n}`));
        return true;
      })
      .reply(200, { data: { nodes: result } });
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

  it("lists configured repositories without listing every repository", async () => {
    await configs(["app", "gone", "old"]);
    // The user can't see "gone", and "old" was archived.
    nodes(["app", "gone", "old"], [node("app"), null, node("old", true)]);

    const response = await get("/Codertocat");
    expect(response.status).toBe(200);
    expect(response.text).toContain('href="/Codertocat/app"');
    expect(response.text).not.toContain('href="/Codertocat/gone"');
    expect(response.text).not.toContain('href="/Codertocat/old"');
    expect(nock.isDone()).toBe(true);
  });

  it("lists repositories without a deploy config to set up", async () => {
    await configs(["app"]);
    repositories([repo("app"), repo("docs"), repo("old", true)]);

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
    const response = await get("/Codertocat");
    expect(response.status).toBe(200);
    expect(response.text).toContain('href="/Codertocat?tab=setup"');
  });

  it("pages the configured repositories", async () => {
    const names = Array.from({ length: 51 }, (_, i) => `r${i}`);
    await configs(names);
    // Stored repositories are listed by name, so r9 sorts last.
    nodes(["r9"], [node("r9")]);

    const response = await get("/Codertocat?after=2");
    expect(response.text).toContain('href="/Codertocat/r9"');
    expect(response.text).toContain('href="/Codertocat?before=1"');
  });

  it("keeps the setup tab when paging", async () => {
    const names = Array.from({ length: 51 }, (_, i) => `r${i}`);
    repositories(names.map((name) => repo(name)));

    const response = await get("/Codertocat?tab=setup");
    expect(response.text).toContain('href="/Codertocat?tab=setup&after=2"');
  });
});
