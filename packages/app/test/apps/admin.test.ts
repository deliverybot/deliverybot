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
      .get("/_/admin?tab=installations")
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
      .get("/_/admin?tab=installations")
      .set("cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.text).toContain("/_/admin/installations/77");
    expect(response.text).toContain("octo-org");
    expect(response.text).toMatch(/<td class="p-2">\s*3\s*<span/);

    const users = await factory
      .request(app)
      .get("/_/admin?tab=users")
      .set("cookie", cookie);
    // The sign in above recorded the user.
    expect(users.text).toContain("https://github.com/Codertocat");
  });

  it("marks installations with recent activity as active", async () => {
    const [, cookie] = await factory.login(app);
    const idle = await factory
      .request(app)
      .get("/_/admin?tab=installations")
      .set("cookie", cookie);
    expect(idle.text).toContain("None recorded");
    expect(idle.text).toContain('Label--secondary">Idle');
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
      .get("/_/admin?tab=installations")
      .set("cookie", cookie);
    expect(active.text).not.toContain("None recorded");
    expect(active.text).toContain('Label--success">Active');
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

  it("shows configured repositories per installation", async () => {
    const [, cookie] = await factory.login(app);
    const notChecked = await factory
      .request(app)
      .get("/_/admin?tab=installations")
      .set("cookie", cookie);
    expect(notChecked.text).toContain("Not checked");

    const active = { id: 5, nodeId: "R_5", fullName: "octo-org/active" };
    await store.setConfigured(active, 77, true);
    await store.markConfigsSynced(77);
    const index = await factory
      .request(app)
      .get("/_/admin?tab=installations")
      .set("cookie", cookie);
    expect(index.text).toContain("1 of them configured");
    expect(index.text).toMatch(/<td class="p-2">1<\/td>/);

    nock("https://api.github.com")
      .get("/installation/repositories")
      .query({ per_page: 50, page: 1 })
      .reply(200, {
        total_count: 2,
        repositories: [
          { id: 4, full_name: "octo-org/idle", private: false },
          { id: 5, full_name: "octo-org/active", private: false },
        ],
      });
    const page = await factory
      .request(app)
      .get("/_/admin/installations/77")
      .set("cookie", cookie);
    const configured = page.text.slice(
      page.text.indexOf('data-test="configured"'),
      page.text.indexOf('data-test="repositories"'),
    );
    expect(configured).toContain("octo-org/active");
    expect(configured).not.toContain("octo-org/idle");
    expect(page.text.match(/Label--success ml-1">Configured/g)).toHaveLength(1);
    await store.forgetRepositories([5]);
  });

  it("counts the app's deployments on the overview", async () => {
    const [, cookie] = await factory.login(app);
    const overview = () =>
      factory.request(app).get("/_/admin").set("cookie", cookie);
    const empty = await overview();
    expect(empty.status).toBe(200);
    expect(empty.text).toContain("No deployments recorded yet.");

    const repository = {
      id: 5,
      name: "active",
      full_name: "octo-org/active",
      owner: { login: "octo-org" },
    };
    const deployment = (id: number, appId = 1) => ({
      id,
      environment: "production",
      created_at: new Date().toISOString(),
      performed_via_github_app: { id: appId },
    });
    const receive = (name: string, payload: any) =>
      deliverybot.probot.receive({
        id: "1",
        name,
        payload: {
          action: "created",
          installation: { id: 77 },
          repository,
          ...payload,
        },
      } as any);

    await receive("deployment", { deployment: deployment(1) });
    // Made by another app.
    await receive("deployment", { deployment: deployment(2, 99) });
    // A status processed before its deployment keeps its state.
    await receive("deployment_status", {
      deployment: deployment(3),
      deployment_status: { state: "failure" },
    });
    await receive("deployment", { deployment: deployment(3) });
    // Superseding looks for older deployments.
    nock("https://api.github.com")
      .get("/repos/octo-org/active/deployments")
      .query(true)
      .reply(200, []);
    await receive("deployment_status", {
      deployment: deployment(1),
      deployment_status: { state: "success" },
    });
    // Replaced by a newer deployment, which doesn't undo the success.
    await receive("deployment_status", {
      deployment: deployment(1),
      deployment_status: { state: "inactive" },
    });

    const response = await overview();
    const deploys = response.text.slice(
      response.text.indexOf('data-test="deploys"'),
      response.text.indexOf('data-test="activity"'),
    );
    expect(deploys.match(/f2-light mb-0">2</g)).toHaveLength(4);
    expect(response.text).toContain("50%");
    expect(response.text).toContain("1 of 2 failed, 7 days");
    expect(response.text).toContain(
      '1 <span class="f4 color-fg-muted">of 1</span>',
    );
    expect(response.text).toContain('Label--success">success');
    expect(response.text).toContain('Label--danger">failure');
    expect(response.text).toMatch(
      /octo-org<\/strong><\/a><\/td>\s*<td class="p-2">2<\/td>/,
    );
    expect(response.text).toContain("2 deploys, 1 succeeded, 1 failed");
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
