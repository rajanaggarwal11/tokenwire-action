// A support agent's two requests, made the way any SDK makes them: POST to the base URL
// tokenwire puts in the environment. VARIANT picks a change to test the action against:
//   (unset)  the baseline
//   tool     adds a large tool definition — more tokens, no cache break
//   clock    puts the current time in the system prompt, re-rendered per request —
//            a cache break on request 2
const variant = process.env.VARIANT ?? "";
const base = process.env.ANTHROPIC_BASE_URL;
if (!base) throw new Error("run me under tokenwire wrap");

const schema = (props) => ({ type: "object", properties: props, required: Object.keys(props) });
const tools = [
  { name: "get_invoice", description: "Fetch an invoice by its number, with line items and status.", input_schema: schema({ number: { type: "string" } }) },
  { name: "open_ticket", description: "Open a support ticket for a human to review.", input_schema: schema({ subject: { type: "string" }, body: { type: "string" } }) },
];
if (variant === "tool") {
  tools.push({
    name: "search_knowledge_base",
    description: "Search help-center articles, resolved tickets, policies and runbooks. Returns up to 10 results with title, url, excerpt and score. ".repeat(6),
    input_schema: schema({ query: { type: "string" } }),
  });
}

const system = () =>
  [
    "You are the support assistant for Acme Billing. Answer questions about invoices, refunds and plans.",
    "Be concise. Never promise a refund; open a ticket instead.",
    variant === "clock" ? `Current time: ${new Date().toISOString()}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

async function ask(messages) {
  const res = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": "sk-ant-not-a-real-key", "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 512, system: system(), tools, messages }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

const messages = [{ role: "user", content: "Why was I charged twice on invoice INV-2041?" }];
await ask(messages);
await new Promise((r) => setTimeout(r, 5)); // so a clock in the prompt moves
messages.push(
  { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "get_invoice", input: { number: "INV-2041" } }] },
  { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "INV-2041: charged twice, second charge refunded." }] },
);
await ask(messages);
