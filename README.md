# Chess Training Board

Aplicación de entrenamiento de ajedrez orientada a comprender las decisiones, no solo memorizar jugadas.

## Arquitectura

- **Motor propio**: reglas legales, estado de partida, jaque/mate, enroque, promoción, captura al paso, repetición, regla de 50 movimientos y material insuficiente.
- **Stockfish 19**: capa opcional de análisis profundo. No sustituye al motor propio.
- **Capa pedagógica**: objetivos de apertura, medio juego y finales, pistas progresivas, explicación de errores y juego inesperado.
- **PWA**: preparada para navegador móvil e instalación como aplicación.

## Stockfish

Stockfish se ejecuta en un Web Worker mediante la distribución WASM lite single-threaded. El botón **Analizar con Stockfish** está disponible en modo completo.

El análisis es opcional: si Stockfish no está disponible, el entrenamiento principal debe seguir funcionando con el motor propio.

La dependencia de Stockfish está bajo GPL-3.0. Antes de una distribución comercial o cerrada, revisar las obligaciones de licencia y avisos de terceros.

## Desarrollo

Desde la raíz del repositorio:

```bash
pnpm install --no-frozen-lockfile
pnpm --filter @workspace/chess-training dev
```

Validaciones:

```bash
pnpm --filter @workspace/chess-training typecheck
pnpm --filter @workspace/chess-training test
pnpm --filter @workspace/chess-training build
```

## Evolución prevista

1. Integrar Stockfish en la evaluación pedagógica sin convertirlo en la autoridad de las reglas.
2. Comparar la jugada del usuario con alternativas del motor y generar feedback gradual.
3. Usar el motor para validar tácticas, medio juego, finales y situaciones inesperadas.
4. Añadir análisis post-partida.
5. Completar la adaptación móvil/PWA y, después, el empaquetado nativo.
