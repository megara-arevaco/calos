import type { LocalProfile } from "@calos/core";
import type { AppView } from "../App/App.hook.js";
import { useTranslation } from "react-i18next";
import { LanguageSelector } from "../LanguageSelector.js";
export function Sidebar({
  view,
  setView,
  profiles,
  activeId,
  onSelect,
  onCreate,
  busy,
}: {
  profiles: LocalProfile[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  busy: boolean;
  view: AppView;
  setView: (view: AppView) => void;
}) {
  const { t } = useTranslation();
  return (
    <aside className="sidebar">
      <div className="brand">
        <img
          className="brand-mark"
          src="./branding/calos-icon.svg"
          alt=""
          aria-hidden="true"
          width="36"
          height="36"
        />
        <span>calos</span>
      </div>
      <nav aria-label={t("nav.sections")}>
        {(
          [
            { id: "comida", key: "food", icon: "⌘", panel: "comida-panel" },
            { id: "cintura", key: "waist", icon: "↔", panel: "cintura-panel" },
            { id: "peso", key: "weight", icon: "⚖", panel: "peso-panel" },
            { id: "asistente", key: "assistant", icon: "◌", panel: "chat" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={view === tab.id ? "active" : ""}
            aria-current={view === tab.id ? "page" : undefined}
            aria-controls={tab.panel}
            aria-label={t(`nav.${tab.key}`)}
            title={t(`nav.${tab.key}`)}
            onClick={() => setView(tab.id)}
          >
            <span aria-hidden="true">{tab.icon}</span>
            <span className="nav-label">{t(`nav.${tab.key}`)}</span>
          </button>
        ))}
      </nav>
      <div className="profile-switcher">
        <label htmlFor="active-profile">{t("nav.activeProfile")}</label>
        <select
          id="active-profile"
          value={activeId}
          onChange={(event) => onSelect(event.target.value)}
          disabled={busy}
        >
          {profiles.map((profile) => (
            <option value={profile.id} key={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={onCreate} disabled={busy}>
          {t("nav.newProfile")}
        </button>
      </div>
      <div className="sidebar-footer">
        <LanguageSelector />
        <span className="status-dot" /> {t("nav.serverData")}
      </div>
    </aside>
  );
}
