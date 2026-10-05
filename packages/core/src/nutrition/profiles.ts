import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import {
  readTextIfExists,
  withFileLock,
  writeJsonAtomically,
} from "../shared/persistence.js";
import { NutritionStore } from "./store.js";
import { profileRegistrySchema, userProfileInputSchema } from "./profile-schema.js";
import type { ProfileRegistry, UserProfileInput } from "./profile-schema.js";

export class LocalProfiles {
  private readonly registryFile: string;
  constructor(private readonly directory: string) {
    this.registryFile = join(directory, "profiles.json");
  }

  private storePath(id: string) {
    return join(
      this.directory,
      "profiles",
      z.string().uuid().parse(id),
      "nutrition.json",
    );
  }

  async list(): Promise<ProfileRegistry> {
    return withFileLock(this.registryFile, async () => {
      const existing = await readTextIfExists(this.registryFile);

      if (existing !== null) {
        const registry = profileRegistrySchema.parse(JSON.parse(existing));

        if (
          registry.activeId &&
          !registry.profiles.some((profile) => profile.id === registry.activeId)
        ) {
          throw new Error("El perfil activo no existe");
        }
        return registry;
      }

      const registry: ProfileRegistry = { version: 1, activeId: null, profiles: [] };

      // Keep the original file intact; publish the migrated registry only after
      // the full legacy snapshot has been written to the initial profile.
      if ((await readTextIfExists(join(this.directory, "nutrition.json"))) !== null) {
        const legacy = await new NutritionStore(
          join(this.directory, "nutrition.json"),
        ).read();
        const id = randomUUID();
        await writeJsonAtomically(this.storePath(id), legacy);
        registry.profiles.push({
          id,
          name: "Mi perfil",
          createdAt: new Date().toISOString(),
        });
        registry.activeId = id;
      }
      await writeJsonAtomically(this.registryFile, registry);
      return registry;
    });
  }

  async create(input: UserProfileInput): Promise<ProfileRegistry> {
    const values = userProfileInputSchema.parse(input);
    return withFileLock(this.registryFile, async () => {
      const registry = await this.list();

      if (registry.profiles.length >= 100) {
        throw new Error("Se ha alcanzado el límite de perfiles");
      }

      const id = randomUUID();
      const {
        dailyCalories,
        dailyProtein,
        dailyCarbs,
        dailyFat,
        targetWeightKg,
        targetDate,
        habits,
        ...profile
      } = values;
      await new NutritionStore(this.storePath(id)).updateProfile(
        profile,
        dailyCalories,
      );
      const store = new NutritionStore(this.storePath(id));
      await store.saveNutritionPlan(
        {
          goal: profile.goal,
          dailyGoal: {
            calories: dailyCalories,
            protein: dailyProtein,
            carbs: dailyCarbs,
            fat: dailyFat,
          },
          targetWeightKg,
          targetDate,
          habits,
          notes: "",
        },
        await store.nutritionPlan(),
      );
      registry.profiles.push({
        id,
        name: values.name,
        createdAt: new Date().toISOString(),
      });
      registry.activeId = id;
      await writeJsonAtomically(this.registryFile, registry);
      return registry;
    });
  }

  async select(id: string): Promise<ProfileRegistry> {
    return withFileLock(this.registryFile, async () => {
      const registry = await this.list();

      if (!registry.profiles.some((profile) => profile.id === id)) {
        throw new Error("El perfil no existe");
      }
      registry.activeId = id;
      await writeJsonAtomically(this.registryFile, registry);
      return registry;
    });
  }

  async store(id: string): Promise<NutritionStore> {
    const registry = await this.list();

    if (!registry.profiles.some((profile) => profile.id === id)) {
      throw new Error("El perfil no existe");
    }
    return new NutritionStore(this.storePath(id));
  }
}
