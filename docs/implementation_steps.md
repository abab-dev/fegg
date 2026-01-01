# FeGG Implementation Steps

## Phase 1: Backend Foundation

### 1.1 Project Setup
- [ ] Create `api/` directory
- [ ] Initialize with `uv init`
- [ ] Add dependencies: `fastapi`, `uvicorn`, `aiosqlite`, `python-dotenv`, `langchain-openai`, `langgraph`, `e2b`
- [ ] Create `api/main.py` with FastAPI app + CORS

### 1.2 Database
- [ ] Create `api/database.py` - async SQLite setup
- [ ] Create tables: `users`, `sessions`, `messages`
- [ ] Create `api/models.py` - Pydantic schemas

### 1.3 Auth (JWT)
- [ ] Create `api/auth.py` - JWT utilities
- [ ] `POST /auth/register` - email + password → user + token
- [ ] `POST /auth/login` - email + password → token
- [ ] `GET /auth/me` - get current user
- [ ] Dependency `get_current_user()` for protected routes
- [ ] Password hashing with `bcrypt`

### 1.4 Session Endpoints
- [ ] `POST /sessions` - create session + sandbox
- [ ] `GET /sessions/{id}` - get session info
- [ ] `DELETE /sessions/{id}` - terminate session

### 1.5 Sandbox Integration
- [ ] Move `e2b_sandbox/sandbox.py` logic into `api/services/sandbox_manager.py`
- [ ] Async wrappers for E2B operations

---

## Phase 2: Agent Streaming

### 2.1 Streaming Wrapper
- [ ] Create `api/services/agent_runner.py`
- [ ] Wrap existing `agent_e2b.py` graph with `astream_events()`
- [ ] Map LangGraph events to our event types

### 2.2 SSE Endpoint
- [ ] `POST /sessions/{id}/message` - store message, trigger agent
- [ ] `GET /sessions/{id}/sse` - SSE stream of agent events
- [ ] Handle agent completion + errors

### 2.3 Event Types
- [ ] `token` - LLM streaming
- [ ] `tool_start` / `tool_end` - tool calls
- [ ] `preview_ready` - dev server URL
- [ ] `done` / `error`

---

## Phase 3: Frontend Shell

### 3.1 Next.js Setup
- [ ] Create `web/` with `create-next-app`
- [ ] Configure Tailwind + shadcn/ui
- [ ] Set up `NEXT_PUBLIC_API_URL`

### 3.2 Landing Page
- [ ] `app/page.tsx` - simple CTA to create session
- [ ] Create session on button click
- [ ] Redirect to `/build/[sessionId]`

### 3.3 Builder Layout
- [ ] `app/build/[sessionId]/page.tsx`
- [ ] Two-column layout: Chat | Preview
- [ ] Responsive stacking on mobile

---

## Phase 4: Core Components

### 4.1 Chat
- [ ] `components/Chat.tsx` - message list + input
- [ ] `components/ChatMessage.tsx` - single message
- [ ] `components/ChatInput.tsx` - textarea + send button

### 4.2 Preview
- [ ] `components/Preview.tsx` - iframe wrapper
- [ ] Loading state while sandbox starts
- [ ] Refresh button

### 4.3 Activity Feed
- [ ] `components/ActivityFeed.tsx` - tool action timeline
- [ ] Icons for different tool types
- [ ] Collapsible details

---

## Phase 5: SSE Integration

### 5.1 SSE Client
- [ ] `lib/sse.ts` - EventSource wrapper
- [ ] Reconnection with backoff
- [ ] Event parsing

### 5.2 Streaming Hook
- [ ] `hooks/useAgentStream.ts`
- [ ] Token accumulation
- [ ] Event dispatch to components

### 5.3 State Management
- [ ] `lib/store.ts` - Zustand store
- [ ] Session state
- [ ] Messages
- [ ] Stream status

---

## Phase 6: Polish

### 6.1 Session Persistence
- [ ] Store session ID in localStorage
- [ ] Restore on page load
- [ ] Handle expired sessions

### 6.2 Error Handling
- [ ] Error boundaries
- [ ] Toast notifications
- [ ] Retry buttons

### 6.3 Loading States
- [ ] Skeleton loaders
- [ ] Typing indicators
- [ ] Spinner on sandbox creation

---

## Files to Create

```
api/
├── main.py
├── config.py
├── database.py
├── models.py
├── routers/
│   ├── sessions.py
│   ├── agent.py
│   └── files.py
└── services/
    ├── sandbox_manager.py
    └── agent_runner.py

web/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   └── build/[sessionId]/page.tsx
├── components/
│   ├── Chat.tsx
│   ├── ChatMessage.tsx
│   ├── ChatInput.tsx
│   ├── Preview.tsx
│   └── ActivityFeed.tsx
├── lib/
│   ├── api.ts
│   ├── sse.ts
│   └── store.ts
└── hooks/
    └── useAgentStream.ts
```

---

## Checkpoints

1. **Backend runs**: `uvicorn api.main:app --reload`
2. **Can create session**: POST returns sandbox ID
3. **Can stream events**: SSE returns token events
4. **Frontend runs**: `npm run dev` shows landing
5. **Chat works**: Message → streaming response
6. **Preview works**: iframe shows E2B URL
7. **End-to-end**: User describes → sees built app
