import type { ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SessionList from "./SessionList";
import { makeSessionSummary } from "../test/factories";
import { useUserStore } from "../state/user-store";

const initialUserSnapshot = JSON.parse(JSON.stringify(useUserStore.getState().user));

function setRole(role: "basic" | "supervisor" | "admin") {
  useUserStore.setState({
    user: {
      ...JSON.parse(JSON.stringify(initialUserSnapshot)),
      role
    }
  });
  useUserStore.getState().setRole(role);
}

function renderSessionList(overrides: Partial<ComponentProps<typeof SessionList>> = {}) {
  const props: ComponentProps<typeof SessionList> = {
    activeSessionId: null,
    sessions: [makeSessionSummary({ session_id: "s-1", title: "Sesion uno" })],
    isFetching: false,
    filters: { includeDeleted: false, scope: "mine" },
    onChangeFilters: vi.fn(),
    onRefresh: vi.fn(),
    onSelect: vi.fn(),
    onCreateNew: vi.fn(),
    onRenameSession: vi.fn(),
    onDeleteSession: vi.fn(),
    ...overrides
  };

  return {
    ...render(<SessionList {...props} />),
    props
  };
}

describe("components/SessionList", () => {
  beforeEach(() => {
    useUserStore.setState({ user: JSON.parse(JSON.stringify(initialUserSnapshot)) });
    vi.restoreAllMocks();
  });

  it("renders and triggers refresh/create/select callbacks", async () => {
    setRole("basic");
    const user = userEvent.setup();
    const { props } = renderSessionList();

    await user.click(screen.getByRole("button", { name: /Refrescar/i }));
    await user.click(screen.getByRole("button", { name: /Nueva/i }));
    await user.click(screen.getByRole("button", { name: /^Sesion uno\b/i }));

    expect(props.onRefresh).toHaveBeenCalledTimes(1);
    expect(props.onCreateNew).toHaveBeenCalledTimes(1);
    expect(props.onSelect).toHaveBeenCalledWith("s-1");
  });

  it("shows scope and deleted filters only for supervisors/admins", () => {
    setRole("basic");
    const basicRender = renderSessionList();
    expect(screen.queryByText("Alcance")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Mostrar eliminadas/i)).not.toBeInTheDocument();
    basicRender.unmount();

    setRole("supervisor");
    renderSessionList();
    expect(screen.getByText("Alcance")).toBeInTheDocument();
    expect(screen.getByLabelText(/Mostrar eliminadas/i)).toBeInTheDocument();
  });

  it("updates filters from scope select and deleted checkbox", async () => {
    setRole("supervisor");
    const user = userEvent.setup();
    const { props } = renderSessionList();

    await user.selectOptions(screen.getByRole("combobox"), "visible");
    expect(props.onChangeFilters).toHaveBeenCalledWith({
      includeDeleted: false,
      scope: "visible"
    });

    await user.click(screen.getByLabelText(/Mostrar eliminadas/i));
    expect(props.onChangeFilters).toHaveBeenCalledWith({
      includeDeleted: true,
      scope: "mine"
    });
  });

  it("uses prompt for rename and passes a trimmed title", async () => {
    setRole("admin");
    const user = userEvent.setup();
    const onRenameSession = vi.fn();
    vi.spyOn(window, "prompt").mockReturnValue("  Nuevo titulo  ");

    renderSessionList({
      sessions: [
        makeSessionSummary({
          session_id: "s-rename",
          title: "Renombrable",
          can_delete: false,
          can_rename: true
        })
      ],
      onRenameSession
    });

    const selectButton = screen.getByRole("button", { name: /^Renombrable\b/i });
    const card = selectButton.parentElement;
    expect(card).not.toBeNull();
    const renameButton = within(card as HTMLElement)
      .getAllByRole("button")
      .find((button) => button !== selectButton && !button.getAttribute("aria-label"));
    expect(renameButton).toBeTruthy();
    await user.click(renameButton as HTMLElement);

    expect(window.prompt).toHaveBeenCalled();
    expect(onRenameSession).toHaveBeenCalledWith("s-rename", "Nuevo titulo");
  });

  it("uses confirm for delete and only deletes when confirmed", async () => {
    setRole("admin");
    const user = userEvent.setup();
    const onDeleteSession = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm");

    renderSessionList({
      sessions: [
        makeSessionSummary({
          session_id: "s-del",
          title: "Borrar",
          can_delete: true,
          can_rename: false
        })
      ],
      onDeleteSession
    });

    confirmSpy.mockReturnValueOnce(false);
    await user.click(screen.getByRole("button", { name: /Eliminar sesi/i }));
    expect(onDeleteSession).not.toHaveBeenCalled();

    confirmSpy.mockReturnValueOnce(true);
    await user.click(screen.getByRole("button", { name: /Eliminar sesi/i }));
    expect(onDeleteSession).toHaveBeenCalledWith("s-del");
  });
});
