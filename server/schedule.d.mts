export interface ProgramSegment {
  id: string;
  title: string;
  artist: string;
  duration: number;
  url: string;
}

export interface ScheduleSnapshot<Segment extends ProgramSegment = ProgramSegment> {
  slug: string;
  mode: 'demo';
  current: Segment | null;
  next: Segment | null;
  offset: number;
  startedAt: number | null;
  endsAt: number | null;
  serverTime: number | null;
  cycleDuration?: number;
}
export declare const SCHEDULE_EPOCH: number;
export declare function scheduleAt<T extends ProgramSegment>(
  slug: string,
  programs: Record<string, T[]> | T[],
  nowMs?: number,
): ScheduleSnapshot<T>;
