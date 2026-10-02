/**
 * Closed by default: operators must set REGISTRATION_ENABLED=true, so a
 * deployment without an env file never ships open signup.
 */
export const isRegistrationEnabled = () =>
  process.env.REGISTRATION_ENABLED?.toLowerCase() === "true";
