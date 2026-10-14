import type { InstanceSetting_ReactionSticker } from "@/types/proto/api/v1/instance_service_pb";

interface Props {
  reactionType: string;
  stickers?: Record<string, InstanceSetting_ReactionSticker>;
  className?: string;
}

export default function ReactionContent({ reactionType, stickers, className = "size-6" }: Props) {
  const sticker = stickers?.[reactionType];
  if (sticker) {
    return <img src={sticker.image} alt={sticker.name} className={`${className} shrink-0 object-contain`} />;
  }
  return <span>{reactionType}</span>;
}
