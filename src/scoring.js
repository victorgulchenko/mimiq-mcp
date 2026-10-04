export function adaptResultsForBehavior(rows) {
  const input = Array.isArray(rows) ? rows : [];
  return input.map((row) => {
    const result = row?.result || row || {};
    return {
      ...row,
      result: {
        ...result,
        // Preserve the raw action as-is; no normalization
        // action_class comes from the LLM via backend
      },
    };
  });
}
