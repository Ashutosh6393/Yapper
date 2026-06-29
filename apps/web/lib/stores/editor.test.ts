import { beforeEach, describe, expect, it } from "vitest";
import { useEditorStore } from "./editor";

describe("useEditorStore", () => {
  beforeEach(() => useEditorStore.getState().reset());

  it("starts connecting / view-only / not kicked", () => {
    const s = useEditorStore.getState();
    expect(s.status).toBe("connecting");
    expect(s.permission).toBe("view");
    expect(s.privateKicked).toBe(false);
    expect(s.identity).toBeNull();
  });

  it("markPrivate moves to made_private and records the kick", () => {
    useEditorStore.getState().markPrivate();
    const s = useEditorStore.getState();
    expect(s.status).toBe("made_private");
    expect(s.privateKicked).toBe(true);
  });

  it("updates permission/status, and reset restores defaults", () => {
    const s = useEditorStore.getState();
    s.setPermission("edit");
    s.setStatus("connected");
    expect(useEditorStore.getState().permission).toBe("edit");
    expect(useEditorStore.getState().status).toBe("connected");

    useEditorStore.getState().reset();
    expect(useEditorStore.getState().permission).toBe("view");
    expect(useEditorStore.getState().status).toBe("connecting");
  });
});
