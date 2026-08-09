import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const failures = [];
const assert = (condition, message) => { if (!condition) failures.push(message); };

const browse = read('Tafseel-Browse-Teachers.dc.html');
const request = read('Tafseel-Request.dc.html');
const locales = read('js/locales.js');
const controller = read('src/Tafseel.Api/Controllers/AiMarketplaceController.cs');
const provider = read('src/Tafseel.Infrastructure/Ai/GroqAiProvider.cs');
const assistant = read('src/Tafseel.Infrastructure/Ai/AiMarketplaceAssistant.cs');
const appsettings = read('src/Tafseel.Api/appsettings.json');

assert(browse.includes('/ai/discovery') && browse.includes('/teachers?'),
  'AI discovery must hand off to the existing canonical teacher endpoint.');
assert(browse.includes('runUnifiedSearch') && browse.includes('role="search"'),
  'Browse must use one unified search that can call AI discovery.');
assert(!browse.includes('id="ai-discovery-title"') && !browse.includes('tf-ai-panel'),
  'Standalone AI Discovery panel must be removed from Browse.');
assert(browse.includes('tf-secondary-filters') && browse.includes('id="f-subject"')
  && browse.includes('id="f-service"') && browse.includes('tf-filter-panel'),
  'Normal Subject/Service/filter discovery must remain first-class.');
assert(request.includes('/ai/request-assistant') && request.includes('useAiDraft') && request.includes('discardAiDraft'),
  'Request assistant must expose explicit use/discard controls.');
assert(request.includes("Tafseel.api.post('/learning-requests'"),
  'The canonical explicit Learning Request submit path must remain present.');
assert(controller.includes('Authorize(Policy = Permissions.StudentsCreateRequests)')
  && controller.includes('EnableRateLimiting("ai")'),
  'AI endpoints must require Students and the separate AI limiter.');
assert(provider.includes('jsonSchemaIsStrict: true') && provider.includes('ChatResponseFormat.CreateJsonSchemaFormat'),
  'Provider must request strict JSON Schema output.');
assert(!provider.includes('ToolChatMessage') && !provider.includes('ChatTool.Create'),
  'Release 9 provider must not enable tools.');
assert(assistant.includes('catalog.GetSubjectsAsync(false') && assistant.includes('catalog.GetServicesAsync(false'),
  'Subject and service resolution must use canonical catalogs.');
assert(!controller.includes('ChatClient') && !controller.includes('Groq'),
  'Controllers must not contain provider-specific code.');
assert(appsettings.includes('"Enabled": false') && !/gsk_[A-Za-z0-9_-]{12,}/.test(appsettings),
  'Committed configuration must default AI off and contain no Groq secret.');
assert(!browse.includes('api.groq.com') && !request.includes('api.groq.com'),
  'Browser code must never call Groq directly.');
assert(!browse.includes('innerHTML') && !request.includes('innerHTML'),
  'AI model text must not be inserted with innerHTML.');

for (const key of ['ai_discovery_title', 'ai_unavailable', 'ai_help_title', 'ai_request_title', 'ai_request_use']) {
  const occurrences = locales.split(`"${key}"`).length - 1;
  assert(occurrences === 2, `${key} must exist exactly once in English and once in Arabic.`);
}

const forbidden = ['recommended teacher', 'best teacher', 'top teacher', 'conversion rate'];
for (const claim of forbidden)
  assert(!`${browse}\n${request}`.toLowerCase().includes(claim), `Forbidden public claim found: ${claim}`);

if (failures.length) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}

console.log('Release 9 AI-assisted marketplace integrity: PASS');
