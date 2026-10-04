/**
 * MCP envelope builder; raw results, no verdicts.
 * The agent decides what the results mean, not Mimiq.
 */

export function classifyAction(result) {
  // LLM-provided classification is authoritative
  if (result?.action_class) {
    const cls = result.action_class.toLowerCase();
    if (cls === 'converted') return 'converted';
    if (cls === 'bounced') return 'bounced';
    return 'engaged';
  }
  // Legacy fallback for old results without action_class
  if (result?.category) {
    if (result.category === 'positive') return 'converted';
    if (result.category === 'negative') return 'bounced';
    return 'engaged';
  }
  // Default
  return 'engaged';
}

export function summarizeResultsForMcp(results) {
  const rows = Array.isArray(results) ? results : [];
  const summary = { total: rows.length, converted: 0, engaged: 0, bounced: 0 };
  for (const row of rows) {
    const result = row?.result || row || {};
    const cls = classifyAction(result);
    if (cls === 'converted') summary.converted += 1;
    else if (cls === 'bounced') summary.bounced += 1;
    else summary.engaged += 1;
  }
  return summary;
}

function extractPersonaResult(row) {
  const persona = row?.persona || {};
  const result = row?.result || row || {};
  const demographics = persona?.demographics || {};

  // Extract journey steps if available (visual_journey / e2e modes)
  const rawSteps = Array.isArray(result.journey_steps) ? result.journey_steps : [];
  const journeySteps = rawSteps.map(s => ({
    step: s.step,
    scroll_percent: s.scroll_percent || s.scroll_percentage || null,
    url: s.url || null,
    action: s.action || s.decision || null,
    thinking: s.thinking || s.thought || null,
    frustration: s.frustration ?? null,
    confidence: s.confidence ?? null,
    progress: s.progress || s.progress_toward_goal || null,
    interest_level: s.new_interest_level || s.interest_level || null,
  }));

  return {
    persona_id: persona.id || row?.persona_id || null,
    name: `${persona.first_name || ''} ${persona.last_name || ''}`.trim() || null,
    age: demographics.age || null,
    occupation: demographics.occupation || null,
    location: (typeof demographics.location === 'object' && demographics.location !== null)
      ? demographics.location
      : (demographics.location || demographics.city || null),
    action: result.action || result.final_action || 'unknown',
    action_class: classifyAction(result),
    monologue: result.monologue || result.final_monologue || result.gut_reaction || null,
    objections: Array.isArray(result.objections) ? result.objections : [],
    what_would_help: result.what_would_help || null,
    trust_score: result.trust_score ?? result.trust_level ?? null,
    // Rich journey data (visual_journey / e2e modes)
    journey_steps: journeySteps.length > 0 ? journeySteps : undefined,
    time_on_page: result.time_on_page_seconds || null,
    max_scroll_pct: result.max_scroll_percentage || null,
    first_impression: result.first_impression || null,
    session_video: result.session_video_path || null,
    selected_option: result.selected_option || undefined,
  };
}

export function buildMcpEnvelope({
  tool,
  mode,
  results = [],
  simulationIds = [],
  durationSeconds = 0,
  extractionErrors = 0,
  notes = [],
}) {
  const rows = Array.isArray(results) ? results : [];
  const summary = summarizeResultsForMcp(rows);

  const personas = rows.map(extractPersonaResult);

  return {
    tool,
    sample_size: summary.total,
    counts: { converted: summary.converted, engaged: summary.engaged, bounced: summary.bounced },
    personas,
    run: {
      simulation_ids: simulationIds,
      mode,
      duration_seconds: Number(durationSeconds) || 0,
      extraction_errors: extractionErrors,
    },
    notes: Array.isArray(notes) ? notes : [],
  };
}

