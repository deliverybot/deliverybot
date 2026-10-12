import { resolveInputs } from "../../src/inputs.js";
import { ConfigError, Target } from "../../src/types.js";

const target = {
  name: "production",
  inputs: {
    version: { required: true },
    dry_run: { type: "boolean", default: false },
    region: { type: "choice", options: ["eu", "us"], default: "eu" },
    replicas: { type: "number" },
    notes: {},
  },
} as unknown as Target;

describe("resolveInputs", () => {
  test("returns nothing for a target without inputs", () => {
    expect(resolveInputs({ name: "plain" } as Target)).toBeUndefined();
  });

  test("rejects inputs a target doesn't declare", () => {
    expect(() =>
      resolveInputs({ name: "plain" } as Target, { version: "1" }),
    ).toThrow(ConfigError);
    expect(() => resolveInputs(target, { version: "1", nope: "x" })).toThrow(
      'Target "production" does not declare input "nope"',
    );
  });

  test("fills in defaults and coerces types", () => {
    expect(
      resolveInputs(target, { version: "1.2.3", replicas: "3", dry_run: "on" }),
    ).toEqual({ version: "1.2.3", dry_run: true, region: "eu", replicas: 3 });
  });

  test("reads an unchecked checkbox as false", () => {
    expect(
      resolveInputs(
        {
          name: "t",
          inputs: { dry_run: { type: "boolean", default: true } },
        } as unknown as Target,
        { dry_run: "false" },
      ),
    ).toEqual({ dry_run: false });
  });

  test("requires required inputs", () => {
    expect(() => resolveInputs(target, {})).toThrow(
      'Input "version" is required',
    );
    expect(() => resolveInputs(target, { version: "" })).toThrow(
      'Input "version" is required',
    );
  });

  test("validates values", () => {
    expect(() => resolveInputs(target, { version: "1", region: "ap" })).toThrow(
      'Input "region" must be one of: eu, us',
    );
    expect(() =>
      resolveInputs(target, { version: "1", replicas: "many" }),
    ).toThrow('Input "replicas" must be a number');
    expect(() =>
      resolveInputs(target, { version: "1", dry_run: "yes" }),
    ).toThrow('Input "dry_run" must be true or false');
  });
});
