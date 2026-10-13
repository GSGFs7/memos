import { act, render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ChallengeWidget from "@/components/ChallengeWidget";

const api = vi.hoisted(() => ({
  render: vi.fn((_container: HTMLElement, _options: Record<string, unknown>) => "widget"),
  remove: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("@/contexts/InstanceContext", () => ({ useInstance: () => ({ profile: {} }) }));

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(window, "turnstile", { configurable: true, value: api });
});

const loadTurnstile = async () => {
  await act(async () => {
    document.querySelector<HTMLScriptElement>('script[src*="challenges.cloudflare.com"]')?.dispatchEvent(new Event("load"));
  });
  await waitFor(() => expect(api.render).toHaveBeenCalled());
};

describe("challenge widget lifecycle", () => {
  it("forwards verification and errors, but ignores callbacks from an unmounted widget", async () => {
    const onToken = vi.fn();
    const onError = vi.fn();
    const { unmount } = render(
      <ChallengeWidget challenge={{ provider: "turnstile", siteKey: "public" }} onToken={onToken} onError={onError} />,
    );
    await loadTurnstile();
    const options = api.render.mock.calls[0][1] as Record<string, (...args: unknown[]) => void>;
    options.callback("proof");
    expect(onToken).toHaveBeenLastCalledWith("proof");
    options["expired-callback"]();
    expect(onToken).toHaveBeenLastCalledWith(null);
    expect(onError).not.toHaveBeenCalled();
    options["error-callback"]();
    expect(onError).toHaveBeenCalledTimes(1);
    unmount();
    onToken.mockClear();
    onError.mockClear();
    options.callback("late-proof");
    options["error-callback"]();
    expect(onToken).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(api.remove).toHaveBeenCalledWith("widget");
  });

  it("reports script loading failure and permits loading again on the next mount", async () => {
    const onToken = vi.fn();
    const onError = vi.fn();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const props = { challenge: { provider: "hcaptcha", siteKey: "public" }, onToken, onError };
    const { unmount } = render(<ChallengeWidget {...props} />);
    const script = document.querySelector<HTMLScriptElement>('script[src*="js.hcaptcha.com"]');
    expect(script).not.toBeNull();
    await act(async () => {
      script?.dispatchEvent(new Event("error"));
    });
    expect(onToken).toHaveBeenCalledWith(null);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(script).not.toBeInTheDocument();
    unmount();
    const next = render(<ChallengeWidget {...props} />);
    expect(document.querySelector('script[src*="js.hcaptcha.com"]')).not.toBe(script);
    next.unmount();
    log.mockRestore();
  });
});
