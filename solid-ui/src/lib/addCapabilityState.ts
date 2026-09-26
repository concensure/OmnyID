// @locs-version: 1.0
import { registerCapability } from "@/lib/api";
import {
  buildAddCapabilityFailureReceipt,
  type AddCapabilityFailureReceipt,
} from "@/lib/addCapabilityFailureState";
import {
  buildCapabilityInputSchema,
  firstDuplicateCapabilityFieldIndex,
  type CapabilityFieldDef,
} from "@/lib/capabilitySchema";

export type AddCapabilityValidationResult =
  | { kind: "valid"; validationError: ""; duplicateFieldIndex: -1 }
  | { kind: "invalid"; validationError: "Name is required." | "Field names must be unique."; duplicateFieldIndex: number };

export type AddCapabilitySubmitResult =
  | { kind: "success"; error: null }
  | { kind: "failure"; error: AddCapabilityFailureReceipt };

export function validateAddCapabilityInput(
  name: string,
  fields: CapabilityFieldDef[],
): AddCapabilityValidationResult {
  if (!name.trim()) {
    return {
      kind: "invalid",
      validationError: "Name is required.",
      duplicateFieldIndex: -1,
    };
  }

  const duplicateFieldIndex = firstDuplicateCapabilityFieldIndex(fields);
  if (duplicateFieldIndex !== -1) {
    return {
      kind: "invalid",
      validationError: "Field names must be unique.",
      duplicateFieldIndex,
    };
  }

  return {
    kind: "valid",
    validationError: "",
    duplicateFieldIndex: -1,
  };
}

function addCapabilityPayload(name: string, description: string, fields: CapabilityFieldDef[]) {
  return {
    name: name.trim(),
    description: description.trim(),
    input_schema: buildCapabilityInputSchema(fields),
    version: "1.0.0",
    tags: [] as string[],
    approval_mode: "suggest_only" as const,
  };
}

export async function submitAddCapabilityState(
  args: {
    name: string;
    description: string;
    fields: CapabilityFieldDef[];
  },
  deps: {
    register?: typeof registerCapability;
  } = {},
): Promise<AddCapabilitySubmitResult> {
  const register = deps.register ?? registerCapability;
  try {
    await register(addCapabilityPayload(args.name, args.description, args.fields));
    return {
      kind: "success",
      error: null,
    };
  } catch (error) {
    return {
      kind: "failure",
      error: buildAddCapabilityFailureReceipt(
        "Create capability",
        error instanceof Error ? error.message : "Failed to create capability.",
      ),
    };
  }
}
