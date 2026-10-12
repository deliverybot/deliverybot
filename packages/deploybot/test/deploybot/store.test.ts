import { localServices } from "@deliverybot/core";
import { WatchStore } from "../../src/store.js";
import { Watch } from "../../src/types.js";

const watch = (id: string, sha: string, target = "production"): Watch =>
  ({
    id,
    sha,
    ref: "refs/heads/master",
    target,
    targetVal: {},
    repository: { id: 1 },
  }) as unknown as Watch;

describe("WatchStore", () => {
  let store: WatchStore;

  beforeEach(() => {
    store = new WatchStore(localServices().kvService);
  });

  test("a newer commit on the same ref replaces the older watch", async () => {
    await store.addWatch(1, watch("a", "sha1"));
    await store.addWatch(1, watch("b", "sha2"));

    expect(await store.listWatchBySha(1, "sha1")).toEqual([]);
    expect(await store.listWatchBySha(1, "sha2")).toEqual([watch("b", "sha2")]);
  });

  test("keeps watches for other targets", async () => {
    await store.addWatch(1, watch("a", "sha1", "staging"));
    await store.addWatch(1, watch("b", "sha2", "production"));

    expect(await store.listWatchBySha(1, "sha1")).toEqual([
      watch("a", "sha1", "staging"),
    ]);
  });

  test("deleting a replaced watch keeps track of the newest one", async () => {
    await store.addWatch(1, watch("a", "sha1"));
    await store.addWatch(1, watch("b", "sha2"));
    // The replaced watch finishing later must not forget about "b".
    await store.delWatch(1, watch("a", "sha1"));
    await store.addWatch(1, watch("c", "sha3"));

    expect(await store.listWatchBySha(1, "sha2")).toEqual([]);
    expect(await store.listWatchBySha(1, "sha3")).toEqual([watch("c", "sha3")]);
  });
});
