/* Strict declarative action parser used by the researcher integration and unit tests. */
import path from 'node:path';
export function parseResearchAction(line) {
 if (typeof line !== 'string' || !line.startsWith('researchctl ' ) || line.includes('\n')) throw new Error('only one researchctl action is allowed');
 let value; try { value=JSON.parse(line.slice(12)); } catch { throw new Error('researchctl requires strict JSON'); }
 if (!value || typeof value !== 'object' || Array.isArray(value) || !['list','read','search','open-result','open-link','write-report','write-response'].includes(value.action)) throw new Error('unsupported researchctl action');
 for (const key of Object.keys(value)) if (!['action','path','query','handle','content'].includes(key)) throw new Error('unknown researchctl argument');
 if (value.path && (!path.isAbsolute(value.path) || value.path.includes('..'))) throw new Error('unsafe path');
 if (value.content && Buffer.byteLength(value.content)>16384) throw new Error('researchctl content exceeds 16 KiB');
 return value;
}
