import { beforeEach, describe, expect, it } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { usePermission } from "./usePermission";
import { useUserStore } from "../state/user-store";

const initialUserSnapshot = JSON.parse(JSON.stringify(useUserStore.getState().user));

describe("usePermission", () => {
  beforeEach(() => {
    useUserStore.setState({ user: JSON.parse(JSON.stringify(initialUserSnapshot)) });
  });

  it("denies config edit to basic users and grants it to supervisors", () => {
    const { result } = renderHook(() => usePermission("config", "edit"));

    expect(result.current).toBe(false);

    act(() => useUserStore.getState().setRole("supervisor"));

    expect(result.current).toBe(true);
  });

  it("grants user management access to supervisors and admins only", () => {
    const { result, rerender } = renderHook(() => usePermission("users", "read"));

    expect(result.current).toBe(false);

    act(() => useUserStore.getState().setRole("supervisor"));
    rerender();
    expect(result.current).toBe(true);

    act(() => useUserStore.getState().setRole("admin"));
    rerender();
    expect(result.current).toBe(true);
  });

  it("denies permissions resource access to supervisors but allows admins", () => {
    const { result, rerender } = renderHook(() => usePermission("permissions", "edit"));

    expect(result.current).toBe(false);

    act(() => useUserStore.getState().setRole("supervisor"));
    rerender();
    expect(result.current).toBe(false);

    act(() => useUserStore.getState().setRole("admin"));
    rerender();
    expect(result.current).toBe(true);
  });
});
