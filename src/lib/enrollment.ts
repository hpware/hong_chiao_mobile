import { useQuery } from '@tanstack/react-query';

import { getParticipatingSemesters } from '@/lib/api/auth';

/**
 * When the student joined the school, from the new system's (sw) semester history — the same
 * source the web app's `user.participatingSemis` uses. siw lists every semester since the system
 * went live, so its pickers are trimmed to semesters on or after this one.
 */
export function useEnrollment() {
  const semesters = useQuery({
    queryKey: ['user', 'semesters'],
    queryFn: getParticipatingSemesters,
    staleTime: 6 * 60 * 60 * 1000,
  });
  const first = semesters.data?.at(-1);
  return {
    query: semesters,
    /** Earliest semester, e.g. `{ year: 113, semi: 1 }`. */
    first,
    /** Number of semesters on record. */
    count: semesters.data?.length ?? 0,
    /** Keeps siw `yms` options (`"114,1"`) from the enrollment semester on. Keeps all until it loads. */
    filterYms<T extends { value: string }>(options: T[]): T[] {
      if (!first) return options;
      const floor = first.year * 10 + first.semi;
      const kept = options.filter((o) => {
        const [y, s] = o.value.split(',').map((x) => Number(x.trim()));
        return !(y * 10 + s < floor);
      });
      return kept.length ? kept : options;
    },
  };
}
