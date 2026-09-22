import { reportSaveError } from '@/lib/saveError';

/**
 * @deprecated Use `reportSaveError` from '@/lib/saveError'. Kept only because
 * components/admin/stocktake/CountsTab.jsx still imports it.
 */
export const handleSaveError = (err, opts) => reportSaveError(err, opts);
