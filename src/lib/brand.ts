export const PRODUCT_NAME = "Type now";

const storageNamespace = PRODUCT_NAME.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export const STORAGE_KEYS = {
  ageBand: `${storageNamespace}:age-band`,
  settings: `${storageNamespace}:settings`,
  historyDatabase: `${storageNamespace}:history`,
} as const;
