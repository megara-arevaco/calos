import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { queryKeys } from "./queryKeys.js";
export function useProfiles() {
  const client = useQueryClient();
  const registry = useQuery({
    queryKey: queryKeys.profiles,
    queryFn: window.calos.profiles,
  });
  const [creating, setCreating] = useState(false);
  const create = useMutation({
    mutationFn: window.calos.createProfile,
    onSuccess: (data) => {
      client.setQueryData(queryKeys.profiles, data);
      setCreating(false);
    },
  });
  const select = useMutation({
    mutationFn: window.calos.selectProfile,
    onSuccess: (data) => client.setQueryData(queryKeys.profiles, data),
  });
  const profile = registry.data?.profiles.find(
    (item) => item.id === registry.data?.activeId,
  );
  return { registry, profile, creating, setCreating, create, select };
}
