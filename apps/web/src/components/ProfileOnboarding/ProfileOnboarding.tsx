import { useEffect, useRef, useState, type FormEvent } from "react";
import type { OnboardingMessage, UserProfileInput } from "@calos/core";

type Turn = OnboardingMessage & { profile?: UserProfileInput };

const greeting =
  "Vamos a preparar un objetivo de calorías y macros para ti. ¿Cómo te llamas y qué te gustaría conseguir? Puedes contarme también tu edad, altura, peso y cómo es tu actividad habitual.";

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
        "No se ha podido conectar con Calos. Tu mensaje sigue aquí; vuelve a enviarlo.",
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
      <section className="onboarding" aria-label="Crear tu perfil">
        <div className="onboarding-brand">
          <img src="./branding/calos-icon.svg" alt="" width="44" height="44" />
          <span>calos</span>
          {onCancel && (
            <button
              type="button"
              className="quiet-button onboarding-cancel"
              onClick={onCancel}
              disabled={waiting || busy}
            >
              Cancelar
            </button>
          )}
        </div>
        <div
          ref={conversation}
          className="onboarding-conversation"
          role="log"
          aria-label="Conversación para crear tu perfil"
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
                {message.role === "assistant" ? "Calos" : "Tú"}
              </span>
              <p>{message.text}</p>
            </div>
          ))}
          {pendingText && (
            <div className="onboarding-message onboarding-message-user">
              <span className="onboarding-speaker">Tú</span>
              <p>{pendingText}</p>
            </div>
          )}
          {waiting && (
            <p className="onboarding-thinking" role="status">
              Calos está preparando su respuesta…
            </p>
          )}
        </div>
        {proposal && (
          <section className="onboarding-proposal" aria-labelledby="proposal-title">
            <h2 id="proposal-title">Tu punto de partida</h2>
            <p>
              {proposal.name} · {proposal.age} años · {proposal.heightCm} cm ·{" "}
              {proposal.weightKg} kg
            </p>
            <p>{proposal.goal}</p>
            <dl className="onboarding-targets">
              {[
                ["Calorías", proposal.dailyCalories, "kcal"],
                ["Proteína", proposal.dailyProtein, "g"],
                ["Carbohidratos", proposal.dailyCarbs, "g"],
                ["Grasas", proposal.dailyFat, "g"],
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
              Se guardarán en tu perfil como objetivos diarios. Si quieres cambiar algo,
              dímelo abajo.
            </p>
            <button
              type="button"
              className="quiet-button onboarding-primary"
              disabled={waiting || busy || Boolean(text.trim())}
              onClick={save}
            >
              {busy ? "Creando perfil…" : "Aplicar objetivos y empezar"}
            </button>
          </section>
        )}
        {(failure || error) && (
          <p className="waist-error" role="alert">
            {failure ||
              "No se ha podido guardar el perfil. Tu propuesta sigue aquí; vuelve a aplicar los objetivos."}
          </p>
        )}
        {messages.length < 40 ? (
          <form className="onboarding-composer" onSubmit={submit}>
            {proposal && (
              <label htmlFor="onboarding-message">¿Quieres ajustar algo?</label>
            )}
            <textarea
              ref={input}
              id="onboarding-message"
              aria-label={proposal ? undefined : "Tu mensaje"}
              value={text}
              onChange={(event) => setText(event.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Escribe como hablarías con Calos…"
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
              <span>Enter para enviar · Mayús + Enter para otra línea</span>
              <button
                type="submit"
                className="quiet-button onboarding-primary"
                disabled={!text.trim() || waiting || busy}
              >
                {waiting ? "Preparando…" : "Enviar"}
              </button>
            </div>
          </form>
        ) : (
          <div className="onboarding-actions">
            <p>Esta conversación ha llegado a su límite.</p>
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
              Volver a empezar
            </button>
          </div>
        )}
      </section>
    </main>
  );
}
