import { FOCUS_VISIBLE_OUTLINE_CLASSES } from "@/components/ui/focus";
import { useInstance } from "@/contexts/InstanceContext";
import useCurrentUser from "@/hooks/useCurrentUser";
import { cn } from "@/lib/utils";
import { State } from "@/types/proto/api/v1/common_pb";
import type { Memo } from "@/types/proto/api/v1/memo_service_pb";
import type { User } from "@/types/proto/api/v1/user_service_pb";
import { useReactionActions } from "./hooks";
import ReactionContent from "./ReactionContent";
import ReactionPreview from "./ReactionPreview";

/**
 * A reaction is a token attached to the memo, not a control, so it takes the pill shape
 * the space and New badges use rather than the rounded box of a button, and like them it
 * has a faint resting surface: a token must read as one even where it cannot be pressed.
 * Everything else is the quiet grammar: 28px, 13px, muted ink that darkens under a light
 * wash, and the accent fill for the one that is on — your own reaction, or the add
 * control while its picker is open.
 */
export const REACTION_PILL_CLASSES =
  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-muted/40 px-2.5 text-ui text-muted-foreground/70";
const REACTION_PILL_INTERACTIVE_CLASSES = cn(
  REACTION_PILL_CLASSES,
  "cursor-pointer transition-colors hover:bg-muted/70 hover:text-foreground aria-pressed:bg-accent aria-pressed:text-accent-foreground data-popup-open:bg-accent data-popup-open:text-accent-foreground",
  FOCUS_VISIBLE_OUTLINE_CLASSES,
);
/** The strip's add control is a control, not a token: a round quiet face of the pills' height with no resting surface. */
export const REACTION_ADD_CLASSES = cn(REACTION_PILL_INTERACTIVE_CLASSES, "size-7 justify-center bg-transparent px-0 hover:bg-muted/60");

interface Props {
  memo: Memo;
  reactionType: string;
  users: User[];
  anonymousCount?: number;
}

const ReactionView = (props: Props) => {
  const { memo, reactionType, users, anonymousCount = 0 } = props;
  const currentUser = useCurrentUser();
  const { memoRelatedSetting } = useInstance();
  const readonly = memo.state === State.ARCHIVED;

  const { hasReacted, handleReactionClick, canReact, pending, challengeDialog } = useReactionActions({ memo });
  const hasReaction = hasReacted(reactionType);
  const reactionCount = users.length + anonymousCount;

  const isClickable = canReact && !readonly;
  const label = (
    <>
      <span className="text-sm leading-none">
        <ReactionContent reactionType={reactionType} stickers={memoRelatedSetting.reactionStickers} className="size-5" />
      </span>
      <span className="text-2xs tabular-nums text-muted-foreground/60">{reactionCount}</span>
    </>
  );

  return (
    <>
      <ReactionPreview reactionType={reactionType} count={reactionCount}>
        {isClickable ? (
          <button
            type="button"
            className={REACTION_PILL_INTERACTIVE_CLASSES}
            aria-pressed={hasReaction}
            disabled={pending || (!currentUser && hasReaction)}
            onClick={() => handleReactionClick(reactionType)}
          >
            {label}
          </button>
        ) : (
          <span className={REACTION_PILL_CLASSES}>{label}</span>
        )}
      </ReactionPreview>
      {challengeDialog}
    </>
  );
};

export default ReactionView;
