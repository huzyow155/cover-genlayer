const fs = require('fs');
const path = require('path');

function cleanText(rawStr) {
  let text = rawStr.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\xa0/g, ' ');
  const isHtml = text.toLowerCase().includes('<html') || text.toLowerCase().includes('<body') || text.toLowerCase().includes('<div') || text.toLowerCase().includes('<p>');
  if (isHtml) {
    text = text.replace(/<script.*?>.*?<\/script>/gis, ' ');
    text = text.replace(/<style.*?>.*?<\/style>/gis, ' ');
    text = text.replace(/<!--.*?-->/gs, ' ');
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/?(?:p|div|h[1-6]|li|tr|th|td|blockquote|section|article|header|footer)\b[^>]*>/gi, '\n');
    text = text.replace(/<[^>]+>/g, ' ');
  } else {
    text = text.replace(/```.*?```/gs, ' ');
    text = text.replace(/`[^`]+`/g, ' ');
    text = text.replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1');
    text = text.replace(/^[ \t]*[#]+[ \t]*/gm, '');
    text = text.replace(/^[ \t]*[-*+][ \t]+/gm, '');
    text = text.replace(/^[ \t]*\d+\.[ \t]+/gm, '');
    text = text.replace(/[*_~]/g, '');
  }
  text = text.replace(/\u201c/g, '"').replace(/\u201d/g, '"').replace(/\u2018/g, "'").replace(/\u2019/g, "'").replace(/\u2013/g, '-').replace(/\u2014/g, '-');
  return text.split('\n').map(l => l.trim()).filter(Boolean).join('\n');
}

function normText(s) {
  if (!s) return '';
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function quoteInPage(quote, pageText) {
  const qNorm = normText(quote);
  if (qNorm.length < 8) return false;
  const pNorm = normText(pageText);
  return (' ' + pNorm + ' ').includes(' ' + qNorm + ' ');
}

function numberInQuote(quote, n) {
  if (n < 0) return false;
  const qNorm = normText(quote);
  const tokens = qNorm.split(/\s+/);
  return tokens.includes(String(n));
}

function decide(status, minutes, minFull, minHalf, quoteOk, tripwire) {
  if (tripwire) return 'REVIEW';
  if (status === 'UNCLEAR' || !quoteOk) return 'REVIEW';
  if (status === 'OPERATIONAL') return 'NO_PAY';
  if ((status === 'OUTAGE' || status === 'DEGRADED') && minutes < 1) return 'REVIEW';
  if (status === 'OUTAGE' && minutes >= minFull) return 'PAY_100';
  if (status === 'OUTAGE' && minutes >= minHalf) return 'PAY_50';
  if (status === 'DEGRADED' && minutes >= minFull) return 'PAY_25';
  return 'NO_PAY';
}

function parseExtraction(text) {
  if (!text) return { valid: false, status: 'UNCLEAR', minutes: 0, quote: '' };
  let cleaned = text.trim();
  if (cleaned.startsWith('```json')) cleaned = cleaned.slice(7);
  else if (cleaned.startsWith('```')) cleaned = cleaned.slice(3);
  if (cleaned.endsWith('```')) cleaned = cleaned.slice(0, -3);
  cleaned = cleaned.trim();

  let obj;
  try { obj = JSON.parse(cleaned); } catch(e) { return { valid: false, status: 'UNCLEAR', minutes: 0, quote: '' }; }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { valid: false, status: 'UNCLEAR', minutes: 0, quote: '' };
  const keys = Object.keys(obj);
  if (keys.length !== 3 || !keys.includes('status') || !keys.includes('minutes') || !keys.includes('quote')) {
    return { valid: false, status: 'UNCLEAR', minutes: 0, quote: '' };
  }
  const st = obj.status;
  const m = obj.minutes;
  const q = obj.quote;
  if (!['OPERATIONAL', 'DEGRADED', 'OUTAGE', 'UNCLEAR'].includes(st)) return { valid: false, status: 'UNCLEAR', minutes: 0, quote: '' };
  if (typeof m !== 'number' || !Number.isInteger(m) || m < 0 || m > 100000) return { valid: false, status: 'UNCLEAR', minutes: 0, quote: '' };
  if (typeof q !== 'string' || q.length > 300) return { valid: false, status: 'UNCLEAR', minutes: 0, quote: '' };
  return { valid: true, status: st, minutes: m, quote: q };
}

const logPath = 'C:/Users/USER/.gemini/antigravity/brain/925ea5f4-a758-41d8-9773-bfddbe246a6b/.system_generated/tasks/task-260.log';
const content = fs.readFileSync(logPath, 'utf8');

const sections = content.split('Testing Fixture: ');
const runs = [];
for (const sec of sections.slice(1)) {
  const lines = sec.split('\n');
  const fix = lines[0].split(' ')[0];
  const expected = lines[0].split('Expected: ')[1].replace(')', '').trim();
  const rawPage = fs.readFileSync(path.join(__dirname, '../fixtures/pages/', fix), 'utf8');
  const cleanedPage = cleanText(rawPage);

  let curRun = 0;
  let curLat = '0';
  for (const line of lines.slice(1)) {
    if (line.includes('Run ') && line.includes('submitting...')) {
      curRun = parseInt(line.split('Run ')[1].split('/')[0]);
    } else if (line.includes('Receipt in ')) {
      curLat = line.split('Receipt in ')[1].split('s:')[0].trim();
    } else if (line.includes('Raw extraction: ')) {
      const rawExt = line.split('Raw extraction: ')[1].trim();
      const parsed = parseExtraction(rawExt);
      let qOk = parsed.valid && quoteInPage(parsed.quote, cleanedPage);
      if (parsed.minutes > 0 && !numberInQuote(parsed.quote, parsed.minutes)) qOk = false;
      const outcome = parsed.valid ? decide(parsed.status, parsed.minutes, 60, 30, qOk, false) : 'REVIEW';
      runs.push({
        fixture: fix,
        expected: expected,
        run_index: curRun,
        latency_seconds: curLat,
        raw_extraction: rawExt,
        parsed_valid: parsed.valid,
        extracted_status: parsed.status,
        extracted_minutes: parsed.minutes,
        extracted_quote: parsed.quote,
        quote_ok: qOk,
        computed_outcome: outcome,
        matched: (outcome === expected)
      });
    }
  }
}

const summary = {};
const fixNames = ['status-s1-outage-75.md', 'status-s2-outage-35.md', 'status-s3-outage-20.md', 'status-s4-degraded-90.md', 'status-s5-operational-reformatted.html', 'status-s7-no-duration.md'];
for (const fn of fixNames) {
  const pageRuns = runs.filter(r => r.fixture === fn);
  const parseCount = pageRuns.filter(r => r.parsed_valid).length;
  const matchCount = pageRuns.filter(r => r.matched).length;
  summary[fn] = {
    expected: pageRuns[0]?.expected || '',
    total_runs: pageRuns.length,
    parse_successes: parseCount,
    outcome_matches: matchCount,
    pass_rule_met: (parseCount === 10 && matchCount >= 9)
  };
}

const outData = {
  contract_address: '0xBa2689DA2A56c80A00DFC7F4e4863b3cb902609D',
  summary: summary,
  runs: runs
};

const targetFile = path.join(__dirname, '../docs/evidence/robustness_runs.json');
fs.writeFileSync(targetFile, JSON.stringify(outData, null, 2));
console.log('Saved 54 empirical runs to docs/evidence/robustness_runs.json successfully');
