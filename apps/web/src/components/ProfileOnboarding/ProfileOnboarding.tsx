import { useEffect, useRef, useState, type FormEvent } from "react";
import type { OnboardingMessage, UserProfileInput } from "@calos/core";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "../LanguageSelector.js";

type Turn = OnboardingMessage & { profile?: UserProfileInput };

export function ProfileOnboarding({
  onSave,
  onCancel,
  busy,
  error,
}: {
  onSave: (input: UserProfileInput) => Promise<unknown>;
  onCancel?: () => void;
  busy: boolean;
  error: boolean;
}) {
  const { t } = useTranslation();
  const greeting = t("onboarding.greeting");
  const [messages, setMessages] = useState<Turn[]>([
    { role: "assistant", text: greeting },
  ]);
  const [text, setText] = useState("");
  const [pendingText, setPendingText] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [failure, setFailure] = useState("");
  const [proposal, setProposal] = useState<UserProfileInput | null>(null);
  const conversation = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const sending = useRef(false);
  useEffect(() => {
    setMessages((current) =>
      current.length === 1 && current[0]?.role === "assistant"
        ? [{ role: "assistant", text: greeting }]
        : current,
    );
  }, [greeting]);
  useEffect(() => {
    const log = conversation.current;

    if (log) {
      log.scrollTop = log.scrollHeight;
    }
  }, [messages, waiting, failure, proposal]);
  useEffect(() => {
    const log = conversation.current;

    if (!log) {
      return;
    }

    const observer = new ResizeObserver(() => {
      log.scrollTop = log.scrollHeight;
    });
    observer.observe(log);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!waiting) {
      input.current?.focus();
    }
  }, [waiting]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const value = text.trim();

    if (!value || sending.current || busy) {
      return;
    }
    sending.current = true;
    setWaiting(true);
    setPendingText(value);
    setFailure("");
    setProposal(null);
    try {
      const reply = await window.calos.onboard(
        value,
        messages.map(({ role, text: content, profile }) => ({
          role,
          text: profile
            ? `${content}\nPropuesta pendiente: ${JSON.stringify(profile)}`
            : content,
        })),
      );

      if (reply.error) {
        setFailure(reply.message);
      } else {
        setMessages((current) => [
          ...current,
          { role: "user", text: value },
          {
            role: "assistant",
            text: reply.message,
            ...(reply.profile ? { profile: reply.profile } : {}),
          },
        ]);
        setProposal(reply.profile);
        setText("");
      }
    } catch {
      setFailure(
        t("onboarding.networkError"),
      );
    } finally {
      sending.current = false;
      setWaiting(false);
      setPendingText("");
      input.current?.focus();
    }
  };
  const save = async () => {
    if (!proposal || sending.current || busy) {
      return;
    }
    sending.current = true;
    try {
      await onSave(proposal);
    } catch {
      /* Keep the proposal available to retry. */
    } finally {
      sending.current = false;
    }
  };
  return (
    <main className="onboarding-shell">
      <section className="onboarding" aria-label={t("onboarding.title")}>
        <div className="onboarding-brand">
          <img src="./branding/calos-icon.svg" alt="" width="44" height="44" />
          <span>calos</span>
          <LanguageSelector />
          {onCancel && (
            <button
              type="button"
              className="quiet-button onboarding-cancel"
              onClick={onCancel}
              disabled={waiting || busy}
            >
              {t("common.cancel")}
            </button>
          )}
        </div>
        <div
          ref={conversation}
          className="onboarding-conversation"
          role="log"
          aria-label={t("onboarding.conversation")}
          aria-live="polite"
          aria-relevant="additions text"
          aria-busy={waiting}
        >
          {messages.map((message, index) => (
            <div
              key={index}
              className={`onboarding-message onboarding-message-${message.role}`}
            >
              <span className="onboarding-speaker">
                {message.role === "assistant" ? t("onboarding.calos") : t("onboarding.you")}
              </span>
              <p>{message.text}</p>
            </div>
          ))}
          {pendingText && (
            <div className="onboarding-message onboarding-message-user">
              <span className="onboarding-speaker">{t("onboarding.you")}</span>
              <p>{pendingText}</p>
            </div>
          )}
          {waiting && (
            <p className="onboarding-thinking" role="status">
              {t("onboarding.thinking")}
            </p>
          )}
        </div>
        {proposal && (
          <section className="onboarding-proposal" aria-labelledby="proposal-title">
            <h2 id="proposal-title">{t("onboarding.startingPoint")}</h2>
            <p>
              {proposal.name} · {proposal.age} {t("onboarding.years")} · {proposal.heightCm} cm ·{" "}
              {proposal.weightKg} kg
            </p>
            <p>{proposal.goal}</p>
            <dl className="onboarding-targets">
              {[
                [t("onboarding.calories"), proposal.dailyCalories, "kcal"],
                [t("onboarding.protein"), proposal.dailyProtein, "g"],
                [t("onboarding.carbs"), proposal.dailyCarbs, "g"],
                [t("onboarding.fat"), proposal.dailyFat, "g"],
              ].map(([label, value, unit]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>
                    {value} <span>{unit}</span>
                  </dd>
                </div>
              ))}
            </dl>
            <p className="onboarding-hint">
              {t("onboarding.saveHint")}
            </p>
            <button
              type="button"
              className="quiet-button onboarding-primary"
              disabled={waiting || busy || Boolean(text.trim())}
              onClick={save}
            >
              {busy ? t("onboarding.creating") : t("onboarding.applyStart")}
            </button>
          </section>
        )}
        {(failure || error) && (
          <p className="waist-error" role="alert">
            {failure || t("onboarding.saveError")}
          </p>
        )}
        {messages.length < 40 ? (
          <form className="onboarding-composer" onSubmit={submit}>
            {proposal && (
              <label htmlFor="onboarding-message">{t("onboarding.adjust")}</label>
            )}
            <textarea
              ref={input}
              id="onboarding-message"
              aria-label={proposal ? undefined : t("onboarding.yourMessage")}
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={2000}
              rows={3}
              placeholder={t("onboarding.placeholder")}
              autoFocus
              disabled={waiting || busy}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <div className="onboarding-actions">
              <span>{t("onboarding.enterHint")}</span>
              <button
                type="submit"
                className="quiet-button onboarding-primary"
                disabled={!text.trim() || waiting || busy}
              >
                {waiting ? t("onboarding.preparing") : t("assistant.send")}
              </button>
            </div>
          </form>
        ) : (
          <div className="onboarding-actions">
            <p>{t("onboarding.limit")}</p>
            <button
              type="button"
              className="quiet-button"
              onClick={() => {
                setMessages([{ role: "assistant", text: greeting }]);
                setProposal(null);
                setFailure("");
                setText("");
              }}
            >
              {t("onboarding.restart")}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
