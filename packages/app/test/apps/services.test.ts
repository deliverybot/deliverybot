import "../factory.js";
import { services } from "../app.js";

describe("Services", () => {
  it("counts sequentially", async () => {
    const l = services.lockService();

    let val = 0;
    const count = () =>
      l.lock("count", () => {
        val += 1;
        return Promise.resolve();
      });

    await Promise.all([count(), count(), count(), count()]);

    expect(val).toEqual(4);
  });
});
