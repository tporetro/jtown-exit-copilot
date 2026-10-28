// Reads an uploaded financial document and proposes profile updates. Nothing is
// applied automatically: the browser shows the proposals for Stephanie to confirm.

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { PROFILE_FIELDS } from '../src/lib/profileUpdates';
import { MODEL } from './coach';

const KINDS = ['tax_return', 'profit_and_loss', 'bank_statement', 'lease', 'membership_report', 'payroll_report', 'balance_sheet', 'other'] as const;

// Enum-like fields are plain strings with the allowed values in the description,
// then validated below: a near-miss from the model shouldn't fail the whole read.
const Extraction = z.object({
  kind: z.string().describe(`One of: ${KINDS.join(', ')}`),
  period: z.string().describe('Period covered, e.g. "Tax year 2024" or "Jan–Dec 2025"'),
  location_name: z.string().nullable().describe('Studio this document covers, or null if company-wide'),
  summary: z.string().describe('2-3 plain-English sentences on what the document shows'),
  proposed_updates: z.array(
    z.object({
      field: z.string().describe(`One of: ${Object.keys(PROFILE_FIELDS).join(', ')}`),
      location: z.string().nullable().describe('Studio name for location-scoped fields'),
      value: z.string().describe('Numbers without $ or commas; booleans as yes/no'),
      evidence: z.string().describe('Where in the document this came from, e.g. "Form 1120-S line 1a"'),
    }),
  ),
  add_back_candidates: z.array(z.object({ description: z.string(), amount: z.number() })),
  red_flags: z.array(z.string()).describe('Things a buyer would question in diligence'),
});
export type ExtractionResult = Omit<z.infer<typeof Extraction>, 'kind'> & { kind: (typeof KINDS)[number] };

const INSTRUCTIONS = `You are a sell-side financial analyst helping the owner of JTown Hot Yoga (a multi-location hot yoga studio business) prepare for a sale. Read the attached document and extract what matters for valuing the business.

Rules:
- Only propose values that are actually supported by the document; cite where each came from. Do not estimate or extrapolate.
- Annual fields mean the twelve months the document covers. If the document covers a partial period, only annualize when it covers at least 3 full months, and say so in the evidence.
- payrollAnnual excludes the owner's own pay; put officer/owner compensation in ownerSalaryAnnual.
- otherOpexAnnual = total operating expenses minus payroll, rent and owner pay. Exclude interest, depreciation, amortization and income taxes.
- If the document is company-wide but the business has several studios, propose company-wide numbers only for business-scoped fields and mention in the summary that per-studio P&Ls are needed.
- Add-back candidates: personal or non-recurring expenses (owner auto, family insurance, one-time repairs, legal settlements, owner's personal travel, etc.).
- Red flags: e.g. large unexplained cash withdrawals, deposits that don't match reported revenue, related-party payments, declining revenue, missing months, contractor-heavy payroll.

Known studios: `;

export async function extractDocument(
  client: Anthropic,
  file: { fileName: string; mediaType: string; dataBase64: string },
  locations: string[],
): Promise<ExtractionResult> {
  let source: Anthropic.Beta.BetaContentBlockParam;
  if (file.mediaType === 'application/pdf') {
    source = { type: 'document', title: file.fileName, source: { type: 'base64', media_type: 'application/pdf', data: file.dataBase64 } };
  } else if (/^image\/(png|jpeg|gif|webp)$/.test(file.mediaType)) {
    source = {
      type: 'image',
      source: { type: 'base64', media_type: file.mediaType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp', data: file.dataBase64 },
    };
  } else if (file.mediaType.startsWith('text/') || /\.(csv|txt|tsv)$/i.test(file.fileName)) {
    source = {
      type: 'document',
      title: file.fileName,
      source: { type: 'text', media_type: 'text/plain', data: Buffer.from(file.dataBase64, 'base64').toString('utf8') },
    };
  } else {
    throw new UnsupportedFileError('Please upload a PDF, an image (PNG/JPG), or a CSV/text export. For Excel files, use File → Save As → CSV or PDF.');
  }

  const response = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'high', format: betaZodOutputFormat(Extraction) },
    messages: [
      {
        role: 'user',
        content: [
          source,
          { type: 'text', text: `${INSTRUCTIONS}${locations.join(', ') || '(none entered yet)'}\nFile name: ${file.fileName}` },
        ],
      },
    ],
  });
  if (response.stop_reason === 'refusal') throw new Error('The document could not be processed.');
  const out = response.parsed_output;
  if (!out) throw new Error('Could not read structured data from the document.');
  return {
    ...out,
    kind: (KINDS as readonly string[]).includes(out.kind) ? (out.kind as ExtractionResult['kind']) : 'other',
    proposed_updates: out.proposed_updates.filter((u) => u.field in PROFILE_FIELDS),
  };
}

export class UnsupportedFileError extends Error {}
