# FeGG Platform - Hosting Plan v2

## Vision

A Lovable-like frontend builder where users describe UIs in natural language and watch them being built in real-time.

---

## Architecture (Simplified for MVP)

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (Next.js 15)                     │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │   Chat UI    │  │   Preview    │  │  Activity Feed   │   │
│  │  (streaming) │  │   (iframe)   │  │  (tool actions)  │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│                                                              │
└───────────────────────────┬──────────────────────────────────┘
                            │ REST + SSE
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    BACKEND (FastAPI)                         │
│                                                              │
│  POST /sessions          - Create session + sandbox          │
│  POST /sessions/{id}/msg - Send message (triggers agent)     │
│  GET  /sessions/{id}/sse - SSE stream (agent events)         │
│  GET  /sessions/{id}/files - File tree                       │
│  GET  /sessions/{id}/files/{path} - File content             │
│                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐  │
│  │ LangGraph      │  │ E2B Sandbox    │  │ SQLite        │  │
│  │ astream_events │  │ Manager        │  │ (sessions)    │  │
│  └────────────────┘  └────────────────┘  └───────────────┘  │
│                                                              │
└───────────────────────────┬──────────────────────────────────┘
                            │ E2B SDK
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    E2B SANDBOX (per session)                 │
│                                                              │
│  - Bun + Vite + React + shadcn/ui                            │
│  - Live preview at https://5173-{id}.e2b.app                 │
│  - Full filesystem access for agent                          │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## MVP Features (Week 1-2)

### Must Have
- [ ] Create session → spins up E2B sandbox
- [ ] Send message → agent builds/modifies code
- [ ] Real-time streaming → see agent thinking + actions
- [ ] Live preview → iframe with E2B URL
- [ ] Activity feed → visual timeline of actions
- [ ] Session persistence → survive page refresh
- [ ] Error display → clear error messages

### Nice to Have (defer)
- [ ] File tree viewer
- [ ] Code viewer (Monaco)
- [ ] File diffs
- [ ] Export to ZIP
- [ ] User authentication

### Future (v1.1+)
- [ ] GitHub integration
- [ ] Multiple LLM providers
- [ ] Template library
- [ ] Undo/redo
- [ ] Collaborative editing

---

## Backend Structure

```
api/
├── main.py                     # FastAPI app, CORS, lifespan
├── config.py                   # Settings (env vars)
├── database.py                 # SQLite setup (aiosqlite)
├── models.py                   # Pydantic schemas
├── routers/
│   ├── sessions.py             # Session CRUD
│   ├── agent.py                # Message handling + SSE
│   └── files.py                # File tree/content
├── services/
│   ├── sandbox_manager.py      # E2B lifecycle (reuse existing)
│   └── agent_runner.py         # LangGraph streaming wrapper
└── requirements.txt
```

### Key Files

**main.py**
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: init DB
    await init_db()
    yield
    # Shutdown: cleanup sandboxes
    await cleanup_all_sandboxes()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js dev
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**agent_runner.py** (core streaming logic)
```python
from langgraph.graph import StateGraph
from langchain_core.messages import HumanMessage

async def stream_agent_events(session_id: str, message: str):
    """Stream agent events via LangGraph astream_events."""
    
    sandbox = get_sandbox(session_id)
    graph = build_graph(sandbox)
    
    async for event in graph.astream_events(
        {"messages": [HumanMessage(content=message)]},
        version="v2"
    ):
        if event["event"] == "on_chat_model_stream":
            chunk = event["data"]["chunk"]
            if chunk.content:
                yield {"type": "token", "content": chunk.content}
        
        elif event["event"] == "on_tool_start":
            yield {
                "type": "tool_start",
                "tool": event["name"],
                "args": event["data"].get("input", {})
            }
        
        elif event["event"] == "on_tool_end":
            yield {
                "type": "tool_end",
                "tool": event["name"],
                "result": str(event["data"].get("output", ""))[:500]
            }
    
    yield {"type": "done"}
```

**SSE Endpoint**
```python
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
import json

router = APIRouter()

@router.post("/sessions/{session_id}/message")
async def send_message(session_id: str, body: MessageRequest):
    """Start agent processing, return stream endpoint."""
    # Store message, mark session as busy
    await store_message(session_id, "user", body.content)
    return {"status": "processing", "stream_url": f"/sessions/{session_id}/sse"}

@router.get("/sessions/{session_id}/sse")
async def stream_events(session_id: str):
    """SSE endpoint for agent events."""
    async def generate():
        async for event in stream_agent_events(session_id, get_pending_message(session_id)):
            yield f"data: {json.dumps(event)}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
        }
    )
```

---

## Frontend Structure

```
web/
├── app/
│   ├── layout.tsx              # Root layout, providers
│   ├── page.tsx                # Landing page
│   └── build/
│       └── [sessionId]/
│           └── page.tsx        # Builder interface
├── components/
│   ├── Chat.tsx                # Message list + input
│   ├── ChatMessage.tsx         # Single message (streaming)
│   ├── Preview.tsx             # iframe wrapper
│   ├── ActivityFeed.tsx        # Tool action timeline
│   └── LoadingStates.tsx       # Skeletons, spinners
├── lib/
│   ├── api.ts                  # REST client (fetch wrapper)
│   ├── sse.ts                  # SSE connection manager
│   └── store.ts                # Zustand state
├── hooks/
│   ├── useSession.ts           # Session management
│   └── useAgentStream.ts       # SSE streaming hook
└── package.json
```

### Key Components

**useAgentStream.ts**
```typescript
export function useAgentStream(sessionId: string) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  
  const startStream = useCallback(() => {
    setIsStreaming(true);
    const source = new EventSource(`/api/sessions/${sessionId}/sse`);
    
    source.onmessage = (e) => {
      const event = JSON.parse(e.data);
      setEvents(prev => [...prev, event]);
      
      if (event.type === "done" || event.type === "error") {
        source.close();
        setIsStreaming(false);
      }
    };
    
    source.onerror = () => {
      source.close();
      setIsStreaming(false);
    };
  }, [sessionId]);
  
  return { events, isStreaming, startStream };
}
```

**Chat.tsx** (streaming tokens)
```tsx
export function Chat({ sessionId }: { sessionId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingContent, setStreamingContent] = useState("");
  const { events, isStreaming, startStream } = useAgentStream(sessionId);
  
  // Process events into messages
  useEffect(() => {
    for (const event of events) {
      if (event.type === "token") {
        setStreamingContent(prev => prev + event.content);
      } else if (event.type === "done") {
        if (streamingContent) {
          setMessages(prev => [...prev, { role: "assistant", content: streamingContent }]);
          setStreamingContent("");
        }
      }
    }
  }, [events]);
  
  const sendMessage = async (content: string) => {
    setMessages(prev => [...prev, { role: "user", content }]);
    await fetch(`/api/sessions/${sessionId}/message`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    startStream();
  };
  
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        {messages.map((msg, i) => <ChatMessage key={i} {...msg} />)}
        {streamingContent && (
          <ChatMessage role="assistant" content={streamingContent} isStreaming />
        )}
      </div>
      <ChatInput onSend={sendMessage} disabled={isStreaming} />
    </div>
  );
}
```

---

## Database Schema (SQLite)

```sql
-- Sessions
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    sandbox_id TEXT,
    preview_url TEXT,
    status TEXT DEFAULT 'creating',  -- creating, ready, busy, error, terminated
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Messages
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT REFERENCES sessions(id),
    role TEXT,  -- user, assistant
    content TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_messages_session ON messages(session_id);
CREATE INDEX idx_sessions_status ON sessions(status);
```

---

## Event Types

```typescript
type AgentEvent = 
  | { type: "token"; content: string }           // LLM token
  | { type: "tool_start"; tool: string; args: Record<string, any> }
  | { type: "tool_end"; tool: string; result: string }
  | { type: "file_changed"; path: string; action: "write" | "delete" }
  | { type: "preview_ready"; url: string }
  | { type: "error"; message: string }
  | { type: "done" }
```

---

## Environment Variables

```env
# Backend (.env)
E2B_API_KEY=...
E2B_TEMPLATE_ID=react-vite-shadcn-bun
ZAI_API_KEY=...
ZAI_BASE_URL=...
ZAI_MODEL_NAME=GLM-4.5-air
DATABASE_URL=sqlite:///./sessions.db  # Local dev
# DATABASE_URL=libsql://xxx.turso.io   # Production (Turso)

# Frontend (.env.local)
NEXT_PUBLIC_API_URL=http://localhost:8000
```

---

## Implementation Order

### Phase 1: Backend Core (Days 1-2)
1. [ ] FastAPI skeleton with CORS
2. [ ] SQLite database setup
3. [ ] Session CRUD endpoints
4. [ ] Integrate existing E2B sandbox manager
5. [ ] LangGraph streaming wrapper

### Phase 2: SSE Streaming (Day 3)
6. [ ] astream_events integration
7. [ ] SSE endpoint
8. [ ] Event type mapping

### Phase 3: Frontend Shell (Days 4-5)
9. [ ] Next.js project setup
10. [ ] Landing page (simple)
11. [ ] Builder page layout
12. [ ] Chat component (basic)
13. [ ] Preview iframe

### Phase 4: Integration (Days 6-7)
14. [ ] SSE client hook
15. [ ] Token streaming in chat
16. [ ] Activity feed component
17. [ ] Session persistence (localStorage)
18. [ ] Error handling

### Phase 5: Polish (Day 8+)
19. [ ] Loading states
20. [ ] Responsive layout
21. [ ] Dark mode
22. [ ] Basic styling

---

## Gotchas to Handle

| Issue | Solution |
|-------|----------|
| SSE reconnection | Auto-reconnect with exponential backoff |
| Session expired | Check on load, show "session ended" |
| Agent timeout | 5 min max, show error + retry option |
| Sandbox cold start | Show "Starting sandbox..." (~10s) |
| CORS preflight | Proper FastAPI CORS config |
| Large responses | Chunk tool results (max 500 chars in event) |
| Browser back/forward | Restore session from localStorage |
| Multiple tabs | Warn or sync state |

---

## Future Considerations (Not MVP)

1. **Authentication**: Add when monetizing
2. **Rate limiting**: Add when public
3. **File tree**: Nice UX but not essential
4. **Code viewer**: Users can see in preview
5. **Export**: Can add later
6. **Multi-model**: Keep LLM config flexible
7. **Analytics**: Track usage patterns

---

## Commands to Start

```bash
# Backend
cd api
uv venv && source .venv/bin/activate
uv pip install fastapi uvicorn aiosqlite python-dotenv langchain-openai langgraph e2b
uvicorn main:app --reload --port 8000

# Frontend
cd web
npx create-next-app@latest . --ts --tailwind --app --src-dir=false
npm run dev
```

---

## Success Criteria for MVP

- [ ] User can create a session → sees sandbox starting
- [ ] User sends message → sees tokens streaming
- [ ] User sees activity feed → tool calls in real-time
- [ ] User sees preview → live E2B URL in iframe
- [ ] User refreshes → session is restored
- [ ] Errors are shown clearly
- [ ] Works on desktop Chrome/Firefox/Safari
