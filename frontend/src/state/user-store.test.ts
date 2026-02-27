import { beforeEach, describe, expect, it } from "vitest";
import { PERMISSIONS_BY_ROLE } from "../constants/permissions";
import { useUserStore } from "./user-store";

const initialUserSnapshot = JSON.parse(JSON.stringify(useUserStore.getState().user));

describe("state/user-store", () => {
  beforeEach(() => {
    useUserStore.setState({ user: JSON.parse(JSON.stringify(initialUserSnapshot)) });
  });

  it("starts with the demo user shape", () => {
    const user = useUserStore.getState().user;

    expect(user.id).toBe("u-demo");
    expect(user.role).toBe("basic");
    expect(user.permissions).toEqual(PERMISSIONS_BY_ROLE.basic);
  });

  it("updates role and permissions together", () => {
    const store = useUserStore.getState();
    store.setRole("supervisor");

    const user = useUserStore.getState().user;
    expect(user.role).toBe("supervisor");
    expect(user.permissions).toEqual(PERMISSIONS_BY_ROLE.supervisor);
  });

  it("updates name, materias and quota without losing other fields", () => {
    const store = useUserStore.getState();

    store.setName("Ana");
    store.setMaterias(["Civil"]);
    store.setQuota(42);

    const user = useUserStore.getState().user;
    expect(user.name).toBe("Ana");
    expect(user.materias).toEqual(["Civil"]);
    expect(user.quota).toBe(42);
    expect(user.role).toBe("basic");
  });
});
