import { z } from "zod";

export const PlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  score: z.number(),
  interests: z.array(z.string()),
  isHost: z.boolean(),
  hasSubmittedInterests: z.boolean(),
});

export const QuestionSchema = z.object({
  interest: z.string(),
  subInterest: z.string(),
  text: z.string(),
  options: z.array(z.string()).length(4),
  answer: z.string(),
});

export const RoomStateSchema = z.enum([
  "lobby",
  "collecting_interests",
  "generating",
  "ready",
  "playing",
  "revealing",
  "results",
]);

export const RoomSchema = z.object({
  code: z.string(),
  hostId: z.string(),
  state: RoomStateSchema,
  players: z.array(PlayerSchema),
  questions: z.array(QuestionSchema),
  currentQuestion: z.number(),
  questionCount: z.number(),
  timerSeconds: z.number(),
  timerStartedAt: z.number(),
  answeredCount: z.number(),
  answers: z.record(
    z.record(
      z.object({
        choice: z.string(),
        timeMs: z.number(),
      }),
    ),
  ),
});

export const CreateRoomSchema = z.object({
  hostName: z.string().min(1).max(24).optional(),
  questionCount: z.number().int().min(5).max(50).optional(),
});

export const JoinRoomSchema = z.object({
  code: z.string().length(6),
  playerName: z.string().min(1).max(24),
});

export const UpdateSettingsSchema = z.object({
  questionCount: z.number().int().min(5).max(50),
  timerSeconds: z.number().int().min(10).max(45),
});

export const SubmitInterestsSchema = z.object({
  interests: z.array(z.string().trim().min(1)).min(1).max(5),
});

export const SubmitAnswerSchema = z.object({
  questionIndex: z.number().int().nonnegative(),
  timerStartedAt: z.number().positive(),
  choice: z.string(),
  timeMs: z.number().nonnegative(),
});

export type Player = z.infer<typeof PlayerSchema>;
export type Question = z.infer<typeof QuestionSchema>;
export type RoomState = z.infer<typeof RoomStateSchema>;
export type Room = z.infer<typeof RoomSchema>;
