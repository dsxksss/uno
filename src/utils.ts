import { CardData, CardColor, CardValue } from './types';

export const COLORS: CardColor[] = ['red', 'blue', 'green', 'yellow'];
export const VALUES: CardValue[] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'skip', 'reverse', 'draw2'];
export const WILD_VALUES: CardValue[] = ['wild', 'draw4'];

export const createDeck = (): CardData[] => {
  const deck: CardData[] = [];
  let idCounter = 0;
  const seed = Date.now();

  COLORS.forEach(color => {
    VALUES.forEach(value => {
      // Two of each value except 0
      const count = value === '0' ? 1 : 2;
      for (let i = 0; i < count; i++) {
        deck.push({ id: `card-${seed}-${idCounter++}`, color, value });
      }
    });
  });

  for (let i = 0; i < 4; i++) {
    deck.push({ id: `card-${seed}-${idCounter++}`, color: 'wild', value: 'wild' });
    deck.push({ id: `card-${seed}-${idCounter++}`, color: 'wild', value: 'draw4' });
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

export const canPlayCard = (card: CardData, topCard: CardData | undefined, drawStack: number = 0, currentWildColor: CardColor | null = null, lastNumberValue: CardValue | null = null): boolean => {
  if (!topCard) return false;

  const effectiveColor = (topCard.color === 'wild' && currentWildColor) ? currentWildColor : topCard.color;

  if (drawStack > 0) {
    // Basic stacking: +2 or +4 always works
    if (card.value === 'draw2' || card.value === 'draw4') return true;

    // Royale rules: Reverse or Skip of the same color can deflect the penalty
    if (card.color === effectiveColor && (card.value === 'reverse' || card.value === 'skip')) return true;

    return false;
  }

  if (card.color === 'wild') return true;

  // Standard matching: match color or match top card's value
  const matchesCurrent = card.color === effectiveColor || card.value === topCard.value;

  // Royale matching: match the value of the most recent numeric card played
  const matchesLastNumber = lastNumberValue && card.value === lastNumberValue;

  return matchesCurrent || !!matchesLastNumber;
};

export const canJumpIn = (card: CardData, topCard: CardData | undefined, _drawStack: number = 0): boolean => {
  if (!topCard) return false;
  // Jump-in requires an exact match of color and value, and only for number cards
  if (!isNumberCard(card)) return false;
  return card.color === topCard.color && card.value === topCard.value;
};

export const isNumberCard = (card: CardData): boolean => {
  return !['skip', 'reverse', 'draw2', 'wild', 'draw4'].includes(card.value);
};
