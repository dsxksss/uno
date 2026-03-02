import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from './components/Card';
import { CardData, GameState, Player, cn, CardColor, Difficulty } from './types';
import { createDeck, canPlayCard, canJumpIn, shuffle, isNumberCard } from './utils';
import { Users, Plus, Play, LogIn, Trophy, RefreshCw, ArrowRight, ArrowLeft, Volume2, VolumeX, Zap, LogOut, ChevronLeft } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Howl } from 'howler';

const INITIAL_HAND_SIZE = 7;

// Sound effects - Organic, thumpy "dong dong" style (no mechanical sounds)
const sounds = {
  play1: new Howl({ src: ['/audio/打出数字牌音效1.wav'], volume: 0.6 }),
  play2: new Howl({ src: ['/audio/打出数字牌音效2.wav'], volume: 0.6 }),
  item: new Howl({ src: ['/audio/打出道具牌.wav'], volume: 0.7 }),
  draw: new Howl({ src: ['/audio/选择手牌.wav'], volume: 0.5 }),
  click: new Howl({ src: ['/audio/点击.wav'], volume: 0.4 }),
  btnHover: new Howl({ src: ['/audio/hover按钮.wav'], volume: 0.3 }),
  turn: new Howl({ src: ['/audio/切换玩家.wav'], volume: 0.5 }),
  win: new Howl({ src: ['/audio/游戏胜利.wav'], volume: 0.7 }),
  lose: new Howl({ src: ['/audio/游戏失败.wav'], volume: 0.6 }),
  countdown: new Howl({ src: ['/audio/最后三秒倒计时.wav'], volume: 0.6 }),
  skip: new Howl({ src: ['/audio/跳过skip.wav'], volume: 0.6 }),
  color: new Howl({ src: ['/audio/选择颜色.wav'], volume: 0.6 }),
  hover: new Howl({ src: ['/audio/hover卡牌.wav'], volume: 0.3 }),
  jump: new Howl({ src: ['/audio/打出道具牌.wav'], volume: 0.7 }),
  uno: new Howl({ src: ['/audio/喊uno.wav'], volume: 0.8 }),
};

const ComicBubble = ({ text, className, color = "white", size = "normal" }: { text: string, className?: string, color?: string, size?: "normal" | "large" }) => {
  const isLarge = size === 'large';
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0, rotate: -20, y: 20 }}
      animate={{
        scale: 1,
        opacity: 1,
        rotate: 0,
        y: 0
      }}
      exit={{ scale: 0, opacity: 0, rotate: 20, y: -20 }}
      transition={{ type: "spring", damping: 12, stiffness: 200 }}
      className={cn(
        "absolute -top-20 left-1/2 -translate-x-1/2 z-[100] pointer-events-none",
        className
      )}
    >
      <div className="relative">
        <svg
          width={isLarge ? "420" : "140"}
          height={isLarge ? "280" : "100"}
          viewBox="0 0 140 100"
          className={cn(
            "stroke-black stroke-[4px] drop-shadow-[0_10px_20px_rgba(0,0,0,0.5)] transition-all",
            color === 'yellow' ? 'fill-yellow-400' : 'fill-white'
          )}
        >
          <path d="M20,50 L10,30 L40,25 L50,5 L80,20 L110,5 L125,30 L150,45 L130,70 L140,95 L100,80 L70,100 L50,80 L20,95 L30,70 L10,65 Z" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center p-8">
          <span className={cn(
            "text-black font-black italic tracking-tighter transform -rotate-2 select-none text-center leading-tight",
            isLarge ? "text-5xl" : "text-2xl"
          )}>
            {text}
          </span>
        </div>
      </div>
    </motion.div>
  );
};

export default function App() {
  const [gameState, setGameState] = useState<GameState>({
    deck: [],
    discardPile: [],
    players: [],
    currentPlayerIndex: 0,
    direction: 1,
    status: 'lobby',
    roomCode: '',
    winner: null,
    timeLeft: 30,
    drawStack: 0,
    currentWildColor: null,
    pendingWildColorPlayerIndex: null,
    pendingUNOPlayerId: null,
    jumpInPlayerId: null,
    isReverseActive: false,
    isDevMode: false,
  });

  const [playerName, setPlayerName] = useState('');
  const [inputRoomCode, setInputRoomCode] = useState('');
  const [shake, setShake] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [isHandHovered, setIsHandHovered] = useState(false);
  const [isDiscardHovered, setIsDiscardHovered] = useState(false);
  const [sortType, setSortType] = useState<'value' | 'color'>('value');
  const [isMuted, setIsMuted] = useState(false);
  const [aiCount, setAiCount] = useState(3);
  const [aiDifficulty, setAiDifficulty] = useState<Difficulty>('medium');
  const [drawingCards, setDrawingCards] = useState<{ id: string, playerIndex: number, card: CardData }[]>([]);
  const [devClicks, setDevClicks] = useState(0);
  const [seeAllHands, setSeeAllHands] = useState(false);
  const [hoveredGodModePlayerId, setHoveredGodModePlayerId] = useState<string | null>(null);
  const lastNumberValue = [...gameState.discardPile].reverse().find(isNumberCard)?.value || null;

  const playSound = useCallback((soundName: string) => {
    if (!isMuted && sounds[soundName as keyof typeof sounds]) {
      sounds[soundName as keyof typeof sounds].play();
    } else if (!sounds[soundName as keyof typeof sounds]) {
      console.warn(`Sound "${soundName}" not found in library.`);
    }
  }, [isMuted]);

  // Trigger screen shake
  const triggerShake = useCallback(() => {
    setShake(true);
    setTimeout(() => setShake(false), 300);
  }, []);

  const createRoom = () => {
    if (!playerName) return;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const localPlayer: Player = {
      id: 'local-player',
      name: playerName,
      hand: [],
      isLocal: true,
      hasShoutedUNO: false,
    };

    // Add some AI players for simulation
    const aiPlayers: Player[] = Array.from({ length: aiCount }).map((_, i) => ({
      id: `ai-${i}`,
      name: `机器人 ${i + 1}`,
      hand: [],
      isLocal: false,
      hasShoutedUNO: false,
      difficulty: aiDifficulty,
    }));

    setGameState(prev => ({
      ...prev,
      roomCode: code,
      players: [localPlayer, ...aiPlayers],
      status: 'lobby',
      winner: null,
      pendingUNOPlayerId: null,
      jumpInPlayerId: null,
      isDevMode: false,
    }));
    playSound('click');
  };

  const kickPlayer = (id: string) => {
    setGameState(prev => {
      const newPlayers = prev.players.filter(p => p.id !== id);
      // Adjust aiCount if it was a bot
      if (id.startsWith('ai-')) {
        setAiCount(newPlayers.filter(p => !p.isLocal).length);
      }
      return { ...prev, players: newPlayers };
    });
    playSound('click');
  };

  const forceWin = () => {
    const winnerName = gameState.players[gameState.currentPlayerIndex].name;
    setGameState(prev => ({
      ...prev,
      status: 'ended',
      winner: winnerName
    }));

    if (gameState.players[gameState.currentPlayerIndex].isLocal) {
      confetti({
        particleCount: 150,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#ef4444', '#3b82f6', '#10b981', '#fbbf24']
      });
      playSound('win');
    } else {
      playSound('lose');
    }
  };

  const joinRoom = () => {
    if (!playerName || !inputRoomCode) return;
    setGameState(prev => ({
      ...prev,
      roomCode: inputRoomCode,
      players: [
        { id: 'local-player', name: playerName, hand: [], isLocal: true, hasShoutedUNO: false },
        { id: 'ai-1', name: '机器人 1', hand: [], isLocal: false, hasShoutedUNO: false, difficulty: 'medium' },
        { id: 'ai-2', name: '机器人 2', hand: [], isLocal: false, hasShoutedUNO: false, difficulty: 'medium' },
      ],
      status: 'lobby',
    }));
    playSound('click');
  };

  const leaveLobby = () => {
    setGameState(prev => ({
      ...prev,
      status: 'lobby',
      roomCode: '',
      players: [],
      drawStack: 0,
      currentWildColor: null,
      pendingWildColorPlayerIndex: null,
      pendingUNOPlayerId: null,
      jumpInPlayerId: null,
      isReverseActive: false,
      isDevMode: false,
    }));
    setSeeAllHands(false);
    setDevClicks(0);
    playSound('click');
  };

  const leaveGame = () => {
    playSound('click');
    setGameState(prev => {
      const localPlayer = prev.players.find(p => p.isLocal);
      const handToReturn = localPlayer ? localPlayer.hand : [];

      // Shuffle leaving player's hand back into deck if game was active
      const newDeck = shuffle([...prev.deck, ...handToReturn]);

      return {
        ...prev,
        deck: newDeck,
        status: 'lobby',
        roomCode: '',
        players: [],
        drawStack: 0,
        currentWildColor: null,
        pendingWildColorPlayerIndex: null,
        pendingUNOPlayerId: null,
        jumpInPlayerId: null,
        isReverseActive: false,
        isDevMode: false,
      };
    });
    setSeeAllHands(false);
    setDevClicks(0);
  };

  const startGame = () => {
    playSound('click');
    const fullDeck = createDeck();    // Give cards to players
    const players = gameState.players.map(p => ({ ...p, hand: [], hasShoutedUNO: false }));

    // Deal cards
    for (let i = 0; i < INITIAL_HAND_SIZE; i++) {
      players.forEach(p => {
        const card = fullDeck.pop();
        if (card) p.hand.push(card);
      });
    }

    const firstCardIndex = fullDeck.findIndex(card => !['skip', 'reverse', 'draw2', 'wild', 'draw4'].includes(card.value));
    const firstCard = fullDeck.splice(firstCardIndex, 1)[0];

    setGameState(prev => ({
      ...prev,
      deck: fullDeck,
      discardPile: [firstCard],
      players,
      status: 'playing',
      currentPlayerIndex: 0,
      direction: 1,
      winner: null,
      timeLeft: 30,
      drawStack: 0,
      currentWildColor: null,
      pendingWildColorPlayerIndex: null,
      pendingUNOPlayerId: null,
      jumpInPlayerId: null,
    }));

    triggerShake();
    setShowRecommendations(false);
    setSelectedCardId(null);
  };

  const playCard = (playerIndex: number, cardId: string) => {
    setGameState(prev => {
      const player = prev.players[playerIndex];
      const cardIndex = player.hand.findIndex(c => c.id === cardId);
      if (cardIndex === -1) return prev;
      const card = player.hand[cardIndex];
      const topCard = prev.discardPile[prev.discardPile.length - 1];
      const drawStack = prev.drawStack;
      const currentWildColor = prev.currentWildColor;

      const isJumpIn = playerIndex !== prev.currentPlayerIndex;

      if (isJumpIn) {
        if (!canJumpIn(card, topCard, drawStack)) return prev;
      } else {
        const lastNum = [...prev.discardPile].reverse().find(isNumberCard)?.value || null;
        if (!canPlayCard(card, topCard, drawStack, currentWildColor, lastNum)) return prev;
      }

      const newHand = [...player.hand];
      newHand.splice(cardIndex, 1);

      const newPlayers = [...prev.players];
      // 扣除打出的牌
      newPlayers[playerIndex] = { ...player, hand: newHand, hasShoutedUNO: false };

      let nextDirection = prev.direction;
      let skipNext = false;
      let newDrawStack = drawStack;

      if (card.value === 'reverse') {
        nextDirection = (prev.direction * -1) as (1 | -1);
        if (prev.players.length === 2) skipNext = true;
      } else if (card.value === 'skip') {
        skipNext = true;
      } else if (card.value === 'draw2') {
        newDrawStack += 2;
      } else if (card.value === 'draw4') {
        newDrawStack += 4;
      }

      // Handle winner
      if (newHand.length === 0) {
        // Run side effects outside or after this? Confetti and sounds.
        // For now, keep the state update pure.
        setTimeout(() => {
          if (player.isLocal) {
            playSound('win');
            confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
          } else {
            playSound('lose');
          }
        }, 0);

        setTimeout(() => {
          setGameState(p => ({ ...p, status: 'ended' }));
        }, 1500);

        return {
          ...prev,
          players: newPlayers,
          discardPile: [...prev.discardPile, card],
          winner: player.name,
        };
      }

      let nextPlayerIndex = (playerIndex + nextDirection + prev.players.length) % prev.players.length;
      if (skipNext) {
        nextPlayerIndex = (nextPlayerIndex + nextDirection + prev.players.length) % prev.players.length;
      }

      // Post-state side effects
      setTimeout(() => {
        triggerShake();
        setShowRecommendations(false);
        setSelectedCardId(null);
        const randomPlaySound = Math.random() > 0.5 ? 'play1' : 'play2';
        const isActionCard = ['draw2', 'draw4', 'skip', 'reverse'].includes(card.value);
        playSound(isActionCard ? 'item' : randomPlaySound as any);
        if (card.value === 'skip') playSound('skip');
        if (card.value === 'reverse') {
          playSound('item'); // Reuse item sound or specific if added
          setTimeout(() => setGameState(p => ({ ...p, isReverseActive: false })), 2000);
        }
        if (isJumpIn) {
          setTimeout(() => setGameState(p => ({ ...p, jumpInPlayerId: null })), 2000);
        }
      }, 0);

      // Auto-shout check
      const shoutTarget = newPlayers.find(p => p.hand.length === 1 && !p.hasShoutedUNO);
      return {
        ...prev,
        players: newPlayers,
        discardPile: [...prev.discardPile, card],
        currentPlayerIndex: nextPlayerIndex,
        direction: nextDirection,
        timeLeft: 30,
        drawStack: newDrawStack,
        currentWildColor: card.color === 'wild' || card.value === 'draw4' ? null : card.color,
        pendingWildColorPlayerIndex: card.color === 'wild' || card.value === 'draw4' ? playerIndex : null,
        pendingUNOPlayerId: shoutTarget ? shoutTarget.id : null,
        jumpInPlayerId: isJumpIn ? player.id : null,
        isReverseActive: card.value === 'reverse',
      };
    });
  };

  const drawCard = (playerIndex: number) => {
    setGameState(prev => {
      const newDeck = [...prev.deck];
      const newDiscardPile = [...prev.discardPile];
      const newPlayers = [...prev.players];
      const player = newPlayers[playerIndex];

      const drawCount = prev.drawStack > 0 ? prev.drawStack : 1;
      const drawnCards: CardData[] = [];

      for (let i = 0; i < drawCount; i++) {
        if (newDeck.length === 0) {
          if (newDiscardPile.length <= 1) break;
          const topCard = newDiscardPile[newDiscardPile.length - 1];
          const reshuffledDeck = shuffle(newDiscardPile.slice(0, -1).map(c => ({ ...c, chosenColor: undefined })));
          newDeck.push(...reshuffledDeck);
          newDiscardPile.length = 0;
          newDiscardPile.push(topCard);
          setTimeout(() => playSound('draw'), 0);
        }
        const card = newDeck.pop();
        if (card) drawnCards.push(card);
      }

      if (drawnCards.length === 0) return prev;

      newPlayers[playerIndex] = {
        ...player,
        hand: [...player.hand, ...drawnCards],
        hasShoutedUNO: false,
      };

      setTimeout(() => {
        drawnCards.forEach((card, i) => {
          setTimeout(() => {
            const dcId = `${card.id}-${Date.now()}-${i}-${Math.random()}`;
            setDrawingCards(p => [...p, { id: dcId, playerIndex, card }]);
            playSound('draw');
            setTimeout(() => {
              setDrawingCards(p => p.filter(dc => dc.id !== dcId));
            }, 600);
          }, i * 150);
        });
        triggerShake();
        setShowRecommendations(false);
        setSelectedCardId(null);
      }, 0);

      return {
        ...prev,
        deck: newDeck,
        discardPile: newDiscardPile,
        players: newPlayers,
        currentPlayerIndex: (prev.currentPlayerIndex + prev.direction + prev.players.length) % prev.players.length,
        timeLeft: 30,
        drawStack: 0,
        currentWildColor: prev.currentWildColor,
        pendingUNOPlayerId: null,
      };
    });
  };

  const chooseColor = (color: CardColor) => {
    setGameState(prev => {
      const playerIndex = prev.pendingWildColorPlayerIndex!;
      const newDiscardPile = [...prev.discardPile];
      const topCardIndex = newDiscardPile.length - 1;

      // Persist the chosen color on the card itself
      newDiscardPile[topCardIndex] = {
        ...newDiscardPile[topCardIndex],
        chosenColor: color
      };

      const card = newDiscardPile[topCardIndex];
      let nextDirection = prev.direction;
      let skipNext = false;
      let newDrawStack = prev.drawStack;

      if (card.value === 'draw4') {
        newDrawStack += 4;
      }

      let nextPlayerIndex = (playerIndex + nextDirection + prev.players.length) % prev.players.length;

      return {
        ...prev,
        discardPile: newDiscardPile,
        currentPlayerIndex: nextPlayerIndex,
        direction: nextDirection,
        timeLeft: 30,
        drawStack: newDrawStack,
        currentWildColor: color,
        pendingWildColorPlayerIndex: null,
      };
    });

    triggerShake();
    playSound('color');
  };

  const shoutUNO = (playerId: string) => {
    setGameState(prev => {
      const playerIndex = prev.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1) return prev;

      const newPlayers = [...prev.players];
      newPlayers[playerIndex] = { ...newPlayers[playerIndex], hasShoutedUNO: true };

      return {
        ...prev,
        players: newPlayers,
        pendingUNOPlayerId: null,
      };
    });
    playSound('uno');

    // Auto-clear the bubble after 2 seconds
    setTimeout(() => {
      setGameState(prev => {
        const playerIndex = prev.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) return prev;
        const newPlayers = [...prev.players];
        newPlayers[playerIndex] = { ...newPlayers[playerIndex], hasShoutedUNO: false };
        return { ...prev, players: newPlayers };
      });
    }, 2000);
  };

  // Turn Timer Countdown
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (gameState.status === 'playing') {
      timer = setInterval(() => {
        setGameState(prev => {
          if (prev.timeLeft <= 0) {
            clearInterval(timer);
            return prev;
          }
          // Pause timer during overlay animations
          if (prev.isReverseActive || prev.jumpInPlayerId) {
            return prev;
          }
          if (prev.timeLeft === 4) { // Sound starts at 3,2,1 usually
            playSound('countdown');
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [gameState.status, gameState.currentPlayerIndex]);

  // Handle UNO Penalty
  useEffect(() => {
    if (gameState.status === 'playing' && gameState.pendingUNOPlayerId) {
      const timer = setTimeout(() => {
        setGameState(prev => {
          if (!prev.pendingUNOPlayerId) return prev;

          const playerIndex = prev.players.findIndex(p => p.id === prev.pendingUNOPlayerId);
          if (playerIndex === -1) return prev;

          const player = prev.players[playerIndex];
          if (player.hasShoutedUNO) return prev;

          // Penalty: Draw 2 cards
          const newDeck = [...prev.deck];
          const newDiscardPile = [...prev.discardPile];
          const drawnCards: CardData[] = [];

          for (let i = 0; i < 2; i++) {
            if (newDeck.length === 0) {
              if (newDiscardPile.length <= 1) break;
              const topCard = newDiscardPile[newDiscardPile.length - 1];
              const reshuffledDeck = shuffle(newDiscardPile.slice(0, -1).map(c => ({ ...c, chosenColor: undefined })));
              newDeck.push(...reshuffledDeck);
              newDiscardPile.length = 0;
              newDiscardPile.push(topCard);
            }
            const card = newDeck.pop();
            if (card) drawnCards.push(card);
          }

          const newPlayers = [...prev.players];
          newPlayers[playerIndex] = {
            ...player,
            hand: [...player.hand, ...drawnCards],
            hasShoutedUNO: false,
          };

          return {
            ...prev,
            deck: newDeck,
            discardPile: newDiscardPile,
            players: newPlayers,
            pendingUNOPlayerId: null,
          };
        });
        triggerShake();
        playSound('draw');
      }, 3000); // 3 seconds to shout UNO
      return () => clearTimeout(timer);
    }
  }, [gameState.pendingUNOPlayerId, gameState.status]);

  // Handle Timeout
  useEffect(() => {
    if (gameState.status === 'playing' && gameState.timeLeft <= 0) {
      // Don't act if an overlay animation is playing
      if (gameState.isReverseActive || gameState.jumpInPlayerId) return;

      if (gameState.pendingWildColorPlayerIndex !== null) {
        const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        chooseColor(randomColor);
        return;
      }

      const currentPlayerIndex = gameState.currentPlayerIndex;
      const currentPlayer = gameState.players[currentPlayerIndex];
      const topCard = gameState.discardPile[gameState.discardPile.length - 1];
      const drawStack = gameState.drawStack;
      const currentWildColor = gameState.currentWildColor;
      const playableCard = currentPlayer.hand.find(c => canPlayCard(c, topCard, drawStack, currentWildColor, lastNumberValue));

      if (playableCard) {
        playCard(currentPlayerIndex, playableCard.id);
      } else {
        drawCard(currentPlayerIndex);
      }
    }
  }, [gameState.timeLeft, gameState.status, gameState.isReverseActive, gameState.jumpInPlayerId]);

  // Enhanced AI logic
  useEffect(() => {
    if (gameState.status === 'playing') {
      // Don't act if an overlay animation is playing
      if (gameState.isReverseActive || gameState.jumpInPlayerId) return;
      const pendingUNOPlayerId = gameState.pendingUNOPlayerId;
      if (pendingUNOPlayerId) {
        const player = gameState.players.find(p => p.id === pendingUNOPlayerId);
        if (player && !player.isLocal) {
          const difficulty = player.difficulty || 'medium';

          let shoutChance = 0.8;
          let delay = 1000 + Math.random() * 1000;

          if (difficulty === 'easy') { shoutChance = 0.5; delay = 1500 + Math.random() * 1000; }
          if (difficulty === 'hard') { shoutChance = 1.0; delay = 400 + Math.random() * 400; }

          const timer = setTimeout(() => {
            // AI has 80% chance to shout UNO
            if (Math.random() < shoutChance) {
              shoutUNO(pendingUNOPlayerId);
            }
          }, delay);
          return () => clearTimeout(timer);
        }
      }

      const pendingPlayerIndex = gameState.pendingWildColorPlayerIndex;
      if (pendingPlayerIndex !== null) {
        const player = gameState.players[pendingPlayerIndex];
        if (!player.isLocal) {
          const difficulty = player.difficulty || 'medium';
          const delay = difficulty === 'hard' ? 500 : 1000;

          const timer = setTimeout(() => {
            const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];
            const counts = colors.map(c => player.hand.filter(card => card.color === c).length);
            const maxIndex = counts.indexOf(Math.max(...counts));
            chooseColor(colors[maxIndex]);
          }, delay);
          return () => clearTimeout(timer);
        }
        return;
      }

      const currentPlayer = gameState.players[gameState.currentPlayerIndex];
      if (!currentPlayer.isLocal) {
        const difficulty = currentPlayer.difficulty || 'medium';

        let delay = 1500;
        if (difficulty === 'easy') delay = 3000 + Math.random() * 1500; // 3 - 4.5s delay for easy bot
        if (difficulty === 'hard') delay = 500 + Math.random() * 300;

        const timer = setTimeout(() => {
          const topCard = gameState.discardPile[gameState.discardPile.length - 1];
          const drawStack = gameState.drawStack;
          const currentWildColor = gameState.currentWildColor;

          let playableCard: CardData | undefined;
          const playableCards = currentPlayer.hand.filter(c => canPlayCard(c, topCard, drawStack, currentWildColor, lastNumberValue));

          if (difficulty === 'hard' && playableCards.length > 0) {
            // Hard AI Strategy
            const otherPlayers = gameState.players.filter(p => p.id !== currentPlayer.id);
            const nearWinner = otherPlayers.find(p => p.hand.length < 3);

            if (nearWinner) {
              playableCard = playableCards.find(c => ['draw4', 'draw2', 'skip', 'reverse'].includes(c.value));
            }
            if (!playableCard) {
              playableCard = playableCards.find(c => !['draw4', 'draw2', 'skip', 'reverse', 'wild'].includes(c.value));
            }
            if (!playableCard) playableCard = playableCards[0];
          } else {
            playableCard = playableCards[0];
          }

          if (playableCard) {
            playCard(gameState.currentPlayerIndex, playableCard.id);
          } else {
            drawCard(gameState.currentPlayerIndex);
          }
        }, delay);
        return () => clearTimeout(timer);
      }
    }
  }, [gameState.currentPlayerIndex, gameState.status, gameState.pendingWildColorPlayerIndex, gameState.pendingUNOPlayerId, gameState.isReverseActive, gameState.jumpInPlayerId]);

  // Turn Notification
  useEffect(() => {
    if (gameState.status === 'playing') {
      const isLocalTurn = gameState.players[gameState.currentPlayerIndex]?.isLocal;
      if (isLocalTurn) {
        playSound('turn');
      }
    }
  }, [gameState.currentPlayerIndex, gameState.status]);

  const handleCardClick = (card: CardData) => {
    // Block interactions during overlay animations
    if (gameState.isReverseActive || gameState.jumpInPlayerId) return;
    playSound('click');
    const localPlayerIndex = gameState.players.findIndex(p => p.isLocal);
    const isLocalTurn = gameState.currentPlayerIndex === localPlayerIndex;
    const topCard = gameState.discardPile[gameState.discardPile.length - 1];
    const drawStack = gameState.drawStack;
    const currentWildColor = gameState.currentWildColor;
    const isPendingColor = gameState.pendingWildColorPlayerIndex !== null;

    // Immediate Jump-in
    if (!isLocalTurn && !isPendingColor && canJumpIn(card, topCard, drawStack)) {
      playSound('jump');
      playCard(localPlayerIndex, card.id);
      return;
    }

    // Normal play selection
    if (isLocalTurn && !isPendingColor && canPlayCard(card, topCard, drawStack, currentWildColor, lastNumberValue)) {
      if (selectedCardId === card.id) {
        setSelectedCardId(null);
      } else {
        setSelectedCardId(card.id);
      }
    }
  };

  // AI Jump-in logic
  useEffect(() => {
    if (gameState.status === 'playing' && gameState.pendingWildColorPlayerIndex === null) {
      // Don't jump in during overlay animations
      if (gameState.isReverseActive || gameState.jumpInPlayerId) return;
      const topCard = gameState.discardPile[gameState.discardPile.length - 1];
      const drawStack = gameState.drawStack;

      // Find AI players who can jump in
      const jumpInOpportunities: { playerIndex: number, cardId: string, difficulty: Difficulty }[] = [];

      gameState.players.forEach((player, idx) => {
        // AI can jump in if it's not their turn and they have a matching card
        if (!player.isLocal && idx !== gameState.currentPlayerIndex) {
          player.hand.forEach(card => {
            if (canJumpIn(card, topCard, drawStack)) {
              jumpInOpportunities.push({ playerIndex: idx, cardId: card.id, difficulty: player.difficulty || 'medium' });
            }
          });
        }
      });

      if (jumpInOpportunities.length > 0) {
        // Random AI jumps in after a delay
        const opportunity = jumpInOpportunities[Math.floor(Math.random() * jumpInOpportunities.length)];

        let jumpChance = 0.4;
        let delay = 1000 + Math.random() * 1000;

        if (opportunity.difficulty === 'easy') { jumpChance = 0.1; delay = 3500 + Math.random() * 1500; }
        if (opportunity.difficulty === 'hard') { jumpChance = 0.9; delay = 400 + Math.random() * 400; }

        const timer = setTimeout(() => {
          if (Math.random() < jumpChance) {
            playSound('jump');
            playCard(opportunity.playerIndex, opportunity.cardId);
          }
        }, delay);
        return () => clearTimeout(timer);
      }
    }
  }, [gameState.discardPile, gameState.status, gameState.pendingWildColorPlayerIndex, gameState.isReverseActive, gameState.jumpInPlayerId]);

  const renderLobby = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white p-6">
      <motion.div
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative mb-20 group cursor-default select-none"
      >
        <div className="relative">
          {/* Main Comic Bubble Wrapper */}
          <motion.div
            animate={{ rotate: [-2, 1, -2] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="relative"
          >
            <svg width="360" height="240" viewBox="0 0 140 100" className="fill-white stroke-black stroke-[4px] drop-shadow-[0_30px_60px_rgba(0,0,0,0.5)]">
              <path d="M20,50 L10,30 L40,25 L50,5 L80,20 L110,5 L125,30 L150,45 L130,70 L140,95 L100,80 L70,100 L50,80 L20,95 L30,70 L10,65 Z" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center -mt-4">
              <div className="text-8xl font-black italic tracking-tighter flex gap-1 transform -rotate-3">
                {"UNO".split('').map((c, i) => (
                  <motion.span
                    key={i}
                    whileHover={{ scale: 1.2, y: -10 }}
                    className={cn(i === 0 ? "text-red-500" : i === 1 ? "text-blue-500" : "text-emerald-500")}
                  >
                    {c}
                  </motion.span>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Royale Badge */}
          <motion.div
            initial={{ scale: 0, rotate: 20 }}
            animate={{ scale: 1, rotate: 8 }}
            onClick={() => {
              const newClicks = devClicks + 1;
              if (newClicks >= 5) {
                setGameState(prev => ({ ...prev, isDevMode: true }));
                playSound('item');
                setDevClicks(0);
              } else {
                setDevClicks(newClicks);
                playSound('click');
              }
            }}
            whileHover={{ rotate: 0, scale: 1.1 }}
            className={cn(
              "absolute -bottom-4 -right-16 bg-yellow-400 border-4 border-black px-10 py-4 rounded-3xl shadow-[15px_15px_0_rgba(0,0,0,1)] transform cursor-pointer transition-all",
              gameState.isDevMode && "bg-emerald-500 shadow-[15px_15px_0_rgba(16,185,129,1)]"
            )}
          >
            <span className="text-4xl font-black italic tracking-tighter text-black uppercase">
              {gameState.isDevMode ? 'DEV MODE' : 'Royale'}
            </span>
          </motion.div>
        </div>
      </motion.div>

      <div className="w-full max-w-md space-y-6 bg-zinc-900/50 p-8 rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl">
        {!gameState.roomCode ? (
          <>
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">玩家昵称</label>
              <input
                type="text"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="输入你的名字..."
                className="w-full bg-zinc-800 border-2 border-zinc-700 rounded-xl px-4 py-3 focus:border-white outline-none transition-all font-bold"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={createRoom}
                onMouseEnter={() => playSound('btnHover')}
                disabled={!playerName}
                className="flex items-center justify-center gap-2 bg-white text-black font-black py-4 rounded-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
              >
                <Plus size={20} /> 创建房间
              </button>
              <div className="relative">
                <button
                  onClick={joinRoom}
                  onMouseEnter={() => playSound('btnHover')}
                  disabled={!playerName || !inputRoomCode}
                  className="w-full flex items-center justify-center gap-2 bg-zinc-800 border-2 border-zinc-700 text-white font-black py-4 rounded-xl hover:bg-zinc-700 transition-all disabled:opacity-50"
                >
                  <LogIn size={20} /> 加入房间
                </button>
              </div>
            </div>

            <input
              type="text"
              value={inputRoomCode}
              onChange={(e) => setInputRoomCode(e.target.value.toUpperCase())}
              placeholder="房间代码..."
              className="w-full bg-zinc-800/50 border-2 border-zinc-700/50 rounded-xl px-4 py-2 text-center font-mono tracking-widest focus:border-zinc-500 outline-none transition-all"
            />
          </>
        ) : (
          <div className="space-y-8">
            <div className="text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">房间代码</p>
              <h2 className="text-5xl font-black tracking-widest font-mono">{gameState.roomCode}</h2>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                  <Users size={14} /> 玩家 ({gameState.players.length}/10)
                </p>
                <div className="flex items-center gap-2 bg-zinc-800/80 p-1 rounded-lg border border-white/5">
                  <button
                    onClick={() => {
                      if (aiCount > 1) {
                        const newCount = aiCount - 1;
                        setAiCount(newCount);
                        const local = gameState.players.find(p => p.isLocal)!;
                        const newAis = Array.from({ length: newCount }).map((_, i) => ({
                          id: `ai-${i}`,
                          name: `机器人 ${i + 1}`,
                          hand: [],
                          isLocal: false,
                          hasShoutedUNO: false,
                          difficulty: aiDifficulty,
                        }));
                        setGameState(prev => ({ ...prev, players: [local, ...newAis] }));
                        playSound('click');
                      }
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors text-zinc-400 hover:text-white"
                  >
                    -
                  </button>
                  <span className="text-xs font-black min-w-[2ch] text-center">{aiCount}</span>
                  <button
                    onClick={() => {
                      if (aiCount < 9) {
                        const newCount = aiCount + 1;
                        setAiCount(newCount);
                        const local = gameState.players.find(p => p.isLocal)!;
                        const newAis = Array.from({ length: newCount }).map((_, i) => ({
                          id: `ai-${i}`,
                          name: `机器人 ${i + 1}`,
                          hand: [],
                          isLocal: false,
                          hasShoutedUNO: false,
                          difficulty: aiDifficulty,
                        }));
                        setGameState(prev => ({ ...prev, players: [local, ...newAis] }));
                        playSound('click');
                      }
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors text-zinc-400 hover:text-white"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between bg-zinc-900/40 p-3 rounded-xl border border-white/5">
                <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                  全场 AI 难度
                </p>
                <div className="flex bg-zinc-800/80 p-1 rounded-lg border border-white/5">
                  {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                    <button
                      key={d}
                      onClick={() => {
                        setAiDifficulty(d);
                        playSound('click');
                        setGameState(prev => ({
                          ...prev,
                          players: prev.players.map(p => p.isLocal ? p : { ...p, difficulty: d })
                        }));
                      }}
                      className={cn(
                        "px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-tighter transition-all",
                        aiDifficulty === d
                          ? (d === 'hard' ? "bg-red-500 text-white shadow-[0_0_15px_rgba(239,68,68,0.5)]" : "bg-white text-black shadow-lg")
                          : "text-zinc-500 hover:text-white"
                      )}
                    >
                      {d === 'easy' ? '新手' : d === 'medium' ? '高手' : '噩梦'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                {gameState.players.map((p) => (
                  <motion.div
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    key={p.id}
                    className="flex items-center justify-between bg-zinc-800/50 p-3 rounded-xl border border-white/5"
                  >
                    <span className="font-bold">{p.name} {p.isLocal && <span className="text-xs text-zinc-500">(你)</span>}</span>
                    <div className="flex items-center gap-2">
                      {p.isLocal && <span className="text-[10px] bg-white text-black px-2 py-0.5 rounded-full font-black">房主</span>}
                      {!p.isLocal && (
                        <button
                          onClick={() => kickPlayer(p.id)}
                          className="p-1.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg hover:bg-red-500 hover:text-white transition-all shadow-sm"
                          title="踢出玩家"
                        >
                          <LogOut size={12} />
                        </button>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={leaveLobby}
                onMouseEnter={() => playSound('btnHover')}
                className="flex-1 flex items-center justify-center gap-2 bg-zinc-800 text-zinc-400 font-bold py-4 rounded-xl hover:bg-zinc-700 hover:text-white transition-all active:scale-95"
              >
                <ChevronLeft size={20} /> 返回
              </button>
              <button
                onClick={startGame}
                onMouseEnter={() => playSound('btnHover')}
                className="flex-[2] flex items-center justify-center gap-2 bg-emerald-500 text-white font-black py-4 rounded-xl hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(16,185,129,0.3)]"
              >
                <Play size={20} fill="currentColor" /> 开始游戏
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  const renderGame = () => {
    const localPlayer = gameState.players.find(p => p.isLocal)!;
    const isLocalTurn = gameState.players[gameState.currentPlayerIndex].isLocal;
    const topCard = gameState.discardPile[gameState.discardPile.length - 1];
    const currentWildColor = gameState.currentWildColor;
    const isPendingColor = gameState.pendingWildColorPlayerIndex !== null;
    const isLocalPendingColor = gameState.pendingWildColorPlayerIndex !== null && gameState.players[gameState.pendingWildColorPlayerIndex].isLocal;
    const isAnimating = gameState.isReverseActive || !!gameState.jumpInPlayerId;

    return (
      <motion.div
        animate={shake ? { x: [-10, 10, -10, 10, 0], y: [-5, 5, -5, 5, 0] } : {}}
        className="relative min-h-screen bg-zinc-950 text-white overflow-hidden flex flex-col"
      >
        {/* Color Picker Overlay */}
        <AnimatePresence>
          {isLocalPendingColor && (
            <div className="fixed inset-0 z-[600] flex items-center justify-center">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/60"
              />

              <motion.div
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative z-[610] bg-zinc-900 border-2 border-white/20 p-10 rounded-[50px] shadow-[0_50px_100px_rgba(0,0,0,0.9)] flex flex-col items-center gap-8"
              >
                <div className="space-y-2 text-center">
                  <h2 className="text-sm font-black uppercase tracking-[0.4em] text-zinc-500">万能牌触发</h2>
                  <h1 className="text-4xl font-black italic tracking-tighter uppercase">选择下个颜色</h1>
                </div>

                <div className="flex gap-6">
                  {(['red', 'blue', 'green', 'yellow'] as CardColor[]).map(color => (
                    <motion.button
                      key={color}
                      whileHover={{ scale: 1.15, y: -10 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => chooseColor(color)}
                      className={cn(
                        "w-24 h-24 rounded-[30px] border-4 flex flex-col items-center justify-center shadow-2xl transition-all relative group",
                        color === 'red' ? "bg-red-500 border-red-400/50" :
                          color === 'blue' ? "bg-blue-500 border-blue-400/50" :
                            color === 'green' ? "bg-green-500 border-green-400/50" :
                              "bg-yellow-400 border-yellow-300/50 text-black"
                      )}
                    >
                      <div className="w-10 h-10 rounded-full bg-white/20 group-hover:bg-white/40 transition-colors" />
                      <div className="absolute inset-0 rounded-[26px] bg-gradient-to-tr from-black/20 to-transparent" />
                    </motion.button>
                  ))}
                </div>

                <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-2 animate-pulse">
                  点击上方色块以改变战场局势
                </p>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* Jump-in Special Effect Overlay */}
        <AnimatePresence>
          {gameState.jumpInPlayerId && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[1000] pointer-events-none flex items-center justify-center overflow-hidden"
            >
              <motion.div
                initial={{ scale: 0, opacity: 0, rotate: -30 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 2, opacity: 0 }}
                transition={{ duration: 0.5, type: "spring", damping: 12 }}
                className="relative"
              >
                {/* Visual Shockwave Layer */}
                <motion.div
                  initial={{ scale: 0.5, opacity: 1 }}
                  animate={{ scale: 3, opacity: 0 }}
                  transition={{ duration: 0.8 }}
                  className="absolute inset-0 bg-yellow-400 rounded-full blur-3xl -z-10"
                />

                {/* Comic Style Card */}
                <div className="absolute inset-0 bg-yellow-400 rotate-3 scale-105 rounded-[32px] border-4 border-black shadow-[20px_20px_0_rgba(0,0,0,1)]" />
                <div className="relative bg-white text-black px-16 py-10 rounded-[32px] border-4 border-black -rotate-2 flex flex-col items-center">
                  <div className="flex items-center gap-2 mb-2">
                    <Zap className="text-yellow-500 fill-yellow-500" size={24} />
                    <span className="text-lg font-black uppercase tracking-[0.3em] text-zinc-400">抢牌成功!</span>
                    <Zap className="text-yellow-500 fill-yellow-500" size={24} />
                  </div>
                  <span className="text-7xl font-black italic tracking-tighter uppercase whitespace-nowrap drop-shadow-sm">JUMP IN!</span>
                  <div className="mt-4 flex items-center gap-3 bg-black text-white px-6 py-2 rounded-full border-2 border-white/20">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-sm font-black uppercase tracking-widest">
                      {gameState.players.find(p => p.id === gameState.jumpInPlayerId)?.name} 绝地反击
                    </span>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Reverse Special Effect Overlay */}
        <AnimatePresence>
          {gameState.isReverseActive && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[1000] pointer-events-none flex items-center justify-center overflow-hidden"
            >
              <motion.div
                initial={{ scale: 0, opacity: 0, rotate: 180 }}
                animate={{ scale: 1, opacity: 1, rotate: 0 }}
                exit={{ scale: 2, opacity: 0 }}
                transition={{ duration: 0.5, type: "spring", damping: 12 }}
                className="relative"
              >
                <motion.div
                  initial={{ scale: 0.5, opacity: 1 }}
                  animate={{ scale: 3, opacity: 0 }}
                  transition={{ duration: 0.8 }}
                  className="absolute inset-0 bg-emerald-500 rounded-full blur-3xl -z-10"
                />

                <div className="absolute inset-0 bg-emerald-500 -rotate-3 scale-105 rounded-[32px] border-4 border-black shadow-[20px_20px_0_rgba(0,0,0,1)]" />
                <div className="relative bg-white text-black px-16 py-10 rounded-[32px] border-4 border-black rotate-2 flex flex-col items-center">
                  <div className="flex items-center gap-2 mb-2">
                    <RefreshCw className="text-emerald-500" size={24} />
                    <span className="text-lg font-black uppercase tracking-[0.3em] text-zinc-400">方向反转!</span>
                    <RefreshCw className="text-emerald-500" size={24} />
                  </div>
                  <span className="text-7xl font-black italic tracking-tighter uppercase whitespace-nowrap drop-shadow-sm">REVERSE!</span>
                  <div className="mt-4 flex items-center gap-3 bg-black text-white px-8 py-3 rounded-full border-2 border-white/20">
                    {gameState.direction === 1 ? <ArrowRight size={24} className="text-emerald-500" /> : <ArrowLeft size={24} className="text-emerald-500" />}
                    <span className="text-sm font-black uppercase tracking-widest">
                      当前顺序: {gameState.direction === 1 ? '顺时针' : '逆时针'}
                    </span>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Background Effects */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-500/20 rounded-full blur-[120px]" />
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
        </div>

        {/* Dev Command Center Overlay */}
        {gameState.isDevMode && (
          <div className="fixed bottom-12 right-12 z-[500] flex flex-col items-end gap-3 pointer-events-none">
            <AnimatePresence>
              {seeAllHands && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8, x: 20 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.8, x: 20 }}
                  className="bg-zinc-900/90 backdrop-blur-xl border border-white/20 p-4 rounded-2xl shadow-2xl pointer-events-auto"
                >
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">手牌监测中</p>
                  <div className="flex gap-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[10px] uppercase font-bold text-white/50">上帝视角已启用</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="bg-zinc-900 border-2 border-emerald-500/50 p-2 rounded-2xl shadow-2xl flex items-center gap-2 pointer-events-auto backdrop-blur-md">
              <div className="px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <span className="text-[10px] font-black uppercase tracking-tighter text-emerald-500">DEV PANEL</span>
              </div>

              <button
                onClick={() => setSeeAllHands(!seeAllHands)}
                className={cn(
                  "p-2 rounded-xl transition-all active:scale-90",
                  seeAllHands ? "bg-emerald-500 text-white" : "bg-zinc-800 text-zinc-500 hover:text-white"
                )}
                title="上帝视角 (查看所有手牌)"
              >
                <RefreshCw size={18} className={seeAllHands ? "animate-spin-slow" : ""} />
              </button>

              <button
                onClick={forceWin}
                className="p-2 bg-yellow-400 text-black rounded-xl hover:scale-110 active:scale-95 transition-all shadow-lg"
                title="瞬间获胜"
              >
                <Trophy size={18} fill="currentColor" />
              </button>

              <button
                onClick={() => {
                  setGameState(p => {
                    const players = [...p.players];
                    const randomCard = createDeck()[0];
                    players[p.currentPlayerIndex].hand.push(randomCard);
                    return { ...p, players };
                  });
                  playSound('draw');
                }}
                className="p-2 bg-white text-black rounded-xl hover:scale-110 active:scale-95 transition-all"
                title="给当前玩家加牌"
              >
                <Plus size={18} />
              </button>
            </div>
          </div>
        )}


        {/* Bottom-Left Deck Counter */}
        <div className="fixed bottom-12 left-12 z-[200] pointer-events-none drop-shadow-2xl">
          <div className="relative group grayscale hover:grayscale-0 transition-all duration-500">
            {/* Stacked cards effect */}
            <div className="absolute top-1 left-1 w-[60px] h-[84px] bg-zinc-800 rounded-lg border-2 border-zinc-700 -rotate-6" />
            <div className="absolute top-0.5 left-0.5 w-[60px] h-[84px] bg-zinc-800 rounded-lg border-2 border-zinc-700 -rotate-3" />

            <div className="relative w-[60px] h-[84px] bg-zinc-900 rounded-lg border-2 border-emerald-500/50 flex flex-col items-center justify-center gap-1 shadow-2xl backdrop-blur-sm">
              <Zap size={14} className="text-emerald-500 animate-pulse" fill="currentColor" />
              <div className="flex flex-col items-center">
                <span className="text-xl font-black italic tracking-tighter text-white">{gameState.deck.length}</span>
                <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500/70">DECK</span>
              </div>
            </div>

            {/* Glow effect */}
            <div className="absolute -inset-4 bg-emerald-500/10 rounded-full blur-2xl -z-10" />
          </div>
        </div>

        {/* Header / Stats */}
        <div className="relative z-10 p-6 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <h1 className="text-xl font-black italic tracking-tighter">UNO ROYALE</h1>

            <div className="flex items-center gap-4">
              <div className="bg-zinc-900 border border-white/10 px-4 py-2 rounded-2xl flex items-center gap-3 shadow-lg">
                <Users size={18} className="text-zinc-500" />
                <div className="flex -space-x-2">
                  {gameState.players.map((p, i) => (
                    <div
                      key={p.id}
                      className={cn(
                        "w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] font-black transition-all",
                        gameState.currentPlayerIndex === i ? "border-emerald-500 bg-emerald-500 scale-125 z-10 shadow-[0_0_15px_rgba(16,185,129,0.5)]" : "border-zinc-800 bg-zinc-900 text-zinc-500"
                      )}
                    >
                      {p.name[0]}
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-zinc-900 border border-white/10 px-4 py-2 rounded-2xl flex items-center gap-2 shadow-lg">
                {gameState.direction === 1 ? <ArrowRight size={18} className="text-emerald-500" /> : <ArrowLeft size={18} className="text-emerald-500" />}
                <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">方向</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-2.5 rounded-xl bg-zinc-900 border border-white/10 text-zinc-500 hover:text-white transition-all active:scale-90 shadow-lg"
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
            <div
              onClick={() => {
                if (gameState.isDevMode) {
                  navigator.clipboard.writeText(gameState.roomCode);
                  playSound('item');
                }
              }}
              className={cn(
                "bg-zinc-900 border border-white/10 px-4 py-2.5 rounded-xl shadow-lg hidden sm:block",
                gameState.isDevMode && "cursor-pointer hover:bg-emerald-500/10 hover:border-emerald-500/30 transition-all active:scale-95"
              )}
            >
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">房间: </span>
              <span className="font-mono font-bold text-sm tracking-widest">{gameState.roomCode}</span>
            </div>
            <button
              onClick={leaveGame}
              onMouseEnter={() => playSound('btnHover')}
              className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-2.5 rounded-xl flex items-center gap-2 hover:bg-red-500 hover:text-white transition-all group active:scale-95 shadow-lg shadow-red-500/5"
            >
              <LogOut size={16} className="group-hover:translate-x-1 transition-transform" />
              <span className="text-[10px] font-black uppercase tracking-widest">退出</span>
            </button>
          </div>
        </div>

        {/* Turn Timer Progress Bar */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-zinc-900 z-[100] pointer-events-none">
          <motion.div
            initial={{ width: "100%" }}
            animate={{ width: `${(gameState.timeLeft / 30) * 100}%` }}
            transition={{ duration: 1, ease: "linear" }}
            className={cn(
              "h-full transition-colors duration-500 shadow-[0_0_15px_currentColor]",
              gameState.timeLeft > 15 ? "bg-emerald-500 text-emerald-500" :
                gameState.timeLeft > 5 ? "bg-yellow-500 text-yellow-500" : "bg-red-500 text-red-500"
            )}
          />
        </div>
        <div className={cn(
          "absolute top-4 left-1/2 -translate-x-1/2 font-mono font-black text-2xl z-[100] pointer-events-none drop-shadow-[0_4px_10px_rgba(0,0,0,0.8)]",
          gameState.timeLeft > 15 ? "text-emerald-500" :
            gameState.timeLeft > 5 ? "text-yellow-500" : "text-red-500"
        )}>
          {gameState.timeLeft}
        </div>

        {/* Main Board */}
        <div className="flex-1 relative flex items-center justify-center -mt-8">
          {/* AI Players Hands (Simplified) */}
          <div className="absolute inset-0 pointer-events-none">
            {gameState.players.map((p, i) => {
              if (p.isLocal) return null;

              const playerCount = gameState.players.length;
              const isLarge = playerCount > 6;
              const radiusH = isLarge ? 38 : 42;
              const radiusV = isLarge ? 32 : 38;
              const iconScale = isLarge ? 0.8 : 1;

              // Position AI players around the board, starting from the bottom (local player position)
              const angle = (i / playerCount) * Math.PI * 2 + Math.PI / 2;
              return (
                <div
                  key={p.id}
                  className="absolute transition-all duration-500"
                  style={{
                    left: `${50 + Math.cos(angle) * radiusH}%`,
                    top: `${45 + Math.sin(angle) * radiusV}%`,
                    transform: `translate(-50%, -50%) scale(${iconScale})`
                  }}
                >
                  <div className={cn(
                    "flex flex-col items-center rounded-3xl transition-all",
                    isLarge ? "gap-1 p-2" : "gap-2 p-4",
                    gameState.currentPlayerIndex === i ? "bg-emerald-500/10 scale-110" : "opacity-60"
                  )}>
                    <div className="relative">
                      <AnimatePresence>
                        {p.hasShoutedUNO && (
                          <motion.div key="uno">
                            <ComicBubble text="UNO !!!" />
                          </motion.div>
                        )}
                        {gameState.jumpInPlayerId === p.id && (
                          <motion.div key="jump">
                            <ComicBubble
                              text="JUMP IN!"
                              color="yellow"
                              className={p.hasShoutedUNO ? "-top-40" : ""}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                      <div
                        onMouseEnter={() => seeAllHands && setHoveredGodModePlayerId(p.id)}
                        onMouseLeave={() => setHoveredGodModePlayerId(null)}
                        className={cn(
                          "w-12 h-16 bg-zinc-800 rounded-lg border-2 border-zinc-700 flex flex-col items-center justify-center shadow-xl relative overflow-hidden transition-all",
                          seeAllHands && "cursor-zoom-in hover:border-emerald-500/50 hover:scale-110"
                        )}
                      >
                        <span className="text-xs font-black">{p.hand.length}</span>
                        {seeAllHands && (
                          <>
                            <div className="absolute inset-0 bg-black/80 flex flex-wrap gap-0.5 p-1 items-center justify-center overflow-y-auto">
                              {p.hand.map((c, i) => (
                                <div key={i} className={cn("w-1.5 h-2 rounded-[1px]",
                                  c.color === 'red' ? 'bg-red-500' :
                                    c.color === 'blue' ? 'bg-blue-500' :
                                      c.color === 'green' ? 'bg-green-500' :
                                        c.color === 'yellow' ? 'bg-yellow-400' : 'bg-white'
                                )} title={c.value} />
                              ))}
                            </div>

                            {/* Detailed Hover Overlay */}
                            <AnimatePresence>
                              {hoveredGodModePlayerId === p.id && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.5, y: 10 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.5, y: 10 }}
                                  className="absolute left-1/2 -bottom-2 translate-y-full -translate-x-1/2 z-[1000] bg-zinc-900 border border-white/20 p-2 rounded-xl shadow-2xl flex flex-wrap gap-1 min-w-[120px] max-w-[200px] justify-center pointer-events-none"
                                >
                                  {p.hand.map((card, idx) => (
                                    <div
                                      key={card.id + idx}
                                      className={cn(
                                        "w-6 h-8 rounded-md border border-black/20 flex items-center justify-center text-[8px] font-black",
                                        card.color === 'red' ? 'bg-red-500' :
                                          card.color === 'blue' ? 'bg-blue-500' :
                                            card.color === 'green' ? 'bg-green-500' :
                                              card.color === 'yellow' ? 'bg-yellow-400' : 'bg-zinc-100 text-black'
                                      )}
                                    >
                                      {card.value === 'draw2' ? '+2' :
                                        card.value === 'draw4' ? '+4' :
                                          card.value === 'skip' ? 'S' :
                                            card.value === 'reverse' ? 'R' :
                                              card.value === 'wild' ? 'W' : card.value}
                                    </div>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </>
                        )}
                      </div>
                      {gameState.currentPlayerIndex === i && (
                        <motion.div
                          layoutId="active-indicator"
                          className="absolute -top-2 -right-2 w-4 h-4 bg-emerald-500 rounded-full animate-pulse"
                        />
                      )}
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest">{p.name}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Center Pile */}
          <div className="relative flex items-center gap-12">
            {/* Deck */}


            {/* Discard Pile Zone */}
            <div className="relative w-24 h-32 flex items-center justify-center">
              {/* This is the invisible hover catcher that grows to cover the fan-out area */}
              <div
                onMouseEnter={() => setIsDiscardHovered(true)}
                onMouseLeave={() => setIsDiscardHovered(false)}
                className={cn(
                  "absolute z-[150] cursor-help transition-all duration-300 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
                  isDiscardHovered
                    ? "w-[750px] h-[350px] opacity-100"
                    : "w-24 h-32 opacity-0"
                )}
              />

              <AnimatePresence mode="popLayout">
                {gameState.discardPile.slice(-5).map((card, idx, arr) => {
                  const isTop = idx === arr.length - 1;
                  const posIndex = arr.length - 1 - idx; // 0 for top, 1 for next...

                  // Fan out calculation
                  const centerOffset = idx - (arr.length - 1) / 2;

                  const fanX = isDiscardHovered ? centerOffset * 130 : centerOffset * 2;
                  const fanY = isDiscardHovered ? Math.abs(centerOffset) * 25 : Math.abs(centerOffset) * 2;
                  const fanRotate = isDiscardHovered ? centerOffset * 15 : (isTop ? (Math.random() - 0.5) * 6 : centerOffset * 2);

                  return (
                    <motion.div
                      key={`${card.id}-${idx}`}
                      initial={isTop ? { scale: 1.5, rotate: 45, opacity: 0, y: -100 } : false}
                      animate={{
                        scale: isDiscardHovered ? 1.15 : (isTop ? 1 : 0.95),
                        rotate: fanRotate,
                        opacity: isDiscardHovered ? 1 : (isTop ? 1 : 0.7),
                        y: fanY,
                        x: fanX,
                        zIndex: isDiscardHovered ? 100 + idx : idx
                      }}
                      transition={{ type: "spring", damping: 20, stiffness: 300 }}
                      className="absolute"
                    >
                      <Card
                        card={card}
                        disabled
                        className={cn(
                          "shadow-[0_20px_50px_rgba(0,0,0,0.5)] transition-all duration-300",
                          (!isDiscardHovered && !isTop) && "brightness-75",
                          isDiscardHovered && "ring-2 ring-white/20"
                        )}
                      />
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Tooltip when hovered */}
              <AnimatePresence>
                {isDiscardHovered && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="absolute -bottom-32 px-4 py-2 bg-black/80 backdrop-blur-md rounded-full border border-white/20 text-[10px] font-black uppercase tracking-widest whitespace-nowrap z-[200]"
                  >
                    近期打出的牌 (最后 5 张)
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        <div className="absolute inset-0 pointer-events-none z-[1000]">
          <AnimatePresence>
            {drawingCards.map(dc => {
              const playerCount = gameState.players.length;
              const angle = (dc.playerIndex / playerCount) * Math.PI * 2 + Math.PI / 2;
              const isLocal = gameState.players[dc.playerIndex]?.isLocal;

              const isLarge = playerCount > 6;
              const radiusH = isLarge ? 38 : 42;
              const radiusV = isLarge ? 32 : 38;
              const iconScale = isLarge ? 0.8 : 1;

              // Target positions matched exactly with player icon positions
              const tx = Math.cos(angle) * radiusH;
              const ty = Math.sin(angle) * radiusV - 5; // Offset by 5 to match the 45% center used in icons

              return (
                <motion.div
                  key={dc.id}
                  initial={{ x: "-45vw", y: "40vh", opacity: 0, scale: 0.5, rotate: 0 }}
                  animate={{
                    x: `${tx}vw`,
                    y: `${ty}vh`,
                    opacity: 1,
                    scale: isLocal ? 1 : (0.6 * iconScale),
                    rotate: 720
                  }}
                  exit={{ opacity: 0, scale: 0 }}
                  transition={{ duration: 0.6, ease: [0.23, 1, 0.32, 1] }}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
                >
                  <Card card={dc.card} isFaceDown={!isLocal} className="shadow-[0_20px_60px_rgba(0,0,0,0.8)]" />
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>

        <div className={cn(
          "relative z-30 flex flex-col items-center justify-end pointer-events-none",
          gameState.players.length > 6 ? "pb-12" : "pb-32"
        )}>
          {/* JUMP IN! Bubble for Local Player */}
          <AnimatePresence>
            {gameState.jumpInPlayerId === localPlayer.id && (
              <ComicBubble text="JUMP IN!" className="-top-32" color="yellow" />
            )}
          </AnimatePresence>

          {/* UNO Speech Bubble for Local Player */}
          <AnimatePresence>
            {localPlayer.hasShoutedUNO && (
              <ComicBubble text="UNO !!!" className="-top-32" />
            )}
          </AnimatePresence>

          {/* UNO Button */}
          <AnimatePresence>
            {gameState.pendingUNOPlayerId === 'local-player' && (
              <motion.div
                initial={{ scale: 0, y: 50 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0, y: 50 }}
                className="absolute -top-40 z-[300] pointer-events-auto"
              >
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => shoutUNO('local-player')}
                  className="relative group"
                >
                  <div className="absolute -inset-4 bg-orange-500 rounded-full blur-2xl opacity-50 animate-pulse" />
                  <div className="relative bg-orange-500 border-4 border-white px-12 py-6 rounded-[40px] shadow-[0_20px_0_rgb(194,65,12)] transform -rotate-3">
                    <span className="text-4xl font-black italic text-white tracking-tighter drop-shadow-md">喊 UNO !!!</span>
                  </div>
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-4 mb-20 z-[200] pointer-events-auto">
            {/* Turn Indicator */}
            <div className={cn(
              "px-6 py-2 rounded-full border transition-all flex items-center gap-3",
              isLocalTurn ? "border-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.4)]" : "border-white/10"
            )}>
              <div className={cn("w-2 h-2 rounded-full", isLocalTurn ? "bg-emerald-400 animate-ping" : "bg-zinc-700")} />
              <span className="text-xs font-black uppercase tracking-widest">
                {isLocalTurn ? "你的回合" : `${gameState.players[gameState.currentPlayerIndex].name} 的回合`}
              </span>
            </div>

            {/* Recommendation Toggle */}
            <button
              onClick={() => setShowRecommendations(!showRecommendations)}
              className={cn(
                "px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all border",
                showRecommendations ? "bg-white text-black border-white" : "bg-zinc-900 text-white border-white/10 hover:border-white/30"
              )}
            >
              推荐出牌
            </button>

            {/* Action Buttons */}
            <AnimatePresence mode="wait">
              {isAnimating ? null : isLocalTurn ? (
                <div className="flex gap-4">
                  {selectedCardId ? (
                    <motion.button
                      key="play-btn"
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.8, opacity: 0 }}
                      onClick={() => playCard(gameState.currentPlayerIndex, selectedCardId)}
                      className="px-8 py-2 bg-white text-black text-xs font-black uppercase tracking-widest rounded-full shadow-[0_0_40px_rgba(255,255,255,0.3)] hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                    >
                      <Play size={14} fill="currentColor" /> 出牌
                    </motion.button>
                  ) : (
                    !localPlayer.hand.some(c => canPlayCard(c, topCard, gameState.drawStack, gameState.currentWildColor, lastNumberValue)) && (
                      <motion.button
                        key="draw-btn"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        onClick={() => drawCard(gameState.currentPlayerIndex)}
                        className="px-8 py-2 bg-emerald-500 text-white text-xs font-black uppercase tracking-widest rounded-full shadow-[0_0_40px_rgba(16,185,129,0.3)] hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                      >
                        <RefreshCw size={14} /> {gameState.drawStack > 0 ? `摸 ${gameState.drawStack} 张` : '摸牌'}
                      </motion.button>
                    )
                  )}
                </div>
              ) : (
                selectedCardId && !isAnimating && (
                  <motion.button
                    key="jump-btn"
                    initial={{ scale: 0, rotate: -20 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0, rotate: 20 }}
                    onMouseEnter={() => playSound('btnHover')}
                    onClick={() => {
                      const localPlayerIndex = gameState.players.findIndex(p => p.isLocal);
                      playSound('jump');
                      playCard(localPlayerIndex, selectedCardId);
                    }}
                    className="px-10 py-3 bg-yellow-400 text-black text-sm font-black uppercase tracking-[0.2em] rounded-full shadow-[0_0_50px_rgba(250,204,21,0.5)] border-4 border-black hover:scale-110 active:scale-90 transition-all flex items-center gap-3 animate-bounce-short"
                  >
                    <Zap size={18} fill="currentColor" /> 绝地抢牌！
                  </motion.button>
                )
              )}
            </AnimatePresence>
          </div>

          <div className="flex flex-col items-center gap-6 w-full">
            <div
              onMouseEnter={() => setIsHandHovered(true)}
              onMouseLeave={() => setIsHandHovered(false)}
              className="relative flex items-center justify-center w-full h-48 pointer-events-auto"
            >
              {[...localPlayer.hand]
                .filter(card => !drawingCards.some(dc => dc.card.id === card.id))
                .sort((a, b) => {
                  if (sortType === 'color') {
                    const colorOrder = { red: 0, blue: 1, green: 2, yellow: 3, wild: 4 };
                    if (colorOrder[a.color as keyof typeof colorOrder] !== colorOrder[b.color as keyof typeof colorOrder]) {
                      return colorOrder[a.color as keyof typeof colorOrder] - colorOrder[b.color as keyof typeof colorOrder];
                    }
                  }
                  const valueOrder: Record<string, number> = {
                    '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
                    'skip': 10, 'reverse': 11, 'draw2': 12, 'wild': 13, 'draw4': 14
                  };
                  return (valueOrder[a.value] || 0) - (valueOrder[b.value] || 0);
                })
                .map((card, i, filteredHand) => {
                  const total = filteredHand.length;
                  const mid = (total - 1) / 2;
                  const offset = i - mid;

                  const isHorizontal = total > 7;

                  // Fan properties
                  const maxRotation = isHandHovered ? 60 : 20;
                  const rotationStep = Math.min(maxRotation / Math.max(total, 1), isHandHovered ? 12 : 4);
                  const rotate = isHorizontal ? 0 : offset * rotationStep;

                  const maxWidth = isHandHovered ? 800 : 400;
                  const xStep = Math.min(maxWidth / Math.max(total, 1), isHandHovered ? 80 : 30);
                  const xOffset = offset * xStep;

                  const yFactor = isHandHovered ? 15 : 5;
                  const fanY = Math.pow(Math.abs(offset), 1.5) * (yFactor / Math.max(total * 0.1, 1));
                  const yOffset = isHorizontal ? (isHandHovered ? -20 : 0) : fanY;

                  const lastNumberValue = [...gameState.discardPile].reverse().find(isNumberCard)?.value || null;
                  return (
                    <motion.div
                      key={card.id}
                      layout
                      initial={{ scale: 0.5, opacity: 0, y: 100 }}
                      animate={{
                        y: yOffset,
                        x: xOffset,
                        rotate,
                        opacity: 1,
                        scale: 1, // Ensure cards restore to full size
                        zIndex: isHandHovered ? 100 + i : i
                      }}
                      transition={{
                        type: "spring",
                        stiffness: 400,
                        damping: 30,
                      }}
                      className="absolute"
                    >
                      <Card
                        card={card}
                        disabled={isAnimating || ((!isLocalTurn || isPendingColor || !canPlayCard(card, topCard, gameState.drawStack, gameState.currentWildColor, lastNumberValue)) && !canJumpIn(card, topCard, gameState.drawStack))}
                        isHighlighted={!isAnimating && showRecommendations && isLocalTurn && !isPendingColor && canPlayCard(card, topCard, gameState.drawStack, gameState.currentWildColor, lastNumberValue)}
                        isSelected={selectedCardId === card.id}
                        onMouseEnter={() => playSound('hover')}
                        onClick={() => handleCardClick(card)}
                      />
                    </motion.div>
                  );
                })}
            </div>

            {/* Sorting Buttons */}
            <div className="flex bg-zinc-900/80 backdrop-blur-md p-1.5 rounded-2xl border border-white/10 pointer-events-auto transition-all hover:border-white/20">
              <button
                onClick={() => { setSortType('value'); playSound('click'); }}
                className={cn(
                  "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all",
                  sortType === 'value' ? "bg-white text-black shadow-lg scale-105" : "text-zinc-500 hover:text-white"
                )}
              >
                按数字排序
              </button>
              <button
                onClick={() => { setSortType('color'); playSound('click'); }}
                className={cn(
                  "px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all",
                  sortType === 'color' ? "bg-white text-black shadow-lg scale-105" : "text-zinc-500 hover:text-white"
                )}
              >
                按花色排序
              </button>
            </div>
          </div>
        </div>
      </motion.div >
    );
  };

  const renderEnd = () => {
    const localPlayer = gameState.players.find(p => p.isLocal)!;
    const isWin = gameState.winner === localPlayer.name;

    return (
      <div className="fixed inset-0 z-[2000] flex items-center justify-center pointer-events-none">
        {/* Backdrop for focus */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-black/40 backdrop-blur-[2px] pointer-events-auto"
        />

        <div className="relative z-10 flex flex-col items-center gap-12 pointer-events-auto">
          {/* Victory Bubble */}
          <div className="relative -mt-20">
            <ComicBubble
              text={isWin ? "你赢了!" : `${gameState.winner} 获胜!`}
              color={isWin ? "yellow" : "white"}
              size="large"
              className="relative top-0 scale-[1.2]"
            />
          </div>

          {/* Recapped Cards (Subtle) */}
          <div className="bg-zinc-900/60 backdrop-blur-xl p-10 rounded-[50px] border-2 border-white/10 shadow-2xl flex flex-col items-center">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500 mb-12">决胜瞬间 (最近 5 张)</p>
            <div className="flex justify-center h-48 w-full relative items-center min-w-[500px]">
              {gameState.discardPile.slice(-5).map((card, idx, arr) => {
                const isFinal = idx === arr.length - 1;
                const offset = idx - (arr.length - 1) / 2;

                return (
                  <motion.div
                    key={`${card.id}-${idx}`}
                    initial={{ scale: 0, rotate: -20, x: 0, y: 50 }}
                    animate={{
                      scale: isFinal ? 1.4 : 0.9,
                      rotate: offset * 12,
                      x: offset * 80,
                      y: Math.abs(offset) * 20 + (isFinal ? -40 : 0),
                      zIndex: isFinal ? 200 : idx
                    }}
                    transition={{ type: "spring", damping: 15, stiffness: 100, delay: 0.1 * idx }}
                    className="absolute"
                  >
                    <Card
                      card={card}
                      disabled
                      className={cn(
                        "shadow-2xl transition-all duration-500",
                        !isFinal && "brightness-50 grayscale-[0.4] blur-[1px]"
                      )}
                    />
                    {isFinal && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 1 }}
                        className="absolute -top-16 left-1/2 -translate-x-1/2 bg-yellow-400 text-black px-6 py-2 rounded-full shadow-[0_10px_30px_rgba(250,204,21,0.5)] z-[210] border-2 border-black"
                      >
                        <span className="text-sm font-black italic tracking-tighter uppercase whitespace-nowrap">
                          制胜一击
                        </span>
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </div>

            <div className="flex flex-col items-center gap-4 mt-16 w-full">
              <button
                onClick={startGame}
                className="w-full flex items-center justify-center gap-3 bg-white text-black font-black px-12 py-4 rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-[0_20px_40px_rgba(255,255,255,0.2)]"
              >
                <RefreshCw size={20} /> 再次挑战
              </button>

              <button
                onClick={() => setGameState(prev => ({ ...prev, status: 'lobby', roomCode: '' }))}
                className="text-zinc-500 font-bold hover:text-white transition-colors text-xs uppercase tracking-widest"
              >
                返回主菜单
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="font-sans selection:bg-emerald-500 selection:text-white">
      {gameState.status === 'lobby' && renderLobby()}
      {(gameState.status === 'playing' || gameState.status === 'ended') && renderGame()}
      {gameState.status === 'ended' && renderEnd()}
    </div>
  );
}
