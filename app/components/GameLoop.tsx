import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';

import { useGameStore } from '~/stores/useGameStore';


function GameLoop() {

    const tick = useGameStore(state => state.tick);
    const isPaused = useGameStore(state => state.paused);
    const tickInterval = useGameStore(state => state.tickInterval);
    const lastTickRef = useRef(0);
  
  useFrame((state) => {
    const currentTime = state.clock.elapsedTime * 1000;

    if (!isPaused && currentTime - lastTickRef.current >= tickInterval) {
      tick();
      lastTickRef.current = currentTime;
    }
  });
  
  return null;
}

export { GameLoop };
