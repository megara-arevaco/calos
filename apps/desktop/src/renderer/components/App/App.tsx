import { Sidebar } from "../Sidebar/index.js";
import { FoodView } from "../FoodView/index.js";
import { ChatAssistant } from "../ChatAssistant/index.js";
import { WaistTracker } from "../WaistTracker/index.js";
import { WeightTracker } from "../WeightTracker/index.js";
import { useApp } from "./App.hook.js";

import { useProfiles } from "../../queries/profile.queries.js";
import { ProfileContext } from "../../shared/ProfileContext.js";
import { ProfileOnboarding } from "../ProfileOnboarding/index.js";

export function App() {
  const profiles = useProfiles();

  if (profiles.registry.isPending) {
    return (
      <main className="onboarding-shell">
        <p role="status">Cargando perfiles…</p>
      </main>
    );
  }
  if (profiles.registry.isError) {
    return (
      <main className="onboarding-shell">
        <div>
          <p role="alert">No se han podido cargar los perfiles.</p>
          <button onClick={() => void profiles.registry.refetch()}>Reintentar</button>
        </div>
      </main>
    );
  }
  if (!profiles.profile || profiles.creating) {
    return (
      <ProfileOnboarding
        onSave={(input) => profiles.create.mutateAsync(input)}
        onCancel={profiles.profile ? () => profiles.setCreating(false) : undefined}
        busy={profiles.create.isPending}
        error={profiles.create.isError}
      />
    );
  }
  return (
    <ProfileContext.Provider key={profiles.profile.id} value={profiles.profile}>
      <AppWorkspace profiles={profiles} />
    </ProfileContext.Provider>
  );
}

function AppWorkspace({ profiles }: { profiles: ReturnType<typeof useProfiles> }) {
  const state = useApp();
  return (
    <main className="app-shell" data-view={state.view}>
      <Sidebar
        view={state.view}
        setView={state.setView}
        profiles={profiles.registry.data!.profiles}
        activeId={profiles.profile!.id}
        onSelect={(id) => void profiles.select.mutateAsync(id).catch(() => undefined)}
        onCreate={() => profiles.setCreating(true)}
        busy={profiles.select.isPending}
      />
      {profiles.select.isError && (
        <p className="profile-error" role="alert">
          No se ha podido cambiar de perfil. Prueba de nuevo.
        </p>
      )}
      <div className="workspace">
        <FoodView {...state} />
        <section
          className="content waist-content"
          id="cintura-panel"
          hidden={state.view !== "cintura"}
          aria-label="Medidas de cintura"
        >
          <WaistTracker />
        </section>
        <section
          className="content waist-content"
          id="peso-panel"
          hidden={state.view !== "peso"}
          aria-label="Medidas de peso"
        >
          <WeightTracker />
        </section>
        <ChatAssistant
          view={state.view}
          selectedDate={state.selectedDate}
          setView={state.setView}
        />
      </div>
    </main>
  );
}
