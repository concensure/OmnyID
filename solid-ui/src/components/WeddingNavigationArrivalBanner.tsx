// @locs-version: 2.0
import type {
  WeddingArrivalAction,
  WeddingNavigationArrivalBannerState,
} from "@/lib/weddingNavigationArrivalViewState";

export function WeddingNavigationArrivalBanner(props: {
  state: WeddingNavigationArrivalBannerState | null | undefined;
  onAction?: (action: WeddingArrivalAction) => void;
  onDismiss?: () => void;
}) {
  void props;
  return null;
}
