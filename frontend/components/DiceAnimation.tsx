import React, { useState } from 'react';
import { m } from 'motion/react';

type DiceRollResult = {
  valueOne: number;
  valueTwo: number;
  total: number;
};

interface DiceFaceProps {
  value: number;
}

const Dot = () => <div className="size-2 rounded-full bg-slate-900 shadow-[0_0_4px_rgba(8,145,178,0.9)] ring-1 ring-cyan-700/40" />;

const DiceFace: React.FC<DiceFaceProps> = ({ value }) => {
  return (
    <div className="size-12 bg-gradient-to-br from-slate-100 to-slate-300 border-2 border-cyan-300 rounded-lg shadow-[0_0_18px_rgba(34,211,238,0.9),0_2px_6px_rgba(0,0,0,0.85)] ring-1 ring-slate-900/30 flex items-center justify-center p-1.5 relative">
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
}: {
  onRollRequest: (forcedTotal?: number) => Promise<DiceRollResult>;
  disabled?: boolean;
  dataCy?: string;
}) => {
  const [dice1, setDice1] = useState(1);
  const [dice2, setDice2] = useState(1);
  const [isRolling, setIsRolling] = useState(false);
  const [hasRolled, setHasRolled] = useState(false);

  const startRoll = () => {
    if (isRolling || disabled) return;
    setIsRolling(true);
    setHasRolled(true);
    const rollPromise = onRollRequest();
    
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
    <button
      type="button"
      data-cy={dataCy}
      onClick={startRoll}
      disabled={isRolling || disabled}
      className={`relative z-30 p-3 rounded-xl bg-slate-950/85 backdrop-blur-sm border border-cyan-400/50 shadow-[0_0_24px_rgba(6,182,212,0.45)] flex flex-col items-center justify-center transition-all duration-300 ${isRolling ? 'scale-110' : 'hover:scale-105 active:scale-95'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
    >
      <div className="flex flex-col gap-3">
        <m.div
          animate={isRolling ? { rotateX: 360, rotateY: 360, rotateZ: 360 } : { rotateX: 0, rotateY: 0, rotateZ: 0 }}
          transition={{ duration: 0.5, repeat: isRolling ? Infinity : 0, ease: "linear" }}
        >
          <DiceFace value={dice1} />
        </m.div>
        
        <m.div
          animate={isRolling ? { rotateX: -360, rotateY: 360, rotateZ: -360 } : { rotateX: 0, rotateY: 0, rotateZ: 0 }}
          transition={{ duration: 0.4, repeat: isRolling ? Infinity : 0, ease: "linear" }}
        >
          <DiceFace value={dice2} />
        </m.div>
      </div>

      {!isRolling && !hasRolled && (
        <span className="absolute -bottom-8 text-[10px] font-bold text-cyan-400 tracking-widest uppercase bg-slate-900/90 px-3 py-1 rounded border border-cyan-900/50 backdrop-blur-sm whitespace-nowrap">
          Tirar Dados
        </span>
      )}

      {!isRolling && hasRolled && (
        <m.span 
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute -bottom-10 text-2xl font-black text-cyan-400 drop-shadow-[0_0_15px_rgba(6,182,212,1)] bg-slate-950/80 px-4 py-1 rounded-lg border border-cyan-500/50"
        >
          {dice1 + dice2}
        </m.span>
      )}
    </button>
    </div>
  );
};
