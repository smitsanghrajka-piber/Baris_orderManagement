import { NumberingService } from '../../src/common/numbering/numbering.service';

describe('NumberingService.format', () => {
  const svc = new NumberingService({} as any);
  it('pads and substitutes tokens', () => {
    expect(svc.format('{prefix}-{seq}', 'SO', 427, 6, '2026')).toBe('SO-000427');
    expect(svc.format('{prefix}{yy}-{seq}', 'Q', 7, 4, '2026')).toBe('Q26-0007');
    expect(svc.format('{year}/{prefix}/{seq}', 'JOB', 12, 3, '2026')).toBe('2026/JOB/012');
  });
});
