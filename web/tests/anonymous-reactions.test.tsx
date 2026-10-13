import { create } from "@bufbuild/protobuf";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  finishAnonymousReaction,
  hasAnonymousReaction,
  startAnonymousReaction,
} from "@/components/MemoReactionListView/anonymous-reactions";
import { useReactionActions, useReactionGroups } from "@/components/MemoReactionListView/hooks";
import { State } from "@/types/proto/api/v1/common_pb";
import { MemoSchema, ReactionSchema, Visibility } from "@/types/proto/api/v1/memo_service_pb";
import { UserSchema } from "@/types/proto/api/v1/user_service_pb";

const mocks = vi.hoisted(() => ({ add: vi.fn(), error: vi.fn() }));
vi.mock("@/connect", () => ({ memoServiceClient: { addAnonymousMemoReaction: mocks.add } }));
vi.mock("react-hot-toast", () => ({ default: { error: mocks.error } }));
vi.mock("@/hooks/useCurrentUser", () => ({ default: () => undefined }));
vi.mock("@/contexts/InstanceContext", () => ({
  useInstance: () => ({ profile: { anonymousReactionChallenge: { provider: "turnstile", siteKey: "public" } } }),
}));
vi.mock("@/utils/i18n", () => ({ useTranslate: () => (key: string) => key }));
vi.mock("@/components/MemoContent/MentionResolutionContext", () => ({
  useResolvedUsersByNames: () => new Map([["users/alice", create(UserSchema, { name: "users/alice" })]]),
}));

const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe("anonymous reactions", () => {
  it("counts anonymous additions even without resolved user profiles", () => {
    const { result } = renderHook(() =>
      useReactionGroups([
        create(ReactionSchema, { reactionType: "👍", anonymousCount: 3n }),
        create(ReactionSchema, { reactionType: "👍", creator: "users/alice" }),
        create(ReactionSchema, { reactionType: "👍", creator: "users/missing" }),
      ]),
    );
    expect(result.current.get("👍")?.anonymousCount).toBe(3);
    expect(result.current.get("👍")?.users).toHaveLength(1);
  });

  it("persists successful additions and prevents simultaneous clicks from two entry points", () => {
    const name = "memos/storage-test";
    expect(startAnonymousReaction(name, "👍")).toBe(true);
    expect(startAnonymousReaction(name, "👍")).toBe(false);
    finishAnonymousReaction(name, "👍", true);
    expect(hasAnonymousReaction(name, "👍")).toBe(true);
    expect(localStorage.getItem("memos:anonymous-reaction:memos/storage-test:%F0%9F%91%8D")).toBe("1");
    expect(startAnonymousReaction(name, "👍")).toBe(false);
    expect(startAnonymousReaction(name, "❤️")).toBe(true);
    finishAnonymousReaction(name, "❤️", false);
    expect(startAnonymousReaction(name, "❤️")).toBe(true);
    finishAnonymousReaction(name, "❤️", false);
  });

  it("requires verification, forwards its token and marks only a successful request", async () => {
    const memo = create(MemoSchema, { name: "memos/submit-test", visibility: Visibility.PUBLIC });
    mocks.add.mockResolvedValue(create(ReactionSchema, { reactionType: "👍", anonymousCount: 1n }));
    const { result } = renderHook(() => useReactionActions({ memo }), { wrapper });
    await act(async () => {
      await result.current.handleReactionClick("👍");
    });
    expect(mocks.add).not.toHaveBeenCalled();
    expect(result.current.challengeDialog.props.reactionType).toBe("👍");
    await act(async () => {
      result.current.challengeDialog.props.onToken(null);
    });
    expect(mocks.add).not.toHaveBeenCalled();
    await act(async () => {
      result.current.challengeDialog.props.onToken("proof");
      result.current.challengeDialog.props.onToken("proof");
    });
    expect(mocks.add).toHaveBeenCalledWith({ name: memo.name, reactionType: "👍" }, { headers: { "Challenge-Token": "proof" } });
    expect(result.current.hasReacted("👍")).toBe(true);
    expect(result.current.challengeDialog.props.reactionType).toBeNull();
    await act(async () => {
      await result.current.handleReactionClick("👍");
    });
    expect(result.current.challengeDialog.props.reactionType).toBeNull();
    expect(mocks.add).toHaveBeenCalledTimes(1);
  });

  it("closes after a failed submission and lets the visitor start fresh verification", async () => {
    const memo = create(MemoSchema, { name: "memos/failure-test", visibility: Visibility.PUBLIC });
    mocks.add.mockRejectedValue(new Error("verification rejected"));
    const { result } = renderHook(() => useReactionActions({ memo }), { wrapper });
    await act(async () => {
      await result.current.handleReactionClick("👍");
    });
    await act(async () => {
      result.current.challengeDialog.props.onToken("expired");
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.hasReacted("👍")).toBe(false);
    expect(result.current.challengeDialog.props.reactionType).toBeNull();
    await act(async () => {
      await result.current.handleReactionClick("👍");
    });
    expect(result.current.challengeDialog.props.reactionType).toBe("👍");
    expect(mocks.error).toHaveBeenCalled();
  });

  it("keeps an accepted addition successful when refreshing cached memos fails", async () => {
    const memo = create(MemoSchema, { name: "memos/refresh-failure-test", visibility: Visibility.PUBLIC });
    const client = new QueryClient();
    vi.spyOn(client, "invalidateQueries").mockRejectedValue(new Error("refresh unavailable"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.add.mockResolvedValue(create(ReactionSchema, { reactionType: "👍", anonymousCount: 1n }));
    const { result } = renderHook(() => useReactionActions({ memo }), {
      wrapper: ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    await act(async () => {
      await result.current.handleReactionClick("👍");
    });
    await act(async () => {
      result.current.challengeDialog.props.onToken("proof");
    });
    await waitFor(() => expect(result.current.pending).toBe(false));
    expect(result.current.hasReacted("👍")).toBe(true);
    expect(result.current.challengeDialog.props.reactionType).toBeNull();
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.add).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });

  it("closes on a widget error so the visitor can retry loading verification", async () => {
    const memo = create(MemoSchema, { name: "memos/widget-failure-test", visibility: Visibility.PUBLIC });
    const { result } = renderHook(() => useReactionActions({ memo }), { wrapper });
    await act(async () => {
      await result.current.handleReactionClick("👍");
    });
    await act(async () => {
      result.current.challengeDialog.props.onError();
    });
    expect(result.current.challengeDialog.props.reactionType).toBeNull();
    expect(result.current.hasReacted("👍")).toBe(false);
    expect(mocks.add).not.toHaveBeenCalled();
    expect(mocks.error).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.handleReactionClick("👍");
    });
    expect(result.current.challengeDialog.props.reactionType).toBe("👍");
  });

  it("does not submit a late verification callback after dismissal", async () => {
    const memo = create(MemoSchema, { name: "memos/cancel-test", visibility: Visibility.PUBLIC });
    const { result } = renderHook(() => useReactionActions({ memo }), { wrapper });
    await act(async () => {
      await result.current.handleReactionClick("👍");
    });
    await act(async () => {
      result.current.challengeDialog.props.onClose();
    });
    await act(async () => {
      result.current.challengeDialog.props.onToken("late-proof");
    });
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it("does not offer anonymous reactions for private, archived or space memos", () => {
    for (const fields of [
      { visibility: Visibility.PRIVATE },
      { visibility: Visibility.PUBLIC, state: State.ARCHIVED },
      { visibility: Visibility.PUBLIC, space: "spaces/team" },
    ]) {
      const { result, unmount } = renderHook(() => useReactionActions({ memo: create(MemoSchema, fields) }), { wrapper });
      expect(result.current.canReact).toBe(false);
      unmount();
    }
  });
});
