# Build Order

## Purpose
- This file defines the implementation order for building the v2 Telegram bot workflow in n8n
- It translates the architecture into a practical node-by-node build sequence
- It helps keep the build structured and prevents improvisation

## Final Node Order
1. Telegram Input
2. Event Normalizer
3. Session Load
4. Session Bootstrap
5. Understanding AI
6. Validation Node
7. Rules Layer
8. Business Data Resolver
9. Reply AI
10. Side Effects
11. Telegram Send
12. Session Save

## Build Phases

### Phase 1 — Skeleton
- Telegram Input
- Event Normalizer
- Session Load
- Session Bootstrap

### Phase 2 — Brain
- Understanding AI
- Validation Node
- Rules Layer

### Phase 3 — Business Facts
- Business Data Resolver

### Phase 4 — Output
- Reply AI
- Side Effects
- Telegram Send
- Session Save

## Node Responsibilities
- **Telegram Input**: Receives raw Telegram updates (messages, callbacks, commands).
- **Event Normalizer**: Converts various raw inputs into a standard internal event format.
- **Session Load**: Fetches the current user session from the database (e.g., Convex).
- **Session Bootstrap**: Initializes or repairs session fields if they are missing or corrupt.
- **Understanding AI**: Analyzes intent, needs, and references using message history.
- **Validation Node**: Checks if the AI output matches the required JSON schema.
- **Rules Layer**: Applies deterministic logic to convert meaning into a locked system decision.
- **Business Data Resolver**: Fetches product data, ranks options, and prepares facts based on rules.
- **Reply AI**: Generates final natural language response based strictly on facts and decisions.
- **Side Effects**: Handles non-message actions like leads, notifications, and admin alerts.
- **Telegram Send**: Dispatches the final message and keyboard to the user via Telegram API.
- **Session Save**: Persists the updated state back to the database for future turns.

## Build Notes
- build v2 as a separate workflow
- keep current workflow as backup
- test each phase before moving on
- do not add extra branches unless required
- keep logic linear and debuggable
