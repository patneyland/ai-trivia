import { Room, Player, Question } from "@trivia/shared";

const rooms = new Map<string, Room>();
const playerToRoom = new Map<string, string>();
const roomTimers = new Map<string, NodeJS.Timeout>();

const ROOM_CODE_LENGTH = 6;

const DEFAULTS = {
  questionCount: 10,
  timerSeconds: 20,
} as const;

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function createPlayer(id: string, name: string): Player {
  return {
    id,
    name,
    score: 0,
    interests: [],
    isHost: false,
    hasSubmittedInterests: false,
  };
}

export function createRoom(playerId: string): Room {
  let code = randomCode();
  while (rooms.has(code)) {
    code = randomCode();
  }

  const room: Room = {
    code,
    hostId: playerId,
    state: "lobby",
    players: [],
    questions: [],
    currentQuestion: 0,
    questionCount: DEFAULTS.questionCount,
    timerSeconds: DEFAULTS.timerSeconds,
    timerStartedAt: 0,
    answeredCount: 0,
    answers: {},
  };

  rooms.set(code, room);
  playerToRoom.set(playerId, code);
  return room;
}

export function joinRoom(
  code: string,
  playerId: string,
  playerName: string
): Room | null {
  const room = rooms.get(code);
  if (!room) return null;

  if (room.players.some((player) => player.id === playerId)) {
    return room;
  }

  const player = createPlayer(playerId, playerName);
  room.players.push(player);
  playerToRoom.set(playerId, code);
  return room;
}

export function getRoomByCode(code: string): Room | null {
  return rooms.get(code) ?? null;
}

export function getRoomForPlayer(playerId: string): Room | null {
  const code = playerToRoom.get(playerId);
  if (!code) return null;
  return rooms.get(code) ?? null;
}

export function updateSettings(
  room: Room,
  updates: { questionCount?: number; timerSeconds?: number }
): Room {
  if (typeof updates.questionCount === "number") {
    room.questionCount = updates.questionCount;
  }
  if (typeof updates.timerSeconds === "number") {
    room.timerSeconds = updates.timerSeconds;
  }
  return room;
}

export function setRoomState(room: Room, state: Room["state"]): Room {
  room.state = state;
  return room;
}

export function setRoomQuestions(room: Room, questions: Question[]): Room {
  room.questions = questions;
  room.currentQuestion = 0;
  room.answers = {};
  room.timerStartedAt = 0;
  room.answeredCount = 0;
  return room;
}

export function recordAnswer(
  room: Room,
  questionIndex: number,
  playerId: string,
  payload: { choice: string; timeMs: number }
): void {
  const key = String(questionIndex);
  if (!room.answers[key]) {
    room.answers[key] = {};
  }
  room.answers[key][playerId] = payload;
}

export function removePlayer(playerId: string): Room | null {
  const code = playerToRoom.get(playerId);
  if (!code) return null;

  const room = rooms.get(code);
  playerToRoom.delete(playerId);
  if (!room) return null;

  if (room.hostId === playerId) {
    clearTimer(code);
    room.players.forEach((player) => {
      playerToRoom.delete(player.id);
    });
    rooms.delete(code);
    return null;
  }

  room.players = room.players.filter((player) => player.id !== playerId);

  return room;
}

export function resetForNewRound(room: Room): Room {
  clearTimer(room.code);
  room.state = "lobby";
  room.questions = [];
  room.currentQuestion = 0;
  room.answers = {};
  room.timerStartedAt = 0;
  room.answeredCount = 0;
  room.players = room.players.map((player) => ({
    ...player,
    score: 0,
    interests: [],
    hasSubmittedInterests: false,
  }));
  return room;
}

export function clearInterests(room: Room): void {
  room.players.forEach((player) => {
    player.interests = [];
    player.hasSubmittedInterests = false;
  });
}

export function setPlayerInterests(
  room: Room,
  playerId: string,
  interests: string[]
): void {
  const player = room.players.find((item) => item.id === playerId);
  if (!player) return;
  player.interests = interests;
  player.hasSubmittedInterests = true;
}

export function advanceQuestion(room: Room): Room {
  room.currentQuestion += 1;
  return room;
}

export function allPlayersSubmitted(room: Room): boolean {
  if (room.players.length === 0) return false;
  return room.players.every((player) => player.hasSubmittedInterests);
}

export function allPlayersAnswered(room: Room): boolean {
  if (room.players.length === 0) return false;
  const key = String(room.currentQuestion);
  const answered = room.answers[key] ?? {};
  return room.players.every((player) => player.id in answered);
}

export function getAnsweredCount(room: Room): number {
  const key = String(room.currentQuestion);
  const answered = room.answers[key] ?? {};
  return room.players.filter((player) => player.id in answered).length;
}

export function isPlayerInRoom(room: Room, playerId: string): boolean {
  return room.players.some((player) => player.id === playerId);
}

export function startTimer(
  room: Room,
  onExpire: () => void
): void {
  clearTimer(room.code);
  room.timerStartedAt = Date.now();
  const timeout = setTimeout(onExpire, room.timerSeconds * 1000);
  roomTimers.set(room.code, timeout);
}

export function clearTimer(roomCode: string): void {
  const existing = roomTimers.get(roomCode);
  if (existing) {
    clearTimeout(existing);
    roomTimers.delete(roomCode);
  }
}
