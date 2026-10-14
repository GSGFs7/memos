import { type ReactElement, useEffect, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useInstance } from "@/contexts/InstanceContext";
import { cn } from "@/lib/utils";
import { useTranslate } from "@/utils/i18n";

interface Props {
  reactionType: string;
  count?: number;
  children: ReactElement;
}

export default function ReactionPreview({ reactionType, count, children }: Props) {
  const t = useTranslate();
  const { memoRelatedSetting } = useInstance();
  const sticker = memoRelatedSetting.reactionStickers?.[reactionType];
  const [previewOpen, setPreviewOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const press = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  const cancelPress = () => {
    if (pressTimer.current !== null) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    press.current = null;
    if (suppressClick.current) setPreviewOpen(false);
  };

  useEffect(() => {
    return () => {
      if (pressTimer.current !== null) clearTimeout(pressTimer.current);
    };
  }, []);

  return (
    <TooltipProvider>
      <Tooltip open={previewOpen} onOpenChange={setPreviewOpen}>
        <TooltipTrigger
          style={{ WebkitTouchCallout: "none", userSelect: "none" }}
          onPointerDown={(event) => {
            cancelPress();
            suppressClick.current = false;
            if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
            press.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
            pressTimer.current = setTimeout(() => {
              pressTimer.current = null;
              suppressClick.current = true;
              setPreviewOpen(true);
            }, 500);
          }}
          onPointerMove={(event) => {
            const start = press.current;
            if (start?.pointerId === event.pointerId && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) {
              cancelPress();
            }
          }}
          onPointerUp={cancelPress}
          onPointerCancel={cancelPress}
          onPointerLeave={cancelPress}
          onContextMenu={(event) => {
            if (press.current || suppressClick.current) event.preventDefault();
          }}
          onClickCapture={(event) => {
            // Touch browsers can dispatch a click after pointerup, even after a long press.
            if (suppressClick.current) {
              event.preventDefault();
              event.stopPropagation();
            }
          }}
          render={children}
        />
        <TooltipContent
          sideOffset={6}
          className="max-w-64 rounded-lg border bg-popover px-3 py-2 text-left text-popover-foreground shadow-md"
          arrowClassName={cn(
            "bg-popover border-border",
            "data-[side=top]:border-b data-[side=top]:border-r data-[side=bottom]:border-t data-[side=bottom]:border-l",
            "data-[side=left]:border-t data-[side=left]:border-r data-[side=right]:border-b data-[side=right]:border-l",
          )}
        >
          {sticker ? (
            <>
              <img src={sticker.image} alt={sticker.name} draggable={false} className="mx-auto my-1 size-40 object-contain" />
              <p className="break-words text-center text-xs font-medium leading-relaxed">{sticker.name}</p>
            </>
          ) : (
            <span aria-hidden="true" className="my-2 block text-center text-4xl leading-none">
              {reactionType}
            </span>
          )}
          {count !== undefined && <p className="text-center text-xs leading-relaxed">{t("memo.reaction-count", { count })}</p>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
