// Isi dari Supabase Dashboard → Project Settings → API Keys.
// Gunakan Project URL dan Publishable key (sb_publishable_...) untuk browser.
// Jangan pernah menaruh Secret key / service_role key di file ini.
export const SUPABASE_URL = 'https://osjikdsebniwnzancsjl.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_JL1o4nFRe3qpsG3h6060Aw_hGT8j2Wu';

export const MAX_CV_BYTES = 10 * 1024 * 1024;
export const CV_BUCKET = 'candidate-files';
export const CV_PATH_PREFIX = 'candidate-cv';
export const TEMPLATE_URL = './templates/application-master.html';

export const MAX_KTP_BYTES = 8 * 1024 * 1024;
export const KTP_BUCKET = 'candidate-identity';
export const KTP_PATH_PREFIX = 'candidate-identity';
