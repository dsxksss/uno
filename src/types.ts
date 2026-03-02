import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type CardColor = 'red' | 'blue' | 'green' | 'yellow' | 'wild';
export type CardValue = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'draw4';

export interface CardData {
  id: string;
  color: CardColor;
  value: CardValue;
  chosenColor?: CardColor | null;
}

export interface Player {
  id: string;
  name: string;
  hand: CardData[];
  isLocal: boolean;
  hasShoutedONO: boolean;
}

export interface GameState {
  deck: CardData[];
  discardPile: CardData[];
  players: Player[];
  currentPlayerIndex: number;
  direction: 1 | -1;
  status: 'lobby' | 'playing' | 'ended';
  roomCode: string;
  winner: string | null;
  timeLeft: number;
  drawStack: number;
  currentWildColor: CardColor | null;
  pendingWildColorPlayerIndex: number | null;
  pendingONOPlayerId: string | null;
  jumpInPlayerId: string | null;
}
