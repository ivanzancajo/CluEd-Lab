import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';

type DiceRollResult = {
  valueOne: number;
  valueTwo: number;
  total: number;
};

interface DiceFaceProps {
  value: number;
}

const Dot = () => <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)]" />;

const DiceFace: React.FC<DiceFaceProps> = ({ value }) => {
  return (
    <div className="w-12 h-12 bg-slate-900 border-2 border-cyan-800 rounded-lg shadow-inner shadow-black flex items-center justify-center p-1.5 relative">
      {value === 1 && <Dot />}
      {value === 2 && (
        <div className="flex flex-col justify-between w-full h-full">
          <div className="self-end"><Dot /></div>
          <div className="self-start"><Dot /></div>
        </div>
      )}
      {value === 3 && (
        <div className="flex flex-col justify-between w-full h-full">
          <div className="self-end"><Dot /></div>
          <div className="self-center"><Dot /></div>
          <div className="self-start"><Dot /></div>
        </div>
      )}
      {value === 4 && (
        <div className="flex flex-col justify-between w-full h-full">
          <div className="flex justify-between w-full"><Dot /><Dot /></div>
          <div className="flex justify-between w-full"><Dot /><Dot /></div>
        </div>
      )}
      {value === 5 && (
        <div className="flex flex-col justify-between w-full h-full">
          <div className="flex justify-between w-full"><Dot /><Dot /></div>
          <div className="flex justify-center w-full"><Dot /></div>
          <div className="flex justify-between w-full"><Dot /><Dot /></div>
        </div>
      )}
      {value === 6 && (
        <div className="flex flex-col justify-between w-full h-full">
          <div className="flex justify-between w-full"><Dot /><Dot /></div>
          <div className="flex justify-between w-full"><Dot /><Dot /></div>
          <div className="flex justify-between w-full"><Dot /><Dot /></div>
        </div>
      )}
    </div>
  );
};

export const DiceAnimation = ({
  onRollRequest,
  disabled = false,
  dataCy,
  resetSignal = 0,
  showDebugControls = false,
  forcedDiceValue,
  onForcedDiceChange,
}: {
  onRollRequest: (forcedTotal?: number) => Promise<DiceRollResult>;
  disabled?: boolean;
  dataCy?: string;
  resetSignal?: number;
  showDebugControls?: boolean;
  forcedDiceValue?: number;
  onForcedDiceChange?: (value: number | undefined) => void;
}) => {
  const [dice1, setDice1] = useState(1);
  const [dice2, setDice2] = useState(1);
  const [isRolling, setIsRolling] = useState(false);
  const [hasRolled, setHasRolled] = useState(false);

  useEffect(() => {
    // Mantener el último resultado visible entre actualizaciones de turno.
    setIsRolling(false);
  }, [resetSignal]);

  const startRoll = () => {
    if (isRolling || disabled) return;
    setIsRolling(true);
    setHasRolled(true);
    const rollPromise = onRollRequest(forcedDiceValue);
    
    let iterations = 0;
    const interval = setInterval(() => {
      setDice1(Math.floor(Math.random() * 6) + 1);
      setDice2(Math.floor(Math.random() * 6) + 1);
      iterations++;
      
      if (iterations > 15) {
        clearInterval(interval);
        void rollPromise
          .then((result) => {
            setDice1(result.valueOne);
            setDice2(result.valueTwo);
          })
          .catch(() => {
            setDice1(1);
            setDice2(1);
            setHasRolled(false);
          })
          .finally(() => {
            setIsRolling(false);
          });
      }
    }, 80);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      {showDebugControls && (
        <div className="flex flex-col items-center gap-1">
          <label className="font-mono text-[9px] uppercase tracking-widest text-fuchsia-400">
            Forzar dado
          </label>
          <select
            data-cy="debug-forced-dice-select"
            value={forcedDiceValue ?? ''}
            onChange={(e) => onForcedDiceChange?.(e.target.value ? Number(e.target.value) : undefined)}
            onClick={(e) => e.stopPropagation()}
            className="rounded border border-fuchsia-700/60 bg-slate-950 font-mono text-[11px] text-fuchsia-200 px-1 py-0.5"
          >
            <option value="">— aleatorio —</option>
            {Array.from({ length: 11 }, (_, i) => i + 2).map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
      )}
    <button
      data-cy={dataCy}
      onClick={startRoll}
      disabled={isRolling || disabled}
      className={`relative z-30 p-3 rounded-xl bg-slate-950/60 backdrop-blur-sm border border-cyan-500/30 shadow-[0_0_20px_rgba(6,182,212,0.3)] flex flex-col items-center justify-center transition-all duration-300 ${isRolling ? 'scale-110' : 'hover:scale-105 active:scale-95'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <div className="flex flex-col gap-3">
        <motion.div
          animate={isRolling ? { rotateX: 360, rotateY: 360, rotateZ: 360 } : { rotateX: 0, rotateY: 0, rotateZ: 0 }}
          transition={{ duration: 0.5, repeat: isRolling ? Infinity : 0, ease: "linear" }}
        >
          <DiceFace value={dice1} />
        </motion.div>
        
        <motion.div
          animate={isRolling ? { rotateX: -360, rotateY: 360, rotateZ: -360 } : { rotateX: 0, rotateY: 0, rotateZ: 0 }}
          transition={{ duration: 0.4, repeat: isRolling ? Infinity : 0, ease: "linear" }}
        >
          <DiceFace value={dice2} />
        </motion.div>
      </div>

      {!isRolling && !hasRolled && (
        <span className="absolute -bottom-8 text-[10px] font-bold text-cyan-400 tracking-widest uppercase bg-slate-900/90 px-3 py-1 rounded border border-cyan-900/50 backdrop-blur-sm whitespace-nowrap">
          Tirar Dados
        </span>
      )}

      {!isRolling && hasRolled && (
        <motion.span 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -bottom-10 text-2xl font-black text-cyan-400 drop-shadow-[0_0_15px_rgba(6,182,212,1)] bg-slate-950/80 px-4 py-1 rounded-lg border border-cyan-500/50"
        >
          {dice1 + dice2}
        </motion.span>
      )}
    </button>
    </div>
  );
};
