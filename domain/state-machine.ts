import { TransitionError } from "./errors";

export type TransitionMap<State extends string> = Readonly<Record<State, readonly State[]>>;

export class StateMachine<State extends string> {
  constructor(
    private readonly entity: string,
    private readonly transitions: TransitionMap<State>,
  ) {}

  allowedFrom(state: State): readonly State[] {
    return this.transitions[state];
  }

  transition(from: State, to: State): State {
    if (!this.transitions[from].includes(to)) {
      throw new TransitionError(this.entity, from, to);
    }
    return to;
  }
}

