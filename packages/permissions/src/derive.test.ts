import { expect, test } from "bun:test";
import { effectivePermission, type PermissionNote } from "./derive";

const OWNER = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

function noteWith(access: PermissionNote["access"]): PermissionNote {
  return { ownerId: OWNER, access, trashedAt: null };
}

test("owner always gets edit, regardless of access level or collaborator flag", () => {
  expect(effectivePermission(OWNER, noteWith("private"), false)).toBe("edit");
  expect(effectivePermission(OWNER, noteWith("view"), false)).toBe("edit");
  expect(effectivePermission(OWNER, noteWith("edit"), false)).toBe("edit");
});

test("private note grants nobody but the owner any access", () => {
  expect(effectivePermission(OTHER, noteWith("private"), true)).toBe("none");
  expect(effectivePermission(OTHER, noteWith("private"), false)).toBe("none");
});

test("a non-collaborator gets none even on a shared note", () => {
  expect(effectivePermission(OTHER, noteWith("view"), false)).toBe("none");
  expect(effectivePermission(OTHER, noteWith("edit"), false)).toBe("none");
});

test("an active collaborator inherits the note-level access role", () => {
  expect(effectivePermission(OTHER, noteWith("view"), true)).toBe("view");
  expect(effectivePermission(OTHER, noteWith("edit"), true)).toBe("edit");
});

test("a trashed note grants non-owners none, even active collaborators on an edit note", () => {
  const trashed: PermissionNote = { ownerId: OWNER, access: "edit", trashedAt: new Date() };
  expect(effectivePermission(OTHER, trashed, true)).toBe("none");
});

test("the owner still gets edit on a trashed note", () => {
  const trashed: PermissionNote = { ownerId: OWNER, access: "edit", trashedAt: new Date() };
  expect(effectivePermission(OWNER, trashed, false)).toBe("edit");
});
