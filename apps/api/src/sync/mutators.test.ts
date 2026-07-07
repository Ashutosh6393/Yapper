import { expect, test } from "bun:test";
import { mutationNameSchema } from "@yapper/schemas";
import { serverMutators } from "./mutators";

test("server-mutator registry covers exactly the 14 canonical names (goal #2)", () => {
  const names = mutationNameSchema.options;
  expect(Object.keys(serverMutators).sort()).toEqual([...names].sort());
  for (const name of names) {
    expect(typeof serverMutators[name]).toBe("function");
  }
});
