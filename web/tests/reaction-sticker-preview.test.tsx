import { create } from "@bufbuild/protobuf";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReactionView from "@/components/MemoReactionListView/ReactionView";
import { State } from "@/types/proto/api/v1/common_pb";
import { MemoSchema } from "@/types/proto/api/v1/memo_service_pb";
import { UserSchema } from "@/types/proto/api/v1/user_service_pb";

const actions = vi.hoisted(() => ({ click: vi.fn(), canReact: true }));
vi.mock("@/components/MemoReactionListView/hooks", () => ({
  useReactionActions: () => ({ hasReacted: () => false, handleReactionClick: actions.click, canReact: actions.canReact }),
}));
vi.mock("@/hooks/useCurrentUser", () => ({ default: () => undefined }));
vi.mock("@/contexts/InstanceContext", () => ({
  useInstance: () => ({
    memoRelatedSetting: { reactionStickers: { "sticker:wave": { name: "Wave", image: "data:image/png;base64,test" } } },
  }),
}));
vi.mock("@/utils/i18n", () => ({
  useTranslate: () => (key: string, params?: { count: number }) => (key === "memo.reaction-count" ? `${params?.count} 次表态` : key),
  findNearestMatchedLanguage: () => "en",
}));

beforeEach(() => {
  actions.click.mockClear();
  actions.canReact = true;
});

afterEach(() => vi.useRealTimers());

const touch = { pointerType: "touch", pointerId: 1, clientX: 20, clientY: 20 };

function hold() {
  act(() => vi.advanceTimersByTime(500));
}

describe("sticker reaction preview", () => {
  it("shows the same total reaction count in the emoji button and preview", () => {
    vi.useFakeTimers();
    const users = [create(UserSchema, { name: "users/1", displayName: "管理员", username: "admin" })];
    render(<ReactionView memo={create(MemoSchema)} reactionType="😡" users={users} anonymousCount={2} />);
    const trigger = screen.getByRole("button", { name: /😡\s*3/ });
    fireEvent.pointerDown(trigger, touch);
    hold();
    const preview = document.querySelector("[data-slot=tooltip-content]")!;
    expect(preview).toHaveClass("bg-popover", "text-popover-foreground", "max-w-64");
    expect(preview.querySelector("span")).toHaveClass("text-4xl");
    expect(preview.querySelector("span")).toHaveTextContent("😡");
    expect(preview.querySelector("p")?.textContent).toBe("3 次表态");
    expect(actions.click).not.toHaveBeenCalled();
  });

  it("previews on long press and suppresses the click after release, while allowing the next tap", () => {
    vi.useFakeTimers();
    render(<ReactionView memo={create(MemoSchema)} reactionType="sticker:wave" users={[]} anonymousCount={1} />);
    const trigger = screen.getByRole("button", { name: /Wave\s*1/ });
    fireEvent.pointerDown(trigger, touch);
    expect(document.querySelector("[data-slot=tooltip-content]")).toBeNull();
    hold();
    expect(document.querySelector("[data-slot=tooltip-content] img")).toHaveAttribute("src", "data:image/png;base64,test");
    expect(document.querySelector("[data-slot=tooltip-content] p")).toHaveTextContent("Wave");
    expect(document.querySelector("[data-slot=tooltip-content]")).toHaveTextContent("1 次表态");
    expect(fireEvent.contextMenu(trigger)).toBe(false);
    fireEvent.pointerUp(trigger, touch);
    fireEvent.click(trigger);
    expect(actions.click).not.toHaveBeenCalled();
    act(() => vi.runOnlyPendingTimers());
    expect(document.querySelector("[data-slot=tooltip-content]")).toBeNull();

    fireEvent.pointerDown(trigger, touch);
    fireEvent.pointerUp(trigger, touch);
    fireEvent.click(trigger);
    expect(actions.click).toHaveBeenCalledExactlyOnceWith("sticker:wave");
    hold();
    expect(document.querySelector("[data-slot=tooltip-content]")).toBeNull();
  });

  it.each(["pointerMove", "pointerCancel", "pointerLeave"] as const)("cancels long press on %s", (event) => {
    vi.useFakeTimers();
    render(<ReactionView memo={create(MemoSchema)} reactionType="sticker:wave" users={[]} />);
    const trigger = screen.getByRole("button", { name: /Wave/ });
    fireEvent.pointerDown(trigger, touch);
    fireEvent[event](trigger, { ...touch, clientY: 40 });
    hold();
    expect(document.querySelector("[data-slot=tooltip-content]")).toBeNull();
    expect(actions.click).not.toHaveBeenCalled();
  });

  it("allows long pressing archived reactions without permission to react", () => {
    vi.useFakeTimers();
    actions.canReact = false;
    render(<ReactionView memo={create(MemoSchema, { state: State.ARCHIVED })} reactionType="sticker:wave" users={[]} />);
    const trigger = screen.getByRole("img", { name: "Wave" }).closest("[data-slot=tooltip-trigger]")!;
    fireEvent.pointerDown(trigger, touch);
    hold();
    expect(document.querySelector("[data-slot=tooltip-content] img")).toBeInTheDocument();
    fireEvent.pointerUp(trigger, touch);
    fireEvent.click(trigger);
    expect(actions.click).not.toHaveBeenCalled();
  });

  it("previews the image on hover without adding a reaction or extra controls", async () => {
    render(<ReactionView memo={create(MemoSchema)} reactionType="sticker:wave" users={[]} anonymousCount={1} />);
    const trigger = screen.getByRole("button", { name: /Wave\s*1/ });
    expect(screen.getAllByRole("button")).toHaveLength(1);
    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
    fireEvent.mouseOver(trigger);
    fireEvent.mouseMove(trigger);
    fireEvent.mouseEnter(trigger);
    await waitFor(() =>
      expect(document.querySelector("[data-slot=tooltip-content] img")).toHaveAttribute("src", "data:image/png;base64,test"),
    );
    expect(actions.click).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(actions.click).toHaveBeenCalledWith("sticker:wave");
  });

  it("allows hovering archived reactions without permission to react", async () => {
    actions.canReact = false;
    render(<ReactionView memo={create(MemoSchema, { state: State.ARCHIVED })} reactionType="sticker:wave" users={[]} />);
    const trigger = screen.getByRole("img", { name: "Wave" }).closest("[data-slot=tooltip-trigger]")!;
    fireEvent.pointerEnter(trigger, { pointerType: "mouse" });
    fireEvent.mouseOver(trigger);
    fireEvent.mouseMove(trigger);
    fireEvent.mouseEnter(trigger);
    await waitFor(() =>
      expect(document.querySelector("[data-slot=tooltip-content] img")).toHaveAttribute("src", "data:image/png;base64,test"),
    );
    expect(actions.click).not.toHaveBeenCalled();
  });

  it("does not add preview controls to emoji reactions", () => {
    render(<ReactionView memo={create(MemoSchema)} reactionType="👍" users={[]} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });
});
