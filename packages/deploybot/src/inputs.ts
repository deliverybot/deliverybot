import { ConfigError, Input, Target } from "./types.js";

export type InputValues = { [name: string]: string | number | boolean };

/** Raw values as they arrive from a form or API request. */
export type RawInputs = { [name: string]: unknown };

function coerce(name: string, input: Input, value: unknown) {
  switch (input.type || "string") {
    case "boolean":
      if (typeof value === "boolean") return value;
      if (value === "true" || value === "on") return true;
      if (value === "false" || value === "") return false;
      throw new ConfigError(`Input "${name}" must be true or false`);
    case "number": {
      const num = typeof value === "number" ? value : Number(value);
      if (value === "" || !Number.isFinite(num)) {
        throw new ConfigError(`Input "${name}" must be a number`);
      }
      return num;
    }
    case "choice": {
      const str = String(value);
      if (!(input.options || []).map(String).includes(str)) {
        throw new ConfigError(
          `Input "${name}" must be one of: ${(input.options || []).join(", ")}`,
        );
      }
      return str;
    }
    default:
      return String(value);
  }
}

/**
 * Resolves the inputs a target declares against the values given for a
 * deploy. Missing values fall back to the declared default, unknown names are
 * rejected and required inputs without a value or default throw, so a deploy
 * never goes out with a half-filled payload.
 *
 * Throws ConfigError.
 */
export function resolveInputs(
  target: Target,
  given: RawInputs = {},
): InputValues | undefined {
  const declared = target.inputs;
  if (!declared || Object.keys(declared).length === 0) {
    const unknown = Object.keys(given);
    if (unknown.length > 0) {
      throw new ConfigError(
        `Target "${target.name}" does not declare input "${unknown[0]}"`,
      );
    }
    return undefined;
  }

  for (const name of Object.keys(given)) {
    if (!(name in declared)) {
      throw new ConfigError(
        `Target "${target.name}" does not declare input "${name}"`,
      );
    }
  }

  const values: InputValues = {};
  for (const [name, input] of Object.entries(declared)) {
    const raw = given[name];
    const blank = raw === undefined || raw === null || raw === "";
    // An empty checkbox is a real answer (false), not a missing value.
    if (!blank || (raw === "" && input.type === "boolean")) {
      values[name] = coerce(name, input, raw);
    } else if (input.default !== undefined) {
      values[name] = coerce(name, input, input.default);
    } else if (input.required) {
      throw new ConfigError(`Input "${name}" is required`);
    } else if (input.type === "boolean") {
      values[name] = false;
    }
  }
  return values;
}
