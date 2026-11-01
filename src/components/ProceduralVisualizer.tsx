import React from 'react';

interface ProceduralVisualizerProps {
  type: 'resistor' | 'inductor';
  value: string;
  bandCount?: 4 | 5 | 6;
}

const resistorColors: Record<string, string> = {
  '0': '#000000', // Black
  '1': '#8B4513', // Brown
  '2': '#FF0000', // Red
  '3': '#FFA500', // Orange
  '4': '#FFFF00', // Yellow
  '5': '#008000', // Green
  '6': '#0000FF', // Blue
  '7': '#EE82EE', // Violet
  '8': '#808080', // Grey
  '9': '#FFFFFF', // White
  'gold': '#FFD700', // Gold (5%)
  'silver': '#C0C0C0', // Silver (10%)
};

const multiplierColors: Record<number, string> = {
  [-2]: '#C0C0C0', // Silver
  [-1]: '#FFD700', // Gold
  0: '#000000', // Black
  1: '#8B4513', // Brown
  2: '#FF0000', // Red
  3: '#FFA500', // Orange
  4: '#FFFF00', // Yellow
  5: '#008000', // Green
  6: '#0000FF', // Blue
  7: '#EE82EE', // Violet
  8: '#808080', // Grey
  9: '#FFFFFF', // White
};

function parseResistorValue(value: string) {
  const cleanValue = value.toLowerCase().replace(/[^0-9.k m]/g, '').trim();
  let numericValue = parseFloat(cleanValue);
  
  if (cleanValue.includes('k')) numericValue *= 1000;
  if (cleanValue.includes('m')) numericValue *= 1000000;
  
  if (isNaN(numericValue)) return null;
  
  const str = numericValue.toString();
  const exponent = Math.floor(Math.log10(numericValue));
  
  return { numericValue, str, exponent };
}

export const ProceduralVisualizer: React.FC<ProceduralVisualizerProps> = ({ type, value, bandCount = 4 }) => {
  const getResistorBands = () => {
    const parsed = parseResistorValue(value);
    if (!parsed) return Array(bandCount).fill('#cccccc');

    const { numericValue } = parsed;
    const bands: string[] = [];
    
    // Simple logic for standard E24/E96 values
    let digits = numericValue.toString().replace('.', '');
    while (digits.length < (bandCount === 4 ? 2 : 3)) digits += '0';
    
    const significantDigits = digits.slice(0, bandCount === 4 ? 2 : 3);
    for (const d of significantDigits) {
      bands.push(resistorColors[d] || '#cccccc');
    }

    // Multiplier
    const multiplier = Math.floor(Math.log10(numericValue)) - (bandCount === 4 ? 1 : 2);
    bands.push(multiplierColors[multiplier] || '#cccccc');

    // Tolerance (Default Gold for 4-band, Brown for 5/6-band)
    bands.push(bandCount === 4 ? resistorColors['gold'] : resistorColors['1']);

    // Temperature Coefficient (for 6-band)
    if (bandCount === 6) {
      bands.push(resistorColors['1']); // Default Brown (100ppm)
    }

    return bands;
  };

  const bands = type === 'resistor' ? getResistorBands() : [];

  return (
    <div className="flex flex-col items-center justify-center bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-inner w-full h-full min-h-[200px]">
      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mb-4 font-sans">
        {type === 'resistor' ? 'RESISTOR' : 'INDUCTOR'}
      </div>
      
      <svg width="240" height="100" viewBox="0 0 240 100" className="drop-shadow-md">
        {/* Leads */}
        <line x1="0" y1="50" x2="240" y2="50" stroke="#94a3b8" strokeWidth="4" />
        
        {type === 'resistor' ? (
          <>
            {/* Body */}
            <rect x="60" y="30" width="120" height="40" rx="10" fill="#fde68a" stroke="#d97706" strokeWidth="1" />
            {/* Bands */}
            {bands.map((color, i) => {
              const x = 75 + (i * (90 / (bands.length - 1)));
              return (
                <rect key={i} x={x} y="30" width="8" height="40" fill={color} />
              );
            })}
          </>
        ) : (
          <>
            {/* Inductor Body (Coil representation) */}
            <rect x="70" y="35" width="100" height="30" rx="15" fill="#1e293b" stroke="#0f172a" strokeWidth="1" />
            <path d="M 80 35 Q 90 20 100 35 Q 110 20 120 35 Q 130 20 140 35 Q 150 20 160 35" fill="none" stroke="#b45309" strokeWidth="3" />
            <path d="M 80 65 Q 90 80 100 65 Q 110 80 120 65 Q 130 80 140 65 Q 150 80 160 65" fill="none" stroke="#b45309" strokeWidth="3" />
          </>
        )}
      </svg>

      <div className="mt-4 text-xl font-black text-slate-900 dark:text-white tracking-tight">
        {value || (type === 'resistor' ? '--- Ω' : '--- H')}
      </div>
    </div>
  );
};
