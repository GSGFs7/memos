import { useQueryClient } from "@tanstack/react-query";
import { createElement, useMemo, useState, useSyncExternalStore } from "react";
import toast from "react-hot-toast";
import { CHALLENGE_TOKEN_HEADER } from "@/components/ChallengeWidget";
import { useResolvedUsersByNames } from "@/components/MemoContent/MentionResolutionContext";
import { memoServiceClient } from "@/connect";
import { useInstance } from "@/contexts/InstanceContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { memoKeys } from "@/hooks/useMemoQueries";
import { State } from "@/types/proto/api/v1/common_pb";
import type { Memo, Reaction } from "@/types/proto/api/v1/memo_service_pb";
import { Visibility } from "@/types/proto/api/v1/memo_service_pb";
import type { User } from "@/types/proto/api/v1/user_service_pb";
import { useTranslate } from "@/utils/i18n";
import AnonymousReactionDialog from "./AnonymousReactionDialog";
import {
  anonymousReactionRevision,
  finishAnonymousReaction,
  hasAnonymousReaction,
  startAnonymousReaction,
  subscribeAnonymousReactions,
} from "./anonymous-reactions";

export interface ReactionGroupEntry {
  users: User[];
  anonymousCount: number;
}
export type ReactionGroup = Map<string, ReactionGroupEntry>;

export const useReactionGroups = (reactions: Reaction[]): ReactionGroup => {
  const creatorNames = useMemo(() => reactions.filter((r) => r.creator).map((r) => r.creator), [reactions]);
  const userMap = useResolvedUsersByNames(creatorNames);

  return useMemo(() => {
    const reactionGroup = new Map<string, ReactionGroupEntry>();
    for (const reaction of reactions) {
      const entry = reactionGroup.get(reaction.reactionType) ?? { users: [], anonymousCount: 0 };
      if (reaction.anonymousCount > 0n) {
        entry.anonymousCount += Number(reaction.anonymousCount);
      } else {
        const user = userMap?.get(reaction.creator);
        if (!user) continue;
        entry.users.push(user);
      }
      reactionGroup.set(reaction.reactionType, entry);
    }
    return reactionGroup;
  }, [reactions, userMap]);
};

interface UseReactionActionsOptions {
  memo: Memo;
  onComplete?: () => void;
}

export const useReactionActions = ({ memo, onComplete }: UseReactionActionsOptions) => {
  const currentUser = useCurrentUser();
  const queryClient = useQueryClient();
  const { profile } = useInstance();
  const t = useTranslate();
  useSyncExternalStore(subscribeAnonymousReactions, anonymousReactionRevision);
  const [reactionType, setReactionType] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const canReact =
    Boolean(currentUser) ||
    Boolean(profile.anonymousReactionChallenge && memo.visibility === Visibility.PUBLIC && !memo.space && memo.state !== State.ARCHIVED);

  const refreshMemo = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: memoKeys.detail(memo.name) }),
      queryClient.invalidateQueries({ queryKey: memoKeys.lists() }),
      ...(memo.parent ? [queryClient.invalidateQueries({ queryKey: memoKeys.comments(memo.parent) })] : []),
    ]);
  };

  const submitAnonymousReaction = async (token: string) => {
    if (!reactionType || !token || pending || !startAnonymousReaction(memo.name, reactionType)) return;
    const selectedType = reactionType;
    setPending(true);
    try {
      await memoServiceClient.addAnonymousMemoReaction(
        { name: memo.name, reactionType: selectedType },
        { headers: { [CHALLENGE_TOKEN_HEADER]: token } },
      );
      finishAnonymousReaction(memo.name, selectedType, true);
      setReactionType(null);
      onComplete?.();
      // A refresh failure must not turn an accepted addition into a failed submission.
      await refreshMemo().catch((error: unknown) => console.error(error));
    } catch {
      finishAnonymousReaction(memo.name, selectedType, false);
      toast.error(t("memo.anonymous-reaction-error"));
      setReactionType(null);
    } finally {
      setPending(false);
    }
  };

  const challengeDialog = createElement(AnonymousReactionDialog, {
    reactionType,
    challenge: profile.anonymousReactionChallenge,
    pending,
    onToken: (token) => {
      if (token) void submitAnonymousReaction(token);
    },
    onError: () => {
      if (!reactionType || pending) return;
      toast.error(t("memo.anonymous-reaction-error"));
      setReactionType(null);
    },
    onClose: () => {
      setReactionType(null);
    },
  });

  const hasReacted = (reactionType: string) => {
    return currentUser
      ? memo.reactions.some((r) => r.reactionType === reactionType && r.creator === currentUser.name)
      : hasAnonymousReaction(memo.name, reactionType);
  };

  const handleReactionClick = async (reactionType: string) => {
    if (!canReact || pending) return;
    if (!currentUser) {
      if (!hasReacted(reactionType)) {
        setReactionType(reactionType);
      }
      return;
    }

    try {
      if (hasReacted(reactionType)) {
        const reactions = memo.reactions.filter(
          (reaction) => reaction.reactionType === reactionType && reaction.creator === currentUser.name,
        );
        await Promise.all(reactions.map((reaction) => memoServiceClient.deleteMemoReaction({ name: reaction.name })));
      } else {
        await memoServiceClient.upsertMemoReaction({
          name: memo.name,
          reaction: { reactionType },
        });
      }
      // Refetch the memo to get updated reactions and invalidate cache
      const updatedMemo = await memoServiceClient.getMemo({ name: memo.name });
      queryClient.setQueryData(memoKeys.detail(memo.name), updatedMemo);
      queryClient.invalidateQueries({ queryKey: memoKeys.lists() });
      // If this memo is a comment, refresh the parent's comments list so the comment's reactions update in the UI
      if (memo.parent) {
        queryClient.invalidateQueries({ queryKey: memoKeys.comments(memo.parent) });
      }
    } catch {
      // skip error
    }
    onComplete?.();
  };

  return { hasReacted, handleReactionClick, canReact, pending, challengeDialog };
};
