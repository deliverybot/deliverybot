import nock from "nock";
import * as factory from "../factory.js";
import { app as deliverybot, services } from "../app.js";
import { parseLogins } from "../../src/apps/admin.js";

const app = deliverybot.express;
const store = services.installationService();

async function loginAs(login: string) {
  factory.oauthToken();
  nock("https://api.github.com").get("/user").reply(200, { id: 99, login });
  const response = await factory.request(app).get("/login/cb?code=foo");
  return response.get("set-cookie")[0];
}

describe("Admin", () => {
  beforeEach(async () => {
    await store.upsert({
      id: 77,
      account: "octo-org",
      accountType: "Organization",
      repositorySelection: "selected",
      suspended: false,
    });
  });

  afterEach(async () => {
    await store.delete(77);
    factory.cleanAll();
  });

  it("parses admin logins", () => {
    expect([...parseLogins(" Foo,bar  baz,,")]).toEqual(["foo", "bar", "baz"]);
    expect(parseLogins(undefined).size).toBe(0);
  });

  it("redirects signed out visitors to login", async () => {
    const response = await factory.request(app).get("/_/admin");
    expect(response.status).toBe(302);
    expect(response.get("location")).toEqual("/login");
  });

  it("hides the dashboard from other users", async () => {
    const cookie = await loginAs("someone-else");
    const index = await factory
      .request(app)
      .get("/_/admin")
      .set("cookie", cookie);
    expect(index.status).toBe(404);
    const detail = await factory
      .request(app)
      .get("/_/admin/installations/77")
      .set("cookie", cookie);
    expect(detail.status).toBe(404);
  });

  it("lists installations, repository counts and users", async () => {
    const [, cookie] = await factory.login(app);
    await store.setRepositoryCount(77, 3);

    const response = await factory
      .request(app)
      .get("/_/admin")
      .set("cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.text).toContain("/_/admin/installations/77");
    expect(response.text).toContain("octo-org");
    expect(response.text).toMatch(/<td class="p-2">\s*3\s*<span/);
    // The sign in above recorded the user.
    expect(response.text).toContain("https://github.com/Codertocat");
  });

  it("marks installations with recent activity as active", async () => {
    const [, cookie] = await factory.login(app);
    const idle = await factory
      .request(app)
      .get("/_/admin")
      .set("cookie", cookie);
    expect(idle.text).toContain("None recorded");
    expect(idle.text).toContain('Label--gray">Idle');
    expect(idle.text).toContain("0 active in the last 30 days");

    await deliverybot.probot.receive({
      id: "1",
      name: "star",
      payload: {
        action: "created",
        installation: { id: 77 },
        repository: { id: 5, full_name: "octo-org/active" },
      },
    } as any);
    const active = await factory
      .request(app)
      .get("/_/admin")
      .set("cookie", cookie);
    expect(active.text).not.toContain("None recorded");
    expect(active.text).toContain('Label--green">Active');
    expect(active.text).toContain("1 active in the last 30 days");
  });

  it("shows repositories with their latest activity", async () => {
    const [, cookie] = await factory.login(app);
    await deliverybot.probot.receive({
      id: "1",
      name: "star",
      payload: {
        action: "created",
        installation: { id: 77 },
        repository: { id: 5, full_name: "octo-org/active" },
      },
    } as any);
    nock("https://api.github.com")
      .get("/installation/repositories")
      .query({ per_page: 50, page: 1 })
      .reply(200, {
        total_count: 120,
        repositories: [
          { id: 4, full_name: "octo-org/idle", private: true },
          { id: 5, full_name: "octo-org/active", private: false },
        ],
      });

    const response = await factory
      .request(app)
      .get("/_/admin/installations/77")
      .set("cookie", cookie);
    expect(response.status).toBe(200);
    const active = response.text.indexOf("octo-org/active");
    const idle = response.text.indexOf("octo-org/idle");
    expect(active).toBeGreaterThan(-1);
    expect(idle).toBeGreaterThan(active);
    expect(response.text).toContain("<code>star.created</code>");
    expect(response.text).toContain("None recorded");
    expect(response.text).toContain("120 repositories");
    expect(response.text).toContain('href="/_/admin/installations/77?after=2"');
  });

  it("pages through repositories", async () => {
    const [, cookie] = await factory.login(app);
    nock("https://api.github.com")
      .get("/installation/repositories")
      .query({ per_page: 50, page: 3 })
      .reply(200, {
        total_count: 120,
        repositories: [{ id: 9, full_name: "octo-org/last", private: false }],
      });

    const response = await factory
      .request(app)
      .get("/_/admin/installations/77?after=3")
      .set("cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.text).toContain("octo-org/last");
    expect(response.text).toContain(
      'href="/_/admin/installations/77?before=2"',
    );
    expect(response.text).not.toContain("?after=4");
  });

  it("returns 404 for unknown installations", async () => {
    const [, cookie] = await factory.login(app);
    const response = await factory
      .request(app)
      .get("/_/admin/installations/12345")
      .set("cookie", cookie);
    expect(response.status).toBe(404);
  });
});
