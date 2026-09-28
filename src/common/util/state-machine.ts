import { InvalidTransitionError } from '../errors/domain-error';

/**
 * Explicit transition tables (architecture §7–9). Every workflow defines its
 * allowed (from → to[]) map once; services call `assert` before writing.
 * A generated unit test iterates every pair NOT in the table and expects
 * InvalidTransitionError.
 */
export interface StateMachine<S extends string> {
  readonly states: readonly S[];
  can(from: S, to: S): boolean;
  assert(from: S, to: S, label: string, humanStates?: Partial<Record<S, string>>): void;
  nextStates(from: S): S[];
}

export function defineMachine<S extends string>(transitions: Record<S, readonly S[]>): StateMachine<S> {
  const states = Object.keys(transitions) as S[];
  return {
    states,
    can: (from, to) => (transitions[from] ?? []).includes(to),
    nextStates: (from) => [...(transitions[from] ?? [])],
    assert(from, to, label, human) {
      if (!(transitions[from] ?? []).includes(to)) {
        const h = (s: S) => human?.[s] ?? s.replace(/_/g, ' ').toLowerCase();
        throw new InvalidTransitionError(`${label} cannot move to ${h(to)}: its status is ${h(from)}.`, { from, to });
      }
    },
  };
}
