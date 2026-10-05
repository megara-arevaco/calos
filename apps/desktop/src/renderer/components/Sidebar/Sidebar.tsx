import type { LocalProfile } from "@calos/core";
import type { AppView } from "../App/App.hook.js";
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
      <nav aria-label="Secciones">
        {(
          [
            { id: "comida", label: "Comida", icon: "⌘", panel: "comida-panel" },
            { id: "cintura", label: "Cintura", icon: "↔", panel: "cintura-panel" },
            { id: "peso", label: "Peso", icon: "⚖", panel: "peso-panel" },
            { id: "asistente", label: "Asistente", icon: "◌", panel: "chat" },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={view === tab.id ? "active" : ""}
            aria-current={view === tab.id ? "page" : undefined}
            aria-controls={tab.panel}
            aria-label={tab.label}
            title={tab.label}
            onClick={() => setView(tab.id)}
          >
            <span aria-hidden="true">{tab.icon}</span>
            <span className="nav-label">{tab.label}</span>
          </button>
        ))}
      </nav>
      <div className="profile-switcher">
        <label htmlFor="active-profile">Perfil activo</label>
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
          Nuevo perfil
        </button>
      </div>
      <div className="sidebar-footer">
        <span className="status-dot" /> Datos en tu equipo
      </div>
    </aside>
  );
}
