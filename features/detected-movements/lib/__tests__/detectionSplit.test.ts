import { requestDetectedSplit, validateDetectedSplit, type DetectedSplitInput } from '../detection-split';

const input: DetectedSplitInput = {
  workspaceId: 8, suggestionId: 90, expectedUpdatedAt: '2026-10-13T00:00:00.123456+00:00',
  header: { movementType: 'expense', accountId: 20, currencyCode: 'PEN', amount: 0.3,
    description: 'Compra', occurredAt: '2026-10-12T10:00:00-05:00' },
  parts: [{ amount: 0.1, categoryId: 30 }, { amount: 0.2, categoryId: 31 }],
};
const result = { workspaceId: 8, suggestionId: 90, status: 'registered', movementId: 1,
  movementIds: [1, 2], alreadyRegistered: false };

describe('atomic detected split contract (local fixtures only)', () => {
  it('sends one RPC with the original version including microseconds', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: result, error: null });
    expect(await requestDetectedSplit({ rpc }, input)).toEqual(result);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('register_detected_movement_split', {
      p_workspace_id: 8, p_suggestion_id: 90, p_expected_updated_at: input.expectedUpdatedAt,
      p_header: input.header, p_parts: input.parts,
    });
  });
  it.each([0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1])('rejects unsafe ID %s before I/O', async id => {
    const rpc = jest.fn();
    await expect(requestDetectedSplit({ rpc }, { ...input, suggestionId: id })).rejects.toThrow('Revisa');
    expect(rpc).not.toHaveBeenCalled();
  });
  it('compares integer cents instead of floating-point sums or an epsilon', () => {
    expect(() => validateDetectedSplit(input)).not.toThrow();
    expect(() => validateDetectedSplit({ ...input, header: { ...input.header, amount: 0.1 + 0.2 } })).toThrow('Revisa');
    expect(() => validateDetectedSplit({ ...input, parts: [{ amount: 0.1, categoryId: 30 }, { amount: 0.19, categoryId: 31 }] })).toThrow('suma');
  });
  it('rejects duplicate categories, one part and more than 100 parts', () => {
    for (const parts of [[input.parts[0]], Array(101).fill(input.parts[0]), [{ amount: 0.1, categoryId: 30 }, { amount: 0.2, categoryId: 30 }]]) {
      expect(() => validateDetectedSplit({ ...input, parts })).toThrow('Revisa');
    }
  });
  it.each(['2026-02-30T00:00:00Z', '2026-10-13T24:00:00Z', '2026-10-13T00:00:00', 'infinity'])('rejects invalid version %s', date => {
    expect(() => validateDetectedSplit({ ...input, expectedUpdatedAt: date })).toThrow('Revisa');
  });
  it('does not pretend linked occurrences are supported in phase 1', async () => {
    const rpc = jest.fn();
    const headers: DetectedSplitInput['header'][] = [
      { ...input.header, subscriptionId: 7 }, { ...input.header, recurringIncomeId: 7 },
      { ...input.header, metadata: { recurring_income_id: 7 } },
      { ...input.header, metadata: { obligation_event_id: 7 } },
    ];
    for (const header of headers) await expect(requestDetectedSplit({ rpc }, { ...input, header })).rejects.toThrow('agrupado');
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([{ code: 'PGRST202' }, { code: '42883' }, { message: 'denied' }])('never falls back when RPC fails (%s)', async error => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error });
    await expect(requestDetectedSplit({ rpc }, input)).rejects.toThrow();
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each([
    { workspaceId: 9 }, { suggestionId: 91 }, { status: 'pending' }, { movementId: 2 },
    { movementIds: [1] }, { movementIds: [1, 1] }, { movementIds: [2, 1] }, { alreadyRegistered: 'true' },
  ])('requires a complete result from the same scope (%s)', async change => {
    const rpc = jest.fn().mockResolvedValue({ data: { ...result, ...change }, error: null });
    await expect(requestDetectedSplit({ rpc }, input)).rejects.toThrow('confirmar');
  });
  it('checks a delayed response against the captured request, not subsequent form edits', async () => {
    let settle!: (value: { data: unknown; error: null }) => void;
    const editable = JSON.parse(JSON.stringify(input)) as DetectedSplitInput;
    const pending = requestDetectedSplit({ rpc: () => new Promise(resolve => { settle = resolve; }) }, editable);
    editable.workspaceId = 9; editable.parts.pop();
    settle({ data: result, error: null });
    expect(await pending).toEqual(result);
  });
});
