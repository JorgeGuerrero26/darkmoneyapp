import { useEffect, useState } from "react";

import { supabase } from "../lib/supabase";
import { ownerDefaultAccountId } from "../lib/obligation-viewer-account-impact";
import type { PendingOwnerEditRequest } from "../lib/obligation-event-payloads";
import type { ObligationSummary, SharedObligationSummary } from "../types/domain";

type MovementAccountsRow = {
  source_account_id?: number | null;
  destination_account_id?: number | null;
};

export function useOwnerEditAccount(
  ownerEditRequestTarget: PendingOwnerEditRequest | null,
  obligation: ObligationSummary | SharedObligationSummary | null,
) {
  const [ownerEditResponseAccountId, setOwnerEditResponseAccountId] = useState<number | null>(null);
  const [ownerEditPreviousAccountId, setOwnerEditPreviousAccountId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadOwnerEditAccounts() {
      if (!ownerEditRequestTarget?.event?.movementId || !supabase) {
        const fallbackAccountId = ownerDefaultAccountId(obligation);
        if (!cancelled) {
          setOwnerEditPreviousAccountId(fallbackAccountId);
          setOwnerEditResponseAccountId(fallbackAccountId);
        }
        return;
      }

      const { data, error } = await supabase
        .from("movements")
        .select("source_account_id, destination_account_id")
        .eq("id", ownerEditRequestTarget.event.movementId)
        .maybeSingle();

      const resolvedAccountId =
        data && !error
          ? Number(
              (data as MovementAccountsRow).source_account_id
                ?? (data as MovementAccountsRow).destination_account_id
                ?? 0,
            ) || null
          : ownerDefaultAccountId(obligation);

      if (!cancelled) {
        setOwnerEditPreviousAccountId(resolvedAccountId);
        setOwnerEditResponseAccountId(resolvedAccountId);
      }
    }

    if (ownerEditRequestTarget) {
      void loadOwnerEditAccounts();
    } else {
      setOwnerEditPreviousAccountId(null);
      setOwnerEditResponseAccountId(null);
    }

    return () => {
      cancelled = true;
    };
  }, [obligation, ownerEditRequestTarget]);

  return {
    ownerEditResponseAccountId,
    ownerEditPreviousAccountId,
    setOwnerEditResponseAccountId,
    setOwnerEditPreviousAccountId,
  };
}
