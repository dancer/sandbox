import { error as sandboxError } from "@sandbox-sdk/core";

export const rejectUnsupported = (
  provider: string,
  feature: string
): Promise<never> =>
  Promise.reject(
    sandboxError(
      provider,
      `${provider} does not support ${feature}`,
      "unsupported"
    )
  );
