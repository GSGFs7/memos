import { create } from "@bufbuild/protobuf";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ReactionSelector from "@/components/MemoReactionListView/ReactionSelector";
import { MemoSchema } from "@/types/proto/api/v1/memo_service_pb";

const react = vi.hoisted(() => vi.fn());

vi.mock("@/components/MemoReactionListView/hooks", () => ({
  useReactionActions: () => ({
    hasReacted: () => false,
    canReact: true,
    handleReactionClick: react,
  }),
}));

vi.mock("@/hooks/useCurrentUser", () => ({ default: () => undefined }));

vi.mock("@/contexts/InstanceContext", () => ({
  useInstance: () => ({
    memoRelatedSetting: {
      reactions: ["👍", "sticker:wave"],
      reactionStickers: { "sticker:wave": { name: "Wave", image: "data:image/png;base64,test" } },
    },
  }),
}));

vi.mock("@/utils/i18n", () => ({
  useTranslate: () => (key: string) => key,
  findNearestMatchedLanguage: () => "en",
}));

describe("ReactionSelector", () => {
  it("uses a named native trigger with a visible focus state", async () => {
    const memo = create(MemoSchema, { name: "memos/1", reactions: [] });
    render(<ReactionSelector memo={memo} />);

    const trigger = screen.getByRole("button", { name: "setting.memo.add-reaction" });
    // The default trigger is a round quiet 28px face, closing the strip of reaction pills it follows.
    expect(trigger).toHaveClass("size-7", "rounded-full", "focus-visible:outline-2");
    expect(trigger.className).not.toMatch(/ring-/);
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(trigger);

    await waitFor(() => expect(trigger).toHaveAttribute("aria-expanded", "true"));
    expect(screen.getByRole("button", { name: "👍" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Wave" })).toHaveAttribute("src", "data:image/png;base64,test");
    fireEvent.click(screen.getByRole("button", { name: "Wave" }));
    expect(react).toHaveBeenCalledWith("sticker:wave");
  });
});
