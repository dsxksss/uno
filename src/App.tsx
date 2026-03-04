import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Card } from './components/Card';
import { CardData, GameState, cn, CardColor, Difficulty } from './types';
import { createDeck, canPlayCard, canJumpIn, isNumberCard } from './utils';
import { Users, Plus, Play, Trophy, RefreshCw, ArrowRight, ArrowLeft, Volume2, VolumeX, Zap, LogOut, ChevronLeft, Copy, Check, Globe, Smartphone, RotateCw, Maximize, Minimize } from 'lucide-react';
import { Howl } from 'howler';

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
    spectators: [],
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
  const [aiCount, setAiCount] = useState(0);
  const [aiDifficulty, setAiDifficulty] = useState<Difficulty>('medium');
  const [devClicks, setDevClicks] = useState(0);
  const [seeAllHands, setSeeAllHands] = useState(false);
  const [hoveredGodModePlayerId, setHoveredGodModePlayerId] = useState<string | null>(null);
  const [activeRooms, setActiveRooms] = useState<{ code: string, playerCount: number }[]>([]);
  const [copied, setCopied] = useState(false);
  const lastPlayedCardIdRef = useRef<string | null>(null);
  const countdownTimerRef = useRef<NodeJS.Timeout | null>(null);
  const prevTimeLeftRef = useRef<number>(30);
  const playedEndSoundRef = useRef(false);
  const socketRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string | null>(null);
  const [ripples, setRipples] = useState<{ id: string, color: string, x: number, y: number, scale: number, thickness: number }[]>([]);
  const [actionBubble] = useState<{ text: string, color: string } | null>(null);
  const [actionFlash, setActionFlash] = useState<{ color: string, type: string, text: string } | null>(null);
  const [viewingPlayerId, setViewingPlayerId] = useState<string | null>(null);
  const isPendingColor = gameState.pendingWildColorPlayerIndex !== null;
  const lastNumberValue = [...(gameState.discardPile || [])].reverse().find(isNumberCard)?.value || null;
  const isSpectator = gameState.spectators.some(s => s.isLocal);
  const me = [...(gameState.players || []), ...(gameState.spectators || [])].find(p => p.isLocal);

  const [isPortrait, setIsPortrait] = useState(false);
  const [isScalingMode, setIsScalingMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showFullscreenPrompt, setShowFullscreenPrompt] = useState(false);

  const toggleFullscreen = useCallback(() => {
    const doc = document as any;
    const docEl = document.documentElement as any;

    const isFull = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement;

    if (!isFull) {
      const requestFullscreen = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
      if (requestFullscreen) {
        requestFullscreen.call(docEl).catch((err: any) => {
          console.warn(`Error attempting to enable fullscreen: ${err.message}`);
        });
      } else {
        // Fallback for iOS iPhone where Fullscreen API for elements isn't supported
        // Suggesting "Add to Home Screen" is often the only real way there
        alert("此浏览器不支持全屏 API。在 iPhone 上，请使用 Safari 的 '添加到主屏幕' 功能以获得全屏体验。");
      }
    } else {
      const exitFullscreen = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
      if (exitFullscreen) {
        exitFullscreen.call(doc);
      }
    }
  }, []);

  useEffect(() => {
    const handleResize = () => {
      // Use document element dimensions for more stable scaling on mobile
      const width = document.documentElement.clientWidth;
      const height = document.documentElement.clientHeight;
      const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsPortrait(height > width && isTouch);

      // Use scaling mode for small screens or mobile devices to keep UI consistent
      // For desktops (even with touch), use responsive fluid layout if width is large enough
      const scaling = (isTouch && width < 1200) || width < 1024;
      setIsScalingMode(scaling);

      if (scaling) {
        const baseWidth = 1440;
        const baseHeight = 850;
        const scale = Math.min(width / baseWidth, height / baseHeight);
        document.documentElement.style.setProperty('--ui-scale', scale.toString());
        document.documentElement.style.setProperty('--canvas-width', '1440px');
        document.documentElement.style.setProperty('--canvas-height', '850px');
      } else {
        // Desktop / Large screen: fill screen, no scaling, use responsive layout
        document.documentElement.style.setProperty('--ui-scale', '1');
        document.documentElement.style.setProperty('--canvas-width', '100vw');
        document.documentElement.style.setProperty('--canvas-height', '100vh');
      }

      const doc = document as any;
      setIsFullscreen(!!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement));
    };

    const handleFullscreenChange = () => {
      const doc = document as any;
      const isFull = !!(doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement);
      setIsFullscreen(isFull);
      // Auto hide prompt if they entered fullscreen
      if (isFull) {
        setShowFullscreenPrompt(false);
      }
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);

    // Initial check for mobile to show prompt
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    if (isTouch && !document.fullscreenElement && !(document as any).webkitFullscreenElement) {
      // Delay prompt slightly to ensure layout is settled
      setTimeout(() => setShowFullscreenPrompt(true), 1500);
    }
    handleResize();
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);
    socketRef.current = socket;

    socket.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'INIT') {
        const id = msg.payload.id;
        clientIdRef.current = id;

        // Connection established, request room list
        socket.send(JSON.stringify({ type: 'GET_ROOM_LIST' }));
      } else if (msg.type === 'UPDATE_STATE') {
        // ... existing state update logic ... (handled by replace_file_content)
        const newState = msg.payload.state;

        // Mark which player is local based on clientIdRef
        if (clientIdRef.current) {
          newState.players = newState.players.map((p: any) => ({
            ...p,
            isLocal: p.id === clientIdRef.current
          }));
          newState.spectators = (newState.spectators || []).map((p: any) => ({
            ...p,
            isLocal: p.id === clientIdRef.current
          }));

          setViewingPlayerId(v => v || clientIdRef.current);

          // If host, sync AI count
          if (newState.players?.[0]?.id === clientIdRef.current) {
            const botsCount = newState.players.filter((p: any) => p.id.startsWith('ai-')).length;
            setAiCount(botsCount);
          }
        }

        setGameState(newState);
      } else if (msg.type === 'ROOM_LIST') {
        setActiveRooms(msg.payload.rooms);
      } else if (msg.type === 'ERROR') {
        alert(msg.payload.message);
      }
    };

    socket.onopen = () => {
      console.log('Connected to UNO server');
    };

    return () => socket.close();
  }, []);

  const playSound = useCallback((soundName: string) => {
    if (!isMuted && sounds[soundName as keyof typeof sounds]) {
      sounds[soundName as keyof typeof sounds].play();
    } else if (!sounds[soundName as keyof typeof sounds]) {
      console.warn(`Sound "${soundName}" not found in library.`);
    }
  }, [isMuted]);

  // Trigger screen shake
  const triggerShake = useCallback((intensity: number = 1) => {
    setShake(true);
    // Adjust shake intensity based on card power
    setTimeout(() => setShake(false), 200 + (intensity * 100));
  }, []);

  const triggerRipple = useCallback((color: string, value: string) => {
    const id = Math.random().toString(36).substr(2, 9);

    // Determine power levels
    const isSpecial = ['draw2', 'draw4', 'skip', 'reverse', 'wild'].includes(value);
    const isUltra = ['draw4', 'wild'].includes(value);
    const isDraw2 = value === 'draw2';

    let rippleScale = 3.5;
    let rippleThickness = 4;
    let shakeIntensity = 0.5;

    if (isUltra) {
      rippleScale = 8;
      rippleThickness = 12;
      shakeIntensity = 2.5;
    } else if (isDraw2) {
      rippleScale = 5.5;
      rippleThickness = 8;
      shakeIntensity = 1.8;
    } else if (isSpecial) {
      rippleScale = 4.5;
      rippleThickness = 6;
      shakeIntensity = 1.2;
    }

    setRipples(prev => [...prev, { id, color, x: 50, y: 45, scale: rippleScale, thickness: rippleThickness }]);
    triggerShake(shakeIntensity);

    setTimeout(() => {
      setRipples(prev => prev.filter(r => r.id !== id));
    }, 2500);

    if (isSpecial) {
      const texts: Record<string, string> = {
        'draw2': 'PUNISH +2!',
        'draw4': 'ULTIMATE +4!!',
        'skip': 'STOP!',
        'reverse': 'REVERSE!',
        'wild': 'COLOR SHIFT'
      };

      // Suppress text if a specialized overlay is about to show
      const hasSpecialOverlay = value === 'reverse' || !!gameState.jumpInPlayerId;

      setActionFlash({
        color: color === 'yellow' ? '#facc15' : color === 'red' ? '#ef4444' : color === 'blue' ? '#3b82f6' : color === 'green' ? '#10b981' : '#a855f7',
        type: value,
        text: hasSpecialOverlay ? '' : (texts[value] || 'ACTION!')
      });
      setTimeout(() => setActionFlash(null), 800);
    }

    if (isUltra) {
      // Additional effects for +4 could go here
    }
  }, [triggerShake, gameState.jumpInPlayerId]);

  const createRoom = () => {
    if (!playerName || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({
      type: 'CREATE_ROOM',
      payload: { playerName }
    }));
    playSound('click');
  };

  const kickPlayer = (id: string) => {
    setGameState(prev => {
      const newPlayers = prev.players.filter(p => p.id !== id);
      // Adjust aiCount if it was a bot
      if (id.startsWith('ai-')) {
        setAiCount(newPlayers.filter(p => p.id.startsWith('ai-')).length);
      }
      return { ...prev, players: newPlayers };
    });
    playSound('click');
  };

  const forceWin = () => {
    const winnerName = gameState.players[gameState.currentPlayerIndex]?.name || '未知';
    setGameState(prev => ({
      ...prev,
      status: 'ended',
      winner: winnerName
    }));
  };

  const joinRoom = () => {
    if (!playerName || !inputRoomCode || !socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({
      type: 'JOIN_ROOM',
      payload: { playerName, roomCode: inputRoomCode }
    }));
    playSound('click');
  };

  const leaveLobby = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'LEAVE_ROOM' }));
    }
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
    setAiCount(0);
    playSound('click');
  };

  const leaveGame = () => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'LEAVE_ROOM' }));
    }
    playSound('click');
    setActiveRooms([]); // Clear stale room data
    setGameState(prev => {
      return {
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
      };
    });
    setSeeAllHands(false);
    setDevClicks(0);
    setAiCount(0);
  };

  const startGame = () => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) return;
    socketRef.current.send(JSON.stringify({ type: 'START_GAME' }));
    playSound('click');
  };

  const playCard = (cardId: string) => {
    if (!socketRef.current) return;
    socketRef.current.send(JSON.stringify({
      type: 'PLAY_CARD',
      payload: { cardId }
    }));
  };

  const drawCard = () => {
    if (!socketRef.current) return;
    socketRef.current.send(JSON.stringify({ type: 'DRAW_CARD' }));
  };

  const chooseColor = (color: CardColor) => {
    if (!socketRef.current) return;
    socketRef.current.send(JSON.stringify({
      type: 'CHOOSE_COLOR',
      payload: { color }
    }));
    playSound('color');
  };

  const shoutUNO = () => {
    if (!socketRef.current) return;
    socketRef.current.send(JSON.stringify({ type: 'SHOUT_UNO' }));
  };

  // Countdown sound control
  useEffect(() => {
    if (gameState.status !== 'playing') {
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
      sounds.countdown.stop();
      return;
    }

    const isLocalTurn = gameState.players[gameState.currentPlayerIndex]?.isLocal;

    // Stop sound if turn changed, time reset, or game ended
    if (!isLocalTurn || gameState.timeLeft > 4 || gameState.timeLeft <= 0) {
      if (countdownTimerRef.current) clearTimeout(countdownTimerRef.current);
      sounds.countdown.stop();
    }

    // Play sound 0.5s earlier: when 4 switches to 3, OR if it's 3 and we missed the switch
    // Actually, trigger at 4 with a 500ms delay to hit 3.5s
    if (isLocalTurn && !isMuted && !sounds.countdown.playing()) {
      if (gameState.timeLeft === 4 && prevTimeLeftRef.current > 4) {
        countdownTimerRef.current = setTimeout(() => {
          if (gameState.timeLeft <= 4 && !isMuted) sounds.countdown.play();
        }, 500);
      } else if (gameState.timeLeft === 3 && prevTimeLeftRef.current > 3 && !countdownTimerRef.current) {
        // Fallback for network lag
        sounds.countdown.play();
      }
    }

    prevTimeLeftRef.current = gameState.timeLeft;
  }, [gameState.timeLeft, gameState.currentPlayerIndex, gameState.status, isMuted]);

  useEffect(() => {
    if (gameState.status !== 'playing') return;
    const isLocalTurn = gameState.players[gameState.currentPlayerIndex]?.isLocal;
    if (isLocalTurn) {
      playSound('turn');
    }
  }, [gameState.currentPlayerIndex]);

  // Game End Sound Notification
  useEffect(() => {
    if (gameState.status === 'ended' && gameState.winner && !playedEndSoundRef.current) {
      if (me?.name === gameState.winner) {
        playSound('win');
      } else {
        playSound('lose');
      }
      playedEndSoundRef.current = true;
    } else if (gameState.status !== 'ended') {
      playedEndSoundRef.current = false;
    }
  }, [gameState.status, gameState.winner, me?.name]);

  useEffect(() => {
    if (gameState.status !== 'playing' || gameState.discardPile.length <= 1) return;

    const topCard = gameState.discardPile[gameState.discardPile.length - 1];

    // Only play sound if this is a NEW card we haven't handled yet
    if (topCard.id !== lastPlayedCardIdRef.current) {
      lastPlayedCardIdRef.current = topCard.id;

      const isAction = !isNumberCard(topCard);
      playSound(isAction ? 'item' : (Math.random() > 0.5 ? 'play1' : 'play2'));
      if (topCard.value === 'skip') playSound('skip');

      triggerRipple(topCard.color, topCard.value);
      // Auto-clear selection when top card changes
      setSelectedCardId(null);
    }
  }, [gameState.discardPile, gameState.status, triggerRipple]); // Watch full discardPile change for IDs

  // Monitor draw actions for sound
  const prevTotalHandSize = useRef(0);
  useEffect(() => {
    const currentTotal = (gameState.players || []).reduce((sum, p) => sum + (p.hand?.length || 0), 0);
    if (currentTotal > prevTotalHandSize.current && gameState.status === 'playing') {
      playSound('draw');
    }
    prevTotalHandSize.current = currentTotal;
  }, [gameState.players, gameState.status]);

  // Watch for ANY player shouting UNO
  const prevUnoDB = useRef<Record<string, boolean>>({});
  useEffect(() => {
    if (gameState.status !== 'playing') return;

    gameState.players.forEach(p => {
      const wasShouting = prevUnoDB.current[p.id] || false;
      const isShouting = p.hasShoutedUNO;

      // If we detect a transition from not shouting to shouting, play sound
      if (!wasShouting && isShouting) {
        playSound('uno');
      }

      prevUnoDB.current[p.id] = isShouting;
    });
  }, [gameState.players, gameState.status]);

  // Turn Notification
  useEffect(() => {
    if (gameState.status === 'playing') {
      playSound('turn');
      const isLocalTurn = gameState.players[gameState.currentPlayerIndex]?.isLocal;
      if (!isLocalTurn) {
        setSelectedCardId(null);
      }
    }
  }, [gameState.currentPlayerIndex, gameState.status]);

  // Refresh room list when entering lobby/room hall
  useEffect(() => {
    if (gameState.status === 'lobby' && !gameState.roomCode && socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'GET_ROOM_LIST' }));
    }
  }, [gameState.status, gameState.roomCode]);

  const handleCardClick = (card: CardData) => {
    // Block interactions during overlay animations
    if (gameState.isReverseActive || gameState.jumpInPlayerId) return;
    playSound('click');
    const localPlayerIndex = gameState.players.findIndex(p => p.isLocal);
    const isLocalTurn = gameState.currentPlayerIndex === localPlayerIndex;
    const topCard = gameState.discardPile[gameState.discardPile.length - 1];
    const drawStack = gameState.drawStack;
    const currentWildColor = gameState.currentWildColor;

    // Immediate Jump-in
    if (!isLocalTurn && !isPendingColor && canJumpIn(card, topCard, drawStack)) {
      playSound('jump');
      playCard(card.id);
      return;
    }

    // Normal play selection
    if (isLocalTurn && !isPendingColor && canPlayCard(card, topCard, drawStack, currentWildColor, lastNumberValue)) {
      // Rule: Cannot win with an action card
      if (me?.hand.length === 1 && !isNumberCard(card)) {
        return;
      }

      if (selectedCardId === card.id) {
        setSelectedCardId(null);
      } else {
        setSelectedCardId(card.id);
      }
    }
  };

  const renderLobby = () => {
    const isHost = gameState.players.length > 0 && gameState.players[0].isLocal;
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-none overflow-hidden">
        <div
          className="relative w-[1440px] h-[850px] pointer-events-auto flex flex-col items-center justify-center shrink-0"
          style={{ transform: `scale(var(--ui-scale))` }}
        >
          <div className={cn(
            "pointer-events-auto flex items-center justify-center w-full h-full p-8 transition-all duration-500",
            isPortrait ? "flex-col gap-8" : "flex-row gap-24 lg:gap-48"
          )}>
            <motion.div
              initial={isPortrait ? { y: -50, opacity: 0 } : { x: -80, opacity: 0 }}
              animate={isPortrait ? { y: 0, opacity: 1 } : { x: 0, opacity: 1 }}
              className={cn(
                "relative group cursor-default select-none transition-all duration-500 lg:mr-12",
                isPortrait ? "scale-100 mb-4" : (isScalingMode ? "scale-100" : "scale-150")
              )}
            >
              <div className="relative">
                {/* Main Comic Bubble Wrapper */}
                <motion.div
                  animate={{ rotate: [-2, 1, -2] }}
                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                  className="relative"
                >
                  <svg
                    width="300"
                    height="200"
                    viewBox="0 0 140 100"
                    className="fill-white stroke-black stroke-[4px] drop-shadow-[0_30px_60px_rgba(0,0,0,0.5)] transition-all"
                  >
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

            <div
              className="w-full max-w-lg bg-zinc-900/50 p-5 rounded-3xl border border-white/10 backdrop-blur-xl shadow-2xl transition-all flex flex-col"
            >
              {!gameState.roomCode ? (
                <div className="flex flex-col items-center justify-center py-4">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="w-full space-y-6"
                  >
                    {/* 昵称输入区 - 移入主面板 */}
                    <div className={cn(
                      "p-5 rounded-3xl border transition-all",
                      !playerName ? "bg-amber-500/5 border-amber-500/20" : "bg-zinc-800/30 border-white/5"
                    )}>
                      <div className="flex items-center justify-between mb-2">
                        <label className={cn(
                          "text-xs font-black uppercase tracking-widest",
                          !playerName ? "text-amber-500" : "text-zinc-400"
                        )}>
                          {!playerName ? "⚠️ 请先设置昵称" : "第一步：输入昵称"}
                        </label>
                      </div>
                      <input
                        type="text"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value)}
                        placeholder="输入你的名字..."
                        className="w-full bg-zinc-900 border-2 border-zinc-700/50 rounded-xl px-4 py-3 focus:border-emerald-500/50 outline-none transition-all font-bold text-sm"
                      />
                    </div>

                    {/* 房间列表区 */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest flex items-center gap-2">
                          <Globe size={12} className="text-emerald-500" /> 在线房间列表
                        </span>
                        <button
                          onClick={() => socketRef.current?.send(JSON.stringify({ type: 'GET_ROOM_LIST' }))}
                          className="text-[10px] text-zinc-500 hover:text-white transition-all flex items-center gap-1"
                        >
                          <RefreshCw size={10} /> 刷新
                        </button>
                      </div>

                      <div className="space-y-3 max-h-[360px] lg:max-h-[480px] overflow-y-auto pr-2 custom-scrollbar">
                        {activeRooms.length === 0 ? (
                          <div className="text-center py-10 bg-zinc-900/30 rounded-2xl border border-dashed border-white/5 text-zinc-500 text-xs italic">
                            目前没有任何可加入的房间...
                          </div>
                        ) : (
                          activeRooms.map((room: any) => (
                            <div
                              key={room.code}
                              className={cn(
                                "w-full flex items-center justify-between p-4 border rounded-2xl transition-all hover:border-emerald-500/30 group",
                                room.status === 'playing' ? "bg-amber-500/5 border-amber-500/10" : "bg-zinc-800/50 border-white/5"
                              )}
                            >
                              <div className="flex flex-col items-start gap-1">
                                <div className="flex items-center gap-3">
                                  <span className="text-xl font-black font-mono tracking-widest uppercase text-white">{room.code}</span>
                                  <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-zinc-400">房主: {room.hostName || '未知'}</span>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className="text-[10px] font-bold text-emerald-500/80 flex items-center gap-1">
                                        <Users size={10} /> {room.playerCount}/10
                                      </span>
                                      {room.status === 'playing' ? (
                                        <span className="text-[8px] bg-amber-500/20 text-amber-500 px-1.5 py-0.5 rounded-md font-black uppercase tracking-tighter border border-amber-500/20">游戏中</span>
                                      ) : (
                                        <span className="text-[8px] bg-emerald-500/20 text-emerald-500 px-1.5 py-0.5 rounded-md font-black uppercase tracking-tighter border border-emerald-500/20">等待中</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <button
                                onClick={() => {
                                  if (!playerName) return;
                                  socketRef.current?.send(JSON.stringify({
                                    type: 'JOIN_ROOM',
                                    payload: { playerName, roomCode: room.code }
                                  }));
                                  playSound('click');
                                }}
                                className={cn(
                                  "px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                                  playerName
                                    ? (room.status === 'playing' || room.playerCount >= 10 ? "bg-amber-500 text-black hover:bg-amber-400" : "bg-emerald-500 text-white hover:bg-emerald-400")
                                    : "bg-zinc-800 text-zinc-600 grayscale cursor-not-allowed border border-white/5"
                                )}
                              >
                                {playerName ? (room.status === 'playing' || room.playerCount >= 10 ? '观战' : '加入') : '设置昵称'}
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* 快速加入/创建操作 */}
                    <div className="pt-4 border-t border-white/5 flex flex-col gap-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={inputRoomCode}
                          onChange={(e) => setInputRoomCode(e.target.value.toUpperCase())}
                          placeholder="自定义房间代码..."
                          className="flex-1 bg-zinc-900 border-2 border-zinc-700/50 rounded-xl px-4 py-3 font-mono tracking-widest focus:border-emerald-500/50 outline-none transition-all text-sm"
                        />
                        <button
                          onClick={() => {
                            if (!playerName || !inputRoomCode) return;
                            joinRoom();
                          }}
                          onMouseEnter={() => playSound('btnHover')}
                          disabled={!playerName || !inputRoomCode}
                          className="bg-zinc-700 text-white px-6 rounded-xl hover:bg-emerald-500 transition-all disabled:opacity-30 font-bold flex items-center gap-2 whitespace-nowrap"
                        >
                          <Plus size={14} /> 加入私房
                        </button>
                      </div>

                      <button
                        onClick={() => {
                          if (!playerName) return;
                          createRoom();
                        }}
                        onMouseEnter={() => playSound('btnHover')}
                        disabled={!playerName}
                        className="w-full bg-emerald-500 text-white px-6 py-4 rounded-2xl hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-30 font-black flex items-center justify-center gap-2 shadow-[0_10px_30px_rgba(16,185,129,0.2)]"
                      >
                        <Plus size={18} /> 创建新房间
                      </button>
                    </div>
                  </motion.div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-center relative group">
                    <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 mb-2">房间代码</p>
                    <div className="flex items-center justify-center gap-3">
                      <h2 className="text-5xl font-black tracking-widest font-mono select-all">{gameState.roomCode}</h2>
                      <button
                        onClick={() => {
                          const text = gameState.roomCode;
                          const copy = async () => {
                            if (navigator.clipboard && navigator.clipboard.writeText) {
                              try {
                                await navigator.clipboard.writeText(text);
                                return true;
                              } catch (err) {
                                console.error('Clipboard API failed', err);
                              }
                            }

                            // Fallback: execCommand
                            try {
                              const textArea = document.createElement("textarea");
                              textArea.value = text;
                              textArea.style.position = "fixed";
                              textArea.style.left = "-9999px";
                              textArea.style.top = "0";
                              document.body.appendChild(textArea);
                              textArea.focus();
                              textArea.select();
                              const success = document.execCommand('copy');
                              document.body.removeChild(textArea);
                              return success;
                            } catch (err) {
                              console.error('Fallback copy failed', err);
                              return false;
                            }
                          };

                          copy().then(success => {
                            if (success) {
                              setCopied(true);
                              setTimeout(() => setCopied(false), 2000);
                              playSound('click');
                            }
                          });
                        }}
                        className="p-2 bg-zinc-800/50 hover:bg-zinc-800 rounded-lg border border-white/5 hover:border-white/20 transition-all text-zinc-400 hover:text-white"
                      >
                        {copied ? <Check size={18} className="text-emerald-500" /> : <Copy size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                        <Users size={14} /> 玩家 ({gameState.players.length}/10)
                      </p>
                      {isHost && (
                        <div className="flex items-center gap-2 bg-zinc-800/80 p-1 rounded-lg border border-white/5">
                          <button
                            onClick={() => {
                              if (aiCount > 0) {
                                const newCount = aiCount - 1;
                                setAiCount(newCount);
                                socketRef.current?.send(JSON.stringify({
                                  type: 'UPDATE_AI_SETTINGS',
                                  payload: { aiCount: newCount, difficulty: aiDifficulty }
                                }));
                                playSound('click');
                              }
                            }}
                            disabled={!isHost}
                            className={cn(
                              "w-8 h-8 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors text-zinc-400 hover:text-white",
                              !isHost && "opacity-0 pointer-events-none"
                            )}
                          >
                            -
                          </button>
                          <span className="text-xs font-black min-w-[2ch] text-center">{aiCount}</span>
                          <button
                            onClick={() => {
                              const humansCount = gameState.players.filter(p => !p.id.startsWith('ai-')).length;
                              if (humansCount + aiCount < 10) {
                                const newCount = aiCount + 1;
                                setAiCount(newCount);
                                socketRef.current?.send(JSON.stringify({
                                  type: 'UPDATE_AI_SETTINGS',
                                  payload: { aiCount: newCount, difficulty: aiDifficulty }
                                }));
                                playSound('click');
                              }
                            }}
                            disabled={!isHost}
                            className={cn(
                              "w-8 h-8 flex items-center justify-center rounded-md hover:bg-white/10 transition-colors text-zinc-400 hover:text-white",
                              !isHost && "opacity-0 pointer-events-none"
                            )}
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>

                    {isHost && aiCount > 0 && (
                      <div className="flex items-center justify-between bg-zinc-900/40 p-3 rounded-xl border border-white/5">
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">
                          全场 AI 难度
                        </p>
                        <div className="flex bg-zinc-800/80 p-1 rounded-lg border border-white/5">
                          {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                            <button
                              key={d}
                              onClick={() => {
                                if (!isHost) return;
                                setAiDifficulty(d);
                                playSound('click');
                                socketRef.current?.send(JSON.stringify({
                                  type: 'UPDATE_AI_SETTINGS',
                                  payload: { aiCount, difficulty: d }
                                }));
                              }}
                              className={cn(
                                "px-3 py-1.5 rounded-md text-[10px] font-black uppercase tracking-tighter transition-all",
                                !isHost && "pointer-events-none opacity-50",
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
                    )}
                    <div className="grid grid-cols-1 gap-2 max-h-64 lg:max-h-96 overflow-y-auto pr-2 custom-scrollbar">
                      {gameState.players.map((p, index) => (
                        <motion.div
                          initial={{ x: -20, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          key={p.id}
                          className="flex items-center justify-between bg-zinc-800/50 p-2.5 rounded-xl border border-white/5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="font-bold">{p.name}</span>
                            {p.isLocal && <span className="text-[10px] text-zinc-500 font-bold">(你)</span>}
                            {index === 0 && <span className="text-[10px] bg-emerald-500 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-tighter">房主</span>}
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Only host can kick others */}
                            {gameState.players[0]?.isLocal && !p.isLocal && (
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
                      {gameState.spectators.map((p) => (
                        <motion.div
                          initial={{ x: -20, opacity: 0 }}
                          animate={{ x: 0, opacity: 1 }}
                          key={p.id}
                          className="flex items-center justify-between bg-zinc-900/40 p-3 rounded-xl border border-dashed border-white/10"
                        >
                          <div className="flex items-center gap-2">
                            <span className="text-zinc-500 font-bold">{p.name}</span>
                            {p.isLocal && <span className="text-[10px] text-zinc-500 font-bold">(你)</span>}
                            <span className="text-[10px] bg-zinc-800 text-zinc-500 px-2 py-0.5 rounded-full font-black uppercase tracking-tighter">观战中</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Only host can kick others */}
                            {gameState.players[0]?.isLocal && (
                              <button
                                onClick={() => kickPlayer(p.id)}
                                className="p-1.5 bg-red-500/10 text-red-500 border border-red-500/20 rounded-lg hover:bg-red-500 hover:text-white transition-all shadow-sm"
                                title="踢出观战者"
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
                      className="flex-1 flex items-center justify-center gap-2 bg-zinc-800 text-zinc-400 font-bold py-3 rounded-xl hover:bg-zinc-700 hover:text-white transition-all active:scale-95"
                    >
                      <ChevronLeft size={18} /> 返回
                    </button>
                    <button
                      onClick={startGame}
                      disabled={!isHost || gameState.players.length < 2}
                      onMouseEnter={() => playSound('btnHover')}
                      className={cn(
                        "flex-[2] flex items-center justify-center gap-2 bg-emerald-500 text-white font-black py-3 rounded-xl hover:scale-105 active:scale-95 transition-all shadow-[0_0_30px_rgba(16,185,129,0.3)]",
                        (!isHost || gameState.players.length < 2) && "opacity-50 grayscale pointer-events-none"
                      )}
                    >
                      {isHost ? (
                        <>
                          <Play size={18} fill="currentColor" /> 开始游戏
                        </>
                      ) : (
                        "等待开始..."
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderGame = () => {
    const localPlayer = [...gameState.players, ...gameState.spectators].find(p => p.isLocal);
    if (!localPlayer || (gameState.status === 'playing' && gameState.players.length === 0)) return null;

    const actualViewingId = viewingPlayerId || localPlayer.id;
    const effectiveViewIndex = Math.max(0, gameState.players.findIndex(p => p.id === actualViewingId));
    const displayedPlayer = gameState.players[effectiveViewIndex];
    const isShowingActualSelf = displayedPlayer?.id === localPlayer.id;

    const isLocalTurn = gameState.players[gameState.currentPlayerIndex]?.isLocal ?? false;
    const isTargetTurn = gameState.currentPlayerIndex === effectiveViewIndex;
    const topCard = gameState.discardPile[gameState.discardPile.length - 1];
    const isPendingColor = gameState.pendingWildColorPlayerIndex !== null;
    const isLocalPendingColor = gameState.pendingWildColorPlayerIndex !== null && (gameState.players[gameState.pendingWildColorPlayerIndex]?.isLocal ?? false);
    const isAnimating = gameState.isReverseActive || !!gameState.jumpInPlayerId;
    const isLocalPendingUno = gameState.pendingUNOPlayerId !== null && gameState.pendingUNOPlayerId === localPlayer.id;
    const canSwitchView = isSpectator || gameState.isDevMode;
    const hasPlayableCard = localPlayer.hand.some(card =>
      (isLocalTurn && !isPendingColor && canPlayCard(card, topCard, gameState.drawStack, gameState.currentWildColor, lastNumberValue)) ||
      (!isLocalTurn && !isPendingColor && canJumpIn(card, topCard, gameState.drawStack))
    );

    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isScalingMode = (isTouch && window.innerWidth < 1200) || window.innerWidth < 1024;
    const canvasWidth = isScalingMode ? 1440 : window.innerWidth;
    const canvasHeight = isScalingMode ? 850 : window.innerHeight;

    return (
      <div
        className="fixed inset-0 z-0 flex items-center justify-center pointer-events-none overflow-hidden"
        style={{ perspective: "1200px" }}
      >
        <div
          className="relative pointer-events-auto shrink-0 overflow-hidden"
          style={{
            width: isScalingMode ? '1440px' : '100vw',
            height: isScalingMode ? '850px' : '100vh',
            transform: isScalingMode ? `scale(var(--ui-scale))` : 'none'
          }}
        >
          <motion.div
            animate={shake ? {
              x: [-15, 15, -12, 12, -8, 8, -4, 4, 0],
              y: [-10, 10, -8, 8, -5, 5, -2, 2, 0],
              rotate: [-1, 1, -0.8, 0.8, -0.5, 0.5, -0.2, 0.2, 0]
            } : {}}
            transition={{ duration: 0.4, ease: "easeInOut" }}
            className="w-full h-full flex flex-col items-center justify-center bg-zinc-950 text-white relative"
          >
            {/* Player Left Overlay */}
            <AnimatePresence>
              {gameState.playerLeftMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -50 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -50 }}
                  className="absolute top-20 left-1/2 -translate-x-1/2 z-[2000] bg-orange-500 text-white px-8 py-4 rounded-full shadow-[0_20px_40px_rgba(249,115,22,0.5)] border-4 border-white flex items-center gap-3"
                >
                  <LogOut size={24} />
                  <span className="text-xl font-black tracking-widest">{gameState.playerLeftMessage}</span>
                </motion.div>
              )}
            </AnimatePresence>

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
                    className="relative z-[610] bg-zinc-900 border-2 border-white/20 p-6 rounded-[40px] shadow-[0_50px_100px_rgba(0,0,0,0.9)] flex flex-col items-center gap-6"
                  >
                    <div className="space-y-1 text-center">
                      <h2 className="text-[10px] font-black uppercase tracking-[0.4em] text-zinc-500">万能牌触发</h2>
                      <h1 className="text-2xl font-black italic tracking-tighter uppercase">选择下个颜色</h1>
                    </div>

                    <div className="flex gap-6">
                      {(['red', 'blue', 'green', 'yellow'] as CardColor[]).map(color => (
                        <motion.button
                          key={color}
                          whileHover={{ scale: 1.15, y: -10 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => chooseColor(color)}
                          className={cn(
                            "w-20 h-20 rounded-[24px] border-4 flex flex-col items-center justify-center shadow-2xl transition-all relative group",
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
                    <div className="relative bg-white text-black px-10 py-6 rounded-[32px] border-4 border-black -rotate-2 flex flex-col items-center">
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="text-yellow-500 fill-yellow-500" size={20} />
                        <span className="text-sm font-black uppercase tracking-[0.3em] text-zinc-400">抢牌成功!</span>
                        <Zap className="text-yellow-500 fill-yellow-500" size={20} />
                      </div>
                      <span className="text-5xl font-black italic tracking-tighter uppercase whitespace-nowrap drop-shadow-sm">JUMP IN!</span>
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
                    <div className="relative bg-white text-black px-10 py-6 rounded-[32px] border-4 border-black rotate-2 flex flex-col items-center">
                      <div className="flex items-center gap-2 mb-2">
                        <RefreshCw className="text-emerald-500" size={20} />
                        <span className="text-sm font-black uppercase tracking-[0.3em] text-zinc-400">方向反转!</span>
                        <RefreshCw className="text-emerald-500" size={20} />
                      </div>
                      <span className="text-5xl font-black italic tracking-tighter uppercase whitespace-nowrap drop-shadow-sm">REVERSE!</span>
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

            {/* Action Flash & Power Surge Overlay */}
            <AnimatePresence>
              {actionFlash && (
                <motion.div
                  className="fixed inset-0 z-[400] pointer-events-none flex items-center justify-center overflow-hidden"
                >
                  {/* Full Screen Impact Flash */}
                  <motion.div
                    initial={{ opacity: 0, scale: 1.2 }}
                    animate={{ opacity: [0, 0.4, 0], scale: 1 }}
                    transition={{ duration: 0.6 }}
                    className="absolute inset-0"
                    style={{ backgroundColor: actionFlash.color }}
                  />

                  {/* Impact Text Burst - Only show if not empty */}
                  {actionFlash.text && (
                    <div className="relative">
                      <motion.div
                        initial={{ scale: 0, opacity: 0, rotate: -15 }}
                        animate={{
                          scale: [0, 1.8, 1],
                          opacity: [0, 1, 1],
                          rotate: [-15, 0, 0]
                        }}
                        exit={{ scale: 3, opacity: 0, y: -100 }}
                        className="relative z-10"
                      >
                        <h2 className="text-8xl font-black italic tracking-tighter text-white stroke-black stroke-2 drop-shadow-[0_20px_50px_rgba(0,0,0,0.8)] transform -skew-x-12 px-4 py-2 border-y-8 border-white">
                          {actionFlash.text}
                        </h2>
                      </motion.div>

                      {/* Secondary Shockwave Circle */}
                      <motion.div
                        initial={{ scale: 0, opacity: 1 }}
                        animate={{ scale: 6, opacity: 0 }}
                        transition={{ duration: 0.8, ease: "easeOut" }}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 rounded-full border-[20px]"
                        style={{ borderColor: actionFlash.color }}
                      />
                    </div>
                  )}

                  {/* Radial Vignette Distortion Pulse */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: [0, 0.7, 0] }}
                    transition={{ duration: 0.8 }}
                    className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_20%,rgba(0,0,0,0.8)_100%)]"
                  />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Optimized Background Components */}
            <div className="absolute inset-0 z-[0] pointer-events-none overflow-hidden">
              {/* Main Ambient Glow - Reacts to current card color or wild color */}
              <motion.div
                animate={{
                  backgroundColor: (() => {
                    const topColor = gameState.currentWildColor || (gameState.discardPile.length > 0 ? gameState.discardPile[gameState.discardPile.length - 1].color : null);
                    switch (topColor) {
                      case 'red': return 'rgba(239, 68, 68, 0.18)';
                      case 'blue': return 'rgba(59, 130, 246, 0.18)';
                      case 'green': return 'rgba(16, 185, 129, 0.18)';
                      case 'yellow': return 'rgba(251, 191, 36, 0.18)';
                      default: return 'rgba(16, 185, 129, 0.08)';
                    }
                  })()
                }}
                className="absolute inset-0 transition-colors duration-1000"
              />

              {/* Animated Floating Bokeh Elements for Depth */}
              <div className="absolute inset-0 opacity-40">
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={i}
                    animate={{
                      x: [0, 80, -40, 0],
                      y: [0, -60, 40, 0],
                      scale: [1, 1.3, 0.9, 1],
                      rotate: [0, 45, -45, 0]
                    }}
                    transition={{
                      duration: 15 + i * 5,
                      repeat: Infinity,
                      ease: "easeInOut"
                    }}
                    className="absolute rounded-full blur-[120px]"
                    style={{
                      width: `${400 + i * 100}px`,
                      height: `${400 + i * 100}px`,
                      left: `${-10 + i * 25}%`,
                      top: `${-10 + (i % 3) * 30}%`,
                      backgroundColor: i % 3 === 0 ? 'rgba(16, 185, 129, 0.15)' :
                        i % 3 === 1 ? 'rgba(59, 130, 246, 0.15)' : 'rgba(239, 68, 68, 0.1)'
                    }}
                  />
                ))}
              </div>

              {/* Sophisticated Dot Grid Overlay */}
              <div
                className="absolute inset-0 opacity-[0.07]"
                style={{
                  backgroundImage: `radial-gradient(circle at 1px 1px, rgba(255,255,255,0.8) 1.5px, transparent 0)`,
                  backgroundSize: '48px 48px'
                }}
              />

              {/* Dynamic Radial Vignette */}
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/40" />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.6)_100%)]" />

              {/* Center Board Highlight - Focuses attention on cards */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[1200px] h-[700px] bg-white/[0.01] rounded-[150px] blur-[100px] border border-white/[0.05]" />
            </div>

            {/* Water Ripples Layer */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-[0]">
              <AnimatePresence>
                {ripples.map(ripple => (
                  <motion.div
                    key={ripple.id}
                    initial={{ scale: 0, opacity: 0.8 }}
                    animate={{ scale: ripple.scale, opacity: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1.8, ease: "easeOut" }}
                    className="absolute rounded-full border-[3px]"
                    style={{
                      left: `${ripple.x}%`,
                      top: `${ripple.y}%`,
                      width: '600px',
                      height: '600px',
                      marginLeft: '-300px',
                      marginTop: '-300px',
                      borderColor:
                        ripple.color === 'yellow' ? '#facc15' :
                          ripple.color === 'red' ? '#ef4444' :
                            ripple.color === 'blue' ? '#3b82f6' :
                              ripple.color === 'green' ? '#10b981' : '#ffffff',
                      boxShadow: `0 0 20px ${ripple.color === 'yellow' ? 'rgba(250, 204, 21, 0.3)' :
                        ripple.color === 'red' ? 'rgba(239, 68, 68, 0.3)' :
                          ripple.color === 'blue' ? 'rgba(59, 130, 246, 0.3)' :
                            ripple.color === 'green' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255, 255, 255, 0.1)'
                        }`
                    }}
                  />
                ))}
              </AnimatePresence>
            </div>

            {/* Action Card Comic Bubbles (Center) */}
            <div className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 z-[400] pointer-events-none flex items-center justify-center">
              <AnimatePresence>
                {actionBubble && (
                  <ComicBubble
                    text={actionBubble.text}
                    color={actionBubble.color}
                    className="relative top-0"
                  />
                )}
              </AnimatePresence>
            </div>

            {/* Hand / Deck Controls - Hide for spectators */}
            <div className="absolute top-10 left-0 right-0 z-50 flex items-center justify-between px-16">
              <div className="flex items-center gap-3">
                <motion.div
                  layout
                  className="bg-zinc-900/50 backdrop-blur-md border border-white/10 p-1.5 rounded-2xl flex items-center gap-2 shadow-xl"
                >
                  <AnimatePresence mode="popLayout">
                    {gameState.players.map((p, i) => {
                      const isActive = gameState.currentPlayerIndex === i;
                      return (
                        <motion.div
                          key={p.id}
                          layout
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{
                            opacity: 1,
                            scale: 1,
                            width: isActive ? "auto" : "36px"
                          }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ type: "spring", damping: 20, stiffness: 300 }}
                          className={cn(
                            "h-9 rounded-xl flex items-center transition-all duration-300 border overflow-hidden",
                            isActive
                              ? "bg-emerald-500 border-emerald-400 text-white shadow-[0_0_20px_rgba(16,185,129,0.4)] px-4 gap-2"
                              : "bg-zinc-800/50 border-white/5 text-zinc-500 justify-center hover:bg-zinc-800 hover:text-zinc-300 cursor-help"
                          )}
                          title={!isActive ? `${p.name} (${p.hand.length}张)` : ""}
                        >
                          <div className={cn(
                            "w-2 h-2 rounded-full flex-shrink-0",
                            isActive ? "bg-white animate-pulse" : "bg-zinc-600"
                          )} />

                          <AnimatePresence mode="wait">
                            {isActive ? (
                              <motion.div
                                key="full"
                                initial={{ opacity: 0, x: -10 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -10 }}
                                className="flex items-center gap-2"
                              >
                                <span className="text-xs font-black tracking-tight whitespace-nowrap">
                                  {p.name}
                                  {p.isLocal && <span className="ml-1 opacity-60 text-[10px]">(你)</span>}
                                </span>
                                <span className="text-[10px] font-bold bg-black/20 px-1.5 py-0.5 rounded-md">
                                  {p.hand.length}
                                </span>
                              </motion.div>
                            ) : (
                              <motion.span
                                key="short"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="text-xs font-black uppercase"
                              >
                                {p.name.charAt(0)}
                              </motion.span>
                            )
                            }
                          </AnimatePresence>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  <div className="h-6 w-px bg-white/10 mx-1" />

                  <div className="bg-zinc-800/80 px-4 py-2 rounded-xl flex items-center gap-2 border border-white/5 mx-2">
                    <Users size={14} className="text-zinc-500" />
                    <span className="text-[10px] font-black text-zinc-400">{gameState.spectators.length}</span>
                  </div>

                  <div className="bg-zinc-800/80 px-4 py-2 rounded-xl flex items-center gap-2 border border-white/5">
                    {gameState.direction === 1 ? <ArrowRight size={14} className="text-emerald-500" /> : <ArrowLeft size={14} className="text-emerald-500" />}
                    <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500">方向</span>
                  </div>
                </motion.div>

                {isSpectator && (
                  <div className="flex items-center gap-2">
                    <div className="bg-amber-500/20 border border-amber-500/40 px-4 py-2 rounded-xl flex items-center gap-2 backdrop-blur-md">
                      <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
                      <span className="text-xs font-black text-amber-500 tracking-tighter uppercase whitespace-nowrap">观战中: {displayedPlayer?.name}</span>
                    </div>
                    {!isShowingActualSelf && (
                      <button
                        onClick={() => setViewingPlayerId(localPlayer.id)}
                        className="bg-white/10 hover:bg-white/20 border border-white/10 p-2 rounded-xl transition-all"
                        title="回到自己的视角"
                      >
                        <RefreshCw size={14} className="text-white" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-2.5 rounded-xl bg-zinc-900 border border-white/10 text-zinc-500 hover:text-white transition-all active:scale-90 shadow-lg"
                  title={isMuted ? "取消静音" : "静音"}
                >
                  {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
                </button>
                <button
                  onClick={toggleFullscreen}
                  className="p-2.5 rounded-xl bg-zinc-900 border border-white/10 text-zinc-500 hover:text-white transition-all active:scale-90 shadow-lg"
                  title={isFullscreen ? "退出全屏" : "进入全屏"}
                >
                  {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
                </button>
                <div
                  onClick={() => {
                    if (gameState.isDevMode) {
                      navigator.clipboard.writeText(gameState.roomCode);
                      playSound('item');
                    }
                  }}
                  className={cn(
                    "bg-zinc-900 border border-white/10 px-4 py-2.5 rounded-xl shadow-lg block",
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

            {/* Turn Timer Progress Bar stays at top but subtle */}
            <div className="absolute top-0 left-0 w-full h-1 bg-zinc-900 z-[100] pointer-events-none">
              <motion.div
                initial={{ width: "100%" }}
                animate={{ width: `${(gameState.timeLeft / 30) * 100}%` }}
                transition={{ duration: 1, ease: "linear" }}
                className={cn(
                  "h-full transition-colors duration-500 shadow-[0_0_10px_currentColor]",
                  gameState.timeLeft > 15 ? "bg-emerald-500 text-emerald-500" :
                    gameState.timeLeft > 5 ? "bg-yellow-500 text-yellow-500" : "bg-red-500 text-red-500"
                )}
              />
            </div>

            {/* Main Board - Perfectly Centered in 1440x850 Canvas */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none z-[10]">
              {/* AI / Other Players Hands (Circular Layout Centered) */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                {(() => {
                  return gameState.players.map((p, i) => {
                    const isViewingThis = p.id === displayedPlayer?.id;
                    if (isViewingThis) return null;
                    const playerCount = gameState.players.length;
                    const isLarge = playerCount > 6;

                    // Responsive radius for desktop
                    const baseRadiusH = isLarge ? 480 : 520;
                    const baseRadiusV = isLarge ? 280 : 320;
                    const radiusH = isScalingMode ? baseRadiusH : (canvasWidth * 0.36);
                    const radiusV = isScalingMode ? baseRadiusV : (canvasHeight * 0.38);

                    const iconScale = isLarge ? 0.75 : 0.9;

                    // Rotate the perspective so effectiveViewIndex is at the bottom (90 degrees or Pi/2)
                    const relativeIndex = (i - effectiveViewIndex + playerCount) % playerCount;
                    const angle = (relativeIndex / playerCount) * Math.PI * 2 + Math.PI / 2;

                    return (
                      <div
                        key={p.id}
                        className="absolute transition-all duration-700 ease-in-out pointer-events-auto"
                        style={{
                          left: `calc(50% + ${Math.cos(angle) * radiusH}px)`,
                          top: `calc(50% + ${Math.sin(angle) * radiusV}px)`,
                          transform: `translate(-50%, -50%) scale(${iconScale})`
                        }}
                      >
                        <motion.div
                          onClick={() => canSwitchView && setViewingPlayerId(p.id)}
                          className={cn(
                            "flex flex-col items-center rounded-3xl transition-all group",
                            canSwitchView ? "cursor-pointer" : "cursor-default",
                            isLarge ? "gap-1 p-2" : "gap-2 p-4",
                            gameState.currentPlayerIndex === i ? "bg-emerald-500/10 ring-2 ring-emerald-500/20 scale-110" : "opacity-80 hover:opacity-100",
                            isViewingThis && "ring-2 ring-white/40 bg-white/5"
                          )}
                        >
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
                                "relative w-16 h-16 flex items-center justify-center transition-all",
                                seeAllHands && "cursor-zoom-in hover:scale-110"
                              )}
                            >
                              {/* Avatar Circle with Glossy Effect */}
                              <div className={cn(
                                "w-full h-full rounded-full border-2 flex items-center justify-center relative overflow-hidden transition-all duration-500",
                                gameState.currentPlayerIndex === i
                                  ? "bg-emerald-500/20 border-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.4)]"
                                  : "bg-zinc-900/60 border-white/10 shadow-xl"
                              )}>
                                {/* Advanced Glassmorphism & Depth */}
                                <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/20 pointer-events-none" />
                                <div className="absolute inset-[2px] rounded-full border border-white/5 pointer-events-none" />

                                {/* Ambient Aura for active player */}
                                {gameState.currentPlayerIndex === i && (
                                  <div className="absolute inset-0 bg-emerald-400/10 animate-pulse" />
                                )}

                                {/* Bot Icon or First Letter */}
                                {p.id.startsWith('ai-') ? (
                                  <Zap size={24} className={cn(
                                    "transition-all drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]",
                                    gameState.currentPlayerIndex === i ? "text-emerald-400 scale-110" : "text-zinc-600"
                                  )} fill="currentColor" />
                                ) : (
                                  <span className={cn(
                                    "text-2xl font-black uppercase tracking-tighter transition-colors drop-shadow-md",
                                    gameState.currentPlayerIndex === i ? "text-white" : "text-zinc-500"
                                  )}>
                                    {p.name.charAt(0)}
                                  </span>
                                )}
                              </div>

                              {/* Card Count Badge (Styled as a small card) */}
                              <motion.div
                                initial={false}
                                animate={{
                                  scale: gameState.currentPlayerIndex === i ? 1.1 : 1,
                                  y: gameState.currentPlayerIndex === i ? -4 : 0
                                }}
                                className={cn(
                                  "absolute -bottom-1 -right-1 min-w-[32px] h-10 bg-zinc-950 border-2 rounded-xl flex flex-col items-center justify-center shadow-2xl transition-all z-10",
                                  p.hand.length <= 2 ? "border-red-500 shadow-red-500/20" : "border-zinc-700"
                                )}
                              >
                                <span className={cn(
                                  "text-[10px] font-black leading-none mb-0.5",
                                  p.hand.length <= 2 ? "text-red-500" : "text-zinc-500"
                                )}>
                                  {p.hand.length}
                                </span>
                                <div className={cn(
                                  "w-3 h-0.5 rounded-full",
                                  p.hand.length <= 2 ? "bg-red-500" : "bg-zinc-800"
                                )} />
                              </motion.div>

                              {seeAllHands && (
                                <div className="absolute inset-0 bg-black/60 rounded-full flex flex-wrap gap-0.5 p-2 items-center justify-center overflow-hidden pointer-events-none">
                                  {p.hand.slice(0, 12).map((c, i) => (
                                    <div key={i} className={cn("w-1.5 h-2 rounded-[1px]",
                                      c.color === 'red' ? 'bg-red-500' :
                                        c.color === 'blue' ? 'bg-blue-500' :
                                          c.color === 'green' ? 'bg-green-500' :
                                            c.color === 'yellow' ? 'bg-yellow-400' : 'bg-white'
                                    )} />
                                  ))}
                                  {p.hand.length > 12 && <span className="text-[6px] text-zinc-500">...</span>}
                                </div>
                              )}

                              {/* God Mode Detailed Hover */}
                              <AnimatePresence>
                                {seeAllHands && hoveredGodModePlayerId === p.id && (
                                  <motion.div
                                    initial={{ opacity: 0, scale: 0.5, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.5, y: 10 }}
                                    className="absolute left-1/2 -bottom-2 translate-y-full -translate-x-1/2 z-[1000] bg-zinc-900/95 backdrop-blur-xl border border-white/20 p-2 rounded-xl shadow-2xl flex flex-wrap gap-1 min-w-[120px] max-w-[200px] justify-center pointer-events-none"
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
                            </div>
                            {gameState.currentPlayerIndex === i && (
                              <motion.div
                                layoutId="active-indicator"
                                className="absolute -top-1 -right-1 w-5 h-5 bg-emerald-500 rounded-full border-4 border-zinc-950 z-20"
                              />
                            )}
                          </div>
                          <span className={cn(
                            "text-[10px] font-black uppercase tracking-[0.2em] transition-colors",
                            gameState.currentPlayerIndex === i ? "text-emerald-400" : "text-zinc-500"
                          )}>
                            {p.name}
                          </span>
                        </motion.div>
                      </div>
                    );
                  })
                })()}
              </div>

              {/* Center Pile */}
              <div className="relative flex items-center gap-12 pointer-events-auto">
                {/* Deck */}


                {/* Discard Pile Zone */}
                <div
                  className="relative flex items-center justify-center"
                  style={{ width: 'var(--card-w)', height: 'var(--card-h)' }}
                >
                  {/* This is the invisible hover catcher that grows to cover the fan-out area */}
                  <div
                    onMouseEnter={() => setIsDiscardHovered(true)}
                    onMouseLeave={() => setIsDiscardHovered(false)}
                    className={cn(
                      "absolute z-[150] cursor-help transition-all duration-300 left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
                      isDiscardHovered
                        ? "w-[800px] h-[400px] opacity-100"
                        : "w-24 h-32 opacity-0"
                    )}
                  />

                  <AnimatePresence mode="popLayout">
                    {gameState.discardPile.slice(-5).map((card, idx, arr) => {
                      const isTop = idx === arr.length - 1;

                      // Fan out calculation
                      const centerOffset = idx - (arr.length - 1) / 2;

                      // Fallback pseudo-random for messy stack without render-vibration
                      const pseudoRandom = (card.id.charCodeAt(card.id.length - 1) % 10) - 5;

                      const fanX = isDiscardHovered ? centerOffset * 130 : 0;
                      const fanY = isDiscardHovered ? Math.abs(centerOffset) * 25 : 0;
                      const fanRotate = isDiscardHovered ? centerOffset * 15 : (isTop ? pseudoRandom : 0);

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
            </div>

            <div className={cn(
              "absolute bottom-0 left-0 right-0 z-30 flex flex-col items-center justify-end pointer-events-none",
              gameState.players.length > 6 ? "pb-4" : "pb-8"
            )}>
              {/* JUMP IN! Bubble for Local Player */}
              <AnimatePresence>
                {localPlayer && gameState.jumpInPlayerId === localPlayer.id && (
                  <ComicBubble text="JUMP IN!" className="-top-32" color="yellow" />
                )}
              </AnimatePresence>

              {/* UNO Speech Bubble for Local Player */}
              <AnimatePresence>
                {localPlayer && localPlayer.hasShoutedUNO && (
                  <ComicBubble text="UNO !!!" className="-top-32" />
                )}
              </AnimatePresence>

              {/* UNO Button */}
              <AnimatePresence>
                {isLocalPendingUno && (
                  <motion.div
                    initial={{ scale: 0, y: 50 }}
                    animate={{ scale: 1, y: 0 }}
                    exit={{ scale: 0, y: 50 }}
                    className="absolute -top-40 z-[300] pointer-events-auto"
                  >
                    <motion.button
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => shoutUNO()}
                      className="relative group"
                    >
                      <div className="absolute -inset-4 bg-orange-500 rounded-full blur-2xl opacity-50 animate-pulse" />
                      <div className="relative bg-orange-500 border-4 border-white px-8 py-4 rounded-[30px] shadow-[0_15px_0_rgb(194,65,12)] transform -rotate-3">
                        <span className="text-2xl font-black italic text-white tracking-tighter drop-shadow-md">喊 UNO !!!</span>
                      </div>
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex items-center gap-4 mb-6 z-[200] pointer-events-auto">
                <div className={cn(
                  "px-6 py-2 rounded-full border transition-all flex items-center gap-3 bg-zinc-950/50 backdrop-blur-md",
                  isTargetTurn ? "border-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.4)]" : "border-white/10"
                )}>
                  <div className={cn("w-2 h-2 rounded-full", isTargetTurn ? "bg-emerald-400 animate-ping" : "bg-zinc-700")} />
                  <div className="flex flex-col items-start -space-y-1">
                    <span className="text-sm font-black uppercase tracking-widest">
                      {isTargetTurn ? (isShowingActualSelf ? "你的回合" : `${displayedPlayer?.name} 的回合`) : `${gameState.players[gameState.currentPlayerIndex]?.name || '未知'} 的回合`}
                    </span>
                  </div>
                  {isTargetTurn && (
                    <div className={cn(
                      "ml-2 font-mono font-black text-lg min-w-[1.5ch]",
                      gameState.timeLeft > 15 ? "text-emerald-400" :
                        gameState.timeLeft > 5 ? "text-yellow-400" : "text-red-500"
                    )}>
                      {gameState.timeLeft}
                    </div>
                  )}
                </div>

                {/* Recommendation Toggle */}
                {hasPlayableCard && (
                  <button
                    onClick={() => setShowRecommendations(!showRecommendations)}
                    className={cn(
                      "px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest transition-all border",
                      showRecommendations ? "bg-white text-black border-white shadow-lg" : "bg-zinc-950/80 text-white border-white/20 hover:border-white/40 backdrop-blur-md"
                    )}
                  >
                    推荐出牌
                  </button>
                )}

                {/* Action Buttons */}
                <AnimatePresence mode="wait">
                  {isAnimating || isPendingColor ? null : isLocalTurn ? (
                    <div className="flex gap-4">
                      <motion.button
                        key="draw-btn"
                        initial={{ scale: 0.8, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.8, opacity: 0 }}
                        onClick={() => {
                          setSelectedCardId(null);
                          drawCard();
                        }}
                        className={cn(
                          "px-8 py-2.5 text-sm font-black uppercase tracking-widest rounded-full transition-all flex items-center gap-2",
                          gameState.drawStack > 0
                            ? "bg-red-500 text-white shadow-[0_10px_30px_rgba(239,68,68,0.4)] hover:scale-105 active:scale-95"
                            : "bg-amber-500 text-white shadow-[0_10px_40px_rgba(245,158,11,0.4)] hover:bg-amber-400"
                        )}
                      >
                        <RefreshCw size={16} className={cn(gameState.drawStack > 0 && "animate-spin-slow")} />
                        {gameState.drawStack > 0 ? `认罚！摸 ${gameState.drawStack} 张` : '直接摸牌'}
                      </motion.button>

                      {selectedCardId && (
                        <motion.button
                          key="play-btn"
                          initial={{ scale: 0.8, x: 20, opacity: 0 }}
                          animate={{ scale: 1, x: 0, opacity: 1 }}
                          exit={{ scale: 0.8, x: 20, opacity: 0 }}
                          onClick={() => playCard(selectedCardId)}
                          className="px-8 py-2.5 bg-emerald-500 text-white text-sm font-black uppercase tracking-widest rounded-full shadow-[0_10px_40px_rgba(16,185,129,0.4)] hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
                        >
                          <Play size={16} fill="currentColor" /> 确定出牌
                        </motion.button>
                      )}
                    </div>
                  ) : (
                    (() => {
                      const selectedCard = localPlayer?.hand.find((c: any) => c.id === selectedCardId);
                      return selectedCardId && !isAnimating && selectedCard && canJumpIn(selectedCard, topCard, gameState.drawStack) && (
                        <motion.button
                          key="jump-btn"
                          initial={{ scale: 0, rotate: -20 }}
                          animate={{ scale: 1, rotate: 0 }}
                          exit={{ scale: 0, rotate: 20 }}
                          onMouseEnter={() => playSound('btnHover')}
                          onClick={() => {
                            playCard(selectedCardId);
                          }}
                          className="px-10 py-3 bg-yellow-400 text-black text-sm font-black uppercase tracking-[0.2em] rounded-full shadow-[0_0_50px_rgba(250,204,21,0.5)] border-4 border-black hover:scale-110 active:scale-90 transition-all flex items-center gap-3 animate-bounce-short"
                        >
                          <Zap size={18} fill="currentColor" /> 绝地抢牌！
                        </motion.button>
                      );
                    })()
                  )}
                </AnimatePresence>
              </div>

              <div className="flex flex-col items-center gap-6 w-full">
                <div
                  onMouseEnter={() => setIsHandHovered(true)}
                  onMouseLeave={() => setIsHandHovered(false)}
                  className="relative flex items-center justify-center w-full h-48 pointer-events-auto"
                >
                  {[...displayedPlayer.hand]
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

                      const maxWidth = isHandHovered ? 800 : 450;
                      const xStep = Math.min(maxWidth / Math.max(total, 1), isHandHovered ? 80 : 42);
                      const xOffset = offset * xStep;

                      const yFactor = isHandHovered ? 15 : 5;
                      const fanY = Math.pow(Math.abs(offset), 1.5) * (yFactor / Math.max(total * 0.1, 1));
                      const yOffset = isHorizontal ? (isHandHovered ? -20 : 0) : fanY;

                      const lastNumberValue = [...gameState.discardPile].reverse().find(isNumberCard)?.value || null;
                      return (
                        <motion.div
                          key={card.id}
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
                <div className="flex bg-zinc-900/80 backdrop-blur-md p-1.5 rounded-2xl border border-white/10 pointer-events-auto transition-all hover:border-white/20 -mt-2 shadow-2xl">
                  <button
                    onClick={() => { setSortType('value'); playSound('click'); }}
                    className={cn(
                      "px-8 py-2.5 rounded-xl text-xs font-black uppercase tracking-[0.2em] transition-all",
                      sortType === 'value' ? "bg-white text-black shadow-lg scale-105" : "text-zinc-500 hover:text-white"
                    )}
                  >
                    按数字
                  </button>
                  <button
                    onClick={() => { setSortType('color'); playSound('click'); }}
                    className={cn(
                      "px-8 py-2.5 rounded-xl text-xs font-black uppercase tracking-[0.2em] transition-all",
                      sortType === 'color' ? "bg-white text-black shadow-lg scale-105" : "text-zinc-500 hover:text-white"
                    )}
                  >
                    按花色
                  </button>
                </div>
              </div>

              {/* Bottom Controls Area */}
              {!isSpectator && (
                <div className="absolute bottom-40 left-0 right-0 flex flex-col items-center pointer-events-none">
                  {/* Dev Command Center Overlay */}
                  {gameState.isDevMode && (
                    <div className="absolute -bottom-20 right-40 z-[500] flex flex-col items-end gap-3 pointer-events-none">
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
                              if (players[p.currentPlayerIndex]) {
                                players[p.currentPlayerIndex].hand.push(randomCard);
                              }
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

                  {/* Bottom-Left Deck Counter (Moved inside virtual canvas) */}
                  <div className="absolute -bottom-20 -left-[450px] z-[200] pointer-events-none drop-shadow-2xl">
                    <div
                      onClick={() => {
                        if (isLocalTurn && !isAnimating && !isPendingColor) {
                          drawCard();
                          playSound('click');
                        }
                      }}
                      className={cn(
                        "relative group transition-all duration-500 pointer-events-auto cursor-pointer",
                        !(isLocalTurn && !isAnimating && !isPendingColor) && "grayscale opacity-80 cursor-not-allowed"
                      )}
                    >
                      {/* Stacked cards effect */}
                      <div className="absolute top-1 left-1 w-[60px] h-[84px] bg-zinc-800 rounded-lg border-2 border-zinc-700 -rotate-6 transition-transform group-hover:-translate-y-2" />
                      <div className="absolute top-0.5 left-0.5 w-[60px] h-[84px] bg-zinc-800 rounded-lg border-2 border-zinc-700 -rotate-3 transition-transform group-hover:-translate-y-1" />

                      <div className={cn(
                        "relative w-[60px] h-[84px] bg-zinc-900 rounded-lg border-2 flex flex-col items-center justify-center gap-1 shadow-2xl backdrop-blur-sm transition-all group-hover:scale-110",
                        isLocalTurn && !isAnimating && !isPendingColor ? "border-emerald-500 shadow-emerald-500/20" : "border-zinc-700"
                      )}>
                        <Zap size={14} className={cn("text-emerald-500", isLocalTurn && "animate-pulse")} fill="currentColor" />
                        <div className="flex flex-col items-center">
                          <span className="text-xl font-black italic tracking-tighter text-white">{gameState.deck.length}</span>
                          <span className="text-[8px] font-black uppercase tracking-widest text-emerald-500/70">DECK</span>
                        </div>
                      </div>

                      {/* Glow effect */}
                      {isLocalTurn && !isAnimating && !isPendingColor && (
                        <div className="absolute -inset-4 bg-emerald-500/20 rounded-full blur-2xl -z-10 animate-pulse" />
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    );
  };


  const renderEnd = () => {
    const localPlayer = [...gameState.players, ...gameState.spectators].find(p => p.isLocal);
    const isWin = localPlayer && gameState.winner === localPlayer.name;
    const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isScalingMode = (isTouch && window.innerWidth < 1200) || window.innerWidth < 1024;

    return (
      <div className="fixed inset-0 z-[2000] flex items-center justify-center pointer-events-none overflow-hidden">
        {/* Backdrop for focus */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 bg-black/40 backdrop-blur-[2px] pointer-events-auto"
        />

        <div
          className="relative z-10 flex flex-col items-center justify-center pointer-events-auto shrink-0"
          style={{
            width: isScalingMode ? '1440px' : '100vw',
            height: isScalingMode ? '850px' : '100vh',
            transform: isScalingMode ? `scale(var(--ui-scale))` : 'none'
          }}
        >
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
                onClick={leaveGame}
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
      {/* Mobile Orientation Prompt */}
      <AnimatePresence>
        {isPortrait && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] bg-zinc-950 flex flex-col items-center justify-center p-10 text-center"
          >
            <motion.div
              animate={{
                rotate: [0, -90, -90, 0],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                times: [0, 0.4, 0.6, 1],
                ease: "easeInOut"
              }}
              className="mb-8 p-6 rounded-3xl bg-emerald-500/10 border-2 border-emerald-500/20 shadow-[0_0_50px_rgba(16,185,129,0.1)]"
            >
              <Smartphone size={64} className="text-emerald-500" strokeWidth={1.5} />
            </motion.div>
            <h2 className="text-3xl font-black italic tracking-tighter text-white mb-4">请横屏游玩</h2>
            <p className="text-zinc-500 text-sm font-bold uppercase tracking-[0.2em] leading-relaxed max-w-xs">
              为了获得最佳的游戏比例与体验，<br />请将您的手机横向放置。
            </p>
            <div className="mt-12 flex items-center gap-2 px-6 py-3 rounded-2xl bg-zinc-900 border border-white/5">
              <RotateCw size={16} className="text-emerald-500 animate-spin-slow" />
              <span className="text-[10px] font-black uppercase tracking-widest text-zinc-400">正在检测屏幕方向...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fullscreen Prompt for Mobile */}
      <AnimatePresence>
        {showFullscreenPrompt && !isFullscreen && !isPortrait && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[5000] w-[90%] max-w-md pointer-events-auto"
          >
            <div className="bg-zinc-900/90 backdrop-blur-xl border-2 border-emerald-500/50 p-6 rounded-[32px] shadow-[0_20px_50px_rgba(0,0,0,0.5)] flex items-center gap-4">
              <div className="p-3 bg-emerald-500/20 rounded-2xl">
                <Maximize className="text-emerald-500" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-black italic tracking-tighter text-lg">全屏游戏体验更佳</h3>
                <p className="text-zinc-400 text-[10px] font-bold uppercase tracking-widest">隐藏工具栏，获得更大视野</p>
              </div>
              <div className="flex flex-col gap-2">
                <button
                  onClick={toggleFullscreen}
                  className="bg-emerald-500 text-white px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg shadow-emerald-500/20"
                >
                  全屏
                </button>
                <button
                  onClick={() => setShowFullscreenPrompt(false)}
                  className="text-zinc-500 text-[10px] font-bold uppercase tracking-widest hover:text-white"
                >
                  关闭
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {gameState.status === 'lobby' && renderLobby()}
      {(gameState.status === 'playing' || gameState.status === 'ended') && renderGame()}
      {gameState.status === 'ended' && renderEnd()}
    </div>
  );
}
