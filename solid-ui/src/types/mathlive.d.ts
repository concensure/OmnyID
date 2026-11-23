// @locs-version: 1.0
import type { MathfieldElement } from "mathlive";
import type { JSX } from "solid-js";

declare module "solid-js" {
  namespace JSX {
    interface IntrinsicElements {
      "math-field": JSX.HTMLAttributes<MathfieldElement>;
    }
  }
}

export {};
