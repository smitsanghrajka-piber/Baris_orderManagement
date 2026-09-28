import { defineMachine } from '../../src/common/util/state-machine';
import { InvalidTransitionError } from '../../src/common/errors/domain-error';
import { SPEC_MACHINE } from '../../src/modules/products/products.service';

describe('defineMachine', () => {
  type S = 'A' | 'B' | 'C';
  const m = defineMachine<S>({ A: ['B'], B: ['C'], C: [] });

  it('allows declared transitions', () => {
    expect(m.can('A', 'B')).toBe(true);
    expect(() => m.assert('A', 'B', 'Thing')).not.toThrow();
  });

  it('rejects every undeclared pair with INVALID_TRANSITION', () => {
    for (const from of m.states) for (const to of m.states) {
      if (m.can(from, to)) continue;
      expect(() => m.assert(from, to, 'Thing')).toThrow(InvalidTransitionError);
      try { m.assert(from, to, 'Thing'); } catch (e: any) { expect(e.code).toBe('INVALID_TRANSITION'); expect(e.statusCode).toBe(409); expect(e.details).toEqual({ from, to }); }
    }
  });

  it('writes a human sentence', () => {
    expect(() => m.assert('C', 'A', 'Widget W-1')).toThrow('Widget W-1 cannot move to a: its status is c.');
  });
});

describe('specification machine', () => {
  it('approved specs can only be superseded or archived; archived is terminal', () => {
    expect(SPEC_MACHINE.nextStates('DRAFT').sort()).toEqual(['APPROVED', 'ARCHIVED']);
    expect(SPEC_MACHINE.nextStates('APPROVED').sort()).toEqual(['ARCHIVED', 'SUPERSEDED']);
    expect(SPEC_MACHINE.nextStates('SUPERSEDED')).toEqual(['ARCHIVED']);
    expect(SPEC_MACHINE.nextStates('ARCHIVED')).toEqual([]);
    expect(SPEC_MACHINE.can('APPROVED', 'DRAFT')).toBe(false);
    expect(SPEC_MACHINE.can('SUPERSEDED', 'APPROVED')).toBe(false);
  });
});
