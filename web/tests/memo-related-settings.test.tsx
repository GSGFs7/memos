import { create } from "@bufbuild/protobuf";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MemoRelatedSettings from "@/components/Settings/MemoRelatedSettings";
import {
  type ConfigurationStatus,
  ConfigurationStatusSchema,
  type InstanceSetting,
  InstanceSetting_AnonymousReactionSettingSchema,
  InstanceSetting_Key,
  InstanceSetting_MemoRelatedSettingSchema,
  InstanceSetting_ReactionStickerSchema,
  InstanceSettingSchema,
} from "@/types/proto/api/instance_service_pb";

const mocks = vi.hoisted(() => ({
  instance: {
    memoRelatedSetting: {},
    profile: {},
    updateSetting: vi.fn(),
    fetchSetting: vi.fn(),
  },
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

const configuration = vi.hoisted(() => ({ status: undefined as ConfigurationStatus | undefined }));
vi.mock("@/hooks/useConfigurationQueries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useConfigurationQueries")>();
  return { ...actual, useManagedResource: (name: string) => actual.findManagedResource(configuration.status, name) };
});

const anonymousSetting = create(InstanceSettingSchema, {
  name: "instance/settings/ANONYMOUS_REACTION",
  value: { case: "anonymousReactionSetting", value: create(InstanceSetting_AnonymousReactionSettingSchema) },
});
vi.mock("@/hooks/useInstanceQueries", () => ({
  useInstanceSetting: () => ({ data: anonymousSetting, isLoading: false, isError: false }),
  useUpdateInstanceSetting: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/contexts/InstanceContext", () => ({
  useInstance: () => mocks.instance,
}));

vi.mock("@/utils/i18n", () => ({
  useTranslate: () => (key: string) => key,
}));

vi.mock("react-hot-toast", () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}));

const mockStickerImage = () => {
  vi.stubGlobal(
    "Image",
    class {
      naturalWidth = 32;
      naturalHeight = 32;
      onload: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    },
  );
};

describe("<MemoRelatedSettings>", () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    mocks.instance.memoRelatedSetting = create(InstanceSetting_MemoRelatedSettingSchema, {
      reactions: ["thumbs-up"],
    });
    mocks.instance.updateSetting.mockReset().mockResolvedValue(undefined);
    mocks.instance.fetchSetting.mockReset().mockResolvedValue(undefined);
    mocks.toastError.mockReset();
    mocks.toastSuccess.mockReset();
    configuration.status = undefined;
  });

  it("saves only the reaction list", async () => {
    render(<MemoRelatedSettings />);

    fireEvent.change(screen.getByPlaceholderText("setting.memo.reaction-placeholder"), { target: { value: "heart" } });
    fireEvent.click(screen.getByRole("button", { name: "setting.memo.add-reaction" }));
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));
    await waitFor(() => expect(mocks.instance.updateSetting).toHaveBeenCalledTimes(1));
    const setting = mocks.instance.updateSetting.mock.calls[0][0] as InstanceSetting;
    expect(setting.name).toBe("instance/settings/MEMO_RELATED");
    if (setting.value.case !== "memoRelatedSetting") throw new Error("Expected memo-related setting");
    expect(setting.value.value).toEqual(create(InstanceSetting_MemoRelatedSettingSchema, { reactions: ["thumbs-up", "heart"] }));
    expect(mocks.instance.fetchSetting).toHaveBeenCalledWith(InstanceSetting_Key.MEMO_RELATED);
  });

  it("locks the reactions configuration manages", () => {
    configuration.status = create(ConfigurationStatusSchema, {
      managedResources: [{ resource: "instance/settings/MEMO_RELATED", source: "memo.json", managedFields: ["*"] }],
    });
    render(<MemoRelatedSettings />);
    expect(screen.getByPlaceholderText("setting.memo.reaction-placeholder")).toBeDisabled();
    expect(screen.getByRole("button", { name: "setting.memo.remove-reaction" })).toBeDisabled();
    expect(screen.getByText("memo.json")).toBeInTheDocument();
  });

  it("keeps the drop highlight when moving between children and clears it on exit", () => {
    render(<MemoRelatedSettings />);
    const region = screen.getByRole("region", { name: "setting.memo.configured-reactions" });
    const button = screen.getByRole("button", { name: "setting.memo.upload-sticker" });
    const dataTransfer = { types: ["Files"] };

    fireEvent.dragEnter(region, { dataTransfer });
    fireEvent.dragEnter(button, { dataTransfer });
    fireEvent.dragLeave(button, { dataTransfer });
    expect(region).toHaveClass("ring-2");
    fireEvent.dragLeave(region, { dataTransfer });
    expect(region).not.toHaveClass("ring-2");

    expect(fireEvent.dragOver(region, { dataTransfer: { types: ["text/plain"] } })).toBe(true);
    expect(region).not.toHaveClass("ring-2");
  });

  it("rejects dropped files that do not meet the sticker restrictions", async () => {
    render(<MemoRelatedSettings />);
    const region = screen.getByRole("region", { name: "setting.memo.configured-reactions" });
    const dataTransfer = { types: ["Files"], files: [new File(["text"], "note.txt", { type: "text/plain" })] };
    fireEvent.dragEnter(region, { dataTransfer });
    expect(fireEvent.drop(region, { dataTransfer })).toBe(false);
    expect(region).not.toHaveClass("ring-2");
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("setting.memo.sticker-invalid"));
    expect(screen.getByRole("button", { name: "common.save" })).toBeDisabled();
  });

  it("adds a dropped sticker to the saved settings", async () => {
    mockStickerImage();
    render(<MemoRelatedSettings />);
    const region = screen.getByRole("region", { name: "setting.memo.configured-reactions" });
    const dataTransfer = { types: ["Files"], files: [new File(["image"], "wave.png", { type: "image/png" })] };
    expect(fireEvent.dragOver(region, { dataTransfer })).toBe(false);
    expect(dataTransfer).toHaveProperty("dropEffect", "copy");
    fireEvent.drop(region, { dataTransfer });

    await screen.findByRole("img", { name: "wave.png" });
    await waitFor(() => expect(screen.getByRole("button", { name: "common.save" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));
    await waitFor(() => expect(mocks.instance.updateSetting).toHaveBeenCalledTimes(1));
    const setting = mocks.instance.updateSetting.mock.calls[0][0] as InstanceSetting;
    if (setting.value.case !== "memoRelatedSetting") throw new Error("Expected memo-related setting payload");
    const stickerKey = setting.value.value.reactions.find((reaction) => reaction.startsWith("sticker:"))!;
    expect(setting.value.value.reactionStickers[stickerKey]).toMatchObject({
      name: "wave.png",
      image: "data:image/png;base64,aW1hZ2U=",
    });
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it.each([
    { scenario: "same content with another filename", content: "image", filename: "renamed.png", active: true, duplicate: true },
    { scenario: "same filename with different content", content: "different", filename: "wave.png", active: true, duplicate: false },
    { scenario: "previously removed sticker", content: "image", filename: "wave.png", active: false, duplicate: false },
  ])("handles $scenario when uploading", async ({ content, filename, active, duplicate }) => {
    mockStickerImage();
    mocks.instance.memoRelatedSetting = create(InstanceSetting_MemoRelatedSettingSchema, {
      reactions: active ? ["sticker:original"] : [],
      reactionStickers: {
        "sticker:original": create(InstanceSetting_ReactionStickerSchema, { name: "wave.png", image: "data:image/png;base64,aW1hZ2U=" }),
      },
    });
    render(<MemoRelatedSettings />);
    fireEvent.change(screen.getByLabelText("setting.memo.upload-sticker"), {
      target: { files: [new File([content], filename, { type: "image/png" })] },
    });
    if (duplicate) {
      await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("setting.memo.sticker-exists"));
      expect(screen.getAllByRole("img")).toHaveLength(1);
      expect(screen.getByRole("button", { name: "common.save" })).toBeDisabled();
      return;
    }
    await waitFor(() => expect(screen.getByRole("button", { name: "common.save" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));
    await waitFor(() => expect(mocks.instance.updateSetting).toHaveBeenCalledTimes(1));
    const setting = mocks.instance.updateSetting.mock.calls[0][0] as InstanceSetting;
    if (setting.value.case !== "memoRelatedSetting") throw new Error("Expected memo-related setting payload");
    expect(setting.value.value.reactions).toHaveLength(active ? 2 : 1);
    expect(Object.keys(setting.value.value.reactionStickers)).toHaveLength(2);
    if (!active) expect(setting.value.value.reactions).not.toContain("sticker:original");
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it("allows uploading beyond the former sticker count and total size limits", async () => {
    mockStickerImage();
    const stickers = Object.fromEntries(
      Array.from({ length: 40 }, (_, i) => [
        `sticker:${i}`,
        create(InstanceSetting_ReactionStickerSchema, { name: `${i}.png`, image: `data:image/png;base64,${btoa("x".repeat(32 * 1024))}` }),
      ]),
    );
    mocks.instance.memoRelatedSetting = create(InstanceSetting_MemoRelatedSettingSchema, {
      reactions: Object.keys(stickers),
      reactionStickers: stickers,
    });
    render(<MemoRelatedSettings />);
    fireEvent.change(screen.getByLabelText("setting.memo.upload-sticker"), {
      target: { files: [new File(["image"], "wave.png", { type: "image/png" })] },
    });
    await screen.findByRole("img", { name: "wave.png" });
    expect(screen.getAllByRole("img")).toHaveLength(41);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it.each([64 * 1024 + 1, 128 * 1024, 128 * 1024 + 1])("validates a %i-byte sticker against the 128 KB limit", async (size) => {
    mockStickerImage();
    render(<MemoRelatedSettings />);
    fireEvent.change(screen.getByLabelText("setting.memo.upload-sticker"), {
      target: { files: [new File([new Uint8Array(size)], "size.png", { type: "image/png" })] },
    });
    if (size > 128 * 1024) {
      await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("setting.memo.sticker-invalid"));
      expect(screen.queryByRole("img", { name: "size.png" })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "common.save" })).toBeDisabled();
    } else {
      await screen.findByRole("img", { name: "size.png" });
      expect(mocks.toastError).not.toHaveBeenCalled();
    }
  });
});
