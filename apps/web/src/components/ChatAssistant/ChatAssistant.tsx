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
export function ChatAssistant({
  view,
  selectedDate,
  setView,
}: {
  view: AppView;
  selectedDate: string;
  setView: (view: AppView) => void;
}) {
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
    <aside className="chat" id="chat" aria-label="Asistente">
      <div className="chat-header">
        <div>
          <span className="chat-orb">
            <ChatCircleDotsIcon weight="fill" />
          </span>
          <div>
            <strong>Asistente Calos</strong>
            <small>
              <i />
              Acompañamiento con OpenRouter
            </small>
          </div>
        </div>
        <button
          aria-label={
            view === "asistente" ? "Volver a Comida" : "Ver solo el asistente"
          }
          onClick={() => setView(view === "asistente" ? "comida" : "asistente")}
        >
          <ArrowUpRightIcon />
        </button>
      </div>
      <p className="chat-context">
        Contexto:{" "}
        {view === "cintura"
          ? "Cintura"
          : view === "peso"
            ? "Peso"
            : view === "asistente"
              ? "Asistente"
              : "Comida"}
        <span>
          {view === "cintura"
            ? "Historial de medidas en cm"
            : view === "peso"
              ? "Historial de medidas en kg"
              : `${selectedDate === today() ? "Día abierto" : "Historial de comidas"} · ${formatDate(selectedDate)}`}
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
          <section className="coach-proposal" aria-label="Propuesta de objetivos">
            <h3>Propuesta para tu perfil</h3>
            <p>{proposal.plan.goal}</p>
            <p>
              {proposal.plan.dailyGoal.calories} kcal · P{" "}
              {proposal.plan.dailyGoal.protein} g · C {proposal.plan.dailyGoal.carbs} g
              · G {proposal.plan.dailyGoal.fat} g
            </p>
            {proposal.plan.targetWeightKg && (
              <p>Peso objetivo: {proposal.plan.targetWeightKg} kg</p>
            )}
            {proposal.plan.targetDate && (
              <p>Fecha orientativa: {proposal.plan.targetDate}</p>
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
                Descartar propuesta
              </button>
              <button
                className="quiet-button onboarding-primary"
                disabled={sending}
                onClick={() => void applyProposal()}
              >
                Aplicar objetivos
              </button>
            </div>
            {planError && (
              <p className="photo-error" role="alert">
                No se han podido aplicar los objetivos. Si han cambiado, descarta esta
                propuesta y revísalos de nuevo.
              </p>
            )}
          </section>
        )}
        {view === "asistente" && messages.length === 1 && !sending && (
          <div className="coach-prompts" aria-label="Empezar con el asistente">
            {[
              "Ayúdame a definir un objetivo realista",
              "Revisa mis comidas y dame tres mejoras",
              "¿Qué puedo cenar según mis preferencias?",
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
        {sending && <div className="message assistant loading">Calculando…</div>}
      </div>
      <form className="composer" onSubmit={send}>
        <label htmlFor="chat-input">
          {view === "cintura" || view === "peso"
            ? "Consulta tu evolución"
            : view === "asistente"
              ? "¿En qué te ayudo?"
              : "¿Qué has comido?"}
        </label>
        <NutritionPhotoInput photo={photo} onChange={setPhoto} disabled={sending} />
        <div className="composer-text">
          <textarea
            id="chat-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={
              view === "cintura"
                ? "Ej. ¿Cuánto ha cambiado mi cintura desde la primera medida?"
                : view === "peso"
                  ? "Ej. ¿Cómo ha evolucionado mi peso?"
                  : view === "asistente"
                    ? "Ej. Quiero mejorar mis hábitos; revisa mi semana y mis objetivos"
                    : "Ej. 100 g de pechuga de pollo asada y 150 g de arroz blanco cocido"
            }
            maxLength={2000}
            rows={3}
          />
          <button disabled={(!draft.trim() && !photo) || sending} aria-label="Enviar">
            <PaperPlaneTiltIcon weight="fill" />
          </button>
        </div>
        <p>Tus mensajes y los datos de esta sección se envían a OpenRouter.</p>
      </form>
    </aside>
  );
}
