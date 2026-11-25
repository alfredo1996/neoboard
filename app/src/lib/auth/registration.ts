import { getSetting } from "@/lib/settings/core";

/**
 * Closed by default: operators must set REGISTRATION_ENABLED=true, or an
 * admin opens it in Settings -> System (#2416), so a deployment without an
 * env file never ships open signup.
 */
export const isRegistrationEnabled = () => getSetting("REGISTRATION_ENABLED");
