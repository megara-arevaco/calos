import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { OnboardingMessage, UserProfileInput } from "@calos/core";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "../LanguageSelector.js";
import { AssistantQuotaNotice } from "../ChatAssistant/AssistantQuotaNotice.js";
import { queryKeys } from "../../queries/queryKeys.js";

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
  const client = useQueryClient();
  const greeting = t("onboarding.greeting");
  const [messages, setMessages] = useState<Turn[]>([
    { role: "assistant", text: greeting },
  ]);
  const [text, setText] = useState("");
  const [pendingText, setPendingText] = useState("");
  const [waiting, setWaiting] = useState(false);
  const [failure, setFailure] = useState("");
  const [proposal, setProposal] = useState<UserProfileInput | null>(null);
  const [manual, setManual] = useState(false);
  const [manualError, setManualError] = useState("");
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
      setFailure(t("onboarding.networkError"));
    } finally {
      await client.invalidateQueries({ queryKey: queryKeys.assistantUsage() });
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
  const saveManual = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending.current || busy) {
      return;
    }

    const values = new FormData(event.currentTarget);
    const number = (key: string) => Number(values.get(key));
    sending.current = true;
    setManualError("");
    try {
      await onSave({
        name: String(values.get("name")),
        age: number("age"),
        heightCm: number("heightCm"),
        weightKg: number("weightKg"),
        goal: String(values.get("goal")),
        activity: String(values.get("activity")) as UserProfileInput["activity"],
        dietaryPreferences: String(values.get("dietaryPreferences") ?? ""),
        assistantInstructions: "",
        dailyCalories: number("dailyCalories"),
        dailyProtein: number("dailyProtein"),
        dailyCarbs: number("dailyCarbs"),
        dailyFat: number("dailyFat"),
        targetWeightKg: null,
        targetDate: null,
        habits: [],
      });
    } catch {
      setManualError(t("onboarding.manualSaveError"));
    } finally {
      sending.current = false;
    }
  };

  if (manual) {
    return (
      <main className="onboarding-shell">
        <section
          className="onboarding manual-onboarding"
          aria-label={t("onboarding.manualTitle")}
        >
          <div className="onboarding-brand">
            <img src="./branding/calos-icon.svg" alt="" width="44" height="44" />
            <span>calos</span>
            <LanguageSelector />
            {onCancel && (
              <button
                type="button"
                className="quiet-button onboarding-cancel"
                onClick={onCancel}
                disabled={busy}
              >
                {t("common.cancel")}
              </button>
            )}
          </div>
          <h1>{t("onboarding.manualTitle")}</h1>
          <p className="waist-help">{t("onboarding.manualHelp")}</p>
          <form className="manual-profile-form" onSubmit={saveManual}>
            <label>
              {t("onboarding.name")}
              <input name="name" required maxLength={80} autoComplete="name" />
            </label>
            <div className="manual-profile-grid">
              <label>
                {t("onboarding.age")}
                <input name="age" type="number" min="1" max="120" required />
              </label>
              <label>
                {t("onboarding.height")}
                <input
                  name="heightCm"
                  type="number"
                  min="50"
                  max="250"
                  step="0.1"
                  required
                />
              </label>
              <label>
                {t("onboarding.weight")}
                <input
                  name="weightKg"
                  type="number"
                  min="10"
                  max="500"
                  step="0.1"
                  required
                />
              </label>
              <label>
                {t("onboarding.activity")}
                <select name="activity" defaultValue="moderate" required>
                  <option value="low">{t("onboarding.activityLow")}</option>
                  <option value="moderate">{t("onboarding.activityModerate")}</option>
                  <option value="high">{t("onboarding.activityHigh")}</option>
                </select>
              </label>
            </div>
            <label>
              {t("onboarding.goal")}
              <input name="goal" required maxLength={500} />
            </label>
            <label>
              {t("onboarding.preferences")}
              <textarea name="dietaryPreferences" maxLength={1000} rows={2} />
            </label>
            <fieldset>
              <legend>{t("onboarding.manualTargets")}</legend>
              <p>{t("onboarding.manualTargetsHelp")}</p>
              <div className="manual-profile-grid">
                <label>
                  {t("onboarding.calories")} (kcal)
                  <input
                    name="dailyCalories"
                    type="number"
                    min="300"
                    max="10000"
                    step="1"
                    required
                  />
                </label>
                <label>
                  {t("onboarding.protein")} (g)
                  <input
                    name="dailyProtein"
                    type="number"
                    min="0"
                    max="1000"
                    step="0.1"
                    required
                  />
                </label>
                <label>
                  {t("onboarding.carbs")} (g)
                  <input
                    name="dailyCarbs"
                    type="number"
                    min="0"
                    max="2000"
                    step="0.1"
                    required
                  />
                </label>
                <label>
                  {t("onboarding.fat")} (g)
                  <input
                    name="dailyFat"
                    type="number"
                    min="0"
                    max="1000"
                    step="0.1"
                    required
                  />
                </label>
              </div>
            </fieldset>
            {manualError && (
              <p className="waist-error" role="alert">
                {manualError}
              </p>
            )}
            {error && (
              <p className="waist-error" role="alert">
                {t("onboarding.saveError")}
              </p>
            )}
            <div className="onboarding-actions">
              <button
                type="button"
                className="quiet-button"
                onClick={() => setManual(false)}
                disabled={busy}
              >
                {t("onboarding.useAssistant")}
              </button>
              <button
                type="submit"
                className="quiet-button onboarding-primary"
                disabled={busy}
              >
                {busy ? t("onboarding.creating") : t("onboarding.createManual")}
              </button>
            </div>
          </form>
        </section>
      </main>
    );
  }
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
        <div className="onboarding-mode">
          <p>{t("onboarding.manualOption")}</p>
          <button
            type="button"
            className="quiet-button"
            onClick={() => setManual(true)}
          >
            {t("onboarding.createManual")}
          </button>
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
                {message.role === "assistant"
                  ? t("onboarding.calos")
                  : t("onboarding.you")}
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
              {proposal.name} · {proposal.age} {t("onboarding.years")} ·{" "}
              {proposal.heightCm} cm · {proposal.weightKg} kg
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
            <p className="onboarding-hint">{t("onboarding.saveHint")}</p>
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
            <p className="onboarding-privacy">{t("onboarding.privacy")}</p>
            <AssistantQuotaNotice />
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
