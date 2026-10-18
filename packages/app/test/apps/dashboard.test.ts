import nock from "nock";
import * as factory from "../factory.js";
import { app as deliverybot } from "../app.js";

const app = deliverybot.express;

function repo(name: string, archived = false) {
  return {
    name,
    archived,
    description: null,
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

  function repositories(page: number, list: any[], total: number) {
    nock("https://api.github.com")
      .get("/user/installations/1/repositories")
      .query({ page, per_page: 50 })
      .reply(200, { total_count: total, repositories: list });
  }

  it("hides archived repositories", async () => {
    repositories(1, [repo("active"), repo("old", true)], 2);
    factory.gql({ r0: { deployments: { totalCount: 0, nodes: [] } } });

    const response = await factory
      .request(app)
      .get("/Codertocat")
      .set("cookie", session);
    expect(response.status).toBe(200);
    expect(response.text).toContain('href="/Codertocat/active"');
    expect(response.text).not.toContain('href="/Codertocat/old"');
  });

  it("links the next page when archived repositories leave a page short", async () => {
    const page = Array.from({ length: 50 }, (_, i) => repo(`r${i}`, i > 0));
    repositories(1, page, 51);
    factory.gql({ r0: { deployments: { totalCount: 0, nodes: [] } } });

    const response = await factory
      .request(app)
      .get("/Codertocat")
      .set("cookie", session);
    expect(response.text).toContain('href="/Codertocat/r0"');
    expect(response.text).toContain("?after=2");
  });

  it("skips the deployment query when a page has only archived repositories", async () => {
    repositories(1, [repo("old", true)], 1);

    const response = await factory
      .request(app)
      .get("/Codertocat")
      .set("cookie", session);
    expect(response.status).toBe(200);
    expect(response.text).not.toContain('href="/Codertocat/old"');
  });
});
