import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from './components/Card';
import { CardData, GameState, Player, cn, CardColor } from './types';
import { createDeck, canPlayCard, canJumpIn, shuffle, isNumberCard } from './utils';
import { Users, Plus, Play, LogIn, Trophy, RefreshCw, ArrowRight, ArrowLeft, Volume2, VolumeX, Zap } from 'lucide-react';
import confetti from 'canvas-confetti';
import { Howl } from 'howler';

const INITIAL_HAND_SIZE = 7;

// Sound effects - Organic, thumpy "dong dong" style (no mechanical sounds)
const sounds = {
  play: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2567/2567-preview.mp3'], volume: 0.6, rate: 0.8 }), // Deeper wood-like thump
  draw: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3'], volume: 0.5, rate: 0.9 }), // Natural paper slide
  click: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2567/2567-preview.mp3'], volume: 0.4, rate: 1.2 }), // Soft tap
  turn: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2570/2570-preview.mp3'], volume: 0.5, rate: 0.9 }), // Organic alert
  win: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3'], volume: 0.7 }),
  lose: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2572/2572-preview.mp3'], volume: 0.6 }),
  shuffle: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2569/2569-preview.mp3'], volume: 0.6 }),
  jump: new Howl({ src: ['https://assets.mixkit.co/active_storage/sfx/2567/2567-preview.mp3'], volume: 0.8, rate: 0.6 }), // Heavy "dong" for jump-in
};

const ComicBubble = ({ text, className, color = "white" }: { text: string, className?: string, color?: string }) => (
  <motion.div
    initial={{ scale: 0, opacity: 0, rotate: -20 }}
    animate={{ scale: 1, opacity: 1, rotate: 0 }}
    exit={{ scale: 0, opacity: 0, rotate: 20 }}
    className={cn(
      "absolute -top-20 left-1/2 -translate-x-1/2 z-[100] pointer-events-none",
      className
    )}
  >
    <div className="relative">
      <svg width="140" height="100" viewBox="0 0 140 100" className={cn("stroke-black stroke-[4px] drop-shadow-xl", color === 'yellow' ? 'fill-yellow-400' : 'fill-white')}>
        <path d="M20,50 L10,30 L40,25 L50,5 L80,20 L110,5 L125,30 L150,45 L130,70 L140,95 L100,80 L70,100 L50,80 L20,95 L30,70 L10,65 Z" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-black font-black italic text-2xl tracking-tighter transform -rotate-2">
          {text}
        </span>
      </div>
    </div>
  </motion.div>
);

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
  });

  const [playerName, setPlayerName] = useState('');
  const [inputRoomCode, setInputRoomCode] = useState('');
  const [shake, setShake] = useState(false);
  const [showRecommendations, setShowRecommendations] = useState(false);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [isHandHovered, setIsHandHovered] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const playSound = useCallback((soundName: keyof typeof sounds) => {
    if (!isMuted) {
      sounds[soundName].play();
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
      hasShoutedONO: false,
    };
    
    // Add some AI players for simulation
    const aiPlayers: Player[] = Array.from({ length: 3 }).map((_, i) => ({
      id: `ai-${i}`,
      name: `机器人 ${i + 1}`,
      hand: [],
      isLocal: false,
      hasShoutedONO: false,
    }));

    setGameState(prev => ({
      ...prev,
      roomCode: code,
      players: [localPlayer, ...aiPlayers],
      status: 'lobby',
    }));
    playSound('click');
  };

  const joinRoom = () => {
    if (!playerName || !inputRoomCode) return;
    // Simulate joining
    const localPlayer: Player = {
      id: 'local-player',
      name: playerName,
      hand: [],
      isLocal: true,
      hasShoutedONO: false,
    };
    const aiPlayers: Player[] = Array.from({ length: 2 }).map((_, i) => ({
      id: `ai-${i}`,
      name: `机器人 ${i + 1}`,
      hand: [],
      isLocal: false,
      hasShoutedONO: false,
    }));

    setGameState(prev => ({
      ...prev,
      roomCode: inputRoomCode,
      players: [...aiPlayers, localPlayer],
      status: 'lobby',
    }));
    playSound('click');
  };

  const startGame = () => {
    playSound('shuffle');
    const fullDeck = createDeck();
    const players = gameState.players.map(p => ({ ...p, hand: [], hasShoutedONO: false }));
    
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
      pendingONOPlayerId: null,
      jumpInPlayerId: null,
    }));
    
    triggerShake();
    setShowRecommendations(false);
    setSelectedCardId(null);
  };

  const playCard = (playerIndex: number, cardId: string) => {
    const player = gameState.players[playerIndex];
    const cardIndex = player.hand.findIndex(c => c.id === cardId);
    if (cardIndex === -1) return;
    const card = player.hand[cardIndex];
    const topCard = gameState.discardPile[gameState.discardPile.length - 1];
    const drawStack = gameState.drawStack;
    const currentWildColor = gameState.currentWildColor;

    if (gameState.pendingWildColorPlayerIndex !== null) return;
    if (!canPlayCard(card, topCard, drawStack, currentWildColor)) return;

    const newHand = [...player.hand];
    newHand.splice(cardIndex, 1);

    const isJumpIn = playerIndex !== gameState.currentPlayerIndex;
    const newPlayers = [...gameState.players];
    newPlayers[playerIndex] = { ...player, hand: newHand, hasShoutedONO: false };

    // Check if player needs to shout ONO
    let pendingONOId = null;
    if (newHand.length === 1 && isNumberCard(newHand[0])) {
      pendingONOId = player.id;
    }

    if (card.color === 'wild') {
      setGameState(prev => ({
        ...prev,
        players: newPlayers,
        discardPile: [...prev.discardPile, card],
        pendingWildColorPlayerIndex: playerIndex,
        pendingONOPlayerId: pendingONOId,
        jumpInPlayerId: isJumpIn ? player.id : null,
        // We don't advance the turn yet
      }));
      triggerShake();
      playSound('play');
      
      if (isJumpIn) {
        setTimeout(() => setGameState(prev => ({ ...prev, jumpInPlayerId: null })), 2000);
      }
      return;
    }

    let nextDirection = gameState.direction;
    let skipNext = false;
    let newDrawStack = drawStack;

    if (card.value === 'reverse') {
      nextDirection = (gameState.direction * -1) as (1 | -1);
      if (gameState.players.length === 2) skipNext = true;
    } else if (card.value === 'skip') {
      skipNext = true;
    } else if (card.value === 'draw2') {
      newDrawStack += 2;
    } else if (card.value === 'draw4') {
      newDrawStack += 4;
    }

    // Handle winner
    if (newHand.length === 0) {
      setGameState(prev => ({
        ...prev,
        players: newPlayers,
        discardPile: [...prev.discardPile, card],
        status: 'ended',
        winner: player.name,
      }));
      
      if (player.isLocal) {
        playSound('win');
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 }
        });
      } else {
        playSound('lose');
      }
      return;
    }

    // Draw cards for next player if draw2/draw4 is NOT stacked
    let nextPlayerIndex = (playerIndex + nextDirection + gameState.players.length) % gameState.players.length;
    
    if (skipNext) {
      nextPlayerIndex = (nextPlayerIndex + nextDirection + gameState.players.length) % gameState.players.length;
    }

    setGameState(prev => ({
      ...prev,
      players: newPlayers,
      discardPile: [...prev.discardPile, card],
      currentPlayerIndex: nextPlayerIndex,
      direction: nextDirection,
      timeLeft: 30,
      drawStack: newDrawStack,
      currentWildColor: null, // Reset wild color when a non-wild card is played
      pendingONOPlayerId: pendingONOId,
      jumpInPlayerId: isJumpIn ? player.id : null,
    }));

    if (isJumpIn) {
      setTimeout(() => setGameState(prev => ({ ...prev, jumpInPlayerId: null })), 2000);
    }

    triggerShake();
    setShowRecommendations(false);
    setSelectedCardId(null);
    playSound('play');
  };

  const drawCard = (playerIndex: number) => {
    const newDeck = [...gameState.deck];
    const newDiscardPile = [...gameState.discardPile];
    const newPlayers = [...gameState.players];
    const player = newPlayers[playerIndex];
    
    const drawCount = gameState.drawStack > 0 ? gameState.drawStack : 1;
    const drawnCards: CardData[] = [];
    
    for (let i = 0; i < drawCount; i++) {
      if (newDeck.length === 0) {
        if (newDiscardPile.length <= 1) break; // Nothing to reshuffle
        const topCard = newDiscardPile[newDiscardPile.length - 1];
        const reshuffledDeck = shuffle(newDiscardPile.slice(0, -1).map(c => ({ ...c, chosenColor: undefined })));
        newDeck.push(...reshuffledDeck);
        newDiscardPile.length = 0;
        newDiscardPile.push(topCard);
        playSound('shuffle');
      }
      const card = newDeck.pop();
      if (card) drawnCards.push(card);
    }

    if (drawnCards.length === 0) return; // Should not happen

    newPlayers[playerIndex] = {
      ...player,
      hand: [...player.hand, ...drawnCards],
      hasShoutedONO: false,
    };

    setGameState(prev => ({
      ...prev,
      deck: newDeck,
      discardPile: newDiscardPile,
      players: newPlayers,
      currentPlayerIndex: (prev.currentPlayerIndex + prev.direction + prev.players.length) % prev.players.length,
      timeLeft: 30,
      drawStack: 0,
      currentWildColor: null, // Reset wild color when drawing
      pendingONOPlayerId: null,
    }));
    
    triggerShake();
    setShowRecommendations(false);
    setSelectedCardId(null);
    playSound('draw');
  };

  const chooseColor = (color: CardColor) => {
    const playerIndex = gameState.pendingWildColorPlayerIndex!;
    const newDiscardPile = [...gameState.discardPile];
    const topCardIndex = newDiscardPile.length - 1;
    
    // Persist the chosen color on the card itself
    newDiscardPile[topCardIndex] = {
      ...newDiscardPile[topCardIndex],
      chosenColor: color
    };
    
    const card = newDiscardPile[topCardIndex];
    
    let nextDirection = gameState.direction;
    let skipNext = false;
    let newDrawStack = gameState.drawStack;

    if (card.value === 'draw4') {
      newDrawStack += 4;
    }

    let nextPlayerIndex = (playerIndex + nextDirection + gameState.players.length) % gameState.players.length;
    
    if (skipNext) {
      nextPlayerIndex = (nextPlayerIndex + nextDirection + gameState.players.length) % gameState.players.length;
    }

    setGameState(prev => ({
      ...prev,
      discardPile: newDiscardPile,
      currentPlayerIndex: nextPlayerIndex,
      direction: nextDirection,
      timeLeft: 30,
      drawStack: newDrawStack,
      currentWildColor: color,
      pendingWildColorPlayerIndex: null,
    }));

    triggerShake();
    playSound('click');
  };

  const shoutONO = (playerId: string) => {
    setGameState(prev => {
      const playerIndex = prev.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1) return prev;
      
      const newPlayers = [...prev.players];
      newPlayers[playerIndex] = { ...newPlayers[playerIndex], hasShoutedONO: true };
      
      return {
        ...prev,
        players: newPlayers,
        pendingONOPlayerId: null,
      };
    });
    playSound('click');

    // Auto-clear the bubble after 2 seconds
    setTimeout(() => {
      setGameState(prev => {
        const playerIndex = prev.players.findIndex(p => p.id === playerId);
        if (playerIndex === -1) return prev;
        const newPlayers = [...prev.players];
        newPlayers[playerIndex] = { ...newPlayers[playerIndex], hasShoutedONO: false };
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
          if (prev.timeLeft === 6) {
            playSound('click'); // Warning sound
          }
          return { ...prev, timeLeft: prev.timeLeft - 1 };
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [gameState.status, gameState.currentPlayerIndex]);

  // Handle ONO Penalty
  useEffect(() => {
    if (gameState.status === 'playing' && gameState.pendingONOPlayerId) {
      const timer = setTimeout(() => {
        setGameState(prev => {
          if (!prev.pendingONOPlayerId) return prev;
          
          const playerIndex = prev.players.findIndex(p => p.id === prev.pendingONOPlayerId);
          if (playerIndex === -1) return prev;
          
          const player = prev.players[playerIndex];
          if (player.hasShoutedONO) return prev;

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
            hasShoutedONO: false,
          };

          return {
            ...prev,
            deck: newDeck,
            discardPile: newDiscardPile,
            players: newPlayers,
            pendingONOPlayerId: null,
          };
        });
        triggerShake();
        playSound('draw');
      }, 3000); // 3 seconds to shout ONO
      return () => clearTimeout(timer);
    }
  }, [gameState.pendingONOPlayerId, gameState.status]);

  // Handle Timeout
  useEffect(() => {
    if (gameState.status === 'playing' && gameState.timeLeft <= 0) {
      const currentPlayerIndex = gameState.currentPlayerIndex;
      const currentPlayer = gameState.players[currentPlayerIndex];
      const topCard = gameState.discardPile[gameState.discardPile.length - 1];
      const drawStack = gameState.drawStack;
      const currentWildColor = gameState.currentWildColor;
      const playableCard = currentPlayer.hand.find(c => canPlayCard(c, topCard, drawStack, currentWildColor));

      if (playableCard) {
        playCard(currentPlayerIndex, playableCard.id);
      } else {
        drawCard(currentPlayerIndex);
      }
    }
  }, [gameState.timeLeft, gameState.status]);

  // Simple AI logic
  useEffect(() => {
    if (gameState.status === 'playing') {
      const pendingONOPlayerId = gameState.pendingONOPlayerId;
      if (pendingONOPlayerId) {
        const player = gameState.players.find(p => p.id === pendingONOPlayerId);
        if (player && !player.isLocal) {
          const timer = setTimeout(() => {
            // AI has 80% chance to shout ONO
            if (Math.random() < 0.8) {
              shoutONO(pendingONOPlayerId);
            }
          }, 1000 + Math.random() * 1000);
          return () => clearTimeout(timer);
        }
      }

      const pendingPlayerIndex = gameState.pendingWildColorPlayerIndex;
      if (pendingPlayerIndex !== null) {
        const player = gameState.players[pendingPlayerIndex];
        if (!player.isLocal) {
          const timer = setTimeout(() => {
            // AI chooses the color it has the most of
            const colors: CardColor[] = ['red', 'blue', 'green', 'yellow'];
            const counts = colors.map(c => player.hand.filter(card => card.color === c).length);
            const maxIndex = counts.indexOf(Math.max(...counts));
            chooseColor(colors[maxIndex]);
          }, 1000);
          return () => clearTimeout(timer);
        }
        return;
      }

      const currentPlayer = gameState.players[gameState.currentPlayerIndex];
      if (!currentPlayer.isLocal) {
        const timer = setTimeout(() => {
          const topCard = gameState.discardPile[gameState.discardPile.length - 1];
          const drawStack = gameState.drawStack;
          const currentWildColor = gameState.currentWildColor;
          const playableCard = currentPlayer.hand.find(c => canPlayCard(c, topCard, drawStack, currentWildColor));
          
          if (playableCard) {
            playCard(gameState.currentPlayerIndex, playableCard.id);
          } else {
            drawCard(gameState.currentPlayerIndex);
          }
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [gameState.currentPlayerIndex, gameState.status, gameState.pendingWildColorPlayerIndex]);

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
    if (isLocalTurn && !isPendingColor && canPlayCard(card, topCard, drawStack, currentWildColor)) {
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
      const topCard = gameState.discardPile[gameState.discardPile.length - 1];
      const drawStack = gameState.drawStack;
      
      // Find AI players who can jump in
      const jumpInOpportunities: { playerIndex: number, cardId: string }[] = [];
      
      gameState.players.forEach((player, idx) => {
        // AI can jump in if it's not their turn and they have a matching card
        if (!player.isLocal && idx !== gameState.currentPlayerIndex) {
          player.hand.forEach(card => {
            if (canJumpIn(card, topCard, drawStack)) {
              jumpInOpportunities.push({ playerIndex: idx, cardId: card.id });
            }
          });
        }
      });

      if (jumpInOpportunities.length > 0) {
        // Random AI jumps in after a delay
        const opportunity = jumpInOpportunities[Math.floor(Math.random() * jumpInOpportunities.length)];
        const timer = setTimeout(() => {
          // Check again if still valid (top card might have changed)
          const currentTopCard = gameState.discardPile[gameState.discardPile.length - 1];
          const player = gameState.players[opportunity.playerIndex];
          const card = player.hand.find(c => c.id === opportunity.cardId);
          
          if (card && canJumpIn(card, currentTopCard, gameState.drawStack)) {
            playSound('jump');
            playCard(opportunity.playerIndex, opportunity.cardId);
          }
        }, 1500 + Math.random() * 2000); // 1.5s - 3.5s delay
        return () => clearTimeout(timer);
      }
    }
  }, [gameState.discardPile, gameState.status, gameState.pendingWildColorPlayerIndex]);

  const renderLobby = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white p-6">
      <motion.h1 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-8xl font-black italic tracking-tighter mb-12 text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-600"
      >
        ONO ROYALE
      </motion.h1>

      <div className="w-full max-w-md space-y-6 bg-zinc-900/50 p-8 rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl">
        {!gameState.roomCode ? (
          <>
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-widest text-zinc-500">玩家昵称</label>
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
                disabled={!playerName}
                className="flex items-center justify-center gap-2 bg-white text-black font-black py-4 rounded-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
              >
                <Plus size={20} /> 创建房间
              </button>
              <div className="relative">
                <button 
                  onClick={joinRoom}
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
              <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                <Users size={14} /> 玩家 ({gameState.players.length}/10)
              </p>
              <div className="grid grid-cols-1 gap-2">
                {gameState.players.map((p) => (
                  <motion.div 
                    initial={{ x: -20, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    key={p.id} 
                    className="flex items-center justify-between bg-zinc-800/50 p-3 rounded-xl border border-white/5"
                  >
                    <span className="font-bold">{p.name} {p.isLocal && <span className="text-xs text-zinc-500">(你)</span>}</span>
                    {p.isLocal && <span className="text-[10px] bg-white text-black px-2 py-0.5 rounded-full font-black">房主</span>}
                  </motion.div>
                ))}
              </div>
            </div>

            <button 
              onClick={startGame}
              className="w-full flex items-center justify-center gap-2 bg-emerald-500 text-white font-black py-4 rounded-xl hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(16,185,129,0.3)]"
            >
              <Play size={20} fill="currentColor" /> 开始游戏
            </button>
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

    return (
      <motion.div 
        animate={shake ? { x: [-10, 10, -10, 10, 0], y: [-5, 5, -5, 5, 0] } : {}}
        className="relative min-h-screen bg-zinc-950 text-white overflow-hidden flex flex-col"
      >
        {/* Color Picker Overlay */}
        <AnimatePresence>
          {isLocalPendingColor && (
            <motion.div 
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="fixed bottom-64 left-1/2 -translate-x-1/2 z-[500] bg-zinc-900/90 border border-white/20 backdrop-blur-xl p-8 rounded-[40px] shadow-[0_40px_80px_rgba(0,0,0,0.8)] flex flex-col items-center gap-6"
            >
              <h2 className="text-xl font-black italic tracking-tighter text-center uppercase">选择下个颜色</h2>
              <div className="flex gap-4">
                {(['red', 'blue', 'green', 'yellow'] as CardColor[]).map(color => (
                  <motion.button
                    key={color}
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => chooseColor(color)}
                    className={cn(
                      "w-20 h-20 rounded-2xl border-4 flex items-center justify-center shadow-xl transition-all",
                      color === 'red' ? "bg-red-500 border-red-400" :
                      color === 'blue' ? "bg-blue-500 border-blue-400" :
                      color === 'green' ? "bg-green-500 border-green-400" :
                      "bg-yellow-400 border-yellow-300 text-black"
                    )}
                  >
                    <div className="w-4 h-4 rounded-full bg-white/30" />
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Background Effects */}
        <div className="absolute inset-0 opacity-20 pointer-events-none">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-500/20 rounded-full blur-[120px]" />
          <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-10" />
        </div>

        {/* Header / Stats */}
        <div className="relative z-10 p-6 flex flex-col gap-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="bg-zinc-900 border border-white/10 px-4 py-2 rounded-2xl flex items-center gap-3">
                <Users size={18} className="text-zinc-500" />
                <div className="flex -space-x-2">
                  {gameState.players.map((p, i) => (
                    <div 
                      key={p.id}
                      className={cn(
                        "w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] font-black transition-all",
                        gameState.currentPlayerIndex === i ? "border-emerald-500 bg-emerald-500 scale-125 z-10" : "border-zinc-800 bg-zinc-900 text-zinc-500"
                      )}
                    >
                      {p.name[0]}
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-zinc-900 border border-white/10 px-4 py-2 rounded-2xl flex items-center gap-2">
                {gameState.direction === 1 ? <ArrowRight size={18} /> : <ArrowLeft size={18} />}
                <span className="text-xs font-black uppercase tracking-widest text-zinc-500">方向</span>
              </div>
            </div>

            <div className="text-center">
              <h1 className="text-2xl font-black italic tracking-tighter opacity-50">ONO ROYALE</h1>
            </div>

            <div className="flex items-center gap-4">
              <button 
                onClick={() => setIsMuted(!isMuted)}
                className="p-2 rounded-xl bg-zinc-900 border border-white/10 text-zinc-500 hover:text-white transition-colors"
              >
                {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <div className="bg-zinc-900 border border-white/10 px-4 py-2 rounded-2xl">
                <span className="text-xs font-black uppercase tracking-widest text-zinc-500">房间: </span>
                <span className="font-mono font-bold">{gameState.roomCode}</span>
              </div>
            </div>
          </div>

          {/* Turn Timer Progress Bar */}
          <div className="flex items-center gap-4 w-full max-w-2xl mx-auto">
            <div className="flex-1 h-2 bg-zinc-900 rounded-full overflow-hidden border border-white/5">
              <motion.div 
                initial={{ width: "100%" }}
                animate={{ width: `${(gameState.timeLeft / 30) * 100}%` }}
                transition={{ duration: 1, ease: "linear" }}
                className={cn(
                  "h-full transition-colors duration-500",
                  gameState.timeLeft > 15 ? "bg-emerald-500" : 
                  gameState.timeLeft > 5 ? "bg-yellow-500" : "bg-red-500"
                )}
              />
            </div>
            <div className={cn(
              "font-mono font-black text-2xl w-12 text-center",
              gameState.timeLeft > 15 ? "text-emerald-500" : 
              gameState.timeLeft > 5 ? "text-yellow-500" : "text-red-500"
            )}>
              {gameState.timeLeft}
            </div>
          </div>
        </div>

        {/* Main Board */}
        <div className="flex-1 relative flex items-center justify-center pb-16">
          {/* AI Players Hands (Simplified) */}
          <div className="absolute inset-0 pointer-events-none">
            {gameState.players.map((p, i) => {
              if (p.isLocal) return null;
              // Position AI players around the board, starting from the bottom (local player position)
              const angle = (i / gameState.players.length) * Math.PI * 2 + Math.PI / 2;
              return (
                <div 
                  key={p.id}
                  className="absolute transition-all duration-500"
                  style={{
                    left: `${50 + Math.cos(angle) * 42}%`,
                    top: `${45 + Math.sin(angle) * 38}%`,
                    transform: 'translate(-50%, -50%)'
                  }}
                >
                  <div className={cn(
                    "flex flex-col items-center gap-2 p-4 rounded-3xl transition-all",
                    gameState.currentPlayerIndex === i ? "bg-emerald-500/10 scale-110" : "opacity-60"
                  )}>
                    <div className="relative">
                      <AnimatePresence>
                        {p.hasShoutedONO && (
                          <ComicBubble text="ONO !!!" />
                        )}
                        {gameState.jumpInPlayerId === p.id && (
                          <ComicBubble text="JUMP IN!" color="yellow" />
                        )}
                      </AnimatePresence>
                      <div className="w-12 h-16 bg-zinc-800 rounded-lg border-2 border-zinc-700 flex items-center justify-center shadow-xl">
                        <span className="text-xs font-black">{p.hand.length}</span>
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
            <motion.div 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => isLocalTurn && drawCard(gameState.currentPlayerIndex)}
              className="relative cursor-pointer group"
            >
              <div className="absolute -inset-4 bg-white/5 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity" />
              <Card card={{} as any} isFaceDown className="shadow-[0_20px_50px_rgba(0,0,0,0.5)]" />
              <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-[10px] font-black text-zinc-500 uppercase tracking-widest whitespace-nowrap">
                {gameState.drawStack > 0 ? `摸 ${gameState.drawStack} 张` : `${gameState.deck.length} 张剩余`}
              </div>
            </motion.div>

            {/* Discard Pile */}
            <div className="relative flex items-center justify-center">
              <AnimatePresence mode="popLayout">
                {gameState.discardPile.slice(-3).map((card, idx, arr) => {
                  const isTop = idx === arr.length - 1;
                  const offset = idx - (arr.length - 1); // 0 for top, -1, -2 for others
                  return (
                    <motion.div
                      key={card.id}
                      initial={isTop ? { scale: 1.5, rotate: 45, opacity: 0, y: -100 } : false}
                      animate={{ 
                        scale: 1, 
                        rotate: offset * 10 + (isTop ? (Math.random() - 0.5) * 5 : 0), 
                        opacity: 1, 
                        y: 0,
                        x: offset * 40,
                        zIndex: idx
                      }}
                      transition={{ type: "spring", damping: 15, stiffness: 200 }}
                      className="absolute"
                    >
                      <Card 
                        card={card} 
                        disabled 
                        className={cn(
                          "shadow-[0_20px_50px_rgba(0,0,0,0.5)]",
                          !isTop && "brightness-50 scale-95"
                        )} 
                      />
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Local Player Hand */}
        <div className="relative z-30 flex flex-col items-center justify-end pb-48 pointer-events-none">
          {/* JUMP IN! Bubble for Local Player */}
          <AnimatePresence>
            {gameState.jumpInPlayerId === localPlayer.id && (
              <ComicBubble text="JUMP IN!" className="-top-32" color="yellow" />
            )}
          </AnimatePresence>

          {/* ONO Speech Bubble for Local Player */}
          <AnimatePresence>
            {localPlayer.hasShoutedONO && (
              <ComicBubble text="ONO !!!" className="-top-32" />
            )}
          </AnimatePresence>

          {/* ONO Button */}
          <AnimatePresence>
            {gameState.pendingONOPlayerId === 'local-player' && (
              <motion.div
                initial={{ scale: 0, y: 50 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0, y: 50 }}
                className="absolute -top-40 z-[300] pointer-events-auto"
              >
                <motion.button
                  whileHover={{ scale: 1.1, rotate: 5 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => shoutONO('local-player')}
                  className="relative group"
                >
                  <div className="absolute -inset-4 bg-orange-500 rounded-full blur-2xl opacity-50 animate-pulse" />
                  <div className="relative bg-orange-500 border-4 border-white px-12 py-6 rounded-[40px] shadow-[0_20px_0_rgb(194,65,12)] transform -rotate-3">
                    <span className="text-4xl font-black italic text-white tracking-tighter drop-shadow-md">喊 ONO !!!</span>
                  </div>
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-center gap-4 mb-20 z-[200] pointer-events-auto">
            {/* Turn Indicator */}
            <div className={cn(
              "px-6 py-2 rounded-full border transition-all flex items-center gap-3",
              isLocalTurn ? "bg-emerald-500 border-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.4)]" : "bg-zinc-900 border-white/10"
            )}>
              <div className={cn("w-2 h-2 rounded-full", isLocalTurn ? "bg-white animate-ping" : "bg-zinc-700")} />
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
              {isLocalTurn ? (
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
                    !localPlayer.hand.some(c => canPlayCard(c, topCard, gameState.drawStack, gameState.currentWildColor)) && (
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
                selectedCardId && (
                  <motion.button
                    key="jump-btn"
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.8, opacity: 0 }}
                    onClick={() => {
                      const localPlayerIndex = gameState.players.findIndex(p => p.isLocal);
                      playSound('jump');
                      playCard(localPlayerIndex, selectedCardId);
                    }}
                    className="px-8 py-2 bg-yellow-500 text-black text-xs font-black uppercase tracking-widest rounded-full shadow-[0_0_40px_rgba(234,179,8,0.3)] hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                  >
                    <RefreshCw size={14} className="rotate-45" /> 抢牌！
                  </motion.button>
                )
              )}
            </AnimatePresence>
          </div>

          <div 
            onMouseEnter={() => setIsHandHovered(true)}
            onMouseLeave={() => setIsHandHovered(false)}
            className="relative flex items-center justify-center w-full h-48 pointer-events-auto"
          >
            {localPlayer.hand.map((card, i) => {
              const total = localPlayer.hand.length;
              const mid = (total - 1) / 2;
              const offset = i - mid;
              
              // Dynamic scaling based on hand size
              const maxRotation = isHandHovered ? 60 : 20;
              const rotationStep = Math.min(maxRotation / Math.max(total, 1), isHandHovered ? 12 : 4);
              const rotate = offset * rotationStep;
              
              const maxWidth = isHandHovered ? 800 : 400;
              const xStep = Math.min(maxWidth / Math.max(total, 1), isHandHovered ? 80 : 30);
              const xOffset = offset * xStep;
              
              const yFactor = isHandHovered ? 15 : 5;
              const yOffset = Math.pow(Math.abs(offset), 1.5) * (yFactor / Math.max(total * 0.1, 1));

              return (
                <motion.div
                  key={card.id}
                  initial={{ y: 100, opacity: 0 }}
                  animate={{ 
                    y: yOffset,
                    x: xOffset,
                    rotate,
                    opacity: 1,
                    zIndex: isHandHovered ? 100 + i : i
                  }}
                  transition={{ 
                    type: "spring", 
                    stiffness: 400, 
                    damping: 30,
                    delay: gameState.status === 'playing' && gameState.deck.length === 0 ? 0 : i * 0.02 
                  }}
                  className="absolute"
                >
                  <Card 
                    card={card} 
                    disabled={(!isLocalTurn || isPendingColor || !canPlayCard(card, topCard, gameState.drawStack, gameState.currentWildColor)) && !canJumpIn(card, topCard, gameState.drawStack)}
                    isHighlighted={showRecommendations && isLocalTurn && !isPendingColor && canPlayCard(card, topCard, gameState.drawStack, gameState.currentWildColor)}
                    isSelected={selectedCardId === card.id}
                    onClick={() => handleCardClick(card)}
                  />
                </motion.div>
              );
            })}
          </div>
        </div>
      </motion.div>
    );
  };

  const renderEnd = () => (
    <div className="flex flex-col items-center justify-center min-h-screen bg-zinc-950 text-white p-6">
      <motion.div 
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-center space-y-8"
      >
        <Trophy size={120} className="mx-auto text-yellow-400 drop-shadow-[0_0_50px_rgba(250,204,21,0.4)]" />
        <div>
          <h2 className="text-2xl font-black uppercase tracking-widest text-zinc-500 mb-2">获胜者</h2>
          <h1 className="text-7xl font-black italic tracking-tighter">{gameState.winner}</h1>
        </div>
        
        <button 
          onClick={startGame}
          className="flex items-center justify-center gap-3 bg-white text-black font-black px-12 py-5 rounded-2xl hover:scale-105 active:scale-95 transition-all shadow-2xl"
        >
          <RefreshCw size={24} /> 再次挑战
        </button>

        <button 
          onClick={() => setGameState(prev => ({ ...prev, status: 'lobby', roomCode: '' }))}
          className="block mx-auto text-zinc-500 font-bold hover:text-white transition-colors"
        >
          返回主菜单
        </button>
      </motion.div>
    </div>
  );

  return (
    <div className="font-sans selection:bg-emerald-500 selection:text-white">
      {gameState.status === 'lobby' && renderLobby()}
      {gameState.status === 'playing' && renderGame()}
      {gameState.status === 'ended' && renderEnd()}
    </div>
  );
}
