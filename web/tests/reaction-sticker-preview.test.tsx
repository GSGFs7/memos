import { create } from "@bufbuild/protobuf";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ReactionView from "@/components/MemoReactionListView/ReactionView";
import { State } from "@/types/proto/api/v1/common_pb";
import { MemoSchema } from "@/types/proto/api/v1/memo_service_pb";

const actions = vi.hoisted(() => ({ click: vi.fn(), canReact: true }));
vi.mock("@/components/MemoReactionListView/hooks", () => ({
  useReactionActions: () => ({ hasReacted: () => false, handleReactionClick: actions.click, canReact: actions.canReact }),
  formatReactionTooltip: () => "",
}));
vi.mock("@/hooks/useCurrentUser", () => ({ default: () => undefined }));
vi.mock("@/contexts/InstanceContext", () => ({
  useInstance: () => ({
    memoRelatedSetting: { reactionStickers: { "sticker:wave": { name: "Wave", image: "data:image/png;base64,test" } } },
  }),
}));
vi.mock("@/utils/i18n", () => ({ useTranslate: () => (key: string) => key, findNearestMatchedLanguage: () => "en" }));

beforeEach(() => {
  actions.click.mockClear();
  actions.canReact = true;
});

describe("sticker reaction preview", () => {
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
