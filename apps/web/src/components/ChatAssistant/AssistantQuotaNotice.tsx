import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { queryKeys } from "../../queries/queryKeys.js";

export function AssistantQuotaNotice({ onManual }: { onManual?: () => void }) {
  const { t, i18n } = useTranslation();
  const usage = useQuery({
    queryKey: queryKeys.assistantUsage(),
    queryFn: () => window.calos.aiUsage(),
  });
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "es-ES";

  return (
    <section className="ai-quota-notice" aria-label={t("assistant.quotaTitle")}>
      {usage.data ? (
        <>
          <p>
            {t("assistant.quotaUsage", {
              requests: usage.data.requestsReserved,
              requestLimit: usage.data.requestLimit,
              tokens: usage.data.tokensReserved.toLocaleString(locale),
              tokenLimit: usage.data.tokenLimit.toLocaleString(locale),
            })}
          </p>
          <small>
            {t("assistant.quotaScope", {
              hours: usage.data.periodHours,
              endsAt: new Date(usage.data.periodEndsAt).toLocaleString(locale),
              imageTokens: usage.data.imageTokenReserve.toLocaleString(locale),
            })}
          </small>
        </>
      ) : usage.isError ? (
        <p role="status">{t("assistant.quotaLoadError")}</p>
      ) : (
        <p role="status">{t("common.loading")}</p>
      )}
      {onManual && (
        <button type="button" className="waist-link" onClick={onManual}>
          {t("assistant.manualFallback")}
        </button>
      )}
    </section>
  );
}
