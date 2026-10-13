import { create } from "@bufbuild/protobuf";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MemoRelatedSettings from "@/components/Settings/MemoRelatedSettings";
import { SETTINGS_SECTIONS } from "@/components/Settings/settingSections";
import {
  InstanceSetting_AnonymousReactionSettingSchema,
  InstanceSetting_Key,
  InstanceSetting_MemoRelatedSettingSchema,
  InstanceSettingSchema,
} from "@/types/proto/api/v1/instance_service_pb";

const mocks = vi.hoisted(() => ({
  query: { data: undefined as unknown, isLoading: false, isError: false, refetch: vi.fn() },
  save: vi.fn(),
  memoSetting: undefined as unknown,
  updateMemo: vi.fn(),
  fetchSetting: vi.fn(),
}));
vi.mock("@/hooks/useInstanceQueries", () => ({
  useInstanceSetting: () => mocks.query,
  useUpdateInstanceSetting: () => ({ mutateAsync: mocks.save, isPending: false }),
}));
vi.mock("@/contexts/InstanceContext", () => ({
  useInstance: () => ({
    profile: {},
    memoRelatedSetting: mocks.memoSetting,
    updateSetting: mocks.updateMemo,
    fetchSetting: mocks.fetchSetting,
  }),
}));
vi.mock("@/utils/i18n", () => ({ useTranslate: () => (key: string) => key, findNearestMatchedLanguage: () => "en" }));
vi.mock("react-hot-toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  mocks.save.mockReset().mockResolvedValue(undefined);
  mocks.updateMemo.mockReset().mockResolvedValue(undefined);
  mocks.fetchSetting.mockReset().mockResolvedValue(undefined);
  mocks.memoSetting = create(InstanceSetting_MemoRelatedSettingSchema, { contentLengthLimit: 8192, reactions: ["👍"] });
  mocks.query.isLoading = false;
  mocks.query.isError = false;
  mocks.query.data = create(InstanceSettingSchema, {
    name: "instance/settings/ANONYMOUS_REACTION",
    value: { case: "anonymousReactionSetting", value: create(InstanceSetting_AnonymousReactionSettingSchema) },
  });
});

describe("anonymous interaction settings", () => {
  it("keeps reactions in the admin memo section without a separate sidebar entry", () => {
    expect(SETTINGS_SECTIONS.some((section) => section.key === ("anonymous-reaction" as string))).toBe(false);
    expect(SETTINGS_SECTIONS.find((section) => section.key === "memo")).toMatchObject({ scope: "admin" });
  });

  it("requires a complete widget and sends normalized configuration", async () => {
    render(<MemoRelatedSettings />);
    fireEvent.click(screen.getByRole("switch", { name: "setting.anonymous-reaction.enabled" }));
    const save = screen.getByRole("button", { name: "common.save" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Site Key"), { target: { value: "public-key" } });
    fireEvent.change(screen.getByLabelText("Secret Key"), { target: { value: "private-key" } });
    fireEvent.change(screen.getByLabelText("setting.anonymous-reaction.hostnames"), {
      target: { value: " MEMOS.EXAMPLE \nmemos.example,other.example" },
    });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    const request = mocks.save.mock.calls[0][0];
    expect(request.name).toBe(`instance/settings/${InstanceSetting_Key[InstanceSetting_Key.ANONYMOUS_REACTION]}`);
    expect(request.value.value).toMatchObject({
      enabled: true,
      siteKey: "public-key",
      secretKey: "private-key",
      hostnames: ["memos.example", "other.example"],
    });
  });

  it("keeps a saved secret out of the form and permits disabling without re-entering it", async () => {
    mocks.query.data = create(InstanceSettingSchema, {
      name: "instance/settings/ANONYMOUS_REACTION",
      value: {
        case: "anonymousReactionSetting",
        value: create(InstanceSetting_AnonymousReactionSettingSchema, {
          enabled: true,
          siteKey: "public-key",
          hasSecret: true,
          hostnames: ["memos.example"],
        }),
      },
    });
    render(<MemoRelatedSettings />);
    expect(screen.getByLabelText("Secret Key")).toHaveValue("");
    expect(screen.getByText("setting.anonymous-reaction.secret-configured")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("switch", { name: "setting.anonymous-reaction.enabled" }));
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.save.mock.calls[0][0].value.value).toMatchObject({ enabled: false, secretKey: "" });
  });

  it("saves memo and anonymous settings from the same button", async () => {
    render(<MemoRelatedSettings />);
    fireEvent.change(screen.getByRole("spinbutton", { name: "setting.memo.content-length-limit" }), { target: { value: "16384" } });
    fireEvent.click(screen.getByRole("switch", { name: "setting.anonymous-reaction.enabled" }));
    fireEvent.change(screen.getByLabelText("Site Key"), { target: { value: "new-key" } });
    fireEvent.change(screen.getByLabelText("Secret Key"), { target: { value: "new-secret" } });
    fireEvent.change(screen.getByLabelText("setting.anonymous-reaction.hostnames"), { target: { value: "memos.example" } });
    fireEvent.click(screen.getByRole("button", { name: "common.save" }));
    await waitFor(() => expect(mocks.save).toHaveBeenCalledTimes(1));
    expect(mocks.updateMemo).toHaveBeenCalledTimes(1);
    expect(mocks.updateMemo.mock.calls[0][0].value.value.contentLengthLimit).toBe(16384);
    expect(mocks.save.mock.calls[0][0].value.value.siteKey).toBe("new-key");
  });

  it("reveals Turnstile under the anonymous switch and preserves draft fields when collapsed", () => {
    render(<MemoRelatedSettings />);
    const toggle = screen.getByRole("switch", { name: "setting.anonymous-reaction.enabled" });
    expect(screen.queryByText("Cloudflare Turnstile")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    fireEvent.change(screen.getByLabelText("Site Key"), { target: { value: "draft-key" } });
    expect(toggle.parentElement?.parentElement?.parentElement).toContainElement(screen.getByText("Cloudflare Turnstile"));
    fireEvent.click(toggle);
    expect(screen.queryByLabelText("Site Key")).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByLabelText("Site Key")).toHaveValue("draft-key");
  });

  it("cannot overwrite a configuration when loading failed", () => {
    mocks.query.isError = true;
    render(<MemoRelatedSettings />);
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "common.save" })).toBeDisabled();
    expect(screen.queryByLabelText("Secret Key")).not.toBeInTheDocument();
  });
});
