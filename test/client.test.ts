import { GoogleCloudClient as BuildClient } from "../src/clients/exec";
import { GoogleCloudClient as SecretClient } from "../src/clients/secrets";

describe("Deployment Provider", () => {
  jest.setTimeout(30000);

  test("hello", () => {
    expect(true).toBe(true);
  });

  if (process.env.INTEGRATION) {
    test("can store secrets", async () => {
      const client = new SecretClient();
      await client.set("foo", [{ name: "test", value: "test" }]);
      const val = await client.get("foo");
      expect(val).toEqual([{ name: "test", value: "test" }]);
    });
    test("can create a build", async done => {
      const client = new BuildClient();
      const resp = await client.exec({
        id: "test",
        args: ["echo", "hello"],
        env: [],
        secrets: [{ name: "TEST", value: "FOO" }],
        image: "docker.io/ubuntu"
      });
      console.log(resp);

      await sleep(5000);

      const logs = await client.logs("test");
      console.log(logs);
      done();
    });
  }
});

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
