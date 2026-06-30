Update wydajności:
- render canvasa jest kolejkowany przez requestAnimationFrame, więc wiele szybkich zmian nie odpala pełnego redrawu po każdym evencie
- szybkie rysowanie komórek używa lokalnych dirty-rectów zamiast pełnego odświeżenia całej planszy
- płotki, murki, trapdoory, guziki i przyciemnione kafle używają cache małych renderowanych sprite'ów
- panning jest kolejkowany do jednej aktualizacji na klatkę
- canvas używa trybu alpha:false i desynchronized jako bezpiecznego hintu wydajnościowego
- pod window.__bfpPerf można sprawdzić lastRenderMs i cellCacheSize w konsoli
