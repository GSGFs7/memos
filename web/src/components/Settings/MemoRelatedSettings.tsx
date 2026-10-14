import { create } from "@bufbuild/protobuf";
import { isEqual, uniq } from "lodash-es";
import { CheckIcon, ImagePlusIcon, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import ReactionContent from "@/components/MemoReactionListView/ReactionContent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useInstance } from "@/contexts/InstanceContext";
import { useInstanceSetting, useUpdateInstanceSetting } from "@/hooks/useInstanceQueries";
import { handleError } from "@/lib/error";
import {
  InstanceAccessMode,
  InstanceSetting_AnonymousReactionSettingSchema,
  InstanceSetting_Key,
  InstanceSetting_MemoRelatedSetting,
  InstanceSetting_MemoRelatedSettingSchema,
  InstanceSetting_ReactionStickerSchema,
  InstanceSettingSchema,
} from "@/types/proto/api/v1/instance_service_pb";
import { useTranslate } from "@/utils/i18n";
import SettingGroup from "./SettingGroup";
import { SettingList, SettingListItem, SettingPanel } from "./SettingList";
import SettingSection from "./SettingSection";
import useInstanceSettingUpdater, { buildInstanceSettingName } from "./useInstanceSettingUpdater";

const MIN_CONTENT_LENGTH_LIMIT = 8 * 1024;
const MAX_CONTENT_LENGTH_LIMIT = 2_147_483_647;

const parseContentLengthLimit = (value: string): number | undefined => {
  if (value.trim() === "") {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return undefined;
  }
  if (parsed < MIN_CONTENT_LENGTH_LIMIT || parsed > MAX_CONTENT_LENGTH_LIMIT) {
    return undefined;
  }
  return parsed;
};

const MemoRelatedSettings = () => {
  const t = useTranslate();
  const saveInstanceSetting = useInstanceSettingUpdater();
  const { memoRelatedSetting: originalSetting, profile } = useInstance();
  const [memoRelatedSetting, setMemoRelatedSetting] = useState<InstanceSetting_MemoRelatedSetting>(originalSetting);
  const [contentLengthLimitInput, setContentLengthLimitInput] = useState(String(originalSetting.contentLengthLimit));
  const [editingReaction, setEditingReaction] = useState<string>("");
  const stickerInput = useRef<HTMLInputElement>(null);
  const [isAddingSticker, setIsAddingSticker] = useState(false);

  useEffect(() => {
    setMemoRelatedSetting(originalSetting);
    setContentLengthLimitInput(String(originalSetting.contentLengthLimit));
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
  const memoChanged =
    !isEqual(memoRelatedSetting, originalSetting) || contentLengthLimitInput !== String(originalSetting.contentLengthLimit);
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
    const trimmed = editingReaction.trim();
    if (!trimmed) {
      return;
    }

    updatePartialSetting({ reactions: uniq([...memoRelatedSetting.reactions, trimmed]) });
    setEditingReaction("");
  };

  const addSticker = async (file: File) => {
    setIsAddingSticker(true);
    try {
      if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type) || file.size === 0 || file.size > 64 * 1024) {
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
      const totalSize = Object.values(stickers).reduce((sum, sticker) => sum + atob(sticker.image.split(",")[1]).length, 0);
      if (Object.keys(stickers).length >= 32 || totalSize + file.size > 1024 * 1024) {
        toast.error(t("setting.memo.sticker-limit"));
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
    const contentLengthLimit = parseContentLengthLimit(contentLengthLimitInput);
    if (contentLengthLimit === undefined) {
      toast.error(
        t("setting.memo.content-length-limit-error", {
          min: MIN_CONTENT_LENGTH_LIMIT,
          max: MAX_CONTENT_LENGTH_LIMIT,
        }),
      );
      return;
    }

    if (memoRelatedSetting.reactions.length === 0) {
      toast.error(t("setting.memo.reactions-required"));
      return;
    }

    const updatedMemoRelatedSetting = create(InstanceSetting_MemoRelatedSettingSchema, {
      ...memoRelatedSetting,
      contentLengthLimit,
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
      <SettingGroup title={t("setting.memo.editing-title")} description={t("setting.memo.editing-description")}>
        <SettingList>
          <SettingListItem
            label={t("setting.system.enable-double-click-to-edit")}
            description={t("setting.memo.double-click-edit-description")}
          >
            <Switch
              checked={memoRelatedSetting.enableDoubleClickEdit}
              onCheckedChange={(checked) => updatePartialSetting({ enableDoubleClickEdit: checked })}
            />
          </SettingListItem>

          <SettingListItem label={t("setting.memo.content-length-limit")} description={t("setting.memo.content-length-limit-description")}>
            <div className="flex items-center gap-2">
              <Input
                className="w-28 font-mono"
                type="number"
                min={MIN_CONTENT_LENGTH_LIMIT}
                max={MAX_CONTENT_LENGTH_LIMIT}
                step={1}
                required
                aria-label={t("setting.memo.content-length-limit")}
                value={contentLengthLimitInput}
                onChange={(event) => setContentLengthLimitInput(event.target.value)}
              />
              <span className="text-xs text-muted-foreground">
                {t("setting.memo.content-length-limit-minimum", { min: MIN_CONTENT_LENGTH_LIMIT })}
              </span>
            </div>
          </SettingListItem>
        </SettingList>
      </SettingGroup>

      <SettingGroup title={t("setting.memo.reactions")} description={t("setting.memo.reactions-description")} showSeparator>
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
                value={editingReaction}
                onChange={(event) => setEditingReaction(event.target.value)}
                onKeyDown={(e) => e.key === "Enter" && upsertReaction()}
              />
              <Button variant="outline" size="sm" onClick={upsertReaction} disabled={!editingReaction.trim()}>
                <CheckIcon className="w-4 h-4 mr-1.5" />
                {t("setting.memo.add-reaction")}
              </Button>
              <input
                ref={stickerInput}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                className="hidden"
                aria-label={t("setting.memo.upload-sticker")}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (file) void addSticker(file);
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => stickerInput.current?.click()}
                disabled={isAddingSticker || isSaving}
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
                <ReactionContent reactionType={reactionType} stickers={memoRelatedSetting.reactionStickers} />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => updatePartialSetting({ reactions: memoRelatedSetting.reactions.filter((r) => r !== reactionType) })}
                  aria-label={t("setting.memo.remove-reaction")}
                >
                  <X className="size-3.5" />
                </Button>
              </Badge>
            ))}
          </div>
        </SettingPanel>
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
                  disabled={isPending}
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
                          disabled={isPending}
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
                          disabled={isPending}
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
                          disabled={isPending}
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
