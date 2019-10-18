import * as factory from "../factory";
import { deliverybot } from "../../src";

const app = deliverybot.express;

describe("Deploy", () => {
  let session: string;

  beforeAll(async () => {
    await deliverybot.loaded()
  });

  afterEach(() => {
    factory.cleanAll();
  });

  beforeEach(async () => {
    session = await factory.login(app);
    factory.config({ valid: true });
    factory.permission({ admin: true });
    factory.repo();
  });

  it("gets commits", async () => {
    factory.commitsMinimalGql();

    const response = await factory.request(app)
      .get("/Codertocat/Hello-World/target/production/branch/master")
      .set("cookie", session);
    expect(response.status).toBe(200);
  });

  it("gets commits full", async () => {
    factory.commitsFullGql();

    const response = await factory.request(app)
      .get("/Codertocat/Hello-World/target/production/branch/master")
      .set("cookie", session);
    expect(response.status).toBe(200);
  });

  it("gets commit", async () => {
    factory.commitMinimalGql();

    const response = await factory.request(app)
      .get("/Codertocat/Hello-World/target/production/branch/master/o/foobar")
      .set("cookie", session);
    expect(response.status).toBe(200);
  });

  it("gets commit", async () => {
    factory.commitFullGql();

    const response = await factory.request(app)
      .get("/Codertocat/Hello-World/target/production/branch/master/o/foobar")
      .set("cookie", session);
    expect(response.status).toBe(200);
  });
});
