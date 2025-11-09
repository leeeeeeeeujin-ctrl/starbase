import parsePlan from '../../../utils/ai/parsePlan.js';

describe('parsePlan utility', () => {
  test('parses direct JSON object', () => {
    const raw = '{"mode":"work","actions":[{"type":"write","path":"/template.json","content":"{}"}]}';
    const { plan, parsed } = parsePlan(raw);
    expect(parsed).toBe(true);
    expect(plan.mode).toBe('work');
    expect(Array.isArray(plan.actions)).toBe(true);
  });
  test('parses fenced JSON with commentary', () => {
    const raw = '다음은 작업 계획입니다.\n```json\n{\n  "mode": "chat",\n  "message": "요약입니다",\n  "actions": []\n}\n```\n추가 설명.';
    const { plan, parsed } = parsePlan(raw);
    expect(parsed).toBe(true);
    expect(plan.mode).toBe('chat');
  });
  test('extracts JSON from mixed output (object)', () => {
    const raw = '헤더\n- 항목\n{\n  "mode":"work",\n  "actions":[{"type":"create","path":"/utils/x.js","content":"console.log(1)"}]\n}\n끝';
    const { plan, parsed } = parsePlan(raw);
    expect(parsed).toBe(true);
    expect(plan.actions[0].type).toBe('create');
  });
  test('wraps array actions into plan', () => {
    const raw = '```\n[{"type":"write","path":"/a.txt","content":"hi"},{"type":"delete","path":"/b.txt"}]\n```';
    const { plan, parsed } = parsePlan(raw);
    expect(parsed).toBe(true);
    expect(plan.mode).toBe('work');
    expect(plan.actions.length).toBe(2);
  });
  test('extracts from <<PLAN>> markers', () => {
    const raw = 'noise before\n<<PLAN>>\n{"mode":"work","actions":[{"type":"create","path":"/x.txt","content":"abc"}]}\n<<ENDPLAN>>\nnoise after';
    const { plan, parsed } = parsePlan(raw);
    expect(parsed).toBe(true);
    expect(plan.actions[0].path).toBe('/x.txt');
  });
  test('extracts from alternative markers ===BEGIN:PLAN===', () => {
    const raw = '===BEGIN:PLAN=== {"mode":"chat","message":"hi"} ===END:PLAN===';
    const { plan, parsed } = parsePlan(raw);
    expect(parsed).toBe(true);
    expect(plan.mode).toBe('chat');
  });
  test('returns parsed=false when no JSON present', () => {
    const raw = '그냥 텍스트만 있습니다.';
    const { parsed } = parsePlan(raw);
    expect(parsed).toBe(false);
  });
});
