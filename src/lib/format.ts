const days = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const hours = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** « Samedi 10 octobre · 21:00 » — le jour est calculé à partir de la vraie date. */
export function formatKickoff(iso: string): string {
  const d = new Date(iso);
  const day = days.format(d);
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${hours.format(d)}`;
}

export const formatOdds = (o: number | null) => (o === null ? '—' : o.toFixed(2).replace('.', ','));

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : 'Une erreur est survenue';
}
