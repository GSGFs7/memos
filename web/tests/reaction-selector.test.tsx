import { create } from "@bufbuild/protobuf";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => vi.useRealTimers());

  it.each(["👍", "Wave"])("previews %s on long press without selecting it, then allows a normal tap", async (name) => {
    render(<ReactionSelector memo={create(MemoSchema)} />);
    const trigger = screen.getByRole("button", { name: "setting.memo.add-reaction" });
    fireEvent.click(trigger);
    const option = await screen.findByRole("button", { name });
    vi.useFakeTimers();
    const touch = { pointerType: "touch", pointerId: 1, clientX: 20, clientY: 20 };
    fireEvent.pointerDown(option, touch);
    act(() => vi.advanceTimersByTime(500));
    const preview = document.querySelector("[data-slot=tooltip-content]")!;
    expect(preview).toBeInTheDocument();
    if (name === "Wave") {
      expect(preview.querySelector("img")).toHaveClass("size-40");
      expect(preview.querySelector("p")).toHaveTextContent("Wave");
    } else {
      expect(preview.querySelector("span")).toHaveClass("text-4xl");
      expect(preview).toHaveTextContent(name);
    }
    fireEvent.pointerUp(option, touch);
    fireEvent.click(option);
    expect(react).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    act(() => vi.runOnlyPendingTimers());
    expect(document.querySelector("[data-slot=tooltip-content]")).toBeNull();
    fireEvent.pointerDown(option, touch);
    fireEvent.pointerUp(option, touch);
    fireEvent.click(option);
    expect(react).toHaveBeenCalledExactlyOnceWith(name === "Wave" ? "sticker:wave" : "👍");
  });

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
