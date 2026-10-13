import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import AnonymousReactionDialog from "@/components/MemoReactionListView/AnonymousReactionDialog";

vi.mock("@/components/ChallengeWidget", () => ({ default: () => <div data-testid="verification-widget" /> }));
vi.mock("@/utils/i18n", () => ({ useTranslate: () => (key: string) => key }));

describe("anonymous reaction verification dialog", () => {
  it("shows only verification with an accessible hidden title and no app buttons", () => {
    render(
      <AnonymousReactionDialog
        reactionType="🎉"
        challenge={{ provider: "turnstile", siteKey: "public" }}
        pending={false}
        onToken={vi.fn()}
        onError={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(screen.getByRole("dialog")).toHaveAccessibleName("memo.anonymous-reaction-title");
    expect(screen.getByTestId("verification-widget")).toBeInTheDocument();
    expect(screen.getByText("memo.anonymous-reaction-title")).toHaveClass("sr-only");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText("memo.anonymous-reaction-description")).not.toBeInTheDocument();
    expect(screen.queryByText("🎉")).not.toBeInTheDocument();
  });
});
