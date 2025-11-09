const { saveEvent, listEvents } = require('../../lib/devicesStore');

describe('devicesStore events', () => {
  test('saveEvent and listEvents in-memory', async () => {
    const evt = { device_token: 't1', device_id: 'dev1', event_type: 'test', detail: 'ok', actor: 'tester' };
    const s = await saveEvent(evt);
    expect(s.ok).toBeTruthy();
    const l = await listEvents(10);
    expect(l.ok).toBeTruthy();
    // find our event by device_id
    const found = l.rows.find(r => r.device_id === 'dev1' || r.device_id === 'dev1');
    expect(found).toBeTruthy();
  });
});
