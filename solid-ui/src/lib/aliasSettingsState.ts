// @locs-version: 1.0
import {
  changeAlias,
  checkAlias,
  claimAlias,
  getMyAlias,
  type AliasCheckResult,
  type AliasRecord,
} from "@/lib/api";
import {
  buildAliasSettingsFailureReceipt,
  type AliasSettingsFailureReceipt,
} from "@/lib/aliasSettingsFailureState";

export type AliasSettingsLoadState = {
  current: AliasRecord | null;
  error: AliasSettingsFailureReceipt | null;
};

export type AliasSettingsCheckState = {
  result: AliasCheckResult | null;
  error: AliasSettingsFailureReceipt | null;
};

export type AliasSettingsSaveState = {
  current: AliasRecord | null;
  error: AliasSettingsFailureReceipt | null;
  didCreate: boolean;
};

function readErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export async function loadAliasSettingsState(
  deps: {
    loadAlias?: typeof getMyAlias;
  } = {},
): Promise<AliasSettingsLoadState> {
  const loadAlias = deps.loadAlias ?? getMyAlias;
  try {
    return {
      current: await loadAlias(),
      error: null,
    };
  } catch (error) {
    const message = readErrorMessage(error, "Could not load alias settings.");
    if (/not found|no alias/i.test(message)) {
      return { current: null, error: null };
    }
    return {
      current: null,
      error: buildAliasSettingsFailureReceipt("Load alias settings", message),
    };
  }
}

export async function checkAliasSettingsAvailability(
  alias: string,
  deps: {
    checkAvailability?: typeof checkAlias;
  } = {},
): Promise<AliasSettingsCheckState> {
  const checkAvailability = deps.checkAvailability ?? checkAlias;
  try {
    return {
      result: await checkAvailability(alias),
      error: null,
    };
  } catch (error) {
    return {
      result: null,
      error: buildAliasSettingsFailureReceipt(
        "Check alias",
        readErrorMessage(error, "Could not verify alias availability right now."),
      ),
    };
  }
}

export async function saveAliasSettingsState(
  args: {
    alias: string;
    current: AliasRecord | null;
  },
  deps: {
    claim?: typeof claimAlias;
    change?: typeof changeAlias;
  } = {},
): Promise<AliasSettingsSaveState> {
  const claim = deps.claim ?? claimAlias;
  const change = deps.change ?? changeAlias;
  const didCreate = !args.current?.alias;
  try {
    const record = didCreate ? await claim(args.alias) : await change(args.alias);
    return {
      current: record,
      error: null,
      didCreate,
    };
  } catch (error) {
    return {
      current: args.current,
      error: buildAliasSettingsFailureReceipt(
        "Save alias",
        readErrorMessage(error, "Failed to save alias. Please try again."),
      ),
      didCreate,
    };
  }
}
