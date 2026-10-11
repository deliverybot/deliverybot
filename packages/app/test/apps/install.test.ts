import nock from "nock";
import * as factory from "../factory.js";
import { app as deliverybot } from "../app.js";
import { info, useOwnInstallUrl } from "../../src/index.js";

const app = deliverybot.express;

describe("Install link", () => {
  const original = info.install;
  afterEach(() => {
    info.install = original;
    factory.cleanAll();
  });

  it("points at the app this deployment runs as", async () => {
    nock("https://api.github.com").get("/app").reply(200, {
      slug: "deliverybot-staging",
      html_url: "https://github.com/apps/deliverybot-staging",
    });

    await useOwnInstallUrl(deliverybot.probot);

    expect(info.install).toEqual(
      "https://github.com/apps/deliverybot-staging/installations/new",
    );
    // Views read the same object through app.locals.
    expect(app.locals.info.install).toEqual(info.install);
  });

  it("keeps the default when the lookup fails", async () => {
    nock("https://api.github.com").get("/app").reply(500, {});

    await expect(useOwnInstallUrl(deliverybot.probot)).rejects.toThrow();
    expect(info.install).toEqual(original);
  });
});
