import { NutritionObjectives } from "../NutritionObjectives/NutritionObjectives.js";
import { NutritionPhotoInput } from "../NutritionPhotoInput/index.js";
import type { AppView } from "../App/App.hook.js";
import { useChatAssistant } from "./ChatAssistant.hook.js";
import { today, formatDate } from "../../shared/presentation.js";
import {
  ArrowUpRightIcon,
  ChatCircleDotsIcon,
  PaperPlaneTiltIcon,
} from "../../shared/icons.js";
import { useTranslation } from "react-i18next";
export function ChatAssistant({
  view,
  selectedDate,
  setView,
}: {
  view: AppView;
  selectedDate: string;
  setView: (view: AppView) => void;
}) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "es-ES";
  const {
    chatMessages,
    photo,
    setPhoto,
    messages,
    sending,
    send,
    draft,
    setDraft,
    proposal,
    applyProposal,
    discardProposal,
    planError,
  } = useChatAssistant(view, selectedDate);
  return (
    <aside className="chat" id="chat" aria-label={t("assistant.label")}>
      <div className="chat-header">
        <div>
          <span className="chat-orb">
            <ChatCircleDotsIcon weight="fill" />
          </span>
          <div>
            <strong>{t("assistant.title")}</strong>
            <small>
              <i />
              {t("assistant.openrouter")}
            </small>
          </div>
        </div>
        <button
          aria-label={
            view === "asistente" ? t("assistant.backToFood") : t("assistant.onlyAssistant")
          }
          onClick={() => setView(view === "asistente" ? "comida" : "asistente")}
        >
          <ArrowUpRightIcon />
        </button>
      </div>
      <p className="chat-context">
        {t("assistant.context")}{" "}
        {view === "cintura"
          ? t("nav.waist")
          : view === "peso"
            ? t("nav.weight")
            : view === "asistente"
              ? t("nav.assistant")
              : t("nav.food")}
        <span>
          {view === "cintura"
            ? t("assistant.waistHistory")
            : view === "peso"
              ? t("assistant.weightHistory")
              : `${selectedDate === today() ? t("assistant.openDay") : t("assistant.foodHistory")} · ${formatDate(selectedDate, locale)}`}
        </span>
      </p>
      <div className="messages" ref={chatMessages}>
        {view === "asistente" && <NutritionObjectives />}
        {messages.map((message, index) => (
          <div className={`message ${message.role}`} key={index}>
            {message.text}
          </div>
        ))}
        {proposal && (
          <section className="coach-proposal" aria-label={t("assistant.goalProposal")}>
            <h3>{t("assistant.proposalForProfile")}</h3>
            <p>{proposal.plan.goal}</p>
            <p>
              {proposal.plan.dailyGoal.calories} kcal · P{" "}
              {proposal.plan.dailyGoal.protein} g · C {proposal.plan.dailyGoal.carbs} g
              · G {proposal.plan.dailyGoal.fat} g
            </p>
            {proposal.plan.targetWeightKg && (
              <p>{t("assistant.targetWeight", { value: proposal.plan.targetWeightKg })}</p>
            )}
            {proposal.plan.targetDate && (
              <p>{t("assistant.targetDate", { value: proposal.plan.targetDate })}</p>
            )}
            {!!proposal.plan.habits.length && (
              <ul>
                {proposal.plan.habits.map((habit, index) => (
                  <li key={index}>{habit}</li>
                ))}
              </ul>
            )}
            {proposal.plan.notes && <p>{proposal.plan.notes}</p>}
            <div className="coach-goal-actions">
              <button
                className="quiet-button"
                disabled={sending}
                onClick={discardProposal}
              >
                {t("assistant.discardProposal")}
              </button>
              <button
                className="quiet-button onboarding-primary"
                disabled={sending}
                onClick={() => void applyProposal()}
              >
                {t("assistant.applyGoals")}
              </button>
            </div>
            {planError && (
              <p className="photo-error" role="alert">
                {t("assistant.applyError")}
              </p>
            )}
          </section>
        )}
        {view === "asistente" && messages.length === 1 && !sending && (
          <div className="coach-prompts" aria-label={t("assistant.start")}>
            {[
              t("assistant.promptGoal"),
              t("assistant.promptImprove"),
              t("assistant.promptDinner"),
            ].map((prompt) => (
              <button
                className="quiet-button"
                key={prompt}
                onClick={() => setDraft(prompt)}
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
        {sending && <div className="message assistant loading">{t("assistant.calculate")}</div>}
      </div>
      <form className="composer" onSubmit={send}>
        <label htmlFor="chat-input">
          {view === "cintura" || view === "peso"
            ? t("assistant.askEvolution")
            : view === "asistente"
              ? t("assistant.askHelp")
              : t("assistant.askFood")}
        </label>
        <NutritionPhotoInput photo={photo} onChange={setPhoto} disabled={sending} />
        <div className="composer-text">
          <textarea
            id="chat-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              view === "cintura"
                ? t("assistant.exampleWaist")
                : view === "peso"
                  ? t("assistant.exampleWeight")
                  : view === "asistente"
                    ? t("assistant.exampleAssistant")
                    : t("assistant.exampleFood")
            }
            maxLength={2000}
            rows={3}
          />
          <button disabled={(!draft.trim() && !photo) || sending} aria-label={t("assistant.send")}>
            <PaperPlaneTiltIcon weight="fill" />
          </button>
        </div>
        <p>{t("assistant.privacy")}</p>
      </form>
    </aside>
  );
}
