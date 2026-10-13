import ChallengeWidget from "@/components/ChallengeWidget";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useTranslate } from "@/utils/i18n";

interface Props {
  reactionType: string | null;
  challenge?: { provider: string; siteKey: string };
  pending: boolean;
  onToken: (token: string | null) => void;
  onError: () => void;
  onClose: () => void;
}

export default function AnonymousReactionDialog({ reactionType, challenge, pending, onToken, onError, onClose }: Props) {
  const t = useTranslate();
  return (
    <Dialog open={reactionType !== null} onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent
        size="sm"
        showCloseButton={false}
        className="w-fit max-w-none p-4 sm:w-fit sm:max-w-none sm:p-4 md:w-fit md:max-w-none"
      >
        <DialogTitle className="sr-only">{t("memo.anonymous-reaction-title")}</DialogTitle>
        <div className="min-h-[65px] w-[300px] shrink-0">
          {challenge && <ChallengeWidget challenge={challenge} action="anonymous_reaction" onToken={onToken} onError={onError} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}
