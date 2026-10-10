import { Sidebar } from "../Sidebar/index.js";
import { FoodView } from "../FoodView/index.js";
import { ChatAssistant } from "../ChatAssistant/index.js";
import { WaistTracker } from "../WaistTracker/index.js";
import { WeightTracker } from "../WeightTracker/index.js";
import { useApp } from "./App.hook.js";

import { useProfiles } from "../../queries/profile.queries.js";
import { ProfileContext } from "../../shared/ProfileContext.js";
import { ProfileOnboarding } from "../ProfileOnboarding/index.js";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import type { FoodEntry } from "@calos/core";

export function App() {
  const { t } = useTranslation();
  const profiles = useProfiles();

  if (profiles.registry.isPending) {
    return (
      <main className="onboarding-shell">
        <p role="status">{t("app.loadingProfiles")}</p>
      </main>
    );
  }
  if (profiles.registry.isError) {
    return (
      <main className="onboarding-shell">
        <div>
          <p role="alert">{t("app.profileLoadError")}</p>
          <button onClick={() => void profiles.registry.refetch()}>
            {t("common.retry")}
          </button>
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
  const { t } = useTranslation();
  const state = useApp();
  const [editingEntry, setEditingEntry] = useState<FoodEntry | null>(null);
  const editFood = (entry: FoodEntry | null) => {
    if (entry) {
      state.setSelectedDate(entry.eatenAt.slice(0, 10));
      state.setView("comida");
    }
    setEditingEntry(entry);
  };
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
          {t("app.profileSwitchError")}
        </p>
      )}
      <div className="workspace">
        <FoodView {...state} editingEntry={editingEntry} onEdit={editFood} />
        <section
          className="content waist-content"
          id="cintura-panel"
          hidden={state.view !== "cintura"}
          aria-label={t("nav.waistMeasurements")}
        >
          <WaistTracker />
        </section>
        <section
          className="content waist-content"
          id="peso-panel"
          hidden={state.view !== "peso"}
          aria-label={t("nav.weightMeasurements")}
        >
          <WeightTracker />
        </section>
        <ChatAssistant
          view={state.view}
          selectedDate={state.selectedDate}
          setView={state.setView}
          onEditFood={editFood}
        />
      </div>
    </main>
  );
}
