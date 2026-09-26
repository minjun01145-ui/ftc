import { defineJsonSecret } from 'firebase-functions/params';

/** JSON object: { "neisApiKey": "...", "schoolInfoApiKey": "..." } */
export const SCHOOL_DATA_API_KEYS = defineJsonSecret('SCHOOL_DATA_API_KEYS');
