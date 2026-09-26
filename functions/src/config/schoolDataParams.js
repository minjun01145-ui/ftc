import { defineJsonSecret } from 'firebase-functions/params';

/** JSON object: { "schoolInfoApiKey": "..." } */
export const SCHOOL_DATA_API_KEYS = defineJsonSecret('SCHOOL_DATA_API_KEYS');
