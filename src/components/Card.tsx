import React from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { CardData, cn } from '../types';

interface CardProps {
  card: CardData;
  onClick?: () => void;
  disabled?: boolean;
  isFaceDown?: boolean;
  className?: string;
  isHighlighted?: boolean;
  isSelected?: boolean;
}

const COLOR_MAP: Record<string, string> = {
  red: 'bg-red-500 border-red-700 shadow-red-500/20',
  blue: 'bg-blue-500 border-blue-700 shadow-blue-500/20',
  green: 'bg-green-500 border-green-700 shadow-green-500/20',
  yellow: 'bg-yellow-400 border-yellow-600 text-black shadow-yellow-400/20',
  wild: 'bg-zinc-900 border-zinc-700 text-white shadow-white/5',
};

export const Card = React.memo<CardProps>(({ card, onClick, disabled, isFaceDown, className, isHighlighted, isSelected }) => {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const mouseXSpring = useSpring(x);
  const mouseYSpring = useSpring(y);

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], ["15deg", "-15deg"]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], ["-15deg", "15deg"]);

  // Holographic effect based on mouse position
  const shineX = useTransform(mouseXSpring, [-0.5, 0.5], ["0%", "100%"]);
  const shineY = useTransform(mouseYSpring, [-0.5, 0.5], ["0%", "100%"]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || isFaceDown) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;
    x.set(xPct);
    y.set(yPct);
  };

  const handleMouseLeave = () => {
    x.set(0);
    y.set(0);
  };

  if (isFaceDown) {
    return (
      <motion.div
        style={{ width: 'var(--card-w)', height: 'var(--card-h)' }}
        className={cn(
          "relative rounded-xl border-4 border-zinc-800 bg-zinc-900 flex items-center justify-center shadow-xl overflow-hidden",
          className
        )}
        whileHover={{ scale: 1.05, y: -10 }}
      >
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white via-transparent to-transparent" />
        <span className="text-2xl font-black text-zinc-700 italic tracking-tighter">UNO</span>
      </motion.div>
    );
  }

  return (
    <motion.div
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
        width: 'var(--card-w)',
        height: 'var(--card-h)'
      }}
      initial={false}
      animate={{
        y: isSelected ? -32 : isHighlighted ? -8 : 0,
        scale: isSelected ? 1.1 : isHighlighted ? 1.05 : 1,
        zIndex: isSelected ? 40 : isHighlighted ? 10 : 1,
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      whileHover={{
        scale: 1.15,
        y: -40,
        zIndex: 50,
        transition: { type: "spring", stiffness: 600, damping: 25 }
      }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      onClick={!disabled ? onClick : undefined}
      className={cn(
        "relative rounded-xl border-4 flex flex-col items-center justify-between p-2 shadow-2xl cursor-pointer select-none transition-colors duration-500",
        (card.color === 'wild' && card.chosenColor) ? COLOR_MAP[card.chosenColor] : COLOR_MAP[card.color],
        disabled && "cursor-not-allowed",
        isHighlighted && "ring-4 ring-white ring-offset-4 ring-offset-zinc-950",
        isSelected && "border-white shadow-[0_0_40px_rgba(255,255,255,0.3)]",
        className
      )}
    >
      <div className={cn(
        "self-start font-black leading-none",
        card.value.length > 5 ? "text-[12px]" : "text-lg"
      )}>
        {card.value.toUpperCase()}
      </div>

      <div className="flex-1 flex items-center justify-center">
        <div className="text-4xl font-black italic tracking-tighter drop-shadow-lg transform -rotate-12">
          {card.value === 'draw2' ? '+2' :
            card.value === 'draw4' ? '+4' :
              card.value === 'skip' ? '⊘' :
                card.value === 'reverse' ? '⇄' :
                  card.value === 'wild' ? '★' : card.value}
        </div>
      </div>

      <div className={cn(
        "self-end font-black leading-none transform rotate-180",
        card.value.length > 5 ? "text-[12px]" : "text-lg"
      )}>
        {card.value.toUpperCase()}
      </div>

      {/* Balatro-style holographic shine effect */}
      <motion.div
        style={{
          background: useTransform(
            [shineX, shineY],
            ([x, y]) => `radial-gradient(circle at ${x} ${y}, rgba(255,255,255,0.4) 0%, transparent 60%)`
          )
        }}
        className="absolute inset-0 pointer-events-none rounded-lg mix-blend-overlay"
      />

      {/* Static edge shine */}
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-gradient-to-br from-white/40 via-transparent to-black/20 rounded-lg" />
    </motion.div>
  );
});
