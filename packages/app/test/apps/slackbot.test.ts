import { parseRef } from "../../../slackbot/src/command";

describe("Slackbot", () => {
  describe(parseRef, () => {
    it(`matches dashes`, () => {
      const test = "foo/bar-baz@heads/master";
      expect(parseRef(test)).toMatchInlineSnapshot(`
        Object {
          "owner": "foo",
          "ref": "heads/master",
          "repo": "bar-baz",
        }
      `);
    });

    it(`matches normal`, () => {
      const test = "deliverybot/example@hello";
      expect(parseRef(test)).toMatchInlineSnapshot(`
        Object {
          "owner": "deliverybot",
          "ref": "hello",
          "repo": "example",
        }
      `);
    });

    it(`matches underscores`, () => {
      const test = "foo-baz_bar/bar-baz_foo@sha256";
      expect(parseRef(test)).toMatchInlineSnapshot(`
              Object {
                "owner": "foo-baz_bar",
                "ref": "sha256",
                "repo": "bar-baz_foo",
              }
          `);
    });
  });
});
