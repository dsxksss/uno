import { CardData, CardColor, CardValue } from './types';

export const COLORS: CardColor[] = ['red', 'blue', 'green', 'yellow'];
export const VALUES: CardValue[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];
export const WILD_VALUES: CardValue[] = ['wild', 'draw4'];

export const createDeck = (): CardData[] => {
  const deck: CardData[] = [];
  let idCounter = 0;

  COLORS.forEach(color => {
    VALUES.forEach(value => {
      // Two of each value except 0
      const count = value === '0' ? 1 : 2;
      for (let i = 0; i < count; i++) {
        deck.push({ id: `card-${idCounter++}`, color, value });
      }
    });
  });

  for (let i = 0; i < 4; i++) {
    deck.push({ id: `card-${idCounter++}`, color: 'wild', value: 'wild' });
    deck.push({ id: `card-${idCounter++}`, color: 'wild', value: 'draw4' });
  }

  return shuffle(deck);
};

export const shuffle = <T,>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

export const canPlayCard = (card: CardData, topCard: CardData | undefined, drawStack: number = 0, currentWildColor: CardColor | null = null): boolean => {
  if (!topCard) return false;
  if (drawStack > 0) {
    // If there's a stack, you can only play another draw card to stack it
    return card.value === 'draw2' || card.value === 'draw4';
  }
  if (card.color === 'wild') return true;
  
  const effectiveColor = (topCard.color === 'wild' && currentWildColor) ? currentWildColor : topCard.color;
  return card.color === effectiveColor || card.value === topCard.value;
};

export const canJumpIn = (card: CardData, topCard: CardData | undefined, drawStack: number = 0): boolean => {
  if (!topCard) return false;
  // Jump-in is not allowed if there's an active draw stack
  if (drawStack > 0) return false;
  // Jump-in requires an exact match of color and value
  if (card.color === 'wild' || topCard.color === 'wild') return false;
  return card.color === topCard.color && card.value === topCard.value;
};

export const isNumberCard = (card: CardData): boolean => {
  return !['skip', 'reverse', 'draw2', 'wild', 'draw4'].includes(card.value);
};
