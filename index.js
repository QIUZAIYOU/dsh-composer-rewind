/**
 * Host half of the Prompt Vault bundle.
 *
 * Everything the plugin contributes is rendered by the Client module
 * (`./client.js`); this half only exists so the bundle has a loader entry and a
 * place to grow a Host-side service later (for example a `prompt_vault` tool
 * that lets the agent read the same history).
 */
export function apply() {}
