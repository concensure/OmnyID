// @locs-version: 1.0
export function personaPanelActionBusy(args: {
  saving: boolean;
  activatingId: string | null;
  deletingId: string | null;
  installingId: string | null;
  reloading: boolean;
}): boolean {
  return (
    args.saving
    || args.activatingId !== null
    || args.deletingId !== null
    || args.installingId !== null
    || args.reloading
  );
}

export function personaSwitcherBusy(args: {
  loading: boolean;
  switchingId: string | null;
  installingTemplateId: string | null;
}): boolean {
  return args.loading || args.switchingId !== null || args.installingTemplateId !== null;
}

export function personaReloadBlocked(args: {
  loading: boolean;
  reloading?: boolean;
  signedIn?: boolean;
}): boolean {
  return Boolean(args.signedIn) && (args.loading || Boolean(args.reloading));
}
