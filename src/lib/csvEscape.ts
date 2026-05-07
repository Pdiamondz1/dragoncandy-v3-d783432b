export const csvCell = (v: unknown): string => {
  let s = String(v ?? '');
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  if (/[,"\n]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
};
