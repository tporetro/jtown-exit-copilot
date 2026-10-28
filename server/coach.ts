// The Exit Coach: system prompt, tools, and the streaming tool-use loop.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { ActionItem, AppState } from '../src/lib/types';
import { computeLevers, computeValuation, formatMoney } from '../src/lib/valuation';
import { PROFILE_FIELDS, SPECIAL_FIELDS, applyProfileUpdates } from '../src/lib/profileUpdates';

export const MODEL = process.env.COACH_MODEL || 'claude-opus-5-5';
const EFFORT = (process.env.COACH_EFFORT as 'low' | 'medium' | 'high' | undefined) || 'medium';
// Route policy declines to a fallback model chosen by the API instead of ending the turn.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
const MAX_TOOL_ROUNDS = 8;

const VIEWS = ['overview', 'locations', 'roadmap', 'documents', 'learn'] as const;
export type View = (typeof VIEWS)[number];

export const SYSTEM_PROMPT = `You are the Exit Coach inside "JTown Exit Copilot", a private app built for Stephanie, the owner of JTown Hot Yoga — a hot yoga business founded in Jenkintown, Pennsylvania with three studio locations. (Public listings have shown studios in Jenkintown PA, Maple Shade NJ and Manayunk in Philadelphia; confirm the current three with her rather than assuming.)

Your job: help Stephanie get the highest realistic price when she sells, by (1) learning the business through a friendly conversation, (2) explaining where it stands today in plain English, and (3) walking her step by step through the changes that raise the sale price, until she is ready to go to market.

# How you talk
- Stephanie often talks to you by voice and your replies may be read aloud. Keep replies short and conversational: usually 2–5 sentences. No tables, no headings, no long bullet lists in chat — the dashboard shows the details; point her to it.
- Ask ONE question at a time (two closely related ones at most). Acknowledge what she said before asking the next thing.
- She is an expert at running studios, not at finance. Explain any finance term the first time you use it, in one sentence, with a yoga-studio example. Never be condescending.
- Be warm and encouraging. Selling something you built is emotional. Celebrate progress.
- Use her real numbers when explaining. Round for speech ("about nine hundred forty thousand").

# The interview (onboarding)
Work through these topics in order, skipping anything already known in the snapshot. Approximate answers are fine — say so and record them; she can refine later or upload documents.
1. Goals: why sell, when, what price she has in mind, what matters in a buyer, how long she'd stay to help transition.
2. The studios: confirm the three locations (names, towns, year opened).
3. Money, per studio: last-12-month revenue, prior-year revenue, payroll (not counting her), monthly rent incl. CAM, other operating costs. Offer the shortcut: "If it's easier, upload your P&L or tax return on the Documents tab and I'll pull the numbers out."
4. Her pay and add-backs: what she pays herself, personal or one-time expenses that run through the business.
5. Members and classes, per studio: active autopay members, average dues, monthly cancellations, share of revenue from memberships vs packs, classes per week, average attendance, room capacity. These usually come from Mindbody/Momence reports — tell her which report to pull.
6. People: hours she works, classes she teaches, whether there is a GM or studio managers, written procedures, W-2 vs 1099 instructors.
7. Leases & legal: years left, renewal options, assignability, entity type, trademark.
When these topics are covered (gaps are fine), call finish_onboarding and walk her through the result: the value range, the readiness score and the top three levers. Then open the roadmap and agree on the first two or three tasks.

# After onboarding
Act as her ongoing coach: answer "what does this mean?" questions using her own numbers, help her work through roadmap tasks one at a time (drafting the landlord email, picking which Mindbody report to pull, preparing questions for a CPA or broker), update numbers as they change, and check in on progress against her timeline.

# Tools — use them, silently and immediately
- update_profile: record EVERY fact she gives you, as soon as she gives it (several updates per call is good). Add the studios with field "location.add" before setting their per-location fields. Use field "note" for qualitative context worth remembering (e.g. "Jenkintown members are very loyal; Manayunk has parking issues").
- add_action_items / set_action_status: maintain her roadmap. Add specific, personalized tasks when you identify them (e.g. "Ask the Manayunk landlord for two 5-year renewal options"), and mark tasks done when she tells you she finished them.
- show_view: open the dashboard tab that shows what you are talking about.
- Do not narrate tool use ("I'm updating your profile…"). Just continue the conversation.

# Numbers: never invent them
- Every turn includes a <snapshot> with her current profile, the computed valuation, readiness factors, value levers and what's still missing. Quote valuation figures ONLY from the snapshot or from a tool result. Do not do your own valuation math.
- The valuation is a planning estimate based on rule-of-thumb multiples for boutique fitness, not an appraisal. Say so when she first sees it, briefly.

# Honest market context
- Private equity has been consolidating fitness and other brick-and-mortar services, but institutional platforms usually want roughly $1M+ of EBITDA and a scalable, well-documented operation. At smaller sizes the likely buyers are regional studio operators, franchisors converting studios, search-fund buyers and individual owner-operators. Be honest about which buyers fit her numbers today, and show how the plan expands that buyer pool.
- The highest-return pre-sale moves are usually: clean, CPA-reviewed financials by location; documented add-backs; higher recurring revenue and lower churn; reducing dependence on the owner (GM + SOPs); secure, assignable leases; fixing or exiting any money-losing studio; cleaning up instructor classification.
- Timing: a well-prepared sale typically takes 12–24 months of preparation plus 6–9 months of process. Buyers pay for the trailing twelve months, so improvements need time to show up in the numbers.

# Boundaries
- You are not her CPA, attorney or broker. For tax structure, worker classification, entity and contract questions, give the general picture and recommend the right professional; suggest when in the timeline to bring each one in.
- If she mentions unreported cash income, be non-judgmental: explain that buyers only pay for reported, verifiable income, that it needs to run through the books for 1–2 years before a sale to count, and suggest she talk to her CPA. Never help hide or understate income.
- Keep everything about her business confidential and focused on her goals.`;

const ProfileUpdateInput = z.object({
  updates: z
    .array(
      z.object({
        field: z.string(),
        location: z.string().optional().nullable(),
        value: z.union([z.number(), z.string(), z.boolean(), z.null()]),
      }),
    )
    .min(1),
});

const AddItemsInput = z.object({
  items: z
    .array(
      z.object({
        title: z.string().min(3),
        why: z.string(),
        phase: z.enum(['clean_up', 'grow', 'package', 'sell']),
        target_month: z.number().optional(),
        effort: z.enum(['low', 'medium', 'high']).optional(),
        estimated_value_impact: z.number().optional(),
      }),
    )
    .min(1),
});

const SetStatusInput = z.object({
  id: z.string(),
  status: z.enum(['todo', 'doing', 'done']),
});

const ShowViewInput = z.object({ view: z.enum(VIEWS) });

const fieldList = Object.entries(PROFILE_FIELDS)
  .map(([k, d]) => {
    const type = typeof d.type === 'string' ? d.type : `one of ${d.type.enum.join('|')}`;
    return `${k} [${d.scope}, ${type}]: ${d.label}`;
  })
  .join('\n');

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'update_profile',
    description: `Record facts about the business. Call whenever Stephanie states a number or fact. Location-scoped fields need "location" (the studio name or id). Special fields: "location.add" (value = studio name), "location.remove" (value = studio name), "note" (value = free text worth remembering). Percent fields take 0-100. Use null to clear a value. Returns what was applied, any errors, and the refreshed valuation.\n\nFields:\n${fieldList}`,
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        updates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', enum: [...Object.keys(PROFILE_FIELDS), ...SPECIAL_FIELDS] },
              location: { type: 'string', description: 'Studio name or id, for location-scoped fields' },
              value: { type: ['number', 'string', 'boolean', 'null'] },
            },
            required: ['field', 'value'],
          },
        },
      },
      required: ['updates'],
    },
  },
  {
    name: 'add_action_items',
    description:
      'Add personalized tasks to Stephanie\'s exit roadmap. Phases: clean_up (books, legal, leases — months 0-3), grow (operational improvements — months 3-12), package (data room, QoE, advisor — months 9-14), sell (go to market — months 12-18+). target_month = months from today. Check the snapshot first to avoid duplicating an existing task.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Short imperative task, specific to her business' },
              why: { type: 'string', description: 'One sentence on how this raises the sale price' },
              phase: { type: 'string', enum: ['clean_up', 'grow', 'package', 'sell'] },
              target_month: { type: 'number' },
              effort: { type: 'string', enum: ['low', 'medium', 'high'] },
              estimated_value_impact: { type: 'number', description: 'Dollars of sale value, only if taken from a lever in the snapshot' },
            },
            required: ['title', 'why', 'phase'],
          },
        },
      },
      required: ['items'],
    },
  },
  {
    name: 'set_action_status',
    description: 'Mark a roadmap task as todo, doing or done (use the task id from the snapshot).',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string' }, status: { type: 'string', enum: ['todo', 'doing', 'done'] } },
      required: ['id', 'status'],
    },
  },
  {
    name: 'show_view',
    description:
      'Open a dashboard tab for Stephanie: overview (value, readiness, levers), locations (per-studio metrics vs benchmarks), roadmap (tasks by phase), documents (uploads + data-room checklist), learn (glossary).',
    input_schema: { type: 'object', properties: { view: { type: 'string', enum: [...VIEWS] } }, required: ['view'] },
  },
  {
    name: 'finish_onboarding',
    description: 'Call once the interview has covered the main topics (even with some gaps), to switch the app from onboarding mode to the full dashboard.',
    input_schema: { type: 'object', properties: {} },
  },
];

// Compact, model-facing summary of the current state. Sent as a mid-conversation
// system message after the latest user turn, so the cached history prefix stays stable.
export function snapshot(state: AppState): string {
  const v = computeValuation(state.profile);
  const { levers, combinedValue } = computeLevers(state.profile);
  const today = new Date().toISOString().slice(0, 10);
  const data = {
    today,
    onboardingComplete: state.onboardingComplete,
    profile: state.profile,
    valuation:
      v.totals.revenue > 0
        ? {
            estimatedValue: `${formatMoney(v.value.low)}–${formatMoney(v.value.high)} (midpoint ${formatMoney(v.value.mid)})`,
            likelyBuyer: v.lensLabel,
            pricedOn: v.basis,
            earnings: formatMoney(v.earnings, false),
            effectiveMultiple: `${v.multiple.mid.toFixed(2)}x`,
            revenue: formatMoney(v.totals.revenue, false),
            fourWallProfit: formatMoney(v.totals.fourWallEbitda, false),
            addBacks: formatMoney(v.totals.addBacks, false),
            sde: formatMoney(v.totals.sde, false),
            ownerReplacementCost: formatMoney(v.totals.ownerReplacementCost, false),
            adjustedEbitda: formatMoney(v.totals.adjustedEbitda, false),
            adjustedEbitdaMarginPct: v.totals.ebitdaMarginPct?.toFixed(1),
            recurringPct: v.totals.recurringPct?.toFixed(0),
            monthlyChurnPct: v.totals.churnPct?.toFixed(1),
            yoyGrowthPct: v.totals.growthPct?.toFixed(1),
            dataCompletenessPct: Math.round(v.completeness * 100),
          }
        : 'Not enough data yet — need revenue and expenses for at least one studio.',
    readiness: {
      score: v.readiness.score,
      factors: v.readiness.factors.map((f) => `${f.label}: ${Math.round(f.score * 100)}/100${f.known ? '' : ' (not enough data)'}`),
    },
    locations: v.locations.map((l) => ({
      name: l.name,
      fourWallProfit: formatMoney(l.fourWallEbitda, false),
      marginPct: l.marginPct?.toFixed(1),
      rentPct: l.rentPct?.toFixed(1),
      payrollPct: l.payrollPct?.toFixed(1),
      utilizationPct: l.utilizationPct?.toFixed(0),
      growthPct: l.growthPct?.toFixed(1),
    })),
    valueLevers: levers.map((l) => `${l.title}: +${formatMoney(l.valueImpact)} (${l.effort} effort, ~${l.months} months)`),
    planPotentialValue: levers.length ? formatMoney(combinedValue) : undefined,
    stillMissing: v.missing.slice(0, 8).map((m) => `${m.label} — ${m.why}`),
    roadmap: state.tasks.map((t) => `[${t.status}] ${t.id}: ${t.title} (${t.phase}, month ${t.targetMonth ?? '?'})`),
    documents: state.documents.map((d) => `${d.fileName} (${d.kind}${d.period ? ', ' + d.period : ''}): ${d.summary}`),
  };
  return `<snapshot>\n${JSON.stringify(data)}\n</snapshot>`;
}

function valuationLine(state: AppState): string {
  const v = computeValuation(state.profile);
  if (v.totals.revenue <= 0) return 'Valuation: not enough data yet.';
  return `Valuation now ${formatMoney(v.value.low)}–${formatMoney(v.value.high)} (mid ${formatMoney(v.value.mid)}), readiness ${v.readiness.score}/100, data ${Math.round(v.completeness * 100)}% complete. Next missing: ${v.missing
    .slice(0, 3)
    .map((m) => m.label)
    .join('; ') || 'nothing major'}.`;
}

let idCounter = 0;
const newId = () => `c-${Date.now().toString(36)}-${(idCounter++).toString(36)}`;

export type CoachEvent =
  | { type: 'text'; text: string }
  | { type: 'state'; state: AppState }
  | { type: 'view'; view: View }
  | { type: 'error'; message: string }
  | { type: 'done' };

function runTool(name: string, input: unknown, state: AppState, emit: (e: CoachEvent) => void): { content: string; isError?: boolean } {
  switch (name) {
    case 'update_profile': {
      const parsed = ProfileUpdateInput.safeParse(input);
      if (!parsed.success) return { content: `Invalid input: ${parsed.error.message}`, isError: true };
      const res = applyProfileUpdates(
        state.profile,
        parsed.data.updates.map((u) => ({ ...u, location: u.location ?? undefined })),
      );
      emit({ type: 'state', state });
      return {
        content: [
          res.applied.length ? `Applied: ${res.applied.join('; ')}` : '',
          res.errors.length ? `Errors: ${res.errors.join('; ')}` : '',
          valuationLine(state),
        ]
          .filter(Boolean)
          .join('\n'),
        isError: res.applied.length === 0 && res.errors.length > 0,
      };
    }
    case 'add_action_items': {
      const parsed = AddItemsInput.safeParse(input);
      if (!parsed.success) return { content: `Invalid input: ${parsed.error.message}`, isError: true };
      const added: ActionItem[] = parsed.data.items.map((i) => ({
        id: newId(),
        title: i.title,
        why: i.why,
        phase: i.phase,
        status: 'todo',
        targetMonth: i.target_month,
        effort: i.effort,
        estimatedValueImpact: i.estimated_value_impact,
        source: 'coach',
      }));
      state.tasks.push(...added);
      emit({ type: 'state', state });
      return { content: `Added ${added.map((a) => `${a.id}: ${a.title}`).join('; ')}` };
    }
    case 'set_action_status': {
      const parsed = SetStatusInput.safeParse(input);
      if (!parsed.success) return { content: `Invalid input: ${parsed.error.message}`, isError: true };
      const task = state.tasks.find((t) => t.id === parsed.data.id);
      if (!task) return { content: `No task with id ${parsed.data.id}`, isError: true };
      task.status = parsed.data.status;
      emit({ type: 'state', state });
      return { content: `"${task.title}" is now ${task.status}.` };
    }
    case 'show_view': {
      const parsed = ShowViewInput.safeParse(input);
      if (!parsed.success) return { content: `Invalid input: ${parsed.error.message}`, isError: true };
      emit({ type: 'view', view: parsed.data.view });
      return { content: `Opened the ${parsed.data.view} tab.` };
    }
    case 'finish_onboarding': {
      state.onboardingComplete = true;
      emit({ type: 'state', state });
      emit({ type: 'view', view: 'overview' });
      return { content: `Onboarding complete; the dashboard is open. ${valuationLine(state)}` };
    }
    default:
      return { content: `Unknown tool ${name}`, isError: true };
  }
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export async function runCoach(
  client: Anthropic,
  history: ChatTurn[],
  state: AppState,
  emit: (e: CoachEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  // History is stored as plain text turns; tool calls from earlier turns are
  // reflected in the snapshot instead of being replayed.
  const messages: Anthropic.Beta.BetaMessageParam[] = history
    .filter((t) => t.text.trim())
    .slice(-60)
    .map((t) => ({ role: t.role, content: t.text }));
  if (messages[0]?.role !== 'user') messages.unshift({ role: 'user', content: '(Stephanie opened the app.)' });
  if (messages.at(-1)?.role !== 'user') throw new Error('The last message must be from the user.');
  messages.push({ role: 'system', content: snapshot(state) });

  let jsonRetries = 0;
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = client.beta.messages.stream(
      {
        model: MODEL,
        max_tokens: 64000,
        betas: [FALLBACK_BETA],
        fallbacks: 'default',
        output_config: { effort: EFFORT },
        // The system prompt and tool list never change, so they cache across turns.
        system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        messages,
      },
      { signal },
    );
    stream.on('text', (delta) => emit({ type: 'text', text: delta }));

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // With eager input streaming a tool input can arrive as unparseable JSON;
      // re-issue that turn a couple of times. API errors propagate.
      if (err instanceof Anthropic.APIError || signal.aborted || jsonRetries++ >= 2) throw err;
      continue;
    }

    if (message.stop_reason === 'refusal') {
      emit({ type: 'text', text: "\n\nI can't help with that one — let's get back to preparing the business for sale." });
      return;
    }
    if (message.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: message.content });
      continue;
    }
    const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (toolUses.length === 0) return;
    if (message.stop_reason === 'max_tokens') throw new Error('The coach response was cut off; please try again.');

    messages.push({ role: 'assistant', content: message.content });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = toolUses.map((tu) => {
      const r = runTool(tu.name, tu.input, state, emit);
      return { type: 'tool_result', tool_use_id: tu.id, content: r.content, is_error: r.isError };
    });
    messages.push({ role: 'user', content: results });
    // Separate the text of consecutive rounds in the transcript.
    if (message.content.some((b) => b.type === 'text' && b.text.trim())) emit({ type: 'text', text: '\n\n' });
  }
}
