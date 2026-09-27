export function createSchoolStudentLookup(fetchCounts) {
  let revision = 0;

  return Object.freeze({
    invalidate() {
      revision += 1;
    },

    async lookup(request, { isCurrent = () => true, apply = () => {} } = {}) {
      const requestRevision = ++revision;
      const isRequestCurrent = () => requestRevision === revision && isCurrent();
      try {
        const result = await fetchCounts(request);
        if (!isRequestCurrent()) return { applied: false };
        apply(result);
        return { applied: true, result };
      } catch (error) {
        if (!isRequestCurrent()) return { applied: false };
        throw error;
      }
    }
  });
}
