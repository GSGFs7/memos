import { create } from "@bufbuild/protobuf";
import { isEqual, uniq } from "lodash-es";
import { CheckIcon, ImagePlusIcon, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import ReactionContent from "@/components/MemoReactionListView/ReactionContent";
import ReactionPreview from "@/components/MemoReactionListView/ReactionPreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useInstance } from "@/contexts/InstanceContext";
import { isFieldManaged, useManagedResource } from "@/hooks/useConfigurationQueries";
import { useInstanceSetting, useUpdateInstanceSetting } from "@/hooks/useInstanceQueries";
import { handleError } from "@/lib/error";
import { cn } from "@/lib/utils";
import {
  InstanceAccessMode,
  InstanceSetting_AnonymousReactionSettingSchema,
  InstanceSetting_Key,
  InstanceSetting_MemoRelatedSetting,
  InstanceSetting_MemoRelatedSettingSchema,
  InstanceSetting_ReactionStickerSchema,
  InstanceSettingSchema,
} from "@/types/proto/api/instance_service_pb";
import { useTranslate } from "@/utils/i18n";
import ManagedByConfigurationChip from "./ManagedByConfigurationChip";
import SettingGroup from "./SettingGroup";
import { SettingList, SettingListItem, SettingPanel } from "./SettingList";
import SettingSection from "./SettingSection";
import useInstanceSettingUpdater, { buildInstanceSettingName } from "./useInstanceSettingUpdater";

const MemoRelatedSettings = () => {
  const t = useTranslate();
  const saveInstanceSetting = useInstanceSettingUpdater();
  const { memoRelatedSetting: originalSetting, profile } = useInstance();
  const [memoRelatedSetting, setMemoRelatedSetting] = useState<InstanceSetting_MemoRelatedSetting>(originalSetting);
  const managed = useManagedResource(buildInstanceSettingName(InstanceSetting_Key.MEMO_RELATED));
  const reactionsLocked =
    isFieldManaged(managed, "memoRelatedSetting.reactions") || isFieldManaged(managed, "memoRelatedSetting.reactionStickers");
  const anonymousManaged = useManagedResource(buildInstanceSettingName(InstanceSetting_Key.ANONYMOUS_REACTION));
  const anonymousLocked = Boolean(anonymousManaged);
  const [editingReaction, setEditingReaction] = useState<string>("");
  const stickerInput = useRef<HTMLInputElement>(null);
  const [isAddingSticker, setIsAddingSticker] = useState(false);
  const [isDraggingSticker, setIsDraggingSticker] = useState(false);
  const stickerDragDepth = useRef(0);

  useEffect(() => {
    setMemoRelatedSetting(originalSetting);
  }, [originalSetting]);

  const { data, isLoading, isError, refetch } = useInstanceSetting(InstanceSetting_Key.ANONYMOUS_REACTION);
  const { mutateAsync, isPending } = useUpdateInstanceSetting();
  const originalAnonymousSetting = useMemo(
    () => (data?.value.case === "anonymousReactionSetting" ? data.value.value : create(InstanceSetting_AnonymousReactionSettingSchema)),
    [data],
  );
  const [anonymousSetting, setAnonymousSetting] = useState(originalAnonymousSetting);
  const [hostnames, setHostnames] = useState(originalAnonymousSetting.hostnames.join("\n"));
  useEffect(() => {
    setAnonymousSetting(originalAnonymousSetting);
    setHostnames(originalAnonymousSetting.hostnames.join("\n"));
  }, [originalAnonymousSetting]);

  const updatedAnonymousSetting = create(InstanceSetting_AnonymousReactionSettingSchema, {
    ...anonymousSetting,
    siteKey: anonymousSetting.siteKey.trim(),
    secretKey: anonymousSetting.secretKey.trim(),
    hostnames: [
      ...new Set(
        hostnames
          .split(/[,\n]/)
          .map((hostname) => hostname.trim().toLowerCase())
          .filter(Boolean),
      ),
    ],
  });
  const hasSecret = Boolean(
    updatedAnonymousSetting.secretKey ||
      (originalAnonymousSetting.hasSecret && updatedAnonymousSetting.siteKey === originalAnonymousSetting.siteKey),
  );
  const incomplete =
    updatedAnonymousSetting.enabled && (!updatedAnonymousSetting.siteKey || !hasSecret || updatedAnonymousSetting.hostnames.length === 0);
  const anonymousChanged = !isEqual(updatedAnonymousSetting, originalAnonymousSetting);
  const memoChanged = !isEqual(memoRelatedSetting, originalSetting);
  const [isSaving, setIsSaving] = useState(false);
  const canSave = !isLoading && !isError && !isPending && !isSaving && !isAddingSticker && !incomplete && (memoChanged || anonymousChanged);

  const updatePartialSetting = (partial: Partial<InstanceSetting_MemoRelatedSetting>) => {
    const newInstanceMemoRelatedSetting = create(InstanceSetting_MemoRelatedSettingSchema, {
      ...memoRelatedSetting,
      ...partial,
    });
    setMemoRelatedSetting(newInstanceMemoRelatedSetting);
  };

  const upsertReaction = () => {
    if (reactionsLocked) return;
    const trimmed = editingReaction.trim();
    if (!trimmed) {
      return;
    }

    updatePartialSetting({ reactions: uniq([...memoRelatedSetting.reactions, trimmed]) });
    setEditingReaction("");
  };

  const addSticker = async (file: File) => {
    if (reactionsLocked || isAddingSticker || isSaving) return;

    setIsAddingSticker(true);
    try {
      if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type) || file.size === 0 || file.size > 128 * 1024) {
        throw new Error("invalid sticker");
      }
      const image = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      await new Promise<void>((resolve, reject) => {
        const preview = new Image();
        preview.onload = () => {
          if (preview.naturalWidth > 512 || preview.naturalHeight > 512) reject(new Error("sticker dimensions"));
          else resolve();
        };
        preview.onerror = () => reject(new Error("invalid sticker image"));
        preview.src = image;
      });
      const stickers = memoRelatedSetting.reactionStickers;
      if (memoRelatedSetting.reactions.some((reactionType) => stickers[reactionType]?.image === image)) {
        toast.error(t("setting.memo.sticker-exists"));
        return;
      }
      const key = `sticker:${crypto.randomUUID()}`;
      setMemoRelatedSetting((current) =>
        create(InstanceSetting_MemoRelatedSettingSchema, {
          ...current,
          reactions: [...current.reactions, key],
          reactionStickers: {
            ...current.reactionStickers,
            [key]: create(InstanceSetting_ReactionStickerSchema, { name: file.name.slice(0, 32), image }),
          },
        }),
      );
    } catch {
      toast.error(t("setting.memo.sticker-invalid"));
    } finally {
      setIsAddingSticker(false);
    }
  };

  const handleUpdateSetting = async () => {
    if (!canSave) return;
    if (memoRelatedSetting.reactions.length === 0) {
      toast.error(t("setting.memo.reactions-required"));
      return;
    }

    const updatedMemoRelatedSetting = create(InstanceSetting_MemoRelatedSettingSchema, {
      ...memoRelatedSetting,
    });

    setIsSaving(true);
    try {
      if (memoChanged) {
        const saved = await saveInstanceSetting({
          key: InstanceSetting_Key.MEMO_RELATED,
          setting: create(InstanceSettingSchema, {
            name: buildInstanceSettingName(InstanceSetting_Key.MEMO_RELATED),
            value: { case: "memoRelatedSetting", value: updatedMemoRelatedSetting },
          }),
          errorContext: "Update memo-related settings",
          showSuccessToast: !anonymousChanged,
        });
        if (!saved) return;
      }
      if (anonymousChanged) {
        await mutateAsync(
          create(InstanceSettingSchema, {
            name: buildInstanceSettingName(InstanceSetting_Key.ANONYMOUS_REACTION),
            value: { case: "anonymousReactionSetting", value: updatedAnonymousSetting },
          }),
        );
        toast.success(t("message.update-succeed"));
      }
    } catch (error: unknown) {
      handleError(error, toast.error, { fallbackMessage: t("setting.anonymous-reaction.save-error") });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingSection title={t("setting.memo.label")}>
      <SettingGroup
        title={t("setting.memo.reactions")}
        description={t("setting.memo.reactions-description")}
        actions={reactionsLocked ? <ManagedByConfigurationChip resource={managed} /> : undefined}
      >
        <div
          role="region"
          aria-label={t("setting.memo.configured-reactions")}
          className={cn("relative rounded-lg", isDraggingSticker && "ring-2 ring-primary")}
          onDragEnter={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            stickerDragDepth.current += 1;
            if (!reactionsLocked && !isAddingSticker && !isSaving) setIsDraggingSticker(true);
          }}
          onDragOver={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = reactionsLocked || isAddingSticker || isSaving ? "none" : "copy";
          }}
          onDragLeave={() => {
            stickerDragDepth.current = Math.max(0, stickerDragDepth.current - 1);
            if (stickerDragDepth.current === 0) setIsDraggingSticker(false);
          }}
          onDrop={(event) => {
            if (!event.dataTransfer.types.includes("Files")) return;
            event.preventDefault();
            event.stopPropagation();
            stickerDragDepth.current = 0;
            setIsDraggingSticker(false);
            const file = event.dataTransfer.files[0];
            if (file && !reactionsLocked) void addSticker(file);
          }}
        >
          <SettingPanel
            header={
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-muted-foreground">{t("setting.memo.configured-reactions")}</span>
                <Badge variant="outline" className="rounded-md px-2 py-0 text-xs font-normal">
                  {memoRelatedSetting.reactions.length}
                </Badge>
              </div>
            }
            footer={
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  className="h-8 max-w-48 font-mono"
                  placeholder={t("setting.memo.reaction-placeholder")}
                  disabled={reactionsLocked}
                  value={editingReaction}
                  onChange={(event) => setEditingReaction(event.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && upsertReaction()}
                />
                <Button variant="outline" size="sm" onClick={upsertReaction} disabled={reactionsLocked || !editingReaction.trim()}>
                  <CheckIcon className="w-4 h-4 mr-1.5" />
                  {t("setting.memo.add-reaction")}
                </Button>
                <input
                  ref={stickerInput}
                  type="file"
                  disabled={reactionsLocked || isAddingSticker || isSaving}
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  aria-label={t("setting.memo.upload-sticker")}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file && !reactionsLocked) void addSticker(file);
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => stickerInput.current?.click()}
                  disabled={reactionsLocked || isAddingSticker || isSaving}
                  title={t("setting.memo.sticker-invalid")}
                >
                  <ImagePlusIcon className="size-4 mr-1.5" />
                  {t("setting.memo.upload-sticker")}
                </Button>
              </div>
            }
          >
            <div className="flex min-h-16 flex-wrap gap-2 px-3 py-3">
              {memoRelatedSetting.reactions.map((reactionType) => (
                <Badge key={reactionType} variant="outline" className="flex h-8 items-center gap-2 rounded-md px-2.5 font-normal">
                  <ReactionPreview reactionType={reactionType} stickers={memoRelatedSetting.reactionStickers}>
                    <button
                      type="button"
                      className="inline-flex items-center justify-center rounded-sm"
                      aria-label={memoRelatedSetting.reactionStickers[reactionType]?.name ?? reactionType}
                    >
                      <ReactionContent reactionType={reactionType} stickers={memoRelatedSetting.reactionStickers} />
                    </button>
                  </ReactionPreview>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    disabled={reactionsLocked}
                    onClick={() => updatePartialSetting({ reactions: memoRelatedSetting.reactions.filter((r) => r !== reactionType) })}
                    aria-label={t("setting.memo.remove-reaction")}
                  >
                    <X className="size-3.5" />
                  </Button>
                </Badge>
              ))}
            </div>
          </SettingPanel>
          {isDraggingSticker && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-background/90 text-primary">
              <ImagePlusIcon className="size-5" />
              <span className="text-sm font-medium">{t("setting.memo.upload-sticker")}</span>
            </div>
          )}
        </div>
        {anonymousLocked && <ManagedByConfigurationChip resource={anonymousManaged} />}
        {isLoading && (
          <p className="text-sm text-muted-foreground" role="status">
            {t("setting.anonymous-reaction.loading")}
          </p>
        )}
        {isError && (
          <div className="flex items-center gap-3" role="alert">
            <p className="text-sm text-destructive">{t("setting.anonymous-reaction.load-error")}</p>
            <Button variant="outline" onClick={() => void refetch()}>
              {t("setting.anonymous-reaction.retry")}
            </Button>
          </div>
        )}
        {!isLoading && !isError && (
          <>
            <SettingList>
              <SettingListItem label={<label htmlFor="anonymous-reaction-enabled">{t("setting.anonymous-reaction.enabled")}</label>}>
                <Switch
                  id="anonymous-reaction-enabled"
                  checked={anonymousSetting.enabled}
                  disabled={anonymousLocked || isPending}
                  onCheckedChange={(enabled) => setAnonymousSetting({ ...anonymousSetting, enabled })}
                />
              </SettingListItem>
              {anonymousSetting.enabled && (
                <div className="flex flex-col gap-3 bg-muted/10 px-3 py-4 sm:ps-6">
                  {profile.accessMode !== InstanceAccessMode.PUBLIC && (
                    <p className="text-sm text-muted-foreground">
                      {t("setting.anonymous-reaction.public-required")}{" "}
                      <a className="text-primary underline" href="#system">
                        {t("setting.system.label")}
                      </a>
                    </p>
                  )}
                  <SettingGroup
                    title="Cloudflare Turnstile"
                    actions={
                      <a
                        className="text-sm text-primary underline"
                        href="https://dash.cloudflare.com/?to=/:account/turnstile"
                        target="_blank"
                        rel="noreferrer"
                      >
                        {t("setting.anonymous-reaction.open-dashboard")}
                      </a>
                    }
                  >
                    <SettingList>
                      <SettingListItem vertical label={<label htmlFor="anonymous-reaction-site-key">Site Key</label>}>
                        <Input
                          id="anonymous-reaction-site-key"
                          value={anonymousSetting.siteKey}
                          disabled={anonymousLocked || isPending}
                          maxLength={256}
                          onChange={(event) => setAnonymousSetting({ ...anonymousSetting, siteKey: event.target.value })}
                        />
                      </SettingListItem>
                      <SettingListItem vertical label={<label htmlFor="anonymous-reaction-secret-key">Secret Key</label>}>
                        <Input
                          id="anonymous-reaction-secret-key"
                          type="password"
                          autoComplete="new-password"
                          value={anonymousSetting.secretKey}
                          disabled={anonymousLocked || isPending}
                          maxLength={256}
                          onChange={(event) => setAnonymousSetting({ ...anonymousSetting, secretKey: event.target.value })}
                        />
                      </SettingListItem>
                      <SettingListItem
                        vertical
                        label={<label htmlFor="anonymous-reaction-hostnames">{t("setting.anonymous-reaction.hostnames")}</label>}
                        description={t("setting.anonymous-reaction.hostnames-description")}
                      >
                        <Textarea
                          id="anonymous-reaction-hostnames"
                          value={hostnames}
                          disabled={anonymousLocked || isPending}
                          placeholder="memos.example.com"
                          rows={3}
                          onChange={(event) => setHostnames(event.target.value)}
                        />
                      </SettingListItem>
                    </SettingList>
                    {incomplete && (
                      <p className="text-xs text-muted-foreground" role="status">
                        {t("setting.anonymous-reaction.incomplete")}
                      </p>
                    )}
                  </SettingGroup>
                </div>
              )}
            </SettingList>
          </>
        )}
      </SettingGroup>

      <div className="w-full flex justify-end">
        <Button disabled={!canSave} onClick={handleUpdateSetting}>
          {t("common.save")}
        </Button>
      </div>
    </SettingSection>
  );
};

export default MemoRelatedSettings;
