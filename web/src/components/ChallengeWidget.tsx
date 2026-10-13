import { useEffect, useRef } from "react";
import { useInstance } from "@/contexts/InstanceContext";

/** Header carrying the challenge token; the server forwards it to the verifier. */
export const CHALLENGE_TOKEN_HEADER = "Challenge-Token";

interface Props {
  /** Receives the token when the user passes, and null when it expires or resets. */
  onToken: (token: string | null) => void;
  /** Reports loading or verification errors so action dialogs can exit cleanly. */
  onError?: () => void;
  /** Bump to reset the widget, for instance after the server rejected a token. */
  resetKey?: number;
  /** Use a separate widget configuration without affecting signup or sign-in. */
  challenge?: { provider: string; siteKey: string };
  action?: string;
}

interface ProviderScript {
  src: string;
  global: "turnstile" | "hcaptcha";
}

// Both providers expose the same explicit-render API shape.
const PROVIDERS: Record<string, ProviderScript> = {
  turnstile: { src: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit", global: "turnstile" },
  hcaptcha: { src: "https://js.hcaptcha.com/1/api.js?render=explicit", global: "hcaptcha" },
};

interface WidgetApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId?: string) => void;
  remove?: (widgetId: string) => void;
}

const scriptLoads = new Map<string, Promise<WidgetApi>>();

function loadProvider(provider: ProviderScript): Promise<WidgetApi> {
  const existing = scriptLoads.get(provider.src);
  if (existing) {
    return existing;
  }
  const script = document.createElement("script");
  const load = new Promise<WidgetApi>((resolve, reject) => {
    const ready = () => {
      const api = (window as unknown as Record<string, WidgetApi | undefined>)[provider.global];
      if (api) resolve(api);
      else reject(new Error(`challenge provider ${provider.global} did not initialize`));
    };
    script.src = provider.src;
    script.async = true;
    script.onload = ready;
    script.onerror = () => reject(new Error(`failed to load challenge provider ${provider.global}`));
    document.head.appendChild(script);
  });
  // A transient failure must not be cached, or every later mount and reset
  // would inherit it and sign-in would stay blocked until a page reload.
  load.catch(() => {
    scriptLoads.delete(provider.src);
    script.remove();
  });
  scriptLoads.set(provider.src, load);
  return load;
}

/**
 * Renders the proof-of-humanity widget the instance profile asks for, or
 * nothing when the instance has none. The open-source app carries the widget
 * code for the providers it knows; verification happens on the server.
 */
function ChallengeWidget({ onToken, onError, resetKey = 0, challenge: configuredChallenge, action }: Props) {
  const { profile } = useInstance();
  const challenge = configuredChallenge ?? profile.challenge;
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<{ api: WidgetApi; id: string } | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  const provider = challenge ? PROVIDERS[challenge.provider] : undefined;
  const siteKey = challenge?.siteKey ?? "";

  useEffect(() => {
    if (!provider || !siteKey || !containerRef.current) {
      return;
    }
    let cancelled = false;
    const container = containerRef.current;
    loadProvider(provider)
      .then((api) => {
        if (cancelled) return;
        const id = api.render(container, {
          sitekey: siteKey,
          ...(action ? { action } : {}),
          callback: (token: string) => !cancelled && onTokenRef.current(token),
          "expired-callback": () => !cancelled && onTokenRef.current(null),
          "error-callback": () => {
            if (cancelled) return;
            onTokenRef.current(null);
            onErrorRef.current?.();
          },
        });
        widgetRef.current = { api, id };
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error(error);
        onTokenRef.current(null);
        onErrorRef.current?.();
      });
    return () => {
      cancelled = true;
      const widget = widgetRef.current;
      widgetRef.current = null;
      if (widget) {
        try {
          widget.api.remove?.(widget.id);
        } catch {
          // The provider script may already be gone; nothing to clean up.
        }
      }
      container.replaceChildren();
    };
  }, [provider, siteKey, action]);

  useEffect(() => {
    if (resetKey === 0) return;
    const widget = widgetRef.current;
    if (widget) {
      widget.api.reset(widget.id);
      onTokenRef.current(null);
    }
  }, [resetKey]);

  if (!provider || !siteKey) {
    return null;
  }
  return <div ref={containerRef} className="flex justify-center" />;
}

export default ChallengeWidget;
