import { defineSecret } from 'firebase-functions/params';

/** Schoolinfo API key, stored only in Firebase Secret Manager. */
export const SCHOOL_DATA_API_KEYS = defineSecret('SCHOOL_DATA_API_KEYS');
