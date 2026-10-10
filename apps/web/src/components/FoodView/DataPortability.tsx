import { useEffect, useState, type ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import type { NutritionSnapshot } from "@calos/core";
import { useProfile } from "../../shared/ProfileContext.js";
import { DownloadIcon, TrashIcon, UploadIcon } from "../../shared/icons.js";
import { useFoodTools } from "./useFoodTools.js";

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvCell(value: string | number) {
  let text = String(value);

  if (/^[\s\uFEFF]*[=+\-@]/.test(text)) {
    text = `'${text}`;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

export function DataPortability() {
  const { t, i18n } = useTranslation();
  const profile = useProfile();
  const client = useQueryClient();
  const [status, setStatus] = useState("");
  const [failure, setFailure] = useState("");
  const [backupFailure, setBackupFailure] = useState("");
  const [retentionFailure, setRetentionFailure] = useState("");
  const [retentionSaved, setRetentionSaved] = useState(false);
  const [retentionDraft, setRetentionDraft] = useState({
    trashDays: null as number | null,
    backupsDays: null as number | null,
  });
  const tools = useFoodTools();
  const locale = i18n.resolvedLanguage === "en" ? "en-US" : "es-ES";
  useEffect(() => {
    if (tools.retention.data) {
      setRetentionDraft(tools.retention.data);
    }
  }, [tools.retention.data]);
  const stem = `${t("food.profileJson")}-${profile.name.toLocaleLowerCase().replace(/[^a-z0-9-]+/g, "-")}`;
  const exportData = async (format: "json" | "csv") => {
    setFailure("");
    setStatus("");
    try {
      const snapshot = await window.calos.exportNutrition(profile.id);

      if (format === "json") {
        download(
          `${stem}.json`,
          `${JSON.stringify(snapshot, null, 2)}\n`,
          "application/json;charset=utf-8",
        );
      } else {
        const header = [
          "id",
          "nombre",
          "cantidad",
          "comida",
          "fecha",
          "kcal",
          "proteina_g",
          "carbohidratos_g",
          "grasas_g",
          "fuente",
          "detalle_fuente",
        ];
        const rows = snapshot.entries.map((entry) => [
          entry.id,
          entry.name,
          entry.quantity,
          entry.meal,
          entry.eatenAt.slice(0, 10),
          entry.calories,
          entry.protein,
          entry.carbs,
          entry.fat,
          entry.source?.provider ?? "",
          entry.source && "evidence" in entry.source
            ? entry.source.evidence
            : entry.source && "description" in entry.source
              ? entry.source.description
              : "",
        ]);
        const content = [header, ...rows]
          .map((row) => row.map(csvCell).join(","))
          .join("\r\n");
        download(
          `${stem}-comidas.csv`,
          `\uFEFF${content}\r\n`,
          "text/csv;charset=utf-8",
        );
      }
    } catch {
      setFailure(t("food.exportError"));
    }
  };
  const importData = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }
    setFailure("");
    setStatus("");
    if (!file.name.toLowerCase().endsWith(".json") || file.size > 9 * 1024 * 1024) {
      setFailure(t("food.importInvalid"));
      return;
    }

    let data: unknown;

    try {
      data = JSON.parse(await file.text());
    } catch {
      setFailure(t("food.importInvalid"));
      return;
    }
    if (!window.confirm(t("food.importConfirm"))) {
      return;
    }
    try {
      const result = await window.calos.importNutrition(
        profile.id,
        data as NutritionSnapshot,
      );
      await client.invalidateQueries({ queryKey: ["nutrition", profile.id] });
      setStatus(t("food.importSuccess", { backupId: result.backupId }));
    } catch {
      setFailure(t("food.importError"));
    }
  };
  const downloadSavedBackup = async (id: string) => {
    setBackupFailure("");
    try {
      const backup = await window.calos.downloadBackup(profile.id, id);
      download(
        `${stem}-respaldo-${id}.json`,
        `${JSON.stringify(backup.snapshot, null, 2)}\n`,
        "application/json;charset=utf-8",
      );
    } catch {
      setBackupFailure(t("food.backupError"));
    }
  };
  const restoreSavedBackup = async (id: string) => {
    if (!window.confirm(t("food.backupRestoreConfirm"))) {
      return;
    }
    setBackupFailure("");
    try {
      const result = await tools.restoreBackup.mutateAsync(id);
      setStatus(t("food.backupRestoreSuccess", { backupId: result.backupId }));
    } catch {
      setBackupFailure(t("food.backupError"));
    }
  };
  const deleteSavedBackup = async (id: string) => {
    if (!window.confirm(t("food.backupDeleteConfirm"))) {
      return;
    }
    setBackupFailure("");
    try {
      await tools.deleteBackup.mutateAsync(id);
      setStatus(t("food.backupDeleted"));
    } catch {
      setBackupFailure(t("food.backupError"));
    }
  };
  const saveRetention = async () => {
    setRetentionFailure("");
    setRetentionSaved(false);
    try {
      await tools.saveRetention.mutateAsync(retentionDraft);
      setRetentionSaved(true);
    } catch {
      setRetentionFailure(t("food.retentionError"));
    }
  };

  return (
    <details className="data-portability">
      <summary>{t("food.dataPortability")}</summary>
      <p>{t("food.importHelp")}</p>
      <div className="portability-actions">
        <button
          type="button"
          className="quiet-button"
          onClick={() => void exportData("json")}
        >
          <DownloadIcon /> {t("food.exportJson")}
        </button>
        <button
          type="button"
          className="quiet-button"
          onClick={() => void exportData("csv")}
        >
          <DownloadIcon /> {t("food.exportCsv")}
        </button>
        <label className="quiet-button portability-upload">
          <UploadIcon /> {t("food.importJson")}
          <input
            type="file"
            accept=".json,application/json"
            onChange={(event) => void importData(event)}
          />
        </label>
      </div>
      {status && (
        <p className="waist-notice" role="status">
          {status}
        </p>
      )}
      {failure && (
        <p className="waist-error" role="alert">
          {failure}
        </p>
      )}
      <section className="backup-management" aria-labelledby="backup-management-title">
        <h3 id="backup-management-title">{t("food.backupManagement")}</h3>
        <p>{t("food.backupManagementHelp")}</p>
        {tools.backups.isLoading ? (
          <p role="status">{t("common.loading")}</p>
        ) : tools.backups.data?.length ? (
          <ul>
            {tools.backups.data.map((backup) => (
              <li key={backup.id}>
                <span>
                  <strong>{new Date(backup.createdAt).toLocaleString(locale)}</strong>
                  <small>
                    {backup.id} ·{" "}
                    {(backup.size / 1024).toLocaleString(locale, {
                      maximumFractionDigits: 1,
                    })}{" "}
                    KiB
                  </small>
                </span>
                <div className="backup-actions">
                  <button
                    type="button"
                    className="quiet-button"
                    onClick={() => void downloadSavedBackup(backup.id)}
                  >
                    <DownloadIcon /> {t("food.downloadBackup")}
                  </button>
                  <button
                    type="button"
                    className="quiet-button"
                    onClick={() => void restoreSavedBackup(backup.id)}
                    disabled={tools.restoreBackup.isPending}
                  >
                    <UploadIcon /> {t("food.restoreBackup")}
                  </button>
                  <button
                    type="button"
                    className="quiet-button"
                    onClick={() => void deleteSavedBackup(backup.id)}
                  >
                    <TrashIcon /> {t("food.deleteBackup")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>{t("food.noBackups")}</p>
        )}
        {backupFailure && (
          <p className="waist-error" role="alert">
            {backupFailure}
          </p>
        )}
      </section>
      <section className="retention-settings" aria-labelledby="retention-title">
        <h3 id="retention-title">{t("food.retentionTitle")}</h3>
        <p>{t("food.retentionHelp")}</p>
        <div className="retention-controls">
          <label>
            {t("food.trashRetention")}
            <select
              value={retentionDraft.trashDays ?? ""}
              onChange={(event) =>
                setRetentionDraft((current) => ({
                  ...current,
                  trashDays: event.target.value ? Number(event.target.value) : null,
                }))
              }
            >
              <option value="">{t("food.keepForever")}</option>
              <option value="30">30 {t("food.days")}</option>
              <option value="90">90 {t("food.days")}</option>
              <option value="365">365 {t("food.days")}</option>
            </select>
          </label>
          <label>
            {t("food.backupRetention")}
            <select
              value={retentionDraft.backupsDays ?? ""}
              onChange={(event) =>
                setRetentionDraft((current) => ({
                  ...current,
                  backupsDays: event.target.value ? Number(event.target.value) : null,
                }))
              }
            >
              <option value="">{t("food.keepForever")}</option>
              <option value="30">30 {t("food.days")}</option>
              <option value="90">90 {t("food.days")}</option>
              <option value="365">365 {t("food.days")}</option>
            </select>
          </label>
          <button
            type="button"
            className="quiet-button"
            onClick={() => void saveRetention()}
            disabled={tools.saveRetention.isPending}
          >
            {tools.saveRetention.isPending
              ? t("common.saving")
              : t("food.saveRetention")}
          </button>
        </div>
        {retentionSaved && (
          <p className="waist-notice" role="status">
            {t("food.retentionSaved")}
          </p>
        )}
        {retentionFailure && (
          <p className="waist-error" role="alert">
            {retentionFailure}
          </p>
        )}
      </section>
    </details>
  );
}
