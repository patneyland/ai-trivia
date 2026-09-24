import type { Room } from "./schemas";

export type GenerationStage =
  | "topic_expansion"
  | "fact_extraction"
  | "question_formulation"
  | "distractor_generation"
  | "complete";

export type GenerationProgress = {
  stage: GenerationStage;
  message: string;
  percent: number;
};

export type ServerToClientEvents = {
  room_joined: (payload: { room: Room; playerId: string }) => void;
  room_updated: (payload: { room: Room }) => void;
  generation_progress: (payload: GenerationProgress) => void;
  generation_error: (payload: { message: string; details?: string }) => void;
  error: (payload: { message: string }) => void;
};

export type AnswerAcknowledgment =
  | { accepted: true; choice: string }
  | { accepted: false; message: string; canRetry: boolean };

export type ClientToServerEvents = {
  create_room: (payload: { hostName?: string; questionCount?: number }) => void;
  join_room: (payload: { code: string; playerName: string }) => void;
  update_settings: (payload: {
    questionCount: number;
    timerSeconds: number;
  }) => void;
  collect_interests: () => void;
  submit_interests: (payload: { interests: string[] }) => void;
  start_game: () => void;
  submit_answer: (
    payload: {
      choice: string;
      timeMs: number;
      questionIndex: number;
      timerStartedAt: number;
    },
    acknowledge: (result: AnswerAcknowledgment) => void,
  ) => void;
  reveal_answer: () => void;
  next_question: () => void;
  start_question: () => void;
};
