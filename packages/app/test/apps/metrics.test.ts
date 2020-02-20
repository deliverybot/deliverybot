import { Measurements, Measure } from "../../src/apps/deploy/metrics";
import { Measures } from "../../src/apps/deploy/queries";

const start = new Date("2019-10-28T00:00:00.460Z");
const end = new Date("2019-11-04T00:00:00.460Z");

const measures: Measure[] = require("../fixtures/measures.json").map(
  (m: any) => {
    m.deployedAt = m.deployedAt && new Date(Date.parse(m.deployedAt));
    m.createdAt = new Date(Date.parse(m.createdAt));
    m.committedAt = new Date(Date.parse(m.committedAt));
    return m;
  },
);
const query = require("../fixtures/metrics.json");

describe("Measurements", () => {
  it("loads measurements", () => {
    const m = new Measurements(start, end, measures);
    expect(m.toJSON()).toMatchSnapshot();
  });
  it("loads query", () => {
    expect(Measures(query, start, end)).toMatchSnapshot();
  });
  it("loads measurements from query", () => {
    const m = new Measurements(start, end, Measures(query, start, end));
    expect(m.toJSON()).toMatchSnapshot();
  });
});
